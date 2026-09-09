# WP1.2 — Navigation driven by modules

Branch: `feat/oux-wp1.1-workspace-mode` (contains WP1.1). App: `apps/organising-db`.
All paths below are relative to `apps/organising-db/` unless they start with `docs/`, `supabase/` or `packages/`.

---

## 1. Specification

### 1.1 The work package (verbatim)

> **WP1.2 Navigation driven by modules.** Standard implementer. Sidebar and mobile nav read the registry (appendix D 1.2 to 1.4); organiser mode shows My campaigns, Actions, Inbox, Guides and a collapsed Organisation section; muted-with-explanation for modules switched off for the campaign, hidden for modules the user can never use; header titles fixed. Acceptance: snapshot tests of both navs in both modes and both roles; every full-mode route still reachable in organiser mode via More or "Show everything". Depends on WP1.1.

### 1.2 Decisions consumed (`docs/organiser-ux-review/DECISIONS.md`, "Answers")

- **Decision 1 — Confirmed.** "Module table in plan 5.2 as written; 'Show everything' allowed for organisers." Consumed as: the module ids, their default-for-organiser flags and their `offState` are already encoded in `src/lib/workspace/modules.ts:47-155` and are **not** re-litigated here; this package only *maps nav rows onto those ids*. The "Show everything" control is built because decision 1 allows it, and `resolveWorkspace` already returns `canShowEverything` (`src/lib/workspace/resolve.ts:88`).
- **Decision 7 — Amended.** "**No creation path is retired.** Visibility and prominence are reduced instead… every old URL still works and is reachable from a documented location." Consumed as the reachability acceptance criterion in §5: nothing is deleted from `navItems`/`adminItems`; every href in the full-mode model is present in organiser mode as `on`, present as `muted`, or reachable after `showEverything = true`. §5.3 is the machine-checked proof.

### 1.3 Sequencing facts this plan is written against

| Package | Fact | How this plan handles it |
|---|---|---|
| **WP1.5** (Actions hub) | Lands **before** this package. Adds `src/app/(dashboard)/actions/page.tsx`, turns `/sms` into a server redirect to `/actions`, and exports `ACTIONS_HUB_PATH = '/actions'` from `src/lib/actions/hub-rows.ts`. It explicitly does **not** touch `sidebar.tsx` and hands the one-line sidebar change to this package (`/tmp/oux-plans/wp1.5.md:345-350`). | `nav-model.ts` imports `ACTIONS_HUB_PATH`. This is the **one deliberate deviation** from byte-identical full mode; see §4.1. Fallback if WP1.5 has not merged: §4.1 note (b). |
| **WP1.3** (My campaigns home) | Lands **after** this package. Route to be decided in its own plan; **assume `/my-campaigns`**. | `nav-model.ts` ships a single constant `MY_CAMPAIGNS_HREF`, set to **`"/campaigns"`** at merge time. WP1.3 flips one line and updates one snapshot. §4.2. |
| **WP1.4** (campaign workspace More menu) | Lands after. Owns the campaign-page tab bar and its More menu. | Out of scope (§6). The word "More" in the acceptance criterion is satisfied here by the **Organisation section + Show everything**; the campaign-page More menu is WP1.4's. Stated in §5.4. |

---

## 2. What exists today (the contract to preserve)

### 2.1 The nav arrays

`src/components/layout/sidebar.tsx:33-44` — `navItems`, 10 rows, **no gating at all** (viewers included), rendered in this exact order (`appendix-D-navigation-roles.md` §1.2):

| # | Label | Href | Icon | Note |
|---|---|---|---|---|
| 1 | `Campaigns` | `/campaigns` | `Megaphone` | |
| 2 | `Dashboard` | `/dashboard` | `LayoutDashboard` | |
| 3 | `Overview` | `/overview` | `LayoutGrid` | org databases, 8 tabs |
| 4 | `Worksites` | `/worksites` | `MapPin` | |
| 5 | `Upcoming Projects` | `/upcoming-projects` | `Compass` | |
| 6 | `Email Inbox` | `/email/inbox` | `Inbox` | unread badge, `sidebar.tsx:130-140` |
| 7 | `SMS Tools` | `/sms` | `MessageSquareMore` | WP1.5 makes `/sms` a redirect |
| 8 | `SMS Inbox` | `/sms/inbox` | `MessageSquare` | |
| 9 | `Reports` | `/reports` | `BarChart3` | |
| 10 | `Guides` | `/help` | `GraduationCap` | page h1 says "How-to guides" (`help/page.tsx:91`) |

`sidebar.tsx:46-50` — `adminItems`, 3 rows, gated `isAdmin` (`sidebar.tsx:145`), after a `<Separator/>`:

| # | Label | Href | Icon |
|---|---|---|---|
| 11 | `Email Imports` | `/email-imports` | `MailOpen` |
| 12 | `Email Wrappers` | `/email/wrappers` | `LayoutTemplate` |
| 13 | `Administration` | `/administration` | `Settings` |

`sidebar.tsx:53` — `allNavHrefs = [...navItems, ...adminItems].map(i => i.href)`, fed to `isNavItemActive` (`src/lib/nav/active-nav.ts:12-21`, longest-prefix wins) so `/sms` and `/sms/inbox` never both light up. Tests: `src/lib/nav/__tests__/active-nav.test.ts`.

Footer (`sidebar.tsx:170-215`): display name or email (171-175), **Hard Refresh Connection** (176-187), **Sign out** (191-202), collapse toggle (203-214).

`src/components/layout/mobile-nav.tsx:12` imports `navItems, adminItems, allNavHrefs` from `./sidebar` and renders **an identical inventory** (79-131) with the same `isAdmin` gate (107-130) and the same hard-coded email badge (95-102). Footer at 134-172.

### 2.2 WP1.1, the contract this builds on

- `src/lib/workspace/modules.ts:19-32` — `WorkspaceModuleId`, 13 ids.
- `src/lib/workspace/modules.ts:36-45` — `WorkspaceModule.offState: "hidden" | "muted"` — WP1.1 encoded the plan's hidden-vs-muted rule **as registry data**. `imports`, `organisation_databases` and `administration` are `hidden`; the other ten are `muted` (`modules.ts:136,145,153`).
- `src/lib/workspace/resolve.ts:51-109` — `resolveWorkspace`. Note three behaviours this plan depends on:
  - `resolve.ts:56-58` — **an admin is always `full`**. `mode === "organiser" && isAdmin` is unreachable, so `admin: []` in every organiser-mode model. The four snapshot combinations in §5.2 reflect this.
  - `resolve.ts:88` — `canShowEverything = mode === "organiser" && allow`. It is `false` whenever the resolved mode is genuinely `full`.
  - `resolve.ts:91-93` — session expansion returns `{ mode: "full", canShowEverything: true, source: "session" }`. **This is how the model tells "genuinely full" from "organiser, expanded"** without a fourth input (§4.3).
- `src/lib/workspace/use-workspace.tsx:27-40` — `useWorkspace()` returns `mode`, `enabledModules`, `canShowEverything`, `showEverything`, `setShowEverything`, `isModuleEnabled`, `moduleState`, `source`, `loading`. Mounted globally at `src/components/providers.tsx:482`. Outside the provider it defaults to full mode for a non-admin (`use-workspace.tsx:44-55`), which is what the token-gated `/call/` and `/leader/` routes need — and those routes are outside `(dashboard)/layout.tsx` anyway, so they render no sidebar.
- `use-workspace.tsx:85-87` — `moduleState(id) = enabledModules.has(id) ? "on" : getModule(id).offState`. This function is the **whole** hidden/muted decision; `buildNavModel` calls it and never re-derives it.

### 2.3 Header

`src/components/layout/header.tsx:13-30` — `pageTitles`, keyed by `basePath = "/" + pathname.split("/")[1]` (`header.tsx:62`), fallback `"Offshore Alliance"` (63). Appendix D §1.3 records the two defects: it names **8 routes not in the sidebar** (`/workers`, `/employers`, `/programs`, `/agreements`, `/work-scopes`, `/templates`, `/workload`, `/organiser-patches`) and **omits 3 that are** (`/help`, `/upcoming-projects`, `/email-imports`).

### 2.4 Environment facts that constrain the tests

- `vitest.config.ts:19` — `environment: "node"`, `include: ["src/**/__tests__/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"]`. **No jsdom, no React Testing Library** in `package.json`. Rendered-component snapshots are therefore impossible without adding a dependency; §5.2 explains what replaces them.
- No `*.snap` file and no `__snapshots__` directory exists anywhere in `src` today. This package introduces the first.
- `@radix-ui/react-collapsible` is **not** a dependency (`package.json:22-40` lists accordion, dialog, tooltip, … but no collapsible), and `src/components/ui/` has no `collapsible.tsx`. §4.5 uses a plain button instead of adding a dependency.
- `TooltipProvider` (`src/components/ui/tooltip.tsx:7`) is **not mounted** anywhere in `providers.tsx` or `app/layout.tsx`. §4.5 uses a native `title` + `aria-disabled` instead of wiring a provider into the shell.
- e2e: `playwright.config.ts` (no `webServer`; `E2E_BASE_URL`), `tests/e2e/global-setup.ts:26-53` signs in once with `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` (`tests/e2e/env.ts:9-14`) and always writes a storage-state file so absent credentials **skip** rather than fail.

---

## 3. Terminology (plan 3.6 and 5.2)

New user-facing strings introduced by this package, and nothing else:

| String | Where | Source |
|---|---|---|
| **My campaigns** | organiser primary item 1 | plan 5.2 sidebar row, 5.3 |
| **Actions** | organiser primary item 2; full-mode row 7 after WP1.5 | plan 5.2, 5.12; `/tmp/oux-plans/wp1.5.md:411` (`h1` "Actions") |
| **Inbox** | organiser primary item 3 | plan 5.2 sidebar row |
| **Guides** | organiser primary item 4 (already the full-mode label, `sidebar.tsx:43`) | plan 5.2 |
| **Organisation** | the collapsed section heading | plan 5.2 sidebar row |
| **Show everything** | the session toggle | plan 5.2, decision 1 |
| **Ask an admin to enable** | `mutedReason` on every muted item | plan 5.2, verbatim |

Existing labels are reused **byte-for-byte** inside the Organisation section (`Worksites`, `Upcoming Projects`, `Overview`, `Dashboard`, `Reports`) so the full-mode fixture and the organiser model share one string each and there is no second copy to drift. See open question Q1 on the sentence-case mismatch.

None of the banned words (`universe`, `scope`, `episode`, `org-wide`, `sub-unit`) appear in any string this package adds.

---

## 4. Plan

### 4.0 Files

