# DA1.3 — Scope taxonomy

Status: **planning** (plan written 2026-09-24 by the Opus planner, awaiting orchestrator approval and the operator's
crosswalk confirmations in §5).
Ledger row: `../PROGRESS.md` (DA1.3). Convention: `README.md` in this directory.
Scripts: `scripts/data-hygiene/da1.3/`. Migration: `supabase/migrations/20260925090000_da1_3_scope_taxonomy.sql`.

---

## 1. Specification

### 1.1 The plan's §5 row, verbatim

`docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md:391`:

> | DA1.3 | Scope taxonomy: 14-scope top level, crosswalks from `sectors` and `role_type`, `agreement_scopes` back-filled from `source_sheet` | migration + `10_scopes.sql` | every agreement has ≥1 scope; every `worksite_scopes` row maps to a new scope |

### 1.2 The orchestration paragraph, verbatim

`docs/data-architecture/ORCHESTRATION_PROMPT.md:189`:

> **DA1.3 Scope taxonomy.** Opus planner and implementer; Fable reviewer (migration). The map's 14 scopes on top of `work_scopes`, crosswalks from `sectors` and `upcoming_project_employers.role_type`, `agreement_scopes` back-filled from `source_sheet`. Depends on nothing; may run in parallel with DA1.1.

### 1.3 Sections this package depends on

- `OA_UNIVERSE_ALIGNMENT_PLAN.md` §1.1 (lines 55, 58, 59: `worksite_scopes` / `employer_scopes` / `work_scopes`
  49 / 28 / 22 on 22 Sep; `agreement_scopes` 0; `sectors` 16). DA0.2 removed the synthetic rows on 24 Sep:
  production now holds **13 / 10 / 22** (measured, §1.5 below).
- §1.5 (lines 124–131): `source_sheet` is the bargaining-stream taxonomy; `sectors` mirrors it; `agreement_scopes` empty.
- §2.3 (line 239): "Scope taxonomy | four vocabularies: `sectors` (16), `work_scopes` (22), the map's 14 scopes,
  `upcoming_project_employers.role_type` (14) | one taxonomy with a crosswalk".
- §3.5 (lines 265–275): the three meanings of "scope"; **D7**: the map's 14 scopes become the top level of
  `work_scopes`, the existing leaves sit beneath them, `scope_crosswalk` rows map `sectors` and `role_type` to scopes,
  `sectors` stays as the bargaining-stream dimension.
- §3.4 (line 261): `agreement_scopes` populated from `source_sheet`.
- `reference/oa-universe-tabs/Offshore_facility_x_scope.csv` header (the 14 scope columns, §1.5.6) and
  `reference/OA_universe_context_for_database_reconciliation.md:13, 32` (scope-at-facility; 46 facilities × 14 scope columns).
- `ORCHESTRATION_PROMPT.md` lines 32–45 (rules), 100–120 (run sheets, verification standards).

### 1.4 Decision consumed

**D7**, `OA_UNIVERSE_ALIGNMENT_PLAN.md:448`, verbatim:

> | D7 | Q-S7: scope taxonomy | Map's 14 scopes on top; sectors stay as bargaining stream | DA1.3 | **Decided:** the §3.5 model. |

Nothing in `sectors` is deleted or renamed. `sectors` is also the target of `mobilisation_signals.sector_id`
(`supabase/migrations/20260922040000_mobilisation_radar.sql:190`, `ON DELETE SET NULL`) and of
`agreements.sector_id` (baseline:22881) — another reason it stays untouched.

### 1.5 Current vocabularies, measured (production `gteygwfgjvczanmrwgbr`, read-only, 2026-09-24)

All queries SELECT-only, PII-free (scope, sector and agreement names, ids, counts). Pasted from the connector.

#### 1.5.1 `work_scopes` — every row

Query: `SELECT s.scope_id, s.scope_name, s.parent_scope_id, p.scope_name AS parent_name, (children), s.sort_order,
s.is_active, s.is_whole_of_project, (worksite_scopes rows), (employer_scopes rows), (worksite_contracts rows) FROM
work_scopes s LEFT JOIN work_scopes p …`. There is **no `level` and no `code` column** (baseline:16714-16724);
depth is derived from `parent_scope_id`. "Level" below is derived (1 = root).

| scope_id | scope_name | parent | level | children | sort | active | whole_of_project | ws rows | es rows | wc rows |
|---:|---|---|---:|---:|---:|---|---|---:|---:|---:|
| 1 | Brownfields | — | 1 | 2 | 1 | t | f | 2 | 1 | 0 |
| 2 | Maintenance | 1 Brownfields | 2 | 5 | 1 | t | f | 1 | 1 | 0 |
| 3 | Whole of Project | 2 Maintenance | 3 | 0 | 0 | t | **t** | 0 | 0 | 0 |
| 4 | Operations | 2 Maintenance | 3 | 0 | 1 | t | f | 2 | 0 | 0 |
| 5 | Electrical | 2 Maintenance | 3 | 0 | 2 | t | f | 0 | 0 | 0 |
| 6 | Mechanical | 2 Maintenance | 3 | 0 | 3 | t | f | 1 | 1 | 0 |
| 7 | PFP | 2 Maintenance | 3 | 0 | 4 | t | f | 0 | 0 | 0 |
| 8 | Service | 1 Brownfields | 2 | 7 | 2 | t | f | 1 | 1 | 0 |
| 9 | Whole of Project | 8 Service | 3 | 0 | 0 | t | **t** | 0 | 0 | 0 |
| 10 | Logistics | 8 Service | 3 | 0 | 1 | t | f | 1 | 1 | 0 |
| 11 | Catering | 8 Service | 3 | 0 | 2 | t | f | 0 | 0 | 0 |
| 12 | Security | 8 Service | 3 | 0 | 3 | t | f | 0 | 0 | 0 |
| 13 | Emergency Response | 8 Service | 3 | 0 | 4 | t | f | 0 | 0 | 0 |
| 14 | Facility Management | 8 Service | 3 | 0 | 5 | t | f | 0 | 0 | 0 |
| 15 | Inspectors / NDT | 8 Service | 3 | 0 | 6 | t | f | 5 | 3 | 0 |
| 16 | Specialist | — | 1 | 3 | 2 | t | f | 0 | 0 | 0 |
| 17 | ROV | 16 Specialist | 2 | 0 | 1 | t | f | 0 | 0 | 0 |
| 18 | Helicopter Transport | 16 Specialist | 2 | 0 | 2 | t | f | 0 | 1 | 0 |
| 19 | Marine | 16 Specialist | 2 | 3 | 3 | t | f | 0 | 1 | 0 |
| 20 | Generic | 19 Marine | 3 | 0 | 1 | t | f | 0 | 0 | 0 |
| 21 | Accommodation Vessels | 19 Marine | 3 | 0 | 2 | t | f | 0 | 0 | 0 |
| 22 | Supply Vessels | 19 Marine | 3 | 0 | 3 | t | f | 0 | 0 | 0 |

Shape: 2 roots, maximum depth 3, 22 rows, `max(scope_id)` 22, sequence `last_value` 22 (`is_called` true).
Checksum `md5(string_agg(scope_id||':'||scope_name||':'||coalesce(parent_scope_id::text,''), ',' ORDER BY scope_id))`
= **`88ebc3d643b51568122e90dfd9c85476`** on production **and on normal dev `dpnnmkhabysfdogllsyh`** (identical trees).

#### 1.5.2 `sectors` — every row (with agreements per sector; `employer_sectors` is 0 for every sector)

