-- ============================================================
-- Migration: Worksite taxonomy cleanup
-- ============================================================
-- 1. Deactivate catch-all/overlapping worksites that shadow
--    specific facility records. Existing agreements and employer
--    roles are retained (not deleted) but the worksites are
--    removed from active UI queries.
-- 2. Deactivate the legacy "Ichthys LNG" worksite (duplicate
--    of Ichthys FPSO / Darwin LNG already in Ichthys Operations
--    program).
-- 3. Seed missing production projects on operational worksites
--    that have no project attached.
-- 4. Create "Scarborough Development" program linking Scarborough
--    FPU and Pluto LNG (gas is piped 430km to Pluto for processing).
-- ============================================================


-- ============================================================
-- 1. DEACTIVATE CATCH-ALL / OVERLAPPING WORKSITES
-- ============================================================
-- These worksites are organisational placeholders that overlap
-- with named specific facilities. Workers and agreements should
-- be reassigned to the relevant specific worksite over time.
-- Setting is_active = false removes them from active queries
-- without losing the historical agreement/role data.

UPDATE worksites
SET
  is_active = false,
  notes = COALESCE(notes || E'\n', '')
         || 'Deactivated ' || now()::date::text
         || ': overlaps with specific named worksites. Agreements and employer roles retained for review.'
WHERE worksite_name IN (
  'Woodside Onshore Facilities',
  'North West Shelf (NWS) Platforms',
  'Chevron Facilities (General)'
);


-- ============================================================
-- 2. DEACTIVATE LEGACY "Ichthys LNG" WORKSITE
-- ============================================================
-- worksite_id = 7 "Ichthys LNG" is a legacy entry that predates
-- the correct Ichthys Operations structure (Ichthys CPF +
-- Ichthys FPSO + Darwin LNG). The 4 agreements and employer
-- roles linked to it should be reviewed and reassigned to the
-- appropriate specific worksites.

UPDATE worksites
SET
  is_active = false,
  notes = COALESCE(notes || E'\n', '')
         || 'Deactivated ' || now()::date::text
         || ': legacy catch-all superseded by Ichthys CPF, Ichthys FPSO, and Darwin LNG. Agreements and employer roles retained for review.'
WHERE worksite_id = 7
  AND worksite_name = 'Ichthys LNG';


-- ============================================================
-- 3. SEED MISSING PRODUCTION PROJECTS
-- ============================================================
-- These worksites are operational but have no project record,
-- which prevents them from being included in organising universe
-- rules that filter by work_type.

-- Woodside offshore FPSOs
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Okha Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Okha FPSO'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Ngujima-Yin Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Ngujima-Yin FPSO'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Pyrenees Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Pyrenees Venture FPSO'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

-- Woodside Scarborough FPU (construction ramping to production)
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Scarborough Development', ws.worksite_id, 'construction', 'active', true
FROM worksites ws
WHERE ws.worksite_name = 'Scarborough FPU'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id);

-- Woodside offshore platforms
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Goodwin Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Goodwin'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Rankin North Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Rankin North'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

-- Chevron offshore platform
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Wheatstone Platform Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Wheatstone Platform'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

-- Inpex offshore facilities
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Ichthys CPF Operations', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Ichthys CPF'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');

INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Ichthys FPSO Operations', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Ichthys FPSO'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE worksite_id = ws.worksite_id AND work_type = 'production');


-- ============================================================
-- 4. CREATE SCARBOROUGH DEVELOPMENT PROGRAM
-- ============================================================
-- Scarborough gas is piped 430 km to be processed at the
-- expanded Pluto LNG onshore facility. The offshore FPU and
-- the onshore processing plant are part of the same capital
-- development and share contractual/organising scope.

INSERT INTO programs (
  program_name, description, principal_employer_id,
  program_status, is_active
)
SELECT
  'Scarborough Development',
  'Woodside Scarborough Project — offshore Scarborough FPU feeds gas 430km '
  'via pipeline to the expanded Pluto LNG onshore facility. Encompasses '
  'offshore construction/production and onshore processing expansion.',
  e.employer_id,
  'active',
  true
FROM employers e
WHERE e.employer_name = 'Woodside'
  AND e.employer_category = 'Principal_Employer'
  AND NOT EXISTS (
    SELECT 1 FROM programs WHERE program_name = 'Scarborough Development'
  );

-- Link Scarborough FPU (primary offshore asset) to the program
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, true
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Scarborough Development'
  AND ws.worksite_name = 'Scarborough FPU'
ON CONFLICT (program_id, worksite_id) DO NOTHING;

-- Link Pluto LNG (onshore processing facility) to the program
INSERT INTO program_worksites (program_id, worksite_id, is_current, is_primary)
SELECT p.program_id, ws.worksite_id, true, false
FROM programs p
CROSS JOIN worksites ws
WHERE p.program_name = 'Scarborough Development'
  AND ws.worksite_name = 'Pluto LNG'
ON CONFLICT (program_id, worksite_id) DO NOTHING;
