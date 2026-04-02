# Stream 3-4: Data Flow Design

**Document Version:** 1.0
**Date:** 2026-04-02
**Author:** Planning Agent 3.4
**Status:** Draft Analysis

## Executive Summary

This document specifies HOW data should flow between Organising DB and OA Planner, including sync mechanisms, timing strategies, conflict resolution, and error handling for each integration point identified in the Integration Map.

**Design Principles:**
1. **Single Source of Truth:** Each data element has one owner
2. **Explicit Sync:** All cross-app data movement is visible and trackable
3. **Conflict-Aware:** Plan for concurrent edits across apps
4. **Performance-First:** Minimize cross-app latency
5. **Graceful Degradation:** Apps function independently during outages

---

## 1. Sync Mechanism Categories

### 1.1 Sync Mechanisms

| Mechanism | Description | Use Case | Complexity |
|-----------|-------------|----------|------------|
| **Manual Link** | User navigates via deep link | Context passing | ✅ Complete |
| **Query Params** | URL-encoded data on navigation | One-time data transfer | ✅ Complete |
| **Read-Only API** | Cross-app data fetch without caching | Reference data lookup | Low |
| **Real-Time Sync** | Webhook/Pub/Sub events | Critical state changes | High |
| **Periodic Batch** | Scheduled data sync jobs | Non-critical aggregation | Medium |
| **Shared Tables** | Direct DB access (same Supabase) | High-frequency reads | Low |
| **API Layer** | REST/GraphQL endpoints | Controlled data access | Medium |

### 1.2 Recommended Approach

**For This Integration:**
- **Primary Mechanism:** Shared Tables (same Supabase DB)
- **Real-Time Events:** Supabase Realtime for critical updates
- **API Layer:** Supabase RPC functions for complex operations
- **Cache Layer:** React Query for client-side state

**Rationale:**
- Both apps share the same Supabase project
- Direct table access is fastest and most reliable
- Realtime provides instant updates without polling
- RPC functions enforce business logic at DB level

---

## 2. Integration Point Specifications

### 2.1 Campaign Foundation Data

#### Sync Specification

**Data Owner:** Organising DB (`campaigns` table)
**Data Consumer:** OA Planner (`campaign_stage_plans`, `campaign_timelines`)

**Sync Direction:** Unidirectional (ODB → Planner)

**Timing:**
- Initial: On campaign creation (via query params from deep link)
- Updates: Real-time via Supabase Realtime

**Mechanism:**
```typescript
// 1. User creates campaign in Organising DB
const { data: campaign } = await supabase
  .from('campaigns')
  .insert({
    name: 'Chevron EA 2026',
    agreement_id: 123,
    employer_id: 456,
    organiser_id: 789
  })
  .select()
  .single()

// 2. Navigate to OA Planner with context
const plannerUrl = buildUrlWithContext(
  OA_PLANNER_URL,
  `/campaigns/new`,
  {
    campaign_id: campaign.campaign_id,
    agreement_id: campaign.agreement_id,
    employer_id: campaign.employer_id
  }
)

// 3. OA Planner creates stage plans skeleton
await supabase.from('campaign_stage_plans').insert([
  { campaign_id, stage_number: 1, stage_name: 'Contact ID & Mapping', status: 'draft' },
  { campaign_id, stage_number: 2, stage_name: 'Intro Comms & Education', status: 'draft' },
  // ... stages 3-6
])

// 4. Subscribe to campaign updates for real-time sync
const subscription = supabase
  .channel('campaign-changes')
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'campaigns' },
    (payload) => handleCampaignUpdate(payload.new)
  )
  .subscribe()
```

**Conflict Resolution:**
- No conflicts (unidirectional)
- Organising DB is always source of truth
- OA Planner only reads, never modifies foundation data

**Error Handling:**
```typescript
try {
  await initializeCampaignPlan(campaignId)
} catch (error) {
  if (error.code === 'PGRST116') {
    // Campaign not found - redirect to Organising DB
    router.push(`${ORGANISING_DB_URL}/campaigns/${campaignId}`)
  } else if (error.code === '23505') {
    // Unique violation - plans already exist
    toast.info('Campaign plan already initialized')
  } else {
    // Log error for investigation
    captureException(error)
    toast.error('Failed to initialize campaign plan')
  }
}
```

---

### 2.2 Campaign Scope (Universe → Where to Play)

#### Sync Specification

