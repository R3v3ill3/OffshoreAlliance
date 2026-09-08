-- ============================================================
-- Extend phone_call_actions.entry_branch with assessment-only
-- pathway values.
--
-- The orchestrator now exposes two pathways:
--   • Script + ratings → 'script_first' or 'list_first' (existing)
--   • Assessment-only → 'assessment_first' or 'assessment_list_first'
--     (new — no script wizard, just multi-assessment picker)
--
-- 'build_list' from the wall-chart Build List Fire flow stays as-is.
-- ============================================================

ALTER TABLE phone_call_actions
  DROP CONSTRAINT IF EXISTS phone_call_actions_entry_branch_check;

ALTER TABLE phone_call_actions
  ADD CONSTRAINT phone_call_actions_entry_branch_check
    CHECK (entry_branch IN (
      'list_first',
      'script_first',
      'assessment_first',
      'assessment_list_first',
      'build_list'
    ));

COMMENT ON COLUMN phone_call_actions.entry_branch IS
  'How the session was initiated. Script pathway: script_first / list_first. Assessment-only pathway: assessment_first / assessment_list_first. Wall-chart Build List Fire: build_list.';
