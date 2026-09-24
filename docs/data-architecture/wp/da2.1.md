# DA2.1 — Provenance columns and vocabularies

Planner: Opus (2026-09-24). Status: **planning** (awaiting orchestrator approval, §7).
Ledger row: `../PROGRESS.md`. Convention: `README.md` in this directory. Scripts: `scripts/data-hygiene/da2.1/`.
Implementers: Fable (migration, triggers, `record_fact_review()`, run sheets, rollbacks, types) and Opus (the CSV →
`fact_reviews` builder and its tests); seam in §2.8. Reviewer: Fable.

Every number in this file comes from a query or command pasted in §1.4 (production, dev and the 12 September clone,
read-only, 2026-09-24) or §2.6 (the worksheets, read with Python's `csv` module). Organisation names and ids only.

---

## 1. Specification

### 1.1 Plan §5 row, verbatim (`OA_UNIVERSE_ALIGNMENT_PLAN.md:398`)

> | DA2.1 | Provenance columns and vocabularies (§3.7) on employers, worksites, agreement_worksites; `fact_reviews` table loaded from the worksheets | migration | every row touched in Phase 1 carries source, confidence and verified_at |

### 1.2 Orchestration paragraph, verbatim (`ORCHESTRATION_PROMPT.md:197`)

> **DA2.1 Provenance and vocabularies.** Opus planner; Fable implementer; Fable reviewer. The column set from plan §3.7 on employers, worksites and `agreement_worksites` (reusing `mapping_confidence`'s High / Medium / Low), the source vocabulary, `fact_reviews` loaded from the worksheets' decision columns. Because DA1.1 and DA1.2 fill these columns, DA2.1's migration lands before their run sheets: the sequence is DA2.1 migration → DA1.1 → DA1.2 → DA1.4.

Dependency summary (`ORCHESTRATION_PROMPT.md:243`): `… → DA2.1 migration → DA1.1 → DA1.2 → DA1.4 → DA2.2 → …`.

### 1.3 Sections and decisions consumed

- **§3.7** (`OA_UNIVERSE_ALIGNMENT_PLAN.md:288`): one column set — `confidence`, `source`, `source_ref`, `verified_by`,
  `verified_at`, `valid_from`, `valid_to` — with the source vocabulary shared; `confidence` reuses
  `agreement_worksites.mapping_confidence`'s `High | Medium | Low`, "so that column simply becomes part of the
  pattern"; `fact_reviews (entity, id, question, proposed, decided, decided_by, decided_at, decision_ref)`.
- **§3.1** (`:251`): employer additions `organisation_kind` (ten values), `is_agreement_entity`, `legal_name`, `abn`
  populated, `confidence`, `source`, `verified_at`, `verified_by`, `notes`; cycle guard on `parent_employer_id`. The
  alias-source widening is done (DA0.3, `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql:22-35`); the
  unique normalised-alias index and the watch-contractor fold are **DA1.4**; retiring `parent_company` and
  `employer_category` is not in this row (both left untouched).
- **§3.2** (`:255`): worksite additions `grain` (ten), `facility_operator_id`, `status` (nine) + `status_as_at`,
  `is_normally_unmanned`, `sub_sector`, `jurisdiction`, `region`, `vessel_id` → `vessels`, `presence` (four) +
  `presence_as_at`, the provenance columns, cycle guard on `parent_worksite_id`. **This package leaves** to others:
  `worksite_relationships` (DA2.2, `ORCHESTRATION_PROMPT.md:199`), `worksite_merge_events` and the worksite merge
  routine (DA1.2, `OA_UNIVERSE_ALIGNMENT_PLAN.md:390`), the coverage-area placement check and `placement_status`
  (DA4.3, `:417`). Why status and `vessel_id` come here although DA2.2's row (`:399`) names "vessel attributes,
  worksite status": DA1.2 (`:390`) must "set grain, offshore flag, status, titleholder and facility operator" and link
  "vessel-grain rows … to `vessels.vessel_id`", and DA1.2 runs before DA2.2 (`ORCHESTRATION_PROMPT.md:243`). DA2.2
  keeps engagements, relationships and the compatibility views.
- **§3.3 source vocabulary** (`:259`): `oa_universe_research, whiteboard, member_verified, fwc_coverage,
  worker_records, organiser, import`; this package's CHECK adds `merge` (carried by a merge routine), `manual` (an admin
  edit) and `abr` (ABNs from the Australian Business Register, DA1.1 `:389` "add ABNs from the ABR") — ten values.
- **§1.10** (`:192`): `mapping_confidence` + `mapping_notes` is the only confidence marker on hierarchy data; no
  `verified_at`, `verified_by` or `source_tag` anywhere; `:193` no cycle guard on `parent_worksite_id`.
- **§4.2** (`:321`): the decision register is §6, "later `fact_reviews`"; the worksheets are "one row per entity:
  proposal, question, decision, decider, date" (`:320`).
- **§4.1 item 6** (`:313`) and ORCHESTRATION rule "Do not invent history" (`ORCHESTRATION_PROMPT.md:35`): research
  facts enter at their stated confidence and are raised only by organiser or member verification or an FWC clause —
  written into the column comments.
- **D13** (`:454`): "Confidence vocabulary H/M/L and source vocabulary as in §3.3 — **Decided:** accept."
- **D15** (`:456`) as answered by DA0.5 (`../PROGRESS.md` D15 finding): `vessels` is owned by this repository
  (`20260922040000_mobilisation_radar.sql:10-11`, `vessel_id integer … PRIMARY KEY`) and is in production's ledger.
- Rules (`ORCHESTRATION_PROMPT.md:32-45`): production read-only; never edit an applied migration; promotion gate;
  PostgREST strings proven on dev; do not widen a package. Run sheets and verification (`:100-120`).

### 1.4 Read-only facts gathered for this plan (pasted results, 2026-09-24)

#### 1.4.1 Column inventory, production `gteygwfgjvczanmrwgbr`

Query: `pg_attribute ⋈ pg_class ⋈ pg_attrdef` for the six tables, `attnum > 0 AND NOT attisdropped`.

| Table | # | Column | Type | Not null | Default |
|---|---|---|---|---|---|
| employers | 1 | employer_id | integer | t | nextval |
| | 2 | employer_name | varchar(200) | t | |
| | 3 | trading_name | varchar(100) | f | |
| | 4 | **abn** | varchar(20) | f | |
| | 5 | employer_category | varchar(30) | f | |
| | 6 | parent_company | varchar(200) | f | |
| | 7–12 | website, phone, email, address, state, postcode | varchar/text | f | |
| | 13 | is_active | boolean | t | true |
| | 14–15 | created_at, updated_at | timestamptz | t | now() |
| | 16 | parent_employer_id | integer | f | |
| worksites | 1 | worksite_id | integer | t | nextval |
| | 2 | worksite_name | varchar(100) | t | |
| | 3 | worksite_type | varchar(30) | t | |
| | 4 | **operator_id** | integer | f | |
| | 5 | location_description | varchar(200) | f | |
| | 6–7 | latitude, longitude | numeric(10,7) | f | |
| | 8 | basin | varchar(100) | f | |
| | 9 | is_offshore | boolean | t | true |
| | 10 | is_active | boolean | t | true |
| | 11 | **notes** | text | f | |
| | 12–13 | created_at, updated_at | timestamptz | t | now() |
| | 14 | principal_employer_id | integer | f | |
| | 15 | parent_worksite_id | integer | f | |
| | 16 | image_url | text | f | |
| agreement_worksites | 1 | id | integer | t | nextval |
| | 2–3 | agreement_id, worksite_id | integer | t | |
| | 4 | **notes** | varchar(200) | f | |
| | 5 | **mapping_confidence** | varchar(10) | f | |
| | 6 | **mapping_notes** | text | f | |
| agreements | 1–21 | agreement_id, decision_no, agreement_name, short_name, sector_id, employer_id, industry_classification, date_of_decision, commencement_date, expiry_date, status (varchar(20) NOT NULL default 'Current'), is_greenfield, is_variation, fwc_link, supersedes_id, variation_of_id, notes, **source_sheet** varchar(50), created_at, updated_at, agreement_scope | | | |
| employer_worksite_roles | 1–8 | id, employer_id, worksite_id, role_type varchar(30) NOT NULL, is_current bool NOT NULL default true, start_date, end_date, notes text | | | |
| worksite_scopes | 1–9 | id, worksite_id, scope_id, employer_id, engagement_type varchar(30), is_current bool NOT NULL default true, start_date, end_date, notes text | | | |

Existing confidence/source-like columns: `agreement_worksites.mapping_confidence`, `mapping_notes`, `notes`;
`agreements.source_sheet` (the spreadsheet tab, not provenance). **No** column named `confidence`, `source`,
`source_ref`, `verified_*`, `valid_*`, `organisation_kind`, `is_agreement_entity`, `legal_name`, `grain`, `status`,
`region`, `vessel_id` or `presence` exists on employers, worksites or agreement_worksites (count query: 0). Name
collision to note: `agreements.status` and `worksites.status` (new) are different vocabularies on different tables.

#### 1.4.2 Constraints and triggers, production

CHECK constraints (`pg_get_constraintdef`):

| Constraint | Definition |
|---|---|
| `agreement_worksites_mapping_confidence_check` | `CHECK (((mapping_confidence)::text = ANY ((ARRAY['High'::character varying, 'Medium'::character varying, 'Low'::character varying])::text[])))` |
| `agreements_agreement_scope_check` | `site_specific, project_specific, sector_wide, company_wide` |
| `agreements_status_check` | `Current, Expired, Under_Negotiation, Terminated` |
| `employer_worksite_roles_role_type_check` | `Owner, Operator, Principal_Contractor, Subcontractor, Labour_Hire, Other` |
| `employers_employer_category_check` | `Producer, Major_Contractor, Subcontractor, Labour_Hire, Specialist, Principal_Employer` |
| `worksite_scopes_engagement_type_check` | `direct_employment, contractor, subcontractor, labour_hire` |
| `worksites_worksite_type_check` | `FPSO, FPU, FLNG, Platform, Onshore_LNG, Gas_Plant, Vessel, Supply_Vessel, Accommodation_Vessel, Vessel_Other, Drill_Centre, Region, Heliport, Pipeline, Airfield, Onshore_Facilities, CPF, Gas_Field, Other` |

Foreign keys on the three altered tables: `employers_parent_employer_id_fkey` (self, NO ACTION);
`worksites_operator_id_fkey`, `worksites_principal_employer_id_fkey` (→ employers, NO ACTION),
`worksites_parent_worksite_id_fkey` (self); `agreement_worksites_{agreement_id,worksite_id}_fkey` (CASCADE). Unique:
`employers_employer_name_key`, `worksites_worksite_name_key`, `agreement_worksites_agreement_id_worksite_id_key`.

Triggers: `trg_employers_updated_at`, `trg_worksites_updated_at` (`BEFORE UPDATE … update_updated_at()`),
`trg_agreements_updated_at`, `trg_agreements_expiry_status`, `trg_worksite_scope_propagate`, `trg_vessels_updated_at`.
No trigger on `agreement_worksites` or `employer_worksite_roles`.

RLS on employers / worksites / agreement_worksites: SELECT to authenticated; INSERT and UPDATE for
`get_user_role() = ANY ('{admin,user}')`; DELETE admin. Grants on `employers`: anon, authenticated and service_role
all hold ALL (the baseline default privileges). `name_match_reviews` grants: `authenticated:SELECT`, service_role ALL
(the tightened convention). Server version 17.6 (fast defaults for constant `ADD COLUMN … DEFAULT`).

#### 1.4.3 Data facts, production

```
employers 179 · worksites 190 · agreements 136 · agreement_worksites 54 · employer_worksite_roles 241 · worksite_scopes 13
agreement_worksites.mapping_confidence: High 38, Medium 7, Low 2, null 7 · mapping_notes non-null 47 · notes non-null 0
employers.abn non-null 0 (blank 0, 11-digit 0) · parent_company non-null 0 · parent_employer_id non-null 9, self-parent 0
worksites.notes non-null 7 · parent_worksite_id non-null 1, self-parent 0 · principal_employer_id non-null 104
worksites.operator_id non-null 25, of which operator_id <> principal_employer_id 25
parent chains (recursive, depth cap 50): employers max_depth 2, cycles 0 · worksites max_depth 2, cycles 0
vessels 25 rows; PK vessel_id integer; FKs into vessels: mobilisation_watch_vessels (CASCADE), mobilisation_signals (SET NULL),
  mobilisation_alerts (SET NULL), mobilisation_positions (CASCADE)
fact_reviews present: false · _oux_hygiene_log present: true (action CHECK update|insert|delete) · _oux_env_marker: absent
ledger tail: 20260918120000, 20260921030000, 20260922040000, 20260922120000, 20260923220000, 20260924010000
employers/worksites created on or after 2026-09-22: 0 / 0
```

The 25 `worksites.operator_id` values (organisation names): worksites 1–4 → `CHEVRON GORGON OPERATIONS` (2); 5–6 →
`SHELL PRELUDE` (10); 7–8 → `INPEX - ICHTHYS OPERATIONS` (5); 9–13 → `WOODSIDE ENERGY LTD NGUJIMA-YIN AND OHKA FPSO`
(12); 14 → `SANTOS WA ENERGY LIMITED VARANUS ISLAND HUB` (9); 15–16 → `JADESTONE ENERGY MONTARA VENTURE` (6); 17
Ningaloo Vision FPSO → `TEEKAY SHIPPING (AUSTRALIA) PTY LTD` (15); 18 Pyrenees Venture FPSO → `MODEC Management
Services` (93); 21–23 → `PHI INTERNATIONAL AUSTRALIA` (54); 24 → DBNGP (17); 25 BW Offshore FPSO → `BW` (1); 200 KBSB →
`WOODSIDE ENERGY LTD` (13); 201 Sapura Constructor → `ERIS` (19). `operator_id` is already, in substance, the §3.2
*facility operator* (Teekay, MODEC, BW operate FPSOs whose titleholder sits in `principal_employer_id`).

Worksheet ids against production (both arrays sent as literals): employers sheet 187 ids, missing in production
`[787…794]` (the eight synthetic rows DA0.2 removed), production rows not in the sheet: none; worksites sheet 194 ids,
missing `[196, 197, 198, 199]`, production rows not in the sheet: none.

#### 1.4.4 Views that read the altered tables (production, `pg_depend` over `pg_rewrite`)

| View (kind) | Reads | `pg_get_viewdef` md5 | Columns | Baseline |
|---|---|---|---|---|
| agreements_view (v) | agreement_worksites, employers | `51eb66a3f2fbd01ffa730cf7f167f649` | 26 | `:7391` |
| employers_view (v) | employer_worksite_roles, employers | `ea35193995b28d8b4871b682df6405f1` | 19 | `:11838` |
| organising_universe_view (v) | agreement_worksites, employer_worksite_roles, employers, worksites | `41c50b64a2bfc7ef457aa3c934e0d8ce` | 25 | `:12572` |
| principal_employer_eba_summary (v) | employer_worksite_roles, employers, worksites | `ce7161fb9412fd0c2984adbaac299047` | 17 | `:13321` |
| vw_call_action_report (v) | worksites | `98e1d84b39288ade9881ddef6702d83a` | 26 | `:16164` |
| workers_view (v) | employers, worksites | `5032583908503a4f88650053f56cd462` | 47 | `:17199` |
| worksite_employer_eba_status (v) | agreement_worksites, employer_worksite_roles, employers, worksites | `85ee20ac82937c0834689f601c6ebc64` | 12 | `:13253` |
| worksite_hierarchy_report_rows (v) | employer_worksite_roles, employers, worksite_scopes, worksites | `6fdf10faedfba4cdb5fe16bc4f334e34` | 11 | `:17552` |
| worksite_hierarchy_report_rows_mv (m) | the view above | `86588b1fd1cf7f2f5c0b2555fa0c2a96` | 11 | `:17612` |
| worksites_view (v) | agreement_worksites, employers, worksites | `097a2a4f771ab8cf84b659e550b0b797` | 21 | `:17711` |

A grep of each definition in `20260908050000_baseline_schema.sql` finds `*` only inside `count(*)`: every view names
its columns. None references `mapping_confidence` (the only baseline hits are `:7275` and `:7277`).

#### 1.4.5 Dev and the 12 September clone (read-only)

| | dev `dpnnmkhabysfdogllsyh` | clone `yqjkuobcawvigsfpgrcm` |
|---|---|---|
| ledger tail | 20260913000000, 20260914090000, 20260914090100, 20260917100000, 20260922120000 | 20260917100000, 20260922040000, 20260922120000, 20260923220000, 20260924010000 |
| columns employers / worksites / agreement_worksites | 16 / 16 / 6 | 16 / 16 / 6 |
| `_oux_env_marker` / `_oux_hygiene_log` | present / present | present / present |
| `vessels` | **absent** | present |
| `fact_reviews` | absent | absent |
| employers / worksites | 167 / 94 | 163 / 170 |

Dev lacks `20260918120000`, `20260921030000`, `20260922040000`, `20260923220000`, `20260924010000` (so no `vessels`);
§2.3.9 and §5 O-4 deal with that. The 12 September clone's register differs from production (163 / 170 rows), so it
serves only syntax-level dry runs; the rehearsal runs on the fresh clone (D17), ref not yet known.

---

## 2. Files

### 2.1 Existing code this package reads or touches (today's lines)

| File | Line(s) | Why |
|---|---|---|
| `supabase/migrations/20260908050000_baseline_schema.sql` | `:7270-7278` (agreement_worksites, the `mapping_confidence` CHECK at `:7277`), `:7346` (employers), `:12548-12563` (worksites; `operator_id` `:12552`), `:3638` `is_admin()`, `:3346` `get_user_role()`, `:6735` `update_updated_at()` | objects altered or reused |
| same | `:3981` `merge_employers`: ancestor guard `:4052-4063`, parent re-point `:4136-4149`, **`operator_id` re-point `:4151-4154`**, principal re-point `:4156-4159`, victim delete **`:4367`** | why a new FK to `employers` would break DA1.1's merges (§2.3.3) |
| same | `:312`, `:327` (employer-groups apply function inserts a parent and sets `parent_employer_id`) | now subject to the cycle guard |
| `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` | `:136-163` (RLS: one SELECT policy; REVOKE from PUBLIC, anon, authenticated; GRANT SELECT authenticated; ALL service_role; sequence grants), `:195-218` (SECURITY DEFINER + `is_admin()` gate), `:487-489` (function grants) | pattern for `fact_reviews` and `record_fact_review()` |
| `supabase/migrations/20260922040000_mobilisation_radar.sql` | `:10-11` | `vessels.vessel_id` PK |
| `apps/organising-db/scripts/seed-from-spreadsheet.ts` | `:455` `mapping_confidence: confidence,` | the only code reader/writer of `mapping_confidence`; renamed with the column (§2.3.4) |
| `apps/organising-db/src/components/overview/employers-tab.tsx` | `:400-404` (`payload.abn = form.abn.trim()`) | user-typed ABNs with spaces → normalised by the trigger (§2.3.2) |
| `packages/db-types/generated.ts` | `:1124` agreement_worksites, `:12012` employers, `:23147` worksites, `:20695` vessels | Row/Insert/Update change (§2.5) |
| `apps/organising-db/src/types/planner-types.ts` | `:8-9` `Employer = Tables['employers']['Row']`, `Worksite = …` | gains fields; only read and cast (§2.5) |

### 2.2 New files

| File | Owner | Kind |
|---|---|---|
| `supabase/migrations/20260925010000_da2_1_provenance.sql` | Fable | migration (schema only; changes no application row) |
| `scripts/data-hygiene/da2.1/README.md` | Fable | oux-wp3.8 style run order |
| `scripts/data-hygiene/da2.1/00_preflight.sql` | Fable | read-only |
| `scripts/data-hygiene/da2.1/20_rehearse_guards.sql` | Fable | clone only; every probe inside a SAVEPOINT, whole file ends `ROLLBACK;` |
| `scripts/data-hygiene/da2.1/10_load_fact_reviews.sql` | Opus (generated body) + Fable (guard, preconditions, assertions) | mutating data run sheet |
| `scripts/data-hygiene/da2.1/91_unload_fact_reviews.sql` | Fable | rollback of `10` |
| `scripts/data-hygiene/da2.1/90_rollback_da2_1_provenance.sql` | Fable | schema rollback of the migration |
| `scripts/data-hygiene/da2.1/fact-reviews-lib.ts` | Opus | pure: CSV parse, row mapping, SQL rendering, digest |
| `scripts/data-hygiene/da2.1/build-fact-reviews.ts` | Opus | CLI: reads the two CSVs, writes `10_…sql` body and `fixtures/expected.json` |
| `scripts/data-hygiene/da2.1/fixtures/expected.json` | Opus (generated) | counts and md5 |
| `apps/organising-db/src/lib/data-hygiene/__tests__/fact-reviews.test.ts` | Opus | vitest (inside `vitest.config` include `src/**/__tests__/**`; imports the lib by relative path as `src/lib/import/__tests__/replay-fixture.test.ts:27` does for DA0.3) |
| `scripts/data-hygiene/da2.1/prod/P1…P5` | Fable, after approval of the clone rehearsal | production copies with `SET LOCAL oux.env = 'production';` (DA0.3 `prod/` precedent) |

**Numbering note.** The brief calls the load's rollback "`90`". This plan follows DA0.3's convention instead
(`scripts/data-hygiene/da0.3/`: `90` = schema rollback, `91` = data clear), so the load's rollback is `91` and `90` is
the migration's rollback, whose precondition requires `91` to have run. Listed as deviation-in-advance D-a (§8).

### 2.3 Migration design — `supabase/migrations/20260925010000_da2_1_provenance.sql` (one file)

Header in DA0.3's style: purpose, plan reference, dependencies (baseline objects; `vessels` from `20260922040000`;
`is_admin()`), "changes no application row", idempotent (`IF NOT EXISTS` / `OR REPLACE` / `DROP … IF EXISTS` / guarded
`DO` blocks). First statements: `SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s';` (no effect
outside a transaction; the run sheets wrap the file in `BEGIN; … COMMIT;`). Lock order fixed: employers → worksites →
agreement_worksites → vessels (the order `merge_employers` updates them, `:4136-4159`).

