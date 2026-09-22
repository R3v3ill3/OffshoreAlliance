# OA Universe alignment — data architecture review and data-washing plan

Prepared 22 September 2026 on branch `claude/data-architecture-cleaning-plan-3ib8jt`. Companion files:

- `reference/OA_universe_context_for_database_reconciliation.md` — the map owner's account of the workbook and of the modelling distinctions it forces (read this first).
- `reference/OA_universe.xlsx` and `reference/oa-universe-tabs/*.csv` — the September 2026 sector map, one CSV per tab.
- `worksheets/employers_adjudication_2026-09-22.csv` and `worksheets/worksites_adjudication_2026-09-22.csv` — every employer and worksite row in production with a proposed canonical mapping and the question it raises. These are the first-round interrogation instruments.
- `../../scripts/data-hygiene/oa-universe/*.sql` — the read-only profiling pack that produced the numbers below and that re-measures every round.

## 0. Summary

The Organising DB already has most of the *tables* the OA Universe needs: employers with parents and aliases, worksites with a parent link, employer–worksite roles, work scopes, agreements with worksite and employer junctions, a dormant contract/assignment layer, campaign universes, groups, units and families, and organiser patches. What it lacks is the *grain* the map is built on and the *discipline* that keeps names unique:

1. **No engagement grain.** The map's atomic fact is "organisation X holds scope Y at facility Z for principal P, from–to, with confidence C". The database records pieces of that in four unconnected places (`employer_worksite_roles`, `worksite_scopes`, `agreement_worksites`, and the employer/worksite pair on each worker) and has never used the two tables that were designed for it (`worksite_contracts`, `worker_assignments`: 0 rows each). 2,393 active workers sit on an employer × worksite pair that the roles table does not know about.
2. **Three naming lineages collide in `employers` and `worksites`, and the import path keeps them colliding.** UPPERCASE legal names from the March agreements spreadsheet (59 employers), mixed-case short names from the 1 April worker import (87), and a stream of new rows created when the September membership sync met a name it did not recognise (16 so far, e.g. `ugl`, `Siem Offshore`, `ATC`). The two import wizards use three different fuzzy matchers that auto-accept at 0.35 and 0.6, none of which reads the alias tables; unmatched names become new rows on a click; the raw source strings are discarded; and the one tool built to cluster and alias variants (the reference-data wizard) is not on the import path and silently fails to save employer aliases (§1.9). Result: 16 employer clusters that are one organisation (Chevron ×4, Woodside ×4, Jadestone ×4, Inpex, Shell, Santos, MODEC, Noble, UGL, Downer, Auriga, Solstad, Saipem, ATC, Toll, Trace) plus pairs the first-token test misses (Sea1 / Siem Offshore, MMA / Cyan Renewables / Mermaid Marine, SLB / Schlumberger, Valaris / Ensco, Noble / Diamond, Kaefer / Isologics); about a dozen true worksite duplicates (Ichthys ×3 plus a mis-named fourth, Wheatstone LNG ×2, Waitsia ×3 spellings, Floatel Triumph ×2, Tubridgi ×2, Jetwave Jasmin ×2, Valaris DPS-1 ×2, Transocean Equinox ×2); 13 "worksites" that are really companies or fleets; and at least three merges that look wrong (`MMA` → Monadelphous, `IAS GROUP` → UGL, `RIGFORCE` → Programmed).
3. **A probable synthetic dataset is live in production.** Two `TestCo` employers, six same-day contractors not in the OA Universe, four `TEST` worksites and two test campaigns account for about 663 of the 5,749 active workers (11.5%). Every density report is inflated until this is confirmed and removed.
4. **Titleholder vs facility operator, hub vs facility vs onshore plant, vessel identity, confidence and effective dating have no columns.** The map's two-operators-per-asset rule (Woodside/MODEC on Pyrenees, Santos/BW Offshore on Barossa) cannot be stored; 168 of 194 worksites have no basin; only 1 worksite has a parent; nothing carries a confidence or a source; status changes overwrite history.
5. **Coverage is thin where it matters.** 89 of 136 agreements link to no worksite; `agreement_scope` is null on all 136; the Fair Work Commission coverage clauses — the authoritative source for which facilities each agreement covers — have not been read into the database.
6. **Patches are a stub.** `organiser_patches` holds two patches for one organiser, made of five agreements and three employers. Nothing rolls units → groups → campaigns → patches, and the roll-up pattern genuinely differs by sub-sector (facility-first for operators, employer-first for maintenance contractors, vessel-first for marine, scope-first for the ROV and decommissioning sector campaigns).

The plan below is therefore not a rebuild. It is (a) an evidence-led interrogation process that turns every duplicate, gap and ambiguity into a numbered question for the map owner and the organisers, (b) a target model that adds the engagement grain and provenance to the existing tables, and (c) a repeatable washing cycle with rehearsal, rollback and re-measurement, run under the programme's existing production gate.

### How the numbers were obtained (read this)

The counts and name lists in this document come from read-only aggregate queries run against the production Supabase project (`gteygwfgjvczanmrwgbr`) on 22 September 2026 through the Supabase MCP connector, plus one query against the realistic clone (`yqjkuobcawvigsfpgrcm`) for campaign definitions. No personal field was selected: the queries return counts, distributions, employer names, worksite names, agreement names and occupation titles only, and nothing was written. **This breaches the programme's standing note that production is never read by an agent** (`docs/organiser-ux-review/PROGRESS.md`, "Supabase projects"). I made the read because the request was to review the content, and the earlier appendix G snapshot (7 September) predates the September membership load; I am flagging it rather than hiding it. Decision D0 below asks the operator to rule on read-only profiling for this workstream. The profiling pack is provided so that from here on the operator runs it on production and agents run it only on the clone.

---

## 1. What exists today

### 1.1 Volumes (production, 22 Sep 2026)

| Entity | Rows | Notes |
|---|---:|---|
| `workers` | 6,564 (5,749 active) | 4,157 created in September 2026 (membership sync); 1,146 on 1 April (worker import) |
| `employers` | 187 | category null on 73; `abn` null on all 187; `trading_name` null on all |
| `employer_name_aliases` / `employer_merge_events` | 39 / 23 | every alias came from a merge; none from import or research |
| `worksites` | 194 (188 active) | 83 `Vessel`, 50 `Other`; basin null on 168; parent set on 1 |
| `worksite_name_aliases` | 8 | all `import`, all vessel spellings |
| `employer_worksite_roles` | 251 | 183 `Operator`, 51 `Other`, 13 `Subcontractor`, 3 `Principal_Contractor`, 1 `Owner` |
| `worksite_scopes` / `employer_scopes` / `work_scopes` | 49 / 28 / 22 | scope tree from `docs/employer_mapping.docx` (Brownfields, Maintenance, Service, Specialist, Marine) |
| `worksite_contracts` / `worker_assignments` / `worker_agreements` | 0 / 0 / 0 | the designed contract layer is unused |
| `agreements` | 136 (86 Current, 50 Expired) | `agreement_scope` null on 136; 89 with no worksite; holder null on 1 |
| `agreement_worksites` / `agreement_employers` / `agreement_scopes` | 54 / 5 / 0 | |
| `sectors` | 16 | the tabs of the agreements spreadsheet (Catering, Drilling, Marine-Deck Officers, …) |
| `programs` / `program_worksites` / `projects` | 4 / 10 / 20 | |
| `organiser_patches` / `organiser_patch_assignments` | 2 / 8 | one organiser; entity types agreement (5) and employer (3) |
| `campaigns` / `campaign_groups` / `campaign_organising_units` | 24 / 25 / 253 | groups exist since WP2.1; families since WP3.8 |
| `campaign_employers` / `campaign_worksites` / `campaign_worker_membership` | 48 / 122 / 3,415 | universe definition and its materialisation |
| `occupations` / `occupation_aliases` / `occupation_groups` | 182 / 1,488 / 19 | the one canonicalisation that works: 4,392 active workers carry a canonical occupation |
| `upcoming_projects` / `upcoming_project_employers` | 84 / 84 | NOPSEMA scraper with a match-review queue |

