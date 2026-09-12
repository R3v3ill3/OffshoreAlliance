-- Exact rollback for active 03a C1 audit rows.
-- Restores both unit_basis and the pre-change updated_at value. Added WP2.1
-- columns are tolerated because jsonb_populate_record ignores missing keys.

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
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '03a rollback requires _oux_hygiene_log';
  END IF;
END;
$required_objects$;

CREATE TEMP TABLE _wp21_03a_active_logs ON COMMIT DROP AS
SELECT log_id, row_pk, before_row, after_row
FROM public._oux_hygiene_log
WHERE script = '03a_canonicalise_duplicate_bases'
  AND action = 'update'
  AND table_name = 'campaign_organising_units'
  AND rolled_back_at IS NULL;

DO $preconditions$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM (
    SELECT (row_pk ->> 'ou_id')::integer
    FROM _wp21_03a_active_logs
    GROUP BY (row_pk ->> 'ou_id')::integer
    HAVING count(*) > 1
  ) AS duplicate_logs;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a rollback STOP: % units have multiple active audit rows', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03a_active_logs AS log
  LEFT JOIN public.campaign_organising_units AS cou
    ON cou.ou_id = (log.row_pk ->> 'ou_id')::integer
  WHERE cou.ou_id IS NULL
     OR cou.unit_basis IS DISTINCT FROM
        (jsonb_populate_record(NULL::public.campaign_organising_units, log.after_row)).unit_basis;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a rollback STOP: % target units are missing or changed since 03a', v_count;
  END IF;
END;
$preconditions$;

CREATE TEMP TABLE _wp21_03a_rollback_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;
INSERT INTO _wp21_03a_rollback_counts
VALUES
  ('units', (SELECT count(*) FROM public.campaign_organising_units)),
  ('placements', (SELECT count(*) FROM public.campaign_worker_ou)),
  ('membership', (SELECT count(*) FROM public.campaign_worker_membership));

ALTER TABLE public.campaign_organising_units
  DISABLE TRIGGER trg_campaign_organising_units_updated_at;

UPDATE public.campaign_organising_units AS cou
SET
  unit_basis =
    (jsonb_populate_record(NULL::public.campaign_organising_units, log.before_row)).unit_basis,
  updated_at =
    (jsonb_populate_record(NULL::public.campaign_organising_units, log.before_row)).updated_at
FROM _wp21_03a_active_logs AS log
WHERE cou.ou_id = (log.row_pk ->> 'ou_id')::integer;

-- Clear any deferred RI events raised by the restore before ALTER TABLE
-- re-enables the timestamp trigger.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public.campaign_organising_units
  ENABLE TRIGGER trg_campaign_organising_units_updated_at;

UPDATE public._oux_hygiene_log AS persisted
SET rolled_back_at = now()
FROM _wp21_03a_active_logs AS active
WHERE persisted.log_id = active.log_id;

DO $postconditions$
DECLARE
  v_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_organising_units)
       <> (SELECT value FROM _wp21_03a_rollback_counts WHERE metric = 'units')
     OR (SELECT count(*) FROM public.campaign_worker_ou)
       <> (SELECT value FROM _wp21_03a_rollback_counts WHERE metric = 'placements')
     OR (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_03a_rollback_counts WHERE metric = 'membership')
  THEN
    RAISE EXCEPTION '03a rollback post-check failed: application row counts changed';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03a_active_logs AS log
  JOIN public.campaign_organising_units AS cou
    ON cou.ou_id = (log.row_pk ->> 'ou_id')::integer
  WHERE cou.unit_basis IS DISTINCT FROM
        (jsonb_populate_record(NULL::public.campaign_organising_units, log.before_row)).unit_basis
     OR cou.updated_at IS DISTINCT FROM
        (jsonb_populate_record(NULL::public.campaign_organising_units, log.before_row)).updated_at;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a rollback post-check failed: % units were not restored exactly', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_03a_active_logs AS active
  JOIN public._oux_hygiene_log AS persisted USING (log_id)
  WHERE persisted.rolled_back_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '03a rollback post-check failed: % logs remain active', v_count;
  END IF;
END;
$postconditions$;

SELECT count(*) AS units_restored
FROM _wp21_03a_active_logs;

COMMIT;
