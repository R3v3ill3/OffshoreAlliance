-- ============================================================
-- Migration: v_worker_escalation_tier
--
-- Per-(campaign, worker) view that assigns an escalation tier
-- based on the highest industrial action the worker has actually
-- participated in (binary_value='true', rating_phase='actual').
--
-- Tier definitions:
--   0 = never assessed / no data
--   1 = signed bargaining pledge
--   2 = voted yes in PABO
--   3 = participated in a work ban or 4hr stoppage
--   4 = participated in 24hr, 48hr, or swing-meeting stoppage
--   5 = participated in indefinite strike
--
-- last_action_type is the template_key of the most recent actual
-- participation event. next_recommended_ask is a simple escalation
-- prompt derived from current_tier.
--
-- Join path: campaign_activity_ratings -> activity_events -> campaign_activities
-- (campaign_activity_ratings does NOT have campaign_id directly)
-- ============================================================

CREATE OR REPLACE VIEW v_worker_escalation_tier
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    a.campaign_id,
    car.worker_id,
    a.template_key,
    ae.scheduled_at,
    car.binary_value
  FROM campaign_activity_ratings car
  JOIN activity_events ae
    ON ae.event_id = car.event_id
  JOIN campaign_activities a
    ON a.activity_id = ae.activity_id
  WHERE car.rating_phase = 'actual'
    AND car.binary_value = 'true'
),
tier_calc AS (
  SELECT
    campaign_id,
    worker_id,
    CASE
      WHEN MAX(CASE WHEN template_key = 'indefinite_strike'               THEN 5 END) = 5 THEN 5
      WHEN MAX(CASE WHEN template_key IN (
               'stoppage_24hr', 'stoppage_48hr', 'stoppage_swing_meeting'
             )                                                             THEN 4 END) = 4 THEN 4
      WHEN MAX(CASE WHEN template_key IN (
               'work_ban_helideck', 'work_ban_lifting_gear',
               'work_ban_permits', 'work_ban',
               'overtime_ban', 'stoppage_4hr'
             )                                                             THEN 3 END) = 3 THEN 3
      WHEN MAX(CASE WHEN template_key = 'pabo_voted_yes'                  THEN 2 END) = 2 THEN 2
      WHEN MAX(CASE WHEN template_key = 'bargaining_pledge_signed'        THEN 1 END) = 1 THEN 1
      ELSE 0
    END AS current_tier,
    MAX(scheduled_at) AS last_action_at
  FROM base
  GROUP BY campaign_id, worker_id
),
last_action AS (
  SELECT DISTINCT ON (campaign_id, worker_id)
    campaign_id,
    worker_id,
    template_key AS last_action_type
  FROM base
  ORDER BY campaign_id, worker_id, scheduled_at DESC NULLS LAST
)
SELECT
  tc.campaign_id,
  tc.worker_id,
  tc.current_tier,
  tc.last_action_at,
  la.last_action_type,
  CASE
    WHEN tc.current_tier >= 4 THEN 'escalate_to_24hr_or_above'
    WHEN tc.current_tier =  3 THEN 'ask_for_stoppage_swing'
    WHEN tc.current_tier =  2 THEN 'ask_for_work_ban'
    WHEN tc.current_tier =  1 THEN 'ask_for_pabo_pledge'
    ELSE                            'initial_ask'
  END AS next_recommended_ask
FROM tier_calc tc
LEFT JOIN last_action la
  ON la.campaign_id = tc.campaign_id
  AND la.worker_id = tc.worker_id;

GRANT SELECT ON v_worker_escalation_tier TO authenticated;

COMMENT ON VIEW v_worker_escalation_tier IS
  'Per-(campaign, worker) escalation tier (0–5) based on highest actual '
  'industrial action participation. 0=no data, 1=pledge, 2=PABO voted yes, '
  '3=work ban / 4hr, 4=24–48hr / swing, 5=indefinite strike. '
  'next_recommended_ask gives the next escalation step to ask for.';