| sector_id | sector_name | description | agreements |
|---:|---|---|---:|
| 1 | Production | Offshore oil & gas production operations | 19 |
| 2 | Maintenance | Offshore and onshore maintenance services | 33 |
| 3 | Catering | Offshore catering and hospitality services | 15 |
| 4 | Marine - Deck Officers | Maritime deck officers on offshore support vessels | 11 |
| 5 | Marine - Engineers | Maritime engineers on offshore support vessels | 8 |
| 6 | Drilling | Offshore drilling operations | 11 |
| 7 | ROV | Remotely operated vehicle subsea services | 7 |
| 8 | Decommissioning | Offshore infrastructure decommissioning and removal | 6 |
| 9 | Offshore Construction | Offshore construction and installation projects | 11 |
| 10 | Aircraft Maintenance | Helicopter and aircraft engineering and maintenance | 2 |
| 11 | Inspection | Non-destructive testing and inspection services | 4 |
| 12 | Dredging | Marine dredging for pipeline and subsea installation | 2 |
| 13 | Hydrographics | Hydrographic survey operations | 1 |
| 14 | Chemists | Scientific and chemical analysis services | 1 |
| 15 | Supply | Pipeline operations and gas supply infrastructure | 0 |
| 16 | Helicopter Engineers | Helicopter engineering services | 3 |

Sum 134; agreements total 136; `sector_id IS NULL` on 2 (ids 42, 1096). `md5(sector_id:sector_name …)` =
`7f04bab1a7333a83a1017df19bd24771`.

#### 1.5.3 `agreements.source_sheet` — distinct values with counts, and the sectors they carry

| source_sheet | agreements | Current | sector(s) on those agreements |
|---|---:|---:|---|
| `<null>` | 1 | 1 | `<no sector>` (id 1096) |
| Aircraft Maint. | 5 | 5 | Aircraft Maintenance \| Helicopter Engineers |
| Catering | 12 | 3 | Catering |
| Chemists | 1 | 1 | Chemists |
| Decommissioning | 6 | 1 | Decommissioning |
| Dredging | 2 | 2 | Dredging |
| Drilling | 8 | 8 | Drilling |
| Expired | 27 | 0 | Catering \| Drilling \| Maintenance \| Offshore Construction \| Production \| ROV |
| Hydrographics | 1 | 1 | Hydrographics |
| Inspection | 4 | 1 | Inspection |
| Maintenance | 22 | 17 | Maintenance |
| Marine-Deck Officers | 11 | 11 | Marine - Deck Officers |
| Marine-Engineers | 9 | 9 | `<no sector>` (id 42) \| Marine - Engineers |
| Offshore Construction | 6 | 6 | Offshore Construction |
| Production | 15 | 15 | Production |
| ROV | 6 | 6 | ROV |

Total 136. Every non-`Expired` sheet carries exactly the matching sector (Aircraft Maint. splits over two sectors that
both map to Helicopters). `Expired` is a status tab, not a stream; its 27 agreements are resolvable only through
`sector_id`. `agreement_scope` is null on all 136; `agreement_scopes` has **0** rows.
Checksum `md5(string_agg(agreement_id||':'||coalesce(sector_id::text,'')||':'||coalesce(source_sheet,''), ',' ORDER BY agreement_id))`
= **`41f2e19fc4876b41f71071e61fecc6ab`**.

#### 1.5.4 `upcoming_project_employers.role_type` — distinct values with counts

| role_type | match_status | rows |
|---|---|---:|
| Operator | auto | 27 |
| Operator | needs_review | 30 |
| Operator | confirmed | 16 |
| Operator | unmatched | 11 |

84 rows, **one** distinct value in the data. The "14" of §2.3 is the CHECK vocabulary (baseline:1507):
`Owner, Operator, Principal_Contractor, Subcontractor, Labour_Hire, Catering, Maintenance, Drilling, ROV, Inspection,
Transport, Decommissioning, Aviation, Other`. The only writers hard-code `'Operator'`:
`apps/scraper/src/pipeline/match.ts:57` (NOPSEMA scraper) and
`apps/organising-db/src/app/api/upcoming-projects/rematch/route.ts:102`; `confirm_upcoming_project_match`
(baseline:1514-1621) never sets `role_type`. The vocabulary's only source is therefore the CHECK constraint; the
crosswalk covers all 14 CHECK values so a future writer is covered.

#### 1.5.5 `worksite_scopes` (13) and `employer_scopes` (10) by scope

| scope | worksite_scopes rows (worksite ids) | with employer | employer_scopes rows (employer ids) | source=auto |
|---|---|---:|---|---:|
| 1 Brownfields | 2 (136, 143) | 1 | 1 (26) | 1 |
| 2 Maintenance | 1 (6) | 1 | 1 (26) | 1 |
| 4 Operations | 2 (143, 144) | 0 | 0 | — |
| 6 Mechanical | 1 (6) | 1 | 1 (26) | 1 |
| 8 Service | 1 (6) | 1 | 1 (26) | 1 |
| 10 Logistics | 1 (1) | 1 | 1 (713) | 1 |
| 15 Inspectors / NDT | 5 (2, 136, 136, 143, 143) | 5 | 3 (29, 78, 698) | 2 |
| 18 Helicopter Transport | 0 | — | 1 (54) | 0 |
| 19 Marine | 0 | — | 1 (70) | 0 |

Worksites: 1 Gorgon LNG, 2 Wheatstone LNG (Downstream), 6 Crux Gas Field, 136 Karratha Gas Plant, 143 Goodwyn,
144 Rankin North. Employers: 26 MONADELPHOUS ENGINEERING ASSOCIATES PTY LTD, 29 ALTRAD, 54 PHI INTERNATIONAL
AUSTRALIA, 70 BAKER HUGHES SERVICES AUSTRALIA PTY LTD, 78 APPLUS+ PTY LTD, 698 Vertech, 713 Toll Energy.
7 distinct scopes in `worksite_scopes`; `worksite_contracts` 0. Checksums: `worksite_scopes`
`md5(id:worksite_id:scope_id:employer_id)` = `ce270ff0a160f2f4c169e3bef2c776f0`; `employer_scopes`
`md5(id:employer_id:scope_id:source)` = `ef9e696b5de0fdc59374e3bfff18ebaa`.
(Dev still carries the synthetic set: 46 / 25; its `work_scopes` tree is identical.)

#### 1.5.6 The map's 14 scope columns (`Offshore_facility_x_scope.csv`, header columns 5–18, verbatim)

`Catering / FM`, `Maintenance / brownfield`, `HUC / commissioning`, `Inspection / integrity`, `Cranes / lifting`,
`Helicopters`, `Marine supply / vessels`, `Crewing / labour hire`, `ROV / subsea / IMR / diving`, `Drilling`,
`Construction / EPC / pipelay`, `Decommissioning`, `Survey / positioning`, `Other (chemist / emergency / medical)`.

(Columns 1–4 are `Tier-1 operator, Facility / vessel operator, Asset / Facility, Status`.) Plan §3.5 abbreviates the
last as "Other"; the migration uses the CSV header text verbatim as `scope_name` so DA3.1's loader matches by name.

### 1.6 Baseline DDL relied on (`supabase/migrations/20260908050000_baseline_schema.sql`)

