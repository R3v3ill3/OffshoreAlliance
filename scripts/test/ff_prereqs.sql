-- ============================================================================
-- SCRATCH-DB PREREQUISITES for the ROV Fighting Fund tests.
-- NOT a migration. This stands in for objects that already exist in the real
-- Offshore Alliance database so the two fund migrations can be applied verbatim
-- against a throwaway database. Do NOT run against any real database.
-- ============================================================================

-- Supabase-managed roles that exist in the real database (needed for the RLS
-- policy GRANTs). Created NOLOGIN just for the scratch run.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END $$;

-- Minimal stand-ins for the real core tables (same PK name & type: SERIAL/INT).
CREATE TABLE IF NOT EXISTS employers (
    employer_id   SERIAL PRIMARY KEY,
    employer_name VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
    worker_id  SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL DEFAULT 'Test',
    last_name  VARCHAR(100) NOT NULL DEFAULT 'Worker'
);

-- Stand-in for the RLS helper defined in 0002_rls_policies.sql. Only needs to
-- exist for CREATE POLICY name resolution; tests run as superuser (RLS bypassed).
CREATE OR REPLACE FUNCTION get_user_role() RETURNS TEXT AS $$
    SELECT 'admin'::text;
$$ LANGUAGE sql STABLE;

-- A pool of members and a couple of employers to reference.
INSERT INTO employers (employer_name) VALUES ('DOF'), ('TMT'), ('Programmed'), ('Fugro');
INSERT INTO workers (first_name, last_name)
SELECT 'Member', 'No' || g FROM generate_series(1, 20) g;
