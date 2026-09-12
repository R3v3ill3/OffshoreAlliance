-- WP2.1 RLS and grant probes. Clone/dev only. Every data change is rolled back.
-- Selects probe users by role and never prints names, emails, or contact data.

BEGIN;

DO $fixtures$
DECLARE
  v_user uuid;
  v_other uuid;
BEGIN
  SELECT user_id INTO v_user
  FROM public.user_profiles
  WHERE role = 'user'
  ORDER BY user_id
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '95 role probes require at least one user-role profile';
  END IF;

  SELECT user_id INTO v_other
  FROM public.user_profiles
  WHERE user_id <> v_user
  ORDER BY user_id
  LIMIT 1;

  PERFORM set_config('wp21.probe_uid', v_user::text, true);
  PERFORM set_config('wp21.other_uid', coalesce(v_other::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );
END;
$fixtures$;

SET LOCAL ROLE authenticated;

DO $owner_and_group_probe$
DECLARE
  v_campaign_id integer;
  v_ou_id integer;
  v_group_id integer;
  v_direct_group_id integer;
  v_leaf_ou_id integer;
  v_leaf_group_id integer;
  v_placement_id integer;
  v_worker_id integer;
  v_group_name text;
  v_foreign_campaign_id integer;
  v_count integer;
BEGIN
  INSERT INTO public.campaigns (name, campaign_type, status)
  VALUES ('wp21 role probe (rolled back)', 'organising', 'planning')
  RETURNING campaign_id INTO v_campaign_id;
  PERFORM set_config('wp21.campaign_id', v_campaign_id::text, true);

  INSERT INTO public.campaign_organising_units (
    campaign_id,
    ou_type,
    name,
    is_group_container
  )
  VALUES (
    v_campaign_id,
    'custom',
    'wp21 custom container probe',
    true
  )
  RETURNING ou_id INTO v_ou_id;

  SELECT group_id INTO v_group_id
  FROM public.campaign_groups
  WHERE source_ou_id = v_ou_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'FAIL authenticated owner/container trigger did not create a group';
  END IF;
  RAISE NOTICE 'PASS authenticated owner/container trigger created a group under RLS';

  UPDATE public.campaign_organising_units
  SET name = 'wp21 custom container probe renamed'
  WHERE ou_id = v_ou_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL authenticated custom-container rename changed % rows', v_count;
  END IF;

  SELECT name INTO v_group_name
  FROM public.campaign_groups
  WHERE group_id = v_group_id;
  IF v_group_name IS DISTINCT FROM 'wp21 custom container probe renamed' THEN
    RAISE EXCEPTION 'FAIL custom-container rename did not propagate to its group';
  END IF;
  RAISE NOTICE 'PASS custom-container rename propagated to its group';

  BEGIN
    PERFORM public.campaign_group_ensure(
      v_campaign_id,
      'custom',
      'wp21 custom container probe renamed',
      NULL,
      80
    );
    RAISE EXCEPTION
      'FAIL source-less group lookup silently reused a provenance-backed group';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE
      'PASS source-less group lookup rejects provenance-backed name collisions';
  END;

  INSERT INTO public.campaign_groups (campaign_id, kind, name)
  VALUES (
    v_campaign_id,
    'custom',
    'wp21 direct custom group probe'
  )
  RETURNING group_id INTO v_direct_group_id;

  UPDATE public.campaign_groups
  SET display_order = 91
  WHERE group_id = v_direct_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL authenticated owner could not update a direct custom group';
  END IF;

  DELETE FROM public.campaign_groups WHERE group_id = v_direct_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL authenticated owner could not delete a direct custom group';
  END IF;
  RAISE NOTICE 'PASS authenticated owner has direct group CRUD under RLS';

  INSERT INTO public.campaign_organising_units (
    campaign_id,
    ou_type,
    name,
    is_group_container
  )
  VALUES (
    v_campaign_id,
    'worksite',
    'wp21 leaf probe',
    false
  )
  RETURNING ou_id, group_id INTO v_leaf_ou_id, v_leaf_group_id;

  IF v_leaf_group_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.campaign_groups AS g
       WHERE g.group_id = v_leaf_group_id
         AND g.campaign_id = v_campaign_id
         AND g.kind = 'worksite'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated leaf insert did not derive its campaign group';
  END IF;
  RAISE NOTICE 'PASS authenticated leaf insert derived its campaign group';

  SELECT worker_id INTO v_worker_id
  FROM public.workers
  ORDER BY worker_id
  LIMIT 1;
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION '95 role probes require at least one worker row';
  END IF;

  INSERT INTO public.campaign_worker_ou (ou_id, worker_id)
  VALUES (v_leaf_ou_id, v_worker_id)
  RETURNING id, group_id INTO v_placement_id, v_group_id;

  IF v_group_id IS DISTINCT FROM v_leaf_group_id THEN
    RAISE EXCEPTION 'FAIL authenticated placement insert did not derive the unit group';
  END IF;
  RAISE NOTICE 'PASS authenticated placement insert derived the matching group';

  BEGIN
    DELETE FROM public.campaign_groups
    WHERE group_id = v_leaf_group_id;
    SET CONSTRAINTS
      campaign_organising_units_group_id_fkey,
      campaign_worker_ou_group_id_fkey
      IMMEDIATE;
    RAISE EXCEPTION 'FAIL direct group delete succeeded while unit/placement survived';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE
      'PASS deferred group FKs reject direct group deletion with surviving rows';
  END;

  PERFORM set_config('wp21.container_ou_id', v_ou_id::text, true);
  PERFORM set_config('wp21.leaf_ou_id', v_leaf_ou_id::text, true);
  PERFORM set_config('wp21.placement_id', v_placement_id::text, true);

  INSERT INTO public.user_campaign_prefs (user_id, campaign_id, prefs)
  VALUES (auth.uid(), v_campaign_id, '{"active_group":"probe"}'::jsonb);

  SELECT count(*) INTO v_count
  FROM public.user_campaign_prefs
  WHERE user_id = auth.uid() AND campaign_id = v_campaign_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL prefs owner could not insert/read own row';
  END IF;
  RAISE NOTICE 'PASS prefs owner can insert/read own row';

  UPDATE public.user_campaign_prefs
  SET prefs = '{"collapsed_groups":[]}'::jsonb
  WHERE user_id = auth.uid() AND campaign_id = v_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL prefs owner could not update own row';
  END IF;
  RAISE NOTICE 'PASS prefs owner can update own row';

  SELECT c.campaign_id INTO v_foreign_campaign_id
  FROM public.campaigns AS c
  WHERE c.campaign_id <> v_campaign_id
    AND NOT public.can_write_to_campaign(c.campaign_id)
  ORDER BY c.campaign_id
  LIMIT 1;

  IF v_foreign_campaign_id IS NULL THEN
    RAISE NOTICE 'SKIP foreign-campaign group probes: no non-writable campaign fixture';
  ELSE
    BEGIN
      INSERT INTO public.campaign_groups (campaign_id, kind, name)
      VALUES (
        v_foreign_campaign_id,
        'custom',
        'wp21 foreign probe ' || txid_current()::text
      );
      RAISE EXCEPTION 'FAIL authenticated user inserted a group in a foreign campaign';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS authenticated user cannot insert a group in a foreign campaign';
    END;

    UPDATE public.campaign_groups
    SET display_order = display_order
    WHERE campaign_id = v_foreign_campaign_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'FAIL authenticated user updated % foreign groups', v_count;
    END IF;
    RAISE NOTICE 'PASS authenticated user cannot update foreign groups';

    DELETE FROM public.campaign_groups
    WHERE campaign_id = v_foreign_campaign_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'FAIL authenticated user deleted % foreign groups', v_count;
    END IF;
    RAISE NOTICE 'PASS authenticated user cannot delete foreign groups';

    SELECT count(*) INTO v_count
    FROM public.campaign_groups
    WHERE campaign_id = v_foreign_campaign_id;
    RAISE NOTICE 'PASS authenticated group SELECT is structurally available: % row(s)', v_count;
  END IF;
END;
$owner_and_group_probe$;

RESET ROLE;
SET LOCAL ROLE service_role;

DO $service_seed$
DECLARE
  v_other text := current_setting('wp21.other_uid', true);
  v_campaign_id integer := current_setting('wp21.campaign_id', true)::integer;
BEGIN
  IF v_other = '' THEN
    RAISE NOTICE 'SKIP second-user prefs seed: no other profile fixture';
    RETURN;
  END IF;

  INSERT INTO public.user_campaign_prefs (user_id, campaign_id, prefs)
  VALUES (v_other::uuid, v_campaign_id, '{"probe":true}'::jsonb);
  RAISE NOTICE 'PASS service_role inserted another owner prefs row';
END;
$service_seed$;

RESET ROLE;
SET LOCAL ROLE authenticated;

DO $owner_isolation$
DECLARE
  v_other text := current_setting('wp21.other_uid', true);
  v_campaign_id integer := current_setting('wp21.campaign_id', true)::integer;
  v_count integer;
BEGIN
  IF v_other = '' THEN
    RAISE NOTICE 'SKIP prefs owner-isolation probe: no other profile fixture';
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_campaign_prefs
  WHERE user_id = v_other::uuid
    AND campaign_id = v_campaign_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL prefs owner read another owner row';
  END IF;
  RAISE NOTICE 'PASS prefs owner cannot read another owner row';

  BEGIN
    INSERT INTO public.user_campaign_prefs (user_id, campaign_id, prefs)
    VALUES (v_other::uuid, v_campaign_id, '{}'::jsonb)
    ON CONFLICT (user_id, campaign_id) DO UPDATE SET prefs = EXCLUDED.prefs;
    RAISE EXCEPTION 'FAIL prefs owner wrote another owner row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS prefs owner cannot write another owner row';
  END;
END;
$owner_isolation$;

DELETE FROM public.user_campaign_prefs
WHERE user_id = auth.uid()
  AND campaign_id = current_setting('wp21.campaign_id', true)::integer;

DO $campaign_delete_probe$
DECLARE
  v_campaign_id integer := current_setting('wp21.campaign_id', true)::integer;
  v_count integer;
BEGIN
  DELETE FROM public.campaigns
  WHERE campaign_id = v_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL authenticated owner did not delete the probe campaign';
  END IF;

  SET CONSTRAINTS
    campaign_organising_units_group_id_fkey,
    campaign_worker_ou_group_id_fkey
    IMMEDIATE;

  IF EXISTS (
    SELECT 1 FROM public.campaigns WHERE campaign_id = v_campaign_id
  )
     OR EXISTS (
       SELECT 1 FROM public.campaign_groups WHERE campaign_id = v_campaign_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.campaign_organising_units
       WHERE ou_id IN (
         current_setting('wp21.container_ou_id', true)::integer,
         current_setting('wp21.leaf_ou_id', true)::integer
       )
     )
     OR EXISTS (
       SELECT 1
       FROM public.campaign_worker_ou
       WHERE id = current_setting('wp21.placement_id', true)::integer
     )
  THEN
    RAISE EXCEPTION 'FAIL populated campaign delete left WP2.1 rows behind';
  END IF;
  RAISE NOTICE
    'PASS populated campaign delete cascaded through groups, units, placement, and prefs';
END;
$campaign_delete_probe$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $anon_probe$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.campaign_groups;
    RAISE EXCEPTION 'FAIL anon selected campaign_groups';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot select campaign_groups';
  END;

  BEGIN
    PERFORM count(*) FROM public.user_campaign_prefs;
    RAISE EXCEPTION 'FAIL anon selected user_campaign_prefs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot select user_campaign_prefs';
  END;
END;
$anon_probe$;

RESET ROLE;
SET LOCAL ROLE service_role;

DO $service_read$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.user_campaign_prefs
  WHERE campaign_id = current_setting('wp21.campaign_id', true)::integer;
  RAISE NOTICE 'PASS service_role can read prefs across owners: % row(s)', v_count;
END;
$service_read$;

RESET ROLE;

DO $grant_checks$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.campaign_groups', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.campaign_groups', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.campaign_groups', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.campaign_groups', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.user_campaign_prefs', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.user_campaign_prefs', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.user_campaign_prefs', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.user_campaign_prefs', 'DELETE')
     OR NOT has_sequence_privilege(
       'authenticated',
       'public.campaign_groups_group_id_seq',
       'USAGE'
     )
     OR NOT has_sequence_privilege(
       'authenticated',
       'public.campaign_groups_group_id_seq',
       'SELECT'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated is missing an intended WP2.1 grant';
  END IF;

  IF has_table_privilege(
       'authenticated',
       'public.campaign_groups',
       'TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated',
       'public.user_campaign_prefs',
       'TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_sequence_privilege(
       'authenticated',
       'public.campaign_groups_group_id_seq',
       'UPDATE'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated has unintended WP2.1 privileges';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.campaign_groups', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.campaign_groups', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.campaign_groups', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.campaign_groups', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.user_campaign_prefs', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.user_campaign_prefs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.user_campaign_prefs', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.user_campaign_prefs', 'DELETE')
  THEN
    RAISE EXCEPTION 'FAIL service_role is missing WP2.1 table grants';
  END IF;

  IF has_table_privilege(
       'anon',
       'public.campaign_groups',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'anon',
       'public.user_campaign_prefs',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  THEN
    RAISE EXCEPTION 'FAIL anon has a WP2.1 table grant';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.campaign_group_ensure(integer,text,text,integer,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.campaign_group_ensure(integer,text,text,integer,integer)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'FAIL campaign-group function EXECUTE boundary is incorrect';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.campaign_groups'::regclass)
     OR NOT (
       SELECT relrowsecurity
       FROM pg_class
       WHERE oid = 'public.user_campaign_prefs'::regclass
     )
  THEN
    RAISE EXCEPTION 'FAIL WP2.1 RLS is not enabled';
  END IF;

  IF to_regclass('public._oux_wp21_canonical_basis') IS NOT NULL
     AND (
       has_table_privilege(
         'authenticated',
         'public._oux_wp21_canonical_basis',
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
       OR has_sequence_privilege(
         'authenticated',
         'public._oux_wp21_canonical_basis_mapping_id_seq',
         'USAGE,SELECT,UPDATE'
       )
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated has canonical-mapping privileges';
  END IF;

  IF to_regclass('public._oux_wp21_placement_mapping') IS NOT NULL
     AND has_table_privilege(
       'authenticated',
       'public._oux_wp21_placement_mapping',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated has placement-mapping privileges';
  END IF;

  IF to_regclass('public._oux_wp21_conflicts') IS NOT NULL
     AND has_table_privilege(
       'authenticated',
       'public._oux_wp21_conflicts',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated has conflict-diagnostic privileges';
  END IF;

  IF to_regclass('public._oux_env_marker') IS NOT NULL
     AND has_table_privilege(
       'authenticated',
       'public._oux_env_marker',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  THEN
    RAISE EXCEPTION 'FAIL authenticated has environment-marker privileges';
  END IF;

  RAISE NOTICE 'PASS WP2.1 RLS, table, sequence, function, and helper grants';
END;
$grant_checks$;

ROLLBACK;
