# Stream 3.2: Implementation Plan — Worksite Hierarchy

**Analysis Date:** 2026-04-02
**Agent:** Planning Agent 3.2 — Worksite Hierarchy Analysis
**Focus:** Phased implementation roadmap for offshore facility hierarchy

---

## Executive Summary

This document provides a comprehensive, phased implementation plan for adding hierarchical modeling to the Offshore Alliance Platform's worksite structure. The plan balances immediate value delivery with long-term extensibility, using a **hybrid approach** (Option B: Multiple Hierarchy Types with Option A: Adjacency List foundation).

---

## Strategic Approach

### Design Philosophy

**Start simple, extend incrementally:**

1. **Phase 1:** Implement basic geographic hierarchy using existing `parent_worksite_id` column
2. **Phase 2:** Add operational hierarchy (hub-satellite) via junction table
3. **Phase 3:** Optimize performance with closure tables and materialized views
4. **Phase 4:** Advanced features (time tracking, audit logging, bulk operations)

### Success Criteria

- ✅ All existing worksites have correct geographic parent relationships
- ✅ Hub-satellite operational relationships are modeled
- ✅ Hierarchy queries perform acceptably (<100ms for typical queries)
- ✅ UI components display hierarchy intuitively (trees, breadcrumbs)
- ✅ Mobile facility location tracking is supported
- ✅ Agreement coverage maps correctly to hierarchical facilities
- ✅ Data migration is reversible if issues arise

---

## Phase 1: Minimal Viable Hierarchy (Weeks 1-2)

**Goal:** Enable basic geographic hierarchy (Basin → Field → Installation) using existing `parent_worksite_id` column.

### 1.1 Schema Changes

**Action:** Add hierarchy metadata columns to `worksites` table

```sql
-- Migration: 20260402180000_worksite_hierarchy_phase1.sql

-- Add hierarchy metadata
ALTER TABLE worksites
  ADD COLUMN hierarchy_level VARCHAR(20)
    CHECK (hierarchy_level IN ('basin', 'field', 'installation', 'facility', 'infrastructure'));

ALTER TABLE worksites
  ADD COLUMN hierarchy_path VARCHAR(500);

ALTER TABLE worksites
  ADD COLUMN hierarchy_depth INT DEFAULT 1;

ALTER TABLE worksites
  ADD COLUMN is_grouping_node BOOLEAN DEFAULT false;

-- Add indexes
CREATE INDEX idx_worksites_hierarchy_level ON worksites(hierarchy_level);
CREATE INDEX idx_worksites_hierarchy_path ON worksites(hierarchy_path);
CREATE INDEX idx_worksites_is_grouping ON worksites(is_grouping_node);

-- Add comments
COMMENT ON COLUMN worksites.hierarchy_level IS
  'Geographic hierarchy level: basin > field > installation > facility > infrastructure';

COMMENT ON COLUMN worksites.hierarchy_path IS
  'Materialized path from root to this node, e.g., "/1/4/15/"';

COMMENT ON COLUMN worksites.is_grouping_node IS
  'True if this is a grouping node (basin/field) with no physical facility, false if actual facility';
```

### 1.2 Reference Data Creation

**Action:** Insert basin and field grouping nodes

```sql
-- Migration: 20260402180001_worksite_hierarchy_reference_data.sql

-- Insert major Australian offshore basins
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, location_description)
VALUES
  ('Browse Basin', 'Region', true, true, 'basin', true, 'Western Australia offshore'),
  ('Carnarvon Basin', 'Region', true, true, 'basin', true, 'Western Australia offshore'),
  ('Bonaparte Basin', 'Region', true, true, 'basin', true, 'Northern Territory offshore'),
  ('Perth Basin', 'Region', false, true, 'basin', true, 'Western Australia onshore/offshore'),
  ('Otway Basin', 'Region', false, true, 'basin', true, 'Victoria/South Australia offshore'),
  ('Gippsland Basin', 'Region', false, true, 'basin', true, 'Victoria offshore'),
  ('Surat Basin', 'Region', false, true, 'basin', true, 'Queensland onshore')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert major fields (link to basins)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description)
SELECT
  field_name,
  'Gas_Field',
  true,
  true,
  'field',
  true,
  basin_worksite_id,
  location_description
FROM (VALUES
  -- Browse Basin fields
  ('Ichthys Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Browse Basin'),
   'Browse Basin, Western Australia'),
  ('Prelude Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Browse Basin'),
   'Browse Basin, Western Australia'),

  -- Carnarvon Basin fields
  ('Pluto Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('Wheatstone Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('Gorgon Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('Jansz Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('North Rankin Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('Goodwyn Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia'),
  ('Angel Field', (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
   'Carnarvon Basin, Western Australia')
) AS v(field_name, basin_worksite_id, location_description)
ON CONFLICT (worksite_name) DO NOTHING;
```

### 1.3 Data Migration

**Action:** Link existing worksites to appropriate fields

```sql
-- Migration: 20260402180002_worksite_hierarchy_migrate_existing.sql

-- Update Pluto worksites
UPDATE worksites
SET
  parent_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto Field'),
  hierarchy_level = 'installation',
  hierarchy_depth = 3
WHERE worksite_name IN ('Pluto LNG', 'Pluto 2')
  AND parent_worksite_id IS NULL;

-- Update Ichthys worksites
UPDATE worksites
SET
  parent_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Field'),
  hierarchy_level = 'installation',
  hierarchy_depth = 3
WHERE worksite_name IN ('Ichthys CPF', 'Ichthys FPSO', 'Darwin LNG')
  AND parent_worksite_id IS NULL;

-- Update Wheatstone worksites (if exists)
UPDATE worksites
SET
  parent_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone Field'),
  hierarchy_level = 'installation',
  hierarchy_depth = 3
WHERE worksite_name LIKE 'Wheatstone%'
  AND parent_worksite_id IS NULL;

-- Update other worksites with basin information
UPDATE worksites
SET
  parent_worksite_id = (
    SELECT w.worksite_id
    FROM worksites w
    WHERE w.hierarchy_level = 'field'
      AND (worksites.basin IS NOT NULL
           AND (w.worksite_name LIKE '%' || worksites.basin || '%'
                OR worksites.location_description LIKE '%' || w.worksite_name || '%'))
    LIMIT 1
  ),
  hierarchy_level = 'installation',
  hierarchy_depth = 3
WHERE parent_worksite_id IS NULL
  AND hierarchy_level IS NULL
  AND basin IS NOT NULL;
```

