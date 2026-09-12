-- WP2.1 placement cleanup under future-group semantics.
-- Block 1 persists ID-only planned/unresolved diagnostic rows.
-- Block 2 logs every promotion/deletion, never changes assignment_source, and
-- marks planned rows applied only in the same transaction as a successful change.

-- ===========================================================================
-- BLOCK 1: validate mappings and persist unresolved partitions
-- ===========================================================================

BEGIN;

-- A future production operator must add SET LOCAL oux.env = 'production';
-- immediately after this BEGIN in the same submission.
DO $environment_guard$
DECLARE
  v_valid boolean;
BEGIN
  IF to_regclass('public._oux_env_marker') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) = 1 AND bool_and(env IN (''clone'', ''dev'')) FROM public._oux_env_marker'
      INTO v_valid;
    IF v_valid THEN RETURN; END IF;
    RAISE EXCEPTION 'Refusing to run: _oux_env_marker is not a valid clone/dev singleton';
  END IF;
  IF current_setting('oux.env', true) = 'production' THEN RETURN; END IF;
  RAISE EXCEPTION
    'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction';
END;
$environment_guard$;

DO $required_objects$
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL
     OR to_regclass('public._oux_wp21_placement_mapping') IS NULL
  THEN
    RAISE EXCEPTION '03b requires _oux_hygiene_log and _oux_wp21_placement_mapping';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public._oux_hygiene_log
    WHERE script = '03b_resolve_future_group_conflicts'
      AND table_name = 'campaign_worker_ou'
      AND action IN ('delete', 'update')
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION
      '03b STOP: an applied cleanup has active audit rows; run 03b_rollback before reapplying';
  END IF;
END;
$required_objects$;

DO $conflict_table_version$
DECLARE
  v_mismatches bigint;
BEGIN
  IF to_regclass('public._oux_wp21_conflicts') IS NULL THEN
    RETURN;
  END IF;

  WITH expected(attname, atttypid, attnotnull) AS (
    VALUES
      ('campaign_id', 'pg_catalog.int4'::regtype::oid, true),
      ('fgk', 'pg_catalog.text'::regtype::oid, true),
      ('worker_id', 'pg_catalog.int4'::regtype::oid, true),
      ('rows', 'pg_catalog.jsonb'::regtype::oid, true),
      ('status', 'pg_catalog.text'::regtype::oid, true),
      ('detected_at', 'pg_catalog.timestamptz'::regtype::oid, true),
      ('applied_at', 'pg_catalog.timestamptz'::regtype::oid, false),
      ('rolled_back_at', 'pg_catalog.timestamptz'::regtype::oid, false)
  ),
  actual AS (
    SELECT attname::text, atttypid, attnotnull
    FROM pg_attribute
    WHERE attrelid = 'public._oux_wp21_conflicts'::regclass
      AND attnum > 0
      AND NOT attisdropped
  )
  SELECT count(*) INTO v_mismatches
  FROM expected
  FULL JOIN actual USING (attname)
  WHERE expected.attname IS NULL
     OR actual.attname IS NULL
     OR expected.atttypid IS DISTINCT FROM actual.atttypid
     OR expected.attnotnull IS DISTINCT FROM actual.attnotnull;

  IF v_mismatches <> 0
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public._oux_wp21_conflicts'::regclass
         AND conname = '_oux_wp21_conflicts_pkey'
         AND contype = 'p'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public._oux_wp21_conflicts'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%rolled_back%'
     )
  THEN
    RAISE EXCEPTION
      '03b STOP: _oux_wp21_conflicts has a stale pre-round-1 schema; review and recreate the helper before rerunning';
  END IF;
END;
$conflict_table_version$;

