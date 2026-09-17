# Whole-of-Universe Breakdown — Schema & UI Implementation Plan

**Status:** Plan only — do not implement until approved  
**Date:** 2026-09-17  
**App:** `apps/organising-db`  
**Related:** `organising_universe_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary`, `/reports`, `/reports/universe`, `WORKSITE_PROJECT_EMPLOYER_ALIGNMENT_REPORT.md`, `STREAM3_1_*`, `STREAM3_2_*`

---

## 1. Purpose

Enable organisers to **visualise and navigate the whole organising universe** across three complementary breakdowns, and to **detect bargaining/coverage patterns** such as:

1. A critical mass of contractors with out-of-term or no agreements on a **subsector portion of a tier-one (PE) employer**.
2. A **large contractor** (e.g. Downer, Monadelphous) with **multiple exposure points within a 6‑month window**.
3. A **critical mass of subsector employers** facing bargaining in a clear window (e.g. most ROV employers bargaining or expiring in the next 6 months).

Also fix a concrete gap: the **Agreement Expiry** report does not include **tier-one (principal employer) agreement expiry** alongside contractor agreement expiry.

**Out of scope for this plan:** campaign universe rule engines, wall-chart SOC methodology, membership density redesign, new mobile apps.

---

## 2. Domain model (organising language)

### 2.1 Facility classes (derived labels)

| Class | Meaning | Derivation (v1) |
|-------|---------|-----------------|
| `onshore_facility` | Enduring large workplaces under PE operators | `worksites.is_offshore = false` |
| `offshore_production` | Enduring offshore production assets | `is_offshore = true` AND `worksite_type` in production set (FPSO, FPU, FLNG, Platform, CPF, Gas_Field, Drill_Centre, …) |
| `offshore_service` | Multi-client service providers (ROV, heli, marine support) | `worksite_type` in (Heliport, Vessel*, Airfield, …) **or** employer sector/scope in ROV / Helicopter / Marine service set when not tied to a single PE production asset |

Exact type→class maps live in one shared TS + SQL helper (see §4.3) so UI and views stay aligned.

### 2.2 Workforce engagement mode (new explicit field)

| Mode | Meaning |
|------|---------|
| `enduring_ops` | Ongoing site workforce (long-term contractors / direct PE ops) |
| `project_shutdown` | Intense, often large, short-term major maintenance / TAR / shutdown |
| `construction` | Construction / brownfields project workforce |
| `unknown` | Default until classified |

### 2.3 Three report lenses (same grain, different pivots)

| Lens | Groups by | Answers |
|------|-----------|---------|
| **A — Subsector** | Sector / work scope (+ facility class) | “Are ROV employers clustering into a bargaining window?” |
| **B — Tier-one (PE)** | Principal employer → worksite → employers | “On Woodside maintenance, is there a critical mass out of term?” |
| **C — Major contractor** | Parent / major contractor entity | “Does Downer have multiple expiries across PEs in 6 months?” |

### 2.4 Canonical grain: employment exposure

One logical row:

```text
employer × worksite × (sector | primary scope) × agreement? × engagement_mode
  + principal_employer
  + major_contractor_group (parent)
  + facility_class
  + eba_status_category
  + pe_agreement expiry/status (PE’s own EA)
```

All new reports and the upgraded universe explorer read from this grain (SQL view), not ad-hoc joins in React.

---

## 3. Current state (baseline)

| Asset | Path / object | Useful for | Gap |
|-------|---------------|------------|-----|
| Universe table | `organising_universe_view`, `/reports/universe` | Flat PE × worksite × employer × agreement | No sector facet, no PE expiry, no major-contractor rollup, no critical-mass summaries |
| Agreement Expiry | `/reports` → `agreement_expiry` | Flat EA list with days remaining | No PE, no worksites, **no PE agreement expiry** |
| PE EBA Coverage | `principal_employer_eba_summary` + chart | Urgency bands per PE | No sector slice, no PE’s own EA, weak drill-down |
| Pair status | `worksite_employer_eba_status` | Employer×worksite EBA band | No sector, no PE EA, no engagement mode |
| Taxonomy | `sectors`, `work_scopes`, `worksite_scopes` | Subsector / service | Not joined into expiry / PE reports consistently |
| Links | `principal_employer_id`, `parent_employer_id`, roles, agreement junctions | PE & contractor graph | PE often absent from roles; `agreement_scope` / `agreement_employers` underused |

