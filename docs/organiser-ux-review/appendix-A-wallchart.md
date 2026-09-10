# Wall chart audit (technical + UX) — organising-db

Read-only audit of the campaign wall chart in `/home/user/OffshoreAlliance/apps/organising-db`. Every claim carries a `file:line` reference. Paths below are abbreviated; the abbreviations map to absolute paths:

| Abbrev | Absolute path |
|---|---|
| `WC` | `/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx` |
| `wc/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/<f>` |
| `wf/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/workforce/<f>` |
| `cmp/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/<f>` |
| `lib/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/lib/<f>` |
| `types/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/types/<f>` |
| `api/<f>` | `/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaigns/[id]/<f>` |
| `page.tsx` | `/home/user/OffshoreAlliance/apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx` |
| `mig/<f>` | `/home/user/OffshoreAlliance/supabase/migrations/<f>` |
| `gen.ts` | `/home/user/OffshoreAlliance/packages/db-types/generated.ts` |

"Inference" marks statements that go beyond what the code literally says.

---

## 0. Where the wall chart lives and how it is reached

- Campaign page tab structure: top-level tabs Overview / Plan & Execution / Section Plans / **Workforce** / Outcomes / Outreach / Library (`page.tsx:417-428`). Workforce sub-tabs: **"Wall Chart / List"**, "Campaign Units", "Scope", "Assessments", "Data fields", "Activists & WOCs", "Foundational Readiness" (`page.tsx:613-621`). The wall-chart sub-tab mounts `WorkforceBoard` (`page.tsx:737-739`); "Campaign Units" mounts `CampaignUnitsSection` + `CoveragePanel` (`page.tsx:741-746`).
- Tab/sub state is in the URL (`?tab=workforce&sub=wall-chart`), default sub for workforce is `wall-chart` (`lib/campaign-tabs.ts:51-56`); the legacy `?tab=wall` redirects there (`lib/campaign-tabs.ts:91`).
- `WorkforceBoard` (`wf/workforce-board.tsx:23-112`) owns a two-way view toggle **Wall chart | List** stored in the URL as `?view=list` (absent = wall chart) (`wf/workforce-board.tsx:15-21, 33-47, 114-136`), renders either `WorkforceListView` or `CampaignWallChart` (`wf/workforce-board.tsx:98-102`), and on mount (writers only) fires `POST /api/campaigns/[id]/sync-universe-workers` to pull universe workers into membership + matching units (`wf/workforce-board.tsx:52-76`; route `api/sync-universe-workers/route.ts:11-54`).
- The worker detail **sheet** is mounted once by `CampaignWorkerDetailProvider` wrapping the whole campaign page (`page.tsx:415`, `cmp/campaign-worker-detail-provider.tsx:54-221`), so any view can open it via `openWorkerDetail`.
- The persistent campaign header (`cmp/campaign-detail-header-bar.tsx`) has a "Build ▾" dropdown whose **Build list** checkbox item toggles `?buildList=1` and forces `tab=workforce&sub=wall-chart` and deletes `?view` (`cmp/campaign-detail-header-bar.tsx:85-104, 148-158`). The panel itself is mounted inside the wall chart (`WC:218-240, 2310-2333`).

Component tree (render order inside `CampaignWallChart`):

```
Card "Wall chart" (WC:1317)
 ├─ sticky wrapper (WC:1346)
 │   ├─ WallChartSelectionBar (only when selection.size>0) (WC:1357)
 │   └─ WallChartSummaryHeader (WC:1391)  — assessment selector, participation, badges, %/#, Links, Find worker, Add worker, Import Workers, Units manager, Expand/Collapse all
 ├─ WallChartAssessmentCharts (WC:1513)  — "Assessment distribution" card with OuTypeSelector
 ├─ flex area (2-col on lg when build list open) (WC:1522)
 │   ├─ units container (WC:1537)
 │   │   ├─ "Unassigned workers" CampaignUnitCard (WC:1545-1666)
 │   │   ├─ per ou_type band → per top-level OU CampaignUnitCard (WC:1677-2301)
 │   │   │     └─ nested sub-unit cards → grandchild cards (WC:2060-2289)
 │   │   └─ RelationshipOverlay (absolute SVG) (WC:2303)
 │   └─ BuildListPanel (WC:2310)
 ├─ Print button (WC:2337)
 └─ dialogs (WC:2348-2522)
```

---

## 1. Data shape

### 1.1 Organising unit (OU) as the UI sees it

`WallChartOU` (`wc/types.ts:127-143`):

```ts
ou_id, campaign_id, name: string|null, ou_type: string|null, total_workers_estimated,
display_order?, unit_basis?: CampaignOuUnitBasis|null, is_group_container?: boolean,
ou_group_id?: number|null, parent_ou_id?: number|null, user_rating?: number|null
```

The wall chart loads `campaign_organising_units` with `select("*")` ordered by `display_order, name` (`WC:509-521`), so the row actually carries every DB column: `anchor_worker_id, commonality_logic, created_at, display_order, is_group_container, name, ou_group_id, ou_id, ou_type, parent_ou_id, source, source_metadata, target_size, total_workers_estimated, unit_basis, updated_at, user_rating` (`gen.ts:5925-5945`). The wall chart never reads `anchor_worker_id`, `commonality_logic`, `source`, `source_metadata`, `target_size`.

### 1.2 `ou_type` (unit type)

- DB CHECK constraint, current list: `shift, department, network, job_type, worksite, employer, ethnic_community, crew_rotation, accommodation, work_area, custom` (`mig/20260503100000_campaign_unit_extensions.sql:17-25`). Original list was only five (`mig/0013_campaign_workflow.sql:113-114`).
- TS union `CampaignOuType` mirrors it (`types/organising-row-types.ts:111-122`).
- Labels: `humanizeOuType` (`wc/types.ts:158-174`) — note `custom` is labelled **"Unit"** there but **"Custom"** in the create dialog's `OU_TYPE_LABELS` (`wc/create-organising-unit-dialog.tsx:45-57`).
- The create dialog's selectable `OU_TYPES` **omits `employer`** (`wc/create-organising-unit-dialog.tsx:32-43`); `GROUPABLE_TYPES` (types allowed for a "Group of units") also omit `worksite`, `job_type`, `employer` (`wc/create-organising-unit-dialog.tsx:59-68`). The Campaign Units section's own `OU_TYPES` list also omits `employer` (`cmp/campaign-units-section.tsx:67-78`). Employer-typed units are created only by import/wizard paths (`/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaign-import/apply/route.ts:510-519`, `cmp/step-campaign-units.tsx:305-348`).
- There is **no "profession" type**. The nearest is `job_type` (label "Job type"); the split wizard maps split-dimension `occupation` → `ou_type "job_type"` (`wc/split-unit-dialog.tsx:86-94`), and assignment rules use `dimension_type` `occupation` / `occupation_grouping` (`lib/campaign/recompute-ou-assignments.ts:4-20`). So the same "profession" idea has three vocabularies: `ou_type=job_type`, rule `dimension_type=occupation|occupation_grouping`, split `dimension=occupation`, plus the worker column `canonical_occupation_id`.

### 1.3 Hierarchy and the DB "group" concept (distinct from ou_type bands)

Three structural relations exist on the same table:

1. **`parent_ou_id`** — sub-unit nesting (`mig/20260524100000_ou_hierarchy_and_worker_dimensions.sql:21-38`). Depth is trigger-enforced: 2 levels for any unit, 3 levels only when the top ancestor is a group container (`mig/20260612100000_ou_three_level_depth.sql:24-84`).
2. **`is_group_container`** + **`ou_group_id`** — a "named group" header OU that holds no workers; member units set `ou_group_id = parent_ou_id = container` (`mig/20260608100000_ou_group_integrity.sql:26-46`). Triggers: consistency (`:50-86`, relaxed in `mig/20260630100000_ou_container_delete_detach_children.sql:24-52`), **no worker may be assigned to a container** (`mig/20260608100000:92-114`), and **a worker may be in units of only one group per ou_type per campaign** (`mig/20260608100000:122-168`).
3. **`ou_type`** — the wall chart treats each distinct top-level `ou_type` as a "dimension"/band (`WC:1677-1703`).

