-- DA0.2 data run sheet: remove the synthetic dataset (docs/data-architecture/wp/da0.2.md §3.2).
-- Operator-run only; never a migration. One transaction. Rehearsed on the clone
-- (forward → 90_rollback.sql → forward again) before the operator runs it on production.
--
-- Scope (OA_UNIVERSE_ALIGNMENT_PLAN.md §5 row DA0.2, decisions D4 and D16; the ids are
-- pinned by name in the preconditions, so a database whose rows differ stops here):
--   * campaigns 15 (Test2) and 37 (testco) with every row that hangs off them;
--   * the 664 workers whose employer is one of 787, 788, 789, 790, 791, 792, 793, 794 or
--     whose worksite is one of 196, 197, 198, 199 — all except worker 1536 — with every row
--     that hangs off them;
--   * projects 18–21, program 6, worksites 196–199, employers 787–794 and their junction rows;
--   * worker 1536 (D16) is KEPT: its membership of campaign 64 (and any placement / activist
--     profile of campaign 64) is removed, its membership of 37 goes with the campaign, and the
--     row is re-pointed to employer 741 / worksite 185 before worksites 196–199 are deleted.
--     Afterwards it is a member of campaign 50 only.
-- Order: A1 (1536's campaign-64 rows) → B campaigns → C workers → D projects → E program →
-- A2 (re-point 1536) → F worksites → G employers. The order is forced by the NO ACTION foreign
-- keys workers.employer_id, workers.worksite_id, workers.project_id, projects.worksite_id,
-- programs.principal_employer_id and worksites.principal_employer_id (da0.2.md §3.1.1).
--
-- How rows are removed (da0.2.md §3.2): FIRST the transitive closure of every root — rows
-- reachable over ON DELETE CASCADE foreign keys (plus the three NO ACTION campaign children
-- campaign_stage_plans, gate_definitions and reporting_snapshots, which would otherwise block
-- the campaign delete) — is computed from pg_constraint into a temp table for all six roots;
-- THEN every row outside that closure which an ON DELETE SET NULL key (self-referencing keys
-- included) would null is logged as 'update' (full before_row) and nulled explicitly; THEN,
-- root by root in the stated order, every closure row is written to public._oux_hygiene_log
-- (WP0.4 shape: action 'delete', row_pk, before_row = the full row as jsonb) and deleted
-- explicitly, children before parents (a topological order over the foreign keys between the
-- root's tables), so the FK cascades find nothing left to do. A row that is both a SET NULL
-- target and part of the closure is therefore logged once, as a delete (review finding 1).
-- Every table's row count is asserted afterwards: count fell by exactly the rows logged,
-- nothing else moved. 90_rollback.sql reinserts the logged rows (serial ids included — every
-- affected primary key is a plain serial or an IDENTITY BY DEFAULT column, da0.2.md §3.4
-- item 6) and restores the updated rows.
--
-- Triggers (da0.2.md §3.4): the four row-level DELETE triggers in public are
-- campaigns.trg_prevent_live_sms_episode_delete (15 and 37 are not SMS episodes; asserted),
-- call_list_scripts.trg_cls_sync_current (nulls call_lists.script_id on a row that is itself
-- being deleted), campaign_agreements.trg_sync_campaign_replaced_agreement and
-- worker_campaign_facts.trg_worker_campaign_fact_history (writes worker_campaign_fact_history,
-- a table with no foreign key); the preconditions assert 0 rows in scope for the last two, so
-- neither fires. The A2 UPDATE of worker 1536 fires trg_workers_updated_at (updated_at
-- advances; expected) and fn_activist_profile_on_role_change, which can only re-create an
-- activist profile for a campaign 1536 is still a member of — that is why A2 runs after B and
-- A1, and why the post-check pins 1536's profiles to campaign 50 alone. RLS does not apply:
-- postgres owns the tables and has BYPASSRLS.
--
-- Not idempotent by design: a second run stops at the preconditions. A production operator
-- must add SET LOCAL oux.env = 'production'; immediately after BEGIN in this same submission.
-- The committed file omits that line and names no project. Run it in a quiet window: the
-- three tables organisers write most (workers, campaign_worker_membership, campaign_worker_ou)
-- are locked IN SHARE ROW EXCLUSIVE MODE for the transaction so a concurrent writer waits
-- rather than fails; a concurrent write to any other affected table aborts the transaction at
-- the count assertions, harmlessly (re-run).

BEGIN;

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

-- Review finding 10: a concurrent sync-on-open or wall-chart write waits for this transaction
-- instead of making the count assertions fail late.
LOCK TABLE public.workers, public.campaign_worker_membership, public.campaign_worker_ou IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- Catalogue-derived helpers (temp; dropped at COMMIT).
-- ---------------------------------------------------------------------------

-- Single-column foreign keys in public (self-referencing keys included: they take part in the
-- SET NULL step and in the delete ordering, not in the closure walk), with the three NO ACTION
-- campaign children promoted to 'c' (cascade-like) because the plan deletes them explicitly
-- ahead of the campaign rows.
CREATE TEMP TABLE _da02_edges ON COMMIT DROP AS
SELECT cl.relname::text  AS child,
       a.attname::text   AS col,
       pcl.relname::text AS parent,
       ra.attname::text  AS refcol,
       format_type(ra.atttypid, ra.atttypmod) AS ref_type,
       CASE WHEN pcl.relname = 'campaigns'
             AND cl.relname IN ('campaign_stage_plans', 'gate_definitions', 'reporting_snapshots')
            THEN 'c' ELSE c.confdeltype::text END AS del,
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

-- Primary-key expressions per table: the jsonb row_pk builder, the column list and the
-- expression that reads the key back out of row_pk.
CREATE TEMP TABLE _da02_pk ON COMMIT DROP AS
SELECT cl.relname::text AS tbl,
       string_agg(format('%L, t.%I', a.attname, a.attname), ', ' ORDER BY k.ord)                       AS pk_json_args,
       string_agg(format('t.%I', a.attname), ', ' ORDER BY k.ord)                                      AS pk_cols,
       string_agg(format('(d.row_pk->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY k.ord) AS pk_from_json
FROM pg_constraint p
JOIN pg_class cl ON cl.oid = p.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS k(attnum, ord)
JOIN pg_attribute a ON a.attrelid = p.conrelid AND a.attnum = k.attnum
WHERE p.contype = 'p' AND n.nspname = 'public'
GROUP BY cl.relname;

-- Every row this run will delete, with the root that reached it first and its depth under
-- that root (0 = the root rows themselves).
CREATE TEMP TABLE _da02_doomed (
  seq        bigserial PRIMARY KEY,
  root       text  NOT NULL,
  root_ord   int   NOT NULL,
  table_name text  NOT NULL,
  depth      int   NOT NULL,
  row_pk     jsonb NOT NULL,
  row_data   jsonb NOT NULL,
  UNIQUE (table_name, row_pk)
) ON COMMIT DROP;

-- Row counts of every ordinary table in public before anything moves.
CREATE TEMP TABLE _da02_counts_before ON COMMIT DROP AS
SELECT cl.relname::text AS tbl,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', cl.relname), false, true, '')))[1]::text::bigint AS n
FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public' AND cl.relkind = 'r'
  AND cl.relname NOT IN ('_oux_hygiene_log', '_oux_env_marker');

-- Per-campaign membership and placement checksums before anything moves (verification standard
-- in ORCHESTRATION_PROMPT.md: count(*) + md5 over campaign_worker_membership, and over
-- campaign_worker_ou with ou_id).
CREATE TEMP TABLE _da02_checksums_before ON COMMIT DROP AS
WITH m AS (SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h
           FROM public.campaign_worker_membership GROUP BY campaign_id),
     o AS (SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
           FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id)
SELECT c.campaign_id, coalesce(m.n, 0) AS mem_n, m.h AS mem_md5, coalesce(o.n, 0) AS ou_n, o.h AS ou_md5
FROM public.campaigns c LEFT JOIN m ON m.campaign_id = c.campaign_id LEFT JOIN o ON o.campaign_id = c.campaign_id;

CREATE TEMP TABLE _da02_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.workers)                   AS workers_total,
       (SELECT count(*) FROM public.workers WHERE is_active)   AS workers_active,
       (SELECT to_jsonb(w) FROM public.workers w WHERE worker_id = 1536) AS w1536_row,
       (SELECT count(*) FROM public._oux_hygiene_log)          AS log_rows;

CREATE TEMP TABLE _da02_log_ids (log_id bigint PRIMARY KEY) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- Preconditions: pin the exact scope (da0.2.md §3.2 and §3.0). Any other shape stops the file.
-- ---------------------------------------------------------------------------
DO $preconditions$
DECLARE
  v_count   bigint;
  v_txt     text;
  v_ids     int[];
  r         record;
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '10 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
  IF EXISTS (SELECT 1 FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION '10 STOP: a previous run of 10_remove_test_dataset is still in the log and not rolled back';
  END IF;

  -- The entities, by id AND name (D4 identified them by name; a renamed row is not the same row).
  SELECT string_agg(employer_id || '=' || employer_name, '|' ORDER BY employer_id) INTO v_txt
  FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794);
  IF v_txt IS DISTINCT FROM
     '787=TestCo Energy|788=Fortis Maintenance Services|789=Pacific Coatings & Insulation|790=Alliance Site Services|791=TestCo 2|792=Aegis Offshore Maintenance Pty Ltd|793=NorthStar Marine Coatings|794=Offshore Crew Services Ltd'
  THEN
    RAISE EXCEPTION '10 STOP: employers 787–794 are not the eight synthetic employers by id and name (found: %)', v_txt;
  END IF;
  SELECT string_agg(worksite_id || '=' || worksite_name, '|' ORDER BY worksite_id) INTO v_txt
  FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199);
  IF v_txt IS DISTINCT FROM
     '196=Test Onshore Gas Plant|197=TEST · TestCo 2 — Alpha FPSO|198=TEST · TestCo 2 — Bravo Platform|199=TEST · TestCo 2 — Charlie FPU'
  THEN
    RAISE EXCEPTION '10 STOP: worksites 196–199 are not the four TEST worksites by id and name (found: %)', v_txt;
  END IF;
  SELECT string_agg(campaign_id || '=' || name, '|' ORDER BY campaign_id) INTO v_txt
  FROM public.campaigns WHERE campaign_id IN (15, 37);
  IF v_txt IS DISTINCT FROM '15=Test2|37=testco' THEN
    RAISE EXCEPTION '10 STOP: campaigns 15 and 37 are not the two test campaigns by id and name (found: %)', v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = 15 AND NOT is_sms_episode AND NOT is_standing AND parent_campaign_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = 37 AND NOT is_sms_episode AND NOT is_standing AND parent_campaign_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.campaigns WHERE parent_campaign_id IN (15, 37))
  THEN
    RAISE EXCEPTION '10 STOP: campaign 15 or 37 is an SMS episode, the standing campaign, or part of a family';
  END IF;
  IF (SELECT string_agg(program_id || '=' || program_name, '|') FROM public.programs WHERE program_id = 6)
     IS DISTINCT FROM '6=TEST · TestCo 2 Offshore Maintenance Program' THEN
    RAISE EXCEPTION '10 STOP: program 6 is not the TEST program by id and name';
  END IF;
  SELECT string_agg(project_id || '=' || worksite_id, '|' ORDER BY project_id) INTO v_txt
  FROM public.projects WHERE project_id IN (18, 19, 20, 21);
  IF v_txt IS DISTINCT FROM '18=196|19=197|20=198|21=199' THEN
    RAISE EXCEPTION '10 STOP: projects 18–21 are not on worksites 196–199 (found: %)', v_txt;
  END IF;
  IF (SELECT count(*) FROM public.projects WHERE project_id IN (18, 19, 20, 21) AND project_name NOT ILIKE '%test%') <> 0 THEN
    RAISE EXCEPTION '10 STOP: a project among 18–21 is not named as a TEST project';
  END IF;

  -- The keep targets for 1536.
  IF (SELECT employer_name FROM public.employers WHERE employer_id = 741) IS DISTINCT FROM 'Australian Workers'' Union WA Branch' THEN
    RAISE EXCEPTION '10 STOP: employer 741 is not AWU WA Branch';
  END IF;
  IF (SELECT worksite_name FROM public.worksites WHERE worksite_id = 185) IS DISTINCT FROM 'AWU Head Office' THEN
    RAISE EXCEPTION '10 STOP: worksite 185 is not AWU Head Office';
  END IF;

  -- The 664 workers: the employer/worksite filter minus 1536, every one on a TEST worksite,
  -- every one active, none with the membership-system key (reference_id), and the synthetic
  -- member_number values not shared with any other worker (da0.2.md §3.0, operator input P1).
  SELECT count(*) INTO v_count FROM public.workers
  WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536;
  IF v_count <> 664 THEN
    RAISE EXCEPTION '10 STOP: expected 664 workers in scope (employers 787–794 / worksites 196–199, excluding 1536), found %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.workers
  WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536
    AND (worksite_id IS NULL OR worksite_id NOT IN (196, 197, 198, 199) OR NOT is_active OR reference_id IS NOT NULL);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % worker(s) in scope are off a TEST worksite, inactive, or carry a reference_id', v_count;
  END IF;
  SELECT array_agg(worker_id ORDER BY worker_id) INTO v_ids FROM public.workers
  WHERE worksite_id IN (196, 197, 198, 199) AND employer_id IS NULL;
  IF v_ids IS DISTINCT FROM ARRAY[681, 1537] THEN
    RAISE EXCEPTION '10 STOP: the employer-less workers on TEST worksites are not exactly 681 and 1537 (found %)', v_ids;
  END IF;
  SELECT count(*) INTO v_count FROM public.workers s
  WHERE (s.employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR s.worksite_id IN (196, 197, 198, 199)) AND s.worker_id <> 1536
    AND s.member_number IS NOT NULL
    AND (s.member_number !~ '^[A-Za-z][0-9]+$'
         OR EXISTS (SELECT 1 FROM public.workers o WHERE o.member_number = s.member_number AND o.worker_id <> s.worker_id
                    AND NOT (o.employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR o.worksite_id IN (196, 197, 198, 199))));
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % worker(s) in scope carry a member_number that is not of the synthetic shape or that a real worker also carries', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.workers WHERE project_id IN (18, 19, 20, 21)
    AND NOT ((employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % worker(s) outside the scope sit on projects 18–21', v_count;
  END IF;
  -- No membership or placement of the 664 outside campaigns 15 and 37 (so no other campaign checksum moves).
  SELECT count(*) INTO v_count FROM public.campaign_worker_membership m
  WHERE m.campaign_id NOT IN (15, 37) AND m.worker_id IN (SELECT worker_id FROM public.workers
    WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % membership row(s) of the 664 workers in campaigns other than 15/37', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id
  WHERE u.campaign_id NOT IN (15, 37) AND o.worker_id IN (SELECT worker_id FROM public.workers
    WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % placement row(s) of the 664 workers in campaigns other than 15/37', v_count;
  END IF;

  -- Worker 1536 (D16): on 791/197, active, member of exactly 37, 50 and 64, activist profiles 37, 50, 64,
  -- no placement in campaign 64.
  SELECT string_agg(k || '=' || v, ',' ORDER BY k) INTO v_txt FROM (
    SELECT 'emp' k, employer_id::text v FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'ws', worksite_id::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'active', is_active::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'cwm', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership WHERE worker_id = 1536
    UNION ALL SELECT 'profiles', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_activist_profiles WHERE worker_id = 1536
    UNION ALL SELECT 'cwo64', count(*)::text FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id WHERE o.worker_id = 1536 AND u.campaign_id = 64
  ) x;
  IF v_txt IS DISTINCT FROM 'active=true,cwm=37/50/64,cwo64=0,emp=791,profiles=37/50/64,ws=197' THEN
    RAISE EXCEPTION '10 STOP: worker 1536 is not in its expected state (found %)', v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = 50) OR NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = 64) THEN
    RAISE EXCEPTION '10 STOP: campaign 50 or 64 is missing';
  END IF;

  -- Structural junction rows, pinned by id.
  SELECT string_agg(id || ':' || employer_id || ':' || worksite_id, ',' ORDER BY id) INTO v_txt
  FROM public.employer_worksite_roles WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199);
  IF v_txt IS DISTINCT FROM '82:787:196,83:788:196,84:789:196,85:790:196,87:791:197,89:793:197,91:791:198,93:793:198,95:791:199,97:793:199' THEN
    RAISE EXCEPTION '10 STOP: the employer–worksite roles in scope are not the ten expected rows (found %)', v_txt;
  END IF;
  SELECT string_agg(id || ':' || worksite_id, ',' ORDER BY id) INTO v_txt FROM public.program_worksites WHERE program_id = 6;
  IF v_txt IS DISTINCT FROM '13:197,14:198,15:199' THEN
    RAISE EXCEPTION '10 STOP: program_worksites of program 6 are not rows 13–15 on 197–199 (found %)', v_txt;
  END IF;
  SELECT string_agg(campaign_id || ':' || employer_id, ',' ORDER BY campaign_id) INTO v_txt FROM public.campaign_employers WHERE campaign_id IN (15, 37);
  IF v_txt IS DISTINCT FROM '15:791,37:791' THEN
    RAISE EXCEPTION '10 STOP: campaign_employers of 15/37 are not 791 alone (found %)', v_txt;
  END IF;
  SELECT string_agg(campaign_id || ':' || coalesce(worksite_id::text, 'sector'), ',' ORDER BY campaign_id, worksite_id) INTO v_txt
  FROM public.campaign_worksites WHERE campaign_id IN (15, 37);
  IF v_txt IS DISTINCT FROM '15:197,15:198,15:199,37:197,37:198,37:199' THEN
    RAISE EXCEPTION '10 STOP: campaign_worksites of 15/37 are not 197–199 (found %)', v_txt;
  END IF;
  SELECT string_agg(campaign_id || ':' || ou_id || ':' || coalesce(group_id::text, '-'), ',' ORDER BY ou_id) INTO v_txt
  FROM public.campaign_organising_units WHERE campaign_id IN (15, 37);
  IF v_txt IS DISTINCT FROM '37:25:3,37:26:3,37:27:3' THEN
    RAISE EXCEPTION '10 STOP: the organising units of 15/37 are not 25–27 in group 3 (found %)', v_txt;
  END IF;
  IF (SELECT string_agg(group_id::text, ',') FROM public.campaign_groups WHERE campaign_id IN (15, 37)) IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION '10 STOP: campaign 37 does not own exactly group 3';
  END IF;

  -- NO ACTION references into the scope that the stated order does not resolve (da0.2.md §3.1.1).
  IF (SELECT string_agg(worksite_id::text, ',' ORDER BY worksite_id) FROM public.worksites
        WHERE principal_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR operator_id IN (787, 788, 789, 790, 791, 792, 793, 794))
     IS DISTINCT FROM '196,197,198,199' THEN
    RAISE EXCEPTION '10 STOP: a worksite outside 196–199 names a synthetic employer as principal or operator';
  END IF;
  IF (SELECT string_agg(program_id::text, ',') FROM public.programs WHERE principal_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))
     IS DISTINCT FROM '6' THEN
    RAISE EXCEPTION '10 STOP: a program other than 6 names a synthetic employer as principal';
  END IF;
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.employers WHERE parent_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.worksites WHERE parent_worksite_id IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.agreements WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.documents WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR campaign_id IN (15, 37)
    UNION ALL SELECT 1 FROM public.worksite_contracts WHERE contractor_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
                                                         OR worksite_id IN (196, 197, 198, 199) OR program_id = 6 OR project_id IN (18, 19, 20, 21)
    UNION ALL SELECT 1 FROM public.worksite_scopes WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND worksite_id NOT IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.projects WHERE absorbed_into_project_id IN (18, 19, 20, 21)
    UNION ALL SELECT 1 FROM public.campaign_employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND campaign_id NOT IN (15, 37)
    UNION ALL SELECT 1 FROM public.campaign_worksites WHERE worksite_id IN (196, 197, 198, 199) AND campaign_id NOT IN (15, 37)
    UNION ALL SELECT 1 FROM public.campaign_organising_units WHERE campaign_id NOT IN (15, 37)
      AND unit_basis::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M'
    UNION ALL SELECT 1 FROM public.campaign_unit_rules cur WHERE cur.campaign_id NOT IN (15, 37)
      AND row_to_json(cur)::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M'
  ) x;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % reference(s) into the scope from rows the plan does not delete (see da0.2.md §3.1.2 cross-checks)', v_count;
  END IF;

  -- The two DELETE triggers whose tables are not otherwise pinned (review finding 7): 0 rows in scope.
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.worker_campaign_facts WHERE campaign_id IN (15, 37) OR worker_id IN (SELECT worker_id FROM public.workers
      WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536)
    UNION ALL SELECT 1 FROM public.campaign_agreements WHERE campaign_id IN (15, 37)
  ) x;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % row(s) in worker_campaign_facts / campaign_agreements for the scope (their DELETE triggers are not part of this plan)', v_count;
  END IF;

  -- Every table this run may touch has a primary key, and no composite foreign key points at one
  -- of the root tables (the closure walk follows single-column keys only).
  FOR r IN SELECT DISTINCT child FROM _da02_edges WHERE child NOT IN (SELECT tbl FROM _da02_pk) LOOP
    IF EXISTS (SELECT 1 FROM _da02_edges e WHERE e.child = r.child AND e.del = 'c') THEN
      RAISE EXCEPTION '10 STOP: table % has a cascading foreign key but no primary key; rows could not be logged for rollback', r.child;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class pcl ON pcl.oid = c.confrelid JOIN pg_namespace n ON n.oid = pcl.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) > 1
      AND pcl.relname IN ('workers', 'employers', 'worksites', 'campaigns', 'programs', 'projects')
  ) THEN
    RAISE EXCEPTION '10 STOP: a composite foreign key references a root table; the closure walk does not follow it';
  END IF;
