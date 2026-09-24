-- ---------------------------------------------------------------------------------------------
-- DA0.5 -- script 91: rollback of 12_record_later_ledger_rows.sql (recovery only).
-- Deletes the two ledger rows 12 wrote, logs the deletions and stamps 12's log rows rolled_back_at.
-- Precondition = exactly the state 12 leaves (both rows present, no statements array).
-- A production operator must add SET LOCAL oux.env = 'production'; after BEGIN.
-- WARNING: a database left in this state is one supabase db push would try to replay both files
-- against; the recipients file errors at its first CREATE POLICY. Do not leave one there.
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
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
  WHERE (version, name) IN (('20260923220000', 'mobilisation_recipients'), ('20260924010000', 'mobilisation_signal_schedule'))
    AND coalesce(array_length(statements, 1), 0) = 0;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '91 STOP: expected exactly the two (version, name) rows 12 writes with no statements, found % -- stop and report', v_n;
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '91 STOP: public._oux_hygiene_log is missing';
  END IF;
END;
$preconditions$;

WITH gone AS (
  DELETE FROM supabase_migrations.schema_migrations AS sm
  WHERE sm.version IN ('20260923220000', '20260924010000')
  RETURNING to_jsonb(sm.*) AS row, sm.version
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '91_remove_later_ledger_rows', 'delete', 'supabase_migrations.schema_migrations',
       jsonb_build_object('version', version), row, NULL::jsonb,
       'DA0.5: 12_record_later_ledger_rows reversed -- ledger row removed'
FROM gone;

UPDATE public._oux_hygiene_log SET rolled_back_at = now()
WHERE script = '12_record_later_ledger_rows' AND rolled_back_at IS NULL;

DO $post_assertions$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20260923220000', '20260924010000')) THEN
    RAISE EXCEPTION '91 STOP: a row is still present';
  END IF;
END;
$post_assertions$;

COMMIT;

SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20260923220000', '20260924010000')) AS rows_present_after,
       (SELECT count(*) FROM supabase_migrations.schema_migrations) AS ledger_rows,
       (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '91_remove_later_ledger_rows') AS rollback_log_rows,
       (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '12_record_later_ledger_rows' AND rolled_back_at IS NOT NULL) AS log_rows_stamped;
