# WP2.3 — Wall chart decomposition

Branch: `feat/oux-wp2.3-wall-chart-decomposition` (from develop `03294d5`).
Planner: fresh planner, 2026-09-10; **revision 4** (narrow factual corrections to revision 3: `mutate` not `mutateAsync`; complete actions-hook inputs; `unitsContainerRef` in block B; hook-order wording; silent cross-type block; mode-pin evidence wording. All other revision-3 decisions preserved). Status: **approved by the operator 2026-09-10; implementation may begin at Stage 0.**

Path shorthand used below: `WC:` = `apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx` (2,635 lines at `03294d5`); `wall-chart/` = `apps/organising-db/src/components/campaigns/wall-chart/`. All line numbers are against the current file, not appendix A's stale numbers (see §2.4).

---

## 1. Specification and boundaries

### 1.1 Specification (verbatim, `IMPLEMENTATION_ORCHESTRATION_PROMPT.md`)

> WP2.3 Wall chart decomposition. High-risk implementer; behaviour-preserving refactor only. Split src/components/campaigns/campaign-wall-chart.tsx along the render tree in appendix A section 0 (header, band, unit card, tile, dialogs, hooks) with no visible change; add snapshot and interaction tests that pin current behaviour before the split. Acceptance: tests written before the refactor pass after it; bundle and render time not worse. Depends on nothing in phase 2; may run in parallel with WP2.1 on disjoint files.

Cited appendix sections: appendix A §0 (render tree), §3 (controls), §4 (state), §8 (pain points), §9 (writers). Plan §5.5–5.7 ("The 2,527-line component is split along the lines it already has (header, band, card, tile, dialogs)"), §7 "What not to do".

### 1.2 Binding additions from `HANDOFF.md` and the orchestration prompt

- Tests that pin current behaviour are written against the **unmodified production component** and are green before any extraction; they are rerun after every stage and must pass unchanged (no snapshot updates, no skips, no quarantine, no loosening).
- Preserve WP1.7 hint contracts (`data-hint-anchor="wall_chart_rating"`, `pickRatingHintAnchor`, `data-worker-name`) and WP1.4 tab/chrome contracts (`?tab=&sub=`, `?view=`, `?buildList=1`).
- `tests/e2e/wall-chart.spec.ts` and `tests/e2e/organiser-campaign.spec.ts` are required regression coverage and are not edited.
- No local app run (`apps/organising-db/.env.local` points at production). Build is allowed. Browser verification only against the dev-backed Vercel branch preview.
- Full mode keeps working; nothing is removed; no schema, model, or group-selector behaviour is added; no groups_v2; no localStorage redesign.
- One writer; one commit for the completed WP; implementation only after explicit operator approval of this plan.
- Never touch production Supabase (`gteygwfgjvczanmrwgbr`), not even reads.
- **Database writes.** Implementation performs no database writes: no migration, no `apply_migration`, no seed. The new e2e spec performs no campaign/domain writes (no DnD, ratings, unit edits, list edits). It reuses the existing mode-pin helper `withUserMode("full")`, which writes and later restores the signed-in user's `workspace_prefs` through the admin API — a reversible, serialised dev-preference write. Restoration evidence is limited to what the existing helper already emits (§4.6). The WP does **not** claim to be read-only or free of all Supabase mutation.

### 1.3 In scope

- A **structural** decomposition: moving code out of `WC:` into a small number of modules under `wall-chart/`, each move verbatim over a **contiguous** line range, with only the plumbing needed to pass values between blocks (closure variables become explicit, typed parameters/props).
- Characterisation and interaction tests that pin the production component's behaviour before extraction; behavioural unit tests of the moved pure helpers after extraction.
- Performance evidence (build-manifest route-chunk aggregation, browser Resource Timing, request census, synthetic render cost).

### 1.4 Explicitly not done in WP2.3 (recorded for WP2.4 or a separately approved cleanup)

| Retained as-is | Why |
|---|---|
| **The four repeated filter → sort → metrics blocks** (`WC:1650–1686`, `WC:1844–1871`, `WC:2159–2198`, `WC:2310–2323`, appendix A §8) | Intentionally **retained verbatim**, each inside the render component that owns it (§3.2). No shared helper, no consolidation. De-duplication is logic rewriting and belongs to WP2.4 or a separately approved cleanup. |
| Per-scope `Map<number, …>` state, `UNASSIGNED_KEY = 0`, `applyToAllScopes`, telemetry scopes | Moved unchanged inside their contiguous hook ranges; no reducer, no store (WP2.4). |
| `handleWorkerDrop` cross-type guard (`WC:1358–1374`) — a cross-`ou_type` move is **silently blocked** (no toast); `toast.error` (`WC:1390–1392`) fires only on mutation error | Moved verbatim inside the actions hook; no "drop policy" abstraction; the silent block and the error-only toast are preserved exactly. |
| Grandchild cards hard-coded to `assessmentLabel="Cumulative"` (`WC:2300–2374`) | Documented divergence (appendix A §3.8); fixing it is a visible change. |
| `WallChartAssessmentCharts` position below units; sticky offsets | WP0.3 decision; visible. |
| `React.memo`, virtualisation, query de-duplication, narrowing `select("*")` | Changes re-render/network behaviour; criterion is "not worse". |
| Dead or group-container code paths, `is_group_container` handling | Appendix C / groups_v2 territory; nothing removed. |
| Any string, label, toast wording | Visible change. |
| New test frameworks or dependencies (Testing Library, happy-dom, explicit `jsdom`) | §4.1 dependency policy. |
| Edits to `tests/e2e/wall-chart.spec.ts`, `tests/e2e/organiser-campaign.spec.ts`, `tests/e2e/helpers/*`, or any existing `wall-chart/*` module | Required regression coverage, shared helpers and already-extracted modules stay untouched. The only permitted change to an existing `wall-chart/*` file is an import/export-only adjustment, only if a move cannot otherwise compile; none is anticipated; any such change is recorded in §9.3 with its justification. |

---

## 2. Current-state map

### 2.1 Module inventory (what already exists around the monolith)

Already-extracted modules under `wall-chart/` that WP2.3 **imports and does not modify**:

| Module | Responsibility | Consumed at |
|---|---|---|
| `campaign-unit-card.tsx` | Unit card chrome (header, summary toggle, collapse, drop target, placeholders, unit drag) — props `CampaignUnitCardProps` | `WC:1691`, `WC:1932`, `WC:2210`, `WC:2331` |
| `worker-tile.tsx` | Tile (`WorkerTileProps`, hint props `ratingHintAnchor`/`showRatingHint`/`onRatingHintDismiss`, `data-worker-id`/`data-worker-name`/`data-ou-id`) | `WC:1150–1242` |
| `wall-chart-summary-header.tsx` | Campaign summary + `%`/`#` toggle (`aria-pressed`), "Campaign summary" `h2` | `WC:1504–1616` |
| `wall-chart-selection-bar.tsx` | Selection region `aria-label="Wall chart selection"`, "{n} worker(s) selected" | `WC:1470–1503` |
| `wall-chart-unit-manager.tsx` | Units popover (show/hide, reorder, delete, "New unit", "Show all") | header |
| `filters.ts`, `metrics.ts` (`computeMetrics` at `metrics.ts:81`), `dnd.ts`, `use-wall-chart-selection.ts`, `use-display-mode.ts`, `use-wall-chart-unit-visibility.ts`, `use-build-list.ts`, `use-leader-links.ts`, `use-participation-predicate.ts`, `normalize-members.ts`, `types.ts`, `move-worker-mutation.ts` | Pure helpers and hooks | throughout |
| `relationship-overlay.tsx` | Measures `[data-worker-id]` inside `containerRef` (`relationship-overlay.tsx:53`) | `WC:2396–2402` |
| `../WallChartAssessmentCharts.tsx` | Distribution charts (`WallChartAssessmentCharts.tsx:77`) | `WC:2433–2442` |

### 2.2 `campaign-wall-chart.tsx` line map (current)

**Module-level private pure helpers:**
`activityIdsForWallChartSelections` `WC:139–149`; `effectiveAssessmentForScope` `WC:151–157`; `buildAssessmentMetricsInput` `WC:159–170`; `scopeAssessmentFilterAndSort` `WC:172–193`; `UnitHierarchyViewMode`, `hierarchyViewKey`, `readHierarchyView` `WC:195–213`.

**Component `CampaignWallChart({ campaignId, canWrite })` `WC:215`** — the current hook/effect sequence, in order:

| Block | Lines | Contents |
|---|---|---|
| A. Shell state | `WC:222–368` | `createClient()`, `useQueryClient`, router/pathname/search params, `useCampaignWorkerDetail()` `WC:224`; build-list URL state `WC:236–257` (`buildList=1` + `view=wall-chart`, `router.replace({ scroll: false })`); sticky sentinel/height/offset observers `WC:277–317`; `useWallChartUnitVisibility` `WC:322`; `focusOuId` from `?ou=` `WC:326–331`; selection, dialog `useState`s, `useMoveWorkersMutation` `WC:334–341`; `handleRootKeyDown` `WC:344–348`; overlay localStorage `WC:351–368` |
| B. Core data | `WC:370–523` | `useAllLeaderLinks` `WC:370`; `unitsContainerRef = useRef(...)` immediately after it (`WC:371`); coverage hooks `WC:375–383`; `["campaign-members-full"]` `WC:384–390`; `["campaign-rating-summary"]` `WC:392–402`; data fields/facts `WC:404–410`; per-scope assessment/filter/badge state and assessment options `WC:411–489`; `["campaign-activity-ratings", cid, activityIdsKey]` `WC:490–516`; activity-rating lookup `WC:517–523` |
| C. Structure | `WC:526–883` | `["campaign-ous"]` `WC:526–538`; `visibleOus` `WC:540–543`; focus scroll effect `WC:547–558`; `reorderOus` `WC:565–578`; `["campaign-worker-ou"]` `WC:582–590`; `["campaign"]` `WC:592–603`; derivations `WC:606–868` (`memberRows`, `workerById`, `ratingByWorker`, `buildListWorkerSnapshot`, `useBuildList` `WC:660–663`, `buildListWorkerIds`, `ouNameById`, `ouTypeById`, `unitsByWorker`, `primaryOuByWorker`, `workerSearchItems`, `focusWorker` `WC:738–782`, `compareWorkerIds`, `assignedWorkerIds`, `unassignedWorkerIds`, `workersByOu`, `childrenByParent`, `parentExclusiveWorkersByOu`, `visibleWorkersForOu`); `ratingHintAnchor` `WC:872–879`; `useFirstUseHint` `WC:880–883` |
| D. View & metrics | `WC:885–1115` | `campaignGreySlots` `WC:885–887`; `useDisplayMode` `WC:889`; hierarchy view state `WC:890–945`; participation `WC:946–954`; `UNASSIGNED_KEY` `WC:958`; `getFilter` `WC:960`; `noteFirstInteraction` `WC:969–983`; `setFilter` `WC:985–1002`; `applyToAllScopes` `WC:1005–1018`; `filterLabels` `WC:1021–1039`; `useDerivedOptions` `WC:1041`; `campaignMetrics`/`metricsByOu`/`unassignedMetrics` `WC:1050–1115` |
| E. Tile callback | `WC:1117–1242` | `renderTile` (a callback, not a hook); hint props `WC:1157–1165`; selection semantics; DnD refs with `fromOuType` |
| F. Writers | `WC:1252–1426` | `deleteUnitWorkers` `WC:1252–1272`; `["split-unit-members", …]` `WC:1279–1334`; `handleWorkerDrop` `WC:1336–1397` (silent cross-type guard `WC:1358–1374`; calls `moveWorkers.mutate(variables, { onSuccess, onError })`; `toast.error` on mutation error `WC:1390–1392`); `handleBulkRemoveFromUnit` `WC:1401–1426` (direct delete via `supabase`, `queryClient` invalidations, `setRemoveConfirmOpen(false)`) |
| G. JSX | `WC:1429–2630` | Card/CardContent `onKeyDown`/sentinel `WC:1429–1458`; sticky wrapper `WC:1459–1617` (`WallChartSelectionBar` `WC:1470–1503`, `WallChartSummaryHeader` `WC:1504–1616`); units area `WC:1625–1648`; Unassigned IIFE `WC:1649–1765` (block #1 `WC:1650–1686`); empty states `WC:1767–1775`; band IIFE `WC:1776–2394` (roll-up `WC:1803–1843`; block #2 `WC:1844–1871`; top-level card `WC:1932–2388`, toolbar `WC:2013–2153`, kebab `aria-label="Unit actions"`; child cards `WC:2154–2383`, block #3 `WC:2159–2198`; grandchild cards `WC:2300–2374`, block #4 `WC:2310–2323`, `assessmentLabel="Cumulative"`); `RelationshipOverlay` `WC:2396–2402`; `BuildListPanel` `WC:2404–2427`; `WallChartAssessmentCharts` **below** units `WC:2433–2442`; Print `WC:2445–2453`; dialogs `WC:2456–2630` |

Any lines between the blocks above (`WC:1243–1251`, `WC:1427–1428`) stay in the shell verbatim.

### 2.3 Consumers of the component

`apps/organising-db/src/components/campaigns/workforce/workforce-board.tsx` mounts `<CampaignWallChart campaignId canWrite />` when `?view` resolves to wall chart. The public props type does not change.

### 2.4 Appendix A reconciliation (drift found; none design-changing)

| Appendix A claim | Code now | Effect on the plan |
|---|---|---|
| Component is 2,527 lines (handoff: ~2,500) | 2,635 lines | None; WP0.2 telemetry, WP1.6 error toasts, WP1.7 hint wiring were added after the appendix. |
| `WC:` line references throughout §3–§9 | All stale by roughly +100 | This plan cites current lines; appendix numbers are not used. |
| §0 render tree lists `WallChartAssessmentCharts` after the sticky wrapper and before the units area | Charts render **below** the units area and build-list panel (`WC:2433–2442`, moved by WP0.3) | None; the characterisation tests pin the current order. |
| §0/§3 do not mention the first-use hint | `ratingHintAnchor` memo `WC:872–879`, `useFirstUseHint` `WC:880–883`, tile props `WC:1157–1165` | Extra contract to preserve (§5.6). |
| §9 writers: `handleWorkerDrop` has no error handling | `toast.error` on mutation error `WC:1390–1392` (WP1.6) | Extra contract (§5.10). |
| §4 state table has no "first interaction" telemetry | `noteFirstInteraction` `WC:969–983`, `wallchart_filter_applied` tracking in `setFilter` `WC:985–1002` (WP0.2) | Telemetry moves inside block D unchanged (§5.11). |

No appendix claim that changes the decomposition boundaries is wrong. **Stop condition (§10) not triggered.**

---

## 3. Target decomposition

### 3.1 Principles

1. **Verbatim, contiguous moves.** Each hook file absorbs exactly one contiguous block (A, B, C, D, F) of the current sequence; the block's internal hook/effect order is preserved byte-for-byte. Only closure access is replaced by explicit parameters and return values.
2. **Acyclic input/output chain.** Each hook accepts only the shell's props and the outputs of blocks that precede it. No hook receives a value produced later in the sequence. This is guaranteed by construction: the current code already cannot read a `const` declared below it during render.
3. **Relative hook order preserved.** The shell calls the five hooks in block order; every remaining state/query/effect hook retains its relative order and each contiguous block retains its internal order. Block E's `renderTile` `useCallback` is removed from the parent (it becomes the hook-free `WallChartTile` component); removing a `useCallback` has no state or effect consequence, and the tile's behaviour is covered by the tile interaction and characterisation tests. No thin `useCallback` wrapper is retained unless a call site turns out to need a stable function identity, in which case it is kept at block E's position and recorded in §9.3.
4. **Small typed concern objects.** Each hook returns a few small named objects; their types are the hook's return type, so every consumer's dependencies are visible in its props. No React context provider; re-render behaviour stays as today.
5. **The three unit-card levels stay three explicit code paths** in one render file (appendix A §3.6–3.8 documents diverging feature sets).
6. **Existing `wall-chart/*` modules are untouched.**

### 3.2 Files (11 new source files + tests; 1 modified)

**Pure helpers — 1 file**

| File | Contents | Moved from |
|---|---|---|
| `wall-chart/wall-chart-model.ts` | Verbatim moves, now exported: `UNASSIGNED_KEY`, `activityIdsForWallChartSelections`, `effectiveAssessmentForScope`, `buildAssessmentMetricsInput`, `scopeAssessmentFilterAndSort`, `UnitHierarchyViewMode`, `hierarchyViewKey`, `readHierarchyView`. Nothing else. | `WC:139–213`, `WC:958` |

**Hooks — 5 files (`wall-chart/hooks/`), one per contiguous block**

| # | File | Block | Inputs (only from earlier) | Returns |
|---|---|---|---|---|
| 1 | `use-wall-chart-shell-state.ts` | A `WC:222–368` | `campaignId`, `canWrite` | `env: { supabase, queryClient, router, pathname, searchParams, workerDetail }`; `buildListUrl: { buildListOpen, setBuildListOpen }`; `layout: { sentinelRef, stickyRef, isStuck, stickyHeight, buildListStickyTopPx }` (note: `unitsContainerRef` is **not** here — it is created in block B); `visibility` (the `useWallChartUnitVisibility` result); `focusOuId`; `selection`; `dialogs` (every dialog open/target state and setter from `WC:334–341`); `moveWorkers`; `handleRootKeyDown`; `overlay: { enabled, setEnabled }` |
| 2 | `use-wall-chart-core-data.ts` | B `WC:370–523` | `campaignId`, `env.supabase` | `leaderLinks`; `unitsContainerRef` (created at `WC:371`, immediately after `useAllLeaderLinks`, preserving that order); `coverage`; `rawMembers`; `ratingSummary`; `dataFields`/`facts`; `scopeState` (campaign assessment default, per-unit assessment override, per-scope filter Map, badge default/override and their setters, exactly the `useState`s of `WC:411–489`); `assessmentOptions`; `activityRatings`; `activityRatingLookup` |
| 3 | `use-wall-chart-structure.ts` | C `WC:526–883` | `campaignId`, `canWrite`, `env`, `visibility.hiddenOuIds`, `focusOuId`, `buildListUrl`, `selection`, `workerDetail`, `rawMembers`, `ratingSummary`, `activityRatings`, and `core.unitsContainerRef` if the focus scroll effect (`WC:547–558`) or `focusWorker` reads it (as each memo/effect's current dependency list requires) | `ous`, `visibleOus`, `ouAssignments`, `campaign`, `reorderOus`; `index: { memberRows, workerById, ratingByWorker, ouNameById, ouTypeById, unitsByWorker, primaryOuByWorker, compareWorkerIds, assignedWorkerIds, unassignedWorkerIds, workersByOu, childrenByParent, parentExclusiveWorkersByOu, visibleWorkersForOu }`; `buildList` (the `useBuildList` result and `buildListWorkerIds`); `workerSearchItems`; `focusWorker`; `hint: { ratingHintAnchor, ratingHint }` |
| 4 | `use-wall-chart-view-metrics.ts` | D `WC:885–1115` | `campaignId`, `scopeState`, `assessmentOptions`, `activityRatingLookup`, `ratingSummary`, `ous`, `campaign`, `index` | `campaignGreySlots`; `displayMode`; `hierarchy: { getView, setHierarchyViewForParent, allParentsExpanded, setAllHierarchyViews }`; `participation`; `filters: { getFilter, setFilter, applyToAllScopes, noteFirstInteraction, filterLabels }`; `derivedOptions`; `metrics: { campaignMetrics, metricsByOu, unassignedMetrics }` |
| 5 | `use-wall-chart-actions.ts` | F `WC:1252–1426` | Every direct external dependency of the block: `campaignId`, `canWrite`, `env.supabase`, `env.queryClient`, `shell.selection`, `shell.dialogs` (including the split/delete target dialog state and `setRemoveConfirmOpen`), `shell.moveWorkers`, `struct.ous`, `struct.ouAssignments`, `struct.index` (incl. `ouTypeById`, `workersByOu`, `workerById`). Per function: `handleWorkerDrop` — `canWrite`, `moveWorkers`, `ouTypeById`, `selection`; `handleBulkRemoveFromUnit` — `canWrite`, `selection`, `supabase`, `queryClient`, `campaignId`, `setRemoveConfirmOpen`; `splitUnitMembers` query and `deleteUnitWorkers` — target dialog state, `ouAssignments`/`index`, `supabase`, `queryClient` | `deleteUnitWorkers`; `splitUnitMembers` (the `["split-unit-members", …]` query); `handleWorkerDrop`; `handleBulkRemoveFromUnit` |

**Parent hook sequence after extraction (the shell):**

```
const shell   = useWallChartShellState({ campaignId, canWrite });          // block A, WC:222–368
const core    = useWallChartCoreData({ campaignId, env: shell.env });      // block B, WC:370–523
const struct  = useWallChartStructure({ campaignId, canWrite, shell, core });   // block C, WC:526–883
const view    = useWallChartViewMetrics({ campaignId, core, struct });     // block D, WC:885–1115
/* block E is <WallChartTile/> — no hook here */
const actions = useWallChartActions({
  campaignId, canWrite,
  env: shell.env,                     // supabase, queryClient
  selection: shell.selection,
  dialogs: shell.dialogs,             // incl. setRemoveConfirmOpen and split/delete targets
  moveWorkers: shell.moveWorkers,
  ous: struct.ous, ouAssignments: struct.ouAssignments, index: struct.index,
});                                                                       // block F, WC:1252–1426
/* any shell-owned useMemo for prop assembly may follow; it adds hooks only after F */
return ( …JSX… );
```

Chain: A → B → C → D → F; each arrow is an input taken from the return value of an earlier hook only. Nothing flows backwards.

**Render components — 5 files (`wall-chart/`)**

| File | Component(s) | Moved from | Props |
|---|---|---|---|
| `wall-chart-header.tsx` | `WallChartHeader` — sentinel, sticky wrapper, `WallChartSelectionBar`, `WallChartSummaryHeader` and all header controls | `WC:1453–1617` | `{ campaignId, canWrite, shell (layout, selection, dialogs, overlay, visibility, buildListUrl), core (scopeState, assessmentOptions), struct (ous, visibleOus, campaign, index, workerSearchItems, focusWorker, reorderOus), view (displayMode, hierarchy, participation, filters, metrics), actions }` |
| `wall-chart-tile.tsx` | `WallChartTile` — the `renderTile` body as a component rendering `WorkerTile` with identical props (hint props included); **contains no hook** | `WC:1117–1242` | `{ workerId, ouId, scopeKey, canWrite, campaignId, index, ratingByWorker, activityRatingLookup, scopeState, selection, buildList, buildListUrl, hint, workerDetail, dialogs, moveWorkers }` — explicit, mirroring today's closure reads |
| `wall-chart-unassigned-card.tsx` | `WallChartUnassignedCard` — **block #1 verbatim** | `WC:1649–1765` | subset of the above plus `view.filters`, `view.metrics`, `actions` |
| `wall-chart-unit-hierarchy.tsx` | `WallChartUnitHierarchy` (band loop, roll-up, top-level card with toolbar/kebab, **block #2 verbatim**) and `WallChartSubUnits` (child cards, **block #3 verbatim**; grandchild cards, **block #4 verbatim**, `assessmentLabel="Cumulative"`) | `WC:1776–2394` | as above plus `view.hierarchy` |
| `wall-chart-dialogs.tsx` | `WallChartDialogs` — every dialog, unchanged | `WC:2456–2630` | `{ campaignId, canWrite, shell.dialogs, shell.selection, struct, actions }` |

Empty states (`WC:1767–1775`), `RelationshipOverlay`, `BuildListPanel`, `WallChartAssessmentCharts` and the Print button stay in the shell's JSX. The units-area `ref` and `RelationshipOverlay`'s `containerRef` are `core.unitsContainerRef` (block B output), not a shell-state layout value.

**Modified — 1 file:** `campaign-wall-chart.tsx` becomes the shell: props, the five hooks in the sequence above, any shell-owned prop-assembly memo, then `Card → CardContent(onKeyDown) → WallChartHeader → units area (WallChartUnassignedCard, empty states, WallChartUnitHierarchy, RelationshipOverlay, BuildListPanel) → WallChartAssessmentCharts → Print → WallChartDialogs`. `export function CampaignWallChart({ campaignId, canWrite })` and its props type are unchanged.

**Unchanged:** every existing file in `wall-chart/`, `workforce-board.tsx`, `WallChartAssessmentCharts.tsx`, `first-use-hint.tsx`, `use-first-use-hint.ts`, `tests/e2e/helpers/*`, both required e2e specs.

### 3.3 Measurable decomposition outcomes (checked by the verifier)

The shell may legitimately keep hooks for layout/assembly; the checks target the moved content, not a blanket hook ban.

| Outcome | Check (working directory `apps/organising-db`) |
|---|---|
| Moved query keys are gone from the shell | `rg -n '"campaign-members-full"\|"campaign-rating-summary"\|"campaign-activity-ratings"\|"campaign-ous"\|"campaign-worker-ou"\|"split-unit-members"' src/components/campaigns/campaign-wall-chart.tsx` → no matches |
| Tile callback and pipelines are gone from the shell | `rg -n "renderTile\|applyFilters\(\|computeMetrics\(" src/components/campaigns/campaign-wall-chart.tsx` → no matches |
| No IIFEs inside JSX | `rg -n "\{\(\(\) => \{" src/components/campaigns/campaign-wall-chart.tsx src/components/campaigns/wall-chart/wall-chart-*.tsx` → no matches |
| Duplication retained, not consolidated | `rg -c "applyFilters\(" src/components/campaigns/wall-chart/wall-chart-unassigned-card.tsx src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx` → `1` and `3` |
| Tile component adds no hook | `rg -n "^\s*use[A-Z]\w*\(" src/components/campaigns/wall-chart/wall-chart-tile.tsx` → no matches |
| Model is React-free | `rg -n "from \"react\"" src/components/campaigns/wall-chart/wall-chart-model.ts` → no matches |
| Dependency direction | `rg -n "campaign-wall-chart\"" src/components/campaigns/wall-chart --glob '!**/__tests__/**'` → no matches |
| Existing modules untouched | The commit's changed-file list contains no pre-existing `wall-chart/*` or `tests/e2e/helpers/*` file (reviewer checks; any exception is in §9.3) |
| Public surface unchanged | `rg -n "CampaignWallChart" src --glob '!**/campaign-wall-chart.tsx'` → only `workforce-board.tsx` and tests |
| Parent hook sequence | Reviewer confirms the shell calls the five hooks in the order of §3.2, that each hook's body is the verbatim contiguous block with internal order intact, and that the only hook removed from the parent is block E's `renderTile` `useCallback` |

---

## 4. Tests-first sequence

### 4.1 Test stack and dependency policy

- `vitest@2.1.9`, `environment: "node"`, include `src/**/__tests__/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}`, alias `@ → src` (`apps/organising-db/vitest.config.ts`). tsconfig `"jsx": "react-jsx"`.
- Not installed and **not to be added**: `@testing-library/*`, `happy-dom`, `react-test-renderer`.
- `jsdom` is **not a declared app dependency**; vitest's resolved peer set currently includes `jsdom@29.1.1`. Stage 0's first task proves, inside the repository, whether `// @vitest-environment jsdom` resolves and whether `createRoot` + `act` + `dispatchEvent` work. **If explicit `jsdom` (or anything else) must be added, the implementer stops and requests an operator-approved plan amendment (§10.6). No fallback dependency addition is pre-authorised.**
- Playwright `1.56.1`, `apps/organising-db/playwright.config.ts` (no `webServer`; `E2E_BASE_URL`; project `chromium` runs everything except `roles/*-admin.spec.ts`).

### 4.2 Mocking and harness (`wall-chart/__tests__/harness/`)

**Mocks live in the test files, not the harness.** Each test file declares its spies with `vi.hoisted(...)` and registers **top-level** `vi.mock(...)` calls using stable alias specifiers (vitest hoists top-level `vi.mock` above imports; module mocks match by resolved path, so the alias form matches the relative import inside `campaign-wall-chart.tsx`):

```
const spies = vi.hoisted(() => ({ openWorkerDetail: vi.fn(), mutate: vi.fn(), replace: vi.fn(), push: vi.fn(), from: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: spies.replace, push: spies.push }), usePathname: () => "/campaigns/1", useSearchParams: () => currentSearchParams() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: spies.from }) }));
vi.mock("@/lib/supabase/auth-context", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () => ({ useCampaignWorkerDetail: () => ({ openWorkerDetail: spies.openWorkerDetail }) }));
vi.mock("@/components/campaigns/wall-chart/move-worker-mutation", () => ({ useMoveWorkersMutation: () => ({ mutate: spies.mutate, isPending: false }) }));   // product calls mutate(variables, { onSuccess, onError }), not mutateAsync
import { CampaignWallChart } from "@/components/campaigns/campaign-wall-chart";   // after the mocks above
```

`@/lib/hints/use-first-use-hint` (`WC:136`), `posthog-js` (no key → no-op) and `sonner` stay real. The harness contains no `vi.mock` and receives the spies as arguments.

| File | Environment | Purpose |
|---|---|---|
| `fixture.ts` | any | `buildWallChartFixture("small" \| "large")`: raw member rows (normalised by the real `normalizeCampaignMemberRows`), OUs, assignments, rating summary, and the default payloads for every other query key (§5.1). `small` = 12 members (delegate, activist, contact, HSR, non-OA union, two multi-unit workers, one unassigned), 2 `ou_type`s, one parent → 2 children → 1 grandchild, one unit with `user_rating`. `large` = 305 members / 161 units in the appendix G shape (used only by §6.3). Also `seedQueryClient(fixture)` → `QueryClient` with `staleTime: Infinity`, `retry: false`, and a default `queryFn` that **throws** `Unseeded query: <stable key>` — so any enabled query without seeded data fails the mount. |
| `mount.tsx` | jsdom only | `mountWallChart({ Component, fixture, canWrite, search, hintDismissed, localStorage })`: sets `localStorage`, mounts `<QueryClientProvider><Component/></QueryClientProvider>` via `createRoot` + `act`, then asserts every **enabled** query in the cache is `status === "success"` (failing with the offending keys). Returns `{ container, queryClient, unmount }` plus `click`, `keydown`, `dragAndDrop` (fake `DataTransfer`) helpers. |
| `characterize.ts` | jsdom only | `characterize(container, queryClient) → WallChartContract` (§4.3). |
| `render-static.tsx` | node only | `renderWallChartStatic({ Component, fixture, canWrite })` using `react-dom/server` `renderToStaticMarkup`. Separate from the jsdom mount; used only by §6.3. |

### 4.3 Characterisation snapshots — `wall-chart/__tests__/wall-chart.characterization.test.tsx` (jsdom)

Each case mounts the **production component** and snapshots `characterize(...)` with `toMatchSnapshot()`. The contract is a compact JSON object, not HTML:

```
{
  regions:  ["card-title:Wall chart", "selection-bar:absent", "summary:Campaign summary", "units", "overlay:off", "build-list:closed", "charts", "print", "dialogs:closed"],  // document order
  controls: [{ label, role, pressed?, disabled?, expanded? }, ...],                    // header + unit toolbars, document order
  cards:    [{ ouId: "unassigned"|number, title, level: 0|1|2, band?, metrics: [chip texts], tiles: [{ id, name, ouId, selected?, disabled?, draggable, hintAnchor? }] }, ...],
  counts:   { cards, tiles, bands, hiddenUnits, selected },
  anchors:  { hintAnchor: workerId|null, focusedOu: number|null },
  a11y:     [ ...exact aria-label / heading strings present... ],
  queryKeys: [ ...see normalisation below... ]
}
```

**`queryKeys` normalisation (exact):** `queryClient.getQueryCache().getAll()` → for each query, a stable JSON string of `queryKey` (arrays in order; any object element serialised with its own keys sorted) → the resulting strings sorted lexicographically (`Array.prototype.sort()` default). **Disabled queries are included** (they exist in the cache). The Stage 0 recording is the frozen, complete list; there is no "plus other keys" clause.

A supplementary **DOM skeleton** snapshot (tag + `data-*`/`role`/`aria-*` only; no classes, text or ids; depth-limited to the region level) is taken for the `default` case only.

| Case | Pins | Fails when… |
|---|---|---|
| `default` (canWrite, `small`) | Region order (charts below units, print after), control labels/states, cards in `display_order` with band headers (2 types), tile order and ids per card incl. multi-unit duplicates, metric chip texts in `%` mode, a11y strings, exact query keys | Any region/card/tile reorders or disappears; a label or state changes; a query is added, removed or re-keyed |
| `read-only` (`canWrite=false`) | Tiles `disabled`, `draggable=false`; writer controls absent/disabled exactly as today | A `canWrite` gate is dropped in threading |
| `hint-visible` (hint-dismissals `[]`) | Exactly one hint anchor on the worker `pickRatingHintAnchor` chooses; "Got it" present | Hint threading breaks |
| `build-list-open` (`?buildList=1`) | `build-list:open`, "Close build list panel" present, build-list-mode tile titles | URL-state or panel wiring regresses |
| `no-units` | Only the Unassigned card; empty-state text present | Empty-state branch lost |
| `hidden-unit` (`wallchart:unit-visibility:1` pre-seeded) | Hidden OU absent; `hiddenUnits` count | Visibility wiring regresses |
| `count-mode` (`wallchart:displayMode:1 = "count"`) | Chip texts in `#` mode; `#` pressed | Display-mode threading regresses |

Snapshots are recorded once in Stage 0 against the unmodified component and never regenerated during the WP. The contract contains no generated ids, dates or randoms.

### 4.4 Interaction tests — `wall-chart/__tests__/wall-chart.interaction.test.tsx` (jsdom, production component, explicit assertions)

| Case | Assertion |
|---|---|
| Plain click on a tile | `spies.openWorkerDetail` called once with that worker id |
| Ctrl-click then Shift-click a second tile | Selection bar text "2 workers selected"; both tiles `aria-pressed="true"` |
| Escape on the chart root | Selection cleared; region `aria-label="Wall chart selection"` absent |
| dragstart tile → drop on same-type unit | `spies.mutate` called once; first argument (variables) equals `{ refs: [{ workerId, fromOuId, fromOuType }], toOuId, mode: "move" }`; second argument is an options object with `onSuccess` and `onError` functions; `DataTransfer` carries `DND_MIME_TYPE` with `version: 1` |
| Same drop with `shiftKey` | first argument has `mode: "copy"` |
| Drop on a different-`ou_type` unit | `spies.mutate` not called and no toast rendered (silent block preserved) |
| Mutation failure | invoking the captured `onError` from the second argument renders the existing `toast.error` message |
| Drop on the Unassigned card | `toOuId: null` |
| Right-click a tile | Move/Copy dialog opens with the worker's name |
| `%`/`#` toggle | `localStorage["wallchart:displayMode:1"]` flips; `aria-pressed` follows; a chip text changes format |
| Links toggle | `localStorage["wallchart:overlay:1"]`; `aria-pressed` |
| Expand all / Collapse all | `wallchart:subUnitView:1` written for every parent; child cards appear/disappear |
| Build-list toggle from header | `spies.replace` called with a URL containing `buildList=1` and `view=wall-chart`, and `{ scroll: false }` |
| Per-scope state survives data refresh | Set a unit filter, then `queryClient.setQueryData(["campaign-ous","1"], …)` inside `act`; the filter is still applied (hook-order guard) |

Radix menus are opened by keyboard (`Enter`/`ArrowDown`) because jsdom lacks pointer capture; if a control cannot be driven, the case is dropped from this file and the control's presence remains pinned by §4.3 — recorded in §9.3.

### 4.5 Behavioural unit tests of moved helpers — `wall-chart/__tests__/wall-chart-model.test.ts` (node; written in Stage 1 after the verbatim move)

Named behaviours with fixed expected values; no copied implementation, no equality-to-oracle:

| Helper | Behaviours asserted |
|---|---|
| `effectiveAssessmentForScope` | returns the unit override when set; the campaign default when no override; `{ kind: "cumulative" }` when neither |
| `activityIdsForWallChartSelections` | distinct activity ids from a mixed list; ignores cumulative selections; `[]` for none |
| `buildAssessmentMetricsInput` | `undefined` for cumulative; for an assessment carries `activityId`, `isBinary`, `supporterOutcomeValue` and only that activity's ratings |
| `scopeAssessmentFilterAndSort` | filter then sort (a fixed 5-worker input yields a fixed id order); an empty filter returns all ids in sort order |
| `hierarchyViewKey` | `wallchart:subUnitView:7` for `"7"` |
| `readHierarchyView` | returns the stored map; `{}` for missing key, corrupt JSON, non-object JSON |
| `UNASSIGNED_KEY` | is `0` |

Before extraction these behaviours are exercised through the production component by §4.3/§4.4. Existing `wall-chart/__tests__/filters.test.ts` stays untouched and green.

### 4.6 e2e — new `tests/e2e/wall-chart-decomposition.spec.ts` (two tests)

One `describe` for dev campaign 1 (95 members / 4 units) using the existing helpers `withUserMode("full")` (describe-level) and `restClientFor`. Existing required specs and `tests/e2e/helpers/*` are unchanged.

**What the spec writes.** No campaign or domain write occurs: the only such write the page would make is the `WorkforceBoard` universe sync, which upserts `campaign_worker_membership` and `campaign_worker_ou` — the very rows the oracle counts — and it is intercepted in the browser and never reaches the backend. One reversible write does occur: `withUserMode("full")` records the account's current `workspace_prefs`, pins `{ mode: "full" }` through the admin API, and restores exactly what it recorded. The spec is therefore **not** "read-only by construction", and its header says so.

| Test | Content |
|---|---|
| **1. Census** | Navigate directly to `/campaigns/1?tab=workforce&sub=wall-chart` (never via `/my-campaigns`, never `.first()`); record every request from navigation until the first unit card and `[data-worker-id]` are visible **and** no new request has occurred for 2 s (event-driven off the `request` listener, not a fixed sleep). Assert: (a) structure — rendered unit-card headings = the exact set the REST oracle derives, and `[data-worker-id]` count = assignment rows + members with no assignment, with at least one tile, using REST oracles `campaign_organising_units`, `campaign_worker_membership`, `campaign_worker_ou` read through `restClientFor`/`sessionFromStorageState(STORAGE_STATE)`; (b) no campaign write — `POST /api/campaigns/1/sync-universe-workers` is intercepted with `page.route` and fulfilled `{ success: true, workersAdded: 0 }` (200, JSON), counted in the census, with every matching request proven answered locally and no server-origin headers on any sync response; (c) request census — the sorted de-parameterised **route-load** list printed and frozen, count ≤ `MAX_LOAD_REQUESTS`, a literal **measured on the develop preview in Stage 0**, with nav prefetches and third-party analytics counted and logged but excluded from the ceiling (see §9.3 deviation 13); (d) `performance.getEntriesByType("resource")` filtered lexically to `.js` → total `transferSize`/`encodedBodySize` printed with cache caveats, plus response-body bytes as a supplemental metric (§9.3 deviation 14); (e) `goto` → network-quiet elapsed ms printed. |
| **2. Browser-only interactions** | (a) a Radix Select trigger opens a portalled listbox and closes on Escape; (b) `%`/`#` toggle, `page.reload()`, `aria-pressed` persists (localStorage + hydration), then the toggle is put back. The originally planned build-list case is covered by the existing organiser-campaign spec; see §9.3 deviation 15. Both page loads intercept the universe sync. |

**Mode-pin restoration evidence (honest statement).** `withUserMode` captures the previous `workspace_prefs` value privately and restores it in its own `afterAll`; the new spec cannot read that value or assert after that hook. The helper logs the pin (`[workspace-mode] pinned…`) but emits **no** explicit restore line. The evidence available without editing the helper is therefore: (a) the pin line in the reporter output; (b) the asserted read-back that `setUserPrefs` performs inside the helper's `afterAll` restore; and (c) the suite completing with zero failures and no `afterAll` hook error. Stronger evidence would require editing the existing helper, which is out of scope; the verifier pastes the pin line and the suite summary into §9.5.

The same spec is run against the **develop** preview in Stage 0 (unchanged code) and the **branch** preview in Stage 11.

---

## 5. Contracts to preserve (explicit)

### 5.1 Query keys and fetch shapes (unchanged, byte-for-byte)

| Key | Source | Select / order / enabled |
|---|---|---|
| `["campaign-members-full", cid]` | `WC:384–390` | `fetchCampaignMembersFull` with `CAMPAIGN_MEMBERS_FULL_SELECT` (`normalize-members.ts:107`) |
| `["campaign-rating-summary", cid]` | `WC:392–402` | as today |
| `["campaign-activity-ratings", cid, activityIdsKey]` | `WC:490–516` | `enabled` only when ids non-empty |
| `["campaign-ous", cid]` | `WC:526–538` | `select("*")`, `.order("display_order").order("name")` |
| `["campaign-worker-ou", cid, ouIdsKey]` | `WC:582–590` | `fetchOuAssignments` (`"ou_id, worker_id, is_primary"`, `normalize-members.ts:149`) |
| `["campaign", cid]` | `WC:592–603` | `select("total_worker_estimate, name")` |
| `["split-unit-members", …]` | `WC:1279–1334` | `enabled` only while the split dialog is open |
| Sibling hooks (untouched) | `use-build-list.ts` (`["worker-lists", cid]`, `["worker-list", cid, id]`), `use-leader-links.ts` (`["leader-links","campaign",cid]`), `use-participation-predicate.ts` (`["wallchart-latest-activity", cid]`, `["wallchart-participation", cid, kind, activityId]`), `assessment-selector.tsx` (`["campaign-assessments-rated", cid]`), `participation-selector.tsx` (`["wallchart-activities-list"]`, `["wallchart-task-lists-list"]`), `use-coverage-data.ts` (`["coverage-map"]`, `["coverage-summary"]`, `["woc-representation-by-unit"]`), `useCampaignDataFields.ts` (`["campaign-data-fields"]`, `["campaign-facts", cid, "all"]`), `useCampaignWorkerListActivity.ts` (`["campaign-worker-list-activity"]`), `useAssessmentDistributions.ts` (`["campaign-member-ids"]`, `["assessment-dist-ous"…]`, `["campaign-activity-ratings-dist"…]`, `["campaign-assessment-ambition-targets"…]`), `use-first-use-hint.ts` (`["hint-dismissals", userId]`) | |

The frozen `queryKeys` list from §4.3 is the executable form of this table. Invalidations: `reorderOus` → `["campaign-ous"]`; `handleBulkRemoveFromUnit` → `["campaign-worker-ou"]`, `["campaign-ou-coverage"]`; move/copy via `useMoveWorkersMutation` unchanged.

### 5.2 URL state
`?tab=&sub=` untouched (WP1.4); `?view=` read by `workforce-board.tsx`; `?buildList=1` set/cleared together with `view=wall-chart` via `router.replace(…, { scroll: false })` (`WC:236–257`); `?ou=<id>` focus + `ring-2` highlight (`WC:326–331`, `WC:547–558`).

### 5.3 localStorage keys
`wallchart:unit-visibility:<cid>`, `wallchart:displayMode:<cid>` (default `pct`), `wallchart:subUnitView:<cid>`, `wallchart:overlay:<cid>`. No new keys, no format change.

### 5.4 DnD
`DND_MIME_TYPE = "application/x-oa-wallchart-worker"`, `DND_UNIT_MIME_TYPE = "application/x-oa-wallchart-unit"`, payload `version: 1`, `WorkerDragRef { workerId, fromOuId, fromOuType }`, Shift = copy, cross-`ou_type` drop silently blocked (no toast; `toast.error` only on mutation error), drop on Unassigned = `toOuId null`, unit drag payload `{ version: 1, ouId, ouName, workerIds }` (`dnd.ts`).

### 5.5 Selection
`makeKey(ouId, workerId)` = `` `${ouId ?? "u"}:${workerId}` `` (`use-wall-chart-selection.ts`); click semantics (`open` / `toggle-select` / `select-only`; `buildListMode` inverts single click, `worker-tile.tsx:207–228`); Esc on the root clears; selection bar copy "{n} worker(s) selected".

### 5.6 WP1.7 hint
`pickRatingHintAnchor` memo computed after `visibleWorkersForOu` with the same inputs (both inside block C); `ratingHintAnchor`, `showRatingHint`, `onRatingHintDismiss` passed to exactly the anchor tile; `data-hint-anchor="wall_chart_rating"`; `data-worker-name`; `first-use-hint.tsx` untouched.

### 5.7 Campaign chrome and deep links
Nothing in the campaign shell or tabs is touched; `organiser-campaign.spec.ts` stays green.

### 5.8 Accessibility strings
"Wall chart" title, "Campaign summary" `h2`, `aria-pressed` on `%`/`#`/Links/Build list, `aria-label="Wall chart selection"`, `aria-label="Unit actions"`, unit-card labels ("Show unit summary"/"Hide unit summary", "Collapse unit"/"Expand unit", "Drag entire unit …"), unit-manager labels (`Expand/Collapse <label>`, `Move <label> up/down`, `Delete <label>`), tile `title` composition (`worker-tile.tsx:184–205`), rating badge `aria-label`, "Close build list panel". Pinned by §4.3.

### 5.9 Print
Print button calls `window.print()`; `print:hidden` classes unchanged.

### 5.10 Error handling and writers
`handleWorkerDrop` `toast.error` on failure (`WC:1390–1392`); `handleBulkRemoveFromUnit` direct delete on `campaign_worker_ou` then invalidations; `deleteUnitWorkers`; `reorderOus` one update per unit. No new writers, no removed writers (appendix A §9 inventory unchanged).

### 5.11 `canWrite` gates and telemetry
Every `canWrite` check in tiles, toolbar, header, DnD (`draggable`), dialogs and the kebab remains at the same decision point. `noteFirstInteraction` and `wallchart_filter_applied` (scope "unassigned"/"unit") fire from the same user actions.

### 5.12 Full mode
The chart renders identically in full mode; the e2e specs pin full mode via `withUserMode("full")`.

---

## 6. Performance evidence (no local app run)

Acceptance: no extra queries; no material bundle or render regression; synthetic 305/161 characterisation if feasible. Three distinct measurements, none conflated.

### 6.1 Bundle — build-manifest route-chunk aggregation (local `pnpm build`, no server)

Next 16 is not assumed to print a First Load JS table. The metric is the sum of client chunk bytes that `.next/app-build-manifest.json` attributes to the campaign route entry. A small temporary **read-only** Node script, `apps/organising-db/test-results/wp2.3-route-bytes.mjs`, implements exactly this logic (the directory is not part of the commit; the file is never staged and is deleted at Stage 7 — note the directory currently shows untracked files, so it is not relied on as ignored):

1. Read `.next/app-build-manifest.json`; if the file is missing, or `manifest.pages` is not a plain object, print `MANIFEST_SHAPE_UNEXPECTED` with the top-level keys found and exit `2`.
2. Compute `candidates = Object.keys(manifest.pages).filter(k => k.includes("/campaigns/"))` and print them.
3. Read the route key from `process.argv[2]`. If absent, exit `3` after printing candidates (Stage 0 chooses the exact key from this list and freezes it in §9.5).
4. If the key is not in `manifest.pages`, print `ROUTE_KEY_ABSENT` and exit `4`.
5. For each file in `manifest.pages[key]`, `statSync(".next/" + file).size`; print JSON `{ key, fileCount, totalBytes, perFile: [{ file, bytes }] }` and exit `0`.

Stage 0 validates reproducibility: two consecutive `pnpm build` runs on the unmodified tree must yield the same `{ fileCount, totalBytes }` for the frozen key (or the observed variance is recorded as the noise floor). If the manifest is absent or shaped differently, the fallback (browser Resource Timing in §6.2 alone, plus any route table the build log prints, pasted verbatim) is recorded in §9.3 **before** any extraction. Criterion: after ≤ before within the recorded noise floor (+1 % at most); anything above is investigated and the responsible extraction undone.

### 6.2 Browser — Vercel dev-backed preview (Resource Timing, request census, load time)

From §4.6 test 1 on the develop preview (before) and the branch preview (after), three runs each, medians recorded: total `.js` `transferSize`/`encodedBodySize`, request count and table list, `goto` → first tile visible.

Criteria: request count after ≤ before (network-level "no extra query"); JS bytes after ≤ before within noise; load time after ≤ before within noise.

**Evidence limitation (disclosed):** dev campaign 1 has 95 members / 4 units; the programme criterion (305 members / 161 units under two seconds) cannot be observed end-to-end on dev data. Browser timing is a thin-data regression comparison, not proof of the programme criterion.

### 6.3 Synthetic render cost — `wall-chart/__tests__/wall-chart.render-cost.test.tsx` (node env, `render-static.tsx`, its own top-level mocks)

Renders the `large` fixture (305/161) via `renderToStaticMarkup` five times after a warm-up and prints the median; asserts median `< 2000 ms` as a generous ceiling. This measures React render work on a developer machine with a separate node harness; it is **not** the jsdom mount and **not** browser end-to-end render time (no network, hydration, layout or paint), and does not by itself prove the under-two-second programme criterion. Its value is the before/after comparison at production-like scale. If the full client tree cannot be rendered by `react-dom/server` (a module hard-requires `window` at import), the metric is dropped and the limitation recorded in §9.3 **before** extraction; acceptance then rests on §6.1, §6.2 and the frozen `queryKeys`.

---

## 7. Verification commands (exact)

Plain commands; Cursor captures output. Expected results are stated after each group. Run after **every** stage in §8; the full set at the end. No `rm -rf .next`, no `tee`, no `head`/`tail`, no `&&`/`||` label chains, no internal `cd`.

**Working directory: `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db`**

```
pnpm tsc --noEmit -p tsconfig.json
```
Expected: exit 0, no diagnostics. Only if the failure is a stale generated route type, run the following once as a separate command and re-run tsc:
```
rm -rf .next/types
```

```
pnpm test
```
Expected: exit 0; baseline 1029 tests / 76 files plus the new files; zero failures.

```
pnpm vitest run src/components/campaigns/wall-chart
```
Expected (per-stage loop): exit 0; the summary lines report no snapshots "written", "updated" or "obsolete" after Stage 0. `-u` is never passed.

```
pnpm lint
```
Expected: the final "problems" line reports a total ≤ 294 (baseline 143 errors / 151 warnings).

```
pnpm eslint src/components/campaigns/campaign-wall-chart.tsx src/components/campaigns/wall-chart tests/e2e/wall-chart-decomposition.spec.ts
```
Expected: exit 0 (touched files clean).

```
pnpm build
```
Expected: exit 0. If the log prints a route table, it is pasted verbatim as supplementary evidence.

```
node test-results/wp2.3-route-bytes.mjs
node test-results/wp2.3-route-bytes.mjs <frozen-route-key>
```
Expected: first form exits 3 after printing candidate keys (Stage 0 only); second form exits 0 and prints `{ key, fileCount, totalBytes, perFile }`.

```
rg -n '"campaign-members-full"|"campaign-rating-summary"|"campaign-activity-ratings"|"campaign-ous"|"campaign-worker-ou"|"split-unit-members"' src/components/campaigns/campaign-wall-chart.tsx
rg -n "renderTile|applyFilters\(|computeMetrics\(" src/components/campaigns/campaign-wall-chart.tsx
rg -n "\{\(\(\) => \{" src/components/campaigns/campaign-wall-chart.tsx src/components/campaigns/wall-chart/wall-chart-header.tsx src/components/campaigns/wall-chart/wall-chart-tile.tsx src/components/campaigns/wall-chart/wall-chart-unassigned-card.tsx src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx src/components/campaigns/wall-chart/wall-chart-dialogs.tsx
rg -n "^\s*use[A-Z]\w*\(" src/components/campaigns/wall-chart/wall-chart-tile.tsx
rg -n "from \"react\"" src/components/campaigns/wall-chart/wall-chart-model.ts
rg -n "campaign-wall-chart\"" src/components/campaigns/wall-chart --glob '!**/__tests__/**'
```
Expected: each of the six commands prints nothing (rg exit 1 = no matches).

```
rg -c "applyFilters\(" src/components/campaigns/wall-chart/wall-chart-unassigned-card.tsx src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx
```
Expected: `…unassigned-card.tsx:1` and `…unit-hierarchy.tsx:3`.

```
source ~/.zshrc
E2E_BASE_URL=<branch-preview-url> pnpm e2e -- tests/e2e/wall-chart.spec.ts tests/e2e/organiser-campaign.spec.ts tests/e2e/wall-chart-decomposition.spec.ts
E2E_BASE_URL=<branch-preview-url> pnpm e2e
```
Expected: zero failures. Without credentials, every credential-dependent test skips cleanly (no hard-coded skip count). Credentials come only from `~/.zshrc` and are never printed. Reporter output must include the `[workspace-mode] pinned…` line and the suite must finish with no `afterAll` hook error (the helper emits no explicit restore line; its restore is evidenced by its internal asserted read-back and clean completion).

**Working directory: `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance`**

```
pnpm validate:migrations
```
Expected: exit 0; no migration is touched by this WP.

Preview URL discovery (read-only GitHub API; either working directory):
```
gh api repos/R3v3ill3/OffshoreAlliance/deployments?sha=<sha> --jq '.[0].id'
gh api repos/R3v3ill3/OffshoreAlliance/deployments/<id>/statuses --jq '.[] | select(.state=="success") | .environment_url'
```

Workspace-level equivalents accepted by the orchestration prompt: `pnpm --filter organising-db lint|test|build`.

---

## 8. Implementation stages (one final commit)

Each stage ends with: targeted vitest green with no snapshot writes, `tsc` clean, `eslint` on touched files clean. No intermediate commits; the working tree carries all stages until Stage 11.

| Stage | Work | Gate |
|---|---|---|
| **0 — pin and baseline (unmodified product)** | (a) One-assertion jsdom probe test in-repo; if it fails, **stop** (§10.6). (b) Harness (§4.2), characterisation snapshots (§4.3), interaction tests (§4.4), render-cost test (§6.3) — all against the untouched component; freeze `queryKeys`. (c) `wall-chart-decomposition.spec.ts` (§4.6); run against the develop preview; record `MAX_LOAD_REQUESTS`, table list, JS bytes, load medians, the mode-pin line and clean suite completion. (d) `pnpm build` twice; run the route-bytes script; choose and freeze the route key; record reproducibility/noise floor or the fallback. (e) Record `pnpm test` and `pnpm lint` baselines. | All new tests green on the untouched component; e2e spec green on develop preview; metrics reproducible and recorded in §9.5. |
| **1 — model** | Create `wall-chart-model.ts` by verbatim move of `WC:139–213` and `WC:958`; `WC:` imports them. Write `wall-chart-model.test.ts` (§4.5). | Snapshots unchanged; model tests green. |
| **2 — hook A (shell state)** | `use-wall-chart-shell-state.ts` from `WC:222–368`; shell consumes its return objects. | Snapshots unchanged; Escape/build-list/Links interaction tests green. |
| **3 — hook B (core data)** | `use-wall-chart-core-data.ts` from `WC:370–523`. | Snapshots incl. `queryKeys` unchanged. |
| **4 — hook C (structure)** | `use-wall-chart-structure.ts` from `WC:526–883`. | Snapshots unchanged; hint case; "state survives refresh" green. |
| **5 — hook D (view & metrics)** | `use-wall-chart-view-metrics.ts` from `WC:885–1115`. | Snapshots unchanged; `%`/`#`, Expand/Collapse tests green. |
| **6 — hook F (actions)** | `use-wall-chart-actions.ts` from `WC:1252–1426`. | Snapshots incl. `split-unit-members` key unchanged; DnD tests green. |
| **7 — tile** | `renderTile` (`WC:1117–1242`) → `WallChartTile`; replace call sites; the parent loses only the `renderTile` `useCallback`, all other hooks keep their relative order. | Snapshots unchanged; click/DnD tests green; tile-hook grep empty. |
| **8 — unit hierarchy** | Unassigned IIFE → `WallChartUnassignedCard` (block #1 verbatim); band IIFE → `WallChartUnitHierarchy` + `WallChartSubUnits` (blocks #2–#4 verbatim). | Snapshots unchanged; `applyFilters(` counts `1` and `3`. |
| **9 — header and dialogs** | Sticky wrapper → `WallChartHeader`; dialog block → `WallChartDialogs`. | Snapshots unchanged; right-click dialog test green. |
| **10 — shell and after-measurement** | Shell reduced to the sequence in §3.2 plus JSX; §3.3 checks; `pnpm test`, `tsc`, `pnpm lint`; `pnpm build` + route-bytes with the frozen key; §6.3 after-median; delete the temporary script. Paste raw outputs into §9.5. | All criteria met. |
| **11 — commit and preview** | One commit on `feat/oux-wp2.3-wall-chart-decomposition` (operator agrees the exact `git add`/`git commit`/`git push` commands first). Verifier runs the e2e set against the branch preview (§7) and pastes output; reviewer applies the 8-item checklist. PR only when the operator asks. | Zero e2e failures on the branch preview; reviewer findings resolved. |

If a stage gate fails for a reason other than a harness defect, that stage's extraction is reverted in the working tree and the plan is amended (§9.3) before continuing.

---

## 9. Evidence, risks, deviations, approval

### 9.1 Acceptance-criteria evidence matrix

| Criterion | Evidence | Where |
|---|---|---|
| Tests written before the refactor pass after it | Stage 0 vitest output (new files green on untouched component) + Stage 10 output with no snapshot writes; develop-preview e2e baseline + branch-preview after-run | §9.5 |
| No visible change | Characterisation and skeleton snapshots unchanged through all stages; both required e2e specs pass on the branch preview; screenshots of `/campaigns/1?tab=workforce&sub=wall-chart` from develop and branch previews under `docs/organiser-ux-review/evidence/wp2.3/` | §9.5 |
| Bundle not worse | §6.1 route-bytes before/after for the frozen key; §6.2 JS Resource Timing before/after | §9.5 |
| Render time not worse | §6.2 load-time medians (thin dev data, disclosed); §6.3 synthetic render-cost medians (not end-to-end, disclosed) | §9.5 |
| No extra query | Frozen `queryKeys` unchanged in every characterisation snapshot; §4.6 request census `count ≤ MAX_LOAD_REQUESTS` on the branch preview | §9.5 |
| Split along header, band/unit, tile, dialogs, hooks with preserved relative hook order | §3.2 files exist; §3.3 checks pass; reviewer confirms the five-hook sequence, verbatim contiguous blocks, and that only the `renderTile` `useCallback` left the parent | §9.5, §9.6 |
| tsc / `pnpm test` / lint / build | Command outputs; lint total ≤ 294 and touched files clean | §9.5 |
| No schema change; database-write statement holds | `pnpm validate:migrations`; no `supabase/migrations` change in the commit; mode-pin line plus clean suite completion (no `afterAll` error) | §9.5 |
| Reviewer checklist item 7 (tests test behaviour) | §4.3 contracts, §4.4 explicit assertions, §4.5 fixed expectations — none compare against a copied implementation | §9.6 |

### 9.2 Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| jsdom does not resolve in-repo | Medium | Stage 0(a) probe first; stop and request amendment (§10.6). |
| Full-tree mount fails in jsdom (module touches `window` at import, Radix quirk) | Medium | Discovered in Stage 0 before any refactor; fix harness mocks or stop (§10.11). |
| A block boundary hides a hidden dependency on a later value | Low | Impossible by construction (current code cannot read later `const`s during render); the compiler flags any attempt when parameters are threaded. |
| Threading error drops a `canWrite` gate or hint prop | Medium | `read-only` and `hint-visible` contracts. |
| Actions hook is given an incomplete input set (e.g. missing `setRemoveConfirmOpen`, `ouAssignments`, `queryClient`) | Medium | §3.2 lists every direct external dependency of `WC:1252–1426`; `tsc` fails on any missing parameter; DnD, bulk-remove and split interaction/characterisation cases cover the call paths. |
| A test is shaped to a wrong product API (e.g. asserting `mutateAsync`) | Low | Spies mirror the product call exactly (`mutate(variables, { onSuccess, onError })`); Stage 0 tests must pass against the unmodified component before any move. |
| Verbatim block moved into the wrong scope (e.g. child block into grandchild) | Medium | `default` contract pins per-card metrics and tile order for all four scopes. |
| `.next/app-build-manifest.json` absent or shaped differently | Medium | Script exits with an explicit code; Stage 0(d) records the fallback before extraction. |
| Preview cold start skews browser metrics | High | Three runs, medians; regression comparison only. |
| Characterisation contract too coarse to catch a regression that HTML would catch | Low–medium | Contract includes order, ids, states, labels, counts, keys; supplementary skeleton snapshot; interaction assertions. |
| Lint count rises | Low | New files written clean; `eslint` on touched files each stage. |
| Scope creep into consolidation | Medium | §1.4 table; `applyFilters(` count check; reviewer "no behaviour change" per file. |

### 9.3 Deviations from plan

Stage 0 (recorded before any extraction). None of these changes what the tests
assert about behaviour; each is a change to how the harness reaches the
behaviour, forced by something the plan could not see until the component was
actually mounted.

1. **Data reaches the component through a fake Supabase backend, not a pre-seeded query client.** §4.2 specified `seedQueryClient`. That cannot work: `campaign-assessments-rated` is declared `refetchOnMount: "always"`, so a seeded cache is discarded on mount and the real `queryFn` runs. The harness instead installs a table-aware fake PostgREST builder (`harness/backend.ts`) plus a fake `fetchApi`, and the query client's default `queryFn` throws `Unseeded query: <key>`. Net effect is stronger than planned — every query the component issues must be explicitly accounted for in the fixture, and an unseeded one fails loudly.
2. **`sonner` is mocked with a spy.** The plan left it real. No `<Toaster/>` is mounted in the harness, so a real `toast.error(...)` leaves nothing in the DOM to assert on, and the failed-move path (`moveWorkers` `onError`) would be unobservable.
3. **Unit cards are located by the `print:break-inside-avoid` class.** `CampaignUnitCard` renders no `data-ou-id` or other data attribute on its root — the class list is the only stable handle. Verified to be used by exactly two modules in `src` (`campaign-unit-card.tsx`, `wall-chart-summary-header.tsx`), so the selector is unambiguous. If Stage 1 adds a data attribute, that is a behaviour-visible change and out of scope.
4. **The `cards` contract includes the campaign summary header.** Its heading is an `h2`, not the `h3` unit cards use, and it shares the card class. Rather than exclude it, `cards` covers both and `counts` was split into `unit-cards` and `top-level-units` so the unit-only figures stay unambiguous.
5. **Render cost is measured as a jsdom full mount, not `renderToStaticMarkup` in node (§6.3).** The static-render harness would have to hand-prime ~23 query keys, which means duplicating the product's fetch layer in test code — forbidden by §4.1 — and a mis-primed cache renders a fast empty shell, a failure mode a timing assertion cannot detect. The jsdom measurement runs the real fetch path and is guarded by exact `tiles === 250` and `cards === 162` assertions, so it cannot pass on an empty tree. Budget is 6000 ms against observed medians of 2.1–2.2 s: a tripwire for an order-of-magnitude regression, not a performance gate.
6. **The build-list *open* path is not characterised, because it is unreachable.** `setBuildListOpen` is only ever called as `setBuildListOpen(false)`, from `BuildListPanel`'s `onClose`. Nothing inside `CampaignWallChart` opens the panel. The close path (URL rewritten to `?view=wall-chart` via `router.replace`) is characterised instead.
7. **Drop-event bubbling from a nested sub-unit card to its parent is pinned as current behaviour.** A drop on a sub-unit card fires the parent card's handler too, producing two `moveWorkers.mutate` calls. Today this is usually masked by the `allAlreadyThere` no-op guard. It is pinned as-is (a dedicated test asserts both calls) rather than treated as a bug — Stage 1 must not change it, and fixing it is a separate work package.
8. **The route-byte script reads Next 16's per-route manifests.** `.next/app-build-manifest.json`, which §6.1 targets, is not emitted by Next 16.1.6 (the script's shape check exits 2 on it — the §9.2 risk row, realised). The replacement unions `.next/server/app/<route>/page/build-manifest.json` (`rootMainFiles`, `polyfillFiles`) with the `clientModules[].chunks` and `entryJSFiles` from the eval'd `__RSC_MANIFEST` in `page_client-reference-manifest.js`, normalising the `_next/` prefix before de-duplication because the two manifests spell the same chunk differently.
9. **18 interaction tests, not the 14 of §4.4.** The four additions cover cross-`ou_type` copy (distinct from the planned cross-type move block), selection clearing after a successful move, the nested-card bubbling of deviation 7, and unassigned-worker survival across a refetch.
10. **Playwright empties `test-results/` at the start of every run**, which deletes the temporary `test-results/wp2.3-route-bytes.mjs` from §6.1. The script is re-created after e2e runs; the measurement was reproduced byte-for-byte from a fresh copy to confirm the tool, not the artefact, is what matters. Stage 1 should take bundle measurements before e2e runs, or expect to re-create the script.

Stage 0 correction round (recorded after the orchestrator rejected the first browser baseline; the e2e spec was corrected and re-run, no production file touched).

11. **The `WorkforceBoard` universe sync is intercepted in the browser.** `§4.6` required "no campaign/domain writes", but simply loading the page as a writer fires `POST /api/campaigns/1/sync-universe-workers`, and that endpoint upserts `campaign_worker_membership` and `campaign_worker_ou` — the exact rows the REST oracle counts, so an unlucky run could both mutate the campaign and invalidate its own oracle. The spec now installs a `page.route` for that one dev path and fulfils it with the product's own success shape, `{ success: true, workersAdded: 0 }` (200, `application/json`). `workersAdded: 0` matters: `workforce-board.tsx` invalidates `campaign-members-full` and `campaign-worker-ou` only when it is positive, so the stub reproduces the load shape of an already-synced universe rather than suppressing work the product would do. The request is still counted in the census. Interception is proven, not assumed: every request to that path is counted alongside every handler invocation and the two must be equal, and any sync response carrying a server-origin header (`x-vercel-id`, `x-vercel-cache`, `server`, `x-matched-path`) fails the test as evidence the interception leaked.
12. **The spec header no longer claims to be "read-only by construction".** It is not. It states what is true: no campaign or domain write happens because the sync is intercepted, and one reversible dev-account preference write does happen through `withUserMode("full")`, which records the current `workspace_prefs` and restores exactly what it recorded.
13. **The request ceiling is scoped to route-load requests, not the raw total.** The raw total ranged 109–148 across baseline runs; every extra request came from Next.js `next/link` prefetching the sidebar's other routes (`/dashboard`, `/worksites`, `/email/inbox`, `/upcoming-projects`, `/campaigns/1/sms/setup`, …) or from third-party chatter (PostHog batching, Sentry envelopes — 6 in one run and 22 in another — and the vercel.live preview toolbar). None of that is the wall chart's load, and a ceiling loose enough not to flake over it would be loose enough to hide a real waterfall. "Route-load" is the campaign document, everything under `/_next/`, the app's own `/api/` routes, static assets the layout references, and the dev Supabase REST origin. It held at **89, 88, 90** across the three baseline runs with **79 distinct URLs in every one**, versus a raw total that swung by 39. Nav-prefetch and third-party counts are still measured, logged and reported; only the ceiling excludes them.
14. **Resource Timing is the recorded JS-bytes metric; response-body bytes are supplemental and differ materially.** §6.2's `performance.getEntriesByType("resource")` figures are stable to the byte across every run (`transferSize` 1,178,865; `encodedBodySize` 1,165,665; 50 script entries). The response-body sum the earlier draft reported instead ranged 1.69–4.06 MB for the same page, because it counts *decoded* bytes and depends on which bodies are still readable when the listener asks. Both are logged, but the Resource Timing pair is the baseline. Caveats, which make the Resource Timing numbers a floor: `transferSize` is 0 on a cache hit and includes ~300 B of response headers otherwise, and both fields are 0 for a cross-origin resource served without `Timing-Allow-Origin` — which is why 6 of the 50 script entries report zero and the app's own `_next/static` chunks are also totalled separately.
15. **The second e2e test exercises a Radix Select and the `%`/`#` toggle rather than the build list.** §4.6 planned `?buildList=1` → panel → close. Two reasons it moved: `tests/e2e/organiser-campaign.spec.ts` already covers the Build list panel, so repeating it buys nothing; and what the jsdom suite genuinely cannot reach is Radix's portal, focus-trap and pointer handling, which is exactly what the decomposition puts at risk when the controls move into their own components. The test count is unchanged at two.
16. **Stage 0 adds 13 files, not 12.** The generated snapshot `__snapshots__/wall-chart.characterization.test.tsx.snap` is a new file in its own right. The inventory in §9.5(c) now reports 7 harness modules, 3 vitest specs, 1 generated snapshot and 1 e2e spec separately, plus the temporary route-byte script that is never staged, rather than a single total that obscured what kind of artefact each one is.
17. **The first browser baseline is superseded, not retained.** It navigated through `/my-campaigns` and clicked `.first()`, so its 127-request median measured the portfolio page's requests, its prefetches and whichever campaign sorted first — not the wall-chart route. Its figures (127 requests, ceiling 140, 3,200 KB response-body script bytes, 4,839 ms) are recorded in §9.5 only as superseded, and no comparison should be made against them.

Stages 1–10 (extraction round).

18. **The three DOM refs live in the shell, not in blocks A and B.** §3.2 assigned the two sticky refs to block A and `unitsContainerRef` to block B (`core.unitsContainerRef`). Returning a `useRef` object from a hook makes `react-hooks/refs` treat *every* sibling property of that hook's result as a ref read during render: hook B's ref alone produced 35 "Cannot access refs during render" errors across the shell, and hook A's two refs took the total to 47, flagging even `campaignId` inside an object literal. Both probes were run to isolate it (remove B's ref → 35; remove A's two as well → 0). The shell therefore creates all three with `useRef` and passes the two sticky ones into hook A as `RefObject<HTMLDivElement | null>` parameters; `unitsContainerRef` never enters a hook and is read only by the units `<div>` and `RelationshipOverlay`'s `containerRef`, exactly as before. The effects inside hook A are byte-identical apart from their dependency arrays now naming the parameter.
19. **The React Compiler lint rules were bailing out on the 2,635-line component and start reporting once it is split.** This is the root cause of deviations 18 and 20: `react-hooks/refs` and `react-hooks/set-state-in-effect` silently analyse nothing on a component that large, so latent diagnostics only surface as files shrink. No new defect was introduced by the move in either case; the code that now reports is byte-identical to the code that did not.
20. **One annotated `react-hooks/set-state-in-effect` suppression in hook A.** `useEffect(() => { if (!buildListOpen) setBuildListWallDragActive(false); }, [buildListOpen])` moved verbatim and then reported an error for the first time (deviation 19). Rewriting it would be a behaviour change under §1.4, so it carries a single `// eslint-disable-next-line react-hooks/set-state-in-effect` with the reason recorded above it. It is the only suppression added in the whole work package.
21. **Four dependency arrays in the shell gained a provably stable setter.** `setHighlightedOuId` (×2), `setTileUnitDialog` and `setRemoveConfirmOpen` are `useState` setters that now cross a hook boundary, so `react-hooks/exhaustive-deps` can no longer prove they are stable and warned about each. Each is listed in its array with a comment stating why; `useState` setters are referentially stable, so this is a provable runtime no-op and it keeps `pnpm lint` at the 294 baseline rather than 298.
22. **Block E became a shell-owned `tileContext` memo plus four `<WallChartTile>` call sites.** §3.2 anticipated "any shell-owned prop-assembly memo"; concretely, `renderTile`'s `useCallback` is gone from the parent (the only hook removed, as §3.3 requires) and its identical body is `WallChartTile`. The shell assembles the 13-member context once in a `useMemo` and spreads it at each site with an explicit `key`, so the tile's props, hint trio, DnD payload and selection keys are unchanged.
23. **Two nested JSX IIFEs were hoisted to named locals inside the files they moved into.** §3.3 requires `rg -n "\{\(\(\) => \{"` to return nothing across the shell and the five `wall-chart-*.tsx` files, but two pre-existing IIFEs sat *inside* moved blocks: the grandchild sub-unit renderer in the hierarchy and the remove-confirm description in the dialogs. Each body moved verbatim into a named arrow function declared in the same component and is called from the same JSX position, so laziness and output are identical and no sixth render file was needed.
24. **Two pure derivations moved from the shell gap into `WallChartDialogs`.** `tileDialogWorker` and `tileDialogWorkerOuIds` are one-line reads of `workerById` / `unitsByWorker`, consumed only by the tile-unit dialog. They travelled with their sole consumer rather than becoming props outside the §3.2 prop list.
25. **The render components receive whole hook results, not flattened props.** Each of `WallChartUnassignedCard`, `WallChartUnitHierarchy`, `WallChartSubUnits`, `WallChartHeader` and `WallChartDialogs` takes `{ campaignId, canWrite, shell, core, struct, view, actions, tileContext }` (subsets where the plan's prop list is narrower) and opens with a destructuring preamble that rebinds the exact local names the moved JSX already used. That is what made the blocks movable verbatim — the alternative was ~40 individually named props per component and an edit to every line of moved JSX.
26. **`WallChartSubUnits` is a second export of `wall-chart-unit-hierarchy.tsx`, not a sixth file.** The child-card block (pipeline #3, and pipeline #4 for grandchildren) is the top-level card's `subUnits` slot. Keeping it in the hierarchy file preserves the four pipelines separately and verbatim — `rg -c "applyFilters("` gives `1` for the unassigned card and `3` for the hierarchy, as §3.3 requires — without adding a file outside the approved set.
27. **The `// ── Split: members ──` section comment moved into hook F.** §2.2 lists it in the shell gap above block F; it documents the `split-unit-members` query that block F owns, so it travelled with it.
28. **`pnpm eslint src/components/campaigns/wall-chart` cannot exit 0, and never could.** §7's command includes the whole directory, but six pre-existing modules in it (`delete-organising-unit-dialog.tsx`, `find-duplicate-workers-dialog.tsx`, `normalize-members.ts`, `worker-detail-sheet.tsx`, `worker-relationships-tab.tsx`, `participation-import/use-participation-import.ts`) already report 13 problems that are part of the 294 baseline and are out of scope under §10.7. The gate was therefore run as the explicit list of files this work package touches, which does exit 0.
29. **The `react-free` and `dependency-direction` checks in §3.3 needed their own wording fixed, not the code.** `rg -n 'from "react"' wall-chart-model.ts` matched the module's own docblock sentence, which was reworded. `rg -n 'campaign-wall-chart"'` matches the pre-existing query key `["campaign-wall-chart", campaignId]` in `add-campaign-worker-dialog.tsx` — not an import, and in a file that must not be edited. The check was run in the form the outcome actually describes, `rg -n 'from "(\.\.?/)*campaign-wall-chart"'`, which returns nothing.
30. **Route bytes rose 9,997 bytes (+0.24 %) — inside §6.1's +1 % cap but above the 0-byte noise floor.** 4,210,300 → 4,220,297 for the frozen key, same 45 files. The entire delta is one chunk: the wall chart's own, 729,440 → 739,437 (hash `3c878cc…` → `2744429…`); the other 44 files are byte-identical to Stage 0. It is the cost of the decomposition itself — twelve module boundaries and the prop/type plumbing — not of any single stage, so "undo the responsible extraction" (§6.1, §10.4) has no target smaller than the work package. Flagged for the operator rather than absorbed silently. **The first explanation offered for this figure was wrong and is corrected in deviation 32: the ten redundant `"use client"` directives were not part of it.**
31. **Three product files outside the wall chart change mtime continuously without being edited.** `src/lib/supabase/client.ts`, `src/lib/supabase/session-recovery.ts` and `src/app/api/worker-import/apply/route.ts` report an mtime equal to whatever the current time is each time they are listed — something in the local environment (an editor or watcher process) touches them. No WP2.3 command writes to them. Content equality cannot be confirmed without git, so the reviewer should check them explicitly in the Stage 11 diff.
32. **The ten new internal modules carried redundant `"use client"` directives; they were removed, and the bundle did not change by one byte.** Next.js 16.1.6's boundary rule is that `"use client"` marks the entry point of the client boundary: once `campaign-wall-chart.tsx` declares it, every module in its import graph is already in the client bundle, and an internal module needs its own directive only if it is *also* imported directly from a Server Component. A read-only audit of all importers (§9.5) shows every one of the ten is reached only from `campaign-wall-chart.tsx` or from a sibling WP2.3 module already below that boundary — none is imported by anything in `src/app`, by a page, layout, route handler or any other Server Component, and none is imported outside the WP2.3 subtree. The directives were therefore redundant and were removed from all ten; `campaign-wall-chart.tsx` remains the sole boundary, and no pre-existing file's directive was touched. **This did not reduce the route bytes: the frozen key still measures 4,220,297 across 45 files, and the wall chart's chunk is still exactly 739,437 bytes.** That is the expected result once stated plainly — the compiler strips the directive from emitted client JavaScript, so a redundant one costs nothing at runtime. Only the chunk's content hash moved (`2744429…` → `3c364e5…`), because chunk hashing is over module source, not emitted size. The removal stands on correctness and on matching the official boundary model, not on bundle size, and deviation 30's +9,997 bytes is confirmed as genuine module-boundary and prop-plumbing cost with no directive component.
33. **Operator-approved frozen-test exception: the corrected Stage 0 tests were re-derived against an exact copy of the pre-refactor component, not against the decomposed one.** Pre-review fix round 1 found two characterisation defects (§9.6 findings 1 and 2) that had been recording the *wrong* observation since Stage 0, so the frozen snapshot encoded a hidden hint and a missing empty state. Correcting them necessarily changes snapshot values, which §10.1 makes a stop condition — so the operator approved a narrow exception with a procedure that makes the correction impossible to shape to the extracted code: the orchestrator created `apps/organising-db/src/components/campaigns/campaign-wall-chart.baseline.tsx`, a byte copy of `CampaignWallChart` at pre-refactor commit `03294d594c2f86cfb57ab6fb8d679bd8db023411`; the three specs were temporarily pointed at it; `-u` was run **only** while they pointed there; and the resulting values then had to pass unchanged against the real decomposed component with no `-u`. They did, on the first run — see §9.5 for the exact two-line diff and both run results. The baseline copy was deleted with the file-delete tool and its absence confirmed by Glob and by a failed read. No production source was touched in this round.
34. **The mislabelled per-scope test was renamed and kept, not deleted, alongside the new approved one.** §9.6 finding 5 required replacing "per-scope state survives data refresh" — which actually exercised selection and display mode — with a real per-scope-filter test. The filter test was added as specified. The original assertions were retained under an accurate name ("selection and display mode survive a refresh of the underlying member data") rather than deleted: they are genuine passing coverage of state that crosses a hook boundary, and removing them to satisfy a naming complaint would have cost real protection. Only the misleading label is gone.
35. **The fake backend still ignores `.eq` / `.select` / `.order`, and this remains an unresolved advisory for final review.** `harness/backend.ts` accepts PostgREST filters and returns the whole table, on the reasoning recorded in §9.3 deviation 1 that a fixture is a single campaign. That reasoning holds for `.eq("campaign_id", …)` but not in general: a `select` narrowed to the wrong columns, or an `.order` clause dropped or reversed, would not be caught by any test in this suite, and `["campaign-ous", cid]`'s `.order("display_order").order("name")` (§5, `WC:526–538`) is exactly such a clause. Fix round 1 deliberately did **not** broaden scope to address it — it is not a blocker for the decomposition, whose contract is that the same calls are made from a different module — but it is a genuine gap in the harness and is carried forward for the final reviewer to rule on rather than closed.

### 9.4 Operator approval

**Approved 2026-09-10.** The operator approved revision 4 as written. Stage 0 may begin against the unmodified component. Implementation remains bound to the stop conditions in §10, one local writer, one final commit, no product/schema behaviour change, and separate approval for every exact Git command.

### 9.5 Verification output (verifier pastes raw output)

**Stage 0 complete, 2026-09-10.** All baselines below were taken against the
**unmodified** `campaign-wall-chart.tsx` (2,635 lines, `pickRatingHintAnchor` and
`useFirstUseHint` present — checkout confirmed by file read, per §8). No
production file, existing test, helper, dependency, lockfile or migration was
touched. Extraction has not begun.

**(a) Component pinned.** `CampaignWallChart` at `campaign-wall-chart.tsx:215`,
signature `({ campaignId, canWrite }: { campaignId: string; canWrite: boolean })`.
File length 2,635 lines — matches §8's expected phase-1 component, so no
checkout drift.

**(b) jsdom probe — passed, no dependency added.** jsdom 29.1.1 resolves as a
Vitest transitive peer (`node_modules/.pnpm/jsdom@29.1.1`); it is not hoisted to
`node_modules/jsdom` and is **not** declared in `package.json`. A per-file
`// @vitest-environment jsdom` docblock, React 19 `createRoot` + `act` (from
`"react"`), and `dispatchEvent` all work against the default `environment:
"node"` config. §10.6 does not apply. Explicit `jsdom` was **not** added.

**(c) Files added — 13 new files**, reported by kind rather than as one total
(§9.3 deviation 16). All hand-written files are lint-clean.

*Test harness — 7 modules, 1,414 lines (`src/components/campaigns/wall-chart/__tests__/harness/`):*

| File | Lines |
|---|---|
| `fixture.ts` | 324 |
| `characterize.ts` | 306 |
| `mount.tsx` | 272 |
| `mocks.ts` | 161 |
| `backend.ts` | 150 |
| `locate.ts` | 120 |
| `query-client.ts` | 81 |

*Vitest specs — 3 files, 575 lines (`src/components/campaigns/wall-chart/__tests__/`):*

| File | Lines | Tests |
|---|---|---|
| `wall-chart.interaction.test.tsx` | 350 | 18 |
| `wall-chart.characterization.test.tsx` | 126 | 8 |
| `wall-chart.render-cost.test.tsx` | 99 | 1 |

*Generated snapshot — 1 file, 2,494 lines:*
`src/components/campaigns/wall-chart/__tests__/__snapshots__/wall-chart.characterization.test.tsx.snap`
(8 snapshots; written by vitest, committed as the frozen baseline).

*Playwright spec — 1 file, 493 lines:*
`tests/e2e/wall-chart-decomposition.spec.ts` (2 tests).

*Temporary, never staged:* `apps/organising-db/test-results/wp2.3-route-bytes.mjs`
(§6.1 tool; see §9.3 deviation 10). Playwright deletes it on every e2e run; it is
re-created afterwards and reproduces the frozen byte figures exactly.

**(d) Targeted suite green against the unmodified component.**

```
$ pnpm vitest run src/components/campaigns/wall-chart/__tests__/
Test Files  4 passed (4)
     Tests  52 passed (52)
```

8 characterisation snapshots frozen (2,494 lines; contract
`{regions, controls, cards, counts, anchors, a11y, queryKeys}` plus a skeleton
snapshot — no HTML dumps). 18 interaction tests (§9.3 deviation 9). No test was
skipped, quarantined, loosened, or had its fixture bent to pass; every failure
during authoring was a wrong expectation in the test, corrected against the
product, never a change to the product.

**(e) Frozen `queryKeys` baseline — 45 keys** in the `default` snapshot, stable
JSON with recursively sorted object keys, lexicographically sorted, disabled
queries included. Any enabled-but-unseeded query fails loudly
(`Unseeded query: <key>`), as does any unseeded table (`Unseeded table: <name>`)
or API route.

```
["assessment-dist-ous","1"]                         ["campaign-worker-ou","1",""]
["assessment-dist-ous","1","assignments",""]        ["campaign-worker-ou","1","10,11,12,13,20"]
["assessment-dist-ous","1","assignments","10,11,12,13,20"]  ["coverage-map","1"]
["campaign","1"]                                    ["employer-worksite-roles-current"]
["campaign-activities","1"]                         ["employers-active"]
["campaign-activities","1","assessment"]            ["hint-dismissals","test-user"]
["campaign-activity-ratings","1",""]                ["import-campaign-ous",1]
["campaign-activity-ratings-dist","1",""]           ["leader-links","campaign","1"]
["campaign-activity-ratings-dist","1","501"]        ["leader-links-existing-followers","1",0]
["campaign-assessment-ambition-targets","1",""]     ["member-role-types"]
["campaign-assessment-ambition-targets","1","501"]  ["occupation-aliases-all"]
["campaign-assessments-rated","1"]                  ["occupations-all"]
["campaign-data-fields","1"]                        ["rating-levels"]
["campaign-facts","1","all"]                        ["specialisations-all"]
["campaign-member-ids","1"]                         ["split-unit-members","none",""]
["campaign-members-full","1"]                       ["union-membership-types"]
["campaign-ous","1"]                                ["wallchart-activities-list","1"]
["campaign-ous-for-create-dialog","1"]              ["wallchart-latest-activity","1"]
["campaign-rating-summary","1"]                     ["wallchart-participation","1","any",null]
["campaign-worker-list-activity",1]                 ["wallchart-task-lists-list","1"]
                                                    ["woc-representation-by-unit","1"]
                                                    ["worker-import-assessments",1]
                                                    ["worker-list","1",null]
                                                    ["worker-lists","1"]
                                                    ["worksites-all"]
```

**(f) Full verification gates.**

```
$ pnpm test
Test Files  79 passed (79)
     Tests  1056 passed (1056)
exit 0

$ pnpm tsc --noEmit -p tsconfig.json
exit 0

$ pnpm lint
✖ 294 problems (143 errors, 151 warnings)      # standing reference, unchanged

$ pnpm eslint <all 12 Stage 0 files>
exit 0                                          # 0 problems

$ pnpm validate:migrations                      # from repo root
Validated 9 Supabase migrations with unique 14-digit versions.
```

The lint total is **exactly** the standing 294 = 143 + 151 reference, so Stage 0
added no lint problem. All Stage 0 files are clean with zero suppressions —
five `eslint-disable` directives written during authoring were reported as
unused and were removed rather than kept.

All five gates were re-run unchanged after the e2e correction round: `pnpm test`
79 files / 1056 tests passed with **no snapshot written or obsolete** (the
correction touched only the Playwright spec, which vitest does not run), the
targeted suite 4 files / 52 tests passed, `tsc` exit 0, `pnpm eslint` on the
corrected spec clean, and `pnpm lint` still exactly 294 (143 + 151).

**(g) §6.3 render-cost baseline** (jsdom full mount, large fixture 305
members / 161 units — see §9.3 deviation 5). Three runs **2336 / 1984 / 2133 ms,
median 2133 ms**, budget 6000 ms; re-measured during the correction round at
2318 / 2243 / 1992, **median 2243 ms**. Guarded by `tiles === 250` and `cards === 162`
(250 not 305: 55 tiles sit inside collapsed sub-unit cards, which is the
component's default state).

**(h) Build ×2 and route bytes.** Two `pnpm build` passes, `.next` **not**
deleted between them: pass 1 exit 0 / 347,100 ms, pass 2 exit 0 / 216,596 ms.
Manifest shape validated (`.next/app-build-manifest.json` absent — §9.3
deviation 8). 80 routes built, 42 mentioning "campaign"; the exact key is
**frozen as `/(dashboard)/campaigns/[id]`**.

```
key /(dashboard)/campaigns/[id] | fileCount 45 | totalBytes 4210300 = 4.02 MB | missing 0
   729440 static/chunks/3c878ccbe4787a9a.js
   341990 static/chunks/111e74cc7c0e641e.js
   337962 static/chunks/3054091f733b0f75.js
   272575 static/chunks/50ea21a6307a7dc7.js
   266010 static/chunks/bbe25c19abf4accf.js
   202351 static/chunks/22ba6f0d8fd6c946.js
   188770 static/chunks/62c077fb92426a76.js
   179638 static/chunks/04c744c78f71c4cd.js
```

**Noise floor: 0 bytes.** Build 1 and build 2 are byte-identical — same 45
files, same 4,210,300 total, same per-file sizes. Any byte change at Stage 10 is
therefore signal, not noise, and §10.4 applies to any increase.

**(i) Develop-preview e2e baseline — credentialled, direct route, network-quiet,
universe sync intercepted.** Against
`https://offshore-alliance-7fzwesren-reveille-strategy.vercel.app`, credentials
loaded with `source ~/.zshrc >/dev/null 2>&1` (never printed). Every run
contacted the **dev** Supabase project `dpnnmkhabysfdogllsyh` only; production
was never contacted.

*Superseded.* An earlier baseline navigated through `/my-campaigns` and clicked
`.first()`, so it measured the portfolio page rather than the route under test
(§9.3 deviation 17). Its figures — 127 requests, ceiling 140, 3,200 KB, 4,839 ms
— are **not** current evidence and must not be compared against.

**REST oracle** (read through the e2e user's own dev session with
`restClientFor` / `sessionFromStorageState(STORAGE_STATE)`; all three reads
HTTP 200), identical on every run:

```
[wp2.3] oracle {"units":4,"topLevel":4,"groupContainers":0,"expectedCards":4,
                "assignmentRows":95,"unassignedMembers":0,"expectedTiles":95}
```

Campaign 1 is 4 top-level `worksite` units with no nesting and no group
containers — `TEST · TestCo 2 — Alpha FPSO`, `— Bravo Platform`, `— Charlie FPU`
and `Dummy 1` — 95 members, 95 `campaign_worker_ou` rows, one per member, and 0
members without an assignment. So the card oracle is **exact, not ambiguous**:
with no parent/child relationships there are no nested cards whose visibility
depends on per-browser hierarchy state, and with 0 unassigned members the
"Unassigned workers" card does not render (`unassignedWorkerIds.length > 0`).
Expected tiles = 95 assignment rows + 0 unassigned = **95**; expected unit cards
= the **4** named units, asserted as an exact set of headings rather than a
count. Both matched on every run.

**Three baseline runs, all `2 passed`, no `afterAll` error:**

```
run 1  2 passed (39.5s)  {"requests":140,"routeLoadRequests":89,"navPrefetchRequests":28,
                          "thirdPartyRequests":23,"distinctRequests":104,"distinctRouteLoad":79,
                          "elapsedMs":9054,"unitCards":4,"tiles":95,
                          "syncRequested":1,"syncFulfilledLocally":1}
run 2  2 passed (33.4s)  {"requests":136,"routeLoadRequests":88,"navPrefetchRequests":28,
                          "thirdPartyRequests":20,"distinctRequests":103,"distinctRouteLoad":79,
                          "elapsedMs":6889,"unitCards":4,"tiles":95,
                          "syncRequested":1,"syncFulfilledLocally":1}
run 3  2 passed (32.7s)  {"requests":134,"routeLoadRequests":90,"navPrefetchRequests":28,
                          "thirdPartyRequests":16,"distinctRequests":103,"distinctRouteLoad":79,
                          "elapsedMs":7585,"unitCards":4,"tiles":95,
                          "syncRequested":1,"syncFulfilledLocally":1}

[workspace-mode] pinned mode="full" (was {})
```

**Medians: 89 route-load requests, 79 distinct, 7,585 ms to a network-quiet
usable chart.** `MAX_LOAD_REQUESTS` is **frozen at 96** — ~7% above the observed
maximum of 90 (§9.3 deviation 13 explains why the ceiling is on route-load
requests and not the 134–140 raw total). A confirmation run after freezing
passed at 89 route-load / 133 total (`2 passed (34.8s)`).

**Universe sync intercepted and never sent.** Every run reports
`syncRequested: 1, syncFulfilledLocally: 1` — the page asked once, the
interceptor answered once — and the server-header check found nothing on any
sync response, so no request reached the backend and no membership or OU row was
written. The second test asserts the same across its two page loads.

**Resource Timing (§6.2 metric) — byte-identical on all four runs:**

```
{"scriptEntries":50,"transferSize":1178865,"encodedBodySize":1165665,
 "ownChunkEntries":44,"ownTransferSize":1178865,"ownEncodedBodySize":1165665,
 "zeroTransfer":6}
```

**Frozen: 1,178,865 B transferSize / 1,165,665 B encodedBodySize over 50 script
entries**, of which 44 are the app's own `_next/static` chunks and account for
all of the measured bytes. Caveats: 6 entries report zero — the cross-origin
PostHog and vercel.live scripts, served without `Timing-Allow-Origin` — so the
totals are a floor for third-party weight; `transferSize` is 0 on a cache hit and
otherwise includes ~300 B of response headers per entry. The supplemental
response-body sum ranged 1.69–4.06 MB for the same page and is not the baseline
(§9.3 deviation 14).

**Frozen route-load list — 79 distinct entries.** 48 are
`_next/static/<build>/*` chunks, CSS and fonts. The other 31, which Stage 11
must not grow:

```
GET  <dev-supabase>/rest/v1/activity_ambitions        GET  <dev-supabase>/rest/v1/user_hint_dismissals
GET  <dev-supabase>/rest/v1/campaign_actions          GET  <dev-supabase>/rest/v1/user_profiles
GET  <dev-supabase>/rest/v1/campaign_activities       GET  <dev-supabase>/rest/v1/v_campaign_coverage_map
GET  <dev-supabase>/rest/v1/campaign_activity_ratings GET  <dev-supabase>/rest/v1/v_woc_unit_representation
GET  <dev-supabase>/rest/v1/campaign_comms_drafts     GET  <dev-supabase>/rest/v1/vw_campaign_worker_list_activity
GET  <dev-supabase>/rest/v1/campaign_leader_worker_links
GET  <dev-supabase>/rest/v1/campaign_organising_units POST <dev-supabase>/rest/v1/rpc/campaigns_i_can_write
GET  <dev-supabase>/rest/v1/campaign_task_lists       POST <dev-supabase>/rest/v1/rpc/get_workspace_defaults
GET  <dev-supabase>/rest/v1/campaign_universes
GET  <dev-supabase>/rest/v1/campaign_worker_membership   GET  <preview>/api/campaigns/1/data-fields
GET  <dev-supabase>/rest/v1/campaign_worker_ou           GET  <preview>/api/campaigns/1/facts
GET  <dev-supabase>/rest/v1/campaign_worker_rating_summary GET <preview>/api/campaigns/1/worker-lists
GET  <dev-supabase>/rest/v1/campaigns                    GET  <preview>/api/email/conversations/unread-count
GET  <dev-supabase>/rest/v1/phone_call_actions           POST <preview>/api/campaigns/1/sync-universe-workers  [intercepted]

GET  <preview>/campaigns/1        HEAD <preview>/campaigns/1
GET  <preview>/Eurekastd.png      GET  <preview>/eurekaflag.gif      GET  <preview>/heritage_Eureka.mp4
```

Excluded from the ceiling but measured: **28 nav prefetches** per run (identical
count every run — `/dashboard`, `/campaigns`, `/overview`, `/worksites`,
`/email/inbox`, `/upcoming-projects`, `/campaigns/1/sms/setup`, … — `next/link`
prefetching the shell) and **16–23 third-party requests** (PostHog, Sentry,
vercel.live).

Note what direct-route targeting removed from the old list: `campaign_organisers`,
`campaign_prospective_workers`, `rpc/campaign_last_activity` and
`/api/campaigns/1/role-check` were `/my-campaigns` requests, never the wall
chart's.

**Stage 1 gate: safe to begin.** No §10 stop condition is met.

**Stage 10 — extraction complete, all local gates green.** Working directory
`apps/organising-db` unless stated.

**Files.** Modified 1: `src/components/campaigns/campaign-wall-chart.tsx`,
**2,635 → 320 lines** (−87.9 %). Added 12 product modules and 1 test:

```
  93  wall-chart/wall-chart-model.ts
 250  wall-chart/hooks/use-wall-chart-shell-state.ts      (block A)
 239  wall-chart/hooks/use-wall-chart-core-data.ts        (block B)
 446  wall-chart/hooks/use-wall-chart-structure.ts        (block C)
 335  wall-chart/hooks/use-wall-chart-view-metrics.ts     (block D)
 229  wall-chart/hooks/use-wall-chart-actions.ts          (block F)
 177  wall-chart/wall-chart-tile.tsx                      (block E, hook-free)
 196  wall-chart/wall-chart-unassigned-card.tsx           (pipeline 1)
 805  wall-chart/wall-chart-unit-hierarchy.tsx            (pipelines 2, 3, 4)
 249  wall-chart/wall-chart-header.tsx
 269  wall-chart/wall-chart-dialogs.tsx
 230  wall-chart/__tests__/wall-chart-model.test.ts       (22 tests)
```

No pre-existing `wall-chart/*` module, harness file, Stage 0 spec, snapshot,
fixture or e2e helper was modified. `find src/components/campaigns/wall-chart
-newermt` after the extraction window lists only the files above; the four
Stage 0 test artefacts and seven harness modules still carry their Stage 0
mtimes (15:20–16:36 versus extraction 17:00+).

**Shell composition.** `Card → CardHeader → CardContent(tabIndex=-1,
onKeyDown=handleRootKeyDown) → WallChartHeader → overflow-anchor wrapper →
build-list flex wrapper → units container(ref) → { WallChartUnassignedCard,
both empty states, WallChartUnitHierarchy, RelationshipOverlay } →
BuildListPanel → WallChartAssessmentCharts → Print → WallChartDialogs`, with
the five hooks called A → B → C → D → F and the `tileContext` memo between D
and F. `export function CampaignWallChart({ campaignId, canWrite })` unchanged.

**Per-stage gates.** Every stage ran `pnpm tsc --noEmit -p tsconfig.json`
(exit 0), `pnpm eslint` on the touched files (exit 0) and
`pnpm vitest run src/components/campaigns/wall-chart` — **5 files / 74 tests
passed at every stage**, with no snapshot reported written, updated or
obsolete and `-u` never passed. Stages 1–7 and 9 were green first time; Stage 8
needed one plumbing correction (the hierarchy block is a statement sequence, so
its body could not be wrapped in a JSX fragment) before its gates passed.

**§3.3 structural checks — all pass.**

```
moved query keys in shell        rg → no matches (exit 1)
renderTile|applyFilters(|computeMetrics(  rg → no matches (exit 1)
JSX IIFEs (shell + 5 render files)        rg → no matches (exit 1)   [§9.3 dev 23]
applyFilters( counts             unassigned-card 1 | unit-hierarchy 3
tile adds no hook                rg → no matches (exit 1)
model is React-free              rg → no matches (exit 1)            [§9.3 dev 29]
dependency direction             rg 'from "(\.\.?/)*campaign-wall-chart"' → none [§9.3 dev 29]
public surface                   only workforce-board.tsx + the 4 test files
```

**Final local gates.**

```
pnpm tsc --noEmit -p tsconfig.json   exit 0, no diagnostics
pnpm test                            80 files / 1078 tests passed, 0 failed
pnpm eslint <12 touched files>       exit 0                          [§9.3 dev 28]
pnpm lint                            294 problems (143 errors, 151 warnings) = baseline
pnpm build                           exit 0 / 234,169 ms
pnpm validate:migrations (repo root) Validated 9 Supabase migrations with unique 14-digit versions.
```

`pnpm test` rose from the 1029/76 baseline to 1078/80 — the four Stage 0 files
plus the 22 model tests, no test removed or loosened.

**Route bytes, frozen key `/(dashboard)/campaigns/[id]`.** The temporary script
was re-created verbatim from the session record (Playwright had deleted it, §9.3
deviation 10) and deleted again after measuring.

```
before  fileCount 45 | totalBytes 4210300 = 4.02 MB | missing 0
after   fileCount 45 | totalBytes 4220297 = 4.02 MB | missing 0
delta   +9,997 bytes (+0.237 %), entirely in the wall chart's own chunk
        729440 static/chunks/3c878ccbe4787a9a.js  →  739437 static/chunks/27444293a5b6e055.js
        the other 44 files are byte-identical to Stage 0
```

Inside §6.1's +1 % cap, above its 0-byte noise floor — see §9.3 deviation 30.

**§6.3 render cost after (305 members / 161 units, guards `tiles=250`,
`cards=162`, budget 6000 ms).** Standalone run **2154 / 1956 / 1921,
median 1956 ms**; within the full suite, median 2028 ms. Stage 0 median was
2133 ms (2243 ms on the correction round; the independent verifier observed
2087 ms). **After ≤ before on every comparison.**

**Frozen tests unchanged.** The characterisation snapshot file is byte-for-byte
the Stage 0 artefact (45 query keys, 2,494 lines, mtime 15:33); the 8
characterisation, 18 interaction and 1 render-cost tests pass unmodified against
the decomposed component.

**Stage 10 correction round — redundant client boundaries removed (§9.3
deviation 32).** Scope was the ten new internal modules only; no behaviour,
test, snapshot or pre-existing file was touched.

*(a) Importer audit (read-only).* Every importer of each of the ten modules,
searched across the whole repository excluding `node_modules`, `.next` and
Markdown:

```
campaign-wall-chart.tsx  →  wall-chart-dialogs, wall-chart-header,
                            wall-chart-tile (type only), wall-chart-unassigned-card,
                            wall-chart-unit-hierarchy, and all five hooks
wall-chart-unit-hierarchy.tsx    →  wall-chart-tile (value) + 5 hook types
wall-chart-unassigned-card.tsx   →  wall-chart-tile (value) + 5 hook types
wall-chart-tile.tsx              →  3 hook types
wall-chart-header.tsx            →  4 hook types
wall-chart-dialogs.tsx           →  3 hook types
hooks/*                          →  each other's types only
src/app (pages, layouts, route handlers)  →  no matches
```

`campaign-wall-chart.tsx` itself is imported only by
`workforce-board.tsx` (which is `"use client"` in its own right) and by the four
Stage 0 test files. So all ten sit strictly below the shell's boundary, none is
an independently server-imported entry point, and no directive needed to be
kept. Ten directives removed; `campaign-wall-chart.tsx` keeps the only one, and
`wall-chart-model.ts` never had one.

*(b) Gates after removal — all green, nothing loosened.*

```
pnpm tsc --noEmit -p tsconfig.json         exit 0, no diagnostics
pnpm vitest run .../campaigns/wall-chart   5 files / 74 tests passed
                                           (8 characterisation, 18 interaction,
                                            1 render-cost, 22 model, 25 harness-backed)
                                           no snapshot written / updated / obsolete
pnpm test                                  80 files / 1078 tests passed, 0 failed
pnpm eslint <12 touched files>             exit 0
pnpm lint                                  294 problems (143 errors, 151 warnings) = baseline
pnpm build ×2                              exit 0 / exit 0
```

The characterisation snapshot still carries its Stage 0 mtime (15:33) and the
three Stage 0 spec files theirs (15:48) — no frozen artefact was rewritten.

*(c) Route bytes — unchanged by the correction, reproducible across two builds.*
Temporary script recreated verbatim, then deleted again.

```
Stage 0 (before decomposition)   fileCount 45 | totalBytes 4210300 | missing 0
Stage 10 first measurement       fileCount 45 | totalBytes 4220297 | missing 0
Stage 10 after directive removal fileCount 45 | totalBytes 4220297 | missing 0   (build 1)
                                 fileCount 45 | totalBytes 4220297 | missing 0   (build 2)
```

Build 1 and build 2 are byte-identical — same 45 files, same total, same
per-file sizes, same chunk hash `static/chunks/3c364e5fab8b3f8c.js` — so the
0-byte noise floor holds in the decomposed tree as it did at Stage 0. The wall
chart's chunk is **739,437 bytes before and after the removal**; only its
content hash moved (`2744429…` → `3c364e5…`). **The prior +9,997-byte figure is
therefore not superseded — it is confirmed, with the directives excluded as a
cause.** Net versus Stage 0: **+9,997 bytes, +0.237 %**, entirely in the wall
chart's own chunk, the other 44 files byte-identical.

*(d) §6.3 render cost after the correction.* Standalone **2165 / 1953 / 1982,
median 1982 ms**; within the targeted suite, median 1964 ms. Stage 0 median
2133 ms. **After ≤ before**, consistent with the pre-correction 1956 ms.

**Pre-review fix round 1 — test-only, under the operator-approved baseline
exception (§9.3 deviation 33).** Five blocking review findings, resolved in
§9.6. Production source was not touched: the only durable edits are four
harness/spec files, the characterisation snapshot and this document.

*Files changed*

```
harness/characterize.ts                  hint bubble located in the owner document; empty-state matcher
harness/locate.ts                        + cardTiles(), filterCheckbox(), openDialog()
harness/mount.tsx                        + MountedWallChart.setQueryData()
wall-chart.interaction.test.tsx          18 → 21 tests (findings 2, 3, 4, 5)
__snapshots__/…characterization…snap     2 values corrected (findings 1, 2)
```

*(a) Baseline proof.* `campaign-wall-chart.baseline.tsx` (2,635 lines, the
pre-refactor component at `03294d5`) was imported by all three component-level
specs while `-u` ran, then the imports were restored and the suite re-run
without `-u`:

```
B  vitest run …/wall-chart -u      (imports → .baseline)  5 files / 77 tests passed, Snapshots 2 updated
B  vitest run …/wall-chart         (imports → .baseline)  5 files / 77 tests passed, no snapshot written
C  vitest run …/wall-chart         (imports → real)       5 files / 77 tests passed, no snapshot written
```

**The corrected snapshots were produced by the pre-refactor component and pass
unchanged against the decomposed one on the first run** — the two outputs are
identical under the corrected characterisation, which is the property the
exception existed to test.

*(b) Snapshot sections changed — two lines, two sections, nothing else.*

```
hint-visible: rating hint not yet dismissed
- "wall_chart_rating@Lena Lane:hidden"
+ "wall_chart_rating@Lena Lane:visible dismiss=[Got it]"

no-units: campaign with no organising units
- "empty-state=none"
+ "empty-state=Add organising units to group workers into frames on the wall chart. Until then,
   members appear under unassigned above (if any). Use New unit above when you have access."
```

The other six sections — default, skeleton, read-only, build-list-open,
hidden-unit, count-mode — are byte-identical to Stage 0, as are all 45 frozen
query keys.

*(c) Baseline file deleted.* Removed with the file-delete tool (109,847 bytes);
absence confirmed by `Glob **/campaign-wall-chart.baseline*` → 0 files and by a
read that returned "File not found".

*(d) Gates after deletion.*

```
pnpm tsc --noEmit -p tsconfig.json   exit 0, no diagnostics
pnpm vitest run …/wall-chart         5 files / 77 tests passed, no snapshot written/updated/obsolete
pnpm test                            80 files / 1081 tests passed, 0 failed   (1078 → 1081)
pnpm eslint <6 touched test files>   exit 0
pnpm lint                            294 problems (143 errors, 151 warnings) = baseline
```

Bundle and render measurements were not re-run: production source is unchanged
in this round, so §9.5's route-byte and §6.3 figures stand. The render-cost
test did run as part of the targeted suite (medians 1931 ms on the baseline,
1852 ms on the decomposed component), both below the Stage 0 2,133 ms.

**Stage 11 readiness.** No §10 stop condition is met, and no test was weakened,
skipped or shaped to the extracted code — the two corrected values were derived
from the pre-refactor component. Stage 11 was not started: no git command was
run, so the branch, commit and preview do not exist yet and the branch-preview
e2e run remains outstanding. Two items are outstanding for the operator and
final reviewer: the +0.237 % route-byte increase of §9.3 deviation 30, which
sits inside §6.1's +1 % cap but above its 0-byte noise floor and cannot be
recovered by boundary hygiene; and the unresolved harness advisory of §9.3
deviation 35 (the fake backend ignores `.eq` / `.select` / `.order`).

- Stage 11: branch-preview e2e (required specs + new spec; full-suite summary with zero failures):
- `pnpm validate:migrations`: Stage 0 — `Validated 9 Supabase migrations with unique 14-digit versions.` (see (f) above)

### 9.6 Reviewer findings and resolution

**Pre-review fix round 1 — five blocking findings, all resolved (test-only).**

**1. The characterisation searched for the hint callout inside its own anchor,
so a visible hint was recorded as hidden.** `FirstUseHint` renders
`PopoverAnchor` in place, tagged `data-hint-anchor="wall_chart_rating"`, but
Radix **portals** `PopoverContent` to the end of `document.body`. The old
`el.querySelector("button, [role='dialog'])` could therefore only ever find the
anchored rating badge — a `span[role="button"]`, not a `button` — so it
returned nothing and the `hint-visible` case recorded
`wall_chart_rating@Lena Lane:hidden`. The one string a portal regression would
drop first, "Got it", was not characterised at all.

*Resolved.* `hintBubbleFor()` searches the anchor's **owner document body** for
`[role="status"][aria-live="polite"][data-state="open"]` — `FirstUseHint`'s own
content contract — and ties the bubble to the hint id by the copy the registry
declares and the component renders verbatim, so another popover's content
cannot be mistaken for it. The anchor is still tied to the exact worker through
`closest("[data-worker-id]")`, and `describeAnchor()` asserts that only one
anchor carries the id (otherwise it records `ambiguous(N anchors)`), because a
portalled bubble can only be attributed unambiguously in that case. The record
is now `wall_chart_rating@Lena Lane:visible dismiss=[Got it]`, so both the
visibility and the dismiss affordance are pinned.

**2. The empty-state matcher looked for copy that does not exist.** It tested
`/no organising units/i`, but the shell's two empty states begin "Add
organising units…" and "All organising units are hidden…". It matched neither,
so the no-units campaign characterised as `empty-state=none` and deleting the
paragraph outright would not have failed a single test.

*Resolved.* `EMPTY_STATE_COPY` anchors both real strings
(`/^Add organising units to group workers into frames on the wall chart\./`,
`/^All organising units are hidden for this browser\./`) and the full paragraph
text is recorded in the snapshot. A named behavioural assertion was added too
("the no-units campaign explains how to add one"), which asserts the exact
sentence and that the only remaining card is Unassigned — so the copy is pinned
by a behaviour, not only by a snapshot line.

**3. No test read the drag payload.** The suite asserted the mutation
variables that follow a drop but never the `DataTransfer` contents, so the
serialised contract between the tile that starts a drag and the card that
receives it — which the decomposition moved across a module boundary — was
unprotected.

*Resolved.* "the drag writes a version-1 payload for the dragged worker under
the product MIME type" pins `DND_MIME_TYPE`'s literal value
(`application/x-oa-wallchart-worker`, so a change to the wire format fails even
though the constant is imported), asserts the type is present on the transfer,
parses the payload and asserts `{ version: 1, refs: [{ workerId: 101,
fromOuId: 10, fromOuType: "employer" }] }`, and keeps both the mutate variables
and the `{ onSuccess, onError }` options assertion in the same test.

**4. The right-click case proved only that *a* dialog opened.** It asserted
`openDialogTitles().length === 1`, which would still pass if the wrong worker's
tile fed the dialog.

*Resolved.* The test now asserts the title list exactly (`["Move worker"]`) and
that the dialog's own description names the subject — "Move Ada Adams to
another organising unit." — plus "Showing Employer units only", which is
derived from Ada's source unit type, and that no other worker's name appears.
The dialog's identity is now tied to the tile that was right-clicked.

**5. "per-scope state survives data refresh" tested neither per-scope state nor
a refresh of the data it is keyed to.** It exercised selection and display
mode against a `campaign-members-full` refetch. Per-scope filter state is keyed
by `ou_id` and held above the cards, so a refresh of the *units* query is the
event that could drop it, and nothing covered that.

*Resolved.* "a unit's own filter still filters that unit after the units data
is refreshed" drives the real control — click Port Alpha's `Filter`, tick
`Unrated` in the portalled popover — and proves the visible effect: 6 tiles
(`105, 106, 107, 109, 110, 111`) become 4 (`106, 109, 110, 111`), the button
reads `Filter (1)`, and the Unassigned card is untouched. It then republishes
the units query with `queryClient.setQueryData(["campaign-ous", "1"], …)`
inside `act` (via the new `MountedWallChart.setQueryData` harness method),
renaming ou 12 so the refresh is *observable* and cannot be mistaken for a
no-op re-render. After it, `Acme South Renamed` is in the unit titles while
Port Alpha still shows exactly the four filtered tiles and `Filter (1)`. The
original selection/display-mode assertions were kept under an accurate name
rather than deleted — see §9.3 deviation 34.

**Carried forward, unresolved — advisory for final review.** The fake backend
accepts `.eq` / `.select` / `.order` and returns whole tables (§9.3 deviations 1
and 35). No test in this suite would catch a narrowed `select` or a dropped or
reversed `.order`, and `["campaign-ous", cid]` carries exactly such a clause.
Fix round 1 did not broaden scope to address it; the final reviewer should rule
on whether it must be closed before merge.

_Final review: pending._

---

## 10. Stop conditions (implementer stops and reports; no workaround)

1. Any characterisation, skeleton, or `queryKeys` snapshot, or any interaction assertion, needs changing after Stage 0 to pass.
2. Any test must be skipped, quarantined, loosened, or its fixture changed to pass.
3. `tests/e2e/wall-chart.spec.ts` or `tests/e2e/organiser-campaign.spec.ts` fails on the branch preview, or either file or `tests/e2e/helpers/*` "needs" an edit.
4. Bundle (§6.1/§6.2) or render evidence (§6.2/§6.3) is worse than baseline beyond the recorded noise floor and undoing the responsible extraction does not fix it.
5. The request census on the branch preview exceeds the develop baseline.
6. Any dependency would have to be added or changed — including explicit `jsdom` — before an operator-approved plan amendment.
7. Preserving behaviour would require editing a file outside §3.2 or any existing `wall-chart/*` module beyond an import/export-only adjustment, or changing an export used outside the wall chart.
8. Any change to a query key, `select` string, invalidation, localStorage key, URL parameter, DnD MIME/payload, or a11y string is found necessary.
9. The local `.env.local` would be needed, or any tool proposes contacting production Supabase.
10. An appendix A or HANDOFF claim turns out to be wrong in a way that changes the boundaries in §3 (none found at planning time).
11. Stage 0 cannot mount the full tree in jsdom against the unmodified component within one working session.
12. A block cannot be moved verbatim and contiguously (the code would have to be rewritten, consolidated, or its hooks/effects re-ordered to compile or behave identically), or a hook would need a value produced by a later block, or product semantics (e.g. `mutate` vs `mutateAsync`, silent cross-type block) would have to change to satisfy a test.
13. Any git command would be needed before the operator has agreed to that exact command.
