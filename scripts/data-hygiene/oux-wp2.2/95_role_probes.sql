-- WP2.2 grant and RLS probes for the structure API. Clone/dev only. Every data
-- change is rolled back. Selects probe users by role and never prints names,
-- emails or contact data. New file (deviation D2, wp2.2.md §8.3) rather than an
-- edit of the rehearsed oux-wp2.1/95_role_probes.sql.
--
-- Probes:
--   1. catalog: no structure__ helper in public; anon has no EXECUTE on any
--      structure_* RPC or oux_internal helper and no USAGE on oux_internal;
--      authenticated/service_role have EXECUTE on every one plus USAGE, and
--      authenticated holds nothing else on oux_internal (no CREATE, no relations);
--      anon and authenticated are neither superuser nor bypassrls (D10b).
--   2. anon (SET LOCAL ROLE): calling a public RPC and a helper both fail with
--      insufficient_privilege.
--   3. authenticated on a campaign it created: every public RPC executes
--      (any failure is not insufficient_privilege — a missing grant would be).
--   4. authenticated on a campaign it cannot write to: 42501 from the pre-check.

BEGIN;

DO $fixtures$
DECLARE
  v_user uuid;
  v_worker integer;
BEGIN
  SELECT user_id INTO v_user
  FROM public.user_profiles
  WHERE role = 'user'
  ORDER BY user_id
  LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '95 role probes require at least one user-role profile';
  END IF;

  SELECT worker_id INTO v_worker
  FROM public.workers
  ORDER BY worker_id
  LIMIT 1;
  IF v_worker IS NULL THEN
    RAISE EXCEPTION '95 role probes require at least one worker row';
  END IF;

  PERFORM set_config('wp22.probe_uid', v_user::text, true);
  PERFORM set_config('wp22.worker_id', v_worker::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );
END;
$fixtures$;

-- 1. Catalog probes (as the submitting role).
DO $catalog$
DECLARE
  v_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_\_%'
  ) THEN
    RAISE EXCEPTION 'FAIL a structure__ helper exists in public';
  END IF;
  RAISE NOTICE 'PASS no structure__ helper in public';

  SELECT count(*) INTO v_count
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%';
  IF v_count <> 17 THEN
    RAISE EXCEPTION 'FAIL expected 17 public structure_* RPCs, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE ((n.nspname = 'public' AND p.proname LIKE 'structure\_%') OR n.nspname = 'oux_internal')
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a WHERE a.grantee = 0
      )
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL % structure functions have an incorrect EXECUTE boundary', v_count;
  END IF;
  RAISE NOTICE 'PASS anon/PUBLIC cannot execute any structure function; authenticated and service_role can';

  IF has_schema_privilege('anon', 'oux_internal', 'USAGE')
     OR has_schema_privilege('anon', 'oux_internal', 'CREATE')
     OR has_schema_privilege('authenticated', 'oux_internal', 'CREATE')
     OR NOT has_schema_privilege('authenticated', 'oux_internal', 'USAGE')
     OR NOT has_schema_privilege('service_role', 'oux_internal', 'USAGE')
  THEN
    RAISE EXCEPTION 'FAIL oux_internal schema privilege boundary is incorrect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'oux_internal'
  ) THEN
    RAISE EXCEPTION 'FAIL oux_internal contains relations (only functions are expected)';
  END IF;
  RAISE NOTICE 'PASS authenticated holds only USAGE + EXECUTE on oux_internal';

  -- The pre-check's JWT-less bypass (D10b) admits only rolsuper/rolbypassrls
  -- sessions; the API roles must never be either (fix round 1, 8f).
  SELECT count(*) FILTER (WHERE NOT r.rolsuper AND NOT r.rolbypassrls) INTO v_count
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL expected both anon and authenticated to exist as non-superuser, non-bypassrls roles (found %)', v_count;
  END IF;
  RAISE NOTICE 'PASS anon and authenticated are neither superuser nor bypassrls';
END;
$catalog$;

-- 2. anon.
SET LOCAL ROLE anon;

DO $anon_probe$
BEGIN
  BEGIN
    PERFORM public.structure_placements_unassign(1, ARRAY[1]::integer[]);
    RAISE EXCEPTION 'FAIL anon executed a structure RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot execute a public structure RPC';
  END;

  BEGIN
    PERFORM oux_internal.structure__assert_can_write(1);
    RAISE EXCEPTION 'FAIL anon executed an oux_internal helper';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot execute an oux_internal helper';
  END;
END;
$anon_probe$;

RESET ROLE;
SET LOCAL ROLE authenticated;

