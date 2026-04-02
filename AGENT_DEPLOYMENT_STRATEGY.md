# Agent Deployment Strategy — Final

> **Created:** 2026-04-02
> **Status:** **READY FOR EXECUTION**
> **Approach:** Streams 1 & 2 begin immediately; Stream 3 planning phases proceed stepwise

---

## Deployment Overview

**Total Agents:** 19-22 agents across 3 streams
**Duration:** 8-9 weeks
**Parallelization:** Streams 1 & 3 run in parallel; Stream 2 follows Stream 1 foundation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXECUTION TIMELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Week 1-2  │ Stream 1: Foundation (4 agents) │ Stream 3: Planning begins (2)│
│ Week 3-4  │ Stream 1: Core Features (3 agents) │ Stream 3: Continues (2)   │
│ Week 5-6  │ Stream 1: Advanced (3 agents)   │ Stream 3: Completes         │
│ Week 7-8  │ Stream 2: Organising DB (3 agents) │ Review & Plan           │
│ Week 9    │ Review, Assessment, Next Phase Planning                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stream 1: Immediate Execution (Weeks 1-6)

### Week 1-2: Foundation Phase

#### Agent 1.1: RLS Simplification & Permission System
**Type:** Backend/Database Specialist
**Duration:** 1 week

**Tasks:**
1. Simplify RLS policies to universal read, restricted write
2. Remove `is_assigned_to_campaign()` function (no longer needed)
3. Create permission system tables:
   ```sql
   CREATE TABLE campaign_edit_permissions (
     permission_id SERIAL PRIMARY KEY,
     campaign_id INTEGER REFERENCES campaigns(campaign_id),
     granted_by UUID REFERENCES auth.users(id),
     granted_to UUID REFERENCES auth.users(id),
     granted_at TIMESTAMPTZ DEFAULT NOW(),
     is_persistent BOOLEAN DEFAULT TRUE,
     reason TEXT
   );
   ```
4. Update RLS policies to check `campaign_edit_permissions`
5. Create RPC function `request_campaign_edit_permission()`
6. Create RPC function `grant_campaign_edit_permission()`

**Deliverables:**
- Migration file for permission tables
- Updated RLS policies
- RPC functions for permission workflow
- Test queries verifying universal read, restricted write

**User Decision Incorporated:**
- Persistent approvals (not one-time)
- Leads/coordinators can approve on behalf of owner

---

#### Agent 1.2: Cron Snapshot Route Fix
**Type:** Backend Developer
**Duration:** 2 days

**Tasks:**
1. Update `/api/snapshots` GET handler to use `createServiceClient()`
2. Add error logging for snapshot failures
3. Add success/failure logging

**Deliverables:**
- Updated API route
- Monitoring hook for snapshot status

---

#### Agent 1.3: Sentry Integration
**Type:** DevOps/Backend Developer
**Duration:** 2 days

**Tasks:**
1. Install `@sentry/nextjs`
2. Configure Sentry client for both apps
3. Add error filtering to ignore expected errors
4. Configure environment-specific sampling (100% in dev, appropriate rate in prod)

**Deliverables:**
- Sentry configured in both apps
- Error filtering rules
- Documentation for accessing Sentry dashboard

**User Input Required:**
- Sentry DSN and auth token

---

#### Agent 1.4: Import Log Retention Job
**Type:** Backend Developer
**Duration:** 3 days

**Tasks:**
1. Create Supabase Edge Function or scheduled job:
   - Move logs >90 days to cold storage (separate table or export)
   - Delete logs >1 year
2. Add `archived_at` and `deleted_at` timestamps to `import_logs`
3. Create admin function to manually trigger retention job
4. Add log retention status to admin dashboard

**Deliverables:**
- Retention job with scheduling
- Archive table or export mechanism
- Manual trigger function
- Admin status indicator

---

### Week 3-4: Core Features Phase

