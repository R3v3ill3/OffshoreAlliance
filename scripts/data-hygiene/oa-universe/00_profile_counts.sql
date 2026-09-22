-- 00 · Row counts for the organising model (read-only)
SELECT t, n FROM (
  SELECT 'workers' t, count(*) n FROM workers UNION ALL
  SELECT 'workers_active', count(*) FROM workers WHERE is_active UNION ALL
  SELECT 'employers', count(*) FROM employers UNION ALL
  SELECT 'employer_name_aliases', count(*) FROM employer_name_aliases UNION ALL
  SELECT 'employer_merge_events', count(*) FROM employer_merge_events UNION ALL
  SELECT 'worksites', count(*) FROM worksites UNION ALL
  SELECT 'worksites_active', count(*) FROM worksites WHERE is_active UNION ALL
  SELECT 'worksites_with_parent', count(*) FROM worksites WHERE parent_worksite_id IS NOT NULL UNION ALL
  SELECT 'worksite_name_aliases', count(*) FROM worksite_name_aliases UNION ALL
  SELECT 'employer_worksite_roles', count(*) FROM employer_worksite_roles UNION ALL
  SELECT 'worksite_scopes', count(*) FROM worksite_scopes UNION ALL
  SELECT 'employer_scopes', count(*) FROM employer_scopes UNION ALL
  SELECT 'work_scopes', count(*) FROM work_scopes UNION ALL
  SELECT 'worksite_contracts', count(*) FROM worksite_contracts UNION ALL
  SELECT 'worker_assignments', count(*) FROM worker_assignments UNION ALL
  SELECT 'agreements', count(*) FROM agreements UNION ALL
  SELECT 'agreement_worksites', count(*) FROM agreement_worksites UNION ALL
  SELECT 'agreement_employers', count(*) FROM agreement_employers UNION ALL
  SELECT 'agreement_scopes', count(*) FROM agreement_scopes UNION ALL
  SELECT 'worker_agreements', count(*) FROM worker_agreements UNION ALL
  SELECT 'programs', count(*) FROM programs UNION ALL
  SELECT 'program_worksites', count(*) FROM program_worksites UNION ALL
  SELECT 'projects', count(*) FROM projects UNION ALL
  SELECT 'organiser_patches', count(*) FROM organiser_patches UNION ALL
  SELECT 'organiser_patch_assignments', count(*) FROM organiser_patch_assignments UNION ALL
  SELECT 'organisers', count(*) FROM organisers UNION ALL
  SELECT 'campaigns', count(*) FROM campaigns UNION ALL
  SELECT 'campaign_groups', count(*) FROM campaign_groups UNION ALL
  SELECT 'campaign_organising_units', count(*) FROM campaign_organising_units UNION ALL
  SELECT 'campaign_worker_ou', count(*) FROM campaign_worker_ou UNION ALL
  SELECT 'campaign_worker_membership', count(*) FROM campaign_worker_membership UNION ALL
  SELECT 'campaign_employers', count(*) FROM campaign_employers UNION ALL
  SELECT 'campaign_worksites', count(*) FROM campaign_worksites UNION ALL
  SELECT 'occupations', count(*) FROM occupations UNION ALL
  SELECT 'occupation_aliases', count(*) FROM occupation_aliases UNION ALL
  SELECT 'upcoming_projects', count(*) FROM upcoming_projects UNION ALL
  SELECT 'upcoming_project_employers', count(*) FROM upcoming_project_employers UNION ALL
  SELECT 'import_logs', count(*) FROM import_logs UNION ALL
  SELECT 'membership_update_batches', count(*) FROM membership_update_batches UNION ALL
  SELECT 'sectors', count(*) FROM sectors
) x ORDER BY t;
