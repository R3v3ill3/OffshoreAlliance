-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 90: schema rollback of the DA0.3 migration (mutating; never a migration).
--
-- Plan: docs/data-architecture/wp/da0.3.md §2.3.7 and §3.2 (rehearsal: forward -> 91 -> 90 ->
-- forward again). Reverses supabase/migrations/20260922120000_da0_3_name_match_reviews.sql:
-- drops decide_name_match(), the two triggers and name_match_reviews_fold(), the table, the three
-- worker columns and their index, fold_name(), and restores both alias CHECKs to the baseline
-- vocabularies (20260908050000_baseline_schema.sql :11669 and :17642).
--
-- It never silently drops data: it STOPS while name_match_reviews has a row, while any worker
-- carries employer_name_raw / worksite_name_raw / names_import_id, or while an alias carries a
-- source the baseline CHECK would reject (employer: not merge|manual; worksite: not
-- import|manual|merge). Run 91_clear_da0_3_data.sql first.
--
-- Migration-history repair is a separate, recovery-only command requiring explicit approval and
-- is not executed here:
--   -- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120000';
--
-- Run as postgres, one submission from BEGIN; to the appended SELECT. The SQL editor returns only
-- the last statement's result, so the verification SELECT sits after COMMIT;.
-- ---------------------------------------------------------------------------------------------

BEGIN;

-- A production operator (recovery only) must add SET LOCAL oux.env = 'production';
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

DO $precondition$
DECLARE
  v_reviews  bigint;
  v_raw      bigint;
  v_emp_src  bigint;
  v_ws_src   bigint;
BEGIN
  IF to_regclass('public.name_match_reviews') IS NULL
     OR to_regprocedure('public.decide_name_match(jsonb)') IS NULL
     OR to_regprocedure('public.fold_name(text)') IS NULL
     OR to_regprocedure('public.name_match_reviews_fold()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'employer_name_raw' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'worksite_name_raw' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'names_import_id' AND NOT attisdropped)
  THEN
    RAISE EXCEPTION 'DA0.3 rollback STOP: the DA0.3 objects are absent (nothing to roll back, or a partial state to inspect by hand)';
  END IF;

  SELECT count(*) INTO v_reviews FROM public.name_match_reviews;
  SELECT count(*) INTO v_raw FROM public.workers
   WHERE employer_name_raw IS NOT NULL OR worksite_name_raw IS NOT NULL OR names_import_id IS NOT NULL;
  SELECT count(*) INTO v_emp_src FROM public.employer_name_aliases WHERE source NOT IN ('merge', 'manual');
  SELECT count(*) INTO v_ws_src FROM public.worksite_name_aliases WHERE source NOT IN ('import', 'manual', 'merge');
  IF v_reviews <> 0 OR v_raw <> 0 OR v_emp_src <> 0 OR v_ws_src <> 0 THEN
    RAISE EXCEPTION
      'DA0.3 rollback STOP: % review row(s), % worker(s) with raw names, % employer alias(es) and % worksite alias(es) outside the baseline vocabulary; run 91_clear_da0_3_data.sql (or clear them under an approved run sheet) first',
      v_reviews, v_raw, v_emp_src, v_ws_src;
  END IF;
END;
$precondition$;

CREATE TEMP TABLE _da03_90_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.employers) AS employers_n,
  (SELECT md5(coalesce(string_agg(employer_id || ':' || employer_name, ',' ORDER BY employer_id), '')) FROM public.employers) AS employers_md5,
  (SELECT count(*) FROM public.worksites) AS worksites_n,
  (SELECT md5(coalesce(string_agg(worksite_id || ':' || worksite_name, ',' ORDER BY worksite_id), '')) FROM public.worksites) AS worksites_md5,
  (SELECT count(*) FROM public.workers) AS workers_n,
  (SELECT count(*) FROM public.employer_name_aliases) AS emp_aliases_n,
  (SELECT count(*) FROM public.worksite_name_aliases) AS ws_aliases_n;

-- 1. The decision function.
DROP FUNCTION IF EXISTS public.decide_name_match(jsonb);

-- 2. Triggers, the trigger function, the table.
DROP TRIGGER IF EXISTS trg_name_match_reviews_fold ON public.name_match_reviews;
DROP TRIGGER IF EXISTS trg_name_match_reviews_updated_at ON public.name_match_reviews;
DROP TABLE IF EXISTS public.name_match_reviews;
DROP FUNCTION IF EXISTS public.name_match_reviews_fold();

