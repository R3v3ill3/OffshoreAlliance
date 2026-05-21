-- ============================================================
-- Widen phone_call_actions.entry_branch column.
--
-- The new enum value 'assessment_list_first' (21 chars) exceeds the
-- original VARCHAR(20) bound. The CHECK constraint accepts the value
-- but the column type rejects it with
--   "value too long for type character varying(20)"
-- on insert. Widen to VARCHAR(40) so existing + new values fit with
-- comfortable headroom.
-- ============================================================

ALTER TABLE phone_call_actions
  ALTER COLUMN entry_branch TYPE VARCHAR(40);