---

## 4. Schema plan

### 4.1 Design principles

- Prefer **views + small additive columns** over new first-class “universe” tables.
- Keep existing views working; add new views alongside, then optionally redefine old ones in a later phase.
- Idempotent migrations; regenerate `@oa/db-types` after apply.
- No breaking CHECK removals without dual-write/backfill notes.

### 4.2 Additive columns

#### A. `employer_worksite_roles.workforce_mode` (preferred home)

```sql
-- migration sketch
ALTER TABLE employer_worksite_roles
  ADD COLUMN IF NOT EXISTS workforce_mode VARCHAR(30) NOT NULL DEFAULT 'unknown';

ALTER TABLE employer_worksite_roles
  DROP CONSTRAINT IF EXISTS employer_worksite_roles_workforce_mode_check;

ALTER TABLE employer_worksite_roles
  ADD CONSTRAINT employer_worksite_roles_workforce_mode_check
  CHECK (workforce_mode IN (
    'enduring_ops',
    'project_shutdown',
    'construction',
    'unknown'
  ));

COMMENT ON COLUMN employer_worksite_roles.workforce_mode IS
  'Organising classification: enduring site ops vs project/shutdown vs construction workforce.';
```

**Why here:** role is already “employer present on worksite”; enduring vs shutdown is a property of that presence, not of the legal employer alone.

**Optional mirror (phase 2+):** `worksite_scopes.workforce_mode` when scope-level nuance is needed (same employer, catering enduring + shutdown crew).

#### B. No new `subsector` table in v1

Use existing `sectors` as the primary subsector dimension; use `work_scopes` for finer service taxonomy. Revisit a dedicated subsector entity only if sectors prove too coarse after report use.

#### C. Optional helper column (phase 2): `employers.is_major_contractor_group`

Not required if `employer_category = 'Major_Contractor'` + `parent_employer_id` are consistently populated. Prefer data-quality work over a new flag unless reporting needs an explicit “rollup root” mark.

### 4.3 Shared facility-class helper

**SQL function** (stable, `IMMUTABLE`/`STABLE` as appropriate):

```sql
CREATE OR REPLACE FUNCTION public.worksite_facility_class(
  p_is_offshore boolean,
  p_worksite_type text
) RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_is_offshore IS FALSE THEN 'onshore_facility'
    WHEN p_worksite_type IN (
      'Heliport', 'Airfield', 'Vessel', 'Supply_Vessel',
      'Accommodation_Vessel', 'Vessel_Other'
    ) THEN 'offshore_service'
    WHEN p_is_offshore IS TRUE THEN 'offshore_production'
    ELSE 'unknown'
  END;
$$;
```

**TS mirror:** `apps/organising-db/src/lib/universe/facility-class.ts` exporting the same map + labels (unit-tested for parity).

Sector-based override for “offshore service provider” employers without a service-type worksite can be applied in the exposure view (e.g. if sector ∈ {ROV, Helicopter Engineers, Aircraft Maintenance} and PE link is multi-site/weak → treat as `offshore_service` for Lens A). Document the rule in code comments; keep it tunable.

### 4.4 New view: `universe_exposure_view` (canonical grain)

**Grain:** one row per current `(employer_id, worksite_id)` from `employer_worksite_roles`, enriched with PE, facility class, sector/scope, matched agreement summary, EBA band, PE’s own agreement summary, major-contractor parent.

**Proposed columns:**