**Data Owner:** Organising DB (`campaign_universes`, `campaign_universe_rules`)
**Data Consumer:** OA Planner (`plan_where_to_play`)

**Sync Direction:** Unidirectional (ODB → Planner)

**Timing:**
- Initial: On plan creation (import button)
- Updates: Manual trigger via "Import Universe Changes" button

**Mechanism:**
```typescript
// RPC Function: import_universe_to_wtp
CREATE OR REPLACE FUNCTION import_universe_to_wtp(
  p_campaign_id INTEGER,
  p_plan_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_universe RECORD;
  v_rule RECORD;
  v_wtp_id INTEGER;
  v_category_map JSONB := '{"agreement": "Agreements", "worksite": "Worksites", "employer": "Employers", "sector": "Sectors"}';
BEGIN
  -- Loop through universe rules
  FOR v_rule IN
    SELECT cur.*, e.employer_name, ws.worksite_name, a.agreement_name, s.sector_name
    FROM campaign_universe_rules cur
    LEFT JOIN employers e ON cur.rule_entity_id = e.employer_id AND cur.rule_type = 'employer'
    LEFT JOIN worksites ws ON cur.rule_entity_id = ws.worksite_id AND cur.rule_type = 'worksite'
    LEFT JOIN agreements a ON cur.rule_entity_id = a.agreement_id AND cur.rule_type = 'agreement'
    LEFT JOIN sectors s ON cur.rule_entity_id = s.sector_id AND cur.rule_type = 'sector'
    WHERE cur.universe_id IN (
      SELECT universe_id FROM campaign_universes WHERE campaign_id = p_campaign_id
    )
  LOOP
    -- Find or create WTP category
    SELECT category_id INTO v_wtp_id
    FROM wtp_categories
    WHERE category_name = v_category_map->>v_rule.rule_type;

    IF v_wtp_id IS NULL THEN
      INSERT INTO wtp_categories (category_name, applies_to_stages)
      VALUES (v_category_map->>v_rule.rule_type, ARRAY[1,2,3,4,5,6])
      RETURNING category_id INTO v_wtp_id;
    END IF;

    -- Create WTP selection
    INSERT INTO plan_where_to_play (
      plan_id,
      wtp_category_id,
      custom_text,
      is_exclusion,
      priority,
      rationale
    ) VALUES (
      p_plan_id,
      v_wtp_id,
      COALESCE(
        v_rule.rule_entity_id = e.employer_id, e.employer_name,
        v_rule.rule_entity_id = ws.worksite_id, ws.worksite_name,
        v_rule.rule_entity_id = a.agreement_id, a.agreement_name,
        v_rule.rule_entity_id = s.sector_id, s.sector_name
      ),
      NOT v_rule.include,
      2,
      'Imported from campaign universe: ' || v_rule.rule_type
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'imported_count', count(*));
END;
$$;

// Client-side usage
const { data } = await supabase.rpc('import_universe_to_wtp', {
  p_campaign_id: campaignId,
  p_plan_id: activePlanId
})
```

**Conflict Resolution:**
- WTP has `is_exclusion` flag (derived from `universe_rules.include`)
- Re-import prompts user: "Overwrite existing WTP selections?"
- Options: Replace, Merge, Skip

**Error Handling:**
- Validate universe exists before import
- Check for orphaned entity references
- Provide clear error messages for invalid rules

---

### 2.3 Timeline Auto-Calculation

#### Sync Specification

**Data Owner:** Organising DB (`agreements.expiry_date`)
**Data Consumer:** OA Planner (`campaign_timelines`)

**Sync Direction:** Unidirectional (ODB → Planner)

**Timing:**
- Initial: On campaign creation (if agreement linked)
- Updates: Real-time via trigger function

