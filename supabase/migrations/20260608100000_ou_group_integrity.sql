-- ============================================================
-- Migration: OU group integrity
--
-- Adds first-class "group" semantics to campaign organising units:
--   1) is_group_container BOOLEAN on campaign_organising_units — marks a
--      top-level OU as a named group container. Workers are never assigned
--      directly to containers; they are assigned to the member units within.
--   2) ou_group_id INT on campaign_organising_units — FK back to the group
--      container. Member units set this alongside parent_ou_id; standalone
--      units leave it NULL. This denormalises the group relationship to make
--      group queries fast without an extra join.
--   3) Trigger: trg_check_no_worker_on_group_container — prevents workers
--      being assigned directly to group container OUs.
--   4) Trigger: trg_check_worker_ou_group_exclusivity — enforces that a
--      worker can only belong to one group per ou_type per campaign. Moving
--      a worker from one shift-group's units to another shift-group's units
--      requires removing them from the first group first.
--   5) Updated campaign_unit_assignment_summary view to expose the new
--      group columns so UI consumers can render group structure.
-- ============================================================

-- -------------------------------------------------------
-- 1. New columns
-- -------------------------------------------------------

ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS is_group_container BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ou_group_id INT NULL
    REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cou_ou_group
  ON campaign_organising_units (campaign_id, ou_group_id)
  WHERE ou_group_id IS NOT NULL;

COMMENT ON COLUMN campaign_organising_units.is_group_container IS
  'When TRUE this OU is a named group header. Workers cannot be assigned directly '
  'to it; they belong to the member units (rows with ou_group_id = this row''s ou_id). '
  'Created by the group creation flow in the campaign wizard.';

COMMENT ON COLUMN campaign_organising_units.ou_group_id IS
  'FK to the group container OU that owns this member unit. '
  'Always equals parent_ou_id when set. Stored separately so group-membership '
  'queries are fast without distinguishing "group parent" from "arbitrary sub-unit". '
  'NULL for group containers themselves and for standalone units.';

-- Enforce: ou_group_id must agree with parent_ou_id when both are set,
-- and a group container cannot itself reference a group.
CREATE OR REPLACE FUNCTION cou_enforce_group_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- ou_group_id without matching parent_ou_id is invalid.
  IF NEW.ou_group_id IS NOT NULL AND NEW.parent_ou_id IS NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units: ou_group_id (%) requires parent_ou_id to also be set',
      NEW.ou_group_id;
  END IF;

  -- When both are set they must agree.
  IF NEW.ou_group_id IS NOT NULL
     AND NEW.parent_ou_id IS NOT NULL
     AND NEW.ou_group_id <> NEW.parent_ou_id THEN
    RAISE EXCEPTION
      'campaign_organising_units: ou_group_id (%) must equal parent_ou_id (%) when both are set',
      NEW.ou_group_id, NEW.parent_ou_id;
  END IF;

  -- A group container cannot itself be a member of another group.
  IF NEW.is_group_container = TRUE AND NEW.ou_group_id IS NOT NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units: a group container (ou_id %) cannot also be a group member '
      '(ou_group_id is set)', NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cou_enforce_group_consistency ON campaign_organising_units;
CREATE TRIGGER trg_cou_enforce_group_consistency
  BEFORE INSERT OR UPDATE OF is_group_container, ou_group_id, parent_ou_id
  ON campaign_organising_units
  FOR EACH ROW
  EXECUTE FUNCTION cou_enforce_group_consistency();

-- -------------------------------------------------------
-- 2. Trigger: no workers directly on group containers
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION check_no_worker_on_group_container()
RETURNS TRIGGER AS $$
DECLARE
  v_is_container BOOLEAN;
BEGIN
  SELECT is_group_container INTO v_is_container
  FROM campaign_organising_units
  WHERE ou_id = NEW.ou_id;

  IF v_is_container = TRUE THEN
    RAISE EXCEPTION
      'Cannot assign workers directly to group container OU %. '
      'Assign workers to the individual units within the group instead.',
      NEW.ou_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_no_worker_on_group_container ON campaign_worker_ou;
CREATE TRIGGER trg_check_no_worker_on_group_container
  BEFORE INSERT OR UPDATE OF ou_id ON campaign_worker_ou
  FOR EACH ROW
  EXECUTE FUNCTION check_no_worker_on_group_container();

