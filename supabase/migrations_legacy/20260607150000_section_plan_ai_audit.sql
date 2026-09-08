-- ============================================================
-- Section Planning module — Phase 7 of 10
--
-- section_plan_ai_events — append-only audit of every AI call made
-- against a section plan. Powers reproducibility + cost tracking.
-- One row per (surface, request); JSONB snapshots make later
-- analysis painless without forcing a normalised schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS section_plan_ai_events (
  event_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN (
    'situation_chat',
    'ambition_tighten',
    'tow_check',
    'sequence_suggest',
    'soc_coach',
    'stage_mapping'
  )),
  prompt_snapshot JSONB,
  response_snapshot JSONB,
  model TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_section_plan_ai_events_section
  ON section_plan_ai_events(section_plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_section_plan_ai_events_surface
  ON section_plan_ai_events(surface, created_at DESC);

ALTER TABLE section_plan_ai_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY section_plan_ai_events_read ON section_plan_ai_events FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- No general write policy. Inserts go via API routes using the service-role
  -- key (bypassing RLS) so the audit row is always written even when the
  -- caller's role lacks direct insert grants.
END $$;
