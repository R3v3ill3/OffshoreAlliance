-- ============================================================
-- Phase 8 (Wave 6): WOC meeting activity template seed function
-- + extended begin_bargaining_phase to invoke it.
--
-- 1. seed_bargaining_woc_template(p_campaign_id INT)
--    Idempotently inserts a 'bargaining_woc_meeting' activity row
--    for the given campaign if one does not already exist.
--
-- 2. CREATE OR REPLACE begin_bargaining_phase(...)
--    Replaces the function from 20260516100000 to also call
--    seed_bargaining_woc_template at the end (before RETURN).
--    All existing logic is preserved exactly.
-- ============================================================

-- ── 1. WOC template seed helper ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION seed_bargaining_woc_template(p_campaign_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaign_activities
     WHERE campaign_id = p_campaign_id
       AND template_key = 'bargaining_woc_meeting'
  ) THEN
    INSERT INTO campaign_activities (
      campaign_id,
      activity_kind,
      title,
      template_key,
      is_custom
    ) VALUES (
      p_campaign_id,
      'woc_meeting',
      'Wages Outcome Committee Meeting',
      'bargaining_woc_meeting',
      false
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_bargaining_woc_template(INT) TO authenticated;

COMMENT ON FUNCTION seed_bargaining_woc_template(INT) IS
  'Phase 8: Idempotently inserts a woc_meeting activity template row for a '
  'campaign. Called from begin_bargaining_phase and safe to call multiple times.';

-- ── 2. Extended begin_bargaining_phase ───────────────────────────────────────
-- Full re-implementation of begin_bargaining_phase from
-- 20260516100000_begin_bargaining_phase_rpc.sql, with
-- seed_bargaining_woc_template added at step 10 (new),
-- pushing the RETURN to step 11.

CREATE OR REPLACE FUNCTION begin_bargaining_phase(
  p_campaign_id                     INT,
  p_bargaining_commenced_at         DATE,
  p_carryforward_ambition_ids       INT[],
  p_carryforward_situation_analysis_id INT,
  p_claim_summary                   TEXT,
  p_pia_seed_pack                   TEXT,        -- 'offshore_standard' | 'shore_based_standard'
  p_situation_overrides             JSONB,       -- merged into new SA row
  p_setup_mode                      TEXT         -- 'continuation' | 'standalone'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage7_plan_id  INT;
  v_plan_id         INT;
  v_ambition_id     INT;
  v_new_sa_id       INT;
  v_new_version     INT;
  v_existing_phase  TEXT;
BEGIN
  -- ── 1. Authorisation ─────────────────────────────────────────────────────
  IF get_user_role() NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'begin_bargaining_phase: permission denied (role=%)', get_user_role();
  END IF;

  -- ── 2. Guard: already in bargaining_to_win ───────────────────────────────
  SELECT current_phase::TEXT
    INTO v_existing_phase
    FROM campaigns
   WHERE campaign_id = p_campaign_id;

  IF v_existing_phase = 'bargaining_to_win' THEN
    RAISE EXCEPTION 'begin_bargaining_phase: campaign % is already in bargaining_to_win phase', p_campaign_id;
  END IF;

  -- ── 3. Create campaign_stage_plans for stages 7–11 ───────────────────────
  -- Stage 7 is active; 8–11 are draft.
  INSERT INTO campaign_stage_plans (
    campaign_id,
    stage_number,
    stage_name,
    status,
    phase
  ) VALUES
    (p_campaign_id, 7,  'Bargaining Commences',             'active',  'bargaining_to_win'::campaign_phase_enum),
    (p_campaign_id, 8,  'Testing the Employer',             'draft',   'bargaining_to_win'::campaign_phase_enum),
    (p_campaign_id, 9,  'Strength Assessment & Decision',   'draft',   'bargaining_to_win'::campaign_phase_enum),
    (p_campaign_id, 10, 'Protected Industrial Action',      'draft',   'bargaining_to_win'::campaign_phase_enum),
    (p_campaign_id, 11, 'Settlement & Ratification',        'draft',   'bargaining_to_win'::campaign_phase_enum)
  RETURNING plan_id INTO v_stage7_plan_id;

  -- Capture the stage 7 plan_id (the INSERT…RETURNING above only returns the
  -- last inserted row — fetch it explicitly to be safe).
  SELECT plan_id
    INTO v_stage7_plan_id
    FROM campaign_stage_plans
   WHERE campaign_id = p_campaign_id
     AND stage_number = 7;

  -- ── 4. Carry-forward ambitions into stage 7 plan_ambitions ───────────────
  IF p_carryforward_ambition_ids IS NOT NULL AND array_length(p_carryforward_ambition_ids, 1) > 0 THEN
    INSERT INTO plan_ambitions (
      plan_id,
      custom_text,
      sort_order
    )
    SELECT
      v_stage7_plan_id,
      ca.label,
      ca.sort_order
    FROM campaign_ambitions ca
    WHERE ca.campaign_ambition_id = ANY(p_carryforward_ambition_ids)
      AND ca.campaign_id = p_campaign_id;
  END IF;

  -- ── 5. Clone situation analysis + apply overrides ────────────────────────
  IF p_carryforward_situation_analysis_id IS NOT NULL THEN
    -- Determine next version number for this campaign
    SELECT COALESCE(MAX(version), 0) + 1
      INTO v_new_version
      FROM campaign_situation_analyses
     WHERE campaign_id = p_campaign_id;

    -- Mark existing current row as not-current
    UPDATE campaign_situation_analyses
       SET is_current = FALSE
     WHERE campaign_id = p_campaign_id
       AND is_current = TRUE;

    -- Insert cloned row with overrides merged in
    INSERT INTO campaign_situation_analyses (
      campaign_id,
      version,
      is_current,
      employer_interaction_state,
      employer_state_notes,
      balloted_count,
      top_issues,
      upcoming_workforce_changes,
      employer_relationships,
      hr_posture,
      union_history,
      strategic_context_summary,
      company_playbook,
      workforce_populations,
      leverage_and_maths,
      information_gaps,
      ai_generated,
      ai_model,
      ai_prompt_snapshot
    )
    SELECT
      campaign_id,
      v_new_version,
      TRUE,
      -- Apply scalar overrides from p_situation_overrides JSONB if provided
      COALESCE(
        p_situation_overrides->>'employer_interaction_state',
        employer_interaction_state
      ),
      COALESCE(
        p_situation_overrides->>'employer_state_notes',
        employer_state_notes
      ),
      COALESCE(
        (p_situation_overrides->>'balloted_count')::INT,
        balloted_count
      ),
      CASE WHEN p_situation_overrides ? 'top_issues'
           THEN p_situation_overrides->'top_issues'
           ELSE top_issues END,
      CASE WHEN p_situation_overrides ? 'upcoming_workforce_changes'
           THEN p_situation_overrides->'upcoming_workforce_changes'
           ELSE upcoming_workforce_changes END,
      CASE WHEN p_situation_overrides ? 'employer_relationships'
           THEN p_situation_overrides->'employer_relationships'
           ELSE employer_relationships END,
      CASE WHEN p_situation_overrides ? 'hr_posture'
           THEN p_situation_overrides->'hr_posture'
           ELSE hr_posture END,
      CASE WHEN p_situation_overrides ? 'union_history'
           THEN p_situation_overrides->'union_history'
           ELSE union_history END,
      COALESCE(
        p_situation_overrides->>'strategic_context_summary',
        strategic_context_summary
      ),
      CASE WHEN p_situation_overrides ? 'company_playbook'
           THEN p_situation_overrides->'company_playbook'
           ELSE company_playbook END,
      CASE WHEN p_situation_overrides ? 'workforce_populations'
           THEN p_situation_overrides->'workforce_populations'
           ELSE workforce_populations END,
      CASE WHEN p_situation_overrides ? 'leverage_and_maths'
           THEN p_situation_overrides->'leverage_and_maths'
           ELSE leverage_and_maths END,
      CASE WHEN p_situation_overrides ? 'information_gaps'
           THEN p_situation_overrides->'information_gaps'
           ELSE information_gaps END,
      ai_generated,
      ai_model,
      ai_prompt_snapshot
    FROM campaign_situation_analyses
    WHERE situation_id = p_carryforward_situation_analysis_id
      AND campaign_id = p_campaign_id
    RETURNING situation_id INTO v_new_sa_id;
  END IF;

  -- ── 6. Insert intractable_bargaining_tracker row ─────────────────────────
  INSERT INTO intractable_bargaining_tracker (
    campaign_id,
    bargaining_commenced_at,
    state
  ) VALUES (
    p_campaign_id,
    p_bargaining_commenced_at,
    'safe'
  );

  -- ── 7. Seed PIA pack (if function exists) ────────────────────────────────
  IF p_pia_seed_pack = 'offshore_standard' THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'seed_pia_pack_offshore_standard'
        AND n.nspname = 'public'
    ) THEN
      BEGIN
        PERFORM seed_pia_pack_offshore_standard(p_campaign_id);
      EXCEPTION WHEN undefined_function THEN
        NULL; -- function was dropped between check and call — ignore
      END;
    END IF;
  ELSIF p_pia_seed_pack = 'shore_based_standard' THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'seed_pia_pack_shore_based_standard'
        AND n.nspname = 'public'
    ) THEN
      BEGIN
        PERFORM seed_pia_pack_shore_based_standard(p_campaign_id);
      EXCEPTION WHEN undefined_function THEN
        NULL;
      END;
    END IF;
  END IF;

  -- ── 8. Seed bargaining gate definitions ──────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'seed_bargaining_gates'
      AND n.nspname = 'public'
  ) THEN
    BEGIN
      PERFORM seed_bargaining_gates(p_campaign_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;

  -- ── 9. Update campaigns ───────────────────────────────────────────────────
  UPDATE campaigns
     SET current_phase           = 'bargaining_to_win'::campaign_phase_enum,
         bargaining_commenced_at = p_bargaining_commenced_at
   WHERE campaign_id = p_campaign_id;

  -- ── 10. Seed WOC meeting activity template (Phase 8) ─────────────────────
  PERFORM seed_bargaining_woc_template(p_campaign_id);

  -- ── 11. Return summary ────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',          TRUE,
    'campaign_id',      p_campaign_id,
    'stage_7_plan_id',  v_stage7_plan_id,
    'setup_mode',       p_setup_mode,
    'new_sa_version',   v_new_version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION begin_bargaining_phase(
  INT, DATE, INT[], INT, TEXT, TEXT, JSONB, TEXT
) TO authenticated;

COMMENT ON FUNCTION begin_bargaining_phase IS
  'Atomically begins the Bargaining to Win phase for a campaign. Creates stage plans 7-11, '
  'carries forward ambitions, clones the situation analysis with overrides, seeds the '
  'intractable tracker, PIA pack, and WOC meeting activity template. Returns summary JSONB '
  'with stage_7_plan_id. (Phase 8: added WOC template seed step.)';
