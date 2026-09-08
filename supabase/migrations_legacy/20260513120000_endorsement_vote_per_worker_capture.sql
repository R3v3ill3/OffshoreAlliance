-- ============================================================
-- Phase 4 (Wave 4): EBA vote per-worker capture templates
--
-- Seeds two campaign_activities template rows for tracking
-- per-worker EBA vote engagement:
--   1. eba_vote_yes_intent — expected (pre-ballot intent to vote yes)
--   2. eba_vote_yes_actual — actual   (confirmed voted yes)
--
-- These are system templates attached to the lowest campaign_id
-- (sentinel approach — same pattern as Wave 3 PABO seeds in
-- 20260514120000_pabo_per_worker_capture.sql).  Real per-campaign
-- activities reference these template_keys and are created by the
-- application layer when a campaign enters Stage 11.
--
-- If idx_campaign_activities_template_key already exists from a
-- prior Wave migration it is silently skipped (IF NOT EXISTS).
-- ============================================================

-- 1. Ensure the partial unique index exists so ON CONFLICT works.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_activities_template_key
  ON campaign_activities(template_key)
  WHERE template_key IS NOT NULL;

-- 2. Seed eba_vote_yes_intent
--    activity_kind = 'assessment'  (worker-assessable binary flag)
--    is_binary     = true          (yes/no: did worker express intent?)
--    rating_phase intent: 'expected' (set via campaign_activity_ratings
--                                     with rating_phase='expected')
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
  'EBA Vote: Intent to vote Yes',
  'eba_vote_yes_intent',
  'assessment',
  true,
  false
FROM (SELECT MIN(campaign_id) AS campaign_id FROM campaigns) c
WHERE c.campaign_id IS NOT NULL
ON CONFLICT (template_key) DO NOTHING;

-- 3. Seed eba_vote_yes_actual
--    activity_kind = 'assessment'
--    is_binary     = true
--    rating_phase intent: 'actual' (set via campaign_activity_ratings
--                                    with rating_phase='actual')
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
  'EBA Vote: Voted Yes',
  'eba_vote_yes_actual',
  'assessment',
  true,
  false
FROM (SELECT MIN(campaign_id) AS campaign_id FROM campaigns) c
WHERE c.campaign_id IS NOT NULL
ON CONFLICT (template_key) DO NOTHING;

COMMENT ON INDEX idx_campaign_activities_template_key IS
  'Partial unique index enforcing uniqueness of non-null template_key values '
  'in campaign_activities. Used for idempotent seed upserts via ON CONFLICT. '
  'Created by Wave 3 (20260514120000) or Wave 4 (20260513120000) — whichever runs first.';
