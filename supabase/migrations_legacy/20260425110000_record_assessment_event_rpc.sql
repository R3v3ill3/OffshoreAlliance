-- ============================================================
-- Migration: record_assessment_event() shared RPC + triggers
--
-- Single entry point for every activity source (SMS, email,
-- petition, meeting, staff, leader form, task-take, call outcome)
-- to upsert a campaign_activity_rating. Centralising the write
-- makes conflict resolution (Phase 5) and audit logging much
-- simpler, because every rating goes through one function.
--
-- Triggers on the Phase 3 capture tables translate domain events
-- (signed a petition, replied 'yes' to SMS, attended a meeting)
-- into a rating via this RPC.
-- ============================================================

-- -----------------------------------------------------------
-- 1. record_assessment_event — single upsert entry point
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION record_assessment_event(
  p_activity_id INT,
  p_worker_id INT,
  p_rating INT DEFAULT NULL,
  p_binary_value VARCHAR DEFAULT NULL,
  p_rating_phase VARCHAR DEFAULT 'actual',
  p_event_id INT DEFAULT NULL,
  p_source VARCHAR DEFAULT 'staff',
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_rating_id INT;
BEGIN
  IF p_rating IS NULL AND p_binary_value IS NULL THEN
    RAISE EXCEPTION
      'record_assessment_event: at least one of p_rating or p_binary_value must be non-null';
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating must be 1..5 (got %)', p_rating;
  END IF;

  IF p_rating_phase NOT IN ('expected', 'actual') THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating_phase must be expected or actual (got %)', p_rating_phase;
  END IF;

  INSERT INTO campaign_activity_ratings (
    activity_id, worker_id, rating, binary_value, notes,
    source, rated_at, rated_by_user_id, rating_phase, event_id
  )
  VALUES (
    p_activity_id, p_worker_id, p_rating, p_binary_value, p_notes,
    p_source, now(), p_actor_id, p_rating_phase, p_event_id
  )
  ON CONFLICT (activity_id, worker_id, rating_phase, event_id) DO UPDATE SET
    rating = COALESCE(EXCLUDED.rating, campaign_activity_ratings.rating),
    binary_value = COALESCE(EXCLUDED.binary_value, campaign_activity_ratings.binary_value),
    notes = COALESCE(EXCLUDED.notes, campaign_activity_ratings.notes),
    source = EXCLUDED.source,
    rated_at = EXCLUDED.rated_at,
    rated_by_user_id = COALESCE(EXCLUDED.rated_by_user_id, campaign_activity_ratings.rated_by_user_id)
  RETURNING rating_id INTO v_rating_id;

  RETURN v_rating_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_assessment_event TO authenticated;

COMMENT ON FUNCTION record_assessment_event IS
  'Single upsert entry point for campaign_activity_ratings. Validates '
  'rating range and phase; returns the rating_id. Other sources (SMS, '
  'email, petition, meeting, staff UI) should funnel through this.';

-- -----------------------------------------------------------
-- 2. sms_interactions -> rating trigger
--    Fires only when the row implies an assessable response:
--    direction='inbound' AND (maps_to_rating OR maps_to_binary
--    OR cta_response) AND activity_id IS NOT NULL.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sms_to_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_rating INT;
  v_binary VARCHAR;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_rating := NEW.maps_to_rating;
  v_binary := NEW.maps_to_binary;

  -- Derive from cta_response if the caller didn't specify
  IF v_rating IS NULL AND v_binary IS NULL AND NEW.cta_response IS NOT NULL THEN
    v_binary := NEW.cta_response;
  END IF;

  IF v_rating IS NULL AND v_binary IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM record_assessment_event(
    p_activity_id := NEW.activity_id,
    p_worker_id := NEW.worker_id,
    p_rating := v_rating,
    p_binary_value := v_binary,
    p_rating_phase := 'actual',
    p_event_id := NULL,
    p_source := 'sms',
    p_notes := NEW.notes,
    p_actor_id := NEW.created_by
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sms_to_rating ON sms_interactions;
CREATE TRIGGER trg_sms_to_rating
  AFTER INSERT ON sms_interactions
  FOR EACH ROW EXECUTE FUNCTION fn_sms_to_rating();

-- -----------------------------------------------------------
-- 3. email_cta_responses -> rating trigger
--    Only 'clicked', 'replied', 'form_submitted' are treated
--    as assessable events. Opens / bounces / unsubscribes
--    don't produce ratings.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_email_cta_to_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_rating INT;
  v_binary VARCHAR;
BEGIN
  IF NEW.activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email_event NOT IN ('clicked', 'replied', 'form_submitted') THEN
    RETURN NEW;
  END IF;

  v_rating := NEW.maps_to_rating;
  v_binary := NEW.maps_to_binary;

  IF v_rating IS NULL AND v_binary IS NULL AND NEW.cta_response IS NOT NULL THEN
    v_binary := NEW.cta_response;
  END IF;

  IF v_rating IS NULL AND v_binary IS NULL THEN
    -- A click / reply without further signal implies supporter
    v_rating := 2;
  END IF;

  PERFORM record_assessment_event(
    p_activity_id := NEW.activity_id,
    p_worker_id := NEW.worker_id,
    p_rating := v_rating,
    p_binary_value := v_binary,
    p_rating_phase := 'actual',
    p_event_id := NULL,
    p_source := 'email',
    p_notes := NEW.notes,
    p_actor_id := NEW.created_by
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_email_cta_to_rating ON email_cta_responses;
CREATE TRIGGER trg_email_cta_to_rating
  AFTER INSERT ON email_cta_responses
  FOR EACH ROW EXECUTE FUNCTION fn_email_cta_to_rating();

-- -----------------------------------------------------------
-- 4. petition_signatures -> rating trigger
--    A signature = supporter (rating 2) by default.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_petition_to_rating()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM record_assessment_event(
    p_activity_id := NEW.activity_id,
    p_worker_id := NEW.worker_id,
    p_rating := 2,
    p_binary_value := 'signed',
    p_rating_phase := 'actual',
    p_event_id := NULL,
    p_source := 'petition',
    p_notes := NEW.notes,
    p_actor_id := NEW.created_by
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_petition_to_rating ON petition_signatures;
CREATE TRIGGER trg_petition_to_rating
  AFTER INSERT ON petition_signatures
  FOR EACH ROW EXECUTE FUNCTION fn_petition_to_rating();

-- -----------------------------------------------------------
-- 5. meeting_attendance -> rating trigger
--    Maps status to rating_phase + binary_value:
--      attending / not_attending  => phase=expected
--      attended / did_not_attend / abstain / unknown => phase=actual
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_meeting_attendance_to_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_activity_id INT;
  v_phase VARCHAR(10);
BEGIN
  SELECT activity_id INTO v_activity_id
  FROM activity_events
  WHERE event_id = NEW.event_id;

  IF v_activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_phase := CASE
    WHEN NEW.status IN ('attending', 'not_attending') THEN 'expected'
    ELSE 'actual'
  END;

  PERFORM record_assessment_event(
    p_activity_id := v_activity_id,
    p_worker_id := NEW.worker_id,
    p_rating := NULL,
    p_binary_value := NEW.status,
    p_rating_phase := v_phase,
    p_event_id := NEW.event_id,
    p_source := 'meeting',
    p_notes := NEW.notes,
    p_actor_id := NEW.created_by
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meeting_attendance_to_rating ON meeting_attendance;
CREATE TRIGGER trg_meeting_attendance_to_rating
  AFTER INSERT OR UPDATE OF status ON meeting_attendance
  FOR EACH ROW EXECUTE FUNCTION fn_meeting_attendance_to_rating();
