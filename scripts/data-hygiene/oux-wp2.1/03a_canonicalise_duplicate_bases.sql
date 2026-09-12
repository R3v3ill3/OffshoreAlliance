-- WP2.1 C1: preserve duplicate units and disable auto-match on each reviewed
-- noncanonical unit. Every changed row is logged for exact rollback.

BEGIN;

-- A future production operator must add SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission. The agent never does so.
DO $environment_guard$
DECLARE
  v_valid boolean;
BEGIN
  IF to_regclass('public._oux_env_marker') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) = 1 AND bool_and(env IN (''clone'', ''dev'')) FROM public._oux_env_marker'
      INTO v_valid;
    IF v_valid THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Refusing to run: _oux_env_marker is not a valid clone/dev singleton';
  END IF;

  IF current_setting('oux.env', true) = 'production' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION
    'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction';
END;
$environment_guard$;

DO $required_objects$
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL
     OR to_regclass('public._oux_wp21_canonical_basis') IS NULL
  THEN
    RAISE EXCEPTION '03a requires _oux_hygiene_log and _oux_wp21_canonical_basis';
  END IF;
END;
$required_objects$;

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
  cou.is_group_container,
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
    RAISE EXCEPTION '03a cannot map every ou_type to a future group key';
  END IF;
END;
$mapping_complete$;

CREATE TEMP TABLE _wp21_h10_sets ON COMMIT DROP AS
SELECT campaign_id, fgk, employer_id, worksite_id, count(*) AS unit_count
FROM _wp21_unit_facts
WHERE NOT is_group_container
  AND fgk IS NOT NULL
  AND (employer_id IS NOT NULL OR worksite_id IS NOT NULL)
GROUP BY campaign_id, fgk, employer_id, worksite_id
HAVING count(*) > 1;

-- Unmapped and stale rows are printed before the exception.
SELECT
  h.campaign_id,
  h.fgk,
  h.employer_id,
  h.worksite_id,
  h.unit_count
FROM _wp21_h10_sets AS h
LEFT JOIN public._oux_wp21_canonical_basis AS m
  ON m.campaign_id = h.campaign_id
 AND m.fgk = h.fgk
 AND m.employer_id IS NOT DISTINCT FROM h.employer_id
 AND m.worksite_id IS NOT DISTINCT FROM h.worksite_id
WHERE m.canonical_ou_id IS NULL
ORDER BY h.campaign_id, h.fgk, h.employer_id NULLS FIRST, h.worksite_id NULLS FIRST;

SELECT
  m.campaign_id,
  m.fgk,
  m.employer_id,
  m.worksite_id,
  m.canonical_ou_id
FROM public._oux_wp21_canonical_basis AS m
LEFT JOIN _wp21_h10_sets AS h
  ON h.campaign_id = m.campaign_id
 AND h.fgk = m.fgk
 AND h.employer_id IS NOT DISTINCT FROM m.employer_id
 AND h.worksite_id IS NOT DISTINCT FROM m.worksite_id
LEFT JOIN _wp21_unit_facts AS canonical
  ON canonical.ou_id = m.canonical_ou_id
 AND canonical.campaign_id = m.campaign_id
 AND canonical.fgk = m.fgk
 AND canonical.employer_id IS NOT DISTINCT FROM m.employer_id
 AND canonical.worksite_id IS NOT DISTINCT FROM m.worksite_id
WHERE h.campaign_id IS NULL
   OR canonical.ou_id IS NULL
   OR NOT canonical.auto_match_enabled
ORDER BY m.campaign_id, m.fgk, m.canonical_ou_id;

