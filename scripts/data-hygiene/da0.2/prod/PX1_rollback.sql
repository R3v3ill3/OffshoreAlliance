-- DA0.2 PRODUCTION RUN SHEET — step PX1 (mutating: RECOVERY ONLY, reverses P2)
-- Project: production (gteygwfgjvczanmrwgbr). Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. One submission = this whole file. Prepared by the agent from the committed scripts
-- in the parent folder; the agent never runs anything on production.
-- What it does: reinserts every row P2 logged with its original keys (parents first, triggers off), restores worker 1536 and the SET NULL columns, stamps the log rows rolled_back_at; asserts the campaign checksums and counts return to their pre-P2 values (deltas against its own before-state, so a weekly batch in between does not abort it).
-- Expect: forward_rows_pending 0, campaigns_15_37 2, employers_787_794 8, worksites_196_199 4, workers_active back up by 664, w1536 'emp=791 ws=197 cwm=37/50/64'.
-- Paste back: the one result row (or the error).
-- If anything raises, the transaction (where there is one) has rolled back and nothing changed: paste the error and stop.

-- DA0.2 rollback of 10_remove_test_dataset.sql (docs/data-architecture/wp/da0.2.md §3.3).
-- Operator-run only; never a migration. Rehearsal on the clone (forward → this → forward
-- again) and recovery elsewhere.
--
-- Reverses the whole run from public._oux_hygiene_log: every row logged by
-- 10_remove_test_dataset with rolled_back_at IS NULL is replayed — 'delete' rows are
-- reinserted from before_row with their original primary keys (serial and IDENTITY BY DEFAULT
-- columns accept explicit values; OVERRIDING SYSTEM VALUE is added for any table with a
-- GENERATED ALWAYS identity column; generated columns are left to the server), and 'update'
-- rows (the SET NULL columns, the re-point of worker 1536) are restored to before_row in full,
-- updated_at included. The reinsert order does not depend on the log order at all (fix round
-- 4): the pending TABLES are put in a parents-first topological order computed from
-- pg_constraint (single-column keys between pending tables; self-references ignored; DEFERRABLE
-- keys treated as absent); a genuine cycle (campaign_comms_drafts.email_list_id ↔
-- email_lists.draft_id) is broken by inserting the table whose unplaced parents are all reached
-- through nullable columns with those columns NULL and completing it by a full-row update once
-- its parents have landed; within a table rows go in by log_id ascending; the 'update' rows are
-- applied after every delete-row has landed. A retry loop remains as a safety net: passes
-- continue while any row lands and the file stops only when a whole pass lands nothing, naming
-- the row, its table, the violated constraint and the parent table.
--
-- User triggers on every table in the log are disabled for the duration of the transaction
-- (ALTER TABLE … DISABLE TRIGGER USER; re-enabled before COMMIT, and the pre-run state of every
-- trigger is asserted afterwards). Otherwise fn_activist_profile_on_membership,
-- fn_task_list_item_side_effects, fn_auto_rate_promote_task_list_leader, auto_add_soc_capacity,
-- propagate_employer_scope, update_connection_stats_on_activity and the updated_at triggers
-- would create or alter rows the log does not contain (da0.2.md §3.4). Foreign-key (internal)
-- triggers stay live, so referential integrity is enforced throughout. postgres owns every
-- table and has BYPASSRLS, so RLS does not apply.
--
-- Precondition: exactly the state 10 leaves behind (pending log rows with one snapshot row and
-- as many rows as its after_state says; the scoped entities absent; worker 1536 on 741/185 and
-- a member of campaign 50 only). Any other shape stops the file for inspection by hand.
--
-- What it proves (review finding 2): this file is runnable at any time until the log rows are
-- dropped, so its post-assertions are DELTAS against its own before-state — every logged table
-- = its own before + rows reinserted; campaigns 15 and 37 equal to the forward snapshot; campaign
-- 64 = its own before + 1 membership (1536), placements unchanged; every other campaign's
-- membership and placement checksum unchanged across this run; workers total and active = own
-- before + 664. Byte-identity with the forward snapshot (every table count, every checksum,
-- 1536's row) is asserted only where public._oux_env_marker exists (the clone or dev, where
-- nothing else moves between the runs); on production it is reported as a WARNING.
--
-- A production operator must add SET LOCAL oux.env = 'production'; immediately after BEGIN in
-- this same submission. The committed file omits that line and names no project.

BEGIN;
SET LOCAL oux.env = 'production';

-- A future production operator must add SET LOCAL oux.env = 'production';
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

-- ---------------------------------------------------------------------------
-- The pending forward rows and the catalogue helpers (temp; dropped at COMMIT).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _da02_pending ON COMMIT DROP AS
SELECT log_id, action, table_name, row_pk, before_row, after_row   -- after_row: the snapshot's after_state (fix round 3)
FROM public._oux_hygiene_log
WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL;

