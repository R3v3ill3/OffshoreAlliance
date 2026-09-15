# WP2.6 — List view on shared state

Status: **Revision 1 (2026-09-15) — plan written, not approved. Implementation not started.**
Written against `main` at `7e8a3fab`, which carries WP2.4 merged (`5a16de07`, PR #46; `PROGRESS.md:45`). Depends on
WP2.4 (merged, no migration, inert until the per-user `groups_v2` flag is ticked), which in turn depends on WP2.1
(production 2026-09-14) and WP2.2 (production 2026-09-15). **No migration** (§3.12), so the promotion gate of
`PROGRESS.md:18` does not bind this package; the merge deploys code whose new path is behind `groups_v2`, default off.

Branch (proposed): `feat/oux-wp2.6-list-view` off `main`. Draft PR into `main`.

Runs in parallel with **WP2.5** (Compare) and **WP2.7** (Groups and units editor). §3.19 restates and extends the file
boundaries of `wp/wp2.4.md` §3.18 (`:806–820`) so the three branches do not collide; two boundary amendments are
requested in §9.1 (GS, SL).

This document follows `wp/README.md`: specification → plan → approval → deviations → verification → review. §0 is
placed first, as in `wp/wp2.2.md` and `wp/wp2.4.md`, because it states what the package needs from the databases:
nothing.

### Decision labels used in this document (each label is unique; none is reused from another plan)

| Label | Topic | Section |
|---|---|---|
| **GS-a / GS-b / GS-c** | How the List gets the same Group selection as the chart (import WP2.4's hook, duplicate it, or lift it) | §3.4 |
| **SL-a / SL-b / SL-c** | How selection survives a layout switch | §3.9 |
| **LY-a / LY-b** | Where the layout preference lives and whether it is flag-gated | §3.3 |
| **CL-a / CL-b** | The "Last contact" column of plan §5.7 | §3.7 |
| **OG-a / OG-b** | The "optional column per other group" | §3.7 |
| **BT-a / BT-b** | What the v2 bulk toolbar carries (Add to list deferred, or lifted now) | §3.8 |
| **HL-a / HL-b** | Hidden units and "Show empty units" in a list | §3.6 |
| **RS-a / RS-b** | Use of the realistic data set for this package | §3.20 |
| **AC-a / AC-b** | How the acceptance criteria are proven (Playwright run, or operator by hand) | §4.5 |

---

## 0. Where the schema has to be, and when (nothing to do)

Every database object this package reads or calls already exists on **production** and on **normal dev**; no new
object is added and no existing one is changed:

| Object | Where defined | Production | Normal dev |
|---|---|---|---|
| `campaign_groups`, RLS `campaign_groups_select … USING (true)` for `authenticated` | `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql:400–480` (policy `:460–463`) | 2026-09-13 | 2026-09-14 |
| `campaign_organising_units.group_id`, `campaign_worker_ou.group_id` (trigger-derived) | same file `:505`, `:513`, `:722–743` | 2026-09-13 | 2026-09-14 |
| `user_campaign_prefs(user_id, campaign_id, prefs jsonb, updated_at)`, owner-only RLS `ucp_*` | same file `:781–831`; generated type `packages/db-types/generated.ts:19018–19036` | 2026-09-13 | 2026-09-14 |
| `structure_placements_move(… p_within_group_id …)` / `_unassign` | `supabase/migrations/20260914090000_wp2_2_structure_api.sql:2630–2705`, `:2862–2916`; wrapper `src/lib/campaign/structure-api.ts:619–645` | 2026-09-15 (2.2a) | 2026-09-14 |
| `campaign_worker_ou_one_unit_per_group` unique index; `campaign_group_membership` view | `supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:92–95`, `:156–173` | 2026-09-15 (2.2b) | 2026-09-14 |

Consequences: no `supabase` CLI command, no connector call, no run sheet, no `gen:types`, no migration file, no
`packages/db-types/generated.ts` change. `wp/wp2.4.md` §0 (`:35–53`) established the same position for the chart and
nothing has changed since. **Migration expected: no** (§3.12 states it once more, as the PR body must).

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 Specification (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:152`)

> **WP2.6 List view on shared state.** Standard implementer. Plan 5.7. Acceptance: switching layouts preserves group,
> filter and selection; bulk Move to unit works within the selected group; default on touch devices. Depends on WP2.4.

### 1.2 Plan §5.7 verbatim (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:315–317`)

> ### 5.7 The list view
>
> Same toolbar and state as the chart. Columns: Name, Unit (in the selected group), Rating, Role, Phone, Email, Last
> contact, and an optional column per other group. "Group by unit" is the default grouping; "Not in any group" and each
> group's "Unassigned" are rows like any other. Bulk toolbar: Set rating, Move to unit (in the selected group), Add to
> list, Link to leader. This is the default layout on touch devices.

Supporting lines the design reads as binding:

- `:312` **State** — "Group, compare, colour-by, layout and filter are stored per user per campaign on the server;
  hidden units and %/# move there too. Nothing view-related is lost when switching to List, because both layouts read
  the same state." The word **layout** is the WP2.6 key reserved by WP2.4 (`wp/wp2.4.md:629`).
- `:291` **Unassigned** — derived, never stored; filterable and bulk-actionable; cannot be renamed, rated or deleted.
- `:292` **Not in any group** — members Unassigned in every group; a view from the group selector.
- `:305` **Group selector** — groups in display order plus "Not in any group"; single-select; `?group=` in the URL;
  the last choice remembered per campaign server-side.
- `:352` (§5.11) — "Default to the List layout on touch devices (the device detection already exists)". Already true
  since WP0.3 (`src/lib/campaign/workforce-view.ts:13–15`); WP2.6 must not regress it.
- `:179` research row 13 — bulk actions need selection, a contextual action bar, a count and Select all.

### 1.3 Binding rules inherited from the programme prompts

1. `PHASE2_MAIN_ORCHESTRATION_PROMPT.md:46` — `groups_v2` exists (WP2.4) and `campaign_group_membership` may be
   consumed; `:121` — WP2.5, WP2.6 and WP2.7 run in parallel **where files are disjoint** (§3.19).
2. `:43` — branch off `main`, draft PR into `main`, every push and the PR command put to the operator first; never
   rebase, amend or force-push; no worktrees; never commit `supabase/.temp/*`.
3. `:44` — the promotion gate binds only packages with a migration; §3.12 records that this one has none.
4. `:59` / `PROGRESS.md:19` — if the package wants the realistic data set, the plan says so and proposes the least
   invasive use (§3.20, RS-a: not needed).
5. `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:33–36` — nothing is removed from the product, full mode keeps working, the
   flag defaults off, **no view state in localStorage**, Unassigned is never materialised, no new creation path, no
   test skipped or quarantined.
6. `PROGRESS.md:17` — branch policy as amended 2026-09-15 (small follow-up fixes may go straight to `main`; a work
   package does not). `PROGRESS.md:21` — no `pnpm dev`/`pnpm start`, no screenshots, `.env.local` points at
   production and is never read. `wp/wp2.2.md` D80/D81 (`:938–939`) — this sandbox cannot host Playwright; the e2e
   spec is written and type-checked, not run (§4.5).
7. Reviewer checklist item 5 (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:88`) — every user-facing string uses Who's in,
   Group, Unit, Unassigned, Not in any group, Standalone, Strategic plan, Colour by.

### 1.4 Binding handoffs from WP2.4

- `wp/wp2.4.md` §1.5 (`:142–144`) — "**List view on shared state** (plan `:315`) — WP2.6. `workforce-list-view.tsx`
  and `workforce-bulk-toolbar.tsx` are not touched; the prefs hook and the pure derivations are exported from `lib/`
  so WP2.6 can consume them without importing from the chart."
- `wp/wp2.4.md` §3.18 (`:812`) — "**WP2.6** List | Owns: `workforce/workforce-list-view.tsx`,
  `workforce-bulk-toolbar.tsx`, `lib/campaign/workforce-view.ts`, the `ViewToggle` in `workforce-board.tsx`, prefs key
  `layout` | Consumes: `useUserCampaignPrefs`, `resolveGroupSelection`, `deriveGroupView`, `notInAnyGroup`, the
  serialised filter — all from `lib/`, never from `components/campaigns/wall-chart`."
  §3.19 below asks for two bounded amendments (GS, SL) and states why.
- `wp/wp2.4.md` §3.11 (`:629`) — the prefs document reserves `layout` for WP2.6 inside the `wallChart` key;
  `mergeWallChartPrefs` already carries unknown keys verbatim (`src/lib/campaign/groups/wall-chart-prefs.ts:302–315`).
- `wp/wp2.4.md` §3.1 principle 2 (`:378–382`) — the legacy path renders byte-for-byte; WP2.6 mirrors it for the list
  (§3.2 principle 2).
- `wp/wp2.4.md` §3.14 (`:685–730`) — sync-on-open (SY-c) and its notice live in `WorkforceBoard` above **either**
  layout (`src/components/campaigns/workforce/workforce-board.tsx:76–101`, `:123`). WP2.6 does not touch them.
- `wp/wp2.4.md` §9.1 (`:1175–1184`) — the operator's answers this package inherits: **FL-b** (per-user flag),
  **PR-a** (one `wallChart` document, no migration), **CP-a** (no copy anywhere in the v2 path), **HU-a** (hidden
  units are a per-user server-side set), **MN-a**, **CA-a**, **RD-a**, **E2-b** (the operator accepts by hand on the
  branch preview from a checklist; the orchestrator records the result). §4.5 proposes AC-b by the same reasoning.
- `wp/wp2.2.md` D45 (`:881`) and D56 (`:898`) — `ou_group_id` is **container membership only**; the settings grid
  shows non-container units only. Both are facts about the legacy container model that the v2 list stops reading
  (§2.3, §3.5).
- `wp/wp2.2.md` D46 — bulk and automatic placement paths use `p_on_conflict: "skip"` and report the skipped count
  (`src/lib/campaign/use-allocate-workers-to-ou.ts:23–37`, `:55`); the legacy toolbar's toast names it
  (`workforce/allocate-toast-message.ts:12–23`). §3.8 states what replaces it under the flag and what it means.

### 1.5 Not in WP2.6 (recorded so it is not folded in silently)

- **Compare** — WP2.5. The list renders one group; if the user has a `compare` selection stored, the list ignores it
  and leaves the key untouched (`mergeWallChartPrefs` carries it).
- **The groups and units editor**, Rename / Set estimate / Split / Merge / Delete from the list — WP2.7. The v2 list
  has no unit-editing affordance; a unit section header is not a menu.
- **Retiring `is_group_container` / `ou_group_id`, deleting the legacy list, removing the flag** — WP2.8. Under
  `groups_v2` off every legacy file renders byte-for-byte as today.
- **Touch drag, Move to unit in the worker sheet, the segmented group selector on small screens** — WP4.1.
- **"Last contact" as a campaign data field (last conversation, next contact, commitment, sentiment)** — WP4.2
  (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:184`). §3.7 CL records what exists today and why the column is deferred.
- **"Add to list" on the bulk toolbar** — the build-list panel is mounted inside the chart shell and its drawer-over-
  either-layout form is plan `:313`, not `:317`; §3.8 BT-a defers it with a named vehicle.
- **Undo toasts for bulk changes** — no precedent in the app; `wp/wp2.4.md` §1.5 (`:154–156`) already records this for
  the orchestrator to schedule. Toasts without undo are kept as today.
- Any change to an RPC, a migration, `packages/db-types/generated.ts`, a reporting view, the sync route, the
  sync-on-open notice, or any writer outside `placements.move` / `placements.unassign`.

---

## 2. Current-state map

### 2.1 The board and the layout switch

`src/components/campaigns/workforce/workforce-board.tsx` (191 lines) is the only mount point of both layouts:

- `resolveWorkforceView(searchParams.get("view"), isMobile)` (`:49–52`) over the pure
  `src/lib/campaign/workforce-view.ts:18–25` — `?view=list` / `?view=wall-chart` wins, anything else falls back to
  `pickDefaultWorkforceView(isTouch)` (`:13–15`), which is **list on touch**. Tests:
  `src/lib/campaign/__tests__/workforce-view.test.ts` (7 cases, including "an unrecognised value means no
  preference", because the Activists section reuses `?view=`).
- `setView` (`:56–66`) always writes the param (`params.set("view", next)`) through `router.replace(…, { scroll:
  false })`; the comment at `:59–60` records why dropping it for the default would send a phone user back to the list.
  **Nothing is persisted.**
- `useGroupsV2()` (`:54`, `src/lib/flags/groups-v2.ts:17–23`) chooses the chart shell only (`:126–129`); the List
  branch (`:124–125`) is flag-independent today.
- Sync-on-open (SY-c) and its notice (`:76–101`, `:123`) sit above either layout and are WP2.4's; `isFetchedAfterMount`
  (`:96`) and `syncChangedSomething` gate them.
- `ViewToggle` / `ToggleButton` (`:142–191`) — two `aria-pressed` buttons, "Wall chart" and "List".

Consequence recorded in appendix A §4 (`appendix-A-wallchart.md:282`): switching to the List view **unmounts** the
chart, so its filters, assessment view, overrides, badges and selection are lost; hidden units, %/# and overlay
survived per browser only. WP2.4 moved the chart's half of that state to the server
(`src/lib/hooks/useUserCampaignPrefs.ts:86–217`); WP2.6 moves the list onto the same document.

### 2.2 The list view's own state (all React state, all lost on unmount)

`src/components/campaigns/workforce/workforce-list-view.tsx` (1,071 lines), `:151–172`:

| State | Declared | What it drives |
|---|---|---|
| `filter: FilterState` | `:160` (type `:68–79`, default `:84–95`) | its own ten dimensions (§2.3) |
| `selection: ReadonlySet<string>` keyed by **`membership_id`** | `:161`, toggles `:476–496`, mapped to worker ids at `:467–473` | row ticks, the bulk toolbar |
| `assessment: AssessmentSelection` | `:162`, control `:652–656` | the "Selected assessment" column `:568–581`, the rating filter `:412–417`, the ratings query `:219–246` |
| `groupedView: boolean` | `:163`, toggle `:677–689` ("Group by employer") | the hand-rolled grouped table `:699–805` vs `DataTable` `:807–826` |
| `collapsedGroups: Set<string>` | `:164`, toggle `:639–646` | section collapse |

Queries (`:173–246`) use **the same keys and fetchers as the chart**: `["campaign-members-full", campaignId]`
(`:173–178` → `fetchCampaignMembersFull`, `wall-chart/normalize-members.ts:124–137`),
`["campaign-rating-summary", campaignId]` (`:182–192`), `["campaign-ous", campaignId]` (`:194–206`, `select("*")` so
`group_id` already arrives), `["campaign-worker-ou", campaignId, ouIdsKey]` (`:209–217` → `fetchOuAssignments`,
`normalize-members.ts:139–153`) and `["campaign-activity-ratings", campaignId, activityIdsKey]` (`:222–246`). The v2
chart issues the identical keys (`wall-chart/v2/use-wall-chart-group-view.ts:108`,
`wall-chart/hooks/use-wall-chart-core-data.ts:65`, `:72`, `wall-chart/v2/use-wall-chart-groups.ts:64–76`), so the two
layouts already share one React Query cache (appendix A `:138`). Data fields and facts come from
`useCampaignDataFields` / `useCampaignFacts` (`:165–171`).

### 2.3 How the list's filter differs from the chart's

| Dimension | List (`workforce-list-view.tsx`) | Chart (`wall-chart/filters.ts`) |
|---|---|---|
| ratings | `:69`, buckets `:97–104`, applied `:412–417` | `filters.ts:74`, same six buckets |
| roles | `:70`, `workerRoleKeys` `:121–131` | `filters.ts:72`, `roleKey` (identical rules) |
| membership + non-member | `:71–72`, `:422–427` | `filters.ts:69–70` |
| occupations | `:73`, `:428–431` | `filters.ts:75` |
| fact filters | `:78`, `:452–461` | `filters.ts:82` |
| **units** (`ouIds`) | `:75`, `:440–442` | — (appendix A `:308`) |
| **group containers** (`ouGroupIds`) | `:74`, `:443–451` — reads `unit.ou_group_id` | — |
| **employer / worksite** | `:76–77`, `:432–439` | — |
| phone / email presence | — | `filters.ts:77`, `:79` |
| per-assessment rating filters | — | `filters.ts:81` |
| "in unit of another group" | — | `filters.ts:90` (WP2.4) |
| participation source | — | `filters.ts:98` (WP2.4) |
| sort | `DataTable`'s own header sort (`data-table.tsx:99–110`) | `filters.ts:68` + `applySort` `:333` |

So the two states are not the same shape, and the four list-only dimensions (unit, group container, employer,
worksite) are exactly the ones the group model replaces: Employer and Worksite are **Groups** after WP2.1 (decision 5,
`DECISIONS.md:40`), and "in unit of another group" (`filters.ts:90`) expresses the cross-group case
(`wp/wp2.4.md` §3.10, `:590–596`). §3.6 states what happens to each.

### 2.4 The three `ou_group_id` readers WP2.2 D45/D56 named, still live in this file

| Line | Code | What it means today |
|---|---|---|
| `:285–293` (`:288`) | `groupNameByOuId`: `if (o.ou_group_id == null) continue; const group = ouById.get(o.ou_group_id)` | the **Group** column `:531–535` shows the *container's* name, i.e. legacy container membership (D45 `wp/wp2.2.md:881`), not a `campaign_groups` row |
| `:443–451` (`:448`) | `unit?.ou_group_id != null && filter.ouGroupIds.has(unit.ou_group_id)` | the "Organising group" filter section `:951–969`, whose options come from `o.is_group_container` (`:387–393`) — the same container-only reading as D56 (`wp/wp2.2.md:898`) |
| `:601–637` (`:609`) | `groupedRows`: `containerOuId = primaryOu.ou_group_id ?? (primaryOu.is_group_container ? primaryOu.ou_id : null)`, bucket label `"Not in any group"` at `:617` | "Group by employer" buckets by container; its "Not in any group" is a **third** definition of Unassigned (appendix A `:341`, `:393`) — no container, not "no unit" and not "no unit in this group" |

All three are container-model readers; none of them reads `campaign_groups`, `campaign_organising_units.group_id` or
`campaign_group_membership`. Under `groups_v2` the v2 list reads the group model only (§3.5); with the flag off this
file is not edited and the three readers stay exactly as they are until WP2.8 retires the column.

### 2.5 The bulk toolbar and its `skipped` toast

`src/components/campaigns/workforce/workforce-bulk-toolbar.tsx` (343 lines), mounted at
`workforce-list-view.tsx:691–698` with `ous` and the list's `assessment`:

- Bar (`:44–87`): Clear (`:57–67`), "<n> workers selected" (`:68–70`), then two actions (`:71–84`). It returns `null`
  with an empty selection (`:53`).
- **Set rating** (`:89–233`): `useWallChartAssessmentOptions`, a `RatingPicker`, `useBatchSaveActivityRatings`, success
  toast `:141–143`.
- **Assign to unit** (`:235–343`): target list excludes containers (`:251–254`, `!o.is_group_container` — D56's rule),
  calls `useAllocateWorkersToOu` (`src/lib/campaign/use-allocate-workers-to-ou.ts:39–63`) → `placements.assign` with
  `source: "manual"`, `isPrimary` only for a single worker (`:51–54`) and **`onConflict: "skip"`** (`:55`, D46). The
  success toast is `allocateToastMessage(res, …)` (`workforce/allocate-toast-message.ts:12–23`): "Allocated 7 workers
  to Acme North." plus, when `skipped > 0`, "3 skipped: already in a unit of that group." The popover's own sentence
  (`:312–315`) says "Workers stay in any units they already belong to. Primary unit isn't changed by a bulk
  allocation."

That is **assign**, not move: a worker already holding a unit in the target's group is refused and counted. It is the
right rule for an "add" verb and the wrong one for plan §5.7's **Move to unit**, which must displace the worker's
current unit in the selected group. §3.8 keeps the legacy toolbar (and its toast) untouched for the flag-off path and
gives the v2 toolbar `placements.move` instead. `useAllocateWorkersToOu` keeps its other caller
(`campaign-units-section.tsx`), so it is not edited; its test
(`src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx`) stays green unchanged.

### 2.6 What WP2.4 left for this package to consume

| Module | Exports WP2.6 uses | Cited |
|---|---|---|
| `src/lib/hooks/useUserCampaignPrefs.ts` | `useUserCampaignPrefs(campaignId, known)` → `{ wallChart, isLoading, isLoaded, isError, setWallChart, flush }`; overlay-first writes, debounce `:54`, merge that keeps foreign keys | `:47–54`, `:86–124`, `:168–217` |
| `src/lib/campaign/groups/wall-chart-prefs.ts` | `WALL_CHART_PREFS_KEY` `:39`, shape `:108–120`, `parseWallChartPrefs` `:158–226`, `filterStateToPrefs` `:241–264`, `filterStateFromPrefs` `:271–293`, `mergeWallChartPrefs` `:302–315`, `KnownIds` `:129–135` | |
| `src/lib/campaign/groups/derive-group-view.ts` | `unitsOfGroup` `:82–87`, `sortUnits` `:71–73`, `groupOfUnit` `:90–93`, `unitsByWorker` `:102–112`, `deriveGroupView` `:124–158`, `notInAnyGroup` `:165–182` | |
| `src/lib/campaign/groups/resolve-group-selection.ts` | `resolveGroupSelection` `:79–101`, `orderGroups` `:41–48`, `parseGroupParam` / `groupParamValue` `:63–72`, `GroupSelection` `:12` | |
| `src/lib/campaign/groups/plan-drop.ts` | `planDrop` `:48–82`, `DropRef` / `DropPlan` `:22–34` | |
| `src/components/campaigns/wall-chart/filters.ts` | `WallChartFilterState` `:67–100`, `DEFAULT_FILTER_STATE` `:101–116`, `hasActiveFilter` `:134–149`, `activeFilterKeys` `:173–186`, `applyFilters` `:219–234` (incl. `unitsByWorkerAllGroups` `:233`), `applySort` `:333`, `factSortOpts` `:457` — explicitly "read by WP2.6, not edited" (`wp/wp2.4.md:817`) | |
| `src/components/campaigns/wall-chart/move-worker-mutation.ts` | `useMoveWorkersMutation` `:83–181`; `MoveWorkerVars.withinGroupId` `:33`; the unassign branch `:108–119`; one call per source `:132–156`; stamping + reverse sync `:158–168`; invalidations `:175–179` | |
| `src/components/campaigns/wall-chart/v2/*` (presentational, props-only) | `GroupSelector` `group-selector.tsx:27–65`, `FilterChips` + `clearFilterKey` / `chipLabel` `filter-chips.tsx:29`, `:56`, `:71–103`, `MoveToUnitDialog` + `MoveToUnitTarget` `move-to-unit-dialog.tsx:26`, `:36–57` | |
| `src/components/campaigns/wall-chart/v2/use-wall-chart-groups.ts` | `useWallChartGroups` `:43–190` (groups query `:80–92`, units query `:64–76`, resolution `:110–124`, first-render `?group=` write `:126–150`, setter `:152–172`), `CampaignGroupRow` `:18–23` — **GS decision, §3.4** | |
| `src/components/campaigns/wall-chart/wall-chart-filter-bar.tsx` | `WallChartFilterBar` `:96–107` (`compact`, `sortInPopover`, `extraSections`, no `onApplyToAll` → no "Apply to all units"), `useDerivedOptions` `:506–531` | |
| `src/components/campaigns/wall-chart/link-to-leader-dialog.tsx` | `LinkToLeaderDialog` `:44–50` (props-only, takes `followerWorkerIds`) | |
| `src/components/campaigns/campaign-worker-detail-provider.tsx` | `registerGroups(groups \| null)` `:54`, `:166–183` — already additive (WP2.4 D12), so the List can register the campaign's groups and get "Group › Unit" in the sheet | |

### 2.7 Test harness available

`src/components/campaigns/wall-chart/__tests__/harness/` mounts **any** component with `{ campaignId, canWrite }`
(`mount.tsx:29–46`), so `WorkforceBoard` and the list mount the same way as the chart; the WP2.4 board test already
does it (`workforce/__tests__/workforce-board.test.tsx:1–80`). `buildWallChartFixtureV2(size, opts)`
(`fixture.ts:404–431`) seeds `campaign_groups`, `group_id` on units and `user_campaign_prefs`
(`[{ prefs }]` when `opts.prefs` is given). The fake PostgREST records `from()` chains, `upsert` payloads and `rpc()`
calls; `setSearchParams` (`backend.ts:93–99`) sets the mocked `useSearchParams`, and `router.replace` is a spy that
does **not** update it (`mocks.ts:58–78`) — §4.3 adds one additive harness helper for that.

### 2.8 Where "layout", "list" and "group" are in the URL today

`?tab=workforce&sub=wall-chart` selects the board (`src/lib/campaign-tabs.ts:65`, legacy `?tab=wall` `:103`);
`?view=list|wall-chart` selects the layout (`workforce-board.tsx:49–52`); `?group=<id>|none` selects the Group and is
written by the chart's groups hook (`wall-chart/v2/use-wall-chart-groups.ts:126–172`); `?ou=<id>` focuses a unit. The
list reads none of them today.

---

## 3. Target design

### 3.1 What the package delivers, in one paragraph

Under `groups_v2`, the Workforce board's **List** layout becomes a second view of exactly the state the v2 wall chart
shows: the same Group selection (`?group=` + prefs), the same one Filter (with Sort and Participation inside it), the
same Colour by, and a selection that survives the layout switch in both directions. Rows are grouped by the units of
the selected Group, with "Unassigned in &lt;Group&gt;" last, or by nothing when the Group selector is on "Not in any
group". The bulk toolbar gains **Move to unit…**, which moves within the selected Group through
`placements.move` (and `toOuId: null` + `withinGroupId` for "Unassigned in &lt;Group&gt;"), keeps Set rating, and adds
Link to leader. The layout itself is remembered per user per campaign in the reserved `layout` key. With the flag off,
every file on the legacy list path renders byte-for-byte as today.

### 3.2 Principles

1. **One flag, two lists.** `WorkforceBoard` mounts `WorkforceListViewV2` when `groups_v2` is on and the existing
   `WorkforceListView` otherwise — the shape WP2.4 used for the chart (`wp/wp2.4.md` §3.1 principle 1). The board
   stays the only reader of the flag (§8.4 stop condition 5).
2. **Legacy path byte-for-byte.** `workforce-list-view.tsx` and `workforce-bulk-toolbar.tsx` are **not edited**. Their
   1,414 lines, the three `ou_group_id` readers of §2.4 and the D46 `skipped` toast are WP2.8's to delete with the
   flag. No legacy test changes.
3. **Leaf components are reused; compositions are not.** `GroupSelector`, `FilterChips`, `MoveToUnitDialog`,
   `WallChartFilterBar` (compact), `AssessmentSelector`, `LinkToLeaderDialog`, `RatingPicker`, `WorkerBadgeRow`,
   `CumulativeRatingDot`, `DataTable` and the rating pill are mounted by the v2 list with props it computes. The v2
   chart's shell and its hooks A′–F′ are not mounted by the list (they compute tile metrics, drag state and card
   layout the list has no use for); the one exception is the groups hook (§3.4, GS).
4. **One filter state, one Colour by, one Group.** Read from `user_campaign_prefs.prefs.wallChart`, written back
   through the same `setWallChart` the chart uses, so a change made in one layout is in force in the other.
5. **Derived, never stored.** Units of a Group, "Unassigned in &lt;Group&gt;" and "Not in any group" come from
   `deriveGroupView` / `notInAnyGroup`; no synthetic row, no negative id, no materialised Unassigned.
6. **No view state in localStorage.** The v2 list reads no `wallchart:*` key and adds none. (`DataTable` keeps its own
   pre-existing `organising-db:rows-per-page:<pathname>` key, `data-table.tsx:72–86`; it is not view state this
   package introduces and it is not touched — recorded in §8.2.)
7. **Writes only through the structure API**, and only through calls that already exist: `placements.move` (with and
   without `withinGroupId`). No RPC change, no new writer, no migration; the guard test
   (`src/lib/campaign/__tests__/no-direct-structure-writes.test.ts`) stays green.
8. **Pure first.** Row building, section bucketing, the group-scoped unit column, the other-group columns and the
   layout resolution are pure functions under `src/lib/campaign/` with vitest beside them.
9. **Terminology** per plan §3.6 in every new string: Group, Unit, Unassigned, Not in any group, Colour by, Wall chart
   / List.

### 3.3 Layout: `?view=` and the `layout` pref (LY)

- **LY-a (recommended).** `src/lib/campaign/workforce-view.ts` gains one pure function beside the two it has:
  `resolveWorkforceLayout({ viewParam, storedLayout, isTouch })` → `?view=` (valid values only) → stored `layout` →
  `pickDefaultWorkforceView(isTouch)`. `WorkforceBoard` uses it **only when `groups_v2` is on** (it needs the prefs
  document, which is a query the legacy path must not gain); with the flag off `resolveWorkforceView` is called
  exactly as today (`workforce-board.tsx:49–52`), so the legacy board issues no new query and behaves byte-for-byte.
  `setView` (`:56–66`) keeps writing `?view=` and, under the flag, also `setWallChart({ layout: next })` (immediate,
  not debounced). Touch default is unchanged and still proven by
  `src/lib/campaign/__tests__/workforce-view.test.ts` plus two new cases.
- **LY-b.** Persist the layout for everyone, flag or no flag. Rejected: it adds a `user_campaign_prefs` read to every
  legacy board mount for a preference the legacy list cannot honour consistently, and it breaks principle 2.

`layout` is stored inside the `wallChart` document (`wp/wp2.4.md:629` reserved it there), so
`wall-chart-prefs.ts` gains `layout: z.enum(["wall-chart", "list"])` in `wallChartPrefsShape` (`:108–120`) and three
lines in `parseWallChartPrefs` (`:214–223` pattern). WP2.5 adds `compare` to the same object; the two edits are one
line apart and conflict textually, never semantically (§8.2).

### 3.4 The Group selection, shared with the chart (GS)

The list needs: the `campaign_groups` rows, the resolved selection, the first-render `?group=` write, and a setter
that writes the URL + prefs + telemetry and clears the selection. WP2.4 built exactly that in
`wall-chart/v2/use-wall-chart-groups.ts:43–190`, keyed on the same two queries the list already issues.

- **GS-a — import WP2.4's hook (recommended).** `WorkforceListViewV2` calls `useWallChartGroups({ campaignId, env,
  prefsGroup, prefsSettled, setWallChart, clearSelection })` with `env = { supabase, router, pathname, searchParams }`
  (the parameter is structurally typed, `:52`). Zero duplication, one precedence chain, one `?group=` writer, and the
  `chosen`/`written` refinements (`:115–150`, fix-round-2 A6) are shared. Cost: the list imports one module from
  `components/campaigns/wall-chart/v2/`, which §3.18 of `wp/wp2.4.md` did not contemplate — hence the boundary
  amendment in §9.1. The hook is **not edited**; if WP2.5 changes its signature for Compare, stop condition 6 fires.
- **GS-b — duplicate it** as `src/lib/campaign/groups/use-group-selection.ts`. Keeps the letter of §3.18 at the cost of
  ~60 duplicated lines of subtle URL-writing logic that two packages would then have to keep in step; the reviewer
  would be right to ask why.
- **GS-c — lift it** into `lib/` now and have the v2 shell import it from there. Cleanest end state, but it edits and
  moves a file while WP2.5 is in flight on the same tree. WP2.8 can do it when it deletes the flag.

Under GS-a the list also reuses `GroupSelector` (`group-selector.tsx:27–65`) unchanged, so the control, its label, its
`aria-label` and the WP1.7 first-use hint anchor are literally the same control in both layouts. The hint id
`wall_chart_group_selector` is shown by whichever layout is mounted; its dismissal is per user (WP1.7), so it cannot
appear twice.

Telemetry: the setter already sends `trackWallchartGroupSelected({ control: "group_selector", … })` (`:156–162`). The
union is **not** extended for the list — the phase-0 baseline series stays continuous and the event carries
`group_count` and the group `kind`, which is what the metric needs.

### 3.5 The group model as the list renders it

Reads: exactly the five queries the list issues today (§2.2) plus `["campaign-groups", campaignId]` (through the
groups hook, shared cache with the chart) and `["user-campaign-prefs", campaignId]` (through
`useUserCampaignPrefs`). Two extra reads per list mount, both cached for 5 minutes
(`useUserCampaignPrefs.ts:111`), and **no** duplicate of anything the chart reads.

Derivations, all pure and all from `lib/` (§2.6):

```ts
const groupUnits   = unitsOfGroup(ous, groupId);                       // caller order = display_order, name
const view         = deriveGroupView(memberRows, ous, ouAssign, groupId);
const orphans      = notInAnyGroup(memberRows, ous, ouAssign);          // the "none" selection
const allGroupsIdx = unitsByWorker(ouAssign);                           // for "in unit of another group" + the other-group columns
```

Semantics, stated once so the §4.1 test can pin them: the **Unit** column shows `view.placementByWorker.get(workerId)`
— the worker's unit *in the selected Group* — or "Unassigned"; a worker never shows two units in that column (WP2.2b's
unique index guarantees one). A placement on a legacy container with `group_id NULL` counts for no Group, exactly as
in the chart (`derive-group-view.ts:14–18`, `:165–182`). With **zero groups** the selector offers only "Not in any
group", the whole membership renders as one flat section, and the empty-structure sentence of `wp/wp2.4.md` §3.3
(`:474–477`) is reused: "This campaign has no groups yet. Add units in Setup to start placing people."

`campaign_group_membership` is the **oracle**, not a render source (`wp/wp2.4.md:449–452`): the e2e spec and the §4.1
equivalence test define the truth by it; the list derives the same rows client-side from data it already holds.

### 3.6 Toolbar and filter, shared with the chart

One row above the table, left → right:

1. **Group** — `GroupSelector` (§3.4), groups in display order then "Not in any group".
2. **Colour by** — `AssessmentSelector` with `label="Colour by"` and `triggerAriaLabel="Colour by"` (both props exist,
   WP2.4 D11/D23), bound to `wallChart.colourBy` through the same resolution the chart uses
   (`wall-chart/v2/use-wall-chart-view-v2.ts:83–90`): a stored assessment id that no longer exists reads as
   cumulative.
3. **Filter (n)** — one `WallChartFilterBar` (`compact`, `sortInPopover`, `extraSections` carrying Participation and
   "In unit of another group"), the same component and the same `WallChartFilterState` as the chart, with
   `onApplyToAll` **not** passed so "Apply to all units" does not render (`wall-chart-filter-bar.tsx:96–107`).
   Active dimensions render as `FilterChips` with a remove × (`filter-chips.tsx:71–103`).
4. **Search** — a plain text input over the rendered rows (transient React state, not persisted, the same fields
   `DataTable`'s search covers today, `workforce-list-view.tsx:811–819`). In flat mode it is `DataTable`'s own box.
5. **Group by unit / Flat list** — a toggle; **Group by unit is the default** (plan `:317`). Persisted under the
   package's own `list` prefs key (§3.11).
6. **Show empty units** — the shared `wallChart.showEmptyUnits`; off hides unit sections with no visible row after
   filtering, and the toolbar says "N empty hidden", as on the chart.
7. **Columns ▾** — the other-group columns (§3.7, OG).

What happens to the list's four legacy-only dimensions (§2.3): **employer** and **worksite** become Groups under the
group model (decision 5, `DECISIONS.md:40`) — an organiser filters by employer by selecting the Employer Group, or by
ticking Employer units under "In unit of another group"; **unit** is the Group selection plus that same dimension;
**group container** is retired with `ou_group_id` (WP2.8). In exchange the list gains phone/email presence,
per-assessment rating filters, participation and "in unit of another group". This is the one visible reduction in the
package and it is listed in the PR body and in the operator checklist so the operator sees it before merge.

**Hidden units (HL).**

- **HL-a (recommended).** The list **ignores** `wallChart.hiddenOuIds` and honours `showEmptyUnits`. A list exists to
  act on everyone; hiding a unit in a list would silently remove its workers from the rows, from Select all and from
  every bulk action, which is a data-loss shaped affordance. The hidden set stays untouched in prefs and still applies
  to the chart, so nothing is lost by switching layouts. The v2 list has no Units manager.
- **HL-b.** Honour the hidden set in the list too. Consistent with "both layouts read the same state" read literally,
  but for the reason above it is the wrong behaviour for a table; if the reviewer prefers it, it is one `filter` call
  and a "N units hidden — show" line.

### 3.7 Columns (plan `:317`)

| Column | Source | Notes |
|---|---|---|
| **Worker** | `full_name` + `CumulativeRatingDot` + `WorkerBadgeRow` as today (`workforce-list-view.tsx:501–530`) | click opens the worker sheet through `useCampaignWorkerDetail()` |
| **Unit** (in the selected Group) | `view.placementByWorker` → `ouDisplayName` | "Unassigned" when absent; in the "Not in any group" view the column reads "—" |
| **Rating** | `colourBy` value: the selected assessment's rating, else cumulative | one column, headed "Colour by: &lt;title&gt;" or "Cumulative" |
| **Cumulative**, **Last activity** | `campaign_worker_rating_summary` as today (`:556–567`) | kept; they are cheap and organisers use them |
| **Role** | `union_role_name` (`:554`) | |
| **Phone**, **Email** | `worker.phone` / `worker.email` | new columns (plan `:317`); the badge row already shows presence, the columns show the value |
| **Occupation**, **Worksite**, **Employer**, **Membership** | as today (`:551–555`) | kept |
| **Last contact** | **CL decision below** | |
| one column per **other Group** | `unitsByWorker` + `unitsOfGroup(other)` | **OG decision below** |

**CL — "Last contact".**

- **CL-a (recommended): defer it to WP4.2** and record why. There is no campaign-scoped last-contact field on the
  member or worker rows the list loads (`normalize-members.ts:104–122`). The nearest real field is
  `worker_campaign_connections.last_contacted_at` (`app/api/campaigns/[id]/list-builder/route.ts:358–372`), and its
  SELECT policy requires a `campaign_timelines` row for the campaign or an `admin`/`coordinator` profile
  (`supabase/migrations/20260908050000_baseline_schema.sql:27867–27871`) — so for exactly the campaigns organiser mode
  targets (no strategic plan attached, plan §5.9) a `user`-role organiser would read **zero rows** and the column would
  be silently empty. Shipping a column that is blank for the people it is for is worse than not shipping it. The RLS
  finding goes to the ledger's incidental findings for WP2.8/WP3.3 to weigh.
- **CL-b.** Ship it from `worker_campaign_connections` behind a role check, or fix the policy. The policy fix is a
  migration, which drags the promotion gate into a package that otherwise has none. Not recommended here.

**OG — a column per other Group.**

- **OG-a (recommended).** Off by default, one checkbox per other Group in a **Columns ▾** popover, persisted in the
  package's `list` prefs key. Rationale: a campaign may have five or six Groups and the table is already 10 columns
  wide on a phone; plan `:317` itself says "optional". Each cell is the worker's unit in that Group, "—" when
  Unassigned there. No extra query: `unitsByWorker(ouAssign)` + `unitsOfGroup(ous, otherGroupId)` is enough.
- **OG-b.** Render every other Group's column by default. Simpler code, unusable table on a phone — and touch is this
  layout's default device.

### 3.8 Grouping, sections and bulk actions

**Sections** (default, plan `:317` "Group by unit is the default grouping"): one section per unit of the selected
Group in `display_order, name` order (`unitsOfGroup` keeps the query's order, `derive-group-view.ts:82–87`), then
**"Unassigned in &lt;Group&gt;"** last (plan `:291`). Each header carries the unit name, the visible/total count, a
roll-up rating dot and a **count button** that selects or deselects everyone in the section ("Select all in
&lt;Unit&gt;" / "Deselect all in &lt;Unit&gt;", `aria-pressed`) — the same affordance WP2.4 gave the card count
(`wp/wp2.4.md` D18). Sections collapse as today (`workforce-list-view.tsx:639–646`, `:707–730`); collapse state is
transient React state. In the **Not in any group** view there is one section titled "Not in any group". "Flat list"
renders `DataTable` with the same columns and no sections.

**Bulk toolbar** (`workforce-bulk-toolbar-v2.tsx`, new; the legacy one is untouched):

| Action | Implementation |
|---|---|
| count + Clear | as today (`workforce-bulk-toolbar.tsx:57–70`) |
| **Set rating** | the existing `SetRatingAction` logic, re-parented, defaulting to the shared `colourBy` |
| **Move to unit…** | `MoveToUnitDialog` (`move-to-unit-dialog.tsx:36–57`) with `targets = unitsOfGroup(ous, groupId)` and `group = selectedGroup` (so it offers "Unassigned in &lt;Group&gt;"); in the "Not in any group" view, every unit across Groups labelled "Group › Unit" with `group = null`. Submitting calls `planDrop({ refs, targetOuId, groupId, groupUnitIds, placementByWorker })` (`plan-drop.ts:48–82`) and hands the plan to `useMoveWorkersMutation` — `{ refs, toOuId, mode: "move" }`, or `{ refs, toOuId: null, mode: "move", withinGroupId }` for Unassigned. One `structure_placements_move` per source unit (`move-worker-mutation.ts:132–156`), the RPC displaces any other placement in the target's Group (C-b), employer/worksite stamping and the reverse sync run exactly as they do for a chart drag (`:158–168`), and the three invalidations fire on settle (`:175–179`). Failures toast through `structureErrorMessage`; a successful move clears the selection. |
| **Link to leader…** | `LinkToLeaderDialog` (`link-to-leader-dialog.tsx:44–50`) with the selected worker ids |
| ~~Assign to unit~~ | **not** in the v2 toolbar: "Move to unit" is plan `:317`'s verb, and `placements.assign` with `skip` (§2.5) cannot express it. The legacy toolbar keeps it for the flag-off path. |
| ~~Add to list~~ | **BT decision** |

**BT — "Add to list".**

- **BT-a (recommended).** Defer. The build-list panel is mounted inside the chart shell with a controller, drag
  handles and URL state (`wall-chart/build-list-panel.tsx:98–115`, `use-build-list.ts`), and plan `:313` ("the
  build-list panel becomes a right-hand drawer that works over either layout") is a §5.6 line, not §5.7. Lifting it to
  the board is a bounded follow-up (**WP2.6b**, or folded into WP4.1, which already owns the touch layer). Recorded
  here so it is not lost.
- **BT-b.** Lift `BuildListPanel` to `WorkforceBoard` now and give both layouts the drawer. It is the better end
  state; it roughly doubles the package's UI surface and touches a file WP2.4 owns.

### 3.9 Selection across a layout switch (SL)

The acceptance criterion is "switching layouts preserves group, filter and **selection**". Group and filter are
preserved by construction (URL + prefs, §3.3–§3.6). Selection is React state in both layouts and dies on unmount:
`workforce-list-view.tsx:161` (keyed by `membership_id`) and `wall-chart/use-wall-chart-selection.ts:45–88` (keyed by
`${ouId}:${workerId}`, shared with the legacy chart and therefore untouchable).

- **SL-a (recommended).** A **worker-id** selection store owned by the board:
  `workforce/workforce-selection-context.tsx` — `WorkforceSelectionProvider` (mounted by `WorkforceBoard` around both
  layouts, under the flag only) exposing `{ workerIds: ReadonlySet<number>, setWorkerIds, clear }`. The v2 list uses
  it as its selection state (rows key on `worker_id`, not `membership_id`). The v2 chart keeps
  `useWallChartSelection` and is bridged by a hook this package owns,
  `workforce/use-workforce-selection-bridge.ts`, called from `campaign-wall-chart-v2.tsx` with the selection and the
  group view's `placementByWorker`: on mount it seeds the chart's selection from the store
  (`addAll` of `{ ouId: placementByWorker.get(w) ?? null, workerId: w }`, dropping workers who are not on screen), and
  on every change it publishes `selection.workerIds()` back. That is **two lines** inside a WP2.4-owned file (one
  import, one call) — the boundary amendment requested in §9.1 — and no change at all to
  `use-wall-chart-selection.ts`, so the legacy chart is untouched.
- **SL-b.** Preserve the list's selection only (the store exists, the chart does not read or write it). List → chart →
  list keeps the ticks; chart → list does not. Cheaper, and fails half the criterion.
- **SL-c.** Persist the selection in prefs. Rejected: it is transient state, it can be hundreds of ids, plan `:312`
  does not list it, and a stale selection restored days later is a bulk-action hazard.

Under SL-a the selection also survives a Group change only in the chart's existing sense: the chart's setter clears it
(`use-wall-chart-groups.ts:169`), and the list's setter must do the same, because "the 12 workers I selected in
Worksite" means nothing in Shift. Clearing on a **Group** change and preserving across a **layout** change is exactly
what the two criteria ask for; §4.3 pins both.

### 3.10 The worker sheet and the Groups registration

The v2 list registers the campaign's groups with the worker-detail provider while it is mounted
(`registerGroups(groups)` on mount, `registerGroups(null)` on unmount — the API WP2.4 added at
`campaign-worker-detail-provider.tsx:54`, `:166–183`), so opening a worker from a List row shows the same
"Group › Unit" Units tab and the same group-aware "Add to another unit" dialog the chart gives. No provider edit.

### 3.11 Prefs: the keys this package owns

Inside `user_campaign_prefs.prefs.wallChart` (PR-a; no migration):

```ts
layout?: "wall-chart" | "list",     // §3.3, reserved by WP2.4 (wp2.4.md:629)
list?: {
  groupByUnit?: boolean,            // §3.8, default true
  otherGroupColumns?: number[],     // §3.7 OG-a, group ids, default []
}
```

Both are added to `wallChartPrefsShape` and `parseWallChartPrefs` in
`src/lib/campaign/groups/wall-chart-prefs.ts` (`:108–120`, `:158–226`) with the file's own lenient rules: a malformed
key is dropped on its own, and `otherGroupColumns` is filtered against the live group ids through a new
`KnownIds.groupIds` use (`:129–135` already declares `groupIds`; `parseWallChartPrefs` currently applies it to `group`
only, `:162–165`). Everything else in the document — `group`, `colourBy`, `filter`, `sort`, `sortFactFieldId`,
`participation`, `showEmptyUnits`, `displayMode`, `hiddenOuIds`, `overlay`, `badges`, and WP2.5's `compare` — is read
or carried, never re-shaped. `mergeWallChartPrefs` (`:302–315`) already guarantees foreign keys survive.

Writes go through the one `setWallChart` of `useUserCampaignPrefs` (`:187–200`): filter and sort changes debounced
(`opts.debounce`), everything else immediate, the overlay applied first so the table never waits on the round trip,
and `flush()` on unmount (`:208`) so a debounced filter change made in the List is written before the chart mounts.

### 3.12 Migration: none

Nothing in this package changes the schema, the RPCs or the generated types. `git diff --stat main -- supabase/
packages/db-types/` must be empty (§5). The promotion gate (`PROGRESS.md:18`), run sheets, `gen:types` and the
Supabase GitHub integration do not apply. The merge to `main` deploys code that is inert for every user without the
per-user `groups_v2` flag.

### 3.13 What stays legacy when the flag is off

| Surface | Flag off | Flag on |
|---|---|---|
| Board layout resolution | `resolveWorkforceView(param, isTouch)`, no prefs query (`workforce-board.tsx:49–52`) | `resolveWorkforceLayout` with the stored `layout` (§3.3) |
| List component | `WorkforceListView` (unedited) | `WorkforceListViewV2` |
| Bulk toolbar | `WorkforceBulkToolbar` with **Assign to unit** (`placements.assign`, `skip`, the D46 toast) | `WorkforceBulkToolbarV2` with **Move to unit…** (`placements.move`) |
| Group / Unit columns | container names via `ou_group_id` (§2.4) | `campaign_groups` + `group_id` |
| "Group by employer" | container buckets, third Unassigned definition (`:601–637`) | "Group by unit" over the selected Group |
| Filter | the list's own ten dimensions (§2.3) | the shared `WallChartFilterState` |
| Selection | membership-id set, lost on switch | worker-id store shared with the chart (SL-a) |
| Worker sheet | as today | "Group › Unit" (the provider registration, §3.10) |

Every legacy vitest suite and every legacy e2e spec must pass unchanged (§8.4 stop condition 2).

### 3.14 Telemetry

`trackWallchartGroupSelected` comes free with the shared setter (§3.4). `trackWallchartFilterApplied({ scope:
"campaign", keys, count })` is emitted by the list's filter setter exactly as the chart's does
(`wall-chart/v2/use-wall-chart-view-v2.ts`), so the phase-0 series continues without a union change. No new event
name, no new union member (§8.4 stop condition 7 if one seems necessary).

### 3.15 Accessibility and touch

The List is the default layout on touch (plan `:352`), so: every new control has a visible focus ring and an
accessible name; section headers are `<button>`s with `aria-expanded`; the count button carries `aria-pressed`; row
checkboxes have labels naming the worker; the bulk toolbar is `role="region"` with `aria-live="polite"` on the count;
touch targets on the checkbox, the count button and the rating control are ≥ 1 cm
(`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:80`); the table scrolls horizontally inside its own container so the page
never does; `DataTable`'s existing card view on mobile (`data-table.tsx:69`) is kept for flat mode.

### 3.16 Performance

The v2 list renders one Group's sections over the same member set the chart renders as tiles, from the same cached
queries, so the route-load request count rises by the two reads of §3.5 and nothing else. Budget and method: the
render-cost test of §4.4 runs the `large` fixture (305 members / 161 units, `harness/fixture.ts:1–15`) in two shapes —
as generated, and with every member Unassigned (decision 4, `DECISIONS.md:39`) — and reports its medians beside the
legacy list's from the same run; "not worse" is the standard, as in `wp/wp2.4.md` §4.4 (the absolute budget fails in
sandboxed runners). Sections are plain rows, not virtualised; if the all-Unassigned case exceeds the legacy number by
more than 10 %, stop (§8.4 stop condition 4) rather than adding virtualisation inside this package.

### 3.17 Copy (the exact strings)

- Toolbar: "Group", "Colour by", "Filter", "Search workers", "Group by unit" / "Flat list", "Show empty units",
  "Columns".
- Sections: "&lt;Unit name&gt;", "Unassigned in &lt;Group&gt;", "Not in any group", "Select all in &lt;Unit&gt;" /
  "Deselect all in &lt;Unit&gt;", "N empty hidden".
- Empty states: "This campaign has no groups yet. Add units in Setup to start placing people." (no Groups);
  "Everyone in this Group is placed in a Unit." (empty Unassigned section); "Everyone is in at least one Group."
  (empty Not in any group); "No workers match the filter." (everything filtered out).
- Bulk: "Move to unit…", "Set rating", "Link to leader…", "Clear", "&lt;n&gt; workers selected".
- Move dialog (reused): its own strings (`move-to-unit-dialog.tsx`).
- Success toast after a move: "Moved &lt;n&gt; workers to &lt;Unit&gt;." / "Removed &lt;n&gt; workers from
  &lt;Group&gt;." Failures: `structureErrorMessage` (`src/lib/campaign/structure-error-message.ts`).

### 3.18 Terminology check (reviewer item 5)

No new string says "Unallocated", "No unit", "group container", "organising group", "Assign to unit" or "Scope". The
Group column of the legacy list (the container name) has no counterpart under the flag; its function is the Group
selector.

### 3.19 File boundaries with WP2.5, WP2.7, WP2.8 (extends `wp/wp2.4.md` §3.18)

| Package | Owns (may edit) | Consumes (must not edit) |
|---|---|---|
| **WP2.6** (this) | `workforce/workforce-list-view-v2.tsx`, `workforce/workforce-bulk-toolbar-v2.tsx`, `workforce/workforce-selection-context.tsx`, `workforce/use-workforce-selection-bridge.ts`, `lib/campaign/workforce-list-model.ts`, `lib/campaign/workforce-view.ts`, `workforce-board.tsx` (layout resolution, the v2 list branch, the selection provider — **not** the sync query or the notice), the prefs keys `layout` and `list` in `lib/campaign/groups/wall-chart-prefs.ts`, **two lines** in `campaign-wall-chart-v2.tsx` (SL-a bridge), additive harness helpers, its own tests and e2e spec | `useUserCampaignPrefs`, `derive-group-view.ts`, `resolve-group-selection.ts`, `plan-drop.ts`, `filters.ts`, `move-worker-mutation.ts`, `structure-api.ts`, `wall-chart/v2/use-wall-chart-groups.ts` (GS-a), `group-selector.tsx`, `filter-chips.tsx`, `move-to-unit-dialog.tsx`, `wall-chart-filter-bar.tsx`, `link-to-leader-dialog.tsx`, `campaign-worker-detail-provider.tsx`, and **every** legacy file including `workforce-list-view.tsx` and `workforce-bulk-toolbar.tsx` |
| **WP2.5** Compare | `wall-chart/compare/**`, the toolbar's `compareSlot`, prefs key `compare`, the band's matrix mode | the same lib modules; must not change `useWallChartGroups`'s existing signature (add, never re-shape) |
| **WP2.7** Editor | `campaign-units-section.tsx`, `campaign-wizard.tsx`, `campaign-settings.tsx`, `step-campaign-units.tsx`, `create-organising-unit-dialog.tsx`, `lib/campaign/structure-save.ts`, new `setup/**` | `unitsOfGroup`; A3/A4/D72 |
| **WP2.8** | deletes the legacy chart **and the legacy list and bulk toolbar**, `ou_group_id` readers, the flag, R11 | everything above |

Files three packages could touch at once, and the rule: `lib/campaign/groups/wall-chart-prefs.ts` — WP2.5 adds
`compare`, WP2.6 adds `layout` and `list`; each adds its own key to `wallChartPrefsShape` and its own block in
`parseWallChartPrefs`; a textual conflict is resolved by keeping both. `campaign-wall-chart-v2.tsx` — WP2.5 mounts the
matrix, WP2.6 adds two lines at the top (SL-a); different regions. `workforce-board.tsx` — WP2.6 only (WP2.4 already
merged its sync work). The harness (`__tests__/harness/*`) — additive helpers only, never a change to an existing
signature. Whichever of WP2.5/WP2.6 merges second merges `main` into its branch and re-runs the full suite.

### 3.20 Realistic data (RS)

- **RS-a (recommended).** The realistic data set (`yqjkuobcawvigsfpgrcm`, `PROGRESS.md:19`) is **not** needed:
  correctness is proven by unit and jsdom tests against the `large` fixture (305 members / 161 units — the same shape
  as production campaign 57) and by the operator's hand test on the branch preview against normal dev; the placement
  writes are the RPCs WP2.2's contract suite already covers on dev.
- **RS-b.** If the operator wants list render timings on production-shaped data, the least invasive form is a
  **read-only** preview pointed at the realistic data set — which `PROGRESS.md:19` forbids without explicit
  instruction (it is not wired to Vercel and carries real contact details). Not proposed.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run by `pnpm test`

- `src/lib/campaign/__tests__/workforce-list-model.test.ts` (new module, §7): rows carry the worker's unit **in the
  selected Group** and "Unassigned" when they hold none; a worker with units in two Groups shows only the selected
  Group's; a placement on a `group_id NULL` container shows as Unassigned in every Group; sections are
  `display_order, name` with "Unassigned in &lt;Group&gt;" **last**; empty sections drop out when `showEmptyUnits` is
  false and stay when true; the "Not in any group" view is one section; **equivalence with the view**: a fixture
  written as `campaign_group_membership` rows (one per member × group, `ou_id` null when unplaced, the SQL of
  `20260914090100:156–160` transcribed into the generator) must equal the model's Unit column for every Group — the
  same contract `wp/wp2.4.md` §4.1 pinned for the chart; other-group columns name the right unit per Group.
- `src/lib/campaign/__tests__/workforce-view.test.ts` (+ cases): `resolveWorkforceLayout` precedence — `?view=` wins
  over a stored layout; a stored layout wins over the device default; an unrecognised `?view=` falls through to the
  stored layout, then to the device; touch with nothing stored is still `list` (the WP0.3 guarantee).
- `src/lib/campaign/groups/__tests__/wall-chart-prefs.test.ts` (+ cases): `layout` and `list` round-trip; a malformed
  `layout` is dropped without touching `group`/`filter`; `otherGroupColumns` drops ids that are not live groups;
  `mergeWallChartPrefs` still carries `compare` and any unknown key.
- `src/components/campaigns/workforce/__tests__/workforce-selection-context.test.tsx`: add, remove, clear, select-all
  of a section; the store is worker-id keyed and de-duplicates; the bridge maps worker ids to
  `(ouId, workerId)` pairs through `placementByWorker` and drops workers not in the selected Group.
- Bulk move planning is pinned by the existing `plan-drop.test.ts`; the v2 toolbar's own call shape is pinned in §4.3
  (it needs a mounted mutation).

Test count must be ≥ the count on `main` at the branch base (**1,563 on `7e8a3fab`**, `PROGRESS.md:45`); no test
skipped, quarantined or deleted.

### 4.2 Contract tests (DB-backed) — none added

No RPC changes. `placements.move` with a target, with `toOuId: null` + `withinGroupId`, and the refusal of
`withinGroupId` beside a target are already covered on dev
(`src/lib/campaign/__contract__/structure-api.contract.test.ts:1017`, `:1053–1055`, `:1066–1069`). The contract suite
is not re-run for this package unless the reviewer asks; if it is, it needs the `OUX_CONTRACT_*` variables in the
operator's shell and runs against normal dev only.

### 4.3 Interaction tests (jsdom, the WP2.3/WP2.4 harness) — `workforce/__tests__/`

Harness additions (additive; existing tests unaffected): a `setSearch(search)` method on `MountedWallChart`
(`harness/mount.tsx:47–59`) that calls `setSearchParams` (`backend.ts:93–99`) and flushes a render, because
`router.replace` is a spy that never updates the mocked params (`mocks.ts:58–78`); a `groupsV2` flag stub as the WP2.4
board test already does (`workforce-board.test.tsx:27`, `:54–56`).

`workforce-list-view-v2.interaction.test.tsx`, mounting **`WorkforceBoard`** with the flag on, the `small` fixture
(three groups) and `search: "view=list"`:

1. rows are sectioned by the selected Group's units with "Unassigned in &lt;Group&gt;" last; counts match.
2. choosing another Group in the selector rewrites `?group=` (spy), writes the prefs upsert payload
   `{ wallChart: { group: G2, … } }`, re-sections the rows, and **clears the selection**.
3. `?group=none` renders the "Not in any group" section; zero groups renders the no-groups sentence.
4. the Filter popover applies to every section and renders chips; a chip's × clears that dimension; the prefs upsert
   carries the serialised filter; "Show empty units" hides and shows empty sections.
5. **"switch layout preserves group, filter and selection"** — the acceptance test, both directions: with a Group, a
   filter and three rows selected, click "Wall chart", drive the URL with `setSearch("view=wall-chart&group=…")`, and
   assert the chart mounts on the same Group, with the same filter chips and the same three tiles selected; click
   "List", drive the URL back, and assert the same three rows are still ticked, the filter chips are unchanged and the
   Group is unchanged. A second case asserts the prefs upsert carried `layout` on each switch and that a reload with
   no `?view=` opens on the stored layout.
6. **bulk Move to unit within the selected Group** — select two workers in unit A, open "Move to unit…", choose unit
   B of the same Group, and assert one `structure_placements_move` with `p_from_ou_id: A`, `p_to_ou_id: B`,
   `p_within_group_id: null`; choose "Unassigned in &lt;Group&gt;" and assert `p_to_ou_id: null,
   p_within_group_id: G`; a selection spanning two units issues one call per source; a worker already in the target is
   not sent; the dialog's target list contains only the selected Group's units (plus Unassigned), and in the "Not in
   any group" view it contains units of every Group labelled "Group › Unit".
7. Set rating and Link to leader open and submit with the selected worker ids; a refused move toasts through
   `structureErrorMessage` and leaves the selection in place.
8. the worker sheet opens from a row and the provider received `registerGroups` with the campaign's groups.
9. **control census** (reported, then asserted): the console table of interactive controls per region (board,
   toolbar, bulk bar, section header, row) is printed for the verifier to paste, and the test asserts there is no
   "Assign to unit", no "Group by employer", no "Organising group" filter section and no per-section Filter/View/Sort
   control anywhere in the v2 list.
10. **flag off**: the same board mounts `WorkforceListView` (legacy sentence present, "Assign to unit" present, no
    Group selector, no prefs query in the cache), proving §3.13 line by line.

`workforce-list-view-v2.characterization.test.tsx` — skeleton snapshots for: default (Group by unit), flat list,
read-only (`canWrite: false`), "Not in any group", no groups, everything filtered out.

### 4.4 Render cost

`workforce-list-view-v2.render-cost.test.tsx` — the `large` fixture on its largest Group, and the all-Unassigned
variant; the legacy list is mounted in the same file and the medians are printed side by side. Standard: v2 ≤ 1.1 ×
legacy in the same run (the WP2.4 D19 rule); the absolute budget is reported, not asserted, because the sandbox runner
is known to be slow (`wp/wp2.4.md` §11.7.3).

### 4.5 e2e and acceptance (AC)

New `apps/organising-db/tests/e2e/groups-v2/list-view.spec.ts`, reusing `tests/e2e/groups-v2/helpers.ts` and
`tests/e2e/user-prefs.ts` from WP2.4 (additive additions to the helper file only; no existing spec or helper
rewritten). It pins `withUserPrefs({ mode: "full", flags: { groups_v2: true } })`, seeds both hint dismissals, scripts
the sync POST as WP2.4's spec does, and uses `restClientFor` (which refuses production) for the
`campaign_group_membership` oracle. Five tests, one per acceptance item:

1. **Group and filter survive the switch.** Open `?tab=workforce&sub=wall-chart&view=list&group=<G1>`; apply a filter;
   switch to Wall chart; the URL keeps `?group=<G1>`, the chart shows the same Group and the same chips; switch back;
   the list shows the same Group, the same chips and the same rows.
2. **Selection survives the switch.** Tick two rows; switch to the chart; the two tiles are selected and the selection
   bar says "2"; switch back; the two rows are still ticked.
3. **Bulk Move to unit within the selected Group.** Select worker W in unit A, Move to unit → B; the row's Unit column
   reads B; oracle: `campaign_group_membership` for W in G1 is B and in G2 is unchanged. Then Move to "Unassigned in
   &lt;G1&gt;"; the row moves to the Unassigned section; oracle: G1 `ou_id` null, G2 unchanged.
4. **Default on touch.** With no `?view=`, a mobile-emulated context opens on List and a desktop context on Wall
   chart; after choosing List on desktop and reloading without `?view=`, the stored `layout` opens on List.
5. **Legacy path.** With the flag off for the same account, the List shows "Assign to unit" and the container Group
   column, unchanged.

- **AC-b (recommended).** As for WP2.4 (`wp/wp2.4.md` §9.1 E2-b, `:1184`), the **operator performs items 1–5 by hand**
  on the branch preview from `docs/organiser-ux-review/wp/wp2.6-acceptance-checklist.md` (written in Stage 3, in the
  same shape as `wp2.4-acceptance-checklist.md`), with the REST oracle replaced by what the worker sheet's Units tab
  shows; the orchestrator records the result in §9.2 as the acceptance evidence. The spec is still written and
  type-checked (`tsc --noEmit` covers `tests/e2e`) so it can run from `e2e-preview.yml` whenever secrets exist.
- **AC-a.** The same spec run from a credentialled shell. Not available: this sandbox cannot host a browser suite
  (`wp/wp2.2.md` D80/D81, `:938–939`) and the operator declined repository secrets for that workflow
  (`wp/wp2.2.md:989`).

Existing specs (`wall-chart.spec.ts`, `wall-chart-decomposition.spec.ts`, `structure-api.spec.ts`, `groups-v2.spec.ts`,
`roles/*`, `organiser-campaign.spec.ts`) must stay green on the same preview with the flag in its default state.

### 4.6 Legacy suites

`pnpm test` runs every WP2.2/WP2.3/WP2.4 suite unchanged, including the eight legacy characterisation snapshots, the
v2 chart's four suites, `workforce-board.test.tsx`, `use-allocate-workers-to-ou.test.tsx`,
`allocate-toast-message.test.ts` and the guard test `no-direct-structure-writes.test.ts` (the v2 list writes only
through `useMoveWorkersMutation` → `structureApi`; the prefs upsert is not a structure table).

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit
pnpm --filter organising-db lint           # touched lines clean; total problems <= 295 (143 errors / 152 warnings, wp2.4.md §8.3 note)
pnpm --filter organising-db test           # >= 1,563 (main at 7e8a3fab); no skips added

# acceptance greps
rg -n "groups_v2|groupsV2|useGroupsV2" apps/organising-db/src --glob '!**/__tests__/**'   # readers: lib/flags/groups-v2.ts, lib/workspace/*, workforce-board.tsx, administration/page.tsx only
rg -n "localStorage" apps/organising-db/src/components/campaigns/workforce apps/organising-db/src/lib/campaign/workforce-list-model.ts ; echo "exit=$? (1 = none in the new tree = pass)"
rg -n "ou_group_id|is_group_container" apps/organising-db/src/components/campaigns/workforce/workforce-list-view-v2.tsx apps/organising-db/src/components/campaigns/workforce/workforce-bulk-toolbar-v2.tsx apps/organising-db/src/lib/campaign/workforce-list-model.ts ; echo "exit=$? (1 = no container-model reader in the v2 list = pass)"
rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = pass)"
git diff --stat main -- apps/organising-db/src/components/campaigns/workforce/workforce-list-view.tsx apps/organising-db/src/components/campaigns/workforce/workforce-bulk-toolbar.tsx ; echo "(must be empty: the legacy list is untouched)"
git diff --stat main -- supabase/ packages/db-types/ ; echo "(must be empty: no migration, no regen)"
git diff --stat main -- apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx ; echo "(SL-a: 2 lines, or empty under SL-b)"

# census and render cost (output pasted into §9.2)
cd apps/organising-db && pnpm exec vitest run \
  src/components/campaigns/workforce/__tests__/workforce-list-view-v2.interaction.test.tsx \
  src/components/campaigns/workforce/__tests__/workforce-list-view-v2.render-cost.test.tsx

# build
pnpm --filter organising-db build

# e2e against the branch preview (credentials from the operator's shell; never printed; not runnable in this sandbox — D80/D81)
cd apps/organising-db && E2E_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/groups-v2 tests/e2e/wall-chart.spec.ts tests/e2e/structure-api.spec.ts tests/e2e/roles
```

Never `pnpm dev` / `pnpm start`; never a `supabase` command (none is needed); never a read of `.env.local`; no
Supabase connector call of any kind in this package.

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages

| Stage | Content | Needs DB? |
|---|---|---|
| 0 | This plan approved (§9.1 answers GS, SL, LY, CL, OG, BT, HL, RS, AC); ledger row "not started → planning/implementing"; branch cut (`git` commands put to the operator). | No |
| 1 | **Shared state, pure library, no UI rewrite.** `lib/campaign/workforce-list-model.ts` (rows, sections, group-scoped unit, other-group columns) + tests; `resolveWorkforceLayout` in `lib/campaign/workforce-view.ts` + tests; the `layout` and `list` keys in `wall-chart-prefs.ts` + tests; `workforce/workforce-selection-context.tsx` and `use-workforce-selection-bridge.ts` + tests; `workforce-board.tsx` layout resolution and the provider (legacy list still mounted, so the board test must stay green with the flag off). | No |
| 2 | **The v2 list.** `workforce-list-view-v2.tsx` (toolbar, sections, columns, search, Columns ▾), `workforce-bulk-toolbar-v2.tsx` (Set rating, Move to unit…, Link to leader…), the board's flag branch, the groups-hook wiring (GS), the provider registration, the SL-a two-line bridge in `campaign-wall-chart-v2.tsx`; harness `setSearch`; the §4.3 interaction + characterisation tests and the §4.4 render-cost test. | No |
| 3 | **Acceptance and close.** e2e spec + helper additions written and type-checked; `wp2.6-acceptance-checklist.md`; the operator runs items 1–5 on the branch preview (AC-b) and the orchestrator records it in §9.2; verifier output pasted; fresh reviewer (Opus — this package writes placements through an existing RPC and reads worker data, but adds no SQL; the orchestrator may choose Fable); `PROGRESS.md` row; PR marked ready. | Preview (dev) |

### 6.2 Commits

One commit per completed stage, small and descriptive, on `feat/oux-wp2.6-list-view`; the branch only ever merges
`main` in (never rebase, amend or force-push). Every push and the PR command are put to the operator first.
`supabase/.temp/*` is never staged.

### 6.3 PR

Draft PR `feat/oux-wp2.6-list-view → main`, title `feat(oux-wp2.6): list view on shared group, filter and selection
state (behind groups_v2)`. Body: §3.1 summary; the §3.13 flag-off/flag-on table; the evidence matrix; the GS/SL/LY/CL/
OG/BT/HL decisions as approved; the one visible reduction (§3.6, the four legacy-only filter dimensions) named
explicitly; "no migration" stated once. Marked ready only after Stage 3.

### 6.4 Promotion gate

**Not applicable: no migration** (§3.12). The merge deploys code that is inert without the per-user flag. After the
merge the operator may tick `Groups v2` in Administration → Users to see both v2 layouts.

---

## 7. Files

New:

- `apps/organising-db/src/components/campaigns/workforce/workforce-list-view-v2.tsx`
- `apps/organising-db/src/components/campaigns/workforce/workforce-bulk-toolbar-v2.tsx`
- `apps/organising-db/src/components/campaigns/workforce/workforce-selection-context.tsx`
- `apps/organising-db/src/components/campaigns/workforce/use-workforce-selection-bridge.ts`
- `apps/organising-db/src/lib/campaign/workforce-list-model.ts`
- `apps/organising-db/src/lib/campaign/__tests__/workforce-list-model.test.ts`
- `apps/organising-db/src/components/campaigns/workforce/__tests__/workforce-selection-context.test.tsx`
- `apps/organising-db/src/components/campaigns/workforce/__tests__/workforce-list-view-v2.interaction.test.tsx`
- `apps/organising-db/src/components/campaigns/workforce/__tests__/workforce-list-view-v2.characterization.test.tsx` (+ snapshots)
- `apps/organising-db/src/components/campaigns/workforce/__tests__/workforce-list-view-v2.render-cost.test.tsx`
- `apps/organising-db/tests/e2e/groups-v2/list-view.spec.ts`
- `docs/organiser-ux-review/wp/wp2.6-acceptance-checklist.md`

Modified (additive, default-preserving):

- `apps/organising-db/src/components/campaigns/workforce/workforce-board.tsx` — layout resolution under the flag, the
  v2 list branch, the selection provider. **Not** the sync query, the invalidation effect or the notice (WP2.4).
- `apps/organising-db/src/lib/campaign/workforce-view.ts` — `resolveWorkforceLayout` (the two existing functions are
  unchanged).
- `apps/organising-db/src/lib/campaign/groups/wall-chart-prefs.ts` — the `layout` and `list` keys.
- `apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx` — **two lines** (SL-a bridge); none under
  SL-b.
- `apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mount.tsx` — `setSearch` on the mounted
  object (additive).
- `apps/organising-db/tests/e2e/groups-v2/helpers.ts` — list locators (additive).
- `apps/organising-db/src/lib/campaign/__tests__/workforce-view.test.ts`,
  `src/lib/campaign/groups/__tests__/wall-chart-prefs.test.ts` — added cases only.
- `docs/organiser-ux-review/PROGRESS.md` — ledger row, incidental findings (the `worker_campaign_connections` RLS
  finding of §3.7 CL-a; the deferred "Add to list" of §3.8 BT-a).
- This file — §8.3 deviations, §9.2 verification, §9.3 review.

Not modified: `workforce-list-view.tsx`; `workforce-bulk-toolbar.tsx`; `allocate-toast-message.ts`;
`lib/campaign/use-allocate-workers-to-ou.ts`; every legacy wall-chart composition file; every `wall-chart/v2/*` file
except the two-line bridge call site; `filters.ts`; `move-worker-mutation.ts`; `structure-api.ts`;
`normalize-members.ts`; `campaign-worker-detail-provider.tsx`; `lib/analytics/events.ts`; `lib/hints/registry.ts`;
`sync-campaign-universe.ts`; the sync route; `sync-on-open-notice.tsx`; anything under `supabase/`;
`packages/db-types/generated.ts`; any existing e2e spec.

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion | Evidence |
|---|---|
| Plan 5.7 delivered behind `groups_v2` | §3 design; the census assertions of §4.3 item 9; the flag-off case of §4.3 item 10 |
| **Switching layouts preserves group** | §4.3 item 5 (both directions, URL + prefs asserted); e2e item 1; operator checklist item 1 |
| **Switching layouts preserves filter** | §4.3 items 4–5 (chips and serialised filter identical after the round trip); e2e item 1 |
| **Switching layouts preserves selection** | §4.3 item 5 and the bridge test of §4.1; e2e item 2; operator checklist item 2 |
| **Bulk Move to unit works within the selected group** | §4.3 item 6 (recorded `structure_placements_move` args, including `p_within_group_id` for Unassigned); e2e item 3 with the `campaign_group_membership` oracle; operator checklist item 3 |
| **Default on touch devices** | `workforce-view.test.ts` (existing + new cases); §4.3 item 5's stored-layout case; e2e item 4 |
| "Group by unit" is the default grouping; Unassigned and Not in any group are sections | §4.3 items 1 and 3; characterisation snapshots |
| Columns incl. the group-scoped Unit column | `workforce-list-model.test.ts` incl. the `campaign_group_membership` equivalence case; snapshots |
| State in `user_campaign_prefs`, nothing new in localStorage | prefs tests; the recorded upsert payloads in §4.3; the `rg localStorage` grep of §5 |
| No migration; no RPC change; guard test green | `git diff --stat main -- supabase/ packages/db-types/` empty; guard test in `pnpm test` |
| Full mode and the legacy list keep working | the `git diff --stat` on the two legacy files is empty; every legacy suite unchanged and green; §4.3 item 10; e2e item 5 |
| No per-section filter/view override, no "Assign to unit", no container-model reader in the v2 list | census assertions; the `rg ou_group_id` grep of §5 |
| Terminology | reviewer checklist item 5 against §3.17 |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| WP2.5 and WP2.6 both add a key to `wall-chart-prefs.ts` | one key each, in separate blocks; whichever merges second merges `main` in and keeps both; §3.19 |
| WP2.5 changes `useWallChartGroups`'s signature for Compare (GS-a) | WP2.5's row in §3.19 says "add, never re-shape"; stop condition 6 if it happens anyway; GS-b is the fallback and costs ~60 lines |
| The SL-a bridge touches `campaign-wall-chart-v2.tsx`, which WP2.5 also edits | two lines at the top of the file, a different region from the band; §9.1 requests the amendment in writing |
| Selection preserved across layouts could surprise an organiser who selected 200 rows and then bulk-acts in the chart | the count is always on screen in both layouts; a Group change clears it (§3.9); the operator checklist looks at it |
| Dropping the list's employer / worksite / unit / group-container filters (§3.6) | stated in the PR body and in the checklist; the group model covers all four; the legacy list keeps them until WP2.8 |
| "Last contact" absent (CL-a) | recorded in §1.5 and in the ledger as WP4.2's; the RLS finding recorded as incidental |
| Prefs write races between the two layouts of one user | one document, overlay-first writes, whole-overlay upserts (`useUserCampaignPrefs.ts:176–182`, fix-round-1 A1); last-write-wins across tabs, as WP2.4 recorded |
| A refused prefs write or read | the table keeps its in-memory state and one toast fires (`useUserCampaignPrefs.ts:145–160`); the list never blocks on prefs |
| Hundreds of rows in one Unassigned section (decision 4) | §4.4 render-cost case with 305 all-Unassigned; no virtualisation in this package; stop condition 4 if it regresses |
| `DataTable`'s pre-existing `organising-db:rows-per-page` localStorage key | pre-existing, not view state this package adds, not touched; recorded so the reviewer does not read the grep as a breach |
| A worker selected in the chart is not in the List's current Group (or vice versa) | the bridge drops ids that are not on screen when seeding, and the store keeps them for the other layout only while the Group is unchanged; §4.1 pins it |
| Two layouts issuing the prefs and groups queries under the same keys could double-fetch on a switch | same keys, 5-minute `staleTime`; §4.3 asserts one cache entry each after a round trip |
| Playwright cannot run here (D80/D81) | AC-b: the operator's hand test is the acceptance; the spec is written and type-checked |
| Lint creep from the new tree | touched lines clean; total ≤ 295 |

### 8.3 Deviations from plan (implementer keeps; numbering starts at D1)

_None yet — implementation has not started._

| # | Deviation | Why | Plan section affected |
|---|---|---|---|

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. Any change would be needed under `supabase/`, to `packages/db-types/generated.ts`, or to any RPC.
2. A v2 behaviour cannot be built without editing `workforce-list-view.tsx`, `workforce-bulk-toolbar.tsx` or any
   legacy wall-chart file, or a legacy vitest suite or e2e spec would need a change to pass.
3. The `campaign_group_membership` equivalence case of §4.1 finds a disagreement between the model and the view.
4. The all-Unassigned render-cost case exceeds the legacy list's median in the same run by more than 10 %.
5. The `groups_v2` flag would need a reader outside `lib/flags/groups-v2.ts`, `lib/workspace/*`, `workforce-board.tsx`
   and the admin page.
6. `wall-chart/v2/use-wall-chart-groups.ts`, `campaign-wall-chart-v2.tsx`, `filters.ts`, `move-worker-mutation.ts` or
   `wall-chart-prefs.ts` has changed on `origin/main` since the branch base in a way that alters a signature this
   package consumes (WP2.5 or WP2.7 landing first).
7. A new analytics event or union member seems necessary (§3.14).
8. Lint total would exceed 295 or `tsc` fails in an untouched file.
9. Anything would touch `gteygwfgjvczanmrwgbr`, or an e2e run would target it.
10. A third fix round would be needed.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Recommendation | Operator answer |
|---|---|---|---|
| **GS** | How the List gets the chart's Group selection: **GS-a** import `wall-chart/v2/use-wall-chart-groups.ts` (one precedence chain, one `?group=` writer; needs a one-line amendment to `wp/wp2.4.md` §3.18's "never from `components/campaigns/wall-chart`", which was written before that hook existed); **GS-b** duplicate it in `lib/`; **GS-c** lift it into `lib/` now | **GS-a** | _pending_ |
| **SL** | Selection across a layout switch: **SL-a** a board-level worker-id store, with a two-line bridge in `campaign-wall-chart-v2.tsx` so the criterion holds in both directions; **SL-b** list-only (chart → list loses it); **SL-c** persist it in prefs | **SL-a** | _pending_ |
| **LY** | Layout persistence: **LY-a** `?view=` → stored `layout` → device default, under the flag only; **LY-b** for everyone | **LY-a** | _pending_ |
| **CL** | Plan §5.7's "Last contact" column: **CL-a** defer to WP4.2 and record the `worker_campaign_connections` RLS finding (the column would be empty for exactly the organiser-mode campaigns); **CL-b** ship it now, which needs a policy change and therefore a migration | **CL-a** | _pending_ |
| **OG** | "Optional column per other group": **OG-a** off by default behind a Columns ▾ popover, persisted; **OG-b** always on | **OG-a** | _pending_ |
| **BT** | Bulk toolbar: **BT-a** Set rating, Move to unit…, Link to leader… now; "Add to list" deferred with the build-list drawer (plan `:313`) to WP2.6b/WP4.1; **BT-b** lift the build-list panel to the board in this package | **BT-a** | _pending_ |
| **HL** | Hidden units in a list: **HL-a** the list ignores `hiddenOuIds` (hiding rows hides them from bulk actions) and honours "Show empty units"; **HL-b** honour both | **HL-a** | _pending_ |
| **RS** | Realistic data set: **RS-a** not used by WP2.6; **RS-b** a read-only preview against it | **RS-a** | _pending_ |
| **AC** | Acceptance: **AC-a** the Playwright spec run from a credentialled shell; **AC-b** the operator performs items 1–5 by hand on the branch preview from the checklist, the orchestrator records it (as WP2.2 and WP2.4 did) | write the spec; **AC-b** | _pending_ |

Approvals still required, in order:

1. The nine answers above, in particular the two boundary amendments (**GS-a** and **SL-a**) to `wp/wp2.4.md` §3.18,
   and confirmation that WP2.6 may add the `layout` and `list` keys to `lib/campaign/groups/wall-chart-prefs.ts`
   while WP2.5 adds `compare` to the same object.
2. Approve `git checkout -b feat/oux-wp2.6-list-view main`, the Stage-0 commit of this plan and the ledger row,
   `git push -u origin feat/oux-wp2.6-list-view`, and opening the draft PR.
3. Approve each stage commit and push individually.
4. **AC-b:** perform the five-item checklist on the branch preview when Stage 3 is ready and report; the orchestrator
   records the result in §9.2.

**Orchestrator approval:** _pending (Revision 1)._

### 9.2 Verification output (verifier pastes raw output)

_pending._

### 9.3 Reviewer findings and resolution

_pending._

---

## 10. Revision history

- **Revision 1** (2026-09-15): initial plan against `main` at `7e8a3fab` (WP2.4 merged at `5a16de07`). Recommends
  GS-a, SL-a, LY-a, CL-a, OG-a, BT-a, HL-a, RS-a, AC-b. Two lists behind the existing `groups_v2` flag; the List reads
  the chart's Group selection, one filter, Colour by and layout from `?group=`, `?view=` and
  `user_campaign_prefs.prefs.wallChart`; sections are the selected Group's units with "Unassigned in &lt;Group&gt;"
  last; bulk **Move to unit…** goes through `placements.move` (with `withinGroupId` for Unassigned) instead of the
  legacy `placements.assign` with `skip`; selection is a board-level worker-id store shared by both layouts; no RPC,
  migration or types change; acceptance by the operator on the branch preview with the Playwright spec written and
  type-checked.
