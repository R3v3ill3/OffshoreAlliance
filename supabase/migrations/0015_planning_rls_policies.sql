-- ============================================================
-- RLS Policies for all new planning tables
-- ============================================================

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user is lead_organiser for a campaign
CREATE OR REPLACE FUNCTION is_lead_organiser_for_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN campaigns c ON c.campaign_id = p_campaign_id
    WHERE up.user_id = auth.uid()
    AND up.work_role = 'lead_organiser'
    AND (
      c.organiser_id = up.organiser_id
      OR c.organiser_id IN (
        SELECT up2.organiser_id FROM user_profiles up2
        WHERE up2.reports_to = up.user_id
      )
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user is assigned to a campaign
CREATE OR REPLACE FUNCTION is_assigned_to_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN agreement_organisers ao ON ao.organiser_id = up.organiser_id
    JOIN campaigns c ON c.campaign_id = p_campaign_id
    JOIN agreements a ON a.agreement_id = ao.agreement_id
    WHERE up.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN campaigns c ON c.campaign_id = p_campaign_id
    WHERE up.user_id = auth.uid()
    AND c.organiser_id = up.organiser_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ambition_options — readable by all authenticated users
-- ============================================================
ALTER TABLE ambition_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambition_options_read_all" ON ambition_options
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ambition_options_write_admin" ON ambition_options
FOR ALL USING (is_admin());

CREATE POLICY "ambition_options_insert_user" ON ambition_options
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND is_system_default = FALSE);

-- ============================================================
-- wtp_categories — readable by all authenticated users
-- ============================================================
ALTER TABLE wtp_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wtp_categories_read_all" ON wtp_categories
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "wtp_categories_write_admin" ON wtp_categories
FOR ALL USING (is_admin());

-- ============================================================
-- wtp_options — readable by all authenticated users
-- ============================================================
ALTER TABLE wtp_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wtp_options_read_all" ON wtp_options
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "wtp_options_write_admin" ON wtp_options
FOR ALL USING (is_admin());

CREATE POLICY "wtp_options_insert_user" ON wtp_options
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND is_system_default = FALSE);

-- ============================================================
-- capacity_options — readable by all authenticated users
-- ============================================================
ALTER TABLE capacity_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capacity_options_read_all" ON capacity_options
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "capacity_options_write_admin" ON capacity_options
FOR ALL USING (is_admin());

CREATE POLICY "capacity_options_insert_user" ON capacity_options
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND is_system_default = FALSE);

-- ============================================================
-- management_system_options — readable by all authenticated users
-- ============================================================
ALTER TABLE management_system_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "management_system_options_read_all" ON management_system_options
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "management_system_options_write_admin" ON management_system_options
FOR ALL USING (is_admin());

CREATE POLICY "management_system_options_insert_user" ON management_system_options
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND is_system_default = FALSE);

-- ============================================================
-- campaign_stage_plans
-- ============================================================
ALTER TABLE campaign_stage_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_plans_admin_all" ON campaign_stage_plans
FOR ALL USING (is_admin());

CREATE POLICY "stage_plans_lead_organiser" ON campaign_stage_plans
FOR ALL USING (is_lead_organiser_for_campaign(campaign_id));

CREATE POLICY "stage_plans_organiser_read" ON campaign_stage_plans
FOR SELECT USING (is_assigned_to_campaign(campaign_id));

CREATE POLICY "stage_plans_organiser_write" ON campaign_stage_plans
FOR UPDATE USING (is_assigned_to_campaign(campaign_id));

-- ============================================================
-- plan_ambitions
-- ============================================================
ALTER TABLE plan_ambitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_ambitions_access" ON plan_ambitions
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_stage_plans csp
    WHERE csp.plan_id = plan_ambitions.plan_id
    AND (is_admin() OR is_lead_organiser_for_campaign(csp.campaign_id) OR is_assigned_to_campaign(csp.campaign_id))
  )
);

-- ============================================================
-- plan_where_to_play
-- ============================================================
ALTER TABLE plan_where_to_play ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_wtp_access" ON plan_where_to_play
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_stage_plans csp
    WHERE csp.plan_id = plan_where_to_play.plan_id
    AND (is_admin() OR is_lead_organiser_for_campaign(csp.campaign_id) OR is_assigned_to_campaign(csp.campaign_id))
  )
);