CREATE TEMP TABLE _da02_snapshot ON COMMIT DROP AS
SELECT log_id, before_row AS before_state, after_row AS after_state
FROM _da02_pending WHERE table_name = '_da02_snapshot';

CREATE TEMP TABLE _da02_edges ON COMMIT DROP AS
SELECT cl.relname::text  AS child,
       a.attname::text   AS col,
       pcl.relname::text AS parent,
       ra.attname::text  AS refcol,
       format_type(ra.atttypid, ra.atttypmod) AS ref_type,
       c.confdeltype::text AS del,
       c.conname::text AS conname,
       a.attnotnull     AS col_notnull,
       c.condeferrable  AS is_deferrable,
       (c.conrelid = c.confrelid) AS is_self
FROM pg_constraint c
JOIN pg_class cl  ON cl.oid  = c.conrelid
JOIN pg_class pcl ON pcl.oid = c.confrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = c.conkey[1]
JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
WHERE c.contype = 'f' AND n.nspname = 'public' AND pn.nspname = 'public'
  AND array_length(c.conkey, 1) = 1;

CREATE TEMP TABLE _da02_pk ON COMMIT DROP AS
SELECT cl.relname::text AS tbl,
       string_agg(format('t.%I', a.attname), ', ' ORDER BY k.ord)                                      AS pk_cols,
       string_agg(format('(d.row_pk->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY k.ord) AS pk_from_json,
       string_agg(format('t.%I = ($1->>%L)::%s', a.attname, a.attname, format_type(a.atttypid, a.atttypmod)), ' AND ' ORDER BY k.ord) AS pk_match
FROM pg_constraint p
JOIN pg_class cl ON cl.oid = p.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS k(attnum, ord)
JOIN pg_attribute a ON a.attrelid = p.conrelid AND a.attnum = k.attnum
WHERE p.contype = 'p' AND n.nspname = 'public'
GROUP BY cl.relname;

-- Insertable / updatable column lists per table (generated columns excluded; identity ALWAYS
-- columns excluded from UPDATE and flagged so the INSERT adds OVERRIDING SYSTEM VALUE).
CREATE TEMP TABLE _da02_cols ON COMMIT DROP AS
SELECT cl.relname::text AS tbl,
       string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) FILTER (WHERE a.attgenerated = '')                       AS ins_cols,
       string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) FILTER (WHERE a.attgenerated = '' AND a.attidentity <> 'a') AS upd_cols,
       bool_or(a.attidentity = 'a') AS has_identity_always
FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND cl.relkind = 'r'
GROUP BY cl.relname;

CREATE TEMP TABLE _da02_counts_before ON COMMIT DROP AS
SELECT cl.relname::text AS tbl,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', cl.relname), false, true, '')))[1]::text::bigint AS n
FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public' AND cl.relkind = 'r'
  AND cl.relname NOT IN ('_oux_hygiene_log', '_oux_env_marker');

-- This run's own before-state (review finding 2): the post-assertions are deltas against it.
CREATE TEMP TABLE _da02_checksums_before ON COMMIT DROP AS
WITH m AS (SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h
           FROM public.campaign_worker_membership GROUP BY campaign_id),
     o AS (SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
           FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id)
SELECT c.campaign_id, coalesce(m.n, 0) AS mem_n, m.h AS mem_md5, coalesce(o.n, 0) AS ou_n, o.h AS ou_md5
FROM public.campaigns c LEFT JOIN m ON m.campaign_id = c.campaign_id LEFT JOIN o ON o.campaign_id = c.campaign_id;

CREATE TEMP TABLE _da02_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.workers)                 AS workers_total,
       (SELECT count(*) FROM public.workers WHERE is_active) AS workers_active,
       (to_regclass('public._oux_env_marker') IS NOT NULL)   AS strict_snapshot;

CREATE TEMP TABLE _da02_trig_before ON COMMIT DROP AS
SELECT cl.relname::text AS tbl, tg.tgname::text AS tgname, tg.tgenabled::text AS tgenabled
FROM pg_trigger tg JOIN pg_class cl ON cl.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public' AND NOT tg.tgisinternal
  AND cl.relname IN (SELECT DISTINCT table_name FROM _da02_pending WHERE table_name <> '_da02_snapshot');