-- 3. The worker columns and their index.
DROP INDEX IF EXISTS public.idx_workers_names_import;
ALTER TABLE public.workers
  DROP COLUMN IF EXISTS employer_name_raw,
  DROP COLUMN IF EXISTS worksite_name_raw,
  DROP COLUMN IF EXISTS names_import_id;

-- 4. fold_name() (nothing references it once the table and the function are gone).
DROP FUNCTION IF EXISTS public.fold_name(text);

-- 5. Both CHECKs, verbatim from the baseline.
ALTER TABLE public.employer_name_aliases DROP CONSTRAINT IF EXISTS employer_name_aliases_source_check;
ALTER TABLE public.employer_name_aliases
  ADD CONSTRAINT employer_name_aliases_source_check
  CHECK ((("source")::"text" = ANY ((ARRAY['merge'::character varying, 'manual'::character varying])::"text"[])));
ALTER TABLE public.worksite_name_aliases DROP CONSTRAINT IF EXISTS worksite_name_aliases_source_check;
ALTER TABLE public.worksite_name_aliases
  ADD CONSTRAINT worksite_name_aliases_source_check
  CHECK ((("source")::"text" = ANY ((ARRAY['import'::character varying, 'manual'::character varying, 'merge'::character varying])::"text"[])));

DO $postconditions$
DECLARE
  b          record;
  v_emp_vals text[];
  v_ws_vals  text[];
BEGIN
  SELECT * INTO b FROM _da03_90_before;
  IF to_regclass('public.name_match_reviews') IS NOT NULL THEN RAISE EXCEPTION 'DA0.3 rollback FAILED: name_match_reviews still exists'; END IF;
  IF to_regprocedure('public.decide_name_match(jsonb)') IS NOT NULL
     OR to_regprocedure('public.name_match_reviews_fold()') IS NOT NULL
     OR to_regprocedure('public.fold_name(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: a DA0.3 function still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND NOT attisdropped
              AND attname IN ('employer_name_raw', 'worksite_name_raw', 'names_import_id')) THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: a worker column still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_workers_names_import') THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: idx_workers_names_import still exists';
  END IF;
  -- The constraint text differs by Postgres version; compare the admitted values.
  SELECT array_agg(m[1] ORDER BY m[1]) INTO v_emp_vals
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conname = 'employer_name_aliases_source_check';
  SELECT array_agg(m[1] ORDER BY m[1]) INTO v_ws_vals
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conname = 'worksite_name_aliases_source_check';
  IF v_emp_vals IS DISTINCT FROM ARRAY['manual', 'merge'] THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: employer alias CHECK admits %, expected {manual,merge}', v_emp_vals;
  END IF;
  IF v_ws_vals IS DISTINCT FROM ARRAY['import', 'manual', 'merge'] THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: worksite alias CHECK admits %, expected {import,manual,merge}', v_ws_vals;
  END IF;
  -- No application row changed.
  IF (SELECT count(*) FROM public.employers) <> b.employers_n
     OR (SELECT md5(coalesce(string_agg(employer_id || ':' || employer_name, ',' ORDER BY employer_id), '')) FROM public.employers) <> b.employers_md5
     OR (SELECT count(*) FROM public.worksites) <> b.worksites_n
     OR (SELECT md5(coalesce(string_agg(worksite_id || ':' || worksite_name, ',' ORDER BY worksite_id), '')) FROM public.worksites) <> b.worksites_md5
     OR (SELECT count(*) FROM public.workers) <> b.workers_n
     OR (SELECT count(*) FROM public.employer_name_aliases) <> b.emp_aliases_n
     OR (SELECT count(*) FROM public.worksite_name_aliases) <> b.ws_aliases_n THEN
    RAISE EXCEPTION 'DA0.3 rollback FAILED: an application table changed during the rollback';
  END IF;
END;
$postconditions$;

COMMIT;

-- Appended read-only verification (paste into da0.3.md §11); 00_preflight.sql gives the full picture.
SELECT
  to_regclass('public.name_match_reviews')::text AS nmr_table,
  to_regprocedure('public.decide_name_match(jsonb)')::text AS decide_fn,
  to_regprocedure('public.fold_name(text)')::text AS fold_name_fn,
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND NOT attisdropped
    AND attname IN ('employer_name_raw', 'worksite_name_raw', 'names_import_id')) AS worker_columns_left,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'employer_name_aliases_source_check') AS emp_alias_check,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'worksite_name_aliases_source_check') AS ws_alias_check,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260922120000') AS ledger_row_still_present;
