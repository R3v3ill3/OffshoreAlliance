-- ============================================================
-- Migration 20260520140000: v_campaign_foundational_readiness
--
-- Provides a per-campaign readiness snapshot for the bargaining
-- hub. Aggregates five metrics that reflect how complete the
-- campaign data is before entering Phase 2:
--
--   universe_size        — sum of total_workers_estimated across
--                          all campaign_organising_units for the
--                          campaign (proxy for the organising
--                          universe; 0 when no OUs exist yet).
--
--   workers_allocated    — distinct workers in
--                          campaign_worker_membership (the actual
--                          headcount on the campaign).
--
--   workers_with_contact — subset of allocated workers who have
--                          a phone number OR email address on
--                          their workers row.
--
--   workers_with_rating  — subset of allocated workers who have a
--                          non-NULL cumulative_rating in the
--                          campaign_worker_rating_summary view
--                          (i.e. at least one assessment recorded,
--                          or a membership-derived base rating).
--
--   ous_missing_leaders  — count of campaign_organising_units rows
--                          for this campaign where anchor_worker_id
--                          IS NULL (no designated leader assigned).
--
-- security_invoker = true: the view runs as the calling user so
-- RLS on the underlying tables is respected.
-- ============================================================

CREATE OR REPLACE VIEW v_campaign_foundational_readiness
WITH (security_invoker = true) AS
SELECT
  c.campaign_id,

  -- Universe size: sum of estimated workers across all OUs.
  -- NULL total_workers_estimated cells are treated as 0.
  COALESCE(
    (
      SELECT SUM(ou.total_workers_estimated)
      FROM campaign_organising_units ou
      WHERE ou.campaign_id = c.campaign_id
        AND ou.total_workers_estimated IS NOT NULL
    ),
    0
  )::int AS universe_size,

  -- Workers allocated: distinct members on this campaign.
  (
    SELECT COUNT(DISTINCT cwm.worker_id)
    FROM campaign_worker_membership cwm
    WHERE cwm.campaign_id = c.campaign_id
  )::int AS workers_allocated,

  -- Workers with contact details (phone or email populated).
  (
    SELECT COUNT(DISTINCT cwm.worker_id)
    FROM campaign_worker_membership cwm
    JOIN workers w ON w.worker_id = cwm.worker_id
    WHERE cwm.campaign_id = c.campaign_id
      AND (
        (w.phone IS NOT NULL AND w.phone <> '')
        OR (w.email IS NOT NULL AND w.email <> '')
      )
  )::int AS workers_with_contact,

  -- Workers with at least one rating (cumulative_rating IS NOT NULL).
  (
    SELECT COUNT(DISTINCT cwrs.worker_id)
    FROM campaign_worker_rating_summary cwrs
    WHERE cwrs.campaign_id = c.campaign_id
      AND cwrs.cumulative_rating IS NOT NULL
  )::int AS workers_with_rating,

  -- OUs without a designated leader (anchor_worker_id IS NULL).
  (
    SELECT COUNT(*)
    FROM campaign_organising_units ou
    WHERE ou.campaign_id = c.campaign_id
      AND ou.anchor_worker_id IS NULL
  )::int AS ous_missing_leaders

FROM campaigns c;

GRANT SELECT ON v_campaign_foundational_readiness TO authenticated;

COMMENT ON VIEW v_campaign_foundational_readiness IS
  'Per-campaign readiness snapshot for the Phase 2 bargaining hub. '
  'Five metrics: universe_size (sum of OU estimates), workers_allocated '
  '(campaign_worker_membership headcount), workers_with_contact (have phone '
  'or email), workers_with_rating (have a cumulative_rating), '
  'ous_missing_leaders (no anchor_worker_id). '
  'security_invoker=true so RLS on underlying tables is inherited.';