CREATE TEMP TABLE _da02_log_ids (log_id bigint PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE _da02_deferred (log_id bigint PRIMARY KEY, attempts int NOT NULL DEFAULT 0, last_error text, last_constraint text) ON COMMIT DROP;
CREATE TEMP TABLE _da02_fixups (log_id bigint PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE _da02_torder (tbl text PRIMARY KEY, ord int, relax_cols text[]) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- Preconditions: exactly the state 10 leaves.
-- ---------------------------------------------------------------------------
DO $preconditions$
DECLARE
  v_count bigint;
  v_txt   text;
  r       record;
  pk      record;
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '90 STOP: public._oux_hygiene_log is missing';
  END IF;
  IF (SELECT count(*) FROM _da02_pending) = 0 THEN
    RAISE EXCEPTION '90 STOP: no pending rows of 10_remove_test_dataset in the log (nothing to roll back, or already rolled back)';
  END IF;
  IF (SELECT count(*) FROM _da02_snapshot) <> 1 THEN
    RAISE EXCEPTION '90 STOP: expected exactly one pending _da02_snapshot row, found %', (SELECT count(*) FROM _da02_snapshot);
  END IF;
  IF EXISTS (SELECT 1 FROM _da02_pending WHERE action NOT IN ('delete', 'update')) THEN
    RAISE EXCEPTION '90 STOP: the pending rows contain an action other than delete/update';
  END IF;
  -- Review finding 11: the snapshot says how many rows 10 logged; all of them must be pending.
  IF (SELECT count(*) FROM _da02_pending WHERE table_name <> '_da02_snapshot')
     <> (SELECT (after_state->>'rows_logged')::bigint FROM _da02_snapshot) THEN
    RAISE EXCEPTION '90 STOP: % pending rows but the snapshot logged %',
      (SELECT count(*) FROM _da02_pending WHERE table_name <> '_da02_snapshot'),
      (SELECT after_state->>'rows_logged' FROM _da02_snapshot);
  END IF;
  IF to_regclass('public._oux_env_marker') IS NOT NULL
     AND ((SELECT count(*) FROM public.workers) <> (SELECT (after_state->>'workers_total')::bigint FROM _da02_snapshot)
          OR (SELECT count(*) FROM public.workers WHERE is_active) <> (SELECT (after_state->>'workers_active')::bigint FROM _da02_snapshot)) THEN
    RAISE EXCEPTION '90 STOP (clone/dev): workers %/% active differ from the snapshot after-state %/%',
      (SELECT count(*) FROM public.workers), (SELECT count(*) FROM public.workers WHERE is_active),
      (SELECT after_state->>'workers_total' FROM _da02_snapshot), (SELECT after_state->>'workers_active' FROM _da02_snapshot);
  END IF;
  FOR r IN SELECT DISTINCT table_name FROM _da02_pending WHERE table_name <> '_da02_snapshot' LOOP
    IF to_regclass('public.' || quote_ident(r.table_name)) IS NULL THEN
      RAISE EXCEPTION '90 STOP: logged table % no longer exists', r.table_name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM _da02_pk WHERE tbl = r.table_name) THEN
      RAISE EXCEPTION '90 STOP: logged table % has no primary key', r.table_name;
    END IF;
  END LOOP;

  -- The post-state of 10.
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.campaigns WHERE campaign_id IN (15, 37)
    UNION ALL SELECT 1 FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.programs WHERE program_id = 6
    UNION ALL SELECT 1 FROM public.projects WHERE project_id IN (18, 19, 20, 21)
  ) x;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '90 STOP: % scoped row(s) are present; this is not the state 10 leaves', v_count;
  END IF;
  IF (SELECT employer_name FROM public.employers WHERE employer_id = 741) IS DISTINCT FROM 'Australian Workers'' Union WA Branch'
     OR (SELECT worksite_name FROM public.worksites WHERE worksite_id = 185) IS DISTINCT FROM 'AWU Head Office' THEN
    RAISE EXCEPTION '90 STOP: employer 741 / worksite 185 are not AWU WA Branch / AWU Head Office';
  END IF;
  SELECT string_agg(k || '=' || v, ',' ORDER BY k) INTO v_txt FROM (
    SELECT 'emp' k, employer_id::text v FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'ws', worksite_id::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'cwm', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership WHERE worker_id = 1536
    UNION ALL SELECT 'profiles', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_activist_profiles WHERE worker_id = 1536
  ) x;
  IF v_txt IS DISTINCT FROM 'cwm=50,emp=741,profiles=50,ws=185' THEN
    RAISE EXCEPTION '90 STOP: worker 1536 is not in the state 10 leaves (found %)', v_txt;
  END IF;

  -- No logged delete row is back already (a reinsert would collide), for every logged table.
  FOR r IN SELECT DISTINCT table_name FROM _da02_pending WHERE action = 'delete' LOOP
    SELECT * INTO pk FROM _da02_pk WHERE tbl = r.table_name;
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE (%s) IN (SELECT %s FROM _da02_pending d WHERE d.table_name = %L AND d.action = ''delete'')',
      r.table_name, pk.pk_cols, pk.pk_from_json, r.table_name) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '90 STOP: % logged row(s) of % already exist', v_count, r.table_name;
    END IF;
  END LOOP;
  -- Every logged update row still exists (it is restored in place).
  FOR r IN SELECT DISTINCT table_name FROM _da02_pending WHERE action = 'update' AND table_name <> '_da02_snapshot' LOOP
    SELECT * INTO pk FROM _da02_pk WHERE tbl = r.table_name;
    EXECUTE format(
      'SELECT count(*) FROM _da02_pending d WHERE d.table_name = %L AND d.action = ''update''
         AND NOT EXISTS (SELECT 1 FROM public.%I t WHERE (%s) = (%s))',
      r.table_name, r.table_name, pk.pk_cols, pk.pk_from_json) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '90 STOP: % logged update row(s) of % no longer exist', v_count, r.table_name;
    END IF;
  END LOOP;
  -- No user trigger on a logged table was already disabled (we restore the pre-run state exactly).
  IF EXISTS (SELECT 1 FROM _da02_trig_before WHERE tgenabled = 'D') THEN
    RAISE EXCEPTION '90 STOP: a user trigger on a logged table is already disabled: %',
      (SELECT string_agg(tbl || '.' || tgname, ', ') FROM _da02_trig_before WHERE tgenabled = 'D');
  END IF;
