-- WP2.1: campaign groups, derived group ids, and per-user campaign preferences.
-- Approved decisions: E2 (enforcement/view deferred), M2 (no Employer placements),
-- C1 (non-destructive basis canonicalisation), and F1 (application matcher fix).
-- This migration intentionally does not create campaign_group_membership or a
-- unique (worker_id, group_id) index. WP2.2 owns both after writer replacement.
-- Supabase db push wraps each migration file in one transaction. This file
-- deliberately has no explicit BEGIN/COMMIT so it follows repository convention;
-- its temp tables and assertions live for that CLI-managed transaction.

-- ---------------------------------------------------------------------------
-- 1. Pure mapping and group-lookup helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campaign_group_kind_for_ou_type(p_ou_type text)
RETURNS TABLE (kind text, label text, rank integer)
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
  SELECT v.kind, v.label, v.rank
  FROM (VALUES
    ('worksite',         'worksite',   'Worksite',          10),
    ('employer',         'employer',   'Employer',          20),
    ('shift',            'shift',      'Shift',             30),
    ('crew_rotation',    'crew',       'Crew',              40),
    ('job_type',         'occupation', 'Occupation',        50),
    ('work_area',        'work_area',  'Work area',         60),
    ('department',       'custom',     'Department',        71),
    ('custom',           'custom',     'Custom',            72),
    ('network',          'custom',     'Network',           73),
    ('ethnic_community', 'custom',     'Ethnic community',  74),
    ('accommodation',    'custom',     'Accommodation',     75)
  ) AS v(ou_type, kind, label, rank)
  WHERE v.ou_type = p_ou_type;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_group_target_for_unit(
  p_ou_type text,
  p_is_container boolean,
  p_ou_group_id integer
)
RETURNS TABLE (kind text, name text, source_ou_id integer, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_kind text;
  v_label text;
  v_rank integer;
  v_parent record;
BEGIN
  SELECT k.kind, k.label, k.rank
    INTO v_kind, v_label, v_rank
  FROM public.campaign_group_kind_for_ou_type(p_ou_type) AS k;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'unknown ou_type %', p_ou_type;
  END IF;

  IF v_kind <> 'custom' THEN
    RETURN QUERY SELECT v_kind, v_label, NULL::integer, v_rank;
    RETURN;
  END IF;

  -- A legacy custom-kind container becomes a group; it is not a unit in one.
  IF p_is_container THEN
    RETURN;
  END IF;

  IF p_ou_group_id IS NOT NULL THEN
    SELECT c.ou_id, c.name, c.ou_type, c.is_group_container
      INTO v_parent
    FROM public.campaign_organising_units AS c
    WHERE c.ou_id = p_ou_group_id;

    IF v_parent.is_group_container
       AND (
         SELECT k.kind
         FROM public.campaign_group_kind_for_ou_type(v_parent.ou_type) AS k
       ) = 'custom'
    THEN
      RETURN QUERY
      SELECT 'custom'::text, v_parent.name::text, v_parent.ou_id, 80;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT 'custom'::text, v_label, NULL::integer, v_rank;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_group_ensure(
  p_campaign_id integer,
  p_kind text,
  p_name text,
  p_source_ou_id integer,
  p_rank integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_id integer;
BEGIN
  IF p_source_ou_id IS NOT NULL THEN
    SELECT g.group_id
      INTO v_id
    FROM public.campaign_groups AS g
    WHERE g.source_ou_id = p_source_ou_id;
  ELSE
    SELECT g.group_id
      INTO v_id
    FROM public.campaign_groups AS g
    WHERE g.campaign_id = p_campaign_id
      AND g.kind = p_kind
      AND g.source_ou_id IS NULL
      AND (
        p_kind <> 'custom'
        OR lower(btrim(g.name)) = lower(btrim(p_name))
      );
  END IF;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.campaign_groups (
    campaign_id,
    kind,
    name,
    source_ou_id,
    display_order
  )
  VALUES (
    p_campaign_id,
    p_kind,
    p_name,
    p_source_ou_id,
    p_rank
  )
  ON CONFLICT DO NOTHING
  RETURNING group_id INTO v_id;

  IF v_id IS NULL THEN
    IF p_source_ou_id IS NOT NULL THEN
      SELECT g.group_id
        INTO v_id
      FROM public.campaign_groups AS g
      WHERE g.source_ou_id = p_source_ou_id;
    ELSE
      SELECT g.group_id
        INTO v_id
      FROM public.campaign_groups AS g
      WHERE g.campaign_id = p_campaign_id
        AND g.kind = p_kind
        AND g.source_ou_id IS NULL
        AND (
          p_kind <> 'custom'
          OR lower(btrim(g.name)) = lower(btrim(p_name))
        );
    END IF;

    IF v_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format(
          'A group named "%s" already exists in campaign %s; rename it before creating a %s group',
          p_name,
          p_campaign_id,
          p_kind
        );
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

ALTER FUNCTION public.campaign_group_kind_for_ou_type(text) OWNER TO postgres;
ALTER FUNCTION public.campaign_group_target_for_unit(text, boolean, integer) OWNER TO postgres;
ALTER FUNCTION public.campaign_group_ensure(integer, text, text, integer, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.campaign_group_kind_for_ou_type(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaign_group_target_for_unit(text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campaign_group_ensure(integer, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_group_kind_for_ou_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.campaign_group_target_for_unit(text, boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.campaign_group_ensure(integer, text, text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.campaign_group_kind_for_ou_type(text) IS
  'WP2.1: canonical OU-type to fixed group-kind, display-label, and display-rank mapping.';
COMMENT ON FUNCTION public.campaign_group_target_for_unit(text, boolean, integer) IS
  'WP2.1: derives the group identity for a legacy organising-unit shape. Returns no row for a custom-kind container.';
COMMENT ON FUNCTION public.campaign_group_ensure(integer, text, text, integer, integer) IS
  'WP2.1: returns or creates the derived campaign group under invoker RLS. Used by group-maintenance triggers.';

-- ---------------------------------------------------------------------------
-- 2. Preconditions and substantive-integrity snapshots
-- ---------------------------------------------------------------------------

DO $preconditions$
DECLARE
  v_count bigint;
  v_h9_partitions bigint;
  v_h9_excess bigint;
BEGIN
  IF to_regclass('public.campaign_groups') IS NOT NULL
     OR to_regclass('public.user_campaign_prefs') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_attribute
       WHERE attrelid IN (
         'public.campaign_organising_units'::regclass,
         'public.campaign_worker_ou'::regclass
       )
         AND attname = 'group_id'
         AND NOT attisdropped
     )
  THEN
    RAISE EXCEPTION 'WP2.1 target objects already exist; refusing a partial or repeated migration';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.campaign_worker_ou AS cwo
  JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
  WHERE cou.is_group_container;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 precondition failed: % placement rows are on legacy group containers', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE cou.is_group_container
    AND k.kind = 'custom'
    AND btrim(cou.name) = '';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 precondition failed: % custom-kind containers have blank names', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE cou.is_group_container
    AND k.kind = 'custom'
    AND length(cou.name) > 200;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 precondition failed: % custom-kind container names exceed 200 characters', v_count;
  END IF;

  WITH custom_containers AS (
    SELECT
      cou.campaign_id,
      cou.ou_id,
      lower(btrim(cou.name)) AS normalised_name
    FROM public.campaign_organising_units AS cou
    JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
    WHERE cou.is_group_container
      AND k.kind = 'custom'
  ),
  collisions AS (
    SELECT cc.campaign_id, cc.normalised_name
    FROM custom_containers AS cc
    GROUP BY cc.campaign_id, cc.normalised_name
    HAVING count(*) > 1

    UNION

    SELECT cc.campaign_id, cc.normalised_name
    FROM custom_containers AS cc
    WHERE cc.normalised_name IN (
      'worksite',
      'employer',
      'shift',
      'crew',
      'occupation',
      'work area',
      'custom',
      'network',
      'ethnic community',
      'accommodation',
      'department'
    )
  )
  SELECT count(*) INTO v_count FROM collisions;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 precondition failed: % case-insensitive custom-container group-name collisions', v_count;
  END IF;

  -- This exact future-group-key expression is copied into the cleanup scripts.
  WITH keyed AS (
    SELECT
      cou.campaign_id,
      cou.ou_id,
      cwo.worker_id,
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
      AS fgk
    FROM public.campaign_worker_ou AS cwo
    JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
    JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS map ON true
    LEFT JOIN public.campaign_organising_units AS parent ON parent.ou_id = cou.ou_group_id
    LEFT JOIN LATERAL public.campaign_group_kind_for_ou_type(parent.ou_type) AS parent_map
      ON parent.ou_id IS NOT NULL
  ),
  conflicts AS (
    SELECT campaign_id, fgk, worker_id, count(*) AS rows_in_partition
    FROM keyed
    WHERE fgk IS NOT NULL
    GROUP BY campaign_id, fgk, worker_id
    HAVING count(*) > 1
  )
  SELECT
    count(*),
    coalesce(sum(rows_in_partition - 1), 0)
    INTO v_h9_partitions, v_h9_excess
  FROM conflicts;

  RAISE NOTICE 'WP2.1 preflight H9: % partitions, % excess placement rows (reported, not rejected under E2)',
    v_h9_partitions,
    v_h9_excess;
END;
$preconditions$;

CREATE TEMP TABLE _wp21_baseline_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp21_baseline_counts (metric, value)
VALUES
  ('campaign_worker_membership', (SELECT count(*) FROM public.campaign_worker_membership)),
  ('campaign_worker_ou',         (SELECT count(*) FROM public.campaign_worker_ou)),
  ('campaign_organising_units',  (SELECT count(*) FROM public.campaign_organising_units));

CREATE TEMP TABLE _wp21_unit_updated_at_snapshot (
  ou_id integer PRIMARY KEY,
  updated_at timestamptz NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp21_unit_updated_at_snapshot (ou_id, updated_at)
SELECT ou_id, updated_at
FROM public.campaign_organising_units;

CREATE TEMP TABLE _wp21_view_snapshot ON COMMIT DROP AS
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
  ]);

DO $view_precondition$
BEGIN
  IF (SELECT count(*) FROM _wp21_view_snapshot) <> 10 THEN
    RAISE EXCEPTION 'WP2.1 precondition failed: expected all 10 dependent views';
  END IF;
END;
$view_precondition$;

-- ---------------------------------------------------------------------------
-- 3. Campaign groups
-- ---------------------------------------------------------------------------

CREATE TABLE public.campaign_groups (
  group_id integer GENERATED BY DEFAULT AS IDENTITY,
  campaign_id integer NOT NULL,
  kind text NOT NULL,
  name varchar(200) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  source_ou_id integer,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_groups_pkey PRIMARY KEY (group_id),
  CONSTRAINT campaign_groups_campaign_id_fkey
    FOREIGN KEY (campaign_id)
    REFERENCES public.campaigns(campaign_id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_groups_kind_check
    CHECK (kind IN ('worksite', 'employer', 'shift', 'crew', 'occupation', 'work_area', 'custom')),
  CONSTRAINT campaign_groups_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT campaign_groups_source_ou_id_fkey
    FOREIGN KEY (source_ou_id)
    REFERENCES public.campaign_organising_units(ou_id)
    ON DELETE SET NULL,
  CONSTRAINT campaign_groups_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL
);

ALTER TABLE public.campaign_groups OWNER TO postgres;
ALTER SEQUENCE public.campaign_groups_group_id_seq OWNER TO postgres;

CREATE UNIQUE INDEX campaign_groups_campaign_name_key
  ON public.campaign_groups (campaign_id, lower(btrim(name)));
CREATE UNIQUE INDEX campaign_groups_one_fixed_kind_per_campaign
  ON public.campaign_groups (campaign_id, kind)
  WHERE kind <> 'custom';
CREATE UNIQUE INDEX campaign_groups_source_ou_key
  ON public.campaign_groups (source_ou_id)
  WHERE source_ou_id IS NOT NULL;
CREATE INDEX idx_campaign_groups_campaign_display
  ON public.campaign_groups (campaign_id, display_order, group_id);

CREATE TRIGGER trg_campaign_groups_updated_at
BEFORE UPDATE ON public.campaign_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.campaign_groups IS
  'WP2.1: a facet of a campaign (Worksite, Employer, Shift, Crew, Occupation, Work area, or a user-defined Custom kind). Target rule: a worker is in at most one unit per group per campaign (enforced by WP2.2). Unassigned is derived (members with no placement in the group), never stored.';
COMMENT ON COLUMN public.campaign_groups.kind IS
  'Fixed set (decision 3). User-defined kinds are kind=custom; the group name is the kind label.';
COMMENT ON COLUMN public.campaign_groups.name IS
  'Display name, with the same 200-character capacity as organising-unit names. For kind=custom this is the user-defined kind label. Unique per campaign, case-insensitive.';
COMMENT ON COLUMN public.campaign_groups.source_ou_id IS
  'WP2.1 provenance only: the legacy custom-kind container this group was backfilled from. NULL for groups created later or derived per type. Retired with legacy container columns in WP2.8.';
COMMENT ON COLUMN public.campaign_groups.created_by IS
  'Creator when available through auth.uid(); NULL for service-role or direct SQL creation.';

ALTER TABLE public.campaign_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_groups_select
  ON public.campaign_groups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY campaign_groups_insert
  ON public.campaign_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text]))
    AND public.can_write_to_campaign(campaign_id)
  );

CREATE POLICY campaign_groups_update
  ON public.campaign_groups
  FOR UPDATE TO authenticated
  USING (
    (public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text]))
    AND public.can_write_to_campaign(campaign_id)
  )
  WITH CHECK (
    (public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text]))
    AND public.can_write_to_campaign(campaign_id)
  );

