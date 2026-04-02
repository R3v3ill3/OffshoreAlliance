# Offshore Alliance Platform — Remediation Plan

> **Created:** 2026-04-02
> **Purpose:** Structured plan for deploying multiple agents to address security vulnerabilities, missing functionality, integration gaps, and performance concerns.
> **Status:** **PLANNING** — Awaiting clarification and decision points before execution.

---

## Executive Summary

This remediation plan addresses **28 identified issues** across the Offshore Alliance Platform. Work is organized into **5 phases** that can be executed by **specialized agents** working in parallel where possible.

| Priority | Issues | Estimated Complexity | Agent Type |
|----------|--------|---------------------|------------|
| Critical (Security) | 3 | High | Security Specialist |
| High (Data Integrity) | 4 | Medium | Backend/Database |
| Medium (Feature Completeness) | 6 | Medium-High | Full-Stack |
| Low (Quality of Life) | 4 | Low-Medium | Full-Stack |
| Infrastructure | 3 | Medium | DevOps |

---

## Part 1: Clarification Questions

Before execution, these questions should be answered to ensure the plan meets operational needs.

### Security & Access Control

1. **RLS Scope Decision:** For the `is_assigned_to_campaign()` RLS fix, should organisers have access to:
   - Only campaigns for agreements they are directly assigned to?
   - Or campaigns for agreements where *any* organiser on their team is assigned?
   - Or all campaigns where *any* agreement they're assigned to overlaps with the campaign's agreement?

2. **Service Role Key Rotation:** Is there a process in place for rotating the `SUPABASE_SERVICE_ROLE_KEY`? Should the remediation include implementing a key rotation procedure?

3. **Rate Limiting Tiers:** What rate limits are appropriate for different user roles?
   - Admin: ?
   - Organiser: ?
   - Viewer: ?

4. **AI Content Moderation:** For prompt injection risk, should we implement:
   - Basic sanitization only?
   - Full content moderation with blocked patterns?
   - Audit logging for all AI interactions?

---

### Data Structure Decisions

5. **Projects Table Purpose:** What is the intended purpose of the `projects` table?
   - Is it a legacy table that should be deprecated?
   - Is it for future functionality?
   - Should it be integrated with the campaign planning system?

6. **Worksite Hierarchy:** Is the parent/child worksite model (via `parent_worksite_id`) intended to be used?
   - If yes, provide examples of which worksites should be hierarchical
   - If no, should this field be removed from the schema?

7. **Worker-to-Project Linkage:** Should `workers.project_id` be maintained going forward?
   - This affects import workflows, worker profiles, and reporting

8. **Employer-Employer Connection Standard:** Which method should be the single source of truth for connecting employers to worksites?
   - `employer_worksite_roles` (currently populated)
   - `project_employers` (currently empty)
   - Both for different purposes?

---

### Integration & UX Decisions

9. **Application Integration Strategy:** What is the long-term vision for the two applications?
   - Remain separate with deep links?
   - Merge into a single Next.js app with route prefixes (`/organising/*`, `/planning/*`)?
   - Shared navigation shell?

10. **Organiser Workload Dashboard:** Where should this feature live?
    - In Organising DB?
    - In OA Planner?
    - As a new standalone dashboard?
    - What specific metrics should it display?

11. **Gate Criteria Live Data:** For gate criteria auto-population, what is the tolerance for data staleness?
    - Real-time (query on each assessment)?
    - Cached with refresh trigger?
    - Daily snapshot?

12. **Campaign Expiry Warning Window:** How many months before agreement expiry should warnings appear?
    - Suggested: 6 months for greenfields, 12 months for EBAs?

---

### Performance & Infrastructure

13. **Pagination Strategy:** What pagination approach should be used?
    - Cursor-based (better for infinite scroll)?
    - Offset-based (simpler, but slower on large datasets)?
    - Virtual scrolling for very large lists?

14. **Import Log Retention:** How long should import logs be retained?
    - Suggested: 90 days in hot storage, 1 year in cold storage?

15. **Monitoring & Alerting:** What level of monitoring is required?
    - Basic uptime monitoring?
    - Error tracking (e.g., Sentry)?
    - Performance monitoring (e.g., Vercel Analytics)?
    - Custom dashboards for specific metrics?

---

### Priority & Scheduling

16. **Deployment Cadence:** How should fixes be deployed?
    - All at once in a major release?
    - Incrementally by phase?
    - Security fixes immediately, others incrementally?

17. **User Communication:** How should users be informed of changes?
    - Email notifications for breaking changes?
    - In-app notifications?
    - Documentation updates only?

18. **Testing Requirements:** What level of testing is required before deployment?
    - Manual testing by team?
    - Automated test coverage requirements?
    - Staging environment validation?

---

## Part 2: Key Decision Points

These are decisions that need to be made before specific phases can begin.

### Decision Point 1: RLS Access Model (Blocks Phase 1)

**Context:** The current `is_assigned_to_campaign()` RLS function has a bug that allows inappropriate access.

