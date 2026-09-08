-- ============================================================
-- Phase 7 (Wave 5): campaign_ambition_revisions
--
-- Immutable append-only log of changes to campaign ambitions,
-- mirroring the plan_revision_notes pattern (no UPDATE/DELETE
-- policies). Each row captures what changed, why, and what
-- triggered the review.
--
-- triggered_by_event_type discriminates the source:
--   log_of_claims_yes          — log_of_claims vote outcome=yes
--   employer_proposal_no       — employer_proposal vote outcome=no
--   woc_counter_offer_endorsed — WOC meeting decision=counter_offer_endorsed
--
-- reviewed_without_change=true means the organiser reviewed
-- the ambition and decided no update was needed; new_value
-- and previous_value are identical in that case.
-- ============================================================

CREATE TABLE campaign_ambition_revisions (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ambition_id             INT NOT NULL
                            REFERENCES campaign_ambitions(campaign_ambition_id) ON DELETE CASCADE,
  previous_value          JSONB,
  new_value               JSONB,
  reason                  TEXT,
  triggered_by_event_id   INT REFERENCES activity_events(event_id),
  triggered_by_vote_id    INT REFERENCES member_endorsement_votes(vote_id),
  triggered_by_event_type TEXT
                            CHECK (triggered_by_event_type IN (
                              'log_of_claims_yes',
                              'employer_proposal_no',
                              'woc_counter_offer_endorsed'
                            )),
  reviewed_without_change BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_car_ambition ON campaign_ambition_revisions(ambition_id);
CREATE INDEX idx_car_created_at ON campaign_ambition_revisions(created_at DESC);

COMMENT ON TABLE campaign_ambition_revisions IS
  'Phase 7: immutable append-only revision log for campaign ambitions. '
  'Written when an organiser reviews a flagged industrial_outcomes ambition '
  'after a triggering event (log of claims yes, employer proposal no, '
  'WOC counter-offer endorsement). Mirrors plan_revision_notes append-only pattern.';

COMMENT ON COLUMN campaign_ambition_revisions.reviewed_without_change IS
  'TRUE when the organiser reviewed the ambition but decided no text or value change was needed.';

COMMENT ON COLUMN campaign_ambition_revisions.triggered_by_event_type IS
  'Discriminates trigger source: log_of_claims_yes | employer_proposal_no | woc_counter_offer_endorsed.';

-- ── RLS — mirrors campaign_ambitions policies ───────────────────────────────
ALTER TABLE campaign_ambition_revisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE '
      CREATE POLICY "Authenticated users can read campaign_ambition_revisions"
      ON campaign_ambition_revisions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE '
      CREATE POLICY "Admin/User can insert campaign_ambition_revisions"
      ON campaign_ambition_revisions FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Append-only: no UPDATE or DELETE policies (matches plan_revision_notes pattern).
  -- If a revision needs correction, write a new row.
END $$;