#### 2.3.1 Shared vocabularies (literal CHECKs, one text per vocabulary)

| Vocabulary | Values |
|---|---|
| confidence | `High`, `Medium`, `Low` (identical to `agreement_worksites_mapping_confidence_check`; D13's H/M/L spelled out) |
| source | `oa_universe_research`, `whiteboard`, `member_verified`, `fwc_coverage`, `worker_records`, `organiser`, `import`, `merge`, `manual`, `abr` |
| organisation_kind | `operator_tier1`, `operator_tier2`, `facility_operator`, `prime_contractor`, `contractor`, `crew_provider`, `labour_hire`, `union_staff`, `out_of_universe`, `placeholder` |
| grain | `basin_region`, `hub_field`, `facility`, `onshore_plant`, `vessel`, `fleet`, `project`, `coverage_area`, `office`, `out_of_universe` |
| worksite status | `planned`, `construction`, `commissioning`, `operating`, `shut_in`, `ceased`, `decommissioning`, `removed`, `historical` |
| presence | `current`, `recent`, `likely`, `historical` |

Columns are `text` with a named CHECK `<table>_<column>_check` of the form `CHECK (col IS NULL OR col = ANY (ARRAY[…]))`.
Also on each of the three tables: `<table>_valid_range_check CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)`.
On worksites: `worksites_status_as_at_check CHECK (status_as_at IS NULL OR status IS NOT NULL)` and the same for
`presence_as_at`. No CHECK on `jurisdiction`, `region`, `sub_sector` (no vocabulary in §3.2; DA1.2 proposes one — §5 O-8).

#### 2.3.2 `employers` — 11 new columns + ABN CHECK + two triggers

| Column | Type | Null / default |
|---|---|---|
| confidence | text | null, CHECK confidence vocabulary |
| source | text | null, CHECK source vocabulary |
| source_ref | text | null |
| verified_by | uuid → `auth.users(id)` ON DELETE SET NULL | null |
| verified_at | timestamptz | null |
| valid_from, valid_to | date | null |
| notes | text | null (absent today) |
| organisation_kind | text | null, CHECK ten values |
| is_agreement_entity | boolean | **NOT NULL DEFAULT false** (constant default: metadata-only on PG 17) |
| legal_name | text | null |

`abn` exists (varchar(20), 0 non-null): no column added. Add `employers_abn_check CHECK (abn IS NULL OR abn ~ '^\d{11}$')`
(0 rows violate, §1.4.3) and a `BEFORE INSERT OR UPDATE OF abn` trigger `trg_employers_abn_normalise`
(`NEW.abn := NULLIF(regexp_replace(NEW.abn, '[\s-]', '', 'g'), '')`) so an ABN typed as `12 345 678 901` in the
employers tab (`employers-tab.tsx:404`) is stored as eleven digits instead of failing the CHECK. The ABR mod-89
checksum is not enforced (not in the spec).

Cycle guard `trg_employers_parent_cycle_guard`: `BEFORE INSERT OR UPDATE OF parent_employer_id … FOR EACH ROW WHEN
(NEW.parent_employer_id IS NOT NULL)`, function `employers_parent_cycle_guard()` (plpgsql, VOLATILE, owner postgres):
raise `check_violation` if `NEW.parent_employer_id = NEW.employer_id`; take
`pg_advisory_xact_lock(hashtext('public.employers.parent_employer_id'))` so two concurrent re-parentings cannot close a
loop between them; walk up from `NEW.parent_employer_id` and raise `check_violation` ("employer % would become its own
ancestor") on meeting `NEW.employer_id`, or on depth > 64. In a row-level BEFORE trigger, rows already processed by the
same statement are visible, so a multi-row UPDATE that would close a two-row loop is caught on the second row.
Existing data: 0 cycles, max depth 2 (§1.4.3), so the guard refuses nothing today. `merge_employers` already refuses
the one merge shape that would create a loop (ancestor guard, `:4052-4063`); the employer-groups function (`:327`) now
gets an error instead of silently writing a loop.

#### 2.3.3 `worksites` — 17 new columns, FK to vessels, cycle guard; **`facility_operator_id` is not added**

| Column | Type | Null / default |
|---|---|---|
| confidence, source, source_ref, verified_by, verified_at, valid_from, valid_to | as employers | null |
| grain | text | null, CHECK ten values |
| status | text | null, CHECK nine values |
| status_as_at | date | null |
| is_normally_unmanned | boolean | **NOT NULL DEFAULT false** |
| sub_sector, jurisdiction, region | text | null |
| vessel_id | integer → `vessels(vessel_id)` ON DELETE NO ACTION | null |
| presence | text | null, CHECK four values |
| presence_as_at | date | null |

`notes` exists (7 non-null): not added.

**`facility_operator_id` — decision: reuse `worksites.operator_id`, add no column** (orchestrator to confirm, §5
O-1). Evidence: `operator_id` is an FK to employers (`worksites_operator_id_fkey`), holds 25 values that all differ
from `principal_employer_id` and name the facility operator (Teekay, MODEC, BW; §1.4.3); it is the app's "Operator"
field (`worksites/page.tsx:444-448`, embed `employers!operator_id` at `worksites/page.tsx:85` and
`worksites/[id]/page.tsx:238`), the mobilisation pipeline's operator (`lib/mobilisation/pipeline/context.ts:45`,
`parse/nopsema.ts:273`, `parse/commercial.ts:51`) and is re-pointed by `merge_employers` (`:4151-4154`). A second
column would split one fact in two, and because `merge_employers` deletes its victims (`:4367`) with no re-point of
an unknown column, a new NO ACTION FK to employers would make every DA1.1 merge of a referenced victim fail (and ON
DELETE SET NULL would silently drop the fact). The migration comments `operator_id` as "facility operator (plan §3.2
`facility_operator_id`)" and `principal_employer_id` as "titleholder (plan §3.2)". If the orchestrator prefers the
§3.2 name, the alternative is a rename in DA2.2 together with the app and `merge_employers` — not here.

