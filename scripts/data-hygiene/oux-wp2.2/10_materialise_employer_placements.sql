-- WP2.2 M2-a (docs/organiser-ux-review/wp/wp2.2.md §3.7): materialise Employer
-- placements for members of worksite children through the structure API.
-- Operator-run only; never a migration. Run as postgres (or service_role): the
-- RPC's permission pre-check admits an RLS-bypassing session without a JWT.
-- Idempotent: a re-run prints inserted = 0 for every campaign.
--
-- STOP condition (wp2.2.md §8.4 item 4): if any worker's worksite-child
-- placements span more than one Employer container within a campaign, this
-- script raises before calling the RPC and nothing is committed.

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
  v_bypass boolean;
BEGIN
  IF to_regprocedure('public.structure_materialise_employer_placements(integer)') IS NULL THEN
    RAISE EXCEPTION '10 requires WP2.2a (structure_materialise_employer_placements is missing)';
  END IF;
  SELECT (r.rolsuper OR r.rolbypassrls) INTO v_bypass
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = current_user;
  IF NOT coalesce(v_bypass, false) THEN
    RAISE EXCEPTION '10 must run as postgres or service_role (current_user = %)', current_user;
  END IF;
END;
$required_objects$;

-- STOP: workers whose worksite-child placements span more than one Employer
-- container in the same campaign. Aggregates only.
DO $stop_condition$
DECLARE
  v_workers bigint;
  v_campaigns bigint;
BEGIN
  WITH containers AS (
    SELECT c.campaign_id, c.ou_id, c.group_id
    FROM public.campaign_organising_units AS c
    WHERE c.is_group_container AND c.group_id IS NOT NULL
  ),
  spans AS (
    SELECT c.campaign_id, p.worker_id, count(DISTINCT c.ou_id) AS containers
    FROM public.campaign_worker_ou AS p
    JOIN public.campaign_organising_units AS u ON u.ou_id = p.ou_id
    JOIN containers AS c ON c.ou_id = u.ou_group_id
    WHERE NOT u.is_group_container
      AND u.group_id IS DISTINCT FROM c.group_id
    GROUP BY c.campaign_id, p.worker_id
    HAVING count(DISTINCT c.ou_id) > 1
  )
  SELECT count(*), count(DISTINCT campaign_id) INTO v_workers, v_campaigns FROM spans;

  IF v_workers <> 0 THEN
    RAISE EXCEPTION
      '10 STOP (wp2.2.md §8.4 item 4): % worker/campaign pairs across % campaigns would receive more than one Employer placement; resolve with oux-wp2.1/03b first',
      v_workers, v_campaigns;
  END IF;
END;
$stop_condition$;

CREATE TEMP TABLE _wp22_10_before ON COMMIT DROP AS
SELECT u.campaign_id, count(*)::bigint AS placements
FROM public.campaign_worker_ou AS p
JOIN public.campaign_organising_units AS u ON u.ou_id = p.ou_id
GROUP BY u.campaign_id;

CREATE TEMP TABLE _wp22_10_h9_before ON COMMIT DROP AS
SELECT count(*)::bigint AS partitions
FROM (
  SELECT 1 FROM public.campaign_worker_ou GROUP BY worker_id, group_id HAVING count(*) > 1
) AS h9;

CREATE TEMP TABLE _wp22_10_results (
  campaign_id integer PRIMARY KEY,
  inserted integer NOT NULL,
  skipped_existing integer NOT NULL,
  containers integer NOT NULL,
  multi_container_workers integer NOT NULL
) ON COMMIT DROP;

DO $run$
DECLARE
  v_campaign integer;
  v_res jsonb;
BEGIN
  FOR v_campaign IN
    SELECT c.campaign_id FROM public.campaigns AS c ORDER BY c.campaign_id
  LOOP
    v_res := public.structure_materialise_employer_placements(v_campaign);
    INSERT INTO _wp22_10_results (campaign_id, inserted, skipped_existing, containers, multi_container_workers)
    VALUES (
      v_campaign,
      (v_res ->> 'inserted')::integer,
      (v_res ->> 'skipped_existing')::integer,
      (v_res ->> 'containers')::integer,
      (v_res ->> 'multi_container_workers')::integer
    );
  END LOOP;

  IF (SELECT coalesce(sum(multi_container_workers), 0) FROM _wp22_10_results) <> 0 THEN
    RAISE EXCEPTION '10 STOP: the RPC reported % multi-container workers',
      (SELECT sum(multi_container_workers) FROM _wp22_10_results);
  END IF;
END;
$run$;

DO $postconditions$
DECLARE
  v_before bigint := (SELECT coalesce(sum(placements), 0) FROM _wp22_10_before);
  v_inserted bigint := (SELECT coalesce(sum(inserted), 0) FROM _wp22_10_results);
  v_after bigint := (SELECT count(*) FROM public.campaign_worker_ou);
  v_h9_before bigint := (SELECT partitions FROM _wp22_10_h9_before);
  v_h9_after bigint;
  v_bad bigint;
BEGIN
  IF v_after <> v_before + v_inserted THEN
    RAISE EXCEPTION '10 post-check failed: placements after (%) <> before (%) + inserted (%)', v_after, v_before, v_inserted;
  END IF;

  SELECT count(*) INTO v_h9_after
  FROM (
    SELECT 1 FROM public.campaign_worker_ou GROUP BY worker_id, group_id HAVING count(*) > 1
  ) AS h9;
  IF v_h9_after <> v_h9_before THEN
    RAISE EXCEPTION '10 post-check failed: H9 partitions changed from % to %', v_h9_before, v_h9_after;
  END IF;

  -- Every inserted row is a universe-source, non-primary placement on a
  -- container that has a group, and no container row lacks a group.
  SELECT count(*) INTO v_bad
  FROM public.campaign_worker_ou AS p
  JOIN public.campaign_organising_units AS u ON u.ou_id = p.ou_id
  WHERE u.is_group_container
    AND (u.group_id IS NULL OR p.group_id IS DISTINCT FROM u.group_id);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '10 post-check failed: % container placements have an inconsistent group', v_bad;
  END IF;
END;
$postconditions$;

SELECT
  r.campaign_id::text AS campaign,
  coalesce(b.placements, 0) AS placements_before,
  coalesce(b.placements, 0) + r.inserted AS placements_after,
  r.inserted,
  r.skipped_existing,
  r.containers,
  r.multi_container_workers
FROM _wp22_10_results AS r
LEFT JOIN _wp22_10_before AS b USING (campaign_id)
UNION ALL
SELECT
  'TOTAL',
  (SELECT coalesce(sum(placements), 0) FROM _wp22_10_before),
  (SELECT count(*) FROM public.campaign_worker_ou),
  (SELECT coalesce(sum(inserted), 0) FROM _wp22_10_results),
  (SELECT coalesce(sum(skipped_existing), 0) FROM _wp22_10_results),
  (SELECT coalesce(sum(containers), 0) FROM _wp22_10_results),
  (SELECT coalesce(sum(multi_container_workers), 0) FROM _wp22_10_results)
UNION ALL
SELECT
  'H9_PARTITIONS_BEFORE_AFTER',
  (SELECT partitions FROM _wp22_10_h9_before),
  (SELECT count(*) FROM (SELECT 1 FROM public.campaign_worker_ou GROUP BY worker_id, group_id HAVING count(*) > 1) AS h9),
  0, 0, 0, 0
ORDER BY 1;

COMMIT;
