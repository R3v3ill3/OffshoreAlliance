-- ============================================================
-- Platform email sending (SendGrid, reveille.net.au) — Phase 1
--
-- Clone of the SMS module's Phase 0/1 groundwork for the email
-- channel (see 20260810100000_sms_foundations.sql and
-- 20260810120000_sms_broadcast.sql):
--
--   1. workers email consent columns: email_opt_out /
--      email_opt_out_at / email_opt_out_source /
--      email_consent_source. Independent of the existing
--      deliverability flag workers.email_status.
--   2. email_lists / email_list_items queue fields — the tables
--      already exist (20260623100000); this adds the
--      queued→sending claim machinery, delivery counters,
--      wrapper link and send window fields so the dispatch cron
--      can drain them like sms_lists.
--   3. email_send_log: provider columns + engagement stamps for
--      the SendGrid path ('sendgrid' send_method; the column is
--      free text so no CHECK change needed).
--   4. email_engagement_events: event_type CHECK extended with
--      delivered / opened / unsubscribed / spam_report.
--   5. email_delivery_events — provider webhook audit log,
--      service-role only, UNIQUE(provider_event_id) idempotency.
--   6. email_wrappers — reusable header/footer shells applied at
--      send time; footer must carry {{unsubscribe_url}}. Seeded
--      with a default OA wrapper.
--   7. email_unsubscribe_tokens — per-(send, worker) tokens for
--      /u/[token]; service-role only (clone of email_click_tokens).
--   8. email_conversations / email_messages — hybrid in-app inbox
--      fed by SendGrid Inbound Parse (clone of sms_conversations /
--      sms_messages minus phone specifics) + atomic touch RPCs.
--   9. campaign_comms_drafts: sent_via CHECK + 'sendgrid';
--      wrapper_id column.
--  10. app_settings seeds for provider credentials + webhook and
--      inbound shared-secret tokens.
--  11. vw_email_campaign_summary reporting view.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. workers: email consent
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opt_out_source VARCHAR(20)
    CHECK (email_opt_out_source IS NULL OR email_opt_out_source IN
      ('unsubscribe_link', 'spam_report', 'staff', 'import')),
  ADD COLUMN IF NOT EXISTS email_consent_source VARCHAR(20)
    CHECK (email_consent_source IS NULL OR email_consent_source IN
      ('import', 'manual', 'legacy'));

-- Provenance stamp for rows that existed before consent-source capture
-- (mirrors the sms_consent_source backfill).
UPDATE workers
SET email_consent_source = 'legacy'
WHERE email IS NOT NULL AND email_consent_source IS NULL;

COMMENT ON COLUMN workers.email_opt_out IS
  'Email consent withdrawal (Spam Act). Independent of email_status, '
  'which is deliverability (bounce) only. Re-checked at dispatch time.';

-- ─────────────────────────────────────────────────────────────
-- 2. email_lists / email_list_items queue machinery
-- ─────────────────────────────────────────────────────────────

-- Lists gain queued/sending/cancelled states for the dispatcher.
ALTER TABLE email_lists
  DROP CONSTRAINT IF EXISTS email_lists_status_check;
ALTER TABLE email_lists
  ADD CONSTRAINT email_lists_status_check
  CHECK (status IN ('draft', 'active', 'queued', 'sending', 'sent',
                    'completed', 'paused', 'cancelled'));

ALTER TABLE email_lists
  ADD COLUMN IF NOT EXISTS wrapper_id INTEGER,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Perth',
  ADD COLUMN IF NOT EXISTS blackout_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_items INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_items INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_el_dispatch ON email_lists(status)
  WHERE status IN ('queued', 'sending');

-- Items gain the claim/queue state machine (clone of sms_list_items).
ALTER TABLE email_list_items
  DROP CONSTRAINT IF EXISTS email_list_items_status_check;
ALTER TABLE email_list_items
  ADD CONSTRAINT email_list_items_status_check
  CHECK (status IN (
    'pending', 'queued', 'sending', 'sent', 'delivered', 'failed',
    'skipped', 'bounced', 'unsubscribed', 'opted_out'
  ));

