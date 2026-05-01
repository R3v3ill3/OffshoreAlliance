-- ============================================================
-- Phase 8 (Wave 6): Extend activity_kind CHECK to include 'woc_meeting'
--
-- The constraint at this point includes values from prior migrations:
--   20260514120000: task, assessment, industrial_action
--   20260520150000 (Phase 6): phone_bank, sms_survey
--   This migration: adds woc_meeting
--
-- We drop + re-add the same constraint name with ALL accumulated values.
-- ============================================================

ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_activity_kind_check;

ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_activity_kind_check
    CHECK (activity_kind IN ('task', 'assessment', 'industrial_action', 'phone_bank', 'sms_survey', 'woc_meeting'));

COMMENT ON COLUMN campaign_activities.activity_kind IS
  'Kind of activity: task (general), assessment (worker rating), '
  'industrial_action (PABO / PIA ladder), phone_bank (baseline phone wave), '
  'sms_survey (SMS survey), woc_meeting (Wages Outcome Committee meeting).';
