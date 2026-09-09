# WP1.7 — Guides and hints

Planner output. Repository `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance`, app `apps/organising-db`.
Branch checked out while planning: `feat/oux-wp1.4-campaign-workspace` (the phase-1 stack: WP1.1 → WP1.5 → WP1.6 → WP1.2 → WP1.3, with WP1.4 being implemented alongside this plan). **Do not switch branches.**
Every path below is relative to `apps/organising-db/` unless it starts with `supabase/`, `scripts/` or `docs/`.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP1.7 Guides and hints.** Standard implementer updates `public/help-videos/manifest.json` routes and adds first-use hints on the group selector and rating control; re-recording OVERVIEW is a human task logged in the ledger. Depends on WP1.4.

### 1.2 Decisions consumed (`docs/organiser-ux-review/DECISIONS.md`, "Answers")

- **Decision 9 — Confirmed** (`DECISIONS.md:18`). "About ten clips re-recorded across phases 1 to 3 (OVERVIEW in phase 1; B1–B3 and C1–C3 in phase 2; A4 and A5 in phase 3). Re-recording is human work logged in the ledger; **manifest updates are in scope**." So: this package edits the manifest and writes the ledger rows. It records nothing.
- **Decision 1 — Confirmed** (`DECISIONS.md:10`). Guides is a primary organiser-mode item at `/help`. **Already shipped by WP1.2** — `src/lib/nav/nav-model.ts:183-190` defines the `guides` row (`label: "Guides"`, `href: "/help"`, deliberately **no** `module` id, with the reason in the comment at `:181-183`), and `:245-251` puts it in `ORGANISER_PRIMARY`. WP1.7 therefore changes **nothing** in navigation. Stated here so the reviewer does not look for a nav diff.

### 1.3 Standing constraints (planner preamble + `PROGRESS.md` standing notes)