#### Agent 1.5: Real-Time Gate Criteria
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create Supabase function `refresh_gate_criteria_current_value(criterion_id)`
2. Add triggers on relevant tables (`workers`, `worker_agreements`, etc.)
3. Implement criteria-to-query mapping:
   - Membership Density → count workers with agreements / total workers
   - Contact Details Verified → count workers with phone + email
   - Active WOCs → (placeholder for future WOC model)
4. Update gate assessment UI to show "Refresh" button
5. Add `last_updated` timestamp to criteria display

**Deliverables:**
- Supabase functions for each criterion type
- Trigger setup for auto-refresh
- UI refresh button with loading state
- Last updated display

**User Decision Incorporated:**
- Real-time preferred, cached with refresh trigger acceptable
- Implement real-time with trigger-based cache invalidation

---

#### Agent 1.6: Expiry Warning System
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create expiry warning utility:
   - Greenfields: exclude from warnings
   - 12+ months: no/minimal indicator
   - 6-12 months: info badge
   - <6 months: warning badge
2. Add warning components to:
   - Agreements list page
   - Agreement detail page
   - Dashboard overview
3. Create "Expiring Soon" filter/view
4. Add warning count to admin dashboard

**Deliverables:**
- Expiry warning utility function
- Badge components (3 levels)
- Warning indicators on all agreement pages
- Filter for expiring agreements
- Admin dashboard metric

**User Decision Incorporated:**
- 12 months low-level, 6 months prominent
- Greenfields excluded (no expiry date)

---

#### Agent 1.7: Dual Pagination Strategy
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create cursor-based pagination component:
   - For datasets 250-1000 rows
   - Next/Previous navigation
   - Page indicator
2. Create virtual scroll component:
   - For datasets >1000 rows
   - Use `react-window` or similar
3. Create smart switching logic:
   - <250 rows: show all (no pagination)
   - 250-1000 rows: cursor pagination
   - >1000 rows: virtual scroll
4. Apply to all list views:
   - Workers, Employers, Worksites, Agreements, Campaigns

**Deliverables:**
- Cursor pagination component
- Virtual scroll component
- Smart switching hook
- Updated all list views

**User Decision Incorporated:**
- Dual approach with thresholds at 250 and 1000 rows

---

### Week 5-6: Advanced Features Phase

#### Agent 1.8: Permission Request UI
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create permission request modal:
   - Triggered when user attempts to edit without permission
   - Shows who owns/leads the campaign
   - Textarea for reason
   - Submit request button
2. Create permission approval UI (for leads/coordinators):
   - List pending requests
   - Approve/Deny buttons
   - Reason field for denials
   - Bulk approve capability
3. Add notification system:
   - Email notification to owner + lead/coordinator
   - In-app notification badge
4. Add permissions management UI:
   - View current permissions
   - Revoke permissions

**Deliverables:**
- Request modal component
- Approval UI (admin/coordinator view)
- Notification system (email + in-app)
- Permissions management page
- Email template for requests

**User Decisions Incorporated:**
- Persistent approvals (not one-time)
- Leads/coordinators can approve on behalf of owner

---

