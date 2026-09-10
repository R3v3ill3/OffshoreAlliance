-- WP1.6 role probes. DEV ONLY (dpnnmkhabysfdogllsyh). NEVER RUN AGAINST PRODUCTION.
-- Everything happens inside one transaction that ALWAYS rolls back: not the
-- viewer demotion, not any probe row, not the organiser link survives.
--
-- Run:  psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 \
--            -v e2e_uid='<auth uid>' -v foreign_campaign_id=<id> -v foreign_ou_id=<id> \
--            -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql
--
-- First pass: run with only -v e2e_uid=... and read section 0's discovery
-- output to pick a campaign whose `writable` is false and one of its ou_ids;
-- then run again with all three variables. Expected output is PASS on every
-- probe line except the annotated lead/coordinator case in section 3 (which
-- prints NOTE, not FAIL, when the impersonated account's work_role is
-- lead/coordinator — the RPC allows that by design, decision 8). SKIP lines
-- name a precondition the environment lacks. Any "WARNING ... FAIL" is a
-- failed acceptance criterion.
--
-- The production pre-flight is NOT this file: it is
-- 00_preflight_organiser_write_access.sql (read-only). This file impersonates
-- and demotes an account and must never run outside dev.
--
-- Why RLS is probed with SET LOCAL ROLE authenticated: RLS is not enforced for
-- the table owner or a superuser, so probing as postgres would prove nothing.
-- Why each raising probe sits in its own BEGIN ... EXCEPTION block: a 42501
-- would otherwise abort the outer transaction and strand the remaining probes.
-- Why the wp16.* GUCs: psql \set variables are not visible inside a DO body.

\set ON_ERROR_STOP on
\timing off

-- Defaults so a first discovery-only pass does not error on unset variables.
\if :{?e2e_uid}
\else
  \set e2e_uid '00000000-0000-0000-0000-000000000000'
\endif
\if :{?foreign_campaign_id}
\else
  \set foreign_campaign_id 0
\endif
\if :{?foreign_ou_id}
\else
  \set foreign_ou_id 0
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Discovery. Impersonate the e2e `user` account for the whole transaction.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
       json_build_object('sub', :'e2e_uid', 'role', 'authenticated')::text, true);
SELECT set_config('wp16.foreign_campaign_id', :'foreign_campaign_id', true),
       set_config('wp16.foreign_ou_id',       :'foreign_ou_id',       true);

-- The impersonated account. role must be 'user' for sections 1 and 3 to mean
-- anything; record display_name, role and work_role in the verification output.
SELECT up.user_id, up.display_name, up.role, up.work_role, up.organiser_id,
       public.get_user_role() AS get_user_role, public.is_admin() AS is_admin
FROM public.user_profiles up
WHERE up.user_id = :'e2e_uid';

-- Per-campaign write access as this account. Record at least one
-- writable = true (positive fixture) and one writable = false
-- (E2E_FOREIGN_CAMPAIGN_ID for the e2e negative case and the admin project).
SELECT c.campaign_id, c.name, c.is_standing, c.created_by,
       public.can_write_to_campaign(c.campaign_id) AS writable,
       (SELECT min(ou_id) FROM public.campaign_organising_units cou
         WHERE cou.campaign_id = c.campaign_id) AS sample_ou_id
FROM public.campaigns c
WHERE c.is_sms_episode = false
ORDER BY c.campaign_id;

-- The pre-flight query from wp1.6.md §6 (R1), same text as
-- 00_preflight_organiser_write_access.sql. Expect zero rows. role = 'user'
-- because only user-role accounts can lose anything; work_role IS NULL is
-- included because NOT IN (...) alone is NULL for those rows and drops them.
SELECT c.campaign_id, c.name, c.organiser_id, up.display_name, up.role, up.work_role
FROM public.campaigns c
JOIN public.organisers o     ON o.organiser_id = c.organiser_id
JOIN public.user_profiles up ON up.organiser_id = o.organiser_id
WHERE c.is_sms_episode = false
  AND c.is_standing = false
  AND up.role = 'user'
  AND c.created_by IS DISTINCT FROM up.user_id
  AND (
    up.work_role IS NULL
    OR up.work_role NOT IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_organisers co
    WHERE co.campaign_id = c.campaign_id AND co.organiser_id = o.organiser_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_edit_permissions cep
    WHERE cep.campaign_id = c.campaign_id AND cep.granted_to = up.user_id AND cep.status = 'active'
  )
