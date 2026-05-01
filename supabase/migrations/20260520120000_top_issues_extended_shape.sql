-- ============================================================
-- Phase 3: top_issues extended shape documentation
--
-- Updates the column comment on campaign_situation_analyses.top_issues
-- to document the extended Phase 3 shape that adds optional
-- oa_position and employer_position fields to each array element.
--
-- No ALTER TABLE is needed: top_issues is already JSONB with no
-- structural constraint. This migration is a documentation-only
-- contract migration so that schema introspection tools and
-- future developers know the canonical element shape.
-- ============================================================

COMMENT ON COLUMN campaign_situation_analyses.top_issues IS
  'JSONB array of {label, heat (1..5), notes?, oa_position?, employer_position?}. '
  'Heat is organiser-assessed. oa_position and employer_position are optional string '
  'fields added in Phase 3 to record negotiating positions for each issue, enabling '
  'top_issues rows with positions set to be carried forward as key_disputes in the '
  'Phase 2 Bargaining to Win wizard.';