The intended container model per the migration comment: "Level 0: Employer group container / Level 1: Vessel (worksite) unit / Level 2: Shift or crew sub-unit" (`mig/20260612100000:8-13`). Import creates exactly that: an `employer` container with `worksite` children (`api/../campaign-import/apply/route.ts:510-519, 578-587`). The create dialog's "Group of units" instead creates a container **of the same ou_type as its members** (e.g. "Offshore Shifts" group of `shift` units) (`wc/create-organising-unit-dialog.tsx:388-438`).

`unit_basis` (JSONB) records what filter built the unit: `employer_id, worksite_id, canonical_occupation_id, occupation_group_id, shift_id, work_area_id, roster_panel_id, parent_ou_id, dimension, value, tag_category, leader_worker_id, custom` (`types/organising-row-types.ts:139-158`; DB comment `mig/20260503100000:30-31`). It drives: employer/worksite auto-placement (`lib/workers/sync-campaign-universe.ts:50-66, 155-177`), stamping employer/worksite onto workers moved into a unit (`wc/move-worker-mutation.ts:287-297`, `api/create-worker/route.ts:305`), and add-worker defaults (`wc/add-campaign-worker-dialog.tsx:72-76, 532-547`).

`user_rating` is a subjective 1..5 unit rating (`mig/20260701100000_ou_user_rating.sql`), edited in the card header (`wc/unit-rating-control.tsx:38-55`).

### 1.4 Worker ↔ unit membership

- Table `campaign_worker_ou (id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id, created_at)` with `UNIQUE (ou_id, worker_id)` (`mig/0013:131-137`, `gen.ts:8616-8625`; `assignment_source in ('manual','rule')` from `mig/20260414123000_campaign_unit_rules.sql:8-9`).
- Campaign membership itself is a separate table `campaign_worker_membership`; the wall chart loads members from it with a large nested select (`wc/normalize-members.ts:107-138`) and assignments from `campaign_worker_ou` for the campaign's OU ids (`wc/normalize-members.ts:141-153`, `WC:563-573`).
- **A worker can be in many units**: `unitsByWorker: Map<workerId, ouId[]>` (`WC:674-682`); tiles get `inMultipleUnits` + `otherUnitNames` and render a violet `◫` indicator (`WC:1038-1042`, `wc/worker-badges.tsx:143-153`); unit metrics count `multiUnitCount` ("Net" chip) (`wc/metrics.ts:43-44, 152`, `wc/unit-summary-metrics.tsx:268-276`). Nothing in the DB prevents two standalone units of the same type; only the named-group exclusivity trigger constrains grouped units (`mig/20260608100000:122-168`).
- **Primary**: `is_primary` flag, one per worker per campaign by convention (not a DB constraint). Wall chart's `primaryOuByWorker` uses only `is_primary` rows (`WC:684-690`); the list view falls back to "first assignment" then prefers `is_primary` (`wf/workforce-list-view.tsx:261-273`). Set/cleared in the sheet's Units tab (`wc/worker-detail-sheet.tsx:1579-1598`), migrated on move (`wc/move-worker-mutation.ts:146-173, 226-244`), never set by copy/bulk allocate (`wc/move-worker-mutation.ts:247-258`, `lib/campaign/use-allocate-workers-to-ou.ts:31-34`), and set only for single-worker manual allocation from the units section (`lib/campaign/use-allocate-workers-to-ou.ts:34`). The wall chart uses primary only for "jump to worker" targeting (`WC:727-735`) and the delete dialog's "(primary)" label (`WC:1149-1164`).
- **Workers with no unit ("Unassigned")**: computed client-side as members with no `campaign_worker_ou` row in any of the campaign's OUs (`WC:784-795`), rendered as a pseudo-unit card `data-ou-id="unassigned"`, title "Unassigned workers" (`WC:1545-1666`), scope key `UNASSIGNED_KEY = 0` for per-scope state (`WC:924-926`), selection key `u:<workerId>` (`wc/use-wall-chart-selection.ts:15-19`), drag ref `fromOuId: null` (`wc/dnd.ts:13-22`). The migration author's intent: "'Unallocated' is intentionally a computed bucket … no new ou_type and no auto-created row" (`mig/20260503100000:11-13`); the DB views expose it as `ou_id IS NULL` rows (`mig/20260608100000:216-222`). If the campaign has no OUs at all, every member is unassigned (`WC:786`).

### 1.5 Worker row shape and ratings

`WallChartWorker` (`wc/types.ts:14-39`) — name, email, phone, notes, role type, HSR, bargaining rep, union membership type, non-OA union option, occupation, employer, worksite (all joined by `CAMPAIGN_MEMBERS_FULL_SELECT`, `wc/normalize-members.ts:107-123`). Ratings: `campaign_worker_rating_summary` view gives `cumulative_rating`, `last_activity_rating`, `has_supportive_activity_rating`, `supportive_activity_count` per worker (`wc/types.ts:41-49`, `WC:375-385`); per-activity rows come from `campaign_activity_ratings` collapsed to one row per worker (`WC:473-499`).

---

## 2. Rendering

### 2.1 Layout

- Vertical stack of full-width `CampaignUnitCard`s inside `space-y-4` (`WC:1539`), not columns. Each card's tile grid is `grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2` (`wc/rating-colour.ts:30-31`, used at `wc/campaign-unit-card.tsx:273`).
- Order: Unassigned card first (only if it has workers, `WC:1545`), then **bands by `ou_type` of top-level OUs** in first-seen `display_order` (`WC:1682-1690`). A band header ("SHIFT · 3 units" with a rule) is shown only when more than one distinct type exists (`showGroupHeaders = distinctTypes.length > 1`, `WC:1686-1703`). Sub-units are nested inside their parent's card regardless of their own `ou_type` (`WC:1681, 2060-2289`), so the band is decided by the **top-level** unit's type only.
- Placeholder cells: per unit, `max(0, estimate - assigned)` dashed grey cells, capped at 24 with "+N more" text (`WC:1773`, `wc/campaign-unit-card.tsx:92, 275-286`). The Unassigned card instead gets `unfilledSlots = campaign estimate - named members` shown as "· N unfilled" text only, tiles NOT rendered (`WC:853-855, 1597`, `wc/campaign-unit-card.tsx:74-78, 239`).
- Sticky region: the selection bar + summary header are wrapped in `sticky -top-6 z-20` (`WC:1346-1356`); an IntersectionObserver sentinel toggles `isStuck` (`WC:255-271`), on which the header collapses to the assessment selector, controls row and a thin stacked rating bar with a chevron to expand (`wc/wall-chart-summary-header.tsx:57-58, 109-150`). The summary's measured height offsets the sticky build-list panel (`WC:273-300`).
- Build-list mode: the units container and the panel become a `lg:flex-row` with a CSS variable height `calc(100dvh - top - 16px)`; the units column gets its own `overflow-y-auto` scroll region and the panel is `sticky z-30 w-full md:w-[360px] lg:w-[400px]` with `maxHeight` (`WC:1522-1544`, `wc/build-list-panel.tsx:347-365`). On <lg it stacks vertically.
- Card highlight: `?ou=<id>` scrolls to and rings a card (`WC:307-314, 528-541`); worker search does the same for the preferred unit (`WC:720-765`).

### 2.2 Hierarchy display modes ("Unit view" vs "Show sub-units")

