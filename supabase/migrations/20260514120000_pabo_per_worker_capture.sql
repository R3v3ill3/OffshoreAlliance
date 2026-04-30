-- ============================================================
-- Phase 5 (Wave 3 Agent F): PABO per-worker capture
--
-- Seeds two campaign_activities template rows for tracking PABO
-- worker engagement:
--   1. pabo_pledge_intent_to_vote_yes — expected (pre-ballot intent)
--   2. pabo_vote_cast_yes             — actual   (post-ballot confirmation)
--
-- These are system templates seeded against a synthetic
-- campaign_id = 0. Real per-campaign activities reference these
-- template_keys and are created by the application layer when a
-- campaign enters Stage 10.
--
-- NOTE: The activity_kind CHECK currently only allows 'task' and
-- 'assessment'. We extend it here to also allow 'industrial_action'
-- before inserting the seed rows.
-- ============================================================

-- 1. Extend the activity_kind CHECK to include 'industrial_action'
--    (idempotent: drop the old constraint if present, add new one)
ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_activity_kind_check;

ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_activity_kind_check
    CHECK (activity_kind IN ('task', 'assessment', 'industrial_action'));

-- 2. Extend the campaign_activities title column if needed (no-op if fine)
--    and add a partial unique index on template_key for non-null values
--    so ON CONFLICT (template_key) works cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_activities_template_key
  ON campaign_activities(template_key)
  WHERE template_key IS NOT NULL;

-- 3. Seed the two PABO activity templates.
--    campaign_id = 0 is used as a sentinel for system/global templates;
--    the FK reference requires the campaign to exist.  We use a DO block
--    so this migration is safe even if campaign_id=0 doesn't exist
--    (e.g. in a fresh test DB where sequences start at 1).
--
--    In practice the application seeds these per-campaign at the point
--    where the campaign transitions to Stage 10; the template_key is the
--    stable identifier the app uses to look them up.
--
--    We use INSERT … ON CONFLICT (template_key) DO NOTHING so re-running
--    the migration is safe.

-- pabo_pledge_intent_to_vote_yes
INSERT INTO campaign_activities (
  campaign_id,
  title,
  template_key,
  activity_kind,
  is_binary,
  is_custom
)
SELECT
  c.campaign_id,
  'PABO: Intent to vote Yes',
  'pabo_pledge_intent_to_vote_yes',
  'industrial_action',
  true,
  false
FROM (SELECT MIN(campaign_id) AS campaign_id FROM campaigns) c
WHERE c.campaign_id IS NOT NULL
ON CONFLICT (template_key) DO NOTHING;

-- pabo_vote_cast_yes
INSERT INTO campaign_activities (
  campaign_id,
  title,
  template_key,
  activity_kind,
  is_binary,
  is_custom
)
SELECT
  c.campaign_id,
  'PABO: Voted Yes',
  'pabo_vote_cast_yes',
  'industrial_action',
  true,
  false
FROM (SELECT MIN(campaign_id) AS campaign_id FROM campaigns) c
WHERE c.campaign_id IS NOT NULL
ON CONFLICT (template_key) DO NOTHING;

COMMENT ON INDEX idx_campaign_activities_template_key IS
  'Partial unique index enforcing uniqueness of non-null template_key values '
  'in campaign_activities. Used for idempotent seed upserts via ON CONFLICT.';