- Never touch production (`gteygwfgjvczanmrwgbr`). Dev is `dpnnmkhabysfdogllsyh`. Type regen is `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` **from the repo root** (`package.json:9`), never without the variable.
- Migrations: never edit an applied file. The live schema is `supabase/migrations/20260908050000_baseline_schema.sql`; `supabase/migrations_legacy/` is audit-only. New work is a new timestamped file.
- Nothing is removed from the product. Full mode keeps working. **No clip is removed from the manifest and the manifest keeps its schema.**
- No view state in `localStorage` for anything that changes what an organiser sees (plan 5.1 principle 6, plan §7 "What not to do"). A hint's seen/dismissed state is exactly such state and is therefore stored **server-side per user** (§2.3).
- Plan 3.6 terminology in every user-facing string: Who's in, Group, Unit, Unassigned, Not in any group, Standalone, Strategic plan, Colour by.
- Lint budget: touched files lint clean on their changed lines; the total error count must not rise above the 143/151 baseline.
- Verification from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`. Preview-based `pnpm e2e` with operator-supplied `E2E_USER_*`.

### 1.4 Sections read

`docs/ORGANISER_UX_REVIEW_AND_PLAN.md` §3.6 (`:122-134`), §4 principle 15 (`:187`), §5.1 (`:192-201`), §5.8 (`:319-333`), §7 phase 1 (`:446-456`), §7 "What not to do" (`:485-493`). `docs/organiser-ux-review/appendix-D-navigation-roles.md` §1.2 row 10 and §10 item 12. `docs/HOW_TO_VIDEOS_WORKPLAN.md` §5.1–5.2 (`:523-545`). `docs/HOW_TO_VIDEOS_HANDOFF.md` §5–§8 (`:52-116`). `/tmp/oux-plans/wp1.3.md`, `/tmp/oux-plans/wp1.4.md` §2.1.3 and §2.2, `/tmp/oux-plans/wp1.5.md` §1.1.

---

## 2. Plan

### 2.0 The shape of the change, in one paragraph

Three things. **(a)** Six route additions and zero text changes in `public/help-videos/manifest.json`, plus a vitest suite that proves every `associatedRoutes` glob in the file resolves to a real Next.js route and that the six additions are still present — the manifest is a **generated** file (`scripts/video-pipeline/publish-to-app.mjs:44` overwrites it wholesale), so the test is the alarm that catches the next regeneration silently reverting the edit. **(b)** A pure hint registry (`src/lib/hints/`) carrying two entries — the rating-control hint, wired; the group-selector hint, present as data and marked `pending: "WP2.4"` because the control it points at does not exist until WP2.4 — plus a small non-modal dismissible callout wired to exactly one wall-chart tile, whose per-user "seen" state lives in a new owner-only table (`user_hint_dismissals`), never in `localStorage` and never in `user_profiles.workspace_prefs`. **(c)** Two rows in the ledger's human-task table and a five-line note in `docs/HOW_TO_VIDEOS_HANDOFF.md` §6 telling whoever re-records to re-apply the manifest's route edits to the clip specs.

---

### 2.1 Manifest routes — the clip-by-clip finding

#### 2.1.1 What consumes `associatedRoutes` today: nothing

`src/app/(dashboard)/help/page.tsx` is the only consumer of the manifest. Its `Clip` interface (`:7-21`) does **not declare `associatedRoutes` or `routeWeight` at all**; it fetches the file at `:42-47`, filters by a free-text search over `title + summary + tags + seriesName` at `:53-59`, groups by series at `:61-65` and renders. There is no route matcher anywhere in `src` — `grep -rn "associatedRoutes" src` returns nothing.

So the context-aware help drawer designed in `docs/HOW_TO_VIDEOS_WORKPLAN.md:543` ("reads the current route and matches it against each video's `associatedRoutes` (glob match), ranks by `routeWeight`") **was specified and never built**. `associatedRoutes` is currently inert metadata carried for a future consumer. That does not make it worthless — it is the record of which screen each clip teaches, and appendix D §10 item 12 names it as the hook a campaign-first IA would use — but it does change what "fixing the routes" can be verified against. It is verified structurally (every glob resolves to a route that exists), not behaviourally (no user-visible behaviour changes). **Say this plainly in the PR body**; a reviewer who expects a visible change from part (a) has been misled.

#### 2.1.2 The route surface after WP0.3, WP1.2–WP1.5, WP1.4

Facts the audit is against, all verified on this branch:

- **`/my-campaigns` exists** — `src/app/(dashboard)/my-campaigns/page.tsx` (WP1.3). It is the organiser-mode home and carries the "New campaign" button (`my-campaigns/page.tsx:120`) and the `CreateCampaignDialog` mount (`:107`, imported at `:21`).
- **`/actions` exists** — `src/app/(dashboard)/actions/page.tsx` → `ActionsHubPage` (WP1.5). It lists SMS, **email sends and call lists** and carries "Start something" cards for all three.
- **`/sms` is a redirect** — `src/app/(dashboard)/sms/page.tsx:10-26` carries every search param to `ACTIONS_HUB_PATH`. `/sms/new`, `/sms/inbox`, `/sms/numbers` are untouched route segments.
- **Campaign URLs are unchanged by WP1.4.** `/tmp/oux-plans/wp1.4.md:409-411`: *"Every `?tab=&sub=` value that resolves today resolves identically in organiser mode and renders the same component."* `resolveTabParams` gains no mode parameter (`wp1.4.md:412-415`). The organiser tabs point at existing `?tab=&sub=` pairs (`wp1.4.md:227-232`). **Therefore no `/campaigns/*` glob in the manifest needs to change for WP1.4**, and a glob on `?tab=` would be meaningless anyway (a query string is not part of a path glob).
- The full route inventory is `find src/app -name page.tsx`; 76 routes, listed in §2.5's test fixture.

#### 2.1.3 Clip-by-clip audit — all 19

Reading order is the file's own (`public/help-videos/manifest.json`). "Route line" is the `associatedRoutes` array's first line in that file.

| # | Clip | Routes today (line) | Still matches the screen it teaches? | Change |
|---|---|---|---|---|
| 1 | `OVERVIEW` | `/campaigns`, `/campaigns/*` (`:26-29`) | Partly. Both resolve, but the organiser's home is now `/my-campaigns` (WP1.3) and `/campaigns` is a full-mode / "See all campaigns" surface. | **Add `/my-campaigns`** |
| 2 | `A1` Add an employer | `/employers`, `/employers/*` (`:61-64`) | Yes. Both routes exist and are unchanged. | none |
| 3 | `A2` Add worksites | `/worksites`, `/worksites/*` (`:96-99`) | Yes. | none |
| 4 | `A3` Import workers | `/workers`, `/workers/*` (`:134-137`) | Yes. | none |
| 5 | `A4` Create a campaign — the manual way | `/campaigns`, `/campaigns/new/manual` (`:171-174`) | Partly. Both resolve. But the organiser's create button now lives on `/my-campaigns` (`my-campaigns/page.tsx:120`). | **Add `/my-campaigns`** |
| 6 | `A5` Configure a campaign from Settings | `/campaigns/*/settings` (`:209-211`) | Yes. `/campaigns/[id]/settings` exists and WP1.4's Setup tab's **Basics** card links to it (`wp1.4.md:283`). | none |
| 7 | `B1` Units, groups & subgroups | `/campaigns/*` (`:246-248`) | Yes as a route. Its *vocabulary* is the pre-WP2.1 model — see §2.1.5. | none |
| 8 | `B2` Create organising units and groups | `/campaigns/*` (`:280-282`) | Yes as a route. Vocabulary: §2.1.5. | none |
| 9 | `B3` Allocate workers to units | `/campaigns/*` (`:315-317`) | Yes as a route. Vocabulary: §2.1.5. | none |
| 10 | `C1` The wall chart, explained | `/campaigns/*` (`:350-352`) | Yes. | none |
| 11 | `C2` Filter, sort & switch views | `/campaigns/*` (`:386-388`) | Yes. | none |
| 12 | `C3` Build a list and fire it | `/campaigns/*` (`:423-425`) | Yes. | none |
| 13 | `E1` The rating scale, explained | `/campaigns/*` (`:460-462`) | Yes. Its six states match `rating_scale` memory and the app. | none |
| 14 | `E2` Create and configure an assessment | `/campaigns/*` (`:494-496`) | Yes. | none |
| 15 | `E3` Rate workers | `/campaigns/*` (`:530-532`) | Yes. This is the clip the new rating hint is about (§2.3). | none |
| 16 | `D1` Email tasking | `/campaigns/*/email/*` (`:567-569`) | Incomplete. The route resolves, but a standalone email send now starts from the Actions hub's "Start something" card, which the clip's own flow ("draft first or build the list first") now also reaches. | **Add `/actions`** |
| 17 | `D2` Phone tasking: call lists & scripts | `/campaigns/*/phone`, `/campaigns/*/phone/lists/*` (`:602-605`) | Incomplete. Same reason: call lists are listed and started from `/actions` (WP1.5 §1.1). | **Add `/actions`** |
| 18 | `D3` Phone tasking: running a session | `/campaigns/*/phone/call/*`, `/campaigns/*/phone/live` (`:640-643`) | Yes. Both resolve. The dialer is reached *from a list*, not from the hub, so it gets no `/actions`. | none |
| 19 | `D4` Activist tasking & the leader webform | `/campaigns/*`, `/leader/task/*` (`:678-681`) | Yes. `src/app/leader/task/[token]/page.tsx` exists. | none |

**Six additions across four clips. No route is removed. No clip is removed. The schema is unchanged** — every added string goes into an existing `associatedRoutes` array.

Two things the audit found that are **not** changed, with the reason:

- **`/sms` is deliberately not added to anything.** It is a redirect (`sms/page.tsx:10-26`); a route matcher that fired on it would fire for one frame. `/actions` is the destination and is what gets added.
- **`routeWeight` is per-clip, not per-route** (`manifest.json:30`, and the schema in `docs/HOW_TO_VIDEOS_WORKPLAN.md:531`). So `D1` will surface on `/actions` at the same weight 9 it surfaces at on `/campaigns/*/email/*`. That is a schema limitation, not a bug; changing `routeWeight` to a per-route map **would** change the schema and is out of scope (§3). Recorded because the future drawer's author will hit it.

#### 2.1.4 Which clip descriptions name a label that changed: **none**

The task asked for every text change with its clip id. The honest answer, and the command that proves it:

```bash
cd apps/organising-db && grep -niE "scope|unalloc|sms tools|universe|no unit" public/help-videos/manifest.json ; echo "exit=$?"
# → no output, exit=1
```

None of the 19 clips' `title`, `summary` or `tags` contains "Scope", "Unallocated", "SMS Tools", "universe" or "No unit". WP0.3's three renames therefore touch **zero manifest strings**. Nor is "Colour by" needed: `grep -rn "Colour by\|Color by" src` returns nothing, so WP0.3 did **not** rename the assessment-view control on screen, and `C2`'s summary ("switch cumulative vs per-assessment") still describes what the user sees (`assessment-selector.tsx:233`, `:292` render the literal "Cumulative"). **No text change is made in this package.** The `title`/`summary`/`tags` of all 19 clips are byte-identical after this change.

#### 2.1.5 Why B1–B3's vocabulary is *not* rewritten now

`B1`'s title is "Organising units, groups & subgroups — explained" and its summary is "What organising units, group containers and member subgroups are, and how they relate" (`manifest.json:232-235`). Plan 3.6 (`:126`) retires that vocabulary: **Group** is the dimension, **Unit** is a member of a group, and "sub-unit"/"group container" disappear. It is tempting to fix the words here.

**Do not.** The manifest text is the *label on a video*. Until the video is re-recorded, a summary written in the new vocabulary would describe a clip that says "group container" out loud for 44 seconds — a worse lie than a stale label, and it would make `/help`'s free-text search (`help/page.tsx:53-59`) return B1 for a query the clip cannot answer. Decision 9 assigns B1–B3 and C1–C3 to **WP2.9**, in the same package as the re-recording, which is exactly the right coupling. Same reasoning for A4/A5 → WP3.7. Recorded in §3.

#### 2.1.6 The edit

`public/help-videos/manifest.json`, four hunks, six inserted strings:

| Clip | Line | Array becomes |
|---|---|---|
| `OVERVIEW` | `:26-29` | `["/campaigns", "/campaigns/*", "/my-campaigns"]` |
| `A4` | `:171-174` | `["/campaigns", "/campaigns/new/manual", "/my-campaigns"]` |
| `D1` | `:567-569` | `["/campaigns/*/email/*", "/actions"]` |
| `D2` | `:602-605` | `["/campaigns/*/phone", "/campaigns/*/phone/lists/*", "/actions"]` |

Formatting: the file is `JSON.stringify(…, null, 2)` output (`publish-to-app.mjs:44`). Keep two-space indentation and one string per line so the diff is four small hunks.

#### 2.1.7 The regeneration hazard, and the two mitigations

`scripts/video-pipeline/publish-to-app.mjs` **writes** `apps/organising-db/public/help-videos/manifest.json` (`:9-11`, `:44`) from `scripts/video-pipeline/output/<ID>/<ID>.manifest.json`, which `runClip(spec)` emits from the per-clip spec in `scripts/video-pipeline/clips/<id>.mjs`. Those spec files are local and untracked (`docs/HOW_TO_VIDEOS_HANDOFF.md:97` — "all untracked/local"). **The next `node publish-to-app.mjs` reverts every edit in §2.1.6 unless the human also edits the clip specs.** This is not hypothetical: step 7 of the recipe (`HOW_TO_VIDEOS_HANDOFF.md:76`) runs it after every re-record, and OVERVIEW is being re-recorded in this very phase.

Two mitigations, both in scope:

1. **A test that fails loudly** — `MANIFEST_REQUIRED_ROUTES` in §2.5, pinning the six additions. A regeneration that drops them turns `pnpm test` red with a message naming the clip and the missing route.
2. **A note where the human will be standing** — five lines appended to `docs/HOW_TO_VIDEOS_HANDOFF.md` §6 immediately after step 7 (`:76-77`), naming the four clips, the six routes, and the test that will catch it.

---

### 2.2 Contextual surfacing: not built here — decided, with the reason

Appendix D §10 item 12 suggests the manifest's series A–E "could be surfaced contextually inside the campaign instead of as a top-level Guides item". The task asked whether a "Guides for this screen" link is a one-line reuse of the help page's matcher.

**It is not, and it is not built here.** Three reasons, in order of weight:

1. **There is no matcher to reuse.** §2.1.1: `help/page.tsx` never reads `associatedRoutes`; the `Clip` interface (`:7-21`) does not even declare the field. Building `useGuidesForRoute()` means writing the glob matcher, the `routeWeight` ranking, the `usePathname()` binding and a UI surface from nothing — the whole of `HOW_TO_VIDEOS_WORKPLAN.md` §5.2. That is a feature, not a line.
2. **The place it would live is another package's list.** The only campaign-internal home for it is WP1.4's **More** menu, whose membership rule is fixed (`wp1.4.md:281-287`: every registry tab whose module is not one of the four organiser tabs', plus three named workforce sub-tabs). Adding a non-tab item to that list from WP1.7, while WP1.4 is being implemented on the same branch, is the exact drift the orchestration is set up to prevent.
3. **Decision 1 already answered the discoverability question.** Guides is a *primary* organiser-mode sidebar row at `/help` (`nav-model.ts:183-190`, `:245-251`), one click from anywhere. The contextual drawer is an optimisation on top of an item that is already never more than one click away, and principle 15 (`plan:187`) is explicitly hostile to help chrome that crowds the working screen.

**Recommendation on the record:** if the drawer is wanted, it is a WP3-sized item that should own the matcher, the ranking, a surface, and its own tests — and it should be raised as an incidental finding in `PROGRESS.md`, not smuggled into a hints package. WP1.7 stays at manifest + hints.

---

### 2.3 First-use hints

#### 2.3.0 What exists today: nothing reusable

`grep -rniE "hint|coachmark|first-use|dismiss"` over `src` finds exactly one component with "hint" in the name: `src/components/ui/term-hint.tsx` (20 lines). It renders a static `<Info>` icon with a `title`/`aria-label` (`:11-19`) beside a term, used ~10 times on `/worksites` and `/employers`. It has **no dismissal, no persistence and no once-per-user semantics** — it is a permanent inline glossary affordance. It is not reused and it is not modified.

The only "dismiss once" precedent is `src/components/phone/mobile/MobileInstallPrompt.tsx:12` (`localStorage` key `oa-dialer-install-prompt-dismissed`). It is **not** the pattern to copy: plan §7 "What not to do" (`:491`) forbids `localStorage` for anything that changes what an organiser sees on another device, and a hint is precisely that. The wall chart's other `localStorage` uses (`use-display-mode.ts:6`, `campaign-wall-chart.tsx:200`, `:352`) are the debt WP2.x is scheduled to pay off, not a precedent to extend.

#### 2.3.1 The registry — new file `src/lib/hints/registry.ts`

Pure data plus two pure predicates. No React, no `next/*`, so the `environment: node` vitest suite imports it directly (`vitest.config.ts:19-21`).

```ts
// WP1.7 — the first-use hint registry.
//
// Plan 4 principle 15: no product tours; first-use hints only. Plan 5.1
// principle 6: what an organiser sees is per-user server-side state, never
// localStorage — so `seen` is a row in user_hint_dismissals, not a browser key.
//
// One entry per hint, ids stable and snake_case, never derived from copy.
// `pending` names the work package that will wire an entry whose target does
// not exist yet; a pending entry is data only and shouldShowHint() refuses it.

export type HintId = "wall_chart_rating" | "wall_chart_group_selector";

export interface Hint {
  id: HintId;
  /** Human note about where it anchors. Not rendered. */
  target: string;
  /** Exactly one sentence, plan-3.6 vocabulary. Rendered verbatim. */
  copy: string;
  /** Prose statement of the trigger; the executable form is shouldShowHint(). */
  showWhen: string;
  /** Set when the target does not exist yet. Never rendered while set. */
  pending?: "WP2.4";
}

