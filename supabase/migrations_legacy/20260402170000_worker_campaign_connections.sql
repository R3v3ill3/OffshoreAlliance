-- ============================================================
-- Worker-Campaign Connection Model
-- ============================================================
-- Purpose: Track worker engagement across campaigns with activity
-- tracking, ratings, and support for service employers
-- ============================================================

-- Create worker_campaign_connections table
CREATE TABLE IF NOT EXISTS worker_campaign_connections (
  connection_id BIGSERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaign_timelines(campaign_id) ON DELETE CASCADE,
  connection_status TEXT NOT NULL DEFAULT 'potential'
    CHECK (connection_status IN ('potential', 'contacted', 'engaged', 'member', 'inactive', 'lost')),

  -- Service employer fields (for non-union workers)
  is_service_employer BOOLEAN DEFAULT false,
  job_title TEXT,

  -- Engagement tracking
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  contact_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,

  -- Support for multiple contact methods
  preferred_contact_method TEXT
    CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'in_person', 'none')),
  preferred_contact_time TEXT,

  -- Membership tracking
  joined_at TIMESTAMPTZ,
  membership_number TEXT,

  -- Activity tracking
  activities_attended_count INTEGER DEFAULT 0,
  last_activity_attended_at TIMESTAMPTZ,
  volunteer_hours DECIMAL(5,2) DEFAULT 0,

  -- Support and willingness metrics
  support_level TEXT
    CHECK (support_level IN ('strong_supporter', 'supporter', 'neutral', 'unsupportive', 'hostile')),
  willingness_to_volunteer TEXT
    CHECK (willingness_to_volunteer IN ('very_willing', 'willing', 'maybe', 'unlikely', 'no')),
  willingness_to_recruit TEXT
    CHECK (willingness_to_recruit IN ('very_willing', 'willing', 'maybe', 'unlikely', 'no')),

  -- Recruitment potential
  recruitment_potential TEXT
    CHECK (recruitment_potential IN ('high', 'medium', 'low', 'none')),
  estimated_network_size INTEGER DEFAULT 0,

  -- Notes and metadata
  notes TEXT,
  risk_flags TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(worker_id, campaign_id)
);

-- Create indexes for performance
CREATE INDEX idx_wcc_worker_id ON worker_campaign_connections(worker_id);
CREATE INDEX idx_wcc_campaign_id ON worker_campaign_connections(campaign_id);
CREATE INDEX idx_wcc_status ON worker_campaign_connections(connection_status);
CREATE INDEX idx_wcc_last_activity ON worker_campaign_connections(last_activity_at DESC);
CREATE INDEX idx_wcc_support_level ON worker_campaign_connections(support_level);
CREATE INDEX idx_wcc_service_employer ON worker_campaign_connections(is_service_employer);

-- Create full-text search index on notes and job title
CREATE INDEX idx_wcc_notes_gin ON worker_campaign_connections USING gin(to_tsvector('english', notes));
CREATE INDEX idx_wcc_job_title_gin ON worker_campaign_connections USING gin(to_tsvector('english', job_title));

