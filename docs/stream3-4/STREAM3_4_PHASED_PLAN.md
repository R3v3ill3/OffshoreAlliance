# Stream 3-4: Phased Implementation Plan

**Document Version:** 1.0
**Date:** 2026-04-02
**Author:** Planning Agent 3.4
**Status:** Draft Analysis

## Executive Summary

This document outlines a 4-phase roadmap for integrating Organising DB and OA Planner, progressing from basic links (complete) to full unification (18-month vision). Each phase includes deliverables, complexity assessment, risk analysis, and rollback plans.

**Total Timeline:** 18 months
**Recommended Pace:** Incremental, value-driven iterations
**Success Criteria:** Measurable improvements at each phase

---

## Phase 1: Basic Links (COMPLETE)

### 1.1 Overview

**Status:** ✅ **COMPLETED** (Stream 2)
**Timeline:** Completed in March 2026
**Complexity:** LOW
**Risk:** MINIMAL

### 1.2 What Was Built

**Core Features:**
1. ✅ ExternalLink component (both apps)
2. ✅ BackButton component (both apps)
3. ✅ Cross-app URL builders
4. ✅ Context passing via query params
5. ✅ Shared authentication (Supabase)
6. ✅ Return URL handling

**Integration Points:**
- Organising DB → OA Planner: Campaign creation links
- OA Planner → Organising DB: Agreement/employer detail links
- Context passing: `campaign_id`, `agreement_id`, `employer_id`

### 1.3 Deliverables

| Deliverable | Status | Location |
|-------------|--------|----------|
| ExternalLink component | ✅ Complete | `apps/{app}/src/components/shared/external-link.tsx` |
| BackButton component | ✅ Complete | `apps/{app}/src/components/shared/back-button.tsx` |
| URL builder utilities | ✅ Complete | `apps/{app}/src/lib/utils/cross-app-links.ts` |
| Environment configuration | ✅ Complete | `.env.example` files |
| Campaign creation links | ✅ Complete | Agreement detail/list pages |
| Return navigation | ✅ Complete | Campaign detail pages |

### 1.4 Problems Solved

✅ Users can navigate between apps
✅ Campaign context preserved across navigation
✅ Shared authentication persists
✅ Return URLs reduce navigation friction

### 1.5 Remaining Limitations

❌ No real-time data sync
❌ Manual status updates required
❌ No shared state management
❌ Separate browser tabs required
❌ No unified dashboards

### 1.6 Success Criteria

✅ **MET:** Users can navigate between apps without re-authentication
✅ **MET:** Campaign context preserved via query parameters
✅ **MET:** Return navigation works correctly
✅ **MET:** Links visible in appropriate UI locations

### 1.7 Metrics

- Cross-app navigation: ~50-100 transitions/day (estimated)
- User adoption: ~80% of organisers using links (estimated)
- Navigation success rate: >95%
- Average navigation time: <2 seconds

---

## Phase 2: Data Sharing (3 Months)

### 2.1 Overview

**Status:** 🔄 **PLANNED**
**Timeline:** Months 1-3 (April - June 2026)
**Complexity:** MEDIUM
**Risk:** LOW-MEDIUM

### 2.2 Objectives

Enable read-only cross-app data access to eliminate manual data re-entry and reduce context switching.

**Key Goals:**
1. Organising DB can read planning status
2. OA Planner can import campaign universe
3. Real-time progress indicators
4. Shared dashboard widgets

### 2.3 Deliverables

#### 2.3.1 Campaign Status Sync (Weeks 1-4)

**Description:** Campaign status syncs from OA Planner to Organising DB

**Implementation:**
```sql
-- Trigger: sync_plan_status_to_campaign
CREATE OR REPLACE FUNCTION sync_plan_status_to_campaign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update campaign status based on plan progression
  UPDATE campaigns
  SET status = CASE
    WHEN NEW.status = 'completed' AND
         NOT EXISTS (
           SELECT 1 FROM campaign_stage_plans
           WHERE campaign_id = (SELECT campaign_id FROM campaign_stage_plans WHERE plan_id = NEW.plan_id)
             AND status NOT IN ('completed', 'blocked')
         ) THEN 'completed'
    WHEN NEW.status = 'active' THEN 'active'
    WHEN NEW.status = 'blocked' THEN 'suspended'
    ELSE status
  END,
  updated_at = NOW()
  WHERE campaign_id = (
    SELECT campaign_id FROM campaign_stage_plans WHERE plan_id = NEW.plan_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stage_plan_status_sync
AFTER UPDATE ON campaign_stage_plans
FOR EACH ROW
EXECUTE FUNCTION sync_plan_status_to_campaign();
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Drop trigger, restore manual status updates

---

#### 2.3.2 Universe → WTP Import (Weeks 5-8)

**Description:** Import campaign universe rules as "Where to Play" selections

**Implementation:**
```sql
-- RPC: import_universe_to_wtp
CREATE OR REPLACE FUNCTION import_universe_to_wtp(
  p_campaign_id INTEGER,
  p_plan_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_imported INTEGER := 0;
BEGIN
  -- Import each universe rule as WTP selection
  FOR v_rule IN
    SELECT cur.*,
           CASE cur.rule_type
             WHEN 'employer' THEN e.employer_name
             WHEN 'worksite' THEN ws.worksite_name
             WHEN 'agreement' THEN a.agreement_name
             WHEN 'sector' THEN s.sector_name
           END AS entity_name
    FROM campaign_universe_rules cur
    LEFT JOIN employers e ON e.employer_id = cur.rule_entity_id AND cur.rule_type = 'employer'
    LEFT JOIN worksites ws ON ws.worksite_id = cur.rule_entity_id AND cur.rule_type = 'worksite'
    LEFT JOIN agreements a ON a.agreement_id = cur.rule_entity_id AND cur.rule_type = 'agreement'
    LEFT JOIN sectors s ON s.sector_id = cur.rule_entity_id AND cur.rule_type = 'sector'
    WHERE cur.universe_id IN (
      SELECT universe_id FROM campaign_universes WHERE campaign_id = p_campaign_id
    )
  LOOP
    INSERT INTO plan_where_to_play (
      plan_id,
      wtp_category_id,
      custom_text,
      is_exclusion,
      priority,
      rationale
    ) VALUES (
      p_plan_id,
      (SELECT category_id FROM wtp_categories WHERE category_name = v_rule.rule_type),
      v_rule.entity_name,
      NOT v_rule.include,
      2,
      'Imported from campaign universe'
    );

    v_imported := v_imported + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'imported', v_imported);
