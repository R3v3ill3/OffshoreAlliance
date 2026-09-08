-- ============================================================
-- Phase 3 of campaigns review plan: campaign-level ambitions.
--
-- Today the planning model only knows STAGE-LEVEL ambitions
-- (plan_ambitions, scoped per campaign_stage_plans row). The
-- "what does this campaign aim to achieve overall" intent has no
-- home, so it gets lost between the wizard and the stage planner.
--
-- This migration introduces a small `campaign_ambitions` table
-- that records the four canonical campaign-wide goal categories:
--   - membership          (density % or member count)
--   - member_leaders      (contacts / activists / delegates / bargaining
--                          reps / HSRs target counts)
--   - activism            (% supportive participation in actions)
--   - industrial_outcomes (pay rise %, benchmarks, free-form)
--
-- Stage-level plan_ambitions get an OPTIONAL parent_campaign_ambition_id
-- so progress can roll up. The campaign_ambition_progress view
-- aggregates linked stage progress per (campaign, campaign ambition).
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_ambitions (
  campaign_ambition_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL
    CHECK (category IN (
      'membership', 'member_leaders', 'activism', 'industrial_outcomes'
    )),
  -- Free-form refinement within a category (e.g. "delegates", "bargaining_reps",
  -- "pay_rise", "supportive_participation"). The wizard surfaces curated options
  -- per category but custom strings are accepted to avoid blocking unusual
  -- campaign goals.
  subcategory VARCHAR(80),
  -- Display label as the user typed it. Distinct from subcategory so two
  -- ambitions with the same subcategory (e.g. two "custom" entries) can be
  -- distinguished in UI.
  label VARCHAR(200) NOT NULL,
  target_value VARCHAR(50),
  target_value_max VARCHAR(50),
  target_unit VARCHAR(30),
  target_date DATE,
  current_value VARCHAR(50),
  current_value_overridden BOOLEAN NOT NULL DEFAULT false,
  current_value_override_reason TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_campaign ON campaign_ambitions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ca_campaign_category
  ON campaign_ambitions(campaign_id, category);

CREATE OR REPLACE TRIGGER trg_campaign_ambitions_updated_at
  BEFORE UPDATE ON campaign_ambitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE campaign_ambitions IS
  'Campaign-level (cross-stage) goals. Categories: membership, member_leaders, activism, industrial_outcomes. Stage-level plan_ambitions can opt-in to roll up by setting parent_campaign_ambition_id.';

-- Stage ambitions can roll up to a campaign ambition when set.
ALTER TABLE plan_ambitions
  ADD COLUMN IF NOT EXISTS parent_campaign_ambition_id INT
    REFERENCES campaign_ambitions(campaign_ambition_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_ambitions_parent_campaign_ambition
  ON plan_ambitions(parent_campaign_ambition_id)
  WHERE parent_campaign_ambition_id IS NOT NULL;

COMMENT ON COLUMN plan_ambitions.parent_campaign_ambition_id IS
  'Optional FK to campaign_ambitions: when set, this stage ambition contributes to the named campaign-wide goal and is included in campaign_ambition_progress.';

-- ── Rollup view: per (campaign, campaign ambition) progress ─────────────────
--
-- Counts how many linked stage ambitions exist and how many are achieved,
-- so a Phase 9 dashboard can show coherence and progress at a glance. Does
-- not auto-set current_value on the campaign ambition (manual + overridable
-- so it matches plan_ambitions semantics).
CREATE OR REPLACE VIEW campaign_ambition_progress
WITH (security_invoker = true)
AS
SELECT
  ca.campaign_id,
  ca.campaign_ambition_id,
  ca.category,
  ca.subcategory,
  ca.label,
  ca.target_value,
  ca.target_value_max,
  ca.target_unit,
  ca.target_date,
  ca.current_value,
  ca.current_value_overridden,
  COUNT(pa.ambition_id) AS linked_stage_ambition_count,
  COUNT(pa.ambition_id) FILTER (WHERE pa.is_achieved IS TRUE)
    AS linked_stage_ambition_achieved_count,
  CASE
    WHEN COUNT(pa.ambition_id) > 0 THEN
      ROUND(
        100.0 * COUNT(pa.ambition_id) FILTER (WHERE pa.is_achieved IS TRUE)
        / COUNT(pa.ambition_id),
        1
      )
    ELSE NULL
  END AS linked_stage_achievement_pct
FROM campaign_ambitions ca
LEFT JOIN plan_ambitions pa
  ON pa.parent_campaign_ambition_id = ca.campaign_ambition_id
GROUP BY
  ca.campaign_id, ca.campaign_ambition_id, ca.category, ca.subcategory, ca.label,
  ca.target_value, ca.target_value_max, ca.target_unit, ca.target_date,
  ca.current_value, ca.current_value_overridden;

GRANT SELECT ON campaign_ambition_progress TO authenticated;

COMMENT ON VIEW campaign_ambition_progress IS
  'Per (campaign, campaign ambition) rollup: linked stage ambition counts and the share that have been marked is_achieved. Used by Phase 9 reporting to show cross-stage coherence.';

-- RLS — same pattern as the rest of the campaign_* tables.
ALTER TABLE campaign_ambitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read campaign_ambitions" ON campaign_ambitions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert campaign_ambitions" ON campaign_ambitions FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update campaign_ambitions" ON campaign_ambitions FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete campaign_ambitions" ON campaign_ambitions FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
