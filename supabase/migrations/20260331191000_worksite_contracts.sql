-- ============================================================
-- Worksite contracts: canonical bridge (worksite ↔ scope ↔ contractor ↔ agreement)
-- ============================================================
-- Purpose:
-- - The current UI treats Agreements / Employers / Work Scopes / Projects as separate tabs.
-- - The current schema has partial linkages, but no canonical entity representing
--   “Employer X performs Scope Y at Worksite Z (within Program P / Site Project SP)
--    under Agreement A”.
--
-- This migration introduces `worksite_contracts` as that bridge.
-- ============================================================

CREATE TABLE worksite_contracts (
  contract_id            SERIAL PRIMARY KEY,
  worksite_id            INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  program_id             INT REFERENCES programs(program_id) ON DELETE SET NULL,
  project_id             INT REFERENCES projects(project_id) ON DELETE SET NULL,
  scope_id               INT NOT NULL REFERENCES work_scopes(scope_id),
  contractor_employer_id INT NOT NULL REFERENCES employers(employer_id),
  agreement_id           INT REFERENCES agreements(agreement_id) ON DELETE SET NULL,
  engagement_type        VARCHAR(30) CHECK (engagement_type IN (
    'direct_employment', 'contractor', 'subcontractor', 'labour_hire'
  )),
  is_current             BOOLEAN NOT NULL DEFAULT true,
  start_date             DATE,
  end_date               DATE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_worksite_contracts_updated_at
  BEFORE UPDATE ON worksite_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Prevent duplicate “current” contract rows for the same combination.
-- (Uses COALESCE because NULLs are not equal in unique indexes.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_worksite_contracts_current_combo
  ON worksite_contracts (
    worksite_id,
    scope_id,
    contractor_employer_id,
    COALESCE(project_id, -1),
    COALESCE(program_id, -1)
  )
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_worksite_contracts_worksite   ON worksite_contracts(worksite_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_program    ON worksite_contracts(program_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_project    ON worksite_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_scope      ON worksite_contracts(scope_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_contractor ON worksite_contracts(contractor_employer_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_agreement  ON worksite_contracts(agreement_id);
CREATE INDEX IF NOT EXISTS idx_worksite_contracts_current    ON worksite_contracts(is_current);

COMMENT ON TABLE worksite_contracts IS
  'Canonical bridge: contractor employer performs a work scope at a worksite (optionally within a program and/or site-level project), optionally under a specific agreement.';

-- Integrity: if contract.project_id is set, it must be a project on the same worksite.
CREATE OR REPLACE FUNCTION validate_worksite_contract_project_worksite()
RETURNS TRIGGER AS $$
DECLARE
  v_project_worksite_id INT;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.worksite_id
      INTO v_project_worksite_id
    FROM projects p
    WHERE p.project_id = NEW.project_id;

    IF v_project_worksite_id IS NULL THEN
      RAISE EXCEPTION 'Invalid project_id: %', NEW.project_id;
    END IF;

    IF v_project_worksite_id <> NEW.worksite_id THEN
      RAISE EXCEPTION
        'worksite_contracts.worksite_id (%) must match projects.worksite_id (%) for project_id (%)',
        NEW.worksite_id, v_project_worksite_id, NEW.project_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_worksite_contract_project_worksite
  BEFORE INSERT OR UPDATE ON worksite_contracts
  FOR EACH ROW EXECUTE FUNCTION validate_worksite_contract_project_worksite();

-- RLS (align with core tables)
ALTER TABLE worksite_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worksite_contracts"
  ON worksite_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert worksite_contracts"
  ON worksite_contracts FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update worksite_contracts"
  ON worksite_contracts FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete worksite_contracts"
  ON worksite_contracts FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

