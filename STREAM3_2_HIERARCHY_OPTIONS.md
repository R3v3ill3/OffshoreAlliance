# Stream 3.2: Hierarchical Modeling Options Analysis

**Analysis Date:** 2026-04-02
**Agent:** Planning Agent 3.2 — Worksite Hierarchy Analysis
**Focus:** Technical approaches to modeling offshore facility hierarchies

---

## Executive Summary

This document analyzes four hierarchical modeling approaches for offshore facilities, evaluating their suitability for the Offshore Alliance Platform's use cases. Each option is assessed on query performance, update complexity, suitability for the offshore domain, and implementation effort.

---

## Option A: Single Parent-Child (Adjacency List)

### Model Description

Classic tree structure using `parent_worksite_id` self-referential foreign key:

```sql
worksites
  ├─ worksite_id
  ├─ worksite_name
  ├─ parent_worksite_id → worksites.worksite_id
  └─ ...
```

**Example hierarchy:**
```
Browse Basin (parent_worksite_id = NULL)
  └─ Ichthys Field (parent_worksite_id = Browse Basin)
      ├─ Ichthys FPSO (parent_worksite_id = Ichthys Field)
      ├─ Ichthys CPF (parent_worksite_id = Ichthys Field)
      └─ Darwin LNG (parent_worksite_id = Ichthys Field)
```

### Pros

| Aspect | Benefit |
|--------|---------|
| **Simplicity** | Easy to understand and implement |
| **Minimal schema changes** | Column already exists |
| **Referential integrity** | FK constraint prevents orphaned nodes |
| **Insert performance** | Single INSERT to add child node |
| **Update performance** | Single UPDATE to move subtree |
| **Storage** | Minimal overhead (one INT per row) |
| **Industry standard** | Widely used pattern, well-documented |

### Cons

| Aspect | Limitation |
|--------|------------|
| **Query depth** | Recursive CTEs needed for descendants/ancestors |
| **Deep hierarchies** | Performance degrades with 4+ levels |
| **Aggregation** | Expensive to get all descendants for rollups |
| **Multiple parents** | Cannot model a facility belonging to multiple hierarchies |
| **Path queries** | No built-in path materialization |
| **Leaf node detection** | Requires subquery to find children |

### Query Examples

**Get all ancestors:**
```sql
WITH RECURSIVE ancestors AS (
  SELECT worksite_id, worksite_name, parent_worksite_id, 1 AS level
  FROM worksites WHERE worksite_id = :target_id
  UNION ALL
  SELECT w.worksite_id, w.worksite_name, w.parent_worksite_id, a.level + 1
  FROM worksites w
  JOIN ancestors a ON w.worksite_id = a.parent_worksite_id
)
SELECT * FROM ancestors WHERE level > 1;
```

**Get all descendants:**
```sql
WITH RECURSIVE descendants AS (
  SELECT worksite_id, worksite_name, parent_worksite_id
  FROM worksites WHERE worksite_id = :root_id
  UNION ALL
  SELECT w.worksite_id, w.worksite_name, w.parent_worksite_id
  FROM worksites w
  JOIN descendants d ON w.parent_worksite_id = d.worksite_id
)
SELECT * FROM descendants WHERE worksite_id != :root_id;
```

**Count descendants per node:**
```sql
SELECT
  parent.worksite_id,
  parent.worksite_name,
  COUNT(child.worksite_id) as descendant_count
FROM worksites parent
LEFT JOIN worksites child ON child.parent_worksite_id = parent.worksite_id
GROUP BY parent.worksite_id, parent.worksite_name;
```

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Insert | O(1) | Single row insert |
| Update parent | O(1) | Single column update |
| Get immediate children | O(1) with index | Index on `parent_worksite_id` |
| Get all descendants | O(n) | Recursive CTE, n = tree size |
| Get all ancestors | O(d) | Recursive CTE, d = depth |
| Subtree move | O(1) | Update parent_worksite_id on root |
| Rollup aggregation | O(n) | Must query all descendants |

### Suitability for Offshore Domain

| Use Case | Fit | Notes |
|----------|-----|-------|
| Basin → Field → Installation | **Good** | 3-level depth manageable |
| Hub → Satellites | **Good** | Natural parent-child fit |
| Multi-hierarchy (geo + operational) | **Poor** | Cannot have 2 parents |
| Mobile facilities | **Fair** | Can update parent, but loses history |
| Agreement coverage mapping | **Fair** | Need junction table anyway |

