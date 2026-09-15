-- WP2.2b: one-unit-per-group enforcement (docs/organiser-ux-review/wp/wp2.2.md
-- §3.6 = wp/wp2.1.md §6.4 step 5). Separate from WP2.2a so the operator applies
-- it on production only after the WP2.2 code deploy and the H9 re-count
-- (wp2.2.md §0 step 6 / §6.4 step 3).
--
-- Supabase db push wraps each migration file in one transaction. This file
-- deliberately has no explicit BEGIN/COMMIT so it follows repository convention
-- (wp2.1.md §7.1). Operator alternative: psql -1 -v ON_ERROR_STOP=1 -f <file>.
--
-- Sections, in order:
--   1. Precondition DO block: WP2.2a present, not already applied, H9 = 0.
--   2. DROP INDEX idx_cwo_worker_group (WP2.1 non-unique support index).
--   3. CREATE UNIQUE INDEX campaign_worker_ou_one_unit_per_group (worker_id, group_id).
--   4. cwo_set_group_id(): WP2.1 derivation plus the duplicate pre-check raising
--      unique_violation with CONSTRAINT = 'campaign_worker_ou_one_unit_per_group'.
--   5. campaign_group_membership view (security_invoker), verbatim wp2.1.md §2.3.
--   6. Post-assertions: index exists and is unique; H9 = 0; view row arithmetic.
--
-- Rollback: scripts/data-hygiene/oux-wp2.2/91_rollback_wp2_2_enforcement.sql.
-- No application code consumes the view in WP2.2 (wp2.1.md §2.3 contract).

-- ---------------------------------------------------------------------------
-- 1. Preconditions
-- ---------------------------------------------------------------------------

DO $preconditions$
DECLARE
  v_partitions bigint;
  v_excess bigint;
BEGIN
  IF to_regprocedure('public.structure_placements_assign(integer,integer,integer[],text,boolean,text)') IS NULL
     OR to_regnamespace('oux_internal') IS NULL
  THEN
    RAISE EXCEPTION 'WP2.2b precondition failed: WP2.2a (wp2_2_structure_api) is not applied';
  END IF;

  IF to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP2.2b target objects already exist; refusing a partial or repeated migration';
  END IF;

  IF to_regclass('public.idx_cwo_worker_group') IS NULL THEN
    RAISE EXCEPTION 'WP2.2b precondition failed: the WP2.1 support index idx_cwo_worker_group is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.campaign_worker_ou'::regclass
      AND attname = 'group_id'
      AND NOT attisdropped
      AND NOT attnotnull
  ) THEN
    RAISE EXCEPTION 'WP2.2b precondition failed: campaign_worker_ou.group_id is nullable';
  END IF;

  WITH conflicts AS (
    SELECT cwo.worker_id, cwo.group_id, count(*) AS rows_in_partition
    FROM public.campaign_worker_ou AS cwo
    GROUP BY cwo.worker_id, cwo.group_id
    HAVING count(*) > 1
  )
  SELECT count(*), coalesce(sum(rows_in_partition - 1), 0)
    INTO v_partitions, v_excess
  FROM conflicts;

  IF v_partitions <> 0 THEN
    RAISE EXCEPTION
      'WP2.2b precondition failed: H9 = % partitions (% excess placement rows); run scripts/data-hygiene/oux-wp2.1/03b_resolve_future_group_conflicts.sql first',
      v_partitions, v_excess;
  END IF;
END;
$preconditions$;

CREATE TEMP TABLE _wp22b_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp22b_counts (metric, value)
VALUES
  ('campaign_worker_membership', (SELECT count(*) FROM public.campaign_worker_membership)),
  ('campaign_worker_ou',         (SELECT count(*) FROM public.campaign_worker_ou)),
  ('campaign_organising_units',  (SELECT count(*) FROM public.campaign_organising_units)),
  ('campaign_groups',            (SELECT count(*) FROM public.campaign_groups));