END;
$preconditions$;

-- ---------------------------------------------------------------------------
-- Replay, with user triggers off.
-- ---------------------------------------------------------------------------
DO $replay$
DECLARE
  r        record;
  pk       record;
  cols     record;
  v_sql    text;
  v_n      bigint;
  v_pass   int := 0;
  v_ord    int := 0;
  v_pick   text;
  v_relax  text[];
  v_progress boolean;
  v_row    jsonb;
  v_msg    text;
  v_con    text;
  v_detail text;
  v_parent text;
BEGIN
  -- 1. Triggers off.
  FOR r IN SELECT DISTINCT table_name FROM _da02_pending WHERE table_name <> '_da02_snapshot' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.table_name);
  END LOOP;

  -- 2. A parents-first order of the pending TABLES (fix round 4). Edges are the single-column
  --    foreign keys between two pending tables, self-references ignored, DEFERRABLE keys treated as
  --    absent (they are checked at COMMIT). A table is ready when every table it references is
  --    placed. When nothing is ready (a genuine cycle, e.g. campaign_comms_drafts.email_list_id ↔
  --    email_lists.draft_id), the table whose every unplaced parent is reached only through
  --    NULLABLE columns is placed next with those columns relaxed (inserted NULL, completed in
  --    step 5 once the parents have landed). A cycle with no such table stops the file.
  INSERT INTO _da02_torder (tbl, ord, relax_cols)
  SELECT DISTINCT p.table_name, NULL::int, NULL::text[] FROM _da02_pending p WHERE p.action = 'delete';
  LOOP
    v_relax := NULL;
    SELECT t.tbl INTO v_pick
    FROM _da02_torder t
    WHERE t.ord IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM _da02_edges e JOIN _da02_torder pt ON pt.tbl = e.parent AND pt.ord IS NULL
        WHERE e.child = t.tbl AND NOT e.is_self AND NOT e.is_deferrable)
    ORDER BY t.tbl LIMIT 1;
    IF v_pick IS NULL THEN
      SELECT t.tbl,
             (SELECT array_agg(DISTINCT e.col ORDER BY e.col) FROM _da02_edges e JOIN _da02_torder pt ON pt.tbl = e.parent AND pt.ord IS NULL
               WHERE e.child = t.tbl AND NOT e.is_self AND NOT e.is_deferrable)
        INTO v_pick, v_relax
      FROM _da02_torder t
      WHERE t.ord IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM _da02_edges e JOIN _da02_torder pt ON pt.tbl = e.parent AND pt.ord IS NULL
          WHERE e.child = t.tbl AND NOT e.is_self AND NOT e.is_deferrable AND e.col_notnull)
      ORDER BY t.tbl LIMIT 1;
      IF v_pick IS NULL THEN
        EXIT WHEN NOT EXISTS (SELECT 1 FROM _da02_torder WHERE ord IS NULL);
        RAISE EXCEPTION '90: foreign-key cycle among pending tables with no nullable key to relax: %',
          (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM _da02_torder WHERE ord IS NULL);
      END IF;
      RAISE NOTICE '90: cycle broken at % (columns relaxed: %)', v_pick, v_relax;
    END IF;
    v_ord := v_ord + 1;
    UPDATE _da02_torder SET ord = v_ord, relax_cols = v_relax WHERE tbl = v_pick;
  END LOOP;

  -- 3. Reinsert, table by table in that order, rows by log_id ascending. A foreign-key violation
  --    defers the row to the retry passes (safety net; none is expected).
  FOR r IN
    SELECT p.*, t.relax_cols FROM _da02_pending p JOIN _da02_torder t ON t.tbl = p.table_name
    WHERE p.action = 'delete' ORDER BY t.ord, p.log_id
  LOOP
    SELECT * INTO cols FROM _da02_cols WHERE tbl = r.table_name;
    v_row := r.before_row;
    IF r.relax_cols IS NOT NULL THEN
      v_row := v_row - r.relax_cols;
      INSERT INTO _da02_fixups (log_id) VALUES (r.log_id);
    END IF;
    v_sql := format('INSERT INTO public.%I (%s) %s SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                    r.table_name, cols.ins_cols,
                    CASE WHEN cols.has_identity_always THEN 'OVERRIDING SYSTEM VALUE' ELSE '' END,
                    cols.ins_cols, r.table_name);
    BEGIN
      EXECUTE v_sql USING v_row;
      WITH x AS (
        INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
        VALUES ('90_rollback', 'insert', r.table_name, r.row_pk, NULL, r.before_row,
                format('DA0.2 (da0.2.md §3.3): 10_remove_test_dataset reversed — row reinserted (forward log_id %s%s)',
                       r.log_id, CASE WHEN r.relax_cols IS NOT NULL THEN ', keys ' || array_to_string(r.relax_cols, '/') || ' relaxed then completed' ELSE '' END))
        RETURNING log_id)
      INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM x;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_con = CONSTRAINT_NAME;
      INSERT INTO _da02_deferred (log_id, attempts, last_error, last_constraint) VALUES (r.log_id, 1, v_msg, v_con);
    END;
  END LOOP;

  -- 4. Retry passes: continue while any deferred row lands; stop only when a whole pass lands
  --    nothing, naming the row, the table, the violated constraint and its parent table.
  LOOP
    EXIT WHEN (SELECT count(*) FROM _da02_deferred) = 0;
    v_pass := v_pass + 1;
    IF v_pass > 50 THEN RAISE EXCEPTION '90: more than 50 retry passes'; END IF;
    v_progress := false;
    FOR r IN
      SELECT p.*, t.relax_cols FROM _da02_pending p JOIN _da02_deferred x ON x.log_id = p.log_id
      JOIN _da02_torder t ON t.tbl = p.table_name ORDER BY t.ord, p.log_id
    LOOP
      SELECT * INTO cols FROM _da02_cols WHERE tbl = r.table_name;
      v_row := r.before_row;
      IF r.relax_cols IS NOT NULL THEN v_row := v_row - r.relax_cols; END IF;
      v_sql := format('INSERT INTO public.%I (%s) %s SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                      r.table_name, cols.ins_cols,
                      CASE WHEN cols.has_identity_always THEN 'OVERRIDING SYSTEM VALUE' ELSE '' END,
                      cols.ins_cols, r.table_name);
      BEGIN
        EXECUTE v_sql USING v_row;
        DELETE FROM _da02_deferred WHERE log_id = r.log_id;
        v_progress := true;
        WITH x AS (
          INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
          VALUES ('90_rollback', 'insert', r.table_name, r.row_pk, NULL, r.before_row,
                  format('DA0.2 (da0.2.md §3.3): 10_remove_test_dataset reversed — row reinserted on retry pass %s (forward log_id %s)', v_pass, r.log_id))
          RETURNING log_id)
        INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM x;
      EXCEPTION WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_con = CONSTRAINT_NAME;
        UPDATE _da02_deferred SET attempts = attempts + 1, last_error = v_msg, last_constraint = v_con WHERE log_id = r.log_id;
      END;
    END LOOP;
    IF NOT v_progress THEN
      SELECT p.table_name, p.row_pk::text, x.last_constraint, x.last_error,
             (SELECT e.parent FROM _da02_edges e WHERE e.child = p.table_name AND e.conname = x.last_constraint LIMIT 1)
        INTO v_pick, v_detail, v_con, v_msg, v_parent
      FROM _da02_deferred x JOIN _da02_pending p ON p.log_id = x.log_id ORDER BY x.log_id LIMIT 1;
      RAISE EXCEPTION '90: % row(s) cannot be reinserted; first: table % row % violates constraint % (parent table %): %',
        (SELECT count(*) FROM _da02_deferred), v_pick, v_detail, coalesce(v_con, '?'), coalesce(v_parent, '?'), v_msg;
    END IF;
  END LOOP;

  -- 5. Complete the relaxed rows with a full-row update from before_row (their parents are in now).
  FOR r IN
    SELECT p.* FROM _da02_pending p JOIN _da02_fixups f ON f.log_id = p.log_id
    JOIN _da02_torder t ON t.tbl = p.table_name ORDER BY t.ord, p.log_id
  LOOP
    SELECT * INTO pk   FROM _da02_pk   WHERE tbl = r.table_name;
    SELECT * INTO cols FROM _da02_cols WHERE tbl = r.table_name;
    EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $2)) WHERE %s',
                   r.table_name, cols.upd_cols, cols.upd_cols, r.table_name, pk.pk_match)
    USING r.row_pk, r.before_row;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '90: completing % % updated % row(s), expected 1', r.table_name, r.row_pk, v_n;
    END IF;
  END LOOP;

  -- 6. The 'update' rows (the SET NULL restorations and worker 1536's re-point), newest first so a
  --    row nulled through several keys ends at its original state; every parent row is in by now.
  FOR r IN SELECT * FROM _da02_pending WHERE action = 'update' AND table_name <> '_da02_snapshot' ORDER BY log_id DESC LOOP
    SELECT * INTO pk   FROM _da02_pk   WHERE tbl = r.table_name;
    SELECT * INTO cols FROM _da02_cols WHERE tbl = r.table_name;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s', r.table_name, pk.pk_match) INTO v_row USING r.row_pk;
    EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $2)) WHERE %s',
                   r.table_name, cols.upd_cols, cols.upd_cols, r.table_name, pk.pk_match)
    USING r.row_pk, r.before_row;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '90: restoring % % updated % row(s), expected 1', r.table_name, r.row_pk, v_n;
    END IF;
    WITH x AS (
      INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
      VALUES ('90_rollback', 'update', r.table_name, r.row_pk, v_row, r.before_row,
              format('DA0.2 (da0.2.md §3.3): 10_remove_test_dataset reversed — row restored (forward log_id %s)', r.log_id))
      RETURNING log_id)
    INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM x;
  END LOOP;

  -- 7. Triggers back on. The two DEFERRABLE INITIALLY DEFERRED keys into campaign_groups
  --    (campaign_organising_units.group_id, campaign_worker_ou.group_id; da0.2.md §3.1.1) queue
  --    their checks until COMMIT, and Postgres refuses ALTER TABLE on a table with pending
  --    trigger events, so the deferred checks are fired here first (the WP2.1 03a_rollback
  --    precedent). A violation raises now, inside the transaction, instead of at COMMIT.
  SET CONSTRAINTS ALL IMMEDIATE;
  FOR r IN SELECT DISTINCT table_name FROM _da02_pending WHERE table_name <> '_da02_snapshot' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.table_name);
  END LOOP;
