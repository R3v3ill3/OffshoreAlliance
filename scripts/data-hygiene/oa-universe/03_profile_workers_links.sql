-- 03 · Worker link coverage (read-only; counts only, no personal data)
SELECT count(*) FILTER (WHERE is_active) AS active, count(*) AS total,
       count(*) FILTER (WHERE is_active AND employer_id IS NULL)                       AS no_employer,
       count(*) FILTER (WHERE is_active AND worksite_id IS NULL)                       AS no_worksite,
       count(*) FILTER (WHERE is_active AND employer_id IS NULL AND worksite_id IS NULL) AS neither,
       count(*) FILTER (WHERE is_active AND member_number IS NULL)                     AS no_member_number,
       count(*) FILTER (WHERE is_active AND reference_id IS NULL)                      AS no_reference_id,
       count(*) FILTER (WHERE is_active AND canonical_occupation_id IS NULL)           AS no_canonical_occupation,
       count(*) FILTER (WHERE is_active AND union_id IS NULL)                          AS no_union,
       count(*) FILTER (WHERE is_active AND union_membership_type_id IS NULL)          AS no_membership_type,
       count(*) FILTER (WHERE is_active AND project_id IS NOT NULL)                    AS has_project,
       count(*) FILTER (WHERE is_active AND (shift_id IS NOT NULL OR work_area_id IS NOT NULL OR roster_panel_id IS NOT NULL)) AS has_shift_area_or_panel
FROM workers;

-- When did rows arrive (bulk-load signature)
SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS created_month, count(*) FROM workers GROUP BY 1 ORDER BY 1;

-- Employer × worksite pairs implied by worker records that the roles table does not know about
WITH pairs AS (
  SELECT employer_id, worksite_id, count(*) AS workers
  FROM workers WHERE is_active AND employer_id IS NOT NULL AND worksite_id IS NOT NULL
  GROUP BY 1,2)
SELECT count(*) AS distinct_pairs,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM employer_worksite_roles r WHERE r.employer_id = p.employer_id AND r.worksite_id = p.worksite_id)) AS pairs_not_in_roles,
       sum(workers) FILTER (WHERE NOT EXISTS (SELECT 1 FROM employer_worksite_roles r WHERE r.employer_id = p.employer_id AND r.worksite_id = p.worksite_id)) AS workers_in_unrecorded_pairs
FROM pairs p;

-- The unrecorded pairs themselves (organisation names only), largest first — the seed list for engagements
WITH pairs AS (
  SELECT employer_id, worksite_id, count(*) AS workers
  FROM workers WHERE is_active AND employer_id IS NOT NULL AND worksite_id IS NOT NULL GROUP BY 1,2)
SELECT e.employer_name, w.worksite_name, p.workers
FROM pairs p JOIN employers e ON e.employer_id = p.employer_id JOIN worksites w ON w.worksite_id = p.worksite_id
WHERE NOT EXISTS (SELECT 1 FROM employer_worksite_roles r WHERE r.employer_id = p.employer_id AND r.worksite_id = p.worksite_id)
ORDER BY p.workers DESC;

-- Occupation: free text vs canonical (titles only)
SELECT occupation, count(*) AS workers, count(canonical_occupation_id) AS with_canonical
FROM workers WHERE is_active GROUP BY 1 ORDER BY 2 DESC LIMIT 60;

-- Import history (file names are operational metadata, not personal data)
SELECT import_type, to_char(date_trunc('month', imported_at),'YYYY-MM') AS month, count(*) AS files,
       sum(records_created) AS created, sum(records_updated) AS updated
FROM import_logs GROUP BY 1,2 ORDER BY 2,1;