END;
$preconditions$;

-- ---------------------------------------------------------------------------
-- The collector, the SET NULL step and the remover: session-temporary functions (pg_temp);
-- dropped before COMMIT so nothing outlives the transaction (review finding 14).
-- ---------------------------------------------------------------------------

-- 1. Collect one root's rows and its cascade closure, breadth first. A row already collected
--    under an earlier root stays there.
CREATE FUNCTION pg_temp.da02_collect_root(p_root text, p_root_ord int, p_table text, p_filter text)
RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE
  v_depth int := 0;
  v_added bigint;
  v_n     bigint;
  e       record;
  pk      record;
BEGIN
  SELECT * INTO pk FROM _da02_pk WHERE tbl = p_table;
  IF pk IS NULL THEN RAISE EXCEPTION 'da02: % has no primary key', p_table; END IF;
  EXECUTE format(
    'INSERT INTO _da02_doomed (root, root_ord, table_name, depth, row_pk, row_data)
     SELECT %L, %s, %L, 0, jsonb_build_object(%s), to_jsonb(t) FROM public.%I t WHERE %s
     ON CONFLICT (table_name, row_pk) DO NOTHING',
    p_root, p_root_ord, p_table, pk.pk_json_args, p_table, p_filter);
  LOOP
    v_added := 0;
    FOR e IN
      SELECT DISTINCT x.child, x.col, x.parent, x.refcol, x.ref_type
      FROM _da02_edges x
      WHERE x.del = 'c' AND NOT x.is_self
        AND x.parent IN (SELECT DISTINCT d.table_name FROM _da02_doomed d WHERE d.root = p_root AND d.depth = v_depth)
      ORDER BY x.child, x.col
    LOOP
      SELECT * INTO pk FROM _da02_pk WHERE tbl = e.child;
      IF pk IS NULL THEN RAISE EXCEPTION 'da02: % has no primary key', e.child; END IF;
      EXECUTE format(
        'INSERT INTO _da02_doomed (root, root_ord, table_name, depth, row_pk, row_data)
         SELECT %L, %s, %L, %s, jsonb_build_object(%s), to_jsonb(t)
         FROM public.%I t
         WHERE t.%I IN (SELECT (d.row_data->>%L)::%s FROM _da02_doomed d WHERE d.root = %L AND d.table_name = %L AND d.depth = %s)
         ON CONFLICT (table_name, row_pk) DO NOTHING',
        p_root, p_root_ord, e.child, v_depth + 1, pk.pk_json_args, e.child, e.col, e.refcol, e.ref_type, p_root, e.parent, v_depth);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_added := v_added + v_n;
    END LOOP;
    EXIT WHEN v_added = 0;
    v_depth := v_depth + 1;
    IF v_depth > 16 THEN RAISE EXCEPTION 'da02: cascade closure deeper than 16 under root %', p_root; END IF;
  END LOOP;
  RETURN (SELECT count(*) FROM _da02_doomed d WHERE d.root = p_root);
