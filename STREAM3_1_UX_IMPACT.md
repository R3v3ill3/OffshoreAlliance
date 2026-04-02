# STREAM3_1: UX/UI Impact Analysis

## Executive Summary

This document analyzes how each data model option (A, B, C) would impact the user experience across the Offshore Alliance platform. It covers workflow changes, form interactions, dashboard displays, search/filter behavior, and overall user implications.

---

## Option A: Minimal Changes - UX Impact

### A1. Campaign Creation Workflow

**Current State:**
```
Step 1: Campaign Basics
  - Name, type, description, dates
  - Organiser assignment

Step 2: Campaign Scope (CONFUSING)
  - Choose reach pattern (4 options)
  - Select employers OR worksites OR both
  - Unclear if selection matches reach pattern

Step 3: Worker Selection
  - Filter by employer/worksite
  - Add individual workers
```

**After Option A (Clarified):**
```
Step 1: Campaign Basics (UNCHANGED)
  - Name, type, description, dates
  - Organiser assignment

Step 2: Campaign Scope (CLARIFIED)
  - Select employers (multi-select)
  - Select worksites (multi-select)
  - System auto-calculates reach pattern
  - Validation: Selection matches pattern

Step 3: Worker Selection (UNCHANGED)
  - Filter by employer/worksite
  - Add individual workers
```

**UX Changes:**
- **Better:** Reach pattern is computed, not manual selection
- **Better:** Validation prevents mismatched data
- **Better:** Tooltips explain terminology
- **Same:** No visual layout changes

**User Impact:** Minimal - workflow feels same but less confusing

---

### A2. Worksite Detail Page

**Current State:**
```
Tabs: Overview | Agreements | Employers | Work Scopes | Projects | Workers

Employers Tab:
  - Shows: Owner, Operator, Principal_Contractor, etc.
  - MISSING: Principal employer (blind spot)
  - User: "Where's Woodside? They own this site!"
```

**After Option A (Principal Employer Added):**
```
Employers Tab:
  - Shows: Principal Employer (highlighted)
  - Shows: Owner, Operator, Principal_Contractor, etc.
  - Clear visual distinction for principal
  - User: "Ah, Woodside is listed at top"
```

**UX Changes:**
- **Better:** Principal employer visible (was blind spot)
- **Better:** Visual hierarchy (principal > other roles)
- **Better:** Tooltip explains role types
- **Same:** Tab layout unchanged

**User Impact:** Positive - reduces confusion about "missing" employers

---

### A3. Project Display

**Current State:**
```
Projects Tab (at Worksite):
  - Project: "Pluto LNG Operations"
  - Work type: "production"
  - Status: "active"
  - [EMPTY] No employers listed
  - [EMPTY] No agreements listed
  - User: "Why are projects empty? Useless tab."
```

**After Option A (Data Populated):**
```
Projects Tab (at Worksite):
  - Project: "Pluto LNG Operations"
  - Work type: "production"
  - Status: "active"
  - Employers: Woodside (Operator), Ventia (Maintenance)
  - Agreements: Woodside Production EBA 2022
  - User: "Now I can see project context"
```

**UX Changes:**
- **Better:** Projects show employer and agreement data
- **Better:** No more "empty" project cards
- **Better:** Click through to employer/agreement details
- **Same:** Card layout unchanged

**User Impact:** Positive - projects become useful, not confusing

---

### A4. Agreement Display

**Current State:**
```
Agreement Detail Page:
  - Agreement Name: "Woodside Offshore EBA 2022"
  - Employer: Woodside Energy Ltd
  - Status: Current
  - Expiry: 2024-06-30
  - Sites: Pluto LNG, Wheatstone (2 sites)
  - [BLANK] Coverage: ???
  - User: "Is this site-specific or sector-wide? Can't tell."
```

**After Option A (Coverage Added):**
```
Agreement Detail Page:
  - Agreement Name: "Woodside Offshore EBA 2022"
  - Employer: Woodside Energy Ltd
  - Coverage: site_specific [BADGE]
  - Status: Current
  - Expiry: 2024-06-30
  - Sites: Pluto LNG, Wheatstone (2 sites)
  - User: "OK, this covers specific sites I can see"
```

**UX Changes:**
- **Better:** Coverage badge shows classification
- **Better:** Color-coded (site=blue, sector=green, etc.)
- **Better:** Filter by coverage type in list
- **Same:** Page layout unchanged

