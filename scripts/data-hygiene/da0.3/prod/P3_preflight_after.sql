-- DA0.3 PRODUCTION RUN SHEET — step P3 (read-only)
-- Project: production (gteygwfgjvczanmrwgbr). Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. One submission = this whole file. Prepared by the agent from the committed scripts
-- in the parent folder; the agent never runs anything on production.
-- What it does: the same one-row check as P1, after P2.
-- Expect: the same employers/worksites counts and md5s and the same four view md5s as P1; name_match_reviews present with 0 rows; fold_name and decide_name_match present; 2 triggers, 1 policy, 7 indexes; the three workers columns present with 0 set; both CHECKs = merge, manual, import, oa_universe, fwc; ledger row 20260922120000 present.
-- Paste back: the one result row.
-- If anything raises, the transaction (where there is one) has rolled back and nothing changed: paste the error and stop.

-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 00: preflight / postflight (READ-ONLY; no BEGIN, no guard, no data change).
--
-- Plan: docs/data-architecture/wp/da0.3.md §3, §4 (A1, A3, A4, A13, A14). Run on every environment
-- before and after every mutating step (the migration, 20, 91, 90, the e2e replay, 92) and paste the
-- one-row result into the plan (§9 verification record / §11 run sheet record).
--
-- Prints counts and checksums only: employers / worksites (count + md5 of id:name), alias counts by
-- source and max(id) per alias table, workers with the DA0.3 raw columns set (0 before the package),
-- the presence of the DA0.3 objects, both alias CHECK texts, name_match_reviews by status (when the
-- table exists), md5 of the four reviewer-checklist view definitions, and the ledger row. It never
-- prints a worker's name, email, phone or reference id. Works before AND after the migration: the
-- DA0.3 columns and table are read through query_to_xml() only when the catalog says they exist.
-- ---------------------------------------------------------------------------------------------

WITH cols AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'employer_name_raw' AND NOT attisdropped) AS has_emp_raw,
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'worksite_name_raw' AND NOT attisdropped) AS has_ws_raw,
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'names_import_id' AND NOT attisdropped) AS has_import_id,
    to_regclass('public.name_match_reviews') IS NOT NULL AS has_nmr
)
SELECT
  now() AS checked_at,
  (SELECT count(*) FROM public.employers) AS employers_n,
  (SELECT md5(coalesce(string_agg(employer_id || ':' || employer_name, ',' ORDER BY employer_id), '')) FROM public.employers) AS employers_md5,
  (SELECT count(*) FROM public.worksites) AS worksites_n,
  (SELECT md5(coalesce(string_agg(worksite_id || ':' || worksite_name, ',' ORDER BY worksite_id), '')) FROM public.worksites) AS worksites_md5,
  (SELECT coalesce(string_agg(source || '=' || n, ',' ORDER BY source), '') FROM (SELECT source, count(*) AS n FROM public.employer_name_aliases GROUP BY 1) t) AS emp_alias_by_source,
  (SELECT coalesce(max(id), 0) FROM public.employer_name_aliases) AS emp_alias_max_id,
  (SELECT coalesce(string_agg(source || '=' || n, ',' ORDER BY source), '') FROM (SELECT source, count(*) AS n FROM public.worksite_name_aliases GROUP BY 1) t) AS ws_alias_by_source,
  (SELECT coalesce(max(id), 0) FROM public.worksite_name_aliases) AS ws_alias_max_id,
  (SELECT count(*) FROM public.workers) AS workers_n,
  CASE WHEN cols.has_emp_raw THEN (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.workers WHERE employer_name_raw IS NOT NULL', false, true, '')))[1]::text::bigint ELSE NULL END AS workers_emp_raw_set,
  CASE WHEN cols.has_ws_raw THEN (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.workers WHERE worksite_name_raw IS NOT NULL', false, true, '')))[1]::text::bigint ELSE NULL END AS workers_ws_raw_set,
  CASE WHEN cols.has_import_id THEN (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.workers WHERE names_import_id IS NOT NULL', false, true, '')))[1]::text::bigint ELSE NULL END AS workers_import_id_set,
  (SELECT count(*) FROM public.workers WHERE reference_id LIKE 'DA03-%') AS fixture_workers_n,
  cols.has_emp_raw AND cols.has_ws_raw AND cols.has_import_id AS worker_columns_present,
  to_regclass('public.name_match_reviews')::text AS nmr_table,
  to_regprocedure('public.fold_name(text)')::text AS fold_name_fn,
  to_regprocedure('public.decide_name_match(jsonb)')::text AS decide_fn,
  to_regprocedure('public.name_match_reviews_fold()')::text AS fold_trigger_fn,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = to_regclass('public.name_match_reviews') AND NOT tgisinternal) AS nmr_triggers,
  (SELECT count(*) FROM pg_policy WHERE polrelid = to_regclass('public.name_match_reviews')) AS nmr_policies,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'name_match_reviews') AS nmr_indexes,
  CASE WHEN cols.has_nmr THEN coalesce((xpath('/row/s/text()', query_to_xml('SELECT string_agg(status || ''='' || n, '','' ORDER BY status) AS s FROM (SELECT status, count(*) AS n FROM public.name_match_reviews GROUP BY 1) t', false, true, '')))[1]::text, '') ELSE NULL END AS nmr_by_status,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'employer_name_aliases_source_check') AS emp_alias_check,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'worksite_name_aliases_source_check') AS ws_alias_check,
  md5(pg_get_viewdef('public.workers_view'::regclass)) AS workers_view_md5,
  md5(pg_get_viewdef('public.organising_universe_view'::regclass)) AS organising_universe_view_md5,
  md5(pg_get_viewdef('public.worksite_employer_eba_status'::regclass)) AS worksite_employer_eba_status_md5,
  md5(pg_get_viewdef('public.principal_employer_eba_summary'::regclass)) AS principal_employer_eba_summary_md5,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260922120000') AS ledger_row_present,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ledger_max_version,
  to_regclass('public._oux_hygiene_log')::text AS hygiene_log,
  (SELECT CASE WHEN to_regclass('public._oux_env_marker') IS NULL THEN 'none' ELSE (xpath('/row/e/text()', query_to_xml('SELECT string_agg(env, '','') AS e FROM public._oux_env_marker', false, true, '')))[1]::text END) AS env_marker
FROM cols;
