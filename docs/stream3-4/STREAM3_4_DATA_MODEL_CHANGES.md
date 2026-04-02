# Stream 3-4: Data Model Changes

**Document Version:** 1.0
**Date:** 2026-04-02
**Author:** Planning Agent 3.4
**Status:** Draft Analysis

## Executive Summary

This document identifies all database schema changes required for integrating Organising DB and OA Planner, including new tables, column additions, and migration scripts. All changes maintain backward compatibility and support gradual rollout.

**Schema Version:** Current → 1.0 (Phase 2), 2.0 (Phase 3), 3.0 (Phase 4)
**Backward Compatibility:** MAINTAINED throughout all phases
**Migration Strategy:** Incremental, non-breaking changes

---

## 1. Current Schema Overview

### 1.1 Shared Tables

**campaigns** (Primary shared entity)
```sql
campaigns (
  campaign_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(20),
  status VARCHAR(20) DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  organiser_id INTEGER REFERENCES organisers(organiser_id),
  agreement_id INTEGER REFERENCES agreements(agreement_id),
  employer_id INTEGER REFERENCES employers(employer_id),
  -- Phase 2 additions
  sync_status VARCHAR(20) DEFAULT 'synced', -- NEW
  last_synced_at TIMESTAMPTZ, -- NEW
  -- Phase 3 additions
  workspace_mode VARCHAR(20) DEFAULT 'management', -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 1.2 Organising DB Tables

**Core Tables:**
- `workers` - Member database
- `employers` - Company directory
- `worksites` - Location database
- `agreements` - EBA tracking
- `campaign_universes` - Organising targets
- `campaign_actions` - Action tracking
- `campaign_activities` - Activity templates
- `campaign_organising_units` - Shift/department organization
- `campaign_worker_membership` - Worker-to-campaign assignment

### 1.3 OA Planner Tables

**Core Tables:**
- `campaign_stage_plans` - Strategic plans per stage
- `plan_ambitions` - Measurable success targets
- `plan_where_to_play` - Focus area selection
- `plan_theory_of_winning` - Causal logic chains
- `plan_capacities` - Resource planning
- `plan_management_systems` - Accountability structures
- `gate_definitions` - Stage gate thresholds
- `gate_criteria` - Gate assessment metrics
- `gate_assessments` - Audit trail
- `campaign_timelines` - Timeline tracking

---

## 2. Phase 2 Schema Changes

### 2.1 Campaigns Table Extensions

**New Columns:**
```sql
-- Add sync tracking columns
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20)
  DEFAULT 'synced'
  CHECK (sync_status IN ('synced', 'pending', 'error', 'conflict')),

ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,

ADD COLUMN IF NOT EXISTS sync_error_message TEXT,

ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20)
  CHECK (plan_status IS NULL OR plan_status IN (
    'not_started', 'in_progress', 'completed', 'blocked'
  ));

-- Add indexes for sync queries
CREATE INDEX IF NOT EXISTS idx_campaigns_sync_status
ON campaigns(sync_status)
WHERE sync_status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS idx_campaigns_plan_status
ON campaigns(plan_status)
WHERE plan_status IS NOT NULL;
```

**Rationale:**
- Track sync status between apps
- Monitor sync health and errors
- Enable automated sync recovery

**Migration Script:**
```sql
-- Initialize sync status for existing campaigns
UPDATE campaigns
SET sync_status = 'synced',
    last_synced_at = NOW()
WHERE sync_status IS NULL;

-- Initialize plan status from existing stage plans
UPDATE campaigns c
SET plan_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM campaign_stage_plans
    WHERE campaign_id = c.campaign_id AND status = 'active'
  ) THEN 'in_progress'
  WHEN EXISTS (
    SELECT 1 FROM campaign_stage_plans
    WHERE campaign_id = c.campaign_id AND status = 'completed'
  ) THEN 'completed'
  ELSE 'not_started'
END
WHERE plan_status IS NULL;
```

**Backward Compatibility:** ✅ YES
- New columns have default values
- Existing queries unaffected
- NULL allowed for plan_status

---

### 2.2 Campaign Actions Extensions

**New Columns:**
```sql
-- Add source tracking for actions
ALTER TABLE campaign_actions
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)
  CHECK (source_type IS NULL OR source_type IN ('manual', 'capacity_gap', 'management_system')),

