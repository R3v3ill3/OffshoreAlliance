-- Per-user OAuth connections for outbound integrations (Microsoft Graph
-- "save to Outlook drafts", later Gmail).
--
-- Refresh tokens are sensitive credentials and MUST be encrypted at rest.
-- We store ciphertext (base64) here; the wrapping key lives in the server
-- env (OAUTH_TOKEN_ENCRYPTION_KEY) and never touches the database. Access
-- tokens are short-lived (1h for Microsoft) but cached here to avoid a
-- refresh round-trip on every send action.
--
-- RLS: each user sees / mutates only their own connection. Writes go via
-- service-role from the OAuth callback + refresh paths; SELECTs from the
-- user's own session are scoped by auth.uid().

CREATE TABLE IF NOT EXISTS user_oauth_connections (
  connection_id        bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider             text NOT NULL CHECK (provider IN ('microsoft', 'google')),
  -- Stable identifier from the provider (Microsoft objectId / Google sub).
  -- Different from `email` because users can change their primary email.
  provider_user_id     text NOT NULL,
  -- For display only — the mailbox address the user authorised.
  email                text,
  display_name         text,
  tenant_id            text,
  scopes               text NOT NULL,
  -- Ciphertext format: base64(iv || ciphertext || authTag), AES-256-GCM.
  access_token_ct      text,
  access_token_expires_at timestamptz,
  refresh_token_ct     text NOT NULL,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'revoked', 'error')),
  last_error           text,
  last_used_at         timestamptz,
  connected_at         timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_oauth_connections_user_idx
  ON user_oauth_connections (user_id);

-- Audit log of save-to-drafts batch operations so we can debug + show the
-- user a recent history.
CREATE TABLE IF NOT EXISTS oauth_send_batches (
  batch_id             bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id        bigint REFERENCES user_oauth_connections(connection_id) ON DELETE SET NULL,
  draft_id             bigint REFERENCES campaign_comms_drafts(draft_id) ON DELETE CASCADE,
  mode                 text NOT NULL CHECK (mode IN ('personalised', 'bcc')),
  recipient_count      int NOT NULL DEFAULT 0,
  drafts_created       int NOT NULL DEFAULT 0,
  drafts_failed        int NOT NULL DEFAULT 0,
  errors               jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_send_batches_user_idx
  ON oauth_send_batches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS oauth_send_batches_draft_idx
  ON oauth_send_batches (draft_id);

-- RLS ------------------------------------------------------------------
ALTER TABLE user_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_send_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_oauth_connections_owner_select
  ON user_oauth_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_oauth_connections_owner_delete
  ON user_oauth_connections FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT + UPDATE intentionally restricted to service-role: token writes
-- always happen from server routes (callback, refresh) where we have the
-- service-role client; no client-side write paths exist.

CREATE POLICY oauth_send_batches_owner_select
  ON oauth_send_batches FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts batches; no user-side writes.

-- Comments -------------------------------------------------------------
COMMENT ON TABLE user_oauth_connections IS
  'Per-user OAuth refresh + access tokens for outbound integrations (Microsoft Graph, Gmail). Encrypted at rest with OAUTH_TOKEN_ENCRYPTION_KEY (server env). One row per (user, provider).';

COMMENT ON COLUMN user_oauth_connections.refresh_token_ct IS
  'AES-256-GCM ciphertext of the refresh token, base64-encoded as iv|ciphertext|authTag. Never logged.';

COMMENT ON COLUMN user_oauth_connections.access_token_ct IS
  'AES-256-GCM ciphertext of the cached access token. Short-lived (~1h for MS); refreshed on demand if expired.';

COMMENT ON TABLE oauth_send_batches IS
  'Audit log of save-to-drafts batch operations. Used for debugging + showing the user recent history of pushes to their connected mailbox.';
