-- SMS archive / delete (hygiene).
--
-- Archive is archived_at, not a new status: status machines, unique
-- live-relay indexes and webhook routing all key off status. Surveys
-- already have unused archived_at (20260812120000).
--
-- Worker-list provenance stores the parent SMS id so the wall chart
-- can badge "SMS source archived/deleted" after the parent is gone
-- (FKs SET NULL on delete).

-- ─────────────────────────────────────────────────────────────
-- 1. archived_at
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_lists.archived_at IS
  'Hygiene archive. NULL = in the default SMS Tools list. Set only '
  'when the blast/board is inert (sent/cancelled; chat boards closed). '
  'Does not stop inbound threads or unwind ratings.';

CREATE INDEX IF NOT EXISTS idx_sms_lists_not_archived
  ON sms_lists(campaign_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE sms_relays
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_relays.archived_at IS
  'Hygiene archive. Set only after status = ended (number already '
  'released). Paused/active relays still intercept inbound.';

CREATE INDEX IF NOT EXISTS idx_sms_relays_not_archived
  ON sms_relays(created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_surveys_not_archived
  ON sms_surveys(campaign_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN campaigns.archived_at IS
  'Used for hidden SMS episode campaigns (is_sms_episode). Standalone '
  'archive/unarchive keeps the episode in lockstep with its actions.';

-- ─────────────────────────────────────────────────────────────
-- 2. Worker-list provenance
-- ─────────────────────────────────────────────────────────────

ALTER TABLE campaign_worker_lists
  ADD COLUMN IF NOT EXISTS source_sms_list_id INTEGER
    REFERENCES sms_lists(list_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_sms_survey_id INTEGER
    REFERENCES sms_surveys(survey_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_sms_gone_at TIMESTAMPTZ;

COMMENT ON COLUMN campaign_worker_lists.source_sms_list_id IS
  'Blast this cohort was created from (sms_blast_cohort), if any.';
COMMENT ON COLUMN campaign_worker_lists.source_sms_survey_id IS
  'Survey this cohort was created from (sms_survey_cohort), if any.';
COMMENT ON COLUMN campaign_worker_lists.source_sms_gone_at IS
  'Stamped when the parent SMS action (or fired_sms_list_id blast) is '
  'hard-deleted, so the wall chart can still say "SMS source deleted" '
  'after the FK is nulled.';

CREATE INDEX IF NOT EXISTS idx_cwl_source_sms_list
  ON campaign_worker_lists(source_sms_list_id)
  WHERE source_sms_list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cwl_source_sms_survey
  ON campaign_worker_lists(source_sms_survey_id)
  WHERE source_sms_survey_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. vw_sms_campaign_summary — append archived_at
--    (CREATE OR REPLACE may only add columns at the end)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_sms_campaign_summary AS
SELECT
  sl.campaign_id,
  sl.list_id,
  sl.name AS list_name,
  sl.status AS list_status,
  sl.draft_id,
  sl.sender_number_id,
  sl.timezone,
  sl.blackout_override,
  sl.scheduled_for,
  sl.total_items,
  sl.sent_items,
  sl.delivered_items,
  sl.failed_items,
  sl.created_at,
  COUNT(sli.item_id)                                            AS item_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'pending')      AS pending_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'queued')       AS queued_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'sending')      AS sending_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'sent')         AS sent_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'delivered')    AS delivered_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'failed')       AS failed_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'skipped')      AS skipped_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'opted_out')    AS opted_out_count,
  COUNT(sli.item_id) FILTER (WHERE sli.status = 'blocked')      AS blocked_count,
  CASE WHEN COUNT(sli.item_id) FILTER (WHERE sli.status IN ('sent', 'delivered', 'failed')) > 0
    THEN ROUND(
      100.0 * COUNT(sli.item_id) FILTER (WHERE sli.status = 'delivered')
      / COUNT(sli.item_id) FILTER (WHERE sli.status IN ('sent', 'delivered', 'failed')),
      1)
    ELSE 0
  END AS delivery_rate_pct,
  sl.mode,
  sl.archived_at
FROM sms_lists sl
LEFT JOIN sms_list_items sli ON sli.list_id = sl.list_id
GROUP BY sl.campaign_id, sl.list_id, sl.name, sl.status, sl.draft_id,
         sl.sender_number_id, sl.timezone, sl.blackout_override,
         sl.scheduled_for, sl.total_items, sl.sent_items,
         sl.delivered_items, sl.failed_items, sl.created_at, sl.mode,
         sl.archived_at;

GRANT SELECT ON vw_sms_campaign_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. DELETE RLS — match API guards (no client bypass of live rows)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Campaign writers can delete sms_lists" ON sms_lists;
CREATE POLICY "Campaign writers can delete sms_lists"
  ON sms_lists FOR DELETE TO authenticated
  USING (
    can_write_to_campaign(campaign_id)
    AND (
      (COALESCE(mode, 'blast') = 'blast' AND status = 'draft')
      OR (mode = 'p2p' AND status = 'draft' AND sent_items = 0)
    )
  );

DROP POLICY IF EXISTS "Staff delete sms_surveys" ON sms_surveys;
CREATE POLICY "Staff delete sms_surveys"
  ON sms_surveys FOR DELETE TO authenticated
  USING (
    can_write_to_campaign(campaign_id)
    AND status = 'draft'
  );

-- ─────────────────────────────────────────────────────────────
-- 5. Belt: refuse deleting a standalone episode while an action is live
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_live_sms_episode_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_sms_episode THEN
    IF EXISTS (
      SELECT 1 FROM sms_lists
      WHERE campaign_id = OLD.campaign_id
        AND (
          (COALESCE(mode, 'blast') = 'blast' AND status IN ('queued', 'sending', 'paused'))
          OR (mode = 'p2p' AND status = 'draft' AND sent_items > 0)
        )
    ) OR EXISTS (
      SELECT 1 FROM sms_surveys
      WHERE campaign_id = OLD.campaign_id
        AND status IN ('open', 'paused')
    ) THEN
      RAISE EXCEPTION
        'Cannot delete a standalone SMS episode while an action is still live — cancel, close or end it first';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_live_sms_episode_delete ON campaigns;
CREATE TRIGGER trg_prevent_live_sms_episode_delete
  BEFORE DELETE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION prevent_live_sms_episode_delete();
