-- ============================================================
-- SMS Module — Phase 12 (assessment tracking & reporting, brief
-- SMS_EXPANSION_BRIEF §F; decision 9; open question Q10 resolved
-- below).
--
--   1. sms_interactions.rating_origin — the discriminator that lets
--      trg_sms_to_rating tell a survey answer from a keyword-mapped
--      inbound. Without it both collapse to one source value.
--   2. campaign_activity_ratings.source CHECK extended with
--      sms_chat / sms_survey / sms_inbound, written against the
--      UNION of both databases' current value lists (PROD carries
--      an_sync / an_report_import, DEV does not — the brief's Q10
--      note). Applying this converges DEV up to PROD.
--   3. Backfill of the existing source='sms' rows by attributability.
--   4. fn_sms_to_rating rewritten to emit the split values.
--   5. Reporting views for the §F metrics that vw_sms_campaign_rollup
--      (Phase 7) does not already cover.
--
-- The cautionary precedent this migration is written against: the
-- phone split is broken because 20260613110000_outcome_model.sql
-- migrated rows to phone_call_live while record_call_attempt() kept
-- writing 'call_outcome'. Here, BOTH producers move in the same
-- change — fn_sms_to_rating below, and the inbox assessments route
-- in the same commit — and a unit test asserts the mapping.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_interactions.rating_origin
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_interactions
  ADD COLUMN IF NOT EXISTS rating_origin VARCHAR(20);

