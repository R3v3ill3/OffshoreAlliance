# WP2.4 — Group selector, per-group Unassigned, Not in any group, campaign-wide Colour by and Filter, server-side prefs

Status: **Revision 2 (2026-09-15) — operator answers recorded in §9.1 (FL-b, SY-c, PR-a, CP-a, HU-a, MN-a, CA-a, RD-a, E2-b);
SM (cross-campaign mirror) recommended SM-a as a bounded follow-up WP2.4b, awaiting the operator's answer. Implementation not started.**
Written 2026-09-15 against `main` at `bd0c44d0`; Revision 2 re-cited against `main` at `8ad4c1ad`, which carries two
parallel "Cursor Agent" commits (`e47b4d10`, `4461c2ee`; `PROGRESS.md:102`): the universe sync now defaults campaign
membership to employer **and** worksite with a match-mode control (§2.8). No schema, route or board file changed. Depends on WP2.1 (production 2026-09-14, `wp/wp2.1.md` §15),
WP2.2 (**complete on production 2026-09-15**, 2.2b applied and verified, `wp/wp2.2.md` §9.2 "Production step 8"; also
on normal dev) and WP2.3 (merged at `4d2ff4b`, `wp/wp2.3.md`). The sub-unit View inheritance fix `67c3e9f8` is on `main`.

Branch (proposed): `feat/oux-wp2.4-group-selector` off `main`. Draft PR into `main`. **No migration** (§3.11), so the
promotion gate of `PROGRESS.md` standing notes does not bind this package; the merge deploys code whose new path is
behind `groups_v2`, default off.

This document follows `wp/README.md`: specification → plan → approval → deviations → verification → review. §0 is
placed first, as in `wp/wp2.2.md`, because it states what the package needs from the databases: nothing.

### Decision labels used in this document (each label is unique; none is reused)

| Label | Topic | Section |
|---|---|---|
| **FL-a / FL-b / FL-c** | Where the `groups_v2` flag lives and who can flip it | §3.2 |
| **SY-a / SY-b / SY-c** | The fate of sync-on-open (answered: **SY-c**, kept and announced) | §3.14 |
| **SM-a / SM-b / SM-c** | Cross-campaign mirror: what the reverse sync does when the worker already holds a unit in the target campaign's group | §3.15 |
| **PR-a / PR-b** | Shape of the `user_campaign_prefs` document; whether a migration is needed | §3.11 |
| **CP-a / CP-b** | Copy (Shift-drag, selection-bar Copy, right-click Copy) in the v2 chart | §3.9 |
| **HU-a / HU-b** | Hidden units and "Show empty units" | §3.12 |
| **MN-a / MN-b** | Rename / Set estimate on the unit card's ⋯ menu | §3.6 |
| **CA-a / CA-b** | Disposition of the WP2.2 rows carried to WP2.4 (A3, A4, A5, A8, D72) | §3.17 |
| **RD-a / RD-b** | Use of the realistic data set for this package | §3.19 |
| **E2-a / E2-b** | How flows two and three are accepted | §4.5 |

---

## 0. Where the schema has to be, and when (nothing to do)

Every database object this package reads or calls already exists on **production** and on **normal dev**, and no
new object is added:

| Object | Where defined | Production | Normal dev |
|---|---|---|---|
| `campaign_groups` (`group_id, campaign_id, kind, name, display_order, source_ou_id, …`), RLS `campaign_groups_select … USING (true)` for `authenticated` | `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql:400–480` (policy `:460–463`) | 2026-09-13 | found applied 2026-09-14 |
| `campaign_organising_units.group_id`, `campaign_worker_ou.group_id` (trigger-derived) | same file `:505`, `:513`, `:722–743` | 2026-09-13 | 2026-09-14 |
| `user_campaign_prefs(user_id, campaign_id, prefs jsonb, updated_at)`, owner-only RLS `ucp_*`, `authenticated` has SELECT/INSERT/UPDATE/DELETE, CHECK `jsonb_typeof(prefs) = 'object'` | same file `:781–831`; generated type `packages/db-types/generated.ts:19018–19036` | 2026-09-13 | 2026-09-14 |
| `structure_placements_move(… p_within_group_id …)`, `structure_placements_unassign(… p_within_group_id …)` | `supabase/migrations/20260914090000_wp2_2_structure_api.sql:2630–2705`, `:2862–2916`; wrapper `apps/organising-db/src/lib/campaign/structure-api.ts:326–345`, `:619–645` | 2026-09-15 (2.2a) | 2026-09-14 |
| `campaign_worker_ou_one_unit_per_group` unique index; `campaign_group_membership` view (security invoker, SELECT to `authenticated`) | `supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:92–95`, `:156–173` | 2026-09-15 (2.2b, `wp/wp2.2.md` "Production step 7/8") | 2026-09-14 |

Consequences: `wp/wp2.1.md` §6.4 step 6 ("only after step 5 on a given database may `campaign_group_membership` be
consumed and the later group-model consumer/flag be introduced") is satisfied on both databases; `wp/wp2.2.md` §6.4
step 4 ("only after step 3 completes on production may WP2.4 begin") is satisfied. No `supabase` CLI command, no
connector call, no run sheet and no types regeneration is part of this package. `packages/db-types/generated.ts`
already carries `campaign_groups`, `user_campaign_prefs` and (from the `c1967d2a` regen) the RPC symbols; nothing in
this package relies on generated `Functions` entries (§2.7 of `wp/wp2.2.md` still applies: the wrapper is hand-typed).

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 Specification (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:148`)

> **WP2.4 Group selector, per-group Unassigned, Not in any group, campaign-wide Colour by and Filter, server-side
> prefs.** High-risk implementer. Implement plan 5.6 except Compare, behind `groups_v2`. Per-unit View, Badges, Sort
> and Filter overrides are removed; drag rules follow plan 5.6; state lives in `user_campaign_prefs` and the `?group=`
> parameter. Acceptance: e2e flows two and three pass; appendix A section 3's control inventory is re-counted and
> reported (target: no per-unit filter or view override remains); worker search and the Units manager still work
> with hidden units (appendix A 2.3). Depends on WP2.1, WP2.2, WP2.3.

Flows two and three (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:76`): "switch the group selector and see a worker move
between a unit and Unassigned; drag a tile to Unassigned". Phase 2 exit (`:160`): "e2e flows two and three green; the
share of memberships in at least one unit and the median unit size reported from dev and … from production; no
per-unit filter or view override remains".

### 1.2 Binding additions from the phase-2 orchestration prompt (`PHASE2_MAIN_ORCHESTRATION_PROMPT.md`)

1. `:46` — `groups_v2` may now be introduced; `campaign_group_membership` may now be consumed (2.2b is on production).
2. `:47` — sync-on-open is a writer; **WP2.4 decides whether it survives** — decided **SY-c** by the operator on
   2026-09-15: it survives, on both chart paths, and announces what it changed (§3.14).
3. `:43` — branch off `main`, draft PR into `main`, every push/PR command put to the operator first; never rebase or
   force-push; no worktrees; never commit `supabase/.temp/*`.
4. `:44` — the promotion gate binds only packages with a migration; §3.11 records that this package has none.
5. `:59` — if the package wants realistic data, the plan says so and proposes the least invasive use (§3.19).
6. `:121` — WP2.5, WP2.6 and WP2.7 follow WP2.4 in parallel where files are disjoint; §3.18 draws the boundaries.
7. Inherited rules (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:34`, `:36`): full mode keeps working; the flag defaults off;
   do not materialise Unassigned as rows; do not keep view state in localStorage; no new campaign-creation path.

### 1.3 Plan §5.5 / §5.6 as this plan reads them (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`)

- `:291` **Unassigned** — derived, never stored; last card in every group; a drop target that removes the worker from
  their unit *in that group*; filterable and bulk-actionable; cannot be renamed, rated or deleted.
- `:292` **Not in any group** — members Unassigned in every group; a view in the group selector; with no groups it is
  the whole membership as one flat grid.
- `:305` **Group selector** — groups in display order plus "Not in any group"; single-select; default = first group;
  last choice remembered per campaign server-side; `?group=` in the URL; shown even with one group; **"Show empty
  units"** toggle, off by default.
- `:306` **Compare** — **not this package** (WP2.5); the toolbar leaves a slot and the prefs document reserves a key.
- `:307` **Colour by** — campaign-wide; per-unit "View" and "Badges" popovers removed; participation source moves into
  Filter.
- `:308` **Filter** — one popover, one state, applied to every unit shown; adds "in unit of another group"; active
  filters as chips.
- `:309` **Unit card** — name, count / estimate with unfilled slots, rating, a single ⋯ menu (Rename, Set estimate,
  Assign people, Split, Merge, Delete); selection bar keeps Move, Add to list, Link to leader, Clear ratings and the
  count; "Select all" becomes a click on the card count. (Leader avatar, bulk Set rating and undo toasts: §1.5.)
- `:310` **Tile** — unchanged minus the multi-unit indicator; drag = move within the group; drop on Unassigned removes
  from the unit in this group only; **no copy drag**; cross-group placement in the sheet or by switching group.
- `:311` **Layout** — tiles first; charts below (already so since WP0.3, `campaign-wall-chart.tsx:282–294`).
- `:312` **State** — group, compare, colour-by, layout, filter per user per campaign on the server; hidden units and
  %/# too; nothing lost when switching to List (List reads the same state — WP2.6).
- `:122–133` **Terminology** — Group, Unit, Unassigned, Not in any group, Colour by, Wall chart / List.
- `:489`, `:491` — do not materialise Unassigned; do not leave state in localStorage.
- Decision 4 note (`DECISIONS.md:39`): 100 % Unassigned at instigation is normal; hundreds of tiles in one card
  must render within budget and the empty-structure state must read as normal. Decision 5 (`:40`): Employer and
  Worksite are two independent groups; a worker sits in one unit of each.

### 1.4 Binding handoffs from earlier packages

- `wp/wp2.1.md` §2.3 (`:324–348`) — the `campaign_group_membership` definition and its consumption contract (met, §0).
- `wp/wp2.1.md` §6.4 step 6 (`:898–900`) — the flag and consumer may now be introduced.
- `wp/wp2.2.md` §1.5 (`:111–128`) — group UI, the view selector, per-group Unassigned rendering, view consumption are
  WP2.4's; the DB retirements (`is_group_container`, `ou_group_id`, the exclusivity trigger, the legacy split
  function) and the reporting views are **WP2.8's**, not this package's.
- `wp/wp2.2.md` §3.11 row 1 (`:496`) — `placements.move` carries `withinGroupId`, "reserved for WP2.4, unused now";
  row 15a (`:511`) — sync-on-open routed through the API, timing unchanged, fate decided here.
- `wp/wp2.2.md` §8.2 "Stage 7 advisories carried to WP2.4" (`:797`) — A3, A4, A5, A8; D72 (`:925`) membership rewritten
  before a refused placement save. Disposition in §3.17.
- `wp/wp2.2.md` D45 (`:881`) and D56 (`:898`) — `ou_group_id` is container membership only; the settings grid shows
  non-container units only. Both are facts about the legacy container model that the v2 chart no longer renders;
  §3.3 says how containers appear under `groups_v2`.
- `wp/wp2.3.md` §1.4 (`:35–50`) — the four repeated filter → sort → metrics blocks, the per-scope `Map` state, the
  cross-type drop guard and the hard-coded grandchild labels were retained verbatim "for WP2.4". The v2 chart has one
  pipeline and no per-scope state; the legacy files are **not** rewritten (§3.1 principle 2).
- `PROGRESS.md:107` (incidental finding, sync-on-open) and `:17` (`67c3e9f8`, sub-unit View inheritance, which the
  v2 chart makes moot by having no per-unit View).
- `PROGRESS.md:102` — the parallel Cursor commits on `main` (`e47b4d10`, `4461c2ee`): `lib/workers/sync-campaign-universe.ts`
  (+113 lines), `campaign-settings.tsx`, `campaign-universe-section.tsx`, `campaign-wizard.tsx`,
  `step-employers-worksites.tsx`, new `universe-match-mode-control.tsx`; sync tests 53/53, guard test green, `tsc`
  clean on the merged `main`. Every citation into those files below is against `8ad4c1ad`. The ledger asks the operator
  to say whether that session continues on those files; §3.15 and §8.4 depend on the answer.

### 1.5 Not in WP2.4 (recorded so it is not folded in silently)

- **Compare** (plan `:306`) — WP2.5. The toolbar has a `compareSlot` prop and the prefs schema reserves `compare`.
- **List view on shared state** (plan `:315`) — WP2.6. `workforce-list-view.tsx` and `workforce-bulk-toolbar.tsx` are
  not touched; the prefs hook and the pure derivations are exported from `lib/` so WP2.6 can consume them without
  importing from the chart.
- **Groups and units editor**, share-of-group sizing, auto-build — WP2.7. Group create/rename/reorder/delete have no
  screen in WP2.4 (the `structure_group_*` RPCs stay contract-tested only). Units still come from the create-unit
  dialog, split, the settings units section and the wizard, and land in a group through the WP2.1 trigger.
- **Assessment-distribution charts reading the selected group** — WP2.8 by specification (`:156`); WP2.4 leaves
  `WallChartAssessmentCharts` and `useAssessmentDistributions` untouched and keeps passing `activeAssessmentId`.
- **Retiring `is_group_container`, `ou_group_id`, the exclusivity trigger; deleting the legacy chart; removing the
  flag** — WP2.8. Under `groups_v2` off, every legacy file renders byte-for-byte as today.
