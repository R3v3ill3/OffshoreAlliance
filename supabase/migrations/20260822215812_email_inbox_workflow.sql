-- Campaign-aware email inbox: workflow, message fidelity, attachments,
-- realtime, and staff collaboration. Additive only: the existing
-- (email_address, campaign_id) thread key and forwarding pipeline remain intact.

-- ─────────────────────────────────────────────────────────────
-- 1. Conversation and message metadata
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_conversations
  ADD COLUMN IF NOT EXISTS original_subject VARCHAR(500),
  ADD COLUMN IF NOT EXISTS subject_normalized VARCHAR(500),
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_rfc_message_id VARCHAR(300),
  ADD COLUMN IF NOT EXISTS rfc_references TEXT,
  ADD COLUMN IF NOT EXISTS graph_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS claim_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS rfc_message_id VARCHAR(300),
  ADD COLUMN IF NOT EXISTS rfc_references TEXT,
  ADD COLUMN IF NOT EXISTS graph_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_workflow_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_workflow_processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_workflow_error TEXT;

ALTER TABLE email_delivery_events
  ADD COLUMN IF NOT EXISTS email_message_id BIGINT
    REFERENCES email_messages(message_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_error TEXT;

ALTER TABLE email_engagement_events
  ADD COLUMN IF NOT EXISTS source_message_id TEXT;

ALTER TABLE worker_notes
  ADD COLUMN IF NOT EXISTS email_message_id BIGINT
    REFERENCES email_messages(message_id) ON DELETE SET NULL;

UPDATE email_conversations
SET original_subject = subject
WHERE original_subject IS NULL AND subject IS NOT NULL;

UPDATE email_messages
SET rfc_message_id = provider_message_id
WHERE direction = 'inbound'
  AND rfc_message_id IS NULL
  AND provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION normalise_email_subject(p_subject TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT NULLIF(
    lower(
      trim(
        regexp_replace(
          p_subject,
          '^(\s*((re|fw|fwd)\s*:\s*))+',
          '',
          'i'
        )
      )
    ),
    ''
  );
$$;

UPDATE email_conversations
SET subject_normalized = normalise_email_subject(subject)
WHERE subject IS NOT NULL
  AND subject_normalized IS DISTINCT FROM normalise_email_subject(subject);

-- Every append refreshes the queue's current subject and preview. This keeps
-- all ingestion paths consistent without coupling the UI to a specific webhook.
CREATE OR REPLACE FUNCTION refresh_email_conversation_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE email_conversations
  SET
    original_subject = COALESCE(original_subject, NULLIF(NEW.subject, '')),
    subject = COALESCE(NULLIF(NEW.subject, ''), subject),
    subject_normalized = COALESCE(
      normalise_email_subject(NULLIF(NEW.subject, '')),
      subject_normalized
    ),
    last_message_preview = NULLIF(
      left(
        trim(
          regexp_replace(
            COALESCE(NULLIF(NEW.body_text, ''), regexp_replace(COALESCE(NEW.body_html, ''), '<[^>]+>', ' ', 'g')),
            '\s+',
            ' ',
            'g'
          )
        ),
        240
      ),
      ''
    ),
    last_rfc_message_id = COALESCE(NEW.rfc_message_id, last_rfc_message_id),
    rfc_references = COALESCE(NEW.rfc_references, rfc_references)
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_email_conversation_from_message
  ON email_messages;
CREATE TRIGGER trg_refresh_email_conversation_from_message
  AFTER INSERT ON email_messages
  FOR EACH ROW EXECUTE FUNCTION refresh_email_conversation_from_message();

-- Repair the stale queue subject/preview for conversations that predate this
-- trigger, while preserving the old conversation subject as original_subject.
UPDATE email_conversations c
SET
  subject = COALESCE(NULLIF(latest.subject, ''), c.subject),
  subject_normalized = COALESCE(
    normalise_email_subject(NULLIF(latest.subject, '')),
    c.subject_normalized
  ),
  last_message_preview = NULLIF(
    left(
      trim(
        regexp_replace(
          COALESCE(
            NULLIF(latest.body_text, ''),
            regexp_replace(COALESCE(latest.body_html, ''), '<[^>]+>', ' ', 'g')
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      240
    ),
    ''
  )
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    subject,
    body_text,
    body_html
  FROM email_messages
  ORDER BY conversation_id, message_id DESC
) latest
WHERE latest.conversation_id = c.conversation_id;

CREATE INDEX IF NOT EXISTS idx_econv_assignee
  ON email_conversations(assignee_user_id, last_message_at DESC)
  WHERE assignee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_econv_active_claim
  ON email_conversations(claim_user_id, claimed_until)
  WHERE claim_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_econv_closed_by
  ON email_conversations(closed_by_user_id)
  WHERE closed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_econv_inbox
  ON email_conversations(last_message_at DESC, conversation_id DESC);
CREATE INDEX IF NOT EXISTS idx_econv_subject_normalized
  ON email_conversations(subject_normalized)
  WHERE subject_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_econv_graph_conversation
  ON email_conversations(graph_conversation_id)
  WHERE graph_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emsg_conversation_page
  ON email_messages(conversation_id, message_id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_rfc_message_id
  ON email_messages(rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_graph_message_id
  ON email_messages(graph_message_id)
  WHERE graph_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_id_conversation
  ON email_messages(message_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_pending_reply_workflow
  ON email_messages(reply_workflow_processing_started_at, created_at)
  WHERE reply_workflow_processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ede_email_message
  ON email_delivery_events(email_message_id)
  WHERE email_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_engagement_source_message
  ON email_engagement_events(send_id, event_type, source_message_id)
  WHERE source_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_notes_email_message
  ON worker_notes(email_message_id)
  WHERE email_message_id IS NOT NULL;

-- Complete one inbound reply exactly once. The workflow marker and unread
-- increment commit in the same database transaction, so retries cannot bump
-- unread twice or permanently skip the queue touch.
CREATE OR REPLACE FUNCTION complete_email_reply_workflow(
  p_message_id BIGINT,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id INTEGER;
BEGIN
  UPDATE email_messages
  SET reply_workflow_processed_at = now(),
      reply_workflow_processing_started_at = NULL,
      reply_workflow_error = NULL
  WHERE message_id = p_message_id
    AND reply_workflow_processed_at IS NULL
    AND reply_workflow_processing_started_at IS NOT NULL
  RETURNING conversation_id INTO v_conversation_id;

  IF v_conversation_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE email_conversations
  SET unread_count = unread_count + 1,
      last_message_at =
        GREATEST(COALESCE(last_message_at, p_occurred_at), p_occurred_at),
      last_inbound_at =
        GREATEST(COALESCE(last_inbound_at, p_occurred_at), p_occurred_at),
      state = CASE
        WHEN state = 'triage' AND worker_id IS NULL THEN 'triage'
        ELSE 'needs_response'
      END
  WHERE conversation_id = v_conversation_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_email_reply_workflow(BIGINT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_email_reply_workflow(BIGINT, TIMESTAMPTZ)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Staff notes, saved replies, and conversation audit events
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_conversation_notes (
  note_id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL
    REFERENCES email_conversations(conversation_id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecnotes_conversation
  ON email_conversation_notes(conversation_id, created_at, note_id);
CREATE INDEX IF NOT EXISTS idx_ecnotes_author
  ON email_conversation_notes(author_user_id);

CREATE TABLE IF NOT EXISTS email_canned_replies (
  reply_id BIGSERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL CHECK (length(trim(title)) >= 1),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecr_campaign_active
  ON email_canned_replies(campaign_id, title)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_ecr_campaign
  ON email_canned_replies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ecr_created_by
  ON email_canned_replies(created_by)
  WHERE created_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_email_canned_replies_updated_at
  ON email_canned_replies;
CREATE TRIGGER trg_email_canned_replies_updated_at
  BEFORE UPDATE ON email_canned_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS email_conversation_events (
  event_id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL
    REFERENCES email_conversations(conversation_id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL CHECK (
    event_type IN (
      'assigned', 'state_changed', 'campaign_attached',
      'worker_matched', 'opt_out_changed'
    )
  ),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ece_conversation
  ON email_conversation_events(conversation_id, created_at, event_id);
CREATE INDEX IF NOT EXISTS idx_ece_actor
  ON email_conversation_events(actor_user_id)
  WHERE actor_user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Persisted attachments in a private Storage bucket
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_message_attachments (
  attachment_id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL,
  conversation_id INTEGER NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'email-attachments',
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  byte_size BIGINT,
  content_id TEXT,
  is_inline BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_email_attachment_message_conversation
    FOREIGN KEY (message_id, conversation_id)
    REFERENCES email_messages(message_id, conversation_id)
    ON DELETE CASCADE,
  CONSTRAINT uq_email_attachment_path UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_ema_message
  ON email_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_ema_conversation
  ON email_message_attachments(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ema_created_by
  ON email_message_attachments(created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS and grants
-- ─────────────────────────────────────────────────────────────

ALTER TABLE email_conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_canned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_message_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email conversation notes"
    ON email_conversation_notes FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authors insert email conversation notes"
    ON email_conversation_notes FOR INSERT TO authenticated
    WITH CHECK (
      author_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM email_conversations c
        WHERE c.conversation_id = email_conversation_notes.conversation_id
          AND (c.campaign_id IS NULL OR can_write_to_campaign(c.campaign_id))
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email canned replies"
    ON email_canned_replies FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert email canned replies"
    ON email_canned_replies FOR INSERT TO authenticated
    WITH CHECK (
      created_by = (SELECT auth.uid())
      AND (campaign_id IS NULL OR can_write_to_campaign(campaign_id))
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update email canned replies"
    ON email_canned_replies FOR UPDATE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete email canned replies"
    ON email_canned_replies FOR DELETE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email conversation events"
    ON email_conversation_events FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert email conversation events"
    ON email_conversation_events FOR INSERT TO authenticated
    WITH CHECK (
      actor_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM email_conversations c
        WHERE c.conversation_id = email_conversation_events.conversation_id
          AND (c.campaign_id IS NULL OR can_write_to_campaign(c.campaign_id))
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email attachments"
    ON email_message_attachments FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read email attachment objects"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = ''email-attachments'')';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

REVOKE UPDATE, DELETE ON email_conversation_notes FROM authenticated;
GRANT SELECT, INSERT ON email_conversation_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_canned_replies TO authenticated;
GRANT SELECT, INSERT ON email_conversation_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON email_message_attachments FROM authenticated;
GRANT SELECT ON email_message_attachments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_conversation_notes_note_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_canned_replies_reply_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_conversation_events_event_id_seq TO authenticated;

-- Presence and typing use private Realtime channels. Authorize only staff who
-- can work with the campaign scope behind the requested conversation topic.
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY "Staff receive private email conversation realtime"
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      CASE
        WHEN realtime.topic() ~ ''^email-conversation:[0-9]+$'' THEN EXISTS (
          SELECT 1
          FROM public.email_conversations c
          WHERE c.conversation_id =
            split_part(realtime.topic(), '':'', 2)::integer
            AND (
              c.campaign_id IS NULL
              OR public.can_write_to_campaign(c.campaign_id)
            )
        )
        ELSE false
      END
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff send private email conversation realtime"
    ON realtime.messages FOR INSERT TO authenticated
    WITH CHECK (
      CASE
        WHEN realtime.topic() ~ ''^email-conversation:[0-9]+$'' THEN EXISTS (
          SELECT 1
          FROM public.email_conversations c
          WHERE c.conversation_id =
            split_part(realtime.topic(), '':'', 2)::integer
            AND (
              c.campaign_id IS NULL
              OR public.can_write_to_campaign(c.campaign_id)
            )
        )
        ELSE false
      END
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE email_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE email_conversation_notes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE email_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE email_conversation_notes IS
  'Internal staff notes rendered in the email timeline; never sent externally.';
COMMENT ON TABLE email_canned_replies IS
  'Reusable email inbox reply snippets; campaign_id NULL means organisation-wide.';
COMMENT ON TABLE email_conversation_events IS
  'Staff workflow audit trail for assignment, state, campaign, worker, and consent changes.';
COMMENT ON TABLE email_message_attachments IS
  'Private Storage metadata for inbound and outbound email attachments.';
COMMENT ON COLUMN email_conversations.subject IS
  'Latest non-empty message subject, refreshed by the message append trigger.';
COMMENT ON COLUMN email_conversations.original_subject IS
  'First non-empty subject observed for the conversation.';
COMMENT ON COLUMN email_conversations.graph_conversation_id IS
  'Microsoft Graph conversation id when this in-app thread has been reconciled with Outlook.';
