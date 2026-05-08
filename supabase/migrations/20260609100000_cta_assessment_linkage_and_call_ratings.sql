-- ============================================================
-- Migration 20260609100000: CTA <> Assessment linkage and
--                          per-CTA call ratings
--
-- 1. ALTER TABLE call_script_cta_ambitions
--    Adds activity_id (FK to campaign_activities). Each CTA on a
--    script can now point at an "assessment kind" activity row,
--    so the call runner knows what rating scale to render
--    (binary vs 1..5 with overridable rating_labels) and where
--    to write the per-worker rating.
--
-- 2. CREATE TABLE call_attempt_cta_ratings
--    Per-call audit row capturing the rating an organiser gave
--    for each CTA ambition during a specific call. Keeps the
--    full per-call history even if the assessment activity is
--    later relinked or deleted.
--
-- 3. UPDATE FUNCTION record_call_attempt(...)
--    Adds p_cta_ratings JSONB DEFAULT '[]'::JSONB. For each item:
--      - Insert one call_attempt_cta_ratings row.
--      - If the linked CTA ambition has an activity_id, also call
--        record_assessment_event() so the worker's wall-chart
--        rating is updated (campaign_activity_ratings).
--    The signature otherwise mirrors the live definition from
--    20260522100000_phone_call_actions.sql exactly.
-- ============================================================