### Implementation Effort

| Task | Effort |
|------|--------|
| Schema changes | **Low** — Column exists, just needs data |
| Index optimization | **Low** — Index already exists |
| Data migration | **Medium** — Need to populate hierarchy |
| Query development | **Medium** — Recursive CTEs for hierarchies |
| UI updates | **Medium** — Tree components, breadcrumbs |
| Testing | **Medium** — Test recursion, edge cases |

**Total Effort:** Medium

---

## Option B: Multiple Hierarchy Types (Typed Relationships)

### Model Description

Separate junction tables for different hierarchy types:

```sql
-- Geographic hierarchy
worksites_geo_hierarchy
  ├─ id
  ├─ parent_worksite_id → worksites.worksite_id
  ├─ child_worksite_id → worksites.worksite_id
  ├─ hierarchy_level (ENUM: basin, field, installation, facility)
  └─ is_primary (BOOLEAN)

-- Operational hierarchy
worksites_ops_hierarchy
  ├─ id
  ├─ hub_worksite_id → worksites.worksite_id
  ├─ satellite_worksite_id → worksites.worksite_id
  ├─ relationship_type (ENUM: processing, export, support)
  └─ is_primary (BOOLEAN)

-- Program hierarchy (existing)
program_worksites
  ├─ id
  ├─ program_id → programs.program_id
  ├─ worksite_id → worksites.worksite_id
  ├─ is_current
  └─ is_primary
```

**Example relationships:**
```
Geographic:
  Browse Basin (level: basin) → Ichthys Field (level: field)
  Ichthys Field (level: field) → Ichthys FPSO (level: installation)

Operational:
  Darwin LNG (hub) → Ichthys FPSO (satellite, type: export)
  Pluto LNG (hub) → Pluto 2 (satellite, type: processing)
```

### Pros

| Aspect | Benefit |
|--------|---------|
| **Multiple hierarchies** | Can model geo, operational, organizational simultaneously |
| **Flexibility** | Each hierarchy type can have different attributes |
| **Query performance** | Direct joins for each hierarchy type |
| **Explicit relationships** | Clear semantic meaning of each link |
| **Typed relationships** | Enforce business rules via CHECK constraints |
| **Faceted browsing** | Easy to filter by hierarchy type |
| **Future extensibility** | Add new hierarchy types without disrupting existing |

### Cons

| Aspect | Limitation |
|--------|------------|
| **Schema complexity** | Multiple junction tables to maintain |
| **Insert overhead** | Multiple INSERTs for multi-hierarchy nodes |
| **Update complexity** | May need updates across multiple tables |
| **Data consistency** | Risk of orphaned relationships if not transactional |
| **Query complexity** | Need to UNION or join multiple tables for "all hierarchies" |
| **Storage overhead** | Multiple rows per relationship |
| **Referential integrity** | More FK constraints to validate |

### Query Examples

**Get geographic hierarchy path:**
```sql
WITH geo_path AS (
  SELECT
    w.worksite_id,
    w.worksite_name,
    h.hierarchy_level,
    ROW_NUMBER() OVER (ORDER BY h.hierarchy_level) AS level_order
  FROM worksites w
  JOIN worksites_geo_hierarchy h ON h.child_worksite_id = w.worksite_id
  WHERE w.worksite_id = :target_id
)
SELECT * FROM geo_path ORDER BY level_order;
```

**Get all satellites for a hub:**
```sql
SELECT
  w.worksite_id,
  w.worksite_name,
  o.relationship_type
FROM worksites w
JOIN worksites_ops_hierarchy o ON o.satellite_worksite_id = w.worksite_id
WHERE o.hub_worksite_id = :hub_id
  AND o.is_current = true;
```

**Get all worksites in basin (transitive):**
```sql
WITH RECURSIVE basin_worksites AS (
  SELECT child_worksite_id, parent_worksite_id
  FROM worksites_geo_hierarchy
  WHERE parent_worksite_id = :basin_id
  UNION ALL
  SELECT h.child_worksite_id, h.parent_worksite_id
  FROM worksites_geo_hierarchy h
  JOIN basin_worksites b ON h.parent_worksite_id = b.child_worksite_id
)
SELECT DISTINCT w.*
FROM basin_worksites bw
JOIN worksites w ON w.worksite_id = bw.child_worksite_id;
```

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Insert relationship | O(1) | Single INSERT per hierarchy type |
| Get immediate children | O(1) with index | Direct join with FK |
| Get all descendants (single type) | O(n) | Recursive CTE per hierarchy |
| Get all descendants (all types) | O(n × t) | Recursive CTE × hierarchy types |
| Cross-hierarchy query | O(n) | UNION across hierarchy tables |
| Rollup by hierarchy type | O(n) | Filter by type, then aggregate |