#### Agent 1.9: Admin-Configurable Rate Limiting
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create rate limit configuration tables:
   ```sql
   CREATE TABLE user_rate_limits (
     user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
     requests_per_minute INT,
     requests_per_hour INT,
     requests_per_day INT,
     configured_by UUID REFERENCES auth.users(id),
     configured_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
2. Create admin UI for rate limiting:
   - User search
   - Set rate limits per user
   - View current limits
   - Usage indicator
3. Implement rate limiting middleware:
   - Check `user_rate_limits` table
   - No default limits (only what admin sets)
   - Redis or in-memory counter
4. Add rate limit status to user profile

**Deliverables:**
- Rate limit table and migration
- Admin configuration UI
- Rate limiting middleware
- User profile rate limit display
- Documentation for setting limits

**User Decisions Incorporated:**
- Admin-configurable per individual
- No default limits
- Function for admins to set limits through admin page

---

#### Agent 1.10: AI Caching Infrastructure
**Type:** Backend Developer
**Duration:** 1 week

**Tasks:**
1. Create AI response cache table:
   ```sql
   CREATE TABLE ai_response_cache (
     cache_id SERIAL PRIMARY KEY,
     request_hash VARCHAR(64) UNIQUE,
     endpoint VARCHAR NOT NULL,
     request_payload JSONB,
     response_text TEXT,
     response_metadata JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     last_used_at TIMESTAMPTZ DEFAULT NOW(),
     use_count INT DEFAULT 0,
     is_approved BOOLEAN DEFAULT FALSE
   );
   ```
2. Create cache lookup function (currently bypassed)
3. Create cache management UI:
   - View cached responses
   - Approve responses for reuse
   - Delete invalid responses
   - View cache statistics
4. Add cache hit/miss logging (for future use)

**Deliverables:**
- Cache table and indexes
- Lookup function (disabled)
- Cache management admin UI
- Cache statistics dashboard
- Documentation for future enablement

**User Decision Incorporated:**
- Build caching framework for future
- Continue using Claude directly (no caching yet)

---

#### Agent 1.11: Admin Monitoring Dashboard
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Create new admin tab: "System Monitoring"
2. Implement metrics collection:
   - Supabase connection status (ping)
   - Error count by type (from Sentry)
   - Query performance times (slow query log)
   - Page loading times (navigation timing API)
   - Active user count
3. Create dashboard components:
   - Status cards (green/red/yellow)
   - Error chart (last 7 days)
   - Slow query table
   - Page load time chart
   - Active user list
4. Add refresh capability (manual + auto-refresh toggle)

**Deliverables:**
- Admin monitoring tab
- Status cards for all systems
- Error chart from Sentry API
- Slow query table and analysis
- Page load metrics
- Active user monitoring
- Refresh controls

**User Decision Incorporated:**
- Custom dashboards in admin section during dev
- Metrics: Supabase connection, errors, query performance, page load times

---

#### Agent 1.12: Worker-Campaign Connection Model
**Type:** Backend + Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. Update worker profile to emphasize campaign connections:
   - Primary campaign assignment
   - Campaign roles/activities
   - Activity ratings per campaign
2. Add worker activity tracking:
   - Actions taken per campaign
   - Engagement score per campaign
   - Notes/observations
3. Support service employer use case:
   - Job title as primary identifier
   - Worksites as secondary
   - Campaign-specific workplace assignment
4. Update worker import to support campaign linking
5. Create worker-campaign detail view

**Deliverables:**
- Updated worker profile with campaign focus
- Activity tracking tables/queries
- Service employer support (job title focus)
- Import workflow updates
- Worker-campaign detail UI

**User Decisions Incorporated:**
- Focus on worker-campaign connections
- Track activity and ratings
- Support service employers (job_title more relevant)
- Campaigns may span multiple employers/worksites or be subset

---

## Stream 2: Organising DB Features (Weeks 7-8)

### Agent 2.1: Organiser Workload Dashboard
**Type:** Full-Stack Developer
**Duration:** 2 weeks

**Tasks:**
1. Create dashboard as **central element** of Organising DB landing page
2. Implement key metrics (user-defined):
   - **Campaigns by stage** — Visual breakdown of campaigns in each stage
   - **Progress towards ambitions** — For each active campaign stage, show ambition completion percentage
   - **Worksites/Employers/Workers per campaign** — Counts for each campaign and stage
   - **Campaign activities underway** — Derived from:
     - `campaign_actions` with status='in_progress'
     - `gate_assessments` with outcome='pending'
     - `campaign_stage_plans` with status='active'
3. Add drill-down capability:
   - Click metric → filtered list
   - Click campaign → campaign detail
4. Add filtering:
   - By organiser (me/my team)
   - By status
   - By time period
5. Add visual indicators:
   - Overdue items (red)
   - Due soon (amber)
   - On track (green)

**Deliverables:**
- Dashboard on Organising DB landing page
- Campaign stage breakdown component
- Ambition progress component
- Entity counts (worksites/employers/workers)
- Activities underway component
- Drill-down navigation
- Filter controls
- Visual status indicators

**User Decisions Incorporated:**
- Lives in Organising DB
- Central element of dashboard landing page
- Specific metrics as defined above

---

#### Agent 2.2: Cross-App Deep Links
**Type:** Full-Stack Developer
**Duration:** 1 week

**Tasks:**
1. **Organising DB → OA Planner:**
   - Add "Create Campaign Plan" button on agreement detail page
   - Add "View Campaign Plan" button if campaign exists
   - Pass context: agreement_id, employer_id, worksite_ids
2. **OA Planner → Organising DB:**
   - Add links to agreement detail from campaign pages
   - Add links to employer detail from campaign pages
   - Add links to worksite detail from campaign pages
3. Handle external link styling:
   - Visual indicator for external app links
   - Open in new tab vs same tab (configurable)
4. Preserve context where possible:
   - Return URL in query params
   - "Back to [App]" buttons

**Deliverables:**
- "Create Campaign Plan" button (with context passing)
- "View Campaign Plan" button
- Agreement/employer/worksite links from OA Planner
- External link styling
- Context preservation (return URLs)
- Navigation testing between apps

---

#### Agent 2.3: Campaign Status Badges
**Type:** Full-Stack Developer
**Duration:** 3 days

**Tasks:**
1. Create badge component with states:
   - "No campaign plan" (grey)
   - "Stage X: [Stage Name]" (blue)
   - "Campaign complete" (green)
   - "Planning blocked" (amber)
2. Add to agreement list page (new column)
3. Add to agreement detail page (prominent)
4. Create query to join:
   - `agreements` → `campaign_timelines` → `campaigns` → `campaign_stage_plans`
5. Add click-to-navigate functionality

**Deliverables:**
- Badge component with 4 states
- Agreement list column
- Agreement detail page placement
- Join query for status
- Click navigation to OA Planner

---

## Stream 3: Planning Phases (Parallel with Streams 1 & 2)

### Planning Agent 3.1: Projects, Programs & Hierarchies Analysis
**Type:** Database Architect + Business Analyst
**Duration:** 1 week
**Start:** Week 2 (after foundation complete)

**Scope:**
1. Map current entity relationships:
   - Entity relationship diagram
   - Current data flow documentation
   - Gap analysis (empty tables, missing links)
2. Analyze overlaps and confusion points:
   - Projects vs Programs vs Campaign Universes
   - Worksite hierarchy vs Employer hierarchy
   - Agreement scope vs Campaign scope
3. Interview domain expert (you) for requirements
4. Recommend data model:
   - Clear separation of concerns
   - Proposed schema changes
   - Migration path
5. Document UI/UX implications

**Deliverables:**
- Entity relationship diagram (visual)
- Current state analysis document
- Overlap/confusion analysis
- Recommended data model (3 options with pros/cons)
- Migration plan for recommended option
- UI/UX impact analysis

**Weekly Checkpoint:** Review findings, validate understanding

---

### Planning Agent 3.2: Worksite Hierarchy Analysis
**Type:** Database Architect + Industry Domain Specialist
**Duration:** 1 week
**Start:** Week 2 (in parallel with 3.1)

**Scope:**
1. Current state assessment:
   - Which worksites should have parent/child relationships?
   - Current data in `parent_worksite_id` (all null)
   - Industry context for offshore facility hierarchies
2. Hierarchical modeling options:
   - Geographic hierarchy (basin → field → facility)
   - Operational hierarchy (hub → spoke)
   - Organizational hierarchy (owner → operator → contractor)
3. Data gaps identification:
   - What's missing to implement hierarchy?
   - Reference data requirements
4. Implementation recommendations:
   - Phased approach
   - Data migration steps
   - UI considerations

**Deliverables:**
- Current worksite hierarchy analysis
- Industry context document
- Hierarchy model recommendations
- Data gap analysis
- Phased implementation plan
- Reference data requirements

**Weekly Checkpoint:** Review hierarchy model, validate against offshore industry reality

---

### Planning Agent 3.3: Application Architecture Analysis
**Type:** Solutions Architect + DevOps Engineer
**Duration:** 1 week
**Start:** Week 3 (after some execution context)

**Evaluation Criteria (User-Defined):**
- Performance
- Resource requirements (hosting costs)
- User Experience (UX)
- Data management
- Ongoing development and maintenance
- Robustness and reliability
- Repository complexity

**Options to Evaluate:**
1. Separate apps with deep links (current state)
2. Separate apps with shared navigation shell
3. Single merged app with route prefixes
4. Microservices architecture

**Scope:**
1. For each option, evaluate against all criteria
2. Cost analysis (development, hosting, maintenance)
3. Risk assessment for each approach
4. Migration complexity from current state
5. Recommendation with justification

**Deliverables:**
- Detailed pros/cons matrix (options × criteria)
- Cost comparison (development + hosting + maintenance)
- Risk assessment per option
- Migration complexity analysis
- Recommended option with rationale
- High-level migration plan (if recommended ≠ current)

**Weekly Checkpoint:** Review matrix, clarify trade-offs

---

### Planning Agent 3.4: Campaign Planning Integration
**Type:** Full-Stack Architect + Product Owner
**Duration:** 1 week
**Start:** Week 3 (in parallel with 3.3)

**Scope:**
1. Map integration points:
   - `campaigns` (Organising DB) ↔ `campaign_stage_plans` (OA Planner)
   - `campaign_actions` ↔ Stage planning
   - `campaign_universes` ↔ "Where to Play" selections
   - `campaign_timelines` ↔ Agreement expiry
2. Data flow design:
   - Real-time sync vs periodic sync
   - Shared tables vs API integration
   - Conflict resolution (edits in both apps)
3. UI integration approach:
   - Embedded planner in Organising DB?
   - Linked/separate?
   - Unified campaign timeline?
4. Implementation phases:
   - Phase 1: Basic links (Stream 2 work)
   - Phase 2: Data sharing
   - Phase 3: UI integration
   - Phase 4: Full unification (if desired)

**Deliverables:**
- Data flow diagram (current + future)
- Integration options (3 approaches)
- Recommended phased integration plan
- Data model changes required
- UI/UX mockups for key integration points
- Risk analysis for each phase

**Weekly Checkpoint:** Review integration vision, validate phases

---

## Execution Order

```
Week 1:
├── Agent 1.1: RLS & Permissions (START)
├── Agent 1.2: Cron Fix (START)
├── Agent 1.3: Sentry (START)
└── Agent 1.4: Log Retention (START)

