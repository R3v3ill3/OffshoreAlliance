-- ============================================================
-- Migration 20260522100000: Phone Call Action Orchestrator
--
-- Adds tables for:
--   - phone_call_actions: orchestration session linking script + lists
--   - call_objections: campaign-scoped objection bank with global defaults
--   - call_attempt_objections: per-attempt objection observations
--   - call_issue_observations: per-attempt issue identification with heat
--   - call_script_cta_ambitions: per-script CTA outcome targets
--
-- Also adds:
--   - Updated record_call_attempt() with objection + issue capture
--   - seed_campaign_top_issues_from_call() RPC
--   - vw_call_action_report view for campaign call reporting
--   - RLS policies following can_write_to_campaign pattern
-- ============================================================

-- -------------------------------------------------------
-- 1. phone_call_actions — orchestration session
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS phone_call_actions (
  action_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  -- campaign_assessments table does not exist; storing as plain nullable
  -- integer so downstream code can reference a bargaining_strength_assessments
  -- row or any future assessment table without a hard FK.
  assessment_id INTEGER,
  variation_count INTEGER NOT NULL DEFAULT 1,
  variation_dimension VARCHAR(40)
    CHECK (variation_dimension IS NULL OR variation_dimension IN (
      'membership_status', 'organising_role', 'occupation', 'rating_band', 'none'
    )),
  entry_branch VARCHAR(20) NOT NULL CHECK (entry_branch IN ('list_first', 'script_first')),
  script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL,
  list_ids INTEGER[] DEFAULT '{}'::INTEGER[],
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pca_campaign ON phone_call_actions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pca_status ON phone_call_actions(campaign_id, status);

CREATE TRIGGER trg_phone_call_actions_updated_at
  BEFORE UPDATE ON phone_call_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE phone_call_actions IS
  'Orchestration session for the Create Phone Call flow. Tracks entry branch, selected script/lists, and completion status.';
COMMENT ON COLUMN phone_call_actions.assessment_id IS
  'Optional reference to a bargaining_strength_assessments row. No FK because the target table name may change.';
COMMENT ON COLUMN phone_call_actions.variation_dimension IS
  'Segment variable for multi-list variations: membership_status, organising_role, occupation, rating_band, or none.';
COMMENT ON COLUMN phone_call_actions.entry_branch IS
  'Whether the orchestrator started with list creation or script creation.';

-- -------------------------------------------------------
-- 2. call_objections — campaign-scoped objection bank
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_objections (
  objection_id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  label VARCHAR(200) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_co_campaign ON call_objections(campaign_id);

CREATE TRIGGER trg_call_objections_updated_at
  BEFORE UPDATE ON call_objections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE call_objections IS
  'Objection bank. Rows with campaign_id = NULL are global defaults seeded at migration time; campaign-specific rows override or extend.';
COMMENT ON COLUMN call_objections.is_default IS
  'TRUE for globally-seeded default objections (campaign_id IS NULL).';

-- Seed 10 sector-typical union-organising default objections
INSERT INTO call_objections (campaign_id, label, is_default, sort_order) VALUES
  (NULL, 'Too busy right now',                          true, 1),
  (NULL, 'Not interested in joining the union',         true, 2),
  (NULL, 'I don''t want to pay union fees',             true, 3),
  (NULL, 'The union won''t make a difference',          true, 4),
  (NULL, 'I''m worried about retaliation from management', true, 5),
  (NULL, 'I''m leaving this job soon',                  true, 6),
  (NULL, 'I prefer to handle issues myself',            true, 7),
  (NULL, 'Already a member but lapsed',                 true, 8),
  (NULL, 'Need to think about it',                      true, 9),
  (NULL, 'Don''t trust unions',                         true, 10);

-- -------------------------------------------------------
-- 3. call_attempt_objections — per-attempt objection observation
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_attempt_objections (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES call_attempts(attempt_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  objection_id INTEGER REFERENCES call_objections(objection_id) ON DELETE SET NULL,
  custom_label VARCHAR(200),
  outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('fully_resolved', 'partially_resolved', 'not_resolved')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_cao_objection_or_custom CHECK (objection_id IS NOT NULL OR custom_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cao_attempt ON call_attempt_objections(attempt_id);
CREATE INDEX IF NOT EXISTS idx_cao_worker ON call_attempt_objections(worker_id);
CREATE INDEX IF NOT EXISTS idx_cao_worker_recent ON call_attempt_objections(worker_id, created_at DESC);

COMMENT ON TABLE call_attempt_objections IS
  'Per-call-attempt objection observations. Links to call_objections bank or captures a custom label.';
COMMENT ON COLUMN call_attempt_objections.worker_id IS
  'Denormalised from call_list_items for fast worker-detail queries.';
COMMENT ON COLUMN call_attempt_objections.outcome IS
  'Resolution outcome: fully_resolved, partially_resolved, or not_resolved.';

-- -------------------------------------------------------
-- 4. call_issue_observations — per-attempt issue with heat
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_issue_observations (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES call_attempts(attempt_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  issue_label VARCHAR(200) NOT NULL,
  heat SMALLINT NOT NULL CHECK (heat BETWEEN 1 AND 5),
  source_top_issue_index INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cio_attempt ON call_issue_observations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_cio_worker ON call_issue_observations(worker_id);
CREATE INDEX IF NOT EXISTS idx_cio_campaign_recent ON call_issue_observations(campaign_id, created_at DESC);

COMMENT ON TABLE call_issue_observations IS
  'Per-call-attempt issue identification with heat (1–5 matching ISSUE_HEAT_LEVELS). Denormalised worker_id + campaign_id for reporting.';
COMMENT ON COLUMN call_issue_observations.heat IS
  'Organiser-assessed issue heat on 1–5 scale (matches ISSUE_HEAT_LEVELS constant).';
COMMENT ON COLUMN call_issue_observations.source_top_issue_index IS
  'Index into campaign_situation_analyses.top_issues JSONB array if the issue was pulled from there.';

-- -------------------------------------------------------
-- 5. call_script_cta_ambitions — per-script CTA target
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_script_cta_ambitions (
  id SERIAL PRIMARY KEY,
  script_id INTEGER NOT NULL REFERENCES call_scripts(script_id) ON DELETE CASCADE,
  outcome_definition_id INTEGER REFERENCES call_outcome_definitions(outcome_id) ON DELETE SET NULL,
  cta_label VARCHAR(200) NOT NULL,
  target_response VARCHAR(20)
    CHECK (target_response IS NULL OR target_response IN (
      'accepted', 'considering', 'declined', 'not_reached'
    )),
  target_min_rating SMALLINT
    CHECK (target_min_rating IS NULL OR target_min_rating BETWEEN 1 AND 5),
  target_binary BOOLEAN,
  target_support_level VARCHAR(30)
    CHECK (target_support_level IS NULL OR target_support_level IN (
      'strong_supporter', 'supporter', 'neutral', 'unsupportive', 'hostile'
    )),
  min_call_threshold_pct INTEGER
    CHECK (min_call_threshold_pct IS NULL OR min_call_threshold_pct BETWEEN 0 AND 100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csca_script ON call_script_cta_ambitions(script_id);

CREATE TRIGGER trg_call_script_cta_ambitions_updated_at
  BEFORE UPDATE ON call_script_cta_ambitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE call_script_cta_ambitions IS
  'Per-script CTA outcome targets. Used by the call runner pre-finalise gate to prompt when outcome falls below ambition.';
COMMENT ON COLUMN call_script_cta_ambitions.cta_label IS
  'Denormalised label so ambition is meaningful even if the outcome definition is deleted.';
COMMENT ON COLUMN call_script_cta_ambitions.min_call_threshold_pct IS
  'Campaign-level success threshold: what percentage of calls should meet or exceed the target.';

-- -------------------------------------------------------
-- 6. Update record_call_attempt() — add objection + issue capture
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
  p_issues JSONB DEFAULT '[]'::JSONB
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
  v_objections_inserted INTEGER := 0;
  v_issues_inserted INTEGER := 0;
BEGIN
  -- Get worker_id and campaign_id from list item
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
    'issues_inserted', v_issues_inserted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- 7. seed_campaign_top_issues_from_call() RPC
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_campaign_top_issues_from_call(
  p_campaign_id INTEGER,
  p_issues JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
  v_situation_id INTEGER;
BEGIN
  IF NOT can_write_to_campaign(p_campaign_id) THEN
    RAISE EXCEPTION 'seed_campaign_top_issues_from_call: permission denied for campaign %', p_campaign_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM campaign_situation_analyses
    WHERE campaign_id = p_campaign_id AND is_current = TRUE
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('action', 'noop', 'reason', 'current row already exists');
  END IF;

  INSERT INTO campaign_situation_analyses (
    campaign_id, version, is_current, top_issues, created_by
  ) VALUES (
    p_campaign_id, 1, TRUE, p_issues, auth.uid()
  )
  RETURNING situation_id INTO v_situation_id;

  RETURN jsonb_build_object(
    'action', 'created',
    'situation_id', v_situation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- 8. vw_call_action_report — campaign call reporting view
--
-- Column-name deviations from spec:
--   - union_membership_types.type_name (not union_membership_type_name)
--   - campaign_worker_ou has no campaign_id; joined via campaign_organising_units
--   - resigned_member mapped to 'lapsed' bucket (closest semantic fit)
-- -------------------------------------------------------
CREATE OR REPLACE VIEW vw_call_action_report AS
SELECT
  cl.campaign_id,
  cl.list_id,
  cl.name AS list_name,
  cs.script_id,
  cs.title AS script_title,
  ca.attempt_id,
  ca.started_at,
  ca.dial_disposition,
  ca.call_disposition,
  ca.cta_response,
  ca.support_level_assessed,
  cli.worker_id,
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
  (SELECT COUNT(*) FROM call_issue_observations i WHERE i.attempt_id = ca.attempt_id) AS issue_count
FROM call_lists cl
JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
LEFT JOIN call_scripts cs ON cs.script_id = cl.script_id
JOIN workers w ON w.worker_id = cli.worker_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN campaign_organising_units cou ON cou.campaign_id = cl.campaign_id
LEFT JOIN campaign_worker_ou cwou ON cwou.ou_id = cou.ou_id AND cwou.worker_id = w.worker_id;

COMMENT ON VIEW vw_call_action_report IS
  'Flat reporting view joining call attempts with worker membership status, worksite, and campaign unit. Used by the call report API with groupBy selector.';

-- -------------------------------------------------------
-- 9. RLS Policies
-- -------------------------------------------------------

-- phone_call_actions
ALTER TABLE phone_call_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read phone_call_actions"
  ON phone_call_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert phone_call_actions"
  ON phone_call_actions FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update phone_call_actions"
  ON phone_call_actions FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Admin can delete phone_call_actions"
  ON phone_call_actions FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_objections
ALTER TABLE call_objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_objections"
  ON call_objections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_objections"
  ON call_objections FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN campaign_id IS NULL THEN get_user_role() = 'admin'
      ELSE can_write_to_campaign(campaign_id)
    END
  );
CREATE POLICY "Campaign writers can update call_objections"
  ON call_objections FOR UPDATE TO authenticated
  USING (
    CASE
      WHEN campaign_id IS NULL THEN get_user_role() = 'admin'
      ELSE can_write_to_campaign(campaign_id)
    END
  )
  WITH CHECK (
    CASE
      WHEN campaign_id IS NULL THEN get_user_role() = 'admin'
      ELSE can_write_to_campaign(campaign_id)
    END
  );
CREATE POLICY "Admin can delete call_objections"
  ON call_objections FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_attempt_objections (child of call_attempts → call_list_items → call_lists)
ALTER TABLE call_attempt_objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_attempt_objections"
  ON call_attempt_objections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_attempt_objections"
  ON call_attempt_objections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_attempt_objections.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can update call_attempt_objections"
  ON call_attempt_objections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_attempt_objections.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );
CREATE POLICY "Admin can delete call_attempt_objections"
  ON call_attempt_objections FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_issue_observations (has campaign_id directly)
ALTER TABLE call_issue_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_issue_observations"
  ON call_issue_observations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_issue_observations"
  ON call_issue_observations FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update call_issue_observations"
  ON call_issue_observations FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Admin can delete call_issue_observations"
  ON call_issue_observations FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_script_cta_ambitions (child of call_scripts)
ALTER TABLE call_script_cta_ambitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_script_cta_ambitions"
  ON call_script_cta_ambitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_script_cta_ambitions"
  ON call_script_cta_ambitions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_cta_ambitions.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can update call_script_cta_ambitions"
  ON call_script_cta_ambitions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_cta_ambitions.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );
CREATE POLICY "Admin can delete call_script_cta_ambitions"
  ON call_script_cta_ambitions FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- -------------------------------------------------------
-- 10. Grants
-- -------------------------------------------------------

-- Table grants
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_call_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON call_objections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON call_attempt_objections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON call_issue_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON call_script_cta_ambitions TO authenticated;

-- View grant
GRANT SELECT ON vw_call_action_report TO authenticated;

-- Sequence grants
GRANT USAGE, SELECT ON SEQUENCE phone_call_actions_action_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_objections_objection_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_attempt_objections_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_issue_observations_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_script_cta_ambitions_id_seq TO authenticated;

-- RPC grants
GRANT EXECUTE ON FUNCTION record_call_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION seed_campaign_top_issues_from_call TO authenticated;
