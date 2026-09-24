-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 91: clear the data the rehearsal (20) or an application replay left (mutating).
--
-- Plan: docs/data-architecture/wp/da0.3.md §3 (row 91), §3.2. Precondition: exactly the state 20 or
-- the replay leaves (the DA0.3 objects present, public._oux_hygiene_log present). Reverses, all
-- logged to public._oux_hygiene_log (script 'da0.3/91'):
--   1. every name_match_reviews row (deleted);
--   2. employer aliases whose source is outside the baseline vocabulary (not merge|manual — every
--      such row is post-migration by construction) and worksite aliases outside the baseline
--      vocabulary (not import|manual|merge) OR source = 'import' with id above the value recorded by
--      00_preflight.sql BEFORE the migration (the pre-existing import aliases survive);
--   3. the synthetic workers (reference_id LIKE 'DA03-%'), then the three DA0.3 columns nulled on
--      every other worker that carries them;
--   4. the rehearsal / replay import_logs rows ('DA0.3 rehearsal', 'replay_status_sync.xlsx');
--   5. the rehearsal-created employer ('DA0.3 Rehearsal Contractor') and worksite
--      ('DA0.3 Rehearsal Site'), if present;
--   6. the 20 log rows stamped rolled_back_at.
--
-- REQUIRED INPUT: the worksite alias max(id) printed by 00_preflight.sql (ws_alias_max_id) before
-- the migration, supplied in this same submission immediately after BEGIN;:
--   SET LOCAL da03.ws_alias_max_id_before = '<n>';
-- The file STOPs without it (never guesses which import aliases pre-date DA0.3).
--
-- Run as postgres, one submission from BEGIN; to the appended SELECT. Clone (rehearsal) and dev
-- (after an e2e replay). A production operator would add SET LOCAL oux.env = 'production'; but
-- this file is not on the production run sheet (no rehearsal data exists there).
-- ---------------------------------------------------------------------------------------------

BEGIN;
-- SET LOCAL da03.ws_alias_max_id_before = '<n>';   -- the operator/agent adds this line, see above

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

DO $precondition$
BEGIN
  IF to_regclass('public.name_match_reviews') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'names_import_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'DA0.3 91 STOP: the DA0.3 objects are absent';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION 'DA0.3 91 STOP: public._oux_hygiene_log is missing';
  END IF;
  IF nullif(current_setting('da03.ws_alias_max_id_before', true), '') IS NULL
     OR current_setting('da03.ws_alias_max_id_before', true) !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'DA0.3 91 STOP: SET LOCAL da03.ws_alias_max_id_before = ''<n>'' (from 00_preflight.sql before the migration) is required in this submission';
  END IF;
END;
$precondition$;

DO $clear$
DECLARE
  v_ws_max  integer := current_setting('da03.ws_alias_max_id_before', true)::integer;
  v_n       integer;
