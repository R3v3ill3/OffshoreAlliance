-- ============================================================
-- Migration 20260612100000: Standing Campaign + Orphan Migration
--
-- Phase B of the phone-call remediation (docs/PHONE_CALL_REMEDIATION_PLAN.md).
--
-- 1. Adds campaigns.is_standing to flag campaigns that serve as
--    catch-all containers for phone operations not belonging to a
--    specific active campaign.
-- 2. Seeds the "OA Membership Outreach" standing campaign.
-- 3. Extends can_write_to_campaign() to grant write access to
--    standing campaigns for any authenticated user — mirrors the
--    old standalone (campaign_id IS NULL) access level.
-- 4. Snapshots orphan call_scripts and call_lists rows
--    (campaign_id IS NULL) to archive tables as a safety copy.
-- 5. Migrates orphan rows into the standing campaign.
-- 6. Re-imposes NOT NULL on call_scripts.campaign_id and
--    call_lists.campaign_id so no future orphan rows can be created.
-- 7. Simplifies RLS write policies on phone tables to remove the
--    now-dead (campaign_id IS NULL) branch.
-- ============================================================

-- -------------------------------------------------------
-- 1. Add is_standing column to campaigns
-- -------------------------------------------------------
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_standing BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN campaigns.is_standing IS
  'When TRUE this campaign acts as a shared container for phone '
  'operations not belonging to a specific active campaign. '
  'Exactly one standing campaign should exist per organisation.';

CREATE INDEX IF NOT EXISTS idx_campaigns_is_standing
  ON campaigns(is_standing)
  WHERE is_standing = TRUE;

-- -------------------------------------------------------
-- 2. Seed the "OA Membership Outreach" standing campaign
--    (idempotent: only inserts if no standing campaign exists)
-- -------------------------------------------------------
INSERT INTO campaigns (name, campaign_type, status, is_standing)
SELECT 'OA Membership Outreach', 'organising', 'active', TRUE
WHERE NOT EXISTS (SELECT 1 FROM campaigns WHERE is_standing = TRUE);

-- -------------------------------------------------------
-- 3. Extend can_write_to_campaign to include standing campaigns
--
--    Any authenticated user may write to a standing campaign's
--    child resources (scripts, lists, attempts). This mirrors
--    the old standalone (campaign_id IS NULL) access level.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_to_campaign(p_campaign_id integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    -- Standing campaigns are accessible to any authenticated user
    (EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaign_id = p_campaign_id
        AND is_standing = TRUE
    ) AND auth.uid() IS NOT NULL)
    OR is_admin()
    OR is_campaign_creator(p_campaign_id)
    OR is_lead_organiser_for_campaign(p_campaign_id)
    OR is_assigned_to_campaign(p_campaign_id)
    OR has_campaign_edit_permission(p_campaign_id);
$function$;

-- -------------------------------------------------------
-- 4. Snapshot orphan rows before migration
--    (safety copy — the irreversible step follows)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS _archive_orphan_call_scripts_20260612
  AS SELECT * FROM call_scripts WHERE campaign_id IS NULL;

CREATE TABLE IF NOT EXISTS _archive_orphan_call_lists_20260612
  AS SELECT * FROM call_lists WHERE campaign_id IS NULL;

-- -------------------------------------------------------
-- 5. Migrate orphan rows into the standing campaign
-- -------------------------------------------------------
DO $$
DECLARE
  v_standing_id INTEGER;
BEGIN
  SELECT campaign_id INTO v_standing_id
  FROM campaigns
  WHERE is_standing = TRUE
  LIMIT 1;

  IF v_standing_id IS NULL THEN
    RAISE EXCEPTION 'Standing campaign not found — cannot migrate orphan rows';
  END IF;

  UPDATE call_scripts SET campaign_id = v_standing_id WHERE campaign_id IS NULL;
  UPDATE call_lists   SET campaign_id = v_standing_id WHERE campaign_id IS NULL;
END $$;

-- -------------------------------------------------------
-- 6. Re-impose NOT NULL on phone table campaign_id columns
-- -------------------------------------------------------
ALTER TABLE call_scripts ALTER COLUMN campaign_id SET NOT NULL;
ALTER TABLE call_lists   ALTER COLUMN campaign_id SET NOT NULL;

-- -------------------------------------------------------
-- 7. Simplify RLS write policies — remove campaign_id IS NULL branches
-- -------------------------------------------------------

-- ── call_scripts ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_scripts" ON call_scripts;
DROP POLICY IF EXISTS "Can update call_scripts"  ON call_scripts;

CREATE POLICY "Can insert call_scripts"
  ON call_scripts FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));

CREATE POLICY "Can update call_scripts"
  ON call_scripts FOR UPDATE TO authenticated
  USING  (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));

-- ── call_script_sections ──────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_script_sections" ON call_script_sections;
DROP POLICY IF EXISTS "Can update call_script_sections" ON call_script_sections;

CREATE POLICY "Can insert call_script_sections"
  ON call_script_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );

CREATE POLICY "Can update call_script_sections"
  ON call_script_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND can_write_to_campaign(cs.campaign_id)
    )
  );

-- ── call_lists ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_lists" ON call_lists;
DROP POLICY IF EXISTS "Can update call_lists"  ON call_lists;

CREATE POLICY "Can insert call_lists"
  ON call_lists FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));

CREATE POLICY "Can update call_lists"
  ON call_lists FOR UPDATE TO authenticated
  USING  (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));

-- ── call_list_items ───────────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_list_items" ON call_list_items;
DROP POLICY IF EXISTS "Can update call_list_items"  ON call_list_items;

CREATE POLICY "Can insert call_list_items"
  ON call_list_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

CREATE POLICY "Can update call_list_items"
  ON call_list_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

-- ── call_attempts ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_attempts" ON call_attempts;

CREATE POLICY "Can insert call_attempts"
  ON call_attempts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_list_items cli
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE cli.item_id = call_attempts.list_item_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );

-- ── call_step_outcomes ────────────────────────────────────────
DROP POLICY IF EXISTS "Can insert call_step_outcomes" ON call_step_outcomes;

CREATE POLICY "Can insert call_step_outcomes"
  ON call_step_outcomes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_step_outcomes.attempt_id
        AND can_write_to_campaign(cl.campaign_id)
    )
  );
