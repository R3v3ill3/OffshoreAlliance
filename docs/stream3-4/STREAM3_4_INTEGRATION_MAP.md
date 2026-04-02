# Stream 3-4: Campaign Planning Integration Map

**Document Version:** 1.0
**Date:** 2026-04-02
**Author:** Planning Agent 3.4
**Status:** Draft Analysis

## Executive Summary

This document maps ALL integration points between Organising DB (campaign management) and OA Planner (strategic planning). The current state (Stream 2) provides basic deep links, but significant integration opportunities exist for data flow, UI unification, and workflow enhancement.

**Current State:** Separate applications with deep-link navigation
**Desired State:** Seamlessly integrated campaign planning and management ecosystem

---

## 1. Application Overview

### 1.1 Organising DB (Campaign Management)
**Purpose:** Track workers, employers, worksites, agreements, and campaign execution

**Core Responsibilities:**
- Worker/member database and engagement tracking
- Employer and worksite directories
- Enterprise bargaining agreement (EBA) management
- Campaign universe definition and action tracking
- Communications and task management
- Reporting and analytics

**Key Tables:**
- `campaigns` - Campaign records
- `campaign_universes` - Organising target definitions
- `campaign_actions` - Action tracking
- `campaign_activities` - Activity templates
- `campaign_organising_units` - Shift/department/network organization
- `campaign_worker_membership` - Worker-to-campaign assignment
- `campaign_task_lists` - Leader task management
- `workers` - Member database
- `employers` - Company directory
- `worksites` - Location database
- `agreements` - EBA tracking

**URL:** `https://oa.uconstruct.app`

### 1.2 OA Planner (Strategic Planning)
**Purpose:** Implement "Playing to Win" methodology across 6-stage campaign model

**Core Responsibilities:**
- Strategic planning using 5-step framework
- Stage-by-stage campaign planning
- Gate assessment and progression
- Timeline management (PABO, expiry-driven)
- Capacity and resource planning
- AI-assisted theory of winning

**Key Tables:**
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

**URL:** `https://oaplanner.uconstruct.app`

---

## 2. Current Integration State (Stream 2)

### 2.1 Implemented Features
✅ **Deep Link Navigation** (Complete)
- ExternalLink component in both apps
- BackButton with return URL handling
- Context passing via query parameters
- Shared Supabase authentication

### 2.2 Current Data Connections

**campaigns table (SHARED)**
```sql
campaigns
├── campaign_id (PK)
├── agreement_id → agreements.agreement_id
├── employer_id → employers.employer_id
├── name, description, status
├── start_date, end_date
├── organiser_id → organisers.organiser_id
└── (OA Planner extensions via FK)
    ├── campaign_stage_plans (ONE campaign_id → MANY plans)
    ├── campaign_timelines (ONE campaign_id → ONE timeline)
    └── gate_definitions (ONE campaign_id → MANY gates)
```

**Current Cross-App Links:**
1. **Organising DB → OA Planner:**
   - Agreement detail page → Create/View Campaign Plan
   - Agreement list → Campaign Plan links
   - Passes: `agreement_id`, `employer_id`

2. **OA Planner → Organising DB:**
   - Campaign detail → View Agreement Details
   - Campaign detail → View Employer Details
   - Opens in new tabs

### 2.3 Missing Connections
❌ No real-time data sync
❌ No shared state management
❌ No unified campaign dashboard
❌ No cross-app reporting
❌ No bidirectional workflow triggers

---

## 3. Comprehensive Integration Points Map

### 3.1 Organising DB → OA Planner Data Flow

#### A. Campaign Foundation Data
**Source:** `campaigns` table
**Target:** `campaign_stage_plans`, `campaign_timelines`

**Data Elements:**
```sql
campaigns
├── name → campaign_stage_plans (display context)
├── description → campaign_stage_plans (context)
├── agreement_id → campaign_timelines.agreement_id
├── start_date → campaign_timelines (anchor date)
├── end_date → campaign_timelines (target date)
├── organiser_id → plan_capacities.assigned_to
└── campaign_type → plan_ambitions (customization)
```

**Current State:** Manual link creation
**Desired State:** Auto-populate on campaign creation
**Priority:** HIGH

