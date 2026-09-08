-- ============================================================
-- Programs: multi-worksite grouping entity ("top-level projects")
-- ============================================================
-- Purpose:
-- - The existing `projects` table is site-level (`projects.worksite_id`).
-- - This adds a higher-level grouping that can contain multiple worksites.
--
-- Key tables:
-- - programs: the multi-worksite grouping
-- - program_worksites: junction linking worksites into programs
-- ============================================================

-- 1. programs
CREATE TABLE programs (
  program_id            SERIAL PRIMARY KEY,
  program_name          VARCHAR(200) NOT NULL,
  description           TEXT,
  principal_employer_id INT REFERENCES employers(employer_id),
  program_status        VARCHAR(30) NOT NULL DEFAULT 'planning'
    CHECK (program_status IN ('planning', 'active', 'completed', 'on_hold', 'cancelled')),
  start_date            DATE,
  expected_end_date     DATE,
  actual_end_date       DATE,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_programs_principal_employer ON programs(principal_employer_id);
CREATE INDEX IF NOT EXISTS idx_programs_status            ON programs(program_status);
CREATE INDEX IF NOT EXISTS idx_programs_active            ON programs(is_active);

COMMENT ON TABLE programs IS
  'Multi-worksite grouping entity (top-level project/program). Keeps site-level projects in the `projects` table.';

-- 2. program_worksites
CREATE TABLE program_worksites (
  id          SERIAL PRIMARY KEY,
  program_id  INT NOT NULL REFERENCES programs(program_id) ON DELETE CASCADE,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  is_current  BOOLEAN NOT NULL DEFAULT true,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  start_date  DATE,
  end_date    DATE,
  notes       TEXT,
  UNIQUE(program_id, worksite_id)
);

CREATE INDEX IF NOT EXISTS idx_program_worksites_program  ON program_worksites(program_id);
CREATE INDEX IF NOT EXISTS idx_program_worksites_worksite ON program_worksites(worksite_id);
CREATE INDEX IF NOT EXISTS idx_program_worksites_current  ON program_worksites(is_current);

COMMENT ON TABLE program_worksites IS
  'Junction linking worksites into multi-worksite programs (top-level projects).';

-- 3. RLS (align with core tables)
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_worksites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read programs"
  ON programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert programs"
  ON programs FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update programs"
  ON programs FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete programs"
  ON programs FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Authenticated users can read program_worksites"
  ON program_worksites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert program_worksites"
  ON program_worksites FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update program_worksites"
  ON program_worksites FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete program_worksites"
  ON program_worksites FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

