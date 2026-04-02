# STREAM3_1: Overlap Analysis & Confusion Points

## Executive Summary

This document analyzes the overlaps, redundancies, and confusion points in the Offshore Alliance data model. It identifies multiple parallel mechanisms for achieving the same goals, unused tables and relationships, and terminology conflicts that create cognitive overhead for developers and users.

---

## 1. Projects vs Programs vs Campaign Universes

### 1.1 Conceptual Overlap

| Entity | Intended Purpose | Actual Implementation | Current Usage |
|--------|------------------|----------------------|---------------|
| **Projects** | Work phases at worksites | Site-level children (`projects.worksite_id`) | 16 rows, no employers/agreements linked |
| **Programs** | Multi-worksite groupings | Multi-worksite parent (`program_worksites` junction) | 3 programs, 7 worksite links |
| **Campaign Universes** | Worker targeting rules | Rule-based filtering system | Unknown usage |

### 1.2 Confusion Points

**"Project" Directionality Confusion:**

The word "project" suggests a containing entity, but the schema implements it as a contained entity:

```
Expected mental model:
  Project → [Worksite 1, Worksite 2, Worksite 3]

Actual schema:
  Worksite → [Project 1, Project 2, Project 3]
```

This was addressed by adding `programs` table, but creates NEW confusion:
- When should I create a `project`?
- When should I create a `program`?
- Can a `program` contain `projects`? (Currently NO relationship exists)
- Can a `worksite` be in both a `project` AND a `program`? (Currently YES, but unclear semantics)

**Recommendation:** Rename `projects` to `worksite_phases` or `site_projects` to clarify scope.

---

### 1.3 Campaign Universes Redundancy

**Three Parallel Mechanisms for Campaign Scope:**

1. **`campaign_universes` + `campaign_universe_rules`**
   ```sql
   -- Rule-based targeting
   campaign_universe_rules.rule_type IN ('agreement', 'worksite', 'employer', 'member_role', 'sector', 'project', 'work_type', 'onshore_offshore')
   ```

2. **`campaign_employers` + `campaign_worksites`**
   ```sql
   -- Direct linking tables
   campaign_employers(campaign_id, employer_id)
   campaign_worksites(campaign_id, worksite_id, sector_wide)
   ```

3. **Derived via Campaign Scope Field**
   ```sql
   -- campaigns table has campaign_scope field
   campaigns.campaign_scope IN ('single_employer_single_site', 'single_employer_multi_site', 'multi_employer_single_site', 'multi_employer_multi_site')
   ```

**Problem:** All three can express "campaign targets employer X at worksite Y". Which is authoritative?

**Current State:**
- `campaign_universes`: Unknown usage (not in live snapshot)
- `campaign_employers` + `campaign_worksites`: Schema exists, usage unknown
- `campaigns.campaign_scope`: Field exists, likely unused

**Recommendation:** Choose ONE mechanism and deprecate others:
- **Option A:** Keep `campaign_employers` + `campaign_worksites` (simple, explicit)
- **Option B:** Keep `campaign_universe_rules` (flexible, powerful, complex)
- **Option C:** Use `campaign_scope` + derived joins (simple but rigid)

---

## 2. Worksite Hierarchy vs Employer Hierarchy

### 2.1 Parallel Hierarchies

**Two Independent Hierarchical Systems:**

1. **Employer Hierarchy** (`employers.parent_employer_id`)
   ```
   Woodside Energy Ltd (parent)
   ├── Woodside Energy (subsidiary)
   └── Woodside Operations (subsidiary)
   ```
   - Current: 9 employers with `parent_employer_id`
   - Purpose: Corporate ownership structure

2. **Worksite Hierarchy** (`worksites.parent_worksite_id`)
   ```
   Pluto Hub (parent)
   ├── Pluto LNG (child)
   └── Pluto 2 (child)
   ```
   - Current: **ALL NULL** (0 relationships)
   - Purpose: Geographic/operational grouping

### 2.2 Hub Worksites → Programs Migration