export const HINTS: readonly Hint[] = [
  {
    id: "wall_chart_rating",
    target: "the rating number on a worker tile in the wall chart",
    copy: "Tap a worker's rating to set it — 1 is a supportive leader, 5 is opposed.",
    showWhen:
      "the first time this user opens a wall chart that has at least one tile they can edit, in either mode",
  },
  {
    id: "wall_chart_group_selector",
    target: "the wall chart's Group selector",
    copy: "Choose one Group at a time — Unassigned holds anyone not in a Unit.",
    showWhen:
      "the first time this user opens a wall chart after the Group selector ships",
    pending: "WP2.4",
  },
];

export const HINT_BY_ID: Readonly<Record<HintId, Hint>> = Object.fromEntries(
  HINTS.map((h) => [h.id, h])
) as Readonly<Record<HintId, Hint>>;
```

Copy notes. `wall_chart_rating` deliberately uses no plan-3.6 noun: the control is a rating chip on a tile and the sentence names nothing that 3.6 renamed. `wall_chart_group_selector` uses **Group**, **Unassigned** and **Unit** exactly as 3.6 defines them (`plan:126`) and states plan 5.1 principle 2 ("one group at a time") in one sentence. Both are one sentence; the test in §2.5 asserts it.

**Why the group-selector hint is data and not wiring.** There is no group selector in the codebase — `grep -rn "group selector\|GroupSelector" src` returns nothing, and plan §7 puts it in phase 2 (`:462`: "Wall chart rebuilt around the group selector"), owned by WP2.4. Writing the copy now is the useful half (it is a terminology decision, and the registry is where terminology decisions belong); wiring it would mean inventing the control. `pending: "WP2.4"` is the machine-readable hand-off and `shouldShowHint()` refuses any entry that carries it, so a future implementer cannot half-wire it by accident.

#### 2.3.2 The predicate — `src/lib/hints/should-show.ts`

```ts
import { HINT_BY_ID, type HintId } from "./registry";

export interface ShouldShowHintInput {
  /** A user_hint_dismissals row exists for (this user, this hint). */
  seen: boolean;
  /** The dismissals query has resolved. False while loading or on error. */
  loaded: boolean;
  /** The screen has at least one thing the hint can point at. */
  hasTiles: boolean;
  /** Dismissed in this session (optimistic; also true right after a write). */
  dismissedThisSession: boolean;
  /** The viewer may edit. A read-only viewer has no rating control to hint at. */
  canWrite: boolean;
}

export function shouldShowHint(id: HintId, input: ShouldShowHintInput): boolean {
  if (HINT_BY_ID[id]?.pending) return false;
  const { seen, loaded, hasTiles, dismissedThisSession, canWrite } = input;
  return loaded && !seen && !dismissedThisSession && hasTiles && canWrite;
}
```

Two inputs beyond the three the work package named, each earning its place:

- **`loaded`** — without it the hint flashes on every page load before the dismissals query resolves and then vanishes, which is worse than not showing it. Fail **closed** (show nothing) while loading or on error: an un-shown hint costs nothing; a hint shown to someone who dismissed it last week is a bug report.
- **`canWrite`** — `worker-tile.tsx:277` and `:296` only wrap the badge in a rating popover when `canWrite`; at `:288-289` a read-only badge gets `role`/`tabIndex`/`aria-label` of `undefined` and is inert. Telling a viewer to "click a worker's number" would point at a dead chip.

#### 2.3.3 The anchor — `src/lib/hints/pick-rating-hint-anchor.ts`

The hint attaches to **one** tile, chosen purely — no mount-order registration, no effects, no refs — so the choice is deterministic and testable in `environment: node`.

```ts
export interface RatingHintAnchorInput {
  /** campaign-wall-chart.tsx:806 */
  unassignedWorkerIds: readonly number[];
  /** visibleOus (:538-541) mapped through visibleWorkersForOu (:861-866), in order. */
  units: readonly { ouId: number; workerIds: readonly number[] }[];
}
export interface RatingHintAnchor { ouId: number | null; workerId: number }

/**
 * The first tile in the chart's own DOM order: the Unassigned card renders
 * first (campaign-wall-chart.tsx:1618) and the type bands after it (:1749+),
 * so Unassigned wins when it has anyone. Returns null when the chart has no
 * tiles at all — which is also the `hasTiles` answer.
 */
export function pickRatingHintAnchor(i: RatingHintAnchorInput): RatingHintAnchor | null {
  if (i.unassignedWorkerIds.length > 0) {
    return { ouId: null, workerId: i.unassignedWorkerIds[0] };
  }
  for (const u of i.units) {
    if (u.workerIds.length > 0) return { ouId: u.ouId, workerId: u.workerIds[0] };
  }
  return null;
}
```

**Known limitation, stated rather than hidden:** the anchor is computed from unfiltered membership, but each card applies its own filter/sort inside an IIFE at render time (`campaign-wall-chart.tsx:1618-1650` for Unassigned, `:1771+` for units). If the organiser has filtered that particular worker out of view, the anchor tile does not render and the hint is simply not shown that visit. It is **not** marked seen (nothing is written unless the callout is dismissed), so it appears on the next unfiltered visit. Building a filtered-order anchor would mean hoisting per-card filtering out of render — a wall-chart refactor that belongs to WP2.3.

#### 2.3.4 Storage — a new table, not `workspace_prefs`

The work package asks for the two options to be evaluated. Here is the evaluation, and it is decisive.

**Option (a): a `hints_seen` key inside `user_profiles.workspace_prefs`.**

The RLS is genuinely permissive enough. `"Users can update own profile"` is `USING/WITH CHECK ((user_id = auth.uid()) OR (get_user_role() = 'admin'))` (baseline `:27887`), and WP1.6's privileged-column trigger blocks only `user_id`, `role`, `work_role`, `organiser_id`, `reports_to` — its own comment says so verbatim: *"display_name, phone and **workspace_prefs stay self-editable**"* (`20260909120000_wp1_6_campaign_write_policies.sql:432-433`, function at `:407-425`). So a user could PATCH their own `workspace_prefs` from the app's client. The WP1.1 review's reading is correct.

It is still the wrong home, for a reason stronger than the "admin-only writes" convention:

1. **The admin write path is a whole-document overwrite that would silently delete hint state.** `src/app/api/admin/update-user/route.ts:161` is `updates.workspace_prefs = parsedWorkspacePrefs` — a replacement, not a merge. `parsedWorkspacePrefs` comes from `workspacePrefsSchema` (`prefs-schema.ts:35`), which is `.strict()` over exactly `{mode, modules, allowShowEverything}`. So an admin changing one user's mode in Administration → Users **erases that user's `hints_seen`**, and every hint comes back. That is a real, reachable data-loss bug, not a stylistic objection.
2. **Loosening `.strict()` to admit `hints_seen` opens the admin API to writing it.** The strict schema is the thing that makes an admin's typo a 400 (`prefs-schema.ts:5-6`). Adding a key would let an admin's PATCH set another user's hint state — nonsense as a permission, and a second writer of a field whose only legitimate writer is its owner.
3. **It mixes two lifetimes and two authorities in one document.** `workspace_prefs` is admin-managed configuration that determines *what an organiser can see*. Hint state is user-managed view state that determines *what they have already read*. Merging them means every future reader of `workspace_prefs` has to reason about both, and `resolveWorkspace()`'s inputs stop being the whole story. This is precisely the objection the work package anticipates, and it is correct.

**Option (b), adopted: `public.user_hint_dismissals(user_id, hint_id, dismissed_at)`, owner-only RLS.**

One row per (user, hint). No RPC. A scoped `dismiss_hint(hint_id)` SECURITY DEFINER function would only earn its keep if the write target were shared state that RLS could not narrow — with a dedicated table, **the RLS predicate *is* the scope**, and a definer function would be a second privileged object to audit for no gain. (Contrast WP1.6's `link_organiser_for_profile`, which exists precisely because its target column *is* guarded.)

New migration `supabase/migrations/20260911090000_user_hint_dismissals.sql` (timestamp after `20260910090000_campaign_last_activity.sql`, the current tip):

```sql
-- WP1.7 — per-user first-use hint dismissals.
--
-- Why its own table and not user_profiles.workspace_prefs: the admin write
-- path (/api/admin/update-user:161) REPLACES workspace_prefs with a
-- .strict()-parsed {mode,modules,allowShowEverything} document, so any extra
-- key an admin edit touches is destroyed. Hint state has exactly one
-- legitimate writer — its owner — so it gets a table whose RLS says that.
--
-- Presentation only: nothing here grants or removes any data access.

CREATE TABLE IF NOT EXISTS "public"."user_hint_dismissals" (
  "user_id"      "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "hint_id"      "text" NOT NULL,
  "dismissed_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "user_hint_dismissals_pkey" PRIMARY KEY ("user_id", "hint_id")
);

ALTER TABLE "public"."user_hint_dismissals" OWNER TO "postgres";

COMMENT ON TABLE "public"."user_hint_dismissals" IS
  'WP1.7: one row per (user, first-use hint) once the user dismisses it. '
  'hint_id is an app-side registry id (src/lib/hints/registry.ts), deliberately '
  'un-enumerated in SQL so adding a hint needs no migration. Owner-only.';

ALTER TABLE "public"."user_hint_dismissals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hint dismissals"
  ON "public"."user_hint_dismissals" FOR SELECT TO "authenticated"
  USING ("user_id" = "auth"."uid"());

