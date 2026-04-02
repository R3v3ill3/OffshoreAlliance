# Offshore Alliance Platform — Remediation Plan v2

> **Created:** 2026-04-02
> **Updated:** 2026-04-02 (User decisions incorporated)
> **Purpose:** Structured plan for deploying multiple agents to address security vulnerabilities, missing functionality, integration gaps, and performance concerns.
> **Status:** **DECISIONS RECEIVED** — Awaiting review of agent deployment strategy before execution.

---

## Executive Summary

Based on user decisions, this remediation plan addresses **28 identified issues** with adjusted priorities reflecting the small, trusted user base and development/testing context.

| Priority | Issues | Adjusted Approach | Agent Type |
|----------|--------|-------------------|------------|
| Critical (Security) | 3 | Simplified (trusted team context) | Backend/Database |
| High (Data Integrity) | 4 | Full scope | Backend/Database |
| Medium (Feature Completeness) | 6 | Full scope | Full-Stack |
| Low (Quality of Life) | 4 | Adjusted for small datasets | Full-Stack |
| Infrastructure | 3 | Added custom admin dashboards | Full-Stack |

---

## Part 1: User Decisions — Summary

### Access Control Philosophy
> "Everyone should be able to see everything, with priority views of their own assigned work and active universes. Users can view everyone's work but cannot write/edit work assigned or initiated by others unless granted permission by the user, a lead, or coordinator — or are themselves a lead organiser or coordinator."

**Implication:** RLS policies should be simplified to focus on write permissions rather than read restrictions. Read access is universal; write access is restricted.

---

### Key Decisions by Category

#### Security & Access Control
| Question | Decision | Impact on Plan |
|----------|----------|----------------|
| 1. RLS Scope | Universal read, restricted write with permission system | Simplifies RLS; adds permission request feature |
| 2. Key Rotation | Not a priority (small trusted team) | Remove from Phase 5 |
| 3. Rate Limiting | Admin-configurable per individual, no defaults | Add admin UI for individual rate limits |
| 4. AI Moderation | Not priority; audit logging wanted | Add audit logging for AI calls |

#### Data Structure
| Question | Decision | Impact on Plan |
|----------|----------|----------------|
| 5. Projects Table | Future functionality; integrate with campaign planning | **Requires separate planning phase** (see below) |
| 6. Worksite Hierarchy | Intended to be used, not fully developed | **Requires separate analysis phase** (see below) |
| 7. Worker-to-Project | Focus on worker-campaign connections with activity/ratings | Adjust data model emphasis |
| 8. Employer-Worksite Roles | Primary source of truth; campaign universe defines critical relationships | Support multiple relationship types |

#### Integration & UX
| Question | Decision | Impact on Plan |
|----------|----------|----------------|
| 9. App Architecture | Not settled; needs pros/cons analysis | **Requires separate analysis phase** (see below) |
| 10. Dashboard Location | Organising DB; central element of dashboard landing page | Specific placement defined |
| 11. Gate Data Freshness | Real-time preferred; cached with refresh trigger acceptable | Implement real-time with trigger-based refresh fallback |
| 12. Expiry Warnings | 12mo low-level, 6mo prominent; greenfields have no expiry | Implement tiered warning system |

#### Performance & Infrastructure
| Question | Decision | Impact on Plan |
|----------|----------|----------------|
| 13. Pagination | Cursor-based; virtual scrolling for lists >250-500 rows | Dual approach based on dataset size |
| 14. Log Retention | 90 days hot, 1 year cold | Implement as suggested |
| 15. Monitoring | Sentry + custom admin dashboards during dev | Add admin monitoring tab |
| 16. Deployment | Security first, then incremental by phase | Staged rollout confirmed |
| 17. User Communication | Not needed (dev/testing phase) | Remove from plan |
| 18. Testing | Manual by user | Adjust testing approach |

---

### Decision Point Resolutions

| Decision Point | Resolution | Notes |
|----------------|------------|-------|
| **1. RLS Access Model** | Universal read, restricted write with permission system | Simplifies implementation; focus on write-blocking |
| **2. Projects Table** | **Requires separate analysis** | See "Additional Planning Required" below |
| **3. Application Architecture** | **Requires pros/cons analysis** | See "Additional Planning Required" below |
| **4. AI Provider** | Option A (Claude) with caching infrastructure for future | Build caching framework, use Claude now |

