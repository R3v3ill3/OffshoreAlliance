-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 00: create the audit table public._oux_hygiene_log
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- Run as postgres (Supabase SQL editor for the target project, or psql with ON_ERROR_STOP). One file at a time.
-- Idempotent: safe to re-run (IF NOT EXISTS; REVOKE / ENABLE RLS are repeatable; no data is written).
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 2.3
-- ---------------------------------------------------------------------------------------------

-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============

-- Expected on first run: NULL (table does not exist yet). On a re-run: 'public._oux_hygiene_log'.
SELECT to_regclass('public._oux_hygiene_log') AS hygiene_log_exists_before;

-- ============ CHANGE ============
BEGIN;

CREATE TABLE IF NOT EXISTS public._oux_hygiene_log (
  log_id         bigserial   PRIMARY KEY,
  script         text        NOT NULL,   -- '01_role_conversion' | '02_backfill_campaign_organisers' | '03_resolve_duplicate_placements'
  action         text        NOT NULL CHECK (action IN ('update','insert','delete')),
  table_name     text        NOT NULL,
  row_pk         jsonb       NOT NULL,   -- identifying key of the affected row
  before_row     jsonb,                  -- NULL for inserts
  after_row      jsonb,                  -- NULL for deletes
  note           text,
  logged_at      timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz             -- set by the matching *_rollback.sql; makes rollback idempotent
);

COMMENT ON TABLE public._oux_hygiene_log IS
  'Organiser UX WP0.4 data-hygiene audit trail. Every row changed by scripts 01-03 with its prior value. '
  'The *_rollback.sql scripts read this table; dropping it makes the rollbacks unusable. '
  'May be dropped (99_drop_hygiene_log.sql) once WP1.6 is on production, phase 1 exit is signed off, '
  'and at least 30 days have passed since the last script run.';

-- Public-schema tables and sequences inherit GRANT ALL to anon and authenticated
-- (baseline_schema.sql:33373-33376 for sequences, :33393-33396 for tables). This table holds user_ids; lock it down.
REVOKE ALL ON public._oux_hygiene_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public._oux_hygiene_log_log_id_seq FROM anon, authenticated;

-- Enabled, no policies = deny all for RLS-bound roles; postgres (owner) and service_role bypass.
-- Enabled deliberately so this table does not join the RLS-disabled _archive_* tables in the security advisory (G.7).
ALTER TABLE public._oux_hygiene_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============ POST-CHECK (read-only) ============

-- Expected: 'public._oux_hygiene_log'
SELECT to_regclass('public._oux_hygiene_log') AS hygiene_log_exists_after;

-- Expected: t
SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public._oux_hygiene_log'::regclass;

-- Expected: f, f, f, f  (neither anon nor authenticated can read the table or use its sequence)
SELECT has_table_privilege('authenticated', 'public._oux_hygiene_log', 'SELECT')                 AS authenticated_can_select,
       has_table_privilege('anon',          'public._oux_hygiene_log', 'SELECT')                 AS anon_can_select,
       has_sequence_privilege('authenticated', 'public._oux_hygiene_log_log_id_seq', 'USAGE')    AS authenticated_can_use_seq,
       has_sequence_privilege('anon',          'public._oux_hygiene_log_log_id_seq', 'USAGE')    AS anon_can_use_seq;

-- Expected: 0 rows of policies (deny-all by construction)
SELECT count(*) AS policies_on_log
FROM pg_policies
WHERE schemaname = 'public' AND tablename = '_oux_hygiene_log';

-- Expected: 0 on first run (empty audit trail). On a re-run: whatever scripts 01-03 have logged so far.
SELECT count(*) AS log_rows FROM public._oux_hygiene_log;

-- Rollback: none needed for an empty table. To remove the table per the retention rule, run 99_drop_hygiene_log.sql.
