-- ============================================================
-- Phase 3: employer_interaction_state ↔ bargaining_phase_state sync
--
-- Creates a lookup table mapping each employer_interaction_state value
-- to a default bargaining_phase_state, then installs a BEFORE INSERT
-- OR UPDATE trigger on campaign_situation_analyses that auto-fills
-- bargaining_phase_state from the map ONLY when bargaining_phase_state
-- is NULL. Explicit values are never overwritten.
--
-- employer_interaction_state values (from 20260507120000):
--   no_engagement, preemptive_setup, bargaining_underway,
--   agreement_balloted, employer_delaying, industrial_action_phase,
--   post_settlement, other
--
-- bargaining_phase_state values (from 20260511110000):
--   not_commenced, commenced, stalled, agreement_drafting,
--   balloted, post_settlement, unknown
-- ============================================================

-- ── 1. Lookup table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employer_state_bargaining_phase_map (
  employer_interaction_state TEXT PRIMARY KEY,
  bargaining_phase_state     TEXT NOT NULL
);

COMMENT ON TABLE employer_state_bargaining_phase_map IS
  'Lookup table mapping employer_interaction_state to a default bargaining_phase_state. '
  'Used by the sync trigger on campaign_situation_analyses to auto-fill bargaining_phase_state '
  'when it is NULL. Explicit values on the row are never overwritten.';

-- ── 2. Seed rows ─────────────────────────────────────────────────────────────

INSERT INTO employer_state_bargaining_phase_map (employer_interaction_state, bargaining_phase_state)
VALUES
  ('no_engagement',          'not_commenced'),
  ('preemptive_setup',       'not_commenced'),
  ('employer_delaying',      'not_commenced'),
  ('bargaining_underway',    'commenced'),
  ('industrial_action_phase','commenced'),
  ('agreement_balloted',     'balloted'),
  ('post_settlement',        'post_settlement'),
  ('other',                  'unknown')
ON CONFLICT (employer_interaction_state) DO NOTHING;

-- ── 3. Trigger function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_csa_sync_bargaining_phase_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_phase TEXT;
BEGIN
  -- Only attempt the lookup when employer_interaction_state is set
  -- and bargaining_phase_state has NOT been explicitly provided
  -- (NULL means "not set by the caller — use the map default").
  IF NEW.employer_interaction_state IS NOT NULL AND NEW.bargaining_phase_state IS NULL THEN
    SELECT bargaining_phase_state
      INTO v_phase
      FROM employer_state_bargaining_phase_map
     WHERE employer_interaction_state = NEW.employer_interaction_state;

    IF FOUND THEN
      NEW.bargaining_phase_state := v_phase;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_csa_sync_bargaining_phase_state() IS
  'BEFORE INSERT OR UPDATE trigger on campaign_situation_analyses. '
  'When employer_interaction_state is set and bargaining_phase_state IS NULL, '
  'auto-fills bargaining_phase_state from employer_state_bargaining_phase_map. '
  'Does not overwrite an explicitly supplied bargaining_phase_state.';

-- ── 4. Trigger ───────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_csa_sync_bargaining_phase_state ON campaign_situation_analyses;

CREATE TRIGGER trg_csa_sync_bargaining_phase_state
  BEFORE INSERT OR UPDATE OF employer_interaction_state
  ON campaign_situation_analyses
  FOR EACH ROW
  EXECUTE FUNCTION fn_csa_sync_bargaining_phase_state();

COMMENT ON TRIGGER trg_csa_sync_bargaining_phase_state ON campaign_situation_analyses IS
  'Auto-fills bargaining_phase_state from employer_state_bargaining_phase_map when '
  'employer_interaction_state is updated and bargaining_phase_state IS NULL. '
  'Fires BEFORE INSERT OR UPDATE OF employer_interaction_state.';