### 1.4 Hierarchy Path Generation

**Action:** Populate materialized paths for all worksites

```sql
-- Migration: 20260402180003_worksite_hierarchy_populate_paths.sql

-- Function to regenerate hierarchy paths
CREATE OR REPLACE FUNCTION regenerate_worksite_hierarchy_paths()
RETURNS VOID AS $$
DECLARE
  v_worksite RECORD;
  v_path TEXT;
  v_depth INT;
BEGIN
  -- Clear existing paths
  UPDATE worksites SET hierarchy_path = NULL, hierarchy_depth = 1;

  -- Process basin-level nodes (roots)
  FOR v_worksite IN
    SELECT worksite_id, worksite_name
    FROM worksites
    WHERE hierarchy_level = 'basin'
  LOOP
    UPDATE worksites
    SET
      hierarchy_path = '/' || v_worksite.worksite_id || '/',
      hierarchy_depth = 1
    WHERE worksite_id = v_worksite.worksite_id;
  END LOOP;

  -- Process field-level nodes
  FOR v_worksite IN
    SELECT w.worksite_id, w.worksite_name, w.parent_worksite_id,
           p.hierarchy_path as parent_path
    FROM worksites w
    JOIN worksites p ON p.worksite_id = w.parent_worksite_id
    WHERE w.hierarchy_level = 'field'
  LOOP
    UPDATE worksites
    SET
      hierarchy_path = v_worksite.parent_path || v_worksite.worksite_id || '/',
      hierarchy_depth = 2
    WHERE worksite_id = v_worksite.worksite_id;
  END LOOP;

  -- Process installation-level nodes
  FOR v_worksite IN
    SELECT w.worksite_id, w.worksite_name, w.parent_worksite_id,
           p.hierarchy_path as parent_path
    FROM worksites w
    JOIN worksites p ON p.worksite_id = w.parent_worksite_id
    WHERE w.hierarchy_level = 'installation'
  LOOP
    UPDATE worksites
    SET
      hierarchy_path = v_worksite.parent_path || v_worksite.worksite_id || '/',
      hierarchy_depth = 3
    WHERE worksite_id = v_worksite.worksite_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute path generation
SELECT regenerate_worksite_hierarchy_paths();

-- Create trigger to auto-update path on parent change
CREATE OR REPLACE FUNCTION update_worksite_hierarchy_path()
RETURNS TRIGGER AS $$
BEGIN
  -- Update this node's path
  IF NEW.parent_worksite_id IS DISTINCT FROM OLD.parent_worksite_id THEN
    PERFORM regenerate_worksite_hierarchy_paths();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worksite_hierarchy_update
  AFTER UPDATE OF parent_worksite_id ON worksites
  FOR EACH ROW
  EXECUTE FUNCTION update_worksite_hierarchy_path();
```

### 1.5 Validation

**Action:** Add constraints and validation functions

```sql
-- Migration: 20260402180004_worksite_hierarchy_validation.sql

-- Function to detect cycles in hierarchy
CREATE OR REPLACE FUNCTION detect_worksite_hierarchy_cycles()
RETURNS TABLE(cycle_path TEXT[]) AS $$
DECLARE
  v_cycle RECORD;
BEGIN
  -- Recursive CTE to find cycles
  FOR v_cycle IN
    WITH RECURSIVE hierarchy_path AS (
      SELECT
        w1.worksite_id,
        w1.worksite_name,
        w1.parent_worksite_id,
        ARRAY[w1.worksite_id::TEXT] as path
      FROM worksites w1
      WHERE w1.parent_worksite_id IS NOT NULL

      UNION ALL

      SELECT
        w2.worksite_id,
        w2.worksite_name,
        w2.parent_worksite_id,
        hp.path || w2.worksite_id::TEXT
      FROM worksites w2
      JOIN hierarchy_path hp ON hp.parent_worksite_id = w2.worksite_id
      WHERE NOT w2.worksite_id = ANY(hp.path)
    )
    SELECT
      array_agg(DISTINCT w.worksite_name ORDER BY w.worksite_name) as cycle_nodes
    FROM hierarchy_path hp
    JOIN worksites w ON w.worksite_id = ANY(hp.path)
    GROUP BY hp.path
    HAVING COUNT(*) > 10  -- More than 10 levels indicates a cycle
  LOOP
    RETURN QUERY SELECT v_cycle.cycle_nodes::TEXT[];
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Validation check constraint function
CREATE OR REPLACE FUNCTION validate_worksite_hierarchy()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if cycles exist
  IF EXISTS (SELECT 1 FROM detect_worksite_hierarchy_cycles()) THEN
    RETURN FALSE;
  END IF;

  -- Check if parent exists and is not self
  IF EXISTS (
    SELECT 1 FROM worksites
    WHERE parent_worksite_id IS NOT NULL
      AND parent_worksite_id = worksite_id
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add check constraint (deferred for bulk updates)
ALTER TABLE worksites
  ADD CONSTRAINT chk_worksite_hierarchy_valid
  CHECK (validate_worksite_hierarchy())
  DEFERRABLE INITIALLY DEFERRED;
```

### 1.6 UI Updates

**Frontend Changes Required:**

1. **Worksite List Page** (`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/(dashboard)/worksites/page.tsx`)
   - Add tree view toggle (flat vs. hierarchical)
   - Add hierarchy level filter
   - Add breadcrumb navigation
   - Show grouping nodes differently from facilities

2. **Worksite Detail Page** (`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/(dashboard)/worksites/[id]/page.tsx`)
   - Add parent worksite link
   - Add child worksites list
   - Add hierarchy path breadcrumbs
   - Show full hierarchy tree

3. **Hierarchy Explorer Component** (New component)
   - Interactive tree visualization
   - Expand/collapse branches
   - Click to navigate to worksite
   - Show worker counts per node

**Component Structure:**
```tsx
// apps/organising-db/src/components/worksites/worksite-hierarchy-tree.tsx
interface WorksiteTreeNode {
  worksite_id: number;
  worksite_name: string;
  hierarchy_level: string;
  children: WorksiteTreeNode[];
  worker_count: number;
  employer_count: number;
}

export function WorksiteHierarchyTree() {
  // Fetch hierarchy data
  // Render tree with expand/collapse
  // Show aggregated metrics
}
```

### 1.7 Testing Strategy

**Test Cases:**