**Historical Context:**
- Originally used "Hub" worksite type to group related sites
- Example: "Pluto Hub" contained "Pluto LNG" and "Pluto 2"
- Migration `20260331200000_hub_to_programs.sql` converted hubs to `programs`
- Explicitly cleared `parent_worksite_id` during conversion

**Confusion Point:**
- `parent_worksite_id` still exists in schema but is not used
- `programs` + `program_worksites` now used for multi-worksite grouping
- Unclear when to use hierarchical worksites vs programs

**Recommendation:**
- **Option A:** Remove `parent_worksite_id` (hierarchy not used)
- **Option B:** Document distinction (hierarchy = geographic ownership, programs = operational grouping)
- **Option C:** Add `parent_program_id` for program hierarchy

---

## 3. Agreement Scope vs Campaign Scope

### 3.1 "Scope" Terminology Collision

**Four Different "Scope" Concepts:**

| Context | Table/Column | Meaning | Values |
|---------|--------------|---------|--------|
| **Agreement Coverage** | `agreements.agreement_scope` | Geographic/organizational reach | site_specific, project_specific, sector_wide, company_wide |
| **Work Scope** | `work_scopes` table | Type of work performed | Brownfields, Maintenance, Service, Specialist |
| **Campaign Reach** | `campaigns.campaign_scope` | Employer/site combinations | single_employer_single_site, multi_employer_multi_site |
| **Work Assignment** | `worksite_scopes.engagement_type` | Contracting mode | direct_employment, contractor, subcontractor, labour_hire |

**Problem:** All use the word "scope" but mean different things.

### 3.2 Agreement Scope (Unused)

**Schema:** `agreements.agreement_scope`
- Added in migration `0010_organising_universe.sql`
- Currently **NULL for all 135 agreements**
- Cannot classify agreements by coverage type

**Impact:**
- Cannot filter agreements by "sector_wide" vs "site_specific"
- Cannot determine which agreements cover multiple worksites
- UI cannot display agreement coverage classification

**Recommendation:**
1. Populate `agreement_scope` for all agreements
2. Rename to `agreement_coverage_type` for clarity
3. Add UI to display/edit coverage classification

---

## 3.3 Campaign Scope (Unclear Usage)

**Schema:** `campaigns.campaign_scope`
- Added in migration `0013_campaign_workflow.sql`
- Four values: single/multi employer × single/multi site
- Overlaps with `campaign_employers` and `campaign_worksites` tables

**Problem:**
- `campaign_scope` is a metadata field
- `campaign_employers` + `campaign_worksites` are actual data
- Which is authoritative?

**Example Conflict:**
```sql
-- Metadata says: single_employer_single_site
UPDATE campaigns SET campaign_scope = 'single_employer_single_site' WHERE campaign_id = 1;

-- But data says: multi_employer
INSERT INTO campaign_employers (campaign_id, employer_id) VALUES (1, 2);
INSERT INTO campaign_employers (campaign_id, employer_id) VALUES (1, 3);
```

**Recommendation:**
- **Option A:** Make `campaign_scope` a computed column (derived from data)
- **Option B:** Add validation to ensure data matches metadata
- **Option C:** Remove `campaign_scope` field (derive on query)

---

## 4. "Engagement" Terminology Overloading

### 4.1 Two Different Meanings

**Worker Organising Engagement:**
```sql
workers.engagement_score -- INT: 0-100
workers.engagement_level -- VARCHAR: 'contact', 'activated', 'mobilised'
```
- Meaning: How engaged is the worker in union organising?
- Used in: Worker lists, engagement dashboards

**Contracting Engagement Mode:**
```sql
worksite_scopes.engagement_type -- VARCHAR: 'direct_employment', 'contractor', 'subcontractor', 'labour_hire'
```
- Meaning: How is the worker engaged by the employer?
- Used in: Work scope assignments, agreement coverage

**Problem:** Same word ("engagement") for orthogonal concepts.

**Impact:**
- Developer confusion: "Which engagement field do I use?"
- Query complexity: Must disambiguate by table context
- UI confusion: "Engagement" column ambiguous without context