**Mechanism:**
```typescript
// Trigger Function: auto_calculate_campaign_timeline
CREATE OR REPLACE FUNCTION auto_calculate_campaign_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger on expiry_date changes
  IF TG_OP = 'UPDATE' AND OLD.expiry_date = NEW.expiry_date THEN
    RETURN NEW;
  END IF;

  -- Update campaign timelines for campaigns linked to this agreement
  INSERT INTO campaign_timelines (
    campaign_id,
    agreement_id,
    agreement_expiry_date,
    pabo_available_date,
    working_backwards,
    notes
  )
  SELECT
    c.campaign_id,
    NEW.agreement_id,
    NEW.expiry_date,
    NEW.expiry_date - INTERVAL '30 days',
    CASE
      WHEN NEW.expiry_date < CURRENT_DATE + INTERVAL '12 months' THEN true
      ELSE false
    END,
    'Auto-calculated from agreement expiry on ' || NOW()
  FROM campaigns c
  WHERE c.agreement_id = NEW.agreement_id
    AND NOT EXISTS (
      SELECT 1 FROM campaign_timelines ct
      WHERE ct.campaign_id = c.campaign_id
    )
  ON CONFLICT (campaign_id) DO UPDATE SET
    agreement_expiry_date = EXCLUDED.agreement_expiry_date,
    pabo_available_date = EXCLUDED.pabo_available_date,
    working_backwards = EXCLUDED.working_backwards,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

// Create trigger
CREATE TRIGGER trg_agreement_expiry_update
AFTER INSERT OR UPDATE ON agreements
FOR EACH ROW
EXECUTE FUNCTION auto_calculate_campaign_timeline();
```

**Conflict Resolution:**
- Timeline has `user_overridden` flag
- Auto-calculation skips if `user_overridden = true`
- Manual edits trigger confirmation: "Enable auto-calculation?"

**Error Handling:**
- Validate expiry_date is not null
- Check for date conflicts (PABO before today)
- Log calculation errors for investigation

---

### 2.4 Ambition Progress Calculation

#### Sync Specification

**Data Owner:** Organising DB (`campaign_activity_ratings`, `campaign_worker_membership`)
**Data Consumer:** OA Planner (`plan_ambitions.current_value`)

**Sync Direction:** Unidirectional (ODB → Planner)

**Timing:**
- Real-time: Via materialized view refresh
- Fallback: Manual refresh button

**Mechanism:**
```typescript
// Materialized View: ambition_progress_mv
CREATE MATERIALIZED VIEW ambition_progress_mv AS
SELECT
  pa.ambition_id,
  pa.plan_id,
  pa.metric_type,
  pa.target_value,
  -- Calculate current value based on metric type
  CASE
    WHEN pa.metric_type = 'percentage' THEN
      ROUND(
        (SELECT AVG(rating::numeric)
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
  NOW() AS last_calculated
FROM plan_ambitions pa
JOIN campaign_stage_plans csp ON csp.plan_id = pa.plan_id
JOIN campaigns c ON c.campaign_id = csp.campaign_id;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX ON ambition_progress_mv (ambition_id);

-- Refresh function
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

// Client-side subscription
const { data } = await supabase.rpc('refresh_ambition_progress')

// Subscribe to real-time updates
const subscription = supabase
  .channel('ambition-progress')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'campaign_activity_ratings'
  }, async () => {
    await supabase.rpc('refresh_ambition_progress')
    queryClient.invalidateQueries(['ambitions', planId])
  })
  .subscribe()
```

**Conflict Resolution:**
- `plan_ambitions.user_overridden` flag
- Auto-calculation skips if user manually set value
- Visual indicator shows "Auto" vs "Manual" value

**Error Handling:**
- Handle NULL calculations gracefully
- Log calculation failures
- Provide fallback to manual entry

---

### 2.5 Gate Assessment → Campaign Status

#### Sync Specification

**Data Owner:** OA Planner (`gate_assessments`)
**Data Consumer:** Organising DB (`campaigns.status`)

**Sync Direction:** Unidirectional (Planner → ODB)

**Timing:**
- Real-time: Via trigger function