END;
$fn$;

-- 2. ON DELETE SET NULL, once, against the FULL closure of all six roots: rows outside the
--    closure that reference a closure row (self-referencing keys included) are logged as
--    'update' (full before_row) and nulled explicitly, one log row per (row, column). A row
--    inside the closure is never touched here — it is logged once, as a delete (finding 1).
CREATE FUNCTION pg_temp.da02_apply_set_null(p_step text)
RETURNS TABLE (table_name text, rows_set_null bigint)
LANGUAGE plpgsql AS $fn$
DECLARE
  e   record;
  pk  record;
  v_n bigint;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _da02_setnull (tbl text, n bigint) ON COMMIT DROP;
  FOR e IN
    SELECT DISTINCT x.child, x.col, x.parent, x.refcol, x.ref_type, x.conname
    FROM _da02_edges x
    WHERE x.del = 'n' AND x.parent IN (SELECT DISTINCT d.table_name FROM _da02_doomed d)
    ORDER BY x.child, x.col
  LOOP
    SELECT * INTO pk FROM _da02_pk WHERE tbl = e.child;
    IF pk IS NULL THEN RAISE EXCEPTION 'da02: % has no primary key', e.child; END IF;
    EXECUTE format(
      'WITH hit AS (
         SELECT jsonb_build_object(%s) AS row_pk, to_jsonb(t) AS row_data
         FROM public.%I t
         WHERE t.%I IN (SELECT (d.row_data->>%L)::%s FROM _da02_doomed d WHERE d.table_name = %L)
           AND NOT EXISTS (SELECT 1 FROM _da02_doomed x WHERE x.table_name = %L AND x.row_pk = jsonb_build_object(%s))
       ), logged AS (
         INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
         SELECT ''10_remove_test_dataset'', ''update'', %L, h.row_pk, h.row_data, h.row_data || jsonb_build_object(%L, NULL),
                %L
         FROM hit h RETURNING log_id
       ), remembered AS (
         INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM logged
       )
       UPDATE public.%I t SET %I = NULL
       FROM hit h WHERE jsonb_build_object(%s) = h.row_pk',
      pk.pk_json_args, e.child, e.col, e.refcol, e.ref_type, e.parent,
      e.child, pk.pk_json_args,
      e.child, e.col,
      format('DA0.2 (da0.2.md §3.2 step %s): %s.%s set NULL ahead of the delete of %s (FK %s ON DELETE SET NULL)', p_step, e.child, e.col, e.parent, e.conname),
      e.child, e.col, pk.pk_json_args);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN INSERT INTO _da02_setnull VALUES (e.child, v_n); END IF;
  END LOOP;
  RETURN QUERY SELECT s.tbl, sum(s.n)::bigint FROM _da02_setnull s GROUP BY s.tbl ORDER BY s.tbl;
