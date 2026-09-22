-- ---------------------------------------------------------------------------------------------
-- DA0.5 -- script 10: record the migration-ledger row for the mobilisation radar.
--
-- Plan: docs/data-architecture/wp/da0.5.md §3.3 (production) and §3.4 (clone).
-- Migration whose row this is: supabase/migrations/20260922040000_mobilisation_radar.sql
-- (merged to main at afc3eed8; app code under apps/organising-db/src/lib/mobilisation/).
--
-- WHY: the sixteen tables the file creates are LIVE in production and hold data, but
-- supabase_migrations.schema_migrations has no row for version 20260922040000 (plan §1.11,
-- PROGRESS.md D15 finding). The DDL in the file has been proven object-by-object against
-- production's pg_catalog (00_catalog_check.sql; 377 objects, 0 differences), so the schema is
-- already correct and only the LEDGER is untruthful. This script writes that one row and nothing
-- else. It changes no table, column, policy, trigger, function, grant or data row.
--
-- WHAT IT DOES NOT DO: it does not run the migration. On production the objects exist already and
-- the file is NOT re-runnable as-is: its 27 CREATE POLICY statements have no IF NOT EXISTS and no
-- OR REPLACE, so a replay aborts with 42710 at the first of them. (The 8 CREATE TRIGGER statements
-- are each preceded by DROP TRIGGER IF EXISTS and ARE idempotent; so are the CREATE TABLE and
-- CREATE INDEX statements. See the plan's §3.2 idempotency table.) On a database that LACKS the
-- tables (the 12 September clone), the migration file itself is applied as its own submission
-- FIRST -- as one BEGIN; ... COMMIT; submission through the SQL editor or execute_sql, NEVER
-- through the connector's apply_migration, which would itself write a 20260922040000 ledger row
-- (with statements) and make this script's precondition (a) STOP -- and this script records the
-- row afterwards, in a second submission. See README.md, run order.
--
-- WHERE IT RUNS: production (operator, Phase 0 run-sheet order DA0.2 -> DA0.5 -> DA0.3) and the
-- clone (agent, under the operator's per-file approval, after the migration submission).
-- Run as postgres, without RLS, in the SQL editor. NEVER `supabase db push`, NEVER the connector's
-- apply_migration on production.
--
-- A production operator must add   SET LOCAL oux.env = 'production';   immediately after BEGIN in
-- this same submission. The committed file omits that line and names no project.
--
-- NOT idempotent by design: a second run stops at the preconditions (the row is already there).
-- Rollback: 90_remove_ledger_row.sql.
--
-- The SQL editor returns only the LAST statement's result set per submission, so the read-only
-- verification SELECT sits after COMMIT; -- submit the whole file as one submission and paste what
-- it prints into da0.5.md §11 (Run sheet record).
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
  v_tables    integer;
  v_policies  integer;
  v_triggers  integer;
  v_missing   text;
BEGIN
  -- (a) The ledger must NOT already carry the row. A second run stops here.
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922040000') THEN
    RAISE EXCEPTION
      '10 STOP: supabase_migrations.schema_migrations already has version 20260922040000 -- nothing to do';
  END IF;

  -- (b) All sixteen tables of the migration must exist here. If they do not, this database has not
  --     had 20260922040000 applied: apply the migration file as its own submission first (README).
  SELECT count(*) FILTER (WHERE to_regclass('public.' || t) IS NOT NULL),
         string_agg(t, ', ' ORDER BY t) FILTER (WHERE to_regclass('public.' || t) IS NULL)
    INTO v_tables, v_missing
  FROM unnest(ARRAY[
    'vessels', 'geofences', 'mobilisation_watch_contractors', 'mobilisation_watch_vessels',
    'mobilisation_watch_keywords', 'mobilisation_sources', 'mobilisation_rules',
    'mobilisation_signals', 'mobilisation_alerts', 'mobilisation_alert_signals',
    'mobilisation_alert_events', 'mobilisation_notifications', 'mobilisation_prefs',
    'mobilisation_push_subscriptions', 'mobilisation_positions', 'mobilisation_settings'
  ]) AS t;

  IF v_tables <> 16 THEN
    RAISE EXCEPTION
      '10 STOP: % of 16 mobilisation-radar tables present (missing: %). Apply 20260922040000_mobilisation_radar.sql first (see README.md).',
      v_tables, coalesce(v_missing, '-');
  END IF;

  -- (c) The rest of the migration must be applied too, not just the tables: 27 policies,
  --     8 triggers and the audit function. This is what makes the ledger row truthful.
  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (ARRAY[
      'vessels', 'geofences', 'mobilisation_watch_contractors', 'mobilisation_watch_vessels',
      'mobilisation_watch_keywords', 'mobilisation_sources', 'mobilisation_rules',
      'mobilisation_signals', 'mobilisation_alerts', 'mobilisation_alert_signals',
      'mobilisation_alert_events', 'mobilisation_notifications', 'mobilisation_prefs',
      'mobilisation_push_subscriptions', 'mobilisation_positions', 'mobilisation_settings'
    ]);
  IF v_policies <> 27 THEN
    RAISE EXCEPTION '10 STOP: expected 27 mobilisation RLS policies, found %', v_policies;
  END IF;

  SELECT count(*) INTO v_triggers
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE NOT t.tgisinternal
    AND t.tgname IN ('trg_vessels_updated_at', 'trg_geofences_updated_at',
                     'trg_mob_watch_contractors_updated_at', 'trg_mob_rules_updated_at',
                     'trg_mob_alerts_updated_at', 'trg_mob_prefs_updated_at',
                     'trg_mob_settings_updated_at', 'trg_mobilisation_alert_audit');
  IF v_triggers <> 8 THEN
    RAISE EXCEPTION '10 STOP: expected 8 mobilisation triggers, found %', v_triggers;
  END IF;

  IF to_regprocedure('public.mobilisation_alert_audit()') IS NULL THEN
    RAISE EXCEPTION '10 STOP: public.mobilisation_alert_audit() is missing';
  END IF;

  -- (d) The ledger must be a real ledger, not an empty one: the baseline row must be there. (This
  --     is a sanity check on the target database, NOT a claim that the ledger has no gaps -- the
  --     12 September clone legitimately lacks 20260914090000, 20260914090100, 20260918120000 and
  --     20260921030000, and 20260922040000 depends on none of them: plan §3.4.)
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908050000') THEN
    RAISE EXCEPTION '10 STOP: the baseline row 20260908050000 is missing from the ledger';
  END IF;

  -- (e) The audit trail must exist: every mutating step logs what it changed
  --     (ORCHESTRATION_PROMPT.md:106). Precedent: oux-wp3.8/10_campaign64_family.sql:68-69.
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '10 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
END;
$preconditions$;

-- The change: one row, the same shape the WP3.8 run sheet used for 20260917100000
-- (version + name; statements left NULL because the statements are not being replayed).
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260922040000', 'mobilisation_radar');

-- Audit trail (WP0.4 shape: oux-wp0.4/00_create_hygiene_log.sql:31-42). Precondition (e) has
-- already proved the table exists, so this write is unconditional. The ledger row is the only
-- thing changed.
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
VALUES (
  '10_record_ledger_row',
  'insert',
  'supabase_migrations.schema_migrations',
  jsonb_build_object('version', '20260922040000'),
  NULL,
  jsonb_build_object('version', '20260922040000', 'name', 'mobilisation_radar'),
  'DA0.5: ledger row for supabase/migrations/20260922040000_mobilisation_radar.sql, whose sixteen '
  || 'tables were applied outside the ledger. Schema proven identical to the file by '
  || '00_catalog_check.sql. No schema or data object was changed by this script.'
);

DO $post_assertions$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260922040000';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '10 STOP: expected exactly 1 ledger row for 20260922040000, found %', v_rows;
  END IF;

  -- The row must be the one this script wrote, with its name and no replayed statements.
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260922040000'
      AND name = 'mobilisation_radar'
      AND coalesce(array_length(statements, 1), 0) = 0
  ) THEN
    RAISE EXCEPTION
      '10 STOP: the 20260922040000 row is not the (version, name) row this script writes';
  END IF;

  -- There is deliberately NO assertion that 20260922040000 is the NEWEST ledger version. A
  -- migration stamped later than 20260922040000 may legitimately have reached this database
  -- first, and such a run is still correct; asserting `max(version) = '20260922040000'` would
  -- abort it. The two assertions above are what actually matters: the row exists exactly once
  -- and is the (version, name) row this script writes. The appended verification SELECT reports
  -- ledger_max_version so a reader can see the ordering without the script failing on it.
END;
$post_assertions$;

COMMIT;

-- ============ VERIFICATION (read-only; paste this output into da0.5.md §11) ============
-- Expected on production: ledger_row_present = t, ledger_name = 'mobilisation_radar',
-- ledger_rows = 17, tables_present = 16, policies = 27, triggers = 8,
-- audit_function_present = t, log_rows_written = 1.
-- Expected on the 12 September clone after the migration submission + this file: the same, with
-- ledger_rows = 13.
-- ledger_max_version is reported, not asserted: it is '20260922040000' on both projects today,
-- but a later-stamped migration arriving first would legitimately make it higher.
SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                WHERE version = '20260922040000')                            AS ledger_row_present,
       (SELECT name FROM supabase_migrations.schema_migrations
         WHERE version = '20260922040000')                                   AS ledger_name,
       (SELECT max(version) FROM supabase_migrations.schema_migrations)      AS ledger_max_version,
       (SELECT count(*) FROM supabase_migrations.schema_migrations)          AS ledger_rows,
       (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         WHERE c.relkind = 'r' AND c.relname = ANY (ARRAY[
           'vessels', 'geofences', 'mobilisation_watch_contractors', 'mobilisation_watch_vessels',
           'mobilisation_watch_keywords', 'mobilisation_sources', 'mobilisation_rules',
           'mobilisation_signals', 'mobilisation_alerts', 'mobilisation_alert_signals',
           'mobilisation_alert_events', 'mobilisation_notifications', 'mobilisation_prefs',
           'mobilisation_push_subscriptions', 'mobilisation_positions', 'mobilisation_settings'
         ]))                                                                 AS tables_present,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND policyname LIKE 'mobilisation %')    AS policies,
       (SELECT count(*) FROM pg_trigger t
         WHERE NOT t.tgisinternal AND t.tgname IN (
           'trg_vessels_updated_at', 'trg_geofences_updated_at',
           'trg_mob_watch_contractors_updated_at', 'trg_mob_rules_updated_at',
           'trg_mob_alerts_updated_at', 'trg_mob_prefs_updated_at',
           'trg_mob_settings_updated_at', 'trg_mobilisation_alert_audit'))    AS triggers,
       (to_regprocedure('public.mobilisation_alert_audit()') IS NOT NULL)     AS audit_function_present,
       (SELECT count(*) FROM public._oux_hygiene_log
         WHERE script = '10_record_ledger_row'
           AND row_pk = jsonb_build_object('version', '20260922040000')
           AND rolled_back_at IS NULL)                                        AS log_rows_written;
