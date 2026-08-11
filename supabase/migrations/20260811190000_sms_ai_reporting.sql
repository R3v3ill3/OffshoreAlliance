-- ============================================================
-- SMS module — Phase 7 (AI assist & reporting, brief §8.2 / §9)
--
--   1. sms_messages.ai_assisted — §8.2 "log that a draft was
--      AI-assisted on the message row". Stamped by the reply send
--      route when the composer text originated from a "Draft reply"
--      candidate (edited or not); false for hand-typed replies.
--   2. vw_sms_sender_stats — per (campaign_id, sender_user_id)
--      outbound stats incl. median reply latency (brief §3.1
--      item 11: replying within ~20 min lifts engagement ~20%).
--   3. vw_sms_campaign_rollup — campaign-level totals across
--      blasts / conversations / surveys with delivered as the
--      response-rate denominator (brief §3.1 item 11).
--
-- No RLS changes: no new tables. Views follow the house pattern of
-- vw_sms_campaign_summary / vw_sms_survey_funnel — plain views with
-- GRANT SELECT to authenticated (the underlying SMS tables are
-- staff-readable under their own policies).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_messages.ai_assisted
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sms_messages.ai_assisted IS
  'True when the outbound body originated from an AI "Draft reply" '
  'candidate (possibly edited before send). Drafts are never auto-sent '
  '(brief §8.2); this is the per-message audit flag.';

-- ─────────────────────────────────────────────────────────────
-- 2. vw_sms_sender_stats
-- ─────────────────────────────────────────────────────────────

-- A "reply" = an outbound message whose immediately-preceding message
-- in the same conversation is inbound; its latency is measured from
-- that (most recent) inbound. LAG() over the per-conversation timeline
-- keeps this a single pass. campaign_id can be NULL (org-wide triage
-- threads) — the campaign reporting route filters on it.
CREATE OR REPLACE VIEW vw_sms_sender_stats AS
WITH ordered AS (
  SELECT
    c.campaign_id,
    m.conversation_id,
    m.sender_user_id,
    m.direction,
    m.ai_assisted,
    m.created_at,
    -- Blast-mirrored sends carry a provider id that also appears in
    -- sms_send_log (blast sends log there; 1:1 replies never do).
    -- Excluding them keeps this a CONVERSATION-work view: a 500-
    -- recipient blast must not read as 500 threads for its queuer,
    -- and mirror rows landing after an inbound must not pollute the
    -- reply-latency median.
    (ssl.send_id IS NOT NULL) AS is_blast_mirror,
    LAG(m.direction)  OVER w AS prev_direction,
    LAG(m.created_at) OVER w AS prev_created_at
  FROM sms_messages m
  JOIN sms_conversations c ON c.conversation_id = m.conversation_id
  LEFT JOIN sms_send_log ssl
    ON ssl.provider_message_id = m.provider_message_id
   AND m.provider_message_id IS NOT NULL
  WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.created_at, m.message_id)
)
SELECT
  campaign_id,
  sender_user_id,
  COUNT(*)::INT                                        AS replies_sent,
  COUNT(DISTINCT conversation_id)::INT                 AS conversations,
  COUNT(*) FILTER (WHERE ai_assisted)::INT             AS ai_assisted_count,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (created_at - prev_created_at))
  ) FILTER (WHERE prev_direction = 'inbound')          AS median_reply_latency_seconds
FROM ordered
WHERE direction = 'outbound'
  AND sender_user_id IS NOT NULL
  AND NOT is_blast_mirror
GROUP BY campaign_id, sender_user_id;

GRANT SELECT ON vw_sms_sender_stats TO authenticated;

COMMENT ON VIEW vw_sms_sender_stats IS
  'Per (campaign, sender) outbound conversation stats. '
  'median_reply_latency_seconds pairs each outbound with the '
  'immediately-preceding inbound in the same thread (NULL when the '
  'sender has no such pairs).';

-- ─────────────────────────────────────────────────────────────
-- 3. vw_sms_campaign_rollup
-- ─────────────────────────────────────────────────────────────

