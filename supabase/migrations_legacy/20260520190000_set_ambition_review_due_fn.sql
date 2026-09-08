-- ============================================================
-- Phase 7 (Wave 5): set_ambition_review_due shared function
--
-- SECURITY DEFINER so it can be called from trigger functions
-- that run as the triggering user.
--
-- Sets review_due_since = now() on all industrial_outcomes
-- ambitions for a campaign where review_due_since IS NULL
-- (idempotent: won't overwrite an already-pending review).
--
-- Column name is `category` (matches campaign_ambitions DDL
-- from 20260504100000_campaign_ambitions.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION set_ambition_review_due(p_campaign_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaign_ambitions
  SET review_due_since = now()
  WHERE campaign_id = p_campaign_id
    AND category = 'industrial_outcomes'
    AND review_due_since IS NULL;
END;
$$;

COMMENT ON FUNCTION set_ambition_review_due(INT) IS
  'Phase 7: stamps review_due_since = now() on all industrial_outcomes '
  'ambitions for p_campaign_id where the flag is not already set. '
  'Called from two trigger paths (endorsement vote outcome, activity '
  'event outcome). Phase 8 will also call this from its WOC trigger.';
