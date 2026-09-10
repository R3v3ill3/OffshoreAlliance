-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 91: READ-ONLY audit-log invariants (#3, #27 and the per-script logged counts)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ONLY WHILE public._oux_hygiene_log EXISTS (after 00_create_hygiene_log, before 99_drop_hygiene_log);
-- every query here is a plain SELECT on that table and errors if it is absent. 90_verify_all.sql is the
-- companion that runs at any time.
--
-- RUN ORDER:  90 (before snapshot)  ->  00_create_hygiene_log  ->  02_backfill_campaign_organisers
--             ->  03_resolve_duplicate_placements  ->  01_role_conversion  ->  90 + 91 (after snapshot)
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- This file changes nothing. Expected values are PRODUCTION values (wp0.4.md 8.2, #n). The same counts appear as
-- plain SELECTs in the 01/02/03 post-checks. In the SQL editor each statement is one submission if you want to
-- see every result. Paste the output into docs/organiser-ux-review/wp/wp0.4.md 13 alongside 90's.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 8
-- ---------------------------------------------------------------------------------------------

-- Expected: 'public._oux_hygiene_log'. NULL means the table is absent: stop, nothing below can run.
SELECT to_regclass('public._oux_hygiene_log') AS hygiene_log_exists;

-- Per-script active / rolled-back rows in one view.
-- Expected after 02, 03 and 01 ran once and nothing was rolled back:
--   01_role_conversion 7 active / 0 rolled back (#3); 02_backfill_campaign_organisers 21 (or 20, = #8) / 0;
--   03_resolve_duplicate_placements 7 (= #17) / 0.
-- Before a script runs its row is absent; after its rollback, active 0 and rolled_back = the former active count.
SELECT script,
       count(*) FILTER (WHERE rolled_back_at IS NULL)     AS active_rows,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back_rows,
       max(logged_at)                                     AS last_logged_at,
       max(rolled_back_at)                                AS last_rolled_back_at
FROM public._oux_hygiene_log
GROUP BY 1 ORDER BY 1;

-- #3 expected 7 after 01; 0 before 01 and after 01_rollback
SELECT count(*) AS log_01_active_rows FROM public._oux_hygiene_log
WHERE script = '01_role_conversion' AND rolled_back_at IS NULL;

-- expected = #8 (21 or 20) after 02; 0 before 02 and after 02_rollback
SELECT count(*) AS log_02_active_rows FROM public._oux_hygiene_log
WHERE script = '02_backfill_campaign_organisers' AND rolled_back_at IS NULL;

-- expected = #17 (7) after 03; 0 before 03 and after 03_rollback
SELECT count(*) AS log_03_active_rows FROM public._oux_hygiene_log
WHERE script = '03_resolve_duplicate_placements' AND rolled_back_at IS NULL;

-- #27 INVARIANT: every worker 03 de-duplicated still has a placement in the DIMENSION they were de-duplicated in:
-- for an H1 delete, a surviving row in a unit of the same campaign with the same ou_group_id; for an H3 delete, a
-- surviving row in a standalone unit (ou_group_id IS NULL AND parent_ou_id IS NULL) of the same campaign and
-- ou_type. Expected: 0 rows. A row also surfaces if the unit it was deleted from has itself been deleted since
-- (d.* is NULL); at a later date that is a later change, not a 03 failure -- look at it by hand.
SELECT l.log_id, l.before_row->>'worker_id' AS worker_id, l.note
FROM public._oux_hygiene_log l
LEFT JOIN public.campaign_organising_units d ON d.ou_id = (l.before_row->>'ou_id')::int
WHERE l.script='03_resolve_duplicate_placements' AND l.rolled_back_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_worker_ou cwo
    JOIN public.campaign_organising_units s ON s.ou_id = cwo.ou_id
    WHERE cwo.worker_id = (l.before_row->>'worker_id')::int
      AND s.campaign_id = d.campaign_id
      AND CASE WHEN d.ou_group_id IS NOT NULL
               THEN s.ou_group_id = d.ou_group_id
               ELSE s.ou_type = d.ou_type AND s.ou_group_id IS NULL AND s.parent_ou_id IS NULL
          END);

-- Same invariant as a single number. Expected: 0
SELECT count(*) AS log_03_workers_without_placement_in_dimension
FROM public._oux_hygiene_log l
LEFT JOIN public.campaign_organising_units d ON d.ou_id = (l.before_row->>'ou_id')::int
WHERE l.script='03_resolve_duplicate_placements' AND l.rolled_back_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_worker_ou cwo
    JOIN public.campaign_organising_units s ON s.ou_id = cwo.ou_id
    WHERE cwo.worker_id = (l.before_row->>'worker_id')::int
      AND s.campaign_id = d.campaign_id
      AND CASE WHEN d.ou_group_id IS NOT NULL
               THEN s.ou_group_id = d.ou_group_id
               ELSE s.ou_type = d.ou_type AND s.ou_group_id IS NULL AND s.parent_ou_id IS NULL
          END);

-- End of 91_verify_log.sql (read-only; nothing to roll back)
