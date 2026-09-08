-- ============================================================
-- Migration 20260511110000: Bargaining-specific fields on
-- campaign_situation_analyses
--
-- Extends the existing situation analysis table with fields that are
-- only meaningful once bargaining has commenced:
--   - NERR status + issue date
--   - Bargaining phase state
--   - Employer ballot intent + prior ballot history (JSONB)
--   - Key disputes (JSONB)
--   - Worker support estimate (JSONB)
--
-- All fields are nullable so existing rows are unaffected.
-- The UI gates display on campaigns.current_phase != 'preparing_to_bargain'
-- (or an explicit "Bargaining context" expander toggle).
-- ============================================================

-- ── NERR (Notice of Employee Representation Rights) ───────────────────────────
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS nerr_status TEXT
    DEFAULT 'unknown'
    CHECK (nerr_status IN ('not_issued','issued','superseded','unknown'));

ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS nerr_issued_at DATE;

COMMENT ON COLUMN campaign_situation_analyses.nerr_status IS
  'Status of the Notice of Employee Representation Rights (NERR). One of: not_issued, issued, superseded, unknown.';
COMMENT ON COLUMN campaign_situation_analyses.nerr_issued_at IS
  'Date the NERR was formally issued.';

-- ── Bargaining phase state ────────────────────────────────────────────────────
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS bargaining_phase_state TEXT
    CHECK (bargaining_phase_state IN (
      'not_commenced',
      'commenced',
      'stalled',
      'agreement_drafting',
      'balloted',
      'post_settlement',
      'unknown'
    ));

COMMENT ON COLUMN campaign_situation_analyses.bargaining_phase_state IS
  'Current stage within bargaining. Complements employer_interaction_state for campaigns in bargaining_underway.';

-- ── Employer ballot intent ────────────────────────────────────────────────────
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS employer_ballot_intent TEXT
    CHECK (employer_ballot_intent IN ('none','signalled','imminent','unknown'));

COMMENT ON COLUMN campaign_situation_analyses.employer_ballot_intent IS
  'Organisers assessment of whether the employer intends to run a ballot. none / signalled / imminent / unknown.';

-- ── Prior employer ballots ────────────────────────────────────────────────────
-- Array of:
--   { ballot_kind, conducted_at, eligible_count, votes_yes, votes_no,
--     outcome, source_of_evidence, notes }
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS prior_employer_ballots JSONB
    NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaign_situation_analyses.prior_employer_ballots IS
  'JSONB array of prior employer-run ballots. Each element: {ballot_kind, conducted_at, eligible_count, votes_yes, votes_no, outcome, source_of_evidence, notes}.';

-- ── Key disputes ──────────────────────────────────────────────────────────────
-- Array of:
--   { topic, oa_position, employer_position, urgency (1..5), notes }
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS key_disputes JSONB
    NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaign_situation_analyses.key_disputes IS
  'JSONB array of active bargaining disputes. Each element: {topic, oa_position, employer_position, urgency (1..5), notes}.';

-- ── Worker support estimate ───────────────────────────────────────────────────
-- Object:
--   { percent_supportive_estimated, basis_of_estimate, notes }
ALTER TABLE campaign_situation_analyses
  ADD COLUMN IF NOT EXISTS worker_support_estimate JSONB
    NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_situation_analyses.worker_support_estimate IS
  'JSONB object with organiser estimate of worker support: {percent_supportive_estimated, basis_of_estimate, notes}.';
