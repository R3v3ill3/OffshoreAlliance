-- ============================================================
-- Campaign Organiser Team
-- ============================================================
-- Adds a campaign-level organiser roster that allows any work_role
-- to be assigned to any campaign with a campaign-specific role and
-- an optional campaign-specific reporting line (overrides the global
-- user_profiles.reports_to for RLS purposes on that campaign).
-- ============================================================

-- 1. New table
CREATE TABLE IF NOT EXISTS campaign_organisers (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  organiser_id INTEGER NOT NULL REFERENCES organisers(organiser_id) ON DELETE CASCADE,
  campaign_role VARCHAR(30) NOT NULL DEFAULT 'organiser'
    CHECK (campaign_role IN ('lead', 'organiser', 'coordinator', 'industrial_officer', 'specialist')),
  -- Campaign-specific reporting override (NULL = fall back to global user_profiles.reports_to)
  reports_to_organiser_id INTEGER REFERENCES organisers(organiser_id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, organiser_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_organisers_campaign ON campaign_organisers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_organisers_organiser ON campaign_organisers(organiser_id);
CREATE INDEX IF NOT EXISTS idx_campaign_organisers_reports_to ON campaign_organisers(reports_to_organiser_id) WHERE reports_to_organiser_id IS NOT NULL;

ALTER TABLE campaign_organisers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_organisers_read_all" ON campaign_organisers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "campaign_organisers_write" ON campaign_organisers
  FOR ALL USING (can_write_to_campaign(campaign_id));

-- 2. Update is_assigned_to_campaign: honour both agreement-level and campaign-level team membership
CREATE OR REPLACE FUNCTION is_assigned_to_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  -- Original: agreement-level assignment via campaign_timelines
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN organisers o ON o.organiser_id = up.organiser_id
    JOIN agreement_organisers ao ON ao.organiser_id = o.organiser_id
    JOIN campaign_timelines ct ON ct.agreement_id = ao.agreement_id
    WHERE ct.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
  )
  OR
  -- New: direct campaign-level team membership (any campaign_role)
  EXISTS (
    SELECT 1 FROM campaign_organisers co
    JOIN organisers o ON o.organiser_id = co.organiser_id
    JOIN user_profiles up ON up.organiser_id = o.organiser_id
    WHERE co.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Update is_lead_organiser_for_campaign: also check campaign-level lead role
--    and campaign-specific reports_to_organiser_id overrides
CREATE OR REPLACE FUNCTION is_lead_organiser_for_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  -- Arm 1: primary lead via campaigns.organiser_id
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN organisers o ON o.organiser_id = up.organiser_id
    JOIN campaigns c ON c.organiser_id = o.organiser_id
    WHERE c.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
    AND up.work_role IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  )
  OR
  -- Arm 2: campaign-level team entry with 'lead' role
  EXISTS (
    SELECT 1 FROM campaign_organisers co
    JOIN organisers o ON o.organiser_id = co.organiser_id
    JOIN user_profiles up ON up.organiser_id = o.organiser_id
    WHERE co.campaign_id = p_campaign_id
    AND co.campaign_role = 'lead'
    AND up.user_id = auth.uid()
  )
  OR
  -- Arm 3: user is a coordinator/lead named as campaign-specific "reports to" for a team member
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN organisers o ON o.organiser_id = up.organiser_id
    JOIN campaign_organisers co ON co.reports_to_organiser_id = o.organiser_id
    WHERE co.campaign_id = p_campaign_id
    AND up.user_id = auth.uid()
    AND up.work_role IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  )
  OR
  -- Arm 4: legacy global reports_to chain
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN campaigns c ON c.campaign_id = p_campaign_id
    JOIN organisers o ON o.organiser_id = c.organiser_id
    JOIN user_profiles organiser_profile ON organiser_profile.organiser_id = o.organiser_id
    WHERE up.user_id = auth.uid()
    AND organiser_profile.reports_to = up.user_id
    AND up.work_role IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_organisers TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE campaign_organisers_id_seq TO authenticated;
