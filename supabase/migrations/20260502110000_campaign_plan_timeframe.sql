-- ============================================================
-- Phase 1 of campaigns review plan: plan timeframe.
--
-- "End date" was confusing because real bargaining campaigns
-- don't have a known end — the close depends on negotiation
-- outcomes. Replace it with a "plan timeframe" expressed in
-- weeks (with months as 4*weeks). When users want a hard end
-- date they can still set campaigns.end_date directly.
--
-- Both columns are kept; UI now offers weeks / months / custom
-- date and writes whichever was used. end_date is computed from
-- start_date + plan_timeframe_weeks at write time when the
-- weeks/months mode is selected.
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS plan_timeframe_weeks INT
    CHECK (plan_timeframe_weeks IS NULL OR plan_timeframe_weeks > 0);

COMMENT ON COLUMN campaigns.plan_timeframe_weeks IS
  'Campaign plan timeframe in weeks (replaces hard-coded end_date for bargaining campaigns where the real close depends on negotiation outcomes). When set, UI computes end_date as start_date + plan_timeframe_weeks * 7. NULL means: use campaigns.end_date as a hard custom date, or leave unbounded.';
