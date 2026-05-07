-- ============================================================
-- Section Planning module — Phase 6 of 10
--
-- (a) Extend campaign_activities activity_kind CHECK to include
--     'site_visit' (alongside the existing kinds).
--
-- (b) woc_meeting_details — per-activity WOC metadata.
--
-- (c) Section SOC schema (artefact B):
--     - section_plan_soc_kind enum
--     - section_plan_socs (per-section authored 7-step script)
--     - section_plan_soc_recordings (per-rep, per-worker capture)
--     - v_section_plan_soc_recording_grid view powering the inline
--       recording grid for SOC 2 rep-walkthrough calls.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (a) site_visit activity kind
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_activity_kind_check;
ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_activity_kind_check
  CHECK (activity_kind IN (
    'task','assessment','industrial_action','phone_bank',
    'sms_survey','woc_meeting','site_visit'
  ));

-- ─────────────────────────────────────────────────────────────
-- (b) woc_meeting_details
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS woc_meeting_details (
  activity_id INT PRIMARY KEY REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  meeting_kind TEXT,
  agenda_template_key TEXT,
  attendees_target_cohort_id INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE woc_meeting_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY woc_meeting_details_read ON woc_meeting_details FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_meeting_details_write ON woc_meeting_details FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM campaign_activities ca WHERE ca.activity_id = woc_meeting_details.activity_id AND can_write_to_campaign(ca.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (c) Section SOC
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'section_plan_soc_kind') THEN
    CREATE TYPE section_plan_soc_kind AS ENUM ('members_general', 'bargaining_reps');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS section_plan_socs (
  soc_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  soc_kind section_plan_soc_kind NOT NULL,
  name TEXT NOT NULL,
  step_1_introduction TEXT,
  step_2_agitation_or_briefing TEXT,
  step_3_hope_or_walkthrough TEXT,
  step_4_call_to_action_or_hope TEXT,
  step_5_mapping_or_clear_ask TEXT,
  step_6_industrial_or_pabo TEXT,
  step_7_inoculation_or_close TEXT,
  industrial_in_scope BOOLEAN NOT NULL DEFAULT TRUE,
  pabo_in_scope BOOLEAN NOT NULL DEFAULT TRUE,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_model TEXT,
  ai_prompt_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_plan_id, soc_kind, name)
);
CREATE INDEX IF NOT EXISTS idx_section_plan_socs_section ON section_plan_socs(section_plan_id);

CREATE OR REPLACE FUNCTION tg_section_plan_socs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS section_plan_socs_set_updated_at ON section_plan_socs;
CREATE TRIGGER section_plan_socs_set_updated_at BEFORE UPDATE ON section_plan_socs
  FOR EACH ROW EXECUTE FUNCTION tg_section_plan_socs_set_updated_at();

ALTER TABLE section_plan_socs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY section_plan_socs_read ON section_plan_socs FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY section_plan_socs_write ON section_plan_socs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_socs.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS section_plan_soc_recordings (
  recording_id BIGSERIAL PRIMARY KEY,
  soc_id BIGINT NOT NULL REFERENCES section_plan_socs(soc_id) ON DELETE CASCADE,
  activity_event_id INT REFERENCES activity_events(event_id) ON DELETE SET NULL,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  no_vote_rating INT CHECK (no_vote_rating IS NULL OR no_vote_rating BETWEEN 1 AND 5),
  pabo_rating INT CHECK (pabo_rating IS NULL OR pabo_rating BETWEEN 1 AND 5),
  member_status_confirmed TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- One recording per (soc, event, worker). When activity_event_id is NULL we
  -- still want one recording per (soc, worker) — handled by partial UNIQUE.
  UNIQUE (soc_id, activity_event_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_soc_recordings_soc ON section_plan_soc_recordings(soc_id);
CREATE INDEX IF NOT EXISTS idx_soc_recordings_worker ON section_plan_soc_recordings(worker_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_soc_recordings_soc_worker_no_event
  ON section_plan_soc_recordings(soc_id, worker_id)
  WHERE activity_event_id IS NULL;

ALTER TABLE section_plan_soc_recordings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY soc_recordings_read ON section_plan_soc_recordings FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY soc_recordings_write ON section_plan_soc_recordings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plan_socs s JOIN section_plans sp ON sp.section_plan_id = s.section_plan_id WHERE s.soc_id = section_plan_soc_recordings.soc_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- v_section_plan_soc_recording_grid
--
-- For a given section_plan, returns one row per (worker_id, soc_id)
-- where the worker is allocated to the section's campaign. Joins
-- the most recent recording (if any) and the worker's current
-- cumulative rating.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_section_plan_soc_recording_grid AS
SELECT
  s.soc_id,
  sp.section_plan_id,
  sp.campaign_id,
  s.soc_kind,
  s.name AS soc_name,
  w.worker_id,
  w.first_name || ' ' || w.last_name AS worker_name,
  w.member_role_type_id,
  cwrs.cumulative_rating AS current_rating,
  r.no_vote_rating,
  r.pabo_rating,
  r.member_status_confirmed,
  r.notes,
  r.recorded_at,
  r.activity_event_id
FROM section_plan_socs s
JOIN section_plans sp ON sp.section_plan_id = s.section_plan_id
JOIN campaign_worker_membership cwm ON cwm.campaign_id = sp.campaign_id
JOIN workers w ON w.worker_id = cwm.worker_id
LEFT JOIN campaign_worker_rating_summary cwrs
  ON cwrs.campaign_id = sp.campaign_id AND cwrs.worker_id = w.worker_id
LEFT JOIN LATERAL (
  SELECT no_vote_rating, pabo_rating, member_status_confirmed, notes,
         recorded_at, activity_event_id
  FROM section_plan_soc_recordings
  WHERE soc_id = s.soc_id AND worker_id = w.worker_id
  ORDER BY recorded_at DESC
  LIMIT 1
) r ON TRUE;

COMMENT ON VIEW v_section_plan_soc_recording_grid IS
  'Per-soc, per-worker grid powering the SOC 2 rep-walkthrough recording UI. '
  'Each row carries the worker''s current rating and the most recent '
  'section_plan_soc_recordings row (if any).';
