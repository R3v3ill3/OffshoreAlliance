-- ============================================================
-- SMS module — Phase 8 (Access & wiring, brief §D decision 11)
--
-- Two nullable FK columns on existing tables, added for the
-- per-question assessment targeting and the Blast/Chat/Survey fire
-- pathway. Both applied idempotently (ADD COLUMN IF NOT EXISTS).
--
--   1. sms_survey_questions.activity_id — a per-question override of
--      the survey's ratings target (sms_surveys.activity_id). The
--      runtime resolves the target as
--      COALESCE(question.activity_id, survey.activity_id) at the
--      single rating-bearing interaction stamp in
--      src/lib/sms/survey-runtime.ts. Campaign coherence (the
--      question's activity must belong to the survey's campaign) is
--      enforced in the sms-surveys routes at build time, exactly as
--      the survey-level activity_id already is — NOT by a CHECK or
--      trigger, since a cross-table campaign match is not expressible
--      as a column constraint.
--   2. sms_surveys.source_worker_list_id — the cohort a draft survey
--      was fired from (Build List → SMS → Survey pathway). This is an
--      *intended roll* / provenance hint only: the actual eligibility
--      audience is frozen at OPEN time by
--      POST .../sms-surveys/[surveyId]/actions, which reads the
--      worker list fresh at that moment. This column is never the
--      source of truth for who was invited and is not read by the
--      open-time freeze logic.
--
-- Deliberate omissions (so the migration reviewer does not have to
-- infer them):
--   - No RLS policy changes. Neither column creates a new table —
--     the existing sms_surveys / sms_survey_questions policies
--     (20260811120000_sms_surveys.sql) already cover every column on
--     those tables, including new ones.
--   - No grant changes. No new sequences are created by this
--     migration, so no sequence grants are needed; the existing
--     table-level GRANT SELECT, INSERT, UPDATE, DELETE ... TO
--     authenticated already covers these columns.
--   - No indexes. sms_survey_questions is always read by survey_id
--     (already indexed) and is small per survey; activity_id is never
--     a filter predicate. sms_surveys.source_worker_list_id is a
--     display/default-selection hint, never a query predicate, this
--     phase.
-- ============================================================

ALTER TABLE sms_survey_questions
  ADD COLUMN IF NOT EXISTS activity_id INTEGER REFERENCES campaign_activities(activity_id) ON DELETE SET NULL;

COMMENT ON COLUMN sms_survey_questions.activity_id IS
  'Per-question override of the survey ratings target. Resolution rule: COALESCE(sms_survey_questions.activity_id, sms_surveys.activity_id) at the interaction stamp in survey-runtime.ts. NULL = fall back to the survey-level target. Campaign coherence (activity.campaign_id = survey.campaign_id) is enforced in the sms-surveys routes at build time, not by a constraint here.';

ALTER TABLE sms_surveys
  ADD COLUMN IF NOT EXISTS source_worker_list_id INTEGER REFERENCES campaign_worker_lists(list_id) ON DELETE SET NULL;

COMMENT ON COLUMN sms_surveys.source_worker_list_id IS
  'The campaign_worker_lists cohort this draft survey was fired from (Build List -> SMS -> Survey pathway), if any. Provenance / default-audience-selection hint only: the survey eligibility roll is frozen fresh at OPEN time by POST /api/campaigns/[id]/sms-surveys/[surveyId]/actions, which is the sole source of truth for who was invited. This column is never read by that freeze logic.';