ORDER BY c.campaign_id;

-- ---------------------------------------------------------------------------
-- 1. Negative case for the `user` role: writes against a campaign it cannot
--    write to. Requires foreign_campaign_id / foreign_ou_id from section 0.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $probe$
DECLARE
  n int;
  fc int := current_setting('wp16.foreign_campaign_id', true)::int;
  fo int := current_setting('wp16.foreign_ou_id', true)::int;
BEGIN
  IF coalesce(fc, 0) = 0 OR coalesce(fo, 0) = 0 THEN
    RAISE NOTICE 'SKIP section 1: set -v foreign_campaign_id and -v foreign_ou_id from the discovery output';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.campaign_organising_units (campaign_id, ou_type, name)
    VALUES (fc, 'custom', 'wp16 probe');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL user/insert campaign_organising_units on foreign campaign: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS user/insert campaign_organising_units on foreign campaign: 42501';
  END;

  UPDATE public.campaign_organising_units
     SET name = name || ' wp16'
   WHERE ou_id = fo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/update campaign_organising_units on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  UPDATE public.campaigns
     SET notes = coalesce(notes, '') || ' wp16'
   WHERE campaign_id = fc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/update campaigns on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_ou
   WHERE ou_id = fo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_worker_ou on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_membership
   WHERE campaign_id = fc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_worker_membership on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_leader_worker_links
   WHERE campaign_id = fc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_leader_worker_links on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_organising_units
   WHERE ou_id = fo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_organising_units on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaigns
   WHERE campaign_id = fc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaigns (direct, foreign campaign): % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  -- delete_campaign() is the UI path; it must raise, never silently no-op.
  BEGIN
    PERFORM public.delete_campaign(fc);
    RAISE WARNING 'FAIL user/delete_campaign() on foreign campaign: did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not_authorized%' THEN
      RAISE NOTICE 'PASS user/delete_campaign() on foreign campaign: not_authorized';
    ELSE
      RAISE WARNING 'FAIL user/delete_campaign() on foreign campaign: unexpected %', SQLERRM;
    END IF;
  END;

  -- The standing campaign must not be deletable by a plain user even though
  -- can_write_to_campaign() is true there (wp1.6.md R3).
  DELETE FROM public.campaigns WHERE is_standing = true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete standing campaign (direct): % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END
$probe$;