**Recommendation:**
- Rename `worksite_scopes.engagement_type` to `employment_type` or `contract_type`
- Keep `workers.engagement_*` fields as-is (organising context is clear)

---

## 5. Principal Employer Complexity

### 5.1 Four Parallel Mechanisms

**1. Worksites Principal Employer:**
```sql
worksites.principal_employer_id → employers.employer_id
```
- Current: 31/39 worksites have principal employer set
- Meaning: Asset owner for this worksite

**2. Employers Parent Company:**
```sql
employers.parent_employer_id → employers.employer_id
```
- Current: 9/70 employers have parent set
- Meaning: Corporate ownership hierarchy

**3. Employer Category Tag:**
```sql
employers.employer_category = 'Principal_Employer'
```
- Current: 7 employers have this category
- Meaning: Classified as principal employer type

**4. Programs Principal Employer:**
```sql
programs.principal_employer_id → employers.employer_id
```
- Current: 3/3 programs have principal employer set
- Meaning: Primary employer for multi-worksite program

### 5.2 Principal Employer Blind Spot

**Critical Issue:**
- `worksites.principal_employer_id` is set for 31 worksites
- **NONE** of those principal employers appear in `employer_worksite_roles`
- UI "Employers" tab at worksite does NOT show principal employer
- Only shows: Owner, Operator, Principal_Contractor, Subcontractor, Labour_Hire, Other

**Example:**
```sql
-- Worksites table says:
SELECT worksite_name, principal_employer_id FROM worksites WHERE worksite_name = 'Pluto LNG';
-- Result: principal_employer_id = 1 (Woodside)

-- But employer_worksite_roles says:
SELECT * FROM employer_worksite_roles WHERE worksite_id = 1 AND employer_id = 1;
-- Result: 0 rows (Woodside not listed as employer at this site)
```

**Impact:**
- UI cannot display principal employer in Employers tab
- Reporting cannot include principal employer in employer counts
- Data quality checks cannot validate principal employer consistency

**Recommendation:**
- **Option A:** Add principal employers to `employer_worksite_roles` with role_type = 'Principal_Employer'
- **Option B:** Create separate UI display for principal employer (outside employer_worksite_roles)
- **Option C:** Deprecate `worksites.principal_employer_id` and derive from `employer_worksite_roles`

---

## 6. Unused Junction Tables

### 6.1 Project Junction Tables (Empty)

**`project_employers`:**
- Purpose: Link employers to projects with role types
- Current rows: **0**
- Projects exist: 16
- Impact: Projects have no employer context

**`project_agreements`:**
- Purpose: Link agreements to projects
- Current rows: **0**
- Projects exist: 16
- Impact: Projects have no agreement context

**`workers.project_id`:**
- Purpose: Link workers to projects
- Current rows: **0** (all NULL)
- Workers exist: 0 (based on snapshot)
- Impact: Cannot report workers by project

**Root Cause:** Projects table created but no workflow to populate junctions.

**Recommendation:**
- **Option A:** Backfill data for existing projects
- **Option B:** Remove junction tables if not needed
- **Option C:** Add workflow to populate when creating projects

---

### 6.2 Agreement Junction Tables (Unused)

**`agreement_employers`:**
- Purpose: Link additional employers to agreements
- Current rows: **0**
- Agreements exist: 135
- Primary mechanism: `agreements.employer_id` (single employer)
- Impact: Cannot model multi-employer agreements

**Current Model:**
```sql
agreements.employer_id -- Single primary employer
agreement_employers -- Additional employers (UNUSED)
```

**Problem:** Some agreements cover multiple employers (e.g., sector-wide EBAs). Schema supports this but unused.

**Recommendation:**
- Populate `agreement_employers` for multi-employer agreements
- Update UI to display all covered employers
- Add validation to ensure consistency

---

## 7. Worker-Campaign Connection Overlap

### 7.1 Three Parallel Mechanisms

**1. Direct Membership Table:**
```sql
campaign_worker_membership(campaign_id, worker_id, oa_leader_role)
```
- Purpose: Direct worker-campaign linkage
- Includes leader role: delegate, activist, contact