---

#### B. Campaign Scope Definition
**Source:** `campaign_universes`, `campaign_universe_rules`
**Target:** `plan_where_to_play`

**Data Elements:**
```sql
campaign_universes
├── universe_id
├── name → "Where to Play" categories
└── description

campaign_universe_rules
├── rule_type ('agreement', 'worksite', 'employer', 'sector')
├── rule_entity_id → pre-populate WTP options
└── include → auto-select/deselect
```

**Integration Logic:**
- Universe rules should inform "Where to Play" selections
- Employer rules → Employer focus areas
- Worksite rules → Geographic focus
- Sector rules → Industry segments

**Current State:** Manual re-entry
**Desired State:** Import universe rules as WTP baseline
**Priority:** HIGH

---

#### C. Organising Unit Structure
**Source:** `campaign_organising_units`, `campaign_worker_ou`
**Target:** `plan_where_to_play`, `plan_capacities`

**Data Elements:**
```sql
campaign_organising_units
├── ou_type ('shift', 'department', 'network', 'worksite')
├── name → WTP custom categories
├── total_workers_estimated → capacity planning
└── anchor_worker_id → identify leaders
```

**Integration Logic:**
- OUs become "Where to Play" focus categories
- Worker counts inform capacity requirements
- Anchor workers identify delegated capacities

**Current State:** Independent management
**Desired State:** Sync OU structure to WTP categories
**Priority:** MEDIUM

---

#### D. Campaign Activities & Actions
**Source:** `campaign_activities`, `campaign_actions`
**Target:** `plan_ambitions`, `plan_management_systems`

**Data Elements:**
```sql
campaign_activities
├── activity_kind ('task', 'assessment')
├── title → ambition template options
├── is_binary → ambition metric type
└── supporter_outcome_value → ambition targets

campaign_actions
├── action_type → management system triggers
├── due_date → timeline constraints
└── assigned_organiser_id → responsibility assignment
```

**Integration Logic:**
- Activities can generate ambition templates
- Actions create management system checkpoints
- Due dates inform stage timelines

**Current State:** No connection
**Desired State:** Activities inform planning baselines
**Priority:** MEDIUM

---

#### E. Worker Engagement Data
**Source:** `campaign_worker_membership`, `campaign_activity_ratings`
**Target:** `plan_ambitions`, `gate_criteria`

**Data Elements:**
```sql
campaign_worker_membership
├── worker_id
├── oa_leader_role ('delegate', 'activist', 'contact')
└── (JOIN with workers) → engagement_level

campaign_activity_ratings
├── rating (1-5) → current achievement
└── rated_at → trend data
```

**Integration Logic:**
- Leader counts inform capacity ambitions
- Engagement scores set ambition baselines
- Rating trends populate gate criteria

**Current State:** No connection
**Desired State:** Real-time ambition progress tracking
**Priority:** HIGH

---

#### F. Agreement Expiry & Timeline
**Source:** `agreements.expiry_date`
**Target:** `campaign_timelines`

**Data Elements:**
```sql
agreements
└── expiry_date → campaign_timelines.agreement_expiry_date

(Calculated)
├── pabo_available_date = expiry_date - 30 days
├── working_backwards = TRUE (if expiry-constrained)
└── peak_engagement_target_date = calculated based on stages
```

**Integration Logic:**
- Auto-calculate campaign timeline from agreement
- PABO date determines final gate timing
- Working backwards mode if expiry < 12 months

**Current State:** Manual entry
**Desired State:** Auto-calculate on agreement link
**Priority:** HIGH

---

### 3.2 OA Planner → Organising DB Data Flow

#### A. Strategic Plan Status
**Source:** `campaign_stage_plans.status`
**Target:** `campaigns.status`

**Data Elements:**
```sql
campaign_stage_plans
├── status ('draft', 'active', 'completed', 'blocked')
└── stage_number (1-6)

(Sync Logic)
IF all stages = 'completed' THEN campaigns.status = 'completed'
IF any stage = 'blocked' THEN campaigns.status = 'suspended'
IF first stage = 'active' THEN campaigns.status = 'active'
```

**Current State:** Manual status update
**Desired State:** Auto-sync from plan progression
**Priority:** HIGH

