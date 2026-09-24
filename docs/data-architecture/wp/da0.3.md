# DA0.3 — Stop the bleed (alias check, one resolution path, review queue, raw names)

Planner: Fable (2026-09-22). Status: **approved (§7) → implemented by Fable (commits 1–2 of §2.7, 2026-09-22/23) → implemented by Opus (commit 3, 2026-09-23) → awaiting review and the clone rehearsal**. Branch: `claude/determined-hypatia-y2cqau`
(ledger standing note). Implementers: Fable (database, resolution path, wizards, weekly update, fixture, tests) and Opus
(review-queue page, nav entry, UI tests) — file boundary in §2.7. Reviewer: Fable.

Every number in this file comes from a pasted query or command result (§1.4). Organisation and worksite names only; no
person appears anywhere in this file or in any fixture it specifies.

---

## 1. Specification

### 1.1 Plan §5 row (verbatim, `OA_UNIVERSE_ALIGNMENT_PLAN.md:381`)

> | DA0.3 | Stop-the-bleed: (a) fix `employer_name_aliases_source_check` to admit `import`, `oa_universe` and `fwc`, so the reference wizard's aliases save; (b) both import wizards resolve employer and worksite names through one path — exact alias lookup first, then `@oa/employer-matching` with its 0.92 auto / 0.65 candidate thresholds — replacing the 0.35 and 0.6 client-side matchers; (c) no auto-create: unmatched names go to a review queue (generalise `upcoming_project_employers` into `name_match_reviews (entity, raw_name, import_id, status, proposals, decided_by/at)`); (d) persist `employer_name_raw` and `worksite_name_raw` on the worker row or in an import staging table; (e) the queue lets the reviewer search existing employers, worksites and aliases and map the name to one of them before "create new" is offered (D5) | migration + import route and wizard changes | a replay of the September status-sync files creates 0 new employers or worksites and N queue rows; every accepted match writes an alias |

### 1.2 Orchestration paragraph (verbatim, `ORCHESTRATION_PROMPT.md:175`)

> **DA0.3 Stop the bleed.** Fable planner; Fable implementer at `max` for the migration (`employer_name_aliases_source_check` widened; `name_match_reviews` generalised from `upcoming_project_employers`) and the single resolution path (alias lookup → `@oa/employer-matching` at its 0.92 / 0.65 thresholds → queue) in both wizards and the weekly update; Opus implementer for the review-queue page (search existing employers, worksites and aliases; map to existing; create new only as the last action); Fable reviewer. Acceptance per plan §5, proven with the replay fixture on the clone. This package removes three matchers and two client-side insert paths (plan §1.9); the planner lists every call site. No dependency on DA0.2.

### 1.3 Sections and decisions consumed

