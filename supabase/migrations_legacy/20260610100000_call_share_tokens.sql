-- ============================================================
-- Mobile shareable phone-call operator
--
-- Adds password-protected call-list share tokens plus soft-claim
-- primitives so multiple callers can safely work one shared list.
-- ============================================================

CREATE TABLE IF NOT EXISTS call_share_tokens (
  token_id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES call_lists(list_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_algo VARCHAR(20) NOT NULL,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  leader_worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_share_tokens_list_id ON call_share_tokens(list_id);
CREATE INDEX IF NOT EXISTS idx_call_share_tokens_token_hash ON call_share_tokens(token_hash);

ALTER TABLE call_share_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Authenticated users can read call_share_tokens"
      ON call_share_tokens FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can insert call_share_tokens"
      ON call_share_tokens FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can update call_share_tokens"
      ON call_share_tokens FOR UPDATE TO authenticated
      USING (get_user_role() IN ('admin', 'user'))
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS call_share_form_events (
  event_id BIGSERIAL PRIMARY KEY,
  token_id INTEGER NOT NULL REFERENCES call_share_tokens(token_id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (
    event_type IN (
      'opened',
      'auth_fail',
      'auth_success',
      'identity_set',
      'claim_acquired',
      'claim_released',
      'attempt_recorded'
    )
  ),
  worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  payload JSONB,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_share_form_events_token ON call_share_form_events(token_id);
CREATE INDEX IF NOT EXISTS idx_call_share_form_events_event_type ON call_share_form_events(event_type);
CREATE INDEX IF NOT EXISTS idx_call_share_form_events_created_at ON call_share_form_events(created_at DESC);

ALTER TABLE call_share_form_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Authenticated users can read call_share_form_events"
      ON call_share_form_events FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE call_list_items
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_session_label TEXT,
  ADD COLUMN IF NOT EXISTS claimed_by_worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_list_items_active_claim
  ON call_list_items(list_id, claimed_at)
  WHERE status = 'in_progress' AND claimed_at IS NOT NULL;

ALTER TABLE call_attempts
  ADD COLUMN IF NOT EXISTS share_token_id INTEGER REFERENCES call_share_tokens(token_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caller_leader_worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caller_session_label TEXT,
  ADD COLUMN IF NOT EXISTS caller_session_worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_attempts_share_token ON call_attempts(share_token_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_caller_session_worker ON call_attempts(caller_session_worker_id);

CREATE OR REPLACE FUNCTION claim_next_call_list_item(
  p_list_id INTEGER,
  p_session_label TEXT,
  p_session_worker_id INTEGER DEFAULT NULL,
  p_claim_ttl_seconds INTEGER DEFAULT 900
)
RETURNS INTEGER AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  WITH parent_list AS (
    SELECT list_id, priority_strategy
    FROM call_lists
    WHERE list_id = p_list_id
  ),
  candidate AS (
    SELECT cli.item_id
    FROM call_list_items cli
    JOIN parent_list pl ON pl.list_id = cli.list_id
    WHERE cli.list_id = p_list_id
      AND (
        cli.status = 'pending'
        OR (
          cli.status = 'in_progress'
          AND cli.claimed_at IS NOT NULL
          AND cli.claimed_at < now() - make_interval(secs => GREATEST(p_claim_ttl_seconds, 1))
        )
        OR (
          cli.status = 'deferred'
          AND cli.next_call_at IS NOT NULL
          AND cli.next_call_at <= now()
        )
      )
    ORDER BY
      CASE WHEN pl.priority_strategy = 'priority_score' THEN cli.priority_score END DESC NULLS LAST,
      CASE WHEN pl.priority_strategy = 'least_recently_contacted' THEN cli.last_attempt_at END ASC NULLS FIRST,
      cli.sort_order ASC,
      cli.item_id ASC
    LIMIT 1
    FOR UPDATE OF cli SKIP LOCKED
  )
  UPDATE call_list_items cli
  SET
    status = 'in_progress',
    claimed_at = now(),
    claimed_by_session_label = LEFT(p_session_label, 80),
    claimed_by_worker_id = p_session_worker_id,
    updated_at = now()
  FROM candidate
  WHERE cli.item_id = candidate.item_id
  RETURNING cli.item_id INTO v_item_id;

  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_call_list_item_claim(
  p_item_id INTEGER,
  p_session_label TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_released BOOLEAN := false;
BEGIN
  UPDATE call_list_items
  SET
    status = 'pending',
    claimed_at = NULL,
    claimed_by_session_label = NULL,
    claimed_by_worker_id = NULL,
    updated_at = now()
  WHERE item_id = p_item_id
    AND status = 'in_progress'
    AND claimed_by_session_label = p_session_label
  RETURNING true INTO v_released;

  RETURN COALESCE(v_released, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS record_call_attempt(
  INTEGER,
  INTEGER,
  UUID,
  VARCHAR,
  VARCHAR,
  TEXT,
  TIMESTAMPTZ,
  VARCHAR,
  TEXT,
  VARCHAR,
  INTEGER,
  JSONB,
  JSONB,
  JSONB,
  JSONB
);

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
  p_objections JSONB DEFAULT '[]'::JSONB,
  p_issues JSONB DEFAULT '[]'::JSONB,
  p_cta_ratings JSONB DEFAULT '[]'::JSONB,
  p_share_token_id INTEGER DEFAULT NULL,
  p_caller_leader_worker_id INTEGER DEFAULT NULL,
  p_caller_session_label TEXT DEFAULT NULL,
  p_caller_session_worker_id INTEGER DEFAULT NULL
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
  v_objections_inserted INTEGER := 0;
  v_issues_inserted INTEGER := 0;
  v_cta_ratings_inserted INTEGER := 0;
  v_ambition_id INTEGER;
  v_ambition_activity_id INTEGER;
  v_cta_rating SMALLINT;
  v_cta_binary VARCHAR(30);
  v_cta_notes TEXT;
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
    caller_session_label, caller_session_worker_id
  ) VALUES (
    p_list_item_id, p_script_id, p_caller_user_id,
    p_dial_disposition, p_call_disposition,
    p_overall_notes, p_callback_datetime, p_support_level,
    p_follow_up_action, p_cta_response, p_duration_seconds,
    CASE WHEN p_duration_seconds IS NOT NULL THEN now() ELSE NULL END,
    p_share_token_id, p_caller_leader_worker_id,
    LEFT(p_caller_session_label, 80), p_caller_session_worker_id
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

  IF p_dial_disposition = 'callback_requested' OR p_call_disposition = 'partial_asked_callback' THEN
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
        p_event_id      := v_attempt_id,
        p_source        := 'call_outcome',
        p_notes         := v_cta_notes,
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
    'objections_inserted', v_objections_inserted,
    'issues_inserted', v_issues_inserted,
    'cta_ratings_inserted', v_cta_ratings_inserted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION claim_next_call_list_item TO authenticated;
GRANT EXECUTE ON FUNCTION release_call_list_item_claim TO authenticated;
GRANT EXECUTE ON FUNCTION record_call_attempt(
  INTEGER,
  INTEGER,
  UUID,
  VARCHAR,
  VARCHAR,
  TEXT,
  TIMESTAMPTZ,
  VARCHAR,
  TEXT,
  VARCHAR,
  INTEGER,
  JSONB,
  JSONB,
  JSONB,
  JSONB,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER
) TO authenticated;
