-- ============================================================
-- Migration: OU hierarchy + typed worker dimensions
--
-- Adds:
--   1) parent_ou_id on campaign_organising_units (one level of nesting)
--      with a trigger enforcing max-depth = 2 and indexes.
--   2) Reference tables for shift / work_area / roster_panel options
--      (mirroring the canonical_occupation_id / occupations pattern).
--   3) Nullable shift_id / work_area_id / roster_panel_id FKs on workers.
--   4) split_campaign_organising_unit() RPC for atomic split operations.
--   5) Updated campaign_unit_assignment_summary view exposing parent_ou_id
--      + new campaign_unit_hierarchy_summary view for parent roll-ups.
--   6) RLS policies for the new tables (read-all, admin/user write,
--      admin delete) following the existing convention.
-- ============================================================

-- -------------------------------------------------------
-- 1. OU hierarchy
-- -------------------------------------------------------

ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS parent_ou_id INT NULL
    REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL;

ALTER TABLE campaign_organising_units
  DROP CONSTRAINT IF EXISTS campaign_organising_units_parent_self_check;
ALTER TABLE campaign_organising_units
  ADD CONSTRAINT campaign_organising_units_parent_self_check
  CHECK (parent_ou_id IS NULL OR parent_ou_id <> ou_id);

CREATE INDEX IF NOT EXISTS idx_cou_parent
  ON campaign_organising_units (campaign_id, parent_ou_id, display_order);

COMMENT ON COLUMN campaign_organising_units.parent_ou_id IS
  'Optional FK to another OU in the SAME campaign that owns this row as a sub-unit. '
  'Sub-units inherit campaign_id from the parent; workers in a sub-unit typically '
  'remain assigned to the parent too via campaign_worker_ou (roll-up model). '
  'Limited to 2 levels (parent has parent_ou_id IS NULL) by trg_cou_enforce_two_level_depth.';

-- Enforce max-depth = 2 (parent of a sub-unit must itself be top-level).
-- Also forbid sub-unit referencing a parent in a different campaign.
CREATE OR REPLACE FUNCTION cou_enforce_hierarchy_invariants()
RETURNS TRIGGER AS $$
DECLARE
  parent_parent_id INT;
  parent_campaign_id INT;
BEGIN
  IF NEW.parent_ou_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT parent_ou_id, campaign_id
    INTO parent_parent_id, parent_campaign_id
  FROM campaign_organising_units
  WHERE ou_id = NEW.parent_ou_id;

  IF parent_campaign_id IS NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units.parent_ou_id % does not exist', NEW.parent_ou_id;
  END IF;

  IF parent_campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION
      'sub-unit (campaign_id=%) cannot reference a parent OU from a different campaign (campaign_id=%)',
      NEW.campaign_id, parent_campaign_id;
  END IF;

  IF parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION
      'campaign_organising_units only supports one level of nesting (parent OU % is itself a sub-unit of %)',
      NEW.parent_ou_id, parent_parent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cou_enforce_two_level_depth ON campaign_organising_units;
CREATE TRIGGER trg_cou_enforce_two_level_depth
  BEFORE INSERT OR UPDATE OF parent_ou_id, campaign_id
  ON campaign_organising_units
  FOR EACH ROW
  EXECUTE FUNCTION cou_enforce_hierarchy_invariants();