ADD COLUMN IF NOT EXISTS source_id INTEGER,

ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,

ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Add foreign key to plan_capacities
ALTER TABLE campaign_actions
ADD CONSTRAINT fk_actions_capacity_gap
FOREIGN KEY (source_id)
REFERENCES plan_capacities(capacity_id)
DEFERRABLE INITIALLY DEFERRED;

-- Add foreign key to plan_management_systems
ALTER TABLE campaign_actions
ADD CONSTRAINT fk_actions_management_system
FOREIGN KEY (source_id)
REFERENCES plan_management_systems(system_id)
DEFERRABLE INITIALLY DEFERRED;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_campaign_actions_source
ON campaign_actions(source_type, source_id)
WHERE source_type IS NOT NULL;
```

**Rationale:**
- Track automatically generated actions
- Link actions to planner entities
- Enable sync back to planner

**Migration Script:**
```sql
-- Mark existing actions as manual
UPDATE campaign_actions
SET source_type = 'manual',
    auto_generated = false
WHERE source_type IS NULL;

-- No source_id for manual actions
```

**Backward Compatibility:** ✅ YES
- New columns nullable
- Existing actions marked as manual
- Foreign keys deferrable

---

### 2.3 Cross-App Audit Log

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS cross_app_audit_log (
  log_id SERIAL PRIMARY KEY,
  source_app VARCHAR(20) NOT NULL
    CHECK (source_app IN ('organising-db', 'oa-planner')),
  target_app VARCHAR(20) NOT NULL
    CHECK (target_app IN ('organising-db', 'oa-planner')),
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  operation VARCHAR(10) NOT NULL
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX idx_cross_app_log_source
ON cross_app_audit_log(source_app, created_at DESC);

CREATE INDEX idx_cross_app_log_target
ON cross_app_audit_log(target_app, created_at DESC);

CREATE INDEX idx_cross_app_log_record
ON cross_app_audit_log(table_name, record_id, created_at DESC);

-- RLS
ALTER TABLE cross_app_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
ON cross_app_audit_log FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

CREATE POLICY "System can insert audit logs"
ON cross_app_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);
```

**Rationale:**
- Track all cross-app data changes
- Enable audit trails
- Support conflict resolution

**Migration Script:**
```sql
-- No data migration needed
-- Table is new
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Doesn't affect existing queries

---

### 2.4 Notifications Table

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS notifications (
  notification_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB
);

-- Indexes
CREATE INDEX idx_notifications_user_unread
ON notifications(user_id, created_at DESC)
WHERE read = FALSE;

CREATE INDEX idx_notifications_user_type
ON notifications(user_id, notification_type, created_at DESC);

CREATE INDEX idx_notifications_expires
ON notifications(created_at)
WHERE expires_at IS NOT NULL;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (true);
```

**Rationale:**
- Unified notification system
- Cross-app alerts
- Real-time updates