| Column | Source / logic |
|--------|----------------|
| `employer_id`, `employer_name`, `employer_category` | `employers` |
| `parent_employer_id`, `parent_employer_name` | parent join |
| `major_contractor_id`, `major_contractor_name` | `COALESCE(parent if category Major_Contractor/group, self if Major_Contractor)` |
| `worksite_id`, `worksite_name`, `worksite_type`, `is_offshore` | `worksites` |
| `facility_class` | `worksite_facility_class(...)` (+ optional sector override) |
| `principal_employer_id`, `principal_employer_name` | `worksites.principal_employer_id` |
| `role_type`, `workforce_mode`, `role_is_current` | `employer_worksite_roles` |
| `sector_id`, `sector_name` | Prefer agreement sector; fallback employer_sectors / worksite_scopes→sector mapping (document priority) |
| `primary_scope_id`, `primary_scope_name` | Optional: primary current `worksite_scopes` for employer+worksite |
| `agreement_id`, `agreement_name`, `agreement_short_name`, `agreement_status`, `agreement_expiry`, `agreement_scope` | Best matching covering agreement (same match rules as `organising_universe_view` / EBA views) |
| `eba_status_category`, `max_current_expiry`, `has_current`, `has_expired`, `has_bargaining` | Align with `worksite_employer_eba_status` |
| `pe_agreement_id`, `pe_agreement_name`, `pe_agreement_status`, `pe_agreement_expiry` | PE’s best current/negotiation agreement (see §4.5) |
| `pe_days_to_expiry`, `employer_days_to_expiry` | Computed from dates |
| `worker_count` | Active workers on employer+worksite (project-agnostic for this view) |
| `in_expiry_window_6m`, `in_bargaining_or_window_6m` | Boolean helpers for pattern reports |

**Match rules for employer agreement (must stay consistent with existing EBA views):**

- Agreement linked via `agreement_worksites` to the worksite, status ≠ `Terminated`, and  
  (`agreements.employer_id = ewr.employer_id` OR row in `agreement_employers`).
- If multiple: prefer `Current` with latest `expiry_date`, else `Under_Negotiation`, else latest `Expired`.

**Indexes to support the view (if not present):**

- `employer_worksite_roles (worksite_id) WHERE is_current`
- `employer_worksite_roles (employer_id) WHERE is_current`
- `agreement_worksites (worksite_id)`
- `agreements (employer_id, status, expiry_date)`
- `worksites (principal_employer_id) WHERE is_active`

**Grants:** `SELECT` to `authenticated` (same pattern as existing reporting views).

### 4.5 PE agreement resolution (`pe_*` columns)

For each exposure row’s `principal_employer_id`:

1. Collect PE agreements where `agreements.employer_id = pe_id` OR PE in `agreement_employers`.
2. Prefer agreements linked to **this worksite** via `agreement_worksites`; else company-wide PE agreements (`agreement_scope = 'company_wide'` when populated); else any PE agreement.
3. Apply same status preference as §4.4.

Expose as a reusable subquery/CTE `pe_agreement_summary(pe_id, worksite_id, …)` used by:

- `universe_exposure_view`
- Enriched Agreement Expiry API/query
- PE EBA Coverage header strip

### 4.6 Aggregation views for pattern reports

#### A. `universe_pe_sector_exposure_summary`

Grain: `(principal_employer_id, sector_id[, facility_class])`

Counts / percentages by `eba_status_category`, plus:

- `count_in_window_6m` (expired ∪ &lt;6m ∪ under negotiation ∪ no EA — **parameterise** which statuses count as “exposure”; default: `no_eba`, `expired_eba`, `expiry_lt_6m`, `first_bargaining`, and `Under_Negotiation` via has_bargaining)
- `pct_critical` and boolean `is_critical_mass` where:

```text
is_critical_mass :=
  total_employers >= :min_n
  AND pct_critical >= :min_pct
```

Defaults (app settings or constants): `min_n = 3`, `min_pct = 50`. Keep thresholds in one TS module `lib/universe/critical-mass.ts` so UI and any SQL defaults match.

#### B. `universe_major_contractor_exposure_summary`