`vessel_id`: FK added inside `DO $$ BEGIN IF to_regclass('public.vessels') IS NOT NULL THEN … END IF; END $$` (D15
default: guard every reference to `vessels`) so the file still applies on dev, which lacks the table (§1.4.5); the
production and clone runs assert the FK exists (§3). ON DELETE NO ACTION: no code deletes vessels (grep of
`from("vessels")` in `apps/organising-db/src`: select/update only, e.g. `projects/watchlist/page.tsx:171` toggles
`is_active`), so a linked vessel cannot vanish silently. Partial unique index
`uq_worksites_vessel_id ON worksites (vessel_id) WHERE vessel_id IS NOT NULL`: one worksite per vessel (DA1.2 links
after merging duplicates; §5 O-7).

Cycle guard `trg_worksites_parent_cycle_guard` on `parent_worksite_id`: same shape as employers, own advisory key.
Existing: 1 parent link, 0 cycles.

#### 2.3.4 `agreement_worksites` — 6 new columns; `mapping_confidence` **renamed** to `confidence`

New: `source`, `source_ref`, `verified_by`, `verified_at`, `valid_from`, `valid_to` (types and CHECKs as above).
`notes` (varchar(200), 0 non-null) and `mapping_notes` (text, 47 non-null) exist: no `notes` added; `mapping_notes` is
commented as this table's provenance note.

