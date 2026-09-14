-- WP2.2 R1-b (docs/organiser-ux-review/wp/wp2.2.md §3.8): relabel pre-WP2.2
-- universe-sync placements that were stamped assignment_source = 'rule' with
-- no assigned_rule_id as 'universe', so the next Recompute
-- (structure_placements_replace_rule_rows, which withdraws only 'rule' rows)
-- does not remove them. Operator-run only; never a migration.
-- Every changed row is logged to public._oux_hygiene_log (WP0.4 shape).
-- Idempotent: a re-run updates and logs 0 rows.

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
DECLARE
  v_def text;
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '20 requires public._oux_hygiene_log (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.campaign_worker_ou'::regclass
    AND c.conname = 'campaign_worker_ou_assignment_source_check';
  IF v_def IS NULL OR position('universe' IN v_def) = 0 THEN
    RAISE EXCEPTION '20 requires WP2.2a (assignment_source CHECK does not allow ''universe'')';
  END IF;
END;
$required_objects$;

CREATE TEMP TABLE _wp22_20_before ON COMMIT DROP AS
SELECT
  count(*) FILTER (WHERE assignment_source = 'rule' AND assigned_rule_id IS NULL) AS rule_null_rule_id,
  count(*) FILTER (WHERE assignment_source = 'rule' AND assigned_rule_id IS NOT NULL) AS rule_attributed,
  count(*) FILTER (WHERE assignment_source = 'universe') AS universe,
  count(*) FILTER (WHERE assignment_source = 'manual') AS manual,
  count(*) AS total
FROM public.campaign_worker_ou;

CREATE TEMP TABLE _wp22_20_log_ids (log_id bigint PRIMARY KEY) ON COMMIT DROP;

WITH changed AS (
  UPDATE public.campaign_worker_ou AS p
  SET assignment_source = 'universe'
  WHERE p.assignment_source = 'rule'
    AND p.assigned_rule_id IS NULL
  RETURNING p.id, p.ou_id, p.worker_id, p.is_primary, p.group_id
),
logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT
    '20_relabel_unattributed_rule_rows',
    'update',
    'campaign_worker_ou',
    jsonb_build_object('id', c.id),
    jsonb_build_object(
      'id', c.id, 'ou_id', c.ou_id, 'worker_id', c.worker_id, 'is_primary', c.is_primary,
      'group_id', c.group_id, 'assignment_source', 'rule', 'assigned_rule_id', NULL
    ),
    jsonb_build_object(
      'id', c.id, 'ou_id', c.ou_id, 'worker_id', c.worker_id, 'is_primary', c.is_primary,
      'group_id', c.group_id, 'assignment_source', 'universe', 'assigned_rule_id', NULL
    ),
    'WP2.2 R1-b (wp2.2.md §3.8): unattributed rule-source row relabelled universe'
  FROM changed AS c
  RETURNING log_id
)
INSERT INTO _wp22_20_log_ids (log_id)
SELECT log_id FROM logged;

DO $postconditions$
DECLARE
  v_before record;
  v_after_rule_null bigint;
  v_after_universe bigint;
  v_after_total bigint;
  v_logged bigint := (SELECT count(*) FROM _wp22_20_log_ids);
BEGIN
  SELECT * INTO v_before FROM _wp22_20_before;
  SELECT
    count(*) FILTER (WHERE assignment_source = 'rule' AND assigned_rule_id IS NULL),
    count(*) FILTER (WHERE assignment_source = 'universe'),
    count(*)
    INTO v_after_rule_null, v_after_universe, v_after_total
  FROM public.campaign_worker_ou;

  IF v_after_rule_null <> 0 THEN
    RAISE EXCEPTION '20 post-check failed: % unattributed rule rows remain', v_after_rule_null;
  END IF;
  IF v_after_universe <> v_before.universe + v_before.rule_null_rule_id THEN
    RAISE EXCEPTION '20 post-check failed: universe rows after (%) <> before (%) + relabelled (%)',
      v_after_universe, v_before.universe, v_before.rule_null_rule_id;
  END IF;
  IF v_after_total <> v_before.total THEN
    RAISE EXCEPTION '20 post-check failed: placement count changed (% -> %)', v_before.total, v_after_total;
  END IF;
  IF v_logged <> v_before.rule_null_rule_id THEN
    RAISE EXCEPTION '20 post-check failed: logged % rows but relabelled %', v_logged, v_before.rule_null_rule_id;
  END IF;
END;
$postconditions$;

SELECT
  b.rule_null_rule_id AS rule_null_rule_id_before,
  (SELECT count(*) FROM public.campaign_worker_ou WHERE assignment_source = 'rule' AND assigned_rule_id IS NULL) AS rule_null_rule_id_after,
  b.rule_attributed AS rule_attributed_unchanged,
  b.universe AS universe_before,
  (SELECT count(*) FROM public.campaign_worker_ou WHERE assignment_source = 'universe') AS universe_after,
  b.manual AS manual_unchanged,
  b.total AS total_placements,
  (SELECT count(*) FROM _wp22_20_log_ids) AS rows_logged
FROM _wp22_20_before AS b;

COMMIT;