**2. Via Organising Units:**
```sql
campaign_organising_units(campaign_id, ou_type, name)
campaign_worker_ou(ou_id, worker_id, is_primary)
```
- Purpose: Group workers into units within campaigns
- Supports: shift, department, network, job_type, worksite

**3. Connection Table (New):**
```sql
worker_campaign_connections(worker_id, campaign_id, connection_status, ...)
```
- Added: 2026-04-02 (migration `20260402170000_worker_campaign_connections.sql`)
- Purpose: Rich worker-campaign tracking with engagement metrics
- Supports: service employers, job_title, activity tracking, support levels

### 7.2 Overlap Analysis

**All three tables link workers to campaigns.**

| Mechanism | Strengths | Weaknesses | When to Use |
|-----------|-----------|------------|-------------|
| `campaign_worker_membership` | Simple, leader roles | Limited metadata | Basic member tracking |
| `campaign_worker_ou` | Organizing structure | Complex joins | Structured organizing |
| `worker_campaign_connections` | Rich metadata, activity tracking | New, untested | Full engagement tracking |

**Problem:** Unclear which table to use for what purpose.

**Recommendation:**
- **Option A:** Consolidate to one table (add columns to `worker_campaign_connections`)
- **Option B:** Document distinct purposes (membership vs structure vs engagement)
- **Option C:** Create view to unify all three for queries

---

## 8. Organising Units vs Campaign Universes

### 8.1 Conceptual Overlap

**Campaign Universes:**
- Purpose: Define WHICH workers are in scope for campaign
- Mechanism: Rule-based filtering by agreement, worksite, employer, etc.
- Output: Set of workers matching criteria

**Campaign Organising Units:**
- Purpose: Structure HOW workers are organized within campaign
- Mechanism: Manual grouping by shift, department, network, job_type, worksite
- Output: Hierarchical groups with leaders

**Question:** Are OUs subsets of universes? Independent structures? Overlapping?

**Example Scenario:**
```
Campaign: "Offshore Mobilization 2026"

Universe: "All workers on Pluto LNG and Wheatstone"
  → 500 workers

Organizing Units:
  - "Pluto Day Shift" (50 workers)
  - "Pluto Night Shift" (50 workers)
  - "Wheatstone Day Shift" (100 workers)
  - "Marine Officers Network" (30 workers, cross-site)
```

**Unclear:**
- Are all OU members required to be in the universe?
- Can a worker be in multiple OUs?
- Can a worker be in an OU but NOT in the universe?

**Recommendation:**
1. Document relationship: OUs are subsets of universes
2. Add validation: `campaign_worker_ou` workers must be in universe
3. Add UI to show universe → OU hierarchy

---

## 9. Planning vs Execution Disconnect

### 9.1 Strategic Planning Tables

**Campaign Stage Plans:**
```sql
campaign_stage_plans(campaign_id, stage_number, status)
  → plan_ambitions
  → plan_where_to_play
  → plan_theory_of_winning
  → plan_capacities
  → plan_management_systems
```

**Purpose:** Strategic planning across 6 stages (Playing to Win framework)

### 9.2 Operational Execution Tables

**Campaign Activities:**
```sql
campaign_activities(campaign_id, activity_kind, is_custom)
  → campaign_activity_ratings(worker_id, rating, notes)
```

**Task Lists:**
```sql
campaign_task_lists(campaign_id, activity_id, leader_worker_id)
  → campaign_task_list_items(worker_id)
```

**Purpose:** Operational execution - tasks, assessments, ratings

### 9.3 The Gap

**Problem:** No connection between planning and execution.

**Examples:**
- Plan: "Achieve 80% response rate to intro comms" (ambition)
- Execute: Send emails via Action Network (activity)
- **Missing:** Link showing this activity supports that ambition

**Plan: "Identify 20 potential contacts on site" (ambition)**
**Execute: "Conduct 1-on-1 conversations" (activity)**
**Missing:** Connection showing activities contribute to ambitions

**Recommendation:**
- Add `ambition_id` FK to `campaign_activities`
- Create `plan_activities` junction table (many-to-many)
- Add reporting view: ambitions → supporting activities → outcomes