CREATE TABLE IF NOT EXISTS public._oux_wp21_conflicts (
  campaign_id integer NOT NULL,
  fgk text NOT NULL,
  worker_id integer NOT NULL,
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  status text NOT NULL
    CHECK (status IN ('unresolved', 'planned', 'applied', 'rolled_back')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  CONSTRAINT _oux_wp21_conflicts_pkey PRIMARY KEY (campaign_id, fgk, worker_id)
);
ALTER TABLE public._oux_wp21_conflicts OWNER TO postgres;
ALTER TABLE public._oux_wp21_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._oux_wp21_conflicts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._oux_wp21_conflicts TO service_role;

DROP TABLE IF EXISTS pg_temp._wp21_03b_unit_facts;
DROP TABLE IF EXISTS pg_temp._wp21_03b_row_facts;
DROP TABLE IF EXISTS pg_temp._wp21_03b_h9;
DROP TABLE IF EXISTS pg_temp._wp21_03b_resolution;

CREATE TEMP TABLE _wp21_03b_unit_facts ON COMMIT PRESERVE ROWS AS
WITH type_map(ou_type, kind) AS (
  VALUES
    ('worksite', 'worksite'),
    ('employer', 'employer'),
    ('shift', 'shift'),
    ('crew_rotation', 'crew'),
    ('job_type', 'occupation'),
    ('work_area', 'work_area'),
    ('department', 'custom'),
    ('custom', 'custom'),
    ('network', 'custom'),
    ('ethnic_community', 'custom'),
    ('accommodation', 'custom')
)
SELECT
  cou.ou_id,
  cou.campaign_id,
  cou.is_group_container,
  -- FGK-EXPRESSION-BEGIN
  CASE
    WHEN cou.is_group_container AND map.kind = 'custom' THEN NULL
    WHEN map.kind <> 'custom' THEN 'kind:' || map.kind
    WHEN parent.ou_id IS NOT NULL
      AND parent.is_group_container
      AND parent_map.kind = 'custom'
      THEN 'source:' || parent.ou_id::text
    ELSE 'type:' || cou.ou_type::text
  END
  -- FGK-EXPRESSION-END
  AS fgk,
  CASE
    WHEN (cou.unit_basis ->> 'employer_id') ~ '^[0-9]+$' THEN
      CASE
        WHEN (cou.unit_basis ->> 'employer_id')::numeric BETWEEN 1 AND 2147483647
          THEN (cou.unit_basis ->> 'employer_id')::integer
      END
  END AS employer_id,
  CASE
    WHEN (cou.unit_basis ->> 'worksite_id') ~ '^[0-9]+$' THEN
      CASE
        WHEN (cou.unit_basis ->> 'worksite_id')::numeric BETWEEN 1 AND 2147483647
          THEN (cou.unit_basis ->> 'worksite_id')::integer
      END
  END AS worksite_id,
  (cou.unit_basis -> 'auto_match') IS DISTINCT FROM 'false'::jsonb AS auto_match_enabled
FROM public.campaign_organising_units AS cou
JOIN type_map AS map ON map.ou_type = cou.ou_type
LEFT JOIN public.campaign_organising_units AS parent ON parent.ou_id = cou.ou_group_id
LEFT JOIN type_map AS parent_map ON parent_map.ou_type = parent.ou_type;

DO $mapping_complete$
BEGIN
  IF (SELECT count(*) FROM _wp21_03b_unit_facts)
     <> (SELECT count(*) FROM public.campaign_organising_units)
  THEN
    RAISE EXCEPTION '03b cannot map every ou_type to a future group key';
  END IF;
END;
$mapping_complete$;

CREATE TEMP TABLE _wp21_03b_row_facts ON COMMIT PRESERVE ROWS AS
WITH raw_row_facts AS (
  SELECT
    cwo.id,
    cwo.ou_id,
    cwo.worker_id,
    cwo.is_primary,
    cwo.assignment_source,
    uf.campaign_id,
    uf.fgk,
    (uf.employer_id IS NOT NULL)::integer
      + (uf.worksite_id IS NOT NULL)::integer AS basis_specificity,
    uf.auto_match_enabled
      AND (uf.employer_id IS NOT NULL OR uf.worksite_id IS NOT NULL)
      AND (uf.employer_id IS NULL OR uf.employer_id = w.employer_id)
      AND (uf.worksite_id IS NULL OR uf.worksite_id = w.worksite_id) AS raw_dim_match,
    cwo.assignment_source = 'rule'
      AND EXISTS (
        SELECT 1
        FROM public.campaign_unit_rules AS cur
        WHERE cur.ou_id = cwo.ou_id
          AND cur.campaign_id = uf.campaign_id
      ) AS attributable_rule
  FROM public.campaign_worker_ou AS cwo
  JOIN _wp21_03b_unit_facts AS uf ON uf.ou_id = cwo.ou_id
  JOIN public.workers AS w ON w.worker_id = cwo.worker_id
  WHERE uf.fgk IS NOT NULL
),
ranked_row_facts AS (
  SELECT
    raw_row_facts.*,
    -- SPECIFICITY-RANKING-BEGIN
    max(basis_specificity) FILTER (WHERE raw_dim_match) OVER (
      PARTITION BY campaign_id, fgk, worker_id
    )
    -- SPECIFICITY-RANKING-END
      AS maximum_matching_specificity
  FROM raw_row_facts
)
SELECT
  ranked_row_facts.*,
  raw_dim_match
    AND basis_specificity = maximum_matching_specificity AS dim_match
FROM ranked_row_facts;

CREATE TEMP TABLE _wp21_03b_h9 ON COMMIT PRESERVE ROWS AS
SELECT campaign_id, fgk, worker_id
FROM _wp21_03b_row_facts
GROUP BY campaign_id, fgk, worker_id
HAVING count(*) > 1;

-- Stale mappings are printed and then rejected.
SELECT
  mapping.campaign_id,
  mapping.fgk,
  mapping.worker_id,
  mapping.keep_ou_id
FROM public._oux_wp21_placement_mapping AS mapping
LEFT JOIN _wp21_03b_h9 AS h9 USING (campaign_id, fgk, worker_id)
LEFT JOIN _wp21_03b_row_facts AS kept
  ON kept.campaign_id = mapping.campaign_id
 AND kept.fgk = mapping.fgk
 AND kept.worker_id = mapping.worker_id
 AND kept.ou_id = mapping.keep_ou_id
WHERE h9.worker_id IS NULL
   OR (mapping.keep_ou_id IS NOT NULL AND kept.id IS NULL)
ORDER BY mapping.campaign_id, mapping.fgk, mapping.worker_id;

DO $mapping_validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public._oux_wp21_placement_mapping AS mapping
    LEFT JOIN _wp21_03b_h9 AS h9 USING (campaign_id, fgk, worker_id)
    LEFT JOIN _wp21_03b_row_facts AS kept
      ON kept.campaign_id = mapping.campaign_id
     AND kept.fgk = mapping.fgk
     AND kept.worker_id = mapping.worker_id
     AND kept.ou_id = mapping.keep_ou_id
    WHERE h9.worker_id IS NULL
       OR (mapping.keep_ou_id IS NOT NULL AND kept.id IS NULL)
  ) THEN
    RAISE EXCEPTION '03b STOP: placement mapping is stale or keep_ou_id is outside its partition';
  END IF;