-- -------------------------------------------------------
-- 3. Trigger: worker group exclusivity per ou_type
-- -------------------------------------------------------

-- A worker may only belong to units in ONE group per ou_type per campaign.
-- Moving them to a unit in a different group of the same type requires
-- removing them from the original group's units first.
-- Standalone units (ou_group_id IS NULL) are unaffected by this constraint.

CREATE OR REPLACE FUNCTION check_worker_ou_group_exclusivity()
RETURNS TRIGGER AS $$
DECLARE
  v_new_ou_group_id INT;
  v_new_ou_type     VARCHAR(30);
  v_new_campaign_id INT;
  v_conflict_count  INT;
BEGIN
  -- Look up the target unit's group membership, type, and campaign.
  SELECT ou_group_id, ou_type, campaign_id
    INTO v_new_ou_group_id, v_new_ou_type, v_new_campaign_id
  FROM campaign_organising_units
  WHERE ou_id = NEW.ou_id;

  -- Only enforce for units that are part of a named group.
  IF v_new_ou_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for existing assignments in a DIFFERENT group of the same
  -- ou_type within the same campaign.
  SELECT COUNT(*) INTO v_conflict_count
  FROM campaign_worker_ou cwo
  JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cwo.worker_id = NEW.worker_id
    AND cwo.ou_id    <> NEW.ou_id          -- ignore the row being inserted/updated
    AND cou.campaign_id  = v_new_campaign_id
    AND cou.ou_group_id IS NOT NULL
    AND cou.ou_group_id <> v_new_ou_group_id
    AND cou.ou_type      = v_new_ou_type;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION
      'Worker % is already assigned to a unit in a different % group within this campaign. '
      'Workers can only belong to one group of any given type per campaign. '
      'Remove the worker from their existing % group before reassigning.',
      NEW.worker_id, v_new_ou_type, v_new_ou_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_worker_ou_group_exclusivity ON campaign_worker_ou;
CREATE TRIGGER trg_check_worker_ou_group_exclusivity
  BEFORE INSERT OR UPDATE OF ou_id ON campaign_worker_ou
  FOR EACH ROW
  EXECUTE FUNCTION check_worker_ou_group_exclusivity();

-- -------------------------------------------------------
-- 4. Updated campaign_unit_assignment_summary
-- -------------------------------------------------------

-- Drop and recreate to add ou_group_id + is_group_container columns.
-- The hierarchy summary does not reference this view so CASCADE is safe.
DROP VIEW IF EXISTS campaign_unit_assignment_summary CASCADE;

CREATE VIEW campaign_unit_assignment_summary
WITH (security_invoker = true)
AS
WITH membership AS (
  SELECT campaign_id, worker_id
  FROM campaign_worker_membership
),
ou_assignments AS (
  SELECT
    cou.campaign_id,
    cou.ou_id,
    cou.parent_ou_id,
    cou.ou_group_id,
    cou.is_group_container,
    cou.name    AS ou_name,
    cou.ou_type,
    cou.total_workers_estimated,
    cwo.worker_id
  FROM campaign_organising_units cou
  LEFT JOIN campaign_worker_ou cwo ON cwo.ou_id = cou.ou_id
)
SELECT
  m.campaign_id,
  oa.ou_id,
  oa.parent_ou_id,
  oa.ou_group_id,
  oa.is_group_container,
  oa.ou_name,
  oa.ou_type,
  oa.total_workers_estimated,
  COUNT(DISTINCT m.worker_id) AS allocated_worker_count
FROM membership m
LEFT JOIN ou_assignments oa
  ON oa.campaign_id = m.campaign_id
 AND oa.worker_id   = m.worker_id
GROUP BY
  m.campaign_id,
  oa.ou_id,
  oa.parent_ou_id,
  oa.ou_group_id,
  oa.is_group_container,
  oa.ou_name,
  oa.ou_type,
  oa.total_workers_estimated;

GRANT SELECT ON campaign_unit_assignment_summary TO authenticated;

COMMENT ON VIEW campaign_unit_assignment_summary IS
  'Per (campaign, ou) count of allocated workers. ou_id IS NULL rows represent '
  'the synthetic "Unallocated" bucket (campaign members with no campaign_worker_ou row). '
  'parent_ou_id + ou_group_id + is_group_container surface the OU group structure so '
  'consumers can roll up sub-units into their parent group.';