END;
$$;
```

**UI Component:**
```tsx
// apps/oa-planner/src/components/planning/UniverseImportButton.tsx
export function UniverseImportButton({ campaignId, planId }: Props) {
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = async () => {
    const confirmed = await confirm(
      'Import campaign universe as Where to Play selections? ' +
      'This will add selections based on your universe rules.'
    )

    if (!confirmed) return

    setIsImporting(true)
    try {
      const { data } = await supabase.rpc('import_universe_to_wtp', {
        p_campaign_id: campaignId,
        p_plan_id: planId
      })

      toast.success(`Imported ${data?.imported} selections`)
      queryClient.invalidateQueries(['where-to-play', planId])
    } catch (error) {
      toast.error('Failed to import universe')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Button onClick={handleImport} disabled={isImporting}>
      {isImporting ? 'Importing...' : 'Import Universe'}
    </Button>
  )
}
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Delete imported WTP selections, remove RPC function

---

#### 2.3.3 Timeline Auto-Calculation (Weeks 9-10)

**Description:** Auto-calculate campaign timeline from agreement expiry date

**Implementation:**
```sql
-- Trigger: auto_calculate_timeline_from_agreement
CREATE OR REPLACE FUNCTION auto_calculate_timeline_from_agreement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agreement RECORD;
  v_campaign RECORD;
BEGIN
  -- Get agreement details
  SELECT * INTO v_agreement FROM agreements WHERE agreement_id = NEW.agreement_id;

  -- Find campaigns linked to this agreement
  FOR v_campaign IN
    SELECT * FROM campaigns WHERE agreement_id = NEW.agreement_id
  LOOP
    INSERT INTO campaign_timelines (
      campaign_id,
      agreement_id,
      agreement_expiry_date,
      pabo_available_date,
      working_backwards,
      notes
    ) VALUES (
      v_campaign.campaign_id,
      v_agreement.agreement_id,
      v_agreement.expiry_date,
      v_agreement.expiry_date - INTERVAL '30 days',
      v_agreement.expiry_date < CURRENT_DATE + INTERVAL '12 months',
      'Auto-calculated from agreement expiry'
    )
    ON CONFLICT (campaign_id) DO UPDATE SET
      agreement_expiry_date = EXCLUDED.agreement_expiry_date,
      pabo_available_date = EXCLUDED.pabo_available_date,
      working_backwards = EXCLUDED.working_backwards,
      updated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agreement_timeline_sync
AFTER INSERT OR UPDATE OF expiry_date ON agreements
FOR EACH ROW
EXECUTE FUNCTION auto_calculate_timeline_from_agreement();
```

**Complexity:** LOW-MEDIUM
**Risk:** LOW
**Rollback:** Drop trigger, manual timeline entry

---

#### 2.3.4 Ambition Progress Calculation (Weeks 11-12)

**Description:** Auto-calculate ambition progress from Organising DB data

**Implementation:**
```sql
-- Materialized View: ambition_progress
CREATE MATERIALIZED VIEW ambition_progress AS
SELECT
  pa.ambition_id,
  pa.plan_id,
  pa.metric_type,
  pa.target_value,
  -- Calculate current value
  CASE pa.metric_type
    WHEN 'percentage' THEN
      ROUND(AVG(car.rating::numeric), 2)::TEXT
    WHEN 'count' THEN
      COUNT(DISTINCT cwm.worker_id)::TEXT
    WHEN 'boolean' THEN
      CASE WHEN COUNT(*) FILTER (WHERE car.rating >= 4) > 0 THEN 'true' ELSE 'false' END
    ELSE NULL
  END AS current_value,
  NOW() AS last_calculated
FROM plan_ambitions pa
JOIN campaign_stage_plans csp ON csp.plan_id = pa.plan_id
LEFT JOIN campaign_activity_ratings car ON car.campaign_id = csp.campaign_id
LEFT JOIN campaign_worker_membership cwm ON cwm.campaign_id = csp.campaign_id
GROUP BY pa.ambition_id, pa.plan_id, pa.metric_type, pa.target_value;

CREATE UNIQUE INDEX ambition_progress_idx ON ambition_progress(ambition_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_ambition_progress()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ambition_progress;
  RETURN 1;
END;
$$;
```

**Scheduled Refresh:**
```sql
-- Refresh every 5 minutes via pg_cron
SELECT cron.schedule(
  'refresh-ambition-progress',
  '*/5 * * * *',
  $$SELECT refresh_ambition_progress()$$
);
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Drop materialized view, manual progress entry

---

### 2.4 Problems Solved

✅ Campaign status automatically updates from plan progression
✅ Universe rules don't need manual re-entry in planner
✅ Timelines auto-calculate from agreement dates
✅ Ambition progress tracked without manual updates

### 2.5 Complexity Assessment

**Technical Complexity:** MEDIUM
- Database triggers and functions
- Materialized views
- RPC functions
- Scheduled jobs

**Integration Complexity:** LOW-MEDIUM
- No UI unification required
- Minimal cross-app dependencies
- Independent app deployment maintained

**Testing Complexity:** MEDIUM
- Cross-app data flow testing
- Trigger validation
- Performance testing
- Rollback testing

### 2.6 Risk Analysis

**Technical Risks:**
- ⚠️ Trigger performance impact (mitigated by efficient queries)
- ⚠️ Materialized view refresh lag (5 min acceptable)
- ⚠️ Circular trigger dependencies (avoided by careful design)

**User Experience Risks:**
- ⚠️ Unexpected status changes (mitigated by notifications)
- ⚠️ Data inconsistency during sync (acceptable latency)
- ⚠️ Confusion about automatic updates (mitigated by UX)

**Rollback Risks:**
- ✅ LOW: Each feature independently rollbackable
- ✅ LOW: No schema changes required
- ✅ LOW: Apps remain independently deployable

### 2.7 Rollback Plan

**Per-Feature Rollback:**

1. **Status Sync:**
   ```sql
   DROP TRIGGER IF EXISTS trg_stage_plan_status_sync ON campaign_stage_plans;
   DROP FUNCTION IF EXISTS sync_plan_status_to_campaign();
   ```

2. **Universe Import:**
   ```sql
   DELETE FROM plan_where_to_play WHERE rationale LIKE 'Imported from campaign universe%';
   DROP FUNCTION IF EXISTS import_universe_to_wtp(INTEGER, INTEGER);
   ```

3. **Timeline Auto-Calc:**
   ```sql
   DROP TRIGGER IF EXISTS trg_agreement_timeline_sync ON agreements;
   DROP FUNCTION IF EXISTS auto_calculate_timeline_from_agreement();
   ```

4. **Ambition Progress:**
   ```sql
   DROP MATERIALIZED VIEW IF EXISTS ambition_progress;
   DROP FUNCTION IF EXISTS refresh_ambition_progress();
   SELECT cron.unschedule('refresh-ambition-progress');
   ```

**Full Rollback:**
- Execute all per-feature rollbacks
- Verify manual processes still work
- Communicate changes to users
- Monitor for issues

### 2.8 Dependencies

**Internal Dependencies:**
- Phase 1 (links) must be complete
- Campaign creation flow must work
- Universe rules must be defined

**External Dependencies:**
- Supabase cron extension enabled
- Database performance adequate for triggers
- No blocking schema changes

### 2.9 Success Criteria

✅ Campaign status auto-updates within 5 seconds of plan change
✅ Universe import completes within 10 seconds
✅ Timeline auto-calculates within 5 seconds of agreement link
✅ Ambition progress refreshes every 5 minutes
✅ <1% trigger execution errors
✅ <5% performance degradation on affected tables

### 2.10 Timeline

| Week | Deliverable | Status |
|------|-------------|--------|
| 1-2 | Status sync trigger | Planning |
| 3-4 | Status sync testing | Planning |
| 5-6 | Universe import RPC | Planning |
| 7-8 | Universe import UI | Planning |
| 9-10 | Timeline auto-calc | Planning |
| 11-12 | Ambition progress MV | Planning |

---

## Phase 3: UI Integration (3 Months)

### 3.1 Overview

**Status:** 📅 **PLANNED**
**Timeline:** Months 4-6 (July - September 2026)
**Complexity:** HIGH
**Risk:** MEDIUM

### 3.2 Objectives

Implement embedded planner experience for seamless workflow between planning and execution.

**Key Goals:**
1. OA Planner embedded in Organising DB campaign pages
2. Shared campaign context across apps
3. Unified campaign dashboard
4. Cross-app notifications

### 3.3 Deliverables

#### 3.3.1 Embedded Planner (Weeks 1-4)

**Description:** Embed OA Planner as iframe within Organising DB

**Implementation:**
```tsx
// apps/organising-db/src/components/planner/PlannerEmbed.tsx
import { useEffect, useState, useMemo } from 'react'

interface PlannerEmbedProps {
  campaignId: number
  initialView?: 'overview' | 'planning' | 'gates'
}

export function PlannerEmbed({
  campaignId,
  initialView = 'overview'
}: PlannerEmbedProps) {
  const [height, setHeight] = useState(600)
  const [isLoading, setIsLoading] = useState(true)

  // Build iframe URL with context
  const src = useMemo(() => {
    const url = new URL(process.env.NEXT_PUBLIC_OA_PLANNER_URL!)
    url.pathname = `/embed/campaigns/${campaignId}`
    url.searchParams.set('view', initialView)
    url.searchParams.set('origin', window.location.origin)
    return url.toString()
  }, [campaignId, initialView])

  // Handle postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      if (event.origin !== process.env.NEXT_PUBLIC_OA_PLANNER_URL) return

      switch (event.data.type) {
        case 'resize':
          setHeight(event.data.height + 40) // Add padding
          break
        case 'ready':
          setIsLoading(false)
          break
        case 'navigate':
          // Handle navigation requests
          if (event.data.url) {
            window.location.href = event.data.url
          }
          break
        case 'error':
          console.error('Planner error:', event.data.error)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div className="planner-embed-container">
      {isLoading && (
        <div className="planner-loading">
          <EurekaLoadingSpinner />
          <p>Loading strategic plan...</p>
        </div>
      )}
      <iframe
        src={src}
        style={{
          width: '100%',
          height: `${height}px`,
          border: 'none',
          borderRadius: '8px',
          opacity: isLoading ? 0 : 1
        }}
        title="OA Planner"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  )
}
```

**Embedded Route (OA Planner):**
```tsx
// apps/oa-planner/src/app/(app)/embed/campaigns/[id]/page.tsx
import { useAutoResize, useAuthSync } from '@/lib/embed'

export default function EmbeddedCampaignPage({ params }: Props) {
  useAutoResize()
  useAuthSync()

  return (
    <div className="embed-mode">
      <CampaignDetailContent id={params.id} />
    </div>
  )
}

// apps/oa-planner/src/app/embed.css
.embed-mode .app-header,
.embed-mode .sidebar,
.embed-mode .breadcrumbs {
  display: none !important;
}

.embed-mode {
  padding: 1rem;
  background: transparent;
}
```

**Auto-Resize Hook:**
```typescript
// apps/oa-planner/src/lib/embed/useAutoResize.ts
export function useAutoResize() {
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      const height = entries[0].contentRect.height
      window.parent.postMessage({
        type: 'resize',
        height
      }, '*')
    })

    resizeObserver.observe(document.body)

    // Notify ready
    window.parent.postMessage({ type: 'ready' }, '*')

    return () => resizeObserver.disconnect()
  }, [])
}
```

**Auth Sync Hook:**
```typescript
// apps/oa-planner/src/lib/embed/useAuthSync.ts
export function useAuthSync() {
  const { session } = useAuth()

  useEffect(() => {
    if (!session?.access_token) return

    // Sync auth state with parent
    window.parent.postMessage({
      type: 'auth',
      token: session.access_token
    }, '*')
  }, [session])

  // Listen for auth refresh requests
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== process.env.NEXT_PUBLIC_SITE_URL) return
      if (event.data.type === 'auth-refresh') {
        supabase.auth.refreshSession()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])
}
```

**Complexity:** MEDIUM-HIGH
**Risk:** MEDIUM
**Rollback:** Remove embed component, restore deep links

---

#### 3.3.2 Unified Campaign Dashboard (Weeks 5-8)

**Description:** Single dashboard showing both management and planning metrics

**Implementation:**
```tsx
// apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx
export default function UnifiedCampaignPage({ params }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'planning' | 'execution'>('overview')
  const campaignId = parseInt(params.id)

  return (
    <div className="campaign-unified-page">
      <CampaignHeader campaignId={campaignId} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="execution">Execution</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <CampaignOverviewDashboard campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="planning" className="space-y-6">
          <PlannerEmbed campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="execution" className="space-y-6">
          <CampaignExecutionDashboard campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// apps/organising-db/src/components/campaigns/CampaignOverviewDashboard.tsx
export function CampaignOverviewDashboard({ campaignId }: Props) {
  const { data: campaign } = useCampaign(campaignId)
  const { data: workers } = useWorkers(campaignId)
  const { data: plans } = useStagePlans(campaignId)
  const { data: actions } = useActions(campaignId)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <StatsCard
        title="Workers"
        value={workers?.length || 0}
        icon={Users}
        trend={{ value: 12, direction: 'up' }}
      />
      <StatsCard
        title="Active Actions"
        value={actions?.filter(a => a.status === 'pending').length || 0}
        icon={CheckSquare}
      />
      <StatsCard
        title="Planning Stage"
        value={plans?.find(p => p.status === 'active')?.stage_name || '-'}
        icon={Target}
      />
      <ProgressCard
        title="Ambition Progress"
        value={75}
        total={100}
      />
      <GateStatusCard campaignId={campaignId} />
      <TimelineCard campaignId={campaignId} />
    </div>
  )
}
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Remove unified dashboard, restore separate pages

---

#### 3.3.3 Cross-App Notifications (Weeks 9-12)

**Description:** Unified notification system across both apps

**Implementation:**
```sql
-- Notifications table (shared)
CREATE TABLE notifications (
  notification_id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  notification_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;
```

**Notification Hook:**
```typescript
// apps/organising-db/src/lib/hooks/useNotifications.ts
export function useNotifications() {
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('read', false)
        .order('created_at', { ascending: false })
        .limit(20)
      return data
    },
    refetchInterval: 30000 // Poll every 30s
  })

  // Subscribe to new notifications
  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        queryClient.setQueryData(['notifications'], (old: any[]) => [
          payload.new,
          ...old
        ])
      })
      .subscribe()

    return () => channel.unsubscribe()
  }, [])

  return {
    notifications,
    unreadCount: notifications?.length || 0
  }
}
```

**Notification Triggers:**
```sql
-- Gate assessment notification
CREATE OR REPLACE FUNCTION notify_gate_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Find organiser
  INSERT INTO notifications (user_id, notification_type, title, message, link)
  SELECT
    up.user_id,
    'gate_assessment',
    'Gate ' || gd.gate_number || ' ' || NEW.outcome,
    'Campaign "' || c.name || '" gate ' || gd.gate_number || ' has been ' || NEW.outcome,
    '/campaigns/' || c.campaign_id
  FROM campaigns c
  JOIN gate_definitions gd ON gd.campaign_id = c.campaign_id
  JOIN user_profiles up ON up.organiser_id = c.organiser_id
  WHERE gd.gate_id = NEW.gate_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gate_notification
AFTER INSERT OR UPDATE ON gate_assessments
FOR EACH ROW
EXECUTE FUNCTION notify_gate_assessment();
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Disable triggers, remove notification UI

---

### 3.4 Problems Solved

✅ Single-tab campaign management
✅ Seamless planning ↔ execution workflow
✅ Unified campaign oversight
✅ Real-time cross-app notifications

### 3.5 Complexity Assessment

**Technical Complexity:** HIGH
- iframe communication
- Cross-frame state management
- Responsive design challenges
- Authentication bridge

**Integration Complexity:** MEDIUM-HIGH
- Tighter app coupling
- Shared UI components
- Coordinated deployments

**Testing Complexity:** HIGH
- Cross-frame testing
- Responsive breakpoint testing
- Performance testing
- Security testing

### 3.6 Risk Analysis

**Technical Risks:**
- ⚠️ iframe performance issues (mitigated by lazy loading)
- ⚠️ postMessage security (mitigated by origin validation)
- ⚠️ Responsive design complexity (mitigated by adaptive layouts)
- ⚠️ Memory usage (two React instances)

**User Experience Risks:**
- ⚠️ iframe loading delays (mitigated by loading states)
- ⚠️ Mobile usability (responsive fallback)
- ⚠️ Context confusion (mitigated by clear UI)

**Rollback Risks:**
- ⚠️ MEDIUM: Requires UI changes
- ✅ Apps remain independently deployable
- ✅ Data not affected

### 3.7 Rollback Plan

**Embedded Planner:**
```tsx
// Remove embed component, restore deep link
export function CampaignPlanningLink({ campaignId }: Props) {
  return (
    <ExternalLink
      href={`${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/campaigns/${campaignId}`}
      variant="button"
    >
      View Strategic Plan
    </ExternalLink>
  )
}
```

**Unified Dashboard:**
```tsx
// Remove tabs, restore single view
export default function CampaignPage({ params }: Props) {
  return (
    <div className="campaign-page">
      <CampaignHeader campaignId={params.id} />
      <CampaignDetail campaignId={params.id} />
    </div>
  )
}
```

**Notifications:**
```sql
-- Disable notification triggers
DROP TRIGGER IF EXISTS trg_gate_notification ON gate_assessments;
DROP FUNCTION IF EXISTS notify_gate_assessment();

-- Or mark as read
UPDATE notifications SET read = TRUE WHERE created_at < NOW();
```

### 3.8 Dependencies

**Internal Dependencies:**
- Phase 2 (data sharing) must be complete
- Status sync working
- Timeline calculations working

**External Dependencies:**
- iframe support in target browsers
- postMessage API support
- Sufficient browser memory

### 3.9 Success Criteria

✅ iframe loads within 3 seconds
✅ postMessage communication <100ms latency
✅ <5% cross-frame errors
✅ Responsive design works on tablet+ devices
✅ Notifications delivered within 10 seconds
✅ User satisfaction score >4/5

### 3.10 Timeline

| Week | Deliverable | Status |
|------|-------------|--------|
| 1-2 | Iframe container component | Planning |
| 3-4 | postMessage API + auth sync | Planning |
| 5-6 | Unified dashboard UI | Planning |
| 7-8 | Dashboard testing | Planning |
| 9-10 | Notification system | Planning |
| 11-12 | Integration testing | Planning |

---

## Phase 4: Full Unification (12 Months)

### 4.1 Overview

**Status:** 📅 **PLANNED**
**Timeline:** Months 7-18 (October 2026 - March 2028)
**Complexity:** VERY HIGH
**Risk:** HIGH

### 4.2 Objectives

Merge applications into single unified platform with seamless experience.

**Key Goals:**
1. Single codebase
2. Unified navigation
3. Shared state management
4. Consistent design system
5. Optimized performance

### 4.3 Deliverables

#### 4.3.1 Codebase Consolidation (Months 7-10)

**Description:** Merge two codebases into single application

**New Structure:**
```
offshore-alliance/
├── apps/
│   └── offshore-alliance/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/
│       │   │   │   ├── campaigns/
│       │   │   │   │   ├── [id]/
│       │   │   │   │   │   ├── page.tsx
│       │   │   │   │   │   ├── overview/
│       │   │   │   │   │   ├── planning/
│       │   │   │   │   │   └── execution/
│       │   │   │   │   └── new/
│       │   │   │   ├── dashboard/
│       │   │   │   ├── workers/
│       │   │   │   ├── employers/
│       │   │   │   └── reports/
│       │   │   └── (auth)/
│       │   ├── components/
│       │   │   ├── campaigns/ (merged)
│       │   │   ├── planning/ (from OA Planner)
│       │   │   ├── workers/ (from ODB)
│       │   │   └── shared/
│       │   ├── lib/
│       │   │   ├── hooks/ (merged)
│       │   │   ├── api/ (unified)
│       │   │   └── state/ (shared)
│       │   └── styles/
│       └── package.json
```

**Migration Steps:**
1. Audit components from both apps
2. Document feature overlap
3. Design unified architecture
4. Set up new repo structure
5. Migrate shared components
6. Consolidate state management
7. Unify API layer
8. Merge routing
9. Resolve conflicts
10. Test thoroughly

**Complexity:** VERY HIGH
**Risk:** HIGH
**Rollback:** Keep old apps running in parallel

---

#### 4.3.2 State Management Unification (Months 11-12)

**Description:** Single state management system for entire platform

**Implementation:**
```typescript
// Unified state store (Zustand)
interface PlatformStore {
  // Campaign data
  campaigns: Campaign[]
  activeCampaign: Campaign | null

  // Planning data
  stagePlans: StagePlan[]
  ambitions: Ambition[]
  gates: Gate[]

  // Management data
  workers: Worker[]
  actions: Action[]
  ratings: Rating[]

  // UI state
  activeView: 'overview' | 'planning' | 'execution'
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'

  // Actions
  setActiveCampaign: (campaign: Campaign) => void
  setStagePlans: (plans: StagePlan[]) => void
  addWorker: (worker: Worker) => void
  updateAmbition: (id: number, data: Partial<Ambition>) => void
  setActiveView: (view: string) => void
}

export const usePlatformStore = create<PlatformStore>((set, get) => ({
  campaigns: [],
  activeCampaign: null,
  stagePlans: [],
  ambitions: [],
  gates: [],
  workers: [],
  actions: [],
  ratings: [],
  activeView: 'overview',
  sidebarCollapsed: false,
  theme: 'light',

  setActiveCampaign: (campaign) => set({ activeCampaign: campaign }),

  setStagePlans: (stagePlans) => set({ stagePlans }),

  addWorker: (worker) => set((state) => ({
    workers: [...state.workers, worker]
  })),

  updateAmbition: (ambitionId, data) => set((state) => ({
    ambitions: state.ambitions.map((a) =>
      a.ambition_id === ambitionId ? { ...a, ...data } : a
    )
  })),

  setActiveView: (activeView) => set({ activeView }),
}))
```

**Complexity:** HIGH
**Risk:** MEDIUM
**Rollback:** Revert to separate state stores

---

#### 4.3.3 Unified Design System (Months 13-14)

**Description:** Consistent design language across platform

**Components:**
```typescript
// Unified design system
export const Button = {
  variants: {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
    ghost: 'hover:bg-gray-100 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  },
  sizes: {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  }
}

export const Card = {
  base: 'bg-white rounded-lg shadow-md',
  padding: {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }
}

// Consistent color palette
export const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8'
  },
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    700: '#15803d'
  },
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    700: '#b45309'
  },
  danger: {
    50: '#fef2f2',
    500: '#ef4444',
    700: '#b91c1c'
  }
}
```

**Complexity:** MEDIUM
**Risk:** LOW
**Rollback:** Revert to separate styles

---

#### 4.3.4 Performance Optimization (Months 15-16)

**Description:** Optimize unified application for performance

**Strategies:**
1. Code splitting by route
2. Lazy loading components
3. Image optimization
4. Bundle size optimization
5. Caching strategies
6. Database query optimization
7. CDN implementation

**Implementation:**
```typescript
// Route-based code splitting
const CampaignOverview = lazy(() =>
  import('./pages/campaigns/[id]/overview').then(m => ({ default: m.CampaignOverview }))
)