**Options:**
| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Strict assignment | Organisers only see campaigns for agreements they're directly assigned to | Most secure; may hide relevant info |
| B | Team-based | Organisers see campaigns where they OR their team members are assigned | Balances security with collaboration |
| C | Agreement-overlap | Organisers see any campaign where their assigned agreements overlap with campaign scope | Most permissive; similar to current (buggy) behavior |

**Recommendation:** Option B (Team-based) — matches the intended reporting hierarchy model.

**Required Decision:** Which option should be implemented?

---

### Decision Point 2: Projects Table Future (Blocks Phase 2)

**Context:** The `projects` table exists but junction tables (`project_employers`, `project_agreements`) are empty.

**Options:**
| Option | Description | Effort |
|--------|-------------|--------|
| A | Deprecate | Remove projects from UI, add deprecation notice to schema | Low |
| B | Populate | Backfill junction tables and integrate into UI/ workflows | Medium |
| C | Re-purpose | Redefine projects for a different use case | High |

**Recommendation:** Decision required based on strategic intent for projects.

---

### Decision Point 3: Application Architecture (Blocks Phase 3)

**Context:** Deep links and shared navigation require architectural decisions.

**Options:**
| Option | Description | Timeline |
|--------|-------------|----------|
| A | Deep links only | Add cross-app links; maintain separate apps | Short-term |
| B | Shared nav shell | Add shared navigation component across both apps | Medium-term |
| C | Full merge | Combine into single app with route prefixes | Long-term |

**Recommendation:** Start with A (deep links) as quick win; plan for B or C based on longer-term roadmap.

---

### Decision Point 4: AI Provider & Model Strategy (Blocks Phase 4)

**Context:** AI features use Anthropic Claude for Theory of Winning generation and employer analysis.

**Options:**
| Option | Description | Cost Consideration |
|--------|-------------|-------------------|
| A | Anthropic only | Continue with Claude; optimize prompts | Higher cost, better quality |
| B | Hybrid | Use Claude for complex tasks, cheaper models for simple | Medium cost, variable quality |
| C | Cached AI | Cache AI responses; reuse when inputs are similar | Lower cost, stale data risk |

**Recommendation:** A with C (implement caching for identical inputs).

---

## Part 3: Agent Deployment Strategy

### Phase 1: Critical Security Fixes (1-2 weeks)

**Agent Type:** Security Specialist + Backend Developer

**Can Run In Parallel:** Yes (2 independent security fixes)

| Agent | Task | Dependencies | Deliverables |
|-------|------|--------------|--------------|
| **Security Agent 1** | Fix RLS `is_assigned_to_campaign()` oversharing | Decision Point 1 | Updated migration, test cases |
| **Security Agent 2** | Fix cron snapshot route to use service client | None | Updated API route, monitoring |
| **Security Agent 3** | Implement rate limiting on all API routes | Decision Point 3 | Rate limiter middleware, configuration |

**Success Criteria:**
- RLS policies correctly restrict data access
- Cron snapshots complete successfully
- API routes reject requests exceeding rate limits

---

### Phase 2: Data Integrity & Structure (2-3 weeks)

**Agent Type:** Backend/Database Specialist

**Can Run In Parallel:** Partially (some tasks dependent on Decision Point 2)

| Agent | Task | Dependencies | Deliverables |
|-------|------|--------------|--------------|
| **Data Agent 1** | Fix AI prompt context (employer + worksite names) | Decision Point 2 | Updated stage page, test data |
| **Data Agent 2** | Implement employer merge validation | None | Validation rules, merge UI improvements |
| **Data Agent 3** | Backfill or deprecate projects table | Decision Point 2 | Migration script OR deprecation notice |
| **Data Agent 4** | Implement import log retention | Decision Point 14 | Retention policy, archival job |

**Success Criteria:**
- AI prompts include correct employer and worksite context
- Employer merge operations validated
- Projects table resolved (populated or deprecated)
- Old import logs automatically archived/deleted

---

### Phase 3: Integration & Feature Completeness (3-4 weeks)

**Agent Type:** Full-Stack Developer

**Can Run In Parallel:** Yes (4 independent features)

| Agent | Task | Dependencies | Deliverables |
|-------|------|--------------|--------------|
| **Feature Agent 1** | Implement deep links between apps | Decision Point 3 | Cross-app navigation, URL structure |
| **Feature Agent 2** | Auto-populate gate criteria from live data | Decision Point 11 | Supabase function, UI updates |
| **Feature Agent 3** | Add employer/worksite preview to campaign wizard | Decision Point 2 | Wizard UI enhancements |
| **Feature Agent 4** | Add campaign planning status badges to Organising DB | None | Status badges, queries |
| **Feature Agent 5** | Build organiser workload dashboard | Decision Point 10 | Dashboard page, metrics |

**Success Criteria:**
- Users can navigate between apps without manual URL entry
- Gate criteria show live data from database
- Campaign creation shows relevant employer/worksite context
- Agreement pages display campaign planning status
- Organiser workload visible in unified dashboard

