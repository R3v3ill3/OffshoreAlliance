-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 92: remove the synthetic e2e-replay rows from DEV (mutating).
--
-- Plan: docs/data-architecture/wp/da0.3.md §3 (row 92), §3.4, risk R13. After each replay of
-- fixtures/replay_status_sync.xlsx through the membership wizard on the dev-backed preview, removes,
-- all logged to public._oux_hygiene_log (script 'da0.3/92'):
--   1. the replay's import_logs rows (file_name = 'replay_status_sync.xlsx') — found first, since
--      everything else hangs off them;
--   2. their name_match_reviews rows;
--   3. the aliases the replay wrote: source = 'import', created_by = the account that ran the replay,
--      created_at >= the first replay import (both alias tables);
--   4. the synthetic workers (reference_id LIKE 'DA03-%' — the only key; they carry no personal data);
--   5. the import_logs rows themselves.
-- Nothing else is touched: real workers' raw columns and real aliases stay.
--
-- Run as postgres, one submission from BEGIN; to the appended SELECT. Dev only (the guard admits
-- clone / dev; no oux.env line is ever added for this file).
-- ---------------------------------------------------------------------------------------------

BEGIN;

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
  RAISE EXCEPTION 'Refusing to run: 92_remove_fixture_workers.sql is dev/clone only (no _oux_env_marker table)';
END;
$environment_guard$;

DO $precondition$
BEGIN
  IF to_regclass('public.name_match_reviews') IS NULL THEN RAISE EXCEPTION 'DA0.3 92 STOP: the DA0.3 objects are absent'; END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN RAISE EXCEPTION 'DA0.3 92 STOP: public._oux_hygiene_log is missing'; END IF;
END;
$precondition$;

CREATE TEMP TABLE _da03_92_imports ON COMMIT DROP AS
SELECT import_id, imported_by, imported_at
  FROM public.import_logs
 WHERE file_name = 'replay_status_sync.xlsx';

DO $remove$
DECLARE
  v_n integer;
  v_since timestamptz := (SELECT min(imported_at) FROM _da03_92_imports);
BEGIN
  -- 2. queue rows of the replay imports
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/92', 'delete', 'name_match_reviews', jsonb_build_object('id', r.id), to_jsonb(r), NULL, 'replay queue row removed by 92'
    FROM public.name_match_reviews r WHERE r.import_id IN (SELECT import_id FROM _da03_92_imports);
  DELETE FROM public.name_match_reviews WHERE import_id IN (SELECT import_id FROM _da03_92_imports);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 92: % review row(s) deleted', v_n;

  -- 3. aliases the replay wrote (auto accepts and the decisions made on the page)
  IF v_since IS NOT NULL THEN
    INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
    SELECT 'da0.3/92', 'delete', 'employer_name_aliases', jsonb_build_object('id', a.id),
           jsonb_build_object('id', a.id, 'employer_id', a.employer_id, 'alias_name', a.alias_name, 'source', a.source), NULL, 'replay alias removed by 92'
      FROM public.employer_name_aliases a
     WHERE a.source = 'import' AND a.created_at >= v_since AND a.created_by IN (SELECT imported_by FROM _da03_92_imports);
    DELETE FROM public.employer_name_aliases
     WHERE source = 'import' AND created_at >= v_since AND created_by IN (SELECT imported_by FROM _da03_92_imports);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'DA0.3 92: % employer alias(es) deleted', v_n;

    INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
    SELECT 'da0.3/92', 'delete', 'worksite_name_aliases', jsonb_build_object('id', a.id),
           jsonb_build_object('id', a.id, 'worksite_id', a.worksite_id, 'alias_name', a.alias_name, 'source', a.source), NULL, 'replay alias removed by 92'
      FROM public.worksite_name_aliases a
     WHERE a.source = 'import' AND a.created_at >= v_since AND a.created_by IN (SELECT imported_by FROM _da03_92_imports);
    DELETE FROM public.worksite_name_aliases
     WHERE source = 'import' AND created_at >= v_since AND created_by IN (SELECT imported_by FROM _da03_92_imports);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'DA0.3 92: % worksite alias(es) deleted', v_n;
  END IF;

  -- 4. synthetic workers
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/92', 'delete', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('worker_id', w.worker_id, 'reference_id', w.reference_id, 'employer_name_raw', w.employer_name_raw,
                            'worksite_name_raw', w.worksite_name_raw, 'names_import_id', w.names_import_id,
                            'employer_id', w.employer_id, 'worksite_id', w.worksite_id), NULL, 'synthetic replay worker removed by 92'
    FROM public.workers w WHERE w.reference_id LIKE 'DA03-%';
  DELETE FROM public.workers WHERE reference_id LIKE 'DA03-%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 92: % synthetic worker(s) deleted', v_n;

  -- 5. the replay's import logs
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/92', 'delete', 'import_logs', jsonb_build_object('import_id', l.import_id),
         jsonb_build_object('import_id', l.import_id, 'file_name', l.file_name, 'import_type', l.import_type,
                            'records_created', l.records_created, 'records_updated', l.records_updated), NULL, 'replay import log removed by 92'
    FROM public.import_logs l WHERE l.import_id IN (SELECT import_id FROM _da03_92_imports);
  DELETE FROM public.import_logs WHERE import_id IN (SELECT import_id FROM _da03_92_imports);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 92: % import log row(s) deleted', v_n;
END;
$remove$;

DO $postconditions$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workers WHERE reference_id LIKE 'DA03-%') THEN RAISE EXCEPTION 'DA0.3 92 FAILED: synthetic workers remain'; END IF;
  IF EXISTS (SELECT 1 FROM public.import_logs WHERE file_name = 'replay_status_sync.xlsx') THEN RAISE EXCEPTION 'DA0.3 92 FAILED: replay import logs remain'; END IF;
END;
$postconditions$;

COMMIT;

-- Appended read-only verification (paste into da0.3.md §11).
SELECT
  (SELECT count(*) FROM public.workers WHERE reference_id LIKE 'DA03-%') AS synthetic_workers,
  (SELECT count(*) FROM public.import_logs WHERE file_name = 'replay_status_sync.xlsx') AS replay_imports,
  (SELECT count(*) FROM public.name_match_reviews WHERE status IN ('needs_review', 'unmatched')) AS open_reviews,
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = 'da0.3/92') AS log_rows_92;
