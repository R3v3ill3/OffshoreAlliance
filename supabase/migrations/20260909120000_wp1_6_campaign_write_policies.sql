-- WP1.6 — Auth and RLS alignment (docs/organiser-ux-review/wp/wp1.6.md).
--
-- Baseline citations below are line numbers in
-- supabase/migrations/20260908050000_baseline_schema.sql, written B:<line>.
-- Every generation-1 policy this file drops is quoted verbatim from the
-- baseline in the comment directly above its DROP, so the before/after can be
-- diffed from this file alone.
--
-- Design rule (wp1.6.md §2.0): can_write_to_campaign() (B:994-1009) is NOT a
-- superset of today's get_user_role() IN ('admin','user'). Its first arm
-- (B:997-1001) is true for ANY authenticated account on the standing
-- campaign, and is_assigned_to_campaign() / has_campaign_edit_permission()
-- never read user_profiles.role. A viewer would therefore pass a bare
-- can_write_to_campaign() check. Every write policy here is
--
--     get_user_role() IN ('admin','user')  AND  can_write_to_campaign(<campaign_id>)
--
-- — a role floor AND a campaign scope. This is a strict narrowing of the old
-- policies in every case: nothing a viewer can do today changes.
--
-- Contents
--   1. campaigns.created_by DEFAULT auth.uid()             (§2.1.1, decision 8)
--   2. DROP the 15 generation-1 write policies              (§2.1.2)
--   3. CREATE the 15 wp16_* write policies                  (§2.1.3–§2.1.5, §2.1.8)
--   4. campaigns_i_can_write(integer[])                     (§2.1.6)
--   5. delete_campaign() learns is_campaign_creator         (§2.1.7)
--   6. user_profiles privileged-column guard                (§9 added scope)
--   7. link_organiser_for_profile(uuid)                     (§2.2, forced by 6)
--
-- The five "Authenticated users can read <table>" SELECT policies
-- (B:26981, 26985, 27029, 27033, 27041) are untouched.
--
-- Rollback: scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql
-- (operator-run; never a migration).

-- ---------------------------------------------------------------------------
-- 1. campaigns.created_by gets a default (B:9666 has none; no BEFORE INSERT
--    trigger exists — B:22409 and B:22549 are the only campaigns triggers).
--    Only src/app/api/sms/episodes/route.ts sets created_by today; the manual
--    create page, the wizard, usePlannerCampaigns and campaign-import omit it.
--    is_campaign_creator() (B:3678-3685) is what lets a user-role organiser
--    write to (and, via delete_campaign, delete) a campaign they made.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."campaigns"
  ALTER COLUMN "created_by" SET DEFAULT "auth"."uid"();

COMMENT ON COLUMN "public"."campaigns"."created_by" IS
  'Account that created the campaign. Defaults to auth.uid() so every client creation path is covered '
  '(WP1.6, decision 8): is_campaign_creator() is what lets a user-role organiser write to a campaign '
  'they made themselves. NULL for rows created before 2026-09-09, by the service role, or from psql.';

-- ---------------------------------------------------------------------------
-- 2. Drop the generation-1 write policies. Baseline text quoted above each.
-- ---------------------------------------------------------------------------

-- B:26015
-- CREATE POLICY "Admin/User can insert campaigns" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can insert campaigns" ON "public"."campaigns";

-- B:26383
-- CREATE POLICY "Admin/User can update campaigns" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can update campaigns" ON "public"."campaigns";

-- B:25593
-- CREATE POLICY "Admin can delete campaigns" ON "public"."campaigns" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
DROP POLICY IF EXISTS "Admin can delete campaigns" ON "public"."campaigns";

-- B:25959
-- CREATE POLICY "Admin/User can insert campaign_organising_units" ON "public"."campaign_organising_units" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can insert campaign_organising_units" ON "public"."campaign_organising_units";

-- B:26331
-- CREATE POLICY "Admin/User can update campaign_organising_units" ON "public"."campaign_organising_units" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can update campaign_organising_units" ON "public"."campaign_organising_units";

-- B:25553
-- CREATE POLICY "Admin can delete campaign_organising_units" ON "public"."campaign_organising_units" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
DROP POLICY IF EXISTS "Admin can delete campaign_organising_units" ON "public"."campaign_organising_units";

-- B:26007
-- CREATE POLICY "Admin/User can insert campaign_worker_ou" ON "public"."campaign_worker_ou" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can insert campaign_worker_ou" ON "public"."campaign_worker_ou";

