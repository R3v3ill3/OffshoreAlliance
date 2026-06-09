-- ============================================================
-- Worker list-activity tracker
--
-- `vw_campaign_worker_list_activity` answers "which lists is this worker on
-- within this campaign, and on which channel?". It powers:
--   * the worker detail sheet "Activity" tab (per-worker list membership), and
--   * the wall-chart tile badges (phone / email / activist task / sms),
--     where a coordinator can toggle which channel badges are shown.
--
-- Shape: one row per (campaign_id, worker_id, channel, list). A worker can
-- appear multiple times (e.g. on two call lists). Membership is sourced from
-- the three populated per-channel item tables. SMS has no list table yet, so
-- it is intentionally absent here (the UI still renders an empty sms channel).
-- ============================================================

CREATE OR REPLACE VIEW vw_campaign_worker_list_activity AS
-- Email lists
SELECT
  'email'::text   AS channel,
  el.campaign_id  AS campaign_id,
  eli.worker_id   AS worker_id,
  el.list_id      AS list_id,
  el.name         AS list_name,
  el.status       AS list_status,
  eli.status      AS item_status,
  eli.created_at  AS added_at
FROM email_list_items eli
JOIN email_lists el ON el.list_id = eli.list_id
WHERE eli.worker_id IS NOT NULL

UNION ALL

-- Phone / call lists
SELECT
  'phone'::text   AS channel,
  cl.campaign_id  AS campaign_id,
  cli.worker_id   AS worker_id,
  cl.list_id      AS list_id,
  cl.name         AS list_name,
  cl.status       AS list_status,
  cli.status      AS item_status,
  cli.created_at  AS added_at
FROM call_list_items cli
JOIN call_lists cl ON cl.list_id = cli.list_id
WHERE cli.worker_id IS NOT NULL

UNION ALL

-- Activist task lists ("list" badge)
SELECT
  'task'::text       AS channel,
  tl.campaign_id     AS campaign_id,
  tli.worker_id      AS worker_id,
  tl.task_list_id    AS list_id,
  tl.title           AS list_name,
  tl.status          AS list_status,
  NULL::text         AS item_status,
  tli.created_at     AS added_at
FROM campaign_task_list_items tli
JOIN campaign_task_lists tl ON tl.task_list_id = tli.task_list_id
WHERE tli.worker_id IS NOT NULL;

GRANT SELECT ON vw_campaign_worker_list_activity TO authenticated;