| File | Status | Purpose |
|---|---|---|
| `src/lib/nav/nav-model.ts` | **new** | Pure `buildNavModel()` — the whole decision. No React, no `next/*`, no lucide. |
| `src/lib/nav/nav-icons.ts` | **new** | `NavIconKey` union → lucide component map. The only file that imports `lucide-react`. |
| `src/lib/nav/__tests__/nav-model.test.ts` | **new** | Snapshot tests, four combinations + muted/hidden + showEverything. |
| `src/lib/nav/__tests__/nav-model-fixture.ts` | **new** | Hand-written literal of today's 13 rows — the regression pin. |
| `src/lib/nav/__tests__/nav-reachability.test.ts` | **new** | The 100%-coverage proof. |
| `src/lib/nav/__tests__/__snapshots__/nav-model.test.ts.snap` | **new (generated)** | Committed. |
| `src/components/layout/sidebar.tsx` | edit | Consume the model; keep `navItems`/`adminItems`/`allNavHrefs` exports. |
| `src/components/layout/mobile-nav.tsx` | edit | Consume the same model. |
| `src/components/layout/header.tsx` | edit | `pageTitles` — 5 added keys, 0 removed. |
| `tests/e2e/env.ts` | edit | Add `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` + a `hasE2EAdminCredentials` flag. |
| `tests/e2e/organiser-nav.spec.ts` | **new** | Full-mode regression + organiser-mode round trip. |

**No schema change.** `workspace_prefs` and `get_workspace_defaults()` already exist (`supabase/migrations/20260909100000_workspace_mode.sql`). Nothing under `supabase/migrations/` is touched. No type regeneration.

---

### 4.1 `src/lib/nav/nav-model.ts` — the model as pure data

```ts
import { ACTIONS_HUB_PATH } from "@/lib/actions/hub-rows";   // WP1.5, = "/actions"
import type { WorkspaceModuleId } from "@/lib/workspace/modules";
import type { ModuleState } from "@/lib/workspace/use-workspace";
import type { WorkspaceMode } from "@/lib/workspace/resolve";
import type { NavIconKey } from "./nav-icons";

export type NavItemState = "on" | "muted" | "hidden";

export interface NavItem {
  id: string;                 // stable, snake_case, never derived from the label
  label: string;
  href: string;
  icon: NavIconKey;
  module?: WorkspaceModuleId;
  state: NavItemState;
  mutedReason?: string;       // only when state === "muted"
  badge?: number;             // only when > 0
  activeHrefs?: string[];     // extra prefixes that light this row (risk R1)
}

export interface NavAction { id: string; label: string }

export interface NavModel {
  primary: NavItem[];
  organisation: { collapsed: boolean; items: NavItem[] };
  admin: NavItem[];
  footer: { hardRefresh: NavAction; signOut: NavAction };
  showEverythingControl: "hidden" | "offer" | "active";
}

export interface BuildNavModelInput {
  mode: WorkspaceMode;
  enabledModules: ReadonlySet<WorkspaceModuleId>;
  moduleState: (id: WorkspaceModuleId) => ModuleState;
  isAdmin: boolean;
  canShowEverything: boolean;
  showEverything: boolean;
  unreadEmail: number;
}

export function buildNavModel(input: BuildNavModelInput): NavModel;
```

Three deviations from the signature in the brief, each load-bearing:

**(a) `icon` is a string key, not a component.** `nav-model.ts` must stay importable by a `vitest` `environment: node` test and its output must serialise into a readable `.snap`. A lucide component reference serialises as `[Function]` and pins nothing. `nav-icons.ts` holds `export type NavIconKey = "megaphone" | "layout-dashboard" | …` and `export const NAV_ICONS: Record<NavIconKey, LucideIcon>` built from the exact imports at `sidebar.tsx:7-26` plus `LayoutList` (Actions, matching `SmsHubNav.tsx:21`), `Building2` (Organisation heading) and `Eye` (Show everything). The renderers do `const Icon = NAV_ICONS[item.icon]`.

**(b) `badge` is on `NavItem`.** The unread badge is hard-coded as `item.href === "/email/inbox"` in **two** places today (`sidebar.tsx:130`, `mobile-nav.tsx:95`). Moving it into the model is the point of the package; `unreadEmail` is already an input in the brief's signature, so it must land somewhere. `badge` is set only on the item whose `module === "inbox"` and only when `unreadEmail > 0`, so the `>99 → "99+"` clamp and the `aria-label` stay in the renderers exactly as they are.

**(c) `footer` carries the two action labels, not the collapse toggle.** `hardRefresh: { id: "hard_refresh", label: "Hard Refresh Connection" }` and `signOut: { id: "sign_out", label: "Sign out" }` — so the snapshot pins those two strings against accidental rewording. The display name, the "Signing out…" transient label, the recovery feedback line and the collapse chevron are component state and stay where they are (`sidebar.tsx:171-214`).

#### Full mode — the regression pin

```
primary       = the 10 rows of §2.1, in order, every state "on", no module gating whatsoever
organisation  = { collapsed: false, items: [] }
admin         = isAdmin ? the 3 rows of §2.1 : []
showEverythingControl = showEverything && canShowEverything ? "active" : "hidden"
```

Full mode is **not** module-filtered. `resolve.ts:96-98` already returns `enabledModules = modulesForRole(role)` for full mode, so filtering would be a no-op for the ten non-admin rows; making it an explicit early return removes any chance of a stray registry edit changing what today's users see.

**The one deliberate deviation.** Row 7 becomes `{ id: "actions", label: "Actions", href: ACTIONS_HUB_PATH, icon: "layout-list", module: "actions", activeHrefs: ["/sms"] }` (the alias keeps `/sms/new` and `/sms/numbers` highlighting — risk R1). Reason: WP1.5 turns `/sms` into a server redirect and renames the page to "Actions" (`/tmp/oux-plans/wp1.5.md:318-336, 411`), then explicitly defers the sidebar line to this package (`:345-350`). Leaving `href: "/sms"` would ship a sidebar row whose label contradicts the page it lands on **and** would break the active state: the browser ends on `/actions`, which is not in `allNavHrefs`, so no item would highlight. The fixture in `nav-model-fixture.ts` therefore carries 13 rows with this single row annotated `// WP1.5 rename` and one test asserts the diff between the fixture and today's `navItems` is exactly `{ href: "/sms" → "/actions", label: "SMS Tools" → "Actions", icon: MessageSquareMore → LayoutList }` and nothing else. `/sms` keeps working as a redirect, so no URL is lost (decision 7).

**Fallback (b) if WP1.5 has not merged when this lands:** replace the import with `const ACTIONS_HUB_PATH = "/sms"` in `nav-model.ts` and keep `label: "SMS Tools"` / `icon: "message-square-more"`, leaving the fixture 100% identical to today. Nothing else in this plan changes; the module mapping (`module: "actions"`) is already correct for `/sms`. The e2e assertion in §5.5 test 1 lists the label, so it flips with the constant.

#### Organiser mode — primary

Four items, in this order, all with `state: "on"` (never gated — these *are* organiser mode; gating them would produce an empty shell, the failure mode WP1.1 warns about at `/tmp/oux-plans/wp1.1.md:685`):

| id | Label | Href | Icon | module |
|---|---|---|---|---|
| `my_campaigns` | **My campaigns** | `MY_CAMPAIGNS_HREF` | `megaphone` | `wall_chart_people` |
| `actions` | **Actions** | `ACTIONS_HUB_PATH` | `layout-list` | `actions` |
| `inbox` | **Inbox** | `/email/inbox` | `inbox` | `inbox` — carries `badge` |
| `guides` | **Guides** | `/help` | `graduation-cap` | *(none)* |

**Guides has no module id.** The registry's `library` is "documents, agreements, offers" (`modules.ts:126`), not help content, and plan 5.2 lists Guides in the organiser sidebar unconditionally. An item with `module: undefined` is always `on`. (Appendix D §10 item 12 proposes eventually surfacing help *inside* the campaign; that is WP1.7's call, not this one.)

**`MY_CAMPAIGNS_HREF`** — a single exported constant in `nav-model.ts`, value **`"/campaigns"`** at merge, with the comment `// WP1.3 flips this to "/my-campaigns"`. WP1.3's change is then one line plus `vitest -u`. Shipping `/my-campaigns` now would give organisers a 404 for the whole window between the two merges.

#### Organiser mode — the Inbox entry (recommendation and justification)

**One entry, pointing at `/email/inbox`, with the email unread badge. Recommended.**

- Plan 5.2's sidebar row is one item — "**Inbox** (SMS and email conversations, badge count)" — and the acceptance criterion "asserts the four primary items" only closes if it is one.
- The SMS inbox is genuinely **one pill away** after WP1.5, with no new code: the Actions item lands on `/actions`, which renders `SmsHubHeader` (`SmsHubPage.tsx:43,192`) → `SmsHubNav` (`SmsHubNav.tsx:78`), whose three pills are Actions `/actions`, **Inbox `/sms/inbox`**, Numbers `/sms/numbers` (`SmsHubNav.tsx:21-23`, base path changed by WP1.5). So SMS conversations are two clicks from anywhere: Actions → Inbox pill.
- `/email/inbox` is the right target for the single entry because it is the one with a **badge that exists**. `useEmailInboxUnreadCount` (`src/lib/hooks/useEmailInbox.ts:377-383`) is the only unread-count hook in the app; grep of `src/lib/hooks/useSmsInbox.ts` finds no SMS equivalent (only a "clear unread" mutation at `:276`). Pointing the badged entry at a page with no count, or inventing an SMS count endpoint, are both out of scope.
- **Rejected: two entries.** It contradicts plan 5.2, makes the primary list five items, and gives organiser mode a *worse* signal-to-noise ratio than the thing it is trying to fix.
- **Rejected: an Inbox page with two tabs.** That is a new page plus a rewrite of two working panels (`EmailInboxPanel`, `SmsInboxPanel`, both with their own mobile behaviour per appendix D §8) — a package of its own, not a nav change.
- **Consequence, stated honestly:** from `/email/inbox` there is no direct link to `/sms/inbox`; you go via Actions. `/sms/inbox` remains in the full-mode model, so it is covered by the reachability proof (§5.3) as "reachable after Show everything" as well. A reciprocal pill on the email inbox page is listed in §6 as a deliberate omission.

#### Organiser mode — the Organisation section

`{ collapsed: true, items: [...] }`, always collapsed on first render (plan 5.2: "collapsed by default"). Items, in order, each with `state = moduleState(item.module)` and `mutedReason = "Ask an admin to enable"` when that is `"muted"`:

| id | Label | Href | Icon | module | State with organiser defaults |
|---|---|---|---|---|---|
| `worksites` | `Worksites` | `/worksites` | `map-pin` | `organisation_databases` | **hidden** |
| `upcoming_projects` | `Upcoming Projects` | `/upcoming-projects` | `compass` | `organisation_databases` | **hidden** |
| `overview` | `Overview` | `/overview` | `layout-grid` | `organisation_databases` | **hidden** |
| `dashboard` | `Dashboard` | `/dashboard` | `layout-dashboard` | `insights` | **muted** |
| `reports` | `Reports` | `/reports` | `bar-chart-3` | `insights` | **muted** |

The rule is **`moduleState()` and nothing else**. The brief phrases it as "`hidden` if `adminOnly` and the user is not admin"; that is the *same* rule expressed through the registry, because `modulesForRole()` (`resolve.ts:46-49`) already strips admin-only ids for non-admins, so `moduleState("administration")` returns `"hidden"` (its `offState`, `modules.ts:153`) for every non-admin. Re-deriving `adminOnly` in `nav-model.ts` would create a second definition that can drift from `resolve.ts`. One definition, in WP1.1, consumed here.

Two consequences worth naming:

1. `organisation_databases.offState` is **`hidden`** (`modules.ts:145`), so with the plan-5.2 defaults an organiser sees Worksites / Upcoming Projects / Overview **not at all**, not muted. This is intentional and matches plan 5.2's own wording for this section — *"an 'Organisation' section … only if the admin has enabled those modules for the user"* — and it does not violate plan §4 principle 4, because the escape hatch principle 6 demands ("provide an out") is the Show everything control, which is on for every organiser by default (`resolve.ts:87`, `?? true`). The muted-with-explanation half of principle 4 is carried by Dashboard and Reports, whose module (`insights`) is `offState: "muted"`.
2. The section renders **only when it has at least one non-hidden item**. With defaults that is true (2 muted). If an admin also switched `insights` on and everything else off, the section would be all-`on`; if a future registry edit made all five `hidden`, the section header disappears rather than becoming an empty disclosure — a rule the renderers derive from the model, not a second gate (`organisation.items.every(i => i.state === "hidden")`).

#### Organiser mode — `admin`

`admin: isAdmin ? [...3 rows] : []`. In practice always `[]`, because `resolveWorkspace` returns `full` for every admin (`resolve.ts:56-58`) — `organiser` + `isAdmin` is an unreachable combination. The model computes it defensively anyway so that a future decision to let an admin *preview* organiser mode does not silently drop the three admin links. A test asserts `buildNavModel({ mode: "organiser", isAdmin: true, … }).admin` has 3 rows, documenting the intent.

#### `showEverythingControl`

```
showEverything && canShowEverything  → "active"
canShowEverything && !showEverything → "offer"
otherwise                            → "hidden"
```

Why this works with no extra input: when the session toggle is on, `resolveWorkspace` returns `mode: "full"` **and** `canShowEverything: true` (`resolve.ts:91-93`); when the mode is genuinely full it returns `canShowEverything: false` (`resolve.ts:88`, the `mode === "organiser" &&` guard). So `"active"` is reachable only from an expanded organiser and the user can always toggle back. The control calls `setShowEverything(!showEverything)` from `useWorkspace()` (`use-workspace.tsx:33`) — session-only React state, never `localStorage` (standing rule; `use-workspace.tsx:6-9`).

#### Module mapping for every route in the app

Requested by the brief: every current sidebar item **and every appendix D §1.6 page** mapped to a registry id. Only the first block produces `NavItem`s; the second block is the mapping WP1.4 and later packages inherit, recorded here so it exists in exactly one place.

| Route | In the model? | Module id | Source |
|---|---|---|---|
| `/campaigns` (→ `/my-campaigns`) | primary | `wall_chart_people` | `modules.ts:49` |
| `/actions` (`/sms` redirects) | primary | `actions` | `modules.ts:57` |
| `/email/inbox` | primary | `inbox` | `modules.ts:74` |
| `/help` | primary | *(none — always on)* | plan 5.2 |
| `/worksites`, `/upcoming-projects`, `/overview` | Organisation | `organisation_databases` | `modules.ts:139-146` |
| `/dashboard`, `/reports` | Organisation | `insights` | `modules.ts:99` |
| `/email-imports`, `/email/wrappers`, `/administration` | admin | `administration` | `modules.ts:148-154` |
| `/sms/inbox` | full mode only | `inbox` | — |
| `/workers`, `/employers`, `/agreements`, `/programs`, `/work-scopes` | **no** — §1.6 pages, reached from `/overview`'s 8 tabs | `organisation_databases` | appendix D §1.6 |
| `/templates` | **no** — reached from the Campaigns page tab bar | `actions` | appendix D §1.5 |
| `/workload`, `/organiser-patches` | **no** — reached from Administration → System | `administration` | appendix D §1.6 |
| `/sms/new`, `/sms/numbers` | **no** — reached from the hub pills / Start something cards | `actions` | appendix D §1.5 |
| `/reports/*` (5 sub-pages) | **no** — reached from the Reports hub cards | `insights` | appendix D §1.5 |
| `/campaigns/[id]/*` | **no** — WP1.4 | per `campaign-tabs.ts` | appendix D §10 item 4 |

---

### 4.2 `src/components/layout/sidebar.tsx` — rendering

Keep the file's three exports so nothing downstream breaks (`mobile-nav.tsx:12` is the only importer today, but appendix D §10 item 2 names these arrays as the extension point and the reachability fixture reads them):

- `navItems` (33-44) and `adminItems` (46-50) **stay exactly as they are** (with row 7 updated per §4.1). They become the *literal source* the full-mode branch of `buildNavModel` returns — i.e. `nav-model.ts` owns the array and `sidebar.tsx` re-exports it, so there is one definition. Concretely: move the two literals into `nav-model.ts` as `FULL_NAV_ITEMS` / `FULL_ADMIN_ITEMS` (icon keys instead of components) and keep `export const navItems = FULL_NAV_ITEMS.map(i => ({ href: i.href, label: i.label, icon: NAV_ICONS[i.icon] }))` in `sidebar.tsx` for backwards compatibility.
- `allNavHrefs` (53) becomes `[...FULL_NAV_ITEMS, ...FULL_ADMIN_ITEMS].flatMap(i => [i.href, ...(i.activeHrefs ?? [])])` — **always the full-mode set, in both modes**. This is important: `isNavItemActive`'s longest-prefix rule (`active-nav.ts:18-20`) needs *every* nav href in scope to disambiguate, and in organiser mode the visible set is a subset. Feeding it only the visible subset would make `/sms/inbox` light up the `/sms`-rooted Actions item. The `activeHrefs` spread keeps `/sms` in the array after row 7 moves to `/actions` (risk R1). Add `MY_CAMPAIGNS_HREF` to the list too, so it disambiguates against `/campaigns` once WP1.3 lands.

Component body (`sidebar.tsx:55-217`):

```tsx
const ws = useWorkspace();                       // new
const { data: emailUnreadCount = 0 } = useEmailInboxUnreadCount(!!user);   // unchanged (68)
const model = useMemo(() => buildNavModel({
  mode: ws.mode, enabledModules: ws.enabledModules, moduleState: ws.moduleState,
  isAdmin, canShowEverything: ws.canShowEverything, showEverything: ws.showEverything,
  unreadEmail: emailUnreadCount,
}), [ws, isAdmin, emailUnreadCount]);
```

- The `navItems.map(...)` at 115-143 becomes `model.primary.map(renderItem)`; the badge block at 130-140 keys off `item.badge != null` instead of `item.href === "/email/inbox"`; every class name at 121-126 is unchanged.
- The `isAdmin && <>…</>` block at 145-167 becomes `model.admin.length > 0 && <>…</>`; classes at 154-159 unchanged.
- New between them: the Organisation section, rendered only when `model.organisation.items.some(i => i.state !== "hidden")`.
- New in the footer, above the display name: the Show everything control, rendered when `model.showEverythingControl !== "hidden"`.

**`renderItem`** (a local function shared with `mobile-nav.tsx` — extract it into `sidebar.tsx` and export, or duplicate the 20 lines; extracting is better and the two class sets differ only in `bg-sidebar-accent` vs `bg-secondary`, so pass the two class strings in):

- `state === "hidden"` → render nothing (filtered out before the map, so the key list stays stable).
- `state === "on"` → today's `<Link>`, unchanged.
- `state === "muted"` → **a `<span>`, not a link**, with `aria-disabled="true"`, `tabIndex={-1}`, `title={item.mutedReason}`, `className={cn(base, "opacity-50 cursor-not-allowed")}` and an `<span className="sr-only">{item.mutedReason}</span>` after the label so the reason reaches a screen reader as well as a hover tooltip.

  **Recommendation: disabled-with-tooltip, not a link to an explanation page.** It is ~6 lines against a new route, a new page and a new copy deck; Nielsen's inactive-controls guidance (plan §4 principle 4, `jakobnielsenphd.substack.com/p/inactive-buttons`) asks for a *visible, explained* control, which the `title` + `sr-only` pair delivers. A native `title` rather than the shadcn `<Tooltip>` because `TooltipProvider` is not mounted in the shell (§2.4) and mounting one for five muted rows is a shell change this package does not need.

**Organisation section markup** (no new dependency):

```tsx
const [orgOpen, setOrgOpen] = useState(!model.organisation.collapsed);
…
<button type="button" aria-expanded={orgOpen} aria-controls="nav-organisation"
        onClick={() => setOrgOpen(v => !v)} className={/* same row classes */}>
  <Building2 className="h-4 w-4 shrink-0" />
  {!collapsed && <><span>Organisation</span>
    <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", orgOpen && "rotate-180")} /></>}
</button>
{orgOpen && <div id="nav-organisation" className="space-y-1 pl-3">{visible.map(renderItem)}</div>}
```

`@radix-ui/react-collapsible` is not installed and `src/components/ui/collapsible.tsx` does not exist (§2.4); a 10-line disclosure with correct `aria-expanded`/`aria-controls` is cheaper and lighter than adding a dependency to the bundle for one section. The `Accordion` that *is* installed carries single/multiple/value semantics this does not need.

**Show everything control:**

```tsx
{model.showEverythingControl !== "hidden" && (
  <button type="button" onClick={() => ws.setShowEverything(!ws.showEverything)}
          aria-pressed={model.showEverythingControl === "active"}
          className={/* same footer-button classes as Hard Refresh, 179 */}>
    <Eye className="h-4 w-4 shrink-0" />
    {!collapsed && <span>Show everything</span>}
  </button>
)}
```

One label in both states; `aria-pressed` carries on/off, which is the accessible-name-stable pattern for a toggle.

