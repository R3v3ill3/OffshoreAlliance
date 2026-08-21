-- Tapbacks (iOS Like / Loved / Gefällt / …) attach to the parent
-- outbound sms_messages row as a JSONB array instead of a new inbound
-- bubble. Authenticated clients only SELECT; the webhook writes via
-- the service role (sms_messages has no UPDATE policy for staff).

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sms_messages.reactions IS
  'SMS tapback reactions (like/love/…) from the member, stored on the '
  'parent message. Each element: {kind, emoji, from_e164, at, '
  'provider_message_id}.';
