-- WP2.2a schema recovery rollback (docs/organiser-ux-review/wp/wp2.2.md §3.5).
-- Operator-run only; never a migration. Drops the structure API functions and
-- the oux_internal schema, restores the baseline
-- check_no_worker_on_group_container() body verbatim — unconditionally — and
-- restores the two-value assignment_source CHECK only when no 'universe' row
-- exists (otherwise a NOTICE reports the count and the three-value CHECK stays
-- in place; fix round 1, finding 3).
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
DECLARE
  v_universe bigint;
BEGIN
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP2.2a rollback STOP: WP2.2b enforcement objects exist; run 91_rollback_wp2_2_enforcement.sql first';
  END IF;

  IF to_regnamespace('oux_internal') IS NULL
     OR to_regprocedure('public.structure_placements_assign(integer,integer,integer[],text,boolean,text)') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.2a rollback STOP: WP2.2a objects are absent';
  END IF;

  SELECT count(*) INTO v_universe
  FROM public.campaign_worker_ou
  WHERE assignment_source = 'universe';
  IF v_universe <> 0 THEN
    RAISE NOTICE
      'WP2.2a rollback: % placement rows carry assignment_source = universe; functions and trigger are rolled back, the three-value CHECK is left in place',
      v_universe;
  END IF;
END;
$precondition$;

CREATE TEMP TABLE _wp22_90_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.campaign_worker_ou) AS placements,
  (SELECT count(*) FROM public.campaign_organising_units) AS units,
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%') AS public_rpcs_before,
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'oux_internal') AS helpers_before;

-- 1. Public RPCs (reverse of creation order; nothing depends on them).
DROP FUNCTION public.structure_materialise_employer_placements(integer);
DROP FUNCTION public.structure_placements_replace_rule_rows(integer, jsonb);
DROP FUNCTION public.structure_placements_set_primary(integer, integer, integer);
DROP FUNCTION public.structure_placements_unassign(integer, integer[], integer, integer);
DROP FUNCTION public.structure_placements_move(integer, integer[], integer, integer, integer, boolean, boolean);
DROP FUNCTION public.structure_placements_assign(integer, integer, integer[], text, boolean, text);
DROP FUNCTION public.structure_units_bulk_save(integer, integer[], jsonb, jsonb);
DROP FUNCTION public.structure_unit_split(integer, integer, jsonb, jsonb, boolean, integer);
DROP FUNCTION public.structure_unit_merge(integer, integer, integer[]);
DROP FUNCTION public.structure_unit_delete(integer, integer, jsonb, boolean);
DROP FUNCTION public.structure_unit_reorder(integer, integer[]);
DROP FUNCTION public.structure_unit_update(integer, integer, jsonb);
DROP FUNCTION public.structure_units_create(integer, jsonb, jsonb);
DROP FUNCTION public.structure_group_delete(integer, integer, text);
DROP FUNCTION public.structure_group_reorder(integer, integer[]);
DROP FUNCTION public.structure_group_update(integer, integer, text, integer);
DROP FUNCTION public.structure_group_create(integer, text, text, integer);

-- 2. Internal helpers (callers first, then the primitives), then the schema.
DROP FUNCTION oux_internal.structure__delete_unit(integer, public.campaign_organising_units, jsonb, boolean);
DROP FUNCTION oux_internal.structure__update_unit(integer, public.campaign_organising_units, jsonb);
DROP FUNCTION oux_internal.structure__create_units(integer, jsonb, jsonb);
DROP FUNCTION oux_internal.structure__place(integer, public.campaign_organising_units, integer, text, boolean, text, integer);
DROP FUNCTION oux_internal.structure__set_primary(integer, integer, integer);
DROP FUNCTION oux_internal.structure__worker_ids(integer, integer[], boolean);
DROP FUNCTION oux_internal.structure__group(integer, integer);
DROP FUNCTION oux_internal.structure__unit(integer, integer);
DROP FUNCTION oux_internal.structure__assert_can_write(integer);
DROP FUNCTION oux_internal.structure__json_array(jsonb, text);
DROP FUNCTION oux_internal.structure__json_object(jsonb, text, text);
DROP FUNCTION oux_internal.structure__json_text(jsonb, text, text);
DROP FUNCTION oux_internal.structure__json_bool(jsonb, text, text);
DROP FUNCTION oux_internal.structure__json_int(jsonb, text, text);
DROP SCHEMA oux_internal;