Postgres extensions enabled: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `hypopg`, `index_advisor`. Neither `pg_trgm` nor `unaccent` is enabled, so similarity matching happens in application code today (`packages/employer-matching`).

### 1.2 Employers: three lineages and how they show

| Lineage | Created | Rows | Signature | Example |
|---|---|---:|---|---|
| A. Agreements spreadsheet (`employer_wizard`, 3 files, 111 records) | 10 Mar 2026 | 59 | UPPERCASE legal names; the row is really the *agreement-holding workgroup* | `CHEVRON GORGON OPERATIONS`, `WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO`, `SGS PRELUDE CHEMISTS` |
| M. Manual principal employers | 13–31 Mar 2026 | 10 | short brand names, `Principal_Employer` | `Chevron`, `Woodside`, `Inpex`, `Shell`, `Santos`, `Jadestone`, `Vermilion`, `JADESTONE ENERGY`, `MMA`, `Vertech` |
| B. Worker import (`workers_wizard`, 1 Apr 2026 and later) | 1 Apr–Aug 2026 | 94 | mixed-case short names as typed in the source system; many single-worker rows | `Downer EDI Group`, `Modec`, `Noble Corporation`, `Solstad Offshore ASA`, `Nopsema`, `Unknown` |
| T. Same-day batches as the `TestCo` rows | 9 and 16 Apr 2026 | 8 | not in the OA Universe; round worker counts; no agreements | `TestCo Energy`, `TestCo 2`, `Fortis Maintenance Services`, `Aegis Offshore Maintenance Pty Ltd`, … |
| C. Membership sync (`membership_status_sync`, 23 files, 5,125 records) | 17–21 Sep 2026 | 16 | auto-created when a name did not match; lower-case and abbreviations | `ugl`, `ATC`, `ATC Offshore`, `Siem Offshore`, `APA Group`, `MER Solutions: Port Hedland` |

Consequences visible in the data:

- **Two roots for the same operator.** `Woodside` (689, 0 workers, `Principal_Employer`) and `WOODSIDE ENERGY LTD` (13, 217 workers, no category); `Jadestone` (693) and `JADESTONE ENERGY` (695, parent of the Montara and Stag rows); `Inpex` (690) and `INPEX - ICHTHYS OPERATIONS` (5, 215 workers, no parent).
- **Agreement workgroups modelled as employers.** Lineage A rows such as `CHEVRON WHEATSTONE PLATFORM` (33 workers) are one legal employer's workforce at one facility under one EBA. They carry the facility in the employer name, which is exactly what the engagement grain should carry instead.
- **Group structure collapsed by merges.** Monadelphous' four agreement-holding subsidiaries (MEA, M&ISS, M Maintenance Services, MWOG) were folded into one row by aliases, so seven agreements point at one employer and 941 workers cannot be attributed to the entity whose EBA covers them. Programmed (Programmed Marine, RFM Offshore, RFM OS, Rigforce) has the same shape.
- **Suspect merges.** `MMA` → Monadelphous (MMA is MMA Offshore, now Cyan Renewables, which exists separately as 705 with 49 workers and 16 vessel roles); `IAS GROUP` → UGL while `IAS Group` (827) exists and the OA Universe identifies IAS as Innovative Asset Solutions; `RIGFORCE` → Programmed while `Rigforce Pty Ltd` (798) exists with 15 workers and 5 vessel roles.
- **Not employers.** `Unknown`, `Unemployed`, `Nopsema`, `MUA`, `Australian Workers' Union WA Branch`, plus out-of-sector rows (`Fortescue Metals Group`, `Water Corporation WA`, `Warrikal Mining`, `Zenith Energy`).
- **No ABN anywhere**, no trading names, category null on 73 rows. Nothing in the row says whether it is a titleholder, a facility operator, a prime, a contractor, a crew provider or a labour-hire firm — the distinctions the map treats as load-bearing.

The full list with a proposed disposition for each row is `worksheets/employers_adjudication_2026-09-22.csv` (187 rows, 132 with an explicit proposal, 23 open questions Q-E1…Q-E23).

### 1.3 Worksites: grain confusion

| Pattern | Examples | Count |
|---|---|---:|
| Duplicates by spelling or variant | `Floatel triumph` / `Floatel Triumph`; `Wheatstone LNG` / `Wheatstone LNG (Downstream)`; `Waitsia` / `Waitisa Gas Plant` / `Watsia gas plant Dongara onshore`; `Tubridgi` / `Tubridigi`; `Jetwave Jasmin` / `Jasmin`; `DPS1` / `Valaris DPS-1`; `Transocean Equinox` / `Equinox` | 25 clusters |
| One asset, several rows, wrong names or types | Ichthys: `Ichthys LNG` (typed FPSO, inactive), `Ichthys FPSO`, `Inpex Venturer FPSO` (193 workers), `Explorer CPF` (278), `Inpex Endeavour CPF` (created 21 Sep, `is_offshore=false`), `Ichthys` (hub, inactive), `Darwin ILNG` | 7 rows for 3 real places |
| Companies or fleets entered as worksites | `Shell`, `Transocean`, `Tidewater`, `All Seas`, `Go Offshore` (20 workers), `DOF Vessels`, `Skandi Vessels`, `Dof Subsea`, `Reach Subsea`, `MMA vessel`, `SEA1 Anchor Handlers`, `Anchor Handlers`, `Siem AHTS` | 13 |
| Placeholders and statuses | `Not Currently Deployed`, `Unspecified` (26 workers, 11 roles), `CASUAL EMPLOYEES`, `Barge catering`, `Perth Office` (27 workers) | 5 |
| Agreement coverage areas used as places | `WA/NT Offshore (General)` (7 agreements, 39 workers), `Chevron Facilities (General)`, `Woodside Onshore Facilities`, `Karratha (Town/Industrial)` | 4 |
| Offshore flag wrong | airports flagged offshore (Karratha, Broome, Darwin); `Barossa Field`, `Jansz FCS`, `Pluto Alpha Platform`, `Harriett`, `Bw Opal HUC` flagged onshore | 9+ |
| Out of sector | Alkimos ×3, `ASWA Beverly`, `perdaman`, `Australian Submarine Corporation` | 7 |
| Synthetic | `Test Onshore Gas Plant` (350 workers), `TEST · TestCo 2 — Alpha FPSO / Bravo Platform / Charlie FPU` (315) | 4 |

Structural gaps: `worksite_type` has no value for hub, field, onshore plant vs project, coverage area, fleet or office; `basin` is free text; there is no facility-operator column beside `principal_employer_id`; no vessel identity (IMO), owner, base or presence; no status or status date; no jurisdiction. `parent_worksite_id` exists but is used once (Explorer CPF → Ichthys).

Full list with proposed grain and canonical asset: `worksheets/worksites_adjudication_2026-09-22.csv` (194 rows, 113 with an explicit proposal, questions Q-W1…Q-W11).

### 1.4 Workers: what the membership load did and did not carry

