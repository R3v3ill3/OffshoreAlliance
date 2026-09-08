-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- ROLLBACK for script 01_role_conversion (restores role='admin' from the audit log)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER (forward):  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--                       ->  01_role_conversion   (01 HELD until WP1.6 is on production; wp0.4.md 3.5, 11)
-- Rollbacks run in reverse order of the forward scripts that ran: 01_rollback -> 03_rollback -> 02_rollback.
--
-- Run as postgres (Supabase SQL editor for the target project, or interactive psql with ON_ERROR_STOP). One file at
-- a time, in THREE SEPARATE SUBMISSIONS: BLOCK 1 PRE-CHECK -> inspect every result -> BLOCK 2 CHANGE -> BLOCK 3
-- POST-CHECK. The SQL editor returns only ONE result set per submission (the last statement's), so a pre-check
-- pasted together with the change is never seen. Under interactive psql a failed CHANGE leaves the session in an
-- aborted transaction: run ROLLBACK; before anything else.
-- Requires: public._oux_hygiene_log with the rows written by 01_role_conversion.sql.
-- Idempotent: only log rows with rolled_back_at IS NULL are applied, and they are stamped in the same transaction.
-- After this rollback, 01_role_conversion.sql can be run forward again.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 3.4
-- ---------------------------------------------------------------------------------------------

-- ##########################################  BLOCK 1 of 3  ###########################################
-- ============ PRE-CHECK (read-only) ============
-- Submit this block ON ITS OWN (from here to END OF BLOCK 1). Inspect every result before submitting block 2.

-- Expected: the number of rows 01 converted and has not yet rolled back (7 on production after one forward run).
SELECT count(*) AS pending_rollback
FROM public._oux_hygiene_log
WHERE script = '01_role_conversion' AND action = 'update' AND rolled_back_at IS NULL;

-- Expected: 0 (nothing to restore is currently admin+organiser)
SELECT count(*) AS admin_organisers_now
FROM public.user_profiles WHERE role='admin' AND work_role='organiser';
-- ########################################  END OF BLOCK 1  ###########################################

-- ##########################################  BLOCK 2 of 3  ###########################################
-- ============ CHANGE ============
-- Submit this block ON ITS OWN (BEGIN; ... COMMIT;). Under psql, if it errors, run ROLLBACK; before anything else.
BEGIN;
WITH und AS (
  UPDATE public.user_profiles p
     SET role = (l.before_row->>'role')
    FROM public._oux_hygiene_log l
   WHERE l.script = '01_role_conversion'
     AND l.action = 'update'
     AND l.rolled_back_at IS NULL
     AND p.user_id = (l.row_pk->>'user_id')::uuid
  RETURNING l.log_id
)
UPDATE public._oux_hygiene_log SET rolled_back_at = now()
WHERE log_id IN (SELECT log_id FROM und);
COMMIT;
-- ########################################  END OF BLOCK 2  ###########################################

-- ##########################################  BLOCK 3 of 3  ###########################################
-- ============ POST-CHECK (read-only) ============
-- Submit this block ON ITS OWN.

-- Expected after rollback: 7
SELECT count(*) AS admin_organisers_after_rollback
FROM public.user_profiles WHERE role='admin' AND work_role='organiser';

-- Expected: 0 (every 01 log row is now stamped rolled_back_at)
-- If this is non-zero, the likeliest cause is TWO pending log rows for the same user_id. 01 forward cannot produce
-- that on its own (after conversion the row no longer matches the predicate, and a rolled-back row is stamped), so
-- it means a log row was inserted by hand or a previous rollback was interrupted after its stamp. UPDATE ... FROM
-- restores the profile once and stamps only ONE matching log row; the other stays pending and shows up here.
-- Inspect it; if it is a duplicate of an already-applied restore, stamp it by hand with the log_id.
SELECT count(*) AS still_pending
FROM public._oux_hygiene_log
WHERE script = '01_role_conversion' AND rolled_back_at IS NULL;

-- Expected: 0 rows (no user_id has more than one STILL-PENDING 01 log row; see the note above). Rows already
-- stamped rolled_back_at are excluded so that a legitimate forward -> rollback -> forward -> rollback cycle
-- does not show here.
SELECT row_pk->>'user_id' AS user_id, count(*) AS pending_log_rows
FROM public._oux_hygiene_log
WHERE script = '01_role_conversion' AND action = 'update' AND rolled_back_at IS NULL
GROUP BY 1 HAVING count(*) > 1;

-- Expected: byte-identical to the 01 pre-check distribution
-- (admin/organiser 7, admin/lead_organiser 2, admin/coordinator 1, admin/industrial_coordinator 1,
--  user/organiser 1, user/industrial_officer 1)
SELECT role, work_role, count(*) FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;

-- Note: updated_at is bumped again by trg_user_profiles_updated_at; it is not restored (metadata only).
