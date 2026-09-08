-- ============================================================
-- SMS module — Phase 6 (relay & forwarding — "patch-through")
--
-- Relay-with-attribution (brief §6): a dedicated number (claimed
-- from the spare pool via assign_sms_number → purpose 'relay',
-- §7.0) bridged to one or more external target mobiles.
--
--   1. sms_relays — admin-configured relay: number ↔ targets,
--      prefix/suffix templates (merge fields {{first_name}},
--      {{last_name}}, {{employer_name}} — worker context),
--      status active|paused|ended (created 'paused' — explicit
--      activation), optional moderation queue, quiet hours
--      (member→target forwards only leave 09:00–20:00 in the
--      relay timezone; outside the window they queue for the
--      next window). PARTIAL UNIQUE on number_id WHERE status
--      != 'ended' — one live relay per number; 'ended' releases
--      the number back to 'spare' (route calls assign_sms_number).
--   2. sms_relay_targets — the external party's mobiles. NEVER
--      exposed to members (forwards to members always come from
--      the relay number); staff-visible is fine — staff
--      configure them.
--   3. sms_relay_messages — full audit log, both directions.
--      provider_message_id UNIQUE = inbound idempotency handle
--      (webhook retries dedupe here). forwarded_body = the exact
--      outbound forward body, rendered at receipt time
--      (member→target: prefix + member message + suffix;
--      target→member: display-name-prefixed reply) — stored for
--      BOTH directions so a deferred/retried forward sends
--      byte-identical copy. forward_status semantics:
--        held     — not scheduled to forward (pending moderation,
--                   relay paused, opted-out member, unbridgeable
--                   target reply)
--        queued   — approved, awaiting a send slot (quiet-hours
--                   deferral or a transient provider failure; the
--                   timers cron drains these — and nothing else)
--        sending  — claimed by an in-flight send (dispatch-queue
--                   idiom: claimed_at-stamped; stale claims are
--                   swept back to 'queued' after 15 minutes)
--        sent/delivered/failed — provider outcome (delivery
--                   webhooks mirror via forward_provider_message_id;
--                   forwarded_at is stamped ONLY on success)
--        rejected — moderation rejected
--
-- Relay traffic creates NO sms_conversations rows (distinct
-- surface) — worker-matched member messages land in
-- sms_interactions for the worker history instead.
--
-- RLS: ALL THREE tables are authenticated-READ, service-role-
-- WRITE only. Relays/targets deliberately carry no authenticated
-- write policies even though staff configure them: the webhook's
-- relay leg routes on the relay row alone and runs BEFORE
-- conversational routing, so a direct PostgREST insert pointing a
-- relay at an organiser's number would silently siphon that
-- number's member traffic off-platform. Every write goes through
-- /api/sms/relays* on the admin client AFTER an explicit
-- can_write_to_campaign check (org-wide relays: any authenticated
-- staff, still route-mediated). Belt: the webhook additionally
-- requires sms_numbers.purpose = 'relay' before the relay leg
-- fires.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_relays
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_relays (
  relay_id SERIAL PRIMARY KEY,
  -- NULL = org-wide relay (e.g. a national advocacy number).
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  -- The dedicated relay number. purpose='relay' is enforced at
  -- route level (create claims the number via assign_sms_number).
  number_id INTEGER NOT NULL REFERENCES sms_numbers(number_id),
  -- Merge fields: {{first_name}}, {{last_name}}, {{employer_name}}
  -- (worker context; unmatched worker renders "A member").
  prefix_template TEXT,
  suffix_template TEXT,
  -- Created paused: forwarding starts only on explicit activation.
  status VARCHAR(10) NOT NULL DEFAULT 'paused'
    CHECK (status IN ('active', 'paused', 'ended')),
  moderation_required BOOLEAN NOT NULL DEFAULT false,
  -- Member→target forwards leave only 09:00–20:00 in `timezone`;
  -- outside the window they queue for the next window open.
  quiet_hours_respected BOOLEAN NOT NULL DEFAULT true,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Australia/Perth',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live (non-ended) relay per number — the webhook's routing
-- precedence depends on the number → relay mapping being unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_relays_live_number
  ON sms_relays(number_id) WHERE status != 'ended';

CREATE INDEX IF NOT EXISTS idx_sms_relays_campaign
  ON sms_relays(campaign_id) WHERE campaign_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sms_relays_updated_at ON sms_relays;
CREATE TRIGGER trg_sms_relays_updated_at
  BEFORE UPDATE ON sms_relays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. sms_relay_targets
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_relay_targets (
  target_id SERIAL PRIMARY KEY,
  relay_id INTEGER NOT NULL REFERENCES sms_relays(relay_id) ON DELETE CASCADE,
  -- The external party's mobile — never exposed to members.
  phone_e164 VARCHAR(16) NOT NULL,
  -- e.g. "MP's office", "HSR contact" — prefixes target replies
  -- bridged back to members for clarity.
  display_name VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (relay_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_sms_relay_targets_relay
  ON sms_relay_targets(relay_id);

-- ─────────────────────────────────────────────────────────────
-- 3. sms_relay_messages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_relay_messages (
  relay_message_id BIGSERIAL PRIMARY KEY,
  relay_id INTEGER NOT NULL REFERENCES sms_relays(relay_id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL
    CHECK (direction IN ('member_to_target', 'target_to_member')),
  member_worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  -- NULL only on an unbridgeable target reply (no member ever
  -- forwarded on the relay).
  member_phone_e164 VARCHAR(16),
  target_id INTEGER REFERENCES sms_relay_targets(target_id) ON DELETE SET NULL,
  -- The original inbound body, verbatim.
  body TEXT,
  -- The exact outbound forward body, rendered at receipt time and
  -- stored for BOTH directions (member→target: prefix + member
  -- message + suffix with worker merge fields; target→member:
  -- display-name-prefixed reply) so deferred/retried forwards send
  -- byte-identical copy.
  forwarded_body TEXT,
  moderation_status VARCHAR(15) NOT NULL DEFAULT 'auto_approved'
    CHECK (moderation_status IN ('auto_approved', 'pending', 'approved', 'rejected')),
  moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  -- Inbound idempotency: Mobile Message redelivers at-least-once.
  provider_message_id VARCHAR(100) UNIQUE,
  -- The outbound forward's provider id (first target on fan-out).
  forward_provider_message_id VARCHAR(100),
  forward_status VARCHAR(10) NOT NULL DEFAULT 'queued'
    CHECK (forward_status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'held', 'rejected')),
  -- Claim stamp for the 'sending' state (dispatch-queue idiom);
  -- claims stranded by a crash are swept back to 'queued' after
  -- 15 minutes by the timers cron.
  claimed_at TIMESTAMPTZ,
  -- Stamped ONLY after a successful provider send — a failed
  -- forward never becomes a bridging-map candidate.
  forwarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_relay_messages_relay
  ON sms_relay_messages(relay_id, created_at DESC);
-- The cron's work queue: approved rows (both directions) awaiting
-- a send slot or retry.
CREATE INDEX IF NOT EXISTS idx_sms_relay_messages_queued
  ON sms_relay_messages(relay_id)
  WHERE forward_status = 'queued';
-- Delivery-webhook mirror lookup.
CREATE INDEX IF NOT EXISTS idx_sms_relay_messages_forward_pmid
  ON sms_relay_messages(forward_provider_message_id)
  WHERE forward_provider_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_relays ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_relay_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_relay_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ALL THREE tables: staff read only, service-role writes only.
  -- Relays/targets are deliberately NOT staff-writable via
  -- PostgREST: the webhook relay leg routes on the relay row and
  -- outranks conversational routing, so a direct insert pointing a
  -- relay at an organiser's number would siphon that number's
  -- inbound member traffic off-platform. Writes go through the
  -- /api/sms/relays* routes (admin client) after an explicit
  -- can_write_to_campaign check.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_relays"
    ON sms_relays FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_relay_targets"
    ON sms_relay_targets FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_relay_messages"
    ON sms_relay_messages FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Grants (SELECT only — belt behind the missing policies)
-- ─────────────────────────────────────────────────────────────

GRANT SELECT ON sms_relays TO authenticated;
GRANT SELECT ON sms_relay_targets TO authenticated;
GRANT SELECT ON sms_relay_messages TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE sms_relays IS
  'SMS relay-with-attribution (brief §6): dedicated number bridged '
  'to external target mobiles. Created paused; one live relay per '
  'number (partial unique); ending releases the number to ''spare''. '
  'Service-role writes only — the relay leg outranks conversational '
  'routing, so rows are route-mediated (see Phase 6 plan).';
COMMENT ON TABLE sms_relay_targets IS
  'External-party mobiles behind a relay — never exposed to '
  'members; forwards to members always come from the relay number. '
  'Service-role writes only (route-mediated). Platform sms_numbers '
  'can never be targets (route-enforced — prevents relay rings).';
COMMENT ON TABLE sms_relay_messages IS
  'Relay audit log, both directions. provider_message_id = inbound '
  'idempotency; forward_status: held (not scheduled), queued '
  '(awaiting window/retry — cron), sending (claimed, claimed_at-'
  'stamped, stale-swept), sent/delivered/failed (provider outcome), '
  'rejected (moderation). forwarded_at only ever set on success.';
COMMENT ON COLUMN sms_relay_messages.forwarded_body IS
  'The exact outbound forward body, both directions (member→target: '
  'prefix + member message + suffix; target→member: display-name-'
  'prefixed reply), rendered at receipt time.';
