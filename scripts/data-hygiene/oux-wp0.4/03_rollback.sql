-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- ROLLBACK for script 03_resolve_duplicate_placements (re-inserts the deleted placements)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER (forward):  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--                       ->  01_role_conversion   (01 HELD until WP1.6 is on production; wp0.4.md 3.5, 11)
-- Rollbacks run in reverse order of the forward scripts that ran: 01_rollback -> 03_rollback -> 02_rollback.
--
-- Run as postgres. Requires: public._oux_hygiene_log with the rows written by 03_resolve_duplicate_placements.sql.
-- Idempotent: only log rows with rolled_back_at IS NULL are applied; ON CONFLICT (id) DO NOTHING; stamped in the
-- same transaction. Original ids are restored (already consumed from campaign_worker_ou_id_seq; no setval needed).
-- CAVEAT (wp0.4.md 5.5): run before anyone changes the affected workers' placements. The two BEFORE triggers
-- (trg_check_no_worker_on_group_container, trg_check_worker_ou_group_exclusivity) pass for an unchanged database;
-- if a worker has since been put into a DIFFERENT group of the same ou_type, the trigger rejects that one row and
-- the whole transaction aborts with nothing restored. The log holds every column needed to restore by hand.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 5.5
-- ---------------------------------------------------------------------------------------------

-- ============ PRE-CHECK (read-only) ============

-- Expected: the number of rows 03 deleted and has not yet rolled back (7 on production if #17 was 7).
SELECT count(*) AS pending_rollback
FROM public._oux_hygiene_log
WHERE script = '03_resolve_duplicate_placements' AND action = 'delete' AND rolled_back_at IS NULL;

-- Expected: 0 rows. A logged id that already exists in campaign_worker_ou would be skipped by ON CONFLICT (id)
-- and would NOT be stamped rolled_back_at; look at it by hand.
SELECT l.log_id, l.row_pk
FROM public._oux_hygiene_log l
JOIN public.campaign_worker_ou cwo ON cwo.id = (l.row_pk->>'id')::int
WHERE l.script = '03_resolve_duplicate_placements' AND l.action = 'delete' AND l.rolled_back_at IS NULL;

-- Expected: 0 rows. A logged (ou_id, worker_id) pair that already exists under another id would violate
-- campaign_worker_ou_ou_id_worker_id_key and abort the transaction; look at it by hand.
SELECT l.log_id, l.before_row->>'ou_id' AS ou_id, l.before_row->>'worker_id' AS worker_id
FROM public._oux_hygiene_log l
JOIN public.campaign_worker_ou cwo
  ON cwo.ou_id     = (l.before_row->>'ou_id')::int
 AND cwo.worker_id = (l.before_row->>'worker_id')::int
WHERE l.script = '03_resolve_duplicate_placements' AND l.action = 'delete' AND l.rolled_back_at IS NULL;

-- Baseline. Expected: worker_ou_before - logged (1607 on production if 7 rows were deleted).
SELECT count(*) AS worker_ou_now FROM public.campaign_worker_ou;

-- ============ CHANGE ============
BEGIN;
WITH src AS (
  SELECT log_id, (row_pk->>'id')::int AS id, before_row
  FROM public._oux_hygiene_log
  WHERE script='03_resolve_duplicate_placements' AND action='delete' AND rolled_back_at IS NULL
), ins AS (
  INSERT INTO public.campaign_worker_ou
    (id, ou_id, worker_id, is_primary, created_at, assignment_source, assigned_rule_id)
  SELECT s.id,
         (s.before_row->>'ou_id')::int,
         (s.before_row->>'worker_id')::int,
         (s.before_row->>'is_primary')::boolean,
         (s.before_row->>'created_at')::timestamptz,
         (s.before_row->>'assignment_source'),
         nullif(s.before_row->>'assigned_rule_id','')::int
  FROM src s
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public._oux_hygiene_log l SET rolled_back_at = now()
WHERE l.log_id IN (SELECT log_id FROM src WHERE id IN (SELECT id FROM ins));
COMMIT;

-- ============ POST-CHECK (read-only) ============

-- Expected after rollback: h1_pairs = 2, h3_pairs = 5 (H1 and H3 verbatim from appendix C 8.4, wrapped in count(*))
SELECT count(*) AS h1_pairs_after_rollback FROM (
  SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

SELECT count(*) AS h3_pairs_after_rollback FROM (
  SELECT cou.campaign_id, cou.ou_type, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

-- Expected: back to worker_ou_before from the 03 pre-check (1614 on production)
SELECT count(*) AS worker_ou_after_rollback FROM public.campaign_worker_ou;

-- Expected: 0 (every 03 log row is now stamped rolled_back_at)
SELECT count(*) AS still_pending
FROM public._oux_hygiene_log
WHERE script = '03_resolve_duplicate_placements' AND rolled_back_at IS NULL;

-- Expected: unchanged (2670 on production)
SELECT count(*) AS membership_after_rollback FROM public.campaign_worker_membership;
