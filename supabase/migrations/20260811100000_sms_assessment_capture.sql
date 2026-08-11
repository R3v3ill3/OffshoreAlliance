-- ============================================================
-- Migration: SMS Phase 3 — in-chat assessment capture
--
-- Deliberately minimal. The assessment write path needs NO new
-- plumbing: record_assessment_event (SECURITY DEFINER, EXECUTE
-- granted to authenticated in 20260805100000) is called directly
-- from POST /api/sms/conversations/[id]/assessments after a
-- can_write_to_campaign check, upserting campaign_activity_ratings
-- with source 'sms' (already allowed by the source CHECK,
-- 20260613110000).
--
-- The only schema addition is the Spoke "scripted answer" link:
-- a canned reply can be tagged with the outcome it corresponds to
-- ('yes' / 'no' / 'unsure' / 'abstain' for binary assessments, or
-- '1'..'5' for scale assessments). Picking that outcome in the
-- inbox records the assessment AND pre-fills the compose box with
-- the linked reply. Nullable, no backfill — untagged replies
-- behave exactly as in Phase 2.
-- ============================================================

ALTER TABLE sms_canned_replies
  ADD COLUMN IF NOT EXISTS outcome_value VARCHAR(30) NULL;

COMMENT ON COLUMN sms_canned_replies.outcome_value IS
  'Optional Spoke-style scripted-answer link: the assessment outcome this '
  'reply follows up (binary values yes/no/unsure/abstain, or ''1''..''5'' '
  'for scale ratings). When an organiser records that outcome from the '
  'inbox quick-capture buttons, a matching reply (campaign-scoped '
  'preferred over org-wide) is loaded into the compose box.';

-- No new grants: existing table-level grants on sms_canned_replies
-- (20260810140000) cover the new column; RLS policies are unchanged.