1. **Schema validation:**
   - ✅ `parent_worksite_id` FK constraint works
   - ✅ Hierarchy level CHECK constraint accepts valid values
   - ✅ Cycle detection prevents circular references
   - ✅ Indexes improve query performance

2. **Data migration:**
   - ✅ All existing worksites have correct parent relationships
   - ✅ Basin and field nodes exist for all regions
   - ✅ Hierarchy paths are correctly generated
   - ✅ No orphaned nodes exist

3. **Query performance:**
   - ✅ Get all children of basin: <100ms
   - ✅ Get all descendants of field: <200ms
   - ✅ Get ancestors of installation: <100ms
   - ✅ Count workers per basin: <150ms

4. **UI functionality:**
   - ✅ Tree view renders correctly
   - ✅ Expand/collapse works smoothly
   - ✅ Breadcrumb navigation works
   - ✅ Filter by hierarchy level works

### 1.8 Rollback Plan

**If Phase 1 fails:**

```sql
-- Rollback migration
DROP TRIGGER IF EXISTS trg_worksite_hierarchy_update ON worksites;
DROP FUNCTION IF EXISTS update_worksite_hierarchy_path();
DROP FUNCTION IF EXISTS regenerate_worksite_hierarchy_paths();
DROP FUNCTION IF EXISTS validate_worksite_hierarchy();
DROP FUNCTION IF EXISTS detect_worksite_hierarchy_cycles();

ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS chk_worksite_hierarchy_valid;

ALTER TABLE worksites
  DROP COLUMN IF EXISTS hierarchy_path,
  DROP COLUMN IF EXISTS hierarchy_depth,
  DROP COLUMN IF EXISTS hierarchy_level,
  DROP COLUMN IF EXISTS is_grouping_node;

DROP INDEX IF EXISTS idx_worksites_hierarchy_path;
DROP INDEX IF EXISTS idx_worksites_hierarchy_level;
DROP INDEX IF EXISTS idx_worksites_is_grouping;

UPDATE worksites
SET parent_worksite_id = NULL
WHERE hierarchy_level IN ('installation', 'facility');

DELETE FROM worksites
WHERE is_grouping_node = true;
```

---

## Phase 2: Operational Hierarchy (Weeks 3-4)

**Goal:** Add hub-satellite operational relationships via dedicated junction table.

### 2.1 Schema Changes

```sql
-- Migration: 20260402190000_worksite_operational_hierarchy.sql

-- Operational hierarchy table (hub-satellite relationships)
CREATE TABLE worksites_operational_hierarchy (
  id SERIAL PRIMARY KEY,
  hub_worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  satellite_worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN (
    'processing',      -- Hub processes satellite's output
    'export',          -- Satellite exports via hub
    'support',         -- Hub provides support services
    'infrastructure',  -- Satellite uses hub's infrastructure
    'logistics',       -- Hub provides logistics (helicopters, supply vessels)
    'accommodation',   -- Satellite uses hub's accommodation
    'other'
  )),
  is_current BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  distance_km DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hub_worksite_id, satellite_worksite_id, relationship_type)
);

-- Indexes
CREATE INDEX idx_woh_hub ON worksites_operational_hierarchy(hub_worksite_id);
CREATE INDEX idx_woh_satellite ON worksites_operational_hierarchy(satellite_worksite_id);
CREATE INDEX idx_woh_type ON worksites_operational_hierarchy(relationship_type);
CREATE INDEX idx_woh_current ON worksites_operational_hierarchy(is_current);

-- RLS
ALTER TABLE worksites_operational_hierarchy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read operational hierarchy"
  ON worksites_operational_hierarchy FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert operational hierarchy"
  ON worksites_operational_hierarchy FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update operational hierarchy"
  ON worksites_operational_hierarchy FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete operational hierarchy"
  ON worksites_operational_hierarchy FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- Updated at trigger
CREATE TRIGGER trg_woh_updated_at
  BEFORE UPDATE ON worksites_operational_hierarchy
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Comments
COMMENT ON TABLE worksites_operational_hierarchy IS
  'Operational hierarchy: hub-satellite relationships between facilities.

  Relationship types:
  - processing: Hub processes satellite production
  - export: Satellite exports via hub infrastructure
  - support: Hub provides operational support
  - infrastructure: Satellite shares hub infrastructure
  - logistics: Hub provides logistics (helicopters, vessels)
  - accommodation: Satellite uses hub accommodation';
```

### 2.2 Data Migration

```sql
-- Migration: 20260402190001_populate_operational_hierarchy.sql

-- Pluto LNG (hub) → Pluto 2 (satellite)
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto 2'),
  'processing',
  true,
  true,
  180.0,  -- Approximate distance in km
  'Pluto 2 processes gas offshore, exports via pipeline to Pluto LNG onshore'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;

-- Ichthys FPSO (hub) → Darwin LNG (satellite, export)
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys FPSO'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Darwin LNG'),
  'export',
  true,
  true,
  890.0,  -- Pipeline distance to Darwin
  'Ichthys FPSO processes gas, exports via 890km pipeline to Darwin LNG'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;

-- Ichthys CPF (hub) → Ichthys FPSO (satellite, infrastructure)
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys CPF'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys FPSO'),
  'infrastructure',
  true,
  false,
  5.0,  -- Approximate distance
  'Ichthys CPF provides support infrastructure for Ichthys FPSO'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;

-- Darwin LNG (hub) → Ichthys FPSO (satellite, logistics)
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Darwin LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys FPSO'),
  'logistics',
  true,
  false,
  'Darwin LNG provides logistics support for Ichthys FPSO operations'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;
```

### 2.3 Views and Functions

