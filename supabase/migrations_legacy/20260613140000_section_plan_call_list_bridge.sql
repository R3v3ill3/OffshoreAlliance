-- Phase G — Section plan ↔ phone bridge
-- G1. Add section_plan_id FK to call_lists (nullable).
-- G2/G3. create_call_list_from_activity RPC.
-- G3. Update materialise_sequence_run to call it for phone_call_list steps.

-- ─────────────────────────────────────────────────────────────
-- G1. section_plan_id on call_lists
-- ─────────────────────────────────────────────────────────────
ALTER TABLE call_lists
  ADD COLUMN IF NOT EXISTS section_plan_id BIGINT
  REFERENCES section_plans(section_plan_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cl_section_plan ON call_lists(section_plan_id)
  WHERE section_plan_id IS NOT NULL;

COMMENT ON COLUMN call_lists.section_plan_id IS
  'Optional FK to section_plans: links this list to the section scope it was created for.';

-- ─────────────────────────────────────────────────────────────
-- G2. create_call_list_from_activity(p_activity_id)
--
-- Creates a call_list scaffolded from the given campaign_activity
-- (which must have activity_kind = ''phone_call_list'').
-- Inherits campaign_id, section_plan_id, and title from the activity.
-- Returns the new list_id.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_call_list_from_activity(p_activity_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_act    campaign_activities%ROWTYPE;
  v_list_id INTEGER;
BEGIN
  SELECT * INTO v_act
  FROM campaign_activities
  WHERE activity_id = p_activity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity % not found', p_activity_id;
  END IF;

  IF v_act.activity_kind <> 'phone_call_list' THEN
    RAISE EXCEPTION
      'Activity % has kind %, expected phone_call_list',
      p_activity_id, v_act.activity_kind;
  END IF;

  INSERT INTO call_lists (
    campaign_id,
    section_plan_id,
    name,
    description,
    status
  )
  VALUES (
    v_act.campaign_id,
    v_act.section_plan_id,
    COALESCE(v_act.title, 'Call list — section activity ' || p_activity_id),
    v_act.description,
    'draft'
  )
  RETURNING list_id INTO v_list_id;

  RETURN v_list_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION create_call_list_from_activity(INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- G3. Update materialise_sequence_run to create a call_list
--     when target_activity_kind = 'phone_call_list'.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION materialise_sequence_run(p_run_id BIGINT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step       activity_sequence_steps%ROWTYPE;
  v_seq        activity_sequences%ROWTYPE;
  v_section    section_plans%ROWTYPE;
  v_source     campaign_activities%ROWTYPE;
  v_run        activity_sequence_runs%ROWTYPE;
  v_title      TEXT;
  v_new_id     INT;
  v_list_id    INT;
BEGIN
  SELECT * INTO v_run FROM activity_sequence_runs WHERE run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_run.state <> 'queued' THEN
    RAISE EXCEPTION 'run % not in queued state (state=%)', p_run_id, v_run.state;
  END IF;

  SELECT * INTO v_step FROM activity_sequence_steps WHERE step_id = v_run.step_id;
  SELECT * INTO v_seq  FROM activity_sequences      WHERE sequence_id = v_step.sequence_id;
  SELECT * INTO v_section FROM section_plans        WHERE section_plan_id = v_seq.section_plan_id;

  IF v_step.source_activity_id IS NOT NULL THEN
    SELECT * INTO v_source FROM campaign_activities WHERE activity_id = v_step.source_activity_id;
  END IF;

  v_title := COALESCE(
    v_step.target_payload ->> 'title',
    CASE
      WHEN v_source.title IS NOT NULL
      THEN v_source.title || ' — follow-up (' || v_step.target_activity_kind || ')'
      ELSE 'Sequence step (' || v_step.target_activity_kind || ')'
    END
  );

  INSERT INTO campaign_activities (
    campaign_id, section_plan_id, title, description,
    template_key, activity_kind, is_custom
  )
  VALUES (
    v_section.campaign_id, v_section.section_plan_id, v_title,
    COALESCE(v_step.target_payload ->> 'description', NULL),
    v_step.target_activity_template_key,
    v_step.target_activity_kind,
    TRUE
  )
  RETURNING activity_id INTO v_new_id;

  -- G3: For phone_call_list steps, also scaffold a call_list.
  IF v_step.target_activity_kind = 'phone_call_list' THEN
    BEGIN
      v_list_id := create_call_list_from_activity(v_new_id);
    EXCEPTION WHEN OTHERS THEN
      -- Non-fatal: list creation failure is logged in notes but does not
      -- prevent the activity from being materialised.
      UPDATE activity_sequence_runs
         SET notes = COALESCE(notes, '') || E'\nWarning: call_list creation failed: ' || SQLERRM
       WHERE run_id = p_run_id;
    END;
  END IF;

  UPDATE activity_sequence_runs
     SET state = 'materialised',
         materialised_activity_id = v_new_id,
         notes = COALESCE(notes, '') || 'Materialised at ' || now()::TEXT
           || CASE WHEN v_list_id IS NOT NULL
                   THEN ' (call_list_id=' || v_list_id || ')'
                   ELSE '' END
   WHERE run_id = p_run_id;

  RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE activity_sequence_runs
     SET state = 'failed', notes = COALESCE(notes, '') || E'\nError: ' || SQLERRM
   WHERE run_id = p_run_id;
  RAISE;
END;
$fn$;
