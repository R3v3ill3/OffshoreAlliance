-- ============================================================
-- Phase 5 (Wave 3 Agent F): PABO Applications
--
-- Models FWC s443 applications (Protected Action Ballot Order).
-- One application per campaign per relevant bargaining period;
-- a superseded or expired application is preserved for audit.
-- ============================================================

CREATE TABLE pabo_applications (
  pabo_id          SERIAL PRIMARY KEY,
  campaign_id      INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,

  -- FWC application details
  application_filed_at    DATE,
  fwc_application_number  TEXT,
  ballot_order_made_at    DATE,

  -- AEC ballot administration
  aec_ballot_agent    TEXT,
  ballot_opens_at     TIMESTAMPTZ,
  ballot_closes_at    TIMESTAMPTZ,

  -- Voter counts & computed turnout
  eligible_voter_count  INT,
  votes_cast            INT,
  voter_turnout_pct     NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN eligible_voter_count > 0 AND votes_cast IS NOT NULL
      THEN ROUND((votes_cast::NUMERIC / eligible_voter_count) * 100, 2)
      ELSE NULL
    END
  ) STORED,

  -- Validity window
  valid_from                   DATE,
  valid_until                  DATE,
  notice_period_required_days  INT DEFAULT 3,

  -- Lifecycle status
  status TEXT CHECK (status IN (
    'drafting',
    'lodged',
    'granted',
    'denied',
    'expired',
    'superseded',
    'withdrawn'
  )),
  notes TEXT,

  -- Audit
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pabo_applications_campaign
  ON pabo_applications(campaign_id);

CREATE INDEX IF NOT EXISTS idx_pabo_applications_status
  ON pabo_applications(status)
  WHERE status IS NOT NULL;

-- updated_at trigger — uses the existing update_updated_at() function
CREATE OR REPLACE TRIGGER trg_pabo_applications_updated_at
  BEFORE UPDATE ON pabo_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE pabo_applications IS
  'FWC s443 Protected Action Ballot Order applications. One row per '
  'application filing; superseded/expired rows are kept for audit history. '
  'voter_turnout_pct is auto-computed from eligible_voter_count / votes_cast.';

COMMENT ON COLUMN pabo_applications.voter_turnout_pct IS
  'Generated column: (votes_cast / eligible_voter_count) * 100, rounded to 2dp. NULL when either input is NULL or eligible_voter_count = 0.';

COMMENT ON COLUMN pabo_applications.notice_period_required_days IS
  'Minimum notice days required before industrial action can commence under the ballot order. Defaults to 3.';

-- ============================================================
-- RLS — mirroring campaign_situation_analyses pattern:
--   read: all authenticated users
--   insert/update: admin or user role
--   delete: admin only
-- ============================================================

ALTER TABLE pabo_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read pabo_applications"
      ON pabo_applications FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert pabo_applications"
      ON pabo_applications FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update pabo_applications"
      ON pabo_applications FOR UPDATE TO authenticated
      USING (get_user_role() IN (''admin'',''user''))
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete pabo_applications"
      ON pabo_applications FOR DELETE TO authenticated
      USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
