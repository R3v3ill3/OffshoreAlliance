-- ============================================================
-- Migration: Add FPU worksite type + taxonomy data fixes
-- ============================================================
-- 1. Add 'FPU' (Floating Production Unit) to the worksite_type
--    CHECK constraint. FPU is architecturally distinct from FPSO
--    (no storage/offloading capability).
-- 2. Retype Scarborough FPU from FPSO → FPU.
-- 3. Fix is_offshore flag on Gorgon LNG and Varanus Island
--    (both are island/coastal onshore facilities, classified as
--    onshore in Australian oil & gas industry convention).
-- 4. Correct the spelling of Okha FPSO (was "Ohka FPSO").
-- ============================================================


-- ============================================================
-- 1. ADD FPU TO worksite_type CHECK CONSTRAINT
-- ============================================================

ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS worksites_worksite_type_check;

ALTER TABLE worksites
  ADD CONSTRAINT worksites_worksite_type_check
  CHECK (worksite_type IN (
    'FPSO', 'FPU', 'FLNG', 'Platform', 'Onshore_LNG', 'Gas_Plant',
    'Drill_Centre', 'Region', 'Heliport', 'Pipeline', 'Airfield',
    'Onshore_Facilities', 'CPF', 'Gas_Field', 'Other'
  ));


-- ============================================================
-- 2. RETYPE SCARBOROUGH FPU: FPSO → FPU
-- ============================================================

UPDATE worksites
SET worksite_type = 'FPU'
WHERE worksite_name = 'Scarborough FPU'
  AND worksite_type = 'FPSO';


-- ============================================================
-- 3. FIX is_offshore FLAGS
-- ============================================================
-- Gorgon LNG is on Barrow Island — an onshore facility by
-- Australian industry convention (classified under onshore EBAs).

UPDATE worksites
SET is_offshore = false
WHERE worksite_name = 'Gorgon LNG'
  AND is_offshore = true;

-- Varanus Island is a coastal island gas processing plant —
-- also classified as onshore.

UPDATE worksites
SET is_offshore = false
WHERE worksite_name = 'Varanus Island'
  AND is_offshore = true;


-- ============================================================
-- 4. CORRECT SPELLING: Ohka FPSO → Okha FPSO
-- ============================================================

UPDATE worksites
SET worksite_name = 'Okha FPSO'
WHERE worksite_name = 'Ohka FPSO';
