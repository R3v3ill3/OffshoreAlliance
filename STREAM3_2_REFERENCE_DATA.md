# Stream 3.2: Reference Data — Worksite Hierarchy

**Analysis Date:** 2026-04-02
**Agent:** Planning Agent 3.2 — Worksite Hierarchy Analysis
**Focus:** Example hierarchical data and migration scripts for testing

---

## Executive Summary

This document provides realistic reference data for testing the worksite hierarchy implementation, including real offshore facility names from Australian operations and migration scripts for populating the hierarchy tables.

---

## Part 1: Australian Offshore Basins

### 1.1 Major Offshore Basins

```sql
-- =============================================
-- Reference Data: Australian Offshore Basins
-- =============================================

-- Insert major Australian offshore basins as grouping nodes
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, location_description,
                       basin, latitude, longitude)
VALUES
  -- Western Australia
  ('Browse Basin', 'Region', true, true, 'basin', true,
   'Western Australia offshore, 400km north of Broome',
   'Browse Basin', -17.5, 123.5),

  ('Carnarvon Basin', 'Region', true, true, 'basin', true,
   'Western Australia offshore, North West Shelf',
   'Carnarvon Basin', -21.0, 114.5),

  ('Perth Basin', 'Region', false, true, 'basin', true,
   'Western Australia, onshore and offshore',
   'Perth Basin', -32.0, 115.5),

  ('Bonaparte Basin', 'Region', true, true, 'basin', true,
   'Northern Territory offshore, Timor Sea',
   'Bonaparte Basin', -12.5, 129.0),

  -- Victoria / South Australia
  ('Otway Basin', 'Region', false, true, 'basin', true,
   'Victoria and South Australia offshore',
   'Otway Basin', -38.5, 143.0),

  ('Gippsland Basin', 'Region', false, true, 'basin', true,
   'Victoria offshore, Bass Strait',
   'Gippsland Basin', -38.5, 147.5),

  -- Queensland
  ('Surat Basin', 'Region', false, true, 'basin', true,
   'Queensland onshore',
   'Surat Basin', -27.0, 149.5),

  ('Bowen Basin', 'Region', false, true, 'basin', true,
   'Queensland onshore',
   'Bowen Basin', -23.5, 149.0),

  ('Carpentaria Basin', 'Region', false, true, 'basin', true,
   'Queensland offshore, Gulf of Carpentaria',
   'Carpentaria Basin', -15.0, 140.5)
ON CONFLICT (worksite_name) DO NOTHING;
```

### 1.2 Basin Hierarchy Structure

```
Browse Basin (basin)
  └─ Ichthys Field
  └─ Prelude Field
  └─ Calliance Field
  └─ Torosa Field

Carnarvon Basin (basin)
  └─ Pluto Field
  └─ Wheatstone Field
  └─ Gorgon Field
  └─ Jansz Field
  └─ North Rankin Field
  └─ Goodwyn Field
  └─ Angel Field
  └─ Echo/Yodel Field
  └─ Julimar/Brunello Field

Bonaparte Basin (basin)
  └─ Bayu-Undan Field
  └─ Sunrise Field
  └─ Laminaria Field
  └─ Corallina Field

Gippsland Basin (basin)
  └─ Barracouta Field
  └─ Snapper Field
  └─ Marlin Field
  └─ Kingfish Field
```

---

## Part 2: Browse Basin Facilities

### 2.1 Ichthys Development (Inpex)

```sql
-- =============================================
-- Reference Data: Browse Basin - Ichthys Development
-- =============================================

-- Insert Ichthys Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Ichthys Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Browse Basin'),
  'Browse Basin, Western Australia',
  'Browse Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Inpex')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Ichthys facilities
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Ichthys Explorer', 'FPSO', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Field'),
   'Ichthys Field, Browse Basin, 890km from Darwin',
   'Browse Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Inpex'),
   -16.5, 124.5),

  ('Ichthys CPF', 'CPF', false, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Field'),
   'Browse Basin / Darwin, Northern Territory',
   'Browse Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Inpex'),
   -12.5, 130.8),

  ('Darwin LNG', 'Onshore_LNG', false, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Field'),
   'Darwin, Northern Territory',
   'Browse Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Inpex'),
   -12.5, 130.8)
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert operational relationships
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Explorer'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Darwin LNG'),
  'export',
  true,
  true,
  890.0,
  'Ichthys Explorer processes gas, exports via 890km subsea pipeline to Darwin LNG'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;

INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Darwin LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Ichthys Explorer'),
  'logistics',
  true,
  890.0,
  'Darwin LNG provides logistics support for Ichthys Explorer operations'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;
```

