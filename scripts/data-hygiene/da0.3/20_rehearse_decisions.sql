-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 20: rehearse the decision function on the CLONE (mutating; synthetic data only).
--
-- Plan: docs/data-architecture/wp/da0.3.md §3 (row 20), §3.2 (rehearsal order), §4 A5 / A8 / A9.
-- Runs AFTER the migration (supabase/migrations/20260922120000_da0_3_name_match_reviews.sql) and
-- its ledger row are on the clone. Reversed by 91_clear_da0_3_data.sql. Run as postgres in the SQL
-- editor (or execute_sql), ONE submission from BEGIN; to the appended SELECT. Never a migration.
--
-- WHAT IT DOES (every insert / update logged to public._oux_hygiene_log, script 'da0.3/20'):
--   1. one import_logs row ('DA0.3 rehearsal', membership_status_sync), imported_by = the admin
--      the transaction impersonates;
--   2. six synthetic workers (reference_id 'DA03-R-000001'..'000006', names 'Fixture' / 'Person n',
--      no email / phone) whose employer_name_raw / worksite_name_raw are the rehearsal strings and
--      whose FKs are NULL — except W3, whose employer_id is already set (must stay untouched);
--   3. six name_match_reviews rows: R1 employer needs_review (+ R1b, the same string from no import:
--      a sibling), R2 employer unmatched, R5 employer unmatched, R3 worksite needs_review,
--      R4 worksite needs_review;
--   4. decide_name_match(): confirm R1 -> alias written, W1 + W2 back-filled, W3 untouched, R1b
--      resolved as a sibling; reopen R1 -> open again, alias and back-fill kept; reject R1;
--      override R3 -> worksite alias, W5 filled; create R2 ('DA0.3 Rehearsal Contractor') -> W4
--      filled, match_method 'created'; reject R4 -> W6 untouched; create R5 with a name that
--      already exists -> the "already exists — search for it instead" exception;
--   5. the admin gate: as a user-role account the call raises 'Only admins ...' (A8).
--
-- The SQL editor runs as postgres, so auth.uid() is NULL and is_admin() is false. The file sets the
-- request claims for the transaction from the clone's own user_profiles (no id is written in this
-- file): set_config('request.jwt.claims', ..., true) — auth.uid() reads that setting.
-- Organisation strings and ids only reach the log; the synthetic workers carry no personal data.
--
-- A production operator must NOT run this file. It is clone-only (the guard admits clone / dev;
-- dev is left to the e2e replay, plan §3.4). Precondition STOPs if rehearsal rows already exist.
-- ---------------------------------------------------------------------------------------------

BEGIN;

-- Environment guard (WP2.1/2.2). No SET LOCAL oux.env here: clone / dev only.
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
  RAISE EXCEPTION 'Refusing to run: 20_rehearse_decisions.sql is clone/dev only (no _oux_env_marker table)';
END;
$environment_guard$;

DO $precondition$
BEGIN
  IF to_regclass('public.name_match_reviews') IS NULL
     OR to_regprocedure('public.decide_name_match(jsonb)') IS NULL
     OR to_regprocedure('public.fold_name(text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.workers'::regclass AND attname = 'names_import_id' AND NOT attisdropped)
  THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: the DA0.3 migration is not applied here';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE reference_id LIKE 'DA03-R-%')
     OR EXISTS (SELECT 1 FROM public.employers WHERE employer_name = 'DA0.3 Rehearsal Contractor')
     OR EXISTS (SELECT 1 FROM public.import_logs WHERE file_name = 'DA0.3 rehearsal')
  THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: rehearsal rows already exist; run 91_clear_da0_3_data.sql first';
  END IF;
  IF (SELECT count(*) FROM public.employers WHERE is_active) < 2
     OR (SELECT count(*) FROM public.worksites WHERE is_active) < 2 THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: need at least two active employers and two active worksites';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: no admin user_profiles row to impersonate';
  END IF;
END;
$precondition$;

-- Act as the first admin for this transaction (auth.uid() reads the claims).
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (SELECT user_id FROM public.user_profiles WHERE role = 'admin' ORDER BY user_id LIMIT 1),
    'role', 'authenticated'
  )::text,
  true
);