Week 2:
├── Agent 1.1: RLS & Permissions (COMPLETE)
├── Agent 1.2: Cron Fix (COMPLETE)
├── Agent 1.3: Sentry (COMPLETE)
├── Agent 1.4: Log Retention (COMPLETE)
├── Agent 1.5: Gate Criteria (START)
├── Agent 1.6: Expiry Warnings (START)
├── Planning Agent 3.1: Hierarchy Analysis (START)
└── Planning Agent 3.2: Worksite Hierarchy (START)

Week 3:
├── Agent 1.5: Gate Criteria (COMPLETE)
├── Agent 1.6: Expiry Warnings (COMPLETE)
├── Agent 1.7: Pagination (START)
├── Agent 1.11: Admin Dashboard (START)
├── Planning Agent 3.1: Hierarchy Analysis (COMPLETE) → CHECKPOINT
├── Planning Agent 3.2: Worksite Hierarchy (COMPLETE) → CHECKPOINT
├── Planning Agent 3.3: App Architecture (START)
└── Planning Agent 3.4: Campaign Integration (START)

Week 4:
├── Agent 1.7: Pagination (COMPLETE)
├── Agent 1.11: Admin Dashboard (COMPLETE)
├── Agent 1.8: Permission UI (START)
├── Agent 1.9: Rate Limiting (START)
├── Planning Agent 3.3: App Architecture (COMPLETE) → CHECKPOINT
└── Planning Agent 3.4: Campaign Integration (COMPLETE) → CHECKPOINT