### Suitability for Offshore Domain

| Use Case | Fit | Notes |
|----------|-----|-------|
| Basin → Field → Installation | **Excellent** | Dedicated geographic hierarchy |
| Hub → Satellites | **Excellent** | Dedicated operational hierarchy |
| Multi-hierarchy | **Excellent** | Core strength of this approach |
| Mobile facilities | **Good** | Can have time-based relationships |
| Agreement coverage mapping | **Good** | Separate hierarchy or use existing |

### Implementation Effort

| Task | Effort |
|------|--------|
| Schema changes | **High** — Multiple new tables |
| Index optimization | **Medium** — Indexes on FKs per table |
| Data migration | **High** — Populate multiple hierarchies |
| Query development | **High** — Queries per hierarchy type |
| UI updates | **High** — Tabs/filters for hierarchy types |
| Testing | **High** — Test each hierarchy type |

**Total Effort:** High

---

## Option C: Materialized Path (Path Enumeration)

### Model Description

Store full path from root to each node:

```sql
worksites
  ├─ worksite_id
  ├─ worksite_name
  ├─ hierarchy_path VARCHAR(500)  -- e.g., "/1/4/15/"
  ├─ hierarchy_depth INT           -- e.g., 3
  └─ ...
```

**Example data:**
```
worksite_id | worksite_name   | hierarchy_path | depth
1           | Browse Basin    | /1/            | 1
4           | Ichthys Field   | /1/4/          | 2
15          | Ichthys FPSO    | /1/4/15/       | 3
16          | Ichthys CPF     | /1/4/16/       | 3
17          | Darwin LNG      | /1/4/17/       | 3
```

### Pros

| Aspect | Benefit |
|--------|---------|
| **Query descendants** | Simple pattern match: `WHERE path LIKE '/1/4/%'` |
| **Query ancestors** | Parse path string or string operations |
| **Depth calculation** | Pre-computed, no recursion needed |
| **Sorting** | Natural ordering by path |
| **Leaf node detection** | Compare depth to max depth of children |
| **Read performance** | Excellent for hierarchy queries |
| **Materialized views** | Easy to create reporting snapshots |

### Cons

| Aspect | Limitation |
|--------|------------|
| **Path length limit** | VARCHAR(500) limits depth (~100 nodes) |
| **Update complexity** | Moving subtrees requires updating all descendants |
| **Referential integrity** | No FK constraint, can have broken paths |
| **Circular references** | Possible if not validated |
| **ID changes** | Changing worksite_id breaks all paths |
| **Multiple hierarchies** | Need separate path columns per hierarchy |
| **String parsing** | Need to split/parse paths for many operations |

### Query Examples

**Get all descendants:**
```sql
SELECT *
FROM worksites
WHERE hierarchy_path LIKE '/1/4/%'
ORDER BY hierarchy_path;
```

**Get all ancestors:**
```sql
-- Option 1: Parse path (PostgreSQL)
SELECT *
FROM worksites
WHERE worksite_id = ANY(
  SELECT unnest(string_to_array(substring(hierarchy_path FROM 2, LENGTH(hierarchy_path) - 2), '/')::INT[])
);

-- Option 2: Recursive CTE on path
WITH RECURSIVE ancestors AS (
  SELECT worksite_id, worksite_name, hierarchy_path
  FROM worksites WHERE worksite_id = :target_id
  UNION ALL
  SELECT w.worksite_id, w.worksite_name, w.hierarchy_path
  FROM worksites w
  JOIN ancestors a ON w.hierarchy_path = SUBSTRING(a.hierarchy_path FROM 1 FOR LENGTH(a.hierarchy_path) - 1) || '/'
)
SELECT * FROM ancestors;
```

**Get subtree depth:**
```sql
SELECT hierarchy_depth, COUNT(*) as node_count
FROM worksites
WHERE hierarchy_path LIKE '/1/4/%'
GROUP BY hierarchy_depth
ORDER BY hierarchy_depth;
```

