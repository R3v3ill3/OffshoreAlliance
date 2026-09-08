-- SMS testing roster — who a test-mode survey is allowed to reach.
--
-- `sms_surveys.is_test` existed but changed nothing except a badge and
-- eligibility for `promote`: a survey flagged "Test" could still be
-- opened against the entire campaign. This gives test mode a real
-- audience of its own, so the default-on Test switch means what an
-- organiser assumes it means.
--
-- Scope, per decision: an org-wide base roster (campaign_id IS NULL)
-- that every campaign inherits, plus per-campaign additions for people
-- who should test one campaign only.
--
-- Recipients are workers, not bare phone numbers, because
-- sms_survey_sessions.worker_id is NOT NULL REFERENCES workers — a
-- session cannot exist without one. Staff who test therefore need a
-- worker record; the audience picker's "Add person" creates one.

CREATE TABLE IF NOT EXISTS sms_test_recipients (
  test_recipient_id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  -- NULL = org-wide, inherited by every campaign's test sends.
  campaign_id INTEGER REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE sms_test_recipients IS
  'Workers a test-mode SMS survey may be sent to. campaign_id NULL is '
  'the org-wide roster inherited everywhere; a campaign_id scopes a '
  'tester to that campaign only. Test sends resolve to the union of '
  'both, never to the campaign workforce.';

COMMENT ON COLUMN sms_test_recipients.campaign_id IS
  'NULL = org-wide roster. Otherwise the only campaign this tester is '
  'added to.';

-- One row per worker per scope. COALESCE keeps the org-wide rows
-- (campaign_id NULL) unique too, which a plain UNIQUE would not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_test_recipients_scope
  ON sms_test_recipients (worker_id, COALESCE(campaign_id, 0));

CREATE INDEX IF NOT EXISTS idx_sms_test_recipients_campaign
  ON sms_test_recipients (campaign_id);

ALTER TABLE sms_test_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Readable by all staff: the roster is operational config, and the
  -- survey editor shows the count before an organiser opens a test.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_test_recipients"
    ON sms_test_recipients FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- Writes: campaign-scoped rows follow the campaign gate; org-wide
  -- rows are available to any authenticated staff member, matching how
  -- other org-level SMS config (numbers, canned replies) is managed.
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_test_recipients"
    ON sms_test_recipients FOR INSERT TO authenticated
    WITH CHECK (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_test_recipients"
    ON sms_test_recipients FOR DELETE TO authenticated
    USING (campaign_id IS NULL OR can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