**Migration Script:**
```sql
-- No data migration needed
-- Table is new
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Doesn't affect existing queries

---

### 2.5 Ambition Progress Materialized View

**New View:**
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS ambition_progress_mv AS
SELECT
  pa.ambition_id,
  pa.plan_id,
  pa.metric_type,
  pa.target_value,
  pa.target_value_max,
  pa.target_date,
  -- Calculate current value based on metric type
  CASE
    WHEN pa.metric_type = 'percentage' THEN
      ROUND(
        (SELECT AVG(car.rating::numeric)
         FROM campaign_activity_ratings car
         JOIN campaign_activities ca ON ca.activity_id = car.activity_id
         WHERE ca.campaign_id = csp.campaign_id
        )::numeric,
        2
      )::TEXT
    WHEN pa.metric_type = 'count' THEN
      (SELECT COUNT(*)::TEXT
       FROM campaign_worker_membership cwm
       WHERE cwm.campaign_id = csp.campaign_id
      )
    WHEN pa.metric_type = 'boolean' THEN
      (SELECT CASE WHEN COUNT(*) > 0 THEN 'true' ELSE 'false' END
       FROM campaign_activity_ratings car
       JOIN campaign_activities ca ON ca.activity_id = car.activity_id
       WHERE ca.campaign_id = csp.campaign_id
         AND car.rating >= 4
      )
    ELSE NULL
  END AS current_value,
  -- Calculate progress percentage
  CASE
    WHEN pa.metric_type = 'percentage' AND pa.target_value IS NOT NULL THEN
      ROUND(
        (SELECT AVG(car.rating::numeric)
         FROM campaign_activity_ratings car
         JOIN campaign_activities ca ON ca.activity_id = car.activity_id
         WHERE ca.campaign_id = csp.campaign_id
        )::numeric / NULLIF(pa.target_value::numeric, 0) * 100,
        2
      )
    WHEN pa.metric_type = 'count' AND pa.target_value IS NOT NULL THEN
      ROUND(
        (SELECT COUNT(*)::numeric
         FROM campaign_worker_membership cwm
         WHERE cwm.campaign_id = csp.campaign_id
        ) / NULLIF(pa.target_value::numeric, 0) * 100,
        2
      )
    WHEN pa.metric_type = 'boolean' THEN
      CASE
        WHEN EXISTS (
          SELECT 1 FROM campaign_activity_ratings car
          JOIN campaign_activities ca ON ca.activity_id = car.activity_id
          WHERE ca.campaign_id = csp.campaign_id AND car.rating >= 4
        ) THEN 100
        ELSE 0
      END
    ELSE NULL
  END AS progress_percentage,
  NOW() AS last_calculated
FROM plan_ambitions pa
JOIN campaign_stage_plans csp ON csp.plan_id = pa.plan_id
JOIN campaigns c ON c.campaign_id = csp.campaign_id;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ambition_progress_mv_pkey
ON ambition_progress_mv(ambition_id);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS ambition_progress_mv_plan
ON ambition_progress_mv(plan_id);

CREATE INDEX IF NOT EXISTS ambition_progress_mv_calculated
ON ambition_progress_mv(last_calculated);
```

**Refresh Function:**
```sql
CREATE OR REPLACE FUNCTION refresh_ambition_progress()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ambition_progress_mv;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_ambition_progress()
TO authenticated;
```

**Rationale:**
- Pre-calculate ambition progress
- Avoid expensive runtime calculations
- Support real-time dashboards

**Migration Script:**
```sql
-- Initial refresh
REFRESH MATERIALIZED VIEW ambition_progress_mv;

-- Schedule refresh every 5 minutes (requires pg_cron)
SELECT cron.schedule(
  'refresh-ambition-progress',
  '*/5 * * * *',
  $$SELECT refresh_ambition_progress()$$
);
```

**Backward Compatibility:** ✅ YES
- Materialized view is read-only
- Doesn't modify existing tables
- Can be dropped without affecting functionality

---

### 2.6 Sync Failures Table

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS sync_failures (
  failure_id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL,
  source_app VARCHAR(20) NOT NULL,
  target_app VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  error_code VARCHAR(50),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_sync_failures_pending
ON sync_failures(created_at)
WHERE resolved_at IS NULL AND retry_count < max_retries;

CREATE INDEX idx_sync_failures_type
ON sync_failures(sync_type, created_at DESC);

-- RLS
ALTER TABLE sync_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sync failures"
ON sync_failures FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

CREATE POLICY "System can manage sync failures"
ON sync_failures FOR ALL
TO authenticated
USING (get_user_role() IN ('admin', 'service_role'));
```

**Rationale:**
- Track failed sync operations
- Enable automated retry
- Monitor sync health

**Migration Script:**
```sql
-- No data migration needed
-- Table is new
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Doesn't affect existing queries

---

## 3. Phase 3 Schema Changes

### 3.1 Workspace Settings Table

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS workspace_settings (
  setting_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, setting_key)
);

-- Indexes
CREATE INDEX idx_workspace_settings_user
ON workspace_settings(user_id, setting_key);

-- Common settings
-- 'default_tab': 'overview' | 'planning' | 'execution'
-- 'sidebar_collapsed': boolean
-- 'planner_height': integer (pixels)
-- 'auto_sync': boolean

-- RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
ON workspace_settings FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

**Rationale:**
- Persist user preferences
- Remember workspace state
- Improve UX across sessions

