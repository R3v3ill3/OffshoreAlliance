# WP1.4 — Campaign workspace

Planner output. Repository `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance`,
app `apps/organising-db`. Branch checked out while this was written:
`feat/oux-wp1.1-workspace-mode` (WP1.1's registry, resolver and `useWorkspace()` are on it and
were read directly). No file in the repository was modified by the planner.

Every path below is relative to `apps/organising-db/` unless it starts with `supabase/`,
`docs/` or `tests/`. Line numbers are from the working tree at planning time.

---

## 1. Specification

### 1.1 The work package (verbatim)

> **WP1.4 Campaign workspace.** Standard implementer. Four tabs plus More from the tab registry
> with module ids (appendix D 3.1), the campaign switcher (recency-sorted, keyboard shortcut,
> plain label for one campaign), header actions consolidated into New action and Build list,
> wizards keep the campaign header (`src/lib/campaign/campaign-detail-routes.ts`). Acceptance:
> every one of the 44 surfaces in appendix D 3.2 is reachable in full mode and, via More, in
> organiser mode; URL deep links from appendix D 3.1's redirect map still resolve. Depends on
> WP1.1, WP1.2.

Orchestrator amendment carried into this plan verbatim:

> Decisions: 1 Confirmed; 7 Amended (nothing retired, only demoted — every surface and header
> action stays reachable). Full mode (the default for everyone) must be byte-for-byte today's
> campaign page: 8 tabs, 20 sub-tabs, 12 header actions. Organiser mode is only seen when a
> user's resolved mode is `organiser`.

### 1.2 Decisions consumed (`docs/organiser-ux-review/DECISIONS.md`, "Answers")

- **Decision 1 — Confirmed.** "Module table in plan 5.2 as written; 'Show everything' allowed for
  organisers." Consumed as: the thirteen module ids, their `defaultForOrganiser` flags and their
  `offState` are already data in `src/lib/workspace/modules.ts:47-155` and are **not**
  re-litigated here. This package only *maps campaign surfaces onto those ids*. "Show everything"
  is consumed, not built: `resolveWorkspace` already flips `mode` to `full` when the session
  toggle is on (`src/lib/workspace/resolve.ts:91-93`), so the campaign page gets the full 8-tab
  model for free the moment WP1.2's control is pressed.
