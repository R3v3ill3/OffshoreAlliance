-- WP2.1 schema recovery rollback. Operator-run only; never a migration.
-- Removes only WP2.1 schema objects and added columns. Application row data in
-- pre-existing columns is not changed. Migration-history repair is a separate,
-- recovery-only command requiring explicit approval and is not executed here.

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
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP2.1 rollback STOP: WP2.2 enforcement objects exist';
  END IF;

  IF to_regclass('public.campaign_groups') IS NULL
     OR to_regclass('public.user_campaign_prefs') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.1 rollback STOP: required WP2.1 tables are absent';
  END IF;
END;
$precondition$;

CREATE TEMP TABLE _wp21_rollback_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;
INSERT INTO _wp21_rollback_counts
VALUES
  ('membership', (SELECT count(*) FROM public.campaign_worker_membership)),
  ('placements', (SELECT count(*) FROM public.campaign_worker_ou)),
  ('units', (SELECT count(*) FROM public.campaign_organising_units));

CREATE TEMP TABLE _wp21_rollback_checksums ON COMMIT DROP AS
SELECT 'campaign_worker_ou'::text AS object_name,
       md5(coalesce(string_agg(
         concat_ws('|', id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id),
         ',' ORDER BY id
       ), '')) AS checksum
FROM public.campaign_worker_ou
UNION ALL
SELECT 'campaign_organising_units',
       md5(coalesce(string_agg(
         concat_ws(
           '|', ou_id, campaign_id, ou_type, name, parent_ou_id, ou_group_id,
           is_group_container, user_rating, display_order, unit_basis, updated_at
         ),
         ',' ORDER BY ou_id
       ), ''))
FROM public.campaign_organising_units
UNION ALL
SELECT 'campaign_worker_membership',
       md5(coalesce(string_agg(
         concat_ws('|', campaign_id, worker_id),
         ',' ORDER BY campaign_id, worker_id
       ), ''))
FROM public.campaign_worker_membership
UNION ALL
SELECT 'campaign_unit_rules',
       md5(coalesce(string_agg(
         concat_ws('|', rule_id, campaign_id, ou_id),
         ',' ORDER BY rule_id
       ), ''))
FROM public.campaign_unit_rules;

CREATE TEMP TABLE _wp21_rollback_views ON COMMIT DROP AS
SELECT
  c.relname AS view_name,
  md5(pg_get_viewdef(c.oid)) AS definition_hash,
  coalesce(c.reloptions, ARRAY[]::text[]) AS reloptions
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname = ANY (ARRAY[
    'campaign_ou_coverage_summary',
    'campaign_unit_assignment_summary',
    'campaign_unit_hierarchy_summary',
    'campaign_worker_unit_membership_summary',
    'v_campaign_coverage_map',
    'v_campaign_coverage_summary',
    'v_campaign_foundational_readiness',
    'v_section_plan_workforce_mapping',
    'v_woc_unit_representation',
    'vw_call_action_report'
  ]);

DO $view_precondition$
BEGIN
  IF (SELECT count(*) FROM _wp21_rollback_views) <> 10 THEN
    RAISE EXCEPTION 'WP2.1 rollback STOP: expected all 10 dependent views';
  END IF;
END;
$view_precondition$;

DROP TRIGGER IF EXISTS trg_cwo_z_set_group_id ON public.campaign_worker_ou;
DROP TRIGGER IF EXISTS trg_cou_z_after_group_change ON public.campaign_organising_units;
DROP TRIGGER IF EXISTS trg_cou_y_default_group ON public.campaign_organising_units;

DROP FUNCTION IF EXISTS public.cwo_set_group_id();
DROP FUNCTION IF EXISTS public.cou_after_group_change();
DROP FUNCTION IF EXISTS public.cou_default_group();

ALTER TABLE public.campaign_worker_ou
  DROP COLUMN IF EXISTS group_id;

ALTER TABLE public.campaign_organising_units
  DROP CONSTRAINT IF EXISTS cou_leaf_requires_group;
ALTER TABLE public.campaign_organising_units
  DROP COLUMN IF EXISTS group_id;

DROP TABLE IF EXISTS public.user_campaign_prefs;
DROP TABLE IF EXISTS public.campaign_groups;