END;
$mapping_validation$;

CREATE TEMP TABLE _wp21_03b_resolution ON COMMIT PRESERVE ROWS AS
WITH summary AS (
  SELECT
    h9.campaign_id,
    h9.fgk,
    h9.worker_id,
    count(*) AS placement_rows,
    count(*) FILTER (WHERE rf.dim_match) AS dimension_matches,
    min(rf.id) FILTER (WHERE rf.dim_match) AS dimension_keeper_id,
    count(*) FILTER (WHERE rf.attributable_rule AND NOT rf.dim_match)
      AS attributable_nonmatching_rule_rows,
    count(*) FILTER (WHERE rf.is_primary) AS primary_rows,
    min(rf.id) FILTER (WHERE rf.is_primary) AS primary_keeper_id,
    count(*) FILTER (WHERE rf.assignment_source = 'manual') AS manual_rows,
    min(rf.id) FILTER (WHERE rf.assignment_source = 'manual') AS manual_keeper_id,
    count(*) FILTER (
      WHERE rf.assignment_source = 'rule' AND NOT rf.attributable_rule
    ) AS unattributed_rule_rows
  FROM _wp21_03b_h9 AS h9
  JOIN _wp21_03b_row_facts AS rf USING (campaign_id, fgk, worker_id)
  GROUP BY h9.campaign_id, h9.fgk, h9.worker_id
),
mapped AS (
  SELECT
    summary.*,
    mapping.worker_id IS NOT NULL AS mapping_present,
    mapping.keep_ou_id,
    (
      SELECT min(rf.id)
      FROM _wp21_03b_row_facts AS rf
      WHERE rf.campaign_id = summary.campaign_id
        AND rf.fgk = summary.fgk
        AND rf.worker_id = summary.worker_id
        AND rf.ou_id = mapping.keep_ou_id
    ) AS mapped_keeper_id
  FROM summary
  LEFT JOIN public._oux_wp21_placement_mapping AS mapping
    USING (campaign_id, fgk, worker_id)
)
SELECT
  campaign_id,
  fgk,
  worker_id,
  CASE
    WHEN mapping_present THEN true
    WHEN dimension_matches = 1 AND attributable_nonmatching_rule_rows = 0 THEN true
    WHEN dimension_matches = 0 AND primary_rows = 1 THEN true
    WHEN dimension_matches = 0
      AND primary_rows = 0
      AND manual_rows = 1
      AND unattributed_rule_rows = placement_rows - 1
      THEN true
    ELSE false
  END AS resolved,
  CASE
    WHEN mapping_present THEN mapped_keeper_id
    WHEN dimension_matches = 1 AND attributable_nonmatching_rule_rows = 0
      THEN dimension_keeper_id
    WHEN dimension_matches = 0 AND primary_rows = 1
      THEN primary_keeper_id
    WHEN dimension_matches = 0
      AND primary_rows = 0
      AND manual_rows = 1
      AND unattributed_rule_rows = placement_rows - 1
      THEN manual_keeper_id
  END AS keeper_id,
  CASE
    WHEN mapping_present AND keep_ou_id IS NULL THEN 'mapping_remove_all'
    WHEN mapping_present THEN 'mapping'
    WHEN dimension_matches = 1 AND attributable_nonmatching_rule_rows = 0
      THEN 'unique_dimension_match'
    WHEN dimension_matches = 0 AND primary_rows = 1
      THEN 'unique_primary'
    WHEN dimension_matches = 0
      AND primary_rows = 0
      AND manual_rows = 1
      AND unattributed_rule_rows = placement_rows - 1
      THEN 'single_manual_vs_unattributed_rule'
    ELSE 'unresolved'
  END AS reason
