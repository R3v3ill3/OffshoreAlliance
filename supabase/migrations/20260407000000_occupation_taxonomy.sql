-- ============================================================
-- Occupation Taxonomy: groups, specialisations, worker junctions
-- ============================================================

-- 1. Occupation groups (top-level taxonomy)
CREATE TABLE occupation_groups (
  group_id       SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL UNIQUE,
  display_order  INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE occupation_groups IS
  'Top-level occupation groupings (e.g. Welding and Fabrication, Mechanical, Marine).';

-- 2. Link occupations to groups (add FK, keep category for backwards compat)
ALTER TABLE occupations
  ADD COLUMN occupation_group_id INT REFERENCES occupation_groups(group_id);

CREATE INDEX idx_occupations_group ON occupations(occupation_group_id);

-- 3. Specialisations (cross-cutting qualifications like Rope Access, HV)
CREATE TABLE specialisations (
  specialisation_id  SERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL UNIQUE,
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE specialisations IS
  'Cross-cutting qualifications that can apply to any occupation (e.g. Rope Access, HV, Subsea).';

-- 4. Worker additional occupations (for dual-trade workers)
CREATE TABLE worker_additional_occupations (
  worker_id      INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  occupation_id  INT NOT NULL REFERENCES occupations(occupation_id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, occupation_id)
);

CREATE INDEX idx_wao_occupation ON worker_additional_occupations(occupation_id);

COMMENT ON TABLE worker_additional_occupations IS
  'Secondary occupations for workers who hold multiple trades (e.g. Boilermaker/Welder).';

-- 5. Worker specialisations
CREATE TABLE worker_specialisations (
  worker_id          INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  specialisation_id  INT NOT NULL REFERENCES specialisations(specialisation_id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, specialisation_id)
);

CREATE INDEX idx_ws_specialisation ON worker_specialisations(specialisation_id);

COMMENT ON TABLE worker_specialisations IS
  'Cross-cutting specialisations held by a worker (e.g. Rope Access L3, HV).';

-- ============================================================
-- RLS policies
-- ============================================================

-- occupation_groups
ALTER TABLE occupation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read occupation_groups"
  ON occupation_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert occupation_groups"
  ON occupation_groups FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update occupation_groups"
  ON occupation_groups FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete occupation_groups"
  ON occupation_groups FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- specialisations
ALTER TABLE specialisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read specialisations"
  ON specialisations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert specialisations"
  ON specialisations FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update specialisations"
  ON specialisations FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete specialisations"
  ON specialisations FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- worker_additional_occupations
ALTER TABLE worker_additional_occupations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worker_additional_occupations"
  ON worker_additional_occupations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert worker_additional_occupations"
  ON worker_additional_occupations FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update worker_additional_occupations"
  ON worker_additional_occupations FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete worker_additional_occupations"
  ON worker_additional_occupations FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'user'));

-- worker_specialisations
ALTER TABLE worker_specialisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worker_specialisations"
  ON worker_specialisations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert worker_specialisations"
  ON worker_specialisations FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update worker_specialisations"
  ON worker_specialisations FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete worker_specialisations"
  ON worker_specialisations FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'user'));
