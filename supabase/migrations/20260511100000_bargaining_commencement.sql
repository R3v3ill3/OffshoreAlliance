-- ============================================================
-- Migration 20260511100000: Add bargaining_commenced_at to campaigns
--
-- Captures the legal clock start for bargaining. Backfilled from:
--   1. Earliest campaign_situation_analyses row where
--      employer_interaction_state = 'bargaining_underway'
--   2. Fallback: campaign_timelines.pabo_available_date - 30 days
--
-- This column is the source of truth for the intractable bargaining
-- tracker (20260511120000) and the nine-month threshold calculation.
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS bargaining_commenced_at DATE;

COMMENT ON COLUMN campaigns.bargaining_commenced_at IS
  'Date bargaining formally commenced. Drives the 9-month intractable bargaining threshold. Backfilled from earliest situation analysis with employer_interaction_state=bargaining_underway, or from campaign_timelines.pabo_available_date - 30 days.';

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Pass 1: use the earliest situation analysis row whose employer_interaction_state
-- = 'bargaining_underway' as a proxy for commencement date.
UPDATE campaigns c
SET    bargaining_commenced_at = sub.earliest_created::DATE
FROM (
  SELECT   csa.campaign_id,
           MIN(csa.created_at) AS earliest_created
  FROM     campaign_situation_analyses csa
  WHERE    csa.employer_interaction_state = 'bargaining_underway'
  GROUP BY csa.campaign_id
) sub
WHERE c.campaign_id          = sub.campaign_id
  AND c.bargaining_commenced_at IS NULL;

-- Pass 2 (fallback): use pabo_available_date - 30 days for campaigns
-- that have a timeline entry but no bargaining_underway analysis.
UPDATE campaigns c
SET    bargaining_commenced_at = ct.pabo_available_date - INTERVAL '30 days'
FROM   campaign_timelines ct
WHERE  ct.campaign_id              = c.campaign_id
  AND  ct.pabo_available_date      IS NOT NULL
  AND  c.bargaining_commenced_at   IS NULL;