-- 3. Baseline check_no_worker_on_group_container() body, verbatim from
--    supabase/migrations/20260908050000_baseline_schema.sql:1083-1102.
CREATE OR REPLACE FUNCTION "public"."check_no_worker_on_group_container"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_is_container BOOLEAN;
BEGIN
  SELECT is_group_container INTO v_is_container
  FROM campaign_organising_units
  WHERE ou_id = NEW.ou_id;

  IF v_is_container = TRUE THEN
    RAISE EXCEPTION
      'Cannot assign workers directly to group container OU %. '
      'Assign workers to the individual units within the group instead.',
      NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_no_worker_on_group_container() IS NULL;

-- 4. Two-value CHECK (baseline :9644 definition) — only when no universe row
--    exists; otherwise the WP2.2a three-value CHECK stays (NOTICE above).
DO $check_restore$
DECLARE
  v_universe bigint;
BEGIN
  SELECT count(*) INTO v_universe
  FROM public.campaign_worker_ou
  WHERE assignment_source = 'universe';
  IF v_universe <> 0 THEN
    RAISE NOTICE 'WP2.2a rollback: two-value CHECK not restored (% universe rows)', v_universe;
    RETURN;
  END IF;
  ALTER TABLE public.campaign_worker_ou
    DROP CONSTRAINT campaign_worker_ou_assignment_source_check;
  ALTER TABLE public.campaign_worker_ou
    ADD CONSTRAINT campaign_worker_ou_assignment_source_check
    CHECK (
      (assignment_source)::text = ANY (
        (ARRAY['manual'::character varying, 'rule'::character varying])::text[]
      )
    ) NOT VALID;
  ALTER TABLE public.campaign_worker_ou
    VALIDATE CONSTRAINT campaign_worker_ou_assignment_source_check;
  RAISE NOTICE 'WP2.2a rollback: two-value CHECK restored';
END;
$check_restore$;

DO $postconditions$
DECLARE
  v_prosrc text;
  v_def text;
BEGIN
  IF to_regnamespace('oux_internal') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%'
     )
  THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: structure API objects remain';
  END IF;

  SELECT p.prosrc INTO v_prosrc
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'check_no_worker_on_group_container';
  IF v_prosrc IS NULL OR position('group_id IS NULL' IN v_prosrc) > 0 THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: check_no_worker_on_group_container() body was not restored';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.campaign_worker_ou'::regclass
    AND c.conname = 'campaign_worker_ou_assignment_source_check'
    AND c.convalidated;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: assignment_source CHECK is missing or not validated';
  END IF;
  IF (SELECT count(*) FROM public.campaign_worker_ou WHERE assignment_source = 'universe') = 0
     AND position('universe' IN v_def) > 0
  THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: two-value CHECK was not restored (%)', v_def;
  END IF;
  IF (SELECT count(*) FROM public.campaign_worker_ou WHERE assignment_source = 'universe') <> 0
     AND position('universe' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: universe rows exist but the CHECK no longer allows them (%)', v_def;
  END IF;

  IF (SELECT count(*) FROM public.campaign_worker_ou) <> (SELECT placements FROM _wp22_90_counts)
     OR (SELECT count(*) FROM public.campaign_organising_units) <> (SELECT units FROM _wp22_90_counts)
  THEN
    RAISE EXCEPTION 'WP2.2a rollback failed: placement or unit counts changed';
  END IF;
END;
$postconditions$;

SELECT
  c.public_rpcs_before,
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%') AS public_rpcs_after,
  c.helpers_before,
  (to_regnamespace('oux_internal') IS NOT NULL) AS internal_schema_remains,
  (SELECT pg_get_constraintdef(x.oid) FROM pg_constraint AS x
     WHERE x.conrelid = 'public.campaign_worker_ou'::regclass
       AND x.conname = 'campaign_worker_ou_assignment_source_check') AS check_definition_after,
  (SELECT count(*) FROM public.campaign_worker_ou WHERE assignment_source = 'universe') AS universe_rows_blocking_check_restore,
  c.placements AS placements_unchanged,
  c.units AS units_unchanged
FROM _wp22_90_counts AS c;

COMMIT;
