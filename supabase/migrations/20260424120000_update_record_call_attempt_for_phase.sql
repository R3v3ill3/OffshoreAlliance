-- ============================================================
-- Migration: Rebind rating-writing RPCs / triggers to the new
--            4-column unique on campaign_activity_ratings.
--
-- Migration 20260424110000 dropped the legacy 2-column UNIQUE
-- (activity_id, worker_id) and introduced
-- UNIQUE NULLS NOT DISTINCT (activity_id, worker_id,
--                            rating_phase, event_id)
-- so any existing "ON CONFLICT (activity_id, worker_id)" clause
-- would fail at runtime. This migration updates the two DB
-- writers that still use it:
--
--   1. record_call_attempt()  — call-outcome-derived ratings
--   2. fn_auto_promote_task_list_leader() — auto-rate=1 on task take
--
-- Function bodies are preserved 1:1 apart from the INSERT /
-- ON CONFLICT clauses (explicit rating_phase='actual',
-- event_id=NULL). The composite-rating logic itself is kept as-is
-- in Phase 2; Phase 6 replaces it with a per-outcome mapping.
-- ============================================================

-- -----------------------------------------------------------
-- 1. record_call_attempt — copy of the 20260417100000 body
--    with the upsert conflict target updated.
-- -----------------------------------------------------------
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

      SELECT cod.is_positive, cod.activity_id, cod.outcome_category
      INTO v_outcome_row
      FROM call_outcome_definitions cod
      WHERE cod.outcome_id = v_outcome_id;

      IF v_outcome_row.is_positive THEN
        v_positive_count := v_positive_count + 1;
      ELSIF v_outcome_row.outcome_category = 'cta' AND NOT v_outcome_row.is_positive THEN
        v_negative_count := v_negative_count + 1;
      ELSE
        v_neutral_count := v_neutral_count + 1;
      END IF;
    END LOOP;

  -- 2c. Legacy: p_outcome_ids (backward compat with old INTEGER[] format)
  ELSIF array_length(p_outcome_ids, 1) > 0 THEN
    FOREACH v_outcome_id IN ARRAY p_outcome_ids
    LOOP
      INSERT INTO call_attempt_outcomes (attempt_id, outcome_id)
      VALUES (v_attempt_id, v_outcome_id)
      ON CONFLICT DO NOTHING;

      SELECT cod.is_positive, cod.activity_id, cod.outcome_category
      INTO v_outcome_row
      FROM call_outcome_definitions cod
      WHERE cod.outcome_id = v_outcome_id;

      IF v_outcome_row.is_positive THEN
        v_positive_count := v_positive_count + 1;
      ELSIF v_outcome_row.outcome_category = 'cta' AND NOT v_outcome_row.is_positive THEN
        v_negative_count := v_negative_count + 1;
      ELSE
        v_neutral_count := v_neutral_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 2d. Derive composite rating and write to assessment system.
  --     NOTE: Phase 6 replaces this composite with a per-outcome
  --     maps_to_rating_level mapping. The explicit rating_phase='actual'
  --     and event_id=NULL keep this write aligned with the new
  --     4-column unique constraint.
  IF v_positive_count + v_negative_count + v_neutral_count > 0 AND v_resolved_script_id IS NOT NULL THEN
    v_activity_id := (
      SELECT cod2.activity_id FROM call_outcome_definitions cod2
      WHERE cod2.script_id = v_resolved_script_id
        AND cod2.activity_id IS NOT NULL
      LIMIT 1
    );

    IF v_activity_id IS NOT NULL AND v_campaign_id IS NOT NULL THEN
      IF v_positive_count > 0 AND v_negative_count = 0 THEN
        v_rating := 4;
      ELSIF v_positive_count > 0 AND v_negative_count > 0 THEN
        v_rating := 3;
      ELSIF v_negative_count > 0 THEN
        v_rating := 2;
      ELSE
        v_rating := 3;
      END IF;

      INSERT INTO campaign_activity_ratings (
        activity_id, worker_id, rating, source, rated_at, rating_phase, event_id
      )
      VALUES (
        v_activity_id, v_worker_id, v_rating, 'call_outcome', now(), 'actual', NULL
      )
      ON CONFLICT (activity_id, worker_id, rating_phase, event_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        rated_at = EXCLUDED.rated_at,
        source = EXCLUDED.source;
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

  -- 5. Update call_lists completed_items count
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

-- -----------------------------------------------------------
-- 2. fn_auto_promote_task_list_leader — same behaviour,
--    updated conflict target.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_promote_task_list_leader()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.leader_worker_id IS NOT NULL THEN
    -- Promote to Activist if currently no role or Contact
    UPDATE workers
    SET member_role_type_id = 8  -- Activist
    WHERE worker_id = NEW.leader_worker_id
      AND (member_role_type_id IS NULL OR member_role_type_id = 3);

    -- Auto-rate the leader as 1 (supportive leader) for the linked
    -- activity. Phase 4 extends this to propagate across every
    -- worker_assessable ambition linked in activity_ambitions.
    IF NEW.activity_id IS NOT NULL THEN
      INSERT INTO campaign_activity_ratings
        (activity_id, worker_id, rating, source, rated_at, rating_phase, event_id)
      VALUES
        (NEW.activity_id, NEW.leader_worker_id, 1, 'task_take', now(), 'actual', NULL)
      ON CONFLICT (activity_id, worker_id, rating_phase, event_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
