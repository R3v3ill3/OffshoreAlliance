-- Exact rollback for active 03b placement deletions and keeper promotions.
-- Works before or after WP2.1 because its placement trigger only re-derives
-- group_id. Refuses to run after WP2.2 uniqueness enforcement.

BEGIN;

-- A future production operator must add SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission.
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

DO $enforcement_guard$
BEGIN
  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
  THEN
    RAISE EXCEPTION '03b rollback STOP: WP2.2 enforcement objects exist';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL
     OR to_regclass('public._oux_wp21_conflicts') IS NULL
  THEN
    RAISE EXCEPTION '03b rollback requires _oux_hygiene_log and _oux_wp21_conflicts';
  END IF;
END;
$enforcement_guard$;

CREATE TEMP TABLE _wp21_03b_active_logs ON COMMIT DROP AS
SELECT log_id, action, row_pk, before_row, after_row
FROM public._oux_hygiene_log
WHERE script = '03b_resolve_future_group_conflicts'
  AND table_name = 'campaign_worker_ou'
  AND action IN ('delete', 'update')
  AND rolled_back_at IS NULL;

DO $preconditions$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM (
    SELECT (row_pk ->> 'id')::integer
    FROM _wp21_03b_active_logs
    GROUP BY (row_pk ->> 'id')::integer
    HAVING count(*) > 1
  ) AS duplicate_logs;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback STOP: % placement IDs have multiple active audit rows', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_active_logs AS log
  JOIN public.campaign_worker_ou AS cwo
    ON cwo.id = (log.row_pk ->> 'id')::integer
  WHERE log.action = 'delete';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback STOP: % deleted placement IDs already exist', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_active_logs AS log
  LEFT JOIN public.campaign_organising_units AS cou
    ON cou.ou_id =
       (jsonb_populate_record(NULL::public.campaign_worker_ou, log.before_row)).ou_id
  WHERE log.action = 'delete'
    AND cou.ou_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback STOP: % deleted placements refer to missing units', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_active_logs AS log
  LEFT JOIN public.campaign_worker_ou AS cwo
    ON cwo.id = (log.row_pk ->> 'id')::integer
  WHERE log.action = 'update'
    AND (
      cwo.id IS NULL
      OR NOT (
        (to_jsonb(cwo) - 'group_id')
        @> (log.after_row - 'group_id')
      )
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback STOP: % promoted keepers are missing or changed', v_count;
  END IF;
END;
$preconditions$;

CREATE TEMP TABLE _wp21_03b_rollback_baseline (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;
INSERT INTO _wp21_03b_rollback_baseline
VALUES
  ('placements', (SELECT count(*) FROM public.campaign_worker_ou)),
  ('membership', (SELECT count(*) FROM public.campaign_worker_membership));

INSERT INTO public.campaign_worker_ou
SELECT (jsonb_populate_record(NULL::public.campaign_worker_ou, log.before_row)).*
FROM _wp21_03b_active_logs AS log
WHERE log.action = 'delete'
ORDER BY log.log_id;

UPDATE public.campaign_worker_ou AS cwo
SET is_primary =
  (jsonb_populate_record(NULL::public.campaign_worker_ou, log.before_row)).is_primary
FROM _wp21_03b_active_logs AS log
WHERE log.action = 'update'
  AND cwo.id = (log.row_pk ->> 'id')::integer;

UPDATE public._oux_hygiene_log AS persisted
SET rolled_back_at = now()
FROM _wp21_03b_active_logs AS active
WHERE persisted.log_id = active.log_id;

UPDATE public._oux_wp21_conflicts
SET status = 'rolled_back',
    rolled_back_at = now()
WHERE status = 'applied';

DO $postconditions$
DECLARE
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_03b_rollback_baseline WHERE metric = 'membership')
  THEN
    RAISE EXCEPTION '03b rollback post-check failed: membership count changed';
  END IF;

  IF (SELECT count(*) FROM public.campaign_worker_ou)
       <> (
         (SELECT value FROM _wp21_03b_rollback_baseline WHERE metric = 'placements')
         + (SELECT count(*) FROM _wp21_03b_active_logs WHERE action = 'delete')
       )
  THEN
    RAISE EXCEPTION '03b rollback post-check failed: placement count was not restored';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_active_logs AS log
  LEFT JOIN public.campaign_worker_ou AS cwo
    ON cwo.id = (log.row_pk ->> 'id')::integer
  WHERE cwo.id IS NULL
     OR NOT (
       (to_jsonb(cwo) - 'group_id')
       @> (log.before_row - 'group_id')
     );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback post-check failed: % placements were not restored exactly', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03b_active_logs AS active
  JOIN public._oux_hygiene_log AS persisted USING (log_id)
  WHERE persisted.rolled_back_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03b rollback post-check failed: % audit rows remain active', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public._oux_wp21_conflicts
    WHERE status = 'applied'
  ) THEN
    RAISE EXCEPTION '03b rollback post-check failed: diagnostic rows still look applied';
  END IF;
END;
$postconditions$;

SELECT
  count(*) FILTER (WHERE action = 'delete') AS placements_reinserted,
  count(*) FILTER (WHERE action = 'update') AS keeper_promotions_reverted
FROM _wp21_03b_active_logs;

COMMIT;