DROP FUNCTION IF EXISTS public.campaign_group_ensure(integer, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.campaign_group_target_for_unit(text, boolean, integer);
DROP FUNCTION IF EXISTS public.campaign_group_kind_for_ou_type(text);

DO $postconditions$
DECLARE
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_rollback_counts WHERE metric = 'membership')
     OR (SELECT count(*) FROM public.campaign_worker_ou)
       <> (SELECT value FROM _wp21_rollback_counts WHERE metric = 'placements')
     OR (SELECT count(*) FROM public.campaign_organising_units)
       <> (SELECT value FROM _wp21_rollback_counts WHERE metric = 'units')
  THEN
    RAISE EXCEPTION 'WP2.1 rollback failed: application row counts changed';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_rollback_checksums AS before_hash
  FULL JOIN (
    SELECT 'campaign_worker_ou'::text AS object_name,
           md5(coalesce(string_agg(
             concat_ws('|', id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id),
             ',' ORDER BY id
           ), '')) AS checksum
    FROM public.campaign_worker_ou
    UNION ALL
    SELECT 'campaign_organising_units',
           md5(coalesce(string_agg(
             concat_ws(
               '|', ou_id, campaign_id, ou_type, name, parent_ou_id, ou_group_id,
               is_group_container, user_rating, display_order, unit_basis, updated_at
             ),
             ',' ORDER BY ou_id
           ), ''))
    FROM public.campaign_organising_units
    UNION ALL
    SELECT 'campaign_worker_membership',
           md5(coalesce(string_agg(
             concat_ws('|', campaign_id, worker_id),
             ',' ORDER BY campaign_id, worker_id
           ), ''))
    FROM public.campaign_worker_membership
    UNION ALL
    SELECT 'campaign_unit_rules',
           md5(coalesce(string_agg(
             concat_ws('|', rule_id, campaign_id, ou_id),
             ',' ORDER BY rule_id
           ), ''))
    FROM public.campaign_unit_rules
  ) AS after_hash USING (object_name)
  WHERE before_hash.checksum IS DISTINCT FROM after_hash.checksum;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 rollback failed: % application checksums changed', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_rollback_views AS before_view
  FULL JOIN (
    SELECT
      c.relname AS view_name,
      md5(pg_get_viewdef(c.oid)) AS definition_hash,
      coalesce(c.reloptions, ARRAY[]::text[]) AS reloptions
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname = ANY (ARRAY[
        'campaign_ou_coverage_summary',
        'campaign_unit_assignment_summary',
        'campaign_unit_hierarchy_summary',
        'campaign_worker_unit_membership_summary',
        'v_campaign_coverage_map',
        'v_campaign_coverage_summary',
        'v_campaign_foundational_readiness',
        'v_section_plan_workforce_mapping',
        'v_woc_unit_representation',
        'vw_call_action_report'
      ])
  ) AS after_view USING (view_name)
  WHERE before_view.definition_hash IS DISTINCT FROM after_view.definition_hash
     OR before_view.reloptions IS DISTINCT FROM after_view.reloptions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 rollback failed: % dependent views changed', v_count;
  END IF;

  IF to_regclass('public.campaign_groups') IS NOT NULL
     OR to_regclass('public.user_campaign_prefs') IS NOT NULL
     OR to_regprocedure('public.cwo_set_group_id()') IS NOT NULL
     OR to_regprocedure('public.cou_after_group_change()') IS NOT NULL
     OR to_regprocedure('public.cou_default_group()') IS NOT NULL
     OR to_regprocedure('public.campaign_group_ensure(integer,text,text,integer,integer)') IS NOT NULL
     OR to_regprocedure('public.campaign_group_target_for_unit(text,boolean,integer)') IS NOT NULL
     OR to_regprocedure('public.campaign_group_kind_for_ou_type(text)') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_attribute
       WHERE attrelid IN (
         'public.campaign_worker_ou'::regclass,
         'public.campaign_organising_units'::regclass
       )
         AND attname = 'group_id'
         AND NOT attisdropped
     )
     OR EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname IN (
         'trg_cwo_z_set_group_id',
         'trg_cou_z_after_group_change',
         'trg_cou_y_default_group'
       )
         AND tgrelid IN (
           'public.campaign_worker_ou'::regclass,
           'public.campaign_organising_units'::regclass
         )
         AND NOT tgisinternal
     )
  THEN
    RAISE EXCEPTION 'WP2.1 rollback failed: one or more schema objects remain';
  END IF;
END;
$postconditions$;

COMMIT;