DO $mapping_validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _wp21_h10_sets AS h
    LEFT JOIN public._oux_wp21_canonical_basis AS m
      ON m.campaign_id = h.campaign_id
     AND m.fgk = h.fgk
     AND m.employer_id IS NOT DISTINCT FROM h.employer_id
     AND m.worksite_id IS NOT DISTINCT FROM h.worksite_id
    WHERE m.canonical_ou_id IS NULL
  ) THEN
    RAISE EXCEPTION '03a STOP: every H10 set requires a canonical mapping';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public._oux_wp21_canonical_basis AS m
    LEFT JOIN _wp21_h10_sets AS h
      ON h.campaign_id = m.campaign_id
     AND h.fgk = m.fgk
     AND h.employer_id IS NOT DISTINCT FROM m.employer_id
     AND h.worksite_id IS NOT DISTINCT FROM m.worksite_id
    LEFT JOIN _wp21_unit_facts AS canonical
      ON canonical.ou_id = m.canonical_ou_id
     AND canonical.campaign_id = m.campaign_id
     AND canonical.fgk = m.fgk
     AND canonical.employer_id IS NOT DISTINCT FROM m.employer_id
     AND canonical.worksite_id IS NOT DISTINCT FROM m.worksite_id
    WHERE h.campaign_id IS NULL
       OR canonical.ou_id IS NULL
       OR NOT canonical.auto_match_enabled
  ) THEN
    RAISE EXCEPTION '03a STOP: a canonical mapping is stale, outside its set, or already disabled';
  END IF;
END;
$mapping_validation$;

CREATE TEMP TABLE _wp21_to_disable ON COMMIT DROP AS
SELECT
  uf.ou_id,
  m.canonical_ou_id
FROM _wp21_unit_facts AS uf
JOIN public._oux_wp21_canonical_basis AS m
  ON m.campaign_id = uf.campaign_id
 AND m.fgk = uf.fgk
 AND m.employer_id IS NOT DISTINCT FROM uf.employer_id
 AND m.worksite_id IS NOT DISTINCT FROM uf.worksite_id
WHERE uf.ou_id <> m.canonical_ou_id
  AND uf.auto_match_enabled;

CREATE TEMP TABLE _wp21_baseline_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp21_baseline_counts (metric, value)
VALUES
  ('units', (SELECT count(*) FROM public.campaign_organising_units)),
  ('placements', (SELECT count(*) FROM public.campaign_worker_ou)),
  ('membership', (SELECT count(*) FROM public.campaign_worker_membership));

CREATE TEMP TABLE _wp21_dep_before (
  constraint_oid oid PRIMARY KEY,
  row_count bigint NOT NULL,
  checksum text NOT NULL
) ON COMMIT DROP;

DO $capture_dependants_before$
DECLARE
  r record;
  v_pk_expression text;
  v_count bigint;
  v_checksum text;
