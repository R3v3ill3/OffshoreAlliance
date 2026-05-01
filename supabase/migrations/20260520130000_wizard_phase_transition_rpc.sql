-- ============================================================
-- Phase 4: set_campaign_phase() RPC
--
-- Simple admin/explicit phase override: updates current_phase
-- on a campaign directly. Used by the wizard flow to mark a
-- campaign as having entered a phase outside of the normal
-- begin_bargaining_phase() path.
-- ============================================================

CREATE OR REPLACE FUNCTION set_campaign_phase(p_campaign_id INT, p_phase TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns SET current_phase = p_phase WHERE id = p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_campaign_phase(INT, TEXT) TO authenticated;

COMMENT ON FUNCTION set_campaign_phase IS
  'Explicitly sets current_phase on a campaign. Admin/explicit override path; normal phase transitions should use begin_bargaining_phase().';
