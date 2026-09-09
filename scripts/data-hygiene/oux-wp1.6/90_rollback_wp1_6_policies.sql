-- WP1.6 rollback. Operator-run. NOT a migration.
-- Never copy this under supabase/migrations/ and never run it with `supabase db push`.
--
-- Reverses supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql
-- on a database where that migration completed. `db push` is transactional per
-- file, so a partial apply cannot exist; this script assumes the whole
-- migration is present.
--
-- Baseline citations (B:<line>) are supabase/migrations/20260908050000_baseline_schema.sql.
-- Every restored policy and function body is quoted from the baseline verbatim.
--
-- After running this, the app commit should be reverted too if the rollback is
-- expected to be long-lived: useCampaignWriteAccess would 404 on the dropped
-- RPC (controls hide rather than break), and resolveCampaignOrganiserId would
-- fail on link_organiser_for_profile for a first-time organiser.

BEGIN;

-- 1. Drop the WP1.6 write policies (15).
DROP POLICY IF EXISTS "wp16_campaigns_insert" ON "public"."campaigns";
DROP POLICY IF EXISTS "wp16_campaigns_update" ON "public"."campaigns";
DROP POLICY IF EXISTS "wp16_campaigns_delete" ON "public"."campaigns";
DROP POLICY IF EXISTS "wp16_cou_insert"       ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "wp16_cou_update"       ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "wp16_cou_delete"       ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "wp16_cwo_insert"       ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "wp16_cwo_update"       ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "wp16_cwo_delete"       ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "wp16_cwm_insert"       ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "wp16_cwm_update"       ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "wp16_cwm_delete"       ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "wp16_clwl_insert"      ON "public"."campaign_leader_worker_links";
DROP POLICY IF EXISTS "wp16_clwl_update"      ON "public"."campaign_leader_worker_links";
DROP POLICY IF EXISTS "wp16_clwl_delete"      ON "public"."campaign_leader_worker_links";

-- 2. Restore the generation-1 policies, character for character from the
--    baseline: B:25549, 25553, 25581, 25585, 25593, 25955, 25959, 26003,
--    26007, 26015, 26327, 26331, 26371, 26375, 26383.
CREATE POLICY "Admin can delete campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
CREATE POLICY "Admin can delete campaign_organising_units" ON "public"."campaign_organising_units" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
CREATE POLICY "Admin can delete campaign_worker_membership" ON "public"."campaign_worker_membership" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
CREATE POLICY "Admin can delete campaign_worker_ou" ON "public"."campaign_worker_ou" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
CREATE POLICY "Admin can delete campaigns" ON "public"."campaigns" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
CREATE POLICY "Admin/User can insert campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can insert campaign_organising_units" ON "public"."campaign_organising_units" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can insert campaign_worker_membership" ON "public"."campaign_worker_membership" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can insert campaign_worker_ou" ON "public"."campaign_worker_ou" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can insert campaigns" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can update campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can update campaign_organising_units" ON "public"."campaign_organising_units" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can update campaign_worker_membership" ON "public"."campaign_worker_membership" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can update campaign_worker_ou" ON "public"."campaign_worker_ou" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));
CREATE POLICY "Admin/User can update campaigns" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));

-- 3. Restore delete_campaign() to its baseline body (B:1768-1801) and comment (B:1807).
--    This also reverses 20260909130000_wp1_6_delete_campaign_standing_guard.sql
--    (fix round 1), which only replaced this function; CREATE OR REPLACE with
--    the baseline body supersedes both WP1.6 versions. To drop ONLY the
--    standing guard and keep the rest of WP1.6, run
--    91_rollback_standing_guard_only.sql instead of this file.
CREATE OR REPLACE FUNCTION "public"."delete_campaign"("p_campaign_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (public.is_admin() OR public.is_lead_organiser_for_campaign(p_campaign_id)) THEN
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

COMMENT ON FUNCTION "public"."delete_campaign"("p_campaign_id" integer) IS 'Deletes a campaign and dependent planning data. Allowed for admins and lead organisers only.';

-- 4. Drop the new functions and the profile guard.
DROP FUNCTION IF EXISTS "public"."campaigns_i_can_write"(integer[]);
DROP FUNCTION IF EXISTS "public"."link_organiser_for_profile"("uuid");
DROP TRIGGER IF EXISTS "trg_user_profiles_guard_privileged_columns" ON "public"."user_profiles";
DROP FUNCTION IF EXISTS "public"."user_profiles_guard_privileged_columns"();

-- 5. Leave campaigns.created_by DEFAULT auth.uid() IN PLACE.
--    It is harmless under the old policies (which never read created_by) and
--    dropping it would silently un-attribute campaigns created between the
--    deploy and the rollback. To drop it anyway:
--      ALTER TABLE "public"."campaigns" ALTER COLUMN "created_by" DROP DEFAULT;
--      COMMENT ON COLUMN "public"."campaigns"."created_by" IS NULL;

COMMIT;