---

#### B. Gate Assessment Outcomes
**Source:** `gate_assessments.outcome`
**Target:** `campaigns.status`, notifications

**Data Elements:**
```sql
gate_assessments
├── outcome ('passed', 'failed', 'override_approved', 'deferred')
├── gate_number (1-5)
└── assessment_date

(Trigger Actions)
IF outcome = 'failed' → Block next stage, notify organiser
IF outcome = 'passed' → Unlock next stage, update campaign status
IF outcome = 'deferred' → Create follow-up task in Organising DB
```

**Current State:** Manual notification
**Desired State:** Auto-create tasks/notifications
**Priority:** HIGH

---

#### C. Ambition Achievement
**Source:** `plan_ambitions.is_achieved`, `current_value`
**Target:** `campaign_activity_ratings`, dashboard metrics

**Data Elements:**
```sql
plan_ambitions
├── is_achieved → update campaign progress
├── current_value → real-time dashboard
├── target_value → progress calculation
└── target_date → deadline tracking

(Sync Logic)
FOR EACH ambition:
  IF metric_type = 'percentage' AND source = 'worker_rating':
    current_value = AVG(campaign_activity_ratings.rating)
  IF metric_type = 'count' AND source = 'worker_membership':
    current_value = COUNT(campaign_worker_membership.worker_id)
```

**Current State:** Manual data entry
**Desired State:** Real-time calculation from DB data
**Priority:** HIGH

---

#### D. Capacity Gaps
**Source:** `plan_capacities.status = 'gap'`
**Target:** `campaign_actions`, task assignments

**Data Elements:**
```sql
plan_capacities
├── status ('needed', 'available', 'gap', 'in_progress')
├── gap_description → action title
├── assigned_to → action ownership
└── resolution_plan → action description

(Auto-Create)
IF status = 'gap':
  CREATE campaign_action:
    title = capacity_option.option_text
    description = gap_description
    assigned_organiser_id = assigned_to
    due_date = resolution_date
```

**Current State:** Manual action creation
**Desired State:** Auto-generate actions from gaps
**Priority:** MEDIUM

---

#### E. Management System Triggers
**Source:** `plan_management_systems.frequency`
**Target:** `campaign_actions`, recurring tasks

**Data Elements:**
```sql
plan_management_systems
├── frequency ('daily', 'weekly', 'fortnightly', 'monthly', 'as_needed')
├── description → action template
└── responsible_organiser_id → assignment

(Auto-Create)
FOR EACH management_system:
  CREATE recurring campaign_action:
    title = system_option.option_text
    frequency = frequency
    assigned_organiser_id = responsible_organiser_id
```

**Current State:** Manual setup
**Desired State:** Auto-generate recurring actions
**Priority:** MEDIUM

---

#### F. Timeline Progress
**Source:** `stage_timeline_targets.actual_start`, `actual_end`
**Target:** Campaign reporting, dashboards

**Data Elements:**
```sql
stage_timeline_targets
├── planned_start / planned_end → schedule
├── actual_start / actual_end → execution
├── is_on_track → status indicator
└── variance_days → risk metric

(Reporting)
Aggregate stage progress:
  - Overall campaign % complete
  - Stages ahead/behind schedule
  - Critical path warnings
```

**Current State:** Separate reporting
**Desired State:** Unified campaign dashboard
**Priority:** MEDIUM

---

### 3.3 Bidirectional Sync Points

#### A. Campaign Organiser Assignment
**Sources:** `campaigns.organiser_id`, `plan_capacities.assigned_to`

**Sync Logic:**
```sql
-- When campaign organiser changes
UPDATE campaigns SET organiser_id = ? WHERE campaign_id = ?

-- Propagate to plan capacities
UPDATE plan_capacities pc
SET assigned_to = ?
FROM campaign_stage_plans csp
WHERE csp.plan_id = pc.plan_id
  AND csp.campaign_id = ?
```

**Current State:** Manual update
**Desired State:** Bidirectional sync with conflict resolution
**Priority:** HIGH

---

#### B. Campaign Scope Changes
**Sources:** `campaign_universe_rules`, `plan_where_to_play`

