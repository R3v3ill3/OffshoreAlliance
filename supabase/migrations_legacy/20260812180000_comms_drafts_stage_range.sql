-- ============================================================
-- Align campaign_comms_drafts.stage_number with the campaign
-- stage range.
--
-- campaign_stage_plans has allowed 0–11 since the standalone
-- activities bucket landed (20260627100000), which itself built on
-- the 7–11 bargaining_to_win extension (20260510110000):
--   0      = standalone_activities
--   1–6    = preparing_to_bargain
--   7–11   = bargaining_to_win
--
-- campaign_comms_drafts was left on the original 1–6 bound, so any
-- campaign whose ACTIVE stage sits outside that window could not
-- have a comms draft created at all. Every route that opens a draft
-- stamps it with the campaign's active stage — SMS blast and chat
-- board creation (api/campaigns/[id]/sms-lists) and both worker-list
-- fire paths — so those all 500 with a check violation on campaigns
-- parked in the standalone bucket.
-- ============================================================

ALTER TABLE campaign_comms_drafts
  DROP CONSTRAINT IF EXISTS campaign_comms_drafts_stage_number_check;

ALTER TABLE campaign_comms_drafts
  ADD CONSTRAINT campaign_comms_drafts_stage_number_check
    CHECK (stage_number BETWEEN 0 AND 11);

COMMENT ON COLUMN campaign_comms_drafts.stage_number IS
  'Campaign stage this draft belongs to, mirroring '
  'campaign_stage_plans.stage_number: 0 = standalone activities, '
  '1–6 = preparing to bargain, 7–11 = bargaining to win.';
