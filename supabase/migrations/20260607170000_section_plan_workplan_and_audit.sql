-- ============================================================
-- Section Planning module — Phase 9 of 10
--
-- (a) section_plan_revision_notes — append-only audit of subject
--     edits (mirrors plan_revision_notes for the section scope).
-- (b) section_plan_workplan_targets — per-day target rows for the
--     Mon–Fri (or extended) workplan grid (artefact C).
-- (c) v_section_plan_workplan — joins targets with completion
--     counts derived from activity_events.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (a) section_plan_revision_notes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_plan_revision_notes (
  revision_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN (
    'ambition','wtp','capacity','theory','soc','activity','snippet','workforce','workplan'
  )),
  subject_id BIGINT,
  change_summary TEXT NOT NULL,
  revised_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_section_revision_notes_section
  ON section_plan_revision_notes(section_plan_id);
CREATE INDEX IF NOT EXISTS idx_section_revision_notes_revised_at
  ON section_plan_revision_notes(revised_at DESC);

ALTER TABLE section_plan_revision_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  BEGIN EXECUTE 'CREATE POLICY section_revision_notes_read ON section_plan_revision_notes FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY section_revision_notes_insert ON section_plan_revision_notes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_revision_notes.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (b) section_plan_workplan_targets — Mon-Fri grid backing rows.
--     day_of_week: 0=Sun … 6=Sat (Postgres EXTRACT DOW convention).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_plan_workplan_targets (
  target_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  target_date DATE NOT NULL,
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  activity_label TEXT,
  calls_target INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workplan_target_label_or_activity_chk
    CHECK (activity_id IS NOT NULL OR (activity_label IS NOT NULL AND activity_label <> ''))
);
CREATE INDEX IF NOT EXISTS idx_workplan_targets_section_date
  ON section_plan_workplan_targets(section_plan_id, target_date);
CREATE INDEX IF NOT EXISTS idx_workplan_targets_activity
  ON section_plan_workplan_targets(activity_id) WHERE activity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tg_workplan_targets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS workplan_targets_set_updated_at ON section_plan_workplan_targets;
CREATE TRIGGER workplan_targets_set_updated_at BEFORE UPDATE ON section_plan_workplan_targets
  FOR EACH ROW EXECUTE FUNCTION tg_workplan_targets_set_updated_at();

ALTER TABLE section_plan_workplan_targets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  BEGIN EXECUTE 'CREATE POLICY workplan_targets_read ON section_plan_workplan_targets FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY workplan_targets_write ON section_plan_workplan_targets FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_workplan_targets.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (c) v_section_plan_workplan — pivot-friendly view.
--
-- For each target row, returns the row plus a completed_count
-- derived from concluded activity_events on the linked activity
-- whose scheduled_at falls on the target_date (server local
-- date). When activity_id is NULL, completed_count is NULL.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_section_plan_workplan AS
SELECT
  t.target_id,
  t.section_plan_id,
  t.day_of_week,
  t.target_date,
  t.activity_id,
  t.activity_label,
  t.calls_target,
  t.notes,
  ca.title AS activity_title,
  ca.activity_kind,
  CASE WHEN t.activity_id IS NULL THEN NULL ELSE COALESCE(ev.completed, 0) END AS completed_count,
  COALESCE(ev.outcomes_summary, NULL) AS outcomes_summary
FROM section_plan_workplan_targets t
LEFT JOIN campaign_activities ca ON ca.activity_id = t.activity_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE e.is_concluded = TRUE)::INT AS completed,
    STRING_AGG(DISTINCT NULLIF(e.outcome ->> 'outcome', ''), ', ') AS outcomes_summary
  FROM activity_events e
  WHERE e.activity_id = t.activity_id
    AND e.scheduled_at::date = t.target_date
) ev ON TRUE;

COMMENT ON VIEW v_section_plan_workplan IS
  'Workplan grid view: per-target completed_count (NULL if no linked activity) '
  'plus an outcomes summary string aggregated from concluded events.';
