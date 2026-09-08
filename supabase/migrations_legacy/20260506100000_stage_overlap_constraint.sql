-- ============================================================
-- Phase 6 of campaigns review plan: hard-gate-aware overlap
-- enforcement on campaign_stage_plans.
--
-- Today the data model permits any stage date overlap — useful for
-- non-linear planning. Phase 6 keeps overlap permitted by default
-- but locks it on adjoining stages whenever the gate sitting
-- between them is configured as `enforcement_type='hard'` AND
-- `is_active=true`. Users are blocked at the DB level (and the UI
-- shows the rule before they hit it) — soft / inactive gates still
-- allow overlap.
--
-- Two triggers:
--   1. On campaign_stage_plans dates: reject the change if it would
--      overlap an adjoining stage with a hard active gate between.
--   2. On gate_definitions enforcement_type / is_active: reject the
--      change if it would lock an existing overlap.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_stage_overlap_with_hard_gates()
RETURNS TRIGGER AS $$
DECLARE
  cid INT;
  stage_n INT;
  prev_row RECORD;
  next_row RECORD;
  gate_row RECORD;
BEGIN
  cid := NEW.campaign_id;
  stage_n := NEW.stage_number;

  -- Skip if dates are unset on the row being saved.
  IF NEW.planned_start_date IS NULL OR NEW.planned_end_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Check overlap with stage N-1 (gate N-1 sits between them) ────────────
  IF stage_n > 1 THEN
    SELECT planned_start_date, planned_end_date
      INTO prev_row
      FROM campaign_stage_plans
     WHERE campaign_id = cid AND stage_number = stage_n - 1;

    IF FOUND
       AND prev_row.planned_start_date IS NOT NULL
       AND prev_row.planned_end_date IS NOT NULL THEN

      SELECT enforcement_type, is_active
        INTO gate_row
        FROM gate_definitions
       WHERE campaign_id = cid AND gate_number = stage_n - 1;

      IF FOUND
         AND gate_row.enforcement_type = 'hard'
         AND gate_row.is_active = TRUE
         AND NEW.planned_start_date < prev_row.planned_end_date THEN
        RAISE EXCEPTION
          'Stage % cannot start (%) before stage % ends (%) — gate % is configured as a hard active gate (campaign %).',
          stage_n,
          NEW.planned_start_date,
          stage_n - 1,
          prev_row.planned_end_date,
          stage_n - 1,
          cid
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ── Check overlap with stage N+1 (gate N sits between them) ─────────────
  IF stage_n < 6 THEN
    SELECT planned_start_date, planned_end_date
      INTO next_row
      FROM campaign_stage_plans
     WHERE campaign_id = cid AND stage_number = stage_n + 1;

    IF FOUND
       AND next_row.planned_start_date IS NOT NULL
       AND next_row.planned_end_date IS NOT NULL THEN

      SELECT enforcement_type, is_active
        INTO gate_row
        FROM gate_definitions
       WHERE campaign_id = cid AND gate_number = stage_n;

      IF FOUND
         AND gate_row.enforcement_type = 'hard'
         AND gate_row.is_active = TRUE
         AND next_row.planned_start_date < NEW.planned_end_date THEN
        RAISE EXCEPTION
          'Stage % cannot end (%) after stage % starts (%) — gate % is configured as a hard active gate (campaign %).',
          stage_n,
          NEW.planned_end_date,
          stage_n + 1,
          next_row.planned_start_date,
          stage_n,
          cid
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_stage_overlap_with_hard_gates
  ON campaign_stage_plans;
CREATE TRIGGER trg_enforce_stage_overlap_with_hard_gates
  BEFORE INSERT OR UPDATE OF
    planned_start_date, planned_end_date, stage_number, campaign_id
  ON campaign_stage_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_stage_overlap_with_hard_gates();

-- ── Companion trigger on gate_definitions ─────────────────────────────────
-- If a user flips a gate to hard + active and the adjoining stages already
-- overlap, surface that as the same kind of error rather than silently
-- creating an inconsistent state.
CREATE OR REPLACE FUNCTION check_gate_change_against_overlap()
RETURNS TRIGGER AS $$
DECLARE
  cid INT;
  gnum INT;
  stage_a RECORD;
  stage_b RECORD;
BEGIN
  IF NEW.enforcement_type IS DISTINCT FROM 'hard' OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  cid := NEW.campaign_id;
  gnum := NEW.gate_number;

  SELECT planned_start_date, planned_end_date
    INTO stage_a
    FROM campaign_stage_plans
   WHERE campaign_id = cid AND stage_number = gnum;
  SELECT planned_start_date, planned_end_date
    INTO stage_b
    FROM campaign_stage_plans
   WHERE campaign_id = cid AND stage_number = gnum + 1;

  IF stage_a.planned_end_date IS NOT NULL
     AND stage_b.planned_start_date IS NOT NULL
     AND stage_b.planned_start_date < stage_a.planned_end_date THEN
    RAISE EXCEPTION
      'Cannot make gate % a hard active gate: stages % and % currently overlap (% to %, % to %). Resolve the overlap first.',
      gnum,
      gnum, gnum + 1,
      stage_a.planned_start_date, stage_a.planned_end_date,
      stage_b.planned_start_date, stage_b.planned_end_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_gate_change_against_overlap
  ON gate_definitions;
CREATE TRIGGER trg_check_gate_change_against_overlap
  BEFORE INSERT OR UPDATE OF enforcement_type, is_active
  ON gate_definitions
  FOR EACH ROW EXECUTE FUNCTION check_gate_change_against_overlap();

COMMENT ON FUNCTION enforce_stage_overlap_with_hard_gates IS
  'Phase 6: prevents overlap between adjoining stages when the gate between them is hard + active. Soft / inactive gates allow overlap (preserves the prior non-linear-planning behaviour).';

COMMENT ON FUNCTION check_gate_change_against_overlap IS
  'Phase 6: prevents flipping a gate to hard + active when the adjoining stages already overlap. Forces the user to resolve the overlap before locking it.';
