# STREAM3_1: Data Model Recommendations

## Executive Summary

This document presents three options for resolving the entity relationship confusion in the Offshore Alliance platform, ranging from minimal changes to complete redesign. Each option includes proposed schema changes, migration paths, impact analysis, and implementation complexity assessments.

---

## Option A: Minimal Changes (Clarify Existing)

### Philosophy

"Fix the confusion without breaking existing structures." Focus on:
1. Populating unused tables/columns
2. Adding clear documentation
3. Renaming for clarity
4. Adding validation rules
5. **No major schema restructuring**

### A1. Proposed Schema Changes

#### A1.1. Rename for Clarity

```sql
-- Rename "projects" to clarify it's site-level
ALTER TABLE projects RENAME TO site_projects;

-- Rename "engagement_type" to disambiguate from worker engagement
ALTER TABLE worksite_scopes RENAME COLUMN engagement_type TO employment_type;

-- Rename agreement scope to coverage type
ALTER TABLE agreements RENAME COLUMN agreement_scope TO coverage_type;

-- Rename campaign scope to reach_pattern
ALTER TABLE campaigns RENAME COLUMN campaign_scope TO reach_pattern;
```

#### A1.2. Populate Critical Missing Data

```sql
-- 1. Set agreement coverage for all agreements
-- Need business rules: Which agreements are sector_wide vs site_specific?

-- Example based on agreement_worksites count:
UPDATE agreements
SET coverage_type = CASE
  WHEN (SELECT COUNT(*) FROM agreement_worksites WHERE agreement_id = agreements.agreement_id) > 3
    THEN 'sector_wide'
  WHEN (SELECT COUNT(*) FROM agreement_worksites WHERE agreement_id = agreements.agreement_id) = 1
    THEN 'site_specific'
  ELSE 'project_specific'
END
WHERE coverage_type IS NULL;

-- 2. Backfill project_employers from employer_worksite_roles
INSERT INTO project_employers (project_id, employer_id, role_type, is_current)
SELECT
  p.project_id,
  ewr.employer_id,
  ewr.role_type,
  true
FROM site_projects p
JOIN employer_worksite_roles ewr ON ewr.worksite_id = p.worksite_id
WHERE ewr.is_current = true
ON CONFLICT (project_id, employer_id, role_type) DO NOTHING;

-- 3. Backfill project_agreements from agreement_worksites
INSERT INTO project_agreements (project_id, agreement_id)
SELECT DISTINCT
  p.project_id,
  aw.agreement_id
FROM site_projects p
JOIN agreement_worksites aw ON aw.worksite_id = p.worksite_id
ON CONFLICT (project_id, agreement_id) DO NOTHING;

-- 4. Add principal employers to employer_worksite_roles
INSERT INTO employer_worksite_roles (worksite_id, employer_id, role_type, is_current, notes)
SELECT
  worksite_id,
  principal_employer_id,
  'Principal_Employer',
  true,
  'Asset owner - added via migration'
FROM worksites
WHERE principal_employer_id IS NOT NULL
ON CONFLICT (worksite_id, employer_id, role_type) DO NOTHING;
```

#### A1.3. Add Validation Constraints