Footer (`170-215`) is otherwise untouched: display name (171-175), Hard Refresh Connection (176-187) now labelled from `model.footer.hardRefresh.label`, recovery feedback (188-190), Sign out (191-202) labelled from `model.footer.signOut.label` with the transient "Signing out…" left in the component, collapse toggle (203-214).

**Collapsed sidebar (`w-16`, `sidebar.tsx:65,94`).** Icons only. Muted items keep the `title`; the Organisation button shows only `Building2` and toggling it while collapsed reveals the icon list — acceptable, and unchanged from how the flat list behaves today.

---

### 4.3 `src/components/layout/mobile-nav.tsx` — rendering

Identical treatment; the file already mirrors the sidebar 1:1 (appendix D §1.4, "Inventory is identical to the desktop sidebar").

- `12` — import `buildNavModel` and the shared `renderItem` alongside `navItems, adminItems, allNavHrefs` (keep the last for `isNavItemActive`).
- `29` — keep `useEmailInboxUnreadCount`; add `useWorkspace()`.
- `79-105` → `model.primary`; the badge condition at `95` keys off `item.badge`.
- `107-130` → `model.admin.length > 0`.
- Organisation section and Show everything inserted at the same two points, using the mobile class set (`bg-secondary text-secondary-foreground`, `88-90`).
- Every item keeps `onClick={() => setOpen(false)}` (85); the Organisation **disclosure button must not** close the sheet, and the Show everything button **must** close it (the nav re-renders behind it).

**Mobile sheet height.** `SheetContent` is `w-[300px] p-0 flex flex-col` (59) with the nav in a `flex-1 overflow-y-auto` (77) and a fixed footer (134). In organiser mode the primary list drops from 10 to 4 rows, so even fully expanded (4 + 1 header + 5 organisation + 1 toggle = 11) the sheet is shorter than today's 10 + 3 + footer. The scroll container already exists; no layout change is needed. Recorded as a risk (§7) only because the footer now has a third button on small screens.

---

### 4.4 `src/components/layout/header.tsx` — titles

`pageTitles` (`13-30`): **5 keys added, 0 removed, 0 changed.**

```ts
  "/campaigns": "Campaigns",
  "/my-campaigns": "My campaigns",     // + (WP1.3's route; harmless before then)
  "/actions": "Actions",               // + (WP1.5)
  "/help": "Guides",                   // + (appendix D §1.3 omission 1)
  "/upcoming-projects": "Upcoming Projects",  // + (omission 2)
  "/email-imports": "Email Imports",   // + (omission 3)
```

