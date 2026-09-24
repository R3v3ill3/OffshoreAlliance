-- ---------------------------------------------------------------------------------------------
-- DA0.5 -- script 12: record the migration-ledger rows for the two LATER mobilisation migrations.
--
-- Found 2026-09-24 (orchestrator, read-only): main moved after the DA0.5 plan was written and now
-- carries supabase/migrations/20260923220000_mobilisation_recipients.sql (table
-- mobilisation_recipients: 2 policies, 1 trigger, seed of the admin/user profiles, RLS) and
-- supabase/migrations/20260924010000_mobilisation_signal_schedule.sql (mobilisation_signals.arrival_at
-- and ends_at, index idx_mobilisation_signals_arrival). Production already holds every object both
-- files create (checked 2026-09-24: table, both policies by name, trigger, RLS on, 11 seed rows;
-- both columns; the index) and supabase_migrations.schema_migrations has no row for either, the
-- same pattern as 20260922040000. As with 10, the files are NOT replayed here: the recipients
-- file's two CREATE POLICY statements have no IF NOT EXISTS and would fail with 42710, and its
-- seed INSERT would re-add anyone an admin has removed. This script writes the two ledger rows
-- and nothing else.
--
-- WHERE IT RUNS: production (operator, straight after 10). On a database that lacks the objects
-- (the 12 September clone), the two migration files are applied first, each as its own
-- BEGIN; ... COMMIT; submission through the SQL editor or execute_sql, never apply_migration.
-- Run as postgres. A production operator must add   SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission (the prod/ copy has it already).
-- NOT idempotent: a second run stops at the preconditions. Rollback: 91_remove_later_ledger_rows.sql.
-- ---------------------------------------------------------------------------------------------

BEGIN;

-- A production operator must add SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission.
DO $environment_guard$
DECLARE
  v_valid boolean;
BEGIN
  IF to_regclass('public._oux_env_marker') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) = 1 AND bool_and(env IN (''clone'', ''dev'')) FROM public._oux_env_marker'
      INTO v_valid;
    IF v_valid THEN RETURN; END IF;
    RAISE EXCEPTION 'Refusing to run: _oux_env_marker is not a valid clone/dev singleton';
  END IF;
  IF current_setting('oux.env', true) = 'production' THEN RETURN; END IF;
  RAISE EXCEPTION
    'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction';
END;
$environment_guard$;

DO $preconditions$
DECLARE
  v_n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
             WHERE version IN ('20260923220000', '20260924010000')) THEN
    RAISE EXCEPTION '12 STOP: the ledger already has a row for 20260923220000 or 20260924010000 -- nothing to do';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922040000') THEN
    RAISE EXCEPTION '12 STOP: run 10_record_ledger_row.sql first (20260922040000 is not in the ledger)';
  END IF;
  -- 20260923220000: the recipients table with its policies, trigger and RLS.
  IF to_regclass('public.mobilisation_recipients') IS NULL THEN
    RAISE EXCEPTION '12 STOP: public.mobilisation_recipients is missing -- apply 20260923220000_mobilisation_recipients.sql first';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mobilisation_recipients'
    AND policyname IN ('mobilisation read recipients', 'mobilisation admin write recipients');
  IF v_n <> 2 THEN RAISE EXCEPTION '12 STOP: expected the 2 recipients policies, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgrelid = 'public.mobilisation_recipients'::regclass
    AND NOT tgisinternal AND tgname = 'trg_mobilisation_recipients_updated_at';
  IF v_n <> 1 THEN RAISE EXCEPTION '12 STOP: trg_mobilisation_recipients_updated_at is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mobilisation_recipients'::regclass) THEN
    RAISE EXCEPTION '12 STOP: RLS is not enabled on mobilisation_recipients';
  END IF;
  -- 20260924010000: the two signal columns and the partial index.
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.mobilisation_signals'::regclass
    AND attname IN ('arrival_at', 'ends_at') AND NOT attisdropped;
  IF v_n <> 2 THEN RAISE EXCEPTION '12 STOP: mobilisation_signals.arrival_at / ends_at missing (found %)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_mobilisation_signals_arrival') THEN
    RAISE EXCEPTION '12 STOP: idx_mobilisation_signals_arrival is missing';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '12 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
END;
$preconditions$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260923220000', 'mobilisation_recipients'),
       ('20260924010000', 'mobilisation_signal_schedule');

INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
VALUES
  ('12_record_later_ledger_rows', 'insert', 'supabase_migrations.schema_migrations',
   jsonb_build_object('version', '20260923220000'), NULL,
   jsonb_build_object('version', '20260923220000', 'name', 'mobilisation_recipients'),
   'DA0.5: ledger row for 20260923220000_mobilisation_recipients.sql, applied outside the ledger; objects verified present. No schema or data object changed.'),
  ('12_record_later_ledger_rows', 'insert', 'supabase_migrations.schema_migrations',
   jsonb_build_object('version', '20260924010000'), NULL,
   jsonb_build_object('version', '20260924010000', 'name', 'mobilisation_signal_schedule'),
   'DA0.5: ledger row for 20260924010000_mobilisation_signal_schedule.sql, applied outside the ledger; objects verified present. No schema or data object changed.');

DO $post_assertions$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
  WHERE (version, name) IN (('20260923220000', 'mobilisation_recipients'), ('20260924010000', 'mobilisation_signal_schedule'))
    AND coalesce(array_length(statements, 1), 0) = 0;
  IF v_n <> 2 THEN RAISE EXCEPTION '12 STOP: expected the two (version, name) rows this script writes, found %', v_n; END IF;
END;
$post_assertions$;

COMMIT;

-- ============ VERIFICATION (read-only; paste into da0.5.md §11) ============
-- Expected on production after 10 and 12: rows_20260923220000 1, rows_20260924010000 1, ledger_rows 19,
-- recipients_table t, recipients_policies 2, signals_new_columns 2, arrival_index t, log_rows_written 2.
SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260923220000') AS rows_20260923220000,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260924010000') AS rows_20260924010000,
       (SELECT count(*) FROM supabase_migrations.schema_migrations)                                 AS ledger_rows,
       (SELECT max(version) FROM supabase_migrations.schema_migrations)                             AS ledger_max_version,
       to_regclass('public.mobilisation_recipients') IS NOT NULL                                    AS recipients_table,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mobilisation_recipients') AS recipients_policies,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.mobilisation_signals'::regclass
          AND attname IN ('arrival_at', 'ends_at') AND NOT attisdropped)                           AS signals_new_columns,
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_mobilisation_signals_arrival') AS arrival_index,
       (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '12_record_later_ledger_rows' AND rolled_back_at IS NULL) AS log_rows_written;