END;
$fn$;

-- 3. Remove one root: log every closure row of the root (children before parents) and delete
--    in the same order. The order is topological over every foreign key between the root's
--    tables (CASCADE, NO ACTION and RESTRICT alike; SET NULL keys were resolved in step 2):
--    a table is deleted only once no other pending table of the root references it. A cycle,
--    if one ever appears, falls back to deepest-first with a NOTICE (review finding 6).
CREATE FUNCTION pg_temp.da02_remove_root(p_root text, p_step text)
RETURNS TABLE (table_name text, rows_deleted bigint)
LANGUAGE plpgsql AS $fn$
DECLARE
  pk       record;
  r        record;
  v_n      bigint;
  v_before bigint;
  v_after  bigint;
  v_ord    int := 0;
  v_pick   text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _da02_order (root text, tbl text, ord int, PRIMARY KEY (root, tbl)) ON COMMIT DROP;
  INSERT INTO _da02_order (root, tbl, ord)
  SELECT p_root, d.table_name, NULL FROM _da02_doomed d WHERE d.root = p_root GROUP BY d.table_name;
  LOOP
    SELECT o.tbl INTO v_pick
    FROM _da02_order o
    WHERE o.root = p_root AND o.ord IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM _da02_edges e JOIN _da02_order c ON c.root = p_root AND c.tbl = e.child AND c.ord IS NULL
        WHERE e.parent = o.tbl AND e.child <> o.tbl AND e.del IN ('c', 'a', 'r', 'd'))
    ORDER BY o.tbl LIMIT 1;
    IF v_pick IS NULL THEN
      SELECT o.tbl INTO v_pick
      FROM _da02_order o JOIN (SELECT d.table_name, max(d.depth) AS md FROM _da02_doomed d WHERE d.root = p_root GROUP BY d.table_name) m ON m.table_name = o.tbl
      WHERE o.root = p_root AND o.ord IS NULL ORDER BY m.md DESC, o.tbl LIMIT 1;
      EXIT WHEN v_pick IS NULL;
      RAISE NOTICE 'da02: foreign-key cycle among the tables of root %; % taken deepest-first', p_root, v_pick;
    END IF;
    v_ord := v_ord + 1;
    UPDATE _da02_order SET ord = v_ord WHERE root = p_root AND tbl = v_pick;
  END LOOP;

  WITH logged AS (
    INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
    SELECT '10_remove_test_dataset', 'delete', d.table_name, d.row_pk, d.row_data, NULL,
           format('DA0.2 (da0.2.md §3.2 step %s): root %s depth %s', p_step, p_root, d.depth)
    FROM _da02_doomed d JOIN _da02_order o ON o.root = p_root AND o.tbl = d.table_name
    WHERE d.root = p_root
    ORDER BY o.ord, d.depth DESC, d.seq
    RETURNING log_id
  )
  INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM logged;

  FOR r IN
    SELECT o.tbl, o.ord, (SELECT count(*) FROM _da02_doomed d WHERE d.root = p_root AND d.table_name = o.tbl) AS n
    FROM _da02_order o WHERE o.root = p_root ORDER BY o.ord
  LOOP
    SELECT * INTO pk FROM _da02_pk WHERE tbl = r.tbl;
    EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO v_before;
    EXECUTE format(
      'DELETE FROM public.%I t WHERE (%s) IN (SELECT %s FROM _da02_doomed d WHERE d.root = %L AND d.table_name = %L)',
      r.tbl, pk.pk_cols, pk.pk_from_json, p_root, r.tbl);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO v_after;
    -- What must never happen is a row vanishing that was not logged: the table's count may only
    -- fall by rows in the closure (a same-root cascade may already have taken some of them).
    IF v_before - v_after > v_n OR v_n > r.n THEN
      RAISE EXCEPTION 'da02: deleting % under % removed % row(s) (expected at most %, count fell by %)',
        r.tbl, p_root, v_n, r.n, v_before - v_after;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT d.table_name, count(*)::bigint FROM _da02_doomed d WHERE d.root = p_root GROUP BY d.table_name ORDER BY d.table_name;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Collect the closure of all six roots (finding 1) in the stated order, then check that no
