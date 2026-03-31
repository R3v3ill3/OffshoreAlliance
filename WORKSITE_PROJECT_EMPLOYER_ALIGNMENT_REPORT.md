# Worksite/Project/Employer schema alignment — as-is report (2026-03-31)

This document captures the **current** (as-is) data schema and UI data-loading logic for relationships between:

- **Employers** (including employer categories / parent relationships)
- **Worksites**
- **Projects** (current site-level `projects`)
- **Work scopes**
- **Agreements** (enterprise agreements / EBAs)
- **Workers** and “engagement”

It also lists the key **disconnects/overlaps** relative to the intended hierarchy discussed in the planning thread.

## TL;DR (highest-impact disconnects)

- **Projects are currently modelled as children of worksites** (`projects.worksite_id`). This is the opposite direction to a “multi-worksite project” mental model.
- The Worksite detail UI tabs are **independent queries** (Agreements/Employers/Work Scopes/Projects/Workers), so there is **no single entity** representing “contract employer performing scope on this worksite (within a project) under agreement X”.
- **Asset owner (“principal employer”)** lives on `worksites.principal_employer_id` but is **not represented** in the Employers tab (which reads `employer_worksite_roles`). In the current dataset, **31/31** worksites with a principal employer are missing from `employer_worksite_roles`, so the UI cannot show it there.
- “Engagement” is **overloaded** between worker organising engagement (`workers.engagement_*`) and contracting mode (`worksite_scopes.engagement_type`).

## Canonical sources

- **Schema DDL**: Supabase migrations in [`supabase/migrations/`](supabase/migrations/)
- **Worksites UI logic**: [`apps/organising-db/src/app/(dashboard)/worksites/[id]/page.tsx`](apps/organising-db/src/app/(dashboard)/worksites/[id]/page.tsx)
- **Bridging views**: [`supabase/migrations/0010_organising_universe.sql`](supabase/migrations/0010_organising_universe.sql), [`supabase/migrations/0007_eba_coverage_views.sql`](supabase/migrations/0007_eba_coverage_views.sql)

## As-is domain model (schema reality)

### Worksites (anchor entity)

- Table: `worksites` (created in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql))
- Key employer links:
  - `worksites.operator_id` → `employers.employer_id`
  - `worksites.principal_employer_id` → `employers.employer_id` (added in [`supabase/migrations/0006_principal_employers.sql`](supabase/migrations/0006_principal_employers.sql))
- Hierarchy:
  - `worksites.parent_worksite_id` → `worksites.worksite_id` (added in [`supabase/migrations/0010_organising_universe.sql`](supabase/migrations/0010_organising_universe.sql))

### Employers (companies)

- Table: `employers` (created in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql))
- Category values expanded to include `Principal_Employer` in [`supabase/migrations/0006_principal_employers.sql`](supabase/migrations/0006_principal_employers.sql)
- Hierarchy:
  - `employers.parent_employer_id` → `employers.employer_id` (added in [`supabase/migrations/0006_principal_employers.sql`](supabase/migrations/0006_principal_employers.sql))

### Site-level projects (current `projects` table)

- Table: `projects` (created in [`supabase/migrations/0010_organising_universe.sql`](supabase/migrations/0010_organising_universe.sql))
- Direction:
  - **`projects.worksite_id` → `worksites.worksite_id`** (required)
- Optional supporting tables exist but are not used by the Worksite UI:
  - `project_employers` (employer roles at a project)
  - `project_agreements` (agreements linked to a project)

### Agreements (EBAs)

- Table: `agreements` (created in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql))
- Primary employer on the row:
  - `agreements.employer_id` → `employers.employer_id`
- Agreement ↔ Worksite:
  - `agreement_worksites(agreement_id, worksite_id)` junction
- Agreement ↔ Additional employers:
  - `agreement_employers(agreement_id, employer_id, is_primary)` junction exists, but is currently unused in live data.
- Two different “scope” concepts:
  - `agreements.agreement_scope` (site/project/sector/company-wide classification) added in `0010` but currently null in live data
  - `agreement_scopes` (agreement ↔ work-scope taxonomy) added in `0012`

### Work scopes (taxonomy + site assignments)

- Table: `work_scopes` (taxonomy tree) in [`supabase/migrations/0012_work_scopes.sql`](supabase/migrations/0012_work_scopes.sql)
- Table: `worksite_scopes` in [`supabase/migrations/0012_work_scopes.sql`](supabase/migrations/0012_work_scopes.sql)
  - Links a worksite to a scope, optionally to an employer
  - Contains `engagement_type` (`direct_employment`, `contractor`, `subcontractor`, `labour_hire`)

### Workers and “engagement”

- Table: `workers` in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)
- Links:
  - `workers.employer_id` → `employers.employer_id`
  - `workers.worksite_id` → `worksites.worksite_id`
  - `workers.project_id` → `projects.project_id` (added in `0010`)
- Organising engagement fields:
  - `workers.engagement_score`
  - `workers.engagement_level`

## As-is “join logic” in views (important because UI does not join tabs)

### `organising_universe_view` (bridges employer ↔ agreement at a worksite)