---

## Part 2: Additional Planning Required

Based on user decisions, the following areas require separate planning and analysis phases before implementation:

### Planning Requirement A: Projects, Programs & Hierarchies Analysis

**User Statement:**
> "I am still a little unclear on how the projects table should be used - I think there is confusion and overlap between projects and programs and workplace hierarchies and campaign universes. I need a more thorough analysis of workflow and hierarchies and network connections to be able to make a clear decision on direction for this section."

**Scope:**
- Analyze current relationships between:
  - `projects` table
  - `programs` table
  - `worksite` hierarchy (parent/child)
  - `employer` hierarchy (parent/child)
  - `campaign_universes`
  - `agreement_worksites`
  - `employer_worksite_roles`

**Deliverables Needed:**
1. Entity relationship diagram showing all connections
2. Current data gaps and inconsistencies documented
3. Recommended data model with clear separation of concerns
4. Migration path from current to recommended state
5. UI/UX implications for each approach

**Agent Type:** Database Architect + Business Analyst

**Estimated Effort:** 1 week

---

### Planning Requirement B: Worksite Hierarchy & Network Connections Analysis

**User Statement:**
> "The worksite hierarchy is intended to be used, but has not been fully developed. A separate plan to review and analyse all hierarchical and network connections would be a good additional step."

**Scope:**
- Review all hierarchical relationships:
  - Worksite parent/child
  - Employer parent/child
  - Program-to-worksite connections
  - Agreement-to-worksite connections
  - Project-to-worksite connections

**Deliverables Needed:**
1. Current state analysis of all hierarchical data
2. Recommended hierarchy model for offshore industry context
3. Data gaps preventing full implementation
4. Stepwise implementation plan

**Agent Type:** Database Architect + Industry Domain Specialist

**Estimated Effort:** 1 week

---

### Planning Requirement C: Application Architecture Pros/Cons Analysis

**User Statement:**
> "The long term vision of the two applications is not settled - they were separate, and have been integrated into a mono-repo to improve integration and connection. The analysis of the pros and cons of options has not been completed, but considerations include hosting resources and efficiency, repo management and complexity, as well as UX (single navigation is desirable) and considerations of robustness and reliability."

**Evaluation Criteria:**
- Performance
- Resource requirements
- User Experience (UX)
- Data management
- Ongoing development and maintenance
- Robustness and reliability
- Hosting costs
- Repository complexity

**Options to Evaluate:**
1. Separate apps with deep links
2. Separate apps with shared navigation shell
3. Single merged app with route prefixes
4. Microservices architecture

**Deliverables Needed:**
1. Detailed pros/cons matrix for each option against all criteria
2. Cost analysis (development, hosting, maintenance)
3. Risk assessment for each approach
4. Recommended path with justification
5. Migration plan if recommended path differs from current state

**Agent Type:** Solutions Architect + DevOps Engineer

**Estimated Effort:** 1 week

---

### Planning Requirement D: Campaign Planning Integration

**User Statement:**
> "The OAPlanning app campaign planning should be integrated with the Offshore Alliance organising database 'campaigns' page, so that specific campaign tasks and mapping are linked to the planning - this is a separate piece of work that requires it's own plan before implementation."

**Scope:**
- Integration between:
  - `campaigns` table (Organising DB)
  - `campaign_stage_plans` (OA Planner)
  - `campaign_actions` (Organising DB)
  - `campaign_universes` (Organising DB)
  - `campaign_timelines` (OA Planner)

**Deliverables Needed:**
1. Data flow diagram showing integration points
2. Shared vs separated data model decisions
3. UI integration approach (embedded vs linked)
4. Real-time sync strategy
5. Implementation phases

**Agent Type:** Full-Stack Architect + Product Owner

**Estimated Effort:** 1 week

---

## Part 3: Revised Agent Deployment Strategy

### Stream 1: Immediate Execution (No Additional Planning Required)

These items can proceed immediately based on user decisions.

#### Phase 1A: Foundation Fixes (1 week)

**Agent Type:** Backend Developer

**Can Run In Parallel:** Yes

