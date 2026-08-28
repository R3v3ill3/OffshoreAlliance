-- Keep the promise the hard-pause auto-reply makes.
--
-- A hard-paused survey answers an inbound with "This survey is paused —
-- please wait for a follow-up message", then discards the reply. But
-- `resume` only flipped status back to 'open' and sent nothing, so the
-- follow-up never came: the member was left waiting indefinitely while
-- their answer was silently dropped.
--
-- Resume needs to know WHICH sessions were told to wait. Re-prompting
-- every live session would spam the people who never replied during the
-- pause and are still holding an unanswered question. So the auto-reply
-- stamps the session, and resume re-prompts exactly the stamped ones.

ALTER TABLE sms_survey_sessions
  ADD COLUMN IF NOT EXISTS pause_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_survey_sessions.pause_notified_at IS
  'Set when this session received the hard-pause "please wait for a '
  'follow-up" auto-reply, and cleared when resume delivers that '
  'follow-up. Non-NULL means a member is waiting on us.';

-- Partial index: resume looks up only the stamped sessions, a small
-- slice of a survey's roster.
CREATE INDEX IF NOT EXISTS idx_sms_survey_sessions_pause_notified
  ON sms_survey_sessions (survey_id)
  WHERE pause_notified_at IS NOT NULL;

-- Backfill the members already left waiting. The stamp is reconstructed
-- from the auto-reply itself: an outbound carrying that exact copy, on
-- a conversation whose phone matches a session still short of an answer.
-- Approximate by nature (the message is the only record — the inbound
-- that triggered it was discarded), which is why it is derived here
-- once rather than inferred at read time.
UPDATE sms_survey_sessions s
   SET pause_notified_at = m.sent_at
  FROM (
    SELECT c.phone_e164, MAX(m.created_at) AS sent_at
      FROM sms_messages m
      JOIN sms_conversations c ON c.conversation_id = m.conversation_id
     WHERE m.direction = 'outbound'
       AND m.body LIKE 'This survey is paused%'
     GROUP BY c.phone_e164
  ) m
 WHERE s.phone_e164 = m.phone_e164
   AND s.state IN ('invited', 'active')
   AND s.pause_notified_at IS NULL;