For each top-level OU with children: `showSubUnitCards = hierarchyViewByParent.get(ou_id) ?? (is_group_container ? "subunit" : "unit")` (`WC:1707-1710`). In "unit" view the parent card shows a **roll-up**: its own exclusive workers plus all children's workers, each tile tagged with its source child unit (`WC:1718-1743, 2291-2293`); metrics are recomputed for the roll-up set (`WC:1779-1793`). In "subunit" view, only the parent's exclusive workers appear in the parent grid (`parentExclusiveWorkersByOu`, `WC:821-851`) and each visible child is rendered as a nested card (`WC:2060-2289`); grandchildren render inside children (`WC:2206-2280`). Containers get a group roll-up summary chip set regardless (`WC:1794-1825, 1892-1913`). Child cards under containers are content-collapsible and start collapsed (`WC:2134-2136`). Header button "Expand all / Collapse all" flips every parent (`WC:882-913, 1490-1500`).

### 2.3 Unit visibility (`wc/use-wall-chart-unit-visibility.ts`)

A per-browser **hidden set of `ou_id`s** in `localStorage` key `wallchart:unit-visibility:<campaignId>` (`:5-20`), API `{hiddenOuIds, toggleOu, showAll, setHidden}` (`:23-58`). Applied as `visibleOus = ous.filter(!hidden)` (`WC:523-526`); top-level bands and children both respect it (`WC:1682, 1715-1717, 2209-2211`), but hidden children still count in roll-up metrics (`WC:1711-1714`). The "Units (n/N)" manager popover edits it; group containers cannot be hidden (checkbox disabled, `wc/wall-chart-unit-manager.tsx:178-184`). Worker search un-hides the target unit (`WC:737-745`). Empty states: no OUs (`WC:1668-1672`) vs all hidden (`WC:1673-1676`). Note the manager's own text: "Visibility is stored in this browser only. Ordering is saved for everyone." (`wc/wall-chart-unit-manager.tsx:114-116`).

### 2.4 Display modes

- `DisplayMode = "pct" | "count"` for metric chips, persisted per campaign in `localStorage` `wallchart:displayMode:<id>`, default `pct` (`wc/use-display-mode.ts:6-35`, `wc/unit-summary-metrics.tsx:5, 74-77`), toggled by `%`/`#` buttons (`wc/wall-chart-summary-header.tsx:85-106`).
- Assessment view (cumulative vs a specific assessment) changes tile colour and metric block (see §7).
- Hierarchy unit/subunit view (§2.2).
- Build-list mode: reverses tile click semantics (single click selects, double-click opens) (`wc/worker-tile.tsx:81-87, 186-207`).
- Relationship overlay on/off (§6).
- Print: `window.print()` with `print:` Tailwind variants throughout (`WC:2337-2345`).

### 2.5 Tile (`wc/worker-tile.tsx`)

Background colour = cumulative rating (with membership-based default when unrated, `lib/campaign/constants.ts:138-151`) in cumulative mode, or the selected assessment's numeric/pseudo-numeric value in assessment mode (`:124-155`; `wc/rating-colour.ts:45-56`; binary → 2/3/4 `wc/binary-assessment.ts:36-44`). Bands are from `RATING_LEVELS`: 0 unassessed zinc, 1 sky, 2 emerald, 3 amber, 4 red, 5 dark red (`types/planner-types.ts:188-256`; summarised in the card description `WC:1321-1325`). Delegates get a Eureka-flag background image and white text (`:301-308, 334`); activists a thick blue border (`:335-337`); leadership roles bold names (`:352`). Content: cumulative dot + name, large rating badge (last-activity value or assessment value; click opens an inline rating popover), badge row (role, HSR, other-union initials, OA flag, phone/email presence dots), optional list-activity badges, multi-unit `◫`, build-list `✓` (`:346-376`; `wc/worker-badges.tsx`).

### 2.6 Three views of the same data — wall chart vs list vs Campaign Units

| | Wall chart | Workforce list (`wf/workforce-list-view.tsx`) | Campaign Units (`cmp/campaign-units-section.tsx`) |
|---|---|---|---|
| Reached by | Workforce › Wall Chart / List, `?view` absent | same sub-tab, `?view=list` | Workforce › Campaign Units sub-tab |
| Data | `["campaign-members-full"]`, `["campaign-ous"]`, `["campaign-worker-ou"]`, `["campaign-rating-summary"]` (`WC:368-385, 509-573`) | identical query keys/fetchers (`wf/workforce-list-view.tsx:173-217`) | its own `["campaign-members"]` with a smaller select (`cmp/campaign-units-section.tsx:231-250`) |
| Unit of display | card per OU, tiles | one row per worker with `Group` (container name via `ou_group_id`) and `Unit` (primary or first) columns (`:285-293, 326-327, 531-550`); optional "Group by employer" buckets by the primary unit's container (`:599-637, 677-689`) | list of unit rows with rules, ratings, assign/reallocate, plus an "Unallocated" pseudo-unit (`:1772-1800`) |
| Unassigned | "Unassigned workers" card | bucket "Unassigned / No group" = no container (a *different* definition) (`:613-617`) | "Unallocated" = no OU row (`:429-438`) |
| Filters | per unit (§5) | one global filter incl. OU, group, employer, worksite (`:68-79, 409-464`) | n/a |
| Bulk | selection bar (move/copy/remove/link/clear ratings/build list) | Set rating, Assign to unit (`wf/workforce-bulk-toolbar.tsx`) | reallocate / remove / assign |

So yes: three views over the same tables, two of them sharing React Query cache keys; switching Wall chart ↔ List **unmounts** the other (`wf/workforce-board.tsx:98-102`), which resets all wall-chart React state (filters, assessment view, overrides, selection).

---

## 3. Every control visible on the wall chart page

Counts are of distinct user-operable controls; `(W)` = only when `canWrite`. There is **no admin-only gating** anywhere in the wall chart; the only role check is `canWrite` (from `useAuth`, `page.tsx:238`) and the API routes reject `viewer` role (`api/create-worker/route.ts:154-164`, `api/sync-universe-workers/route.ts:30-40`).

### 3.1 Above the card — WorkforceBoard header (`wf/workforce-board.tsx:80-97`) — 4
1. View toggle **Wall chart** (`:123-128`)
2. View toggle **List** (`:129-134`)
3. **Find duplicates** (W) → FindDuplicateWorkersDialog (`:84`, `wc/find-duplicate-workers-dialog.tsx:367-397`)
4. **Import participation** (W) → ImportParticipationDialog (`:85-94, 103-109`)

(Persistent campaign header, not part of the page body but wired to it: Build ▾ {Build list ✓, Import worker list, Add assessment, Task management}, Create Phone Call, Create Email, Create SMS, Actions ▾ {Re-run wizard, All settings, View full plan}, edit-basics pencil — `cmp/campaign-detail-header-bar.tsx:138-227, 258-268`.)

### 3.2 Selection bar (sticky, only when ≥1 tile selected) (`wc/wall-chart-selection-bar.tsx:23-131`, wired `WC:1357-1390`) — 7
5. **Add to build list** (only while build-list panel open) (`:50-62`, `WC:1370-1389`)
6. **Move to unit…** (`:63-72`)
7. **Copy to unit…** (`:73-82`)
8. **Remove from unit** (only if some selected ref is in a real unit) (`:83-94`, `WC:1362-1366`)
9. **Clear ratings…** (`:95-107`)
10. **Link to leader…** (`:108-118`)
11. **Clear** (`:119-127`); also `Esc` clears (`WC:326-331`)

