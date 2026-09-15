-- WP2.2a: transactional structure API (docs/organiser-ux-review/wp/wp2.2.md §3.5).
-- Approved decisions: R1 (+R1-b), M2-a, K1, G1, T, C-k (wp2.2.md §9.1).
--
-- Additive and compatible with the legacy client writers: nothing here changes
-- what an existing INSERT/UPDATE/DELETE on campaign_organising_units or
-- campaign_worker_ou does, except that a placement on a group container that
-- carries a group_id is now accepted (C-e, §3.4). It is therefore safe to apply
-- before the WP2.2 code deploys (production order, wp2.2.md §0 step 6 / §6.4).
--
-- Supabase db push wraps each migration file in one transaction. This file
-- deliberately has no explicit BEGIN/COMMIT so it follows repository convention
-- (wp2.1.md §7.1). Operator alternative: psql -1 -v ON_ERROR_STOP=1 -f <file>.
--
-- Sections, in order (wp2.2.md §3.5):
--   0. Preconditions (refuse a partial or repeated application).
--   1. assignment_source CHECK widened to ('manual','rule','universe') (R1).
--   2. check_no_worker_on_group_container() relaxed (C-e, M2).
--   3. Private schema oux_internal and the structure__* helpers (deviation D1:
--      helpers are SECURITY INVOKER and therefore MUST be executable by the
--      caller; they are kept off the REST surface by living in a schema that
--      PostgREST does not expose, not by revoking EXECUTE from authenticated).
--   4. The 15 public structure_* RPCs (§3.3), each with COMMENT ON FUNCTION.
--   5. structure_materialise_employer_placements (§3.7, M2).
--   6. Grants (§3.2).
--   7. Post-assertions.
--
-- Conventions shared by every RPC (§3.1, §3.2):
--   * plpgsql, SECURITY INVOKER, SET search_path; p_campaign_id integer first.
--   * oux_internal.structure__assert_can_write(p_campaign_id) first → 42501.
--   * every ou_id / group_id / worker_id argument is verified to belong to
--     p_campaign_id → 22023 (message names the offending id); missing → P0002.
--   * GET DIAGNOSTICS after every statement that must affect rows → P0002.
--   * delete/move the existing same-group placement BEFORE writing a new one,
--     so the bodies are correct before and after WP2.2b's unique index.
--   * campaign_worker_ou.group_id is never written here (trigger-derived).
--   * jsonb results with stable keys; the wrapper (structure-api.ts) validates.
--   * duplicate-in-group is raised explicitly as SQLSTATE 23505 with
--     CONSTRAINT = 'campaign_worker_ou_one_unit_per_group' and the same message
--     text PostgreSQL will produce once WP2.2b's index exists, so the client
--     contract does not change when enforcement lands.
--
-- Rollback: scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql.

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------

DO $preconditions$
DECLARE
  v_def text;
  v_values text[];