-- closure row of a later root references a closure row of an earlier root through a
-- non-deferred NO ACTION / RESTRICT key (the stated root order would not resolve it).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _da02_summary (step text, root text, table_name text, rows_deleted bigint, rows_set_null bigint) ON COMMIT DROP;
CREATE TEMP TABLE _da02_collected (root text, root_ord int, n bigint) ON COMMIT DROP;

INSERT INTO _da02_collected SELECT 'campaigns', 1, pg_temp.da02_collect_root('campaigns', 1, 'campaigns', 'campaign_id IN (15, 37)');
INSERT INTO _da02_collected SELECT 'workers',   2, pg_temp.da02_collect_root('workers',   2, 'workers',
  '(employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536');
INSERT INTO _da02_collected SELECT 'projects',  3, pg_temp.da02_collect_root('projects',  3, 'projects',  'project_id IN (18, 19, 20, 21)');
INSERT INTO _da02_collected SELECT 'programs',  4, pg_temp.da02_collect_root('programs',  4, 'programs',  'program_id = 6');
INSERT INTO _da02_collected SELECT 'worksites', 5, pg_temp.da02_collect_root('worksites', 5, 'worksites', 'worksite_id IN (196, 197, 198, 199)');
INSERT INTO _da02_collected SELECT 'employers', 6, pg_temp.da02_collect_root('employers', 6, 'employers', 'employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)');

