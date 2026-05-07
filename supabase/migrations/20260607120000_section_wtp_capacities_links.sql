-- ============================================================
-- Section Planning module — Phase 4 of 10
--
-- Ensures plan_capacities has linked_ambition_id (for "this
-- capacity supports that ambition" linkage). plan_where_to_play
-- already has it from the campaigns_review wave.
-- ============================================================

ALTER TABLE plan_capacities
  ADD COLUMN IF NOT EXISTS linked_ambition_id INT
  REFERENCES plan_ambitions(ambition_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_capacities_linked_ambition
  ON plan_capacities(linked_ambition_id)
  WHERE linked_ambition_id IS NOT NULL;

COMMENT ON COLUMN plan_capacities.linked_ambition_id IS
  'Optional FK to a plan_ambitions row (stage- or section-scoped) declaring '
  'which ambition this capacity is intended to support. Mirrors the pattern '
  'on plan_where_to_play.linked_ambition_id.';