-- ============================================================
-- plan_theory_of_winning
-- ============================================================
ALTER TABLE plan_theory_of_winning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_theory_access" ON plan_theory_of_winning
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_stage_plans csp
    WHERE csp.plan_id = plan_theory_of_winning.plan_id
    AND (is_admin() OR is_lead_organiser_for_campaign(csp.campaign_id) OR is_assigned_to_campaign(csp.campaign_id))
  )
);

-- ============================================================
-- plan_capacities
-- ============================================================
ALTER TABLE plan_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_capacities_access" ON plan_capacities
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_stage_plans csp
    WHERE csp.plan_id = plan_capacities.plan_id
    AND (is_admin() OR is_lead_organiser_for_campaign(csp.campaign_id) OR is_assigned_to_campaign(csp.campaign_id))
  )
);

-- ============================================================
-- plan_management_systems
-- ============================================================
ALTER TABLE plan_management_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_mgmt_access" ON plan_management_systems
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_stage_plans csp
    WHERE csp.plan_id = plan_management_systems.plan_id
    AND (is_admin() OR is_lead_organiser_for_campaign(csp.campaign_id) OR is_assigned_to_campaign(csp.campaign_id))
  )
);

-- ============================================================
-- gate_definitions
-- ============================================================
ALTER TABLE gate_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_definitions_admin_all" ON gate_definitions
FOR ALL USING (is_admin());

CREATE POLICY "gate_definitions_lead_organiser" ON gate_definitions
FOR ALL USING (is_lead_organiser_for_campaign(campaign_id));

CREATE POLICY "gate_definitions_organiser_read" ON gate_definitions
FOR SELECT USING (is_assigned_to_campaign(campaign_id));

-- ============================================================
-- gate_criteria
-- ============================================================
ALTER TABLE gate_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_criteria_access" ON gate_criteria
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM gate_definitions gd
    WHERE gd.gate_id = gate_criteria.gate_id
    AND (is_admin() OR is_lead_organiser_for_campaign(gd.campaign_id) OR is_assigned_to_campaign(gd.campaign_id))
  )
);

-- ============================================================
-- gate_assessments
-- ============================================================
ALTER TABLE gate_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_assessments_read" ON gate_assessments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM gate_definitions gd
    WHERE gd.gate_id = gate_assessments.gate_id
    AND (is_admin() OR is_lead_organiser_for_campaign(gd.campaign_id) OR is_assigned_to_campaign(gd.campaign_id))
  )
);

CREATE POLICY "gate_assessments_write" ON gate_assessments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM gate_definitions gd
    WHERE gd.gate_id = gate_assessments.gate_id
    AND (is_admin() OR is_lead_organiser_for_campaign(gd.campaign_id))
  )
);

-- ============================================================
-- campaign_timelines
-- ============================================================
ALTER TABLE campaign_timelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_timelines_admin" ON campaign_timelines
FOR ALL USING (is_admin());

CREATE POLICY "campaign_timelines_lead_organiser" ON campaign_timelines
FOR ALL USING (is_lead_organiser_for_campaign(campaign_id));

CREATE POLICY "campaign_timelines_organiser_read" ON campaign_timelines
FOR SELECT USING (is_assigned_to_campaign(campaign_id));

-- ============================================================
-- stage_timeline_targets
-- ============================================================
ALTER TABLE stage_timeline_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_timeline_targets_access" ON stage_timeline_targets
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaign_timelines ct
    WHERE ct.timeline_id = stage_timeline_targets.timeline_id
    AND (is_admin() OR is_lead_organiser_for_campaign(ct.campaign_id) OR is_assigned_to_campaign(ct.campaign_id))
  )
);

-- ============================================================
-- reporting_snapshots
-- ============================================================
ALTER TABLE reporting_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporting_snapshots_admin" ON reporting_snapshots
FOR ALL USING (is_admin());

CREATE POLICY "reporting_snapshots_lead_organiser" ON reporting_snapshots
FOR ALL USING (is_lead_organiser_for_campaign(campaign_id));

CREATE POLICY "reporting_snapshots_organiser_read" ON reporting_snapshots
FOR SELECT USING (is_assigned_to_campaign(campaign_id));
