-- Membership join from calls: set member_pending (not financial_member) for eligible workers.
-- Rename side_effect value set_membership_financial -> set_membership_pending.

ALTER TABLE call_outcome_definitions
  DROP CONSTRAINT IF EXISTS call_outcome_definitions_side_effect_check;

UPDATE call_outcome_definitions
SET side_effect = 'set_membership_pending'
WHERE side_effect = 'set_membership_financial';

ALTER TABLE call_outcome_definitions
  ADD CONSTRAINT call_outcome_definitions_side_effect_check
  CHECK (side_effect IN ('none', 'set_membership_pending'));

COMMENT ON COLUMN call_outcome_definitions.side_effect IS
  'Domain effect when positively recorded: set_membership_pending sets workers to member_pending (not already financial_member).';

-- Replace side-effect helper: pending id + skip financial members
CREATE OR REPLACE FUNCTION apply_call_outcome_side_effects(
  p_attempt_id INTEGER,
  p_worker_id INTEGER,
  p_campaign_id INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_pending_id INTEGER;
  v_financial_id INTEGER;
  v_apply BOOLEAN;
  v_truthy TEXT[];
  v_val TEXT;
  v_ambition_campaign INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN;
  END IF;

  SELECT union_membership_type_id INTO v_pending_id
  FROM union_membership_types
  WHERE type_name = 'member_pending'
  LIMIT 1;

  SELECT union_membership_type_id INTO v_financial_id
  FROM union_membership_types
  WHERE type_name = 'financial_member'
  LIMIT 1;

  IF v_pending_id IS NULL OR v_financial_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT
      cao.outcome_id,
      cao.response_value,
      cod.side_effect,
      cod.side_effect_payload,
      cod.maps_to_ambition_id,
      cod.response_type
    FROM call_attempt_outcomes cao
    JOIN call_outcome_definitions cod ON cod.outcome_id = cao.outcome_id
    WHERE cao.attempt_id = p_attempt_id
      AND cod.side_effect = 'set_membership_pending'
  LOOP
    v_apply := false;
    IF v_row.response_type = 'checkbox' THEN
      v_apply := true;
    ELSIF v_row.response_type = 'select' THEN
      v_val := lower(trim(coalesce(v_row.response_value, '')));
      v_truthy := ARRAY['joined', 'yes', 'financial_member', 'member', 'member_pending', 'pending'];
      IF v_row.side_effect_payload IS NOT NULL
         AND jsonb_typeof(v_row.side_effect_payload->'select_truthy_values') = 'array' THEN
        SELECT array_agg(lower(t.v))
        INTO v_truthy
        FROM jsonb_array_elements_text(v_row.side_effect_payload->'select_truthy_values') AS t(v);
        IF v_truthy IS NULL THEN
          v_truthy := ARRAY['joined', 'yes', 'financial_member', 'member', 'member_pending', 'pending'];
        END IF;
      END IF;
      IF v_val = ANY (v_truthy) THEN
        v_apply := true;
      END IF;
    END IF;

    IF NOT v_apply THEN
      CONTINUE;
    END IF;

    UPDATE workers w
    SET
      union_membership_type_id = v_pending_id,
      join_date = COALESCE(w.join_date, CURRENT_DATE),
      updated_at = now()
    WHERE w.worker_id = p_worker_id
      AND w.union_membership_type_id IS DISTINCT FROM v_financial_id
      AND w.union_membership_type_id IS DISTINCT FROM v_pending_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      CONTINUE;
    END IF;

    IF v_row.maps_to_ambition_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT csp.campaign_id INTO v_ambition_campaign
    FROM plan_ambitions pa
    JOIN campaign_stage_plans csp ON csp.plan_id = pa.plan_id
    WHERE pa.ambition_id = v_row.maps_to_ambition_id
    LIMIT 1;

    IF v_ambition_campaign IS NULL OR v_ambition_campaign <> p_campaign_id THEN
      CONTINUE;
    END IF;

    INSERT INTO ambition_progress_events (
      ambition_id, campaign_id, worker_id, source, attempt_id, outcome_id, delta_numeric, metadata
    ) VALUES (
      v_row.maps_to_ambition_id,
      p_campaign_id,
      p_worker_id,
      'phone_call',
      p_attempt_id,
      v_row.outcome_id,
      1,
      jsonb_build_object('side_effect', 'set_membership_pending')
    )
    ON CONFLICT (attempt_id, outcome_id, worker_id) DO NOTHING;
  END LOOP;
END;
$$;