- **Touch drag, Move to unit in the sheet for touch, segmented selector** — WP4.1.
- Plan `:309` items with no data or no pattern in the app today: **leader avatar** on the unit card (no leader field
  on units), **bulk Set rating** on the selection bar (exists only in the list view's toolbar; WP2.6 may bring it
  across), **undo toasts** for bulk changes (needs inverse operations per RPC; no precedent; recorded for the
  orchestrator to schedule). Toasts without undo are kept as today.
- Migrating per-browser hidden sets / %/# from localStorage into prefs — not done; the v2 chart starts from the
  server document (§3.11) and never reads the four `wallchart:*` keys.
- Any change to `campaign_organising_units` / `campaign_worker_ou` writers (the guard test stays green with an
  empty inventory), any RPC or migration change, any reporting view.

---

## 2. Current-state map

### 2.1 Schema now (both databases)

See §0. Two facts shape the design:

- **Units of a group.** `campaign_organising_units.group_id` is set on every leaf unit and on the 18 Employer
  containers (`wp/wp2.2.md` §1.3 M2: "Employer group exists with `group_id` on the 18 containers"); it is `NULL` only
  for legacy custom-kind containers (`wp/wp2.2.md` §2.1). Employer placements on the containers were materialised by
  `10_materialise_employer_placements.sql` (393 rows on production, `wp/wp2.2.md` "Production step 2"). So "the units
  of group G" = `ous.filter(o => o.group_id === G)`, containers included where they carry the group, and the
  Employer → Worksite parent/child link is irrelevant to rendering.
- **Placements' group.** `campaign_worker_ou.group_id` equals the unit's `group_id` by trigger (`20260912035329:722–743`)
  and is unique per `(worker_id, group_id)` (2.2b). The wall chart's placement read does not select it
  (`normalize-members.ts:141–153` selects `ou_id, worker_id, is_primary`); the unit's `group_id` is the same value.

### 2.2 The wall chart after WP2.3, WP2.2 and `67c3e9f8`

Shell `apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx` (320 lines) composes six blocks:
A `hooks/use-wall-chart-shell-state.ts`, B `hooks/use-wall-chart-core-data.ts`, C `hooks/use-wall-chart-structure.ts`,
D `hooks/use-wall-chart-view-metrics.ts`, E `wall-chart-tile.tsx`, F `hooks/use-wall-chart-actions.ts`, and four
render components `wall-chart-header.tsx`, `wall-chart-unassigned-card.tsx`, `wall-chart-unit-hierarchy.tsx`,
`wall-chart-dialogs.tsx`. It is mounted by `workforce/workforce-board.tsx:101–105` under `?tab=workforce&sub=wall-chart`
(`lib/campaign-tabs.ts:65`, legacy `?tab=wall` `:103`), with `canWrite` from `app/(dashboard)/campaigns/[id]/page.tsx:301–302`.

Units are still banded by **`ou_type`** of the top-level unit (`wall-chart-unit-hierarchy.tsx:106–115`), nested by
`parent_ou_id` (`:135`, `use-wall-chart-structure.ts:355–376`), with roll-ups (`:385–408`). Nothing reads
`campaign_groups`, `group_id`, `campaign_group_membership` or `user_campaign_prefs` (grep: the only mention is a
comment in `lib/hooks/useSwitcherCampaigns.ts:21`).

### 2.3 Every control WP2.4 removes or relocates (appendix A §3 numbering; current location)

| Appx A # | Control | Today | Under `groups_v2` |
|---|---|---|---|
| 12 | Assessment view (campaign default) | `wall-chart-header.tsx:135–150`, `assessment-selector.tsx:167` | **Kept, relabelled "Colour by"** in the v2 toolbar; the explanatory sentence `:140–149` ("Use each unit's View control to override") goes |
| 13 | Participation source | `:158–162`, `participation-selector.tsx` | **Moves into Filter** |
| 14 | List badges (campaign default) | `:165–168`, `list-badge-selector.tsx:48` | Kept (campaign-wide) |
| 15–16 | % / # | `wall-chart-summary-header.tsx`, persisted per browser `use-display-mode.ts:6–35` | Kept; persisted in prefs |
| 17 | Links | `:171–181`, persisted per browser `use-wall-chart-shell-state.ts:170–187` | Kept; persisted in prefs |
| 18 | Find worker | `:185–189`, `use-wall-chart-structure.ts:238–311` | Kept; resolves within the selected group (§3.12) |
| 19–20 | Add worker, Import Workers | `:190–215` | Kept |
| 21 | Units (n) manager | `:220–229`, `wall-chart-unit-manager.tsx` (hidden set per browser `use-wall-chart-unit-visibility.ts:5–58`; containers un-hideable `:178–184`; copy "stored in this browser only" `:115`) | Kept; lists the selected group's units; hidden set in prefs; copy corrected (§3.12) |
| 22 | Expand all / Collapse all | `:230–240`, `use-wall-chart-view-metrics.ts:105–136` | **Removed** (no nesting) |
| 24 | "Group units by" on the charts card | `WallChartAssessmentCharts.tsx:138–142` | Untouched (WP2.8) |
| 26 | Unassigned **View** | `wall-chart-unassigned-card.tsx:145–157` | **Removed** |
| 27 | Unassigned **Badges** | `:158–169` | **Removed** |
| 28–29 | Unassigned **Sort** and **Filter** (+ Apply to all units) | `:170–178`, `wall-chart-filter-bar.tsx:151–165`, `:404–413` | **Removed**; one campaign-wide Filter (Sort inside it) |
| 33 | Unit **View** | `wall-chart-unit-hierarchy.tsx:346–357` | **Removed** |
| 34 | Unit **Badges** | `:359–369` | **Removed** |
| 35 | Unit view / Show sub-units | `:370–392` | **Removed** |
| 36 | Add worker (unit) | `:393–408` | Into the ⋯ menu as **Assign people** |
| 37 | Select all / Deselect all | `:409–431` | Click on the card count |
| 38–39 | Unit **Sort** / **Filter** | `:432–440` | **Removed** |
| 40 | Kebab: Split, Add worker, Delete | `:441–480` | ⋯ menu: Rename, Set estimate, Assign people, Split, Merge, Delete (§3.6) |
| 41–46 | Sub-unit card controls (View `:796–801`, kebab `:819–852`) | | **Not rendered** (no nesting) |
| 47–49 | Grandchild card (View `:650–654`; "Cumulative" label `:600`) | | **Not rendered** |
| 7 | Selection bar **Copy to unit…** | `wall-chart-header.tsx:101`, `wall-chart-selection-bar.tsx:10` | **Removed** under CP-a (§3.9) |
| 8 | Selection bar **Remove from unit** | `:102–106`, `use-wall-chart-actions.ts:201–233` | Becomes **Remove from &lt;group&gt;** (`placements.unassign({ withinGroupId })`) |
| 52 | Tile Shift-drop = copy | `campaign-unit-card.tsx:141`, `:167`; `use-wall-chart-actions.ts:175–180` | **Removed** under CP-a: every drop is a move |
| 51 | Tile right-click → Move/Copy dialog | `wall-chart-tile.tsx:145–151`, `copy-worker-to-unit-dialog.tsx` | Move-only dialog listing the selected group's units + "Unassigned in &lt;group&gt;" (§3.9) |
| — | Multi-unit indicator ◫ | `wall-chart-tile.tsx:79–83`, `:108`; `worker-tile.tsx:412` | **Not shown** in v2 (the tile receives a group-scoped index, §3.13) |
| — | Card description sentence "Campaign default view can be overridden per unit with the unit "View" control" | `campaign-wall-chart.tsx:152–165` | v2 shell has its own description in §3.6 terms |

Expected re-count (the census test of §4.3 reports the actual numbers): fixed page controls 4 (board) + 6 (selection
bar, Copy gone) + 12 (toolbar: Group, Show empty units, Colour by, Filter, Search, %, #, Links, Badges, Add worker,
Import Workers, Units) + 2 (charts) + 1 (print) = **25** (was 30); per unit card **2** (rating, ⋯ menu; + the build-list
drag handle when the panel is open) (was 11); Unassigned card **0** toolbar controls (was 4); sub-unit and grandchild
cards **0** (were 6 and 3); per tile **5** (was 6: Shift-copy gone). Per-unit filter or view overrides: **0**.

### 2.4 Readers of the per-unit override state (all inside the legacy tree; none is changed)

| State | Declared | Read by |
|---|---|---|
| `unitAssessmentOverride: Map<number, AssessmentSelection>` | `use-wall-chart-core-data.ts:93–95` | `use-wall-chart-core-data.ts:152–165` (ratings to load); `use-wall-chart-view-metrics.ts:253–284`, `:286–308`; `wall-chart-unassigned-card.tsx:71–107`; `wall-chart-unit-hierarchy.tsx:173–262`, `:549–605`, `:686–734`; `wall-chart-tile.tsx:86–91`; `wall-chart-model.ts:19–29`, `:43–70` (`resolveScopeOverride`, `effectiveAssessmentForScope` with the `67c3e9f8` parent walk) |
| `unitBadgeOverride: Map<number, Set<ListActivityChannel> \| undefined>` | `:143–145` | `wall-chart-tile.tsx:98–101`; `list-badge-selector.tsx:14`, `:118–188` |
| `filterByScope: Map<number, WallChartFilterState>` (key `0` = Unassigned, `wall-chart-model.ts:17`) | `:100–102` | `use-wall-chart-view-metrics.ts:151`, `:176–209` (`getFilter`, `setFilter`, `applyToAllScopes`); the four pipelines (`wall-chart-unassigned-card.tsx:71–98`; `wall-chart-unit-hierarchy.tsx:173`, `:585`, `:686`) |
| `hierarchyViewByParent` (localStorage `wallchart:subUnitView:<cid>`) | `use-wall-chart-view-metrics.ts:80–103`, `wall-chart-model.ts:111–127` | `wall-chart-unit-hierarchy.tsx:135`; header `:230–240` |
| `participationSource` (React state) | `use-wall-chart-view-metrics.ts:137–145` | metrics `:236–308`; every card's `participationLabel` |

Tests that pin this behaviour and must stay green with the flag off: `__tests__/wall-chart.interaction.test.tsx`
("per-scope state" `:394–456`; "moving across ou_types is blocked silently" `:217`; "copying across ou_types is
allowed" `:229`; "dropping on Unassigned moves to toOuId null" `:244`), `wall-chart.nested-scopes.test.tsx`,
`wall-chart.nested-scope-wiring.test.tsx`, `wall-chart-model.test.ts`, the eight characterisation snapshots,
`wall-chart.structure-writes.test.tsx` (46 tests), and the e2e specs `wall-chart.spec.ts`, `wall-chart-decomposition.spec.ts`,
`structure-api.spec.ts` (test 1 `:398–431` asserts "drag to Unassigned" strips **every** placement — the legacy
semantics; test 2 `:435` uses the selection bar's Copy).

### 2.5 The Unassigned card today

`wall-chart-unassigned-card.tsx` renders `CampaignUnitCard` with `ou={null}` when `unassignedWorkerIds.length > 0`
(gate `campaign-wall-chart.tsx:214–225`). Unassigned = members with **no placement in any unit**
(`use-wall-chart-structure.ts:330–341`), one definition for the whole campaign; `unfilledSlots` = campaign estimate
minus named members (`use-wall-chart-view-metrics.ts:76–78`). Its toolbar carries View, Badges, Sort, Filter, Apply to
all (`:143–180`); it is a drop target (`:123`) whose drop calls `moveWorkers.mutate({ toOuId: null })` → `placements.move`
with `toOuId: null` and **no** `withinGroupId` = strip all placements (`move-worker-mutation.ts:94–97`).

### 2.6 Drag, move and remove paths today

Tile drag payload: `wall-chart-tile.tsx:154–172` (`WorkerDragRef { workerId, fromOuId, fromOuType }`, `dnd.ts:13–22`;
carries the whole selection when the tile is selected). Card drop: `campaign-unit-card.tsx:136–142` (copy cursor on
Shift), `:150–169` (`defaultPrevented` guard from D32 `:153–158`; `mode = shiftKey ? "copy" : "move"` `:167`). Handler:
`use-wall-chart-actions.ts:135–197` — no-op when every ref is already at the target (`:147–149`), the **silent
cross-`ou_type` guard** (`:151–173`), then `moveWorkers.mutate` with `toast.error` on failure (`:175–194`). Mutation
`move-worker-mutation.ts:69–159`: unassign-all (`:94–97`), copy (`:98–109`), one `placements.move` per source unit
(`:110–134`), then employer/worksite stamping and cross-campaign sync (`:136–146`), invalidations on settle
(`:153–157`). Dialog path: `copy-worker-to-unit-dialog.tsx:68–95` restricts move targets to the source `ou_type`
(custom unrestricted), offers "Unassigned (remove from all units)" (`:208`), K1 message on same-group copy. Bulk
remove: `use-wall-chart-actions.ts:201–233` (`placements.unassign({ ouId })` per unit). Sheet Units tab:
`worker-detail-sheet.tsx:1590–1610` (`setPrimary`, `removeFromUnit`, no `onError` — A8), "Add to another unit" `:1673`
→ `CopyWorkerToUnitDialog` mounted by `campaign-worker-detail-provider.tsx:206–219`. Delete dialog wording "Unassigned
only removes them from this unit" `delete-organising-unit-dialog.tsx:258`.

### 2.7 Per-browser state (the four localStorage keys the v2 chart never reads)

`wallchart:unit-visibility:<cid>` (`use-wall-chart-unit-visibility.ts:5–7`), `wallchart:displayMode:<cid>`
(`use-display-mode.ts:6`), `wallchart:subUnitView:<cid>` (`wall-chart-model.ts:111`), `wallchart:overlay:<cid>`
(`use-wall-chart-shell-state.ts:173`, `:182`). Appendix A §4 (`:263–286`) lists the rest: filters, colour-by, badges,
participation and selection are React state lost on unmount (switching to List unmounts the chart,
`workforce-board.tsx:101–105`).

### 2.8 Sync-on-open (re-cited against `8ad4c1ad`)

`workforce-board.tsx:55–79` (unchanged by the Cursor commits): `useQuery(["sync-universe-workers", campaignId])` POSTs
`/api/campaigns/[id]/sync-universe-workers` on every board mount when `canWrite` (`enabled: canWrite`, `staleTime`
5 min, `retry: false`, `refetchOnWindowFocus: false`), invalidating members and placements when `workersAdded > 0`
(`:69–72`); the JSON is otherwise discarded. The route (`app/api/campaigns/[id]/sync-universe-workers/route.ts:30–44`,
unchanged) rejects viewers and returns `{ success: true, ...result }` of `syncCampaignUniverseFromEmployersWorksites`.

**The library after `4461c2ee`** (`lib/workers/sync-campaign-universe.ts`):

- Match mode: `UniverseMatchMode = "and" | "or"` (`:31`), `CampaignUniverse.matchMode` (`:33–42`),
  `universeMatchModeFromFlags` (`:117–123`: `"or"` iff `campaigns.sector_wide` or a sector-wide `campaign_worksites` row),
  `workerMatchesCampaignUniverse` (`:125–143`: **AND by default** — every declared dimension must match; OR is the
  sector rule). Both entry points derive the mode from existing columns (`loadActiveCampaignUniverses` `:259–262`
  reads `campaigns.sector_wide`; the forward sync reads `campaigns.sector_wide` and `campaign_worksites.sector_wide`
  `:606–638`). **No schema change**: the mode is a reading of columns that predate this package.
- The control: `components/campaigns/universe-match-mode-control.tsx:11–52` ("Include other employers at these
  sites"), mounted in Who's in (`campaign-universe-section.tsx:409–418`; `orMatching` `:150–151`; the switch writes
  `campaigns.sector_wide` through `setMatchModeMutation` `:339–343`) and in wizard/settings step 2
  (`step-employers-worksites.tsx:920–930`, props `:49–53`; wired from `campaign-wizard.tsx:1679–1680` and
  `campaign-settings.tsx:1005–1006`).
- Forward sync `syncCampaignUniverseFromEmployersWorksites` (`:597–698`): upserts membership with
  `ignoreDuplicates` (`upsertMembership` `:384–399`, whose count is the number of rows **sent**, not inserted), then
  `assignOuPlacements` (`:417–446`: one `placements.assign({ source: "universe", onConflict: "skip" })` per target
  unit; counts are the RPC's `inserted` / `skipped`, D62 `wp/wp2.2.md:915`). Result `SyncCampaignUniverseResult`
  (`:583–585`) = `{ workersAdded, ouAssignmentsUpserted, ouAssignmentsSkipped }` where **`workersAdded` is
  `matching.length` (`:697`) — every matched member, not the newly enrolled ones**. A notice built on it would say
  "95 workers added" on every open of dev campaign 1; §3.14 adds a real `membersAdded`.
- Reverse sync `syncWorkersToMatchingCampaigns` (`:500–581`): for the given workers, every live campaign whose
  universe matches (`:521–524`), filtered to the ones the actor can write to (`planUniverseSyncTargets` `:472–478`,
  `campaigns_i_can_write` `:480–488`), membership upsert, then `matchingOusForWorker` (`:145–207`, one unit per
  future group, most specific wins, container parent appended) → `assignOuPlacements` — **add-if-absent only**: a
  worker who already holds a unit in that group is `skipped` (C-a), never moved. Callers: `move-worker-mutation.ts:145`
  (after `stampEmployerWorksiteFromOu` `:143` has written the target unit's employer/worksite onto the worker record,
  `sync-campaign-universe.ts:754`), `worker-detail-sheet.tsx:465`, `campaign-wizard.tsx:1006`,
  `worker-import/apply/route.ts:629`, `campaign-import/apply/route.ts:476`, `workers/batch-update/route.ts:134`,
  `workers/[workerId]/route.ts:298`, `create-worker/route.ts:309`, `add-workers/route.ts:209`.
- User-initiated forward syncs: saving employers and worksites in settings (`campaign-settings.tsx:475`), adding an
  employer or a worksite in Who's in (`campaign-universe-section.tsx:261`, `:318`).

Production evidence: one page open enrolled 334 workers and inserted 233 placements on 2026-09-14
(`PROGRESS.md:107`); the decomposition e2e spec intercepts the POST so its oracle is stable
(`tests/e2e/wall-chart-decomposition.spec.ts:26–35`). Live example behind the SM decision (§3.15): a worker in both
the Fugro bargaining campaign and the ROV sector campaign is dragged to another worksite unit in the ROV chart; the
drag stamps the new worksite on the worker (`:143`) and the reverse sync (`:145`) then only *adds* a placement in the
Fugro campaign's Worksite group — which is refused as `skipped` because the worker already sits in the old unit there.

### 2.9 Prefs and flag plumbing that exists

- `useWorkspace()` (`lib/workspace/use-workspace.tsx:32–49`, provider `:68–100`) resolves mode and modules from
  `user_profiles.workspace_prefs` and the org defaults through the pure `resolveWorkspace()`
  (`lib/workspace/resolve.ts:29–45`, rules R1–R9 `:72–135`; R2 `:76–78` returns early for admins).
- `workspace_prefs` is validated strictly on the admin write path (`lib/workspace/prefs-schema.ts:28–35`;
  `app/api/admin/update-user/route.ts:94–101`, `:161`) and parsed leniently on read (`:75–79`, unknown keys ignored).
  The Users edit dialog builds the document (`app/(dashboard)/administration/page.tsx:248–325`,
  `lib/workspace/prefs-payload.ts`).
- The e2e suite pins per-user prefs through that same API with record-and-restore (`tests/e2e/workspace-mode.ts:39–48`).
- `user_campaign_prefs` has **no reader and no writer** in `src/` (§0; comment in `useSwitcherCampaigns.ts:21`).
- Feature flags today are env-based only where they exist (`NEXT_PUBLIC_FEATURE_SOC_WIZARD`); the module/mode
  system is the programme's flag precedent (`workspace_mode`, WP1.1).
- The first-use hint `wall_chart_group_selector` is registered and marked `pending: "WP2.4"`
  (`lib/hints/registry.ts:37–44`); `useFirstUseHint` (`lib/hints/use-first-use-hint.ts:58`) and `FirstUseHint`
  (`components/hints/first-use-hint.tsx:108`) are the WP1.7 mechanism; the rating hint's wiring is at
  `worker-tile.tsx:386–392`.
- Telemetry: `trackWallchartGroupSelected` (`lib/analytics/events.ts:154–162`) with
  `GroupSelectionControl = "assessment_charts_ou_type"` (`:128`), "WP2.x can re-point it at a real group selector"
  (`WallChartAssessmentCharts.tsx:103–107`); `trackWallchartFilterApplied` with `FilterScope = "unit" | "unassigned" | "all"` (`:169`).

### 2.10 Test harness available for the v2 chart

`wall-chart/__tests__/harness/` — fixture `small` / `large` (305 members / 161 units, `fixture.ts:1–15`), fake
PostgREST edge that records `from()` chains, `upsert` (`backend.ts:150`) and `rpc()` calls with scripted answers
(`:250`), refuses direct structure writes; `mount.tsx`, `locate.ts`, `characterize.ts`. The fixture has no
`campaign_groups` / `user_campaign_prefs` rows yet (§4.3 adds them). The fake ignores `.eq/.select/.order`
(WP2.3 open advisory 35), which matters for the prefs read (§4.3 pins the filter by recording the chain).

### 2.11 Appendix A reconciliation

Appendix A §9 (`:365–396`) was written when the group key was `ou_type`; WP2.1 made the group an entity
(`campaign_groups`) and put `group_id` on units and placements, so (a) "per-group view selector" keys on `group_id`,
not `ou_type`; (b) "per-group unassigned" needs no synthetic scope keys because the v2 chart has **one** scope;
(c) "not in any group" is the view's `ou_id IS NULL` for every group. The three definitions of Unassigned
(`:391–393`) are reconciled in code by one pure derivation (§3.3) that WP2.6 and WP2.7 consume. No appendix claim
turned out wrong in a way that changes the design.

---

## 3. Target design

### 3.1 Principles

1. **One flag, two shells.** `WorkforceBoard` mounts `CampaignWallChartV2` when `groups_v2` is on and the legacy
   `CampaignWallChart` otherwise. Nothing else in the product branches on the flag; the sync-on-open notice (§3.14)
   is flag-independent by the operator's decision.
2. **Legacy path byte-for-byte.** No legacy composition file (`campaign-wall-chart.tsx`, `wall-chart-header.tsx`,
   `wall-chart-unit-hierarchy.tsx`, `wall-chart-unassigned-card.tsx`, `wall-chart-dialogs.tsx`, the four hooks) is
   edited except where a v2 need is met by an **additive, default-preserving** prop or field named in §7 (each such
   edit is recorded in §8.3 if it goes beyond that list). Every WP2.3/WP2.2 test stays green unchanged. WP2.8
   deletes the legacy path with the flag.
3. **Leaf components are reused; compositions are not.** `CampaignUnitCard`, `WallChartTile`/`WorkerTile`,
   `WallChartFilterBar`, `AssessmentSelector`, `ListBadgeSelector`, `ParticipationSelector`, `WorkerSearch`,
   `WallChartUnitManager`, `UnitRatingControl`, `UnitSummaryMetrics`, `WallChartSummaryHeader`, `RelationshipOverlay`,
   `BuildListPanel`, `WallChartSelectionBar`, and every dialog are mounted by the v2 shell with props it computes.
   The v2 shell has its own header, band, Unassigned card, Not in any group view and dialog wiring.
4. **One pipeline.** Filter → sort → metrics runs once per rendered card from one filter state and one colour-by;
   there are no per-scope maps, no `UNASSIGNED_KEY`, no `applyToAllScopes`, no parent walk.
5. **Derived, never stored.** Unassigned and Not in any group are pure functions of members, units and placements;
   no row, no synthetic unit, no negative id.
6. **Server-side view state.** Group, colour-by, filter, sort, participation, %/#, hidden units, Show empty units,
   Links and badges live in `user_campaign_prefs.prefs.wallChart`; the group is also in `?group=`. The v2 chart
   reads no `wallchart:*` localStorage key.
7. **Writes only through the structure API**, and only through calls that already exist: `placements.move`
   (now with `withinGroupId`), `placements.unassign({ withinGroupId })`, `units.update` (name / estimate), plus the
   dialogs' existing calls. The guard test stays green; no RPC changes; no migration.
8. **Pure first.** Group derivation, selection resolution, prefs parsing/merging, filter serialisation, the drop
   planner and the "in unit of another group" filter are pure functions under `src/lib/campaign/groups/` with vitest
   beside them.
9. **Terminology** per plan §3.6 in every new string: Group, Unit, Unassigned, Not in any group, Colour by.

### 3.2 `groups_v2` — definition, default, where it is read

Options:

- **FL-a** Build-time env (`NEXT_PUBLIC_GROUPS_V2=1`), set on Vercel for the Preview environment only. Simplest, but
  it flips every preview at once (the legacy e2e specs would run against v2 and fail: `structure-api.spec.ts` test 1
  and 2 assert legacy drag/copy semantics), cannot be turned on for a pilot user in production without a redeploy,
  and is a new mechanism the programme does not have.
- **FL-b (recommended)** Per-user flag in the existing `user_profiles.workspace_prefs` document:
  `{ "flags": { "groups_v2": true } }`. Default off (absent). Set by an admin through the existing
  `PATCH /api/admin/update-user` (strict schema gains an optional `flags` object) and a checkbox "Groups v2 (wall
  chart preview)" in the Users edit dialog; read by `resolveWorkspace()` as a new rule **R10** that runs before R2's
  admin early-return (admins, including the operator, can be flagged on); exposed as `useWorkspace().flags.groupsV2`.
  The e2e suite pins it per spec exactly as it pins the mode (§4.5), so legacy specs keep running against the legacy
  chart on the same preview. Production stays off for everyone until the operator ticks a user; WP2.8 removes the
  key and the path. No migration (jsonb column, WP1.1).
- **FL-c** Org-wide `app_settings` key via a new RPC — needs a migration and the promotion gate for a flag the
  programme will delete in WP2.8. Not recommended.

Definition under FL-b:

- `lib/workspace/prefs-schema.ts` — `prefsShape.flags = z.object({ groups_v2: z.boolean().optional() }).strict().optional()`
  (strict admin path and lenient reader both accept it; unknown flag names are rejected on write, dropped on read).
- `lib/workspace/resolve.ts` — `ResolvedWorkspace.flags: { groupsV2: boolean }`; R10: `groupsV2 = parseWorkspacePrefs(userPrefs)?.flags?.groups_v2 === true`,
  computed first and carried through every return (`:78`, `:113`, `:118`, `:135`). Off when there is no profile.
- `lib/workspace/use-workspace.tsx` — `flags` on the context value; `DEFAULT_VALUE.flags = { groupsV2: false }`.
- **One reader module:** `src/lib/flags/groups-v2.ts` exporting `useGroupsV2(): boolean` (= `useWorkspace().flags.groupsV2`)
  and, for pure code, `isGroupsV2(flags)`. Consumers: `workforce/workforce-board.tsx` (shell choice only; the sync-on-open notice is flag-independent, §3.14).
  The grep in §5 proves no other consumer.
- Admin UI: `app/(dashboard)/administration/page.tsx` Users dialog — one `Checkbox` bound to `flags.groups_v2`,
  included in the outgoing `workspacePrefs` document by `lib/workspace/prefs-payload.ts`. Tests in
  `lib/workspace/__tests__/` cover R10 (default off, admin on, unknown flag dropped, strict write rejects unknown).

### 3.3 The group model as consumed

Reads (all through the untyped browser client, RLS applies; no writes):

- `["campaign-groups", campaignId]` — `campaign_groups` `select("group_id, kind, name, display_order")`
  `.eq("campaign_id", id).order("display_order").order("group_id")` (policy `campaign_groups_select` is `true` for
  `authenticated`, `20260912035329:460–463`).
- Units, members, placements, rating summary, activity ratings, leader links, coverage, list activity, data fields
  and facts: the **same queries and keys** as the legacy blocks B and C (`use-wall-chart-core-data.ts:64–81`,
  `:169–195`; `use-wall-chart-structure.ts:53–65`, `:110–118`, `:120–131`), so React Query caches are shared with the
  legacy chart and the list view (`workforce-list-view.tsx:173–223`) and the "no more queries than today" standard
  holds. `WallChartOU` gains `group_id?: number | null` (`types.ts:127–143`, additive); the `select("*")` already
  returns it.
- `campaign_group_membership` is **consumed as the oracle**, not as a render source: the e2e specs and the §4.1
  equivalence test define Unassigned by it; the chart derives the same rows client-side from data it already holds
  (a members × groups read would duplicate three queries' worth of rows). WP2.6/2.7 may read the view directly where
  they have no members query; both derive-and-view give identical answers by the §4.1 test.

Pure derivations (`src/lib/campaign/groups/derive-group-view.ts`):

```ts
unitsOfGroup(ous, groupId)                      // ous with group_id === groupId, ordered by display_order, name
deriveGroupView(members, ous, placements, groupId) // → { units, workersByUnit, unassignedWorkerIds, placementByWorker }
notInAnyGroup(members, ous, placements)          // members with no placement on any unit that has a group_id
groupOfUnit(ous, ouId)                            // group_id | null
```

Semantics: a placement belongs to group G iff its unit's `group_id === G` (identical to the trigger-derived column);
`unassignedWorkerIds(G)` = members with no such placement (= view rows with `ou_id IS NULL` for G); `notInAnyGroup` =
members with none in any group (= `ou_id IS NULL` on every group row). A placement on a legacy container with
`group_id NULL` counts for no group and so does not remove a worker from Not in any group; the §4.1 test pins this
and the risk table notes it. Units of a group are sorted by `display_order, name` as today (`use-wall-chart-structure.ts:60–61`).

Containers under v2: an Employer container with `group_id` is an ordinary unit of the Employer group (it holds the
materialised placements); its worksite children are ordinary units of the Worksite group; `parent_ou_id`,
`is_group_container` and `ou_group_id` are not read by the v2 band. A custom-kind container (`group_id NULL`) is not
rendered in any group; its member units are. The Units manager under v2 does not treat containers specially.

Empty structure (decision 4): zero groups → the selector shows only "Not in any group", selected, and the whole
membership renders as one flat grid with the sentence "This campaign has no groups yet. Add units in Setup to start
placing people." (no error state). Groups with no placements → every unit card empty, the Unassigned card holds
everyone; with "Show empty units" off the empty cards are hidden and the toolbar shows "N empty units hidden".

### 3.4 Files and composition of the v2 chart

- `components/campaigns/campaign-wall-chart-v2.tsx` — shell (target ≤ 320 lines like the legacy shell): blocks A′–F′
  below, `WallChartSummaryHeader` (reused; `assessmentSelector` slot carries the Colour by control), the band, the
  charts card (unchanged), print, dialogs.
- `wall-chart/v2/use-wall-chart-groups.ts` (A′ addition) — groups query; selection resolution (§3.11); setter that
  writes `?group=` and prefs; `?ou=` handling.
- `lib/hooks/useUserCampaignPrefs.ts` (shared with WP2.5/2.6) — prefs read/merge/write (§3.11).
- `wall-chart/v2/use-wall-chart-group-view.ts` (C′/D′) — calls `deriveGroupView`, applies hidden/empty rules, builds
  the **group-scoped tile index** (`unitsByWorker` restricted to the selected group so `WallChartTile`'s
  `inMultipleUnits` is false without changing the tile), the single filter/sort/participation state, metrics per
  unit, Unassigned and campaign with one colour-by.
- `wall-chart/v2/use-wall-chart-actions-v2.ts` (F′) — drop planner → `useMoveWorkersMutation` (§3.9), Remove from
  group, Select all, ⋯ menu actions.
- `wall-chart/v2/wall-chart-toolbar.tsx`, `group-selector.tsx`, `filter-chips.tsx`, `wall-chart-group-band.tsx`,
  `wall-chart-unassigned-card-v2.tsx`, `not-in-any-group-view.tsx`, `unit-card-menu.tsx`, `edit-unit-dialog.tsx`
  (MN-a), `move-to-unit-dialog.tsx`, `wall-chart-dialogs-v2.tsx`.
- Reused unchanged: blocks A (shell state — build-list URL, sticky, selection, dialogs state, `useMoveWorkersMutation`),
  B (core data; the v2 shell simply never renders the per-unit override controls, so the maps stay empty), the tile,
  the card, the leaf controls and dialogs listed in §3.1 principle 3.

### 3.5 Toolbar (one row inside the sticky header; left → right)

1. **Group** — `Select` labelled "Group"; options = groups in display order, then "Not in any group". Always shown.
   Changing it: `trackWallchartGroupSelected({ control: "group_selector", … })` (union extended), URL + prefs write,
   selection cleared. First-use hint `wall_chart_group_selector` anchored here (§3.16).
2. **Show empty units** — switch, default off; hides units of the selected group with zero visible workers after
   filtering; shows "N empty hidden" text when any are hidden. Persisted.
3. **Colour by** — the existing `AssessmentSelector` with its trigger label "Colour by"; value = the campaign-wide
   `campaignAssessmentDefault` (block B); persisted as `colourBy` (§3.11). The hint sentence `wall-chart-header.tsx:140–149`
   is replaced by "Tile colour shows each worker's rating for <title>; click a rating to change it."
4. **Filter (n)** — one `WallChartFilterBar` (`compact` variant) whose popover contains: Sort (as today `:151–165`),
   the existing sections, a new **Participation** section hosting `ParticipationSelector`, a new **In unit of another
   group** section (checkbox per unit, grouped by the other groups), Clear. `onApplyToAll` is not passed, so
   "Apply to all units" (`:404–413`) does not render. Active filters render as **chips** (`filter-chips.tsx`) from
   `activeFilterKeys` (`filters.ts:141–152`) plus the two new keys; each chip has a remove ×.
5. **Search** — `WorkerSearch` (§3.12).
6. **% / #** — `WallChartSummaryHeader` mode toggle; persisted.
7. **Links** — overlay toggle; persisted.
8. **Badges** — campaign-wide `ListBadgeSelector`; persisted.
9. **Add worker**, **Import Workers** — unchanged.
10. **Units (n)** — `WallChartUnitManager` over the selected group's units (§3.12).
11. `compareSlot` — empty in WP2.4.

The **selection bar** keeps: count, Add to build list (when open), **Move to unit…** (opens `move-to-unit-dialog`),
**Remove from &lt;group&gt;** (only when some ref has a unit), Clear ratings…, Link to leader…, Clear. Copy is gone
(CP-a). In the Not in any group view, Move to unit… lists every unit across groups labelled "Group › Unit".

### 3.6 Unit card, card menu, card description

`CampaignUnitCard` is reused with: `ou`, `workerCount`, `estimate`, `placeholders`, `assessmentLabel` (the
campaign-wide title or "Cumulative"), `ratingControl` (`UnitRatingControl`), `headerBadges` (coverage / WOC as today),
`summary` (`UnitSummaryMetrics`), `onWorkerDrop`, and a `toolbar` that holds **only** the ⋯ menu. The count in the
header becomes a button ("Select all in unit" / "Deselect all") — a `countAction` prop on the card is additive and
default-off; if the reviewer prefers no card edit, the count button renders inside `toolbar`.

⋯ menu (`unit-card-menu.tsx`, write-gated): **Rename…** and **Set estimate…** (MN-a: `edit-unit-dialog.tsx` → one
`units.update({ ouId, patch: { name } | { total_workers_estimated } })`, both keys are in the RPC whitelist,
`20260914090000:1879`; toast via `structureErrorMessage`), **Assign people…** (the existing Add worker dialog with
the unit as context), **Split…** (existing dialog), **Merge…** (existing `MergeUnitsDialog`, today mounted only in
the Units tab `campaign-units-section.tsx:70`, `:2387`; here with this unit as source and survivor choices limited
to the same group), **Delete…** (existing dialog). MN-b would drop Rename/Set estimate to WP2.7 and keep the menu to
four items; MN-a is recommended because plan §5.6 lists them on the card, the RPC exists and the dialog is small.

Card description (v2 shell): "Each card is a Unit of the selected Group. Unassigned holds members not yet placed in
this Group. Tile colour follows Colour by; click a name to open the worker, drag a tile to move it within the Group."

### 3.7 Per-group Unassigned card

Rendered **last** in the band (plan `:291`) whenever the selected group is a real group, even when empty (the empty
state reads "Everyone in this Group is placed in a Unit"). Title "Unassigned in &lt;Group&gt;"; `unfilledSlots` =
campaign estimate − named members, shown here only (as today, §2.5). Drop target: `handleDrop` → `placements.move({
workerIds, toOuId: null, withinGroupId: G })` through `useMoveWorkersMutation` with a new optional `withinGroupId` on
`MoveWorkerVars` (`move-worker-mutation.ts:12–38`; passed at `:97`; legacy callers never set it, so their behaviour is
unchanged — this is the reserved parameter of `wp/wp2.2.md` §3.11 row 1). No toolbar. Bulk actions and the build-list
drag handle work as on a unit card. Hundreds of tiles: the same grid as today; the §4.4 render-cost test covers
305 members all Unassigned (decision 4).

### 3.8 Not in any group view

Selected from the Group selector (`?group=none`). One flat grid of `notInAnyGroup(...)` in one `CampaignUnitCard`
titled "Not in any group" with count; no drop targets on screen (tiles are not draggable: `onDragStartRefs`
undefined); selection works; the selection bar offers Move to unit… (all units, grouped), Add to build list, Link to
leader, Clear ratings. Filter, Colour by, Search apply. Empty state: "Everyone is in at least one Group."

### 3.9 Drag rules (plan §5.6 / §5.5) and copy

Pure planner `lib/campaign/groups/plan-drop.ts`:
`planDrop({ refs, targetOuId, groupId, workersByUnit }) → { kind: "noop" } | { kind: "move", perSource: Map<fromOuId|null, workerIds[]>, toOuId } | { kind: "unassign", workerIds, withinGroupId }`.

- A drop on unit U of the selected group G: for every ref, `fromOuId` = the worker's unit in G (or `null`); refs
  whose `fromOuId === U` are dropped (no-op as today `use-wall-chart-actions.ts:147–149`); the rest become one
  `placements.move({ workerIds, fromOuId, toOuId: U })` per source (the RPC displaces any other placement in G — C-b —
  and inserts from Unassigned; `keepInParent` is left at its default). The **cross-`ou_type` guard is not
  reproduced**: every unit on screen is in G, and the RPC is the authority.
- A drop on Unassigned: `placements.move({ workerIds, toOuId: null, withinGroupId: G })` (C-d) — removes the
  worker's placement in G only (`20260914090000:2669–2705`).
- **CP-a (recommended):** no copy. The v2 handler ignores `mode` (Shift produces the same move); the selection bar has
  no Copy; the tile's right-click opens `move-to-unit-dialog` (targets: units of G + "Unassigned in G"). Cross-group
  placement is done in the sheet ("Add to another unit", copy-locked `CopyWorkerToUnitDialog`, where a same-group
  target already yields the K1 sentence) or by switching group and dragging. CP-b would keep Shift-copy and the
  Copy button restricted to cross-group targets; it contradicts plan `:310` and keeps the ◫ semantics alive.
- Failures toast through `structureErrorMessage` (as today `:190–192`); a successful move clears the selection.
- Employer/worksite stamping and the cross-campaign sync after a move stay as they are (`move-worker-mutation.ts:136–146`).

### 3.10 Colour by and Filter, campaign-wide

- Colour by = block B's `campaignAssessmentDefault` (`use-wall-chart-core-data.ts:91–92`); the v2 tile context passes
  **empty** override maps, so `effectiveAssessmentForScope` and `effectiveBadgesForScope` resolve to the campaign
  values without any change to `wall-chart-tile.tsx` or `wall-chart-model.ts`. Ratings loaded = the colour-by
  assessment plus any assessment named by the single filter (`:152–165` already unions over the maps; v2 feeds one).
- Filter = one `WallChartFilterState` (`filters.ts:66–83`) extended additively with
  `otherGroupUnitIds: Set<number>` ("in unit of another group": keep a worker iff they hold a placement on one of
  these units) and `participation: ParticipationSource` (moved from view-metrics state; the predicate is computed as
  today `use-wall-chart-view-metrics.ts:137–145`). `DEFAULT_FILTER_STATE`, `hasActiveFilter`, `activeFilterKeys` and
  `applyFilters` gain the new dimension; existing callers pass states without it (defaults), so the legacy chart and
  its 25 filter tests are unaffected. `applyFilters` receives `unitsByWorkerAllGroups` for the new predicate (an
  optional trailing argument).
- Sort lives inside the Filter popover as today; one sort for the whole chart.
- Telemetry: `trackWallchartFilterApplied({ scope: "campaign", … })` (`FilterScope` union extended).

### 3.11 State: `?group=` and `user_campaign_prefs` — no migration

**URL.** `?group=<group_id>` or `?group=none`. Written with `router.replace(…, { scroll: false })` preserving other
params (the pattern of `use-wall-chart-shell-state.ts:57–74` and `page.tsx:207–210`). On first render the resolved
selection is written to the URL when the param is absent or invalid, so a copied link always carries the view.
`?ou=<id>` (`use-wall-chart-shell-state.ts:145–147`) wins on first render: the focused unit's group becomes the
selection, then the existing scroll-and-highlight effect runs (`use-wall-chart-structure.ts:74–87`).

**Resolution** (`lib/campaign/groups/resolve-group-selection.ts`, pure, tested): `?ou=` unit's group → valid `?group=`
→ prefs `group` if it still exists → first group by `display_order` → `"none"`. Invalid values never throw; they
fall through.

**Prefs document** (PR-a, recommended — **no migration**): the existing `user_campaign_prefs.prefs` jsonb holds
`{ "wallChart": { … } }` beside any key later packages add. Schema `lib/campaign/groups/wall-chart-prefs.ts` (zod, the
strict/lenient pattern of `prefs-schema.ts`):

```ts
wallChart: {
  v: 1,
  group?: number | "none",
  colourBy?: { kind: "cumulative" } | { kind: "assessment", activityId: number },
  filter?: SerialisedFilter,            // Sets → sorted arrays; fact/assessment filters as stored today
  sort?: SortKey, sortFactFieldId?: number | null,
  participation?: ParticipationSource,
  showEmptyUnits?: boolean,
  displayMode?: "pct" | "count",
  hiddenOuIds?: number[],
  overlay?: boolean,
  badges?: ListActivityChannel[],
  // reserved, written by later packages: compare (WP2.5), layout (WP2.6)
}
```

Lenient parse on read (unknown keys ignored, malformed → defaults, an `activityId` that no longer exists → cumulative,
a `group` that no longer exists → fall through). **Read:** `useUserCampaignPrefs(campaignId)` →
`useQuery(["user-campaign-prefs", campaignId])`, `from("user_campaign_prefs").select("prefs").eq("campaign_id", id).maybeSingle()`
(RLS `ucp_select` returns only the caller's row). **Write:** `upsert({ user_id, campaign_id, prefs }, { onConflict: "user_id,campaign_id" })`
with `user_id` from `useAuth().user.id` (`lib/supabase/auth-context.tsx:32`), merging the `wallChart` key into the
last-read document so other keys survive; `useAuthAwareMutation`; filter/sort writes debounced 400 ms, everything
else immediate; optimistic cache update so the UI never waits for the round trip; a refused write toasts once and the
UI keeps its in-memory state. Two tabs of one user are last-write-wins (recorded in §8.2).

PR-b (a typed column per preference, or a `campaigns.default_group_id`) would need a migration and the promotion
gate for state that is per user and opaque by WP2.1's design (`20260912035329:830–831`); not recommended. A
campaign-level default group, if ever wanted, is a WP2.7 editor concern.

**Migration needed: no.** Nothing in this package changes the schema, so the promotion gate, run sheets, `gen:types`
and the Supabase GitHub-integration switch do not apply. The merge to `main` deploys code that is inert for every
user without the flag.

### 3.12 Worker search and the Units manager with hidden units (appendix A §2.3 acceptance)

- **Hidden units (HU-a, recommended):** the hidden set is `prefs.wallChart.hiddenOuIds` (per user, server-side), edited
  by the Units manager; "Show all" clears it. The manager's sentence becomes "Hidden units are remembered for you on
  every device. Ordering is saved for everyone." Units of *other* groups are neither listed nor affected. A hidden unit
  still counts in nothing (there are no roll-ups). **Show empty units** is a separate, also-persisted toggle (§3.5).
  HU-b (drop the hidden set, keep only Show empty units) is simpler but fails the acceptance criterion as written.
- **Units manager** under v2 lists the selected group's units in `display_order`; move up/down calls `units.reorder`
  with the group's ids in their new order (`structure_unit_reorder` sets `display_order` = array position for the ids
  given; other groups' units are untouched — recorded in §8.2 because the legacy chart orders globally); delete opens
  the delete dialog; New unit opens the create dialog. No container special-casing.
- **Worker search** items carry the worker's unit **in the selected group** (or "Unassigned" / "Not in any group");
  choosing a worker un-hides that unit if hidden (prefs write), scrolls to and highlights the card (`data-ou-id`
  contract kept: a unit id, `"unassigned"`, or `"not-in-any-group"`), opens the sheet. In the Not in any group view a
  worker who has a unit is opened in the sheet with no highlight (they are not on screen).

### 3.13 Tiles, sheet and dialogs

- Tiles: `WallChartTile` unchanged; the v2 context passes a **group-scoped index** (`unitsByWorker` = placements in the
  selected group only), so `inMultipleUnits` is false and the ◫ indicator (`worker-tile.tsx:412`) and "Also in" title
  (`:196–197`) do not render. `fromOuType` in drag refs is still filled (harmless).
- Sheet Units tab: unchanged except **A8** — `setPrimary` and `removeFromUnit` (`worker-detail-sheet.tsx:1590–1610`)
  gain `onError: (e) => toast.error(structureErrorMessage(e, …))`. The Units tab lists every placement with its group
  name as a prefix ("Worksite › KGP") — one `groupNameById` prop, additive.
- "Add to another unit" (`CopyWorkerToUnitDialog`, copy-locked, `campaign-worker-detail-provider.tsx:206–219`): under
  v2 the dialog receives `groups` and disables targets in a group where the worker already has a unit, with the
  sentence "Already in this group — use Move." shown inline (the K1 sentence, `structure-error-message.ts:19`); the
  legacy path passes nothing and behaves as today. Additive prop.
- `move-to-unit-dialog.tsx` (new, v2): move-only; targets = units of the selected group + "Unassigned in &lt;Group&gt;";
  calls the same planner as a drop.
- Delete dialog: the reassignment target list is already group-aware through `ou-reassignment-targets.ts:35–37`
  (`ou_group_id` for container members) or same-type; under v2 the shell passes `sameGroupOnly` targets
  (`unitsOfGroup`) via the existing `ous` prop, so no edit is needed; the sentence `:258` reads "Unassigned only
  removes them from this Unit" (terminology only, legacy-safe).

### 3.14 Sync-on-open — decided: SY-c, kept and announced (operator, 2026-09-15)

The options as put to the operator: **SY-a** keep silent; **SY-b** not issued on the v2 board (the planner's
recommendation); **SY-c** keep but announce. **The operator rejected SY-b** ("on balance auto sync") and asked for a
visible notice of what the sync changed whenever a user opens a wall chart. SY-c is therefore the decision, designed as
follows. It applies to **both** chart paths and to the List layout, because the query lives in the board they share;
this is a deliberate, operator-approved visible change in full mode (§3.1 principle 1 note).

**Counts.** The route already returns D62's counts; one field is added so the notice is truthful:

- `lib/workers/sync-campaign-universe.ts`: `SyncCampaignUniverseResult` gains **`membersAdded: number`** — computed
  by reading the campaign's existing `campaign_worker_membership.worker_id` set (one paged select through
  `fetchAllRows`, the file's own idiom `:641–660`) before `upsertMembership` and counting matched workers not in it.
  `workersAdded` is kept with its current meaning (matched members) so no caller changes; the route spreads the new
  field automatically (`{ success: true, ...result }`). Additive: ~15 lines and one test. (This is the only WP2.4 edit
  to the file the Cursor session touched; §8.4 item 11 covers a collision.)
- The notice reads `membersAdded`, `ouAssignmentsUpserted` (placed in units) and `ouAssignmentsSkipped` (already
  placed in a unit of that group, or already on the unit). When WP2.4b lands (§3.15) it also reads the optional
  `placementsMoved` and `manualPlacementsKept`, absent today.

**Component.** `components/campaigns/workforce/sync-on-open-notice.tsx` — a dismissible inline notice
(`role="status"`, `aria-live="polite"`, Card-styled, Dismiss ×) rendered by `WorkforceBoard` between the view toggle
row and the layout (`workforce-board.tsx:82–105`), above either the chart or the list. Inline rather than a toast so
it stays until read, and rather than a modal so it never blocks the chart; if the operator prefers a modal the same
message goes into an `AlertDialog` (`components/ui/alert-dialog.tsx`), one-line swap. Shown **only when something
changed**; dismissed state is React state for the mounted board (a fresh open re-runs the query after `staleTime`
and may show a new notice; nothing is persisted).

**Message** (pure, `lib/workers/sync-notice-message.ts`, `syncNoticeMessage(result): string | null`):
"Sync on open: 12 workers added to this campaign, 9 placed in units, 3 already placed." — each clause only when its
count is > 0, singular/plural handled, `null` when every count is 0 (then nothing renders). With WP2.4b: ", 2 moved to
match their current site, 1 kept where an organiser placed them".

**Board changes** (`workforce-board.tsx`): the query's `queryFn` keeps its shape; `onSuccess`-equivalent logic moves
into the render (`data` from `useQuery`): invalidate members/placements when `membersAdded > 0 || ouAssignmentsUpserted > 0`
(today: `workersAdded > 0`, `:69–72`, which is almost always true and refetches on every open); render
`<SyncOnOpenNotice result={data} />`. `enabled: canWrite`, `staleTime` and `retry` unchanged. The v2 shell choice is
the only other change in this file.

**Tests.** `lib/workers/__tests__/sync-notice-message.test.ts` (every clause combination, plural forms, null on
zero, ignores unknown keys); `sync-campaign-universe.test.ts` + 1 case (`membersAdded` counts only new members; the
existing 53 cases unchanged); `workforce/__tests__/workforce-board.test.tsx` (mounts the board with a scripted route
answer: notice text present when counts > 0, absent when all zero, Dismiss removes it, the two invalidations fire
only when something changed; with the flag on, the v2 shell mounts and the notice still renders). The e2e checklist
(§4.5 step 5) intercepts the POST with a scripted non-zero result and looks for the sentence.

### 3.15 SM — cross-campaign mirror (operator requirement, 2026-09-15; recommendation SM-a as WP2.4b)

**The requirement.** "If a worker is a member of multiple campaigns (live example: Fugro bargaining and ROV sector
campaigns) and a Fugro worker is updated to a different unit in the ROV campaign, that should be reflected in any
compatible units in the Fugro campaign." Today (§2.8) the drag stamps the worker's new worksite/employer and the
reverse sync adds with `skip`, so the Fugro campaign keeps the stale unit.

**Options.**

- **SM-a (recommended)** Mirror as a **move**, only over placements the sync itself owns: in every matching, writable
  campaign, for every group in which the worker has a compatible unit U (`matchingOusForWorker`), if the worker's
  existing placement P in that group is `assignment_source = 'universe'` and `P.ou_id ≠ U`, move it
  (`placements.move({ campaignId, workerIds: [w], fromOuId: P.ou_id, toOuId: U })`, one call per (campaign, source
  unit); the RPC re-points the row so its `universe` provenance travels with it — `structure_placements_move`
  `20260914090000:2858–2859`); if P is `manual` or `rule`, leave it and count it (`manualPlacementsKept`); if there is
  no P, assign as today. Organisers' deliberate placements are never overridden by a drag in another campaign; the
  sync only corrects what the sync created.
- **SM-b** Add-if-absent only (today). Does not meet the requirement.
- **SM-c** Always move, whatever the source. Meets the requirement literally but lets a drag in a sector campaign
  silently undo a hand placement in a bargaining campaign, and fights Recompute's `rule` rows.

**Rule under SM-a, stated once (pure, `lib/workers/reconcile-placements.ts`):**
`planReconcile({ desiredByGroup, existingByGroup }) → { assign: [...], move: [...], keep: [...], skip: [...] }` per
(campaign, worker): `desired` from `matchingOusForWorker`; `existing` from one paged read of `campaign_worker_ou`
`select("ou_id, worker_id, group_id, assignment_source")` for the worker ids and the target campaigns' units
(`group_id` is on the row since WP2.1, `20260912035329:513`). Applied by both entry points: the reverse sync
(`syncWorkersToMatchingCampaigns`, the drag/edit/import path — the operator's case) and the forward sync
(`syncCampaignUniverseFromEmployersWorksites`, page open), so a stale universe placement is corrected the next time
either runs. Every write stays inside the structure API (`placements.assign`, `placements.move`); no RPC or migration.

**Notice wording.** Page open (§3.14): ", 2 moved to match their current site, 1 kept where an organiser placed
them". After a drag in the source campaign: a `sonner` toast from `move-worker-mutation.ts` using the same helper on
the reverse sync's result — "Also updated in 1 other campaign: 1 moved, 1 kept where an organiser placed them." —
only when `campaignsTouched > 0` and something moved or was kept.

**Tests.** `reconcile-placements.test.ts` (assign / move / keep / skip per source; two groups; a worker whose desired
unit is the one they are on; a target campaign the actor cannot write to is untouched); `sync-campaign-universe.test.ts`
cases pinning one `structure_placements_move` per (campaign, source unit) with `p_from_ou_id` and `p_to_ou_id`, and
that a `manual` row produces no RPC; a contract case on dev (`structure-api.contract.test.ts`) that a moved
`universe` row keeps its source (already implied by the RPC's re-point; pin it); the e2e checklist gains a two-campaign
step only if dev has a worker in two campaigns with worksite units in both (otherwise a unit-test-only acceptance,
stated as such).

**Scope decision: WP2.4b, a bounded follow-up.** Not inside WP2.4 because (1) it changes a writer's behaviour for
every campaign regardless of `groups_v2` — it is a data rule, not a chart feature — and deserves its own reviewer
pass and its own PR that the operator can hold or revert independently of the chart; (2) `sync-campaign-universe.ts`
is the file a parallel Cursor session edited today (`PROGRESS.md:102`) and the ledger has asked the operator whether
that continues — WP2.4 keeps its own edit there to the 15-line `membersAdded`; (3) WP2.4's four stages already carry
the jsdom, e2e and review surface of a new chart. WP2.4b: branch `feat/oux-wp2.4b-cross-campaign-mirror` off `main`
after WP2.4 merges (or in parallel, since it touches only `lib/workers/*`, `move-worker-mutation.ts:136–146` for the
toast, and the notice helper), high-risk implementer, Fable review, no migration, contract case on dev, acceptance
by the operator on the branch preview with the Fugro/ROV pair recreated on dev if the operator supplies the ids.
WP2.4 prepares for it by making the notice helper accept the two optional counts.

### 3.16 Telemetry and the first-use hint

- `GroupSelectionControl` gains `"group_selector"`; `FilterScope` gains `"campaign"`. Event names unchanged so the
  phase-0 baseline series continues (`WallChartAssessmentCharts.tsx:103–107`).
- `wall_chart_group_selector` hint (`registry.ts:37–44`): rendered by `FirstUseHint` around the Group select, shown
  when `useFirstUseHint("wall_chart_group_selector", { hasTiles: true, canWrite })` says so; dismissal is the WP1.7
  row. The e2e global setup already seeds only `wall_chart_rating`; the v2 spec seeds this id too before it runs
  (`hint-dismissals.ts:42–51` pattern) so the popover never coexists with a drag.

### 3.17 WP2.2 rows carried to WP2.4 — disposition (CA-a, approved 2026-09-15)

| Row | Disposition |
|---|---|
| **A8** — sheet `setPrimary` / `removeFromUnit` have no `onError` | **Done in WP2.4** (§3.13). |
| **A5** — one intent, three conflict policies | **Decided in WP2.4, as policy:** a dialog where the user picked specific workers uses `onConflict: "error"` (nothing partial; the K1/duplicate sentence names the worker), every bulk or automatic path uses `"skip"` and reports the skipped count. The units-section assign dialog (D49) already follows the first rule; the toolbar (D46), the grid (D43) and rows 16–18/21 (D66) the second. No code change in WP2.4; WP2.7 applies the policy to the editor it builds. |
| **A3** — create dialog drops `moved`/`displaced` counts | **Re-carried to WP2.7**, which replaces `create-organising-unit-dialog.tsx` (spec `:154`); a one-line change now would be edited twice. |
| **A4** — settings units-save toast for a delete-context `23505` | **Re-carried to WP2.7**, which replaces the settings units section. |
| **D72** — membership rewritten before a refused placement save | **Re-carried to WP2.7**: the wizard step 6 / settings allocation save is the editor's, and the fix (one membership-aware transaction) is a design choice for that package. |

CA-b (do A3/A4/D72 here) would touch three files WP2.7 owns; the operator approved CA-a on 2026-09-15.

### 3.18 File boundaries with WP2.5, WP2.6, WP2.7, WP2.8 and WP2.4b (so they can run in parallel)

| Package | Owns (may edit) | Consumes from WP2.4 (must not edit) |
|---|---|---|
| **WP2.4** | `campaign-wall-chart-v2.tsx`, `wall-chart/v2/**`, `lib/campaign/groups/**`, `lib/hooks/useUserCampaignPrefs.ts`, `lib/flags/groups-v2.ts`, `lib/workspace/{prefs-schema,resolve,use-workspace,prefs-payload}.ts` (flag), `administration/page.tsx` (checkbox), `workforce-board.tsx` (shell choice + sync gate only), additive edits listed in §7 | — |
| **WP2.5** Compare | `wall-chart/compare/**`, the toolbar's `compareSlot`, prefs key `compare`, the band's "matrix" mode | selector, prefs hook, `deriveGroupView`; must not edit `wall-chart/v2/wall-chart-toolbar.tsx` beyond filling the slot |
| **WP2.6** List | `workforce/workforce-list-view.tsx`, `workforce-bulk-toolbar.tsx`, `lib/campaign/workforce-view.ts`, the `ViewToggle` in `workforce-board.tsx`, prefs key `layout` | `useUserCampaignPrefs`, `resolveGroupSelection`, `deriveGroupView`, `notInAnyGroup`, the serialised filter — all from `lib/`, never from `components/campaigns/wall-chart` |
| **WP2.7** Editor | `campaign-units-section.tsx`, `campaign-wizard.tsx`, `campaign-settings.tsx`, `step-campaign-units.tsx`, `create-organising-unit-dialog.tsx`, `lib/campaign/structure-save.ts`, new `setup/**` | `unitsOfGroup`; the ⋯ menu's Rename/Set estimate dialog may be replaced by the editor's; A3/A4/D72 |
| **WP2.4b** Cross-campaign mirror (§3.15) | `lib/workers/sync-campaign-universe.ts`, new `lib/workers/reconcile-placements.ts`, `move-worker-mutation.ts:136–146` (toast), their tests, one contract case | `lib/workers/sync-notice-message.ts` (optional counts already accepted) |
| **WP2.8** | deletes the legacy shell, header, hierarchy, Unassigned card, dialogs, hooks, `wall-chart-model.ts` scope helpers, the four localStorage keys, the flag and R10; makes charts group-aware | everything above |

Shared files WP2.4 edits additively and the others must merge around: `workforce-board.tsx` (WP2.6), `filters.ts`
(read by WP2.6, not edited), `events.ts` (additive unions), `types.ts` (`group_id`),
`lib/workers/sync-campaign-universe.ts` (`membersAdded` only; WP2.4b and, possibly, the Cursor session). WP2.4 lands
first; WP2.5/2.6/2.7 branch from `main` after its merge; WP2.4b may run in parallel with them.

### 3.19 Performance and realistic data

- Render budget: the v2 chart renders one group's units, never every unit of every type, so the 161-unit campaign
  renders at most the largest group's units plus Unassigned. The synthetic render-cost test (§4.4) runs the `large`
  fixture in two shapes: as generated, and with all 305 members Unassigned (decision 4). Queries: the same eleven
  keys as today plus `["campaign-groups"]` and `["user-campaign-prefs"]`; the sync POST stays (SY-c), so the
  route-load request count rises by two reads and the WP2.3 ceiling (`MAX_LOAD_REQUESTS = 96`,
  `wall-chart-decomposition.spec.ts:81`) is unaffected because that spec runs with the flag off.
- **RD-a (recommended):** the realistic data set is **not** needed for this package: drag rules are proven by unit and
  contract tests plus dev campaign 1; render cost by the fixture; WP2.5 is the first package whose acceptance names
  the 161-unit campaign. **RD-b:** the phase-2 exit metric ("share of memberships in at least one unit and the median
  unit size") is delivered as a **read-only** file `scripts/data-hygiene/oux-wp2.4/00_phase2_metrics.sql` (two SELECTs
  over `campaign_worker_membership`, `campaign_worker_ou`, `campaign_organising_units`; no writes, no `SET LOCAL`,
  safe on any project). The agent may run it on dev (read is free) and paste the numbers into §9.2; the operator runs
  it on production at phase exit. This file is part of WP2.4 whichever of RD-a/RD-b is chosen; RD-b only adds an
  optional read on the realistic data set for a realistic preview of the numbers.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run in `pnpm test`

- `lib/campaign/groups/__tests__/derive-group-view.test.ts` — units of a group; Unassigned per group; Not in any
  group; containers with and without `group_id`; a worker in two groups; zero groups; ordering; **equivalence with
  the view**: a fixture written as `campaign_group_membership` rows (one per member × group, `ou_id` null when
  unplaced) must equal `deriveGroupView` for every group — the SQL in `20260914090100:156–160` is transcribed into the
  fixture generator so the test states the contract it is checking.
- `resolve-group-selection.test.ts` — the precedence chain of §3.11, invalid values, `?ou=` override, no groups.
- `wall-chart-prefs.test.ts` — lenient parse (unknown keys, wrong types, stale ids), serialise ⇄ deserialise of a
  full filter state (Sets round-trip), merge keeps foreign keys (`compare`, `layout`, anything else).
- `plan-drop.test.ts` — no-op on same unit, per-source grouping, drop from Unassigned, drop on Unassigned → unassign
  within group, mixed selection across units, Not in any group has no targets.
- `filters.test.ts` (+ cases) — `otherGroupUnitIds` predicate; defaults leave the 25 existing cases unchanged.
- `lib/workspace/__tests__/` (+ cases) — R10 flag resolution; strict schema accepts `flags.groups_v2` and rejects
  unknown flags; admin route test if one exists for `workspacePrefs`.
- `move-worker-mutation` — `withinGroupId` is forwarded on the unassign call and absent otherwise (fake client
  records `rpc` args).
- `lib/flags/__tests__/groups-v2.test.ts` — the hook reads the context; default false.
- `lib/workers/__tests__/sync-notice-message.test.ts` and the `membersAdded` case in `sync-campaign-universe.test.ts` (§3.14).

Test count must be ≥ the count on `main` at `bd0c44d0` (recorded in Stage 1); no test skipped, quarantined or deleted.

### 4.2 Contract tests (DB-backed) — none added

No RPC changes. The calls the v2 chart adds are already covered on dev: `placements.move` with `withinGroupId` and a
null target (`lib/campaign/__contract__/structure-api.contract.test.ts:1017`), the refusal of `withinGroupId` with a
target (`:1053–1055`), `placements.unassign({ withinGroupId })` (`:1066–1069`), `units.update` name/estimate (Stage 1
suite). The contract suite is **not** re-run for this package unless the reviewer asks; if it is, it needs the
`OUX_CONTRACT_*` variables in the operator's shell and runs against normal dev only.

### 4.3 Interaction tests (jsdom, the WP2.3 harness extended) — `wall-chart/v2/__tests__/`

Harness additions (additive; existing tests unaffected): fixture rows for `campaign_groups` (three groups in the
`small` fixture: Worksite, Shift, Custom; one Employer container carrying the Employer group in a `withEmployer`
variant) and `user_campaign_prefs` (empty by default; a seeded-prefs variant); the fake records the
`.eq("campaign_id", …)` chain on the prefs read and the `upsert` payload; a `groupsV2` mount option that stubs
`useWorkspace().flags`.

- `wall-chart-v2.interaction.test.tsx`: the selector lists groups + Not in any group; switching groups moves a worker
  from a unit card to the Unassigned card; `?group=` written on change and on first render; prefs upsert payload on
  change; `?ou=` picks the unit's group; drop on a unit → one `structure_placements_move` per source with the right
  `p_from_ou_id`; drop on Unassigned → `p_to_ou_id: null, p_within_group_id: G`; Shift-drop is a move; no Copy button;
  Remove from group → `structure_placements_unassign` with `p_within_group_id`; Select all via the count; Filter
  applies to every card and shows chips; participation inside Filter; "in unit of another group"; Colour by changes
  every tile; Show empty units hides/shows; Units manager hides a unit and the prefs payload carries it; search
  un-hides and highlights; Not in any group view; zero-groups state; the refused-move toast; A8 toasts.
- `wall-chart-v2.control-census.test.tsx` — renders the `small` fixture under v2 and **reports** (console table the
  verifier pastes) the count of interactive elements per region (board, selection bar, toolbar, per unit card,
  Unassigned card, per tile) and **asserts**: zero controls named `View`, `Badges` (per unit), `Sort` (per unit),
  `Filter` (per unit), `Apply to all units`, `Unit view`, `Show sub-units`, `Expand all`, `Collapse all`, `Copy to
  unit…`; per unit card ≤ 2 (+1 with the build list open). This is the appendix A §3 re-count.
- `wall-chart-v2.characterization.test.tsx` — skeleton snapshots for the v2 states (default, read-only, no groups,
  all Unassigned, hidden unit, Not in any group).
- Flag off: the existing `wall-chart.characterization.test.tsx` and every legacy suite run **unchanged**;
  `workforce/__tests__/workforce-board.test.tsx` mounts the board with the flag off and asserts the legacy shell and
  the sync query; with the flag on, the v2 shell and the same sync query; the SY-c notice cases of §3.14.

### 4.4 Render cost

`wall-chart-v2.render-cost.test.tsx` — the `large` fixture (305 / 161) selected on its largest group, and the
all-Unassigned variant; same budget and mechanism as `wall-chart.render-cost.test.tsx:64–65`. The legacy test is
known to fail on timing in sandboxed runners (`wp/wp2.2.md` §11.17 output: 8.8 s against a 6 s budget); the standard for
this package is that the v2 numbers are reported alongside the legacy numbers from the same run and are not worse.

### 4.5 e2e — flows two and three (Playwright, Vercel preview of the branch → normal dev)

New `tests/e2e/groups-v2/groups-v2.spec.ts` with its own helpers file (`groups-v2/helpers.ts`; no existing spec or
helper is edited). Preconditions the spec owns: `withUserPrefs({ mode: "full", flags: { groups_v2: true } })` — a
new helper in `tests/e2e/user-prefs.ts` built on the `workspace-mode.ts` pattern (record the whole document, pin,
restore what was recorded, one record/restore per suite so the two pins cannot leave each other's state behind);
seeds the `wall_chart_group_selector` dismissal; uses `restClientFor` (refuses production) for the oracle.
Under SY-c the spec intercepts `POST …/sync-universe-workers` (the `wall-chart-decomposition.spec.ts:26–35` pattern)
and fulfils it with a scripted `{ success: true, workersAdded: 3, membersAdded: 1, ouAssignmentsUpserted: 2,
ouAssignmentsSkipped: 1 }`, so the oracle is stable and the notice can be asserted.

Fixture on dev campaign 1 (95 members / 4 units; groups discovered at run time from `campaign_groups`): the spec
picks a group G1 with ≥ 1 unit A and a second group G2 with ≥ 1 unit C; if campaign 1 has fewer than two groups it
creates two `custom` units through the structure API as `structure-api.spec.ts` does (`createUnits`/cleanup pattern)
and lets the WP2.1 trigger derive the group; it picks a member W, records W's placements, and restores them in
`afterAll` (`placeOnlyOn` pattern).

1. **Flow two — "switch the group selector and see a worker move between a unit and Unassigned".** Place W only on
   A. Open `/campaigns/1?tab=workforce&sub=wall-chart&group=<G1>`: W's tile is inside card A. Choose G2 in the
   selector: URL has `?group=<G2>`, W's tile is inside "Unassigned in <G2>". Drag W onto C: W is in C; oracle
   `campaign_group_membership` rows for W: G1 → A, G2 → C. Reload with no `?group=`: the selector opens on G2
   (prefs). Choose G1: W still in A.
2. **Flow three — "drag a tile to Unassigned".** With G2 selected, drag W from C onto "Unassigned in <G2>": W in the
   Unassigned card; oracle: G2 row `ou_id` null, G1 row still A (the per-group semantics that distinguish this from
   `structure-api.spec.ts` test 1). Bulk: select W, "Remove from <G1>" in G1 → G1 row null too; W now appears in Not
   in any group.
3. **Hidden units and search.** Hide A in the Units manager (G1): card gone, "Units (n−1/n)"; reload: still hidden
   (prefs); search W → A un-hidden, highlighted, sheet open.
4. **Control inventory.** On a unit card there is no View / Badges / Sort / Filter control and no Copy in the
   selection bar (locator assertions; the jsdom census is the count).
5. **Sync-on-open notice (SY-c).** With the scripted route answer, the board shows "Sync on open: 1 worker added to
   this campaign, 2 placed in units, 1 already placed." and Dismiss removes it; with an all-zero answer nothing is
   shown. By hand (E2-b) the operator opens a campaign whose Who's in has changed since the last open, or accepts the
   jsdom board test as the evidence for this step and records that.

Acceptance — **E2-b decided by the operator on 2026-09-15**:

- **E2-b (chosen)** The operator performs steps 1–5 by hand on the branch preview from a checklist the orchestrator
  supplies (the same items, with the REST oracle replaced by what the sheet's Units tab shows: after step 1, W's
  Units tab lists "<G1> › A" and "<G2> › C"; after step 2, only "<G1> › A", then nothing), and reports; the
  orchestrator records the result in §9.2 as the acceptance evidence for flows two and three. The spec is still
  written and type-checked (`tsc` covers `tests/e2e`) so it can run from the `e2e-preview.yml` workflow whenever
  secrets exist.
- **E2-a (not chosen)** would have been the same spec run from a credentialled shell.

Existing specs (`wall-chart.spec.ts`, `wall-chart-decomposition.spec.ts`, `structure-api.spec.ts`, `roles/*`,
`organiser-campaign.spec.ts`) must stay green on the same preview with the flag off for the e2e account, which is
their default state.

### 4.6 Legacy suites

`pnpm test` runs every WP2.3/WP2.2 wall-chart suite unchanged; the guard test `no-direct-structure-writes.test.ts`
stays green (the v2 chart writes only through `structureApi` and the prefs upsert is not a structure table).

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit
pnpm --filter organising-db lint           # touched lines clean; total problems ≤ 294 (143 errors / 151 warnings)
pnpm --filter organising-db test           # ≥ the count on main at bd0c44d0; no skips added

# acceptance greps
rg -n "groups_v2|groupsV2" apps/organising-db/src --glob '!**/__tests__/**'          # readers: flags/groups-v2.ts, workspace/*, workforce-board.tsx, administration/page.tsx only
rg -n "localStorage" apps/organising-db/src/components/campaigns/wall-chart/v2 apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx ; echo "exit=$? (1 = none = pass)"
rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = pass)"
rg -n "UnitAssessmentViewControl|UnitListBadgeControl|applyToAllScopes|UNASSIGNED_KEY" apps/organising-db/src/components/campaigns/wall-chart/v2 apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx ; echo "exit=$? (1 = no per-unit overrides in v2 = pass)"
git diff --stat main -- supabase/ packages/db-types/ ; echo "(must be empty: no migration, no regen)"

# control census and render cost (output pasted into §9.2)
cd apps/organising-db && pnpm exec vitest run src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.control-census.test.tsx src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.render-cost.test.tsx src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx

# build
pnpm --filter organising-db build

# phase-2 metric (read-only SQL; dev via the connector or the operator's SQL editor; production by the operator only)
cat scripts/data-hygiene/oux-wp2.4/00_phase2_metrics.sql

# e2e against the branch preview (credentials from the operator's shell; never printed)
cd apps/organising-db && E2E_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/groups-v2 tests/e2e/wall-chart.spec.ts tests/e2e/wall-chart-decomposition.spec.ts tests/e2e/structure-api.spec.ts tests/e2e/roles
# sandboxed runner behind a TLS-intercepting proxy only (wp2.2.md D80): prepend E2E_IGNORE_HTTPS_ERRORS=1
```

Never `pnpm dev` / `pnpm start`; never a `supabase` command (none is needed); never a read of `.env.local`.

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages

| Stage | Content | Needs DB? |
|---|---|---|
| 0 | This plan approved; ledger row "planning → implementing"; branch cut (git commands put to the operator). | No |
| 1 | Pure library: `lib/campaign/groups/*` (derive, resolve, prefs schema, plan-drop), `filters.ts` additive dimension, `types.ts` `group_id`, `move-worker-mutation.ts` `withinGroupId`, `events.ts` unions; the flag (prefs schema, R10, context, `lib/flags/groups-v2.ts`, admin checkbox); `useUserCampaignPrefs`; **SY-c library half**: `membersAdded` in `sync-campaign-universe.ts` and `lib/workers/sync-notice-message.ts` (accepting the optional WP2.4b counts); all §4.1 tests; the read-only metrics SQL. | No |
| 2 | v2 chart: shell, groups hook, group-view hook, toolbar, selector, chips, band, Unassigned card, Not in any group view, card menu + edit-unit dialog, move-to-unit dialog, dialogs wiring; `WorkforceBoard` switch and the **SY-c notice** (`sync-on-open-notice.tsx`, board test); A8; sheet group prefix; copy-dialog group awareness; hint; harness additions and the §4.3 interaction + census + characterisation tests; §4.4 render cost. | No |
| 3 | e2e spec + `user-prefs.ts` helper written and type-checked; **operator checklist (E2-b) steps 1–5 on the branch preview**, recorded by the orchestrator; legacy specs unaffected (flag off for the e2e account; a credential-less `pnpm e2e` still skips cleanly); metrics SQL run on dev (read-only) and numbers pasted. | Preview (dev) |
| 4 | Verifier output pasted (§9.2); fresh reviewer (Fable: the package writes placements and reads worker data; max two fix rounds, §9.3); `PROGRESS.md` row and phase-2 exit evidence; PR marked ready. | — |
| **2.4b** (separate branch and PR, §3.15) | SM-a: `reconcile-placements.ts` + tests; both sync entry points apply it; drag toast; one contract case on dev; operator acceptance on the preview (Fugro/ROV pair recreated on dev if ids are supplied). Starts after the operator answers SM; may run in parallel with WP2.5–2.7. | Preview (dev); contract on dev |

### 6.2 Commits

One commit per completed unit (Stage 1, Stage 2, Stage 3, Stage 4 evidence), small and descriptive, on
`feat/oux-wp2.4-group-selector`; the branch only ever merges `main` in. Every push and the PR command are put to the
operator first. `supabase/.temp/*` is never staged (it shows as modified on every checkout).

### 6.3 PR

Draft PR `feat/oux-wp2.4-group-selector → main`, title `feat(oux-wp2.4): group selector, per-group Unassigned,
campaign-wide Colour by and Filter, server-side prefs (behind groups_v2)`. Body: §3 summary, the §2.3 control table
with the census numbers, the evidence matrix, the FL/SY/CP/HU/MN/CA decisions as approved, the SM deferral to
WP2.4b, "no migration" stated once. Marked
ready only after Stage 4.

### 6.4 Promotion gate

**Not applicable: no migration.** The merge deploys code that is inert without the per-user flag. After the merge the
operator may tick `Groups v2` for their own account in Administration → Users to see the v2 chart on production;
nothing else changes for anyone. The Supabase GitHub integration, `gen-types.yml` and run sheets are untouched.

---

## 7. Files

New:
- `apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx`
- `apps/organising-db/src/components/campaigns/wall-chart/v2/`: `use-wall-chart-groups.ts`, `use-wall-chart-group-view.ts`,
  `use-wall-chart-actions-v2.ts`, `wall-chart-toolbar.tsx`, `group-selector.tsx`, `filter-chips.tsx`,
  `wall-chart-group-band.tsx`, `wall-chart-unassigned-card-v2.tsx`, `not-in-any-group-view.tsx`, `unit-card-menu.tsx`,
  `edit-unit-dialog.tsx`, `move-to-unit-dialog.tsx`, `wall-chart-dialogs-v2.tsx`, `__tests__/*` (§4.3, §4.4)
- `apps/organising-db/src/lib/campaign/groups/`: `derive-group-view.ts`, `resolve-group-selection.ts`,
  `wall-chart-prefs.ts`, `plan-drop.ts`, `__tests__/*`
- `apps/organising-db/src/lib/hooks/useUserCampaignPrefs.ts` (+ test)
- `apps/organising-db/src/lib/flags/groups-v2.ts` (+ test)
- `apps/organising-db/src/components/campaigns/workforce/sync-on-open-notice.tsx`, `workforce/__tests__/workforce-board.test.tsx`
- `apps/organising-db/src/lib/workers/sync-notice-message.ts` (+ test)
- `apps/organising-db/tests/e2e/groups-v2/groups-v2.spec.ts`, `tests/e2e/groups-v2/helpers.ts`, `tests/e2e/user-prefs.ts`
- `scripts/data-hygiene/oux-wp2.4/00_phase2_metrics.sql` (read-only) and a three-line `README.md`

Modified (additive, default-preserving):
- `components/campaigns/workforce/workforce-board.tsx` — shell choice; the SY-c notice and the tightened invalidation condition.
- `lib/workers/sync-campaign-universe.ts` — `membersAdded` on `SyncCampaignUniverseResult` (additive; `workersAdded` unchanged); `__tests__/sync-campaign-universe.test.ts` + 1 case.
- `components/campaigns/wall-chart/filters.ts` — `otherGroupUnitIds`, `participation` (defaults keep legacy behaviour).
- `components/campaigns/wall-chart/types.ts` — `group_id?` on `WallChartOU`.
- `components/campaigns/wall-chart/move-worker-mutation.ts` — optional `withinGroupId` on `MoveWorkerVars`.
- `components/campaigns/wall-chart/worker-detail-sheet.tsx` — A8 `onError`; group prefix prop.
- `components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx` — optional `groups` prop (same-group targets disabled).
- `components/campaigns/wall-chart/campaign-unit-card.tsx` — optional `countAction` (only if the reviewer accepts; otherwise none).
- `components/campaigns/wall-chart/wall-chart-unit-manager.tsx` — copy sentence keyed on a `serverSide` prop; no container special-case when `groupsV2`.
- `components/campaigns/wall-chart/__tests__/harness/{fixture,backend,mount}.ts(x)` — group and prefs rows, flag stub.
- `lib/workspace/prefs-schema.ts`, `lib/workspace/resolve.ts`, `lib/workspace/use-workspace.tsx`, `lib/workspace/prefs-payload.ts` — the flag.
- `app/(dashboard)/administration/page.tsx` — the checkbox.
- `lib/analytics/events.ts` — union members.
- `lib/hints/registry.ts` — drop `pending: "WP2.4"` on the group-selector hint.
- `docs/organiser-ux-review/PROGRESS.md` — ledger row, phase-2 exit evidence, incidental findings (sync-on-open row closed by the SY decision).

Not modified: every legacy composition file named in §3.1 principle 2; `WallChartAssessmentCharts.tsx`;
`useAssessmentDistributions.ts`; `workforce-list-view.tsx`; `workforce-bulk-toolbar.tsx`; `campaign-units-section.tsx`;
`campaign-wizard.tsx`; `campaign-settings.tsx`; `campaign-universe-section.tsx`; `step-employers-worksites.tsx`;
`universe-match-mode-control.tsx`; `create-organising-unit-dialog.tsx`; `structure-api.ts`; the sync route; any file
under `supabase/`; `packages/db-types/generated.ts`; any existing e2e spec or helper. (WP2.4b, not WP2.4, edits
`sync-campaign-universe.ts` beyond `membersAdded` and `move-worker-mutation.ts:136–146`.)

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion | Evidence |
|---|---|
| Plan 5.6 except Compare, behind `groups_v2` | §2.3 control table ticked in the PR; census test output; flag-off board test proves the legacy shell renders |
| Per-unit View, Badges, Sort, Filter overrides removed | census assertions (zero such controls); `rg` in §5 finds no override helper in `v2/` |
| Drag rules per plan 5.6 | `plan-drop` unit tests; interaction tests recording `structure_placements_move` / `_unassign` args; e2e flow three |
| State in `user_campaign_prefs` and `?group=` | prefs schema tests; interaction tests on the recorded upsert and URL; e2e step 1 reload; `rg localStorage` in `v2/` = none |
| e2e flow two | the operator's step-1 report on the branch preview (E2-b), recorded in §9.2; `groups-v2.spec.ts` test 1 written and type-checked |
| e2e flow three | the operator's step-2 report (E2-b), recorded in §9.2; test 2 written and type-checked |
| Appendix A §3 control inventory re-counted and reported | census console table pasted in §9.2 and in the PR; target "no per-unit filter or view override" asserted |
| Worker search and the Units manager work with hidden units (appx A 2.3) | interaction tests; e2e step 3 |
| `campaign_group_membership` consumed correctly | §4.1 equivalence test; e2e oracle reads the view |
| Sync-on-open decided (SY-c) | §9.1; board test: query issued on both paths, notice shown only when counts > 0, dismissible; `membersAdded` unit test; checklist step 5 |
| Cross-campaign mirror (SM) | §9.1 answer recorded; design in §3.15; delivered by WP2.4b (its own ledger row and evidence) |
| No migration; no RPC change; guard test green | `git diff --stat main -- supabase/ packages/db-types/` empty; guard test in `pnpm test` |
| Full mode keeps working | every legacy vitest suite unchanged and green; legacy e2e specs green on the same preview |
| Phase-2 exit metric available | `00_phase2_metrics.sql` output from dev pasted; production run is the operator's at phase exit |
| No localStorage view state, no new flag beyond `groups_v2`, no creation path, no materialised Unassigned | reviewer checklist |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Legacy e2e specs run against the v2 chart on a preview | FL-b: the flag is per user and the legacy specs' account has it off; the v2 spec pins it on and restores (§4.5). Under FL-a this risk is real and the specs would need rewriting. |
| The e2e account's `workspace_prefs` left pinned after a crashed run | one record/restore per suite in `user-prefs.ts`; the restore note is logged; `withUserMode` is not nested inside it |
| Prefs write races between two tabs of one user | last-write-wins on a per-user row; recorded; no data of anyone else can be affected (RLS `ucp_*`) |
| A refused prefs write (RLS, network) | UI keeps in-memory state, one toast; the chart never blocks on prefs |
| `units.reorder` from the Units manager re-numbers only the group's units, so the legacy chart's global order may interleave differently | recorded; ordering within a group is what v2 shows; WP2.8 removes the legacy chart |
| A legacy custom-kind container (`group_id NULL`) holds placements that count for no group | the §4.1 test pins that such workers appear in Not in any group; production has none since M2 materialised Employer placements and custom containers are unplaceable (`check_no_worker_on_group_container`); WP2.8 retires the column |
| Hundreds of tiles in one Unassigned card (decision 4) | render-cost test with 305 all-Unassigned; no virtualisation in this package; if the budget fails, stop (§8.4) |
| `WallChartTile` reuse depends on empty override maps resolving to the campaign default | pinned by `wall-chart-model.test.ts` today (`effectiveAssessmentForScope` with an empty map) and by the v2 interaction test on Colour by |
| Dev campaign 1 may have a single group | the spec creates two custom units through the structure API and cleans them up, as `structure-api.spec.ts` does |
| SY-c: the notice shows on almost every open if counts are wrong | `membersAdded` replaces `workersAdded` (= all matched members) as the "added" figure; `ouAssignmentsSkipped` is reported as "already placed", never as a change; the message is null when all counts are zero (pure test) |
| SY-c: notice fatigue on campaigns whose universe churns | dismissible; one per board mount; no persistence — if the operator later wants "don't show again" it is one more `wallChart` prefs key |
| SY-c keeps a silent writer's side effects on page open (totals drift; the 334-worker case) | accepted by the operator; evidence rules stay "hazard counts, not row totals" (`PROGRESS.md` standing notes); the notice makes the drift visible to the person who caused it |
| `sync-campaign-universe.ts` edited by a parallel Cursor session while WP2.4 adds `membersAdded` | the edit is 15 additive lines; the implementer merges `main` into the branch before Stage 1's commit and re-runs the 53 sync tests; stop condition 11 if the file has moved again under a still-active session |
| SM deferred: until WP2.4b lands, a drag in one campaign still leaves a stale universe placement in another | the operator's requirement is met by WP2.4b, scheduled here with a bounded scope; the §3.14 notice already accepts its counts so no second UI change is needed |
| The pre-existing render-cost timing failure in sandboxed runners | v2 and legacy numbers reported from the same run; "not worse" is the standard (§4.4) |
| Lint creep from the new tree | touched lines clean; total ≤ 294 |
| WP2.5/2.6/2.7 collide on `workforce-board.tsx`, `filters.ts`, `events.ts` | §3.18 boundaries; WP2.4 merges first; the later packages branch from the merged `main` |

### 8.3 Deviations from plan (implementer keeps; numbering starts at D1)

| # | Deviation | Why | Plan section affected |
|---|---|---|---|
| — | _none yet_ | | |

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. Any change would be needed under `supabase/` or to `packages/db-types/generated.ts`.
2. A v2 behaviour cannot be built without editing a legacy composition file beyond the additive list in §7.
3. Any legacy vitest suite or legacy e2e spec would need a change to pass.
4. The §4.1 equivalence test finds a case where the client derivation and the view's definition disagree.
5. The all-Unassigned render-cost case exceeds the budget by more than the legacy test does in the same run.
6. `units.update` refuses `name` or `total_workers_estimated` (whitelist drift).
7. The `groups_v2` flag would need a reader outside `lib/flags/groups-v2.ts`, `lib/workspace/*`, `workforce-board.tsx` and the admin page.
8. Lint total would exceed 294 or `tsc` fails in an untouched file.
9. Anything would touch `gteygwfgjvczanmrwgbr`, or an e2e run would target it (`restClientFor` refuses; the run stops there).
10. A third fix round would be needed.
11. `lib/workers/sync-campaign-universe.ts` or `workforce-board.tsx` has changed on `main` again since `8ad4c1ad` when
    Stage 1 starts, and the operator has not said the parallel session has finished with those files.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Recommendation | **Operator answer (2026-09-15)** |
|---|---|---|---|
| **FL** | Where `groups_v2` lives: **FL-a** Preview env var; **FL-b** per-user `workspace_prefs.flags.groups_v2` through the existing admin API and a Users-dialog checkbox, default off; **FL-c** org-wide `app_settings` key (migration) | FL-b | **FL-b approved** |
| **SY** | Sync-on-open: **SY-a** keep silent; **SY-b** not issued on the v2 board; **SY-c** keep and announce | SY-b (Revision 1) | **SY-b rejected; SY-c adopted** — "on balance auto sync", plus a visible notice of what the sync changed on opening a wall chart (§3.14) |
| **SM** | Cross-campaign mirror (§3.15): **SM-a** move only `universe`-sourced placements to the compatible unit, keep and report `manual`/`rule`; **SM-b** add-if-absent (today); **SM-c** always move | **SM-a, delivered as WP2.4b** | **pending** (raised by the operator as a requirement on 2026-09-15; the recommendation and the WP2.4b scoping await the operator's answer) |
| **PR** | Prefs: **PR-a** one `wallChart` document in `user_campaign_prefs.prefs`, no migration; **PR-b** typed columns / campaign default (migration + gate) | PR-a — **no migration** | **PR-a approved** |
| **CP** | Copy in v2: **CP-a** none; **CP-b** keep, cross-group only | CP-a | **CP-a approved** ("no need to copy if each group has a default Unassigned") |
| **HU** | Hidden units: **HU-a** per-user server-side hidden set plus Show empty units; **HU-b** Show empty units only | HU-a | **HU-a approved** |
| **MN** | Card ⋯ menu: **MN-a** Rename and Set estimate via a small edit dialog on `units.update`, plus Assign people, Split, Merge, Delete; **MN-b** the four items only | MN-a | **MN-a approved** |
| **CA** | WP2.2 rows: **CA-a** A8 done and A5 decided here; A3, A4, D72 re-carried to WP2.7; **CA-b** all five here | CA-a | **CA-a approved** |
| **RD** | Realistic data set: **RD-a** not used by WP2.4; **RD-b** additionally run the read-only metrics SQL on it | RD-a | **RD-a** |
| **E2** | Flows two and three: **E2-a** the Playwright spec run from a credentialled shell; **E2-b** operator by hand from the checklist, recorded by the orchestrator | write the spec; E2-a if possible, else E2-b | **E2-b** — the operator tests by hand from the checklist (§4.5 steps 1–5); the orchestrator records |

Approvals still required, in order:

1. The **SM** answer (SM-a recommended) and confirmation that WP2.4b is the vehicle (§3.15); if the operator wants SM
   inside WP2.4 instead, it becomes Stage 2b between Stages 2 and 3 with the same content and the Stage 4 review
   covers it — the planner advises against it for the three reasons in §3.15.
2. Whether the parallel Cursor session continues on `sync-campaign-universe.ts` and the settings/universe files
   (`PROGRESS.md:102`); WP2.4 Stage 1 touches that file for `membersAdded` only.
3. Approve `git checkout -b feat/oux-wp2.4-group-selector main`, the Stage-0 commit of this plan and the ledger row,
   `git push -u origin feat/oux-wp2.4-group-selector`, and opening the draft PR.
4. Approve each stage commit and push individually.
5. E2-b: perform the five-step checklist on the branch preview when Stage 3 is ready and report; the orchestrator
   records the result in §9.2.
6. Confirm the read-only `00_phase2_metrics.sql` may be run on normal dev by the agent (read is free under the
   standing notes; confirmation requested because the file is new).

**Orchestrator approval:** _pending (Revision 2 awaiting the SM answer; every other decision is answered)._

### 9.2 Verification output (verifier pastes raw output)

_pending._

### 9.3 Reviewer findings and resolution

_pending._

---

## 10. Revision history

- **Revision 2** (2026-09-15): operator answers recorded (FL-b, PR-a, CP-a, HU-a, MN-a, CA-a, RD-a approved; **SY-b
  rejected, SY-c adopted**; **E2-b** chosen). §3.14 redesigned as SY-c: the mount sync stays on both chart paths and
  a dismissible inline notice on `WorkforceBoard` reports `membersAdded` (new, truthful count), placements made and
  placements skipped, with a pure message helper and tests; the board's invalidation condition tightened. New §3.15
  **SM** (cross-campaign mirror) with options SM-a/b/c, the SM-a rule (move only `universe`-sourced placements to the
  compatible unit; keep and report `manual`/`rule`), its RPC calls, notice/toast wording and tests, scoped as the
  bounded follow-up **WP2.4b**. §2.8 re-cited against `main` at `8ad4c1ad` (Cursor commits `e47b4d10`, `4461c2ee`:
  employer-AND-worksite default match mode, `universe-match-mode-control.tsx`, new line numbers in
  `sync-campaign-universe.ts`, `campaign-settings.tsx`, `campaign-universe-section.tsx`, `campaign-wizard.tsx`,
  `step-employers-worksites.tsx`). Stages, files, evidence, risks and stop conditions updated (stop condition 11:
  the parallel session). Later §3 sections renumbered (3.16–3.19).
- **Revision 1** (2026-09-15): initial plan against `main` at `bd0c44d0`. Recommends FL-b, SY-b, PR-a (no migration),
  CP-a, HU-a, MN-a, CA-a, RD-a, E2-a with E2-b fallback. Two shells behind one per-user flag; one filter pipeline;
  derived Unassigned per group and Not in any group as pure functions equivalent to `campaign_group_membership`;
  `placements.move` with `withinGroupId` for the per-group Unassigned drop; `?group=` plus a `wallChart` document in
  `user_campaign_prefs`; no RPC, migration or types change; flows two and three as a new spec with a by-hand fallback.