Defined in [`supabase/migrations/0010_organising_universe.sql`](supabase/migrations/0010_organising_universe.sql).

Key behavior:

- Takes **employers at a worksite** from `employer_worksite_roles` (current rows)
- Takes **agreements at a worksite** from `agreement_worksites`
- Considers an agreement to “cover” an employer if:
  - `agreements.employer_id = employer_worksite_roles.employer_id`, OR
  - employer appears in `agreement_employers` for that agreement
- Joins in `projects` by `projects.worksite_id`
- Counts workers per (worksite, employer, project) triple (if workers exist)

### `worksite_employer_eba_status` / `principal_employer_eba_summary`

Defined in [`supabase/migrations/0007_eba_coverage_views.sql`](supabase/migrations/0007_eba_coverage_views.sql).

Key behavior:

- Treats “EBA status” as a property of each **(employer, worksite)** pair (from `employer_worksite_roles`), derived from agreements linked to that worksite and covering that employer.
- `principal_employer_eba_summary` aggregates those pairs into a principal-employer level rollup (using both `worksites.principal_employer_id` and `employers.parent_employer_id` scope rules).

## As-is Worksite detail UI logic

Worksite detail page: [`apps/organising-db/src/app/(dashboard)/worksites/[id]/page.tsx`](apps/organising-db/src/app/(dashboard)/worksites/[id]/page.tsx)

All tab datasets are loaded in parallel. Each tab is a direct Supabase `.from(...).select(...)` query:

| UI tab | Table(s) queried | Worksite join key |
|--------|------------------|-------------------|
| Agreements | `agreement_worksites` (nested `agreements(*)`) | `agreement_worksites.worksite_id` |
| Employers | `employer_worksite_roles` (nested `employers(*)`) | `employer_worksite_roles.worksite_id` |
| Work Scopes | `worksite_scopes` (nested `work_scopes(*)`, optional `employers(...)`) | `worksite_scopes.worksite_id` |
| Projects | `projects` | `projects.worksite_id` |
| Workers | `workers` (nested `employers(employer_name)`) | `workers.worksite_id` |

This explains why it’s unclear “how these tabs connect”: there is no shared entity in the UI representing a contract relationship.

## Live DB snapshot (OffshoreAlliance Supabase project)

Observed using Supabase MCP against project id `gteygwfgjvczanmrwgbr` on 2026-03-31:

- Populated:
  - `employers`: 70
  - `worksites`: 40
  - `projects`: 7 (and **each worksite with projects has exactly 1** active project)
  - `agreements`: 135
  - `agreement_worksites`: 47
  - `employer_worksite_roles`: 60
- Mostly empty / unused:
  - `worksite_scopes`: 2
  - `agreement_employers`: 0
  - `project_employers`: 0
  - `project_agreements`: 0
  - `workers`: 0
  - `worker_agreements`: 0
- Mismatch with intended meaning:
  - `agreements.agreement_scope` is null for all 135 agreements (so “sector_wide vs project_specific” is not currently encoded)
  - `worksites.principal_employer_id` is set on 31 worksites, but **none** of those principal employers appear in `employer_worksite_roles` for their worksite (so the Employers tab cannot reflect “principal employer”)

## Key disconnects / overlaps (relative to the intended hierarchy)

### 1) Project direction is inverted for “multi-worksite projects”

- Current: `projects.worksite_id` (site-level project/phase)
- Intended: **Project contains multiple worksites**
- Result: “Projects” appears as a worksite sub-tab, because that’s what the schema enforces.

### 2) No explicit “contract” entity to connect employer ↔ scope ↔ agreement ↔ project

The schema has pieces of the story, but no canonical record:

- Employers-at-site: `employer_worksite_roles`
- Work scope assignments: `worksite_scopes` (optional employer, no agreement, no project)
- Agreements-at-site: `agreement_worksites` (no link to scope)
- Site-level project: `projects` (no link to scopes in DB/UI)

### 3) Principal employer vs employer-worksite roles

Two parallel ways to represent “who is associated with a worksite”:

- `worksites.principal_employer_id` (asset owner)
- `employer_worksite_roles` (operators/contractors/etc.)

They currently diverge in live data.

### 4) “Engagement” word means different things in different tables

- Worker organising engagement: `workers.engagement_*`
- Contracting mode: `worksite_scopes.engagement_type`

### 5) “Scope” naming collision for agreements

- `agreements.agreement_scope` is *coverage level classification*
- `agreement_scopes` is *link to work-scope taxonomy*

## Next steps (implementation)

The implementation plan proceeds in phases:\n\n1. **UI clarity without schema change**: show asset owner in Employers, group agreements by employer coverage, and introduce a “Contracts” lens.\n2. **Add a new multi-worksite grouping entity** (avoid renaming existing `projects`): introduce `programs` + `program_worksites`.\n3. **Introduce a canonical contract/assignment layer**: represent “Employer X performs Scope Y at Worksite Z (within Program P / SiteProject SP) under Agreement A”.\n4. **Workers multi-attachment**: attach workers to contracts/assignments (so they can be connected to principal employer context + contract employer + scope).\n\nThese changes are implemented in new Supabase migrations and organising-db UI updates (see current task list in the Cursor session).\n+
