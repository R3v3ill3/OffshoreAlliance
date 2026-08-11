-- ============================================================
-- Fix: record_call_attempt must not pass the call attempt_id as
-- an activity_events event_id.
--
-- record_call_attempt propagated CTA and session-assessment
-- ratings into campaign_activity_ratings via record_assessment_event,
-- passing `p_event_id := v_attempt_id`. But campaign_activity_ratings.event_id
-- carries FK car_event_id_fk → activity_events(event_id), and a
-- call_attempts.attempt_id is NOT an activity_events row. So the very
-- first time a caller recorded a CTA-with-activity or session-assessment
-- rating, the INSERT violated the FK and aborted the whole
-- record_call_attempt transaction (PostgREST surfaced this as HTTP 409),
-- recording neither the attempt nor any progress.
--
-- A phone call has no activity_events occurrence — per the
-- activity_events design, "NULL event_id means the rating is against
-- the activity in general (e.g. as assessed via 1:1)", which is exactly
-- the call case. The call ↔ rating linkage is already preserved in
-- call_attempt_cta_ratings / call_attempt_assessment_ratings (both keyed
-- by attempt_id), so the campaign_activity_ratings row simply needs
-- event_id = NULL.
--
-- This migration re-creates the 22-arg signature unchanged except for
-- passing NULL event_id in the two record_assessment_event calls.
-- ============================================================

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
  p_step_outcomes JSONB DEFAULT '[]'::JSONB,
  p_objections JSONB DEFAULT '[]'::JSONB,
  p_issues JSONB DEFAULT '[]'::JSONB,
  p_cta_ratings JSONB DEFAULT '[]'::JSONB,
  p_assessment_ratings JSONB DEFAULT '[]'::JSONB,
  p_action_id INTEGER DEFAULT NULL,
  p_share_token_id INTEGER DEFAULT NULL,
  p_caller_leader_worker_id INTEGER DEFAULT NULL,
  p_caller_session_label TEXT DEFAULT NULL,
  p_caller_session_worker_id INTEGER DEFAULT NULL,
  p_outcome_classification VARCHAR(40) DEFAULT NULL
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
  v_obj JSONB;
  v_iss JSONB;
  v_cta JSONB;
  v_ar JSONB;
  v_objections_inserted INTEGER := 0;
  v_issues_inserted INTEGER := 0;
  v_cta_ratings_inserted INTEGER := 0;
  v_assessment_ratings_inserted INTEGER := 0;
  v_ambition_id INTEGER;
  v_ambition_activity_id INTEGER;
  v_cta_rating SMALLINT;
  v_cta_binary VARCHAR(30);
  v_cta_notes TEXT;
  v_ar_activity_id INTEGER;
  v_ar_rating SMALLINT;
  v_ar_notes TEXT;
