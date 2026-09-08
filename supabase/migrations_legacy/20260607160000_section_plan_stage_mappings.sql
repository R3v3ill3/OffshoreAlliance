-- ============================================================
-- Section Planning module — Phase 8 of 10
--
-- section_plan_stage_mappings — AI-generated mapping of subject
-- (ambition / activity / wtp / capacity / soc) → P2W stage 1..11
-- with confidence + rationale, plus a human_confirmed flag.
--
-- v_campaign_section_stage_coverage — pivots mappings by stage so
-- the campaign overview can render a chip strip showing which
-- stages each section plan covers.
-- ============================================================

CREATE TABLE IF NOT EXISTS section_plan_stage_mappings (
  mapping_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('ambition','activity','wtp','capacity','soc')),
  subject_id BIGINT NOT NULL,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 11),
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  rationale TEXT,
  model TEXT,
  prompt_snapshot JSONB,
  human_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_plan_id, subject_kind, subject_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_section_stage_mappings_section
  ON section_plan_stage_mappings(section_plan_id);
CREATE INDEX IF NOT EXISTS idx_section_stage_mappings_stage
  ON section_plan_stage_mappings(stage_number);

ALTER TABLE section_plan_stage_mappings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY section_plan_stage_mappings_read ON section_plan_stage_mappings FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY section_plan_stage_mappings_write ON section_plan_stage_mappings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_stage_mappings.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE OR REPLACE VIEW v_campaign_section_stage_coverage AS
SELECT
  sp.campaign_id,
  sp.section_plan_id,
  sp.name AS section_name,
  sp.status AS section_status,
  m.stage_number,
  COUNT(*)::INT AS subject_count,
  ARRAY_AGG(DISTINCT m.subject_kind) AS subject_kinds,
  AVG(m.confidence)::NUMERIC(3,2) AS avg_confidence,
  BOOL_OR(m.human_confirmed) AS any_confirmed
FROM section_plans sp
JOIN section_plan_stage_mappings m ON m.section_plan_id = sp.section_plan_id
GROUP BY sp.campaign_id, sp.section_plan_id, sp.name, sp.status, m.stage_number;

COMMENT ON VIEW v_campaign_section_stage_coverage IS
  'One row per (section, stage) where the section has at least one mapped '
  'subject; used by the campaign overview chip strip to show which P2W '
  'stages each section plan covers.';