-- ---------------------------------------------------------------------------
-- 2. Positive case for the `user` role: a campaign it creates is fully
--    writable to it (decision 8's note), including delete_campaign().
-- ---------------------------------------------------------------------------
DO $probe$
DECLARE
  n int;
  cid int;
  standing_cid int;
  oid int;
BEGIN
  INSERT INTO public.campaigns (name, campaign_type, status)
  VALUES ('wp16 probe (rolled back)', 'organising', 'planning')
  RETURNING campaign_id INTO cid;
  RAISE NOTICE '% user/insert campaigns: created_by = auth.uid()',
               CASE WHEN (SELECT created_by FROM public.campaigns WHERE campaign_id = cid) = auth.uid()
                    THEN 'PASS' ELSE 'FAIL' END;

  RAISE NOTICE '% user/can_write_to_campaign(own campaign)',
               CASE WHEN public.can_write_to_campaign(cid) THEN 'PASS' ELSE 'FAIL' END;

  RAISE NOTICE '% user/campaigns_i_can_write(own campaign)',
               CASE WHEN cid IN (SELECT * FROM public.campaigns_i_can_write(ARRAY[cid]))
                    THEN 'PASS' ELSE 'FAIL' END;

  INSERT INTO public.campaign_organising_units (campaign_id, ou_type, name)
  VALUES (cid, 'custom', 'wp16 probe unit')
  RETURNING ou_id INTO oid;
  RAISE NOTICE 'PASS user/insert campaign_organising_units on own campaign';

  UPDATE public.campaign_organising_units SET name = 'wp16 probe unit renamed' WHERE ou_id = oid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/update campaign_organising_units on own campaign: % row(s)',
               CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_organising_units WHERE ou_id = oid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_organising_units on own campaign: % row(s)',
               CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, n;

  -- Standing guard (fix round 1, 20260909130000): flip the creator's own
  -- campaign to standing and delete_campaign() must refuse it even though
  -- every authorisation arm (creator) is true. The flip is a plain UPDATE
  -- under wp16_campaigns_update; the exception block only rolls back the
  -- failed call, so the flip must be undone explicitly before the success
  -- probe below. All of it is inside the outer ROLLBACK anyway.
  UPDATE public.campaigns SET is_standing = true WHERE campaign_id = cid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE WARNING 'FAIL user/flip own campaign to is_standing: % row(s) (probe below is vacuous)', n;
  END IF;
  BEGIN
    PERFORM public.delete_campaign(cid);
    RAISE WARNING 'FAIL user/delete_campaign(own campaign flipped to standing): did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%campaign_is_standing%' THEN
      RAISE NOTICE 'PASS user/delete_campaign(own campaign flipped to standing): campaign_is_standing';
    ELSE
      RAISE WARNING 'FAIL user/delete_campaign(own campaign flipped to standing): unexpected %', SQLERRM;
    END IF;
  END;
  UPDATE public.campaigns SET is_standing = false WHERE campaign_id = cid;

  -- The organisation's real standing campaign: refused for everyone, before
  -- the role gate, so the message is campaign_is_standing, not not_authorized.
  -- Existence check first (fix round 2): with no standing campaign the old
  -- sub-select passed NULL, the is_standing check is false for a NULL id and
  -- delete_campaign() reached the role gate (not_authorized) before its
  -- campaign_not_found branch — a false FAIL (wp1.6.md §12 run 2). SKIP instead.
  SELECT campaign_id INTO standing_cid
  FROM public.campaigns WHERE is_standing = true ORDER BY campaign_id LIMIT 1;
  IF standing_cid IS NULL THEN
    RAISE NOTICE 'SKIP user/delete_campaign(standing campaign): no standing campaign on this database';
  ELSE
    BEGIN
      PERFORM public.delete_campaign(standing_cid);
      RAISE WARNING 'FAIL user/delete_campaign(standing campaign): did not raise';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%campaign_is_standing%' THEN
        RAISE NOTICE 'PASS user/delete_campaign(standing campaign): campaign_is_standing';
      ELSE
        RAISE WARNING 'FAIL user/delete_campaign(standing campaign): unexpected %', SQLERRM;
      END IF;
    END;
  END IF;

  BEGIN
    PERFORM public.delete_campaign(cid);
    RAISE NOTICE '% user/delete_campaign(own campaign)',
                 CASE WHEN NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = cid)
                      THEN 'PASS' ELSE 'FAIL' END;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL user/delete_campaign(own campaign): %', SQLERRM;
  END;
END
$probe$;

-- ---------------------------------------------------------------------------
-- 3. Self-escalation (wp1.6.md §9 added scope). As a `user`, every privileged
--    column change on the account's own profile must raise 42501, while the
--    self-editable columns still update.
-- ---------------------------------------------------------------------------
DO $probe$
DECLARE
  n int;
  other_oid int;
  linked int;