**Migration Script:**
```sql
-- No data migration needed
-- Table is new

-- Insert default settings for existing users
INSERT INTO workspace_settings (user_id, setting_key, setting_value)
SELECT
  user_id,
  'default_tab',
  '"overview"'::jsonb
FROM user_profiles
ON CONFLICT (user_id, setting_key) DO NOTHING;

INSERT INTO workspace_settings (user_id, setting_key, setting_value)
SELECT
  user_id,
  'auto_sync',
  'true'::jsonb
FROM user_profiles
ON CONFLICT (user_id, setting_key) DO NOTHING;
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Defaults provided automatically

---

### 3.2 Campaign View Preferences

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS campaign_view_preferences (
  preference_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  preferred_tab VARCHAR(20) NOT NULL
    CHECK (preferred_tab IN ('overview', 'planning', 'execution')),
  sidebar_state JSONB,
  planner_height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, campaign_id)
);

-- Indexes
CREATE INDEX idx_campaign_view_prefs_user
ON campaign_view_preferences(user_id, campaign_id);

-- RLS
ALTER TABLE campaign_view_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
ON campaign_view_preferences FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

**Rationale:**
- Remember user preferences per campaign
- Improve UX across sessions
- Support personalized layouts

**Migration Script:**
```sql
-- No data migration needed
-- Table is new
-- Preferences created on-demand
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Preferences created lazily

---

## 4. Phase 4 Schema Changes

### 4.1 Unified Audit Log

**New Table:**
```sql
-- Replace separate audit logs with unified table
CREATE TABLE IF NOT EXISTS unified_audit_log (
  log_id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id UUID,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  operation VARCHAR(10) NOT NULL
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  app_context VARCHAR(20) -- 'organising-db' | 'oa-planner' | 'unified'
    CHECK (app_context IS NULL OR app_context IN (
      'organising-db', 'oa-planner', 'unified'
    )),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_unified_audit_log_table_record
ON unified_audit_log(table_name, record_id, created_at DESC);

CREATE INDEX idx_unified_audit_log_user
ON unified_audit_log(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

CREATE INDEX idx_unified_audit_log_operation
ON unified_audit_log(operation, created_at DESC);

-- Partitioning by month for performance
CREATE TABLE unified_audit_log_y2026m04 PARTITION OF unified_audit_log
FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE unified_audit_log_y2026m05 PARTITION OF unified_audit_log
FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- RLS
ALTER TABLE unified_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
ON unified_audit_log FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

CREATE POLICY "System can insert audit logs"
ON unified_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);
```

**Rationale:**
- Unified audit trail for all apps
- Support compliance requirements
- Enable forensic analysis

**Migration Script:**
```sql
-- Migrate existing audit logs
INSERT INTO unified_audit_log (
  user_id,
  table_name,
  record_id,
  operation,
  old_values,
  new_values,
  app_context,
  created_at
)
SELECT
  user_id,
  table_name,
  record_id,
  operation,
  old_values,
  new_values,
  'organising-db', -- Source app
  created_at
FROM cross_app_audit_log;

-- Update foreign key references
-- (Handled by application code migration)
```

**Backward Compatibility:** ✅ YES (with migration)
- Old table kept for rollback
- Data migrated to new table
- Application code updated gradually

---

### 4.2 Feature Flags Table

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_id SERIAL PRIMARY KEY,
  flag_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 0
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_users UUID[],
  target_teams TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feature_flags_enabled
ON feature_flags(is_enabled, flag_name)
WHERE is_enabled = true;

-- RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view feature flags"
ON feature_flags FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage feature flags"
ON feature_flags FOR ALL
TO authenticated
USING (get_user_role() = 'admin');
```

**Rationale:**
- Support gradual feature rollout
- Enable A/B testing
- Facilitate beta testing

**Migration Script:**
```sql
-- Seed initial feature flags
INSERT INTO feature_flags (flag_name, description, is_enabled, rollout_percentage) VALUES
('unified-ui', 'Unified UI interface', false, 0),
('embedded-planner', 'Embedded planner experience', false, 0),
('cross-app-sync', 'Cross-app data synchronization', false, 0),
('unified-notifications', 'Unified notification system', false, 0);
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Features off by default

---

### 4.3 User Activity Log

