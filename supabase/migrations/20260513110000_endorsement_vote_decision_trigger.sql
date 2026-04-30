-- ============================================================
-- Phase 4 (Wave 4): Endorsement vote → bargaining decision point trigger
--
-- When a member_endorsement_votes row reaches a terminal outcome,
-- write a summary row into bargaining_decision_points (created by
-- Wave 3). The trigger is written defensively: if
-- bargaining_decision_points does not yet exist (e.g. migrations
-- applied out of order) the DML is skipped rather than erroring.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_endorsement_vote_to_decision_point()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when outcome transitions to a terminal value
  -- and vote_kind is employer_proposal.
  IF NEW.outcome IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if outcome unchanged (UPDATE with no relevant change)
  IF TG_OP = 'UPDATE' AND OLD.outcome IS NOT DISTINCT FROM NEW.outcome THEN
    RETURN NEW;
  END IF;

  IF NEW.vote_kind = 'employer_proposal' AND NEW.outcome IN ('yes', 'no') THEN
    -- Defensive check: bargaining_decision_points is a Wave 3 table
    -- that may not exist in all migration orderings.
    IF EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = 'bargaining_decision_points'
    ) THEN
      EXECUTE $dml$
        INSERT INTO bargaining_decision_points
          (campaign_id, scenario, member_vote_outcome, resolution, created_at)
        VALUES
          ($1, 'employer_launches_proposal', $2, $3, now())
      $dml$
      USING
        NEW.campaign_id,
        NEW.outcome,                                         -- 'yes' | 'no'
        CASE NEW.outcome WHEN 'yes' THEN 'settled' ELSE 'pending' END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_mev_decision_point
  AFTER INSERT OR UPDATE OF outcome ON member_endorsement_votes
  FOR EACH ROW EXECUTE FUNCTION fn_endorsement_vote_to_decision_point();

COMMENT ON FUNCTION fn_endorsement_vote_to_decision_point() IS
  'On INSERT or UPDATE of member_endorsement_votes.outcome, writes a '
  'bargaining_decision_points row when vote_kind=employer_proposal and '
  'outcome is yes (resolution=settled) or no (resolution=pending). '
  'Uses a runtime existence check so it is safe even if Wave 3 migrations '
  'have not yet been applied.';
