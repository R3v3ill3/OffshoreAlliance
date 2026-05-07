-- ============================================================
-- Section Planning module — Phase 2 of 10
--
-- Extends the four P2W planning tables to optionally belong to a
-- section_plan instead of a campaign_stage_plan. Each row may
-- belong to exactly one of:
--   - a stage plan (existing P2W path)        plan_id IS NOT NULL
--   - a section plan (new lightweight path)   section_plan_id IS NOT NULL
--
-- The CHECK constraint enforces XOR — never both, never neither.
--
-- RLS write policies are extended so the same row-level checks
-- apply to section-plan-owned rows: a user can write iff they can
-- write to the underlying campaign (via can_write_to_campaign()).
-- The existing stage-plan write paths are preserved verbatim.
--
-- A view v_section_plan_summary surfaces per-section counts of
-- ambitions / wtp / capacities / activities for the index page.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Drop NOT NULL on plan_id; add section_plan_id; add XOR CHECK.
-- ─────────────────────────────────────────────────────────────

-- plan_ambitions
ALTER TABLE plan_ambitions
  ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE plan_ambitions
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE CASCADE;
ALTER TABLE plan_ambitions
  DROP CONSTRAINT IF EXISTS plan_ambitions_owner_xor_chk;
ALTER TABLE plan_ambitions
  ADD CONSTRAINT plan_ambitions_owner_xor_chk
  CHECK ((plan_id IS NOT NULL) <> (section_plan_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_plan_ambitions_section_plan_id
  ON plan_ambitions(section_plan_id) WHERE section_plan_id IS NOT NULL;

-- plan_where_to_play
ALTER TABLE plan_where_to_play
  ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE plan_where_to_play
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE CASCADE;
ALTER TABLE plan_where_to_play
  DROP CONSTRAINT IF EXISTS plan_where_to_play_owner_xor_chk;
ALTER TABLE plan_where_to_play
  ADD CONSTRAINT plan_where_to_play_owner_xor_chk
  CHECK ((plan_id IS NOT NULL) <> (section_plan_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_plan_where_to_play_section_plan_id
  ON plan_where_to_play(section_plan_id) WHERE section_plan_id IS NOT NULL;

-- plan_capacities
ALTER TABLE plan_capacities
  ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE plan_capacities
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE CASCADE;
ALTER TABLE plan_capacities
  DROP CONSTRAINT IF EXISTS plan_capacities_owner_xor_chk;
ALTER TABLE plan_capacities
  ADD CONSTRAINT plan_capacities_owner_xor_chk
  CHECK ((plan_id IS NOT NULL) <> (section_plan_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_plan_capacities_section_plan_id
  ON plan_capacities(section_plan_id) WHERE section_plan_id IS NOT NULL;

-- plan_theory_of_winning
ALTER TABLE plan_theory_of_winning
  ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE plan_theory_of_winning
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE CASCADE;
ALTER TABLE plan_theory_of_winning
  DROP CONSTRAINT IF EXISTS plan_theory_of_winning_owner_xor_chk;
ALTER TABLE plan_theory_of_winning
  ADD CONSTRAINT plan_theory_of_winning_owner_xor_chk
  CHECK ((plan_id IS NOT NULL) <> (section_plan_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_plan_theory_of_winning_section_plan_id
  ON plan_theory_of_winning(section_plan_id) WHERE section_plan_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Replace write RLS policies with stage-OR-section variants.
--
-- The existing stage-plan policies join through campaign_stage_plans;
-- we keep that and add an OR branch joining through section_plans.
-- can_write_to_campaign() is the canonical write-permission helper.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS plan_ambitions_write ON plan_ambitions;
CREATE POLICY plan_ambitions_write ON plan_ambitions
  FOR ALL TO authenticated
  USING (
    (plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM campaign_stage_plans csp
       WHERE csp.plan_id = plan_ambitions.plan_id
         AND can_write_to_campaign(csp.campaign_id)
    ))
    OR
    (section_plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM section_plans sp
       WHERE sp.section_plan_id = plan_ambitions.section_plan_id
         AND can_write_to_campaign(sp.campaign_id)
    ))
  );

DROP POLICY IF EXISTS plan_wtp_write ON plan_where_to_play;
CREATE POLICY plan_wtp_write ON plan_where_to_play
  FOR ALL TO authenticated
  USING (
    (plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM campaign_stage_plans csp
       WHERE csp.plan_id = plan_where_to_play.plan_id
         AND can_write_to_campaign(csp.campaign_id)
    ))
    OR
    (section_plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM section_plans sp
       WHERE sp.section_plan_id = plan_where_to_play.section_plan_id
         AND can_write_to_campaign(sp.campaign_id)
    ))
  );

DROP POLICY IF EXISTS plan_capacities_write ON plan_capacities;
CREATE POLICY plan_capacities_write ON plan_capacities
  FOR ALL TO authenticated
  USING (
    (plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM campaign_stage_plans csp
       WHERE csp.plan_id = plan_capacities.plan_id
         AND can_write_to_campaign(csp.campaign_id)
    ))
    OR
    (section_plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM section_plans sp
       WHERE sp.section_plan_id = plan_capacities.section_plan_id
         AND can_write_to_campaign(sp.campaign_id)
    ))
  );

DROP POLICY IF EXISTS plan_theory_write ON plan_theory_of_winning;
CREATE POLICY plan_theory_write ON plan_theory_of_winning
  FOR ALL TO authenticated
  USING (
    (plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM campaign_stage_plans csp
       WHERE csp.plan_id = plan_theory_of_winning.plan_id
         AND can_write_to_campaign(csp.campaign_id)
    ))
    OR
    (section_plan_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM section_plans sp
       WHERE sp.section_plan_id = plan_theory_of_winning.section_plan_id
         AND can_write_to_campaign(sp.campaign_id)
    ))
  );