- **Decision 7 — Amended.** "No creation path is retired. Visibility and prominence are reduced
  instead… every old URL still works and is reachable from a documented location." Consumed as
  the two hard rules of §2.2 (every `?tab=&sub=` renders in both modes) and §2.5 (all twelve
  header actions keep a home; the table names each one's destination).

Nothing else in the register blocks this package. Decisions 3, 4, 5 (groups) land in WP2.1 and
are deliberately not anticipated: the Setup tab in this package points at today's
`CampaignUnitsSection`, and WP2.7 renames the label.

### 1.3 Sequencing facts this plan is written against

| Package | Relationship | What this plan does about it |
|---|---|---|
| **WP1.1** (merged into the branch under this plan) | `src/lib/workspace/{modules,resolve,prefs-schema,use-workspace}.tsx`. `useWorkspace()` is mounted globally at `src/components/providers.tsx:482`. | Consumed directly. `ModuleState` (`use-workspace.tsx:26`) is the state union for tabs — no second definition. |
| **WP1.2** (nav model) | Lands before or beside this one. Owns `src/lib/nav/nav-model.ts`, `NavItem.state on\|muted\|hidden`, `activeHrefs`, the sidebar "Show everything" control and `MY_CAMPAIGNS_HREF`. | This package **does not** import `nav-model.ts` and does not render a second Show-everything control (§6). It mirrors WP1.2's vocabulary (`on`/`muted`/`hidden`, "Ask an admin to enable") so the two menus read as one system. The switcher's "All campaigns" link uses `MY_CAMPAIGNS_HREF` **if** `nav-model.ts` exists at implementation time, else the literal `"/campaigns"` (§2.6, fallback stated). |
| **WP1.3** (My campaigns) | May land before or after. Owns `src/lib/hooks/useMyCampaigns.ts`, the pure `groupMyCampaigns()` (`src/lib/campaign/my-campaigns.ts`) and the `campaign_last_activity(integer[])` RPC (`supabase/migrations/20260910090000_campaign_last_activity.sql`). | The switcher **reuses** them when present. Fallback when WP1.3 has not merged: a two-line query on `campaigns` filtered by `organiser_id`, exactly the filter `/campaigns` uses at `campaigns/page.tsx:135-139`. §2.6 specifies both branches and the single seam between them. |
| **WP1.5** (Actions hub) | Lands before this one. `/sms` becomes a redirect to `/actions`. | Irrelevant to the campaign page: every campaign SMS surface is `?tab=outreach&sub=sms` on the campaign URL, not `/sms`. The one `/sms`-family constant this page touches is `SMS_EPISODE_TOOLS_HREF` (`page.tsx:66,292`), which WP1.5 repoints; this package does not touch that line. |

### 1.4 Source sections read

`docs/ORGANISER_UX_REVIEW_AND_PLAN.md` §3.6 (`:122-133`), §4 principles 3, 4, 6, 16
(`:164-181`), §5.1 (`:192-200`), §5.2 (`:202-234`), §5.4 (`:245-271`).
`docs/organiser-ux-review/appendix-D-navigation-roles.md` §3.1, §3.2, §3.3, §4, §6, §10
items 3, 4, 7, 8. `docs/organiser-ux-review/PROGRESS.md` standing notes.
Code: `src/app/(dashboard)/campaigns/[id]/page.tsx` (whole file, 930 lines),
`src/components/campaigns/campaign-detail-header-bar.tsx` (whole file, 336 lines),
`src/components/layout/header.tsx`, `src/lib/campaign-tabs.ts`,
`src/lib/campaign/campaign-detail-routes.ts` + its test, `src/lib/__tests__/campaign-tabs.test.ts`,
`src/lib/workspace/*`, `src/components/campaigns/workforce/workforce-board.tsx:22-49`,
`src/lib/campaign/workforce-view.ts`, and the four third-level panels named in §2.3.

---

## 2. Plan

### 2.0 The shape of the change, in one paragraph

`page.tsx` is 930 lines and holds every campaign surface. **It is not restructured.** The whole
JSX tree from `<Tabs value={activeTab}>` (`page.tsx:440`) to `</Tabs>` (`:853`) stays where it
is, with the same `TabsContent` children in the same order. Exactly five slots inside it change:
the top-level `<TabsList>` (`:441-452`) and the four cluster `<TabsList>`s (`:553-560`,
`:609-613`, `:637-645`, `:791-796`) are each replaced by one component that renders today's
markup in full mode and returns `null`/the organiser bar in organiser mode. Everything that
decides *what* to render is a pure function in `src/lib/campaign/workspace-tabs.ts` with vitest
tests. The header bar gains a mode branch at one place (`header-bar:140`), leaving the full-mode
`actionButtons` literal untouched. Route chrome gains one pure function in
`campaign-detail-routes.ts`. Net: three components changed, four new files, no schema change.

### 2.1 The tab registry with module ids

#### 2.1.1 Where the data goes

`src/lib/campaign-tabs.ts` (160 lines today) already owns `VALID_TABS` (`:17-39`), `DEFAULT_SUB`
(`:51-56`), `REDIRECT_MAP` (`:84-97`), `DEFAULT_CAMPAIGN_TAB`/`DEFAULT_CAMPAIGN_SUB` (`:100,102`),
`resolveTabParams` (`:109-135`) and `needsRedirect` (`:143-149`). Appendix D 3.1 (`:196`) records
that "the registry holds **no labels, no components, no gating** — those live inline in the page".
This package changes exactly that sentence and nothing else about the file.

**Added to `src/lib/campaign-tabs.ts`** (data only — no React, no `@/lib/workspace` import, so the
file stays importable by the existing node-environment test at
`src/lib/__tests__/campaign-tabs.test.ts`):

```ts
import type { WorkspaceModuleId } from "@/lib/workspace/modules";   // type-only: erased at build

/** One addressable second-level surface: a ?sub= value under a cluster tab. */
export interface CampaignSubTabDef {
  sub: string;                 // the ?sub= value; the URL contract, never derived from the label
  label: string;               // exactly today's TabsTrigger text
  module: WorkspaceModuleId;
  /** Extra query params this surface needs, written on navigation. */
  params?: Readonly<Record<string, string>>;
}

/** One top-level ?tab= value. */
export interface CampaignTabDef {
  tab: string;
  label: string;
  module: WorkspaceModuleId;
  subs: readonly CampaignSubTabDef[];
  /** Non-null only for Bargaining: rendered only at this campaigns.current_phase. */
  requiresPhase?: string;
}

export const CAMPAIGN_TAB_REGISTRY: readonly CampaignTabDef[] = [ /* 8 rows, §2.1.2 */ ];
```

A `type`-only import cannot create a runtime cycle and is erased by `tsc`/SWC, so
`campaign-tabs.ts` keeps zero runtime dependencies.

**Why the *resolver* is a new file and not this one.** `resolveVisibleTabs` must consume
`ModuleState` and `WorkspaceMode` at runtime (values, not types) from `src/lib/workspace/*`, and
it carries the organiser-mode model, which is roughly 200 lines of its own. Putting it in
`campaign-tabs.ts` would triple that file and mix "what the URL means" (stable, consumed by the
redirect effect at `page.tsx:194-211`) with "what this user sees" (mode-dependent). New file:

- `src/lib/campaign/workspace-tabs.ts` — pure. Imports the registry from `@/lib/campaign-tabs`
  and `ModuleState`/`WorkspaceMode` from `@/lib/workspace/*`. No React, no `next/*`.
- `src/lib/campaign/__tests__/workspace-tabs.test.ts`
- `src/lib/campaign/__tests__/campaign-surfaces.fixture.ts` — the appendix D 3.2 inventory,
  hand-written (§2.4).

#### 2.1.2 The module map — the eight tabs and twenty sub-tabs

Labels are copied character-for-character from `page.tsx` so the full-mode snapshot in §2.7 pins
today's wording (including `Wall Chart / List`'s capitals and `Who's in`'s apostrophe entity).

| # | Tab (`?tab=`) | Label | Module | page.tsx |
|---|---|---|---|---|
| 1 | `overview` | Overview | **`insights`** | `:442`, content `:454-546` |
| 2 | `plan` | Plan & Execution | `strategic_plan` | `:443`, `:548-602` |
| 3 | `section-plans` | Section Plans | `strategic_plan` | `:444`, `:844-848` |
| 4 | `workforce` | Workforce | `wall_chart_people` | `:445`, `:632-784` |
| 5 | `outcomes` | Outcomes | `insights` | `:446`, `:604-630` |
| 6 | `outreach` | Outreach | `actions` | `:447`, `:786-836` |
| 7 | `library` | Library | `library` | `:448`, `:838-842` |
| 8 | `bargaining` | Bargaining | `bargaining` (+ `requiresPhase: "bargaining_to_win"`) | `:449-451`, `:850-852` |

| Tab | `?sub=` | Label | Module | page.tsx |
|---|---|---|---|---|
| plan | `strategy` | Strategy | `strategic_plan` | `:554`, `:562-569` |
| plan | `workplan` | Workplan | `strategic_plan` | `:555`, `:571-573` |
| plan | `actions` | Actions | `actions` | `:556`, `:575-588` |
| plan | `task-lists` | Task Lists | `actions` | `:557`, `:590-592` |
| plan | `pending-review` | Pending review | `strategic_plan` | `:558` → `:882-894`, `:594-596` |
| plan | `role-check` | Role check | `strategic_plan` | `:559` → `:899-911`, `:598-600` |
| outcomes | `reports` | Reports | `insights` | `:610`, `:615-617` |
| outcomes | `results` | Results | `insights` | `:611`, `:619-621` |
| outcomes | `insights` | Insights | `insights` | `:612`, `:623-628` |
| workforce | `wall-chart` | Wall Chart / List | `wall_chart_people` | `:638`, `:763-765` |
| workforce | `campaign-units` | Campaign Units | `setup` | `:639`, `:767-772` |
| workforce | `universe` | Who's in | `setup` | `:640`, `:647-753` |
| workforce | `assessments` | Assessments | `wall_chart_people` | `:641`, `:755-757` |
| workforce | `data-fields` | Data fields | `data_fields` | `:642`, `:759-761` |
| workforce | `activists` | Activists & WOCs | `activists_wocs` | `:643`, `:774-778` |
| workforce | `foundational-readiness` | Foundational Readiness | `strategic_plan` | `:644`, `:780-782` |
| outreach | `comms` | Comms | `actions` | `:792`, `:798-802` |
| outreach | `phone` | Phone Ops | `actions` | `:793`, `:804-806` |
| outreach | `sms` | SMS | `actions` | `:794`, `:808-810` |
| outreach | `soc` | SOC | `actions` | `:795`, `:812-829` |

**Overview → `insights`, decided and justified.** The brief left this open. Overview renders
`CampaignOverviewMetrics` (`:463`), `ActivistOverviewCard` (`:464`),
`CampaignEmployersWorksitesCard` (`:465`), a read-only details card (`:466-537`),
`SituationAnalysisCard` (`:539-543`) and `CampaignStageCoveragePanel` (`:545`). Five of those six
are reporting panels; plan 5.2's Insights row is "reports, results, campaign progress, facts
report" (`:222`), which is precisely what they are. Assigning Overview to `wall_chart_people`
would put a metrics dashboard inside the organiser's default module and contradict plan 5.4,
where Overview is not one of the four tabs. The consequence is acceptable *because*
`insights.offState` is `"muted"` (`modules.ts:110`): an organiser sees **"Overview — Ask an admin
to enable"** in More, which is exactly plan §4 principle 4's requirement ("mute and explain what
is merely switched off"), and a deep link to `?tab=overview` renders it anyway (§2.2). The
details card's facts (type, status, dates, organiser, description) are also reachable from the
Setup tab's Basics card in organiser mode, so nothing an organiser needs disappears.

**Two mappings that are worth stating out loud rather than burying.**

1. **`pending-review` and `role-check` → `strategic_plan`**, per the brief. Both are review queues
   over ratings and union roles, and the dashboard widget deep-links to
   `?tab=plan&sub=pending-review` (`pending-review-widget.tsx:127`), as will WP1.3's "Needs
   attention" (`/tmp/oux-plans/wp1.3.md:531-565`). Because `strategic_plan` is off for organisers
   by default, those deep links land on a surface the organiser cannot see in the tab bar — and
   they **still render**, by the rule in §2.2. That is the honest behaviour, not a bug. If the
   operator would rather these two queues stay in the organiser's face, the one-line change is to
   move them to `wall_chart_people` in the registry; recorded as open question **Q1**.
2. **Third-level surfaces inherit their parent sub-tab's module.** Comms' three, SMS' five,
   Activists' four, Library's three and the Workforce layout toggle's two are component-internal
   (§2.3); there is nothing to gate them with independently and no plan-5.2 module that
   distinguishes "SMS Blasts" from "SMS Surveys". `moduleForSurface(tab, sub)` in
   `workspace-tabs.ts` is therefore total over all 45 fixture rows.

#### 2.1.3 The organiser-mode registry — four tabs plus More

New in `src/lib/campaign/workspace-tabs.ts`. **All labels in one constant** so the WP0.5 tree test
(not yet run — `PROGRESS.md` human tasks) can change them by editing one object:

```ts
/** Plan 5.4's four tabs. The WP0.5 tree test is the instrument that may rename
 *  these; it must never have to touch a component to do so. */
export const ORGANISER_TAB_LABELS = {
  wall_chart: "Wall chart",
  people: "People",
  activity: "Activity",
  setup: "Setup",
  more: "More",
} as const;
```

The four tabs and where each one points, all onto **existing** `?tab=&sub=` values:

| id | Label | Target surface | Module | Sub-tabs (each an existing surface) |
|---|---|---|---|---|
| `wall-chart` | Wall chart | `?tab=workforce&sub=wall-chart&view=wall-chart` | `wall_chart_people` | none |
| `people` | People | `?tab=workforce&sub=wall-chart&view=list` | `wall_chart_people` | none |
| `activity` | Activity | `?tab=outreach&sub=comms` | `actions` | Comms `outreach/comms`; Phone Ops `outreach/phone`; SMS `outreach/sms`; SOC `outreach/soc`; Assessments `workforce/assessments`; Task Lists `plan/task-lists`; Actions `plan/actions` |
| `setup` | Setup | `?tab=workforce&sub=universe` | `setup` | Who's in `workforce/universe`; Units `workforce/campaign-units` |

**People is the same `sub` with `view=list`, not a new sub id — decided.** `WorkforceBoard`
already owns the layout toggle and reads `?view=` (`workforce-board.tsx:33-49`), resolved by the
pure `resolveWorkforceView(viewParam, isTouch)` (`workforce-view.ts:19-25`). Minting a second
`?sub=` for the list layout would give one component two URLs, break the device default that
WP0.3 shipped, and require a new entry in `VALID_TABS`/`DEFAULT_SUB` that no existing bookmark
uses. Plan 5.4's own hedge asks for exactly this shape — *"keep People as the tab name and make
Wall chart / List the two layouts inside it… whichever name wins, the URL should open on the
chart"* (`:266`) — and the WP0.5 tree test can collapse the two tabs into one by deleting one row
from the organiser registry. Two consequences, stated:

- Both organiser tabs always write `?view=` explicitly on navigation (the same defensive write
  `handleToggleBuildList` already does at `header-bar:97` and `WorkforceBoard.setView` at
  `workforce-board.tsx:41-44`), so a click is never ambiguous.
- On a touch device an **absent** `?view=` resolves to `list` (`workforce-view.ts:13-15`), so a
  bare `/campaigns/12` lights **People**, not Wall chart. That is correct: the tab bar must
  describe what is on screen. The pure `activeOrganiserTabId()` therefore takes `isTouch` and is
  tested for both values.

**Activity is a tab over three clusters, and it is not the chronological list.** Plan 5.4 asks for
"one chronological list with type chips" (`:268`). That list is a new aggregation over
`campaign_activity_ratings`, `call_lists`, `sms_conversations`, `campaign_worker_lists` and task
lists; WP1.5 builds the equivalent union for standalone actions
(`/tmp/oux-plans/wp1.5.md:80-199`) and WP3 owns the campaign-linked version. **This package does
not build it.** Activity here is a tab whose seven sub-items are the existing Outreach sub-tabs
plus Assessments and the two Plan sub-tabs, in the order above. Said plainly so the reviewer is
not misled: an organiser in organiser mode gets one *place* for activity, not one *list*.
Recorded again in §3 (out of scope).

**Setup is two sub-tabs plus five link cards.** Who's in and Units are real `?sub=` surfaces.
The other three things plan 5.4 names — Organisers, Basics and "add a strategic plan" — have no
`?tab=&sub=` today, so they are rendered as cards **above** the sub-tab row by a new small
component (§2.5.3), each a link to where the feature already lives:

| Card | Goes to | Existing code |
|---|---|---|
| Organisers | `/campaigns/[id]/plan#campaign-team` | Campaign Team card, `plan/page.tsx:352-420`; the only change is `id="campaign-team"` on the `<Card>` at `:352` |
| Basics | opens `CampaignBasicsEditSheet` (already mounted in the header bar, `header-bar:300-306`) via the header's ⋯ / pencil; the card's button links to `/campaigns/[id]/settings`, whose first accordion section is Basics (`campaign-settings.tsx:756-1163`) | no new editor |
| Import worker list | opens `WorkerImportWizard`, already imported and mounted by the page (`page.tsx:38`, `:864-872`) | no new mount |
| Strategic plan | `/campaigns/[id]/plan` | `header-bar:223` today |
| Re-run wizard | `/campaigns/new?cid=${campaignId}&edit=1` | `header-bar:212` today |

Building in-place editors for Organisers and Basics is WP3.2's setup-checklist work and is out of
scope (§3). Nothing is lost: all five destinations exist today.

**More** holds every registry tab whose module is not one of the four organiser tabs' modules —
Overview, Plan & Execution, Section Plans, Outcomes, Library, Bargaining — plus the workforce
sub-tabs that no organiser tab surfaces (Data fields, Activists & WOCs, Foundational Readiness).
Items with `state === "muted"` render disabled with the WP1.2 wording **"Ask an admin to enable"**;
items with `state === "hidden"` are not listed at all (§2.2 says what happens if one is
deep-linked anyway).

#### 2.1.4 `resolveVisibleTabs` — the signature and the rules

```ts
// src/lib/campaign/workspace-tabs.ts
import type { ModuleState } from "@/lib/workspace/use-workspace";   // "on" | "hidden" | "muted"
import type { WorkspaceMode } from "@/lib/workspace/resolve";
import type { WorkspaceModuleId } from "@/lib/workspace/modules";

export interface CampaignSurfaceRef {
  tab: string;
  sub: string | null;
  params?: Readonly<Record<string, string>>;   // e.g. { view: "list" }
}

export interface CampaignSubTabModel {
  id: string;                  // organiser mode: unique within the tab; full mode: the ?sub=
  label: string;
  module: WorkspaceModuleId;
  state: ModuleState;
  href: CampaignSurfaceRef;
}

export interface CampaignTabModel {
  id: string;
  label: string;
  module: WorkspaceModuleId;
  state: ModuleState;
  href: CampaignSurfaceRef;
  subs: readonly CampaignSubTabModel[];
}

export interface CampaignNavModel {
  mode: WorkspaceMode;
  /** Primary tab bar. Full mode: 8 (7 when the phase gate fails). Organiser: 4. */
  tabs: readonly CampaignTabModel[];
  /** Organiser mode only; always [] in full mode. */
  more: readonly CampaignTabModel[];
  /** Which primary tab is active, or null when the active surface lives in More. */
  activeTabId: string | null;
  /** Which sub-item is active within `activeTabId`, or null. */
  activeSubId: string | null;
  /** Label for the More trigger when activeTabId === null (e.g. "Pending review"). */
  activeMoreLabel: string | null;
}

export interface ResolveVisibleTabsInput {
  mode: WorkspaceMode;
  enabledModules: ReadonlySet<WorkspaceModuleId>;
  moduleState: (id: WorkspaceModuleId) => ModuleState;
  /** campaigns.current_phase; gates Bargaining exactly as page.tsx:449 does today. */
  phase: string | null;
  /** The campaign has ≥1 campaign_stage_plans row. Drives the Setup "Strategic plan" card copy. */
  hasPlan: boolean;
  /** The resolved URL surface, from resolveTabParams(). */
  active: { tab: string; sub: string | null };
  /** From ?view=, already resolved by resolveWorkforceView(). */
  activeView: "wall-chart" | "list";
}

export function resolveVisibleTabs(input: ResolveVisibleTabsInput): CampaignNavModel;
```

Numbered rules, one test case each:

- **V1 — full mode is the registry, unchanged.** `mode === "full"` ⇒ `tabs` = the eight
  `CAMPAIGN_TAB_REGISTRY` rows in registry order, every `state: "on"`, `subs` = every registry
  sub with `state: "on"`, `more: []`. `enabledModules`/`moduleState` are **not consulted**;
  `resolveWorkspace` already guarantees full mode means every module the role may see
  (`resolve.ts:95-98`).
- **V2 — the Bargaining phase gate is mode-independent.** `requiresPhase` present and
  `phase !== requiresPhase` ⇒ that tab's `state` is `"hidden"` in **both** modes and it is
  dropped from `tabs`/`more`. This reproduces `page.tsx:449-451` exactly; the phase gate is
  today's behaviour and this package does not touch it.
- **V3 — organiser mode is the four-tab model.** `tabs` = the four rows of §2.1.3 in that order.
- **V4 — a tab's state is its module's state.** `state = moduleState(tab.module)`. Never
  re-derived from `adminOnly` or from `enabledModules` directly — `use-workspace.tsx:85-87` is the
  one definition, exactly as WP1.2 argues at `/tmp/oux-plans/wp1.2.md:236`.
- **V5 — the four organiser tabs' modules are the four plan-5.2 defaults**
  (`wall_chart_people`, `actions`, `setup`), so with the default module set every one is `"on"`.
  With a module switched off, its tab renders with the muted treatment and its target is still
  navigable (§2.2). A tab is never removed from the four.
- **V6 — More is the registry minus what the four tabs already reach.** Concretely: every
  registry `(tab, sub)` pair whose surface is not the target of an organiser tab or one of its
  sub-items, grouped by its registry tab, each with `state = moduleState(module)`, filtered to
  `state !== "hidden"`. Order: registry order.
- **V7 — `activeTabId`.** Match `active` (+ `activeView` for the wall-chart/list split) against
  the four tabs and their sub-items; on a hit set `activeTabId`/`activeSubId`; on a miss set both
  `null` and `activeMoreLabel` to the registry label of the active surface (the sub's label when
  there is one, else the tab's). In full mode `activeTabId = active.tab` and
  `activeSubId = active.sub` always.
- **V8 — pure and total.** No throw for an unknown `(tab, sub)`: `activeTabId = null`,
  `activeMoreLabel = null`. `page.tsx:181-188` already coerces unknown tabs to the default, so
  this is defence in depth.
- **V9 — `hasPlan`** only changes the Setup "Strategic plan" card's copy ("View full plan" vs
  "Add a strategic plan") and never any tab's state. Stated so no one wires a gate to it.

Two exported helpers the tests and the renderers share:

```ts
/** The module that owns a surface. Total over every registry pair. */
export function moduleForSurface(tab: string, sub: string | null): WorkspaceModuleId | null;

/** How a surface is reached in a given model. Used by the reachability proof (§2.4). */
export type SurfaceRoute =
  | { via: "tab"; tabId: string }
  | { via: "sub"; tabId: string; subId: string }
  | { via: "more"; tabId: string; subId: string | null };
export function findSurface(
  model: CampaignNavModel,
  surface: { tab: string; sub: string | null },
): SurfaceRoute | null;
```

`hasPlan` costs zero extra round trips: `page.tsx:281` selects
``` `*, organiser:organisers(organiser_name)` ``` and gains `, campaign_stage_plans(plan_id)` —
the same embed `campaigns/page.tsx:152` already uses for the list page's Campaign Plan column.
`CampaignDetail` (`page.tsx:86-104`) gains `campaign_stage_plans?: { plan_id: number }[]`.

### 2.2 URL compatibility — the rule, stated once

> **Workspace mode is presentation, never permission.** Every `?tab=&sub=` value that resolves
> today resolves identically in organiser mode and renders the same component. The More menu is
> navigation, not a gate.

Mechanically this is free, and that is the point:

- `resolveTabParams` (`campaign-tabs.ts:109-135`) takes `(tab, sub)` and **nothing else**. It
  gains no mode parameter. `needsRedirect` (`:143-149`) and the redirect effect
  (`page.tsx:194-211`) are untouched, so every one of the twelve `REDIRECT_MAP` keys
  (`campaign-tabs.ts:84-97`) keeps rewriting to the same pair in both modes.
- The `TabsContent` tree (`page.tsx:454-852`) is untouched, so whatever `activeTab`/`activeSub`
  resolve to still renders. The only thing `resolveVisibleTabs` decides is which **bar** is drawn
  above it.
- **Deep-linking a surface whose module is `hidden`:** it renders. The tab bar shows no active
  primary tab, the More trigger renders in its active state carrying `activeMoreLabel` (V7), and
  the More menu does not list the item. This is the recommendation the brief asked for, adopted
  explicitly. The alternative — bouncing the user to the wall chart — would break decision 7
  ("every old URL still works"), break `PendingReviewWidget`'s deep link
  (`pending-review-widget.tsx:127`), break the SMS fire redirect
  (`?tab=outreach&sub=sms&sms_list=`, `campaign-tabs.ts:47-49`) and break WP1.3's Needs-attention
  cards. It is never done.
- The same holds for the third-level params: `?view=` (`workforce-view.ts`, and separately
  `activists-wocs-section.tsx:41-45`), `?email_view=` (`campaign-comms-section.tsx:29-30`),
  `?sms_list=`, `?conversation=`, `?buildList=1`. None of them is read by
  `resolveVisibleTabs` except `?view=` (V7), and none is written differently by mode.

Tests: §2.4 T5 and the extended `src/lib/__tests__/campaign-tabs.test.ts`.

### 2.3 The 45-row surface inventory, and the discrepancy in appendix D

Appendix D 3.2 (`:190`) counts "**8 top-level tabs**; **20 second-level sub-tabs** (6 + 7 + 3 + 4);
**16 third-level tabs/toggles** (Comms 3, SMS 4, Activists 4, Library 3, Workforce view toggle 2)
→ **≈44 distinct surfaces**". 8 + 20 + 16 = 44, so the work package's "44 surfaces" is that sum.

**The SMS panel has five third-level tabs, not four.** `InlineSmsOpsPanel.tsx:224` declares
`const SMS_VIEWS = ['blasts', 'inbox', 'surveys', 'relays', 'chats'] as const`, and the
`TabsList` at `:290-312` renders Blasts (`:292`), Inbox (`:296`), Surveys (`:300`), Chats
(`:304`) **and Relays (`:308-311`)**, with content at `:343-344` (`SmsRelaysPanel`). The
appendix's citation `InlineSmsOpsPanel.tsx:292-304` stops one trigger short. Relays is the
relay-with-attribution feature the SMS module brief locked in
(`docs/SMS_MODULE_BRIEF.md`; file header comment `InlineSmsOpsPanel.tsx:19-20`), so it is a real
surface, not a stale one.

**Decision:** the fixture holds **45 rows** — the 44 the appendix enumerates plus Relays, flagged.

```ts
// src/lib/campaign/__tests__/campaign-surfaces.fixture.ts
export interface SurfaceFixtureRow {
  id: string;                               // stable, e.g. "outreach/sms#relays"
  level: 1 | 2 | 3;
  tab: string;
  sub: string | null;
  /** Level 3 only: the component-internal tab value. */
  third: string | null;
  label: string;
  /** Where appendix D 3.2 records it, or "not counted (see wp1.4 §2.3)". */
  appendix: string;
}
export const CAMPAIGN_SURFACES: readonly SurfaceFixtureRow[] = [ /* 45 rows */ ];
export const APPENDIX_D_COUNT = 44;   // 8 + 20 + 16, appendix-D-navigation-roles.md:190
```

and a test:

```ts
it("carries the appendix D 3.2 inventory plus the one surface it undercounts", () => {
  expect(CAMPAIGN_SURFACES).toHaveLength(APPENDIX_D_COUNT + 1);
  expect(CAMPAIGN_SURFACES.filter(r => r.appendix.startsWith("not counted"))
    .map(r => r.id)).toEqual(["outreach/sms#relays"]);
});
```

The 16 (now 17) third-level rows and where each is defined:

| Parent surface | Third-level values | Where | Addressable? |
|---|---|---|---|
| `outreach/comms` | `drafts` "Drafts & Send", `list-builder` "List Builder", `inbox` "Inbox" | `campaign-comms-section.tsx:87-92` | partly — `?email_view=inbox` (`:29-30`) |
| `outreach/sms` | `blasts`, `inbox`, `surveys`, `chats`, **`relays`** | `InlineSmsOpsPanel.tsx:224, 290-312` | `defaultTab` from `?sms_list=`/params |
| `workforce/activists` | `register`, `tasking` "4A Tasking", `wocs` "WOCs", `structure-tests` "Structure Tests" | `activists-wocs-section.tsx:26, 57-62` | yes — `?view=` (`:41-45`) |
| `library` | `documents`, `agreements`, `offers` | `library/campaign-library.tsx:25-33` | no — `useState` |
| `workforce/wall-chart` | `wall-chart`, `list` | `workforce-board.tsx:33-49`, `workforce-view.ts:19-25` | yes — `?view=` |

Note the collision worth recording: `?view=` is read by **both** `WorkforceBoard` and
`ActivistsWocsSection`. They never mount together (different `?sub=`) and each ignores values it
does not know (`workforce-view.ts:21-23` falls through to the device default;
`activists-wocs-section.tsx:42-44` falls back to `register`), so it works — but it constrains this
package: the People tab must use `?view=list` on `sub=wall-chart`, never a `?view=` that leaks
into the activists surface. Filed as risk **R4**.

### 2.4 The reachability proof

`src/lib/campaign/__tests__/workspace-tabs.test.ts`. Node environment (`vitest.config.ts:19`), so
everything under test is pure.

Shared inputs:

```ts
const ALL = new Set(MODULE_IDS.filter(id => id !== "administration"));         // resolve.ts:46-49
const ORG_DEFAULT = ORGANISER_DEFAULT_MODULE_IDS;                             // modules.ts:167
const stateFrom = (on: ReadonlySet<WorkspaceModuleId>) =>
  (id: WorkspaceModuleId): ModuleState => on.has(id) ? "on" : getModule(id).offState;
```

- **T1 — full mode is today's structure.** `resolveVisibleTabs({ mode: "full", …, phase:
  "bargaining_to_win" })` ⇒ `tabs.map(t => t.tab)` equals the 8 ids in `page.tsx:442-451` order,
  and `tabs.flatMap(t => t.subs.map(s => s.sub))` equals the 20 ids in the four `TabsList`s'
  order. Both compared against `CAMPAIGN_SURFACES` filtered to `level === 1` / `level === 2`.
  Plus `toMatchSnapshot()` on the whole model (this is also §2.7's zero-change pin).
- **T2 — full mode without the bargaining phase.** `phase: "preparing_to_bargain"` ⇒ 7 tabs, and
  `more` is still `[]`. Reproduces `page.tsx:449`.
- **T3 — organiser mode, default modules: 100 % coverage.** For every one of the 45 fixture rows,
  `findSurface(model, rowSurface(row))` is non-null (level-3 rows are resolved through their
  parent `(tab, sub)`; the test asserts the parent is reachable and records `via`). The assertion
  is `expect(unreachable).toEqual([])` with `unreachable` listing `row.id` + `row.label`, so a
  failure names the surface rather than printing `false !== true`.
- **T4 — organiser mode, coverage census.** Snapshot of `Object.entries(groupBy(rows, r =>
  findSurface(...)!.via))` — the record of exactly which surfaces are primary, which are sub-items
  and which are behind More. This is the artefact a reviewer reads to check the IA, and it fails
  loudly if someone quietly moves a surface into More.
- **T5 — nothing but the four defaults.** `moduleState = stateFrom(ORG_DEFAULT)`. Every row whose
  module is off has `state !== "on"` in the model **and** is still returned by
  `resolveVisibleTabs({ ...input, mode: "full" })` — the state after "Show everything", because
  `resolveWorkspace` returns `mode: "full"` when the session toggle is on
  (`resolve.ts:91-93`). Assert `findSurface` is non-null for all 45 in that expanded model.
- **T6 — every module off (pathological).** `moduleState = () => "hidden"` for everything except
  the four. `tabs` still has four entries (V5: a tab is never removed), `more` may be empty, and
  every fixture row is still reachable after `showEverything`. Proves the "no missing-feature
  report unanswerable via More or Show everything" phase-1 exit criterion (`PROGRESS.md`, Phase 1
  exit) at the campaign-page level.
- **T7 — URL compatibility, both modes.** For each of the 12 `REDIRECT_MAP` keys and each of the
  20 `(tab, sub)` pairs: `resolveTabParams(key, null)` is unchanged (already covered by
  `src/lib/__tests__/campaign-tabs.test.ts:75-113`, extended here to assert the target is a
  registry pair), and `resolveVisibleTabs` with that pair as `active` yields a model in which
  `findSurface` is non-null in **both** modes. Plus: `resolveTabParams.length === 2`, a cheap
  structural assertion that no mode argument crept in.
- **T8 — registry integrity.** Every registry `module` is in `MODULE_IDS`
  (`modules.ts:157`); every registry `(tab, sub)` appears in the fixture and vice versa; every
  organiser tab/sub `href` names a registry pair; `DEFAULT_SUB` (`campaign-tabs.ts:51-56`) agrees
  with the registry's first sub for each cluster; `DEFAULT_CAMPAIGN_TAB`/`_SUB`
  (`:100,102`) name a registry pair.
- **T9 — the labels are one constant.** `ORGANISER_TAB_LABELS` has exactly five keys and the
  organiser model's labels are drawn from it (asserted by identity, `model.tabs[0].label ===
  ORGANISER_TAB_LABELS.wall_chart`), so a tree-test rename cannot miss a component.
- **T10 — People vs Wall chart active state.** `activeOrganiserTabId` for
  `{tab:"workforce", sub:"wall-chart"}` with `activeView:"list"` is `"people"`, with
  `"wall-chart"` is `"wall-chart"`; and for a touch device with no `?view=`, the caller passes
  `resolveWorkforceView(null, true) === "list"` so `"people"` is active. Table-driven, 4 cases.

### 2.5 The header

#### 2.5.1 Full mode: untouched

`campaign-detail-header-bar.tsx:140-229` builds `actionButtons` as one literal. It is **not
edited**. The change is at `:140`:

```tsx
const { canWrite } = useAuth();
const { mode } = useWorkspace();                       // use-workspace.tsx:96