| Agent | Task | User Decision Basis | Deliverables |
|-------|------|-------------------|--------------|
| **Backend Agent 1** | Simplify RLS to universal read, restricted write | Decision: "Everyone can see everything" | Updated RLS policies, permission request system |
| **Backend Agent 2** | Fix cron snapshot route to use service client | As identified in original plan | Updated API route |
| **Backend Agent 3** | Add audit logging for AI calls | Decision: "Audit logging is a good idea" | Audit log table, logging middleware |

**Success Criteria:**
- RLS allows universal read, restricts write appropriately
- Permission request workflow functional
- Cron snapshots completing
- All AI interactions logged

---

#### Phase 1B: Admin-Configurable Rate Limiting (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Add rate limit configuration to admin page | Decision: "Admin-configurable per individual" | Rate limit settings UI, per-user limit storage |
| Implement rate limiting middleware | No default limits required | Middleware with admin override capability |

**Success Criteria:**
- Admins can set rate limits per individual user
- No default rate limits applied
- Rate limit status visible in admin UI

---

#### Phase 1C: Monitoring Infrastructure (1 week)

**Agent Type:** DevOps + Full-Stack Developer

**Can Run In Parallel:** Yes

| Agent | Task | User Decision Basis | Deliverables |
|-------|------|-------------------|--------------|
| **DevOps Agent 1** | Integrate Sentry error tracking | Decision: "Have a Sentry account" | Sentry integration, error filtering |
| **Full-Stack Agent 1** | Build custom admin monitoring dashboard | Decision: "Custom dashboards in admin section during dev" | Admin monitoring tab with Supabase health, query performance, page load times |

**Dashboard Metrics Required:**
- Supabase connection status
- Error count by type
- Query performance times
- Page loading times
- Active user count

**Success Criteria:**
- Sentry capturing and categorizing errors
- Admin dashboard showing all required metrics
- Refresh capability for dashboard data

---

#### Phase 1D: Data Retention (3 days)

**Agent Type:** Backend Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement import log retention (90 days hot, 1 year cold) | Decision: "Happy with 90 days hot, 1 year cold" | Retention job, archival function, deletion job |

**Success Criteria:**
- Logs older than 90 days moved to cold storage
- Logs older than 1 year deleted
- Job runs automatically on schedule

---

#### Phase 1E: Gate Criteria Real-Time Data (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement real-time gate criteria population | Decision: "Real-time preferred; cached with refresh trigger acceptable" | Live data queries, trigger-based cache invalidation |

**Gate Criteria to Connect:**
- Membership Density → `worker_agreements` count
- Contact Details Verified → `workers` with phone/email
- Active WOCs → (pending WOC data model)

**Success Criteria:**
- Gate criteria update when underlying data changes
- Fallback to cached data with refresh trigger if real-time too resource-intensive
- UI shows last updated timestamp

---

#### Phase 1F: Expiry Warning System (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement tiered expiry warnings | Decision: "12 months low-level, 6 months prominent; greenfields have no expiry" | Warning badges, filtering logic, greenfields exclusion |

**Warning Levels:**
- 12+ months: No warning or minimal indicator
- 6-12 months: Low-level notification (info badge)
- <6 months: Prominent warning (warning badge)
- Greenfields: No expiry-based warnings

**Success Criteria:**
- Warnings appear at appropriate time thresholds
- Greenfields agreements correctly excluded
- Warning severity visually distinct

---

#### Phase 1G: Permission Request System (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Build permission request workflow | Decision: "Should be able to request permission from lead organiser or assigned organiser" | Request UI, notification system, approval workflow |

**Workflow:**
1. User attempts to edit campaign/task they don't own
2. System offers to request permission
3. Request sent to owner + their lead/coordinator
4. Owner can approve/deny
5. Approval grants temporary or persistent edit access

**Success Criteria:**
- Requests created when access denied
- Notifications delivered to appropriate parties
- Approval grants write access
- Audit trail maintained

---

#### Phase 1H: AI Response Caching Infrastructure (1 week)

**Agent Type:** Backend Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Build AI response caching framework | Decision: "Implement a caching process for future implementation, but stick with Claude for now" | Cache table, lookup logic, admin UI for cache management |

**Current Phase:** Cache infrastructure only; caching not enabled
**Future:** Enable caching and build library from responses