-- B:26375
-- CREATE POLICY "Admin/User can update campaign_worker_ou" ON "public"."campaign_worker_ou" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can update campaign_worker_ou" ON "public"."campaign_worker_ou";

-- B:25585
-- CREATE POLICY "Admin can delete campaign_worker_ou" ON "public"."campaign_worker_ou" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
DROP POLICY IF EXISTS "Admin can delete campaign_worker_ou" ON "public"."campaign_worker_ou";

-- B:26003
-- CREATE POLICY "Admin/User can insert campaign_worker_membership" ON "public"."campaign_worker_membership" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can insert campaign_worker_membership" ON "public"."campaign_worker_membership";

-- B:26371
-- CREATE POLICY "Admin/User can update campaign_worker_membership" ON "public"."campaign_worker_membership" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can update campaign_worker_membership" ON "public"."campaign_worker_membership";

-- B:25581
-- CREATE POLICY "Admin can delete campaign_worker_membership" ON "public"."campaign_worker_membership" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
DROP POLICY IF EXISTS "Admin can delete campaign_worker_membership" ON "public"."campaign_worker_membership";

-- B:25955
-- CREATE POLICY "Admin/User can insert campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can insert campaign_leader_worker_links" ON "public"."campaign_leader_worker_links";

-- B:26327
-- CREATE POLICY "Admin/User can update campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
DROP POLICY IF EXISTS "Admin/User can update campaign_leader_worker_links" ON "public"."campaign_leader_worker_links";

-- B:25549
-- CREATE POLICY "Admin can delete campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
DROP POLICY IF EXISTS "Admin can delete campaign_leader_worker_links" ON "public"."campaign_leader_worker_links";

-- ---------------------------------------------------------------------------
-- 3a. campaigns. INSERT keeps today's rule exactly: the row does not exist yet,
--     so can_write_to_campaign() has nothing to read; the created_by default
--     above makes the row writable to its creator the moment it lands.
-- ---------------------------------------------------------------------------

CREATE POLICY "wp16_campaigns_insert" ON "public"."campaigns"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]));

CREATE POLICY "wp16_campaigns_update" ON "public"."campaigns"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

-- DELETE keeps an explicit standing-campaign guard: can_write_to_campaign()'s
-- first arm (B:997-1001) is TRUE for every authenticated account on the
-- standing campaign, and a shared container must not be deletable by whoever
-- happens to open it. (The UI deletes through delete_campaign(), section 5;
-- this policy is the backstop for direct PostgREST deletes.)
CREATE POLICY "wp16_campaigns_delete" ON "public"."campaigns"
  FOR DELETE TO "authenticated"
  USING (
    "public"."is_admin"()
    OR (
      "is_standing" = false
      AND ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
      AND "public"."can_write_to_campaign"("campaign_id")
    )
  );

-- ---------------------------------------------------------------------------
-- 3b. campaign_organising_units (campaign_id NOT NULL, B:9500-9520)
-- ---------------------------------------------------------------------------

CREATE POLICY "wp16_cou_insert" ON "public"."campaign_organising_units"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cou_update" ON "public"."campaign_organising_units"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cou_delete" ON "public"."campaign_organising_units"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

-- ---------------------------------------------------------------------------
-- 3c. campaign_worker_membership (campaign_id NOT NULL, B:7698-7704)
-- ---------------------------------------------------------------------------

CREATE POLICY "wp16_cwm_insert" ON "public"."campaign_worker_membership"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cwm_update" ON "public"."campaign_worker_membership"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cwm_delete" ON "public"."campaign_worker_membership"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

-- ---------------------------------------------------------------------------
-- 3d. campaign_leader_worker_links (campaign_id NOT NULL) — the fifth table,
--     included per §2.1.8 / §10 so no delete is left as a silent no-op.
-- ---------------------------------------------------------------------------

CREATE POLICY "wp16_clwl_insert" ON "public"."campaign_leader_worker_links"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_clwl_update" ON "public"."campaign_leader_worker_links"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_clwl_delete" ON "public"."campaign_leader_worker_links"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

-- ---------------------------------------------------------------------------
-- 3e. campaign_worker_ou (B:9636-9645) has NO campaign_id column: scope is a
--     join through campaign_organising_units. ou_id is NOT NULL with an FK, so
--     the EXISTS finds exactly one row; campaign_organising_units SELECT is
--     USING (true) for authenticated (B:26985), so the join never hides a row.
--     Inside a policy the candidate row is referenced by its table name.
-- ---------------------------------------------------------------------------