const actionButtons = !canWrite
  ? null
  : mode === "organiser"
    ? <OrganiserCampaignActions campaignId={campaignId} … />
    : (
      /* ─ today's literal, :141-228, byte for byte ─ */
    );
```

Everything else in the file — the episode branch (`:122-138`), the back arrow (`:240-249`), the
name/pencil/badges block (`:251-284`), the three resume banners (`:289-295`) and the three
dialog mounts (`:298-333`) — is unchanged, in both modes. `MobileNav` (`:239`) stays, so WP1.2's
sidebar (and its Show everything control) is one tap away inside a campaign on every screen size.

Two small additions that both modes share, because they are additive and full mode's *actions*
are what the criterion pins:

- The switcher (§2.6) is inserted **only** when `mode === "organiser"`, before the back arrow.
  Full mode's header is byte-identical.
- `id="campaign-team"` on `plan/page.tsx:352`'s `<Card>` — an anchor, no visual change.

#### 2.5.2 Organiser mode: where each of the twelve actions goes

New file `src/components/campaigns/organiser-campaign-actions.tsx`. Nothing is removed;
appendix D 3.3's table is the source and every row has a destination.

| # | Action today | Appendix D 3.3 / header-bar | Organiser mode home |
|---|---|---|---|
| 1 | Back arrow "Back to campaigns" | `:238-246` | **unchanged** (header, left) |
| 2 | Pencil "Edit campaign basics" | `:258-268`, sheet `:297-303` | **unchanged** (header, next to the name) — plan 5.1 principle 5, "one place to edit it"; it is a 28 px icon button, not clutter |
| 3 | Build list (checkbox) | `:85-104`, `:148-158` | **"Build list"** — promoted to a top-level header button (plan 5.4 `:264`), a toggle calling the **existing** `handleToggleBuildList` (`:86-106`), unchanged semantics including the `tab/sub/view` forcing at `:93-97`. `aria-pressed` = `isBuildListOpen`. |
| 4 | Build ▾ → Import worker list | `:160-163`, wizard `:318-328` | **⋯ overflow** + Setup tab card (§2.1.3) |
| 5 | Build ▾ → Add assessment | `:164-166`, dialog `:304-317` | **New action ▾ → Assessment** (same `setCreateAssessmentOpen(true)`) |
| 6 | Build ▾ → Task management | `:167-171` | **⋯ overflow** (the link to `?tab=plan&sub=task-lists&from=header`); the *create* half becomes **New action ▾ → Task list** |
| 7 | Create Phone Call | `:174-182` | **New action ▾ → Call list** (`CreatePhoneCallOrchestrator`) |
| 8 | Create Email | `:183-191` | **New action ▾ → Email** (`CreateEmailOrchestrator`) |
| 9 | Create SMS | `:192-200` | **New action ▾ → SMS** (`CreateSmsOrchestrator`) |
| 10 | Actions ▾ → Re-run wizard | `:209-214` | **⋯ overflow** + Setup tab card |
| 11 | Actions ▾ → All settings | `:215-220` | **⋯ overflow** + Setup tab card ("Basics & all settings") |
| 12 | Actions ▾ → View full plan | `:221-223` | **⋯ overflow** + Setup tab card + **More → Strategic plan** when the module is on |
| — | `ResumeBanner`, `EmailResumeBanner`, `SmsResumeBanner` | `:288-290` | **unchanged**, both modes |

So the organiser header is: `[switcher] [back] [name] [pencil] [type badge] [status badge] …
[New action ▾] [Build list] [⋯]`. Plan 5.4 asks for "name, status pill, and two actions"
(`:264`); the type badge and date range stay because removing them would be a change nobody
asked for and they cost one line.

Implementation notes for `OrganiserCampaignActions`:

- The three orchestrators are **trigger-prop** components
  (`CreatePhoneCallOrchestrator trigger={…}`, `header-bar:176-202`). Inside a `DropdownMenu` a
  trigger-prop component cannot be a `DropdownMenuItem` directly without the menu closing before
  the dialog mounts. Pattern: each menu item is `<DropdownMenuItem onSelect={(e) => {
  e.preventDefault(); setPendingAction("phone") }}>`, and the three orchestrators are rendered
  **outside** the menu with a `trigger={null}`-style hidden button that a `useEffect` clicks —
  **no.** Simpler and already proven in this file: render the three orchestrators next to the
  menu with visually-hidden triggers and have the menu item call `.click()` on a ref? Also
  fragile. **Chosen approach:** the three orchestrators expose no `open`/`onOpenChange` prop, so
  the menu item renders the orchestrator's own trigger *as the menu item*:
  `<CreatePhoneCallOrchestrator campaignId={campaignId} trigger={<DropdownMenuItem
  onSelect={(e) => e.preventDefault()}><Phone …/>Call list</DropdownMenuItem>} />`. This is the
  same composition the file already relies on (a `Button` passed as `trigger`), and
  `onSelect`-preventDefault keeps the menu open while the dialog mounts. The implementer must
  verify each orchestrator forwards props/ref to the trigger; if one does not, fall back to a
  `useState` + `open` prop for that one, or keep it as its own header button — and say so in the
  deviations section. Assessment (`CreateAssessmentDialog`) and Task list
  (`CreateTaskListDialog`, `task-lists/create-task-list-dialog.tsx:151-161`) both already take
  `open`/`onOpenChange`, so those two are plain `useState` menu items.
- The five ⋯ items are `router.push` / `<a>` exactly as at `:170`, `:212`, `:218`, `:223`, and
  `setImportWorkersOpen(true)` at `:162`. The three dialog mounts at `:298-333` are reused by
  lifting `importWorkersOpen`, `createAssessmentOpen` and a new `createTaskListOpen` into the
  header bar and passing setters down as props — the sheet/dialog mounts stay in
  `campaign-detail-header-bar.tsx`, so there is exactly one mount of each in the tree.
- `canWrite === false` ⇒ `actionButtons` is `null` in both modes (`:140`), unchanged. A viewer in
  organiser mode sees the switcher, name, badges and the four tabs, and no write affordances.

#### 2.5.3 The Setup tab's cards

New file `src/components/campaigns/setup/campaign-setup-cards.tsx`. A `grid gap-4 md:grid-cols-2`
of five small `Card`s (the five rows of §2.1.3's table), each with a title, one line of helper
text in plan-3.6 wording and one button. Rendered by `CampaignTabBar` above the Setup sub-tab row,
**only in organiser mode**, and only when `canWrite` for the four that write. The Strategic-plan
card's copy switches on `hasPlan` (V9): "View full plan" / "Add a strategic plan". No new data
fetch — the campaign row the page already has (`page.tsx:276-288`) supplies everything.

### 2.6 The campaign switcher

New files:

- `src/components/campaigns/campaign-switcher.tsx` — the control.
- `src/lib/campaign/switcher-shortcut.ts` + `__tests__/switcher-shortcut.test.ts` — the pure
  keyboard-chord logic.
- `src/lib/hooks/useSwitcherCampaigns.ts` — the data seam (see below).

**Which mode.** Organiser mode only, as recommended. Plan 5.4 puts it in the organiser header
(`:264`) and criterion 7 requires full mode to be byte-for-byte today. Adding it to full mode is a
one-line change later and is filed as open question **Q2**.

**The list.** One seam, two implementations:

```ts
// src/lib/hooks/useSwitcherCampaigns.ts
export interface SwitcherCampaign {
  campaign_id: number;
  name: string;
  status: CampaignStatus;
  campaign_type: CampaignType;
}
export function useSwitcherCampaigns(): { data: SwitcherCampaign[]; isLoading: boolean };
```

- **If WP1.3 has merged:** delegate to `useMyCampaigns()` and its pure `groupMyCampaigns()`
  (`/tmp/oux-plans/wp1.3.md:250-298`), taking `mine` then `team`, so the switcher and the
  My campaigns home can never disagree about what "my campaigns" means. `groupMyCampaigns` already
  drops `is_sms_episode` and `is_standing` rows (its rules G4, G5).
- **If it has not:** one query — `campaigns` `.eq("organiser_id", profile.organiser_id)`, wrapped
  in `excludeSmsEpisodes(...)` (`src/lib/campaign/visible-campaigns.ts:12-17`), `.eq("is_standing",
  false)`, `.order("created_at", { ascending: false })`, `staleTime: 60_000`, `enabled:
  profile?.organiser_id != null`. That is exactly the filter `/campaigns` applies at
  `campaigns/page.tsx:135-139` over the query at `:141-159`, so the two lists agree today too.
  `profile.organiser_id === null` ⇒ empty list ⇒ plain label (below).

**Recency — the choice, stated.** Plan §4 principle 16 says "recency-sorted"; "last opened" per
user has no server home until WP2.1's `user_campaign_prefs`, and the standing rules forbid
`localStorage` for view state. So:

1. **Preferred:** WP1.3's `campaign_last_activity(integer[])` RPC
   (`/tmp/oux-plans/wp1.3.md:412-460`) — real recency of work on the campaign (latest rating,
   call, SMS or list fire), one round trip for the whole list, already `staleTime: 60_000`.
   Sort `last_activity_at` desc, nulls last, tie-broken by `created_at` desc.
2. **Fallback when WP1.3 has not merged:** `created_at` desc — the same order `/campaigns` uses
   (`campaigns/page.tsx:153`), so the switcher's order matches the list the organiser came from.

**Explicitly not used:** `campaigns.updated_at` (baseline `:9661`, maintained by
`trg_campaigns_updated_at`, baseline `:22409`) — it moves only when the campaign *row* is written,
so a campaign edited once in March outranks one worked daily; and `localStorage` (standing rule,
`use-workspace.tsx:6-9` records the same rule for the session toggle). True per-user "last opened"
recency is WP2.1's, and this plan says so rather than inventing a client store for it.

**Rendering.** `Popover` + `Command` — both already in the tree
(`src/components/ui/popover.tsx:29`, `src/components/ui/command.tsx:185-195` exporting `Command`,
`CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`; `cmdk@^1.1.1`,
`package.json:57`). No new dependency.

- **> 1 campaign:** `<PopoverTrigger asChild><Button variant="ghost" size="sm"
  aria-haspopup="listbox">{currentName}<ChevronsUpDown/></Button></PopoverTrigger>` over a
  `Command` with `CommandInput placeholder="Find a campaign"`, one `CommandItem` per campaign
  (`router.push('/campaigns/' + id)` — no query params, so `resolveTabParams` lands the organiser
  on the wall chart, `campaign-tabs.ts:100-102`), a `CommandSeparator`, and a final item **"All
  campaigns"** → `MY_CAMPAIGNS_HREF` from `@/lib/nav/nav-model` if that module exists, else the
  literal `"/campaigns"`. (WP1.2 ships that constant with the value `"/campaigns"` and WP1.3 flips
  it — `/tmp/oux-plans/wp1.2.md:211` — so importing it costs nothing and gains the flip.)
- **Exactly 1 campaign, or 0, or `isLoading`:** a plain non-interactive `<span
  className="text-sm text-muted-foreground">` with the campaign name (plan §4 principle 16:
  "collapsing to a label for single-campaign users"). No popover mounts, no keyboard listener is
  registered, no query fires beyond the list itself.

**The keyboard shortcut: `g` then `c`.** Collision audit over `src` for global handlers
(`grep -rn keydown src`): three hits, all local — `MobileBottomSheet.tsx:64` (Escape, inside a
sheet), `EmailComposer.tsx:1053-1067` (`Cmd/Ctrl+S` save draft; `Cmd/Ctrl+K` deliberately left
for the editor's link command) and `use-claim-auto-renew.ts:43` (activity detection). There is no
global command palette. **`Cmd/Ctrl+K` is therefore rejected**: it is the one combination
`EmailComposer` explicitly reserves, and the email composer is reachable inside a campaign
(`campaigns/[id]/email/wizard`), where this header is mounted. A Linear-style `g`-chord has no
collisions and matches principle 16's model.

```ts
// src/lib/campaign/switcher-shortcut.ts  — pure, no DOM types beyond the fields it reads
export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  /** tagName of event.target, upper-case, or null. */
  targetTag: string | null;
  /** event.target.isContentEditable */
  targetEditable: boolean;
}
export const SWITCHER_CHORD = ["g", "c"] as const;
export const CHORD_TIMEOUT_MS = 1500;

