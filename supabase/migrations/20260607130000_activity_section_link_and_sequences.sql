-- ============================================================
-- Section Planning module — Phase 5 of 10
--
-- (a) campaign_activities.section_plan_id — optional FK so an
--     activity can be scoped to a section plan in addition to its
--     campaign. Nullable; activities can also remain unscoped.
--
-- (b) activity_sequences / _steps / _triggers / _runs — lightweight
--     activity chaining. Authoring lives in _sequences + _steps
--     + _triggers; the _runs table is queue + audit.
--
-- (c) tg_activity_event_evaluate_sequences — AFTER INSERT trigger
--     on activity_events that enqueues runs whose triggers match.
--
-- (d) materialise_sequence_run RPC — creates a downstream activity
--     from the queued run.
-- ============================================================

ALTER TABLE campaign_activities
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_activities_section_plan_id
  ON campaign_activities(section_plan_id) WHERE section_plan_id IS NOT NULL;

-- Update v_section_plan_summary now that the column exists, so the
-- activities_count populates. Replaces the placeholder added in Phase 2.
CREATE OR REPLACE VIEW v_section_plan_summary AS
SELECT
  sp.section_plan_id, sp.campaign_id, sp.name, sp.status, sp.timeframe_kind,
  sp.start_date, sp.end_date,
  COALESCE(amb.cnt, 0) AS ambitions_count,
  COALESCE(wtp.cnt, 0) AS wtp_count,
  COALESCE(cap.cnt, 0) AS capacities_count,
  CASE WHEN tow.theory_id IS NOT NULL THEN 1 ELSE 0 END AS theories_count,
  COALESCE(act.cnt, 0) AS activities_count
FROM section_plans sp
LEFT JOIN (SELECT section_plan_id, COUNT(*)::INT AS cnt FROM plan_ambitions WHERE section_plan_id IS NOT NULL GROUP BY section_plan_id) amb ON amb.section_plan_id = sp.section_plan_id
LEFT JOIN (SELECT section_plan_id, COUNT(*)::INT AS cnt FROM plan_where_to_play WHERE section_plan_id IS NOT NULL GROUP BY section_plan_id) wtp ON wtp.section_plan_id = sp.section_plan_id
LEFT JOIN (SELECT section_plan_id, COUNT(*)::INT AS cnt FROM plan_capacities WHERE section_plan_id IS NOT NULL GROUP BY section_plan_id) cap ON cap.section_plan_id = sp.section_plan_id
LEFT JOIN LATERAL (SELECT theory_id FROM plan_theory_of_winning WHERE section_plan_id = sp.section_plan_id AND COALESCE(is_current, true) = true ORDER BY version DESC NULLS LAST LIMIT 1) tow ON true
LEFT JOIN (SELECT section_plan_id, COUNT(*)::INT AS cnt FROM campaign_activities WHERE section_plan_id IS NOT NULL GROUP BY section_plan_id) act ON act.section_plan_id = sp.section_plan_id;

