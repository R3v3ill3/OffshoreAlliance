-- 3-pane SMS chat workspace (Phase 10, brief §E0 decision 8c,
-- docs/SMS_MODULE_PHASE10_PLAN.md §3).
--
-- Two columns on sms_lists, no new tables. Both inherit the existing
-- sms_lists RLS policies, so there is nothing to re-derive.
--
--   1. selected_assessment_ids — the assessments pinned to a p2p chat
--      board, rendered one-tap in the workspace's member pane. Mirrors
--      phone_call_actions.selected_assessment_ids (20260613160000) in
--      name and type so the two pathways read the same way.
--   2. assessment_campaign_id — standalone chats run on hidden
--      is_sms_episode campaigns, which carry no assessments and are
--      excluded from every campaign picker. This records the real
--      campaign the organiser nominated for their ratings.

-- ─────────────────────────────────────────────────────────────
-- 1. sms_lists.selected_assessment_ids
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS selected_assessment_ids INTEGER[] NOT NULL
    DEFAULT '{}'::INTEGER[];

COMMENT ON COLUMN sms_lists.selected_assessment_ids IS
  'P2P chat boards: campaign_activities ids (activity_kind=''assessment'') '
  'pinned to this board and rendered one-tap in the chat workspace member '
  'pane. Ignored for mode=''blast''. Postgres cannot FK an array element, '
  'so membership is validated in the PATCH route and stale ids are '
  'filtered on read — an assessment deleted mid-session must degrade the '
  'pinned control, never break the board.';

-- ─────────────────────────────────────────────────────────────
-- 2. sms_lists.assessment_campaign_id
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS assessment_campaign_id INTEGER
    REFERENCES campaigns(campaign_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sl_assessment_campaign
  ON sms_lists(assessment_campaign_id)
  WHERE assessment_campaign_id IS NOT NULL;

COMMENT ON COLUMN sms_lists.assessment_campaign_id IS
  'Standalone chat boards only: the REAL campaign whose assessments this '
  'board''s ratings are recorded against. Standalone sends hang off hidden '
  'is_sms_episode campaigns (see lib/sms/sms-episode.ts), which have no '
  'assessment activities and never appear on a wall chart, so rating '
  'against them would produce invisible data. NULL means "use '
  'sms_lists.campaign_id" — the normal case for a campaign chat. Set only '
  'when the list''s own campaign is_sms_episode; the PATCH route rejects '
  'it otherwise. ON DELETE SET NULL degrades the board to "nominate a '
  'campaign again" rather than orphaning it.';
