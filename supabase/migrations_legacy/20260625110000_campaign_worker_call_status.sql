-- ============================================================
-- Mobile dialer redesign — cross-list dedup signal
--
-- `vw_campaign_worker_call_status` answers the question "have we already
-- spoken to this worker on this campaign in the last 7 days, and on which
-- list, by which caller?". The mobile contact card surfaces a soft warning
-- when the answer is yes so a volunteer doesn't unknowingly call the same
-- person who was contacted yesterday by another caller on a parallel list.
--
-- Coordinators also use it on the list builder to flag overlap when a
-- worker is already on another active list in the same campaign.
--
-- Shape: one row per (campaign_id, worker_id) with the most recent attempt
-- across all lists in that campaign.
-- ============================================================

CREATE OR REPLACE VIEW vw_campaign_worker_call_status AS
WITH ranked_attempts AS (
  SELECT
    cl.campaign_id,
    cli.worker_id,
    cli.list_id,
    cl.name AS list_name,
    ca.attempt_id,
    ca.started_at,
    ca.dial_disposition,
    ca.call_disposition,
    ca.outcome_classification,
    ca.caller_user_id,
    ca.caller_session_label,
    ROW_NUMBER() OVER (
      PARTITION BY cl.campaign_id, cli.worker_id
      ORDER BY ca.started_at DESC NULLS LAST, ca.attempt_id DESC
    ) AS rn
  FROM call_attempts ca
  JOIN call_list_items cli ON cli.item_id = ca.list_item_id
  JOIN call_lists cl ON cl.list_id = cli.list_id
  WHERE cli.worker_id IS NOT NULL
)
SELECT
  campaign_id,
  worker_id,
  list_id,
  list_name,
  attempt_id AS last_attempt_id,
  started_at AS last_attempt_at,
  dial_disposition AS last_dial_disposition,
  call_disposition AS last_call_disposition,
  outcome_classification AS last_outcome_classification,
  caller_user_id AS last_caller_user_id,
  caller_session_label AS last_caller_session_label
FROM ranked_attempts
WHERE rn = 1;

-- Convenience helper for the mobile dialer / staff tracker. Returns NULL
-- when no prior attempt exists on this campaign for this worker.
CREATE OR REPLACE FUNCTION get_campaign_worker_call_status(
  p_campaign_id INTEGER,
  p_worker_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_row vw_campaign_worker_call_status%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM vw_campaign_worker_call_status
  WHERE campaign_id = p_campaign_id
    AND worker_id = p_worker_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'campaign_id', v_row.campaign_id,
    'worker_id', v_row.worker_id,
    'list_id', v_row.list_id,
    'list_name', v_row.list_name,
    'last_attempt_id', v_row.last_attempt_id,
    'last_attempt_at', v_row.last_attempt_at,
    'last_dial_disposition', v_row.last_dial_disposition,
    'last_call_disposition', v_row.last_call_disposition,
    'last_outcome_classification', v_row.last_outcome_classification,
    'last_caller_session_label', v_row.last_caller_session_label
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
