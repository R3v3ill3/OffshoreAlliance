-- ============================================================
-- Phase 1 of Bargaining to Win: relax stage_number range to 1–11
-- and add campaign_stage_plans.phase column.
-- ============================================================
-- Audited tables from 0014_planning_tables.sql that carry
-- CHECK (stage_number BETWEEN 1 AND 6):
--   • ambition_options
--   • capacity_options
--   • management_system_options
--   • campaign_stage_plans          ← also drops/recreates UNIQUE
--   • stage_timeline_targets        ← also drops/recreates UNIQUE
-- wtp_categories.applies_to_stages is INTEGER[] — no CHECK constraint,
-- no change needed.
-- ============================================================

-- ── ambition_options ─────────────────────────────────────────────────────
ALTER TABLE ambition_options
  DROP CONSTRAINT IF EXISTS ambition_options_stage_number_check;
ALTER TABLE ambition_options
  ADD CONSTRAINT ambition_options_stage_number_check
    CHECK (stage_number BETWEEN 1 AND 11);

-- ── capacity_options ─────────────────────────────────────────────────────
ALTER TABLE capacity_options
  DROP CONSTRAINT IF EXISTS capacity_options_stage_number_check;
ALTER TABLE capacity_options
  ADD CONSTRAINT capacity_options_stage_number_check
    CHECK (stage_number BETWEEN 1 AND 11);

-- ── management_system_options ────────────────────────────────────────────
ALTER TABLE management_system_options
  DROP CONSTRAINT IF EXISTS management_system_options_stage_number_check;
ALTER TABLE management_system_options
  ADD CONSTRAINT management_system_options_stage_number_check
    CHECK (stage_number BETWEEN 1 AND 11);

-- ── campaign_stage_plans ─────────────────────────────────────────────────
-- 1. Relax the stage_number check.
ALTER TABLE campaign_stage_plans
  DROP CONSTRAINT IF EXISTS campaign_stage_plans_stage_number_check;
ALTER TABLE campaign_stage_plans
  ADD CONSTRAINT campaign_stage_plans_stage_number_check
    CHECK (stage_number BETWEEN 1 AND 11);

-- 2. Add the phase column (NOT NULL, defaults to preparing_to_bargain so
--    all existing rows get the correct Phase-1 label automatically).
ALTER TABLE campaign_stage_plans
  ADD COLUMN IF NOT EXISTS phase campaign_phase_enum NOT NULL DEFAULT 'preparing_to_bargain';

-- 3. Backfill: all existing rows have stage_number 1–6 → preparing_to_bargain.
--    This is a no-op because the DEFAULT already covers it, but is explicit
--    for clarity and forward safety if the column was added with a nullable default.
UPDATE campaign_stage_plans
SET phase = 'preparing_to_bargain'
WHERE stage_number BETWEEN 1 AND 6;

-- 4. The UNIQUE(campaign_id, stage_number) constraint is already wide enough
--    — it already covers any stage number. No need to drop/recreate it.
--    (The constraint was created in 0014_planning_tables.sql as part of the
--    table definition; it has no stage_number range restriction.)

-- ── stage_timeline_targets ───────────────────────────────────────────────
ALTER TABLE stage_timeline_targets
  DROP CONSTRAINT IF EXISTS stage_timeline_targets_stage_number_check;
ALTER TABLE stage_timeline_targets
  ADD CONSTRAINT stage_timeline_targets_stage_number_check
    CHECK (stage_number BETWEEN 1 AND 11);

-- The UNIQUE(timeline_id, stage_number) on stage_timeline_targets is also
-- already range-agnostic — no change required.

COMMENT ON COLUMN campaign_stage_plans.phase IS
  'Which bargaining lifecycle phase this stage plan belongs to. Invariant: preparing_to_bargain IFF stage_number BETWEEN 1 AND 6; bargaining_to_win IFF stage_number BETWEEN 7 AND 11. Enforced by trigger in 20260510120000_stage_phase_invariants.sql.';