---

## 10. Summary of Critical Confusions

### Top 10 Confusion Points

1. **Projects vs Programs:** When to use which? (Directionality confusion)
2. **Campaign Scope:** Three parallel mechanisms, unclear which is authoritative
3. **Scope Terminology:** Four different meanings for "scope"
4. **Principal Employer:** Four parallel mechanisms, UI blind spot
5. **Worker-Campaign Links:** Three parallel tables, unclear when to use each
6. **Engagement Overloading:** Same word for organising vs contracting concepts
7. **Unused Junction Tables:** Schema exists but no data/workflow
8. **Worksite Hierarchy:** Schema exists but all NULL, unclear purpose
9. **Agreement Scope:** Classification unused, all NULL
10. **Planning vs Execution:** No connection between strategic plans and operational activities

---

## 11. Priority Recommendations

### Immediate (Data Quality)

1. **Populate `project_employers` and `project_agreements`** for existing 16 projects
2. **Set `agreements.agreement_scope`** for all 135 agreements
3. **Add principal employers to `employer_worksite_roles`** or create separate UI display
4. **Choose ONE campaign scope mechanism** and deprecate others

### Short-Term (Clarity)

5. **Rename "engagement_type" to "employment_type"** in `worksite_scopes`
6. **Rename `projects` to `worksite_phases`** or `site_projects`
7. **Document distinction between programs and projects**
8. **Add validation** to ensure data consistency across redundant tables

### Long-Term (Strategic)

9. **Consolidate worker-campaign connections** to single table
10. **Connect planning to execution** with ambition-activity links
11. **Decide on worksite hierarchy**: Implement or remove `parent_worksite_id`
12. **Create unified "scope" vocabulary**: Rename to disambiguate concepts

---

## Appendix A: Redundancy Matrix

| Goal | Mechanism 1 | Mechanism 2 | Mechanism 3 | Recommendation |
|------|-------------|-------------|-------------|----------------|
| Campaign targets employers | `campaign_universe_rules` (rule_type='employer') | `campaign_employers` | Derived via worksites | Keep `campaign_employers` |
| Campaign targets worksites | `campaign_universe_rules` (rule_type='worksite') | `campaign_worksites` | Derived via employers | Keep `campaign_worksites` |
| Worker in campaign | `campaign_worker_membership` | `campaign_worker_ou` | `worker_campaign_connections` | Consolidate to connections |
| Employer at worksite | `employer_worksite_roles` | `worksites.principal_employer_id` | `worksites.operator_id` | Keep all, document roles |
| Agreement coverage | `agreements.agreement_scope` | `agreement_scopes` | `agreement_worksites` | Rename to disambiguate |
| Multi-worksite grouping | `programs` + `program_worksites` | `worksites.parent_worksite_id` | N/A | Remove `parent_worksite_id` |
| Project classification | `projects.work_type` | `project_employers.role_type` | N/A | Keep both, document |
| Worker organizing level | `workers.engagement_level` | `campaign_worker_membership.oa_leader_role` | N/A | Keep both, document |

---

## Appendix B: Empty/Unused Table Inventory

| Table | Purpose | Current Rows | Expected Rows | Impact |
|-------|---------|--------------|---------------|--------|
| `project_employers` | Link projects to employers | 0 | ~50 | Projects lack employer context |
| `project_agreements` | Link projects to agreements | 0 | ~20 | Projects lack agreement context |
| `agreement_employers` | Multi-employer agreements | 0 | ~30 | Cannot model multi-employer EBAs |
| `worksite_scopes` | Work scope assignments | 2 | ~100 | Work scope system unused |
| `workers.project_id` | Link workers to projects | 0 (all NULL) | ~500 | No project-level reporting |
| `worksites.parent_worksite_id` | Worksite hierarchy | 0 (all NULL) | ~10 | Hierarchy not implemented |
| `agreements.agreement_scope` | Agreement coverage | 0 (all NULL) | 135 | Cannot classify agreements |

**Total Unused Relationships:** 7 critical tables/columns with zero or minimal usage.
