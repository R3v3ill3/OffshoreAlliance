# STREAM3_1: Executive Summary - Projects, Programs & Hierarchies Analysis

## Overview

This 1-week analysis project mapped and analyzed the current entity relationships in the Offshore Alliance database, focusing on confusion points between Projects, Programs, Campaign Universes, and hierarchical structures. The analysis reveals significant overlap, unused tables, and conceptual confusion that impacts data management, user experience, and system maintainability.

---

## Key Findings

### Critical Issues Discovered

1. **Inverted Project Model:** The `projects` table is structured as a child of worksites (`projects.worksite_id`), contradicting the mental model of "multi-worksite projects." This was partially addressed by adding the `programs` table, but confusion remains about when to use each.

2. **Three Parallel Campaign Scope Mechanisms:** Campaigns can target workers via:
   - `campaign_universe_rules` (rule-based filtering)
   - `campaign_employers` + `campaign_worksites` (direct tables)
   - `campaigns.campaign_scope` (metadata field)
   All three can express "campaign targets employer X at worksite Y" - unclear which is authoritative.

3. **Unused Junction Tables:** Critical tables are completely empty:
   - `project_employers` (0 rows) - Projects have no employer context
   - `project_agreements` (0 rows) - Projects have no agreement context
   - `agreement_employers` (0 rows) - Cannot model multi-employer agreements
   - `workers.project_id` (all NULL) - No project-level worker tracking

4. **Worksite Hierarchy Not Implemented:** The `worksites.parent_worksite_id` column exists but is NULL for all 39 worksites. Migration `20260331200000_hub_to_programs.sql` explicitly cleared these values when converting hub worksites to programs.

5. **Agreement Scope Unused:** All 135 agreements have NULL `agreement_scope` values, preventing classification by coverage type (site_specific, sector_wide, etc.).

6. **"Scope" Terminology Collision:** The word "scope" means four different things:
   - `agreements.agreement_scope` (coverage classification)
   - `agreement_scopes` table (work scope taxonomy links)
   - `worksite_scopes.engagement_type` (contracting mode)
   - `campaigns.campaign_scope` (campaign reach pattern)

7. **"Engagement" Terminology Overloading:** Same word for different concepts:
   - `workers.engagement_score` (organising engagement)
   - `worksite_scopes.engagement_type` (contracting mode)

8. **Principal Employer Blind Spot:** 31/39 worksites have `principal_employer_id` set, but NONE of those principal employers appear in `employer_worksite_roles`, creating a UI blind spot where the Employers tab cannot show the asset owner.

---

## Data Model Confusion Points

### Projects vs Programs vs Campaign Universes

| Entity | Purpose | Current Usage | Confusion |
|--------|---------|---------------|-----------|
| **Projects** | Site-level work phases | 16 rows, no employers/agreements linked | Named "projects" but structured as worksite children |
| **Programs** | Multi-worksite groupings | 3 programs, 7 worksite links | Unclear when to use vs projects |
| **Campaign Universes** | Worker targeting rules | Unknown usage | Redundant with direct campaign tables |

### Worksite Hierarchy vs Employer Hierarchy

**Two Independent Hierarchical Systems:**
- `employers.parent_employer_id`: 9/70 employers have parent set (corporate ownership)
- `worksites.parent_worksite_id`: 0/39 worksites have parent set (all NULL)

**Migration History:** Hub worksites converted to programs, hierarchy deliberately abandoned.

### Agreement Scope vs Campaign Scope

**Four Different "Scope" Concepts:**
1. `agreements.agreement_scope` - Geographic/organizational reach (currently all NULL)
2. `work_scopes` table - Type of work performed
3. `campaigns.campaign_scope` - Employer/site combinations
4. `worksite_scopes.engagement_type` - Contracting mode

---

## Analysis Documents

Four comprehensive markdown documents have been created:

### 1. STREAM3_1_ENTITY_RELATIONSHIPS.md
**Contents:**
- Complete entity relationship diagram (Mermaid format)
- Detailed table descriptions and purposes
- Current relationship mappings
- Data flow documentation
- Gap analysis (empty/unused tables)
- Key findings summary

**Key Insight:** Schema supports rich relationships but most are unused or empty.

### 2. STREAM3_1_OVERLAP_ANALYSIS.md
**Contents:**
- Projects vs Programs vs Campaign Universes comparison
- Worksite hierarchy vs Employer hierarchy analysis
- Agreement scope vs Campaign scope confusion
- "Engagement" terminology overloading
- Principal employer complexity (4 parallel mechanisms)
- Unused junction tables inventory
- Worker-campaign connection overlap (3 parallel tables)
- Planning vs execution disconnect

