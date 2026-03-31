-- ============================================================
-- Migration: Retype Varanus Island Hub + Remove Hub from CHECK
-- ============================================================
-- "Varanus Island Hub" (Santos, worksite_id 14) is a standalone
-- gas processing facility with no child worksites. The Hub type
-- was a legacy classification; Gas_Plant is correct.
--
-- With this change, no rows in worksites carry worksite_type='Hub'
-- (Pluto and Ichthys were deactivated in 20260331200000), so the
-- CHECK constraint can now be tightened to remove 'Hub'.
-- ============================================================

-- 1. Retype active Hub worksite: Varanus Island Hub -> Gas_Plant
UPDATE worksites
SET
  worksite_name = 'Varanus Island',
  worksite_type = 'Gas_Plant'
WHERE worksite_name = 'Varanus Island Hub'
  AND worksite_type = 'Hub';

-- Retype deactivated Hub worksites (Pluto, Ichthys) to 'Other'.
-- These were converted to Programs in migration 20260331200000.
-- The worksite_type column must not carry 'Hub' for the CHECK
-- constraint below to validate cleanly against all existing rows.
UPDATE worksites
SET worksite_type = 'Other'
WHERE worksite_type = 'Hub'
  AND is_active = false;

-- 2. Guard: confirm no Hub rows remain before altering the constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM worksites WHERE worksite_type = 'Hub') THEN
    RAISE EXCEPTION
      'Cannot remove Hub from CHECK constraint: Hub rows still exist in worksites.';
  END IF;
END $$;

-- 3. Drop and recreate the CHECK constraint without 'Hub'
ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS worksites_worksite_type_check;

ALTER TABLE worksites
  ADD CONSTRAINT worksites_worksite_type_check
  CHECK (worksite_type IN (
    'FPSO', 'FLNG', 'Platform', 'Onshore_LNG', 'Gas_Plant',
    'Drill_Centre', 'Region', 'Heliport', 'Pipeline', 'Airfield',
    'Onshore_Facilities', 'CPF', 'Gas_Field', 'Other'
  ));
