-- Allow campaign writers (not only admins) to delete campaign activities and CASCADE
-- descendants: ratings, task lists, items, leader tokens.

DROP POLICY IF EXISTS "Admin can delete campaign_activities" ON campaign_activities;
CREATE POLICY "Can delete campaign_activities"
  ON campaign_activities FOR DELETE TO authenticated
  USING (can_write_to_campaign(campaign_id) OR is_admin());

DROP POLICY IF EXISTS "Admin can delete campaign_activity_ratings" ON campaign_activity_ratings;
CREATE POLICY "Can delete campaign_activity_ratings"
  ON campaign_activity_ratings FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = campaign_activity_ratings.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

DROP POLICY IF EXISTS "Admin can delete campaign_task_lists" ON campaign_task_lists;
CREATE POLICY "Can delete campaign_task_lists"
  ON campaign_task_lists FOR DELETE TO authenticated
  USING (can_write_to_campaign(campaign_id) OR is_admin());

DROP POLICY IF EXISTS "Admin can delete campaign_task_list_items" ON campaign_task_list_items;
CREATE POLICY "Can delete campaign_task_list_items"
  ON campaign_task_list_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_task_lists tl
      WHERE tl.task_list_id = campaign_task_list_items.task_list_id
        AND (can_write_to_campaign(tl.campaign_id) OR is_admin())
    )
  );

DROP POLICY IF EXISTS "Admin can delete campaign_leader_tokens" ON campaign_leader_tokens;
CREATE POLICY "Can delete campaign_leader_tokens"
  ON campaign_leader_tokens FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_task_lists tl
      WHERE tl.task_list_id = campaign_leader_tokens.task_list_id
        AND (can_write_to_campaign(tl.campaign_id) OR is_admin())
    )
  );
