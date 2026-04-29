-- Collapse the five separate P2W completion existence checks into one RPC.
-- This is intentionally read-only and security invoker so existing table RLS
-- remains the source of truth for visibility.

CREATE OR REPLACE FUNCTION public.get_p2w_completion_by_plan_ids(p_plan_ids integer[])
RETURNS TABLE (
  plan_id integer,
  ambitions boolean,
  where_to_play boolean,
  theory boolean,
  capacities boolean,
  management boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH requested_plan_ids AS (
    SELECT DISTINCT unnest(COALESCE(p_plan_ids, ARRAY[]::integer[])) AS plan_id
  )
  SELECT
    r.plan_id,
    EXISTS (
      SELECT 1
      FROM plan_ambitions pa
      WHERE pa.plan_id = r.plan_id
    ) AS ambitions,
    EXISTS (
      SELECT 1
      FROM plan_where_to_play pwtp
      WHERE pwtp.plan_id = r.plan_id
    ) AS where_to_play,
    EXISTS (
      SELECT 1
      FROM plan_theory_of_winning ptow
      WHERE ptow.plan_id = r.plan_id
    ) AS theory,
    EXISTS (
      SELECT 1
      FROM plan_capacities pc
      WHERE pc.plan_id = r.plan_id
    ) AS capacities,
    EXISTS (
      SELECT 1
      FROM plan_management_systems pms
      WHERE pms.plan_id = r.plan_id
    ) AS management
  FROM requested_plan_ids r
  ORDER BY r.plan_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_p2w_completion_by_plan_ids(integer[]) TO authenticated;
