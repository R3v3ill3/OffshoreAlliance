-- Organiser-authored confirmation to the member.
--
-- The one-time "your message has been passed on" reply was hardcoded
-- copy chosen by the platform. It is the only message a member receives
-- from a relay, so it is also the only place a campaign gets to set the
-- tone — and in direct-reply mode it is where the member is told their
-- mobile went on to the target. Both are the organiser's call, not ours.
--
-- NULL means "never configured": fall back to the built-in default for
-- the relay's reply mode, so existing relays are unchanged and a new
-- relay that ignores the field still behaves sensibly. An empty string
-- is a deliberate choice to send nothing.

ALTER TABLE sms_relays
  ADD COLUMN IF NOT EXISTS confirmation_template text;

COMMENT ON COLUMN sms_relays.confirmation_template IS
  'One-time reply to the member on their first forwarded message. Supports the same merge tokens as prefix/suffix. NULL = use the built-in default for the relay reply mode; empty string = send no confirmation.';
