-- ============================================================
-- Phase 8 (Wave 6): WOC outcome trigger
--
-- Adds fn_woc_outcome_review / trg_woc_outcome_review on
-- activity_events AFTER UPDATE OF outcome, is_concluded.
--
-- This trigger is specifically scoped to activity_kind='woc_meeting'
-- to avoid double-firing with Phase 7's trg_activity_event_review_due
-- (fn_set_review_due_on_activity_event), which already handles the
-- general counter_offer_endorsed case.  set_ambition_review_due is
-- idempotent (only sets review_due_since when IS NULL), so even if
-- both triggers fire for the same event the result is correct.
--
-- Trigger name / function name are unique from Phase 7:
--   Phase 7: fn_set_review_due_on_activity_event / trg_activity_event_review_due
--   Phase 8: fn_woc_outcome_review               / trg_woc_outcome_review
-- ============================================================

CREATE OR REPLACE FUNCTION fn_woc_outcome_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign_id    INT;
  v_activity_kind  TEXT;
BEGIN
  -- Only proceed when concluded with a counter-offer endorsement decision
  IF NEW.is_concluded = TRUE
    AND NEW.outcome->>'decision' = 'counter_offer_endorsed'
  THEN
    -- Resolve the parent activity's campaign_id and activity_kind
    SELECT ca.campaign_id, ca.activity_kind
      INTO v_campaign_id, v_activity_kind
      FROM campaign_activities ca
     WHERE ca.activity_id = NEW.activity_id;

    -- Only fire for WOC meeting activities; other kinds are handled by Phase 7
    IF FOUND AND v_activity_kind = 'woc_meeting' THEN
      PERFORM set_ambition_review_due(v_campaign_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_woc_outcome_review() IS
  'Phase 8: fires set_ambition_review_due when a woc_meeting activity_event '
  'is concluded with outcome decision=counter_offer_endorsed. Scoped to '
  'woc_meeting kind; coexists safely with Phase 7 trg_activity_event_review_due.';

CREATE TRIGGER trg_woc_outcome_review
  AFTER UPDATE OF outcome, is_concluded ON activity_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_woc_outcome_review();