`mapping_confidence` → **renamed** `confidence`, and `agreement_worksites_mapping_confidence_check` →
`agreement_worksites_confidence_check` (definition unchanged; the 47 values keep their meaning). Options weighed:

| Option | For | Against |
|---|---|---|
| **Rename (chosen)** | one column name across the three tables for DA1.x loads, DA6.1 (`confidence = H`, `ORCHESTRATION_PROMPT.md:237`) and DA5.3 reports; §3.7 says the column "becomes part of the pattern"; metadata-only; no view reads it (§1.4.4); the only code reference is `seed-from-spreadsheet.ts:455` (an operator script, updated in the same commit) | generated types change a key (regenerated anyway); a PostgREST client selecting `mapping_confidence` by name would break — grep finds none in `apps/` or `packages/` |
| Stored generated alias | old name stays | PG 17 has no virtual generated columns: a stored one rewrites the table and cannot be written, so loaders would still write `mapping_confidence` |
| Leave and document | zero change | every loader and report must special-case one table |

Guarded: rename only when `mapping_confidence` exists and `confidence` does not (idempotent).

#### 2.3.5 `worksite_scopes`, `employer_worksite_roles`, `agreements`, `workers` — untouched

`worksite_scopes` and `employer_worksite_roles` become views over `engagements` in DA2.2 (§3.3 `:259`); provenance
lands on `engagements` there. Adding columns now would be dropped at that change. `agreements` gets coverage fields in
DA2.3. **`workers` is not touched by this package** (no column, no trigger, no lock).

#### 2.3.6 `fact_reviews`