const CampaignPlanning = lazy(() =>
  import('./pages/campaigns/[id]/planning').then(m => ({ default: m.CampaignPlanning }))
)

// Usage
<Suspense fallback={<Loading />}>
  <Routes>
    <Route path="/campaigns/:id" element={<CampaignOverview />} />
    <Route path="/campaigns/:id/planning" element={<CampaignPlanning />} />
  </Routes>
</Suspense>

// Bundle optimization
// next.config.js
module.exports = {
  webpack: (config) => {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /node_modules/,
          name: 'vendors',
          chunks: 'all'
        },
        planning: {
          test: /planning/,
          name: 'planning',
          chunks: 'all'
        },
        management: {
          test: /management/,
          name: 'management',
          chunks: 'all'
        }
      }
    }
    return config
  }
}
```

**Complexity:** HIGH
**Risk:** MEDIUM
**Rollback:** Revert optimization settings

---

#### 4.3.5 Testing & Launch (Months 17-18)

**Description:** Comprehensive testing and gradual rollout

**Testing Plan:**
1. Unit tests (component level)
2. Integration tests (cross-component)
3. E2E tests (user workflows)
4. Performance tests (load, stress)
5. Security tests (vulnerability scanning)
6. Accessibility tests (WCAG compliance)
7. User acceptance testing (UAT)

**Launch Strategy:**
1. Alpha release (internal team)
2. Beta release (select users)
3. Gradual rollout (10% → 50% → 100%)
4. Feature flags for gradual exposure
5. Monitoring and feedback collection
6. Bug fixes and iterations

**Complexity:** HIGH
**Risk:** MEDIUM
**Rollback:** Immediate revert to previous version

---

### 4.4 Problems Solved

✅ Single, seamless user experience
✅ Unified codebase (simpler maintenance)
✅ Shared state management (no sync issues)
✅ Consistent design language
✅ Optimized performance
✅ Reduced development overhead

### 4.5 Complexity Assessment

**Technical Complexity:** VERY HIGH
- Large-scale code migration
- State management unification
- Performance optimization
- Testing at scale

**Integration Complexity:** VERY HIGH
- Complete app merger
- Dependent deployments
- Feature parity maintenance

**Testing Complexity:** VERY HIGH
- Comprehensive test coverage
- Cross-feature integration tests
- Performance and stress testing

### 4.6 Risk Analysis

**Technical Risks:**
- ⚠️ Data migration issues (mitigated by careful planning)
- ⚠️ Feature loss during merger (mitigated by audit)
- ⚠️ Performance degradation (mitigated by optimization)
- ⚠️ Security vulnerabilities (mitigated by testing)

**User Experience Risks:**
- ⚠️ Learning curve for new UI (mitigated by training)
- ⚠️ Feature discovery issues (mitigated by onboarding)
- ⚠️ User resistance to change (mitigated by communication)

**Rollback Risks:**
- ❌ HIGH: Complex rollback requires parallel app maintenance
- ⚠️ MEDIUM: Data synchronization challenges
- ✅ Low risk with gradual rollout strategy

### 4.7 Rollback Plan

**Immediate Rollback:**
1. Switch DNS to old apps
2. Feature flag revert
3. Database connection redirect
4. User communication

**Data Rollback:**
1. Database snapshot before migration
2. Incremental data sync back to old apps
3. Verify data integrity
4. Resume old app operations

**Full Rollback:**
1. Decommission new app
2. Restore old app infrastructure
3. Notify users of reversion
4. Plan improvements for future attempt

### 4.8 Dependencies

**Internal Dependencies:**
- All previous phases complete
- User training materials ready
- Support team trained

**External Dependencies:**
- Infrastructure capacity
- CDN configuration
- Monitoring tools
- Backup systems

### 4.9 Success Criteria

✅ All features from both apps available
✅ Page load time <2 seconds
✅ Time to Interactive <3 seconds
✅ <5% error rate
✅ User satisfaction score >4.5/5
✅ 90% user adoption within 3 months

### 4.10 Timeline

| Month | Deliverable | Status |
|-------|-------------|--------|
| 7-8 | Code audit + architecture | Planning |
| 9-10 | Codebase consolidation | Planning |
| 11-12 | State management unification | Planning |
| 13-14 | Design system implementation | Planning |
| 15-16 | Performance optimization | Planning |
| 17 | Alpha + Beta testing | Planning |
| 18 | Gradual rollout | Planning |

---

## 5. Cross-Phase Considerations

### 5.1 Dependencies Between Phases

```
Phase 1 (Links) ✅ COMPLETE
    ↓