**User Impact:** Positive - clarifies agreement scope

---

### A5. Search and Filtering

**Current State:**
```
Campaign Search:
  - Filter by: Name, Type, Status, Organiser
  - Sort by: Name, Date, Status

Worker Search:
  - Filter by: Name, Employer, Worksite, Role
  - [MISSING] Project filter (all workers have NULL project_id)
```

**After Option A:**
```
Campaign Search: (UNCHANGED)
  - Filter by: Name, Type, Status, Organiser, Reach Pattern
  - Sort by: Name, Date, Status

Worker Search: (ENHANCED)
  - Filter by: Name, Employer, Worksite, Role, Project [NEW]
  - Sort by: Name, Date, Engagement
  - Project filter now works (data populated)
```

**UX Changes:**
- **Better:** Worker search includes project filter
- **Better:** Campaign search includes reach pattern
- **Same:** Search UI layout unchanged

**User Impact:** Positive - more powerful filtering

---

### A6. Dashboard Displays

**Current State:**
```
Overview Dashboard:
  - Campaigns by Stage chart
  - Worker Engagement card
  - Recent Activities list
  - [BLANK] Projects section (empty data)
```

**After Option A:**
```
Overview Dashboard:
  - Campaigns by Stage chart (UNCHANGED)
  - Worker Engagement card (UNCHANGED)
  - Recent Activities list (UNCHANGED)
  - Projects section [NEW - shows populated data]
    - Active Projects: 16
    - Projects by Work Type: [chart]
    - Projects without Employers: 0 [was 16]
```