```sql
-- Ensure campaign reach pattern matches actual data
ALTER TABLE campaigns ADD CONSTRAINT validate_reach_pattern
CHECK (
  (reach_pattern = 'single_employer_single_site' AND
    (SELECT COUNT(*) FROM campaign_employers WHERE campaign_id = campaigns.campaign_id) = 1 AND
    (SELECT COUNT(*) FROM campaign_worksites WHERE campaign_id = campaigns.campaign_id AND sector_wide = false) = 1)
  OR
  (reach_pattern = 'single_employer_multi_site' AND
    (SELECT COUNT(*) FROM campaign_employers WHERE campaign_id = campaigns.campaign_id) = 1 AND
    (SELECT COUNT(*) FROM campaign_worksites WHERE campaign_id = campaigns.campaign_id AND sector_wide = false) > 1)
  OR
  (reach_pattern = 'multi_employer_single_site' AND
    (SELECT COUNT(*) FROM campaign_employers WHERE campaign_id = campaigns.campaign_id) > 1 AND
    (SELECT COUNT(*) FROM campaign_worksites WHERE campaign_id = campaigns.campaign_id AND sector_wide = false) = 1)
  OR
  (reach_pattern = 'multi_employer_multi_site' AND
    (SELECT COUNT(*) FROM campaign_employers WHERE campaign_id = campaigns.campaign_id) > 1 AND
    (SELECT COUNT(*) FROM campaign_worksites WHERE campaign_id = campaigns.campaign_id AND sector_wide = false) > 1)
  OR
  reach_pattern IS NULL
);

-- Add comments for documentation
COMMENT ON TABLE site_projects IS 'Site-level work phases (construction, operations, maintenance). Child of worksite, not multi-worksite container.';
COMMENT ON TABLE programs IS 'Multi-worksite groupings (top-level projects). Contains multiple worksites via program_worksites.';
COMMENT ON COLUMN campaigns.reach_pattern IS 'Campaign reach pattern: single/multi employer × single/multi site. Must match campaign_employers and campaign_worksites data.';
COMMENT ON COLUMN agreements.coverage_type IS 'Agreement coverage classification: site_specific, project_specific, sector_wide, company_wide.';
COMMENT ON COLUMN worksite_scopes.employment_type IS 'Employment type: direct_employment, contractor, subcontractor, labour_hire. NOT worker organising engagement.';
```

### A2. Migration Path

**Phase 1: Data Backfill (1 week)**
1. Business rules workshop: Define agreement coverage classification
2. Backfill `agreements.coverage_type`
3. Backfill `project_employers` from `employer_worksite_roles`
4. Backfill `project_agreements` from `agreement_worksites`
5. Add principal employers to `employer_worksite_roles`

**Phase 2: Schema Renaming (1 week)**
6. Rename tables/columns (see A1.1)
7. Update all TypeScript types
8. Update all UI references
9. Update all queries and views

**Phase 3: Validation & Documentation (1 week)**
10. Add validation constraints
11. Add table/column comments
12. Create data dictionary document
13. Update UI tooltips and help text

### A3. Impact on Existing Data

**No Data Loss:** All renaming is non-destructive

**Data Enrichment:**
- `project_employers`: ~50 new rows (estimated)
- `project_agreements`: ~20 new rows (estimated)
- `employer_worksite_roles`: ~31 new rows (principal employers)
- `agreements.coverage_type`: 135 rows populated

**Data Quality Improvements:**
- Projects now have employer and agreement context
- Worksites show principal employers in UI
- Agreements classified by coverage type

### A4. Implementation Complexity

**Low Complexity:**
- No schema restructuring
- No data migration (only backfill)
- No new tables
- No relationship changes

**Effort:**
- Backend: 3 person-days (SQL changes, migrations)
- Frontend: 5 person-days (type updates, UI text changes)
- Testing: 3 person-days (regression testing)
- Documentation: 2 person-days

**Total: ~3 weeks**

### A5. Pros & Cons

**Pros:**
- Minimal disruption to existing code
- Low risk of data corruption
- Fast implementation
- Preserves all existing relationships
- No retraining required for users

**Cons:**
- Doesn't resolve underlying confusion
- Three parallel campaign scope mechanisms remain
- Worker-campaign connection tables remain redundant
- Projects vs programs confusion persists
- "Scope" terminology collision remains

**Best For:** Short-term clarity while planning larger redesign.

---

## Option B: Moderate Restructuring

### Philosophy

"Consolidate redundant mechanisms and clarify conceptual model." Focus on:
1. **Choose ONE mechanism per purpose** (remove redundancy)
2. Add missing relationships
3. Restructure for clarity
4. Maintain backward compatibility where possible

### B1. Proposed Schema Changes

#### B1.1. Campaign Scope Consolidation

**Decision:** Use `campaign_employers` + `campaign_worksites` as authoritative source. Remove `campaign_universe_rules`.