DO $rehearsal$
DECLARE
  v_admin      uuid := auth.uid();
  v_import     integer;
  e1_id        integer; e1_name text;
  e2_id        integer; e2_name text;
  w1_id        integer; w1_name text;
  w2_id        integer; w2_name text;
  s1 text; s2 text; s3 text; s4 text; s5 text;
  R1 bigint; R1b bigint; R2 bigint; R3 bigint; R4 bigint; R5 bigint;
  W1 integer; W2 integer; W3 integer; W4 integer; W5 integer; W6 integer;
  res          jsonb;
  v_new_emp    integer;
  v_status     text;
  v_fk         integer;
  v_msg        text;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'DA0.3 20 STOP: could not impersonate an admin (auth.uid() = %)', v_admin;
  END IF;

  SELECT employer_id, employer_name INTO e1_id, e1_name FROM public.employers WHERE is_active ORDER BY employer_id LIMIT 1;
  SELECT employer_id, employer_name INTO e2_id, e2_name FROM public.employers WHERE is_active ORDER BY employer_id OFFSET 1 LIMIT 1;
  SELECT worksite_id, worksite_name INTO w1_id, w1_name FROM public.worksites WHERE is_active ORDER BY worksite_id LIMIT 1;
  SELECT worksite_id, worksite_name INTO w2_id, w2_name FROM public.worksites WHERE is_active ORDER BY worksite_id OFFSET 1 LIMIT 1;

  s1 := e1_name || ' Rehearsal A';
  s2 := 'DA0.3 Rehearsal Unmatched Co';
  s3 := w1_name || ' Rehearsal B';
  s4 := 'DA0.3 Rehearsal Status Word';
  s5 := 'DA0.3 Rehearsal Duplicate Co';

  -- 1. import_logs
  INSERT INTO public.import_logs (file_name, import_type, records_created, records_updated, imported_by)
  VALUES ('DA0.3 rehearsal', 'membership_status_sync', 0, 0, v_admin)
  RETURNING import_id INTO v_import;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  VALUES ('da0.3/20', 'insert', 'import_logs', jsonb_build_object('import_id', v_import), NULL,
          jsonb_build_object('import_id', v_import, 'file_name', 'DA0.3 rehearsal', 'import_type', 'membership_status_sync'), 'rehearsal import');

  -- 2. synthetic workers (no personal data)
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, is_active)
  VALUES ('Fixture', 'Person 1', 'DA03-R-000001', s1, NULL, v_import, true) RETURNING worker_id INTO W1;
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, is_active)
  VALUES ('Fixture', 'Person 2', 'DA03-R-000002', s1, NULL, v_import, true) RETURNING worker_id INTO W2;
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, employer_id, is_active)
  VALUES ('Fixture', 'Person 3', 'DA03-R-000003', s1, NULL, v_import, e2_id, true) RETURNING worker_id INTO W3;
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, is_active)
  VALUES ('Fixture', 'Person 4', 'DA03-R-000004', s2, NULL, v_import, true) RETURNING worker_id INTO W4;
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, is_active)
  VALUES ('Fixture', 'Person 5', 'DA03-R-000005', NULL, s3, v_import, true) RETURNING worker_id INTO W5;
  INSERT INTO public.workers (first_name, last_name, reference_id, employer_name_raw, worksite_name_raw, names_import_id, is_active)
  VALUES ('Fixture', 'Person 6', 'DA03-R-000006', NULL, s4, v_import, true) RETURNING worker_id INTO W6;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'insert', 'workers', jsonb_build_object('worker_id', w.worker_id), NULL,
         jsonb_build_object('worker_id', w.worker_id, 'reference_id', w.reference_id, 'employer_name_raw', w.employer_name_raw,
                            'worksite_name_raw', w.worksite_name_raw, 'names_import_id', w.names_import_id,
                            'employer_id', w.employer_id, 'worksite_id', w.worksite_id), 'synthetic rehearsal worker'
    FROM public.workers w WHERE w.worker_id IN (W1, W2, W3, W4, W5, W6);

  -- 3. queue rows
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, match_score, candidate_proposals, occurrences, source_context, created_by)
  VALUES ('employer', s1, public.fold_name(s1), v_import, 'needs_review', 0.800,
          jsonb_build_array(jsonb_build_object('id', e1_id, 'name', e1_name, 'score', 0.8, 'is_principal', false)), 3,
          jsonb_build_object('import_type', 'membership_status_sync'), v_admin)
  RETURNING id INTO R1;
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, match_score, candidate_proposals, occurrences, created_by)
  VALUES ('employer', s1, public.fold_name(s1), NULL, 'needs_review', 0.800,
          jsonb_build_array(jsonb_build_object('id', e1_id, 'name', e1_name, 'score', 0.8, 'is_principal', false)), 1, v_admin)
  RETURNING id INTO R1b;
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, candidate_proposals, occurrences, created_by)
  VALUES ('employer', s2, public.fold_name(s2), v_import, 'unmatched', '[]'::jsonb, 1, v_admin)
  RETURNING id INTO R2;
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, candidate_proposals, occurrences, created_by)
  VALUES ('employer', s5, public.fold_name(s5), v_import, 'unmatched', '[]'::jsonb, 1, v_admin)
  RETURNING id INTO R5;
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, match_score, candidate_proposals, occurrences, created_by)
  VALUES ('worksite', s3, public.fold_name(s3), v_import, 'needs_review', 0.750,
          jsonb_build_array(jsonb_build_object('id', w1_id, 'name', w1_name, 'score', 0.75, 'is_principal', false)), 1, v_admin)
  RETURNING id INTO R3;
  INSERT INTO public.name_match_reviews (entity, raw_name, normalised_name, import_id, status, match_score, candidate_proposals, occurrences, created_by)
  VALUES ('worksite', s4, public.fold_name(s4), v_import, 'needs_review', 0.700,
          jsonb_build_array(jsonb_build_object('id', w2_id, 'name', w2_name, 'score', 0.7, 'is_principal', false)), 1, v_admin)
  RETURNING id INTO R4;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'insert', 'name_match_reviews', jsonb_build_object('id', r.id), NULL, to_jsonb(r), 'rehearsal queue row'
    FROM public.name_match_reviews r WHERE r.id IN (R1, R1b, R2, R3, R4, R5);

  -- 4a. confirm R1 -> alias, back-fill W1 + W2, sibling R1b, W3 untouched
  res := public.decide_name_match(jsonb_build_object('id', R1, 'action', 'confirm', 'employer_id', e1_id, 'notes', 'rehearsal confirm'));
  IF NOT (res->>'alias_written')::boolean THEN RAISE EXCEPTION 'confirm R1: alias not written'; END IF;
  IF (res->'backfilled_worker_ids') <> jsonb_build_array(LEAST(W1, W2), GREATEST(W1, W2)) THEN
    RAISE EXCEPTION 'confirm R1: back-fill expected [%, %], got %', LEAST(W1, W2), GREATEST(W1, W2), res->'backfilled_worker_ids';
  END IF;
  IF (res->>'siblings_resolved')::int <> 1 THEN RAISE EXCEPTION 'confirm R1: siblings_resolved expected 1, got %', res->>'siblings_resolved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employer_name_aliases WHERE employer_id = e1_id AND lower(btrim(alias_name)) = lower(btrim(s1)) AND source = 'import') THEN
    RAISE EXCEPTION 'confirm R1: alias row missing';
  END IF;
  SELECT employer_id INTO v_fk FROM public.workers WHERE worker_id = W3;
  IF v_fk IS DISTINCT FROM e2_id THEN RAISE EXCEPTION 'confirm R1: W3 (non-null FK) was overwritten'; END IF;
  SELECT status INTO v_status FROM public.name_match_reviews WHERE id = R1b;
  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'confirm R1: sibling R1b is %, expected confirmed', v_status; END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'insert', 'employer_name_aliases', jsonb_build_object('id', a.id), NULL,
         jsonb_build_object('id', a.id, 'employer_id', a.employer_id, 'alias_name', a.alias_name, 'source', a.source), 'written by decide_name_match confirm R1'
    FROM public.employer_name_aliases a WHERE a.employer_id = e1_id AND lower(btrim(a.alias_name)) = lower(btrim(s1));
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('employer_id', NULL), jsonb_build_object('employer_id', w.employer_id), 'back-filled by decide_name_match confirm R1'
    FROM public.workers w WHERE w.worker_id IN (W1, W2);
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'needs_review'), to_jsonb(r), 'decide_name_match confirm R1'
    FROM public.name_match_reviews r WHERE r.id IN (R1, R1b);

  -- 4b. reopen R1 -> open again; alias and back-fill stay
  res := public.decide_name_match(jsonb_build_object('id', R1, 'action', 'reopen'));
  SELECT status INTO v_status FROM public.name_match_reviews WHERE id = R1;
  IF v_status <> 'needs_review' THEN RAISE EXCEPTION 'reopen R1: status % (expected needs_review)', v_status; END IF;
  IF EXISTS (SELECT 1 FROM public.name_match_reviews WHERE id = R1 AND (decided_at IS NOT NULL OR resolved_employer_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'reopen R1: decided_* / resolved_* not cleared';
  END IF;
  SELECT employer_id INTO v_fk FROM public.workers WHERE worker_id = W1;
  IF v_fk IS DISTINCT FROM e1_id THEN RAISE EXCEPTION 'reopen R1: back-fill was reverted (must stay)'; END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'confirmed'), to_jsonb(r), 'decide_name_match reopen R1'
    FROM public.name_match_reviews r WHERE r.id = R1;

  -- 4c. reject R1 (sticky)
  res := public.decide_name_match(jsonb_build_object('id', R1, 'action', 'reject', 'notes', 'rehearsal reject'));
  SELECT status INTO v_status FROM public.name_match_reviews WHERE id = R1;
  IF v_status <> 'rejected' THEN RAISE EXCEPTION 'reject R1: status %', v_status; END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'needs_review'), to_jsonb(r), 'decide_name_match reject R1'
    FROM public.name_match_reviews r WHERE r.id = R1;

  -- 4d. override R3 -> worksite alias, W5 filled
  res := public.decide_name_match(jsonb_build_object('id', R3, 'action', 'override', 'worksite_id', w1_id, 'notes', 'rehearsal override'));
  IF NOT (res->>'alias_written')::boolean THEN RAISE EXCEPTION 'override R3: alias not written'; END IF;
  IF (res->'backfilled_worker_ids') <> jsonb_build_array(W5) THEN RAISE EXCEPTION 'override R3: back-fill expected [%], got %', W5, res->'backfilled_worker_ids'; END IF;
  SELECT status INTO v_status FROM public.name_match_reviews WHERE id = R3;
  IF v_status <> 'overridden' THEN RAISE EXCEPTION 'override R3: status %', v_status; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.worksite_name_aliases WHERE worksite_id = w1_id AND lower(btrim(alias_name)) = lower(btrim(s3)) AND source = 'import') THEN
    RAISE EXCEPTION 'override R3: worksite alias missing';
  END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'insert', 'worksite_name_aliases', jsonb_build_object('id', a.id), NULL,
         jsonb_build_object('id', a.id, 'worksite_id', a.worksite_id, 'alias_name', a.alias_name, 'source', a.source), 'written by decide_name_match override R3'
    FROM public.worksite_name_aliases a WHERE a.worksite_id = w1_id AND lower(btrim(a.alias_name)) = lower(btrim(s3));
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('worksite_id', NULL), jsonb_build_object('worksite_id', w.worksite_id), 'back-filled by decide_name_match override R3'
    FROM public.workers w WHERE w.worker_id = W5;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'needs_review'), to_jsonb(r), 'decide_name_match override R3'
    FROM public.name_match_reviews r WHERE r.id = R3;

  -- 4e. create R2 -> the one insert into employers on the import path
  res := public.decide_name_match(jsonb_build_object('id', R2, 'action', 'create',
           'create', jsonb_build_object('employer_name', 'DA0.3 Rehearsal Contractor', 'employer_category', 'Subcontractor')));
  SELECT employer_id INTO v_new_emp FROM public.employers WHERE employer_name = 'DA0.3 Rehearsal Contractor';
  IF v_new_emp IS NULL THEN RAISE EXCEPTION 'create R2: employer not created'; END IF;
  IF (res->'backfilled_worker_ids') <> jsonb_build_array(W4) THEN RAISE EXCEPTION 'create R2: back-fill expected [%], got %', W4, res->'backfilled_worker_ids'; END IF;
  IF (res->'review'->>'match_method') <> 'created' OR (res->'review'->>'status') <> 'confirmed' THEN
    RAISE EXCEPTION 'create R2: review is % / %', res->'review'->>'status', res->'review'->>'match_method';
  END IF;
  IF NOT (res->>'alias_written')::boolean THEN RAISE EXCEPTION 'create R2: alias not written for the raw string'; END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  VALUES ('da0.3/20', 'insert', 'employers', jsonb_build_object('employer_id', v_new_emp), NULL,
          jsonb_build_object('employer_id', v_new_emp, 'employer_name', 'DA0.3 Rehearsal Contractor', 'employer_category', 'Subcontractor'), 'created by decide_name_match create R2');
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'insert', 'employer_name_aliases', jsonb_build_object('id', a.id), NULL,
         jsonb_build_object('id', a.id, 'employer_id', a.employer_id, 'alias_name', a.alias_name, 'source', a.source), 'written by decide_name_match create R2'
    FROM public.employer_name_aliases a WHERE a.employer_id = v_new_emp;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'workers', jsonb_build_object('worker_id', w.worker_id),
         jsonb_build_object('employer_id', NULL), jsonb_build_object('employer_id', w.employer_id), 'back-filled by decide_name_match create R2'
    FROM public.workers w WHERE w.worker_id = W4;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'unmatched'), to_jsonb(r), 'decide_name_match create R2'
    FROM public.name_match_reviews r WHERE r.id = R2;

  -- 4f. reject R4 -> W6 untouched
  res := public.decide_name_match(jsonb_build_object('id', R4, 'action', 'reject'));
  SELECT worksite_id INTO v_fk FROM public.workers WHERE worker_id = W6;
  IF v_fk IS NOT NULL THEN RAISE EXCEPTION 'reject R4: W6 was filled'; END IF;
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT 'da0.3/20', 'update', 'name_match_reviews', jsonb_build_object('id', r.id), jsonb_build_object('status', 'needs_review'), to_jsonb(r), 'decide_name_match reject R4'
    FROM public.name_match_reviews r WHERE r.id = R4;

  -- 4g. create R5 with a name that already exists -> the exception the page shows verbatim
  BEGIN
    PERFORM public.decide_name_match(jsonb_build_object('id', R5, 'action', 'create',
              'create', jsonb_build_object('employer_name', e2_name)));
    RAISE EXCEPTION 'create R5: expected an "already exists" exception';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF v_msg NOT LIKE '%already exists%search for it instead%' THEN
      RAISE EXCEPTION 'create R5: unexpected error: %', v_msg;
    END IF;
  END;
  SELECT status INTO v_status FROM public.name_match_reviews WHERE id = R5;
  IF v_status <> 'unmatched' THEN RAISE EXCEPTION 'create R5: row changed to % after a failed create', v_status; END IF;

  RAISE NOTICE 'DA0.3 20: rehearsal decisions passed (import %, workers %..%, reviews %..%)', v_import, W1, W6, R1, R5;
