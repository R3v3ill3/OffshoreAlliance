-- ============================================================
-- Migration 20260414200000: Phone Call Operations Module
--
-- Adds tables for:
--   - call_scripts: structured phone scripts linked to campaign_comms_drafts
--   - call_script_sections: SOC-framework-aligned script sections
--   - call_lists: persistent call lists for phone campaigns
--   - call_list_items: individual contacts on a call list with priority
--   - call_attempts: records of each call attempt with disposition
--   - call_step_outcomes: per-section outcomes during a connected call
--   - call_outcome_definitions: maps call outcomes to campaign ambitions
--
-- Also adds:
--   - structured_script_id column on campaign_comms_drafts
--   - record_call_attempt() function for atomic call recording
--   - call_campaign_summary view for reporting
--   - RLS policies following can_write_to_campaign pattern
-- ============================================================

-- -------------------------------------------------------
-- 1. call_scripts
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_scripts (
  script_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  draft_id INTEGER REFERENCES campaign_comms_drafts(draft_id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  call_objective TEXT,
  estimated_duration_minutes INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_campaign ON call_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON call_scripts(campaign_id, status);

CREATE TRIGGER trg_call_scripts_updated_at
  BEFORE UPDATE ON call_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 2. call_script_sections
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_script_sections (
  section_id SERIAL PRIMARY KEY,
  script_id INTEGER NOT NULL REFERENCES call_scripts(script_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  section_type VARCHAR(30) NOT NULL DEFAULT 'custom'
    CHECK (section_type IN (
      'opening', 'introduction', 'discovery', 'education',
      'ask', 'objection_handling', 'close', 'custom'
    )),
  title VARCHAR(300) NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  talking_points JSONB DEFAULT '[]',
  prompt_text VARCHAR(500),
  expected_outcomes JSONB DEFAULT '[]',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_css_script ON call_script_sections(script_id, sort_order);

CREATE TRIGGER trg_call_script_sections_updated_at
  BEFORE UPDATE ON call_script_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 3. call_lists
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_lists (
  list_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'paused')),
  source_filters JSONB,
  priority_strategy VARCHAR(30) NOT NULL DEFAULT 'sequential'
    CHECK (priority_strategy IN ('sequential', 'priority_score', 'random', 'least_recently_contacted')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_campaign ON call_lists(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cl_status ON call_lists(campaign_id, status);

CREATE TRIGGER trg_call_lists_updated_at
  BEFORE UPDATE ON call_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 4. call_list_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_list_items (
  item_id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES call_lists(list_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  priority_score NUMERIC(6,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'deferred')),
  assigned_to UUID REFERENCES auth.users(id),
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  best_disposition VARCHAR(40),
  next_call_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_cli_list ON call_list_items(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cli_status ON call_list_items(list_id, status);
CREATE INDEX IF NOT EXISTS idx_cli_next_call ON call_list_items(list_id, next_call_at)
  WHERE status = 'deferred' AND next_call_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cli_worker ON call_list_items(worker_id);
CREATE INDEX IF NOT EXISTS idx_cli_assigned ON call_list_items(assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE TRIGGER trg_call_list_items_updated_at
  BEFORE UPDATE ON call_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 5. call_attempts
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_attempts (
  attempt_id SERIAL PRIMARY KEY,
  list_item_id INTEGER NOT NULL REFERENCES call_list_items(item_id) ON DELETE CASCADE,
  script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL,
  caller_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  dial_disposition VARCHAR(30) NOT NULL
    CHECK (dial_disposition IN (
      'connected', 'no_answer', 'voicemail_left', 'voicemail_no_message',
      'busy', 'disconnected', 'wrong_number', 'do_not_call', 'callback_requested'
    )),

  call_disposition VARCHAR(30)
    CHECK (call_disposition IS NULL OR call_disposition IN (
      'completed_positive', 'completed_neutral', 'completed_negative',
      'partial_hung_up', 'partial_asked_callback', 'referred_to_other'
    )),

  overall_notes TEXT,
  callback_datetime TIMESTAMPTZ,
  support_level_assessed VARCHAR(30)
    CHECK (support_level_assessed IS NULL OR support_level_assessed IN (
      'strong_supporter', 'supporter', 'neutral', 'unsupportive', 'hostile'
    )),
  follow_up_action TEXT,
  cta_response VARCHAR(20)
    CHECK (cta_response IS NULL OR cta_response IN (
      'accepted', 'considering', 'declined', 'not_reached'
    )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_list_item ON call_attempts(list_item_id);
CREATE INDEX IF NOT EXISTS idx_ca_caller ON call_attempts(caller_user_id);
CREATE INDEX IF NOT EXISTS idx_ca_started ON call_attempts(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_dial_disp ON call_attempts(dial_disposition);

-- -------------------------------------------------------
-- 6. call_step_outcomes
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_step_outcomes (
  step_outcome_id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES call_attempts(attempt_id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES call_script_sections(section_id) ON DELETE CASCADE,
  reached BOOLEAN NOT NULL DEFAULT false,
  outcome_value TEXT,
  notes TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cso_attempt ON call_step_outcomes(attempt_id);

-- -------------------------------------------------------
-- 7. call_outcome_definitions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_outcome_definitions (
  outcome_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  outcome_category VARCHAR(20) NOT NULL
    CHECK (outcome_category IN ('dial', 'conversation', 'cta')),
  maps_to_ambition_id INTEGER REFERENCES plan_ambitions(ambition_id) ON DELETE SET NULL,
  is_positive BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cod_campaign ON call_outcome_definitions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cod_script ON call_outcome_definitions(script_id);

-- -------------------------------------------------------
-- 8. Add structured_script_id to campaign_comms_drafts
-- -------------------------------------------------------
ALTER TABLE campaign_comms_drafts
  ADD COLUMN IF NOT EXISTS structured_script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 9. record_call_attempt() -- atomic call recording function
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
  p_step_outcomes JSONB DEFAULT '[]'
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

  v_result := jsonb_build_object(
    'attempt_id', v_attempt_id,
    'item_status', v_item_status,
    'connection_id', v_connection_id,
    'worker_id', v_worker_id,
    'campaign_id', v_campaign_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- 10. call_campaign_summary view
-- -------------------------------------------------------
CREATE OR REPLACE VIEW call_campaign_summary AS
SELECT
  cl.campaign_id,
  cl.list_id,
  cl.name AS list_name,
  cl.status AS list_status,
  cl.total_items,
  cl.completed_items,
  cl.priority_strategy,
  cs.script_id,
  cs.title AS script_title,
  -- Attempt counts
  COUNT(DISTINCT ca.attempt_id) AS total_attempts,
  COUNT(DISTINCT cli.worker_id) FILTER (WHERE ca.attempt_id IS NOT NULL) AS unique_contacts_attempted,
  COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') AS connected_count,
  COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'no_answer') AS no_answer_count,
  COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition IN ('voicemail_left', 'voicemail_no_message')) AS voicemail_count,
  COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition IN ('disconnected', 'wrong_number')) AS bad_number_count,
  COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'do_not_call') AS dnc_count,
  -- Connect rate
  CASE WHEN COUNT(ca.attempt_id) > 0
    THEN ROUND(100.0 * COUNT(ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') / COUNT(ca.attempt_id), 1)
    ELSE 0
  END AS connect_rate_pct,
  -- CTA outcomes
  COUNT(ca.attempt_id) FILTER (WHERE ca.cta_response = 'accepted') AS cta_accepted,
  COUNT(ca.attempt_id) FILTER (WHERE ca.cta_response = 'considering') AS cta_considering,
  COUNT(ca.attempt_id) FILTER (WHERE ca.cta_response = 'declined') AS cta_declined,
  -- Call dispositions
  COUNT(ca.attempt_id) FILTER (WHERE ca.call_disposition = 'completed_positive') AS positive_calls,
  COUNT(ca.attempt_id) FILTER (WHERE ca.call_disposition = 'completed_neutral') AS neutral_calls,
  COUNT(ca.attempt_id) FILTER (WHERE ca.call_disposition = 'completed_negative') AS negative_calls,
  -- Average duration for connected calls
  ROUND(AVG(ca.duration_seconds) FILTER (WHERE ca.dial_disposition = 'connected'), 0) AS avg_call_duration_seconds,
  -- Callbacks pending
  COUNT(cli.item_id) FILTER (WHERE cli.status = 'deferred') AS callbacks_pending
FROM call_lists cl
LEFT JOIN call_scripts cs ON cs.script_id = cl.script_id
LEFT JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
GROUP BY cl.campaign_id, cl.list_id, cl.name, cl.status,
         cl.total_items, cl.completed_items, cl.priority_strategy,
         cs.script_id, cs.title;

-- -------------------------------------------------------
-- 11. call_section_funnel view (section-level progression)
-- -------------------------------------------------------
CREATE OR REPLACE VIEW call_section_funnel AS
SELECT
  cl.campaign_id,
  cl.list_id,
  css.section_id,
  css.sort_order,
  css.section_type,
  css.title AS section_title,
  COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') AS total_connected_calls,
  COUNT(DISTINCT cso.attempt_id) FILTER (WHERE cso.reached = true) AS reached_count,
  CASE WHEN COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') > 0
    THEN ROUND(
      100.0 * COUNT(DISTINCT cso.attempt_id) FILTER (WHERE cso.reached = true)
      / COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected'),
      1
    )
    ELSE 0
  END AS reach_rate_pct
FROM call_lists cl
JOIN call_scripts cs ON cs.script_id = cl.script_id
JOIN call_script_sections css ON css.script_id = cs.script_id
LEFT JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
LEFT JOIN call_step_outcomes cso ON cso.attempt_id = ca.attempt_id AND cso.section_id = css.section_id
GROUP BY cl.campaign_id, cl.list_id, css.section_id, css.sort_order, css.section_type, css.title
ORDER BY cl.campaign_id, cl.list_id, css.sort_order;

-- -------------------------------------------------------
-- 12. RLS Policies
-- -------------------------------------------------------

ALTER TABLE call_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_script_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_step_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_outcome_definitions ENABLE ROW LEVEL SECURITY;

-- call_scripts: read for authenticated, write via can_write_to_campaign
CREATE POLICY "Authenticated read call_scripts"
  ON call_scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_scripts"
  ON call_scripts FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update call_scripts"
  ON call_scripts FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Admin can delete call_scripts"
  ON call_scripts FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_script_sections: policies follow parent script
CREATE POLICY "Authenticated read call_script_sections"
  ON call_script_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_script_sections"
  ON call_script_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can update call_script_sections"
  ON call_script_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );
CREATE POLICY "Admin can delete call_script_sections"
  ON call_script_sections FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_lists: read for authenticated, write via can_write_to_campaign
CREATE POLICY "Authenticated read call_lists"
  ON call_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_lists"
  ON call_lists FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update call_lists"
  ON call_lists FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Admin can delete call_lists"
  ON call_lists FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_list_items: policies follow parent list
CREATE POLICY "Authenticated read call_list_items"
  ON call_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_list_items"
  ON call_list_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can update call_list_items"
  ON call_list_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );
CREATE POLICY "Admin can delete call_list_items"
  ON call_list_items FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- call_attempts: read for authenticated, insert for campaign writers
CREATE POLICY "Authenticated read call_attempts"
  ON call_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_attempts"
  ON call_attempts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_list_items cli
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE cli.item_id = call_attempts.list_item_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

-- call_step_outcomes: read for authenticated, insert for campaign writers
CREATE POLICY "Authenticated read call_step_outcomes"
  ON call_step_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_step_outcomes"
  ON call_step_outcomes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_step_outcomes.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

-- call_outcome_definitions: read for authenticated, write via can_write_to_campaign
CREATE POLICY "Authenticated read call_outcome_definitions"
  ON call_outcome_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert call_outcome_definitions"
  ON call_outcome_definitions FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update call_outcome_definitions"
  ON call_outcome_definitions FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Admin can delete call_outcome_definitions"
  ON call_outcome_definitions FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- -------------------------------------------------------
-- 13. Grants
-- -------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON call_scripts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON call_script_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE ON call_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON call_list_items TO authenticated;
GRANT SELECT, INSERT ON call_attempts TO authenticated;
GRANT SELECT, INSERT ON call_step_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON call_outcome_definitions TO authenticated;
GRANT DELETE ON call_scripts TO authenticated;
GRANT DELETE ON call_script_sections TO authenticated;
GRANT DELETE ON call_lists TO authenticated;
GRANT DELETE ON call_list_items TO authenticated;
GRANT DELETE ON call_outcome_definitions TO authenticated;
GRANT SELECT ON call_campaign_summary TO authenticated;
GRANT SELECT ON call_section_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION record_call_attempt TO authenticated;

-- Grant sequence usage for serial PKs
GRANT USAGE, SELECT ON SEQUENCE call_scripts_script_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_script_sections_section_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_lists_list_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_list_items_item_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_attempts_attempt_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_step_outcomes_step_outcome_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE call_outcome_definitions_outcome_id_seq TO authenticated;