BEGIN
  FOR r IN
    SELECT
      con.oid AS constraint_oid,
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
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.campaign_organising_units'::regclass
          AND attname = 'ou_id' AND NOT attisdropped
      )
      AND con.conrelid <> 'public.campaign_worker_ou'::regclass
  LOOP
    SELECT string_agg(format('t.%I::text', a.attname), ', ' ORDER BY key_col.ordinality)
      INTO v_pk_expression
    FROM pg_index AS i
    CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_col(attnum, ordinality)
    JOIN pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = key_col.attnum
    WHERE i.indrelid = r.conrelid AND i.indisprimary;

    IF v_pk_expression IS NULL THEN
      RAISE EXCEPTION 'Referenced table % has no primary key for a stable checksum', r.source_table;
    END IF;

    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(concat_ws(''|'', %s, t.%I::text), '','' ORDER BY %s, t.%I::text), '''')) FROM %s AS t WHERE t.%I IS NOT NULL',
      v_pk_expression, r.source_column, v_pk_expression, r.source_column,
      r.source_table, r.source_column
    )
    INTO v_count, v_checksum;

    INSERT INTO _wp21_dep_before VALUES (r.constraint_oid, v_count, v_checksum);
  END LOOP;
END;
$capture_dependants_before$;

CREATE TEMP TABLE _wp21_03a_log_ids (
  log_id bigint PRIMARY KEY,
  ou_id integer NOT NULL
) ON COMMIT DROP;

WITH logged AS (
  INSERT INTO public._oux_hygiene_log (
    script,
    action,
    table_name,
    row_pk,
    before_row,
    after_row,
    note
  )
  SELECT
    '03a_canonicalise_duplicate_bases',
    'update',
    'campaign_organising_units',
    jsonb_build_object('ou_id', cou.ou_id),
    to_jsonb(cou),
    NULL,
    format('C1 noncanonical basis; canonical_ou_id=%s', d.canonical_ou_id)
  FROM _wp21_to_disable AS d
  JOIN public.campaign_organising_units AS cou ON cou.ou_id = d.ou_id
  RETURNING log_id, (row_pk ->> 'ou_id')::integer AS ou_id
)
INSERT INTO _wp21_03a_log_ids (log_id, ou_id)
SELECT log_id, ou_id FROM logged;

UPDATE public.campaign_organising_units AS cou
SET unit_basis = coalesce(cou.unit_basis, '{}'::jsonb) || '{"auto_match": false}'::jsonb
FROM _wp21_to_disable AS d
WHERE cou.ou_id = d.ou_id;

UPDATE public._oux_hygiene_log AS log
SET after_row = to_jsonb(cou)
FROM _wp21_03a_log_ids AS changed
JOIN public.campaign_organising_units AS cou ON cou.ou_id = changed.ou_id
WHERE log.log_id = changed.log_id;

-- Re-evaluate F1 after the C1 updates, using the same live-campaign and
-- employer/worksite OR universe predicate as the application. All current
-- workers are considered because invocation batches/write access only reduce
-- execution; they do not change ranking inside a future-group partition.
CREATE TEMP TABLE _wp21_03a_f1_residual ON COMMIT DROP AS
WITH raw_candidates AS (
  SELECT
    uf.campaign_id,
    uf.fgk,
    w.worker_id,
    uf.ou_id,
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
  JOIN public.campaign_organising_units AS cou ON cou.ou_id = uf.ou_id
  WHERE c.status IN ('planning', 'active')
    AND c.is_sms_episode = false
    AND (cou.unit_basis -> 'auto_match') IS DISTINCT FROM 'false'::jsonb
    AND (uf.employer_id IS NOT NULL OR uf.worksite_id IS NOT NULL)
    AND (uf.employer_id IS NULL OR uf.employer_id = w.employer_id)
    AND (uf.worksite_id IS NULL OR uf.worksite_id = w.worksite_id)
),
ranked_candidates AS (
  SELECT
    raw_candidates.*,
    -- SPECIFICITY-RANKING-BEGIN
    max(basis_specificity) OVER (
      PARTITION BY campaign_id, fgk, worker_id
    )
    -- SPECIFICITY-RANKING-END
      AS maximum_matching_specificity
  FROM raw_candidates
)
SELECT
  campaign_id,
  fgk,
  worker_id,
  count(*) AS pre_specificity_targets,
  count(*) FILTER (
    WHERE basis_specificity = maximum_matching_specificity
  ) AS maximum_specificity_targets,
  count(*) - count(*) FILTER (
    WHERE basis_specificity = maximum_matching_specificity
  ) AS fallback_targets_suppressed
FROM ranked_candidates
GROUP BY campaign_id, fgk, worker_id;

SELECT
  campaign_id,
  fgk,
  worker_id,
  pre_specificity_targets,
  maximum_specificity_targets,
  fallback_targets_suppressed
FROM _wp21_03a_f1_residual
WHERE maximum_specificity_targets > 1
ORDER BY campaign_id, fgk, worker_id;

SELECT
  count(*) FILTER (
    WHERE pre_specificity_targets > 1
  ) AS pre_specificity_multi_partitions,
  coalesce(sum(pre_specificity_targets - 1) FILTER (
    WHERE pre_specificity_targets > 1
  ), 0) AS pre_specificity_excess_targets,
  coalesce(sum(fallback_targets_suppressed), 0) AS fallback_targets_suppressed,
  count(*) FILTER (
    WHERE maximum_specificity_targets > 1
  ) AS maximum_specificity_multi_partitions,
  coalesce(sum(maximum_specificity_targets - 1) FILTER (
    WHERE maximum_specificity_targets > 1
  ), 0) AS maximum_specificity_excess_targets,
  count(DISTINCT campaign_id) FILTER (
    WHERE fallback_targets_suppressed > 0
       OR maximum_specificity_targets > 1
  ) AS affected_campaigns
FROM _wp21_03a_f1_residual;

CREATE TEMP TABLE _wp21_dep_after (
  constraint_oid oid PRIMARY KEY,
  row_count bigint NOT NULL,
  checksum text NOT NULL
) ON COMMIT DROP;

DO $capture_dependants_after$
DECLARE
  r record;
  v_pk_expression text;
  v_count bigint;
  v_checksum text;
BEGIN
  FOR r IN
    SELECT
      con.oid AS constraint_oid,
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
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.campaign_organising_units'::regclass
          AND attname = 'ou_id' AND NOT attisdropped
      )
      AND con.conrelid <> 'public.campaign_worker_ou'::regclass
  LOOP
    SELECT string_agg(format('t.%I::text', a.attname), ', ' ORDER BY key_col.ordinality)
      INTO v_pk_expression
    FROM pg_index AS i
    CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_col(attnum, ordinality)
    JOIN pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = key_col.attnum
    WHERE i.indrelid = r.conrelid AND i.indisprimary;

    IF v_pk_expression IS NULL THEN
      RAISE EXCEPTION 'Referenced table % has no primary key for a stable checksum', r.source_table;
    END IF;

    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(concat_ws(''|'', %s, t.%I::text), '','' ORDER BY %s, t.%I::text), '''')) FROM %s AS t WHERE t.%I IS NOT NULL',
      v_pk_expression, r.source_column, v_pk_expression, r.source_column,
      r.source_table, r.source_column
    )
    INTO v_count, v_checksum;

    INSERT INTO _wp21_dep_after VALUES (r.constraint_oid, v_count, v_checksum);
  END LOOP;
