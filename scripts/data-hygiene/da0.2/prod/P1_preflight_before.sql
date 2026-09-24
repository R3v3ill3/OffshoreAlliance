-- DA0.2 PRODUCTION RUN SHEET — step P1 (read-only)
-- Project: production (gteygwfgjvczanmrwgbr). Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. One submission = this whole file. Prepared by the agent from the committed scripts
-- in the parent folder; the agent never runs anything on production.
-- What it does: identity check of the synthetic set, the child-row closure, blockers, per-campaign checksums and worker 1536; changes nothing. Returns about 250 rows (section | k | v).
-- Expect: section E Σ = 3119 rows / 72 tables; F Σ = 16; G BLOCKER Σ = 2 (worker 1536 only); G2 all resolved; H cross-checks 0 apart from the four TEST worksites and program 6; scope_664_ids_md5 f6589df6e2507a35542632026c3d0c34; workers_active 5749 (or the current figure if a weekly batch has run since 22 Sep — say so). Any other BLOCKER row or a different md5: stop.
-- Paste back: all rows (copy the whole result grid).
-- If anything raises, the transaction (where there is one) has rolled back and nothing changed: paste the error and stop.

-- DA0.2 preflight (read-only): docs/data-architecture/wp/da0.2.md §3.1.
-- One statement, one result set of (section, k, v) rows, so the SQL editor shows everything in
-- a single submission. Operator on production; verifier on the clone. Run BEFORE
-- 10_remove_test_dataset.sql (the forward script's preconditions pin what this prints), AFTER
-- it (the acceptance evidence), after 90_rollback.sql (every section identical to the first
-- run apart from the two section-K rows that count the log) and after the second forward run
-- (identical to the first after-run, same exclusion).
--
-- Prints no personal data: ids, organisation / worksite / campaign names, counts, md5 digests
-- and catalogue names only. Nothing here writes.
--
-- Sections:
--   A identity      the ids the plan names, with the names found on this database
--   B workers       totals, the scope filter, per employer / worksite, the invariants D4 relies on
--   C w1536         worker 1536's state (D16)
--   D structure     roles, program_worksites, campaign junctions, units and groups in scope
--   E doomed        every table with rows the forward script will delete (transitive closure over
--                   ON DELETE CASCADE keys from the six roots plus the three NO ACTION campaign
--                   children it deletes explicitly), with the count per table
--   F set-null      rows outside the closure an ON DELETE SET NULL key will null, per (table, column),
--                   self-referencing keys included — exactly the 'update' rows 10 logs
--   G BLOCKER       rows outside the closure that reference it through a NO ACTION / RESTRICT key;
--                   the only acceptable rows are worker 1536's employer_id and worksite_id (re-pointed
--                   by step A2) — anything else stops the package
--   G2              NO ACTION keys between two closure tables and the closure rows that use them
--                   (10 orders its deletes over them; a count under a non-deferred key whose child
--                   is deleted in a later root than its parent stops 10 before any row moves)
--   H cross-checks  the references the deletion order must resolve (all expected 0 apart from the
--                   4 TEST worksites and program 6)
--   I checksums     per campaign: count(*) + md5 over campaign_worker_membership, and over
--                   campaign_worker_ou with ou_id (the verification standard)
--   J pack          the 00_profile_counts.sql rows this package moves, and the 05 test clusters
--   K environment   marker, hygiene log, matview, schema fingerprints, role capabilities