/** Returns the next chord state and whether the switcher should open. */
export function stepChord(
  pending: { key: string; at: number } | null,
  ev: ShortcutKeyEvent,
  now: number,
): { pending: { key: string; at: number } | null; open: boolean };
```

Rules (one test each): **S1** any modifier held ⇒ no-op, chord reset. **S2** `targetTag` in
`INPUT|TEXTAREA|SELECT` or `targetEditable` ⇒ no-op, chord reset (so typing "g" in the wall
chart's search box does nothing). **S3** `g` starts the chord. **S4** `c` within
`CHORD_TIMEOUT_MS` of `g` opens and resets. **S5** `c` after the timeout does not open. **S6** any
other key resets. **S7** `g` then `g` keeps the chord pending on the second `g` (a double-tap is
still a start). The component registers `window.addEventListener("keydown", …)` in a `useEffect`
with a cleanup, only when the list has more than one campaign, and only in organiser mode.

Discoverability, since a chord nobody knows is not "keyboard-reachable": the trigger button's
`title` and a `CommandShortcut` row in the popover both read **`G then C`**, and the trigger is a
plain focusable `<button>` so Tab + Enter reaches it without knowing the chord at all.

**Cost.** One list query, `staleTime: 60_000`, `enabled` only in organiser mode with a linked
organiser; plus (when WP1.3 is present) one RPC over ≤200 ids. The header already runs
`useCampaign` (`header-bar:108-110`). Risk **R5**.

### 2.7 Zero change in full mode — how it is proved

Three independent pins:

1. **The model.** `src/lib/campaign/__tests__/__snapshots__/workspace-tabs.test.ts.snap`, committed,
   holds the full-mode `CampaignNavModel` for both phase values (T1, T2). A change to any label,
   order, module or sub id fails it.
2. **The structural fixture.** `src/lib/campaign/__tests__/campaign-tabs-full-mode.fixture.ts` — a
   hand-written literal of the 8 tab ids + labels (from `page.tsx:442-451`) and the 20 sub ids +
   labels (from `:554-559`, `:610-612`, `:638-644`, `:792-795`), asserted equal to the registry in
   T1. Written by hand rather than derived, so it is a genuine second opinion.
3. **The header fixture.** `src/lib/campaign/__tests__/campaign-header-actions.fixture.ts` — the
   twelve rows of appendix D 3.3 as `{ id, label, gate, target, line }`, plus a test asserting
   (a) the fixture has 12 rows, 11 of them `gate: "canWrite"`, and (b) every row appears in the
   organiser-mode destination map of §2.5.2 with a non-empty destination. This is the
   "nothing removed" criterion as a test rather than a promise. It cannot check the rendered
   full-mode DOM (node environment, no React testing library in this repo — `vitest.config.ts:19`,
   and no `@testing-library/*` in `package.json`), which is why the e2e in §2.9 asserts the eight
   tab labels in a real browser.

Plus: the diff of `campaign-detail-header-bar.tsx` must not touch lines `141-228`, and the diff of
`page.tsx` must not touch lines `454-852`. Both are stated as review checks, and both are
mechanically visible in the PR.

### 2.8 Wizards keep the campaign header

`src/lib/campaign/campaign-detail-routes.ts` today: `NON_DETAIL_CAMPAIGN_SEGMENTS` (`:6-12`)
excludes `new|email-wizard|soc-wizard|phone-wizard|sms-tools`; `getCampaignIdFromPath` (`:19-27`)
returns `null` for them; `isCampaignDetailRoute` (`:41-45`) follows. `header.tsx:46-60` renders
`CampaignDetailHeaderBar` only when both are satisfied. Consequence, recorded as appendix D pain
point 9 (`:344`): the campaign name, back arrow and the three resume banners vanish mid-task.

**New pure function, in the same file** (the existing three are untouched, so every current caller
keeps its behaviour):

```ts
/** Query params a campaign-family wizard may carry its campaign in. */
export const CAMPAIGN_CHROME_PARAMS = ["cid", "campaign_id"] as const;

/** Wizard routes that keep the campaign header when they carry a campaign id.
 *  `new/manual` is excluded: it creates a campaign, it never edits one.
 *  `sms-tools` is excluded: it is a redirect (campaigns/sms-tools/page.tsx:17). */
const CHROME_WIZARD_PATHS = new Set([
  "/campaigns/new", "/campaigns/soc-wizard",
  "/campaigns/email-wizard", "/campaigns/phone-wizard",
]);

/**
 * The campaign whose header chrome this route should render, or null.
 * Detail routes answer from the path; the four campaign-family wizards answer
 * from ?cid= / ?campaign_id= so a wizard launched from inside a campaign keeps
 * the name, the back arrow and the resume banners. A standalone launch (no id)
 * stays chrome-less, exactly as today.
 */
export function campaignIdForChrome(
  pathname: string | null,
  search: URLSearchParams | string | null,
): string | null;
```

Rules (one test each, appended to
`src/lib/campaign/__tests__/campaign-detail-routes.test.ts`):

- **C1** `getCampaignIdFromPath(pathname)` non-null ⇒ return it. `/campaigns/12` → `"12"`,
  `/campaigns/12/plan` → `"12"`, `/campaigns/12/sms/chat/7` → `"12"`.
- **C2** `isStagePlanningRoute` ⇒ `null`, even with `?cid=` (the stage page draws its own header,
  `header.tsx:34-44`).
- **C3** pathname in `CHROME_WIZARD_PATHS` and a param in `CAMPAIGN_CHROME_PARAMS` parses to a
  positive integer ⇒ that id as a string. `/campaigns/new?cid=12&edit=1` → `"12"`;
  `/campaigns/soc-wizard?cid=12` → `"12"`; `/campaigns/new?campaign_id=12` → `"12"` (the planner
  wizard's param, `planner-wizard.tsx:170`); `/campaigns/soc-wizard?campaign_id=12` → `"12"`
  (`SocWizardSteps.tsx:76`).
- **C4** trailing slash tolerated (`/campaigns/new/?cid=12`); `cid` wins when both are present and
  differ (it is the one the campaign page itself emits, `page.tsx:823`, `header-bar:212`).
- **C5** no param, empty, `0`, negative, `abc`, `12abc`, or an array-ish `?cid=1&cid=2` (first
  value only) ⇒ `null`. A standalone `/campaigns/email-wizard` stays chrome-less.
- **C6** `/campaigns/sms-tools?cid=12` ⇒ `null`; `/campaigns/new/manual?cid=12` ⇒ `null`.
- **C7** the three existing functions are unchanged — the current test file's three cases
  (`campaign-detail-routes.test.ts:7-24`) keep passing untouched.

**`header.tsx`.** It reads only `usePathname()` today. Reading `useSearchParams()` in the same
component would force the whole shell into client-side rendering at build time, so the read is
isolated in a child inside the `<Suspense>` boundary the file already has (`:48-59`):

```tsx
// header.tsx
if (isStagePlanningRoute(pathname)) { /* :34-44 unchanged */ }

return (
  <Suspense fallback={<HeaderFallback pathname={pathname} />}>
    <HeaderBody pathname={pathname} />
  </Suspense>
);

// new, same file: the only component that calls useSearchParams()
function HeaderBody({ pathname }: { pathname: string }) {
  const search = useSearchParams();
  const campaignId = campaignIdForChrome(pathname, search);
  if (campaignId) return <CampaignDetailHeaderBar campaignId={campaignId} />;
  const basePath = "/" + (pathname.split("/")[1] || "");
  return <TitleHeader title={pageTitles[basePath] || "Offshore Alliance"} />;   /* :64-76 */
}
```

`pageTitles` (`:13-30`) is untouched here — WP1.2 owns its corrections
(`/tmp/oux-plans/wp1.2.md:364-386`), including the `/actions` entry.

**Incidental finding, not fixed here.** `page.tsx:823` links to
`/campaigns/soc-wizard?cid=${campaignId}` and `PhoneWizardSteps.tsx:1783` does the same, but
`SocWizardSteps.tsx:76` reads only `campaign_id`, so the SOC wizard never pre-fills the campaign
it was launched from. Accepting both params in `campaignIdForChrome` makes the *header* correct
either way; fixing the wizard's own pre-fill is a one-line change in someone else's file and is
listed in §3.

### 2.9 Rendering: the five slots in `page.tsx`

New file `src/components/campaigns/campaign-tab-bar.tsx` (client). It is the only new component
the page mounts.

```tsx
export function CampaignTabBar(props: {
  campaignId: string;
  canWrite: boolean;
  model: CampaignNavModel;
  /** Which cluster's sub-row to draw in full mode; null for the top row. */
  cluster: "top" | "plan" | "outcomes" | "workforce" | "outreach";
  onNavigate: (ref: CampaignSurfaceRef) => void;
  hasPlan: boolean;
  onImportWorkers: () => void;
}): JSX.Element | null;
```

- **Full mode, `cluster: "top"`** ⇒ returns today's `<TabsList className="flex flex-wrap h-auto
  gap-1">` with the eight `TabsTrigger`s, labels and phase gate taken from `model.tabs`. The
  markup is copied from `page.tsx:441-452`; the only difference is that the labels come from the
  registry rather than being inline strings, which is what T1's fixture pins.
- **Full mode, the four cluster values** ⇒ today's `<TabsList className="mb-4">` for that cluster,
  including the two badge-carrying triggers, which stay as the existing local components
  `PendingReviewTabTrigger` (`page.tsx:882-894`) and `RoleCheckTabTrigger` (`:899-911`) — they are
  **exported** from `page.tsx` (or, cleaner, moved verbatim into
  `src/components/campaigns/plan-tab-triggers.tsx` and imported by both) so the count badges keep
  working unchanged.
- **Organiser mode, `cluster: "top"`** ⇒ a `<nav aria-label="Campaign sections">` of four
  `<button>`s (styled with the same classes the `TabsTrigger` uses so the two modes look like one
  product) + a `DropdownMenu` labelled `ORGANISER_TAB_LABELS.more`, grouped by registry tab, with
  muted items rendered `disabled` and captioned "Ask an admin to enable"; then, below it, the
  active tab's sub-row (Activity's seven, Setup's two, or nothing) as a second `<nav>`; then, for
  Setup, `<CampaignSetupCards/>`.
- **Organiser mode, the four cluster values** ⇒ `null`. The per-cluster Radix `TabsList` is not
  drawn; the `Tabs` wrapper and its `value` stay, so the correct `TabsContent` still renders.

`page.tsx` diff, five hunks and nothing else in the JSX:

| page.tsx | Today | After |
|---|---|---|
| `:441-452` | inline `<TabsList>` + 8 triggers | `<CampaignTabBar cluster="top" … />` |
| `:553-560` | inline `<TabsList>` + 6 triggers | `<CampaignTabBar cluster="plan" … />` |
| `:609-613` | inline `<TabsList>` + 3 triggers | `<CampaignTabBar cluster="outcomes" … />` |
| `:637-645` | inline `<TabsList>` + 7 triggers | `<CampaignTabBar cluster="workforce" … />` |
| `:791-796` | inline `<TabsList>` + 4 triggers | `<CampaignTabBar cluster="outreach" … />` |

Plus, in the component body:

- `:238` — `const { mode, enabledModules, moduleState } = useWorkspace();` alongside `useAuth()`.
- `:238` — `const { isMobile } = useDevice();` (already used by `WorkforceBoard`,
  `workforce-board.tsx:32-33`) so `activeView = resolveWorkforceView(searchParams.get("view"),
  isMobile)` can be passed to the resolver (V7/T10).
- after `:191` — `const navModel = useMemo(() => resolveVisibleTabs({ mode, enabledModules,
  moduleState, phase: campaign?.current_phase ?? null, hasPlan, active: { tab: activeTab, sub:
  activeSub }, activeView }), [...])`. `campaign` is fetched at `:276-288`; the memo runs before
  the early returns at `:397-419` only if it is placed above them — it must be, because hooks
  cannot be conditional. `campaign` is `undefined` during load, which V2/V8 handle (`phase:
  null` ⇒ Bargaining hidden, which is also what `page.tsx:449` renders during load today).
- `:213-237` — `handleTabChange`/`handleSubChange` are kept as they are (full mode uses them via
  the Radix `Tabs onValueChange`). One new sibling `handleNavigate(ref: CampaignSurfaceRef)` that
  writes `tab`, `sub` and `ref.params` in one `router.replace`, so an organiser-mode click is a
  single history entry rather than the two a `tab`-then-`sub` pair would make.
- `:281` — the select gains `, campaign_stage_plans(plan_id)` (§2.1.4).

**Everything from `:454` to `:852` is untouched**, including `OutreachCleanupPanel` (`:833-835`),
which keeps rendering under any Outreach sub-tab in both modes.

Analytics: `trackCampaignTabOpened` (`:261-267`, `src/lib/analytics/events.ts:96-113`) is
untouched. It already instruments the *resolved* surface, which is mode-independent — exactly what
is wanted for a before/after comparison. Adding a `mode` property to the event would change a
WP0.2 contract and is out of scope (§3).

### 2.10 e2e — `tests/e2e/organiser-campaign.spec.ts`

Follows WP1.2's spec structure exactly (`/tmp/oux-plans/wp1.2.md:466-551`), including the
`E2E_ADMIN_*` additions to `tests/e2e/env.ts` (if WP1.2 has landed they already exist; if not,
this package adds them with the identical names and skip message). `E2E_BASE_URL` is the branch's
Vercel preview; no agent runs the app locally (`PROGRESS.md` standing note). Credentials come from
the environment; no agent types them into a form.

**Test 1 — full mode, the eight tabs** (`test.skip(!hasE2ECredentials, …)`; default storage state
is the `user` account, whose resolved mode is `full`):

```ts
await page.goto("/campaigns/1?tab=workforce&sub=wall-chart");
const tabs = page.locator('[role="tablist"]').first().locator('[role="tab"]');
await expect(tabs).toHaveText([
  "Overview", "Plan & Execution", "Section Plans", "Workforce",
  "Outcomes", "Outreach", "Library",           // + "Bargaining" only at that phase
]);
await expect(page.getByRole("button", { name: "New action" })).toHaveCount(0);
```

**Test 2 — the organiser-mode round trip** (`test.skip(!hasE2ECredentials ||
!hasE2EAdminCredentials, …)`). Admin context signs in, finds the user via
`GET /api/admin/users`, `PATCH /api/admin/update-user` with `{ workspacePrefs: { mode:
"organiser" } }` (`src/app/api/admin/update-user/route.ts:93-99, 161`), then the user page
**reloads** (`AuthProvider.fetchProfile` caches `workspace_prefs` at sign-in), and:

1. four tabs + More — `await expect(nav.locator("button")).toHaveText(["Wall chart", "People",
   "Activity", "Setup", "More"])`.
2. open More, assert the enabled-module items and at least one `disabled` item captioned
   "Ask an admin to enable".
3. deep link `?tab=plan&sub=pending-review` and assert the Pending review panel renders
   (`PendingReviewTab`'s heading) **and** that the More trigger reads "Pending review" — the §2.2
   rule, measured in a browser.
4. deep link each of the four `REDIRECT_MAP` keys `wall`, `universe`, `workplan`, `tasklists` and
   assert the URL rewrites to the documented pair and the surface renders.
5. press `g` then `c` and assert the switcher listbox appears (or, when the account owns exactly
   one campaign — which the dev seed makes likely, `PROGRESS.md`: "campaign 1 … so the e2e account
   owns one active campaign" — assert the plain label and **no** listbox; the spec branches on the
   rendered control, which is itself the single-campaign acceptance criterion).
6. header: "New action" opens a menu with Call list / SMS / Email / Task list / Assessment; "Build
   list" toggles `?buildList=1`; the ⋯ menu lists the five demoted actions.

`finally` ⇒ `PATCH /api/admin/update-user` with `workspacePrefs: null`, which parses to `{}` and
clears the override (`route.ts:93-99`). This matters: the dev database is shared and leaving the
account in organiser mode would change what `wall-chart.spec.ts` sees.

### 2.11 Terminology (plan 3.6 and 5.4)

| Used | Instead of | Where |
|---|---|---|
| **Wall chart** | Wall Chart, wall-chart | `ORGANISER_TAB_LABELS.wall_chart` |
| **People** | List view, Workforce list | `ORGANISER_TAB_LABELS.people` |
| **Activity** | Outreach, Comms | `ORGANISER_TAB_LABELS.activity` |
| **Setup** | Settings, Configure | `ORGANISER_TAB_LABELS.setup` |
| **More** | Overflow, Other | `ORGANISER_TAB_LABELS.more` |
| **New action** | Create Phone Call / Create Email / Create SMS | header menu label |
| **Build list** | Build ▾ | header toggle |
| **Who's in** | universe, scope, target universe (plan 3.6 `:126`) | Setup sub-tab; already the label at `page.tsx:640` |
| **Unit** | organising unit, OU, campaign unit (plan 3.6 `:127`) | Setup sub-tab label "Units" (today's trigger says "Campaign Units", `page.tsx:639`; the full-mode label is **not** changed — only the organiser-mode Setup label uses "Units", so the full-mode fixture stays byte-identical) |
| **Strategic plan** | Campaign plan, P2W, Plan & Execution (plan 3.6 `:129`) | More group heading and the Setup card; the full-mode tab keeps "Plan & Execution" |
| **Ask an admin to enable** | "Not available", "Locked" | muted More items; identical wording to WP1.2 |
| **All campaigns** | Back to campaigns | switcher footer item |

The rule the implementer must hold: **organiser-mode labels use plan 3.6 words; full-mode labels
are frozen at today's strings.** Renaming a full-mode tab would fail T1 and is not this package's
job (WP2.7 renames Units, WP3.3 renames the plan cluster).

### 2.12 Verification

From `apps/organising-db`:

| Command | Proves |
|---|---|
| `pnpm exec vitest run src/lib/campaign/__tests__/workspace-tabs.test.ts` | criteria 1, 3, 7 (T1–T10) |
| `pnpm exec vitest run src/lib/__tests__/campaign-tabs.test.ts src/lib/campaign/__tests__/campaign-detail-routes.test.ts src/lib/campaign/__tests__/switcher-shortcut.test.ts` | criteria 2, 5 (shortcut), 6 (wizard chrome) |
| `pnpm test` | the whole suite; must be ≥ the 732 passing recorded for WP0.2 (`PROGRESS.md` ledger) with no new failures |
| `pnpm lint` | every touched file lints clean on its changed lines; total error count must not rise above the 143/151 baseline (`PROGRESS.md` standing note) |
| `pnpm build` | the five `page.tsx` hunks and the `header.tsx` Suspense split compile; no route flips to static-render bail-out |
| `E2E_BASE_URL=<branch preview> pnpm e2e` | criteria 4, 5, 8 — the four tabs, More, the deep links, the switcher, and full mode's eight tabs, in a browser |

No schema change: this package adds no migration and runs no type regeneration. If WP1.3 has not
merged, the switcher's fallback query needs none either.

### 2.13 Risks and the rules they could break

| # | Risk | Mitigation | Rule at stake |
|---|---|---|---|
| **R1** | `page.tsx` is 930 lines; an edit that reaches past the five `TabsList` slots silently changes full mode. | The change is a wrapper in five slots (§2.9); the review check is "the diff does not touch `:454-852`"; T1's snapshot + the hand-written fixture catch a label or order change. | "Full mode keeps working." |
| **R2** | The 45-row fixture drifts as features land (Relays was already missed by the appendix). | T8 asserts registry ↔ fixture in both directions, so adding a sub-tab without a fixture row fails; the fixture cites the appendix line per row so a reviewer can re-derive it. | Acceptance criterion. |
| **R3** | The `g`-`c` chord fires while the user is typing, or a future global palette claims it. | Pure `stepChord` with S1/S2 guarding modifiers and editable targets, tested; the audit in §2.6 records that no global handler exists today, so a future one must read this file. | — |
| **R4** | `?view=` is shared by `WorkforceBoard` and `ActivistsWocsSection`; the People tab writes `view=list`. | The two never mount together (different `?sub=`) and each ignores unknown values (`workforce-view.ts:21-23`, `activists-wocs-section.tsx:42-44`); T10 pins the People/Wall-chart split; the organiser tabs always write `?view=` explicitly. | URL compatibility. |
| **R5** | The switcher adds a query to every campaign page load. | `enabled` only in organiser mode with a linked organiser; `staleTime: 60_000`; ≤ 1 query (+1 RPC when WP1.3 is present) shared across the session by the React Query key; the plain-label branch (1 or 0 campaigns) mounts no popover and registers no listener. | Performance. |
| **R6** | The three orchestrators may not compose as `DropdownMenuItem` triggers (§2.5.2). | Stated as a verify-then-fall-back instruction with a named fallback (`open`/`onOpenChange` or a standalone button) and a requirement to record it under Deviations. | Nothing removed. |
| **R7** | `useSearchParams()` in `header.tsx` could bail a route out of static rendering. | The read is inside the existing `<Suspense>` boundary (`header.tsx:48-59`) in a child component; `pnpm build` is the check. Every route in this app is already dynamic (`PROGRESS.md` standing note). | Build green. |
| **R8** | WP1.2 or WP1.3 land after this package, so the imports (`MY_CAMPAIGNS_HREF`, `useMyCampaigns`, `campaign_last_activity`) do not exist. | Both are single-seam with a stated literal fallback (§1.3, §2.6); neither is on the critical path of any acceptance criterion. | Sequencing. |
| **R9** | An organiser deep-linked to a `hidden` module sees a surface with no matching tab and feels lost. | §2.2: the More trigger renders active with the surface's label; the four tabs are still there; WP1.2's "Show everything" is one tap away via `MobileNav`, which the header keeps in both modes (`header-bar:239`). | Plan §4 principle 4. |

---

## 3. Out of scope

Things this planner was tempted to include and did not:

1. **The Activity chronological list.** Plan 5.4 asks for "one chronological list with type chips"
   across ratings, calls, SMS, email, lists and tasks. That is a new union query over five tables;
   WP1.5 builds the standalone-action version (`hub-rows.ts`) and WP3 owns the campaign-linked
   one. Activity here is a tab over the seven existing surfaces, and §2.1.3 says so in those words.
2. **In-place editors for the Setup cards.** Organisers and Basics link to
   `/campaigns/[id]/plan#campaign-team` and `/campaigns/[id]/settings`. Building "a card that
   edits in place" (plan 5.4 `:270`) needs the setup checklist and the create/configure split —
   WP3.1 and WP3.2.
3. **`campaign_organisers` UI.** No CRUD is added; the existing Campaign Team card
   (`plan/page.tsx:352-420`) gains one `id` attribute and nothing else. Who may assign whom is
   decision 8, implemented in WP1.6.
4. **The guides manifest.** Contextual help inside the campaign (appendix D 10 item 12) is WP1.7.
5. **Renaming any full-mode label.** "Campaign Units" → "Units", "Plan & Execution" → "Strategic
   plan", "Wall Chart / List" → "Wall chart" all belong to WP2.7/WP3.3, and criterion 7 forbids
   them here.
6. **Retiring the Overview tab, the SOC card, or any header action.** Decision 7 amended:
   demote, never delete. Every one of the twelve has a home in §2.5.2.
7. **A campaign-level "Show everything".** WP1.2 owns the one control, in the sidebar footer; the
   campaign page consumes the resolved mode. A second control would be a second definition and
   would break plan §4 principle 3's two-disclosure-level rule.
8. **A `mode` property on `campaign_tab_opened`.** WP0.2 fixed that event's shape
   (`src/lib/analytics/events.ts:78-113`) and its props are asserted by existing tests; widening
   it is a separate, deliberate change.
9. **Server-side "last opened" recency.** `user_campaign_prefs` is WP2.1. §2.6 uses activity
   recency (WP1.3's RPC) or creation order, and says why not `updated_at` and not `localStorage`.
10. **Fixing the SOC wizard's `cid` vs `campaign_id` mismatch** (`page.tsx:823` /
    `PhoneWizardSteps.tsx:1783` send `cid`; `SocWizardSteps.tsx:76` reads `campaign_id`). The
    header is made correct for both; the wizard's own pre-fill is someone else's file and a
    separate one-line change. Recorded here so it is not lost.
11. **Mobile-specific tab layout.** The organiser bar inherits the page's `flex-wrap`
    (`page.tsx:441`); the sub-tab rows' overflow on phones (appendix D 8, "no wrap class") is
    WP4.1's.

---

## 4. Open questions

Only the two the operator must answer; everything else is an assumption stated in place.

- **Q1 — Should Pending review and Role check be `wall_chart_people` rather than
  `strategic_plan`?** The brief specifies `strategic_plan`, and this plan follows it. The
  consequence (§2.1.2, note 1) is that the dashboard widget's deep link
  (`pending-review-widget.tsx:127`) and WP1.3's Needs-attention cards land an organiser on a
  surface that is behind More. Both still render (§2.2), so nothing breaks — but if the operator
  wants an organiser's rating-review queue to be a first-class part of the default organiser
  workspace, the fix is two `module:` values in `CAMPAIGN_TAB_REGISTRY` and one fixture update.
  **Assumption if unanswered: follow the brief (`strategic_plan`).**
- **Q2 — Should the campaign switcher also appear in full mode?** Plan 5.4 puts it in the
  organiser header and criterion 7 requires full mode to be byte-for-byte today, so this plan
  ships it in organiser mode only. Appendix D 6 (`:308`) records that there is no global switcher
  at all today and that "inside a campaign the only way to another campaign is Back → the list",
  which is a full-mode pain point too. Adding it to full mode is one condition removed in
  `campaign-detail-header-bar.tsx` and one line in the full-mode e2e assertion.
  **Assumption if unanswered: organiser mode only.**

---

## 5. Orchestrator approval

_(to be completed by the orchestrator)_

## 6. Deviations from plan

_(to be completed by the implementer)_

## 7. Verification output

_(to be completed by the implementer)_

## 8. Reviewer findings

_(to be completed by the reviewer)_

## 5. Orchestrator approval

**Approved 2026-09-09.** Q1: split the pair — `pending-review` → `strategic_plan` (it reviews plan ambitions), `role-check` → `wall_chart_people` (it is about workers); both always render on deep link. Q2: switcher organiser-mode only; full mode byte-identical. Accepted: Overview → `insights` (muted, not hidden); People = `sub=wall-chart&view=list`; Activity honestly a tab over the seven existing surfaces (the chronological list is later work); the 45-surface fixture with the appendix's undercount flagged; `g` then `c` shortcut; recency from WP1.3's function when merged, else `created_at`. The SOC-wizard `cid`/`campaign_id` mismatch is recorded as an incidental finding for the ledger and stays out of scope. Branch `feat/oux-wp1.4-campaign-workspace`, stacked on the phase-1 tip; PR base `develop`. Reviewer tier: opus.

## 6. Deviations from plan

Twelve, all small; nothing in §2 was skipped.

1. **`ResolveVisibleTabsInput` has no `enabledModules`.** §2.1.4 listed it beside `moduleState`, but
   rule V4 forbids deriving a state from it ("never re-derived from `adminOnly` or from
   `enabledModules` directly"), so the field would have been dead weight the next reader has to
   rule out. The orchestrator brief's own signature — `{mode, moduleState, hasPlan, phase}` —
   omits it too. The resolver takes `moduleState` and nothing else about modules.
2. **Q1 was split, per the §5 approval.** The plan's §2.1.2 table put both review queues on
   `strategic_plan`; the approval moved `role-check` to `wall_chart_people`. Implemented as
   approved. The visible consequence: for an organiser on the default module set Role check is
   the one **live** item in More, and Pending review is the muted one — which is what the e2e
   asserts.
3. **R6 did not fire, and needed no fallback.** `CreatePhoneCallOrchestrator`,
   `CreateEmailOrchestrator` and `CreateSmsOrchestrator` are no longer dialogs: each is
   `trigger ? <Link href={href}>{trigger}</Link> : <Button asChild>…` (e.g.
   `CreatePhoneCallOrchestrator.tsx:30-35`). Passing a `DropdownMenuItem` as `trigger` therefore
   produces a menu item inside an anchor — one navigation per click, nothing to keep open, and no
   `onSelect`-preventDefault needed. The `open`/`onOpenChange` fallback the plan named was not
   used. Assessment and Task list are still `useState` + `open`, as planned.
4. **`useSwitcherCampaigns()` takes no argument.** The plan sketched a `{ data, isLoading }` seam
   with two implementations; WP1.3 is merged, so only the `useMyCampaigns()` branch exists and
   the fallback query was not written. The hook is only ever mounted in organiser mode (the header
   renders `CampaignSwitcher` nowhere else), so an `enabled` parameter would have been a second,
   weaker statement of that fact.
5. **`MY_CAMPAIGNS_HREF` is imported, not literalised.** §2.6 allowed the literal `"/campaigns"`
   if `nav-model.ts` did not exist; it does (WP1.2 is merged), so the constant is imported and the
   switcher's "All campaigns" item follows WP1.3's flip for free.
6. **One exported helper the plan did not name: `labelForSurface(tab, sub)`.** V7's
   `activeMoreLabel` and the More menu's sub-item labels both need "the registry label of this
   surface", and writing it twice is how the two drift apart.
7. **The More trigger reads `More · <label>`, not `<label>`.** §2.2 says the trigger "renders in
   its active state carrying `activeMoreLabel`". Replacing the word "More" would have made the
   control unfindable for a user who is looking for More; appending it keeps both. Full text at
   `?tab=plan&sub=pending-review` is "More · Pending review".
8. **The Setup tab's Basics card links straight to `/campaigns/[id]/settings`** and is labelled
   "Basics & all settings", rather than reaching into the header bar's `CampaignBasicsEditSheet`.
   §2.1.3's own table already specified the link; the sheet stays where it is, opened by the
   pencil, so there is exactly one mount of it.
9. **The two count-badged Plan triggers moved to a new file.** §2.9 offered "exported from
   `page.tsx` (or, cleaner, moved verbatim into `src/components/campaigns/plan-tab-triggers.tsx`)";
   the second was taken. The markup, the query keys and the badge variant are byte-identical.
10. **`page.tsx` line numbers in §2 are stale by about seven lines.** The working tree is 937
    lines, not 930 — WP1.6 added `useCanWriteToCampaign` and its comment block above the JSX. The
    five slots were located by their markup rather than by line number. Same drift, two or three
    lines, in `campaign-detail-header-bar.tsx`; `campaign-header-actions.fixture.ts` records the
    appendix's numbers with a note saying so.
11. **The three §2.7 fixtures exist as separate files; their tests live in
    `workspace-tabs.test.ts`.** One suite, one snapshot file, so a reviewer reads the coverage
    census and the full-mode model side by side. T1–T10 are all present and labelled; extra cases
    (T2b, T6b, and one per V-rule) were added rather than removed.
12. **The e2e switcher locator is `button[aria-haspopup="listbox"]`, not an accessible name.**
    The trigger's accessible name is the campaign name (its content wins over `title`), which
    varies with the seed data. `aria-haspopup="listbox"` is the affordance the component itself
    declares, so it is a product anchor, not a test hook. No `data-testid` was added anywhere.

Not deviations, but worth stating so the reviewer does not go looking:

- No migration, no `gen:types`, no new dependency, no `supabase/.temp/*` staged. `Popover`,
  `Command` and `DropdownMenu` were already in `src/components/ui`.
- The diff of `campaign-detail-header-bar.tsx` does not touch the full-mode `actionButtons`
  literal: the only edits are the imports, three added lines of state/mode, the `!canWrite ? null
  : isOrganiserMode ? … : (` branch above it, the `) : null;` → `);` below it, and two
  organiser-only blocks.
- The diff of `page.tsx` touches the five `TabsList` slots, the imports, three hook additions, one
  `select`, one interface field, and the deletion of the two trigger components. No `TabsContent`
  child was edited. _(Fix round 1 amends this: every one of the 28 `TabsContent` opening tags now
  carries `{...panelName(…)}`, which spreads `{}` in full mode. No child was edited.)_
- `trackCampaignTabOpened` is untouched: it instruments the resolved surface, which is
  mode-independent, which is exactly what a before/after comparison wants.

### Fix round 1

Reviewer round 1: one e2e failure and thirteen advisories. All applied except where noted.

**E1 — the Build list locator collided.** `getByRole('button', { name: 'Build list' })` matched
both the toggle and the wall chart's own `aria-label="Close build list panel"` icon button, whose
name contains the substring. Now `{ name: 'Build list', exact: true }`. The audit the finding
asked for: `"New action"` is now `exact` too (harmless, no collision existed); the two `"More"`
locators stay non-exact **on purpose** — one is scoped to `nav[aria-label="Campaign sections"]`,
where nothing else can match, and the other is deliberately a `/More/` regex because the trigger
reads "More · Pending review" at that point in the test.

**A second, latent e2e defect the fix exposed.** With the locator corrected the test ran on to the
last two steps and hit Playwright's default 30-second per-test timeout — and the timeout disposed
the context *before* the `finally` could clear the account's organiser-mode override, which is
exactly the failure mode that `finally` exists to prevent. The test does seven full page loads and
two admin round trips against a cold preview; it was inside budget only because it used to abort
early. `test.slow()` (90s) is now set on it. This was never a product bug and would have surfaced
on any green run.

| # | Advisory | What changed |
|---|---|---|
| 3 | the `g`-then-`c` chord fired inside dialogs | `switcher-shortcut.ts` gains rule **S8** and two event fields, `inDialog` (target inside `[role="dialog"]`) and `dialogOpen` (any `[role="dialog"][data-state="open"]` in the document — Radix portals to `<body>`, so the target test alone is not enough). Four new cases in `switcher-shortcut.test.ts`. |
| 4 | "All campaigns" went to `/my-campaigns` | The switcher now has **two** rows: "My campaigns" → `MY_CAMPAIGNS_HREF` and "All campaigns" → the new `ALL_CAMPAIGNS_HREF` in `nav-model.ts`, which `DEFS.campaigns` also uses so the label and the path cannot drift. No test pinned the old behaviour. |
| 5 | `MUTED_REASON` was declared twice | `campaign-tab-bar.tsx` imports it from `@/lib/nav/nav-model`. |
| 6 | muted More items had no `title`, no `sr-only` | They now carry both, as `nav-row.tsx` does. The visible caption is `aria-hidden` so the sentence is announced once, not twice — nav-row has no visible caption to compete with, which is the one difference. |
| 7 | organiser-mode tabpanels had a dangling `aria-labelledby` | Radix names a panel from its trigger; organiser mode renders a `<nav>` of plain buttons instead, so the reference pointed at nothing. `page.tsx` gains `panelName(tab, sub?)`, spread onto all 28 `TabsContent`, which returns `{"aria-label": <registry label>}` in organiser mode and **`{}` in full mode** — no attribute, no markup change. `labelForTab()` is new in `workspace-tabs.ts`: `labelForSurface("plan", null)` answers "Strategy" (where the URL lands), and the cluster panel wants "Plan & Execution". |
| 8 | the campaign name rendered twice in organiser mode | The static `<h1>` block is omitted in organiser mode; the status pill, the type pill, the pencil and the dates stay. To keep the page's only `<h1>`, `CampaignSwitcher` now *is* the heading in both its branches — `<h1>label</h1>` collapsed, `<h1><button…></h1>` with the popover — styled as the heading it replaces. Full mode renders no switcher, so its `<h1>` is untouched. |
| 9 | the e2e's redirect coverage was overstated | See the deviation recorded below. |
| 12 | organiser-only code shipped to full-mode users | `CampaignSwitcher`, `OrganiserCampaignActions` and `CreateTaskListDialog` are `next/dynamic` in `campaign-detail-header-bar.tsx`. All three sit behind `isOrganiserMode`, so full mode never mounts the lazy boundary and its markup is unchanged. Applied, not skipped. |
| 13 | the SMS-episode redirect could fire mid-wizard | `isCampaignChromeWizardRoute()` is exported from `campaign-detail-routes.ts` (and `campaignIdForChrome` now uses it, so there is one copy of the path-normalising rule), and the effect returns early on those four routes. Two new cases, C7. See the deviation below for the visible full-mode change this package made and did not state. |
| 14 | the More trigger rendered with an empty menu | `model.more.length > 0` gates it. |
| 1, 2, 11 | three overclaims in §6a and one wrong cost comment | §6a's "Nothing is unreachable" is replaced by the count (1 of 14 More items live on the default module set); the header-action mapping now says plainly that the unit test is a two-literal comparison and the e2e is what proves ten of the twelve controls exist; `useSwitcherCampaigns.ts`'s "no query of its own" is corrected — mounting it mounts `useMyCampaigns` and `useCampaignLastActivity`, two queries, shared keys and `staleTime: 60_000`. |

Nothing was skipped. Advisory 10 asked for no change beyond the doc corrections above.

**Two further deviations, recorded as §6 asks.**

13. **Full-mode users now see the campaign header above the four wizards.** This is intended and
    it is visible: `/campaigns/new`, `/campaigns/soc-wizard`, `/campaigns/email-wizard` and
    `/campaigns/phone-wizard`, launched with `?cid=` or `?campaign_id=`, now render the full
    campaign header — the campaign name, the back arrow, all twelve actions in full mode's
    arrangement, and the three resume banners — above the wizard's own steps. That is appendix D
    pain point 9 being fixed, but §6 never said out loud that a full-mode user's wizard pages
    gained a header they did not have yesterday. They did.

9. **The e2e's redirect step proves the URL rewrite, not the render.** Step 4 walks the four
   legacy `?tab=` values and asserts two things per value: that the URL rewrites to the documented
   `tab=&sub=` pair, and that the organiser nav is visible on the resulting page. It does not
   assert that each of the four target surfaces rendered its own content — only one surface's
   render is proven anywhere in the spec, at step 3 (`?tab=plan&sub=pending-review`, asserted by
   its empty-state text). Four rewrites, one render.

### Fix round 2

Reviewer round 2: four advisories (2, 3, 5, 6), no failing test. All four applied; each was
checked against the file before it was touched, and all four claims held.

**2 — the organiser-mode reset now runs from `test.afterEach`.** The reset was in a `finally`
inside the test body, which is precisely what a Playwright timeout does not reach: on timeout the
runner disposes the test's contexts and unwinds, so the one failure mode the reset exists for was
the one it did not cover. The admin `BrowserContext` and the e2e user's id are now describe-scoped
`let`s, filled by `test.beforeAll` and closed by `test.afterAll`; `test.afterEach` does the
`PATCH … workspacePrefs: null` and then the `GET /api/admin/users` read-back, still asserted
(`workspace_prefs must be exactly {}`), still not fire-and-forget. `test.slow()` is unchanged. The
docblock's claim that "its `finally` ALWAYS clears the override" is replaced by the hook and by
the reason it is a hook. `beforeAll` returns early without credentials, so the credential-less
`pnpm e2e` still skips all twelve and exits 0.

**3 — `panelName()` reads the model on screen, not the full-mode registry.** New pure export in
`workspace-tabs.ts`:

```ts
export function panelLabelFor(
  model: CampaignNavModel,
  surface: { tab: string; sub: string | null },
): string | null;
```

Four rules, in order: the **lit control** wins (which is what settles Wall chart vs People — one
registry pair, two organiser tabs, split by `?view=`); a **cluster** panel (`sub: null`) answers
with the lit *tab*, so the outer panel reads "Activity" and the inner one "Comms" rather than both
saying "Comms"; otherwise the panel is named by the control `findSurface` finds it under, in
`tabs`, in a tab's `subs` or in **More**; and a surface in none of those — a deep link to a hidden
module, which still renders — falls back to the registry label, which is also what the More
trigger shows. Full mode returns `null` and `page.tsx` spreads `{}`, so its markup is unchanged.
The visible difference: an organiser's Units panel is now announced "Units", not "Campaign Units",
and the workforce cluster is "Wall chart" / "People" / "Setup", not "Workforce".

Seven new cases in `workspace-tabs.test.ts` (P1–P7): full mode names nothing; the Wall
chart/People split, both directions; cluster vs sub-panel; Units over Campaign Units, active and
inactive; a More surface named as More names it; a hidden-module deep link named anyway; and
totality — every level-1 and level-2 fixture row plus every registry cluster gets a non-empty
name, both on the default modules and with every module hidden. `labelForTab` and `labelForSurface`
are no longer imported by `page.tsx`; they stay exported, used by the resolver and the tests.

**5 — the lazy switcher no longer resolves to nothing.** Confirmed on the file: the round-1
`next/dynamic` call had no `loading` option, so it rendered `null` until the chunk arrived, and
since round 1 also deleted the static `<h1>` block in organiser mode the page had **no heading at
all** during that window (a client-side navigation into a campaign; a full load server-renders the
switcher). `next/dynamic`'s `loading` component takes no props and so cannot carry the campaign
name, so `CampaignSwitcher` is now `React.lazy` inside a `<Suspense>` whose fallback does:
`<h1 className={SWITCHER_HEADING_CLASS}>{campaign?.name ?? "Campaign"}</h1>` — the same string the
real collapsed branch shows, including its "Campaign" placeholder for a name that has not loaded.
The classes live in the new one-line module
`src/components/campaigns/campaign-switcher-heading.ts`, imported by both the header bar and the
switcher, so the fallback and the heading it stands in for cannot drift; importing it pulls in no
Popover and no cmdk, so the switcher stays lazy and full mode still ships none of it. The other
two lazy components (`OrganiserCampaignActions`, `CreateTaskListDialog`) are untouched and stay on
`next/dynamic`: neither is a heading. Full mode renders no switcher in either arrangement, so its
markup is unchanged — pinned by test 1 of the e2e, which passed on the current preview.

**6 — the reading order is back arrow, heading, badges.** Confirmed: round 1 put the switcher
*before* the back button, so organiser mode read "testco1, Back to campaigns, …" while full mode
read "Back to campaigns, testco1, …". The switcher now sits between the back button and the
badges block. Both e2e tests assert it, and no product markup was added to make them able to: a
CSS selector list matches in document order, so `page.locator('header button[aria-label="Back to
campaigns"], header h1').first()` is whichever of the two the DOM puts first, and the assertion is
that it carries the back arrow's `aria-label`. Each test also asserts `header h1` has count 1,
which is the round-1 "exactly one heading" claim pinned for the first time.

**What the credentialled run on the current preview can and cannot prove.** Items 3, 5 and 6 are
product changes and need the *next* preview; the preview named in §7 run 2 predates them. Run
against it (`E2E_BASE_URL=https://offshore-alliance-m0baab8ek-reveille-strategy.vercel.app pnpm
e2e tests/e2e/organiser-campaign.spec.ts`), test 1 passed — including the new order and
single-`h1` assertions, which is the evidence that full mode's header is untouched — and test 2
failed at the new step 1b exactly as the old build should:

```
Locator:  locator('header button[aria-label="Back to campaigns"], header h1').first()
Expected: "Back to campaigns"
Received: ""
    7 × locator resolved to <h1 class="min-w-0 truncate…">testco1</h1>
```

That failure is the reviewer's finding 6 reproduced against the deployed build. It also proves
item 2 on the only evidence available without a database read: the test aborted mid-body and the
run reported **no `afterEach` error**, so the hook ran and both of its assertions — the reset's
`ok()` and `workspace_prefs must be exactly {}` — passed. The cost is honest: because step 1b now
fails on that preview, steps 2–6 of the round trip were not exercised this round, and the spec
cannot be proven end-to-end again until the next preview is up.

### Incidental finding for the ledger

`page.tsx` links to `/campaigns/soc-wizard?cid=${campaignId}` and `PhoneWizardSteps.tsx:1783` does
the same, but `SocWizardSteps.tsx:76` reads only `campaign_id`, so the SOC wizard never pre-fills
the campaign it was launched from. `campaignIdForChrome` accepts both names, so the **header** is
correct either way; the wizard's own pre-fill is a one-line change in someone else's file and
stays out of scope, as the approval directed.

## 6a. Implementer notes

### Files

New (15, the last added in fix round 2):

| Path | What |
|---|---|
| `src/lib/campaign/workspace-tabs.ts` | the resolver, `resolveVisibleTabs` / `findSurface` / `moduleForSurface` / `labelForSurface` / `activeOrganiserTabId`, pure |
| `src/lib/campaign/switcher-shortcut.ts` | the `g`-then-`c` chord, pure |
| `src/lib/hooks/useSwitcherCampaigns.ts` | the switcher's recency-sorted list, over `useMyCampaigns` + `campaign_last_activity` |
| `src/components/campaigns/campaign-tab-bar.tsx` | the five slots: full-mode `TabsList`s, or the organiser bar + More + Setup cards |
| `src/components/campaigns/campaign-switcher.tsx` | the popover, and the plain label for one campaign |
| `src/components/campaigns/campaign-switcher-heading.ts` | the heading's classes, shared by the switcher and the header bar's Suspense fallback |
| `src/components/campaigns/organiser-campaign-actions.tsx` | New action ▾ / Build list / ⋯ |
| `src/components/campaigns/plan-tab-triggers.tsx` | the two count-badged Plan triggers, moved verbatim |
| `src/components/campaigns/setup/campaign-setup-cards.tsx` | the Setup tab's five link cards |
| `src/lib/campaign/__tests__/workspace-tabs.test.ts` | T1–T10, 36 cases |
| `src/lib/campaign/__tests__/campaign-surfaces.fixture.ts` | the 45-row inventory |
| `src/lib/campaign/__tests__/campaign-tabs-full-mode.fixture.ts` | the hand-written 8/20 second opinion |
| `src/lib/campaign/__tests__/campaign-header-actions.fixture.ts` | appendix D 3.3's twelve rows + destinations |
| `src/lib/campaign/__tests__/switcher-shortcut.test.ts` | S1–S7, 10 cases |
| `tests/e2e/organiser-campaign.spec.ts` | the two browser tests |

Changed (8): `src/lib/campaign-tabs.ts` (the registry), `src/lib/campaign/campaign-detail-routes.ts`
(`campaignIdForChrome`), `src/components/layout/header.tsx` (the Suspense split),
`src/components/campaigns/campaign-detail-header-bar.tsx` (one mode branch, the switcher, one
dialog mount), `src/app/(dashboard)/campaigns/[id]/page.tsx` (five slots + three hooks + one
`select`), `src/app/(dashboard)/campaigns/[id]/plan/page.tsx` (`id="campaign-team"`),
`src/lib/__tests__/campaign-tabs.test.ts`, `src/lib/campaign/__tests__/campaign-detail-routes.test.ts`.

One snapshot file is added: `src/lib/campaign/__tests__/__snapshots__/workspace-tabs.test.ts.snap`
(four snapshots — the two full-mode models, the coverage census, the header destination map). No
existing snapshot changed; the WP1.2 nav snapshots are untouched.

### Where each of the 45 surfaces is, in organiser mode

Generated from the same `findSurface` the tests use (the T4 census snapshot is the machine-readable
version). Every surface has a location in the model — `findSurface` returns non-null for all 45 —
but "has a location" is not "is one click away", so here is the honest count.

**On the default module set, More holds 14 items and exactly one of them is live: Role check.**
The other thirteen — Overview, Strategy, Workplan, Pending review, Section Plans, Library, Data
fields, Activists & WOCs, Foundational Readiness, Reports, Results, Insights, and Bargaining when
the phase gate passes — render as disabled items captioned "Ask an admin to enable". A user who
wants one of them has two ways in, neither of which is a click on the item itself: a **deep link**
(the surface renders in full, and the More trigger names it — this is the "mode is presentation,
never permission" rule, and the e2e asserts it for Pending review), or **Show everything** in the
sidebar, which flips the account to full mode and gives back the eight-tab bar. Turning the
module on is the third way, and the only one that makes the item clickable in organiser mode.

That is a deliberate consequence of WP1.2's default module set, not of this package's navigation:
the same thirteen are muted in the sidebar today. It is recorded here because "nothing is
unreachable" would have read as "everything is reachable by clicking", which on the default set is
true of one item in fourteen.

| # | Surface (`?tab=&sub=`) | Level | Organiser-mode location |
|---|---|---|---|
| 1 | `overview` | 1 | More → **Overview** (muted by default: `insights` is off) |
| 2 | `plan` | 1 | More → **Plan & Execution** group; opens Strategy |
| 3 | `section-plans` | 1 | More → **Section Plans** (muted by default) |
| 4 | `workforce` | 1 | **Wall chart** tab (its default sub is `wall-chart`) |
| 5 | `outcomes` | 1 | More → **Outcomes** group; opens Reports |
| 6 | `outreach` | 1 | **Activity** tab (its target is `outreach/comms`) |
| 7 | `library` | 1 | More → **Library** (muted by default) |
| 8 | `bargaining` | 1 | More → **Bargaining**, only at `current_phase = 'bargaining_to_win'` (the gate is mode-independent) |
| 9 | `plan/strategy` | 2 | More → Plan & Execution → **Strategy** |
| 10 | `plan/workplan` | 2 | More → Plan & Execution → **Workplan** |
| 11 | `plan/actions` | 2 | Activity → **Actions** |
| 12 | `plan/task-lists` | 2 | Activity → **Task Lists** |
| 13 | `plan/pending-review` | 2 | More → Plan & Execution → **Pending review** (muted by default) |
| 14 | `plan/role-check` | 2 | More → Plan & Execution → **Role check** (on by default) |
| 15 | `workforce/wall-chart` | 2 | **Wall chart** tab (`view=wall-chart`) and **People** tab (`view=list`) |
| 16 | `workforce/campaign-units` | 2 | Setup → **Units** |
| 17 | `workforce/universe` | 2 | **Setup** tab's own target → **Who's in** |
| 18 | `workforce/assessments` | 2 | Activity → **Assessments** |
| 19 | `workforce/data-fields` | 2 | More → Workforce → **Data fields** (muted by default) |
| 20 | `workforce/activists` | 2 | More → Workforce → **Activists & WOCs** (muted by default) |
| 21 | `workforce/foundational-readiness` | 2 | More → Workforce → **Foundational Readiness** (muted by default) |
| 22 | `outcomes/reports` | 2 | More → Outcomes → **Reports** (muted by default) |
| 23 | `outcomes/results` | 2 | More → Outcomes → **Results** (muted by default) |
| 24 | `outcomes/insights` | 2 | More → Outcomes → **Insights** (muted by default) |
| 25 | `outreach/comms` | 2 | **Activity** tab's own target → **Comms** |
| 26 | `outreach/phone` | 2 | Activity → **Phone Ops** |
| 27 | `outreach/sms` | 2 | Activity → **SMS** |
| 28 | `outreach/soc` | 2 | Activity → **SOC** |
| 29 | `outreach/comms#drafts` "Drafts & Send" | 3 | Activity → Comms, then the panel's own tab row (unchanged) |
| 30 | `outreach/comms#list-builder` "List Builder" | 3 | Activity → Comms, then the panel's own tab row |
| 31 | `outreach/comms#inbox` "Inbox" | 3 | Activity → Comms, then the panel's own tab row (`?email_view=inbox`) |
| 32 | `outreach/sms#blasts` | 3 | Activity → SMS, then the panel's own tab row |
| 33 | `outreach/sms#inbox` | 3 | Activity → SMS, then the panel's own tab row |
| 34 | `outreach/sms#surveys` | 3 | Activity → SMS, then the panel's own tab row |
| 35 | `outreach/sms#chats` | 3 | Activity → SMS, then the panel's own tab row |
| 36 | `outreach/sms#relays` | 3 | Activity → SMS, then the panel's own tab row — **the surface appendix D 3.2 undercounts** |
| 37 | `workforce/activists#register` | 3 | More → Workforce → Activists & WOCs, then `?view=register` |
| 38 | `workforce/activists#tasking` "4A Tasking" | 3 | …then `?view=tasking` |
| 39 | `workforce/activists#wocs` "WOCs" | 3 | …then `?view=wocs` |
| 40 | `workforce/activists#structure-tests` | 3 | …then `?view=structure-tests` |
| 41 | `library#documents` | 3 | More → Library, then the panel's own tab row (local state) |
| 42 | `library#agreements` | 3 | More → Library, then the panel's own tab row |
| 43 | `library#offers` | 3 | More → Library, then the panel's own tab row |
| 44 | `workforce/wall-chart#wall-chart` | 3 | the **Wall chart** tab is this layout |
| 45 | `workforce/wall-chart#list` | 3 | the **People** tab is this layout |

Read "muted by default" as: the item is listed in More, disabled, captioned **"Ask an admin to
enable"** — and the surface still renders on a deep link, with the More trigger naming it. One
press of WP1.2's **Show everything** (in the sidebar, one tap away via `MobileNav`, which the
header keeps in both modes) turns every one of them back on, because `resolveWorkspace` returns
`mode: "full"` and the page gets the eight-tab model.

### Where each of the 12 header actions is, in organiser mode

| # | Action today (appendix D 3.3) | Organiser-mode home |
|---|---|---|
| 1 | Back arrow "Back to campaigns" | **unchanged** — the back arrow, left of the campaign name |
| 2 | Pencil "Edit campaign basics" | **unchanged** — the pencil beside the campaign name |
| 3 | Build ▾ → Build list (checkbox) | **"Build list"** — a top-level toggle button calling the same `handleToggleBuildList`, with `aria-pressed` |
| 4 | Build ▾ → Import worker list | **⋯ overflow**, and the Setup tab's "Import worker list" card |
| 5 | Build ▾ → Add assessment | **New action ▾ → Assessment** |
| 6 | Build ▾ → Task management | **⋯ overflow** (the same `?tab=plan&sub=task-lists&from=header` link); the *create* half is **New action ▾ → Task list** |
| 7 | Create Phone Call | **New action ▾ → Call list** |
| 8 | Create Email | **New action ▾ → Email** |
| 9 | Create SMS | **New action ▾ → SMS** |
| 10 | Actions ▾ → Re-run wizard | **⋯ overflow**, and the Setup tab's "Re-run wizard" card |
| 11 | Actions ▾ → All settings | **⋯ overflow**, and the Setup tab's "Basics & all settings" card |
| 12 | Actions ▾ → View full plan | **⋯ overflow**, the Setup tab's "Strategic plan" card, and More → Plan & Execution when the module is on |
| — | the three resume banners | **unchanged**, both modes |

Nothing is removed. What that claim rests on, stated precisely, because the wording here was
stronger than the evidence:

- **The unit test is a two-literal comparison.** `campaign-header-actions.fixture.ts` holds the
  twelve appendix D 3.3 rows and their organiser-mode destinations, and `workspace-tabs.test.ts`
  checks that the two objects cover the same twelve ids. Both objects are hand-written; nothing
  reads `organiser-campaign-actions.tsx`. It catches a row deleted from one side and not the
  other. It cannot catch a destination that was never wired up, and it would not notice if the
  component stopped rendering a control entirely.
- **The e2e is what proves the controls exist.** `organiser-campaign.spec.ts` opens New action ▾
  and asserts its five items by text, toggles Build list and asserts `aria-pressed` and the
  resulting URL, and opens ⋯ and asserts its five items by text — ten of the twelve, in a real
  browser. That is rows 3–12. The two unchanged controls, the back arrow and the basics pencil,
  are not asserted by any test; the §7 screenshots are all the evidence they have.
- Together those cover the mapping; neither on its own does.

### Commits

| SHA | Subject |
|---|---|
| `708da79` | `feat(oux-wp1.4): tab registry with module ids, and the pure workspace-tabs resolver` |
| `7ca1926` | `feat(oux-wp1.4): wizards keep the campaign header; URL contract tests` |
| `0bb3ac4` | `feat(oux-wp1.4): organiser-mode campaign header — switcher, New action, Build list, overflow` |
| `6468246` | `feat(oux-wp1.4): the campaign tab bar — four tabs plus More in organiser mode` |
| `9ca840b` | `feat(oux-wp1.4): e2e — full mode's eight tabs, and the organiser-mode round trip` |
| _this one_ | `docs(oux-wp1.4): deviations and implementer notes` |

## 7. Verification output

Verifier run 2026-09-09 at 6a844d4; preview https://offshore-alliance-buk5fi2xh-reveille-strategy.vercel.app

### 1. `apps/organising-db` — tsc / test / lint / build

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0
```

```
$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  72 passed (72)
      Tests  995 passed (995)
```
No `FAIL` lines.

```
$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)
```
Matches the baseline (294/143/151) exactly.

```
$ pnpm build 2>&1 | tail -20
...
├ ƒ /worksites
└ ƒ /worksites/[id]

ƒ Proxy (Middleware)
ƒ  (Dynamic)  server-rendered on demand
```
Build completed; every route dynamic, no static-render bail-out.

### 2. Diff stat and schema/type check

```
$ git diff --stat feat/oux-wp1.3-my-campaigns..HEAD | tail -1
 25 files changed, 4966 insertions(+), 107 deletions(-)

$ git diff --name-only feat/oux-wp1.3-my-campaigns..HEAD | grep -E '^supabase/|^packages/db-types/' || echo "no schema or type changes"
no schema or type changes

$ git log --oneline feat/oux-wp1.3-my-campaigns..HEAD
6a844d4 docs(oux-wp1.4): deviations and implementer notes
9ca840b feat(oux-wp1.4): e2e — full mode's eight tabs, and the organiser-mode round trip
6468246 feat(oux-wp1.4): the campaign tab bar — four tabs plus More in organiser mode
0bb3ac4 feat(oux-wp1.4): organiser-mode campaign header — switcher, New action, Build list, overflow
7ca1926 feat(oux-wp1.4): wizards keep the campaign header; URL contract tests
708da79 feat(oux-wp1.4): tab registry with module ids, and the pure workspace-tabs resolver
06aef68 docs(oux): WP1.4 plan, approved
```

### 3. Prefs before

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37'
```
`{"workspace_prefs": {}}` — as expected.

### 4. Preview deployment

`gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=6a844d4c8dbb48b7efa5f67fb7d61f620bb1423f&per_page=3"` returned one deployment (id `6348834799`) on first poll — no waiting required.

`gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6348834799/statuses"` → `state: "success"`, `environment_url: "https://offshore-alliance-buk5fi2xh-reveille-strategy.vercel.app"`.

### 5. Credentialled e2e — full suite, both projects

```
E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm e2e
```

```
Running 12 tests using 1 worker

  ✓   1 [chromium] actions-hub.spec.ts:22:7 › open /actions, see the three start cards and the status buckets (5.8s)
  ✓   2 [chromium] actions-hub.spec.ts:62:7 › /sms still works and lands on the hub with its params intact (4.4s)
  -   3 [chromium] mobile-dialer.spec.ts:30:7 › volunteer can sign in, claim, dial, record outcome, advance (skipped)
  ✓   4 [chromium] organiser-campaign.spec.ts:54:7 › the eight tabs, in order, with no organiser-mode furniture (2.6s)
  ✘   5 [chromium] organiser-campaign.spec.ts:82:7 › four tabs plus More, deep links, the switcher and every header action (27.1s)
  ✓   6 [chromium] organiser-nav.spec.ts:52:7 › the ten rows, in order, with no organiser-mode furniture (1.9s)
  ✓   7 [chromium] organiser-nav.spec.ts:68:7 › organiser mode shows four primary items, Organisation and Show everything (10.9s)
  ✓   8 [chromium] roles/unit-lifecycle-user.spec.ts:92:7 › creates a campaign, then creates, renames and deletes a unit and the campaign (11.5s)
  ✓   9 [chromium] roles/unit-lifecycle-user.spec.ts:137:7 › offers no write controls on a campaign the account cannot write to (3.6s)
  ✓  10 [chromium] wall-chart.spec.ts:162:7 › sign in and reach a wall chart in under ten seconds (10.2s)
  ✓  11 [chromium] wall-chart.spec.ts:244:7 › lists my campaigns and opens the wall chart (10.1s)
  ✓  12 [chromium-admin] roles/unit-lifecycle-admin.spec.ts:76:7 › creates, renames and deletes a unit on any campaign (6.4s)

  1) organiser-campaign.spec.ts:82:7 › Campaign workspace — the organiser-mode round trip › four tabs
     plus More, deep links, the switcher and every header action

    Error: expect(locator).toHaveAttribute(expected) failed

    Locator: getByRole('button', { name: 'Build list' })
    Expected: "true"
    Error: strict mode violation: getByRole('button', { name: 'Build list' }) resolved to 2 elements:
        1) <button type="button" aria-pressed="true" title="Close build list panel" ...>Build list</button>
           aka getByRole('button', { name: 'Build list', exact: true })
        2) <button type="button" aria-label="Close build list panel" ...>…</button>
           aka getByRole('button', { name: 'Close build list panel' })

    Call log:
      - Expect "toHaveAttribute" with timeout 5000ms
      - waiting for getByRole('button', { name: 'Build list' })

      198 |         await buildList.click();
      199 |         await expect(page).toHaveURL(/buildList=1/);
    > 200 |         await expect(buildList).toHaveAttribute("aria-pressed", "true");
          |                                 ^
      201 |
      202 |         // …and the ⋯ menu holds the five demoted actions, none removed.
      203 |         await page.getByRole("button", { name: "More campaign actions" }).click();
        at tests/e2e/organiser-campaign.spec.ts:200:33

    Screenshots:
      test-results/organiser-campaign-Campaig-32631-her-and-every-header-action-chromium/test-failed-1.png
    Trace:
      test-results/organiser-campaign-Campaig-32631-her-and-every-header-action-chromium/trace.zip

  1 failed
    organiser-campaign.spec.ts:82:7 › four tabs plus More, deep links, the switcher and every header action
  1 skipped
  10 passed (2.0m)
```

Every non-skipped spec passed except the new organiser-mode round trip (Test 2). Test 1 (full mode, eight tabs) passed. The `mobile-dialer` spec skipped (its own gating, unrelated to this package). Per instruction, the new spec was re-run alone:

```
E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm exec playwright test tests/e2e/organiser-campaign.spec.ts

Running 2 tests using 1 worker

  ✓  1 [chromium] the eight tabs, in order, with no organiser-mode furniture (3.8s)
  ✘  2 [chromium] four tabs plus More, deep links, the switcher and every header action (24.1s)
```

Identical failure, same line (`organiser-campaign.spec.ts:200`), same strict-mode-violation message, reproducible on both runs. The finally block's reset ran regardless: `PATCH /api/admin/update-user` with `workspacePrefs: null` succeeded in both runs (confirmed independently by the SQL query in step 6 below, which read `{}` after each run).

Raw locator collision, unedited: `getByRole('button', { name: 'Build list' })` resolves to two elements once the panel is open — the toggle button itself (whose accessible name is its own text, "Build list", with `title="Close build list panel"`) and a second, separate icon-only button whose `aria-label="Close build list panel"` also contains the substring "build list", which Playwright's default non-exact name matching treats as a match. Reported without further interpretation, as instructed.

### 6. After

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37'
```
`{"workspace_prefs": {}}` — as expected, both after the `pnpm e2e` run and again after the standalone re-run.

```sql
select campaign_id, name from campaigns where name like 'WP1.6%'
```
`[]` — no leftover rows, as expected.

### 7. Visual evidence

Throwaway script `apps/organising-db/test-results/wp1.4-visual-evidence.mjs` (gitignored, not committed), loading `tests/e2e/.auth/user.json` (and `.auth/admin.json` for the mode-switch calls) at 1280×800 against the preview URL. All six screenshots captured successfully:

| Screenshot | Path | Observed |
|---|---|---|
| (a) Full mode | `/tmp/oux-plans/shots/wp1.4-full-mode-campaign.png` | Today's header — Build ▾, Create Phone Call, Create Email, Create SMS, Actions ▾ (12 actions across the menus) — and the 8-tab bar (`Workforce` active; 7 unconditional tabs visible, no `Bargaining` tab rendered for this seed campaign's current phase). |
| (b) Organiser mode | `/tmp/oux-plans/shots/wp1.4-organiser-campaign.png` | Plain-label switcher ("testco1", no popover — the account owns exactly one campaign), back arrow, name, pencil, type + status badges, **New action**, **Build list**, **⋯**; tab bar reads Wall chart / People / Activity / Setup / More. |
| More menu | `/tmp/oux-plans/shots/wp1.4-organiser-more.png` | Opens over the four tabs; live item **Role check** (bold, enabled); muted items (Overview, Strategy, Workplan, Pending review, Section Plans, Data fields, Activists & WOCs, Foundational Readiness, …) each captioned "Ask an admin to enable". |
| Switcher shortcut | `/tmp/oux-plans/shots/wp1.4-switcher.png` | `g` then `c` pressed; page unchanged (no popover) — consistent with the single-campaign plain-label branch, matching (b). |
| Deep link | `/tmp/oux-plans/shots/wp1.4-deep-link-pending-review.png` | `?tab=plan&sub=pending-review` renders ("No pending submissions to review."); tab bar shows no active primary tab and the More trigger reads "More · Pending review". |
| Wizard chrome | `/tmp/oux-plans/shots/wp1.4-wizard-keeps-header.png` | `/campaigns/soc-wizard?cid=1` renders the SOC wizard ("Structured Organising Conversation", Step 1 of 11) under the unchanged campaign header (testco1, back arrow, pencil, badges, New action, Build list, ⋯). |

Prefs reset to `{}` by the script's `finally` block; confirmed by SQL immediately after (see §6).

### Step summary

| Step | Result |
|---|---|
| 1. tsc / test / lint / build | green — tsc 0; 72 files / 995 tests passed, no FAIL; lint 294/143/151 (baseline); build clean, all routes dynamic |
| 2. diff stat / schema check | 25 files, +4966/-107; no `supabase/` or `packages/db-types/` changes |
| 3. prefs before | `{}` |
| 4. preview deployment | ready on first poll — `success`, https://offshore-alliance-buk5fi2xh-reveille-strategy.vercel.app |
| 5. e2e full suite | 10 passed, 1 skipped (unrelated), **1 failed** (organiser round trip, Test 2) — reproduced identically on standalone re-run |
| 6. prefs/campaigns after | `{}`; no leftover WP1.6 campaigns |
| 7. visual evidence | all 6 screenshots captured; prefs reset and confirmed |

### Verifier run 2 (after fix round 1) at c6b1624; preview https://offshore-alliance-m0baab8ek-reveille-strategy.vercel.app

#### 1. `apps/organising-db` — tsc / test / lint / build

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0
```

```
$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  72 passed (72)
      Tests  999 passed (999)
```
No `FAIL` lines.

```
$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)
```
Matches the baseline (294/143/151) exactly.

```
$ pnpm build 2>&1 | tail -4
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```
Build completed clean; fuller tail confirmed no error lines, only the route summary.

#### 2. Diff stat and log since baseline

```
$ git diff --stat 08fca8e..HEAD | tail -1
 13 files changed, 409 insertions(+), 126 deletions(-)

$ git log --oneline 08fca8e..HEAD
c6b1624 fix(oux-wp1.4): §6 fix round 1 — honest counts and two more deviations
38994d6 fix(oux-wp1.4): reviewer round 1 — e2e locator, and nine advisories
```

#### 3. Prefs before

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37'
```
`{"workspace_prefs": {}}` — as expected; no reset needed.

#### 4. Preview deployment

`gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=c6b1624dbd111b73c011335f5b526cdb834aa89a&per_page=3"` returned one deployment (id `6349503988`) on the first poll — no waiting required.

`gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6349503988/statuses"` → `state: "success"`, `environment_url: "https://offshore-alliance-m0baab8ek-reveille-strategy.vercel.app"`.

#### 5. Credentialled e2e — full suite, both projects

```
$ E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm e2e

Running 12 tests using 1 worker

  ✓   1 [chromium] actions-hub.spec.ts:22:7 › open /actions, see the three start cards and the status buckets (6.7s)
  ✓   2 [chromium] actions-hub.spec.ts:62:7 › /sms still works and lands on the hub with its params intact (5.0s)
  -   3 [chromium] mobile-dialer.spec.ts:30:7 › volunteer can sign in, claim, dial, record outcome, advance (skipped)
  ✓   4 [chromium] organiser-campaign.spec.ts:54:7 › the eight tabs, in order, with no organiser-mode furniture (2.7s)
  ✓   5 [chromium] organiser-campaign.spec.ts:88:7 › four tabs plus More, deep links, the switcher and every header action (32.9s)
  ✓   6 [chromium] organiser-nav.spec.ts:52:7 › the ten rows, in order, with no organiser-mode furniture (1.6s)
  ✓   7 [chromium] organiser-nav.spec.ts:68:7 › organiser mode shows four primary items, Organisation and Show everything (11.1s)
  ✓   8 [chromium] roles/unit-lifecycle-user.spec.ts:92:7 › creates a campaign, then creates, renames and deletes a unit and the campaign (10.3s)
  ✓   9 [chromium] roles/unit-lifecycle-user.spec.ts:137:7 › offers no write controls on a campaign the account cannot write to (4.1s)
  ✓  10 [chromium] wall-chart.spec.ts:162:7 › sign in and reach a wall chart in under ten seconds (9.4s)
  ✓  11 [chromium] wall-chart.spec.ts:244:7 › lists my campaigns and opens the wall chart (8.9s)
  ✓  12 [chromium-admin] roles/unit-lifecycle-admin.spec.ts:76:7 › creates, renames and deletes a unit on any campaign (6.7s)

  1 skipped
  11 passed (2.1m)
```

Every non-skipped spec passed, including the previously-failing organiser-mode round trip (Test 5, `organiser-campaign.spec.ts:88`), now at 32.9s. The `mobile-dialer` spec skipped, unrelated to this package.

Prefs after:

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37'
```
`{"workspace_prefs": {}}` — as expected.

```sql
select campaign_id, name from campaigns where name like 'WP1.6%'
```
`[]` — no leftover rows, as expected.

#### 6. Visual evidence

Throwaway script `apps/organising-db/test-results/wp1.4-visual-verify-run2.spec.ts` (gitignored, not committed), run as a Playwright spec loading `tests/e2e/.auth/user.json` (and `.auth/admin.json` for the admin mode-switch calls) at 1280×800 against the preview URL.

| Screenshot | Path | Observed |
|---|---|---|
| Organiser mode, campaign page | `/tmp/oux-plans/shots/wp1.4-organiser-campaign-v2.png` | Campaign name "testco1" appears exactly once, as the plain-label switcher heading (the account owns exactly one campaign, so the switcher collapses to a `<h1>` label, per §2.6's collapsed branch) — no duplicate name block. Back arrow, pencil, `bargaining`/`active` badges, dates, **New action**, **Build list**, **⋯**; tab bar reads Wall chart / People / Activity / Setup / More. |
| Switcher shortcut | `/tmp/oux-plans/shots/wp1.4-switcher-v2.png` | `g` then `c` pressed; page unchanged, byte-identical to the campaign-page shot — consistent with the single-campaign plain-label branch (no popover, no listener registered), matching run 1's finding. The script checked for `button[aria-haspopup="listbox"]` first and found none, so "My campaigns"/"All campaigns" rows were not asserted or expected. |
| More menu | `/tmp/oux-plans/shots/wp1.4-organiser-more-v2.png` | Opens over the four tabs; live item **Role check** (bold, enabled); muted items (Overview, Strategy, Workplan, Pending review, Section Plans, Data fields, Activists & WOCs, Foundational Readiness, …) each captioned "Ask an admin to enable". |
| Re-run wizard, full mode | `/tmp/oux-plans/shots/wp1.4-rerun-wizard-header.png` | `/campaigns/new?cid=1&edit=1` renders "Edit campaign — Step 1 of 9 — Basics & scope" under the unchanged campaign header (testco1, pencil, bargaining/active badges, dates, Build ▾, Create Phone Call, Create Email, Create SMS, Actions ▾). No redirect away from the URL. |

Prefs reset to `{}` by the script's `finally` block; confirmed by SQL immediately after (see above).

#### Step summary, run 2

| Step | Result |
|---|---|
| 1. tsc / test / lint / build | green — tsc 0; 72 files / 999 tests passed, no FAIL; lint 294/143/151 (baseline); build clean |
| 2. diff stat / log | 13 files, +409/-126; 2 commits since 08fca8e |
| 3. prefs before | `{}` |
| 4. preview deployment | ready on first poll — `success`, https://offshore-alliance-m0baab8ek-reveille-strategy.vercel.app |
| 5. e2e full suite | 11 passed, 1 skipped (unrelated), **0 failed** — the previously-failing organiser round trip now passes (32.9s) |
| 6. prefs/campaigns after | `{}`; no leftover WP1.6 campaigns |
| 7. visual evidence | all 4 screenshots captured; prefs reset and confirmed |

## 8. Reviewer findings

_(reviewer)_
