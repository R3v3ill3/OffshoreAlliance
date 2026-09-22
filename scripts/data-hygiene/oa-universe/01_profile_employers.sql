-- 01 · One row per employer with lineage signals (read-only, no personal data)
SELECT e.employer_id, e.employer_name, e.trading_name, e.employer_category, e.parent_employer_id,
       e.abn IS NOT NULL AS has_abn, e.is_active, e.created_at::date AS created,
       (SELECT count(*) FROM workers w WHERE w.employer_id = e.employer_id AND w.is_active)        AS active_workers,
       (SELECT count(*) FROM employer_worksite_roles r WHERE r.employer_id = e.employer_id)      AS worksite_roles,
       (SELECT count(*) FROM agreements a WHERE a.employer_id = e.employer_id)                   AS agreements,
       (SELECT count(*) FROM employer_name_aliases x WHERE x.employer_id = e.employer_id)        AS aliases,
       (SELECT count(*) FROM campaign_employers ce WHERE ce.employer_id = e.employer_id)         AS campaign_universes
FROM employers e
ORDER BY lower(e.employer_name);

-- Aliases and the merges that created them
SELECT a.alias_name, e.employer_name AS canonical, a.source, a.created_at::date
FROM employer_name_aliases a JOIN employers e ON e.employer_id = a.employer_id
ORDER BY e.employer_name, a.alias_name;

SELECT id, survivor_employer_id, victim_employer_ids, created_at::date,
       payload - 'workers' AS payload_summary          -- payload may list re-pointed rows; keep it aggregate
FROM employer_merge_events ORDER BY created_at;

-- Category distribution and the naming-convention split (UPPERCASE legal names vs mixed case)
SELECT coalesce(employer_category,'(null)') AS category, count(*) FROM employers GROUP BY 1 ORDER BY 2 DESC;
SELECT CASE WHEN employer_name = upper(employer_name) THEN 'UPPERCASE' ELSE 'mixed case' END AS convention,
       to_char(date_trunc('month', created_at),'YYYY-MM') AS created_month, count(*)
FROM employers GROUP BY 1,2 ORDER BY 2,1;