```sql
-- Migration: 20260402190002_operational_hierarchy_views.sql

-- View: Hub facilities with their satellites
CREATE OR REPLACE VIEW worksites_hub_view AS
SELECT
  w.worksite_id,
  w.worksite_name,
  w.worksite_type,
  w.location_description,
  COUNT(woh.satellite_worksite_id) FILTER (WHERE woh.is_current = true) as satellite_count,
  STRING_AGG(
    DISTINCT woh.satellite_worksite_id || ':' || sw.worksite_name,
    ', ' ORDER BY sw.worksite_name
  ) FILTER (WHERE woh.is_current = true) as satellite_list,
  MAX(woh.distance_km) FILTER (WHERE woh.is_current = true) as max_distance_km
FROM worksites w
LEFT JOIN worksites_operational_hierarchy woh ON woh.hub_worksite_id = w.worksite_id
LEFT JOIN worksites sw ON sw.worksite_id = woh.satellite_worksite_id
WHERE woh.id IS NOT NULL  -- Only hubs
GROUP BY w.worksite_id, w.worksite_name, w.worksite_type, w.location_description;

COMMENT ON VIEW worksites_hub_view IS
  'Hub facilities with their satellite facilities and relationship counts';

-- View: Satellite facilities with their hubs
CREATE OR REPLACE VIEW worksites_satellite_view AS
SELECT
  w.worksite_id,
  w.worksite_name,
  w.worksite_type,
  w.location_description,
  COUNT(woh.hub_worksite_id) FILTER (WHERE woh.is_current = true) as hub_count,
  STRING_AGG(
    DISTINCT woh.hub_worksite_id || ':' || hw.worksite_name || ' (' || woh.relationship_type || ')',
    ', ' ORDER BY hw.worksite_name
  ) FILTER (WHERE woh.is_current = true) as hub_list
FROM worksites w
LEFT JOIN worksites_operational_hierarchy woh ON woh.satellite_worksite_id = w.worksite_id
LEFT JOIN worksites hw ON hw.worksite_id = woh.hub_worksite_id
WHERE woh.id IS NOT NULL  -- Only satellites
GROUP BY w.worksite_id, w.worksite_name, w.worksite_type, w.location_description;

COMMENT ON VIEW worksites_satellite_view IS
  'Satellite facilities with their hub facilities and relationship types';

-- Function: Get operational network for a worksite
CREATE OR REPLACE FUNCTION get_worksite_operational_network(p_worksite_id INT)
RETURNS TABLE(
  worksite_id INT,
  worksite_name VARCHAR,
  relationship_type VARCHAR,
  direction VARCHAR,  -- 'hub' or 'satellite'
  distance_km DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH network AS (
    -- Satellites (this worksite is hub)
    SELECT
      woh.satellite_worksite_id,
      sw.worksite_name,
      woh.relationship_type,
      'satellite'::VARCHAR,
      woh.distance_km
    FROM worksites_operational_hierarchy woh
    JOIN worksites sw ON sw.worksite_id = woh.satellite_worksite_id
    WHERE woh.hub_worksite_id = p_worksite_id
      AND woh.is_current = true

    UNION ALL

    -- Hubs (this worksite is satellite)
    SELECT
      woh.hub_worksite_id,
      hw.worksite_name,
      woh.relationship_type,
      'hub'::VARCHAR,
      woh.distance_km
    FROM worksites_operational_hierarchy woh
    JOIN worksites hw ON hw.worksite_id = woh.hub_worksite_id
    WHERE woh.satellite_worksite_id = p_worksite_id
      AND woh.is_current = true
  )
  SELECT
    n.worksite_id,
    n.worksite_name,
    n.relationship_type,
    n.direction,
    n.distance_km
  FROM network n
  ORDER BY n.direction, n.distance_km NULLS LAST, n.worksite_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_worksite_operational_network(INT) IS
  'Get all facilities in the operational network of a worksite (both hubs and satellites)';
```

### 2.4 UI Updates

**Component Updates:**

1. **Worksite Detail Page**
   - Add "Operational Network" section
   - Show hubs and satellites
   - Display relationship types
   - Show distances

2. **Operational Network Visualizer** (New component)
   - Network graph visualization
   - Nodes = worksites
   - Edges = relationships (color-coded by type)
   - Interactive (click to navigate)

```tsx
// apps/organising-db/src/components/worksites/operational-network-graph.tsx

interface NetworkNode {
  id: number;
  name: string;
  type: 'hub' | 'satellite';
}

interface NetworkEdge {
  from: number;
  to: number;
  type: 'processing' | 'export' | 'support' | 'infrastructure' | 'logistics';
  distance_km?: number;
}

export function OperationalNetworkGraph({ worksiteId }: { worksiteId: number }) {
  // Fetch network data
  // Render interactive graph
  // Color-code edges by relationship type
  // Show distances on hover
}
```

### 2.5 Testing Strategy

**Test Cases:**

1. **Schema validation:**
   - ✅ FK constraints prevent invalid hub/satellite IDs
   - ✅ Relationship type CHECK constraint works
   - ✅ UNIQUE constraint prevents duplicate relationships
   - ✅ RLS policies control access

2. **Data migration:**
   - ✅ Pluto LNG → Pluto 2 relationship exists
   - ✅ Ichthys FPSO → Darwin LNG relationship exists
   - ✅ No orphaned relationships
   - ✅ Distances are reasonable

3. **Query performance:**
   - ✅ Get all satellites for hub: <100ms
   - ✅ Get all hubs for satellite: <100ms
   - ✅ Get full operational network: <150ms
   - ✅ Network graph query: <200ms

4. **UI functionality:**
   - ✅ Network graph renders correctly
   - ✅ Color-coding by relationship type works
   - ✅ Click to navigate works
   - ✅ Hover shows distances

### 2.6 Rollback Plan

```sql
-- Rollback Phase 2
DROP VIEW IF EXISTS worksites_satellite_view;
DROP VIEW IF EXISTS worksites_hub_view;
DROP FUNCTION IF EXISTS get_worksite_operational_network(INT);
DROP TABLE IF EXISTS worksites_operational_hierarchy;
```

---

## Phase 3: Performance Optimization (Weeks 5-6)

**Goal:** Add closure tables and materialized views for frequent hierarchy queries.

### 3.1 Closure Table for Geographic Hierarchy

