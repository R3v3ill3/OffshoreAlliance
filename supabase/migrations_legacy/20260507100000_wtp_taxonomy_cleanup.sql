-- ============================================================
-- Phase 8 of campaigns review plan: Where-to-Play taxonomy
-- cleanup + ambition linkage.
--
-- Three changes:
--
-- 1. The Communications Platforms category currently mixes channels
--    (email, SMS, phone, etc.) with capacity-shaped options
--    ("Workplace Organising Committee meetings", "Structured Organising
--    Conversations"). Those two are not channels — they're recurring
--    organising practices that belong on the Capacities step. We
--    soft-deprecate them on wtp_options (is_active=false) and seed
--    matching capacity_options across the stages that use them, then
--    backfill any existing plan_where_to_play rows over to plan_capacities
--    so historical data isn't lost.
--
-- 2. The "Contact Method Priority" category duplicates the priority
--    field that's already on every selected choice (plan_where_to_play.
--    priority 1-3). Deprecate the category — its rows stay readable
--    on existing plans but new plans no longer surface it.
--
-- 3. plan_where_to_play.linked_ambition_id (nullable FK to
--    plan_ambitions) so each W2P choice can directly point at the
--    stage ambition it serves — completing the Phase 7 stage→campaign
--    rollup story by giving where-to-play its own ambition link.
-- ============================================================

-- ── 3. linked_ambition_id ───────────────────────────────────────────────────
ALTER TABLE plan_where_to_play
  ADD COLUMN IF NOT EXISTS linked_ambition_id INTEGER
    REFERENCES plan_ambitions(ambition_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_where_to_play_linked_ambition
  ON plan_where_to_play(linked_ambition_id)
  WHERE linked_ambition_id IS NOT NULL;

COMMENT ON COLUMN plan_where_to_play.linked_ambition_id IS
  'Optional FK: the stage ambition this where-to-play choice serves. Phase 8 — pairs with plan_ambitions.parent_campaign_ambition_id (Phase 3) to give the planner end-to-end coherence (campaign ambition → stage ambition → focus area).';

-- ── 1a. Seed capacity_options for WOC / SOC across all stages ──────────────
-- The two options used to live on wtp Communication Platforms; making them
-- selectable on Capacities for every stage means organisers don't have to
-- recreate them each campaign. linked_wtp_categories left empty since they
-- no longer originate from a WTP category.
DO $$
DECLARE
  s INT;
BEGIN
  FOR s IN 1..6 LOOP
    INSERT INTO capacity_options
      (stage_number, category, option_text, description, is_system_default, is_active)
    VALUES
      (
        s,
        'organising_practice',
        'Workplace Organising Committee (WOC) meetings',
        'Regular WOC meetings to surface issues, plan actions, and develop member leadership',
        TRUE,
        TRUE
      )
    ON CONFLICT DO NOTHING;
    INSERT INTO capacity_options
      (stage_number, category, option_text, description, is_system_default, is_active)
    VALUES
      (
        s,
        'organising_practice',
        'Structured Organising Conversations (SOC)',
        'Formal 1-on-1 conversations using a consistent script — used to map, recruit, and develop',
        TRUE,
        TRUE
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── 1b. Backfill plan_capacities from existing plan_where_to_play rows ─────
-- For every plan_where_to_play row that references the deprecated WOC or SOC
-- options, insert a corresponding plan_capacities row on the same plan, with
-- custom_text preserving the original option text. We use INSERT … SELECT …
-- WHERE NOT EXISTS to keep the migration idempotent.
INSERT INTO plan_capacities (plan_id, custom_text, status, sort_order, created_at)
SELECT
  pwtp.plan_id,
  wo.option_text AS custom_text,
  'needed' AS status,
  pwtp.sort_order,
  pwtp.created_at
FROM plan_where_to_play pwtp
JOIN wtp_options wo ON wo.option_id = pwtp.wtp_option_id
WHERE wo.option_text IN (
        'WOC (Workplace Organising Committee) meetings',
        'Structured Organising Conversations (SOC)'
      )
  AND NOT EXISTS (
        SELECT 1
        FROM plan_capacities pc
        WHERE pc.plan_id = pwtp.plan_id
          AND pc.custom_text = wo.option_text
      );

-- ── 1c. Soft-deprecate the deprecated wtp_options ──────────────────────────
UPDATE wtp_options
   SET is_active = FALSE
 WHERE option_text IN (
         'WOC (Workplace Organising Committee) meetings',
         'Structured Organising Conversations (SOC)'
       );

-- Existing plan_where_to_play rows referencing them stay readable (the join
-- still resolves to the now-inactive option_text) — historical data is
-- preserved. New selections won't surface them because the WTP picker
-- filters wtp_options on is_active.

-- ── 2. Soft-deprecate the Contact Method Priority category ─────────────────
-- The per-row priority field on plan_where_to_play (1=high, 2=medium, 3=low)
-- already captures this dimension on every selected option. The category is
-- redundant; deprecate it without touching existing plan rows.
UPDATE wtp_categories
   SET is_active = FALSE
 WHERE category_name = 'Contact Method Priority';

-- ── Visibility group hint for the redesigned panel UI ───────────────────────
-- Phase 8 splits the remaining categories into two groups in the panel:
-- "Focus" (who/where to focus on — geography, employer, sector, contacts)
-- vs. "Approach" (how to engage — narrative, channels, education, intensity,
-- tactics). The grouping is pure presentation in the React component (no DB
-- column needed) and is encoded in WhereToPlayPanel's `wtpCategoryGroup`
-- helper. Documenting here so the rule is easy to find when seeding new
-- categories later.
