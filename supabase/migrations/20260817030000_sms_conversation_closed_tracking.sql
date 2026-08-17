-- SMS: record WHEN and BY WHOM a conversation was closed.
--
-- `sms_conversations.state = 'closed'` already existed, but state alone
-- is a current-value flag: it cannot answer "how many chats did this
-- board complete, and when", which is what the per-board progress
-- widget (recipients / messaged / responded / completed) needs. A
-- reopen also silently erased the fact a conversation had ever been
-- closed.
--
-- Adds the two columns, backfills existing closed rows from updated_at
-- (the closest available approximation — flagged as approximate rather
-- than invented), and extends vw_sms_chat_session_report with the
-- responded/completed counts the widget reads.

ALTER TABLE sms_conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN sms_conversations.closed_at IS
  'When the conversation was marked closed. Set alongside '
  'state=''closed'' and cleared on reopen, so it always agrees with '
  'state. Rows closed before this column existed were backfilled from '
  'updated_at and are approximate.';

COMMENT ON COLUMN sms_conversations.closed_by_user_id IS
  'Staff member who marked the conversation closed. NULL for rows '
  'backfilled from before this column existed.';

UPDATE sms_conversations
   SET closed_at = updated_at
 WHERE state = 'closed'
   AND closed_at IS NULL;

-- Partial index: the board and the widget both filter on "closed
-- conversations for this campaign", a small slice of the table.
CREATE INDEX IF NOT EXISTS idx_sms_conversations_closed
  ON sms_conversations (campaign_id, closed_at)
  WHERE closed_at IS NOT NULL;

-- ── Progress reporting ────────────────────────────────────────────
-- Extends the Phase 12 view with the two counts the per-board progress
-- widget needs beyond openers/replies: conversations that received a
-- reply at all, and conversations an organiser marked complete.
--
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot insert
-- columns ahead of existing ones, and the new counts belong next to
-- the other per-session metrics rather than tacked on the end.
DROP VIEW IF EXISTS vw_sms_chat_session_report;

CREATE VIEW vw_sms_chat_session_report AS
WITH openers AS (
  SELECT
    l.campaign_id,
    l.list_id,
    l.name,
    l.status,
    l.created_by,
    l.created_at,
    i.item_id,
    i.worker_id,
    i.conversation_id,
    i.sent_at,
    c.last_inbound_at,
    c.closed_at,
    (
      SELECT MIN(m.created_at)
        FROM sms_messages m
       WHERE m.conversation_id = i.conversation_id
         AND m.direction = 'inbound'
         AND m.created_at >= i.sent_at
    ) AS first_reply_at
  FROM sms_lists l
  JOIN sms_list_items i ON i.list_id = l.list_id
  LEFT JOIN sms_conversations c ON c.conversation_id = i.conversation_id
  WHERE l.mode = 'p2p'
    AND i.sent_at IS NOT NULL
)
SELECT
  o.campaign_id,
  o.list_id,
  o.name,
  o.status,
  o.created_by,
  o.created_at,
  COUNT(*)::INT AS openers_sent,
  COUNT(o.first_reply_at)::INT AS replies_received,
  ROUND(
    100.0 * COUNT(o.first_reply_at) / NULLIF(COUNT(*), 0), 1
  ) AS response_rate_pct,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (o.first_reply_at - o.sent_at))
  ) FILTER (WHERE o.first_reply_at IS NOT NULL)::NUMERIC
    AS median_first_reply_seconds,
  -- Distinct from replies_received: that counts a reply arriving after
  -- this board's opener, this counts any inbound on the thread ever.
  COUNT(*) FILTER (WHERE o.last_inbound_at IS NOT NULL)::INT
    AS conversations_responded,
  COUNT(*) FILTER (WHERE o.closed_at IS NOT NULL)::INT
    AS conversations_closed,
  (
    SELECT COUNT(*)
      FROM campaign_activity_ratings r
      JOIN campaign_activities a ON a.activity_id = r.activity_id
     WHERE a.campaign_id = o.campaign_id
       AND r.source IN ('sms_chat', 'sms_survey', 'sms_inbound')
       AND r.worker_id IN (
         SELECT o2.worker_id FROM openers o2 WHERE o2.list_id = o.list_id
       )
  )::INT AS assessments_recorded
FROM openers o
GROUP BY o.campaign_id, o.list_id, o.name, o.status, o.created_by,
         o.created_at;

GRANT SELECT ON vw_sms_chat_session_report TO authenticated;

COMMENT ON VIEW vw_sms_chat_session_report IS
  'Per P2P chat session (sms_lists.mode = ''p2p''): openers sent, '
  'replies received, response rate, median seconds to first reply, '
  'conversations that ever received a reply, conversations marked '
  'complete, and SMS-sourced assessments recorded against the '
  'session''s members. Group by created_by for per-organiser '
  'throughput.';