**Key Insight:** Multiple redundant mechanisms for same goals, creating confusion.

### 3. STREAM3_1_RECOMMENDATIONS.md
**Contents:**
- **Option A (Minimal Changes):** Rename for clarity, populate missing data, add validation. 3 weeks, low risk.
- **Option B (Moderate Restructuring):** Consolidate redundant mechanisms, add missing relationships. 7 weeks, medium risk.
- **Option C (Complete Redesign):** Contracts-based data model. 16 weeks, high risk.
- Detailed migration paths for each option
- Impact analysis on existing data
- Pros/cons comparison
- Decision framework

**Key Insight:** Hybrid approach recommended (A → B → C over 6 months).

### 4. STREAM3_1_UX_IMPACT.md
**Contents:**
- Campaign creation workflow changes for each option
- Worksite detail page improvements
- Project display enhancements
- Agreement coverage visualization
- Search and filtering enhancements
- Dashboard display improvements
- User scenario walkthroughs
- Implementation UX considerations
- Accessibility and mobile responsiveness
- Performance considerations

**Key Insight:** Option C delivers best UX (10/10) but requires 4 months; Option B delivers good UX (8/10) in 7 weeks.

---

## Three Solution Options

### Option A: Minimal Changes (Clarify Existing)
**Philosophy:** Fix confusion without breaking existing structures

**Changes:**
- Rename `projects` → `site_projects`
- Rename `engagement_type` → `employment_type`
- Rename `agreement_scope` → `coverage_type`
- Populate missing data (project_employers, project_agreements, agreement_scope)
- Add principal employers to employer_worksite_roles
- Add validation constraints

**Timeline:** 3 weeks
**Risk:** Low
**UX Improvement:** 6/10
**Best For:** Short-term clarity while planning larger redesign

### Option B: Moderate Restructuring
**Philosophy:** Consolidate redundant mechanisms and clarify conceptual model

**Changes:**
- Deprecate `campaign_universe_rules` (use direct tables)
- Consolidate worker-campaign connections to single table
- Remove `parent_worksite_id` from worksites
- Rename `agreement_scopes` → `agreement_work_scopes`
- Add missing relationships (programs→projects, planning→execution)
- Populate all missing data

**Timeline:** 7 weeks
**Risk:** Medium
**UX Improvement:** 8/10
**Best For:** Medium-term health and maintainability

### Option C: Complete Redesign
**Philosophy:** Start from first principles - what SHOULD the data model be?

**Changes:**
- Introduce `contracts` table as central entity
- Contract-centric model: employers ← contracts → worksites
- `contract_workers` table for worker assignments
- `operational_groups` table (replaces projects/programs confusion)
- Simplified campaign targeting (via contracts)
- Rich worker history tracking

**Timeline:** 16 weeks (4 months)
**Risk:** High
**UX Improvement:** 10/10
**Best For:** Long-term architectural excellence

---

## Recommended Approach: Hybrid Path

**Combine Options A + B, defer C:**

### Phase 1: Immediate Relief (Option A - 3 weeks)
- Rename for clarity
- Populate missing data
- Add validation
- Unblock developers

### Phase 2: Short-Term Health (Option B - 7 weeks)
- Consolidate campaign scope (remove universe_rules)
- Consolidate worker connections
- Remove worksite hierarchy
- Add missing relationships

### Phase 3: Long-Term Excellence (Option C - 4-6 months)
- Plan contracts-based model
- Design migration path
- Build in parallel
- Gradual rollout

**Total Timeline:** 6 months (with progressive improvement)

---

## Critical Data Quality Issues

### Immediate Actions Required

1. **Populate `project_employers`** for 16 existing projects
2. **Populate `project_agreements`** for 16 existing projects
3. **Set `agreements.agreement_scope`** for all 135 agreements
4. **Add principal employers** to `employer_worksite_roles` or create separate UI display
5. **Choose ONE campaign scope mechanism** and deprecate others

### Data Gap Summary

| Table | Expected Rows | Actual Rows | Gap |
|-------|---------------|-------------|-----|
| `project_employers` | ~50 | 0 | 100% missing |
| `project_agreements` | ~20 | 0 | 100% missing |
| `agreement_employers` | ~30 | 0 | 100% missing |
| `workers.project_id` | ~500 | 0 | 100% missing |
| `agreements.agreement_scope` | 135 | 0 | 100% missing |

---

## User Impact Assessment

### Current User Pain Points