**Sync Logic:**
```sql
-- When universe rules added/modified
INSERT INTO campaign_universe_rules (...)

-- Trigger WTP recalculation
UPDATE plan_where_to_play
SET is_exclusion = NOT include
WHERE plan_id IN (
  SELECT plan_id FROM campaign_stage_plans
  WHERE campaign_id = ?
)
```

**Current State:** No sync
**Desired State:** Scope changes trigger planning review
**Priority:** MEDIUM

---

#### C. Agreement Updates
**Sources:** `agreements.expiry_date`, `campaign_timelines`

**Sync Logic:**
```sql
-- When agreement expiry changes
UPDATE agreements SET expiry_date = ? WHERE agreement_id = ?

-- Recalculate campaign timeline
UPDATE campaign_timelines
SET agreement_expiry_date = ?,
    pabo_available_date = ? - INTERVAL '30 days'
WHERE campaign_id IN (
  SELECT campaign_id FROM campaigns
  WHERE agreement_id = ?
)
```

**Current State:** Manual recalculation
**Desired State:** Auto-recalculate with notification
**Priority:** HIGH

---

## 4. Data Flow Diagrams

### 4.1 Campaign Creation Flow

```
┌─────────────────┐
│ Organising DB   │
│                 │
│ 1. Create       │
│    campaign     │──┐
│ 2. Define       │  │
│    universe     │  │
│ 3. Link         │  │
│    agreement    │  │
└─────────────────┘  │
                     │
                     │ (Deep Link + Context)
                     ▼
┌─────────────────┐
│ OA Planner      │
│                 │
│ 4. Create       │
│    stage plans  │
│ 5. Import       │
│    universe →   │
│    WTP          │
│ 6. Calculate    │
│    timeline     │
└─────────────────┘
```

### 4.2 Planning → Execution Flow

```
┌─────────────────┐
│ OA Planner      │
│                 │
│ 1. Define       │
│    ambitions    │──┐
│ 2. Select WTP   │  │
│ 3. Theory of    │  │
│    winning      │  │
│ 4. Plan         │  │
│    capacities   │  │
│ 5. Define mgmt  │  │
│    systems      │  │
└─────────────────┘  │
                     │ (Generate Actions/Tasks)
                     ▼
┌─────────────────┐
│ Organising DB   │
│                 │
│ 6. Auto-create  │
│    actions from │
│    capacities   │
│ 7. Auto-create  │
│    tasks from   │
│    mgmt systems │
│ 8. Execute      │
│    campaign     │
└─────────────────┘
```

### 4.3 Execution → Monitoring Flow

```
┌─────────────────┐
│ Organising DB   │
│                 │
│ 1. Execute      │
│    actions      │──┐
│ 2. Rate         │  │
│    workers      │  │
│ 3. Log          │  │
│    results      │  │
└─────────────────┘  │
                     │ (Real-time Progress)
                     ▼
┌─────────────────┐
│ OA Planner      │
│                 │
│ 4. Update       │
│    ambition     │
│    progress     │
│ 5. Assess gates │
│ 6. Report       │
│    status       │
└─────────────────┘
```

### 4.4 Gate Assessment Flow

```
┌─────────────────┐
│ OA Planner      │
│                 │
│ 1. Evaluate     │
│    gate criteria│──┐
│ 2. Record       │  │
│    assessment   │  │
│ 3. Set outcome  │  │
└─────────────────┘  │
                     │ (Outcome Trigger)
                     ▼
┌─────────────────┐
│ Organising DB   │
│                 │
│ 4. Update       │
│    campaign     │
│    status       │
│ 5. Create       │
│    follow-up    │
│    tasks (if    │
│    deferred)    │
│ 6. Notify       │
│    organisers   │
└─────────────────┘
```

---

## 5. Current vs Desired State Comparison

### 5.1 Campaign Creation

| Aspect | Current State | Desired State |
|--------|--------------|---------------|
| Campaign record | Create in Organising DB | Same |
| Strategic plan | Manual link to OA Planner | Auto-create plan skeleton |
| Universe import | Manual re-entry | Auto-import as WTP baseline |
| Timeline | Manual calculation | Auto-calculate from agreement |
| Capacity planning | No connection | Pre-populate from OU structure |

