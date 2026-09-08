-- ============================================================
-- Migration: redefine participation as "supportive on any activity"
--
-- Extends campaign_worker_rating_summary with two additive columns
-- so clients can compute participation without re-scanning
-- campaign_activity_ratings per campaign on the dashboard:
--
--   has_supportive_activity_rating  bool
--       true when the worker has at least one rating row in this
--       campaign that is "supportive", meaning:
--         rating IN (1, 2)   -- supportive_leader | supporter
--         OR
--         binary_value IS NOT NULL
--           AND binary_value = campaign_activities.supporter_outcome_value
--
--   supportive_activity_count       int
--       number of distinct activities on which the worker has at
--       least one supportive rating (same rule as above). Kept so
--       future reports can ask "workers supportive on >= N
--       activities" without new queries.
--
-- Membership-derived base rating (used for cumulative_rating) does
-- NOT affect these columns — participation requires an actual
-- supportive rating row on a real activity.
--
-- Preserves existing columns cumulative_rating and
-- last_activity_rating unchanged.
-- ============================================================

CREATE OR REPLACE VIEW campaign_worker_rating_summary
WITH (security_invoker = true)
AS
WITH worker_base_rating AS (
  SELECT
    m.campaign_id,
    m.worker_id,
    CASE
      WHEN mrt.role_name IN ('contact', 'Activist', 'delegate') THEN 1
      WHEN w.is_bargaining_rep = true                           THEN 1
      WHEN umt.type_name IN (
             'financial_member',
             'non_oa_member',
             'member_pending'
           )                                                    THEN 2
      ELSE NULL
    END AS base_rating
  FROM campaign_worker_membership m
  JOIN workers w
    ON w.worker_id = m.worker_id
  LEFT JOIN union_membership_types umt
    ON umt.union_membership_type_id = w.union_membership_type_id
  LEFT JOIN member_role_types mrt
    ON mrt.role_type_id = w.member_role_type_id
)
SELECT
  m.campaign_id,
  m.worker_id,
  CASE
    WHEN wb.base_rating IS NOT NULL THEN
      ROUND(
        (
          wb.base_rating::numeric
          + COALESCE(
              SUM(r.rating::numeric)
                FILTER (
                  WHERE a.campaign_id = m.campaign_id
                    AND r.rating IS NOT NULL
                ),
              0
            )
        ) / (
          1
          + COUNT(r.rating_id)
              FILTER (
                WHERE a.campaign_id = m.campaign_id
                  AND r.rating IS NOT NULL
              )
        )
      )::int

    WHEN COUNT(r.rating_id)
           FILTER (
             WHERE a.campaign_id = m.campaign_id
               AND r.rating IS NOT NULL
           ) > 0
    THEN
      ROUND(
        AVG(r.rating::numeric)
          FILTER (
            WHERE a.campaign_id = m.campaign_id
              AND r.rating IS NOT NULL
          )
      )::int

    ELSE NULL
  END AS cumulative_rating,

  (
    SELECT r2.rating
    FROM campaign_activity_ratings r2
    INNER JOIN campaign_activities a2 ON a2.activity_id = r2.activity_id
    WHERE a2.campaign_id = m.campaign_id
      AND r2.worker_id   = m.worker_id
      AND r2.rating IS NOT NULL
    ORDER BY r2.rated_at DESC NULLS LAST
    LIMIT 1
  ) AS last_activity_rating,

  -- NEW: participation flag. True when the worker has at least one
  -- supportive rating (numeric 1|2 OR binary matching the activity's
  -- supporter_outcome_value) on any activity in this campaign.
  COALESCE(
    BOOL_OR(
      a.campaign_id = m.campaign_id
      AND (
        (r.rating IS NOT NULL AND r.rating IN (1, 2))
        OR (
          r.binary_value IS NOT NULL
          AND a.supporter_outcome_value IS NOT NULL
          AND r.binary_value = a.supporter_outcome_value
        )
      )
    ),
    false
  ) AS has_supportive_activity_rating,

  -- NEW: count of distinct activities on which the worker has at
  -- least one supportive rating. Useful for "supportive on >= N
  -- activities" reporting.
  COUNT(DISTINCT a.activity_id) FILTER (
    WHERE a.campaign_id = m.campaign_id
      AND (
        (r.rating IS NOT NULL AND r.rating IN (1, 2))
        OR (
          r.binary_value IS NOT NULL
          AND a.supporter_outcome_value IS NOT NULL
          AND r.binary_value = a.supporter_outcome_value
        )
      )
  )::int AS supportive_activity_count

FROM campaign_worker_membership m
JOIN worker_base_rating wb
  ON wb.campaign_id = m.campaign_id
 AND wb.worker_id   = m.worker_id
LEFT JOIN campaign_activity_ratings r
  ON r.worker_id = m.worker_id
LEFT JOIN campaign_activities a
  ON a.activity_id   = r.activity_id
 AND a.campaign_id   = m.campaign_id
GROUP BY m.campaign_id, m.worker_id, wb.base_rating;
