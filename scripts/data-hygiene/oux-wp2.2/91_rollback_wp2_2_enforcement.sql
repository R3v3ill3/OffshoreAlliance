-- WP2.2b enforcement rollback (docs/organiser-ux-review/wp/wp2.2.md §3.6;
-- wp/wp2.1.md §6.4 step 6). Operator-run only; never a migration.
-- Drops campaign_group_membership, restores the WP2.1 derive-only
-- cwo_set_group_id() verbatim, drops the unique index and recreates the
-- non-unique idx_cwo_worker_group. Application row data is not changed.
-- Migration-history repair is a separate, recovery-only command requiring
-- explicit approval and is not executed here.

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

DO $precondition$
BEGIN
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NULL
     OR to_regclass('public.campaign_group_membership') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.2b rollback STOP: enforcement objects are absent';
  END IF;
  IF to_regclass('public.idx_cwo_worker_group') IS NOT NULL THEN
    RAISE EXCEPTION 'WP2.2b rollback STOP: idx_cwo_worker_group already exists';
  END IF;
END;
$precondition$;

CREATE TEMP TABLE _wp22_91_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.campaign_worker_ou) AS placements,
  (SELECT count(*) FROM public.campaign_group_membership) AS view_rows_before;

-- 1. View.
DROP VIEW public.campaign_group_membership;

-- 2. WP2.1 derive-only trigger function, verbatim from
--    supabase/migrations/20260912035329_wp2_1_campaign_groups.sql (section 5).
CREATE OR REPLACE FUNCTION public.cwo_set_group_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_group_id integer;
BEGIN
  SELECT cou.group_id
    INTO v_group_id
  FROM public.campaign_organising_units AS cou
  WHERE cou.ou_id = NEW.ou_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'unit % has no group (is it a legacy container?)', NEW.ou_id;
  END IF;

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.cwo_set_group_id() IS
  'WP2.1 derive-only placement trigger. It deliberately does not reject duplicate (worker_id, group_id) rows; WP2.2 adds that check after replacing legacy writers.';

-- 3. Indexes.
DROP INDEX public.campaign_worker_ou_one_unit_per_group;

CREATE INDEX idx_cwo_worker_group
  ON public.campaign_worker_ou (worker_id, group_id);

COMMENT ON INDEX public.idx_cwo_worker_group IS
  'WP2.1 non-unique support index. WP2.2 must re-run H9 cleanup, replace this with UNIQUE(worker_id, group_id), and only then create campaign_group_membership.';

DO $postconditions$
DECLARE
  v_prosrc text;
BEGIN
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
     OR to_regclass('public.idx_cwo_worker_group') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.2b rollback failed: index/view state is incorrect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index AS i
    WHERE i.indexrelid = 'public.idx_cwo_worker_group'::regclass AND i.indisunique
  ) THEN
    RAISE EXCEPTION 'WP2.2b rollback failed: idx_cwo_worker_group must not be unique';
  END IF;

  SELECT p.prosrc INTO v_prosrc
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cwo_set_group_id';
  IF v_prosrc IS NULL OR position('campaign_worker_ou_one_unit_per_group' IN v_prosrc) > 0 THEN
    RAISE EXCEPTION 'WP2.2b rollback failed: derive-only cwo_set_group_id() was not restored';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.campaign_worker_ou'::regclass
      AND t.tgname = 'trg_cwo_z_set_group_id'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'WP2.2b rollback failed: trg_cwo_z_set_group_id is missing';
  END IF;

  IF (SELECT count(*) FROM public.campaign_worker_ou) <> (SELECT placements FROM _wp22_91_counts) THEN
    RAISE EXCEPTION 'WP2.2b rollback failed: placement count changed';
  END IF;
END;
$postconditions$;

SELECT
  c.view_rows_before,
  (to_regclass('public.campaign_group_membership') IS NOT NULL) AS view_remains,
  (to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL) AS unique_index_remains,
  (to_regclass('public.idx_cwo_worker_group') IS NOT NULL) AS support_index_restored,
  c.placements AS placements_unchanged
FROM _wp22_91_counts AS c;

COMMIT;