FROM mapped;

DELETE FROM public._oux_wp21_conflicts;

INSERT INTO public._oux_wp21_conflicts (
  campaign_id,
  fgk,
  worker_id,
  rows,
  status
)
SELECT
  resolution.campaign_id,
  resolution.fgk,
  resolution.worker_id,
  jsonb_agg(
    jsonb_build_object(
      'id', rf.id,
      'ou_id', rf.ou_id,
      'is_primary', rf.is_primary,
      'assignment_source', rf.assignment_source,
      'basis_specificity', rf.basis_specificity,
      'raw_dim_match', rf.raw_dim_match,
      'dim_match', rf.dim_match,
      'attributable_rule', rf.attributable_rule
    )
    ORDER BY rf.id
  ),
  CASE WHEN resolution.resolved THEN 'planned' ELSE 'unresolved' END
FROM _wp21_03b_resolution AS resolution
JOIN _wp21_03b_row_facts AS rf USING (campaign_id, fgk, worker_id)
GROUP BY
  resolution.campaign_id,
  resolution.fgk,
  resolution.worker_id,
  resolution.resolved;

COMMIT;

SELECT
  campaign_id,
  fgk,
  worker_id,
  status,
  rows,
  detected_at,
  applied_at,
  rolled_back_at
FROM public._oux_wp21_conflicts
ORDER BY campaign_id, fgk, worker_id;

