-- ============================================================
-- Migration 20260415100000: Phone Wizard Standalone Support
--
-- Makes campaign_id nullable on call_scripts and call_lists so
-- scripts and call lists can be created outside of a campaign
-- (e.g. via the standalone Phone Wizard).
--
-- RLS policies are updated to allow:
--   - Any authenticated user to INSERT when campaign_id IS NULL
--   - The creator (created_by = auth.uid()) or an admin to UPDATE
--     standalone records
--   - Existing campaign-linked records: unchanged behaviour via
--     can_write_to_campaign()
-- ============================================================

-- -------------------------------------------------------
-- 1. Relax NOT NULL constraints
-- -------------------------------------------------------
ALTER TABLE call_scripts ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE call_lists   ALTER COLUMN campaign_id DROP NOT NULL;

-- -------------------------------------------------------
-- 2. call_scripts — drop old write policies, add new ones
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_scripts" ON call_scripts;
DROP POLICY IF EXISTS "Campaign writers can update call_scripts"  ON call_scripts;

CREATE POLICY "Can insert call_scripts"
  ON call_scripts FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NULL AND auth.uid() IS NOT NULL)
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

CREATE POLICY "Can update call_scripts"
  ON call_scripts FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  )
  WITH CHECK (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

-- -------------------------------------------------------
-- 3. call_script_sections — drop old write policies, add new ones
--    (they derive write access from the parent script)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_script_sections" ON call_script_sections;
DROP POLICY IF EXISTS "Campaign writers can update call_script_sections" ON call_script_sections;

CREATE POLICY "Can insert call_script_sections"
  ON call_script_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND (
          (cs.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (cs.campaign_id IS NOT NULL AND can_write_to_campaign(cs.campaign_id))
        )
    )
  );

CREATE POLICY "Can update call_script_sections"
  ON call_script_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND (
          (cs.campaign_id IS NULL AND (cs.created_by = auth.uid() OR is_admin()))
          OR (cs.campaign_id IS NOT NULL AND can_write_to_campaign(cs.campaign_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND (
          (cs.campaign_id IS NULL AND (cs.created_by = auth.uid() OR is_admin()))
          OR (cs.campaign_id IS NOT NULL AND can_write_to_campaign(cs.campaign_id))
        )
    )
  );

-- -------------------------------------------------------
-- 4. call_lists — drop old write policies, add new ones
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_lists" ON call_lists;
DROP POLICY IF EXISTS "Campaign writers can update call_lists" ON call_lists;

CREATE POLICY "Can insert call_lists"
  ON call_lists FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NULL AND auth.uid() IS NOT NULL)
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

CREATE POLICY "Can update call_lists"
  ON call_lists FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  )
  WITH CHECK (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

-- -------------------------------------------------------
-- 5. call_list_items — drop old write policies, add new ones
--    (they derive write access from the parent list)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_list_items" ON call_list_items;
DROP POLICY IF EXISTS "Campaign writers can update call_list_items" ON call_list_items;

CREATE POLICY "Can insert call_list_items"
  ON call_list_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND (
          (cl.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

CREATE POLICY "Can update call_list_items"
  ON call_list_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

-- -------------------------------------------------------
-- 6. call_attempts — drop old INSERT policy, add new one
--    (standalone lists have no campaign → allow based on list ownership)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_attempts" ON call_attempts;

CREATE POLICY "Can insert call_attempts"
  ON call_attempts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_list_items cli
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE cli.item_id = call_attempts.list_item_id
        AND (
          (cl.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

-- -------------------------------------------------------
-- 7. call_step_outcomes — drop old INSERT policy, add new one
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Campaign writers can insert call_step_outcomes" ON call_step_outcomes;

CREATE POLICY "Can insert call_step_outcomes"
  ON call_step_outcomes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_attempts ca
      JOIN call_list_items cli ON cli.item_id = ca.list_item_id
      JOIN call_lists cl ON cl.list_id = cli.list_id
      WHERE ca.attempt_id = call_step_outcomes.attempt_id
        AND (
          (cl.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );
