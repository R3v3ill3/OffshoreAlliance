-- WP2.1 read-only preflight report.
-- Creates session-local temporary tables only. It does not change application data.
-- Output is limited to aggregates, hashes, IDs, and structural fields.

BEGIN;

CREATE TEMP TABLE _wp21_unit_facts ON COMMIT DROP AS
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
  cou.ou_type,
  cou.parent_ou_id,
  cou.ou_group_id,
  cou.is_group_container,
  cou.source,
  cou.display_order,
  cou.created_at,
  cou.unit_basis,
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
  IF (SELECT count(*) FROM _wp21_unit_facts)
     <> (SELECT count(*) FROM public.campaign_organising_units)
  THEN
    RAISE EXCEPTION 'Preflight cannot map every ou_type to a future group key';
  END IF;
END;
$mapping_complete$;

-- Baseline counts and target-object presence.
SELECT
  (SELECT count(*) FROM public.campaign_worker_membership) AS membership_rows,
  (SELECT count(*) FROM public.campaign_worker_ou) AS placement_rows,
  (SELECT count(*) FROM public.campaign_organising_units) AS unit_rows,
  (SELECT count(*) FROM public.campaign_unit_rules) AS rule_rows,
  to_regclass('public.campaign_groups') IS NOT NULL AS campaign_groups_exists,
  to_regclass('public.user_campaign_prefs') IS NOT NULL AS user_campaign_prefs_exists,
  to_regclass('public.campaign_group_membership') IS NOT NULL AS deferred_membership_view_exists,
  to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL AS deferred_unique_index_exists;

-- Stable application-data checksums. Names and free text are hashed, never printed.
SELECT 'campaign_worker_ou' AS object_name,
       md5(coalesce(string_agg(
         concat_ws('|', id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id),
         ',' ORDER BY id
       ), '')) AS checksum
FROM public.campaign_worker_ou
UNION ALL
SELECT 'campaign_organising_units',
       md5(coalesce(string_agg(
         jsonb_build_array(
           ou_id,
           campaign_id,
           ou_type,
           md5(coalesce(name, '<NULL>')),
           total_workers_estimated,
           md5(coalesce(source_metadata::text, '<NULL>')),
           anchor_worker_id,
           created_at,
           md5(coalesce(commonality_logic::text, '<NULL>')),
           target_size,
           md5(coalesce(source::text, '<NULL>')),
           display_order,
           unit_basis,
           parent_ou_id,
           is_group_container,
           ou_group_id,
           user_rating
         )::text,
         ',' ORDER BY ou_id
       ), ''))
FROM public.campaign_organising_units
UNION ALL
SELECT 'campaign_organising_units_updated_at',
       md5(coalesce(string_agg(
         concat_ws('|', ou_id, updated_at),
         ',' ORDER BY ou_id
       ), ''))
FROM public.campaign_organising_units
UNION ALL
SELECT 'campaign_worker_membership',
       md5(coalesce(string_agg(
         concat_ws('|', campaign_id, worker_id),
         ',' ORDER BY campaign_id, worker_id
       ), ''))
FROM public.campaign_worker_membership
UNION ALL
SELECT 'campaign_unit_rules',
       md5(coalesce(string_agg(
         concat_ws('|', rule_id, campaign_id, ou_id),
         ',' ORDER BY rule_id
       ), ''))
FROM public.campaign_unit_rules
ORDER BY object_name;

-- Existing dependent views must retain both definition and security reloptions.
SELECT
  c.relname AS view_name,
  md5(pg_get_viewdef(c.oid)) AS definition_hash,
  coalesce(c.reloptions, ARRAY[]::text[]) AS reloptions
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname = ANY (ARRAY[
    'campaign_ou_coverage_summary',
    'campaign_unit_assignment_summary',
    'campaign_unit_hierarchy_summary',
    'campaign_worker_unit_membership_summary',
    'v_campaign_coverage_map',
    'v_campaign_coverage_summary',
    'v_campaign_foundational_readiness',
    'v_section_plan_workforce_mapping',
    'v_woc_unit_representation',
    'vw_call_action_report'
  ])
ORDER BY c.relname;

