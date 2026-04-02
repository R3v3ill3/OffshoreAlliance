# Stream 3.2: Current State Assessment — Worksite Hierarchy

**Analysis Date:** 2026-04-02
**Agent:** Planning Agent 3.2 — Worksite Hierarchy Analysis
**Focus:** Offshore Facility Hierarchical Structure

---

## Executive Summary

The `parent_worksite_id` column exists in the `worksites` table but is **currently unused** (all values are NULL). The column was introduced for hierarchical modeling but was superseded by a `programs` table approach for multi-worksite grouping. This analysis documents the current state and why the hierarchy column remains unpopulated.

---

## 1. Current Schema Structure

### 1.1 Worksites Table Columns

```sql
CREATE TABLE worksites (
  worksite_id SERIAL PRIMARY KEY,
  worksite_name VARCHAR(100) NOT NULL,
  worksite_type VARCHAR(30) NOT NULL CHECK (worksite_type IN (
    'FPSO','FLNG','Platform','Onshore_LNG','Gas_Plant','Hub',
    'Drill_Centre','Region','Heliport','Pipeline','Airfield',
    'Onshore_Facilities','CPF','Gas_Field','Other'
  )),
  operator_id INT REFERENCES employers(employer_id),
  location_description VARCHAR(200),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  basin VARCHAR(100),
  is_offshore BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  parent_worksite_id INT REFERENCES worksites(worksite_id),  -- Hierarchy column
  principal_employer_id INT REFERENCES employers(employer_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2 Indexes

- `idx_worksites_parent` on `parent_worksite_id` — Index exists but unused
- `idx_worksites_operator` on `operator_id`
- `idx_worksites_principal_emp` on `principal_employer_id`

---

## 2. Why `parent_worksite_id` Is All NULL

### 2.1 Historical Timeline

| Date | Migration | Action | Result |
|------|-----------|--------|--------|
| 2024-? | `0010_organising_universe.sql` | Added `parent_worksite_id` column | Column created, no data |
| 2024-? | `0011_organising_universe_seed.sql` | Created "Ichthys" and "Pluto" hub worksites; linked child worksites (Ichthys CPF, Ichthys FPSO, Darwin LNG, Pluto LNG, Pluto 2) | **Temporary hierarchy** established |
| 2026-03-31 | `20260331200000_hub_to_programs.sql` | Migrated hub grouping to `programs` table; cleared `parent_worksite_id` on child worksites; deactivated hub worksites | **All values set back to NULL** |

### 2.2 The Hub-to-Program Migration

**What happened:**
1. The initial hierarchy design used "Hub" worksites (e.g., "Pluto", "Ichthys") as parent nodes
2. Child worksites were linked via `parent_worksite_id` to these hubs
3. The system later introduced a `programs` table for multi-worksite grouping
4. A migration decision was made to:
   - Move all hub grouping logic to the `programs` table
   - Clear all `parent_worksite_id` values
   - Deactivate the hub worksites themselves

**Migration code that cleared the hierarchy:**

```sql
-- From 20260331200000_hub_to_programs.sql
UPDATE worksites
SET parent_worksite_id = NULL
WHERE worksite_name IN ('Pluto LNG', 'Pluto 2')
  AND parent_worksite_id = (
    SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto'
  );

UPDATE worksites
SET parent_worksite_id = NULL
WHERE worksite_name IN ('Ichthys CPF', 'Ichthys FPSO', 'Darwin LNG')
  AND parent_worksite_id = (
    SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys'
  );
