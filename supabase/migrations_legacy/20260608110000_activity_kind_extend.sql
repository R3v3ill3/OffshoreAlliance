-- ============================================================
-- Section Planning module — bug fix
--
-- The Phase 6 migration (20260607140000) tightened the
-- campaign_activities.activity_kind CHECK to:
--   ('task','assessment','industrial_action','phone_bank',
--    'sms_survey','woc_meeting','site_visit')
--
-- but Phase 5 introduced activity sequences whose
-- target_activity_kind allows the broader set including
-- 'phone_call_list', 'sms_blast', 'email_survey'. The
-- SectionActivitiesPanel UI also uses these. Result:
-- creating an activity with one of the broader kinds fails
-- with constraint violation 23514.
--
-- This migration aligns the campaign_activities CHECK with
-- the sequence step CHECK by adding the missing kinds.
-- ============================================================

ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_activity_kind_check;

ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_activity_kind_check
  CHECK (activity_kind IN (
    'task',
    'assessment',
    'industrial_action',
    'phone_bank',
    'sms_survey',
    'woc_meeting',
    'site_visit',
    'phone_call_list',
    'sms_blast',
    'email_survey'
  ));

COMMENT ON CONSTRAINT campaign_activities_activity_kind_check ON campaign_activities IS
  'Allowed activity kinds. The first seven are legacy / Phase 6 values; '
  'phone_call_list / sms_blast / email_survey are added so Section Plan '
  'activities and materialised sequence-step downstream activities can be '
  'persisted without violating the check.';