WITH RECURSIVE
scope_workers AS (
  SELECT worker_id FROM public.workers
  WHERE (employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)) AND worker_id <> 1536
),
fk AS (
  SELECT cl.relname::text COLLATE "C" AS child, a.attname::text COLLATE "C" AS col,
         pcl.relname::text COLLATE "C" AS parent, ra.attname::text COLLATE "C" AS refcol,
         format_type(ra.atttypid, ra.atttypmod) COLLATE "C" AS ref_type,
         CASE WHEN pcl.relname = 'campaigns' AND cl.relname IN ('campaign_stage_plans', 'gate_definitions', 'reporting_snapshots') THEN 'c'
              ELSE c.confdeltype::text END COLLATE "C" AS del,
         c.conname::text COLLATE "C" AS conname,
         (c.conrelid = c.confrelid) AS is_self,
         c.condeferrable AS is_deferrable
  FROM pg_constraint c
  JOIN pg_class cl  ON cl.oid  = c.conrelid
  JOIN pg_class pcl ON pcl.oid = c.confrelid
  JOIN pg_namespace n  ON n.oid  = cl.relnamespace
  JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
  JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = c.conkey[1]
  JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
  WHERE c.contype = 'f' AND n.nspname = 'public' AND pn.nspname = 'public'
    AND array_length(c.conkey, 1) = 1
),
roots(tbl, filter) AS (VALUES
  ('workers'::text COLLATE "C",   'worker_id IN (SELECT worker_id FROM public.workers WHERE (employer_id IN (787,788,789,790,791,792,793,794) OR worksite_id IN (196,197,198,199)) AND worker_id <> 1536)'::text COLLATE "C"),
  ('campaigns', 'campaign_id IN (15,37)'),
  ('employers', 'employer_id IN (787,788,789,790,791,792,793,794)'),
  ('worksites', 'worksite_id IN (196,197,198,199)'),
  ('programs',  'program_id = 6'),
  ('projects',  'project_id IN (18,19,20,21)')
),
walk AS (
  SELECT tbl, filter, 0 AS depth, tbl AS path FROM roots
  UNION ALL
  SELECT fk.child, format('%I IN (SELECT %I FROM public.%I WHERE %s)', fk.col, fk.refcol, fk.parent, w.filter), w.depth + 1, w.path || ' > ' || fk.child
  FROM walk w JOIN fk ON fk.parent = w.tbl AND fk.del = 'c' AND NOT fk.is_self
  WHERE w.depth < 8 AND position(' ' || fk.child || ' ' in ' ' || w.path || ' ') = 0
),
doomed AS (
  SELECT tbl, '(' || string_agg('(' || filter || ')', ' OR ') || ')' AS filter, max(depth) AS max_depth
  FROM walk GROUP BY tbl
),
doomed_counts AS (
  SELECT d.tbl, d.max_depth,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I WHERE %s', d.tbl, d.filter), false, true, '')))[1]::text::bigint AS n
  FROM doomed d
),
side AS (
  -- Rows OUTSIDE the closure that reference a closure row: F for SET NULL keys (self-referencing
  -- keys included, review finding 5), G for NO ACTION / RESTRICT / SET DEFAULT keys and for any
  -- self-referencing CASCADE key (a row it would take unlogged).
  SELECT CASE WHEN fk.del = 'n' THEN 'F set-null' ELSE 'G BLOCKER' END AS section,
         fk.child || '.' || fk.col || ' -> ' || fk.parent || CASE WHEN fk.is_self THEN ' (self, ' || fk.del || ')' ELSE '' END AS k,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I WHERE %I IN (SELECT %I FROM public.%I WHERE %s) AND NOT coalesce(%s, false)',
            fk.child, fk.col, fk.refcol, fk.parent, p.filter, coalesce(c.filter, 'false')), false, true, '')))[1]::text::bigint AS n
  FROM fk JOIN doomed p ON p.tbl = fk.parent LEFT JOIN doomed c ON c.tbl = fk.child
  WHERE fk.del IN ('n', 'a', 'r', 'd') OR (fk.is_self AND fk.del = 'c')
),
within AS (
  -- NO ACTION / RESTRICT keys between two closure tables, with the count of closure rows that
  -- reference a closure row through them (review finding 6). The forward script orders each
  -- root's deletes topologically over these; a non-deferred key whose child is deleted in a
  -- LATER root than its parent would stop it, so the count is printed here.
  SELECT 'G2 NO ACTION within closure' AS section,
         fk.child || '.' || fk.col || ' -> ' || fk.parent || CASE WHEN fk.is_deferrable THEN ' (deferrable)' ELSE '' END AS k,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I WHERE %I IN (SELECT %I FROM public.%I WHERE %s) AND %s',
            fk.child, fk.col, fk.refcol, fk.parent, p.filter, c.filter), false, true, '')))[1]::text::bigint AS n
  FROM fk JOIN doomed p ON p.tbl = fk.parent JOIN doomed c ON c.tbl = fk.child
  WHERE fk.del IN ('a', 'r') AND NOT fk.is_self
),
checks AS (
  SELECT campaign_id, count(*) n, md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) h
  FROM public.campaign_worker_membership GROUP BY campaign_id
),
checks_ou AS (
  SELECT u.campaign_id, count(*) n, md5(string_agg(o.worker_id || ':' || o.ou_id, ',' ORDER BY o.worker_id, o.ou_id)) h
  FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id GROUP BY u.campaign_id
)
SELECT section, k, v FROM (
  -- A identity ---------------------------------------------------------------------------------
  SELECT 'A identity' AS section, 'employer:' || employer_id AS k, employer_name || ' (created ' || created_at::date || ')' AS v
  FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794, 741)
  UNION ALL SELECT 'A identity', 'worksite:' || worksite_id, worksite_name || ' (created ' || created_at::date || ', principal ' || coalesce(principal_employer_id::text, 'null') || ')'
  FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199, 185)
  UNION ALL SELECT 'A identity', 'campaign:' || campaign_id, name || ' (created ' || created_at::date || ', status ' || status || ', episode ' || is_sms_episode || ', standing ' || is_standing || ', parent ' || coalesce(parent_campaign_id::text, 'null') || ')'
  FROM public.campaigns WHERE campaign_id IN (15, 37, 50, 64)
  UNION ALL SELECT 'A identity', 'program:' || program_id, program_name || ' (principal ' || coalesce(principal_employer_id::text, 'null') || ')' FROM public.programs WHERE program_id = 6
  UNION ALL SELECT 'A identity', 'project:' || project_id, project_name || ' (worksite ' || worksite_id || ')' FROM public.projects WHERE project_id IN (18, 19, 20, 21)
  UNION ALL SELECT 'A identity', 'ids_present', ((SELECT count(*) FROM public.employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)) || ' employers, ' ||
                                                 (SELECT count(*) FROM public.worksites WHERE worksite_id IN (196, 197, 198, 199)) || ' worksites, ' ||
                                                 (SELECT count(*) FROM public.campaigns WHERE campaign_id IN (15, 37)) || ' campaigns, ' ||
                                                 (SELECT count(*) FROM public.programs WHERE program_id = 6) || ' program, ' ||
                                                 (SELECT count(*) FROM public.projects WHERE project_id IN (18, 19, 20, 21)) || ' projects (expected 8, 4, 2, 1, 4)')
  -- B workers ----------------------------------------------------------------------------------
  UNION ALL SELECT 'B workers', 'all_total/active', (SELECT count(*) FROM public.workers) || '/' || (SELECT count(*) FROM public.workers WHERE is_active)
  UNION ALL SELECT 'B workers', 'scope_incl_1536', (SELECT count(*) FROM public.workers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199))::text
  UNION ALL SELECT 'B workers', 'scope_664_total/active', (SELECT count(*) FROM scope_workers) || '/' || (SELECT count(*) FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND is_active)
  UNION ALL SELECT 'B workers', 'scope_664_ids_md5', (SELECT md5(string_agg(worker_id::text, ',' ORDER BY worker_id)) FROM scope_workers)
  UNION ALL SELECT 'B workers', 'by_employer:' || coalesce(employer_id::text, 'null'), count(*) || '/' || count(*) FILTER (WHERE is_active)
  FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY employer_id
  UNION ALL SELECT 'B workers', 'by_worksite:' || coalesce(worksite_id::text, 'null'), count(*) || '/' || count(*) FILTER (WHERE is_active)
  FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY worksite_id
  UNION ALL SELECT 'B workers', 'by_project:' || coalesce(project_id::text, 'null'), count(*)::text
  FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY project_id
  UNION ALL SELECT 'B workers', 'by_created:' || created_at::date, count(*) || ' (ids ' || min(worker_id) || '-' || max(worker_id) || ')'
  FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY created_at::date
  UNION ALL SELECT 'B workers', 'by_updated:' || updated_at::date, count(*)::text
  FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY updated_at::date
  UNION ALL SELECT 'B workers', 'employer_in_scope_but_worksite_not', (SELECT count(*) FROM public.workers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND (worksite_id IS NULL OR worksite_id NOT IN (196, 197, 198, 199)))::text
  UNION ALL SELECT 'B workers', 'worksite_in_scope_but_employer_not_ids', coalesce((SELECT string_agg(worker_id::text, ',' ORDER BY worker_id) FROM public.workers WHERE worksite_id IN (196, 197, 198, 199) AND (employer_id IS NULL OR employer_id NOT IN (787, 788, 789, 790, 791, 792, 793, 794))), 'none')
  UNION ALL SELECT 'B workers', 'reference_id_not_null', (SELECT count(*) FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND reference_id IS NOT NULL)::text
  UNION ALL SELECT 'B workers', 'member_number_not_null', (SELECT count(*) FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND member_number IS NOT NULL)::text
  UNION ALL SELECT 'B workers', 'member_number_shape', coalesce((SELECT string_agg(cls || '=' || n, ',' ORDER BY cls) FROM (
      SELECT CASE WHEN member_number IS NULL THEN 'null' WHEN member_number ~ '^[A-Za-z][0-9]+$' THEN 'alpha1digits:' || length(member_number) ELSE 'other' END cls, count(*) n
      FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) GROUP BY 1) x), '')
  UNION ALL SELECT 'B workers', 'member_number_shared_with_outside', (SELECT count(*) FROM public.workers s WHERE s.worker_id IN (SELECT worker_id FROM scope_workers) AND s.member_number IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.workers o WHERE o.member_number = s.member_number AND o.worker_id <> s.worker_id AND o.worker_id NOT IN (SELECT worker_id FROM scope_workers)))::text
  UNION ALL SELECT 'B workers', 'outside_scope_member_number_not_null/reference_id_not_null',
      (SELECT count(*) FROM public.workers WHERE worker_id NOT IN (SELECT worker_id FROM scope_workers) AND member_number IS NOT NULL) || '/' ||
      (SELECT count(*) FROM public.workers WHERE worker_id NOT IN (SELECT worker_id FROM scope_workers) AND reference_id IS NOT NULL)
  UNION ALL SELECT 'B workers', 'membership_sync_rows_for_664 (transitions/history)',
      (SELECT count(*) FROM public.worker_membership_transitions WHERE worker_id IN (SELECT worker_id FROM scope_workers)) || '/' ||
      (SELECT count(*) FROM public.worker_history WHERE worker_id IN (SELECT worker_id FROM scope_workers))
  UNION ALL SELECT 'B workers', 'cwm_664_other_campaigns', coalesce((SELECT string_agg(campaign_id || ':' || n, ',' ORDER BY campaign_id) FROM (SELECT campaign_id, count(*) n FROM public.campaign_worker_membership WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND campaign_id NOT IN (15, 37) GROUP BY 1) x), 'none')
  UNION ALL SELECT 'B workers', 'cwo_664_other_campaigns', coalesce((SELECT string_agg(campaign_id || ':' || n, ',' ORDER BY campaign_id) FROM (SELECT u.campaign_id, count(*) n FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id WHERE o.worker_id IN (SELECT worker_id FROM scope_workers) AND u.campaign_id NOT IN (15, 37) GROUP BY 1) x), 'none')
  UNION ALL SELECT 'B workers', 'phone_e164_shared_with_outside', (SELECT count(*) FROM public.workers s WHERE s.worker_id IN (SELECT worker_id FROM scope_workers) AND s.phone_e164 IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.workers o WHERE o.phone_e164 = s.phone_e164 AND o.worker_id NOT IN (SELECT worker_id FROM scope_workers)))::text
  UNION ALL SELECT 'B workers', 'email_shared_with_outside', (SELECT count(*) FROM public.workers s WHERE s.worker_id IN (SELECT worker_id FROM scope_workers) AND s.email IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.workers o WHERE lower(o.email) = lower(s.email) AND o.worker_id NOT IN (SELECT worker_id FROM scope_workers)))::text
  UNION ALL SELECT 'B workers', 'email_test_patterned (contains "test")', (SELECT count(*) FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND email ~* 'test')::text
  UNION ALL SELECT 'B workers', 'email_not_test_patterned_ids', coalesce((SELECT string_agg(worker_id::text, ',' ORDER BY worker_id) FROM public.workers WHERE worker_id IN (SELECT worker_id FROM scope_workers) AND (email IS NULL OR email !~* 'test')), 'none')
  UNION ALL SELECT 'B workers', 'name_collisions_with_outside (first+last)', (SELECT count(*) FROM public.workers s WHERE s.worker_id IN (SELECT worker_id FROM scope_workers)
      AND EXISTS (SELECT 1 FROM public.workers o WHERE lower(o.first_name) = lower(s.first_name) AND lower(o.last_name) = lower(s.last_name) AND o.worker_id NOT IN (SELECT worker_id FROM scope_workers)))::text
  UNION ALL SELECT 'B workers', 'workers_on_741/185', (SELECT count(*) FROM public.workers WHERE employer_id = 741) || '/' || (SELECT count(*) FROM public.workers WHERE worksite_id = 185)
  -- C w1536 ------------------------------------------------------------------------------------
  UNION ALL SELECT 'C w1536', 'row', 'emp=' || coalesce(employer_id::text, 'null') || ' ws=' || coalesce(worksite_id::text, 'null') || ' proj=' || coalesce(project_id::text, 'null') || ' active=' || is_active
      || ' role_type=' || coalesce(member_role_type_id::text, 'null') || ' activist_like=' || public.fn_role_type_is_activist_like(member_role_type_id)
      || ' member_number_null=' || (member_number IS NULL) || ' reference_id_null=' || (reference_id IS NULL) || ' created=' || created_at::date
  FROM public.workers WHERE worker_id = 1536
  UNION ALL SELECT 'C w1536', 'cwm (membership_id:campaign)', coalesce((SELECT string_agg(membership_id || ':' || campaign_id, ',' ORDER BY campaign_id) FROM public.campaign_worker_membership WHERE worker_id = 1536), 'none')
  UNION ALL SELECT 'C w1536', 'cwo (campaign:ou)', coalesce((SELECT string_agg(u.campaign_id || ':' || o.ou_id, ',' ORDER BY u.campaign_id) FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id WHERE o.worker_id = 1536), 'none')
  UNION ALL SELECT 'C w1536', 'activist_profiles (campaign)', coalesce((SELECT string_agg(campaign_id::text, ',' ORDER BY campaign_id) FROM public.campaign_activist_profiles WHERE worker_id = 1536), 'none')
  UNION ALL SELECT 'C w1536', 'rows_in_campaign_64', (SELECT string_agg(t || '=' || n, ',' ORDER BY t) FROM (
      SELECT 'campaign_worker_membership' t, count(*) n FROM public.campaign_worker_membership WHERE worker_id = 1536 AND campaign_id = 64
      UNION ALL SELECT 'campaign_worker_ou', count(*) FROM public.campaign_worker_ou o JOIN public.campaign_organising_units u ON u.ou_id = o.ou_id WHERE o.worker_id = 1536 AND u.campaign_id = 64
      UNION ALL SELECT 'campaign_activist_profiles', count(*) FROM public.campaign_activist_profiles WHERE worker_id = 1536 AND campaign_id = 64
      UNION ALL SELECT 'campaign_leader_worker_links', count(*) FROM public.campaign_leader_worker_links WHERE (leader_worker_id = 1536 OR follower_worker_id = 1536) AND campaign_id = 64
      UNION ALL SELECT 'campaign_worker_list_items', count(*) FROM public.campaign_worker_list_items i JOIN public.campaign_worker_lists l ON l.list_id = i.list_id WHERE i.worker_id = 1536 AND l.campaign_id = 64
      UNION ALL SELECT 'email_list_items', count(*) FROM public.email_list_items i JOIN public.email_lists l ON l.list_id = i.list_id WHERE i.worker_id = 1536 AND l.campaign_id = 64) x)
  UNION ALL SELECT 'C w1536', 'sms_conversations/sms_interactions/email_conversations (kept)',
      (SELECT count(*) FROM public.sms_conversations WHERE worker_id = 1536) || '/' || (SELECT count(*) FROM public.sms_interactions WHERE worker_id = 1536) || '/' || (SELECT count(*) FROM public.email_conversations WHERE worker_id = 1536)
  -- D structure --------------------------------------------------------------------------------
  UNION ALL SELECT 'D structure', 'employer_worksite_roles (id:employer:worksite)', coalesce((SELECT string_agg(id || ':' || employer_id || ':' || worksite_id, ',' ORDER BY id) FROM public.employer_worksite_roles WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199)), 'none')
  UNION ALL SELECT 'D structure', 'program_worksites_6 (id:worksite)', coalesce((SELECT string_agg(id || ':' || worksite_id, ',' ORDER BY id) FROM public.program_worksites WHERE program_id = 6), 'none')
  UNION ALL SELECT 'D structure', 'project_employers (project:employer)', coalesce((SELECT string_agg(project_id || ':' || employer_id, ',' ORDER BY project_id, employer_id) FROM public.project_employers WHERE project_id IN (18, 19, 20, 21) OR employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)), 'none')
  UNION ALL SELECT 'D structure', 'worksite_scopes/employer_scopes', (SELECT count(*) FROM public.worksite_scopes WHERE worksite_id IN (196, 197, 198, 199) OR employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)) || '/' || (SELECT count(*) FROM public.employer_scopes WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))
  UNION ALL SELECT 'D structure', 'campaign_employers_15_37', coalesce((SELECT string_agg(campaign_id || ':' || employer_id, ',' ORDER BY campaign_id, employer_id) FROM public.campaign_employers WHERE campaign_id IN (15, 37)), 'none')
  UNION ALL SELECT 'D structure', 'campaign_worksites_15_37', coalesce((SELECT string_agg(campaign_id || ':' || coalesce(worksite_id::text, 'sector'), ',' ORDER BY campaign_id, worksite_id) FROM public.campaign_worksites WHERE campaign_id IN (15, 37)), 'none')
  UNION ALL SELECT 'D structure', 'organising_units_15_37 (campaign:ou:group:container)', coalesce((SELECT string_agg(campaign_id || ':' || ou_id || ':' || coalesce(group_id::text, '-') || ':' || is_group_container, ',' ORDER BY ou_id) FROM public.campaign_organising_units WHERE campaign_id IN (15, 37)), 'none')
  UNION ALL SELECT 'D structure', 'campaign_groups_15_37 (campaign:group:kind)', coalesce((SELECT string_agg(campaign_id || ':' || group_id || ':' || kind, ',' ORDER BY group_id) FROM public.campaign_groups WHERE campaign_id IN (15, 37)), 'none')
  UNION ALL SELECT 'D structure', 'cwm_15_37_by_class', (SELECT string_agg(cls || '=' || n, ',' ORDER BY cls) FROM (SELECT CASE WHEN worker_id IN (SELECT worker_id FROM scope_workers) THEN 'in664' WHEN worker_id = 1536 THEN 'w1536' ELSE 'other' END cls, count(*) n FROM public.campaign_worker_membership WHERE campaign_id IN (15, 37) GROUP BY 1) x)
  UNION ALL SELECT 'D structure', 'activities/ratings_15_37', (SELECT count(*) FROM public.campaign_activities WHERE campaign_id IN (15, 37)) || '/' || (SELECT count(*) FROM public.campaign_activity_ratings r JOIN public.campaign_activities a ON a.activity_id = r.activity_id WHERE a.campaign_id IN (15, 37))
  UNION ALL SELECT 'D structure', 'delete_trigger_tables_in_scope (worker_campaign_facts / campaign_agreements)',
      (SELECT count(*) FROM public.worker_campaign_facts WHERE campaign_id IN (15, 37) OR worker_id IN (SELECT worker_id FROM scope_workers)) || '/' ||
      (SELECT count(*) FROM public.campaign_agreements WHERE campaign_id IN (15, 37))
  UNION ALL SELECT 'D structure', 'set_null_rows (sms_conversations/soc_sessions/worker_notes with campaign 15/37)',
      coalesce((SELECT string_agg(conversation_id::text, ',' ORDER BY conversation_id) FROM public.sms_conversations WHERE campaign_id IN (15, 37)), '-') || ' / ' ||
      coalesce((SELECT string_agg(session_id::text, ',' ORDER BY session_id) FROM public.soc_sessions WHERE campaign_id IN (15, 37)), '-') || ' / ' ||
      coalesce((SELECT string_agg(note_id::text, ',' ORDER BY note_id) FROM public.worker_notes WHERE campaign_id IN (15, 37) AND worker_id NOT IN (SELECT worker_id FROM scope_workers)), '-')
  -- E doomed -----------------------------------------------------------------------------------
  UNION ALL SELECT 'E doomed', d.tbl, d.n || ' (max depth ' || d.max_depth || ')' FROM doomed_counts d WHERE d.n > 0
  UNION ALL SELECT 'E doomed', 'Σ rows / tables', (SELECT sum(n) || ' / ' || count(*) FILTER (WHERE n > 0) FROM doomed_counts)
  -- F set-null and G BLOCKER -------------------------------------------------------------------
  UNION ALL SELECT s.section, s.k, s.n::text FROM side s WHERE s.n > 0
  UNION ALL SELECT 'F set-null', 'Σ update log rows 10 will write', (SELECT coalesce(sum(n), 0)::text FROM side WHERE section = 'F set-null')
  UNION ALL SELECT 'G BLOCKER', 'Σ rows (expected 2: worker 1536 via employer_id and worksite_id)', (SELECT coalesce(sum(n), 0)::text FROM side WHERE section = 'G BLOCKER')
  UNION ALL SELECT w.section, w.k, w.n::text FROM within w WHERE w.n > 0
  UNION ALL SELECT 'G2 NO ACTION within closure', 'Σ (keys total / rows)', (SELECT count(*) || ' / ' || coalesce(sum(n), 0) FROM within)
  -- H cross-checks -----------------------------------------------------------------------------
  UNION ALL SELECT 'H cross-checks', 'worksites_with_principal_or_operator_in_scope', coalesce((SELECT string_agg(worksite_id::text, ',' ORDER BY worksite_id) FROM public.worksites WHERE principal_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR operator_id IN (787, 788, 789, 790, 791, 792, 793, 794)), 'none')
  UNION ALL SELECT 'H cross-checks', 'programs_with_principal_in_scope', coalesce((SELECT string_agg(program_id::text, ',') FROM public.programs WHERE principal_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)), 'none')
  UNION ALL SELECT 'H cross-checks', 'employers_parent_in_scope', (SELECT count(*) FROM public.employers WHERE parent_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))::text
  UNION ALL SELECT 'H cross-checks', 'worksites_parent_in_scope', (SELECT count(*) FROM public.worksites WHERE parent_worksite_id IN (196, 197, 198, 199))::text
  UNION ALL SELECT 'H cross-checks', 'agreements_employer_in_scope', (SELECT count(*) FROM public.agreements WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))::text
  UNION ALL SELECT 'H cross-checks', 'documents_employer/campaign_in_scope', (SELECT count(*) FROM public.documents WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)) || '/' || (SELECT count(*) FROM public.documents WHERE campaign_id IN (15, 37))
  UNION ALL SELECT 'H cross-checks', 'worksite_contracts_in_scope', (SELECT count(*) FROM public.worksite_contracts WHERE contractor_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR worksite_id IN (196, 197, 198, 199) OR program_id = 6 OR project_id IN (18, 19, 20, 21))::text
  UNION ALL SELECT 'H cross-checks', 'upcoming_project_employers_in_scope', (SELECT count(*) FROM public.upcoming_project_employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))::text
  UNION ALL SELECT 'H cross-checks', 'projects_absorbed_into_scope', (SELECT count(*) FROM public.projects WHERE absorbed_into_project_id IN (18, 19, 20, 21))::text
  UNION ALL SELECT 'H cross-checks', 'workers_on_projects_18_21_outside_664', (SELECT count(*) FROM public.workers WHERE project_id IN (18, 19, 20, 21) AND worker_id NOT IN (SELECT worker_id FROM scope_workers))::text
  UNION ALL SELECT 'H cross-checks', 'campaigns_parent_in_scope', (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IN (15, 37))::text
  UNION ALL SELECT 'H cross-checks', 'campaign_employers/worksites_in_scope_other_campaigns', (SELECT count(*) FROM public.campaign_employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND campaign_id NOT IN (15, 37)) || '/' || (SELECT count(*) FROM public.campaign_worksites WHERE worksite_id IN (196, 197, 198, 199) AND campaign_id NOT IN (15, 37))
  UNION ALL SELECT 'H cross-checks', 'unit_basis/unit_rules_referencing_scope_other_campaigns',
      (SELECT count(*) FROM public.campaign_organising_units WHERE campaign_id NOT IN (15, 37) AND unit_basis::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M') || '/' ||
      (SELECT count(*) FROM public.campaign_unit_rules r WHERE r.campaign_id NOT IN (15, 37) AND row_to_json(r)::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M')
  UNION ALL SELECT 'H cross-checks', 'sms_lists_15_37', (SELECT count(*) FROM public.sms_lists WHERE campaign_id IN (15, 37) OR assessment_campaign_id IN (15, 37))::text
  UNION ALL SELECT 'H cross-checks', 'composite_fks_to_root_tables', (SELECT count(*) FROM pg_constraint c JOIN pg_class pcl ON pcl.oid = c.confrelid JOIN pg_namespace n ON n.oid = pcl.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) > 1 AND pcl.relname IN ('workers', 'employers', 'worksites', 'campaigns', 'programs', 'projects'))::text
  -- I checksums --------------------------------------------------------------------------------
  UNION ALL SELECT 'I checksums', 'campaign:' || lpad(c.campaign_id::text, 3, '0'),
      'mem_n=' || coalesce(m.n, 0) || ' mem_md5=' || coalesce(m.h, '-') || ' ou_n=' || coalesce(o.n, 0) || ' ou_md5=' || coalesce(o.h, '-')
  FROM public.campaigns c LEFT JOIN checks m ON m.campaign_id = c.campaign_id LEFT JOIN checks_ou o ON o.campaign_id = c.campaign_id
  -- J pack -------------------------------------------------------------------------------------
  UNION ALL SELECT 'J pack', t, n::text FROM (
    SELECT 'workers' t, count(*) n FROM public.workers UNION ALL
    SELECT 'workers_active', count(*) FROM public.workers WHERE is_active UNION ALL
    SELECT 'employers', count(*) FROM public.employers UNION ALL
    SELECT 'worksites', count(*) FROM public.worksites UNION ALL
    SELECT 'worksites_active', count(*) FROM public.worksites WHERE is_active UNION ALL
    SELECT 'employer_worksite_roles', count(*) FROM public.employer_worksite_roles UNION ALL
    SELECT 'worksite_scopes', count(*) FROM public.worksite_scopes UNION ALL
    SELECT 'employer_scopes', count(*) FROM public.employer_scopes UNION ALL
    SELECT 'programs', count(*) FROM public.programs UNION ALL
    SELECT 'program_worksites', count(*) FROM public.program_worksites UNION ALL
    SELECT 'projects', count(*) FROM public.projects UNION ALL
    SELECT 'campaigns', count(*) FROM public.campaigns UNION ALL
    SELECT 'campaign_groups', count(*) FROM public.campaign_groups UNION ALL
    SELECT 'campaign_organising_units', count(*) FROM public.campaign_organising_units UNION ALL
    SELECT 'campaign_worker_ou', count(*) FROM public.campaign_worker_ou UNION ALL
    SELECT 'campaign_worker_membership', count(*) FROM public.campaign_worker_membership UNION ALL
    SELECT 'campaign_employers', count(*) FROM public.campaign_employers UNION ALL
    SELECT 'campaign_worksites', count(*) FROM public.campaign_worksites
  ) p
  -- import_logs and membership_update_batches have no key to any table this package touches and are
  -- left alone; membership_update_batches exists on production only (created after the 12 Sep clone).
  UNION ALL SELECT 'J pack', t || ' (untouched)', CASE WHEN to_regclass('public.' || t) IS NULL THEN 'table absent'
      ELSE (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', t), false, true, '')))[1]::text END
  FROM (VALUES ('import_logs'), ('membership_update_batches')) v(t)
  UNION ALL SELECT 'J pack', '05 worksite cluster `test`', coalesce((SELECT string_agg(worksite_id || ':' || worksite_name, ' || ' ORDER BY worksite_id) FROM public.worksites
      WHERE split_part(trim(regexp_replace(regexp_replace(lower(worksite_name), '\m(mv|the|fpso|fpu|flng|platform|vessel|complex|offshore|onshore|plant|gas|lng|cpf|hub|island|project|construction)\M', ' ', 'g'), '[^a-z0-9]+', ' ', 'g')), ' ', 1) = 'test'), 'none')
  UNION ALL SELECT 'J pack', '05 employer cluster `testco`', coalesce((SELECT string_agg(employer_id || ':' || employer_name, ' || ' ORDER BY employer_id) FROM public.employers
      WHERE split_part(trim(regexp_replace(regexp_replace(lower(employer_name), '\m(pty|ltd|limited|pl|inc|group|the|australia|australian|aust|international|pte|plc|asa|services|energy|offshore|marine)\M', ' ', 'g'), '[^a-z0-9]+', ' ', 'g')), ' ', 1) = 'testco'), 'none')
  -- K environment ------------------------------------------------------------------------------
  UNION ALL SELECT 'K environment', 'env_marker', CASE WHEN to_regclass('public._oux_env_marker') IS NULL THEN 'absent (production shape)'
      ELSE coalesce((xpath('/row/v/text()', query_to_xml('SELECT string_agg(env || '' ('' || marked_at::date || '')'', '','') AS v FROM public._oux_env_marker', false, true, '')))[1]::text, 'table present, no row') END
  UNION ALL SELECT 'K environment', 'hygiene_log', coalesce(to_regclass('public._oux_hygiene_log')::text, 'MISSING') || ' rows=' || (SELECT count(*) FROM public._oux_hygiene_log)
  UNION ALL SELECT 'K environment', 'hygiene_log_da02_pending/rolled_back',
      (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NULL) || '/' ||
      (SELECT count(*) FROM public._oux_hygiene_log WHERE script = '10_remove_test_dataset' AND rolled_back_at IS NOT NULL)
  UNION ALL SELECT 'K environment', 'matview worksite_hierarchy_report_rows_mv rows/rows_in_scope',
      (SELECT count(*) FROM public.worksite_hierarchy_report_rows_mv) || '/' || (SELECT count(*) FROM public.worksite_hierarchy_report_rows_mv WHERE worksite_id IN (196, 197, 198, 199) OR provider_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794))
  UNION ALL SELECT 'K environment', 'role postgres super/bypassrls', (SELECT rolsuper || '/' || rolbypassrls FROM pg_roles WHERE rolname = 'postgres')
  UNION ALL SELECT 'K environment', 'can_set_session_replication_role', has_parameter_privilege('postgres', 'session_replication_role', 'SET')::text
  UNION ALL SELECT 'K environment', 'fp_fk_edges', (SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT c.conrelid::regclass::text || '.' || c.conname::text || ':' || c.confrelid::regclass::text || ':' || c.confdeltype::text AS x FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'f') f)
  UNION ALL SELECT 'K environment', 'fp_triggers', (SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT c.relname::text || '.' || tg.tgname::text || ':' || tg.tgtype::text || ':' || p.proname::text || ':' || tg.tgenabled::text AS x FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = tg.tgfoid WHERE n.nspname = 'public' AND NOT tg.tgisinternal) f)
  UNION ALL SELECT 'K environment', 'disabled_user_triggers', coalesce((SELECT string_agg(c.relname || '.' || tg.tgname, ',') FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT tg.tgisinternal AND tg.tgenabled = 'D'), 'none')
  UNION ALL SELECT 'K environment', 'identity_always/generated_columns',
      coalesce((SELECT string_agg(c.relname::text || '.' || a.attname::text, ',') FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.attidentity = 'a'), 'none') || ' / ' ||
      coalesce((SELECT string_agg(c.relname::text || '.' || a.attname::text, ',') FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated <> ''), 'none')
  UNION ALL SELECT 'K environment', 'pg_version', version()
) x
ORDER BY section, k;
