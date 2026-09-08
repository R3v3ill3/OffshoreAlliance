-- ============================================================
-- Fix: split_campaign_organising_unit column ambiguity
--
-- RETURNS TABLE(... ou_id INT) creates a PL/pgSQL output variable
-- also named "ou_id", which PostgreSQL 17 treats as ambiguous with
-- the ou_id column name in SQL statements inside the function body.
-- This rewrite qualifies all ambiguous column references with table
-- aliases so the function executes cleanly.
-- ============================================================

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
  v_campaign_id INT;
  v_parent_parent_id INT;
  v_max_display INT;
  v_record JSONB;
  v_idx INT;
  v_new_ou_id INT;
  v_assigned_workers INT[] := ARRAY[]::INT[];
BEGIN
  -- Validate parent exists and is top-level.
  -- Use table alias "p" to avoid ambiguity with the RETURNS TABLE output
  -- variable also named "ou_id".
  SELECT p.campaign_id, p.parent_ou_id
    INTO v_campaign_id, v_parent_parent_id
  FROM campaign_organising_units AS p
  WHERE p.ou_id = p_parent_ou_id;

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'parent OU % not found', p_parent_ou_id;
  END IF;

  IF v_parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot split sub-unit % (only top-level OUs may be split)', p_parent_ou_id;
  END IF;

  IF jsonb_typeof(p_sub_units) <> 'array' OR jsonb_array_length(p_sub_units) = 0 THEN
    RAISE EXCEPTION 'p_sub_units must be a non-empty JSONB array';
  END IF;

  -- Find next display_order in this campaign for the new sub-units.
  SELECT COALESCE(MAX(p2.display_order), -1) + 1
    INTO v_max_display
  FROM campaign_organising_units AS p2
  WHERE p2.campaign_id = v_campaign_id;

  -- Pre-allocate the result table using a column name that doesn't clash.
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

GRANT EXECUTE ON FUNCTION split_campaign_organising_unit TO authenticated;
