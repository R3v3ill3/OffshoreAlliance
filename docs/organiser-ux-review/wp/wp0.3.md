# WP0.3 — Defaults, copy and layout quick wins

App: `apps/organising-db`. All paths below are relative to `apps/organising-db/` unless they begin with `docs/` or `supabase/`.
Branch: `feat/oux-wp0.3-defaults-copy-layout` (stacked on WP0.1 until PR #22 merges; PR base `develop`).

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP0.3 Defaults, copy and layout quick wins.** Standard implementer. Campaign pages open on the wall chart (`src/lib/campaign-tabs.ts` default tab, appendix D 3.1); list rows, dashboard cards and the header Back arrow agree on that target; tiles render above the assessment-distribution charts (appendix A 2.1); "Scope" becomes "Who's in" and the Named universes card is hidden (appendix B 3.2); "Unallocated" and "No unit" become "Unassigned" (appendix B 4.5 lists every site); the "Continue to workers" button label is corrected (appendix B 2.1); the List layout is the default on touch devices (appendix D 8); the worker sheet's six tabs fit their grid (appendix A 8). Acceptance: each item verified by test or screenshot; no behaviour change beyond the listed items. No dependencies.

### 1.2 Decisions consumed (`docs/organiser-ux-review/DECISIONS.md`, "Answers", 2026-09-08)

This package consumes no section-9 decision as a blocker (the register lists no work package as blocked on WP0.3, and WP0.3 lists "No dependencies"). It is nonetheless constrained by:

- **Decision 4 — Confirmed, with a note.** Unassigned is derived, never stored. WP0.3 changes labels only; no derivation, no materialised Unassigned rows. The note ("at instigation it is common for 100% of the membership to be Unassigned") means the renamed bucket is the *normal* state and its copy must not read as an error — relevant to the strings in §2.5.
- **Decision 7 — Amended: no creation path is retired.** The wizard's step-2 button label changes (§2.6); no wizard step is removed or reordered.
- **Decision 9 — Confirmed.** Guides: manifest updates are in scope for the packages that change routes or labels. §2.10 shows this package requires **no** manifest edit, and lists the clips that become re-record candidates for WP1.7/WP2.9.
- **Plan section 3.6 terminology** (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`): *Who's in*, *Group*, *Unit*, *Unassigned* (within a group), *Not in any group* (campaign-wide), *Standalone*, *Strategic plan*, *Colour by*. Every user-facing string this package touches uses that vocabulary.

### 1.3 Global rules this package designs within

- No schema change. **No migration file is created by this package.** Nothing in the plan touches `supabase/`.
- No database access of any kind; production (`gteygwfgjvczanmrwgbr`) is never read.
- Nothing is removed. The Named universes card is *gated off*, not deleted, and its query keeps feeding the Actions tab.
- No view state in `localStorage`. The touch default (§2.7) is computed per render from the device flag and the URL; nothing is written anywhere.
- URL identifiers are never renamed. `?tab=workforce&sub=universe` keeps working; only labels change.

---

## 2. Plan

Twelve edits across ten files, two new files, one new test file, one updated test file. Nothing here changes a query, a mutation, a derivation or a route identifier.

---

### 2.1 Item 1 — Campaign pages open on the wall chart

**Files:** `src/lib/campaign-tabs.ts`, `src/app/(dashboard)/campaigns/[id]/page.tsx`.

**Today.** `src/lib/campaign-tabs.ts:109-135` — `resolveTabParams(tab, sub)` returns `{ tab: "overview", sub: null }` when `tab` is falsy (`:110-112`). `DEFAULT_SUB` (`:51-56`) already maps `workforce → "wall-chart"`. The page passes `null` for an unknown `?tab=` value (`page.tsx:174-181`), so unknown tabs also land on Overview. Appendix D 3.2 records the resulting mismatch: the list rows force `?tab=workforce&sub=wall-chart` (`campaigns/page.tsx:424, 445`) while bare `/campaigns/[id]` links open Overview.

**Change (a) — the registry.** In `src/lib/campaign-tabs.ts`, add above `resolveTabParams`:

```ts
/** The tab a campaign opens on when the URL carries no (or an unknown) ?tab=. */
export const DEFAULT_CAMPAIGN_TAB = "workforce";
/** The sub-tab that pairs with DEFAULT_CAMPAIGN_TAB. Must match DEFAULT_SUB. */
export const DEFAULT_CAMPAIGN_SUB = "wall-chart";
```

and replace the `if (!tab)` branch at `:109-112` with

```ts
  if (!tab) {
    return { tab: DEFAULT_CAMPAIGN_TAB, sub: sub ?? DEFAULT_CAMPAIGN_SUB };
  }
```

Honouring an explicit `?sub=` here matches the behaviour the redirect branch already has (`:120-124`), so `/campaigns/12?sub=assessments` opens Workforce › Assessments rather than silently forcing Wall Chart. Update the file's header comment (`:1-10`) and the `resolveTabParams` doc block (`:99-108`) to say the no-`?tab=` default is Workforce › Wall chart.

`DEFAULT_SUB.workforce` (`:53`) stays as it is; `DEFAULT_CAMPAIGN_SUB` must equal it and a test asserts that (§2.9).

**Change (b) — the page's Overview round-trip.** Two places currently express "Overview" as *the absence of a `?tab=` param*. With the default flipped, that encoding now means Wall chart, so both must write `tab=overview` explicitly or Overview becomes unreachable from the tab strip.

- `page.tsx:189-192` (inside the redirect `useEffect`): delete the `if (resolved.tab === "overview") { params.delete("tab"); params.delete("sub"); } else { … }` split and always `params.set("tab", resolved.tab)`, keeping the existing `sub` set/delete at `:194-198`.
- `page.tsx:208-214` (`handleTabChange`): replace the `if (next === "overview") { params.delete("tab"); params.delete("sub"); }` branch with an unconditional `params.set("tab", next); params.delete("sub");` (clearing `sub` so the cluster default applies, as the current comment at `:212` already says).

Also correct the stale comment at `page.tsx:177-178` ("unknown tab value → fall back to overview") to say it falls back to the campaign default. The expression at `:173-181` itself is unchanged.

**Resulting behaviour, exactly.**

| URL entered | Before | After |
|---|---|---|
| `/campaigns/12` (dashboard cards: `campaign-progress-card.tsx:85`, `campaign-activities-card.tsx:88`, `campaign-entities-card.tsx:77`, `CampaignsDashboard.tsx:162`; also `reports/campaign-progress/page.tsx:178`, `add-workers-client.tsx:334, 346, 364`, wizard exits `campaign-wizard.tsx:657, 1318`, planner exits `planner-wizard.tsx:211, 490, 505`, and every `/campaigns/[id]/**` breadcrumb) | Overview | `router.replace` → `?tab=workforce&sub=wall-chart`, **Wall chart** |
| `/campaigns/12?tab=overview` | Overview | **Overview, unchanged.** `resolveTabParams("overview", null)` → `{overview, null}`; `needsRedirect` is false; no replace fires |
| `/campaigns/12?tab=workforce&sub=wall-chart` (list rows `campaigns/page.tsx:424, 445`; `CampaignsMetricsTable.tsx:135`; `campaign-task-lists.tsx:217`) | Wall chart | Wall chart, byte-identical URL, **no new redirect** |
| `/campaigns/12?tab=universe` (legacy, `REDIRECT_MAP`) | → `workforce&sub=universe` | unchanged |
| `/campaigns/12?tab=nonsense` | Overview | Wall chart |
| Clicking the "Overview" tab trigger (`page.tsx:413`) | URL loses `?tab=` | URL becomes `?tab=overview` |

One consequence worth stating: `campaigns/[id]/plan/stage/[stageNumber]/page.tsx:538` renders a link labelled **"Back to campaign overview"** pointing at bare `/campaigns/[id]`. After this change that link lands on the wall chart, so the label is wrong. Fix the label to **"Back to campaign"** (label only; the href is left alone so the link obeys the new default like every other entry point). The three sibling links on the same page (`:250, 261, 298`) already read "Back to Campaign"/"Campaign" and need no change.

**Not changed:** no link target anywhere is rewritten. Bare `/campaigns/[id]` links stay bare and inherit the new default — that is what makes "list rows, dashboard cards and the header Back arrow agree".

**Existing tests:** none. `grep -rn "campaign-tabs" src` returns only `page.tsx:83` and the module itself; there is no `src/lib/__tests__` directory. New tests in §2.9.

---

### 2.2 Item 2 — The header Back arrow

**File:** `src/components/campaigns/campaign-detail-header-bar.tsx:238-246`.

**What "agree on that target" means concretely.** The Back arrow is the *exit*, not an entry: it returns to the campaign **list** (`router.push("/campaigns")`, `:242`), which is correct and stays exactly as it is. Appendix D 3.3 row 1. What must agree is that every *entry into* a campaign lands on the wall chart — and after §2.1 every entry does, because the list rows already force `?tab=workforce&sub=wall-chart` and every other entry point uses a bare `/campaigns/[id]` that now resolves to the same place. So: **no functional edit to the Back arrow.**

Two things do change here:

1. **`campaign-detail-header-bar.tsx:95`** — `handleToggleBuildList` does `params.delete("view")` when opening the build list. Under §2.7 an absent `?view=` means *device default*, which on a touch device is List, where the build-list panel is not mounted. Change to `params.set("view", "wall-chart")`. The two lines above it (`:93-94`) already force `tab=workforce&sub=wall-chart`; this makes the third coordinate explicit too.
2. **`campaign-wall-chart.tsx:232`** — the same `params.delete("view")` inside `setBuildListOpen`. Same change: `params.set("view", "wall-chart")`.

Optional, zero-behaviour: add `aria-label="Back to campaigns"` to the icon-only button at `:239-246` (it carries only `title`). Include it or drop it; it changes no rendering.

**Explicitly not done:** no new home page, no change of the Back target to a campaign-scoped destination, no breadcrumb work. That is WP1.3.

---

### 2.3 Item 3 — Tiles above the assessment-distribution charts

**File:** `src/components/campaigns/campaign-wall-chart.tsx`.

**Today.** Inside `CardContent` (`:1336-1340`, `className="space-y-4 print:space-y-2"`) the children are, in order:

- `:1341-1345` the 1px sticky sentinel (`summaryStickySentinelRef`);
- `:1346-1504` the sticky wrapper (`summaryStickyWrapperRef`, `sticky -top-6 z-20`) holding `WallChartSelectionBar` + `WallChartSummaryHeader`;
- `:1512` an `overflowAnchor: "none"` wrapper, which contains
  - `:1513-1520` **`<WallChartAssessmentCharts>`**,
  - `:1522-1536` the build-list flex area (`--build-list-area-height`), which contains
    - `:1537-1544` the units container (`unitsContainerRef`) … units … `:2303-2308` `RelationshipOverlay` … `:2309` close,
    - `:2310-2333` `BuildListPanel`,
  - `:2334` close build-list area, `:2335` close the anchor wrapper;
- `:2337-2345` the Print button.

So the charts card sits between the sticky header and the first unit card — an organiser scrolls past a chart before seeing a tile.

**Minimal reorder.** Move the eight-line `<WallChartAssessmentCharts … />` element from `:1513-1520` to sit immediately **after** `:2334` (the close of the build-list flex area) and **before** `:2335` (the close of the `overflowAnchor` wrapper). Nothing else moves; the element keeps its props verbatim, including `activeAssessmentId` derived from `campaignAssessmentDefault` (`:1515-1519`). Add a `mt-4` to the moved element's wrapper or leave it as a direct child of the anchor div — the anchor div has no `space-y`, so wrap the moved card in `<div className="mt-4">` to preserve the visual gap that `CardContent`'s `space-y-4` used to give it.

The component is a self-contained `<Card>` (`WallChartAssessmentCharts.tsx:107`) with its own collapse control (`expanded` state, `:90`, chevron `:117-131`), which starts collapsed — so below-the-fold placement costs nothing and no new collapsible wrapper is needed.

**Effect on the sticky-offset code (`:255-300`).** None, and this is the load-bearing check:

- The `IntersectionObserver` at `:262-271` observes the sentinel at `:1341-1345`, which is *above* the sticky wrapper. The charts were always *below* both. Moving them cannot change when `isSummaryStuck` flips.
- The `ResizeObserver` at `:277-289` measures `summaryStickyWrapperRef` (`:1346`) only. The charts are not inside it.
- `buildListStickyTopPx` (`:296-300`) is derived from `summaryStickyHeight` and `isSummaryStuck` alone. Unchanged.

Two real consequences to keep in mind:

- The comment at `:1506-1511` justifies `overflowAnchor: "none"` by naming "the top of the assessment distribution section" as the element the browser used to pick as a scroll anchor. After the move the anchor candidate is the units container instead. **Keep `overflowAnchor: "none"` on both the wrapper (`:1512`) and the build-list area (`:1531`/`:1534`)** — it is still needed, now for the units — and update the comment's wording so it no longer names a section that has moved.
- In build-list mode the flex area is `calc(100dvh - …)` tall (`:1532`), so the charts card lands below a viewport-height region. That is the intended ordering (tiles first) and matches the non-build-list case; note it in the PR description.

Print output (`:2337-2345`, `print:` variants) reorders with the DOM — charts print after the units. Acceptable and arguably better; flag it in the screenshot evidence.

**Also in this file — the "up to 40 displayed" copy** (appendix A 8, "Inconsistencies / likely bugs"). `:1327-1329` reads "Campaign-level unmapped slots are unnamed gaps from the worker estimate (up to 40 displayed)". The real cap is `PLACEHOLDER_CAP = 24` (`wall-chart/campaign-unit-card.tsx:92`, applied `:275`, overflow line `:282-286`), and the Unassigned card renders no placeholder tiles at all (`campaign-unit-card.tsx:74-78, 239`). Replace with:

> Campaign-level unmapped slots are unnamed gaps from the worker estimate (up to 24 cells shown per unit, then a "+N more" note); unassigned are named members not placed in an organising unit yet.

Copy only; no constant is touched.

---

### 2.4 Item 4 — "Scope" → "Who's in", Named universes card hidden

**File:** `src/app/(dashboard)/campaigns/[id]/page.tsx`; plus two copy sites.

**Labels only — no identifier moves.** The sub-tab value stays `universe` (`page.tsx:616`), `DEFAULT_SUB`/`REDIRECT_MAP` keep their `universe` entries (`campaign-tabs.ts:88`), and `?tab=workforce&sub=universe` keeps resolving. Bookmarks and the two in-app links to it (`campaign-employers-worksites-card.tsx:94`, `reports/campaign-facts/page.tsx:165` points at `sub=data-fields`, unaffected) keep working.

| path:line | Today | After |
|---|---|---|
| `page.tsx:616` | `<TabsTrigger value="universe">Scope</TabsTrigger>` | `<TabsTrigger value="universe">Who&apos;s in</TabsTrigger>` (value unchanged) |
| `campaign-universe-section.tsx:377-380` | "Campaign scope: the employers and worksites this campaign covers. These rarely change. Workers, organising units, and ratings now live on the Wall Chart / List and Campaign Units sub-tabs." | "Who's in: the employers and worksites this campaign covers. These rarely change. Workers, units and ratings live on the Wall Chart / List and Campaign Units sub-tabs." |
| `campaign-employers-worksites-card.tsx:88-91` (CardDescription) | "Scope of this campaign. Click a chip for full details, or manage scope to add or remove." | "Who's in this campaign. Click a chip for full details, or edit to add or remove." |
| `campaign-employers-worksites-card.tsx:96` (button label) | "Manage scope" | "Edit who's in" |

Leave alone: the 4-value `campaign_scope` enum and its wizard label "Campaign scope" (`campaign-wizard.tsx:1707`) — that is a different field and renaming it belongs to WP3.1; `campaign-universe-section.tsx:348, 552` (error/confirm strings containing "scope" in a non-heading sense) — optional tidy, not required.

**Hiding the Named universes card.** The card is `page.tsx:626-726`, inside `<TabsContent value="universe">` (`:623-727`). It is vestigial (appendix B 3.2: "rules are displayed but there is no UI to add rules"), but the underlying data is *not* dead — `universes` is passed to `CampaignActionsSection` at `page.tsx:556` and drives the "Universe" select on actions.

Gate, do not delete:

```ts
// Named universes are a vestigial labelling feature (no rule editor exists).
// Hidden from the Who's in tab pending the module work; existing rows still
// drive the Universe select on the Actions tab (page.tsx:556). Flip to true
// to restore the card.
const SHOW_NAMED_UNIVERSES: boolean = false;
```

Place it at module scope near `INITIAL_UNIVERSE_FORM` (`page.tsx:245-246` region). Wrap the card as `{SHOW_NAMED_UNIVERSES && ( <Card> … </Card> )}` around `:626-726`.

Why an explicit `: boolean` annotation: it stops TypeScript narrowing the constant to the literal `false`, which keeps the JSX branch type-checked and keeps every identifier inside it *referenced* — so `universeDialogOpen`/`setUniverseDialogOpen` (`:245`), `universeForm`/`setUniverseForm` (`:246`), `createUniverseMutation` (`:335-346`), `rulesByUniverse` (`:397`) and `RULE_TYPE_LABELS` (`:402`) do not become unused and `pnpm lint` stays green. Nothing is deleted, so the card returns behind a module flag in a later package.

The `campaign_universes` / `campaign_universe_rules` queries (`:272-298`) stay untouched.

---

### 2.5 Item 5 — "Unallocated" / "No unit" / "No group" → "Unassigned"

Labels only. **No derivation changes** — the three separate "unassigned" computations (`campaign-wall-chart.tsx:784-795`; `campaign-units-section.tsx:429-438`; `workforce-list-view.tsx:599-637`) are untouched; unifying them is phase 2 (WP2.4/WP2.5).

Grep used to confirm the appendix's list is complete:
`grep -rn "Unallocated\|No unit\|No Unit\|No group\|unallocated\|__unallocate__" src`

**Sites to change** (every one is a user-visible string):

| path:line | Today | After |
|---|---|---|
| `src/components/campaigns/step-campaign-units.tsx:1089-1090` | "· Unallocated remainder: **N**" | "· Unassigned remainder: **N**" |
| `src/components/campaigns/step-campaign-units.tsx:1166` | `<p …>Unallocated</p>` (synthetic row) | "Unassigned" |
| `src/components/campaigns/step-allocate-workers.tsx:439` | "…land in the &quot;Unallocated&quot; bucket." | "…land in the &quot;Unassigned&quot; bucket." |
| `src/components/campaigns/step-allocate-workers.tsx:517` | `<SelectItem value="__unallocated__">Unallocated (on campaign)</SelectItem>` | label → "Unassigned (on campaign)"; **`value` unchanged** |
| `src/components/campaigns/step-allocate-workers.tsx:568` | `<SelectItem value="__unallocated__">Unallocated (clear units)</SelectItem>` | label → "Unassigned (clear units)"; **`value` unchanged** |
| `src/components/campaigns/step-allocate-workers.tsx:806` | "Unallocated: {allocationCounts.unallocated}" | "Unassigned: {allocationCounts.unallocated}" (variable name unchanged) |
| `src/components/campaigns/campaign-units-section.tsx:1777` | "Unallocated" (pseudo-unit heading) | "Unassigned" |
| `src/components/campaigns/campaign-units-section.tsx:1779` | "{n} worker(s) not in any unit" | unchanged — already correct, and per Decision 4's note it must read as normal, not as an error |
| `src/components/campaigns/campaign-units-section.tsx:1830` | `aria-label="Select all unallocated workers"` | `aria-label="Select all unassigned workers"` |
| `src/components/campaigns/add-workers-client.tsx:293` | `return "no unit (unallocated)";` (rendered in the confirm summary) | `return "unassigned (no unit)";` |
| `src/components/import/worker-import-wizard.tsx:3284` | `{resolution.ouName ?? "No Unit"}` | `?? "Unassigned"` |
| `src/components/import/worker-import-wizard.tsx:3443` | button text "No Unit" | "Unassigned" |
| `src/components/campaigns/campaign-worker-assignment-picker.tsx:417` | checkbox label "Unallocated elsewhere" | "Unassigned elsewhere" |
| `src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:969` | `excludedWorkerLabel="Showing workers unallocated in this new group"` | "Showing workers unassigned in this new group" |
| `src/app/(dashboard)/campaigns/[id]/plan/stage/[stageNumber]/page.tsx:538` | "Back to campaign overview" | "Back to campaign" (see §2.1) |

**The list view's different bucket** (appendix A 2.6, appendix B 4.5 note "a *different* definition"):

| path:line | Today | After |
|---|---|---|
| `src/components/campaigns/workforce/workforce-list-view.tsx:617` | `label: containerOu ? ouDisplayName(containerOu) : "Unassigned / No group"` | `: "Not in any group"` |

This bucket keys on the *container* (`ou_group_id`), not on unit membership — a worker in a standalone unit falls into it. Plan 3.6 gives exactly two words for the two senses: **Unassigned** (no unit) and **Not in any group** (campaign-wide/no group). Using "Not in any group" here is the only way to stop the two buckets colliding under one label once phase 2 introduces a real per-group Unassigned. Also update the code comment at `:600` ("or '—' for ungrouped/unassigned") to say "not in any group". The internal map key `__unassigned__` (`:604, 617, 635-636`) is unchanged.

**Deliberately not changed (false positives from the grep):**

- `src/components/import/membership-import-wizard.tsx:1557` "No group" — this is the *occupation group* picker (`occupationGroups`, `newGroupId`), a different "group". Out of scope.
- `src/components/campaigns/activists/wocs-panel.tsx:214, 217` "No group scope" — WOC scope selector; "group" here is the WP2.1 sense and belongs to that package's terminology sweep.
- `src/components/campaigns/step-campaign-units.tsx:1579` `<SelectItem value="__unallocate__">Remove from group</SelectItem>` — "Remove from group" is *correct* under plan 3.6 (Group is the real concept) and the action genuinely removes the worker from the group's units. Left as is.
- `src/components/campaigns/wall-chart/add-campaign-worker-dialog.tsx:453, 456, 669, 672, 683` — already say "Unassigned". No change.
- `src/components/campaigns/campaign-wall-chart.tsx:1594` "Unassigned workers" card title — already correct.
- Internal identifiers everywhere: `__unallocated__`, `__unallocate__`, `unitMode: "unallocated"` (`add-workers-client.tsx:102-112`; validated by `api/campaigns/[id]/add-workers/route.ts:24` `z.literal("unallocated")`), `unallocatedMembers`, `unallocatedSelection`, `isFromUnallocated`, `showUnallocatedElsewhereFilter`, `unallocatedRemainder`. **None of these change** — renaming the `add-workers` literal would be an API contract change.
- The `"—"` placeholders in the list view's Group/Unit columns (`workforce-list-view.tsx:326-327`). Turning an em-dash into a word is a table-density change, not a copy fix; leave for WP2.5.

---

### 2.6 Item 6 — "Continue to workers" → the correct next-step label

**File:** `src/components/campaigns/step-employers-worksites.tsx:970`.

`{isPending ? "Saving…" : (continueLabel ?? "Continue to workers")}`. Step 2 is **Employers & worksites** and step 3 is **Agreements** (`campaign-wizard.tsx:1421-1423`; the wizard renders `StepEmployersWorksites` at `:1798-1813` with `onContinue={() => saveScopeMutation.mutate()}` → step 3).

**Prop check before changing the default.** `continueLabel` is optional (`step-employers-worksites.tsx:54`, destructured `:313`). It has exactly one caller that supplies it: `campaign-settings.tsx:1027` passes `continueLabel="Save employers & worksites"`. The wizard (`campaign-wizard.tsx:1798-1813`) passes nothing, so the default is used only in the wizard. Changing the default therefore affects the wizard alone and cannot alter the settings accordion.

**Change:** default becomes `"Continue to agreements"`.

The five sibling steps that take the same prop (`step-worker-estimate.tsx:313`, `step-campaign-units.tsx:1215`, `step-campaign-ambitions.tsx:563` default `"Continue"`; `step-allocate-workers.tsx:825` default `"Next step"`) are **not** touched — renaming those is not in the work package.

---

### 2.7 Item 7 — List layout is the default on touch devices

**New file:** `src/lib/campaign/workforce-view.ts`.
**Edited:** `src/components/campaigns/workforce/workforce-board.tsx`.

**The device flag, exactly.** `src/contexts/device-context.tsx:5-7` defines `type DeviceContextType = { isMobile: boolean }`; `useDevice()` (`:26`) returns `{ isMobile }`. The value is server-derived, not a media query: `src/proxy.ts:8-11` regex-tests the UA (`/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i` — note **iPad is included**, appendix D 8), sets `x-viewport`, which `src/app/layout.tsx:36-37` reads and hands to `Providers` → `DeviceProvider` (`src/components/providers.tsx:33, 475`). Because it comes from the request header it is identical on server and client, so consuming it during render causes no hydration mismatch. It is the only flag available; `isMobile` is the exact name.

**New pure helper** (`src/lib/campaign/workforce-view.ts`, alongside the existing `src/lib/campaign/campaign-detail-routes.ts` pattern):

```ts
export type WorkforceView = "wall-chart" | "list";

/** Layout to use when the URL states no preference. Touch devices cannot drive
 *  the wall chart's HTML5 drag-and-drop (appendix D 8), so they get the list. */
export function pickDefaultWorkforceView(isTouch: boolean): WorkforceView {
  return isTouch ? "list" : "wall-chart";
}

/** Explicit ?view= wins; anything else falls back to the device default. */
export function resolveWorkforceView(
  viewParam: string | null,
  isTouch: boolean
): WorkforceView {
  if (viewParam === "list") return "list";
  if (viewParam === "wall-chart") return "wall-chart";
  return pickDefaultWorkforceView(isTouch);
}
```

**`workforce-board.tsx` edits:**

- `:15` — delete the local `export type WorkforceView`; re-export from the helper (`export type { WorkforceView } from "@/lib/campaign/workforce-view";`) so `:118-119` keep compiling. `grep -rn "WorkforceView\b" src` shows the type is used only inside this file, so a plain import also works; re-exporting is the smaller diff.
- `:17-21` — delete `DEFAULT_VIEW` and `parseView`.
- `:33` — `const { isMobile } = useDevice();` (import from `@/contexts/device-context`) and `const view = useMemo(() => resolveWorkforceView(searchParams.get("view"), isMobile), [searchParams, isMobile]);`
- `:36-46` (`setView`) — **always write the param**: replace the `if (next === DEFAULT_VIEW) params.delete("view") else params.set(…)` split with an unconditional `params.set("view", next)`. This is what makes an explicit `?view=wall-chart` survive on a touch device: without it, a phone user tapping "Wall chart" would have the param deleted and be bounced straight back to List.

**No `localStorage`, no state, no effect.** The default is a pure function of `(searchParams, isMobile)` evaluated during render; nothing is persisted, which satisfies the "do not keep view state in localStorage" rule.

**Consequences to keep straight:**

- `?view=wall-chart` on a phone → wall chart. Honoured.
- `?view=list` on a desktop → list. Honoured (unchanged today).
- No `?view=` on a desktop → wall chart (unchanged today).
- No `?view=` on a phone/iPad → **list** (the change).
- Build list: covered by §2.2 — both `params.delete("view")` sites become `params.set("view", "wall-chart")` (`campaign-detail-header-bar.tsx:95`, `campaign-wall-chart.tsx:232`), so opening the build list from a phone forces the wall chart rather than silently landing in the list where the panel is not mounted.
- Known quirk, left alone: `src/components/campaigns/activists/activists-wocs-section.tsx:40, 49` reuses `?view=` for its own Register/Tasking/WOCs/Structure tabs. Switching sub-tabs preserves the param, so `?sub=wall-chart&view=register` can occur. `resolveWorkforceView` treats an unrecognised value as "no preference" → device default, which is the same outcome as today's `parseView` on desktop. Namespacing that param is out of scope.

---

### 2.8 Item 8 — The worker sheet's six tabs fit their grid

**File:** `src/components/campaigns/wall-chart/worker-detail-sheet.tsx:145-152`.

`<TabsList className="grid grid-cols-5 w-full">` wraps six triggers: Details (`:146`), Activity (`:147`), Data fields (`:148`), Units (`:149`), Relationships (`:150`), Development (`:151`). The sixth wraps to a second implicit row inside a fixed-height `TabsList`, clipping it.

**Fix:** `grid-cols-5` → `grid-cols-6`, and add `h-auto` plus `text-xs` so six labels fit without truncation in the sheet's width:

```tsx
<TabsList className="grid grid-cols-6 w-full h-auto text-xs">
```

The `h-auto` guards the case where a label wraps to two lines at narrow sheet widths (the shadcn `TabsList` default is a fixed `h-9`/`h-10`); it is the same escape hatch the campaign page already uses on its top-level list (`page.tsx:412`, `className="flex flex-wrap h-auto gap-1"`). Verify against the widest label, "Relationships". If it still crowds at the sheet's narrowest breakpoint, the fallback is `grid-cols-3 sm:grid-cols-6 h-auto` — two tidy rows on small screens, one row otherwise. Pick whichever the screenshot supports; both are class-only.

---

### 2.9 Tests

**Environment (checked).** `vitest.config.ts:17-22` — `environment: "node"`, `include: ["src/**/__tests__/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"]`, `globals: false` (so every test imports `describe/it/expect` from `vitest`), `passWithNoTests: false`; `@` aliased to `src` (`:11-13`). `package.json:10` — `"test": "vitest run"`. `grep -n "testing-library" package.json` → **no match**; `jsdom` is not a dependency. **There are no React component tests in this app and this package must not introduce the first one** — that would mean adding `jsdom` + `@testing-library/react` and switching the vitest environment, which is scope this package does not own. Pure logic only; the rendering items are proven by screenshot.

No Playwright either (`tests/e2e/mobile-dialer.spec.ts` exists but no playwright dependency); e2e belongs to WP0.2.

**New file: `src/lib/__tests__/campaign-tabs.test.ts`** (create the directory; pattern copied from `src/lib/campaign/__tests__/campaign-detail-routes.test.ts:1-6`).

| # | Case | Assertion |
|---|---|---|
| 1 | no tab, no sub | `resolveTabParams(null, null)` → `{ tab: "workforce", sub: "wall-chart" }` |
| 2 | the default is the wall chart, stated as constants | `DEFAULT_CAMPAIGN_TAB === "workforce"` and `DEFAULT_CAMPAIGN_SUB === "wall-chart"` |
| 3 | the two default sources cannot drift | `DEFAULT_SUB[DEFAULT_CAMPAIGN_TAB] === DEFAULT_CAMPAIGN_SUB` |
| 4 | **Overview still opens on request** | `resolveTabParams("overview", null)` → `{ tab: "overview", sub: null }` |
| 5 | …and does not bounce | `needsRedirect("overview", null, resolveTabParams("overview", null)) === false` |
| 6 | the bare URL does bounce, once | `needsRedirect(null, null, resolveTabParams(null, null)) === true` |
| 7 | the bounce is idempotent (no loop) | feeding the resolved pair back in yields `needsRedirect("workforce", "wall-chart", …) === false` |
| 8 | an explicit sub survives the default | `resolveTabParams(null, "assessments")` → `{ tab: "workforce", sub: "assessments" }` |
| 9 | list-row URL is a no-op | `resolveTabParams("workforce", "wall-chart")` → same pair, `needsRedirect` false |
| 10 | legacy redirects unchanged | `resolveTabParams("wall", null)` → `{ workforce, wall-chart }`; `resolveTabParams("universe", null)` → `{ workforce, universe }`; `resolveTabParams("workplan", null)` → `{ plan, workplan }` |
| 11 | legacy tab + explicit sub still honours the sub | `resolveTabParams("universe", "assessments")` → `{ workforce, assessments }` (regression guard on `:120-124`) |
| 12 | non-cluster tabs get no sub | `resolveTabParams("bargaining", null)` → `{ tab: "bargaining", sub: null }` |
| 13 | every `REDIRECT_MAP` target is a `VALID_TABS` member | loop assertion (cheap registry guard) |

Case 4/5 is the acceptance test for "`?tab=overview` must still open Overview"; case 6/7 is the acceptance test for "bare `/campaigns/[id]` opens the wall chart without looping".

**New file: `src/lib/campaign/__tests__/workforce-view.test.ts`.**

| # | Case | Assertion |
|---|---|---|
| 1 | desktop default | `pickDefaultWorkforceView(false) === "wall-chart"` |
| 2 | touch default | `pickDefaultWorkforceView(true) === "list"` |
| 3 | explicit list on desktop | `resolveWorkforceView("list", false) === "list"` |
| 4 | **explicit wall chart on touch is honoured** | `resolveWorkforceView("wall-chart", true) === "wall-chart"` |
| 5 | absent param follows the device | `resolveWorkforceView(null, true) === "list"`; `resolveWorkforceView(null, false) === "wall-chart"` |
| 6 | unknown value (the `?view=register` collision) falls back to the device default | `resolveWorkforceView("register", true) === "list"`; `resolveWorkforceView("register", false) === "wall-chart"` |
| 7 | empty string is not a preference | `resolveWorkforceView("", false) === "wall-chart"` |

**Updated file: none.** `src/lib/campaign/__tests__/campaign-detail-routes.test.ts` is unaffected (no route helper changes). Confirm with a full `pnpm test` that no existing suite asserted the old Overview default — `grep -rn "resolveTabParams\|DEFAULT_SUB" src` returns only `campaign-tabs.ts` and `page.tsx`, so none does.

---

### 2.10 Guides manifest

`public/help-videos/manifest.json` — 19 clips, six series. Every clip's `associatedRoutes` is a **path-only glob** (`/campaigns`, `/campaigns/*`, `/campaigns/*/settings`, `/campaigns/*/phone/lists/*`, `/employers`, …). No entry contains a query string, a `?tab=`, a `?sub=`, a `?view=`, the word "Scope", "Unallocated" or "No unit". The sole consumer is `src/app/(dashboard)/help/page.tsx`, which matches on pathname globs.

**Required manifest updates for WP0.3: none.** State this explicitly in the PR so the ledger records that the check was done.

Re-record candidates to log against Decision 9 (human work, other packages — **not** this PR):

- **C1 "The wall chart, explained"** and **C2 "Filter, sort & switch views"** — both open a campaign; the recordings show Overview first and the charts above the tiles. C2's summary also says "toggle list view", which is now the phone default. Already on the Decision 9 list for phase 2 (B1–B3, C1–C3).
- **B3 "Allocate workers to units"** — its narration is the most likely place the word "Unallocated" is spoken. Already on the Decision 9 phase-2 list.
- **A5 "Configure a campaign from Settings"** — unaffected; the settings accordion keeps `continueLabel="Save employers & worksites"` (§2.6).
- Transcripts (`*.transcript.txt`) are not in the repo (`storage: "help-videos"`, remote bucket) so no text file in this repo needs editing.

---

### 2.11 Commands that prove each acceptance criterion

Run from `apps/organising-db`.

| Item | Proof |
|---|---|
| 1 default tab | `pnpm test -- campaign-tabs` (cases 1–13, §2.9). Screenshot: `/campaigns/<id>` with a bare URL lands on Wall Chart; `/campaigns/<id>?tab=overview` lands on Overview and the URL does not change |
| 2 Back arrow / entry agreement | Screenshot: campaigns list row → wall chart; dashboard "Campaign progress" card → wall chart; Back arrow → `/campaigns`. Plus: header **Build ▾ → Build list** on a phone UA opens the wall chart with the panel (proves §2.2's two `params.set("view","wall-chart")` edits) |
| 3 tiles above charts | Screenshot of Workforce › Wall Chart: first unit card visible without scrolling past the "Assessment distribution" card; second screenshot scrolled to the bottom showing the charts card below the units. Third: `?buildList=1` open, panel still sticky and correctly offset (proves the sticky-offset code is untouched) |
| 4 Who's in / Named universes | Screenshot of the Workforce sub-tab strip showing "Who's in"; screenshot of `?tab=workforce&sub=universe` showing the section with no Named universes card; screenshot of Plan & Execution › Actions showing the Universe select still populated |
| 5 Unassigned | `grep -rn "Unallocated\|No Unit\|Unassigned / No group" src` returns only the internal identifiers listed as "deliberately not changed" in §2.5. Screenshots: Campaign Units pseudo-unit heading; wizard step 5 remainder line; wizard step 6 filter + footer; import wizard resolution badge; list view grouped bucket reading "Not in any group" |
| 6 Continue to agreements | `grep -n "Continue to" src/components/campaigns/step-employers-worksites.tsx`. Screenshot: wizard step 2 button reads "Continue to agreements"; campaign Settings › Employers & worksites still reads "Save employers & worksites" |
| 7 touch default | `pnpm test -- workforce-view` (cases 1–7). Screenshot: same campaign URL loaded with a desktop UA (wall chart) and with an iPhone/iPad UA (list); then tap "Wall chart" on the phone and confirm the URL gains `?view=wall-chart` and stays on the chart across a reload |
| 8 worker sheet tabs | Screenshot: open a worker tile → sheet shows all six tabs on one row, none clipped; repeat at the narrowest sheet width |
| all | `pnpm lint` · `pnpm test` · `pnpm build` all green |

Suggested single command for the gate: `pnpm lint && pnpm test && pnpm build`.

### 2.12 Risks and the rules they could break

| Risk | Rule it could break | Mitigation |
|---|---|---|
| Flipping the default without §2.1(b) makes the Overview tab unreachable — clicking it deletes `?tab=` and the resolver immediately sends the user back to the wall chart | "Nothing is removed from the product" | Both Overview-as-absent-param encodings are converted to explicit `tab=overview`; test cases 4–7 lock it |
| A redirect loop on the bare URL | breaks the app | `needsRedirect` is false once the pair is written; test case 7 asserts idempotence |
| Bare-URL entry now costs one extra `router.replace` on mount for every campaign | perf noise only | Same mechanism the legacy redirect already uses; `{ scroll: false }`; `replace` not `push`, so the back button is unaffected |
| Moving the charts breaks the sticky build-list offset | "no behaviour change beyond the listed items" | The sentinel (`:1341`) and the measured wrapper (`:1346`) both stay above the moved element; `buildListStickyTopPx` (`:296-300`) reads neither. Verified by the `?buildList=1` screenshot |
| Removing `overflowAnchor: "none"` while "tidying" the moved block reintroduces scroll jumping | regression | Explicitly keep it on `:1512` and `:1531`/`:1534`; only the comment wording changes |
| Deleting the Named universes card instead of gating it orphans the Actions "Universe" select and breaks lint on five now-unused identifiers | "Nothing is removed; it is relocated" | Gate with `SHOW_NAMED_UNIVERSES: boolean = false`; the query at `page.tsx:272-298` and the prop at `:556` are untouched |
| Renaming `__unallocated__` / `unitMode: "unallocated"` alongside the labels | API contract (`add-workers/route.ts:24` `z.literal("unallocated")`) | §2.5 lists every identifier as explicitly out of bounds; the grep in §2.11 catches accidental renames |
| Touch default implemented with `useEffect` + `localStorage`, or by rewriting the URL on mount | "Do not keep view state in localStorage"; also would fight the browser back button | Pure function of `(searchParams, isMobile)` at render; no effect, no write |
| `setView` keeping its `params.delete("view")` branch traps phone users in the list | the feature would be a lock-in, not a default | `setView` always sets the param; test case 4 covers the honoured override |
| `?view=` collides with the Activists sub-tab's own `?view=` | pre-existing | Unknown values fall back to the device default (test case 6); namespacing is out of scope |
| Sweeping "scope" → "Who's in" into the `campaign_scope` enum labels | scope creep into WP3.1 | §2.4 names the four strings that change and excludes the enum |
| `grid-cols-6` crowding "Relationships" at narrow widths | visual regression | `h-auto` plus the documented `grid-cols-3 sm:grid-cols-6` fallback; decided by screenshot |

---

## 3. Out of scope

Considered and deliberately excluded:

1. **Any change to how "unassigned" is derived.** The three parallel computations (`campaign-wall-chart.tsx:784-795`, `campaign-units-section.tsx:429-438`, `workforce-list-view.tsx:599-637`) stay as they are, including the fact that the list view's bucket means something different. WP2.4/WP2.5.
2. **Materialising Unassigned as a unit row.** Forbidden by Decision 4 and by the migration comment quoted in appendix A 9(b).
3. **A campaign-scoped home page, breadcrumbs, or re-pointing the Back arrow.** WP1.3.
4. **Reducing the campaign page's 8 tabs / 20 sub-tabs / 12 header actions.** WP1.x.
5. **Renaming the `campaign_scope` enum, its labels, or the "Sector-wide" duplication** (`constants.ts:45-50`, `campaign-wizard.tsx:1707, 1734-1753`). WP3.1.
6. **Deleting `campaign_universes` / `campaign_universe_rules`** or their queries. The card is gated; the tables and the Actions select stay.
7. **A per-group Unassigned bucket, or a group selector on the wall chart.** WP2.x (appendix A 9).
8. **Renaming the other four wizard `continueLabel` defaults** ("Continue" ×3, "Next step").
9. **Touch drag-and-drop for the wall chart** (a `@dnd-kit` port or a touch polyfill). Choosing List on touch is the mitigation this package delivers; the underlying gap stays open for phase 2/3.
10. **Namespacing the `?view=` param** so the Workforce board and the Activists section stop sharing it.
11. **Component tests.** Would require adding `jsdom` + `@testing-library/react` and changing `vitest.config.ts:18` from `node`. Not this package's call.
12. **e2e coverage of the new landing target.** WP0.2 owns Playwright; there is no Playwright dependency today.
13. **Re-recording guide clips.** Decision 9 makes that human work logged in the ledger; §2.10 lists the candidates without touching them.
14. **Turning the list view's `"—"` column placeholders into words**, and **`wocs-panel.tsx`'s "No group scope"** / **`membership-import-wizard.tsx`'s occupation-group "No group"** — different concepts, WP2.1's terminology sweep.
15. **Making the charts card collapsible-by-default or moving it to a sub-tab.** It already collapses itself (`WallChartAssessmentCharts.tsx:90, 117-131`); reordering is the minimal change the WP asks for.
16. **Fixing anything else in appendix A 8's bug list** (grandchild `assessmentLabel="Cumulative"` at `WC:2245`, the `role_name === "Activist"` casing at `lib/campaign/constants.ts:144`, `merge-units-dialog.tsx:49-52`'s double-counting, cross-type drag silently no-op at `WC:1263-1266`). Only the two copy/markup items the WP names are fixed.

---

## 4. Open questions

Two, both with a stated default so implementation is not blocked.

1. **The list view's grouped bucket: "Unassigned" or "Not in any group"?** The work-package sentence says "Unallocated" and "No unit" become "Unassigned", and it points at `workforce-list-view.tsx:617` ("Unassigned / No group"). But that bucket keys on the *group container*, not on unit membership — it is the campaign-wide sense — and plan 3.6 reserves a distinct phrase for it: "**Not in any group**". **Assumption: use "Not in any group"** (§2.5), because using "Unassigned" for both senses would have to be undone in WP2.4 when a real per-group Unassigned appears. Say so if you want the literal "Unassigned" instead; it is a one-string change either way.

2. **Should the wall chart's "up to 40 displayed" copy be fixed in this PR?** The WP's list of items does not name it, but the appendix pointer for item 8 sends the implementer to it and it is factually wrong (the cap is 24 and the Unassigned card renders none). **Assumption: fix it** (§2.3) — it is one string, in the same file as the layout change, and it is copy, not behaviour. Drop it if you want the PR to match the WP sentence exactly.

Not questions, but flagged for the reviewer so nothing arrives as a surprise:

- Finishing the creation wizard now lands the user on the **wall chart**, not Overview (appendix B 2.1's "Where the user lands" line becomes stale). That is the intended effect of "campaign pages open on the wall chart", not a side effect.
- `plan/stage/[stageNumber]/page.tsx:538`'s "Back to campaign overview" label is corrected to "Back to campaign" because its bare href now resolves to the wall chart.
- `?tab=overview` appears in the URL bar whenever Overview is selected, where today Overview is the param-free state.

## 5. Orchestrator approval

**Approved 2026-09-08.** Answers to section 4: (1) use **"Not in any group"** for the list view's container bucket at `workforce-list-view.tsx:617`, as planned; (2) **fix the "up to 40 displayed" copy** in this package, since appendix A 8 is the pointer the work package names for the sheet item and the string is in the file already being edited. Corrections: the package ships on its own branch `feat/oux-wp0.3-defaults-copy-layout` (not the WP0.1 branch), stacked on WP0.1 until PR #22 merges, PR base `develop`. Include the `aria-label` on the Back arrow (zero-behaviour, accessibility rule). For item 8 pick whichever grid class the screenshot supports and record which. Everything else stands.

## 6. Deviations from plan

1. **§2.8 — the sheet grid class.** The plan offered `grid-cols-6 w-full h-auto text-xs`
   with `grid-cols-3 sm:grid-cols-6 h-auto` as the documented fallback, to be settled by
   screenshot. Neither six-column form is supported by the layout, so the shipped class is
   **`grid grid-cols-3 w-full h-auto`** — the fallback with its `sm:grid-cols-6`
   half dropped. Measurement is in the implementer notes below. The `sm:grid-cols-6` half
   would have re-introduced the overflow at every width the sheet can actually reach,
   because `SheetContent` is capped at `sm:max-w-xl`. (The `text-xs` the plan suggested was
   shipped in the first round and removed in fix round 1: it is dead, because `TabsTrigger`
   in `src/components/ui/tabs.tsx` sets `text-sm` on every trigger and that class wins over
   one inherited from the list.)

2. **§2.4 — the `SHOW_NAMED_UNIVERSES` comment.** The plan's comment text cites
   `page.tsx:556` for the surviving `universes` prop. The shipped comment names
   `CampaignActionsSection` instead of the line number, so it does not rot as the file
   moves. Same meaning; the flag, its `: boolean` annotation and its placement are as
   planned.

3. **§2.3 / §2.5 — comment wording.** Two code comments the plan asked to "update" were
   reworded rather than transcribed verbatim (the `overflowAnchor` justification in
   `campaign-wall-chart.tsx`, and the grouped-bucket comment in `workforce-list-view.tsx`).
   Both say what the plan specified; no plan sentence prescribed the exact text.

Nothing else departed. In particular: no URL identifier, select value, `unitMode` literal or
`unallocated*` variable was renamed; `overflowAnchor: "none"` is still on both the wrapper and
the build-list area; no `localStorage`; no dependency added; no component test added; no
database touched; `public/help-videos/manifest.json` needed no edit (§2.10) and was not
changed — confirmed by
`grep -ciE "tab=|sub=|view=|Scope|Unallocated|No Unit" public/help-videos/manifest.json` → `0`.

### Implementer notes

**Sheet grid class chosen: `grid grid-cols-3 w-full h-auto`** (two rows of three).

`TabsTrigger` is `whitespace-nowrap px-3 text-sm` (`src/components/ui/tabs.tsx`), so a label
cannot shrink or wrap — it overflows its cell — and it always renders at `text-sm`
regardless of any text size set on the `TabsList` (a class on the trigger beats one inherited
from its parent). The sheet is `w-full sm:max-w-xl` with `p-6`
(`campaign-worker-detail-provider.tsx`), so its content is at most ~528px. Label widths in
Geist at the `text-sm` the triggers actually render at, in px — text width, then width needed
including the trigger's 24px horizontal padding. (The first-round table recorded these at
`text-xs`; the real figures are ~17% wider, which strengthens rather than changes the
conclusion.)

| Label | Text (text-sm) | Needed |
|---|---|---|
| Details | 47 | 71 |
| Activity | 50 | 74 |
| Data fields | 71 | 95 |
| Units | 35 | 59 |
| Relationships | 90 | **114** |
| Development | 88 | **112** |

Available per cell: **87px at six columns** (528px sheet) — "Relationships" and "Development"
both overflow, and at `text-sm` so do "Data fields" (95px) and, at a 375px phone sheet, most
of the rest. **173px at three columns**, and 106px at three columns in a 375px-wide phone
sheet, so every label fits at both widths. The `grid-cols-3` conclusion therefore still
holds — with more margin than the first-round measurement showed. `h-auto` releases
`TabsList`'s fixed `h-9` so the second row is not clipped, which is the original bug.

**`?view=wall-chart` persists after the build list is closed.** `setBuildListOpen`
(`campaign-wall-chart.tsx` ~236) sets `view=wall-chart` when the panel opens (§2.2) and only
deletes `buildList` when it closes, so the `view` param survives. This is deliberate: by the
time an organiser has opened the build list they have expressed a wall-chart preference, and
silently dropping the param would bounce a touch user back to the list on the next
navigation. Clearing it would also make the close action differ from every other way the
param is set, which never self-clears.

**Test gap.** The Overview round-trip (`page.tsx`'s explicit `tab=overview` encodings in the
redirect effect and `handleTabChange`) and the `setView` param persistence in
`workforce-board.tsx` are component behaviour, not covered by vitest — this app has no
component-test environment (§2.9) and adding one is out of scope (§3 item 11). Handed to
WP0.2 as an e2e assertion.

**Final `grep -rn "Unallocated\|No Unit\|Unassigned / No group" src`** (32 lines, all internal
identifiers or code comments — no user-visible string remains):

```
    src/components/campaigns/campaign-worker-assignment-picker.tsx:121:  showUnallocatedElsewhereFilter = false,
    src/components/campaigns/campaign-worker-assignment-picker.tsx:140:  showUnallocatedElsewhereFilter?: boolean;
    src/components/campaigns/campaign-worker-assignment-picker.tsx:151:  const [showOnlyUnallocatedElsewhere, setShowOnlyUnallocatedElsewhere] = useState(false);
    src/components/campaigns/campaign-worker-assignment-picker.tsx:278:      if (showOnlyUnallocatedElsewhere && worker.unit_count > 0) return false;
    src/components/campaigns/campaign-worker-assignment-picker.tsx:300:    showOnlyUnallocatedElsewhere,
    src/components/campaigns/campaign-worker-assignment-picker.tsx:411:          {showUnallocatedElsewhereFilter && (
    src/components/campaigns/campaign-worker-assignment-picker.tsx:414:                checked={showOnlyUnallocatedElsewhere}
    src/components/campaigns/campaign-worker-assignment-picker.tsx:415:                onCheckedChange={(checked) => setShowOnlyUnallocatedElsewhere(checked === true)}
    src/components/campaigns/campaign-units-section.tsx:200:  // Selection for the Unallocated pseudo-unit.
    src/components/campaigns/campaign-units-section.tsx:201:  const [unallocatedSelection, setUnallocatedSelection] = useState<Set<number>>(new Set());
    src/components/campaigns/campaign-units-section.tsx:429:  // Workers in campaign but not assigned to any OU — shown in the Unallocated pseudo-unit.
    src/components/campaigns/campaign-units-section.tsx:799:      // Only remove from source when source is a real unit (not coming from Unallocated).
    src/components/campaigns/campaign-units-section.tsx:813:      setUnallocatedSelection(new Set());
    src/components/campaigns/campaign-units-section.tsx:1772:          {/* Unallocated pseudo-unit — workers in campaign with no unit assignment */}
    src/components/campaigns/campaign-units-section.tsx:1803:                      onClick={() => setUnallocatedSelection(new Set())}
    src/components/campaigns/campaign-units-section.tsx:1823:                              setUnallocatedSelection(
    src/components/campaigns/campaign-units-section.tsx:1827:                              setUnallocatedSelection(new Set());
    src/components/campaigns/campaign-units-section.tsx:1848:                                setUnallocatedSelection((prev) => {
    src/components/campaigns/campaign-units-section.tsx:2108:      {/* Reallocate workers to another same-type unit, or assign from Unallocated */}
    src/components/campaigns/campaign-units-section.tsx:2111:        const isFromUnallocated = reallocateTarget.fromOuId === null;
    src/components/campaigns/campaign-units-section.tsx:2112:        const sourceOu = !isFromUnallocated
    src/components/campaigns/campaign-units-section.tsx:2120:            if (isFromUnallocated) return true;
    src/components/campaigns/campaign-units-section.tsx:2144:                  {isFromUnallocated ? "Assign to unit" : "Reallocate to another unit"}
    src/components/campaigns/campaign-units-section.tsx:2147:                  {isFromUnallocated ? (
    src/components/campaigns/campaign-units-section.tsx:2173:                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated
    src/components/campaigns/campaign-units-section.tsx:2177:                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated && (
    src/components/campaigns/campaign-units-section.tsx:2223:                    ? (isFromUnallocated ? "Assigning…" : "Moving…")
    src/components/campaigns/campaign-units-section.tsx:2224:                    : (isFromUnallocated ? "Assign" : "Reallocate")}
    src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:312:  const hasUnallocatedSelections = draftAssignmentTargets.some(
    src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:970:                    showUnallocatedElsewhereFilter
    src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:1081:              disabled={isPending || hasUnallocatedSelections}
    src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:1083:              title={hasUnallocatedSelections ? "Allocate selected workers before reviewing" : undefined}
```

**Commits** (7, oldest first):

| SHA | Message |
|---|---|
| `8f4a45b` | feat(oux-wp0.3): campaign pages open on the wall chart |
| `26da657` | fix(oux-wp0.3): make the build list force the wall chart view |
| `39ec662` | feat(oux-wp0.3): put the wall chart tiles above the distribution charts |
| `bf606bc` | feat(oux-wp0.3): rename "Scope" to "Who's in", hide Named universes |
| `46e4825` | feat(oux-wp0.3): say "Unassigned" instead of "Unallocated" / "No Unit" |
| `b0d87af` | fix(oux-wp0.3): correct the wizard step-2 button and the worker sheet tabs |
| `b0c3298` | feat(oux-wp0.3): default the Workforce board to the list on touch devices |

Plus one commit for this document.

**Gate results** (from `apps/organising-db`):

- `pnpm lint` → `✖ 294 problems (143 errors, 151 warnings)` — the pre-existing count from
  `develop`, unchanged. `pnpm exec eslint` on each touched file reports zero findings on any
  line this package edited; the only findings in touched files are pre-existing
  (`step-campaign-units.tsx:1317,1528`, `worker-import-wizard.tsx:9,502,1571,2202`,
  `worker-detail-sheet.tsx:241,1205`).
- `pnpm test` → `Test Files 1 failed | 51 passed (52)`, `Tests 652 passed (652)`. The single
  failure is the pre-existing `src/lib/sms/__tests__/rating-source-taxonomy.test.ts`
  (missing migration file), which WP0.2 fixes. Both new files pass:
  `campaign-tabs.test.ts` 13/13, `workforce-view.test.ts` 7/7.
- `pnpm build` → `✓ Compiled successfully in 2.5min`, 125/125 static pages generated.

### Fix round 1

Reviewer findings applied after the first verification pass.

**Blocking.**

1. **The device flag never reached the layout** (`src/proxy.ts`). The proxy set `x-viewport`
   as a *response* header, but `src/app/layout.tsx` reads it with `headers()`, which returns
   the *request* headers — so `isMobile` was always `false` and the §2.7 touch default could
   never fire. Fixed by computing the flag before `updateSession` and mutating
   `request.headers`; `updateSession`'s existing `NextResponse.next({ request })` then
   re-emits it as `x-middleware-override-headers`, which is what Next feeds into the server
   render. Verified against the installed `next@16.1.6`: `request.headers.set()` on a
   `NextRequest` succeeds (the same mutability `request.cookies.set` in
   `src/lib/supabase/middleware.ts` already relies on) and the resulting
   `NextResponse.next({ request })` carries `x-middleware-request-x-viewport`. `updateSession`
   was therefore left untouched — no signature change. The response header is still set
   (harmless; `grep -rn "x-viewport" src` shows the only two consumers are `proxy.ts` and
   `layout.tsx`). The UA regex is extracted to a new pure module
   `src/lib/device/detect-mobile.ts` with `src/lib/device/__tests__/detect-mobile.test.ts`
   (iPhone, iPad, Android, desktop Chrome, empty/null/undefined); the proxy itself is not
   unit-testable here.
2. **Wizard post-settlement exit copy** (`campaign-wizard.tsx` ~1950, ~1960). "Go to the
   campaign overview to review and track implementation" → "Go to the campaign to review and
   track implementation"; button "Go to campaign overview" → "Go to campaign". Both fire
   `router.push('/campaigns/${id}')`, which under §2.1 now lands on the wall chart.
3. **`PostSettlementBanner.tsx:22`** — "Return to campaign overview" → "Return to campaign".
   Same bare `/campaigns/${id}` href.

   Sweep for others: `grep -rni "campaign overview" src/app src/components` returns seven more
   hits, all **code comments**, not user-facing strings
   (`phone/setup/order/page.tsx:84`, `FoundationalReadinessPanel.tsx:157`,
   `campaign-employers-worksites-card.tsx:38`, `Phase2WizardLaunchCard.tsx:11`,
   `SituationAnalysisCard.tsx:23, 43`). The only other rendered "…overview" label,
   `bargaining/stage/[stageNumber]/page.tsx:546` "Back to bargaining overview", points at
   `/campaigns/${id}/bargaining`, not a bare campaign URL, and is correct as written. Every
   other bare-`/campaigns/${id}` label already reads "Back to campaign", "Open campaign",
   "Skip for now — go to campaign" or the campaign name.

**Advisory.**

4. **`worker-detail-sheet.tsx` ~150** — dropped the dead `text-xs` from the `TabsList`
   (`grid grid-cols-3 w-full h-auto` remains). `TabsTrigger` sets `text-sm`, which wins over
   an inherited size, so the class never applied. §6 deviation 1 and the measurement table in
   the implementer notes are corrected to `text-sm` (~17% wider than first recorded); the
   `grid-cols-3` conclusion is unchanged and now has more margin.
5. **Test gap recorded** — added to the implementer notes above: the Overview round-trip and
   `setView` param persistence are component behaviour with no vitest coverage, handed to
   WP0.2 as an e2e assertion.
6. **`campaign-employers-worksites-card.tsx:38`** — file-header comment still described
   "Manage scope" and the "Campaign Overview tab"; reworded to match the shipped "Edit who's
   in" button and the "Who's in" sub-tab.
7. **`campaigns/[id]/page.tsx` ~631** — gated Named universes card description "Campaign scope
   (employers, worksites, workers) is managed above" → "Who&apos;s in (employers, worksites,
   workers) is managed above".
8. **`campaign-wall-chart.tsx` ~236** — no code change; the `view=wall-chart` param surviving
   the build list's close is recorded as a deliberate choice in the implementer notes above.

## 7. Verification output

Verifier run 2026-09-08 at 7bfe6e6. Screenshot evidence deferred: no dev-pointed environment available (see PROGRESS.md standing notes).

### `pnpm lint 2>&1 | tail -3`

```
  7 errors and 16 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
```

Full summary line (captured separately, same run): `✖ 294 problems (143 errors, 151 warnings)` — matches the develop baseline exactly (294 problems / 143 errors / 151 warnings).

### Per-file `pnpm exec eslint <path> 2>&1 | tail -4` for each file in `git diff --name-only feat/oux-wp0.1-decision-register..HEAD -- 'apps/organising-db/src/**'`

```
=== apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx ===

=== apps/organising-db/src/app/(dashboard)/campaigns/[id]/plan/stage/[stageNumber]/page.tsx ===
  479:80  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

✖ 11 problems (11 errors, 0 warnings)


=== apps/organising-db/src/components/campaigns/add-workers-client.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-detail-header-bar.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-employers-worksites-card.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-units-section.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-universe-section.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx ===

=== apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx ===

=== apps/organising-db/src/components/campaigns/step-allocate-workers.tsx ===

=== apps/organising-db/src/components/campaigns/step-campaign-units.tsx ===

✖ 2 problems (1 error, 1 warning)
  1 error and 0 warnings potentially fixable with the `--fix` option.


=== apps/organising-db/src/components/campaigns/step-employers-worksites.tsx ===

=== apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx ===

=== apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx ===
  1205:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1215) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps

✖ 2 problems (0 errors, 2 warnings)


=== apps/organising-db/src/components/campaigns/workforce/workforce-board.tsx ===

=== apps/organising-db/src/components/campaigns/workforce/workforce-list-view.tsx ===

=== apps/organising-db/src/components/import/worker-import-wizard.tsx ===

✖ 4 problems (1 error, 3 warnings)
  1 error and 0 warnings potentially fixable with the `--fix` option.


=== apps/organising-db/src/lib/__tests__/campaign-tabs.test.ts ===

=== apps/organising-db/src/lib/campaign-tabs.ts ===

=== apps/organising-db/src/lib/campaign/__tests__/workforce-view.test.ts ===

=== apps/organising-db/src/lib/campaign/workforce-view.ts ===
```

Full (untruncated) eslint output for the four files that reported findings, cross-referenced against `git diff -U0 feat/oux-wp0.1-decision-register..HEAD -- <file>` hunks:

- **`.../[id]/plan/stage/[stageNumber]/page.tsx`** — findings at lines 190, 195, 427, 437, 438, 447, 448, 449, 461, 462, 479 (all `no-explicit-any`). Changed hunk: `@@ -538 +538 @@` (line 538 only). **Findings only on unchanged lines.**
- **`step-campaign-units.tsx`** — findings at lines 1317 (`no-unused-vars`), 1528 (`prefer-const`). Changed hunks: `@@ -1089 +1089 @@`, `@@ -1166 +1166 @@`. **Findings only on unchanged lines.**
- **`wall-chart/worker-detail-sheet.tsx`** — findings at lines 241 (`no-unused-vars`), 1205 (`react-hooks/exhaustive-deps`). Changed hunk: `@@ -145 +145,7 @@` (lines 145–151). **Findings only on unchanged lines.**
- **`import/worker-import-wizard.tsx`** — findings at lines 9, 502, 2202 (`no-unused-vars`), 1571 (`prefer-const`). Changed hunks: `@@ -3284 +3284 @@`, `@@ -3443 +3443 @@`. **Findings only on unchanged lines.**

All other 17 files: **no findings**.

### `pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL|✓|✗' | head -40`

```
 ✓ src/lib/sms/__tests__/conversation-routing.test.ts (14 tests) 3ms
 ✓ src/lib/sms/__tests__/archive-policy.test.ts (14 tests) 3ms
 ✓ src/lib/sms/__tests__/survey-export.test.ts (20 tests) 5ms
 ✓ src/lib/sms/__tests__/chat-rail-state.test.ts (18 tests) 3ms
 ✓ src/lib/phone/__tests__/call-flow-state.test.ts (11 tests) 4ms
 ✓ src/lib/sms/__tests__/relay-target-guard.test.ts (14 tests) 4ms
 ✓ src/lib/sms/__tests__/relay-engine.test.ts (46 tests) 5ms
 ✓ src/lib/sms/__tests__/p2p.test.ts (29 tests) 9ms
 ✓ src/lib/sms/provider/__tests__/mobile-message-parse-webhook.test.ts (24 tests) 5ms
 ✓ src/lib/sms/__tests__/ballot.test.ts (22 tests) 5ms
 ✓ src/lib/sms/__tests__/relay-launch.test.ts (25 tests) 4ms
 ✓ src/lib/sms/__tests__/survey-engine.test.ts (49 tests) 6ms
 ✓ src/lib/sms/__tests__/survey-report.test.ts (13 tests) 12ms
 ✓ src/lib/sms/__tests__/survey-document.test.ts (17 tests) 3ms
 ✓ src/lib/sms/__tests__/survey-integrity.test.ts (9 tests) 3ms
 ✓ src/lib/sms/__tests__/hub-actions.test.ts (15 tests) 3ms
 ✓ src/lib/campaign-facts/__tests__/values.test.ts (14 tests) 3ms
 ✓ src/lib/import/__tests__/worker-matching.test.ts (11 tests) 3ms
 ✓ src/lib/sms/__tests__/audience-import.test.ts (16 tests) 4ms
 ✓ src/lib/phone/__tests__/outcome-model.test.ts (16 tests) 3ms
 ✓ src/lib/sms/__tests__/assessment-mapping.test.ts (11 tests) 2ms
 ✓ src/lib/sms/__tests__/build-list-readiness.test.ts (16 tests) 4ms
 ✓ src/lib/sms/__tests__/sms-reply-prompts.test.ts (10 tests) 5ms
 ✓ src/lib/import/__tests__/participation-mapping.test.ts (11 tests) 5ms
 ✓ src/lib/sms/__tests__/blackout.test.ts (15 tests) 17ms
 ✓ src/lib/sms/__tests__/tapback.test.ts (9 tests) 4ms
 ✓ src/lib/sms/__tests__/segments.test.ts (16 tests) 4ms
 ✓ src/lib/sms/__tests__/sender-inbound.test.ts (15 tests) 3ms
 ✓ src/lib/__tests__/campaign-tabs.test.ts (13 tests) 3ms
 ✓ src/lib/sms/__tests__/pathway-targets.test.ts (9 tests) 2ms
 ✓ src/lib/sms/__tests__/chat-assessment-target.test.ts (13 tests) 2ms
 ✓ src/lib/sms/__tests__/reporting-cohorts.test.ts (7 tests) 2ms
 ✓ src/lib/sms/__tests__/emoji.test.ts (10 tests) 5ms
 ✓ src/lib/phone/__tests__/normalise-phone.test.ts (8 tests) 3ms
 ✓ src/lib/campaign/__tests__/rating-display.test.ts (13 tests) 3ms
 ✓ src/lib/workers/__tests__/duplicate-clusters.test.ts (6 tests) 3ms
 ✓ src/lib/api/__tests__/csv.test.ts (7 tests) 4ms
 ✓ src/lib/workers/__tests__/sync-campaign-universe.test.ts (7 tests) 4ms
 ✓ src/lib/comms/__tests__/sanitise-email-html.test.ts (4 tests) 2ms
 ✓ src/lib/sms/provider/__tests__/list-senders.test.ts (8 tests) 2ms
```

(`head -40` truncates before the end-of-run "Failed Suites" block and the `Test Files` / `Tests` summary lines, which print after all per-file results in this vitest reporter. Captured separately, same suite: `Test Files  1 failed | 51 passed (52)`, `Tests  652 passed (652)`. The single failure is the pre-existing `src/lib/sms/__tests__/rating-source-taxonomy.test.ts` — `ENOENT ... supabase/migrations/20260813120000_sms_source_taxonomy.sql`.)

### `pnpm test -- campaign-tabs workforce-view 2>&1 | tail -15`

```
 ✓ src/lib/sms/provider/__tests__/list-senders.test.ts (8 tests) 3ms
 ✓ src/lib/sms/__tests__/survey-validation.test.ts (5 tests) 2ms
 ✓ src/lib/utils/__tests__/employer-match.test.ts (5 tests) 4ms
 ✓ src/lib/sms/__tests__/compliance.test.ts (6 tests) 3ms
 ✓ src/lib/campaign/__tests__/workforce-view.test.ts (7 tests) 2ms
 ✓ src/lib/nav/__tests__/active-nav.test.ts (3 tests) 1ms
 ✓ src/lib/sms/__tests__/fact-mapping.test.ts (4 tests) 2ms
 ✓ src/lib/campaign/__tests__/assessment-form.test.ts (7 tests) 2ms
 ✓ src/lib/comms/__tests__/sanitise-email-html.test.ts (4 tests) 2ms
 ✓ src/lib/campaign/__tests__/campaign-detail-routes.test.ts (3 tests) 2ms
 ✓ src/lib/workers/__tests__/worker-search-blob.test.ts (2 tests) 2ms
 ✓ src/lib/sms/__tests__/populate-sms-list.test.ts (2 tests) 1ms
 ✓ src/components/audience/__tests__/AudienceWashLists.test.ts (3 tests) 1ms

 Test Files  1 failed | 51 passed (52)
      Tests  652 passed (652)
   Start at  19:06:45
   Duration  2.15s (transform 1.45s, setup 0ms, collect 3.70s, tests 218ms, environment 6ms, prepare 8.17s)

 ELIFECYCLE  Test failed. See above for more details.
```

(The `--` args do not filter by name for this project's `pnpm test` script — it ran the full suite, same result as above. `campaign-tabs.test.ts` (13/13) and `workforce-view.test.ts` (7/7) both pass within it.)

### `pnpm build 2>&1 | tail -6`

```
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

(Captured separately, same build: `✓ Compiled successfully in 2.3min`, `✓ Generating static pages using 13 workers (125/125) in 8.9s`, exit code 0.)

### `git diff --stat feat/oux-wp0.1-decision-register..HEAD`

```
 .../src/app/(dashboard)/campaigns/[id]/page.tsx    |  39 +-
 .../[id]/plan/stage/[stageNumber]/page.tsx         |   2 +-
 .../components/campaigns/add-workers-client.tsx    |   2 +-
 .../campaigns/campaign-detail-header-bar.tsx       |   5 +-
 .../campaign-employers-worksites-card.tsx          |   4 +-
 .../campaigns/campaign-units-section.tsx           |   4 +-
 .../campaigns/campaign-universe-section.tsx        |   5 +-
 .../components/campaigns/campaign-wall-chart.tsx   |  40 +-
 .../campaign-worker-assignment-picker.tsx          |   2 +-
 .../components/campaigns/step-allocate-workers.tsx |   8 +-
 .../components/campaigns/step-campaign-units.tsx   |   4 +-
 .../campaigns/step-employers-worksites.tsx         |   2 +-
 .../wall-chart/create-organising-unit-dialog.tsx   |   2 +-
 .../campaigns/wall-chart/worker-detail-sheet.tsx   |   8 +-
 .../campaigns/workforce/workforce-board.tsx        |  29 +-
 .../campaigns/workforce/workforce-list-view.tsx    |   4 +-
 .../src/components/import/worker-import-wizard.tsx |   4 +-
 .../src/lib/__tests__/campaign-tabs.test.ts        | 113 ++++
 apps/organising-db/src/lib/campaign-tabs.ts        |  17 +-
 .../lib/campaign/__tests__/workforce-view.test.ts  |  42 ++
 .../src/lib/campaign/workforce-view.ts             |  25 +
 docs/organiser-ux-review/PROGRESS.md               |   2 +-
 docs/organiser-ux-review/wp/wp0.3.md               | 571 +++++++++++++++++++++
 23 files changed, 858 insertions(+), 76 deletions(-)
```

### `git diff --name-only feat/oux-wp0.1-decision-register..HEAD | grep -v -E '^apps/organising-db/src/|^docs/organiser-ux-review/' || echo "no files outside src/ and docs/"`

```
no files outside src/ and docs/
```

### `grep -rn "Unallocated\|No Unit\|Unassigned / No group\|Continue to workers" apps/organising-db/src`

```
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:200:  // Selection for the Unallocated pseudo-unit.
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:201:  const [unallocatedSelection, setUnallocatedSelection] = useState<Set<number>>(new Set());
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:429:  // Workers in campaign but not assigned to any OU — shown in the Unallocated pseudo-unit.
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:799:      // Only remove from source when source is a real unit (not coming from Unallocated).
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:813:      setUnallocatedSelection(new Set());
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:1772:          {/* Unallocated pseudo-unit — workers in campaign with no unit assignment */}
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:1803:                      onClick={() => setUnallocatedSelection(new Set())}
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:1823:                              setUnallocatedSelection(
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:1827:                              setUnallocatedSelection(new Set());
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:1848:                                setUnallocatedSelection((prev) => {
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2108:      {/* Reallocate workers to another same-type unit, or assign from Unallocated */}
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2111:        const isFromUnallocated = reallocateTarget.fromOuId === null;
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2112:        const sourceOu = !isFromUnallocated
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2120:            if (isFromUnallocated) return true;
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2144:                  {isFromUnallocated ? "Assign to unit" : "Reallocate to another unit"}
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2147:                  {isFromUnallocated ? (
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2173:                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2177:                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated && (
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2223:                    ? (isFromUnallocated ? "Assigning…" : "Moving…")
apps/organising-db/src/components/campaigns/campaign-units-section.tsx:2224:                    : (isFromUnallocated ? "Assign" : "Reallocate")}
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:121:  showUnallocatedElsewhereFilter = false,
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:140:  showUnallocatedElsewhereFilter?: boolean;
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:151:  const [showOnlyUnallocatedElsewhere, setShowOnlyUnallocatedElsewhere] = useState(false);
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:278:      if (showOnlyUnallocatedElsewhere && worker.unit_count > 0) return false;
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:300:    showOnlyUnallocatedElsewhere,
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:411:          {showUnallocatedElsewhereFilter && (
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:414:                checked={showOnlyUnallocatedElsewhere}
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx:415:                onCheckedChange={(checked) => setShowOnlyUnallocatedElsewhere(checked === true)}
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:312:  const hasUnallocatedSelections = draftAssignmentTargets.some(
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:970:                    showUnallocatedElsewhereFilter
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:1081:              disabled={isPending || hasUnallocatedSelections}
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx:1083:              title={hasUnallocatedSelections ? "Allocate selected workers before reviewing" : undefined}
```

All matches are internal identifiers (state variable/prop names, comments) — none are user-facing copy strings. No match for "No Unit", "Unassigned / No group", or "Continue to workers" text.

### `grep -c "localStorage" <each changed file>`

```
apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx: 0
apps/organising-db/src/app/(dashboard)/campaigns/[id]/plan/stage/[stageNumber]/page.tsx: 0
apps/organising-db/src/components/campaigns/add-workers-client.tsx: 0
apps/organising-db/src/components/campaigns/campaign-detail-header-bar.tsx: 0
apps/organising-db/src/components/campaigns/campaign-employers-worksites-card.tsx: 0
apps/organising-db/src/components/campaigns/campaign-units-section.tsx: 0
apps/organising-db/src/components/campaigns/campaign-universe-section.tsx: 0
apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx: 5
apps/organising-db/src/components/campaigns/campaign-worker-assignment-picker.tsx: 0
apps/organising-db/src/components/campaigns/step-allocate-workers.tsx: 0
apps/organising-db/src/components/campaigns/step-campaign-units.tsx: 0
apps/organising-db/src/components/campaigns/step-employers-worksites.tsx: 0
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx: 0
apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx: 0
apps/organising-db/src/components/campaigns/workforce/workforce-board.tsx: 0
apps/organising-db/src/components/campaigns/workforce/workforce-list-view.tsx: 0
apps/organising-db/src/components/import/worker-import-wizard.tsx: 0
apps/organising-db/src/lib/__tests__/campaign-tabs.test.ts: 0
apps/organising-db/src/lib/campaign-tabs.ts: 0
apps/organising-db/src/lib/campaign/__tests__/workforce-view.test.ts: 0
apps/organising-db/src/lib/campaign/workforce-view.ts: 0
```

Only `campaign-wall-chart.tsx` uses `localStorage` (5 occurrences, pre-existing). `git diff feat/oux-wp0.1-decision-register..HEAD -- apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx | grep '^+.*localStorage'` → no output: **none added** by this branch.

### `git diff feat/oux-wp0.1-decision-register..HEAD --stat -- supabase/ public/help-videos/manifest.json`

```
(no output)
```

### Verifier run 2 (after fix round 1) at 128fef9

**1. `pnpm lint 2>&1 | tail -3` (from `apps/organising-db`)**

```
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
```

Matches the documented baseline exactly (294 problems / 143 errors / 151 warnings).

**2. `pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'` (from `apps/organising-db`)**

```
 FAIL  src/lib/sms/__tests__/rating-source-taxonomy.test.ts [ src/lib/sms/__tests__/rating-source-taxonomy.test.ts ]
 Test Files  1 failed | 52 passed (53)
      Tests  657 passed (657)
```

The one failing file errors at collection time (`Error: ENOENT: no such file or directory, open '.../supabase/migrations/20260813120000_sms_source_taxonomy.sql'`), not on a test assertion — it contributes 0 tests. All 657 executed tests pass. This file/migration is unrelated to WP0.3's diff (see stat below) and pre-existing.

**3. `pnpm build 2>&1 | tail -6` (from `apps/organising-db`)**

```
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

Build completed successfully (route summary printed, no error output).

**4. From repo root**

`git diff --stat 36d1454..HEAD`

```
 .../src/app/(dashboard)/campaigns/[id]/page.tsx    |   2 +-
 .../campaigns/bargaining/PostSettlementBanner.tsx  |   2 +-
 .../campaign-employers-worksites-card.tsx          |   8 +-
 .../src/components/campaigns/campaign-wizard.tsx   |   4 +-
 .../campaigns/wall-chart/worker-detail-sheet.tsx   |  12 ++-
 .../src/lib/device/__tests__/detect-mobile.test.ts |  35 ++++++
 apps/organising-db/src/lib/device/detect-mobile.ts |  17 +++
 apps/organising-db/src/proxy.ts                    |  18 +++-
 docs/organiser-ux-review/wp/wp0.3.md               | 117 +++++++++++++++++----
 9 files changed, 180 insertions(+), 35 deletions(-)
```

`git diff --name-only feat/oux-wp0.1-decision-register..HEAD | grep -v -E '^apps/organising-db/src/|^docs/organiser-ux-review/'`

```
no files outside src/ and docs/
```

**5. `git log --oneline feat/oux-wp0.1-decision-register..HEAD`**

```
128fef9 fix(oux-wp0.3): drop stale "campaign overview" copy and dead text-xs
3a35524 fix(oux-wp0.3): forward the device flag as a request header
36d1454 docs(oux): WP0.3 verification output
7bfe6e6 docs(oux-wp0.3): record deviations and implementer notes
b0c3298 feat(oux-wp0.3): default the Workforce board to the list on touch devices
b0d87af fix(oux-wp0.3): correct the wizard step-2 button and the worker sheet tabs
46e4825 feat(oux-wp0.3): say "Unassigned" instead of "Unallocated" / "No Unit"
bf606bc feat(oux-wp0.3): rename "Scope" to "Who's in", hide Named universes
39ec662 feat(oux-wp0.3): put the wall chart tiles above the distribution charts
26da657 fix(oux-wp0.3): make the build list force the wall chart view
8f4a45b feat(oux-wp0.3): campaign pages open on the wall chart
86cc4a4 docs(oux): fix ledger row columns
adde96a docs(oux): WP0.3 plan, approved
```

## 8. Reviewer findings

_(reviewer)_
