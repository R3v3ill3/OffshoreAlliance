-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- ROLLBACK for script 02_backfill_campaign_organisers (deletes the backfilled roster rows)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER (forward):  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--                       ->  01_role_conversion   (01 HELD until WP1.6 is on production; wp0.4.md 3.5, 11)
-- Rollbacks run in reverse order of the forward scripts that ran: 01_rollback -> 03_rollback -> 02_rollback.
-- WARNING: if 01_role_conversion has run, rolling back 02 removes the converted accounts' campaign-level access
--          (wp0.4.md 3.6). Roll back 01 first.
--
-- Run as postgres. Requires: public._oux_hygiene_log with the rows written by 02_backfill_campaign_organisers.sql.
-- Idempotent: only log rows with rolled_back_at IS NULL are applied, and they are stamped in the same transaction.
-- Only rows still exactly as inserted (same campaign_id, organiser_id, campaign_role) are removed; a row edited
-- since the backfill is left alone and stays visible in the post-check.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 4.5
-- ---------------------------------------------------------------------------------------------

-- ============ PRE-CHECK (read-only) ============

-- Expected: the number of rows 02 inserted and has not yet rolled back (21 or 20 on production after one forward run).
SELECT count(*) AS pending_rollback
FROM public._oux_hygiene_log
WHERE script = '02_backfill_campaign_organisers' AND action = 'insert' AND rolled_back_at IS NULL;

-- Expected: same number as pending_rollback (all backfilled rows still present and unedited).
SELECT count(*) AS backfilled_rows_still_as_inserted
FROM public.campaign_organisers co
JOIN public._oux_hygiene_log l
  ON l.script = '02_backfill_campaign_organisers'
 AND l.action = 'insert'
 AND l.rolled_back_at IS NULL
 AND co.id = (l.row_pk->>'id')::int
 AND co.campaign_id   = (l.after_row->>'campaign_id')::int
 AND co.organiser_id  = (l.after_row->>'organiser_id')::int
 AND co.campaign_role = (l.after_row->>'campaign_role');

-- ============ CHANGE ============
BEGIN;
WITH del AS (
  DELETE FROM public.campaign_organisers co
  USING public._oux_hygiene_log l
  WHERE l.script = '02_backfill_campaign_organisers'
    AND l.action = 'insert'
    AND l.rolled_back_at IS NULL
    AND co.id = (l.row_pk->>'id')::int
    -- only remove rows still exactly as inserted; anything edited since is left alone
    AND co.campaign_id   = (l.after_row->>'campaign_id')::int
    AND co.organiser_id  = (l.after_row->>'organiser_id')::int
    AND co.campaign_role = (l.after_row->>'campaign_role')
  RETURNING l.log_id
)
UPDATE public._oux_hygiene_log SET rolled_back_at = now() WHERE log_id IN (SELECT log_id FROM del);
COMMIT;

-- ============ POST-CHECK (read-only) ============

-- Expected after rollback: 0
SELECT count(*) AS campaign_organisers_after_rollback FROM public.campaign_organisers;

-- Expected: 0 rows. Any row here was edited after the backfill and was deliberately not removed.
SELECT log_id, row_pk FROM public._oux_hygiene_log
WHERE script='02_backfill_campaign_organisers' AND rolled_back_at IS NULL;