Phase 2 (Data Sharing) ← Requires: Phase 1
    ↓
Phase 3 (UI Integration) ← Requires: Phase 2
    ↓
Phase 4 (Full Unification) ← Requires: Phase 3
```

**Critical Path:**
- Phase 1 must be complete before Phase 2
- Phase 2 data sync required for Phase 3 embedded experience
- Phase 3 validates unified UX before Phase 4 investment

### 5.2 Parallel Work Opportunities

**During Phase 2:**
- Design Phase 3 UI components
- User research on embedded experience
- Performance baseline testing

**During Phase 3:**
- Audit Phase 4 codebase consolidation needs
- Prototype unified state management
- Design system iteration

**During Phase 4:**
- Continuous performance monitoring
- User feedback collection
- Incremental feature additions

### 5.3 Resource Requirements

**Phase 2 (3 months):**
- 1 Full-stack developer
- 0.5 DBA
- 0.5 QA engineer

**Phase 3 (3 months):**
- 2 Full-stack developers
- 1 UI/UX designer
- 1 QA engineer

**Phase 4 (12 months):**
- 3 Full-stack developers
- 1 UI/UX designer
- 1 DevOps engineer
- 1 QA engineer
- 1 Product manager

### 5.4 Budget Estimates

**Phase 2:** $30,000 - $50,000
**Phase 3:** $60,000 - $80,000
**Phase 4:** $200,000 - $300,000
**Total:** $290,000 - $430,000

---

## 6. Risk Management

### 6.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Performance degradation | HIGH | MEDIUM | Performance testing, optimization |
| Data loss | CRITICAL | LOW | Backups, incremental migration |
| Security vulnerabilities | HIGH | MEDIUM | Security audits, penetration testing |
| Breaking changes | HIGH | MEDIUM | Feature flags, gradual rollout |
| Integration bugs | MEDIUM | HIGH | Comprehensive testing |

### 6.2 User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| User resistance | MEDIUM | HIGH | Communication, training |
| Feature loss | HIGH | LOW | Feature audit, parity testing |
| Learning curve | MEDIUM | HIGH | Onboarding, documentation |
| Workflow disruption | MEDIUM | MEDIUM | Gradual rollout, feedback |

### 6.3 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Timeline overruns | MEDIUM | MEDIUM | Phased approach, buffers |
| Budget overruns | MEDIUM | MEDIUM | Incremental funding, scope control |
| Resource constraints | HIGH | MEDIUM | Team scaling, contractor support |
| Stakeholder alignment | HIGH | LOW | Regular communication, demos |

---

## 7. Success Metrics

### 7.1 Phase 2 Metrics

**Data Sharing:**
- Status sync: <5 second latency
- Universe import: >90% usage
- Timeline auto-calc: 100% campaigns
- Ambition progress: Real-time updates

**User Experience:**
- Reduced manual data entry: >50%
- Fewer tab switches: >30%
- Improved data accuracy: >25%

### 7.2 Phase 3 Metrics

**UI Integration:**
- iframe load time: <3 seconds
- Cross-frame latency: <100ms
- Mobile usability: >80% satisfaction
- Notification delivery: >95%

**User Experience:**
- Single-tab workflow: >70% usage
- Reduced navigation time: >40%
- Improved task completion: >35%

### 7.3 Phase 4 Metrics

**Full Unification:**
- Page load time: <2 seconds
- Time to Interactive: <3 seconds
- Error rate: <5%
- Feature parity: 100%

**User Experience:**
- User satisfaction: >4.5/5
- Adoption rate: >90%
- Support tickets: <10% increase
- Retention rate: >95%

---

## 8. Recommendations

### 8.1 Immediate Actions (Next 30 Days)

1. **Validate Phase 2 Scope**
   - Confirm data sync priorities
   - Identify edge cases
   - Design trigger logic

2. **Set Up Monitoring**
   - Performance baseline
   - Error tracking
   - User analytics

3. **Stakeholder Alignment**
   - Review phased plan
   - Confirm resource allocation
   - Approve budget for Phase 2

### 8.2 Short-Term Actions (Months 1-3)

1. **Execute Phase 2**
   - Implement data sharing features
   - Test thoroughly
   - Gather user feedback

2. **Prepare for Phase 3**
   - Design embedded experience
   - Prototype iframe components
   - User research

3. **Monitor Progress**
   - Track metrics
   - Adjust plan as needed
   - Communicate status

### 8.3 Long-Term Actions (Months 4-18)

1. **Execute Phases 3-4**
   - Follow roadmap
   - Maintain flexibility
   - Iterate based on feedback

2. **Continuous Improvement**
   - Collect user feedback
   - Optimize performance
   - Add features incrementally

3. **Strategic Planning**
   - Evaluate success criteria
   - Plan next iterations
   - Scale to other platforms

---

## 9. Conclusion

This phased implementation plan provides a structured, risk-managed approach to integrating Organising DB and OA Planner. By progressing incrementally from basic links to full unification, we can:

1. **Deliver value early** - Each phase provides user benefits
2. **Manage risk** - Incremental changes with clear rollback plans
3. **Validate approach** - User feedback guides evolution
4. **Maintain flexibility** - Adapt based on learnings
5. **Ensure quality** - Thorough testing at each phase

**Recommended Path Forward:**
- ✅ **Phase 1:** Complete (Stream 2)
- 🔄 **Phase 2:** Begin immediately (3 months)
- 📅 **Phase 3:** Plan for Q3 2026 (3 months)
- 📅 **Phase 4:** Evaluate based on Phase 2-3 results (12 months)

**Key Success Factors:**
- Stakeholder alignment on phased approach
- Adequate resource allocation
- Comprehensive testing at each phase
- Clear communication with users
- Flexibility to adapt based on feedback

---

**Next Steps:**
1. Stakeholder review and approval
2. Resource confirmation for Phase 2
3. Detailed technical planning
4. Begin Phase 2 implementation
