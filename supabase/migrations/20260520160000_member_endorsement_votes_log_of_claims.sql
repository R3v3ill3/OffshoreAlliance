-- ============================================================
-- Phase 7 (Wave 5): Extend member_endorsement_votes.vote_kind
-- to include 'log_of_claims'.
--
-- The original inline CHECK on vote_kind was:
--   CHECK (vote_kind IN ('employer_proposal','union_in_principle','final_eba'))
--
-- We add 'log_of_claims' to capture the formal member vote that
-- endorses the union's Log of Claims before or at bargaining
-- commencement. This reuses the existing endorsement vote
-- capture, editor, and results infrastructure.
--
-- Because the CHECK was created inline (no named constraint),
-- we use the Postgres catalog to find and drop it dynamically,
-- then add a new named CHECK constraint.
-- ============================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find the inline check constraint on member_endorsement_votes.vote_kind
  SELECT con.conname
  INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE rel.relname = 'member_endorsement_votes'
    AND ns.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%vote_kind%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE member_endorsement_votes DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END $$;

ALTER TABLE member_endorsement_votes
  ADD CONSTRAINT member_endorsement_votes_vote_kind_check
  CHECK (vote_kind IN (
    'employer_proposal',
    'union_in_principle',
    'final_eba',
    'log_of_claims'
  ));

COMMENT ON COLUMN member_endorsement_votes.vote_kind IS
  'employer_proposal = employer-launched s.181 vote; '
  'union_in_principle = union-initiated approval; '
  'final_eba = Stage 11 ratification ballot; '
  'log_of_claims = formal member vote endorsing the union Log of Claims '
  '(triggers industrial_outcomes ambition review when outcome=yes).';
