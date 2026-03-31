-- ============================================================
-- Migration: Hub Worksites → Programs
-- ============================================================
-- Hub-type worksites (Pluto, Ichthys) were being used as
-- organisational containers grouping multiple physical sites.
-- The `programs` table (added in 20260331190000_programs.sql)
-- is the correct entity for this purpose.
--
-- This migration:
--   1. Removes an accidentally-linked construction project from
--      Karratha Gas Plant (belongs at Pluto 2 worksite).
--   2. Creates "Pluto Operations" and "Ichthys Operations" programs.
--   3. Links child worksites into programs via program_worksites.
--   4. Clears parent_worksite_id on child worksites (grouping is
--      now handled by the program, not the Hub worksite).
--   5. Deactivates the Pluto and Ichthys Hub worksites.
--   6. Removes 'Hub' from the worksites.worksite_type CHECK
--      constraint.
-- ============================================================


-- ============================================================
-- 1. FIX: Remove accidentally-linked project at Karratha Gas Plant
-- ============================================================
-- A construction-type project was accidentally linked to Karratha
-- Gas Plant. KGP has no construction phase; the project belongs
-- to the Pluto 2 worksite. Delete the incorrect row.

DELETE FROM projects
WHERE work_type = 'construction'
  AND worksite_id = (
    SELECT worksite_id FROM worksites WHERE worksite_name = 'Karratha Gas Plant'
  );


-- ============================================================
-- 2. CREATE PROGRAMS
-- ============================================================

INSERT INTO programs (
  program_name, description, principal_employer_id,
  program_status, is_active
)
SELECT
  'Pluto Operations',
  'Woodside Pluto Operations — encompasses Pluto LNG (production) '
  'and Pluto 2 (construction), co-located at Karratha, WA.',
  e.employer_id,
  'active',
  true
FROM employers e
WHERE e.employer_name = 'Woodside'
  AND e.employer_category = 'Principal_Employer'
  AND NOT EXISTS (
    SELECT 1 FROM programs WHERE program_name = 'Pluto Operations'
  );

INSERT INTO programs (
  program_name, description, principal_employer_id,
  program_status, is_active
)
SELECT
  'Ichthys Operations',
  'Inpex Ichthys Operations — encompasses Ichthys CPF and Ichthys '
  'FPSO (offshore, Browse Basin) and Darwin LNG (onshore, NT).',
  e.employer_id,
  'active',
  true
FROM employers e
WHERE e.employer_name = 'Inpex'
  AND e.employer_category = 'Principal_Employer'
  AND NOT EXISTS (
    SELECT 1 FROM programs WHERE program_name = 'Ichthys Operations'
  );


-- ============================================================
-- 3. LINK WORKSITES TO PROGRAMS
-- ============================================================

-- Pluto Operations: Pluto LNG (primary — operational production)
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, true
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Pluto Operations'
  AND ws.worksite_name = 'Pluto LNG'
ON CONFLICT (program_id, worksite_id) DO NOTHING;

-- Pluto Operations: Pluto 2 (construction extension)
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, false
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Pluto Operations'
  AND ws.worksite_name = 'Pluto 2'
ON CONFLICT (program_id, worksite_id) DO NOTHING;

-- Ichthys Operations: Ichthys CPF (primary offshore facility)
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, true
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Ichthys Operations'
  AND ws.worksite_name = 'Ichthys CPF'
ON CONFLICT (program_id, worksite_id) DO NOTHING;

-- Ichthys Operations: Ichthys FPSO
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, false
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Ichthys Operations'
  AND ws.worksite_name = 'Ichthys FPSO'
ON CONFLICT (program_id, worksite_id) DO NOTHING;

-- Ichthys Operations: Darwin LNG (onshore receiving terminal)
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, false
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Ichthys Operations'
  AND ws.worksite_name = 'Darwin LNG'
ON CONFLICT (program_id, worksite_id) DO NOTHING;


-- ============================================================
-- 4. CLEAR PARENT WORKSITE LINKS ON CHILD WORKSITES
-- ============================================================
-- Grouping is now handled by programs; parent_worksite_id is no
-- longer needed for these sites.

UPDATE worksites
SET parent_worksite_id = NULL
WHERE worksite_name IN ('Pluto LNG', 'Pluto 2')
  AND parent_worksite_id = (
    SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto'
  );

UPDATE worksites
SET parent_worksite_id = NULL
WHERE worksite_name IN ('Ichthys CPF', 'Ichthys FPSO', 'Darwin LNG')
  AND parent_worksite_id = (
    SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys'
  );


-- ============================================================
-- 5. DEACTIVATE HUB WORKSITES
-- ============================================================
-- Cannot hard-delete: rows may be referenced in agreement_worksites,
-- campaign_universe_rules, or other junction tables. Setting
-- is_active = false removes them from active UI queries.

UPDATE worksites
SET
  is_active = false,
  notes = COALESCE(notes || E'\n', '')
         || 'Deactivated ' || now()::date::text
         || ': converted to Program entity "Pluto Operations".'
WHERE worksite_name = 'Pluto'
  AND worksite_type = 'Hub';

UPDATE worksites
SET
  is_active = false,
  notes = COALESCE(notes || E'\n', '')
         || 'Deactivated ' || now()::date::text
         || ': converted to Program entity "Ichthys Operations".'
WHERE worksite_name = 'Ichthys'
  AND worksite_type = 'Hub';


-- ============================================================
-- 6. REMOVE 'Hub' FROM worksite_type CHECK CONSTRAINT
-- ============================================================
-- Guard: abort if any active worksite still carries type 'Hub'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM worksites WHERE worksite_type = 'Hub' AND is_active = true
  ) THEN
    RAISE EXCEPTION
      'Cannot remove Hub from CHECK constraint: active Hub worksites still exist. '
      'Deactivate them first.';
  END IF;
END $$;

ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS worksites_worksite_type_check;

ALTER TABLE worksites
  ADD CONSTRAINT worksites_worksite_type_check
  CHECK (worksite_type IN (
    'FPSO', 'FLNG', 'Platform', 'Onshore_LNG', 'Gas_Plant',
    'Drill_Centre', 'Region', 'Heliport', 'Pipeline', 'Airfield',
    'Onshore_Facilities', 'CPF', 'Gas_Field', 'Other'
  ));