-- -------------------------------------------------------
-- 1. Link CTA ambitions to assessment activities
-- -------------------------------------------------------
ALTER TABLE call_script_cta_ambitions
  ADD COLUMN IF NOT EXISTS activity_id INTEGER
    REFERENCES campaign_activities(activity_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_csca_activity
  ON call_script_cta_ambitions(activity_id)
  WHERE activity_id IS NOT NULL;

COMMENT ON COLUMN call_script_cta_ambitions.activity_id IS
  'Optional FK to the campaign_activities row (activity_kind = ''assessment'') '
  'that this CTA is rated against. The call runner uses the activity''s '
  'is_binary / rating_labels to render the rating control, and writes the '
  'per-worker rating to campaign_activity_ratings via record_assessment_event().';


-- -------------------------------------------------------
-- 2. Per-call CTA rating audit table
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_attempt_cta_ratings (
  cta_rating_id BIGSERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES call_attempts(attempt_id) ON DELETE CASCADE,
  cta_ambition_id INTEGER NOT NULL REFERENCES call_script_cta_ambitions(id) ON DELETE CASCADE,
  -- Denormalised at write time so the rating is still meaningful
  -- if the ambition is later relinked or its activity is deleted.
  activity_id INTEGER REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  binary_value VARCHAR(30),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_cacr_rating_or_binary
    CHECK (rating IS NOT NULL OR binary_value IS NOT NULL),
  CONSTRAINT cacr_attempt_ambition_uq UNIQUE (attempt_id, cta_ambition_id)
);

CREATE INDEX IF NOT EXISTS idx_cacr_attempt   ON call_attempt_cta_ratings(attempt_id);
CREATE INDEX IF NOT EXISTS idx_cacr_ambition  ON call_attempt_cta_ratings(cta_ambition_id);
CREATE INDEX IF NOT EXISTS idx_cacr_activity  ON call_attempt_cta_ratings(activity_id) WHERE activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cacr_worker    ON call_attempt_cta_ratings(worker_id);

COMMENT ON TABLE call_attempt_cta_ratings IS
  'Per-call rating an organiser gave for each CTA ambition. Audit-friendly '
  'sibling to campaign_activity_ratings: this table keeps the full per-call '
  'history (one row per attempt x ambition), while record_call_attempt also '
  'upserts campaign_activity_ratings via record_assessment_event() so the '
  'wall chart reflects the most recent rating.';
COMMENT ON COLUMN call_attempt_cta_ratings.activity_id IS
  'Snapshot of call_script_cta_ambitions.activity_id at write time. NULL for '
  'CTAs not linked to a campaign_activities assessment row.';

ALTER TABLE call_attempt_cta_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_attempt_cta_ratings"
  ON call_attempt_cta_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Campaign writers can insert call_attempt_cta_ratings"
  ON call_attempt_cta_ratings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_attempt_cta_ratings.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

CREATE POLICY "Campaign writers can update call_attempt_cta_ratings"
  ON call_attempt_cta_ratings FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_attempt_cta_ratings.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

CREATE POLICY "Admin can delete call_attempt_cta_ratings"
  ON call_attempt_cta_ratings FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON call_attempt_cta_ratings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_attempt_cta_ratings_cta_rating_id_seq TO authenticated;


-- -------------------------------------------------------
-- 3. Extend record_call_attempt with p_cta_ratings
--    Mirrors the live signature from 20260522100000 exactly,
--    appends p_cta_ratings JSONB DEFAULT '[]'::JSONB, and adds
--    one new step (8b) that persists call_attempt_cta_ratings
--    rows + propagates to campaign_activity_ratings via the
--    shared record_assessment_event() RPC.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION record_call_attempt(
  p_list_item_id INTEGER,
  p_script_id INTEGER,
  p_caller_user_id UUID,
  p_dial_disposition VARCHAR(30),
  p_call_disposition VARCHAR(30) DEFAULT NULL,
  p_overall_notes TEXT DEFAULT NULL,
  p_callback_datetime TIMESTAMPTZ DEFAULT NULL,
  p_support_level VARCHAR(30) DEFAULT NULL,
  p_follow_up_action TEXT DEFAULT NULL,
  p_cta_response VARCHAR(20) DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL,
  p_step_outcomes JSONB DEFAULT '[]',
  p_objections JSONB DEFAULT '[]'::JSONB,
  p_issues JSONB DEFAULT '[]'::JSONB,
  p_cta_ratings JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_attempt_id INTEGER;
  v_worker_id INTEGER;
  v_campaign_id INTEGER;
  v_list_id INTEGER;
  v_connection_id BIGINT;
  v_item_status VARCHAR(20);
  v_step JSONB;
  v_result JSONB;
  v_obj JSONB;
  v_iss JSONB;
  v_cta JSONB;
  v_objections_inserted INTEGER := 0;
  v_issues_inserted INTEGER := 0;
  v_cta_ratings_inserted INTEGER := 0;
  v_ambition_id INTEGER;
  v_ambition_activity_id INTEGER;
  v_cta_rating SMALLINT;
  v_cta_binary VARCHAR(30);
  v_cta_notes TEXT;
BEGIN
  SELECT cli.worker_id, cl.campaign_id, cli.list_id
  INTO v_worker_id, v_campaign_id, v_list_id
  FROM call_list_items cli
  JOIN call_lists cl ON cl.list_id = cli.list_id
  WHERE cli.item_id = p_list_item_id;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'call_list_item % not found', p_list_item_id;
  END IF;

  -- 1. Insert call_attempt
  INSERT INTO call_attempts (
    list_item_id, script_id, caller_user_id,
    dial_disposition, call_disposition,
    overall_notes, callback_datetime, support_level_assessed,
    follow_up_action, cta_response, duration_seconds,
    ended_at
  ) VALUES (
    p_list_item_id, p_script_id, p_caller_user_id,
    p_dial_disposition, p_call_disposition,
    p_overall_notes, p_callback_datetime, p_support_level,
    p_follow_up_action, p_cta_response, p_duration_seconds,
    CASE WHEN p_duration_seconds IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- 2. Insert step outcomes
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_step_outcomes)
  LOOP
    INSERT INTO call_step_outcomes (
      attempt_id, section_id, reached, outcome_value, notes, duration_seconds, sort_order
    ) VALUES (
      v_attempt_id,
      (v_step->>'section_id')::INTEGER,
      COALESCE((v_step->>'reached')::BOOLEAN, false),
      v_step->>'outcome_value',
      v_step->>'notes',
      (v_step->>'duration_seconds')::INTEGER,
      COALESCE((v_step->>'sort_order')::INTEGER, 0)
    );
  END LOOP;

  -- 3. Determine new item status
  IF p_dial_disposition = 'callback_requested' OR p_call_disposition = 'partial_asked_callback' THEN
    v_item_status := 'deferred';
  ELSIF p_dial_disposition = 'connected' AND p_call_disposition IS NOT NULL THEN
    v_item_status := 'completed';
  ELSIF p_dial_disposition IN ('disconnected', 'wrong_number', 'do_not_call') THEN
    v_item_status := 'completed';
  ELSE
    v_item_status := 'pending';
  END IF;

  -- 4. Update call_list_items
  UPDATE call_list_items SET
    status = v_item_status,
    attempts_count = attempts_count + 1,
    last_attempt_at = now(),
    best_disposition = COALESCE(p_call_disposition, p_dial_disposition),
    next_call_at = p_callback_datetime,
    updated_at = now()
  WHERE item_id = p_list_item_id;

  -- 5. Update call_lists completed_items count
  UPDATE call_lists SET
    completed_items = (
      SELECT COUNT(*) FROM call_list_items
      WHERE list_id = v_list_id AND status IN ('completed', 'skipped')
    ),
    updated_at = now()
  WHERE list_id = v_list_id;

  -- 6. Upsert worker_campaign_connections
  SELECT connection_id INTO v_connection_id
  FROM worker_campaign_connections
  WHERE worker_id = v_worker_id AND campaign_id = v_campaign_id;

  IF v_connection_id IS NULL THEN
    INSERT INTO worker_campaign_connections (
      worker_id, campaign_id, connection_status,
      first_contacted_at, last_contacted_at, contact_count,
      preferred_contact_method, support_level, created_by
    ) VALUES (
      v_worker_id, v_campaign_id,
      CASE
        WHEN p_dial_disposition = 'connected' THEN 'contacted'
        ELSE 'potential'
      END,
      now(), now(), 1,
      'phone',
      p_support_level,
      p_caller_user_id
    )
    RETURNING connection_id INTO v_connection_id;
  ELSE
    UPDATE worker_campaign_connections SET
      connection_status = CASE
        WHEN p_dial_disposition = 'connected'
          AND connection_status IN ('potential', 'contacted') THEN 'engaged'
        WHEN p_dial_disposition = 'connected' THEN connection_status
        ELSE connection_status
      END,
      last_contacted_at = now(),
      contact_count = contact_count + 1,
      support_level = COALESCE(p_support_level, support_level),
      updated_at = now()
    WHERE connection_id = v_connection_id;
  END IF;

  -- 7. Insert worker_activity_log
  INSERT INTO worker_activity_log (
    connection_id, activity_type, activity_date,
    description, outcome, contact_method,
    duration_minutes, logged_by
  ) VALUES (
    v_connection_id, 'contact', now(),
    COALESCE(p_overall_notes, 'Phone call attempt'),
    COALESCE(p_call_disposition, p_dial_disposition),
    'phone',
    CASE WHEN p_duration_seconds IS NOT NULL
      THEN CEIL(p_duration_seconds / 60.0)::INTEGER
      ELSE NULL
    END,
    p_caller_user_id
  );

  -- 8. Insert call_attempt_objections from p_objections JSONB array
  FOR v_obj IN SELECT * FROM jsonb_array_elements(p_objections)
  LOOP
    INSERT INTO call_attempt_objections (
      attempt_id, worker_id, objection_id, custom_label, outcome, notes
    ) VALUES (
      v_attempt_id,
      v_worker_id,
      (v_obj->>'objection_id')::INTEGER,
      v_obj->>'custom_label',
      v_obj->>'outcome',
      v_obj->>'notes'
    );
    v_objections_inserted := v_objections_inserted + 1;
  END LOOP;

  -- 8b. Insert call_attempt_cta_ratings + propagate to campaign_activity_ratings
  FOR v_cta IN SELECT * FROM jsonb_array_elements(p_cta_ratings)
  LOOP
    v_ambition_id := (v_cta->>'cta_ambition_id')::INTEGER;
    IF v_ambition_id IS NULL THEN CONTINUE; END IF;

    -- Resolve the ambition's linked activity for denormalisation +
    -- downstream propagation to campaign_activity_ratings.
    SELECT activity_id INTO v_ambition_activity_id
    FROM call_script_cta_ambitions
    WHERE id = v_ambition_id;

    v_cta_rating := NULLIF(v_cta->>'rating', '')::SMALLINT;
    v_cta_binary := NULLIF(v_cta->>'binary_value', '');
    v_cta_notes  := NULLIF(v_cta->>'notes', '');

    -- Both rating and binary may be null when the organiser skipped
    -- this CTA; only persist rows that have at least one signal.
    IF v_cta_rating IS NULL AND v_cta_binary IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO call_attempt_cta_ratings (
      attempt_id, cta_ambition_id, activity_id, worker_id,
      rating, binary_value, notes, created_by
    ) VALUES (
      v_attempt_id, v_ambition_id, v_ambition_activity_id, v_worker_id,
      v_cta_rating, v_cta_binary, v_cta_notes, p_caller_user_id
    )
    ON CONFLICT (attempt_id, cta_ambition_id) DO UPDATE SET
      rating       = EXCLUDED.rating,
      binary_value = EXCLUDED.binary_value,
      notes        = EXCLUDED.notes,
      activity_id  = EXCLUDED.activity_id,
      created_by   = EXCLUDED.created_by;

    v_cta_ratings_inserted := v_cta_ratings_inserted + 1;

    -- Propagate to wall chart when an assessment activity is linked.
    -- record_assessment_event handles the conflict resolution and
    -- requires at least one of rating / binary_value (already enforced
    -- above), so the call below is safe.
    IF v_ambition_activity_id IS NOT NULL THEN
      PERFORM record_assessment_event(
        p_activity_id   := v_ambition_activity_id,
        p_worker_id     := v_worker_id,
        p_rating        := v_cta_rating,
        p_binary_value  := v_cta_binary,
        p_rating_phase  := 'actual',
        p_event_id      := v_attempt_id,
        p_source        := 'call_outcome',
        p_notes         := v_cta_notes,
        p_actor_id      := p_caller_user_id
      );
    END IF;
  END LOOP;

  -- 9. Insert call_issue_observations from p_issues JSONB array
  FOR v_iss IN SELECT * FROM jsonb_array_elements(p_issues)
  LOOP
    INSERT INTO call_issue_observations (
      attempt_id, worker_id, campaign_id, issue_label, heat, source_top_issue_index, notes
    ) VALUES (
      v_attempt_id,
      v_worker_id,
      v_campaign_id,
      v_iss->>'issue_label',
      (v_iss->>'heat')::SMALLINT,
      (v_iss->>'source_top_issue_index')::INTEGER,
      v_iss->>'notes'
    );
    v_issues_inserted := v_issues_inserted + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'attempt_id', v_attempt_id,
    'item_status', v_item_status,
    'connection_id', v_connection_id,
    'worker_id', v_worker_id,
    'campaign_id', v_campaign_id,
    'objections_inserted', v_objections_inserted,
    'issues_inserted', v_issues_inserted,
    'cta_ratings_inserted', v_cta_ratings_inserted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_call_attempt TO authenticated;

COMMENT ON FUNCTION record_call_attempt IS
  'Records a call_attempts row plus all per-attempt children (step outcomes, '
  'objections, issues, CTA ratings). For each entry in p_cta_ratings, writes '
  'a call_attempt_cta_ratings audit row and (when the CTA ambition is linked '
  'to an assessment activity) calls record_assessment_event() so the worker''s '
  'wall-chart rating is updated.';