**Insert new node:**
```sql
-- Get parent's path and depth
SELECT hierarchy_path, hierarchy_depth
INTO v_parent_path, v_parent_depth
FROM worksites
WHERE worksite_id = :parent_id;

-- Insert with computed path
INSERT INTO worksites (worksite_name, hierarchy_path, hierarchy_depth, ...)
VALUES (
  :name,
  v_parent_path || NEW_ID::TEXT || '/',
  v_parent_depth + 1,
  ...
);
```

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Insert | O(1) | Need parent's path + generate new path |
| Update parent (single node) | O(1) | Update path string |
| Update parent (subtree move) | O(n) | Update all descendant paths |
| Get immediate children | O(1) | Filter by path pattern AND depth |
| Get all descendants | O(n) | Pattern match on path |
| Get all ancestors | O(d) | Parse path string |
| Rollup aggregation | O(n) | Pattern match + aggregate |

### Suitability for Offshore Domain

| Use Case | Fit | Notes |
|----------|-----|-------|
| Basin → Field → Installation | **Good** | Shallow depth works well |
| Hub → Satellites | **Good** | Fast descendant queries |
| Multi-hierarchy | **Fair** | Need separate path columns |
| Mobile facilities | **Poor** | Path updates expensive |
| Agreement coverage mapping | **Poor** | Not suited for many-to-many |

### Implementation Effort

| Task | Effort |
|------|--------|
| Schema changes | **Medium** — Add columns, triggers |
| Index optimization | **Medium** — Index on path, depth |
| Data migration | **High** — Generate paths for all nodes |
| Query development | **Low** — Simple pattern queries |
| UI updates | **Medium** — Breadcrumbs from path |
| Testing | **Medium** — Test path generation, updates |

**Total Effort:** Medium-High

---

## Option D: Closure Table (Transitive Closure)

### Model Description

Separate table storing all ancestor-descendant relationships:

```sql
-- Main table
worksites
  ├─ worksite_id
  ├─ worksite_name
  └─ ... (no parent_worksite_id needed)

-- Closure table
worksites_closure
  ├─ ancestor_id INT → worksites.worksite_id
  ├─ descendant_id INT → worksites.worksite_id
  ├─ depth INT  -- Distance between ancestor and descendant
  └─ PRIMARY KEY (ancestor_id, descendant_id)
```

**Example data:**
```
ancestor_id | descendant_id | depth
1 (Basin)   | 1 (Basin)     | 0
1 (Basin)   | 4 (Field)     | 1
1 (Basin)   | 15 (FPSO)     | 2
4 (Field)   | 4 (Field)     | 0
4 (Field)   | 15 (FPSO)     | 1
15 (FPSO)   | 15 (FPSO)     | 0
```

### Pros

| Aspect | Benefit |
|--------|---------|
| **Query descendants** | Single SELECT on closure table |
| **Query ancestors** | Single SELECT on closure table |
| **Query depth** | Pre-computed, no recursion |
| **Subtree operations** | Easy to insert/delete subtrees |
| **Aggregation** | Direct joins for rollups |
| **Performance** | Excellent for read-heavy workloads |
| **No recursion** | All queries are simple joins |

### Cons

| Aspect | Limitation |
|--------|------------|
| **Storage overhead** | O(n²) for dense hierarchies |
| **Insert overhead** | O(n) to add closure rows for each ancestor |
| **Update complexity** | Deleting subtree requires multiple DELETEs |
| **Table maintenance** | Need triggers or app logic to keep closure current |
| **Multiple hierarchies** | Need separate closure tables or type column |
| **Not intuitive** | Harder to understand than adjacency list |

### Query Examples

**Get all descendants:**
```sql
SELECT d.*
FROM worksites d
JOIN worksites_closure c ON c.descendant_id = d.worksite_id
WHERE c.ancestor_id = :root_id AND c.depth > 0
ORDER BY c.depth, d.worksite_name;
```

**Get all ancestors:**
```sql
SELECT a.*
FROM worksites a
JOIN worksites_closure c ON c.ancestor_id = a.worksite_id
WHERE c.descendant_id = :target_id AND c.depth > 0
ORDER BY c.depth DESC;
```

**Get immediate children:**
```sql
SELECT d.*
FROM worksites d
JOIN worksites_closure c ON c.descendant_id = d.worksite_id
WHERE c.ancestor_id = :parent_id AND c.depth = 1;
```

