-- ============================================================
-- Migration: Allow three-level OU nesting under group containers
--
-- The previous rule permitted only two levels (parent → child).
-- This migration relaxes it to three levels specifically when the
-- topmost ancestor is a group container (is_group_container = TRUE).
-- This enables the intended model:
--
--   Level 0: Employer group container (is_group_container=true)
--   Level 1: Vessel / worksite unit   (parent_ou_id → container)
--   Level 2: Shift / crew sub-unit    (parent_ou_id → vessel)
--
-- Standalone non-container parents still follow the old two-level rule
-- (they cannot have their children split further).
--
-- Also updates split_campaign_organising_unit() to allow splitting
-- group-member units (units at level 1 inside a container).
-- ============================================================

-- -------------------------------------------------------
-- 1. Relax hierarchy trigger
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION cou_enforce_hierarchy_invariants()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id       INT;
  v_parent_campaign INT;
  v_parent_is_cont  BOOLEAN;
  v_gp_id           INT;
  v_gp_is_cont      BOOLEAN;
BEGIN
  IF NEW.parent_ou_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch parent row.
  SELECT parent_ou_id, campaign_id, is_group_container
    INTO v_parent_id, v_parent_campaign, v_parent_is_cont
  FROM campaign_organising_units
  WHERE ou_id = NEW.parent_ou_id;

  IF v_parent_campaign IS NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units.parent_ou_id % does not exist', NEW.parent_ou_id;
  END IF;

  IF v_parent_campaign <> NEW.campaign_id THEN
    RAISE EXCEPTION
      'sub-unit (campaign_id=%) cannot reference a parent OU from a different campaign (campaign_id=%)',
      NEW.campaign_id, v_parent_campaign;
  END IF;

  -- Depth-1: parent is top-level → always allowed (depth = 2 total).
  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Depth-2: parent is itself a child. Only allow when the grandparent is a
  -- group container. This permits:  container → unit → sub-unit
  -- but NOT: standalone → sub-unit → sub-sub-unit.
  SELECT parent_ou_id, is_group_container
    INTO v_gp_id, v_gp_is_cont
  FROM campaign_organising_units
  WHERE ou_id = v_parent_id;

  IF v_gp_id IS NOT NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units only supports three levels of nesting (grandparent % is itself a sub-unit)',
      v_parent_id;
  END IF;

  IF NOT v_gp_is_cont THEN
    RAISE EXCEPTION
      'A sub-unit of a sub-unit is only permitted when the top-level ancestor is a group container '
      '(OU % is not a group container)', v_parent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cou_enforce_hierarchy_invariants IS
  'Enforces OU hierarchy invariants on INSERT/UPDATE. '
  'Allows two levels (parent → child) for any top-level unit. '
  'Allows three levels (container → unit → sub-unit) when the top-level unit '
  'is a group container (is_group_container = TRUE). '
  'Prevents cross-campaign references.';

