-- ============================================================
-- SMS module — Phase 2 (inbox & 2-way conversations)
--
--   1. sms_conversations — the thread table (brief §7.1): one
--      thread per (our number, member phone) pair per campaign
--      scope, Spoke state machine + 'triage', sticky escalation,
--      soft-claim TTL fields, unread counter.
--   2. sms_messages — per-message rows (inbound + outbound),
--      linked to the sms_interactions assessment-capture row
--      when one exists; UNIQUE provider_message_id = webhook
--      idempotency for thread appends.
--   3. sms_conversation_notes — internal "Whisper" notes.
--   4. sms_canned_replies — org-wide + campaign-scoped snippets.
--   5. RPCs: claim/release (soft claim, TTL — the
--      claim_next_call_list_item idiom), atomic counter helpers
--      (unread bump, reply_count bump, outbound touch) so the
--      webhook/cron never do read-modify-write.
--   6. Realtime: sms_messages added to the supabase_realtime
--      publication (guarded — must not fail when the
--      publication is absent or the table already a member).
--
-- State semantics (brief §3.1 item 2, Spoke verbatim):
--   needs_message → messaged → needs_response → convo → closed
--   plus 'triage' for unmatched inbound. Inbound always flips a
--   worker-matched thread to needs_response (including closed —
--   reopen — and convo); worker-less rows stay 'triage'.
--   escalated_to_user_id is sticky and independent of state.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_conversations
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_conversations (
  conversation_id SERIAL PRIMARY KEY,
  our_number_id INTEGER NOT NULL REFERENCES sms_numbers(number_id),
  -- NULL = unmatched inbound (triage) or worker later deleted.
  worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  -- The member side of the pair (thread key half).
  phone_e164 VARCHAR(16) NOT NULL,
  -- NULL = org-wide triage scope; set when the thread is scoped
  -- to a campaign (from the originating blast or manual attach).
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  activity_id INTEGER REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'triage'
    CHECK (state IN ('needs_message', 'messaged', 'needs_response', 'convo', 'closed', 'triage')),
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Sticky escalation (brief §3.1 item 5): while set, the thread
  -- keeps surfacing in the escalation inbox whatever the state.
  escalated_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Soft claim + TTL (the claim_next_call_list_item idiom).
  claim_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_until TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One thread per number-pair per campaign scope. NULLS NOT
  -- DISTINCT so the org-wide (campaign NULL) scope is unique
  -- too. Closed rows occupy the key deliberately: a new inbound
  -- reopens the same thread instead of forking it.
  CONSTRAINT uq_sms_conversations_thread
    UNIQUE NULLS NOT DISTINCT (our_number_id, phone_e164, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_sconv_pair
  ON sms_conversations(our_number_id, phone_e164);
CREATE INDEX IF NOT EXISTS idx_sconv_state
  ON sms_conversations(state, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sconv_worker
  ON sms_conversations(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sconv_campaign
  ON sms_conversations(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sconv_assignee
  ON sms_conversations(assignee_user_id) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sconv_escalated
  ON sms_conversations(escalated_to_user_id) WHERE escalated_to_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sms_conversations_updated_at ON sms_conversations;
CREATE TRIGGER trg_sms_conversations_updated_at
  BEFORE UPDATE ON sms_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. sms_messages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_messages (
  message_id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL
    REFERENCES sms_conversations(conversation_id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT,
  phone_e164 VARCHAR(16),
  -- Staff sender for outbound rows (blast creator or replier).
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Plain UNIQUE constraint (NULLs allowed) rather than the
  -- partial-index house variant: PostgREST upserts must be able
  -- to infer it via ON CONFLICT (provider_message_id) — the
  -- webhook/cron idempotency handle for thread appends.
  provider_message_id VARCHAR(100) UNIQUE,
  -- Link to the assessment-capture row when one exists
  -- (worker-matched inbound; Phase 3 reads this).
  interaction_id INTEGER REFERENCES sms_interactions(id) ON DELETE SET NULL,
  -- inbound: 'received'; outbound: queued → sent → delivered|failed.
  status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'failed')),
  error TEXT,
  segments INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smsg_conversation
  ON sms_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_smsg_interaction
  ON sms_messages(interaction_id) WHERE interaction_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. sms_conversation_notes (Textline "Whisper" pattern)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_conversation_notes (
  note_id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL
    REFERENCES sms_conversations(conversation_id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scnotes_conversation
  ON sms_conversation_notes(conversation_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 4. sms_canned_replies
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_canned_replies (
  reply_id SERIAL PRIMARY KEY,
  -- NULL = org-wide.
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scr_campaign
  ON sms_canned_replies(campaign_id) WHERE campaign_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sms_canned_replies_updated_at ON sms_canned_replies;
CREATE TRIGGER trg_sms_canned_replies_updated_at
  BEFORE UPDATE ON sms_canned_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. RPCs
-- ─────────────────────────────────────────────────────────────

-- Soft claim with TTL (collision prevention, brief §3.1 item 6 —
-- warn, don't block; the claim is advisory). Succeeds when the
-- thread is unclaimed, the claim expired, or the caller already
-- holds it (renewal). The UPDATE's row lock serialises races: the
-- loser re-evaluates the predicate against the winner's claim and
-- returns false.
CREATE OR REPLACE FUNCTION claim_sms_conversation(
  p_conversation_id INTEGER,
  p_ttl_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE sms_conversations
  SET claim_user_id = v_uid,
      claimed_until = now() + make_interval(mins => GREATEST(p_ttl_minutes, 1))
  WHERE conversation_id = p_conversation_id
    AND (
      claim_user_id IS NULL
      OR claim_user_id = v_uid
      OR claimed_until IS NULL
      OR claimed_until < now()
    );

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_sms_conversation(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_sms_conversation(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION claim_sms_conversation IS
  'Soft-claims an SMS conversation for the caller (TTL minutes). '
  'Returns true when the claim was set/renewed; false when another '
  'user holds an unexpired claim.';

-- Clears the caller's own claim only.
CREATE OR REPLACE FUNCTION release_sms_conversation(
  p_conversation_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sms_conversations
  SET claim_user_id = NULL,
      claimed_until = NULL
  WHERE conversation_id = p_conversation_id
    AND claim_user_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION release_sms_conversation(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_sms_conversation(INTEGER) TO authenticated;

-- Atomic reply-count bump on sms_send_log (replaces the Phase 1
-- webhook read-modify-write). Service-role only (webhook path).
CREATE OR REPLACE FUNCTION increment_sms_reply_count(
  p_send_id BIGINT,
  p_received_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sms_send_log
  SET reply_count = reply_count + 1,
      first_reply_at = COALESCE(first_reply_at, p_received_at)
  WHERE send_id = p_send_id;
$$;

REVOKE EXECUTE ON FUNCTION increment_sms_reply_count(BIGINT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_sms_reply_count(BIGINT, TIMESTAMPTZ) TO service_role;

-- Atomic inbound touch: unread bump + monotonic timestamps + the
-- Spoke state flip. Worker-less rows stay 'triage'; everything
-- else (incl. closed → reopen, convo) flips to needs_response.
-- escalated_to_user_id is deliberately untouched (sticky).
-- Service-role only (webhook path).
CREATE OR REPLACE FUNCTION touch_sms_conversation_inbound(
  p_conversation_id INTEGER,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sms_conversations
  SET unread_count = unread_count + 1,
      last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state = 'triage' AND worker_id IS NULL THEN 'triage'
        ELSE 'needs_response'
      END
  WHERE conversation_id = p_conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION touch_sms_conversation_inbound(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_sms_conversation_inbound(INTEGER, TIMESTAMPTZ) TO service_role;

-- Atomic outbound (blast-mirror) touch: timestamps + the
-- needs_message/closed → messaged transition. 1:1 replies do a
-- plain RLS-checked UPDATE from the route instead (state 'convo',
-- unread reset — no counter arithmetic). Service-role only.
CREATE OR REPLACE FUNCTION touch_sms_conversation_outbound(
  p_conversation_id INTEGER,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sms_conversations
  SET last_message_at = GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_outbound_at = GREATEST(COALESCE(last_outbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state IN ('needs_message', 'closed') THEN 'messaged'
        ELSE state
      END
  WHERE conversation_id = p_conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION touch_sms_conversation_outbound(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION touch_sms_conversation_outbound(INTEGER, TIMESTAMPTZ) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_canned_replies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- sms_conversations: read for all staff; writes campaign-gated
  -- when scoped, open to authenticated for org-wide (NULL
  -- campaign) triage rows — staff organisers are the core inbox
  -- scope (brief decision 4) and triage is a shared queue.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_conversations"
    ON sms_conversations FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_conversations"
    ON sms_conversations FOR INSERT TO authenticated
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update sms_conversations"
    ON sms_conversations FOR UPDATE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_conversations"
    ON sms_conversations FOR DELETE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_messages: read for all staff; INSERT follows the parent
  -- conversation's write gate (the 1:1 reply path). No user
  -- UPDATE/DELETE — messages are immutable; status transitions
  -- are service-role (webhook/cron).
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_messages"
    ON sms_messages FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_messages"
    ON sms_messages FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM sms_conversations c
        WHERE c.conversation_id = sms_messages.conversation_id
          AND (c.campaign_id IS NULL OR can_write_to_campaign(c.campaign_id))
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_conversation_notes: read for all staff; author-stamped
  -- insert; author-only update/delete.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_conversation_notes"
    ON sms_conversation_notes FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authors insert sms_conversation_notes"
    ON sms_conversation_notes FOR INSERT TO authenticated
    WITH CHECK (author_user_id = auth.uid())';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authors update sms_conversation_notes"
    ON sms_conversation_notes FOR UPDATE TO authenticated
    USING (author_user_id = auth.uid())
    WITH CHECK (author_user_id = auth.uid())';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authors delete sms_conversation_notes"
    ON sms_conversation_notes FOR DELETE TO authenticated
    USING (author_user_id = auth.uid())';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_canned_replies: read for all staff; writes campaign-gated
  -- when scoped, authenticated for org-wide snippets.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_canned_replies"
    ON sms_canned_replies FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_canned_replies"
    ON sms_canned_replies FOR INSERT TO authenticated
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update sms_canned_replies"
    ON sms_canned_replies FOR UPDATE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_canned_replies"
    ON sms_canned_replies FOR DELETE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_conversations TO authenticated;
GRANT SELECT, INSERT ON sms_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_conversation_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_canned_replies TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_conversations_conversation_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_messages_message_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_conversation_notes_note_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_canned_replies_reply_id_seq TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. Realtime publication (live thread updates)
-- ─────────────────────────────────────────────────────────────

-- Guarded: duplicate_object = table already in the publication;
-- undefined_object = the supabase_realtime publication does not
-- exist (self-hosted/CI shadow DB) — neither may fail the
-- migration.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 9. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE sms_conversations IS
  'SMS threads: one per (our number, member phone) pair per campaign '
  'scope (UNIQUE NULLS NOT DISTINCT). Spoke state machine + triage for '
  'unmatched inbound; sticky escalation; soft claim with TTL.';
COMMENT ON TABLE sms_messages IS
  'Per-message rows in an SMS conversation (inbound + outbound). '
  'UNIQUE provider_message_id makes webhook/cron appends idempotent; '
  'interaction_id links the assessment-capture row when one exists.';
COMMENT ON TABLE sms_conversation_notes IS
  'Internal staff-only notes rendered inline in the thread '
  '(Textline Whisper pattern). Never sent to the member.';
COMMENT ON TABLE sms_canned_replies IS
  'Reusable reply snippets for the SMS inbox; campaign_id NULL = org-wide.';
