-- ============================================================
-- Phase D — Outcome model
-- D1. Add overall call outcome classification to call_attempts
-- D2. Extend campaign_activity_ratings.source taxonomy
-- D4. Generic membership-pending RPC + audit table
-- D5. Flag join CTAs on call_script_cta_ambitions
-- D6. Snapshot call_attempt_outcomes (legacy outcome path)
-- ============================================================

-- ============================================================
-- D1. outcome_classification column on call_attempts
-- ============================================================

ALTER TABLE call_attempts
  ADD COLUMN IF NOT EXISTS outcome_classification VARCHAR(40)
  CHECK (outcome_classification IS NULL OR outcome_classification IN (
    'agreed_to_join',
    'interested_undecided',
    'interested_callback',
    'not_interested',
    'declined_explicitly',
    'wrong_number',
    'do_not_call',
    'unable_to_reach',
    'callback_later',
    'voicemail_left',
    'referred_to_other_org',
    'existing_member_supportive',
    'existing_member_neutral',
    'other'
  ));

COMMENT ON COLUMN call_attempts.outcome_classification IS
  'Canonical per-call outcome classification. Replaces legacy call_attempt_outcomes/apply_call_outcome_side_effects path. Single-select from fixed taxonomy.';

CREATE INDEX IF NOT EXISTS idx_call_attempts_outcome_classification
  ON call_attempts (outcome_classification)
  WHERE outcome_classification IS NOT NULL;

-- ============================================================
-- D2. Extend campaign_activity_ratings.source CHECK constraint
--     to include phone-specific and channel-agnostic provenance values.
--     Existing 'call_outcome' rows are migrated to 'phone_call_live'.
-- ============================================================

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS campaign_activity_ratings_source_check;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT campaign_activity_ratings_source_check
  CHECK (source IN (
    -- Legacy (kept for backward compat; new rows should use phone_call_live)
    'call_outcome',
    -- Phone-specific channels
    'phone_call_live',
    'phone_call_share_link',
    -- Other channels (for future use by non-phone paths)
    'door_knock',
    'task_assignment',
    'task_completion',
    -- Pre-existing non-phone sources
    'staff',
    'leader_form',
    'task_take',
    'sms',
    'email',
    'petition',
    'meeting'
  ));

COMMENT ON COLUMN campaign_activity_ratings.source IS
  'Channel that produced this rating. phone_call_live = staff-dialled call, phone_call_share_link = leader-dialled via share link. Deprecated: call_outcome (migrate to phone_call_live).';

-- Migrate existing call_outcome rows to phone_call_live
UPDATE campaign_activity_ratings
  SET source = 'phone_call_live'
  WHERE source = 'call_outcome';

-- ============================================================
-- D4a. Audit table for worker membership transitions
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_membership_transitions (
  transition_id    BIGSERIAL PRIMARY KEY,
  worker_id        INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  from_type_id     INTEGER REFERENCES union_membership_types(union_membership_type_id),
  to_type_id       INTEGER REFERENCES union_membership_types(union_membership_type_id),
  source           TEXT NOT NULL,
  actor_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context          JSONB NOT NULL DEFAULT '{}',
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE worker_membership_transitions IS
  'Immutable audit log of every union membership type change, regardless of channel.';

CREATE INDEX IF NOT EXISTS idx_wmt_worker ON worker_membership_transitions(worker_id);
CREATE INDEX IF NOT EXISTS idx_wmt_occurred ON worker_membership_transitions(occurred_at DESC);

ALTER TABLE worker_membership_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read worker_membership_transitions"
  ON worker_membership_transitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role insert worker_membership_transitions"
  ON worker_membership_transitions FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- D4b. Generic set_worker_union_membership_pending RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_worker_union_membership_pending(
  p_worker_id   INTEGER,
  p_source      TEXT,
  p_actor_id    UUID    DEFAULT NULL,
  p_context     JSONB   DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pending_type_id    INTEGER;
  v_financial_type_id  INTEGER;
  v_current_type_id    INTEGER;
  v_campaign_id        INTEGER;
BEGIN
  -- Resolve canonical type IDs
  SELECT union_membership_type_id INTO v_pending_type_id
    FROM union_membership_types WHERE type_name = 'member_pending' LIMIT 1;

  SELECT union_membership_type_id INTO v_financial_type_id
    FROM union_membership_types WHERE type_name = 'financial_member' LIMIT 1;

  -- Get current worker membership type
  SELECT union_membership_type_id INTO v_current_type_id
    FROM workers WHERE worker_id = p_worker_id;

  -- Idempotency: no-op if already financial or already pending
  IF v_current_type_id = v_financial_type_id THEN
    RETURN jsonb_build_object('status', 'already_financial', 'worker_id', p_worker_id);
  END IF;

  IF v_current_type_id = v_pending_type_id THEN
    RETURN jsonb_build_object('status', 'already_pending', 'worker_id', p_worker_id);
  END IF;

  -- Transition worker to member_pending
  UPDATE workers
    SET union_membership_type_id = v_pending_type_id,
        join_date                = COALESCE(join_date, CURRENT_DATE),
        updated_at               = NOW()
    WHERE worker_id = p_worker_id;

  -- Write audit row
  INSERT INTO worker_membership_transitions
    (worker_id, from_type_id, to_type_id, source, actor_id, context, occurred_at)
  VALUES
    (p_worker_id, v_current_type_id, v_pending_type_id, p_source, p_actor_id, p_context, NOW());

  -- Stamp joined_at on campaign connection if campaign_id supplied in context
  v_campaign_id := (p_context->>'campaign_id')::INTEGER;
  IF v_campaign_id IS NOT NULL THEN
    UPDATE worker_campaign_connections
      SET joined_at = COALESCE(joined_at, NOW())
      WHERE worker_id = p_worker_id AND campaign_id = v_campaign_id;
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'worker_id', p_worker_id);
END;
$$;

COMMENT ON FUNCTION public.set_worker_union_membership_pending IS
  'Channel-agnostic RPC: transitions a worker to member_pending if not already at that level or higher. Idempotent. Writes audit row to worker_membership_transitions.';

-- ============================================================
-- D5. Flag join CTAs on call_script_cta_ambitions
--     When is_join_cta = TRUE, record_call_attempt should call
--     set_worker_union_membership_pending when this CTA is positively rated.
-- ============================================================

ALTER TABLE call_script_cta_ambitions
  ADD COLUMN IF NOT EXISTS is_join_cta BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN call_script_cta_ambitions.is_join_cta IS
  'When TRUE, a positive rating on this CTA during record_call_attempt will trigger set_worker_union_membership_pending for the worker.';

-- Back-fill from translate-ambitions side_effect convention:
-- (no automatic data to migrate here; new rows will be flagged by the wizard)

-- ============================================================
-- D6. Snapshot legacy call_attempt_outcomes (safety copy)
--     The table is retained; only archived here as a safety snapshot.
--     Actual deprecation (DROP TABLE + function) deferred to Phase J.
-- ============================================================

CREATE TABLE IF NOT EXISTS _archive_call_attempt_outcomes_20260613
  AS SELECT * FROM call_attempt_outcomes;

COMMENT ON TABLE _archive_call_attempt_outcomes_20260613 IS
  'Point-in-time snapshot of call_attempt_outcomes taken before Phase D rolled out outcome_classification. Safe to DROP after Phase J validation.';
