-- ============================================================
-- SMS module — Phase 1 (broadcast)
--
--   1. sms_lists / sms_list_items — recipient lists for SMS
--      blasts (clone of email_lists / email_list_items, plus
--      sender number, timezone + blackout-override and
--      delivery counters).
--   2. sms_send_log — one row per (draft, worker) at send time
--      (clone of email_send_log).
--   3. sms_delivery_events — provider webhook event audit log,
--      service-role only, UNIQUE(provider_message_id,
--      event_type, part_number) for webhook idempotency.
--   4. campaign_worker_lists.fired_sms_list_id + default_purpose
--      CHECK extended with 'sms'.
--   5. campaign_comms_drafts.sms_list_id + sent_via CHECK
--      extended with 'mobile_message' ('yabbr' kept for
--      historical rows).
--   6. vw_campaign_worker_list_activity — 4th 'sms' branch.
--   7. vw_sms_campaign_summary reporting view.
--   8. app_settings.sms_webhook_token seed (webhook shared-secret
--      fallback when HMAC is not configured).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_lists
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_lists (
  list_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  draft_id INTEGER REFERENCES campaign_comms_drafts(draft_id) ON DELETE SET NULL,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'paused', 'cancelled')),
  source_filters JSONB,
  sender_number_id INTEGER REFERENCES sms_numbers(number_id) ON DELETE SET NULL,
  -- IANA timezone the blackout window is evaluated in (brief §7.2:
  -- worker-level tz is a later refinement; campaign default for now).
  timezone TEXT NOT NULL DEFAULT 'Australia/Perth',
  -- Recorded override of the 09:00–20:00 send window (brief decision 6).
  blackout_override BOOLEAN NOT NULL DEFAULT false,
  blackout_override_reason TEXT,
  scheduled_for TIMESTAMPTZ,
  total_items INTEGER NOT NULL DEFAULT 0,
  sent_items INTEGER NOT NULL DEFAULT 0,
  delivered_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sl_campaign ON sms_lists(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sl_status   ON sms_lists(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_sl_draft    ON sms_lists(draft_id);
-- Dispatcher scan: lists with work to do.
CREATE INDEX IF NOT EXISTS idx_sl_dispatch ON sms_lists(status)
  WHERE status IN ('queued', 'sending');

DROP TRIGGER IF EXISTS trg_sms_lists_updated_at ON sms_lists;
CREATE TRIGGER trg_sms_lists_updated_at
  BEFORE UPDATE ON sms_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. sms_list_items
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_list_items (
  item_id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES sms_lists(list_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  -- Denormalised from workers.phone_e164 at populate time.
  phone_e164 VARCHAR(16),
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- 'sending' = claimed by a dispatcher run (claimed_at set); the
  -- atomic queued→sending claim is the double-send guard across
  -- overlapping cron ticks.
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'queued', 'sending', 'sent', 'delivered', 'failed',
      'skipped', 'opted_out', 'blocked'
    )),
  claimed_at TIMESTAMPTZ,
  provider_message_id VARCHAR(100),
  failure_reason TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Blackout-window deadline stamped at queue time (brief §3.1 item 10):
  -- the message should leave before this instant; the dispatcher
  -- re-stamps when a send is deferred to the next window.
  send_before TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_sli_list   ON sms_list_items(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sli_status ON sms_list_items(list_id, status);
CREATE INDEX IF NOT EXISTS idx_sli_worker ON sms_list_items(worker_id);
CREATE INDEX IF NOT EXISTS idx_sli_provider_message
  ON sms_list_items(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sms_list_items_updated_at ON sms_list_items;
CREATE TRIGGER trg_sms_list_items_updated_at
  BEFORE UPDATE ON sms_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. sms_send_log (clone of email_send_log)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_send_log (
  send_id BIGSERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES campaign_comms_drafts(draft_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  list_id INTEGER REFERENCES sms_lists(list_id) ON DELETE SET NULL,
  phone_e164 VARCHAR(16),
  provider_message_id VARCHAR(100),
  segments INTEGER,
  cost NUMERIC(8, 4),
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'blocked')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  reply_count INTEGER NOT NULL DEFAULT 0,
  first_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_ssl_worker ON sms_send_log(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssl_draft  ON sms_send_log(draft_id);
CREATE INDEX IF NOT EXISTS idx_ssl_list   ON sms_send_log(list_id) WHERE list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssl_provider_message
  ON sms_send_log(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. sms_delivery_events (service-role only)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_delivery_events (
  event_id BIGSERIAL PRIMARY KEY,
  provider_message_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(20) NOT NULL
    CHECK (event_type IN ('queued', 'sent', 'delivered', 'failed', 'replied', 'opted_out')),
  -- Mobile Message reports delivery per message part; 0 = whole message
  -- or part unknown.
  part_number INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Webhook idempotency: at-least-once, out-of-order delivery — a
  -- redelivered event is a no-op (ON CONFLICT DO NOTHING).
  UNIQUE (provider_message_id, event_type, part_number)
);

CREATE INDEX IF NOT EXISTS idx_sde_occurred ON sms_delivery_events(occurred_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. campaign_worker_lists: fired_sms_list_id + 'sms' purpose
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_worker_lists
  ADD COLUMN IF NOT EXISTS fired_sms_list_id INTEGER
    REFERENCES sms_lists(list_id) ON DELETE SET NULL;

COMMENT ON COLUMN campaign_worker_lists.fired_sms_list_id IS
  'When fired into SMS, the sms_lists.list_id created from this cohort. Parity with fired_call_list_id.';

-- Extend default_purpose CHECK with 'sms' (drop + re-add pattern).
ALTER TABLE campaign_worker_lists
  DROP CONSTRAINT IF EXISTS campaign_worker_lists_default_purpose_check;
ALTER TABLE campaign_worker_lists
  ADD CONSTRAINT campaign_worker_lists_default_purpose_check
  CHECK (default_purpose IS NULL OR default_purpose IN ('email', 'phone', 'task', 'sms'));

-- ─────────────────────────────────────────────────────────────
-- 6. campaign_comms_drafts: sms_list_id + 'mobile_message' sent_via
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_comms_drafts
  ADD COLUMN IF NOT EXISTS sms_list_id INTEGER
    REFERENCES sms_lists(list_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ccd_sms_list ON campaign_comms_drafts(sms_list_id)
  WHERE sms_list_id IS NOT NULL;

COMMENT ON COLUMN campaign_comms_drafts.sms_list_id IS
  'Optional FK to sms_lists. Set when a campaign-scoped SMS blast attaches a persisted recipient list to the draft.';

-- 'yabbr' stays valid for historical rows (brief §5.2 item 3).
ALTER TABLE campaign_comms_drafts
  DROP CONSTRAINT IF EXISTS campaign_comms_drafts_sent_via_check;
ALTER TABLE campaign_comms_drafts
  ADD CONSTRAINT campaign_comms_drafts_sent_via_check
  CHECK (sent_via IS NULL OR sent_via IN ('action_network', 'yabbr', 'manual', 'mobile_message'));

-- ─────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_delivery_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- sms_lists: read for authenticated, write via can_write_to_campaign
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_lists"
    ON sms_lists FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can insert sms_lists"
    ON sms_lists FOR INSERT TO authenticated
    WITH CHECK (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can update sms_lists"
    ON sms_lists FOR UPDATE TO authenticated
    USING (can_write_to_campaign(campaign_id))
    WITH CHECK (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can delete sms_lists"
    ON sms_lists FOR DELETE TO authenticated
    USING (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_list_items: policies follow parent list
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_list_items"
    ON sms_list_items FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can insert sms_list_items"
    ON sms_list_items FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM sms_lists sl
        WHERE sl.list_id = sms_list_items.list_id
          AND can_write_to_campaign(sl.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can update sms_list_items"
    ON sms_list_items FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM sms_lists sl
        WHERE sl.list_id = sms_list_items.list_id
          AND can_write_to_campaign(sl.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Campaign writers can delete sms_list_items"
    ON sms_list_items FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM sms_lists sl
        WHERE sl.list_id = sms_list_items.list_id
          AND can_write_to_campaign(sl.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_send_log: read only for authenticated; writes are service-role
  -- (dispatch cron + webhook), matching email_send_log.
  BEGIN EXECUTE 'CREATE POLICY sms_send_log_read
    ON sms_send_log FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_delivery_events: NO user policies — service role only.
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Grants
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_list_items TO authenticated;
GRANT SELECT ON sms_send_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_lists_list_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_list_items_item_id_seq TO authenticated;
-- sms_delivery_events: no grants — service role only.

-- ─────────────────────────────────────────────────────────────
-- 9. vw_campaign_worker_list_activity — add the 'sms' branch
-- ─────────────────────────────────────────────────────────────

-- `vw_campaign_worker_list_activity` answers "which lists is this worker on
-- within this campaign, and on which channel?". One row per
-- (campaign_id, worker_id, channel, list). Sourced from the four
-- per-channel item tables (email / phone / task / sms).
CREATE OR REPLACE VIEW vw_campaign_worker_list_activity AS
-- Email lists
SELECT
  'email'::text   AS channel,
  el.campaign_id  AS campaign_id,
  eli.worker_id   AS worker_id,
  el.list_id      AS list_id,
  el.name         AS list_name,
  el.status       AS list_status,
  eli.status      AS item_status,
  eli.created_at  AS added_at
FROM email_list_items eli
JOIN email_lists el ON el.list_id = eli.list_id
WHERE eli.worker_id IS NOT NULL

UNION ALL

-- Phone / call lists
SELECT
  'phone'::text   AS channel,
  cl.campaign_id  AS campaign_id,
  cli.worker_id   AS worker_id,
  cl.list_id      AS list_id,
  cl.name         AS list_name,
  cl.status       AS list_status,
  cli.status      AS item_status,
  cli.created_at  AS added_at
FROM call_list_items cli
JOIN call_lists cl ON cl.list_id = cli.list_id
WHERE cli.worker_id IS NOT NULL

UNION ALL

-- Activist task lists ("list" badge)
SELECT
  'task'::text       AS channel,
  tl.campaign_id     AS campaign_id,
  tli.worker_id      AS worker_id,
  tl.task_list_id    AS list_id,
  tl.title           AS list_name,
  tl.status          AS list_status,
  NULL::text         AS item_status,
  tli.created_at     AS added_at
FROM campaign_task_list_items tli
JOIN campaign_task_lists tl ON tl.task_list_id = tli.task_list_id
WHERE tli.worker_id IS NOT NULL

UNION ALL

-- SMS lists
SELECT
  'sms'::text     AS channel,
  sl.campaign_id  AS campaign_id,
  sli.worker_id   AS worker_id,
  sl.list_id      AS list_id,
  sl.name         AS list_name,
  sl.status       AS list_status,
  sli.status      AS item_status,
  sli.created_at  AS added_at
FROM sms_list_items sli
JOIN sms_lists sl ON sl.list_id = sli.list_id
WHERE sli.worker_id IS NOT NULL;

GRANT SELECT ON vw_campaign_worker_list_activity TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. vw_sms_campaign_summary (shape of call_campaign_summary)
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
  END AS delivery_rate_pct
FROM sms_lists sl
LEFT JOIN sms_list_items sli ON sli.list_id = sl.list_id
GROUP BY sl.campaign_id, sl.list_id, sl.name, sl.status, sl.draft_id,
         sl.sender_number_id, sl.timezone, sl.blackout_override,
         sl.scheduled_for, sl.total_items, sl.sent_items,
         sl.delivered_items, sl.failed_items, sl.created_at;

GRANT SELECT ON vw_sms_campaign_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 11. Webhook shared-secret fallback token
-- ─────────────────────────────────────────────────────────────

-- Used by /api/sms/webhook (?token=) when provider HMAC verification is
-- not configured. Random per environment; rotatable via the admin
-- settings route.
INSERT INTO app_settings (key, value)
SELECT 'sms_webhook_token',
       md5(gen_random_uuid()::text || gen_random_uuid()::text)
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'sms_webhook_token');

-- ─────────────────────────────────────────────────────────────
-- 12. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE sms_lists IS
  'Persistent recipient lists for SMS broadcasts. Mirrors email_lists; '
  'queued/sending lists are drained by /api/cron/dispatch-sms-queue.';
COMMENT ON TABLE sms_list_items IS
  'Workers on an SMS recipient list. phone_e164 denormalised from '
  'workers.phone_e164 at populate time; opt-out re-checked at send time.';
COMMENT ON TABLE sms_send_log IS
  'One row per (draft, worker) at SMS send time. Mirrors email_send_log; '
  'single source of truth for "did this worker get this SMS?".';
COMMENT ON TABLE sms_delivery_events IS
  'Provider webhook event audit log (service-role only). '
  'UNIQUE(provider_message_id, event_type, part_number) makes redelivered '
  'webhooks no-ops.';
