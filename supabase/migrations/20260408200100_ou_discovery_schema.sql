-- ============================================================
-- Migration: OU Discovery Schema
-- Extends campaign_organising_units with discovery fields,
-- adds new OU types, creates ou_candidates table for
-- WTP-seeded suggestions, and adds OU coverage summary view.
-- ============================================================

-- 1. Extend campaign_organising_units with discovery fields
ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS commonality_logic TEXT,
  ADD COLUMN IF NOT EXISTS target_size INT CHECK (target_size IS NULL OR target_size >= 0),
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual'
    CHECK (source IN ('manual', 'wtp_seeded', 'generated', 'field_discovery'));

-- 2. Expand ou_type check constraint to include new types
ALTER TABLE campaign_organising_units
  DROP CONSTRAINT IF EXISTS campaign_organising_units_ou_type_check;

ALTER TABLE campaign_organising_units
  ADD CONSTRAINT campaign_organising_units_ou_type_check
  CHECK (ou_type IN (
    'shift', 'department', 'network', 'job_type', 'worksite',
    'ethnic_community', 'crew_rotation', 'accommodation', 'work_area', 'custom'
  ));

-- 3. OU candidates table (WTP-seeded suggestions)
CREATE TABLE IF NOT EXISTS campaign_ou_candidates (
  candidate_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  suggested_name VARCHAR(200) NOT NULL,
  suggested_ou_type VARCHAR(30) NOT NULL
    CHECK (suggested_ou_type IN (
      'shift', 'department', 'network', 'job_type', 'worksite',
      'ethnic_community', 'crew_rotation', 'accommodation', 'work_area', 'custom'
    )),
  source VARCHAR(30) NOT NULL
    CHECK (source IN ('wtp_worksite', 'wtp_sector', 'wtp_employer', 'wtp_contact_group', 'manual', 'field_discovery')),
  source_wtp_id INT REFERENCES plan_where_to_play(wtp_id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'rejected', 'merged')),
  accepted_ou_id INT REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL,
  estimated_workers INT CHECK (estimated_workers IS NULL OR estimated_workers >= 0),
  commonality_logic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ou_candidates_updated_at
  BEFORE UPDATE ON campaign_ou_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ouc_campaign ON campaign_ou_candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ouc_wtp ON campaign_ou_candidates(source_wtp_id);

-- RLS for campaign_ou_candidates
ALTER TABLE campaign_ou_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign_ou_candidates"
  ON campaign_ou_candidates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert campaign_ou_candidates"
  ON campaign_ou_candidates FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update campaign_ou_candidates"
  ON campaign_ou_candidates FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete campaign_ou_candidates"
  ON campaign_ou_candidates FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- 4. OU Coverage Summary View
CREATE OR REPLACE VIEW campaign_ou_coverage_summary
WITH (security_invoker = true)
AS
SELECT
  c.campaign_id,
  COUNT(ou.ou_id) AS total_ous,
  COUNT(ou.ou_id) FILTER (
    WHERE ou.total_workers_estimated BETWEEN 5 AND 50
  ) AS sized_ous,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN campaign_worker_membership cwm
      ON cwm.worker_id = cwou.worker_id AND cwm.campaign_id = c.campaign_id
    WHERE cwou.ou_id = ou.ou_id AND cwm.oa_leader_role = 'contact'
  )) AS ous_with_contact,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN campaign_worker_membership cwm
      ON cwm.worker_id = cwou.worker_id AND cwm.campaign_id = c.campaign_id
    WHERE cwou.ou_id = ou.ou_id AND cwm.oa_leader_role = 'activist'
  )) AS ous_with_activist,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN campaign_worker_membership cwm
      ON cwm.worker_id = cwou.worker_id AND cwm.campaign_id = c.campaign_id
    WHERE cwou.ou_id = ou.ou_id AND cwm.oa_leader_role = 'delegate'
  )) AS ous_with_delegate,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE ou.anchor_worker_id IS NOT NULL) AS ous_with_anchor,
  COALESCE(SUM(ou.total_workers_estimated), 0) AS total_estimated_workers,
  (SELECT COUNT(DISTINCT cwou2.worker_id)
   FROM campaign_worker_ou cwou2
   JOIN campaign_organising_units ou2 ON ou2.ou_id = cwou2.ou_id
   WHERE ou2.campaign_id = c.campaign_id
  ) AS total_assigned_workers
FROM campaigns c
LEFT JOIN campaign_organising_units ou ON ou.campaign_id = c.campaign_id
GROUP BY c.campaign_id;

GRANT SELECT ON campaign_ou_coverage_summary TO authenticated;

-- 5. Add workplan_status to campaign_stage_plans
ALTER TABLE campaign_stage_plans
  ADD COLUMN IF NOT EXISTS workplan_status VARCHAR(20) DEFAULT 'not_started'
    CHECK (workplan_status IN ('not_started', 'in_progress', 'completed'));

-- 6. Seed new WTP category for Organising Units
INSERT INTO wtp_categories (category_name, description, applies_to_stages, sort_order)
VALUES (
  'Organising Units',
  'Defined organising units from campaign structure — focus effort on specific units',
  ARRAY[1,2,3,4,5,6],
  11
);

-- 7. Seed OU discovery ambition options
INSERT INTO ambition_options (stage_number, category, option_text, has_variable, variable_label, variable_type) VALUES
(1, 'structure', 'Define {target_value} organising units of 5-50 workers each', TRUE, 'Number of units', 'number'),
(1, 'structure', 'Identify a contact in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(1, 'structure', 'Identify an activist in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(2, 'structure', 'Define {target_value} organising units of 5-50 workers each', TRUE, 'Number of units', 'number'),
(2, 'structure', 'Identify a contact in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(2, 'structure', 'Identify an activist in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(3, 'structure', 'Identify a contact in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(3, 'structure', 'Identify an activist in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage'),
(3, 'structure', 'Identify a delegate in {target_value}% of defined organising units', TRUE, 'Percentage', 'percentage');