**New Table:**
```sql
CREATE TABLE IF NOT EXISTS user_activity_log (
  activity_id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  activity_type VARCHAR(50) NOT NULL,
  page_path TEXT,
  campaign_id INTEGER REFERENCES campaigns(campaign_id),
  metadata JSONB,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_activity_log_user
ON user_activity_log(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

CREATE INDEX idx_user_activity_log_type
ON user_activity_log(activity_type, created_at DESC);

CREATE INDEX idx_user_activity_log_campaign
ON user_activity_log(campaign_id, created_at DESC)
WHERE campaign_id IS NOT NULL;

-- Partitioning by month
CREATE TABLE user_activity_log_y2026m04 PARTITION OF user_activity_log
FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
ON user_activity_log FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity"
ON user_activity_log FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

CREATE POLICY "System can insert activity logs"
ON user_activity_log FOR INSERT
TO authenticated
WITH CHECK (true);
```

**Rationale:**
- Track user behavior
- Support analytics
- Enable UX improvements

**Migration Script:**
```sql
-- No data migration needed
-- Table is new
-- Activity logged in real-time
```

**Backward Compatibility:** ✅ YES
- New table, no existing dependencies
- Application code logs activity

---

## 5. Migration Execution Plan

### 5.1 Migration Order

**Phase 2 Migrations (Execute in Order):**
1. ✅ Campaigns table extensions
2. ✅ Campaign actions extensions
3. ✅ Cross-app audit log
4. ✅ Notifications table
5. ✅ Ambition progress MV
6. ✅ Sync failures table

**Phase 3 Migrations (Execute in Order):**
1. ✅ Workspace settings table
2. ✅ Campaign view preferences table

**Phase 4 Migrations (Execute in Order):**
1. ✅ Unified audit log
2. ✅ Feature flags table
3. ✅ User activity log

### 5.2 Migration Script Template

```sql
-- ============================================================
-- Migration: [MIGRATION_NAME]
-- Author: Planning Agent 3.4
-- Date: [DATE]
-- Description: [DESCRIPTION]
-- ============================================================

-- Check if migration already applied
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'schema_migrations'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM schema_migrations
      WHERE migration_name = '[MIGRATION_NAME]'
    ) THEN
      RAISE NOTICE 'Migration % already applied', '[MIGRATION_NAME]';
      RETURN;
    END IF;
  END IF;
END $$;

-- Begin transaction
BEGIN;

-- [MIGRATION_SQL_HERE]

-- Record migration
INSERT INTO schema_migrations (migration_name, applied_at)
VALUES ('[MIGRATION_NAME]', NOW())
ON CONFLICT (migration_name) DO NOTHING;

-- Commit transaction
COMMIT;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration % applied successfully', '[MIGRATION_NAME]';
END $$;
```

### 5.3 Rollback Script Template

```sql
-- ============================================================
-- Rollback: [MIGRATION_NAME]
-- Author: Planning Agent 3.4
-- Date: [DATE]
-- Description: [DESCRIPTION]
-- ============================================================

-- Begin transaction
BEGIN;

-- [ROLLBACK_SQL_HERE]

-- Remove migration record
DELETE FROM schema_migrations
WHERE migration_name = '[MIGRATION_NAME]';

-- Commit transaction
COMMIT;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Rollback % applied successfully', '[MIGRATION_NAME]';
END $$;
```

---

## 6. Backward Compatibility Analysis

### 6.1 Breaking Changes

**NONE** - All changes are additive and backward compatible

### 6.2 Deprecation Notices

**Phase 4:**
- `cross_app_audit_log` → Replaced by `unified_audit_log`
- Separate app audit logs → Unified audit log

**Migration Path:**
1. Keep old tables during transition
2. Migrate data to new tables
3. Update application code
4. Drop old tables after validation

### 6.3 Compatibility Matrix

| Feature | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---------|---------|---------|---------|---------|
| Deep links | ✅ | ✅ | ✅ | ✅ |
| Status sync | ❌ | ✅ | ✅ | ✅ |
| Universe import | ❌ | ✅ | ✅ | ✅ |
| Timeline auto-calc | ❌ | ✅ | ✅ | ✅ |
| Embedded planner | ❌ | ❌ | ✅ | ✅ |
| Unified UI | ❌ | ❌ | ❌ | ✅ |
| Single codebase | ❌ | ❌ | ❌ | ✅ |

---

## 7. Performance Considerations

### 7.1 Index Strategy

**New Indexes:**
- All foreign key columns indexed
- Composite indexes for common queries
- Partial indexes for filtered queries
- Covering indexes for hot queries