DO $cross_root$
DECLARE
  e       record;
  pk      record;
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM _da02_doomed WHERE table_name = 'workers') <> 664 THEN
    RAISE EXCEPTION '10 STOP: the closure holds % worker rows (expected 664)', (SELECT count(*) FROM _da02_doomed WHERE table_name = 'workers');
  END IF;
  FOR e IN
    SELECT x.child, x.col, x.parent, x.refcol, x.ref_type, x.conname FROM _da02_edges x
    WHERE x.del IN ('a', 'r') AND NOT x.is_deferrable AND NOT x.is_self
      AND x.child  IN (SELECT DISTINCT d.table_name FROM _da02_doomed d)
      AND x.parent IN (SELECT DISTINCT d.table_name FROM _da02_doomed d)
  LOOP
    SELECT * INTO pk FROM _da02_pk WHERE tbl = e.child;
    EXECUTE format(
      'SELECT count(*) FROM _da02_doomed c
       WHERE c.table_name = %L
         AND (c.row_data->>%L)::%s IN (SELECT (p.row_data->>%L)::%s FROM _da02_doomed p WHERE p.table_name = %L AND p.root_ord < c.root_ord)',
      e.child, e.col, e.ref_type, e.refcol, e.ref_type, e.parent) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '10 STOP: % closure row(s) of %.% reference closure rows of % deleted in an earlier step (FK %); the stated root order cannot resolve this', v_count, e.child, e.col, e.parent, e.conname;
    END IF;
  END LOOP;
END;
$cross_root$;

-- ---------------------------------------------------------------------------
-- A1. Worker 1536 leaves campaign 64 (D16): membership, any placement in a campaign-64 unit,
--     and the activist profile that fn_ensure_activist_profile derived from that membership.
-- ---------------------------------------------------------------------------
WITH doomed AS (
  SELECT 'campaign_worker_membership' AS table_name, jsonb_build_object('membership_id', m.membership_id) AS row_pk, to_jsonb(m) AS row_data
  FROM public.campaign_worker_membership m WHERE m.worker_id = 1536 AND m.campaign_id = 64
  UNION ALL
  SELECT 'campaign_worker_ou', jsonb_build_object('id', o.id), to_jsonb(o)
  FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id
  WHERE o.worker_id = 1536 AND u.campaign_id = 64
  UNION ALL
  SELECT 'campaign_activist_profiles', jsonb_build_object('profile_id', p.profile_id), to_jsonb(p)
  FROM public.campaign_activist_profiles p WHERE p.worker_id = 1536 AND p.campaign_id = 64
), logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT '10_remove_test_dataset', 'delete', d.table_name, d.row_pk, d.row_data, NULL,
         'DA0.2 (da0.2.md §3.2 step A1, D16): worker 1536 leaves campaign 64'
  FROM doomed d RETURNING log_id
)
INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM logged;

DELETE FROM public.campaign_worker_ou o
USING public.campaign_organising_units u
WHERE u.ou_id = o.ou_id AND o.worker_id = 1536 AND u.campaign_id = 64;
DELETE FROM public.campaign_activist_profiles WHERE worker_id = 1536 AND campaign_id = 64;
DELETE FROM public.campaign_worker_membership WHERE worker_id = 1536 AND campaign_id = 64;

-- ---------------------------------------------------------------------------
-- S. SET NULL against the full closure, then B–E: campaigns → workers → projects → program.
-- ---------------------------------------------------------------------------
INSERT INTO _da02_summary SELECT 'S', 'set-null', s.table_name, NULL, s.rows_set_null FROM pg_temp.da02_apply_set_null('S') s;

INSERT INTO _da02_summary SELECT 'B', 'campaigns', r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('campaigns', 'B') r;
INSERT INTO _da02_summary SELECT 'C', 'workers',   r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('workers',   'C') r;
INSERT INTO _da02_summary SELECT 'D', 'projects',  r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('projects',  'D') r;
INSERT INTO _da02_summary SELECT 'E', 'programs',  r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('programs',  'E') r;

-- ---------------------------------------------------------------------------
-- A2. Worker 1536 → AWU WA Branch (741) / AWU Head Office (185) (D16). Must precede F and G:
--     workers.employer_id and workers.worksite_id are NO ACTION. By now 1536's only campaign
--     is 50, so fn_activist_profile_on_role_change (AFTER UPDATE) finds nothing to add.
-- ---------------------------------------------------------------------------
WITH changed AS (
  UPDATE public.workers w
  SET employer_id = 741, worksite_id = 185
  WHERE w.worker_id = 1536 AND w.employer_id = 791 AND w.worksite_id = 197
  RETURNING w.*
), logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT '10_remove_test_dataset', 'update', 'workers', jsonb_build_object('worker_id', 1536),
         (SELECT b.w1536_row FROM _da02_before b), to_jsonb(c),
         'DA0.2 (da0.2.md §3.2 step A2, D16): test identity re-pointed to employer 741 / worksite 185 before the TestCo rows go'
  FROM changed c RETURNING log_id
)
INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM logged;

-- ---------------------------------------------------------------------------
-- F–G. Worksites → employers.
-- ---------------------------------------------------------------------------
INSERT INTO _da02_summary SELECT 'F', 'worksites', r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('worksites', 'F') r;
INSERT INTO _da02_summary SELECT 'G', 'employers', r.table_name, r.rows_deleted, NULL FROM pg_temp.da02_remove_root('employers', 'G') r;

DROP FUNCTION pg_temp.da02_collect_root(text, int, text, text);
DROP FUNCTION pg_temp.da02_apply_set_null(text);
DROP FUNCTION pg_temp.da02_remove_root(text, text);

-- ---------------------------------------------------------------------------
-- Post-assertions.
-- ---------------------------------------------------------------------------
DO $postconditions$
DECLARE
  v_before  record;
  v_count   bigint;
  v_txt     text;
  v_deletes bigint := (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'delete');
  v_updates bigint := (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'update');
  v_doomed  bigint := (SELECT count(*) FROM _da02_doomed);
  r         record;