BEGIN
  SELECT cli.worker_id, cl.campaign_id, cli.list_id
  INTO v_worker_id, v_campaign_id, v_list_id
  FROM call_list_items cli
  JOIN call_lists cl ON cl.list_id = cli.list_id
  WHERE cli.item_id = p_list_item_id;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'call_list_item % not found', p_list_item_id;
  END IF;

  INSERT INTO call_attempts (
    list_item_id, script_id, caller_user_id,
    dial_disposition, call_disposition,
    overall_notes, callback_datetime, support_level_assessed,
    follow_up_action, cta_response, duration_seconds,
    ended_at,
    share_token_id, caller_leader_worker_id,
    caller_session_label, caller_session_worker_id,
    outcome_classification
  ) VALUES (
    p_list_item_id, p_script_id, p_caller_user_id,
    p_dial_disposition, p_call_disposition,
    p_overall_notes, p_callback_datetime, p_support_level,
    p_follow_up_action, p_cta_response, p_duration_seconds,
    CASE WHEN p_duration_seconds IS NOT NULL THEN now() ELSE NULL END,
    p_share_token_id, p_caller_leader_worker_id,
    LEFT(p_caller_session_label, 80), p_caller_session_worker_id,
    p_outcome_classification
  )
  RETURNING attempt_id INTO v_attempt_id;

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

  IF p_call_disposition IN ('removed_from_campaign', 'no_longer_in_universe') THEN
    v_item_status := 'completed';
  ELSIF p_dial_disposition = 'callback_requested' OR p_call_disposition = 'partial_asked_callback' THEN
    v_item_status := 'deferred';
  ELSIF p_dial_disposition = 'connected' AND p_call_disposition IS NOT NULL THEN
    v_item_status := 'completed';
  ELSIF p_dial_disposition IN ('disconnected', 'wrong_number', 'do_not_call') THEN
    v_item_status := 'completed';
  ELSE
    v_item_status := 'pending';
  END IF;

  UPDATE call_list_items SET
    status = v_item_status,
    attempts_count = attempts_count + 1,
    last_attempt_at = now(),
    best_disposition = COALESCE(p_call_disposition, p_dial_disposition),
    next_call_at = p_callback_datetime,
    claimed_at = NULL,
    claimed_by_session_label = NULL,
    claimed_by_worker_id = NULL,
    updated_at = now()
  WHERE item_id = p_list_item_id;

  UPDATE call_lists SET
    completed_items = (
      SELECT COUNT(*) FROM call_list_items
      WHERE list_id = v_list_id AND status IN ('completed', 'skipped')
    ),
    updated_at = now()
  WHERE list_id = v_list_id;

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

  INSERT INTO worker_activity_log (
    connection_id, activity_type, activity_date,
    description, outcome, contact_method,
    duration_minutes, logged_by, action_id
  ) VALUES (
    v_connection_id, 'contact', now(),
    COALESCE(p_overall_notes, 'Phone call attempt'),
    COALESCE(p_outcome_classification, p_call_disposition, p_dial_disposition),
    'phone',
    CASE WHEN p_duration_seconds IS NOT NULL
      THEN CEIL(p_duration_seconds / 60.0)::INTEGER
      ELSE NULL
    END,
    p_caller_user_id,
    p_action_id
  );

  FOR v_obj IN SELECT * FROM jsonb_array_elements(p_objections)
  LOOP
    INSERT INTO call_attempt_objections (
      attempt_id, worker_id, objection_id, custom_label, outcome, notes
    ) VALUES (
      v_attempt_id,
      v_worker_id,
      (v_obj->>'objection_id')::INTEGER,
      v_obj->>'custom_label',
      v_obj->>'outcome',
      v_obj->>'notes'
    );
    v_objections_inserted := v_objections_inserted + 1;
  END LOOP;

  FOR v_cta IN SELECT * FROM jsonb_array_elements(p_cta_ratings)
  LOOP
    v_ambition_id := (v_cta->>'cta_ambition_id')::INTEGER;
    IF v_ambition_id IS NULL THEN CONTINUE; END IF;

    SELECT activity_id INTO v_ambition_activity_id
    FROM call_script_cta_ambitions
    WHERE id = v_ambition_id;

    v_cta_rating := NULLIF(v_cta->>'rating', '')::SMALLINT;
    v_cta_binary := NULLIF(v_cta->>'binary_value', '');
    v_cta_notes  := NULLIF(v_cta->>'notes', '');

    IF v_cta_rating IS NULL AND v_cta_binary IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO call_attempt_cta_ratings (
      attempt_id, cta_ambition_id, activity_id, worker_id,
      rating, binary_value, notes, created_by
    ) VALUES (
      v_attempt_id, v_ambition_id, v_ambition_activity_id, v_worker_id,
      v_cta_rating, v_cta_binary, v_cta_notes, p_caller_user_id
    )
    ON CONFLICT (attempt_id, cta_ambition_id) DO UPDATE SET
      rating       = EXCLUDED.rating,
      binary_value = EXCLUDED.binary_value,
      notes        = EXCLUDED.notes,
      activity_id  = EXCLUDED.activity_id,
      created_by   = EXCLUDED.created_by;

    v_cta_ratings_inserted := v_cta_ratings_inserted + 1;

    IF v_ambition_activity_id IS NOT NULL THEN
      PERFORM record_assessment_event(
        p_activity_id   := v_ambition_activity_id,
        p_worker_id     := v_worker_id,
        p_rating        := v_cta_rating,
        p_binary_value  := v_cta_binary,
        p_rating_phase  := 'actual',
        -- A call attempt is not an activity_events occurrence; the call ↔
        -- rating link lives in call_attempt_cta_ratings. NULL event_id =
        -- "rating against the activity in general" per the activity_events
        -- design, and avoids the car_event_id_fk FK violation.
        p_event_id      := NULL,
        p_source        := 'call_outcome',
        p_notes         := v_cta_notes,
        p_actor_id      := p_caller_user_id
      );
    END IF;
  END LOOP;

  FOR v_ar IN SELECT * FROM jsonb_array_elements(p_assessment_ratings)
  LOOP
    v_ar_activity_id := NULLIF(v_ar->>'activity_id', '')::INTEGER;
    IF v_ar_activity_id IS NULL THEN CONTINUE; END IF;

    v_ar_rating := NULLIF(v_ar->>'rating', '')::SMALLINT;
    v_ar_notes  := NULLIF(v_ar->>'notes', '');

    INSERT INTO call_attempt_assessment_ratings (
      attempt_id, activity_id, rating, notes
    ) VALUES (
      v_attempt_id, v_ar_activity_id, v_ar_rating, v_ar_notes
    )
    ON CONFLICT (attempt_id, activity_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      notes  = EXCLUDED.notes;

    v_assessment_ratings_inserted := v_assessment_ratings_inserted + 1;

    IF v_ar_rating IS NOT NULL THEN
      PERFORM record_assessment_event(
        p_activity_id   := v_ar_activity_id,
        p_worker_id     := v_worker_id,
        p_rating        := v_ar_rating,
        p_binary_value  := NULL,
        p_rating_phase  := 'actual',
        -- See note above: NULL event_id, link preserved in
        -- call_attempt_assessment_ratings.
        p_event_id      := NULL,
        p_source        := 'call_outcome',
        p_notes         := v_ar_notes,
        p_actor_id      := p_caller_user_id
      );
    END IF;
  END LOOP;

  FOR v_iss IN SELECT * FROM jsonb_array_elements(p_issues)
  LOOP
    INSERT INTO call_issue_observations (
      attempt_id, worker_id, campaign_id, issue_label, heat, source_top_issue_index, notes
    ) VALUES (
      v_attempt_id,
      v_worker_id,
      v_campaign_id,
      v_iss->>'issue_label',
      (v_iss->>'heat')::SMALLINT,
      (v_iss->>'source_top_issue_index')::INTEGER,
      v_iss->>'notes'
    );
    v_issues_inserted := v_issues_inserted + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'attempt_id', v_attempt_id,
    'item_status', v_item_status,
    'connection_id', v_connection_id,
    'worker_id', v_worker_id,
    'campaign_id', v_campaign_id,
    'outcome_classification', p_outcome_classification,
    'objections_inserted', v_objections_inserted,
    'issues_inserted', v_issues_inserted,
    'cta_ratings_inserted', v_cta_ratings_inserted,
    'assessment_ratings_inserted', v_assessment_ratings_inserted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_call_attempt(
  INTEGER, INTEGER, UUID, VARCHAR, VARCHAR, TEXT, TIMESTAMPTZ,
  VARCHAR, TEXT, VARCHAR, INTEGER, JSONB, JSONB, JSONB, JSONB, JSONB,
  INTEGER, INTEGER, INTEGER, TEXT, INTEGER, VARCHAR
) TO authenticated;
