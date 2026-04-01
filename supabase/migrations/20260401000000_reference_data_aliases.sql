-- ============================================================
-- Reference Data: worksite aliases, canonical occupations, occupation aliases
-- ============================================================

-- 1. Worksite name aliases (mirrors employer_name_aliases)
CREATE TABLE worksite_name_aliases (
  id              SERIAL PRIMARY KEY,
  worksite_id     INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  alias_name      VARCHAR(200) NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('import', 'manual', 'merge')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX worksite_name_aliases_ws_lower_alias
  ON worksite_name_aliases (worksite_id, (lower(trim(alias_name))));

CREATE INDEX idx_worksite_name_aliases_worksite ON worksite_name_aliases(worksite_id);

COMMENT ON TABLE worksite_name_aliases IS
  'Additional recognised names for a worksite (e.g. KGP -> Karratha Gas Plant).';

-- 2. Canonical occupations
CREATE TABLE occupations (
  occupation_id   SERIAL PRIMARY KEY,
  canonical_name  VARCHAR(150) NOT NULL UNIQUE,
  category        VARCHAR(50) CHECK (category IN (
    'Trades', 'Inspection', 'Operations', 'Marine',
    'Catering', 'Management', 'Lifting', 'Aviation',
    'Rope_Access', 'Engineering', 'Administration', 'Other'
  )),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_occupations_updated_at
  BEFORE UPDATE ON occupations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Occupation name aliases
CREATE TABLE occupation_aliases (
  id              SERIAL PRIMARY KEY,
  occupation_id   INT NOT NULL REFERENCES occupations(occupation_id) ON DELETE CASCADE,
  alias_name      VARCHAR(200) NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('import', 'manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX occupation_aliases_occ_lower_alias
  ON occupation_aliases (occupation_id, (lower(trim(alias_name))));

CREATE INDEX idx_occupation_aliases_occupation ON occupation_aliases(occupation_id);

COMMENT ON TABLE occupation_aliases IS
  'Alternative spellings / abbreviations for an occupation (e.g. NDT Tech -> NDT Technician).';

-- 4. FK from workers to canonical occupations (nullable, backwards-compatible)
ALTER TABLE workers
  ADD COLUMN canonical_occupation_id INT REFERENCES occupations(occupation_id);

CREATE INDEX idx_workers_canonical_occupation ON workers(canonical_occupation_id);

-- ============================================================
-- 5. RLS policies
-- ============================================================

-- worksite_name_aliases
ALTER TABLE worksite_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worksite_name_aliases"
  ON worksite_name_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert worksite_name_aliases"
  ON worksite_name_aliases FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update worksite_name_aliases"
  ON worksite_name_aliases FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete worksite_name_aliases"
  ON worksite_name_aliases FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- occupations
ALTER TABLE occupations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read occupations"
  ON occupations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert occupations"
  ON occupations FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update occupations"
  ON occupations FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete occupations"
  ON occupations FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- occupation_aliases
ALTER TABLE occupation_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read occupation_aliases"
  ON occupation_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert occupation_aliases"
  ON occupation_aliases FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update occupation_aliases"
  ON occupation_aliases FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete occupation_aliases"
  ON occupation_aliases FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');