END;
$rehearsal$;

-- 5. The admin gate as a user-role account (A8). Skipped with a NOTICE when the clone has none.
DO $gate$
DECLARE
  v_user uuid;
  v_any  bigint;
  v_msg  text;
BEGIN
  SELECT user_id INTO v_user FROM public.user_profiles WHERE role = 'user' ORDER BY user_id LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'DA0.3 20: no user-role account on this database; admin gate not exercised here (contract test covers it)';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  IF public.is_admin() THEN RAISE EXCEPTION 'DA0.3 20: impersonated user is an admin'; END IF;
  SELECT id INTO v_any FROM public.name_match_reviews WHERE raw_name = 'DA0.3 Rehearsal Status Word' LIMIT 1;
  BEGIN
    PERFORM public.decide_name_match(jsonb_build_object('id', v_any, 'action', 'reopen'));
    RAISE EXCEPTION 'DA0.3 20: the admin gate did not fire for a user-role account';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF v_msg NOT LIKE 'Only admins%' THEN RAISE EXCEPTION 'DA0.3 20: unexpected gate error: %', v_msg; END IF;
  END;
  RAISE NOTICE 'DA0.3 20: admin gate holds for a user-role account';
END;
$gate$;

COMMIT;

-- Appended read-only summary (paste into da0.3.md §11).
SELECT
  (SELECT count(*) FROM public.workers WHERE reference_id LIKE 'DA03-R-%') AS rehearsal_workers,
  (SELECT count(*) FROM public.workers WHERE reference_id LIKE 'DA03-R-%' AND (employer_id IS NOT NULL OR worksite_id IS NOT NULL)) AS rehearsal_workers_filled,
  (SELECT string_agg(status || '=' || n, ',' ORDER BY status) FROM (SELECT status, count(*) AS n FROM public.name_match_reviews GROUP BY 1) t) AS reviews_by_status,
  (SELECT count(*) FROM public.employer_name_aliases WHERE source = 'import') AS employer_import_aliases,
  (SELECT count(*) FROM public.worksite_name_aliases WHERE source = 'import') AS worksite_import_aliases,
  (SELECT count(*) FROM public.employers WHERE employer_name = 'DA0.3 Rehearsal Contractor') AS rehearsal_contractor,
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = 'da0.3/20' AND rolled_back_at IS NULL) AS log_rows;