CREATE POLICY campaign_groups_delete
  ON public.campaign_groups
  FOR DELETE TO authenticated
  USING (
    (public.get_user_role() = ANY (ARRAY['admin'::text, 'user'::text]))
    AND public.can_write_to_campaign(campaign_id)
  );

REVOKE ALL ON TABLE public.campaign_groups FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_groups TO authenticated;
GRANT ALL ON TABLE public.campaign_groups TO service_role;
REVOKE ALL ON SEQUENCE public.campaign_groups_group_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.campaign_groups_group_id_seq TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Derived group ids and data backfill
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_organising_units
  ADD COLUMN group_id integer,
  ADD CONSTRAINT campaign_organising_units_group_id_fkey
    FOREIGN KEY (group_id)
    REFERENCES public.campaign_groups(group_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.campaign_worker_ou
  ADD COLUMN group_id integer,
  ADD CONSTRAINT campaign_worker_ou_group_id_fkey
    FOREIGN KEY (group_id)
    REFERENCES public.campaign_groups(group_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;

WITH custom_containers AS (
  SELECT
    cou.campaign_id,
    cou.ou_id,
    cou.name,
    row_number() OVER (
      PARTITION BY cou.campaign_id
      ORDER BY cou.display_order, cou.ou_id
    ) AS custom_rank
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE cou.is_group_container
    AND k.kind = 'custom'
)
INSERT INTO public.campaign_groups (
  campaign_id,
  kind,
  name,
  display_order,
  source_ou_id
)
SELECT
  cc.campaign_id,
  'custom',
  cc.name,
  80 + cc.custom_rank::integer,
  cc.ou_id
FROM custom_containers AS cc
ORDER BY cc.campaign_id, cc.custom_rank;

UPDATE public.campaign_organising_units AS cou
SET group_id = (
  SELECT public.campaign_group_ensure(
    cou.campaign_id,
    target.kind,
    target.name,
    target.source_ou_id,
    target.rank
  )
  FROM public.campaign_group_target_for_unit(
    cou.ou_type,
    cou.is_group_container,
    cou.ou_group_id
  ) AS target
)
WHERE EXISTS (
  SELECT 1
  FROM public.campaign_group_target_for_unit(
    cou.ou_type,
    cou.is_group_container,
    cou.ou_group_id
  )
);

UPDATE public.campaign_worker_ou AS cwo
SET group_id = cou.group_id
FROM public.campaign_organising_units AS cou
WHERE cou.ou_id = cwo.ou_id;

SET CONSTRAINTS public.campaign_organising_units_group_id_fkey, public.campaign_worker_ou_group_id_fkey IMMEDIATE;

ALTER TABLE public.campaign_worker_ou
  ALTER COLUMN group_id SET NOT NULL;

ALTER TABLE public.campaign_organising_units
  ADD CONSTRAINT cou_leaf_requires_group
  CHECK (group_id IS NOT NULL OR is_group_container);

-- E2: support indexes only. WP2.2 replaces idx_cwo_worker_group with UNIQUE.
CREATE INDEX idx_cwo_worker_group
  ON public.campaign_worker_ou (worker_id, group_id);
CREATE INDEX idx_cwo_group_ou
  ON public.campaign_worker_ou (group_id, ou_id);
CREATE INDEX idx_cou_group
  ON public.campaign_organising_units (group_id);

COMMENT ON INDEX public.idx_cwo_worker_group IS
  'WP2.1 non-unique support index. WP2.2 must re-run H9 cleanup, replace this with UNIQUE(worker_id, group_id), and only then create campaign_group_membership.';
COMMENT ON COLUMN public.campaign_organising_units.group_id IS
  'WP2.1: the group this unit belongs to. NULL only for a legacy custom-kind container that became a campaign_groups row. WP2.8 makes this NOT NULL after retiring containers.';
COMMENT ON COLUMN public.campaign_worker_ou.group_id IS
  'WP2.1: denormalised from the unit and trigger-maintained. One unit per (worker_id, group_id) is the target rule but is not enforced until WP2.2. Cross-campaign membership is unaffected because every group belongs to one campaign.';
COMMENT ON CONSTRAINT campaign_organising_units_group_id_fkey ON public.campaign_organising_units IS
  'Deferred NO ACTION avoids the campaign-to-groups versus campaign-to-units cascade diamond. Direct group deletion still fails at transaction commit while units survive.';
COMMENT ON CONSTRAINT campaign_worker_ou_group_id_fkey ON public.campaign_worker_ou IS
  'Deferred NO ACTION avoids the unequal-depth campaign-delete cascade diamond. Direct group deletion still fails at transaction commit while placements survive.';

-- ---------------------------------------------------------------------------
-- 5. Derive-only maintenance triggers (no WP2.2 duplicate rejection)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cou_default_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_target record;
  v_kind text;
BEGIN
  SELECT k.kind INTO v_kind
  FROM public.campaign_group_kind_for_ou_type(NEW.ou_type) AS k;

  IF NEW.is_group_container AND v_kind = 'custom' THEN
    NEW.group_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
     )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.campaign_groups AS g
      WHERE g.group_id = NEW.group_id
        AND g.campaign_id = NEW.campaign_id
    )
    THEN
      RAISE EXCEPTION 'group % does not belong to campaign %', NEW.group_id, NEW.campaign_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NULL
     OR (
       TG_OP = 'UPDATE'
       AND (
         NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
         OR NEW.ou_type IS DISTINCT FROM OLD.ou_type
         OR NEW.ou_group_id IS DISTINCT FROM OLD.ou_group_id
         OR NEW.is_group_container IS DISTINCT FROM OLD.is_group_container
       )
     )
  THEN
    SELECT *
      INTO v_target
    FROM public.campaign_group_target_for_unit(
      NEW.ou_type,
      NEW.is_group_container,
      NEW.ou_group_id
    );

    NEW.group_id := public.campaign_group_ensure(
      NEW.campaign_id,
      v_target.kind,
      v_target.name,
      v_target.source_ou_id,
      v_target.rank
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cou_after_group_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_kind text;
BEGIN
  SELECT k.kind INTO v_kind
  FROM public.campaign_group_kind_for_ou_type(NEW.ou_type) AS k;

  IF NEW.is_group_container AND v_kind = 'custom' THEN
    PERFORM public.campaign_group_ensure(
      NEW.campaign_id,
      'custom',
      NEW.name,
      NEW.ou_id,
      80
    );

    IF TG_OP = 'UPDATE'
       AND (
         NEW.name IS DISTINCT FROM OLD.name
         OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
       )
    THEN
      UPDATE public.campaign_groups
      SET campaign_id = NEW.campaign_id,
          name = NEW.name
      WHERE source_ou_id = NEW.ou_id;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    UPDATE public.campaign_worker_ou
    SET group_id = NEW.group_id
    WHERE ou_id = NEW.ou_id;
  END IF;

  RETURN NULL;
END;
$function$;

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

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.cou_default_group() OWNER TO postgres;
ALTER FUNCTION public.cou_after_group_change() OWNER TO postgres;
ALTER FUNCTION public.cwo_set_group_id() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cou_default_group() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cou_after_group_change() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cwo_set_group_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cou_default_group() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cou_after_group_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cwo_set_group_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.cwo_set_group_id() IS
  'WP2.1 derive-only placement trigger. It deliberately does not reject duplicate (worker_id, group_id) rows; WP2.2 adds that check after replacing legacy writers.';

CREATE TRIGGER trg_cou_y_default_group
BEFORE INSERT OR UPDATE OF campaign_id, ou_type, ou_group_id, parent_ou_id, is_group_container, group_id
ON public.campaign_organising_units
FOR EACH ROW
EXECUTE FUNCTION public.cou_default_group();

CREATE TRIGGER trg_cou_z_after_group_change
AFTER INSERT OR UPDATE OF campaign_id, name, ou_type, ou_group_id, parent_ou_id, is_group_container, group_id
ON public.campaign_organising_units
FOR EACH ROW
EXECUTE FUNCTION public.cou_after_group_change();

CREATE TRIGGER trg_cwo_z_set_group_id
BEFORE INSERT OR UPDATE OF ou_id, group_id
ON public.campaign_worker_ou
FOR EACH ROW
EXECUTE FUNCTION public.cwo_set_group_id();

-- ---------------------------------------------------------------------------
-- 6. Owner-only per-user campaign preferences
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_campaign_prefs (
  user_id uuid NOT NULL,
  campaign_id integer NOT NULL,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_campaign_prefs_pkey PRIMARY KEY (user_id, campaign_id),
  CONSTRAINT user_campaign_prefs_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  CONSTRAINT user_campaign_prefs_campaign_id_fkey
    FOREIGN KEY (campaign_id)
    REFERENCES public.campaigns(campaign_id)
    ON DELETE CASCADE,
  CONSTRAINT user_campaign_prefs_object_check
    CHECK (jsonb_typeof(prefs) = 'object')
);

ALTER TABLE public.user_campaign_prefs OWNER TO postgres;

CREATE TRIGGER trg_user_campaign_prefs_updated_at
BEFORE UPDATE ON public.user_campaign_prefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.user_campaign_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ucp_select
  ON public.user_campaign_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ucp_insert
  ON public.user_campaign_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY ucp_update
  ON public.user_campaign_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY ucp_delete
  ON public.user_campaign_prefs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_campaign_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_campaign_prefs TO authenticated;
GRANT ALL ON TABLE public.user_campaign_prefs TO service_role;

COMMENT ON TABLE public.user_campaign_prefs IS
  'WP2.1: opaque per-user, per-campaign UI preferences (active group, collapsed groups, sort). Owner-only RLS; service_role access supports e2e seeding and administrative clearing. No application reader is added in WP2.1.';

-- ---------------------------------------------------------------------------
-- 7. Postconditions
-- ---------------------------------------------------------------------------

DO $postconditions$
DECLARE
  v_count bigint;
  v_h9_partitions bigint;
  v_h9_excess bigint;
  v_unit_updated_at_changes bigint;
  v_units_with_group_id bigint;
BEGIN
  IF (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'campaign_worker_membership')
     OR (SELECT count(*) FROM public.campaign_worker_ou)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'campaign_worker_ou')
     OR (SELECT count(*) FROM public.campaign_organising_units)
       <> (SELECT value FROM _wp21_baseline_counts WHERE metric = 'campaign_organising_units')
  THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: M2 requires membership, placement, and unit counts to remain unchanged';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units
  WHERE NOT is_group_container
    AND group_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % leaf units have no group', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE (
      NOT cou.is_group_container
      OR k.kind <> 'custom'
    )
    AND cou.group_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % mapped units or fixed-kind containers have no group', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE cou.is_group_container
    AND k.kind = 'custom'
    AND cou.group_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % custom-kind containers incorrectly have a group_id', v_count;
  END IF;

  SELECT
    count(*) FILTER (
      WHERE cou.updated_at IS DISTINCT FROM snapshot.updated_at
    ),
    count(*) FILTER (WHERE cou.group_id IS NOT NULL)
    INTO v_unit_updated_at_changes, v_units_with_group_id
  FROM public.campaign_organising_units AS cou
  JOIN _wp21_unit_updated_at_snapshot AS snapshot USING (ou_id);

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN _wp21_unit_updated_at_snapshot AS snapshot USING (ou_id)
  WHERE (
    cou.updated_at IS DISTINCT FROM snapshot.updated_at
  ) IS DISTINCT FROM (
    cou.group_id IS NOT NULL
  );
  IF v_count <> 0 OR v_unit_updated_at_changes <> v_units_with_group_id THEN
    RAISE EXCEPTION
      'WP2.1 postcondition failed: updated_at changed on % units but % populated group_id rows were expected (% set mismatches)',
      v_unit_updated_at_changes,
      v_units_with_group_id,
      v_count;
  END IF;

  RAISE NOTICE
    'WP2.1 expected metadata churn: updated_at advanced on all % units whose group_id was populated',
    v_unit_updated_at_changes;

  SELECT count(*) INTO v_count
  FROM public.campaign_worker_ou AS cwo
  JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
  WHERE cwo.group_id IS DISTINCT FROM cou.group_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % placement group ids differ from their unit', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN public.campaign_groups AS g ON g.group_id = cou.group_id
  WHERE g.campaign_id <> cou.campaign_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % units reference a group in another campaign', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.campaign_organising_units AS cou
  JOIN LATERAL public.campaign_group_kind_for_ou_type(cou.ou_type) AS k ON true
  WHERE cou.is_group_container
    AND k.kind = 'custom'
    AND (
      SELECT count(*)
      FROM public.campaign_groups AS g
      WHERE g.source_ou_id = cou.ou_id
        AND g.campaign_id = cou.campaign_id
        AND g.kind = 'custom'
    ) <> 1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % custom-kind containers lack exactly one provenance group', v_count;
  END IF;

  IF to_regclass('public.campaign_groups') IS NULL
     OR to_regclass('public.user_campaign_prefs') IS NULL
     OR to_regclass('public.campaign_group_membership') IS NOT NULL
     OR to_regclass('public.campaign_worker_ou_one_unit_per_group') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: target/deferred object boundary is incorrect';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE (
      (
        conrelid = 'public.campaign_organising_units'::regclass
        AND conname = 'campaign_organising_units_group_id_fkey'
      )
      OR (
        conrelid = 'public.campaign_worker_ou'::regclass
        AND conname = 'campaign_worker_ou_group_id_fkey'
      )
    )
    AND confdeltype = 'a'
    AND condeferrable
    AND condeferred;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: both group FKs must be deferred NO ACTION';
  END IF;

  SELECT count(*) INTO v_count
  FROM _wp21_view_snapshot AS before_view
  FULL JOIN (
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
  ) AS after_view USING (view_name)
  WHERE before_view.definition_hash IS DISTINCT FROM after_view.definition_hash
     OR before_view.reloptions IS DISTINCT FROM after_view.reloptions;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP2.1 postcondition failed: % dependent view definitions or reloptions changed', v_count;
  END IF;

  WITH conflicts AS (
    SELECT cwo.worker_id, cwo.group_id, count(*) AS rows_in_partition
    FROM public.campaign_worker_ou AS cwo
    GROUP BY cwo.worker_id, cwo.group_id
    HAVING count(*) > 1
  )
  SELECT
    count(*),
    coalesce(sum(rows_in_partition - 1), 0)
    INTO v_h9_partitions, v_h9_excess
  FROM conflicts;

  RAISE NOTICE 'WP2.1 postflight H9: % partitions, % excess placement rows (reported, not rejected under E2)',
    v_h9_partitions,
    v_h9_excess;
END;
$postconditions$;

SELECT
  count(*) FILTER (
    WHERE cou.updated_at IS DISTINCT FROM snapshot.updated_at
  ) AS unit_updated_at_rows_changed,
  count(*) FILTER (
    WHERE cou.group_id IS NOT NULL
  ) AS expected_rows_with_populated_group_id
FROM public.campaign_organising_units AS cou
JOIN _wp21_unit_updated_at_snapshot AS snapshot USING (ou_id);