CREATE POLICY "wp16_cwo_insert" ON "public"."campaign_worker_ou"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1
      FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );

CREATE POLICY "wp16_cwo_update" ON "public"."campaign_worker_ou"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1
      FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1
      FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );

CREATE POLICY "wp16_cwo_delete" ON "public"."campaign_worker_ou"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1
      FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Batch write-access helper: one round trip for the campaigns list gate and
--    for the cross-campaign universe sync, so the write rule has exactly one
--    definition. Returns only ids the caller passed in; campaigns SELECT is
--    already USING (true) for authenticated (B:27041), so nothing new leaks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."campaigns_i_can_write"("p_campaign_ids" integer[])
RETURNS SETOF integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.campaign_id
  FROM public.campaigns c
  WHERE c.campaign_id = ANY (p_campaign_ids)
    AND public.get_user_role() = ANY (ARRAY['admin', 'user'])
    AND public.can_write_to_campaign(c.campaign_id);
$$;

ALTER FUNCTION "public"."campaigns_i_can_write"("p_campaign_ids" integer[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."campaigns_i_can_write"(integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."campaigns_i_can_write"(integer[]) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."campaigns_i_can_write"(integer[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."campaigns_i_can_write"(integer[]) TO "service_role";

COMMENT ON FUNCTION "public"."campaigns_i_can_write"(integer[]) IS
  'WP1.6. Returns the subset of p_campaign_ids the caller may write to under the WP1.6 policies '
  '(role floor AND can_write_to_campaign). One round trip for list surfaces and for the universe sync, '
  'so the write rule has exactly one definition.';

-- ---------------------------------------------------------------------------
-- 5. delete_campaign() (B:1768-1801) is the only path the UI uses to delete a
--    campaign. Its gate was is_admin() OR is_lead_organiser_for_campaign();
--    neither fires for a user-role organiser who just created a campaign
--    (arm 1 of is_lead_organiser_for_campaign needs a lead/coordinator
--    work_role, B:3714-3722, and a fresh campaign has no roster row).
--    Body below the gate is unchanged from B:1785-1799.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."delete_campaign"("p_campaign_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- WP1.6: added is_campaign_creator (decision 8 — a user-role organiser must
  -- be able to delete a campaign they created). Deliberately NOT
  -- can_write_to_campaign(): its is_standing arm (B:997-1001) would let any
  -- authenticated account delete the shared standing campaign.
  IF NOT (
    public.is_admin()
    OR public.is_lead_organiser_for_campaign(p_campaign_id)
    OR public.is_campaign_creator(p_campaign_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION 'campaign_not_found';
  END IF;

  DELETE FROM campaign_stage_workplan_tasks WHERE campaign_id = p_campaign_id;

  DELETE FROM gate_assessments ga
  USING gate_definitions gd
  WHERE ga.gate_id = gd.gate_id AND gd.campaign_id = p_campaign_id;

  DELETE FROM gate_definitions WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_stage_plans WHERE campaign_id = p_campaign_id;

  DELETE FROM reporting_snapshots WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_timelines WHERE campaign_id = p_campaign_id;

  DELETE FROM campaigns WHERE campaign_id = p_campaign_id;
END;
$$;

COMMENT ON FUNCTION "public"."delete_campaign"("p_campaign_id" integer) IS
  'Deletes a campaign and dependent planning data. Allowed for admins, lead organisers and the '
  'campaign creator (WP1.6).';

-- ---------------------------------------------------------------------------
-- 6. user_profiles privileged-column guard (wp1.6.md §9, added scope).
--
--    "Users can update own profile" (B:27887) is USING/WITH CHECK
--    (user_id = auth.uid() OR get_user_role() = 'admin'), and the baseline
--    grants ALL on user_profiles to authenticated (B:31208) with no
--    column-level grants. A user could therefore
--      PATCH /rest/v1/user_profiles?user_id=eq.<self>  {"role":"admin"}
--    and get_user_role() (B:3346) would then trust it. The same hole covers
--    work_role (is_coordinator_or_lead, is_lead_organiser_for_campaign),
--    organiser_id (every organiser-keyed arm of can_write_to_campaign) and
--    reports_to (the legacy chain in is_lead_organiser_for_campaign arm 4).
--
--    A BEFORE UPDATE trigger, not column-level grants: the admin UI updates
--    role/work_role/reports_to through the user-scoped client with the RLS
--    admin arm, and REVOKE UPDATE (col) would break that for admins too.
--
--    The trigger function is SECURITY INVOKER on purpose: current_user must be
--    the caller's role. PostgREST runs end-user requests as "authenticated"
--    (or "anon"); the service role runs as "service_role"; psql / the SQL
--    editor run as "postgres"; and inside a SECURITY DEFINER function owned by
--    postgres current_user is "postgres". So the guard bites only a plain
--    authenticated session that is not an admin. The admin update-user and
--    invite-user routes use the service role and are unaffected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."user_profiles_guard_privileged_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.role         IS DISTINCT FROM OLD.role
  OR NEW.work_role    IS DISTINCT FROM OLD.work_role
  OR NEW.organiser_id IS DISTINCT FROM OLD.organiser_id
  OR NEW.reports_to   IS DISTINCT FROM OLD.reports_to
  THEN
    IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
      RAISE EXCEPTION
        'Only an admin can change role, work_role, organiser_id or reports_to on a user profile'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."user_profiles_guard_privileged_columns"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."user_profiles_guard_privileged_columns"() IS
  'WP1.6. BEFORE UPDATE guard on user_profiles: a non-admin authenticated session may not change '
  'user_id, role, work_role, organiser_id or reports_to (self-escalation). display_name, phone and '
  'workspace_prefs stay self-editable. SECURITY INVOKER so current_user is the real caller role.';

DROP TRIGGER IF EXISTS "trg_user_profiles_guard_privileged_columns" ON "public"."user_profiles";
CREATE TRIGGER "trg_user_profiles_guard_privileged_columns"
  BEFORE UPDATE ON "public"."user_profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."user_profiles_guard_privileged_columns"();

-- ---------------------------------------------------------------------------
-- 7. link_organiser_for_profile(uuid) — the one legitimate non-admin write to
--    user_profiles.organiser_id, which section 6 now blocks from the client.
--
--    resolveCampaignOrganiserId (src/lib/campaign/resolve-campaign-organiser.ts)
--    used to INSERT an organisers row and UPDATE user_profiles.organiser_id
--    from the user-scoped client. Decision 8's note requires a user-role
--    organiser to create a campaign with themselves assigned, and that is the
--    path that mints their organiser record the first time. Decision 8 also
--    lets admins AND lead organisers mint one for a colleague.
--
--    Gate: self, or is_coordinator_or_lead() (B:3692-3704: role='admin' OR
--    work_role IN lead_organiser/coordinator/industrial_coordinator — the
--    database's own definition of "lead or above"). Role floor admin/user so
--    a viewer cannot mint organiser rows. Idempotent: returns the existing
--    organiser_id when the profile is already linked.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."link_organiser_for_profile"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_display_name text;
  v_organiser_id integer;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF public.get_user_role() IS DISTINCT FROM 'admin'
     AND public.get_user_role() IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_user_id <> auth.uid() AND NOT public.is_coordinator_or_lead() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT up.display_name, up.organiser_id
    INTO v_display_name, v_organiser_id
  FROM public.user_profiles up
  WHERE up.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_organiser_id IS NOT NULL THEN
    RETURN v_organiser_id;
  END IF;

  v_name := coalesce(nullif(left(btrim(coalesce(v_display_name, '')), 100), ''), 'Staff');

  INSERT INTO public.organisers (organiser_name, is_active)
  VALUES (v_name, true)
  RETURNING organiser_id INTO v_organiser_id;

  -- Fires trg_user_profiles_guard_privileged_columns with current_user =
  -- postgres (SECURITY DEFINER), which is the intended privileged path.
  UPDATE public.user_profiles
     SET organiser_id = v_organiser_id
   WHERE user_id = p_user_id;

  RETURN v_organiser_id;
END;
$$;

ALTER FUNCTION "public"."link_organiser_for_profile"("p_user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."link_organiser_for_profile"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."link_organiser_for_profile"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."link_organiser_for_profile"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."link_organiser_for_profile"("uuid") TO "service_role";

COMMENT ON FUNCTION "public"."link_organiser_for_profile"("uuid") IS
  'WP1.6. Creates an organisers row for a staff profile that has none and links user_profiles.organiser_id '
  'to it; returns the organiser_id (existing or new). Allowed for the profile owner, or for admins and '
  'lead/coordinator work roles linking a colleague (decision 8). Replaces the client-side write that the '
  'user_profiles privileged-column guard now rejects.';
