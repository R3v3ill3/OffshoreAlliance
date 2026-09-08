-- ============================================================
-- Migration: post_settlement_transition RPC
--
-- Adds 'post_settlement' to campaign_phase_enum (safe IF NOT EXISTS
-- — the enum was created in 20260510100000 with this value already
-- present, so this is a no-op guard for any environment that doesn't
-- have it yet).
--
-- Creates transition_to_post_settlement(p_campaign_id INT) which:
--   1. Verifies campaign is in 'bargaining_to_win' phase.
--   2. Verifies at least one member_endorsement_votes row with
--      vote_kind = 'final_eba' and outcome = 'yes'.
--   3. Sets campaigns.current_phase = 'post_settlement'.
--   4. Closes any open bargaining_decision_points
--      (resolution → 'settled', appends note, sets resolved_at).
--   5. Returns JSONB {success, campaign_id, transitioned_at}.
-- ============================================================

-- ── Ensure enum value exists ──────────────────────────────────────────────────

ALTER TYPE campaign_phase_enum ADD VALUE IF NOT EXISTS 'post_settlement';

-- ── Extend plan_revision_notes to cover bargaining stages 7–11 ───────────────
-- The original constraint was BETWEEN 1 AND 6 (set in 20260506110000).
-- The bargaining stage page should be able to log revision notes for
-- active/completed stages in the 7–11 range.

ALTER TABLE plan_revision_notes
  DROP CONSTRAINT IF EXISTS plan_revision_notes_stage_number_affected_check;

ALTER TABLE plan_revision_notes
  ADD CONSTRAINT plan_revision_notes_stage_number_affected_check
    CHECK (stage_number_affected BETWEEN 1 AND 11);

-- ── RPC ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION transition_to_post_settlement(p_campaign_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_phase  campaign_phase_enum;
  v_endorsement_ok BOOLEAN;
  v_transitioned_at TIMESTAMPTZ;
BEGIN
  -- 1. Verify campaign phase ──────────────────────────────────────────────────
  SELECT current_phase
    INTO v_current_phase
    FROM campaigns
   WHERE campaign_id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       'campaign_not_found',
      'campaign_id', p_campaign_id
    );
  END IF;

  IF v_current_phase <> 'bargaining_to_win' THEN
    RETURN jsonb_build_object(
      'success',        false,
      'error',          'wrong_phase',
      'current_phase',  v_current_phase::text,
      'campaign_id',    p_campaign_id
    );
  END IF;

  -- 2. Verify final EBA endorsement ─────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1
      FROM member_endorsement_votes
     WHERE campaign_id = p_campaign_id
       AND vote_kind   = 'final_eba'
       AND outcome     = 'yes'
  ) INTO v_endorsement_ok;

  IF NOT v_endorsement_ok THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       'no_final_eba_endorsement',
      'campaign_id', p_campaign_id
    );
  END IF;

  -- 3. Transition campaign phase ─────────────────────────────────────────────
  v_transitioned_at := now();

  UPDATE campaigns
     SET current_phase = 'post_settlement'
   WHERE campaign_id = p_campaign_id;

  -- 4. Close open decision points ───────────────────────────────────────────
  UPDATE bargaining_decision_points
     SET resolution  = 'settled',
         resolved_at = v_transitioned_at,
         notes       = COALESCE(
                         NULLIF(notes, ''),
                         'Closed by post-settlement transition'
                       )
   WHERE campaign_id  = p_campaign_id
     AND (resolution IS NULL OR resolution = 'pending');

  -- 5. Return success ────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',          true,
    'campaign_id',      p_campaign_id,
    'transitioned_at',  v_transitioned_at
  );
END;
$$;

COMMENT ON FUNCTION transition_to_post_settlement(INTEGER) IS
  'Transitions a campaign from bargaining_to_win to post_settlement. '
  'Verifies phase and that a final_eba vote with outcome=yes exists. '
  'Closes any pending bargaining_decision_points and returns a JSONB result.';

GRANT EXECUTE ON FUNCTION transition_to_post_settlement(INTEGER) TO authenticated;
