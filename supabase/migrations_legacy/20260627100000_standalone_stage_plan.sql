-- ============================================================
-- Standalone activities stage (stage_number = 0)
--
-- Per-campaign bucket for ambitions/assessments created outside
-- the P2W/B2W stage sequence (Workforce → Assessments flow).
-- ============================================================

ALTER TYPE campaign_phase_enum ADD VALUE IF NOT EXISTS 'standalone_activities';

ALTER TABLE campaign_stage_plans
  DROP CONSTRAINT IF EXISTS campaign_stage_plans_stage_number_check;
ALTER TABLE campaign_stage_plans
  ADD CONSTRAINT campaign_stage_plans_stage_number_check
    CHECK (stage_number BETWEEN 0 AND 11);

CREATE OR REPLACE FUNCTION enforce_stage_phase_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage_number = 0 THEN
    IF NEW.phase IS DISTINCT FROM 'standalone_activities' THEN
      RAISE EXCEPTION
        'campaign_stage_plans invariant violated: stage_number 0 must have phase = standalone_activities, got %.',
        NEW.phase
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.phase := 'standalone_activities';
    RETURN NEW;
  END IF;

  IF NEW.stage_number BETWEEN 1 AND 6 THEN
    IF NEW.phase <> 'preparing_to_bargain' THEN
      RAISE EXCEPTION
        'campaign_stage_plans invariant violated: stage_number % (1–6) must have phase = preparing_to_bargain, got %.',
        NEW.stage_number, NEW.phase
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.stage_number BETWEEN 7 AND 11 THEN
    IF NEW.phase <> 'bargaining_to_win' THEN
      RAISE EXCEPTION
        'campaign_stage_plans invariant violated: stage_number % (7–11) must have phase = bargaining_to_win, got %.',
        NEW.stage_number, NEW.phase
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.stage_number BETWEEN 1 AND 6 THEN
    NEW.phase := 'preparing_to_bargain';
  ELSIF NEW.stage_number BETWEEN 7 AND 11 THEN
    NEW.phase := 'bargaining_to_win';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_stage_phase_invariant IS
  'Ensures campaign_stage_plans.phase matches stage_number. Stage 0 = standalone_activities; 1–6 = preparing_to_bargain; 7–11 = bargaining_to_win.';

CREATE OR REPLACE FUNCTION enforce_stage_overlap_with_hard_gates()
RETURNS TRIGGER AS $$
DECLARE
  cid    INT;
  stage_n INT;
  prev_row RECORD;
  next_row RECORD;
  gate_row RECORD;
BEGIN
  cid     := NEW.campaign_id;
  stage_n := NEW.stage_number;

  -- Standalone bucket has no sequential gate neighbours.
  IF stage_n = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.planned_start_date IS NULL OR NEW.planned_end_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF stage_n > 1 AND stage_n <> 7 THEN
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

  IF stage_n < 11 AND stage_n <> 6 THEN
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

COMMENT ON COLUMN campaign_stage_plans.stage_number IS
  '0 = Standalone activities (ad-hoc ambitions); 1–6 = P2W; 7–11 = B2W.';