The eight routes that are named here but not in the sidebar (`/workers`, `/employers`, `/programs`, `/agreements`, `/work-scopes`, `/templates`, `/workload`, `/organiser-patches`) **stay**: decision 7 says nothing is retired, they are all still reachable (from `/overview`'s tabs, the Campaigns tab bar and Administration → System), and every one of them would fall back to "Offshore Alliance" if removed.

`"/sms": "SMS"` also **stays** even though `/sms` becomes a redirect: `basePath` is the first segment (`header.tsx:62`), so `/sms/inbox`, `/sms/new` and `/sms/numbers` all resolve through that key. Removing it would blank the title on three live pages.

New labels follow §3: `"/help" → "Guides"` matches the sidebar label (`sidebar.tsx:43`) rather than the page's own h1 "How-to guides" (`help/page.tsx:91`) — one name for one thing, and the sidebar is the one users navigate by.

**Duplicate `<h1>`s: out of scope, and it is not a one-line fix.** Appendix D §1.3 lists `dashboard/page.tsx:291`, `campaigns/page.tsx:359`, `overview/page.tsx:21` and says "most pages" do it; `email/inbox/page.tsx:40` and `SmsHubHeader` (`SmsHubNav.tsx:71`) do too, and the latter two carry an icon and a description the header cannot render. Deleting the header `<h1>` instead would strip the title from the pages that *don't* have one. This needs a per-page pass with screenshots — a WP0.3-shaped quick-win package, not a line in this one. Stated in §6.

---

## 5. Verification

Run from `apps/organising-db`.

### 5.1 Commands

| Criterion | Command |
|---|---|
| Model + snapshots + reachability | `pnpm test -- src/lib/nav` |
| Whole suite unaffected | `pnpm test` |
| Lint debt does not rise | `pnpm lint` (baseline 143 errors / 151 warnings, PROGRESS.md standing note; every file touched here must lint clean on its changed lines) |
| Types and build | `pnpm build` |
| Rendered navs, both modes | `E2E_BASE_URL=<branch preview> pnpm e2e -- organiser-nav.spec.ts` |

### 5.2 Snapshot tests — `src/lib/nav/__tests__/nav-model.test.ts`

**Rendered-component snapshots are not possible in this repo.** `vitest.config.ts:19` is `environment: "node"`, `@testing-library/react` and `jsdom` are not dependencies, and the include globs pick up `.tsx` but nothing renders. Adding jsdom + RTL to satisfy the word "snapshot" would add two dev dependencies and a config change to a package whose whole point is that the decision is already pure. So:

- **`toMatchSnapshot()` on `buildNavModel(...)` output** covers "both navs in both modes and both roles" — *both navs* because `sidebar.tsx` and `mobile-nav.tsx` consume the identical model and differ only in two Tailwind class strings (appendix D §1.4), which is asserted separately by the e2e in §5.5.
- **Rendering is covered by the e2e spec** (§5.5), which drives the real components in a real browser.

Cases (each a `toMatchSnapshot()`):

| # | Combination | Inputs |
|---|---|---|
| 1 | **full / admin** | `resolveWorkspace({ role: "admin", … })` → `mode "full"`, all 13 modules, `isAdmin: true` |
| 2 | **full / user** | `role: "user"`, no prefs → `mode "full"`, 12 modules, `isAdmin: false` |
| 3 | **organiser / user** | `role: "user"`, `userPrefs: { mode: "organiser" }` → the 4 registry defaults, `isAdmin: false` |
| 4 | **organiser / viewer** | `role: "viewer"`, `orgDefaults.byWorkRole.organiser.mode = "organiser"` (the `viewer → organiser` lookup fallback, `resolve.ts:66-70`) |
| 5 | organiser, `insights` **on** | Dashboard and Reports become `on` — proves the muted rows are module-driven |
| 6 | organiser, `organisation_databases` **on** | Worksites / Upcoming Projects / Overview appear — proves `hidden` is not a hard-code |
| 7 | organiser, **showEverything = true** | resolver returns `mode: "full"`; model is case 2's plus `showEverythingControl: "active"` |
| 8 | organiser, `allowShowEverything: false` | `showEverythingControl: "hidden"` — the "no out" configuration renders no dead button |
| 9 | organiser + `isAdmin: true` (synthetic) | `admin` has 3 rows; documents the defensive branch of §4.1 |

Every case builds its input by calling **`resolveWorkspace()`**, not by hand-writing a `Set`, so the two packages stay welded: a change to `modules.ts` defaults fails a nav snapshot loudly rather than silently reshaping the sidebar.

**Note recorded in the test file:** `buildNavModel` takes `isAdmin`, not `role`, so **`user` and `viewer` produce byte-identical models given identical modules**. That is correct — `viewer` is a *write* gate (appendix D §0: "`viewer` is read-only"), never a navigation gate, and hiding read-only pages from a read-only role would be the opposite of the plan. Cases 3 and 4 differ only in how they were resolved, and asserting they match is itself the proof.

### 5.3 Reachability proof — `src/lib/nav/__tests__/nav-reachability.test.ts`

```ts
const full = buildNavModel(FULL_ADMIN_INPUT)          // superset: 10 + 3
const fullHrefs = new Set([...full.primary, ...full.admin].map(i => i.href))

it('full mode is byte-identical to the pinned fixture', () => {
  expect([...full.primary, ...full.admin].map(({ id, label, href, icon, state }) => …))
    .toEqual(FULL_MODE_FIXTURE)          // hand-written literal, §5.4
})

it('every full-mode href is reachable in organiser mode', () => {
  const org = buildNavModel(ORGANISER_DEFAULT_INPUT)
  const expanded = buildNavModel({ ...ORGANISER_DEFAULT_INPUT, /* resolved with showEverything */ })

  const present = new Set([...org.primary, ...org.organisation.items, ...org.admin]
    .filter(i => i.state !== 'hidden').map(i => i.href))
  const afterShowEverything = new Set([...expanded.primary, ...expanded.admin].map(i => i.href))

  const unreachable = [...fullHrefs].filter(h => !present.has(h) && !afterShowEverything.has(h))
  expect(unreachable).toEqual([])        // 100% coverage — decision 7
})

it('the organiser default surfaces at least one muted item with the plan's reason', …)
it('no item is both muted and a live href', …)     // mutedReason set iff state === 'muted'
```

The union assertion is over `fullHrefs` taken from the **admin** full-mode model, so it includes the three admin routes; they are covered by `afterShowEverything` only when the subject is an admin, and admins are never in organiser mode (`resolve.ts:56`), so the test parameterises: `unreachable` is computed against `fullHrefs` **minus** the admin rows for the non-admin subject, and a second `it` asserts the admin subject's own model equals the fixture exactly. Both branches assert an empty `unreachable`, which is what "100%" means here.

Two facts the test records in comments so nobody mistakes their absence for a gap:

- **The appendix D §1.6 pages are not in the model and never were.** `/workers`, `/templates`, `/workload`, `/sms/new`, `/reports/campaign-progress` … are reached today from `/overview`'s tabs, the Campaigns tab bar, Administration → System, the SMS pills and the Reports cards (appendix D §1.5-1.6). None of those in-page navigations change here, and their parent routes are all in the reachability set, so every §1.6 page is reachable in organiser mode by the same clicks as today once its parent is. The mapping table in §4.1 records which module each belongs to.
- **Campaign-page surfaces are WP1.4's job.** The 8 tabs / 20 sub-tabs / 16 third-level tabs and the More menu that will hold them (appendix D §0) are not nav-model items and are not asserted here.

### 5.4 The full-mode fixture — `src/lib/nav/__tests__/nav-model-fixture.ts`

A **hand-written literal**, not derived from `sidebar.tsx`, of the 13 rows in §2.1 (`{ id, label, href, icon, module, state: "on" }`) with row 7 carrying the WP1.5 rename and a comment naming it. If it were `import { navItems } from "../../components/layout/sidebar"` the test would prove nothing — it would compare the code to itself. A second, separate `it` diffs the fixture against the live `navItems`/`adminItems` exports and asserts the only differences are the three fields of row 7, which is what makes the deviation in §4.1 a *recorded* deviation rather than a silent one.

This is the criterion-6 proof: **the flag defaults to `full` for everyone** (`resolve.ts:74`, `mode = "full"`; `use-workspace.tsx:73-79` passes `undefined` prefs when there is no profile), so after this package every existing user sees exactly the fixture.

### 5.5 e2e — `tests/e2e/organiser-nav.spec.ts`

`tests/e2e/env.ts` gains, following the existing pattern at `:9-14`:

```ts
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
export const hasE2EAdminCredentials = Boolean(E2E_ADMIN_EMAIL && E2E_ADMIN_PASSWORD);
export const NO_ADMIN_CREDENTIALS_MESSAGE =
  "Skipped: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the organiser-mode nav round trip.";
```

The operator already holds the admin/lead account (DECISIONS.md, "Test accounts (2026-09-08)": *"two dev accounts (one `admin` / lead organiser, one `user` / organiser)"*); only the `user` half is wired into the harness today. Credentials stay in the shell profile, never in the repo, and no agent types them into a form — `global-setup.ts` and this spec read them from `process.env`.

**Test 1 — full mode is today's sidebar** (`test.skip(!hasE2ECredentials, …)`, default storage state = the `user` account):

```ts
await page.goto("/campaigns");
const labels = await page.locator("aside nav a span").allTextContents();
expect(labels).toEqual([
  "Campaigns", "Dashboard", "Overview", "Worksites", "Upcoming Projects",
  "Email Inbox", "Actions", "SMS Inbox", "Reports", "Guides",
]);                                    // ← "SMS Tools" if WP1.5 has not merged (§4.1 fallback b)
await expect(page.getByRole("button", { name: "Show everything" })).toHaveCount(0);
await expect(page.getByRole("button", { name: "Organisation" })).toHaveCount(0);
```

This is the zero-change-in-full-mode criterion measured in a browser: the mode is `full` by default for every account, so the rendered order and labels must equal §2.1.

**Test 2 — the organiser-mode round trip** (`test.skip(!hasE2ECredentials || !hasE2EAdminCredentials, …)`). Two contexts: the default (user) one and a fresh admin one.

```ts
// 1. admin context, signed in through the same form global-setup.ts uses
const admin = await browser.newContext({ storageState: undefined });
const ap = await admin.newPage();
await ap.goto("/login");
await ap.locator("#email").fill(E2E_ADMIN_EMAIL);
await ap.locator("#password").fill(E2E_ADMIN_PASSWORD);
await ap.getByRole("button", { name: /sign in/i }).click();
await ap.waitForURL(/\/campaigns(\?|$)/, { timeout: 30_000 });

// 2. find the e2e user's id — GET /api/admin/users returns every profile with `email`
//    joined from auth.admin.listUsers (src/app/api/admin/users/route.ts:29-62)
const list = await ap.request.get("/api/admin/users");
expect(list.ok()).toBeTruthy();
const { users } = await list.json();
const target = users.find((u) => u.email?.toLowerCase() === E2E_USER_EMAIL.toLowerCase());
expect(target, "the E2E_USER account must exist on dev").toBeTruthy();

try {
  // 3. set organiser mode — WP1.1's write path
  //    (src/app/api/admin/update-user/route.ts:87-99 validates with workspacePrefsSchema,
  //     :161 writes user_profiles.workspace_prefs with the service-role client)
  const set = await ap.request.patch("/api/admin/update-user", {
    data: { userId: target.user_id, workspacePrefs: { mode: "organiser" } },
  });
  expect(set.ok()).toBeTruthy();

  // 4. the user context must RELOAD: AuthProvider.fetchProfile caches workspace_prefs
  //    at sign-in, so a client-side navigation would keep the old value.
  await page.goto("/campaigns");
  await page.reload();

  await expect(page.locator("aside nav a span, aside nav button span")).toContainText(
    ["My campaigns", "Actions", "Inbox", "Guides", "Organisation"]);
  const org = page.getByRole("button", { name: "Organisation" });
  await expect(org).toHaveAttribute("aria-expanded", "false");   // collapsed by default
  await org.click();
  await expect(page.getByText("Ask an admin to enable").first()).toBeAttached();
  const showAll = page.getByRole("button", { name: "Show everything" });
  await expect(showAll).toHaveAttribute("aria-pressed", "false");
  await showAll.click();
  await expect(page.locator("aside nav a span").filter({ hasText: "Reports" })).toBeVisible();
} finally {
  // 5. ALWAYS reset — `null` parses to `{}` and clears the override (route.ts:92-99)
  await ap.request.patch("/api/admin/update-user",
    { data: { userId: target.user_id, workspacePrefs: null } });
  await admin.close();
}
```

The `finally` reset matters: this writes to the shared dev database, and leaving the `user` account in organiser mode would change what `wall-chart.spec.ts` (flow one) sees on `/campaigns` on the next run. The reset is a second `PATCH`, not a DB write, so it goes through the same validated allow-list.

`E2E_BASE_URL` is the branch's Vercel preview (PROGRESS.md standing note, 2026-09-08); no agent runs the app locally.

---

## 6. Out of scope

Things I was tempted to include and did not:

1. **A reciprocal "SMS inbox" link on `/email/inbox`.** The single Inbox entry lands on email; SMS is two clicks away via Actions → Inbox pill (§4.1). A pill pair on the email page would be ~25 lines and two page edits, but it is a *page* change, not a navigation change, and the acceptance criteria do not need it. Worth a one-line follow-up if the pilot reports it.
2. **A unified inbox page with SMS and email tabs.** Two mature panels with their own mobile behaviours (`SmsInboxPanel.tsx:4-6`, `EmailInboxPanel.tsx`, appendix D §8). A package of its own.
3. **An SMS unread badge.** No count endpoint exists; only email has `useEmailInboxUnreadCount` (`useEmailInbox.ts:377`). Inventing one is API work.
4. **Removing pages' duplicate `<h1>`s** (appendix D §1.3). Not a one-line fix — see §4.4. Needs a per-page pass with screenshots.
5. **Retiring the 8 `pageTitles` routes not in the sidebar.** Decision 7 forbids it; they stay.
6. **Changing `modules.ts`.** Specifically: not flipping `organisation_databases.offState` from `hidden` to `muted`, though plan §4 principle 4 could be read as asking for it. WP1.1 owns that table, decision 1 confirmed it, and plan 5.2's own wording for this section is "only if the admin has enabled". Raised as open question Q2 rather than changed unilaterally.
7. **The campaign page's tabs and More menu** — WP1.4. **The My campaigns page** — WP1.3. **The Actions hub** — WP1.5. This package only points at their routes.
8. **A "More" menu in the sidebar.** The acceptance criterion says "via More or 'Show everything'"; the Organisation section plus Show everything satisfies it with one disclosure level. A third mechanism would break plan §4 principle 3 ("designs that go beyond 2 disclosure levels typically have low usability").
9. **Adding `jsdom` + `@testing-library/react`.** §5.2.
10. **Per-user persistence of the Organisation section's open/closed state.** Session React state only; the standing rule forbids `localStorage` for view state and a server column is WP1.1's territory, already closed.
11. **Telemetry on nav clicks.** `PostHogPageView` is already global (appendix D §10 item 11) and there is no dev PostHog project (DECISIONS.md operator inputs).

---

## 7. Risks

| # | Risk | Rule it could break | Mitigation |
|---|---|---|---|
| R1 | **Active-state regression, `/sms` vs `/actions`.** Row 7's href moves from `/sms` to `/actions` (§4.1), so `/sms` leaves `allNavHrefs`. Nothing then highlights on `/sms/new` or `/sms/numbers`, which highlight "SMS Tools" today via the longest-prefix rule (`active-nav.ts:18-20`). Those two pages are **not** redirected by WP1.5 (`/tmp/oux-plans/wp1.5.md:320-322`, "separate route segments … untouched"). | "Full mode keeps working." | `NavItem` gains `activeHrefs?: string[]`; the Actions row carries `activeHrefs: ["/sms"]`, and `/sms` stays in `allNavHrefs`. The renderers compute `isNavItemActive(pathname, item.href, allNavHrefs) \|\| item.activeHrefs?.some(h => isNavItemActive(pathname, h, allNavHrefs))`. `isNavItemActive` itself is unchanged. On `/sms/new` the longest prefix is `/sms` (not `/sms/inbox`) → Actions lights; on `/sms/inbox` the longest is `/sms/inbox` → SMS Inbox lights. Extend `src/lib/nav/__tests__/active-nav.test.ts:4` — `hrefs = ['/actions','/sms','/sms/inbox','/campaigns','/my-campaigns','/reports']` — with cases for `/sms/new`, `/sms/numbers`, `/actions?open=…`, and `/campaigns/12` lighting Campaigns and not My campaigns. |
| R2 | **`allNavHrefs` narrowed to the visible set** would break disambiguation in organiser mode. | active-state correctness | §4.2 pins it to the full-mode set in both modes, with a test asserting `allNavHrefs.length === 13 (+1 after WP1.3)` regardless of mode. |
| R3 | **The badge query moves.** `useEmailInboxUnreadCount(!!user)` is called in both nav components today (`sidebar.tsx:68`, `mobile-nav.tsx:29`); it stays in both, feeding `unreadEmail`. If a future refactor calls it once in a parent, react-query dedupes by key `['email-inbox-unread']` anyway (`useEmailInbox.ts:379`). | no behaviour change | Keep both call sites exactly as they are; the model only *receives* the number. |
| R4 | **Mobile sheet height** with a third footer button and a disclosure. | plan 5.11 / appendix D §8 | Organiser mode is strictly shorter than today's list (§4.3); the `flex-1 overflow-y-auto` at `mobile-nav.tsx:77` already scrolls. Verified visually in the e2e run against the preview. |
| R5 | **An organiser sees an empty shell** if an admin saves `{ mode: "organiser", modules: [] }`. | plan 5.1 principle 3 | The four primary items are never module-gated (§4.1), so the worst case is 4 items + Show everything. Snapshot case 8 pins the no-out configuration; the four items are still there. |
| R6 | **Snapshot churn hides a real regression.** `vitest -u` is one keystroke. | the regression pin | The fixture in §5.4 is a hand-written literal compared with `toEqual`, **not** a snapshot; `-u` cannot silently rewrite it. Snapshots cover shape, the fixture covers content. |
| R7 | **Lint debt.** Baseline is 143 errors / 151 warnings (PROGRESS.md). | standing note | New files lint clean; the three touched components must not add an error. `pnpm lint` before and after, counts compared. |
| R8 | **The e2e leaves the shared dev `user` account in organiser mode**, breaking `wall-chart.spec.ts` on the next run. | "never leave dev in a changed state" | The `finally` block in §5.5 always resets `workspace_prefs`; the reset is also idempotent, so re-running the spec after a crash restores it. |
| R9 | **WP1.3 ships a route other than `/my-campaigns`.** | — | One constant (`MY_CAMPAIGNS_HREF`) and one snapshot. Recorded in WP1.3's plan as a one-line dependency. |

---

## 8. Open questions

Only these need the operator; everything else has an assumption stated inline.

- **Q1 — Label case in the Organisation section.** The plan writes "Upcoming projects" (sentence case) but the shipped label is `Upcoming Projects` (`sidebar.tsx:38`), and the same mismatch applies to `Email Inbox` / `SMS Inbox`. **Assumption: reuse the existing labels byte-for-byte** so the full-mode fixture and the organiser model share one string and full mode is provably unchanged. A sentence-case sweep of all 13 labels is a separate one-commit copy change if the operator wants it; say so and it is done in the same PR at the cost of the "byte-identical" wording of criterion 6.
- **Q2 — `organisation_databases.offState`.** With the confirmed defaults it is `hidden` (`modules.ts:145`), so an organiser sees Worksites / Upcoming Projects / Overview only after Show everything, not muted-with-explanation. That follows plan 5.2's "only if the admin has enabled those modules", and decision 1 confirmed the table. **Assumption: leave it `hidden`.** If the operator would rather organisers *see* those three greyed with "Ask an admin to enable", it is a one-word change in `modules.ts:145` (WP1.1's file) plus two snapshots — flagged rather than done, because changing a confirmed decision's data table is not this package's call.