```

---

## 3. Current Hierarchical Alternatives

### 3.1 Programs Table (Current Solution)

The `programs` table now handles multi-worksite grouping:

```sql
CREATE TABLE programs (
  program_id SERIAL PRIMARY KEY,
  program_name VARCHAR(200) NOT NULL,
  description TEXT,
  principal_employer_id INT REFERENCES employers(employer_id),
  program_status VARCHAR(30) NOT NULL DEFAULT 'planning',
  start_date DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE program_worksites (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(program_id) ON DELETE CASCADE,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  UNIQUE(program_id, worksite_id)
);
```

**Programs created:**
- "Pluto Operations" — groups Pluto LNG, Pluto 2
- "Ichthys Operations" — groups Ichthys CPF, Ichthys FPSO, Darwin LNG

### 3.2 Other Hierarchy-Related Fields

The `worksites` table has other potential hierarchy-related columns:

| Column | Current Usage | Potential |
|--------|---------------|-----------|
| `basin` | VARCHAR(100) | Geographic grouping (e.g., "Browse Basin", "Carnarvon Basin") |
| `worksite_type` | ENUM check values | Facility classification (Platform, FPSO, Onshore_LNG, etc.) |
| `is_offshore` | BOOLEAN | High-level geographic split |
| `principal_employer_id` | FK to employers | Producer/owner relationship |

---

## 4. Current Data Distribution

### 4.1 Worksites Count (Estimated)

Based on seed data migrations:
- Approximately 30-50 worksites in the system
- All have `parent_worksite_id = NULL`
- Grouped into 2-3 programs (Pluto Operations, Ichthys Operations, potentially others)

### 4.2 Worksites by Type

From the worksite_type CHECK constraint values:
- **Offshore:** FPSO, FLNG, Platform, Drill_Centre
- **Onshore:** Onshore_LNG, Gas_Plant, Onshore_Facilities, CPF, Airfield, Heliport
- **Grouping types (deprecated):** Hub, Region (note: "Hub" was removed from the constraint in the hub-to-programs migration)
- **Infrastructure:** Pipeline
- **Other:** Gas_Field, Other

---

## 5. View Usage of Hierarchy

### 5.1 Worksites View

The `worksites_view` includes hierarchy columns:

```sql
CREATE OR REPLACE VIEW worksites_view AS
SELECT
  ws.*,
  e.employer_name AS operator_name,
  pws.worksite_name AS parent_worksite_name,  -- Always NULL currently
  pe.employer_name AS principal_employer_name,
  ...
FROM worksites ws
LEFT JOIN employers e ON e.employer_id = ws.operator_id
LEFT JOIN worksites pws ON pws.worksite_id = ws.parent_worksite_id
LEFT JOIN employers pe ON pe.employer_id = ws.principal_employer_id;
```

### 5.2 Organising Universe View

Also includes `parent_worksite_id` and `parent_worksite_name`, both NULL.

---

## 6. Current Hierarchy Reporting

### 6.1 Worksite Hierarchy Explorer Component

Location: `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/components/reports/worksite-hierarchy-explorer.tsx`

**What it does:**
- Reads from `worksite_hierarchy_report_rows` view
- Provides two hierarchy modes:
  1. **Geo → Service Type → Producer → Worksite**
  2. **Producer → Geo → Worksite**
- Exports hierarchy paths as CSV

**Important:** This component does NOT use `parent_worksite_id`. It builds hierarchy paths using:
- `is_offshore` (geo)
- `worksite_type` (service type)
- `principal_employer_id` or `operator_id` (producer)
- `worksite_name` (worksite)

### 6.2 Worksite Hierarchy Report Rows View

Location: `supabase/migrations/20260401110000_worksite_hierarchy_reporting_views.sql`

```sql
CREATE OR REPLACE VIEW worksite_hierarchy_report_rows AS
...
SELECT
  ...
  concat_ws(
    ' > ',
    CASE WHEN rr.is_offshore THEN 'Offshore' ELSE 'Onshore' END,
    replace(rr.worksite_type, '_', ' '),
    coalesce(pe.employer_name, op.employer_name, 'Unassigned producer'),
    rr.worksite_name
  ) AS hierarchy_path_geo_service,
  concat_ws(
    ' > ',
    coalesce(pe.employer_name, op.employer_name, 'Unassigned producer'),
    CASE WHEN rr.is_offshore THEN 'Offshore' ELSE 'Onshore' END,
    rr.worksite_name
  ) AS hierarchy_path_producer_geo
FROM role_rows rr
...
```

**Key insight:** The system has implemented **flat hierarchy reporting** using joins across existing columns rather than a parent-child relationship model.

---

## 7. Key Findings

### 7.1 Why `parent_worksite_id` Remains

| Question | Answer |
|----------|--------|
| Why was it added? | Original intent to model facility hierarchies (field → platform → topsides) |
| Why is it unused? | Migration to `programs` table for multi-worksite grouping |
| Should it be removed? | **Decision point** — may be useful for true facility hierarchies |
| Is it indexed? | Yes (`idx_worksites_parent`) but unused |
| Do any features depend on it? | No — views join on it but all values are NULL |

### 7.2 The "Flat Hierarchy" Pattern

The system currently uses a **denormalized hierarchy reporting** approach:
- Hierarchy is **computed on-the-fly** from existing attributes
- No stored parent-child relationships
- Paths are built via `concat_ws()` in views
- This works for reporting but doesn't support:
  - True hierarchical queries (e.g., "get all descendants of X")
  - Multi-level facility breakdowns
  - Geographic rollups (basin → field → installation)

---

## 8. Data Gaps for Hierarchy Implementation

### 8.1 Missing Reference Data

To implement true offshore facility hierarchies, the following is missing:

| Hierarchy Level | Example Values | Source Status |
|-----------------|----------------|---------------|
| **Basin** | Browse Basin, Carnarvon Basin, Bonaparte Basin | Partially exists in `basin` column |
| **Field** | Pluto, Ichthys, Wheatstone, Gorgon, Jansz | Not modeled |
| **Installation** | North Rankin, Goodwyn, Angel | Not modeled |
| **Facility** | Topsides, Jacket, Subsea | Not modeled |
| **Asset** | Compressor trains, processing units | Not modeled |

### 8.2 Current Worksite Types Don't Map to Hierarchy Levels

The `worksite_type` ENUM mixes:
- Facility types (FPSO, Platform, FLNG)
- Installations (Onshore_LNG, Gas_Plant)
- Infrastructure (Pipeline, Heliport)
- Geographic concepts (Region — deprecated, Gas_Field)

This suggests the schema wasn't designed with **multi-level hierarchy** in mind.

---

## 9. Open Questions

1. **Strategic Intent:** Is `parent_worksite_id` intended for future use, or should it be removed?
2. **Hierarchy Depth:** How many levels of hierarchy are needed for offshore facilities?
3. **Geographic vs. Functional:** Should hierarchy be geographic (basin → field → installation) or functional (hub → spoke) or both?
4. **Programs vs. Hierarchy:** Should `programs` and `parent_worksite_id` coexist, or is one sufficient?
5. **UI Requirements:** How would organisers interact with a hierarchical worksite structure?

---

## 10. Recommendations

### 10.1 Immediate Actions

1. **Decision Required:** Clarify whether `parent_worksite_id` should be:
   - **Option A:** Removed (dead code)
   - **Option B:** Kept for future use
   - **Option C:** Populated with real facility hierarchies

2. **If Option C (populate hierarchy):**
   - Design the hierarchy level structure (see `STREAM3_2_HIERARCHY_OPTIONS.md`)
   - Create reference data for basins, fields, installations
   - Build migration scripts to populate `parent_worksite_id`

3. **If Option A (remove):**
   - Remove column and index
   - Update views to remove joins
   - Document that hierarchy is handled via `programs` table only

### 10.2 Keep `parent_worksite_id` If...

Keep the column if ANY of these use cases are valid:
- Multi-level facility breakdowns needed (basin > field > installation > asset)
- Geographic rollups needed in reporting (e.g., "all worksites in Browse Basin")
- Nested facility aggregations needed (e.g., platform count per field)
- Industry-standard facility taxonomy required

### 10.3 Remove `parent_worksite_id` If...

Remove the column if ALL of these are true:
- `programs` table is sufficient for multi-worksite grouping
- Flat hierarchy reporting (current approach) meets all needs
- No requirement for nested facility queries
- No requirement for geographic rollups beyond current `basin` column

---

## Conclusion

The `parent_worksite_id` column exists but is **architecturally dormant**. The system migrated to a `programs` table approach for grouping worksites, and current hierarchy reporting uses **computed flat paths** rather than stored parent-child relationships. Whether to revive, remove, or redesign this column is a **strategic decision point** that depends on future requirements for offshore facility hierarchy modeling.

**Next Steps:** Review `STREAM3_2_INDUSTRY_CONTEXT.md` for offshore facility organization patterns, then `STREAM3_2_HIERARCHY_OPTIONS.md` for modeling approaches.