```sql
-- Migration: 20260402200000_worksite_geographic_closure.sql

-- Closure table for geographic hierarchy
CREATE TABLE worksites_geographic_closure (
  ancestor_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  descendant_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  depth INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);

-- Indexes
CREATE INDEX idx_wgc_ancestor ON worksites_geographic_closure(ancestor_id);
CREATE INDEX idx_wgc_descendant ON worksites_geographic_closure(descendant_id);
CREATE INDEX idx_wgc_depth ON worksites_geographic_closure(depth);

-- Function to populate closure table
CREATE OR REPLACE FUNCTION populate_geographic_closure()
RETURNS VOID AS $$
BEGIN
  -- Clear existing
  TRUNCATE TABLE worksites_geographic_closure;

  -- Insert self-references (depth = 0)
  INSERT INTO worksites_geographic_closure (ancestor_id, descendant_id, depth)
  SELECT worksite_id, worksite_id, 0
  FROM worksites
  WHERE hierarchy_level IN ('basin', 'field', 'installation');

  -- Insert direct relationships (depth = 1)
  INSERT INTO worksites_geographic_closure (ancestor_id, descendant_id, depth)
  SELECT
    w.parent_worksite_id,
    w.worksite_id,
    1
  FROM worksites w
  WHERE w.parent_worksite_id IS NOT NULL
    AND w.hierarchy_level IN ('field', 'installation');

  -- Insert transitive relationships recursively
  WITH RECURSIVE closure AS (
    SELECT ancestor_id, descendant_id, depth
    FROM worksites_geographic_closure

    UNION ALL

    SELECT
      c.ancestor_id,
      w.worksite_id as descendant_id,
      c.depth + 1
    FROM worksites_geographic_closure c
    JOIN worksites w ON w.parent_worksite_id = c.descendant_id
    WHERE c.depth > 0  -- Don't multiply self-references
      AND w.hierarchy_level IN ('field', 'installation')
  )
  INSERT INTO worksites_geographic_closure (ancestor_id, descendant_id, depth)
  SELECT DISTINCT ancestor_id, descendant_id, depth
  FROM closure
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain closure on hierarchy changes
CREATE OR REPLACE FUNCTION maintain_geographic_closure()
RETURNS TRIGGER AS $$
BEGIN
  -- Rebuild closure on parent change
  IF NEW.parent_worksite_id IS DISTINCT FROM OLD.parent_worksite_id THEN
    PERFORM populate_geographic_closure();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintain_geographic_closure
  AFTER UPDATE OF parent_worksite_id ON worksites
  FOR EACH ROW
  EXECUTE FUNCTION maintain_geographic_closure();

-- Initial population
SELECT populate_geographic_closure();

COMMENT ON TABLE worksites_geographic_closure IS
  'Transitive closure table for geographic hierarchy.
  Enables O(1) queries for all descendants/ancestors of any node.';
```

### 3.2 Materialized View for Reporting

```sql
-- Migration: 20260402200001_worksite_hierarchy_reporting_mv.sql

-- Materialized view for hierarchy rollups
CREATE MATERIALIZED VIEW worksites_hierarchy_summary AS
SELECT
  -- Hierarchy info
  w.worksite_id,
  w.worksite_name,
  w.hierarchy_level,
  w.hierarchy_path,
  w.hierarchy_depth,
  w.is_grouping_node,
  w.parent_worksite_id,
  pw.worksite_name as parent_worksite_name,

  -- Geographic rollups
  (
    SELECT worksite_name
    FROM worksites
    WHERE worksite_id = (
      SELECT ancestor_id
      FROM worksites_geographic_closure
      WHERE descendant_id = w.worksite_id AND depth = 2
      LIMIT 1
    )
  ) as field_name,
  (
    SELECT worksite_name
    FROM worksites
    WHERE worksite_id = (
      SELECT ancestor_id
      FROM worksites_geographic_closure
      WHERE descendant_id = w.worksite_id AND depth = 1
      LIMIT 1
    )
  ) as basin_name,

  -- Counts
  (
    SELECT COUNT(*)::INT
    FROM workers
    WHERE workers.worksite_id = w.worksite_id AND workers.is_active = true
  ) as worker_count,
  (
    SELECT COUNT(DISTINCT employer_id)::INT
    FROM employer_worksite_roles
    WHERE worksite_id = w.worksite_id AND is_current = true
  ) as employer_count,
  (
    SELECT COUNT(*)::INT
    FROM agreement_worksites aw
    JOIN agreements a ON a.agreement_id = aw.agreement_id
    WHERE aw.worksite_id = w.worksite_id AND a.status = 'Current'
  ) as agreement_count,

  -- Operational counts
  (
    SELECT COUNT(*)::INT
    FROM worksites_operational_hierarchy
    WHERE hub_worksite_id = w.worksite_id AND is_current = true
  ) as satellite_count,
  (
    SELECT COUNT(*)::INT
    FROM worksites_operational_hierarchy
    WHERE satellite_worksite_id = w.worksite_id AND is_current = true
  ) as hub_count,

  -- Full hierarchy path
  concat_ws(
    ' > ',
    COALESCE(
      (SELECT worksite_name FROM worksites WHERE worksite_id =
        (SELECT ancestor_id FROM worksites_geographic_closure
         WHERE descendant_id = w.worksite_id AND depth = 1 LIMIT 1)
      ),
      'Unknown Basin'
    ),
    COALESCE(
      (SELECT worksite_name FROM worksites WHERE worksite_id =
        (SELECT ancestor_id FROM worksites_geographic_closure
         WHERE descendant_id = w.worksite_id AND depth = 2 LIMIT 1)
      ),
      'Unknown Field'
    ),
    w.worksite_name
  ) as full_hierarchy_path

FROM worksites w
LEFT JOIN worksites pw ON pw.worksite_id = w.parent_worksite_id
WHERE w.is_active = true;

-- Indexes
CREATE UNIQUE INDEX idx_whs_id ON worksites_hierarchy_summary(worksite_id);
CREATE INDEX idx_whs_hierarchy_path ON worksites_hierarchy_summary(full_hierarchy_path);
CREATE INDEX idx_whs_basin ON worksites_hierarchy_summary(basin_name);
CREATE INDEX idx_whs_field ON worksites_hierarchy_summary(field_name);
CREATE INDEX idx_whs_level ON worksites_hierarchy_summary(hierarchy_level);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_worksites_hierarchy_summary()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY worksites_hierarchy_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON MATERIALIZED VIEW worksites_hierarchy_summary IS
  'Materialized view for worksite hierarchy rollups and reporting.
  Refresh via refresh_worksites_hierarchy_summary()';

-- Initial refresh
SELECT refresh_worksites_hierarchy_summary();
```

### 3.3 Automated Refresh Schedule

```sql
-- Migration: 20260402200002_hierarchy_automation.sql

-- Function to refresh all hierarchy-related data
CREATE OR REPLACE FUNCTION refresh_all_hierarchy_data()
RETURNS VOID AS $$
BEGIN
  -- Refresh geographic closure
  PERFORM populate_geographic_closure();

  -- Refresh materialized view
  PERFORM refresh_worksites_hierarchy_summary();

  -- Refresh existing hierarchy report rows
  PERFORM refresh_worksite_hierarchy_report_rows_mv();
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (run nightly via pg_cron or external scheduler)
-- This would be configured in production separately
COMMENT ON FUNCTION refresh_all_hierarchy_data() IS
  'Refresh all hierarchy-related materialized data.
  Should be scheduled to run nightly or after major hierarchy changes.';
```