```sql
-- 16714
CREATE TABLE IF NOT EXISTS "public"."work_scopes" (
    "scope_id" integer NOT NULL,
    "scope_name" character varying(100) NOT NULL,
    "parent_scope_id" integer,
    "description" character varying(300),
    "is_whole_of_project" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
-- 20116  ADD CONSTRAINT "work_scopes_pkey" PRIMARY KEY ("scope_id");
-- 25135  ADD CONSTRAINT "work_scopes_parent_scope_id_fkey" FOREIGN KEY ("parent_scope_id") REFERENCES "public"."work_scopes"("scope_id");
-- 21977/21981 idx_work_scopes_active (is_active), idx_work_scopes_parent (parent_scope_id)
-- 22665  CREATE OR REPLACE TRIGGER "trg_work_scopes_updated_at" BEFORE UPDATE ON "public"."work_scopes" … update_updated_at();
-- 25749/26179/26539/27209 policies: admin DELETE; admin/user INSERT, UPDATE; authenticated SELECT USING (true)
-- 33049-33057 GRANT ALL ON TABLE/SEQUENCE work_scopes TO anon, authenticated, service_role

-- 7217
CREATE TABLE IF NOT EXISTS "public"."agreement_scopes" (
    "id" integer NOT NULL,
    "agreement_id" integer NOT NULL,
    "scope_id" integer NOT NULL
);
-- 18726  ADD CONSTRAINT "agreement_scopes_agreement_id_scope_id_key" UNIQUE ("agreement_id", "scope_id");
-- 22845  … "agreement_scopes_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("agreement_id") ON DELETE CASCADE;
-- 22850  … "agreement_scopes_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "public"."work_scopes"("scope_id") ON DELETE CASCADE;

-- 17535
CREATE TABLE IF NOT EXISTS "public"."worksite_scopes" (
    "id" integer NOT NULL, "worksite_id" integer NOT NULL, "scope_id" integer NOT NULL, "employer_id" integer,
    "engagement_type" character varying(30), "is_current" boolean DEFAULT true NOT NULL,
    "start_date" "date", "end_date" "date", "notes" "text",
    CONSTRAINT "worksite_scopes_engagement_type_check" CHECK ((("engagement_type")::"text" = ANY ((ARRAY['direct_employment'::character varying, 'contractor'::character varying, 'subcontractor'::character varying, 'labour_hire'::character varying])::"text"[])))
);
-- 20246  UNIQUE ("worksite_id", "scope_id", "employer_id");  25420 scope_id → work_scopes ON DELETE CASCADE
-- 22709  trg_worksite_scope_propagate AFTER INSERT OR UPDATE → propagate_employer_scope() (4587-4598: upserts employer_scopes 'auto')

-- 11696
CREATE TABLE IF NOT EXISTS "public"."employer_scopes" (
    "id" integer NOT NULL, "employer_id" integer NOT NULL, "scope_id" integer NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "source" character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    CONSTRAINT "employer_scopes_source_check" CHECK ((("source")::"text" = ANY ((ARRAY['manual'::character varying, 'auto'::character varying])::"text"[])))
);
-- 19336  UNIQUE ("employer_id", "scope_id");  24105 scope_id → work_scopes ON DELETE CASCADE

-- 7370
CREATE TABLE IF NOT EXISTS "public"."sectors" (
    "sector_id" integer NOT NULL,
    "sector_name" character varying(50) NOT NULL,
    "description" character varying(200)
);
-- 19761 sectors_pkey; 19766 UNIQUE ("sector_name")

-- 7300 agreements (excerpt)
    "sector_id" integer,
    "source_sheet" character varying(50),
    "agreement_scope" character varying(30),
    CONSTRAINT "agreements_agreement_scope_check" CHECK ((("agreement_scope")::"text" = ANY ((ARRAY['site_specific'::character varying, 'project_specific'::character varying, 'sector_wide'::character varying, 'company_wide'::character varying])::"text"[]))),
-- 22881 agreements_sector_id_fkey → sectors

-- 1490 upcoming_project_employers (excerpt)
    "role_type" character varying(30) DEFAULT 'Operator'::character varying NOT NULL,
    CONSTRAINT "upcoming_project_employers_role_type_check" CHECK ((("role_type")::"text" = ANY ((ARRAY['Owner'::character varying, 'Operator'::character varying, 'Principal_Contractor'::character varying, 'Subcontractor'::character varying, 'Labour_Hire'::character varying, 'Catering'::character varying, 'Maintenance'::character varying, 'Drilling'::character varying, 'ROV'::character varying, 'Inspection'::character varying, 'Transport'::character varying, 'Decommissioning'::character varying, 'Aviation'::character varying, 'Other'::character varying])::"text"[])))
-- 22217 uq_upcoming_project_employer_role (upcoming_project_id, employer_id, role_type) WHERE employer_id IS NOT NULL
```

Also: `worksite_contracts.scope_id` → `work_scopes` (baseline:25396, 0 rows). Production is Postgres **17.6**
(`NULLS NOT DISTINCT` available). `_oux_hygiene_log` exists on production, dev and the 12 September clone.

---

## 2. Files

### 2.1 Readers of the scope tables today (every one, `path:line`)

Grep of `work_scopes|worksite_scopes|employer_scopes|agreement_scopes|sectors|sector_id|source_sheet` under
`apps/organising-db/src` and `apps/scraper` (tests and `generated.ts` excluded). `apps/scraper` reads none of them;
its only scope-adjacent write is `role_type: "Operator"` (`apps/scraper/src/pipeline/match.ts:57`).

**`work_scopes` tree readers** (what the re-parenting can affect):

| Reader | How it reads the tree | Depth / flat assumption | After DA1.3 |
|---|---|---|---|
| `components/overview/work-scopes-tab.tsx:78-81, 129-148, 202-260` | all active rows, builds a recursive tree; a row whose parent is inactive is dropped (141-145) | any depth (recursive) | shows 14 new roots; Specialist's children moved first, so nothing is orphaned |
| `components/work-scopes/work-scope-definition-dialog.tsx:29-55, 92, 110-118, 209-247` | loads all; `labelForScope` walks to the root; admin/user insert and update of `parent_scope_id` | any depth | a map root cannot be given a parent (new CHECK, §2.3); the dialog shows the database error |
| `app/(dashboard)/employers/[id]/page.tsx:285, 323-345, 464-474, 590-597` | `work_scopes!parent_scope_id(…, parent:work_scopes!parent_scope_id(…))` — **two parent levels embedded**; label `grandparent › parent › name` | **fixed depth ≤ 3** | correct while depth ≤ 3 (design keeps 3; §3.2 asserts it); roots appear as selectable options |
| `app/(dashboard)/worksites/[id]/page.tsx:347, 391, 520-540` | same two-level embed; `contractScopeOptions` | **fixed depth ≤ 3** | as above |
| `components/worksites/add-scope-dialog.tsx:52-53, 133-143` | two-level `parent` label; excludes `is_whole_of_project` | **fixed depth ≤ 3** | as above |
| `components/worksites/add-employer-dialog.tsx:54-55, 146-151, 197` | same | **fixed depth ≤ 3** | as above |
| `components/worksites/link-agreement-dialog.tsx:149-158, 199-215, 477-545` | `byParent` map, recursive `ScopeTreeLevel`; highlights scopes in `agreement_scopes` for the chosen agreement | any depth | back-filled roots are highlighted "linked to agreement" (first time ever, `agreement_scopes` was 0) |
| `app/(dashboard)/worksites/page.tsx:104-106, 154-161, 615-621` | **flat** `<Select>` of active non-whole-of-project scopes, bare `scope_name`; filter is **exact `scope_id`** | flat list | grows 20 → 34 options; near-duplicate names (`Catering` / `Catering / FM`, `Maintenance` / `Maintenance / brownfield`, `Marine` / `Marine supply / vessels`); choosing a root lists only rows attached **at** the root (none today) — advisory, not a break (§6 R6) |
| `components/overview/employers-tab.tsx:113-115, 143-148, 845-852` | same flat select and exact filter | flat list | same as above |

