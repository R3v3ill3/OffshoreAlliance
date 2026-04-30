-- ============================================================
-- Migration 20260511120000: Intractable bargaining tracker
--
-- One row per campaign (if/when bargaining has commenced).
-- Tracks the 9-month legal threshold (Fair Work Act s 235) and
-- records key milestone dates for the intractable bargaining
-- application process.
--
-- State machine:
--   safe       — < 6 months elapsed since bargaining_commenced_at
--   approaching — 6–9 months elapsed
--   eligible   — >= 9 months elapsed (threshold reached, no app filed)
--   applied    — intractable_application_filed_at is set
--   declared   — intractable_declaration_made_at is set
--   arbitrated — arbitration_outcome_recorded_at is set
--
-- The state is recomputed on demand by refresh_intractable_state().
-- ============================================================

CREATE TABLE IF NOT EXISTS intractable_bargaining_tracker (
  campaign_id                    INT PRIMARY KEY
    REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  bargaining_commenced_at        DATE NOT NULL,
  nine_month_threshold_at        DATE GENERATED ALWAYS AS
    (bargaining_commenced_at + INTERVAL '9 months') STORED,
  intractable_application_filed_at  DATE,
  intractable_declaration_made_at   DATE,
  arbitration_outcome_recorded_at   DATE,
  state TEXT CHECK (state IN (
    'safe','approaching','eligible','applied','declared','arbitrated'
  )),
  last_reviewed_at               TIMESTAMPTZ DEFAULT now(),
  notes                          TEXT,
  created_by                     UUID REFERENCES auth.users(id),
  updated_at                     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE intractable_bargaining_tracker IS
  'One row per campaign once bargaining has commenced. Tracks the 9-month Fair Work Act s 235 threshold and intractable bargaining application milestones.';

COMMENT ON COLUMN intractable_bargaining_tracker.nine_month_threshold_at IS
  'Generated: bargaining_commenced_at + 9 months. The date from which an intractable bargaining application may be filed.';

COMMENT ON COLUMN intractable_bargaining_tracker.state IS
  'Computed state: safe (<6 mo), approaching (6-9 mo), eligible (>=9 mo), applied, declared, arbitrated. Recomputed by refresh_intractable_state().';

CREATE INDEX IF NOT EXISTS idx_ibt_state
  ON intractable_bargaining_tracker(state);

CREATE OR REPLACE TRIGGER trg_ibt_updated_at
  BEFORE UPDATE ON intractable_bargaining_tracker
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS — mirrors campaign_situation_analyses pattern ────────────────────────
ALTER TABLE intractable_bargaining_tracker ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read intractable_bargaining_tracker" ON intractable_bargaining_tracker FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert intractable_bargaining_tracker" ON intractable_bargaining_tracker FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update intractable_bargaining_tracker" ON intractable_bargaining_tracker FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete intractable_bargaining_tracker" ON intractable_bargaining_tracker FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── refresh_intractable_state(p_campaign_id) ─────────────────────────────────
-- Recomputes state from milestone dates. Call after editing any date column.
-- Returns the new state value.
CREATE OR REPLACE FUNCTION refresh_intractable_state(p_campaign_id INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row    intractable_bargaining_tracker%ROWTYPE;
  v_months NUMERIC;
  v_state  TEXT;
BEGIN
  SELECT * INTO v_row
  FROM   intractable_bargaining_tracker
  WHERE  campaign_id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Terminal states derived from milestone date columns (highest precedence).
  IF v_row.arbitration_outcome_recorded_at IS NOT NULL THEN
    v_state := 'arbitrated';
  ELSIF v_row.intractable_declaration_made_at IS NOT NULL THEN
    v_state := 'declared';
  ELSIF v_row.intractable_application_filed_at IS NOT NULL THEN
    v_state := 'applied';
  ELSE
    -- Time-based state: months since bargaining commenced.
    v_months := EXTRACT(
      EPOCH FROM (CURRENT_DATE - v_row.bargaining_commenced_at)
    ) / (30.4375 * 24 * 3600);  -- average days per month

    IF v_months >= 9 THEN
      v_state := 'eligible';
    ELSIF v_months >= 6 THEN
      v_state := 'approaching';
    ELSE
      v_state := 'safe';
    END IF;
  END IF;

  UPDATE intractable_bargaining_tracker
  SET    state           = v_state,
         last_reviewed_at = now(),
         updated_at      = now()
  WHERE  campaign_id = p_campaign_id;

  RETURN v_state;
END;
$$;

COMMENT ON FUNCTION refresh_intractable_state(INT) IS
  'Recomputes the intractable bargaining state for a campaign from its milestone dates. Call after editing bargaining_commenced_at or any of the application/declaration/outcome dates.';
