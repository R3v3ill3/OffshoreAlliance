-- ============================================================
-- Phase 1 of Bargaining to Win: campaign_phase_enum + campaigns.current_phase
-- ============================================================
-- Creates a new enum type covering the three high-level phases of a
-- bargaining campaign lifecycle and adds current_phase to campaigns.
-- Backfills current_phase from campaign_type and the most-current
-- campaign_situation_analyses.employer_interaction_state.
-- ============================================================

CREATE TYPE campaign_phase_enum AS ENUM (
  'preparing_to_bargain',
  'bargaining_to_win',
  'post_settlement'
);

ALTER TABLE campaigns
  ADD COLUMN current_phase campaign_phase_enum NOT NULL DEFAULT 'preparing_to_bargain';

-- ── Backfill from campaign_situation_analyses ─────────────────────────────
-- Where the most-current situation analysis has employer_interaction_state
-- indicating active bargaining or industrial action → bargaining_to_win.
-- Post-settlement state → post_settlement.
-- Everything else stays at the default (preparing_to_bargain).

UPDATE campaigns c
SET current_phase = CASE csa.employer_interaction_state
  WHEN 'bargaining_underway'    THEN 'bargaining_to_win'::campaign_phase_enum
  WHEN 'industrial_action_phase' THEN 'bargaining_to_win'::campaign_phase_enum
  WHEN 'post_settlement'        THEN 'post_settlement'::campaign_phase_enum
  ELSE                               'preparing_to_bargain'::campaign_phase_enum
END
FROM campaign_situation_analyses csa
WHERE csa.campaign_id = c.campaign_id
  AND csa.is_current = TRUE
  AND csa.employer_interaction_state IN (
        'bargaining_underway',
        'industrial_action_phase',
        'post_settlement'
      );

COMMENT ON COLUMN campaigns.current_phase IS
  'High-level phase of the bargaining lifecycle. preparing_to_bargain = Stages 1–6 (P2W); bargaining_to_win = Stages 7–11 (B2W); post_settlement = after agreement ratified. Backfilled from campaign_situation_analyses.employer_interaction_state.';

COMMENT ON TYPE campaign_phase_enum IS
  'Bargaining campaign lifecycle phase. Used to gate stage-plan navigation and filter hooks so Phase-1 (stages 1–6) and Phase-2 (stages 7–11) views remain independent.';
