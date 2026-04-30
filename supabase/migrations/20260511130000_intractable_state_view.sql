-- ============================================================
-- Migration 20260511130000: v_intractable_state view
--
-- Convenience view consumed by useIntractableState.ts hook and any
-- server-side reporting. Exposes human-readable labels alongside the
-- raw numeric values so the UI needs no additional computation.
-- ============================================================

CREATE OR REPLACE VIEW v_intractable_state AS
SELECT
  ibt.campaign_id,

  -- Days since bargaining commenced (may be negative if backfilled with
  -- a future date, but that would indicate a data-entry error).
  (CURRENT_DATE - ibt.bargaining_commenced_at)::INT          AS days_elapsed,

  -- Days remaining until the 9-month threshold (negative = overdue).
  (ibt.nine_month_threshold_at - CURRENT_DATE)::INT          AS days_remaining_to_threshold,

  ibt.state,

  -- Human-readable state label for direct display in the banner.
  CASE ibt.state
    WHEN 'safe'        THEN 'On track'
    WHEN 'approaching' THEN 'Approaching threshold'
    WHEN 'eligible'    THEN 'Eligible — threshold reached'
    WHEN 'applied'     THEN 'Application filed'
    WHEN 'declared'    THEN 'Intractable declared'
    WHEN 'arbitrated'  THEN 'Arbitrated'
    ELSE                    'Unknown'
  END                                                        AS state_label,

  -- Single-line headline for the banner card (mirrors CurrentSituationBanner
  -- style — short, action-oriented).
  CASE ibt.state
    WHEN 'safe' THEN
      'Bargaining commenced ' || (CURRENT_DATE - ibt.bargaining_commenced_at)::TEXT
      || ' days ago — ' || (ibt.nine_month_threshold_at - CURRENT_DATE)::TEXT || ' days to threshold'
    WHEN 'approaching' THEN
      'Approaching 9-month threshold — '
      || (ibt.nine_month_threshold_at - CURRENT_DATE)::TEXT || ' days remaining'
    WHEN 'eligible' THEN
      'Threshold reached — intractable application may be filed'
    WHEN 'applied' THEN
      'Intractable application filed ' || TO_CHAR(ibt.intractable_application_filed_at, 'DD Mon YYYY')
    WHEN 'declared' THEN
      'Intractable bargaining declared ' || TO_CHAR(ibt.intractable_declaration_made_at, 'DD Mon YYYY')
    WHEN 'arbitrated' THEN
      'Arbitration outcome recorded ' || TO_CHAR(ibt.arbitration_outcome_recorded_at, 'DD Mon YYYY')
    ELSE 'Bargaining status unknown'
  END                                                        AS headline,

  -- Milestone dates exposed for display
  ibt.bargaining_commenced_at,
  ibt.nine_month_threshold_at,
  ibt.intractable_application_filed_at,
  ibt.intractable_declaration_made_at,
  ibt.arbitration_outcome_recorded_at,
  ibt.last_reviewed_at,
  ibt.notes

FROM intractable_bargaining_tracker ibt;

COMMENT ON VIEW v_intractable_state IS
  'Computed view over intractable_bargaining_tracker. Exposes days_elapsed, days_remaining_to_threshold, state_label, and a human-readable headline for the IntractableBannerCard UI component.';
