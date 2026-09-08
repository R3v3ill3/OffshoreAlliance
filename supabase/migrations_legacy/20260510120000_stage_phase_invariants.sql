-- ============================================================
-- Phase 1 of Bargaining to Win: DB-level phase/stage invariants
-- ============================================================
-- 1. Trigger on campaign_stage_plans: enforces that
--      phase = 'preparing_to_bargain'  IFF  stage_number BETWEEN 1 AND 6
--      phase = 'bargaining_to_win'     IFF  stage_number BETWEEN 7 AND 11
--    (post_settlement is not a valid plan phase — it has no stage rows.)
--
-- 2. Replaces enforce_stage_overlap_with_hard_gates() so the overlap check
--    never crosses the Phase-1 / Phase-2 boundary (stage 6 → 7).
--    Gate numbers are per-phase: gate N sits between stage N and stage N+1
--    within the same phase. A Phase-1 gate (1–5) must not be tested against
--    a Phase-2 stage (7–11) and vice-versa.
--
-- 3. Companion trigger on gate_definitions is also updated so that activating
--    a hard gate on gate 5 (between stages 5–6 inside Phase 1) does not
--    accidentally cross into Phase 2.
-- ============================================================

-- ── 1. Phase/stage invariant trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_stage_phase_invariant()
RETURNS TRIGGER AS $$
BEGIN
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
  -- Auto-correct the phase so callers that omit it get the right value.
  -- This is friendlier than a pure reject: an INSERT that sets stage_number=8
  -- without setting phase will still succeed with phase auto-set to bargaining_to_win.
  IF NEW.stage_number BETWEEN 1 AND 6 THEN
    NEW.phase := 'preparing_to_bargain';
  ELSIF NEW.stage_number BETWEEN 7 AND 11 THEN
    NEW.phase := 'bargaining_to_win';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_stage_phase_invariant ON campaign_stage_plans;
CREATE TRIGGER trg_enforce_stage_phase_invariant
  BEFORE INSERT OR UPDATE OF stage_number, phase
  ON campaign_stage_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_stage_phase_invariant();

COMMENT ON FUNCTION enforce_stage_phase_invariant IS
  'B2W Phase 1: ensures campaign_stage_plans.phase is consistent with stage_number. Also auto-corrects phase on INSERT so callers that only supply stage_number get the right phase without explicitly setting it.';


-- ── 2. Phase-aware overlap trigger (replaces the one in 20260506100000) ──
--
-- Key change from the original:
--   • Old code: upper-bound check was `IF stage_n < 6 THEN` — this would
--     attempt to enforce a gate between stage 6 and a (non-existent at that
--     time) stage 7.  Now that stage 7+ exist we must restrict the check to
--     same-phase adjacency:
--       Phase 1 gates:  gate_number 1–5, adjoin stages 1–6  (stage_n < 6)
--       Phase 2 gates:  gate_number 6–10, adjoin stages 7–11 (stage_n < 11
--                        AND stage_n <> 6, i.e. only within phase 2)
--   • The boundary stage_n = 6 must NOT check for a gate toward stage 7
--     (cross-phase gate).  Similarly stage_n = 7 must NOT check backward
--     toward stage 6.
--
-- Phase boundary definition (used in both triggers below):
--   Stage 1–6  → phase 1   (last stage in phase 1 = 6)
--   Stage 7–11 → phase 2   (last stage in phase 2 = 11)
--   Stage 6 is the last of phase 1 — no forward gate toward 7.
--   Stage 7 is the first of phase 2 — no backward gate toward 6.

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

  -- Skip if dates are unset on the row being saved.
  IF NEW.planned_start_date IS NULL OR NEW.planned_end_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Check overlap with stage N-1 (gate N-1 sits between them) ──────────
  -- Only within same phase: never check backward from the first stage of a
  -- phase (stage 1 = first of phase 1; stage 7 = first of phase 2).
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

  -- ── Check overlap with stage N+1 (gate N sits between them) ────────────
  -- Only within same phase: never check forward from the last stage of a
  -- phase (stage 6 = last of phase 1; stage 11 = last of phase 2).
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

DROP TRIGGER IF EXISTS trg_enforce_stage_overlap_with_hard_gates
  ON campaign_stage_plans;
