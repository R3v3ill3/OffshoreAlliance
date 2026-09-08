-- ============================================================
-- Phase 2 of campaigns review plan: campaign units extensions.
--
-- Today campaign_organising_units.ou_type allows shift, department,
-- network, job_type, worksite, ethnic_community, crew_rotation,
-- accommodation, work_area, custom (set by 20260408200100). Phase 2
-- adds 'employer' so an employer-level unit (one per employer in
-- multi-employer campaigns) is a first-class option, and adds a
-- unit_basis JSONB recording the source filters the unit was built
-- from so it can be regenerated/audited (e.g. {"employer_ids": [12]}
-- or {"occupation_group_id": 4}). 'Unallocated' is intentionally a
-- computed bucket (workers on the campaign without any
-- campaign_worker_ou row) — no new ou_type and no auto-created row.
-- ============================================================

ALTER TABLE campaign_organising_units
  DROP CONSTRAINT IF EXISTS campaign_organising_units_ou_type_check;

ALTER TABLE campaign_organising_units
  ADD CONSTRAINT campaign_organising_units_ou_type_check
  CHECK (ou_type IN (
    'shift', 'department', 'network', 'job_type', 'worksite',
    'employer',
    'ethnic_community', 'crew_rotation', 'accommodation', 'work_area', 'custom'
  ));

ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS unit_basis JSONB;

COMMENT ON COLUMN campaign_organising_units.unit_basis IS
  'Optional JSONB capturing the filter the unit was built from so it can be reproduced or audited. Common shapes: {"employer_id": <int>}, {"worksite_id": <int>}, {"canonical_occupation_id": <int>}, {"occupation_group_id": <int>}, {"custom": true}. Multi-key combinations are valid (e.g. {"employer_id": 12, "occupation_group_id": 4}).';

-- Mirror the broader ou_type list onto campaign_ou_candidates so suggestions
-- generated from WTP can include employer-level groupings.
ALTER TABLE campaign_ou_candidates
  DROP CONSTRAINT IF EXISTS campaign_ou_candidates_suggested_ou_type_check;

ALTER TABLE campaign_ou_candidates
  ADD CONSTRAINT campaign_ou_candidates_suggested_ou_type_check
  CHECK (suggested_ou_type IN (
    'shift', 'department', 'network', 'job_type', 'worksite',
    'employer',
    'ethnic_community', 'crew_rotation', 'accommodation', 'work_area', 'custom'
  ));

-- Helper view: per-campaign worker assignment summary used by the wizard
-- preview and the wall chart. Surfaces the "Unallocated" bucket as the
-- delta between campaign_worker_membership and campaign_worker_ou.
CREATE OR REPLACE VIEW campaign_unit_assignment_summary
WITH (security_invoker = true)
AS
WITH membership AS (
  SELECT campaign_id, worker_id
  FROM campaign_worker_membership
),
ou_assignments AS (
  SELECT
    cou.campaign_id,
    cou.ou_id,
    cou.name AS ou_name,
    cou.ou_type,
    cou.total_workers_estimated,
    cwo.worker_id
  FROM campaign_organising_units cou
  LEFT JOIN campaign_worker_ou cwo ON cwo.ou_id = cou.ou_id
)
SELECT
  m.campaign_id,
  oa.ou_id,
  oa.ou_name,
  oa.ou_type,
  oa.total_workers_estimated,
  COUNT(DISTINCT m.worker_id) AS allocated_worker_count
FROM membership m
LEFT JOIN ou_assignments oa
  ON oa.campaign_id = m.campaign_id
 AND oa.worker_id = m.worker_id
GROUP BY m.campaign_id, oa.ou_id, oa.ou_name, oa.ou_type, oa.total_workers_estimated;

GRANT SELECT ON campaign_unit_assignment_summary TO authenticated;

COMMENT ON VIEW campaign_unit_assignment_summary IS
  'Per (campaign, ou) count of allocated workers. ou_id IS NULL rows represent the synthetic "Unallocated" bucket — workers on the campaign with no campaign_worker_ou row.';
