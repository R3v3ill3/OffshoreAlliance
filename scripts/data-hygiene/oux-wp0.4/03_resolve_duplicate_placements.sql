-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 03: resolve duplicate unit placements in campaign_worker_ou (hazards H1 and H3)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- Run as postgres (Supabase SQL editor for the target project, or interactive psql with ON_ERROR_STOP). One file at
-- a time, in THREE SEPARATE SUBMISSIONS: BLOCK 1 PRE-CHECK -> inspect every result -> BLOCK 2 CHANGE -> BLOCK 3
-- POST-CHECK. The SQL editor returns only ONE result set per submission (the last statement's), so a pre-check
-- pasted together with the change is never seen. Under interactive psql a failed CHANGE leaves the session in an
-- aborted transaction: run ROLLBACK; before anything else.
-- Requires: public._oux_hygiene_log (00_create_hygiene_log.sql).
-- Idempotent: after a successful run the duplicates no longer exist, so re-running deletes 0 and logs 0.
-- Selector (appendix C 8.4, unchanged):
--   H1  same worker in >1 unit of the same group      -- partition (campaign_id, ou_group_id, worker_id), ou_group_id IS NOT NULL
--   H3  same worker in >1 standalone unit of a type   -- partition (campaign_id, ou_type, worker_id),  ou_group_id IS NULL AND parent_ou_id IS NULL
--   Level-2 sub-units (ou_group_id IS NULL AND parent_ou_id IS NOT NULL) are in neither set and are NOT touched.
-- Keeper: per partition keep ORDER BY is_primary DESC, created_at DESC, id DESC; delete the rest.
-- Rule-sourced partitions (wp0.4.md 5.2): any partition that contains ANY row with assignment_source = 'rule' is
--   EXCLUDED from the delete by the statement itself (rule_partitions CTE), not by a comment. recomputeOuAssignments
--   would recreate a deleted rule row client-side; those partitions go to phase 2 and are listed by the post-check
--   unresolved_rule_partitions (expected 0 on production, pre-check #18).
-- No worker id, unit id or campaign id is hard-coded.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 5
-- ---------------------------------------------------------------------------------------------

-- ##########################################  BLOCK 1 of 3  ###########################################
-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============
-- Submit this block ON ITS OWN (from here to END OF BLOCK 1). Inspect every result before submitting block 2.

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

-- H7 verbatim from appendix C 8.4, wrapped in count(*). Expected: 0 (G.5). If non-zero a partition holds two
-- primaries and the keeper rule falls through to created_at; record it, it is not a stop.
SELECT count(*) AS h7_multi_primary_before FROM (
  SELECT cou.campaign_id, cwo.worker_id, COUNT(*) FROM campaign_worker_ou cwo
  JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cwo.is_primary GROUP BY 1,2 HAVING COUNT(*) > 1) x;

-- Rows that are duplicates, broken down (8.2 #17 / #18). This is the number to record; do NOT assume it is 7.
-- G.5 counts 2 + 5 = 7 offending worker/dimension PAIRS, and G.3's "Same-type dupes" column
-- (campaign 57 = 2, 64 = 3, 42 = 2) agrees. If every pair has exactly two placements the excess is 7 rows;
-- a pair with three placements makes it more. The post-checks, not this number, are the authority.
-- This breakdown is over ALL duplicate rows; the CHANGE additionally skips every partition that contains a
-- rule-sourced row (see rows_in_rule_partitions_excluded below). Any assignment_source = 'rule' here means the
-- underlying rule needs fixing in phase 2 (wp0.4.md 5.2); tell the orchestrator, then decide whether to proceed
-- with the manual partitions only.
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

-- #17 total / #18 rule-sourced total, as single numbers (same query as 90_verify_all.sql). Expected: 7 / 0.
-- Also: how many duplicate rows sit in a partition that contains a rule row (the CHANGE skips these) and how many
-- the CHANGE will actually delete. Expected on production: 0 excluded, so rows_the_change_will_delete = total.
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
         cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
), rule_partitions AS (
  SELECT DISTINCT campaign_id, dim_key, worker_id FROM keyed WHERE assignment_source = 'rule'
)
SELECT count(*)                                              AS rows_to_delete_total,
       count(*) FILTER (WHERE assignment_source = 'rule')    AS rows_to_delete_rule_sourced,
       count(*) FILTER (WHERE (campaign_id, dim_key, worker_id) IN
                              (SELECT campaign_id, dim_key, worker_id FROM rule_partitions))
                                                             AS rows_in_rule_partitions_excluded,
       count(*) FILTER (WHERE (campaign_id, dim_key, worker_id) NOT IN
                              (SELECT campaign_id, dim_key, worker_id FROM rule_partitions))
                                                             AS rows_the_change_will_delete
FROM ranked WHERE rn > 1;

-- WOC exposure of the rows the CHANGE will delete. Each row here is a placement being removed from a unit that is
-- in the scope of a WOC (woc_scope_units, or the legacy campaign_wocs.scope_ou_id) of which the worker is an
-- ACTIVE member (woc_members.left_on IS NULL): after the delete, that unit no longer counts this WOC member among
-- its workers. Expected on production: 0 rows. REVIEW if non-zero (it is not a stop): the worker keeps their
-- placement in the surviving unit of the same dimension, and WOC membership itself is untouched.
WITH keyed AS (
  SELECT cwo.id, cwo.ou_id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
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
), rule_partitions AS (
  SELECT DISTINCT campaign_id, dim_key, worker_id FROM keyed WHERE assignment_source = 'rule'
), losers AS (
  SELECT * FROM ranked
  WHERE rn > 1
    AND (campaign_id, dim_key, worker_id) NOT IN (SELECT campaign_id, dim_key, worker_id FROM rule_partitions)
)
SELECT l.hazard, l.campaign_id, l.worker_id, l.ou_id AS ou_id_to_be_deleted, l.dim_key,
       cw.woc_id, cw.name AS woc_name, cw.status AS woc_status, wm.woc_role
FROM losers l
JOIN public.campaign_wocs cw ON cw.campaign_id = l.campaign_id
JOIN public.woc_members  wm ON wm.woc_id = cw.woc_id AND wm.worker_id = l.worker_id AND wm.left_on IS NULL
WHERE cw.scope_ou_id = l.ou_id
   OR EXISTS (SELECT 1 FROM public.woc_scope_units wsu WHERE wsu.woc_id = cw.woc_id AND wsu.ou_id = l.ou_id)
ORDER BY 1,2,3,4;

-- Baselines to compare after. Expected (G.1): 2670 and 1614.
SELECT count(*) AS membership_before FROM public.campaign_worker_membership;
SELECT count(*) AS worker_ou_before  FROM public.campaign_worker_ou;

-- Per-campaign "members in at least one unit" (G.3: 57->303, 64->267, 42->202). Must be identical afterwards.
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;

-- Stop if any pre-check disagrees with its expected value. A non-zero rows_to_delete_rule_sourced is reported to
-- the orchestrator before going on; the CHANGE will leave those partitions alone in any case.
-- ########################################  END OF BLOCK 1  ###########################################

-- ##########################################  BLOCK 2 of 3  ###########################################
-- ============ CHANGE ============
-- Submit this block ON ITS OWN (BEGIN; ... COMMIT;). Under psql, if it errors, run ROLLBACK; before anything else.
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
), rule_partitions AS (
  -- every partition that contains ANY rule-sourced row is left alone (wp0.4.md 5.2): recomputeOuAssignments
  -- would recreate a deleted rule row client-side; the rule itself is fixed in phase 2.
  -- (campaign_id, dim_key, worker_id are all NOT NULL, so NOT IN over the row constructor is NULL-safe.)
  SELECT DISTINCT campaign_id, dim_key, worker_id FROM keyed WHERE assignment_source = 'rule'
), losers AS (
  SELECT * FROM ranked
  WHERE rn > 1
    AND (campaign_id, dim_key, worker_id) NOT IN (SELECT campaign_id, dim_key, worker_id FROM rule_partitions)
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
-- ########################################  END OF BLOCK 2  ###########################################

-- ##########################################  BLOCK 3 of 3  ###########################################
-- ============ POST-CHECK (read-only) ============
-- Submit this block ON ITS OWN.

-- H1, H3, H7, H5 verbatim from appendix C 8.4 (H1/H3/H7 wrapped in count(*); H5 is already a count).
-- Expected: 0, 0, 0, 0.  (H7 was already 0 and cannot be created by deleting rows; H5 likewise.)
-- H1/H3 stay non-zero only for partitions the CHANGE deliberately skipped: see unresolved_rule_partitions.
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

-- Partitions still duplicated because they contain a rule-sourced row (skipped by the CHANGE on purpose).
-- Expected on production: 0 rows (pre-check #18 = 0). If non-zero these go to phase 2 (wp0.4.md 5.2); the
-- rule that produced them must be fixed there, and H1/H3 above stay non-zero by exactly this many.
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.assignment_source, cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
)
SELECT 'unresolved_rule_partitions' AS check_name, hazard, campaign_id, dim_key, worker_id,
       count(*)                                           AS placements,
       count(*) FILTER (WHERE assignment_source = 'rule') AS rule_rows
FROM keyed
GROUP BY 2,3,4,5
HAVING count(*) > 1 AND count(*) FILTER (WHERE assignment_source = 'rule') > 0
ORDER BY 1,2,3,4;

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

-- INVARIANT (8.2 #27): every logged worker still has a placement in the DIMENSION they were de-duplicated in:
-- for an H1 delete, a surviving row in a unit of the same campaign with the same ou_group_id; for an H3 delete,
-- a surviving row in a standalone unit (ou_group_id IS NULL AND parent_ou_id IS NULL) of the same campaign and
-- ou_type. Expected: 0 rows. A row also surfaces here if the unit it was deleted from has itself been deleted
-- since (d.* is NULL); that is a later change, not a 03 failure -- look at it by hand.
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

-- Rollback: run 03_rollback.sql