```sql
CREATE TABLE IF NOT EXISTS public.fact_reviews (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  entity        text NOT NULL,
  entity_id     integer NOT NULL,
  question      text,
  proposed      text,
  decided       text,
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_ref  text,
  worksheet     text,
  worksheet_row integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fact_reviews_entity_check    CHECK (entity IN ('employer','worksite','agreement','engagement')),
  CONSTRAINT fact_reviews_content_check   CHECK (question IS NOT NULL OR proposed IS NOT NULL OR decided IS NOT NULL),
  CONSTRAINT fact_reviews_decided_check   CHECK ((decided IS NULL) = (decided_at IS NULL)),
  CONSTRAINT fact_reviews_worksheet_check CHECK ((worksheet IS NULL) = (worksheet_row IS NULL) AND (worksheet_row IS NULL OR worksheet_row >= 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fact_reviews_worksheet_row ON public.fact_reviews (worksheet, worksheet_row);  -- NULLs distinct
CREATE INDEX IF NOT EXISTS idx_fact_reviews_entity ON public.fact_reviews (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_fact_reviews_open ON public.fact_reviews (entity, created_at DESC) WHERE decided IS NULL;
```

`entity_id` has **no FK** by design: it is polymorphic, `engagement` does not exist until DA2.2, and a review must
outlive the merge that deletes its entity (`merge_employers :4367`); `employer_merge_events` maps a victim id to its
survivor. Existence is checked by `record_fact_review()` at insert and by `10`'s preconditions.

RLS and grants, mirroring `name_match_reviews` (`20260922120000:136-163`): `ENABLE ROW LEVEL SECURITY`; one policy
`fact_reviews_select_authed FOR SELECT TO authenticated USING (true)`; `REVOKE ALL … FROM PUBLIC, anon,
authenticated; GRANT SELECT … TO authenticated; GRANT ALL … TO service_role`; the identity sequence revoked from
PUBLIC/anon/authenticated and `USAGE, SELECT` to service_role (same `DO` block as `:154-163`).

**Write path — decision: SECURITY DEFINER function for admins + service role + run sheets as postgres.**
`public.record_fact_review(payload jsonb) RETURNS public.fact_reviews` (plpgsql, SECURITY DEFINER, `SET search_path
TO 'public'`, owner postgres), gated `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may record fact
reviews'` exactly as `decide_name_match` (`:216-218`):
- without `id`: insert `{entity, entity_id, question?, proposed?, decided?, decision_ref?}`; checks the entity exists
  for `employer` / `worksite` / `agreement` (not for `engagement` until DA2.2 replaces the function); when `decided` is
  present sets `decided_by = auth.uid()`, `decided_at = now()`. `worksheet`/`worksheet_row` are not accepted (they
  belong to run-sheet loads).
- with `id`: decides an open row (`decided IS NULL`, `FOR UPDATE`), setting `decided`, `decision_ref`, `decided_by =
  auth.uid()`, `decided_at = now()`; raises if already decided. A changed decision is a new row (append-only record).
Grants as `:487-489`: REVOKE from PUBLIC and anon; EXECUTE to authenticated and service_role. No UI calls it in this
package; DA1.1/DA1.2 run sheets insert directly as postgres.

#### 2.3.7 Comments (every new column, `operator_id`, `principal_employer_id`, `mapping_notes`, the table and function)

Each states the vocabulary and who may set it. Wording the implementer uses (abbreviated here):
- `confidence`: "High | Medium | Low (D13). Research facts enter at their stated confidence and are raised only by
  organiser or member verification or an FWC coverage clause (plan §4.1.6). Set by data run sheets and admins."
- `source`: "Where the fact came from: <ten values>. Set by the run sheet or routine that wrote the fact; `manual`
  for an admin edit. Never overwritten by a different source without keeping the earlier value (plan §4.1.3)."
- `source_ref`: "Pointer into the source: worksheet and row, workbook tab and cell, FWC decision number, ABR lookup
  date." · `verified_by` / `verified_at`: "Who confirmed the fact and when (organiser/member verification or an
  adjudication). Null for unverified research." · `valid_from` / `valid_to`: "Period the fact holds; null = not known
  (do not invent history, Q-S9)."
- `organisation_kind`, `is_agreement_entity`, `legal_name` (§3.1, D2/D3/D11: "admin determination, row by row");
  `grain`, `status`/`status_as_at`, `presence`/`presence_as_at`, `is_normally_unmanned`, `vessel_id`,
  `jurisdiction`, `region`, `sub_sector` (§3.2, D9); set by DA1.1/DA1.2/DA3.x run sheets and admins.
- The RLS today lets `user`-role organisers UPDATE employers and worksites (§1.4.2); the comments say "admins and run
  sheets", and enforcement is deferred (§6 R6).

#### 2.3.8 Post-assertions at the end of the migration

A `DO` block raising on: any of the 11 / 17 / 6 columns absent; `agreement_worksites.mapping_confidence` present or
`confidence` absent; any of the new CHECKs, the two cycle-guard triggers, the ABN trigger, `fact_reviews`,
`record_fact_review(jsonb)` absent; `worksites_vessel_id_fkey` absent **when `vessels` exists**.

#### 2.3.9 Lock implications (tables the app writes constantly)

`ALTER TABLE … ADD COLUMN` takes ACCESS EXCLUSIVE on employers, worksites and agreement_worksites. Every added column is
nullable without default, or boolean with a constant default (PG 17 fast default), so no table is rewritten; the
CHECKs scan 179 / 190 / 54 rows; the vessel FK takes SHARE ROW EXCLUSIVE on worksites and `vessels` and scans 190 null
values. All locks are held to `COMMIT`, so for the transaction's duration every read of `workers_view` (it joins
employers and worksites), the dashboards, the membership import and the mobilisation pollers (`mobilisation-ais`
`*/30`, `mobilisation-commercial` `0 * * * *`, `apps/organising-db/vercel.json`) wait. Safeguards: `lock_timeout =
3s` (an ALTER queued behind a long reader would otherwise stall every later reader), one short transaction, run at a
minute away from :00 and :30 and not during the weekly membership batch; the clone rehearsal records the duration
(expected well under a second at these sizes). `workers` is not locked by this package.

### 2.4 Compatibility

- **Views** (§1.4.4): none selects `*` from an altered table, and a view's column list is fixed at creation anyway;
  no view reads `mapping_confidence`. Acceptance A6: the ten `pg_get_viewdef` md5s and column counts are identical
  before, after-forward, after-rollback and after-forward-2.
- **PostgREST**: no new FK to employers, so no new ambiguity for `employers(...)`/`worksites(...)` embeds (existing
  ones already carry `!operator_id` / `!principal_employer_id` hints). The new `worksites.vessel_id → vessels` FK adds
  a relationship next to the signal embeds `vessels(name)` / `vessels(name, imo)` from `mobilisation_signals`
  (`projects/alerts/page.tsx:70`, `lib/hooks/useProjectRadar.ts:9`, `:81`,
  `projects/contractors/[id]/page.tsx:29`); signals has one direct FK to vessels, so the embeds should stay
  unambiguous — proven by probing those four strings on dev after the migration (standing PostgREST rule), which
  needs `vessels` on dev (§5 O-4).
- **App inserts/updates** into the three tables (script scan for `.from("employers"|"worksites"|"agreement_worksites")`
  followed by `.insert|.upsert|.update` within three lines): `components/overview/employers-tab.tsx:386,416`;
  `components/campaigns/step-employers-worksites.tsx:430,475`; `app/api/campaign-import/apply/route.ts:149,158,233,242`;
  `app/api/reference-import/apply/route.ts:121,162`; `app/(dashboard)/worksites/page.tsx:324`;
  `app/(dashboard)/employers/[id]/page.tsx:381`; `app/(dashboard)/worksites/[id]/page.tsx:608`;
  `components/worksites/{add-scope-dialog.tsx:239, add-employer-dialog.tsx:242, edit-employer-role-dialog.tsx:183,
  link-agreement-dialog.tsx:247}`; seed scripts under `apps/organising-db/scripts/`. All new columns are nullable or
  defaulted, so none needs a new field; the two typed `Insert` payloads (`employers-tab.tsx:400`,
  `worksites/page.tsx:306`) stay valid. `employers-tab.tsx:404` gains the ABN normalisation; a malformed ABN now
  fails with `employers_abn_check` (§6 R7). `components/import/import-dialog.tsx:238` also inserts employers but is
  imported nowhere (grep).
