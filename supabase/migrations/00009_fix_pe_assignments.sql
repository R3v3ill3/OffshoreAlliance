-- ============================================================
-- Migration 00009: Fix Principal Employer Assignments
-- ============================================================
-- Creates Santos and Jadestone as Principal Employer records,
-- assigns principal_employer_id for 17 worksites, and sets
-- parent_employer_id for the Santos and Jadestone operating entities.
-- ============================================================

-- ── Step 1: Insert new Principal Employers ────────────────
INSERT INTO employers (employer_name, employer_category, is_active)
VALUES
  ('Santos',    'Principal_Employer', true),
  ('Jadestone', 'Principal_Employer', true);

-- ── Step 2: Assign worksites to Principal Employers ───────
-- Uses subselects keyed on (name + category) so the correct
-- record is always targeted regardless of assigned employer_id.

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Chevron'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (1, 2, 3, 4);
-- 1: Gorgon LNG
-- 2: Wheatstone LNG (Downstream)
-- 3: Wheatstone Platform
-- 4: Chevron Facilities (General)

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Shell'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (5, 6);
-- 5: Prelude FLNG
-- 6: Crux Gas Field

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Inpex'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (7);
-- 7: Ichthys LNG

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Woodside'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (9, 10, 11, 12, 13, 18);
-- 9:  North West Shelf (NWS) Platforms
-- 10: Macedon Gas Plant
-- 11: Ngujima-Yin FPSO
-- 12: Ohka FPSO
-- 13: Woodside Onshore Facilities
-- 18: Pyrenees Venture FPSO

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Santos'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (14, 17);
-- 14: Varanus Island Hub
-- 17: Ningaloo Vision FPSO

UPDATE worksites
   SET principal_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Jadestone'
            AND employer_category = 'Principal_Employer'
       )
 WHERE worksite_id IN (15, 16);
-- 15: Montara Venture FPSO
-- 16: Stag CPF

-- ── Step 3: Set parent_employer_id for Santos/Jadestone entities ──
-- These employer records are the direct operating arms of their PE,
-- so the PE is correctly both the principal employer of the worksite
-- and the parent employer of the employing entity.

UPDATE employers
   SET parent_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Santos'
            AND employer_category = 'Principal_Employer'
       )
 WHERE employer_id = 9;
-- 9: SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB

UPDATE employers
   SET parent_employer_id = (
         SELECT employer_id FROM employers
          WHERE employer_name = 'Jadestone'
            AND employer_category = 'Principal_Employer'
       )
 WHERE employer_id IN (6, 7, 89);
-- 6:  JADESTONE ENERGY MONTARA VENTURE
-- 7:  JADESTONE ENERGY STAG CPF
-- 89: JADESTONE ENERGRY MONTARA VENTURE (typo variant — same entity)
