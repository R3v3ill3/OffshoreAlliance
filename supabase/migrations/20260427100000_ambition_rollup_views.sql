-- ============================================================
-- Migration: Ambition rollup views
--
-- Derives worker-per-ambition ratings and ambition-level
-- progress metrics from campaign_activity_ratings via the
-- activity_ambitions join. The Gate UI and dashboards become
-- the single source of truth for "% supportive on MSD" etc,
-- replacing the hand-edited plan_ambitions.current_value.
--
-- Views (all security_invoker so RLS is inherited):
--   * worker_ambition_rating         one row per (campaign, ambition, worker)
--   * ambition_progress              one row per (campaign, ambition)
--   * ambition_activity_contribution one row per (ambition, activity) pair
--
-- Tie-breaking in worker_ambition_rating:
--   1. Prefer rating_phase='actual' over 'expected'.
--   2. Within phase, most recent rated_at wins.
--   3. Only worker_assessable ambitions are considered.
-- ============================================================

-- -----------------------------------------------------------
-- worker_ambition_rating
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW worker_ambition_rating
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    sp.campaign_id,
    pa.ambition_id AS plan_ambition_id,
    car.worker_id,
    car.rating,
    car.binary_value,
    car.rating_phase,
    car.event_id,
    car.rated_at,
    car.source,
    car.activity_id AS source_activity_id,
    ROW_NUMBER() OVER (
      PARTITION BY sp.campaign_id, pa.ambition_id, car.worker_id
      ORDER BY
        CASE car.rating_phase WHEN 'actual' THEN 0 ELSE 1 END,
        car.rated_at DESC NULLS LAST
    ) AS rn
  FROM campaign_activity_ratings car
  JOIN activity_ambitions aa ON aa.activity_id = car.activity_id
  JOIN plan_ambitions pa ON pa.ambition_id = aa.plan_ambition_id
  JOIN campaign_stage_plans sp ON sp.plan_id = pa.plan_id
  WHERE pa.ambition_scope = 'worker_assessable'
)
SELECT
  campaign_id,
  plan_ambition_id,
  worker_id,
  rating,
  binary_value,
  rating_phase,
  event_id,
  rated_at,
  source,
  source_activity_id
FROM ranked
WHERE rn = 1;

GRANT SELECT ON worker_ambition_rating TO authenticated;

COMMENT ON VIEW worker_ambition_rating IS
  'Current resolved rating per (campaign, ambition, worker). '
  'Picks most recent actual rating across all linked activities, '
  'falling back to expected if no actual exists. Only returns rows '
  'for worker_assessable ambitions.';

-- -----------------------------------------------------------
-- ambition_progress
--   Universe = campaign members (campaign_worker_membership).
--   Every member is either rated (1..5) or unassessed.
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW ambition_progress
WITH (security_invoker = true) AS
WITH members AS (
  SELECT
    sp.campaign_id,
    pa.ambition_id,
    cwm.worker_id
  FROM plan_ambitions pa
  JOIN campaign_stage_plans sp ON sp.plan_id = pa.plan_id
  JOIN campaign_worker_membership cwm ON cwm.campaign_id = sp.campaign_id
  WHERE pa.ambition_scope = 'worker_assessable'
),
joined AS (
  SELECT
    m.campaign_id,
    m.ambition_id,
    m.worker_id,
    war.rating,
    war.binary_value,
    war.rated_at
  FROM members m
  LEFT JOIN worker_ambition_rating war
    ON war.campaign_id = m.campaign_id
   AND war.plan_ambition_id = m.ambition_id
   AND war.worker_id = m.worker_id
)
SELECT
  campaign_id,
  ambition_id,
  COUNT(*) AS universe,
  COUNT(*) FILTER (WHERE rating = 1) AS rated_1,
  COUNT(*) FILTER (WHERE rating = 2) AS rated_2,
  COUNT(*) FILTER (WHERE rating = 3) AS rated_3,
  COUNT(*) FILTER (WHERE rating = 4) AS rated_4,
  COUNT(*) FILTER (WHERE rating = 5) AS rated_5,
  COUNT(*) FILTER (WHERE rating IS NULL AND binary_value IS NULL) AS unassessed,
  COUNT(*) FILTER (WHERE rating IN (1, 2)) AS supportive,
  COUNT(*) FILTER (WHERE rating IN (4, 5)) AS opposed,
  CASE WHEN COUNT(*) > 0 THEN
    ROUND(100.0 * COUNT(*) FILTER (WHERE rating IN (1, 2)) / COUNT(*), 1)
  ELSE 0 END AS supportive_pct,
  CASE WHEN COUNT(*) > 0 THEN
    ROUND(100.0 * COUNT(*) FILTER (WHERE rating IS NULL AND binary_value IS NULL) / COUNT(*), 1)
  ELSE 0 END AS unassessed_pct,
  MAX(rated_at) AS last_rated_at
FROM joined
GROUP BY campaign_id, ambition_id;

GRANT SELECT ON ambition_progress TO authenticated;

COMMENT ON VIEW ambition_progress IS
  'Per ambition, counts by rating bucket (1..5 + unassessed), '
  'supportive (1+2) percentage, opposed (4+5) percentage, and '
  'last update time. Universe = campaign_worker_membership.';

-- -----------------------------------------------------------
-- ambition_activity_contribution
--   How many ratings each activity has contributed to each
--   ambition, for UX oversight / debugging.
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW ambition_activity_contribution
WITH (security_invoker = true) AS
SELECT
  sp.campaign_id,
  pa.ambition_id,
  car.activity_id,
  COUNT(*) AS rating_count,
  COUNT(*) FILTER (WHERE car.rating IN (1, 2)) AS supportive_count,
  COUNT(*) FILTER (WHERE car.rating IN (4, 5)) AS opposed_count,
  COUNT(DISTINCT car.worker_id) AS unique_workers,
  MAX(car.rated_at) AS latest_rated_at,
  ROUND(AVG(car.rating)::numeric, 2) AS avg_rating
FROM plan_ambitions pa
JOIN campaign_stage_plans sp ON sp.plan_id = pa.plan_id
JOIN activity_ambitions aa ON aa.plan_ambition_id = pa.ambition_id
JOIN campaign_activity_ratings car ON car.activity_id = aa.activity_id
WHERE pa.ambition_scope = 'worker_assessable'
GROUP BY sp.campaign_id, pa.ambition_id, car.activity_id;

GRANT SELECT ON ambition_activity_contribution TO authenticated;

COMMENT ON VIEW ambition_activity_contribution IS
  'Per (ambition, activity) cell: how many ratings the activity '
  'contributed to the ambition, their spread, and when. Used by '
  'UI to show which activities are driving progress on each ambition.';
