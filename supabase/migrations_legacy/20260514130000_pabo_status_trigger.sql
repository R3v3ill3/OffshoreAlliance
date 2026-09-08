-- ============================================================
-- Phase 5 (Wave 3 Agent F): PABO status trigger
--
-- 1. When a pabo_applications row transitions to status='granted',
--    insert a gate_assessments record passing the Stage 10 hard gate
--    for the campaign.  The gate_definitions row (gate_number=10) is
--    seeded by Phase 3 (Wave 3 Agent E); if it does not exist yet the
--    trigger silently skips the insert — safe to run before Phase 3
--    migrations are applied.
--
-- 2. When a pabo_ballot_questions row has votes_yes > votes_no on
--    INSERT or UPDATE, its outcome is set to 'carried' automatically.
-- ============================================================

-- ── Function 1: gate assessment on PABO granted ──────────────

CREATE OR REPLACE FUNCTION fn_pabo_granted_gate_pass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gate_id INT;
BEGIN
  -- Only fire when status transitions TO 'granted'
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'granted' THEN

    -- Find the Stage 10 gate_definitions row for this campaign.
    -- Phase 3 seeds gate_number=10; if it doesn't exist yet we skip
    -- silently (safe ordering: trigger no-ops until Phase 3 merges).
    SELECT gate_id
      INTO v_gate_id
      FROM gate_definitions
     WHERE campaign_id = NEW.campaign_id
       AND gate_number = 10
     LIMIT 1;

    IF v_gate_id IS NOT NULL THEN
      INSERT INTO gate_assessments (
        gate_id,
        assessment_date,
        outcome,
        notes,
        snapshot
      )
      VALUES (
        v_gate_id,
        now(),
        'passed',
        'Auto-passed: PABO status set to granted (pabo_id=' || NEW.pabo_id || ')',
        jsonb_build_object(
          'source',              'pabo_granted',
          'pabo_id',             NEW.pabo_id,
          'fwc_application_number', NEW.fwc_application_number,
          'ballot_order_made_at', NEW.ballot_order_made_at,
          'auto_assessed_at',    now()
        )
      )
      -- If a gate_assessment for this gate already exists with outcome=passed,
      -- we do not create a duplicate — just skip.
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to pabo_applications (AFTER UPDATE so we can compare OLD vs NEW)
DROP TRIGGER IF EXISTS trg_pabo_granted_gate_pass ON pabo_applications;

CREATE TRIGGER trg_pabo_granted_gate_pass
  AFTER INSERT OR UPDATE OF status ON pabo_applications
  FOR EACH ROW
  EXECUTE FUNCTION fn_pabo_granted_gate_pass();

-- ── Function 2: auto-set ballot question outcome ─────────────

CREATE OR REPLACE FUNCTION fn_pabo_question_auto_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When votes_yes > votes_no and outcome is not already explicitly set to
  -- 'failed' or 'withdrawn', mark the question as 'carried'.
  IF NEW.votes_yes IS NOT NULL
     AND NEW.votes_no IS NOT NULL
     AND NEW.votes_yes > NEW.votes_no
     AND NEW.outcome IS DISTINCT FROM 'failed'
     AND NEW.outcome IS DISTINCT FROM 'withdrawn' THEN
    NEW.outcome := 'carried';
  END IF;

  -- If votes_no >= votes_yes and outcome is not manually overridden to
  -- 'withdrawn', set it to 'failed' (counts are in but motion lost).
  IF NEW.votes_yes IS NOT NULL
     AND NEW.votes_no IS NOT NULL
     AND NEW.votes_yes <= NEW.votes_no
     AND NEW.outcome IS DISTINCT FROM 'withdrawn'
     AND NEW.outcome IS DISTINCT FROM 'carried' THEN
    NEW.outcome := 'failed';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to pabo_ballot_questions (BEFORE so we can mutate NEW.outcome)
DROP TRIGGER IF EXISTS trg_pabo_question_auto_outcome ON pabo_ballot_questions;

CREATE TRIGGER trg_pabo_question_auto_outcome
  BEFORE INSERT OR UPDATE OF votes_yes, votes_no, outcome ON pabo_ballot_questions
  FOR EACH ROW
  EXECUTE FUNCTION fn_pabo_question_auto_outcome();

-- ── Comments ─────────────────────────────────────────────────

COMMENT ON FUNCTION fn_pabo_granted_gate_pass() IS
  'After a pabo_applications row transitions to status=''granted'', inserts a '
  'gate_assessments row with outcome=''passed'' for the Stage 10 gate of the '
  'campaign. Safe when the gate_definitions row does not exist yet (no-op).';

COMMENT ON FUNCTION fn_pabo_question_auto_outcome() IS
  'Before insert/update on pabo_ballot_questions: auto-sets outcome=''carried'' '
  'when votes_yes > votes_no, and outcome=''failed'' when votes_no >= votes_yes, '
  'unless outcome has been manually set to ''withdrawn''.';