BEGIN
  BEGIN
    UPDATE public.user_profiles SET role = 'admin' WHERE user_id = auth.uid();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL user/self-escalate role=admin: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS user/self-escalate role=admin: 42501';
  END;

  BEGIN
    UPDATE public.user_profiles SET work_role = 'lead_organiser' WHERE user_id = auth.uid();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL user/self-escalate work_role=lead_organiser: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS user/self-escalate work_role=lead_organiser: 42501';
  END;

  SELECT o.organiser_id INTO other_oid
  FROM public.organisers o
  WHERE o.organiser_id IS DISTINCT FROM (SELECT organiser_id FROM public.user_profiles WHERE user_id = auth.uid())
  ORDER BY o.organiser_id LIMIT 1;
  -- With no other organisers row to point at, other_oid is NULL and the
  -- UPDATE would be a no-op (NULL -> NULL is not DISTINCT, the guard never
  -- fires, 1 row "updates") — a false FAIL. Skip rather than mis-report.
  IF other_oid IS NULL THEN
    RAISE NOTICE 'SKIP user/self-escalate organiser_id: no other organisers row exists on this database';
  ELSE
    BEGIN
      UPDATE public.user_profiles SET organiser_id = other_oid WHERE user_id = auth.uid();
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE WARNING 'FAIL user/self-escalate organiser_id=% : % row(s)', other_oid, n;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS user/self-escalate organiser_id: 42501';
    END;
  END IF;

  BEGIN
    UPDATE public.user_profiles SET reports_to = NULL WHERE user_id = auth.uid() AND reports_to IS NOT NULL;
    UPDATE public.user_profiles SET reports_to = auth.uid() WHERE user_id = auth.uid() AND reports_to IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL user/self-escalate reports_to: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS user/self-escalate reports_to: 42501';
  END;

  -- Self-editable columns must still work (the guard is not over-broad).
  UPDATE public.user_profiles
     SET display_name = display_name, phone = phone, workspace_prefs = workspace_prefs
   WHERE user_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/update own display_name/phone/workspace_prefs: % row(s)',
               CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, n;

  -- The sanctioned path for the one legitimate non-admin organiser_id write.
  -- Idempotent: returns the existing id when already linked.
  BEGIN
    linked := public.link_organiser_for_profile(auth.uid());
    RAISE NOTICE '% user/link_organiser_for_profile(self) -> % (profile now %)',
                 CASE WHEN linked IS NOT NULL
                       AND (SELECT organiser_id FROM public.user_profiles WHERE user_id = auth.uid()) = linked
                      THEN 'PASS' ELSE 'FAIL' END,
                 linked,
                 (SELECT organiser_id FROM public.user_profiles WHERE user_id = auth.uid());
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL user/link_organiser_for_profile(self): %', SQLERRM;
  END;

  -- A plain user (not lead/coordinator) may not mint one for a colleague.
  -- ANNOTATED CASE: when the impersonated account's work_role is
  -- lead_organiser / coordinator / industrial_coordinator the RPC allows this
  -- BY DESIGN (decision 8 — leads link colleagues), so the expectation flips.
  -- That branch prints NOTE, not FAIL; it is the one line the README's
  -- "PASS on every line" excludes. The negative expectation only holds for
  -- work_role = 'organiser' (or NULL), which is what decision 8's note targets.
  IF public.is_coordinator_or_lead() THEN
    BEGIN
      PERFORM public.link_organiser_for_profile(
        (SELECT user_id FROM public.user_profiles WHERE user_id <> auth.uid() ORDER BY user_id LIMIT 1));
      RAISE NOTICE 'NOTE user/link_organiser_for_profile(other): allowed — impersonated account is lead/coordinator, by design (decision 8); not a failure';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'FAIL user/link_organiser_for_profile(other) as lead/coordinator: unexpected %', SQLERRM;
    END;
  ELSE
    BEGIN
      PERFORM public.link_organiser_for_profile(
        (SELECT user_id FROM public.user_profiles WHERE user_id <> auth.uid() ORDER BY user_id LIMIT 1));
      RAISE WARNING 'FAIL user/link_organiser_for_profile(other): did not raise for a plain organiser';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%not_authorized%' THEN
        RAISE NOTICE 'PASS user/link_organiser_for_profile(other): not_authorized';
      ELSE
        RAISE WARNING 'FAIL user/link_organiser_for_profile(other): unexpected %', SQLERRM;
      END IF;
    END;
  END IF;
END
$probe$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3b. The mint path of link_organiser_for_profile (fix round 1, finding 4).
--     Section 3 saw only the idempotent branch (the account is already
--     linked). Here postgres clears the link inside the transaction, then the
--     user calls the RPC on itself: the INSERT organisers + UPDATE
--     user_profiles run under the definer, which is the one legitimate
--     non-admin organiser_id write the guard trigger must let through.
--     Rolled back with everything else.
-- ---------------------------------------------------------------------------
SELECT set_config('wp16.prev_oid',
       coalesce((SELECT organiser_id::text FROM public.user_profiles WHERE user_id = :'e2e_uid'), ''),
       true);
UPDATE public.user_profiles SET organiser_id = NULL WHERE user_id = :'e2e_uid';

SET LOCAL ROLE authenticated;

DO $probe$
DECLARE
  minted int;
  prev   text := nullif(current_setting('wp16.prev_oid', true), '');
  oname  text;
  now_id int;