**Mechanism:**
```typescript
// Trigger Function: sync_gate_outcome_to_campaign
CREATE OR REPLACE FUNCTION sync_gate_outcome_to_campaign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign RECORD;
  v_all_gates_passed BOOLEAN;
  v_any_gate_failed BOOLEAN;
BEGIN
  -- Only trigger on final outcomes
  IF NEW.outcome NOT IN ('passed', 'failed', 'override_approved') THEN
    RETURN NEW;
  END IF;

  -- Get campaign details
  SELECT * INTO v_campaign
  FROM campaigns c
  JOIN gate_definitions gd ON gd.campaign_id = c.campaign_id
  WHERE gd.gate_id = NEW.gate_id;

  -- Check gate status across all stages
  SELECT
    BOOL_AND(outcome = 'passed' OR outcome = 'override_approved'),
    BOOL_AND(outcome = 'failed')
  INTO v_all_gates_passed, v_any_gate_failed
  FROM gate_assessments ga
  JOIN gate_definitions gd ON gd.gate_id = ga.gate_id
  WHERE gd.campaign_id = v_campaign.campaign_id;

  -- Update campaign status
  UPDATE campaigns
  SET status = CASE
    WHEN v_all_gates_passed THEN 'completed'
    WHEN v_any_gate_failed THEN 'suspended'
    WHEN EXISTS (
      SELECT 1 FROM campaign_stage_plans
      WHERE campaign_id = v_campaign.campaign_id
        AND status = 'active'
    ) THEN 'active'
    ELSE 'planning'
  END,
  updated_at = NOW()
  WHERE campaign_id = v_campaign.campaign_id;

  -- Create notification for organiser
  INSERT INTO notifications (
    user_id,
    notification_type,
    title,
    message,
    link,
    created_at
  )
  SELECT
    up.user_id,
    'gate_assessment',
    'Gate ' || gd.gate_number || ' ' || NEW.outcome,
    'Campaign "' || v_campaign.name || '" gate ' || gd.gate_number || ' has been ' || NEW.outcome,
    '/campaigns/' || v_campaign.campaign_id,
    NOW()
  FROM user_profiles up
  JOIN organisers o ON o.organiser_id = up.organiser_id
  WHERE o.organiser_id = v_campaign.organiser_id;

  RETURN NEW;
END;
$$;

// Create trigger
CREATE TRIGGER trg_gate_assessment_update
AFTER INSERT OR UPDATE ON gate_assessments
FOR EACH ROW
EXECUTE FUNCTION sync_gate_outcome_to_campaign();
```

**Conflict Resolution:**
- Campaign status can be manually overridden
- Warning shown: "Status managed by gate assessments"
- Manual override requires confirmation

**Error Handling:**
- Validate gate exists before assessment
- Check for circular status updates
- Log all status changes for audit trail

---

### 2.6 Capacity Gaps → Actions

#### Sync Specification

**Data Owner:** OA Planner (`plan_capacities`)
**Data Consumer:** Organising DB (`campaign_actions`)

**Sync Direction:** Unidirectional (Planner → ODB)

**Timing:**
- Real-time: Via trigger function
- Manual: "Generate Actions" button

**Mechanism:**
```typescript
// RPC Function: generate_actions_from_capacities
CREATE OR REPLACE FUNCTION generate_actions_from_capacities(
  p_plan_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_capacity RECORD;
  v_campaign_id INTEGER;
  v_action_id INTEGER;
  v_actions_created INTEGER := 0;
BEGIN
  -- Get campaign_id
  SELECT campaign_id INTO v_campaign_id
  FROM campaign_stage_plans
  WHERE plan_id = p_plan_id;

  -- Loop through gap capacities
  FOR v_capacity IN
    SELECT pc.*, co.option_text
    FROM plan_capacities pc
    JOIN capacity_options co ON co.option_id = pc.capacity_option_id
    WHERE pc.plan_id = p_plan_id
      AND pc.status = 'gap'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_actions ca
        WHERE ca.capacity_gap_id = pc.capacity_id
      )
  LOOP
    -- Create action
    INSERT INTO campaign_actions (
      campaign_id,
      action_type,
      title,
      description,
      due_date,
      status,
      assigned_organiser_id,
      capacity_gap_id
    ) VALUES (
      v_campaign_id,
      'custom',
      'Resolve Gap: ' || v_capacity.option_text,
      COALESCE(v_capacity.gap_description, 'Capacity gap identified in planning'),
      v_capacity.resolution_date,
      'pending',
      v_capacity.assigned_to,
      v_capacity.capacity_id
    )
    RETURNING action_id INTO v_action_id;

    v_actions_created := v_actions_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'actions_created', v_actions_created
  );
END;
$$;

// Add column to track source
ALTER TABLE campaign_actions
ADD COLUMN capacity_gap_id INTEGER REFERENCES plan_capacities(capacity_id);

// Client-side usage
const { data } = await supabase.rpc('generate_actions_from_capacities', {
  p_plan_id: planId
})

if (data?.actions_created > 0) {
  toast.success(`Generated ${data.actions_created} actions from capacity gaps`)
}
```

**Conflict Resolution:**
- Actions generated have `capacity_gap_id` reference
- Manual edits to actions preserved
- Re-generation prompts: "Update existing actions?"

