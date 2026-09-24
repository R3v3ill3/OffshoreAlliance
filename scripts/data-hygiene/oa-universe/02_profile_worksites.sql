-- 02 · One row per worksite (read-only)
SELECT w.worksite_id, w.worksite_name, w.worksite_type, w.is_offshore, w.basin, w.is_active,
       w.parent_worksite_id, w.created_at::date AS created,
       pe.employer_name AS principal_employer, op.employer_name AS operator,
       w.latitude IS NOT NULL AS has_coords,
       (SELECT count(*) FROM workers k WHERE k.worksite_id = w.worksite_id AND k.is_active)      AS active_workers,
       (SELECT count(*) FROM employer_worksite_roles r WHERE r.worksite_id = w.worksite_id)     AS employer_roles,
       (SELECT count(*) FROM agreement_worksites a WHERE a.worksite_id = w.worksite_id)         AS agreement_links,
       (SELECT count(*) FROM campaign_worksites c WHERE c.worksite_id = w.worksite_id)          AS campaign_universes,
       (SELECT count(*) FROM worksite_name_aliases x WHERE x.worksite_id = w.worksite_id)       AS aliases
FROM worksites w
LEFT JOIN employers pe ON pe.employer_id = w.principal_employer_id
LEFT JOIN employers op ON op.employer_id = w.operator_id
ORDER BY lower(w.worksite_name);

SELECT worksite_type, count(*) FROM worksites GROUP BY 1 ORDER BY 2 DESC;
SELECT coalesce(basin,'(null)') AS basin, count(*) FROM worksites GROUP BY 1 ORDER BY 2 DESC;
SELECT a.alias_name, w.worksite_name AS canonical, a.source
FROM worksite_name_aliases a JOIN worksites w ON w.worksite_id = a.worksite_id ORDER BY 2,1;