DO $view_inventory$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname = ANY (ARRAY[
        'campaign_ou_coverage_summary',
        'campaign_unit_assignment_summary',
        'campaign_unit_hierarchy_summary',
        'campaign_worker_unit_membership_summary',
        'v_campaign_coverage_map',
        'v_campaign_coverage_summary',
        'v_campaign_foundational_readiness',
        'v_section_plan_workforce_mapping',
        'v_woc_unit_representation',
        'vw_call_action_report'
      ])
  ) <> 10 THEN
    RAISE EXCEPTION 'Preflight expected all 10 dependent views';
  END IF;
END;
$view_inventory$;

-- Dynamically enumerate/checksum every FK reference to an OU except placements,
-- which have their own checksum and are intentionally changed by 03b.
CREATE TEMP TABLE _wp21_dependant_ref_counts (
  ou_id integer PRIMARY KEY,
  ref_count bigint NOT NULL DEFAULT 0
) ON COMMIT DROP;

CREATE TEMP TABLE _wp21_dependant_checksums (
  evidence_label text PRIMARY KEY,
  row_count bigint NOT NULL,
  checksum text NOT NULL
) ON COMMIT DROP;

DO $dependant_checksums$
DECLARE
  r record;
  v_pk_expression text;
  v_count bigint;
  v_checksum text;
