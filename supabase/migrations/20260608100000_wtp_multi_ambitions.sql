-- ============================================================
-- Section Planning module — WTP multi-ambition + section ambitions
--
-- The original plan_where_to_play.linked_ambition_id only allowed one
-- ambition per row. This migration introduces:
--   1. plan_wtp_ambitions — M:N row × ambition for "this row supports
--      these ambition(s)".
--   2. plan_wtp_section_ambitions — per (section_plan, category)
--      defaults — a section-level "Supports ambition(s)" applied to all
--      rows in that category unless the row overrides.
--
-- Existing linked_ambition_id values are preserved verbatim AND seeded
-- into plan_wtp_ambitions so callers reading via the new path still see
-- them. linked_ambition_id stays as a backwards-compat single pointer.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. plan_wtp_ambitions — row × ambition
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_wtp_ambitions (
  wtp_ambition_id BIGSERIAL PRIMARY KEY,
  wtp_id INT NOT NULL REFERENCES plan_where_to_play(wtp_id) ON DELETE CASCADE,
  ambition_id INT NOT NULL REFERENCES plan_ambitions(ambition_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wtp_id, ambition_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_wtp_ambitions_wtp ON plan_wtp_ambitions(wtp_id);
CREATE INDEX IF NOT EXISTS idx_plan_wtp_ambitions_ambition ON plan_wtp_ambitions(ambition_id);

ALTER TABLE plan_wtp_ambitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY plan_wtp_ambitions_read ON plan_wtp_ambitions FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- Write permission piggy-backs on the parent row's write permission via plan_where_to_play.
  BEGIN EXECUTE 'CREATE POLICY plan_wtp_ambitions_write ON plan_wtp_ambitions FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM plan_where_to_play wtp
    LEFT JOIN section_plans sp ON sp.section_plan_id = wtp.section_plan_id
    LEFT JOIN campaign_stage_plans csp ON csp.plan_id = wtp.plan_id
    WHERE wtp.wtp_id = plan_wtp_ambitions.wtp_id
      AND can_write_to_campaign(COALESCE(sp.campaign_id, csp.campaign_id))
  ))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Seed from existing linked_ambition_id pointers so the new path is a strict
-- superset of the old. ON CONFLICT keeps the migration idempotent.
INSERT INTO plan_wtp_ambitions (wtp_id, ambition_id)
SELECT wtp_id, linked_ambition_id
FROM plan_where_to_play
WHERE linked_ambition_id IS NOT NULL
ON CONFLICT (wtp_id, ambition_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. plan_wtp_section_ambitions — section-level defaults.
--
-- (section_plan_id, wtp_category_id, ambition_id) UNIQUE.
-- A row UI-applies as the section default for every plan_where_to_play
-- row in that category for that section_plan. Rows can still add their
-- own row-level ambitions to override or extend.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_wtp_section_ambitions (
  section_ambition_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  wtp_category_id INT NOT NULL REFERENCES wtp_categories(category_id) ON DELETE CASCADE,
  ambition_id INT NOT NULL REFERENCES plan_ambitions(ambition_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_plan_id, wtp_category_id, ambition_id)
);

CREATE INDEX IF NOT EXISTS idx_wtp_section_ambitions_section
  ON plan_wtp_section_ambitions(section_plan_id);
CREATE INDEX IF NOT EXISTS idx_wtp_section_ambitions_section_cat
  ON plan_wtp_section_ambitions(section_plan_id, wtp_category_id);

ALTER TABLE plan_wtp_section_ambitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY plan_wtp_section_ambitions_read ON plan_wtp_section_ambitions FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY plan_wtp_section_ambitions_write ON plan_wtp_section_ambitions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = plan_wtp_section_ambitions.section_plan_id AND can_write_to_campaign(sp.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMENT ON TABLE plan_wtp_ambitions IS
  'M:N — a where-to-play row supports zero or more ambitions. Seeded from '
  'the legacy plan_where_to_play.linked_ambition_id pointer.';
COMMENT ON TABLE plan_wtp_section_ambitions IS
  'Section-level "Supports ambition(s)" defaults: applied to every row in '
  'the section''s wtp_category unless the row sets its own ambitions.';
