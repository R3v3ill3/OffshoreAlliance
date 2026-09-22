-- 04 · Agreements (read-only)
SELECT status, count(*) FROM agreements GROUP BY 1;
SELECT coalesce(agreement_scope,'(null)') AS agreement_scope, count(*) FROM agreements GROUP BY 1;
SELECT coalesce(source_sheet,'(null)') AS source_sheet, count(*) FROM agreements GROUP BY 1 ORDER BY 2 DESC;
SELECT CASE WHEN EXISTS (SELECT 1 FROM agreement_worksites x WHERE x.agreement_id = a.agreement_id) THEN 'has worksite link' ELSE 'no worksite link' END AS coverage, count(*)
FROM agreements a GROUP BY 1;

-- One row per agreement: holder, status, expiry, sector sheet, linked worksites, extra employers
SELECT a.agreement_id, coalesce(a.short_name, a.agreement_name) AS name, a.decision_no, e.employer_name AS holder,
       a.status, a.expiry_date, a.source_sheet, a.is_greenfield, a.fwc_link IS NOT NULL AS has_fwc_link,
       (SELECT string_agg(w.worksite_name, '; ' ORDER BY w.worksite_name) FROM agreement_worksites aw JOIN worksites w ON w.worksite_id = aw.worksite_id WHERE aw.agreement_id = a.agreement_id) AS worksites,
       (SELECT count(*) FROM agreement_employers ae WHERE ae.agreement_id = a.agreement_id) AS extra_employers,
       (SELECT count(*) FROM agreement_scopes s WHERE s.agreement_id = a.agreement_id) AS work_scopes
FROM agreements a LEFT JOIN employers e ON e.employer_id = a.employer_id
ORDER BY e.employer_name NULLS LAST, a.expiry_date;
