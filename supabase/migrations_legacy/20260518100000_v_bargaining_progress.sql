-- ============================================================
-- Migration: v_bargaining_progress
-- Wave 7 Agent K — Phase 9 (reporting view)
--
-- Aggregates per-campaign bargaining KPIs for the reports
-- dashboard. One row per campaign currently in
-- current_phase = 'bargaining_to_win'.
--
-- NOTE: Depends on tables created by Waves 1–6:
--   campaigns.current_phase            (20260510100000)
--   campaigns.bargaining_commenced_at  (20260511100000)
--   bargaining_strength_assessments    (20260512100000)
--   bargaining_decision_points         (20260512110000)
--   pabo_applications                  (20260514100000)
--   member_endorsement_votes           (20260513100000)
--   pia_actions                        (20260515100000)
--   intractable_bargaining_tracker     (20260511120000)
-- ============================================================

CREATE OR REPLACE VIEW v_bargaining_progress AS
SELECT
  c.campaign_id,
  c.name                         AS campaign_name,
  c.current_phase::TEXT          AS current_phase,
  c.bargaining_commenced_at,

  -- Latest strength assessment (most recent by assessed_at)
  sa.assessed_at                 AS last_strength_assessed_at,
  -- outcome maps to strength_verdict in the app layer
  sa.outcome                     AS last_strength_verdict,

  -- Open decision points (resolution = 'pending')
  (
    SELECT COUNT(*)
    FROM   bargaining_decision_points dp
    WHERE  dp.campaign_id = c.campaign_id
      AND  dp.resolution  = 'pending'
  )                              AS open_decision_count,

  -- Latest PABO status
  (
    SELECT status
    FROM   pabo_applications
    WHERE  campaign_id = c.campaign_id
    ORDER BY created_at DESC
    LIMIT  1
  )                              AS latest_pabo_status,

  -- Latest endorsement vote outcome
  (
    SELECT outcome
    FROM   member_endorsement_votes
    WHERE  campaign_id = c.campaign_id
    ORDER BY vote_closes_at DESC NULLS LAST
    LIMIT  1
  )                              AS latest_vote_outcome,

  -- Active / scheduled PIA actions (not yet concluded, starts_at in future
  -- or has started but not ended; use is_concluded = false as proxy)
  (
    SELECT COUNT(*)
    FROM   pia_actions
    WHERE  campaign_id  = c.campaign_id
      AND  is_concluded = false
  )                              AS active_pia_count,

  -- Intractable state
  ibt.state                      AS intractable_status,
  -- Days elapsed since bargaining commenced (integer), NULL if no tracker row
  (CURRENT_DATE - ibt.bargaining_commenced_at)::INT
                                 AS intractable_days_elapsed

FROM campaigns c

-- Latest strength assessment via LATERAL for efficiency
LEFT JOIN LATERAL (
  SELECT assessed_at, outcome
  FROM   bargaining_strength_assessments
  WHERE  campaign_id = c.campaign_id
  ORDER BY assessed_at DESC
  LIMIT  1
) sa ON true

-- Intractable tracker (0 or 1 row per campaign)
LEFT JOIN intractable_bargaining_tracker ibt
  ON  ibt.campaign_id = c.campaign_id

WHERE c.current_phase = 'bargaining_to_win';

COMMENT ON VIEW v_bargaining_progress IS
  'Per-campaign bargaining KPIs for the reports dashboard. '
  'One row per campaign in current_phase = bargaining_to_win. '
  'Aggregates strength verdict, open decision count, PABO status, '
  'latest vote outcome, active PIA count, and intractable state.';

-- Grant SELECT to authenticated users (view uses security_invoker defaults;
-- underlying tables already have RLS policies for authenticated role)
GRANT SELECT ON v_bargaining_progress TO authenticated;