**Error Handling:**
- Validate plan exists
- Check for missing resolution dates
- Handle duplicate action creation

---

### 2.7 Management Systems → Recurring Actions

#### Sync Specification

**Data Owner:** OA Planner (`plan_management_systems`)
**Data Consumer:** Organising DB (`campaign_actions`)

**Sync Direction:** Unidirectional (Planner → ODB)

**Timing:**
- Initial: On management system creation
- Updates: Manual sync via "Update Actions" button

**Mechanism:**
```typescript
// RPC Function: sync_management_systems_to_actions
CREATE OR REPLACE FUNCTION sync_management_systems_to_actions(
  p_plan_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_system RECORD;
  v_campaign_id INTEGER;
  v_actions_created INTEGER := 0;
  v_actions_updated INTEGER := 0;
BEGIN
  -- Get campaign_id
  SELECT campaign_id INTO v_campaign_id
  FROM campaign_stage_plans
  WHERE plan_id = p_plan_id;

  -- Loop through management systems
  FOR v_system IN
    SELECT pms.*, mso.option_text
    FROM plan_management_systems pms
    JOIN management_system_options mso ON mso.option_id = pms.system_option_id
    WHERE pms.plan_id = p_plan_id
  LOOP
    -- Check if action exists
    IF EXISTS (
      SELECT 1 FROM campaign_actions ca
      WHERE ca.management_system_id = v_system.system_id
    ) THEN
      -- Update existing action
      UPDATE campaign_actions
      SET
        title = v_system.option_text,
        description = v_system.description,
        assigned_organiser_id = v_system.responsible_organiser_id,
        recurrence = v_system.frequency,
        updated_at = NOW()
      WHERE management_system_id = v_system.system_id;

      v_actions_updated := v_actions_updated + 1;
    ELSE
      -- Create new action
      INSERT INTO campaign_actions (
        campaign_id,
        action_type,
        title,
        description,
        status,
        assigned_organiser_id,
        recurrence,
        management_system_id
      ) VALUES (
        v_campaign_id,
        'custom',
        v_system.option_text,
        v_system.description,
        'pending',
        v_system.responsible_organiser_id,
        v_system.frequency,
        v_system.system_id
      );

      v_actions_created := v_actions_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'actions_created', v_actions_created,
    'actions_updated', v_actions_updated
  );
END;
$$;

// Add column to track source
ALTER TABLE campaign_actions
ADD COLUMN management_system_id INTEGER REFERENCES plan_management_systems(system_id);

// Add recurrence column
ALTER TABLE campaign_actions
ADD COLUMN recurrence VARCHAR(20)
CHECK (recurrence IN ('daily', 'weekly', 'fortnightly', 'monthly', 'as_needed'));

// Client-side usage
const { data } = await supabase.rpc('sync_management_systems_to_actions', {
  p_plan_id: planId
})
```

**Conflict Resolution:**
- Actions generated have `management_system_id` reference
- Frequency changes update recurrence field
- Manual edits preserved unless "Replace" selected

**Error Handling:**
- Validate frequency values
- Check for circular references
- Handle missing responsible organiser

---

## 3. Timing Strategies

### 3.1 Real-Time Sync (Critical Data)

**Use Cases:**
- Gate assessment outcomes
- Campaign status changes
- Timeline calculations
- High-priority notifications

**Implementation:**
- Supabase Realtime subscriptions
- Database triggers
- WebSocket connections

**Pros:**
- Instant updates
- Best user experience
- No stale data

**Cons:**
- Higher complexity
- More infrastructure
- Requires reliable connections

---

### 3.2 Near Real-Time Sync (High Priority)

**Use Cases:**
- Ambition progress calculations
- Capacity gap detection
- Management system updates

**Implementation:**
- Refresh on page focus
- Interval polling (30-60 seconds)
- Event-driven refresh

**Pros:**
- Good balance
- Manageable complexity
- Works offline

**Cons:**
- Brief stale periods
- Polling overhead

---

### 3.3 Manual Sync (Low Priority)

**Use Cases:**
- Universe → WTP import
- Bulk data updates
- Non-critical reference data

**Implementation:**
- Explicit user action
- "Sync" buttons
- Confirmation prompts

**Pros:**
- User control
- Clear intent
- Minimal surprises

**Cons:**
- Forgotten updates
- Stale data risk
- More user friction

---