END;
$replay$;

-- 8. Stamp the forward rows (WP0.4 convention; makes a re-run of 10 possible and this file idempotent).
UPDATE public._oux_hygiene_log
SET rolled_back_at = now()
WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL;

-- ---------------------------------------------------------------------------
-- Post-assertions: the snapshot's before-state is reproduced.
-- ---------------------------------------------------------------------------
DO $postconditions$
DECLARE
  v_snap   jsonb := (SELECT before_state FROM _da02_snapshot);
  v_own    record;
  v_count  bigint;
  v_txt    text;
  r        record;
BEGIN
  SELECT * INTO v_own FROM _da02_before;
  IF (SELECT count(*) FROM _da02_deferred) <> 0 THEN
    RAISE EXCEPTION '90 post-check failed: % row(s) still deferred', (SELECT count(*) FROM _da02_deferred);
  END IF;
  IF (SELECT count(*) FROM _da02_log_ids) <> (SELECT count(*) FROM _da02_pending WHERE table_name <> '_da02_snapshot') THEN
    RAISE EXCEPTION '90 post-check failed: % rows replayed for % pending rows',
      (SELECT count(*) FROM _da02_log_ids), (SELECT count(*) FROM _da02_pending WHERE table_name <> '_da02_snapshot');
  END IF;
  IF (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL) <> 0 THEN
    RAISE EXCEPTION '90 post-check failed: forward rows left unstamped';
  END IF;

  -- Workers and the scoped entities: deltas against this run's own before-state.
  IF (SELECT count(*) FROM public.workers) <> v_own.workers_total + 664
     OR (SELECT count(*) FROM public.workers WHERE is_active) <> v_own.workers_active + 664 THEN
    RAISE EXCEPTION '90 post-check failed: workers %/% active, expected %/% (+664 on this run''s before-state)',
      (SELECT count(*) FROM public.workers), (SELECT count(*) FROM public.workers WHERE is_active),
      v_own.workers_total + 664, v_own.workers_active + 664;
  END IF;
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.campaigns WHERE campaign_id IN (15, 37)
    UNION ALL SELECT 1 FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.programs WHERE program_id = 6
    UNION ALL SELECT 1 FROM public.projects WHERE project_id IN (18, 19, 20, 21)
  ) x;
  IF v_count <> 2 + 8 + 4 + 1 + 4 THEN
    RAISE EXCEPTION '90 post-check failed: % of the 19 scoped entity rows are back (expected 19)', v_count;
  END IF;

  -- Worker 1536: back on 791/197 with memberships and profiles 37/50/64; byte-identical to the
  -- snapshot where nothing else can have moved (clone/dev), a WARNING otherwise.
  SELECT string_agg(k || '=' || v, ',' ORDER BY k) INTO v_txt FROM (
    SELECT 'emp' k, employer_id::text v FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'ws', worksite_id::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'cwm', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership WHERE worker_id = 1536
    UNION ALL SELECT 'profiles', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_activist_profiles WHERE worker_id = 1536
  ) x;
  IF v_txt IS DISTINCT FROM 'cwm=37/50/64,emp=791,profiles=37/50/64,ws=197' THEN
    RAISE EXCEPTION '90 post-check failed: worker 1536 is % (expected emp=791 ws=197 cwm=37/50/64 profiles=37/50/64)', v_txt;
  END IF;
  -- Only the keys the snapshot holds are compared: a column added to workers after the forward run
  -- (schema drift, e.g. DA0.3's nullable columns on the clone) is not this script's business.
  IF (SELECT jsonb_object_agg(x.key, x.value) FROM public.workers w, jsonb_each(to_jsonb(w)) x
      WHERE w.worker_id = 1536 AND (v_snap->'w1536') ? x.key) IS DISTINCT FROM (v_snap->'w1536') THEN
    IF v_own.strict_snapshot THEN
      RAISE EXCEPTION '90 post-check failed (clone/dev): worker 1536 differs from the snapshot';
    ELSE
      RAISE WARNING '90: worker 1536 differs from the forward snapshot in a column other than employer/worksite (edited since the forward run)';
    END IF;
  END IF;

  -- Every logged table: now = this run's before + rows reinserted (strict everywhere); and, on
  -- clone/dev only, every table count equal to the forward snapshot.
  FOR r IN
    SELECT b.tbl, b.n AS before_n,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', b.tbl), false, true, '')))[1]::text::bigint AS now_n,
           (SELECT count(*) FROM _da02_pending p WHERE p.table_name = b.tbl AND p.action = 'delete') AS reinserted,
           (v_snap->'counts'->>b.tbl)::bigint AS snap_n,
           (b.tbl IN (SELECT table_name FROM _da02_pending)
            OR b.tbl IN (SELECT e.child  FROM _da02_edges e WHERE e.parent IN (SELECT table_name FROM _da02_pending))
            OR b.tbl IN (SELECT e.parent FROM _da02_edges e WHERE e.child  IN (SELECT table_name FROM _da02_pending))) AS is_strict
    FROM _da02_counts_before b
  LOOP
    IF r.now_n <> r.before_n + r.reinserted THEN
      IF r.is_strict THEN
        RAISE EXCEPTION '90 post-check failed: % went from % to % row(s); expected +% (rows reinserted)', r.tbl, r.before_n, r.now_n, r.reinserted;
      ELSE
        RAISE WARNING '90: unrelated table % moved from % to % row(s) while this ran (not touched by this script)', r.tbl, r.before_n, r.now_n;
      END IF;
    END IF;
    IF r.snap_n IS NOT NULL AND r.now_n <> r.snap_n THEN
      IF v_own.strict_snapshot AND r.is_strict THEN
        RAISE EXCEPTION '90 post-check failed (clone/dev): % has % row(s), the forward snapshot had %', r.tbl, r.now_n, r.snap_n;
      ELSIF r.is_strict THEN
        RAISE WARNING '90: % has % row(s), the forward snapshot had % (moved since the forward run)', r.tbl, r.now_n, r.snap_n;
      END IF;
    END IF;
  END LOOP;

  -- Campaign checksums: 15 and 37 equal to the forward snapshot; 64 = own before + 1 membership
  -- with placements unchanged; every other campaign unchanged across this run; and, on
  -- clone/dev only, every campaign equal to the forward snapshot.
  FOR r IN
    WITH m AS (SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h FROM public.campaign_worker_membership GROUP BY campaign_id),
         o AS (SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
               FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id)
    SELECT c.campaign_id,
           jsonb_build_object('mem_n', coalesce(m.n, 0), 'mem_md5', m.h, 'ou_n', coalesce(o.n, 0), 'ou_md5', o.h) AS now_sum,
           v_snap->'checksums'->(c.campaign_id::text) AS snap_sum,
           b.mem_n AS own_mem_n, b.mem_md5 AS own_mem_md5, b.ou_n AS own_ou_n, b.ou_md5 AS own_ou_md5,
           coalesce(m.n, 0) AS mem_n, m.h AS mem_md5, coalesce(o.n, 0) AS ou_n, o.h AS ou_md5
    FROM public.campaigns c
    LEFT JOIN m ON m.campaign_id = c.campaign_id LEFT JOIN o ON o.campaign_id = c.campaign_id
    LEFT JOIN _da02_checksums_before b ON b.campaign_id = c.campaign_id
  LOOP
    IF r.campaign_id IN (15, 37) THEN
      IF r.now_sum IS DISTINCT FROM r.snap_sum THEN
        RAISE EXCEPTION '90 post-check failed: campaign % checksum % differs from the forward snapshot %', r.campaign_id, r.now_sum, r.snap_sum;
      END IF;
    ELSIF r.campaign_id = 64 THEN
      IF r.mem_n <> r.own_mem_n + 1 OR r.ou_n <> r.own_ou_n OR r.ou_md5 IS DISTINCT FROM r.own_ou_md5 THEN
        RAISE EXCEPTION '90 post-check failed: campaign 64 memberships % → % (expected +1), placements % → %', r.own_mem_n, r.mem_n, r.own_ou_n, r.ou_n;
      END IF;
    ELSIF r.own_mem_n IS NOT NULL THEN
      IF r.mem_n <> r.own_mem_n OR r.mem_md5 IS DISTINCT FROM r.own_mem_md5 OR r.ou_n <> r.own_ou_n OR r.ou_md5 IS DISTINCT FROM r.own_ou_md5 THEN
        RAISE EXCEPTION '90 post-check failed: campaign % checksum moved during this run (memberships % → %, placements % → %)', r.campaign_id, r.own_mem_n, r.mem_n, r.own_ou_n, r.ou_n;
      END IF;
    END IF;
    IF r.snap_sum IS NULL THEN
      RAISE WARNING '90: campaign % was not in the forward snapshot (created after the forward run)', r.campaign_id;
    ELSIF r.now_sum IS DISTINCT FROM r.snap_sum AND r.campaign_id NOT IN (15, 37) THEN
      IF v_own.strict_snapshot THEN
        RAISE EXCEPTION '90 post-check failed (clone/dev): campaign % checksum % differs from the forward snapshot %', r.campaign_id, r.now_sum, r.snap_sum;
      ELSE
        RAISE WARNING '90: campaign % checksum differs from the forward snapshot (moved since the forward run)', r.campaign_id;
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(v_snap->'checksums')) <> (SELECT count(*) FROM public.campaigns c WHERE v_snap->'checksums' ? c.campaign_id::text) THEN
    RAISE EXCEPTION '90 post-check failed: a campaign in the snapshot is missing';
  END IF;

  -- Referential integrity across every logged table (user triggers were off; FK triggers were
  -- not, but the relaxed-and-completed path is verified here explicitly).
  FOR r IN
    SELECT e.child, e.col, e.parent, e.refcol, e.conname FROM _da02_edges e
    WHERE e.child IN (SELECT table_name FROM _da02_pending) OR e.parent IN (SELECT table_name FROM _da02_pending)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%I p WHERE p.%I = c.%I)',
                   r.child, r.col, r.parent, r.refcol, r.col) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '90 post-check failed: % orphan row(s) in %.% (FK %)', v_count, r.child, r.col, r.conname;
    END IF;
  END LOOP;

  -- Trigger states exactly as before this run.
  IF EXISTS (
    SELECT 1 FROM _da02_trig_before b
    JOIN pg_class cl ON cl.relname = b.tbl JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_trigger tg ON tg.tgrelid = cl.oid AND tg.tgname = b.tgname
    WHERE tg.tgenabled::text IS DISTINCT FROM b.tgenabled
  ) THEN
    RAISE EXCEPTION '90 post-check failed: a trigger state differs from before the run';
  END IF;
