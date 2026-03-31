-- ============================================================
-- Worker assignments: attach workers to worksite contracts
-- ============================================================
-- Purpose:
-- - Workers already have a primary employer and worksite fields.
-- - To represent “workers attached to both the asset owner context and the
--   contract employers performing work scopes”, we attach workers to
--   worksite_contracts (scope + contractor + optional agreement/program/project).
--
-- This migration adds:
-- - worker_assignments: worker ↔ worksite_contracts junction with dates/current flag
-- - workers.project_id integrity trigger to ensure project/worksite consistency
-- ============================================================

-- 1) worker_assignments
CREATE TABLE worker_assignments (
  assignment_id SERIAL PRIMARY KEY,
  worker_id     INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  contract_id   INT NOT NULL REFERENCES worksite_contracts(contract_id) ON DELETE CASCADE,
  is_current    BOOLEAN NOT NULL DEFAULT true,
  start_date    DATE,
  end_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id, contract_id)
);

CREATE TRIGGER trg_worker_assignments_updated_at
  BEFORE UPDATE ON worker_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_worker_assignments_worker   ON worker_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_contract ON worker_assignments(contract_id);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_current  ON worker_assignments(is_current);

COMMENT ON TABLE worker_assignments IS
  'Attaches workers to worksite contracts (scope + contractor + optional agreement/program/project).';

-- 2) RLS
ALTER TABLE worker_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worker_assignments"
  ON worker_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert worker_assignments"
  ON worker_assignments FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update worker_assignments"
  ON worker_assignments FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete worker_assignments"
  ON worker_assignments FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- 3) Integrity: ensure workers.project_id matches projects.worksite_id
CREATE OR REPLACE FUNCTION validate_worker_project_worksite()
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

    IF NEW.worksite_id IS NULL THEN
      NEW.worksite_id := v_project_worksite_id;
    ELSIF NEW.worksite_id <> v_project_worksite_id THEN
      RAISE EXCEPTION
        'workers.worksite_id (%) must match projects.worksite_id (%) for project_id (%)',
        NEW.worksite_id, v_project_worksite_id, NEW.project_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_worker_project_worksite ON workers;

CREATE TRIGGER trg_validate_worker_project_worksite
  BEFORE INSERT OR UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION validate_worker_project_worksite();