BEGIN
  FOR r IN
    SELECT
      con.oid AS constraint_oid,
      con.conname,
      con.conrelid,
      con.conrelid::regclass AS source_table,
      source_att.attname AS source_column
    FROM pg_constraint AS con
    JOIN pg_attribute AS source_att
      ON source_att.attrelid = con.conrelid
     AND source_att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.campaign_organising_units'::regclass
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND con.confkey[1] = (
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.campaign_organising_units'::regclass
          AND attname = 'ou_id'
          AND NOT attisdropped
      )
      AND con.conrelid <> 'public.campaign_worker_ou'::regclass
    ORDER BY con.conrelid::regclass::text, con.conname
  LOOP
    SELECT string_agg(format('t.%I::text', a.attname), ', ' ORDER BY key_col.ordinality)
      INTO v_pk_expression
    FROM pg_index AS i
    CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_col(attnum, ordinality)
    JOIN pg_attribute AS a
      ON a.attrelid = i.indrelid
     AND a.attnum = key_col.attnum
    WHERE i.indrelid = r.conrelid
      AND i.indisprimary;

    IF v_pk_expression IS NULL THEN
      RAISE EXCEPTION 'Referenced table % has no primary key for a stable checksum', r.source_table;
    END IF;

    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(concat_ws(''|'', %s, t.%I::text), '','' ORDER BY %s, t.%I::text), '''')) FROM %s AS t WHERE t.%I IS NOT NULL',
      v_pk_expression,
      r.source_column,
      v_pk_expression,
      r.source_column,
      r.source_table,
      r.source_column
    )
    INTO v_count, v_checksum;

    RAISE NOTICE 'OU_DEPENDANT_CHECKSUM table=% constraint=% rows=% md5=%',
      r.source_table, r.conname, v_count, v_checksum;

    INSERT INTO _wp21_dependant_checksums
    VALUES (
      'ou_dependant:' || r.source_table::text || ':' || r.conname || ':' || r.source_column,
      v_count,
      v_checksum
    );

    EXECUTE format(
      'INSERT INTO _wp21_dependant_ref_counts (ou_id, ref_count) SELECT t.%I, count(*) FROM %s AS t WHERE t.%I IS NOT NULL GROUP BY t.%I ON CONFLICT (ou_id) DO UPDATE SET ref_count = _wp21_dependant_ref_counts.ref_count + EXCLUDED.ref_count',
      r.source_column,
      r.source_table,
      r.source_column,
      r.source_column
    );
  END LOOP;
END;
$dependant_checksums$;

-- H1. Workers in >1 unit of the SAME group (would violate one-per-group)
SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id, COUNT(*) AS units
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cou.ou_group_id IS NOT NULL
GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- H2. Parent + sub-unit roll-up rows (same worker in a unit and its parent)
SELECT c.campaign_id, cwo_c.worker_id, c.ou_id AS child_ou, c.parent_ou_id
FROM campaign_worker_ou cwo_c
JOIN campaign_organising_units c ON c.ou_id = cwo_c.ou_id AND c.parent_ou_id IS NOT NULL
JOIN campaign_worker_ou cwo_p ON cwo_p.ou_id = c.parent_ou_id AND cwo_p.worker_id = cwo_c.worker_id;

-- H3. Workers in >1 STANDALONE unit of the same ou_type (no group today, so no rule applied)
SELECT cou.campaign_id, cou.ou_type, cwo.worker_id, COUNT(*)
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- H4. Shape per campaign/type: >1 container of a type, or a mix of containers and standalone units
SELECT campaign_id, ou_type,
       COUNT(*) FILTER (WHERE is_group_container) AS containers,
       COUNT(*) FILTER (WHERE NOT is_group_container AND ou_group_id IS NULL AND parent_ou_id IS NULL) AS standalone_units,
       COUNT(*) FILTER (WHERE ou_group_id IS NOT NULL) AS grouped_units,
       COUNT(*) FILTER (WHERE parent_ou_id IS NOT NULL AND ou_group_id IS NULL) AS level2_subunits
FROM campaign_organising_units GROUP BY 1,2 ORDER BY 1,2;

-- H5. campaign_worker_ou rows whose worker is NOT a member of the unit's campaign (invisible to Unallocated logic)
SELECT COUNT(*) FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
LEFT JOIN campaign_worker_membership m ON m.campaign_id = cou.campaign_id AND m.worker_id = cwo.worker_id
WHERE m.membership_id IS NULL;

-- H6. Members with no unit at all (today's campaign-wide Unallocated)
SELECT m.campaign_id, COUNT(*) FROM campaign_worker_membership m
WHERE NOT EXISTS (SELECT 1 FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
                  WHERE cou.campaign_id = m.campaign_id AND cwo.worker_id = m.worker_id)
GROUP BY 1;

-- H7. Multiple is_primary per worker per campaign
SELECT cou.campaign_id, cwo.worker_id, COUNT(*) FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cwo.is_primary GROUP BY 1,2 HAVING COUNT(*) > 1;

-- H8. Units with no usable dimension ('custom', or empty unit_basis) that would need a group assigned
SELECT campaign_id, ou_type, COUNT(*) FROM campaign_organising_units
WHERE NOT is_group_container AND (ou_type = 'custom' OR unit_basis IS NULL OR unit_basis = '{}'::jsonb)
GROUP BY 1,2;

-- H9. More than one placement in the same future group.
SELECT uf.campaign_id, uf.fgk, cwo.worker_id, count(*) AS placement_rows
FROM public.campaign_worker_ou AS cwo
JOIN _wp21_unit_facts AS uf ON uf.ou_id = cwo.ou_id
WHERE uf.fgk IS NOT NULL
GROUP BY uf.campaign_id, uf.fgk, cwo.worker_id
HAVING count(*) > 1
ORDER BY uf.campaign_id, uf.fgk, cwo.worker_id;

-- H10. Duplicate structural auto-fill bases, including already-disabled rows.
WITH duplicate_bases AS (
  SELECT campaign_id, fgk, employer_id, worksite_id, count(*) AS unit_count
  FROM _wp21_unit_facts
  WHERE NOT is_group_container
    AND fgk IS NOT NULL
    AND (employer_id IS NOT NULL OR worksite_id IS NOT NULL)
  GROUP BY campaign_id, fgk, employer_id, worksite_id
  HAVING count(*) > 1
)
SELECT *
FROM duplicate_bases
ORDER BY campaign_id, fgk, employer_id NULLS FIRST, worksite_id NULLS FIRST;

-- H10 chooser: IDs and structural facts only; no unit/person names.
WITH duplicate_bases AS (
  SELECT campaign_id, fgk, employer_id, worksite_id
  FROM _wp21_unit_facts
  WHERE NOT is_group_container
    AND fgk IS NOT NULL
    AND (employer_id IS NOT NULL OR worksite_id IS NOT NULL)
  GROUP BY campaign_id, fgk, employer_id, worksite_id
  HAVING count(*) > 1
)
SELECT
  db.campaign_id,
  db.fgk,
  db.employer_id,
  db.worksite_id,
  uf.ou_id,
  uf.ou_type,
  uf.parent_ou_id,
  uf.is_group_container,
  uf.source,
  uf.display_order,
  uf.created_at,
  uf.auto_match_enabled,
  (SELECT count(*) FROM public.campaign_worker_ou AS cwo WHERE cwo.ou_id = uf.ou_id) AS placement_count,
  (SELECT count(*) FROM public.campaign_unit_rules AS cur WHERE cur.ou_id = uf.ou_id) AS rule_count,
  (SELECT count(*) FROM public.campaign_ou_coverage AS cov WHERE cov.ou_id = uf.ou_id) AS coverage_row_count,
  coalesce(drc.ref_count, 0) AS dependant_ref_count
FROM duplicate_bases AS db
JOIN _wp21_unit_facts AS uf
  ON uf.campaign_id = db.campaign_id
 AND uf.fgk = db.fgk
 AND uf.employer_id IS NOT DISTINCT FROM db.employer_id
 AND uf.worksite_id IS NOT DISTINCT FROM db.worksite_id
LEFT JOIN _wp21_dependant_ref_counts AS drc ON drc.ou_id = uf.ou_id
ORDER BY db.campaign_id, db.fgk, db.employer_id NULLS FIRST,
         db.worksite_id NULLS FIRST, uf.display_order, uf.ou_id;

-- Rule-source provenance. Attribution is a live rule on the unit; assigned_rule_id
-- is deliberately not used.
SELECT
  uf.campaign_id,
  count(*) FILTER (
    WHERE cwo.assignment_source = 'rule'
      AND EXISTS (
        SELECT 1 FROM public.campaign_unit_rules AS cur
        WHERE cur.ou_id = cwo.ou_id
          AND cur.campaign_id = uf.campaign_id
      )
  ) AS attributable_rule_rows,
  count(*) FILTER (
    WHERE cwo.assignment_source = 'rule'
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_unit_rules AS cur
        WHERE cur.ou_id = cwo.ou_id
          AND cur.campaign_id = uf.campaign_id
      )
  ) AS unattributed_rule_source_rows
FROM public.campaign_worker_ou AS cwo
JOIN _wp21_unit_facts AS uf ON uf.ou_id = cwo.ou_id
GROUP BY uf.campaign_id
HAVING count(*) FILTER (WHERE cwo.assignment_source = 'rule') > 0
ORDER BY uf.campaign_id;

-- Per-H9-partition deterministic resolution preview after current C1 flags.
WITH raw_row_facts AS (
  SELECT
    cwo.id,
    cwo.worker_id,
    cwo.ou_id,
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
        SELECT 1 FROM public.campaign_unit_rules AS cur
        WHERE cur.ou_id = cwo.ou_id
          AND cur.campaign_id = uf.campaign_id
      ) AS attributable_rule
  FROM public.campaign_worker_ou AS cwo
  JOIN _wp21_unit_facts AS uf ON uf.ou_id = cwo.ou_id
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
),
row_facts AS (
  SELECT
    ranked_row_facts.*,
    raw_dim_match
      AND basis_specificity = maximum_matching_specificity AS dim_match
  FROM ranked_row_facts
),
h9 AS (
  SELECT campaign_id, fgk, worker_id
  FROM row_facts
  GROUP BY campaign_id, fgk, worker_id
  HAVING count(*) > 1
),
summary AS (
  SELECT
    h9.campaign_id,
    h9.fgk,
    h9.worker_id,
    count(*) FILTER (WHERE rf.dim_match) AS dimension_matches,
    count(*) FILTER (WHERE rf.is_primary) AS primary_rows,
    count(*) FILTER (WHERE rf.assignment_source = 'manual') AS manual_rows,
    count(*) FILTER (WHERE rf.attributable_rule) AS attributable_rule_rows,
    count(*) FILTER (WHERE rf.attributable_rule AND NOT rf.dim_match)
      AS attributable_nonmatching_rule_rows,
    count(*) FILTER (
      WHERE rf.assignment_source = 'rule' AND NOT rf.attributable_rule
    ) AS unattributed_rule_rows,
    count(*) AS placement_rows
  FROM h9
  JOIN row_facts AS rf USING (campaign_id, fgk, worker_id)
  GROUP BY h9.campaign_id, h9.fgk, h9.worker_id
)
SELECT
  campaign_id,
  fgk,
  worker_id,
  placement_rows,
  dimension_matches,
  primary_rows,
  manual_rows,
  attributable_rule_rows,
  CASE
    WHEN dimension_matches = 1 AND attributable_nonmatching_rule_rows = 0
      THEN 'unique_dimension_match'
    WHEN dimension_matches = 0 AND primary_rows = 1
      THEN 'unique_primary'
    WHEN dimension_matches = 0
      AND primary_rows = 0
      AND manual_rows = 1
      AND unattributed_rule_rows = placement_rows - 1
      THEN 'single_manual_vs_unattributed_rule'
    ELSE 'operator_mapping_required'
  END AS resolution_preview
FROM summary
ORDER BY campaign_id, fgk, worker_id;

-- Custom-container name collision report. Names remain hashed.
WITH custom_containers AS (
  SELECT campaign_id, ou_id, lower(btrim(name)) AS normalised_name
  FROM public.campaign_organising_units AS cou
  JOIN (VALUES
    ('department'), ('custom'), ('network'), ('ethnic_community'), ('accommodation')
  ) AS custom_type(ou_type) ON custom_type.ou_type = cou.ou_type
  WHERE cou.is_group_container
)
SELECT
  campaign_id,
  md5(normalised_name) AS name_hash,
  array_agg(ou_id ORDER BY ou_id) AS source_ou_ids,
  count(*) AS collision_rows,
  normalised_name IN (
    'worksite', 'employer', 'shift', 'crew', 'occupation', 'work area',
    'custom', 'network', 'ethnic community', 'accommodation', 'department'
  )
    AS collides_with_reserved_label
FROM custom_containers
GROUP BY campaign_id, normalised_name
HAVING count(*) > 1
    OR normalised_name IN (
      'worksite', 'employer', 'shift', 'crew', 'occupation', 'work area',
      'custom', 'network', 'ethnic community', 'accommodation', 'department'
    )
ORDER BY campaign_id, name_hash;

-- Auto-match exposure for every current worker eligible under the live
-- campaign-universe OR filter. Actor write access and invocation batches are
-- intentionally omitted: either can reduce writes, but neither changes
-- maximum-specificity ranking within a future-group partition.
CREATE TEMP TABLE _wp21_f1_match_exposure ON COMMIT DROP AS
WITH raw_candidates AS (
  SELECT
    uf.campaign_id,
    uf.fgk,
    w.worker_id,
    uf.ou_id,
    (
      (uf.employer_id IS NOT NULL AND uf.employer_id = w.employer_id)
      OR (uf.worksite_id IS NOT NULL AND uf.worksite_id = w.worksite_id)
    ) AS legacy_or_match,
    uf.auto_match_enabled
      AND (uf.employer_id IS NOT NULL OR uf.worksite_id IS NOT NULL)
      AND (uf.employer_id IS NULL OR uf.employer_id = w.employer_id)
      AND (uf.worksite_id IS NULL OR uf.worksite_id = w.worksite_id) AS f1_match,
    (uf.employer_id IS NOT NULL)::integer
      + (uf.worksite_id IS NOT NULL)::integer AS basis_specificity
  FROM public.campaigns AS c
  JOIN public.workers AS w
    ON (
      (
        w.employer_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaign_employers AS ce
          WHERE ce.campaign_id = c.campaign_id
            AND ce.employer_id = w.employer_id
        )
      )
      OR (
        w.worksite_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaign_worksites AS cw
          WHERE cw.campaign_id = c.campaign_id
            AND cw.worksite_id = w.worksite_id
        )
      )
    )
  JOIN _wp21_unit_facts AS uf
    ON uf.campaign_id = c.campaign_id
   AND NOT uf.is_group_container
   AND uf.fgk IS NOT NULL
  WHERE c.status IN ('planning', 'active')
    AND c.is_sms_episode = false
),
ranked_candidates AS (
  SELECT
    raw_candidates.*,
    -- SPECIFICITY-RANKING-BEGIN
    max(basis_specificity) FILTER (WHERE f1_match) OVER (
      PARTITION BY campaign_id, fgk, worker_id
    )
    -- SPECIFICITY-RANKING-END
      AS maximum_matching_specificity
  FROM raw_candidates
),
candidate_matches AS (
  SELECT
    campaign_id,
    fgk,
    worker_id,
    count(*) FILTER (WHERE legacy_or_match) AS legacy_or_targets,
    count(*) FILTER (WHERE f1_match) AS f1_pre_specificity_targets,
    count(*) FILTER (
      WHERE f1_match
        AND basis_specificity = maximum_matching_specificity
    ) AS f1_and_targets
  FROM ranked_candidates
  GROUP BY campaign_id, fgk, worker_id
)
SELECT * FROM candidate_matches;

SELECT
  campaign_id,
  count(*) FILTER (WHERE legacy_or_targets > 1) AS legacy_or_multi_partitions,
  coalesce(sum(legacy_or_targets) FILTER (WHERE legacy_or_targets > 1), 0) AS legacy_or_target_rows,
  count(*) FILTER (
    WHERE f1_pre_specificity_targets > 1
  ) AS f1_pre_specificity_multi_partitions,
  coalesce(sum(f1_pre_specificity_targets) FILTER (
    WHERE f1_pre_specificity_targets > 1
  ), 0) AS f1_pre_specificity_target_rows,
  coalesce(sum(f1_pre_specificity_targets - 1) FILTER (
    WHERE f1_pre_specificity_targets > 1
  ), 0) AS f1_pre_specificity_excess_targets,
  coalesce(sum(f1_pre_specificity_targets - f1_and_targets), 0)
    AS fallback_targets_suppressed,
  count(*) FILTER (WHERE f1_and_targets > 1) AS f1_and_multi_partitions,
  coalesce(sum(f1_and_targets) FILTER (WHERE f1_and_targets > 1), 0) AS f1_and_target_rows,
  coalesce(sum(f1_and_targets - 1) FILTER (
    WHERE f1_and_targets > 1
  ), 0) AS f1_and_excess_targets
FROM _wp21_f1_match_exposure
GROUP BY campaign_id
HAVING count(*) FILTER (
  WHERE legacy_or_targets > 1
     OR f1_pre_specificity_targets > 1
     OR f1_and_targets > 1
) > 0
    OR coalesce(sum(f1_pre_specificity_targets - f1_and_targets), 0) > 0
ORDER BY campaign_id;

SELECT
  count(*) FILTER (WHERE auto_match_enabled) AS auto_match_enabled_units,
  count(*) FILTER (WHERE NOT auto_match_enabled) AS auto_match_disabled_units,
  count(*) FILTER (
    WHERE NOT is_group_container AND employer_id IS NULL AND worksite_id IS NULL
  ) AS no_parsed_basis_units,
  count(*) FILTER (
    WHERE (unit_basis ? 'employer_id' AND employer_id IS NULL)
       OR (unit_basis ? 'worksite_id' AND worksite_id IS NULL)
  ) AS malformed_or_nonpositive_basis_units
FROM _wp21_unit_facts
WHERE NOT is_group_container;

-- Final SQL-editor-capturable evidence. Labels are stable across 00/04;
-- values contain only aggregates and hashes.
WITH application_evidence(evidence_label, row_count, checksum) AS (
  SELECT
    'application:campaign_worker_ou',
    count(*),
    md5(coalesce(string_agg(
      concat_ws('|', id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id),
      ',' ORDER BY id
    ), ''))
  FROM public.campaign_worker_ou
  UNION ALL
  SELECT
    'application:campaign_organising_units',
    count(*),
    md5(coalesce(string_agg(
      jsonb_build_array(
        ou_id,
        campaign_id,
        ou_type,
        md5(coalesce(name, '<NULL>')),
        total_workers_estimated,
        md5(coalesce(source_metadata::text, '<NULL>')),
        anchor_worker_id,
        created_at,
        md5(coalesce(commonality_logic::text, '<NULL>')),
        target_size,
        md5(coalesce(source::text, '<NULL>')),
        display_order,
        unit_basis,
        parent_ou_id,
        is_group_container,
        ou_group_id,
        user_rating
      )::text,
      ',' ORDER BY ou_id
    ), ''))
  FROM public.campaign_organising_units
  UNION ALL
  SELECT
    'metadata:campaign_organising_units_updated_at',
    count(*),
    md5(coalesce(string_agg(
      concat_ws('|', ou_id, updated_at),
      ',' ORDER BY ou_id
    ), ''))
  FROM public.campaign_organising_units
  UNION ALL
  SELECT
    'application:campaign_worker_membership',
    count(*),
    md5(coalesce(string_agg(
      concat_ws('|', campaign_id, worker_id),
      ',' ORDER BY campaign_id, worker_id
    ), ''))
  FROM public.campaign_worker_membership
  UNION ALL
  SELECT
    'application:campaign_unit_rules',
    count(*),
    md5(coalesce(string_agg(
      concat_ws('|', rule_id, campaign_id, ou_id),
      ',' ORDER BY rule_id
    ), ''))
  FROM public.campaign_unit_rules
),
view_evidence AS (
  SELECT
    'view:' || c.relname AS evidence_label,
    1::bigint AS row_count,
    md5(
      md5(pg_get_viewdef(c.oid))
      || '|'
      || array_to_string(coalesce(c.reloptions, ARRAY[]::text[]), ',')
    ) AS checksum
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND c.relname = ANY (ARRAY[
      'campaign_ou_coverage_summary',
      'campaign_unit_assignment_summary',
      'campaign_unit_hierarchy_summary',
      'campaign_worker_unit_membership_summary',
      'v_campaign_coverage_map',
      'v_campaign_coverage_summary',
      'v_campaign_foundational_readiness',
      'v_section_plan_workforce_mapping',
      'v_woc_unit_representation',
      'vw_call_action_report'
    ])
),
h10_sets AS (
  SELECT campaign_id, fgk, employer_id, worksite_id
  FROM _wp21_unit_facts
  WHERE NOT is_group_container
    AND fgk IS NOT NULL
    AND auto_match_enabled
    AND (employer_id IS NOT NULL OR worksite_id IS NOT NULL)
  GROUP BY campaign_id, fgk, employer_id, worksite_id
  HAVING count(*) > 1
),
hazard_evidence(evidence_label, row_count, checksum) AS (
  SELECT
    'hazard:f1_pre_specificity_multi_target_partitions',
    count(*) FILTER (WHERE f1_pre_specificity_targets > 1),
    md5(coalesce(string_agg(
      concat_ws('|', campaign_id, fgk, worker_id, f1_pre_specificity_targets),
      ',' ORDER BY campaign_id, fgk, worker_id
    ) FILTER (WHERE f1_pre_specificity_targets > 1), ''))
  FROM _wp21_f1_match_exposure
  UNION ALL
  SELECT
    'hazard:f1_pre_specificity_excess_targets',
    coalesce(sum(f1_pre_specificity_targets - 1) FILTER (
      WHERE f1_pre_specificity_targets > 1
    ), 0),
    md5(coalesce(string_agg(
      concat_ws('|', campaign_id, fgk, worker_id, f1_pre_specificity_targets - 1),
      ',' ORDER BY campaign_id, fgk, worker_id
    ) FILTER (WHERE f1_pre_specificity_targets > 1), ''))
  FROM _wp21_f1_match_exposure
  UNION ALL
  SELECT
    'hazard:f1_fallback_targets_suppressed',
    coalesce(sum(f1_pre_specificity_targets - f1_and_targets), 0),
    md5(coalesce(string_agg(
      concat_ws(
        '|', campaign_id, fgk, worker_id,
        f1_pre_specificity_targets - f1_and_targets
      ),
      ',' ORDER BY campaign_id, fgk, worker_id
    ) FILTER (WHERE f1_pre_specificity_targets > f1_and_targets), ''))
  FROM _wp21_f1_match_exposure
  UNION ALL
  SELECT
    'hazard:f1_max_specificity_multi_target_partitions',
    count(*) FILTER (WHERE f1_and_targets > 1),
    md5(coalesce(string_agg(
      concat_ws('|', campaign_id, fgk, worker_id, f1_and_targets),
      ',' ORDER BY campaign_id, fgk, worker_id
    ) FILTER (WHERE f1_and_targets > 1), ''))
  FROM _wp21_f1_match_exposure
  UNION ALL
  SELECT
    'hazard:f1_max_specificity_excess_targets',
    coalesce(sum(f1_and_targets - 1) FILTER (
      WHERE f1_and_targets > 1
    ), 0),
    md5(coalesce(string_agg(
      concat_ws('|', campaign_id, fgk, worker_id, f1_and_targets - 1),
      ',' ORDER BY campaign_id, fgk, worker_id
    ) FILTER (WHERE f1_and_targets > 1), ''))
  FROM _wp21_f1_match_exposure
  UNION ALL
  SELECT
    'hazard:h10_enabled_duplicate_basis_sets',
    count(*),
    md5(coalesce(string_agg(
      concat_ws(
        '|', campaign_id, fgk, coalesce(employer_id, 0), coalesce(worksite_id, 0)
      ),
      ',' ORDER BY campaign_id, fgk, employer_id NULLS FIRST, worksite_id NULLS FIRST
    ), ''))
  FROM h10_sets
)
SELECT evidence_label, row_count, checksum
FROM application_evidence
UNION ALL
SELECT evidence_label, row_count, checksum
FROM _wp21_dependant_checksums
UNION ALL
SELECT evidence_label, row_count, checksum
FROM view_evidence
UNION ALL
SELECT evidence_label, row_count, checksum
FROM hazard_evidence
ORDER BY evidence_label;

COMMIT;
