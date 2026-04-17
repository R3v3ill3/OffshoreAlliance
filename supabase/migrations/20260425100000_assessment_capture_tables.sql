-- ============================================================
-- Migration: Assessment capture tables
--
-- Schemas for the activity sources that were referenced by
-- activity templates but had no capture schema: SMS responses,
-- email CTA responses, petition signatures, meeting attendance.
--
-- Each table is the canonical record of that interaction. A
-- trigger (installed by migration 20260425110000) derives a
-- rating (numeric 1..5 and/or binary value) and calls the
-- shared record_assessment_event() RPC to upsert a row in
-- campaign_activity_ratings. The capture table itself remains
-- the audit trail of WHEN and WHAT; campaign_activity_ratings
-- is the source of truth for "what rating does worker X hold".
-- ============================================================

-- -----------------------------------------------------------
-- 1. sms_interactions
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_interactions (
  id SERIAL PRIMARY KEY,
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number VARCHAR(30),
  body TEXT,
  cta_response VARCHAR(30),
  maps_to_rating INT CHECK (maps_to_rating IS NULL OR (maps_to_rating BETWEEN 1 AND 5)),
  maps_to_binary VARCHAR(30),
  external_message_id VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_sms_interactions_worker ON sms_interactions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sms_interactions_activity ON sms_interactions(activity_id)
  WHERE activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_interactions_campaign ON sms_interactions(campaign_id)
  WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE sms_interactions IS
  'SMS messages sent to / received from workers. When the activity is '
  'assessable and direction=inbound / cta_response is present, a trigger '
  'upserts a campaign_activity_rating via record_assessment_event().';

-- -----------------------------------------------------------
-- 2. email_cta_responses
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_cta_responses (
  id SERIAL PRIMARY KEY,
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  email_event VARCHAR(30) NOT NULL
    CHECK (email_event IN ('opened', 'clicked', 'replied', 'unsubscribed', 'form_submitted', 'bounced')),
  cta_response VARCHAR(30),
  maps_to_rating INT CHECK (maps_to_rating IS NULL OR (maps_to_rating BETWEEN 1 AND 5)),
  maps_to_binary VARCHAR(30),
  external_event_id VARCHAR(100),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_email_cta_responses_worker ON email_cta_responses(worker_id);
CREATE INDEX IF NOT EXISTS idx_email_cta_responses_activity ON email_cta_responses(activity_id)
  WHERE activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_cta_responses_campaign ON email_cta_responses(campaign_id)
  WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE email_cta_responses IS
  'Email engagement events (opens, clicks, replies, form submissions). '
  'Triggers rating upsert for assessable events (clicked / form_submitted '
  'with a cta_response).';

-- -----------------------------------------------------------
-- 3. petition_signatures
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS petition_signatures (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(20) NOT NULL DEFAULT 'online'
    CHECK (source IN ('online', 'physical', 'imported')),
  signature_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (activity_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_petition_signatures_worker ON petition_signatures(worker_id);
CREATE INDEX IF NOT EXISTS idx_petition_signatures_activity ON petition_signatures(activity_id);

COMMENT ON TABLE petition_signatures IS
  'Physical / online petition signatures. One row per (activity, worker). '
  'A signature implies supporter (rating 2) by default; the mapping can '
  'be overridden at the activity level in a later phase.';

-- -----------------------------------------------------------
-- 4. meeting_attendance
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_attendance (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES activity_events(event_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL
    CHECK (status IN (
      'attending',         -- pre-event RSVP: will attend
      'not_attending',     -- pre-event RSVP: will not
      'attended',          -- post-event: attended
      'did_not_attend',    -- post-event: did not
      'abstain',
      'unknown'
    )),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (event_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_worker ON meeting_attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_event ON meeting_attendance(event_id);

COMMENT ON TABLE meeting_attendance IS
  'Attendance for a specific activity_event. Pre-event statuses '
  '(attending / not_attending) map to phase=expected; post-event statuses '
  '(attended / did_not_attend) map to phase=actual.';

-- -----------------------------------------------------------
-- 5. RLS — authenticated read, campaign writers insert/update/delete
-- -----------------------------------------------------------
ALTER TABLE sms_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cta_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE petition_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;

-- sms_interactions: permission scoped via activity's campaign
--   OR directly via campaign_id when standalone (inbound with no activity yet).
CREATE POLICY "Authenticated read sms_interactions"
  ON sms_interactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can insert sms_interactions"
  ON sms_interactions FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR (activity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = sms_interactions.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    ))
    OR is_admin()
  );

CREATE POLICY "Writers can update sms_interactions"
  ON sms_interactions FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  )
  WITH CHECK (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  );

CREATE POLICY "Writers can delete sms_interactions"
  ON sms_interactions FOR DELETE TO authenticated
  USING (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  );

-- email_cta_responses
CREATE POLICY "Authenticated read email_cta_responses"
  ON email_cta_responses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can insert email_cta_responses"
  ON email_cta_responses FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR (activity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = email_cta_responses.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    ))
    OR is_admin()
  );

CREATE POLICY "Writers can update email_cta_responses"
  ON email_cta_responses FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  )
  WITH CHECK (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  );

CREATE POLICY "Writers can delete email_cta_responses"
  ON email_cta_responses FOR DELETE TO authenticated
  USING (
    (campaign_id IS NOT NULL AND (can_write_to_campaign(campaign_id) OR is_admin()))
    OR is_admin()
  );

-- petition_signatures — activity_id always present, use it for scoping
CREATE POLICY "Authenticated read petition_signatures"
  ON petition_signatures FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can insert petition_signatures"
  ON petition_signatures FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = petition_signatures.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Writers can update petition_signatures"
  ON petition_signatures FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = petition_signatures.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = petition_signatures.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Writers can delete petition_signatures"
  ON petition_signatures FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = petition_signatures.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

-- meeting_attendance — scope via activity_events → campaign_activities
CREATE POLICY "Authenticated read meeting_attendance"
  ON meeting_attendance FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can insert meeting_attendance"
  ON meeting_attendance FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_events e
      JOIN campaign_activities a ON a.activity_id = e.activity_id
      WHERE e.event_id = meeting_attendance.event_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Writers can update meeting_attendance"
  ON meeting_attendance FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM activity_events e
      JOIN campaign_activities a ON a.activity_id = e.activity_id
      WHERE e.event_id = meeting_attendance.event_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_events e
      JOIN campaign_activities a ON a.activity_id = e.activity_id
      WHERE e.event_id = meeting_attendance.event_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Writers can delete meeting_attendance"
  ON meeting_attendance FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM activity_events e
      JOIN campaign_activities a ON a.activity_id = e.activity_id
      WHERE e.event_id = meeting_attendance.event_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

GRANT SELECT ON sms_interactions, email_cta_responses, petition_signatures, meeting_attendance TO authenticated;
