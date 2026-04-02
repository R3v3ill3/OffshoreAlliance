-- ============================================================
-- Permission System for Campaign Editing
-- ============================================================
-- Purpose: Implement universal read access with restricted write
-- based on campaign ownership, assignment, and granted permissions.
--
-- User Decision: Everyone can see everything, but can only edit
-- campaigns they initiated or are assigned to, unless they have
-- been granted explicit permission by the owner or a lead/coordinator.
--
-- Permissions are PERSISTENT (not one-time) and leads/coordinators
-- can approve on behalf of the campaign owner.
-- ============================================================

-- ============================================================
-- 0. ADD CREATED_BY TO CAMPAIGNS TABLE
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update existing campaigns to set created_by from organiser relationship
-- This is a one-time data migration for existing records
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM campaigns
  WHERE created_by IS NULL;

  IF v_count > 0 THEN
    -- For existing campaigns, we'll set created_by to NULL
    -- New campaigns will have the creator set
    UPDATE campaigns
    SET created_by = NULL
    WHERE created_by IS NULL;
  END IF;
END $$;

-- ============================================================
-- 1. PERMISSION TABLES
-- ============================================================

-- Table to track edit permissions granted for campaigns
CREATE TABLE IF NOT EXISTS campaign_edit_permissions (
  permission_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_to UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  is_persistent BOOLEAN DEFAULT TRUE,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_edit_permissions_campaign ON campaign_edit_permissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_edit_permissions_granted_to ON campaign_edit_permissions(granted_to);
CREATE INDEX IF NOT EXISTS idx_campaign_edit_permissions_status ON campaign_edit_permissions(status);

-- Table to track permission requests (pending approval)
CREATE TABLE IF NOT EXISTS campaign_permission_requests (
  request_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  response_reason TEXT,
  approved_permission_id INTEGER REFERENCES campaign_edit_permissions(permission_id)
);

-- Indexes for requests
CREATE INDEX IF NOT EXISTS idx_campaign_permission_requests_campaign ON campaign_permission_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_permission_requests_requested_by ON campaign_permission_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_campaign_permission_requests_status ON campaign_permission_requests(status);

-- Enable RLS on permission tables
ALTER TABLE campaign_edit_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_permission_requests ENABLE ROW LEVEL SECURITY;

-- RLS for permission tables - admins can manage all, users can see their own
CREATE POLICY "admins_full_permissions" ON campaign_edit_permissions
  FOR ALL USING (is_admin());

CREATE POLICY "users_see_own_permissions" ON campaign_edit_permissions
  FOR SELECT USING (granted_to = auth.uid() OR granted_by = auth.uid());

CREATE POLICY "admins_full_requests" ON campaign_permission_requests
  FOR ALL USING (is_admin());

CREATE POLICY "users_see_own_requests" ON campaign_permission_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "users_create_requests" ON campaign_permission_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid() AND status = 'pending');

-- ============================================================
-- 2. HELPER FUNCTIONS - Updated
-- ============================================================

-- Check if user is admin (already exists, keeping for reference)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is a coordinator or lead organiser (can approve permissions)
CREATE OR REPLACE FUNCTION is_coordinator_or_lead()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid()
    AND (
      role = 'admin'
      OR work_role = 'lead_organiser'
      OR work_role = 'coordinator'
      OR work_role = 'industrial_coordinator'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user created the campaign
CREATE OR REPLACE FUNCTION is_campaign_creator(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.campaign_id = p_campaign_id
    AND c.created_by = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is the lead organiser for a campaign
CREATE OR REPLACE FUNCTION is_lead_organiser_for_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN organisers o ON o.organiser_id = up.organiser_id
    JOIN campaigns c ON c.organiser_id = o.organiser_id
    WHERE c.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
    AND up.work_role = 'lead_organiser'
  )
  OR EXISTS (
    -- User is a coordinator/lead and the campaign's organiser reports to them
    SELECT 1 FROM user_profiles up
    JOIN campaigns c ON c.campaign_id = p_campaign_id
    JOIN organisers o ON o.organiser_id = c.organiser_id
    JOIN user_profiles organiser_profile ON organiser_profile.organiser_id = o.organiser_id
    WHERE up.user_id = auth.uid()
    AND organiser_profile.reports_to = up.user_id
    AND up.work_role IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is assigned to campaign via agreement_organisers
CREATE OR REPLACE FUNCTION is_assigned_to_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN organisers o ON o.organiser_id = up.organiser_id
    JOIN agreement_organisers ao ON ao.organiser_id = o.organiser_id
    JOIN campaign_timelines ct ON ct.agreement_id = ao.agreement_id
    WHERE ct.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- NEW: Check if user has explicit edit permission for a campaign
CREATE OR REPLACE FUNCTION has_campaign_edit_permission(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_edit_permissions
    WHERE campaign_id = p_campaign_id
    AND granted_to = auth.uid()
    AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- NEW: Combined function for write access check
CREATE OR REPLACE FUNCTION can_write_to_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT
    is_admin()
    OR is_campaign_creator(p_campaign_id)
    OR is_lead_organiser_for_campaign(p_campaign_id)
    OR is_assigned_to_campaign(p_campaign_id)
    OR has_campaign_edit_permission(p_campaign_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. RPC FUNCTIONS
-- ============================================================

-- Request permission to edit a campaign
CREATE OR REPLACE FUNCTION request_campaign_edit_permission(
  p_campaign_id INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_request_id INTEGER;
  v_campaign_name TEXT;
  v_owner_id UUID;
  v_leads UUID[];
BEGIN
  -- Check if user already has permission
  IF has_campaign_edit_permission(p_campaign_id) OR can_write_to_campaign(p_campaign_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You already have access to this campaign'
    );
  END IF;

  -- Get campaign info
  SELECT name, created_by INTO v_campaign_name, v_owner_id
  FROM campaigns
  WHERE campaign_id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Campaign not found'
    );
  END IF;

  -- Create the request
  INSERT INTO campaign_permission_requests (campaign_id, requested_by, reason)
  VALUES (p_campaign_id, auth.uid(), p_reason)
  RETURNING request_id INTO v_request_id;

  -- Get leads/coordinators to notify
  SELECT ARRAY_AGG(DISTINCT up.user_id)
  INTO v_leads
  FROM user_profiles up
  WHERE up.work_role IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  AND (
    up.user_id = v_owner_id
    OR EXISTS (
      SELECT 1 FROM organisers o
      JOIN campaigns c ON c.organiser_id = o.organiser_id
      JOIN user_profiles op ON op.organiser_id = o.organiser_id
      WHERE c.campaign_id = p_campaign_id
      AND op.reports_to = up.user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'campaign_name', v_campaign_name,
    'owner_id', v_owner_id,
    'leads_to_notify', v_leads
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permission to edit a campaign
CREATE OR REPLACE FUNCTION grant_campaign_edit_permission(
  p_request_id INTEGER,
  p_response_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_permission_id INTEGER;
  v_can_approve BOOLEAN;
BEGIN
  -- Get the request
  SELECT * INTO v_request
  FROM campaign_permission_requests
  WHERE request_id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Request not found or already processed'
    );
  END IF;

  -- Check if user can approve (admin, coordinator, or campaign owner's lead)
  SELECT is_admin() OR is_lead_organiser_for_campaign(v_request.campaign_id)
  INTO v_can_approve;

  IF NOT v_can_approve THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You do not have permission to approve this request'
    );
  END IF;

  -- Create the permission
  INSERT INTO campaign_edit_permissions (
    campaign_id, granted_by, granted_to, reason
  )
  VALUES (
    v_request.campaign_id, auth.uid(), v_request.requested_by, v_request.reason
  )
  RETURNING permission_id INTO v_permission_id;

  -- Update the request
  UPDATE campaign_permission_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      response_reason = p_response_reason,
      approved_permission_id = v_permission_id
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'permission_id', v_permission_id,
    'campaign_id', v_request.campaign_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deny a permission request
CREATE OR REPLACE FUNCTION deny_campaign_edit_permission(
  p_request_id INTEGER,
  p_response_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_can_approve BOOLEAN;
BEGIN
  -- Check if user can approve/deny
  SELECT is_admin() OR is_lead_organiser_for_campaign(
    SELECT campaign_id FROM campaign_permission_requests WHERE request_id = p_request_id
  )
  INTO v_can_approve;

  IF NOT v_can_approve THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You do not have permission to process this request'
    );
  END IF;

  -- Update the request
  UPDATE campaign_permission_requests
  SET status = 'denied',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      response_reason = p_response_reason
  WHERE request_id = p_request_id AND status = 'pending';

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke a permission
CREATE OR REPLACE FUNCTION revoke_campaign_edit_permission(
  p_permission_id INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_permission RECORD;
BEGIN
  SELECT * INTO v_permission
  FROM campaign_edit_permissions
  WHERE permission_id = p_permission_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Permission not found'
    );
  END IF;

  -- Only granters, admins, or the permission recipient can revoke
  IF NOT (
    is_admin()
    OR auth.uid() = v_permission.granted_by
    OR auth.uid() = v_permission.granted_to
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You do not have permission to revoke this'
    );
  END IF;

  UPDATE campaign_edit_permissions
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = auth.uid()
  WHERE permission_id = p_permission_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending permission requests for coordinators/leads
CREATE OR REPLACE FUNCTION get_pending_permission_requests()
RETURNS TABLE (
  request_id INTEGER,
  campaign_id INTEGER,
  campaign_name TEXT,
  requested_by_name TEXT,
  requested_by_email TEXT,
  reason TEXT,
  requested_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.request_id,
    pr.campaign_id,
    c.name AS campaign_name,
    COALESCE(org.organiser_name, up.display_name, 'Unknown') AS requested_by_name,
    COALESCE(org.email, au.email) AS requested_by_email,
    pr.reason,
    pr.requested_at
  FROM campaign_permission_requests pr
  JOIN campaigns c ON c.campaign_id = pr.campaign_id
  LEFT JOIN user_profiles up ON up.user_id = pr.requested_by
  LEFT JOIN organisers org ON org.organiser_id = up.organiser_id
  LEFT JOIN auth.users au ON au.id = pr.requested_by
  WHERE pr.status = 'pending'
  AND (
    -- User is admin
    is_admin()
    OR
    -- User is a lead/coordinator for this campaign
    is_lead_organiser_for_campaign(pr.campaign_id)
  )
  ORDER BY pr.requested_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's permissions (what they can access)
CREATE OR REPLACE FUNCTION get_my_campaign_permissions()
RETURNS TABLE (
  campaign_id INTEGER,
  campaign_name TEXT,
  access_type TEXT,
  granted_by_name TEXT,
  granted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.campaign_id,
    c.name AS campaign_name,
    'permission' AS access_type,
    COALESCE(org.organiser_name, up.display_name, 'System') AS granted_by_name,
    cep.granted_at
  FROM campaign_edit_permissions cep
  JOIN campaigns c ON c.campaign_id = cep.campaign_id
  LEFT JOIN user_profiles up ON up.user_id = cep.granted_by
  LEFT JOIN organisers org ON org.organiser_id = up.organiser_id
  WHERE cep.granted_to = auth.uid()
  AND cep.status = 'active'

  UNION ALL

  -- Campaigns user created
  SELECT
    c.campaign_id,
    c.name,
    'creator' AS access_type,
    'You' AS granted_by_name,
    c.created_at::TIMESTAMPTZ
  FROM campaigns c
  WHERE c.created_by = auth.uid()

  UNION ALL

  -- Campaigns user is assigned to via agreement_organisers
  SELECT DISTINCT
    ct.campaign_id,
    c.name,
    'assigned' AS access_type,
    'Agreement Assignment' AS granted_by_name,
    NOW() AS granted_at
  FROM organisers o
  JOIN user_profiles up ON up.organiser_id = o.organiser_id
  JOIN agreement_organisers ao ON ao.organiser_id = o.organiser_id
  JOIN campaign_timelines ct ON ct.agreement_id = ao.agreement_id
  JOIN campaigns c ON c.campaign_id = ct.campaign_id
  WHERE up.user_id = auth.uid()

  ORDER BY granted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. UPDATED RLS POLICIES FOR PLANNING TABLES
-- ============================================================

-- Drop old policies that will be replaced
DROP POLICY IF EXISTS "stage_plans_admin_all" ON campaign_stage_plans;
DROP POLICY IF EXISTS "stage_plans_lead_organiser" ON campaign_stage_plans;
DROP POLICY IF EXISTS "stage_plans_organiser_read" ON campaign_stage_plans;
DROP POLICY IF EXISTS "stage_plans_organiser_write" ON campaign_stage_plans;

-- New simplified policies for campaign_stage_plans
CREATE POLICY "stage_plans_read_all" ON campaign_stage_plans
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "stage_plans_write" ON campaign_stage_plans
  FOR ALL USING (can_write_to_campaign(campaign_id));

-- Similar updates for other planning tables
DROP POLICY IF EXISTS "plan_ambitions_access" ON plan_ambitions;
CREATE POLICY "plan_ambitions_read_all" ON plan_ambitions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plan_ambitions_write" ON plan_ambitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_stage_plans csp
      WHERE csp.plan_id = plan_ambitions.plan_id
      AND can_write_to_campaign(csp.campaign_id)
    )
  );

DROP POLICY IF EXISTS "plan_wtp_access" ON plan_where_to_play;
CREATE POLICY "plan_wtp_read_all" ON plan_where_to_play
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plan_wtp_write" ON plan_where_to_play
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_stage_plans csp
      WHERE csp.plan_id = plan_where_to_play.plan_id
      AND can_write_to_campaign(csp.campaign_id)
    )
  );

DROP POLICY IF EXISTS "plan_theory_access" ON plan_theory_of_winning;
CREATE POLICY "plan_theory_read_all" ON plan_theory_of_winning
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plan_theory_write" ON plan_theory_of_winning
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_stage_plans csp
      WHERE csp.plan_id = plan_theory_of_winning.plan_id
      AND can_write_to_campaign(csp.campaign_id)
    )
  );

DROP POLICY IF EXISTS "plan_capacities_access" ON plan_capacities;
CREATE POLICY "plan_capacities_read_all" ON plan_capacities
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plan_capacities_write" ON plan_capacities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_stage_plans csp
      WHERE csp.plan_id = plan_capacities.plan_id
      AND can_write_to_campaign(csp.campaign_id)
    )
  );

DROP POLICY IF EXISTS "plan_mgmt_access" ON plan_management_systems;
CREATE POLICY "plan_mgmt_read_all" ON plan_management_systems
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plan_mgmt_write" ON plan_management_systems
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_stage_plans csp
      WHERE csp.plan_id = plan_management_systems.plan_id
      AND can_write_to_campaign(csp.campaign_id)
    )
  );

DROP POLICY IF EXISTS "gate_definitions_admin_all" ON gate_definitions;
DROP POLICY IF EXISTS "gate_definitions_lead_organiser" ON gate_definitions;
DROP POLICY IF EXISTS "gate_definitions_organiser_read" ON gate_definitions;

CREATE POLICY "gate_definitions_read_all" ON gate_definitions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "gate_definitions_write" ON gate_definitions
  FOR ALL USING (can_write_to_campaign(campaign_id));

DROP POLICY IF EXISTS "gate_criteria_access" ON gate_criteria;
CREATE POLICY "gate_criteria_read_all" ON gate_criteria
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "gate_criteria_write" ON gate_criteria
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM gate_definitions gd
      WHERE gd.gate_id = gate_criteria.gate_id
      AND can_write_to_campaign(gd.campaign_id)
    )
  );

DROP POLICY IF EXISTS "gate_assessments_read" ON gate_assessments;
DROP POLICY IF EXISTS "gate_assessments_write" ON gate_assessments;

CREATE POLICY "gate_assessments_read_all" ON gate_assessments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "gate_assessments_write" ON gate_assessments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM gate_definitions gd
      WHERE gd.gate_id = gate_assessments.gate_id
      AND can_write_to_campaign(gd.campaign_id)
    )
  );

DROP POLICY IF EXISTS "campaign_timelines_admin" ON campaign_timelines;
DROP POLICY IF EXISTS "campaign_timelines_lead_organiser" ON campaign_timelines;
DROP POLICY IF EXISTS "campaign_timelines_organiser_read" ON campaign_timelines;

CREATE POLICY "campaign_timelines_read_all" ON campaign_timelines
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "campaign_timelines_write" ON campaign_timelines
  FOR ALL USING (can_write_to_campaign(campaign_id));

DROP POLICY IF EXISTS "stage_timeline_targets_access" ON stage_timeline_targets;
CREATE POLICY "stage_timeline_targets_read_all" ON stage_timeline_targets
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stage_timeline_targets_write" ON stage_timeline_targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_timelines ct
      WHERE ct.timeline_id = stage_timeline_targets.timeline_id
      AND can_write_to_campaign(ct.campaign_id)
    )
  );

DROP POLICY IF EXISTS "reporting_snapshots_admin" ON reporting_snapshots;
DROP POLICY IF EXISTS "reporting_snapshots_lead_organiser" ON reporting_snapshots;
DROP POLICY IF EXISTS "reporting_snapshots_organiser_read" ON reporting_snapshots;