```sql
-- 1. Migrate campaign_universe_rules to direct tables
INSERT INTO campaign_employers (campaign_id, employer_id)
SELECT DISTINCT
  cur.universe_id::integer, -- Hack: needs proper migration
  cur.rule_entity_id
FROM campaign_universe_rules cur
WHERE cur.rule_type = 'employer'
ON CONFLICT (campaign_id, employer_id) DO NOTHING;

INSERT INTO campaign_worksites (campaign_id, worksite_id, sector_wide)
SELECT DISTINCT
  cur.universe_id::integer,
  cur.rule_entity_id,
  false
FROM campaign_universe_rules cur
WHERE cur.rule_type = 'worksite'
ON CONFLICT (campaign_id, worksite_id) WHERE worksite_id IS NOT NULL DO NOTHING;

-- 2. Deprecate campaign_universes and campaign_universe_rules
ALTER TABLE campaign_universes SET SCHEMA deprecated;
ALTER TABLE campaign_universe_rules SET SCHEMA deprecated;

-- 3. Make campaigns.reach_pattern a computed column
ALTER TABLE campaigns DROP COLUMN IF EXISTS reach_pattern;

CREATE OR REPLACE FUNCTION compute_campaign_reach_pattern(p_campaign_id INT)
RETURNS VARCHAR AS $$
DECLARE
  v_employer_count INT;
  v_worksite_count INT;
BEGIN
  SELECT COUNT(DISTINCT employer_id) INTO v_employer_count
  FROM campaign_employers
  WHERE campaign_id = p_campaign_id;

  SELECT COUNT(DISTINCT worksite_id) INTO v_worksite_count
  FROM campaign_worksites
  WHERE campaign_id = p_campaign_id AND sector_wide = false;

  RETURN CASE
    WHEN v_employer_count = 1 AND v_worksite_count = 1 THEN 'single_employer_single_site'
    WHEN v_employer_count = 1 AND v_worksite_count > 1 THEN 'single_employer_multi_site'
    WHEN v_employer_count > 1 AND v_worksite_count = 1 THEN 'multi_employer_single_site'
    WHEN v_employer_count > 1 AND v_worksite_count > 1 THEN 'multi_employer_multi_site'
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql;

-- Add to campaigns view, not table
CREATE OR REPLACE VIEW campaigns_with_reach AS
SELECT *,
  compute_campaign_reach_pattern(campaign_id) AS reach_pattern
FROM campaigns;
```

#### B1.2. Worker-Campaign Connection Consolidation

**Decision:** Consolidate to `worker_campaign_connections` (newest, richest schema).

```sql
-- 1. Migrate campaign_worker_membership to worker_campaign_connections
INSERT INTO worker_campaign_connections (
  worker_id, campaign_id, connection_status,
  joined_at, membership_number, notes
)
SELECT
  worker_id,
  campaign_id,
  CASE
    WHEN oa_leader_role IN ('delegate', 'activist') THEN 'engaged'
    ELSE 'member'
  END,
  created_at,
  NULL::TEXT,
  'Migrated from campaign_worker_membership. Leader role: ' || COALESCE(oa_leader_role, 'none')
FROM campaign_worker_membership
ON CONFLICT (worker_id, campaign_id) DO NOTHING;

-- 2. Migrate campaign_worker_ou to worker_campaign_connections
-- Note: OUs become tags in connections
INSERT INTO worker_campaign_connections (
  worker_id, campaign_id, connection_status,
  notes, tags
)
SELECT
  w.worker_id,
  ou.campaign_id,
  'engaged',
  'Member of organising unit: ' || ou.name,
  ARRAY['ou:' || ou.ou_type || ':' || ou.name]
FROM campaign_worker_ou w
JOIN campaign_organising_units ou ON ou.ou_id = w.ou_id
ON CONFLICT (worker_id, campaign_id) DO UPDATE SET
  tags = array_cat(worker_campaign_connections.tags, EXCLUDED.tags);

-- 3. Deprecate old tables
ALTER TABLE campaign_worker_membership SET SCHEMA deprecated;
ALTER TABLE campaign_worker_ou SET SCHEMA deprecated;
ALTER TABLE campaign_organising_units SET SCHEMA deprecated;
```

#### B1.3. Worksite Hierarchy Decision

**Decision:** Remove `parent_worksite_id` (not used, unclear semantics). Use `programs` for all multi-worksite grouping.