### 3.3 Campaign summary header (`wc/wall-chart-summary-header.tsx`, slots filled at `WC:1391-1503`) — 12 top-level
12. **Assessment view (campaign default)** select (`wc/assessment-selector.tsx:167-280`; `WC:1395-1399`)
13. **Participation source** select (`wc/participation-selector.tsx:30-120`; `WC:1418-1422`)
14. **List badges (campaign default)** popover → 4 channel checkboxes (Phone/Email/Activist list/SMS) + Clear (`wc/list-badge-selector.tsx:48-104`; `WC:1425-1428`)
15. **%** (`wc/wall-chart-summary-header.tsx:86-95`)
16. **#** (`:96-105`)
17. **Links (n)** relationship-overlay toggle (`WC:1431-1441`)
18. **Find worker** typeahead popover (input + up to 50 results) (`wc/worker-search.tsx:40-147`; `WC:1445-1449`)
19. **Add worker** (W) → AddCampaignWorkerDialog with no unit context (`WC:1450-1464`)
20. **Import Workers** (W) → WorkerImportWizard (`WC:1465-1475`)
21. **Units (n)** manager popover (`wc/wall-chart-unit-manager.tsx:96-284`; `WC:1480-1489`), containing: Search units input (`:117-122`), **Show all** (when any hidden, `:124-128`), **New unit** (W, `:129-133`); per top-level unit: collapse chevron (if it has children, `:155-177`), visibility checkbox (disabled for containers, `:178-184`), move up / move down (W, `:198-219`), delete (W, `:220-232`); per child: visibility checkbox (`:247-251`), delete (W, `:258-270`). With zero units the trigger is replaced by a bare **New unit** button (`:88-94`).
22. **Expand all / Collapse all** (only when some parent has children) (`WC:1490-1500`)
23. Stuck-state chevron **Show/Hide details** (`wc/wall-chart-summary-header.tsx:109-130`)

Passive: campaign name, metric chips (Members, OA Members, Delegates, Activists, Contacts, HSRs, Bargaining reps, Avg rating, Participation, Workers, non-OA union tallies, Ph/Em/Lead/Net chips) (`wc/unit-summary-metrics.tsx:161-234, 240-279`), hint text when an assessment is the default (`WC:1400-1409`).

### 3.4 "Assessment distribution" card (`cmp/WallChartAssessmentCharts.tsx:108-169`) — 2
24. **Group units by** `OuTypeSelector` (hidden when ≤1 distinct ou_type) (`cmp/assessment-charts/OuTypeSelector.tsx:20-48`; `:113-117`)
25. Expand/collapse chevron (collapsed = whole-campaign table row per assessment; expanded = stacked bars per unit of the chosen type) (`:118-131, 134-159`)

### 3.5 "Unassigned workers" card toolbar (`WC:1618-1660`) — 4 (+1)
26. **View** per-scope assessment override (`wc/assessment-selector.tsx:298-433`; `WC:1620-1632`)
27. **Badges** per-scope override popover (Use campaign default + 4 channels) (`wc/list-badge-selector.tsx:118-188`; `WC:1633-1644`)
28. **Sort** select (`wc/wall-chart-filter-bar.tsx:151-165`)
29. **Filter** popover (`wc/wall-chart-filter-bar.tsx:167-418`) — internals: Role ×6 checkboxes, Cumulative rating ×6, Membership (Non-member + one per type), Occupation (one per occupation), Phone presence select, Email presence select, Assessment ratings (Add assessment filter select; per added filter: 6 buckets + remove ×), data-field fact filters (`FactFilterControls`), Sort by data field select, **Clear**, **Apply to all units** (`:393-415`; `WC:1652-1657`)
- (+) **Add unit** drag handle when build list is open, W, and the card has visible workers (`wc/campaign-unit-card.tsx:176-210`; `WC:1600-1604`)
- The card is a drop target for tiles (move; Shift = copy) (`wc/campaign-unit-card.tsx:136-171`; `WC:1598`)

### 3.6 Each top-level unit card (`WC:1843-2295`) — 11 per card
Header: unit name, type chip, "N named / M est." (`wc/campaign-unit-card.tsx:211-241`), "Assessing: …" label (`:242-247`), sub-unit count badge (`WC:1864-1875`), coverage/WOC badges (`cmp/activists/unit-coverage-badge.tsx:13-69`; `WC:1876-1879`).
30. Summary chevron (only when it has sub-units; summary collapsed by default) (`wc/campaign-unit-card.tsx:218-235`; `WC:1892`)
31. **Rating:** 1–5 unit rating buttons (W to change) + level badge (+ "Sub-unit avg" badge for containers) (`wc/unit-rating-control.tsx:60-92`; `WC:1882-1891`)
32. **Add unit** drag handle (build list open) (`WC:1851-1855`)
Toolbar (`WC:1914-2059`):
33. **View** override (`WC:1916-1928`)
34. **Badges** override (`WC:1929-1940`)
35. **Unit view / Show sub-units** (only with children) (`WC:1941-1962`)
36. **Add worker** (W, not on containers) (`WC:1963-1978`)
37. **Select all / Deselect all** (W, when visible workers) (`WC:1979-2001`)
38. **Sort** (`WC:2002-2015`)
39. **Filter** (same popover as 29, with Apply to all units) (`WC:2002-2015`)
40. Kebab **Unit actions** (W) (`WC:2016-2057`) → **Split into sub-units** (disabled if empty) (`:2031-2036`), **Add worker to unit** (non-containers) (`:2038-2048`), **Delete unit** (`:2049-2054`)

### 3.7 Each nested sub-unit card (`WC:2115-2283`) — 6 per card
41. Content chevron **Show workers / Collapse** (only when parent is a container) (`wc/campaign-unit-card.tsx:251-265`; `WC:2135-2136`)
42. Summary chevron (`WC:2151-2152`)
43. Rating 1–5 (`WC:2143-2150`)
44. **Add worker** (W) (`WC:2167-2180`)
45. Kebab (W) → **Split into sub-units**, **Delete unit** (`WC:2181-2202`)
46. **Add unit** drag handle (build list open) (`WC:2123-2127`)
No View/Badges/Sort/Filter/Select-all at this level, although per-scope filter state is still read for the child (`WC:2065`) — it can only be set via "Apply to all units".

### 3.8 Each grandchild card (`WC:2240-2274`) — 3
47. Content chevron (`WC:2249`), 48. Rating (`WC:2256-2263`), 49. **Add worker** (W) (`WC:2265-2270`). No kebab, no filter, no drag handle; `assessmentLabel` is hard-coded "Cumulative" (`WC:2245`).

### 3.9 Each worker tile (`wc/worker-tile.tsx`) — 6 interactions
50. Click → open worker sheet; ⌘/Ctrl/Shift-click → toggle selection; in build-list mode single click toggles selection and double-click opens (`:186-207`; `WC:1073-1080`)
51. Right-click → Move/Copy dialog for that assignment (`:318-322`; `WC:1085-1091, 2348-2378`)
52. Drag (carries whole selection if the tile is selected) with Shift-drop = copy (`:209-230`; `WC:1094-1109`; `wc/campaign-unit-card.tsx:141, 159`)
53. Large rating badge → **InlineRatingPopover** (assessment mode: rating picker, notes, Save, "View details") or **CumulativeRatingPopover** (pick assessment then rate) (`:232-299`; `wc/inline-rating-popover.tsx:40-166, 183-360`)
54. Phone dot → open sheet focused on phone (`wc/worker-badges.tsx:167-229`; `WC:1081-1084`)
55. Email dot → open sheet focused on email

### 3.10 Build list panel (when `?buildList=1`) (`wc/build-list-panel.tsx`) — 8 control groups
56. **Lists ▾** picker (+ New list, saved lists ≤12) (`:729-812`)
57. Close ✕ (`:374-383`)
58. **List name** input (saves on blur) (`:388-401`)
59. **Purpose** select (Email/Phone/Activist task/SMS) (`:403-424`)
60. Task leader slot: drop zone, Clear leader ✕, Organiser leader select (purpose=task) (`wc/build-list-leader-slot.tsx:42-131`; `:426-448`)
61. **Drop zone** (`:467-472, 579-638`)
62. Per item: reorder drag handle, name link (opens sheet), **Leader** (purpose=task), Remove ✕ (`wc/build-list-item-row.tsx:31-183`; `:487-536`)
63. Fire bar: four channel buttons (no purpose) or one **Continue to … pathway** (`:640-727`)

### 3.11 Card footer — 1
64. **Print** (`WC:2337-2345`)

### 3.12 Dialogs opened from the page (internals summarised)
- **Move/Copy workers** (`wc/copy-worker-to-unit-dialog.tsx:49-224`): Move|Copy toggle (`:138-161`), target select including "Unassigned (remove from all units)" in move mode (`:188-202`), same-dimension note with a "Copy" link (`:163-177`), Cancel / Move|Copy.
- **Link to leader** (`wc/link-to-leader-dialog.tsx:153-228`): Leader select (Delegates/Activists/HSR/BR), Notes, Cancel / Add links.
- **Remove workers from unit?** AlertDialog: Cancel / Remove (`WC:2416-2432`).
- **Clear ratings** AlertDialog: assessment select, Cancel / Clear ratings (`wc/clear-ratings-dialog.tsx:101-167`).
- **New organising unit** 4-step wizard (`wc/create-organising-unit-dialog.tsx:582-1101`): Single unit | Group of units (`:606-634`); Name / Type / Estimate (`:636-671`); group: Unit type, "Add to existing group | Create new group" (`:692-707`), Group name, member count −/+ , "Set up N units" (`:709-757`), per-member name/estimate (`:759-803`), Select group + New unit name/est (`:805-846`); Placement: top / bottom / after-select (`:852-894`); Workers: per-target buttons, assignment picker, **Allocate selected workers** (`:896-993`); Review; footer Cancel / Back / Next / Create units (`:1035-1098`).
- **Add worker** (`wc/add-campaign-worker-dialog.tsx:767-800`): tabs From database | New worker (`:610-617`); search input + hit list (`:390-441`); Organising unit select (excludes containers; locked when opened from a card) (`:443-467, 659-686`); Employer / Worksite selects; name/email/phone; duplicate resolution panel (Add this person / Create anyway / Back) (`:233-295`); Cancel / Add to campaign | Add worker.
- **Split unit** 4-step wizard (`wc/split-unit-dialog.tsx:555-691`): dimension cards ×7 (occupation, shift, work area, roster/panel, tag, activist connection, custom) (`:733-787`); drafts: name, type select (9 types, no worksite/employer) (`:863-875`), remove, **Add sub-unit**; assign: search, Select all visible, Clear, per-member checkbox, per-draft **Assign**, **Unassign** (parent only) (`:907-1055`); review: **Keep workers in parent too** switch (`:1085`); footer Cancel / Back / Continue / Create N sub-units. Calls RPC `split_campaign_organising_unit` (`:436-441`).
- **Delete unit** (`wc/delete-organising-unit-dialog.tsx:238-391`): three variants (group with children; empty unit; unit with workers → reassign bulk/individual with target selects incl. "Unassigned (remove from this unit only)") (`:240-268, 270-294, 296-391, 410`).
- **Create task list** (from fired build list) (`WC:2453-2461`), **Worker import wizard** (`WC:2463-2471`).

### 3.13 Worker detail sheet (`cmp/campaign-worker-detail-provider.tsx:162-204`, `wc/worker-detail-sheet.tsx`)
Six tabs — Details, Activity, Data fields, Units, Relationships, Development (`:144-152`; note `grid-cols-5` with six triggers). Details: first/last/email/phone inputs, Employer, Worksite, Occupation combobox (+ "Add "…"" create), Organising role, membership fields, HSR + Bargaining rep switches, notes textarea + "Flag for follow up" + Add note, **Save**, and an expandable "No longer in campaign universe" panel with Clear employer/worksite checkboxes + **Remove from campaign** (`:533-743, 1019-1173`). Activity: read-only Lists section, **New task list**, Record rating (assessment select, RatingPicker, notes, **Save rating**), history rows with Edit / Remove (`:1378-1542`). Units: per unit **Make primary** / **Remove**, **Add to another unit** (copy-locked dialog) (`:1612-1675`; `cmp/campaign-worker-detail-provider.tsx:206-218`). Relationships: Led by (**Add leader…**), Leading (**Add workers…**), Tasks led (**New task list**), per-link **Remove**, "Same unit / Crosses units" chips (`wc/worker-relationships-tab.tsx:91-279, 308-347`). Data fields and Development tabs were not audited (external components).

**Totals.** Fixed page controls: 4 + 7 + 12 + 2 + 4 + 1 (print) = **30**, plus popover internals (badges 5; unit manager 3 + 5 per unit + 2 per child; filter popover ≥ 25 inputs before per-type/occupation rows). Per top-level unit card: **11** (kebab holds 3 items); per sub-unit: **6**; per grandchild: **3**; per tile: **6**; build-list panel: **8** groups. A campaign with 6 units, 2 sub-units and 100 workers therefore exposes on the order of 30 + 66 + 12 + 600 ≈ **700 interactive elements** before opening any popover or dialog.

---

## 4. State management — where each piece lives

| State | Where | Reference |
|---|---|---|
| Active tab/sub-tab, `?view=list`, `?buildList=1`, `?ou=<id>` focus | **URL** | `page.tsx:171-200`; `wf/workforce-board.tsx:33-47`; `WC:218-240`; `WC:307-311` |
| Hidden unit ids | **localStorage** `wallchart:unit-visibility:<cid>` | `wc/use-wall-chart-unit-visibility.ts:5-41` |
| %/# display mode | localStorage `wallchart:displayMode:<cid>` | `wc/use-display-mode.ts:6-35` |
| Per-parent unit/subunit view | localStorage `wallchart:subUnitView:<cid>` | `WC:180-198, 858-913` |
| Relationship overlay on/off | localStorage `wallchart:overlay:<cid>` | `WC:333-351` |
| Campaign assessment default + per-scope overrides | React state (`useState`), reset on unmount | `WC:395-399` |
| Per-scope filters/sort (`Map<scope, WallChartFilterState>`) | React state | `WC:401-406, 924-935` |
| Campaign badge default + per-scope badge overrides | React state | `WC:441-449` |
| Participation source | React state | `WC:914-916` |
| Multi-select (`Set<"ouId:workerId">`) | React state (hook) | `wc/use-wall-chart-selection.ts:45-88` |
| Summary "stuck"/expanded, card summary/content expansion, drag-over | React state | `WC:260`; `wc/wall-chart-summary-header.tsx:57`; `wc/campaign-unit-card.tsx:126-128` |
| Active build list id | React state inside `useBuildList` | `wc/use-build-list.ts:134` |
| Unit order (`display_order`), hierarchy, groups, `user_rating`, assignments, ratings, leader links, lists | **Server** (Supabase tables) | `WC:548-561`; `wc/unit-rating-control.tsx:47-51`; `wc/move-worker-mutation.ts`; `wc/use-leader-links.ts`; `/api/campaigns/[id]/worker-lists*` |
| Assessment charts' selected ou_type, expanded | React state | `cmp/WallChartAssessmentCharts.tsx:89-90` |

Consequence: switching to the List view or another tab wipes filters, assessment view, overrides, badge settings and selection (component unmount, `wf/workforce-board.tsx:98-102`), while hidden units, %/#, hierarchy view and overlay survive per browser only and are not shared between organisers.

Server data caching: React Query keys `["campaign-members-full"]`, `["campaign-ous"]`, `["campaign-worker-ou", cid, ouIdsKey]`, `["campaign-rating-summary"]`, `["campaign-activity-ratings", cid, ids]`, `["campaign-assessments-rated"]`, `["campaign-worker-list-activity"]`, `["coverage-map"]`, `["woc-representation-by-unit"]`, `["leader-links","campaign",cid]`. Four sibling hooks deliberately use *different* keys with subset column selects and carry warnings about poisoning the canonical caches (`wc/leader-unit-context.ts:43-47`, `lib/hooks/useAssessmentDistributions.ts:66-69`, `cmp/campaign-worker-assignment-picker.tsx:176-179`, `cmp/activists/use-coverage-data.ts:5-8`).

---

## 5. Filter model (`wc/filters.ts`)

`WallChartFilterState` (`:66-83`) with defaults (`:85-97`):

| Dimension | Type | Logic in `applyFilters` (`:151-240`) |
|---|---|---|
| `sort` | `SortKey` = last_name, first_name, cumulative_desc/asc, last_activity_desc/asc, relationships, occupation, fact_desc/asc (`:17-27`) | not a filter; see `applySort` |
| `membershipTypeIds` + `includeNonMember` | `Set<number>`, boolean | active if either set; keep if worker's `union_membership_type_id` ∈ set, or (includeNonMember && id is null) (`:173-178`) |
| `roles` | `Set<"delegate"|"activist"|"contact"|"hsr"|"bargaining_rep"|"none">` | worker's derived role keys (`roleKey`, `:130-140`, lower-cases role_name; `none` when no keys) must intersect (`:181-184`) |
| `ratings` | `Set<"unrated"|"1".."5">` | bucket of the rating value — per-activity value (binary-aware via `assessmentNumericForWallChart`) when the scope is in assessment view, else cumulative (`:187-201`; buckets `:142-149`: <2→1, <3→2, <4→3, <5→4, else 5) |
| `occupationIds` | `Set<number>` | `canonical_occupation_id` must be in set (null fails) (`:204-207`) |
| `phone`, `email` | `"any"|"has"|"missing"` | presence of non-blank string (`:120-128, 210-211`) |
| `assessmentFilters` | `{activityId, buckets}[]` | AND across assessments, OR within buckets; unloaded ratings count as "unrated" (`:99-104, 214-225`) |
| `factFilters` | `FactFilter[]` (campaign data fields) | `workerPassesFactFilters` (`:227-236`) |
| `sortFactFieldId` | number | pairs with `fact_asc/desc` sort (`:366-384`) |

`hasActiveFilter` (`:106-118`) short-circuits when nothing is set. Sorting (`:242-364`): name sorts, cumulative/assessment value (assessment override when in assessment view, `:305-328`), last activity, occupation, fact value, and **"Group by relationships"** which emits leaders (delegate→activist→contact rank) each followed by their visible followers, then the rest (`:280-295, 386-439`).

Scope: filters are **per unit** (key = `ou_id`, `0` = Unassigned) (`WC:401-406, 924-935`); the filter bar's "Apply to all units" copies the current state to every OU id and to scope 0 (`WC:1652-1657, 2009-2014`). Filter options (membership types, occupations) are derived from the loaded members (`WC:937-958`, `wc/wall-chart-filter-bar.tsx:480-508`); assessment options come from the assessment-selector query (`WC:410-421`); data fields from `useCampaignDataFields` (`WC:387-388`). Ratings for any assessment referenced by a filter are pulled into the single ratings query (`WC:454-469`).

Not filterable on the wall chart (but filterable in the list view): unit, group container, employer, worksite (`wf/workforce-list-view.tsx:68-79`).

---

## 6. Leader/follower overlay and the build-list panel

**Relationship overlay** (`wc/relationship-overlay.tsx:31-193`): reads all `campaign_leader_worker_links` for the campaign (`wc/use-leader-links.ts:122-146`; `WC:353`), finds tile DOM nodes by `data-worker-id`, and draws one quadratic SVG path per (leader, follower) between the closest tile pair (`:53-105`); links whose endpoints share no unit are drawn amber/dashed ("crosses units") else sky (`:79-83, 165-189`); capped at 200 lines (`:36`), recomputed on layout/scroll/resize (`:109-130`). It is `absolute inset-0 pointer-events-none` over the units container (`:138`; container `relative`, `WC:1539`), so it occupies **no layout space** but overlays every card. Toggled by the "Links (n)" button (`WC:1431-1441`); persisted per browser. It exists to show cross-unit leadership structure on the chart itself; the same relationships are edited in the sheet's Relationships tab and via the selection-bar "Link to leader…" (`wc/link-to-leader-dialog.tsx`), and can seed sub-units via the split dimension "Activist connection" (`wc/split-unit-dialog.tsx:248-260, 355-380`).

**Build list panel** (`wc/build-list-panel.tsx`): a cohort builder over `campaign_worker_lists` / `campaign_worker_list_items` via `/api/campaigns/[id]/worker-lists*` (`wc/use-build-list.ts:139-415`; routes `api/worker-lists/route.ts`, `api/worker-lists/[listId]/items/route.ts`). Workers arrive by dropping tiles, multi-selections or whole unit cards (unit MIME payload lists the unit's currently *filtered* worker ids, `wc/dnd.ts:54-65`, `WC:1851-1855`), or via the selection bar (`WC:1370-1389`). A list has a name, purpose (email/phone/task/sms), optional task leader (worker via drop or organiser via select), and can be "fired" into a channel pathway (`:286-319, 640-727`). Screen impact: sticky right column `md:w-[360px] lg:w-[400px]` with `maxHeight: calc(100dvh - top - 16px)` (`:347-365`); the wall chart shrinks to the remaining width and scrolls inside a fixed-height column (`WC:1522-1544`); tiles switch to "click selects" mode with thick green borders and ✓ overlays (`wc/worker-tile.tsx:81-87, 339-343`; `WC:1092-1093`). Panel open state is URL-driven so the campaign header can toggle it from any tab (`WC:218-221`).

---

## 7. Assessment and participation selectors

**AssessmentSelector** (`wc/assessment-selector.tsx:167-280`) chooses the campaign-wide `AssessmentSelection` — `{kind:"cumulative"}` or `{kind:"assessment", activityId, title, isBinary, supporterOutcomeValue, ratingLabels}` (`wc/types.ts:87-98`) — from `campaign_activities` of kind `assessment`, grouped into rated / not-yet-rated, with ambition-link and last-rated hints (`:39-121, 209-277`). Per scope, **UnitAssessmentViewControl** ("View") overrides it with Inherit / a specific assessment / "Cumulative only", highlighted amber when it differs (`:298-433`). The effective selection per scope (`effectiveAssessmentForScope`, `WC:136-142`) drives tile colour and the large badge (`WC:1043-1053`; `wc/worker-tile.tsx:121-155`), the metric block (assessment metrics replace the membership block, `wc/unit-summary-metrics.tsx:85-159`; computed `wc/metrics.ts:181-214`), the rating filter semantics (§5), the sort value (`wc/filters.ts:305-328`), the inline rating popover target (`wc/worker-tile.tsx:271-287`), and which assessment the distribution charts show (`WC:1515-1519`). Why it exists: ratings are stored per activity (`campaign_activity_ratings`) while the tile's default colour is a rolled-up cumulative from a view; organisers need to look at the chart through the lens of one action (e.g. a vote) without losing the cumulative view, and binary outcomes must map onto the same colour scale (`wc/binary-assessment.ts:36-44`).

**ParticipationSelector** (`wc/participation-selector.tsx:30-120`) chooses the *source* of the "Participation" chip: "Any supportive rating" (workers whose summary `has_supportive_activity_rating` is true), "Latest activity" (raters of the most recently created activity), a specific activity, or a task list (its activity's raters) (`wc/use-participation-predicate.ts:20-92`). The resulting predicate feeds `computeMetrics` (`WC:917-922`; `wc/metrics.ts:167-171`) and the chip label (`participationSourceLabel`, `wc/participation-selector.tsx:135-146`). Why it exists: to express "how many in this unit took part in X" as a ratio without changing tile colours.

---

## 8. Pain points inferred from the code

**Complexity hotspots**
- `WC` is 2,527 lines; the render body from `WC:1677` to `2301` is a triple-nested IIFE. The identical 8-argument `applyFilters` + `applySort` + metrics sequence is repeated four times: unassigned (`WC:1553-1573`), top-level (`WC:1745-1772`), child (`WC:2065-2094`), grandchild (`WC:2217-2229`); the `CampaignUnitCard` prop block is repeated three times with diverging feature sets (§3.6-3.8).
- Roll-up bookkeeping (`rollupSourceOuByWorker`, `parentExclusiveWorkersByOu`, `groupRollupIds`) is computed inline per render (`WC:821-851, 1718-1743, 1794-1825`).
- Per-scope state is four parallel `Map<number, …>` (`filterByScope`, `unitAssessmentOverride`, `unitBadgeOverride`, `hierarchyViewByParent`) keyed by `ou_id` with `0` as a magic Unassigned key (`WC:395-406, 441-449, 858-860, 924-926`).
- Three copies of the same data loaders (wall chart `WC:368-385, 509-573`; list view `wf/workforce-list-view.tsx:173-217`; detail provider `cmp/campaign-worker-detail-provider.tsx:65-96`) plus four hooks that must avoid those keys (§4). No shared "campaign workforce" hook.
- `reorderOus` and the create wizard write `display_order` with one UPDATE per unit sequentially (`WC:548-561`; `wc/create-organising-unit-dialog.tsx:447-454`). Move/copy is a client-side multi-step sequence (up to ~10 round trips) with no transaction (`wc/move-worker-mutation.ts:54-58, 64-299`).
- No API route exists for organising units or assignments; every writer talks to `campaign_organising_units` / `campaign_worker_ou` directly from the browser (28 files touch the table — grep in §"Where units are written"; e.g. `WC:548-561`, `wc/merge-units-dialog.tsx:69-84`, `wc/delete-organising-unit-dialog.tsx:103-190`), except the split RPC (`wc/split-unit-dialog.tsx:436-441`).

**Duplicated / overloaded concepts**
- "Group" means four things: (a) an `ou_type` band on the wall chart and in DnD comments ("units of the same ou_type form a dimension", `WC:1246-1251`; "Group units by" in charts, `cmp/assessment-charts/OuTypeSelector.tsx:31-33`); (b) a DB group container (`is_group_container`/`ou_group_id`; "Group of units" in the create dialog, "Group" column and "Group by employer" in the list view, `wf/workforce-list-view.tsx:531-535, 684-687`); (c) parent/child sub-units (`parent_ou_id`; "Expand all groups" tooltip, `WC:1497`); (d) the sort option "Group by relationships" (`wc/wall-chart-filter-bar.tsx:68`).
- "Dimension" means the ou_type band (`WC:1246`, `wc/copy-worker-to-unit-dialog.tsx:66-69`), the split dimension (`types/organising-row-types.ts:129-136`), and a rule `dimension_type` (`lib/campaign/recompute-ou-assignments.ts:8-16`) — three non-identical vocabularies.
- "Unassigned" (wall chart, dialogs: `WC:1594`, `wc/copy-worker-to-unit-dialog.tsx:194`, `wc/delete-organising-unit-dialog.tsx:410`) vs "Unallocated" (units section `cmp/campaign-units-section.tsx:1777`, DB view comment `mig/20260608100000:216-222`, picker `cmp/campaign-worker-assignment-picker.tsx:411-417`) vs "Unassigned / No group" (list view, a different definition: no container, `wf/workforce-list-view.tsx:617`). The "unassigned" computation exists three times (`WC:784-795`; `cmp/campaign-units-section.tsx:429-438`; `wf/workforce-list-view.tsx:599-637`).
- Two separate per-parent hierarchy-view states: `hierarchyViewByParent` (wall chart, localStorage) vs `subUnitViewByParent` (units section, React state) (`WC:858-860`; `cmp/campaign-units-section.tsx:224-226`).
- Two "primary unit" resolutions with different fallbacks (`WC:684-690` vs `wf/workforce-list-view.tsx:261-273`).
- "View" is the label of the per-unit assessment override (`wc/assessment-selector.tsx:369-371`), while "view" in the URL means wall chart vs list, and "Unit view" means the roll-up mode (`WC:1960`).

**Special-casing of `ou_type`** (a grep for `ou_type ===|fromOuType|"custom"|is_group_container` over `src` returns 215 lines). Wall-chart-relevant sites: cross-type move guard that silently drops the move (`WC:1246-1268`); move dialog restricts targets to the source type unless `custom` (`wc/copy-worker-to-unit-dialog.tsx:70-95`); reassignment targets: siblings, else same group, else same type, `custom` → any (`lib/campaign/ou-reassignment-targets.ts:15-42`); delete-dialog hint (`wc/delete-organising-unit-dialog.tsx:227-233`); `shift`-specific placeholders (`wc/create-organising-unit-dialog.tsx:716-722, 828`); groupable-type allowlist (`:59-68`); units section reallocate restricted to same type (`cmp/campaign-units-section.tsx:2120-2127, 2160-2177`); wizard employer/worksite handling (`cmp/step-campaign-units.tsx:305-370`); import creates `employer` containers with `worksite` children (`api/../campaign-import/apply/route.ts:510-519, 578-587`); DB exclusivity trigger keyed on `ou_type` (`mig/20260608100000:122-168`).

**Inconsistencies / likely bugs**
- Sheet tab list is `grid-cols-5` but has six tabs (`wc/worker-detail-sheet.tsx:145-151`).
- Card description promises "unmapped slots … (up to 40 displayed)" (`WC:1328-1329`) but the Unassigned card never renders those tiles (`wc/campaign-unit-card.tsx:74-78`) and unit placeholders cap at 24 (`:92`).
- Grandchild cards hard-code `assessmentLabel="Cumulative"` (`WC:2245`) while their tiles still colour by the effective scope selection (`WC:2273` → `renderTile` scope `gc.ou_id`, inheriting the campaign default) — label and colour can disagree when the campaign default is an assessment.
- `getWallChartDefaultCumulative` compares `role_name === "Activist"` (capital A) (`lib/campaign/constants.ts:144`) while every other client comparison lower-cases (`wc/filters.ts:132`, `wc/worker-tile.tsx:156`). Migrations moved from `'Activist'` literals (`mig/20260429120000_default_membership_cumulative_rating.sql:49`) to `lower(role_name)` (`mig/20260611110000_normalize_binary_support_tracking.sql:16`, `mig/20260717100000_activist_woc_module.sql:408`), indicating the stored casing is not trusted. Fragile.
- The Units manager says containers are "always visible", yet their children can be hidden and hidden children still count in roll-ups (`wc/wall-chart-unit-manager.tsx:182-183`; `WC:1711-1717`).
- Hiding all units of a type removes its band and can flip `showGroupHeaders` off, changing the layout of the remaining band (`WC:1682-1687`).
- Cross-type drag silently no-ops (`WC:1263-1266`) while the dialog path explains the restriction (`wc/copy-worker-to-unit-dialog.tsx:163-177`).
- Sub-unit cards read per-scope filter state that they offer no UI to edit (`WC:2065`, toolbar `WC:2164-2205`).
- Per-scope "Apply to all units" iterates `ous` including group containers (`WC:1655, 2012`), which never render worker grids.
- `merge-units-dialog.tsx:49-52` computes `totalWorkers` by flattening `Array.from({length})` per unit — it sums, not de-duplicates, despite the "distinct" label.
- No TODO/FIXME/HACK comments exist in the wall-chart or workforce trees (grep returned nothing); no tests exist for `filters.ts`, `metrics.ts` or the wall chart (no `__tests__` under `wc/`).

**UX load (inference from the counts in §3)**: with 2–6 campaigns each of several units, an organiser's default view is every unit of every type stacked vertically, each with its own toolbar (11 controls) and filter popover, plus a global header of 12 controls, an assessment-distribution card, and an Unassigned card at the top. Nothing scopes the page to one dimension except manually hiding units in the "Units" popover per browser.

---

## 9. What would have to change for the group view selector

### (a) Per-group view selector, defaulting to one group

Existing mechanisms this maps onto:
- The natural "group" key is `ou_type` — the wall chart already partitions top-level OUs by it (`WC:1682-1690`), the assessment charts already have a single-select **"Group units by"** `OuTypeSelector` with a heuristic default (the type with the highest assessment completeness) (`cmp/assessment-charts/OuTypeSelector.tsx:20-48`; `lib/hooks/useAssessmentDistributions.ts:230-248, 342-371`), and DnD / move / delete / reassignment / DB exclusivity already treat `ou_type` as the dimension boundary (§8). `humanizeOuType` supplies labels (`wc/types.ts:158-174`).
- Visibility today is per `ou_id` in localStorage (`wc/use-wall-chart-unit-visibility.ts`). A type-level selector should be a **separate** piece of state (`visibleOuTypes: Set<string>` or an ordered list with one default), not folded into `hiddenOuIds`, because (i) worker search auto-un-hides by `ou_id` (`WC:737-745`), (ii) the "Units (n/N)" trigger counts hidden ids (`wc/wall-chart-unit-manager.tsx:55-59, 108`), and (iii) the empty-state copy assumes id-level hiding (`WC:1673-1676`).
- Rendering change: replace `distinctTypes.map(...)` at `WC:1689` with the selected type(s); "add another group" = append a type to the visible set; band headers should then always render (drop the `distinctTypes.length > 1` rule at `WC:1687`). `Expand/Collapse all`, `Apply to all units` (`WC:1652-1657`) and `metricsByOu` should be scoped to the visible types.
- Persistence choice: the other view prefs are per-browser localStorage (§4). A campaign-level default group has no home in the schema; options are a new column on `campaigns` (e.g. `wall_chart_default_ou_type`), a per-user preference table, or localStorage with the charts' heuristic (`defaultOuType`) as the seed. The charts card should consume the same selection instead of its own state (`cmp/WallChartAssessmentCharts.tsx:89-100`).

Data-model gaps:
- `ou_type` is a free string with a CHECK list and no per-campaign metadata (label, order, colour, default) — the "group" is not an entity. There is no `profession` type; `job_type` would have to be relabelled or a new value added to the CHECK (`mig/20260503100000:20-25`), the TS union (`types/organising-row-types.ts:111-122`), `humanizeOuType`, and the three hard-coded `OU_TYPES` lists (`wc/create-organising-unit-dialog.tsx:32-43`; `cmp/campaign-units-section.tsx:67-78`; `cmp/add-workers-client.tsx:75`).
- Banding uses the **top-level** unit's type, so `worksite` units nested under an `employer` container land in the "Employer" band (`WC:1682-1690`; import path `api/../campaign-import/apply/route.ts:510-587`). A worksite group view must either flatten containers (show member units of the chosen type wherever they sit) or treat the container as part of the worksite group. Likewise sub-units split by occupation carry `ou_type=job_type` under a shift/worksite parent (`wc/split-unit-dialog.tsx:86-94`); the "profession" group would have to surface those nested units at top level or duplicate them.
- `custom` is exempt from every dimension rule (`WC:1256-1259`; `wc/copy-worker-to-unit-dialog.tsx:73, 90`; `lib/campaign/ou-reassignment-targets.ts:39`) — a "custom" group would behave differently from the others.
- The named-group exclusivity trigger is per `ou_type` per campaign (`mig/20260608100000:122-168`), which aligns with per-type views, but nothing prevents membership in two *standalone* units of one type; a per-group view will make such double assignments visible.

### (b) An "unassigned" unit per group

- Today's Unassigned = no assignment in **any** unit (`WC:784-795`). Per-group unassigned = members with no `campaign_worker_ou` row whose OU has the group's `ou_type` — computable client-side from `ouAssign` + `ouTypeById` (`WC:666-682`) with no schema change; sub-units' own types must be decided (parent's type vs own) as above.
- Scope keys: all per-scope Maps are `Map<number,…>` with `0` reserved (`WC:401-406, 441-449, 926`). A per-type pseudo-unit needs either negative/synthetic numeric keys or a switch to string scope keys (`ou:<id>`, `unassigned:<type>`), touching `getFilter/setFilter`, override maps, `effectiveAssessmentForScope` (`WC:136-142`), `data-ou-id` targeting (`WC:1585, 532, 741-757`), and `highlightedOuId` (`WC:312-314`).
- Selection and DnD already carry `fromOuType` on every ref (`wc/dnd.ts:13-22`; `WC:1089-1108`); the selection key uses `u` for unassigned (`wc/use-wall-chart-selection.ts:15-19`) and would need the type.
- Dropping onto a per-type Unassigned card means "remove from all units **of this type**". `useMoveWorkersMutation` supports only `toOuId: null` = strip from **all** campaign units (`wc/move-worker-mutation.ts:72-90`), so a new mode (`toOuId: null, withinOuType`) is required; the bulk "Remove from unit" path (`WC:1287-1314`) removes specific refs and could be reused. The Move dialog's "Unassigned (remove from all units)" option (`wc/copy-worker-to-unit-dialog.tsx:193-195`) and delete-dialog target (`wc/delete-organising-unit-dialog.tsx:410`) would need type-aware wording.
- Metrics/filters for the pseudo-unit already work per scope (`unassignedMetrics`, `WC:1010-1032`); `unfilledSlots` (campaign estimate minus named) only makes sense once per page, not per group (`WC:853-855, 1597`).
- The DB views model a single Unallocated bucket (`ou_id IS NULL`, `mig/20260608100000:216-222`); if reporting must match the UI, a per-type variant of `campaign_unit_assignment_summary` would be needed. The migration comment explicitly chose "no auto-created row" for Unallocated (`mig/20260503100000:11-13`); creating real per-type "Unassigned" OU rows would collide with the group-exclusivity trigger and with `unit_basis`-driven auto-placement (`lib/workers/sync-campaign-universe.ts:50-66`), so computed buckets remain the safer route (inference).

### (c) Workers unassigned to any group

- This is the existing global Unassigned set (`WC:784-795`), already rendered first (`WC:1545`) and labelled "Unassigned" in worker search (`WC:699-705`). Under a per-group default view it should stay visible regardless of the selected group (or be a permanent pseudo-group), and be distinguished from the per-group unassigned (a worker in a shift unit but no worksite unit is "unassigned to worksite" yet not "unassigned to any group").
- Three definitions must be reconciled in copy and code: wall chart (no OU row), units section "Unallocated" (same, `cmp/campaign-units-section.tsx:429-438`), list view "Unassigned / No group" (no container, `wf/workforce-list-view.tsx:604-617`). Ideally one shared derivation (e.g. in `wc/normalize-members.ts` next to `fetchOuAssignments`) consumed by all three views.
- `primary` is campaign-wide, not per type (`wc/worker-detail-sheet.tsx:1579-1598`; `wc/move-worker-mutation.ts:226-244`). If "the worker's worksite" and "the worker's shift" both matter, a per-type primary (or simply "one unit per type" as the norm, which the exclusivity trigger already enforces for grouped units) is a data-model decision to make before the redesign; otherwise the list view's `Unit` column and the sheet's "Make primary" stay single-valued.

Where units are written (for scoping any schema change): 28 files reference `campaign_organising_units`, including the wall chart (`WC:509-521, 548-561`), create/split/merge/delete/unit-rating dialogs (`wc/create-organising-unit-dialog.tsx`, `wc/split-unit-dialog.tsx`, `wc/merge-units-dialog.tsx`, `wc/delete-organising-unit-dialog.tsx`, `wc/unit-rating-control.tsx`), `wc/move-worker-mutation.ts`, `cmp/campaign-units-section.tsx`, `cmp/campaign-wizard.tsx`, `cmp/step-campaign-units.tsx`, `cmp/campaign-settings.tsx`, `cmp/add-workers-client.tsx`, the import wizard and import/apply routes, `api/add-workers/route.ts`, `api/create-worker/route.ts`, `api/workers/duplicates/route.ts`, `lib/campaign/generate-ou-candidates.ts`, `lib/campaign/recompute-ou-assignments.ts`, `lib/workers/sync-campaign-universe.ts`, `lib/hooks/useAssessmentDistributions.ts`, `cmp/activists/use-woc-data.ts`, `cmp/campaign-list-builder.tsx`, `cmp/campaign-workplan.tsx`, `cmp/campaign-worker-assignment-picker.tsx`, `cmp/campaign-worker-detail-provider.tsx`, `wc/leader-unit-context.ts`, `wf/workforce-list-view.tsx`.
