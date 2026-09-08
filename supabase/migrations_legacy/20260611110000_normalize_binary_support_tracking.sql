-- Normalize binary assessment support tracking.
--
-- Binary outcomes are stored as text. Treat yes/true and no/false aliases
-- consistently, compare case-insensitively, and keep unsure/abstain neutral
-- rather than supportive. Cumulative numeric rating behaviour is unchanged:
-- binary-only rows still do not feed cumulative_rating.

CREATE OR REPLACE VIEW campaign_worker_rating_summary
WITH (security_invoker = true)
AS
WITH worker_base_rating AS (
  SELECT
    m.campaign_id,
    m.worker_id,
    CASE
      WHEN lower(mrt.role_name) IN ('contact', 'activist', 'delegate') THEN 1
      WHEN w.is_bargaining_rep = true                                THEN 1
      WHEN umt.type_name IN (
             'financial_member',
             'non_oa_member',
             'member_pending'
           )                                                         THEN 2
      ELSE NULL
    END AS base_rating
  FROM campaign_worker_membership m
  JOIN workers w
    ON w.worker_id = m.worker_id
  LEFT JOIN union_membership_types umt
    ON umt.union_membership_type_id = w.union_membership_type_id
  LEFT JOIN member_role_types mrt
    ON mrt.role_type_id = w.member_role_type_id
),
rating_activity AS (
  SELECT
    r.rating_id,
    r.worker_id,
    r.activity_id,
    r.rating,
    r.binary_value,
    r.rated_at,
    a.campaign_id,
    CASE
      WHEN lower(trim(r.binary_value)) IN ('yes', 'y', 'true', 't', '1') THEN 'yes'
      WHEN lower(trim(r.binary_value)) IN ('no', 'n', 'false', 'f', '0') THEN 'no'
      WHEN lower(trim(r.binary_value)) = 'abstained'                    THEN 'abstain'
      WHEN lower(trim(r.binary_value)) IN ('unsure', 'unknown', 'abstain')
        THEN lower(trim(r.binary_value))
      ELSE lower(trim(r.binary_value))
    END AS binary_key,
    CASE
      WHEN lower(trim(a.supporter_outcome_value)) IN ('yes', 'y', 'true', 't', '1') THEN 'yes'
      WHEN lower(trim(a.supporter_outcome_value)) IN ('no', 'n', 'false', 'f', '0') THEN 'no'
      WHEN lower(trim(a.supporter_outcome_value)) = 'abstained'                    THEN 'abstain'
      WHEN lower(trim(a.supporter_outcome_value)) IN ('unsure', 'unknown', 'abstain')
        THEN lower(trim(a.supporter_outcome_value))
      ELSE COALESCE(NULLIF(lower(trim(a.supporter_outcome_value)), ''), 'yes')
    END AS supporter_key
  FROM campaign_activity_ratings r
  INNER JOIN campaign_activities a
    ON a.activity_id = r.activity_id
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
                  WHERE r.rating IS NOT NULL
                ),
              0
            )
        ) / (
          1
          + COUNT(r.rating_id)
              FILTER (
                WHERE r.rating IS NOT NULL
              )
        )
      )::int

    WHEN COUNT(r.rating_id)
           FILTER (
             WHERE r.rating IS NOT NULL
           ) > 0
    THEN
      ROUND(
        AVG(r.rating::numeric)
          FILTER (
            WHERE r.rating IS NOT NULL
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

  COALESCE(
    BOOL_OR(
      (r.rating IS NOT NULL AND r.rating IN (1, 2))
      OR (
        r.binary_key IS NOT NULL
        AND r.binary_key NOT IN ('unsure', 'unknown', 'abstain')
        AND r.binary_key = r.supporter_key
      )
    ),
    false
  ) AS has_supportive_activity_rating,

  COUNT(DISTINCT r.activity_id) FILTER (
    WHERE (r.rating IS NOT NULL AND r.rating IN (1, 2))
      OR (
        r.binary_key IS NOT NULL
        AND r.binary_key NOT IN ('unsure', 'unknown', 'abstain')
        AND r.binary_key = r.supporter_key
      )
  )::int AS supportive_activity_count

FROM campaign_worker_membership m
JOIN worker_base_rating wb
  ON wb.campaign_id = m.campaign_id
 AND wb.worker_id   = m.worker_id
LEFT JOIN rating_activity r
  ON r.worker_id   = m.worker_id
 AND r.campaign_id = m.campaign_id
GROUP BY m.campaign_id, m.worker_id, wb.base_rating;