END;
$postconditions$;

SELECT
  (SELECT count(*) FROM _da02_pending WHERE action = 'delete')                          AS rows_reinserted,
  (SELECT count(*) FROM _da02_pending WHERE action = 'update' AND table_name <> '_da02_snapshot') AS rows_restored,
  (SELECT count(*) FROM _da02_fixups)                                                   AS rows_relaxed_then_completed,
  (SELECT count(*) FROM _da02_log_ids)                                                  AS rollback_log_rows,
  (SELECT count(*) FROM public.workers WHERE is_active)                                 AS workers_active,
  (SELECT workers_active FROM _da02_before)                                             AS workers_active_before_this_run,
  (SELECT before_state->>'workers_active' FROM _da02_snapshot)                          AS workers_active_forward_snapshot,
  (SELECT strict_snapshot FROM _da02_before)                                            AS snapshot_equality_enforced;

COMMIT;

-- Read-only verification (da0.2.md §3.3): run after COMMIT in the same or a separate
-- submission. Expected: forward_rows_pending 0, campaigns_15_37 2, employers_787_794 8,
-- worksites_196_199 4, workers_active = this run's before + 664 (on the clone rehearsal that is
-- the preflight figure, 2293; on production 5749 only if nothing moved since the forward run),
-- w1536 'emp=791 ws=197 cwm=37/50/64'. Then re-run 00_preflight.sql and compare every section
-- with the pre-forward output: identical apart from the two section-K rows that count the log
-- (`hygiene_log rows=` and `hygiene_log_da02_pending/rolled_back`).
SELECT
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL) AS forward_rows_pending,
  (SELECT count(*) FROM public.campaigns WHERE campaign_id IN (15, 37))                                            AS campaigns_15_37,
  (SELECT count(*) FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))            AS employers_787_794,
  (SELECT count(*) FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199))                                AS worksites_196_199,
  (SELECT count(*) FROM public.workers WHERE is_active)                                                            AS workers_active,
  (SELECT 'emp=' || employer_id || ' ws=' || worksite_id || ' cwm=' ||
          coalesce((SELECT string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership m WHERE m.worker_id = 1536), '')
   FROM public.workers WHERE worker_id = 1536)                                                                     AS w1536;
