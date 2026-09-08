-- ============================================================
-- Migration 00011: Organising Universe Seed Data
-- ============================================================
-- Seeds missing principal employers, worksites, parent worksite
-- groupings, and default projects to match the organising
-- universe classification hierarchy.
-- ============================================================

-- ============================================================
-- 1. MISSING PRINCIPAL EMPLOYERS
-- ============================================================

INSERT INTO employers (employer_name, employer_category, is_active)
VALUES ('Vermilion', 'Principal_Employer', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. MISSING WORKSITES
-- ============================================================
-- Cross-referenced against the classification hierarchy image.
-- Existing worksites (from prior migrations) are not re-inserted.

-- Onshore - Woodside
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Karratha Gas Plant', 'Gas_Plant', false, true,
  e.employer_id, 'Karratha, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Karratha Gas Plant');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Pluto LNG', 'Onshore_LNG', false, true,
  e.employer_id, 'Karratha, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Pluto LNG');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Pluto 2', 'Onshore_LNG', false, true,
  e.employer_id, 'Karratha, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Pluto 2');

-- Onshore - Chevron (Gorgon and Wheatstone onshore may already exist;
-- ensure distinct onshore entries exist)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Gorgon LNG', 'Onshore_LNG', false, true,
  e.employer_id, 'Barrow Island, Western Australia'
FROM employers e
WHERE e.employer_name = 'Chevron' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Gorgon LNG');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Wheatstone LNG', 'Onshore_LNG', false, true,
  e.employer_id, 'Onslow, Western Australia'
FROM employers e
WHERE e.employer_name = 'Chevron' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Wheatstone LNG');

-- Onshore - Inpex
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Darwin LNG', 'Onshore_LNG', false, true,
  e.employer_id, 'Darwin, Northern Territory'
FROM employers e
WHERE e.employer_name = 'Inpex' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Darwin LNG');

-- Onshore - Santos (Varanus Island may already exist as worksite_id 14)

-- Offshore - Vermilion
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Wandoo B', 'Platform', true, true,
  e.employer_id, 'Carnarvon Basin, Western Australia'
FROM employers e
WHERE e.employer_name = 'Vermilion' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Wandoo B');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Wandoo A', 'Platform', true, true,
  e.employer_id, 'Carnarvon Basin, Western Australia'
FROM employers e
WHERE e.employer_name = 'Vermilion' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Wandoo A');

-- Offshore - Woodside
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Goodwin', 'Platform', true, true,
  e.employer_id, 'North West Shelf, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Goodwin');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Rankin North', 'Platform', true, true,
  e.employer_id, 'North West Shelf, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Rankin North');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Scarborough FPU', 'FPSO', true, true,
  e.employer_id, 'Carnarvon Basin, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Scarborough FPU');

-- Offshore - Inpex (Ichthys sub-components)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Ichthys CPF', 'CPF', true, true,
  e.employer_id, 'Browse Basin, Western Australia'
FROM employers e
WHERE e.employer_name = 'Inpex' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Ichthys CPF');

INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Ichthys FPSO', 'FPSO', true, true,
  e.employer_id, 'Browse Basin, Western Australia'
FROM employers e
WHERE e.employer_name = 'Inpex' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Ichthys FPSO');

-- ============================================================
-- 3. PARENT WORKSITE GROUPINGS
-- ============================================================
-- Create parent entries for worksite groups, then assign children.

-- Ichthys parent (groups CPF, FPSO, and onshore Darwin LNG)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Ichthys', 'Hub', true, true,
  e.employer_id, 'Browse Basin / Darwin, Northern Territory'
FROM employers e
WHERE e.employer_name = 'Inpex' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Ichthys');

UPDATE worksites
SET parent_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys')
WHERE worksite_name IN ('Ichthys CPF', 'Ichthys FPSO', 'Darwin LNG')
  AND parent_worksite_id IS NULL;

-- Pluto parent (groups Pluto LNG onshore + Pluto 2)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
  principal_employer_id, location_description)
SELECT 'Pluto', 'Hub', false, true,
  e.employer_id, 'Karratha, Western Australia'
FROM employers e
WHERE e.employer_name = 'Woodside' AND e.employer_category = 'Principal_Employer'
AND NOT EXISTS (SELECT 1 FROM worksites WHERE worksite_name = 'Pluto');

UPDATE worksites
SET parent_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto')
WHERE worksite_name IN ('Pluto LNG', 'Pluto 2')
  AND parent_worksite_id IS NULL;

-- ============================================================
-- 4. DEFAULT PROJECTS FOR KEY WORKSITES
-- ============================================================

-- Pluto 2 Construction project
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Pluto 2 Construction', ws.worksite_id, 'construction', 'active', true
FROM worksites ws
WHERE ws.worksite_name = 'Pluto 2'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Pluto 2 Construction');

-- Pluto LNG Production project
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Pluto LNG Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Pluto LNG'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Pluto LNG Production');

-- Scarborough FPU Production project
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Scarborough Production', ws.worksite_id, 'production', 'active', true
FROM worksites ws
WHERE ws.worksite_name = 'Scarborough FPU'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Scarborough Production');

-- Karratha Gas Plant Production
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Karratha Gas Plant Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Karratha Gas Plant'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Karratha Gas Plant Production');

-- Gorgon LNG Production
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Gorgon LNG Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Gorgon LNG'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Gorgon LNG Production');

-- Wheatstone LNG Production (onshore)
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Wheatstone LNG Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Wheatstone LNG'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Wheatstone LNG Production');

-- Darwin LNG Production
INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Darwin LNG Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Darwin LNG'
AND NOT EXISTS (SELECT 1 FROM projects WHERE project_name = 'Darwin LNG Production');
