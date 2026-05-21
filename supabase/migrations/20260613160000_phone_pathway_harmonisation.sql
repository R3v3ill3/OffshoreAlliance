-- ============================================================
-- Phone pathway harmonisation (continued)
--
-- Adds the schema pieces needed for the Create Phone Call /
-- Build List harmonisation:
--   • phone_call_actions gains a 'build_list' entry branch and
--     a selected_assessment_ids array.
--   • worker_activity_log gains a metadata JSONB + action_id
--     and allows 'details_updated' / 'campaign_removal' types.
--   • New call_attempt_assessment_ratings table — multi-
--     assessment rating capture during a call.
--   • record_call_attempt() accepts an assessment_ratings array
--     and a phone_call_actions action_id for audit linkage.
--   • New phone_call_action_reports table for session-end
--     snapshots.
--   • vw_call_action_report extended with removal /
--     details_updated flags and aggregated assessment ratings.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. phone_call_actions: 'build_list' entry branch + selected
--    assessments (campaign_activities.activity_id list).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE phone_call_actions
  DROP CONSTRAINT IF EXISTS phone_call_actions_entry_branch_check;

ALTER TABLE phone_call_actions
  ADD CONSTRAINT phone_call_actions_entry_branch_check
    CHECK (entry_branch IN ('list_first', 'script_first', 'build_list'));

ALTER TABLE phone_call_actions
  ADD COLUMN IF NOT EXISTS selected_assessment_ids INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[];

COMMENT ON COLUMN phone_call_actions.selected_assessment_ids IS
  'campaign_activities.activity_id values the driver chose to rate during this calling session. Empty array means no per-call assessment capture.';

COMMENT ON COLUMN phone_call_actions.entry_branch IS
  'How the session was initiated: list_first (orchestrator), script_first (orchestrator), build_list (wall-chart Build List Fire).';

-- ─────────────────────────────────────────────────────────────
-- 2. worker_activity_log: allow details_updated / campaign_removal
--    activity types, and attach metadata + action_id for audit.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE worker_activity_log
  DROP CONSTRAINT IF EXISTS worker_activity_log_activity_type_check;

ALTER TABLE worker_activity_log
  ADD CONSTRAINT worker_activity_log_activity_type_check
    CHECK (activity_type IN (
      'contact',
      'meeting',
      'event_attendance',
      'volunteer',
      'donation',
      'survey_response',
      'details_updated',
      'campaign_removal',
      'other'
    ));