```sql
-- 1. Confirm all NULL (should already be true)
SELECT COUNT(*) FROM worksites WHERE parent_worksite_id IS NOT NULL;
-- Expected: 0

-- 2. Drop column
ALTER TABLE worksites DROP COLUMN IF EXISTS parent_worksite_id;

-- 3. Update programs documentation
COMMENT ON TABLE programs IS 'Multi-worksite groupings. This is the ONLY mechanism for grouping worksites. Worksites do not have hierarchical relationships.';
```

#### B1.4. Agreement Scope Clarification

**Decision:** Rename `agreement_scopes` to `agreement_work_scopes` to distinguish from coverage.

```sql
ALTER TABLE agreement_scopes RENAME TO agreement_work_scopes;

COMMENT ON TABLE agreement_work_scopes IS 'Links agreements to work scope taxonomy (what work types are covered). NOT coverage classification (site/sector/company).';
COMMENT ON COLUMN agreements.coverage_type IS 'Agreement coverage classification: site_specific, project_specific, sector_wide, company_wide.';
```

#### B1.5. Add Missing Relationships

```sql
-- Connect programs to projects
ALTER TABLE site_projects ADD COLUMN program_id INT REFERENCES programs(program_id);

-- Connect planning to execution
ALTER TABLE campaign_activities ADD COLUMN ambition_id INT REFERENCES plan_ambitions(ambition_id);

-- Add employers to agreements (multi-employer support)
INSERT INTO agreement_employers (agreement_id, employer_id, is_primary)
SELECT
  aw.agreement_id,
  ewr.employer_id,
  (ewr.role_type = 'Principal_Employer')::BOOLEAN
FROM agreement_worksites aw
JOIN employer_worksite_roles ewr ON ewr.worksite_id = aw.worksite_id
WHERE ewr.is_current = true
ON CONFLICT (agreement_id, employer_id) DO NOTHING;
```

### B2. Migration Path

**Phase 1: Schema Preparation (1 week)**
1. Create `deprecated` schema
2. Add new columns (`program_id` to projects, `ambition_id` to activities)
3. Create migration functions
4. Update TypeScript types

**Phase 2: Data Migration (2 weeks)**
5. Migrate `campaign_universe_rules` → direct tables
6. Migrate `campaign_worker_membership` → `worker_campaign_connections`
7. Migrate `campaign_worker_ou` → `worker_campaign_connections` (as tags)
8. Populate `agreement_employers` from `employer_worksite_roles`
9. Backfill all missing data (see Option A)

**Phase 3: Schema Cleanup (1 week)**
10. Move deprecated tables to `deprecated` schema
11. Drop `parent_worksite_id` from worksites
12. Rename tables/columns for clarity
13. Add validation constraints

**Phase 4: UI Updates (2 weeks)**
14. Update UI to use `worker_campaign_connections`
15. Update UI to use direct campaign tables (not universes)
16. Update UI to show program-project relationships
17. Update UI to show ambition-activity links

**Phase 5: Testing & Documentation (1 week)**
18. End-to-end testing of all workflows
19. Update data dictionary
20. Update user documentation

### B3. Impact on Existing Data

**Data Transformation:**
- `campaign_universe_rules` → Migrated to direct tables, then deprecated
- `campaign_worker_membership` → Migrated to `worker_campaign_connections`
- `campaign_worker_ou` → Migrated to `worker_campaign_connections` (as tags)
- `campaign_organising_units` → Deprecated (info preserved in tags)

**Data Enrichment:**
- `worker_campaign_connections`: Enriched from legacy tables
- `agreement_employers`: ~100 new rows (estimated)
- `site_projects.program_id`: Optional, backfill from business rules

**Data Removal:**
- `worksites.parent_worksite_id`: Column dropped (all NULL anyway)

**Backward Compatibility:**
- Deprecated tables preserved in `deprecated` schema
- Views can be created to emulate old API if needed
- No data loss

### B4. Implementation Complexity

**Medium Complexity:**
- Schema restructuring (new relationships)
- Data migration (transform legacy to new structure)
- UI updates (use new tables)
- Breaking changes for some queries

**Effort:**
- Backend: 10 person-days (migrations, schema changes, functions)
- Frontend: 15 person-days (UI updates, query changes)
- Testing: 5 person-days (integration testing, data validation)
- Documentation: 3 person-days