BEGIN
  SELECT * INTO v_before FROM _da02_before;

  -- The entities are gone.
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.campaigns WHERE campaign_id IN (15, 37)
    UNION ALL SELECT 1 FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.programs WHERE program_id = 6
    UNION ALL SELECT 1 FROM public.projects WHERE project_id IN (18, 19, 20, 21)
    UNION ALL SELECT 1 FROM public.employer_worksite_roles WHERE id IN (82, 83, 84, 85, 87, 89, 91, 93, 95, 97)
  ) x;
  IF v_count <> 0 THEN RAISE EXCEPTION '10 post-check failed: % scoped row(s) still present', v_count; END IF;

  -- Workers: exactly 664 fewer, all of them active ones.
  IF (SELECT count(*) FROM public.workers) <> v_before.workers_total - 664
     OR (SELECT count(*) FROM public.workers WHERE is_active) <> v_before.workers_active - 664 THEN
    RAISE EXCEPTION '10 post-check failed: workers % → %, active % → % (expected both to fall by 664)',
      v_before.workers_total, (SELECT count(*) FROM public.workers),
      v_before.workers_active, (SELECT count(*) FROM public.workers WHERE is_active);
  END IF;
  IF (SELECT count(*) FROM _da02_doomed WHERE table_name = 'workers') <> 664 THEN
    RAISE EXCEPTION '10 post-check failed: % worker rows logged (expected 664)', (SELECT count(*) FROM _da02_doomed WHERE table_name = 'workers');
  END IF;

  -- Worker 1536: on 741/185, member of 50 only, profile for 50 only, no placement anywhere in 64.
  SELECT string_agg(k || '=' || v, ',' ORDER BY k) INTO v_txt FROM (
    SELECT 'emp' k, employer_id::text v FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'ws', worksite_id::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'active', is_active::text FROM public.workers WHERE worker_id = 1536
    UNION ALL SELECT 'cwm', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership WHERE worker_id = 1536
    UNION ALL SELECT 'profiles', string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_activist_profiles WHERE worker_id = 1536
    UNION ALL SELECT 'cwo64', count(*)::text FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id WHERE o.worker_id = 1536 AND u.campaign_id = 64
  ) x;
  IF v_txt IS DISTINCT FROM 'active=true,cwm=50,cwo64=0,emp=741,profiles=50,ws=185' THEN
    RAISE EXCEPTION '10 post-check failed: worker 1536 is not in its expected end state (found %)', v_txt;
  END IF;

  -- Every table: count fell by exactly the rows logged as deleted. Strict for every table in the
  -- foreign-key neighbourhood of the deleted rows (the doomed tables, the SET NULL tables and
  -- any table with a key to or from one of them); a warning for an unrelated table that moved
  -- while this ran (concurrent app writes on production; nothing here touches them).
  FOR r IN
    SELECT b.tbl, b.n AS before_n,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', b.tbl), false, true, '')))[1]::text::bigint AS after_n,
           coalesce((SELECT count(*) FROM _da02_doomed d WHERE d.table_name = b.tbl), 0)
             + CASE b.tbl WHEN 'campaign_worker_membership' THEN (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'delete' AND l.table_name = 'campaign_worker_membership' AND l.note LIKE '%step A1%')
                          WHEN 'campaign_worker_ou'         THEN (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'delete' AND l.table_name = 'campaign_worker_ou' AND l.note LIKE '%step A1%')
                          WHEN 'campaign_activist_profiles' THEN (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'delete' AND l.table_name = 'campaign_activist_profiles' AND l.note LIKE '%step A1%')
                          ELSE 0 END AS expected_drop,
           (b.tbl IN (SELECT d.table_name FROM _da02_doomed d)
            OR b.tbl IN (SELECT l.table_name FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id)
            OR b.tbl IN (SELECT e.child  FROM _da02_edges e WHERE e.parent IN (SELECT d.table_name FROM _da02_doomed d))
            OR b.tbl IN (SELECT e.parent FROM _da02_edges e WHERE e.child  IN (SELECT d.table_name FROM _da02_doomed d))) AS is_strict
    FROM _da02_counts_before b
  LOOP
    IF r.before_n - r.after_n <> r.expected_drop THEN
      IF r.is_strict THEN
        RAISE EXCEPTION '10 post-check failed: % went from % to % row(s); expected a drop of exactly %', r.tbl, r.before_n, r.after_n, r.expected_drop;
      ELSE
        RAISE WARNING '10: unrelated table % moved from % to % row(s) while this ran (not touched by this script)', r.tbl, r.before_n, r.after_n;
      END IF;
    END IF;
  END LOOP;

  -- Log rows: one per deleted row (closure + A1) plus the SET NULL and A2 updates.
  IF v_deletes <> v_doomed + (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'delete' AND l.note LIKE '%step A1%') THEN
    RAISE EXCEPTION '10 post-check failed: % delete rows logged for % doomed rows', v_deletes, v_doomed;
  END IF;
  IF (SELECT count(*) FROM public._oux_hygiene_log l JOIN _da02_log_ids i ON i.log_id = l.log_id WHERE l.action = 'update' AND l.table_name = 'workers') <> 1 THEN
    RAISE EXCEPTION '10 post-check failed: the A2 re-point of worker 1536 was not logged exactly once';
  END IF;

  -- Campaign checksums: every campaign other than 15, 37 and 64 identical; 64 lost exactly the one
  -- membership row of 1536 and kept its placements; 15 and 37 are gone.
  FOR r IN
    WITH m AS (SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h FROM public.campaign_worker_membership GROUP BY campaign_id),
         o AS (SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
               FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id)
    SELECT b.campaign_id, b.mem_n, b.mem_md5, b.ou_n, b.ou_md5,
           coalesce(m.n, 0) AS mem_n_after, m.h AS mem_md5_after, coalesce(o.n, 0) AS ou_n_after, o.h AS ou_md5_after,
           (c.campaign_id IS NOT NULL) AS still_there
    FROM _da02_checksums_before b
    LEFT JOIN public.campaigns c ON c.campaign_id = b.campaign_id
    LEFT JOIN m ON m.campaign_id = b.campaign_id LEFT JOIN o ON o.campaign_id = b.campaign_id
  LOOP
    IF r.campaign_id IN (15, 37) THEN
      IF r.still_there OR r.mem_n_after <> 0 OR r.ou_n_after <> 0 THEN
        RAISE EXCEPTION '10 post-check failed: campaign % still has rows', r.campaign_id;
      END IF;
    ELSIF r.campaign_id = 64 THEN
      IF r.mem_n_after <> r.mem_n - 1 OR r.ou_n_after <> r.ou_n OR r.ou_md5_after IS DISTINCT FROM r.ou_md5 THEN
        RAISE EXCEPTION '10 post-check failed: campaign 64 memberships % → % (expected −1), placements % → %', r.mem_n, r.mem_n_after, r.ou_n, r.ou_n_after;
      END IF;
    ELSE
      IF r.mem_n_after <> r.mem_n OR r.mem_md5_after IS DISTINCT FROM r.mem_md5 OR r.ou_n_after <> r.ou_n OR r.ou_md5_after IS DISTINCT FROM r.ou_md5 THEN
        RAISE EXCEPTION '10 post-check failed: campaign % checksum moved (memberships % → %, placements % → %)', r.campaign_id, r.mem_n, r.mem_n_after, r.ou_n, r.ou_n_after;
      END IF;
    END IF;
  END LOOP;

  -- 05_candidate_clusters.sql: no `test` worksite cluster and no `testco` employer cluster remain.
  SELECT count(*) INTO v_count FROM public.worksites
  WHERE split_part(trim(regexp_replace(regexp_replace(lower(worksite_name),
          '\m(mv|the|fpso|fpu|flng|platform|vessel|complex|offshore|onshore|plant|gas|lng|cpf|hub|island|project|construction)\M', ' ', 'g'),
          '[^a-z0-9]+', ' ', 'g')), ' ', 1) = 'test';
  IF v_count <> 0 THEN RAISE EXCEPTION '10 post-check failed: % worksite(s) still fall into the `test` cluster', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.employers
  WHERE split_part(trim(regexp_replace(regexp_replace(lower(employer_name),
          '\m(pty|ltd|limited|pl|inc|group|the|australia|australian|aust|international|pte|plc|asa|services|energy|offshore|marine)\M', ' ', 'g'),
          '[^a-z0-9]+', ' ', 'g')), ' ', 1) = 'testco';
  IF v_count <> 0 THEN RAISE EXCEPTION '10 post-check failed: % employer(s) still fall into the `testco` cluster', v_count; END IF;
