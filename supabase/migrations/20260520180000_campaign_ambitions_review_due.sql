-- ============================================================
-- Phase 7 (Wave 5): Add review_due_since to campaign_ambitions
--
-- When a triggering event occurs (log of claims endorsed,
-- employer proposal rejected, WOC counter-offer endorsed),
-- set_ambition_review_due() stamps this column on all
-- industrial_outcomes ambitions for the campaign.
--
-- Cleared by the organiser via the AmbitionReviewSheet UI,
-- which also writes a campaign_ambition_revisions row.
-- ============================================================

ALTER TABLE campaign_ambitions
  ADD COLUMN IF NOT EXISTS review_due_since TIMESTAMPTZ;

COMMENT ON COLUMN campaign_ambitions.review_due_since IS
  'Phase 7: set when an industrial_outcomes ambition should be reviewed '
  'after a triggering event (log of claims yes vote, employer proposal no '
  'vote, or WOC counter-offer endorsement). Cleared when the organiser '
  'completes the review and a campaign_ambition_revisions row is written.';