### 3.4 Performance Testing

**Benchmark Queries:**

```sql
-- Test 1: Get all descendants of a basin (using closure)
EXPLAIN ANALYZE
SELECT w.*
FROM worksites w
JOIN worksites_geographic_closure c ON c.descendant_id = w.worksite_id
WHERE c.ancestor_id = :basin_id AND c.depth > 0;

-- Test 2: Get all ancestors of an installation (using closure)
EXPLAIN ANALYZE
SELECT w.*
FROM worksites w
JOIN worksites_geographic_closure c ON c.ancestor_id = w.worksite_id
WHERE c.descendant_id = :installation_id AND c.depth > 0;

-- Test 3: Count workers per basin (using MV)
EXPLAIN ANALYZE
SELECT basin_name, SUM(worker_count) as total_workers
FROM worksites_hierarchy_summary
WHERE basin_name IS NOT NULL
GROUP BY basin_name
ORDER BY total_workers DESC;

-- Test 4: Get all satellites for a hub
EXPLAIN ANALYZE
SELECT get_worksite_operational_network(:hub_id);
```

**Performance Targets:**

| Query | Target | Actual |
|-------|--------|--------|
| Get all descendants (basin) | <100ms | TBD |
| Get all ancestors (installation) | <50ms | TBD |
| Count workers per basin | <100ms | TBD |
| Get operational network | <150ms | TBD |
| Full hierarchy rollup | <200ms | TBD |

### 3.5 Rollback Plan

```sql
-- Rollback Phase 3
DROP MATERIALIZED VIEW IF EXISTS worksites_hierarchy_summary;
DROP FUNCTION IF EXISTS refresh_worksites_hierarchy_summary();
DROP FUNCTION IF EXISTS refresh_all_hierarchy_data();
DROP TABLE IF EXISTS worksites_geographic_closure;
DROP FUNCTION IF EXISTS populate_geographic_closure();
DROP FUNCTION IF EXISTS maintain_geographic_closure();
DROP TRIGGER IF EXISTS trg_maintain_geographic_closure ON worksites;
```

---

## Phase 4: Advanced Features (Weeks 7-8)

**Goal:** Add time-based location tracking, audit logging, and bulk operations.

### 4.1 Time-Based Location Tracking

```sql
-- Migration: 20260402210000_worksite_location_history.sql

-- Location history for mobile facilities
CREATE TABLE worksites_location_history (
  id SERIAL PRIMARY KEY,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  location_type VARCHAR(20) NOT NULL CHECK (location_type IN (
    'current', 'previous', 'planned'
  )),
  location_description TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  basin VARCHAR(100),
  effective_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wlh_worksite ON worksites_location_history(worksite_id);
CREATE INDEX idx_wlh_effective_date ON worksites_location_history(effective_date DESC);
CREATE INDEX idx_wlh_current ON worksites_location_history(location_type, effective_date)
  WHERE location_type = 'current';

-- Function to get current location
CREATE OR REPLACE FUNCTION get_worksite_current_location(p_worksite_id INT)
RETURNS TABLE(
  location_description TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  basin VARCHAR,
  effective_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lh.location_description,
    lh.latitude,
    lh.longitude,
    lh.basin,
    lh.effective_date
  FROM worksites_location_history lh
  WHERE lh.worksite_id = p_worksite_id
    AND lh.location_type = 'current'
    AND (lh.end_date IS NULL OR lh.end_date >= CURRENT_DATE)
  ORDER BY lh.effective_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE worksites_location_history IS
  'Historical location tracking for mobile facilities (drill rigs, vessels).
  Supports "current", "previous", and "planned" locations with effective dates.';
```

### 4.2 Hierarchy Change Audit Log

```sql
-- Migration: 20260402210001_worksite_hierarchy_audit.sql

-- Audit log for hierarchy changes
CREATE TABLE worksites_hierarchy_audit_log (
  id SERIAL PRIMARY KEY,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN (
    'parent_change', 'level_change', 'grouping_change', 'deactivation'
  )),
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whal_worksite ON worksites_hierarchy_audit_log(worksite_id);
CREATE INDEX idx_whal_change_type ON worksites_hierarchy_audit_log(change_type);
CREATE INDEX idx_whal_changed_at ON worksites_hierarchy_audit_log(changed_at DESC);
CREATE INDEX idx_whal_changed_by ON worksites_hierarchy_audit_log(changed_by);

-- Trigger to log parent changes
CREATE OR REPLACE FUNCTION log_worksite_hierarchy_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log parent_worksite_id changes
  IF NEW.parent_worksite_id IS DISTINCT FROM OLD.parent_worksite_id THEN
    INSERT INTO worksites_hierarchy_audit_log (
      worksite_id, change_type, old_value, new_value, changed_by, change_reason
    )
    VALUES (
      NEW.worksite_id,
      'parent_change',
      jsonb_build_object('parent_worksite_id', OLD.parent_worksite_id),
      jsonb_build_object('parent_worksite_id', NEW.parent_worksite_id),
      auth.uid(),
      'Parent worksite changed'
    );
  END IF;

  -- Log hierarchy_level changes
  IF NEW.hierarchy_level IS DISTINCT FROM OLD.hierarchy_level THEN
    INSERT INTO worksites_hierarchy_audit_log (
      worksite_id, change_type, old_value, new_value, changed_by, change_reason
    )
    VALUES (
      NEW.worksite_id,
      'level_change',
      jsonb_build_object('hierarchy_level', OLD.hierarchy_level),
      jsonb_build_object('hierarchy_level', NEW.hierarchy_level),
      auth.uid(),
      'Hierarchy level changed'
    );
  END IF;

  -- Log is_grouping_node changes
  IF NEW.is_grouping_node IS DISTINCT FROM OLD.is_grouping_node THEN
    INSERT INTO worksites_hierarchy_audit_log (
      worksite_id, change_type, old_value, new_value, changed_by, change_reason
    )
    VALUES (
      NEW.worksite_id,
      'grouping_change',
      jsonb_build_object('is_grouping_node', OLD.is_grouping_node),
      jsonb_build_object('is_grouping_node', NEW.is_grouping_node),
      auth.uid(),
      'Grouping node status changed'
    );
  END IF;

  -- Log deactivations
  IF OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO worksites_hierarchy_audit_log (
      worksite_id, change_type, old_value, new_value, changed_by, change_reason
    )
    VALUES (
      NEW.worksite_id,
      'deactivation',
      jsonb_build_object('is_active', true),
      jsonb_build_object('is_active', false),
      auth.uid(),
      'Worksite deactivated'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_worksite_hierarchy_changes
  AFTER UPDATE ON worksites
  FOR EACH ROW
  EXECUTE FUNCTION log_worksite_hierarchy_changes();

COMMENT ON TABLE worksites_hierarchy_audit_log IS
  'Audit log for all worksite hierarchy changes.
  Tracks parent changes, level changes, grouping changes, and deactivations.';
```