- Plan §0 item 2 (`:15`): the three matchers auto-accept at 0.35 and 0.6, none reads the alias tables, raw strings are discarded, the reference wizard's employer aliases never save.
- Plan §1.8 (`:158-166`): `@oa/employer-matching` thresholds (AUTO 0.92, CANDIDATE 0.65, gap 0.05, +0.05 principal / first token); `upcoming_project_employers` as the review-queue pattern (`match_status` vocabulary, `match_score`, `match_method`, `candidate_proposals`, `confirmed_by/at`, sticky decisions).
- Plan §1.9 (`:168-182`): the mechanical findings, re-verified against the code in §2.1 below.
- Plan §3.1 alias paragraph (`:251`): `employer_name_aliases.source` extended to `merge | manual | import | oa_universe | fwc`; the unique normalised-alias index is **DA1.4**, not this package (§6 risk R6 covers the gap until then).
- Plan §4.5 Q-S10 (`:367`): no auto-create; queue with the top-3 proposals; the reviewer searches and maps to an existing row before creating.
- Plan §6 D5 (`:446`): accepted, with search-and-map before create.
- Plan §7 (`:470`): "Import replays create duplicates again — DA1.4 alias lock and DA0.3 queue land before any bulk re-import."
- ORCHESTRATION_PROMPT rules (`:32-45`): production read-only; merges write aliases and imports read them; no import creates an employer or worksite after DA0.3 lands; never edit an applied migration; promotion gate; PostgREST strings proven; do not widen a package. Verification standards (`:112-120`), in particular the replay-fixture rule (`:117`): "a replay fixture built from the distinct raw employer and worksite strings of the September status-sync files with synthetic person columns … replayed on the clone; acceptance is zero new employers or worksites and the expected queue rows, and on a second replay zero queue rows because every variant is now an alias." Reviewer checklist (`:122-134`).
- `docs/organiser-ux-review/PROGRESS.md:7-28`: promotion gate, the three projects, PostgREST-proof rule, lint baseline 298, never `pnpm dev`, types only with an explicit safe ref.
- `docs/data-architecture/PROGRESS.md` incidental finding (the clone's ledger is five migrations behind; this planner must say what the clone rehearsal applies first) — answered in §2.3.6.

### 1.4 Read-only facts gathered for this plan (pasted results)

Production `gteygwfgjvczanmrwgbr`, 2026-09-22, one SELECT (counts and column names only):

| Key | Value |
|---|---|
| `import_logs` by `import_type` | `membership_status_sync` 23 · `workers_wizard` 33 · `campaign_lists` 5 · `employer_wizard` 3 · `membership_new_joins` 1 · `membership_weekly_update` 1 · `membership_resignations` 1 · `membership_recommencing` 1 |
| `import_logs` columns | `import_id, file_name, import_type, records_created, records_updated, errors, imported_by, imported_at, archived_at, deleted_at, is_archived` (no payload column) |
| `membership_update_batches` by status | `imported` 1 |
| `membership_update_files` by kind | `new` 1 · `recommenced` 1 · `resigned` 1 · `unfinancial` 1 |
| `storage.objects` in bucket `membership-updates` | 4 |
| `employer_name_aliases` by source | `merge` 39 |
| `worksite_name_aliases` by source | `import` 8 |
| `employers` / `worksites` | 187 / 194 |
| distinct `workers.employer_id` / `workers.worksite_id` | 156 / 174 |
| `upcoming_project_employers` by `match_status` | `auto` 27 · `needs_review` 30 · `confirmed` 16 · `unmatched` 11 |
| `employer_name_aliases_source_check` | `CHECK (((source)::text = ANY ((ARRAY['merge'::character varying, 'manual'::character varying])::text[])))` |
| alias strings mapped to more than one employer (`lower(trim(alias_name))`) | 0 |
| migration ledger tail | `20260913000000, 20260914090000, 20260914090100, 20260917100000, 20260918120000, 20260921030000` |

Clone `yqjkuobcawvigsfpgrcm`, same day, one SELECT:

| Key | Value |
|---|---|
| migration ledger tail | `…, 20260912035329, 20260913000000, 20260917100000` at planning time (no `20260914090000`, `20260914090100`, `20260918120000`, `20260921030000`, `20260922040000`). **Re-read 2026-09-23 (review A4): the tail is now `…, 20260917100000, 20260922040000`** — DA0.5's rehearsal applied `20260922040000_mobilisation_radar.sql` there. DA0.3 still has no prerequisite (§2.3.6) |
| `update_updated_at()` present / `app_settings` present / `campaign_comms_drafts` present / `documents` present | 1 / 1 / 1 / 1 |
| `membership_update_batches` present | 0 |
| `employer_name_aliases_source_check` | same two-value CHECK as production |
| `employers` / `worksites` / employer aliases / worksite aliases | 171 / 174 / 39 / 8 |
| `_oux_env_marker` rows | 1 |

**Are the raw September strings recoverable?** No. `import_logs` holds counts and an error text only (columns above); the
23 `membership_status_sync` rows carry no payload; the apply route never persisted the raw strings (§2.1 rows 9–10).
The only stored import files are the four weekly-update spreadsheets in the `membership-updates` bucket (one batch,
`lib/membership-updates/ingest.ts:24,47-55`; parsed back from storage at `app/api/membership-updates/[id]/rows/route.ts:31-36`),
which are a different, later, batch and contain personal columns. The fixture is therefore specified in §3.4 from the
distinct production `employer_name` / `worksite_name` values plus the known lineage-C variants; the operator may
substitute the real distinct strings from the 23 source files (§5 input 3).

---

## 2. Files

### 2.1 Call-site inventory (every place an employer or worksite name is matched or a row is created from an import)

Verdicts: **replaced** = re-pointed to the single resolution path (§2.4); **removed** = deleted; **kept** = untouched
by this package (with the reason).

| # | Call site | What it does today | Verdict |
|---|---|---|---|
| 1 | `apps/organising-db/src/lib/utils/employer-match.ts:93-117` (`matchEmployerCandidates`; bands at `:73-77`, 0.35 = "high") | Token Jaccard + prefix bonus over `employer_name` / `trading_name`; no alias read | **removed** (file and `src/lib/utils/__tests__/employer-match.test.ts`, 5 tests, deleted; its only consumer is row 4) |
| 2 | `apps/organising-db/src/lib/utils/worksite-fuzzy.ts:99-138` (`matchWorksiteCandidates`; bands `:71-75`; abbreviation map `:11-23`) | Jaccard + containment; accepts `aliases` but the two wizards never pass them | **replaced on the import path** (rows 5, 6, 12). The file **stays** because `app/api/campaign-import/analyse/route.ts:13,89` and `app/api/reference-import/analyse/route.ts:8,213` still import it (rows 20–21, out of scope); its removal is DA4.2's |
| 3 | `apps/organising-db/src/components/import/membership-import-wizard.tsx:209-221` (`scoreEmployer`, Jaccard only) with auto-accept `top.score >= 0.6` at `:553-556` | Third matcher | **removed** |
| 4 | `worker-import-wizard.tsx:786-800` (`buildEmployerResolutions`: `matchEmployerCandidates(val, employers)` at `:790`, auto-accept on `confidence === "high"` at `:792`) | Employer names of a header-format file | **replaced** by a dry-run call to `POST /api/import/resolve-names` (§2.4.3); the step becomes a read-only outcome table |
| 5 | `worker-import-wizard.tsx:1037-1049` (`buildGroupWorksiteResolutions`, `:1039`) and `:1051-1068` (`buildHeaderWorksiteResolutions`, `:1060`) | Worksite names (group format and header format), auto-accept at "high" (0.35) | **replaced** (same call) |
| 6 | `worker-import-wizard.tsx:1293-1315` (`proceedFromEmployerSelection`: re-scores worksites with `matchWorksiteCandidates(…, 8)` at `:1298` and re-auto-accepts) | Cross-employer re-ranking after the single-employer picker | **removed** (re-ranking has no meaning once the server resolves; the outcome table is fixed at resolution time) |
| 7 | `worker-import-wizard.tsx:1388-1425` (`handleCreateWorksite` → `POST /api/worker-import/worksites` at `:1393`) and `:1444-1478` (`handleCreateEmployer` → `POST /api/worker-import/employers` at `:1446`) | Client-initiated creates from the matching steps | **removed** (handlers, dialogs and state) |
| 8 | `app/api/worker-import/employers/route.ts:36-66` (ilike reuse then `employers.insert`) and `app/api/worker-import/worksites/route.ts:38-84` (ilike reuse, `worksites.insert`, `employer_worksite_roles.upsert`) | The worker wizard's two create routes | **removed** (both files deleted) |
| 9 | `worker-import-wizard.tsx:1914-1918` (`worksiteId: row.resolvedWorksiteId`, `employerId: row.resolvedEmployerId ?? selectedEmployerId`); raw values are still in scope at `:1564-1569` and `:1685-1688` (`groupName: rawWorksiteVal`) | Raw strings dropped from the apply payload | **replaced**: payload gains `employerNameRaw`, `worksiteNameRaw`, `importId` (§2.4.4) |
| 10 | `membership-import-wizard.tsx:859-890` (`insertOrReuse`), `:893-905` (employers), `:906-918` (worksites) | Client-side inserts of employers and worksites | **removed** (the occupation branch at `:919-945` is **kept**: occupations are out of scope) |
| 11 | `membership-import-wizard.tsx:960-967` (`resolvedEmployerId: empMap.get(row.employerRaw)`, `resolvedWorksiteId: wsMap.get(row.worksiteRaw)`) and the apply call at `:989` | Resolved ids from the wizard's own maps; `employerRaw` / `worksiteRaw` travel in the row (`lib/import/membership-import-types.ts:48-51`) but are never written (`app/api/membership-import/apply/route.ts:267-268, 391-392`) | **replaced**: ids come from the resolve response; the apply route writes the raw columns and `names_import_id` |
| 12 | `membership-import-wizard.tsx:572-578` (`buildWorksiteResolutions`: `matchWorksiteCandidates(raw, worksites)`, auto-accept "high") | Worksite matcher, membership wizard | **replaced** (same resolve call) |
| 13 | `app/api/membership-import/apply/route.ts:16-26` (`applyBranch`) and `lib/membership-updates/kinds.ts:47-49` (`defaultActionForUnmatched`: `new` → create, other kinds → skip) | The weekly update runs the membership wizard as `type=weekly_update`, mounted at `components/administration/weekly-updates-tab.tsx:380-394` (`preparedRows`, `preparedType="weekly_update"`, `weeklyBatchId`) with rows parsed from storage (`app/api/membership-updates/[id]/rows/route.ts:31-36`) | **replaced by inheritance**: the weekly update reaches the single path through the membership wizard (rows 3, 10–12); `kinds.ts` and the branch rules are unchanged; the batch id travels in `source_context.weekly_batch_id` (no FK, §2.3.6) |
| 14 | `app/api/reference-import/apply/route.ts:47-75` (`insertAliases`: `source: "import"` at `:64`; error swallowed at `:69-71`, `if (!error) count++` at `:67`) | Writes employer aliases the CHECK rejects; failure invisible | **kept as code; fixed by the migration** (a). The reference wizard's create paths (`:119-127` employers, `:159-167` worksites) are admin-run and off the worker import path; they stay (plan §1.8 keeps the wizard for washing rounds). After the CHECK widens, its employer aliases will save — risk R2 |
| 15 | `apps/scraper/src/pipeline/match.ts:48-63` (`proposeEmployerMatch`, writes `upcoming_project_employers`) and `app/api/upcoming-projects/rematch/route.ts:94-118` | The NOPSEMA scraper's use of `@oa/employer-matching` | **kept** (not a worker import; unchanged behaviour). The package change in §2.4.1 keeps `proposeEmployerMatch`'s signature and results byte-identical for these two callers |
| 16 | `packages/employer-matching/src/match.ts:25-30` (`PRINCIPAL_BOOST 0.05`, `FIRST_TOKEN_BOOST 0.05`, `CANDIDATE_THRESHOLD 0.65`, `AUTO_THRESHOLD 0.92`, `AUTO_DOMINANCE_GAP 0.05`, `TOP_N 3`), `:63-159` | The matcher the plan standardises on | **kept and generalised** (`proposeNameMatch`, §2.4.1) |
| 17 | `app/api/worker-import/apply/route.ts:565-566` (`worksite_id: row.worksiteId`, `employer_id: row.employerId ?? null`), `:580-585` (campaign-protected strip), `:727-737` (`import_logs.insert` after the rows) | Server write of the FKs; import log written last, id not returned | **replaced**: raw columns written; `import_logs` row created by the resolve route and **updated** here (§2.4.4) |
| 18 | `app/api/membership-import/apply/route.ts:267-268` (update patch), `:391-392` (insert), `:464-475` (`import_logs.insert` per batch with a "(batch i/n)" suffix, `:459-462`) | Same for the membership path | **replaced** (same shape as row 17) |
| 19 | `membership-import-wizard.tsx:281-291` (props) and the two mounts: `weekly-updates-tab.tsx:380-394`, `app/(dashboard)/administration/page.tsx:2658-2661`; worker wizard mount `:2662-2665` | Entry points | **kept** (props unchanged; the wizards gain a "N names queued — open Name Reviews" link, path from `lib/name-reviews/path.ts`) |
| 20 | `app/api/campaign-import/analyse/route.ts:52-80` (`matchEmployer`: `similarityRatio` over rows **and aliases**, 0.6 accept) and `:85-98` (`matchVessel` via row 2); `app/api/campaign-import/apply/route.ts:139-170` (`employers.insert`) and `:217-243` (`worksites.insert`) | A **third import path** (campaign lists, `import_type = campaign_lists`, 5 runs on production) that creates employers and worksites; not named in plan §1.9 | **kept — out of this package's §5 row; raised as an incidental finding and operator input 5**. It reads aliases already; its creates are not removed here because the row names "both import wizards" and the prompt forbids widening. Recommended home: DA4.2 |
| 21 | `app/api/reference-import/analyse/route.ts:96-107` (`similarityRatio` over rows and aliases, 0.85/0.6) and `:213-218` | The reference wizard's matching | **kept** (row 14) |

Count: **21 call sites** (rows 1–21): removed 6 (rows 1, 3, 6, 7, 8, 10), replaced 9 (rows 2, 4, 5, 9, 11, 12, 13, 17, 18 — row 2 is replaced on the import path while its file stays for rows 20–21), kept 6 (rows 14, 15, 16, 19, 20, 21; the occupation branch inside row 10 is also kept).

### 2.2 Files to change (with today's code cited)

**Fable (database, resolution, wizards, weekly update, fixture, tests)**

| File | Change |
|---|---|
| `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` | **new** — §2.3 (later than `20260922040000`; name passes `scripts/validate-supabase-migrations.mjs:7`) |
| `packages/employer-matching/src/match.ts` | add `proposeNameMatch(query, candidates: NameCandidate[])` generalising `:63-159`; `proposeEmployerMatch` becomes a wrapper mapping `{employer_id, employer_name, trading_name, employer_category}` → `{id, name, altNames: [trading_name], boost: employer_category === "Principal_Employer"}`; export the five constants (`:25-30`) as `NAME_MATCH_THRESHOLDS` so tests and the plan cite one source |
| `packages/employer-matching/index.ts` | export `proposeNameMatch`, `NameCandidate`, `NAME_MATCH_THRESHOLDS` (today `:1-8`) |
| `apps/organising-db/src/lib/import/name-fold.ts` | **new** — `foldName(s)`: `trim`, collapse whitespace to one space, lower-case; byte-for-byte the rule of the SQL `fold_name()` in §2.3.2 |
| `apps/organising-db/src/lib/import/resolve-names.ts` | **new** — the pure resolver `resolveNames()` and the server wrapper `resolveAndQueue()` (§2.4.2) |
| `apps/organising-db/src/lib/import/{resolve-names-client.ts,resolve-names-types.ts,import-log.ts}`, `src/components/import/name-resolution-table.tsx` | **new** helper modules shared by the two wizards and the routes (added in implementation; D22) |
| `apps/organising-db/src/lib/name-reviews/path.ts` | **new** — `export const NAME_REVIEWS_PATH = "/name-reviews"` (the `lib/membership-updates/href.ts` pattern); imported by both wizards and by Opus's nav def |
| `apps/organising-db/src/app/api/import/resolve-names/route.ts` | **new** — §2.4.3 |
| `apps/organising-db/src/app/api/name-match-reviews/[id]/decide/route.ts` | **new** — admin-gated (`lib/membership-updates/require-admin.ts:4-22` pattern, but the RPC runs on the **user** client so `auth.uid()` / `is_admin()` apply), calls `decide_name_match`, then `syncWorkersToMatchingCampaigns(admin, backfilledWorkerIds)` as `app/api/worker-import/apply/route.ts:708-711` does |
| `apps/organising-db/src/app/api/worker-import/apply/route.ts` | rows carry `employerNameRaw`, `worksiteNameRaw`; request carries `importId`; write `employer_name_raw`, `worksite_name_raw`, `names_import_id` in `workerData` (`:553-570`); replace the `import_logs.insert` at `:727-737` with an accumulate-`UPDATE` on `importId` |
| `apps/organising-db/src/app/api/membership-import/apply/route.ts` | same: raw columns from `row.employerRaw` / `row.worksiteRaw` (already on `ApplyRow` via `ParsedMembershipRow`, `:34-46`) into the patch (`:262-270`) and insert (`:383-406`); `importId` replaces the per-batch `import_logs.insert` (`:464-475`) |
| `apps/organising-db/src/components/import/worker-import-wizard.tsx` | rows 4–7, 9 of §2.1; the employer and worksite steps render the resolve outcomes (read-only) with the queue link; apply calls resolve with `persist: true` once before batch 1 (§2.4.4) |
| `apps/organising-db/src/components/import/membership-import-wizard.tsx` | rows 3, 10–12 of §2.1 (`insertOrReuse` remains only for occupations, so the function stays but its `table` union narrows to `"occupations"`) |
| `apps/organising-db/src/app/api/worker-import/employers/route.ts`, `…/worksites/route.ts` | **deleted** |
| `apps/organising-db/src/lib/utils/employer-match.ts`, `src/lib/utils/__tests__/employer-match.test.ts` | **deleted** |
| `packages/db-types/generated.ts` | regenerated **only** with `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` (or the clone ref) after the migration is on that project; never the default ref (root `package.json:9` defaults to production) |
| `scripts/data-hygiene/da0.3/*` | §3 |
| tests | §2.6 |

**Opus (review-queue page, nav, UI tests)**

| File | Change |
|---|---|
| `apps/organising-db/src/app/(dashboard)/name-reviews/page.tsx` and `_components/{review-list,review-row,entity-search,create-new-dialog}.tsx` | **new** — §2.5 |
| `apps/organising-db/src/lib/hooks/useNameMatchReviews.ts`, `useNameEntitySearch.ts`, `useDecideNameMatch.ts` | **new** — the PostgREST strings of §2.6.4; decide calls `POST /api/name-match-reviews/[id]/decide` (not `supabase.rpc`, so the campaign-universe sync runs server-side) |
| `apps/organising-db/src/lib/nav/nav-model.ts` | `DEFS.name_reviews` (`:141-147` pattern) in `FULL_ADMIN_ITEMS` (`:263-267`) |
| `apps/organising-db/src/lib/nav/__tests__/{nav-model.test.ts,__snapshots__/nav-model.test.ts.snap,nav-model-fixture.ts,nav-reachability.test.ts}` | snapshot cases 1, 7 and 9 (`nav-model.test.ts:62-138`, the ones that render the admin block, `nav-model.ts:354`), fixture rows, and the `ALL_NAV_HREFS` list at `nav-reachability.test.ts:303-322` gains `/name-reviews` |
| `apps/organising-db/src/lib/hooks/__contract__/name-match-reviews.contract.test.ts` | **new** — proves the page's PostgREST strings on dev (§2.6.4) |

Nobody edits the same file: Fable never touches `src/lib/nav/**`, `src/app/(dashboard)/name-reviews/**` or `src/lib/hooks/**`; Opus never touches `supabase/**`, `packages/**`, `src/lib/import/**`, `src/app/api/**` or `src/components/import/**`. The shared seam is `src/lib/name-reviews/path.ts` (Fable creates it in the first commit; Opus imports it), the RPC/route contract in §2.4.5, and the generated types.

### 2.3 Migration design — `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` (one file)

Written in the style of `20260921030000_membership_updates.sql` (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
explicit `REVOKE`/`GRANT`, sequence grant block `:191-207`). Depends only on baseline objects: `import_logs`
(`20260908050000_baseline_schema.sql:12037-12049`), `employers` (`:7346`, unique name `:19382`), `worksites` (`:12548`,
unique name `:20267`), `workers` (`:9735`; FKs `:25326`, `:25371`), `employer_name_aliases` (`:11662-11669`),
`worksite_name_aliases` (`:17635-17642`), `update_updated_at()` (`:6735`), `is_admin()` (`:3638-3646`), `auth.users`.

#### 2.3.1 (a) Widen the alias source CHECKs

```sql
ALTER TABLE "public"."employer_name_aliases"
  DROP CONSTRAINT IF EXISTS "employer_name_aliases_source_check";
ALTER TABLE "public"."employer_name_aliases"
  ADD CONSTRAINT "employer_name_aliases_source_check"
  CHECK (("source")::text = ANY (ARRAY['merge','manual','import','oa_universe','fwc']));
-- Same five values on worksite_name_aliases (today import|manual|merge, baseline:17642): the resolver and the
-- decision function write both tables with one vocabulary, and DA3.x loads will write oa_universe/fwc for
-- worksites too. One line; operator input 6 may strike it.
ALTER TABLE "public"."worksite_name_aliases"
  DROP CONSTRAINT IF EXISTS "worksite_name_aliases_source_check";
ALTER TABLE "public"."worksite_name_aliases"
  ADD CONSTRAINT "worksite_name_aliases_source_check"
  CHECK (("source")::text = ANY (ARRAY['merge','manual','import','oa_universe','fwc']));
```

Existing rows (39 `merge`, 8 `import`) satisfy both new CHECKs, so no `NOT VALID` dance is needed.

#### 2.3.2 Name folding, shared by SQL and TypeScript

```sql
CREATE OR REPLACE FUNCTION "public"."fold_name"(p text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(regexp_replace(btrim(p), '\s+', ' ', 'g'));
$$;
```

`lib/import/name-fold.ts` implements exactly `s.trim().replace(/\s+/g, " ").toLowerCase()`. Parity is asserted by the
contract test (§2.6.3) over a fixed list of 12 strings (case, tabs, double spaces, trailing space, `Pty Ltd`, a colon
pair like the row builder's `Employer : Employer: Site` shape at `lib/import/membership-row-builder.ts:31-39`). Legal
suffixes are **not** stripped here: exact means exact-after-folding; suffix tolerance is the fuzzy step's job
(`normaliseForMerge`, `packages/employer-matching/src/normalise.ts:1-11`).

#### 2.3.3 (b) `name_match_reviews`, generalised from `upcoming_project_employers` (`baseline:1490-1508`)

```sql
CREATE TABLE IF NOT EXISTS "public"."name_match_reviews" (
  "id"                   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  "entity"               text NOT NULL,
  "raw_name"             text NOT NULL,
  "normalised_name"      text NOT NULL,                       -- fold_name(raw_name), maintained by trigger
  "import_id"            integer REFERENCES "public"."import_logs"("import_id") ON DELETE SET NULL,
  "status"               text NOT NULL DEFAULT 'needs_review',
  "match_score"          numeric(4,3),
  "match_method"         text,
  "candidate_proposals"  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- top-3 [{id, name, score, is_principal}]
  "resolved_employer_id" integer REFERENCES "public"."employers"("employer_id") ON DELETE SET NULL,
  "resolved_worksite_id" integer REFERENCES "public"."worksites"("worksite_id") ON DELETE SET NULL,
  "occurrences"          integer NOT NULL DEFAULT 1,          -- rows in the import carrying this string
  "source_context"       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {other_raw_name, import_type, weekly_batch_id, source_kinds[]}
  "notes"                text,
  "decided_by"           uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL,
  "decided_at"           timestamp with time zone,
  "created_by"           uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "name_match_reviews_entity_check"
    CHECK ("entity" IN ('employer', 'worksite')),
  CONSTRAINT "name_match_reviews_raw_name_check"
    CHECK (char_length(btrim("raw_name")) BETWEEN 1 AND 200),
  CONSTRAINT "name_match_reviews_status_check"
    CHECK ("status" IN ('auto', 'needs_review', 'confirmed', 'overridden', 'rejected', 'unmatched')),
  CONSTRAINT "name_match_reviews_match_method_check"
    CHECK ("match_method" IS NULL OR "match_method" IN ('exact', 'alias', 'fuzzy', 'manual', 'created')),
  CONSTRAINT "name_match_reviews_resolved_entity_check"
    CHECK (("entity" = 'employer' AND "resolved_worksite_id" IS NULL)
        OR ("entity" = 'worksite' AND "resolved_employer_id" IS NULL)),
  CONSTRAINT "name_match_reviews_decided_check"
    CHECK (("status" IN ('confirmed', 'overridden', 'rejected')) = ("decided_at" IS NOT NULL))
);
```

Status vocabulary — the full existing set (`baseline:1506`), each with a defined meaning here:

| status | meaning | `resolved_*` | `decided_*` |
|---|---|---|---|
| `auto` | the resolver accepted a fuzzy match at ≥ 0.92 with the 0.05 gap; recorded for audit and reopen; alias written | set | null |
| `needs_review` | ≥ 1 proposal at ≥ 0.65, none dominant at ≥ 0.92; **open** | null | null |
| `unmatched` | no proposal at ≥ 0.65; **open** | null | null |
| `confirmed` | reviewer accepted a proposal (`match_method` stays `fuzzy`) or created a new row (`match_method = 'created'`) | set | set |
| `overridden` | reviewer mapped to a row found by search (`match_method = 'manual'`) | set | set |
| `rejected` | not an employer / worksite (e.g. a status word); **sticky**: the resolver returns `rejected` for the same folded string on later imports and does not re-queue it (operator input 8) | null | set |

Exact and alias hits are **not** recorded in the table (they are the steady state; recording them would add a row per
distinct name per weekly file for no decision). "Queue" in the acceptance criteria means `status IN ('needs_review',
'unmatched')`.

Indexes, trigger, RLS, grants:

```sql
CREATE INDEX IF NOT EXISTS "idx_name_match_reviews_open"
  ON "public"."name_match_reviews" ("entity", "created_at" DESC)
  WHERE "status" IN ('needs_review', 'unmatched');
CREATE INDEX IF NOT EXISTS "idx_name_match_reviews_entity_norm"
  ON "public"."name_match_reviews" ("entity", "normalised_name");
CREATE INDEX IF NOT EXISTS "idx_name_match_reviews_import"
  ON "public"."name_match_reviews" ("import_id") WHERE "import_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_name_match_reviews_employer"
  ON "public"."name_match_reviews" ("resolved_employer_id") WHERE "resolved_employer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_name_match_reviews_worksite"
  ON "public"."name_match_reviews" ("resolved_worksite_id") WHERE "resolved_worksite_id" IS NOT NULL;
-- one row per string per import (the resolver upserts on this)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_name_match_reviews_import_entity_norm"
  ON "public"."name_match_reviews" ("import_id", "entity", "normalised_name") WHERE "import_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."name_match_reviews_fold"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalised_name := public.fold_name(NEW.raw_name);
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER "trg_name_match_reviews_fold"
  BEFORE INSERT OR UPDATE OF "raw_name" ON "public"."name_match_reviews"
  FOR EACH ROW EXECUTE FUNCTION "public"."name_match_reviews_fold"();
CREATE OR REPLACE TRIGGER "trg_name_match_reviews_updated_at"
  BEFORE UPDATE ON "public"."name_match_reviews"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."name_match_reviews" ENABLE ROW LEVEL SECURITY;

-- Mirrors upcoming_project_employers, which has exactly one policy (baseline:28990-28993):
--   ALTER TABLE "public"."upcoming_project_employers" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "upcoming_project_employers_select_authed" ON "public"."upcoming_project_employers"
--     FOR SELECT TO "authenticated" USING (true);
-- Writes there come from the scraper (service role) and the SECURITY DEFINER
-- confirm_upcoming_project_match() gated by is_admin() (baseline:1512-1522). Same here.
DROP POLICY IF EXISTS "name_match_reviews_select_authed" ON "public"."name_match_reviews";
CREATE POLICY "name_match_reviews_select_authed"
  ON "public"."name_match_reviews" FOR SELECT TO "authenticated" USING (true);

-- Grants. The baseline grants ALL to anon/authenticated/service_role on every public table
-- (upcoming_project_employers at baseline:29574-29576; default privileges at :33373-33386), and every
-- migration since 2026-09-18 revokes that blanket for its new tables (20260918120000:57-60, 20260921030000:176-189).
-- Follow the later, tighter convention; RLS with a SELECT-only policy makes the outcome identical for authenticated.
REVOKE ALL ON TABLE "public"."name_match_reviews" FROM PUBLIC, "anon";
GRANT SELECT ON TABLE "public"."name_match_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."name_match_reviews" TO "service_role";
-- identity sequence: USAGE, SELECT to service_role (the 20260921030000:191-207 DO block, one entry)
```

`COMMENT ON TABLE` states the vocabulary and that writes go through `decide_name_match()` and the service role only.

#### 2.3.4 The decision function (transactional: alias + queue row + back-fill in one statement)

Mirrors `confirm_upcoming_project_match(payload jsonb)` (`baseline:1512-1620`: `SECURITY DEFINER`, `SET search_path`,
`is_admin()` gate, `action` switch, `RETURNING`), returning `jsonb` because the caller needs the back-filled worker ids
for the campaign-universe sync.

```
decide_name_match(payload jsonb) RETURNS jsonb  -- {review: <row>, alias_written: bool, backfilled_worker_ids: int[], siblings_resolved: int}
  payload: { id, action: 'confirm'|'override'|'create'|'reject'|'reopen',
             employer_id? | worksite_id?  (confirm/override: the target row),
             create?: { employer_name, trading_name?, employer_category? } | { worksite_name, worksite_type, is_offshore? },
             notes? }
```

Steps for `confirm`, `override`, `create` (the three "accepted" outcomes):

1. `IF NOT is_admin() THEN RAISE` (as `baseline:1523-1525`). Lock the review row `FOR UPDATE`; it must be `needs_review`, `unmatched` or `auto` (reopen first otherwise).
2. `create`: `INSERT INTO employers (employer_name, trading_name, employer_category, is_active) … RETURNING employer_id` or `INSERT INTO worksites (worksite_name, worksite_type, is_offshore, is_active) …` — the **only** insert into either table anywhere on the import path after this package. A unique-name violation (`employers_employer_name_key` `baseline:19382`, `worksites_worksite_name_key` `:20267`) raises with the message "already exists — search for it instead"; the page shows that verbatim.
3. Ambiguity guard (the DA1.4 alias lock, applied per decision until the index lands): if an alias with `fold_name(alias_name) = v.normalised_name` exists on a **different** row of the same entity, `RAISE 'alias already points at <other name>; resolve that alias first'`. Production has 0 such conflicts today (§1.4).
4. Alias write when `fold_name(target canonical name) <> v.normalised_name`: `INSERT INTO employer_name_aliases (employer_id, alias_name, source, created_by) VALUES (…, btrim(raw_name), 'import', auth.uid()) ON CONFLICT ("employer_id", lower(btrim("alias_name"))) DO NOTHING` (the unique index `employer_name_aliases_employer_lower_alias`, `baseline:20321`; worksites: `worksite_name_aliases_ws_lower_alias`, `:22249`). `source = 'import'` for both reviewer decisions and (in the resolver) auto accepts — plan §5 row: "every accepted match writes an alias"; exact-name and alias hits write nothing.
5. Back-fill — exactly these rows:
   ```sql
   UPDATE public.workers w
      SET employer_id = v_target, updated_at = now()
    WHERE w.employer_id IS NULL
      AND public.fold_name(w.employer_name_raw) = v.normalised_name
      AND w.names_import_id IN (SELECT import_id FROM public.name_match_reviews
                                 WHERE entity = v.entity AND normalised_name = v.normalised_name
                                   AND import_id IS NOT NULL)
   RETURNING w.worker_id
   ```
   (`worksite_id` / `worksite_name_raw` for worksites). Only a **null** FK is filled, so no organiser-maintained value and no campaign-protected field (`lib/workers/campaign-protected-fields.ts:18-22`) is overwritten; a worker in a protecting campaign whose FK is null is filled (risk R1 records the choice). Rows whose raw string was overwritten by a later import with a different name fall out of the predicate by construction.
6. Sibling open rows for the same `(entity, normalised_name)` (other imports) are resolved with the same target, `status`, `match_method`, `decided_by/at` and `notes = 'resolved with review <id>'`; the back-fill in step 5 already covered their imports.
7. Update the decided row: `confirm` → `status='confirmed'`, `match_method = COALESCE(match_method,'fuzzy')`; `override` → `'overridden'`, `'manual'`, `match_score = NULL`; `create` → `'confirmed'`, `'created'`; all set `resolved_*`, `decided_by = auth.uid()`, `decided_at = now()`, `notes`.

`reject`: status `rejected`, `resolved_* = NULL`, `match_method = NULL`, `decided_*` set; no alias, no back-fill; siblings rejected too. `reopen`: back to `needs_review` when `candidate_proposals <> '[]'` else `unmatched` (`baseline:1600-1608` rule), `decided_* = NULL`, `resolved_* = NULL`; the alias and the back-fill are **not** reverted (the admin removes a wrong alias with the existing alias delete policy, `baseline:25617`; risk R7).

Grants: `REVOKE ALL ON FUNCTION decide_name_match(jsonb) FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role`
(the default privileges grant functions to anon, `baseline:33384`).

#### 2.3.5 (c) Persistence of raw names — columns on `workers`, not a staging table

```sql
ALTER TABLE "public"."workers"
  ADD COLUMN IF NOT EXISTS "employer_name_raw" text,
  ADD COLUMN IF NOT EXISTS "worksite_name_raw" text,
  ADD COLUMN IF NOT EXISTS "names_import_id" integer
    REFERENCES "public"."import_logs"("import_id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_workers_names_import"
  ON "public"."workers" ("names_import_id") WHERE "names_import_id" IS NOT NULL;
COMMENT ON COLUMN "public"."workers"."employer_name_raw" IS
  'Employer string as last received from an import (organisation name, not personal data); the back-fill key when a queued name is decided.';
```

Why columns and not a staging table:

- The back-fill (§2.3.4 step 5) is one `UPDATE … WHERE` on the worker row. A staging table keyed by `(import_id, row_index)` would have to be joined to `workers` through the row result of the apply route, which is not stored anywhere today (`app/api/membership-import/apply/route.ts:464-475` writes counts only).
- The weekly update processes thousands of rows (the September sync: 23 files, 5,125 records; the status-sync file is the full member list). A staging table grows by that every week; the columns hold the **latest** string per worker, which is the fact DA1.4 needs to re-resolve every worker ("replaying … yields 0 unmatched names", plan `:392`). History of the strings is not needed: the queue row keeps the import lineage.
- The strings are organisation and worksite names, not personal data; they sit beside `employer_id` under the same read policy (`baseline:27257`).
- `workers_view` and the other reviewer-checklist views (`ORCHESTRATION_PROMPT.md:132`) keep their column lists: a view's `*` is expanded at creation, so added base columns do not appear in existing views.
- Cost: three nullable columns on a wide table; no rewrite (`ADD COLUMN` of nullable columns without defaults is metadata-only).

`names_import_id` is what lets the queue link an import to its waiting rows ("by the persisted raw name and import id").

#### 2.3.6 Dependencies and the clone rehearsal

- The migration references **no** object from `20260921030000_membership_updates.sql` (the weekly batch is stored as `source_context.weekly_batch_id`, a jsonb value with no FK, precisely so the clone rehearsal needs nothing beyond the baseline) and none from `20260914090000` / `20260914090100` (WP2.2a/b, applied only under their own run sheet per the UX ledger) or `20260922040000` (DA0.5's).
- **Minimal prerequisite set on the clone: none.** The clone's ledger ended at `20260917100000` when this plan was written and now ends at `20260922040000` (DA0.5's rehearsal; §1.4, review A4) — neither state adds or removes a dependency: the clone already holds every object the migration touches (`update_updated_at`, `app_settings`, `import_logs`, both alias tables, `is_admin`: §1.4 checks). The DA0.3 file applies directly after `20260917100000`; the rehearsal inserts its own ledger row `('20260922120000','da0_3_name_match_reviews')` as its own statement (the oux-wp3.8 README mechanism, `scripts/data-hygiene/oux-wp3.8/README.md` "Run order").
- For the record, both missing non-WP2.2 files are safe to apply to the clone standalone, should a later package need them, but DA0.3 does not: `20260918120000_email_draft_attachments.sql` references only `campaign_comms_drafts`, `campaigns`, `documents`, `auth.users`, `get_user_role()` and the `storage.objects` policies for bucket `email-attachments` (`:17-38`, `:72-92`), all present on the clone; `20260921030000_membership_updates.sql` references `storage.buckets` (`:18-24`), `update_updated_at()` (`:59-61`, `:124-126`), `auth.users`, `get_user_role()` (`:159-174`) and `app_settings` (`:212-214`), all present. Neither is applied in this package's run sheets; the ledger gap remains an incidental finding for DA0.5 / the D17 fresh clone.
- Ledger row naming on production follows the promotion gate: migration file → dev (operator, or the agent via the connector with per-file approval) → contract suite → clone rehearsal (§3.2) → production run sheet by the operator → PR merged → types regenerated.

#### 2.3.7 (d) Rollback — `scripts/data-hygiene/da0.3/90_rollback_da0_3_name_match_reviews.sql`

oux style (`scripts/data-hygiene/oux-wp3.8/90_rollback_wp3_8_campaign_families.sql:16-38` guard, `:40-70`
precondition): `BEGIN;` → environment guard (`_oux_env_marker` clone/dev singleton or `SET LOCAL oux.env = 'production'`
in the same submission, the committed file names no project) → precondition **STOPs** while (i) `name_match_reviews`
has any row, (ii) any `workers.employer_name_raw`, `worksite_name_raw` or `names_import_id` is not null, (iii) any
`employer_name_aliases.source` not in `('merge','manual')` or any `worksite_name_aliases.source` not in
`('import','manual','merge')` exists — i.e. `91_clear_da0_3_data.sql` must have run first; the rollback never silently
drops data → drops the function `decide_name_match`, the triggers and `name_match_reviews_fold()`, the table, the
three worker columns and their index, `fold_name()`, and restores both CHECKs verbatim to the baseline text
(`baseline:11669`, `:17642`) → post-assertions (`to_regclass('public.name_match_reviews') IS NULL`,
`pg_get_constraintdef` equals the baseline strings, the three `pg_attribute` rows are gone) → `COMMIT;` → appended
read-only `SELECT`. The ledger repair `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120000'`
is quoted in the header and never executed by the file.

### 2.4 The single resolution path

#### 2.4.1 Package change — `@oa/employer-matching`

`proposeNameMatch(query: string, candidates: NameCandidate[]): MatchOutcome` where
`NameCandidate = { id: number; name: string; altNames?: (string | null)[]; boost?: boolean; isPrincipal?: boolean }`.
It is `proposeEmployerMatch` (`packages/employer-matching/src/match.ts:63-159`) with `trading_name` generalised to
`altNames` (scored as the trading name is at `:78-83, :89-91, :97, :105-107`: max over the names) and the principal
boost generalised to `boost` (`:119-121`); the first-token boost (`:111-117`), the stop tokens (`:35-45`), the
containment/Levenshtein scoring (`:96-109`) and the five constants (`:25-30`) are untouched. `proposeEmployerMatch`
becomes `proposeNameMatch(query, employers.map(e => ({ id: e.employer_id, name: e.employer_name, altNames: [e.trading_name], boost: e.employer_category === "Principal_Employer", isPrincipal: … })))`
mapped back to `MatchProposal { employer_id, name, score, is_principal }`, so the scraper (`apps/scraper/src/pipeline/match.ts:48`)
and the rematch route (`app/api/upcoming-projects/rematch/route.ts:94`) see identical results (test §2.6.1 item 6).

Worksites get no abbreviation expansion (the `worksite-fuzzy.ts:11-23` map is dropped from the import path): the
worksite alias table exists for exactly that ("KGP -> Karratha Gas Plant", `baseline:17650`), and an abbreviation
that is not yet an alias queues once and becomes one.

#### 2.4.2 Module — `apps/organising-db/src/lib/import/resolve-names.ts`

Pure part (unit-tested, no I/O):

```ts
export type NameEntity = "employer" | "worksite";
export interface ReferenceRow  { id: number; name: string; altNames: (string | null)[]; boost: boolean; isActive: boolean }
export interface ReferenceAlias { id: number; aliasName: string }
export interface RejectedName   { normalisedName: string }
export interface ReferenceSet   { rows: ReferenceRow[]; aliases: ReferenceAlias[]; rejected: RejectedName[] }

export type ResolutionStatus = "exact" | "alias" | "auto" | "needs_review" | "unmatched" | "rejected";
export interface ResolutionOutcome {
  rawName: string;
  normalisedName: string;                       // foldName(rawName)
  status: ResolutionStatus;
  resolvedId: number | null;                    // exact | alias | auto
  score: number | null;                         // auto | needs_review (top proposal)
  method: "exact" | "alias" | "fuzzy" | null;
  proposals: { id: number; name: string; score: number; is_principal: boolean }[];  // top-3 (TOP_N)
  writesAlias: boolean;                         // true only for auto when normalisedName !== foldName(canonical)
}

export function resolveNames(entity: NameEntity, rawNames: string[], ref: ReferenceSet): ResolutionOutcome[]
```

Order, per distinct folded string (duplicates collapse; `occurrences` counted):

1. **Rejected memory**: if `ref.rejected` holds the folded string → `rejected` (no proposals, no queue row).
2. **Exact**: `foldName(raw) === foldName(row.name)` or `=== foldName(altName)` for any `altNames` entry (trading names) → `exact`, `method 'exact'`; a fold collision between two rows (should be impossible under the unique name constraints, but trading names are not unique) → fall through to step 4 with both as proposals at score 1.0 (→ `needs_review` by the dominance gap).
3. **Alias**: `foldName(raw) === foldName(alias.aliasName)` → `alias`, `method 'alias'`; if the same folded alias points at more than one row → `needs_review` with those rows as proposals (the pre-DA1.4 ambiguity case, 0 today).
4. **Fuzzy**: `proposeNameMatch(raw, activeRows as NameCandidate[])` with `altNames = [trading_name, …aliases of that row]` so an alias that is close-but-not-exact still scores; `auto` iff `status === "auto"` (≥ `AUTO_THRESHOLD` 0.92 and gap ≥ `AUTO_DOMINANCE_GAP` 0.05 over the second proposal, `match.ts:141-144`); else `needs_review` with the top-3 (`TOP_N`, `:30,134`) or `unmatched` when nothing reaches `CANDIDATE_THRESHOLD` 0.65 (`:123-131,137-139`).
5. **Never create.** There is no branch that yields a new row.

Inactive rows (`is_active = false`) are exact/alias targets (reuse an inactive record rather than duplicate it, the point of
`membership-import-wizard.tsx:854-858`'s comment) but are excluded from fuzzy candidates, as `apps/scraper/src/pipeline/match.ts:19-23` does.

Server wrapper (thin, integration-tested via the route):

```ts
export async function resolveAndQueue(admin: SupabaseClient, input: {
  entity: NameEntity; rawNames: string[]; importId: number | null; userId: string;
  persist: boolean; sourceContext: Record<string, unknown>; occurrences: Map<string, number>; otherRawByName?: Map<string, string>;
}): Promise<ResolutionOutcome[]>
```

Loads the reference set with three selects (`employers`: `employer_id, employer_name, trading_name, employer_category, is_active`;
`employer_name_aliases`: `employer_id, alias_name`; `name_match_reviews` where `status = 'rejected'` for the entity — 187 rows,
39 aliases today; worksites 194 / 8), runs `resolveNames`, and when `persist` is true: writes `auto` aliases
(`source 'import'`, `created_by userId`, `ON CONFLICT DO NOTHING` semantics via ignore-23505) and upserts queue rows for
`auto`, `needs_review` and `unmatched` on `(import_id, entity, normalised_name)` with `candidate_proposals`, `match_score`,
`match_method` (`'fuzzy'` for auto, else null), `occurrences`, `source_context` (`other_raw_name` = the worksite string
that accompanied this employer string most often, or vice versa; `import_type`; `weekly_batch_id`; `source_kinds`),
`created_by`. Performance: one reference load per call; folding is `Map` lookup; the fuzzy step runs only for names
that miss both maps, over ≤ 187 candidates each, with strings under 200 characters — a 5,000-row file has hundreds of
distinct strings, so the call is bounded by a few hundred × 187 Levenshtein comparisons (risk R4 sets the measured
budget).

#### 2.4.3 Route — `POST /api/import/resolve-names`

Auth: signed-in user with `user_profiles.role IN ('admin','user')` (the roles that may insert workers, aliases and
import logs: `baseline:26043, 26067, 26227, 26235`); `viewer` → 403. Body:

```ts
{ importType: "workers_wizard" | `membership_${MembershipImportType}`; fileName: string; persist: boolean;
  employerNames: { raw: string; occurrences: number; otherRaw?: string | null }[];
  worksiteNames: { raw: string; occurrences: number; otherRaw?: string | null }[];
  sourceContext?: { weeklyBatchId?: number; sourceKinds?: string[] } }
```

Response `{ importId: number | null; employers: ResolutionOutcome[]; worksites: ResolutionOutcome[]; queued: number; aliasesWritten: number }`.
With `persist: false` (the wizards' matching steps) nothing is written and `importId` is null — the outcomes are shown.
With `persist: true` (called once at the start of apply, §2.4.4) the route first inserts the `import_logs` row
(`file_name`, `import_type`, `records_created 0`, `records_updated 0`, `imported_by`) and returns its `import_id`; the
queue rows are linked to it. The resolver is deterministic, so the persisted outcomes equal the previewed ones unless a
decision landed in between (then the second call simply returns the better outcome).

#### 2.4.4 How the three consumers call it

| Consumer | Where | Call | Row handling |
|---|---|---|---|
| Worker wizard | employer step (`worker-import-wizard.tsx:786-800`) and worksite steps (`:1037-1068`) | `persist: false` over the distinct header/group strings; the steps render outcome tables (raw → matched name + method + score, or "queued: top proposals") and the queue link. No picking, no creating (operator input 1). The single-employer picker (`employer_selection`, files without an employer column) stays: it selects an existing row by id, no name is matched, `employer_name_raw` is null for those rows | apply: one `persist: true` call before batch 1 (`:1946-1958` batch loop) → `importId`; every row carries `employerNameRaw`, `worksiteNameRaw` (from `:1564-1569`); the apply route writes them and `names_import_id`; FKs come from the outcomes (null when queued/rejected) |
| Membership wizard (`new_joins`, `resignations`, `recommencing`, `status_sync`) | `buildEmployerResolutions` / `buildWorksiteResolutions` (`:551-595`) | same dry-run at the Employers/Worksites steps; `persist: true` at the start of `applyImport` (`:843`) over the names of rows whose `dedupAction !== "skip"` only | `resolvedEmployerId` / `resolvedWorksiteId` (`:963-964`) from the outcomes; `employerRaw` / `worksiteRaw` already on the row; the apply route writes the three columns on **both** the update patch (`:262-270`, alongside — not inside — the campaign-protected strip at `:363-366`, because the raw string is provenance, not a protected field) and the insert (`:383-406`) |
| Weekly update | the same wizard with `preparedType="weekly_update"` (`weekly-updates-tab.tsx:388-393`) | identical; `sourceContext.weeklyBatchId = weeklyBatchId`, `sourceKinds` from `row.sourceKind` | per file kind nothing changes: `applyBranch` (`apply/route.ts:16-26`) and `defaultActionForUnmatched` (`kinds.ts:47-49`) decide create/update/skip as today; only non-skipped rows contribute names |

**A row whose employer or worksite is queued is imported, not held back.** Its FK is null (create) or left as it is
(update: the patch only sets the FK when resolved, `apply/route.ts:267-268` as today), the raw string and
`names_import_id` are persisted, and the queue row carries the import. Justification against the weekly kinds: the
`resigned` and `unfinancial` files carry the membership status that is the authoritative fact (`membership-import-types.ts:9-13`);
holding a resignation back because the employer string is unfamiliar would keep a resigned member active until an
admin works the queue, which is the wrong trade. `new` rows create the person with a null employer — the same state a
`skip`ped unmatched row leaves for the other kinds today — and the back-fill completes them when the queue is decided.
Names on `skip`ped rows are not queued (they belong to people not on file).

**An update row whose worker already has a non-null FK and whose string is queued** keeps that FK: the raw column and `names_import_id` are overwritten as provenance, but the back-fill fills null FKs only, so the decision never moves that worker; the FK is corrected by the next import after the alias exists (the weekly file re-sends every member). This is the approved trade of §7 input 7 and it self-heals weekly (review A8).

**`import_logs` becomes one row per file, not one per batch.** The resolve route creates it; each apply batch runs
`UPDATE import_logs SET records_created = records_created + $c, records_updated = records_updated + $u, errors = concat_ws(E'\n', errors, $e) WHERE import_id = $id`
(replacing `worker-import/apply/route.ts:727-737` and `membership-import/apply/route.ts:464-475`). The Import History
tab reads totals, so a multi-batch file now shows one line; the `(batch i/n)` suffix (`:459-462`) goes.

#### 2.4.5 Contract between the two implementers

- Table and function shapes in §2.3.3–2.3.4 (Fable, in the migration; regenerated types expose `name_match_reviews` and `decide_name_match` args/returns).
- `POST /api/name-match-reviews/[id]/decide` (Fable): body `{ action, employer_id?, worksite_id?, create?, notes? }`; response `{ review, aliasWritten, backfilledWorkerIds, siblingsResolved, universeSyncError?: string }`; 401 unauthenticated, 403 non-admin, 409 with the RPC's message on unique-name or alias-ambiguity conflicts, 404 unknown id.
- `NAME_REVIEWS_PATH` from `src/lib/name-reviews/path.ts` (Fable creates in commit 1).
- Query key `["name-match-reviews"]` is Opus's; the wizards invalidate nothing (they link out).

### 2.5 Review-queue page (Opus)

- **Route:** `src/app/(dashboard)/name-reviews/page.tsx` at `/name-reviews`. Nav: `DEFS.name_reviews = { id: "name_reviews", label: "Name Reviews", href: "/name-reviews", icon: "clipboard-list", module: "administration" }` (icon key exists, `nav-icons.ts:60`) appended to `FULL_ADMIN_ITEMS` after `email_imports` (`nav-model.ts:263-267`); the admin block renders only for `isAdmin` (`nav-model.ts:354`). Organisers (`user`) reach the page by the wizard link; it is read-only for them.
- **Role coverage** mirrors upcoming projects: anyone authenticated may read (`baseline:28993` policy, mirrored §2.3.3); only admins decide (`is_admin()` in `confirm_upcoming_project_match`, `baseline:1523-1525`; the panel hides its buttons and shows "Match decisions can only be made by admins." for non-admins, `match-review-panel.tsx:189-193, 203-206, 338-340`; `isAdmin` from `useAuth()`, `upcoming-projects/page.tsx:71`, `auth-context.tsx:436`). Verification standard `ORCHESTRATION_PROMPT.md:119`: tested with the `user` account (§2.6.3, §4 row A8).
- **Listing:** filters `entity` (employer | worksite), `status` (default open = `needs_review` + `unmatched`; also `auto`, decided, all), `import` (from `import_logs`, newest first). Columns: raw name, occurrences, other raw name (from `source_context`), proposals (top-3 with score, principal badge), status, import (file name, date), decided by/at.
- **Per row:** (1) proposals with "Confirm" (action `confirm`, target = proposal id); (2) a search box over existing employers **and** their aliases (or worksites and theirs) — a hit via alias shows "alias of <canonical>" and maps to the canonical id — with "Map to this" (action `override`); (3) "Reject (not an employer/worksite)"; (4) **"Create new"** rendered only after the search box has been opened and either returned no rows for the typed text or the reviewer explicitly chose "none of these" (D5: search-and-map before create); it opens a dialog (employer: name prefilled with the raw string, trading name, category; worksite: name, `worksite_type` from `WORKSITE_TYPES` (`types/organising-row-types.ts:20-42`), offshore flag) and sends action `create`. Every decision goes through the decide route; the page shows the returned counts ("alias written · 37 worker rows updated · 2 duplicate queue rows resolved") and invalidates `["name-match-reviews"]`, `["employers-active"]`, `["worksites-all"]` (the wizards' query keys, `worker-import-wizard.tsx:573,641`).
- **Reopen** on decided rows (admin), with the note that the alias and back-fill stay.
- Empty state links to the two import wizards.

### 2.6 Tests

#### 2.6.1 Pure-function tests (Fable)

`packages/employer-matching` has no tests today; add `apps/organising-db/src/lib/import/__tests__/` files (the vitest include is `src/**/__tests__/**/*.test.ts`, `vitest.config.ts:20`):

1. `name-fold.test.ts` — the 12-string parity list (also used by the contract test).
2. `resolve-names.test.ts` — resolution order: rejected memory beats exact; exact beats alias beats fuzzy; case/space variants of a canonical name are `exact`, never `auto` (no alias written); an alias hit is `alias` with no proposals; a fuzzy ≥ 0.92 dominant → `auto` with `writesAlias` true; two proposals within 0.05 → `needs_review`; 0.65 boundary (0.649 → unmatched, 0.65 → needs_review); `proposals.length <= 3` and sorted; duplicate strings collapse; inactive rows: exact yes, fuzzy no; the ambiguous-alias case → `needs_review` with both rows; no outcome ever has a `resolvedId` absent from the reference set (the "never create" invariant as a property over a generated corpus).
3. `proposeNameMatch` parity — `packages/employer-matching` behaviour pinned from `apps/organising-db/src/lib/import/__tests__/employer-matching-parity.test.ts`: for a 30-name corpus of organisation names, `proposeEmployerMatch` before and after the refactor returns identical outcomes (the "before" outcomes captured as a fixture before the change lands; the scraper and rematch route depend on it).
4. `backfill-selection.test.ts` — a pure `selectBackfillRows(workers, review)` mirror of §2.3.4 step 5 used by the plan's documentation and the contract test: fills null FK + folded raw match + import in the sibling set; skips non-null FK, other raw, other import.
5. `replay-fixture.test.ts` — the harness of §3.4: loads `reference_*.json` and `variants.json`, runs `resolveNames`, asserts 0 `create`-class outcomes (structurally impossible; asserted anyway), prints and asserts the expected counts (`exact`, `alias`, `auto`, `needs_review`, `unmatched`) that §4 rows A3/A6 quote; then applies the "decisions" the fixture prescribes (each queued variant → its canonical) as aliases and asserts the second pass has 0 `needs_review` + `unmatched`.
6. Apply-route pure helpers: `accumulateImportLog()` patch builder; raw columns present on both patch shapes; `stripCampaignProtectedFields` still strips FKs but never the raw columns (`campaign-protected-fields.ts:44-58`).

#### 2.6.2 Route tests

The repository has no route-handler test pattern (`find src/app/api -path "*__tests__*"` returns nothing; the only tests
importing a route are `lib/hints/__tests__/help-manifest.test.ts` and `lib/actions/__tests__/hub-rows.test.ts`, which read
the route inventory, not handlers). Route behaviour is therefore proven by (i) the pure helpers above, (ii) the
contract suite on dev (§2.6.3), and (iii) the e2e replay on the dev-backed preview (§3.4). No new harness is invented.

#### 2.6.3 Contract suite on dev (`pnpm test:contract`, `vitest.contract.config.ts:19-20`; env `OUX_CONTRACT_*` per `campaign-families.contract.test.ts:10-19`)

`src/lib/import/__contract__/name-match-reviews.contract.test.ts` (Fable):

- `fold_name()` parity over the 12 strings via `select fold_name($1)`.
- `employer_name_aliases` accepts `source = 'import'` (insert as the admin account, then delete) — acceptance (a).
- As **admin**: seed one employer queue row with a synthetic raw name and two synthetic workers (raw set, FK null, `names_import_id` = a seeded `import_logs` row) through the service role; `decide_name_match` `override` → alias row exists, both workers filled, sibling resolved; `reopen`; `reject`; `create` with a name that already exists → error message; all seeded rows removed in `afterAll`.
- As **user** (`OUX_CONTRACT_USER_*`): `select` on `name_match_reviews` succeeds; `decide_name_match` raises "Only admins…"; `POST /api/import/resolve-names` is not exercised here (route needs the app; covered by e2e).
- Second-replay invariant at SQL level: after the decision, `resolveNames` over the same raw string against a freshly loaded reference set returns `alias`.

`src/lib/hooks/__contract__/name-match-reviews.contract.test.ts` (Opus): executes each PostgREST string of §2.6.4
against dev and asserts no PostgREST error (a `PGRST200` / parse error fails; an empty array passes).

#### 2.6.4 PostgREST strings introduced (each proven by §2.6.3 on dev, or by a read-only REST probe on dev with the contract user's JWT — the anon key cannot be used because `anon` is revoked on the new table)

| # | Where | String |
|---|---|---|
| P1 | `useNameMatchReviews` | `name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.<e>&status=in.(needs_review,unmatched)&order=created_at.desc` — three unhinted embeds; each FK is the only path from `name_match_reviews` to its target, so no `!hint` is needed (a hint is added only if the probe returns PGRST201) |
| P2 | `useNameEntitySearch` (employers) | `employers?select=employer_id,employer_name,trading_name,is_active&or=(employer_name.ilike.*<q>*,trading_name.ilike.*<q>*)&order=employer_name&limit=20` — an `.or()` filter |
| P3 | `useNameEntitySearch` (employer aliases) | `employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name)&alias_name=ilike.*<q>*&limit=20` |
| P4 | `useNameEntitySearch` (worksites) | `worksites?select=worksite_id,worksite_name,worksite_type,is_active&worksite_name=ilike.*<q>*&order=worksite_name&limit=20` |
| P5 | `useNameEntitySearch` (worksite aliases) | `worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name)&alias_name=ilike.*<q>*&limit=20` |
| P6 | import filter | `import_logs?select=import_id,file_name,import_type,imported_at&order=imported_at.desc&limit=100` |
| P7 | resolve route (server) | `employers?select=employer_id,employer_name,trading_name,employer_category,is_active`; `employer_name_aliases?select=employer_id,alias_name`; `worksites?select=worksite_id,worksite_name,is_active`; `worksite_name_aliases?select=worksite_id,alias_name`; `name_match_reviews?select=normalised_name&entity=eq.<e>&status=eq.rejected` — plain selects, listed for completeness |
| P8 | RPC | `rpc/decide_name_match` with `{ payload }` — exercised by the Fable contract test |

#### 2.6.5 Nav and UI tests (Opus)

- `nav-model.test.ts` snapshots 1, 7, 9 updated (`pnpm test -u` only for that file, diff reviewed: exactly one new row in the admin block, `state: "on"`); `nav-model-fixture.ts` gains the row wherever the admin block is fixtured; `nav-reachability.test.ts:303-322` list gains `/name-reviews`; `modules.test.ts` unchanged (no new module).
- Component tests for the page (jsdom, the repo's component test pattern): non-admin sees rows and no decision controls; admin sees proposals and search; "Create new" is absent until the search has been used; the create dialog posts `action: "create"`; a 409 from the decide route is shown verbatim.
- `help-manifest.test.ts` is unaffected (the route inventory grows; no glob depends on it).

### 2.7 Work split and commit order

| Commit | Owner | Contents |
|---|---|---|
| 1 | Fable | migration file; `scripts/data-hygiene/da0.3/{README,00,01,90,91,92}.sql`; `lib/name-reviews/path.ts`; package change + parity test; `name-fold.ts`, `resolve-names.ts` + unit tests; fixture builder, fixtures, replay harness test |
| 2 | Fable | resolve route, decide route; apply-route changes; both wizards; deletions (rows 1, 7, 8 of §2.1); contract test; regenerated types from dev |
| 3 | Opus | page, hooks, nav def, snapshot/fixture/reachability updates, component tests, hooks contract test |

Opus starts after commit 1 is on the branch (types and the path constant exist); Opus's hooks compile against the
regenerated types from commit 2, so commit 3 lands after commit 2. One commit per completed unit (`CLAUDE.md`).

---

## 3. Scripts — `scripts/data-hygiene/da0.3/`

`README.md` in the oux-wp3.8 style (`scripts/data-hygiene/oux-wp3.8/README.md`): never a migration, one file per
submission, `BEGIN;` + environment guard in mutating files, `SET LOCAL oux.env = 'production';` inserted by the
operator only, read-only `SELECT` after `COMMIT;`, run as `postgres`.

| File | Kind | Where |
|---|---|---|
| `00_preflight.sql` | read-only: counts and checksums — `count(*)` and `md5(string_agg(employer_id||':'||employer_name, ',' ORDER BY employer_id))` over `employers`, the same over `worksites`, alias counts by `source` and `max(id)` per alias table, `count(*) FILTER (WHERE employer_name_raw IS NOT NULL)` etc. on `workers` (0 before the package), `to_regclass('public.name_match_reviews')`, both `pg_get_constraintdef`s, `count(*)` of `name_match_reviews` by status when present | every environment, before and after every step |
| `01_export_reference_lists.sql` | read-only: `json_agg` of `employers (employer_id, employer_name, trading_name, employer_category, is_active)` + aliases, and `worksites (worksite_id, worksite_name, worksite_type, is_active)` + aliases — organisation strings only — pasted by the implementer into `fixtures/reference_employers.json` / `reference_worksites.json` with the export date | production (agent, D0 read-only) |
| `../../../supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` | **migration** (schema + two functions; no application row changed) | dev (operator/agent with approval) → clone (rehearsal) → production (operator) |
| `20_rehearse_decisions.sql` | mutating (clone only): inserts one `import_logs` row (`file_name 'DA0.3 rehearsal'`, `import_type 'membership_status_sync'`), 6 synthetic workers (`reference_id 'DA03-R-000001'…`, names `'Fixture'`/`'Person n'`, no email/phone, synthetic organisation strings derived from the first two active rows, FKs null except one worker whose employer is already set), 6 queue rows (four employer — one `needs_review` with a sibling row from no import, two `unmatched`; two worksite `needs_review`); calls `decide_name_match` for `override`, `confirm`, `create` (a synthetic `'DA0.3 Rehearsal Contractor'`) and `reject`; asserts alias rows, back-fill counts (which workers), sibling resolution, the created row; every insert/update logged to `public._oux_hygiene_log` (`oux-wp0.4/00_create_hygiene_log.sql:31-42` shape: `script 'da0.3/20'`, `action`, `table_name`, `row_pk`, `before_row`, `after_row`, `note`) — before/after rows carry organisation strings and ids only; `_oux_hygiene_log` exists on the clone (§1.4 ledger note) | clone. Run as `postgres` in the SQL editor, `auth.uid()` is null and `is_admin()` (`baseline:3638-3646`) returns false, so the file first sets the request claims for the transaction from the clone's own data, with no id written into the committed file: `SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM public.user_profiles WHERE role = 'admin' ORDER BY user_id LIMIT 1), 'role', 'authenticated')::text, true);` — `auth.uid()` reads that setting. A second block repeats one call with a `user`-role uid and asserts the "Only admins" exception (the gate is exercised on the clone as well as by the contract test on dev, §2.6.3) |
| `91_clear_da0_3_data.sql` | mutating: reverses `20` and any application replay: deletes `name_match_reviews` rows; nulls the three worker columns where set (logged, before values = the three columns and `worker_id`); deletes employer aliases with `source NOT IN ('merge','manual')` and worksite aliases with `source NOT IN ('manual','merge')` **and** `id > <max id recorded by 00>` (the 8 pre-existing `import` rows survive); deletes synthetic workers (`reference_id LIKE 'DA03-%'`), the rehearsal `import_logs` row and the rehearsal-created employer/worksite; all logged; stamps `20`'s log rows `rolled_back_at`. Precondition: exactly the state `20` (or the replay) leaves | clone (rehearsal), dev (after the e2e replay) |
| `90_rollback_da0_3_name_match_reviews.sql` | schema rollback, §2.3.7 | clone (rehearsal); recovery only elsewhere |
| `92_remove_fixture_workers.sql` | mutating (dev): deletes the synthetic e2e-replay workers (`reference_id LIKE 'DA03-%'`), their queue rows, aliases created by the replay (`created_by` = the e2e account, `source='import'`) and the replay's `import_logs` rows; logged | dev, after each replay |
| `fixtures/` + `build-fixture.ts` | §3.4 | committed (organisation strings only) |

### 3.1 Environment guard, preflight, post-assertions, rollback precondition

Every mutating file: the `oux-wp3.8/90_rollback…:19-38` guard verbatim; preflight = `00` pasted before; post-assertions in
a `DO` block that raises on mismatch; `91`'s precondition is the state `20`/the replay leaves (queue rows present, raw
columns set); `90`'s precondition is the state `91` leaves (no data in the new objects).

### 3.2 Clone rehearsal order (forward → back → forward)

`00` (before) → migration as one `BEGIN; … COMMIT;` submission + ledger row → `00` (after-forward-1: constraint text, table
present, raw columns 0) → replay harness test locally against `fixtures/` (numbers pasted) → `20` → `00` → `91` → `00`
(data cleared; `employers`/`worksites` checksums identical to before) → `90` → `00` (after-rollback: identical to
before, both CHECK strings equal the baseline) → migration + ledger row again → `00` (after-forward-2: identical to
after-forward-1) → `20` → `91` → leave the clone forward (DA0.3 applied) for Phase 0's remaining rehearsals. Migration
ledger repair between the two forward runs is the quoted `DELETE`, approved as its own statement.

### 3.3 Production run sheet (operator)

`00` → `BEGIN; SET LOCAL oux.env = 'production'; <migration>; <ledger row>; COMMIT;` + appended `SELECT` → `00` → merge
the PR → types regenerate → the next weekly batch is imported through the new path; `00` after it shows queue rows and
0 new employers/worksites since the run (Phase 0 exit criterion, `PROGRESS.md` "no new lineage-C rows after the next weekly membership batch"). No data run sheet: this package changes no existing row.

### 3.4 Replay fixture

Because the raw September strings are not recoverable (§1.4), the fixture is built deterministically by
`scripts/data-hygiene/da0.3/build-fixture.ts` (run with `pnpm tsx`, no database access) from:

1. `fixtures/reference_employers.json` and `fixtures/reference_worksites.json` — the production distinct `employer_name` (187) and `worksite_name` (194) values with trading names, categories, types, active flags and the 39 + 8 aliases, exported by `01` (organisation strings only, dated in the file).
2. `fixtures/variants.json` — the known lineage-C and duplicate variants from plan §1.2 lineage C and §1.3, each with its intended canonical (the value the reviewer will map it to in the rehearsal): employers `ugl`, `ATC`, `ATC Offshore`, `Siem Offshore`, `APA Group`, `MER Solutions: Port Hedland`, `IAS Group`, `Rigforce Pty Ltd`; worksites `Floatel triumph`, `Wheatstone LNG (Downstream)`, `Waitisa Gas Plant`, `Watsia gas plant Dongara onshore`, `Tubridigi`, `Jasmin`, `DPS1`, `Equinox`, `Inpex Endeavour CPF`; plus deliberate case/spacing/suffix variants generated from 20 canonical names: upper-cased, lower-cased, double-spaced, trailing tab, `Pty Ltd` appended/removed, and the membership system's `Employer : Employer: Site` shape (`membership-row-builder.ts:31-39`). Expected outcome per variant is computed by the harness, not typed in.
3. Synthetic person columns: `Reference ID` = `DA03-000001`…, `First Name` = `Fixture`, `Last Name` = `Person <n>`, `Member Account Status` cycling over the status-sync vocabulary, `Job Title` = `Fixture Trade`, `Phone` empty, `Email` = `da03-<n>@example.invalid`.
4. Output: `fixtures/replay_status_sync.xlsx` in the status-sync layout (`membership-import-types.ts:135-145`) with one row per (employer string × worksite string) pair drawn from the reference and variant lists, ≥ 2,000 rows so the batch loop (`APPLY_BATCH_SIZE 200`, `membership-import-wizard.tsx:240`) runs more than once; and `fixtures/expected.json` — the harness's counts.

Acceptance runs: (i) the harness (§2.6.1 item 5) against the production reference lists — the numbers the plan quotes;
(ii) the e2e replay through the real wizard on the dev-backed preview with the `E2E_USER_*` account (`PROGRESS.md`
standing note: previews are backed by dev): `00` before → import `replay_status_sync.xlsx` as `status_sync` → `00` after
(employers and worksites unchanged, queue rows = harness count for dev's reference set, workers with raw columns =
rows applied) → work the queue on the page per `variants.json` → import again → `00` (0 open queue rows, 0 new aliases
beyond the decisions, all replay workers now carry FKs) → `92`. The operator may swap in the real distinct strings (§5
input 3); the harness recomputes the expectations.

---

## 4. Acceptance evidence

| # | Criterion | Proof (command, query or checksum) |
|---|---|---|
| A1 | (a) CHECK admits `import`, `oa_universe`, `fwc` | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'employer_name_aliases_source_check'` on dev/clone/production after the migration contains all five values; contract test inserts and deletes a `source = 'import'` employer alias (§2.6.3) |
| A2 | (b) one path; three matchers and two client insert paths gone | from `apps/organising-db`: `rg -n "matchEmployerCandidates|scoreEmployer|insertOrReuse\(\"(employers|worksites)\"|worker-import/employers|worker-import/worksites" src` → 0 hits; `rg -n "matchWorksiteCandidates" src` → only `app/api/campaign-import/analyse/route.ts` and `app/api/reference-import/analyse/route.ts`; `rg -n "from\(\"(employers|worksites)\"\)\s*\.insert" src/app/api/worker-import src/app/api/membership-import src/app/api/import src/components/import` → 0 hits; `ls src/app/api/worker-import` shows no `employers/` or `worksites/`; `rg -n "AUTO_THRESHOLD|NAME_MATCH_THRESHOLDS" packages/employer-matching src/lib/import` shows the single source |
| A3 | (c) replay creates 0 employers / worksites and N queue rows | `00` before/after on dev around the e2e replay: `employers` and `worksites` `count(*)` and `md5` digests identical; `SELECT status, count(*) FROM name_match_reviews WHERE import_id = <replay import> GROUP BY 1` equals `fixtures/expected.json` (`needs_review` + `unmatched` = N, pasted) |
| A4 | (d) raw names persisted | `SELECT count(*) FROM workers WHERE names_import_id = <replay import> AND employer_name_raw IS NOT NULL AND worksite_name_raw IS NOT NULL` = `records_created + records_updated` of that `import_logs` row |
| A5 | (e) search-and-map before create | component test: "Create new" not rendered before a search; contract test: `override` writes the alias and back-fills; screenshot deferred per the local-environment standing note |
| A6 | every accepted match writes an alias | after the replay: `SELECT count(*) FROM employer_name_aliases WHERE source = 'import' AND created_at >= <replay start>` = harness `auto` count with `writesAlias` + accepted decisions; same for worksites; zero for `exact`/`alias` outcomes (harness asserts) |
| A7 | second replay yields 0 queue rows | after working the queue and re-importing: `SELECT count(*) FROM name_match_reviews WHERE status IN ('needs_review','unmatched')` = 0 and no new `auto` rows for the replay's second `import_id` |
| A8 | role coverage | contract test as `OUX_CONTRACT_USER_*`: select allowed, `decide_name_match` raises, `POST …/decide` → 403 (via the preview) |
| A9 | back-fill precision | contract test: the two seeded workers filled, a third with a non-null FK and a fourth with another raw string untouched; `backfilled_worker_ids` lists exactly two |
| A10 | weekly update unchanged per kind | `lib/membership-updates/__tests__/kinds.test.ts` and `parse-files.test.ts` untouched and green; `git diff --stat -- src/lib/membership-updates` empty |
| A11 | scraper parity | §2.6.1 item 3 green; `git diff --stat -- apps/scraper` empty |
| A12 | quality gates | `pnpm lint` total ≤ 298 with touched files clean; `pnpm test` green (baseline 632 passing per the UX ledger, plus the new files); `pnpm build` green; root `pnpm validate:migrations` green; `pnpm test:contract` on dev green |
| A13 | rehearsal | §3.2 sequence pasted in §9 with `00` outputs at each stage; after-rollback identical to before; after-forward-2 identical to after-forward-1 |
| A14 | views unchanged | `SELECT pg_get_viewdef('public.workers_view'::regclass)` identical before/after on dev; `organising_universe_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary` likewise (`ORCHESTRATION_PROMPT.md:132`) |

---

## 5. Operator inputs

| # | Input | Tied to |
|---|---|---|
| 1 | Confirm the wizards become **read-only** for names (outcomes shown; decisions only on the Name Reviews page) rather than keeping an in-wizard "pick a proposal" step. Recommendation: read-only — one decision surface, D5's search-before-create enforced in one place; an in-wizard confirm can be added in DA4.2 through the same decide route | §2.4.4, §2.5 |
| 2 | Confirm nav placement: a "Name Reviews" row in the admin block (`/name-reviews`), read-only for `user`-role organisers who reach it from the wizard link | §2.5 |
| 3 | Optional: the distinct raw employer and worksite strings from the 23 September status-sync files (or the files themselves, from which the implementer extracts the two distinct columns only) to replace `variants.json`; otherwise the synthetic fixture stands | §3.4 |
| 4 | Approval to apply the migration to normal dev (per file, via the connector or by hand) and of the clone rehearsal order in §3.2, noting that no prerequisite migration is applied to the clone | §2.3.6, §3.2 |
| 5 | Disposition of the third import path (`api/campaign-import/apply`, §2.1 row 20), which still creates employers and worksites: include here (widening) or assign to DA4.2 (recommended; recorded as an incidental finding in the ledger) | §2.1 |
| 6 | Keep or strike the one-line widening of `worksite_name_aliases_source_check` (§2.3.1) | §2.3.1 |
| 7 | Confirm the back-fill fills a null FK on a worker in a protecting campaign (nothing overwritten) — or exclude protected workers from the back-fill | §2.3.4 step 5, R1 |
| 8 | Confirm sticky `rejected`: a rejected string is not re-queued on later imports (reopen available) | §2.3.3 |
| 9 | Confirm `import_logs` becomes one row per file (accumulated across batches) instead of one per batch | §2.4.4 |

---

## 6. Risks

| # | Risk | Safeguard |
|---|---|---|
| R1 | Campaign-protected fields (`lib/workers/campaign-protected-fields.ts:18-22`): a back-fill or an import write could overwrite an organiser's employer/worksite | Imports keep the strip (`worker-import/apply:580-585`, `membership-import/apply:363-366`); the raw columns are written outside it; the back-fill touches null FKs only (§2.3.4 step 5, A9). DA4.2 reconciles the rule with canonicalisation |
| R2 | The reference wizard's employer aliases start saving after (a): its 0.75 clustering (`reference-import/cluster`) could persist wrong aliases as `import` | The wizard is admin-run and off the worker path; the decision function's ambiguity guard refuses a second target for a folded alias; recommend the operator does not run the reference wizard until DA1.1's adjudication lands (note in the README); DA1.4's unique index makes it structural |
| R3 | Weekly update: a queued name leaves a `new` member with a null employer until the queue is worked; an updated member who already carries an FK and whose string is queued keeps the old FK until the next import after the decision | The wizard shows the queued count and link; the Phase 0 exit checks the queue after the next batch; the back-fill completes null-FK rows on decision and never overwrites a non-null FK (§7 input 7); the next weekly file re-resolves the string through the alias (self-heals weekly, review A8); membership status is never delayed (§2.4.4) |
| R4 | Performance of resolution for a 5,000-row file | Distinct strings only; reference loaded once; fuzzy only on map misses; unit benchmark in `resolve-names.test.ts` asserts 500 distinct names × 200 candidates resolve in < 2 s on the CI runner; the route has `maxDuration` as the apply routes do (`worker-import/apply/route.ts:25`, `membership-import/apply/route.ts:32`) |
| R5 | `Unknown`, `Unemployed`, `Nopsema` and similar exist as **employer rows** today (plan §1.2 "Not employers"), so an exact hit maps workers to them exactly as today | Unchanged behaviour, out of scope; DA1.1's adjudication retires them; the sticky `rejected` status is available once they are gone |
| R6 | Aliases are unique per employer only (`baseline:20321`), so two rows could carry the same alias before DA1.4 | Resolver returns `needs_review` for an ambiguous alias; the decision function refuses to create the second (§2.3.4 step 3); 0 conflicts today |
| R7 | A wrong `auto` accept (≥ 0.92) writes an alias that `reopen` does not remove | `auto` rows are visible on the page (filter `auto`); an admin deletes the alias through the existing delete policy; DA1.4's replay re-checks every alias |
| R8 | `import_logs` semantics change (one row per file) surprises the Import History tab or a report | Totals accumulate; the tab reads totals; verified on the preview; operator input 9 |
| R9 | Types regenerated from production before the migration is applied there (promotion gate) | Types regenerated from dev/clone with the explicit ref; PR merged only after the operator's production run sheet |
| R10 | PostgREST strings P1–P5 fail only on a real PostgREST | Contract tests on dev before merge; hints added only on a PGRST201 |
| R11 | Rehearsal cannot run the app against the clone (never wired to Vercel) | SQL-level rehearsal of the migration and the decision effects on the clone (§3.2, `20`), pure harness against production reference lists, end-to-end replay on dev (§3.4) — stated in §4 A3/A13 so the verifier does not expect an app run against the clone |
| R12 | The worker wizard's cross-employer worksite guard (`worker-import-wizard.tsx:1293-1315`) disappears | A worksite that belongs to another employer now resolves by name like any other; the outcome table shows the matched worksite so the importer sees it; DA1.2's engagement grain is the real fix |
| R13 | Synthetic fixture workers left on dev | `92` after every replay; `reference_id LIKE 'DA03-%'` is the only key; the e2e account owns the rows |

---

## 7. Approval

**Approved by the orchestrator, 2026-09-22**, against the §5 row, D5, Q-S10 and the rules. The nine operator inputs in §5
are decided as follows for implementation; each is put to the operator in the Phase 0 hand-over and any reversal is a
fix round, not a re-plan:

| § 5 input | Decision for implementation |
|---|---|
| 1 | Wizards are read-only for names; decisions only on the Name Reviews page (recommendation adopted) |
| 2 | Admin-block nav row `/name-reviews`; read-only for `user`-role organisers via the wizard link |
| 3 | The synthetic fixture stands; the operator may substitute the real distinct strings later |
| 4 | The migration is applied to normal dev by the Fable implementer through the connector as one `BEGIN; … COMMIT;` submission plus the ledger row (the WP2.2 dev mechanism), because this session was told to proceed to implementation; the clone rehearsal follows §3.2 under the verifier. Both are recorded in the ledger as mutations made under that instruction |
| 5 | The third import path (`api/campaign-import/apply`) is **not** widened into this package; recorded as an incidental finding assigned to DA4.2 |
| 6 | Keep the one-line widening of `worksite_name_aliases_source_check` (one vocabulary for both alias tables) |
| 7 | The back-fill fills a null FK on a worker in a protecting campaign; nothing non-null is overwritten |
| 8 | `rejected` is sticky; `reopen` is available |
| 9 | `import_logs` becomes one row per file, accumulated across batches |

Further conditions:

- **Commits:** the implementers do not commit; the orchestrator makes one commit for the package when review closes
  (`CLAUDE.md`: one commit per completed feature). The §2.7 commit split is the work order, not the commit history.
- **Types:** `pnpm gen:types` is a `supabase` CLI command that needs an access token this environment does not hold.
  The implementer adds the new objects to `packages/db-types/generated.ts` by hand in the generator's exact format
  (table, function args/returns, the three `workers` columns) so `tsc` and the build prove the shapes; recorded as a
  deviation; the operator's post-merge regeneration from production (gen-types workflow) is expected to produce no
  further diff.
- **PostgREST proof:** the contract suite needs `OUX_CONTRACT_*` accounts that this environment does not hold. Strings
  P1–P6 and P8 are proven on dev by read-only REST probes with the anon key after the migration is on dev (a parse error
  such as PGRST200/PGRST201 is a failure; a permission or empty result is a pass), per the standing rule. The contract
  tests are still written and left for the operator's environment.
- **The e2e replay through the real wizard on the dev-backed preview** (A3, A4, A6, A7) needs the `E2E_USER_*`
  credentials this environment does not hold; the harness run (§2.6.1 item 5) against the production reference lists
  and the SQL-level rehearsal on the clone (`20`) are the evidence this session produces, and the preview replay is a
  human task in the ledger before the production run sheet.

## 8. Deviations from plan

Kept by the Fable implementer (commits 1–2 of §2.7). Each with its justification.

| # | Deviation | Justification |
|---|---|---|
| D1 | `packages/db-types/generated.ts` edited by hand (table `name_match_reviews` with Row/Insert/Update/Relationships, functions `decide_name_match` and `fold_name`, the three `workers` columns and the `workers_names_import_id_fkey` relationship) instead of `pnpm gen:types` | §7 "Types": the CLI needs an access token this environment does not hold. Format copied from the generator's rendering of `upcoming_project_employers` / `confirm_upcoming_project_match`; `tsc` and `pnpm build` pass against it (§9). The operator's post-merge regeneration is expected to produce no further diff |
| D2 | `fold_name()` is `lower(btrim(regexp_replace(p, '\s+', ' ', 'g')))` — collapse first, then trim — and `foldName` is `s.replace(/\s+/g, " ").trim().toLowerCase()` | §2.3.2 wrote trim → collapse → lower. Postgres `btrim` strips spaces only, so a trailing tab would survive `btrim` and then become a trailing space; collapsing first makes the two implementations byte-identical for every whitespace run. Parity proven over the 12 strings by the unit test (§9) and by the anon `rpc/fold_name` probe; the contract test re-proves it against the database |
| D3 | The alias write in `decide_name_match()` uses `INSERT … SELECT … WHERE NOT EXISTS` on `(fk, lower(btrim(alias_name)))` rather than `ON CONFLICT … DO NOTHING` naming the expression index | Same semantics under the row lock the function holds; avoids depending on Postgres inferring the `TRIM(BOTH FROM …)` index expression. `alias_written` comes from `ROW_COUNT` |
| D4 | `uq_name_match_reviews_import_entity_norm` is a plain (non-partial) unique index on `(import_id, entity, normalised_name)` | PostgREST's `on_conflict` cannot name a partial index predicate, and the resolver upserts through PostgREST. NULL `import_id`s never collide (`NULLS DISTINCT`), so the semantics equal the planned `WHERE import_id IS NOT NULL` |
| D5 | `import_logs` accumulation is a read-merge-write (`accumulateImportLog`, pure `mergeImportLogTotals`) rather than one `UPDATE … SET records_created = records_created + $c` | supabase-js `.update()` cannot express a column expression and no RPC was planned; batches arrive one at a time from one wizard so the read-then-write is race-free in practice. Both apply routes keep a fallback `insert` when no `importId` is supplied (a caller that skipped the resolve call still logs) |
| D6 | The rollback `90` compares the **admitted values** of both alias CHECKs (regexp over `pg_get_constraintdef`) instead of the exact baseline text | `pg_get_constraintdef` renders the same constraint as `ARRAY['merge'::character varying, …]::text[]` on production and as `ARRAY[('merge'::character varying)::text, …]` on dev (§11 `00` before): the text differs by Postgres version, the vocabulary does not. The constraint is still re-created verbatim from the baseline text |
| D7 | `91` requires `SET LOCAL da03.ws_alias_max_id_before = '<n>'` in its submission | §3 said "id > <max id recorded by 00>"; a committed file cannot know that number, so it is supplied per run and the file STOPs without it (it never guesses which pre-existing `import` worksite aliases to keep) |
| D8 | `decide_name_match`'s `create` also writes the alias for the raw string when it differs from the created name; `reopen` clears `match_method` only when it was `manual` / `created`; `confirm` falls back to `resolved_*` when no target id is sent | Plan §5 row: "every accepted match writes an alias" — a created row named differently from the raw string would otherwise queue the string again. The other two are unstated details of §2.3.4 chosen for consistency with `confirm_upcoming_project_match` |
| D9 | The worker wizard's `handleFile` no longer depends on the worksite list (`[preferredFormat]`); both wizards drop their `employers-active` / `worksites-all` queries where the single path made them unused; the wall-chart characterization snapshots lost the two query keys the worker wizard no longer registers (`worksites-all`, `employer-worksite-roles-current`) — 15 snapshots updated with `-u`, diff reviewed: only those two lines removed | Consequence of §2.1 rows 4–7; the worker wizard's `employer_selection` picker keeps its `employers-active` query |
| D10 | The fixture harness records the reference's own fold collisions (`floatel triumph` is two worksite rows, 240 and 261) and asserts the second replay queues **only** those and 0 variants, rather than 0 rows outright | A string carried by two reference rows cannot be decided by an alias (the resolver sends it to review by the dominance gap, §2.4.2 step 2); DA1.1 retires the duplicate. `secondPassQueuedFromVariants = 0` is the invariant the plan means |
| D11 | `20` impersonates the admin through `set_config('request.jwt.claims', …)` and, on dev, was rehearsed **inside a rolled-back transaction** | The clone is read-only for the implementer; the SQL-level rehearsal on dev proves the file runs end to end (§11) without leaving rows; the verifier runs it on the clone per §3.2 |
| D20 | (advisory round) The migration revokes ALL on `name_match_reviews` from `authenticated` as well as from PUBLIC / anon before granting SELECT, and the identity sequence likewise; tighter than §2.3.3's text and than the 20260918/20260921 convention | Review A2: the baseline's default privileges had granted `authenticated` ALL (incl. TRUNCATE, outside RLS). The file was on dev only, so it was corrected in place after a `90` rollback and re-applied (§11); md5 now `37b35a78a312e75fda84aeadc016bd1a` |
| D21 | (advisory round) `confirm` asserts the target id is one of `candidate_proposals` (else `target … is not one of the proposals; use override`); `POST /api/import/resolve-names` fails closed with 400 on any folded string over 200 characters before writing anything, and on a later failure deletes the queue rows and the `import_logs` row it created (queue upsert now precedes the alias writes; aliases already written are idempotent facts and stay); the decide route maps a missing **review** to 404 and a missing target / non-proposal target / already-decided row to 409; a failed `import_logs` accumulation is returned in a `warnings` field, the batch stays `success: true` | Review A5, A6, A9, A10 |
| D22 | (round 2) Four helper modules inside Fable's boundary are not named in §2.2: `src/lib/import/resolve-names-client.ts` (the wizards' call to the route, distinct-name inputs, fold lookups), `resolve-names-types.ts` (the route ↔ wizard shapes without database imports), `import-log.ts` (`mergeImportLogTotals`, `rawNameColumns`, `accumulateImportLog`) and `src/components/import/name-resolution-table.tsx` (the read-only outcome table and the Name Reviews link both wizards render) | Extracted so the two wizards share one implementation of §2.4.4 instead of two copies; consumed only by the files §2.2 names; reviewed in rounds 1 and 2 (finding 7) |
| D12 | The lineage-C strings in `variants.json` (`ugl`, `ATC`, `Siem Offshore`, …) resolve `exact` against today's reference because each already exists as its own production row | Risk R5: unchanged behaviour by design; the fixture keeps them with their intended canonical so the harness recomputes when DA1.1 retires the rows |

Added by the Opus implementer (commit 3 of §2.7):

| # | Deviation | Justification |
|---|---|---|
| D13 | One PostgREST string beyond P1–P6: **P9** `user_profiles?select=user_id,display_name&user_id=in.(<uuids>)` (`nameReviewDecidersQuery`, `useNameReviewDeciders`) for the "decided by" column | §2.5 lists "decided by/at"; `decided_by` references `auth.users`, which PostgREST cannot embed. `user_profiles` is readable by every authenticated user (`baseline:27205`). Probed on dev (§9 "Opus half") |
| D14 | P1 is emitted in the planned shape plus its filter variants: `status=in.(auto)` (Auto-matched), `status=in.(confirmed,overridden,rejected)` (Decided), no status filter (All), and `&import_id=eq.<id>` when an import is chosen | §2.5 listing filters; each variant probed (16 combinations) |
| D15 | Search text is sanitised before it reaches P2–P5: `,` `(` `)` `"` `\` become `_` (a one-character `ilike` wildcard), so `or=(…)` never needs a quoting layer and "Acme (WA), Pty" still finds itself; the reviewer's own `*` `%` `_` stay wildcards (only widens the search) | The `or=(…)` grammar reserves those characters; probed with `Acme (WA), Pty. Ltd` and `Acme "Marine"\x` → HTTP 200 on every string |
| D16 | The search box opens **empty** (not seeded with the raw string, unlike `match-review-panel.tsx`'s organisation seed) and "Create new" requires a settled empty result **for the text currently typed** (≥ 2 characters) or "None of these" (reset whenever the text changes) | D5: "search-and-map before create" — a seeded search that happens to return nothing would offer Create without the reviewer ever searching |
| D17 | Nav snapshots updated were cases **1 and 9** only; the plan named 1, 7, 9 | Case 7 is a `user`-role model; the admin block renders only for `isAdmin` (`nav-model.ts` `buildNavModel`), so case 7 has no admin block and did not change. `nav-reachability.test.ts` also needed its "12 + 3 rows" title and its "only differences from the pre-WP1.5 sidebar" test to list `name_reviews` as an added row (placed directly after `email_imports`); `TODAY_SIDEBAR_ROWS` is untouched |
| D18 | The page's component tests fake the Supabase client and `fetch` inline rather than using the wall-chart harness | The wall-chart harness is shaped for that tree (its fixture, backend and query-settle guarantees); a 40-line chainable recorder keeps the page's hooks and React Query running for real |
| D19 | `src/components/layout/header.tsx` (outside the §2.2 Opus boundary) gains `"/name-reviews": "Name Reviews"` after `"/email-imports"` in `pageTitles` | Authorised by the orchestrator: without it the header falls back to "Offshore Alliance" on the page (`header.tsx` `pageTitles[basePath] || …`); nobody else owns the file. One map entry, no behaviour change elsewhere |
| D23 | Rows with status `auto` offer only **Confirm** of the auto-matched target and **Reject**, with the note "The alias was already written on import. Re-pointing an alias to a different employer/worksite is handled later (DA1.4)"; no other-proposal Confirm, no search / "Map to this", no Create new. Alias search hits now carry the canonical row's `is_active` (P3/P5 embed it) instead of a hard-coded `true` | Round-2 review advisories #2 and #5: mapping an auto row elsewhere would hit `decide_name_match()`'s ambiguity guard (409) because the auto alias already points at the first target; an alias of an inactive row must show "Inactive" like a direct hit |

## 9. Verification record

Fable implementer, 2026-09-22/23, from `apps/organising-db` unless stated. Raw outputs pasted; nothing typed in.

**`pnpm exec tsc --noEmit -p tsconfig.json`** → exit 0, no output.

**`pnpm lint`** (baseline before this package: `✖ 298 problems (145 errors, 153 warnings)`) → after: `✖ 298 problems (145 errors, 153 warnings)`. Every new file is clean; the two wizards' remaining warnings are the pre-existing baseline ones (`API_FETCH_TIMEOUT_LLM_MS`, `detectedHeaders`, `options` in `worker-import-wizard.tsx`); one pre-existing warning was removed with the deleted code, one new-file warning (`EmployerWorksiteRole` unused) was fixed.

**`pnpm test`** → `Test Files 3 failed | 140 passed (143)`, `Tests 16 failed | 1915 passed (1931)`: 15 failures were the wall-chart characterization snapshots (diff: only `["worksites-all"]` and `["employer-worksite-roles-current"]` removed, D9), updated with `vitest run -u` on those two files → `Snapshots 15 updated · Tests 17 passed (17)`; the remaining 1 is the known `wall-chart.render-cost` timing failure. New DA0.3 files all green: `name-fold` 16, `resolve-names` 20 (incl. the R4 benchmark: 500 names × 200 candidates in 874 ms), `employer-matching-parity` 33 (30-query pre-refactor corpus byte-identical), `backfill-selection` 4, `import-log` 6, `replay-fixture` 7. Deleted: `employer-match.test.ts` (5).

**`pnpm build`** → `✓ Compiled successfully in 65s`, exit 0. **Root `pnpm validate:migrations`** → `Validated 18 Supabase migrations with unique 14-digit versions.`

**A2 greps** (from `apps/organising-db`): `rg -n "matchEmployerCandidates|scoreEmployer|insertOrReuse\(\"(employers|worksites)\"|worker-import/employers|worker-import/worksites" src` → 0 hits; `rg -n "matchWorksiteCandidates" src -l` → `src/lib/utils/worksite-fuzzy.ts`, `src/app/api/reference-import/analyse/route.ts`, `src/app/api/campaign-import/analyse/route.ts` (rows 20–21 only); `rg -n "from\(\"(employers|worksites)\"\)\s*\.insert" src/app/api/worker-import src/app/api/membership-import src/app/api/import src/components/import` → 0 hits; `ls src/app/api/worker-import` → `apply organising-units parse`; `AUTO_THRESHOLD` is defined once (`packages/employer-matching/src/match.ts:57`) and consumed through `NAME_MATCH_THRESHOLDS` (`src/lib/import/resolve-names.ts`). **A10/A11**: `git diff --stat -- src/lib/membership-updates apps/scraper` → empty.

**Harness counts (A3 / A6 / A7, `fixtures/expected.json`, production reference of 2026-09-22 06:16 UTC: 187 employers / 39 aliases, 194 worksites / 8 aliases):** file 2,400 rows; distinct employer strings 232 → first pass `exact 187, alias 0, auto 39, needs_review 5, unmatched 1, rejected 0` (queued **6**, auto aliases 39); distinct worksite strings 214 → `exact 192, alias 0, auto 19, needs_review 3, unmatched 0` (queued **3**, auto aliases 19). **N = 9 queue rows, 0 employers / worksites created.** Decisions prescribed: employers `BW Pty Ltd`, `BW: Site` → 1 BW; `Santos Pty Ltd` → 692; `Modec Pty Ltd` → 703; `Steel Diamond Pty Ltd`, `Steel Diamond: Site` → 748; worksites `Wandoo A Pty Ltd` → 142, `Alkimos seawater alliance Pty Ltd` → 180 (and `Floatel triumph` is the reference's own collision, rows 240/261). Second pass: employers `exact 187, alias 45, auto 0, needs_review 0, unmatched 0`; worksites `exact 192, alias 21, auto 0, needs_review 1 (the 240/261 collision), unmatched 0`; **queued from variants 0** (D10).

**PostgREST probes on dev (anon key, `curl`, 2026-09-22 07:06 UTC; status + message only):**

| String | Result |
|---|---|
| P1 `name_match_reviews?select=…,import_logs(…),employers(…),worksites(…)&entity=eq.employer&status=in.(needs_review,unmatched)&order=created_at.desc` | HTTP 401 `{"code":"42501","message":"permission denied for table name_match_reviews"}` — pass (permission denied, not PGRST200/201: the three embeds parsed) |
| P2 `employers?select=employer_id,employer_name,trading_name,is_active&or=(employer_name.ilike.*zzq*,trading_name.ilike.*zzq*)&order=employer_name&limit=20` | HTTP 200 `[]` — pass |
| P3 `employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name)&alias_name=ilike.*zzq*&limit=20` | HTTP 200 `[]` — pass |
| P4 `worksites?select=worksite_id,worksite_name,worksite_type,is_active&worksite_name=ilike.*zzq*&order=worksite_name&limit=20` | HTTP 200 `[]` — pass |
| P5 `worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name)&alias_name=ilike.*zzq*&limit=20` | HTTP 200 `[]` — pass |
| P6 `import_logs?select=import_id,file_name,import_type,imported_at&order=imported_at.desc&limit=100` | HTTP 200 `[]` — pass |
| P7 `employers?select=employer_id,employer_name,trading_name,employer_category,is_active`; `name_match_reviews?select=normalised_name&entity=eq.employer&status=eq.rejected` | HTTP 200 `[]`; HTTP 401 `42501` — pass (server-side selects run with the service role) |
| P8 `POST rpc/decide_name_match` `{"payload":{}}` | HTTP 401 `{"code":"42501","message":"permission denied for function decide_name_match"}` — pass (the function exists; anon is revoked; the admin gate is inside) |
| `POST rpc/fold_name` `{"p":"  Woodside\tEnergy  "}` | HTTP 200 `"woodside energy"` — parity with `foldName` |

**Advisory round (2026-09-23, after A2/A5/A6/A7/A9/A10):** `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0; `eslint` over every DA0.3 file, both apply routes, both wizards and the contract test → `✖ 3 problems (0 errors, 3 warnings)` — the three pre-existing baseline warnings in `worker-import-wizard.tsx` (`API_FETCH_TIMEOUT_LLM_MS`, `detectedHeaders`, `options`); `pnpm exec vitest run src/lib/import/__tests__` → `Test Files 8 passed (8) · Tests 108 passed (108)`; root `pnpm validate:migrations` → `Validated 18 Supabase migrations with unique 14-digit versions.`; migration md5 `37b35a78a312e75fda84aeadc016bd1a`. Full `pnpm lint` after the round → `✖ 298 problems (145 errors, 153 warnings)` (= baseline). Dev re-probed after the re-apply: P1 → HTTP 401 `42501 permission denied for table name_match_reviews`; P8 → HTTP 401 `42501 permission denied for function decide_name_match` (unchanged, pasted below the §11 record). Catalog after the re-apply: `authenticated` table privileges on `name_match_reviews` = `SELECT` only, `anon` none, `has_sequence_privilege(authenticated, …, USAGE)` = false, `service_role` = true.

**Round 2 (2026-09-24, after findings 1/4/6):** `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0; `eslint src/app/api/import/resolve-names/route.ts src/app/api/name-match-reviews/[id]/decide/route.ts` → exit 0, 0 problems; `pnpm exec vitest run src/lib/import/__tests__` → `Test Files 8 passed (8) · Tests 108 passed (108)`.

No hint was needed on any embed. **Contract suite** (`src/lib/import/__contract__/name-match-reviews.contract.test.ts`, 16 tests incl. the A6 confirm-refusal case) written and left for the operator's `OUX_CONTRACT_*` shell (§7). **E2e replay** through the wizard (A3/A4/A6/A7 on the preview) is the human task in the ledger (§7).

### Opus half

Opus implementer, 2026-09-23, from `apps/organising-db`. Raw outputs pasted; nothing typed in.

**`pnpm exec tsc --noEmit -p tsconfig.json`** → exit 0, no output.

**`pnpm lint`** → `✖ 298 problems (145 errors, 153 warnings)` (baseline 298, unchanged). Own files:
`pnpm exec eslint "src/app/(dashboard)/name-reviews" src/lib/hooks/useNameMatchReviews.ts src/lib/hooks/useNameEntitySearch.ts src/lib/hooks/useDecideNameMatch.ts src/lib/hooks/__contract__ src/lib/nav` → no output, `own files exit 0`.

**Nav snapshots.** `pnpm exec vitest run src/lib/nav` before `-u` → `Snapshots 2 failed`, `Tests 2 failed | 33 passed (35)` (cases 1 and 9; the fixture and reachability tests already carried the new row). `pnpm exec vitest run -u src/lib/nav/__tests__/nav-model.test.ts` → `Snapshots 2 updated`, `Tests 13 passed (13)`. Snapshot diff reviewed: `+16` lines, exactly one new admin row in each of the two admin blocks:

```
+    {
+      "href": "/name-reviews",
+      "icon": "clipboard-list",
+      "id": "name_reviews",
+      "label": "Name Reviews",
+      "module": "administration",
+      "state": "on",
+    },
```

**Page tests** `src/app/(dashboard)/name-reviews/__tests__/name-reviews-page.test.tsx` → `Tests 13 passed (13)`. Mutation check: forcing `canCreate = true` in `entity-search.tsx` fails 3 of them ("no Create new before searching", "only after the search returned no rows", "after an explicit None of these"); reverted.

**`pnpm test`** → `Test Files 1 failed | 143 passed (144)`, `Tests 1 failed | 1943 passed (1944)`; the one failure is the known `wall-chart.render-cost.test.tsx > renders 305 members across 161 units within budget` timing test.

**`pnpm build`** → `✓ Compiled successfully in 38.1s`, route `├ ƒ /name-reviews`, exit 0.

**Hooks contract suite** `src/lib/hooks/__contract__/name-match-reviews.contract.test.ts` (P1 × 16 filter combinations, P2–P5 × 3 search strings, P6, P9, as the `user` and the admin account) written and left for the operator's `OUX_CONTRACT_*` shell (§7). Without the variables it throws as designed: `Error: DA0.3 hooks contract suite: missing OUX_CONTRACT_SUPABASE_URL, …`.

**PostgREST probes on dev** (anon key, 2026-09-23; each string produced by the page's own exported query builders through supabase-js with a URL-recording `fetch`, run once with `tsx` and the probe file removed; key not written to any file). Pass rule per §7: a PGRST200/201 or parse error fails; 401/42501 or `[]` passes. Every line passes; no embed needed a hint. P8 is the decide route's RPC (server side, Fable, §9 above); the page only POSTs to `/api/name-match-reviews/[id]/decide`.

```
P1 employer/open/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(needs_review,unmatched)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/open/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(needs_review,unmatched)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/auto/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(auto)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/auto/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(auto)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/decided/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(confirmed,overridden,rejected)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/decided/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&status=in.(confirmed,overridden,rejected)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/all/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 employer/all/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.employer&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/open/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(needs_review,unmatched)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/open/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(needs_review,unmatched)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/auto/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(auto)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/auto/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(auto)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/decided/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(confirmed,overridden,rejected)&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/decided/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&status=in.(confirmed,overridden,rejected)&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/all/null | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P1 worksite/all/1 | /rest/v1/name_match_reviews?select=id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals,resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at,import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)&entity=eq.worksite&import_id=eq.1&order=created_at.desc | HTTP 401 | 42501 permission denied for table name_match_reviews
P2 zzq-da03 | /rest/v1/employers?select=employer_id,employer_name,trading_name,is_active&or=(employer_name.ilike.*zzq-da03*,trading_name.ilike.*zzq-da03*)&order=employer_name.asc&limit=20 | HTTP 200 | []
P3 zzq-da03 | /rest/v1/employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name)&alias_name=ilike.*zzq-da03*&limit=20 | HTTP 200 | []
P4 zzq-da03 | /rest/v1/worksites?select=worksite_id,worksite_name,worksite_type,is_active&worksite_name=ilike.*zzq-da03*&order=worksite_name.asc&limit=20 | HTTP 200 | []
P5 zzq-da03 | /rest/v1/worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name)&alias_name=ilike.*zzq-da03*&limit=20 | HTTP 200 | []
P2 Acme (WA), Pty. Ltd | /rest/v1/employers?select=employer_id,employer_name,trading_name,is_active&or=(employer_name.ilike.*Acme+_WA__+Pty.+Ltd*,trading_name.ilike.*Acme+_WA__+Pty.+Ltd*)&order=employer_name.asc&limit=20 | HTTP 200 | []
P3 Acme (WA), Pty. Ltd | /rest/v1/employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name)&alias_name=ilike.*Acme+_WA__+Pty.+Ltd*&limit=20 | HTTP 200 | []
P4 Acme (WA), Pty. Ltd | /rest/v1/worksites?select=worksite_id,worksite_name,worksite_type,is_active&worksite_name=ilike.*Acme+_WA__+Pty.+Ltd*&order=worksite_name.asc&limit=20 | HTTP 200 | []
P5 Acme (WA), Pty. Ltd | /rest/v1/worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name)&alias_name=ilike.*Acme+_WA__+Pty.+Ltd*&limit=20 | HTTP 200 | []
P2 Acme "Marine"\x | /rest/v1/employers?select=employer_id,employer_name,trading_name,is_active&or=(employer_name.ilike.*Acme+_Marine__x*,trading_name.ilike.*Acme+_Marine__x*)&order=employer_name.asc&limit=20 | HTTP 200 | []
P3 Acme "Marine"\x | /rest/v1/employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name)&alias_name=ilike.*Acme+_Marine__x*&limit=20 | HTTP 200 | []
P4 Acme "Marine"\x | /rest/v1/worksites?select=worksite_id,worksite_name,worksite_type,is_active&worksite_name=ilike.*Acme+_Marine__x*&order=worksite_name.asc&limit=20 | HTTP 200 | []
P5 Acme "Marine"\x | /rest/v1/worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name)&alias_name=ilike.*Acme+_Marine__x*&limit=20 | HTTP 200 | []
P6 | /rest/v1/import_logs?select=import_id,file_name,import_type,imported_at&order=imported_at.desc&limit=100 | HTTP 200 | []
P9 | /rest/v1/user_profiles?select=user_id,display_name&user_id=in.(00000000-0000-0000-0000-000000000000) | HTTP 200 | []
```

**Round 2 (review advisories #2, #5), 2026-09-23.** P3 and P5 now embed the parent's `is_active`; re-probed on dev with the anon key (same builders, same method):

```
P3 zzq-da03 | /rest/v1/employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name,is_active)&alias_name=ilike.*zzq-da03*&limit=20 | HTTP 200 | []
P5 zzq-da03 | /rest/v1/worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name,is_active)&alias_name=ilike.*zzq-da03*&limit=20 | HTTP 200 | []
P3 Acme (WA), Pty. Ltd | /rest/v1/employer_name_aliases?select=id,alias_name,employer_id,employers(employer_id,employer_name,is_active)&alias_name=ilike.*Acme+_WA__+Pty.+Ltd*&limit=20 | HTTP 200 | []
P5 Acme (WA), Pty. Ltd | /rest/v1/worksite_name_aliases?select=id,alias_name,worksite_id,worksites(worksite_id,worksite_name,is_active)&alias_name=ilike.*Acme+_WA__+Pty.+Ltd*&limit=20 | HTTP 200 | []
```

After the round-2 changes: `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0; `pnpm exec eslint "src/app/(dashboard)/name-reviews" src/lib/hooks/useNameEntitySearch.ts` → no output, exit 0; `pnpm exec vitest run "src/app/(dashboard)/name-reviews" src/lib/nav` → `Test Files 4 passed (4)`, `Tests 50 passed (50)` (page tests 15, including the new auto-row and inactive-alias cases).

### Clone rehearsal (verifier), 2026-09-24

Verifier (Sonnet), clone `yqjkuobcawvigsfpgrcm`, via `mcp__Supabase__execute_sql` only (never `apply_migration`, never the CLI), under the orchestrator's approval, per §3.2. Raw outputs pasted; nothing typed in beyond the `SET LOCAL da03.ws_alias_max_id_before` substitution instructed for `91`.

1. `00` **before** (02:26:23 UTC): `employers_n 163, employers_md5 9080f2c224821411f1938c2bf8c2afc4, worksites_n 170, worksites_md5 2174f179f43d3c89dfaf7cff7bc5184c, emp_alias_by_source merge=39, emp_alias_max_id 41, ws_alias_by_source import=8, ws_alias_max_id 8, workers_n 1743, worker_columns_present false, nmr_table NULL, decide_fn NULL, fold_name_fn NULL, ledger_row_present 0, ledger_max_version 20260922040000 (DA0.5's rehearsal ledger row, expected per README), hygiene_log _oux_hygiene_log, env_marker clone, emp_alias_check "CHECK (((source)::text = ANY ((ARRAY['merge'::character varying, 'manual'::character varying])::text[])))", ws_alias_check "CHECK (((source)::text = ANY ((ARRAY['import'::character varying, 'manual'::character varying, 'merge'::character varying])::text[])))", workers_view_md5 5032583908503a4f88650053f56cd462, organising_universe_view_md5 41c50b64a2bfc7ef457aa3c934e0d8ce, worksite_employer_eba_status_md5 85ee20ac82937c0834689f601c6ebc64, principal_employer_eba_summary_md5 ce7161fb9412fd0c2984adbaac299047`. Recorded for `91`: `ws_alias_max_id_before = 8`; `emp_alias_max_id_before = 41`.
2. Migration `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` (md5 `37b35a78a312e75fda84aeadc016bd1a`, 492 lines — the corrected A2/A6 file, matching dev's item 12) as one `BEGIN; <file>; COMMIT;` submission → `[]` (success). Ledger row `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260922120000','da0_3_name_match_reviews');` as its own statement → `[]`.
3. `00` **after-forward-1** (02:45:15 UTC): objects present (`nmr_table name_match_reviews, fold_name_fn fold_name(text), decide_fn decide_name_match(jsonb), fold_trigger_fn name_match_reviews_fold(), nmr_triggers 2, nmr_policies 1, nmr_indexes 7`), both CHECKs five-valued (`merge, manual, import, oa_universe, fwc` on both tables), `employers_md5` / `worksites_md5` identical to step 1, the four view md5s identical to step 1, `ledger_row_present 1, ledger_max_version 20260922120000`. **Verdict: pass.**
4. Harness test locally (`apps/organising-db`): `pnpm exec vitest run src/lib/import/__tests__/replay-fixture.test.ts` → `Test Files 1 passed (1)`, `Tests 7 passed (7)`, duration 884ms. The test file prints no additional counts.
5. `20_rehearse_decisions.sql` as one submission → appended SELECT: `rehearsal_workers 6, rehearsal_workers_filled 5, reviews_by_status confirmed=2,overridden=1,rejected=2,unmatched=1, employer_import_aliases 2, worksite_import_aliases 9 (8 pre-existing + 1 written by the rehearsal), rehearsal_contractor 1, log_rows 28`. Every in-file assertion held (no exception raised); the admin gate `DO` block raised no error (a user-role account exists on the clone).
6. `00` (mid-rehearsal): `employers_n 164, worksites_n 170, fixture_workers_n 6, worker_columns_present true, nmr_by_status confirmed=2,overridden=1,rejected=2,unmatched=1` — the expected transient state before `91`.
7. `91_clear_da0_3_data.sql` with `SET LOCAL da03.ws_alias_max_id_before = '8';` (from step 1) inserted immediately after `BEGIN;` in the submitted text → appended SELECT: `review_rows 0, workers_with_raw 0, synthetic_workers 0, emp_aliases_post_baseline 0, ws_aliases_post_baseline 0, ws_import_aliases_left 8, log_rows_91 17, log_rows_20_stamped 28`. **Verdict: pass** (the 8 pre-existing worksite `import` aliases survived).
8. `00` (data cleared; 02:54:33 UTC): `employers_md5 9080f2c2…` and `worksites_md5 2174f179…` identical to step 1; `emp_alias_max_id 41`, `ws_alias_max_id 8` identical to step 1. **Verdict: pass.**
9. `90_rollback_da0_3_name_match_reviews.sql` as one submission → appended SELECT: `nmr_table NULL, decide_fn NULL, fold_name_fn NULL, worker_columns_left 0, emp_alias_check "CHECK (((source)::text = ANY (ARRAY[('merge'::character varying)::text, ('manual'::character varying)::text])))", ws_alias_check "CHECK (((source)::text = ANY (ARRAY[('import'::character varying)::text, ('manual'::character varying)::text, ('merge'::character varying)::text])))", ledger_row_still_present 1`. **Verdict: pass** (postconditions inside the file, including the application-table checksum guard, held with no exception).
10. `00` **after-rollback** (02:55:36 UTC): identical to step 1 in every field — `employers_md5 9080f2c2…`, `worksites_md5 2174f179…`, `emp_alias_max_id 41`, `ws_alias_max_id 8`, objects absent, both CHECKs the baseline texts, four view md5s unchanged — **except** `ledger_row_present 1` / `ledger_max_version 20260922120000` (step 1 had `0` / `20260922040000`), which is expected: per the assigned step order, the ledger repair is step 11, run after this `00`, not before it (`90` itself never touches the ledger). **Verdict: pass** (schema/application state identical; the ledger difference is the known pending-repair state, not a mismatch).
11. Ledger repair `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120000';` as its own statement (approved by the orchestrator for the clone only) → `[]`.
12. Migration + ledger row again (same corrected file, md5 `37b35a78a312e75fda84aeadc016bd1a`) → `[]`; ledger `INSERT` → `[]`.
13. `00` **after-forward-2** (03:09:53 UTC): identical to step 3 in every field (`employers_md5`, `worksites_md5`, both CHECKs five-valued, `nmr_triggers 2, nmr_policies 1, nmr_indexes 7`, all four view md5s, `ledger_row_present 1, ledger_max_version 20260922120000`). **Verdict: pass.**
14. `20` again → appended SELECT identical to step 5 (`rehearsal_workers 6, rehearsal_workers_filled 5, reviews_by_status confirmed=2,overridden=1,rejected=2,unmatched=1, employer_import_aliases 2, worksite_import_aliases 9, rehearsal_contractor 1, log_rows 28`). `91` again with `SET LOCAL da03.ws_alias_max_id_before = '8';` → appended SELECT identical shape (`review_rows 0, workers_with_raw 0, synthetic_workers 0, emp_aliases_post_baseline 0, ws_aliases_post_baseline 0, ws_import_aliases_left 8, log_rows_91 34, log_rows_20_stamped 56` — log row counts accumulate across the two rehearsal/clear cycles, as expected). Final `00` (03:23:54 UTC): `employers_md5 9080f2c2…`, `worksites_md5 2174f179…`, `ws_alias_max_id 8` identical to step 1; objects present, `fixture_workers_n 0`, `nmr_by_status ""` (empty queue), `ledger_row_present 1, ledger_max_version 20260922120000`. The clone is left **forward** (migration + ledger row applied, no fixture data), per the run sheet.

No STOP was triggered at any step; no real-looking person field appeared in any result (all synthetic `Fixture` / `Person n` rows, no email/phone read back). Production and normal dev were not touched.

## 10. Review

_Reviewer's ranked findings with `path:line`, blocking/advisory, verdict; fix rounds (two maximum)._

### 2026-09-23 — Reviewer: Fable, round 1 (database and import path)

**Verdict: APPROVE WITH ADVISORIES.** No blocking finding. Reviewed against plan §5 row DA0.3 (`OA_UNIVERSE_ALIGNMENT_PLAN.md:381`), §1.9, Q-S10, D5, the orchestration paragraph (`ORCHESTRATION_PROMPT.md:175`), the rules (`:32-45`) and the verification standards (`:112-120`); against `git status` / `git diff` of the working tree on `claude/determined-hypatia-y2cqau`, the migration, `scripts/data-hygiene/da0.3/**`, the new `src/lib/import/**` modules and tests, the two routes, the two wizards, the package change, the hand-edited types, and read-only catalog checks on dev (`dpnnmkhabysfdogllsyh`), production (`gteygwfgjvczanmrwgbr`) and the clone (`yqjkuobcawvigsfpgrcm`). Nothing was edited except this section; no SQL beyond `SELECT`.

**Reviewer's own evidence (raw results, nothing typed in):**

- `pnpm exec vitest run src/lib/import/__tests__` → `Test Files 8 passed (8) · Tests 108 passed (108)` (resolve-names 20, replay-fixture 7, parity 33, name-fold 16, import-log 6, backfill-selection 4, plus the two pre-existing files). `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0. `eslint` over every new file, both apply routes and the contract test → 0 problems (`packages/employer-matching/src/match.ts` is outside the app's eslint base path and is ignored — pre-existing).
- A2 greps re-run from `apps/organising-db`: `matchEmployerCandidates|scoreEmployer|insertOrReuse\("(employers|worksites)"|worker-import/employers|worker-import/worksites|utils/employer-match` → 0 hits; `matchWorksiteCandidates` → `src/lib/utils/worksite-fuzzy.ts`, `api/reference-import/analyse`, `api/campaign-import/analyse` only; `from\("(employers|worksites)"\)\s*\.insert` under `api/worker-import`, `api/membership-import`, `api/import`, `components/import` → 0 hits; `ls src/app/api/worker-import` → `apply organising-units parse`. Every remaining `employers`/`worksites` insert in `src` is off the worker import path: `api/campaign-import/apply/route.ts:149-159,233-243` (DA4.2 per §7 input 5), `api/reference-import/apply/route.ts:121,162` (row 14, admin-run), and the three UI pages (`(dashboard)/worksites/page.tsx:324`, `overview/employers-tab.tsx:386,416`, `campaigns/step-employers-worksites.tsx:430,475`).
- `supabase/migrations/`: `git status --short` shows only `?? 20260922120000_da0_3_name_match_reviews.sql`; no pre-existing migration modified.
- Fixture PII check: `replay_status_sync.xlsx` opened with `xlsx` — one sheet `Members`, 2,400 data rows, header `Reference ID, First Name, Last Name, Member Account Status, Company Name, Employee Worksite, Job Title, Phone, Email`; `First Name` = {`Fixture`}, `Last Name` = `Person 1..2400`, `Email` = `da03-<n>@example.invalid`, `Phone` = {``}, `Reference ID` = `DA03-000001..`, `Job Title` = {`Fixture Trade`} — every person column synthetic. `reference_employers.json` keys `employer_id, employer_name, trading_name, employer_category, is_active` / aliases `employer_id, alias_name, source`; `reference_worksites.json` `worksite_id, worksite_name, worksite_type, is_active`; `employer-matching-parity.json` candidates are the same organisation columns. `01` reads no person table.
- Dev catalog (one `SELECT`): policies — `name_match_reviews_select_authed` SELECT TO authenticated USING (true), identical in shape to `upcoming_project_employers_select_authed`; RLS enabled on both, `force` false; `decide_name_match(payload jsonb) RETURNS jsonb` `prosecdef = true`, `proconfig = {search_path=public}`, owner postgres, acl `{postgres, authenticated, service_role}` (no anon, no PUBLIC); `fold_name` IMMUTABLE STRICT, granted to all; triggers `trg_name_match_reviews_fold BEFORE INSERT OR UPDATE OF raw_name` and `trg_name_match_reviews_updated_at BEFORE UPDATE`; 7 indexes including `uq_name_match_reviews_import_entity_norm (import_id, entity, normalised_name)` non-partial; `workers.employer_name_raw text`, `worksite_name_raw text`, `names_import_id integer` all `is_nullable = YES`, `column_default = NULL`; both alias CHECKs admit `merge, manual, import, oa_universe, fwc`; `name_match_reviews` 0 rows, 0 workers with raw columns, 0 non-baseline aliases; `md5(pg_get_functiondef)` `decide b9b0bd0f…`, `fold 49d34dea…` equal to §11 item 5.
- Production (read-only, one `SELECT`): both CHECKs still the baseline two- and three-value texts, `name_match_reviews` absent, `fold_name` absent, 0 raw columns, ledger max `20260921030000`, employers 187 / worksites 194, ambiguous employer aliases 0, ambiguous worksite aliases 0, employer fold collisions 0, worksite fold collisions 1 (the `floatel triumph` pair the harness records, D10). Untouched, as §11 states.
- Clone (read-only): `name_match_reviews` absent, `fold_name` absent, `_oux_env_marker = clone`, `_oux_hygiene_log` present, 9 `user`-role and 4 `admin` profiles (so `20`'s gate block will run). Ledger max is now `20260922040000` (see advisory A4).
- PostgREST re-probed on dev with the anon key: P1 (three unhinted embeds) → HTTP 401 `42501 permission denied for table name_match_reviews` (parsed; no PGRST200/201); P3 → 200 `[]`; P8 `rpc/decide_name_match {"payload":{}}` → 401 `42501 permission denied for function decide_name_match`; `rpc/fold_name {"p":"  A.T.C.\t Offshore \n"}` → 200 `"a.t.c. offshore"` = `foldName` (case 12 of the parity list). Matches §9.
- Snapshot updates (D9): `git diff` over both `.snap` files contains exactly two distinct removed lines, `["employer-worksite-roles-current"]` and `["worksites-all"]`, 15 times each; nothing added.
- Resolver over the lineage strings of `variants.json` against the production reference (my run): every employer string `exact` to its own row (D12 confirmed); worksites `Floatel triumph` → `needs_review` with both rows at 1.0 (D10), `Tubridigi` → **`auto` 1.0 to row 432 `Tubridigi Gas Storage` with `writesAlias: true`** (the misspelt duplicate, not row 431 `Tubridgi Gas Storage` the variant names as canonical) — advisory A1.

**Checklist verdicts**

1. §5 row and A1–A14 — **met, with the evidence the plan records.** (a) both CHECKs widened (migration `:22-35`; dev catalog above); (b) one path: `resolve-names.ts:90-235` (rejected → exact → alias → fuzzy at `NAME_MATCH_THRESHOLDS` → never create) behind `POST /api/import/resolve-names`, called by the worker wizard (`worker-import-wizard.tsx` preview at `handleFile` / `proceedFromColumnMapping`, persist at apply), the membership wizard (`membership-import-wizard.tsx` `resolveNamesForPreview`, persist in `applyImport`) and therefore the weekly update (`weekly-updates-tab.tsx` mounts the same wizard with `preparedType="weekly_update"`; `isMembershipImportType("weekly_update")` is true so `membership_weekly_update` passes the route's `isImportType`); (c) no create on the import path — greps above, and `resolveNames` has no branch that yields a new id (property test `resolve-names.test.ts:200-233`); (d) raw names on both patch shapes and the insert (`import-log.ts:54-73`, `membership-import/apply/route.ts` update patch and `workerData`, `worker-import/apply/route.ts` `updatePatch` and insert); (e) the function offers `override` (search hit) and `create` as separate actions with the "already exists — search for it instead" refusal (migration `:276-279`); the page-side ordering (search before "Create new") is Opus's A5 component test, outside this half. A3/A6/A7 are proven by the harness against the production reference (108 tests green here) and on the clone by `20`; the e2e preview replay stays the human task §7 names. A13 is the verifier's.
2. Rules — **no breach.** Production untouched (my `SELECT`); the clone untouched; no CLI; no personal field in any committed file (fixture check above; `20`, `91`, `92` log organisation strings and ids only); no migration edited in place; no history invented (this package changes no existing row — `00` md5s identical before/after in §11).
3. Database — **as planned.** Policies and RLS mirror `upcoming_project_employers` (pasted above). `decide_name_match` is SECURITY DEFINER with `SET search_path = public`, gated by `is_admin()` first (`:216-218`), locks the row `FOR UPDATE` (`:232`), and does alias + sibling rows + back-fill + the decided row in the one function call (one transaction; a raised exception rolls all of it back — `20` step 4g and the contract test assert the row is unchanged after a failed create). Ambiguity guard `:304-322`. Back-fill predicate `:363-372` / `:394-403`: `fk IS NULL AND raw IS NOT NULL AND fold_name(raw) = normalised_name AND names_import_id IN (imports that queued the string)` — exactly §2.3.4 step 5, mirrored by `selectBackfillRows`. `fold_name` ↔ `foldName` parity: both collapse-then-trim (D2 read in both files), 12 cases green in process and one re-proved through PostgREST. Trigger, unique index, three nullable no-default columns confirmed in the catalog. `90`: drops function, triggers, trigger function, table, index, three columns, `fold_name`, restores both CHECKs verbatim from the baseline text, post-asserts the admitted vocabularies and the application-table checksums; its precondition STOPs on any queue row, any raw column, any non-baseline alias, or absent objects — exactly the state `91` leaves. `91` requires the pre-migration `ws_alias_max_id` (D7) and clears in the order queue rows → post-baseline aliases → synthetic workers → raw columns → import logs → rehearsal rows → stamps `20`'s log rows; its precondition (objects present, hygiene log present, the setting supplied) is exact for the state `20` or a replay leaves. See advisory A2 on grants.
4. Data integrity — **no silent change beyond today's behaviour.** An update row whose string resolves `exact` / `alias` / `auto` re-points the FK as the wizards did before (now at 0.92 with the dominance gap instead of 0.35 / 0.6), still inside the campaign-protected strip (`membership-import/apply/route.ts` `stripped.patch` then the raw columns spread alongside; `import-log.test.ts:45-55` proves the strip still removes the three FKs and never the raw columns). The back-fill fills null FKs only (`20` W3 and the contract test's third worker stay untouched) and, per §7 input 7, fills a null FK on a protected worker. A queued name imports with a null FK (create) or leaves the FK as it is (update: `if (row.resolvedEmployerId) patch.employer_id = …`) — the approved §2.4.4 behaviour. `import_logs`: batches run sequentially in both wizards (`membership-import-wizard.tsx:914`, `worker-import-wizard.tsx:1770`), each batch reads-merges-writes one row keyed by `importId` (`accumulateImportLog`), and an UPDATE policy for admin/user exists on `import_logs` (baseline `:26431`), so the user client can write it — counts are not lost. See advisories A5, A8.
5. Provenance — **complete.** Resolver aliases: `source: 'import'`, `created_by: userId` (`resolve-names.ts:327-332`); queue rows: `import_id`, `created_by`, `match_method` (`fuzzy` for auto, null otherwise), `match_score`, `candidate_proposals`, `occurrences`, `source_context {import_type, weekly_batch_id, source_kinds, other_raw_name}` (`:338-357`); decisions: alias `source 'import'`, `created_by auth.uid()` (`migration:330-342`), `decided_by/at` on the row and on siblings.
6. Compatibility — **held.** `proposeEmployerMatch` parity: 30-query pre-refactor corpus byte-identical (33 tests green); I read the refactor (`match.ts`) — the single-alt mapping reproduces `nameTokens[0] ?? tradingTokens[0]` and the max-over-alternates exactly; `git diff --stat -- apps/scraper src/lib/membership-updates` empty. Views: four md5s identical in §11 (`ADD COLUMN` of nullable columns cannot change a view's expanded column list). P1–P8: §9 probes, three re-run by me above. Reference wizard: its `source: "import"` employer aliases now pass the CHECK (contract test `(a)`).
7. Scope — **nothing extra.** `campaign-import/apply` correctly left for DA4.2 (§7 input 5). The `worksite-fuzzy.ts` file stays for rows 20–21 as planned. The 15 snapshot updates are the mechanical consequence of the dropped queries (D9). `jaccardEmployer` / `normStr` remain in the membership wizard because `scoreOccupation` still uses them (`:163-181`) — correct. Note the working tree also holds untracked `docs/data-architecture/wp/da0.2.md` and `scripts/data-hygiene/da0.2/`, which belong to another package: the orchestrator's single DA0.3 commit must not sweep them in.
8. Tests — **behavioural and would fail if broken.** `resolve-names.test.ts` pins the order (rejected beats exact; exact beats alias beats fuzzy), the case/space-variants-are-exact rule (no alias written), the ambiguity and fold-collision cases, inactive-row semantics, the thresholds at the values the scorer can actually produce (0.65 vs 0.60; 0.92 vs 0.88) rather than at unreachable 0.649, TOP_N and ordering, and the never-create invariant as a property over a 400-string corpus; `replay-fixture.test.ts` asserts the counts §9 quotes and the second-pass invariant (D10); `backfill-selection.test.ts` covers each exclusion; `import-log.test.ts` covers accumulation and the strip. The contract test (`__contract__/name-match-reviews.contract.test.ts`) is correct as read: refuses production and missing env, seeds through the service role, exercises `override → reopen → reject`, the create conflict then the create, A8 with the user account and the anon `42501`, and cleans up with leftover assertions; the expected `backfilled_worker_ids` (`[w1, w2]`, upper-cased raw on w2, non-null FK on w3, other raw on w4) match the predicate. It cannot run here (§7) and is left for the operator's shell.
9. Deviations D1–D12 — **each justified** (see below). One unlisted drift: advisory A3.
10. Types — **consistent with the migration; a regeneration should not differ.** Column names, nullability (`raw_name`/`entity`/`normalised_name`/`status`/`occurrences`/`candidate_proposals`/`source_context`/`created_at`/`updated_at` required in `Row`, defaults optional in `Insert`), `decide_name_match: { Args: { payload: Json }; Returns: Json }`, `fold_name: { Args: { p: string }; Returns: string }`, the three `workers` columns in alphabetical position, and the relationship lists for `resolved_employer_id` (employers, employers_view, principal_employer_eba_summary) and `resolved_worksite_id` (organising_universe_view, worksite_hierarchy_report_rows, worksite_hierarchy_report_rows_mv, worksites, worksites_view) match the generator's rendering of `upcoming_project_employers` and `employer_worksite_roles`; `auth.users` FKs are (correctly) omitted — the generator renders none anywhere in the file.

**D1–D12:** D1 justified (§7 "Types"; `tsc` and the build pass; regeneration expected clean, item 10). D2 justified — I read both implementations; collapse-then-trim is the only order under which a trailing tab folds identically in JS and Postgres; proven by the 16 in-process cases and the REST probe. D3 justified (same semantics under the row lock; avoids index-expression inference). D4 justified (`NULLS DISTINCT` makes the non-partial index equivalent; PostgREST `on_conflict` needs it). D5 justified — the two batch loops are sequential and each file has its own `importId`, so the read-merge-write is race-free; the fallback `insert` keeps old callers logging. D6 justified — production renders `ARRAY['merge'::character varying, …]::text[]` and dev `ARRAY[('merge'::character varying)::text, …]` (both pasted in §1.4 / §11), so comparing admitted values is the correct assertion. D7 justified (a committed file cannot know the pre-migration max id). D8 justified — a created row named differently from the raw string would otherwise re-queue on the next import; the `reopen` / `confirm` details follow `confirm_upcoming_project_match`. D9 justified and verified (only the two query keys removed). D10 justified and confirmed on production (exactly one worksite fold collision). D11 justified (clone read-only for the implementer; the rolled-back dev run left no residue per §11 item 7). D12 justified and reproduced (every lineage employer string is `exact` to its own row) — with the consequence in A1.

**Findings (ranked; none blocking)**

| # | Severity | Where | Finding |
|---|---|---|---|
| A1 | advisory | `apps/organising-db/src/lib/import/resolve-names.ts:206-221, 325-336`; `scripts/data-hygiene/da0.3/fixtures/variants.json` (`Tubridigi`) | The fuzzy `auto` step writes aliases that point at lineage-C duplicate rows: on today's production reference `Tubridigi` auto-accepts at 1.0 to row 432 `Tubridigi Gas Storage` (the misspelt duplicate), not row 431 `Tubridgi Gas Storage`, and writes the alias there. This is the specified behaviour (R5, D12) and stops the bleed, but each such alias is a row DA1.1 must re-point when it retires the duplicate — and plan §1.9 records that **there is no worksite merge**, so worksite aliases have no `merge_employers`-style re-pointing today. Ask: record in the ledger as an input to DA1.1 (worksite alias re-point when a duplicate worksite is retired), and filter the `auto` rows on the Name Reviews page by default so the operator sees them after the first weekly batch. |
| A2 | advisory | `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql:150-152` | `REVOKE ALL … FROM PUBLIC, "anon"` never revokes from `authenticated`, and the baseline's default privileges had already granted it ALL, so on dev `authenticated` holds INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on `name_match_reviews` (catalog pasted above); the `GRANT SELECT` is a no-op. RLS with the SELECT-only policy is what actually blocks PostgREST writes (the anon and user-role probes behave as intended), and this exactly mirrors `20260921030000:176-189` and `20260918120000:57-60`, so the outcome is the convention's — but the migration's comment and plan §2.3.3 describe a tighter grant than exists, and TRUNCATE is outside RLS. Never edit this applied file; a one-line `REVOKE ALL ON TABLE public.name_match_reviews FROM authenticated; GRANT SELECT …` in a later migration (or as a Phase 0 incidental for all four tables of the convention) closes it. |
| A3 | advisory | `docs/data-architecture/wp/da0.3.md` §3 table row `20` vs `scripts/data-hygiene/da0.3/20_rehearse_decisions.sql:150-176` | The plan says `20` inserts "4 queue rows (two employer, two worksite; one unmatched, three needs_review)"; the file inserts six (R1, R1b sibling from no import, R2, R5 unmatched, R3, R4) and §11 item 7 reports the six. Correct behaviour, undocumented in §8 — add a D13 or fix the §3 row. |
| A4 | advisory | `docs/data-architecture/wp/da0.3.md` §1.4, §2.3.6; `scripts/data-hygiene/da0.3/README.md` "Clone" | The clone's ledger no longer ends at `20260917100000`: it is `20260922040000` (DA0.5's rehearsal landed after this plan was written). Harmless — the migration depends on baseline objects only and applies after any of them — but the verifier's `00` (before) will not match the §1.4 tail; note it in §11 rather than treating it as a surprise. |
| A5 | advisory | `apps/organising-db/src/app/api/import/resolve-names/route.ts:126-145, 163-209`; `resolve-names.ts:325-363` | The persist call is not transactional: the `import_logs` row is inserted first, then auto aliases one by one, then the queue upsert. A failure in the upsert leaves the log row and the aliases behind while the wizard reports "Import not started". One concrete trigger exists: a raw string over 200 characters violates `name_match_reviews_raw_name_check` (and `alias_name varchar(200)`, error `22001`, which is rethrown). Suggest `cleanInputs` rejects/slices strings > 200 with a row warning, and the route deletes the `import_logs` row on a resolver failure. |
| A6 | advisory | `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql:281-284, 348-353` | `confirm` accepts any `employer_id` / `worksite_id`, not only one of `candidate_proposals`, and records `match_method = 'fuzzy'` with the old `match_score`. If the page ever sends `confirm` for a search hit the provenance is wrong (it should be `override` / `manual`). Either the function asserts the target is in `candidate_proposals` for `confirm`, or the Opus contract (§2.4.5) states that search hits always use `override`. |
| A7 | advisory | `apps/organising-db/src/lib/import/resolve-names-types.ts:90-91`; `name-resolution-table.tsx:98-100` | The dry-run table (persist: false) labels `auto` as "Matched (alias saved)" before anything is saved. "Matched (alias will be saved on import)" or a persist-aware label. |
| A8 | advisory | `apps/organising-db/src/lib/import/import-log.ts:54-73`; plan §2.4.4 / R3 | On an update where the worker already has a non-null FK and the file carries a queued string, the raw column and `names_import_id` are overwritten but the back-fill (null FKs only) will never change that worker; the FK is corrected only by the next import after the alias exists. This is the approved trade (§7 input 7) and self-heals weekly; state it in §2.4.4 / R3 so the operator does not expect the decision to move those workers. |
| A9 | advisory | `apps/organising-db/src/app/api/name-match-reviews/[id]/decide/route.ts:38-45` | `statusForRpcError` maps every "not found" to 404, including `'% % not found'` for a bad target id (`migration:297-299`), which is a 400/409 from the caller's point of view. Nit. |
| A10 | advisory | `apps/organising-db/src/app/api/worker-import/apply/route.ts:751-766` | A failed `accumulateImportLog` is pushed to `errors`, so the batch returns `success: false` although its rows were written. Visible, not silent — acceptable, but the wizard's "done" copy should say the rows landed and only the log failed. |
| A11 | advisory | working tree | `docs/data-architecture/wp/da0.2.md` and `scripts/data-hygiene/da0.2/` are untracked alongside this package; the orchestrator's single DA0.3 commit (§7 "Commits") must add DA0.3's paths explicitly. |

**Advisory round: applied (Fable implementer, 2026-09-23)**

| # | Status | What changed |
|---|---|---|
| A1 | advisory round: recorded | Ledger input to DA1.1 (worksite alias re-point when a duplicate worksite is retired); the `auto` filter on the page is Opus's (§2.5 lists `auto` as a filter value). No code change |
| A2 | advisory round: applied | Migration: `REVOKE ALL ON TABLE public.name_match_reviews FROM PUBLIC, "anon", "authenticated"` before `GRANT SELECT … TO authenticated` (the sequence block already revoked `authenticated`). Dev: `90` rollback → ledger `DELETE` as its own statement → `00` (identical to the original before) → corrected file as one `BEGIN; … COMMIT;` → ledger `INSERT` → `00` after (§11 items 9–13). New md5 `37b35a78a312e75fda84aeadc016bd1a` (was `0b55851a…`). D20 |
| A3 | advisory round: applied | §3 row `20` now says six queue rows and the one pre-set FK; matches the file and §11 item 7 |
| A4 | advisory round: applied | §1.4 clone row and §2.3.6 note the clone ledger max `20260922040000` (DA0.5 rehearsal) and that DA0.3 still has no prerequisite; `scripts/data-hygiene/da0.3/README.md` clone section likewise |
| A5 | advisory round: applied | `resolve-names/route.ts`: `overlongNames()` rejects any folded string > 200 characters with HTTP 400 naming the entity, count and first offender **before** the `import_logs` insert; `resolveAndQueue` now upserts the queue rows before writing the auto aliases; on any failure after the log insert the route deletes that import's queue rows and its `import_logs` row and returns `importId: null`. Chosen over a transaction because PostgREST has none across three tables; aliases written before a later failure are idempotent facts (the next run would write the same rows) and are left. D21 |
| A6 | advisory round: applied | `decide_name_match`: `confirm` raises `target <entity> <id> is not one of the proposals; use override` unless the id is in `candidate_proposals`; `override` unchanged for search hits. Contract test case added (`confirm refuses a target that is not one of the proposals`). D21 |
| A7 | advisory round: applied | `resolutionStatusLabel(status, persisted)`: dry run shows "Will match (alias to be saved on import)"; `NameResolutionTable` takes `persisted` (default false — the wizards' steps) |
| A8 | advisory round: applied | §2.4.4 paragraph and R3 state that an update row with a non-null FK and a queued string is not moved by the back-fill and self-heals on the next import |
| A9 | advisory round: applied | Decide route: `name_match_reviews row N not found` → 404; a missing target row, a non-proposal target for `confirm`, the alias-ambiguity and unique-name refusals and "already decided" → 409 (a conflict with the reviewer's choice, not a missing resource). Documented in the route header. D21 |
| A10 | advisory round: applied | Both apply routes return a `warnings: string[]` field for a failed `import_logs` accumulation ("the rows of this batch were written; Import History may undercount") and keep `success: true`; both wizards show it prefixed "Warning (rows were written):". D21 |
| A11 | advisory round: recorded | For the orchestrator's commit: add DA0.3's paths explicitly; `wp/da0.2.md` and `scripts/data-hygiene/da0.2/` are another package's |

**Conditions for closing the review:** none blocking. A3 (one line in §8 or §3) and A4 (one line in §11) are documentation fixes the implementer can make in the same round; A1, A2, A5–A10 go to the ledger's incidental findings or DA4.2 at the orchestrator's choice. The clone rehearsal (§3.2, A13) and the operator's contract-suite and preview-replay runs (A3/A4/A6/A7/A8/A9 on a live PostgREST) remain the outstanding evidence the plan already names in §7.

### 2026-09-23 — Reviewer: Fable, round 2 (whole package)

**Verdict: APPROVE WITH ADVISORIES.** No blocking finding. Scope: (1) advisories A2–A10 verified in code, (2) the Opus half (page, hooks, nav, header, tests) against §2.5, §2.6.4, §2.6.5 and the reviewer checklist, (3) the package as a whole — the page ↔ decide-route seam, both wizards end to end, scope, personal data. Nothing edited except this section; no SQL; production and the clone untouched; dev read through anon-key REST probes only (key never written to a file).

**Reviewer's own evidence (raw results, from `apps/organising-db` unless stated):**

- `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0, no output.
- `pnpm lint` → `✖ 298 problems (145 errors, 153 warnings)` (= baseline). Every DA0.3 file clean; the only messages in a touched file are the three pre-existing `worker-import-wizard.tsx` warnings (`API_FETCH_TIMEOUT_LLM_MS` :11, `detectedHeaders` :494, `options` :2108).
- `pnpm test` → `Test Files 1 failed | 143 passed (144)`, `Tests 1 failed | 1943 passed (1944)`; the failure is `wall-chart.render-cost.test.tsx > renders 305 members across 161 units within budget` (the known timing test). `name-reviews-page.test.tsx` 13 passed; `nav-model.test.ts` 13; `nav-reachability.test.ts` 14.
- Root `pnpm validate:migrations` → `Validated 18 Supabase migrations with unique 14-digit versions.` Migration md5 `37b35a78a312e75fda84aeadc016bd1a` (= §11 item 12).
- Dev probes (anon key, `curl`, status + message only): P1 employer/open → HTTP 401 `42501 permission denied for table name_match_reviews` (three embeds parsed; no PGRST200/201); P2 with the D15-sanitised `Acme (WA), Pty` (`*Acme+_WA__+Pty*` in both arms of `or=(…)`) → 200 `[]`; P5 → 200 `[]`; P9 `user_profiles?select=user_id,display_name&user_id=in.(0000…)` → 200 `[]`; P8 `rpc/decide_name_match {"payload":{}}` → 401 `42501 permission denied for function decide_name_match`; `rpc/fold_name` `"  Acme\t Offshore \n"` → 200 `"acme offshore"`.
- Personal-data sweep over every new or modified path in `git status` (39 paths, docs excluded): email regex → only `example.invalid` in `scripts/data-hygiene/da0.3/README.md`; phone regex → 0 hits. The page test's fixture is organisation strings and the display name `Admin One`; nav fixtures and snapshots carry only nav rows.
- `git diff --stat` (18 tracked files, +710/−1849) plus the untracked DA0.3 trees; deleted `worker-import/{employers,worksites}/route.ts` and `utils/employer-match.ts` (+ test). Greps re-run: `matchEmployerCandidates|scoreEmployer|insertOrReuse\("(employers|worksites)"|worker-import/employers|worker-import/worksites` → 0; `from\("(employers|worksites)"\)\s*\.insert` under `api/worker-import`, `api/membership-import`, `api/import`, `components/import` → 0; `insertOrReuse` survives once, typed `table: "occupations"` (`membership-import-wizard.tsx:776-777`). No alias-delete UI exists anywhere in `src/components` or `src/app/(dashboard)` (only the contract test's service-role cleanup) — see finding 2.

**A2–A10 verification (each read in code, not from the claim)**

| # | Where | Verdict |
|---|---|---|
| A2 | `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql:150-152` (`REVOKE ALL … FROM PUBLIC, "anon", "authenticated"` → `GRANT SELECT … TO "authenticated"` → `GRANT ALL … TO "service_role"`) and `:155-164` (sequence: revoke PUBLIC/anon/authenticated, grant USAGE, SELECT to service_role) | applied correctly; §11 item 13's catalog line (`authenticated_table_privs SELECT`, `anon NULL`, seq usage false/true) matches the file; P1 probe as anon still 42501 |
| A3 | `da0.3.md` §3 row `20` ("6 synthetic workers … FKs null except one worker whose employer is already set … 6 queue rows") | applied correctly; matches `20_rehearse_decisions.sql` and §11 item 7 |
| A4 | `da0.3.md:59` (§1.4 clone row re-read), `:363-364` (§2.3.6), `scripts/data-hygiene/da0.3/README.md` clone section | applied correctly |
| A5 | `src/app/api/import/resolve-names/route.ts:32-34` (`overlongNames`), `:126-137` (400 before any write), `:146-158` (`import_logs` insert only after the gate), `:216-233` (catch: delete queue rows by `import_id`, delete the log row, return `importId: null`, 500); `src/lib/import/resolve-names.ts:322-352` (queue upsert first), `:354-365` (aliases second, 23505 ignored) | applied; two residual gaps, findings 1 and 6 (neither reopens the advisory as blocking) |
| A6 | migration `:288-295` (`confirm` raises `target % % is not one of the proposals; use override` unless the id is in `candidate_proposals`); contract case `src/lib/import/__contract__/name-match-reviews.contract.test.ts:344-349` (asserts the message and that the row stays `unmatched`) | applied correctly; the page sends `confirm` only from the proposal list (`review-row.tsx:175`) and `override` from search hits (`:101`) — the seam holds |
| A7 | `src/lib/import/resolve-names-types.ts:88-95` (`resolutionStatusLabel(status, persisted)`: dry run → "Will match (alias to be saved on import)"); `src/components/import/name-resolution-table.tsx:59-66` (`persisted = false` default); both wizards call it without the prop on their matching steps | applied correctly |
| A8 | `da0.3.md:495` (§2.4.4 paragraph) and `:684` (R3) | applied correctly |
| A9 | `src/app/api/name-match-reviews/[id]/decide/route.ts:40-56` (`name_match_reviews row … not found` → 404; other `not found` / `already exists` / `already points at` / `reopen it first` / `not one of the proposals` → 409; `requires` / `unsupported action` / `payload must` → 400); header comment `:12-15` | applied correctly; one message still falls to 500 — finding 4 (nit) |
| A10 | `src/app/api/worker-import/apply/route.ts:135, 378, 766-770, 789` and `membership-import/apply/route.ts:85, 250, 493-497, 520` (`warnings: string[]`, `success` unchanged); wizards `worker-import-wizard.tsx:1792`, `membership-import-wizard.tsx:943` ("Warning (rows were written): …") | applied correctly |

**Checklist verdicts**

1. **Page vs §2.5 — met.** Filters: entity (`page.tsx:31-34`), status open/auto/decided/all (`:36-41`, `statusesFor` in `useNameMatchReviews.ts:97-108`), import from `import_logs` newest first (P6, `:120-127`). Columns: raw name, occurrences, other raw name from `source_context`, proposals with score and Principal badge, status, import file + date, decided by/at (P9 for the name). Per row: Confirm per proposal (`review-row.tsx:170-180`, hidden on decided rows), search over rows **and** aliases with "alias “x” of <canonical>" mapping to the canonical id (`useNameEntitySearch.ts:118-181`, `entity-search.tsx:96-99`) and "Map to this" → `override` (`review-row.tsx:101`), Reject (`:228`), Reopen on decided rows with the alias/back-fill note (`:243-256`), "Create new" only after a settled empty result for the typed text or "None of these" (`entity-search.tsx:41-49`, D16), create dialog with name prefilled, trading name, category / `WORKSITE_TYPES` + offshore (`create-new-dialog.tsx`; both vocabularies equal the baseline CHECKs `employers_employer_category_check` and `worksites_worksite_type_check`, 6 and 19 values). Every decision is `postNameDecision` → `fetch('/api/name-match-reviews/<id>/decide')` (`useDecideNameMatch.ts:67-84`); no `supabase.rpc` in any page or hook file. Counts shown via `describeDecision` (`:47-61`) and `universeSyncError` surfaced (`page.tsx:114-118`); the three keys invalidated (`DECIDE_INVALIDATES`, `:41-45`). 409 text thrown verbatim (`DecideNameMatchError`, `:79`) and rendered with `role="alert"` on the row (`review-row.tsx:259-263`) or inside the dialog. Non-admin: no controls and "Match decisions can only be made by admins." (`page.tsx:60-62`; every control gated on `isAdmin`). Empty state links to the imports tab (`/administration?tab=data`, which `administration/page.tsx:2712` reads) and `weeklyUpdatesHref()`. **Tests would fail if broken:** "no Create new before searching" asserts `buttonByText("Create new employer")` undefined before and after opening the search; the "only after the search returned no rows" and "None of these" cases assert the button is absent while hits exist; the override/confirm/create/reject/reopen cases assert `fetchMock` was called exactly once with the route URL, `method: "POST"` and the exact body — a bypass (no fetch) or a wrong action fails them. Opus's recorded mutation check (`canCreate = true` → 3 failures) is consistent with what I read.
2. **Seam — holds.** `confirm` carries a proposal id only; search hits go as `override`; `create` carries the dialog payload; `notes` is `null` when empty; the route's `payload` maps 1:1 onto `decide_name_match` (`decide/route.ts:98-105`). Hook strings equal P1–P6 (+P9) as probed in §9 "Opus half" and re-probed above (`.order("employer_name", { ascending: true })` renders `order=employer_name.asc`, the same order as the plan's `order=employer_name`). D15 is safe: `ilikePattern` (`useNameEntitySearch.ts:43-45`) turns `,` `(` `)` `"` `\` into `_` before the string enters `or=(…)`, so no value can close the group or start a new condition; the single-column `.ilike()` filters are URL-encoded by supabase-js and never in the `or` grammar. `auto` rows: `canDecide` includes `auto` (`review-row.tsx:77`) so they show "Mapped to … (fuzzy match, score)" plus Confirm / search / Reject — see finding 2 for what the function will accept. `rejected` is sticky (decided → Reopen only; the resolver returns `rejected` for the folded string, `resolve-names.ts:170-173`).
3. **Nav — as planned.** `DEFS.name_reviews` (`nav-model.ts:226-232`, `href: NAME_REVIEWS_PATH`, icon `clipboard-list`, module `administration`) in `FULL_ADMIN_ITEMS` directly after `email_imports` (`:270-274`); `FULL_NAV_ITEMS` and the organiser list untouched. Snapshot diff: `+16` lines = one 8-line row in case 1 and one in case 9, nothing else (`git diff` of the `.snap`); case 7 (`user`) unchanged (D17, correct). `FULL_MODE_FIXTURE` gains the row after `email_imports`; `nav-reachability.test.ts` title "12 + 4", `added` = `["mobilisation","surveys_forms","name_reviews"]`, position asserted, `ALL_NAV_HREFS` gains `/name-reviews`. `header.tsx:32` `"/name-reviews": "Name Reviews"` (D19; `basePath` lookup at `:87-88` matches the first segment).
4. **Role coverage (`ORCHESTRATION_PROMPT.md:119`) — covered as far as this environment can.** `user` on `/name-reviews`: rows, proposals and the admins-only note; no Confirm / search / Reject / Reopen / note input (component test 2, run green here). Decide route: `profile.role !== "admin"` → 403 (`decide/route.ts:72-74`) and the RPC's own `is_admin()` gate behind it (`migration:216-218`). Wizards for `user`: the resolve route admits `admin` and `user` (`resolve-names/route.ts:81-83`), the queue/alias writes run on the service role, `import_logs` insert/update policies admit `user` (baseline `:26067`, `:26431`) — the organiser's import runs as before and the "N names queued — open Name Reviews" link (`name-resolution-table.tsx:41-56`) leads to the read-only page (§7 input 2). The live `user`-account run of the hooks contract suite (`src/lib/hooks/__contract__/…`, signs in as both accounts) remains the operator's task per §7.
5. **Whole package — no scope creep; nothing can create an employer or worksite from the import path.** Worker wizard: header format → `resolveNamesForPreview` (`worker-import-wizard.tsx:929-967`, `persist: false`) → read-only `NameResolutionTable` on the employer and worksite steps (`:2590-2631`; no picker, no dialog, no create handler); group format → the same dry run over the group names then the `employer_selection` picker, which selects an existing row by id (`:1055-1056`); apply → one `persist: true` call over the non-skipped rows (`:1654-1670`), FKs from the outcomes, raw strings and `importId` on every row (`:1725-1730`), warnings surfaced (`:1792`), result copy with the queue link (`:3948-3953`). Membership wizard (and therefore the weekly update, same component with `preparedType="weekly_update"`): dry run at the steps (`:483-513`, with `weeklyBatchId`), `persist: true` over non-skipped rows with `sourceKinds` (`:815-843`), **abort with "Import not started" when resolution fails** (`:869-884`, so no row is written without queue rows and `names_import_id`), `insertOrReuse` narrowed to `"occupations"` (`:776-777`), ids from the outcomes (`:890-891`). Deleted routes and matcher confirmed absent; remaining `employers`/`worksites` inserts are the ones round 1 listed (campaign-import DA4.2, reference wizard, three UI pages). Files outside §2.2's lists: `header.tsx` (D19, authorised) and four Fable-side helper modules — finding 7. Untracked `wp/da0.2.md` and `scripts/data-hygiene/da0.2/` are another package's (A11 stands).
6. **Gates** — pasted above; all four match §9 (implementer) and §9 "Opus half".
7. **D1–D19 — each justified; none hides a defect.** D1–D12 as round 1. D20/D21 (Fable, advisory round; renumbered from D13/D14 in round 2) verified in the A2/A5/A6/A9/A10 rows above. D13 (Opus, P9) justified — `decided_by` → `auth.users` is not embeddable and `user_profiles` is readable by every authenticated user; probed. D14 (Opus, P1 variants) justified and probed. D15 justified (finding: none; safe as read). D16 justified — the empty search box is the stricter reading of D5. D17 correct (case 7 has no admin block). D18 justified — the recorder keeps React Query and the hooks real, which is what makes the P1 assertion and the invalidation assertion meaningful. D19 authorised. The only §8 defect is clerical — finding 3.
8. **Advisory verification** — table above; A5 leaves the two residual gaps in findings 1 and 6.

**Findings (ranked; none blocking)**

| # | Severity | Where | Finding |
|---|---|---|---|
| 1 | advisory | `apps/organising-db/src/app/api/import/resolve-names/route.ts:222` | The A5 cleanup deletes the `import_logs` row with the **user** client, but the only DELETE policy on `import_logs` is admin-only (`baseline:25637`), so for a `user`-role organiser RLS deletes 0 rows silently (the result is not checked) and the empty log row (0/0, no queue rows) stays behind — D14's "leave nothing behind" holds for admins only. One-token fix: `admin.from("import_logs").delete()…` (the service-role client is already in scope in the catch), and log a warning if either delete errors. |
| 2 | advisory | `apps/organising-db/src/app/(dashboard)/name-reviews/_components/review-row.tsx:77, 170-180, 186-206, 222-230`; migration `:315-329` | On an `auto` row the page offers Confirm on the other proposals, "Search existing …" → "Map to this", and Reject. But the resolver already wrote the alias for this string to the auto target (`resolve-names.ts:354-365`), so the function's ambiguity guard refuses **every** other target with `alias "…" already points at <auto target>; resolve that alias first` (409, shown verbatim), and there is no alias-management UI in the app to act on it (grep above; the plan leans on the delete policy `baseline:25617` only). Reject on an `auto` row likewise leaves the alias and the FKs the wizards already wrote for those workers. Nothing is wrong at the data layer (A1 / R7 territory), but the page presents choices that cannot succeed. Suggest, in a fix round or DA1.4: on `auto` rows show Confirm on the auto target and Reject only, with one line ("this string is already an alias of <name>; to re-point it the alias must be removed first"), and keep the search behind that note. |
| 3 | advisory | `docs/data-architecture/wp/da0.3.md:751-752, 759-760` | §8 numbers two deviations twice: Fable's advisory-round rows and Opus's first two rows are both **D13** and **D14** (Opus's continue D15–D19). Renumber Opus's to D20–D21 (or Fable's) so a reference to "D14" is unambiguous; the four existing cross-references (§8 A-round column, §9 "Opus half") follow. |
| 4 | advisory | `apps/organising-db/src/app/api/name-match-reviews/[id]/decide/route.ts:40-56` | `review % is %; only a decided review can be reopened` (migration `:457`) matches no branch and returns 500. Unreachable from the page (Reopen renders on decided rows only) but a 409 by the route's own rule; add `"can be reopened"` to the 409 list. |
| 5 | advisory | `apps/organising-db/src/lib/hooks/useNameEntitySearch.ts:149, 174` | Alias hits hard-code `isActive: true`; an alias of an inactive row shows without the "Inactive" badge the direct hits carry. Embedding `is_active` in P3/P5 (`employers(employer_id,employer_name,is_active)`) is one more column on an existing embed — re-probe once. |
| 6 | advisory | `apps/organising-db/src/app/api/import/resolve-names/route.ts:32-34` | `overlongNames` measures `foldName(raw).length`, while the CHECK is `char_length(btrim(raw_name))` (migration `:78-79`) and the alias column holds `btrim(raw)`: a string whose internal whitespace runs collapse below 200 but whose trimmed length exceeds it passes the 400 gate and fails at the upsert. Fail-closed still holds through the catch (500 + cleanup, subject to finding 1). Test `raw.trim().length` as well, or store the folded form's raw with collapsed whitespace. |
| 7 | advisory | `docs/data-architecture/wp/da0.3.md` §2.2 vs the tree | Four Fable-side modules are not named in §2.2 or §8: `src/lib/import/resolve-names-client.ts`, `resolve-names-types.ts`, `import-log.ts` and `src/components/import/name-resolution-table.tsx`. All sit inside Fable's file boundary, are consumed only by the named files, and were reviewed in round 1 and here; add one deviation line so the file list is complete. |

**Round 2: applied (Fable implementer, 2026-09-24)**

| # | Status | What changed |
|---|---|---|
| 1 | round 2: applied | `resolve-names/route.ts` cleanup: both deletes (`name_match_reviews` by `import_id`, then `import_logs`) run with the **admin** client (a user-role importer has no DELETE on `import_logs`, baseline:25637); each delete's error is checked and appended to the response's `error` as `(cleanup: …)` rather than hidden |
| 2 | round 2: recorded | Opus's file (`review-row.tsx`); ledger incidental with A1 / R7 as DA1.4 input |
| 3 | round 2: applied | §8: Fable's advisory-round rows renumbered D20 / D21; cross-references in §10 (A2, A5, A6, A9, A10) and the round-2 checklist item 7 updated; Opus's D13 / D14 keep their numbers |
| 4 | round 2: applied | Decide route: `only a decided review can be reopened` added to the 409 list |
| 5 | round 2: recorded | Opus's file (`useNameEntitySearch.ts`); ledger incidental |
| 6 | round 2: applied | `overlongNames()` measures `raw.trim().length` (what `char_length(btrim(raw_name))` and `alias_name varchar(200)` measure), not the folded length |
| 7 | round 2: applied | §2.2 gains a row for the four helper modules; §8 D22 names them |

**Conditions for closing the review:** none blocking. Findings 1 and 4 are one-line code fixes the implementer can take in the same round; 3 and 7 are documentation lines; 2, 5 and 6 go to the ledger's incidental findings (2 belongs with A1 / R7 as DA1.4 input). Outstanding evidence is unchanged from round 1 and §7: the clone rehearsal (§3.2), the operator's two contract suites (`OUX_CONTRACT_*`, including the `user`-account run of the hooks suite) and the preview replay.

**Round 2 — Opus items: applied (2026-09-23).** #2 `name-reviews/_components/review-row.tsx`: auto rows offer only Confirm of the auto target and Reject, with the DA1.4 note; no search, no other-proposal Confirm (§8 D23; new component test "auto row (round 2)…"). #5 `src/lib/hooks/useNameEntitySearch.ts`: P3/P5 embed `is_active` from the canonical row and alias hits use it (§8 D23; new test "an alias hit carries its canonical row's is_active"; re-probe in §9 "Opus half", HTTP 200 `[]` on both strings).

## 11. Run sheet record

**Normal dev `dpnnmkhabysfdogllsyh` — Fable implementer, 2026-09-22, under §7 input 4 (connector `execute_sql`; never `apply_migration`, never the CLI).**

1. Read-only state check, 06:16 UTC: ledger tail `…,20260914090000,20260914090100,20260917100000` (dev also lacks `20260918120000`, `20260921030000`, `20260922040000` — none is a prerequisite, §2.3.6); `_oux_env_marker` = `dev`; `_oux_hygiene_log` present; `name_match_reviews` absent; `fold_name` absent; `is_admin()`, `update_updated_at()` present.
2. `00_preflight.sql` **before** (07:00:47 UTC): `employers_n 167, employers_md5 2bc57a3aa28899488e78217dc9055504, worksites_n 94, worksites_md5 cb5e467c48c9db5a474f9f417564d6fa, emp_alias_by_source merge=39, emp_alias_max_id 41, ws_alias_by_source "" , ws_alias_max_id 0, workers_n 1470, workers_emp_raw_set NULL, workers_ws_raw_set NULL, workers_import_id_set NULL, fixture_workers_n 0, worker_columns_present false, nmr_table NULL, fold_name_fn NULL, decide_fn NULL, fold_trigger_fn NULL, nmr_triggers 0, nmr_policies 0, nmr_indexes 0, nmr_by_status NULL, emp_alias_check "CHECK (((source)::text = ANY (ARRAY[('merge'::character varying)::text, ('manual'::character varying)::text])))", ws_alias_check "CHECK (((source)::text = ANY (ARRAY[('import'::character varying)::text, ('manual'::character varying)::text, ('merge'::character varying)::text])))", workers_view_md5 5032583908503a4f88650053f56cd462, organising_universe_view_md5 41c50b64a2bfc7ef457aa3c934e0d8ce, worksite_employer_eba_status_md5 19f44fe301037b11bdb0ec4d2b411ee0, principal_employer_eba_summary_md5 ce7161fb9412fd0c2984adbaac299047, ledger_row_present 0, ledger_max_version 20260917100000, hygiene_log _oux_hygiene_log, env_marker dev`.
3. Migration `supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` (md5 `0b55851ae9f2efa72e415b136d6fe225`, 484 lines) as one submission `BEGIN; <file>; COMMIT;` → `[]` (success, ~07:04 UTC).
4. Ledger row as its own statement: `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260922120000','da0_3_name_match_reviews');` → `[]`.
5. `00_preflight.sql` **after** (07:05:03 UTC): `employers_n 167, employers_md5 2bc57a3aa28899488e78217dc9055504, worksites_n 94, worksites_md5 cb5e467c48c9db5a474f9f417564d6fa, emp_alias_by_source merge=39, emp_alias_max_id 41, ws_alias_by_source "", ws_alias_max_id 0, workers_n 1470, workers_emp_raw_set 0, workers_ws_raw_set 0, workers_import_id_set 0, fixture_workers_n 0, worker_columns_present true, nmr_table name_match_reviews, fold_name_fn fold_name(text), decide_fn decide_name_match(jsonb), fold_trigger_fn name_match_reviews_fold(), nmr_triggers 2, nmr_policies 1, nmr_indexes 7 (idx_name_match_reviews_employer, _entity_norm, _import, _open, _worksite, name_match_reviews_pkey, uq_name_match_reviews_import_entity_norm), nmr_by_status "", emp_alias_check "CHECK (((source)::text = ANY (ARRAY['merge'::text, 'manual'::text, 'import'::text, 'oa_universe'::text, 'fwc'::text])))", ws_alias_check (same five values), workers_view_md5 5032583908503a4f88650053f56cd462, organising_universe_view_md5 41c50b64a2bfc7ef457aa3c934e0d8ce, worksite_employer_eba_status_md5 19f44fe301037b11bdb0ec4d2b411ee0, principal_employer_eba_summary_md5 ce7161fb9412fd0c2984adbaac299047, ledger_row_present 1, ledger_max_version 20260922120000, hygiene_log _oux_hygiene_log, env_marker dev, decide_fn_md5 b9b0bd0f82e104ec39b54a6aa9b33e79, fold_fn_md5 49d34dea83b4239f3d46d289b48c8165`. A1 ✔ (five values), A14 ✔ (four view md5s identical), employers / worksites md5 identical, no data row changed.
6. REST probes P1–P8 (§9).
7. `20_rehearse_decisions.sql` body rehearsed inside `BEGIN; … ROLLBACK;` (2026-09-23 22:4x UTC, after fixing a PL/pgSQL identifier clash `r1`/`R1` the first submission reported as `42601 duplicate declaration`): summary before rollback `rehearsal_workers 6, rehearsal_workers_filled 5, reviews_by_status confirmed=2,overridden=1,rejected=2,unmatched=1, employer_import_aliases 2, worksite_import_aliases 1, rehearsal_contractor 1, log_rows 28, user_role_account_present true` — every assertion in the file held (confirm → alias + back-fill of exactly W1, W2, sibling resolved, W3 untouched; reopen keeps alias and back-fill; reject; override → worksite alias + W5; create → new employer + W4 + method `created`; reject R4 → W6 untouched; create with an existing name → "already exists — search for it instead"; the admin gate raised "Only admins…" for the user-role account). Post-rollback check: `synthetic_workers 0, review_rows 0, rehearsal_contractor 0, rehearsal_imports 0, da03_log_rows 0, emp_import_aliases 0, ws_aliases 0, workers_with_raw 0` — no residue. Dev is left **forward** (migration + ledger row), matching the committed file.
8. No application data was seeded or deleted on dev; `92` was not needed (no replay was run).

**Advisory round A2 — dev rolled back and re-applied with the corrected file (Fable implementer, 2026-09-23 23:2x–23:36 UTC):**

9. `90_rollback_da0_3_name_match_reviews.sql` as one submission (guard: `_oux_env_marker = dev`; precondition: 0 review rows, 0 raw columns, 0 non-baseline aliases) → appended SELECT: `nmr_table NULL, decide_fn NULL, fold_name_fn NULL, worker_columns_left 0, emp_alias_check "CHECK (((source)::text = ANY (ARRAY[('merge'::character varying)::text, ('manual'::character varying)::text])))", ws_alias_check "CHECK (((source)::text = ANY (ARRAY[('import'::character varying)::text, ('manual'::character varying)::text, ('merge'::character varying)::text])))", ledger_row_still_present 1` (post-assertions incl. application-table checksums held).
10. Ledger repair as its own statement: `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120000';` → `[]`.
11. `00` after-rollback (23:28:19 UTC): every value identical to item 2 (`employers_md5 2bc57a3a…`, `worksites_md5 cb5e467c…`, objects absent, both CHECKs the baseline texts, four view md5s unchanged, `ledger_row_present 0`, `ledger_max_version 20260917100000`).
12. Corrected migration (md5 `37b35a78a312e75fda84aeadc016bd1a`; A2 revoke from `authenticated`, A6 proposal check) as one `BEGIN; <file>; COMMIT;` → `[]`; ledger row `INSERT` as its own statement → `[]`.
13. `00` after-forward-2 (23:36:25 UTC): identical to item 5 except `decide_fn_md5 603e881177978e1de958eb9320e23890` (the A6 change; `fold_fn_md5 49d34dea…` unchanged), plus the grant check: `authenticated_table_privs SELECT`, `anon_table_privs NULL`, `authenticated_seq_usage false`, `service_role_seq_usage true`. Dev is left **forward**, matching the committed file.

**Production `gteygwfgjvczanmrwgbr`:** read-only only — `01_export_reference_lists.sql` executed 2026-09-22 06:16:39 UTC (187 employers, 39 aliases, 194 worksites, 8 aliases; organisation strings only) → `scripts/data-hygiene/da0.3/fixtures/reference_*.json`. Nothing else touched.

**Clone `yqjkuobcawvigsfpgrcm` — verifier (Sonnet), via the connector under the orchestrator's approval, 2026-09-24.** Full raw outputs and comparisons in §9 "Clone rehearsal (verifier)". Summary, one row per step:

| Step | File | Outcome | Date | By |
|---|---|---|---|---|
| 1 | `00` (before) | pass — recorded `ws_alias_max_id_before 8`, `emp_alias_max_id_before 41` | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 2 | migration (md5 `37b35a78a312e75fda84aeadc016bd1a`) + ledger row | pass | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 3 | `00` (after-forward-1) | pass — objects present, both CHECKs five-valued, employers/worksites/view md5s identical to step 1 | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 4 | harness (`replay-fixture.test.ts`) | pass — `Test Files 1 passed (1)`, `Tests 7 passed (7)` | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5 | `20_rehearse_decisions.sql` | pass — all in-file assertions held, admin gate held | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 6 | `00` (mid-rehearsal) | pass — expected transient state | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 7 | `91_clear_da0_3_data.sql` (`ws_alias_max_id_before='8'`) | pass — 8 pre-existing worksite aliases survived | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 8 | `00` (data cleared) | pass — employers/worksites md5 identical to step 1 | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 9 | `90_rollback_da0_3_name_match_reviews.sql` | pass — postconditions held | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 10 | `00` (after-rollback) | pass — identical to step 1 except the not-yet-repaired ledger row (expected; repair is step 11) | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 11 | ledger repair `DELETE … WHERE version = '20260922120000'` | pass | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 12 | migration + ledger row (again) | pass | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 13 | `00` (after-forward-2) | pass — identical to step 3 | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 14 | `20`, `91` (`ws_alias_max_id_before='8'`), `00` | pass — clone left forward, no fixture data, no STOP at any point | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |

No real-looking person field appeared in any result (all rows were synthetic `Fixture` / `Person n`). Production `gteygwfgjvczanmrwgbr` and normal dev `dpnnmkhabysfdogllsyh` were not touched.