**Total: ~7 weeks**

### B5. Pros & Cons

**Pros:**
- Removes redundancy (one mechanism per purpose)
- Clarifies conceptual model
- Adds missing relationships
- Preserves data via migration
- Cleaner long-term architecture

**Cons:**
- Medium implementation effort
- Breaking changes for some queries
- Requires UI updates
- Some data loss (OU structure flattened to tags)
- Risk of migration bugs

**Best For:** Medium-term restructuring when you can afford 6-8 weeks of focused work.

---

## Option C: Complete Redesign

### Philosophy

"Start from first principles: What SHOULD the data model be?" Focus on:
1. Ideal conceptual model for offshore organizing
2. Clean separation of concerns
3. Future scalability
4. **Breaking changes accepted**

### C1. Proposed New Data Model

#### C1.1. Core Entities Redesign

**Philosophy:** Three fundamental questions:
1. **Who** employs workers? → `employers`
2. **Where** is work done? → `worksites`
3. **What** work is done? → `work_scopes`

**New Relationship Model:**
```
employers <--(1:N)--> contracts <--(N:1)--> worksites
                                |
                                v
                           work_scopes
                                |
                                v
                             agreements
```

#### C1.2. New Schema

```sql
-- ============================================================
-- 1. CONTRACTS: The missing central entity
-- ============================================================

CREATE TABLE contracts (
  contract_id SERIAL PRIMARY KEY,
  contract_name VARCHAR(200) NOT NULL,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id),
  employer_id INT NOT NULL REFERENCES employers(employer_id),
  principal_employer_id INT REFERENCES employers(employer_id),

  -- Work scope
  work_scope_id INT REFERENCES work_scopes(scope_id),
  employment_type VARCHAR(30) CHECK (employment_type IN (
    'direct_employment', 'contractor', 'subcontractor', 'labour_hire'
  )),

  -- Agreement coverage
  agreement_id INT REFERENCES agreements(agreement_id),

  -- Lifecycle
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. CONTRACT WORKERS: Workers attached to contracts
-- ============================================================

CREATE TABLE contract_workers (
  contract_worker_id BIGSERIAL PRIMARY KEY,
  contract_id INT NOT NULL REFERENCES contracts(contract_id),
  worker_id INT NOT NULL REFERENCES workers(worker_id),

  -- Position details
  job_title VARCHAR(100),
  classification VARCHAR(100),

  -- Engagement
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,

  UNIQUE(contract_id, worker_id)
);

-- ============================================================
-- 3. OPERATIONAL GROUPS: Replace projects/programs confusion
-- ============================================================

CREATE TABLE operational_groups (
  group_id SERIAL PRIMARY KEY,
  group_name VARCHAR(200) NOT NULL,
  group_type VARCHAR(30) NOT NULL CHECK (group_type IN (
    'portfolio', 'program', 'site_phase'
  )),
  parent_group_id INT REFERENCES operational_groups(group_id),

  -- Ownership
  principal_employer_id INT REFERENCES employers(employer_id),
  operator_employer_id INT REFERENCES employers(employer_id),

  -- Scope
  description TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE operational_group_worksites (
  group_id INT NOT NULL REFERENCES operational_groups(group_id),
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  UNIQUE(group_id, worksite_id)
);

CREATE TABLE operational_group_contracts (
  group_id INT NOT NULL REFERENCES operational_groups(group_id),
  contract_id INT NOT NULL REFERENCES contracts(contract_id),
  UNIQUE(group_id, contract_id)
);

-- ============================================================
-- 4. CAMPAIGNS: Simplified targeting
-- ============================================================

-- Remove campaign_universes, campaign_organising_units
-- Keep campaign_employers, campaign_worksites
-- Add campaign_contracts for direct contract targeting

CREATE TABLE campaign_contracts (
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id),
  contract_id INT NOT NULL REFERENCES contracts(contract_id),
  UNIQUE(campaign_id, contract_id)
);

-- ============================================================
-- 5. AGREEMENTS: Simplified coverage
-- ============================================================

-- Rename agreement_scopes to agreement_work_scopes (already done in Option B)
-- Keep agreements.coverage_type (already renamed in Option A)

-- Add agreement_contracts for direct coverage
CREATE TABLE agreement_contracts (
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id),
  contract_id INT NOT NULL REFERENCES contracts(contract_id),
  UNIQUE(agreement_id, contract_id)
);

-- ============================================================
-- 6. WORKERS: Simplified engagement
-- ============================================================

-- Keep worker_campaign_connections (already consolidated in Option B)
-- Remove campaign_worker_membership, campaign_worker_ou (deprecated in Option B)

-- Add worker engagement tracking
ALTER TABLE worker_campaign_connections ADD COLUMN contract_id INT REFERENCES contracts(contract_id);
```