-- -------------------------------------------------------
-- 2. Worker typed dimension lookups
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS worker_shift_options (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,
  employer_id     INT NULL REFERENCES employers(employer_id) ON DELETE SET NULL,
  worksite_id     INT NULL REFERENCES worksites(worksite_id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_worker_shift_options_updated_at
  BEFORE UPDATE ON worker_shift_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS worker_shift_options_scoped_name_uq
  ON worker_shift_options (
    (lower(trim(name))),
    COALESCE(employer_id, 0),
    COALESCE(worksite_id, 0)
  );

CREATE INDEX IF NOT EXISTS idx_worker_shift_options_employer
  ON worker_shift_options(employer_id);
CREATE INDEX IF NOT EXISTS idx_worker_shift_options_worksite
  ON worker_shift_options(worksite_id);

COMMENT ON TABLE worker_shift_options IS
  'Reusable shift labels (e.g. "Day", "Night", "12hr Day") that can be assigned to workers.shift_id. '
  'Optionally scoped to an employer or worksite when a name only applies in that context.';

CREATE TABLE IF NOT EXISTS worker_work_area_options (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,
  employer_id     INT NULL REFERENCES employers(employer_id) ON DELETE SET NULL,
  worksite_id     INT NULL REFERENCES worksites(worksite_id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_worker_work_area_options_updated_at
  BEFORE UPDATE ON worker_work_area_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS worker_work_area_options_scoped_name_uq
  ON worker_work_area_options (
    (lower(trim(name))),
    COALESCE(employer_id, 0),
    COALESCE(worksite_id, 0)
  );

CREATE INDEX IF NOT EXISTS idx_worker_work_area_options_employer
  ON worker_work_area_options(employer_id);
CREATE INDEX IF NOT EXISTS idx_worker_work_area_options_worksite
  ON worker_work_area_options(worksite_id);

COMMENT ON TABLE worker_work_area_options IS
  'Reusable work area / department labels assigned via workers.work_area_id.';

CREATE TABLE IF NOT EXISTS worker_roster_panel_options (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,
  employer_id     INT NULL REFERENCES employers(employer_id) ON DELETE SET NULL,
  worksite_id     INT NULL REFERENCES worksites(worksite_id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_worker_roster_panel_options_updated_at
  BEFORE UPDATE ON worker_roster_panel_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS worker_roster_panel_options_scoped_name_uq
  ON worker_roster_panel_options (
    (lower(trim(name))),
    COALESCE(employer_id, 0),
    COALESCE(worksite_id, 0)
  );

CREATE INDEX IF NOT EXISTS idx_worker_roster_panel_options_employer
  ON worker_roster_panel_options(employer_id);
CREATE INDEX IF NOT EXISTS idx_worker_roster_panel_options_worksite
  ON worker_roster_panel_options(worksite_id);

COMMENT ON TABLE worker_roster_panel_options IS
  'Reusable roster / panel / crew labels assigned via workers.roster_panel_id.';

-- -------------------------------------------------------
-- 3. Workers table: typed dimension columns
-- -------------------------------------------------------

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS shift_id INT NULL
    REFERENCES worker_shift_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_area_id INT NULL
    REFERENCES worker_work_area_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS roster_panel_id INT NULL
    REFERENCES worker_roster_panel_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_shift ON workers(shift_id);
CREATE INDEX IF NOT EXISTS idx_workers_work_area ON workers(work_area_id);
CREATE INDEX IF NOT EXISTS idx_workers_roster_panel ON workers(roster_panel_id);

-- -------------------------------------------------------
-- 4. Updated views: parent_ou_id + hierarchy roll-up
-- -------------------------------------------------------

CREATE OR REPLACE VIEW campaign_unit_assignment_summary
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
    cou.name AS ou_name,
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
  oa.ou_name,
  oa.ou_type,
  oa.total_workers_estimated,
  COUNT(DISTINCT m.worker_id) AS allocated_worker_count
FROM membership m
LEFT JOIN ou_assignments oa
  ON oa.campaign_id = m.campaign_id
 AND oa.worker_id = m.worker_id
GROUP BY m.campaign_id, oa.ou_id, oa.parent_ou_id, oa.ou_name, oa.ou_type, oa.total_workers_estimated;

GRANT SELECT ON campaign_unit_assignment_summary TO authenticated;

COMMENT ON VIEW campaign_unit_assignment_summary IS
  'Per (campaign, ou) count of allocated workers. ou_id IS NULL rows represent the synthetic '
  '"Unallocated" bucket. parent_ou_id surfaces the OU hierarchy so consumers can roll up '
  'sub-units into their parent.';

-- Per-parent roll-up: distinct workers across the parent itself plus all children.
CREATE OR REPLACE VIEW campaign_unit_hierarchy_summary
WITH (security_invoker = true)
AS
WITH parent_descendants AS (
  -- A parent's "scope" is itself plus its direct children (one-level nesting).
  SELECT
    p.campaign_id,
    p.ou_id AS parent_ou_id,
    p.ou_id AS scope_ou_id
  FROM campaign_organising_units p
  WHERE p.parent_ou_id IS NULL
  UNION ALL
  SELECT
    c.campaign_id,
    c.parent_ou_id AS parent_ou_id,
    c.ou_id AS scope_ou_id
  FROM campaign_organising_units c
  WHERE c.parent_ou_id IS NOT NULL
)
SELECT
  p.campaign_id,
  p.ou_id AS parent_ou_id,
  p.name AS parent_name,
  p.ou_type AS parent_ou_type,
  COALESCE(child_counts.child_count, 0) AS child_count,
  COALESCE(child_counts.child_ou_ids, ARRAY[]::INT[]) AS child_ou_ids,
  COUNT(DISTINCT cwo.worker_id) AS aggregate_assigned_workers
FROM campaign_organising_units p
LEFT JOIN parent_descendants pd
  ON pd.parent_ou_id = p.ou_id
LEFT JOIN campaign_worker_ou cwo
  ON cwo.ou_id = pd.scope_ou_id
LEFT JOIN (
  SELECT
    parent_ou_id,
    COUNT(*) AS child_count,
    ARRAY_AGG(ou_id ORDER BY display_order, ou_id) AS child_ou_ids
  FROM campaign_organising_units
  WHERE parent_ou_id IS NOT NULL
  GROUP BY parent_ou_id
) child_counts ON child_counts.parent_ou_id = p.ou_id
WHERE p.parent_ou_id IS NULL
GROUP BY
  p.campaign_id, p.ou_id, p.name, p.ou_type,
  child_counts.child_count, child_counts.child_ou_ids;

GRANT SELECT ON campaign_unit_hierarchy_summary TO authenticated;

COMMENT ON VIEW campaign_unit_hierarchy_summary IS
  'Per top-level OU: number of direct sub-units, ordered child OU ids, and the count of distinct '
  'workers assigned across the parent + all sub-units. Used by the wall chart and Universe units '
  'tree to render parent roll-ups.';

-- -------------------------------------------------------
-- 5. split_campaign_organising_unit() RPC
-- -------------------------------------------------------

-- Atomic split: insert N sub-unit rows under p_parent_ou_id and bulk-assign
-- workers to those sub-units. Optionally strip the parent's existing
-- assignments for those workers (keep_in_parent = false) when the user
-- wants the parent to dissolve into its sub-units.
--
-- Inputs:
--   p_parent_ou_id    The OU being split (must be top-level: parent_ou_id IS NULL).
--   p_sub_units       JSONB array of {name, ou_type, unit_basis?, total_workers_estimated?}.
--                     Index of each entry maps to "sub_index" in p_assignments.
--   p_assignments     JSONB array of {sub_index: int, worker_id: int}.
--   p_keep_in_parent  If false, deletes the parent's existing campaign_worker_ou rows
--                     for any worker that ended up in at least one sub-unit.
--
-- Returns: TABLE(sub_index INT, ou_id INT) — mapping of input index to created OU id.

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
  SELECT campaign_id, parent_ou_id
    INTO v_campaign_id, v_parent_parent_id
  FROM campaign_organising_units
  WHERE ou_id = p_parent_ou_id;

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
  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_max_display
  FROM campaign_organising_units
  WHERE campaign_id = v_campaign_id;

  -- Pre-allocate the result table.
  CREATE TEMP TABLE _split_result (sub_index INT, ou_id INT) ON COMMIT DROP;

  -- Insert each sub-unit row.
  FOR v_idx IN 0 .. jsonb_array_length(p_sub_units) - 1 LOOP
    v_record := p_sub_units -> v_idx;
    IF v_record IS NULL OR (v_record ->> 'name') IS NULL THEN
      RAISE EXCEPTION 'p_sub_units[%] missing required "name" field', v_idx;
    END IF;

    INSERT INTO campaign_organising_units (
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
    RETURNING ou_id INTO v_new_ou_id;

    INSERT INTO _split_result (sub_index, ou_id) VALUES (v_idx, v_new_ou_id);
  END LOOP;

  -- Bulk insert worker assignments. Skip rows that would violate uniqueness.
  IF jsonb_typeof(p_assignments) = 'array' AND jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO campaign_worker_ou (ou_id, worker_id, is_primary, assignment_source)
    SELECT
      sr.ou_id,
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
    DELETE FROM campaign_worker_ou
    WHERE ou_id = p_parent_ou_id
      AND worker_id = ANY(v_assigned_workers);
  END IF;

  RETURN QUERY SELECT sr.sub_index, sr.ou_id FROM _split_result sr ORDER BY sr.sub_index;
END;
$$;

COMMENT ON FUNCTION split_campaign_organising_unit IS
  'Atomic split of a top-level OU into N sub-units with optional bulk worker assignments. '
  'Sub-units are created with parent_ou_id pointing back to the parent. When keep_in_parent '
  'is false, any worker that ended up in at least one sub-unit is removed from the parent. '
  'p_sub_units shape: [{name, ou_type, unit_basis?, total_workers_estimated?}]. '
  'p_assignments shape: [{sub_index, worker_id}].';

GRANT EXECUTE ON FUNCTION split_campaign_organising_unit TO authenticated;

-- -------------------------------------------------------
-- 6. RLS for new tables
-- -------------------------------------------------------

ALTER TABLE worker_shift_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_work_area_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_roster_panel_options ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'worker_shift_options',
      'worker_work_area_options',
      'worker_roster_panel_options'
    ])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "Authenticated users can read %1$s" ON %1$s FOR SELECT TO authenticated USING (true)',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Admin/User can insert %1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Admin/User can update %1$s" ON %1$s FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "Admin can delete %1$s" ON %1$s FOR DELETE TO authenticated USING (get_user_role() = ''admin'')',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- -------------------------------------------------------
-- 7. campaign_unit_rules: extend dimension list with roster_panel
-- -------------------------------------------------------

ALTER TABLE campaign_unit_rules
  DROP CONSTRAINT IF EXISTS campaign_unit_rules_dimension_type_check;

ALTER TABLE campaign_unit_rules
  ADD CONSTRAINT campaign_unit_rules_dimension_type_check
  CHECK (dimension_type IN (
    'employer',
    'worksite',
    'occupation',
    'occupation_grouping',
    'shift',
    'work_area',
    'roster_panel',
    'relational'
  ));

COMMENT ON COLUMN campaign_unit_rules.value_int IS
  'For employer/worksite rules: FK id to that table. For shift/work_area/roster_panel: '
  'preferred typed-column id (worker_shift_options.id / worker_work_area_options.id / '
  'worker_roster_panel_options.id). When NULL, value_text is used as a fallback against '
  'worker_tags.';