### 2.2 Prelude Development (Shell)

```sql
-- =============================================
-- Reference Data: Browse Basin - Prelude Development
-- =============================================

-- Insert Prelude Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Prelude Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Browse Basin'),
  'Browse Basin, Western Australia',
  'Browse Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Shell')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Prelude FLNG
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Prelude FLNG',
  'FLNG',
  true,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Prelude Field'),
  'Prelude Field, Browse Basin, 475km north of Broome',
  'Browse Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Shell'),
  -16.0, 123.0
ON CONFLICT (worksite_name) DO NOTHING;
```

---

## Part 3: Carnarvon Basin Facilities

### 3.1 Pluto Development (Woodside)

```sql
-- =============================================
-- Reference Data: Carnarvon Basin - Pluto Development
-- =============================================

-- Insert Pluto Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Pluto Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Pluto LNG (onshore)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Pluto LNG',
  'Onshore_LNG',
  false,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto Field'),
  'Karratha, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
  -20.7, 116.6
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Pluto 2 (offshore platform)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Pluto 2',
  'Platform',
  true,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Pluto Field'),
  'Pluto Field, Carnarvon Basin, 180km from Karratha',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
  -19.5, 116.0
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert operational relationship
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
  180.0,
  'Pluto 2 processes gas offshore, exports via pipeline to Pluto LNG onshore'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;
```

### 3.2 Wheatstone Development (Chevron)

```sql
-- =============================================
-- Reference Data: Carnarvon Basin - Wheatstone Development
-- =============================================

-- Insert Wheatstone Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Wheatstone Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Wheatstone LNG (onshore)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Wheatstone LNG',
  'Onshore_LNG',
  false,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone Field'),
  'Onslow, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
  -21.6, 115.1
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Wheatstone Offshore (platform)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Wheatstone Offshore',
  'Platform',
  true,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone Field'),
  'Wheatstone Field, Carnarvon Basin',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
  -21.0, 114.5
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert operational relationship
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone Offshore'),
  'processing',
  true,
  true,
  50.0,
  'Wheatstone Offshore processes gas, exports via pipeline to Wheatstone LNG onshore'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;

-- Insert Iago Field (satellite to Wheatstone)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Iago Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia, adjacent to Wheatstone',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
  -21.0, 114.5
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Iago Platform
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Iago Platform',
  'Platform',
  true,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Iago Field'),
  'Iago Field, Carnarvon Basin',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
  -21.0, 114.5
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert operational relationships
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Iago Platform'),
  'processing',
  true,
  20.0,
  'Iago is a satellite field tied back to Wheatstone LNG'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO NOTHING;
```

### 3.3 Gorgon Development (Chevron)

```sql
-- =============================================
-- Reference Data: Carnarvon Basin - Gorgon Development
-- =============================================

-- Insert Gorgon Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Gorgon Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia, Barrow Island',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Gorgon LNG (onshore, Barrow Island)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Gorgon LNG',
  'Onshore_LNG',
  false,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Gorgon Field'),
  'Barrow Island, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
  -20.8, 115.4
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Gorgon Offshore facilities
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Gorgon Platform', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Gorgon Field'),
   'Gorgon Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
   -20.5, 115.0),

  ('Jansz Platform', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Gorgon Field'),
   'Jansz Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Chevron'),
   -20.0, 114.5)
ON CONFLICT (worksite_name) DO NOTHING;
```

### 3.4 North West Shelf Ventures (Woodside)