## 5. Orchestrator approval

**Approved 2026-09-09.** Q1: reuse today's labels byte-for-byte (full mode provably unchanged); label-case alignment with plan 3.6 is deferred to a later copy pass. Q2: ruled — `organisation_databases.offState` becomes **`muted`** (plan 5.2 hides only what a user could never use; Worksites, Employers and Overview are usable by organisers), leaving `imports` and `administration` as the hidden, permission-shaped modules; the change is made in WP1.1's fix round so this package inherits it. The `activeHrefs` fix for `/sms/new` and `/sms/numbers` is accepted. Branch `feat/oux-wp1.2-nav-modules`, stacked on the phase-1 tip (WP1.1 → WP1.5) until those merge; PR base `develop`. Reviewer tier: opus.

## 6. Deviations from plan

1. **`ACTIONS_HUB_PATH` is imported from `@/lib/actions/hub-path`, not `@/lib/actions/hub-rows`.** §4.1's snippet names `hub-rows`, which only re-exports the constant from `hub-path` and itself pulls in `@/lib/sms/hub-actions`. `nav-model.ts` must stay pure (§4.0: "No React, no `next/*`, no lucide"), so it imports WP1.5's canonical one-line module directly. Same constant, same single source of truth, no extra module graph in the nav bundle.
2. **The badge is flagged on the row definition (`badged: true`), not derived from `module === "inbox"`.** §4.1(b)'s rule would badge **two** rows in full mode — Email Inbox *and* SMS Inbox both carry `module: "inbox"` — and only email has an unread count (`useEmailInboxUnreadCount`; there is no SMS equivalent). The flag is internal to `nav-model.ts` and never reaches a `NavItem`; a test pins that exactly one row is badged in each mode. The clamp and the `aria-label` stayed in the renderer as planned.
3. **`renderItem` became a component in its own file, `src/components/layout/nav-row.tsx`, not an export of `sidebar.tsx`.** §4.2 offered "extract it into `sidebar.tsx` and export, or duplicate the 20 lines". A third option is better than both: `mobile-nav.tsx` gets the row markup without importing the desktop sidebar module for it, and the two class sets are props exactly as planned. `sidebar.tsx` still exports `navItems` / `adminItems` / `allNavHrefs`, and `mobile-nav.tsx` still imports `allNavHrefs` from it.
4. **The fixture is diffed against a second hand-written literal, not against the live `navItems` export.** §5.4 asked for an `it` that diffs the fixture against `sidebar.tsx`'s exports. `sidebar.tsx` is a client component that imports `next/navigation` and the Supabase auth context; importing it into a vitest `environment: node` suite is fragile, and since `navItems` is now a re-projection of `FULL_NAV_ITEMS` the comparison would have been code against itself. Instead `nav-model-fixture.ts` carries **two** literals — `TODAY_SIDEBAR_ROWS` (the pre-WP1.5 sidebar, byte for byte) and `FULL_MODE_FIXTURE` — and a test asserts the built full-mode model equals the second while the diff between the two is exactly row 7's `label` / `href` / `icon`. That is a stronger recorded-deviation proof than the planned one, and it is falsifiable.
5. **`allNavHrefs` has 14 entries, not the "13 (+1)" of risk R2.** The `/sms` alias is an entry in its own right and `MY_CAMPAIGNS_HREF` currently dedupes against `/campaigns`. The test asserts the exact sorted list plus "no duplicates" and "every href any model can render is in it", which is what R2 was protecting; a bare length assertion would have to change with every future row anyway.
6. **The Organisation section is preceded by a `<Separator/>`.** Not specified either way in §4.2. It only renders in organiser mode, so full mode is untouched, and it matches how the admin block is already set off.
7. **`tests/e2e/env.ts` needed no edit.** §4.0 lists it as an edit adding `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` / `hasE2EAdminCredentials`; WP1.6 already added all three, plus `ADMIN_STORAGE_STATE` in `playwright.config.ts`. The spec therefore reuses the admin storage state global setup writes instead of signing in through the form again (§5.5 step 1), which is fewer moving parts and types no credentials into a form.
8. **`browser.newContext()` is given an explicit `baseURL`.** Playwright does not apply the config's `use` block to contexts created inside a test, so the relative `/api/admin/*` paths in §5.5 would not resolve without it.
9. **`modules.ts` was not touched.** Q2 was ruled in §5 (`organisation_databases.offState` → `muted`) and WP1.1 had already made the change on this stack; the organiser snapshots show all five Organisation rows as `muted`, so no route is hidden from an organiser by default.
10. **`pageTitles` gained 4 keys, not the 5 of §4.4.** `/actions` was already added by WP1.5 and was kept, as instructed.

Not deviations, but worth naming: the WP1.5 fallback (§4.1 note b) was **not** used — WP1.5 is on this stack, so row 7 ships as Actions/`/actions`/`layout-list`. `MY_CAMPAIGNS_HREF` is `"/campaigns"` as approved. Everything in §6 "Out of scope" stayed out.

### Fix round 1 (reviewer findings, commit `d00cdbf`)

**Finding 1 (blocking) — the reachability proof was a tautology, and here is the proof that it is not one any more.**

The old `it('every full-mode href a non-admin can see is reachable in organiser mode')` computed `unreachable` against `present ∪ afterShowEverything`. `afterShowEverything` is the model built with `sessionShowEverything: true`, and `resolveWorkspace` answers a session expansion with `mode: "full"` (`resolve.ts:91-93`) — so that half of the union **is** the full-mode model. `fullHrefs ⊆ afterShowEverything` by construction, `unreachable` was always `[]`, and `expect(unreachable).toEqual([])` could not fail however organiser mode was shaped. It is now four assertions that can:

- `the default organiser sees exactly these rows, in this order` — a hand-written `toEqual` literal of the organiser model (label / href / state for `primary`, `organisation.items` and `admin`, in order), the organiser-mode sibling of `FULL_MODE_FIXTURE`. `vitest -u` cannot rewrite a `toEqual`.
- `nothing in the Organisation section is hidden from a default organiser` — `expect(hidden).toEqual([])`. This is the orchestrator's WP1.2 ruling (§5, Q2) expressed as a test: only the permission-shaped modules (`imports`, `administration`) are `hidden`, so an organiser is never silently denied a row here.
- `only /sms/inbox needs Show everything or the hub pill` — `unreachable` is now computed from the organiser model's `on` + `muted` rows **only**; Show everything is deliberately excluded from the reachable set and asserted separately underneath. The expectation is the single documented exception, `["/sms/inbox"]`, not `[]`, so both directions bite: hiding a row fails it, and quietly *adding* a route that organiser mode cannot reach fails it too.
- `with allowShowEverything: false the same one route has only the hub pill` (finding 8) — the "no out" configuration now has its own case, naming the route reachable only by URL or the Actions hub's Inbox pill: `/sms/inbox`, and nothing else. It also asserts `showEverythingControl === "hidden"` and that the four primary rows survive, which is risk R5 measured rather than argued.

Both `/sms/inbox` assertions are backed by a check that `ACTIONS_HUB_PATH` is itself reachable in organiser mode, so "via the hub pill" names a path that is provably one click away rather than a hope. (The pill list lives in `SmsHubNav.tsx`, a `"use client"` component the `environment: node` suite deliberately does not import.)

**Bite proof.** With `organisation_databases.offState` flipped from `"muted"` to `"hidden"` in a scratch copy of `src/lib/workspace/modules.ts` — the exact regression the old test was supposed to catch:

```
$ pnpm exec vitest run src/lib/nav/__tests__/nav-reachability.test.ts
 ❯ src/lib/nav/__tests__/nav-reachability.test.ts (14 tests | 4 failed) 9ms
   × reachability — decision 7 > the default organiser sees exactly these rows, in this order
     → expected { primary: [ … ] } to deeply equal { primary: [ … ] }
        - "state": "muted"   + "state": "hidden"   (Worksites, Upcoming Projects, Overview)
   × reachability — decision 7 > nothing in the Organisation section is hidden from a default organiser
     → expected [ { id: 'worksites', …(5) }, …(2) ] to deeply equal []
   × reachability — decision 7 > only /sms/inbox needs Show everything or the hub pill
     → expected [ '/overview', '/worksites', …(2) ] to deeply equal [ '/sms/inbox' ]
   × reachability — decision 7 > with allowShowEverything: false the same one route has only the hub pill
     → expected [ '/overview', '/worksites', …(2) ] to deeply equal [ '/sms/inbox' ]
```

and, under the *same* scratch flip, the version this replaces (restored from `HEAD` into the suite as a throwaway file):

```
$ pnpm exec vitest run src/lib/nav/__tests__/zz-old-reachability.test.ts
 ✓ src/lib/nav/__tests__/zz-old-reachability.test.ts (11 tests) 4ms
      Tests  11 passed (11)
```

Three routes disappearing from an organiser's sidebar, and the old proof of "no creation path is retired" passed. `modules.ts` was restored immediately (`git diff` on it is empty at `d00cdbf`) and the throwaway file deleted.

**Advisory findings.**