ALTER TABLE worker_activity_log
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS action_id INTEGER REFERENCES phone_call_actions(action_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wal_action_id ON worker_activity_log(action_id);
CREATE INDEX IF NOT EXISTS idx_wal_activity_type ON worker_activity_log(activity_type);

COMMENT ON COLUMN worker_activity_log.metadata IS
  'Arbitrary JSON payload — e.g. field-level diff for details_updated, reason_code for campaign_removal, action_id for phone-call attribution.';
COMMENT ON COLUMN worker_activity_log.action_id IS
  'Optional link to the phone_call_actions session this activity occurred during.';

-- ─────────────────────────────────────────────────────────────
-- 2b. call_attempts: allow the two new dialler outcomes
--     ('removed_from_campaign', 'no_longer_in_universe') as
--     call_disposition values. They behave as terminal call
--     dispositions; the client also calls the shared removal
--     hook to scrub the worker from the campaign.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE call_attempts
  DROP CONSTRAINT IF EXISTS call_attempts_call_disposition_check;

ALTER TABLE call_attempts
  ADD CONSTRAINT call_attempts_call_disposition_check
    CHECK (call_disposition IS NULL OR call_disposition IN (
      'completed_positive',
      'completed_neutral',
      'completed_negative',
      'partial_hung_up',
      'partial_asked_callback',
      'referred_to_other',
      'removed_from_campaign',
      'no_longer_in_universe'
    ));

-- ─────────────────────────────────────────────────────────────
-- 3. call_attempt_assessment_ratings — per-call multi-assessment
--    capture. One row per (attempt_id, activity_id).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_attempt_assessment_ratings (
  attempt_id INTEGER NOT NULL REFERENCES call_attempts(attempt_id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_caar_activity ON call_attempt_assessment_ratings(activity_id);

COMMENT ON TABLE call_attempt_assessment_ratings IS
  'Per-call assessment ratings captured during a dialler session. NULL rating means the driver opened the assessment row but left it unassessed.';

ALTER TABLE call_attempt_assessment_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_attempt_assessment_ratings"
  ON call_attempt_assessment_ratings FOR SELECT TO authenticated USING (true);

-- Inserts/updates only via record_call_attempt() (SECURITY DEFINER).
GRANT SELECT ON call_attempt_assessment_ratings TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. phone_call_action_reports — frozen session snapshot.
--    Generated when the user ends the session; preserves the
--    report so historical sessions stay stable even if the
--    underlying view changes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_call_action_reports (
  report_id BIGSERIAL PRIMARY KEY,
  action_id INTEGER NOT NULL REFERENCES phone_call_actions(action_id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_pcar_action ON phone_call_action_reports(action_id);

COMMENT ON TABLE phone_call_action_reports IS
  'Frozen session-end report snapshot for a phone_call_actions row. One row per action_id; regenerating overwrites via the snapshot column.';

ALTER TABLE phone_call_action_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read phone_call_action_reports"
  ON phone_call_action_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write phone_call_action_reports"
  ON phone_call_action_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owner update phone_call_action_reports"
  ON phone_call_action_reports FOR UPDATE TO authenticated
  USING (generated_by = auth.uid() OR get_user_role() = 'admin')
  WITH CHECK (generated_by = auth.uid() OR get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE ON phone_call_action_reports TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE phone_call_action_reports_report_id_seq TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. record_call_attempt(): extends the current live signature
--    from 20260609100000 with two new optional parameters —
--    p_assessment_ratings (multi-assessment capture) and
--    p_action_id (phone_call_actions session linkage). All
--    existing behaviour (objections / issues / cta_ratings /
--    record_assessment_event propagation) is preserved.
--
--    We DROP the previous overload before recreating so signature
--    changes don't leave a dangling resolver.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS record_call_attempt(
  INTEGER, INTEGER, UUID, VARCHAR, VARCHAR, TEXT, TIMESTAMPTZ,
  VARCHAR, TEXT, VARCHAR, INTEGER, JSONB, JSONB, JSONB, JSONB
);

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
  p_step_outcomes JSONB DEFAULT '[]'::JSONB,
  p_objections JSONB DEFAULT '[]'::JSONB,
  p_issues JSONB DEFAULT '[]'::JSONB,
  p_cta_ratings JSONB DEFAULT '[]'::JSONB,
  p_assessment_ratings JSONB DEFAULT '[]'::JSONB,
  p_action_id INTEGER DEFAULT NULL
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
  v_ar JSONB;
  v_objections_inserted INTEGER := 0;
  v_issues_inserted INTEGER := 0;
  v_cta_ratings_inserted INTEGER := 0;
  v_assessment_ratings_inserted INTEGER := 0;
  v_ambition_id INTEGER;
  v_ambition_activity_id INTEGER;
  v_cta_rating SMALLINT;
  v_cta_binary VARCHAR(30);
  v_cta_notes TEXT;
  v_ar_activity_id INTEGER;
  v_ar_rating SMALLINT;
  v_ar_notes TEXT;
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

  -- 3. Determine new item status.
  --    'removed_from_campaign' and 'no_longer_in_universe' are
  --    terminal — the worker is being removed, so the list item
  --    is always marked completed and the client triggers the
  --    shared removal mutation in addition.
  IF p_call_disposition IN ('removed_from_campaign', 'no_longer_in_universe') THEN
    v_item_status := 'completed';
  ELSIF p_dial_disposition = 'callback_requested' OR p_call_disposition = 'partial_asked_callback' THEN
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

  -- 7. Insert worker_activity_log (action_id new — links to session)
  INSERT INTO worker_activity_log (
    connection_id, activity_type, activity_date,
    description, outcome, contact_method,
    duration_minutes, logged_by, action_id
  ) VALUES (
    v_connection_id, 'contact', now(),
    COALESCE(p_overall_notes, 'Phone call attempt'),
    COALESCE(p_call_disposition, p_dial_disposition),
    'phone',
    CASE WHEN p_duration_seconds IS NOT NULL
      THEN CEIL(p_duration_seconds / 60.0)::INTEGER
      ELSE NULL
    END,
    p_caller_user_id,
    p_action_id
  );

  -- 8. Insert call_attempt_objections
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

  -- 8b. CTA ratings + propagate via record_assessment_event
  FOR v_cta IN SELECT * FROM jsonb_array_elements(p_cta_ratings)
  LOOP
    v_ambition_id := (v_cta->>'cta_ambition_id')::INTEGER;
    IF v_ambition_id IS NULL THEN CONTINUE; END IF;

    SELECT activity_id INTO v_ambition_activity_id
    FROM call_script_cta_ambitions
    WHERE id = v_ambition_id;

    v_cta_rating := NULLIF(v_cta->>'rating', '')::SMALLINT;
    v_cta_binary := NULLIF(v_cta->>'binary_value', '');
    v_cta_notes  := NULLIF(v_cta->>'notes', '');

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

  -- 8c. Per-call assessment ratings (new — multi-assessment capture).
  --     Each entry: { activity_id, rating, notes }. Non-null ratings
  --     propagate to campaign_activity_ratings via the shared event
  --     function so the wall chart sees the freshest value.
  FOR v_ar IN SELECT * FROM jsonb_array_elements(p_assessment_ratings)
  LOOP
    v_ar_activity_id := NULLIF(v_ar->>'activity_id', '')::INTEGER;
    IF v_ar_activity_id IS NULL THEN CONTINUE; END IF;

    v_ar_rating := NULLIF(v_ar->>'rating', '')::SMALLINT;
    v_ar_notes  := NULLIF(v_ar->>'notes', '');

    INSERT INTO call_attempt_assessment_ratings (
      attempt_id, activity_id, rating, notes
    ) VALUES (
      v_attempt_id, v_ar_activity_id, v_ar_rating, v_ar_notes
    )
    ON CONFLICT (attempt_id, activity_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      notes  = EXCLUDED.notes;

    v_assessment_ratings_inserted := v_assessment_ratings_inserted + 1;

    IF v_ar_rating IS NOT NULL THEN
      PERFORM record_assessment_event(
        p_activity_id   := v_ar_activity_id,
        p_worker_id     := v_worker_id,
        p_rating        := v_ar_rating,
        p_binary_value  := NULL,
        p_rating_phase  := 'actual',
        p_event_id      := v_attempt_id,
        p_source        := 'call_outcome',
        p_notes         := v_ar_notes,
        p_actor_id      := p_caller_user_id
      );
    END IF;
  END LOOP;

  -- 9. Insert call_issue_observations
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
    'cta_ratings_inserted', v_cta_ratings_inserted,
    'assessment_ratings_inserted', v_assessment_ratings_inserted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_call_attempt(
  INTEGER, INTEGER, UUID, VARCHAR, VARCHAR, TEXT, TIMESTAMPTZ,
  VARCHAR, TEXT, VARCHAR, INTEGER, JSONB, JSONB, JSONB, JSONB, JSONB, INTEGER
) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Extend vw_call_action_report with removal / details_updated
--    flags so the harmonised session report can surface them.
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS vw_call_action_report;

CREATE VIEW vw_call_action_report AS
SELECT
  cl.campaign_id,
  cl.list_id,
  cl.name AS list_name,
  cl.section_plan_id,
  COALESCE(ca.script_id, cl.script_id) AS script_id,
  cs.title AS script_title,
  ca.attempt_id,
  ca.started_at,
  ca.dial_disposition,
  ca.call_disposition,
  ca.outcome_classification,
  ca.cta_response,
  ca.support_level_assessed,
  cli.worker_id,
  w.first_name,
  w.last_name,
  CASE
    WHEN umt.type_name = 'member_pending' THEN 'member_pending'
    WHEN umt.type_name IN ('financial_member', 'non_oa_member') THEN 'member'
    WHEN umt.type_name = 'resigned_member' THEN 'lapsed'
    ELSE 'non_member'
  END AS membership_status,
  w.worksite_id,
  ws.worksite_name,
  cwou.ou_id AS campaign_unit_id,
  cou.name AS campaign_unit_name,
  (SELECT COUNT(*) FROM call_attempt_objections o WHERE o.attempt_id = ca.attempt_id) AS objection_count,
  (SELECT COUNT(*) FROM call_issue_observations i WHERE i.attempt_id = ca.attempt_id) AS issue_count,
  (ca.call_disposition IN ('removed_from_campaign', 'no_longer_in_universe')) AS removed_from_campaign,
  (
    SELECT COUNT(*) > 0
    FROM worker_activity_log wal
    WHERE wal.connection_id IN (
      SELECT wcc.connection_id FROM worker_campaign_connections wcc
      WHERE wcc.worker_id = cli.worker_id AND wcc.campaign_id = cl.campaign_id
    )
      AND wal.activity_type = 'details_updated'
      AND wal.activity_date >= ca.started_at
      AND (ca.ended_at IS NULL OR wal.activity_date <= ca.ended_at + INTERVAL '5 minutes')
  ) AS details_updated,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'activity_id', caar.activity_id,
      'rating', caar.rating,
      'notes', caar.notes
    ))
    FROM call_attempt_assessment_ratings caar
    WHERE caar.attempt_id = ca.attempt_id
  ) AS assessment_ratings
FROM call_lists cl
JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
LEFT JOIN call_scripts cs ON cs.script_id = COALESCE(ca.script_id, cl.script_id)
JOIN workers w ON w.worker_id = cli.worker_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN campaign_organising_units cou ON cou.campaign_id = cl.campaign_id
LEFT JOIN campaign_worker_ou cwou ON cwou.ou_id = cou.ou_id AND cwou.worker_id = w.worker_id;

COMMENT ON VIEW vw_call_action_report IS
  'Flat reporting view joining call attempts with worker, membership, worksite, unit, plus removal/details_updated flags and aggregated per-call assessment ratings (one row per attempt).';

GRANT SELECT ON vw_call_action_report TO authenticated;