#### C1.3. Key Relationships

```sql
-- Employer → Worksites (via contracts)
employers → contracts → worksites

-- Worksite → Employers (via contracts)
worksites → contracts → employers

-- Agreement → Contracts (coverage)
agreements → agreement_contracts → contracts

-- Campaign → Contracts (targeting)
campaigns → campaign_contracts → contracts

-- Worker → Contract → Employer/Worksite/Scope
workers → contract_workers → contracts → (employers, worksites, work_scopes)

-- Operational Groups → Worksites/Contracts
operational_groups → (operational_group_worksites, operational_group_contracts)
```

### C2. Migration Path

**Phase 1: New Schema Creation (2 weeks)**
1. Create new tables (contracts, contract_workers, operational_groups, etc.)
2. Create new foreign key relationships
3. Create new indexes
4. Update TypeScript types

**Phase 2: Data Migration (4 weeks)**
5. **Migrate to contracts:**
   - `employer_worksite_roles` + `worksite_scopes` → `contracts`
   - `projects` → `operational_groups` (group_type = 'site_phase')
   - `programs` → `operational_groups` (group_type = 'program')
6. **Migrate workers:**
   - `workers` → `contract_workers`
   - Preserve worker attributes
7. **Migrate campaigns:**
   - `campaign_employers` + `campaign_worksites` → `campaign_contracts`
   - Deprecate `campaign_universes`
8. **Migrate agreements:**
   - `agreement_worksites` + `worksite_scopes` → `agreement_contracts`

**Phase 3: UI Rewrite (6 weeks)**
9. Rewrite worksite detail UI (use contracts)
10. Rewrite employer detail UI (use contracts)
11. Rewrite campaign creation UI (use contracts)
12. Rewrite agreement detail UI (use contracts)
13. Rewrite worker detail UI (use contract_workers)
14. Rewrite dashboard queries (use new relationships)

**Phase 4: Testing & Rollout (3 weeks)**
15. Comprehensive integration testing
16. Performance testing
17. User acceptance testing
18. Gradual rollout (feature flags)

**Phase 5: Cleanup (1 week)**
19. Deprecate old tables
20. Remove old code
21. Update documentation

### C3. Impact on Existing Data

**Data Transformation (Major):**
- `employer_worksite_roles` + `worksite_scopes` → Consolidated into `contracts`
- `projects` → Migrated to `operational_groups` (type='site_phase')
- `programs` → Migrated to `operational_groups` (type='program')
- `project_employers` → Redundant (contracts capture this)
- `project_agreements` → Redundant (agreement_contracts captures this)
- `campaign_universes` → Deprecated (use campaign_contracts)
- `campaign_organising_units` → Deprecated (use contract_workers)

**New Capabilities:**
- Full contract lifecycle tracking
- Worker movement across contracts (history)
- Agreement coverage at contract level
- Campaign targeting at contract level
- Operational group hierarchy

**Data Loss:**
- `project_employers.role_type`: Preserved in `contracts.employment_type`
- `campaign_organising_units`: Structure lost, but data preserved in notes
- `parent_worksite_id`: Removed (use operational_groups instead)

### C4. Implementation Complexity

**High Complexity:**
- Complete schema redesign
- Major data migration (complex transformations)
- Full UI rewrite
- Breaking changes everywhere
- High risk of data loss or corruption