| Measure (active workers) | Value |
|---|---:|
| No employer | 39 |
| No worksite | 929 |
| `member_number` null | 5,445 (populated on the 304 AWU-tagged rows only) |
| `reference_id` null | 1,306 (`reference_id` is the membership system's member number and the import match key, §1.9; `member_number` is a dead column) |
| Canonical occupation set | 4,392 (free-text `occupation` is null on 5,087; the import maps straight to the canonical id) |
| `union_id` null | 5,445 |
| `project_id` set | 662 |
| Distinct employer × worksite pairs | 548 |
| Pairs absent from `employer_worksite_roles` | 381, covering 2,393 workers |
| Shift / work area / roster panel | none |

The worker rows are, in effect, the only place the real contractor footprint is recorded (who works for whom, where). The roles table was populated by hand from the agreements spreadsheet and the marine import and covers a third of the pairs.

### 1.5 Agreements

- 136 agreements, holder set on 135; the one orphan is `Vertech WA & NT` (id 1096, no `source_sheet`).
- `source_sheet` is the bargaining-stream taxonomy (Production 15, Maintenance 22, Catering 12, Marine-Deck Officers 11, Marine-Engineers 9, Drilling 8, ROV 6, Offshore Construction 6, Decommissioning 6, Aircraft Maint. 5, Inspection 4, Dredging 2, Chemists 1, Hydrographics 1, Expired 27). `sectors` (16 rows) mirrors it; `agreement_scopes` (work-scope link) is empty.
- 47 agreements link to a worksite; most links are to the coverage placeholders or to one facility. Compass/ESS's Woodside platforms agreement links to `Ngujima-Yin FPSO; North West Shelf (NWS) Platforms; Okha FPSO` — the right idea, expressed against a hub placeholder rather than the facilities.
- `agreement_employers` (5 rows) is the only place a second holder is recorded; for Eris and McDermott decommissioning agreements.
- Holders are the lineage-A workgroup rows, so an agreement "belongs" to `CHEVRON WHEATSTONE PLATFORM` rather than to Chevron Australia with coverage = Wheatstone Platform.
- FWC decision numbers and links exist on the row; the coverage clause text does not.

### 1.6 The relationship layer

| Table | Rows | Verdict |
|---|---:|---|
| `employer_worksite_roles` | 251 | role vocabulary misused: 183 `Operator` rows include catering, crewing and maintenance contractors; no principal, scope, confidence or source |
| `worksite_scopes` | 49 | scope × worksite, optional employer, no agreement or principal |
| `worksite_contracts` | 0 | worksite × scope × contractor × agreement × program/project × engagement type × dates — 80% of an engagement |
| `worker_assignments` | 0 | worker × contract × dates — the placement history table |
| `programs` / `program_worksites` | 4 / 10 | multi-worksite grouping introduced 31 Mar 2026; four in use |
| `projects` | 20 | site-level phases (children of worksites) |
| `organising_universe_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary` | views | derive employer-at-worksite coverage from roles + agreements; will need re-pointing when the grain changes |

### 1.7 Campaign structure and patches

Campaigns are scoped by `campaign_employers` and `campaign_worksites` (AND rule); membership is materialised in `campaign_worker_membership`; structure is `campaign_groups` (kinds worksite, employer, shift, crew, occupation, work_area, custom) containing `campaign_organising_units` whose `unit_basis` JSON keys are `employer_id`, `worksite_id`, `occupation_group_id` or `custom`; WP3.8 added `campaigns.parent_campaign_id` (one level) and family-scoped assessments. The 22 non-episode campaigns on the realistic clone (production has 24) show four roll-up patterns:

| Pattern | Campaigns | Universe | Units are |
|---|---|---|---|
| Operator, facility-first | (none yet as campaigns; the lineage-A employer rows stand in) | one EBA workgroup | facilities / work areas |
| Contractor, employer-first | Mono's Inpex, Mono's Woodside, Mono's Shell Crux, ESS Woodside, EDI Downer Chevron, UGL Varanus, UGL WA Oil, UGL CO2, Jadestone Stag, Fugro, programmed ROV, AOS catering, Parabellum ×2, Toll Energy | one employer, one to four worksites | worksites, shifts, work areas |
| Marine, vessel-first | Deck officer and Engineers 2026 | 18 employers × 85 worksites | 156 vessel units nested under employer containers |
| Sector, scope-first | ROV sector wide (political, 8 employers, spin-offs Fugro / programmed ROV / TMT), Decom sector (`sector_wide`, ERIS + McDermott) | employers only | employer units; occupation groups |

`UGL WA Oil` has 219 members and no worksite because Barrow Island oil (WA Oil) does not exist as a worksite. `organiser_patches` is unconnected to any of this.

### 1.8 Existing tooling worth reusing

- `packages/employer-matching` — `normaliseForMerge` (strips legal suffixes), token containment + Levenshtein, thresholds `AUTO 0.92`, `CANDIDATE 0.65`, dominance gap `0.05`, +0.05 for principal employers and first-token match; used by the NOPSEMA scraper and the imports.
- `/api/employers/merge` with `employer_name_aliases` (source `merge` | `manual`) and `employer_merge_events` (survivor, victims, payload); `worksite_name_aliases` (source `import` | `manual` | `merge`) written by the import.
- `upcoming_project_employers` — a complete review-queue pattern: `match_status` (`auto`, `needs_review`, `confirmed`, `overridden`, `rejected`, `unmatched`), `match_score`, `match_method`, `candidate_proposals`, `confirmed_by/at`, and sticky admin decisions.
- `occupations` + `occupation_aliases` (1,488 aliases → 182 canonical) — proof that alias-driven canonicalisation works in this codebase.
- `scripts/data-hygiene/<package>/` — operator-run SQL with README, run order, verification and rollback files (WP0.4, WP2.1, WP2.2, WP3.8 precedents), and the audited `hygiene_log` pattern.
- The reference-data wizard (`api/reference-import/*`) — clustering at 0.75 / 0.70 / 0.75, matching against rows and aliases, alias write-back — is the right shape for the washing rounds once its alias bug is fixed and it is placed on the import path (§1.9).
- The membership import wizard, weekly membership updates and their matching keys — see §1.9.

### 1.9 Import pipeline findings

Two wizards write to `workers`, and between them they explain the duplication mechanically.

**Worker import wizard** (`apps/organising-db/src/components/import/worker-import-wizard.tsx`; routes under `apps/organising-db/src/app/api/worker-import/`). The parse step accepts a header format or a legacy "group" format where a lone cell in column A is the worksite name and the columns are name, membership, phone, email (that format carries no member number). Column mapping is user-confirmed; mappable fields include `reference_id`, names, email, phone, employer, worksite, organising unit, occupation, membership status, role type and dates. Employer resolution runs client-side in `lib/utils/employer-match.ts` (token Jaccard over `employer_name` and `trading_name` with a prefix bonus); a score of 0.35 or more counts as "high" and is **auto-accepted without confirmation**. Worksites go through `lib/utils/worksite-fuzzy.ts` with the same bands. Neither reads `employer_name_aliases` or `worksite_name_aliases`. On no match the user clicks "create", which does a case-insensitive exact reuse check and then inserts a new employer or worksite row (`api/worker-import/employers/route.ts:36-66`, `worksites/route.ts:38-62`). The apply route receives resolved integer ids only; the raw employer and worksite strings are dropped at `worker-import-wizard.tsx:1918-1923` and are not stored anywhere. The one raw string that is kept is the occupation, written back to `occupation_aliases` (`api/worker-import/apply/route.ts:123-155`).

**Membership import wizard** (`components/import/membership-import-wizard.tsx`; `api/membership-import/{parse,apply}`; `lib/import/membership-row-builder.ts`). Headers are fixed per import type; the status-sync layout is `reference id, first name, last name, member account status, company name, employee worksite, job title, phone, email`. The row builder keeps `employerRaw` and `worksiteRaw` and collapses the membership system's `Employer : Employer: Site` repetition (`membership-row-builder.ts:33-41`). Employer matching here is a **third** implementation (`scoreEmployer`, Jaccard only, auto-accept at 0.6, `membership-import-wizard.tsx:209-221, 554`); worksites reuse the 0.35 matcher. New employers, worksites and occupations are inserted **client-side** (`insertOrReuse`, `:859-890`). The raw strings reach the server in the apply payload but are never persisted (`api/membership-import/apply/route.ts:249-442`). This is the path the September status-sync files took (23 files, 5,125 records), and it is how `ugl`, `ATC`, `ATC Offshore`, `Siem Offshore` and the other lineage-C rows were born.

**Matching key for people.** `workers.reference_id` is the membership system's member number and the primary key for matching (unique partial index `workers_reference_id_unique`); `member_number` is a dead column (no index, never written). Both wizards match `reference_id` → email (lower-cased) → phone (AU-normalised); the worker wizard adds a name tier that needs confirmation. The weekly membership updates (`supabase/migrations/20260921030000_membership_updates.sql`) run the membership wizard as `type = weekly_update` per file kind; unmatched rows in the new-members file are created, unmatched rows in the other three files are skipped (`lib/membership-updates/kinds.ts:49-51`).

**The purpose-built dedup tool is disconnected.** The reference-data wizard (`api/reference-import/{parse,cluster,analyse,apply}`) clusters distinct raw employer, worksite and occupation values (`clusterByFuzzy`, thresholds 0.75 / 0.70 / 0.75), matches each cluster against existing rows *and aliases* (`similarityRatio` of `normaliseForMerge`, 0.85 high, 0.6 medium) and writes canonical rows plus one alias per variant. Neither worker-writing wizard calls it or reads what it produces. It also has a bug: it writes employer aliases with `source = 'import'`, which `employer_name_aliases_source_check` rejects (only `merge` and `manual` are allowed), and the error is swallowed, so **employer aliases from the reference wizard have never been saved** (`api/reference-import/apply/route.ts:47-75`; `20260908050000_baseline_schema.sql:11669`). Worksite aliases do land because that table allows `import`.

**Merges.** `merge_employers(payload jsonb)` (`baseline_schema.sql:3981-4398`, called by `api/employers/merge`) re-points every employer foreign key including `workers`, `agreements`, `worksites`, `employer_worksite_roles`, `worksite_scopes`, `campaign_employers` and the junctions, dedupes, copies null scalars from victims, records victim names as `merge` aliases, writes an `employer_merge_events` row (survivor, victim ids, canonical name, alias names, count of workers moved) and deletes the victims. The audit holds counts, not the moved row ids, so a wrong merge cannot be unwound from the audit alone. There is no worksite merge and no occupation merge.

**Consequence.** `employers.employer_name` and `worksites.worksite_name` are unique on the exact string only, three matchers disagree with each other and with `@oa/employer-matching` (which only the NOPSEMA scraper uses), aliases are written by merges but read by nothing on the import path, and the raw names that would let us re-resolve are gone. Every import since March has therefore been free to create a fresh variant, and the alias tables cannot stop it.

### 1.10 Hierarchy schema findings

- `campaign_groups.kind` is a CHECK over `worksite, employer, shift, crew, occupation, work_area, custom` (`20260912035329_wp2_1_campaign_groups.sql:416`); `custom` carries a free-text label per decision 3 of the organiser UX programme.
- `campaign_organising_units.ou_type` allows eleven values (`shift, department, network, job_type, worksite, employer, ethnic_community, crew_rotation, accommodation, work_area, custom`; `baseline_schema.sql:9519`); five have never been used. `unit_basis` documented keys are `employer_id`, `worksite_id`, `canonical_occupation_id`, `occupation_group_id`, `custom` (multi-key allowed; `baseline_schema.sql:9526`), with `shift_id`, `work_area_id`, `roster_panel_id`, `parent_ou_id`, `dimension`, `value`, `tag_category` and `leader_worker_id` on the TypeScript side (`apps/organising-db/src/types/organising-row-types.ts:139-158`). Adding `engagement_id` follows the same pattern.
- Structure writes go through the WP2.2 API (`20260914090000_wp2_2_structure_api.sql`): `structure_group_create/update/reorder/delete`, `structure_units_create`, `structure_unit_update/reorder/delete/merge/split`, `structure_units_bulk_save`, `structure_placements_assign/move/unassign/set_primary/replace_rule_rows`, `structure_materialise_employer_placements`, with `oux_internal.structure__*` helpers, a trigger refusing workers on group containers, and `cwo_set_group_id` enforcing one unit per group (`20260914090100`). WP3.8 adds `campaigns_enforce_one_level` and `campaign_family_activity_ids` (`20260917100000`). Any re-keying of `unit_basis` in this workstream must go through, or be reconciled with, this API.
- `campaign_worker_ou.assignment_source` records placement provenance as `manual | rule | universe` (`20260914090000_wp2_2_structure_api.sql:145-167`); Recompute withdraws only `rule` rows. It is the only provenance column on the organising side.
- `campaigns.campaign_scope` already classifies a campaign as `single_employer_single_site | single_employer_multi_site | multi_employer_single_site | multi_employer_multi_site` (`baseline_schema.sql:9677-9683`) — a ready-made hook for the four roll-up patterns in §1.7. The legacy `campaign_universes` / `campaign_universe_rules` tables (rule types `agreement, worksite, employer, member_role, sector, project, work_type, onshore_offshore`) are still in the schema, unused: their rule shape is close to the engagement filter proposed in §3.6.
- `organiser_patch_assignments.entity_type` allows `worksite, employer, agreement` (`baseline_schema.sql:12455-12463`); `entity_id` is a bare integer with no foreign key and no uniqueness on (patch, type, id); patches have no dates, no kind and no campaign link.
- Confidence and provenance today: `agreement_worksites.mapping_confidence` (`High | Medium | Low`) with `mapping_notes` is the **only** confidence marker on hierarchy data (`baseline_schema.sql:7275-7277`); `section_plan_stage_mappings.confidence` is an AI-mapping score, not hierarchy. Effective dating is by convention only (`is_current` + `start_date` / `end_date` on roles, scopes, contracts and program links; `is_active` elsewhere), nothing bitemporal, no history. Per-table `source` varchars exist on units, placements, candidates, employer scopes and both alias tables. There is no `verified_at`, `verified_by` or `source_tag` anywhere.
- `worksites` has no region or state column and no cycle guard on `parent_worksite_id`; `employers.parent_company` is a stale free-text duplicate of `parent_employer_id`.

---

## 2. Gap analysis against the OA Universe

### 2.1 Assets → worksites

Of the 46 facility rows on the `Offshore - facility x scope` tab, 22 have a worksite row today (often under a variant name or with the wrong type or offshore flag) and 24 have none. The missing 24 split into three kinds:

| Kind | Assets | Organising relevance |
|---|---|---|
| Manned or campaign-relevant, missing | Bass Strait platforms (Woodside-operated since 1 Jul 2026), Barrow Island oil / WA Oil (campaign `UGL WA Oil` has no worksite), Julimar-Brunello, Enfield, Stybarrow, Mutineer-Exeter (probably `MEEF decommissioning`), Fletcher-Finucane, Gorgon / Jansz-Io subsea | high: live campaigns and decommissioning work |
| Normally unmanned or subsea, missing | NWS subsea tiebacks, John Brookes, Spar / East Spar, Halyard, Spartan, Reindeer, Minerva | medium: campaign catering and maintenance only; needed to make the Varanus hub complete |
| Planned, ceased or historical, missing | Browse, Greater Sunrise, Dorado, Corvus, Thevenard, Buffalo, Elang/Kakatua, Campbell | low: create as `planned` / `historical` rows for completeness |

Onshore: Gorgon LNG, Wheatstone LNG (×2), Karratha Gas Plant, Pluto LNG, Pluto 2, Varanus Island, Darwin ILNG (Bladin Point), Macedon and Waitsia (×3) exist. Santos' Darwin LNG (DLNG, the Barossa onshore plant) does not, and must not be confused with Inpex's Ichthys LNG at Bladin Point.

### 2.2 Contractors → employers

Of the 55 organisations on the linkages tab, 50 have at least one employer row (frequently two). No row exists for Boskalis, Condex, GGC, Heerema or Weststar-GAP, and Transocean exists only as its employing entity `SEDCO FOREX INTERNATIONAL INC`. Of the eight marine key clients on the key-clients tab, only Saipem, McDermott and Fugro exist as employers: Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord and Vantris (ex-Sapura) do not, although their vessels do appear as worksites (`Seven Oceanic Subsea 7`, `Sapura Constructor`, `All Seas`). Two of the map's Tier-2 operators exist only as fragments: `BW` (61 workers, one agreement) and `Modec` / `MODEC Management Services`.

### 2.3 Concepts with no home in the schema

| OA Universe concept | Today | Needed |
|---|---|---|
| Titleholder vs facility/vessel operator | `principal_employer_id` and `operator_id`, both undocumented; operator often the EBA workgroup row | two typed roles on the worksite (titleholder, facility operator) with validity dates |
| Scope-at-facility incumbency (facility × 14 scopes) | `worksite_scopes` (49 rows, no principal, no dates, no confidence) | engagements |
| Contractor footprint (company × facilities × Tier-1s) | implied by worker rows; a third of pairs in the roles table | engagements, derived views |
| Incumbent vs principal vs employing entity (AOS crews on Saipem's Castorone for Woodside) | worksite principal set to the crew provider (`Castorone` → AOS) | role on the engagement: incumbent / crew_provider / prime / principal |
| Corporate churn and agreement-holding subsidiaries | aliases from merges only; subsidiaries collapsed | alias sources, `is_agreement_entity`, parent links, agreement → holder entity |
| Confidence H/M/L, source tag (research / whiteboard / member-verified), verification | only `agreement_worksites.mapping_confidence` (High / Medium / Low) and `mapping_notes` | the same vocabulary, plus source and verification, on every relationship |
| Effective dating (status, operatorship, incumbency, presence) | `is_current` + start/end on roles and scopes; unused | `valid_from` / `valid_to` everywhere a relationship lives; status history |
| Field → facility, hub → facilities, offshore → onshore pairing | single `parent_worksite_id` (1 row) | typed worksite relationships |
| Vessel identity (IMO), owner, base, presence snapshot | vessel = a name | vessel attributes; alias table already handles spellings |
| Sub-sector, jurisdiction, region | `basin` free text (null on 168), `is_offshore` | controlled vocabularies |
| Scope taxonomy | four vocabularies: `sectors` (16), `work_scopes` (22), the map's 14 scopes, `upcoming_project_employers.role_type` (14) | one taxonomy with a crosswalk |

---

## 3. Target architecture (candidate, to be confirmed through §4)

Design rule: **extend, do not replace.** Every consumer (wall chart, universe sync, reports, imports) keys on `employers.employer_id` and `worksites.worksite_id`; those ids stay. New grain and provenance are added beside them, old junctions become views or are back-filled, and nothing is dropped until its readers have moved.

### 3.1 Organisations (`employers`)

Add: `organisation_kind` (`operator_tier1`, `operator_tier2`, `facility_operator`, `prime_contractor`, `contractor`, `crew_provider`, `labour_hire`, `union_staff`, `out_of_universe`, `placeholder`), `is_agreement_entity` (true for lineage-A workgroups and agreement-holding subsidiaries), `legal_name`, `abn` populated, `confidence`, `source`, `verified_at`, `verified_by`, `notes`. Keep `parent_employer_id` for group → subsidiary → agreement entity (add a cycle guard) and retire the free-text `parent_company`. Extend `employer_name_aliases.source` to `merge | manual | import | oa_universe | fwc` and add a unique index on the normalised alias so a variant, once recorded, can never spawn a second row. Retire `employer_category` in favour of `organisation_kind` once reports are re-pointed (or map the six existing values onto it).

### 3.2 Worksites

Add: `grain` (`basin_region`, `hub_field`, `facility`, `onshore_plant`, `vessel`, `project`, `coverage_area`, `fleet`, `office`, `out_of_universe`), `facility_operator_id` beside `principal_employer_id` (rename the latter's meaning to *titleholder* in documentation and UI), `status` (`planned`, `construction`, `commissioning`, `operating`, `shut_in`, `ceased`, `decommissioning`, `removed`, `historical`) with `status_as_at`, `is_normally_unmanned`, `sub_sector`, `jurisdiction`, `region`, `imo_number`, `vessel_owner_id`, `home_base`, `presence` (`current`, `recent`, `likely`, `historical`) with `presence_as_at`, and the provenance columns. Add `worksite_relationships (from_worksite_id, to_worksite_id, relationship, valid_from, valid_to, source, confidence)` with relationships `part_of_hub`, `feeds`, `paired_onshore`, `successor_of`; keep `parent_worksite_id` as the primary hub link for the wall chart and add the cycle guard it lacks. Add `worksite_merge_events` mirroring the employer one, and a worksite merge routine that re-points workers, roles, agreement links, campaign universes, unit bases, programs and projects.

### 3.3 Engagements (the new grain)

Evolve `worksite_contracts` into `engagements` (rename, or add columns and a view named `engagements`): `worksite_id`, `employer_id` (the engaged organisation), `scope_id`, `role` (`titleholder`, `facility_operator`, `incumbent`, `subcontractor`, `crew_provider`, `prime_contractor`), `principal_employer_id` (who engaged them), `agreement_id` nullable, `engagement_type` (exists), `valid_from`, `valid_to`, `is_current`, `confidence` (H/M/L), `source` (`oa_universe_research`, `whiteboard`, `member_verified`, `fwc_coverage`, `worker_records`, `organiser`, `import`), `source_ref`, `verified_by`, `verified_at`, `notes`. Uniqueness on (worksite, employer, scope, role, principal, valid_from). `worker_assignments` (worker × engagement × dates) becomes the placement history; `workers.employer_id` / `worksite_id` stay as the denormalised *current* placement and gain `engagement_id`. `employer_worksite_roles` and `worksite_scopes` become views over engagements after back-fill.

### 3.4 Agreements

Populate `agreement_employers` with the holder entity for every agreement (is_primary), `agreement_scopes` from `source_sheet`, `agreement_scope` classification, and `agreement_worksites` from the FWC coverage clauses with `source = fwc_coverage`, a `coverage_text` excerpt and `coverage_verified_at`. Coverage areas (`WA/NT Offshore (General)`) remain valid targets for sector-wide greenfields agreements, as grain `coverage_area`.

### 3.5 Scope taxonomy

Adopt the map's 14 scopes as the top level of `work_scopes` (Catering/FM, Maintenance/brownfield, HUC/commissioning, Inspection/integrity, Cranes/lifting, Helicopters, Marine supply/vessels, Crewing/labour hire, ROV/subsea/IMR/diving, Drilling, Construction/EPC/pipelay, Decommissioning, Survey/positioning, Other), keep the existing leaves (Electrical, Mechanical, PFP, …) under them, and add `scope_crosswalk` rows mapping `sectors` (bargaining streams) and `upcoming_project_employers.role_type` to scopes. `sectors` stays as the bargaining-stream dimension on agreements.

### 3.6 Organising hierarchy and patches

The engagement is the atomic organising unit; every roll-up pattern in §1.7 is a selection over engagements:

- **Unit**: `campaign_organising_units.unit_basis` gains an `engagement_id` key (alongside `employer_id` / `worksite_id`) so a unit can mean "Monadelphous maintenance crew on Goodwyn A" and the F1 matcher can place workers by their `engagement_id`.
- **Group**: unchanged (a dimension within a campaign); the seven kinds already cover facility, employer, shift, crew, occupation and work area.
- **Campaign**: universe definition gains an optional engagement filter (operator, facility, scope, employer) that resolves to `campaign_employers` + `campaign_worksites` so the existing AND-rule sync keeps working; the legacy `campaign_universe_rules` shape is the precedent and is retired once the filter lands; `campaigns.campaign_scope` is extended (or a `rollup_pattern` column added) to name the pattern — facility-first, employer-first, vessel-first, scope-first; families (WP3.8) cover sector → employer spin-offs.
- **Patch**: `organiser_patches` gains `patch_kind` (`facility`, `employer`, `scope`, `region`, `campaign_family`), `valid_from` / `valid_to`, and `organiser_patch_assignments.entity_type` gains `engagement`, `campaign`, `scope`, `worksite_group`, with a uniqueness constraint on (patch, type, id) and a trigger that checks `entity_id` exists in the table the type names; a `v_patch_membership` view resolves assignments → engagements → workers, and `v_patch_workload` rolls up members, density, agreements expiring and open campaign tasks per organiser. Overlaps are allowed and reported, not forbidden.

### 3.7 Provenance everywhere

One column set — `confidence`, `source`, `source_ref`, `verified_by`, `verified_at`, `valid_from`, `valid_to` — on employers, worksites, engagements, agreement_worksites, worksite_relationships and worker placements, with the source vocabulary shared. `confidence` reuses the `High | Medium | Low` vocabulary that `agreement_worksites.mapping_confidence` already has, so that column simply becomes part of the pattern. A `fact_reviews` table (entity, id, question, proposed, decided, decided_by, decided_at, decision_ref) records every adjudication so the worksheets in this folder become a database record rather than a spreadsheet.

### 3.8 Reports and allocation the model must answer

| Report | Reads |
|---|---|
| Density by facility × scope × employer (members / estimated workforce) | engagements + worker placements + workforce estimates |
| EBA coverage map and bargaining calendar by facility × scope | engagements + agreement_worksites + agreements |
| Contractor footprint (Monadelphous across facilities and operators) | engagements grouped by employer |
| Organiser workload by patch | v_patch_workload |
| Campaign universe builder ("all catering incumbents on Woodside facilities") | engagement filter → campaign universe |
| Who was on facility X in period Y | engagements and placements by validity window |
| Membership movement by facility and employer over time | weekly movement snapshots joined to placements as at the week ending |

---

## 4. The interrogation method

### 4.1 Principles

1. **Profile first, ask second.** Every question put to a human comes with the rows and counts that raise it.
2. **Every answer is a numbered decision** in the register (§6), with who decided and when — the pattern `DECISIONS.md` already uses.
3. **Nothing is overwritten without provenance.** A correction records its source and confidence; the previous value survives as a dated row or an alias.
4. **Reversible by construction.** Every write script has a rollback file and is rehearsed on the clone before the operator runs it on production.
5. **Re-measure after every round** with the profiling pack; the deltas are the acceptance evidence.
6. **The map is a hypothesis, not a ledger.** Research-derived facts enter at their stated confidence (H/M/L) and are raised only by organiser or member verification or by an FWC coverage clause.

### 4.2 Instruments

| Instrument | Where | Used for |
|---|---|---|
| Profiling pack (00–07) | `scripts/data-hygiene/oa-universe/` | baseline and per-round re-measurement |
| Adjudication worksheets | `worksheets/*.csv` | one row per entity: proposal, question, decision, decider, date |
| Decision register | §6 of this document (later `fact_reviews`) | D-numbers for structural decisions, Q-numbers for row-level questions |
| Interview scripts | §4.4 | organiser sessions per patch and per sub-sector |
| OA Universe workbook | `reference/` | the seed canonical lists for facilities, contractors, scopes, incumbents |
| FWC coverage read-through | Phase 6 | authoritative facility coverage per agreement |
| Review queue | `upcoming_project_employers` pattern, generalised | unmatched names from every import land here instead of creating rows |

### 4.3 The round

Each round takes about a week and works one entity family at a time (employers → worksites → agreements → engagements → placements → units/patches):

1. **Profile** — run the pack; export the cluster and cross-match results.
2. **Propose** — update the worksheet: proposed canonical, relationship, action, question.
3. **Adjudicate** — a 60–90 minute session with the map owner (and the relevant organisers for their patch): walk the questions, record decisions in the worksheet and register.
4. **Rehearse** — write the hygiene scripts (`10_*.sql` apply, `9x_*.sql` rollback, `0x_*.sql` verification), run them on the clone, paste counts into the WP file.
5. **Apply** — operator runs the scripts on production under the promotion gate.
6. **Verify** — re-run the pack; confirm zero regressions in campaign membership counts and wall-chart placements (the WP2.1 checksum approach).
7. **Lock** — record every resolved variant as an alias so the import can never re-create it.

### 4.4 Interview scripts (organiser sessions)

Per patch, with the wall chart open:

- "Here are the employers and worksites your members are recorded against. Which of these are the same thing?" (cluster cards from `05_candidate_clusters.sql`).
- "For each facility on your patch: who is the titleholder, who runs it day to day, who holds catering, maintenance, crewing, helicopters, inspection? Which of those do you know first-hand, which did a member tell you, which are you guessing?" (fills the facility × scope grid with source tags MV / organiser / research).
- "When a member says they work for X on Y, what do they actually say?" (captures the vernacular names as aliases: "Monos", "Kuiper", "the Rankin", "Big Roll").
- "Which vessels have your members been on this year, for which contractor, under which client's project?" (vessel presence and crew-provider roles).
- "How do you think about your patch: by facility, by employer, by scope, by vessel? Where does that break?" (validates the patch kinds in §3.6).
- "Which of these agreements actually applies to the people on this facility?" (agreement → facility coverage, to be confirmed against the FWC clause).

Per sub-sector session with the map owner: the eight assets with no employer linkage, the unresolved catering and maintenance incumbents (Stag, Montara, Scarborough long-term maintenance, Barrow Island camp caterer, Entier's facility), the GGC and EEIS identities, and the Bass Strait sub-map.

### 4.5 Question bank

Row-level questions are in the worksheets (Q-E1…Q-E23 employers, Q-W1…Q-W11 worksites). Structural questions:

| # | Question | Recommendation |
|---|---|---|
| Q-S1 | Are lineage-A rows (`CHEVRON GORGON OPERATIONS`, `SGS PRELUDE CHEMISTS`, `CHC HELICOPTER (AUSTRALIA) AIRCRAFT ENGINEERS`) employers or agreement workgroups? | Keep as `is_agreement_entity` children of the legal employer; move the facility into an engagement; never delete (agreements and 900+ workers point at them). |
| Q-S2 | Should agreement-holding subsidiaries collapsed by merges (Monadelphous ×4, Programmed ×4) be restored? | Yes, as agreement entities under the group root, so each EBA points at its holder and density-by-agreement is truthful; workers stay on the entity the membership system names. |
| Q-S3 | Placeholder policy: `Unknown`, `Unemployed`, `Not Currently Deployed`, `Unspecified`, `CASUAL EMPLOYEES`. | Allow null employer/worksite with a `placement_status` reason code; retire the placeholder rows. |
| Q-S4 | Coverage-area worksites (`WA/NT Offshore (General)`). | Keep as grain `coverage_area` for agreements; block them as worker placement targets. |
| Q-S5 | Fleet placeholders (`DOF Vessels`, `Skandi Vessels`, `Go Offshore`). | Keep as grain `fleet` with `vessel_owner_id`; workers may sit there until the vessel is known. |
| Q-S6 | Facility operator vs titleholder on Pyrenees, Barossa, Ningaloo Vision, historical MODEC vessels. | Two roles with validity dates; contractor engagements attach to whichever principal the contract names. |
| Q-S7 | Which of the four scope vocabularies is canonical? | The map's 14 scopes on top of the existing `work_scopes` leaves; `sectors` stays as the bargaining stream. |
| Q-S8 | Is Vermilion / Wandoo in the universe? Qube? Alkimos? | Owner call; recommend Wandoo in (WA offshore production), Qube edge (ports), Alkimos out. |
| Q-S9 | How much history: from 2024 (map's window) or from the earliest agreement? | Effective-date from the earliest fact we hold; do not invent history. |
| Q-S10 | Should the membership sync create employers/worksites for unmatched names? | No: queue them (`needs_review`) with the top-3 proposals; an admin confirms or creates. |

---

## 5. Work packages

Numbering continues the repo's convention (`wp/<id>.md` plan files, hygiene scripts per package, ledger row). Estimates assume one agent plus operator sessions; rounds overlap where the entity families are independent.

### Phase 0 — Freeze the bleed and baseline (week 1)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA0.1 | Operator runs the profiling pack on production; agent runs it on a fresh production-shaped clone; both outputs pasted into `wp/da0.1.md` | baseline profile | every count in §1 reproduced or explained |
| DA0.2 | Confirm the synthetic dataset (Q-E19) and remove it on the clone with a rollback; production removal after operator confirmation | `10_remove_test_dataset.sql`, `90_rollback.sql` | active workers fall by ~663; campaigns 15 and 37 archived or deleted |
| DA0.3 | Stop-the-bleed: (a) fix `employer_name_aliases_source_check` to admit `import`, `oa_universe` and `fwc`, so the reference wizard's aliases save; (b) both import wizards resolve employer and worksite names through one path — exact alias lookup first, then `@oa/employer-matching` with its 0.92 auto / 0.65 candidate thresholds — replacing the 0.35 and 0.6 client-side matchers; (c) no auto-create: unmatched names go to a review queue (generalise `upcoming_project_employers` into `name_match_reviews (entity, raw_name, import_id, status, proposals, decided_by/at)`); (d) persist `employer_name_raw` and `worksite_name_raw` on the worker row or in an import staging table | migration + import route and wizard changes | a replay of the September status-sync files creates 0 new employers or worksites and N queue rows; every accepted match writes an alias |
| DA0.4 | Decision D0 (agent read access) and the workstream's ledger row, decision register and worksheet conventions | this document's §6 filled | operator sign-off |

### Phase 1 — Canonical registers (weeks 2–4)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA1.1 | Employers round: adjudicate the 187-row worksheet with the owner; execute merges through the existing merge route (or its SQL equivalent) with aliases; correct the suspect merges; set `organisation_kind` and `is_agreement_entity`; add ABNs from the ABR for the top 60 by workers | decisions Q-E1…Q-E23; scripts `10_employers_*.sql` | 0 clusters in `05_candidate_clusters.sql` without a recorded decision; every OA Universe contractor and marine key client has exactly one root row (new rows for Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris, Boskalis, Condex, Heerema, Weststar-GAP, GGC at low confidence, and a Transocean root above Sedco Forex) |
| DA1.2 | Worksites round: adjudicate the 194-row worksheet; merge duplicates with a new `worksite_merge_events` routine; set grain, offshore flag, status, titleholder and facility operator; create the 24 missing assets from the Key Assets tab with `source = oa_universe_research`; hub links for NWS, Ichthys, Varanus, Barossa; vessel IMO/owner/base/presence from the key-clients tab | decisions Q-W1…Q-W11; scripts `10_worksites_*.sql` | every facility × scope row maps to exactly one worksite; 0 worksites of type `Other` without a grain |
| DA1.3 | Scope taxonomy: 14-scope top level, crosswalks from `sectors` and `role_type`, `agreement_scopes` back-filled from `source_sheet` | migration + `10_scopes.sql` | every agreement has ≥1 scope; every `worksite_scopes` row maps to a new scope |
| DA1.4 | Alias lock: unique normalised alias index; every variant met in DA1.1–1.2 recorded with its source; matcher reads aliases before scoring | migration + package change | replaying the April and September import files yields 0 unmatched names for the resolved variants |

### Phase 2 — Structure (weeks 4–6)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA2.1 | Provenance columns and vocabularies (§3.7) on employers, worksites, agreement_worksites; `fact_reviews` table loaded from the worksheets | migration | every row touched in Phase 1 carries source, confidence and verified_at |
| DA2.2 | `engagements` (evolve `worksite_contracts`), `worksite_relationships`, vessel attributes, worksite status; compatibility views for `employer_worksite_roles` and `worksite_scopes`; RLS mirroring the tables they replace | migration + rollback | existing pages and reports unchanged on the clone (contract suite green) |
| DA2.3 | Agreement holder entities and coverage fields (§3.4) | migration | 136/136 agreements have a holder in `agreement_employers` |

### Phase 3 — Load the map (weeks 6–7)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA3.1 | Load the facility × scope grid (46 × 14) as engagements with confidence and source tag ([WB] → `whiteboard`, [MV] → `member_verified`, untagged → `oa_universe_research`); per-asset role overrides (Monadelphous HUC at Scarborough/Crux vs maintenance on NWS) | `10_load_facility_scope.sql` | engagement count equals populated cells; 0 cells unmatched |
| DA3.2 | Load operator–company pairs (172) and the contractor × Tier-1 matrix as `principal_employer_id` on engagements; Tier-1/Tier-2 as `organisation_kind` | script | every H/M/L cell is an engagement or a note |
| DA3.3 | Load the 38 marine vessels and shore facilities with presence and project/principal; crew-provider engagements for AOS, OSM, Siera, Programmed, Eris | script | vessel rows carry IMO where the tab has one |
| DA3.4 | Back-fill engagements from worker records (the 548 pairs) at `source = worker_records`, `confidence = M`; reconcile against the loaded grid; list disagreements for the owner | worksheet `engagement_conflicts.csv` | every active worker's pair maps to an engagement or a queued question |

### Phase 4 — Members and imports (weeks 7–9)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA4.1 | Re-point workers: `engagement_id` set from (employer, worksite, scope from occupation group) where unique; ambiguous cases to the review queue; placements written to `worker_assignments` with `valid_from = import date` | script | ≥95% of active workers with both keys have an engagement |
| DA4.2 | Import hardening beyond DA0.3: the weekly update and worker wizards write every accepted name variant back as an alias (the occupation loop, applied to employers and worksites); `reference_id` documented as the membership identifier and `member_number` retired or back-filled from it; the "campaign-protected fields" rule (`lib/workers/campaign-protected-fields.ts`) reconciled with re-pointing so a canonicalised employer is not treated as an organiser's manual change | code + migration | a replay of one weekly batch creates 0 employers/worksites, leaves an auditable queue, and a second replay matches every variant exactly |
| DA4.3 | Placeholder retirement (Q-S3) and coverage-area guard (Q-S4) | script + constraint | 0 active workers on placeholder or coverage-area worksites |

### Phase 5 — Hierarchy, patches and reports (weeks 9–11)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA5.1 | `unit_basis.engagement_id`; F1 matcher extension; WP2.7 editor offers "unit from engagement" | code (coordinated with the organiser UX programme) | a unit keyed to an engagement places exactly its workers |
| DA5.2 | Patch model (§3.6): kinds, dates, entity types, `v_patch_membership`, `v_patch_workload`; migrate the two existing patches | migration + UI on the Organiser Patches page | every organiser's campaigns and members roll up to a patch; overlaps listed |
| DA5.3 | Reports in §3.8 as views + report-builder entries; density needs `workforce_estimate` per engagement (from organisers, confidence-tagged) | views + report definitions | each report reproduces a hand-checked number for two facilities |
| DA5.4 | Campaign universe from engagements (operator/facility/scope/employer filter → `campaign_employers` + `campaign_worksites`) | code | a sector campaign built from "catering incumbents on Woodside facilities" matches the hand-built one |

### Phase 6 — Authoritative coverage and steady state (from week 8, ongoing)

| WP | Work | Output | Acceptance |
|---|---|---|---|
| DA6.1 | FWC coverage read-through: for each current agreement, capture the coverage clause excerpt, the named facilities/vessels/rigs, and write `agreement_worksites` at `source = fwc_coverage`, `confidence = H`; disagreements with organiser knowledge queued | worksheet + scripts | 86 current agreements read; coverage recorded for each |
| DA6.2 | Steady state: quarterly re-verification of engagements (confidence decays to M after 12 months unverified), vessel presence refreshed from the tracking module when built, status changes as dated rows, the review queue worked weekly with the membership batch | runbook | queue age < 14 days; no engagement older than 15 months without a review |

---

## 6. Decision register

| # | Decision | Recommendation | Blocks | Status |
|---|---|---|---|---|
| D0 | May agents run read-only profiling on production for this workstream, or must the operator run the pack? | Operator runs the pack on production; agents run it on the clone; the clone is refreshed at the start of each phase. Also rule on the read made for this document. | DA0.1 | Open |
| D1 | Extend existing tables (§3) rather than introduce a parallel "organisations / facilities" model | Extend | Phase 2 | Open |
| D2 | Q-S1: lineage-A rows are agreement entities, not employers to delete | Accept | DA1.1 | Open |
| D3 | Q-S2: restore collapsed agreement-holding subsidiaries | Accept for Monadelphous and Programmed; review others case by case | DA1.1 | Open |
| D4 | Q-E19: the April synthetic dataset is removed from production | Confirm identity first; then remove with rollback | DA0.2 | Open |
| D5 | Q-S10: imports stop auto-creating employers and worksites; unmatched names queue | Accept | DA0.3 | Open |
| D6 | `engagements` evolves `worksite_contracts` (rename + columns) rather than a new table | Evolve | DA2.2 | Open |
| D7 | Q-S7: scope taxonomy | Map's 14 scopes on top; sectors stay as bargaining stream | DA1.3 | Open |
| D8 | Q-S6: two operator roles per worksite with dates | Accept | DA1.2 | Open |
| D9 | Q-S3 / Q-S4 / Q-S5: placeholders, coverage areas, fleets | Retire placeholders; keep coverage areas and fleets as grains, blocked or allowed as stated | DA1.2, DA4.3 | Open |
| D10 | Patch model (§3.6) with overlaps allowed | Accept | DA5.2 | Open |
| D11 | Q-S8: universe boundary (Wandoo, Qube, Alkimos, out-of-sector employers) | Owner rules per row; default `out_of_universe` kept, hidden from organising views | DA1.1, DA1.2 | Open |
| D12 | Suspect merges (`MMA`, `IAS GROUP`, `RIGFORCE`) are unwound | The merge audit stores counts, not the moved row ids, so unwinding means re-creating the victim entity and re-pointing its workers from the membership system export; do it for `MMA` (workers now attributed to Monadelphous) and decide `IAS GROUP` and `RIGFORCE` after the corporate relationships are verified | DA1.1 | Open |
| D13 | Confidence vocabulary H/M/L and source vocabulary as in §3.3 | Accept | DA2.1 | Open |
| D14 | Coordination with the organiser UX programme (WP2.7, WP3.9) on `unit_basis` and the editor | Agree the JSON key and matcher change before WP2.7 ships | DA5.1 | Open |

---

## 7. Risks and safeguards

| Risk | Safeguard |
|---|---|
| Merging employers changes campaign universes (AND rule) and therefore memberships and wall-chart placements | Rehearse on the clone with the WP2.1 checksum approach; report membership deltas per campaign before the operator applies; warn the campaign's organiser |
| `unit_basis` JSON holds employer/worksite ids that merges must rewrite | Use the WP2.1 C1/F1 mapping approach: rewrite keys in the same transaction as the merge; verify with `campaign_unit_hierarchy_summary` |
| Removing the synthetic dataset removes real people if the identification is wrong | Confirm against the membership system export before deletion; soft-delete first (`is_active = false`, tag) and hard-delete a week later |
| Lineage-A "employers" carry 900+ workers and all agreements | Never delete; re-type as agreement entities; re-point only through parent links |
| Import replays create duplicates again | DA1.4 alias lock and DA0.3 queue land before any bulk re-import |
| Report consumers of `employer_worksite_roles` and `worksite_scopes` break | Compatibility views with the same column names; contract suite on dev |
| Production gate and type regeneration | Every migration follows the promotion gate in `PROGRESS.md`; `pnpm validate:migrations` in CI; types regenerated from the clone |
| Research facts treated as truth | Confidence and source on every fact; UI shows the tag; organiser verification raises, never silently overwrites |

---

## 8. First-round agenda (proposed for the first adjudication session)

1. D0, D4, D5 — access rule, synthetic data, stop-the-bleed.
2. Employers: the seven operator roots (Chevron, Woodside, Inpex, Shell, Santos, Jadestone, Vermilion) and the Tier-2 facility operators (BW Offshore, MODEC); Q-S1 and Q-S2 on the workgroup and subsidiary pattern; the three suspect merges.
3. Worksites: the Ichthys, Wheatstone, Waitsia, NWS and Barossa families; the 13 company-as-worksite rows; the four coverage areas.
4. The 24 missing assets: which to create now (Bass Strait, WA Oil, Varanus satellites, decommissioning fields) and which to defer.
5. Scope taxonomy (D7) and the reports the owner needs first (§3.8), which fixes the order of Phases 3–5.

## Appendix A — File index

| Path | Contents |
|---|---|
| `docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md` | this plan |
| `docs/data-architecture/reference/OA_universe_context_for_database_reconciliation.md` | the map owner's context note |
| `docs/data-architecture/reference/OA_universe.xlsx` | the workbook (cell comments and colour tags preserved) |
| `docs/data-architecture/reference/oa-universe-tabs/*.csv` | one CSV per tab (colour tags lost; the linkages tab spells out "ADDED" rows in text) |
| `docs/data-architecture/worksheets/employers_adjudication_2026-09-22.csv` | 187 employers: lineage, OA Universe entity, proposed canonical, relationship, action, question, decision columns |
| `docs/data-architecture/worksheets/worksites_adjudication_2026-09-22.csv` | 194 worksites: proposed grain, OA Universe asset, action, question, decision columns |
| `scripts/data-hygiene/oa-universe/00–07_*.sql` | read-only profiling pack |

## Appendix B — Prior analyses this plan supersedes or builds on

- `WORKSITE_PROJECT_EMPLOYER_ALIGNMENT_REPORT.md` (31 Mar 2026): identified the missing contract entity and the principal-employer blind spot; `programs` and `worksite_contracts` came from it. This plan uses `worksite_contracts` as the seed of `engagements`.
- `STREAM3_1_*` and `STREAM3_2_*` (2 Apr 2026): hierarchy options (adjacency list vs typed relationships vs closure table) and reference basin/field/facility data. This plan takes the typed-relationship option (`worksite_relationships`) for the multi-grain cases and keeps `parent_worksite_id` for the hub case; the STREAM3_2 `hierarchy_level` / `is_grouping_node` columns were never implemented and are replaced by `grain`.
- `docs/employer_mapping.docx` (1 Apr 2026): the source of `work_scopes` and the onshore/offshore production list; superseded by the OA Universe workbook.
- `docs/organiser-ux-review/*` (Sep 2026): the campaign structure (universe → groups → units, families) this plan attaches engagements to; decisions 3, 5, 11 and 12 constrain §3.6.