DO $stop_before_delete$
DECLARE
  v_conflicts text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', campaign_id, fgk, worker_id), ', ' ORDER BY campaign_id, fgk, worker_id)
    INTO v_conflicts
  FROM public._oux_wp21_conflicts
  WHERE status = 'unresolved';

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION '03b STOP unresolved partitions: %', v_conflicts;
  END IF;
END;
$stop_before_delete$;

-- ===========================================================================
-- BLOCK 2: change. This block is unreachable while conflicts exist.
-- ===========================================================================

BEGIN;

-- A future production operator must add SET LOCAL oux.env = 'production';
-- immediately after this BEGIN in the same submission.
DO $environment_guard$
DECLARE
  v_valid boolean;
BEGIN
  IF to_regclass('public._oux_env_marker') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) = 1 AND bool_and(env IN (''clone'', ''dev'')) FROM public._oux_env_marker'
      INTO v_valid;
    IF v_valid THEN RETURN; END IF;
    RAISE EXCEPTION 'Refusing to run: _oux_env_marker is not a valid clone/dev singleton';
  END IF;
  IF current_setting('oux.env', true) = 'production' THEN RETURN; END IF;
  RAISE EXCEPTION
    'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction';
END;
$environment_guard$;

DO $change_precondition$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public._oux_wp21_conflicts
    WHERE status <> 'planned'
  ) THEN
    RAISE EXCEPTION '03b STOP: unresolved conflicts exist';
  END IF;
  IF EXISTS (SELECT 1 FROM _wp21_03b_resolution WHERE NOT resolved) THEN
    RAISE EXCEPTION '03b STOP: in-session resolution contains an unresolved partition';
  END IF;
END;
$change_precondition$;