CREATE POLICY "Users can insert own hint dismissals"
  ON "public"."user_hint_dismissals" FOR INSERT TO "authenticated"
  WITH CHECK ("user_id" = "auth"."uid"());

CREATE POLICY "Users can delete own hint dismissals"
  ON "public"."user_hint_dismissals" FOR DELETE TO "authenticated"
  USING ("user_id" = "auth"."uid"());

-- Narrower than the baseline's blanket grants on purpose: no UPDATE (a
-- dismissal has nothing to amend — delete and re-insert), and nothing to anon.
REVOKE ALL ON TABLE "public"."user_hint_dismissals" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_hint_dismissals" FROM "anon";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."user_hint_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."user_hint_dismissals" TO "service_role";
```

Shape precedent: `rate_limit_usage` / `rate_limit_config` are the baseline's owner-keyed tables with `USING (user_id = auth.uid())` SELECT policies (baseline `:13575-13586`, `:27891`, `:27895`). Policy naming follows the baseline's `"Users can … own …"` convention (`:27875`, `:27887`).

`DELETE` is granted deliberately: it is the reset the e2e spec needs (§2.6), and the worst a user can do with it is give themselves the hint back.

`hint_id` is `text`, not an enum: adding a hint must not need a migration, and the registry (`registry.ts`) is the single definition. A row for an id the registry no longer knows is inert — `HINT_BY_ID[id]` is `undefined` and nothing renders.

**Migration then types**, from the repo root:
`SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` (`package.json:9`) → `packages/db-types/generated.ts`. Also add the hand-maintained row type beside `UserProfile` in `src/types/organising-row-types.ts:832-848`:

```ts
/** WP1.7 — one row per first-use hint this user has dismissed. */
export interface UserHintDismissal {
  user_id: string;
  hint_id: string;
  dismissed_at: string;
}
```

#### 2.3.5 The hook — `src/lib/hints/use-first-use-hint.ts`

```ts
"use client";
```

React Query over the user's own Supabase client, the same idiom as the wall chart's other writes (`unit-rating-control.tsx:1-55` uses `createClient()` + `useAuthAwareMutation` + `queryClient.invalidateQueries`).

- Query key `["hint-dismissals", userId]`; one `select("hint_id").from("user_hint_dismissals")` (RLS already scopes it to the caller, so no `.eq("user_id", …)` is needed — but include it anyway so the index is used and the intent is on the page). `enabled: !!userId`. `staleTime: Infinity` — a dismissal cannot un-happen in a session.
- Returns `{ visible, dismiss }` where `visible = shouldShowHint(id, {seen, loaded, hasTiles, dismissedThisSession, canWrite})`.
- `dismiss()` sets `dismissedThisSession` **first** (so the callout disappears on the click, not on the round trip), then `upsert({ user_id, hint_id }, { onConflict: "user_id,hint_id", ignoreDuplicates: true })`. On error it logs and leaves the session dismissal in place — a hint that fails to persist must never block the chart, and it will simply reappear next session.
- `useAuth()` (`src/lib/supabase/auth-context.tsx`) supplies `user.id`. Outside a session the hook returns `{ visible: false }` and issues no query.

#### 2.3.6 The callout — `src/components/hints/first-use-hint.tsx`

A controlled, always-open Radix `Popover` anchored to the rating badge. Radix Popover is **non-modal by default** (no focus trap, no scroll lock, no outside-click capture), which is what "non-modal" requires; the chart underneath stays fully usable.

```tsx
<Popover open>
  <PopoverAnchor>{children}</PopoverAnchor>       {/* the badge, unmodified */}
  <PopoverContent
    side="right" align="center" sideOffset={8} collisionPadding={8}
    role="status" aria-live="polite"
    onOpenAutoFocus={(e) => e.preventDefault()}   {/* never steal focus from the chart */}
    className="w-64 p-3 text-sm"
  >
    <p>{copy}</p>
    <Button size="sm" variant="secondary" className="mt-2 h-11 min-w-11" onClick={onDismiss}>
      Got it
    </Button>
  </PopoverContent>
