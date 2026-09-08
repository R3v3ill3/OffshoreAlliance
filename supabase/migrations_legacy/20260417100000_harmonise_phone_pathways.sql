-- ============================================================
-- Harmonise phone pathways: script families, outcome side effects,
-- ambition progress events, standalone outcome definitions RLS.
-- ============================================================

-- -------------------------------------------------------
-- 1. Script family: variations point to base script
-- -------------------------------------------------------
ALTER TABLE call_scripts
  ADD COLUMN IF NOT EXISTS base_script_id INTEGER REFERENCES call_scripts(script_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_scripts_base ON call_scripts(base_script_id);

COMMENT ON COLUMN call_scripts.base_script_id IS
  'When set, this script is a variation of the base script; call_outcome_definitions for the family are stored against the base script_id.';

-- -------------------------------------------------------
-- 2. Resolve which script_id holds outcome definitions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_outcomes_script_id(p_script_id INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT c.base_script_id FROM call_scripts c WHERE c.script_id = p_script_id AND c.base_script_id IS NOT NULL),
    p_script_id
  );
$$;

COMMENT ON FUNCTION resolve_outcomes_script_id IS
  'Returns the base script_id used for call_outcome_definitions for this script (or p_script_id if this is the base).';

-- -------------------------------------------------------
-- 3. Outcome definitions: side effects + nullable campaign
-- -------------------------------------------------------
ALTER TABLE call_outcome_definitions
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE call_outcome_definitions
  ADD COLUMN IF NOT EXISTS side_effect VARCHAR(40) NOT NULL DEFAULT 'none'
    CHECK (side_effect IN ('none', 'set_membership_financial')),
  ADD COLUMN IF NOT EXISTS side_effect_payload JSONB DEFAULT NULL;

COMMENT ON COLUMN call_outcome_definitions.side_effect IS
  'Domain effect when this outcome is positively recorded (e.g. set_membership_financial updates workers.union_membership_type_id).';
COMMENT ON COLUMN call_outcome_definitions.side_effect_payload IS
  'Optional JSON e.g. {"select_truthy_values":["joined","yes"]} for membership side effect.';