**Other readers** (scope names or the junctions; unaffected by re-parenting):
`components/overview/sectors-tab.tsx:36-44, 136-153, 234-253` (scopes per sector via `agreement_scopes` → now
populated), `components/overview/sector-detail-sheet.tsx:50, 332-338`, `components/overview/projects-tab.tsx:150-227`,
`components/overview/employer-groups-tab.tsx:74-93, 181-317, 380, 500`, `components/overview/project-detail-sheet.tsx:60, 337-343`,
`components/overview/employer-group-detail-sheet.tsx:58, 357-363`, `app/(dashboard)/workers/[id]/page.tsx:708, 733`,
`app/(dashboard)/employers/[id]/page.tsx:284, 297, 404-493` (employer_scopes CRUD),
`app/(dashboard)/worksites/[id]/page.tsx:346, 682-690` (worksite_scopes CRUD), `components/worksites/add-scope-dialog.tsx:214`,
`components/worksites/add-employer-dialog.tsx:138, 251`, `components/worksites/link-agreement-dialog.tsx:267` (inserts),
`components/reports/worksite-hierarchy-explorer.tsx:224` (reads the materialised view).
**`sectors` readers** (untouched table): `overview/agreements-tab.tsx:173, 186-191, 328-338`,
`app/(dashboard)/agreements/[id]/page.tsx:259, 273-278, 722-730`, `app/(dashboard)/reports/page.tsx:389-432, 686-689`,
`app/(dashboard)/administration/page.tsx:1743-1822, 2863`, `lib/hooks/usePlannerOptions.ts:111-113, 225-230`,
`components/campaigns/planning/WhereToPlayPanel.tsx:97, 190-192`, `components/campaigns/planner-wizard.tsx:361`,
`lib/mobilisation/pipeline/context.ts:41-101, 369-371`, `app/(dashboard)/projects/alerts/page.tsx:70`,
`app/api/agreements/[id]/route.ts:55, 85`.
**`agreement_scopes` writers:** none in the app (only the two readers above). **Reference wizard:** no scope handling
(`components/import/reference-data-wizard.tsx` has no `scope`/`sector` reference; `app/api/reference-import/apply/route.ts:240-256`
writes `employer_worksite_roles.role_type`, a different vocabulary).

**Database readers** (production catalogue, read-only, 2026-09-24): views touching these tables —
`worksite_hierarchy_report_rows` (baseline:17552-17600; `scope_rows` joins `work_scopes` for `scope_name` only),
`worksite_hierarchy_report_rows_mv` (baseline:17612; selects from that view; populated), `agreements_view` (7428),
`employers_view` (11838/11865, via `employer_sectors`), `organising_universe_view` (12572/12610) — the last three join
`sectors`, **none joins `work_scopes`** except the hierarchy view. Functions: `merge_employers` (3981; updates
`worksite_scopes`/`employer_scopes` employer ids at 4177-4183, dedupes at 4290-4302), `propagate_employer_scope` (4587).
Triggers: `trg_work_scopes_updated_at`, `trg_worksite_scope_propagate`.

### 2.2 New and changed files

| File | Purpose |
|---|---|
| `supabase/migrations/20260925090000_da1_3_scope_taxonomy.sql` | the one migration (§2.3) |
| `scripts/data-hygiene/da1.3/crosswalk-lib.ts` | pure data + builder: the 14 roots (code, name, sort), the legacy re-parent map, the crosswalk rows, the agreement overrides; `buildCrosswalkRows()`, `renderCrosswalkValuesSql()`, `checkCoverage()` |
| `apps/organising-db/src/lib/scopes/__tests__/scope-crosswalk.test.ts` | unit tests (§4.4), importing the lib by relative path as `lib/import/__tests__/replay-fixture.test.ts:27` does for DA0.3 |
| `scripts/data-hygiene/da1.3/00_preflight.sql` | read-only counts and checksums (§3.1) |
| `scripts/data-hygiene/da1.3/10_backfill_agreement_scopes.sql` | the run sheet (§3.2) — named per the brief; the §5 row's `10_scopes.sql` is this file (deviation noted in §8) |
| `scripts/data-hygiene/da1.3/90_rollback_backfill_agreement_scopes.sql` | data rollback of `10` (§3.3) |
| `scripts/data-hygiene/da1.3/91_rollback_da1_3_scope_taxonomy.sql` | schema rollback of the migration, run only after `90` (§3.4) |
| `scripts/data-hygiene/da1.3/README.md` | run order |
| `scripts/data-hygiene/da1.3/prod/P1_preflight_before.sql`, `P2_migration.sql`, `P3_backfill.sql`, `P4_preflight_after.sql`, `PX1_rollback_backfill.sql`, `README.md` | production run sheet, DA0.3 `prod/` pattern (`scripts/data-hygiene/da0.3/prod/P2_migration.sql:1-12`) |
| `packages/db-types/generated.ts` | regenerated from dev or the fresh clone with an explicit ref: `work_scopes` gains `code: string \| null`; new `scope_crosswalk` table |
| `apps/organising-db/src/types/organising-row-types.ts:963-973` | `WorkScope` gains `code: string \| null` (hand type) |

No app component changes (see §2.4 and §6 R6).

### 2.3 Migration design — `20260925090000_da1_3_scope_taxonomy.sql`

**Choice: new top-level rows with a stable `code`, existing nodes re-parented — not a new level above the roots.**
Reasons from the tree (§1.5.1): the current roots `Brownfields` and `Specialist` are groupings that cut across the
map's scopes (`Service` under Brownfields holds Catering, Security, Emergency Response, Logistics and Inspectors, which
belong to four different map scopes), so no current root can simply be placed under one map scope; and putting a
level above today's roots would make depth 4 and silently drop the root from the five fixed-depth labels in §2.1.
Re-parenting keeps **maximum depth 3**.

Sections, all idempotent (IF NOT EXISTS / ON CONFLICT / guarded UPDATE), header in the DA0.3 style
(`20260922120000_da0_3_name_match_reviews.sql:1-18`):

**(a) `work_scopes.code`.**
```sql
ALTER TABLE public.work_scopes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.work_scopes ADD CONSTRAINT work_scopes_code_key UNIQUE (code);              -- guarded by pg_constraint lookup
ALTER TABLE public.work_scopes ADD CONSTRAINT work_scopes_code_format_check CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_]{1,39}$');
ALTER TABLE public.work_scopes ADD CONSTRAINT work_scopes_code_is_root_check CHECK (code IS NULL OR parent_scope_id IS NULL);
COMMENT ON COLUMN public.work_scopes.code IS 'Stable key of an OA Universe map scope (DA1.3, D7). Set on the 14 map roots only; scripts resolve roots by code, never by id.';
```

**(b) Tree guard.** A `DO` block that raises unless rows 1–22 exist with the §1.5.1 names and parents (the md5
`88ebc3d643b51568122e90dfd9c85476` over the 22 baseline rows) **or** the tree is already in the post-migration state
(re-run). A clone or dev whose tree differs stops here rather than being mis-parented.

**(c) The 14 roots** — `INSERT … ON CONFLICT (code) DO NOTHING`, `parent_scope_id NULL`, `is_active true`,
`is_whole_of_project false`, `sort_order` = CSV column order:

| sort | code | scope_name (CSV header verbatim) |
|---:|---|---|
| 1 | `catering_fm` | Catering / FM |
| 2 | `maintenance_brownfield` | Maintenance / brownfield |
| 3 | `huc_commissioning` | HUC / commissioning |
| 4 | `inspection_integrity` | Inspection / integrity |
| 5 | `cranes_lifting` | Cranes / lifting |
| 6 | `helicopters` | Helicopters |
| 7 | `marine_supply_vessels` | Marine supply / vessels |
| 8 | `crewing_labour_hire` | Crewing / labour hire |
| 9 | `rov_subsea` | ROV / subsea / IMR / diving |
| 10 | `drilling` | Drilling |
| 11 | `construction_epc_pipelay` | Construction / EPC / pipelay |
| 12 | `decommissioning` | Decommissioning |
| 13 | `survey_positioning` | Survey / positioning |
| 14 | `other` | Other (chemist / emergency / medical) |
| (15) | `production_operations` | Production / operations — **only if the operator answers Q1 (a)** |