Grain: `(major_contractor_id)`

- Distinct agreements expiring / bargaining in next 6 and 12 months  
- Distinct PEs touched in window  
- Distinct sectors touched in window  
- `exposure_points_6m` count (agreements or employer×PE×sector rows — pick **agreements** as primary “points” for Lens C; show employer×PE detail on drill-down)

#### C. `universe_sector_wave_summary`

Grain: `(sector_id[, facility_class])`

- Employers in sector with bargaining or expiry within window  
- `% of sector employers in wave`  
- List-supporting drill keys only (detail from `universe_exposure_view`)

### 4.7 Extend / keep existing views

| View | Action |
|------|--------|
| `organising_universe_view` | Keep for compatibility. Phase 2: optionally add `facility_class`, `workforce_mode`, `pe_agreement_expiry` columns **or** point `/reports/universe` at `universe_exposure_view`. |
| `worksite_employer_eba_status` | Keep; exposure view may join it or inline equivalent logic (prefer single source — either redefine status view to include sector later, or have exposure view own the band calculation and deprecate duplicate logic carefully). |
| `principal_employer_eba_summary` | Keep chart; add optional sibling `principal_employer_eba_summary_by_sector` or compute sector stacks client-side from exposure view for v1. |

**Recommendation:** Implement band logic **once** inside a shared SQL CTE file / view `employer_worksite_eba_core`, then have both `worksite_employer_eba_status` and `universe_exposure_view` select from it — reduces drift. Sequence: extract core → redefine status view → add exposure view.

### 4.8 Types

After migration:

- Regenerate `packages/db-types/generated.ts`
- Extend `apps/organising-db/src/types/organising-row-types.ts` with:
  - `WorkforceMode`
  - `FacilityClass`
  - `UniverseExposureRow`
  - summary row types for the three aggregation views
  - critical-mass threshold type

---

## 5. Data quality prerequisites (blocking for trustworthy patterns)

These are not optional for Lens B/C; schedule as Phase 0 / parallel track.

| # | Prerequisite | Why | Acceptance check |
|---|--------------|-----|------------------|
| DQ1 | Every active worksite with a PE has `principal_employer_id` set | PE lens | `COUNT(*) FILTER (WHERE principal_employer_id IS NULL)` for active production/onshore sites = 0 (or documented exceptions) |
| DQ2 | Current contractors on site appear in `employer_worksite_roles` (`is_current`) | Exposure grain | Spot-check PE assets vs known contractor lists |
| DQ3 | PE legal entities have their own EA rows with correct `employer_id` / worksite links | PE expiry column | For each PE in {Shell, Santos, Chevron, Woodside, Inpex}, ≥1 non-terminated agreement resolvable |
| DQ4 | Major contractor groups use `parent_employer_id` (or single canonical employer) | Lens C | Downer / Monadelphous entities roll to one parent in sample queries |
| DQ5 | Populate `agreements.agreement_scope` where known | Distinguish site vs company-wide | Reduce NULL rate on active agreements; prioritise Major_Contractor EAs |
| DQ6 | Use `agreement_employers` for multi-employer EAs | Coverage match already supports it | No silent under-coverage on group EAs |
| DQ7 | Classify `workforce_mode` for onshore PE sites (at least enduring vs project_shutdown) | Facility narrative | Onshore PE sites: &lt;30% `unknown` after first scrub |

Deliver a short **data scrub checklist** (CSV export from exposure view with NULL PE expiry / unknown mode / missing sector) as part of Phase 0 UI or admin script — plan only here; implementation later.

---

## 6. UI implementation plan

### 6.1 Information architecture

Reports hub (`/reports`) gains / updates:

| Report card | Route | Priority |
|-------------|-------|----------|
| Agreement Expiry (enhanced) | inline or `/reports/agreement-expiry` | P0 |
| Organising Universe (enhanced) | `/reports/universe` | P1 |
| PE × Sector Exposure | `/reports/universe/pe-sector` (or hub mode) | P1 |
| Major Contractor Timeline | `/reports/universe/contractor-exposure` | P1 |
| Sector Bargaining Wave | `/reports/universe/sector-wave` | P1 |
| Principal Employer EBA Coverage (enhanced) | existing inline | P2 |

