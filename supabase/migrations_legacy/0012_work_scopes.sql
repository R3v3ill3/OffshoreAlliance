-- ============================================================
-- Migration 00012: Work Scopes
-- ============================================================
-- Introduces:
--   1. work_scopes hierarchical reference table
--   2. worksite_scopes (which scopes active at each worksite, by which employer)
--   3. employer_scopes (employer capabilities, auto-propagated or manual)
--   4. agreement_scopes (tag EBAs with work scopes)
--   5. Auto-propagation trigger (worksite_scope -> employer_scope)
--   6. Narrow employer_worksite_roles.role_type to contractual roles only
--   7. Seed initial hierarchy (Brownfields + Specialist)
-- ============================================================

-- ============================================================
-- 1. WORK SCOPES TABLE
-- ============================================================

CREATE TABLE work_scopes (
  scope_id        SERIAL PRIMARY KEY,
  scope_name      VARCHAR(100) NOT NULL,
  parent_scope_id INT REFERENCES work_scopes(scope_id),
  description     VARCHAR(300),
  is_whole_of_project BOOLEAN NOT NULL DEFAULT false,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_work_scopes_updated_at
  BEFORE UPDATE ON work_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. WORKSITE SCOPES
-- ============================================================

CREATE TABLE worksite_scopes (
  id              SERIAL PRIMARY KEY,
  worksite_id     INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  scope_id        INT NOT NULL REFERENCES work_scopes(scope_id) ON DELETE CASCADE,
  employer_id     INT REFERENCES employers(employer_id),
  engagement_type VARCHAR(30) CHECK (engagement_type IN (
    'direct_employment', 'contractor', 'subcontractor', 'labour_hire'
  )),
  is_current      BOOLEAN NOT NULL DEFAULT true,
  start_date      DATE,
  end_date        DATE,
  notes           TEXT,
  UNIQUE(worksite_id, scope_id, employer_id)
);

-- ============================================================
-- 3. EMPLOYER SCOPES
-- ============================================================

CREATE TABLE employer_scopes (
  id           SERIAL PRIMARY KEY,
  employer_id  INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  scope_id     INT NOT NULL REFERENCES work_scopes(scope_id) ON DELETE CASCADE,
  is_current   BOOLEAN NOT NULL DEFAULT true,
  source       VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  UNIQUE(employer_id, scope_id)
);

-- ============================================================
-- 4. AGREEMENT SCOPES
-- ============================================================

CREATE TABLE agreement_scopes (
  id            SERIAL PRIMARY KEY,
  agreement_id  INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  scope_id      INT NOT NULL REFERENCES work_scopes(scope_id) ON DELETE CASCADE,
  UNIQUE(agreement_id, scope_id)
);

-- ============================================================
-- 5. AUTO-PROPAGATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION propagate_employer_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.employer_id IS NOT NULL THEN
    INSERT INTO employer_scopes (employer_id, scope_id, is_current, source)
    VALUES (NEW.employer_id, NEW.scope_id, true, 'auto')
    ON CONFLICT (employer_id, scope_id) DO UPDATE
    SET is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worksite_scope_propagate
  AFTER INSERT OR UPDATE ON worksite_scopes
  FOR EACH ROW EXECUTE FUNCTION propagate_employer_scope();

-- ============================================================
-- 6. NARROW employer_worksite_roles.role_type
-- ============================================================
-- Keep only contractual/relationship roles.
-- Work-type roles (Catering, Maintenance, etc.) move to worksite_scopes.

-- First, migrate existing work-type role_type values to 'Other'
-- so the narrowed CHECK constraint does not reject existing rows.
UPDATE employer_worksite_roles
SET role_type = 'Other'
WHERE role_type IN (
  'Catering', 'Maintenance', 'Drilling', 'ROV',
  'Inspection', 'Transport', 'Decommissioning', 'Aviation'
);

ALTER TABLE employer_worksite_roles
  DROP CONSTRAINT IF EXISTS employer_worksite_roles_role_type_check;

ALTER TABLE employer_worksite_roles
  ADD CONSTRAINT employer_worksite_roles_role_type_check
  CHECK (role_type IN (
    'Owner', 'Operator', 'Principal_Contractor',
    'Subcontractor', 'Labour_Hire', 'Other'
  ));

-- Similarly narrow project_employers.role_type
UPDATE project_employers
SET role_type = 'Other'
WHERE role_type IN (
  'Catering', 'Maintenance', 'Drilling', 'ROV',
  'Inspection', 'Transport', 'Decommissioning', 'Aviation'
);

ALTER TABLE project_employers
  DROP CONSTRAINT IF EXISTS project_employers_role_type_check;

ALTER TABLE project_employers
  ADD CONSTRAINT project_employers_role_type_check
  CHECK (role_type IN (
    'Owner', 'Operator', 'Principal_Contractor',
    'Subcontractor', 'Labour_Hire', 'Other'
  ));

-- ============================================================
-- 7. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_work_scopes_parent ON work_scopes(parent_scope_id);
CREATE INDEX IF NOT EXISTS idx_work_scopes_active ON work_scopes(is_active);

CREATE INDEX IF NOT EXISTS idx_worksite_scopes_worksite  ON worksite_scopes(worksite_id);
CREATE INDEX IF NOT EXISTS idx_worksite_scopes_scope     ON worksite_scopes(scope_id);
CREATE INDEX IF NOT EXISTS idx_worksite_scopes_employer  ON worksite_scopes(employer_id);
CREATE INDEX IF NOT EXISTS idx_worksite_scopes_current   ON worksite_scopes(is_current);

CREATE INDEX IF NOT EXISTS idx_employer_scopes_employer  ON employer_scopes(employer_id);
CREATE INDEX IF NOT EXISTS idx_employer_scopes_scope     ON employer_scopes(scope_id);

CREATE INDEX IF NOT EXISTS idx_agreement_scopes_agreement ON agreement_scopes(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_scopes_scope     ON agreement_scopes(scope_id);

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE work_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksite_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_scopes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'work_scopes', 'worksite_scopes', 'employer_scopes', 'agreement_scopes'
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
-- 9. SEED WORK SCOPES HIERARCHY
-- ============================================================

DO $$
DECLARE
  v_brownfields INT;
  v_maintenance INT;
  v_service INT;
  v_specialist INT;
  v_marine INT;
BEGIN
  -- Top level: Brownfields
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Brownfields', NULL, 'Brownfields operations on existing production facilities', 1)
  RETURNING scope_id INTO v_brownfields;

  -- Brownfields > Maintenance
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Maintenance', v_brownfields, 'Brownfields maintenance work', 1)
  RETURNING scope_id INTO v_maintenance;

  -- Maintenance children
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, is_whole_of_project, sort_order)
  VALUES ('Whole of Project', v_maintenance, 'Complete maintenance scope covering all disciplines', true, 0);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Operations', v_maintenance, 'Facility operations and production work', 1);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Electrical', v_maintenance, 'Electrical maintenance and instrumentation', 2);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Mechanical', v_maintenance, 'Mechanical maintenance and rotating equipment', 3);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('PFP', v_maintenance, 'Passive Fire Prevention — painting, scaffolding, insulation', 4);

  -- Brownfields > Service
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Service', v_brownfields, 'Brownfields service provision', 2)
  RETURNING scope_id INTO v_service;

  -- Service children
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, is_whole_of_project, sort_order)
  VALUES ('Whole of Project', v_service, 'Complete service scope covering all disciplines', true, 0);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Logistics', v_service, 'Supply chain and logistics services', 1);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Catering', v_service, 'Catering and hospitality services', 2);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Security', v_service, 'Site security services', 3);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Emergency Response', v_service, 'Emergency response and rescue services', 4);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Facility Management', v_service, 'Facility management and camp services', 5);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Inspectors / NDT', v_service, 'Non-destructive testing and inspection services', 6);

  -- Top level: Specialist
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Specialist', NULL, 'Specialist services operating across worksites and lifecycle stages', 2)
  RETURNING scope_id INTO v_specialist;

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('ROV', v_specialist, 'Remotely operated vehicle subsea services', 1);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Helicopter Transport', v_specialist, 'Helicopter transport and aviation services', 2);

  -- Specialist > Marine
  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Marine', v_specialist, 'Marine vessel services', 3)
  RETURNING scope_id INTO v_marine;

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Generic', v_marine, 'General marine services', 1);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Accommodation Vessels', v_marine, 'Floatel and accommodation vessel services', 2);

  INSERT INTO work_scopes (scope_name, parent_scope_id, description, sort_order)
  VALUES ('Supply Vessels', v_marine, 'Platform supply and anchor handling vessel services', 3);
END $$;