-- -------------------------------------------------------
-- 2. Update split_campaign_organising_unit to allow
--    splitting group-member units (depth-1 in a container)
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION split_campaign_organising_unit(
  p_parent_ou_id INT,
  p_sub_units JSONB,
  p_assignments JSONB,
  p_keep_in_parent BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(sub_index INT, ou_id INT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_campaign_id      INT;
  v_parent_parent_id INT;
  v_gp_is_container  BOOLEAN;
  v_max_display      INT;
  v_record           JSONB;
  v_idx              INT;
  v_new_ou_id        INT;
  v_assigned_workers INT[] := ARRAY[]::INT[];
BEGIN
  -- Validate parent exists and is either:
  --   (a) top-level (parent_ou_id IS NULL), or
  --   (b) a group member whose parent is a group container.
  SELECT cou.campaign_id, cou.parent_ou_id
    INTO v_campaign_id, v_parent_parent_id
  FROM campaign_organising_units AS cou
  WHERE cou.ou_id = p_parent_ou_id;

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'parent OU % not found', p_parent_ou_id;
  END IF;

  IF v_parent_parent_id IS NOT NULL THEN
    -- Allow only if grandparent is a group container (depth-1 in container).
    SELECT is_group_container
      INTO v_gp_is_container
    FROM campaign_organising_units
    WHERE ou_id = v_parent_parent_id;

    IF NOT COALESCE(v_gp_is_container, FALSE) THEN
      RAISE EXCEPTION
        'cannot split OU % — it is a sub-unit of a non-container parent (%); '
        'only top-level OUs or units inside a group container may be split',
        p_parent_ou_id, v_parent_parent_id;
    END IF;
  END IF;

  IF jsonb_typeof(p_sub_units) <> 'array' OR jsonb_array_length(p_sub_units) = 0 THEN
    RAISE EXCEPTION 'p_sub_units must be a non-empty JSONB array';
  END IF;

  -- Find next display_order in this campaign for the new sub-units.
  SELECT COALESCE(MAX(cou2.display_order), -1) + 1
    INTO v_max_display
  FROM campaign_organising_units AS cou2
  WHERE cou2.campaign_id = v_campaign_id;

  -- Pre-allocate the result table (column renamed to avoid shadowing).
  CREATE TEMP TABLE _split_result (sub_index INT, new_ou_id INT) ON COMMIT DROP;

  -- Insert each sub-unit row.
  FOR v_idx IN 0 .. jsonb_array_length(p_sub_units) - 1 LOOP
    v_record := p_sub_units -> v_idx;
    IF v_record IS NULL OR (v_record ->> 'name') IS NULL THEN
      RAISE EXCEPTION 'p_sub_units[%] missing required "name" field', v_idx;
    END IF;

    INSERT INTO campaign_organising_units AS ins (
      campaign_id, parent_ou_id, ou_type, name,
      total_workers_estimated, unit_basis, display_order, source
    )
    VALUES (
      v_campaign_id,
      p_parent_ou_id,
      COALESCE(v_record ->> 'ou_type', 'custom'),
      v_record ->> 'name',
      NULLIF((v_record ->> 'total_workers_estimated'), '')::INT,
      COALESCE(
        v_record -> 'unit_basis',
        jsonb_build_object('parent_ou_id', p_parent_ou_id)
      ),
      v_max_display + v_idx,
      'manual'
    )
    RETURNING ins.ou_id INTO v_new_ou_id;

    INSERT INTO _split_result (sub_index, new_ou_id) VALUES (v_idx, v_new_ou_id);
  END LOOP;

  -- Bulk insert worker assignments. Skip rows that would violate uniqueness.
  IF jsonb_typeof(p_assignments) = 'array' AND jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
    SELECT
      sr.new_ou_id,
      (a ->> 'worker_id')::INT,
      false,
      'manual'
    FROM jsonb_array_elements(p_assignments) AS a
    JOIN _split_result sr ON sr.sub_index = (a ->> 'sub_index')::INT
    ON CONFLICT (ou_id, worker_id) DO NOTHING;

    SELECT ARRAY_AGG(DISTINCT (a ->> 'worker_id')::INT)
      INTO v_assigned_workers
    FROM jsonb_array_elements(p_assignments) AS a;
  END IF;

  -- Optional: strip parent assignments for the assigned workers.
  IF p_keep_in_parent = false AND v_assigned_workers IS NOT NULL THEN
    DELETE FROM campaign_worker_ou AS cwo
    WHERE cwo.ou_id = p_parent_ou_id
      AND cwo.worker_id = ANY(v_assigned_workers);
  END IF;

  RETURN QUERY SELECT sr.sub_index, sr.new_ou_id FROM _split_result sr ORDER BY sr.sub_index;
END;
$$;

COMMENT ON FUNCTION split_campaign_organising_unit IS
  'Atomic split of a top-level OU (or a group-member unit) into N sub-units '
  'with optional bulk worker assignments. '
  'Sub-units are created with parent_ou_id pointing back to the parent. '
  'When keep_in_parent is false, any worker that ended up in at least one '
  'sub-unit is removed from the parent. '
  'p_sub_units shape: [{name, ou_type, unit_basis?, total_workers_estimated?}]. '
  'p_assignments shape: [{sub_index, worker_id}].';

-- Grant unchanged.
GRANT EXECUTE ON FUNCTION split_campaign_organising_unit TO authenticated;

-- -------------------------------------------------------
-- 3. Update childrenByParent UI note: the campaign_unit_hierarchy_summary
--    view already uses a recursive CTE-style union that will pick up
--    depth-2 children automatically — no view change needed.
-- -------------------------------------------------------