```sql
-- =============================================
-- Reference Data: Carnarvon Basin - North West Shelf
-- =============================================

-- Insert North Rankin Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'North Rankin Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert NWS facilities
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('North Rankin', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'North Rankin Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -19.5, 116.0),

  ('Goodwyn', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Goodwyn Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -19.5, 116.0),

  ('Angel', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Angel Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -19.5, 116.5),

  ('Echo/Yodel', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Echo/Yodel Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -19.8, 116.2),

  ('Cossack', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Cossack Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -20.0, 116.0),

  ('Wanaea', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Wanaea Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -20.0, 116.0),

  ('Okha', 'FPSO', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
   'Okha Field, Carnarvon Basin',
   'Carnarvon Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -20.0, 116.0)
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Karratha Gas Plant
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Karratha Gas Plant',
  'Gas_Plant',
  false,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'North Rankin Field'),
  'Karratha, Western Australia (NWS onshore processing)',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
  -20.7, 116.8
ON CONFLICT (worksite_name) DO NOTHING;
```

---

## Part 4: Bonaparte Basin Facilities

### 4.1 Bayu-Undan Development (ConocoPhillips/Santos)

```sql
-- =============================================
-- Reference Data: Bonaparte Basin - Bayu-Undan
-- =============================================

-- Insert Bayu-Undan Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Bayu-Undan Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Bonaparte Basin'),
  'Bonaparte Basin, Timor Sea',
  'Bonaparte Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'ConocoPhillips')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Bayu-Undan facilities
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Bayu-Undan Platform', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Bayu-Undan Field'),
   'Bayu-Undan Field, Bonaparte Basin, Timor Sea',
   'Bonaparte Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ConocoPhillips'),
   -12.0, 128.0),

  ('Darwin LNG (Bayu-Undan)', 'Onshore_LNG', false, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Bayu-Undan Field'),
   'Darwin, Northern Territory (separate from Ichthys)',
   'Bonaparte Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ConocoPhillips'),
   -12.5, 130.8)
ON CONFLICT (worksite_name) DO NOTHING;
```

### 4.2 Sunrise Development (Greater Sunrise - joint venture)

```sql
-- =============================================
-- Reference Data: Bonaparte Basin - Sunrise
-- =============================================

-- Insert Sunrise Field
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Sunrise Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Bonaparte Basin'),
  'Bonaparte Basin, Timor Sea (joint development zone)',
  'Bonaparte Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside')
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Sunrise facilities (planned)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Sunrise Platform', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Sunrise Field'),
   'Sunrise Field, Bonaparte Basin, Timor Sea (planned)',
   'Bonaparte Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -10.5, 127.0),

  ('Sunrise FLNG', 'FLNG', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Sunrise Field'),
   'Sunrise Field, Bonaparte Basin, Timor Sea (FLNG option)',
   'Bonaparte Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
   -10.5, 127.0)
ON CONFLICT (worksite_name) DO NOTHING;
```

---

## Part 5: Gippsland Basin Facilities

### 5.1 Bass Strait Facilities (ExxonMobil/BHP)

```sql
-- =============================================
-- Reference Data: Gippsland Basin - Bass Strait
-- =============================================

-- Insert major Gippsland Basin fields
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  field_name,
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Gippsland Basin'),
  'Gippsland Basin, Bass Strait, Victoria',
  'Gippsland Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia')
FROM (VALUES
  ('Barracouta Field'),
  ('Snapper Field'),
  ('Marlin Field'),
  ('Kingfish Field'),
  ('Halibut Field'),
  ('Mackerel Field')
) AS v(field_name)
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Gippsland Basin platforms
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Barracouta A', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Barracouta Field'),
   'Barracouta Field, Gippsland Basin, Bass Strait',
   'Gippsland Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia'),
   -38.5, 147.5),

  ('Snapper A', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Snapper Field'),
   'Snapper Field, Gippsland Basin, Bass Strait',
   'Gippsland Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia'),
   -38.5, 147.8),

  ('Marlin A', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Marlin Field'),
   'Marlin Field, Gippsland Basin, Bass Strait',
   'Gippsland Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia'),
   -38.8, 147.2),

  ('Kingfish A', 'Platform', true, true, 'installation',
   (SELECT worksite_id FROM worksites WHERE worksite_name = 'Kingfish Field'),
   'Kingfish Field, Gippsland Basin, Bass Strait',
   'Gippsland Basin',
   (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia'),
   -38.6, 147.0)
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert Longford Gas Plant (onshore processing)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Longford Gas Plant',
  'Gas_Plant',
  false,
  true,
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Gippsland Basin'),
  'Longford, Victoria (Gippsland Basin onshore processing)',
  'Gippsland Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'ExxonMobil Australia'),
  -38.2, 147.0
ON CONFLICT (worksite_name) DO NOTHING;
```

---

## Part 6: Mobile Facilities

### 6.1 Drill Rigs

```sql
-- =============================================
-- Reference Data: Mobile Facilities - Drill Rigs
-- =============================================

-- Insert drill rigs (mobile facilities)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  -- Transocean rigs
  ('Transocean Encounter', 'Drill_Centre', true, true, 'installation', NULL,
   'Mobile drill rig - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Transocean'),
   NULL, NULL),

  ('Transocean Legend', 'Drill_Centre', true, true, 'installation', NULL,
   'Mobile drill rig - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Transocean'),
   NULL, NULL),

  -- Noble rigs
  ('Noble Bob Douglas', 'Drill_Centre', true, true, 'installation', NULL,
   'Mobile drill rig - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Noble Corporation'),
   NULL, NULL),

  -- Valaris rigs
  ('Valaris DS-12', 'Drill_Centre', true, true, 'installation', NULL,
   'Mobile drill rig - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Valaris'),
   NULL, NULL),

  ('Valtaris JU-107', 'Drill_Centre', true, true, 'installation', NULL,
   'Mobile jack-up rig - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Valaris'),
   NULL, NULL)
ON CONFLICT (worksite_name) DO NOTHING;

-- Insert location history for a drill rig
INSERT INTO worksites_location_history (
  worksite_id, location_type, location_description,
  latitude, longitude, basin, effective_date, end_date, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Transocean Encounter'),
  'previous',
  'Pluto Field, Carnarvon Basin',
  -19.5, 116.0, 'Carnarvon Basin',
  '2024-01-01', '2024-06-30',
  'Drilling campaign at Pluto'
ON CONFLICT DO NOTHING;

INSERT INTO worksites_location_history (
  worksite_id, location_type, location_description,
  latitude, longitude, basin, effective_date, end_date, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Transocean Encounter'),
  'current',
  'Wheatstone Field, Carnarvon Basin',
  -21.0, 114.5, 'Carnarvon Basin',
  '2024-07-01', NULL,
  'Currently drilling at Wheatstone'
ON CONFLICT DO NOTHING;
```

### 6.2 Accommodation Vessels

```sql
-- =============================================
-- Reference Data: Mobile Facilities - Accommodation Vessels
-- =============================================

-- Insert accommodation vessels
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
VALUES
  ('Shell Fluyt', 'FPSO', true, true, 'installation', NULL,
   'Accommodation and construction vessel - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Shell'),
   NULL, NULL),

  ('Safe Brest', 'Platform', true, true, 'installation', NULL,
   'Accommodation vessel - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Prosafe'),
   NULL, NULL),

  ('Safe Esbjerg', 'Platform', true, true, 'installation', NULL,
   'Accommodation vessel - location varies',
   NULL, (SELECT employer_id FROM employers WHERE employer_name = 'Prosafe'),
   NULL, NULL)
ON CONFLICT (worksite_name) DO NOTHING;
```

---

## Part 7: Validation Queries

### 7.1 Hierarchy Integrity Checks