**Success Criteria:**
- Cache table and functions created
- Lookup logic in place (currently bypassed)
- Admin UI to view cache entries
- Clear path to enable caching in future

---

#### Phase 1I: Pagination Strategy (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement dual pagination approach | Decision: "Cursor-based for most; virtual scrolling for lists >250-500" | Cursor pagination component, virtual scroll component, switching logic |

**Implementation:**
- Lists <250 rows: No pagination (show all)
- Lists 250-1000 rows: Cursor-based pagination
- Lists >1000 rows: Virtual scrolling

**Success Criteria:**
- Pagination type switches based on row count
- Performance acceptable at all dataset sizes
- Smooth user experience at transition points

---

#### Phase 1J: Worker-Campaign Connection Model (1 week)

**Agent Type:** Backend + Database Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement worker-campaign focus with activity/ratings | Decision: "Key focus is being able to connect workers to campaigns, and track their activity and ratings" | Data model updates, worker profile UI, activity tracking |

**Considerations:**
- Service employers: worksites vary daily; job_title more relevant
- Direct-employed: enduring connection to workplace
- Campaigns may span multiple employers/worksites or be subset

**Success Criteria:**
- Workers linkable to campaigns
- Activity tracked per worker-campaign
- Rating system functional
- Service employer use case supported

---

### Stream 2: Organising DB Features (After Stream 1)

#### Phase 2A: Organiser Workload Dashboard (2 weeks)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Build organiser workload dashboard | Decision: "Should live in Organising DB, central element of dashboard landing page" | Dashboard page, integrated into landing page |

**Dashboard Content:**
- My campaigns (lead or assigned)
- My tasks across campaigns
- My universes
- Workers I'm tracking
- Upcoming deadlines
- Activity summary

**Success Criteria:**
- Dashboard on Organising DB landing page
- Shows organiser's complete workload picture
- Clickable items lead to detail pages

---

#### Phase 2B: Cross-App Deep Links (1 week)

**Agent Type:** Full-Stack Developer

| Task | User Decision Basis | Deliverables |
|------|-------------------|--------------|
| Implement deep links between apps | Interim until architecture decision | Link components, URL structure |

**Links to Implement:**
- Organising DB → OA Planner: "Create Campaign Plan" on agreement pages
- OA Planner → Organising DB: Agreement, employer, worksite links from campaigns

**Success Criteria:**
- Links functional in both directions
- Context preserved where possible
- Visual indication of external links

---

#### Phase 2C: Campaign Planning Status Badges (3 days)

**Agent Type:** Full-Stack Developer

| Task | Deliverables |
|------|--------------|
| Add campaign status to Organising DB agreement pages | Status badges, queries to OA Planner tables |

**Badge States:**
- No campaign plan
- Stage X: [Stage Name]
- Campaign complete

**Success Criteria:**
- Badges visible on agreement list and detail pages
- Real-time status from OA Planner
- Clickable to open relevant campaign

---

### Stream 3: Additional Planning (Parallel to Streams 1 & 2)

These planning phases can run in parallel with immediate execution work.

#### Planning Phase 1: Projects, Programs & Hierarchies Analysis
**Duration:** 1 week
**Agent Type:** Database Architect + Business Analyst
**See "Planning Requirement A" above for full scope**

#### Planning Phase 2: Worksite Hierarchy Analysis
**Duration:** 1 week
**Agent Type:** Database Architect + Domain Specialist
**See "Planning Requirement B" above for full scope**

#### Planning Phase 3: Application Architecture Analysis
**Duration:** 1 week
**Agent Type:** Solutions Architect + DevOps Engineer
**See "Planning Requirement C" above for full scope**

#### Planning Phase 4: Campaign Planning Integration
**Duration:** 1 week
**Agent Type:** Full-Stack Architect + Product Owner
**See "Planning Requirement D" above for full scope**

---

## Part 4: Execution Timeline

### Weeks 1-2: Foundation (Stream 1)
- Phase 1A: Foundation Fixes
- Phase 1C: Monitoring Infrastructure
- Phase 1D: Data Retention

### Weeks 3-4: Core Features (Stream 1)
- Phase 1E: Gate Criteria Real-Time Data
- Phase 1F: Expiry Warning System
- Phase 1I: Pagination Strategy