### 4.3 Bulk Import/Export

```sql
-- Migration: 20260402210002_worksite_hierarchy_bulk_operations.sql

-- Function to bulk import hierarchy from CSV
CREATE OR REPLACE FUNCTION import_worksite_hierarchy_from_csv(
  p_csv_data TEXT  -- CSV format: worksite_name,parent_worksite_name,hierarchy_level
)
RETURNS TABLE(
  worksite_name VARCHAR,
  status VARCHAR,
  message TEXT
) AS $$
DECLARE
  v_row RECORD;
  v_worksite_id INT;
  v_parent_id INT;
BEGIN
  -- Parse CSV and import
  FOR v_row IN
    SELECT *
    FROM regexp_split_to_table(p_csv_data, E'\n') AS line
    WHERE line <> ''
  LOOP
    -- Skip header
    IF v_row.line LIKE 'worksite_name%' THEN
      CONTINUE;
    END IF;

    -- Parse CSV columns
    BEGIN
      -- Get or create worksite
      SELECT worksite_id INTO v_worksite_id
      FROM worksites
      WHERE worksite_name = split_part(v_row.line, ',', 1);

      IF v_worksite_id IS NULL THEN
        INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active)
        VALUES (split_part(v_row.line, ',', 1), 'Other', true, true)
        RETURNING worksite_id INTO v_worksite_id;
      END IF;

      -- Get parent
      IF split_part(v_row.line, ',', 2) <> '' THEN
        SELECT worksite_id INTO v_parent_id
        FROM worksites
        WHERE worksite_name = split_part(v_row.line, ',', 2);

        IF v_parent_id IS NOT NULL THEN
          UPDATE worksites
          SET
            parent_worksite_id = v_parent_id,
            hierarchy_level = split_part(v_row.line, ',', 3)
          WHERE worksite_id = v_worksite_id;

          RETURN QUERY SELECT split_part(v_row.line, ',', 1)::VARCHAR, 'success'::VARCHAR, 'Hierarchy updated'::TEXT;
        ELSE
          RETURN QUERY SELECT split_part(v_row.line, ',', 1)::VARCHAR, 'error'::VARCHAR, 'Parent not found'::TEXT;
        END IF;
      ELSE
        RETURN QUERY SELECT split_part(v_row.line, ',', 1)::VARCHAR, 'error'::VARCHAR, 'No parent specified'::TEXT;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT split_part(v_row.line, ',', 1)::VARCHAR, 'error'::VARCHAR, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to export hierarchy to CSV
CREATE OR REPLACE FUNCTION export_worksite_hierarchy_to_csv()
RETURNS TEXT AS $$
DECLARE
  v_csv TEXT := 'worksite_id,worksite_name,parent_worksite_id,parent_worksite_name,hierarchy_level,hierarchy_path' || E'\n';
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT
      w.worksite_id::TEXT,
      w.worksite_name,
      COALESCE(w.parent_worksite_id::TEXT, '') as parent_id,
      COALESCE(pw.worksite_name, '') as parent_name,
      COALESCE(w.hierarchy_level, '') as level,
      COALESCE(w.hierarchy_path, '') as path
    FROM worksites w
    LEFT JOIN worksites pw ON pw.worksite_id = w.parent_worksite_id
    WHERE w.is_active = true
    ORDER BY w.hierarchy_path, w.worksite_name
  LOOP
    v_csv := v_csv ||
      v_row.worksite_id || ',' ||
      v_row.worksite_name || ',' ||
      v_row.parent_id || ',' ||
      v_row.parent_name || ',' ||
      v_row.level || ',' ||
      v_row.path || E'\n';
  END LOOP;

  RETURN v_csv;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION export_worksite_hierarchy_to_csv() IS
  'Export worksite hierarchy to CSV format.
  Returns CSV string with columns: worksite_id,worksite_name,parent_worksite_id,parent_worksite_name,hierarchy_level,hierarchy_path';
```

### 4.4 UI Updates

**Component Updates:**

1. **Location History Viewer** (New component)
   - Timeline view of facility locations
   - Filter by date range
   - Show on map

2. **Audit Log Viewer** (New component)
   - Table view of hierarchy changes
   - Filter by change type
   - Show who changed what and when

3. **Bulk Import Tool** (New component)
   - CSV upload interface
   - Validation and preview
   - Import summary with errors

```tsx
// apps/organising-db/src/components/worksites/location-history-viewer.tsx
export function LocationHistoryViewer({ worksiteId }: { worksiteId: number }) {
  // Fetch location history
  // Display timeline
  // Show on map
}

// apps/organising-db/src/components/worksites/hierarchy-audit-log.tsx
export function HierarchyAuditLog({ worksiteId }: { worksiteId: number }) {
  // Fetch audit log
  // Display change history
  // Filter by change type
}

// apps/organising-db/src/components/worksites/hierarchy-bulk-import.tsx
export function HierarchyBulkImport() {
  // CSV upload
  // Validation
  // Preview
  // Import summary
}
```

### 4.5 Testing Strategy

**Test Cases:**

1. **Location history:**
   - ✅ Can track facility movements over time
   - ✅ Can query current location
   - ✅ Timeline view displays correctly
   - ✅ Map integration works

2. **Audit logging:**
   - ✅ All hierarchy changes are logged
   - ✅ Audit log captures user who made change
   - ✅ Can filter by change type
   - ✅ Can export audit log

3. **Bulk operations:**
   - ✅ CSV import validates data
   - ✅ Import preview shows what will change
   - ✅ Import summary shows successes and errors
   - ✅ Export produces valid CSV

### 4.6 Rollback Plan

