-- Launch texts: a blast that invites members to text a relay number.
--
-- A relay is useless until members know the number. Until now that
-- invitation was an unlinked blast an organiser wrote by hand — nothing
-- tied it to the relay, so nothing could warn that the relay was still
-- paused (members texting a paused relay get RELAY_PAUSED_REPLY and are
-- never forwarded), and nothing could tell the sender rules that the
-- relay's own number is a legitimate sender for THIS one blast.
--
-- One nullable FK carries both facts. A relay may have several launch
-- texts (a launch and a reminder), so the link is one-to-many and lives
-- on the list. ON DELETE SET NULL: deleting a relay leaves the blast and
-- its send history intact, it simply stops being a launch text.

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS relay_id INTEGER
    REFERENCES sms_relays(relay_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sl_relay
  ON sms_lists(relay_id) WHERE relay_id IS NOT NULL;

COMMENT ON COLUMN sms_lists.relay_id IS
  'When set, this blast is a launch text for the relay: it invites members to text the relay number. A relay may have several (launch, reminder). The relay number is a permitted sender ONLY for lists carrying its relay_id.';