- **SQL writers**: `decide_name_match` inserts employers/worksites with named columns
  (`20260922120000:254,267`); `merge_employers` updates named columns; the employer-groups function (`baseline :312`)
  inserts named columns — all unaffected apart from the cycle guard.

### 2.5 Generated types (`packages/db-types/generated.ts`)

| Entry | Change |
|---|---|
| `employers` (`:12012`) Row / Insert / Update | +11 keys (`is_agreement_entity: boolean` in Row, optional in Insert/Update; the rest `T \| null`) |
| `worksites` (`:23147`) | +17 keys; Relationships gains `worksites_vessel_id_fkey` → `vessels` |
| `agreement_worksites` (`:1124`) | +6 keys; `mapping_confidence` → `confidence` |
| `fact_reviews` | new table entry (12 columns) |
| Functions | `record_fact_review: { Args: { payload: Json }; Returns: … fact_reviews row }` |

`Employer` / `Worksite` in `types/planner-types.ts:8-9` widen; no code builds a full Row literal (grep for
`Tables<'employers'>`, `['employers']['Row']` finds only these aliases and the two Insert payloads). Types are
regenerated from the fresh clone with an explicit ref (`SUPABASE_PROJECT_REF=<fresh clone> pnpm gen:types`) and the
diff restricted to these entries; if the clone produces unrelated drift, hand-add instead (DA0.3 precedent). After the
merge the gen-types workflow (`.github/workflows/gen-types.yml`, production) must produce no diff.

### 2.6 `fact_reviews` from the worksheets — builder and load

#### 2.6.1 Inputs (headers read 2026-09-24)

- `docs/data-architecture/worksheets/employers_adjudication_2026-09-22.csv`: `employer_id, employer_name,
  employer_category, parent_employer_id, created, active_workers, worksite_roles, agreements, aliases, lineage,
  oa_universe_entity, proposed_canonical, proposed_relationship, proposed_action, open_question, decision,
  decided_by, decided_on` — 187 records, ids unique.
- `docs/data-architecture/worksheets/worksites_adjudication_2026-09-22.csv`: `worksite_id, worksite_name,
  worksite_type, is_offshore, basin, is_active, parent_worksite_id, created, principal_employer, operator,
  active_workers, employer_roles, agreement_links, proposed_grain, oa_universe_asset, proposed_action, open_question,
  decision, decided_by, decided_on` — 194 records, ids unique; one quoted cell spans two lines (worksite 24's
  `operator`), so records ≠ physical lines after it.