END;
$postconditions$;

-- The run's snapshot: before/after counts and checksums, kept in the log so 90_rollback.sql can
-- prove it restored the exact before-state without needing this session's temp tables.
WITH snap AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT '10_remove_test_dataset', 'update', '_da02_snapshot',
         jsonb_build_object('snapshot', 'da0.2', 'taken_at', now()),
         jsonb_build_object(
           'workers_total',  b.workers_total,
           'workers_active', b.workers_active,
           'counts',    (SELECT jsonb_object_agg(tbl, n) FROM _da02_counts_before),
           'checksums', (SELECT jsonb_object_agg(campaign_id::text, jsonb_build_object('mem_n', mem_n, 'mem_md5', mem_md5, 'ou_n', ou_n, 'ou_md5', ou_md5)) FROM _da02_checksums_before),
           'w1536',     b.w1536_row),
         jsonb_build_object(
           'workers_total',  (SELECT count(*) FROM public.workers),
           'workers_active', (SELECT count(*) FROM public.workers WHERE is_active),
           'counts',    (SELECT jsonb_object_agg(cl.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', cl.relname), false, true, '')))[1]::text::bigint)
                         FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
                         WHERE n.nspname = 'public' AND cl.relkind = 'r' AND cl.relname NOT IN ('_oux_hygiene_log', '_oux_env_marker')),
           'checksums', (WITH m AS (SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h FROM public.campaign_worker_membership GROUP BY campaign_id),
                              o AS (SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
                                    FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id)
                         SELECT jsonb_object_agg(c.campaign_id::text, jsonb_build_object('mem_n', coalesce(m.n, 0), 'mem_md5', m.h, 'ou_n', coalesce(o.n, 0), 'ou_md5', o.h))
                         FROM public.campaigns c LEFT JOIN m ON m.campaign_id = c.campaign_id LEFT JOIN o ON o.campaign_id = c.campaign_id),
           'w1536',     (SELECT to_jsonb(w) FROM public.workers w WHERE worker_id = 1536),
           'rows_logged', (SELECT count(*) FROM _da02_log_ids)),
         'DA0.2 (da0.2.md §3.2): run snapshot — before_row is the state 90_rollback.sql must reproduce'
  FROM _da02_before b
  RETURNING log_id
)
INSERT INTO _da02_log_ids (log_id) SELECT log_id FROM snap;

SELECT s.step, s.root, s.table_name, s.rows_deleted, s.rows_set_null
FROM _da02_summary s
UNION ALL
SELECT 'Σ', 'all roots', 'rows logged (deletes + updates + snapshot)', (SELECT count(*) FROM _da02_log_ids), NULL
UNION ALL
SELECT 'Σ', 'workers', 'active before → after',
       (SELECT workers_active FROM _da02_before), (SELECT count(*) FROM public.workers WHERE is_active)
ORDER BY 1, 2, 3;

COMMIT;

-- Read-only verification (da0.2.md §3.2, step (h)): run after COMMIT in the same or a separate
-- submission. Expected on production (from the 22 Sep preflight): workers_active 5085,
-- workers_total 5900, campaigns_15_37 0, employers_787_794 0, worksites_196_199 0, roles 0,
-- w1536 'emp=741 ws=185 cwm=50', test_worksite_cluster 0, log_rows_pending 3139 and
-- snapshot_rows_logged 3138 (the snapshot counts the rows logged before its own row is
-- appended, so it is exactly one less than log_rows_pending). On the clone: workers_active
-- 1629, workers_total 1743, 2653 and 2652.
-- If any value differs, stop: run 90_rollback.sql and report.
SELECT
  (SELECT count(*) FROM public.workers WHERE is_active)                                                   AS workers_active,
  (SELECT count(*) FROM public.workers)                                                                   AS workers_total,
  (SELECT count(*) FROM public.campaigns WHERE campaign_id IN (15, 37))                                   AS campaigns_15_37,
  (SELECT count(*) FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))   AS employers_787_794,
  (SELECT count(*) FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199))                       AS worksites_196_199,
  (SELECT count(*) FROM public.employer_worksite_roles WHERE id IN (82, 83, 84, 85, 87, 89, 91, 93, 95, 97)) AS roles,
  (SELECT 'emp=' || employer_id || ' ws=' || worksite_id || ' cwm=' ||
          coalesce((SELECT string_agg(campaign_id::text, '/' ORDER BY campaign_id) FROM public.campaign_worker_membership m WHERE m.worker_id = 1536), '')
   FROM public.workers WHERE worker_id = 1536)                                                            AS w1536,
  (SELECT count(*) FROM public.worksites
   WHERE split_part(trim(regexp_replace(regexp_replace(lower(worksite_name),
           '\m(mv|the|fpso|fpu|flng|platform|vessel|complex|offshore|onshore|plant|gas|lng|cpf|hub|island|project|construction)\M', ' ', 'g'),
           '[^a-z0-9]+', ' ', 'g')), ' ', 1) = 'test')                                                    AS test_worksite_cluster,
  (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL) AS log_rows_pending,
  (SELECT after_row->>'rows_logged' FROM public._oux_hygiene_log
   WHERE script = '10_remove_test_dataset' AND table_name = '_da02_snapshot' AND rolled_back_at IS NULL
   ORDER BY log_id DESC LIMIT 1)                                                                          AS snapshot_rows_logged;