BEGIN
  IF to_regclass('public.campaign_groups') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_attribute
       WHERE attrelid = 'public.campaign_worker_ou'::regclass
         AND attname = 'group_id'
         AND NOT attisdropped
     )
     OR to_regprocedure('public.campaign_group_ensure(integer,text,text,integer,integer)') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.2a precondition failed: WP2.1 (campaign_groups, group_id, campaign_group_ensure) is not applied';
  END IF;

  IF to_regnamespace('oux_internal') IS NOT NULL
     OR to_regprocedure('public.structure_placements_assign(integer,integer,integer[],text,boolean,text)') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname LIKE 'structure\_%'
     )
  THEN
    RAISE EXCEPTION 'WP2.2a target objects already exist; refusing a partial or repeated migration';
  END IF;

  SELECT pg_get_constraintdef(c.oid)
    INTO v_def
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.campaign_worker_ou'::regclass
    AND c.conname = 'campaign_worker_ou_assignment_source_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'WP2.2a precondition failed: campaign_worker_ou_assignment_source_check is missing';
  END IF;

  -- Fix round 2 (A1, D23): the CHECK must be either the baseline two-value shape
  -- or exactly the three-value shape this file installs (left behind by
  -- 90_rollback_wp2_2_structure_api.sql when 'universe' rows exist, D16).
  -- Any other shape stops the migration.
  SELECT coalesce(array_agg(DISTINCT m[1] ORDER BY m[1]), '{}'::text[])
    INTO v_values
  FROM regexp_matches(v_def, '''([a-z_]+)''::character varying', 'g') AS m;
  IF v_values <> ARRAY['manual', 'rule']::text[]
     AND v_values <> ARRAY['manual', 'rule', 'universe']::text[]
  THEN
    RAISE EXCEPTION 'WP2.2a precondition failed: assignment_source CHECK has an unexpected shape (%)', v_def;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.campaign_worker_ou
    WHERE assignment_source NOT IN ('manual', 'rule', 'universe')
  ) THEN
    RAISE EXCEPTION 'WP2.2a precondition failed: campaign_worker_ou carries an assignment_source outside (manual, rule, universe)';
  END IF;
END;
$preconditions$;

-- ---------------------------------------------------------------------------
-- 1. R1: a third provenance value. Baseline constraint name confirmed at
--    supabase/migrations/20260908050000_baseline_schema.sql:9644
--    ("campaign_worker_ou_assignment_source_check"). Drop/add NOT VALID then
--    VALIDATE. Inside this single transaction the DROP already holds ACCESS
--    EXCLUSIVE, so the two-step form does not shorten the lock here; it is kept
--    because it is the shape the operator run sheet and the rollback use, and
--    the ~1,400-row scan is sub-second either way (fix round 1, 8b).
-- ---------------------------------------------------------------------------

-- Tolerant of an already-widened CHECK (fix round 2, A1 / D23): after a `90`
-- rollback that found 'universe' rows, the three-value CHECK is still in place
-- and this file must be re-applicable. The precondition above has already
-- rejected every shape other than the two- or three-value one.
DO $widen_check$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.campaign_worker_ou'::regclass
    AND c.conname = 'campaign_worker_ou_assignment_source_check';

  IF position('universe' IN v_def) > 0 THEN
    RAISE NOTICE 'WP2.2a: assignment_source CHECK already allows (manual, rule, universe); drop/add skipped (%)', v_def;
    RETURN;
  END IF;

  ALTER TABLE public.campaign_worker_ou
    DROP CONSTRAINT campaign_worker_ou_assignment_source_check;

  ALTER TABLE public.campaign_worker_ou
    ADD CONSTRAINT campaign_worker_ou_assignment_source_check
    CHECK (
      (assignment_source)::text = ANY (
        (ARRAY['manual'::character varying, 'rule'::character varying, 'universe'::character varying])::text[]
      )
    ) NOT VALID;

  ALTER TABLE public.campaign_worker_ou
    VALIDATE CONSTRAINT campaign_worker_ou_assignment_source_check;
END;
$widen_check$;

COMMENT ON CONSTRAINT campaign_worker_ou_assignment_source_check ON public.campaign_worker_ou IS
  'WP2.2 R1 (wp2.2.md §3.8): manual = user action; rule = written by Recompute from a campaign_unit_rules row (assigned_rule_id set); universe = written by the campaign-universe sync or the M2 Employer materialisation. Recompute withdraws only rule rows.';

-- ---------------------------------------------------------------------------
-- 2. C-e: containers accept placements only when they carry a group_id
--    (Employer-group containers after WP2.1). Custom-kind containers
--    (group_id IS NULL, they *became* groups) still reject. Everything else in
--    the baseline body (:1083–1102) is preserved: LANGUAGE plpgsql, no
--    SECURITY/search_path clause, same message, same P0001 errcode.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_no_worker_on_group_container() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_is_container BOOLEAN;
  v_group_id INTEGER;
BEGIN
  SELECT is_group_container, group_id INTO v_is_container, v_group_id
  FROM campaign_organising_units
  WHERE ou_id = NEW.ou_id;

  -- WP2.2 (wp2.2.md §3.5 item 2, M2): a container that carries a group_id is a
  -- unit of that group (the Employer group) and may hold placements.
  IF v_is_container = TRUE AND v_group_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot assign workers directly to group container OU %. '
      'Assign workers to the individual units within the group instead.',
      NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_no_worker_on_group_container() IS
  'WP2.2 (wp2.2.md §3.5 item 2, decision M2 / rule C-e): rejects a placement only on a group container that has no group_id (a legacy custom-kind container). Containers with a group_id (Employer group) accept placements. Baseline body: 20260908050000_baseline_schema.sql:1083–1102.';

-- ---------------------------------------------------------------------------
-- 3. Private schema and internal helpers (deviation D1, wp2.2.md §8.3).
--    A SECURITY INVOKER function runs as its caller, so the caller needs
--    EXECUTE on every function the body calls. The helpers therefore stay
--    executable by authenticated/service_role and are kept off the REST API by
--    living in a schema PostgREST does not expose (project default exposed set:
--    public, graphql_public). anon has neither USAGE on the schema nor EXECUTE.
-- ---------------------------------------------------------------------------

CREATE SCHEMA oux_internal AUTHORIZATION postgres;

COMMENT ON SCHEMA oux_internal IS
  'WP2.2 (wp2.2.md §3.5 item 3, deviation D1): internal helpers of the structure API. Not exposed through PostgREST; never add this schema to the API "Exposed schemas" setting. Functions here are SECURITY INVOKER and are executable by authenticated only so that the public structure_* RPCs can call them.';

REVOKE ALL ON SCHEMA oux_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA oux_internal TO authenticated, service_role;

-- 3.1 Permission pre-check (§3.1 principle 1). Raises instead of letting RLS
--     filter a write to zero rows. Mirrors the wp16_* write policies exactly:
--     get_user_role() IN ('admin','user') AND can_write_to_campaign(). A session
--     without a JWT subject (auth.uid() IS NULL) is permitted only when its role
--     bypasses RLS anyway (postgres / service_role), which is how the operator
--     scripts under scripts/data-hygiene/oux-wp2.2/ call the RPCs.
CREATE FUNCTION oux_internal.structure__assert_can_write(p_campaign_id integer)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_bypass boolean;
  v_role text;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_campaign_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.campaigns AS c WHERE c.campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('campaign %s not found', p_campaign_id);
  END IF;

  IF auth.uid() IS NULL THEN
    SELECT (r.rolsuper OR r.rolbypassrls)
      INTO v_bypass
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = current_user;

    IF coalesce(v_bypass, false) THEN
      RETURN;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('no write permission on campaign %s: not signed in', p_campaign_id);
  END IF;

  v_role := public.get_user_role();

  IF coalesce(v_role IN ('admin', 'user'), false)
     AND coalesce(public.can_write_to_campaign(p_campaign_id), false)
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = format('no write permission on campaign %s', p_campaign_id);
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__assert_can_write(integer) IS
  'WP2.2 (wp2.2.md §3.1 principle 1, §3.5 item 3): raises 42501 unless the caller may write to the campaign (same predicate as the wp16_* write policies); P0002 when the campaign does not exist; permits RLS-bypassing sessions without a JWT (postgres, service_role) so operator scripts can call the RPCs.';

-- 3.2 Unit lookup with the cross-campaign guard (§3.1 principle 2, C-i).
CREATE FUNCTION oux_internal.structure__unit(p_campaign_id integer, p_ou_id integer)
RETURNS public.campaign_organising_units
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_unit public.campaign_organising_units;
BEGIN
  IF p_ou_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'an organising unit id is required';
  END IF;

  SELECT * INTO v_unit
  FROM public.campaign_organising_units AS u
  WHERE u.ou_id = p_ou_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('organising unit %s not found', p_ou_id);
  END IF;

  IF v_unit.campaign_id <> p_campaign_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('organising unit %s does not belong to campaign %s', p_ou_id, p_campaign_id);
  END IF;

  RETURN v_unit;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__unit(integer, integer) IS
  'WP2.2 (wp2.2.md §3.1 principle 2, rule C-i): returns the unit row; P0002 when missing, 22023 when it belongs to another campaign.';

-- 3.3 Group lookup with the cross-campaign guard.
CREATE FUNCTION oux_internal.structure__group(p_campaign_id integer, p_group_id integer)
RETURNS public.campaign_groups
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_group public.campaign_groups;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'a group id is required';
  END IF;

  SELECT * INTO v_group
  FROM public.campaign_groups AS g
  WHERE g.group_id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('group %s not found', p_group_id);
  END IF;

  IF v_group.campaign_id <> p_campaign_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('group %s does not belong to campaign %s', p_group_id, p_campaign_id);
  END IF;

  RETURN v_group;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__group(integer, integer) IS
  'WP2.2 (wp2.2.md §3.1 principle 2, rule C-i): returns the group row; P0002 when missing, 22023 when it belongs to another campaign.';

-- 3.4 Worker-id normalisation and the cross-campaign guard for workers.
--     Returns the distinct, non-null ids in ascending order ('{}' for an empty
--     input). Every id must exist (P0002). When p_require_membership, every id
--     must also be a member of the campaign (22023) — required wherever an RPC
--     may create a NEW placement from an argument; not required for RPCs that
--     only move or remove rows the worker already holds.
CREATE FUNCTION oux_internal.structure__worker_ids(
  p_campaign_id integer,
  p_worker_ids integer[],
  p_require_membership boolean
)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_ids integer[];
  v_bad integer;
BEGIN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::integer[])
    INTO v_ids
  FROM unnest(coalesce(p_worker_ids, '{}'::integer[])) AS x
  WHERE x IS NOT NULL;

  IF cardinality(v_ids) = 0 THEN
    RETURN v_ids;
  END IF;

  SELECT x INTO v_bad
  FROM unnest(v_ids) AS x
  WHERE NOT EXISTS (SELECT 1 FROM public.workers AS w WHERE w.worker_id = x)
  ORDER BY x
  LIMIT 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('worker %s not found', v_bad);
  END IF;

  IF p_require_membership THEN
    SELECT x INTO v_bad
    FROM unnest(v_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.campaign_worker_membership AS m
      WHERE m.campaign_id = p_campaign_id
        AND m.worker_id = x
    )
    ORDER BY x
    LIMIT 1;

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('worker %s is not a member of campaign %s', v_bad, p_campaign_id);
    END IF;
  END IF;

  RETURN v_ids;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__worker_ids(integer, integer[], boolean) IS
  'WP2.2 (wp2.2.md §3.1 principle 2, rule C-i): distinct non-null worker ids; P0002 for an unknown worker; 22023 for a non-member when membership is required (new placements).';

-- 3.5 Primary flag (C-h): campaign-wide single-valued. Clears every other
--     is_primary row of the worker in the campaign, then sets the given one.
--     Returns the number of rows cleared. P0002 when the target row is missing.
CREATE FUNCTION oux_internal.structure__set_primary(
  p_campaign_id integer,
  p_worker_id integer,
  p_ou_id integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_cleared integer;
  v_set integer;
BEGIN
  UPDATE public.campaign_worker_ou AS p
  SET is_primary = false
  FROM public.campaign_organising_units AS u
  WHERE u.ou_id = p.ou_id
    AND u.campaign_id = p_campaign_id
    AND p.worker_id = p_worker_id
    AND p.is_primary
    AND p.ou_id <> p_ou_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  UPDATE public.campaign_worker_ou AS p
  SET is_primary = true
  WHERE p.ou_id = p_ou_id
    AND p.worker_id = p_worker_id
    AND NOT p.is_primary;
  GET DIAGNOSTICS v_set = ROW_COUNT;

  IF v_set = 0
     AND NOT EXISTS (
       SELECT 1
       FROM public.campaign_worker_ou AS p
       WHERE p.ou_id = p_ou_id
         AND p.worker_id = p_worker_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('worker %s has no placement on organising unit %s', p_worker_id, p_ou_id);
  END IF;

  RETURN v_cleared;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__set_primary(integer, integer, integer) IS
  'WP2.2 (wp2.2.md §3.4 rule C-h): makes one placement the worker''s single campaign-wide primary. Returns the number of other rows cleared; P0002 when the placement does not exist.';

-- 3.6 The shared assign/move core (§3.3 structure_placements_assign, §3.4
--     C-a/C-e/C-h/C-l). Places p_worker_id on p_unit:
--       * unit without group_id (custom-kind container)         → P0001 (C-e)
--       * already on the unit                                   → 'skipped'
--       * another placement in the unit's group: p_on_conflict
--           'skip'  → 'skipped'
--           'error' → 23505 campaign_worker_ou_one_unit_per_group
--           'move'  → the preferred row (primary first, then lowest id) is
--                     UPDATEd onto the unit (id/provenance preserved, C-l);
--                     any further same-group rows are deleted (pre-WP2.2b
--                     duplicates) → 'moved', displaced = rows deleted
--       * otherwise INSERT (is_primary false, p_source, p_assigned_rule_id) → 'inserted'
--     When p_is_primary, the placement becomes the campaign-wide primary
--     (C-h) — also when the worker was already on the unit. lost_primary is
--     true when a deleted row was the primary and the kept row was not; the
--     caller does not need to act on it because the kept row is chosen
--     primary-first, so the flag can only be true when p_on_conflict = 'move'
--     deleted a primary duplicate while an older non-primary row was kept —
--     this function then promotes the kept row itself.
CREATE FUNCTION oux_internal.structure__place(
  p_campaign_id integer,
  p_unit public.campaign_organising_units,
  p_worker_id integer,
  p_source text,
  p_is_primary boolean,
  p_on_conflict text,
  p_assigned_rule_id integer,
  OUT outcome text,
  OUT displaced integer,
  OUT lost_primary boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_existing_primary boolean;
  v_same_group_rows integer;
  v_keep_id integer;
  v_keep_primary boolean;
  v_any_primary boolean;
  v_count integer;
BEGIN
  outcome := NULL;
  displaced := 0;
  lost_primary := false;

  IF p_unit.group_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'organising unit %s is a group container without a group and cannot hold placements; assign workers to the units inside it',
        p_unit.ou_id
      );
  END IF;

  IF p_on_conflict NOT IN ('skip', 'move', 'error') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('p_on_conflict must be one of skip, move, error (got %s)', coalesce(p_on_conflict, 'null'));
  END IF;

  IF p_source NOT IN ('manual', 'rule', 'universe') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('assignment source must be one of manual, rule, universe (got %s)', coalesce(p_source, 'null'));
  END IF;

  SELECT p.is_primary INTO v_existing_primary
  FROM public.campaign_worker_ou AS p
  WHERE p.ou_id = p_unit.ou_id
    AND p.worker_id = p_worker_id;

  IF FOUND THEN
    outcome := 'skipped';
    IF p_is_primary AND NOT v_existing_primary THEN
      PERFORM oux_internal.structure__set_primary(p_campaign_id, p_worker_id, p_unit.ou_id);
    END IF;
    RETURN;
  END IF;

  SELECT count(*), coalesce(bool_or(p.is_primary), false)
    INTO v_same_group_rows, v_any_primary
  FROM public.campaign_worker_ou AS p
  WHERE p.worker_id = p_worker_id
    AND p.group_id = p_unit.group_id;

  IF v_same_group_rows > 0 THEN
    IF p_on_conflict = 'skip' THEN
      outcome := 'skipped';
      RETURN;
    END IF;

    IF p_on_conflict = 'error' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        CONSTRAINT = 'campaign_worker_ou_one_unit_per_group',
        TABLE = 'campaign_worker_ou',
        SCHEMA = 'public',
        MESSAGE = 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
        DETAIL = format(
          'Key (worker_id, group_id)=(%s, %s) already exists. Worker %s already has a placement in group %s of campaign %s; move it instead of adding a second one.',
          p_worker_id, p_unit.group_id, p_worker_id, p_unit.group_id, p_campaign_id
        ),
        HINT = 'A worker is in at most one unit per group (wp2.2.md §3.4 C-a).';
    END IF;

    -- 'move': keep the preferred row, delete the rest, then re-point the keeper.
    SELECT p.id, p.is_primary
      INTO v_keep_id, v_keep_primary
    FROM public.campaign_worker_ou AS p
    WHERE p.worker_id = p_worker_id
      AND p.group_id = p_unit.group_id
    ORDER BY p.is_primary DESC, p.id
    LIMIT 1;

    DELETE FROM public.campaign_worker_ou AS p
    WHERE p.worker_id = p_worker_id
      AND p.group_id = p_unit.group_id
      AND p.id <> v_keep_id;
    GET DIAGNOSTICS displaced = ROW_COUNT;

    UPDATE public.campaign_worker_ou AS p
    SET ou_id = p_unit.ou_id
    WHERE p.id = v_keep_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('placement %s of worker %s could not be moved to organising unit %s', v_keep_id, p_worker_id, p_unit.ou_id);
    END IF;

    outcome := 'moved';
    lost_primary := v_any_primary AND NOT v_keep_primary;

    IF p_is_primary OR lost_primary THEN
      PERFORM oux_internal.structure__set_primary(p_campaign_id, p_worker_id, p_unit.ou_id);
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source, assigned_rule_id)
  VALUES (p_unit.ou_id, p_worker_id, false, p_source, p_assigned_rule_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('placement of worker %s on organising unit %s was not written', p_worker_id, p_unit.ou_id);
  END IF;

  outcome := 'inserted';

  IF p_is_primary THEN
    PERFORM oux_internal.structure__set_primary(p_campaign_id, p_worker_id, p_unit.ou_id);
  END IF;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__place(integer, public.campaign_organising_units, integer, text, boolean, text, integer) IS
  'WP2.2 (wp2.2.md §3.3 assign core, §3.4 C-a/C-e/C-h/C-l): places one worker on one unit with skip/move/error semantics for an existing same-group placement; never writes group_id.';

-- 3.7 Strict JSON accessors: an argument that is present but of the wrong
--     JSON type is a 22023, never a 22P02 cast failure.
CREATE FUNCTION oux_internal.structure__json_int(p_obj jsonb, p_key text, p_context text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v jsonb := p_obj -> p_key;
  v_num numeric;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'number' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "%s" must be an integer (got %s)', p_context, p_key, jsonb_typeof(v));
  END IF;
  v_num := (v #>> '{}')::numeric;
  IF v_num <> trunc(v_num) OR v_num < -2147483648 OR v_num > 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "%s" must be a 32-bit integer (got %s)', p_context, p_key, v #>> '{}');
  END IF;
  RETURN v_num::integer;
END;
$function$;

CREATE FUNCTION oux_internal.structure__json_bool(p_obj jsonb, p_key text, p_context text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v jsonb := p_obj -> p_key;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'boolean' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "%s" must be a boolean (got %s)', p_context, p_key, jsonb_typeof(v));
  END IF;
  RETURN (v #>> '{}')::boolean;
END;
$function$;

CREATE FUNCTION oux_internal.structure__json_text(p_obj jsonb, p_key text, p_context text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v jsonb := p_obj -> p_key;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "%s" must be a string (got %s)', p_context, p_key, jsonb_typeof(v));
  END IF;
  RETURN v #>> '{}';
END;
$function$;

-- A jsonb value that must be an object (or null); returns NULL for JSON null.
CREATE FUNCTION oux_internal.structure__json_object(p_obj jsonb, p_key text, p_context text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v jsonb := p_obj -> p_key;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "%s" must be a JSON object (got %s)', p_context, p_key, jsonb_typeof(v));
  END IF;
  RETURN v;
END;
$function$;

-- Asserts that p_value is a JSON array (an absent/null argument counts as '[]').
CREATE FUNCTION oux_internal.structure__json_array(p_value jsonb, p_context text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_value) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s must be a JSON array (got %s)', p_context, jsonb_typeof(p_value));
  END IF;
  RETURN p_value;
END;
$function$;

-- 3.8 Batch unit creation core (§3.3 structure_units_create; shared by
--     structure_unit_split and structure_units_bulk_save). Element keys:
--       client_ref?, name, ou_type, total_workers_estimated? (alias
--       estimated_size?), target_size?, commonality_logic?, display_order?,
--       is_group_container?, parent_ou_id?, ou_group_id?, ou_group_name?,
--       group_id? (custom kind only, C-g), unit_basis?, source?,
--       anchor_worker_id?, user_rating?, source_metadata?
--     parent_ou_id / ou_group_id accept an integer (an existing unit of the
--     campaign) or a string (the client_ref of an EARLIER element of this call).
--     p_defaults is merged under every element (element keys win, including an
--     explicit null). Returns {"units":[{client_ref, ou_id, group_id}, …]} in
--     input order. Deviation D3 (wp2.2.md §8.3): the plan's description /
--     estimated_size / leader_worker_id are not columns of
--     campaign_organising_units; the real columns are whitelisted here and
--     estimated_size is accepted as an alias of total_workers_estimated.
CREATE FUNCTION oux_internal.structure__create_units(
  p_campaign_id integer,
  p_units jsonb,
  p_defaults jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_units jsonb := oux_internal.structure__json_array(p_units, 'p_units');
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_bad_key text;
  v_ref text;
  v_ref_names text[] := '{}';
  v_ref_ids integer[] := '{}';
  v_name text;
  v_type text;
  v_kind text;
  v_container boolean;
  v_parent integer;
  v_ou_group integer;
  v_group_name text;
  v_group_id integer;
  v_group public.campaign_groups;
  v_source text;
  v_estimate integer;
  v_target integer;
  v_rating smallint;
  v_anchor integer;
  v_order integer;
  v_next_order integer;
  v_basis jsonb;
  v_meta jsonb;
  v_logic text;
  v_parent_row public.campaign_organising_units;
  v_new_id integer;
  v_new_group integer;
  v_out jsonb := '[]'::jsonb;
  v_count integer;
  v_pos integer;
BEGIN
  IF jsonb_array_length(v_units) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_units must contain at least one unit';
  END IF;

  SELECT coalesce(max(u.display_order), -1) + 1
    INTO v_next_order
  FROM public.campaign_organising_units AS u
  WHERE u.campaign_id = p_campaign_id;

  FOR v_idx IN 0 .. jsonb_array_length(v_units) - 1 LOOP
    v_ctx := format('p_units[%s]', v_idx);
    v_parent_row := NULL;
    v_elem := v_units -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    v_elem := coalesce(p_defaults, '{}'::jsonb) || v_elem;

    SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_elem) AS k
    WHERE k NOT IN (
      'client_ref', 'name', 'ou_type', 'total_workers_estimated', 'estimated_size',
      'target_size', 'commonality_logic', 'display_order', 'is_group_container',
      'parent_ou_id', 'ou_group_id', 'ou_group_name', 'group_id', 'unit_basis',
      'source', 'anchor_worker_id', 'user_rating', 'source_metadata'
    )
    LIMIT 1;
    IF v_bad_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown key "%s"', v_ctx, v_bad_key);
    END IF;

    v_ref := oux_internal.structure__json_text(v_elem, 'client_ref', v_ctx);
    IF v_ref IS NOT NULL AND btrim(v_ref) = '' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: client_ref must not be blank', v_ctx);
    END IF;
    IF v_ref IS NOT NULL AND v_ref = ANY (v_ref_names) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: duplicate client_ref "%s"', v_ctx, v_ref);
    END IF;

    v_name := btrim(oux_internal.structure__json_text(v_elem, 'name', v_ctx));
    IF v_name IS NULL OR v_name = '' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "name" is required', v_ctx);
    END IF;
    IF length(v_name) > 200 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "name" exceeds 200 characters', v_ctx);
    END IF;

    v_type := oux_internal.structure__json_text(v_elem, 'ou_type', v_ctx);
    IF v_type IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "ou_type" is required', v_ctx);
    END IF;
    SELECT k.kind INTO v_kind FROM public.campaign_group_kind_for_ou_type(v_type) AS k;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown ou_type "%s"', v_ctx, v_type);
    END IF;

    v_container := coalesce(oux_internal.structure__json_bool(v_elem, 'is_group_container', v_ctx), false);

    v_source := coalesce(oux_internal.structure__json_text(v_elem, 'source', v_ctx), 'manual');
    IF v_source NOT IN ('manual', 'wtp_seeded', 'generated', 'field_discovery') THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown source "%s"', v_ctx, v_source);
    END IF;

    IF (v_elem ? 'total_workers_estimated') AND (v_elem ? 'estimated_size') THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: give either "total_workers_estimated" or its alias "estimated_size", not both', v_ctx);
    END IF;
    v_estimate := coalesce(
      oux_internal.structure__json_int(v_elem, 'total_workers_estimated', v_ctx),
      oux_internal.structure__json_int(v_elem, 'estimated_size', v_ctx)
    );
    IF v_estimate IS NOT NULL AND v_estimate < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: the size estimate must not be negative', v_ctx);
    END IF;

    v_target := oux_internal.structure__json_int(v_elem, 'target_size', v_ctx);
    IF v_target IS NOT NULL AND v_target < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "target_size" must not be negative', v_ctx);
    END IF;

    v_rating := oux_internal.structure__json_int(v_elem, 'user_rating', v_ctx);
    IF v_rating IS NOT NULL AND (v_rating < 1 OR v_rating > 5) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "user_rating" must be between 1 and 5', v_ctx);
    END IF;

    v_anchor := oux_internal.structure__json_int(v_elem, 'anchor_worker_id', v_ctx);
    IF v_anchor IS NOT NULL THEN
      PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[v_anchor], false);
    END IF;

    v_logic := oux_internal.structure__json_text(v_elem, 'commonality_logic', v_ctx);
    v_basis := oux_internal.structure__json_object(v_elem, 'unit_basis', v_ctx);
    v_meta := oux_internal.structure__json_object(v_elem, 'source_metadata', v_ctx);
    v_order := coalesce(oux_internal.structure__json_int(v_elem, 'display_order', v_ctx), v_next_order + v_idx);

    -- parent_ou_id / ou_group_id: integer (existing unit) or string (earlier client_ref).
    v_parent := NULL;
    v_ou_group := NULL;
    IF (v_elem ? 'parent_ou_id') AND jsonb_typeof(v_elem -> 'parent_ou_id') <> 'null' THEN
      IF jsonb_typeof(v_elem -> 'parent_ou_id') = 'string' THEN
        IF btrim(v_elem ->> 'parent_ou_id') = '' THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('%s: parent_ou_id client_ref must not be blank', v_ctx);
        END IF;
        v_pos := array_position(v_ref_names, v_elem ->> 'parent_ou_id');
        IF v_pos IS NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('%s: parent_ou_id client_ref "%s" is not an earlier element of this call', v_ctx, v_elem ->> 'parent_ou_id');
        END IF;
        v_parent := v_ref_ids[v_pos];
      ELSE
        v_parent := oux_internal.structure__json_int(v_elem, 'parent_ou_id', v_ctx);
      END IF;
    END IF;
    IF (v_elem ? 'ou_group_id') AND jsonb_typeof(v_elem -> 'ou_group_id') <> 'null' THEN
      IF jsonb_typeof(v_elem -> 'ou_group_id') = 'string' THEN
        IF btrim(v_elem ->> 'ou_group_id') = '' THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('%s: ou_group_id client_ref must not be blank', v_ctx);
        END IF;
        v_pos := array_position(v_ref_names, v_elem ->> 'ou_group_id');
        IF v_pos IS NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('%s: ou_group_id client_ref "%s" is not an earlier element of this call', v_ctx, v_elem ->> 'ou_group_id');
        END IF;
        v_ou_group := v_ref_ids[v_pos];
      ELSE
        v_ou_group := oux_internal.structure__json_int(v_elem, 'ou_group_id', v_ctx);
      END IF;
    END IF;

    v_group_name := btrim(oux_internal.structure__json_text(v_elem, 'ou_group_name', v_ctx));
    IF v_group_name IS NOT NULL AND v_group_name <> '' THEN
      SELECT count(*), min(u.ou_id)
        INTO v_count, v_pos
      FROM public.campaign_organising_units AS u
      WHERE u.campaign_id = p_campaign_id
        AND u.is_group_container
        AND lower(btrim(u.name)) = lower(v_group_name);
      IF v_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('%s: ou_group_name matches %s group containers in campaign %s (exactly one required)', v_ctx, v_count, p_campaign_id);
      END IF;
      IF v_ou_group IS NOT NULL AND v_ou_group <> v_pos THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('%s: ou_group_name and ou_group_id name different containers', v_ctx);
      END IF;
      v_ou_group := v_pos;
    END IF;

    -- Legacy invariant (baseline trigger cou_enforce_group_consistency):
    -- ou_group_id always equals parent_ou_id when set.
    IF v_ou_group IS NOT NULL AND v_parent IS NULL THEN
      v_parent := v_ou_group;
    END IF;
    IF v_ou_group IS NOT NULL AND v_parent <> v_ou_group THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: ou_group_id (%s) must equal parent_ou_id (%s) when both are set', v_ctx, v_ou_group, v_parent);
    END IF;
    IF v_parent IS NOT NULL THEN
      v_parent_row := oux_internal.structure__unit(p_campaign_id, v_parent);
    END IF;
    IF v_ou_group IS NOT NULL AND NOT v_parent_row.is_group_container THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: ou_group_id %s is not a group container', v_ctx, v_ou_group);
    END IF;
    IF v_container AND v_ou_group IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: a group container cannot itself be a member of a group container', v_ctx);
    END IF;

    -- C-g: fixed-kind units get their group from ou_type; custom units may be
    -- pinned to a custom group of the campaign.
    v_group_id := oux_internal.structure__json_int(v_elem, 'group_id', v_ctx);
    IF v_group_id IS NOT NULL THEN
      v_group := oux_internal.structure__group(p_campaign_id, v_group_id);
      IF v_container AND v_kind = 'custom' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('%s: a custom-kind group container becomes a group and cannot be pinned to group %s', v_ctx, v_group_id);
      END IF;
      IF v_kind <> 'custom' AND v_group.kind <> v_kind THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('%s: ou_type "%s" derives the %s group; group %s is of kind %s', v_ctx, v_type, v_kind, v_group_id, v_group.kind);
      END IF;
      IF v_kind = 'custom' AND v_group.kind <> 'custom' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = format('%s: custom-kind unit cannot be pinned to the fixed-kind group %s (%s)', v_ctx, v_group_id, v_group.kind);
      END IF;
    END IF;

    INSERT INTO public.campaign_organising_units (
      campaign_id, name, ou_type, total_workers_estimated, target_size, commonality_logic,
      display_order, is_group_container, parent_ou_id, ou_group_id, group_id, unit_basis,
      source, anchor_worker_id, user_rating, source_metadata
    )
    VALUES (
      p_campaign_id, v_name, v_type, v_estimate, v_target, v_logic,
      v_order, v_container, v_parent, v_ou_group, v_group_id, v_basis,
      v_source, v_anchor, v_rating, v_meta
    )
    RETURNING ou_id, group_id INTO v_new_id, v_new_group;

    IF v_new_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('%s: the organising unit was not created', v_ctx);
    END IF;

    v_ref_names := v_ref_names || coalesce(v_ref, '');
    v_ref_ids := v_ref_ids || v_new_id;

    v_out := v_out || jsonb_build_object(
      'client_ref', v_ref,
      'ou_id', v_new_id,
      'group_id', v_new_group
    );
  END LOOP;

  RETURN jsonb_build_object('units', v_out);
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__create_units(integer, jsonb, jsonb) IS
  'WP2.2 (wp2.2.md §3.3 structure_units_create core, rule C-g): validates and inserts unit elements in order; client_ref of an earlier element may be used as parent_ou_id / ou_group_id; whitelisted real columns only (deviation D3).';

-- 3.9 Unit patch core (§3.3 structure_unit_update). Whitelisted keys are the
--     real columns: name, total_workers_estimated (alias estimated_size),
--     target_size, commonality_logic, display_order, user_rating,
--     anchor_worker_id, unit_basis, source_metadata. Any other key → 22023.
--     Returns the keys applied.
CREATE FUNCTION oux_internal.structure__update_unit(
  p_campaign_id integer,
  p_unit public.campaign_organising_units,
  p_patch jsonb
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_ctx text := format('p_patch for organising unit %s', p_unit.ou_id);
  v_bad_key text;
  v_keys text[];
  v_name text;
  v_estimate integer;
  v_target integer;
  v_rating smallint;
  v_anchor integer;
  v_count integer;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_patch must be a JSON object';
  END IF;

  SELECT k INTO v_bad_key
  FROM jsonb_object_keys(p_patch) AS k
  WHERE k NOT IN (
    'name', 'total_workers_estimated', 'estimated_size', 'target_size', 'commonality_logic',
    'display_order', 'user_rating', 'anchor_worker_id', 'unit_basis', 'source_metadata'
  )
  LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: key "%s" is not updatable through the structure API', v_ctx, v_bad_key);
  END IF;

  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_keys
  FROM jsonb_object_keys(p_patch) AS k;
  IF cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: at least one key is required', v_ctx);
  END IF;
  IF (p_patch ? 'total_workers_estimated') AND (p_patch ? 'estimated_size') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: give either "total_workers_estimated" or its alias "estimated_size", not both', v_ctx);
  END IF;

  IF p_patch ? 'name' THEN
    v_name := btrim(oux_internal.structure__json_text(p_patch, 'name', v_ctx));
    IF v_name IS NULL OR v_name = '' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "name" must not be blank', v_ctx);
    END IF;
    IF length(v_name) > 200 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "name" exceeds 200 characters', v_ctx);
    END IF;
  END IF;

  v_estimate := coalesce(
    oux_internal.structure__json_int(p_patch, 'total_workers_estimated', v_ctx),
    oux_internal.structure__json_int(p_patch, 'estimated_size', v_ctx)
  );
  IF v_estimate IS NOT NULL AND v_estimate < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: the size estimate must not be negative', v_ctx);
  END IF;
  v_target := oux_internal.structure__json_int(p_patch, 'target_size', v_ctx);
  IF v_target IS NOT NULL AND v_target < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "target_size" must not be negative', v_ctx);
  END IF;
  v_rating := oux_internal.structure__json_int(p_patch, 'user_rating', v_ctx);
  IF v_rating IS NOT NULL AND (v_rating < 1 OR v_rating > 5) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('%s: "user_rating" must be between 1 and 5', v_ctx);
  END IF;
  v_anchor := oux_internal.structure__json_int(p_patch, 'anchor_worker_id', v_ctx);
  IF v_anchor IS NOT NULL THEN
    PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[v_anchor], false);
  END IF;
  -- Type-check the object-valued keys up front (22023, not 22P02).
  PERFORM oux_internal.structure__json_object(p_patch, 'unit_basis', v_ctx);
  PERFORM oux_internal.structure__json_object(p_patch, 'source_metadata', v_ctx);
  PERFORM oux_internal.structure__json_int(p_patch, 'display_order', v_ctx);
  PERFORM oux_internal.structure__json_text(p_patch, 'commonality_logic', v_ctx);

  UPDATE public.campaign_organising_units AS u
  SET name = CASE WHEN p_patch ? 'name' THEN v_name ELSE u.name END,
      total_workers_estimated = CASE
        WHEN (p_patch ? 'total_workers_estimated') OR (p_patch ? 'estimated_size') THEN v_estimate
        ELSE u.total_workers_estimated END,
      target_size = CASE WHEN p_patch ? 'target_size' THEN v_target ELSE u.target_size END,
      commonality_logic = CASE
        WHEN p_patch ? 'commonality_logic' THEN oux_internal.structure__json_text(p_patch, 'commonality_logic', v_ctx)
        ELSE u.commonality_logic END,
      display_order = CASE
        WHEN p_patch ? 'display_order' THEN coalesce(oux_internal.structure__json_int(p_patch, 'display_order', v_ctx), u.display_order)
        ELSE u.display_order END,
      user_rating = CASE WHEN p_patch ? 'user_rating' THEN v_rating ELSE u.user_rating END,
      anchor_worker_id = CASE WHEN p_patch ? 'anchor_worker_id' THEN v_anchor ELSE u.anchor_worker_id END,
      unit_basis = CASE
        WHEN p_patch ? 'unit_basis' THEN oux_internal.structure__json_object(p_patch, 'unit_basis', v_ctx)
        ELSE u.unit_basis END,
      source_metadata = CASE
        WHEN p_patch ? 'source_metadata' THEN oux_internal.structure__json_object(p_patch, 'source_metadata', v_ctx)
        ELSE u.source_metadata END
  WHERE u.ou_id = p_unit.ou_id
    AND u.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('organising unit %s was not updated (%s rows affected)', p_unit.ou_id, v_count);
  END IF;

  RETURN v_keys;
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__update_unit(integer, public.campaign_organising_units, jsonb) IS
  'WP2.2 (wp2.2.md §3.3 structure_unit_update core): applies a whitelisted patch to one unit; 22023 for any other key; P0002 when no row was updated. name changes fire the WP2.1 AFTER trigger as before.';

-- 3.10 Unit delete core (§3.3 structure_unit_delete; used by
--      structure_group_delete cascade_units and structure_units_bulk_save).
--      Order: per-worker reassignments → descendants (deleted, or detached by
--      clearing parent_ou_id/ou_group_id so the NO ACTION ou_group_id FK cannot
--      block the delete) → the unit's remaining placements → the unit row.
--      Dependants keep their declared FK actions (§3.3 list). Returns
--      {deleted_ou_ids, placements_moved, placements_removed, placements_displaced}.
CREATE FUNCTION oux_internal.structure__delete_unit(
  p_campaign_id integer,
  p_unit public.campaign_organising_units,
  p_reassignments jsonb,
  p_delete_children boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_reassign jsonb := oux_internal.structure__json_array(p_reassignments, 'p_reassignments');
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_bad_key text;
  v_worker integer;
  v_to integer;
  v_primary_arg boolean;
  v_src_id integer;
  v_src_primary boolean;
  v_target public.campaign_organising_units;
  v_lost boolean;
  v_count integer;
  v_moved integer := 0;
  v_removed integer := 0;
  v_displaced integer := 0;
  v_desc integer[];
  v_id integer;
  v_deleted integer[];
  v_seen integer[] := '{}';
BEGIN
  FOR v_idx IN 0 .. jsonb_array_length(v_reassign) - 1 LOOP
    v_ctx := format('p_reassignments[%s]', v_idx);
    v_elem := v_reassign -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_elem) AS k
    WHERE k NOT IN ('worker_id', 'to_ou_id', 'is_primary')
    LIMIT 1;
    IF v_bad_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown key "%s"', v_ctx, v_bad_key);
    END IF;

    v_worker := oux_internal.structure__json_int(v_elem, 'worker_id', v_ctx);
    IF v_worker IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "worker_id" is required', v_ctx);
    END IF;
    IF v_worker = ANY (v_seen) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: worker %s appears more than once', v_ctx, v_worker);
    END IF;
    v_seen := v_seen || v_worker;
    v_to := oux_internal.structure__json_int(v_elem, 'to_ou_id', v_ctx);
    v_primary_arg := oux_internal.structure__json_bool(v_elem, 'is_primary', v_ctx);

    SELECT p.id, p.is_primary
      INTO v_src_id, v_src_primary
    FROM public.campaign_worker_ou AS p
    WHERE p.ou_id = p_unit.ou_id
      AND p.worker_id = v_worker;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('%s: worker %s has no placement on organising unit %s', v_ctx, v_worker, p_unit.ou_id);
    END IF;

    IF v_to IS NULL THEN
      DELETE FROM public.campaign_worker_ou AS p WHERE p.id = v_src_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = format('%s: placement %s was not removed', v_ctx, v_src_id);
      END IF;
      v_removed := v_removed + 1;
      CONTINUE;
    END IF;

    v_target := oux_internal.structure__unit(p_campaign_id, v_to);
    IF v_target.ou_id = p_unit.ou_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: to_ou_id %s is the unit being deleted', v_ctx, v_to);
    END IF;
    IF v_target.group_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('%s: organising unit %s is a group container without a group and cannot hold placements', v_ctx, v_to);
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.campaign_worker_ou AS p
      WHERE p.ou_id = v_target.ou_id AND p.worker_id = v_worker
    ) THEN
      -- Already on the target: the source row collapses into it (C-h carries the flag).
      IF v_src_primary OR coalesce(v_primary_arg, false) THEN
        PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_target.ou_id);
      END IF;
      DELETE FROM public.campaign_worker_ou AS p WHERE p.id = v_src_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = format('%s: placement %s was not removed', v_ctx, v_src_id);
      END IF;
      v_removed := v_removed + 1;
      CONTINUE;
    END IF;

    -- Displace any other placement of the worker in the target's group (C-a, C-b),
    -- then re-point the source row (id and provenance preserved, C-l).
    SELECT coalesce(bool_or(p.is_primary), false) INTO v_lost
    FROM public.campaign_worker_ou AS p
    WHERE p.worker_id = v_worker
      AND p.group_id = v_target.group_id
      AND p.id <> v_src_id;
    DELETE FROM public.campaign_worker_ou AS p
    WHERE p.worker_id = v_worker
      AND p.group_id = v_target.group_id
      AND p.id <> v_src_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_displaced := v_displaced + v_count;

    UPDATE public.campaign_worker_ou AS p
    SET ou_id = v_target.ou_id
    WHERE p.id = v_src_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('%s: placement %s could not be moved to organising unit %s', v_ctx, v_src_id, v_to);
    END IF;
    v_moved := v_moved + 1;

    IF coalesce(v_primary_arg, false) OR (v_lost AND NOT v_src_primary) THEN
      PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_target.ou_id);
    END IF;
  END LOOP;

  -- Descendants (parent_ou_id / ou_group_id chains), deepest first.
  SELECT array_agg(x.ou_id ORDER BY x.depth DESC, x.ou_id) INTO v_desc
  FROM (
    WITH RECURSIVE d AS (
      SELECT u.ou_id, 1 AS depth
      FROM public.campaign_organising_units AS u
      WHERE u.parent_ou_id = p_unit.ou_id OR u.ou_group_id = p_unit.ou_id
      UNION ALL
      SELECT u.ou_id, d.depth + 1
      FROM public.campaign_organising_units AS u
      JOIN d ON u.parent_ou_id = d.ou_id OR u.ou_group_id = d.ou_id
      WHERE d.depth < 8
    )
    SELECT d.ou_id, max(d.depth) AS depth FROM d GROUP BY d.ou_id
  ) AS x;

  IF v_desc IS NOT NULL THEN
    IF p_delete_children THEN
      DELETE FROM public.campaign_worker_ou AS p WHERE p.ou_id = ANY (v_desc);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_removed := v_removed + v_count;

      FOREACH v_id IN ARRAY v_desc LOOP
        DELETE FROM public.campaign_organising_units AS u WHERE u.ou_id = v_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = format('child organising unit %s of %s was not deleted', v_id, p_unit.ou_id);
        END IF;
      END LOOP;
      v_deleted := v_desc;
    ELSE
      -- Detach the direct children so the NO ACTION ou_group_id FK cannot block
      -- the delete; the WP2.1 BEFORE trigger re-derives their group_id.
      UPDATE public.campaign_organising_units AS u
      SET parent_ou_id = NULL,
          ou_group_id = NULL
      WHERE u.parent_ou_id = p_unit.ou_id OR u.ou_group_id = p_unit.ou_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count = 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = format('children of organising unit %s could not be detached', p_unit.ou_id);
      END IF;
    END IF;
  END IF;

  DELETE FROM public.campaign_worker_ou AS p WHERE p.ou_id = p_unit.ou_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_removed := v_removed + v_count;

  DELETE FROM public.campaign_organising_units AS u
  WHERE u.ou_id = p_unit.ou_id
    AND u.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('organising unit %s was not deleted (%s rows affected)', p_unit.ou_id, v_count);
  END IF;

  RETURN jsonb_build_object(
    'deleted_ou_ids', to_jsonb(coalesce(v_deleted, '{}'::integer[]) || p_unit.ou_id),
    'placements_moved', v_moved,
    'placements_removed', v_removed,
    'placements_displaced', v_displaced
  );
END;
$function$;

COMMENT ON FUNCTION oux_internal.structure__delete_unit(integer, public.campaign_organising_units, jsonb, boolean) IS
  'WP2.2 (wp2.2.md §3.3 structure_unit_delete core): per-worker reassign/remove, then children (deleted or detached), then the unit''s placements, then the unit. Explicit deletes before the parent row so deferred FK flushes cannot surprise (wp2.1.md §14.6).';

-- ---------------------------------------------------------------------------
-- 4. Public RPCs (wp2.2.md §3.3). Every function: plpgsql, SECURITY INVOKER,
--    SET search_path, p_campaign_id first, permission pre-check first.
-- ---------------------------------------------------------------------------

-- 4.1 Groups (contract tests only in WP2.2; no UI consumer, §1.5).

CREATE FUNCTION public.structure_group_create(
  p_campaign_id integer,
  p_kind text,
  p_name text,
  p_display_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_name text := btrim(p_name);
  v_label text;
  v_rank integer;
  v_group_id integer;
  v_count integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  IF p_kind IS NULL OR p_kind NOT IN ('worksite', 'employer', 'shift', 'crew', 'occupation', 'work_area', 'custom') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('p_kind must be one of worksite, employer, shift, crew, occupation, work_area, custom (got %s)', coalesce(p_kind, 'null'));
  END IF;
  IF v_name IS NOT NULL AND length(v_name) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_name exceeds 200 characters';
  END IF;

  IF p_kind <> 'custom' THEN
    -- Fixed kinds are idempotent: one group per kind per campaign
    -- (campaign_groups_one_fixed_kind_per_campaign). The name is the kind
    -- label unless the caller supplies one.
    SELECT g.group_id INTO v_group_id
    FROM public.campaign_groups AS g
    WHERE g.campaign_id = p_campaign_id
      AND g.kind = p_kind;
    IF v_group_id IS NOT NULL THEN
      RETURN jsonb_build_object('group_id', v_group_id, 'created', false);
    END IF;

    SELECT k.label, k.rank
      INTO v_label, v_rank
    FROM (VALUES ('worksite'), ('employer'), ('shift'), ('crew_rotation'), ('job_type'), ('work_area')) AS t(ou_type)
    CROSS JOIN LATERAL public.campaign_group_kind_for_ou_type(t.ou_type) AS k
    WHERE k.kind = p_kind
    LIMIT 1;

    v_group_id := public.campaign_group_ensure(
      p_campaign_id,
      p_kind,
      coalesce(nullif(v_name, ''), v_label),
      NULL,
      coalesce(p_display_order, v_rank)
    );
    RETURN jsonb_build_object('group_id', v_group_id, 'created', true);
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_name is required for a custom group';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_groups AS g
  WHERE g.campaign_id = p_campaign_id
    AND g.kind = 'custom';

  -- A name collision raises the natural 23505 on campaign_groups_campaign_name_key
  -- (wrapper kind duplicate_group).
  INSERT INTO public.campaign_groups (campaign_id, kind, name, display_order)
  VALUES (p_campaign_id, 'custom', v_name, coalesce(p_display_order, 80 + v_count + 1))
  RETURNING group_id INTO v_group_id;

  RETURN jsonb_build_object('group_id', v_group_id, 'created', true);
END;
$function$;

COMMENT ON FUNCTION public.structure_group_create(integer, text, text, integer) IS
  'WP2.2 structure API (wp2.2.md §3.3): create a group. Fixed kinds wrap campaign_group_ensure (idempotent, returns the existing group); custom kinds insert a new group with the given name. Returns {group_id, created}.';

CREATE FUNCTION public.structure_group_update(
  p_campaign_id integer,
  p_group_id integer,
  p_name text DEFAULT NULL,
  p_display_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_group public.campaign_groups;
  v_name text := btrim(p_name);
  v_count integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_group := oux_internal.structure__group(p_campaign_id, p_group_id);

  IF p_name IS NULL AND p_display_order IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_name or p_display_order is required';
  END IF;
  IF p_name IS NOT NULL AND (v_name = '' OR length(v_name) > 200) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_name must be 1 to 200 characters';
  END IF;

  UPDATE public.campaign_groups AS g
  SET name = coalesce(v_name, g.name),
      display_order = coalesce(p_display_order, g.display_order)
  WHERE g.group_id = v_group.group_id
    AND g.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('group %s was not updated (%s rows affected)', p_group_id, v_count);
  END IF;

  -- A group backfilled from a legacy custom-kind container keeps that
  -- container's name in step (the WP2.1 AFTER trigger propagates container →
  -- group; this is the reverse direction).
  IF v_name IS NOT NULL AND v_group.source_ou_id IS NOT NULL THEN
    UPDATE public.campaign_organising_units AS u
    SET name = v_name
    WHERE u.ou_id = v_group.source_ou_id
      AND u.campaign_id = p_campaign_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('legacy container %s of group %s was not renamed (%s rows affected)', v_group.source_ou_id, p_group_id, v_count);
    END IF;
  END IF;

  RETURN jsonb_build_object('group_id', v_group.group_id);
END;
$function$;

COMMENT ON FUNCTION public.structure_group_update(integer, integer, text, integer) IS
  'WP2.2 structure API (wp2.2.md §3.3): rename and/or reorder one group (kind is immutable). A rename of a container-backed custom group also renames its legacy container. Returns {group_id}.';

CREATE FUNCTION public.structure_group_reorder(
  p_campaign_id integer,
  p_group_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_ids integer[];
  v_n integer;
  v_count integer;
  v_rest integer;
  v_id integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  IF p_group_ids IS NULL OR cardinality(p_group_ids) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_group_ids must contain at least one group id';
  END IF;
  SELECT array_agg(x) INTO v_ids FROM unnest(p_group_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL
     OR cardinality(v_ids) <> cardinality(p_group_ids)
     OR (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> cardinality(v_ids)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_group_ids must not contain nulls or duplicates';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM oux_internal.structure__group(p_campaign_id, v_id);
  END LOOP;
  v_n := cardinality(v_ids);

  UPDATE public.campaign_groups AS g
  SET display_order = o.ord - 1
  FROM unnest(v_ids) WITH ORDINALITY AS o(gid, ord)
  WHERE g.group_id = o.gid
    AND g.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_n THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('expected to reorder %s groups but %s rows were updated', v_n, v_count);
  END IF;

  UPDATE public.campaign_groups AS g
  SET display_order = v_n + r.rn - 1
  FROM (
    SELECT x.group_id, row_number() OVER (ORDER BY x.display_order, x.group_id) AS rn
    FROM public.campaign_groups AS x
    WHERE x.campaign_id = p_campaign_id
      AND NOT (x.group_id = ANY (v_ids))
  ) AS r
  WHERE g.group_id = r.group_id;
  GET DIAGNOSTICS v_rest = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_count, 'unlisted', v_rest);
END;
$function$;

COMMENT ON FUNCTION public.structure_group_reorder(integer, integer[]) IS
  'WP2.2 structure API (wp2.2.md §3.3): display_order = array position for the listed groups; unlisted groups keep their relative order after the listed ones. Returns {updated, unlisted}.';

CREATE FUNCTION public.structure_group_delete(
  p_campaign_id integer,
  p_group_id integer,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_group public.campaign_groups;
  v_unit_ids integer[];
  v_id integer;
  v_unit public.campaign_organising_units;
  v_res jsonb;
  v_deleted integer[] := '{}';
  v_removed integer := 0;
  v_count integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_group := oux_internal.structure__group(p_campaign_id, p_group_id);

  IF p_mode IS NULL OR p_mode NOT IN ('empty_only', 'cascade_units') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('p_mode must be empty_only or cascade_units (got %s)', coalesce(p_mode, 'null'));
  END IF;

  -- Members of a container in the same group go before the container.
  SELECT array_agg(u.ou_id ORDER BY (u.ou_group_id IS NOT NULL) DESC, (u.parent_ou_id IS NOT NULL) DESC, u.ou_id)
    INTO v_unit_ids
  FROM public.campaign_organising_units AS u
  WHERE u.campaign_id = p_campaign_id
    AND u.group_id = v_group.group_id;

  IF v_unit_ids IS NOT NULL AND p_mode = 'empty_only' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('group %s still has %s organising units; delete them first or use cascade_units', p_group_id, cardinality(v_unit_ids));
  END IF;

  IF v_unit_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_unit_ids LOOP
      v_unit := oux_internal.structure__unit(p_campaign_id, v_id);
      v_res := oux_internal.structure__delete_unit(p_campaign_id, v_unit, '[]'::jsonb, false);
      v_deleted := v_deleted || v_id;
      v_removed := v_removed + (v_res ->> 'placements_removed')::integer;
    END LOOP;
  END IF;

  -- The deferred NO ACTION FKs would otherwise fail at commit; check now.
  IF EXISTS (SELECT 1 FROM public.campaign_organising_units AS u WHERE u.group_id = v_group.group_id)
     OR EXISTS (SELECT 1 FROM public.campaign_worker_ou AS p WHERE p.group_id = v_group.group_id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('group %s is still referenced by units or placements', p_group_id);
  END IF;

  DELETE FROM public.campaign_groups AS g
  WHERE g.group_id = v_group.group_id
    AND g.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('group %s was not deleted (%s rows affected)', p_group_id, v_count);
  END IF;

  RETURN jsonb_build_object(
    'group_id', v_group.group_id,
    'deleted_ou_ids', to_jsonb(v_deleted),
    'placements_removed', v_removed
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_group_delete(integer, integer, text) IS
  'WP2.2 structure API (wp2.2.md §3.3): delete a group. empty_only raises P0001 while any unit has the group; cascade_units deletes each unit through the unit-delete logic (no reassignment; children in other groups are detached) before the group row. A legacy custom-kind container whose group is deleted is not itself deleted (it is not a unit of the group). Returns {group_id, deleted_ou_ids, placements_removed}.';

-- 4.2 Units.

CREATE FUNCTION public.structure_units_create(
  p_campaign_id integer,
  p_units jsonb,
  p_assignments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_res jsonb;
  v_assign jsonb := oux_internal.structure__json_array(p_assignments, 'p_assignments');
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_bad_key text;
  v_ou_id integer;
  v_unit public.campaign_organising_units;
  v_worker integer;
  v_source text;
  v_primary boolean;
  v_placed record;
  v_inserted integer := 0;
  v_moved integer := 0;
  v_skipped integer := 0;
  v_displaced integer := 0;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_res := oux_internal.structure__create_units(p_campaign_id, p_units, NULL);

  FOR v_idx IN 0 .. jsonb_array_length(v_assign) - 1 LOOP
    v_ctx := format('p_assignments[%s]', v_idx);
    v_elem := v_assign -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_elem) AS k
    WHERE k NOT IN ('ou_ref', 'worker_id', 'is_primary', 'source')
    LIMIT 1;
    IF v_bad_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown key "%s"', v_ctx, v_bad_key);
    END IF;

    -- ou_ref: the client_ref (string) or the ou_id (integer) of a unit created by this call.
    IF jsonb_typeof(v_elem -> 'ou_ref') = 'string' THEN
      SELECT (u ->> 'ou_id')::integer INTO v_ou_id
      FROM jsonb_array_elements(v_res -> 'units') AS u
      WHERE u ->> 'client_ref' = v_elem ->> 'ou_ref';
    ELSE
      v_ou_id := oux_internal.structure__json_int(v_elem, 'ou_ref', v_ctx);
      IF v_ou_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_res -> 'units') AS u
           WHERE (u ->> 'ou_id')::integer = v_ou_id
         )
      THEN
        v_ou_id := NULL;
      END IF;
    END IF;
    IF v_ou_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: ou_ref does not name a unit created by this call', v_ctx);
    END IF;

    v_worker := oux_internal.structure__json_int(v_elem, 'worker_id', v_ctx);
    IF v_worker IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "worker_id" is required', v_ctx);
    END IF;
    PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[v_worker], true);
    v_source := coalesce(oux_internal.structure__json_text(v_elem, 'source', v_ctx), 'manual');
    v_primary := coalesce(oux_internal.structure__json_bool(v_elem, 'is_primary', v_ctx), false);

    v_unit := oux_internal.structure__unit(p_campaign_id, v_ou_id);
    SELECT * INTO v_placed
    FROM oux_internal.structure__place(p_campaign_id, v_unit, v_worker, v_source, v_primary, 'move', NULL);
    v_displaced := v_displaced + v_placed.displaced;
    IF v_placed.outcome = 'inserted' THEN v_inserted := v_inserted + 1;
    ELSIF v_placed.outcome = 'moved' THEN v_moved := v_moved + 1;
    ELSE v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN v_res || jsonb_build_object(
    'inserted', v_inserted,
    'moved', v_moved,
    'skipped', v_skipped,
    'displaced', v_displaced
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_units_create(integer, jsonb, jsonb) IS
  'WP2.2 structure API (wp2.2.md §3.3): batch-create units (containers plus members in one call via client_ref), then apply assignments [{ou_ref, worker_id, is_primary?, source?}] with move semantics within the created units'' groups. Returns {units:[{client_ref, ou_id, group_id}], inserted, moved, skipped, displaced}.';

CREATE FUNCTION public.structure_unit_update(
  p_campaign_id integer,
  p_ou_id integer,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_unit public.campaign_organising_units;
  v_keys text[];
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_unit := oux_internal.structure__unit(p_campaign_id, p_ou_id);
  v_keys := oux_internal.structure__update_unit(p_campaign_id, v_unit, p_patch);
  RETURN jsonb_build_object('ou_id', v_unit.ou_id, 'updated_keys', to_jsonb(v_keys));
END;
$function$;

COMMENT ON FUNCTION public.structure_unit_update(integer, integer, jsonb) IS
  'WP2.2 structure API (wp2.2.md §3.3; deviation D3 for the key list): patch one unit. Keys: name, total_workers_estimated (alias estimated_size), target_size, commonality_logic, display_order, user_rating, anchor_worker_id, unit_basis, source_metadata; any other key → 22023. Returns {ou_id, updated_keys}.';

CREATE FUNCTION public.structure_unit_reorder(
  p_campaign_id integer,
  p_ou_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_ids integer[];
  v_id integer;
  v_count integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  IF p_ou_ids IS NULL OR cardinality(p_ou_ids) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_ou_ids must contain at least one organising unit id';
  END IF;
  SELECT array_agg(x) INTO v_ids FROM unnest(p_ou_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL
     OR cardinality(v_ids) <> cardinality(p_ou_ids)
     OR (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> cardinality(v_ids)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_ou_ids must not contain nulls or duplicates';
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM oux_internal.structure__unit(p_campaign_id, v_id);
  END LOOP;

  UPDATE public.campaign_organising_units AS u
  SET display_order = o.ord - 1
  FROM unnest(v_ids) WITH ORDINALITY AS o(oid, ord)
  WHERE u.ou_id = o.oid
    AND u.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('expected to reorder %s organising units but %s rows were updated', cardinality(v_ids), v_count);
  END IF;

  RETURN jsonb_build_object('updated', v_count);
END;
$function$;

COMMENT ON FUNCTION public.structure_unit_reorder(integer, integer[]) IS
  'WP2.2 structure API (wp2.2.md §3.3): display_order = array position (0-based) for the listed units. Returns {updated}.';

CREATE FUNCTION public.structure_unit_delete(
  p_campaign_id integer,
  p_ou_id integer,
  p_reassignments jsonb DEFAULT '[]'::jsonb,
  p_delete_children boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_unit public.campaign_organising_units;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_unit := oux_internal.structure__unit(p_campaign_id, p_ou_id);
  RETURN oux_internal.structure__delete_unit(p_campaign_id, v_unit, p_reassignments, coalesce(p_delete_children, false));
END;
$function$;

COMMENT ON FUNCTION public.structure_unit_delete(integer, integer, jsonb, boolean) IS
  'WP2.2 structure API (wp2.2.md §3.3): delete a unit. p_reassignments [{worker_id, to_ou_id|null, is_primary?}] move or remove named placements (move rules of structure_placements_move); remaining placements are removed; children are deleted (p_delete_children) or detached (parent_ou_id/ou_group_id cleared). Other ou_id dependants keep their FK actions. Returns {deleted_ou_ids, placements_moved, placements_removed, placements_displaced}.';

CREATE FUNCTION public.structure_unit_merge(
  p_campaign_id integer,
  p_survivor_ou_id integer,
  p_source_ou_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_survivor public.campaign_organising_units;
  v_source public.campaign_organising_units;
  v_sources integer[];
  v_id integer;
  v_count integer;
  v_expected integer;
  v_moved integer := 0;
  v_collapsed integer := 0;
  v_repointed jsonb := '{}'::jsonb;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_survivor := oux_internal.structure__unit(p_campaign_id, p_survivor_ou_id);

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::integer[]) INTO v_sources
  FROM unnest(coalesce(p_source_ou_ids, '{}'::integer[])) AS x
  WHERE x IS NOT NULL;
  IF cardinality(v_sources) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_source_ou_ids must contain at least one organising unit id';
  END IF;
  IF v_survivor.ou_id = ANY (v_sources) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('the survivor %s cannot also be a source (C-j)', v_survivor.ou_id);
  END IF;
  IF v_survivor.group_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('organising unit %s has no group and cannot be a merge survivor', v_survivor.ou_id);
  END IF;

  FOREACH v_id IN ARRAY v_sources LOOP
    v_source := oux_internal.structure__unit(p_campaign_id, v_id);
    IF v_source.group_id IS DISTINCT FROM v_survivor.group_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('organising unit %s is in group %s but the survivor %s is in group %s; merging across groups is not a merge (C-j)', v_id, coalesce(v_source.group_id::text, 'null'), v_survivor.ou_id, v_survivor.group_id);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.campaign_organising_units AS c
      WHERE c.parent_ou_id = v_id OR c.ou_group_id = v_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('organising unit %s has child units; delete or move them before merging it', v_id);
    END IF;
  END LOOP;

  -- 1. Workers present on both a source and the survivor: OR the primary flag
  --    onto the survivor row, then drop the source rows (collapsed).
  UPDATE public.campaign_worker_ou AS s
  SET is_primary = true
  WHERE s.ou_id = v_survivor.ou_id
    AND NOT s.is_primary
    AND EXISTS (
      SELECT 1 FROM public.campaign_worker_ou AS r
      WHERE r.ou_id = ANY (v_sources)
        AND r.worker_id = s.worker_id
        AND r.is_primary
    );

  DELETE FROM public.campaign_worker_ou AS r
  WHERE r.ou_id = ANY (v_sources)
    AND EXISTS (
      SELECT 1 FROM public.campaign_worker_ou AS s
      WHERE s.ou_id = v_survivor.ou_id
        AND s.worker_id = r.worker_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_collapsed := v_collapsed + v_count;

  -- 2. A worker on several sources (pre-WP2.2b duplicates): keep the preferred
  --    row (primary first, then lowest id), drop the rest (collapsed).
  DELETE FROM public.campaign_worker_ou AS r
  WHERE r.ou_id = ANY (v_sources)
    AND r.id <> (
      SELECT x.id FROM public.campaign_worker_ou AS x
      WHERE x.ou_id = ANY (v_sources)
        AND x.worker_id = r.worker_id
      ORDER BY x.is_primary DESC, x.id
      LIMIT 1
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_collapsed := v_collapsed + v_count;

  -- 3. Re-point the remaining source rows (id, provenance and primary preserved, C-l).
  SELECT count(*) INTO v_expected FROM public.campaign_worker_ou AS r WHERE r.ou_id = ANY (v_sources);
  UPDATE public.campaign_worker_ou AS r
  SET ou_id = v_survivor.ou_id
  WHERE r.ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> v_expected THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('expected to move %s placements onto organising unit %s but %s rows were updated', v_expected, v_survivor.ou_id, v_moved);
  END IF;

  -- 4. Explicit ou_id dependants (wp2.2.md §3.3 merge re-point list). Where a
  --    unique key exists the survivor's own row wins and the source row is left
  --    to the source unit's ON DELETE CASCADE. Each UPDATE asserts that every
  --    visible row it intended to move was moved (an RLS gap raises, never
  --    silently loses rows).
  SELECT count(*) INTO v_expected FROM public.campaign_unit_rules AS d WHERE d.ou_id = ANY (v_sources);
  UPDATE public.campaign_unit_rules AS d SET ou_id = v_survivor.ou_id WHERE d.ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_unit_rules: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_unit_rules', v_count);

  -- campaign_ou_coverage: UNIQUE (ou_id). At most one row can follow the survivor.
  SELECT count(*) INTO v_expected
  FROM public.campaign_ou_coverage AS d
  WHERE d.coverage_id = (
      SELECT min(x.coverage_id) FROM public.campaign_ou_coverage AS x WHERE x.ou_id = ANY (v_sources)
    )
    AND NOT EXISTS (SELECT 1 FROM public.campaign_ou_coverage AS s WHERE s.ou_id = v_survivor.ou_id);
  UPDATE public.campaign_ou_coverage AS d
  SET ou_id = v_survivor.ou_id
  WHERE d.coverage_id = (
      SELECT min(x.coverage_id) FROM public.campaign_ou_coverage AS x WHERE x.ou_id = ANY (v_sources)
    )
    AND NOT EXISTS (SELECT 1 FROM public.campaign_ou_coverage AS s WHERE s.ou_id = v_survivor.ou_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_ou_coverage: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_ou_coverage', v_count);

  -- woc_scope_units: PRIMARY KEY (woc_id, ou_id).
  SELECT count(*) INTO v_expected
  FROM public.woc_scope_units AS d
  WHERE d.ou_id = ANY (v_sources)
    AND d.ou_id = (SELECT min(x.ou_id) FROM public.woc_scope_units AS x WHERE x.woc_id = d.woc_id AND x.ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.woc_scope_units AS s WHERE s.woc_id = d.woc_id AND s.ou_id = v_survivor.ou_id);
  UPDATE public.woc_scope_units AS d
  SET ou_id = v_survivor.ou_id
  WHERE d.ou_id = ANY (v_sources)
    AND d.ou_id = (SELECT min(x.ou_id) FROM public.woc_scope_units AS x WHERE x.woc_id = d.woc_id AND x.ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.woc_scope_units AS s WHERE s.woc_id = d.woc_id AND s.ou_id = v_survivor.ou_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('woc_scope_units: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('woc_scope_units', v_count);

  -- structure_test_results: UNIQUE (structure_test_id, ou_id).
  SELECT count(*) INTO v_expected
  FROM public.structure_test_results AS d
  WHERE d.ou_id = ANY (v_sources)
    AND d.result_id = (SELECT min(x.result_id) FROM public.structure_test_results AS x WHERE x.structure_test_id = d.structure_test_id AND x.ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.structure_test_results AS s WHERE s.structure_test_id = d.structure_test_id AND s.ou_id = v_survivor.ou_id);
  UPDATE public.structure_test_results AS d
  SET ou_id = v_survivor.ou_id
  WHERE d.ou_id = ANY (v_sources)
    AND d.result_id = (SELECT min(x.result_id) FROM public.structure_test_results AS x WHERE x.structure_test_id = d.structure_test_id AND x.ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.structure_test_results AS s WHERE s.structure_test_id = d.structure_test_id AND s.ou_id = v_survivor.ou_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('structure_test_results: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('structure_test_results', v_count);

  -- section_plan_workforce_mapping_overrides: UNIQUE (section_plan_id, worksite_ou_id).
  SELECT count(*) INTO v_expected
  FROM public.section_plan_workforce_mapping_overrides AS d
  WHERE d.worksite_ou_id = ANY (v_sources)
    AND d.override_id = (SELECT min(x.override_id) FROM public.section_plan_workforce_mapping_overrides AS x WHERE x.section_plan_id = d.section_plan_id AND x.worksite_ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.section_plan_workforce_mapping_overrides AS s WHERE s.section_plan_id = d.section_plan_id AND s.worksite_ou_id = v_survivor.ou_id);
  UPDATE public.section_plan_workforce_mapping_overrides AS d
  SET worksite_ou_id = v_survivor.ou_id
  WHERE d.worksite_ou_id = ANY (v_sources)
    AND d.override_id = (SELECT min(x.override_id) FROM public.section_plan_workforce_mapping_overrides AS x WHERE x.section_plan_id = d.section_plan_id AND x.worksite_ou_id = ANY (v_sources))
    AND NOT EXISTS (SELECT 1 FROM public.section_plan_workforce_mapping_overrides AS s WHERE s.section_plan_id = d.section_plan_id AND s.worksite_ou_id = v_survivor.ou_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('section_plan_workforce_mapping_overrides: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('section_plan_workforce_mapping_overrides', v_count);

  -- No unique key on the ou column: plain re-point.
  SELECT count(*) INTO v_expected FROM public.campaign_worker_list_items AS d WHERE d.source_ou_id = ANY (v_sources);
  UPDATE public.campaign_worker_list_items AS d SET source_ou_id = v_survivor.ou_id WHERE d.source_ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_worker_list_items: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_worker_list_items', v_count);

  SELECT count(*) INTO v_expected FROM public.campaign_wocs AS d WHERE d.scope_ou_id = ANY (v_sources);
  UPDATE public.campaign_wocs AS d SET scope_ou_id = v_survivor.ou_id WHERE d.scope_ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_wocs: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_wocs', v_count);

  SELECT count(*) INTO v_expected FROM public.campaign_stage_workplan_tasks AS d WHERE d.assigned_ou_id = ANY (v_sources);
  UPDATE public.campaign_stage_workplan_tasks AS d SET assigned_ou_id = v_survivor.ou_id WHERE d.assigned_ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_stage_workplan_tasks: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_stage_workplan_tasks', v_count);

  SELECT count(*) INTO v_expected FROM public.campaign_ou_candidates AS d WHERE d.accepted_ou_id = ANY (v_sources);
  UPDATE public.campaign_ou_candidates AS d SET accepted_ou_id = v_survivor.ou_id WHERE d.accepted_ou_id = ANY (v_sources);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = format('campaign_ou_candidates: expected to re-point %s rows, updated %s', v_expected, v_count);
  END IF;
  v_repointed := v_repointed || jsonb_build_object('campaign_ou_candidates', v_count);

  -- 5. Delete the (now empty) source units.
  DELETE FROM public.campaign_organising_units AS u
  WHERE u.ou_id = ANY (v_sources)
    AND u.campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(v_sources) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('expected to delete %s source units but %s rows were deleted', cardinality(v_sources), v_count);
  END IF;

  RETURN jsonb_build_object(
    'moved', v_moved,
    'collapsed', v_collapsed,
    'deleted_ou_ids', to_jsonb(v_sources),
    'repointed', v_repointed
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_unit_merge(integer, integer, integer[]) IS
  'WP2.2 structure API (wp2.2.md §3.3, rules C-j/C-l): merge source units into a survivor of the same group. Placements are re-pointed (id/provenance kept) or collapsed (primary OR-ed); the explicit ou_id dependants are re-pointed (survivor row wins where a unique key exists); sources with child units are refused (P0001). Returns {moved, collapsed, deleted_ou_ids, repointed}.';

CREATE FUNCTION public.structure_unit_split(
  p_campaign_id integer,
  p_source_ou_id integer,
  p_children jsonb,
  p_assignments jsonb,
  p_keep_in_source boolean DEFAULT false,
  p_group_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_source public.campaign_organising_units;
  v_children jsonb := oux_internal.structure__json_array(p_children, 'p_children');
  v_assign jsonb := oux_internal.structure__json_array(p_assignments, 'p_assignments');
  v_merged jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_bad_key text;
  v_type text;
  v_kind text;
  v_defaults jsonb;
  v_res jsonb;
  v_child_ids integer[];
  v_child_id integer;
  v_child public.campaign_organising_units;
  v_worker integer;
  v_src_id integer;
  v_src_primary boolean;
  v_lost boolean;
  v_count integer;
  v_conflict_ou integer;
  v_moved integer := 0;
  v_copied integer := 0;
  v_kept integer := 0;
  v_displaced integer := 0;
  v_keep boolean := coalesce(p_keep_in_source, false);
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_source := oux_internal.structure__unit(p_campaign_id, p_source_ou_id);

  IF p_group_id IS NOT NULL THEN
    IF (oux_internal.structure__group(p_campaign_id, p_group_id)).kind <> 'custom' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('p_group_id %s is not a custom group; fixed-kind children derive their group from ou_type (C-g)', p_group_id);
    END IF;
  END IF;

  IF jsonb_array_length(v_children) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_children must contain at least one child';
  END IF;

  -- Defaults: today's nested shape (parent_ou_id = source, unit_basis
  -- {"parent_ou_id": source}, ou_type = source's). An explicit null in the
  -- element (e.g. "parent_ou_id": null) overrides the default. p_group_id pins
  -- only custom-kind children.
  v_defaults := jsonb_build_object(
    'ou_type', v_source.ou_type,
    'parent_ou_id', v_source.ou_id,
    'unit_basis', jsonb_build_object('parent_ou_id', v_source.ou_id)
  );
  FOR v_idx IN 0 .. jsonb_array_length(v_children) - 1 LOOP
    v_ctx := format('p_children[%s]', v_idx);
    v_elem := v_children -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    IF p_group_id IS NOT NULL AND NOT (v_elem ? 'group_id') THEN
      v_type := coalesce(oux_internal.structure__json_text(v_elem, 'ou_type', v_ctx), v_source.ou_type);
      SELECT k.kind INTO v_kind FROM public.campaign_group_kind_for_ou_type(v_type) AS k;
      IF v_kind = 'custom' THEN
        v_elem := v_elem || jsonb_build_object('group_id', p_group_id);
      END IF;
    END IF;
    v_merged := v_merged || v_elem;
  END LOOP;

  v_res := oux_internal.structure__create_units(p_campaign_id, v_merged, v_defaults);
  SELECT array_agg((u ->> 'ou_id')::integer) INTO v_child_ids
  FROM jsonb_array_elements(v_res -> 'units') AS u;

  FOR v_idx IN 0 .. jsonb_array_length(v_assign) - 1 LOOP
    v_ctx := format('p_assignments[%s]', v_idx);
    v_elem := v_assign -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_elem) AS k
    WHERE k NOT IN ('child_ref', 'worker_id')
    LIMIT 1;
    IF v_bad_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown key "%s"', v_ctx, v_bad_key);
    END IF;

    -- child_ref: client_ref (string) or ou_id (integer) of a child created here.
    IF jsonb_typeof(v_elem -> 'child_ref') = 'string' THEN
      SELECT (u ->> 'ou_id')::integer INTO v_child_id
      FROM jsonb_array_elements(v_res -> 'units') AS u
      WHERE u ->> 'client_ref' = v_elem ->> 'child_ref';
    ELSE
      v_child_id := oux_internal.structure__json_int(v_elem, 'child_ref', v_ctx);
      IF v_child_id IS NOT NULL AND NOT (v_child_id = ANY (v_child_ids)) THEN
        v_child_id := NULL;
      END IF;
    END IF;
    IF v_child_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: child_ref does not name a child created by this call', v_ctx);
    END IF;
    v_child := oux_internal.structure__unit(p_campaign_id, v_child_id);
    IF v_child.group_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('%s: child %s is a group container without a group and cannot hold placements', v_ctx, v_child_id);
    END IF;

    v_worker := oux_internal.structure__json_int(v_elem, 'worker_id', v_ctx);
    IF v_worker IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "worker_id" is required', v_ctx);
    END IF;

    SELECT p.id, p.is_primary INTO v_src_id, v_src_primary
    FROM public.campaign_worker_ou AS p
    WHERE p.ou_id = v_source.ou_id
      AND p.worker_id = v_worker;
    IF NOT FOUND THEN
      v_src_id := NULL;
      v_src_primary := false;
      -- A worker without a source placement receives a new one: membership required.
      PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[v_worker], true);
    END IF;

    -- A worker already given to another child of this call in the same group
    -- is a duplicate-in-group (C-a): refuse rather than silently keep the last.
    SELECT p.ou_id INTO v_conflict_ou
    FROM public.campaign_worker_ou AS p
    WHERE p.worker_id = v_worker
      AND p.group_id = v_child.group_id
      AND p.ou_id = ANY (v_child_ids)
    LIMIT 1;
    IF v_conflict_ou IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        CONSTRAINT = 'campaign_worker_ou_one_unit_per_group',
        TABLE = 'campaign_worker_ou',
        SCHEMA = 'public',
        MESSAGE = 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
        DETAIL = format('Key (worker_id, group_id)=(%s, %s) already exists. %s: worker %s was already assigned to child %s of the same group.', v_worker, v_child.group_id, v_ctx, v_worker, v_conflict_ou),
        HINT = 'A worker is in at most one unit per group (wp2.2.md §3.4 C-a).';
    END IF;

    IF v_child.group_id = v_source.group_id THEN
      -- C-k: siblings partition the group; the source placement MOVES.
      -- p_keep_in_source is ignored and reported through "displaced".
      SELECT coalesce(bool_or(p.is_primary), false) INTO v_lost
      FROM public.campaign_worker_ou AS p
      WHERE p.worker_id = v_worker
        AND p.group_id = v_child.group_id
        AND p.id IS DISTINCT FROM v_src_id;
      DELETE FROM public.campaign_worker_ou AS p
      WHERE p.worker_id = v_worker
        AND p.group_id = v_child.group_id
        AND p.id IS DISTINCT FROM v_src_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_displaced := v_displaced + v_count;

      IF v_src_id IS NOT NULL THEN
        UPDATE public.campaign_worker_ou AS p SET ou_id = v_child.ou_id WHERE p.id = v_src_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = format('%s: placement %s could not be moved to child %s', v_ctx, v_src_id, v_child.ou_id);
        END IF;
        v_moved := v_moved + 1;
        IF v_keep THEN
          v_displaced := v_displaced + 1;
        END IF;
        IF v_lost AND NOT v_src_primary THEN
          PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_child.ou_id);
        END IF;
      ELSE
        INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
        VALUES (v_child.ou_id, v_worker, false, 'manual');
        v_copied := v_copied + 1;
        IF v_lost THEN
          PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_child.ou_id);
        END IF;
      END IF;
    ELSE
      -- Cross-group child: the worker must not already be elsewhere in that group.
      SELECT p.ou_id INTO v_conflict_ou
      FROM public.campaign_worker_ou AS p
      WHERE p.worker_id = v_worker
        AND p.group_id = v_child.group_id
      LIMIT 1;
      IF v_conflict_ou IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          CONSTRAINT = 'campaign_worker_ou_one_unit_per_group',
          TABLE = 'campaign_worker_ou',
          SCHEMA = 'public',
          MESSAGE = 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
          DETAIL = format('Key (worker_id, group_id)=(%s, %s) already exists. %s: worker %s is already on organising unit %s in that group.', v_worker, v_child.group_id, v_ctx, v_worker, v_conflict_ou),
          HINT = 'A worker is in at most one unit per group (wp2.2.md §3.4 C-a).';
      END IF;

      IF v_src_id IS NOT NULL AND NOT v_keep THEN
        UPDATE public.campaign_worker_ou AS p SET ou_id = v_child.ou_id WHERE p.id = v_src_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = format('%s: placement %s could not be moved to child %s', v_ctx, v_src_id, v_child.ou_id);
        END IF;
        v_moved := v_moved + 1;
      ELSE
        INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
        VALUES (v_child.ou_id, v_worker, false, 'manual');
        v_copied := v_copied + 1;
        IF v_src_id IS NOT NULL THEN
          v_kept := v_kept + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'children', v_res -> 'units',
    'moved', v_moved,
    'copied', v_copied,
    'kept', v_kept,
    'displaced', v_displaced
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_unit_split(integer, integer, jsonb, jsonb, boolean, integer) IS
  'WP2.2 structure API (wp2.2.md §3.3, rule C-k): create sibling children (element shape of structure_units_create; defaults ou_type/parent/unit_basis from the source) and place workers [{child_ref, worker_id}]. Same-group child: the source placement moves (p_keep_in_source ignored, counted in displaced); cross-group child: a new placement, source kept (kept) or moved (moved). Returns {children:[{client_ref, ou_id, group_id}], moved, copied, kept, displaced}. The legacy split_campaign_organising_unit stays in place, uncalled.';

CREATE FUNCTION public.structure_units_bulk_save(
  p_campaign_id integer,
  p_delete_ou_ids integer[],
  p_updates jsonb,
  p_creates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_del integer[];
  v_ordered integer[];
  v_id integer;
  v_unit public.campaign_organising_units;
  v_res jsonb;
  v_deleted integer[] := '{}';
  v_removed integer := 0;
  v_updates jsonb := oux_internal.structure__json_array(p_updates, 'p_updates');
  v_creates jsonb := oux_internal.structure__json_array(p_creates, 'p_creates');
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_updated integer[] := '{}';
  v_created jsonb := '[]'::jsonb;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  SELECT coalesce(array_agg(DISTINCT x), '{}'::integer[]) INTO v_del
  FROM unnest(coalesce(p_delete_ou_ids, '{}'::integer[])) AS x
  WHERE x IS NOT NULL;

  IF cardinality(v_del) > 0 THEN
    FOREACH v_id IN ARRAY v_del LOOP
      PERFORM oux_internal.structure__unit(p_campaign_id, v_id);
    END LOOP;

    -- Deepest first: a unit whose parent (or grandparent) is also being
    -- deleted goes before that parent, so no delete has to detach a sibling
    -- that is itself about to go.
    SELECT array_agg(u.ou_id ORDER BY
      (CASE WHEN u.parent_ou_id = ANY (v_del) THEN 1 ELSE 0 END)
      + (CASE WHEN gp.parent_ou_id = ANY (v_del) THEN 1 ELSE 0 END) DESC,
      u.ou_id)
      INTO v_ordered
    FROM public.campaign_organising_units AS u
    LEFT JOIN public.campaign_organising_units AS gp ON gp.ou_id = u.parent_ou_id
    WHERE u.ou_id = ANY (v_del);

    FOREACH v_id IN ARRAY v_ordered LOOP
      v_unit := oux_internal.structure__unit(p_campaign_id, v_id);
      v_res := oux_internal.structure__delete_unit(p_campaign_id, v_unit, '[]'::jsonb, false);
      v_deleted := v_deleted || v_id;
      v_removed := v_removed + (v_res ->> 'placements_removed')::integer;
    END LOOP;
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_updates) - 1 LOOP
    v_ctx := format('p_updates[%s]', v_idx);
    v_elem := v_updates -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    v_id := oux_internal.structure__json_int(v_elem, 'ou_id', v_ctx);
    IF v_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "ou_id" is required', v_ctx);
    END IF;
    IF v_id = ANY (v_del) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: organising unit %s is both deleted and updated in this call', v_ctx, v_id);
    END IF;
    v_unit := oux_internal.structure__unit(p_campaign_id, v_id);
    PERFORM oux_internal.structure__update_unit(p_campaign_id, v_unit, v_elem - 'ou_id');
    v_updated := v_updated || v_id;
  END LOOP;

  IF jsonb_array_length(v_creates) > 0 THEN
    v_res := oux_internal.structure__create_units(p_campaign_id, v_creates, NULL);
    v_created := v_res -> 'units';
  END IF;

  RETURN jsonb_build_object(
    'deleted_ou_ids', to_jsonb(v_deleted),
    'updated_ou_ids', to_jsonb(v_updated),
    'created', v_created,
    'placements_removed', v_removed
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_units_bulk_save(integer, integer[], jsonb, jsonb) IS
  'WP2.2 structure API (wp2.2.md §3.3): transactional "save units": deletes (unit-delete logic, no reassignment, children detached, deepest first), then updates [{ou_id, ...patch}], then creates (structure_units_create element shape). Returns {deleted_ou_ids, updated_ou_ids, created:[{client_ref, ou_id, group_id}], placements_removed}.';

-- 4.3 Placements.

CREATE FUNCTION public.structure_placements_assign(
  p_campaign_id integer,
  p_ou_id integer,
  p_worker_ids integer[],
  p_source text DEFAULT 'manual',
  p_is_primary boolean DEFAULT false,
  p_on_conflict text DEFAULT 'skip'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_unit public.campaign_organising_units;
  v_ids integer[];
  v_worker integer;
  v_placed record;
  v_inserted integer := 0;
  v_moved integer := 0;
  v_skipped integer := 0;
  v_displaced integer := 0;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_unit := oux_internal.structure__unit(p_campaign_id, p_ou_id);

  IF p_source IS NULL OR p_source NOT IN ('manual', 'rule', 'universe') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('p_source must be one of manual, rule, universe (got %s)', coalesce(p_source, 'null'));
  END IF;
  IF p_on_conflict IS NULL OR p_on_conflict NOT IN ('skip', 'move', 'error') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('p_on_conflict must be one of skip, move, error (got %s)', coalesce(p_on_conflict, 'null'));
  END IF;
  IF v_unit.group_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('organising unit %s is a group container without a group and cannot hold placements; assign workers to the units inside it', v_unit.ou_id);
  END IF;

  v_ids := oux_internal.structure__worker_ids(p_campaign_id, p_worker_ids, true);

  FOREACH v_worker IN ARRAY v_ids LOOP
    SELECT * INTO v_placed
    FROM oux_internal.structure__place(
      p_campaign_id, v_unit, v_worker, p_source, coalesce(p_is_primary, false), p_on_conflict, NULL
    );
    v_displaced := v_displaced + v_placed.displaced;
    IF v_placed.outcome = 'inserted' THEN v_inserted := v_inserted + 1;
    ELSIF v_placed.outcome = 'moved' THEN v_moved := v_moved + 1;
    ELSE v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'moved', v_moved,
    'skipped', v_skipped,
    'displaced', v_displaced
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_placements_assign(integer, integer, integer[], text, boolean, text) IS
  'WP2.2 structure API (wp2.2.md §3.3, rules C-a/C-e/C-h): batch-assign workers to one unit. Already on the unit → skipped; elsewhere in the unit''s group → p_on_conflict skip | move | error (23505 campaign_worker_ou_one_unit_per_group); otherwise inserted with p_source. p_is_primary makes each placement the worker''s campaign-wide primary. Returns {inserted, moved, skipped, displaced}.';

CREATE FUNCTION public.structure_placements_move(
  p_campaign_id integer,
  p_worker_ids integer[],
  p_from_ou_id integer DEFAULT NULL,
  p_to_ou_id integer DEFAULT NULL,
  p_within_group_id integer DEFAULT NULL,
  p_keep_source boolean DEFAULT false,
  p_keep_in_parent boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_ids integer[];
  v_from public.campaign_organising_units;
  v_to public.campaign_organising_units;
  v_parent public.campaign_organising_units;
  v_parent_placeable boolean := false;
  v_group public.campaign_groups;
  v_worker integer;
  v_tgt_id integer;
  v_tgt_primary boolean;
  v_src_id integer;
  v_src_primary boolean;
  v_lost boolean;
  v_count integer;
  v_placed record;
  v_keep boolean := coalesce(p_keep_source, false);
  v_moved integer := 0;
  v_inserted integer := 0;
  v_displaced integer := 0;
  v_removed integer := 0;
  v_skipped integer := 0;
  v_parent_inserted integer := 0;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  -- Unassign mode (C-d): p_within_group_id → that group's placements only;
  -- otherwise every placement of the workers in the campaign (legacy
  -- toOuId: null). p_from_ou_id is ignored here (use structure_placements_unassign
  -- for one placement). A copy to Unassigned is a no-op.
  IF p_to_ou_id IS NULL THEN
    v_ids := oux_internal.structure__worker_ids(p_campaign_id, p_worker_ids, false);
    IF v_keep OR cardinality(v_ids) = 0 THEN
      RETURN jsonb_build_object(
        'moved', 0, 'inserted', 0, 'displaced', 0, 'removed', 0,
        'skipped', cardinality(v_ids), 'parent_inserted', 0
      );
    END IF;

    IF p_within_group_id IS NOT NULL THEN
      v_group := oux_internal.structure__group(p_campaign_id, p_within_group_id);
      DELETE FROM public.campaign_worker_ou AS p
      WHERE p.worker_id = ANY (v_ids)
        AND p.group_id = v_group.group_id;
    ELSE
      DELETE FROM public.campaign_worker_ou AS p
      USING public.campaign_organising_units AS u
      WHERE u.ou_id = p.ou_id
        AND u.campaign_id = p_campaign_id
        AND p.worker_id = ANY (v_ids);
    END IF;
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    RETURN jsonb_build_object(
      'moved', 0, 'inserted', 0, 'displaced', 0, 'removed', v_removed,
      'skipped', 0, 'parent_inserted', 0
    );
  END IF;

  IF p_within_group_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_within_group_id applies only when p_to_ou_id is null (unassign within one group)';
  END IF;

  v_to := oux_internal.structure__unit(p_campaign_id, p_to_ou_id);
  IF v_to.group_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('organising unit %s is a group container without a group and cannot hold placements; assign workers to the units inside it', v_to.ou_id);
  END IF;
  IF p_from_ou_id IS NOT NULL THEN
    v_from := oux_internal.structure__unit(p_campaign_id, p_from_ou_id);
    IF v_from.ou_id = v_to.ou_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('p_from_ou_id and p_to_ou_id are both %s', v_to.ou_id);
    END IF;
  END IF;

  -- Workers dragged from Unassigned receive a new placement → membership required.
  v_ids := oux_internal.structure__worker_ids(p_campaign_id, p_worker_ids, p_from_ou_id IS NULL);

  -- Legacy keepInParent (§3.11 row 1): a sub-unit target also keeps/creates the
  -- parent placement when the parent can hold one AND is in a different group
  -- (a same-group parent cannot hold the worker alongside the child, C-a).
  IF coalesce(p_keep_in_parent, true) AND v_to.parent_ou_id IS NOT NULL THEN
    v_parent := oux_internal.structure__unit(p_campaign_id, v_to.parent_ou_id);
    v_parent_placeable := v_parent.group_id IS NOT NULL AND v_parent.group_id <> v_to.group_id;
  END IF;

  FOREACH v_worker IN ARRAY v_ids LOOP
    v_tgt_id := NULL;
    v_src_id := NULL;
    v_src_primary := false;

    SELECT p.id, p.is_primary INTO v_tgt_id, v_tgt_primary
    FROM public.campaign_worker_ou AS p
    WHERE p.ou_id = v_to.ou_id AND p.worker_id = v_worker;

    IF v_from.ou_id IS NOT NULL THEN
      SELECT p.id, p.is_primary INTO v_src_id, v_src_primary
      FROM public.campaign_worker_ou AS p
      WHERE p.ou_id = v_from.ou_id AND p.worker_id = v_worker;
    END IF;

    IF v_tgt_id IS NOT NULL THEN
      -- Already on the target (idempotent re-issue): nothing to write except
      -- the legacy removal of the source row on a move.
      v_skipped := v_skipped + 1;
      IF NOT v_keep
         AND v_src_id IS NOT NULL
         AND NOT (v_parent_placeable AND v_from.ou_id = v_parent.ou_id)
      THEN
        IF v_src_primary AND NOT v_tgt_primary THEN
          PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_to.ou_id);
        END IF;
        DELETE FROM public.campaign_worker_ou AS p WHERE p.id = v_src_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_removed := v_removed + v_count;
      END IF;
    ELSE
      IF v_from.ou_id IS NOT NULL AND v_src_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = format('worker %s has no placement on organising unit %s', v_worker, v_from.ou_id);
      END IF;

      IF v_keep THEN
        -- Copy (C-c, K1): allowed only across groups; a same-group copy is a
        -- duplicate-in-group and raises 23505.
        SELECT * INTO v_placed
        FROM oux_internal.structure__place(p_campaign_id, v_to, v_worker, 'manual', false, 'error', NULL);
        v_inserted := v_inserted + 1;
      ELSIF v_parent_placeable AND v_src_id IS NOT NULL AND v_from.ou_id = v_parent.ou_id THEN
        -- Source is the target's parent (Employer container → one of its
        -- worksites, D4): the parent row is kept, and the drop still performs
        -- the C-b displacement in the target's group before inserting
        -- (fix round 1, finding 5). The parent row is in another group, so it
        -- is never among the displaced rows.
        SELECT coalesce(bool_or(p.is_primary), false) INTO v_lost
        FROM public.campaign_worker_ou AS p
        WHERE p.worker_id = v_worker
          AND p.group_id = v_to.group_id;
        DELETE FROM public.campaign_worker_ou AS p
        WHERE p.worker_id = v_worker
          AND p.group_id = v_to.group_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_displaced := v_displaced + v_count;

        INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
        VALUES (v_to.ou_id, v_worker, false, 'manual');
        v_inserted := v_inserted + 1;
        IF v_lost THEN
          PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_to.ou_id);
        END IF;
      ELSE
        -- Move (C-b): displace whatever the worker holds in the target's group
        -- other than the source row, then re-point the source row (C-l) or
        -- insert when there is none (drag from Unassigned).
        SELECT coalesce(bool_or(p.is_primary), false) INTO v_lost
        FROM public.campaign_worker_ou AS p
        WHERE p.worker_id = v_worker
          AND p.group_id = v_to.group_id
          AND p.id IS DISTINCT FROM v_src_id;
        DELETE FROM public.campaign_worker_ou AS p
        WHERE p.worker_id = v_worker
          AND p.group_id = v_to.group_id
          AND p.id IS DISTINCT FROM v_src_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_displaced := v_displaced + v_count;

        IF v_src_id IS NOT NULL THEN
          UPDATE public.campaign_worker_ou AS p SET ou_id = v_to.ou_id WHERE p.id = v_src_id;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          IF v_count <> 1 THEN
            RAISE EXCEPTION USING
              ERRCODE = 'P0002',
              MESSAGE = format('placement %s of worker %s could not be moved to organising unit %s', v_src_id, v_worker, v_to.ou_id);
          END IF;
          v_moved := v_moved + 1;
          IF v_lost AND NOT v_src_primary THEN
            PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_to.ou_id);
          END IF;
        ELSE
          INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
          VALUES (v_to.ou_id, v_worker, false, 'manual');
          v_inserted := v_inserted + 1;
          IF v_lost THEN
            PERFORM oux_internal.structure__set_primary(p_campaign_id, v_worker, v_to.ou_id);
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_parent_placeable THEN
      SELECT * INTO v_placed
      FROM oux_internal.structure__place(p_campaign_id, v_parent, v_worker, 'manual', false, 'skip', NULL);
      IF v_placed.outcome = 'inserted' THEN
        v_parent_inserted := v_parent_inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'moved', v_moved,
    'inserted', v_inserted,
    'displaced', v_displaced,
    'removed', v_removed,
    'skipped', v_skipped,
    'parent_inserted', v_parent_inserted
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_placements_move(integer, integer[], integer, integer, integer, boolean, boolean) IS
  'WP2.2 structure API (wp2.2.md §3.3, rules C-b/C-c/C-d/C-h/C-l): the wall-chart move. p_to_ou_id null → unassign (p_within_group_id: that group only; else all campaign placements). With a target: the worker''s other placements in the target''s group are displaced, then the source row is re-pointed (or a manual row inserted from Unassigned); p_keep_source copies across groups only (same-group → 23505, K1). p_keep_in_parent (default true, deviation D4) keeps/creates the parent placement for sub-unit targets when the parent has a group of its own. Re-issuing a completed move is a no-op (skipped). Returns {moved, inserted, displaced, removed, skipped, parent_inserted}.';


CREATE FUNCTION public.structure_placements_unassign(
  p_campaign_id integer,
  p_worker_ids integer[],
  p_ou_id integer DEFAULT NULL,
  p_within_group_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_ids integer[];
  v_unit public.campaign_organising_units;
  v_group public.campaign_groups;
  v_removed integer := 0;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  IF p_ou_id IS NOT NULL AND p_within_group_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'give p_ou_id or p_within_group_id, not both';
  END IF;

  v_ids := oux_internal.structure__worker_ids(p_campaign_id, p_worker_ids, false);
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;

  IF p_ou_id IS NOT NULL THEN
    v_unit := oux_internal.structure__unit(p_campaign_id, p_ou_id);
    DELETE FROM public.campaign_worker_ou AS p
    WHERE p.ou_id = v_unit.ou_id
      AND p.worker_id = ANY (v_ids);
  ELSIF p_within_group_id IS NOT NULL THEN
    v_group := oux_internal.structure__group(p_campaign_id, p_within_group_id);
    DELETE FROM public.campaign_worker_ou AS p
    WHERE p.group_id = v_group.group_id
      AND p.worker_id = ANY (v_ids);
  ELSE
    DELETE FROM public.campaign_worker_ou AS p
    USING public.campaign_organising_units AS u
    WHERE u.ou_id = p.ou_id
      AND u.campaign_id = p_campaign_id
      AND p.worker_id = ANY (v_ids);
  END IF;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RETURN jsonb_build_object('removed', v_removed);
END;
$function$;

COMMENT ON FUNCTION public.structure_placements_unassign(integer, integer[], integer, integer) IS
  'WP2.2 structure API (wp2.2.md §3.3, rule C-d): remove placements. p_ou_id → that one placement per worker; p_within_group_id → that group''s placement; neither → every placement of the workers in the campaign. Idempotent (removed may be 0; the permission pre-check rules out an RLS-silent no-op). Returns {removed}.';

CREATE FUNCTION public.structure_placements_set_primary(
  p_campaign_id integer,
  p_worker_id integer,
  p_ou_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_unit public.campaign_organising_units;
  v_placement_id integer;
  v_cleared integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);
  v_unit := oux_internal.structure__unit(p_campaign_id, p_ou_id);
  PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[p_worker_id], false);

  SELECT p.id INTO v_placement_id
  FROM public.campaign_worker_ou AS p
  WHERE p.ou_id = v_unit.ou_id
    AND p.worker_id = p_worker_id;
  IF v_placement_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format('worker %s has no placement on organising unit %s', p_worker_id, p_ou_id);
  END IF;

  v_cleared := oux_internal.structure__set_primary(p_campaign_id, p_worker_id, v_unit.ou_id);

  RETURN jsonb_build_object('placement_id', v_placement_id, 'cleared', v_cleared);
END;
$function$;

COMMENT ON FUNCTION public.structure_placements_set_primary(integer, integer, integer) IS
  'WP2.2 structure API (wp2.2.md §3.3, rule C-h): clears the worker''s other is_primary rows in the campaign and sets this placement primary. Returns {placement_id, cleared}.';

CREATE FUNCTION public.structure_placements_replace_rule_rows(
  p_campaign_id integer,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_rows jsonb := oux_internal.structure__json_array(p_rows, 'p_rows');
  v_elem jsonb;
  v_idx integer;
  v_ctx text;
  v_bad_key text;
  v_ou_id integer;
  v_worker integer;
  v_rule integer;
  v_unit public.campaign_organising_units;
  v_placed record;
  v_removed integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  -- R1: Recompute withdraws only rule rows; manual and universe rows survive.
  DELETE FROM public.campaign_worker_ou AS p
  USING public.campaign_organising_units AS u
  WHERE u.ou_id = p.ou_id
    AND u.campaign_id = p_campaign_id
    AND p.assignment_source = 'rule';
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  FOR v_idx IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
    v_ctx := format('p_rows[%s]', v_idx);
    v_elem := v_rows -> v_idx;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s must be a JSON object', v_ctx);
    END IF;
    SELECT k INTO v_bad_key
    FROM jsonb_object_keys(v_elem) AS k
    WHERE k NOT IN ('ou_id', 'worker_id', 'assigned_rule_id')
    LIMIT 1;
    IF v_bad_key IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: unknown key "%s"', v_ctx, v_bad_key);
    END IF;

    v_ou_id := oux_internal.structure__json_int(v_elem, 'ou_id', v_ctx);
    v_worker := oux_internal.structure__json_int(v_elem, 'worker_id', v_ctx);
    v_rule := oux_internal.structure__json_int(v_elem, 'assigned_rule_id', v_ctx);
    IF v_ou_id IS NULL OR v_worker IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: "ou_id" and "worker_id" are required', v_ctx);
    END IF;

    v_unit := oux_internal.structure__unit(p_campaign_id, v_ou_id);
    IF v_unit.is_group_container THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: rule rows cannot target the group container %s', v_ctx, v_ou_id);
    END IF;
    PERFORM oux_internal.structure__worker_ids(p_campaign_id, ARRAY[v_worker], true);
    IF v_rule IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.campaign_unit_rules AS r
         WHERE r.rule_id = v_rule
           AND r.campaign_id = p_campaign_id
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('%s: rule %s does not belong to campaign %s', v_ctx, v_rule, p_campaign_id);
    END IF;

    SELECT * INTO v_placed
    FROM oux_internal.structure__place(p_campaign_id, v_unit, v_worker, 'rule', false, 'skip', v_rule);
    IF v_placed.outcome = 'inserted' THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('removed', v_removed, 'inserted', v_inserted, 'skipped', v_skipped);
END;
$function$;

COMMENT ON FUNCTION public.structure_placements_replace_rule_rows(integer, jsonb) IS
  'WP2.2 structure API (wp2.2.md §3.3, §3.8 R1): Recompute''s single writer. Deletes the campaign''s assignment_source = rule rows, then inserts p_rows [{ou_id, worker_id, assigned_rule_id?}] as rule rows with skip semantics against existing manual/universe placements in the same group. Returns {removed, inserted, skipped}.';

-- ---------------------------------------------------------------------------
-- 5. M2 (wp2.2.md §3.7): Employer placements for members of worksite children.
--    For each container c (is_group_container AND group_id IS NOT NULL) and each
--    worker w with a placement on a non-container child u (u.ou_group_id = c.ou_id)
--    whose group differs from c's, insert one row on c (is_primary false,
--    assignment_source 'universe') unless w already has a placement in c.group_id.
--    At most one such row per worker per campaign: when a worker's children span
--    several containers, the container of the worker's primary placement is
--    chosen, else the lowest c.ou_id; multi_container_workers reports how many
--    workers needed that tie-break (expected 0 after 03b; the 10_ script stops
--    when it is not). Idempotent.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.structure_materialise_employer_placements(p_campaign_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, oux_internal
AS $function$
DECLARE
  v_containers integer;
  v_multi integer;
  v_skipped integer;
  v_inserted integer;
BEGIN
  PERFORM oux_internal.structure__assert_can_write(p_campaign_id);

  SELECT count(DISTINCT c.ou_id) INTO v_containers
  FROM public.campaign_organising_units AS c
  JOIN public.campaign_organising_units AS u ON u.ou_group_id = c.ou_id
  WHERE c.campaign_id = p_campaign_id
    AND c.is_group_container
    AND c.group_id IS NOT NULL
    AND NOT u.is_group_container
    AND u.group_id IS DISTINCT FROM c.group_id;

  -- One statement: plan, insert, count. No temp table, so the function can be
  -- called once per campaign inside a single operator transaction.
  WITH containers AS (
    SELECT c.ou_id, c.group_id
    FROM public.campaign_organising_units AS c
    WHERE c.campaign_id = p_campaign_id
      AND c.is_group_container
      AND c.group_id IS NOT NULL
  ),
  children AS (
    SELECT u.ou_id AS child_ou_id, c.ou_id AS container_ou_id, c.group_id AS container_group_id
    FROM public.campaign_organising_units AS u
    JOIN containers AS c ON c.ou_id = u.ou_group_id
    WHERE u.campaign_id = p_campaign_id
      AND NOT u.is_group_container
      AND u.group_id IS DISTINCT FROM c.group_id
  ),
  member_rows AS (
    SELECT p.worker_id, ch.container_ou_id, ch.container_group_id, p.is_primary
    FROM public.campaign_worker_ou AS p
    JOIN children AS ch ON ch.child_ou_id = p.ou_id
  ),
  plan AS (
    SELECT
      m.worker_id,
      m.container_group_id,
      count(DISTINCT m.container_ou_id) AS container_count,
      (array_agg(m.container_ou_id ORDER BY m.is_primary DESC, m.container_ou_id))[1] AS chosen_ou_id,
      EXISTS (
        SELECT 1 FROM public.campaign_worker_ou AS x
        WHERE x.worker_id = m.worker_id
          AND x.group_id = m.container_group_id
      ) AS already_placed
    FROM member_rows AS m
    GROUP BY m.worker_id, m.container_group_id
  ),
  ins AS (
    INSERT INTO public.campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
    SELECT pl.chosen_ou_id, pl.worker_id, false, 'universe'
    FROM plan AS pl
    WHERE NOT pl.already_placed
    ORDER BY pl.worker_id
    RETURNING worker_id
  )
  SELECT
    (SELECT count(*) FROM ins),
    (SELECT count(*) FROM plan AS pl WHERE pl.already_placed),
    (SELECT count(*) FROM plan AS pl WHERE pl.container_count > 1)
    INTO v_inserted, v_skipped, v_multi;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_existing', v_skipped,
    'containers', v_containers,
    'multi_container_workers', v_multi
  );
END;
$function$;

COMMENT ON FUNCTION public.structure_materialise_employer_placements(integer) IS
  'WP2.2 structure API (wp2.2.md §3.7, decision M2-a): inserts one universe-source placement on the Employer-group container for every worker placed on one of its worksite children who has no placement in that group yet. Idempotent. Returns {inserted, skipped_existing, containers, multi_container_workers}.';

-- ---------------------------------------------------------------------------
-- 6. Ownership and grants (wp2.2.md §3.2). Functions are created with EXECUTE
--    to PUBLIC by default, and the project's default privileges in public also
--    grant anon; both are revoked explicitly.
-- ---------------------------------------------------------------------------

DO $grants$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public' AND p.proname LIKE 'structure\_%')
       OR n.nspname = 'oux_internal'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END;
$grants$;

-- ---------------------------------------------------------------------------
-- 7. Post-assertions
-- ---------------------------------------------------------------------------

DO $postconditions$
DECLARE
  v_sig text;
  v_missing text[] := '{}';
  v_expected text[] := ARRAY[
    'public.structure_group_create(integer,text,text,integer)',
    'public.structure_group_update(integer,integer,text,integer)',
    'public.structure_group_reorder(integer,integer[])',
    'public.structure_group_delete(integer,integer,text)',
    'public.structure_units_create(integer,jsonb,jsonb)',
    'public.structure_unit_update(integer,integer,jsonb)',
    'public.structure_unit_reorder(integer,integer[])',
    'public.structure_unit_delete(integer,integer,jsonb,boolean)',
    'public.structure_unit_merge(integer,integer,integer[])',
    'public.structure_unit_split(integer,integer,jsonb,jsonb,boolean,integer)',
    'public.structure_units_bulk_save(integer,integer[],jsonb,jsonb)',
    'public.structure_placements_assign(integer,integer,integer[],text,boolean,text)',
    'public.structure_placements_move(integer,integer[],integer,integer,integer,boolean,boolean)',
    'public.structure_placements_unassign(integer,integer[],integer,integer)',
    'public.structure_placements_set_primary(integer,integer,integer)',
    'public.structure_placements_replace_rule_rows(integer,jsonb)',
    'public.structure_materialise_employer_placements(integer)',
    'oux_internal.structure__assert_can_write(integer)',
    'oux_internal.structure__unit(integer,integer)',
    'oux_internal.structure__group(integer,integer)',
    'oux_internal.structure__worker_ids(integer,integer[],boolean)',
    'oux_internal.structure__set_primary(integer,integer,integer)',
    'oux_internal.structure__place(integer,public.campaign_organising_units,integer,text,boolean,text,integer)',
    'oux_internal.structure__json_int(jsonb,text,text)',
    'oux_internal.structure__json_bool(jsonb,text,text)',
    'oux_internal.structure__json_text(jsonb,text,text)',
    'oux_internal.structure__json_object(jsonb,text,text)',
    'oux_internal.structure__json_array(jsonb,text)',
    'oux_internal.structure__create_units(integer,jsonb,jsonb)',
    'oux_internal.structure__update_unit(integer,public.campaign_organising_units,jsonb)',
    'oux_internal.structure__delete_unit(integer,public.campaign_organising_units,jsonb,boolean)'
  ];
  v_prosrc text;
  v_def text;
  v_count integer;
BEGIN
  FOREACH v_sig IN ARRAY v_expected LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_missing := v_missing || v_sig;
    END IF;
  END LOOP;
  IF cardinality(v_missing) <> 0 THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: missing functions %', v_missing;
  END IF;

  -- Every structure function: SECURITY INVOKER, search_path set, no anon /
  -- PUBLIC EXECUTE, authenticated and service_role EXECUTE.
  SELECT count(*) INTO v_count
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE ((n.nspname = 'public' AND p.proname LIKE 'structure\_%') OR n.nspname = 'oux_internal')
    AND (
      p.prosecdef
      OR p.proconfig IS NULL
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%')
      OR has_function_privilege('anon', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      OR pg_get_userbyid(p.proowner) <> 'postgres'
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: % structure functions have the wrong security/search_path/grant/owner shape', v_count;
  END IF;

  -- PUBLIC must not hold EXECUTE (proacl would contain an entry with an empty grantee).
  SELECT count(*) INTO v_count
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE ((n.nspname = 'public' AND p.proname LIKE 'structure\_%') OR n.nspname = 'oux_internal')
    AND EXISTS (
      SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: % structure functions are executable by PUBLIC', v_count;
  END IF;

  -- No internal helper lives in public; anon cannot use the private schema.
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_\_%'
  ) THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: a structure__ helper exists in public';
  END IF;
  IF has_schema_privilege('anon', 'oux_internal', 'USAGE')
     OR NOT has_schema_privilege('authenticated', 'oux_internal', 'USAGE')
     OR NOT has_schema_privilege('service_role', 'oux_internal', 'USAGE')
  THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: oux_internal schema USAGE boundary is incorrect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM aclexplode(coalesce((SELECT nspacl FROM pg_namespace WHERE nspname = 'oux_internal'), '{}'::aclitem[])) AS a
    WHERE a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: PUBLIC has privileges on oux_internal';
  END IF;

  -- The relaxed container trigger function.
  SELECT p.prosrc INTO v_prosrc
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'check_no_worker_on_group_container';
  IF v_prosrc IS NULL OR position('group_id IS NULL' IN v_prosrc) = 0 THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: check_no_worker_on_group_container() was not relaxed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.campaign_worker_ou'::regclass
      AND t.tgname = 'trg_check_no_worker_on_group_container'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: trg_check_no_worker_on_group_container is missing or disabled';
  END IF;

  -- The widened, validated CHECK.
  SELECT pg_get_constraintdef(c.oid), (c.convalidated)::integer
    INTO v_def, v_count
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.campaign_worker_ou'::regclass
    AND c.conname = 'campaign_worker_ou_assignment_source_check';
  IF v_def IS NULL
     OR position('universe' IN v_def) = 0
     OR position('manual' IN v_def) = 0
     OR position('rule' IN v_def) = 0
     OR v_count <> 1
  THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: assignment_source CHECK is not (manual, rule, universe) and validated: %', coalesce(v_def, 'missing');
  END IF;

  -- The D10(b) bypass path admits a JWT-less session only when its role
  -- bypasses RLS; the API roles must never qualify (fix round 1, 8f).
  SELECT count(*) FILTER (WHERE NOT r.rolsuper AND NOT r.rolbypassrls) INTO v_count
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: expected exactly the two API roles anon and authenticated, both non-superuser and non-bypassrls (found %)', v_count;
  END IF;

  -- Additive: WP2.2b objects must not exist yet; no rows changed.
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP2.2a postcondition failed: WP2.2b objects already exist';
  END IF;

  RAISE NOTICE 'WP2.2a applied: % public structure RPCs, % internal helpers',
    (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%'),
    (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'oux_internal');
END;
$postconditions$;
