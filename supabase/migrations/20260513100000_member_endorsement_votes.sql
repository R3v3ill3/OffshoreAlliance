-- ============================================================
-- Phase 4 (Wave 4): Member endorsement votes
--
-- Ballot machinery for employer-launched proposals (Stage 8)
-- and final ratification (Stage 11).
--
-- vote_kind:
--   'employer_proposal'  — employer-launched s.181 vote (Stage 8)
--   'union_in_principle' — union-initiated in-principle approval
--   'final_eba'          — final ratification ballot (Stage 11)
-- ============================================================

CREATE TABLE member_endorsement_votes (
  vote_id               SERIAL PRIMARY KEY,
  campaign_id           INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  vote_kind             TEXT NOT NULL
                          CHECK (vote_kind IN ('employer_proposal','union_in_principle','final_eba')),
  proposal_label        TEXT,
  proposal_version      INT NOT NULL DEFAULT 1,
  proposal_document_url TEXT,
  vote_method           TEXT
                          CHECK (vote_method IN ('postal','online','workplace','hybrid','employer_run','union_run')),
  eligibility_definition JSONB,
  eligible_count        INT,
  vote_opens_at         TIMESTAMPTZ,
  vote_closes_at        TIMESTAMPTZ,
  votes_yes             INT,
  votes_no              INT,
  votes_abstain         INT,
  informal_count        INT,
  outcome               TEXT
                          CHECK (outcome IN ('yes','no','pending','withdrawn')),
  fwc_notification_sent_at TIMESTAMPTZ,
  fwc_application_number   TEXT,
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mev_campaign ON member_endorsement_votes(campaign_id);
CREATE INDEX idx_mev_vote_kind ON member_endorsement_votes(vote_kind);
CREATE INDEX idx_mev_outcome ON member_endorsement_votes(outcome);

CREATE OR REPLACE TRIGGER trg_mev_updated_at
  BEFORE UPDATE ON member_endorsement_votes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE member_endorsement_votes IS
  'Ballot records for employer-proposal votes (Stage 8) and final EBA ratification (Stage 11). '
  'One row per vote event; vote_kind distinguishes employer_proposal / union_in_principle / final_eba.';

COMMENT ON COLUMN member_endorsement_votes.vote_kind IS
  'employer_proposal = employer-launched s.181 vote; union_in_principle = union-initiated approval; final_eba = Stage 11 ratification ballot.';

COMMENT ON COLUMN member_endorsement_votes.eligibility_definition IS
  'JSONB descriptor for who was eligible to vote, e.g. {description, date_of_eligibility, excluded_classes}.';

COMMENT ON COLUMN member_endorsement_votes.fwc_application_number IS
  'Fair Work Commission application number for any FWC notification or approval application.';

-- ============================================================
-- RLS — same pattern as campaign_situation_analyses:
--   authenticated read all; admin+user insert+update; admin delete.
-- ============================================================

ALTER TABLE member_endorsement_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read member_endorsement_votes" ON member_endorsement_votes FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert member_endorsement_votes" ON member_endorsement_votes FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update member_endorsement_votes" ON member_endorsement_votes FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete member_endorsement_votes" ON member_endorsement_votes FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
