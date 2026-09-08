-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 03: resolve duplicate unit placements in campaign_worker_ou (hazards H1 and H3)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- Run as postgres (Supabase SQL editor for the target project, or psql with ON_ERROR_STOP). One file at a time.
-- Requires: public._oux_hygiene_log (00_create_hygiene_log.sql).
-- Idempotent: after a successful run the duplicates no longer exist, so re-running deletes 0 and logs 0.
-- Selector (appendix C 8.4, unchanged):
--   H1  same worker in >1 unit of the same group      -- partition (campaign_id, ou_group_id, worker_id), ou_group_id IS NOT NULL
--   H3  same worker in >1 standalone unit of a type   -- partition (campaign_id, ou_type, worker_id),  ou_group_id IS NULL AND parent_ou_id IS NULL
--   Level-2 sub-units (ou_group_id IS NULL AND parent_ou_id IS NOT NULL) are in neither set and are NOT touched.
-- Keeper: per partition keep ORDER BY is_primary DESC, created_at DESC, id DESC; delete the rest.
-- No worker id, unit id or campaign id is hard-coded.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 5
-- ---------------------------------------------------------------------------------------------

-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============

-- H1 and H3 verbatim from appendix C 8.4, wrapped in count(*). Expected: 2 and 5.
SELECT count(*) AS h1_pairs FROM (
  SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

SELECT count(*) AS h3_pairs FROM (
  SELECT cou.campaign_id, cou.ou_type, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

-- Rows that will actually be deleted, broken down. This is the number to record; do NOT assume it is 7.
-- G.5 counts 2 + 5 = 7 offending worker/dimension PAIRS, and G.3's "Same-type dupes" column
-- (campaign 57 = 2, 64 = 3, 42 = 2) agrees. If every pair has exactly two placements the excess is 7 rows;
-- a pair with three placements makes it more. The post-checks, not this number, are the authority.
-- *** If ANY row here has assignment_source = 'rule', STOP and tell the orchestrator (wp0.4.md 5.2):
-- *** recomputeOuAssignments would recreate the row client-side; the rule needs fixing in phase 2 instead.
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
         cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
)
SELECT hazard, campaign_id, assignment_source, count(*) AS rows_to_delete
FROM ranked WHERE rn > 1 GROUP BY 1,2,3 ORDER BY 1,2,3;

-- Baselines to compare after. Expected (G.1): 2670 and 1614.
SELECT count(*) AS membership_before FROM public.campaign_worker_membership;
SELECT count(*) AS worker_ou_before  FROM public.campaign_worker_ou;

-- Per-campaign "members in at least one unit" (G.3: 57->303, 64->267, 42->202). Must be identical afterwards.
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;

-- Stop if any pre-check disagrees with its expected value, or if any rows_to_delete has assignment_source = 'rule'.

-- ============ CHANGE ============
BEGIN;
WITH keyed AS (
  SELECT cwo.id, cwo.ou_id, cwo.worker_id, cwo.is_primary, cwo.assignment_source,
         cwo.assigned_rule_id, cwo.created_at, cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM public.campaign_worker_ou cwo
  JOIN public.campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
), losers AS (
  SELECT * FROM ranked WHERE rn > 1
), del AS (
  DELETE FROM public.campaign_worker_ou cwo
  USING losers l
  WHERE cwo.id = l.id
  RETURNING l.id            AS del_id,
            l.ou_id         AS del_ou_id,
            l.worker_id     AS del_worker_id,
            l.is_primary    AS del_is_primary,
            l.assignment_source AS del_assignment_source,
            l.assigned_rule_id  AS del_assigned_rule_id,
            l.created_at    AS del_created_at,
            l.campaign_id   AS del_campaign_id,
            l.hazard        AS del_hazard,
            l.dim_key       AS del_dim_key
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '03_resolve_duplicate_placements', 'delete', 'public.campaign_worker_ou',
       jsonb_build_object('id', del_id),
       jsonb_build_object('id', del_id, 'ou_id', del_ou_id, 'worker_id', del_worker_id,
                          'is_primary', del_is_primary, 'assignment_source', del_assignment_source,
                          'assigned_rule_id', del_assigned_rule_id, 'created_at', del_created_at),
       NULL,
       del_hazard||' duplicate: campaign '||del_campaign_id||' '||del_dim_key
FROM del;
COMMIT;

-- ============ POST-CHECK (read-only) ============

-- H1, H3, H7, H5 verbatim from appendix C 8.4 (H1/H3/H7 wrapped in count(*); H5 is already a count).
-- Expected: 0, 0, 0, 0.  (H7 was already 0 and cannot be created by deleting rows; H5 likewise.)
SELECT count(*) AS h1_pairs_after FROM (
  SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

SELECT count(*) AS h3_pairs_after FROM (
  SELECT cou.campaign_id, cou.ou_type, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

SELECT count(*) AS h7_multi_primary_after FROM (
  SELECT cou.campaign_id, cwo.worker_id, COUNT(*) FROM campaign_worker_ou cwo
  JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cwo.is_primary GROUP BY 1,2 HAVING COUNT(*) > 1) x;

SELECT COUNT(*) AS h5_placements_without_membership_after FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
LEFT JOIN campaign_worker_membership m ON m.campaign_id = cou.campaign_id AND m.worker_id = cwo.worker_id
WHERE m.membership_id IS NULL;

-- INVARIANT: membership untouched. Expected: identical to membership_before (2670).
SELECT count(*) AS membership_after FROM public.campaign_worker_membership;

-- INVARIANT: exactly the logged rows were removed. Expected: worker_ou_after = worker_ou_before - logged
-- (1607 if 7 rows were deleted from 1614).
SELECT count(*) AS worker_ou_after FROM public.campaign_worker_ou;
SELECT count(*) AS logged FROM public._oux_hygiene_log
WHERE script='03_resolve_duplicate_placements' AND rolled_back_at IS NULL;

-- INVARIANT: no worker lost their only placement. Expected: identical per-campaign numbers to the pre-check
-- (57 -> 303, 64 -> 267, 42 -> 202, everything else unchanged).
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;

-- INVARIANT: every logged worker still has a placement in the dimension they were de-duplicated in.
-- Expected: 0 rows.
SELECT l.log_id, l.before_row->>'worker_id' AS worker_id, l.note
FROM public._oux_hygiene_log l
WHERE l.script='03_resolve_duplicate_placements' AND l.rolled_back_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
    WHERE cwo.worker_id = (l.before_row->>'worker_id')::int
      AND cou.campaign_id = (SELECT campaign_id FROM campaign_organising_units
                             WHERE ou_id = (l.before_row->>'ou_id')::int));

-- Rollback: run 03_rollback.sql
