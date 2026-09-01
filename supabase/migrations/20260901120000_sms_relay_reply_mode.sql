-- Relay reply mode.
--
-- Until now every target reply was bridged back to a member, chosen by
-- the bridging map: the last member whose message was actually
-- forwarded. That is correct for one conversation at a time and wrong
-- under any concurrency — when three members write in before the target
-- answers, the reply goes to whichever was forwarded last, silently,
-- and the other two never learn a reply existed.
--
-- With the member's own mobile now carried in the forward's attribution
-- line, the target can answer the member directly. So bridging becomes
-- a choice rather than the only route: with it off, a target reply stays
-- on the relay number and lands in the Inbox for an organiser, and the
-- misrouting class disappears entirely.
--
-- Defaults TRUE so every existing relay keeps the behaviour it was
-- configured under.

ALTER TABLE sms_relays
  ADD COLUMN IF NOT EXISTS bridge_replies boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN sms_relays.bridge_replies IS
  'TRUE: a target reply is forwarded back to the last-forwarded member (bridging map). FALSE: it stays on the relay number and routes to the Inbox — the member reaches the target directly via the mobile in the forward attribution line.';
