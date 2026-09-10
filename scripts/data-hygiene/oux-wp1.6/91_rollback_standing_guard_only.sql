-- WP1.6 fix round 1 rollback — standing-campaign guard ONLY. Operator-run. NOT a migration.
-- Never copy this under supabase/migrations/ and never run it with `supabase db push`.
--
-- Reverses supabase/migrations/20260909130000_wp1_6_delete_campaign_standing_guard.sql
-- and nothing else: delete_campaign() goes back to the WP1.6 body from
-- 20260909120000_wp1_6_campaign_write_policies.sql section 5 (quoted verbatim
-- below), keeping the is_campaign_creator arm and every other WP1.6 object.
--
-- To reverse ALL of WP1.6 (both migration files) use
-- 90_rollback_wp1_6_policies.sql instead; its step 3 restores the baseline
-- body, which supersedes this file.

BEGIN;

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

COMMIT;