END;
$capture_dependants_after$;

DO $postconditions$
DECLARE
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_organising_units)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'units')
     OR (SELECT count(*) FROM public.campaign_worker_ou)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'placements')
     OR (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'membership')
  THEN
    RAISE EXCEPTION '03a post-check failed: unit, placement, or membership count changed';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_dep_before AS before_ref
  FULL JOIN _wp21_dep_after AS after_ref USING (constraint_oid)
  WHERE before_ref.row_count IS DISTINCT FROM after_ref.row_count
     OR before_ref.checksum IS DISTINCT FROM after_ref.checksum;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a post-check failed: % OU-dependant checksums changed', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public._oux_wp21_canonical_basis AS m
  WHERE (
    SELECT count(*)
    FROM public.campaign_organising_units AS cou
    JOIN _wp21_unit_facts AS uf ON uf.ou_id = cou.ou_id
    WHERE uf.campaign_id = m.campaign_id
      AND uf.fgk = m.fgk
      AND uf.employer_id IS NOT DISTINCT FROM m.employer_id
      AND uf.worksite_id IS NOT DISTINCT FROM m.worksite_id
      AND (cou.unit_basis -> 'auto_match') IS DISTINCT FROM 'false'::jsonb
  ) <> 1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a post-check failed: % mapped bases do not have exactly one enabled unit', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03a_f1_residual
  WHERE maximum_specificity_targets > 1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      '03a STOP: % live campaign-universe future-group/worker partitions retain multiple equal-maximum-specificity enabled F1 targets; this transaction is rolled back—extend the canonical mapping only under a reviewed plan amendment before 03b',
      v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03a_log_ids AS changed
  JOIN public._oux_hygiene_log AS log USING (log_id)
  WHERE log.after_row IS NULL
     OR (log.after_row - 'unit_basis' - 'updated_at')
        IS DISTINCT FROM (log.before_row - 'unit_basis' - 'updated_at')
     OR log.after_row -> 'unit_basis'
        IS DISTINCT FROM (
          coalesce(log.before_row -> 'unit_basis', '{}'::jsonb)
          || '{"auto_match": false}'::jsonb
        );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a post-check failed: % audit rows do not describe only the approved C1 edit', v_count;
  END IF;
END;
$postconditions$;

SELECT count(*) AS units_disabled_and_logged
FROM _wp21_03a_log_ids;

COMMIT;