**Count descendants per node:**
```sql
SELECT
  a.worksite_id,
  a.worksite_name,
  COUNT(c.descendant_id) - 1 as descendant_count  -- -1 to exclude self
FROM worksites a
JOIN worksites_closure c ON c.ancestor_id = a.worksite_id
GROUP BY a.worksite_id, a.worksite_name
HAVING COUNT(c.descendant_id) > 1;
```

**Insert new node:**
```sql
-- 1. Insert the node
INSERT INTO worksites (worksite_name, ...) VALUES (:name, ...);

-- 2. Add self-reference
INSERT INTO worksites_closure (ancestor_id, descendant_id, depth)
VALUES (:new_id, :new_id, 0);

-- 3. Add all ancestor relationships
INSERT INTO worksites_closure (ancestor_id, descendant_id, depth)
SELECT
  c.ancestor_id,
  :new_id,
  c.depth + 1
FROM worksites_closure c
WHERE c.descendant_id = :parent_id;
```

**Delete subtree:**
```sql
-- Delete all closure rows for the subtree
DELETE FROM worksites_closure
WHERE descendant_id IN (
  SELECT descendant_id
  FROM worksites_closure
  WHERE ancestor_id = :subtree_root_id
);

-- Delete the nodes
DELETE FROM worksites
WHERE worksite_id IN (
  SELECT descendant_id
  FROM worksites_closure
  WHERE ancestor_id = :subtree_root_id
);
```

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Insert | O(n) | Need closure rows for all ancestors |
| Delete | O(n) | Delete closure rows for subtree |
| Update parent | O(n) | Delete old closures, insert new ones |
| Get immediate children | O(1) with index | Filter on depth = 1 |
| Get all descendants | O(n) | Direct SELECT on closure |
| Get all ancestors | O(n) | Direct SELECT on closure |
| Rollup aggregation | O(n) | Direct join on closure |

### Suitability for Offshore Domain

| Use Case | Fit | Notes |
|----------|-----|-------|
| Basin → Field → Installation | **Excellent** | Fast queries, good performance |
| Hub → Satellites | **Excellent** | Efficient descendant queries |
| Multi-hierarchy | **Fair** | Need separate closure tables |
| Mobile facilities | **Fair** | Can update closure, but requires logic |
| Agreement coverage mapping | **Poor** | Better with junction tables |

### Implementation Effort

| Task | Effort |
|------|--------|
| Schema changes | **Medium** — Add closure table, triggers |
| Index optimization | **Medium** — Indexes on ancestor, descendant, depth |
| Data migration | **High** — Populate closure for all relationships |
| Query development | **Low** — Simple queries, no recursion |
| UI updates | **Medium** — Use closure for hierarchy display |
| Testing | **High** — Test triggers, closure maintenance |

**Total Effort:** Medium-High

---

## Comparison Summary

### Performance Comparison

| Query Type | Option A (Adjacency) | Option B (Typed) | Option C (Path) | Option D (Closure) |
|------------|---------------------|------------------|-----------------|-------------------|
| Get immediate children | O(1) ✓ | O(1) ✓ | O(1) ✓ | O(1) ✓ |
| Get all descendants | O(n) | O(n × t) | O(n) ✓ | O(n) ✓ |
| Get all ancestors | O(d) | O(d × t) | O(d) ✓ | O(n) ✓ |
| Subtree insert | O(1) ✓ | O(1) ✓ | O(1) | O(n) |
| Subtree move | O(1) ✓ | O(t) | O(n) | O(n) |
| Rollup aggregation | O(n) | O(n × t) | O(n) ✓ | O(n) ✓ |
| Read performance | Fair | Good | Excellent ✓ | Excellent ✓ |
| Write performance | Excellent ✓ | Fair | Fair | Poor |

**Legend:** ✓ = Best, t = number of hierarchy types, d = depth, n = tree size

### Storage Comparison

| Option | Storage Overhead | Notes |
|--------|-----------------|-------|
| Option A | Minimal (1 INT per row) | ~4 bytes per row |
| Option B | Medium (1 row per relationship type) | ~50-100 bytes per relationship |
| Option C | Low-Medium (path string + depth) | ~20-100 bytes per row |
| Option D | High (n rows for n-node tree) | O(n²) worst case |

