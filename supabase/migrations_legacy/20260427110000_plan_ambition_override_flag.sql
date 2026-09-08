-- ============================================================
-- Migration: plan_ambitions.current_value_overridden
--
-- `current_value` was previously hand-edited in the Gate UI with
-- no causal link to the underlying ratings. With Phase 5 rollup
-- views (ambition_progress, worker_ambition_rating) the gate UI
-- should display the derived value by default and only allow
-- override with an explicit flag + reason.
--
-- Existing non-null current_value rows are preserved as explicit
-- overrides (current_value_overridden=TRUE) so nothing silently
-- flips to a different displayed value after the migration lands.
-- ============================================================

ALTER TABLE plan_ambitions
  ADD COLUMN IF NOT EXISTS current_value_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_value_override_reason TEXT;

-- Mark existing non-null current_value as overrides so the new
-- UI doesn't silently replace them with computed values.
UPDATE plan_ambitions
SET current_value_overridden = TRUE
WHERE current_value IS NOT NULL
  AND current_value <> ''
  AND current_value_overridden = FALSE;

COMMENT ON COLUMN plan_ambitions.current_value_overridden IS
  'TRUE when staff have manually set current_value rather than '
  'relying on the derived value from ambition_progress. Requires '
  'current_value_override_reason to be set in the UI.';
