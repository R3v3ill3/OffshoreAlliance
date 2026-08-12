-- P2P chat boards (brief §3.1 P2P patterns — the previously stubbed
-- 'chat' pathway).
--
-- Reuses the blast machinery rather than new tables:
--   1. sms_lists.mode ('blast' | 'p2p') — a p2p list is a working list
--      for a chat board. P2P lists NEVER enter 'queued'/'sending'
--      status (they live in 'draft' while the board is active and go
--      to 'sent' when the board is closed), so the dispatch cron's
--      status scan never picks them up; the cron also carries a
--      mode belt-check in code.
--   2. sms_list_items.conversation_id — links a sent P2P initial to
--      the thread it created/attached (ON DELETE SET NULL: a deleted
--      thread must never cascade into send history).
--   3. vw_sms_campaign_summary grows a trailing `mode` column so the
--      Blasts overview can exclude p2p lists and the chat board can
--      list its own.

-- ─────────────────────────────────────────────────────────────
-- 1. sms_lists.mode
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'blast';

DO $$
BEGIN
  BEGIN
    ALTER TABLE sms_lists
      ADD CONSTRAINT sms_lists_mode_check
      CHECK (mode IN ('blast', 'p2p'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON COLUMN sms_lists.mode IS
  'blast = bulk broadcast drained by the dispatch cron. p2p = chat-board '
  'working list: initials are sent progressively per organiser selection '
  'via the p2p-send route; the list stays in status draft while the board '
  'is active and flips to sent when closed — it must never reach '
  'queued/sending, which is what the cron drains.';

-- ─────────────────────────────────────────────────────────────
-- 2. sms_list_items.conversation_id
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_list_items
  ADD COLUMN IF NOT EXISTS conversation_id INTEGER
    REFERENCES sms_conversations(conversation_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sli_conversation
  ON sms_list_items(conversation_id)
  WHERE conversation_id IS NOT NULL;

COMMENT ON COLUMN sms_list_items.conversation_id IS
  'P2P boards: the thread the sent initial created/attached on the '
  '(our_number_id, phone_e164, campaign_id) key. NULL for blast items '
  'and unsent p2p items.';

-- ─────────────────────────────────────────────────────────────
-- 3. vw_sms_campaign_summary + trailing mode column
--    (CREATE OR REPLACE VIEW may only append columns at the end —
--    this restates the 20260810120000 definition verbatim + sl.mode.)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_sms_campaign_summary AS
SELECT
  sl.campaign_id,
  sl.list_id,
  sl.name AS list_name,
  sl.status AS list_status,
  sl.draft_id,
  sl.sender_number_id,
  sl.timezone,
  sl.blackout_override,
  sl.scheduled_for,
  sl.total_items,
  sl.sent_items,
  sl.delivered_items,
  sl.failed_items,
  sl.created_at,
  COUNT(sli.item_id)                                            AS item_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'pending')      AS pending_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'queued')       AS queued_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'sending')      AS sending_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'sent')         AS sent_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'delivered')    AS delivered_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'failed')       AS failed_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'skipped')      AS skipped_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'opted_out')    AS opted_out_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'blocked')      AS blocked_count,
  -- Delivered as % of dispatched (sent + delivered + failed) — the
  -- response-rate denominator convention (brief §3.1 item 11).
  CASE WHEN COUNT(sli.item_id) FILTER (WHERE sli.status IN ('sent', 'delivered', 'failed')) > 0
    THEN ROUND(
      100.0 * COUNT(sli.item_id) FILTER (WHERE sli.status = 'delivered')
      / COUNT(sli.item_id) FILTER (WHERE sli.status IN ('sent', 'delivered', 'failed')),
      1)
    ELSE 0
  END AS delivery_rate_pct,
  sl.mode
FROM sms_lists sl
LEFT JOIN sms_list_items sli ON sli.list_id = sl.list_id
GROUP BY sl.campaign_id, sl.list_id, sl.name, sl.status, sl.draft_id,
         sl.sender_number_id, sl.timezone, sl.blackout_override,
         sl.scheduled_for, sl.total_items, sl.sent_items,
         sl.delivered_items, sl.failed_items, sl.created_at, sl.mode;

GRANT SELECT ON vw_sms_campaign_summary TO authenticated;