### Complexity Comparison

| Aspect | Option A | Option B | Option C | Option D |
|--------|----------|----------|----------|----------|
| Schema simplicity | ✓ | ✗ | ✓ | ✓ |
| Query simplicity | Fair | ✗ | ✓ | ✓ |
| Maintenance | ✓ | Fair | Fair | ✗ |
| Intuitiveness | ✓ | ✓ | Fair | ✗ |
| Learning curve | Low | High | Medium | High |

---

## Recommended Approach

### Recommendation: **Option B (Multiple Hierarchy Types) with Option A (Adjacency List) Foundation**

**Rationale:**

1. **Offshore domain has multiple valid hierarchies:**
   - Geographic: Basin → Field → Installation
   - Operational: Hub → Satellites
   - Organizational: Producer → Asset Team → Facility
   - Programmatic: Program → Worksites (already exists)

2. **Flexibility for future needs:**
   - Can add new hierarchy types without disrupting existing
   - Each type can have its own attributes (e.g., relationship_type)
   - Supports faceted browsing and filtering

3. **Pragmatic implementation:**
   - Keep `parent_worksite_id` as the **primary geographic hierarchy**
   - Add `worksites_ops_hierarchy` for hub-satellite relationships
   - Keep existing `program_worksites` for program grouping
   - This reduces initial effort while enabling multi-hierarchy

4. **Performance characteristics:**
   - Direct joins for each hierarchy type (no recursion needed for immediate relationships)
   - Can add closure tables later for frequently-accessed hierarchies
   - Indexes on FKs provide good query performance

### Hybrid Implementation Plan

**Phase 1: Foundation (Week 1-2)**
- Keep `parent_worksite_id` for **geographic hierarchy**
- Populate with Basin → Field → Installation relationships
- Add validation triggers to prevent cycles
- Create migration scripts for reference data

**Phase 2: Operational Hierarchy (Week 3-4)**
- Add `worksites_ops_hierarchy` table
- Populate with Hub → Satellite relationships
- Add UI for managing operational relationships
- Create reporting views

**Phase 3: Optimization (Week 5-6)**
- Add closure tables for frequently-accessed hierarchies
- Create materialized views for reporting
- Optimize indexes based on query patterns
- Add caching for common hierarchy queries

**Phase 4: Advanced Features (Week 7-8)**
- Add time-based location tracking for mobile facilities
- Implement hierarchy change audit logging
- Create hierarchy comparison tools (geo vs. operational)
- Add bulk hierarchy import/export

---

## Decision Matrix

Use this matrix to evaluate options against specific requirements:

| Requirement | Option A | Option B | Option C | Option D | Recommended |
|-------------|----------|----------|----------|----------|-------------|
| Support multiple hierarchy types | ✗ | ✓ | ✗ | ✗ | **Option B** |
| Fast descendant queries | Fair | Good | ✓ | ✓ | **Option C/D** |
| Fast subtree moves | ✓ | Fair | ✗ | ✗ | **Option A** |
| Intuitive schema | ✓ | Fair | Fair | ✗ | **Option A** |
| Minimal schema changes | ✓ | ✗ | Fair | Fair | **Option A** |
| Referential integrity | ✓ | ✓ | ✗ | ✓ | **Option A/B/D** |
| Support mobile facilities | Fair | ✓ | ✗ | Fair | **Option B** |
| Agreement coverage mapping | Fair | Good | ✗ | ✗ | **Option B** |
| Low implementation effort | ✓ | ✗ | Fair | Fair | **Option A** |
| Future extensibility | Fair | ✓ | Fair | Fair | **Option B** |

**Legend:** ✓ = Fully supports, Fair = Partially supports, ✗ = Does not support

---

## Conclusion

For the Offshore Alliance Platform, **Option B (Multiple Hierarchy Types) with Option A foundation** provides the best balance of flexibility, performance, and suitability for the offshore domain. The hybrid approach allows the system to model real-world offshore facility hierarchies while maintaining query performance and supporting future requirements.

The implementation should be **phased**, starting with the adjacency list (`parent_worksite_id`) for the primary geographic hierarchy, then adding specialized junction tables for operational and organizational hierarchies as needed. Closure tables or materialized paths can be added later for performance optimization if query patterns demand it.

**Next Steps:** Review `STREAM3_2_IMPLEMENTATION_PLAN.md` for detailed implementation roadmap.