CREATE POLICY "reporting_snapshots_read_all" ON reporting_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "reporting_snapshots_write" ON reporting_snapshots
  FOR ALL USING (can_write_to_campaign(campaign_id));

-- ============================================================
-- 5. VIEWS FOR CONVENIENCE
-- ============================================================

-- View to see all campaign edit permissions with user details
CREATE OR REPLACE VIEW campaign_permissions_detail AS
SELECT
  cep.permission_id,
  cep.campaign_id,
  c.name AS campaign_name,
  cep.granted_by,
  granter_profile.organiser_id AS granted_by_organiser_id,
  granter_org.organiser_name AS granted_by_name,
  cep.granted_to,
  grantee_profile.organiser_id AS granted_to_organiser_id,
  grantee_org.organiser_name AS granted_to_name,
  cep.granted_at,
  cep.is_persistent,
  cep.reason,
  cep.status,
  cep.revoked_at,
  cep.revoked_by
FROM campaign_edit_permissions cep
JOIN campaigns c ON c.campaign_id = cep.campaign_id
LEFT JOIN user_profiles granter_profile ON granter_profile.user_id = cep.granted_by
LEFT JOIN organisers granter_org ON granter_org.organiser_id = granter_profile.organiser_id
LEFT JOIN user_profiles grantee_profile ON grantee_profile.user_id = cep.granted_to
LEFT JOIN organisers grantee_org ON grantee_org.organiser_id = grantee_profile.organiser_id
LEFT JOIN auth.users granter_auth ON granter_auth.id = cep.granted_by
LEFT JOIN auth.users grantee_auth ON grantee_auth.id = cep.granted_to;

-- View to see pending permission requests
CREATE OR REPLACE VIEW pending_permission_requests AS
SELECT
  pr.request_id,
  pr.campaign_id,
  c.name AS campaign_name,
  pr.requested_by,
  requester_profile.organiser_id AS requested_by_organiser_id,
  requester_org.organiser_name AS requested_by_name,
  COALESCE(requester_org.email, requester_auth.email) AS requested_by_email,
  pr.reason,
  pr.status,
  pr.requested_at
FROM campaign_permission_requests pr
JOIN campaigns c ON c.campaign_id = pr.campaign_id
LEFT JOIN user_profiles requester_profile ON requester_profile.user_id = pr.requested_by
LEFT JOIN organisers requester_org ON requester_org.organiser_id = requester_profile.organiser_id
LEFT JOIN auth.users requester_auth ON requester_auth.id = pr.requested_by
WHERE pr.status = 'pending'
ORDER BY pr.requested_at DESC;

-- Grant access to views
GRANT SELECT ON campaign_permissions_detail TO authenticated;
GRANT SELECT ON pending_permission_requests TO authenticated;

-- Grant execute on RPC functions
GRANT EXECUTE ON FUNCTION request_campaign_edit_permission TO authenticated;
GRANT EXECUTE ON FUNCTION grant_campaign_edit_permission TO authenticated;
GRANT EXECUTE ON FUNCTION deny_campaign_edit_permission TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_campaign_edit_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_permission_requests TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_campaign_permissions TO authenticated;