**(d) Re-parent** (by id, looked up against codes; the draft mapping of §2.5, table A, pending the operator's §5
confirmations). `UPDATE … WHERE scope_id = X AND parent_scope_id IS NOT DISTINCT FROM <baseline parent>` so a re-run
is a no-op and a drifted row is not touched (the guard in (b) has already refused drift). `Specialist` (16) is set
`is_active = false` after its three children move (Q5); it keeps `parent_scope_id NULL` and no `code`.
`trg_work_scopes_updated_at` stamps `updated_at` on the moved rows — checksums exclude `updated_at` (§3.1).

**(e) `scope_crosswalk`.**
```sql
CREATE TABLE IF NOT EXISTS public.scope_crosswalk (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_kind   text NOT NULL CONSTRAINT scope_crosswalk_from_kind_check
              CHECK (from_kind IN ('sector', 'source_sheet', 'role_type', 'legacy_scope')),
  from_value  text NOT NULL CHECK (char_length(btrim(from_value)) BETWEEN 1 AND 100),
  scope_id    integer REFERENCES public.work_scopes(scope_id) ON DELETE RESTRICT,
  confidence  text NOT NULL CHECK (confidence IN ('H', 'M', 'L')),
  source      text NOT NULL CHECK (source IN ('operator', 'plan', 'oa_universe')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_crosswalk_null_scope_needs_reason CHECK (scope_id IS NOT NULL OR notes IS NOT NULL),
  CONSTRAINT scope_crosswalk_unique UNIQUE NULLS NOT DISTINCT (from_kind, from_value, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_scope_crosswalk_lookup ON public.scope_crosswalk (from_kind, from_value);
CREATE INDEX IF NOT EXISTS idx_scope_crosswalk_scope  ON public.scope_crosswalk (scope_id);
```
- `from_kind` adds **`source_sheet`** to the brief's `sector | role_type | legacy_scope`: source-sheet labels differ from
  sector names (`Aircraft Maint.`, `Marine-Deck Officers`, `Marine-Engineers`, `Expired`) and agreement 42 has a sheet
  but no sector, so the fallback needs its own rows (Q14). `legacy_scope.from_value` is the `scope_id` as text (two
  rows are both named "Whole of Project"), with the name in `notes`.
- `scope_id NULL` is a deliberate "no work scope" mapping (engagement roles such as `Operator`; the `Expired` tab) and
  requires a reason. Several rows per `from_value` are allowed (a stream may map to several scopes).
- `confidence` H/M/L follows §3.3's engagement vocabulary; see R9 on aligning with DA2.1. `source = 'operator'` for rows
  the operator confirmed in §5, `'plan'` for rows left at the planner's draft.
- Rows are inserted by the migration with `INSERT … SELECT … FROM (VALUES …) v JOIN work_scopes ws ON ws.code = v.code
  ON CONFLICT DO NOTHING` — ids never hard-coded. The VALUES block is generated by `renderCrosswalkValuesSql()` and a
  test asserts the migration's block equals the generator output (§4.4).
