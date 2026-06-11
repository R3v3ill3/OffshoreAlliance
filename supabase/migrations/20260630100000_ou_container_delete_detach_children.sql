-- Make deleting an employer group container (and whole campaigns that contain
-- groups) safe. Two issues combined to make these deletes fail:
--
--   1) cou_enforce_group_consistency RAISED "ou_group_id (X) requires parent_ou_id
--      to also be set" whenever a sub-unit briefly had ou_group_id set but
--      parent_ou_id NULL — exactly the transient state the parent_ou_id
--      ON DELETE SET NULL produces while a parent group is being deleted.
--
--   2) ou_group_id ALSO had ON DELETE SET NULL, so deleting a parent updated the
--      same child row twice and Postgres raised "tuple to be updated was already
--      modified by an operation triggered by the current command".
--
-- Fix: the consistency trigger now AUTO-CORRECTS the dangling pointer (clears
-- ou_group_id when parent_ou_id is NULL) instead of raising, and the ou_group_id
-- FK becomes ON DELETE NO ACTION (the trigger already clears it, so the FK only
-- needs to guarantee referential integrity). This is idempotent.
--
-- NOTE: an earlier revision of this migration created a BEFORE DELETE trigger
-- (trg_cou_detach_children_before_delete) that itself broke cascade deletes;
-- drop it here if present.

DROP TRIGGER IF EXISTS trg_cou_detach_children_before_delete ON campaign_organising_units;
DROP FUNCTION IF EXISTS cou_detach_children_before_delete();

CREATE OR REPLACE FUNCTION cou_enforce_group_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- A dangling ou_group_id (group set, no parent) is only reachable while a
  -- parent group is being deleted. Clear it rather than rejecting the delete.
  IF NEW.ou_group_id IS NOT NULL AND NEW.parent_ou_id IS NULL THEN
    NEW.ou_group_id := NULL;
  END IF;

  IF NEW.ou_group_id IS NOT NULL
     AND NEW.parent_ou_id IS NOT NULL
     AND NEW.ou_group_id <> NEW.parent_ou_id THEN
    RAISE EXCEPTION
      'campaign_organising_units: ou_group_id (%) must equal parent_ou_id (%) when both are set',
      NEW.ou_group_id, NEW.parent_ou_id;
  END IF;

  IF NEW.is_group_container = TRUE AND NEW.ou_group_id IS NOT NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units: a group container (ou_id %) cannot also be a group member',
      NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE campaign_organising_units
  DROP CONSTRAINT IF EXISTS campaign_organising_units_ou_group_id_fkey;
ALTER TABLE campaign_organising_units
  ADD CONSTRAINT campaign_organising_units_ou_group_id_fkey
  FOREIGN KEY (ou_group_id) REFERENCES campaign_organising_units(ou_id) ON DELETE NO ACTION;