Shared filter chrome (component): `UniverseFilterBar` — PE, sector, facility class, workforce mode, employer category, expiry window (6m/12m/24m), EBA status multi-select, onshore/offshore.

Deep links: preserve filters in URL search params for shareability.

### 6.2 P0 — Agreement Expiry enhancement

**File:** `apps/organising-db/src/app/(dashboard)/reports/page.tsx` (or extract `components/reports/agreement-expiry-report.tsx`).

**Query:** Prefer `universe_exposure_view` distinct-on agreement, **or** enrich current `agreements` query with:

- lateral/agg of distinct PE names + min PE expiry among linked worksites  
- worksite count / names  
- employer category, parent name, sector  

**New columns:**

| Column | Notes |
|--------|-------|
| Employer (existing) | Keep |
| Employer category | New |
| Parent / major contractor | New |
| Sector | Existing |
| Principal employer(s) | Comma-separated or primary PE |
| Worksites | Count + tooltip/list |
| Agreement expiry | Existing |
| Days remaining | Existing |
| **PE agreement expiry** | New — earliest/primary PE EA expiry among linked PEs |
| **PE days remaining** | New |
| Status | Existing |

**Filters:** PE, sector, category, facility class, window.

**CSV:** include all new columns.

**Empty PE expiry:** show “—” with secondary hint “No PE agreement linked” (data-quality signal).

### 6.3 P1 — Universe explorer upgrade (`/reports/universe`)

**Data source:** switch to `universe_exposure_view`.

**Add:**

- `UniverseFilterBar`
- Group-by control: None | Principal employer | Sector | Major contractor | Facility class  
- Summary chips above table: row count, % critical (using shared threshold helper), count in 6m window  
- Columns: facility class, sector, workforce mode, EBA band badge, employer expiry, **PE expiry**  
- Row click → worksite or employer detail (existing routes)  
- Export CSV of filtered set  

**Group-by UX:** when grouped, show collapsible sections with per-group critical-mass badge; detail table inside.

### 6.4 P1 — PE × Sector Exposure matrix

**Route:** `/reports/universe/pe-sector` (linked from hub + from PE EBA chart “View by sector”).

**Layout:**

1. Matrix or stacked bars: rows = PE, columns = sector (or heatmap cell colour by `pct_critical`).  
2. Cell click → side panel / drill table of `universe_exposure_view` rows for that PE×sector.  
3. Toggle: facility class; window 6/12m; critical-mass only.

**Pattern callout:** auto-list PE×sector cells where `is_critical_mass`.

### 6.5 P1 — Major Contractor Exposure timeline

**Route:** `/reports/universe/contractor-exposure`.

**Layout:**

1. Selector / ranked list of major contractors by `exposure_points_6m`.  
2. Horizontal timeline (6–12 month) of agreement expiry / bargaining markers.  
3. Table: agreement, sector, PE clients, worksites, expiry, status.  
4. Callout when `exposure_points_6m >= 2` (or threshold).

Reuse calendar patterns from `agreements-calendar.tsx` / bargaining calendar where possible.

### 6.6 P1 — Sector Bargaining Wave

**Route:** `/reports/universe/sector-wave`.

**Layout:**

1. Sector cards or bar chart: % employers in wave (bargaining ∪ expiry ≤ window ∪ optional no EA).  
2. Expand sector → employer list with PE mix and facility class.  
3. Preset: “Next 6 months”, “Next 12 months”.

Example success view: “ROV — 7/9 employers in window”.

### 6.7 P2 — PE EBA Coverage chart enhancement

**File:** `components/reports/principal-employer-eba-chart.tsx` + reports page section.