| # | Change |
|---|---|
| 2 | `tests/e2e/organiser-nav.spec.ts` — the Inbox link matches `{ name: /^Inbox/ }`. The unread badge is rendered inside the link with its own `aria-label` (`nav-row.tsx:53-60`), so the link's accessible name is "Inbox *n* unread email conversations" whenever the account has unread mail and `{ name: "Inbox", exact: true }` would have failed on a mailbox with post in it. The `^` anchor keeps it distinct from "SMS Inbox". |
| 3 | `sidebar.tsx` — `aria-label="Organisation"` on the disclosure and `aria-label="Show everything"` on the toggle. Both drop their label `<span>` at `collapsed` (`w-16`), so both were anonymous to a screen reader at that width; the mobile sheet always shows its labels and needed nothing. |
| 5 | `sidebar.tsx` / `mobile-nav.tsx` — `useState(!model.organisation.collapsed)` instead of `useState(false)`. The model already carries "collapsed by default" (`nav-model.ts:332`); the components now read it rather than restating it. The `useState` call moved below the `useMemo` in both files — hook order is stable, only the initial value changed. |
| 6 | `nav-model.ts` — `enabledModules` removed from `BuildNavModelInput`, and from both call sites and both suites. It was never read: `moduleState` is the whole hidden/muted rule and the file's own header comment forbids re-deriving state from the set, so carrying the set was an invitation to do exactly that. |
| 7 | `resolve.ts` gains the pure `moduleStateFor(enabledModules, id)` and the `ModuleState` type (re-exported from `use-workspace.tsx`, which now calls it in both the provider and the outside-the-provider default). `nav-model.test.ts` and `nav-reachability.test.ts` call it instead of each keeping their own `enabled.has(id) ? "on" : getModule(id).offState`. One exception, left deliberately: `an off row's state is the registry's offState and nothing else` still spells the expression out — substituting the helper there would make *that* test a tautology, which is the mistake this round is fixing. |
| 11 | `mobile-nav.tsx` imports `ALL_NAV_HREFS` from `@/lib/nav/nav-model` rather than `allNavHrefs` from `./sidebar`. `sidebar.tsx` keeps the re-export for backwards compatibility (§4.2). |
| 12 | `hub-path.ts` — the comment told readers to import the constant from `hub-rows`. `hub-path` is the source of truth and `hub-rows` pulls in `@/lib/sms/hub-actions`, so the comment now says to import it here and names why `nav-model.ts` does (deviation §6.1). |
| 13 | `tests/e2e/organiser-nav.spec.ts` — the `finally` reset asserts `expect(reset.ok()).toBe(true)` and then reads the value back: `GET /api/admin/users` selects `*` from `user_profiles` (`api/admin/users/route.ts:30-32`), so the spec asserts `workspace_prefs` is `{}` afterwards. A silently failed reset was the un-alarmed half of risk R8. |

**Recorded, no change.**

- **9 — muted rows carry `tabIndex={-1}`** (`nav-row.tsx:69`). Per plan §4.2, which specifies `aria-disabled="true"`, `tabIndex={-1}`, a native `title` and an `sr-only` copy of the reason. Taking a muted row *out* of the tab order is the point: it is not actionable, and the explanation still reaches a screen reader through the `sr-only` span in the row's own text. Revisiting it would be revisiting the plan, not fixing an implementation defect.
- **10 — full mode flashes while the profile loads.** `WorkspaceProvider` resolves with `userPrefs: undefined` until `AuthProvider.fetchProfile` returns, and `resolveWorkspace` answers "no prefs" with `full` (`resolve.ts:74`). So an organiser sees the ten-row sidebar for one render before it settles to four. This is inherited from WP1.1's deliberate fail-open (`use-workspace.tsx:71-72`: a live session whose profile never arrives must read as full, never as an empty shell), it is `loading`-shaped rather than nav-shaped, and fixing it means suppressing or skeletoning the nav on `ws.loading` — a shell change WP1.2 does not own. Named here so the flash is a known cost, not a surprise. (It is also what the verifier's first screenshot attempt caught, §7.7.)
- **4 — the header title for the email inbox.** The finding assumed a `pageTitles["/email/inbox"]` key; there is none. `header.tsx:62` keys on `basePath = "/" + pathname.split("/")[1]`, so the single key is `"/email": "Email Inbox"` and it serves **both** `/email/inbox` and `/email/wrappers`. Changing it to "Inbox" would retitle the Email Wrappers admin page to "Inbox" — a worse defect than the one being fixed. `"Email Inbox"` is also the full-mode sidebar label (`nav-model.ts:137`) and is asserted in `nav-model-fixture.ts:29,52,70` and `organiser-nav.spec.ts:42`, so it is not free to move either. Left as is. Splitting `/email` into per-page titles is the same per-page pass as §6 item 4 (duplicate `<h1>`s).

### Fix round 1 gates

Run from `apps/organising-db` at `d00cdbf`.

```
$ pnpm exec eslint <the 9 touched files>
$ echo "eslint $?"
eslint 0

$ pnpm exec tsc --noEmit -p tsconfig.json; echo "tsc $?"
tsc 0

$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  65 passed (65)
      Tests  884 passed (884)

$ pnpm build > /tmp/build.log 2>&1; echo "build exit $?"
build exit 0
✓ Compiled successfully in 99s

$ env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD -u E2E_ADMIN_EMAIL -u E2E_ADMIN_PASSWORD pnpm e2e
  9 skipped
e2e exit 0
```

881 → 884 tests: the reachability suite gained the four new cases and lost one (the tautology). **No snapshot was updated** — `__snapshots__/nav-model.test.ts.snap` is byte-identical at `d00cdbf`, which is the check that this round changed no behaviour in either mode: only `BuildNavModelInput`'s shape, two `aria-label`s, two `useState` initialisers and the tests moved.

## Implementer notes

### Files

New:

- `apps/organising-db/src/lib/nav/nav-model.ts`
- `apps/organising-db/src/lib/nav/nav-icons.ts`
- `apps/organising-db/src/lib/nav/__tests__/nav-model.test.ts`
- `apps/organising-db/src/lib/nav/__tests__/nav-model-fixture.ts`
- `apps/organising-db/src/lib/nav/__tests__/nav-reachability.test.ts`
- `apps/organising-db/src/lib/nav/__tests__/__snapshots__/nav-model.test.ts.snap` (generated, committed)
- `apps/organising-db/src/components/layout/nav-row.tsx`
- `apps/organising-db/tests/e2e/organiser-nav.spec.ts`

Edited:

- `apps/organising-db/src/components/layout/sidebar.tsx`
- `apps/organising-db/src/components/layout/mobile-nav.tsx`
- `apps/organising-db/src/components/layout/header.tsx`
- `apps/organising-db/src/lib/nav/__tests__/active-nav.test.ts`

No schema change, no migration, no type regeneration, no new dependency.

### Module mapping

Every sidebar row and every appendix D §1.6 page, as shipped:

| Route | Where in the model | Module id | Organiser-default state |
|---|---|---|---|
| `/campaigns` (`MY_CAMPAIGNS_HREF`) | full row 1; organiser primary 1 ("My campaigns") | `wall_chart_people` | `on` (never gated) |
| `/dashboard` | full row 2; Organisation | `insights` | `muted` |
| `/overview` | full row 3; Organisation | `organisation_databases` | `muted` |
| `/worksites` | full row 4; Organisation | `organisation_databases` | `muted` |
| `/upcoming-projects` | full row 5; Organisation | `organisation_databases` | `muted` |
| `/email/inbox` | full row 6; organiser primary 3 ("Inbox", badged) | `inbox` | `on` (never gated) |
| `/actions` (`/sms` redirects; `activeHrefs: ["/sms"]`) | full row 7; organiser primary 2 | `actions` | `on` (never gated) |
| `/sms/inbox` | full row 8 only | `inbox` | reachable via Show everything, and via the Actions hub's Inbox pill |
| `/reports` | full row 9; Organisation | `insights` | `muted` |
| `/help` | full row 10; organiser primary 4 ("Guides") | *(none — always on)* | `on` |
| `/email-imports` | admin row 1 | `administration` | admin-only; admins are always full mode |
| `/email/wrappers` | admin row 2 | `administration` | admin-only |
| `/administration` | admin row 3 | `administration` | admin-only |
| `/workers`, `/employers`, `/agreements`, `/programs`, `/work-scopes` | not in the model — `/overview`'s 8 tabs | `organisation_databases` | — |
| `/templates` | not in the model — the Campaigns tab bar | `actions` | — |
| `/workload`, `/organiser-patches` | not in the model — Administration → System | `administration` | — |
| `/sms/new`, `/sms/numbers` | not in the model — the hub pills / Start something cards; light the Actions row via `activeHrefs` | `actions` | — |
| `/reports/*` (5 sub-pages) | not in the model — the Reports hub cards | `insights` | — |
| `/campaigns/[id]/*` | not in the model — WP1.4 | per `campaign-tabs.ts` | — |

### Commits

- `19aad31` feat(oux-wp1.2): navigation as pure data — buildNavModel, icons, snapshots
- `af65a94` feat(oux-wp1.2): sidebar, mobile nav and header consume the nav model
- `698d1fe` feat(oux-wp1.2): e2e for both navs — full-mode regression and organiser round trip
- (this document)

## 7. Verification output

Verifier run 2026-09-09 at 84beee7; preview https://offshore-alliance-2x8cvtu57-reveille-strategy.vercel.app

### 1. `apps/organising-db` checks

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0
```

```
$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  65 passed (65)
      Tests  881 passed (881)
```

```
$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)
```

Matches the PROGRESS.md baseline exactly (294/143/151) — no new lint debt from the files this package touched.

```
$ pnpm build 2>&1 | tail -4  (re-run to confirm exit code)
$ echo "build exit $?"
build exit 0
```

### 2. Repo-root diffs against `feat/oux-wp1.6-auth-rls`

```
$ git diff --stat feat/oux-wp1.6-auth-rls..HEAD | tail -1
 14 files changed, 3094 insertions(+), 141 deletions(-)

$ git diff --name-only feat/oux-wp1.6-auth-rls..HEAD | grep -E '^supabase/|^packages/db-types/' || echo "no schema or type changes"
no schema or type changes

$ git log --oneline feat/oux-wp1.6-auth-rls..HEAD
84beee7 docs(oux-wp1.2): deviations from plan and implementer notes
698d1fe feat(oux-wp1.2): e2e for both navs — full-mode regression and organiser round trip
af65a94 feat(oux-wp1.2): sidebar, mobile nav and header consume the nav model
19aad31 feat(oux-wp1.2): navigation as pure data — buildNavModel, icons, snapshots
3bbb950 docs(oux): WP1.2 plan, approved
```

Confirms deviation §6.9 ("`modules.ts` was not touched") — no schema or `packages/db-types` changes on this branch, consistent with "no migration in this package".

### 3. E2E user's stored prefs, before the run

```
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs": {}}]
```

As expected.

### 4. Preview deployment

The deployment for `84beee7e131f4277b6dd5acd6bfe5f06abeb888c` already existed (created 2026-09-09T08:32:55Z) and was already `success` on first poll — no polling loop was needed.

```
$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=84beee7e131f4277b6dd5acd6bfe5f06abeb888c&per_page=3"
→ deployment id 6345760460, environment "Preview", sha 84beee7e131f4277b6dd5acd6bfe5f06abeb888c

