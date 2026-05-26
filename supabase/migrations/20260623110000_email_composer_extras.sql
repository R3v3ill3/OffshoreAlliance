-- Email composer redesign: add preheader and body_json to campaign_comms_drafts.
--
-- preheader  : inbox preview text shown next to subject line.
-- body_json  : TipTap document JSON for true round-trip (rich-text edits).
--
-- Both nullable, no backfill — existing drafts have null and continue to
-- work via the body / body_html columns.

ALTER TABLE campaign_comms_drafts
  ADD COLUMN IF NOT EXISTS preheader text;

ALTER TABLE campaign_comms_drafts
  ADD COLUMN IF NOT EXISTS body_json jsonb;

COMMENT ON COLUMN campaign_comms_drafts.preheader IS
  'Optional inbox preview text shown alongside the subject line. Resolved with the same {{var}} pipeline as body.';

COMMENT ON COLUMN campaign_comms_drafts.body_json IS
  'TipTap (ProseMirror) document JSON for the email body. Source of truth for round-trip rich-text edits; body and body_html are derived views.';