**Effort:**
- Backend: 20 person-days (new schema, migrations, functions)
- Data Migration: 15 person-days (complex transformations, validation)
- Frontend: 30 person-days (full UI rewrite)
- Testing: 10 person-days (comprehensive testing)
- Documentation: 5 person-days

**Total: ~16 weeks (4 months)**

### C5. Pros & Cons

**Pros:**
- Clean conceptual model (contracts as central entity)
- Removes ALL confusion and redundancy
- Scalable for future growth
- Clear separation of concerns
- Matches offshore organizing mental model
- Rich tracking capabilities

**Cons:**
- Very high implementation effort
- High risk of data migration bugs
- Full UI rewrite required
- Long timeline (4 months)
- Potential for user disruption
- Opportunity cost (other features delayed)

**Best For:** Long-term architectural excellence when you can afford 4-6 months of focused work.

---

## Comparison Summary

| Aspect | Option A (Minimal) | Option B (Moderate) | Option C (Redesign) |
|--------|-------------------|---------------------|---------------------|
| **Philosophy** | Clarify existing | Consolidate redundancy | Ideal model |
| **Duration** | 3 weeks | 7 weeks | 16 weeks |
| **Effort** | Low (13 person-days) | Medium (33 person-days) | High (80 person-days) |
| **Risk** | Low | Medium | High |
| **Data Loss** | None | Minimal (OU structure) | Some (legacy tables) |
| **Breaking Changes** | None | Some (queries, UI) | Many (everything) |
| **Confusion Resolved** | Partial (terminology) | Mostly (redundancy) | Complete (new model) |
| **Long-term Value** | Low | Medium | High |
| **User Disruption** | None | Low | High |
| **Best For** | Short-term clarity | Medium-term health | Long-term excellence |

---

## Decision Framework

### Choose Option A If:
- You need clarity in < 1 month
- You have limited development resources
- You want minimal risk
- You're planning a larger redesign later
- You need to unblock developers now

### Choose Option B If:
- You can dedicate 6-8 weeks
- You want to remove redundancy
- You want to keep existing data structures
- You want medium-term improvement
- You can afford some breaking changes

### Choose Option C If:
- You want the best possible architecture
- You can dedicate 4-6 months
- You're doing a major version upgrade
- You want to scale significantly
- You can afford high disruption

---

## Hybrid Approach (Recommended)

**Combine Options A + B, defer C:**

1. **Immediate (Option A - 3 weeks):**
   - Rename for clarity
   - Populate missing data
   - Add validation
   - Unblock developers

2. **Short-term (Option B - 7 weeks):**
   - Consolidate campaign scope (remove universe_rules)
   - Consolidate worker connections (use worker_campaign_connections)
   - Remove worksite hierarchy
   - Add missing relationships

3. **Long-term (Option C - 4-6 months):**
   - Plan contracts-based model
   - Design migration path
   - Build in parallel
   - Gradual rollout

**Total Timeline:**
- Option A: Week 1-3
- Option B: Week 4-10
- Option C: Week 11-26 (deferred, planned properly)

---

## Risk Assessment

### Option A Risks
- **Low:** Renaming typos, missing backfill rules
- **Mitigation:** Comprehensive testing, peer review

### Option B Risks
- **Medium:** Data migration bugs, breaking changes
- **Mitigation:** Staged rollout, feature flags, rollback plan

### Option C Risks
- **High:** Data loss, migration failures, project delays
- **Mitigation:**
  - Prototype first (prove the model)
  - Extensive data validation
  - Parallel run (old + new)
  - Gradual migration by feature
  - Comprehensive backup plan

---

## Next Steps

1. **Stakeholder Workshop:** Present options, get feedback
2. **Decision Meeting:** Choose option (or hybrid)
3. **Planning Session:** Detailed implementation plan
4. **Resource Allocation:** Assign team members
5. **Timeline Confirmation:** Set deadlines
6. **Risk Mitigation:** Plan for contingencies
7. **Execution:** Begin with chosen option

---

## Appendix: Sample Migration Scripts

See GitHub repository for detailed migration scripts for each option:
- `/supabase/migrations/option_A/` - Minimal changes
- `/supabase/migrations/option_B/` - Moderate restructuring
- `/supabase/migrations/option_C/` - Complete redesign

(Note: These would be created after decision is made)