- RLS and grants, DA0.3 convention (`20260922120000_da0_3_name_match_reviews.sql:136-162`): `ENABLE ROW LEVEL SECURITY`;
  one policy `scope_crosswalk_select_authed FOR SELECT TO authenticated USING (true)`;
  `REVOKE ALL ON TABLE public.scope_crosswalk FROM PUBLIC, anon, authenticated; GRANT SELECT … TO authenticated;
  GRANT ALL … TO service_role`; identity sequence: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT USAGE, SELECT …
  TO service_role`. Writes are run-sheet only (postgres) until a UI needs them.
- `COMMENT ON TABLE` naming D7 and this plan.

**(f) Post-assertions inside the migration** (raise on failure): 14 (or 15) coded roots; every active scope has a
coded root ancestor; maximum depth 3; `code` roots have no parent; every `sectors.sector_name` has ≥ 1 `sector` row;
every non-null `agreements.source_sheet` has ≥ 1 `source_sheet` row; all 14 CHECK `role_type` values have ≥ 1 row;
all 22 legacy ids have a `legacy_scope` row; every non-null crosswalk `scope_id` is a coded root.

The migration writes **no** `agreement_scopes`, `worksite_scopes` or `employer_scopes` row and touches nothing in
`sectors`. `worksite_scopes` rows keep their `scope_id`; they reach a map root by ancestry, which is what the §5
acceptance ("maps to a new scope") needs, with no data rewrite.

### 2.4 Compatibility

- **Fixed-depth readers** (5, §2.1): safe because depth stays 3; the migration asserts it and the header comment warns
  that a fourth level would drop the root from `employers/[id]/page.tsx:338-341` et al. without an error.
- **Flat selects** (`worksites/page.tsx:615-621`, `employers-tab.tsx:845-852`): do show the 14 roots, by bare name,
  and filter by exact id. No break; recorded as an incidental finding for the reports/UI work (R6), not fixed here.
- **Pickers** (add-scope, add-employer, employer and worksite pages, link-agreement): roots become selectable — wanted,
  since the map's incumbency (DA3.1) is recorded at root level.
- **Reference wizard:** no scope handling; unaffected.
- **Views:** `worksite_hierarchy_report_rows` / `_mv` read `scope_name` only; names are unchanged, so the view output
  and the materialised view are unchanged (no refresh needed; the pack checksums prove it). `organising_universe_view`,
  `agreements_view`, `employers_view` join `sectors` only — untouched.
- **`merge_employers` / `propagate_employer_scope`:** do not read the tree; unaffected.
- **PostgREST:** no embed, hint or `.or()` string is added or changed. `scope_crosswalk → work_scopes` is a new FK
  from a new table and adds no second path between existing pairs, so the existing `work_scopes!parent_scope_id` and
  `agreement_scopes → work_scopes` embeds stay unambiguous; a smoke probe of the six existing embed strings on dev after
  the migration is still recorded (§4).
- **Generated types:** `work_scopes.Row/Insert/Update` gain `code`; new `scope_crosswalk`. Additive; `WorkScope` hand
  type gains `code`. No call site changes.

### 2.5 The crosswalk — draft for the operator's confirmation

Confidence is the planner's; **bold `Q`** = ambiguous, confirmation required (§5).

**A. Map scope → existing nodes beneath it (re-parent, `legacy_scope` rows)**

| Map root | Existing nodes placed beneath (id: new parent) | Conf. | Q |
|---|---|---|---|
| Catering / FM | 11 Catering, 14 Facility Management, 12 Security; 8 Service (with its 9 Whole of Project) | M (12, 8: L) | **Q2, Q4** |
| Maintenance / brownfield | 2 Maintenance (with 3 Whole of Project, 4 Operations, 5 Electrical, 6 Mechanical, 7 PFP); 1 Brownfields (children moved out, becomes a leaf) | H (4: **Q1**) | Q1 |
| HUC / commissioning | — (none) | | |
| Inspection / integrity | 15 Inspectors / NDT | H | |
| Cranes / lifting | — | | |
| Helicopters | 18 Helicopter Transport | H | |
| Marine supply / vessels | 19 Marine (with 20 Generic, 21 Accommodation Vessels, 22 Supply Vessels); 10 Logistics | H (10: L) | **Q3, Q17** |
| Crewing / labour hire | — | | |
| ROV / subsea / IMR / diving | 17 ROV | H | |
| Drilling | — | | |
| Construction / EPC / pipelay | — | | |
| Decommissioning | — | | |
| Survey / positioning | — | | |
| Other (chemist / emergency / medical) | 13 Emergency Response | M | Q16 |
| (retired) | 16 Specialist: `is_active = false`, stays a root without code, no rows reference it | | **Q5** |

Resulting depth: `root › Maintenance › Electrical`, `root › Marine › Supply Vessels`, `root › Service › Whole of Project` = 3.

**B. `sectors` → map scope (`sector` rows; 16 rows, every sector)**

| sector | → map scope(s) | Conf. | Q |
|---|---|---|---|
| Production (19 agreements) | **no map column fits** (operator/facility-operator workforce: Chevron, Woodside, Inpex, Shell, Santos, Jadestone, MODEC, BW, Teekay, UPS) → (a) new 15th root `production_operations` [recommended] or (b) Maintenance / brownfield via leaf 4 Operations | — | **Q1 (blocking)** |
| Maintenance (33) | Maintenance / brownfield | H | |
| Catering (15) | Catering / FM | H | |
| Marine - Deck Officers (11) | Marine supply / vessels | H | Q7 |
| Marine - Engineers (8) | Marine supply / vessels | H | Q7 |
| Drilling (11) | Drilling | H | |
| ROV (7) | ROV / subsea / IMR / diving | H | |
| Decommissioning (6) | Decommissioning | H | |
| Offshore Construction (11) | Construction / EPC / pipelay | M | **Q8** (also HUC?) |
| Aircraft Maintenance (2) | Helicopters | H | |
| Inspection (4) | Inspection / integrity | H | |
| Dredging (2) | Construction / EPC / pipelay **and** Marine supply / vessels | L | **Q6** |
| Hydrographics (1) | Survey / positioning | H | |
| Chemists (1) | Other (chemist / emergency / medical) | H | |
| Supply (0) | Production / operations if Q1(a), else Other | L | **Q1** |
| Helicopter Engineers (3) | Helicopters | H | |

**C. `source_sheet` → map scope (`source_sheet` rows; fallback only, used when `sector_id` is null)**
`Production`, `Maintenance`, `Catering`, `Drilling`, `ROV`, `Decommissioning`, `Offshore Construction`,
`Inspection`, `Dredging`, `Hydrographics`, `Chemists` → as their sector in B; `Aircraft Maint.` → Helicopters;
`Marine-Deck Officers`, `Marine-Engineers` → Marine supply / vessels; `Expired` → `scope_id NULL`, note "status tab,
not a stream; resolve through `sector_id`". (15 rows + Dredging's second.)

**D. `role_type` → map scope (`role_type` rows; all 14 CHECK values)**

| role_type | → | Conf. | Q |
|---|---|---|---|
| Owner, Operator, Principal_Contractor, Subcontractor | `NULL` — engagement role, not a work scope (goes to `engagements.role`, DA2.2) | H | Q12 |
| Labour_Hire | Crewing / labour hire | H | |
| Catering | Catering / FM | H | |
| Maintenance | Maintenance / brownfield | H | |
| Drilling | Drilling | H | |
| ROV | ROV / subsea / IMR / diving | H | |
| Inspection | Inspection / integrity | H | |
| Transport | Marine supply / vessels | L | **Q10** |
| Decommissioning | Decommissioning | H | |
| Aviation | Helicopters | H | |
| Other | Other (chemist / emergency / medical) | L | **Q11** |

**E. Per-agreement additions (in `10`, not the crosswalk; each confirmed individually, Q9)** — from the agreement
names (production read, 2026-09-24):

| agreement_id | name signal | sector-derived | proposed addition | Required? |
|---:|---|---|---|---|
| 1096 | VERTECH … INSPECTION SERVICES EA 2025 (no sector, no sheet) | none | Inspection / integrity | **yes** — else acceptance fails |
| 20 | KUIPER … OFFSHORE HOOK UP AND COMMISSIONING GREENFIELDS | Maintenance / brownfield | + HUC / commissioning | optional |
| 28 | PROGRAMMED OFFSHORE … MAINTENANCE HUC GREENFIELDS | Maintenance / brownfield | + HUC / commissioning | optional |
| 65, 103 | … OFFSHORE CONSTRUCTION PROJECTS CATERING AGREEMENT | Construction / EPC / pipelay | + Catering / FM | optional |
| 111 | AOS … OFFSHORE CATERING GREENFIELDS (sector Offshore Construction) | Construction / EPC / pipelay | + Catering / FM | optional |
| 101, 102 | MCDERMOTT AUSTRALIA (CREWING SERVICES) … CAMPAIGN / PROJECT AGREEMENT | Construction / EPC / pipelay | + Crewing / labour hire | optional |
| 95, 98 | APPLUS+ … OFFSHORE MAINTENANCE / MAINTENANCE AGREEMENT (sector Inspection) | Inspection / integrity | + Maintenance / brownfield | optional |
| 17 | DBNGP NATIONAL CONTROL CENTRE (sector Maintenance) | Maintenance / brownfield | + Production / operations if Q1(a) | optional |

### 2.6 Resolution rule for the back-fill and what it yields (measured)

For each agreement: (1) `sector_id` → `sector` rows; else (2) `source_sheet` (not `Expired`) → `source_sheet` rows;
plus (3) the confirmed §2.5 E additions. `sector_id` goes first because it is the normalised key the UI edits
(`agreements/[id]/page.tsx:722-730`); on every agreement that has both, sheet and sector agree (§1.5.3), so the order
changes no outcome. Production query (`count(*) FILTER (WHERE sector_id IS NOT NULL)` …): **134** resolve by sector,
**1** (42, sheet `Marine-Engineers`) by source sheet — **135 of 136**; **1096** has neither and gets a scope only
through E. With Q1 answered and 1096 confirmed: 136 / 136.

---

## 3. Scripts

All in the oux-wp3.8 / DA0.x style: one file per SQL Editor submission; `BEGIN;` then the environment guard verbatim
from `scripts/data-hygiene/da0.5/10_record_ledger_row.sql` (the `_oux_env_marker` clone/dev singleton, or
`oux.env = 'production'` which the operator inserts after `BEGIN;`; committed files omit that line and name no
project); run as `postgres` without RLS; read-only verification `SELECT` after the final `COMMIT;`; never through the
connector's `apply_migration` on production.

### 3.1 `00_preflight.sql` (read-only)

Returns one row: `work_scopes` count, md5 over `(scope_id, scope_name, parent_scope_id, is_active, code)` (no
`updated_at`), coded-root count, max depth; `sectors` md5 (`7f04bab1…`); `agreements` md5 over
`(agreement_id, sector_id, source_sheet)` (`41f2e19f…`); `agreement_scopes` count and md5 over `(agreement_id, scope_id)`;
`worksite_scopes` md5 (`ce270ff0…`), `employer_scopes` md5 (`ef9e696b…`); `scope_crosswalk` present / count / md5 over
`(from_kind, from_value, code of scope, confidence, source)`; agreements with 0 scopes; `worksite_hierarchy_report_rows`
md5; count of `_oux_hygiene_log` rows for script `da1.3_10_backfill_agreement_scopes` not rolled back.

### 3.2 `10_backfill_agreement_scopes.sql` (mutating)

1. Guard.
2. **Preconditions** (raise and stop): `scope_crosswalk` exists and every coded root is present; `agreements` md5
   equals the value pasted from `00` before (the file carries it as a constant after the preflight); `agreement_scopes`
   holds no row pointing at a coded root and no live log row from this script (not already run); every `sector_id`
   in use and every non-`Expired` `source_sheet` in use has a crosswalk row; every agreement is resolvable by rule (1),
   (2) or an E override — i.e. predicted inserts computed in a temp table give ≥ 1 row per agreement.
3. **Change:** `INSERT INTO agreement_scopes (agreement_id, scope_id) SELECT DISTINCT … FROM _da13_plan ON CONFLICT
   (agreement_id, scope_id) DO NOTHING RETURNING id, agreement_id, scope_id`, where `_da13_plan` holds
   `(agreement_id, scope_id, path)` with `path` ∈ `sector:<name>` / `source_sheet:<value>` / `override:<reason>`. E
   overrides are a `VALUES (agreement_id, code, reason)` list in the file, resolved by code.
4. **Hygiene log:** one `public._oux_hygiene_log` row per inserted row: `script = 'da1.3_10_backfill_agreement_scopes'`,
   `action = 'insert'`, `table_name = 'agreement_scopes'`, `row_pk = {"id": …}`, `before_row NULL`,
   `after_row = {"id","agreement_id","scope_id","scope_code"}`, `note = 'DA1.3 (da1.3.md §3.2): ' || path`.
5. **Post-assertions:** inserted rows = predicted rows = log rows; every agreement has ≥ 1 `agreement_scopes` row;
   every back-filled `scope_id` is a coded root; `agreements`, `sectors`, `worksite_scopes`, `employer_scopes`,
   `work_scopes` md5s unchanged from the precondition values.
6. `COMMIT;` then the appended read-only `SELECT`: rows per scope code, agreements with 0 scopes (expect 0), log rows
   written, `agreement_scopes` md5.

Expected on production (with Q1 and the required E row confirmed, optional E rows excluded): 136 agreements covered;
rows = 134 sector-path + Dredging's 2 extra (2 agreements × 1 second scope) + 1 source-sheet + 1 override = **138**
(exact figure re-computed and pasted by `00`/`10` in the rehearsal; each confirmed optional E row adds one).

### 3.3 `90_rollback_backfill_agreement_scopes.sql`

Precondition = exactly the state `10` leaves: every live log row of `da1.3_10_backfill_agreement_scopes` matches an
existing `agreement_scopes` row with the same `id, agreement_id, scope_id`; no other `agreement_scopes` row references
a coded root (nothing added after `10`). Change: delete those ids; stamp `rolled_back_at`. Post: `agreement_scopes`
md5 equals the `00` before value (production: 0 rows). Appended `SELECT`.

### 3.4 `91_rollback_da1_3_scope_taxonomy.sql` (schema; rehearsal on the clone, recovery only elsewhere)

Precondition: `90` has run (no `agreement_scopes`, `worksite_scopes`, `employer_scopes` or `worksite_contracts` row
references a coded root); tree in the migration's post-state. Change: restore the baseline parents of §1.5.1
(1 → NULL, 2 → 1, 8 → 1, 10–15 → 8, 17–19 → 16) and `is_active = true` on 16; `DROP TABLE scope_crosswalk`; delete the
coded roots; drop the three constraints and `code`; `setval` the sequence back to the preflight value. Post: tree md5 =
`88ebc3d6…`. The ledger row is removed as its own statement afterwards (DA0.3 §11 items 9–11 pattern).

### 3.5 Production run sheet (`prod/`, DA0.3 pattern)

P1 `00` before → P2 migration verbatim in one `BEGIN … COMMIT` with `SET LOCAL oux.env = 'production'` and the ledger
row insert (version `20260925090000`, name `da1_3_scope_taxonomy`) → P3 `10` → P4 `00` after. PX1 = `90`. One file at a
time; each states expectation and what to paste back.

---

## 4. Acceptance evidence (stated before implementation)

| # | Criterion | Evidence |
|---|---|---|
| A1 | every agreement has ≥ 1 scope | `SELECT count(*) FROM agreements a WHERE NOT EXISTS (SELECT 1 FROM agreement_scopes s WHERE s.agreement_id = a.agreement_id);` → **0** (production and clone) |
| A2 | every `worksite_scopes` row maps to a scope under a map top-level | `WITH RECURSIVE up AS (SELECT scope_id AS leaf, scope_id, parent_scope_id, code FROM work_scopes UNION ALL SELECT up.leaf, p.scope_id, p.parent_scope_id, p.code FROM up JOIN work_scopes p ON p.scope_id = up.parent_scope_id) SELECT count(*) FROM worksite_scopes ws WHERE NOT EXISTS (SELECT 1 FROM up WHERE up.leaf = ws.scope_id AND up.code IS NOT NULL);` → **0** (13 rows on production); same for `employer_scopes` → 0 |
| A3 | crosswalk covers every sector, every source sheet in use, every `role_type` | `SELECT 'sector', s.sector_name FROM sectors s WHERE NOT EXISTS (SELECT 1 FROM scope_crosswalk c WHERE c.from_kind='sector' AND c.from_value=s.sector_name) UNION ALL SELECT 'role_type', r FROM unnest(ARRAY['Owner','Operator','Principal_Contractor','Subcontractor','Labour_Hire','Catering','Maintenance','Drilling','ROV','Inspection','Transport','Decommissioning','Aviation','Other']) r WHERE NOT EXISTS (SELECT 1 FROM scope_crosswalk c WHERE c.from_kind='role_type' AND c.from_value=r) UNION ALL SELECT DISTINCT 'role_type_in_data', role_type FROM upcoming_project_employers u WHERE NOT EXISTS (SELECT 1 FROM scope_crosswalk c WHERE c.from_kind='role_type' AND c.from_value=u.role_type) UNION ALL SELECT DISTINCT 'source_sheet', source_sheet FROM agreements a WHERE source_sheet IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scope_crosswalk c WHERE c.from_kind='source_sheet' AND c.from_value=a.source_sheet);` → **0 rows** |
| A4 | tree shape | coded roots = 14 (15 if Q1 a); max depth 3; every active scope has a coded ancestor; `sectors` md5 unchanged `7f04bab1…` |
| A5 | nothing else moved | `worksite_scopes` md5 `ce270ff0…`, `employer_scopes` md5 `ef9e696b…`, `agreements` md5 `41f2e19f…`, `worksite_hierarchy_report_rows` md5 identical before/after |
| A6 | rehearsal | on the fresh clone: `00` → migration + ledger → `00` → `10` → `00` → `90` → `00` (= after-migration) → `91` + ledger removal → `00` (= before) → migration → `10` → `00` (= first after-`10`), md5s pasted at each stage |
| A7 | unit tests | `scope-crosswalk.test.ts` green (§4.4) |
| A8 | commands | from `apps/organising-db`: `pnpm lint` (ledger baseline; touched files clean), `pnpm test`, `pnpm build`; root `pnpm validate:migrations` |
| A9 | PostgREST smoke | after the migration on dev, the six existing embed strings (`employers/[id]/page.tsx:285, 324`, `worksites/[id]/page.tsx:347, 391, 521`, `sectors-tab.tsx:141-146`) return 200 with the anon key |
| A10 | pack | `scripts/data-hygiene/oa-universe/00`–`07` before and after on production; delta limited to `agreement_scopes` and `work_scopes` counts |

### 4.4 Unit tests (`apps/organising-db/src/lib/scopes/__tests__/scope-crosswalk.test.ts`)

1. The 14 root names equal `Offshore_facility_x_scope.csv` header columns 5–18 (read from the file), in order; codes
   unique and match `^[a-z][a-z0-9_]{1,39}$`.
2. Every one of the 16 sector names, the 15 source-sheet values of §1.5.3 and the 14 `role_type` CHECK values (parsed
   from the baseline file's constraint text) has ≥ 1 row; every legacy id 1–22 has a row.
3. Every non-null target is a root code; a null target has a note.
4. The re-parent map yields max depth 3 and no cycle when applied to the §1.5.1 fixture; no active node is left under
   an inactive parent.
5. Resolution on a fixture of `(agreement_id, sector, source_sheet)` triples reproducing §1.5.2/§1.5.3 counts: 135
   resolved without overrides, 1096 only via E.
6. `renderCrosswalkValuesSql()` output equals the VALUES block between the markers in the migration file (drift guard).

### 4.5 Run order and PR gate

dev (`dpnnmkhabysfdogllsyh`, operator's approval per file: migration, then `10` inside `BEGIN … ROLLBACK` only, since
dev still carries synthetic rows) → **the fresh clone** (D17; not yet created — the rehearsal waits for it) forward →
back → forward (A6) → production P1–P4 by the operator → PR merged → types regenerated from production (no diff
expected from the dev/clone regeneration). PR readiness: the orchestration checklist (lint/test/build green, rehearsal
recorded, reviewer findings resolved, ledger updated, no unrelated files, types regenerated from the clone, no
personal data).

---

## 5. Operator inputs (one table; each tied to a step)

| # | Question | Draft answer | Blocks |
|---|---|---|---|
| Q1 | Production stream (19 agreements), sector `Supply`, leaf 4 `Operations` (2 rows at Goodwyn, Rankin North): the map has no production column. (a) add a 15th root `production_operations` — amends D7; (b) Maintenance / brownfield | **(a)** | migration (c), (d); `10` |
| Q2 | 8 `Service` (1 worksite row, 1 employer row, Monadelphous at Crux): under Catering / FM, or Maintenance / brownfield? | Catering / FM (L) | migration (d) |
| Q3 | 10 `Logistics` (Toll Energy at Gorgon LNG): Marine supply / vessels or Other? | Marine supply / vessels (L) | migration (d) |
| Q4 | 12 `Security`: Catering / FM? | yes (M) | migration (d) |
| Q5 | 16 `Specialist` (no rows): deactivate once empty? | yes | migration (d) |
| Q6 | `Dredging`: Construction + Marine, one or both? | both (L) | crosswalk |
| Q7 | Marine deck officers / engineers: Marine supply / vessels only, or also Crewing / labour hire? | Marine only (H) | crosswalk |
| Q8 | `Offshore Construction`: also HUC / commissioning? | no; HUC per agreement via E (M) | crosswalk |
| Q9 | §2.5 E: 1096 → Inspection / integrity (**required**); each optional row yes/no | 1096 yes; optional rows yes | `10` |
| Q10 | `role_type` Transport → Marine supply / vessels (vs Helicopters)? | Marine (L) | crosswalk |
| Q11 | `role_type` Other → Other (chemist / emergency / medical)? | yes (L) | crosswalk |
| Q12 | Owner / Operator / Principal_Contractor / Subcontractor → no scope (role only)? | yes | crosswalk |
| Q13 | Confidence vocabulary H/M/L (vs `agreement_worksites.mapping_confidence` High/Medium/Low) — align with DA2.1 | H/M/L | migration (e) |
| Q14 | Add `source_sheet` to `from_kind` (the brief listed three kinds) | yes | migration (e) |
| Q15 | Root names verbatim from the CSV header (incl. "Other (chemist / emergency / medical)") | yes | migration (c) |
| Q16 | 13 `Emergency Response` → Other | yes (M) | migration (d) |
| Q17 | 21 `Accommodation Vessels` stays under Marine (with 19) | yes (M) | migration (d) |

---

## 6. Risks

| # | Risk | Safeguard |
|---|---|---|
| R1 | Root ids differ per environment (sequence position) | everything resolves roots by `code`; no id is hard-coded except the 22 baseline ids, which the guard verifies |
| R2 | A clone or dev with a different tree is mis-parented | migration (b) guard on the 22-row md5 `88ebc3d6…`; guarded `UPDATE … WHERE parent IS NOT DISTINCT FROM <baseline>` |
| R3 | `updated_at` changes on re-parent make rollback look non-identical | checksums exclude `updated_at`; stated in A6 |
| R4 | An admin re-parents or recodes a map root in the definition dialog | `work_scopes_code_is_root_check`; crosswalk FK `ON DELETE RESTRICT` blocks deleting a referenced root |
| R5 | A later fourth level silently drops the root from five labels | migration asserts depth ≤ 3; header comment cites the five readers |
| R6 | Flat scope filters (worksites list, employers tab) list 34 bare names and do not include descendants | incidental finding for the reports/UI packages (DA5.x); not widened here |
| R7 | DA1.1 writes `agreement_scopes` for moved agreements and needs the codes | DA1.3's migration lands before DA1.1's coverage step; DA1.1 resolves by code |
| R8 | **Incidental (for DA1.1):** `merge_employers` dedupes `worksite_scopes` by `(employer_id, worksite_id)` ignoring `scope_id` (baseline:4290-4302), so a survivor keeps one scope per worksite (e.g. Monadelphous 26 at Crux: Maintenance, Mechanical, Service → one); the plain `UPDATE employer_scopes` (4181-4183) can hit `employer_scopes_employer_id_scope_id_key` | recorded in the ledger's incidental findings for DA1.1; not changed here |
| R9 | Confidence/source vocabularies diverge from DA2.1's | Q13; DA2.1 planner told; the crosswalk CHECKs are widened by DA2.1's migration if needed |
| R10 | New agreements created in the UI after `10` have no scope (no app writer of `agreement_scopes`) | acceptance query A1 re-run at each pack run; incidental finding: agreement create/edit should derive scopes from the sector via the crosswalk |
| R11 | Production mutation outside the run sheet | P-files only, operator-run; never `apply_migration`, never the CLI |

---

## 7. Approval

_Orchestrator's written approval, dated, or the reasons the plan was sent back._

## 8. Deviations from plan

_Kept by the implementer._ Pre-declared by the planner: (1) the run sheet is `10_backfill_agreement_scopes.sql`
(brief) rather than the §5 row's `10_scopes.sql`; (2) `from_kind` includes `source_sheet` (Q14); (3) a 15th root if
Q1 (a).

## 9. Verification record

_Pasted by the verifier._

## 10. Review

_Fable reviewer (migration), ranked findings with `path:line`; two fix rounds maximum._

## 11. Run sheet record

_Each step, pasted output, date, who ran it._

---

### Work split

| Role | Model | Work |
|---|---|---|
| Planner | Opus | this file |
| Implementer | Opus | migration, `crosswalk-lib.ts` and its tests, `00`/`10`/`90`/`91`, `prod/` P-files, generated types, `WorkScope` hand type |
| Reviewer | Fable | the migration and the run sheets (never downgraded) |
| Verifier | Sonnet | commands, dev application, fresh-clone rehearsal forward → back → forward, pack before/after, A1–A10 |
| Summariser | Haiku | pack delta table |

## 12. Operator decisions received (session, 2026-09-24)

| # | Decision |
|---|---|
| Q1 | (a) accepted: a fifteenth top-level scope `production_operations` ("Production operations"); D7 amended |
| Q2 | **Changed:** `Service` (8) goes under Maintenance / brownfield |
| Q3 | **Changed:** `Logistics` (10) goes under Other (chemist / emergency / medical) |
| Q4, Q5, Q6, Q7, Q8, Q9, Q11 | as drafted |
| Q10 | **Widened:** `role_type` Transport maps to BOTH Marine supply / vessels and Helicopters (transport in the NOPSEMA sense includes helicopters), confidence L |
| Q12 | Yes, roles are not scopes and get no crosswalk row; the role itself stays in `upcoming_project_employers.role_type` (nothing is lost) — record in the plan's §3 that the role column is kept as-is |
| Q13 | Confidence: one vocabulary everywhere, reconciled by the orchestrator with DA2.1: the STORED values are `High | Medium | Low` (the existing `mapping_confidence` vocabulary, plan §3.7); H/M/L are the same three values as shorthand in documents and the map. `scope_crosswalk.confidence` uses the same CHECK as DA2.1's columns |
| Q14, Q15, Q16, Q17 | as drafted |

## 13. Approval

**Approved by the orchestrator, 2026-09-24** with the decisions above. Implementation (Opus) starts after DA2.1's migration is on the working tree, so the two do not edit `packages/db-types/generated.ts` at once; Fable review; rehearsal on the fresh clone `plbldfctqhnbyrsypuri` (`OA_clone_2`) by the verifier; production by the operator's run sheet.