---

### Phase 4: Performance & Scalability (2-3 weeks)

**Agent Type:** Performance Specialist + Full-Stack Developer

**Can Run In Parallel:** Yes (pagination can run while indexes are added)

| Agent | Task | Dependencies | Deliverables |
|-------|------|--------------|--------------|
| **Perf Agent 1** | Implement pagination on all list views | Decision Point 13 | Pagination component, updated queries |
| **Perf Agent 2** | Audit and add database indexes | Schema analysis | Index migration, documentation |
| **Perf Agent 3** | Implement AI request batching for large datasets | None | Batching logic, error handling |

**Success Criteria:**
- All list views handle 1000+ rows without performance degradation
- Frequently queried columns have appropriate indexes
- Large employer/worksites datasets can be analyzed without timeout

---

### Phase 5: Infrastructure & Monitoring (1-2 weeks)

**Agent Type:** DevOps Engineer

**Can Run In Parallel:** Yes (independent infrastructure improvements)

| Agent | Task | Dependencies | Deliverables |
|-------|------|--------------|--------------|
| **Infra Agent 1** | Implement error tracking (Sentry or similar) | Decision Point 15 | Error tracking integration |
| **Infra Agent 2** | Set up monitoring dashboards | Decision Point 15 | Dashboard configuration |
| **Infra Agent 3** | Document disaster recovery procedures | None | DR documentation, runbooks |
| **Infra Agent 4** | Implement service role key rotation procedure | Decision Point 2 | Rotation script, documentation |

**Success Criteria:**
- Errors are tracked and alertable
- System health visible in dashboards
- DR procedures documented and tested
- Key rotation process automated

---

## Part 4: Execution Dependencies

```
Phase 1 (Security)
    ├── No dependencies
    └── BLOCKS: Nothing (can start immediately)

Phase 2 (Data)
    ├── BLOCKED BY: Decision Point 1 (RLS scope)
    ├── BLOCKED BY: Decision Point 2 (Projects future)
    └── BLOCKS: Phase 3 (some features need clean data)

Phase 3 (Features)
    ├── BLOCKED BY: Decision Point 3 (Integration strategy)
    ├── BLOCKED BY: Decision Point 10 (Dashboard location)
    ├── BLOCKED BY: Decision Point 11 (Gate data freshness)
    └── BLOCKS: Nothing

Phase 4 (Performance)
    ├── BLOCKED BY: Decision Point 13 (Pagination strategy)
    └── BLOCKS: Nothing

Phase 5 (Infrastructure)
    ├── BLOCKED BY: Decision Point 15 (Monitoring level)
    └── BLOCKS: Nothing
```

**Parallel Execution Opportunities:**
- Phases 1, 4, and 5 can run simultaneously after clarifications
- Phase 3 can overlap with Phase 4 after clarifications
- Phase 2 must complete before some Phase 3 features (data-dependent)

---

## Part 5: Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing RLS behavior | Medium | High | Thorough testing; staged rollout |
| AI cost overruns from batching | Low | Medium | Monitor token usage; set limits |
| Performance regression from indexes | Low | Medium | Benchmark before/after |
| User confusion from new features | Medium | Low | Documentation; training |
| Deployment conflicts | Low | Medium | Coordinate deployment windows |

---

## Part 6: Pre-Execution Checklist

Before agent deployment begins:

- [ ] All clarification questions in Part 1 answered
- [ ] All decision points in Part 2 resolved
- [ ] Staging environment available for testing
- [ ] Backup procedures verified
- [ ] Rollback plan documented
- [ ] User communication plan approved
- [ ] Testing requirements defined

---

## Part 7: Success Metrics

### Security
- [ ] RLS policies verified with test users
- [ ] No unauthorized data access possible
- [ ] Rate limits active and tested
- [ ] API routes protected from abuse

### Data Integrity
- [ ] Projects table resolved (populated OR deprecated)
- [ ] All junction tables have referential integrity
- [ ] Import log retention automated
- [ ] Employer merge validated

### Features
- [ ] Cross-app navigation functional
- [ ] Gate criteria auto-populated
- [ ] Campaign wizard shows employer/worksite data
- [ ] Campaign status badges visible
- [ ] Organiser dashboard operational

### Performance
- [ ] List views load in <2 seconds with 10,000 rows
- [ ] Database queries use indexes (EXPLAIN ANALYZE verified)
- [ ] AI batching handles 500+ records

### Infrastructure
- [ ] Error tracking active
- [ ] Monitoring dashboards configured
- [ ] DR documentation complete
- [ ] Key rotation procedure tested

---

## Next Steps

1. **Review clarification questions** and provide answers
2. **Resolve decision points** with clear direction
3. **Confirm agent availability** or assign to team members
4. **Set up staging environment** for testing
5. **Approve plan** and establish timeline
6. **Begin Phase 1** with security fixes

---

**Status:** Awaiting input before execution can proceed.
