-- ============================================================
-- Phase 7 (Wave 5): Ambition review triggers
--
-- TWO triggers call set_ambition_review_due when specific vote
-- outcomes or activity event outcomes occur:
--
-- 1. trg_endorsement_vote_review_due
--    On member_endorsement_votes AFTER UPDATE OF outcome:
--    - vote_kind='log_of_claims' AND outcome='yes'   → trigger
--    - vote_kind='employer_proposal' AND outcome='no' → trigger
--    campaign_id is a direct column on member_endorsement_votes.
--
-- 2. trg_activity_event_review_due  (Phase 7 — conservative)
--    On activity_events AFTER UPDATE OF outcome, is_concluded:
--    - ONLY fires when is_concluded=TRUE AND
--      outcome->>'decision'='counter_offer_endorsed'
--    Resolves campaign_id via campaign_activities (activity_id FK).
--    Phase 8 will add its own woc_outcome trigger under a different name.
-- ============================================================

-- ── Trigger 1: endorsement vote outcome ───────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_endorsement_vote_review_due()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.vote_kind = 'log_of_claims' AND NEW.outcome = 'yes')
  OR (NEW.vote_kind = 'employer_proposal' AND NEW.outcome = 'no')
  THEN
    PERFORM set_ambition_review_due(NEW.campaign_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_endorsement_vote_review_due() IS
  'Phase 7: fires set_ambition_review_due when a log_of_claims vote '
  'outcome=yes or an employer_proposal vote outcome=no is recorded.';

CREATE TRIGGER trg_endorsement_vote_review_due
  AFTER UPDATE OF outcome ON member_endorsement_votes
  FOR EACH ROW
  EXECUTE FUNCTION fn_endorsement_vote_review_due();

-- ── Trigger 2: activity event outcome (conservative — Phase 7 only) ──────────

CREATE OR REPLACE FUNCTION fn_set_review_due_on_activity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign_id INT;
BEGIN
  -- Be conservative: only fire when explicitly concluded with
  -- counter_offer_endorsed decision. Phase 8 handles woc_meeting template.
  IF NEW.is_concluded = TRUE
    AND NEW.outcome->>'decision' = 'counter_offer_endorsed'
  THEN
    SELECT ca.campaign_id
    INTO v_campaign_id
    FROM campaign_activities ca
    WHERE ca.activity_id = NEW.activity_id;

    IF FOUND THEN
      PERFORM set_ambition_review_due(v_campaign_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_set_review_due_on_activity_event() IS
  'Phase 7: fires set_ambition_review_due when an activity_event is '
  'concluded with outcome decision=counter_offer_endorsed. Conservative '
  'gate so it does not double-fire with Phase 8 woc_outcome trigger.';

CREATE TRIGGER trg_activity_event_review_due
  AFTER UPDATE OF outcome, is_concluded ON activity_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_review_due_on_activity_event();
