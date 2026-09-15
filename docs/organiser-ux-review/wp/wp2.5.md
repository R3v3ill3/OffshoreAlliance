# WP2.5 — Compare matrix

Status: **Revision 1 (2026-09-15) — planned, not started. §9.1 carries eleven decisions for the operator (MX, CK, CS, CL,
DG, EM, TG, VZ, VE, DS, AC); every one has a recommendation and the package can start on the recommendations alone
if the operator answers "as recommended".**
Written against `main` at `7e8a3fab`, which carries WP2.4 merged (PR [#46](https://github.com/R3v3ill3/OffshoreAlliance/pull/46)
at `5a16de07`; `PROGRESS.md` ledger row 2.4). Depends on WP2.1 (production 2026-09-14, `wp/wp2.1.md` §15), WP2.2
(production 2026-09-15, `wp/wp2.2.md` §9.2) and WP2.4 (merged; `wp/wp2.4.md`). Runs in parallel with WP2.6 and WP2.7
on disjoint files (`wp/wp2.4.md:806–820` §3.18).

Branch (proposed): `feat/oux-wp2.5-compare-matrix` off `main`. Draft PR into `main`. **No migration** (§0, §3.11), so
the promotion gate of `PROGRESS.md` standing notes does not bind this package; the merge deploys code that is inert
for every user without the per-user `groups_v2` flag.

This document follows `wp/README.md` and the shape of `wp/wp2.4.md`: specification → current state → plan → approval →
deviations → verification → review. §0 is first, as in `wp/wp2.2.md` and `wp/wp2.4.md`, because it states what the
package needs from the databases: nothing.

### Decision labels used in this document (each label is unique; none is reused from wp2.2/wp2.4)

| Label | Topic | Section |
|---|---|---|
| **MX-a / MX-b** | Where the matrix model lives and what it returns (pure ids vs pure ids + rating mix) | §3.3 |
| **CK-a / CK-b** | Where the `compare` prefs key sits: inside `wallChart`, or beside it at the top level | §3.11 |
| **CS-a / CS-b** | The shape of the stored compare state and how "resets when the primary group changes" is implemented | §3.11 |
| **CL-a / CL-b** | Click a cell → tiles: inline panel below the matrix, or a side sheet | §3.7 |
| **DG-a / DG-b / DG-c** | Drag out of a cell: onto row/column headers, none (dialog only), or onto another cell | §3.8 |
| **EM-a / EM-b** | Empty rows and columns: reuse the campaign-wide "Show empty units" switch, or a compare-only toggle | §3.6 |
| **TG-a / TG-b** | How "three-plus groups fall back to stacked bands" is read and made falsifiable | §3.9 |
| **VZ-a / VZ-b** | Virtualisation of large matrices, or a cap plus the empty-axis rule | §3.10 |
| **VE-a / VE-b** | Three additive exports from the WP2.4 v2 hooks, or a second copy of the pipeline | §3.4 |
| **DS-a / DS-b** | Use of the realistic data set for the 161-unit performance acceptance | §3.10 |
| **AC-a / AC-b** | How the acceptance is taken: operator by hand (E2-b pattern) or a credentialled Playwright run | §4.6 |

---

## 0. Where the schema has to be, and when (nothing to do)

Every database object this package reads is already on **production** and on **normal dev**, and no new object is
added. WP2.5 issues **no new query and no new RPC**: it reads the rows the v2 chart already holds and writes only
through calls WP2.4 already makes.

| Object | Where defined | Production | Normal dev |
|---|---|---|---|
| `campaign_groups` (read by `use-wall-chart-groups.ts:80–92`) | `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql:400–480` | 2026-09-13 | 2026-09-14 |
| `campaign_organising_units.group_id`, `campaign_worker_ou.group_id` (trigger-derived) | same file `:505`, `:513`, `:722–743` | 2026-09-13 | 2026-09-14 |
| `user_campaign_prefs(user_id, campaign_id, prefs jsonb, …)`, owner-only RLS `ucp_*` | same file `:781–831`; read/written by `lib/hooks/useUserCampaignPrefs.ts:98–150` | 2026-09-13 | 2026-09-14 |
| `structure_placements_move(… p_within_group_id …)` | `supabase/migrations/20260914090000_wp2_2_structure_api.sql:2630–2705`; wrapper `lib/campaign/structure-api.ts:328–341` (args), `:619–632` (call) | 2026-09-15 | 2026-09-14 |
| `campaign_group_membership` view (the §4.1 oracle only) | `supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:156–173` | 2026-09-15 | 2026-09-14 |

Consequences: no `supabase` CLI command, no connector call, no run sheet, no `gen:types`, no types regeneration and no
change under `supabase/` or `packages/db-types/` is part of this package. **Migration needed: no** — stated again in
§3.11 and §6.4 and proved by the `git diff --stat` in §5.

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 Specification (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:150`)

> **WP2.5 Compare matrix.** Standard implementer. Plan 5.6 Compare: rows are the primary group's units, columns the
> secondary group's, counts and rating mix per cell, click to show tiles. Acceptance: renders for the 161-unit campaign
> within the performance budget; three-plus groups fall back to stacked bands. Depends on WP2.4.

Standard implementer = `opus` at `xhigh` (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:52`); reviewer = a fresh `opus` at
`xhigh` (`:55` — the package touches no migration, no RLS and no worker data beyond what the v2 chart already renders;
it does write placements through an existing RPC, so §9.3 records that a Fable reviewer is the operator's call if they
prefer it).

### 1.2 Plan §5.6 Compare, verbatim (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:306`)

> - **Compare.** Adds a second group. Two groups render as a **matrix**: rows are the units of the primary group,
>   columns are the units of the secondary group (including Unassigned on both axes), each cell shows the count and the
>   rating mix, and clicking a cell shows those workers as tiles below. Three or more groups render as stacked bands;
>   that is allowed but not optimised. Compare is off by default and resets when the primary group changes.

The toolbar sketch that hosts it (`:302`): `[Group: Worksite ▾] [+ Compare]   [Colour by: Cumulative ▾]   [Filter (2)] [Search] …`.

Binding neighbours in the same section:

- `:305` **Group selector** — single-select, first group by default, `?group=`, remembered per campaign server-side.
  WP2.4 built it (`wall-chart/v2/group-selector.tsx`, `use-wall-chart-groups.ts`); WP2.5 does not change it.
- `:307` **Colour by** — campaign-wide. The cell's rating mix follows it (§3.5).
- `:308` **Filter** — one popover, one state, **applied to every unit shown**; therefore applied to every cell (§3.5).
- `:310` **Tile** — drag = move within the group; no copy drag (CP-a, `wp/wp2.4.md:564–582`).
- `:312` **State** — "Group, **compare**, colour-by, layout and filter are stored per user per campaign on the server".
- `:291` **Unassigned** — derived, never stored; a drop target that removes the worker from their unit *in that group*.
- `:489`, `:491` — do not materialise Unassigned; do not keep view state in localStorage.

### 1.3 Decisions that bind this package

- **Decision 4** (`DECISIONS.md:39`): "At instigation it is common for 100 % of the membership to be Unassigned…
  *Implication for WP2.4 and WP2.5:* … must render a whole membership (hundreds of tiles) within the performance
  budget, and the empty-structure state … must read as normal, not as an error." Named for this package explicitly:
  the all-Unassigned matrix is one cell (Unassigned × Unassigned) holding everyone, and the empty-structure state must
  read as normal (§3.6, §4.4).
- **Decision 5** (`DECISIONS.md:40`): "Employer and Worksite are two independent groups (facets), never parent and
  child … **Compare (employer × worksite) is the view for the intersection.**" This is the canonical use of the
  matrix and the shape the performance test measures (§3.10, §4.4).
- **Decision 3** (`:37`): a `custom` group carries a free-text label that is its display name — so axis headers use
  `campaign_groups.name`, never `kind`.

### 1.4 Binding handoffs from WP2.4

| Source | What it hands over |
|---|---|
| `wp/wp2.4.md:139–146` §1.5 | "**Compare** (plan `:306`) — WP2.5. The toolbar has a `compareSlot` prop and the prefs schema reserves `compare`." |
| `wp/wp2.4.md:806–820` §3.18 | WP2.5 **owns** `wall-chart/compare/**`, the toolbar's `compareSlot`, the prefs key `compare`, and the band's "matrix" mode; **consumes and must not edit** the selector, the prefs hook and `deriveGroupView`; **must not edit** `wall-chart/v2/wall-chart-toolbar.tsx` beyond filling the slot. WP2.5 branches from `main` after WP2.4's merge — done (`7e8a3fab`). |
| `wp/wp2.4.md:373–402` §3.1 | The nine principles WP2.5 inherits verbatim: one flag two shells; legacy path byte-for-byte; leaf components reused, compositions not; **one pipeline**; derived never stored; server-side view state; writes only through the structure API; pure first; plan §3.6 terminology. |
| `wp/wp2.4.md:600–648` §3.11 | The prefs document, its lenient parse, and the reserved `compare` key. |
| `wp/wp2.4.md:1152–1166` §8.4 | WP2.4's stop conditions; §8.4 below restates the ones that still bind and adds this package's. |
| `PROGRESS.md` standing notes (branch amendment 2026-09-15) | Work packages keep branch + PR; small follow-up fixes may go straight to `main`. WP2.5 is a work package: branch + draft PR. |
| `PROGRESS.md` standing notes (Supabase projects, 2026-09-14) | "When a package needs realistic data (**WP2.5 first**…), the planner says so and proposes the least invasive use, approved per package." — §3.10, decision DS. |
| `wp/wp2.2.md` D80/D81 (`PROGRESS.md` row 2.2; `wp/wp2.4.md:1207–1215`) | The sandbox cannot host a Playwright browser suite and the operator declined GitHub secrets, so the e2e spec is **written and type-checked but not run**; acceptance is the operator's by hand on the branch preview (E2-b). §4.6, decision AC. |

### 1.5 Not in WP2.5 (recorded so it is not folded in silently)

- **The List view's compare column** and anything under `workforce/workforce-list-view.tsx`, `workforce-bulk-toolbar.tsx`,
  `lib/campaign/workforce-view.ts` or the prefs key `layout` — **WP2.6** (`wp/wp2.4.md:812`).
- **Any editor for groups or units** (create, rename, reorder, delete a *group*; share-of-group sizing; auto-build) —
  **WP2.7** (`wp/wp2.4.md:813`). The matrix's ⋯ affordances are *not* extended; a unit is renamed from the band's card
  menu as WP2.4 built it (`wall-chart/v2/unit-card-menu.tsx`).
- **The assessment-distribution charts reading the selected group**, retiring `is_group_container` / `ou_group_id`,
  deleting the legacy chart, removing the flag — **WP2.8** (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:156`).
- **Touch drag** (`@dnd-kit` is a dependency but the wall chart still uses HTML5 dataTransfer, `wall-chart/dnd.ts:8–27`) —
  **WP4.1**. On a touch device the matrix is read-only for placement and the cell panel's **Move to unit…** dialog is
  the way to move someone (§3.8).
- **A third axis, saved comparisons, CSV export of the matrix, drill-through to the list view** — not specified; not built.
- **Cross-campaign mirror (SM / WP2.4b)** — its own package (`wp/wp2.4.md:731–784`); WP2.5 touches no file it owns.
- Any change to `campaign_organising_units` / `campaign_worker_ou` writers (the guard test
  `lib/campaign/__tests__/no-direct-structure-writes.test.ts` stays green with an empty inventory), any RPC, any
  migration, any reporting view, any legacy composition file.

---

## 2. Current-state map

### 2.1 Where the compare slot is

`wall-chart/v2/wall-chart-toolbar.tsx` already takes and renders the slot:

- prop declared `:47` and typed `:59–60` — `/** Reserved for WP2.5 Compare; empty in WP2.4. */ compareSlot?: ReactNode;`
- rendered `:215` — `{compareSlot}`, the last item of the flex row that holds Group (`:132–138`), Show empty units
  (`:139–151`), Colour by (`:151–157`) and Filter (`:158–214`), inside `WallChartSummaryHeader`'s `assessmentSelector`
  slot (`:129`). The file header says so at `:34`: "`compareSlot` is WP2.5's and is empty here."
- **Nothing passes it today.** The shell mounts the toolbar at `campaign-wall-chart-v2.tsx:196–207` without
  `compareSlot`. Filling it is a one-prop edit to the shell; the toolbar file is not edited at all (§3.13).

The shell's render branch that the matrix joins is `campaign-wall-chart-v2.tsx:233–239`:

```tsx
{!groupsState.ready ? (… "Loading the wall chart…") : groupsState.selection === "none" ? (
  <NotInAnyGroupView {...bandProps} />
) : (
  <WallChartGroupBand {...bandProps} />
)}
```

### 2.2 The prefs key

- The stored document is `user_campaign_prefs.prefs` with one key per package; WP2.4 owns `wallChart`
  (`lib/campaign/groups/wall-chart-prefs.ts:39`, `:108–120`).
- The reservation is written twice: `wall-chart-prefs.ts:19–24` ("`compare` (WP2.5) and `layout` (WP2.6) are reserved
  beside these and are carried, never interpreted, here") and `lib/hooks/useUserCampaignPrefs.ts:6–10` ("It owns the
  `wallChart` key only; every other key (`compare` for WP2.5, `layout` for WP2.6, anything later) is carried through
  `mergeWallChartPrefs` untouched"). `wp/wp2.4.md:628` puts `compare` **inside** the `wallChart` document
  ("// reserved, written by later packages: compare (WP2.5), layout (WP2.6)").
- **What the code actually does today, at both levels:** `mergeWallChartPrefs` (`:302–315`) carries every foreign
  top-level key *and* every foreign key inside `wallChart` through a write; `parseWallChartPrefs` (`:158–226`) builds
  its output key by key from `wallChartPrefsShape` (`:108–120`) and therefore **drops** a `wallChart.compare` on
  read. Both behaviours are pinned: `lib/campaign/groups/__tests__/wall-chart-prefs.test.ts:45` (a top-level
  `compare` and a `wallChart.compareLocal` survive a parse of the surrounding document), `:184–196` ("writes the
  wallChart key and keeps every foreign key at both levels"), `lib/hooks/__tests__/useUserCampaignPrefs.test.tsx:69–70`,
  `:185–186`.
- So the reservation is real for *writes* and absent for *reads*: making `compare` readable is exactly the edit WP2.5
  owns (§3.11, decision CK).
- The hook's public surface: `WallChartPrefsPatch = Partial<Omit<WallChartPrefs, "v">>` and
  `SetWallChartPrefs = (patch, opts?: { debounce?: boolean }) => void` (`useUserCampaignPrefs.ts:62–64`); the read
  memo is `parseWallChartPrefs(mergeWallChartPrefs(query.data, overlay)[WALL_CHART_PREFS_KEY], known)` (`:121–124`);
  the write sends the whole last-read document with the whole overlay merged in (`:168–185`), debounced at 400 ms
  when asked (`:187–200`).

### 2.3 The group derivations the cells must reuse

`lib/campaign/groups/derive-group-view.ts` (pure, no React, never throws — `:1–22`):

| Export | Line | What it gives the matrix |
|---|---|---|
| `unitsOfGroup(ous, groupId)` | `:82–87` | the axis: the units of a group in the units query's order (`display_order, name`, `use-wall-chart-structure.ts:53–61`), containers that carry a group included, `group_id NULL` containers never |
| `deriveGroupView(members, ous, placements, groupId)` | `:124–158` | `{ units, workersByUnit, unassignedWorkerIds, placementByWorker }` — one call per axis is the whole matrix (§3.3) |
| `notInAnyGroup(members, ous, placements)` | `:165–182` | the view WP2.4 renders at `?group=none`; compare is unavailable there (§3.6) |
| `groupOfUnit(ous, ouId)` | `:90–93` | which axis a drop target belongs to (§3.8) |
| `unitsByWorker(placements)` | `:102–112` | the all-groups index; used by the "in unit of another group" filter, not by the matrix |

The semantics are stated once at `:9–18` and pinned against the SQL by the equivalence test
`lib/campaign/groups/__tests__/derive-group-view.test.ts` (the `campaign_group_membership` definition transcribed into
the fixture generator). **Every compare cell derives from these two calls and from nothing else** — the constraint the
orchestrator set, and the reason §4.1 can prove the matrix against the same oracle.

In the mounted chart the primary axis is already computed: `use-wall-chart-group-view.ts:220–226` calls
`deriveGroupView` for the selected group, sorts each unit's list by name (`:145–160`), and exposes `groupUnits`,
`workersByUnit`, `unassignedWorkerIds`, `placementByWorker` (`:232–250`) plus `unitsByGroup` — a map from every group
id to its units (`:285–289`), which is exactly what the secondary-axis selector needs.

### 2.4 Ratings data available for the rating mix

Nothing new has to be fetched.

- `metrics.ts:81–217` `computeMetrics(workerIds, workerById, ratingByWorker, isParticipating?, assessmentInput?)`
  returns `WallChartMetrics` (`:15–47`) whose `ratingBuckets: { r1, r2, r3, r4, unrated }` (`:46`, filled `:154–165`)
  **is** the rating mix, and whose `assessment: AssessmentMetrics | null` (`:38`, `:181–213`) carries the selected
  assessment's numbers when Colour by names one.
- The inputs are already in the mounted chart: `ratingByWorker` and `workerById` from
  `use-wall-chart-group-view.ts:135–144` (index `:395–406`), the assessment metrics input from
  `use-wall-chart-view-v2.ts:263–266` (`buildAssessmentMetricsInput(colourBy, activityRatingsByActivityId)`), the
  participation predicate from `:183–187`.
- The renderer exists: `unit-summary-metrics.tsx:34–65` `CompactRatingsBar({ buckets, total })` — a 6 px stacked bar,
  five segments (`bg-sky-500`, `bg-emerald-500`, `bg-amber-500`, `bg-red-500`, `bg-zinc-300`), a `title` tooltip
  listing each label with count and per cent, `aria-label="Rating distribution"`. It is already used by
  `UnitSummaryMetrics` (`:90`, `:175`) and by the sticky summary header (`wall-chart-summary-header.tsx:147`).
- Tile colour comes from the same selection through `rating-colour.ts:6–8`, `:45–57`; the cell mix and the tiles in the
  panel below therefore agree by construction.

### 2.5 The tile, the card and the sheet the panel reuses

- `WallChartTile` (`wall-chart/wall-chart-tile.tsx`) is mounted from one `WallChartTileContext`
  (`campaign-wall-chart-v2.tsx:114–149`): `index`, `scopeState` (campaign-wide colour-by and badges, no overrides —
  `use-wall-chart-view-v2.ts:292–300`), `selection`, `workerDetail`, the build-list wiring and the WP1.7 hint. The v2
  index is **group-scoped** (`use-wall-chart-group-view.ts:236–241`, `:400–402`), so `inMultipleUnits` is false and
  the ◫ indicator never renders.
- Drag payload: `wall-chart-tile.tsx:153–172` — `onDragStartRefs` returns the whole selection when the dragged tile is
  selected, otherwise the one tile; each ref is `{ workerId, fromOuId, fromOuType }` (`dnd.ts:13–22`), serialised under
  `DND_MIME_TYPE = "application/x-oa-wallchart-worker"` (`:8`).
- Drop: `campaign-unit-card.tsx:149–182` — `handleDragOver` accepts only that MIME type (`:152`), `handleDrop` parses
  the payload and calls `onWorkerDrop({ targetOuId, payload, mode })` (`:55–59`, `:181`). A drop target outside a
  `CampaignUnitCard` must reproduce those ~20 lines (§3.8).
- Card: `CampaignUnitCard` (`campaign-unit-card.tsx:18–102`) already has everything the cell panel needs —
  `ou={null}` + `fallbackTitle` for a pseudo-unit (`:20–22`), `workerCount`, `summary`, `assessmentLabel`,
  `countAction` for "Select all" on the count (`:95–101`, added by WP2.4), `unitDragPayload` for the build list
  (`:86–89`). `wall-chart/v2/not-in-any-group-view.tsx:131–168` is the worked example of using it as a pseudo-unit.
- Sheet: `worker-detail-sheet.tsx` Units tab lists every placement prefixed with its group name (WP2.4 §3.13); the
  chart registers the group names at `campaign-wall-chart-v2.tsx:105–111`. Clicking a tile in a cell opens the same
  sheet through `workerDetail.openWorkerDetail`, unchanged.

### 2.6 The one pipeline, and what it does not expose yet

`use-wall-chart-view-v2.ts` is WP2.4 principle 4 in code: one filter, one sort, one Colour by (`:44–59`).

- `visibleIds(ids)` (`:215–246`) — `applyFilters` → participation → `applySort`; **a callback over any id list**, which
  is precisely what a cell needs. It is used to build `visibleByUnit` (`:247–251`), `visibleUnassigned` (`:252`) and
  `visibleNotInAnyGroup` (`:253`) but is **not returned** (`:302–329`).
- `metricsInput` (`:263–266`) and `participationPredicate` (`:183–187`) are likewise internal; the four metric maps
  built from them are returned (`:326`).
- `renderedUnits` / `emptyHiddenCount` (`:256–260`) implement "Show empty units" for the band: a unit with no visible
  worker after filtering is dropped unless `showEmptyUnits` is on (`wallChart.showEmptyUnits`, `:138–139`).

`use-wall-chart-actions-v2.ts` is WP2.4 principle 7 in code:

- `planFor(refs, targetOuId)` (`:54–72`) plans against the **selected** group when one is selected, and — in the Not in
  any group view — against the target unit's own group, by calling `deriveGroupView` for that group (`:59–69`). A drop
  on a unit of the *secondary* group while a primary group is selected would therefore be planned against the primary
  group and refused as a no-op (`plan-drop.ts:72`). This is the one place WP2.5 needs a generalisation (§3.4, VE).
- `executePlan` (`:74–93`) issues `moveWorkers.mutate` — one `placements.move` per source unit for a `move`, one
  `placements.move({ toOuId: null, withinGroupId })` for an `unassign` — toasts the structure API's sentence on
  refusal and clears the selection on success.
- `planDrop` (`lib/campaign/groups/plan-drop.ts:48–82`) is pure: distinct workers in first-seen order, the source
  re-derived from the group view rather than the drag payload (`:51–58`, `:75–79`), a target outside the group's units
  a no-op (`:72`), a drop on `null` an unassign within the group (`:60–69`).

### 2.7 The control census as WP2.4 left it

`wall-chart/v2/__tests__/wall-chart-v2.control-census.test.tsx` renders the whole board with the flag on and asserts
the exact toolbar list and the fixed-page totals:

- `:216–231` — `expect(c.toolbar.controls).toEqual(["Group", "Show empty units", "Colour by", "Filter", "Badges: none", "%", "#", "Links", "Find worker", "Add worker", "Import Workers", "Units (2)"])`
- `:232` — `expect(fixedPageTotal(c)).toBe(24)` (build list closed); `:243` — `.toBe(25)` (build list open)
- `:201–213` — no `View` / `Badges` / `Sort` / `Filter` control inside any unit card; nothing named `Apply to all
  units`, `Unit view`, `Show sub-units`, `Expand all`, `Collapse all`, `Copy to unit…` anywhere.

Adding one toolbar control moves those three numbers. That is the **census delta** this package must produce and
report (§4.3), not a test to route around.

### 2.8 The harness and the fixtures

`wall-chart/__tests__/harness/`:

- `fixture.ts:32–46` fixture shape (rows by table name, JSON by `/api/…` path); `:404–437` `buildWallChartFixtureV2`
  with `prefs`, `withEmployerGroup`, `syncResult` and `groups` knobs, both hints dismissed by default.
- `small` groups `:175–179`: Employer (1), Worksite (2), Shift (3) — **three groups**, which is what the TG test
  (§3.9) and the secondary selector need.
- `large` groups `:190–194`: Worksite (2, 153 units — 32 vessels + 121 sites) listed first, Employer (1, 8 containers).
  **Worksite × Employer on the 305-member / 161-unit fixture is 153 × 8 (+ the two Unassigned axes) = 1,386 cells** —
  the synthetic twin of decision 5's employer × worksite view on campaign 57, and the shape §4.4 measures.
- `backend.ts` records `rpcInvocations()` (`:298`), `writeInvocations()` (`:239`) and `queryInvocations()` (`:244`),
  answers RPCs with `answerRpc` (`:291`) and refuses direct structure writes (`:57`).
- `mount.tsx` guarantees every enabled query settles before the DOM is handed back (`:111–119`) and provides
  `click` (`:234`), `contextMenu` (`:244`), `keydown` (`:251`), `createDataTransfer` (`:268`) and
  `dragAndDrop` (`:302`); `locate.ts` provides `unitCard`, `tileButton`, `button`, `accessibleName`, `selectOption`.
- The v2 suites mount the chart (or the whole `WorkforceBoard`) with `vi.mock("@/lib/workspace/use-workspace", () => ({ useWorkspace: () => ({ flags }) }))`
  and `flags = vi.hoisted(() => ({ groupsV2: true }))` — `wall-chart-v2.control-census.test.tsx:36`, `:52–54`.

### 2.9 Performance baseline to beat

`wall-chart/v2/__tests__/wall-chart-v2.render-cost.test.tsx` measures the legacy chart and the v2 chart in **one
process, one run** (`:87–117`): three mounts each, median reported, `NOT_WORSE_FACTOR = 1.1` (`:53`) and an absolute
`LEGACY_BUDGET_MS = 6000` (`:51`). The ledger records the WP2.4 result: "render cost v2 largest group ~2.8 s vs legacy
~8 s same run" (`PROGRESS.md` row 2.4). The verification standard the programme set is
`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:82`: "the wall chart for a campaign of 305 members and 161 units (campaign 57
in appendix G) must render in under two seconds on the dev preview and must not issue more queries than today".

WP2.5 adds **zero queries**: the matrix is two `deriveGroupView` calls over rows the chart already holds. That half of
the standard is met by construction and proved by the `queryInvocations()` assertion in §4.3.

---

## 3. Target design

### 3.1 Principles (inherited from `wp/wp2.4.md:373–402`, restated where WP2.5 narrows them)

1. **Compare is a mode of the v2 chart, not a second chart.** One flag (`groups_v2`), one shell
   (`campaign-wall-chart-v2.tsx`), one toolbar, one filter, one Colour by, one prefs document. The matrix replaces the
   band and nothing else; turning Compare off restores the band exactly.
2. **The legacy path stays byte-for-byte.** No legacy composition file is opened. With the flag off, `pnpm test`'s
   legacy suites and the legacy e2e specs are unchanged and green.
3. **Cells derive from the same group derivations.** Every count in the matrix is a function of the two
   `deriveGroupView` results for the two axes — never a third definition of "who is in this unit", never a query.
4. **One pipeline.** A cell's visible workers are `visibleIds(cellWorkerIds)` from the *same* `useWallChartViewV2`
   callback the band uses; a cell's mix is `computeMetrics` over the same inputs. Nothing is filtered or sorted twice
   and nothing is filtered differently.
5. **Derived, never stored.** The matrix, its Unassigned row and column, and the cell membership are pure functions.
   No row, no synthetic unit, no negative id, no materialised intersection.
6. **Server-side view state.** Whether Compare is on and which group is secondary live in `user_campaign_prefs`; the
   selected cell does not (it is ephemeral, like a text selection). No `localStorage` key is read or written.
7. **Writes only through the structure API**, and only through `placements.move` — the call WP2.4 already makes, with
   the arguments `planDrop` already produces. No new RPC, no new call site outside `useWallChartActionsV2`.
8. **Pure first.** The matrix model, the compare-state resolution and the axis ordering are pure functions under
   `src/lib/campaign/groups/` with vitest beside them, before any component exists.
9. **Terminology** (plan `:122–133`): Group, Unit, Unassigned, Not in any group, Colour by. The secondary axis is
   "Compare with"; a cell is named "<Row unit> × <Column unit>"; never "cross-tab", "pivot" or "facet" in the UI.

### 3.2 The Compare control (filling `compareSlot`)

One control, in the slot the toolbar already renders (`wall-chart-toolbar.tsx:215`):

`wall-chart/compare/compare-control.tsx` — a `Select` labelled **Compare** whose options are:

- **Off** (default, always first), then
- one option per *other* group in display order, labelled with `campaign_groups.name` (decision 3: a custom group's
  free-text label is its name). Groups with **no units** are listed and disabled with the hint "No units yet" (a
  matrix against an empty axis is one Unassigned column and reads as a mistake).

The control is **disabled with a title** in two states: when the selection is "Not in any group" ("Choose a Group to
compare") — there is no primary axis — and when the campaign has fewer than two groups ("This campaign has only one
Group"). It is always rendered, as the Group selector is (plan `:305`), so the concept is visible from day one.

Changing it: writes the prefs document (§3.11), clears the selected cell, clears the tile selection (a selection made
in the band's cards has no meaning in a different intersection), and fires
`trackWallchartGroupSelected({ control: "compare_secondary", … })` — one new member of the existing
`GroupSelectionControl` union (`lib/analytics/events.ts:128`), which WP2.4 already extended with `"group_selector"`;
the event name is unchanged so the phase-0 baseline series continues.

**No `?compare=` URL parameter.** The Group selector owns `?group=` because a shared link must carry the view
(`wp/wp2.4.md:600–612`); a second parameter doubles the resolution surface for a preference that is per user and
recoverable in one click. Recorded as a deliberate asymmetry in §8.2; if the operator wants shareable compare links it
is one more step in `resolveCompare` and one more `params.set`, and the plan says so rather than building it now.

### 3.3 The matrix model (MX) — `lib/campaign/groups/compare.ts`

**MX-a (recommended).** One pure module, no React, no I/O, never throws, returning **worker ids only**; the rating mix
is computed by the caller with the existing `computeMetrics`, so there is exactly one implementation of "what a rating
mix is" in the app (§2.4) and the pure module needs no rating types at all.

```ts
export type CompareAxisEntry<U> = { kind: "unit"; ouId: number; unit: U } | { kind: "unassigned" };

export type CompareCell = {
  rowKey: number | "unassigned";
  colKey: number | "unassigned";
  /** Members in this intersection, in the caller's member order. */
  workerIds: number[];
};

export type CompareMatrix<U> = {
  rowGroupId: number;
  colGroupId: number;
  rows: CompareAxisEntry<U>[];          // units of the row group in query order, then Unassigned last
  cols: CompareAxisEntry<U>[];          // ditto for the column group
  /** `${rowKey}:${colKey}` → cell. Every (row, col) pair has an entry, empty or not. */
  cells: Map<string, CompareCell>;
  rowTotals: Map<number | "unassigned", number>;
  colTotals: Map<number | "unassigned", number>;
  total: number;                        // = members counted once
};

export function cellKey(rowKey: number | "unassigned", colKey: number | "unassigned"): string;

export function buildCompareMatrix<U extends GroupUnitLike>(
  members: readonly GroupMemberLike[],
  ous: readonly U[],
  placements: readonly GroupPlacementLike[],
  rowGroupId: number,
  colGroupId: number
): CompareMatrix<U>;
```

Implementation, stated so the reviewer can check it against the SQL: `buildCompareMatrix` calls
`deriveGroupView(members, ous, placements, rowGroupId)` and `deriveGroupView(…, colGroupId)` (`derive-group-view.ts:124–158`)
and then walks `members` **once**, putting each member in the cell
`(rowView.placementByWorker.get(w) ?? "unassigned", colView.placementByWorker.get(w) ?? "unassigned")`. Consequences
that the tests pin (§4.1):

- Rows are `rowView.units` — `unitsOfGroup` order, i.e. the units query's `display_order, name` — then **Unassigned
  last**, mirroring the band (`wall-chart-group-band.tsx:68`, plan `:291`). Columns likewise.
- `rowTotals` equals the band's per-unit counts for the row group, and `total` equals the member count: the matrix is a
  partition of the membership on both axes, which is what "every group is a complete partition" (plan `:277`) means
  made visible. This is the property the equivalence test asserts against `campaign_group_membership`.
- A member with no placement in either group lands in (Unassigned, Unassigned) — decision 4's instigation state is one
  cell holding everyone.
- A placement on a legacy container with `group_id NULL` counts for no axis (`derive-group-view.ts:16–18`), so such a
  worker is Unassigned on both axes; pinned by a test case, as WP2.4 pinned it for `notInAnyGroup`.
- `rowGroupId === colGroupId` is a caller error; the function returns a matrix with `cols = []` and `cells` empty
  rather than throwing, and the UI never offers it (the Compare control lists *other* groups only).
- Cost: O(members + units). No per-cell scan, no nested loop over units.

**MX-b (not recommended).** Fold the mix into the pure function by passing `ratingByWorker` and returning
`{ count, buckets }` per cell. Rejected: it duplicates `metrics.ts:154–165`'s bucket thresholds (a second place to
drift), it cannot produce the assessment half of the mix (which needs `AssessmentMetricsInput`,
`metrics.ts:60–65`), and it makes the pure module depend on wall-chart types it otherwise does not need.

Also in `compare.ts` (pure, tested beside it):

```ts
export type CompareState = { primaryGroupId: number; secondaryGroupId: number };
/** The stored `compare` value resolved against the live groups and the live primary selection. */
export function resolveCompare(input: {
  groups: readonly GroupLike[];
  selection: GroupSelection;            // the primary, from useWallChartGroups
  stored: unknown;                      // prefs.wallChart.compare, already schema-parsed or raw
}): CompareState | null;
```

### 3.4 Composition, and the three additive exports (VE)

New files under `components/campaigns/wall-chart/compare/` (the directory §3.18 of WP2.4 gives this package):

| File | Role |
|---|---|
| `use-wall-chart-compare.ts` | The mode: `resolveCompare` against the live groups and selection; `setSecondary`; the selected cell (React state, ephemeral); the matrix from `buildCompareMatrix`; per-cell visible ids and metrics through the VE exports; the empty-row/column rule; the drop planner for the two axes. |
| `compare-control.tsx` | The toolbar control of §3.2. |
| `compare-matrix.tsx` | The `<table>`: row headers, column headers, cells, totals, the axis drop targets (§3.8), the overflow container. |
| `compare-cell.tsx` | One cell: the count, the `CompactRatingsBar`, the pressed/selected state, the accessible name. |
| `compare-cell-panel.tsx` | The tiles of the selected cell, below the matrix (§3.7). |

**VE-a (recommended)** — three additive, default-preserving exports so there is one pipeline, not two:

| Hook | Added to its return object | Why |
|---|---|---|
| `use-wall-chart-view-v2.ts` | `visibleIds` (the existing callback, `:215–246`) | a cell's visible workers are the band's filter and sort, applied to the cell's ids |
| `use-wall-chart-view-v2.ts` | `computeScopeMetrics: (ids: number[]) => WallChartMetrics` — one `useCallback` wrapping the existing `computeMetrics(ids, workerById, ratingByWorker, participationPredicate, metricsInput)` (the exact call of `:272–278`) | a cell's rating mix is the band's metric, not a second one |
| `use-wall-chart-actions-v2.ts` | `moveRefsInGroup(refs, targetOuId, groupId, onDone?)` — the body of the existing `planFor` (`:54–72`) with the group passed in; `moveRefsTo` (`:106–117`) becomes a one-line call to it with the selected group | a drop on a **column** header plans against the secondary group; today `planFor` would refuse it as a no-op (`plan-drop.ts:72`) |

Each is a pure addition to a returned object or a parameter with the current value as its default; no call site
changes behaviour, and WP2.4's `wall-chart-v2.interaction.test.tsx` (63 cases) must stay green **unchanged** — a stop
condition (§8.4 item 3). These three files are WP2.4's by §3.18's ownership column, so the PR body names the edits
explicitly and the diff keeps them to those lines.

**VE-b (not recommended).** The compare hook rebuilds `applyFilters` → participation → `applySort` and
`computeMetrics` itself. Rejected: it contradicts WP2.4 principle 4 ("one pipeline"), and a filter fix would then have
to be made twice.

Shell edit (`campaign-wall-chart-v2.tsx`), three lines in total:

```tsx
const compare = useWallChartCompare({ groupsState, structure, view, wallChart, setWallChart, selectionClear: selection.clear });
…
<WallChartToolbar … compareSlot={<CompareControl {...compare.control} />} />
…
{!groupsState.ready ? (…) : groupsState.selection === "none" ? (
  <NotInAnyGroupView {...bandProps} />
) : compare.state ? (
  <CompareView {...bandProps} compare={compare} />     // matrix + cell panel
) : (
  <WallChartGroupBand {...bandProps} />
)}
```

`CompareView` lives in `compare/compare-matrix.tsx` and composes the matrix and the panel; the shell gains one hook
call, one prop and one branch. **`wall-chart-toolbar.tsx` is not edited at all** (§3.13).

### 3.5 What a cell shows

Per cell, in this order (top to bottom, ~72 px tall, the whole cell one `<button>`):

1. **Count** — `visibleIds(cell.workerIds).length`, the number of members of that intersection that pass the one
   campaign-wide Filter. When a filter is active and it differs from the unfiltered count, the unfiltered count is in
   the button's `title` ("12 of 31 match the current Filter"), never as a second number on screen.
2. **Rating mix** — `<CompactRatingsBar buckets={m.ratingBuckets} total={m.total} />` over the **visible** ids, where
   `m = computeScopeMetrics(visible)`. `CompactRatingsBar` returns `null` for an empty scope
   (`unit-summary-metrics.tsx:35`), so an empty cell is a count and nothing else.
3. When **Colour by** names an assessment, the bar is joined by the assessment's one-line figure the band already
   shows for a unit — `m.assessment.avgRating` (or, for a binary assessment, `binarySupportiveCount / binaryTotalRated`,
   `metrics.ts:49–58`) — as text, so the cell agrees with the tiles it opens.

The cell's accessible name is `"<Row unit> × <Column unit>: N workers"` and its `aria-pressed` reflects whether it is
the selected cell. `%`/`#` (`wallChart.displayMode`) is honoured: in `pct` mode the count reads as a percentage of the
**row** total with the absolute in the `title` (a row is a unit of the primary group, so "how is KGP split across
employers" is the question the percentage answers).

Row header: the unit's name (`ouDisplayName`, `types.ts`), its row total, and its rating mix over the row's visible
ids — the same numbers the band's card shows, which is the cross-check a reader can make by eye. Column header:
name and column total. The corner cell carries the two group names ("Worksite × Employer"). The last row and column
are `Unassigned in <Group>`, always rendered (plan `:306` "including Unassigned on both axes").

### 3.6 Empty rows and columns, Unassigned, and the empty-structure state (EM)

**EM-a (recommended).** The campaign-wide **Show empty units** switch the toolbar already carries
(`wall-chart-toolbar.tsx:139–151`, `wallChart.showEmptyUnits`) governs both axes: with it off, a row whose visible
total is 0 and a column whose visible total is 0 are hidden, and the matrix's caption reads "N empty rows and M empty
columns hidden — turn on Show empty units to see them", the same sentence pattern the band uses
(`wall-chart-group-band.tsx:62–67`). With it on, every unit of both groups is a row or column. One switch, already
persisted, already in the toolbar, and the same meaning in both modes.

The **Unassigned row and column are never hidden by this rule** — they are the point of the view (a full Unassigned
column is "these people have no employer recorded"), so they are always last and always present, exactly as the band
always renders the Unassigned card (`wall-chart-group-band.tsx:68`, `wp/wp2.4.md:546–556`).

Hidden units (HU-a, `wp/wp2.4.md:650–658`) also apply: a unit the user has hidden in the Units manager is not a row.
The Units manager lists the **selected (primary) group's** units only (`use-wall-chart-group-view.ts:252–261`), so a
hidden unit of the secondary group is *not* excluded from the columns; recorded in §8.2 as a known asymmetry, with the
mitigation that the matrix's caption says "N of M units shown" per axis when either axis is reduced.

**Empty structure (decision 4):** zero groups → Compare is disabled and the shell is already in the Not in any group
view; one group → Compare is disabled with "This campaign has only one Group"; two groups with no placements → one
cell (Unassigned × Unassigned) holding everyone, with the sentence "No one is placed in a Unit of either Group yet."
No error state anywhere.

**EM-b (not recommended).** A compare-only `showEmptyAxes` toggle. Rejected: a second control with the same meaning,
a second prefs key, and a state the user has to set twice.

### 3.7 Click a cell → tiles (CL)

**CL-a (recommended).** An **inline panel directly below the matrix** — plan `:306` says "clicking a cell shows those
workers as tiles below", and the panel is one `CampaignUnitCard` used as a pseudo-unit exactly as
`not-in-any-group-view.tsx:131–168` uses it:

- `ou={null}`, `fallbackTitle={"<Row unit> × <Column unit>"}` (Unassigned axes read "Unassigned in <Group>"),
  `workerCount` = visible count, `assessmentLabel` = the campaign-wide Colour by title or "Cumulative",
  `summary={<UnitSummaryMetrics metrics={cellMetrics} mode={displayMode} compact … />}`,
  `countAction` = the "Select all in <cell>" click WP2.4 added (`campaign-unit-card.tsx:95–101`),
  `unitDragPayload` when the build list is open.
- Tiles are `WallChartTile` under the shell's existing `tileContext`, with `ouId` = the **row** unit's id (or `null`
  for the Unassigned row) and `scopeKey` the same, so the selection key, the "Remove from <primary group>" bar action
  and the rating hint keep the meaning they have in the band.
- The panel carries a close ×, is `aria-live="polite"`, and the matrix cell that opened it keeps `aria-pressed="true"`.
  Choosing another cell replaces it; changing the Filter, Colour by, the primary group or the secondary group closes it.
- The panel is **not** a drop target (dropping "into the intersection" would be two writes without a transaction —
  §3.8 DG-c); its tiles are draggable.
- Empty cell clicked: the panel opens with "No one is in <Row> × <Column>." (or "No one here matches the current
  Filter." when the unfiltered cell is non-empty) — the wording the band already uses
  (`wall-chart-unassigned-card-v2.tsx:242–248`).

**CL-b (not recommended).** A right-hand `Sheet`. Rejected: the worker sheet already owns that side of the screen
(`campaign-worker-detail-provider.tsx`), two stacked sheets is the pattern the review called out, and "below" is what
the plan says.

### 3.8 Drag out of a cell (DG)

**DG-a (recommended).** Tiles in the cell panel are draggable (they already are — the tile context always provides
`onDragStartRefs`), and the drop targets are the matrix's **row headers and column headers**:

- Drop on **row header R** (a unit of the primary group, or the Unassigned row) → `moveRefsInGroup(refs, R.ouId,
  primaryGroupId)` → `planDrop` → **one `placements.move` per source unit**, or, for the Unassigned row,
  `placements.move({ toOuId: null, withinGroupId: primaryGroupId })`.
- Drop on **column header C** → the same against `secondaryGroupId`.
- Each drop therefore changes **one** axis; the worker's position on the other axis is untouched, which is the
  per-group semantics WP2.2b enforces (one unit per worker per group) and WP2.4 proved (`wp/wp2.4.md:907–955` flow three).
- The header is a plain element with the twenty lines of `campaign-unit-card.tsx:149–182` restated: accept only
  `DND_MIME_TYPE` (`dnd.ts:8`), `preventDefault` on dragover, `parseDragPayload` on drop, ring while over.
  `mode` is ignored (CP-a: Shift is the same move, `wp/wp2.4.md:564–582`).
- A refusal toasts the structure API's sentence through `structureErrorMessage`, as `executePlan` already does
  (`use-wall-chart-actions-v2.ts:86–88`).
- Keyboard and touch parity: the cell panel's selection bar keeps **Move to unit…**, and in compare mode the dialog's
  target list has two sections — the primary group's units + "Unassigned in <primary>", and the secondary group's
  units + "Unassigned in <secondary>" — each target routed to `moveRefsInGroup` with its own group. This is the only
  way to move someone on a touch device until WP4.1, and it is the accessible path.

**DG-b.** No drag in compare; the Move to unit… dialog only. Simpler by one component and perfectly usable; it is the
fallback if the reviewer judges the header drop targets too much surface for this package, and the plan is written so
that dropping DG-a costs only `compare-matrix.tsx`'s drop handlers and three interaction tests.

**DG-c (rejected, recorded so it is not proposed later).** Dropping on a **cell** — "put this person in KGP *and*
Acme". It reads well and it is two `placements.move` calls with no transaction around them: a refusal on the second
leaves the worker half-moved, and `structure_placements_move` has no two-group form
(`20260914090000_wp2_2_structure_api.sql:2630–2705`). Not built. If it is ever wanted it is an RPC change and
therefore a migration and the promotion gate — i.e. a different package.

### 3.9 "Three or more groups fall back to stacked bands" (TG)

**TG-a (recommended reading).** Compare is a **two-group** view by construction: the Compare control names exactly one
secondary group (§3.2), so a three-way matrix cannot be asked for. A campaign with three or more groups therefore
keeps the WP2.4 behaviour — one group at a time as a stacked band, chosen from the Group selector — and the acceptance
criterion is met by a falsifiable pair of tests on the three-group `small` fixture (Employer, Worksite, Shift —
`fixture.ts:175–179`): with Compare on, the page shows one matrix of exactly two axes and no band; with Compare off,
the page shows the stacked band for the primary group and no matrix; the third group is reachable only by changing the
primary or the secondary. The UI states it once, in the Compare control's help text: "Compare shows two Groups at a
time. Switch Group to see another."

**TG-b (not recommended).** Read "three or more groups render as stacked bands" as a multi-select Compare that renders
a band per extra group. Rejected: plan `:306` marks it "allowed but not optimised", the toolbar sketch (`:302`) shows a
single `[+ Compare]`, and a three-axis view has no agreed cell semantics. If the operator reads it the other way, say
so at §9.1 and it becomes a follow-up, not a widening of this package.

### 3.10 Large matrices, virtualisation and realistic data (VZ, DS)

**Worst case in the repository:** the `large` fixture's Worksite (153 units) × Employer (8 units) = 153 × 8 plus both
Unassigned axes = **1,386 cells** over 305 members (`fixture.ts:190–194`, `wall-chart-v2.render-cost.test.tsx:103–105`).
Each cell is one `<button>` containing a count and a five-`div` bar — well under the 305 tiles + 155 cards the v2 band
already renders in ~2.8 s beside the legacy chart's ~8 s in the same run (`PROGRESS.md` row 2.4).

**VZ-a (recommended): no virtualisation, three cheap guards instead.**

1. **Show empty units off by default** (EM-a) removes every empty row and column; on production-shaped data most of a
   153 × 8 matrix is empty, so the rendered matrix is typically an order of magnitude smaller than the worst case.
2. **A cap.** When `rows × cols > COMPARE_CELL_CAP` (2,000 — above the worst case in the repository, below the point
   where the DOM matters), the matrix is not rendered: the view shows the band and a notice, "This comparison has
   N×M cells. Turn on a Filter, or turn Show empty units off, to narrow it." The cap is a pure function
   (`compare.ts`) and is tested.
3. **The matrix is a plain `<table>` in an `overflow-x-auto` container with sticky row and column headers** (CSS only:
   `position: sticky` on the first column and the header row). No measurement, no windowing, no new dependency —
   the repository has no virtualiser (`@dnd-kit` is present, `@tanstack/react-virtual` is not).

**VZ-b (not recommended).** Add a virtualiser. Rejected for this package: a new dependency, a new failure mode with
sticky headers and printing, and no evidence it is needed — §4.4 measures the real number and §8.4 item 5 stops the
package if it is wrong.

**Realistic data (DS).** `PROGRESS.md`'s standing note names WP2.5 as the first package that may want the realistic
data set (`yqjkuobcawvigsfpgrcm`, 22 campaigns / 2,407 workers / the 161-unit campaign; real contact details; not
wired to Vercel).

- **DS-a (recommended for the timing itself).** The performance acceptance is taken on the `large` fixture in the
  jsdom render-cost test (§4.4), beside the legacy chart's number from the same run — the standard WP2.4 set and the
  operator accepted (`wp/wp2.4.md:900–906`). It needs no database at all and it is reproducible in CI.
- **DS-b (recommended in addition, and it is the only database use this package proposes).** One **read-only** SQL
  file, `scripts/data-hygiene/oux-wp2.5/00_compare_shape.sql`, that reports for the realistic data set's largest
  campaigns: per campaign, the two largest groups by unit count, their unit counts, the number of **non-empty**
  intersections and the largest cell — counts only, **no worker names, no contact details, no personal data of any
  kind**, no writes, no `SET LOCAL`, safe on any project. Its purpose is to check that the fixture's 153 × 8 shape is
  not optimistic about campaign 57. The agent may run it on **normal dev** freely (reads are free) and on the
  realistic data set **with the operator's confirmation for that file**, in the pattern the operator approved for
  WP2.4's metrics SQL (`wp/wp2.4.md:822–840`, RD-b). Production is never touched by an agent; if the operator wants
  the production shape they run the same file themselves.
- Neither option needs a preview pointed at the realistic data set, and this package proposes none.

### 3.11 State: the `compare` prefs key, and no migration (CK, CS)

**CK-a (recommended): `compare` lives inside the `wallChart` document** — `prefs.wallChart.compare` — added to
`wallChartPrefsShape` (`wall-chart-prefs.ts:108–120`) as

```ts
compare: z.object({ primary: idSchema, secondary: idSchema }).strict(),
```

and dropped on read when either id is not in `known.groupIds` (the `keepKnown` pattern of `:148–151`, and
`KnownIds.groupIds` already exists at `:130`). Consequences:

- **No edit to `useUserCampaignPrefs.ts`** — which §3.18 of WP2.4 forbids. `WallChartPrefsPatch` is
  `Partial<Omit<WallChartPrefs, "v">>` (`useUserCampaignPrefs.ts:62`), so `setWallChart({ compare: … })` type-checks
  and inherits the overlay, the debounce, the "whole document merged" write (A1) and the failure behaviour for free.
- It is what `wp/wp2.4.md:628` reserved ("// reserved, written by later packages: compare (WP2.5), layout (WP2.6)"
  inside the `wallChart` object).
- It closes the read half of the reservation: today `wallChart.compare` survives a **write** (`mergeWallChartPrefs`,
  `:302–315`, pinned by `wall-chart-prefs.test.ts:184–196`) but is dropped by the **read**
  (`parseWallChartPrefs`, `:158–226`). §4.1 adds the round-trip case.
- The shell already passes `groupIds`? No — it passes only `activityIds` and `factFieldIds`
  (`campaign-wall-chart-v2.tsx:59–66`). WP2.5 adds `groupIds` to that memo from `groupsState.groups`; one line, and it
  is the shell, which this package edits anyway.

**CK-b (not recommended): a top-level `prefs.compare`,** beside `wallChart`. It is what the two hook tests happen to
use as their "foreign key" fixture (`useUserCampaignPrefs.test.tsx:69–70`), but it would need a second key-owning
path in `useUserCampaignPrefs` — the one file §3.18 tells WP2.5 not to edit — or a second hook writing the same row,
which is a lost-update race against the wall chart's own writes.

**CS-a (recommended): the stored value carries both ids, and "resets when the primary group changes" is a
derivation, not an effect.** `compare: { primary, secondary }`; absent = off. `resolveCompare` (§3.3) returns `null`
— i.e. Compare is off — when any of these holds: nothing stored; the stored `primary` is not the live selection; the
stored `secondary` no longer exists; `secondary === primary`; the selection is `"none"`. So switching the Group
selector turns Compare off **without touching `use-wall-chart-groups.ts`'s `setSelection` (`:152–172`)** — the file
§3.18 tells WP2.5 not to edit — and without an effect that could fire twice. Switching back to the earlier primary
does **not** silently restore the old comparison, because turning Compare on writes `{ primary, secondary }` afresh;
the stored pair is only ever honoured for the primary it was made under.

**CS-b (not recommended):** store `secondary` alone and clear it from an effect when the primary changes. Rejected:
an effect that writes prefs on a render caused by another write is the kind of loop the WP2.4 review spent a round on
(A1/A6, `wp/wp2.4.md:1493–1537`).

**Migration needed: no.** `user_campaign_prefs.prefs` is `jsonb` with `CHECK (jsonb_typeof(prefs) = 'object')`
(`20260912035329_wp2_1_campaign_groups.sql:781–831`); a new key inside it is not a schema change. Nothing else in this
package touches the database. The promotion gate (`PROGRESS.md` standing notes) does not apply, `gen:types` is not
run, no run sheet exists, and `git diff --stat main -- supabase/ packages/db-types/` must be empty (§5).

### 3.12 Telemetry, hints, print and accessibility

- Telemetry: `GroupSelectionControl` (`lib/analytics/events.ts:128`) gains `"compare_secondary"`; the existing
  `trackWallchartGroupSelected` payload is reused (`ou_type` = the secondary group's `kind`, `group_count` unchanged),
  so no new event name and no new dashboard. `noteFirstInteraction("filter")`-style first-interaction accounting is
  untouched.
- Hints: no new first-use hint. `wall_chart_group_selector` (`lib/hints/registry.ts:37–44`) already points at the
  Group control beside Compare; a second callout in the same row would collide with it, as the WP1.7 follow-up 1.7f
  found (`PROGRESS.md` row 1.7f).
- Print: the matrix prints as a table (`print:` classes, no `overflow` in print); the cell panel prints only when a
  cell is selected. The band's `print:break-inside-avoid` convention is kept on the panel card.
- Accessibility: a real `<table>` with `<caption>` naming the two groups, `<th scope="col">` / `<th scope="row">`, cells
  as `<button>`s with the names of §3.5 and visible focus rings; the drop targets are focusable and expose the same
  action through the Move to unit… dialog; the sticky headers do not trap focus; touch targets on cells ≥ 1 cm on
  small screens (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:84`). Below ~640 px the matrix scrolls horizontally with a
  sticky first column; the cell panel is full width.

### 3.13 File boundaries (what WP2.5 opens, and what it must not)

| File | WP2.5 |
|---|---|
| `lib/campaign/groups/compare.ts` (+ `__tests__`) | **new**, owned |
| `components/campaigns/wall-chart/compare/**` (+ `__tests__`) | **new**, owned (`wp/wp2.4.md:811`) |
| `lib/campaign/groups/wall-chart-prefs.ts` | **edited additively**: the `compare` key in the shape, its parse and its stale-id rule (the prefs key §3.18 assigns to WP2.5) |
| `components/campaigns/campaign-wall-chart-v2.tsx` | **edited**: one hook call, `groupIds` in the `KnownIds` memo, `compareSlot`, one render branch |
| `wall-chart/v2/use-wall-chart-view-v2.ts` | **edited additively**: two exports (VE-a) |
| `wall-chart/v2/use-wall-chart-actions-v2.ts` | **edited additively**: `moveRefsInGroup` (VE-a) |
| `wall-chart/v2/__tests__/wall-chart-v2.control-census.test.tsx` | **edited**: the census delta of §2.7 / §4.3 |
| `lib/analytics/events.ts` | **edited additively**: one union member |
| `wall-chart/__tests__/harness/fixture.ts` | **edited additively** only if a compare-specific fixture knob is needed; the existing `groups` / `prefs` knobs (`:404–437`) are expected to suffice |
| `wall-chart/v2/wall-chart-toolbar.tsx` | **not edited** — the slot already exists (`:215`) |
| `use-wall-chart-groups.ts`, `group-selector.tsx`, `useUserCampaignPrefs.ts`, `derive-group-view.ts`, `plan-drop.ts` | **not edited** (`wp/wp2.4.md:811` "must not edit") |
| every legacy composition file; `WallChartAssessmentCharts.tsx`; `workforce-list-view.tsx`; `workforce-bulk-toolbar.tsx`; `workforce-board.tsx`; `campaign-units-section.tsx`; `structure-api.ts`; the sync route; anything under `supabase/`; `packages/db-types/generated.ts`; any existing e2e spec or helper | **not edited** |

Collisions to watch while WP2.6 and WP2.7 run in parallel: `lib/analytics/events.ts` (additive unions, both packages
may add one), `wall-chart-prefs.ts` (WP2.6 adds `layout` beside WP2.5's `compare` — different keys, same file), and
the harness fixture. The implementer merges `main` into the branch before each stage's commit and re-runs the suites.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run in `pnpm test`

`lib/campaign/groups/__tests__/compare.test.ts`

1. **Shape and order**: rows are `unitsOfGroup(rowGroup)` in query order then Unassigned last; columns likewise; every
   (row, col) pair has a cell; `cellKey` is stable.
2. **Partition**: `rowTotals` equals the per-unit counts of `deriveGroupView(rowGroupId)` including its
   `unassignedWorkerIds.length`; `colTotals` likewise; `sum(rowTotals) === sum(colTotals) === total === members.length`.
3. **Equivalence with `campaign_group_membership`** (the §4.1 pattern WP2.4 set, `wp/wp2.4.md:843–850`): a fixture
   written as view rows (one row per member × group, `ou_id` null when unplaced) must reproduce the matrix cell by
   cell — the SQL of `20260914090100_wp2_2_one_unit_per_group_enforcement.sql:156–160` transcribed into the fixture
   generator so the test states the contract it checks.
4. **Unassigned on both axes**: a member placed in neither group is in (Unassigned, Unassigned); a member placed only
   in the row group is in (unit, Unassigned).
5. **Containers**: an Employer container that carries a `group_id` is an ordinary row/column; a legacy container with
   `group_id NULL` counts for no axis and its worker reads as Unassigned on both.
6. **Members only**: a placement whose worker is not a member is ignored; a duplicate member row is counted once.
7. **Degenerate inputs**: `rowGroupId === colGroupId` → empty columns, no throw; a group with no units → one
   Unassigned axis; zero members → every cell empty, `total` 0.
8. **Cap**: `exceedsCompareCap(rows, cols)` at and either side of `COMPARE_CELL_CAP`.
9. **`resolveCompare`**: off when nothing stored; off when the stored `primary` ≠ the live selection (plan `:306`
   "resets when the primary group changes"); off when the `secondary` no longer exists; off when `secondary ===
   primary`; off when the selection is `"none"`; on otherwise.

`lib/campaign/groups/__tests__/wall-chart-prefs.test.ts` (+ cases, existing cases unchanged)

10. `compare` round-trips through `parseWallChartPrefs` / `mergeWallChartPrefs`; a malformed `compare` is dropped
    without touching the keys beside it; a `compare` naming a group outside `known.groupIds` is dropped; the existing
    "keeps every foreign key at both levels" case (`:184–196`) still passes.

Test count must be ≥ the count on `main` at `7e8a3fab` (1,563 per `PROGRESS.md` row 2.4), recorded in Stage 1; no test
skipped, quarantined or deleted.

### 4.2 Contract tests (DB-backed) — none added

No RPC changes. The only call the compare view makes is `placements.move`, already covered on dev by
`lib/campaign/__contract__/structure-api.contract.test.ts` (move with `withinGroupId` and a null target `:1017`,
refusal of `withinGroupId` with a target `:1053–1055`). The contract suite is not re-run for this package unless the
reviewer asks; if it is, it needs the `OUX_CONTRACT_*` variables in the operator's shell and runs against normal dev only.

### 4.3 Interaction and census tests (jsdom, the WP2.3/WP2.4 harness) — `wall-chart/compare/__tests__/`

`wall-chart-v2.compare.interaction.test.tsx` — mounted like the WP2.4 suites (`vi.mock` of `next/navigation`, the
supabase client, `fetch-api`, the auth context, the worker-detail provider, `sonner`, and
`@/lib/workspace/use-workspace` with `flags.groupsV2 = true`), over `buildWallChartFixtureV2("small")` (three groups,
`fixture.ts:175–179`). Each item is one literal expectation:

1. The toolbar carries a **Compare** control; it lists the other two groups and **Off**, and is disabled with the
   "only one Group" title when the fixture is built with `groups: [one]`.
2. Choosing a secondary replaces the band with a `<table>`: rows = the primary's units then "Unassigned in <primary>",
   columns = the secondary's units then "Unassigned in <secondary>"; the corner names both groups.
3. Cell counts equal `buildCompareMatrix` over the fixture (computed in the test from the same fixture rows, so the
   assertion is a real oracle and not a restatement of the implementation).
4. **Prefs**: choosing a secondary upserts `user_campaign_prefs` with `wallChart.compare = { primary, secondary }` and
   every foreign key intact (`writeInvocations()`); a fixture seeded with `prefs: { wallChart: { compare: … } }` opens
   in compare mode; a seeded `compare` whose `primary` is not the resolved group opens in the band (CS-a).
5. **No new queries**: `queryInvocations()` after a mount in compare mode names exactly the tables a band mount names
   (the "not more queries than today" half of `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:82`).
6. **Click a cell** → the panel below shows exactly that cell's tiles, titled "<Row> × <Column>"; a second cell
   replaces it; the × closes it; an empty cell says so.
7. **Filter** applies to every cell and to the panel: ticking one rating bucket changes the counts and the mix, and
   the chip's × restores them.
8. **Colour by** an assessment changes every cell's mix and the tiles in the panel together.
9. **Show empty units** off hides empty rows and columns and the caption counts them; on shows them; the Unassigned
   row and column are present in both states (EM-a).
10. **Drag onto a row header** → exactly one `structure_placements_move` with `p_from_ou_id` = the worker's unit in the
    **primary** group and `p_to_ou_id` = the header's unit (`rpcInvocations()`).
11. **Drag onto a column header** → one move against the **secondary** group (`p_from_ou_id` = the worker's unit there).
12. **Drag onto the Unassigned row/column header** → `p_to_ou_id: null` with `p_within_group_id` = that axis's group.
13. **Shift-drag is the same move** (CP-a) and there is no Copy control anywhere in compare mode.
14. **Move to unit…** from the panel's selection bar lists both groups' units in two sections and issues the move
    against the target's own group.
15. A refused move surfaces the structure API's sentence as an error toast and leaves the matrix unchanged.
16. **Changing the primary group** turns Compare off and restores the band (CS-a); **Not in any group** disables the
    Compare control.
17. **TG-a**: on the three-group fixture, compare mode renders exactly one matrix of two axes and no unit-card band;
    with Compare off the band renders and no `<table>` does.
18. **Cap (VZ-a)**: with a fixture whose two groups exceed `COMPARE_CELL_CAP`, the band renders with the notice and no
    matrix.

`wall-chart-v2.control-census.test.tsx` — **the census delta** (the existing file, edited): the toolbar list gains
`"Compare"` between `"Show empty units"` and `"Colour by"` (the slot's position, `wall-chart-toolbar.tsx:215`, is
after Filter — the assertion follows the DOM, and the plan does not presume the order); `fixedPageTotal` becomes **25**
(build list closed) and **26** (open); a second `it(…)` mounts the board **in compare mode** and reports its own census
(matrix headers and cells are counted as their own region, "matrix"), asserting that a cell carries exactly one control
and that no per-unit View / Badges / Sort / Filter / Copy control exists in compare mode either. The console table is
pasted into §9.2 and into the PR body, as WP2.4's was.

`wall-chart-v2.compare.characterization.test.tsx` — skeleton snapshots for compare's states: default (no cell
selected), a cell selected, all-Unassigned (decision 4), empty rows hidden, read-only (`canWrite: false`).

**Flag off:** every legacy suite runs unchanged; `workforce/__tests__/workforce-board.test.tsx` is untouched.

### 4.4 Render cost — the 305 / 161 fixture

`wall-chart/compare/__tests__/wall-chart-v2.compare.render-cost.test.tsx`, built on
`wall-chart-v2.render-cost.test.tsx:61–117` (three mounts, median, same process, same run):

| Measured | Fixture |
|---|---|
| legacy chart | `buildWallChartFixture("large")` — the anchor, as WP2.4 used it |
| v2 band, largest group | `buildWallChartFixtureV2("large")` — the WP2.4 number, re-measured here so the comparison is within one run |
| **v2 compare, Worksite × Employer** | `buildWallChartFixtureV2("large", { prefs: { wallChart: { compare: { primary: 2, secondary: 1 } } } })` — 153 × 8 + both Unassigned axes |
| **v2 compare, Show empty units on** | the same with `showEmptyUnits: true` — the un-narrowed worst case |
| **v2 compare, all-Unassigned** (decision 4) | the same with `campaign_worker_ou: []` — one cell holding 305 members, then that cell opened |

Assertions, in the WP2.4 style: cell and tile counts first (so a mis-seeded fixture cannot pass by rendering nothing) —
the narrowed matrix's rendered cell count, the un-narrowed 1,386, the all-Unassigned single cell and its 305 tiles —
then `median ≤ legacy.median × 1.1` for each shape **and** `median < 6000 ms` (the absolute budget the legacy suite
sets, asserted as WP2.4's fix round 2 A5 did). The medians are printed with `console.log` in the `[wp2.5] render-cost …`
format the verifier pastes into §9.2.

### 4.5 Verification of "no new queries" and "no direct writes"

`pnpm test` runs the guard test `lib/campaign/__tests__/no-direct-structure-writes.test.ts` unchanged (the compare view
writes only through `structureApi`), and §4.3 item 5 pins the query set. The §5 greps prove no `localStorage` in the
new tree and no `groups_v2` reader outside the four files WP2.4 allows.

### 4.6 Acceptance (AC) — e2e spec written, operator checklist on the preview

**AC-a (recommended, the E2-b pattern the operator chose for WP2.4 and WP2.2).** The Playwright spec is **written and
type-checked but not run** — the sandbox cannot host a browser suite and the operator declined GitHub secrets
(D80/D81, `wp/wp2.2.md`; `wp/wp2.4.md:1207–1215`) — and the acceptance is the operator's, by hand, on the branch
preview, from the checklist below, which the implementer extracts to
`docs/organiser-ux-review/wp/wp2.5-acceptance-checklist.md` at Stage 3 in the shape of
`wp/wp2.4-acceptance-checklist.md`. The orchestrator records the result in §9.2 as the acceptance evidence.

The spec: `tests/e2e/groups-v2/compare.spec.ts` plus additions to `tests/e2e/groups-v2/helpers.ts` (the file WP2.4
created for this purpose; no existing spec or helper outside `groups-v2/` is edited). It reuses
`withUserPrefs({ mode: "full", flags: { groups_v2: true } })` (`tests/e2e/user-prefs.ts`), the seeded hint dismissals,
`restClientFor` (which refuses production before any call) and the scripted sync-route interception, exactly as
`groups-v2.spec.ts:1–60` does. Its three tests: the matrix's row/column/cell totals match the
`campaign_group_membership` oracle; a drag onto a column header moves the worker in the secondary group only (the
oracle shows the primary row unchanged); the compare choice survives a reload with no URL parameter (prefs).

**AC-b (not recommended unless the operator's position on secrets has changed).** Run the spec from a credentialled
shell against the branch preview. If it becomes possible, the command is in §5 and nothing else changes.

**Operator checklist (steps 1–6), to be run on the branch preview against normal dev.** Preconditions are the WP2.4
setup: sign in as the dev admin, tick **Groups v2 (wall chart preview)** for the test account in Administration →
Users, sign in as that account, open campaign **1** → Workforce → Wall chart. If campaign 1 has only one group, create
a second one the way WP2.4's checklist did (two custom units), or use another dev campaign with two groups and say
which.

1. **The control is there and is honest.** The header row now carries a **Compare** control beside Group.
   *Expected:* it lists the campaign's other groups and **Off**; with **Not in any group** chosen in the Group
   control, Compare is greyed out with an explanation.
2. **The matrix.** Choose a second group in Compare.
   *Expected:* the unit cards are replaced by a table; the row headers are the units of the Group in the **Group**
   control, with **Unassigned in <that Group>** last; the column headers are the units of the group you chose in
   **Compare**, with **Unassigned in <that group>** last; the corner names both; each cell shows a number and a thin
   coloured bar; the row totals match the counts you saw on the unit cards before you turned Compare on.
3. **Click a cell.** Click a cell with a number in it.
   *Expected:* the workers of that intersection appear as tiles **below** the table under the heading "<row> × <column>";
   clicking another cell replaces them; the × closes the panel; clicking a worker's name opens their sheet as usual.
4. **Filter and Colour by still rule everything.** Set **Colour by** to an assessment, then apply one **Filter**.
   *Expected:* every cell's bar changes with Colour by; the counts and bars shrink with the Filter and the chip appears;
   turning **Show empty units** on brings back rows and columns that the filter emptied, and a line says how many were
   hidden.
5. **Move someone.** Drag a tile from the panel onto a **row** header, then onto a **column** header. (On a touch
   device use the selection bar's **Move to unit…** instead and say so.)
   *Expected:* a drop on a row header moves the worker within the Group in the **Group** control only — their column
   does not change; a drop on a column header moves them within the compared group only. Open the worker's sheet →
   Units tab: it lists one line per group, e.g. "Worksite › KGP" and "Employer › Acme", matching where you dropped
   them. Dropping on an **Unassigned** header removes them from that group only.
6. **It is remembered, and it resets.** Reload the page.
   *Expected:* the comparison is still on, with the same second group. Now change the **Group** control to a different
   group. *Expected:* Compare switches itself **off** and the ordinary unit cards come back; turning Compare on again
   asks you to choose a second group afresh. Finally, untick **Groups v2** for the account and reopen the chart:
   *Expected:* the old chart is back exactly as before, with no Compare control anywhere.

**What to send back:** for each numbered item, **pass**, or what you saw instead; plus the campaign id, the two group
names, the worker and the units you used in step 5, and — for step 2 — the size of the matrix you saw (rows ×
columns) and whether it felt slow.

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit
pnpm --filter organising-db lint           # touched lines clean; total problems ≤ 295 (the WP2.4 baseline, PROGRESS.md row 2.4)
pnpm --filter organising-db test           # ≥ 1,563 (main at 7e8a3fab); no skips added

# acceptance greps
rg -n "groups_v2|groupsV2" apps/organising-db/src --glob '!**/__tests__/**'   # unchanged readers: lib/flags/groups-v2.ts, lib/workspace/*, workforce-board.tsx, administration/page.tsx
rg -n "localStorage" apps/organising-db/src/components/campaigns/wall-chart/compare apps/organising-db/src/lib/campaign/groups/compare.ts ; echo "exit=$? (1 = none = pass)"
rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = pass)"
rg -n "supabase|from\(|useQuery" apps/organising-db/src/components/campaigns/wall-chart/compare ; echo "(compare/** issues no query of its own)"
git diff --stat main -- supabase/ packages/db-types/ ; echo "(must be empty: no migration, no regen)"
git diff --stat main -- apps/organising-db/src/components/campaigns/wall-chart/v2/wall-chart-toolbar.tsx apps/organising-db/src/components/campaigns/wall-chart/v2/use-wall-chart-groups.ts apps/organising-db/src/lib/hooks/useUserCampaignPrefs.ts apps/organising-db/src/lib/campaign/groups/derive-group-view.ts ; echo "(must be empty: §3.13 must-not-edit list)"

# census delta and render cost (output pasted into §9.2 and the PR body)
cd apps/organising-db && pnpm exec vitest run \
  src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.control-census.test.tsx \
  src/components/campaigns/wall-chart/compare/__tests__/wall-chart-v2.compare.render-cost.test.tsx \
  src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.render-cost.test.tsx

# WP2.4's own suites, unchanged (stop condition 3)
cd apps/organising-db && pnpm exec vitest run src/components/campaigns/wall-chart/v2/__tests__ src/lib/campaign/groups/__tests__ src/lib/hooks/__tests__/useUserCampaignPrefs.test.tsx

# build
pnpm --filter organising-db build

# compare-shape SQL (DS-b; read-only, counts only; dev freely, the realistic data set with the operator's confirmation;
# production never by an agent)
cat scripts/data-hygiene/oux-wp2.5/00_compare_shape.sql

# e2e against the branch preview — only if AC-b (credentials from the operator's shell; never printed)
cd apps/organising-db && E2E_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/groups-v2 tests/e2e/wall-chart.spec.ts tests/e2e/structure-api.spec.ts
# sandboxed runner behind a TLS-intercepting proxy only (wp2.2.md D80): prepend E2E_IGNORE_HTTPS_ERRORS=1
```

Never `pnpm dev` / `pnpm start`; never a `supabase` CLI command (none is needed); never a read of `.env.local`; never
a connector call against `gteygwfgjvczanmrwgbr`.

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages

| Stage | Content | Needs DB? |
|---|---|---|
| **0** | This plan approved (§9.1); ledger row "planning → implementing"; branch cut (`git checkout -b feat/oux-wp2.5-compare-matrix main`, put to the operator). | No |
| **1** | **Pure and prefs.** `lib/campaign/groups/compare.ts` (`buildCompareMatrix`, `cellKey`, `resolveCompare`, `exceedsCompareCap`, `COMPARE_CELL_CAP`); the `compare` key in `wall-chart-prefs.ts` with its stale-id rule; the three additive VE exports; `events.ts` union member; the read-only `00_compare_shape.sql` + a three-line README; every §4.1 test. No component, no visible change. | No |
| **2** | **The view.** `compare/**` (control, hook, matrix, cell, panel), the shell's hook call / `groupIds` / `compareSlot` / branch; the §4.3 interaction, census-delta and characterisation suites; the §4.4 render-cost suite. | No |
| **3** | **Acceptance and close.** The e2e spec + `groups-v2/helpers.ts` additions written and type-checked; `wp2.5-acceptance-checklist.md` extracted; **the operator runs steps 1–6 on the branch preview (AC-a)** and the orchestrator records it in §9.2; verifier output pasted; fresh reviewer (§9.3, two fix rounds maximum); `PROGRESS.md` row; PR marked ready. | Preview (dev) for the operator's pass only |

Three stages, as the orchestrator asked; Stage 1 and Stage 2 are each one commit, Stage 3 is one commit for the spec
and checklist and one for the evidence.

### 6.2 Commits

One commit per completed stage on `feat/oux-wp2.5-compare-matrix`, small and descriptive; the branch only ever merges
`main` in (never rebase, amend or force-push a pushed branch). Every push and the PR command are put to the operator
first. `supabase/.temp/*` is never staged.

### 6.3 PR

Draft PR `feat/oux-wp2.5-compare-matrix → main`, title
`feat(oux-wp2.5): compare matrix — two groups as rows × columns, counts and rating mix per cell (behind groups_v2)`.
Body: the §3 summary; the census delta (before/after numbers and the new console table); the render-cost table from
§4.4; the evidence matrix of §8.1; the decisions as approved at §9.1; the deviations list; "**no migration**" stated
once; and the note that the Playwright spec is written and unrun (D80/D81) with the operator's checklist result as the
acceptance. Marked ready only after Stage 3.

### 6.4 Promotion gate

**Not applicable: no migration** (§0, §3.11). The merge deploys code that is inert for every user without the per-user
`groups_v2` flag, and inert for a flagged user until they choose a second group in Compare. The Supabase GitHub
integration, `gen-types.yml` and run sheets are untouched.

---

## 7. Files

**New**

- `apps/organising-db/src/lib/campaign/groups/compare.ts` and `__tests__/compare.test.ts`
- `apps/organising-db/src/components/campaigns/wall-chart/compare/`: `use-wall-chart-compare.ts`,
  `compare-control.tsx`, `compare-matrix.tsx`, `compare-cell.tsx`, `compare-cell-panel.tsx`,
  `__tests__/wall-chart-v2.compare.interaction.test.tsx`,
  `__tests__/wall-chart-v2.compare.characterization.test.tsx` (+ `__snapshots__/`),
  `__tests__/wall-chart-v2.compare.render-cost.test.tsx`
- `apps/organising-db/tests/e2e/groups-v2/compare.spec.ts`
- `scripts/data-hygiene/oux-wp2.5/00_compare_shape.sql` (read-only, counts only) and a three-line `README.md`
- `docs/organiser-ux-review/wp/wp2.5-acceptance-checklist.md` (Stage 3, from §4.6)

**Modified (additive, default-preserving unless stated)**

- `src/lib/campaign/groups/wall-chart-prefs.ts` — the `compare` key in `wallChartPrefsShape`, its parse and its
  `known.groupIds` rule; `__tests__/wall-chart-prefs.test.ts` + cases.
- `src/components/campaigns/campaign-wall-chart-v2.tsx` — the compare hook, `groupIds` in the `KnownIds` memo,
  `compareSlot`, the third render branch.
- `src/components/campaigns/wall-chart/v2/use-wall-chart-view-v2.ts` — `visibleIds`, `computeScopeMetrics` on the
  returned object (VE-a).
- `src/components/campaigns/wall-chart/v2/use-wall-chart-actions-v2.ts` — `moveRefsInGroup` (VE-a); `moveRefsTo`
  delegates to it.
- `src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.control-census.test.tsx` — the census delta (§4.3).
- `src/lib/analytics/events.ts` — `"compare_secondary"` in `GroupSelectionControl`.
- `src/components/campaigns/wall-chart/__tests__/harness/fixture.ts` — only if a compare fixture knob proves necessary.
- `apps/organising-db/tests/e2e/groups-v2/helpers.ts` — compare locators and a matrix oracle (WP2.4's own helper file).
- `docs/organiser-ux-review/PROGRESS.md` — the ledger row and the phase-2 evidence line.

**Not modified:** `wall-chart/v2/wall-chart-toolbar.tsx`; `use-wall-chart-groups.ts`; `group-selector.tsx`;
`lib/hooks/useUserCampaignPrefs.ts`; `lib/campaign/groups/derive-group-view.ts`; `plan-drop.ts`;
`resolve-group-selection.ts`; every legacy composition file; `workforce-board.tsx`; `workforce-list-view.tsx`;
`campaign-units-section.tsx`; `campaign-wizard.tsx`; `campaign-settings.tsx`; `structure-api.ts`;
`lib/workers/sync-campaign-universe.ts`; any file under `supabase/`; `packages/db-types/generated.ts`; any e2e spec or
helper outside `tests/e2e/groups-v2/`.

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion (spec `:150`, plan `:306`) | Evidence |
|---|---|
| Rows are the primary group's units | §4.1 items 1–2; §4.3 item 2; operator checklist step 2 |
| Columns are the secondary group's units | same |
| Unassigned on both axes | §4.1 item 4; §4.3 item 9; checklist step 2 |
| Counts per cell | §4.1 items 2–3 (partition + view equivalence); §4.3 item 3 |
| Rating mix per cell | §4.3 items 7–8 (Filter and Colour by change the bar); the mix is `computeMetrics().ratingBuckets` through `CompactRatingsBar`, i.e. the band's own numbers (§2.4) |
| Click to show tiles | §4.3 item 6; characterisation snapshot "cell selected"; checklist step 3 |
| **Renders for the 161-unit campaign within the performance budget** | §4.4: the `large` (305 / 161) fixture, Worksite × Employer, narrowed and un-narrowed and all-Unassigned, median of three mounts beside the legacy chart from the same run, `≤ legacy × 1.1` **and** `< 6 s`; plus the `00_compare_shape.sql` counts from the realistic data set (DS-b) showing the real campaign's shape is within the measured one |
| **Three-plus groups fall back to stacked bands** | §4.3 item 17 on the three-group fixture (matrix ⇔ band, mutually exclusive, two axes only); §3.9 records the reading |
| Compare off by default | §4.1 item 9 (nothing stored → off); §4.3 item 2 (the band renders until a secondary is chosen) |
| Compare resets when the primary group changes | §4.1 item 9 (stored `primary` ≠ live selection → off); §4.3 item 16; checklist step 6 |
| State stored per user per campaign on the server (plan `:312`) | §4.1 item 10; §4.3 item 4 (the upsert payload); checklist step 6 reload; `rg localStorage` in §5 finds none |
| Filter applies to every unit shown (plan `:308`) | §4.3 item 7 |
| Drag goes through `placements.move` | §4.3 items 10–13 (`rpcInvocations()` args); the guard test; checklist step 5 |
| No new query | §4.3 item 5 (`queryInvocations()`); `rg` in §5 finds no query in `compare/**` |
| No migration, no RPC change, no types regen | `git diff --stat main -- supabase/ packages/db-types/` empty (§5) |
| Appendix A control inventory stays honest | the census delta (§4.3): the new totals and the "no per-unit override in compare mode either" assertions |
| Full mode and the legacy chart keep working | every legacy vitest suite unchanged and green; checklist step 6's flag-off check |
| WP2.4's own behaviour unchanged | WP2.4's v2 suites green **unchanged** (§5's targeted run; stop condition 3) |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| A large matrix is slow on a real device even though jsdom is fast | §4.4 measures the worst case in the repository; VZ-a's cap refuses anything larger with an actionable notice; "Show empty units" off is the default; checklist step 2 asks the operator whether it felt slow; §8.4 item 5 stops the package if the budget fails |
| The census test's exact assertions make any toolbar addition look like a regression | the delta is planned, pinned and reported (§2.7, §4.3), not routed around; the PR body carries both tables |
| WP2.5 needs three additive exports from WP2.4-owned hooks | VE-a keeps them to a returned key and a parameter default; WP2.4's 63-case interaction suite must pass **unchanged** (stop condition 3); the PR names the three edits |
| `compare` is dropped on read today, so a partially implemented key would look like "prefs do not persist" | the key and its parse land together in Stage 1 with the round-trip test (§4.1 item 10) before any component exists |
| Hidden units apply to the row axis only (the Units manager is primary-group-scoped, `use-wall-chart-group-view.ts:252–261`) | recorded; the caption reports "N of M units shown" per axis so the number is never silently wrong; WP2.7's editor is where a per-group hidden set would belong |
| A drop on a header while a stale cell panel is open moves someone who is no longer in that cell | the panel is derived from the matrix, which is derived from the placements query; the move invalidates `["campaign-worker-ou", …]` through the existing mutation, so the panel re-derives; §4.3 item 10 asserts the post-move DOM |
| Two axes of the same group | the control lists other groups only; `buildCompareMatrix` degrades to empty columns rather than throwing (§4.1 item 7) |
| Compare and the `?group=` link disagree (no `?compare=`) | deliberate (§3.2); a shared link opens on the right group with Compare in whatever state the recipient last chose — recorded, and one step in `resolveCompare` away if the operator wants it |
| Percentages in `pct` mode could be read against the wrong denominator | §3.5 fixes the denominator to the **row** total and puts the absolute in the `title`; the census/interaction tests assert the accessible name |
| WP2.6 and WP2.7 collide on `wall-chart-prefs.ts`, `events.ts`, the harness fixture | §3.13; different prefs keys; merge `main` in before each stage's commit and re-run the suites |
| The realistic data set holds real contact details | DS-b's SQL selects **counts only**, no names, no contact columns, no writes; it is run on dev freely and on the realistic data set only with the operator's confirmation for that exact file; production never by an agent |
| The Playwright spec is unrun, so the drag semantics rest on jsdom plus the operator | the jsdom assertions are on the **RPC arguments**, which is where the semantics live; the operator's step 5 checks the sheet's Units tab, the same oracle WP2.4's E2-b used and passed |
| Lint creep from the new tree | touched lines clean; total ≤ 295 |

### 8.3 Deviations from plan (implementer keeps; numbering starts at D1)

| # | Deviation | Why | Plan section affected |
|---|---|---|---|
| — | _(none yet; implementation not started)_ | | |

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. Any change would be needed under `supabase/`, to `packages/db-types/generated.ts`, or to any RPC.
2. Compare cannot be built without editing a file on §3.13's must-not-edit list — in particular
   `wall-chart-toolbar.tsx` beyond nothing, `use-wall-chart-groups.ts`, `useUserCampaignPrefs.ts` or
   `derive-group-view.ts`.
3. Any WP2.4 v2 suite, or any legacy vitest suite or e2e spec, would need a change to pass. (The census test's
   **numbers** are the planned delta of §4.3 and are not covered by this condition; a change to any of its
   *assertions about forbidden controls* is.)
4. The §4.1 equivalence test finds a case where `buildCompareMatrix` and `campaign_group_membership` disagree, or
   where the row/column totals do not equal the band's counts.
5. A §4.4 shape exceeds the legacy median by more than 10 %, or exceeds 6 s absolute, on the same run.
6. A cell's count or mix cannot be produced from `visibleIds` and `computeScopeMetrics` — i.e. the one pipeline would
   have to be duplicated.
7. A drop would need more than one `placements.move`, or would need a call the structure API does not expose.
8. Lint total would exceed 295 or `tsc` fails in an untouched file.
9. Anything would touch `gteygwfgjvczanmrwgbr`, or a read of the realistic data set would return personal data.
10. A third fix round would be needed.
11. `main` has moved under `campaign-wall-chart-v2.tsx`, `wall-chart/v2/**`, `lib/campaign/groups/**` or
    `lib/hooks/useUserCampaignPrefs.ts` since `7e8a3fab` in a way that conflicts with this plan's citations, and the
    orchestrator has not re-cited it.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Recommendation | Operator answer |
|---|---|---|---|
| **MX** | Matrix model: **MX-a** pure `lib/campaign/groups/compare.ts` returning worker ids, with the rating mix from the existing `computeMetrics` / `CompactRatingsBar`; **MX-b** the mix computed inside the pure model | **MX-a** | _pending_ |
| **CK** | Prefs key: **CK-a** `prefs.wallChart.compare`, added to the existing schema, no edit to the prefs hook; **CK-b** a top-level `prefs.compare` needing a second key-owning path in the hook | **CK-a** | _pending_ |
| **CS** | "Resets when the primary group changes": **CS-a** store `{ primary, secondary }` and resolve to off when the stored primary is not the live selection (no effect, no edit to the selector); **CS-b** store `secondary` and clear it from an effect | **CS-a** | _pending_ |
| **CL** | Click a cell: **CL-a** an inline `CampaignUnitCard` panel directly below the matrix; **CL-b** a right-hand sheet | **CL-a** | _pending_ |
| **DG** | Drag out of a cell: **DG-a** onto row and column headers (one axis, one `placements.move`) plus a two-section Move to unit… dialog; **DG-b** the dialog only; **DG-c** onto another cell (two writes, no transaction) | **DG-a**; DG-b is the safe fallback if the reviewer judges the surface too large; **DG-c rejected** | _pending_ |
| **EM** | Empty rows/columns: **EM-a** the existing campaign-wide "Show empty units" switch governs both axes, Unassigned never hidden; **EM-b** a compare-only toggle and a second prefs key | **EM-a** | _pending_ |
| **TG** | "Three-plus groups fall back to stacked bands": **TG-a** Compare is two groups by construction and the band is what a third group gets (tested both ways); **TG-b** a multi-select Compare that stacks bands | **TG-a** | _pending_ |
| **VZ** | Large matrices: **VZ-a** no virtualisation — empty-axis rule, a 2,000-cell cap with a notice, sticky CSS headers, the number measured; **VZ-b** add a virtualiser | **VZ-a** | _pending_ |
| **VE** | Reuse: **VE-a** three additive exports from WP2.4's v2 hooks (`visibleIds`, `computeScopeMetrics`, `moveRefsInGroup`); **VE-b** a second copy of the filter/sort/metrics pipeline inside compare | **VE-a** | _pending_ |
| **DS** | Realistic data: **DS-a** the performance acceptance is the `large` fixture in jsdom beside the legacy number; **DS-b** additionally one read-only, counts-only SQL on the realistic data set to check the real campaign's shape | **DS-a for the timing, plus DS-b** (the least invasive use; the standing notes name WP2.5 as the first package to ask) | _pending_ |
| **AC** | Acceptance: **AC-a** the spec is written and type-checked but unrun (D80/D81) and the operator runs the six-step checklist on the branch preview, as for WP2.4; **AC-b** a credentialled Playwright run | **AC-a** | _pending_ |

Approvals required, in order:

1. The eleven decisions above — "as recommended" is a complete answer.
2. Approve `git checkout -b feat/oux-wp2.5-compare-matrix main`, the Stage-0 commit of this plan and the ledger row,
   `git push -u origin feat/oux-wp2.5-compare-matrix`, and opening the draft PR.
3. Approve each stage commit and push individually.
4. Confirm that the read-only, counts-only `00_compare_shape.sql` may be run on **normal dev** by the agent (reads are
   free under the standing notes; confirmation is asked because the file is new) and, separately, on the **realistic
   data set** (DS-b).
5. **AC-a:** run the six-step checklist on the branch preview when Stage 3 is ready and report; the orchestrator
   records the result in §9.2.

**Orchestrator approval:** _pending (Revision 1)._

### 9.2 Verification output (verifier pastes raw output)

_pending._

#### Operator acceptance on the branch preview (AC-a)

_pending._

### 9.3 Reviewer findings and resolution

_pending._ Reviewer: a fresh `opus` at `xhigh` (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:55`), given the reviewer
checklist verbatim (`:88–97`), this plan and the acceptance criteria; two fix rounds maximum, a third is a stop
condition. The package writes placements through an existing RPC but changes no RLS, no migration and no worker data
shape, so `opus` is the model the protocol names; if the operator prefers Fable for anything that writes placements at
all, say so at §9.1 and the orchestrator books it.

---

## 10. Revision history

- **Revision 1** (2026-09-15): initial plan against `main` at `7e8a3fab` (WP2.4 merged at `5a16de07`). Recommends
  MX-a (a pure `compare.ts` over two `deriveGroupView` calls, ids only), CK-a (`prefs.wallChart.compare`, no edit to
  the prefs hook), CS-a (stored `{ primary, secondary }`; the reset is a derivation, so the Group selector is not
  touched), CL-a (an inline `CampaignUnitCard` panel below the matrix), DG-a (drag onto row and column headers, one
  axis and one `placements.move` per drop; DG-c rejected as two untransacted writes), EM-a (the existing Show empty
  units switch governs both axes; Unassigned never hidden), TG-a (Compare is two groups by construction and the
  stacked band is what a third group gets, tested both ways), VZ-a (no virtualisation: the empty-axis rule, a
  2,000-cell cap, sticky CSS headers, and the number measured on the 305/161 fixture), VE-a (three additive exports
  from WP2.4's v2 hooks so there stays exactly one filter/sort/metrics pipeline), DS-a + DS-b (jsdom timing plus one
  read-only, counts-only shape query on the realistic data set) and AC-a (spec written and unrun; the operator's
  six-step checklist on the branch preview is the acceptance, as for WP2.4 and WP2.2). No migration, no RPC change, no
  new query, no types regeneration; three stages.