CREATE TEMP TABLE _wp21_03b_baseline (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp21_03b_baseline
VALUES
  ('placements', (SELECT count(*) FROM public.campaign_worker_ou)),
  ('membership', (SELECT count(*) FROM public.campaign_worker_membership)),
  ('h2', (
    SELECT count(*)
    FROM public.campaign_worker_ou AS child_placement
    JOIN public.campaign_organising_units AS child
      ON child.ou_id = child_placement.ou_id
     AND child.parent_ou_id IS NOT NULL
    JOIN public.campaign_worker_ou AS parent_placement
      ON parent_placement.ou_id = child.parent_ou_id
     AND parent_placement.worker_id = child_placement.worker_id
  )),
  ('h5', (
    SELECT count(*)
    FROM public.campaign_worker_ou AS cwo
    JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
    LEFT JOIN public.campaign_worker_membership AS m
      ON m.campaign_id = cou.campaign_id
     AND m.worker_id = cwo.worker_id
    WHERE m.membership_id IS NULL
  )),
  ('h7', (
    SELECT count(*)
    FROM (
      SELECT cou.campaign_id, cwo.worker_id
      FROM public.campaign_worker_ou AS cwo
      JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
      WHERE cwo.is_primary
      GROUP BY cou.campaign_id, cwo.worker_id
      HAVING count(*) > 1
    ) AS multi_primary
  ));

CREATE TEMP TABLE _wp21_03b_source_baseline ON COMMIT DROP AS
SELECT assignment_source, count(*) AS row_count
FROM public.campaign_worker_ou
GROUP BY assignment_source;

CREATE TEMP TABLE _wp21_03b_to_delete ON COMMIT DROP AS
SELECT rf.id, resolution.reason
FROM _wp21_03b_resolution AS resolution
JOIN _wp21_03b_row_facts AS rf USING (campaign_id, fgk, worker_id)
WHERE resolution.keeper_id IS NULL
   OR rf.id <> resolution.keeper_id;

CREATE TEMP TABLE _wp21_03b_promotions ON COMMIT DROP AS
SELECT DISTINCT resolution.keeper_id AS id
FROM _wp21_03b_resolution AS resolution
JOIN _wp21_03b_row_facts AS keeper ON keeper.id = resolution.keeper_id
WHERE NOT keeper.is_primary
  AND EXISTS (
    SELECT 1
    FROM _wp21_03b_row_facts AS loser
    WHERE loser.campaign_id = resolution.campaign_id
      AND loser.fgk = resolution.fgk
      AND loser.worker_id = resolution.worker_id
      AND loser.id <> resolution.keeper_id
      AND loser.is_primary
  );

CREATE TEMP TABLE _wp21_03b_update_logs (
  log_id bigint PRIMARY KEY,
  placement_id integer NOT NULL
) ON COMMIT DROP;

WITH logged AS (
  INSERT INTO public._oux_hygiene_log (
    script, action, table_name, row_pk, before_row, after_row, note
  )
  SELECT
    '03b_resolve_future_group_conflicts',
    'update',
    'campaign_worker_ou',
    jsonb_build_object('id', cwo.id),
    to_jsonb(cwo),
    NULL,
    'promote keeper because a deleted row was primary'
  FROM _wp21_03b_promotions AS promotion
  JOIN public.campaign_worker_ou AS cwo ON cwo.id = promotion.id
  RETURNING log_id, (row_pk ->> 'id')::integer AS placement_id
)
INSERT INTO _wp21_03b_update_logs
SELECT log_id, placement_id FROM logged;

UPDATE public.campaign_worker_ou AS cwo
SET is_primary = true
FROM _wp21_03b_promotions AS promotion
WHERE cwo.id = promotion.id;

UPDATE public._oux_hygiene_log AS log
SET after_row = to_jsonb(cwo)
FROM _wp21_03b_update_logs AS changed
JOIN public.campaign_worker_ou AS cwo ON cwo.id = changed.placement_id
WHERE log.log_id = changed.log_id;

CREATE TEMP TABLE _wp21_03b_delete_logs (
  log_id bigint PRIMARY KEY,
  placement_id integer NOT NULL
) ON COMMIT DROP;

WITH logged AS (
  INSERT INTO public._oux_hygiene_log (
    script, action, table_name, row_pk, before_row, after_row, note
  )
  SELECT
    '03b_resolve_future_group_conflicts',
    'delete',
    'campaign_worker_ou',
    jsonb_build_object('id', cwo.id),
    to_jsonb(cwo),
    NULL,
    removal.reason
  FROM _wp21_03b_to_delete AS removal
  JOIN public.campaign_worker_ou AS cwo ON cwo.id = removal.id
  RETURNING log_id, (row_pk ->> 'id')::integer AS placement_id
)
INSERT INTO _wp21_03b_delete_logs
SELECT log_id, placement_id FROM logged;

DELETE FROM public.campaign_worker_ou AS cwo
USING _wp21_03b_to_delete AS removal
WHERE cwo.id = removal.id;

DO $postconditions$
DECLARE
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_03b_baseline WHERE metric = 'membership')
  THEN
    RAISE EXCEPTION '03b post-check failed: membership count changed';
  END IF;

  IF (SELECT count(*) FROM public.campaign_worker_ou)
       <> (
         (SELECT value FROM _wp21_03b_baseline WHERE metric = 'placements')
         - (SELECT count(*) FROM _wp21_03b_delete_logs)
       )
  THEN
    RAISE EXCEPTION '03b post-check failed: placement count does not equal baseline minus logged deletions';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT 1
    FROM public.campaign_worker_ou AS cwo
    JOIN _wp21_03b_unit_facts AS uf ON uf.ou_id = cwo.ou_id
    WHERE uf.fgk IS NOT NULL
    GROUP BY uf.campaign_id, uf.fgk, cwo.worker_id
    HAVING count(*) > 1
  ) AS conflicts;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b post-check failed: H9 is not zero';
  END IF;

  IF (
    SELECT count(*)
    FROM public.campaign_worker_ou AS child_placement
    JOIN public.campaign_organising_units AS child
      ON child.ou_id = child_placement.ou_id
     AND child.parent_ou_id IS NOT NULL
    JOIN public.campaign_worker_ou AS parent_placement
      ON parent_placement.ou_id = child.parent_ou_id
     AND parent_placement.worker_id = child_placement.worker_id
  ) > (SELECT value FROM _wp21_03b_baseline WHERE metric = 'h2')
  THEN
    RAISE EXCEPTION '03b post-check failed: H2 increased';
  END IF;

  IF (
    SELECT count(*)
    FROM public.campaign_worker_ou AS cwo
    JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
    LEFT JOIN public.campaign_worker_membership AS m
      ON m.campaign_id = cou.campaign_id
     AND m.worker_id = cwo.worker_id
    WHERE m.membership_id IS NULL
  ) > (SELECT value FROM _wp21_03b_baseline WHERE metric = 'h5')
  THEN
    RAISE EXCEPTION '03b post-check failed: H5 increased';
  END IF;

  IF (
    SELECT count(*)
    FROM (
      SELECT cou.campaign_id, cwo.worker_id
      FROM public.campaign_worker_ou AS cwo
      JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
      WHERE cwo.is_primary
      GROUP BY cou.campaign_id, cwo.worker_id
      HAVING count(*) > 1
    ) AS multi_primary
  ) > (SELECT value FROM _wp21_03b_baseline WHERE metric = 'h7')
  THEN
    RAISE EXCEPTION '03b post-check failed: H7 increased';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT
      source.assignment_source,
      source.before_count,
      source.deleted_count,
      source.after_count
    FROM (
      SELECT
        values_source.assignment_source,
        coalesce(baseline.row_count, 0) AS before_count,
        coalesce(deleted.row_count, 0) AS deleted_count,
        coalesce(after_rows.row_count, 0) AS after_count
      FROM (VALUES ('manual'::text), ('rule'::text)) AS values_source(assignment_source)
      LEFT JOIN _wp21_03b_source_baseline AS baseline USING (assignment_source)
      LEFT JOIN (
        SELECT
          log.before_row ->> 'assignment_source' AS assignment_source,
          count(*) AS row_count
        FROM _wp21_03b_delete_logs AS changed
        JOIN public._oux_hygiene_log AS log USING (log_id)
        GROUP BY log.before_row ->> 'assignment_source'
      ) AS deleted USING (assignment_source)
      LEFT JOIN (
        SELECT assignment_source::text, count(*) AS row_count
        FROM public.campaign_worker_ou
        GROUP BY assignment_source
      ) AS after_rows USING (assignment_source)
    ) AS source
    WHERE source.after_count <> source.before_count - source.deleted_count
  ) AS bad_source_arithmetic;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b post-check failed: assignment_source distribution changed beyond logged deletes';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_update_logs AS changed
  JOIN public._oux_hygiene_log AS log USING (log_id)
  WHERE log.after_row IS NULL
     OR (log.after_row - 'is_primary') IS DISTINCT FROM (log.before_row - 'is_primary')
     OR (log.after_row ->> 'is_primary')::boolean IS DISTINCT FROM true;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b post-check failed: % keeper updates changed more than is_primary', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_delete_logs AS changed
  JOIN public._oux_hygiene_log AS log USING (log_id)
  LEFT JOIN public.campaign_worker_ou AS cwo ON cwo.id = changed.placement_id
  WHERE cwo.id IS NOT NULL
     OR log.before_row IS NULL
     OR log.rolled_back_at IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b post-check failed: % deletion audit rows are incomplete', v_count;
  END IF;
END;
$postconditions$;

UPDATE public._oux_wp21_conflicts
SET status = 'applied',
    applied_at = now()
WHERE status = 'planned';

SELECT
  (SELECT count(*) FROM _wp21_03b_update_logs) AS primary_promotions_logged,
  (SELECT count(*) FROM _wp21_03b_delete_logs) AS placements_deleted_and_logged,
  (SELECT count(*) FROM public._oux_wp21_conflicts WHERE status = 'applied')
    AS partitions_marked_applied;

COMMIT;
