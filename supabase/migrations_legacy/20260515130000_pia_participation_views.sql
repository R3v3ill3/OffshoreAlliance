-- ============================================================
-- Migration: v_pia_participation_by_action
--
-- Aggregates campaign_activity_ratings against pia_actions via
-- activity_events so organisers can see pledge vs participation
-- rates per industrial action.
--
-- Note: binary_value in campaign_activity_ratings is VARCHAR(30).
-- Boolean true is stored as the text 'true'.
-- campaign_worker_membership is the canonical per-campaign worker
-- count table (created in 0013_campaign_workflow.sql).
-- ============================================================

CREATE OR REPLACE VIEW v_pia_participation_by_action
WITH (security_invoker = true)
AS
SELECT
  pa.action_id,
  pa.campaign_id,
  pa.action_type,
  pa.escalation_level,
  pa.action_starts_at,
  pa.is_concluded,
  COUNT(CASE WHEN car.rating_phase = 'expected' AND car.binary_value = 'true' THEN 1 END)
    AS total_pledged,
  COUNT(CASE WHEN car.rating_phase = 'actual'   AND car.binary_value = 'true' THEN 1 END)
    AS total_participated,
  CASE
    WHEN COUNT(CASE WHEN car.rating_phase = 'expected' AND car.binary_value = 'true' THEN 1 END) > 0
    THEN ROUND(
      COUNT(CASE WHEN car.rating_phase = 'actual' AND car.binary_value = 'true' THEN 1 END)::NUMERIC
      / COUNT(CASE WHEN car.rating_phase = 'expected' AND car.binary_value = 'true' THEN 1 END)
      * 100,
      1
    )
    ELSE 0
  END AS participation_rate,
  -- percent of campaign membership who participated
  CASE
    WHEN cm.total_workers > 0
    THEN ROUND(
      COUNT(CASE WHEN car.rating_phase = 'actual' AND car.binary_value = 'true' THEN 1 END)::NUMERIC
      / cm.total_workers
      * 100,
      1
    )
    ELSE 0
  END AS percent_membership
FROM pia_actions pa
LEFT JOIN activity_events ae
  ON ae.pia_action_id = pa.action_id
LEFT JOIN campaign_activity_ratings car
  ON car.event_id = ae.event_id
LEFT JOIN (
  SELECT campaign_id, COUNT(*) AS total_workers
  FROM campaign_worker_membership
  GROUP BY campaign_id
) cm ON cm.campaign_id = pa.campaign_id
GROUP BY
  pa.action_id,
  pa.campaign_id,
  pa.action_type,
  pa.escalation_level,
  pa.action_starts_at,
  pa.is_concluded,
  cm.total_workers;

GRANT SELECT ON v_pia_participation_by_action TO authenticated;

COMMENT ON VIEW v_pia_participation_by_action IS
  'Aggregates pledged vs participated counts per pia_actions row. '
  'total_pledged = expected binary ratings; total_participated = actual '
  'binary ratings. participation_rate = actual/pledged × 100. '
  'percent_membership = actual / campaign_worker_membership count × 100.';
