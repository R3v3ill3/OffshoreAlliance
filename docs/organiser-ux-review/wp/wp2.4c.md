# WP2.4c — Nesting within a group on the `groups_v2` wall chart

Status: **Revision 1 (2026-09-15) — plan written, not approved. Implementation not started.**
Written against `main` at `3cb0bd5a` (WP2.4 merged at `5a16de07`, `PROGRESS.md:45`; the decision-5 amendment recorded at
`833dd4df`, `DECISIONS.md:14`; WP2.5, WP2.6 and WP2.7 plans at Revision 1, none approved). Depends on WP2.4 only. A
follow-up package to WP2.4 in the sense of `wp/wp2.4.md` §3.15's WP2.4b: it changes the v2 chart's rendering and drag
rules, nothing in the schema, and its data-model finding (§3.2) must be adopted by the WP2.5, WP2.6 and WP2.7 plans
before they are approved (§3.17).

Branch (proposed): `feat/oux-wp2.4c-nested-units` off `main`. Draft PR into `main`. **No migration** (§3.14), so the
promotion gate of `PHASE2_MAIN_ORCHESTRATION_PROMPT.md:44` does not bind; the merge deploys code behind the per-user
`groups_v2` flag (FL-b, `wp/wp2.4.md` §3.2), default off.

This document follows `wp/README.md`: specification → plan → approval → deviations → verification → review. §0 is
placed first, as in `wp/wp2.2.md` and `wp/wp2.4.md`, because it states what the package needs from the databases:
nothing.

### Decision labels used in this document (each label is unique; none is reused from wp2.2, wp2.4, wp2.5, wp2.6 or wp2.7)

| Label | Topic | Section |
|---|---|---|
| **NE-a / NE-b** | What counts as a nesting edge (a `parent_ou_id` link to a non-container parent only, or every `parent_ou_id` link) | §3.3 |
| **NV-a / NV-b** | A new pure `deriveGroupTree` beside the unchanged `deriveGroupView`, or nesting folded into `deriveGroupView` in place | §3.4 |
| **NP-a / NP-b / NP-c** | The child ⇒ parent placement invariant: derived-and-tolerated, materialised by script, or enforced | §3.2 |
| **NC-a / NC-b** | A worker whose sub-unit sits under a different parent than their own placement in the parent's group | §3.4 |
| **NX-a / NX-b / NX-c** | Cross-parent drags need two RPC calls: ordered steps, a new RPC, or no cross-parent drag | §3.7 |
| **NS-a / NS-b** | Whether a worker who leaves a parent's subtree also loses the sub-unit placement they held under it | §3.7 |
| **SG-a / SG-b** | A sub-unit-only group: not listed and unreachable, or not listed but reachable by `?group=` | §3.5 |
| **CG-a / CG-b** | Whether a sub-unit-only group is offered as the Compare secondary axis (WP2.5) | §3.17 |
| **XP-a / XP-b** | Nested cards always expanded, or a per-parent expand state | §3.6 |
| **SP-a / SP-b** | Split on a nested card: not offered, or offered and refused by the depth trigger | §3.9 |
| **AP-a / AP-b** | Assign people… / the sheet's copy dialog on a sub-unit: parent placement added by the RPC's default, or the target locked until the worker is in the parent | §3.10 |
| **HT-a / HT-b** | Acceptance: the operator's checklist on the branch preview after creating the shape through Split, or a credentialled Playwright run | §4.6 |

---

## 0. Where the schema has to be, and when (nothing to do)

Every database object this package reads or calls exists on **production** and on **normal dev** and none is added:

| Object | Where defined | Production | Normal dev |
|---|---|---|---|
| `campaign_organising_units.parent_ou_id`, `ou_group_id`, `is_group_container`, `group_id`; the depth trigger `cou_enforce_hierarchy_invariants` (`trg_cou_enforce_two_level_depth`) | `supabase/migrations/20260908050000_baseline_schema.sql:1688–1718` (body), `:22441` (trigger); `group_id` from `20260912035329_wp2_1_campaign_groups.sql:504`, `:512` | 2026-09-13 | 2026-09-14 |
| `campaign_group_kind_for_ou_type`, `campaign_group_target_for_unit`, `cou_default_group`, `cwo_set_group_id` | `20260912035329:14–36`, `:38–93`, `:610–676`, `:722–745`; triggers `:759–775` | 2026-09-13 | 2026-09-14 |
| `structure_placements_move(… p_within_group_id, p_keep_source, p_keep_in_parent DEFAULT true)`, `structure_placements_unassign`, `structure_unit_split(… p_keep_in_source)`, `structure_unit_delete(… p_delete_children)`, `structure_units_create` | `20260914090000_wp2_2_structure_api.sql:2630–2860`, `:2862–2916`, `:2205–2461`, `:1934–1955`, `:1754–1855`; wrapper `apps/organising-db/src/lib/campaign/structure-api.ts:326–339`, `:619–632`, `:577–590`, `:554–565` | 2026-09-15 (2.2a) | 2026-09-14 |
| `campaign_worker_ou_one_unit_per_group`; `campaign_group_membership` | `20260914090100_wp2_2_one_unit_per_group_enforcement.sql:92–95`, `:156–160` | 2026-09-15 (2.2b) | 2026-09-14 |
| `user_campaign_prefs` (the `wallChart` document, `wp/wp2.4.md` §3.11) | `20260912035329:781–831` | 2026-09-13 | 2026-09-14 |

No `supabase` CLI command, no connector call, no run sheet, no types regeneration. The one SQL file this package adds
(`scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql`, §3.2) is **read-only** and is run by the agent on dev only with
the operator's confirmation, and on production only by the operator.

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 The operator's words, as recorded

`DECISIONS.md:14` (decision 5, **Amended again 2026-09-15**, operator, live testing of WP2.4 on campaign 42):

> nesting *within* a group is required — an employer with worksites as the primary grouping and, for a large worksite,
> shift sub-units under it. Shifts as a sibling group are wrong (every small-worksite worker shows as "Unassigned in
> Shift", mixed with the large worksite's workers not yet on a shift). The v2 chart must render child units nested
> under their parent card inside the parent's group, with the parent's own area holding members not yet in a child;
> groups made only of sub-units are not offered as a primary group. `parent_ou_id` is therefore a live column again,
> not migration input. Delivered by WP2.4c.

`PROGRESS.md:103` (incidental finding, operator, live testing of WP2.4 on production, 2026-09-15):

> With `groups_v2` on, sub-unit nesting is gone: campaign 42 has EDI Downer as employer, worksites as the primary
> grouping, and shift sub-units under the largest worksite; the v2 chart offers Shift as a sibling group, so every
> small-worksite worker appears as "Unassigned in Shift" beside the large worksite's not-yet-on-a-shift workers.
> Decision 5 ("no nesting") was wrong for this common shape.
> → **WP2.4c** (planned 2026-09-15): nested child units inside the parent card within the parent's group, parent area =
> members not yet in a child, sub-unit-only groups not offered as primary; WP2.5/WP2.6 plans to be re-checked against
> it before approval

The required behaviour as relayed by the orchestrator to this planner (2026-09-15), verbatim:

> inside the parent's group (Worksite), a unit card with children renders those children nested under it; the parent's
> own area holds members not yet in any child ("not yet assigned to a shift"); a group made only of sub-units (every
> unit has a parent in another group) is not offered as a primary group in the selector (decide what happens to it in
> Not in any group / Unassigned and whether it stays available to Compare in WP2.5); drag between the parent area and a
> child, and between children, goes through `placements.move` with the right `keepInParent`/group semantics so a worker
> keeps their worksite placement and gains/changes the shift placement; Split from the card menu offers "keep in
> parent" again for a child of a different type; roll-up counts on the parent.

### 1.2 Binding rules (restated so the reviewer can check each)

1. **B1 — nested rendering.** In group G's view, a unit U of G that has child units renders those children as cards
   nested inside U's card; U's own tile area holds the members of U who are in none of U's children.
2. **B2 — sub-unit-only groups are not primary.** A group every unit of which is a child of a unit in another group is
   not listed in the Group selector. What becomes of it in Unassigned, Not in any group and Compare is decided here
   (§3.5, §3.17).
3. **B3 — drags keep the parent placement.** A drop between U's area and a child, or between children, is one or more
   `placements.move` calls whose net effect is: the worker keeps (or gains) the placement on U in G and gains, changes
   or loses the placement on the child in the child's group. Nothing else changes.
4. **B4 — Split from the card menu offers "keep in parent"** for a child of a different kind from the source (it does
   today: `split-unit-dialog.tsx:640–645`, `:1178–1200`; this package proves it on the nested chart and never hides
   it for that case).
5. **B5 — roll-up counts on the parent.** U's header count, placeholders and summary metrics cover U and its children.
6. Inherited from WP2.4 (`wp/wp2.4.md` §3.1): one flag, two shells; the legacy chart byte-for-byte; leaf components
   reused; one pipeline; derived never stored; server-side view state; writes only through the structure API with calls
   that already exist; pure first; plan §3.6 terminology.
7. Inherited from the programme (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:28–40`, `PHASE2_MAIN_ORCHESTRATION_PROMPT.md:40–50`):
   production never touched; branch off `main`, draft PR into `main`, every push put to the operator; no skipped tests;
   no localStorage view state; no materialised Unassigned; no new creation path; do not widen the package.

### 1.3 Plan §5.5 / §5.6 lines this package re-reads (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`)

- `:291` Unassigned is derived and last in every group — unchanged; its definition gains "nor in any child of a unit of
  this group" (§3.4).
- `:294` "no nesting inside the organiser's model; Split creates siblings" — **superseded by decision 5 as amended**;
  C-k (same-group children partition the group) still holds for a child of the source's own kind.
- `:305` Group selector lists groups in display order — now the **primary** groups (§3.5).
- `:309`–`:310` unit card and tile — unchanged; a nested card is the same `CampaignUnitCard` with `nested`.
- Decision 5 as first amended (2026-09-08, `DECISIONS.md:40`): Employer and Worksite are independent facets, never
  parent and child. **This still holds** and is what makes NE-a (§3.3) the right reading: the Employer container →
  worksite link is a facet link that `10` flattened, not nesting; only a link to a *non-container* parent nests.

### 1.4 Binding handoffs from earlier packages

- `wp/wp2.4.md` §3.3 "Pure derivations" and "Containers under v2" (`:455–474`): `deriveGroupView` semantics and the
  container rule — kept verbatim; nesting is a second derivation beside them (NV-a, §3.4).
- `wp/wp2.4.md` §3.9 (`:564–582`) and D7: `planDrop` re-derives the source from the group view; the target-in-group
  guard. Kept for flat groups; the nested planner (§3.7) is a superset that reduces to it when no unit has children.
- `wp/wp2.4.md` §3.18 (`:806–820`): WP2.4c owns what WP2.4 owned (`wall-chart/v2/**`, `lib/campaign/groups/**`, the
  additive legacy-file props); §3.16 below re-states the boundaries with WP2.5/2.6/2.7 in flight.
- `wp/wp2.4.md` D17: the v2 delete dialog passed `childOuIds = []` and `allOus = unitsOfGroup` — both change here (§3.9).
- `wp/wp2.4.md` D32 (`wp/wp2.2.md` §8.3): the parent card ignores a drop a nested card already consumed
  (`campaign-unit-card.tsx:164–173`) — the mechanism this package relies on for nested drop targets.
- `wp/wp2.2.md` D4 (`:810`): `p_keep_in_parent` keeps/creates the parent placement only when the parent has a group of
  its own and it differs from the target's; D33/D39 (`:854`): the split dialog's switch rule; D45 (`:881`): a sub-unit
  under a plain parent carries `parent_ou_id` only (post-WP2.2) or `ou_group_id = parent_ou_id` (legacy wizard);
  D50 (`:886`): the units-section reallocate passes `keepInParent: false`.
- `wp/wp2.7.md` §3.1 principle 3, §3.3 `:395`, §3.10 rows 5/14/26, §4.3 `:750`, §5 `:880` — written under "no nesting";
  §3.17 lists what must change before WP2.7 is approved.

### 1.5 Not in WP2.4c (recorded so it is not folded in silently)

- **No migration, no RPC change, no new RPC.** A one-transaction "move within a subtree" RPC would be the clean answer
  to NX (§3.7); it is recorded as NX-b and not built.
- **No data repair.** NP-b (a materialisation script for missing parent placements) is offered and not recommended
  (§3.2); the read-only `00_nesting_shape.sql` only counts.
- **Compare over nested groups** (WP2.5), **list sections** (WP2.6), **the editor's "Nest under" field and per-parent
  auto-build** (WP2.7), **the mirror's subtree rule** (WP2.4b): amendments stated in §3.17 for those plans; not built here.
- **The legacy chart** (`wall-chart-unit-hierarchy.tsx`, `use-wall-chart-structure.ts`, the legacy dialogs) is not
  edited; its nesting, roll-ups and per-parent "Unit view / Show sub-units" state are what WP2.8 deletes.
- **Touch drag** (WP4.1); **grandchild rendering** beyond what the depth trigger allows (§3.3: at most unit → sub-unit
  is ever nested under NE-a).
- **The three-level "expand all / collapse all"** header controls of the legacy chart are not revived (XP-a, §3.6).

---

## 2. Current-state map

### 2.1 The hierarchy columns and what the database guarantees

- `parent_ou_id` (self-FK, `ON DELETE SET NULL`, appendix C `:175`), `ou_group_id` (must equal `parent_ou_id` when set,
  container membership only, appendix C `:177`, `:185`), `is_group_container`. Depth (baseline `:1688–1718`): a child of
  a top-level unit is always allowed; a child of a child is allowed **only when the grandparent is a group container**
  — so the three shapes are *unit → sub-unit*, *container → unit* and *container → unit → sub-unit*. Under a plain
  (non-container) top-level unit, depth is exactly two.
- The unit's group (`cou_default_group`, `20260912035329:610–676`) is derived from **`ou_type` alone** for fixed kinds
  (`campaign_group_target_for_unit` `:38–93`: worksite/employer/shift/crew/occupation/work_area → their kind's group,
  `parent_ou_id` never read); a custom-kind unit under a custom-kind container joins the container's group; a
  custom-kind unit under a plain parent joins the per-label "Custom" group. So a `shift` sub-unit under a worksite is a
  unit of the **Shift** group, and campaign 42's chart shows exactly the finding's symptom.
- The placement's `group_id` is the unit's (`cwo_set_group_id` `:722–745`); one row per (worker, group) (2.2b). A
  worksite row and a shift row are in different groups, so **both may coexist** — and nothing requires that they do.

### 2.2 The v2 chart after WP2.4 (what this package changes)

| Concern | Where today | Behaviour |
|---|---|---|
| Units of a group | `lib/campaign/groups/derive-group-view.ts:82–87` (`unitsOfGroup`), `:124–158` (`deriveGroupView`) | flat: every unit with `group_id === G`; `parent_ou_id` is not read (`WallChartOU.parent_ou_id` exists, `wall-chart/types.ts:127–150`) |
| Band | `wall-chart/v2/wall-chart-group-band.tsx:38–71`, card `:80–164` | "one flat row of cards, then Unassigned last… no nesting, no roll-ups" (`:33–36`); `CampaignUnitCard`'s `subUnits` slot (`campaign-unit-card.tsx:66`, `:323–329`) and `nested` prop (`:72`) unused by v2 |
| Group view hook | `wall-chart/v2/use-wall-chart-group-view.ts:220–226` (`deriveGroupView`), `:236–241` (group-scoped tile index), `:39` (`EMPTY_PARENT_MAP` — "v2 has no nesting"), `:253–261` (hidden), `:305–357` (search / focus) | one `data-ou-id` per unit; search label = the worker's unit in G |
| Selector | `wall-chart/v2/group-selector.tsx:27–66`; groups hook `use-wall-chart-groups.ts:80–92`, resolver `lib/campaign/groups/resolve-group-selection.ts:79–102` | every `campaign_groups` row is offered; `?group=`/prefs validated against every group |
| Drop planner | `lib/campaign/groups/plan-drop.ts:48–82`; actions `use-wall-chart-actions-v2.ts:54–103` | one `placements.move` per source (`move-worker-mutation.ts:132–156`), `keepInParent` left at the wrapper default (`structure-api.ts:630` → `p_keep_in_parent: true`), `withinGroupId` only on the Unassigned drop |
| Card menu | `wall-chart/v2/unit-card-menu.tsx:47–56` | Rename, Set estimate, Assign people, Split, Merge, Delete on every card |
| Dialogs | `wall-chart/v2/wall-chart-dialogs-v2.tsx:270–283` (split with `sourceContainer`), `:293–311` (delete with `allOus={groupUnits}`, `childOuIds={[]}` — D17), `:115–120` (move targets) | a root with children deletes them (`delete-organising-unit-dialog.tsx:116–122` sends `deleteChildren: true`) **without saying so**, because the dialog never learns it has children |
| Units manager | `wall-chart/v2/wall-chart-toolbar.tsx:279–290` mounts `WallChartUnitManager` with `flat` | no tree (`wall-chart-unit-manager.tsx:53–67` builds one when not `flat`) |
| Metrics / empty / hidden | `use-wall-chart-view-v2.ts:247–260`, `:268–284` | per unit; "Show empty units" per unit; a hidden unit is one card |
| Census | `v2/__tests__/wall-chart-v2.control-census.test.tsx:191–247` | 24/25 fixed page; 2 per unit card; asserts no `Show sub-units` / `Unit view` / `Expand all` / `Collapse all` |
| Fixture | `wall-chart/__tests__/harness/fixture.ts:160–164`, `:175–179` | the `small` fixture **already has the shape**: ou 13 "South Deck" (`shift`, Shift group 3) with `parent_ou_id: 12` "Acme South" (Employer group 1) under container 10; worker 104 (Dan) is on 13 **only** — a child-only row; the Shift group has no other unit, so it is sub-unit-only. The interaction test `:887–896` pins today's flat reading ("Dan is in South Deck under Shift and Unassigned under Employer") |

### 2.3 The legacy chart's nesting (reference; untouched)

`hooks/use-wall-chart-structure.ts:355–365` `childrenByParent` (every `parent_ou_id`, containers included), `:372–376`
`parentByOu`, `:385–400` `parentExclusiveWorkersByOu` ("a worker assigned to BOTH a parent and one of its sub-units
should be displayed under the sub-unit only"), `:403–408`. `wall-chart-unit-hierarchy.tsx:109–115` top-level = `parent_ou_id
== null`; `:133–171` roll-up when sub-unit cards are collapsed; `:224–258` `groupRollupIds` / `groupMetrics` = the
container's own plus every child's workers; `:521–534` `WallChartSubUnits`, `:574–600` grandchildren; per-parent
"Unit view / Show sub-units" in localStorage (`wall-chart-model.ts:111`). The legacy model *assumes* the parent + child
double placement (the dedupe exists for it) but renders a child-only worker under the child all the same.

### 2.4 Every writer that creates or maintains the parent + child pair today (the evidence for §3.2)

| Writer | Parent row when placing on a sub-unit? | Where |
|---|---|---|
| Legacy `split_campaign_organising_unit` | kept (`p_keep_in_parent DEFAULT true`); removed only when `false` | baseline `:6147–6238` |
| `structure_unit_split`, cross-group child | `p_keep_in_source: true` → child inserted, source **kept** (`kept`); `false` → the source row is **re-pointed** to the child (child-only) | 2.2a `:2410–2440`; the dialog's switch default on, hidden for a same-group child (`split-unit-dialog.tsx:186`, `:517`, `:640–645`) |
| `structure_unit_split`, same-group child | the source row moves to the child (C-k) — the pair is impossible in one group | `:2373–2409` |
| `structure_placements_move` with a sub-unit target | `p_keep_in_parent` default `true`: parent placed with **`skip`** when the parent has a group of its own that differs from the target's (`:2726–2731`, `:2838–2845`); the parent row is never *moved*: a worker on worksite W2 dropped on a shift under W1 keeps W2 | `:2630–2860`; wrapper default `structure-api.ts:630` |
| `structure_placements_move` from the units-section reallocate | `keepInParent: false` (D50) → child-only | `campaign-units-section.tsx` (`wp/wp2.2.md:886`) |
| `structure_placements_assign` / `structure__place` | **no parent logic** | `:493–637`; callers: wizard/settings grids (D43/D46/D49), `add-workers/route.ts:185–191` (`onConflict: "skip"`; the chart's "Assign people…" posts here), imports, Recompute (`replaceRuleRows`) |
| `10_materialise_employer_placements.sql` / `structure_materialise_employer_placements` | only children of an **Employer container** via `ou_group_id` (`:3065–3140`, `JOIN … u.ou_group_id = c.ou_id`); plain-parent children (`ou_group_id NULL`, appendix C `:186`) untouched | `scripts/data-hygiene/oux-wp2.2/10_…sql` |
| Sync-on-open / reverse sync (`matchingOusForWorker`) | appends only the `ouGroupId` **container** (`sync-campaign-universe.ts:188–206`); a shift/crew unit has no employer/worksite basis and is never matched | `:145–207` |
| Merge (`structure_unit_merge`), delete reassignment (`structure_unit_delete`) | move rules of `placements.move` (`:1955`); no parent logic of their own | `:1957–2203`, `:1934–1955` |

---

## 3. Target design

### 3.1 Principles (WP2.4's, plus three)

1–9 as `wp/wp2.4.md` §3.1. In addition:

10. **Nesting is a rendering of `parent_ou_id`, not a third group model.** Groups stay what WP2.1 made them; a sub-unit
    is still a unit of its own group (its placements carry that group). The tree is derived per group view from data the
    chart already holds; nothing is stored.
11. **The chart maintains the parent + child pair for what it writes, and tolerates its absence for what it reads.**
    Every WP2.4c drag plans the parent placement explicitly (§3.7); the derivation shows a child-only worker under the
    child anyway (§3.4), because other writers create that shape today (§2.4) and WP2.7's auto-build will too.
12. **Facet links are not nesting.** The Employer-container → worksite link is what decision 5 (2026-09-08) flattened
    into two independent groups; it never renders as a tree (NE-a, §3.3).

### 3.2 The data-invariant finding (NP) and the read-only shape query

**Finding.** No constraint, trigger, RPC or script guarantees that a worker placed on a sub-unit also holds a
placement on the sub-unit's parent. The pair is the *default* of the wall-chart writers (legacy split, `structure_unit_split`
with the switch on, `structure_placements_move` with `p_keep_in_parent`), and **only** of those: the assign RPC, the
grids, the add-workers route, imports, Recompute, the units-section reallocate (D50) and any split with the switch off
create child-only rows; the `10` materialisation and the universe sync add container placements for `ou_group_id`
members and never touch a plain-parent child (§2.4, each with its `path:line`). Nor does anything remove a child
placement when the parent placement moves: `structure_placements_move` places the parent with `skip`, so a worker on
worksite W2 dropped on a shift under W1 ends with W2 + the W1 shift (an *orphan* pair, §3.4 NC), and the reverse sync
(SM-a, WP2.4b) will move `universe` worksite rows without looking at shifts. `campaign_group_membership` reports the
worksite row only: a child-only worker is `ou_id NULL` in Worksite. Whether production campaign 42 holds child-only
or orphan rows today cannot be read by an agent; the operator can count them with the query below.

**Consequence for the design.** The nested derivation cannot key "in U" on U's own placement; it must treat a
placement on a child of U as "in U's subtree" (§3.4), and the equivalence with the view is re-stated as an equality
*plus a named divergence set* (§4.1). Every drag this package plans keeps the pair (§3.7), so the chart never widens the
divergence.

**Options.**

- **NP-a (recommended).** Derive and tolerate: the tree derivation places a child-only worker under the child (root
  inferred from `parent_ou_id`), counts them in the parent's roll-up, excludes them from Unassigned in the parent's
  group, and reports the divergence set; the chart's writers keep the pair; no data change.
- **NP-b.** Additionally repair existing data with an operator-run script through the existing
  `structure_placements_assign` RPC (`source: 'manual'`, `onConflict: 'skip'`, one row per child-only pair), in the style
  of `oux-wp2.2/10`. No migration. Not recommended now: Recompute (rule rows on shift units, which WP2.7 AB-a will
  create) would keep producing child-only rows, so the repair is not durable, and the view-equivalence gain is cosmetic
  once WP2.5/2.6 consume the tree derivation (§3.17). Offered so the operator can choose it if the campaign-42 count is
  large.
- **NP-c.** Enforce the pair in the database (a trigger that inserts the parent row on a child insert, or refuses).
  A migration and a behaviour change for every writer, including rule rows. Out of scope; recorded for WP2.8.

**`scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql`** (read-only; no `SET LOCAL`, no writes; safe on any project):
per campaign, (a) sub-unit-only groups (`campaign_groups` with ≥ 1 unit, every unit having a `parent_ou_id` whose parent
is not a container, carries a `group_id`, and is in another group); (b) `child_only_placements` — placements on a
**nested** sub-unit (a plain-parent child **whose group differs from its parent's**, which under NE-a as narrowed by
ruling 1 is what "sub-unit" means) whose worker has no placement in the parent's group; (c)
`orphan_child_placements` — the same, where the worker's placement in the parent's group is on a *different* unit;
(d) `paired_placements`. Queries (b)–(e) count **campaign members only** (they join `campaign_worker_membership`, as
the view and the derivation do) and report **workers** as well as placements, because one worker can hold sub-unit
placements under two parents and so fall in two classes at once; the worker counts are what NP-b would repair (D9).
The cross-group condition is the definition of the shape, not a filter on it: a same-group
parent can never hold the worker beside the child (C-a / WP2.2b), so the pair cannot exist there (D2, D6). (e) repeats
(b)–(d) per parent group and (f) counts the nesting edges and the facet links per campaign.
The §4.1 equivalence test transcribes (b) and (c) into the fixture generator so the test and the query name the same
sets. The agent may run it on normal dev (read is free; confirmation requested at §9.1 item 5); the operator runs it on
production and pastes the four counts for campaign 42 into §9.2, which also settles whether NP-b is wanted.

### 3.3 What is a nesting edge (NE)

- **NE-a (recommended; narrowed by ruling 1, §11.9).** Unit C is *nested under* unit P iff `C.parent_ou_id = P.ou_id`,
  P exists in the campaign's units, **P is not a group container** (`is_group_container` false), **P carries a
  `group_id`** and **that group differs from C's**. The last condition is ruling 1: a child in its parent's own group
  (the same-kind Split child, C-k) can never carry the parent + child pair the nested model is built on, because the
  one-unit-per-group index (WP2.2b) forbids a worker holding both rows; `DECISIONS.md:14`'s "Split creates sibling
  units in the same group" is unamended, and the operator's requirement is cross-group nesting (a shift under a
  worksite). Such a child is therefore an ordinary **root card of its own group, beside its parent**. A link to a
  container (the `ou_group_id = parent_ou_id` membership shape; the Employer container → worksite link) is a facet
  link and never nests: the Employer group keeps showing EDI Downer as one ordinary card holding its materialised
  placements (`wp/wp2.4.md` §3.3 "Containers under v2", unchanged), and the Worksite group keeps every worksite as a
  root — which is what the operator uses as the primary grouping. Under NE-a the deepest rendered tree is **two
  levels** (unit → sub-unit): the depth trigger permits a third level only under a container, and the container edge
  is not rendered as nesting. Both D45 shapes nest (`ou_group_id NULL` and the legacy `ou_group_id = parent_ou_id`
  under a plain parent), because the test is on the parent and the two groups, not on the child's `ou_group_id`.
- **NE-b.** Every `parent_ou_id` link nests, containers included. The Employer view would render the whole campaign as
  one three-level tree under EDI Downer and — fatally — the Worksite group would be classified sub-unit-only (every
  worksite has a parent in the Employer group) and vanish from the selector. Rejected; contradicts decision 5's facet
  reading, which the operator did not amend.

### 3.4 The nested derivation (NV, NC) — `lib/campaign/groups/derive-group-tree.ts`

- **NV-a (recommended).** A new pure module beside `derive-group-view.ts`; `deriveGroupView`, `unitsOfGroup`,
  `notInAnyGroup`, `unitsByWorker` and `groupOfUnit` are **not edited** (they are the flat contract WP2.5/2.6 cite by
  line and the §4.1 view-equivalence oracle). WP2.5/2.6 switch to the tree functions where nesting matters (§3.17).
- **NV-b.** Fold nesting into `deriveGroupView` (an options argument). Fewer exports, but it changes the meaning of
  `placementByWorker` (the RPC needs the *actual* row, the display needs the *effective* root — two different things)
  under the same name, and every cited line in three approved-in-principle plans moves. Not recommended.

```ts
// pure, never throws; inputs are the same structural row types as derive-group-view.ts
export type TreeUnitLike = GroupUnitLike & { readonly parent_ou_id?: number | null; readonly is_group_container?: boolean | null };

export function nestingParentOf(ou: TreeUnitLike, ouById: ReadonlyMap<number, TreeUnitLike>): number | null; // NE-a
export function childrenByNestingParent<U extends TreeUnitLike>(ous: readonly U[]): Map<number, U[]>;        // caller order kept
export function isPrimaryGroup(groupId: number, ous: readonly TreeUnitLike[]): boolean;
export function primaryGroups<G extends GroupLike>(groups: readonly G[], ous: readonly TreeUnitLike[]): G[]; // orderGroups order

export type GroupTree<U extends TreeUnitLike = TreeUnitLike> = {
  groupId: number;
  /** Units of G with no nesting parent, in the units query's order (the cards). */
  roots: U[];
  /** Units of G whose nesting parent is a unit of ANOTHER group: rendered flat after the roots as "<Parent> › <Unit>" (the mixed case). */
  foreignNested: U[];
  /** root → its nested children (any group), in the units query's order. Every root has an entry. */
  childrenByRoot: Map<number, U[]>;
  /** Every card in G's view: roots, their children, foreignNested. */
  nodeIds: Set<number>;
  /** worker → the ONE card that shows the tile (child when the worker holds one under their root; else the root / flat card). */
  nodeByWorker: Map<number, number>;
  /** worker → the root (or flat card) they count under — the compare/list value of "in U" (§3.17). */
  rootByWorker: Map<number, number>;
  /** node → tiles, member order. Every node has an entry. */
  workersByNode: Map<number, number[]>;
  /** root → every worker in its subtree (own area + children), member order — the roll-up (B5). */
  subtreeByRoot: Map<number, number[]>;
  /** worker → their actual placement on a unit of G, when any (= deriveGroupView().placementByWorker). */
  placementByWorker: Map<number, number>;
  /** worker → the child node whose card DRAWS the tile (the first in `childrenByRoot` card order when they hold two; absent for a root-only worker). */
  childPlacementByWorker: Map<number, number>;
  /** worker → EVERY child node they hold in this tree, in card order (D7): what a drop out of the subtree must clear. */
  childPlacementsByWorker: Map<number, number[]>;
  /** Members with no placement on any node of G's tree — "Unassigned in G". */
  unassignedWorkerIds: number[];
  /** Divergence from the view (§3.2, §4.1): child-only workers → inferred root. */
  childOnlyByWorker: Map<number, number>;
  /** NC-a: child placements under a root other than the worker's own G placement → not rendered in G's view. */
  orphanChildByWorker: Map<number, number>;
};
export function deriveGroupTree<U extends TreeUnitLike>(members, ous: readonly U[], placements, groupId): GroupTree<U>;
```

Semantics, stated once so §4.1 can pin them:

- `roots(G)` = units of G with `nestingParentOf(...) === null`. A same-kind child of a unit of G (legacy split with
  the source's own type; C-k) has no nesting parent under ruling 1 (§3.3) and is therefore a **root**, rendered beside
  its parent; its members count under it, never in its parent's roll-up. `foreignNested(G)` = units of G nested under a unit of another group;
  in G's own view they render flat after the roots, labelled "<Parent> › <Unit>", so every placement in G is on screen
  exactly once (the mixed case: a Shift group with one standalone root and shifts under worksites).
- Every child node is a unit of another group (§3.3), so a member's row in G is never itself a child node.
- For member w: let `p` = w's placement on a unit of G (if any), `c` = w's placement on a child node whose root is R
  (if any). Then: `c` present and (`p` absent or `p === R`) → `nodeByWorker = c`, `rootByWorker = R`, and if `p` is
  absent, `childOnlyByWorker = R` (NP-a). Else `p` present → `nodeByWorker = rootByWorker = p`; a `c` under a root
  other than `p` is recorded in `orphanChildByWorker` and **not rendered** (NC-a). Neither → Unassigned in G.
- **NC-a (recommended).** The worker's own placement in G wins; the orphan child placement is not drawn in G's view
  (drawing it would show one worker on two cards of one group), it is counted and returned, the sheet's Units tab still
  lists it ("Shift › Night", unchanged), and the next drag normalises it (§3.7 NS-a; C-b displaces it when the worker
  is dropped on any shift). **NC-b:** draw the worker under the orphan child too, with the ◫ "also in" marker. Rejected:
  a worker twice in one group's view contradicts the one-unit-per-group reading the band is built on.
- A worker may legitimately hold **two children of one root in two groups** (a shift and a crew under one worksite;
  §3.7 row 9). The tile is drawn on the first of them in `childrenByRoot` **card order** — never in placement-row
  order, since the placements query is unordered — they are counted once in the roll-up, and every held child row is
  reported in `childPlacementsByWorker` so the planner clears them all (D7).
- `subtreeByRoot(R)` = the union of `workersByNode(R)` and every child's list; the root card's header count,
  placeholders (`estimate − |subtree|`) and summary metrics use it (B5). Children's metrics use their own list.
- `unassignedWorkerIds(G)` = members with no node; every rendered root has a `subtreeByRoot` entry, the flat
  `foreignNested` cards included (D9). A worker in a nested shift is therefore **not** Unassigned in
  Worksite, and — since they hold a grouped placement — **not** in Not in any group (`notInAnyGroup` unchanged).
- Depth-two children of a container root (container → unit → sub-unit) are *not* in the Employer view's tree (the
  container edge is not nesting), so a container card never nests anything (NE-a).
- Cost O(members + units + placements); the same three row sets as `deriveGroupView`, no query.

Equivalence with `campaign_group_membership`, re-stated for the nested case (the §4.1 test): for every member and
group, `view.ou_id` (= `placementByWorker`) is unchanged; `rootByWorker` equals `view.ou_id` for every member **except**
the members of `childOnlyByWorker`, for whom the view says `NULL` and the tree says the inferred root — and that set is
exactly (b) of `00_nesting_shape.sql`. **That is the only divergence class** (ruling 1, §11.9: the first Stage-1 round
found a second one — a member whose row in G is a C-k child of another unit of G — and the ruling removed it at the
source by making such a child a root, so the view and the tree both name that unit). When the pair holds for every
child placement, the two are equal.

### 3.5 Primary groups, the selector, the resolver and Not in any group (SG)

`isPrimaryGroup(G)`: G has no units, or at least one unit of G is a root (no nesting parent — under ruling 1 a nesting
parent is never in G, so the original "or a nesting parent in G itself" clause is subsumed: a C-k child is a root). A group with units, every one of which is nested under a unit of another group, is **sub-unit-only** and not
primary (B2). Campaign 42's Shift group and the `small` fixture's Shift group (ou 13 under 12) are sub-unit-only.

- **SG-a (recommended).** The Group selector lists `primaryGroups(groups, ous)` then "Not in any group". The resolver
  (`resolve-group-selection.ts:79–102`) validates `?group=` and the prefs `group` against the **primary** ids
  (`resolveGroupSelection` gains an optional `primaryIds` — absent → today's behaviour, so every existing caller and
  test is unchanged); a URL or a stored preference naming a sub-unit-only group falls through to the next step, exactly
  as a deleted group does today (`wall-chart-prefs.ts:163` already tolerates a stored id outside the known set). Nothing
  the selector does not offer is reachable, and no view exists that would show "Unassigned in Shift".
- **SG-b.** Not listed but reachable by `?group=`, rendering every unit flat as "<Parent> › <Unit>". Keeps a dead view
  alive for a link nobody can make from the UI. Not recommended.

Under either option: **Not in any group** is unchanged (`notInAnyGroup`, `derive-group-view.ts:165–182`) — a worker in
a nested shift holds a Shift placement and is not listed there; a legacy custom container with `group_id NULL` still
counts for nothing. **Unassigned** exists per primary group only; "Unassigned in Shift" is never rendered. The `?ou=`
step of the resolver, given a nested unit's id, resolves to the unit's **root's** group (the unit's own group is not
primary) and the focus effect scrolls to the nested card (`data-ou-id` is the unit id, unchanged).

Zero primary groups with groups present (every group sub-unit-only — impossible while NE-a requires a parent that
carries a group, since the top of any chain is a root of its group) is nonetheless handled: the selector shows only Not
in any group, as with zero groups.

### 3.6 Rendering: the band, the cards, roll-ups, hidden and empty units (XP)

- **Band** (`wall-chart-group-band.tsx`): `renderedUnits` are the **roots** of the selected group (then `foreignNested`
  flat, then Unassigned last). A root with children renders `UnitCardV2` with `subUnits={children.map(...)}` into
  `CampaignUnitCard`'s existing slot (`campaign-unit-card.tsx:323–329`, the "Sub-units" caption becomes "Units in
  <Root>" — a `subUnitsLabel?` prop, additive, default "Sub-units" so the legacy DOM is unchanged), each child a
  `UnitCardV2` with `nested` (`:72`) and `data-ou-id={child.ou_id}` (the highlight and `?ou=` contracts hold).
- **Root card**: tiles = `workersByNode(root)` filtered/sorted by the one pipeline; header count reads
  "`<subtree count>` in unit · `<own count>` not yet in a sub-unit" when the root has children (one string, `aria-label`
  carries both numbers); placeholders = `max(0, estimate − |subtree|)`; summary metrics over the subtree (B5;
  `computeMetrics` over `subtreeByRoot`, the legacy `groupMetrics` rule `wall-chart-unit-hierarchy.tsx:224–258`);
  `countAction` selects the root's **own** tiles only. A "N sub-units" `Badge` (non-interactive) in `headerBadges`.
- **Child card**: tiles = `workersByNode(child)`; count, placeholders, metrics over its own list; `assessmentLabel` the
  campaign-wide title (no "Cumulative" hard-coding — v2 has no per-unit View; `EMPTY_PARENT_MAP` stays empty).
- **XP-a (recommended).** Nested cards are always expanded: no per-parent "Unit view / Show sub-units", no header
  "Expand all / Collapse all", no `hierarchyViewByParent`; the census keeps asserting their absence. **XP-b:** a
  per-parent expand state in the prefs document. Not recommended: a fourth view state for a tree that is at most two
  levels deep and, on campaign 42, exists under one worksite.
- **Show empty units** (`use-wall-chart-view-v2.ts:256–260`): a root is empty only when its *subtree* is empty after
  filtering; an empty child card is hidden under the same switch; "N empty units hidden" counts both.
- **Hidden units (HU-a)**: hiding a root hides its subtree; hiding a child hides the child card only — its workers still
  count in the root's roll-up (the legacy rule, `wall-chart-unit-hierarchy.tsx:139–142`) and are **not** shown in the
  root's own area. The Units manager (§3.9) lists the tree, so both can be ticked.
- **Tile context**: `index.unitsByWorker` maps each worker to `[nodeByWorker]` (still one entry: no ◫), `parentByOu`
  stays `EMPTY_PARENT_MAP`. The overlay (`RelationshipOverlay`) draws to the node tile. The rating-hint anchor walks
  roots and their children in DOM order.
- **Search / focus** (`use-wall-chart-group-view.ts:305–357`): the item label is "<Root> › <Child>" for a nested worker;
  focus un-hides the root and the child if hidden and highlights the child card.
- **Not in any group view**: unchanged.
- **Foreign-nested cards** (mixed case only): flat, titled "<Parent> › <Unit>", drop target for the plain
  `placements.move` of a flat group (the planner treats them as roots without children).

### 3.7 Drag rules under nesting (NX, NS) — `lib/campaign/groups/plan-nested-drop.ts`

Pure planner, superset of `planDrop` (`plan-drop.ts:48–82`, kept for the flat case and for WP2.5/2.6 callers):

```ts
export type MoveStep =
  | { kind: "move"; toOuId: number; fromOuId: number | null; workerIds: number[]; keepInParent: true }
  | { kind: "unassign"; withinGroupId: number; workerIds: number[] };
export type NestedDropPlan = { kind: "noop" } | { kind: "steps"; steps: MoveStep[]; refs: DropRef[] };
export function planNestedDrop(input: { refs; targetOuId: number | null; groupId: number | "none"; tree: GroupTree; groupOfUnit: (ouId) => number | null }): NestedDropPlan;
```

Per worker w, with `R(w)` = `rootByWorker`, `p(w)` = `placementByWorker` (the actual G row), `c(w)` =
`childPlacementByWorker`, `G'` = the group of a child, and the target T:

| T | w's position | Steps (in order) |
|---|---|---|
| root U (its own area) | node U | noop |
| root U | Unassigned in G | `move(null → U)` |
| root U | another root W (no child) | `move(W → U)` |
| root U | child C under U (c = C) | `move(null → U)` **only if** p absent (child-only); then `unassign within G'(C)` — and within the group of **every** child of U the worker holds, since the root's own area is "members in none of its children" (D8) |
| root U | child C under W ≠ U | `move(W or null → U)`; `unassign within G'(C)` (NS-a) |
| child C' under U, group G'' | node C' | noop |
| child C' under U | U's area (p = U) | `move(c'' or null → C', keepInParent)` where `c''` = w's G'' row if any (an orphan elsewhere is re-pointed, C-l) |
| child C' under U | sibling C under U, same group | `move(C → C')` |
| child C' under U | sibling C under U, another group | `move(w's G'' row or null → C', keepInParent)`; C stays (one unit per group each). The worker then holds two children of U: the tile is drawn on the first in card order, and both rows are carried in `childPlacementsByWorker`, so a later drop out of U's subtree clears both (D7) |
| child C' under U | root W or W's child, W ≠ U | `move(W or null → U)`; `move(w's G'' row or null → C', keepInParent)`; `unassign within G'(C)` for a child C under W in a group other than G'' (NS-a) |
| child C' under U | Unassigned in G | `move(null → U)`; `move(null → C', keepInParent)` |
| Unassigned in G | node anywhere in the tree | `unassign within G` (only if p present); `unassign within G'(c)` (only if c present) |
| a same-group child C' of U (C-k) — a **root** under ruling 1, not a nested card | any | exactly the root rows above, with `move(p → C')`: the RPC re-points the G row and writes nothing for a parent in the same group (`:2726–2731`); a worker arriving from another root's subtree still loses the child placement they held there (NS-a) |
| foreign-nested flat card | any | as a root without children |

Rules the table encodes, each pinned by a §4.1 case: **adds before removes** (a failure part-way never leaves the
worker with fewer placements than before); the parent placement is written **explicitly** (`move(… → U)`) whenever
the worker's G placement is not U, because the RPC's own `p_keep_in_parent` places the parent with `skip` and would
leave W in place (§3.2); `keepInParent` is passed `true` on every child target so the RPC's `skip` is the idempotent
no-op it is designed to be when U already holds the worker; `fromOuId` is always a row the worker actually holds (or
`null`), never the display node, so `P0002` cannot be raised; a target outside `nodeIds` is a noop (the D7 guard);
`groupId: "none"` is a noop; steps are merged across the dropped selection per (kind, target, source, group) so a
multi-select drop is a handful of calls, not one per worker.

- **NS-a (recommended).** A worker who leaves a root's subtree loses the child placement they held under it (the
  "unassign within G'(C)" steps). The operator's semantics — a shift belongs to its worksite — make a shift under the
  old worksite meaningless once the worker is on another; keeping it would manufacture the NC orphan shape on every
  cross-worksite drag. **NS-b:** keep it. Rejected.
- **NX-a (recommended).** Two (at most three) RPC calls in the order above, each its own transaction, executed by the
  existing `useMoveWorkersMutation` through an additive `steps?: MoveStep[]` on `MoveWorkerVars`
  (`move-worker-mutation.ts:12–50`; when present, `mutationFn` runs the steps in order in place of the refs loop, then
  the same stamping / reverse sync / invalidations `:158–179`; legacy callers never set it). Precedent: the mutation
  already issues one transaction per source unit ("a multi-source move is several", `:172–174`). A refusal on step n
  toasts "Step n of m failed: <structure sentence>. The chart shows what was saved." and the `onSettled` invalidation
  refetches; the state left behind is a shape the derivation renders truthfully (a worker moved to U but still holding
  the old shift is an NC orphan, hidden in G's view, visible in the sheet, normalised by the next drop). **NX-b:** a
  one-transaction "move within subtree" RPC — a migration and the promotion gate; recorded for WP2.8 if the partial
  case is ever seen in practice. **NX-c:** refuse cross-parent drags (only within one root) — the case the operator
  tests most (a worker from a small worksite onto the big worksite's shift) would need two drags. Rejected.
- **Stage-2 note (A-7):** `useMoveWorkersMutation` sums `{inserted, deleted, skipped}` across the steps, so a
  one-worker three-step drop returns `inserted: 3`. Nothing reads them today (`use-wall-chart-actions-v2.ts:74–92`
  reads only the error); any Stage-2 "N workers moved" copy must count workers itself, not use these totals.
- WP2.5's DG-c ("two writes, no transaction") was rejected for a *cell* drop; the difference here is that every step is
  independently meaningful and ordered adds-first, and the alternative is no nesting at all.
- **"Remove from <Group>"** (selection bar) = the Unassigned row of the table for the selected workers (unassign
  within G, then within each child group held).
- **Move to unit…** (`move-to-unit-dialog.tsx`): targets = roots, then each root's children as "<Root> › <Child>",
  then "Unassigned in <Group>"; the same planner.
- Employer/worksite stamping and the reverse sync after a move stay as they are (`:158–168`), issued once per mutation.

### 3.8 Split from the card menu (SP)

The existing `SplitUnitDialog` (`split-unit-dialog.tsx`) on a **root** already does what B4 asks: a child whose kind
differs from the source's shows "Keep workers in ‘<root>’ too" defaulting **on** (`:186`, `:640–645`, `:1178–1200`) and
sends `p_keep_in_source: true` (`:517`), so the worker keeps the root placement and gains the child's; a same-kind
child hides the switch and moves the row (C-k). After the split the new children carry `parent_ou_id = root`
(`structure_unit_split` defaults, `:2263–2270`) and appear nested at once (the `["campaign-ous"]` invalidation `:521`).
This package changes nothing in the dialog; §4.3 proves the nested rendering and the payload, and §4.6 step 1 uses it to
create the campaign-42 shape on dev.

- **SP-a (recommended).** The ⋯ menu of a **nested** card has no Split… item: a split there would create a grandchild
  under a plain root, which the depth trigger refuses (`baseline:1700–1710`) and the legacy dialog also refused
  (`wall-chart-unit-hierarchy.tsx:827`). `UnitCardMenu` gains `canSplit` (additive, default true). **SP-b:** offer it and
  let the trigger's sentence toast. Rejected: an item that can never succeed.
- Merge… on a nested card: partners are its **siblings in the same group** under the same root (C-j needs one group;
  the survivor keeps its `parent_ou_id`). Merge… on a root: partners are the other roots of G, as today.

### 3.9 Delete, Rename, Set estimate, the Units manager, the delete-reassignment targets

- **Delete a root with children**: the dialog receives `childOuIds = childrenByRoot(root).map(id)` (was `[]`, D17) so
  its existing "Delete group + N sub-units" branch (`delete-organising-unit-dialog.tsx:194–209`) and
  `deleteChildren: true` (`:116–122`) are *announced*; the sentence's "group" wording is the legacy dialog's and is left
  (principle 2; WP2.8 rewrites the dialog). **Delete a child**: `childOuIds = []`, `allOus` = the child's siblings in
  the same group under the same root plus that group's roots (the dialog's `getReassignmentTargetOus` then applies its
  same-parent rule, `ou-reassignment-targets.ts:31–33`, which WP2.7's D45-a rewrite must keep — §3.17).
- Rename… / Set estimate… on a child: `units.update` as today (MN-a).
- **Units manager** (`wall-chart-toolbar.tsx:279–290`): `flat` is dropped; `ous` = roots + children + foreign-nested of
  the selected group (the tree), so the manager renders its existing parent → children rows
  (`wall-chart-unit-manager.tsx:53–67`, `:155–158`; `isContainer` false under NE-a) and reorders roots with children
  following (`:80–99` → `units.reorder` over those ids; other groups untouched, `wp/wp2.4.md` §3.12). Hidden ids of
  children are carried in the same `hiddenOuIds` pref.
- **Create unit** ("New unit" in the manager → `CreateOrganisingUnitDialog`): unchanged; it cannot create a sub-unit
  under a plain parent today (`create-organising-unit-dialog.tsx:375`, `:409` write containers only), so on the v2
  chart a nested unit is created by **Split**. WP2.7's NU-a (`wp/wp2.7.md:664`) replaces this dialog; §3.17 asks it to
  offer "Nest under".

### 3.10 Assign people…, the sheet's "Add to another unit", imports (AP)

"Assign people…" on a card posts to `/api/campaigns/[id]/add-workers` → `placements.assign({ onConflict: "skip" })`
(`add-workers/route.ts:185–191`); the sheet's copy dialog issues `placements.move({ keepSource: true })` with the
wrapper's default `keepInParent` (`copy-worker-to-unit-dialog.tsx`, `move-worker-mutation.ts:120–131`). On a **child**
target the first creates a child-only row; the second adds the parent row with `skip` when the worker has none and
leaves a different worksite in place when they have one (an orphan).

- **AP-a (recommended).** Leave both writers as they are (WP2.4's files; the route is shared with the legacy chart)
  and rely on NP-a: the child-only worker renders under the child inside the root, and the next drag normalises. Only
  the **chart's own** "Assign people…" on a nested card is routed differently: the dialog's `contextOu` stays the
  child, and on success the v2 shell issues one `placements.move({ workerIds: <added>, fromOuId: null, toOuId: root })`
  for the added workers who hold no root placement — one additive `onAdded(workerIds)` callback on
  `AddCampaignWorkerDialog` (default undefined; legacy unchanged). The sheet dialog gains one rule under its existing
  `groups` prop (`:114–134`): a child target whose root differs from the worker's placement in the root's group is
  disabled with "Move to <Root> first" (additive; legacy passes no `groups`).
- **AP-b.** Route both through the nested planner. The route is a server writer shared with the legacy chart and the
  import wizard; changing it is a WP2.7/2.8 concern. Not recommended.

Imports, wizard/settings grids and Recompute keep creating child-only rows where they target a sub-unit; NP-a renders
them; §3.17 tells WP2.7 how its auto-build should place shift units.

### 3.11 The Employer view and containers (unchanged, stated for the reviewer)

Under NE-a the Employer group renders exactly as WP2.4 left it: the container is one card with its M2 placements, its
worksite members are cards of the Worksite group, nothing nests. A campaign whose employer is a **plain** employer
unit (no container) and whose worksites are children of it *would* nest worksites under the employer in the Employer
view (that is a genuine `parent_ou_id` link to a non-container parent) — and would demote the Worksite group to
sub-unit-only. The `00_nesting_shape.sql` counts (a) tell the operator whether any production campaign has that shape;
none is expected (appendix G §G.3: 18 employer containers on campaign 57; campaign 42's types are `custom, worksite`
plus the later shifts). If one appears, the operator decides between accepting the rendering and re-parenting the
worksites (a data change under a run sheet, not this package).

### 3.12 Telemetry, hints, accessibility

- `trackWallchartGroupSelected.group_count` = the number of **primary** groups (the selector's count).
- No new hint. The `wall_chart_group_selector` hint anchors as before.
- Nested cards: `CampaignUnitCard` is already a labelled region; the child card's title reads "<Child>" with the root
  named in the sub-units caption; the root's count button `aria-label` carries both numbers; keyboard: the ⋯ menu and
  the count button are reachable in DOM order (root, then children).

### 3.13 Copy (the exact strings)

"Units in <Root>" (sub-units caption); "<n> in unit · <m> not yet in a sub-unit" (root header count); "<n> sub-units"
(badge); "<Root> › <Child>" (search items, Move to unit… targets, flat foreign-nested titles, the sheet's rows are
already "<Group> › <Unit>"); "Step n of m failed: <sentence>. The chart shows what was saved."; "Move to <Root> first"
(AP-a). No string says "group" for a parent unit; "sub-unit" is the word the split dialog and the delete dialog already
use (WP2.8 / WP4 own the wording sweep, `wp/wp2.7.md:594`).

### 3.14 Migration: none

Nothing in this package changes the schema, an RPC or a policy; `structure_placements_move`'s `p_keep_in_parent`,
`p_within_group_id` and `structure_unit_split`'s `p_keep_in_source` are the parameters WP2.2 shipped for exactly this
model (D4). `git diff --stat main -- supabase/ packages/db-types/` must be empty (§5).

### 3.15 Performance

The tree derivation is linear; the `large` fixture has no nesting edges under NE-a (its vessels are children of
containers, `fixture.ts:300–302`), so its render cost is unchanged and §4.4 asserts it. A nested fixture of campaign-42
size (one root with a handful of children) is small. No new query: `parent_ou_id` and `is_group_container` are in the
units `select("*")` the chart already issues.

### 3.16 File boundaries with WP2.5, WP2.6, WP2.7 and WP2.4b (in flight)

| Package | Owns | WP2.4c touches? |
|---|---|---|
| **WP2.4c** | `lib/campaign/groups/derive-group-tree.ts`, `plan-nested-drop.ts` (+ tests); `resolve-group-selection.ts` (additive `primaryIds`); `wall-chart/v2/**` (band, card, group-view hook, actions, dialogs, selector, groups hook, move dialog, menu, tests, snapshots); `move-worker-mutation.ts` (additive `steps`); `campaign-unit-card.tsx` (`subUnitsLabel`), `unit-card-menu.tsx` (`canSplit`), `add-campaign-worker-dialog.tsx` (`onAdded`), `copy-worker-to-unit-dialog.tsx` (the AP-a lock), the harness fixture (a `nested` size); `tests/e2e/groups-v2/nesting.spec.ts`; `scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql` | — |
| **WP2.5** Compare | `wall-chart/compare/**`, `compareSlot`, prefs `compare` | consumes `deriveGroupTree.rootByWorker` and `primaryGroups` (§3.17); no shared file edited by both |
| **WP2.6** List | `workforce/**` v2 list, `lib/campaign/workforce-list-model.ts` | consumes `deriveGroupTree` (§3.17) |
| **WP2.7** Editor | `setup/**`, the wizard/settings, `ou-reassignment-targets.ts`, `create-organising-unit-dialog.tsx` (A3), `wall-chart-dialogs-v2.tsx:221–235` (NU-a) | **collision:** `wall-chart-dialogs-v2.tsx` — WP2.4c edits its split/delete/move wiring (`:115–120`, `:270–311`), WP2.7 its create-unit mount (`:221–235`); different lines, merged around; whichever lands second merges `main` |
| **WP2.4b** Mirror | `lib/workers/sync-campaign-universe.ts`, `reconcile-placements.ts` | none; §3.17 asks its rule to drop child placements under a vacated root |

WP2.4c should land **before** WP2.5 and WP2.6 are approved (their plans cite the flat derivation by line) and may run
in parallel with WP2.7 on the collision rule above.

### 3.17 Impact on WP2.5, WP2.6, WP2.7 and WP2.4b — amendments those plans must adopt before approval

**WP2.5 Compare (`wp/wp2.5.md`)**

- §3.2 (`:341–366`): the **primary** axis is the selector's primary group; the secondary list offers every *other*
  group — **CG-a (recommended):** including sub-unit-only groups, because Worksite × Shift is the matrix campaign 42
  wants (rows = worksites, columns = shifts + Unassigned; a shift under another worksite is an empty cell by
  construction, which is itself informative). **CG-b:** exclude them. Rejected.
- §3.3 (`:367–423`) `buildCompareMatrix`: the row value for a member is `deriveGroupTree(rowGroup).rootByWorker` (so
  a child-only worker sits in their worksite's row, as in the band) and the column value is the flat
  `deriveGroupView(colGroup).placementByWorker` when the column group is sub-unit-only (its units are the cells), or
  `rootByWorker` when it is primary. The "partition" property (`rowTotals` = the band's counts) then holds for the
  nested band's **subtree** counts; the equivalence-with-the-view test gains the §4.1 divergence clause.
- §3.9 TG-a (`:597–611`): the `small` fixture's third group (Shift) is sub-unit-only and no longer a primary; the
  "three primary groups" test uses the `withEmployerGroup` variant (Company, group 4) or the new `nested` fixture.
- §3.8 DG-a: a drop on a row header of a nested primary is a **nested** drop (the planner of §3.7), not `planDrop`.
- §2.8 `:289` and §4.1 item 2 cite the flat contract; re-cite.

**WP2.6 List (`wp/wp2.6.md`)**

- §3.5 (`:377–402`): the Unit column shows `rootByWorker` → `ouDisplayName`, with " › <Child>" appended when
  `nodeByWorker` is a child; the group selection uses `primaryGroups`.
- §3.8 (`:477–508`): sections per **root**, in the tree's order, each with its children as sub-sections (or the
  "<Root> › <Child>" form as one section per node in tree order — the WP2.6 planner chooses and records); "Unassigned in
  <Group>" last uses the tree's `unassignedWorkerIds`; the count button selects the node's rows.
- §3.7 OG (`:452–476`): a column for a sub-unit-only group (Shift) is the natural use of OG-a; the column reads the flat
  placement.
- §3.8 bulk "Move to unit…": the nested planner and the `steps` form of the mutation.
- §4.1 (`:666–690`): the equivalence case gains the divergence clause; the model imports `derive-group-tree.ts`.

**WP2.7 Editor (`wp/wp2.7.md`)**

- §1.3 `:106` and §3.1 principle 3 (`:328–331`) "no nesting; the editor never sets `parent_ou_id`": **amend** — the
  editor must be able to create a unit **nested under a root of another group** (Add unit → "Nest under: <root>" for
  the sub-unit kinds Shift / Crew / Work area / Custom; `structure_units_create` already accepts `parent_ou_id` as an
  integer or an earlier `client_ref`, `:936–960`), and must list nested units under their parent in the units panel.
  A Shift group built flat (no parents) is exactly the sibling-group shape the operator rejected.
- §3.9 AB-a (`:555–579`) auto-build for Shift / Crew / Work area: build **one child per (root worksite, option)** —
  "Day (KGP)", "Night (KGP)" under KGP — for members who hold a worksite placement, and the rule rows it creates are
  child-only rows (NP-a renders them; the pair is not maintained by Recompute, recorded there).
- §3.3 `:395–396` ("sub-units are units of their own group; Split… creates siblings"): true only for a same-kind child;
  re-word to WP2.2 D33's rule.
- §3.5 D45-a rewrite of `ou-reassignment-targets.ts`: keep the **same-parent** rule for a nested source (`:31–33`) —
  the v2 delete dialog depends on it (§3.9).
- §3.10 rows 5 (`:588`), 14 (`:597`), 26 (`:609`): "retired (decision 5)" no longer holds for the sub-unit case;
  §4.3 `:750` ("no `parent_ou_id` on a create") and §5 `:880` (the grep) must allow the Nest-under field.
- §3.13 NU-a (`:664`): the editor's Add-unit dialog mounted on the v2 chart must carry "Nest under" so the chart's
  "New unit" can create a sub-unit (today only Split can).

**WP2.4b Mirror (`wp/wp2.4.md` §3.15)**

- SM-a's `planReconcile` moves a `universe` worksite row from W2 to U; add: for each child placement the worker holds
  under W2 (any group), an `unassign within that group` step (NS-a), so the mirror never manufactures an orphan.

**WP2.8**

- Retires the legacy nesting readers; if NX partial states or NP-c are wanted, they are RPC/migration work there.

### 3.18 Terminology check

Group, Unit, Unassigned, Not in any group, Colour by (plan §3.6) everywhere; "sub-unit" only where the legacy dialogs
already say it (§3.13).

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run in `pnpm test`

- `lib/campaign/groups/__tests__/derive-group-tree.test.ts` — fixture **`CAMPAIGN_42_SHAPE`** (exported from the test's
  own `fixtures.ts` and reused by §4.3 through the harness): an Employer container E (`is_group_container`, `group_id`
  Employer, holds materialised placements), worksites W1–W4 (`parent_ou_id = ou_group_id = E`, Worksite), shifts S1, S2
  under W1 (`parent_ou_id = W1`, `ou_group_id NULL`, Shift), a same-kind child W1b under W2 (`worksite`, Worksite — the C-k shape,
  which ruling 1 renders as a **root beside W2**, with one member of its own), a legacy custom container L
  (`group_id NULL`) with one custom member; members: paired (W1 + S1),
  paired (W1 + S2), root-only in W1, child-only (S2, no worksite), orphan (W2 + S1), W3-only, W4-only, E-only,
  Unassigned everywhere, L-only, a non-member on S1. Cases: NE-a edges (E → W* is not nesting; W1 → S1 is; **W2 → W1b is not**, ruling 1);
  `primaryGroups` = [Employer, Worksite] (Shift excluded; a group with zero units is primary; the mixed case with a
  standalone shift root makes Shift primary and lists the nested shifts as `foreignNested`); the Worksite tree's roots,
  `childrenByRoot`, `nodeByWorker`, `rootByWorker`, `workersByNode`, `subtreeByRoot` (W1's roll-up = paired ×2 + root-only
  + child-only; W2's = W2-own only, W1b's own members counting under W1b — the ruling-1 case), `unassignedWorkerIds` (Unassigned-everywhere, E-only, L-only; **not** child-only);
  `childOnlyByWorker` = {child-only → W1}; `orphanChildByWorker` = {orphan → S1} and the orphan renders under W2 only
  (NC-a); the Employer tree has no children under E (NE-a); `notInAnyGroup` unchanged; a container root never nests;
  member order kept, non-members ignored, duplicates collapsed; **equivalence**: the flat `deriveGroupView` equals the
  transcribed view (unchanged cases), and `rootByWorker` equals the view except on `childOnlyByWorker` **and on nothing
  else**, and that set equals the transcription of `00_nesting_shape.sql` (b) over the fixture; (c) equals
  `orphanChildByWorker`; with the child-only and orphan rows removed, equality is exact.
- `plan-nested-drop.test.ts` — every row of the §3.7 table with the exact step list and order (adds before removes;
  `fromOuId` always a held row; `keepInParent: true` on every child target; per-(kind, target, source, group) merging of
  a multi-select; noop rows; a target outside the tree; `"none"`; a flat group (no children) yields the same calls as
  `planDrop` for every `planDrop` case — the superset property, checked by running both).
- `resolve-group-selection.test.ts` (+ cases) — `primaryIds` absent → unchanged; a `?group=` / stored group outside
  `primaryIds` falls through; `?ou=` naming a nested unit resolves to its root's group.
- `move-worker-mutation.test.tsx` (+ cases) — `steps` executed in order with the recorded `rpc` args; the refs loop is
  not run when `steps` is present; a refusal on step 2 rejects with the step index and the structure sentence; stamping
  and the reverse sync run once after the last step; legacy vars unchanged.
- `unit-card-menu` — `canSplit: false` renders no Split item (small; inside the §4.3 file).

Test count must be ≥ **1,563** (`main` at `7e8a3fab`, `PROGRESS.md:45`; `3cb0bd5a` is docs-only since); no test skipped,
quarantined or deleted. The existing `derive-group-view.test.ts`, `plan-drop.test.ts` and every legacy suite are
unchanged.

### 4.2 Contract tests (DB-backed) — none added

Every RPC call the planner emits is already covered on dev: `placements.move` with `keepInParent` on a sub-unit target
(`lib/campaign/__contract__/structure-api.contract.test.ts:1027–1050`), with a null target and `withinGroupId`
(`:1017`), the refusal of `withinGroupId` with a target (`:1053–1055`), `placements.unassign({ withinGroupId })`
(`:1066–1069`), `units.split` with `keepInSource` (Stage 1 suite), `units.remove({ deleteChildren })`. Not re-run
unless the reviewer asks (dev only, `OUX_CONTRACT_*` in the operator's shell).

### 4.3 Interaction tests (jsdom, the WP2.3/WP2.4 harness extended) — `wall-chart/v2/__tests__/`

Harness: `fixture.ts` gains a third size **`"nested"`** = `CAMPAIGN_42_SHAPE` with names ("EDI Downer", "KGP",
"Barrow", "Ichthys", "Wheatstone", "Day", "Night"), 20 members, `campaign_groups` Employer / Worksite / Shift; the
`small` fixture is unchanged (its ou 13 under 12 is the child-only shape and stays as the Employer-view nesting case).

- `wall-chart-v2.nesting.test.tsx` (new, `nested` fixture): the selector lists Employer and Worksite only; on Worksite,
  KGP's card contains nested Day and Night cards, KGP's own area holds its members not on a shift, the header reads the
  two numbers, the badge says "2 sub-units", Barrow/Ichthys/Wheatstone have no nested cards; the child-only worker
  renders under Night; the orphan (Barrow + Day) renders under Barrow and not under Day; roll-up metrics on KGP cover the
  subtree; drag KGP area → Day: one `structure_placements_move` `{ p_from_ou_id: null, p_to_ou_id: Day, p_keep_in_parent: true }`;
  Day → Night: `{ p_from_ou_id: Day, p_to_ou_id: Night }`; Night → KGP area: `{ p_to_ou_id: null, p_within_group_id: Shift }`;
  child-only → KGP area: `move(null → KGP)` then the unassign; Barrow area → Day: `move(Barrow → KGP)` then
  `move(null → Day)` **in that order**; Day → Unassigned in Worksite: unassign within Worksite then within Shift; a
  refusal on the second step toasts "Step 2 of 2 failed…" and both invalidations fire; Move to unit… lists "KGP › Day";
  Remove from Worksite on a nested tile issues both unassigns; the nested card's ⋯ menu has Rename, Set estimate, Assign
  people, Merge, Delete and **no Split**; Split… on KGP opens the dialog, a Shift child shows the switch on and the
  payload carries `p_keep_in_source: true`; Delete… on KGP passes `childOuIds` (the "+ 2 sub-units" sentence) and
  `p_delete_children: true`; Delete… on Day lists Night as a reassignment target; the Units manager lists Day/Night
  under KGP, hides Day (card gone, still counted in KGP's roll-up), reorders KGP above Barrow with the children
  following; Show empty units off hides an emptied Night; Find worker shows "KGP › Day" and highlights Day's card;
  `?ou=<Day>` opens on Worksite and highlights Day; a stored `group: Shift` falls through to Employer; `?group=<Shift>`
  is rewritten; the sheet's Units tab still lists "Shift › Day" for the orphan (NC-a visibility); Assign people… on Day
  issues the add-workers POST then one `move(null → KGP)` for an added worker without a worksite (AP-a).
- `wall-chart-v2.interaction.test.tsx` (existing, `small`): the Dan case (`:887–896`) is **rewritten** — "Dan is nested
  under Acme South in the Employer view; Shift is not offered" — and the "lists the groups in display order" case
  (`:171`) expects Employer, Worksite, Not in any group. Recorded as a v2-suite change (not a legacy one).
- `wall-chart-v2.control-census.test.tsx`: a new region "nested unit card: <name>" with the rule ≤ 2 controls (rating,
  ⋯) + the count click; the root card unchanged at 2; `FORBIDDEN_NAMES` still absent (no `Show sub-units`, `Unit view`,
  `Expand all`, `Collapse all`); the console table gains the nested rows; fixed page 24/25 unchanged; run on `small`
  (Employer view now nests South Deck) and on `nested`.
- `wall-chart-v2.characterization.test.tsx`: the `default` and `read-only` snapshots change (South Deck nested under
  Acme South) and a `nested` snapshot is added — the deviation table records the exact attribute diff.
- Flag off: every legacy suite unchanged; `workforce-board.test.tsx` unchanged.

### 4.4 Render cost

`wall-chart-v2.render-cost.test.tsx` unchanged in mechanism; the `large` fixture has no NE-a edge, so its v2 numbers
must be within the existing `NOT_WORSE_FACTOR` of the legacy median as before, and a third mount on `nested` is
reported (not asserted; it is small).

### 4.5 e2e (Playwright, written and type-checked, unrun — D80/D81 of WP2.2 apply)

`tests/e2e/groups-v2/nesting.spec.ts` (+ two helpers in `groups-v2/helpers.ts`: `createNestedUnits(client, parentOuId,
names, ou_type)` via `structure_units_create` with `parent_ou_id`, and `removeUnit(client, ouId, deleteChildren)`):
under `withUserPrefs({ mode: "full", flags: { groups_v2: true } })`, on campaign 1: pick a worksite root A (create one
through `createUnits` if the campaign has none), create children "Day"/"Night" (`ou_type: "shift"`) under A, place W on
A; open `?group=<Worksite>`: the Shift group is absent from the selector, Day/Night are nested in A; drag W from A's
area onto Day: oracle `campaign_group_membership` Worksite → A, Shift → Day; Day → Night: Shift → Night; Night → A's
area: Shift null, Worksite still A; Day → Unassigned in Worksite: both null; `afterAll` restores W and removes the two
children. Existing specs stay green with the flag off for the e2e account.

### 4.6 Operator hand-test checklist (HT) — the campaign-42 shape on the branch preview

**Does dev have the shape?** No. Normal dev is thin (8 units, 111 placements across campaigns, `PHASE2_MAIN_ORCHESTRATION_PROMPT.md`
environment table); campaign 1 has 95 members / 4 units with groups such as Employer and Worksite
(`wp/wp2.4-acceptance-checklist.md:18`); the e2e specs that create shift sub-units sweep them (`structure-api.spec.ts:504–540`).
The checklist therefore **creates the shape through Split from the card menu** on the v2 chart (the very control B4
names), then tests, then deletes it. No SQL, no connector.

- **HT-a (recommended).** The operator runs the checklist below by hand on the branch preview (dev data), as for
  WP2.4 (E2-b) and WP2.2; the orchestrator records the result in §9.2. **HT-b:** a credentialled Playwright run of
  `nesting.spec.ts`. Offered; the operator declined secrets for WP2.2/2.4.

Checklist (to be copied to `wp/wp2.4c-acceptance-checklist.md` at Stage 3 with the preview URL, one expected sentence
per step, the WP2.4 setup section reused for the flag):

0. Setup: as in `wp2.4-acceptance-checklist.md` Setup 1–5 (flag on for the e2e user; open campaign 1's wall chart;
   choose **Worksite** in Group). If Worksite has no unit: **Units → New unit**, type Worksite, name "Test site".
1. **Create the shape.** On a worksite card (call it A) with at least three workers: ⋯ → **Split…** → "Custom (define
   your own)" → Continue → name "Day", type **Shift**; add a second "Night", type Shift → Continue → assign one worker to
   Day and one to Night → Continue → *Expected: the Review step shows the switch "Keep workers in ‘A’ too" **on***. →
   Create 2 sub-units. *Expected: A's card now contains two nested cards, Day and Night, one worker each; A's own area
   holds the rest; A's header reads "N in unit · M not yet in a sub-unit".*
2. **Sub-unit-only group is not primary.** Open the Group control. *Expected: Shift is **not** listed; the groups
   listed are the same as before plus nothing; no card "Unassigned in Shift" exists anywhere.*
   *(Operator checklist note, 2026-09-17: a sector campaign whose vessels are nested under Employer units — campaign 64 —
   likewise shows no Worksite group in the selector; expected under SG-a, not a bug; `PROGRESS.md` incidental findings
   2026-09-17, plan §5.5 addendum.)*
3. **Parent area → child.** Drag a worker from A's own area onto Day. *Expected: the tile moves into Day; open the
   worker's sheet → Units tab lists "Worksite › A" **and** "Shift › Day".*
4. **Child → child.** Drag that worker from Day onto Night. *Expected: the tile is in Night; the Units tab lists
   "Worksite › A" and "Shift › Night".*
5. **Child → parent area.** Drag the worker from Night onto A's own area (not onto a nested card). *Expected: the tile
   is back in A's area; the Units tab lists only "Worksite › A".*
6. **Another worksite → a child (two steps).** Drag a worker from another worksite card B's area onto Day. *Expected:
   the tile is in Day inside A; the Units tab lists "Worksite › A" and "Shift › Day" and no B.*
7. **Child → Unassigned in Worksite.** Drag the worker from Day onto "Unassigned in Worksite". *Expected: the tile is
   in the Unassigned card; the Units tab lists neither Worksite nor Shift; the worker appears in Not in any group.*
8. **Roll-up and filter.** Turn on a Filter that matches nobody in Day. *Expected: with Show empty units off, Day's
   card disappears and "1 empty unit hidden" appears; A's header still counts Day's worker in "N in unit".*
9. **Units manager and search.** Open **Units**: Day and Night are listed under A; untick Day. *Expected: Day's card is
   gone, A's count unchanged.* Find worker → the worker placed in Night: *Expected: the item reads "A › Night"; choosing
   it highlights Night's card and opens the sheet.*
10. **Menus.** ⋯ on Night: *Expected: Rename, Set estimate, Assign people, Merge, Delete — no Split.* ⋯ on A →
    Delete…: *Expected: the dialog says A has 2 sub-units and offers "Delete group + 2 sub-units".* Cancel.
11. **Clean up.** Put worker(s) back where step 0 found them (Move to unit…); ⋯ → Delete… on Night, then on Day,
    reassigning to "Unassigned" (which removes only the shift placement); confirm the Units tab of each touched worker
    matches step 0. Optionally untick the flag.
12. **Legacy unchanged.** Sign in as a user without the flag: the old chart renders the shape as before (this can be
    checked before step 11 while the shape exists).

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit
pnpm --filter organising-db lint           # touched lines clean; total problems ≤ 295 (143 errors / 152 warnings; wp/wp2.4.md §11.4)
pnpm --filter organising-db test           # ≥ 1,563; no skips added

# acceptance greps
rg -n "localStorage" apps/organising-db/src/components/campaigns/wall-chart/v2 apps/organising-db/src/components/campaigns/campaign-wall-chart-v2.tsx apps/organising-db/src/lib/campaign/groups ; echo "exit=$? (1 = none = pass)"
rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" apps/organising-db/src/components/campaigns/wall-chart/v2 ; echo "exit=$? (1 = pass)"
rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = pass)"
rg -n "p_keep_in_parent|keepInParent" apps/organising-db/src/lib/campaign/groups/plan-nested-drop.ts   # every child-target step carries keepInParent: true (reviewer inspects)
git diff --stat main -- supabase/ packages/db-types/ ; echo "(must be empty: no migration, no regen)"
git diff --stat main -- apps/organising-db/src/components/campaigns/wall-chart/hooks apps/organising-db/src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx ; echo "(must be empty: legacy chart untouched)"
git diff --stat main -- apps/organising-db/src/lib/campaign/groups/derive-group-view.ts apps/organising-db/src/lib/campaign/groups/plan-drop.ts ; echo "(must be empty under NV-a)"

# the package's suites, the census and the render cost (output pasted into §9.2)
cd apps/organising-db && pnpm exec vitest run src/lib/campaign/groups src/components/campaigns/wall-chart/v2/__tests__ src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx src/lib/campaign/__tests__/no-direct-structure-writes.test.ts

# build
pnpm --filter organising-db build

# read-only shape query (dev via the connector with the operator's confirmation; production by the operator only)
cat scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql
grep -niE "insert|update|delete|truncate|alter|create|drop|set local|begin|commit" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql ; echo "exit=$? (1 = no write keyword = pass)"

# e2e against the branch preview — only under HT-b (credentials from the operator's shell; never printed)
cd apps/organising-db && E2E_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/groups-v2
# sandboxed runner behind a TLS-intercepting proxy only (wp2.2.md D80): prepend E2E_IGNORE_HTTPS_ERRORS=1
```

Never `pnpm dev` / `pnpm start`; never a `supabase` command; never a read of `.env.local`; never production.

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages

| Stage | Content | Needs DB? |
|---|---|---|
| 0 | This plan approved (§9.1); ledger row "planning → implementing"; branch cut (git commands put to the operator). | No |
| 1 | Pure library: `derive-group-tree.ts` (NE-a, NV-a, NC-a), `plan-nested-drop.ts` (NX-a, NS-a), `resolve-group-selection.ts` `primaryIds` (SG-a), `move-worker-mutation.ts` `steps`; the `CAMPAIGN_42_SHAPE` fixture and the `nested` harness size; every §4.1 test; `00_nesting_shape.sql`. Fable review (static). | No |
| 2 | The v2 chart: band nesting and the root/child cards (XP-a), group-view hook (tree, search, focus, hidden), actions (nested planner, Remove from Group, Assign people… follow-up AP-a), dialogs (split unchanged, delete `childOuIds`, move targets, merge partners), selector/groups hook (primary groups), Units manager (tree), card menu `canSplit` (SP-a), copy-dialog lock; the §4.3 nesting suite, the rewritten Dan case, census and characterisation updates; §4.4. Fable review. | No |
| 3 | `nesting.spec.ts` + helpers written and type-checked; `wp/wp2.4c-acceptance-checklist.md`; **operator checklist (HT-a) steps 0–12 on the branch preview**, recorded by the orchestrator; `00_nesting_shape.sql` run on dev (read-only, with confirmation) and the counts pasted; the operator's production counts for campaign 42 pasted when supplied (settles NP-b); ledger row; PR marked ready. | Preview (dev); read-only SQL |

Three stages, each reviewed by a fresh Fable (the package writes placements — `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:55`),
two fix rounds maximum. After the merge the orchestrator amends `wp/wp2.5.md`, `wp/wp2.6.md`, `wp/wp2.7.md` and
`wp/wp2.4.md` §3.15 per §3.17 (docs commits on `main`, not part of this branch).

### 6.2 Commits

One commit per completed stage on `feat/oux-wp2.4c-nested-units`, small and descriptive; the branch only ever merges
`main` in. Every push and the PR command are put to the operator first. `supabase/.temp/*` is never staged.

### 6.3 PR

Draft PR `feat/oux-wp2.4c-nested-units → main`, title `feat(oux-wp2.4c): nested sub-units inside the parent's group on
the groups_v2 wall chart`. Body: the §3.2 finding in one paragraph, the §3.7 step table, the census delta, the evidence
matrix, the NE/NV/NP/NC/NX/NS/SG/CG/XP/SP/AP/HT decisions as approved, the §3.17 amendments listed as the orchestrator's
follow-ups, "no migration" stated once.

### 6.4 Promotion gate

**Not applicable: no migration.** The merge deploys code that is inert for every user without the `groups_v2` flag.
After the merge the operator, flagged on, sees campaign 42 nested on production without any run sheet.

---

## 7. Files

New:
- `apps/organising-db/src/lib/campaign/groups/derive-group-tree.ts`, `plan-nested-drop.ts`, `__tests__/derive-group-tree.test.ts`,
  `__tests__/plan-nested-drop.test.ts`, `__tests__/fixtures/campaign-42-shape.ts`
- `apps/organising-db/src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.nesting.test.tsx` (+ snapshot)
- `apps/organising-db/tests/e2e/groups-v2/nesting.spec.ts`
- `scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql` (read-only) and a three-line `README.md`
- `docs/organiser-ux-review/wp/wp2.4c-acceptance-checklist.md` (Stage 3)

Modified (additive, default-preserving; the v2 tree is WP2.4c's own):
- `wall-chart/v2/`: `wall-chart-group-band.tsx` (roots, `subUnits`, roll-up header, badge), `use-wall-chart-group-view.ts`
  (tree, `nodeByWorker` index, search/focus, hidden rules, `unitsByGroup` unchanged), `use-wall-chart-view-v2.ts`
  (subtree metrics; empty rule over the tree), `use-wall-chart-actions-v2.ts` (nested planner, Remove from Group,
  `onAdded`), `wall-chart-dialogs-v2.tsx` (`childOuIds`, delete `allOus`, move targets, merge partners), `use-wall-chart-groups.ts`
  (`primaryGroups`, `primaryIds` to the resolver, `?ou=` root rule), `group-selector.tsx` (primary list), `move-to-unit-dialog.tsx`
  ("Root › Child" targets), `unit-card-menu.tsx` (`canSplit`), `wall-chart-toolbar.tsx` (manager without `flat`, tree `ous`)
- `lib/campaign/groups/resolve-group-selection.ts` — optional `primaryIds` (+ cases); `wall-chart-prefs.ts` untouched
- `components/campaigns/wall-chart/move-worker-mutation.ts` — optional `steps` on `MoveWorkerVars` (+ cases in
  `__tests__/move-worker-mutation.test.tsx`)
- `components/campaigns/wall-chart/campaign-unit-card.tsx` — `subUnitsLabel?` (default "Sub-units")
- `components/campaigns/wall-chart/add-campaign-worker-dialog.tsx` — `onAdded?(workerIds)` (AP-a)
- `components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx` — the "Move to <Root> first" lock under `groups`
- `components/campaigns/wall-chart/__tests__/harness/fixture.ts` — the `nested` size
- `wall-chart/v2/__tests__/wall-chart-v2.interaction.test.tsx` (two cases), `wall-chart-v2.control-census.test.tsx`
  (nested region), `wall-chart-v2.characterization.test.tsx` (+ 1 case; two snapshots change)
- `tests/e2e/groups-v2/helpers.ts` — two helpers
- `docs/organiser-ux-review/PROGRESS.md` — ledger row; the incidental-findings row `:103` closed; a new incidental row
  for the §3.2 finding (child-only and orphan rows are legal today) assigned to WP2.8

Not modified: `derive-group-view.ts`, `plan-drop.ts` (NV-a); every legacy composition file (`campaign-wall-chart.tsx`,
`wall-chart-header.tsx`, `wall-chart-unit-hierarchy.tsx`, `wall-chart-unassigned-card.tsx`, `wall-chart-dialogs.tsx`, the
four legacy hooks); `wall-chart-tile.tsx`, `wall-chart-model.ts`, `split-unit-dialog.tsx`, `delete-organising-unit-dialog.tsx`,
`wall-chart-unit-manager.tsx`, `ou-reassignment-targets.ts`, `structure-api.ts`, `sync-campaign-universe.ts`, the sync
and add-workers routes, `workforce-board.tsx`, `workforce/**`, `campaign-units-section.tsx`, `campaign-wizard.tsx`,
`campaign-settings.tsx`, `create-organising-unit-dialog.tsx`; anything under `supabase/`; `packages/db-types/generated.ts`;
any existing e2e spec.

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion (§1.2) | Evidence |
|---|---|
| B1 nested rendering inside the parent's group; parent area = members in no child | `derive-group-tree` cases; nesting suite (KGP with Day/Night; own area); characterisation snapshots; checklist step 1 |
| B2 sub-unit-only groups not offered; Unassigned / Not in any group decided | `primaryGroups` cases; selector case; resolver fall-through cases; checklist step 2; §3.5 |
| B3 drags keep the parent placement and gain/change/lose the child's | `plan-nested-drop` step lists; nesting suite's recorded `structure_placements_move` args and order; `steps` mutation cases; checklist steps 3–7 with the sheet's Units tab as the oracle; e2e oracle on the view |
| B4 Split offers "keep in parent" for a different-kind child | nesting suite (switch on, `p_keep_in_source: true`); checklist step 1; the unchanged dialog tests (`wp/wp2.2.md` D33/D39) |
| B5 roll-up counts on the parent | `subtreeByRoot` cases; nesting suite header/metrics; checklist steps 1, 8, 9 |
| Data-invariant finding established and handled | §3.2 with `path:line`; the equivalence-plus-divergence test; `00_nesting_shape.sql` counts on dev (and production when supplied) in §9.2 |
| Equivalence with `campaign_group_membership` re-stated for nesting | §4.1 (flat unchanged; `rootByWorker` = view except the child-only set = query (b)) |
| Legacy chart untouched | `git diff --stat` greps in §5 empty; every legacy suite unchanged and green |
| No migration, no RPC change, guard green, no localStorage, no per-unit override | §5 greps; guard test; census assertions |
| Census re-counted | census console table with the nested region pasted in §9.2 |
| WP2.5 / 2.6 / 2.7 / 2.4b impact stated so those plans can be amended | §3.17; §9.1 CG answer; the orchestrator's follow-up commits after the merge |
| Operator acceptance on the campaign-42 shape | HT-a checklist result recorded in §9.2 |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Production campaign 42 holds many child-only or orphan rows and the nested view surprises the operator | NP-a renders both truthfully (child-only under the child; orphans hidden in the parent's view but listed in the sheet); the read-only query gives the counts before the merge; NP-b is ready if wanted |
| A two-step drag fails after step 1 (NX-a) | adds-first ordering; the toast names the step; `onSettled` refetch; the resulting shape is one the derivation renders; NX-b recorded for WP2.8 |
| NE-a misclassifies a campaign whose employer is a plain unit with worksite children (worksites nest under it; Worksite demoted) | §3.11: the query's count (a) shows whether any campaign has it; re-parenting is a run sheet, not this package |
| A same-kind child (C-k) under a root confuses the planner (parent in the same group cannot hold the pair) | the table's last-but-one row; the RPC writes nothing for a same-group parent (`:2726–2731`); pinned |
| WP2.5 / WP2.6 implement against the flat derivation before §3.17 lands | this package lands first; their plans are amended before approval (PROGRESS.md `:103` already says so) |
| WP2.7 collides on `wall-chart-dialogs-v2.tsx` | different line ranges (§3.16); merge `main` in; stop condition 8 |
| The `small` fixture's Employer view changes shape for every v2 suite | only the Dan case and two snapshots are affected (§4.3); recorded in the deviation table when the exact diff is known |
| Hidden child still counted in the parent's roll-up reads as a discrepancy | the legacy rule, stated in the Units manager's sentence ("Hidden units still count in their parent's totals") |
| Render cost | no nesting edge in `large`; §4.4 |
| Lint creep | touched lines clean; total ≤ 295 |

### 8.3 Deviations from plan (implementer keeps; numbering starts at D1)

| # | Deviation | Why | Plan section affected |
|---|---|---|---|
| **D1** | A drop that takes a worker out of a root's subtree also unassigns the **NC-a orphan** child placement, not only the rendered child `c` — including the drop on "Unassigned in \<Group\>" — **approved (ruling 2)** | The §3.7 table's row 12 names `c` only, but the bullet under the table states the same operation as "unassign within G, then within **each child group held**". Without it, a worker "removed from Worksite" who held an orphan shift under another worksite would immediately re-appear inside that worksite as a child-only tile (NP-a renders child-only rows), which contradicts B3 ("nothing else changes") and the checklist's step 7 expectation | §3.7 rows 12 and 5; pinned by `plan-nested-drop.test.ts` ("an NC-a orphan is dropped…", "an NC-a orphan is removed with the group's row") |
| **D2** | `00_nesting_shape.sql` (b), (c) and (d) count **cross-group** sub-unit placements only (the child's `group_id` differs from the parent's) — **approved (ruling 3); under D6 this is no longer a restriction but the definition of a sub-unit** | A same-group parent can never hold the worker beside the child (wp2.2.md C-a), so *every* placement on a same-group child (the C-k split shape) would otherwise be counted as "child-only" and query (b) would no longer name the same set as `childOnlyByWorker` — which §3.2 and §4.1 require it to. With D6 the same-group child does not nest at all, so the counts are of nested sub-units by construction; (a) and (f) were narrowed to match and the comments reworded | §3.2 (b)/(c)/(d); the transcription in `derive-group-tree.test.ts` |
| **D3** | A refused step **rejects** with `MoveStepError` (exported from `move-worker-mutation.ts`), whose `message` is the §3.13 sentence "Step n of m failed: … The chart shows what was saved."; the toast itself stays in the caller's existing `onError` → `structureErrorMessage` path (Stage 2's actions hook) | §4.1 asks the mutation to "reject with the step index and the structure sentence", and `move-worker-mutation.ts` imports no UI today (`sonner` is the composition layer's). `structureErrorMessage` passes a non-`StructureApiError` message through unchanged, so the sentence is what is toasted, byte-for-byte | §3.7 NX-a, §3.13, §4.1 |
| **D4** | `foreignNested` is "a unit of G that is neither a root nor a child of a root of G"; `subtreeByRoot` carries entries for roots only, as §3.4 states, so a flat foreign-nested card's roll-up is its own `workersByNode` list. (Under D6 a child of a root is never a unit of G, so this now *equals* §3.4's "nested under a unit of another group" and the superset is purely defensive) | Defensive: a chain inside G whose middle unit is not a root of G would otherwise leave a unit — and its placements — off screen, breaking "every placement in G is on screen exactly once" | §3.4 `foreignNested`, `subtreeByRoot` |
| **D5** | `resolveGroupSelection`'s `?ou=` step, **when `primaryIds` is passed**, climbs `parent_ou_id` to the nearest ancestor carrying a primary group instead of importing the NE-a edge test; and step 4 ("first group") picks the first **primary** group | Identical result for every NE-a shape (the first ancestor with a primary group is the unit's root), and it keeps `resolve-group-selection.ts` free of an import cycle with `derive-group-tree.ts`, which imports `orderGroups` from it. Step 4 must agree with the selector, or the default view would be one the Group control cannot offer. Without `primaryIds` the WP2.4 behaviour is byte-for-byte (a case pins it) | §3.5 SG-a |
| **D6** | **NE-a narrowed (operator/orchestrator ruling 1, fix round 1):** a `parent_ou_id` link nests only when the parent's group **differs** from the child's. A same-kind Split child (C-k) is a **root of its own group beside its parent**, not a nested card, and its members are not rolled up into the parent | The first Stage-1 round reported a second divergence class between `rootByWorker` and `campaign_group_membership` (stop condition 4): for a member whose row in G is a C-k child of another unit of G, the view said the child and the tree said the parent. The ruling removes the class at the source, on four grounds: (a) WP2.2b's unique `(worker_id, group_id)` index means a worker can never hold both the parent and a same-group child, so such a child can never carry the parent + child pair the whole nested model is built on; (b) the operator's requirement is cross-group nesting (shifts under a worksite) and says nothing about splits; (c) `DECISIONS.md:14`'s clause "Split creates sibling units in the same group" was never amended; (d) §3.4's equivalence clause stays exactly as WP2.4 stated it (child-only rows and nothing else), so WP2.5/WP2.6 inherit the simple wording. SP-a is unaffected: Split on a root that produces a same-group child still works and now yields a sibling card | §3.2, §3.3 NE-a, §3.4 (roots, the equivalence clause), §3.5 `isPrimaryGroup`, §3.7 row 13, §4.1 |
| **D7** | **`GroupTree` gains `childPlacementsByWorker: Map<number, number[]>`** — every child-node row a worker holds in the tree, in card order — and the drawn child (`childPlacementByWorker`) is now chosen by `childrenByRoot` **card order**, not by placement-row order. `planNestedDrop` reads the list | Review finding **B-1 (blocking)**: a root may hold children in two groups (§3.7 row 9 creates the shape on purpose — a shift and a crew under one worksite). The derivation kept only the first held child and reported only a child under a *different* root, so the planner never saw the second: the other card undercounted, which card drew the tile depended on the order `fetchOuAssignments` happened to return rows in (it issues no `ORDER BY` and pages with `.range()`), and a drop out of the subtree left the second child row behind — which the derivation then read as child-only and drew the worker back **inside the worksite they had just been removed from**, the exact regression D1/ruling 2 exists to prevent (checklist step 7). Pinned by two derivation cases (drawn once, counted once, order-independent) and three planner cases, one of which re-derives the chart from the rows the steps leave behind | §3.4 (`GroupTree`, the "two children of one root" rule), §3.7 row 9, §4.1 |
| **D8** | §3.7 **row 4** is implemented wider than its letter: a drop on a root's own area unassigns **every** child group the worker holds under that root, not only `G'(C)` | B1: the parent's own area holds the members who are "in none of its children", so a worker dropped there must leave all of them. The table names one child because it was written before the two-children case (D7). Review A-6 asked for it to be recorded here rather than only in §11 | §3.7 row 4 |
| **D9** | Three review advisories taken in the same round: **A-1** `MoveStepError` copies the refusal's `status` / `code` (and the auth-js lock sentinels) so `useAuthAwareMutation`'s token-refresh retry still fires on the steps path — re-issuing a plan is safe, a completed `move` re-issues as `skipped` and an `unassign` is idempotent; **A-2** `subtreeByRoot` is seeded for `foreignNested` cards too, so the Stage-2 band cannot read `undefined` on a card §3.6 renders "as a root without children"; **A-3** `nestingParentOf` also requires the **child** to carry a `group_id`, so a legacy `group_id NULL` container under a plain unit can never become a nested card that no drop can land on | Each is one to three lines and each closes a real hole: no retry, a silent `undefined`, an undroppable card | §3.4, §3.7 NX-a, §3.6 |
| **D10** | `00_nesting_shape.sql` (b)–(e) join `campaign_worker_membership` and report **workers** as well as placements | Review A-4 / A-5: the view and `deriveGroupTree` both count members only, so without the join the SQL's (b) was not the same set as `childOnlyByWorker` that §3.2 and §4.1 claim it is; and with D7's shape a worker contributes one row per nested placement, so the operator needs worker counts to size NP-b | §3.2, §9.2 |
| **D11** | `MoveStepError`'s message drops the "Step n of m failed: … The chart shows what was saved." wrapper when the plan has **exactly one step**, and is then the bare structure sentence | Every drop in a FLAT group plans exactly one step, and Stage 2 routes every drop through `planNestedDrop` (D18). Without this, WP2.4's "a refused move surfaces the structure API's sentence" became "Step 1 of 1 failed: …", which is noise (nothing was left half done) and a copy regression on the group views that have no nesting at all. Stage 1's cases pin `2 of 3` and `1 of 2` only, so the multi-step sentence §3.13 specifies is unchanged; the one-step case gains a case of its own in the Stage-2 suite by way of the unchanged WP2.4 assertion | §3.13, §3.7 NX-a; an additive change to the Stage-1 file `move-worker-mutation.ts` |
| **D12** | The `?ou=` focus effect (`use-wall-chart-group-view.ts`) looks for the card on a **bounded retry** (20 tries, 150 ms apart) instead of once | §4.3 asks `?ou=<Day>` to open on Worksite **and highlight Day**. The effect's single DOM read runs before the placements query settles, so at that moment the band is still the loading placeholder or a set of empty units and the lookup misses — for a ROOT as much as for a nested card, i.e. WP2.4's `?ou=` highlight never fired in the harness at all. The loop stops on the first hit, after 20 tries or on unmount; when the card is already there, behaviour is byte-for-byte WP2.4's (one 150 ms delay, one highlight, cleared after 2.5 s) | §3.6 "Search / focus", §4.3 |
| **D13** | `__tests__/harness/characterize.ts`'s header rule matches `\bnamed\b` **or** `\bin unit\b` | The roll-up sentence (§3.13) replaces "N named" on a root with children, so without this the characterisation recorded `"header": null` for exactly the cards this package adds. No legacy card renders the second wording, and the legacy golden master is unchanged (`git diff` shows no legacy snapshot) | §4.3; the harness is not in §7's file list |
| **D14** | The Units manager is given a **projection** of the tree — each root with `parent_ou_id: null`, each nested child with its real parent — and `flat` is dropped; the manager's `onDeleteUnit` row is mapped back to the real unit by `ou_id` | §3.9 asks the manager to render "its existing parent → children rows", but `wall-chart-unit-manager.tsx` is in §7's **not modified** list and its top-level rule is `parent_ou_id == null`: every worksite of campaign 42 carries the container link, so unprojected rows would leave the manager with no top-level unit at all. The projection is exactly the NE-a reading (a facet link is not nesting) and keeps the manager untouched; the reorder still emits "roots with children following" (`:80–99`), and the delete dialog still receives the real row, whose `parent_ou_id` drives `ou-reassignment-targets.ts` | §3.9 |
| **D15** | The root's roll-up sentence counts the **derived** lists (`subtreeByRoot`, `workersByNode`), not the filtered ones; the count button's `aria-label` is "Select all in \<Root\> (\<n\> in unit · \<m\> not yet in a sub-unit)" | §3.6 names `subtreeByRoot`, and the placeholders and summary metrics beside it already read unfiltered lists; §4.6 step 8 requires the parent to keep counting a sub-unit's worker when a Filter empties that sub-unit's card. The `aria-label` carries both numbers (§3.12) because it overrides the visible text for a screen reader | §3.6, §3.12, §3.13, §4.6 step 8 |
| **D16** | `campaign-unit-card.tsx` gains `countLabel?` beside the planned `subUnitsLabel?` | §3.6 asks the header count to read one string in place of "N named", which is the card's own text. Additive and default-preserving: absent → "N named", so the legacy DOM is byte-for-byte unchanged | §7 (the file is listed, the second prop is not), §3.13 |
| **D17** | "N empty units hidden" counts a root whose **whole subtree** is empty once (its children are empty by construction and are not rendered either), plus every empty child of a rendered root | §3.6 says the count "counts both" without saying how the two levels combine; counting a dropped root's children as well would say "3 empty units hidden" where the organiser sees one card disappear | §3.6 "Show empty units" |
| **D18** | The v2 chart routes **every** drop, "Move to unit…" and tile dialog through `planNestedDrop`, including the Not-in-any-group view; `plan-drop.ts` is no longer imported by the chart (the file and its cases are untouched under NV-a) | §3.7 defines the nested planner as "a superset of `planDrop` … with a group whose units have no children this planner emits exactly the calls `planDrop` + `useMoveWorkersMutation` issue today", and the Stage-1 superset case proves it. Keeping two planners behind a branch would mean a flat group's drop never exercised the code every nested drop uses | §3.7; `plan-drop.ts` unchanged (§5 grep) |
| **D19** | "Remove from \<Group\>" keeps issuing `placements.unassign` (one call per group: the selected group, then each sub-unit group the selection holds a row in) rather than going through the mutation's `steps` | §3.7's bullet defines the operation, not the RPC; WP2.4 shipped it on `structure_placements_unassign` and its case pins that payload. The D1 second call is added in the same shape, so the suite reads as one list of unassigns | §3.7 bullet, D1 |
| **D20** | The Stage-2 nesting suite asserts that Split… opens the unchanged dialog on a root and is absent on a nested card; it does not drive the split wizard to its Review step | §4.3 asks for "the switch on and the payload carries `p_keep_in_source: true`", which is `split-unit-dialog.tsx`'s own behaviour on a different-kind child — unchanged by this package and already pinned by its own suite (wp2.2.md D33/D39), and reached in the product by the operator's checklist step 1 (HT-a). The chart's part — that the item exists on a root and not on a child — is what this package decides | §4.3, §8.1 B4 |
| **D21** | The Units manager's reorder sends **only the selected Group's own units** (the manager's list is filtered before `units.reorder`); a nested child keeps its own `display_order` | Review A-6, fix round 1. `structure_unit_reorder` sets `display_order` from the array position, and the projected tree's ids include each root's nested children — units of ANOTHER group — so passing them renumbered that group behind the organiser's back and §3.9's "other groups untouched, `wp/wp2.4.md` §3.12" was no longer true. Children keep their own order, which is what decides the order of the nested cards inside a root, so the manager's "children follow their parent" behaviour is unaffected on screen | §3.9, `wp/wp2.4.md` §3.12 |
| **D22** | `campaign-unit-card.tsx` gains a third additive prop, `title?`, and the count button's accessible name on a root with children reads "Select all in \<Root\>**'s own area** (\<n\> in unit · \<m\> not yet in a sub-unit)" | Review A-2 and A-5, fix round 1. §3.6/§3.13 title a flat foreign-nested card "\<Parent\> › \<Unit\>", which the card computes from `ou` alone, and a pseudo-unit's `fallbackTitle` cannot be used without losing `ou`'s drop target, type chip and estimate. A-5: the button selects the card's OWN visible tiles while D15's numbers are the unfiltered roll-up, so the name says which it acts on before it carries §3.12's two numbers. Both default-preserving: absent → `ouDisplayName(ou)` and "Select all in \<Unit\>" | §3.6, §3.12, §3.13, D15, D16 |
| **D23** | Stage 3: the e2e fixture picks a root the **depth trigger** allows a sub-unit under — top-level, or a child of a group container (`cou_enforce_hierarchy_invariants`, `baseline_schema.sql`) — preferring an `ou_type: "worksite"` unit, and creates one under `NESTED_PREFIX` only when the campaign has none | §4.5 says "pick a worksite root A (create one through `createUnits` if the campaign has none)" without saying which units can hold a sub-unit. Campaign 1's worksites sit under an Employer **container**, which the trigger permits (container → unit → sub-unit); a worksite under a plain unit would be refused by the database, and a container itself carries no group. The rule is the trigger's, restated | §4.5 |
| **D24** | Stage 3 adds **eleven** helper functions to `tests/e2e/groups-v2/helpers.ts` (plus three types and one name prefix), not the two §4.5 names: `createNestedUnits` and `removeUnit` as planned, plus `unitTreeOf`, `nestsUnder`, `isSubUnitOnlyGroup`, `findOrCreateNestedFixture`, `tileOn` / `expectTileOn`, `cardHeading`, `recordPlacementMoves` and `expectSheetUnits` | A nested card's DOM sits **inside** its root's card, so WP2.4's `tileIn` / `cardById` (which scope by the card element) cannot tell "in A's own area" from "in Day inside A" — the distinction every §3.7 row turns on. `tileOn` uses the tile's own `data-worker-id` + `data-ou-id` pair (`worker-tile.tsx:338–340`), `cardHeading` gives the root's own area an unambiguous drop point above the nested cards (D32's "one card acts on the drop"), `recordPlacementMoves` is what lets the spec assert the **ordered** payloads NX-a specifies rather than one response at a time, and `expectSheetUnits` is the second oracle §4.5 asks for. The WP2.4 spec and its helpers are otherwise untouched | §4.5 |
| **D25** | The drag chain of §4.5 has one extra drop: after "Night → A's own area" the spec drags the worker **back into Day** before the drop on "Unassigned in \<Group\>" (asserting the same single step as the first drag) | §4.5 lists the four drops as one chain, but row 4 leaves the worker in the root's own area — with no child row left, the last drop would exercise the one-step flat case, not the D1 case ("unassign within G, then within the child group held") the step exists to prove | §4.5 |
| **D26** | The nesting fixture is named `NESTED_PREFIX = "WP2.4 e2e nested "` — inside WP2.4's `UNIT_PREFIX` — and its sub-units are removed in `afterAll` through `structure_unit_delete` (`removeUnit`), with the prefix sweep kept as the backstop; the root is deleted only when the spec created it | The prefix nests inside WP2.4's so **either** suite's `deleteUnitsByNamePrefix(UNIT_PREFIX)` sweep clears a leftover of the other, whichever runs next. The product RPC is used for the sub-units because it is the call the card's Delete… makes and it removes their placements with them; the campaign's own worksite is never deleted | §4.5 |
| **D27** | The SG-a assertion in spec 1 is **conditional**: it runs when no other unit of the derived sub-unit group is a root on campaign 1 (`isSubUnitOnlyGroup`), and otherwise records a test annotation saying why it was not asserted | SG-a is a statement about a group *every* unit of which nests. If dev ever gains a top-level Shift unit, the group is legitimately primary and the selector is right to offer it; asserting unconditionally would fail on correct behaviour. The fixture's own two children always satisfy the rule, so on today's dev data the assertion runs | §3.5 SG-a, §4.5 |
| **D28** | `wp/wp2.4c-acceptance-checklist.md` is written as steps **0–14** rather than §4.6's 0–12: §4.6 step 1 becomes steps 1–3 (build the shape, then what the Group control and card A now say), its step 10 becomes step 12, and two steps are added — "Assign people… on a sub-unit" (AP-a, which §4.6 does not walk) and a clean-up step of its own | §4.6 is a sketch for the implementer; the operator works only in a browser and needs one action per numbered line with one expected sentence (`wp/wp2.4-acceptance-checklist.md`'s shape). Nothing in §4.6 is dropped: every one of its expectations appears, in the same order, under a step number | §4.6 |

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. Any change would be needed under `supabase/` or to `packages/db-types/generated.ts`.
2. A nested behaviour cannot be built without editing a legacy composition file, `derive-group-view.ts` or `plan-drop.ts`.
3. Any legacy vitest suite or legacy e2e spec would need a change to pass.
4. The §4.1 equivalence test finds a divergence outside the named child-only set.
5. A drop in the §3.7 table cannot be expressed with the existing RPC parameters (a step would need `p_from_ou_id`
   naming a row the worker does not hold, or `withinGroupId` with a target).
6. `00_nesting_shape.sql` count (a) on dev or production shows a campaign whose Worksite group would be demoted (§3.11)
   — report before Stage 2.
7. The `groups_v2` flag would need a new reader.
8. `wall-chart-dialogs-v2.tsx` has changed on `main` (WP2.7) when Stage 2 starts and the merge is not trivial.
9. Lint total would exceed 295 or `tsc` fails in an untouched file.
10. Anything would touch `gteygwfgjvczanmrwgbr`.
11. A third fix round would be needed.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Recommendation | Operator answer |
|---|---|---|---|
| **NE** | Nesting edge: **NE-a** only a `parent_ou_id` link to a non-container parent that carries a group (container → member links stay facets; the deepest rendered tree is unit → sub-unit); **NE-b** every `parent_ou_id` link (demotes Worksite on campaign 42) | **NE-a** | _pending_ |
| **NV** | **NV-a** new `deriveGroupTree` beside the unchanged flat derivation; **NV-b** nesting folded into `deriveGroupView` | **NV-a** | _pending_ |
| **NP** | The child ⇒ parent pair is not guaranteed today (§3.2): **NP-a** derive and tolerate, chart writers keep the pair, no data change; **NP-b** additionally an operator-run repair script through `structure_placements_assign` (no migration); **NP-c** enforce in the database (migration, WP2.8) | **NP-a**; NP-b only if the production counts for campaign 42 say so | _pending_ |
| **NC** | A child placement under a root other than the worker's own placement in the parent's group: **NC-a** the own placement wins, the orphan is not drawn in that view, counted, listed in the sheet, normalised by the next drop; **NC-b** drawn twice with ◫ | **NC-a** | _pending_ |
| **NX** | Cross-parent drags: **NX-a** two or three ordered RPC calls (adds first) via an additive `steps` on the existing mutation; **NX-b** a one-transaction RPC (migration); **NX-c** no cross-parent drag | **NX-a** | _pending_ |
| **NS** | Leaving a parent's subtree: **NS-a** the sub-unit placement under the old parent is removed; **NS-b** kept | **NS-a** | _pending_ |
| **SG** | Sub-unit-only group: **SG-a** not listed and unreachable (`?group=` / prefs fall through; no "Unassigned in Shift" anywhere; Not in any group unchanged); **SG-b** reachable by URL as flat "Parent › Unit" cards | **SG-a** | _pending_ |
| **CG** | WP2.5 Compare: **CG-a** a sub-unit-only group is offered as the secondary axis (Worksite × Shift), never as the primary; rows use the tree's root; **CG-b** excluded | **CG-a** (recorded as the amendment WP2.5 adopts) | _pending_ |
| **XP** | Nested cards: **XP-a** always expanded, no per-parent view state; **XP-b** a per-parent expand pref | **XP-a** | _pending_ |
| **SP** | Split on a nested card: **SP-a** not offered (the depth trigger would refuse); **SP-b** offered and refused | **SP-a** | _pending_ |
| **AP** | Assign people… / sheet copy onto a sub-unit: **AP-a** writers unchanged, chart adds the parent row after "Assign people…", sheet target locked until the worker is in the parent; **AP-b** route both through the nested planner | **AP-a** | _pending_ |
| **HT** | Acceptance: **HT-a** operator checklist on the branch preview, shape created through Split; **HT-b** credentialled Playwright run | **HT-a** | _pending_ |

Approvals required, in order:

1. The twelve decisions above — "as recommended" is a complete answer.
2. Confirmation that §3.17's amendments to `wp/wp2.5.md`, `wp/wp2.6.md`, `wp/wp2.7.md` and `wp/wp2.4.md` §3.15 (WP2.4b)
   are to be made by the orchestrator before those plans are approved, and that WP2.4c lands before WP2.5/2.6 start.
3. Approve `git checkout -b feat/oux-wp2.4c-nested-units main`, the Stage-0 commit of this plan and the ledger row,
   `git push -u origin feat/oux-wp2.4c-nested-units`, and opening the draft PR.
4. Approve each stage commit and push individually.
5. Confirm the read-only `00_nesting_shape.sql` may be run on normal dev by the agent; run it on production yourself
   when convenient and paste the four counts for campaign 42 (this settles NP-b and stop condition 6).
6. HT-a: perform the checklist (§4.6) on the branch preview when Stage 3 is ready and report; the orchestrator records
   the result in §9.2.

**Orchestrator approval:** _pending (Revision 1)._

**Operator answers (2026-09-15): "approve all" — every recommendation in this section is adopted (NE-a, NV-a, NP-a with NP-b optional after the production counts, NC-a, NX-a, NS-a, SG-a, CG-a, XP-a, SP-a, AP-a, HT-a); branch `feat/oux-wp2.4c-nested-units` off `main`, draft PR into `main`, stage commits and pushes approved.**

### 9.2 Verification output (verifier pastes raw output)

_pending._

#### Operator acceptance on the branch preview (HT-a)

_pending._

#### `00_nesting_shape.sql` counts

_pending (dev: agent with confirmation; production campaign 42: operator)._

### 9.3 Reviewer findings and resolution

_pending._ Reviewer: a fresh Fable per stage (the package writes placements and reads worker data), given the reviewer
checklist verbatim (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:88–97`), this plan and §1.2; two fix rounds maximum.

---

## 10. Revision history

- **Revision 1** (2026-09-15): initial plan against `main` at `3cb0bd5a`. Establishes (§3.2) that the child ⇒ parent
  placement pair is a convention of the wall-chart writers, not a data invariant (`structure_placements_move`
  `p_keep_in_parent` places the parent with `skip` and never moves it; the assign RPC, grids, add-workers route, imports,
  Recompute and the D50 reallocate create child-only rows; `10` and the universe sync touch only `ou_group_id`
  container members). Recommends NE-a (only a link to a non-container parent nests; container → member links stay
  facets, so Worksite stays primary on campaign 42 and the tree is at most unit → sub-unit), NV-a (a new pure
  `deriveGroupTree` beside the unchanged flat derivation, with the view-equivalence re-stated as equality plus a named
  child-only divergence set that a read-only SQL counts), NP-a (derive and tolerate), NC-a (own placement wins; orphans
  hidden in that view, listed in the sheet), NX-a (ordered multi-step drags through an additive `steps` on the existing
  mutation, adds first), NS-a (leaving a parent's subtree drops the sub-unit placement), SG-a (sub-unit-only groups not
  listed and unreachable; Not in any group unchanged), CG-a (offered as the Compare secondary), XP-a (always expanded),
  SP-a (no Split on nested cards), AP-a, HT-a (the operator creates the campaign-42 shape on dev through Split from the
  card menu, then tests). States the amendments WP2.5, WP2.6, WP2.7 and WP2.4b must adopt (§3.17). No migration, no RPC
  change, no new query; three stages; the legacy chart untouched.

---

## 11. Stage 1 evidence (implementer)

Stage 1 of §6.1: the pure library only. Branch `feat/oux-wp2.4c-nested-units` at `29f93a6c` (`main` with WP2.4
merged). No database of any kind was touched: no connector call, no `supabase` command, no `.env.local` read, no
`pnpm dev`, no Playwright. Nothing under `supabase/` or `packages/db-types/` is modified (§11.5), and
`derive-group-view.ts` / `plan-drop.ts` are byte-for-byte `main`'s (NV-a).

### 11.1 Files

New:

| File | What |
|---|---|
| `src/lib/campaign/groups/derive-group-tree.ts` | NE-a (`nestingParentOf`, `childrenByNestingParent`, `indexUnitsById`), SG-a (`isPrimaryGroup`, `primaryGroups`), and `deriveGroupTree` with the §3.4 `GroupTree` exactly as the plan types it (roots, `foreignNested`, `childrenByRoot`, `nodeIds`, `nodeByWorker`, `rootByWorker`, `workersByNode`, `subtreeByRoot`, `placementByWorker`, `childPlacementByWorker`, `unassignedWorkerIds`, `childOnlyByWorker`, `orphanChildByWorker`) |
| `src/lib/campaign/groups/plan-nested-drop.ts` | `planNestedDrop` → `{ kind: "steps"; steps: MoveStep[]; refs }`, three ordered phases (the selected group's row, the child's row, the removes) — adds before removes, `keepInParent: true` on every move, `fromOuId` always a held row, merging per (kind, target, source, group) |
| `src/lib/campaign/groups/__tests__/fixtures/campaign-42-shape.ts` | `CAMPAIGN_42_SHAPE`: EDI Downer (container) → KGP / Barrow / Ichthys / Wheatstone, Day + Night under KGP, "Barrow Jetty" (the C-k same-kind child) under Barrow, a legacy custom container, 20 members covering paired / root-only / child-only / orphan / container-only / legacy-only / unassigned, plus a non-member placement. Shared by the pure suites and the `nested` harness size |
| `src/lib/campaign/groups/__tests__/derive-group-tree.test.ts` | 22 cases: NE-a edges, `primaryGroups` (incl. the zero-unit group and the mixed standalone-shift case), the Worksite tree, roll-ups, NP-a, NC-a, the Employer view, hygiene, and the equivalence block |
| `src/lib/campaign/groups/__tests__/plan-nested-drop.test.ts` | 21 cases: every row of the §3.7 table with its exact step list and order, the guards, the merging, and the superset-of-`planDrop` property (both planners run over the same cases) |
| `scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql` + `README.md` | Read-only: (a) sub-unit-only groups, (b)/(c)/(d) child-only / orphan / paired sub-unit placements per campaign, (e) the same per parent group, (f) the nesting edges per campaign. Aggregates and group names only |

Modified (additive, default-preserving):

| File | Change |
|---|---|
| `src/lib/campaign/groups/resolve-group-selection.ts` | optional `primaryIds` (SG-a) + `parent_ou_id` on the `ous` row type; absent → WP2.4 behaviour unchanged |
| `src/components/campaigns/wall-chart/move-worker-mutation.ts` | optional `steps` on `MoveWorkerVars`, run in order in place of the refs loop, stopping at the first refusal with the exported `MoveStepError`; stamping / reverse sync / invalidations unchanged and issued once |
| `src/components/campaigns/wall-chart/__tests__/harness/fixture.ts` | the third size `"nested"` (the campaign-42 rows), `small` and `large` untouched |
| `src/lib/campaign/groups/__tests__/resolve-group-selection.test.ts` | +5 cases (the WP2.4 cases unchanged) |
| `src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx` | +4 cases (the WP2.4 cases unchanged) |
| `docs/organiser-ux-review/wp/wp2.4c.md` | §8.3 D1–D5 and this §11 |

### 11.2 `pnpm exec tsc --noEmit` (from `apps/organising-db`)

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

### 11.3 `pnpm vitest run` (whole app, from `apps/organising-db`)

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8839.993783000002 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16

 Test Files  1 failed | 114 passed (115)
      Tests  1 failed | 1614 passed (1615)
   Duration  79.31s
```

1,615 tests (§4.1 requires ≥ 1,563; `main` had 1,563, this stage adds 52: 22 + 21 + 5 + 4). Nothing is skipped,
quarantined or deleted. The one failure is the pre-existing legacy `wall-chart.render-cost.test.tsx` timing case — the
only acceptable failure (a sandbox-speed budget assertion on the LEGACY chart, untouched here); the v2 render-cost
suite passed in the same run (`median 1256ms … legacy budget 6000ms`).

The package's own suites:

```
$ pnpm exec vitest run src/lib/campaign/groups
 ✓ src/lib/campaign/groups/__tests__/derive-group-view.test.ts (31 tests) 47ms
 ✓ src/lib/campaign/groups/__tests__/derive-group-tree.test.ts (22 tests) 29ms
 ✓ src/lib/campaign/groups/__tests__/plan-nested-drop.test.ts (21 tests) 29ms
 ✓ src/lib/campaign/groups/__tests__/plan-drop.test.ts (8 tests) 10ms
 ✓ src/lib/campaign/groups/__tests__/resolve-group-selection.test.ts (14 tests) 8ms
 ✓ src/lib/campaign/groups/__tests__/wall-chart-prefs.test.ts (11 tests) 18ms
 Test Files  6 passed (6)
      Tests  107 passed (107)

$ pnpm exec vitest run src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx
 ✓ (7 tests) 131ms

$ pnpm exec vitest run src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 131ms
```

### 11.4 Lint

```
$ pnpm exec eslint <the ten changed files> ; echo "eslint exit=$?"
eslint exit=0

$ pnpm lint | tail -4
  159:24  warning  '_ignored' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 295 problems (143 errors, 152 warnings)
```

295 total, the §5 ceiling and `main`'s exact number (143 errors / 152 warnings); every changed line is clean.

### 11.5 `git diff --stat main` (the boundaries)

```
$ git diff --stat main -- supabase/ packages/db-types/
(empty: no migration, no regen)

$ git diff --stat main -- .../wall-chart/hooks .../wall-chart-unit-hierarchy.tsx .../campaign-wall-chart.tsx
(empty: the legacy chart is untouched)

$ git diff --stat main -- .../groups/derive-group-view.ts .../groups/plan-drop.ts
(empty: NV-a holds — WP2.5/2.6 may keep citing them by line)

$ git status --short
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/fixture.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/lib/campaign/groups/__tests__/resolve-group-selection.test.ts
 M apps/organising-db/src/lib/campaign/groups/resolve-group-selection.ts
?? apps/organising-db/src/lib/campaign/groups/__tests__/derive-group-tree.test.ts
?? apps/organising-db/src/lib/campaign/groups/__tests__/fixtures/
?? apps/organising-db/src/lib/campaign/groups/__tests__/plan-nested-drop.test.ts
?? apps/organising-db/src/lib/campaign/groups/derive-group-tree.ts
?? apps/organising-db/src/lib/campaign/groups/plan-nested-drop.ts
?? scripts/data-hygiene/oux-wp2.4c/
```

(Nothing is committed: the operator approves each stage commit and push, §9.1 item 4.)

### 11.6 The §5 acceptance greps

```
$ rg -n "localStorage" .../wall-chart/v2 .../campaign-wall-chart-v2.tsx .../lib/campaign/groups
apps/organising-db/src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.interaction.test.tsx:610:    expect(window.localStorage.length).toBe(0);
exit=0
```

The one hit is WP2.4's own assertion that the v2 chart stores nothing in `localStorage` (unchanged on `main`; the
grep as written in §5 matches the assertion line itself). No `localStorage` read or write exists in `v2/**`,
`campaign-wall-chart-v2.tsx` or `lib/campaign/groups/**`, this stage included.

```
$ rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" .../wall-chart/v2
exit=1 (pass — XP-a: no per-parent view state)

$ rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)…(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**'
exit=1 (pass — every write still goes through structureApi; the guard test is green above)

$ rg -n "p_keep_in_parent|keepInParent" .../groups/plan-nested-drop.ts
44:  | { kind: "move"; toOuId: number; fromOuId: number | null; workerIds: number[]; keepInParent: true }
199:    steps.push({ kind: "move", toOuId: parentMoveTarget!, …, keepInParent: true });
202:    steps.push({ kind: "move", toOuId: target!, …, keepInParent: true });
```

`keepInParent` is a `true` literal in the `MoveStep` type, so a step that omits it does not type-check; a case
asserts it on every move of every planned drop in the fixture.

```
$ grep -niE "insert|update|delete|truncate|alter|create|drop|set local|begin|commit" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql
exit=1 (no write keyword = pass)
```

The file was **not run**: no database access in this stage. §9.1 item 5 (dev, with the operator's confirmation) and
the operator's production counts belong to Stage 3 / §9.2.

### 11.7 The §3.7 table → the cases that pin it

| §3.7 row | Case in `plan-nested-drop.test.ts` | Steps asserted |
|---|---|---|
| root U ← node U | "row 1" | noop |
| root U ← Unassigned | "row 2" | `move(null → U)` |
| root U ← another root | "row 3" | `move(W → U)` |
| root U ← child C under U | "row 4" | paired: `unassign(Shift)`; child-only: `move(null → U)` then `unassign(Shift)`; sibling group: `unassign(Crew)` |
| root U ← child under W ≠ U | "row 5", "an NC-a orphan is dropped…" | `move(W → U)` then `unassign(Shift)` |
| child C′ ← node C′ | "row 6" | noop |
| child C′ ← U's area | "row 7" | `move(null → C′)`; with an orphan in C′'s group, `move(orphan → C′)` (C-l) |
| child C′ ← sibling, same group | "row 8" | `move(C → C′)` |
| child C′ ← sibling, another group | "row 9" | `move(null → C′)`; the other child stays |
| child C′ ← root W or W's child | "row 10" | `move(W → U)`, `move(… → C′)`, `unassign(Crew)` — in that order |
| child C′ ← Unassigned | "row 11" | `move(null → U)` then `move(null → C′)` |
| Unassigned ← anywhere | "row 12" (+ D1) | `unassign(G)` and/or `unassign(G′)` |
| same-group child (C-k) | "row 13" | one `move(p → C′)`; NS-a still drops a shift held under the old root |
| foreign-nested flat card | "row 14" | as a root without children |
| guards / merging / superset | last three describes | target outside the tree, `"none"`, empty selection; per-(kind, target, source, group) merging; `planDrop` parity |

### 11.8 Findings and open questions (§8.4)

1. **A second divergence class between `rootByWorker` and the view — the C-k same-group child (stop condition 4,
   reported not worked around).** §3.4 states the equivalence as "`rootByWorker` equals `view.ou_id` for every member
   except the members of `childOnlyByWorker`". The §4.1 fixture also contains a **same-kind child of a root in the
   same group** ("Barrow Jetty" under Barrow, the C-k split shape), and §4.1 asks its roll-up to count in the parent
   ("W2's = W2-own + W1b"). For a member whose Worksite row **is** that child unit, the view says `Barrow Jetty` and
   the tree says `Barrow` — a divergence outside the child-only set. It is not a derivation bug: §3.4 itself says "a
   same-kind child of a root … is a child, not a root", so the tile renders inside Barrow's card and the roll-up
   counts it there, which is what B1/B5 ask for. The equivalence test pins the complete set
   (`{child-only, same-group-nested}`) and names the second class. **Question for the orchestrator/operator:** confirm
   that §3.4 / §4.1 (and the WP2.5 §3.17 amendment, whose `rowTotals` property inherits it) are amended to name this
   class, rather than the C-k child being treated as a root of its group. Nothing in Stage 2 is blocked either way —
   the band renders the same cards — but the WP2.5/WP2.6 equivalence wording depends on the answer.
2. **`00_nesting_shape.sql` counts cross-group children only (D2).** The plan's prose for (b) ("a placement on a
   plain-parent child whose worker has no placement on the parent") would count every placement on a same-group child
   as child-only, because the pair is impossible there (C-a). The counts the operator pastes into §9.2 are therefore
   of the cross-group shape — the one NP-b would repair. Confirm before the production run.
3. **D1 (the orphan is unassigned with the group's row).** Recorded as a deviation rather than a stop: the table's
   row 12 and the bullet under it disagree, and the bullet's reading is the one that keeps B3 true. If the operator
   prefers the literal row-12 reading, one line of the planner and two cases change.
4. **Not in this stage (as planned):** every `wall-chart/v2/**` file, the band, the cards, the dialogs, the selector,
   the Units manager, `campaign-unit-card.tsx`, `unit-card-menu.tsx`, `add-campaign-worker-dialog.tsx`,
   `copy-worker-to-unit-dialog.tsx` and the §4.3 interaction suites are Stage 2; `nesting.spec.ts`, the acceptance
   checklist and the SQL runs are Stage 3. The `nested` harness size is in place and unused until Stage 2, which is
   why no interaction test changed here (the `small` fixture is untouched, so the Dan case and the snapshots are
   still WP2.4's and still green).

### 11.9 Fix round 1 — the coordinator's three rulings (NE-a narrowed)

**Ruling 1 (code change): a child nests only when its group DIFFERS from its parent's.** The Stage-1 finding
(§11.8 item 1) is resolved by narrowing the edge, not by widening the equivalence clause. Rationale, as ruled:
(a) WP2.2b's unique `(worker_id, group_id)` index means a worker can never hold both Barrow and Barrow Jetty, so a
same-group "child" can never carry the parent + child pair the nested model is built on; (b) the operator's
requirement is cross-group nesting and says nothing about splits; (c) `DECISIONS.md:14`'s "Split creates sibling units
in the same group" was never amended; (d) the divergence class disappears, so §3.4's equivalence stays as WP2.4 stated
it and WP2.5/WP2.6 inherit the simple wording. **Ruling 2:** D1 approved (the orphan row goes with the group's row);
the case stays. **Ruling 3:** D2 approved and, under ruling 1, no longer a restriction but the definition of a
sub-unit; the SQL and its comments were reworded and query (a) — and (f) — narrowed to match.

Changes:

| File | Change |
|---|---|
| `derive-group-tree.ts` | `nestingParentOf` gains `parent.group_id !== (ou.group_id ?? null)` (the container, has-a-group and self-link conditions unchanged); `isPrimaryGroup` simplified to "some unit of G has no nesting parent" (the old "or a nesting parent in G itself" clause is now unreachable and the two readings agree); the dead branch that treated a member's G row as a child node removed, since every child node is a unit of another group; the NE-a, `foreignNested` and `deriveGroupTree` doc comments restated |
| `plan-nested-drop.ts` | comments only: `targetHoldsGroupRow` is now "a root or a flat card"; the C-k target is an ordinary root. No behaviour change — a same-group child is planned by the root rows, which is what the row-13 cases already asserted |
| `__tests__/fixtures/campaign-42-shape.ts` | "Barrow Jetty" **kept** and re-documented as a sibling root; worker 211 still on it, so the shape is pinned, not deleted |
| `derive-group-tree.test.ts` | NE-a split into "a link to a plain parent of ANOTHER group nests" and a new "a link to a parent in the unit's OWN group is a sibling link, not nesting (ruling 1, C-k)"; the odd-rows case gains a same-group pair; roots now `[KGP, Barrow, Ichthys, Wheatstone, Barrow Jetty]` with `childrenByRoot(Barrow) = []`; `subtreeByRoot(Barrow) = [205, 214, 215]` and `subtreeByRoot(Barrow Jetty) = [211]`; a new case "a C-k same-group child is an ordinary root: its members are NOT rolled up into its parent"; the divergence set is back to `{child-only}` with an explicit assertion that the C-k member is not a divergence; the exact-equality case no longer strips C-k rows. 22 → **24 cases** |
| `plan-nested-drop.test.ts` | row 13 renamed to "a C-k same-group child is an ordinary root (ruling 1)"; its four assertions are unchanged (the planner already routed a same-group target through the root rows) and one is added: dropping the sibling's member on the parent card is a plain root-to-root `move(Barrow Jetty → Barrow)`. 21 cases |
| `00_nesting_shape.sql` | the header definition restated (a nesting edge now requires differing groups; the counts are of nested sub-units by construction); (a) folds the differing-group test into the edge and drops the now-redundant `HAVING` clause; (b)–(e) comments reworded; (f) gains `facet_links_not_nested` (container parents and same-group parents) so the operator can see what did not nest |
| `wall-chart/__tests__/harness/fixture.ts` | comment only (the `nested` rows are unchanged) |
| this plan | §3.2 (b)/(c)/(d), §3.3 NE-a, §3.4 (roots, "every child node is a unit of another group", the equivalence clause), §3.5 `isPrimaryGroup`, §3.7 row 13, §4.1 fixture and cases; §8.3 **D6** with the ruling's rationale, and D1/D2/D4 annotated as approved/subsumed |

Re-verification after the fix round:

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0

$ pnpm exec vitest run src/lib/campaign/groups .../move-worker-mutation.test.tsx .../no-direct-structure-writes.test.ts
 ✓ derive-group-view.test.ts (31)   ✓ derive-group-tree.test.ts (24)   ✓ plan-nested-drop.test.ts (21)
 ✓ resolve-group-selection.test.ts (14)   ✓ wall-chart-prefs.test.ts (11)   ✓ plan-drop.test.ts (8)
 ✓ no-direct-structure-writes.test.ts (3)   ✓ move-worker-mutation.test.tsx (7)
 Test Files  8 passed (8)
      Tests  119 passed (119)

$ pnpm vitest run          # whole app
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > … within budget
AssertionError: expected 8410.41301 to be less than 6000
 Test Files  1 failed | 114 passed (115)
      Tests  1 failed | 1616 passed (1617)

$ pnpm exec eslint <the ten changed files> ; echo "eslint exit=$?"
eslint exit=0

$ pnpm lint | tail -3
✖ 295 problems (143 errors, 152 warnings)

$ git diff --stat main -- supabase/ packages/db-types/                      → empty
$ git diff --stat main -- .../wall-chart/hooks .../wall-chart-unit-hierarchy.tsx .../campaign-wall-chart.tsx → empty
$ git diff --stat main -- .../derive-group-view.ts .../plan-drop.ts         → empty

$ rg -n "localStorage" .../v2 .../campaign-wall-chart-v2.tsx .../lib/campaign/groups
.../wall-chart-v2.interaction.test.tsx:610:    expect(window.localStorage.length).toBe(0);   (WP2.4's own assertion)
$ rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" .../v2 → exit 1
$ rg -n --pcre2 "…campaign_(organising_units|worker_ou)….(insert|update|upsert|delete)\(" src --glob '!**/__tests__/**' → exit 1
$ grep -niE "insert|update|delete|truncate|alter|create|drop|set local|begin|commit" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql → exit 1
```

1,617 tests (+2 on the round: the two new NE-a/root cases; 1,563 on `main`, ≥ 1,563 required), the same single
pre-existing legacy render-cost timing failure, lint at the 295 ceiling, and the boundaries still empty. **Stop
condition 4 is cleared: the only divergence between `rootByWorker` and the view is the child-only class.** Nothing is
committed. No database was touched in this round either.

### 11.10 Fix round 2 — the Stage-1 review (B-1 blocking, A-1…A-8)

Review: `wp24c-stage1-review.md` against `624baca0` — "FIX ROUND NEEDED", one blocking finding and eight
advisories. All of B-1, A-1…A-6 and A-8 are applied; A-7 is recorded as a Stage-2 note in §3.7. No database, no
CLI, no Playwright, nothing committed.

**B-1 (blocking) — a root may hold children in two groups and one of them was invisible.** `deriveGroupTree` built
the full list of a worker's child-node rows and then kept one (`find` over placement-row order), and
`orphanChildByWorker` only ever reported a child under a *different* root, so the second child of the same root was
in neither map — and `planNestedDrop` rebuilt its view of the world from exactly those two maps. §3.7 row 9 creates
this shape on purpose and the planner fixture already had the units (Day/Night in Shift *and* KGP Crew in Crew under
KGP); no fixture worker held two, which is why the suites were green.

Fix, as the reviewer sketched:

| Change | Where |
|---|---|
| `GroupTree` gains `childPlacementsByWorker: Map<number, number[]>` — every child-node row the worker holds, in card order; `childPlacementByWorker` stays "the drawn one" | `derive-group-tree.ts` |
| The drawn child and the reported orphan are chosen in **`childrenByRoot` card order** (a `cardOrder` index over roots × children), never in placement-row order — `fetchOuAssignments` issues no `ORDER BY` and pages with `.range()` | `derive-group-tree.ts` |
| `heldChildrenOf` reads the new list, so the existing per-child unassign loop clears every held child row | `plan-nested-drop.ts` |
| Fixture: the planner's local variant moved into the shared fixture as `campaign42UnitsWithSubUnitGroups()` / `CAMPAIGN_42_SUB_UNIT_PLACEMENTS` / `CAMPAIGN_42_CREW_GROUP_ID`, and worker **220** now holds KGP + KGP Crew + Day — with the Crew row deliberately **before** the Day row, so the card-order rule is actually exercised | `__tests__/fixtures/campaign-42-shape.ts` |
| Plan: D7 in §8.3; §3.4's `GroupTree` and the "two children of one root" rule; §3.7 row 9 | `wp2.4c.md` |

**Is B-1's reproduction still reproducible? No — and the new cases fail without the fix.** Verified by reverting
each half in place and re-running (then restoring):

```
# planner reverted to the two-map heldChildrenOf:
 × … > a worker holding TWO children of one root loses BOTH when they leave it (review B-1, NS-a)
 × … > every child row goes, so a removed worker cannot reappear inside the root (review B-1, D1)
      Tests  2 failed | 21 passed (23)

# derivation reverted (card-order sort removed):
 × … > a worker holding two children of one root is drawn ONCE and counted once in the roll-up
 × … > EVERY held child row is reported, not just the drawn one (what the planner clears)
 × … > which card draws the tile does not depend on the order the placement rows arrive in
      Tests  3 failed | 27 passed (30)

# with the fix in place: 30 passed (30) and 23 passed (23)
```

The three consequences, one by one, on the fixed code: **(1) rendering** — worker 220 is drawn on Day and on no
other card (`cards.length === 1` across the whole view), appears once in `subtreeByRoot(KGP)`, and reversing the
placement array leaves `nodeByWorker`, `workersByNode(KGP Crew)` and `childPlacementsByWorker` identical;
**(2) NS-a** — dropping 220 on Barrow now plans `move(KGP → Barrow)`, `unassign(Shift)`, `unassign(Crew)`, and onto
Barrow Night `move(KGP → Barrow)`, `move(Day → Barrow Night)`, `unassign(Crew)`; **(3) ruling 2 / D1** — dropping
220 on "Unassigned in Worksite" plans all three unassigns, and a new case re-derives the chart from the rows those
steps leave behind (`applySteps`, a miniature of the RPC's displace-then-place / group-scoped delete): 220 is in
`unassignedWorkerIds`, has no `nodeByWorker` entry, is **not** `childOnly`, and appears on no card — checklist step 7.

**Advisories applied**

| # | Change |
|---|---|
| A-1 | `MoveStepError` copies the refusal's `status`, `code` and the auth-js lock sentinels; the §3.13 sentence is unchanged. A case asserts `isLikelyAuthError(wrapped) === true` for a 401/`PGRST301` cause and `false` for a structure refusal, so the steps path keeps the token-refresh retry (re-issuing a plan is safe: a completed `move` re-issues as `skipped`, an `unassign` is idempotent) |
| A-2 | `subtreeByRoot` is seeded for `foreignNested` ids as well, and the per-worker push no longer uses `?.`; the mixed-case test asserts every rendered card (roots + flat) has an entry equal to its `workersByNode` list. Field doc and §3.4 updated |
| A-3 | `nestingParentOf` also requires the **child** to carry a `group_id`; a case proves a legacy `group_id NULL` container under a plain grouped unit is not a node and its legacy placement is simply Unassigned, instead of an undroppable nested card |
| A-4 | `00_nesting_shape.sql` (b)–(e) join `campaign_worker_membership` on `(worker_id, campaign_id)`, exactly as `campaign_group_membership` does |
| A-5 | Those queries now report `workers_in_a_sub_unit` / `paired_workers` / `child_only_workers` / `orphan_workers` beside the placement counts, and the header says a worker with sub-unit placements under two parents can fall in two classes. §3.2 and the README say the same (D10) |
| A-6 | §3.7 row 4 now states the wider rule in the table itself (D8), not only in §11.7 |
| A-7 | Recorded in §3.7 as a Stage-2 note: the aggregated `{inserted, deleted, skipped}` totals must not be used for "N workers moved" copy |
| A-8 | The "four paired placements" comment corrected (three paired; the non-member's row classifies as child-only — now asserted both ways); the resolver's `?ou=` index is first-row-wins, as WP2.4's `find` was; `isPrimaryGroup` takes an optional prebuilt index and `primaryGroups` builds it once, so the selector scan is linear as §3.15 claims |

Re-verification:

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"          → tsc exit=0
$ pnpm exec eslint <the ten changed files> ; echo $?    → eslint exit=0

$ pnpm exec vitest run src/lib/campaign/groups .../move-worker-mutation.test.tsx .../no-direct-structure-writes.test.ts
 ✓ derive-group-view.test.ts (31)   ✓ derive-group-tree.test.ts (30)   ✓ plan-nested-drop.test.ts (23)
 ✓ resolve-group-selection.test.ts (14)   ✓ wall-chart-prefs.test.ts (11)   ✓ plan-drop.test.ts (8)
 ✓ no-direct-structure-writes.test.ts (3)   ✓ move-worker-mutation.test.tsx (8)
 Test Files  8 passed (8)        Tests  128 passed (128)

$ pnpm vitest run          # whole app
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > … within budget
AssertionError: expected 8652.147851999998 to be less than 6000
 Test Files  1 failed | 114 passed (115)
      Tests  1 failed | 1625 passed (1626)

$ pnpm lint | grep problems                            → ✖ 295 problems (143 errors, 152 warnings)

$ git diff --stat main -- supabase/ packages/db-types/                                   → empty
$ git diff --stat main -- .../wall-chart/hooks .../wall-chart-unit-hierarchy.tsx .../campaign-wall-chart.tsx .../wall-chart/v2 → empty
$ git diff --stat main -- .../derive-group-view.ts .../plan-drop.ts                      → empty
$ rg -n "localStorage" .../v2 .../campaign-wall-chart-v2.tsx .../lib/campaign/groups     → only WP2.4's own `expect(window.localStorage.length).toBe(0)`
$ rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" .../v2 → exit 1
$ rg -n --pcre2 "…campaign_(organising_units|worker_ou)….(insert|update|upsert|delete)\(" src --glob '!**/__tests__/**' → exit 1
$ grep -niE "insert|update|delete|truncate|alter|create|drop|set local|begin|commit" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql → exit 1
```

1,626 tests (+9 on this round: 6 derivation, 2 planner, 1 mutation; ≥ 1,563), the same single pre-existing legacy
render-cost timing failure, lint at the 295 ceiling, the boundaries still empty and the Stage-2 surface
(`wall-chart/v2/**`) untouched. Stop conditions: 4 stays cleared (the only divergence is the child-only class), 5
does not fire (every step is expressible with the existing RPC parameters), and this is fix round 2 — 11 ("a third
fix round") is not in play.

---

## 12. Stage 2 evidence (implementer)

Stage 2 of §6.1: the v2 chart renders the tree. Branch `feat/oux-wp2.4c-nested-units` at `8752ea61` (Stage 1 plus its
two fix rounds, reviewed). **No database of any kind was touched**: no connector call, no `supabase` command, no
`.env.local` read, no `pnpm dev`, no Playwright. Nothing under `supabase/` or `packages/db-types/` is modified, the
legacy chart and its suites are untouched, and `derive-group-view.ts` / `plan-drop.ts` are still byte-for-byte
`main`'s (NV-a). Stage 1's library is unchanged except for D11 (one line in `move-worker-mutation.ts`).

### 12.1 Files

New:

| File | What |
|---|---|
| `src/components/campaigns/wall-chart/v2/__tests__/wall-chart-v2.nesting.test.tsx` | 30 cases over the `nested` (campaign-42) fixture: the nested band and the roll-up (B1/B5), NP-a and NC-a on screen, SG-a (the selector, the stored group, `?group=`, `?ou=`), seven rows of the §3.7 table asserted as the RPC payloads in order, the step-2 refusal sentence, Remove from Group (D1), "Move to unit…" targets, the menus and dialogs (SP-a, delete `childOuIds`, merge partners), hidden/empty units, the Units manager and reorder, search, the sheet's Units tab (NC-a visibility) and AP-a on both writers |

Modified (additive, default-preserving):

| File | Change |
|---|---|
| `v2/wall-chart-group-band.tsx` | the band renders the **roots** (then the flat foreign-nested cards, then Unassigned); a root with children renders them into `CampaignUnitCard`'s `subUnits` slot captioned "Units in \<Root\>", each child the same `UnitCardV2` with `nested`; the roll-up sentence, the "N sub-units" badge, `canSplit={!nested}`, merge partners from the tree |
| `v2/use-wall-chart-group-view.ts` | `deriveGroupTree` beside the unchanged flat view; `workersByUnit` is now the per-CARD list, plus `rollupByUnit`, `childrenByRoot`, `shownChildrenByRoot`, `rootUnits`, `nodeIds`, `nodeByWorker`, `rootByWorker`, `tree`; the tile index is `nodeByWorker` (still one card per worker); hidden rules (a root hides its subtree, a child only its own card); "\<Root\> › \<Child\>" in search; focus un-hides both and highlights the card (D12); the rating-hint anchor walks roots then children in DOM order |
| `v2/use-wall-chart-view-v2.ts` | `visibleByUnit` covers every shown card of the tree; the empty rule tests a root on its whole subtree and a child on its own list; `renderedChildrenByRoot`; `emptyHiddenCount` over both levels (D17); metrics over `rollupByUnit` (B5) |
| `v2/use-wall-chart-actions-v2.ts` | every drop / "Move to unit…" goes through `planNestedDrop` → the mutation's ordered `steps` (D18); "Remove from \<Group\>" unassigns the group's row and every sub-unit group held (D1/D19); `mergeCandidatesFor`; `handleWorkersAdded` (AP-a) |
| `v2/use-wall-chart-groups.ts` | `primaryGroups` / `primaryIds` (SG-a), handed to the resolver and to the selector; `trackWallchartGroupSelected.group_count` is the selector's count (§3.12) |
| `v2/wall-chart-dialogs-v2.tsx` | move targets "\<Root\> › \<Child\>"; delete `childOuIds` = the root's children (D17 of WP2.4 closed) and, for a nested source, its siblings as `allOus`; merge candidates from the tree; `onAdded` → AP-a |
| `v2/wall-chart-toolbar.tsx` | the selector lists the primary groups; the Units manager is mounted without `flat` over the projected tree (D14) |
| `v2/move-to-unit-dialog.tsx` | an optional `label` per target |
| `v2/unit-card-menu.tsx` | `canSplit?` (SP-a) |
| `v2/group-selector.tsx` | doc only: `groups` is the primary list |
| `campaign-unit-card.tsx` | `subUnitsLabel?`, `countLabel?` (D16) |
| `add-campaign-worker-dialog.tsx` | `onAdded?(workerIds)` (AP-a) |
| `copy-worker-to-unit-dialog.tsx` | the "Move to \<Root\> first" lock under `groups` (AP-a) |
| `move-worker-mutation.ts` | D11 (the one-step sentence) |
| `__tests__/harness/characterize.ts` | D13 (the header rule) |
| `v2/__tests__/wall-chart-v2.interaction.test.tsx` | the cases the nested reading of the `small` fixture changes (below) |
| `v2/__tests__/wall-chart-v2.control-census.test.tsx` | the nested-card region, and the campaign-42 census |
| `v2/__tests__/wall-chart-v2.characterization.test.tsx` (+ snapshot) | two snapshots change, a `nested` snapshot is added |
| `v2/__tests__/wall-chart-v2.render-cost.test.tsx` | a third mount on `nested`, reported |
| `docs/organiser-ux-review/wp/wp2.4c.md` | §8.3 D11–D22 and this §12 |

Not modified, as §7 requires: every legacy composition file, `wall-chart-unit-manager.tsx`, `split-unit-dialog.tsx`,
`delete-organising-unit-dialog.tsx`, `ou-reassignment-targets.ts`, `structure-api.ts`, `derive-group-view.ts`,
`plan-drop.ts`, `derive-group-tree.ts`, `plan-nested-drop.ts`, `resolve-group-selection.ts`, `campaign-wall-chart-v2.tsx`,
`supabase/**`, `packages/db-types/**`.

### 12.2 `pnpm exec tsc --noEmit` (from `apps/organising-db`)

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

### 12.3 `pnpm vitest run` (whole app, from `apps/organising-db`)

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8402.380795000001 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16

 Test Files  1 failed | 115 passed (116)
      Tests  1 failed | 1657 passed (1658)
   Duration  79.20s
```

1,658 tests (§4.1 requires ≥ 1,563; Stage 1 left 1,626, this stage adds 32: 30 nesting cases, 1 census case, 1
characterisation case). Nothing is skipped, quarantined or deleted. The one failure is the pre-existing legacy
`wall-chart.render-cost.test.tsx` timing case — the only acceptable failure, on the LEGACY chart, untouched here. The
v2 render-cost case passed its absolute and relative budgets **in the same run**:

```
[wp2.4] render-cost legacy: median 6643ms over 3 runs (tiles=250, cards=162; legacy budget 6000ms)
[wp2.4] render-cost v2 largest group (Worksite): median 2436ms over 3 runs (tiles=305, cards=155)
[wp2.4] render-cost v2 all-Unassigned (decision 4): median 1172ms over 3 runs (tiles=305, cards=2)
[wp2.4] render-cost v2 nested (campaign-42 shape, Worksite): median 227ms over 3 runs (tiles=20, cards=9)   ← reported, not asserted (§4.4)
```

The package's own suites:

```
$ pnpm exec vitest run src/lib/campaign/groups src/components/campaigns/wall-chart/v2/__tests__ \
    src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx \
    src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 ✓ wall-chart-v2.nesting.test.tsx (30)        ✓ wall-chart-v2.interaction.test.tsx (41)
 ✓ wall-chart-v2.control-census.test.tsx (3)  ✓ wall-chart-v2.characterization.test.tsx (9)
 ✓ wall-chart-v2.render-cost.test.tsx (1)     ✓ move-worker-mutation.test.tsx (8)
 ✓ derive-group-tree.test.ts (30)             ✓ plan-nested-drop.test.ts (23)
 ✓ derive-group-view.test.ts (31)             ✓ plan-drop.test.ts (8)
 ✓ resolve-group-selection.test.ts (14)       ✓ wall-chart-prefs.test.ts (11)
 ✓ no-direct-structure-writes.test.ts (3)
 Test Files  13 passed (13)
      Tests  212 passed (212)
```

### 12.4 Lint

```
$ pnpm exec eslint <the 21 changed source and test files> ; echo "eslint exit=$?"
eslint exit=0

$ pnpm lint | grep problems
✖ 295 problems (143 errors, 152 warnings)
```

295 total — the §5 ceiling and `main`'s exact number, unchanged by this stage; every changed line is clean.

### 12.5 `git diff --stat main` (the boundaries)

```
$ git diff --stat main -- supabase/ packages/db-types/
(empty: no migration, no regen)

$ git diff --stat main -- .../wall-chart/hooks .../wall-chart-unit-hierarchy.tsx .../campaign-wall-chart.tsx
(empty: the legacy chart is untouched)

$ git diff --stat main -- .../groups/derive-group-view.ts .../groups/plan-drop.ts
(empty: NV-a holds)

$ git diff --stat main -- .../wall-chart/__tests__
 .../wall-chart/__tests__/harness/characterize.ts   |   6 +-     (D13)
 .../wall-chart/__tests__/harness/fixture.ts        |  77 +++-   (Stage 1: the `nested` size)
 .../__tests__/move-worker-mutation.test.tsx        | 118 ++++-  (Stage 1: the `steps` cases)
(the legacy characterisation snapshots are NOT in this list: the golden master is unchanged)
```

### 12.6 The §5 acceptance greps

```
$ rg -n "localStorage" .../v2 .../campaign-wall-chart-v2.tsx .../lib/campaign/groups
.../wall-chart-v2.interaction.test.tsx:633:    expect(window.localStorage.length).toBe(0);   (WP2.4's own assertion)

$ rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" .../v2
exit=1 (pass — XP-a: nesting revived no per-parent view state)

$ rg -n --pcre2 "…campaign_(organising_units|worker_ou)….(insert|update|upsert|delete)\(" src --glob '!**/__tests__/**'
exit=1 (pass — every structure write still goes through `structureApi`; the guard test is green above)

$ rg -n "p_keep_in_parent|keepInParent" .../groups/plan-nested-drop.ts
44:  | { kind: "move"; …; keepInParent: true }
203:    steps.push({ kind: "move", toOuId: parentMoveTarget!, …, keepInParent: true });
206:    steps.push({ kind: "move", toOuId: target!, …, keepInParent: true });

$ grep -niE "insert|update|delete|truncate|alter|create|drop|set local|begin|commit" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql
exit=1 (no write keyword = pass; the file was NOT run — no database access in this stage)
```

### 12.7 The census, re-counted with the nested region

`small`, Employer (which now nests South Deck inside Acme South), build list closed: board 4 + selection bar 5 +
toolbar 12 + charts 2 + print 1 = **24** fixed-page controls, unchanged; **25** with the build list open. Per card,
root and nested alike: `Rating (5 levels)` and `Unit actions` — 2 controls — plus the count click; the Unassigned card
still has none. `FORBIDDEN_NAMES` (`View`, `Apply to all units`, `Unit view`, `Show sub-units`, `Expand all`,
`Collapse all`, `Copy to unit…`) are absent everywhere, on both fixtures. The only name that moved is the Units
button, which counts the tree: `Units (2)` → `Units (3)` on `small`, `Units (7)` on `nested`.

The campaign-42 table (`[wp2.4 census] nested fixture, Worksite, one worker selected`):

```
region                                      elements controls countClick
board (outside the chart card)                     4        4          0   Wall chart | List | Find duplicates | Import participation
selection bar                                      5        5          0   Move to unit… | Remove from Worksite | Clear ratings… | Link to leader… | Clear
toolbar (sticky header)                           12       12          0   Group | Show empty units | Colour by | Filter | Badges: none | % | # | Links | Find worker | Add worker | Import Workers | Units (7)
charts card                                        2        2          0   Worksite (5 units) | Expand assessment distribution
print                                              1        1          0   Print
unit card: KGP                                     7        2          1   Select all in KGP (7 in unit · 3 not yet in a sub-unit) | Rating (5 levels) | Unit actions
unit card: Barrow                                  7        2          1   Select all in Barrow | Rating (5 levels) | Unit actions
unit card: Ichthys                                 7        2          1   …
unit card: Wheatstone                              7        2          1   …
unit card: Barrow Jetty                            7        2          1   …
nested unit card: Day                              7        2          1   Select all in Day | Rating (5 levels) | Unit actions
nested unit card: Night                            7        2          1   Select all in Night | Rating (5 levels) | Unit actions
unassigned card: Unassigned in Worksite            1        0          1   Select all in Unassigned in Worksite
tile: Alan Ashby                                   4        4          0   tile | quick-rate | phone | email
```

### 12.8 The §3.7 table → the cases that pin it on the chart

| §3.7 row | Case in `wall-chart-v2.nesting.test.tsx` | RPC calls asserted, in order |
|---|---|---|
| root U ← node U | "dropping a worker on the card they are already on is a no-op" | none |
| root U ← child C under U (paired) | "row 4 — child → the parent's own area" | `move(→ null, within Shift)` |
| root U ← child C under U (child-only) | "row 4 (child-only) — the parent row is ADDED before the shift row is removed" | `move(null → KGP)`, then `move(→ null, within Shift)` |
| child C′ ← U's area | "row 7 — the parent's own area → a child" | `move(null → Day, keepInParent)` |
| child C′ ← sibling, same group | "row 8 — child → sibling child in the same group" | `move(Day → Night)` |
| child C′ ← root W's area | "row 10 — another root's area → a child under KGP" | `move(Barrow → KGP)`, then `move(null → Day)` |
| Unassigned ← a nested tile | "row 12 — a nested tile → Unassigned in \<Group\>" | `move(→ null, within Worksite)`, then `move(→ null, within Shift)` |
| a refusal part-way (NX-a) | "a refusal on the second step names the step and still refetches" | step 1 committed, step 2 refused → "Step 2 of 2 failed: … The chart shows what was saved." |
| "Remove from \<Group\>" (D1/D19) | "Remove from Worksite on a nested tile issues the group's unassign and the shift's" | `unassign(within Worksite)`, then `unassign(within Shift)` |
| "Move to unit…" targets | "Move to unit… offers each root's children as \<Root\> › \<Child\>" | `move(null → Night)` |

### 12.9 The `small` fixture's v2 cases that the nested reading changes (§4.3)

`small`'s ou 13 "South Deck" (Shift) is a child of ou 12 "Acme South" (Employer), so under NE-a it nests and the Shift
group — whose only unit it is — stops being primary. The v2 suites were updated accordingly; **no legacy suite and no
legacy snapshot changed**.

| Case | Change |
|---|---|
| "lists the groups in display order…" | the band is `["Acme North", "Acme South", "South Deck", "Unassigned in Employer"]`; the selector offers Employer, Worksite, Not in any group (SG-a) |
| "switching groups…" / "a prefs write carries the whole last-read document" | they switched to **Shift**, which no longer exists as a view; they switch to Worksite / Employer instead, and assert the same URL + prefs behaviour |
| "right-click opens a move-only dialog…" | the targets gain "Acme South › South Deck" |
| "one Filter applies to every card…" | "1 empty unit hidden" → "2 empty units hidden" (Acme North and the emptied South Deck) |
| "Show empty units shows a unit emptied by the filter" | the band gains "South Deck" |
| the four Units-manager / search cases | `Units (2)` → `Units (3)`, `Units (1/2)` → `Units (2/3)`, the popover lists the tree ("Acme North", "Acme South(1)", "South Deck"), the band gains "South Deck" |
| "Dan is in South Deck under Shift and Unassigned under Employer" | **rewritten** as §4.3 asks: "Dan is nested under Acme South in the Employer view and Shift is not offered" — NP-a draws his child-only row inside Acme South's card, the roll-up counts him there, and there is no Shift view to switch to |
| the test file's `openUnitActions` helper | scoped to the card's OWN ⋯ menu; a root card now contains its children's menus |

Characterisation: the `default` and `read-only` snapshots gain South Deck as a **level-1** card with Dan on it, Acme
South's header becomes `"3 in unit · 2 not yet in a sub-unit / 3 est."` with `placeholders: 0`, "Unassigned in
Employer" drops from `"8 named · 8 unfilled"` to `"7 named · 8 unfilled"`, and the toolbar reads `Units (3)`. The
`hidden-unit` and `hint-visible` snapshots move the same way; `no-groups`, `not-in-any-group` and the structural
skeleton are unchanged. A `nested` snapshot is added.

### 12.10 Findings and open questions (§8.4)

1. **No stop condition fired.** In particular: nothing under `supabase/` or `packages/db-types/` (1); no legacy
   composition file, `derive-group-view.ts` or `plan-drop.ts` was edited (2); no legacy suite or snapshot changed (3);
   the equivalence set is Stage 1's and is untouched (4); every step of every row of §3.7 is expressible with the
   existing RPC parameters (5); `00_nesting_shape.sql` was not run, so (6) is still Stage 3's; no new flag reader (7);
   `wall-chart-dialogs-v2.tsx` is unchanged on `main` since `8752ea61`, so (8) did not arise; lint is at 295 and `tsc`
   is clean (9); no project was contacted (10); this is Stage 2's first pass (11).
2. **D11 changes a Stage-1 file.** One line of `move-worker-mutation.ts`: a one-step plan's refusal is the bare
   structure sentence. It is the price of D18 (one planner for every drop) and it restores WP2.4's exact copy on a flat
   group. If the reviewer prefers the literal §3.13 sentence on every plan, the line comes out and WP2.4's
   "a refused move surfaces the structure API's sentence" case is rewritten to expect "Step 1 of 1 failed: …".
3. **D15 — which numbers the roll-up sentence shows.** §3.6 names `subtreeByRoot` and §4.6 step 8 requires a
   filtered-out sub-unit's worker to keep counting in the parent, so the sentence reads the derived lists while the
   tiles read the filtered ones. On a card with an active Filter the header can therefore be larger than the tiles on
   screen — which is what "roll-up" means here, and what the placeholders and the summary metrics beside it already
   did. Flagged because it is the one place where a v2 header stops being "what you can see".
4. **D12 — the `?ou=` highlight never worked.** Fixing it was in scope only because §4.3 asks for it on a nested card;
   the retry fixes the root case too. The effect is otherwise WP2.4's.
5. **AP-a's second writer.** The chart's "Assign people…" follow-up is issued for the added workers who hold **no** row
   in the root's group (§3.10's wording). A worker who already sits on another unit of that group keeps it: displacing
   it is a move, and the drag rules — not a dialog's success callback — own moves. **Fix round 1, review B-1:** the
   first pass read the SELECTED group's rows rather than the root's, which on a flat foreign-nested card was the very
   write this item says must not happen; it now reads the root's group and both directions are pinned (§12.11).
6. **Not in this stage (as planned):** `tests/e2e/groups-v2/nesting.spec.ts` and its two helpers, the acceptance
   checklist `wp/wp2.4c-acceptance-checklist.md`, the `00_nesting_shape.sql` runs (dev with the operator's
   confirmation, production by the operator) and the HT-a checklist are Stage 3; NP-b is still open on the production
   counts.

### 12.11 Fix round 1 — the Stage-2 review (B-1, B-2 blocking; A-1…A-8)

Review: `wp24c-stage2-review.md` against `a9ce2b9c` — "FIX ROUND NEEDED", two blocking findings and eight
advisories. All ten are applied. No database, no CLI, no Playwright; nothing committed by the implementer.

**B-1 (blocking) — AP-a tested the wrong group and could move a worker off their worksite.**
`use-wall-chart-actions-v2.ts` computed `parentGroup` and then filtered on `structure.placementByWorker`, which is
the worker's row in the **selected** group. The two coincide only while the card is drawn nested. On a
`foreignNested` card — the mixed case of §3.4, a shift under a worksite seen from the Shift group's own view — the
selected group is Shift and the root's group is Worksite, so a member already on worksite Barrow passed the filter
and the chart issued `move(null → KGP, keepInParent)`, whose displace rule (C-b) moved them to KGP: a silent
structural write out of a dialog's success callback, which §12.10 item 5 says must never happen.

Fix, as the reviewer sketched: the held-set is built from the placement rows filtered by the **parent's** group.

```ts
const heldInParentGroup = new Set(
  ouAssignments.filter((a) => groupOf(a.ou_id) === parentGroup).map((a) => a.worker_id)
);
const withoutAnyRow = workerIds.filter((id) => !heldInParentGroup.has(id));
```

Two cases added, both on the flat-card shape: "AP-a on a FLAT foreign-nested card never moves a worker off their
worksite" (a standalone "Swing" shift makes Shift primary, Day/Night render flat, and the added worker turns out to
be Cal, already on Barrow → **no** RPC at all) and "…still adds the root row for a worker who holds no worksite"
(Gita, unplaced → the one `move(null → KGP)`). **Reverted-fix check: the first case fails without the fix**
(`expected [ [ 'structure_placements_move', null, 10, null ] ] to deeply equal []`).

**B-2 (blocking) — Delete still removed children the dialog never named.**
`wall-chart-dialogs-v2.tsx` passed the NE-a `childrenByRoot` set while
`delete-organising-unit-dialog.tsx:121` sends `deleteChildren: true` unconditionally, so
`structure_unit_delete` removes every `parent_ou_id` child. Two classes went unannounced: a group container's
members — on campaign 42, Delete… on the "EDI Downer" card in the Employer view took all four worksites, their
shifts and their placements behind copy that only warns about losing a unit assignment — and a C-k same-group child,
so deleting "Barrow" silently took "Barrow Jetty" with it.

Fix: announce what the RPC removes, not what the tree nests.

```ts
return ous.filter((o) => o.parent_ou_id === deleteTargetOu.ou_id).map((o) => o.ou_id);
```

`hasChildren` then also suppresses the reassignment step, which is right: those placements are deleted with the
units. Two cases added: the container card reads "is a group with 4 sub-units" / "Delete group + 4 sub-units", and
Delete… on Barrow reads "is a group with 1 sub-unit". **Both fail without the fix** (the dialog takes the ordinary
branch, so `openDialog()` has no such text and no such button). D17 of WP2.4 is now closed in full, and §12.1's
claim is true as written.

**Advisories applied**

| # | Change |
|---|---|
| A-1 | `focusWorker` un-hides the root and the nested card in **one** write, through a new `unhideUnits(ids)` on the group-view hook. Two `toggleHidden` calls could not work: both recompute from the `hiddenOuIds` prop, which does not change between two synchronous calls, and `setWallChart` merges patches — so the second overwrote the first and the root stayed hidden, leaving the highlight on a card nobody rendered. A case over `hiddenOuIds: [KGP, DAY]` pins it and **fails without the fix** |
| A-2 | A flat `foreignNested` card is titled "\<Parent\> › \<Unit\>" — in the band (a new additive `title` prop on `CampaignUnitCard`, D22), in "Move to unit…" (`label`) and in the Find-worker item. A nested card keeps its own name with the root in the "Units in \<Root\>" caption, and a root is `ouDisplayName` as before. Pinned by the mixed-case case's `unitTitles` (`["KGP › Day", "KGP › Night", "Unassigned in Shift"]`) |
| A-3 | `canSplit` is `!nested && nestingParentOf(ou, ouById) == null`, so a flat foreign-nested card offers no Split… either — the depth trigger refuses a grandchild under a plain parent there just as it does on a nested card, which is SP-a's own rationale |
| A-4 | The split dialog's member list is the unit's own rows in the group again (`placementByWorker`), not the tree's per-card list. Stage 2 had re-pointed `workersByUnit` to the card, so splitting a root into crews could no longer place the workers who sit on Day or Night — although they hold the root's row and `structure_unit_split` moves exactly that row. The delete dialog is unaffected (a unit with children takes the `hasChildren` branch, which has no reassignment step) |
| A-5 | The count button's accessible name says what it selects before it carries the two numbers: "Select all in KGP**'s own area** (7 in unit · 3 not yet in a sub-unit)" (D22). D15 itself is unchanged, as the reviewer confirmed |
| A-6 | The Units manager's reorder is filtered to the selected Group's own units, so a nested child's group is never renumbered (D21). The case now pins `p_ou_ids: [BARROW, KGP, 12, 13, 14]` |
| A-7 | The leftover `console.log("OPTIONS", …)` is removed from the nesting suite |
| A-8 | The weak `toContain("empty")` case is replaced by a real D17 count: an Activist filter leaves KGP's subtree non-empty through Night while Day and three whole roots empty, and the band reports "**4 empty units hidden**" — three roots counted once each plus the one empty child of a rendered root |

Re-verification after the fix round:

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0

$ pnpm exec vitest run src/components/campaigns/wall-chart/v2/__tests__ \
    src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx \
    src/lib/campaign/groups src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 ✓ wall-chart-v2.nesting.test.tsx (35)        ✓ wall-chart-v2.interaction.test.tsx (41)
 ✓ wall-chart-v2.control-census.test.tsx (3)  ✓ wall-chart-v2.characterization.test.tsx (9)
 ✓ wall-chart-v2.render-cost.test.tsx (1)     ✓ move-worker-mutation.test.tsx (8)
 ✓ derive-group-tree.test.ts (30)             ✓ plan-nested-drop.test.ts (23)
 ✓ derive-group-view.test.ts (31)             ✓ plan-drop.test.ts (8)
 ✓ resolve-group-selection.test.ts (14)       ✓ wall-chart-prefs.test.ts (11)
 ✓ no-direct-structure-writes.test.ts (3)
 Test Files  13 passed (13)        Tests  217 passed (217)

$ pnpm exec vitest run          # whole app
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > … within budget
AssertionError: expected 8488.333788000002 to be less than 6000
 Test Files  1 failed | 115 passed (116)
      Tests  1 failed | 1662 passed (1663)

$ pnpm exec eslint <the 9 files this round touched> ; echo "eslint exit=$?"
eslint exit=0

$ pnpm lint | grep problems
✖ 295 problems (143 errors, 152 warnings)

$ git diff --stat main -- supabase/ packages/db-types/                                   → empty
$ git diff --stat main -- .../wall-chart/hooks .../wall-chart-unit-hierarchy.tsx .../campaign-wall-chart.tsx → empty
$ git diff --stat main -- .../derive-group-view.ts .../plan-drop.ts                      → empty
$ rg -n "localStorage" .../v2 .../campaign-wall-chart-v2.tsx .../lib/campaign/groups     → only WP2.4's own assertion
$ rg -n "hierarchyViewByParent|subUnitView|applyToAllScopes|UNASSIGNED_KEY|UnitAssessmentViewControl" .../v2 → exit 1
$ rg -n --pcre2 "…campaign_(organising_units|worker_ou)….(insert|update|upsert|delete)\(" src --glob '!**/__tests__/**' → exit 1
$ grep -niE "insert|update|delete|…" scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql → exit 1 (still not run)
```

**1,663 tests** (+5 on this round: the two B-1 cases, the two B-2 cases and the A-1 case; A-8 and A-6 tightened
existing ones), the same single pre-existing legacy render-cost timing failure, lint back at the 295 ceiling — the
first pass of the A-2 fix reached the card title through `structure.cardTitle` inside a `useMemo`, which
`react-hooks/preserve-manual-memoization` refused (297); destructuring it with the hook's other values restores 295 —
and the boundaries still empty. Stop conditions: none fired; this is fix round 1 of Stage 2, so 11 ("a third fix
round") is not in play.

Five files changed this round: `v2/use-wall-chart-actions-v2.ts` (B-1, A-4), `v2/wall-chart-dialogs-v2.tsx` (B-2,
A-2), `v2/use-wall-chart-group-view.ts` (A-1, A-2), `v2/wall-chart-group-band.tsx` (A-2, A-3, A-5),
`v2/wall-chart-toolbar.tsx` (A-6), plus `campaign-unit-card.tsx` (D22's `title?`) and the three test files with
their snapshot.

---

## 13. Stage 3 evidence (implementer)

Stage 3 of §6.1, the part that needs no database: the e2e spec **written and type-checked, never run** (D80/D81 of
wp2.2.md — this sandbox cannot host a browser suite), and the operator's hand test. Branch
`feat/oux-wp2.4c-nested-units` at `7d1f0c34` (Stage 2 plus its review round). **No database of any kind was touched**:
no connector call, no `supabase` command, no `.env.local` read, no `pnpm dev`, no Playwright run. No source file is
modified in this stage — only the e2e helpers, the new spec and the documents.

The rest of the §6.1 Stage-3 row stays **open** and belongs to the operator:

- **HT-a** — the checklist below, run by hand on the branch preview; the orchestrator pastes the result into §9.2.
- **`00_nesting_shape.sql` on dev** — read-only, to be run through the connector with the operator's confirmation
  (this implementer was instructed to make no database access at all).
- **The production counts for campaign 42** — the operator's, and they settle NP-b and stop condition 6.

### 13.1 Files

New:

| File | What |
|---|---|
| `apps/organising-db/tests/e2e/groups-v2/nesting.spec.ts` | Two tests over the campaign-42 shape, built by the spec itself (a worksite root **A** with `shift` sub-units "Day" and "Night" created through `structure_units_create` with `parent_ou_id`, the shape Split leaves behind). **1.** the tree on screen: Day and Night drawn INSIDE A's card under "Units in \<A\>", the "2 sub-units" badge, the roll-up count button ("Select all in \<A\>'s own area (\<n\> in unit · \<m\> not yet in a sub-unit)"), the worker in A's own area, and SG-a — the Shift group absent from the Group control with no "Unassigned in Shift" card anywhere. **2.** the §3.7 drags, each asserted three ways (the ORDERED `structure_placements_move` payloads, `campaign_group_membership`, and the worker sheet's Units tab): A's own area → Day (one `move(null → Day, keep_in_parent)`); Day → Night (one `move(Day → Night)`); Night → A's own area (one `unassign within Shift`, NS-a); back into Day; Day → "Unassigned in \<Group\>" (unassign within the group, **then** within Shift — D1). `withUserPrefs({ mode: "full", flags: { groups_v2: true } })`, both hint dismissals seeded, the sync route scripted all-zero, the worker's placements restored and the two sub-units deleted in `afterAll` |
| `docs/organiser-ux-review/wp/wp2.4c-acceptance-checklist.md` | HT-a, steps 0–14 (D28), in the shape of `wp/wp2.4-acceptance-checklist.md`: a blank line for the branch preview address and where on the PR to find it; a **warning box** before anything else that Delete… on a unit card deletes everything underneath it and that the confirmation names the number ("is a group with N sub-units" / "Delete group + N sub-units"), to be read before confirming; then the WP2.4 flag setup, building the campaign-42 shape through ⋯ → Split… with "Keep workers in 'A' too" left **on**, the Shift group's absence from the Group control, the roll-up header and A's own area, the four drags with the sheet's Units tab as the check each time, Remove from Worksite taking the shift with it, the filter roll-up, the Units list and Find worker ("A › Night"), the menus (no Split… on a nested card; the Delete… sentence, cancelled), Assign people… on a sub-unit (AP-a), the legacy chart, and a clean-up that puts every worker back and deletes Day and Night |

Modified:

| File | Change |
|---|---|
| `apps/organising-db/tests/e2e/groups-v2/helpers.ts` | Eleven additive helper functions with their types (D24), all below the WP2.4 block, which is byte-for-byte unchanged: `NESTED_PREFIX`, `unitTreeOf`, `createNestedUnits`, `removeUnit`, `nestsUnder`, `isSubUnitOnlyGroup`, `findOrCreateNestedFixture`, `tileOn` / `expectTileOn`, `cardHeading`, `recordPlacementMoves`, `expectSheetUnits` |
| `docs/organiser-ux-review/PROGRESS.md` | the WP2.4c row → "Stages 1–2 complete, Stage 3 pending the operator", with the figures below and the two open items |
| `docs/organiser-ux-review/wp/wp2.4c.md` | §8.3 D23–D28 and this §13 |

Not modified: every source file, `tests/e2e/groups-v2/groups-v2.spec.ts` and every other existing spec, anything under
`supabase/` or `packages/db-types/`.

### 13.2 Verification

```
$ pnpm exec tsc --noEmit ; echo "tsc exit=$?"        # from apps/organising-db; covers tests/e2e
tsc exit=0

$ pnpm exec eslint tests/e2e/groups-v2/nesting.spec.ts tests/e2e/groups-v2/helpers.ts ; echo "eslint exit=$?"
eslint exit=0

$ pnpm lint | grep problems
✖ 295 problems (143 errors, 152 warnings)          # the §5 ceiling and main's number, unchanged

$ pnpm exec vitest run                              # whole app
 Test Files  1 failed | 115 passed (116)
      Tests  1 failed | 1662 passed (1663)
# the one failure is the pre-existing LEGACY wall-chart.render-cost timing case
# (8187 ms vs a 6000 ms budget), untouched by this package — as in §12.3 / §12.11.

$ pnpm exec vitest run src/lib/campaign/groups src/components/campaigns/wall-chart/v2/__tests__ \
    src/components/campaigns/wall-chart/__tests__/move-worker-mutation.test.tsx \
    src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 Test Files  13 passed (13)        Tests  217 passed (217)

$ git status --short
 M apps/organising-db/tests/e2e/groups-v2/helpers.ts
 M docs/organiser-ux-review/PROGRESS.md
?? apps/organising-db/tests/e2e/groups-v2/nesting.spec.ts
?? docs/organiser-ux-review/wp/wp2.4c-acceptance-checklist.md

$ git diff --stat main -- supabase/ packages/db-types/ tests/e2e/groups-v2/groups-v2.spec.ts
(empty: no migration, no regen, no existing spec changed)
```

1,663 tests, unchanged by this stage (it adds no vitest case: an e2e spec is not collected by vitest). Nothing is
skipped, quarantined or deleted.

### 13.3 The §4.5 flows → what the spec asserts

| §4.5 flow | Spec | Ordered payloads asserted |
|---|---|---|
| The Shift group is absent from the selector; Day/Night nested in A | test 1 | — (the selector's options, the "Units in \<A\>" caption, the badge, the roll-up button, no "Unassigned in Shift") |
| W from A's area onto Day | test 2 (a) | `move(from null → Day, within null, keep_in_parent true)` |
| Day → Night | test 2 (b) | `move(from Day → Night, keep_in_parent true)` |
| Night → A's area | test 2 (c) | `unassign(within Shift)` — the group's row is already A, so nothing is written for it |
| Day → Unassigned in \<Group\> | test 2 (d) | `unassign(within Group)`, then `unassign(within Shift)` (D1, in that order) |
| The oracle after each | test 2 | `campaign_group_membership` (Worksite row / Shift row) **and** the sheet's Units tab ("\<Group\> › \<Unit\>" lines, including the ones that must be **absent**) |
| `afterAll` restores W and removes the two children | both | `restoreWorker`, then `structure_unit_delete` per child, then the `UNIT_PREFIX` sweep |

Existing specs are unaffected: the WP2.4 spec's own units and helpers are untouched, and both suites skip together
without credentials.

### 13.4 Findings and open questions (§8.4)

No stop condition was met. Two things the operator and the orchestrator should know:

1. **The spec has never been executed.** Everything above is static: TypeScript compiles it and ESLint reads it, but
   no assertion in `nesting.spec.ts` has ever run against a browser or a database (wp2.2.md D80/D81; the operator
   declined e2e secrets for WP2.2 and WP2.4). HT-a, not HT-b, is this package's acceptance.
2. **The checklist creates and deletes two units on dev campaign 1**, and its step 12.4 adds one worker to that
   campaign (Assign people…). The clean-up step puts every worker back and deletes "Day" and "Night"; the worker
   added at 12.4 stays a member of campaign 1, which is ordinary dev data and harmless. Nothing in the checklist
   touches production, and no SQL is run at any point.