BEGIN
  BEGIN
    minted := public.link_organiser_for_profile(auth.uid());
    SELECT organiser_name INTO oname FROM public.organisers WHERE organiser_id = minted;
    SELECT organiser_id INTO now_id FROM public.user_profiles WHERE user_id = auth.uid();
    RAISE NOTICE '% user/link_organiser_for_profile(self) mint path -> new organiser % "%" (was %; profile now %)',
                 CASE WHEN minted IS NOT NULL
                       AND oname IS NOT NULL
                       AND now_id = minted
                       AND minted::text IS DISTINCT FROM prev
                      THEN 'PASS' ELSE 'FAIL' END,
                 minted, oname, coalesce(prev, 'NULL'), now_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL user/link_organiser_for_profile(self) mint path: %', SQLERRM;
  END;
END
$probe$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. Viewer case. Borrow the same account and demote it for this transaction
--    only (as postgres, so the guard trigger allows it).
-- ---------------------------------------------------------------------------
UPDATE public.user_profiles SET role = 'viewer' WHERE user_id = :'e2e_uid';

SET LOCAL ROLE authenticated;   -- claims are still :'e2e_uid' from section 0

DO $probe$
DECLARE n int;
BEGIN
  RAISE NOTICE '% viewer/get_user_role() = %',
               CASE WHEN public.get_user_role() = 'viewer' THEN 'PASS' ELSE 'FAIL' END,
               public.get_user_role();

  -- Insert on ANY campaign, standing first: the role floor in the WP1.6
  -- policies must stop a viewer even where can_write_to_campaign() returns true.
  BEGIN
    INSERT INTO public.campaign_organising_units (campaign_id, ou_type, name)
    SELECT c.campaign_id, 'custom', 'wp16 viewer probe'
    FROM public.campaigns c ORDER BY c.is_standing DESC, c.campaign_id LIMIT 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL viewer/insert campaign_organising_units: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS viewer/insert campaign_organising_units: 42501';
  END;

  BEGIN
    INSERT INTO public.campaigns (name, campaign_type, status)
    VALUES ('wp16 viewer probe', 'organising', 'planning');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL viewer/insert campaigns: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS viewer/insert campaigns: 42501';
  END;

  UPDATE public.campaigns SET notes = coalesce(notes, '') || 'wp16';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/update campaigns: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  UPDATE public.campaign_organising_units SET name = name || ' wp16';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/update campaign_organising_units: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_ou WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_worker_ou: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_membership WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_worker_membership: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_leader_worker_links WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_leader_worker_links: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_organising_units WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_organising_units: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaigns WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaigns: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  RAISE NOTICE '% viewer/campaigns_i_can_write(all) is empty',
               CASE WHEN NOT EXISTS (
                 SELECT 1 FROM public.campaigns_i_can_write(
                   (SELECT array_agg(campaign_id) FROM public.campaigns))
               ) THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    UPDATE public.user_profiles SET role = 'admin' WHERE user_id = auth.uid();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL viewer/self-escalate role=admin: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS viewer/self-escalate role=admin: 42501';
  END;

  BEGIN
    PERFORM public.link_organiser_for_profile(auth.uid());
    RAISE WARNING 'FAIL viewer/link_organiser_for_profile(self): did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not_authorized%' THEN
      RAISE NOTICE 'PASS viewer/link_organiser_for_profile(self): not_authorized';
    ELSE
      RAISE WARNING 'FAIL viewer/link_organiser_for_profile(self): unexpected %', SQLERRM;
    END IF;
  END;
END
$probe$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. The service role (what /api/admin/update-user and invite-user use) must
--    still be able to change the privileged columns. Runs last because it
--    changes the impersonated account's role; rolled back with everything else.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

DO $probe$
DECLARE n int;
BEGIN
  UPDATE public.user_profiles
     SET role = 'user', work_role = 'lead_organiser'
   WHERE user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% service_role/update role+work_role: % row(s)',
               CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, n;
END
$probe$;

RESET ROLE;

-- Optional, for R5 (per-row cost of can_write_to_campaign on bulk deletes).
-- Run as the e2e user against a campaign it CAN write to, with >= 100
-- campaign_worker_ou rows, and paste the timing into the verification section:
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS)
--   DELETE FROM public.campaign_worker_ou
--    WHERE ou_id IN (SELECT ou_id FROM public.campaign_organising_units WHERE campaign_id = <writable id>);
--   RESET ROLE;

ROLLBACK;   -- nothing above survives: not the demotion, not any probe row, not the link
