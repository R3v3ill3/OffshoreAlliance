-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 01: role conversion (role='admin' AND work_role='organiser' -> role='user')
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion
-- HOLD:       THIS SCRIPT IS HELD until WP1.6 is on production (wp0.4.md 3.5, 11). Between conversion and WP1.6
--             the converted organisers cannot delete a unit, remove a worker from a unit or a campaign, unlink a
--             leader, or move a worker between units, and the UI does not tell them. If the operator overrides the
--             hold, announce that window and the escalation path (the two lead organisers and the two coordinators).
--             02_backfill_campaign_organisers MUST have run before this script (wp0.4.md 3.6).
--
-- Run as postgres (Supabase SQL editor for the target project, or interactive psql with ON_ERROR_STOP). One file at
-- a time, in THREE SEPARATE SUBMISSIONS: BLOCK 1 PRE-CHECK -> inspect every result -> BLOCK 2 CHANGE -> BLOCK 3
-- POST-CHECK. The SQL editor returns only ONE result set per submission (the last statement's), so a pre-check
-- pasted together with the change is never seen. Under interactive psql a failed CHANGE leaves the session in an
-- aborted transaction: run ROLLBACK; before anything else.
-- Requires: public._oux_hygiene_log (00_create_hygiene_log.sql).
-- Idempotent: re-running updates 0 rows and logs 0 rows.
-- Selector: the predicate role='admin' AND work_role='organiser' (decision 2). No user id or email is hard-coded.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 3
-- ---------------------------------------------------------------------------------------------

-- ##########################################  BLOCK 1 of 3  ###########################################
-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============
-- Submit this block ON ITS OWN (from here to END OF BLOCK 1). Inspect every result before submitting block 2.

-- Expected on production (appendix G.6): 7
SELECT count(*) AS admin_organisers_to_convert
FROM public.user_profiles
WHERE role = 'admin' AND work_role = 'organiser';

-- Full distribution, so the operator can see nothing else moves.
-- Expected (G.6): admin/organiser 7, admin/lead_organiser 2, admin/coordinator 1,
--                 admin/industrial_coordinator 1, user/organiser 1, user/industrial_officer 1  (13 rows total)
SELECT role, work_role, count(*)
FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;

-- Sequencing guard (wp0.4.md 3.6): 02 must already have run. This is 02's post-check #10 (8.2). Expected: 0
-- (every non-standing, non-SMS-episode campaign with an organiser_id has its roster row).
-- If this is NOT 0, STOP and run 02_backfill_campaign_organisers.sql first: the converted accounts' campaign-level
-- write access depends on those roster rows (is_lead_organiser_for_campaign() arm 2).
SELECT count(*) AS still_missing
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL AND c.is_sms_episode = false AND c.is_standing = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Stop if any pre-check disagrees with its expected value.
-- ########################################  END OF BLOCK 1  ###########################################

-- ##########################################  BLOCK 2 of 3  ###########################################
-- ============ CHANGE ============
-- Submit this block ON ITS OWN (BEGIN; ... COMMIT;). Under psql, if it errors, run ROLLBACK; before anything else.
BEGIN;
WITH upd AS (
  UPDATE public.user_profiles
     SET role = 'user'
   WHERE role = 'admin' AND work_role = 'organiser'
  RETURNING user_id, work_role
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '01_role_conversion', 'update', 'public.user_profiles',
       jsonb_build_object('user_id', user_id),
       jsonb_build_object('role', 'admin', 'work_role', work_role),
       jsonb_build_object('role', 'user',  'work_role', work_role),
       'decision 2: admin accounts whose work_role is organiser become user'
FROM upd;
COMMIT;
-- ########################################  END OF BLOCK 2  ###########################################

-- ##########################################  BLOCK 3 of 3  ###########################################
-- ============ POST-CHECK (read-only) ============
-- Submit this block ON ITS OWN.

-- Expected: 0
SELECT count(*) AS remaining_admin_organisers
FROM public.user_profiles WHERE role='admin' AND work_role='organiser';

-- Expected: 7 (matches the pre-check count)
SELECT count(*) AS converted FROM public._oux_hygiene_log
WHERE script='01_role_conversion' AND rolled_back_at IS NULL;

-- Expected: user/organiser 8 (the 7 converted + the 1 pre-existing), admin 4 (2 lead_organiser, 1 coordinator,
-- 1 industrial_coordinator), user/industrial_officer 1
SELECT role, work_role, count(*) FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;

-- Expected: 4 (the accounts that stay admin: 2 lead_organiser, 1 coordinator, 1 industrial_coordinator)
SELECT count(*) AS still_admin FROM public.user_profiles WHERE role='admin';

-- Note: user_profiles.updated_at is bumped by trg_user_profiles_updated_at (baseline_schema.sql:22641) on both
-- the conversion and the rollback; it is metadata only and is not restored.
-- AFTER THIS SCRIPT: every converted organiser must SIGN OUT AND BACK IN. The web client reads role from
-- user_profiles once at session load (apps/organising-db/src/lib/supabase/auth-context.tsx, fetchProfile) and
-- keeps isAdmin from that copy, while get_user_role() in RLS flips immediately; until they re-authenticate the UI
-- offers admin actions that the database now refuses. The same applies in reverse after 01_rollback.sql.

-- Rollback: run 01_rollback.sql
