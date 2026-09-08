-- ============================================================
-- Migration 00006: Principal Employer & Parent Company
-- ============================================================

-- 1. Expand employer_category CHECK constraint to include Principal_Employer
ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_employer_category_check;
ALTER TABLE employers
  ADD CONSTRAINT employers_employer_category_check
  CHECK (employer_category IN (
    'Producer','Major_Contractor','Subcontractor','Labour_Hire','Specialist','Principal_Employer'
  ));

-- 2. Add parent_employer_id — self-referential FK
--    The existing parent_company (VARCHAR) column is retained for legacy reference.
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS parent_employer_id INT REFERENCES employers(employer_id);

-- 3. Add principal_employer_id FK to worksites
ALTER TABLE worksites
  ADD COLUMN IF NOT EXISTS principal_employer_id INT REFERENCES employers(employer_id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_employers_parent_employer ON employers(parent_employer_id);
CREATE INDEX IF NOT EXISTS idx_employers_category        ON employers(employer_category);
CREATE INDEX IF NOT EXISTS idx_worksites_principal_emp   ON worksites(principal_employer_id);

-- 5. RLS policies for the new columns inherit from existing table policies.
--    No additional policies needed; new columns are covered by existing row-level rules.

-- 6. Seed Shell, Woodside, Inpex, Chevron as Principal Employers
--    Insert if not present; update category if they already exist.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['Shell', 'Woodside', 'Inpex', 'Chevron'] LOOP
    IF NOT EXISTS (SELECT 1 FROM employers WHERE employer_name = v_name) THEN
      INSERT INTO employers (employer_name, employer_category, is_active)
      VALUES (v_name, 'Principal_Employer', true);
    ELSE
      UPDATE employers
      SET employer_category = 'Principal_Employer',
          updated_at        = now()
      WHERE employer_name = v_name;
    END IF;
  END LOOP;
END;
$$;