### 5.2 Planning Execution

| Aspect | Current State | Desired State |
|--------|--------------|---------------|
| Action generation | Manual | Auto-create from capacities/gaps |
| Task assignment | Separate systems | Sync with management systems |
| Progress tracking | Manual entry | Real-time from DB actions |
| Ambition tracking | Manual entry | Auto-calculate from ratings |

### 5.3 Monitoring & Reporting

| Aspect | Current State | Desired State |
|--------|--------------|---------------|
| Campaign status | Manual update | Auto-sync from plan status |
| Gate outcomes | Manual notification | Auto-trigger actions/tasks |
| Progress dashboards | Separate | Unified cross-app dashboard |
| Reporting | Independent | Cross-app reports |

---

## 6. Integration Complexity Assessment

### 6.1 Low Complexity (Quick Wins)
- Shared URL routing (✅ done)
- Context passing via query params (✅ done)
- Read-only cross-app data access
- Basic status sync

### 6.2 Medium Complexity (Phase 2-3)
- Universe → WTP import
- Timeline auto-calculation
- Ambition progress calculation
- Gate-triggered actions

### 6.3 High Complexity (Phase 4)
- Bidirectional data sync
- Conflict resolution
- Real-time state management
- Unified UI experience
- Cross-app transaction integrity

---

## 7. Critical Success Factors

### 7.1 Data Integrity
- Single source of truth for shared entities
- Conflict resolution mechanisms
- Audit trails for sync operations

### 7.2 User Experience
- Seamless navigation between apps
- Consistent mental models
- Clear indication of data ownership

### 7.3 Performance
- Minimal cross-app latency
- Efficient sync mechanisms
- Offline-first considerations

### 7.4 Security & Permissions
- Consistent access control
- Audit logging
- Data privacy compliance

---

## 8. Recommendations Summary

### 8.1 Immediate (Phase 1)
✅ **COMPLETED:** Deep links with context passing

### 8.2 Short-term (Phase 2)
1. Read-only cross-app data access
2. Timeline auto-calculation
3. Status sync (plan → campaign)
4. Gate-triggered notifications

### 8.3 Medium-term (Phase 3)
1. Universe → WTP import
2. Ambition auto-calculation
3. Capacity gap → action generation
4. Unified campaign dashboard

### 8.4 Long-term (Phase 4)
1. Bidirectional sync
2. Unified UI (embedded or single-app)
3. Real-time state management
4. Advanced conflict resolution

---

## 9. Appendices

### Appendix A: Table Relationship Summary

```
campaigns (SHARED)
├── Organising DB extensions:
│   ├── campaign_universes
│   ├── campaign_actions
│   ├── campaign_activities
│   ├── campaign_organising_units
│   └── campaign_worker_membership
└── OA Planner extensions:
    ├── campaign_stage_plans
    ├── campaign_timelines
    └── gate_definitions

 agreements (Organising DB)
 └── expiry_date → campaign_timelines (OA Planner)

 workers (Organising DB)
 ├── engagement → plan_ambitions.progress
 └── ratings → gate_criteria.current_value

 campaign_universe_rules (Organising DB)
 └── rule_entity_id → plan_where_to_play.selection
```

### Appendix B: Field Mapping Cross-Reference

| Organising DB Field | OA Planner Field | Sync Direction |
|---------------------|------------------|----------------|
| campaigns.status | campaign_stage_plans.status | Both |
| campaigns.organiser_id | plan_capacities.assigned_to | Both |
| agreements.expiry_date | campaign_timelines.agreement_expiry_date | ODB → Planner |
| campaign_universe_rules.* | plan_where_to_play.* | ODB → Planner |
| campaign_activity_ratings.rating | plan_ambitions.current_value | ODB → Planner |
| gate_assessments.outcome | campaigns.status | Planner → ODB |
| plan_capacities.gap_description | campaign_actions.title | Planner → ODB |
| plan_management_systems.frequency | campaign_actions.recurrence | Planner → ODB |

---

**Next Steps:**
1. Review and validate integration map
2. Prioritize integration points by business value
3. Define detailed data flow specifications
4. Design phased implementation roadmap
