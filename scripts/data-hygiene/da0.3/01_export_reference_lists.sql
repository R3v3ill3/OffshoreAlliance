-- ---------------------------------------------------------------------------------------------
-- DA0.3 -- script 01: export the employer and worksite reference lists (READ-ONLY).
--
-- Plan: docs/data-architecture/wp/da0.3.md §3 (fixture inputs 1) and §3.4. Run on PRODUCTION by the
-- agent (D0 read-only) or the operator; the two json columns are pasted verbatim into
-- fixtures/reference_employers.json and fixtures/reference_worksites.json (dated by exported_at).
--
-- Organisation and worksite strings, ids, categories / types, active flags and alias strings ONLY.
-- No table with a person's data is read. Run 2026-09-22 06:16 UTC: 187 employers, 39 employer
-- aliases, 194 worksites, 8 worksite aliases (matches plan §1.4).
-- ---------------------------------------------------------------------------------------------

SELECT json_build_object(
  'exported_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'source', 'production employers + employer_name_aliases',
  'rows', (SELECT coalesce(json_agg(json_build_object(
              'employer_id', e.employer_id, 'employer_name', e.employer_name,
              'trading_name', e.trading_name, 'employer_category', e.employer_category,
              'is_active', e.is_active) ORDER BY e.employer_id), '[]'::json)
           FROM public.employers e),
  'aliases', (SELECT coalesce(json_agg(json_build_object(
              'employer_id', a.employer_id, 'alias_name', a.alias_name, 'source', a.source) ORDER BY a.id), '[]'::json)
           FROM public.employer_name_aliases a)
) AS reference_employers,
json_build_object(
  'exported_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'source', 'production worksites + worksite_name_aliases',
  'rows', (SELECT coalesce(json_agg(json_build_object(
              'worksite_id', w.worksite_id, 'worksite_name', w.worksite_name,
              'worksite_type', w.worksite_type, 'is_active', w.is_active) ORDER BY w.worksite_id), '[]'::json)
           FROM public.worksites w),
  'aliases', (SELECT coalesce(json_agg(json_build_object(
              'worksite_id', a.worksite_id, 'alias_name', a.alias_name, 'source', a.source) ORDER BY a.id), '[]'::json)
           FROM public.worksite_name_aliases a)
) AS reference_worksites;