-- ─────────────────────────────────────────────────────────────
-- (b) activity_sequences + steps + triggers + runs
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_sequences (
  sequence_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_sequences_section ON activity_sequences(section_plan_id);

CREATE TABLE IF NOT EXISTS activity_sequence_steps (
  step_id BIGSERIAL PRIMARY KEY,
  sequence_id BIGINT NOT NULL REFERENCES activity_sequences(sequence_id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  source_activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  target_activity_template_key TEXT NOT NULL,
  target_activity_kind TEXT NOT NULL CHECK (target_activity_kind IN (
    'task','assessment','industrial_action','woc_meeting',
    'phone_call_list','sms_blast','email_survey','site_visit'
  )),
  target_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  delay_minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_steps_seq ON activity_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_steps_source ON activity_sequence_steps(source_activity_id) WHERE source_activity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_sequence_triggers (
  trigger_id BIGSERIAL PRIMARY KEY,
  step_id BIGINT NOT NULL REFERENCES activity_sequence_steps(step_id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  outcome TEXT,
  threshold_kind TEXT NOT NULL CHECK (threshold_kind IN ('absolute_count','percent_of_target','any')),
  threshold_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_triggers_step ON activity_sequence_triggers(step_id);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_triggers_event ON activity_sequence_triggers(event_kind);

CREATE TABLE IF NOT EXISTS activity_sequence_runs (
  run_id BIGSERIAL PRIMARY KEY,
  step_id BIGINT NOT NULL REFERENCES activity_sequence_steps(step_id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','materialised','skipped','failed')),
  materialised_activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_runs_state ON activity_sequence_runs(state, triggered_at);
CREATE INDEX IF NOT EXISTS idx_activity_sequence_runs_step ON activity_sequence_runs(step_id);

-- RLS — read-all for authenticated; write via section_plans.campaign_id.
ALTER TABLE activity_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_sequence_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_sequence_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY activity_sequences_read ON activity_sequences FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY activity_sequences_write ON activity_sequences FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = activity_sequences.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY activity_sequence_steps_read ON activity_sequence_steps FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY activity_sequence_steps_write ON activity_sequence_steps FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM activity_sequences s JOIN section_plans sp ON sp.section_plan_id = s.section_plan_id WHERE s.sequence_id = activity_sequence_steps.sequence_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY activity_sequence_triggers_read ON activity_sequence_triggers FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY activity_sequence_triggers_write ON activity_sequence_triggers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM activity_sequence_steps st JOIN activity_sequences s ON s.sequence_id = st.sequence_id JOIN section_plans sp ON sp.section_plan_id = s.section_plan_id WHERE st.step_id = activity_sequence_triggers.step_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY activity_sequence_runs_read ON activity_sequence_runs FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY activity_sequence_runs_write ON activity_sequence_runs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM activity_sequence_steps st JOIN activity_sequences s ON s.sequence_id = st.sequence_id JOIN section_plans sp ON sp.section_plan_id = s.section_plan_id WHERE st.step_id = activity_sequence_runs.step_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (c) tg_activity_event_evaluate_sequences
--
-- Fires AFTER INSERT on activity_events. For each step whose
-- source_activity_id matches the event's activity_id, evaluate
-- each trigger:
--   threshold_kind = 'any'                — match if event_kind+outcome match
--   threshold_kind = 'absolute_count'     — count matching events ≥ threshold_value
--   threshold_kind = 'percent_of_target'  — match count / activity-target ratio
-- (target lookup is best-effort — we count distinct events for the
-- source activity.)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION tg_activity_event_evaluate_sequences()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  rec RECORD;
  v_match_count INT;
  v_total_for_activity INT;
  v_ratio NUMERIC;
BEGIN
  -- Only consider concluded events to avoid acting on placeholders
  IF NEW.is_concluded IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT t.trigger_id, t.step_id, t.event_kind, t.outcome,
           t.threshold_kind, t.threshold_value, st.source_activity_id
    FROM activity_sequence_triggers t
    JOIN activity_sequence_steps st ON st.step_id = t.step_id
    JOIN activity_sequences s       ON s.sequence_id = st.sequence_id
    WHERE s.is_active = TRUE
      AND st.source_activity_id = NEW.activity_id
      AND t.event_kind = NEW.event_kind
  LOOP
    -- Skip if the run already exists for this step (avoid duplicate enqueue)
    IF EXISTS (
      SELECT 1 FROM activity_sequence_runs
      WHERE step_id = rec.step_id AND state IN ('queued','materialised')
    ) THEN
      CONTINUE;
    END IF;

    -- Optional outcome filter — match by exact text in NEW.outcome JSONB.
    IF rec.outcome IS NOT NULL AND rec.outcome <> '' THEN
      IF NOT (NEW.outcome ? rec.outcome
              OR (NEW.outcome ->> 'outcome') = rec.outcome
              OR (NEW.outcome ->> 'kind')    = rec.outcome) THEN
        CONTINUE;
      END IF;
    END IF;

    IF rec.threshold_kind = 'any' THEN
      INSERT INTO activity_sequence_runs(step_id, state) VALUES (rec.step_id, 'queued');
      CONTINUE;
    END IF;

    -- Count matching events on the same source activity.
    SELECT COUNT(*) INTO v_match_count
    FROM activity_events ev
    WHERE ev.activity_id = rec.source_activity_id
      AND ev.event_kind = rec.event_kind
      AND ev.is_concluded = TRUE
      AND (rec.outcome IS NULL OR rec.outcome = ''
           OR ev.outcome ? rec.outcome
           OR (ev.outcome ->> 'outcome') = rec.outcome
           OR (ev.outcome ->> 'kind')    = rec.outcome);

    IF rec.threshold_kind = 'absolute_count' THEN
      IF v_match_count >= COALESCE(rec.threshold_value, 1) THEN
        INSERT INTO activity_sequence_runs(step_id, state) VALUES (rec.step_id, 'queued');
      END IF;
    ELSIF rec.threshold_kind = 'percent_of_target' THEN
      SELECT COUNT(*) INTO v_total_for_activity
      FROM activity_events ev
      WHERE ev.activity_id = rec.source_activity_id;
      IF v_total_for_activity > 0 THEN
        v_ratio := v_match_count::NUMERIC / v_total_for_activity::NUMERIC;
        IF v_ratio >= COALESCE(rec.threshold_value, 1) / 100.0 THEN
          INSERT INTO activity_sequence_runs(step_id, state) VALUES (rec.step_id, 'queued');
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS activity_event_evaluate_sequences ON activity_events;
CREATE TRIGGER activity_event_evaluate_sequences
  AFTER INSERT OR UPDATE OF is_concluded, outcome ON activity_events
  FOR EACH ROW EXECUTE FUNCTION tg_activity_event_evaluate_sequences();

-- ─────────────────────────────────────────────────────────────
-- (d) materialise_sequence_run
--
-- Creates a downstream campaign_activities row using the step's
-- target_activity_template_key + target_activity_kind +
-- target_payload, then marks the run materialised.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION materialise_sequence_run(p_run_id BIGINT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step       activity_sequence_steps%ROWTYPE;
  v_seq        activity_sequences%ROWTYPE;
  v_section    section_plans%ROWTYPE;
  v_source     campaign_activities%ROWTYPE;
  v_run        activity_sequence_runs%ROWTYPE;
  v_title      TEXT;
  v_new_id     INT;
BEGIN
  SELECT * INTO v_run FROM activity_sequence_runs WHERE run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_run.state <> 'queued' THEN
    RAISE EXCEPTION 'run % not in queued state (state=%)', p_run_id, v_run.state;
  END IF;

  SELECT * INTO v_step FROM activity_sequence_steps WHERE step_id = v_run.step_id;
  SELECT * INTO v_seq  FROM activity_sequences      WHERE sequence_id = v_step.sequence_id;
  SELECT * INTO v_section FROM section_plans        WHERE section_plan_id = v_seq.section_plan_id;

  IF v_step.source_activity_id IS NOT NULL THEN
    SELECT * INTO v_source FROM campaign_activities WHERE activity_id = v_step.source_activity_id;
  END IF;

  v_title := COALESCE(
    v_step.target_payload ->> 'title',
    CASE
      WHEN v_source.title IS NOT NULL
      THEN v_source.title || ' — follow-up (' || v_step.target_activity_kind || ')'
      ELSE 'Sequence step (' || v_step.target_activity_kind || ')'
    END
  );

  INSERT INTO campaign_activities (
    campaign_id, section_plan_id, title, description,
    template_key, activity_kind, is_custom
  )
  VALUES (
    v_section.campaign_id, v_section.section_plan_id, v_title,
    COALESCE(v_step.target_payload ->> 'description', NULL),
    v_step.target_activity_template_key,
    v_step.target_activity_kind,
    TRUE
  )
  RETURNING activity_id INTO v_new_id;

  UPDATE activity_sequence_runs
     SET state = 'materialised',
         materialised_activity_id = v_new_id,
         notes = COALESCE(notes, '') || 'Materialised at ' || now()::TEXT
   WHERE run_id = p_run_id;

  RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE activity_sequence_runs
     SET state = 'failed', notes = COALESCE(notes, '') || E'\nError: ' || SQLERRM
   WHERE run_id = p_run_id;
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION materialise_sequence_run(BIGINT) TO authenticated;