### Weeks 3-5: Parallel Planning (Stream 3)
- Planning Phases 1-4 run in parallel
- Each is 1 week
- Results inform future implementation phases

### Weeks 5-6: Advanced Features (Stream 1)
- Phase 1B: Rate Limiting
- Phase 1G: Permission Request System
- Phase 1H: AI Caching Infrastructure
- Phase 1J: Worker-Campaign Model

### Weeks 7-8: Organising DB Features (Stream 2)
- Phase 2A: Organiser Workload Dashboard
- Phase 2B: Cross-App Deep Links
- Phase 2C: Campaign Status Badges

### Week 9: Review & Next Steps
- Review all completed work
- Assess planning phase outputs
- Define next implementation phases based on planning decisions

---

## Part 5: Dependencies

```
Stream 1 (Immediate)
    ├── No dependencies on planning phases
    ├── Can start immediately
    └── BLOCKS: Nothing

Stream 2 (Organising DB Features)
    ├── BLOCKED BY: Phase 1A (RLS permissions)
    ├── BLOCKED BY: Phase 1C (Monitoring infrastructure for dashboard)
    └── BLOCKS: Nothing

Stream 3 (Planning Phases)
    ├── No dependencies on execution streams
    ├── Can run in parallel with Streams 1 & 2
    └── OUTPUTS INFORM: Future implementation phases
```

---

## Part 6: Updated Success Metrics

### Stream 1 Success Criteria
- [ ] Universal read access implemented, write access restricted
- [ ] Permission request workflow functional
- [ ] Sentry integrated and filtering errors
- [ ] Admin monitoring dashboard showing all required metrics
- [ ] Import logs automatically archived/deleted per retention policy
- [ ] Gate criteria showing live data
- [ ] Expiry warnings appearing at correct thresholds
- [ ] Rate limiting configurable per individual in admin
- [ ] AI response caching infrastructure in place
- [ ] Pagination switching based on dataset size
- [ ] Workers linkable to campaigns with activity tracking

### Stream 2 Success Criteria
- [ ] Organiser workload dashboard on Organising DB landing page
- [ ] Deep links functional between applications
- [ ] Campaign status badges showing on agreement pages

### Stream 3 Success Criteria
- [ ] Projects/programs/hierarchies analysis complete with recommendation
- [ ] Worksite hierarchy analysis complete with implementation plan
- [ ] Application architecture pros/cons analysis complete with recommendation
- [ ] Campaign planning integration plan complete with implementation phases

---

## Part 7: Pre-Execution Checklist

Before agent deployment begins:

- [ ] User reviews and approves this revised plan
- [ ] Sentry credentials available for integration
- [ ] Staging environment available for testing
- [ ] Backup procedures verified
- [ ] Rollback plan documented
- [ ] Planning phase agents assigned or scheduled

---

## Summary of Changes from Original Plan

| Aspect | Original Plan | Revised Plan (Based on User Input) |
|--------|---------------|-----------------------------------|
| RLS Approach | Fix oversharing bug | Simplify to universal read + permission system |
| Rate Limiting | Tier-based defaults | Admin-configurable per individual, no defaults |
| AI Moderation | Implement sanitization | Audit logging only; moderation not priority |
| Key Rotation | Implement procedure | Removed (not a priority) |
| Projects Table | Backfill or deprecate | **Separate planning required** |
| Worksite Hierarchy | Populate | **Separate analysis required** |
| App Architecture | Deep links only | **Pros/cons analysis required** |
| Dashboard Location | Unspecified | Organising DB landing page (central) |
| Gate Data | Cached or real-time | Real-time with trigger fallback |
| Expiry Warnings | Not specified | 12mo low-level, 6mo prominent; greenfields excluded |
| Pagination | Single strategy | Dual approach (cursor + virtual scroll) |
| Monitoring | External only | Sentry + custom admin dashboards |
| Deployment | All options | Security first, then incremental |
| Testing | Automated | Manual by user |
| User Comms | Required | Not required (dev/testing phase) |

---

## Next Steps

1. **User reviews this revised plan** and confirms approach
2. **Confirm agent deployment strategy** is acceptable
3. **Begin Stream 1, Phase 1A** (Foundation Fixes)
4. **Kick off Stream 3 Planning Phases** in parallel

---

**Status:** Awaiting user review of revised plan before proceeding.
