-- Deleting an employer group container failed with
--   "campaign_organising_units: ou_group_id (X) requires parent_ou_id to also be set"
-- because the two ON DELETE SET NULL foreign keys (parent_ou_id, ou_group_id) on
-- the sub-units fire as separate updates, and cou_enforce_group_consistency sees
-- the half-cleared intermediate state (parent_ou_id already NULL, ou_group_id still set).
--
-- Detach the children up-front in a single UPDATE (both columns set to NULL
-- together, which the consistency trigger accepts) so the FK cascade has nothing
-- left to do. The app deletes a group's sub-units before the container anyway;
-- this makes any direct container delete safe too.
CREATE OR REPLACE FUNCTION cou_detach_children_before_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE campaign_organising_units
     SET parent_ou_id = NULL, ou_group_id = NULL
   WHERE parent_ou_id = OLD.ou_id
     AND ou_id <> OLD.ou_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cou_detach_children_before_delete ON campaign_organising_units;
CREATE TRIGGER trg_cou_detach_children_before_delete
  BEFORE DELETE ON campaign_organising_units
  FOR EACH ROW
  EXECUTE FUNCTION cou_detach_children_before_delete();