BEGIN
  -- 1. queue rows
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'name_match_reviews', jsonb_build_object('id', r.id), to_jsonb(r), NULL, 'cleared by 91'
    FROM public.name_match_reviews r;
  DELETE FROM public.name_match_reviews;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: % review row(s) deleted', v_n;

  -- 2. aliases written since the migration
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'employer_name_aliases', jsonb_build_object('id', a.id),
         jsonb_build_object('id', a.id, 'employer_id', a.employer_id, 'alias_name', a.alias_name, 'source', a.source), NULL, 'cleared by 91'
    FROM public.employer_name_aliases a WHERE a.source NOT IN ('merge', 'manual');
  DELETE FROM public.employer_name_aliases WHERE source NOT IN ('merge', 'manual');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: % employer alias(es) deleted', v_n;

  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'worksite_name_aliases', jsonb_build_object('id', a.id),
         jsonb_build_object('id', a.id, 'worksite_id', a.worksite_id, 'alias_name', a.alias_name, 'source', a.source), NULL, 'cleared by 91'
    FROM public.worksite_name_aliases a
   WHERE a.source NOT IN ('import', 'manual', 'merge') OR (a.source = 'import' AND a.id > v_ws_max);
  DELETE FROM public.worksite_name_aliases
   WHERE source NOT IN ('import', 'manual', 'merge') OR (source = 'import' AND id > v_ws_max);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: % worksite alias(es) deleted', v_n;

  -- 3. synthetic workers, then the raw columns on everyone else
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('worker_id', w.worker_id, 'reference_id', w.reference_id, 'employer_name_raw', w.employer_name_raw,
                            'worksite_name_raw', w.worksite_name_raw, 'names_import_id', w.names_import_id,
                            'employer_id', w.employer_id, 'worksite_id', w.worksite_id), NULL, 'synthetic worker cleared by 91'
    FROM public.workers w WHERE w.reference_id LIKE 'DA03-%';
  DELETE FROM public.workers WHERE reference_id LIKE 'DA03-%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: % synthetic worker(s) deleted', v_n;

  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'update', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('employer_name_raw', w.employer_name_raw, 'worksite_name_raw', w.worksite_name_raw, 'names_import_id', w.names_import_id),
         jsonb_build_object('employer_name_raw', NULL, 'worksite_name_raw', NULL, 'names_import_id', NULL), 'raw name columns cleared by 91'
    FROM public.workers w
   WHERE w.employer_name_raw IS NOT NULL OR w.worksite_name_raw IS NOT NULL OR w.names_import_id IS NOT NULL;
  UPDATE public.workers SET employer_name_raw = NULL, worksite_name_raw = NULL, names_import_id = NULL
   WHERE employer_name_raw IS NOT NULL OR worksite_name_raw IS NOT NULL OR names_import_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: raw name columns cleared on % worker(s)', v_n;

  -- 4. rehearsal / replay import logs
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'import_logs', jsonb_build_object('import_id', l.import_id),
         jsonb_build_object('import_id', l.import_id, 'file_name', l.file_name, 'import_type', l.import_type,
                            'records_created', l.records_created, 'records_updated', l.records_updated), NULL, 'cleared by 91'
    FROM public.import_logs l WHERE l.file_name IN ('DA0.3 rehearsal', 'replay_status_sync.xlsx');
  DELETE FROM public.import_logs WHERE file_name IN ('DA0.3 rehearsal', 'replay_status_sync.xlsx');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'DA0.3 91: % import log row(s) deleted', v_n;

  -- 5. the rehearsal-created rows
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'employers', jsonb_build_object('employer_id', e.employer_id),
         jsonb_build_object('employer_id', e.employer_id, 'employer_name', e.employer_name), NULL, 'rehearsal employer cleared by 91'
    FROM public.employers e WHERE e.employer_name = 'DA0.3 Rehearsal Contractor';
  DELETE FROM public.employers WHERE employer_name = 'DA0.3 Rehearsal Contractor';
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/91', 'delete', 'worksites', jsonb_build_object('worksite_id', w.worksite_id),
         jsonb_build_object('worksite_id', w.worksite_id, 'worksite_name', w.worksite_name), NULL, 'rehearsal worksite cleared by 91'
    FROM public.worksites w WHERE w.worksite_name = 'DA0.3 Rehearsal Site';
  DELETE FROM public.worksites WHERE worksite_name = 'DA0.3 Rehearsal Site';

  -- 6. stamp the rehearsal's log rows
  UPDATE public._oux_hygiene_log SET rolled_back_at = now() WHERE script = 'da0.3/20' AND rolled_back_at IS NULL;
END;
$clear$;

DO $postconditions$
BEGIN
  IF (SELECT count(*) FROM public.name_match_reviews) <> 0 THEN RAISE EXCEPTION 'DA0.3 91 FAILED: review rows remain'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE employer_name_raw IS NOT NULL OR worksite_name_raw IS NOT NULL OR names_import_id IS NOT NULL) THEN
    RAISE EXCEPTION 'DA0.3 91 FAILED: raw name columns remain set';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE reference_id LIKE 'DA03-%') THEN RAISE EXCEPTION 'DA0.3 91 FAILED: synthetic workers remain'; END IF;
  IF EXISTS (SELECT 1 FROM public.employer_name_aliases WHERE source NOT IN ('merge', 'manual')) THEN RAISE EXCEPTION 'DA0.3 91 FAILED: employer aliases outside the baseline vocabulary remain'; END IF;
  IF EXISTS (SELECT 1 FROM public.worksite_name_aliases WHERE source NOT IN ('import', 'manual', 'merge')) THEN RAISE EXCEPTION 'DA0.3 91 FAILED: worksite aliases outside the baseline vocabulary remain'; END IF;
  IF EXISTS (SELECT 1 FROM public.employers WHERE employer_name = 'DA0.3 Rehearsal Contractor') THEN RAISE EXCEPTION 'DA0.3 91 FAILED: rehearsal employer remains'; END IF;
END;
$postconditions$;

COMMIT;

-- Appended read-only verification (paste into da0.3.md §11); 00_preflight.sql gives the full picture.
SELECT
  (SELECT count(*) FROM public.name_match_reviews) AS review_rows,
  (SELECT count(*) FROM public.workers WHERE employer_name_raw IS NOT NULL OR worksite_name_raw IS NOT NULL OR names_import_id IS NOT NULL) AS workers_with_raw,
  (SELECT count(*) FROM public.workers WHERE reference_id LIKE 'DA03-%') AS synthetic_workers,
  (SELECT count(*) FROM public.employer_name_aliases WHERE source NOT IN ('merge', 'manual')) AS emp_aliases_post_baseline,
  (SELECT count(*) FROM public.worksite_name_aliases WHERE source NOT IN ('import', 'manual', 'merge')) AS ws_aliases_post_baseline,
  (SELECT count(*) FROM public.worksite_name_aliases WHERE source = 'import') AS ws_import_aliases_left,
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = 'da0.3/91') AS log_rows_91,
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = 'da0.3/20' AND rolled_back_at IS NOT NULL) AS log_rows_20_stamped;