CREATE TRIGGER trg_enforce_stage_overlap_with_hard_gates
  BEFORE INSERT OR UPDATE OF
    planned_start_date, planned_end_date, stage_number, campaign_id
  ON campaign_stage_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_stage_overlap_with_hard_gates();

-- ── 3. Companion trigger on gate_definitions (phase-aware) ───────────────
-- Gate numbers:
--   1–5  adjoin stages 1–6 (phase 1)   → gate N adjoins stage N and stage N+1
--   6–10 adjoin stages 7–11 (phase 2)  → gate N adjoins stage N+1 and stage N+2
--                                         (i.e. gate 6 adjoins stages 7 and 8)
-- The gate_definitions table still uses gate_number 1–5 for Phase 1.
-- Phase 2 gates (6–10) will be introduced in a later migration; this trigger
-- handles them safely by using the same formula.
--
-- Phase boundary: gate 5 sits between stages 5 and 6 (both phase 1). There
-- is no gate between stage 6 and stage 7 (cross-phase), so gate_number = 6
-- when it exists will sit between stages 7 and 8 (both phase 2).
-- The companion trigger therefore needs no special boundary logic for
-- existing gate numbers (1–5): gnum and gnum+1 are always in the same phase
-- for gate_number 1–5.

CREATE OR REPLACE FUNCTION check_gate_change_against_overlap()
RETURNS TRIGGER AS $$
DECLARE
  cid   INT;
  gnum  INT;
  -- For phase 1 gates (1–5): gate N sits between stage N and stage N+1.
  -- For phase 2 gates (6–10): gate N sits between stage N+1 and stage N+2.
  -- Formula: left_stage = gate_number (phase 1) or gate_number + 1 (phase 2).
  left_stage  INT;
  right_stage INT;
  stage_a RECORD;
  stage_b RECORD;
BEGIN
  IF NEW.enforcement_type IS DISTINCT FROM 'hard' OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  cid  := NEW.campaign_id;
  gnum := NEW.gate_number;

  -- Determine which two stages this gate sits between.
  IF gnum BETWEEN 1 AND 5 THEN
    -- Phase 1 gates: gate N is between stage N and stage N+1.
    left_stage  := gnum;
    right_stage := gnum + 1;
  ELSIF gnum BETWEEN 6 AND 10 THEN
    -- Phase 2 gates: gate N is between stage N+1 and stage N+2.
    -- e.g. gate 6 sits between stages 7 and 8.
    left_stage  := gnum + 1;
    right_stage := gnum + 2;
  ELSE
    -- Unknown gate number — allow (defensive).
    RETURN NEW;
  END IF;

  SELECT planned_start_date, planned_end_date
    INTO stage_a
    FROM campaign_stage_plans
   WHERE campaign_id = cid AND stage_number = left_stage;
  SELECT planned_start_date, planned_end_date
    INTO stage_b
    FROM campaign_stage_plans
   WHERE campaign_id = cid AND stage_number = right_stage;

  IF stage_a.planned_end_date IS NOT NULL
     AND stage_b.planned_start_date IS NOT NULL
     AND stage_b.planned_start_date < stage_a.planned_end_date THEN
    RAISE EXCEPTION
      'Cannot make gate % a hard active gate: stages % and % currently overlap (% to %, % to %). Resolve the overlap first.',
      gnum,
      left_stage, right_stage,
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
  'B2W Phase 1 (replaces Phase-6 version): prevents overlap between adjoining stages when the gate between them is hard + active. Phase-boundary stages (6 and 7) are exempt from cross-phase checking — only within-phase adjacency is enforced.';

COMMENT ON FUNCTION check_gate_change_against_overlap IS
  'B2W Phase 1 (replaces Phase-6 version): prevents flipping a gate to hard + active when the adjoining stages already overlap. Phase-aware: gate_number 1–5 sit between stages 1–6 (Phase 1); gate_number 6–10 will sit between stages 7–11 (Phase 2).';

COMMENT ON FUNCTION enforce_stage_phase_invariant IS
  'B2W Phase 1: ensures campaign_stage_plans.phase is consistent with stage_number. Auto-corrects phase on INSERT/UPDATE.';