-- Rates follow brief §3.1 item 11: delivery_rate_pct = delivered /
-- dispatched (sent+delivered+failed); reply_rate_pct = conversations
-- with an inbound reply / delivered — a cross-source approximation
-- (replies live on conversations, deliveries on blast items), which is
-- the closest campaign-level "delivered as denominator" available
-- without per-message blast↔thread joins. opt_outs_count = opt-outs
-- surfaced by campaign sends: pre-send suppressions + provider blocks
-- on blast items, plus survey sessions ended by STOP.
CREATE OR REPLACE VIEW vw_sms_campaign_rollup AS
WITH blast AS (
  SELECT
    sl.campaign_id,
    COUNT(DISTINCT sl.list_id)::INT AS blast_count,
    COUNT(sli.item_id) FILTER (WHERE sli.status IN ('sent', 'delivered', 'failed'))::INT AS sends_count,
    COUNT(sli.item_id) FILTER (WHERE sli.status = 'delivered')::INT AS delivered_count,
    COUNT(sli.item_id) FILTER (WHERE sli.status = 'failed')::INT    AS failed_count,
    COUNT(sli.item_id) FILTER (WHERE sli.status IN ('opted_out', 'blocked'))::INT AS blast_opt_out_count
  FROM sms_lists sl
  LEFT JOIN sms_list_items sli ON sli.list_id = sl.list_id
  GROUP BY sl.campaign_id
),
convo AS (
  SELECT
    c.campaign_id,
    COUNT(DISTINCT c.conversation_id)::INT AS conversation_count,
    COUNT(DISTINCT c.conversation_id) FILTER (
      WHERE c.state IN ('needs_response', 'convo')
    )::INT AS active_conversation_count,
    COUNT(DISTINCT c.conversation_id) FILTER (
      WHERE c.last_inbound_at IS NOT NULL
    )::INT AS conversations_with_reply,
    COUNT(m.message_id) FILTER (WHERE m.direction = 'inbound')::INT AS inbound_reply_count
  FROM sms_conversations c
  LEFT JOIN sms_messages m ON m.conversation_id = c.conversation_id
  WHERE c.campaign_id IS NOT NULL
  GROUP BY c.campaign_id
),
survey AS (
  SELECT
    s.campaign_id,
    COUNT(DISTINCT s.survey_id)::INT AS survey_count,
    COUNT(ss.session_id) FILTER (WHERE ss.state = 'completed')::INT AS surveys_completed_count,
    COUNT(ss.session_id) FILTER (WHERE ss.state = 'opted_out')::INT AS survey_opt_out_count
  FROM sms_surveys s
  LEFT JOIN sms_survey_sessions ss ON ss.survey_id = s.survey_id
  GROUP BY s.campaign_id
)
SELECT
  c.campaign_id,
  COALESCE(b.blast_count, 0)                AS blast_count,
  COALESCE(b.sends_count, 0)                AS sends_count,
  COALESCE(b.delivered_count, 0)            AS delivered_count,
  COALESCE(b.failed_count, 0)               AS failed_count,
  CASE WHEN COALESCE(b.sends_count, 0) > 0
    THEN ROUND(100.0 * b.delivered_count / b.sends_count, 1)
    ELSE 0
  END                                       AS delivery_rate_pct,
  COALESCE(cv.conversation_count, 0)        AS conversation_count,
  COALESCE(cv.active_conversation_count, 0) AS active_conversation_count,
  COALESCE(cv.inbound_reply_count, 0)       AS inbound_reply_count,
  COALESCE(cv.conversations_with_reply, 0)  AS conversations_with_reply,
  CASE WHEN COALESCE(b.delivered_count, 0) > 0
    THEN ROUND(100.0 * COALESCE(cv.conversations_with_reply, 0) / b.delivered_count, 1)
    ELSE 0
  END                                       AS reply_rate_pct,
  COALESCE(b.blast_opt_out_count, 0)
    + COALESCE(sv.survey_opt_out_count, 0)  AS opt_outs_count,
  COALESCE(sv.survey_count, 0)              AS survey_count,
  COALESCE(sv.surveys_completed_count, 0)   AS surveys_completed_count
FROM campaigns c
LEFT JOIN blast  b  ON b.campaign_id  = c.campaign_id
LEFT JOIN convo  cv ON cv.campaign_id = c.campaign_id
LEFT JOIN survey sv ON sv.campaign_id = c.campaign_id;

GRANT SELECT ON vw_sms_campaign_rollup TO authenticated;

COMMENT ON VIEW vw_sms_campaign_rollup IS
  'Campaign-level SMS totals across blasts, conversations and surveys. '
  'delivery_rate_pct and reply_rate_pct use delivered as the '
  'denominator per brief §3.1 item 11.';