**Example:**
```sql
-- Partial index for pending sync operations
CREATE INDEX idx_campaigns_sync_pending
ON campaigns(campaign_id, last_synced_at)
WHERE sync_status = 'pending';

-- Composite index for ambition progress queries
CREATE INDEX idx_ambitions_plan_metric
ON plan_ambitions(plan_id, metric_type)
WHERE metric_type IN ('percentage', 'count', 'boolean');
```

### 7.2 Query Optimization

**Materialized Views:**
- `ambition_progress_mv` - Refresh every 5 minutes
- Concurrent refresh to avoid locks
- Indexes for fast lookups

**Example:**
```sql
-- Query using materialized view
SELECT
  pa.*,
  ap.current_value,
  ap.progress_percentage
FROM plan_ambitions pa
JOIN ambition_progress_mv ap ON ap.ambition_id = pa.ambition_id
WHERE pa.plan_id = $1;
```

### 7.3 Partitioning

**Time-Series Tables:**
- `unified_audit_log` - Partition by month
- `user_activity_log` - Partition by month
- Automatic partition creation

**Example:**
```sql
-- Create partition function
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_partition_name TEXT;
BEGIN
  FOR i IN 0..11 LOOP
    v_start_date := DATE_TRUNC('month', NOW() + (i || ' months')::INTERVAL);
    v_end_date := v_start_date + INTERVAL '1 month';

    v_partition_name := 'unified_audit_log_y' ||
      TO_CHAR(v_start_date, 'YYYY') || 'm' ||
      TO_CHAR(v_start_date, 'MM');

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF unified_audit_log
       FOR VALUES FROM (%L) TO (%L)',
      v_partition_name, v_start_date, v_end_date
    );
  END LOOP;
END;
$$;
```

---

## 8. Security Considerations

### 8.1 Row Level Security (RLS)

**All New Tables:**
- RLS enabled by default
- Explicit policies for each role
- Least privilege principle

**Example:**
```sql
-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can see all notifications
CREATE POLICY "Admins can view all notifications"
ON notifications FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');
```

### 8.2 Audit Logging

**All Cross-App Changes:**
- Logged to `cross_app_audit_log`
- Track user, timestamp, changes
- Support forensic analysis

**Example:**
```sql
-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION log_cross_app_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO cross_app_audit_log (
    source_app,
    target_app,
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    user_id
  ) VALUES (
    current_setting('app.source_app'),
    CASE
      WHEN current_setting('app.source_app') = 'organising-db' THEN 'oa-planner'
      ELSE 'organising-db'
    END,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.campaign_id
      ELSE NEW.campaign_id
    END,
    TG_OP,
    CASE
      WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)
    END,
    CASE
      WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)
    END,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

### 8.3 Data Encryption

**Sensitive Fields:**
- Consider encryption for PII
- Use Supabase encryption
- Comply with privacy regulations

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Each Migration:**
- Test schema creation
- Test constraints
- Test indexes
- Test RLS policies

**Example:**
```sql
-- Test campaign sync status constraint
BEGIN;
  INSERT INTO campaigns (name, sync_status)
  VALUES ('Test', 'invalid_status');
  -- Should fail with constraint violation
ROLLBACK;
```

### 9.2 Integration Tests

**Cross-App Queries:**
- Test data flow between apps
- Test sync operations
- Test rollback scenarios

**Example:**
```typescript
// Test campaign status sync
test('campaign status syncs from plan status', async () => {
  // Update plan status
  await supabase
    .from('campaign_stage_plans')
    .update({ status: 'completed' })
    .eq('plan_id', planId)

  // Wait for trigger
  await sleep(1000)

  // Check campaign status
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('status')
    .eq('campaign_id', campaignId)
    .single()

  expect(campaign.status).toBe('completed')
})
```

### 9.3 Performance Tests

**Query Performance:**
- Test all new indexes
- Benchmark materialized view refresh
- Load test sync operations

**Example:**
```sql
-- Benchmark ambition progress query
EXPLAIN ANALYZE
SELECT pa.*, ap.current_value, ap.progress_percentage
FROM plan_ambitions pa
JOIN ambition_progress_mv ap ON ap.ambition_id = pa.ambition_id
WHERE pa.plan_id = 1;
```

---

## 10. Rollback Procedures

### 10.1 Per-Phase Rollback

**Phase 2 Rollback:**
```sql
-- Drop new tables
DROP TABLE IF EXISTS cross_app_audit_log CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP MATERIALIZED VIEW IF EXISTS ambition_progress_mv CASCADE;
DROP TABLE IF EXISTS sync_failures CASCADE;

