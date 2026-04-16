-- Allow campaign writers and standalone list creators to delete call lists
-- (items and attempts cascade; admin-only delete blocked normal testers).

DROP POLICY IF EXISTS "Admin can delete call_lists" ON call_lists;
CREATE POLICY "Can delete call_lists"
  ON call_lists FOR DELETE TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

DROP POLICY IF EXISTS "Admin can delete call_list_items" ON call_list_items;
CREATE POLICY "Can delete call_list_items"
  ON call_list_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_items.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );
