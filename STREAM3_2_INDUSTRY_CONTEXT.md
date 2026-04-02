# Stream 3.2: Industry Context — Offshore Facility Hierarchy

**Analysis Date:** 2026-04-02
**Agent:** Planning Agent 3.2 — Worksite Hierarchy Analysis
**Focus:** Real-world offshore oil & gas facility organization patterns

---

## Executive Summary

Offshore oil & gas facilities are organized in complex hierarchical structures that vary by region, development type, and operational model. Understanding these patterns is essential for designing a worksite hierarchy that serves the needs of organisers tracking employer activity, agreement coverage, and worker engagement across multiple facilities.

---

## 1. Offshore Facility Hierarchy Patterns

### 1.1 Geographic Hierarchy (Most Common)

The standard industry hierarchy follows geographic boundaries:

```
Basin
  └─ Field
      └─ Development/Installation
          └─ Facility/Asset
```

**Example: North Sea**
```
North Sea Basin
  └─ Brent Field
      ├─ Brent Alpha (Platform)
      ├─ Brent Bravo (Platform)
      ├─ Brent Charlie (Platform)
      └─ Brent Delta (Platform)
```

**Example: Browse Basin, Australia**
```
Browse Basin
  └─ Ichthys Field
      ├─ Ichthys Explorer (FPSO)
      ├─ Ichthys CPF (Central Processing Facility)
      └─ Darwin LNG (Onshore processing)
```

### 1.2 Operational Hierarchy (Hub-and-Spoke)

Large developments often use a hub model for infrastructure sharing:

```
Hub Facility (Processing Center)
  ├─ Satellite Platform A
  ├─ Satellite Platform B
  ├─ Satellite Platform C
  └─ Onshore Receiving Facility
```

**Example: Pluto Operations**
```
Pluto LNG (Onshore Hub)
  ├─ Pluto 2 (Platform)
  └─ Pluto LNG (Trains)
```

### 1.3 Project Lifecycle Hierarchy

Facilities may be organized by project phase:

```
Project Name
  ├─ Construction Phase
  │   ├─ Onshore Construction Site
  │   └─ Offshore Installation Site
  ├─ Operations Phase
  │   ├─ Production Facility
  │   └─ Supporting Infrastructure
  └─ Decommissioning Phase
      └─ Decommissioning Worksites
```

---

## 2. Facility Types and Characteristics

### 2.1 Offshore Facilities

| Type | Description | Hierarchy Role | Mobile/Fixed |
|------|-------------|----------------|--------------|
| **FPSO** (Floating Production Storage and Offloading) | Ship-shaped processing facility | Standalone or hub | Fixed (moored) |
| **FLNG** (Floating LNG) | LNG processing on a vessel | Standalone or hub | Fixed (moored) |
| **Platform** (Fixed) | Steel/jacket structure | Often satellite to hub | Fixed |
| **Semi-submersible** | Floating platform | Production hub | Fixed (moored) |
| **TLP** (Tension Leg Platform) | Compliant tower | Production facility | Fixed (moored) |
| **Spar** | Deepwater production | Production facility | Fixed (moored) |
| **Drill Rig** | Mobile drilling unit | Transient across facilities | **Mobile** |
| **Accommodation Platform** | Housing facility | Support facility | Fixed |
| **Wellhead Platform** | Minimal processing | Satellite to hub | Fixed |

### 2.2 Onshore Facilities

| Type | Description | Hierarchy Role |
|------|-------------|----------------|
| **LNG Plant** (Onshore_LNG) | Liquefaction and export | Receiving hub for offshore gas |
| **Gas Plant** (Gas_Plant) | Gas processing | Standalone or receiving hub |
| **CPF** (Central Processing Facility) | Onshore processing for offshore fields | Processing hub |
| **Onshore Facilities** | Supporting infrastructure | Support facility |

### 2.3 Infrastructure

| Type | Description | Hierarchy Role |
|------|-------------|----------------|
| **Pipeline** | Subsea flowlines/pipelines | Connects facilities |
| **Heliport** | Aviation logistics | Support infrastructure |
| **Airfield** | Aviation logistics | Support infrastructure |
| **Supply Base** | Logistics support | Support infrastructure |

---

## 3. Regional Hierarchy Patterns

### 3.1 North Sea (UK/Norway)

**Pattern:** Multi-platform fields with shared infrastructure

```
Brent Field (North Sea)
  ├─ Brent Alpha (Production)
  ├─ Brent Bravo (Production)
  ├─ Brent Charlie (Production)
  └─ Brent Delta (Production)
  └─ Sullom Voe (Onshore terminal)
```

**Key Characteristics:**
- Multiple platforms per field
- Common export pipelines
- Onshore receiving terminals
- Fields often named after geological formations

### 3.2 Gulf of Mexico (USA)

**Pattern:** Hub-and-spoke with independent platforms

```
Green Canyon Block
  ├– Hub Platform (Processing)
  ├– Satellite Platform A
  ├– Satellite Platform B
  └– Pipeline to Shore
```

**Key Characteristics:**
- Deepwater hubs with numerous satellites
- Independent ownership of satellites common
- Hub facilities often owned by major producers
- Federal lease blocks used as geographic units

### 3.3 Australia (Northwest Shelf)

**Pattern:** Onshore hubs with offshore gas fields

```
Browse Basin
  ├– Ichthys Field
  │   ├– Ichthys Explorer (FPSO)
  │   ├– Ichthys CPF (Central Processing Facility)
  │   └– Darwin LNG (Onshore)
  └– Prelude Field
      └– Prelude FLNG (Floating LNG)
```

**Key Characteristics:**
- Large offshore gas fields
- Onshore LNG processing hubs
- Long-distance subsea pipelines
- Floating facilities (FLNG) increasingly common

**Example: Wheatstone**
```
Wheatstone Field
  ├– Wheatstone LNG (Onshore hub)
  ├– Wheatstone Offshore (Platform)
  └– Iago Field (Satellite)
      └– Iago Platform
```

### 3.4 West Africa

**Pattern:** Deepwater FPSOs with satellite tiebacks

```
Block 17 (Angola)
  ├– Girassol FPSO (Hub)
  ├– Jasmine FPSO (Hub)
  └– Multiple satellite wells tied back to FPSOs
```

**Key Characteristics:**
- FPSOs as central hubs
- Subsea tiebacks from satellites
- Limited onshore infrastructure
- Multiple FPSOs per block

---

## 4. Organizational Hierarchy

### 4.1 Producer Hierarchy

```
Parent Company (e.g., Shell, Woodside, Chevron)
  ├– Operating Subsidiary (e.g., Shell Australia)
  │   ├– Asset Team (e.g., Pluto Asset)
  │   │   ├– Pluto LNG (Onshore)
  │   │   └– Pluto 2 (Offshore)
  │   └– Asset Team (e.g., Wheatstone Asset)
  │       ├– Wheatstone LNG (Onshore)
  │       └– Wheatstone Offshore
```

### 4.2 Contractor Hierarchy

```
Major Contractor (e.g., Wood, Baker Hughes, Schlumberger)
  ├– Contract A (Pluto LNG – Maintenance)
  ├– Contract B (Wheatstone – Drilling)
  └– Contract C (Ichthys – Catering)
```

### 4.3 Union Jurisdiction Hierarchy

```
Union (e.g., AWU, MUA)
  ├– Industry Sector (Offshore Oil & Gas)
  │   ├– Enterprise Agreement (e.g., Woodside Offshore EBA)
  │   │   ├– Covered Worksites (Pluto, Wheatstone, etc.)
  │   │   └– Covered Employers (Woodside + contractors)
  │   └– Enterprise Agreement (e.g., Inpex Ichthys EBA)
  │       ├– Covered Worksites (Ichthys CPF, FPSO, Darwin LNG)
  │       └– Covered Employers (Inpex + contractors)
```

---

## 5. Real-World Examples from Database

### 5.1 Pluto Operations (Woodside)

**Current Structure (via `programs` table):**
```
Program: "Pluto Operations"
  ├– Pluto LNG (Onshore_LNG) – Karratha, Western Australia
  └– Pluto 2 (Platform) – Offshore Western Australia
```

**Industry Context:**
- Pluto LNG is an onshore gas processing hub
- Pluto 2 is an offshore platform feeding gas to the hub
- Both operated by Woodside
- Multiple contractors work across both sites
- Workers rotate between onshore and offshore

### 5.2 Ichthys Operations (Inpex)

**Current Structure (via `programs` table):**
```
Program: "Ichthys Operations"
  ├– Ichthys CPF (Onshore_Facilities) – Browse Basin / Darwin
  ├– Ichthys FPSO (FPSO) – Offshore Browse Basin
  └– Darwin LNG (Onshore_LNG) – Darwin, Northern Territory
```

**Industry Context:**
- Ichthys FPSO processes gas offshore
- Pipelines transport gas to Darwin LNG for liquefaction
- Darwin LNG is the onshore export terminal
- Ichthys CPF may refer to onshore support facilities
- Complex supply chain with multiple contractors

### 5.3 Wheatstone (Chevron)

**Not yet in database as a program, but known structure:**
```
Wheatstone Development
  ├– Wheatstone LNG (Onshore_LNG) – Onslow, Western Australia
  ├– Wheatstone Offshore (Platform) – Offshore Western Australia
  └– Iago Field (Satellite)
      └– Iago Platform
```

**Industry Context:**
- Two-train LNG plant at Onslow
- Offshore platform feeds gas via pipeline
- Iago is a satellite field tied back to Wheatstone
- Multiple contractors across all sites

### 5.4 North Sea Examples (Not in Database)

For future expansion to UK/Norway operations:

```
Brent Field (Shell/Equinor)
  ├– Brent Alpha (Platform)
  ├– Brent Bravo (Platform)
  ├– Brent Charlie (Platform)
  └– Brent Delta (Platform)
  └– Sullom Voe (Onshore terminal)
```

```
Troll Field (Equinor)
  ├– Troll A (Platform)
  ├– Troll B (Platform)
  └– Troll C (Platform)
  └– Kollsnes (Onshore processing)
```

---

## 6. Key Industry Terminology

### 6.1 Geographic Terms

| Term | Definition | Database Mapping |
|------|------------|------------------|
| **Basin** | Large geological sedimentary area | `basin` column (VARCHAR) |
| **Field** | Geographic area containing hydrocarbon reserves | Not modeled |
| **Block/Lease** | Government-granted exploration area | Not modeled |
| **License** | Permit to explore/produce in a block | Not modeled |

### 6.2 Facility Terms

| Term | Definition | Database Mapping |
|------|------------|------------------|
| **Installation** | Fixed offshore structure (platform) | `worksite_type = 'Platform'` |
| **FPSO** | Floating Production Storage and Offloading vessel | `worksite_type = 'FPSO'` |
| **FLNG** | Floating Liquefied Natural Gas vessel | `worksite_type = 'FLNG'` |
| **CPF** | Central Processing Facility | `worksite_type = 'CPF'` |
| **Train** | LNG processing unit | Not modeled (part of LNG plant) |
| **Tieback** | Subsea connection to hub facility | Not modeled |

### 6.3 Operational Terms

| Term | Definition | Database Mapping |
|------|------------|------------------|
| **Hub** | Central processing facility with satellites | `programs` table |
| **Satellite** | Facility dependent on hub for processing | Not explicitly modeled |
| **Greenfield** | New development | `agreements.is_greenfield` |
| **Brownfield** | Expansion of existing facility | Not modeled |
| **Decommissioning** | Facility removal phase | `work_type = 'decommissioning'` in projects |

---

## 7. Union Organizing Implications

### 7.1 How Hierarchy Affects Organizing

| Hierarchy Level | Organizing Implication |
|-----------------|----------------------|
| **Basin** | Regional organizing strategy, logistics planning |
| **Field** | Multi-facility campaigns, shared employer negotiations |
| **Hub** | Central point for worker contacts, delegate networks |
| **Satellite** | May rely on hub for union access, communications |
| **Onshore Terminal** | Entry point for offshore workers, crew change logistics |

### 7.2 Agreement Coverage Patterns

**Single-Agreement Multi-Worksite:**
```
Woodside Offshore EBA
  └─ Covers: Pluto, Wheatstone, NWS, Angel, Goodwin, etc.
  └─ All worksites covered by same agreement
  └─ Same conditions across all sites
```

**Site-Specific Agreements:**
```
Ichthys EBA
  └─ Covers: Ichthys CPF, Ichthys FPSO, Darwin LNG only
  └─ Site-specific conditions
  └─ Separate from other Inpex operations
```

### 7.3 Contractor Mobility

**Pattern:** Contractors move between facilities within a program

```
Maintenance Contractor A
  ├– Workers rotate between: Pluto LNG → Pluto 2
  ├– Same employment conditions across both sites
  └– Union contact points at both locations
```

**Implication:** Hierarchy tracking helps identify:
- Which contractors work across multiple sites
- Where to find contractor representatives
- How many workers per contractor across all sites
- Which agreements cover which facilities

---

## 8. Mobile Facilities

### 8.1 Drill Rigs

**Characteristics:**
- Move between fields/facilities
- Contract-specific (drilling contracts)
- Workers follow rig, not facility
- May be at multiple locations over time

**Hierarchy Implications:**
- Should not have permanent parent_worksite_id
- Need location tracking over time
- May need "current location" vs. "home base" distinction

### 8.2 Accommodation/Vessels

**Characteristics:**
- Service multiple facilities
- Move based on operational needs
- Workers may be assigned to vessel, not facility

**Hierarchy Implications:**
- May be children of multiple facilities over time
- Need time-based location tracking

---

## 9. Data Migration Considerations

### 9.1 Existing Hierarchy Patterns in Database

From `worksite_hierarchy_report_rows` view, current hierarchy is:

**Geo → Service Type → Producer → Worksite**
```
Offshore > FPSO > Woodside > Pluto 2
Offshore > Platform > Inpex > Ichthys FPSO
Onshore > Onshore LNG > Woodside > Pluto LNG
```

**Producer → Geo → Worksite**
```
Woodside > Offshore > Pluto 2
Inpex > Onshore > Darwin LNG
```

### 9.2 Missing Hierarchical Relationships

To implement true industry-standard hierarchy:

| Missing Level | Example Values | Data Source |
|---------------|----------------|-------------|
| **Basin** | Browse, Carnarvon, Bonaparte | Partially in `basin` column |
| **Field** | Pluto, Ichthys, Wheatstone, Gorgon | Not present |
| **Development** | Ichthys Development, Wheatstone Development | Could be `programs` |
| **Installation** | North Rankin, Goodwyn, Angel | Not present |
| **Asset** | Train 1, Train 2, Compressor A | Not present |

---

## 10. Key Takeaways

### 10.1 Hierarchy is Region-Specific

- **North Sea:** Field > Platform (multiple platforms per field)
- **Australia:** Field > Onshore Hub + Offshore Facilities
- **Gulf of Mexico:** Block > Hub > Satellites
- **West Africa:** Block > FPSO > Subsea tiebacks

### 10.2 Hierarchy Serves Multiple Purposes

1. **Geographic:** Basin → Field → Installation
2. **Operational:** Hub → Satellites
3. **Organizational:** Producer → Asset Team → Facility
4. **Union:** Agreement → Covered Worksites → Employers

### 10.3 Current System Uses Flat Hierarchy

- `parent_worksite_id` exists but unused
- `programs` table handles grouping
- Hierarchy reporting uses computed paths
- No true multi-level facility relationships

### 10.4 Recommendations for Implementation

1. **Support multiple hierarchy types** (geographic, operational, organizational)
2. **Allow flexible depth** (not all fields need same number of levels)
3. **Track mobile facilities** (drill rigs, accommodation vessels)
4. **Enable time-based location** (facilities move, contracts change)
5. **Maintain agreement coverage mapping** (which agreement covers which facilities)

---

## Conclusion

Offshore facility hierarchy is complex and region-specific. The current database uses a flat model with `programs` for grouping. To properly model offshore facilities, the system should support multi-level hierarchies that reflect real-world industry patterns while meeting the needs of union organizers tracking employer activity, agreement coverage, and worker engagement across multiple facilities.

**Next Steps:** Review `STREAM3_2_HIERARCHY_OPTIONS.md` for detailed analysis of modeling approaches.
