-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 99: drop the audit table public._oux_hygiene_log (RETENTION RULE APPLIES)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion  ->  ...  ->  99 (last, and only per the retention rule below)
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- RETENTION (wp0.4.md 2.3): run ONLY when ALL THREE hold:
--   1. WP1.6 is on production;
--   2. phase 1 exit is signed off in docs/organiser-ux-review/PROGRESS.md;
--   3. at least 30 days have passed since the last of scripts 01-03 ran (last_logged_at below).
-- Dropping the table makes every *_rollback.sql unusable. PITR is the only backstop afterwards.
-- After running: record the date in PROGRESS.md "Human tasks"; if prod types are regenerated
-- (SUPABASE_PROJECT_REF=<prod ref> pnpm gen:types -- operator only), _oux_hygiene_log disappears from generated.ts.
-- Idempotent: DROP TABLE IF EXISTS. (If the table is already gone, the pre-checks that read it error and, under
-- ON_ERROR_STOP, the file stops before the no-op DROP; nothing else happens.)
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 2.3
-- ---------------------------------------------------------------------------------------------

-- ============ PRE-CHECK (read-only) ============

-- Expected: 'public._oux_hygiene_log' (NULL means it was already dropped; the CHANGE is then a no-op)
SELECT to_regclass('public._oux_hygiene_log') AS hygiene_log_exists_before;

-- Retention condition 3. Expected: days_since_last_run >= 30. If less, STOP.
SELECT max(logged_at)                                   AS last_logged_at,
       extract(day from now() - max(logged_at))::int    AS days_since_last_run
FROM public._oux_hygiene_log;

-- What is being discarded. Expected on production after 02, 03 and 01 ran once and nothing was rolled back:
-- 01_role_conversion 7 active / 0 rolled back; 02_backfill_campaign_organisers 21 (or 20) / 0;
-- 03_resolve_duplicate_placements 7 / 0.
SELECT script,
       count(*) FILTER (WHERE rolled_back_at IS NULL)     AS active_rows,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back_rows
FROM public._oux_hygiene_log
GROUP BY 1 ORDER BY 1;

-- Stop unless all three retention conditions hold.

-- ============ CHANGE ============
BEGIN;
DROP TABLE IF EXISTS public._oux_hygiene_log;
COMMIT;

-- ============ POST-CHECK (read-only) ============

-- Expected: NULL
SELECT to_regclass('public._oux_hygiene_log') AS hygiene_log_exists_after;

-- Expected: NULL (the bigserial sequence is owned by the table and is dropped with it)
SELECT to_regclass('public._oux_hygiene_log_log_id_seq') AS hygiene_log_seq_exists_after;

-- Rollback: none. The audit trail is gone; PITR is the backstop. Re-running 00_create_hygiene_log.sql creates an
-- empty table again if a later hygiene script needs one.