-- ============================================================
-- ACTIVITY LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_activity_log (
  activity_id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL REFERENCES worker_campaign_connections(connection_id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('contact', 'meeting', 'event_attendance', 'volunteer', 'donation', 'survey_response', 'other')),
  activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT,
  outcome TEXT,

  -- Event-specific fields (link to campaign activity / event definition)
  event_id INTEGER REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  duration_minutes INTEGER,

  -- Contact-specific fields
  contact_method TEXT
    CHECK (contact_method IN ('email', 'phone', 'sms', 'in_person', 'mail', 'other')),

  -- Volunteer-specific fields
  volunteer_role TEXT,
  volunteer_hours DECIMAL(5,2),

  -- Rating and feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,

  -- Audit
  logged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wal_connection_id ON worker_activity_log(connection_id);
CREATE INDEX idx_wal_activity_type ON worker_activity_log(activity_type);
CREATE INDEX idx_wal_activity_date ON worker_activity_log(activity_date DESC);
CREATE INDEX idx_wal_event_id ON worker_activity_log(event_id);

-- ============================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wcc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_wcc_updated_at
  BEFORE UPDATE ON worker_campaign_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_wcc_updated_at();

-- Update connection stats when activity is logged
CREATE OR REPLACE FUNCTION update_connection_stats_on_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update last_activity_at and increment contact count
  UPDATE worker_campaign_connections
  SET
    last_activity_at = GREATEST(COALESCE(last_activity_at, '-infinity'), NEW.activity_date),
    contact_count = CASE
      WHEN NEW.activity_type = 'contact' THEN contact_count + 1
      ELSE contact_count
    END,
    activities_attended_count = CASE
      WHEN NEW.activity_type = 'event_attendance' THEN activities_attended_count + 1
      ELSE activities_attended_count
    END,
    volunteer_hours = CASE
      WHEN NEW.volunteer_hours IS NOT NULL THEN volunteer_hours + NEW.volunteer_hours
      ELSE volunteer_hours
    END
  WHERE connection_id = NEW.connection_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_connection_stats
  AFTER INSERT ON worker_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION update_connection_stats_on_activity();

-- Get connection details with worker info
CREATE OR REPLACE FUNCTION get_worker_connection_details(p_connection_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'connection_id', wcc.connection_id,
    'worker', jsonb_build_object(
      'worker_id', w.worker_id,
      'first_name', w.first_name,
      'last_name', w.last_name,
      'email', w.email,
      'phone', w.phone,
      'is_active', w.is_active
    ),
    'campaign', jsonb_build_object(
      'campaign_id', c.campaign_id,
      'name', c.name
    ),
    'connection_status', wcc.connection_status,
    'is_service_employer', wcc.is_service_employer,
    'job_title', wcc.job_title,
    'support_level', wcc.support_level,
    'willingness_to_volunteer', wcc.willingness_to_volunteer,
    'first_contacted_at', wcc.first_contacted_at,
    'last_contacted_at', wcc.last_contacted_at,
    'contact_count', wcc.contact_count,
    'last_activity_at', wcc.last_activity_at,
    'volunteer_hours', wcc.volunteer_hours,
    'activities_attended_count', wcc.activities_attended_count,
    'notes', wcc.notes,
    'tags', wcc.tags,
    'created_at', wcc.created_at
  ) INTO v_result
  FROM worker_campaign_connections wcc
  JOIN workers w ON w.worker_id = wcc.worker_id
  JOIN campaign_timelines c ON c.campaign_id = wcc.campaign_id
  WHERE wcc.connection_id = p_connection_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all workers for a campaign with connection status
CREATE OR REPLACE FUNCTION get_campaign_workers(p_campaign_id INTEGER, p_status TEXT DEFAULT NULL)
RETURNS SETOF JSONB AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'connection_id', wcc.connection_id,
    'worker_id', w.worker_id,
    'worker_name', w.first_name || ' ' || w.last_name,
    'email', w.email,
    'phone', w.phone,
    'connection_status', wcc.connection_status,
    'is_service_employer', wcc.is_service_employer,
    'job_title', wcc.job_title,
    'support_level', wcc.support_level,
    'willingness_to_volunteer', wcc.willingness_to_volunteer,
    'last_contacted_at', wcc.last_contacted_at,
    'contact_count', wcc.contact_count,
    'volunteer_hours', wcc.volunteer_hours,
    'activities_attended_count', wcc.activities_attended_count,
    'last_activity_at', wcc.last_activity_at,
    'tags', wcc.tags
  )
  FROM worker_campaign_connections wcc
  JOIN workers w ON w.worker_id = wcc.worker_id
  WHERE wcc.campaign_id = p_campaign_id
    AND (p_status IS NULL OR wcc.connection_status = p_status)
  ORDER BY wcc.last_activity_at DESC NULLS LAST, wcc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all campaigns for a worker
CREATE OR REPLACE FUNCTION get_worker_campaigns(p_worker_id INTEGER)
RETURNS SETOF JSONB AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'connection_id', wcc.connection_id,
    'campaign_id', c.campaign_id,
    'campaign_name', c.name,
    'connection_status', wcc.connection_status,
    'joined_at', wcc.joined_at,
    'volunteer_hours', wcc.volunteer_hours,
    'activities_attended_count', wcc.activities_attended_count,
    'last_activity_at', wcc.last_activity_at
  )
  FROM worker_campaign_connections wcc
  JOIN campaign_timelines c ON c.campaign_id = wcc.campaign_id
  WHERE wcc.worker_id = p_worker_id
  ORDER BY wcc.last_activity_at DESC NULLS LAST, wcc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE worker_campaign_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can read connections for campaigns they have access to
CREATE POLICY "Users can read campaign worker connections"
  ON worker_campaign_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_timelines
      WHERE campaign_id = worker_campaign_connections.campaign_id
        AND can_write_to_campaign(campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

-- Users can insert connections for campaigns they have access to
CREATE POLICY "Users can insert campaign worker connections"
  ON worker_campaign_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_timelines
      WHERE campaign_id = worker_campaign_connections.campaign_id
        AND can_write_to_campaign(campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

-- Users can update connections for campaigns they have access to
CREATE POLICY "Users can update campaign worker connections"
  ON worker_campaign_connections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_timelines
      WHERE campaign_id = worker_campaign_connections.campaign_id
        AND can_write_to_campaign(campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

-- Users can delete connections for campaigns they have access to
CREATE POLICY "Users can delete campaign worker connections"
  ON worker_campaign_connections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

-- Activity log follows connection policies
CREATE POLICY "Users can read activity log for accessible connections"
  ON worker_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM worker_campaign_connections
      JOIN campaign_timelines ON campaign_timelines.campaign_id = worker_campaign_connections.campaign_id
      WHERE worker_campaign_connections.connection_id = worker_activity_log.connection_id
        AND can_write_to_campaign(campaign_timelines.campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

CREATE POLICY "Users can insert activity log for accessible connections"
  ON worker_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM worker_campaign_connections
      JOIN campaign_timelines ON campaign_timelines.campaign_id = worker_campaign_connections.campaign_id
      WHERE worker_campaign_connections.connection_id = worker_activity_log.connection_id
        AND can_write_to_campaign(campaign_timelines.campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'coordinator')
    )
  );

-- ============================================================
-- GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON worker_campaign_connections TO authenticated;
GRANT INSERT ON worker_campaign_connections TO authenticated;
GRANT UPDATE ON worker_campaign_connections TO authenticated;
GRANT DELETE ON worker_campaign_connections TO authenticated;
GRANT SELECT ON worker_activity_log TO authenticated;
GRANT INSERT ON worker_activity_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_worker_connection_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_workers TO authenticated;
GRANT EXECUTE ON FUNCTION get_worker_campaigns TO authenticated;