-- RLS: standalone scripts (campaign_id IS NULL) owned by creator
DROP POLICY IF EXISTS "Campaign writers can insert call_outcome_definitions" ON call_outcome_definitions;
CREATE POLICY "Writers can insert call_outcome_definitions"
  ON call_outcome_definitions FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
    OR (
      campaign_id IS NULL
      AND script_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM call_scripts cs
        WHERE cs.script_id = call_outcome_definitions.script_id
          AND cs.campaign_id IS NULL
          AND cs.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Campaign writers can update call_outcome_definitions" ON call_outcome_definitions;
CREATE POLICY "Writers can update call_outcome_definitions"
  ON call_outcome_definitions FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
    OR (
      campaign_id IS NULL
      AND script_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM call_scripts cs
        WHERE cs.script_id = call_outcome_definitions.script_id
          AND cs.campaign_id IS NULL
          AND cs.created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
    OR (
      campaign_id IS NULL
      AND script_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM call_scripts cs
        WHERE cs.script_id = call_outcome_definitions.script_id
          AND cs.campaign_id IS NULL
          AND cs.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admin can delete call_outcome_definitions" ON call_outcome_definitions;
CREATE POLICY "Writers can delete call_outcome_definitions"
  ON call_outcome_definitions FOR DELETE TO authenticated
  USING (
    get_user_role() = 'admin'
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
    OR (
      campaign_id IS NULL
      AND script_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM call_scripts cs
        WHERE cs.script_id = call_outcome_definitions.script_id
          AND cs.campaign_id IS NULL
          AND cs.created_by = auth.uid()
      )
    )
  );

-- -------------------------------------------------------
-- 4. Ambition progress events (phone-driven and extensible)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambition_progress_events (
  event_id BIGSERIAL PRIMARY KEY,
  ambition_id INTEGER NOT NULL REFERENCES plan_ambitions(ambition_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL DEFAULT 'phone_call',
  attempt_id INTEGER REFERENCES call_attempts(attempt_id) ON DELETE SET NULL,
  outcome_id INTEGER REFERENCES call_outcome_definitions(outcome_id) ON DELETE SET NULL,
  delta_numeric NUMERIC NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, outcome_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_ape_ambition ON ambition_progress_events(ambition_id);
CREATE INDEX IF NOT EXISTS idx_ape_campaign ON ambition_progress_events(campaign_id);

ALTER TABLE ambition_progress_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ambition_progress_events"
  ON ambition_progress_events FOR SELECT TO authenticated USING (true);

GRANT SELECT ON ambition_progress_events TO authenticated;
-- Inserts only via SECURITY DEFINER apply_call_outcome_side_effects / migrations role
GRANT USAGE, SELECT ON SEQUENCE ambition_progress_events_event_id_seq TO authenticated;

-- Stub aggregate for reporting
CREATE OR REPLACE VIEW ambition_progress_phone_calls AS
SELECT
  ambition_id,
  campaign_id,
  COUNT(*)::bigint AS event_count,
  COUNT(DISTINCT worker_id)::bigint AS unique_workers
FROM ambition_progress_events
WHERE source = 'phone_call'
GROUP BY ambition_id, campaign_id;

GRANT SELECT ON ambition_progress_phone_calls TO authenticated;

-- -------------------------------------------------------
-- 5. apply_call_outcome_side_effects (SECURITY DEFINER)
-- -------------------------------------------------------
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

  SELECT union_membership_type_id INTO v_financial_id
  FROM union_membership_types
  WHERE type_name = 'financial_member'
  LIMIT 1;

  IF v_financial_id IS NULL THEN
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
      AND cod.side_effect = 'set_membership_financial'
  LOOP
    v_apply := false;
    IF v_row.response_type = 'checkbox' THEN
      v_apply := true;
    ELSIF v_row.response_type = 'select' THEN
      v_val := lower(trim(coalesce(v_row.response_value, '')));
      v_truthy := ARRAY['joined', 'yes', 'financial_member', 'member'];
      IF v_row.side_effect_payload IS NOT NULL
         AND jsonb_typeof(v_row.side_effect_payload->'select_truthy_values') = 'array' THEN
        SELECT array_agg(lower(t.v))
        INTO v_truthy
        FROM jsonb_array_elements_text(v_row.side_effect_payload->'select_truthy_values') AS t(v);
        IF v_truthy IS NULL THEN
          v_truthy := ARRAY['joined', 'yes', 'financial_member', 'member'];
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
      union_membership_type_id = v_financial_id,
      join_date = COALESCE(w.join_date, CURRENT_DATE),
      updated_at = now()
    WHERE w.worker_id = p_worker_id
      AND (w.union_membership_type_id IS DISTINCT FROM v_financial_id);
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
      jsonb_build_object('side_effect', 'set_membership_financial')
    )
    ON CONFLICT (attempt_id, outcome_id, worker_id) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_call_outcome_side_effects TO authenticated;

-- -------------------------------------------------------
-- 6. record_call_attempt: resolved script for activity + side effects
-- -------------------------------------------------------
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

  -- 2b. Process outcome entries (new JSONB format with response_value)
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

  -- 2c. Legacy: process p_outcome_ids (backward compat with old INTEGER[] format)
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

  -- 2d. Derive composite rating and write to assessment system
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

      INSERT INTO campaign_activity_ratings (activity_id, worker_id, rating, source, rated_at)
      VALUES (v_activity_id, v_worker_id, v_rating, 'staff', now())
      ON CONFLICT (activity_id, worker_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        rated_at = EXCLUDED.rated_at;
    END IF;
  END IF;

  -- 2e. Membership / ambition side effects (campaign lists only inside function)
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

GRANT EXECUTE ON FUNCTION resolve_outcomes_script_id TO authenticated;