**UX Changes:**
- **Better:** Projects dashboard no longer empty
- **Better:** Can track project progress
- **Better:** Data quality metrics (show what's missing)
- **Same:** Dashboard layout unchanged

**User Impact:** Positive - more useful dashboard

---

## Option B: Moderate Restructuring - UX Impact

### B1. Campaign Creation Workflow (Redesigned)

**Current State (Confusing):**
```
Step 2: Campaign Scope
  - Choose reach pattern: [dropdown]
  - Add employers: [multi-select]
  - Add worksites: [multi-select]
  - Add universe rules: [complex form]
  - User: "Which one do I use? All of them?"
```

**After Option B (Simplified):**
```
Step 2: Campaign Scope (SIMPLIFIED)
  - Add employers: [multi-select with search]
  - Add worksites: [multi-select with search]
  - System shows: "This is a multi-employer, multi-site campaign" [auto-detected]

  [REMOVED] Universe rules form
  [REMOVED] Manual reach pattern selection
```

**UX Changes:**
- **Better:** Single, clear workflow (no parallel mechanisms)
- **Better:** Auto-detection removes user burden
- **Better:** Real-time validation
- **Simpler:** Fewer form fields
- **Removed:** Campaign universes UI (deleted)

**User Impact:** Significantly Positive - campaign creation much clearer

---

### B2. Worker-Campaign Connection

**Current State (Confusing):**
```
Three ways to add workers to campaign:
  1. Campaign → Members tab → Add Worker [direct]
  2. Campaign → Organizing Units tab → Create OU → Add Workers [via OU]
  3. Campaign → Workers tab → Filter → Add to Campaign [manual]

Question: Which should I use? Are they the same?
```

**After Option B (Unified):**
```
Single workflow:
  Campaign → Workers tab → Add Worker
    - Select worker: [search + filter]
    - Set connection status: [dropdown: potential, contacted, engaged, member]
    - Set support level: [dropdown: strong, neutral, hostile]
    - Add tags: [text input]
    - Notes: [textarea]

  [REMOVED] Organizing Units tab (concept deprecated)
  [REMOVED] Members tab (merged into Workers)
```

**UX Changes:**
- **Better:** Single, clear workflow
- **Better:** Rich worker tracking (support, tags, activities)
- **Simpler:** One tab instead of three
- **Removed:** Organizing Units complexity

**User Impact:** Significantly Positive - unified worker management

---

### B3. Program vs Project Display

**Current State (Confusing):**
```
Overview Dashboard:
  - Projects tab: Shows "Pluto LNG Operations" (child of worksite)
  - Employer Groups tab: Shows "Woodside" (parent company)
  - User: "What's the difference? When do I use which?"
```

**After Option B (Clarified Hierarchy):**
```
Overview Dashboard:
  - Programs tab (NEW):
    - Woodside Operations (program)
      ├── Pluto LNG (worksite)
      ├── Wheatstone (worksite)
      └── Karratha Gas Plant (worksite)
    - Inpex Operations (program)
      ├── Ichthys CPF (worksite)
      └── Darwin LNG (worksite)

  - Site Projects tab (RENAMED):
    - Pluto LNG Operations (site project at Pluto LNG)
    - Wheatstone Maintenance (site project at Wheatstone)

  - Hierarchy Visualization: [tree view]
```

**UX Changes:**
- **Better:** Clear visual hierarchy (programs → worksites → site projects)
- **Better:** Distinct tabs for distinct concepts
- **Better:** Tree view shows relationships
- **Renamed:** "Projects" → "Site Projects" for clarity
- **New:** Programs tab with worksite grouping

**User Impact:** Positive - clarifies multi-level organization

---

### B4. Agreement Coverage Display

**Current State (Confusing Terminology):**
```
Agreement Detail:
  - Work Scopes: [list of work types]
  - Coverage: [blank]
  - User: "What's the difference between 'scope' and 'coverage'?"
```

**After Option B (Renamed + Clarified):**
```
Agreement Detail:
  - Coverage Type: site_specific [badge]
  - Work Types Covered: [list of work scopes]
  - Sites Covered: [list of worksites]

  [RENAMED] "Work Scopes" → "Work Types"
  [RENAMED] "Scope" → "Coverage Type"
```

**UX Changes:**
- **Better:** Disambiguated terminology
- **Better:** Clear distinction between coverage (where) and work types (what)
- **Better:** Visual badges for coverage type
- **Renamed:** Tabs and fields for clarity

**User Impact:** Positive - reduces terminology confusion

---

### B5. Search and Filtering (Enhanced)

**Current State (Limited):**
```
Worker Search:
  - Filter by: Name, Employer, Worksite, Role
  - [MISSING] Campaign connection status
  - [MISSING] Support level
  - [MISSING] Last contact date
```

**After Option B (Enhanced):**
```
Worker Search:
  - Filter by: Name, Employer, Worksite, Role
  - Filter by: Campaign [NEW]
  - Filter by: Connection Status [NEW]
  - Filter by: Support Level [NEW]
  - Filter by: Last Contact After [NEW]
  - Filter by: Tags [NEW]

  - Sort by: Last Contact, Support Level, Contact Count
  - Export: CSV with all connection fields
```

**UX Changes:**
- **Better:** Rich filtering for campaign targeting
- **Better:** Find uncontacted workers
- **Better:** Find strong supporters for mobilization
- **Better:** Export for outreach lists
- **New:** Connection-focused filters

**User Impact:** Significantly Positive - powerful campaign targeting

---

### B6. Data Quality Indicators

**Current State (Hidden Issues):**
```
No indication of:
  - Projects without employers (16 projects)
  - Agreements without coverage type (135 agreements)
  - Workers without project assignments (all workers)
```

**After Option B (Visible Metrics):**
```
Admin Dashboard:
  - Data Quality Card:
    ✓ Projects with Employers: 16/16 (100%)
    ✓ Projects with Agreements: 16/16 (100%)
    ✓ Agreements with Coverage: 135/135 (100%)
    ⚠ Workers with Project: 0/500 (0%) [ACTION NEEDED]

  - Action Items:
    - Backfill worker project assignments [link to bulk edit]
```

**UX Changes:**
- **Better:** Visibility into data quality
- **Better:** Clear action items
- **Better:** Track improvement over time
- **New:** Admin dashboard for data health

**User Impact:** Positive - proactive data quality management

---

## Option C: Complete Redesign - UX Impact

### C1. Contract-Centric Workflow

**Current State (Fragmented):**
```
To understand "Who does what where":
  1. Go to Worksite → Employers tab (see roles)
  2. Go to Worksite → Work Scopes tab (see work types)
  3. Go to Worksite → Agreements tab (see coverage)
  4. Go to Worksite → Projects tab (see phases)
  5. User: "I have to check 4 tabs to understand one contract!"
```

**After Option C (Unified):**
```
To understand "Who does what where":
  1. Go to Worksite → Contracts tab
     - Contract: Ventia Maintenance at Pluto LNG
       - Employer: Ventia
       - Work Type: Maintenance
       - Agreement: Woodside Production EBA
       - Employment Type: Contractor
       - Workers: 45 [view list]
     - Contract: Woodside Operations at Pluto LNG
       - Employer: Woodside
       - Work Type: Production
       - Agreement: Woodside Production EBA
       - Employment Type: Direct Employment
       - Workers: 120 [view list]

  2. User: "Perfect! Everything in one place."
```

**UX Changes:**
- **Better:** Unified contract view (all related info)
- **Better:** Clear hierarchy (contracts > workers)
- **Simpler:** Fewer tabs to check
- **New:** Contracts tab (central entity)
- **Removed:** Fragmented employer/scope/agreement tabs

**User Impact:** Significantly Positive - major workflow improvement

---

### C2. Campaign Targeting (Simplified)

**Current State (Complex):**
```
Campaign Creation:
  Step 1: Basics (name, type, dates)
  Step 2: Scope (confusing - multiple mechanisms)
  Step 3: Employers (multi-select)
  Step 4: Worksites (multi-select)
  Step 5: Workers (individual add)
  Step 6: Organizing Units (create groups)
```

**After Option C (Streamlined):**
```
Campaign Creation:
  Step 1: Basics (name, type, dates)
  Step 2: Select Contracts (multi-select with search)
    - Search by: Employer, Worksite, Work Type, Agreement
    - Filter by: Employment Type, Agreement Coverage
    - Preview: Shows affected worker count
  Step 3: Review & Confirm
    - Shows: Selected contracts, worker count, breakdown
```

**UX Changes:**
- **Simpler:** 3 steps instead of 6
- **Better:** Contract selection is intuitive
- **Better:** Real-time worker count preview
- **Removed:** Organizing Units complexity
- **Removed:** Parallel scope mechanisms

**User Impact:** Significantly Positive - much faster campaign creation

---

### C3. Worker Profile (Unified)

**Current State (Fragmented):**
```
Worker Profile:
  - Basic Info: name, email, phone
  - Employment: employer, worksite
  - Engagement: score, level
  - Campaigns: [list of campaigns]
  - [MISSING] Contract history
  - [MISSING] Job title changes
  - [MISSING] Movement across sites
```

**After Option C (Complete):**
```
Worker Profile:
  - Basic Info: name, email, phone
  - Current Contract:
    - Employer: Ventia
    - Worksite: Pluto LNG
    - Work Type: Maintenance
    - Job Title: Fitter
    - Start Date: 2023-06-01
  - Contract History: [timeline]
    - 2023-06: Ventia Maintenance at Pluto LNG [current]
    - 2022-03: Monadelphous Construction at Wheatstone
    - 2021-01: Self-employed
  - Campaign Engagement: [rich tracking]
    - Campaign: Offshore Mobilization 2026
    - Connection Status: Engaged
    - Support Level: Strong Supporter
    - Activities: 12 attended, 5 volunteered
    - Last Contact: 2026-03-15 (phone call)
```

**UX Changes:**
- **Better:** Complete worker history
- **Better:** Contract timeline visualization
- **Better:** Campaign engagement tracking
- **Better:** See worker movement across employers/sites
- **New:** Contract history tab
- **New:** Engagement timeline

**User Impact:** Significantly Positive - complete worker picture

---

### C4. Dashboard (Complete Redesign)

**Current State (Fragmented):**
```
Overview Dashboard:
  - Campaigns by Stage [chart]
  - Worker Engagement [card]
  - Recent Activities [list]
  - [EMPTY] Projects [section]

Multiple clicks to see:
  - Contract coverage
  - Agreement expiry
  - Worker distribution
  - Campaign progress
```

**After Option C (Unified):**
```
Overview Dashboard:
  - Campaign Health Score [gauge]
    - Overall: 72/100
    - Breakdown: Membership, Engagement, Mobilization Readiness

  - Contract Coverage [map]
    - Worksites: 23 covered
    - Workers: 1,250 in scope
    - Employers: 14 engaged

  - Agreement Expiry Timeline [Gantt]
    - Expiring in 6 months: 3 agreements
    - Workers affected: 450
    - Campaigns active: 2

  - Campaign Pipeline [Kanban]
    - Planning: 4 campaigns
    - Active: 8 campaigns
    - Completed: 12 campaigns

  - Worker Engagement Distribution [heatmap]
    - By employer
    - By worksite
    - By contract
```

**UX Changes:**
- **Better:** Contract-centric metrics
- **Better:** Visual agreement expiry timeline
- **Better:** Campaign pipeline visualization
- **Better:** Worker engagement heatmaps
- **New:** Contract coverage map
- **New:** Campaign health scoring
- **Removed:** Empty sections

**User Impact:** Significantly Positive - comprehensive overview

---

### C5. Search (Powerful)

**Current State (Basic):**
```
Worker Search:
  - Filter by: Name, Employer, Worksite
  - Sort by: Name, Date
```

**After Option C (Advanced):**
```
Worker Search:
  - Filter by: Name, Employer, Worksite
  - Filter by: Contract [NEW]
  - Filter by: Work Type [NEW]
  - Filter by: Agreement [NEW]
  - Filter by: Employment Type [NEW]
  - Filter by: Campaign Connection Status [NEW]
  - Filter by: Support Level [NEW]
  - Filter by: Last Contact Date [NEW]
  - Filter by: Engagement Score Range [NEW]

  - Saved Searches: [preset buttons]
    - "Uncontacted workers at Pluto LNG"
    - "Strong supporters at Wheatstone"
    - "Contract workers expiring soon"
    - "Workers not in any campaign"

  - Bulk Actions:
    - Add to Campaign
    - Schedule Contact
    - Export to CSV
    - Create Contract Group
```

**UX Changes:**
- **Better:** Rich filtering (contract-centric)
- **Better:** Saved searches (one-click filtering)
- **Better:** Bulk actions (efficiency)
- **New:** Contract-based filters
- **New:** Saved search presets

**User Impact:** Significantly Positive - powerful, efficient search

---

### C6. Data Entry (Streamlined)

**Current State (Repetitive):**
```
Adding a new worker:
  1. Go to Workers page
  2. Click "Add Worker"
  3. Fill form: name, email, phone, employer, worksite
  4. Save
  5. Go to Campaign page
  6. Add worker to campaign
  7. Go back to Worker page
  8. Add job title, classification
```

**After Option C (Unified):**
```
Adding a new worker:
  1. Go to Contracts page
  2. Select contract: "Ventia Maintenance at Pluto LNG"
  3. Click "Add Worker to Contract"
  4. Fill unified form:
     - Worker: name, email, phone
     - Contract: Ventia Maintenance at Pluto LNG [pre-filled]
     - Position: Fitter, Maintenance [dropdown]
     - Campaign: Add to "Offshore Mobilization 2026" [checkbox]
     - Initial Status: Potential Contact [dropdown]
  5. Save
  6. Done! (Worker added to contract + campaign in one step)
```

**UX Changes:**
- **Better:** Unified data entry (one form)
- **Better:** Contextual (contract pre-filled)
- **Better:** Fewer clicks
- **Simpler:** Single workflow
- **Removed:** Multi-page process

**User Impact:** Significantly Positive - major efficiency gain

---

## Comparative UX Summary

| UX Aspect | Option A | Option B | Option C |
|-----------|----------|----------|----------|
| **Campaign Creation** | Clarified (computed reach) | Simplified (single mechanism) | Streamlined (3 steps) |
| **Worker Management** | Enhanced (projects visible) | Unified (single connection table) | Complete (contract-centric) |
| **Data Entry** | Same workflow | Better validation | Streamlined (unified forms) |
| **Dashboard** | Populated (no empty sections) | Enhanced (data quality metrics) | Redesigned (contract-centric) |
| **Search/Filter** | Enhanced (project filter) | Powerful (connection status) | Advanced (saved searches) |
| **Terminology** | Renamed (clarified) | Disambiguated (removed collision) | Unified (new vocabulary) |
| **User Confusion** | Reduced (better labels) | Significantly reduced (removed redundancy) | Eliminated (new mental model) |
| **Learning Curve** | None (same UI) | Low (simplified UI) | Medium (new UI patterns) |
| **Efficiency Gains** | Low (clarify existing) | Medium (remove friction) | High (streamlined workflows) |

---

## User Scenarios

### Scenario 1: Creating a Campaign

**User Goal:** "Create a campaign targeting maintenance workers at Pluto LNG and Wheatstone"

**Option A Experience:**
```
1. Click "New Campaign"
2. Enter basics: "Pluto Maintenance Mobilization 2026"
3. Select scope:
   - Add employers: Ventia, Monadelphous
   - Add worksites: Pluto LNG, Wheatstone
   - System shows: "multi-employer, multi-site"
4. Filter workers: show maintenance workers at selected sites
5. Add workers to campaign
6. Done
```
**Rating:** 6/10 (Clearer than before, but still multi-step)

**Option B Experience:**
```
1. Click "New Campaign"
2. Enter basics: "Pluto Maintenance Mobilization 2026"
3. Select scope:
   - Add employers: Ventia, Monadelphous
   - Add worksites: Pluto LNG, Wheatstone
   - System auto-detects reach pattern
4. Add workers:
   - Filter: Maintenance workers at selected sites
   - Select all → Add to Campaign
   - Set status: "Potential Contact"
5. Done
```
**Rating:** 8/10 (Simplified, validation helps)

**Option C Experience:**
```
1. Click "New Campaign"
2. Enter basics: "Pluto Maintenance Mobilization 2026"
3. Select contracts:
   - Search: "maintenance" at "Pluto LNG" or "Wheatstone"
   - Results: 2 contracts
     ✓ Ventia Maintenance at Pluto LNG (45 workers)
     ✓ Monadelphous Maintenance at Wheatstone (38 workers)
   - Select both
   - Preview: 83 workers total
4. Review & Confirm
5. Done
```
**Rating:** 10/10 (Intuitive, fast, clear preview)

---

### Scenario 2: Finding Worker Information

**User Goal:** "What's John Smith's history and current engagement?"

**Option A Experience:**
```
1. Search: "John Smith"
2. Click worker profile
3. See:
   - Basic info: name, email, phone
   - Employer: Ventia
   - Worksite: Pluto LNG
   - Project: [NULL] (confusing!)
   - Engagement: Score 65, Level "activated"
   - Campaigns: [list]
4. Click through to campaigns for details
```
**Rating:** 5/10 (Fragmented, missing project info)

**Option B Experience:**
```
1. Search: "John Smith"
2. Click worker profile
3. See:
   - Basic info: name, email, phone
   - Employer: Ventia
   - Worksite: Pluto LNG
   - Site Project: Pluto LNG Operations [now populated!]
   - Campaign Connections:
     - Campaign: Offshore Mobilization 2026
     - Status: Engaged
     - Support: Strong Supporter
     - Last Contact: 2026-03-15
     - Activities: 8 attended
4. Rich engagement tracking visible
```
**Rating:** 8/10 (Complete, clear engagement picture)

**Option C Experience:**
```
1. Search: "John Smith"
2. Click worker profile
3. See:
   - Basic info: name, email, phone
   - Current Contract:
     ✓ Ventia Maintenance at Pluto LNG
       - Position: Fitter
       - Start: 2023-06-01
       - Agreement: Woodside Production EBA
   - Contract History: [timeline]
     - Previous contracts visible
   - Campaign Engagement:
     ✓ Offshore Mobilization 2026
       - Status: Engaged
       - Support: Strong Supporter
       - Activities: 8 attended, 5 volunteered
       - Last Contact: 2 days ago
   - Complete timeline: All activity visible
4. Everything in one place
```
**Rating:** 10/10 (Complete, intuitive, rich history)

---

### Scenario 3: Understanding Agreement Coverage

**User Goal:** "Which workers are covered by the Woodside Production EBA?"

**Option A Experience:**
```
1. Go to Agreements page
2. Find: "Woodside Production EBA 2022"
3. Click agreement detail
4. See:
   - Coverage: site_specific [badge]
   - Sites: Pluto LNG, Wheatstone (2 sites)
   - Employers: Woodside (primary)
   - Workers: [click to view list]
5. Click "View Workers"
6. See worker list (all workers at those sites)
7. Manually filter by: Employer = Woodside
```
**Rating:** 6/10 (Coverage unclear, manual filtering)

**Option B Experience:**
```
1. Go to Agreements page
2. Find: "Woodside Production EBA 2022"
3. Click agreement detail
4. See:
   - Coverage Type: site_specific [badge, color-coded]
   - Sites Covered: Pluto LNG, Wheatstone
   - Work Types: Production, Maintenance [NEW]
   - Employers Covered: Woodside, Ventia, Monadelphous [multi-employer!]
   - Workers Covered: 450 total [click to view breakdown]
5. Click "View Workers"
6. See breakdown by employer and site
```
**Rating:** 8/10 (Coverage clear, breakdown visible)

**Option C Experience:**
```
1. Go to Agreements page
2. Find: "Woodside Production EBA 2022"
3. Click agreement detail
4. See:
   - Coverage Type: site_specific [badge]
   - Contracts Covered: 12 contracts [NEW]
     ✓ Ventia Maintenance at Pluto LNG (45 workers)
     ✓ Woodside Operations at Pluto LNG (120 workers)
     ✓ Monadelphous Maintenance at Wheatstone (38 workers)
     ... [all 12 listed]
   - Total Workers: 450
   - Sites: 2 worksites
   - Employers: 3 employers
5. Click any contract to see worker list
```
**Rating:** 10/10 (Contract-based, clear breakdown, intuitive)

---

## Implementation UX Considerations

### Change Management

**Option A:**
- **User Training:** None needed (same workflows)
- **Documentation:** Update tooltips, help text
- **Communication:** "Clarified terminology, added missing data"
- **Rollout:** Silent update (no disruption)

**Option B:**
- **User Training:** Short tutorial (15 min)
- **Documentation:** New user guides, video walkthroughs
- **Communication:** "Simplified campaign creation, unified worker tracking"
- **Rollout:** Phased (feature flags)
- **Support:** Temporary help desk spike expected

**Option C:**
- **User Training:** Required training session (1-2 hours)
- **Documentation:** Complete user manual rewrite
- **Communication:** "New contract-based model - major improvement"
- **Rollout:** Very gradual (beta users first)
- **Support:** Extended support period (2-4 weeks)

---

## Accessibility Considerations

### Option A
- **Impact:** Minimal (terminology changes)
- **Screen Readers:** Update labels for clarity
- **Keyboard Navigation:** Unchanged
- **Color Contrast:** Add coverage type badges (ensure contrast)

### Option B
- **Impact:** Medium (removed some UI elements)
- **Screen Readers:** Simplified navigation (fewer tabs)
- **Keyboard Navigation:** Fewer elements to tab through
- **Color Contrast:** New status badges (ensure contrast)

### Option C
- **Impact:** High (new UI patterns)
- **Screen Readers:** New navigation structure (test thoroughly)
- **Keyboard Navigation:** New workflows (test all paths)
- **Color Contrast:** New visual hierarchy (test all colors)

---

## Mobile Responsiveness

### Option A
- **Impact:** None (same layouts)
- **Testing:** Ensure renamed labels fit mobile screens

### Option B
- **Impact:** Low (simplified forms)
- **Testing:** Fewer fields = better mobile experience

### Option C
- **Impact:** High (new mobile-optimized views)
- **Testing:** Complete mobile UX redesign needed

---

## Performance Considerations

### Option A
- **Queries:** Same queries (just populated with data)
- **Performance:** No change (same indexes)
- **Caching:** Same strategy

### Option B
- **Queries:** Simpler queries (removed joins)
- **Performance:** Improved (fewer tables to query)
- **Caching:** Can cache computed reach pattern

### Option C
- **Queries:** New query patterns (contract-centric)
- **Performance:** Unknown (need testing)
- **Caching:** New caching strategy needed

---

## Recommendations

### For Immediate User Relief:
**Implement Option A UX improvements first** (can be done in 1 week):
1. Rename confusing fields
2. Add tooltips and help text
3. Populate missing data
4. Add validation messages

### For Short-Term UX Gains:
**Implement Option B UX improvements** (3-4 weeks):
1. Simplify campaign creation
2. Unify worker management
3. Add data quality dashboard
4. Enhance search/filter

### For Long-Term UX Excellence:
**Plan Option C UX redesign** (6-12 months):
1. User research: Validate contract-based model
2. Prototype: Test new workflows with users
3. Iterative design: Refine based on feedback
4. Gradual rollout: Beta → Pilot → Full release

---

## Conclusion

**UX Impact Ranking:**
1. **Option C** (10/10): Best UX, highest effort
2. **Option B** (8/10): Good UX, medium effort
3. **Option A** (6/10): Minimal UX improvement, low effort

**Recommended Path:**
- **Week 1-3:** Option A (quick wins)
- **Week 4-10:** Option B (significant improvements)
- **Month 4-12:** Option C (long-term excellence)

This phased approach delivers immediate user relief while building toward an ideal long-term solution.
