-- Email Engagement Tracking
-- Phase 0: core tables, worker email_status columns, trigger, and seed tags.

-- One row per (draft, worker) at send time. Single source of truth for
-- "did this worker get this email?" across all four send paths.
CREATE TABLE email_send_log (
  send_id                  bigserial PRIMARY KEY,
  draft_id                 bigint NOT NULL REFERENCES campaign_comms_drafts(draft_id) ON DELETE CASCADE,
  campaign_id              bigint NOT NULL,
  worker_id                bigint NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  recipient_email          text NOT NULL,
  -- 'outlook_personalised' | 'outlook_bcc' | 'action_network' | 'mailto' | 'eml'
  send_method              text NOT NULL,
  -- Graph conversationId from POST /me/messages. NULL for AN / mailto / eml paths.
  conversation_id          text,
  -- Graph message ID of the created draft (for cross-referencing / audit).
  external_message_id      text,
  user_id                  uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Materialised engagement signals (updated by poll cron + click redirector).
  replied_at               timestamptz,                 -- first reply timestamp only
  reply_snippet            text,                        -- first reply snippet only
  first_reply_message_id   text,                        -- Graph id of first reply
  latest_reply_message_id  text,                        -- Graph id of most recent reply (for deep-link on multi-reply threads)
  reply_count              int NOT NULL DEFAULT 0,      -- count of all replies received
  bounced_at               timestamptz,
  bounce_reason            text,
  first_click_at           timestamptz,
  click_count              int NOT NULL DEFAULT 0,
  UNIQUE (draft_id, worker_id)
);
CREATE INDEX email_send_log_worker_idx          ON email_send_log (worker_id, created_at DESC);
CREATE INDEX email_send_log_draft_idx           ON email_send_log (draft_id);
CREATE INDEX email_send_log_conversation_idx    ON email_send_log (conversation_id) WHERE conversation_id IS NOT NULL;

-- Granular event audit log.
CREATE TABLE email_engagement_events (
  event_id     bigserial PRIMARY KEY,
  send_id      bigint NOT NULL REFERENCES email_send_log(send_id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('replied','bounced','clicked','forwarded')),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb
);
CREATE INDEX email_engagement_events_send_idx ON email_engagement_events (send_id, occurred_at DESC);

-- Click-tracking tokens. One row per (send, original_url).
CREATE TABLE email_click_tokens (
  token        text PRIMARY KEY,                -- 22-char URL-safe random
  send_id      bigint NOT NULL REFERENCES email_send_log(send_id) ON DELETE CASCADE,
  target_url   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  hits         int NOT NULL DEFAULT 0
);
CREATE INDEX email_click_tokens_send_idx ON email_click_tokens (send_id);

-- Worker email validity flag — set by bounce phase, auto-cleared on email edit.
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS email_status text
    CHECK (email_status IN ('valid','invalid','unverified')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_status_updated_at timestamptz;

-- Trigger: editing workers.email clears email_status so a corrected address
-- becomes eligible for sending again. The composer's recipient selection
-- filter joins on email_status; NULL = eligible, 'invalid' = skipped.
CREATE OR REPLACE FUNCTION reset_worker_email_status_on_email_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_status := NULL;
    NEW.email_status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workers_email_status_reset ON workers;
CREATE TRIGGER workers_email_status_reset
  BEFORE UPDATE OF email ON workers
  FOR EACH ROW EXECUTE FUNCTION reset_worker_email_status_on_email_change();

-- Per-user mailbox poll cursor.
ALTER TABLE user_oauth_connections
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

-- Seed engagement tags.
INSERT INTO tags (tag_name, tag_category, color) VALUES
  ('Emailed',       'email', '#6366f1'),
  ('Replied',       'email', '#10b981'),
  ('Email bounced', 'email', '#ef4444'),
  ('Clicked link',  'email', '#0ea5e9')
ON CONFLICT (tag_name) DO NOTHING;

-- RLS
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_click_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_send_log_read ON email_send_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY email_engagement_events_read ON email_engagement_events
  FOR SELECT TO authenticated USING (true);
-- email_click_tokens: no user policy → server-only via service role.
