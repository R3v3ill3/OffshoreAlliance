-- ---------------------------------------------------------------------------------------------
-- DA0.5 -- script 90: rollback of 10_record_ledger_row.sql.
--
-- Plan: docs/data-architecture/wp/da0.5.md §3.5.
-- Removes the supabase_migrations.schema_migrations row for version 20260922040000 and stamps the
-- matching 10_record_ledger_row hygiene-log rows rolled_back_at, so a second run is a no-op.
--
-- Its precondition is EXACTLY the state 10 leaves: the row is present, its name is
-- 'mobilisation_radar', it carries no replayed statements, and public._oux_hygiene_log exists.
-- It touches nothing else -- no table, column, policy, trigger, function, grant or data row is
-- dropped or changed, and the sixteen mobilisation-radar tables and their data are untouched.
-- Running it therefore returns the database to the state production was in on 2026-09-22
-- (objects live, ledger silent).
--
-- Run as postgres, one submission, recovery only. A production operator must add
--   SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission. The committed file omits that line and names
-- no project. NEVER `supabase db push`, NEVER the connector's apply_migration on production.
--
-- After this runs, `supabase db push` would once again try to replay
-- 20260922040000_mobilisation_radar.sql against a database that already holds its objects, which
-- ERRORS at the first CREATE POLICY (da0.5.md §3.2). Do not leave a database in this state.
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
BEGIN
  -- Exactly the state 10 leaves.
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922040000') THEN
    RAISE EXCEPTION
      '90 STOP: supabase_migrations.schema_migrations has no row for 20260922040000 -- nothing to roll back';
  END IF;

  -- The row must be the bare (version, name) row 10 wrote, not a real `supabase db push` /
  -- apply_migration record carrying replayed statements. If it has statements, some other tool
  -- applied the migration and removing the row would be a lie in the other direction: stop and
  -- report.
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260922040000'
      AND coalesce(array_length(statements, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION
      '90 STOP: the 20260922040000 ledger row carries statements -- it was not written by 10_record_ledger_row.sql. Stop and report.';
  END IF;

  -- ... and its name must be the one 10 writes. Anything else is not 10's post-state.
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260922040000' AND name = 'mobilisation_radar'
  ) THEN
    RAISE EXCEPTION
      '90 STOP: the 20260922040000 ledger row is named %, not mobilisation_radar -- it was not written by 10_record_ledger_row.sql. Stop and report.',
      coalesce((SELECT quote_nullable(name) FROM supabase_migrations.schema_migrations
                 WHERE version = '20260922040000'), 'NULL');
  END IF;

  -- The audit trail must exist: this script both stamps 10's rows and writes its own
  -- (ORCHESTRATION_PROMPT.md:106; precedent oux-wp3.8/10_campaign64_family.sql:68-69).
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '90 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
END;
$preconditions$;

-- The change, and its audit row in one statement: the row is deleted and RETURNING hands the
-- ACTUAL deleted row to the log as before_row, so the audit records what was really there rather
-- than what this file assumed. Precondition (e) has already proved the log table exists, so the
-- write is unconditional (WP0.4 shape: oux-wp0.4/00_create_hygiene_log.sql:31-42).
WITH removed AS (
  DELETE FROM supabase_migrations.schema_migrations AS sm
  WHERE sm.version = '20260922040000'
  RETURNING to_jsonb(sm.*) AS deleted_row
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '90_remove_ledger_row',
       'delete',
       'supabase_migrations.schema_migrations',
       jsonb_build_object('version', '20260922040000'),
       r.deleted_row,
       NULL::jsonb,
       'DA0.5 rollback of 10_record_ledger_row. The sixteen mobilisation-radar tables and their data '
       || 'are untouched; only the ledger row was removed.'
FROM removed r;

-- Mark the forward run's audit rows rolled back, so a second run of 90 stamps nothing.
UPDATE public._oux_hygiene_log
   SET rolled_back_at = now()
 WHERE script = '10_record_ledger_row'
   AND table_name = 'supabase_migrations.schema_migrations'
   AND row_pk = jsonb_build_object('version', '20260922040000')
   AND rolled_back_at IS NULL;

DO $post_assertions$
DECLARE
  v_tables integer;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922040000') THEN
    RAISE EXCEPTION '90 STOP: the 20260922040000 ledger row is still present after the delete';
  END IF;

  -- The rollback must not have disturbed the schema.
  SELECT count(*) INTO v_tables
  FROM unnest(ARRAY[
    'vessels', 'geofences', 'mobilisation_watch_contractors', 'mobilisation_watch_vessels',
    'mobilisation_watch_keywords', 'mobilisation_sources', 'mobilisation_rules',
    'mobilisation_signals', 'mobilisation_alerts', 'mobilisation_alert_signals',
    'mobilisation_alert_events', 'mobilisation_notifications', 'mobilisation_prefs',
    'mobilisation_push_subscriptions', 'mobilisation_positions', 'mobilisation_settings'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL;
  IF v_tables <> 16 THEN
    RAISE EXCEPTION '90 STOP: % of 16 mobilisation-radar tables present after the rollback', v_tables;
  END IF;
END;
$post_assertions$;

COMMIT;

-- ============ VERIFICATION (read-only; paste this output into da0.5.md §11) ============
-- Expected: ledger_row_present = f, tables_present = 16, log_rows_stamped >= 1 (never 0 -- the
-- hygiene log is a precondition, and 10's row is always stamped), rollback_log_rows >= 1.
SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                WHERE version = '20260922040000')                            AS ledger_row_present,
       (SELECT max(version) FROM supabase_migrations.schema_migrations)      AS ledger_max_version,
       (SELECT count(*) FROM supabase_migrations.schema_migrations)          AS ledger_rows,
       (SELECT count(*) FROM unnest(ARRAY[
           'vessels', 'geofences', 'mobilisation_watch_contractors', 'mobilisation_watch_vessels',
           'mobilisation_watch_keywords', 'mobilisation_sources', 'mobilisation_rules',
           'mobilisation_signals', 'mobilisation_alerts', 'mobilisation_alert_signals',
           'mobilisation_alert_events', 'mobilisation_notifications', 'mobilisation_prefs',
           'mobilisation_push_subscriptions', 'mobilisation_positions', 'mobilisation_settings'
         ]) AS t WHERE to_regclass('public.' || t) IS NOT NULL)              AS tables_present,
       (SELECT count(*) FROM public._oux_hygiene_log
         WHERE script = '10_record_ledger_row'
           AND row_pk = jsonb_build_object('version', '20260922040000')
           AND rolled_back_at IS NOT NULL)                                   AS log_rows_stamped,
       (SELECT count(*) FROM public._oux_hygiene_log
         WHERE script = '90_remove_ledger_row'
           AND row_pk = jsonb_build_object('version', '20260922040000'))     AS rollback_log_rows;