Profile (Python `csv.DictReader`): every record has a proposal — `proposed_action` non-empty in all 187 / 194
(employer 40's is `—`, but its `proposed_canonical` and `proposed_relationship` are filled); `open_question` is `—` in
130 / 137; `decision`, `decided_by` (`operator` everywhere) and `decided_on` (`2026-09-22` everywhere) are filled
together in 46 / 35.

#### 2.6.2 Mapping (one `fact_reviews` row per worksheet record that has a proposal or a decision = every record)

| fact_reviews | employers sheet | worksites sheet |
|---|---|---|
| entity | `employer` | `worksite` |
| entity_id | `employer_id` | `worksite_id` |
| question | `open_question`, trimmed; `—` or empty → NULL | same |
| proposed | `action: <proposed_action>; canonical: <proposed_canonical>; relationship: <proposed_relationship>`, fields that are `—`/empty omitted | `action: <proposed_action>; grain: <proposed_grain>; asset: <oa_universe_asset>`, same rule |
| decided | `decision` trimmed, empty → NULL | same |
| decided_by | NULL (the sheet names a role, `operator`, not an account; §5 O-3) | same |
| decided_at | `decided_on` at 12:00 Australia/Perth (`2026-09-22 04:00:00+00`, same calendar date in UTC and Perth), NULL when no decision | same |
| decision_ref | distinct `D\d{1,2}` and `Q-[A-Z]{1,2}\d{1,2}` tokens found in `decision` + `open_question`, sorted, `; `-joined, prefixed `operator 2026-09-22: ` when decided; NULL when none | same |
| worksheet | file name, e.g. `employers_adjudication_2026-09-22.csv` | `worksites_adjudication_2026-09-22.csv` |
| worksheet_row | 1-based record index (header excluded) | same |

Cells are trimmed and CRLF normalised to LF. **Skipped**: employers 787–794 (8) and worksites 196–199 (4), removed from
production by DA0.2 on 24 September (§1.4.3); the builder lists them in `expected.json.skipped` with the reason
"removed by DA0.2 (D4)". The skip list is an explicit constant, not inferred.

Expected output (computed by the planner from the CSVs; the builder recomputes and the test asserts):

| | records | skipped | loaded | decided | open | with question |
|---|---|---|---|---|---|---|
| employers | 187 | 8 | **179** | 38 | 141 | 49 |
| worksites | 194 | 4 | **190** | 31 | 159 | 53 |
| total | 381 | **12** | **369** | 69 | 300 | 102 |

#### 2.6.3 The builder (Opus)

`fact-reviews-lib.ts` (pure, no I/O): `parseCsv(text)` (RFC 4180: quoted fields, doubled quotes, embedded
newlines, CRLF; no new dependency — the app has only `xlsx`), `mapEmployerRecord`, `mapWorksiteRecord`,
`buildFactReviews({ employersCsv, worksitesCsv, skip })` → `{ rows, skipped, counts }`, `renderSqlValues(rows)`
(single-quote doubling; `NULL` literal; `timestamptz` literal for `decided_at`), `digest(rows)` = md5 of the lines
`worksheet ␟ worksheet_row ␟ entity ␟ entity_id ␟ question ␟ proposed ␟ decided ␟ decided_at(UTC ISO, seconds, Z) ␟
decision_ref` (␟ = `\x1f`, NULL = `\N`), joined by `\n` in `(worksheet, worksheet_row)` order — the same expression
`10` computes in SQL with `concat_ws(E'\x1f', …)` and `string_agg(…, E'\n' ORDER BY worksheet, worksheet_row)`
(`md5(text)` on a UTF8 database equals Node's `createHash('md5')` over UTF-8).

`build-fact-reviews.ts` (run from `apps/organising-db`: `pnpm exec tsx ../../scripts/data-hygiene/da2.1/build-fact-reviews.ts`)
reads the two CSVs, writes the generated block of `10_load_fact_reviews.sql` between `-- BEGIN GENERATED` / `-- END
GENERATED` markers (a `VALUES` list into a temp table `_da21_10_rows`) and `fixtures/expected.json` (`counts`,
`skipped`, `md5`). Tests (`fact-reviews.test.ts`): CSV parser edge cases (quotes, the embedded newline, CRLF, empty
trailing field); each mapping rule (the `—` rules, employer 40, decision_ref extraction, Perth noon); skip list; counts
equal the table above; digest stable across two runs; **the committed generated block and `expected.json` equal a
fresh build** (so an edited worksheet cannot drift from the run sheet unnoticed); no output field contains the
worksheet's `active_workers` or any column other than those mapped.

#### 2.6.4 The run sheet `10_load_fact_reviews.sql` (Fable frame, Opus body)

`BEGIN;` → environment guard verbatim from `scripts/data-hygiene/da0.3/90_rollback_da0_3_name_match_reviews.sql:25-41`
→ preconditions (`DO`, raise on any): `fact_reviews` and `_oux_hygiene_log` exist; `count(*) FROM fact_reviews WHERE
worksheet IN (the two names) = 0`; every loaded `entity_id` exists in employers / worksites (179 / 190); none of the 12
skipped ids exists (a clone that predates DA0.2 is refused); → the generated temp table → `INSERT INTO fact_reviews
(…) SELECT … ORDER BY worksheet, worksheet_row RETURNING *` into a CTE that also inserts one `_oux_hygiene_log` row per
inserted row (`script 'da2.1/10'`, `action 'insert'`, `table_name 'fact_reviews'`, `row_pk {"id": …}`,
`before_row NULL`, `after_row to_jsonb(row)`, `note 'worksheet load'`) → post-assertions: inserted 369 (179 employer,
190 worksite), decided 69 (38 / 31), md5 over the loaded rows = `expected.json.md5`, log rows 369 → `COMMIT;` →
appended read-only `SELECT entity, count(*), count(decided), md5(…)` per entity and in total. Locks: inserts into
`fact_reviews` only.

`91_unload_fact_reviews.sql`: guard → precondition = exactly the state `10` leaves (the 369 rows with the two
worksheet names, md5 equal to `expected.json.md5`, 369 un-rolled-back `da2.1/10` log rows, **and no other
`fact_reviews` row** — a row written by DA1.1 or later stops it) → delete them, logging `action 'delete'` with
`before_row` → stamp the `da2.1/10` rows `rolled_back_at = now()` → assert `fact_reviews` count 0 → `COMMIT;` → `SELECT`.

### 2.7 Tests (Fable)

`20_rehearse_guards.sql` (clone only; each probe in `SAVEPOINT … ROLLBACK TO`, the file ends `ROLLBACK;` so nothing
persists): (1) set an employer's parent to itself → `check_violation`; (2) A→B then B→A in two statements → second
raises; (3) one multi-row UPDATE closing a two-row loop → raises; (4) the same three for worksites; (5) a legal
re-parent of a leaf → succeeds; (6) `abn = '12 345 678 901'` stored as `12345678901`; `abn = '123'` → check
violation; (7) each new CHECK rejects one out-of-vocabulary value and accepts one valid value; (8)
`record_fact_review` with claims of a `user`-role uid → "Only admins"; with an admin uid (claims set as DA0.3's `20`
does, `wp/da0.3.md` §3 row `20`) → row inserted with `decided_by = auth.uid()`, decided again → raises; (9) an update
of `vessel_id` to a missing vessel → FK violation. Outputs pasted in §9.

### 2.8 Work split and seam

| Implementer | Owns | Commit |
|---|---|---|
| Fable | migration; `90`; `91`; `00`; `20`; the frame of `10` (guard, preconditions, CTE, assertions, appended SELECT); `seed-from-spreadsheet.ts:455` rename; types; README; later the `prod/` copies | one commit for the package with Opus's files (CLAUDE.md: one commit per completed feature) |
| Opus | `fact-reviews-lib.ts`, `build-fact-reviews.ts`, `fixtures/expected.json`, the generated block of `10`, `fact-reviews.test.ts` | same commit |

**Seam** (fixed before either starts): the temp table `_da21_10_rows (worksheet text, worksheet_row int, entity text,
entity_id int, question text, proposed text, decided text, decided_at timestamptz, decision_ref text)` that the
generated block creates and fills; the digest expression of §2.6.3 (both sides implement it byte for byte; the test
pins it against a two-row fixture whose md5 Fable also computes in SQL on the clone); `expected.json` keys `counts
{employer, worksite, total, decided, skipped}`, `skipped [{entity, id, reason}]`, `md5`. Fable's frame reads nothing
else from Opus's files.

---

## 3. Scripts and run order — `scripts/data-hygiene/da2.1/`

### 3.1 `00_preflight.sql` (read-only; every environment, before and after every step)

One statement returning one row: per table the list of present new columns (`pg_attribute`), `mapping_confidence` vs
`confidence` presence; every CHECK's `pg_get_constraintdef` on the three tables and `fact_reviews`; the trigger list;
`worksites_vessel_id_fkey` presence; the ten view md5s and column counts of §1.4.4; data digests over the
**pre-existing** columns (`md5(string_agg((to_jsonb(t) - ARRAY[<the new column names>])::text, ',' ORDER BY pk))` for
employers and worksites; for agreement_worksites the explicit tuple `(id, agreement_id, worksite_id, notes,
mapping_notes, COALESCE(to_jsonb(a)->>'confidence', to_jsonb(a)->>'mapping_confidence'))`, so the digest is stable
across the rename); counts of non-null values in each new column and of `is_agreement_entity` / `is_normally_unmanned`
true; `fact_reviews` count and md5 when present; parent-cycle count and max depth for both tables (the §1.4.3 query);
ledger rows `>= 20260924010000`.

### 3.2 `90_rollback_da2_1_provenance.sql` (schema rollback)

Guard → precondition (`DO`, **STOP** with counts): the DA2.1 objects exist; `fact_reviews` has 0 rows (run `91` first);
every new nullable column on employers (10), worksites (16) and agreement_worksites (6) is NULL in every row;
`is_agreement_entity` and `is_normally_unmanned` are false in every row. (`agreement_worksites.confidence` holds the 47
pre-existing values and is renamed back, not checked.) Change: drop `record_fact_review`, `fact_reviews`, the three
triggers and their functions, `uq_worksites_vessel_id`, `worksites_vessel_id_fkey`, the new CHECKs and columns; rename
`confidence` → `mapping_confidence` and the CHECK back; drop the new comments on `operator_id` /
`principal_employer_id` / `mapping_notes` (restore NULL — none exists at baseline). Post-assertions: column counts
16 / 16 / 6; the `mapping_confidence` CHECK text equals §1.4.2 byte for byte; `00`'s digests equal the before values
(pasted as literals by the verifier). Ledger repair is a separate, explicitly approved statement quoted in the header,
not executed: `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925010000';`. Writes no
hygiene-log row (schema only; the log's action CHECK is `update|insert|delete`, §1.4.3).

### 3.3 Run order

**Dev** (operator approval per file): `00` → migration as one `BEGIN; … COMMIT;` submission + ledger row
`('20260925010000','da2_1_provenance')` → `00` → REST probes: `select=employer_id,confidence,source,organisation_kind`
on employers, `select=worksite_id,grain,status,vessel_id` on worksites, `select=id,confidence` on
agreement_worksites, `select=*` on fact_reviews (as the contract user: 200 and `[]`), and the four `vessels(…)` embed
strings of §2.4 — the last only if dev has `vessels` (O-4).

**Fresh clone** (D17; ref recorded in the ledger when the operator creates it): `00` (before) → migration + ledger row
(timed) → `00` (after-forward-1) → `20` → `10` → `00` → `91` → `00` → `90` → `00` (after-rollback = before on every
digest, CHECK text and view md5) → ledger repair → migration + ledger row → `00` (after-forward-2 = after-forward-1) →
`10` → `00`. The clone is left forward with `fact_reviews` loaded, ready for DA1.1's rehearsal. **12 September
clone** (fallback, only if the fresh clone is late and only with approval): the migration inside `BEGIN; … ROLLBACK;`
as a syntax check; its register does not match the worksheets (163 / 170 rows), so `10` is not run there.

**Production** (operator, `prod/`): P1 `00` → P2 `BEGIN; SET LOCAL oux.env = 'production';` + migration + ledger row
`COMMIT;` + appended SELECT (at a minute away from :00/:30, outside the weekly batch) → P3 `00` → PR merged → gen-types
workflow run, no diff beyond §2.5 (or none if hand-added types were exact) → P4 `10` with `SET LOCAL oux.env` → P5 `00`.

---

## 4. Acceptance evidence

| # | Criterion | Proof |
|---|---|---|
| A1 | Columns and vocabularies exist on employers (11), worksites (17), agreement_worksites (6 + rename) | `00` after P2 on production: every column present, every CHECK text as §2.3.1, `mapping_confidence` absent, `confidence` CHECK text = §1.4.2 with the new name |
| A2 | Nothing existing changed | `00` data digests over pre-existing columns identical before/after (dev, clone ×2, production); agreement_worksites confidence distribution still High 38 / Medium 7 / Low 2 / null 7 |
| A3 | Cycle guards refuse loops, accept today's data | `20` probes 1–5 on the clone; `00` cycles 0, max depth 2 both tables, before and after |
| A4 | `fact_reviews` loaded from the worksheets | `10`'s appended SELECT on the clone and production: 369 rows (179 employer, 190 worksite), 69 decided, md5 = `fixtures/expected.json.md5`; 12 skipped listed in `expected.json` |
| A5 | Builder deterministic and tested | `pnpm test` from `apps/organising-db`: `fact-reviews.test.ts` green incl. the committed-output equality test |
| A6 | Views unchanged | ten viewdef md5s and column counts (§1.4.4) identical at every rehearsal stage and on production after P2 |
| A7 | Rehearsal | §3.3 clone sequence pasted in §9; after-rollback = before; after-forward-2 = after-forward-1; migration duration recorded |
| A8 | RLS and grants | `information_schema.role_table_grants` for `fact_reviews`: authenticated SELECT only, service_role ALL, anon none; `pg_policies`: one SELECT policy; `20` probe 8 (user refused, admin accepted) |
| A9 | Quality gates | `pnpm lint` (baseline 300 on the merged tree per the ledger's incidental finding; touched files clean), `pnpm test`, `pnpm build`, root `pnpm validate:migrations`; REST probes of §3.3 on dev |
| A10 | Types | generated.ts diff limited to §2.5; post-merge gen-types run commits nothing |

**What the §5 acceptance ("every row touched in Phase 1 carries source, confidence and verified_at") needs, and
when.** DA2.1 proves the columns exist with their vocabularies (A1) and that the adjudication record is in the
database (A4). The criterion itself is proved by DA1.1 and DA1.2, whose run sheets set `source`, `confidence`,
`source_ref` and — for rows an adjudication decided — `verified_at` (the worksheet's `decided_on`) on every row they
write. The query this plan fixes for their verifiers (per table, over the rows their scripts logged):

```sql
SELECT count(*) FROM public.employers e
 WHERE e.employer_id IN (SELECT (row_pk->>'employer_id')::int FROM public._oux_hygiene_log
                          WHERE script LIKE 'da1.1/%' AND table_name = 'employers' AND rolled_back_at IS NULL)
   AND (e.source IS NULL OR e.confidence IS NULL OR e.verified_at IS NULL);   -- must be 0
```

(same for worksites with `da1.2/%`, and agreement_worksites by `id`). Rows removed by a merge are covered by
`employer_merge_events` and the survivor's provenance. That query returns 0 today only trivially (no Phase 1 row yet).

---

## 5. Operator inputs (and open questions for the orchestrator)

| # | Input | Recommendation | Tied to |
|---|---|---|---|
| O-1 | `facility_operator_id`: reuse `worksites.operator_id` (commented as facility operator) instead of adding the §3.2 column | Reuse (§2.3.3); a rename, if wanted, belongs to DA2.2 with the app and `merge_employers` | §2.3.3 |
| O-2 | `agreement_worksites.mapping_confidence` renamed `confidence` | Rename (§2.3.4) | §2.3.4 |
| O-3 | `decided_by` for the 69 worksheet decisions: NULL, with `decision_ref = 'operator 2026-09-22: …'` and the worksheet row as provenance — or the operator names the account to record | NULL (no account id in a committed file) | §2.6.2 |
| O-4 | Dev lacks five migrations incl. `20260922040000` (`vessels`): catch dev up first (so the FK and the four embed probes run there), or accept the guarded skip on dev | Catch up, each under its own approval | §2.3.3, §3.3 |
| O-5 | The fresh clone (D17): its ref, and that it carries DA0.2/DA0.3/DA0.5 | Required before the rehearsal | §3.3 |
| O-6 | Production window for P2: not at :00/:30, not during the weekly batch | — | §2.3.9 |
| O-7 | One worksite per vessel (`uq_worksites_vessel_id`) | Accept | §2.3.3 |
| O-8 | `jurisdiction`, `region`, `sub_sector` free text now; vocabularies (if any) proposed by DA1.2 | Accept | §2.3.1 |
| O-9 | Vocabulary alignment: the alias tables use `oa_universe` / `fwc` (`20260922120000:26,35`), the provenance `source` uses `oa_universe_research` / `fwc_coverage` (§3.3). Leave both (alias source = how the alias arose; fact source = where the fact came from) or align in DA1.4 | Leave; note for DA1.4 | §2.3.1 |

Also for DA1.1 / DA1.2 (not inputs to this package): the worksheets' proposal labels are not all in the new
vocabularies — worksites `grain=onshore_facility` (3 records + 1), `grain=hub`, `grain=field`, `grain=region`;
employers `kind=drilling contractor`, `marine key client`, `operator`, `crew_provider/contractor`,
`labour_hire/group_training` (`proposed_action` values, §2.6.1 profile). The adjudication rounds map them onto §2.3.1.

---

## 6. Risks

| # | Risk | Safeguard |
|---|---|---|
| R1 | ACCESS EXCLUSIVE on employers / worksites / agreement_worksites stalls `workers_view` and every page while the migration waits or runs | `lock_timeout 3s` + `statement_timeout 60s`; one short transaction; quiet window (O-6); duration measured on the clone; on a lock timeout nothing changed — re-run |
| R2 | The `vessels` FK takes SHARE ROW EXCLUSIVE on `vessels`, which the AIS poller updates every 30 minutes | Same transaction and timeouts; run away from :00/:30; NO ACTION delete rule (no code deletes vessels); guarded when `vessels` is absent |
| R3 | A cycle guard refuses existing data or an existing routine | 0 cycles, max depth 2 today (§1.4.3); `merge_employers` already refuses the loop-making merge (`:4052-4063`); `20` exercises legal and illegal paths |
| R4 | A new FK to employers breaks DA1.1's merges (`merge_employers :4367`) | None added (O-1); `verified_by`/`decided_by` reference `auth.users` only |
| R5 | The rename breaks a reader of `mapping_confidence` | Grep: only `seed-from-spreadsheet.ts:455` (updated); no view (§1.4.4); REST probes on dev |
| R6 | `user`-role organisers can write provenance columns (UPDATE policy `get_user_role() IN ('admin','user')`), and app edits do not update `source` | Comments state the rule; enforcement (column-level trigger or an edit path that stamps `source = manual`) assigned to DA4.2 / DA6.2 — recorded as an incidental finding, not widened here |
| R7 | The ABN CHECK rejects a malformed ABN typed in the employers tab | Normalisation trigger accepts spaces/hyphens; 0 ABNs today; the tab shows the constraint error |
| R8 | The worksheets change after the builder ran | Committed-output equality test (A5); `10` asserts the md5 |
| R9 | `fact_reviews` rows for employers DA1.1 merges away point at deleted ids | Intended (history); `employer_merge_events` maps victim → survivor; no FK by design |
| R10 | Types regenerated from production before P2 (promotion gate) | PR merged only after P2; types from the fresh clone with an explicit ref |

**Incidental findings for the ledger (not widened into DA2.1):**
1. `merge_employers` (`baseline :3981-4395`) re-points neither `programs.principal_employer_id` (NO ACTION FK; 3
   non-null on production) nor `worksite_contracts.contractor_employer_id` (NO ACTION; 0 rows) — a DA1.1 merge whose
   victim is a program's principal will fail at `:4367` — and silently nulls the SET NULL references
   `vessels.owner_operator_id` (3 non-null), `mobilisation_watch_contractors.employer_id` (2),
   `mobilisation_signals` / `mobilisation_alerts` contractor/operator (4 / 4 rows with one set),
   `upcoming_project_employers.employer_id` (43), `name_match_reviews.resolved_employer_id`, and the three
   `worker_*_options.employer_id`. → DA1.1 planner.
2. Organiser-role UPDATE on employers/worksites can alter provenance columns without restamping `source` (R6). →
   DA4.2 / DA6.2.

---

## 7. Approval

_Pending (orchestrator)._

## 8. Deviations from plan

- D-a (in advance): the load's rollback is `91_unload_fact_reviews.sql`; `90` is the schema rollback (DA0.3
  convention, §2.2).

_(implementer adds entries here)_

## 9. Verification record

_Pending._

## 10. Review

_Pending._

## 11. Run sheet record

_Pending._