- Header strip per PE: PE’s own EA name, status, expiry.  
- Toggle “Stack by sector” (data from exposure view or `…_by_sector` summary).  
- Click segment → filtered universe / PE×sector drill.

### 6.8 Forms / admin touchpoints (for new field)

- Employer worksite role editors (worksite detail Employers tab, any wizard writing `employer_worksite_roles`): add `workforce_mode` select.  
- Optional bulk classify admin tool (Phase 2).  
- Employer wizard / worksite scope forms: no hard dependency for v1 beyond role field.

### 6.9 Navigation

- `lib/nav/nav-model.ts`: Reports children or hub cards only (prefer hub cards to avoid nav bloat).  
- Cross-links from Dashboard expiry widgets → enhanced Agreement Expiry with query params.

---

## 7. Phased delivery

### Phase 0 — Foundations & data quality (no end-user pattern UI yet)

1. Migration: `workforce_mode` on `employer_worksite_roles` + `worksite_facility_class()` function.  
2. Extract/reuse EBA core logic; create `universe_exposure_view` (+ grants).  
3. Types regeneration + TS facility-class / critical-mass helpers + unit tests.  
4. Data scrub exports / checklist for DQ1–DQ7; fix PE agreements and major-contractor parents for priority entities.  
5. **Do not** ship pattern reports until PE expiry resolves for the five tier-ones (or exceptions documented in UI).

### Phase 1 — Agreement Expiry + Universe switch

1. Enhanced Agreement Expiry columns/filters/CSV (PE expiry included).  
2. Point `/reports/universe` at exposure view; filters + PE expiry column + CSV.  
3. Manual QA against known Shell/Woodside/ROV samples.

### Phase 2 — Pattern reports

1. Aggregation views (or equivalent server queries from exposure view if volume is small).  
2. PE × Sector matrix.  
3. Major contractor timeline.  
4. Sector bargaining wave.  
5. Hub cards + deep links.

### Phase 3 — Polish

1. PE EBA chart sector stack + PE header strip.  
2. Critical-mass thresholds in `app_settings` (optional).  
3. Sector override rules for `offshore_service`.  
4. Optional `worksite_scopes.workforce_mode`.  
5. Performance pass (materialised view only if interactive queries exceed ~1–2s on prod data).

---

## 8. Work item checklist (implementation backlog)

Use as ticket breakdown when implementation is approved.

| ID | Work item | Phase | Primary paths |
|----|-----------|-------|---------------|
| W1 | Migration: `workforce_mode` + facility_class function | 0 | `supabase/migrations/YYYYMMDDHHMMSS_universe_exposure.sql` |
| W2 | SQL: `employer_worksite_eba_core` extract + redefine status view | 0 | same migration or follow-up |
| W3 | SQL: `universe_exposure_view` | 0 | same |
| W4 | SQL: summary views (pe×sector, major contractor, sector wave) | 2 | migration |
| W5 | Regenerate db-types; row types; helpers + tests | 0 | `packages/db-types`, `types/organising-row-types.ts`, `lib/universe/*` |
| W6 | Agreement Expiry UI + CSV | 1 | `reports/page.tsx` or extracted component |
| W7 | Universe page upgrade | 1 | `reports/universe/page.tsx` |
| W8 | `UniverseFilterBar` shared component | 1 | `components/reports/universe-filter-bar.tsx` |
| W9 | PE × Sector report page | 2 | `reports/universe/pe-sector/page.tsx` |
| W10 | Major contractor timeline page | 2 | `reports/universe/contractor-exposure/page.tsx` |
| W11 | Sector wave page | 2 | `reports/universe/sector-wave/page.tsx` |
| W12 | Reports hub cards + copy | 1–2 | `reports/page.tsx` |
| W13 | Role editor: workforce_mode | 0–1 | worksite employers UI |
| W14 | PE EBA chart enhancements | 3 | `principal-employer-eba-chart.tsx` |
| W15 | Data scrub script/checklist | 0 | `scripts/` or admin report |

---

## 9. Acceptance criteria

### Functional

