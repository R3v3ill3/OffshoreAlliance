-- ============================================================
-- Phase 5 (Wave 3 Agent F): PABO Ballot Questions
--
-- One row per question on the protected action ballot.
-- Question order is enforced unique per application.
-- Vote counts and outcome are filled in after the ballot closes.
-- ============================================================

CREATE TABLE pabo_ballot_questions (
  question_id    SERIAL PRIMARY KEY,
  pabo_id        INT NOT NULL REFERENCES pabo_applications(pabo_id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  question_text  TEXT NOT NULL,

  -- Optional descriptor for the type of action the question authorises
  action_type    TEXT,

  -- Post-ballot vote counts
  votes_yes      INT,
  votes_no       INT,
  informal_count INT,

  -- Question outcome (set once counts are confirmed)
  outcome TEXT CHECK (outcome IN ('carried', 'failed', 'pending', 'withdrawn')),

  UNIQUE (pabo_id, question_order)
);

CREATE INDEX IF NOT EXISTS idx_pabo_ballot_questions_pabo
  ON pabo_ballot_questions(pabo_id);

COMMENT ON TABLE pabo_ballot_questions IS
  'Individual questions on a PABO ballot. Vote counts and outcome are '
  'populated once the AEC returns results. outcome=''carried'' when votes_yes > votes_no.';

COMMENT ON COLUMN pabo_ballot_questions.question_order IS
  'Display / legal ordering of questions within the ballot. Unique per pabo_id.';

COMMENT ON COLUMN pabo_ballot_questions.action_type IS
  'Free-text descriptor for the industrial action type (e.g. "stop-work", "work bans", "overtime ban").';

-- ============================================================
-- RLS — authenticated read; admin/user insert/update; admin delete.
-- ============================================================

ALTER TABLE pabo_ballot_questions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read pabo_ballot_questions"
      ON pabo_ballot_questions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert pabo_ballot_questions"
      ON pabo_ballot_questions FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update pabo_ballot_questions"
      ON pabo_ballot_questions FOR UPDATE TO authenticated
      USING (get_user_role() IN (''admin'',''user''))
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete pabo_ballot_questions"
      ON pabo_ballot_questions FOR DELETE TO authenticated
      USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
