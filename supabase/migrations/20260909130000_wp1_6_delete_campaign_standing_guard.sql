-- WP1.6 fix round 1 — delete_campaign() refuses the standing campaign
-- (docs/organiser-ux-review/wp/wp1.6.md §11 "Fix round 1", reviewer finding 3).
--
-- Why a new file: 20260909120000_wp1_6_campaign_write_policies.sql is applied
-- to dev and is never edited. This file only replaces delete_campaign(); every
-- policy, function and trigger from the 120000 file is left as it is.
--
-- What changes: the RLS policy wp16_campaigns_delete already refuses a direct
-- DELETE of a standing campaign for non-admins (is_standing = false is in its
-- USING clause), but delete_campaign() is SECURITY DEFINER and bypasses RLS,
-- so an admin, a lead organiser for the standing campaign, or its creator
-- could still remove the shared standing container through the UI's delete
-- dialog. The standing campaign is the shared home for phone operations not
-- belonging to a specific campaign ("Exactly one standing campaign should
-- exist per organisation", B:9710); deleting it is never a routine action.
-- The function now raises 'campaign_is_standing' when the target has
-- is_standing = true. The check sits after the auth.uid() IS NULL check (an
-- unauthenticated caller still gets not_authorized and learns nothing) and
-- BEFORE the role gate, so the refusal is unconditional — admins included.
-- Removing a standing campaign, if ever needed, is a deliberate operator
-- action in SQL (flip is_standing first), not a click.
--
-- Prior body (from the 120000 file, section 5), quoted so the two can be
-- diffed from this file alone:
--
--   BEGIN
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'not_authorized';
--     END IF;
--
--     -- WP1.6: added is_campaign_creator (decision 8 — a user-role organiser must
--     -- be able to delete a campaign they created). Deliberately NOT
--     -- can_write_to_campaign(): its is_standing arm (B:997-1001) would let any
--     -- authenticated account delete the shared standing campaign.
--     IF NOT (
--       public.is_admin()
--       OR public.is_lead_organiser_for_campaign(p_campaign_id)
--       OR public.is_campaign_creator(p_campaign_id)
--     ) THEN
--       RAISE EXCEPTION 'not_authorized';
--     END IF;
--
--     IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_id = p_campaign_id) THEN
--       RAISE EXCEPTION 'campaign_not_found';
--     END IF;
--
--     DELETE FROM campaign_stage_workplan_tasks WHERE campaign_id = p_campaign_id;
--     DELETE FROM gate_assessments ga USING gate_definitions gd
--       WHERE ga.gate_id = gd.gate_id AND gd.campaign_id = p_campaign_id;
--     DELETE FROM gate_definitions WHERE campaign_id = p_campaign_id;
--     DELETE FROM campaign_stage_plans WHERE campaign_id = p_campaign_id;
--     DELETE FROM reporting_snapshots WHERE campaign_id = p_campaign_id;
--     DELETE FROM campaign_timelines WHERE campaign_id = p_campaign_id;
--     DELETE FROM campaigns WHERE campaign_id = p_campaign_id;
--   END;
--
-- Correction to a comment in the 120000 file (section 6, "A BEFORE UPDATE
-- trigger, not column-level grants"), recorded here because that file cannot
-- be edited: the admin UI does NOT update role/work_role/reports_to through
-- the user-scoped client. /api/admin/update-user and /api/admin/invite-user
-- use the service-role client (createAdminClient), which runs as
-- service_role and is outside the guard entirely. The reason the guard is an
-- invoker-scoped trigger rather than column-level REVOKEs is that the trigger
-- can tell the caller roles apart (authenticated/anon vs service_role vs
-- postgres inside a SECURITY DEFINER body), so the RLS admin arm of "Users
-- can update own profile" stays usable for an admin session while a plain
-- authenticated session is refused. Column-level REVOKE UPDATE would have
-- removed that admin arm too.
--
-- Rollback: scripts/data-hygiene/oux-wp1.6/91_rollback_standing_guard_only.sql
-- restores the body quoted above (keeps the rest of WP1.6);
-- scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql restores the
-- baseline body and reverses all of WP1.6. Both are operator-run; never migrations.

CREATE OR REPLACE FUNCTION "public"."delete_campaign"("p_campaign_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- WP1.6 fix round 1: the shared standing campaign is never deleted from
  -- the UI, whoever asks. Checked before the role gate so it holds for
  -- admins too. Absent the row this is false and campaign_not_found fires below.
  IF EXISTS (
    SELECT 1 FROM campaigns
    WHERE campaign_id = p_campaign_id AND is_standing = true
  ) THEN
    RAISE EXCEPTION 'campaign_is_standing';
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
  'campaign creator (WP1.6). Refuses the standing campaign for everyone (campaign_is_standing; '
  'WP1.6 fix round 1).';