```sql
-- =============================================
-- Validation Queries for Worksite Hierarchy
-- =============================================

-- Check 1: Verify all worksites have correct hierarchy levels
SELECT
  hierarchy_level,
  COUNT(*) as count,
  is_grouping_node
FROM worksites
WHERE is_active = true
GROUP BY hierarchy_level, is_grouping_node
ORDER BY hierarchy_level;

-- Expected output:
-- hierarchy_level | count | is_grouping_node
-- ----------------+-------+-----------------
-- basin           |     8 | true
-- field           |    20 | true
-- installation    |    50 | false

-- Check 2: Verify no orphaned worksites
SELECT
  w.worksite_name,
  w.hierarchy_level,
  w.parent_worksite_id,
  'Orphan: parent not found' as issue
FROM worksites w
WHERE w.parent_worksite_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM worksites p
    WHERE p.worksite_id = w.parent_worksite_id
  );

-- Expected output: 0 rows

-- Check 3: Verify no circular references
WITH RECURSIVE cycle_check AS (
  SELECT
    worksite_id,
    worksite_name,
    parent_worksite_id,
    1 as depth,
    ARRAY[worksite_id] as path
  FROM worksites
  WHERE parent_worksite_id IS NOT NULL

  UNION ALL

  SELECT
    w.worksite_id,
    w.worksite_name,
    w.parent_worksite_id,
    cc.depth + 1,
    cc.path || w.worksite_id
  FROM worksites w
  JOIN cycle_check cc ON cc.parent_worksite_id = w.worksite_id
  WHERE NOT w.worksite_id = ANY(cc.path)
    AND cc.depth < 10
)
SELECT
  worksite_name,
  depth,
  'Circular reference detected' as issue
FROM cycle_check
WHERE depth >= 10;

-- Expected output: 0 rows

-- Check 4: Verify hierarchy paths are valid
SELECT
  worksite_name,
  hierarchy_path,
  hierarchy_depth,
  CASE
    WHEN hierarchy_path IS NULL THEN 'Missing path'
    WHEN hierarchy_path NOT LIKE '/%/' THEN 'Invalid path format'
    WHEN hierarchy_depth != (length(hierarchy_path) - length(replace(hierarchy_path, '/', ''))) - 1
      THEN 'Path depth mismatch'
    ELSE 'OK'
  END as path_status
FROM worksites
WHERE is_active = true
  AND hierarchy_level IN ('field', 'installation')
ORDER BY hierarchy_path;

-- Expected output: All rows show 'OK'

-- Check 5: Verify operational relationships
SELECT
  hw.worksite_name as hub_name,
  sw.worksite_name as satellite_name,
  woh.relationship_type,
  woh.distance_km,
  CASE
    WHEN woh.distance_km IS NULL THEN 'No distance recorded'
    WHEN woh.distance_km < 0 THEN 'Invalid distance'
    WHEN woh.distance_km > 1000 THEN 'Unusual distance (>1000km)'
    ELSE 'OK'
  END as distance_status
FROM worksites_operational_hierarchy woh
JOIN worksites hw ON hw.worksite_id = woh.hub_worksite_id
JOIN worksites sw ON sw.worksite_id = woh.satellite_worksite_id
WHERE woh.is_current = true
ORDER BY hw.worksite_name, sw.worksite_name;

-- Expected output: All rows show 'OK' or 'No distance recorded' for some relationships

-- Check 6: Verify closure table integrity
SELECT
  w.worksite_name,
  COUNT(c.ancestor_id) as ancestor_count,
  COUNT(c.descendant_id) as descendant_count,
  CASE
    WHEN COUNT(c.ancestor_id FILTER (WHERE c.depth = 0)) != 1
      THEN 'Missing self-reference'
    WHEN COUNT(c.ancestor_id) = 0 THEN 'No closure entries'
    ELSE 'OK'
  END as closure_status
FROM worksites w
LEFT JOIN worksites_geographic_closure c ON c.descendant_id = w.worksite_id
WHERE w.is_active = true
  AND w.hierarchy_level IN ('field', 'installation')
GROUP BY w.worksite_id, w.worksite_name
HAVING NOT (COUNT(c.ancestor_id) > 0)
ORDER BY w.worksite_name;

-- Expected output: 0 rows (all worksites should have closure entries)
```

### 7.2 Hierarchy Summary Reports

```sql
-- =============================================
-- Hierarchy Summary Reports
-- =============================================

-- Report 1: Basin → Field → Installation tree
WITH hierarchy_tree AS (
  SELECT
    b.worksite_name as basin_name,
    f.worksite_name as field_name,
    i.worksite_name as installation_name,
    i.worksite_type,
    (
      SELECT COUNT(*)
      FROM workers w
      WHERE w.worksite_id = i.worksite_id AND w.is_active = true
    ) as worker_count,
    (
      SELECT COUNT(DISTINCT ewr.employer_id)
      FROM employer_worksite_roles ewr
      WHERE ewr.worksite_id = i.worksite_id AND ewr.is_current = true
    ) as employer_count
  FROM worksites i
  JOIN worksites f ON f.worksite_id = i.parent_worksite_id
  JOIN worksites b ON b.worksite_id = f.parent_worksite_id
  WHERE i.is_active = true
    AND i.hierarchy_level = 'installation'
    AND i.is_grouping_node = false
)
SELECT
  basin_name,
  field_name,
  installation_name,
  worksite_type,
  worker_count,
  employer_count
FROM hierarchy_tree
ORDER BY
  basin_name,
  field_name,
  installation_name;

-- Report 2: Hub-satellite network
WITH hub_network AS (
  SELECT
    hw.worksite_name as hub_name,
    hw.worksite_type as hub_type,
    sw.worksite_name as satellite_name,
    sw.worksite_type as satellite_type,
    woh.relationship_type,
    woh.distance_km,
    woh.is_primary
  FROM worksites_operational_hierarchy woh
  JOIN worksites hw ON hw.worksite_id = woh.hub_worksite_id
  JOIN worksites sw ON sw.worksite_id = woh.satellite_worksite_id
  WHERE woh.is_current = true
)
SELECT
  hub_name,
  hub_type,
  satellite_name,
  satellite_type,
  relationship_type,
  distance_km,
  is_primary
FROM hub_network
ORDER BY
  hub_name,
  is_primary DESC,
  satellite_name;

-- Report 3: Mobile facility locations
WITH mobile_facilities AS (
  SELECT
    w.worksite_name,
    w.worksite_type,
    lh.location_type,
    lh.location_description,
    lh.basin,
    lh.effective_date,
    lh.end_date,
    lh.notes
  FROM worksites w
  JOIN worksites_location_history lh ON lh.worksite_id = w.worksite_id
  WHERE w.is_active = true
    AND lh.location_type IN ('current', 'previous')
    AND (lh.end_date IS NULL OR lh.end_date >= CURRENT_DATE - INTERVAL '6 months')
)
SELECT
  worksite_name,
  worksite_type,
  location_type,
  location_description,
  basin,
  effective_date,
  end_date,
  notes
FROM mobile_facilities
ORDER BY
  worksite_name,
  location_type DESC,
  effective_date DESC;

-- Report 4: Agreement coverage by hierarchy
WITH hierarchy_agreements AS (
  SELECT
    b.worksite_name as basin_name,
    f.worksite_name as field_name,
    w.worksite_name as installation_name,
    a.agreement_name,
    a.short_name,
    a.status,
    COUNT(DISTINCT w.worksite_id) as worksite_count
  FROM worksites w
  JOIN worksites f ON f.worksite_id = w.parent_worksite_id
  JOIN worksites b ON b.worksite_id = f.parent_worksite_id
  JOIN agreement_worksites aw ON aw.worksite_id = w.worksite_id
  JOIN agreements a ON a.agreement_id = aw.agreement_id
  WHERE w.is_active = true
    AND a.status = 'Current'
  GROUP BY
    b.worksite_name,
    f.worksite_name,
    w.worksite_name,
    a.agreement_name,
    a.short_name,
    a.status
)
SELECT
  basin_name,
  field_name,
  installation_name,
  agreement_name,
  short_name,
  status,
  worksite_count
FROM hierarchy_agreements
ORDER BY
  basin_name,
  field_name,
  installation_name,
  agreement_name;
```

---

## Part 8: Test Data Scenarios

### 8.1 Scenario 1: New Field Development

```sql
-- =============================================
-- Test Scenario: New Field Development
-- =============================================

-- Scenario: A new field "Brunello" is discovered in Carnarvon Basin
-- and needs to be added to the hierarchy

-- Step 1: Add the field node
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, is_grouping_node, parent_worksite_id,
                       location_description, basin, principal_employer_id)
SELECT
  'Brunello Field',
  'Gas_Field',
  true,
  true,
  'field',
  true,
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Carnarvon Basin'),
  'Carnarvon Basin, Western Australia',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside');

-- Step 2: Add the first installation (planned platform)
INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active,
                       hierarchy_level, parent_worksite_id,
                       location_description, basin, principal_employer_id,
                       latitude, longitude)
SELECT
  'Brunello Platform',
  'Platform',
  true,
  false,  -- Not yet active
  'installation',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Brunello Field'),
  'Brunello Field, Carnarvon Basin (planned development)',
  'Carnarvon Basin',
  (SELECT employer_id FROM employers WHERE employer_name = 'Woodside'),
  -20.5, 115.0;

-- Step 3: Refresh hierarchy paths and closure
SELECT regenerate_worksite_hierarchy_paths();
SELECT populate_geographic_closure();

-- Step 4: Verify the new hierarchy
SELECT
  b.worksite_name as basin,
  f.worksite_name as field,
  i.worksite_name as installation,
  w.hierarchy_path,
  w.hierarchy_depth
FROM worksites i
JOIN worksites f ON f.worksite_id = i.parent_worksite_id
JOIN worksites b ON b.worksite_id = f.parent_worksite_id
JOIN worksites w ON w.worksite_id = i.worksite_id
WHERE i.worksite_name = 'Brunello Platform';
```

### 8.2 Scenario 2: Facility Decommissioning

```sql
-- =============================================
-- Test Scenario: Facility Decommissioning
-- =============================================

-- Scenario: An old platform "Angel" is being decommissioned
-- and should be marked as inactive

-- Step 1: Deactivate the facility
UPDATE worksites
SET is_active = false
WHERE worksite_name = 'Angel';

-- Step 2: Add decommissioning project
INSERT INTO projects (project_name, worksite_id, work_type, project_status,
                     start_date, expected_end_date, notes)
SELECT
  'Angel Decommissioning',
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Angel'),
  'decommissioning',
  'active',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '2 years',
  'Decommissioning of Angel platform'
ON CONFLICT DO NOTHING;

-- Step 3: Update operational relationships (end_date)
UPDATE worksites_operational_hierarchy
SET
  is_current = false,
  end_date = CURRENT_DATE
WHERE satellite_worksite_id = (SELECT worksite_id FROM worksites WHERE worksite_name = 'Angel')
  AND is_current = true;

-- Step 4: Refresh materialized views
SELECT refresh_all_hierarchy_data();

-- Step 5: Verify the facility is excluded from active reporting
SELECT
  w.worksite_name,
  w.is_active,
  p.project_status,
  woh.is_current as is_satellite
FROM worksites w
LEFT JOIN projects p ON p.worksite_id = w.worksite_id
LEFT JOIN worksites_operational_hierarchy woh ON woh.satellite_worksite_id = w.worksite_id
WHERE w.worksite_name = 'Angel';
```

### 8.3 Scenario 3: Hub-Satellite Relationship Change

```sql
-- =============================================
-- Test Scenario: Hub-Satellite Relationship Change
-- =============================================

-- Scenario: Iago Platform is being tied back to Wheatstone LNG
-- (previously it was standalone)

-- Step 1: Add the operational relationship
INSERT INTO worksites_operational_hierarchy (
  hub_worksite_id, satellite_worksite_id, relationship_type,
  is_current, is_primary, distance_km, notes
)
SELECT
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone LNG'),
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Iago Platform'),
  'processing',
  true,
  false,
  20.0,
  'Iago tied back to Wheatstone LNG'
ON CONFLICT (hub_worksite_id, satellite_worksite_id, relationship_type) DO UPDATE SET
  is_current = true,
  end_date = NULL;

-- Step 2: Verify the operational network
SELECT
  hw.worksite_name as hub,
  sw.worksite_name as satellite,
  woh.relationship_type,
  woh.distance_km
FROM worksites_operational_hierarchy woh
JOIN worksites hw ON hw.worksite_id = woh.hub_worksite_id
JOIN worksites sw ON sw.worksite_id = woh.satellite_worksite_id
WHERE woh.is_current = true
  AND sw.worksite_name = 'Iago Platform'
ORDER BY woh.relationship_type;

-- Step 3: Get the full Wheatstone operational network
SELECT * FROM get_worksite_operational_network(
  (SELECT worksite_id FROM worksites WHERE worksite_name = 'Wheatstone LNG')
);
```

---

## Conclusion

This reference data provides a comprehensive set of realistic offshore facility names and hierarchical relationships from Australian operations. The data can be used for:

1. **Testing hierarchy queries** – Verify closure tables, path generation, and aggregation queries
2. **UI development** – Populate tree views, network graphs, and hierarchy explorers
3. **Performance testing** – Benchmark queries with realistic data volumes
4. **Migration validation** – Ensure hierarchical relationships are correctly established

The data covers major basins (Browse, Carnarvon, Bonaparte, Gippsland), key developments (Ichthys, Pluto, Wheatstone, Gorgon), and includes mobile facilities (drill rigs, accommodation vessels) to test time-based location tracking.

**Next Steps:** Use this reference data to populate test environments and validate the hierarchy implementation according to the plan in `STREAM3_2_IMPLEMENTATION_PLAN.md`.