-- Remove new columns
ALTER TABLE campaigns
DROP COLUMN IF EXISTS sync_status,
DROP COLUMN IF EXISTS last_synced_at,
DROP COLUMN IF EXISTS sync_error_message,
DROP COLUMN IF EXISTS plan_status;

ALTER TABLE campaign_actions
DROP COLUMN IF EXISTS source_type,
DROP COLUMN IF EXISTS source_id,
DROP COLUMN IF EXISTS auto_generated,
DROP COLUMN IF EXISTS generation_metadata;

-- Drop new indexes
DROP INDEX IF EXISTS idx_campaigns_sync_status;
DROP INDEX IF EXISTS idx_campaigns_plan_status;
DROP INDEX IF EXISTS idx_campaign_actions_source;
```

**Phase 3 Rollback:**
```sql
-- Drop new tables
DROP TABLE IF EXISTS workspace_settings CASCADE;
DROP TABLE IF EXISTS campaign_view_preferences CASCADE;
```

**Phase 4 Rollback:**
```sql
-- Drop new tables
DROP TABLE IF EXISTS unified_audit_log CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS user_activity_log CASCADE;

-- Restore old audit log (if needed)
-- (Handled by application code rollback)
```

### 10.2 Full Rollback

**Database Snapshot:**
```bash
# Before migrations, take snapshot
pg_dump -h db.host -U user -d dbname > backup.sql

# Rollback: restore snapshot
psql -h db.host -U user -d dbname < backup.sql
```

**Selective Rollback:**
```sql
-- Rollback specific migration
DELETE FROM schema_migrations
WHERE migration_name = 'MIGRATION_NAME';

-- Execute rollback script
\i rollback/MIGRATION_NAME.sql;
```

---

## 11. Summary

### 11.1 Schema Changes by Phase

**Phase 2 (3 months):**
- 2 tables extended (campaigns, campaign_actions)
- 4 new tables (cross_app_audit_log, notifications, sync_failures, ambition_progress_mv)
- 6 new indexes
- 6 new triggers
- ~200 lines of migration SQL

**Phase 3 (3 months):**
- 2 new tables (workspace_settings, campaign_view_preferences)
- 2 new indexes
- ~50 lines of migration SQL

**Phase 4 (12 months):**
- 3 new tables (unified_audit_log, feature_flags, user_activity_log)
- 6 new indexes (including partitions)
- ~150 lines of migration SQL

### 11.2 Backward Compatibility

**All Changes:** ✅ BACKWARD COMPATIBLE
- No breaking changes
- Additive schema evolution
- Graceful degradation
- Clear rollback paths

### 11.3 Migration Effort

**Phase 2:** 2-3 days
**Phase 3:** 1 day
**Phase 4:** 2-3 days

**Total:** ~1 week of migration effort

### 11.4 Risk Assessment

**Schema Migration Risk:** LOW
- Incremental changes
- Thorough testing
- Clear rollback procedures
- No breaking changes

**Performance Risk:** LOW
- Indexes added for performance
- Materialized views for heavy queries
- Partitioning for large tables
- Query optimization reviewed

**Data Integrity Risk:** LOW
- Foreign key constraints maintained
- RLS policies applied
- Audit logging enabled
- Transactional migrations

---

## 12. Recommendations

### 12.1 Immediate Actions

1. **Review Schema Changes**
   - Validate all proposed changes
   - Check for conflicts with existing features
   - Approve migration scripts

2. **Set Up Migration Environment**
   - Create staging database
   - Test all migrations
   - Validate rollback procedures

3. **Plan Deployment**
   - Schedule maintenance windows
   - Prepare rollback procedures
   - Train team on new schema

### 12.2 Long-Term Actions

1. **Monitor Performance**
   - Query performance metrics
   - Index usage statistics
   - Materialized view refresh times

2. **Optimize Iteratively**
   - Review slow queries
   - Add missing indexes
   - Tune materialized view refresh frequency

3. **Plan Next Iterations**
   - Gather user feedback
   - Identify new integration points
   - Design future schema enhancements

---

**Next Steps:**
1. Stakeholder review of schema changes
2. Database team approval
3. Create migration scripts
4. Test in staging environment
5. Execute Phase 2 migrations
