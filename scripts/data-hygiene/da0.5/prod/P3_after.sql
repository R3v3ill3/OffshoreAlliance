-- DA0.5 PRODUCTION RUN SHEET — step P3 (read-only)
-- Project: production (gteygwfgjvczanmrwgbr). Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. One submission = this whole file. Prepared by the agent from the committed scripts
-- in the parent folder; the agent never runs anything on production.
-- What it does: the same one-row check as P1, after P2.
-- Expect: tables_present 16, columns_n 171, constraints_n 72, indexes_n 33, policies_n 27, triggers_n 8, rls_enabled_n 16, audit_function_md5 764235c6343f9cc8189502ba271571e5, ledger_row_present t, ledger_max_version 20260922040000, ledger_rows 17, vessels 25 / 3 / 0 / 0, contractors 14 / 2 / 0 / 0, alias_strings_missing_from_register 4
-- Paste back: the one result row.
-- If anything raises, the transaction (where there is one) has rolled back and nothing changed: paste the error and stop.

WITH t AS (
  SELECT c.oid, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r' AND c.relname = ANY (ARRAY['vessels','geofences','mobilisation_watch_contractors','mobilisation_watch_vessels',
          'mobilisation_watch_keywords','mobilisation_sources','mobilisation_rules','mobilisation_signals',
          'mobilisation_alerts','mobilisation_alert_signals','mobilisation_alert_events','mobilisation_notifications',
          'mobilisation_prefs','mobilisation_push_subscriptions','mobilisation_positions','mobilisation_settings'])
)
SELECT
  (SELECT count(*) FROM t)                                                                    AS tables_present,
  (SELECT count(*) FROM pg_attribute a JOIN t ON t.oid = a.attrelid
    WHERE a.attnum > 0 AND NOT a.attisdropped)                                                AS columns_n,
  (SELECT count(*) FROM pg_constraint k JOIN t ON t.oid = k.conrelid)                         AS constraints_n,
  (SELECT count(*) FROM pg_indexes i JOIN t ON t.relname = i.tablename
    WHERE i.schemaname = 'public')                                                            AS indexes_n,
  (SELECT count(*) FROM pg_policies p JOIN t ON t.relname = p.tablename
    WHERE p.schemaname = 'public')                                                            AS policies_n,
  (SELECT count(*) FROM pg_trigger g JOIN t ON t.oid = g.tgrelid WHERE NOT g.tgisinternal)   AS triggers_n,
  (SELECT count(*) FROM t JOIN pg_class c ON c.oid = t.oid WHERE c.relrowsecurity)            AS rls_enabled_n,
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mobilisation_alert_audit')                    AS audit_function_md5,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922040000') AS ledger_row_present,
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                            AS ledger_max_version,
  (SELECT count(*) FROM supabase_migrations.schema_migrations)                                AS ledger_rows,
  (SELECT count(*) FROM public.vessels)                                                       AS vessels_total,
  (SELECT count(*) FROM public.vessels WHERE owner_operator_id IS NOT NULL)                   AS vessels_linked,
  (SELECT count(*) FROM public.vessels v JOIN public.employers e ON e.employer_id = v.owner_operator_id
    WHERE lower(e.employer_name) <> lower(v.owner_name))                                      AS vessels_name_mismatch,
  (SELECT count(*) FROM public.vessels WHERE owner_operator_id BETWEEN 787 AND 794)           AS vessels_into_synthetic,
  (SELECT count(*) FROM public.mobilisation_watch_contractors)                                AS contractors_total,
  (SELECT count(*) FROM public.mobilisation_watch_contractors WHERE employer_id IS NOT NULL)  AS contractors_linked,
  (SELECT count(*) FROM public.mobilisation_watch_contractors w JOIN public.employers e ON e.employer_id = w.employer_id
    WHERE lower(e.employer_name) <> lower(w.canonical_name))                                  AS contractors_name_mismatch,
  (SELECT count(*) FROM public.mobilisation_watch_contractors WHERE employer_id BETWEEN 787 AND 794) AS contractors_into_synthetic,
  (SELECT count(*) FROM (SELECT unnest(aliases) AS a FROM public.mobilisation_watch_contractors) x
    WHERE NOT EXISTS (SELECT 1 FROM public.employer_name_aliases ena WHERE lower(ena.alias_name) = lower(x.a))) AS alias_strings_missing_from_register;
