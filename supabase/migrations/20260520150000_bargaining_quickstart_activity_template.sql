-- ============================================================
-- Migration: Bargaining baseline quick-start activity templates
--
-- Adds seed_bargaining_quickstart_activities(p_campaign_id INT)
-- RPC that idempotently inserts two campaign_activities rows for
-- baseline rating outreach:
--   1. bargaining_baseline_phone_wave  (activity_kind='phone_bank')
--   2. bargaining_baseline_sms_survey  (activity_kind='sms_survey')
--
-- These are surfaced by the BaselineAssessmentQuickStart component
-- on the bargaining hub when workers_with_rating / universe_size < 0.20.
--
-- Extends the activity_kind CHECK constraint to include 'phone_bank'
-- and 'sms_survey' before inserting.
-- ============================================================

-- 1. Extend activity_kind CHECK to include 'phone_bank' and 'sms_survey'
--    (idempotent: drop old constraint if present, add new one)
ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_activity_kind_check;

ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_activity_kind_check
    CHECK (activity_kind IN ('task', 'assessment', 'industrial_action', 'phone_bank', 'sms_survey'));

-- 2. Idempotency index: ensures WHERE NOT EXISTS pattern is fast
--    (may already exist from earlier migrations — safe if duplicate)
CREATE INDEX IF NOT EXISTS idx_campaign_activities_template_key
  ON campaign_activities(campaign_id, template_key)
  WHERE template_key IS NOT NULL;

-- 3. seed_bargaining_quickstart_activities RPC
CREATE OR REPLACE FUNCTION seed_bargaining_quickstart_activities(p_campaign_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert bargaining_baseline_phone_wave activity if not exists
  INSERT INTO campaign_activities (campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  SELECT
    p_campaign_id,
    'Baseline Rating Phone Wave',
    'bargaining_baseline_phone_wave',
    'phone_bank',
    false,
    false
  WHERE NOT EXISTS (
    SELECT 1 FROM campaign_activities
    WHERE campaign_id = p_campaign_id
      AND template_key = 'bargaining_baseline_phone_wave'
  );

  -- Insert bargaining_baseline_sms_survey activity if not exists
  INSERT INTO campaign_activities (campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  SELECT
    p_campaign_id,
    'Baseline Rating SMS Survey',
    'bargaining_baseline_sms_survey',
    'sms_survey',
    false,
    false
  WHERE NOT EXISTS (
    SELECT 1 FROM campaign_activities
    WHERE campaign_id = p_campaign_id
      AND template_key = 'bargaining_baseline_sms_survey'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION seed_bargaining_quickstart_activities(INT) TO authenticated;