-- ---------------------------------------------------------------------------
-- 2 + 3. Replace the support index with the unique index.
-- ---------------------------------------------------------------------------

DROP INDEX public.idx_cwo_worker_group;

CREATE UNIQUE INDEX campaign_worker_ou_one_unit_per_group
  ON public.campaign_worker_ou (worker_id, group_id);

COMMENT ON INDEX public.campaign_worker_ou_one_unit_per_group IS
  'WP2.2b (wp2.2.md §3.6, rule C-a): a worker is in at most one unit per group per campaign. The structure RPCs and cwo_set_group_id() raise 23505 with this constraint name before the index does, so the client contract is the same either way.';

-- ---------------------------------------------------------------------------
-- 4. Derive-and-check placement trigger function (WP2.1 body + pre-check).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cwo_set_group_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_group_id integer;
BEGIN
  SELECT cou.group_id
    INTO v_group_id
  FROM public.campaign_organising_units AS cou
  WHERE cou.ou_id = NEW.ou_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'unit % has no group (is it a legacy container?)', NEW.ou_id;
  END IF;

  -- WP2.2b (wp2.2.md §3.6 item 4): readable duplicate rejection; the unique
  -- index campaign_worker_ou_one_unit_per_group is the guarantee.
  IF EXISTS (
    SELECT 1
    FROM public.campaign_worker_ou AS x
    WHERE x.worker_id = NEW.worker_id
      AND x.group_id = v_group_id
      AND x.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'campaign_worker_ou_one_unit_per_group',
      TABLE = 'campaign_worker_ou',
      SCHEMA = 'public',
      MESSAGE = 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
      DETAIL = format(
        'Key (worker_id, group_id)=(%s, %s) already exists. Worker %s already has a placement in group %s; move it instead of adding a second one.',
        NEW.worker_id, v_group_id, NEW.worker_id, v_group_id
      ),
      HINT = 'A worker is in at most one unit per group (wp2.2.md §3.4 C-a).';
  END IF;

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.cwo_set_group_id() IS
  'WP2.1 derive-only placement trigger extended by WP2.2b (wp2.2.md §3.6): derives group_id from the unit and rejects a second (worker_id, group_id) row with 23505 / campaign_worker_ou_one_unit_per_group before the unique index does.';

-- ---------------------------------------------------------------------------
-- 5. campaign_group_membership (verbatim wp2.1.md §2.3).
-- ---------------------------------------------------------------------------

create view public.campaign_group_membership with (security_invoker = true) as
select g.campaign_id, g.group_id, g.kind, g.name as group_name, m.worker_id,
       p.id as placement_id, p.ou_id, p.is_primary, p.assignment_source
from public.campaign_worker_membership m
join public.campaign_groups g on g.campaign_id = m.campaign_id
left join public.campaign_worker_ou p on p.worker_id = m.worker_id and p.group_id = g.group_id;
-- Grants (fix round 1, blocking finding 1): the view is created by postgres in
-- public, where the baseline's ALTER DEFAULT PRIVILEGES (20260908050000:33393-33396)
-- gives anon/authenticated/service_role ALL on new tables and views. wp2.1.md §2.3
-- revoked only from public, anon; that would leave authenticated with
-- INSERT/UPDATE/DELETE on the view (and fail the post-assertion below).
REVOKE ALL ON public.campaign_group_membership FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.campaign_group_membership TO authenticated, service_role;

ALTER VIEW public.campaign_group_membership OWNER TO postgres;

COMMENT ON VIEW public.campaign_group_membership IS
  'WP2.2b (wp2.1.md §2.3, wp2.2.md §3.6): one row per (campaign, group, member); placement columns NULL when the member is Unassigned in that group (derived, never stored). Exactly one row per pair because (worker_id, group_id) is unique. Consumption contract: no application code reads this view until WP2.2b is on the target database (WP2.4+).';

-- ---------------------------------------------------------------------------
-- 6. Post-assertions
-- ---------------------------------------------------------------------------

DO $postconditions$
DECLARE
  v_count bigint;
  v_prosrc text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    JOIN pg_class AS c ON c.oid = i.indexrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'campaign_worker_ou_one_unit_per_group'
      AND i.indrelid = 'public.campaign_worker_ou'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indnatts = 2
  ) THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: campaign_worker_ou_one_unit_per_group is missing or not a valid unique index';
  END IF;

  IF to_regclass('public.idx_cwo_worker_group') IS NOT NULL THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: idx_cwo_worker_group still exists';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT cwo.worker_id, cwo.group_id
    FROM public.campaign_worker_ou AS cwo
    GROUP BY cwo.worker_id, cwo.group_id
    HAVING count(*) > 1
  ) AS h9;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: H9 = % partitions', v_count;
  END IF;

  SELECT p.prosrc INTO v_prosrc
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cwo_set_group_id';
  IF v_prosrc IS NULL OR position('campaign_worker_ou_one_unit_per_group' IN v_prosrc) = 0 THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: cwo_set_group_id() lacks the duplicate pre-check';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.campaign_worker_ou'::regclass
      AND t.tgname = 'trg_cwo_z_set_group_id'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: trg_cwo_z_set_group_id is missing or disabled';
  END IF;

  IF to_regclass('public.campaign_group_membership') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_class AS c
       WHERE c.oid = 'public.campaign_group_membership'::regclass
         AND c.relkind = 'v'
         AND 'security_invoker=true' = ANY (c.reloptions)
     )
  THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: campaign_group_membership is missing or not security_invoker';
  END IF;
  IF has_table_privilege('anon', 'public.campaign_group_membership', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.campaign_group_membership', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.campaign_group_membership', 'SELECT')
     OR has_table_privilege('authenticated', 'public.campaign_group_membership', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role', 'public.campaign_group_membership', 'INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: campaign_group_membership grants are incorrect';
  END IF;

  -- View row arithmetic: one row per (group, member) per campaign.
  SELECT count(*) INTO v_count
  FROM (
    SELECT
      c.campaign_id,
      (SELECT count(*) FROM public.campaign_groups AS g WHERE g.campaign_id = c.campaign_id) AS groups,
      (SELECT count(*) FROM public.campaign_worker_membership AS m WHERE m.campaign_id = c.campaign_id) AS members,
      (SELECT count(*) FROM public.campaign_group_membership AS v WHERE v.campaign_id = c.campaign_id) AS view_rows
    FROM public.campaigns AS c
  ) AS x
  WHERE x.view_rows <> x.groups * x.members;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: view row arithmetic differs from groups × members in % campaigns', v_count;
  END IF;

  IF (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp22b_counts WHERE metric = 'campaign_worker_membership')
     OR (SELECT count(*) FROM public.campaign_worker_ou)
       <> (SELECT value FROM _wp22b_counts WHERE metric = 'campaign_worker_ou')
     OR (SELECT count(*) FROM public.campaign_organising_units)
       <> (SELECT value FROM _wp22b_counts WHERE metric = 'campaign_organising_units')
     OR (SELECT count(*) FROM public.campaign_groups)
       <> (SELECT value FROM _wp22b_counts WHERE metric = 'campaign_groups')
  THEN
    RAISE EXCEPTION 'WP2.2b postcondition failed: membership, placement, unit or group counts changed';
  END IF;

  RAISE NOTICE 'WP2.2b applied: unique index, duplicate pre-check and campaign_group_membership in place; H9 = 0';
END;
$postconditions$;

SELECT
  (SELECT count(*) FROM public.campaign_worker_ou) AS placements,
  (SELECT count(*) FROM public.campaign_group_membership) AS view_rows,
  (SELECT count(*) FROM public.campaign_groups) AS groups,
  (SELECT count(*) FROM (
     SELECT 1 FROM public.campaign_worker_ou GROUP BY worker_id, group_id HAVING count(*) > 1
   ) AS h9) AS h9_partitions;