1. **Campaign Creation:** Confusing - three parallel scope mechanisms
2. **Project Display:** Empty - no employer/agreement context
3. **Worker Search:** Limited - cannot filter by project
4. **Agreement Display:** Unclear - cannot see coverage type
5. **Principal Employer:** Invisible - blind spot in UI
6. **Worker Profiles:** Fragmented - scattered across tabs
7. **Dashboard:** Empty sections - projects data missing

### After Option A (Minimal Changes)
- **Campaign Creation:** Clarified (computed reach pattern)
- **Project Display:** Populated (shows employers/agreements)
- **Worker Search:** Enhanced (project filter works)
- **Agreement Display:** Improved (coverage badge)
- **Principal Employer:** Visible (added to employer list)
- **Dashboard:** Complete (no empty sections)

### After Option B (Moderate Restructuring)
- **Campaign Creation:** Simplified (single mechanism)
- **Worker Management:** Unified (one connection table)
- **Terminology:** Disambiguated (removed collisions)
- **Data Quality:** Visible (health metrics dashboard)

### After Option C (Complete Redesign)
- **Campaign Creation:** Streamlined (3 steps vs 6)
- **Worker Profiles:** Complete (contract-centric)
- **Dashboard:** Comprehensive (contract-based metrics)
- **Search:** Powerful (saved searches, bulk actions)
- **Data Entry:** Efficient (unified forms)

---

## Decision Framework

### Choose Option A If:
- Need clarity in < 1 month
- Limited development resources
- Want minimal risk
- Planning larger redesign later

### Choose Option B If:
- Can dedicate 6-8 weeks
- Want to remove redundancy
- Want medium-term improvement
- Can afford some breaking changes

### Choose Option C If:
- Want best possible architecture
- Can dedicate 4-6 months
- Doing major version upgrade
- Want to scale significantly

---

## Next Steps

### Immediate (This Week)
1. **Stakeholder Workshop:** Present findings, get feedback
2. **Decision Meeting:** Choose option (or hybrid approach)
3. **Resource Planning:** Assign team members

### Short-Term (Next 2 Weeks)
4. **Planning Session:** Detailed implementation plan
5. **Risk Assessment:** Mitigation strategies
6. **Begin Execution:** Start with chosen option

### Medium-Term (Next 2 Months)
7. **Complete Option A:** Minimal changes
8. **Complete Option B:** Moderate restructuring
9. **User Training:** Support changes

### Long-Term (Next 4-6 Months)
10. **Plan Option C:** Design contracts-based model
11. **Prototype:** Validate with users
12. **Implement:** Gradual rollout

---

## Success Metrics

### Data Quality Metrics
- Projects with employers: 0% → 100%
- Projects with agreements: 0% → 100%
- Agreements with coverage: 0% → 100%
- Workers with project: 0% → 80%+
- Principal employers visible: 0% → 100%

### User Experience Metrics
- Campaign creation time: Measure improvement
- Worker search efficiency: Track filter usage
- User satisfaction: Survey before/after
- Support tickets: Track reduction in confusion-related tickets

### System Performance Metrics
- Query performance: Monitor impact of changes
- Page load times: Ensure no degradation
- Mobile responsiveness: Test all workflows

---

## Conclusion

The Offshore Alliance platform has a solid foundation but suffers from:
1. **Unused relationships** (schema exists, data doesn't)
2. **Redundant mechanisms** (3 ways to do same thing)
3. **Terminology confusion** (same word, different meanings)
4. **Conceptual gaps** (missing central entity like "contracts")

**Recommendation:** Implement hybrid approach (A → B → C) over 6 months to deliver progressive improvement while building toward ideal long-term architecture.

**Expected Outcomes:**
- **Immediate** (3 weeks): Clearer terminology, populated data
- **Short-term** (10 weeks): Removed redundancy, unified workflows
- **Long-term** (6 months): Contract-based model, streamlined UX

This phased approach manages risk while delivering continuous user value and building toward an excellent long-term solution.

---

## Analysis Deliverables

All analysis documents are available in the repository root:

1. **STREAM3_1_ENTITY_RELATIONSHIPS.md** - Complete ER diagram and data flow
2. **STREAM3_1_OVERLAP_ANALYSIS.md** - Redundancy and confusion analysis
3. **STREAM3_1_RECOMMENDATIONS.md** - Three solution options with migration plans
4. **STREAM3_1_UX_IMPACT.md** - User experience impact assessment
5. **STREAM3_1_EXECUTIVE_SUMMARY.md** - This document

**Analysis Completed:** April 2, 2026
**Analyst:** Planning Agent 3.1 (Projects, Programs & Hierarchies)
**Repository:** Offshore Alliance Platform
**Working Directory:** /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance
