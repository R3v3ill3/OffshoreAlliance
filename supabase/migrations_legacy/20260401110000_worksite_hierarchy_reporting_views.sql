-- ============================================================
-- Worksite hierarchy reporting layer (Phase 2)
-- ============================================================
-- Purpose:
-- - Provide canonical, persisted hierarchy paths for reporting:
--   (A) Geo -> Service Type -> Producer -> Worksite
--   (B) Producer -> Geo -> Worksite
-- - Attach provider + role + scope details per worksite row so UI and exports
--   can read one reporting object instead of rebuilding path logic client-side.
--
-- Notes:
-- - Producer is resolved as principal_employer, then operator, else "Unassigned producer".
-- - Provider rows come from current employer_worksite_roles.
-- - Scope rows come from current worksite_scopes grouped by (worksite, provider).
-- - Includes a materialized snapshot and refresh function for heavier reporting.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS worksite_hierarchy_report_rows_mv;
DROP VIEW IF EXISTS worksite_hierarchy_report_rows;

CREATE OR REPLACE VIEW worksite_hierarchy_report_rows AS
WITH role_rows AS (
  SELECT
    w.worksite_id,
    w.worksite_name,
    w.is_offshore,
    w.worksite_type,
    w.principal_employer_id,
    w.operator_id,
    ewr.employer_id AS provider_employer_id,
    ep.employer_name AS provider_name,
    string_agg(
      DISTINCT replace(ewr.role_type, '_', ' '),
      ', '
      ORDER BY replace(ewr.role_type, '_', ' ')
    ) AS provider_roles
  FROM worksites w
  LEFT JOIN employer_worksite_roles ewr
    ON ewr.worksite_id = w.worksite_id
   AND ewr.is_current = true
  LEFT JOIN employers ep
    ON ep.employer_id = ewr.employer_id
  WHERE w.is_active = true
  GROUP BY
    w.worksite_id,
    w.worksite_name,
    w.is_offshore,
    w.worksite_type,
    w.principal_employer_id,
    w.operator_id,
    ewr.employer_id,
    ep.employer_name
),
scope_rows AS (
  SELECT
    ws.worksite_id,
    ws.employer_id AS provider_employer_id,
    string_agg(DISTINCT s.scope_name, ', ' ORDER BY s.scope_name) AS scope_names
  FROM worksite_scopes ws
  JOIN work_scopes s
    ON s.scope_id = ws.scope_id
  WHERE ws.is_current = true
    AND ws.employer_id IS NOT NULL
  GROUP BY ws.worksite_id, ws.employer_id
)
SELECT
  rr.worksite_id,
  rr.worksite_name,
  CASE WHEN rr.is_offshore THEN 'Offshore' ELSE 'Onshore' END AS geo,
  replace(rr.worksite_type, '_', ' ') AS service_type,
  coalesce(pe.employer_name, op.employer_name, 'Unassigned producer') AS producer_name,
  rr.provider_employer_id,
  coalesce(rr.provider_name, 'No mapped provider') AS provider_name,
  coalesce(rr.provider_roles, '—') AS provider_roles,
  coalesce(sr.scope_names, '—') AS scope_names,
  concat_ws(
    ' > ',
    CASE WHEN rr.is_offshore THEN 'Offshore' ELSE 'Onshore' END,
    replace(rr.worksite_type, '_', ' '),
    coalesce(pe.employer_name, op.employer_name, 'Unassigned producer'),
    rr.worksite_name
  ) AS hierarchy_path_geo_service,
  concat_ws(
    ' > ',
    coalesce(pe.employer_name, op.employer_name, 'Unassigned producer'),
    CASE WHEN rr.is_offshore THEN 'Offshore' ELSE 'Onshore' END,
    rr.worksite_name
  ) AS hierarchy_path_producer_geo
FROM role_rows rr
LEFT JOIN employers pe
  ON pe.employer_id = rr.principal_employer_id
LEFT JOIN employers op
  ON op.employer_id = rr.operator_id
LEFT JOIN scope_rows sr
  ON sr.worksite_id = rr.worksite_id
 AND sr.provider_employer_id = rr.provider_employer_id;

COMMENT ON VIEW worksite_hierarchy_report_rows IS
  'Canonical hierarchy report rows for worksite reporting paths with provider-role-scope mappings.';

CREATE MATERIALIZED VIEW worksite_hierarchy_report_rows_mv AS
SELECT *
FROM worksite_hierarchy_report_rows;

CREATE INDEX IF NOT EXISTS idx_whrr_mv_geo_service
  ON worksite_hierarchy_report_rows_mv(hierarchy_path_geo_service);
CREATE INDEX IF NOT EXISTS idx_whrr_mv_producer_geo
  ON worksite_hierarchy_report_rows_mv(hierarchy_path_producer_geo);
CREATE INDEX IF NOT EXISTS idx_whrr_mv_worksite
  ON worksite_hierarchy_report_rows_mv(worksite_id);
CREATE INDEX IF NOT EXISTS idx_whrr_mv_provider
  ON worksite_hierarchy_report_rows_mv(provider_name);

COMMENT ON MATERIALIZED VIEW worksite_hierarchy_report_rows_mv IS
  'Materialized snapshot of canonical hierarchy report rows for heavier reads.';

CREATE OR REPLACE FUNCTION refresh_worksite_hierarchy_report_rows_mv()
RETURNS void AS $$
  REFRESH MATERIALIZED VIEW worksite_hierarchy_report_rows_mv;
$$ LANGUAGE sql;

COMMENT ON FUNCTION refresh_worksite_hierarchy_report_rows_mv() IS
  'Refreshes worksite_hierarchy_report_rows_mv snapshot from canonical hierarchy view.';