-- 3. authenticated on its own campaign: every public RPC is executable.
DO $owner_probe$
DECLARE
  v_worker integer := current_setting('wp22.worker_id', true)::integer;
  v_campaign integer;
  v_group integer;
  v_ou integer;
  v_ou2 integer;
  v_child integer;
  v_res jsonb;
  v_foreign integer;
BEGIN
  INSERT INTO public.campaigns (name, campaign_type, status)
  VALUES ('wp22 role probe (rolled back)', 'organising', 'planning')
  RETURNING campaign_id INTO v_campaign;

  INSERT INTO public.campaign_worker_membership (campaign_id, worker_id)
  VALUES (v_campaign, v_worker);

  BEGIN
    v_res := public.structure_group_create(v_campaign, 'custom', 'wp22 probe group');
    v_group := (v_res ->> 'group_id')::integer;
    PERFORM public.structure_group_update(v_campaign, v_group, 'wp22 probe group renamed');
    PERFORM public.structure_group_reorder(v_campaign, ARRAY[v_group]);

    v_res := public.structure_units_create(
      v_campaign,
      '[{"client_ref":"a","name":"wp22 probe unit a","ou_type":"worksite"},
        {"client_ref":"b","name":"wp22 probe unit b","ou_type":"worksite"}]'::jsonb,
      '[]'::jsonb
    );
    v_ou := (v_res -> 'units' -> 0 ->> 'ou_id')::integer;
    v_ou2 := (v_res -> 'units' -> 1 ->> 'ou_id')::integer;
    PERFORM public.structure_unit_update(v_campaign, v_ou, '{"display_order": 7}'::jsonb);
    PERFORM public.structure_unit_reorder(v_campaign, ARRAY[v_ou2, v_ou]);

    PERFORM public.structure_placements_assign(v_campaign, v_ou, ARRAY[v_worker]);
    PERFORM public.structure_placements_set_primary(v_campaign, v_worker, v_ou);
    PERFORM public.structure_placements_move(v_campaign, ARRAY[v_worker], v_ou, v_ou2);
    PERFORM public.structure_placements_unassign(v_campaign, ARRAY[v_worker], v_ou2);
    PERFORM public.structure_placements_replace_rule_rows(v_campaign, '[]'::jsonb);

    v_res := public.structure_unit_split(
      v_campaign, v_ou,
      '[{"client_ref":"k","name":"wp22 probe child"}]'::jsonb,
      '[]'::jsonb
    );
    v_child := (v_res -> 'children' -> 0 ->> 'ou_id')::integer;
    PERFORM public.structure_unit_merge(v_campaign, v_ou, ARRAY[v_child]);
    PERFORM public.structure_units_bulk_save(v_campaign, ARRAY[v_ou2], '[]'::jsonb, '[]'::jsonb);
    PERFORM public.structure_unit_delete(v_campaign, v_ou, '[]'::jsonb, true);
    PERFORM public.structure_materialise_employer_placements(v_campaign);
    PERFORM public.structure_group_delete(v_campaign, v_group, 'empty_only');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'FAIL authenticated owner was refused a structure RPC: % (%)', SQLERRM, SQLSTATE;
  END;
  RAISE NOTICE 'PASS authenticated owner executed all 17 public structure RPCs';

  -- 4. A campaign the probe user cannot write to → 42501 from the pre-check.
  SELECT c.campaign_id INTO v_foreign
  FROM public.campaigns AS c
  WHERE c.campaign_id <> v_campaign
    AND NOT public.can_write_to_campaign(c.campaign_id)
  ORDER BY c.campaign_id
  LIMIT 1;
  IF v_foreign IS NULL THEN
    RAISE NOTICE 'SKIP foreign-campaign probe: no non-writable campaign fixture';
  ELSE
    BEGIN
      PERFORM public.structure_placements_unassign(v_foreign, ARRAY[v_worker]);
      RAISE EXCEPTION 'FAIL authenticated user wrote to a foreign campaign through the structure API';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS structure API raises 42501 on a campaign the user cannot write to';
    END;
  END IF;

  PERFORM set_config('wp22.campaign_id', v_campaign::text, true);
END;
$owner_probe$;

RESET ROLE;

SELECT
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_%') AS public_structure_rpcs,
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'oux_internal') AS internal_helpers,
  (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'structure\_\_%') AS helpers_in_public_must_be_0,
  has_schema_privilege('anon', 'oux_internal', 'USAGE') AS anon_schema_usage_must_be_false,
  has_schema_privilege('authenticated', 'oux_internal', 'USAGE') AS authenticated_schema_usage_must_be_true,
  current_setting('wp22.campaign_id', true) AS probe_campaign_rolled_back;

ROLLBACK;