```sql
-- Rollback Phase 4
DROP FUNCTION IF EXISTS export_worksite_hierarchy_to_csv();
DROP FUNCTION IF EXISTS import_worksite_hierarchy_from_csv(TEXT);
DROP TABLE IF EXISTS worksites_hierarchy_audit_log;
DROP FUNCTION IF EXISTS log_worksite_hierarchy_changes();
DROP TRIGGER IF EXISTS trg_log_worksite_hierarchy_changes ON worksites;
DROP TABLE IF EXISTS worksites_location_history;
DROP FUNCTION IF EXISTS get_worksite_current_location(INT);
```

---

## Testing Strategy Summary

### Unit Tests

```sql
-- Test suite for hierarchy functions
-- File: supabase/tests/worksite_hierarchy_test.sql

-- Test 1: Validate hierarchy integrity
SELECT assert_hierarchy_no_cycles();
SELECT assert_hierarchy_no_orphans();
SELECT assert_hierarchy_paths_valid();

-- Test 2: Test closure table maintenance
SELECT assert_closure_correctness();

-- Test 3: Test audit logging
SELECT assert_audit_log_captures_changes();

-- Test 4: Test performance
SELECT assert_descendant_query_performance(<100);
SELECT assert_ancestor_query_performance(<100);
SELECT assert_rollup_query_performance(<200);
```

### Integration Tests

1. **End-to-end hierarchy creation:**
   - Create basin → field → installation
   - Verify closure table is updated
   - Verify audit log is populated
   - Verify materialized view refresh works

2. **Mobile facility tracking:**
   - Create drill rig worksite
   - Add location history entries
   - Move rig to new location
   - Verify history timeline is correct

3. **Operational network:**
   - Create hub-satellite relationships
   - Query network graph
   - Remove relationship
   - Verify network updates

### Performance Benchmarks

Run benchmarks before and after optimization:

```sql
-- Benchmark suite
\i benchmarks/hierarchy_performance_benchmarks.sql
```

**Expected improvements:**

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Get all descendants | 250ms | 80ms | 68% faster |
| Get all ancestors | 180ms | 40ms | 78% faster |
| Worker rollup by basin | 320ms | 90ms | 72% faster |
| Network graph query | N/A | 120ms | New feature |

---

## Migration Strategy

### Data Migration Steps

1. **Pre-migration validation:**
   ```sql
   -- Check for existing data issues
   SELECT * FROM validate_pre_migration_state();
   ```

2. **Backup current state:**
   ```sql
   -- Create backup table
   CREATE TABLE worksites_backup AS SELECT * FROM worksites;
   ```

3. **Run migrations in order:**
   ```bash
   # Phase 1
   supabase migration up 20260402180000_worksite_hierarchy_phase1.sql
   supabase migration up 20260402180001_worksite_hierarchy_reference_data.sql
   supabase migration up 20260402180002_worksite_hierarchy_migrate_existing.sql
   supabase migration up 20260402180003_worksite_hierarchy_populate_paths.sql
   supabase migration up 20260402180004_worksite_hierarchy_validation.sql

   # Phase 2
   supabase migration up 20260402190000_worksite_operational_hierarchy.sql
   supabase migration up 20260402190001_populate_operational_hierarchy.sql
   supabase migration up 20260402190002_operational_hierarchy_views.sql

   # Phase 3
   supabase migration up 20260402200000_worksite_geographic_closure.sql
   supabase migration up 20260402200001_worksite_hierarchy_reporting_mv.sql
   supabase migration up 20260402200002_hierarchy_automation.sql

   # Phase 4
   supabase migration up 20260402210000_worksite_location_history.sql
   supabase migration up 20260402210001_worksite_hierarchy_audit.sql
   supabase migration up 20260402210002_worksite_hierarchy_bulk_operations.sql
   ```

4. **Post-migration validation:**
   ```sql
   -- Verify data integrity
   SELECT * FROM validate_post_migration_state();

   -- Run test suite
   SELECT * FROM run_hierarchy_test_suite();
   ```

### Rollback Strategy

If migration fails:

1. **Identify failure point:**
   ```sql
   SELECT * FROM migration_logs WHERE status = 'failed';
   ```

2. **Rollback to last successful state:**
   ```bash
   # Rollback specific migration
   supabase migration down <migration_timestamp>
   ```

3. **Restore from backup if needed:**
   ```sql
   -- Restore worksites table
   TRUNCATE worksites;
   INSERT INTO worksites SELECT * FROM worksites_backup;
   ```

4. **Fix issue and retry:**
   - Address root cause
   - Update migration scripts
   - Re-run migration

---

## Success Metrics

### Phase 1 Success Criteria

- ✅ All worksites have correct `parent_worksite_id`
- ✅ Basin and field nodes exist for all regions
- ✅ Hierarchy paths are correctly generated
- ✅ Tree view UI renders hierarchy
- ✅ No performance regression on existing queries
- ✅ Cycle detection prevents circular references

### Phase 2 Success Criteria

- ✅ Hub-satellite relationships are modeled
- ✅ Operational network queries work
- ✅ Network graph visualizes relationships
- ✅ Relationship types are correctly categorized
- ✅ Distances are recorded where applicable

### Phase 3 Success Criteria

- ✅ Closure table improves query performance
- ✅ Materialized view refreshes successfully
- ✅ Performance targets are met
- ✅ Automated refresh schedule is working
- ✅ No stale data issues

### Phase 4 Success Criteria

- ✅ Mobile facility location tracking works
- ✅ Audit log captures all changes
- ✅ Bulk import/export functions correctly
- ✅ Timeline view shows location history
- ✅ All advanced features are tested

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1-2 | Phase 1 | Basic geographic hierarchy, UI tree view, validation |
| 3-4 | Phase 2 | Operational hierarchy, network graph, relationship views |
| 5-6 | Phase 3 | Closure table, materialized views, performance optimization |
| 7-8 | Phase 4 | Location tracking, audit logging, bulk operations |

**Total Duration:** 8 weeks

---

## Conclusion

This implementation plan provides a comprehensive, phased approach to adding hierarchical modeling to the Offshore Alliance Platform. Starting with a simple adjacency list model (Phase 1) and progressively adding more sophisticated features (operational hierarchy, performance optimization, and advanced features) ensures that each phase delivers value while building toward a complete solution.

The hybrid approach—combining `parent_worksite_id` for geographic hierarchy with dedicated junction tables for operational relationships—provides the flexibility needed to model real-world offshore facility structures while maintaining query performance and supporting future requirements.

**Next Steps:** Review `STREAM3_2_REFERENCE_DATA.md` for example hierarchical data and migration scripts.