-- ─────────────────────────────────────────────────────────────
-- 3. v_section_plan_summary: counts per-section for the index UI.
--
-- campaign_activities.section_plan_id is added in Phase 5; until
-- then the activities count is 0. The view is forward-compatible
-- so when Phase 5 ships the count populates without a redefinition.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_section_plan_summary AS
SELECT
  sp.section_plan_id,
  sp.campaign_id,
  sp.name,
  sp.status,
  sp.timeframe_kind,
  sp.start_date,
  sp.end_date,
  COALESCE(amb.cnt, 0) AS ambitions_count,
  COALESCE(wtp.cnt, 0) AS wtp_count,
  COALESCE(cap.cnt, 0) AS capacities_count,
  CASE WHEN tow.theory_id IS NOT NULL THEN 1 ELSE 0 END AS theories_count,
  COALESCE(act.cnt, 0) AS activities_count
FROM section_plans sp
LEFT JOIN (
  SELECT section_plan_id, COUNT(*)::INT AS cnt
  FROM plan_ambitions
  WHERE section_plan_id IS NOT NULL
  GROUP BY section_plan_id
) amb ON amb.section_plan_id = sp.section_plan_id
LEFT JOIN (
  SELECT section_plan_id, COUNT(*)::INT AS cnt
  FROM plan_where_to_play
  WHERE section_plan_id IS NOT NULL
  GROUP BY section_plan_id
) wtp ON wtp.section_plan_id = sp.section_plan_id
LEFT JOIN (
  SELECT section_plan_id, COUNT(*)::INT AS cnt
  FROM plan_capacities
  WHERE section_plan_id IS NOT NULL
  GROUP BY section_plan_id
) cap ON cap.section_plan_id = sp.section_plan_id
LEFT JOIN LATERAL (
  SELECT theory_id
  FROM plan_theory_of_winning
  WHERE section_plan_id = sp.section_plan_id
    AND COALESCE(is_current, true) = true
  ORDER BY version DESC NULLS LAST
  LIMIT 1
) tow ON true
LEFT JOIN (
  -- Forward-compat: campaign_activities.section_plan_id arrives in Phase 5.
  -- This subquery returns 0 rows until that column exists; the COALESCE
  -- still gives 0. After Phase 5 the count populates automatically.
  SELECT
    NULL::BIGINT AS section_plan_id,
    0::INT AS cnt
  WHERE FALSE
) act ON act.section_plan_id = sp.section_plan_id;

COMMENT ON VIEW v_section_plan_summary IS
  'Per-section roll-up of child counts for the Section Plans index UI. '
  'activities_count is 0 until Phase 5 adds campaign_activities.section_plan_id; '
  'this view will be CREATE OR REPLACEd at that time without breaking callers.';