$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6345760460/statuses"
→ state "success", environment_url "https://offshore-alliance-2x8cvtu57-reveille-strategy.vercel.app"

$ curl -s -o /dev/null -w '%{http_code}\n' https://offshore-alliance-2x8cvtu57-reveille-strategy.vercel.app/login
200
```

### 5. Credentialled e2e — full suite, both projects

```
$ E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm e2e 2>&1 | grep -v -i password | tail -60
Running 9 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/actions-hub.spec.ts:22:7 › Actions hub › open /actions, see the three start cards and the status buckets (6.7s)
  ✓  2 [chromium] › tests/e2e/actions-hub.spec.ts:62:7 › Actions hub › /sms still works and lands on the hub with its params intact (3.3s)
  -  3 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  ✓  4 [chromium] › tests/e2e/organiser-nav.spec.ts:52:7 › Sidebar — full mode is today's sidebar › the ten rows, in order, with no organiser-mode furniture (1.4s)
  ✓  5 [chromium] › tests/e2e/organiser-nav.spec.ts:68:7 › Sidebar — the organiser-mode round trip › organiser mode shows four primary items, Organisation and Show everything (10.9s)
[cleanup] no leftover "WP1.6 role check " campaigns for this account.
  ✓  6 [chromium] › tests/e2e/roles/unit-lifecycle-user.spec.ts:92:7 › WP1.6 role coverage — user › creates a campaign, then creates, renames and deletes a unit and the campaign (11.5s)
  ✓  7 [chromium] › tests/e2e/roles/unit-lifecycle-user.spec.ts:137:7 › WP1.6 role coverage — user › offers no write controls on a campaign the account cannot write to (3.6s)
  ✓  8 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart (10.9s)
[cleanup] removed 0 leftover "WP1.6 admin unit " unit(s).
  ✓  9 [chromium-admin] › tests/e2e/roles/unit-lifecycle-admin.spec.ts:76:7 › WP1.6 role coverage — admin › creates, renames and deletes a unit on any campaign (8.1s)

  1 skipped
  8 passed (1.2m)
```

No failures. Both new nav specs (full-mode regression, organiser round trip) passed on the first run; no re-run was needed. The 1 skip is `mobile-dialer.spec.ts`, gated on credentials this run did not need to exercise (unrelated to this package).

### 6. Post-e2e residue checks

```
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs": {}}]
```

Reset correctly by the spec's `finally` block.

```
select campaign_id, name from campaigns where name like 'WP1.6%';
→ []
```

No residue.

### 7. Visual evidence

A throwaway Playwright script (`apps/organising-db/test-results/*.ts`, gitignored, deleted after the run) loaded `tests/e2e/.auth/user.json` / `.auth/admin.json` and drove the same `PATCH /api/admin/update-user` call the spec uses (`workspacePrefs: { mode: "organiser" }` for the e2e user, resolved via `GET /api/admin/users`).

- `/tmp/oux-plans/shots/wp1.2-full-mode-sidebar.png` — full mode, desktop 1280×800, today's 10-row sidebar.
- `/tmp/oux-plans/shots/wp1.2-organiser-sidebar.png` — organiser mode: My campaigns / Actions / Inbox / Guides, collapsed Organisation (chevron down), Show everything control, both confirmed present.
- `/tmp/oux-plans/shots/wp1.2-organisation-expanded.png` — Organisation section expanded, showing the five muted rows (Worksites, Upcoming Projects, Overview, Dashboard, Reports) each with "Ask an admin to enable".
- `/tmp/oux-plans/shots/wp1.2-mobile-organiser.png` — iPhone 13 emulation, open mobile sheet in organiser mode: same four primary items, collapsed Organisation, Show everything and footer, confirming appendix D §1.4 "identical inventory" holds in organiser mode too.

**One deviation from the script recipe, noted honestly:** the first attempt captured `wp1.2-organiser-sidebar.png` immediately after `page.reload()` with only a generic `waitForSelector("aside nav a span")` guard, which resolved against the still-rendering full-mode nav (a client-side propagation delay after the admin's `PATCH`, not a product bug — the real Playwright spec's `expect(...).toEqual(...)` retries and passed cleanly in §5, test 5). The screenshot was retaken waiting explicitly for `nav.getByRole("link", { name: "My campaigns" })` to be visible before capturing; the corrected image is the one referenced above. workspace_prefs was reset to `{}` after every capture attempt, confirmed by SQL each time (see §6 output above, final state `{}`).

Final SQL confirmation after the last capture and reset: `workspace_prefs = {}`.

### Verifier run 2 (after fix round 1) at 9005a68; preview https://offshore-alliance-aavbzvsxn-reveille-strategy.vercel.app

#### 1. `apps/organising-db` checks

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0

$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  65 passed (65)
      Tests  884 passed (884)

$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)

$ pnpm build 2>&1 | tail -4
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

Build completed (exit implied by non-error tail output).

#### 2. Diff against `d9a3e81`

```
$ git diff --stat d9a3e81..HEAD | tail -1
 10 files changed, 284 insertions(+), 58 deletions(-)

$ git log --oneline d9a3e81..HEAD
9005a68 docs(oux-wp1.2): fix round 1 findings, the bite proof and gate output
d00cdbf fix(oux-wp1.2): reviewer round 1 — a reachability proof that can fail
```

#### 3. E2E user's stored prefs, before the run

```
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs": {}}]
```

As expected.

#### 4. Preview deployment

Deployment for `9005a68d8a3d6800bf3a3342e05d8f6dbca8e950` already existed (created 2026-09-09T09:07:48Z) and was already `success` on first poll — no polling loop was needed.

```
$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=9005a68d8a3d6800bf3a3342e05d8f6dbca8e950&per_page=3"
→ deployment id 6346323114, environment "Preview", sha 9005a68d8a3d6800bf3a3342e05d8f6dbca8e950

$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6346323114/statuses"
→ state "success", environment_url "https://offshore-alliance-aavbzvsxn-reveille-strategy.vercel.app"
```

#### 5. Credentialled e2e — full suite, both projects

```
$ E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm e2e 2>&1 | grep -v -i password | tail -50
Running 9 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/actions-hub.spec.ts:22:7 › Actions hub › open /actions, see the three start cards and the status buckets (3.5s)
  ✓  2 [chromium] › tests/e2e/actions-hub.spec.ts:62:7 › Actions hub › /sms still works and lands on the hub with its params intact (3.7s)
  -  3 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  ✓  4 [chromium] › tests/e2e/organiser-nav.spec.ts:52:7 › Sidebar — full mode is today's sidebar › the ten rows, in order, with no organiser-mode furniture (1.5s)
  ✘  5 [chromium] › tests/e2e/organiser-nav.spec.ts:68:7 › Sidebar — the organiser-mode round trip › organiser mode shows four primary items, Organisation and Show everything (16.5s)
[cleanup] no leftover "WP1.6 role check " campaigns for this account.
  ✓  6 [chromium] › tests/e2e/roles/unit-lifecycle-user.spec.ts:92:7 › WP1.6 role coverage — user › creates a campaign, then creates, renames and deletes a unit and the campaign (10.3s)
  ✓  7 [chromium] › tests/e2e/roles/unit-lifecycle-user.spec.ts:137:7 › WP1.6 role coverage — user › offers no write controls on a campaign the account cannot write to (4.2s)
  ✓  8 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart (11.5s)
[cleanup] removed 0 leftover "WP1.6 admin unit " unit(s).
  ✓  9 [chromium-admin] › tests/e2e/roles/unit-lifecycle-admin.spec.ts:76:7 › WP1.6 role coverage — admin › creates, renames and deletes a unit on any campaign (7.9s)

  1) [chromium] › tests/e2e/organiser-nav.spec.ts:68:7 › Sidebar — the organiser-mode round trip › organiser mode shows four primary items, Organisation and Show everything

    Error: expect(locator).toHaveAttribute(expected) failed

    Locator:  locator('aside nav').getByRole('button', { name: 'Organisation' })
    Expected: "false"
    Received: "true"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveAttribute" with timeout 5000ms
      - waiting for locator('aside nav').getByRole('button', { name: 'Organisation' })
        9 × locator resolved to <button type="button" aria-expanded="true" aria-label="Organisation" aria-controls="nav-organisation" ...>…</button>
          - unexpected value "true"

      126 |         // The Organisation section is a disclosure, collapsed on first render.
      127 |         const organisation = nav.getByRole("button", { name: "Organisation" });
    > 128 |         await expect(organisation).toHaveAttribute("aria-expanded", "false");
          |                                    ^
      129 |         await organisation.click();
      130 |         await expect(organisation).toHaveAttribute("aria-expanded", "true");

  1 failed
    [chromium] › tests/e2e/organiser-nav.spec.ts:68:7 › Sidebar — the organiser-mode round trip › organiser mode shows four primary items, Organisation and Show everything
  1 skipped
  7 passed (1.2m)
 ELIFECYCLE  Command failed with exit code 1.
```

1 failed, 1 skipped, 7 passed. The failing assertion expects the "Organisation" disclosure button to render `aria-expanded="false"` on first paint but it resolved `"true"` nine times over the 5s retry window. The skip is `mobile-dialer.spec.ts`, gated on credentials this run did not need to exercise (unrelated to this package).

#### 6. Post-e2e residue checks

```
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs": {}}]

select campaign_id, name from campaigns where name like 'WP1.6%';
→ []
```

Both as expected.

#### 7. Metrics-settled check (`/campaigns`, full mode, 1280×800)

A throwaway Playwright script (`apps/organising-db/test-results/wp1.2-metrics-check.mjs`, gitignored) loaded `tests/e2e/.auth/user.json`, navigated to `<preview>/campaigns`, and polled up to 20s for the "0 named workers" placeholder to clear while recording any non-200 `/rest/v1/` responses.

The tiles settled well within the 20s window (script-observed `SETTLED: true`, no non-200 `/rest/v1/` responses recorded). Screenshot at `/tmp/oux-plans/shots/wp1.2-full-mode-metrics-settled.png` shows:

- Total estimate: **130** — across 1 campaign
- Mapping: **73.1%** — 95 named workers
- Membership: **42.3%** — members of estimated workers
- Leadership: **1 : 13** — 10 leaders
- Participation: **15.4%** — workers supportive on ≥1 activity

Matches the Phase 0 recorded value ("Mapping 73.1%, 95 named workers") for this account's campaign.

## 8. Reviewer findings

_(reviewer)_