DO $$
BEGIN
  ALTER TABLE sms_interactions
    ADD CONSTRAINT sms_interactions_rating_origin_check
      CHECK (rating_origin IS NULL
             OR rating_origin IN ('survey', 'inbound_keyword'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN sms_interactions.rating_origin IS
  'Which SMS pathway produced a rating-bearing inbound row: '
  '''survey'' = the survey runtime answering a write_rating question, '
  '''inbound_keyword'' = a keyword-mapped conversational reply. '
  'Read by fn_sms_to_rating to pick the campaign_activity_ratings '
  'source value. NULL on rows that carry no rating mapping.';

-- Existing rating-bearing inbound rows can only have come from the
-- survey runtime — it is the sole writer of maps_to_rating/
-- maps_to_binary on sms_interactions today (the webhook's
-- conversational path leaves all three rating fields NULL by design,
-- per the Phase 3 plan).
UPDATE sms_interactions
   SET rating_origin = 'survey'
 WHERE rating_origin IS NULL
   AND direction = 'inbound'
   AND (maps_to_rating IS NOT NULL OR maps_to_binary IS NOT NULL);

-- ─────────────────────────────────────────────────────────────
-- 2. campaign_activity_ratings.source — split the SMS value
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS campaign_activity_ratings_source_check;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT campaign_activity_ratings_source_check
    CHECK (source IN (
      -- phone
      'call_outcome', 'phone_call_live', 'phone_call_share_link',
      -- field / task
      'door_knock', 'task_assignment', 'task_completion', 'task_take',
      -- staff & forms
      'staff', 'leader_form',
      -- channels
      'sms', 'email', 'petition', 'meeting',
      -- Action Network (present on PROD only before this migration)
      'an_sync', 'an_report_import',
      -- SMS taxonomy split (§F decision 9)
      'sms_chat', 'sms_survey', 'sms_inbound'
    ));

COMMENT ON COLUMN campaign_activity_ratings.source IS
  'Which pathway recorded the rating. SMS is split three ways: '
  '''sms_chat'' = staff tapped a chip in the inbox/chat sidebar, '
  '''sms_survey'' = a survey answer mapped to a rating, '
  '''sms_inbound'' = a keyword-mapped conversational reply. '
  '''sms'' remains a legacy value for rows written before the split '
  'and is no longer emitted by any producer.';

-- ─────────────────────────────────────────────────────────────
-- 3. Backfill (Q10 — resolved by attributability)
-- ─────────────────────────────────────────────────────────────
--
-- Q10 asked whether to reclassify existing 'sms' rows or leave them
-- as a legacy value. They are attributable, so reclassify: the two
-- producers are distinguishable by rated_by_user_id. The inbox
-- assessments route always passes the authenticated user as the
-- actor; fn_sms_to_rating passes sms_interactions.created_by, which
-- the survey runtime leaves NULL. So actor present ⇒ staff chat
-- capture, actor absent ⇒ survey.
--
-- 'sms' is still retained in the CHECK above rather than removed.
-- Dropping a value is the move that breaks a producer nobody
-- remembered; keeping it costs nothing and makes this migration
-- reversible in practice.

UPDATE campaign_activity_ratings
   SET source = 'sms_chat'
 WHERE source = 'sms'
   AND rated_by_user_id IS NOT NULL;

UPDATE campaign_activity_ratings
   SET source = 'sms_survey'
 WHERE source = 'sms'
   AND rated_by_user_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. fn_sms_to_rating — emit the split values
-- ─────────────────────────────────────────────────────────────
--
-- Unchanged from 20260425110000 except for p_source. The swallow-all
-- exception handler is preserved deliberately: this trigger runs
-- inside the survey webhook's write path, and a rating failure must
-- not roll back the member's answer.

CREATE OR REPLACE FUNCTION fn_sms_to_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_rating INT;
  v_binary VARCHAR;
  v_source VARCHAR;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_rating := NEW.maps_to_rating;
  v_binary := NEW.maps_to_binary;

  -- Derive from cta_response if the caller didn't specify
  IF v_rating IS NULL AND v_binary IS NULL AND NEW.cta_response IS NOT NULL THEN
    v_binary := NEW.cta_response;
  END IF;

  IF v_rating IS NULL AND v_binary IS NULL THEN
    RETURN NEW;
  END IF;

  -- §F decision 9. Anything not explicitly stamped by the survey
  -- runtime is a conversational/keyword-mapped inbound.
  v_source := CASE
    WHEN NEW.rating_origin = 'survey' THEN 'sms_survey'
    ELSE 'sms_inbound'
  END;

  PERFORM record_assessment_event(
    p_activity_id := NEW.activity_id,
    p_worker_id := NEW.worker_id,
    p_rating := v_rating,
    p_binary_value := v_binary,
    p_rating_phase := 'actual',
    p_event_id := NULL,
    p_source := v_source,
    p_notes := NEW.notes,
    p_actor_id := NEW.created_by
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pin the search_path (the advisor flags this function as mutable)
-- and keep execution off the API roles: it is a trigger function and
-- can only be invoked as one, but the grant is noise on every lint.
ALTER FUNCTION fn_sms_to_rating() SET search_path = public;
REVOKE EXECUTE ON FUNCTION fn_sms_to_rating() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Reporting views (§F gap 2)
-- ─────────────────────────────────────────────────────────────
--
-- vw_sms_campaign_rollup (Phase 7) already covers blast delivery,
-- conversation counts, inbound replies, reply rate, opt-outs and
-- survey completion; vw_sms_sender_stats covers per-sender reply
-- latency. These two views add only what §F asks for and neither
-- provides: chat-session throughput and the assessment split.

-- Per P2P chat session (an sms_lists row with mode='p2p'). "Chat
-- initiated" = the opener actually went out, so sent_at drives every
-- denominator here rather than the item count.
CREATE OR REPLACE VIEW vw_sms_chat_session_report AS
WITH openers AS (
  SELECT
    l.campaign_id,
    l.list_id,
    l.name,
    l.status,
    l.created_by,
    l.created_at,
    i.item_id,
    i.worker_id,
    i.conversation_id,
    i.sent_at,
    -- First inbound on the linked thread after the opener landed.
    -- Replies that predate the opener belong to an earlier exchange
    -- and must not count as a response to this session.
    (
      SELECT MIN(m.created_at)
        FROM sms_messages m
       WHERE m.conversation_id = i.conversation_id
         AND m.direction = 'inbound'
         AND m.created_at >= i.sent_at
    ) AS first_reply_at
  FROM sms_lists l
  JOIN sms_list_items i ON i.list_id = l.list_id
  WHERE l.mode = 'p2p'
    AND i.sent_at IS NOT NULL
)
SELECT
  o.campaign_id,
  o.list_id,
  o.name,
  o.status,
  o.created_by,
  o.created_at,
  COUNT(*)::INT AS openers_sent,
  COUNT(o.first_reply_at)::INT AS replies_received,
  ROUND(
    100.0 * COUNT(o.first_reply_at) / NULLIF(COUNT(*), 0), 1
  ) AS response_rate_pct,
  -- Median, not mean: a single overnight reply otherwise swamps the
  -- figure organisers actually steer on (brief §3.1 item 11).
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (o.first_reply_at - o.sent_at))
  ) FILTER (WHERE o.first_reply_at IS NOT NULL)::NUMERIC
    AS median_first_reply_seconds,
  (
    SELECT COUNT(*)
      FROM campaign_activity_ratings r
      JOIN campaign_activities a ON a.activity_id = r.activity_id
     WHERE a.campaign_id = o.campaign_id
       AND r.source IN ('sms_chat', 'sms_survey', 'sms_inbound')
       AND r.worker_id IN (
         SELECT o2.worker_id FROM openers o2 WHERE o2.list_id = o.list_id
       )
  )::INT AS assessments_recorded
FROM openers o
GROUP BY o.campaign_id, o.list_id, o.name, o.status, o.created_by,
         o.created_at;

GRANT SELECT ON vw_sms_chat_session_report TO authenticated;

COMMENT ON VIEW vw_sms_chat_session_report IS
  'Per P2P chat session (sms_lists.mode = ''p2p''): openers sent, '
  'replies received, response rate, median seconds to first reply, '
  'and SMS-sourced assessments recorded against the session''s '
  'members. Group by created_by for per-organiser throughput.';

-- Assessments recorded over SMS, split by the Phase 12 taxonomy.
-- Answers §F's "report assessments recorded" and makes the split
-- visible — the whole point of decision 9.
CREATE OR REPLACE VIEW vw_sms_assessment_report AS
SELECT
  a.campaign_id,
  r.source,
  COUNT(*)::INT AS ratings_count,
  COUNT(DISTINCT r.worker_id)::INT AS workers_count,
  COUNT(*) FILTER (WHERE r.rating IS NOT NULL)::INT AS scale_count,
  COUNT(*) FILTER (WHERE r.binary_value IS NOT NULL)::INT AS binary_count,
  MIN(r.rated_at) AS first_rated_at,
  MAX(r.rated_at) AS last_rated_at
FROM campaign_activity_ratings r
JOIN campaign_activities a ON a.activity_id = r.activity_id
WHERE r.source IN ('sms', 'sms_chat', 'sms_survey', 'sms_inbound')
GROUP BY a.campaign_id, r.source;

GRANT SELECT ON vw_sms_assessment_report TO authenticated;

COMMENT ON VIEW vw_sms_assessment_report IS
  'SMS-sourced assessments per (campaign, source) under the Phase 12 '
  'taxonomy: sms_chat (staff capture in the inbox/chat), sms_survey '
  '(survey answer mapping), sms_inbound (keyword-mapped reply). '
  'Legacy ''sms'' is included so pre-split rows stay visible.';