ALTER TABLE email_list_items
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(150),
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS send_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_eli_provider_message
  ON email_list_items(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. email_send_log provider + engagement columns
-- ─────────────────────────────────────────────────────────────

-- send_method is free text (no CHECK); the SendGrid path writes
-- send_method = 'sendgrid'.
ALTER TABLE email_send_log
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(150),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_open_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_esl_provider_message
  ON email_send_log(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. email_engagement_events: extended event types
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_engagement_events
  DROP CONSTRAINT IF EXISTS email_engagement_events_event_type_check;
ALTER TABLE email_engagement_events
  ADD CONSTRAINT email_engagement_events_event_type_check
  CHECK (event_type IN ('replied', 'bounced', 'clicked', 'forwarded',
                        'delivered', 'opened', 'unsubscribed', 'spam_report'));

-- ─────────────────────────────────────────────────────────────
-- 5. email_delivery_events (service-role only)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_delivery_events (
  event_id BIGSERIAL PRIMARY KEY,
  -- SendGrid sg_event_id — unique per event, the idempotency handle
  -- (the Event Webhook delivers at-least-once, out of order).
  provider_event_id VARCHAR(150) NOT NULL,
  provider_message_id VARCHAR(150),
  send_id BIGINT REFERENCES email_send_log(send_id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL,
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_ede_occurred ON email_delivery_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ede_send ON email_delivery_events(send_id)
  WHERE send_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 6. email_wrappers
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_wrappers (
  wrapper_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- HTML placed above / below the draft body at send time. The footer
  -- MUST contain the {{unsubscribe_url}} placeholder — validated at
  -- save time and re-validated by the dispatcher (hard compliance
  -- failure pauses the list).
  header_html TEXT NOT NULL DEFAULT '',
  footer_html TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one default wrapper.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_wrappers_default
  ON email_wrappers(is_default) WHERE is_default;

DROP TRIGGER IF EXISTS trg_email_wrappers_updated_at ON email_wrappers;
CREATE TRIGGER trg_email_wrappers_updated_at
  BEFORE UPDATE ON email_wrappers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Now the FK for email_lists.wrapper_id (table exists).
DO $$
BEGIN
  ALTER TABLE email_lists
    ADD CONSTRAINT email_lists_wrapper_id_fkey
    FOREIGN KEY (wrapper_id) REFERENCES email_wrappers(wrapper_id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed the default OA wrapper (idempotent).
INSERT INTO email_wrappers (name, description, header_html, footer_html, is_default, is_active)
SELECT
  'OA Default',
  'Standard Offshore Alliance wrapper: OA banner header and the compliance footer with the mandatory unsubscribe link.',
  '<div style="background:#0f2a4a;padding:16px 24px;text-align:center;">'
    || '<span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;letter-spacing:0.5px;">OFFSHORE ALLIANCE</span>'
    || '</div>'
    || '<div style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">',
  '</div>'
    || '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">'
    || '<p style="margin:0 0 6px 0;">Offshore Alliance — a partnership between the AWU and the MUA.</p>'
    || '<p style="margin:0 0 6px 0;">You are receiving this email because you are a member or supporter of the Offshore Alliance.</p>'
    || '<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from these emails.</p>'
    || '</div>',
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM email_wrappers WHERE name = 'OA Default');

-- ─────────────────────────────────────────────────────────────
-- 7. email_unsubscribe_tokens (service-role only)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
  token TEXT PRIMARY KEY,                    -- 22-char URL-safe random
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  send_id BIGINT REFERENCES email_send_log(send_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eut_worker ON email_unsubscribe_tokens(worker_id);

-- ─────────────────────────────────────────────────────────────
-- 8. email_conversations / email_messages (hybrid inbox)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_conversations (
  conversation_id SERIAL PRIMARY KEY,
  -- NULL = unmatched inbound (triage) or worker later deleted.
  worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  -- The member side of the pair (thread key half), lower-cased.
  email_address VARCHAR(320) NOT NULL,
  -- NULL = org-wide triage scope; set when the thread is scoped to a
  -- campaign (from the originating blast or manual attach).
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  subject VARCHAR(500),
  state VARCHAR(20) NOT NULL DEFAULT 'triage'
    CHECK (state IN ('needs_message', 'messaged', 'needs_response', 'convo', 'closed', 'triage')),
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One thread per member address per campaign scope. NULLS NOT
  -- DISTINCT so the org-wide (campaign NULL) scope is unique too;
  -- closed rows occupy the key so a new inbound reopens the thread.
  CONSTRAINT uq_email_conversations_thread
    UNIQUE NULLS NOT DISTINCT (email_address, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_econv_state
  ON email_conversations(state, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_econv_worker
  ON email_conversations(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_econv_campaign
  ON email_conversations(campaign_id) WHERE campaign_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_email_conversations_updated_at ON email_conversations;
CREATE TRIGGER trg_email_conversations_updated_at
  BEFORE UPDATE ON email_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS email_messages (
  message_id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL
    REFERENCES email_conversations(conversation_id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,
  from_email VARCHAR(320),
  to_email VARCHAR(320),
  -- RFC 5322 Message-ID (inbound) or provider message id (outbound).
  -- Plain UNIQUE (NULLs allowed) so PostgREST upserts can infer it —
  -- the webhook idempotency handle for thread appends.
  provider_message_id VARCHAR(300) UNIQUE,
  -- Inbound: the Message-ID this is a reply to; outbound: the
  -- In-Reply-To header we set.
  in_reply_to VARCHAR(300),
  -- Correlated email_send_log row when the reply matched a send.
  send_id BIGINT REFERENCES email_send_log(send_id) ON DELETE SET NULL,
  -- Staff sender for outbound rows.
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attachments JSONB,
  -- inbound: 'received'; outbound: queued → sent → delivered|failed.
  status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emsg_conversation
  ON email_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emsg_send
  ON email_messages(send_id) WHERE send_id IS NOT NULL;

-- Atomic inbound touch: unread bump + state flip (never read-modify-
-- write from the webhook). Clone of touch_sms_conversation_inbound.
CREATE OR REPLACE FUNCTION touch_email_conversation_inbound(
  p_conversation_id INTEGER,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE email_conversations
  SET unread_count = unread_count + 1,
      last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state = 'triage' AND worker_id IS NULL THEN 'triage'
        ELSE 'needs_response'
      END
  WHERE conversation_id = p_conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION touch_email_conversation_inbound(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_email_conversation_inbound(INTEGER, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION touch_email_conversation_outbound(
  p_conversation_id INTEGER,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE email_conversations
  SET last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_outbound_at = GREATEST(COALESCE(last_outbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state IN ('needs_message', 'closed') THEN 'messaged'
        ELSE state
      END
  WHERE conversation_id = p_conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION touch_email_conversation_outbound(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_email_conversation_outbound(INTEGER, TIMESTAMPTZ) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 9. campaign_comms_drafts: 'sendgrid' sent_via + wrapper link
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_comms_drafts
  DROP CONSTRAINT IF EXISTS campaign_comms_drafts_sent_via_check;
-- 'outlook_direct' is included because send-via-outlook already writes
-- it (the previous CHECK silently rejected that update).
ALTER TABLE campaign_comms_drafts
  ADD CONSTRAINT campaign_comms_drafts_sent_via_check
  CHECK (sent_via IS NULL OR sent_via IN
    ('action_network', 'yabbr', 'manual', 'mobile_message', 'sendgrid',
     'outlook_direct'));

ALTER TABLE campaign_comms_drafts
  ADD COLUMN IF NOT EXISTS wrapper_id INTEGER
    REFERENCES email_wrappers(wrapper_id) ON DELETE SET NULL;

COMMENT ON COLUMN campaign_comms_drafts.wrapper_id IS
  'Email wrapper applied at platform (SendGrid) send time. NULL = the default wrapper.';

-- ─────────────────────────────────────────────────────────────
-- 10. RLS + grants
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_wrappers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- email_wrappers: read for all staff, admin-only writes (the
  -- app_settings posture — wrappers are org-wide compliance shells).
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email_wrappers"
    ON email_wrappers FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Admins write email_wrappers"
    ON email_wrappers FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin())';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- email_conversations: read for all staff; writes campaign-gated
  -- when scoped, open to authenticated for org-wide triage rows
  -- (clone of sms_conversations).
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email_conversations"
    ON email_conversations FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert email_conversations"
    ON email_conversations FOR INSERT TO authenticated
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update email_conversations"
    ON email_conversations FOR UPDATE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete email_conversations"
    ON email_conversations FOR DELETE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- email_messages: read for all staff; INSERT follows the parent
  -- conversation's write gate (the staff-reply path). No user
  -- UPDATE/DELETE — messages are immutable; status transitions are
  -- service-role (webhook).
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email_messages"
    ON email_messages FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert email_messages"
    ON email_messages FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM email_conversations c
        WHERE c.conversation_id = email_messages.conversation_id
          AND (c.campaign_id IS NULL OR can_write_to_campaign(c.campaign_id))
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- email_delivery_events / email_unsubscribe_tokens: NO user
  -- policies — service role only.
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON email_wrappers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_conversations TO authenticated;
GRANT SELECT, INSERT ON email_messages TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_wrappers_wrapper_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_conversations_conversation_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_messages_message_id_seq TO authenticated;
-- email_delivery_events / email_unsubscribe_tokens: no grants.

-- ─────────────────────────────────────────────────────────────
-- 11. app_settings seeds
-- ─────────────────────────────────────────────────────────────

INSERT INTO app_settings (key, value)
VALUES
  ('email_provider', ''),
  ('sendgrid_api_key', ''),
  ('sendgrid_webhook_public_key', ''),
  ('email_from_address', ''),
  ('email_from_name', 'Offshore Alliance'),
  ('email_reply_to', '')
ON CONFLICT (key) DO NOTHING;

-- Shared-secret fallback tokens (rotatable via admin settings).
INSERT INTO app_settings (key, value)
SELECT 'email_webhook_token',
       md5(gen_random_uuid()::text || gen_random_uuid()::text)
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'email_webhook_token');

INSERT INTO app_settings (key, value)
SELECT 'email_inbound_token',
       md5(gen_random_uuid()::text || gen_random_uuid()::text)
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'email_inbound_token');

-- ─────────────────────────────────────────────────────────────
-- 12. vw_email_campaign_summary (shape of vw_sms_campaign_summary)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_email_campaign_summary AS
SELECT
  el.campaign_id,
  el.list_id,
  el.name AS list_name,
  el.status AS list_status,
  el.draft_id,
  el.wrapper_id,
  el.timezone,
  el.blackout_override,
  el.scheduled_for,
  el.total_items,
  el.sent_items,
  el.delivered_items,
  el.failed_items,
  el.created_at,
  COUNT(eli.item_id)                                              AS item_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'pending')        AS pending_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'queued')         AS queued_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'sending')        AS sending_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'sent')           AS sent_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'delivered')      AS delivered_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'failed')         AS failed_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'skipped')        AS skipped_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'bounced')        AS bounced_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'unsubscribed')   AS unsubscribed_count,
  COUNT(eli.item_id) FILTER (WHERE eli.status = 'opted_out')      AS opted_out_count,
  CASE WHEN COUNT(eli.item_id) FILTER (WHERE eli.status IN ('sent', 'delivered', 'failed', 'bounced')) > 0
    THEN ROUND(
      100.0 * COUNT(eli.item_id) FILTER (WHERE eli.status = 'delivered')
      / COUNT(eli.item_id) FILTER (WHERE eli.status IN ('sent', 'delivered', 'failed', 'bounced')),
      1)
    ELSE 0
  END AS delivery_rate_pct
FROM email_lists el
LEFT JOIN email_list_items eli ON eli.list_id = el.list_id
GROUP BY el.campaign_id, el.list_id, el.name, el.status, el.draft_id,
         el.wrapper_id, el.timezone, el.blackout_override, el.scheduled_for,
         el.total_items, el.sent_items, el.delivered_items, el.failed_items,
         el.created_at;

GRANT SELECT ON vw_email_campaign_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 13. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE email_delivery_events IS
  'SendGrid Event Webhook audit log (service-role only). '
  'UNIQUE(provider_event_id) makes redelivered webhooks no-ops.';
COMMENT ON TABLE email_wrappers IS
  'Reusable header/footer shells applied around the draft body at '
  'platform send time. footer_html must contain {{unsubscribe_url}}.';
COMMENT ON TABLE email_unsubscribe_tokens IS
  'Per-(worker, send) unsubscribe tokens for /u/[token]. Service-role only.';
COMMENT ON TABLE email_conversations IS
  'Email threads for the hybrid in-app inbox, fed by SendGrid Inbound '
  'Parse (forwarded from the real reveille.net.au mailbox). One thread '
  'per member address per campaign scope (UNIQUE NULLS NOT DISTINCT).';
COMMENT ON TABLE email_messages IS
  'Per-message rows in an email conversation (inbound + outbound). '
  'UNIQUE provider_message_id makes webhook appends idempotent.';