- [ ] Agreement Expiry shows **PE agreement expiry** (and days remaining) for agreements linked to PE worksites.  
- [ ] CSV export includes PE expiry and PE name(s).  
- [ ] Universe report filters by PE, sector, facility class, workforce mode, expiry window.  
- [ ] PE × Sector report flags critical-mass cells with configurable N/% thresholds.  
- [ ] Major contractor report lists ≥2 distinct agreement exposure points in a 6‑month window when data supports it (validate with Downer/Monadelphous fixtures).  
- [ ] Sector wave report can show ROV (or chosen sector) “employers in next 6 months” count and percentage.  
- [ ] EBA status bands match existing PE coverage semantics for the same employer×worksite pairs.

### Non-functional

- [ ] No regression: existing PE EBA summary chart still loads.  
- [ ] View queries usable interactively on current prod-scale row counts (or documented need for materialisation).  
- [ ] Facility class TS and SQL helpers covered by unit tests for every `WORKSITE_TYPES` value.

### Data

- [ ] Five tier-one PEs resolve a PE agreement expiry in UAT, or explicit “unlinked” state is visible.  
- [ ] Workforce mode editable on worksite employer roles.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| PE expiry always blank → users distrust report | Phase 0 DQ3 gate; UI empty state explaining missing PE EA link |
| Double-counting multi-worksite company-wide EAs in contractor timeline | Lens C counts **distinct agreement_id**; drill shows worksites |
| Sector NULL on many rows | Fallback chain: agreement.sector → employer_sectors → scope mapping; show “Unallocated” bucket |
| `parent_employer_id` misused for PE vs corporate parent | Document: PE relationship is **worksite.principal_employer_id**; parent is **corporate group**; never overload parent as PE |
| View performance | Index pass; limit columns; materialise only if needed |
| Logic drift between views | Single `employer_worksite_eba_core` source |

---

## 11. Explicit non-goals (this plan)

- Replacing Programs/Projects model or Stream 3-3 option evaluation.  
- New subsector taxonomy table (unless Phase 3 evidence requires it).  
- Auto-inferring workforce_mode from worker counts.  
- Changing campaign universe rule DSL.  
- Implementing the above in this change set (plan document only).

---

## 12. Suggested decision log (resolve before build)

1. **Critical-mass defaults:** `min_n = 3`, `min_pct = 50` — confirm with organisers.  
2. **Lens C “exposure point”:** distinct **agreements** in window (recommended) vs employer×PE pairs.  
3. **Universe page:** replace data source with `universe_exposure_view` vs keep both pages.  
4. **Offshore service class:** worksite-type only vs sector override — confirm ROV/heli modelling in live data.  
5. **Whether PE’s own ops employees** appear in PE×sector matrix (recommended: yes, as employer = PE rows).

---

## 13. Reference map (code & SQL today)

| Concern | Location |
|---------|----------|
| Baseline views | `supabase/migrations/20260908050000_baseline_schema.sql` (`organising_universe_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary`) |
| Legacy EBA SQL | `supabase/migrations_legacy/0007_eba_coverage_views.sql` |
| Legacy universe SQL | `supabase/migrations_legacy/0010_organising_universe.sql` |
| Reports hub | `apps/organising-db/src/app/(dashboard)/reports/page.tsx` |
| Universe UI | `apps/organising-db/src/app/(dashboard)/reports/universe/page.tsx` |
| PE chart | `apps/organising-db/src/components/reports/principal-employer-eba-chart.tsx` |
| Row types / enums | `apps/organising-db/src/types/organising-row-types.ts` |
| Alignment gaps | `WORKSITE_PROJECT_EMPLOYER_ALIGNMENT_REPORT.md` |

---

## 14. Approval gate

Implementation should not start until this plan is accepted (or amended) on:

- Canonical grain and three lenses  
- PE agreement resolution rules  
- Phase 0 data-quality gate  
- Critical-mass thresholds and Lens C counting rule  

**This document is planning output only; no schema or UI code ships with it.**