</Popover>
```

Against each requirement:

- **Non-modal** — Radix `Popover` with `modal` unset. Nothing is inert; the organiser can click straight past it.
- **Anchored to the rating control** — `PopoverAnchor` wraps the badge itself. **`PopoverAnchor` is not currently exported**: add it to `src/components/ui/popover.tsx` — one line at `:8` (`const PopoverAnchor = PopoverPrimitive.Anchor`) and one name in the export at `:29`. Purely additive; no existing consumer changes.
- **Not obscuring a tile on small screens** — this is the primitive doing the work rather than a hand-rolled position: `side="right"` with `collisionPadding={8}` makes Radix flip and shift the content into the viewport automatically. Verified by the mobile screenshot in §2.6, not asserted from the code.
- **Keyboard-focusable** — the content is portalled to the end of `<body>` (`popover.tsx:14`, `PopoverPrimitive.Portal`), so Tab from the badge does **not** reach it (corrected in fix round 1, finding 4); "Got it" is a real `<Button>` reached at the end of the document's tab order and dismissible with Enter/Space, and the callout is announced through `role="status"`/`aria-live`. On "Got it" (or Escape with focus inside the callout) focus returns to the badge. `onOpenAutoFocus` is prevented so opening the chart does not yank focus.
- **1 cm target on touch** (plan 4 principle 17, `:187`) — `h-11 min-w-11` is 44 px ≥ 1 cm at standard density. The repo's default `size="sm"` button is `h-8`; the override is explicit and commented.
- **Shown once per user** — §2.3.4/§2.3.5.

**Wrapping `PopoverAnchor` around the badge does not fight the rating popover.** `largeBadgeRendered` (`worker-tile.tsx:277-307`) is already a `Popover`+`PopoverTrigger` for `InlineRatingPopover`/`CumulativeRatingPopover`. The hint is a *separate* Popover root and its `PopoverAnchor` is used **without `asChild`** — it renders its own wrapper element around `largeBadgeRendered` rather than merging props onto the trigger, so the two roots never share a DOM node or a ref. This is the whole reason `asChild` is avoided here; a comment says so in the file.

#### 2.3.7 Wiring — three files, minimal surface

**`src/components/campaigns/wall-chart/worker-tile.tsx`**

- Two optional props on `WorkerTileProps` (after `:35`): `showRatingHint?: boolean` and `onRatingHintDismiss?: () => void`.
- At `:366` (`<div className="shrink-0">{largeBadgeRendered}</div>`) render `showRatingHint ? <FirstUseHint id="wall_chart_rating" onDismiss={onRatingHintDismiss}>{largeBadgeRendered}</FirstUseHint> : largeBadgeRendered`.

**`src/components/campaigns/wall-chart/inline-rating-popover.tsx`**

One optional prop on **both** components, `onRatingControlOpen?: () => void`, called from the `onOpenChange` handlers they already have — `InlineRatingPopover` at `:79-87` and `CumulativeRatingPopover` at `:232-239` — inside the existing `if (next)` branch. Wrapped in try/catch like the existing `onSaved` guard at `:65-69`, for the same reason ("an additive notification must never break the save path").

Why: the moment the organiser opens the rating popover they have found the control, and the hint must both get out of the way and stop asking. `WorkerTile` passes `onRatingControlOpen={onRatingHintDismiss}` when `showRatingHint` is true. This also removes any chance of the two popovers overlapping on the same anchor.

**`src/components/campaigns/campaign-wall-chart.tsx`**

- After `visibleWorkersForOu` (`:861-866`), one memo:
  ```ts
  const ratingHintAnchor = useMemo(
    () => pickRatingHintAnchor({
      unassignedWorkerIds,
      units: visibleOus.map((o) => ({ ouId: o.ou_id, workerIds: visibleWorkersForOu(o.ou_id) })),
    }),
    [unassignedWorkerIds, visibleOus, visibleWorkersForOu]
  );
  const ratingHint = useFirstUseHint("wall_chart_rating", {
    hasTiles: ratingHintAnchor !== null,
    canWrite,
  });
  ```
- In `renderTile` (`:1099-1210`), on the `<WorkerTile>` at `:1125`:
  ```tsx
  showRatingHint={
    ratingHint.visible &&
    ratingHintAnchor?.workerId === workerId &&
    ratingHintAnchor.ouId === ouId
  }
  onRatingHintDismiss={ratingHint.dismiss}
  ```
  Comparing **both** `workerId` and `ouId` matters: a worker in several units is rendered as several tiles (`inMultipleUnits`, `:1109`), and without the `ouId` check the hint would render once per copy.
- Add `ratingHint`, `ratingHintAnchor` to `renderTile`'s dependency array at `:1208`.

Nothing else in the 2,603-line component moves. No change to the summary header, the unit cards, or the build-list panel.

**Which modes and which surface.** The hint lives in the wall chart component, which renders identically in full and organiser mode (WP1.4 changes only which tab bar is drawn — `wp1.4.md:409-411`). So "in either mode" is satisfied by construction, with nothing mode-aware to test.

---

### 2.4 Human tasks for the ledger

`docs/organiser-ux-review/PROGRESS.md` already carries one WP1.7 row in "Human tasks (not code)" (`:69`: *"Re-record OVERVIEW clip | WP1.7 | pending"*). Replace it with the row below and add one more. The pipeline reference for both is `docs/HOW_TO_VIDEOS_HANDOFF.md` §6 "Production recipe (per clip)" (`:59-79`), steps 1–8, and the demo data at `:57`.

| Task | Raised by | Status |
|---|---|---|
| **Re-record `OVERVIEW`** — the big-picture clip opens on `/campaigns` and narrates the eight-tab campaign page. After phase 1 the organiser's home is `/my-campaigns` (WP1.3), the campaign page opens on the wall chart behind four tabs plus **More** with a campaign switcher (WP1.4), the sidebar's row 7 is **Actions** at `/actions` (WP1.2/WP1.5), and the Workforce sub-tab formerly called "Scope" is **Who's in** (WP0.3). Pipeline: `docs/HOW_TO_VIDEOS_HANDOFF.md:59-79`, steps 1–8; the spec is `scripts/video-pipeline/clips/overview.mjs` (local, untracked). **Before step 7** re-apply this package's `associatedRoutes` edits to the clip specs (§2.1.7) or `pnpm test` will fail on `help-manifest.test.ts`. | WP1.7 | pending |
| **Re-record candidates `C1`, `C2`, `B3` (WP0.3 note)** — `C1` "The wall chart, explained" and `C2` "Filter, sort & switch views" were filmed before WP0.3 moved worker tiles above the assessment-distribution charts and made List the default layout on touch devices; `B3` "Allocate workers to units" was filmed against a screen that said "Unallocated". **Assess, do not assume**: WP2.9 already owns `B1–B3` and `C1–C3` for the group model, so re-shooting them now may be wasted if the chart is rebuilt in phase 2. Recommendation: defer all three to WP2.9 and record the decision here. Same pipeline reference. | WP1.7 (raised), WP2.9 (owns) | pending — decision needed |

The existing `WP2.9` row (`PROGRESS.md:70`, "Re-record B1–B3, C1–C3") and `WP3.7` row (`:71`, "Re-record A4, A5") are unchanged.

Also update the ledger's WP1.7 line (`PROGRESS.md:48`) status/branch/PR/verification columns as the package moves, per the standing process.

---

### 2.5 Tests

All pure tests go under `src/**/__tests__/` so `vitest.config.ts:19` picks them up. All run in `environment: node` (`:18`).

#### T1 — `src/lib/hints/__tests__/help-manifest.test.ts` (manifest integrity)

Reads the shipped files, following the precedent of `src/lib/sms/__tests__/rating-source-taxonomy.test.ts:27-31` (`fileURLToPath` → `appRoot` → `repoRoot`, then `readFileSync`).

```ts
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MANIFEST = resolve(APP_ROOT, "public/help-videos/manifest.json");
const APP_DIR  = resolve(APP_ROOT, "src/app");
```

Route inventory, built at test time so it can never go stale: walk `src/app` for `page.tsx`, drop the `src/app` prefix and `/page.tsx` suffix, delete route-group segments (`/(dashboard)`, `/(auth)`), and turn every dynamic segment into a concrete sample — `[id]` → `1`, `[...slug]` → `1`. That yields 76 sample paths including `/campaigns/1`, `/campaigns/1/settings`, `/campaigns/1/email/import`, `/campaigns/1/phone/lists/1`, `/campaigns/1/phone/call/1`, `/campaigns/1/phone/live`, `/leader/task/1`, `/my-campaigns`, `/actions`.

Glob semantics, defined once in the test because the app defines them nowhere (§2.1.1) and `HOW_TO_VIDEOS_WORKPLAN.md:531` only says "glob match": `*` matches **one or more** path segments — `^` + literal segments escaped + `*` → `[^/]+(?:/[^/]+)*` + `$`. This is the reading that makes `/campaigns/*/email/*` match `/campaigns/1/email/setup/order`, which is the flow `D1` teaches.

Assertions:

1. **Structure** — `clips.length === count === 19`; every clip has a non-empty `id`, `title`, `summary`, `series` present in `series`, and a non-empty `associatedRoutes` array of strings starting with `/`.
2. **Every glob resolves.** For each clip, at least one entry of `associatedRoutes` matches at least one sample path. On failure the message names the clip id and the unmatched globs. *(This assertion passes at HEAD: all 19 clips resolve today — the additions are new, not repairs.)*
3. **The WP1.7 additions are present** — the drift alarm of §2.1.7:
   ```ts
   const MANIFEST_REQUIRED_ROUTES: Record<string, string[]> = {
     OVERVIEW: ["/campaigns", "/campaigns/*", "/my-campaigns"],
     A4: ["/campaigns", "/campaigns/new/manual", "/my-campaigns"],
     D1: ["/campaigns/*/email/*", "/actions"],
     D2: ["/campaigns/*/phone", "/campaigns/*/phone/lists/*", "/actions"],
   };
   ```
   Failure message: `"<id> lost route <r> — did scripts/video-pipeline/publish-to-app.mjs regenerate the manifest? See wp1.7.md §2.1.7."`
4. **No clip was dropped** — the 19 ids are pinned as a literal sorted array. This is the "nothing is removed" rule made executable.
5. **No stale label** — no clip's `title + summary + tags` matches `/scope|unalloc|sms tools|universe|no unit/i`. This both records the §2.1.4 finding and stops a future regeneration reintroducing a retired word.

#### T2 — `src/lib/hints/__tests__/registry.test.ts`

- Ids are unique and match `/^[a-z][a-z0-9_]*$/`.
- `HINT_BY_ID` covers every entry and only those.
- **Copy is one sentence** — exactly one terminal `.` and it is the last character; no `. ` mid-string; and no `;` used as a sentence join. (An em dash is allowed — `wall_chart_group_selector` uses one — and the test says why in a comment.)
- **Copy is plan-3.6 clean** — no `/scope|universe|unalloc|no unit|\bOU\b|sms tools|standing campaign|episode/i`. This is the falsifiable form of "uses plan 3.6 words": asserting the presence of a 3.6 noun would be wrong, since `wall_chart_rating` legitimately needs none.
- `wall_chart_group_selector` uses **Group**, **Unit** and **Unassigned** with the 3.6 capitalisation.
- Exactly one entry carries `pending`, and it is `wall_chart_group_selector` with `"WP2.4"` — so removing the marker without wiring the control is a red test.

#### T3 — `src/lib/hints/__tests__/should-show.test.ts`

Truth table over the five inputs for `wall_chart_rating`: the one all-true case returns `true`; each of `seen`, `dismissedThisSession`, `!hasTiles`, `!canWrite`, `!loaded` independently returns `false`. Plus: `shouldShowHint("wall_chart_group_selector", <all-true>)` is `false` **because of `pending`** — the assertion that stops the pending entry ever rendering.

#### T4 — `src/lib/hints/__tests__/pick-rating-hint-anchor.test.ts`

Unassigned wins when non-empty (returns `{ouId: null, …}`); falls through to the first non-empty unit **in the given order** when Unassigned is empty; skips empty units; returns `null` for an empty chart; returns `null` when every unit is empty and Unassigned is empty (this is the `hasTiles === false` path, asserted as the same call).

#### T5 — e2e, appended to `tests/e2e/wall-chart.spec.ts`

A third `test.describe`, guarded by `test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE)` like the two that exist (`wall-chart.spec.ts:158`, `:242`).

```
test("the rating hint shows once, then stays dismissed", async ({ page, request }) => {
  // 0. Preconditions: reset any prior dismissal so the test is idempotent.
  // 1. goto /my-campaigns, click "Open wall chart" (the existing locator at :249)
  // 2. expect(page.getByText("Tap a worker's rating to set it — 1 is a supportive leader, 5 is opposed.")).toBeVisible()
  //    and expect that locator to have count 1 — one hint, not one per tile.
  // 3. click "Got it"; expect it to disappear.
  // 4. page.reload(); expect count 0 after the chart's tiles are visible
  //    (wait on '[data-worker-id], [data-ou-id="unassigned"]' first, as :268-271 does,
  //     so "absent" is not merely "not painted yet").
  // 5. finally: delete the dismissal row.
});
```

**How the reset is done, named as asked: by the spec, through the same signed-in session, via `restClientFor`.** `tests/e2e/roles/campaign-cleanup.ts` already exports `restClientFor(request, sessionFromStorageState(STORAGE_STATE))` (`:106-140`), which decodes the `@supabase/ssr` auth cookie, reads the REST origin and anon key global setup captured, **refuses outright if the session belongs to the production project** (`:111-113`), and exposes `get`/`post`/`delete`. `wall-chart.spec.ts:18,129` already imports and uses it. So:

- step 0 and the `finally` both call
  `rest.delete("/rest/v1/user_hint_dismissals?hint_id=eq.wall_chart_rating&user_id=eq." + rest.session.userId)`,
  which the new DELETE policy and grant (§2.3.4) permit for the caller's own row and nothing else;
- if `restClientFor` returns `null` (no credentials, no REST config), the test skips with a message rather than running without a reset — a spec that cannot clean up must not run twice.

No SQL is handed to the verifier and no new API route is added: the reset uses an existing helper and a policy this package is already adding for the user's own benefit.

**Locators.** The hint copy is asserted by its literal sentence from the registry, imported from `@/lib/hints/registry` (the spec file already imports app modules via the `@/` alias — `wall-chart.spec.ts:5-8`), so the test and the product cannot drift. "Got it" is `getByRole("button", { name: "Got it" })`. **No `data-testid` is added to production markup**, per the note at `wall-chart.spec.ts:47-51`.

**Precondition the operator must know:** the dev e2e account's campaign must have at least one tile *and* the account must have write access, or the hint correctly does not render and the test fails for the right reason with a message saying so.

#### T6 — regression, no new file

`pnpm test` must stay green on the existing suites. The only shared files touched are `src/components/ui/popover.tsx` (additive export) and two wall-chart components behind optional props that default to `undefined`, so no existing test's inputs change.

#### Commands that prove each acceptance criterion

From `apps/organising-db` unless stated:

| Criterion | Command |
|---|---|
| Every `associatedRoutes` glob resolves to a real app route | `pnpm vitest run src/lib/hints/__tests__/help-manifest.test.ts` |
| The six route additions are present; no clip removed; schema intact | same file, assertions 3–4; plus `git diff --stat public/help-videos/manifest.json` showing 4 hunks / +6 lines / −0 |
| No manifest text changed | `git diff public/help-videos/manifest.json \| grep '^-' \| grep -v associatedRoutes` → empty |
| No stale label in the manifest | `grep -niE "scope\|unalloc\|sms tools\|universe\|no unit" public/help-videos/manifest.json` → exit 1 |
| Hint registry: ids unique, one sentence, 3.6-clean | `pnpm vitest run src/lib/hints/__tests__/registry.test.ts` |
| `shouldShowHint` logic incl. the `pending` refusal | `pnpm vitest run src/lib/hints/__tests__/should-show.test.ts` |
| Anchor choice deterministic | `pnpm vitest run src/lib/hints/__tests__/pick-rating-hint-anchor.test.ts` |
| Hint shows once, dismisses, stays dismissed across reload | `E2E_BASE_URL=<branch preview> pnpm e2e tests/e2e/wall-chart.spec.ts` |
| Migration valid | repo root: `pnpm validate:migrations` |
| Types regenerated from **dev** | repo root: `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`, then `git diff --stat packages/db-types/generated.ts` shows `user_hint_dismissals` |
| Whole suite / build / lint budget | `pnpm test`, `pnpm build`, `pnpm lint` (errors ≤ 143, warnings ≤ 151) |

---

### 2.6 Screenshot evidence (dev preview, per the standing note)

Three, into `docs/organiser-ux-review/evidence/wp1.7/`:

1. Desktop wall chart, hint visible on the first tile, "Got it" in frame.
2. **Mobile viewport (375 px)**, same chart — the risk this package must show it has not created: the callout must not cover the tile it points at (§2.3.6 relies on Radix collision handling; a screenshot is the proof, not the code).
3. The same desktop chart after dismiss + reload, no hint.

---

### 2.7 Files changed — the complete list

| Path | Change |
|---|---|
| `public/help-videos/manifest.json` | 4 hunks, +6 route strings (§2.1.6). No other byte changes. |
| `supabase/migrations/20260911090000_user_hint_dismissals.sql` | **new** — table, RLS, grants (§2.3.4) |
| `packages/db-types/generated.ts` | regenerated from dev |
| `src/types/organising-row-types.ts` | +`UserHintDismissal` beside `UserProfile` (`:832-848`) |
| `src/lib/hints/registry.ts` | **new** — `HintId`, `Hint`, `HINTS`, `HINT_BY_ID` |
| `src/lib/hints/should-show.ts` | **new** — `shouldShowHint()` |
| `src/lib/hints/pick-rating-hint-anchor.ts` | **new** — `pickRatingHintAnchor()` |
| `src/lib/hints/use-first-use-hint.ts` | **new** — the query/mutation hook |
| `src/components/hints/first-use-hint.tsx` | **new** — the callout |
| `src/components/ui/popover.tsx` | `:8` +`PopoverAnchor`; `:29` +export. Additive only. |
| `src/components/campaigns/wall-chart/worker-tile.tsx` | +2 optional props after `:35`; `:366` wraps `largeBadgeRendered` |
| `src/components/campaigns/wall-chart/inline-rating-popover.tsx` | +1 optional prop on each component; called from the existing `onOpenChange` at `:79-87` and `:232-239` |
| `src/components/campaigns/campaign-wall-chart.tsx` | +1 memo after `:866`; 2 props on `<WorkerTile>` at `:1125`; deps at `:1208` |
| `src/lib/hints/__tests__/*.test.ts` | **new** — T1–T4 |
| `tests/e2e/wall-chart.spec.ts` | +1 `test.describe` (T5) |
| `docs/organiser-ux-review/PROGRESS.md` | ledger row 1.7; two human-task rows (§2.4) |
| `docs/HOW_TO_VIDEOS_HANDOFF.md` | 5-line note after §6 step 7 (`:76`) |
| `/tmp/oux-plans/wp1.7.md` | §6–§8 filled in as the package runs |

---

### 2.8 Terminology check (plan 3.6)

Every string this package adds to the product:

| String | Where | 3.6 check |
|---|---|---|
| `Tap a worker's rating to set it — 1 is a supportive leader, 5 is opposed.` (reworded in fix round 1, finding 10: the badge shows "—" when unrated, so "number" was false for the very workers the hint is for) | `registry.ts` | No retired term. "rating" is the app's and the plan's word (`plan:126` row 6 renames only the *view* control, to "Colour by"). |
| `Choose one Group at a time — Unassigned holds anyone not in a Unit.` | `registry.ts` (pending) | **Group**, **Unit**, **Unassigned** exactly as 3.6 defines them. |
| `Got it` | `first-use-hint.tsx` | Not a domain term. |

No user-facing string is removed or renamed. T2 assertion 4 enforces the negative list.

---

### 2.9 Risks and the rules they could break

| # | Risk | Rule at stake | Mitigation |
|---|---|---|---|
| 1 | **Manifest drift.** `publish-to-app.mjs:44` overwrites the file; the OVERVIEW re-record in this very phase will run it. | "Nothing is removed from the product." | T1 assertions 3–4 fail loudly and name the file; `HOW_TO_VIDEOS_HANDOFF.md` note at the exact step. Neither prevents it — both catch it before merge. Stated as residual. |
| 2 | **WP1.4 renames a tab and a clip's narration goes stale.** | terminology | WP1.4 keeps every `?tab=&sub=` URL (`wp1.4.md:409-411`), so no *route* drifts. Labels do change on screen (four organiser tabs plus More), which is exactly why OVERVIEW is a re-record (§2.4) — the manifest cannot fix a spoken word. |
| 3 | **The hint obscures a tile on a small screen.** | plan 4 principle 17; 5.11 | Radix collision handling (`side` + `collisionPadding`) rather than hand-rolled offsets, plus the 375 px screenshot in §2.6 as the actual evidence. |
| 4 | **The hint write path fails (RLS, offline) and the chart breaks.** | "presentation, never permission" | `dismiss()` sets session state before it writes and swallows the error (§2.3.5); a failed write means the hint returns next session, nothing more. Read failures fail closed (`loaded: false` → no hint). |
| 5 | **RLS too wide.** A new table is new attack surface. | WP1.6's posture | Owner-only on all three verbs, `REVOKE` from `PUBLIC` and `anon`, **no UPDATE grant**, FK `ON DELETE CASCADE` to `auth.users`. The table holds one boolean fact about oneself; there is nothing to leak. |
| 6 | **The hint fires for the wrong tile, or for several.** | — | Pure `pickRatingHintAnchor` (T4) plus the `ouId` **and** `workerId` comparison at `:1125` (a multi-unit worker renders several tiles). T5 asserts `count === 1` on the live page. |
| 7 | **The hint never fires because the anchor tile is filtered out.** | — | Known and accepted (§2.3.3): nothing is written, so it returns next visit. Fixing it needs the WP2.3 wall-chart decomposition. |
| 8 | **An admin edit wipes hint state.** | — | The reason option (a) was rejected (§2.3.4 point 1). With a separate table it cannot happen. |
| 9 | **Merge conflict with WP1.4 in `campaign-wall-chart.tsx`.** | branch discipline | WP1.4 touches `page.tsx`, `campaign-tabs.ts`, the header bar and a new `workspace-tabs.ts` (`wp1.4.md` §2.7 asserts zero change in full mode); it does not touch the chart's tile rendering. The three edit sites here (`:867`, `:1125`, `:1208`) are outside WP1.4's diff. Re-read before editing, as the brief instructs. |
| 10 | **The e2e leaves a dismissal behind and the next run sees no hint.** | — | Reset in step 0 *and* in `finally`; skip entirely when `restClientFor` returns `null`. |

---

## 3. Out of scope

Things considered and deliberately not done:

1. **A "Guides for this screen" drawer or link, and `useGuidesForRoute()`.** §2.2: there is no matcher to reuse, its only campaign-internal home is WP1.4's More list, and Guides is already a primary sidebar row. Raise as an incidental finding if wanted.
2. **Rewriting `B1`/`B2`/`B3` (and `C1`–`C3`) titles and summaries into plan-3.6 vocabulary.** §2.1.5 — the label must not out-run the video. WP2.9 owns text and re-record together.
3. **Rewriting `A4`/`A5` for the three-screen create flow.** WP3.7 owns them, and the flow does not exist yet (WP3.1).
4. **Any re-recording, any new clip, any transcript edit.** Decision 9 makes recording human work. Transcripts and media live in Supabase Storage, not the repo (`manifest.json:44`, `help/page.tsx:27-32`); only `manifest.json` is in `public/help-videos/`.
5. **A new SMS clip.** The manifest has no SMS clip at all — series D is email, phone and activist tasking. `/sms/inbox`, `/sms/new` and `/sms/numbers` are taught by nothing. A real gap, but decision 9's budget is ~10 **re**-records, not new clips. Recorded here so it is not lost.
6. **Making `routeWeight` per-route.** §2.1.3 — it would change the manifest schema, which the work package forbids.
7. **Wiring the group-selector hint.** The control ships in WP2.4. The entry exists as data with `pending: "WP2.4"`, and T3 asserts it cannot render.
8. **The setup checklist** (plan 5.8, `:329`; the other half of principle 15). WP3.2.
9. **Migrating the wall chart's existing `localStorage` view state** (`use-display-mode.ts:6`, `campaign-wall-chart.tsx:200,352`) to the new server-side pattern. Tempting — the table and hook are right there — but it is view state for the chart, not hint state, and plan §7 assigns it to phase 2's "server-side per-user state" (`:463`). Doing it here would change what organisers see on other devices from a hints package.
10. **Extending `workspacePrefsSchema`.** §2.3.4 — it would open the admin API to writing user-owned state.
11. **Touching `sidebar.tsx` or `nav-model.ts`.** Decision 1 is already shipped by WP1.2 (§1.2).
12. **A `dismiss_hint(hint_id)` RPC.** §2.3.4 — with a dedicated owner-only table the RLS predicate is the scope; a SECURITY DEFINER function would be a second privileged object with nothing extra to do.

---

## 4. Open questions

Only one needs the operator; the rest are assumptions stated and proceeded on.

1. **Do `C1`, `C2` and `B3` get re-recorded now, or wait for WP2.9?** (§2.4, second row.) WP0.3's note flags them as candidates; WP2.9 already owns `B1–B3` and `C1–C3` for the group model, and the chart is rebuilt in phase 2 (`plan:462`), so shooting them twice is likely waste. **Planner's recommendation: defer all three to WP2.9 and re-record only `OVERVIEW` in phase 1**, which is exactly what plan §7 phase 1 says (`:454`: *"Guides: OVERVIEW re-recorded; other clips remain valid"*). This is a scheduling call about human time, not a code decision — nothing in the plan changes either way.

Assumptions made without asking:

- **The dev e2e account can write to a campaign with at least one tile.** It could as of the WP1.3 and WP1.6 runs (`PROGRESS.md:20`, and `wall-chart.spec.ts:268-271` depends on it already). If not, T5 fails with a message that says so rather than skipping silently.
- **`/actions` on `D1` and `D2`, not on `C3` or `D3`.** `C3` teaches building a list *inside* a campaign and `D3` teaches the dialer, which is reached from a list, not from the hub. If the operator disagrees the change is one line each, and T1's `MANIFEST_REQUIRED_ROUTES` is where it is recorded.
- **`*` means one-or-more segments.** The app defines no glob semantics (§2.1.1) and the workplan says only "glob match" (`HOW_TO_VIDEOS_WORKPLAN.md:543`). The one-or-more reading is the one that makes `/campaigns/*/email/*` cover `/campaigns/1/email/setup/order`, which is the flow `D1` teaches. It is defined in the test, in one place, with a comment.
- **`hint_id` stays `text`, not an enum.** Adding a hint must not need a migration; the registry is the single definition.

---

## 5. Orchestrator approval

_(pending)_

## 6. Deviations from plan

_(to be filled by the implementer)_

## 7. Verification output

_(to be filled by the implementer)_

## 8. Reviewer findings

_(to be filled by the reviewer)_

## 5. Orchestrator approval

**Approved 2026-09-09.** Open question: **defer** C1, C2 and B3 to WP2.9 (plan §7 phase 1 names OVERVIEW only); the ledger carries the recommendation. Accepted: six route additions and no text changes to the manifest (B1–B3 vocabulary waits for the re-record); no contextual "guides for this screen" surface in this package; a dedicated `user_hint_dismissals` table with owner-only RLS rather than `workspace_prefs` (the admin route replaces that document wholesale); the group-selector hint defined as data and refused until WP2.4; the rating-control hint anchored by a pure picker and rendered with the existing Popover; the pinned-routes test and the note at the publish step. Branch `feat/oux-wp1.7-guides-hints`, stacked on WP1.4; PR base `develop`. Implementer: Fable (a migration is involved). Reviewer: Fable.

## 6. Deviations from plan

Implemented on `feat/oux-wp1.7-guides-hints` (Fable, 2026-09-09). Numbered so the reviewer can tick them off; none changes behaviour the plan promised.

1. **Manifest diff shape.** §2.5 says the diff shows "+6 lines / −0". JSON needs a trailing comma on the previously-last route string of each of the four arrays, so the honest shape is **4 hunks, +8 / −4**, where every `−` line is a route string re-added one line later with a comma. `title`/`summary`/`tags` of all 19 clips are byte-identical. Corrected proof: `git diff HEAD~4 -- apps/organising-db/public/help-videos/manifest.json | grep '^-' | grep -v '^---' | grep -vE '^-\s+"/'` → empty.
2. **Route inventory is 78, not 76.** The branch moved under the plan (WP1.4 and later routes, e.g. `/u/[token]`). No effect: T1 builds the inventory from `src/app/**/page.tsx` at test time.
3. **`manifest.series` is a map, not an array** (`{"O": "Overview", …}`); T1's structure assertion checks membership against `Object.keys(series)` rather than a `series[].id`.
4. **T1 has a sixth assertion** ("builds a route inventory that includes the screens the clips teach") pinning twelve sample paths, so a broken inventory walker cannot make assertion 2 pass vacuously.
5. **Callout gains `onEscapeKeyDown={onDismiss}`** in addition to "Got it" — a second keyboard dismissal, additive, nothing else changes. `type="button"` is set explicitly on "Got it".
6. **Hook write path.** `dismiss()` is `upsert(…, { onConflict: "user_id,hint_id", ignoreDuplicates: true })`, i.e. `INSERT … ON CONFLICT DO NOTHING` — an insert, needing no UPDATE grant, exactly as §2.3.5. On success the hook does `queryClient.setQueryData` (adds the id to the cached list) instead of `invalidateQueries`, saving a refetch; on error it `console.warn`s and keeps the session dismissal.
7. **Hook return is memoised** (`useMemo({ visible, dismiss })`, `dismiss` via `useCallback`) so listing `ratingHint` in `renderTile`'s dependency array does not re-create the callback on every render. `HINT_DISMISSALS_QUERY_KEY` is exported for whoever needs to invalidate it later.
8. **E2E reset is `beforeEach` + `afterEach`** (the brief's wording) rather than "step 0 + `finally`" — equivalent; both go through `restClientFor`, which refuses production. Two strengthening additions: after "Got it" the spec `expect.poll`s the row into existence through REST, and the post-reload "absent" assertion waits on the `GET …/rest/v1/user_hint_dismissals` response first, because the hint fails closed while loading and "not painted yet" must not pass as "dismissed" (risk 10 / §2.3.2).
9. **The `UserHintDismissal` row type's `hint_id` is `string`**, not `HintId`, with the reason in its doc comment (the column is deliberately un-enumerated).
10. **Not done here, by rule:** `packages/db-types/generated.ts` (the verifier regenerates from dev after `db push`); `docs/organiser-ux-review/PROGRESS.md` (the orchestrator copies the rows below); the §2.6 screenshots (verifier, on the preview). No app was started locally; no database was contacted.
11. **This file carries two §5–§8 blocks** (the pre-approval template at the top and the post-approval set below it). The implementer filled the second, the one under "Orchestrator approval"; the first is left as the planner wrote it.

### Implementer notes

**Files changed (all under `apps/organising-db/` unless stated):**

| Path | Change |
|---|---|
| `public/help-videos/manifest.json` | +6 route strings across OVERVIEW, A4, D1, D2 (deviation 1) |
| `supabase/migrations/20260911090000_user_hint_dismissals.sql` | **new** — table, RLS, grants (§2.3.4) |
| `src/types/organising-row-types.ts` | +`UserHintDismissal` after `UserProfile` |
| `src/lib/hints/registry.ts` | **new** — `HintId`, `Hint`, `HINTS`, `HINT_BY_ID` |
| `src/lib/hints/should-show.ts` | **new** — `shouldShowHint()` |
| `src/lib/hints/pick-rating-hint-anchor.ts` | **new** — `pickRatingHintAnchor()` |
| `src/lib/hints/use-first-use-hint.ts` | **new** — `useFirstUseHint(id, { hasTiles, canWrite })` |
| `src/components/hints/first-use-hint.tsx` | **new** — the callout |
| `src/components/ui/popover.tsx` | +`PopoverAnchor` (additive) |
| `src/components/campaigns/wall-chart/worker-tile.tsx` | +`showRatingHint`, `onRatingHintDismiss`; wraps `largeBadgeRendered`; passes `onRatingControlOpen` |
| `src/components/campaigns/wall-chart/inline-rating-popover.tsx` | +`onRatingControlOpen` on both popovers, called (guarded) inside the existing `if (next)` |
| `src/components/campaigns/campaign-wall-chart.tsx` | +`ratingHintAnchor` memo and `useFirstUseHint` after `visibleWorkersForOu`; 2 props on `<WorkerTile>`; 2 deps |
| `src/lib/hints/__tests__/{help-manifest,registry,should-show,pick-rating-hint-anchor}.test.ts` | **new** — T1–T4 (23 tests) |
| `tests/e2e/wall-chart.spec.ts` | +1 `test.describe` (T5) |
| `docs/HOW_TO_VIDEOS_HANDOFF.md` | 5-line note after §6 step 7 |
| `docs/organiser-ux-review/wp/wp1.7.md` | this section |

**Migration:** `supabase/migrations/20260911090000_user_hint_dismissals.sql`. Not applied by the implementer. `pnpm validate:migrations` → "Validated 8 Supabase migrations".

**Untyped client, noted as asked:** `createClient()` (`src/lib/supabase/client.ts:134`) returns a bare `SupabaseClient`, so the two `.from("user_hint_dismissals")` calls in `use-first-use-hint.ts` compile before `generated.ts` knows the table. After `gen:types` nothing needs to change; the row shape is `UserHintDismissal`.

**Human-task rows for the ledger** (`docs/organiser-ux-review/PROGRESS.md`, "Human tasks (not code)") — for the orchestrator to copy; the existing "Re-record OVERVIEW clip | WP1.7 | pending" row is replaced by the first, the second is added, the WP2.9 and WP3.7 rows are unchanged:

| Task | Raised by | Status |
|---|---|---|
| **Re-record `OVERVIEW`** — the clip opens on `/campaigns` and narrates the eight-tab campaign page. What changed on screen after phase 1: the organiser's home is **`/my-campaigns`** with the "New campaign" button (WP1.3); the campaign page opens on the wall chart behind **four tabs plus More** with a campaign switcher (WP1.4); the sidebar in organiser mode is four primary rows, with **Actions** at `/actions` for SMS, email and call lists (WP1.2/WP1.5) and **Guides** at `/help`; the Workforce sub-tab formerly "Scope" is **Who's in**, "Unallocated" is **Unassigned** (WP0.3); and the first wall chart an organiser opens now shows a one-line **rating hint** on the first tile (WP1.7 — dismiss it before recording, or record it deliberately). Pipeline: `docs/HOW_TO_VIDEOS_HANDOFF.md` §6 steps 1–8; spec `scripts/video-pipeline/clips/overview.mjs` (local, untracked). **Before step 7** re-apply the `associatedRoutes` edits (wp1.7.md §2.1.6) to the clip specs, or `pnpm test` fails on `help-manifest.test.ts`. | WP1.7 | pending |
| **`C1`, `C2`, `B3` re-record candidates (WP0.3 note) — deferred to WP2.9.** `C1`/`C2` were filmed before WP0.3 moved tiles above the charts and made List the touch default; `B3` was filmed against "Unallocated". Approval 2026-09-09 (wp1.7.md §5): defer all three to WP2.9, which already owns `B1–B3` and `C1–C3` for the group model, so they are shot once against the rebuilt chart. | WP1.7 (raised), WP2.9 (owns) | deferred to WP2.9 |

**Verifier hand-off (dev `dpnnmkhabysfdogllsyh` only; never `gteygwfgjvczanmrwgbr`):**

1. Confirm the CLI link: `cat supabase/.temp/project-ref` must read `dpnnmkhabysfdogllsyh`.
2. `supabase db push --dry-run` — expect exactly one pending file, `20260911090000_user_hint_dismissals.sql`; then `supabase db push`.
3. Policy snapshot (paste into §7): `select polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.user_hint_dismissals'::regclass;` → three rows (SELECT/INSERT/DELETE, all `user_id = auth.uid()`); `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'user_hint_dismissals';` → `authenticated`: SELECT, INSERT, DELETE only; `service_role`: all; no `anon`.
4. Repo root: `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`; `git diff --stat packages/db-types/generated.ts` shows `user_hint_dismissals`; commit it as `feat(oux-wp1.7): regenerate db types from dev`.
5. From `apps/organising-db`: `pnpm exec tsc --noEmit -p tsconfig.json`, `pnpm test`, `pnpm build`.
6. Credentialled e2e on the branch preview: `E2E_BASE_URL=<preview> E2E_USER_EMAIL=… E2E_USER_PASSWORD=… pnpm e2e tests/e2e/wall-chart.spec.ts` — three tests including "the rating hint shows once, then stays dismissed". Precondition: the e2e account's campaign has at least one tile and the account can write to it.
7. Dismissal reset check: after the run, `select * from public.user_hint_dismissals where hint_id = 'wall_chart_rating';` returns no row for the e2e user (the spec's `afterEach` deleted it). If a row remains, the `afterEach` did not run — delete it and say so in §7.
8. Screenshots per §2.6 into `docs/organiser-ux-review/evidence/wp1.7/` (desktop with hint; 375 px mobile with hint not covering its tile; desktop after dismiss + reload).

**Gates run by the implementer (from `apps/organising-db` unless stated):**

- `pnpm exec eslint` on every touched `.ts/.tsx` → 0 errors, 0 warnings.
- `pnpm test` → 76 files, 1029 tests passed (23 new).
- `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0.
- `pnpm build` → exit 0.
- `env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD -u E2E_ADMIN_EMAIL -u E2E_ADMIN_PASSWORD pnpm e2e` → 13 skipped, exit 0 (the new spec is #12).
- repo root `pnpm validate:migrations` → Validated 8 Supabase migrations.
- Drift alarm proven: with the manifest stashed at HEAD, `help-manifest.test.ts` fails with "OVERVIEW lost route /my-campaigns — did scripts/video-pipeline/publish-to-app.mjs regenerate the manifest? See wp1.7.md §2.1.7."

**Commits (oldest first):**

- `ab9c3d1` feat(oux-wp1.7): manifest route additions, hint registry, predicate and anchor picker
- `c836783` feat(oux-wp1.7): user_hint_dismissals table with owner-only RLS
- `9002591` feat(oux-wp1.7): first-use rating hint on the wall chart
- `4352311` feat(oux-wp1.7): hint e2e spec and the manifest regeneration note
- (this file) feat(oux-wp1.7): implementer notes and deviations

### Fix round 1

Fable-reviewer findings applied on `feat/oux-wp1.7-guides-hints` (Fable, 2026-09-10), on top of `4c3d54d` (migration applied to dev, types regenerated). Verified each against the file before changing it.

| # | Finding | Change |
|---|---|---|
| 1 (blocking) | `worker-tile.tsx` swapped `<FirstUseHint>{badge}</FirstUseHint>` for the bare badge on dismiss, so the rating popover that had just set `open=true` was unmounted and remounted closed: the first click on the hinted badge never opened it. | Confirmed (the two branches of the ternary have different root element types). `FirstUseHint` now takes `visible` and renders `Popover` + `PopoverAnchor` around the child regardless, gating only `open`. The tile gets a new prop `ratingHintAnchor` (is this the anchor tile — independent of visibility) beside `showRatingHint` (is the hint shown); the wrapper renders when either is set, so the anchor tile's tree shape is identical before, during and after the hint. `campaign-wall-chart.tsx` passes both. The anchor wrapper is tagged `data-hint-anchor="wall_chart_rating"` for the spec. |
| 2 (blocking) | The portalled `PopoverContent` is a React-tree descendant of the tile `<button onClick>`, so "Got it" bubbled into the tile: the worker sheet opened and a false first-interaction fired. | Confirmed. The content now stops propagation of `onClick`, `onDoubleClick`, `onContextMenu` and `onDragStart` (matching `inline-rating-popover.tsx:117`'s content). |
| 3 | `onEscapeKeyDown={onDismiss}` was document-wide (a stray Escape anywhere on the chart counted as "seen"). | Escape dismisses only when `document.activeElement` is inside the callout's content. |
| 4 | Focus after "Got it" was dropped on `<body>`; the comment and §2 claimed Tab from the badge reaches the button (it does not — the content is portalled to the end of `<body>`). | `onCloseAutoFocus` prevents Radix's default and, when the callout itself closed the hint ("Got it" or Escape inside it), focuses the first focusable inside the anchor wrapper — the badge. Not done when the hint closed because the rating control opened (focus is already in the control). Component comment and §2 "Keyboard-focusable" bullet corrected. |
| 7 | `hint_id` was unbounded text. | **New** `supabase/migrations/20260911100000_user_hint_dismissals_check.sql`: `ADD CONSTRAINT user_hint_dismissals_hint_id_check CHECK (hint_id ~ '^[a-z][a-z0-9_]{0,63}$')`. The applied file is untouched. `registry.test.ts` pins the ids to the same expression. **Not applied** by the implementer (no database connection); the verifier applies it. |
| 8 | The session-only dismissal flag was per wall-chart instance, so after a failed write, navigating away and back re-showed the hint; the comment said otherwise. | Lifted: `dismiss()` does `queryClient.setQueryData` on the dismissals list synchronously (before the write) instead of local state, so every hook instance in the session sees it; a failed write is logged and the cached entry kept. `shouldShowHint`'s `dismissedThisSession` input is unchanged (its truth table is tested); the hook passes `false` and says why. |
| 10 | The badge shows "—" when unrated, so "Click a worker's number" was false for the workers the hint is for. | Copy is now `Tap a worker's rating to set it — 1 is a supportive leader, 5 is opposed.` — one sentence, one full stop, no retired term; the registry test's one-sentence and 3.6 checks pass unchanged; the spec reads the copy from the registry. §2 pins (three) updated. |
| 5/6 | Known limits (recorded, not fixed). | (5) The hint does not appear on the touch default **List** layout: `pickRatingHintAnchor` and the anchor wrapper live in the tile grid, and the List rows render no `<WorkerTile>`. (6) A worker in two child units of a rolled-up parent may not match the anchor: the picker sees the parent-exclusive worker set and the `(workerId, ouId)` it returns may not be the pair the visible tile carries, in which case no tile shows the hint that session. |
| 11 | Prove 1 and 2 end to end. | `tests/e2e/wall-chart.spec.ts`: the hint describe now has two tests sharing `openWallChartWithHint()` (opening the rating control dismisses the hint by design, so "Got it" and "click the badge" cannot both run on one visible hint). **Got it** test: after the click, no `role=dialog` whose heading is the hinted worker's name (`campaign-worker-detail-provider.tsx` `SheetTitle` = first + last, the same string as the tile's `title` prefix) and the badge's `aria-expanded` is `"false"`; then the existing persisted-row poll, reload and absent-after-load assertions. **Badge** test: click the badge inside `[data-hint-anchor="wall_chart_rating"]` while the hint is visible, assert `aria-expanded="true"` and that the element its `aria-controls` names is visible and contains the "Save" button (`inline-rating-popover.tsx`); the hint count is 0 and no worker sheet opened; Cancel closes it; the row is persisted. `beforeEach` reset and `afterEach` delete kept. |

**Gates (from `apps/organising-db` unless stated):** `pnpm exec eslint` on the eight touched `.ts/.tsx` → exit 0, no findings. `pnpm test` → 76 files, 1029 tests passed. `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0. `pnpm build` → exit 0. Credential-less `pnpm e2e` → 14 skipped, exit 0 (the hint tests are #12 and #13). Repo root `pnpm validate:migrations` → "Validated 9 Supabase migrations with unique 14-digit versions."

**Existing preview (`fe75dd2`, https://offshore-alliance-a8u4ksna1-reveille-strategy.vercel.app) with credentials:** `wall-chart.spec.ts` → 2 passed (flow one; My campaigns), 2 failed. Both hint tests fail at the first hint assertion because that preview ships the old sentence and no `data-hint-anchor`: `getByText("Tap a worker's rating …")` finds nothing. So the preview proved the spec file loads, the two unchanged tests still pass, and the `beforeEach` reset succeeds (200/204) with `afterEach` running; it could not prove findings 1, 2 or 11 — those need the next preview (verifier step 6), with the CHECK migration applied first (step 2 gains a second pending file).

## 7. Verification output

_(verifier pastes raw output)_

## 8. Reviewer findings

_(reviewer)_