### 3.4 Scheduled Batch Sync (Reporting)

**Use Cases:**
- Reporting snapshots
- Aggregate calculations
- Data quality checks

**Implementation:**
- Scheduled functions (cron)
- Nightly/weekly jobs
- Email summaries

**Pros:**
- Predictable timing
- Bulk operations
- Resource-efficient

**Cons:**
- Delayed updates
- Scheduled maintenance

---

## 4. Conflict Resolution Strategies

### 4.1 Last-Write-Wins (Simple)

**Use Case:** Non-critical fields
**Implementation:** Timestamp comparison
**Pros:** Simple, predictable
**Cons:** Data loss risk

```typescript
UPDATE plan_ambitions
SET current_value = NEW.current_value,
    updated_at = GREATEST(OLD.updated_at, NEW.updated_at)
WHERE ambition_id = NEW.ambition_id
  AND OLD.updated_at <= NEW.updated_at;
```

---

### 4.2 Source-of-Truth (Hierarchical)

**Use Case:** Clear ownership
**Implementation:** Designated owner app
**Pros:** No conflicts, clear model
**Cons:** Rigid, inflexible

```typescript
-- Campaign status: OA Planner is source
-- Worker data: Organising DB is source
CREATE POLICY "planner_owns_campaign_status"
ON campaigns FOR UPDATE
USING (
  current_setting('app.context') = 'oa-planner'
);
```

---

### 4.3 Merge (Intelligent)

**Use Case:** Complex objects
**Implementation:** Field-level merging
**Pros:** Best data quality
**Cons:** High complexity

```typescript
function mergeCapacityData(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    // Keep manual overrides
    ...(existing.user_overridden ? {
      current_value: existing.current_value
    } : {}),
    // Merge arrays
    assigned_to: [...new Set([
      ...existing.assigned_to,
      ...incoming.assigned_to
    ])]
  }
}
```

---

### 4.4 User Resolution (Interactive)

**Use Case:** Ambiguous conflicts
**Implementation:** Prompt user
**Pros:** User control
**Cons:** Disruptive, slow

```typescript
if (hasConflict(local, remote)) {
  const resolution = await showConflictDialog({
    local: local,
    remote: remote,
    timestamp: { local: local.updated_at, remote: remote.updated_at }
  })

  switch (resolution.choice) {
    case 'keep-local': await uploadLocal(); break
    case 'keep-remote': await downloadRemote(); break
    case 'merge': await mergeAndUpload(); break
  }
}
```

---

## 5. Error Handling Strategies

### 5.1 Retry with Exponential Backoff

**Use Case:** Transient failures
**Implementation:** Automatic retry
**Delay:** 1s, 2s, 4s, 8s, 16s

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await delay(Math.pow(2, i) * 1000)
    }
  }
  throw new Error('Max retries exceeded')
}
```

---

### 5.2 Circuit Breaker Pattern

**Use Case:** Service degradation
**Implementation:** Threshold-based
**State:** Closed → Open → Half-Open

```typescript
class CircuitBreaker {
  private failures = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private lastFailureTime = 0

