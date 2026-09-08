-- ============================================================
-- Migration: plan_ambitions.ambition_scope
--
-- Separates campaign-setup ambitions (non-worker-trackable,
-- e.g. "100% names/emails/phones", "identify 10-30 worker units",
-- "complete mapping for X worksites") from worker-assessable
-- ambitions (per-worker ratings rolled up, e.g. MSD support %,
-- membership density, LoC survey completion).
--
-- Only worker_assessable ambitions can be linked to campaign
-- activities (assessment templates) for ratings aggregation.
-- Campaign-setup ambitions are tracked via plan_ambitions
-- current_value + gate UI edits only.
--
-- Backfill logic:
--   * Rows linked to an ambition_options row whose category is
--     in the known "setup" list => 'campaign_setup'.
--   * Custom (no option_id) rows with metric_type in ('text','date')
--     => 'campaign_setup' (treated as milestone / evidence gates).
--   * Everything else => 'worker_assessable'.
-- ============================================================

-- 1. Add the column on plan_ambitions (nullable for safe backfill)
ALTER TABLE plan_ambitions
  ADD COLUMN IF NOT EXISTS ambition_scope VARCHAR(20);

-- 2. Backfill setup scope from linked ambition_options.category
UPDATE plan_ambitions pa
SET ambition_scope = 'campaign_setup'
FROM ambition_options ao
WHERE pa.ambition_option_id = ao.option_id
  AND pa.ambition_scope IS NULL
  AND ao.category IN (
    'contact_targets',
    'contact_identification',
    'unit_identification',
    'mapping',
    'timeline',
    'education',
    'bargaining_prep',
    'bargaining',
    'protection',
    'logistics'
  );

-- 3. Custom ambitions (no option) with text/date metrics => setup
UPDATE plan_ambitions
SET ambition_scope = 'campaign_setup'
WHERE ambition_scope IS NULL
  AND ambition_option_id IS NULL
  AND metric_type IN ('text', 'date');

-- 4. Everything else => worker_assessable
UPDATE plan_ambitions
SET ambition_scope = 'worker_assessable'
WHERE ambition_scope IS NULL;

-- 5. Enforce NOT NULL + CHECK + default going forward
ALTER TABLE plan_ambitions
  ALTER COLUMN ambition_scope SET NOT NULL,
  ALTER COLUMN ambition_scope SET DEFAULT 'worker_assessable';

ALTER TABLE plan_ambitions
  DROP CONSTRAINT IF EXISTS plan_ambitions_scope_chk;

ALTER TABLE plan_ambitions
  ADD CONSTRAINT plan_ambitions_scope_chk
  CHECK (ambition_scope IN ('campaign_setup', 'worker_assessable'));

CREATE INDEX IF NOT EXISTS idx_plan_ambitions_scope
  ON plan_ambitions(ambition_scope);

COMMENT ON COLUMN plan_ambitions.ambition_scope IS
  'campaign_setup = not tracked per worker (lists, unit identification, timelines). '
  'worker_assessable = aggregated from campaign_activity_ratings via activity_ambitions.';

-- 6. Mirror default on ambition_options so the UI can pick the right
--    scope when a user selects a suggested ambition.
ALTER TABLE ambition_options
  ADD COLUMN IF NOT EXISTS default_scope VARCHAR(20);

UPDATE ambition_options
SET default_scope = 'campaign_setup'
WHERE default_scope IS NULL
  AND category IN (
    'contact_targets',
    'contact_identification',
    'unit_identification',
    'mapping',
    'timeline',
    'education',
    'bargaining_prep',
    'bargaining',
    'protection',
    'logistics'
  );

UPDATE ambition_options
SET default_scope = 'worker_assessable'
WHERE default_scope IS NULL;

ALTER TABLE ambition_options
  ALTER COLUMN default_scope SET NOT NULL,
  ALTER COLUMN default_scope SET DEFAULT 'worker_assessable';

ALTER TABLE ambition_options
  DROP CONSTRAINT IF EXISTS ambition_options_default_scope_chk;

ALTER TABLE ambition_options
  ADD CONSTRAINT ambition_options_default_scope_chk
  CHECK (default_scope IN ('campaign_setup', 'worker_assessable'));

COMMENT ON COLUMN ambition_options.default_scope IS
  'Default scope applied when a user picks this suggested ambition. '
  'Can be overridden per plan_ambition.';
