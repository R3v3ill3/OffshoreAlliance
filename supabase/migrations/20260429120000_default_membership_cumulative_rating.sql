-- ============================================================
-- Migration: default membership-derived cumulative rating
--
-- Updates campaign_worker_rating_summary so that a worker's
-- union membership type and organising role contribute a
-- "base rating" that acts as a virtual first assessment:
--
--   role_name IN ('contact','Activist','delegate')
--   OR is_bargaining_rep = true              → base_rating = 1
--
--   union type IN ('financial_member',
--                  'non_oa_member',
--                  'member_pending')         → base_rating = 2
--
--   otherwise                                → base_rating = NULL
--                                              (non-members: unchanged)
--
-- Cumulative formula when base_rating IS NOT NULL:
--   ROUND( (base_rating + SUM(actual numeric ratings))
--          / (1 + COUNT(actual numeric ratings)) )
--
-- This means:
--   • A member with no assessments shows cumulative = 2 (or 1
--     for leadership roles) — matching the existing wall-chart
--     colour default — but now as a real data value, not just
--     a display hint.
--   • When actual assessments are added the base rating is
--     included as one data point in the running average.
--     e.g. member base=2, one rating of 4 → ROUND((2+4)/2) = 3.
--
-- Binary-only rows (rating IS NULL, binary_value set) are
-- excluded from the numeric average, consistent with prior
-- behaviour.
--
-- last_activity_rating is NOT changed — it still reflects only
-- the most recent actual activity rating row.
-- ============================================================

CREATE OR REPLACE VIEW campaign_worker_rating_summary
WITH (security_invoker = true)
AS
WITH worker_base_rating AS (
  -- Derive a base rating for each (campaign, worker) pair from
  -- the worker's current membership type and organising role.
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
    -- Member/role-derived base rating exists: include it as a
    -- virtual first data point alongside any actual ratings.
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

    -- No membership default but has actual numeric ratings.
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

    -- No base rating and no actual ratings.
    ELSE NULL
  END AS cumulative_rating,

  -- Last actual numeric rating for the campaign (unchanged).
  (
    SELECT r2.rating
    FROM campaign_activity_ratings r2
    INNER JOIN campaign_activities a2 ON a2.activity_id = r2.activity_id
    WHERE a2.campaign_id = m.campaign_id
      AND r2.worker_id   = m.worker_id
      AND r2.rating IS NOT NULL
    ORDER BY r2.rated_at DESC NULLS LAST
    LIMIT 1
  ) AS last_activity_rating

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
