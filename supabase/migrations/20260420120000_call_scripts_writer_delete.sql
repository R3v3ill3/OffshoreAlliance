-- Allow campaign writers and standalone script creators to delete phone scripts
-- (sections cascade; admin-only delete was blocking normal testers).

DROP POLICY IF EXISTS "Admin can delete call_scripts" ON call_scripts;
CREATE POLICY "Can delete call_scripts"
  ON call_scripts FOR DELETE TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

DROP POLICY IF EXISTS "Admin can delete call_script_sections" ON call_script_sections;
CREATE POLICY "Can delete call_script_sections"
  ON call_script_sections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_scripts cs
      WHERE cs.script_id = call_script_sections.script_id
        AND (
          (cs.campaign_id IS NULL AND (cs.created_by = auth.uid() OR is_admin()))
          OR (cs.campaign_id IS NOT NULL AND can_write_to_campaign(cs.campaign_id))
        )
    )
  );
