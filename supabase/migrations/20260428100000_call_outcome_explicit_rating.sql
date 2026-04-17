-- ============================================================
-- Migration: Call outcome explicit rating mapping
--
-- The existing composite rule in record_call_attempt()
-- flattens every call into one of {2, 3, 4} based on counts of
-- positive / negative / neutral outcomes. That's too coarse:
-- a clear "supportive leader" outcome (e.g. "Committed to
-- organising workmates") ends up rated 4 (opposed) next to a
-- "cool" outcome because the code doesn't know that the former
-- is rating level 1.
--
-- This migration:
--   1. Adds maps_to_rating_level (1..5) and maps_to_binary_value
--      columns to call_outcome_definitions.
--   2. Rewrites record_call_attempt's rating-derivation step:
--      * If any selected outcome defines maps_to_rating_level,
--        take the BEST (lowest numeric) value among positive
--        outcomes AND the WORST (highest numeric) among negative
--        outcomes; pick whichever is more informative.
--      * Fall back to the legacy composite (2 / 3 / 4) only when
--        no outcome has an explicit mapping.
--   3. maps_to_ambition_id remains for per-outcome reporting
--      but is no longer the propagation path (ambition rollup is
--      now through activity_ambitions + the rollup views).
-- ============================================================

-- 1. New columns on call_outcome_definitions
ALTER TABLE call_outcome_definitions
  ADD COLUMN IF NOT EXISTS maps_to_rating_level INT
    CHECK (maps_to_rating_level IS NULL OR (maps_to_rating_level BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS maps_to_binary_value VARCHAR(30);

COMMENT ON COLUMN call_outcome_definitions.maps_to_rating_level IS
  'Explicit rating (1..5) produced when this outcome is recorded. '
  'Takes precedence over the legacy is_positive / outcome_category '
  'composite. NULL = use legacy composite.';

COMMENT ON COLUMN call_outcome_definitions.maps_to_binary_value IS
  'Optional binary_value (e.g. yes/no/DNP) written to the rating '
  'alongside maps_to_rating_level. Used for outcome questions that '
  'record a structured response as well as a rating.';

-- 2. Rewrite record_call_attempt with explicit-mapping preference.
--    Body is identical to the previous version (20260424120000)
--    except for the "Derive composite rating" block.
CREATE OR REPLACE FUNCTION record_call_attempt(
  p_list_item_id INTEGER,
  p_script_id INTEGER,
  p_caller_user_id UUID,
  p_dial_disposition VARCHAR(30),
  p_call_disposition VARCHAR(30) DEFAULT NULL,
  p_overall_notes TEXT DEFAULT NULL,
  p_callback_datetime TIMESTAMPTZ DEFAULT NULL,
  p_support_level VARCHAR(30) DEFAULT NULL,
  p_follow_up_action TEXT DEFAULT NULL,
  p_cta_response VARCHAR(20) DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL,
  p_step_outcomes JSONB DEFAULT '[]',
  p_outcome_ids INTEGER[] DEFAULT '{}',
  p_outcome_entries JSONB DEFAULT '[]'
)
RETURNS JSONB AS $$
DECLARE
  v_attempt_id INTEGER;
  v_worker_id INTEGER;
  v_campaign_id INTEGER;
  v_list_id INTEGER;
  v_connection_id BIGINT;
  v_item_status VARCHAR(20);
  v_step JSONB;
  v_result JSONB;
  v_outcome_id INTEGER;
  v_outcome_row RECORD;
  v_positive_count INTEGER := 0;
  v_negative_count INTEGER := 0;
  v_neutral_count INTEGER := 0;
  v_activity_id INTEGER;
  v_rating INTEGER;
  v_binary_value VARCHAR(30);
  v_best_positive INTEGER := NULL;
  v_worst_negative INTEGER := NULL;
  v_any_explicit BOOLEAN := FALSE;
  v_entry JSONB;
  v_response_value TEXT;
  v_resolved_script_id INTEGER;
BEGIN
  SELECT cli.worker_id, cl.campaign_id, cli.list_id
  INTO v_worker_id, v_campaign_id, v_list_id
  FROM call_list_items cli
  JOIN call_lists cl ON cl.list_id = cli.list_id
  WHERE cli.item_id = p_list_item_id;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'call_list_item % not found', p_list_item_id;
  END IF;

  v_resolved_script_id := resolve_outcomes_script_id(COALESCE(p_script_id, 0));
  IF v_resolved_script_id = 0 THEN
    v_resolved_script_id := NULL;
  END IF;

  -- 1. Insert call_attempt
  INSERT INTO call_attempts (
    list_item_id, script_id, caller_user_id,
    dial_disposition, call_disposition,
    overall_notes, callback_datetime, support_level_assessed,
    follow_up_action, cta_response, duration_seconds,
    ended_at
  ) VALUES (
    p_list_item_id, p_script_id, p_caller_user_id,
    p_dial_disposition, p_call_disposition,
    p_overall_notes, p_callback_datetime, p_support_level,
    p_follow_up_action, p_cta_response, p_duration_seconds,
    CASE WHEN p_duration_seconds IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- 2. Insert step outcomes
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_step_outcomes)
  LOOP
    INSERT INTO call_step_outcomes (
      attempt_id, section_id, reached, outcome_value, notes, duration_seconds, sort_order
    ) VALUES (
      v_attempt_id,
      (v_step->>'section_id')::INTEGER,
      COALESCE((v_step->>'reached')::BOOLEAN, false),
      v_step->>'outcome_value',
      v_step->>'notes',
      (v_step->>'duration_seconds')::INTEGER,
      COALESCE((v_step->>'sort_order')::INTEGER, 0)
    );
  END LOOP;

  -- 2b. Process outcome entries (JSONB format with response_value)
  IF jsonb_array_length(p_outcome_entries) > 0 THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_outcome_entries)
    LOOP
      v_outcome_id := (v_entry->>'outcome_id')::INTEGER;
      v_response_value := v_entry->>'response_value';

      INSERT INTO call_attempt_outcomes (attempt_id, outcome_id, response_value)
      VALUES (v_attempt_id, v_outcome_id, v_response_value)
      ON CONFLICT (attempt_id, outcome_id) DO UPDATE SET response_value = EXCLUDED.response_value;

      SELECT cod.is_positive, cod.activity_id, cod.outcome_category,
             cod.maps_to_rating_level, cod.maps_to_binary_value
      INTO v_outcome_row
      FROM call_outcome_definitions cod
      WHERE cod.outcome_id = v_outcome_id;

      IF v_outcome_row.maps_to_rating_level IS NOT NULL THEN
        v_any_explicit := TRUE;
        IF v_outcome_row.maps_to_rating_level <= 2 THEN
          IF v_best_positive IS NULL OR v_outcome_row.maps_to_rating_level < v_best_positive THEN
            v_best_positive := v_outcome_row.maps_to_rating_level;
          END IF;
        ELSIF v_outcome_row.maps_to_rating_level >= 4 THEN
          IF v_worst_negative IS NULL OR v_outcome_row.maps_to_rating_level > v_worst_negative THEN
            v_worst_negative := v_outcome_row.maps_to_rating_level;
          END IF;
        END IF;
        IF v_outcome_row.maps_to_binary_value IS NOT NULL THEN
          v_binary_value := v_outcome_row.maps_to_binary_value;
        END IF;
      END IF;

      IF v_outcome_row.is_positive THEN
        v_positive_count := v_positive_count + 1;
      ELSIF v_outcome_row.outcome_category = 'cta' AND NOT v_outcome_row.is_positive THEN
        v_negative_count := v_negative_count + 1;
      ELSE
        v_neutral_count := v_neutral_count + 1;
      END IF;
    END LOOP;

  -- 2c. Legacy p_outcome_ids path (backward compat)
  ELSIF array_length(p_outcome_ids, 1) > 0 THEN
    FOREACH v_outcome_id IN ARRAY p_outcome_ids
    LOOP
      INSERT INTO call_attempt_outcomes (attempt_id, outcome_id)
      VALUES (v_attempt_id, v_outcome_id)
      ON CONFLICT DO NOTHING;

      SELECT cod.is_positive, cod.activity_id, cod.outcome_category,
             cod.maps_to_rating_level, cod.maps_to_binary_value
      INTO v_outcome_row
      FROM call_outcome_definitions cod
      WHERE cod.outcome_id = v_outcome_id;

      IF v_outcome_row.maps_to_rating_level IS NOT NULL THEN
        v_any_explicit := TRUE;
        IF v_outcome_row.maps_to_rating_level <= 2 THEN
          IF v_best_positive IS NULL OR v_outcome_row.maps_to_rating_level < v_best_positive THEN
            v_best_positive := v_outcome_row.maps_to_rating_level;
          END IF;
        ELSIF v_outcome_row.maps_to_rating_level >= 4 THEN
          IF v_worst_negative IS NULL OR v_outcome_row.maps_to_rating_level > v_worst_negative THEN
            v_worst_negative := v_outcome_row.maps_to_rating_level;
          END IF;
        END IF;
        IF v_outcome_row.maps_to_binary_value IS NOT NULL THEN
          v_binary_value := v_outcome_row.maps_to_binary_value;
        END IF;
      END IF;

      IF v_outcome_row.is_positive THEN
        v_positive_count := v_positive_count + 1;
      ELSIF v_outcome_row.outcome_category = 'cta' AND NOT v_outcome_row.is_positive THEN
        v_negative_count := v_negative_count + 1;
      ELSE
        v_neutral_count := v_neutral_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 2d. Derive rating.
  --     Prefer explicit maps_to_rating_level mapping; fall back to the
  --     legacy composite only when no explicit mapping was selected.
  IF v_positive_count + v_negative_count + v_neutral_count > 0 AND v_resolved_script_id IS NOT NULL THEN
    v_activity_id := (
      SELECT cod2.activity_id FROM call_outcome_definitions cod2
      WHERE cod2.script_id = v_resolved_script_id
        AND cod2.activity_id IS NOT NULL
      LIMIT 1
    );

    IF v_activity_id IS NOT NULL AND v_campaign_id IS NOT NULL THEN
      IF v_any_explicit THEN
        -- Pick the informative end: best positive if set, else worst negative, else 3.
        v_rating := COALESCE(v_best_positive, v_worst_negative, 3);
      ELSE
        -- Legacy composite
        IF v_positive_count > 0 AND v_negative_count = 0 THEN
          v_rating := 4;  -- NOTE: legacy value; migrate existing outcomes to
                          -- explicit mapping to get the correct 1..5 spread.
        ELSIF v_positive_count > 0 AND v_negative_count > 0 THEN
          v_rating := 3;
        ELSIF v_negative_count > 0 THEN
          v_rating := 2;
        ELSE
          v_rating := 3;
        END IF;
      END IF;

      PERFORM record_assessment_event(
        p_activity_id := v_activity_id,
        p_worker_id := v_worker_id,
        p_rating := v_rating,
        p_binary_value := v_binary_value,
        p_rating_phase := 'actual',
        p_event_id := NULL,
        p_source := 'call_outcome',
        p_notes := p_overall_notes,
        p_actor_id := p_caller_user_id
      );
    END IF;
  END IF;

  -- 2e. Membership / ambition side effects
  PERFORM apply_call_outcome_side_effects(v_attempt_id, v_worker_id, v_campaign_id);

  -- 3. Determine new item status
  IF p_dial_disposition = 'callback_requested' OR p_call_disposition = 'partial_asked_callback' THEN
    v_item_status := 'deferred';
  ELSIF p_dial_disposition = 'connected' AND p_call_disposition IS NOT NULL THEN
    v_item_status := 'completed';
  ELSIF p_dial_disposition IN ('disconnected', 'wrong_number', 'do_not_call') THEN
    v_item_status := 'completed';
  ELSE
    v_item_status := 'pending';
  END IF;

  -- 4. Update call_list_items
  UPDATE call_list_items SET
    status = v_item_status,
    attempts_count = attempts_count + 1,
    last_attempt_at = now(),
    best_disposition = COALESCE(p_call_disposition, p_dial_disposition),
    next_call_at = p_callback_datetime,
    updated_at = now()
  WHERE item_id = p_list_item_id;

  -- 5. Update call_lists completed_items
  UPDATE call_lists SET
    completed_items = (
      SELECT COUNT(*) FROM call_list_items
      WHERE list_id = v_list_id AND status IN ('completed', 'skipped')
    ),
    updated_at = now()
  WHERE list_id = v_list_id;

  -- 6. Upsert worker_campaign_connections
  IF v_campaign_id IS NOT NULL THEN
    SELECT connection_id INTO v_connection_id
    FROM worker_campaign_connections
    WHERE worker_id = v_worker_id AND campaign_id = v_campaign_id;

    IF v_connection_id IS NULL THEN
      INSERT INTO worker_campaign_connections (
        worker_id, campaign_id, connection_status,
        first_contacted_at, last_contacted_at, contact_count,
        preferred_contact_method, support_level, created_by
      ) VALUES (
        v_worker_id, v_campaign_id,
        CASE
          WHEN p_dial_disposition = 'connected' THEN 'contacted'
          ELSE 'potential'
        END,
        now(), now(), 1,
        'phone',
        p_support_level,
        p_caller_user_id
      )
      RETURNING connection_id INTO v_connection_id;
    ELSE
      UPDATE worker_campaign_connections SET
        connection_status = CASE
          WHEN p_dial_disposition = 'connected'
            AND connection_status IN ('potential', 'contacted') THEN 'engaged'
          WHEN p_dial_disposition = 'connected' THEN connection_status
          ELSE connection_status
        END,
        last_contacted_at = now(),
        contact_count = contact_count + 1,
        support_level = COALESCE(p_support_level, support_level),
        updated_at = now()
      WHERE connection_id = v_connection_id;
    END IF;

    -- 7. Insert worker_activity_log
    INSERT INTO worker_activity_log (
      connection_id, activity_type, activity_date,
      description, outcome, contact_method,
      duration_minutes, logged_by
    ) VALUES (
      v_connection_id, 'contact', now(),
      COALESCE(p_overall_notes, 'Phone call attempt'),
      COALESCE(p_call_disposition, p_dial_disposition),
      'phone',
      CASE WHEN p_duration_seconds IS NOT NULL
        THEN CEIL(p_duration_seconds / 60.0)::INTEGER
        ELSE NULL
      END,
      p_caller_user_id
    );
  END IF;

  v_result := jsonb_build_object(
    'attempt_id', v_attempt_id,
    'item_status', v_item_status,
    'connection_id', v_connection_id,
    'worker_id', v_worker_id,
    'campaign_id', v_campaign_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
