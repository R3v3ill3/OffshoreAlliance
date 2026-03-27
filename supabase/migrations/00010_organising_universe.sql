-- ============================================================
-- Migration 00010: Organising Universe Schema
-- ============================================================
-- Introduces:
--   1. projects table (work phases at worksites with lifecycle tracking)
--   2. project_employers / project_agreements junction tables
--   3. worksite hierarchy (parent_worksite_id)
--   4. agreement scope classification (agreement_scope)
--   5. worker -> project link
--   6. enhanced campaign_universe_rules rule types
--   7. indexes and RLS for all new structures
-- ============================================================

-- ============================================================
-- 0. DROP VIEWS THAT USE table.* EXPANSION
-- ============================================================
-- These must be dropped before altering the underlying tables,
-- because adding columns changes the w.*/ws.* expansion and
-- CREATE OR REPLACE VIEW cannot rename existing view columns.

DROP VIEW IF EXISTS organising_universe_view CASCADE;
DROP VIEW IF EXISTS workers_view CASCADE;
DROP VIEW IF EXISTS worksites_view CASCADE;

-- ============================================================
-- 1. PROJECTS TABLE
-- ============================================================

CREATE TABLE projects (
  project_id    SERIAL PRIMARY KEY,
  project_name  VARCHAR(200) NOT NULL,
  worksite_id   INT NOT NULL REFERENCES worksites(worksite_id),
  work_type     VARCHAR(30) NOT NULL CHECK (work_type IN (
    'production', 'construction', 'decommissioning',
    'brownfields', 'service_provision', 'maintenance'
  )),
  project_status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (project_status IN (
    'planning', 'active', 'commissioning',
    'operational', 'decommissioning', 'completed', 'absorbed'
  )),
  start_date         DATE,
  expected_end_date  DATE,
  actual_end_date    DATE,
  absorbed_into_project_id INT REFERENCES projects(project_id),
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. PROJECT JUNCTION TABLES
-- ============================================================

CREATE TABLE project_employers (
  id           SERIAL PRIMARY KEY,
  project_id   INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  employer_id  INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  role_type    VARCHAR(30) CHECK (role_type IN (
    'Owner','Operator','Principal_Contractor','Subcontractor',
    'Labour_Hire','Catering','Maintenance','Drilling',
    'ROV','Inspection','Transport','Decommissioning','Aviation','Other'
  )),
  is_current   BOOLEAN NOT NULL DEFAULT true,
  start_date   DATE,
  end_date     DATE,
  UNIQUE(project_id, employer_id, role_type)
);

CREATE TABLE project_agreements (
  id            SERIAL PRIMARY KEY,
  project_id    INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  agreement_id  INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  notes         VARCHAR(200),
  UNIQUE(project_id, agreement_id)
);

-- ============================================================
-- 3. WORKSITE HIERARCHY
-- ============================================================

ALTER TABLE worksites
  ADD COLUMN IF NOT EXISTS parent_worksite_id INT REFERENCES worksites(worksite_id);

-- ============================================================
-- 4. AGREEMENT SCOPE
-- ============================================================

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS agreement_scope VARCHAR(30)
    CHECK (agreement_scope IN (
      'site_specific', 'project_specific', 'sector_wide', 'company_wide'
    ));

-- ============================================================
-- 5. WORKER -> PROJECT LINK
-- ============================================================

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(project_id);

-- ============================================================
-- 6. ENHANCED CAMPAIGN UNIVERSE RULES
-- ============================================================

ALTER TABLE campaign_universe_rules
  DROP CONSTRAINT IF EXISTS campaign_universe_rules_rule_type_check;

ALTER TABLE campaign_universe_rules
  ADD CONSTRAINT campaign_universe_rules_rule_type_check
  CHECK (rule_type IN (
    'agreement', 'worksite', 'employer', 'member_role', 'sector',
    'project', 'work_type', 'onshore_offshore'
  ));

-- ============================================================
-- 7. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_worksite     ON projects(worksite_id);
CREATE INDEX IF NOT EXISTS idx_projects_work_type    ON projects(work_type);
CREATE INDEX IF NOT EXISTS idx_projects_status       ON projects(project_status);
CREATE INDEX IF NOT EXISTS idx_projects_active       ON projects(is_active);

CREATE INDEX IF NOT EXISTS idx_project_employers_project  ON project_employers(project_id);
CREATE INDEX IF NOT EXISTS idx_project_employers_employer ON project_employers(employer_id);

CREATE INDEX IF NOT EXISTS idx_project_agreements_project   ON project_agreements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_agreement ON project_agreements(agreement_id);

CREATE INDEX IF NOT EXISTS idx_workers_project        ON workers(project_id);
CREATE INDEX IF NOT EXISTS idx_worksites_parent        ON worksites(parent_worksite_id);
CREATE INDEX IF NOT EXISTS idx_agreements_scope        ON agreements(agreement_scope);

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_agreements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'projects', 'project_employers', 'project_agreements'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated users can read %1$s" ON %1$s FOR SELECT TO authenticated USING (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin/User can insert %1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin/User can update %1$s" ON %1$s FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin can delete %1$s" ON %1$s FOR DELETE TO authenticated USING (get_user_role() = ''admin'')',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- 9. UPDATED VIEWS
-- ============================================================

-- Workers view: add project info
CREATE OR REPLACE VIEW workers_view AS
SELECT
  w.*,
  e.employer_name,
  ws.worksite_name,
  ws.is_offshore,
  mrt.display_name AS member_role_display,
  u.union_code,
  u.union_name,
  p.project_name,
  p.work_type,
  p.project_status
FROM workers w
LEFT JOIN employers e ON e.employer_id = w.employer_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
LEFT JOIN unions u ON u.union_id = w.union_id
LEFT JOIN projects p ON p.project_id = w.project_id;

-- Worksites view: add parent worksite and project count
CREATE OR REPLACE VIEW worksites_view AS
SELECT
  ws.*,
  e.employer_name AS operator_name,
  pws.worksite_name AS parent_worksite_name,
  pe.employer_name AS principal_employer_name,
  (
    SELECT COUNT(*)::int
    FROM agreement_worksites aw
    WHERE aw.worksite_id = ws.worksite_id
  ) AS agreement_count,
  (
    SELECT COUNT(*)::int
    FROM workers w
    WHERE w.worksite_id = ws.worksite_id AND w.is_active = true
  ) AS worker_count,
  (
    SELECT COUNT(*)::int
    FROM projects p
    WHERE p.worksite_id = ws.worksite_id AND p.is_active = true
  ) AS project_count
FROM worksites ws
LEFT JOIN employers e ON e.employer_id = ws.operator_id
LEFT JOIN worksites pws ON pws.worksite_id = ws.parent_worksite_id
LEFT JOIN employers pe ON pe.employer_id = ws.principal_employer_id;

-- New: organising universe view
-- Flattens key dimensions for multi-dimensional filtering of organising sub-universes
CREATE OR REPLACE VIEW organising_universe_view AS
SELECT
  ws.worksite_id,
  ws.worksite_name,
  ws.worksite_type,
  ws.is_offshore,
  ws.parent_worksite_id,
  pws.worksite_name          AS parent_worksite_name,
  ws.principal_employer_id,
  pe.employer_name           AS principal_employer_name,
  p.project_id,
  p.project_name,
  p.work_type,
  p.project_status,
  ewr.employer_id,
  emp.employer_name,
  emp.employer_category,
  emp.parent_employer_id,
  a.agreement_id,
  a.agreement_name,
  a.short_name               AS agreement_short_name,
  a.status                   AS agreement_status,
  a.agreement_scope,
  a.expiry_date              AS agreement_expiry,
  s.sector_id,
  s.sector_name,
  (
    SELECT COUNT(*)::int
    FROM workers w
    WHERE w.worksite_id = ws.worksite_id
      AND w.employer_id = ewr.employer_id
      AND (w.project_id = p.project_id OR (w.project_id IS NULL AND p.project_id IS NULL))
      AND w.is_active = true
  ) AS worker_count
FROM worksites ws
LEFT JOIN worksites pws ON pws.worksite_id = ws.parent_worksite_id
LEFT JOIN employers pe  ON pe.employer_id  = ws.principal_employer_id
-- Employers at the worksite
LEFT JOIN employer_worksite_roles ewr ON ewr.worksite_id = ws.worksite_id AND ewr.is_current = true
LEFT JOIN employers emp ON emp.employer_id = ewr.employer_id
-- Projects at the worksite
LEFT JOIN projects p ON p.worksite_id = ws.worksite_id AND p.is_active = true
-- Agreements covering employer at worksite (via agreement_worksites + agreement_employers/primary)
LEFT JOIN agreement_worksites aw ON aw.worksite_id = ws.worksite_id
LEFT JOIN agreements a ON a.agreement_id = aw.agreement_id
  AND a.status <> 'Terminated'
  AND (
    a.employer_id = ewr.employer_id
    OR EXISTS (
      SELECT 1 FROM agreement_employers ae
      WHERE ae.agreement_id = a.agreement_id
        AND ae.employer_id  = ewr.employer_id
    )
  )
LEFT JOIN sectors s ON s.sector_id = a.sector_id
WHERE ws.is_active = true;