  async execute(fn: Function) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > 60000) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    if (this.state === 'half-open') {
      this.state = 'closed'
    }
  }

  private onFailure() {
    this.failures++
    if (this.failures >= 5) {
      this.state = 'open'
      this.lastFailureTime = Date.now()
    }
  }
}
```

---

### 5.3 Dead Letter Queue

**Use Case:** Failed sync operations
**Implementation:** Queue for retry
**Monitoring:** Dashboard alerts

```sql
CREATE TABLE sync_failures (
  failure_id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL,
  source_app VARCHAR(20) NOT NULL,
  target_app VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retry job
CREATE OR REPLACE FUNCTION retry_sync_failures()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_failure RECORD;
  v_retried INTEGER := 0;
BEGIN
  FOR v_failure IN
    SELECT * FROM sync_failures
    WHERE retry_count < 3
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    BEGIN
      -- Attempt retry
      PERFORM execute_sync(v_failure.sync_type, v_failure.payload);

      -- Success - delete record
      DELETE FROM sync_failures WHERE failure_id = v_failure.failure_id;
      v_retried := v_retried + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Increment retry count
      UPDATE sync_failures
      SET retry_count = retry_count + 1,
          last_retry_at = NOW()
      WHERE failure_id = v_failure.failure_id;
    END;
  END LOOP;

  RETURN v_retried;
END;
$$;
```

---

### 5.4 Graceful Degradation

**Use Case:** Partial failures
**Implementation:** Feature flags
**Fallback:** Cached/local data

```typescript
async function getCampaignPlan(campaignId: number) {
  try {
    // Try real-time data
    const { data } = await supabase
      .from('campaign_stage_plans')
      .select('*')
      .eq('campaign_id', campaignId)

    return data
  } catch (error) {
    // Fallback to cached data
    const cached = await getCachedPlan(campaignId)
    if (cached) {
      toast.warning('Using cached data - sync unavailable')
      return cached
    }

    // Final fallback - show error state
    throw new Error('Unable to load campaign plan')
  }
}
```

---

## 6. Data Flow Architecture

### 6.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (Shared Database)                │
│                                                              │
│  ┌────────────────┐              ┌────────────────┐         │
│  │ Organising DB  │              │  OA Planner    │         │
│  │    Tables      │              │    Tables      │         │
│  ├────────────────┤              ├────────────────┤         │
│  │ campaigns      │◄────────────┤ campaign_stage_ │         │
│  │ workers        │              │   plans        │         │
│  │ employers      │     Shared   │ plan_ambitions │         │
│  │ worksites      │    Primary   │ plan_where_to_ │         │
│  │ agreements     │      Key     │   play         │         │
│  │ campaign_*     │              │ plan_capacities│         │
│  └────────────────┘              └────────────────┘         │
│         ▲                                 ▲                 │
│         │                                 │                 │
└─────────┼─────────────────────────────────┼─────────────────┘
          │                                 │
          │                                 │
┌─────────┴─────────┐           ┌──────────┴──────────┐
│  Organising DB    │           │     OA Planner      │
│   (Next.js App)   │           │    (Next.js App)    │
├───────────────────┤           ├─────────────────────┤
│ • Read/Write      │           │ • Read/Write        │
│   ODB tables      │           │   Planner tables    │
│ • Read-only       │           │ • Read-only         │
│   Planner tables  │           │   ODB tables        │
│ • Supabase Client │           │ • Supabase Client   │
│ • React Query     │           │ • React Query       │
└───────────────────┘           └─────────────────────┘
```

### 6.2 Data Ownership Matrix

| Data Element | Owner | Consumer | Sync Direction | Mechanism |
|--------------|-------|----------|----------------|-----------|
| `campaigns.status` | Planner | ODB | Planner → ODB | Trigger |
| `campaigns.foundation` | ODB | Planner | ODB → Planner | Query Params |
| `agreements.expiry_date` | ODB | Planner | ODB → Planner | Trigger |
| `plan_ambitions.current_value` | ODB | Planner | ODB → Planner | Materialized View |
| `plan_capacities.gap` | Planner | ODB | Planner → ODB | RPC |
| `plan_management_systems.*` | Planner | ODB | Planner → ODB | RPC |
| `gate_assessments.outcome` | Planner | ODB | Planner → ODB | Trigger |
| `campaign_universe_rules` | ODB | Planner | ODB → Planner | RPC |

---

## 7. Performance Considerations

### 7.1 Query Optimization

**Materialized Views:**
```sql
-- Refresh concurrently to avoid locks
REFRESH MATERIALIZED VIEW CONCURRENTLY ambition_progress_mv;

-- Schedule refresh every 5 minutes
SELECT cron.schedule(
  'refresh-ambition-progress',
  '*/5 * * * *',
  $$SELECT refresh_ambition_progress()$$
);
```

**Indexing:**
```sql
-- Composite indexes for common queries
CREATE INDEX idx_campaigns_agreement_organiser
ON campaigns(agreement_id, organiser_id)
WHERE status = 'active';

-- Partial indexes for filtered queries
CREATE INDEX idx_active_stage_plans
ON campaign_stage_plans(campaign_id, stage_number)
WHERE status IN ('active', 'draft');
```

---

### 7.2 Caching Strategy

**Client-Side (React Query):**
```typescript
// Cache campaign plans for 5 minutes
const { data } = useQuery({
  queryKey: ['campaign-plans', campaignId],
  queryFn: () => fetchCampaignPlans(campaignId),
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000 // 10 minutes
})

// Invalidate on mutations
await supabase.from('plan_ambitions').insert(...)
queryClient.invalidateQueries(['campaign-plans', campaignId])
```

**Server-Side (Redis):**
```typescript
// Cache frequently accessed data
await redis.set(
  `campaign:${campaignId}:timeline`,
  JSON.stringify(timelineData),
  'EX', 300 // 5 minutes
)
```

---

### 7.3 Batch Operations

**Bulk Inserts:**
```typescript
// Use INSERT ... SELECT for efficiency
INSERT INTO plan_where_to_play (plan_id, wtp_category_id, custom_text)
SELECT
  plan_id,
  category_id,
  entity_name
FROM imported_universe_data;
```

**Batch Updates:**
```typescript
// Process in batches of 100
for (let i = 0; i < items.length; i += 100) {
  const batch = items.slice(i, i + 100)
  await supabase.from('table').upsert(batch)
}
```

---

## 8. Monitoring & Observability

### 8.1 Sync Metrics

**Key Metrics:**
- Sync success rate (target: >99%)
- Sync latency (target: <5s for real-time)
- Data freshness (target: <1min stale)
- Conflict rate (target: <0.1%)

**Monitoring Queries:**
```sql
-- Sync success rate
SELECT
  sync_type,
  COUNT(*) FILTER (WHERE status = 'success')::FLOAT / COUNT(*) AS success_rate
FROM sync_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY sync_type;

-- Sync latency
SELECT
  sync_type,
  AVG(completed_at - created_at) AS avg_latency,
  MAX(completed_at - created_at) AS max_latency
FROM sync_log
WHERE status = 'success'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY sync_type;
```

---

### 8.2 Alerting

**Alert Conditions:**
- Sync failure rate > 5%
- Sync latency > 30s
- Dead letter queue > 100 items
- Data freshness > 5min

**Alert Implementation:**
```sql
-- Create alert function
CREATE OR REPLACE FUNCTION check_sync_health()
RETURNS TABLE(alert_type TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check failure rate
  IF (SELECT COUNT(*)::FLOAT / NULLIF(COUNT(*) FILTER (WHERE status = 'success'), 0)
      FROM sync_log
      WHERE created_at > NOW() - INTERVAL '1 hour') > 0.05 THEN
    RETURN QUERY SELECT 'high-failure-rate', 'Sync failure rate exceeds 5%';
  END IF;

  -- Check queue depth
  IF (SELECT COUNT(*) FROM sync_failures) > 100 THEN
    RETURN QUERY SELECT 'queue-backlog', 'Dead letter queue exceeds 100 items';
  END IF;

  RETURN;
END;
$$;
```

---

## 9. Security Considerations

### 9.1 Row Level Security (RLS)

**App-Specific Policies:**
```sql
-- Organising DB can only write ODB tables
CREATE POLICY "odb_can_write_odb_tables"
ON campaigns FOR UPDATE
TO authenticated
USING (
  current_setting('app.context') = 'organising-db'
);

-- OA Planner can only write Planner tables
CREATE POLICY "planner_can_write_planner_tables"
ON campaign_stage_plans FOR UPDATE
TO authenticated
USING (
  current_setting('app.context') = 'oa-planner'
);
```

---

### 9.2 Audit Logging

**Track All Cross-App Changes:**
```sql
CREATE TABLE cross_app_audit_log (
  log_id SERIAL PRIMARY KEY,
  source_app VARCHAR(20) NOT NULL,
  target_app VARCHAR(20) NOT NULL,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  operation VARCHAR(10) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for automatic logging
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
    current_setting('app.context'),
    CASE
      WHEN current_setting('app.context') = 'organising-db' THEN 'oa-planner'
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

---

## 10. Recommendations Summary

### 10.1 Priority 1 (Immediate)
- Implement trigger-based sync for critical paths
- Set up Supabase Realtime subscriptions
- Create dead letter queue for failed syncs

### 10.2 Priority 2 (Short-Term)
- Implement materialized view for ambition progress
- Add sync health monitoring
- Create circuit breaker pattern

### 10.3 Priority 3 (Medium-Term)
- Optimize queries with proper indexes
- Implement batch processing for bulk operations
- Add comprehensive audit logging

### 10.4 Priority 4 (Long-Term)
- Advanced conflict resolution UI
- Machine learning for conflict prediction
- Automated data quality checks

---

**Next Steps:**
1. Implement Priority 1 sync mechanisms
2. Set up monitoring and alerting
3. Create testing framework for sync scenarios
4. Develop rollback procedures