Week 5:
├── Agent 1.8: Permission UI (COMPLETE)
├── Agent 1.9: Rate Limiting (COMPLETE)
├── Agent 1.10: AI Caching (START)
├── Agent 1.12: Worker-Campaign (START)
└── STREAM 3 REVIEW: All planning outputs

Week 6:
├── Agent 1.10: AI Caching (COMPLETE)
├── Agent 1.12: Worker-Campaign (COMPLETE)
└── STREAM 1 REVIEW: All immediate work complete

Week 7:
├── Agent 2.1: Workload Dashboard (START)
├── Agent 2.2: Deep Links (START)
└── Agent 2.3: Status Badges (START)

Week 8:
├── Agent 2.1: Workload Dashboard (COMPLETE)
├── Agent 2.2: Deep Links (COMPLETE)
├── Agent 2.3: Status Badges (COMPLETE)
└── STREAM 2 REVIEW: All Organising DB features complete

Week 9:
└── FINAL REVIEW: All streams complete, plan next phases based on Stream 3 outcomes
```

---

## Pre-Execution Checklist

Before agents begin:

### User to Provide:
- [ ] Sentry DSN and auth token
- [ ] Confirmation that this plan is approved
- [ ] Availability for weekly checkpoints (Stream 3)

### Technical:
- [ ] Staging environment verified
- [ ] Backup procedures confirmed
- [ ] Database snapshot taken before migrations

### Agents:
- [ ] Agent assignments confirmed (or user will execute directly)
- [ ] Communication channels established

---

## Success Criteria

### Stream 1 Complete When:
- [ ] All users can read all campaigns
- [ ] Write access restricted to owner + those with persistent permission
- [ ] Leads/coordinators can grant permissions on behalf of owner
- [ ] Cron snapshots run successfully
- [ ] Sentry capturing errors
- [ ] Import logs auto-archived per 90-day/1-year policy
- [ ] Gate criteria show real-time data
- [ ] Expiry warnings: 12mo (low), 6mo (prominent), greenfields excluded
- [ ] Pagination switches based on dataset size
- [ ] Admin can set per-user rate limits
- [ ] AI cache infrastructure ready (not enabled)
- [ ] Admin monitoring dashboard functional
- [ ] Workers connect to campaigns with activity tracking

### Stream 2 Complete When:
- [ ] Workload dashboard central on Organising DB landing page
- [ ] Dashboard shows: campaigns by stage, ambition progress, entity counts, activities
- [ ] Deep links functional between apps
- [ ] Campaign status badges on agreement pages

### Stream 3 Complete When:
- [ ] Projects/programs/hierarchies analyzed with recommendation
- [ ] Worksite hierarchy analyzed with implementation plan
- [ ] App architecture pros/cons documented with recommendation
- [ ] Campaign integration planned with phases

---

## Ready to Execute

This deployment strategy is ready to begin. Suggested starting point:

**Week 1, Day 1:** Begin Agent 1.1 (RLS & Permissions) — this is the foundation that enables much of the permission workflow throughout the system.

**Parallel:** Agents 1.2, 1.3, 1.4 can start Day 1 as well (independent work).

Would you like me to begin execution with Agent 1.1, or would you prefer to review any specific agent's tasks first?
