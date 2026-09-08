# WP0.2 — Instrumentation and test harness

Repository: `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance`, app `apps/organising-db`.
Branch: `feat/oux-wp0.1-decision-register`. All `path:line` references are from the current working tree.
Unless a path starts with `supabase/`, `packages/` or `.github/`, it is relative to `apps/organising-db/`.

Shorthand used below (as in appendix A): `WC` = `src/components/campaigns/campaign-wall-chart.tsx`.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP0.2 Instrumentation and test harness.** Standard implementer. Add PostHog events for tab opens, group and filter use, and time from login to first wall-chart interaction (`src/components/providers.tsx` already mounts page views). Add a Playwright configuration and the first e2e flow (open a campaign, see the wall chart). Acceptance: events visible in a dev PostHog project; `pnpm test` and the e2e flow pass in CI-equivalent conditions. No dependencies.

### 1.2 Verification standard for e2e (verbatim)

> the app has `apps/organising-db/tests/e2e` but no Playwright configuration at the app root; WP0.2 adds one using the pre-installed Chromium and a dev-database test account the operator supplies. The five canonical flows, added as the packages that deliver them land: open a campaign from My campaigns and see the wall chart; switch the group selector and see a worker move between a unit and Unassigned; drag a tile to Unassigned; create a campaign in three screens and land on its chart; link a standalone SMS action to a campaign and see its recipients as Unassigned. Flow one is delivered here (in its phase-0 form: open a campaign from /campaigns and see the wall chart; WP1.3 later changes the start page).

### 1.3 Decisions this package consumes

From `docs/organiser-ux-review/DECISIONS.md` — section 9 decisions 1–10 are all about product structure and **none of them gate WP0.2** (the register lists WP0.2 under "Operator inputs the work packages also need", not under any decision's *Blocks* column). Two operator inputs are consumed:

| Input (DECISIONS.md, "Operator inputs" table) | Use here |
|---|---|
| "A dev-database test account with role `user` (and ideally one `viewer`), credentials supplied out of band — Dev project `dpnnmkhabysfdogllsyh` only. Never production." | `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` for the Playwright global setup. |
| "A dev PostHog project key for the preview environment — Events must be visible somewhere the operator can check." | `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` for the acceptance check. |

Two register facts constrain the design:

- **Decision 4, note:** "At instigation it is common for 100% of the membership to be Unassigned." The e2e assertion therefore accepts the Unassigned card **or** any tile, and must not assume units exist.
- **Operator inputs table:** "`docs/DEV_PROD_ENVIRONMENT.md` says the current dev seed has campaign data stripped". This is why the campaign-row step of flow one is an open question (§4, Q2), not an assumption.

Metrics this instrumentation must support (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md` §8):

- "Clicks and seconds from login to the wall chart of a named campaign" → `wallchart_first_interaction.ms_since_login` plus `campaign_tab_opened` counts between `$pageview` on `/login` and the chart.
- "Organiser weekly return rate to the wall chart — measure via PostHog" → `campaign_tab_opened {tab: "workforce", sub: "wall-chart"}` unique users per week.
- §7 phase-0 bullet: "Instrument navigation and wall-chart events in PostHog (tab opens, group/filter use, time from login to first tile interaction)."

### 1.4 Terminology

No new user-facing strings are added by this package (events and env vars are not user-facing). The one place plan §3.6 terminology is *referenced* is the e2e assertion, which matches the existing string **"Unassigned workers"** (`WC:1594`) — already the plan's word. No string is renamed here; renames belong to WP0.3.

---

## 2. Plan

### 2.0 What already exists (read, not guessed)

| Thing | Where | State |
|---|---|---|
| PostHog init | `src/lib/posthog-client.ts:7-18` — `initPostHogIfNeeded()`, `posthog.init(key, {api_host, capture_pageview:false, capture_pageleave:true, disable_session_recording:true})`, idempotent via a module flag (`:4`) | reuse as-is |
| Enablement / env | `src/lib/posthog-config.ts:14-30` — key from `NEXT_PUBLIC_POSTHOG_KEY` \| `_TOKEN` \| `_API_KEY` \| `_PROJECT_TOKEN` (`:14-21`); host from `NEXT_PUBLIC_POSTHOG_HOST` (`:23-26`); `isPostHogEnabled()` = both present (`:28-30`) | reuse as-is |
| Page views | `src/components/posthog-page-view.tsx:14-26`, mounted at `src/components/providers.tsx:478` inside `<Suspense>` | untouched |
| Identify | `src/lib/supabase/auth-context.tsx:305-306` — `posthog.identify(user.id, {email})` once per user change | untouched |
| **A capture helper already exists** | `src/lib/phone/telemetry.ts:49-61` — `safeCapture()`: no-op when `window` undefined or PostHog disabled, `initPostHogIfNeeded()` first, `try/catch` that never throws, a `surface` prop on every event, snake_case names, a `MobileDialerEvent` string union (`:22-45`) | **copy the shape**; do not refactor it |
| `usePostHog` hook | none — `grep -il posthog src/**` returns 8 files, all importing `posthog-js` directly | n/a |
| Config self-check endpoint | `src/app/api/posthog/config-check/route.ts:9-36` — returns `{hasKey, hasHost, keyPrefix, hostLooksLikeIngest}`, no secrets | used as acceptance evidence |
| `src/lib/analytics/` | does not exist | created here |

There is **one PostHog module per concern already** (`posthog-config`, `posthog-client`, `phone/telemetry`). Adding `src/lib/analytics/` as the third, organiser-UX-scoped telemetry module follows that grain rather than cutting across it.

---

### 2.1 New file — `src/lib/analytics/events.ts` (the typed module)

Purpose: one event-name union, one `track()`, and typed props per event. Mirrors `src/lib/phone/telemetry.ts:49-61` exactly so there is one telemetry idiom in the codebase.

```
export type OrganiserUxEvent =
  | "campaign_tab_opened"
  | "wallchart_group_selected"
  | "wallchart_filter_applied"
  | "wallchart_first_interaction";
```

- `type EventProps = Record<string, string | number | boolean | null | undefined | string[]>` (widened from `phone/telemetry.ts:47` by `string[]` for `filter_keys`).
- `export function track(event: OrganiserUxEvent, props: EventProps = {}): void` — body identical in shape to `safeCapture` (`phone/telemetry.ts:49-61`): return if `typeof window === "undefined"`; return if `!isPostHogEnabled()`; `initPostHogIfNeeded()`; `posthog.capture(event, { surface: "organiser_ux", ...props })`; `catch {}`.
- Four thin named wrappers with exact prop types, in the style of `dialerTelemetry` (`phone/telemetry.ts:63-112`):
  - `trackCampaignTabOpened(p: { campaign_id: number; tab: string; sub: string | null })`
  - `trackWallchartGroupSelected(p: { campaign_id: number; ou_type: string | null; previous_ou_type: string | null; group_count: number; control: "assessment_charts_ou_type" })`
  - `trackWallchartFilterApplied(p: { campaign_id: number; scope: "unit" | "unassigned" | "all"; filter_keys: string[]; filter_count: number; sort_key: string })`
  - `trackWallchartFirstInteraction(p: { campaign_id: number; ms_since_login: number | null; interaction: "tile_click" | "drag" | "rating" | "filter"; login_source: "login_form" | "session_restored" | "unknown" })`

**Privacy rule (stated as a rule, enforced by the types above):**
> No event property may carry a worker's name, phone number, email address, address, notes or any free text a worker or organiser typed. Every property is an integer id, an enum drawn from a closed union, a boolean, a count, or a duration in milliseconds. In particular `wallchart_first_interaction` carries `campaign_id` but **no** `worker_id`, and `wallchart_filter_applied` carries filter *key names* (`"occupations"`) and a count, never the selected occupation ids or membership-type ids, because those are small-cardinality values that can re-identify a worker when combined with `campaign_id`.

This rule is written as a file-header comment in `events.ts` and is the reason the wrapper signatures are closed objects rather than `Record<string, unknown>`. Existing behaviour that is **out of scope and untouched**: `auth-context.tsx:305-306` sends the *signed-in organiser's own* email to `posthog.identify`; that is staff identity, not worker PII, and predates this package.

---

### 2.2 New file — `src/lib/analytics/session-timing.ts` (pure logic + the sessionStorage stamp)

Pure functions (all exported, all tested in §2.9):

| Function | Signature | Behaviour |
|---|---|---|
| `msSinceLogin` | `(loginTs: number \| null, now: number) => number \| null` | `null` when `loginTs` is `null`; `null` when `now < loginTs` (clock moved backwards); `null` when `now - loginTs > MAX_LOGIN_AGE_MS` (6 h — a stale stamp must not poison the §8 metric); otherwise `now - loginTs`. |
| `parseLoginStamp` | `(raw: string \| null) => { ts: number; source: LoginSource } \| null` | Parses the stored `"<epochMs>:<source>"` value; `null` on any malformed input. Pure — takes the raw string, does not touch storage. |
| `formatLoginStamp` | `(ts: number, source: LoginSource) => string` | Inverse of the above. |
| `firstInteractionPayload` | `(a: { stamp: {ts,source} \| null; now: number; campaignId: number; interaction: Interaction; alreadyFired: boolean }) => FirstInteractionProps \| null` | `null` when `alreadyFired`; otherwise the exact props object handed to `trackWallchartFirstInteraction`, with `ms_since_login = msSinceLogin(...)` and `login_source = stamp?.source ?? "unknown"`. This is the whole once-per-session + timing decision as one pure function. |

Impure edges in the same file, kept to three one-line functions so the tested surface stays pure:

- `LOGIN_STAMP_KEY = "oux:login-ts"`, `FIRST_INTERACTION_KEY = "oux:wallchart-first-interaction"`.
- `stampLogin(source: LoginSource, now = Date.now())` → `window.sessionStorage.setItem(LOGIN_STAMP_KEY, formatLoginStamp(now, source))`, in `try/catch`.
- `readLoginStamp()` → `parseLoginStamp(window.sessionStorage.getItem(LOGIN_STAMP_KEY))`, in `try/catch`.
- `hasFiredFirstInteraction()` / `markFirstInteractionFired()` → read/write `FIRST_INTERACTION_KEY`, in `try/catch`.

**Storage rule.** The orchestrator rule is "Do not keep view state in `localStorage`" (plan §7 "What not to do": "Do not leave state in `localStorage` for anything that changes what an organiser sees on another device"). Both keys here are written to **`sessionStorage`**, not `localStorage`; they are a per-tab timing stamp and a per-tab "already measured" flag. **Neither changes what an organiser sees** — nothing in the UI reads them, and losing them degrades a metric, not a view. Stating it explicitly so the rule is not read as violated. Precedent for `sessionStorage` in this app: `src/components/providers.tsx:266-283` and `:425-442` (reload cooldown), `src/components/shared/back-button.tsx:31-41`. `src/lib/supabase/session-recovery.ts:185-191` clears only `sb-`-prefixed `sessionStorage` keys, so the `oux:` keys survive a session recovery.

**Where "login time" comes from.** Primary: the login form's success path. `src/app/(auth)/login/page.tsx:73` currently reads

```
      router.push("/campaigns");
```

Change to call `stampLogin("login_form")` on the line immediately before `router.push("/campaigns")` (i.e. between `:72` and `:73`), inside the `if (result.error) { … return; }` guard's fall-through so it only fires on success. This is the honest t0 for the §8 metric ("from login to the wall chart").

Secondary (fallback, so a reload or a restored session is not silently unmeasured): `src/lib/supabase/auth-context.tsx:192-208`, the `INITIAL_SESSION` branch. After `setLoading(false)` at `:207` and before `return` at `:208`, when `initialUser` is non-null **and** `readLoginStamp()` returns `null`, call `stampLogin("session_restored")`. Because the source is carried on the event as `login_source`, the operator filters PostHog to `login_source = "login_form"` for the true login-to-chart number and keeps `session_restored` rows as a separate, clearly-labelled cohort. No other auth branch stamps (`TOKEN_REFRESHED` at `:211-218` and the recovery path at `:225-264` must not reset t0).

---

### 2.3 `campaign_tab_opened` — `src/app/(dashboard)/campaigns/[id]/page.tsx`

The tab handlers are `handleTabChange` (`:208-223`) and `handleSubChange` (`:225-237`). Instrumenting those two alone would **miss every deep link**, and the deep link is the important one: `campaigns/page.tsx:424` and `:445` both push `/campaigns/{id}?tab=workforce&sub=wall-chart`, and `campaign-detail-header-bar.tsx` "Build list" forces the same URL. Appendix D §3.2 confirms every surface is URL-addressed via `?tab=&sub=`.

So instrument the **resolved state**, not the click. `activeTab` / `activeSub` are computed at `:183-184` from `resolveTabParams(...)` (`:174-181`). Add, immediately after the legacy-redirect effect at `:187-206`:

```
  useEffect(() => {
    if (!campaignIdValid) return;
    if (needsRedirect(rawTab, rawSub, resolved)) return; // the redirect will re-run this
    trackCampaignTabOpened({ campaign_id: campaignId, tab: activeTab, sub: activeSub ?? null });
  }, [campaignId, campaignIdValid, activeTab, activeSub]);
```

Notes:
- `campaignId` / `campaignIdValid` are defined at `:242-243`; the effect must therefore be placed **after** `:243`, not at `:187`. Concretely: insert the effect immediately after `:243`, and keep the existing redirect effect where it is. (`activeTab`/`activeSub` are already in scope from `:183-184`.)
- The `needsRedirect` guard reuses the helper already imported and used at `:188`, so a legacy `?tab=workplan` URL emits **one** event (for the resolved `plan/workplan`), not two.
- `activeTab` is `"overview"` for the bare URL, so overview opens are counted too.
- One event per resolved (tab, sub) pair per mount/URL change. `router.replace` at `:202`/`:220`/`:234` does not remount the page, so the effect's dependency array is what de-duplicates.

---

### 2.4 `wallchart_group_selected` — `src/components/campaigns/WallChartAssessmentCharts.tsx`

**Which handler, exactly.** Appendix A §3.4 names the "Group units by" `OuTypeSelector` as the closest thing to group use today. Its `onChange` is wired at `WallChartAssessmentCharts.tsx:113-117`:

```
113:          <OuTypeSelector
114:            groups={ouGroups}
115:            value={effectiveOuType}
116:            onChange={setSelectedOuType}
117:          />
```

Replace `onChange={setSelectedOuType}` with a `useCallback` declared next to the `selectedOuType` state at `:89`:

```
  const handleOuTypeChange = useCallback((next: string | null) => {
    setSelectedOuType((prev) => {
      trackWallchartGroupSelected({
        campaign_id: Number(campaignId),
        ou_type: next,
        previous_ou_type: prev ?? effectiveOuType ?? null,
        group_count: ouGroups.length,
        control: "assessment_charts_ou_type",
      });
      return next;
    });
  }, [campaignId, effectiveOuType, ouGroups.length]);
```

(Track inside the updater so `previous_ou_type` is the true previous value; the call is idempotent-safe because React only double-invokes updaters in StrictMode dev, and `track` is a fire-and-forget no-op when PostHog is disabled. If StrictMode double-fire in dev is judged noisy, hoist the `track` call above `setSelectedOuType` and use the `effectiveOuType` memo at `:97-100` as `previous_ou_type` — both are acceptable; the implementer picks one and comments it.)

The selector only renders when there is more than one distinct `ou_type` (`OuTypeSelector.tsx:21`), so absence of the event on a single-type campaign is expected, not a bug.

**The type-band context, stated explicitly.** The wall chart itself groups unit cards into `ou_type` bands, but those bands are **not an interactive control** — they are a render grouping, and the only code that reasons about them is the cross-dimension move guard at `WC:1246-1268`. There is therefore **no band-change handler to instrument**; the `OuTypeSelector` at `WallChartAssessmentCharts.tsx:113-117` is the single group-selection control in the product today. The event name `wallchart_group_selected` is chosen so WP2.x can re-point it at the real group selector without renaming the event or breaking the phase-0 baseline series; `control` distinguishes the two eras.

---

### 2.5 `wallchart_filter_applied` — `WC` and `wall-chart/filters.ts`

**New pure helper**, added to `src/components/campaigns/wall-chart/filters.ts` immediately after `hasActiveFilter` (`:106-118`) so the two stay in sync by proximity:

```
export type WallChartFilterKey =
  | "membership" | "roles" | "ratings" | "occupations"
  | "phone" | "email" | "assessments" | "facts";

export function activeFilterKeys(s: WallChartFilterState): WallChartFilterKey[]
```

One clause per line of `hasActiveFilter` (`:108-116`), in the same order, so `activeFilterKeys(s).length > 0 === hasActiveFilter(s)` holds by construction:
`membershipTypeIds.size > 0 || includeNonMember` → `"membership"`; `roles.size > 0` → `"roles"`; `ratings.size > 0` → `"ratings"`; `occupationIds.size > 0` → `"occupations"`; `phone !== "any"` → `"phone"`; `email !== "any"` → `"email"`; `activeAssessmentFilters(s).length > 0` (`:100-104`) → `"assessments"`; `factFilters.length > 0` → `"facts"`.
`sort` is deliberately **not** a filter key (the file's own comment at appendix A §5: "not a filter; see `applySort`"); the current sort travels as the separate `sort_key` prop, taken from `s.sort` (`filters.ts:67`).

**Where it fires — three call sites, all in `WC`:**

1. **Per-scope set** — `WC:929-935`:
   ```
   929:  const setFilter = (scope: number, next: WallChartFilterState) => {
   ```
   Add, before `setFilterByScope(...)`:
   ```
     const keys = activeFilterKeys(next);
     trackWallchartFilterApplied({
       campaign_id: Number(campaignId),
       scope: scope === UNASSIGNED_KEY ? "unassigned" : "unit",
       filter_keys: keys,
       filter_count: keys.length,
       sort_key: next.sort,
     });
     noteFirstInteraction("filter");   // §2.7
   ```
   `UNASSIGNED_KEY = 0` is declared at `WC:926`. This one function covers both filter bars: the Unassigned card's (`WC:1645-1658`, `onChange={(next) => setFilter(UNASSIGNED_KEY, next)}` at `:1647`) and every unit card's (`WC:2002-2015`, `onChange={(next) => setFilter(ou.ou_id, next)}` at `:2004`). It also covers Sort changes, because `WallChartFilterBar` routes sort through the same `onChange` (appendix A §3.5 items 28-29) — which is why `sort_key` is on the event.

2. **"Apply to all units" from the Unassigned card** — `WC:1652-1657`. This bypasses `setFilter` and calls `setFilterByScope` directly. Add the same `trackWallchartFilterApplied` call with `scope: "all"` and `filter_keys: activeFilterKeys(filter)` (the `filter` const from `:1546`) at the top of the `onApplyToAll` body, plus `noteFirstInteraction("filter")`.

3. **"Apply to all units" from a unit card** — `WC:2009-2014`. Same change, same `scope: "all"`, using the per-card `filter` in scope at that point.

To avoid three copies, declare one `applyToAllScopes(filter: WallChartFilterState)` helper next to `setFilter` (`WC:929`) that does the `new Map` build (`:1653-1656` / `:2010-2013`), the track and the `noteFirstInteraction`, and call it from both `onApplyToAll` bodies. Net effect on `WC`: one new helper, three touched blocks.

---

### 2.6 `wallchart_first_interaction` — the four handlers

Fired **once per browser session** (per tab), from `WC`, via one local helper declared beside `setFilter` (`WC:929`):

```
  const noteFirstInteraction = useCallback((interaction: Interaction) => {
    const payload = firstInteractionPayload({
      stamp: readLoginStamp(),
      now: Date.now(),
      campaignId: Number(campaignId),
      interaction,
      alreadyFired: hasFiredFirstInteraction(),
    });
    if (!payload) return;
    markFirstInteractionFired();
    trackWallchartFirstInteraction(payload);
  }, [campaignId]);
```

Exact call sites, all inside `WC` except the rating one:

| Interaction | Site | Change |
|---|---|---|
| `"tile_click"` | `WC:1073-1080`, the `renderTile` `onClick` prop | first statement of the handler body, before the `kind === "toggle-select"` branch at `:1074`, so a modifier-click counts too |
| `"drag"` | `WC:1094-1109`, `onDragStartRefs` | first statement of the handler body at `:1095`. Drag **start** is the earliest honest signal; `handleWorkerDrop` (`WC:1230-1285`) is not used because it can bail out at `:1240`/`:1244`/`:1266` after the organiser has already interacted |
| `"filter"` | `WC:929-935` and the two `onApplyToAll` bodies | see §2.5 |
| `"rating"` | see below | a two-prop thread |

**The rating thread (3 files, 4 small edits).** Today the rating popovers save internally and tell the tile nothing:

- `src/components/campaigns/wall-chart/inline-rating-popover.tsx:23-38` — `InlineRatingPopoverProps`; save success at `:57-67` (`onSuccess: () => { toast.success(...); setOpen(false); setNotes(""); }`).
- Same file `:174-181` — `CumulativeRatingPopoverProps`; save success at `:201-210`.

Edits:
1. Add `onSaved?: () => void;` to `InlineRatingPopoverProps` (after `:33`) and to `CumulativeRatingPopoverProps` (after `:178`); destructure it in both component signatures (`:40-52`, `:183-189`).
2. Call `onSaved?.()` as the first line of each `onSuccess` body (`:60` and `:204`) — before the toast, so a toast failure cannot swallow it.
3. `src/components/campaigns/wall-chart/worker-tile.tsx` — add `onRatingSaved?: () => void;` to `WorkerTileProps` (after `:74`, next to `onContactBadgeClick`), destructure it at `:110`, and pass `onSaved={onRatingSaved}` to both popovers at `:271-287` (`InlineRatingPopover`) and `:288-296` (`CumulativeRatingPopover`).
4. `WC:1112` — add `onRatingSaved={() => noteFirstInteraction("rating")}` to the `<WorkerTile … />` render in `renderTile`, and add `noteFirstInteraction` to the `useCallback` dependency array at `WC:1115`.

This is additive and optional at every hop; no existing caller changes behaviour.

**Why once per session and not once per campaign:** plan §8's metric is "seconds from login to the wall chart of a named campaign" — a single number per login. `campaign_id` on the event identifies which campaign it happened to be. A per-campaign variant would inflate the sample with second and third campaigns opened in the same sitting, whose t0 is meaningless.

---

### 2.7 Pre-existing broken test that blocks the acceptance criterion

`pnpm test` from `apps/organising-db` **currently fails** (verified: `Test Files 1 failed | 49 passed (50)`, `Tests 632 passed (632)`):

```
FAIL src/lib/sms/__tests__/rating-source-taxonomy.test.ts
Error: ENOENT: no such file or directory, open
'…/supabase/migrations/20260813120000_sms_source_taxonomy.sql'
```

The file moved to `supabase/migrations_legacy/` in the baseline repair (`supabase/migrations/` now holds only the three `20260908*` baseline files). The acceptance criterion "`pnpm test` … pass" cannot be met without fixing it.

Fix — **one line**, `src/lib/sms/__tests__/rating-source-taxonomy.test.ts:32`:

```
32: const MIGRATION = "supabase/migrations/20260813120000_sms_source_taxonomy.sql";
```
→ `"supabase/migrations/20260908050000_baseline_schema.sql"`, plus a one-sentence comment saying the taxonomy now lives in the baseline. Verified this works: the baseline carries the constraint the test slices on, at `supabase/migrations/20260908050000_baseline_schema.sql:7517`, with all three split sources (`sms_chat`, `sms_survey`, `sms_inbound`) and every pre-split value the test asserts (`call_outcome`, `phone_call_live`, `phone_call_share_link`, `door_knock`, `an_sync`, `an_report_import`, …). Pointing at `supabase/migrations_legacy/…` would also pass but would assert against an audit-only copy, which the orchestrator's rules describe as not the live schema.

No migration is added or edited by this package.

---

### 2.8 Playwright

**Workspace conventions.** `pnpm-workspace.yaml` is `packages: ["apps/*", "packages/*"]`; the root `package.json` carries only `@sentry/nextjs`, `supabase`, `turbo`. Test tooling is per-app: `vitest` is in `apps/organising-db/package.json` devDependencies, and `apps/organising-db/vitest.config.ts` lives at the app root. **`@playwright/test` goes in `apps/organising-db/package.json` devDependencies** and `playwright.config.ts` at the app root, matching vitest exactly.

**Chromium.** `ls ~/Library/Caches/ms-playwright` shows `chromium-1191, 1193, 1194, 1223, 1228` (+ headless-shell twins, firefox, webkit) — installed by other tooling, not this repo. `npx playwright --version` reports `1.63.0` (npx had to fetch it; **no Playwright is installed in this repo**). `npx playwright install --dry-run chromium` for 1.63.0 wants **`chromium-1243`, which is not in the cache**. Reading `~/.npm/_npx/*/node_modules/playwright-core/browsers.json` confirms the mapping `1.63.0 → chromium-1243` and `1.56.0-alpha → chromium-1191`.

So "the pre-installed Chromium" is *a* Chromium, not the one a current Playwright will use. Recommendation:

- Add `"@playwright/test": "^1.63.0"` and run `pnpm exec playwright install chromium` once (~150 MB, one-time, to the same shared `~/Library/Caches/ms-playwright`). Add `"e2e:install": "playwright install chromium"` to the app's scripts so the step is discoverable.
- Fallback if the operator wants **zero download**: pin `"@playwright/test": "1.56.0"`, which resolves to the already-present `chromium-1191`. Recorded as open question Q1; the default is the download.
- If `pnpm install` reports an ignored build script for `playwright`, either add `"playwright"` to the root `package.json` `pnpm.onlyBuiltDependencies` array (which already lists `esbuild`, `msw`, `sharp`, `supabase`, `unrs-resolver`) or ignore it and rely on the explicit `e2e:install` script — the explicit script is preferred, because it keeps browser downloads out of `pnpm install`.

**New file — `apps/organising-db/playwright.config.ts`**

```
import { defineConfig, devices } from "@playwright/test";

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Deliberately **no `webServer` block**: the operator points `E2E_BASE_URL` at whatever is already running (dev server, `pnpm start`, or a preview URL), which is what the "CI-equivalent" sequence in §2.10 does. Adding `webServer` would fight an already-running dev server on port 3000. `devices["Desktop Chrome"]` matters: `src/app/layout.tsx:37` sets `isMobile` from the `x-viewport` header and `src/components/data-tables/data-table.tsx:188` branches on it, so a desktop context is what renders the `<table>` the spec clicks.

**New file — `apps/organising-db/tests/e2e/env.ts`** (shared, tiny)

```
export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
export const hasE2ECredentials = Boolean(E2E_USER_EMAIL && E2E_USER_PASSWORD);
export const NO_CREDENTIALS_MESSAGE =
  "Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.";
```

**New file — `apps/organising-db/tests/e2e/global-setup.ts`**

Logs in once, saves `storageState`. Field selectors read from `src/app/(auth)/login/page.tsx`:

| Field | Selector | Source |
|---|---|---|
| Email | `#email` (`input id="email" type="email"`) | `login/page.tsx:127-135`, label `htmlFor="email"` at `:121-126` |
| Password | `#password` (`input id="password" type="password"`) | `login/page.tsx:145-152`, label at `:139-144` |
| Submit | `getByRole("button", { name: /sign in/i })` — text is `"Sign In"` / `"Signing in..."` while loading | `login/page.tsx:165-171` |
| Success signal | URL becomes `/campaigns` | `login/page.tsx:73` `router.push("/campaigns")`; middleware also bounces a signed-in `/login` to `/campaigns` (`src/lib/supabase/middleware.ts:71-75`) |

Body:
1. Ensure `tests/e2e/.auth/` exists; **always write a file at `STORAGE_STATE`** (an empty `{ "cookies": [], "origins": [] }` when there are no credentials) — otherwise Playwright errors on a missing `storageState` path before any test can skip.
2. If `!hasE2ECredentials`: `console.log(NO_CREDENTIALS_MESSAGE)` and return. **Never throw** — absent credentials must skip, not fail.
3. Otherwise: launch chromium, `page.goto(new URL("/login", E2E_BASE_URL).toString())`, fill `#email` / `#password`, click Sign In, `await page.waitForURL(/\/campaigns(\?|$)/, { timeout: 30_000 })`, `await context.storageState({ path: STORAGE_STATE })`, close.
4. Add `apps/organising-db/tests/e2e/.auth/` to `.gitignore` (the app has no `.gitignore` of its own; add the line to the repo-root `.gitignore`). The file contains a live dev session cookie and must never be committed.

**Scripts** added to `apps/organising-db/package.json`:
```
"e2e": "playwright test",
"e2e:install": "playwright install chromium"
```

**The existing spec — `tests/e2e/mobile-dialer.spec.ts`.** It is *not* deleted and *not* excluded. It fits, with one two-line repair. Today it declares its globals instead of importing them:

```
22: /* eslint-disable @typescript-eslint/no-explicit-any */
23: declare const test: any;
24: declare const expect: any;
```

Under the new config it would be collected and would throw `ReferenceError: test is not defined` at import time, before its own `test.skip(!TOKEN || !PASSWORD, …)` at `:30` could run — so leaving it untouched is not an option. Replace `:22-24` with `import { test, expect } from "@playwright/test";` and drop the `: { page: any }` annotation at `:32-35` (the import supplies the type). Everything else stays: it keeps its `test.describe` (`:29`), its `test.skip` on `MOBILE_DIALER_TEST_TOKEN` / `MOBILE_DIALER_TEST_PASSWORD` (`:26-27, 30`), and its relative `page.goto(\`/call/${TOKEN}\`)` (`:38`) now resolves against the config's `baseURL`. With those env vars unset it **skips with its existing message**, so it does not affect the acceptance run. Its route `/call/[token]` is token-gated and outside the auth middleware (`src/lib/supabase/middleware.ts:57-59`), so the shared `storageState` is harmless to it.

---

### 2.9 Flow one — `apps/organising-db/tests/e2e/wall-chart.spec.ts` (new)

```
open a campaign from /campaigns and see the wall chart
```

Steps and the selector each one uses:

| Step | Selector / assertion | Why it is stable |
|---|---|---|
| skip guard | `test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE)` | §2.8 |
| `await page.goto("/campaigns")` | — | `src/app/page.tsx:4` and `login/page.tsx:73` both land here (appendix D §2.1) |
| wait for the table | `page.locator("table tbody tr")` | `data-table.tsx:289-333` renders `<TableBody>`/`<TableRow>` on desktop |
| assert there is a campaign | `await expect(rows.first()).toBeVisible({ timeout: 30_000 })` with a message naming Q2 | the DataTable shows literal `"No results found."` (`data-table.tsx:196-198`) when empty, so the failure is legible |
| click the first row | `await rows.first().click()` | `campaigns/page.tsx:444-446` → `router.push('/campaigns/{id}?tab=workforce&sub=wall-chart')` |
| assert the URL | `await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/)` | the deep link in appendix D §2.2 |
| assert the chart rendered | `await expect(page.getByText("Wall chart", { exact: true })).toBeVisible()` | `WC:1319` — `<CardTitle className="text-lg">Wall chart</CardTitle>`, rendered unconditionally: `WC:1316-1319` is the component's only `return`, with **no loading early-return** |
| assert the summary header | `await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible()` | `wall-chart/wall-chart-summary-header.tsx:71` — `<h2>Campaign summary</h2>`, rendered whenever the header is not "stuck" (`:69`), which is the state on first paint |
| assert the toggle is on Wall chart | `await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute("aria-pressed", "true")` | `workforce/workforce-board.tsx:123-128` + `:157` (`aria-pressed={active}`); `DEFAULT_VIEW = "wall-chart"` at `:17` |
| assert content | `await expect(page.locator("[data-worker-id]").first().or(page.locator('[data-ou-id="unassigned"]'))).toBeVisible()` | tiles carry `data-worker-id` (`wall-chart/worker-tile.tsx:313`); the Unassigned card wrapper carries `data-ou-id="unassigned"` (`WC:1585`) and its title is `"Unassigned workers"` (`WC:1594`) |

**`data-testid` attributes to add: none.** Every anchor above already exists in the product (`#email`, `#password`, the Sign In button text, `table tbody tr`, the `"Wall chart"` card title, the `"Campaign summary"` heading, `aria-pressed` on the view toggle, `data-worker-id`, `data-ou-id`). The `data-*` hooks are load-bearing for the app itself, not test-only: `WC:532`, `WC:754` and `WC:2441` all `document.querySelector('[data-ou-id="…"]')`, and `wall-chart/relationship-overlay.tsx:29` measures from `data-worker-id`. Nothing is added to production markup by this package.

**The empty-campaign problem, stated plainly.** The Unassigned card is gated: `WC:1545` is `{unassignedWorkerIds.length > 0 && (() => { … })()}`, and a campaign with no units at all renders only the copy at `WC:1668-1672`. So on a campaign with **zero members** the final content assertion fails. Per DECISIONS.md the dev seed "has campaign data stripped". **The spec does not paper over this**: the `.or()` assertion tolerates a campaign that is 100% Unassigned (decision 4's note — the common instigation state) but requires at least one member. The two structural assertions before it ("Wall chart", "Campaign summary") pass on a completely empty campaign, so a failure is unambiguous about which condition was missing. Whether the operator seeds a campaign or the spec's content assertion is dropped is **open question Q2**; the plan's assumption is that the operator's dev account can see one campaign with at least one member.

---

### 2.10 Tests to add (vitest)

New directory `src/lib/analytics/__tests__/`, following the existing pattern (`src/lib/nav/__tests__/active-nav.test.ts`, and 11 other `__tests__` folders under `src/lib/**`; `vitest.config.ts:23` includes `src/**/__tests__/**/*.test.{ts,tsx}`).

| File | Covers |
|---|---|
| `src/lib/analytics/__tests__/session-timing.test.ts` | `msSinceLogin`: normal delta; `null` stamp → `null`; `now < loginTs` → `null`; `now - loginTs > MAX_LOGIN_AGE_MS` → `null`; exact boundary at `MAX_LOGIN_AGE_MS`. `formatLoginStamp`/`parseLoginStamp` round-trip; malformed inputs (`""`, `"abc"`, `"123"`, `"123:bogus"`, `null`) → `null`. `firstInteractionPayload`: `alreadyFired` → `null`; no stamp → payload with `ms_since_login: null` and `login_source: "unknown"`; `login_form` stamp → correct `ms_since_login` and `login_source`; each `interaction` value passes through. Pure — no storage, no fake timers; `now` is an argument. |
| `src/lib/analytics/__tests__/events.test.ts` | The four prop-builder wrappers, exported alongside `track` as pure `buildXProps(...)` functions so they are testable without a DOM: exact key sets, `sub: null` when absent, `filter_count === filter_keys.length`, and a guard test asserting **no property key matches `/name\|email\|phone\|address\|note/i`** — the §2.1 privacy rule as an executable assertion. |
| `src/components/campaigns/wall-chart/__tests__/filters.test.ts` (new folder; sibling-`__tests__` precedent: `src/components/audience/__tests__/`) | `activeFilterKeys`: empty `DEFAULT_FILTER_STATE()` → `[]`; one key per dimension in turn; `includeNonMember` alone → `["membership"]`; an `assessmentFilters` entry with an empty `buckets` set → **not** `"assessments"` (matches `activeAssessmentFilters`, `filters.ts:100-104`); and the invariant `activeFilterKeys(s).length > 0 === hasActiveFilter(s)` over a table of ~10 states. |

No test is added for `track()` itself (it is an untestable side-effecting shim over `posthog-js`, exactly like `phone/telemetry.ts:49-61`, which has no test either).

---

### 2.11 Env and docs

- `apps/organising-db/.env.example` — append a commented block (the file currently has **no** PostHog or E2E entries):
  ```
  # PostHog (analytics). Both must be set or all capture no-ops.
  NEXT_PUBLIC_POSTHOG_KEY=
  NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

  # Playwright e2e. DEV PROJECT ONLY (dpnnmkhabysfdogllsyh) — never production.
  E2E_BASE_URL=http://localhost:3000
  E2E_USER_EMAIL=
  E2E_USER_PASSWORD=
  ```
- Repo-root `.gitignore` — add `apps/organising-db/tests/e2e/.auth/`.
- `turbo.json` needs **no** change: its `build.env` allow-list already begins with `NEXT_PUBLIC_*` (`turbo.json:6-7`), which covers both PostHog vars. The `E2E_*` vars are runtime-only for Playwright and never reach a Next build.

---

### 2.12 Files touched — summary

**New (8):**
| Path | Purpose |
|---|---|
| `src/lib/analytics/events.ts` | event union, `track()`, four typed wrappers, privacy rule |
| `src/lib/analytics/session-timing.ts` | pure timer + stamp helpers |
| `src/lib/analytics/__tests__/session-timing.test.ts` | vitest |
| `src/lib/analytics/__tests__/events.test.ts` | vitest |
| `src/components/campaigns/wall-chart/__tests__/filters.test.ts` | vitest |
| `playwright.config.ts` | e2e config |
| `tests/e2e/env.ts` | credential guard + skip message |
| `tests/e2e/global-setup.ts` | one login → `storageState` |
| `tests/e2e/wall-chart.spec.ts` | flow one |

(9 including the spec; `tests/e2e/.auth/user.json` is generated, gitignored.)

**Modified (9):**
| Path | Lines | Change |
|---|---|---|
| `package.json` (app) | devDependencies, scripts | `@playwright/test`; `e2e`, `e2e:install` scripts |
| `src/app/(auth)/login/page.tsx` | before `:73` | `stampLogin("login_form")` |
| `src/lib/supabase/auth-context.tsx` | `:192-208` | fallback stamp when `INITIAL_SESSION` has a user and no stamp exists |
| `src/app/(dashboard)/campaigns/[id]/page.tsx` | after `:243` | `campaign_tab_opened` effect |
| `src/components/campaigns/WallChartAssessmentCharts.tsx` | `:89`, `:113-117` | `handleOuTypeChange` + `wallchart_group_selected` |
| `src/components/campaigns/wall-chart/filters.ts` | after `:118` | `activeFilterKeys` + `WallChartFilterKey` |
| `src/components/campaigns/campaign-wall-chart.tsx` | `:929-935`, `:1073`, `:1094`, `:1112-1115`, `:1652-1657`, `:2009-2014` | `noteFirstInteraction`, `applyToAllScopes`, three filter events, tile/drag/rating first-interaction |
| `src/components/campaigns/wall-chart/worker-tile.tsx` | `:74`, `:110`, `:271-296` | optional `onRatingSaved` thread |
| `src/components/campaigns/wall-chart/inline-rating-popover.tsx` | `:33`, `:52`, `:60`, `:178`, `:189`, `:204` | optional `onSaved` on both popovers |
| `src/lib/sms/__tests__/rating-source-taxonomy.test.ts` | `:32` | repoint to the baseline schema (§2.7) |
| `tests/e2e/mobile-dialer.spec.ts` | `:22-24`, `:32-35` | `declare` → real import |
| `.env.example`, root `.gitignore` | append | env template, ignore `.auth/` |

**Schema changes: none.** No file is added to `supabase/migrations/`.

---

### 2.13 Commands that prove each acceptance criterion

Run from `apps/organising-db` unless noted.

| Criterion | Command | Expected |
|---|---|---|
| Lint clean | `pnpm lint` | no new errors (baseline: clean) |
| `pnpm test` passes | `pnpm test` | `Test Files 53 passed (53)` — 50 existing files with the §2.7 repair, plus 3 new. **Baseline today is `1 failed \| 49 passed`**, so this criterion is only met with §2.7 included |
| Build passes | `pnpm build` | success. Also proves the new `tests/e2e/*.ts` typecheck: `tsconfig.json` `include` is `["next-env.d.ts","**/*.ts","**/*.tsx",…]` with `exclude: ["node_modules"]`, so `playwright.config.ts` and `tests/e2e/**` are inside the program |
| Browser present | `pnpm e2e:install` | `chromium-<rev>` downloaded or already present in `~/Library/Caches/ms-playwright` |
| e2e skips cleanly without credentials | `pnpm e2e` with `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` unset | exit 0; `wall-chart.spec.ts` and `mobile-dialer.spec.ts` both reported **skipped**, with the §2.8 message printed by global setup. No failures |
| e2e flow one passes | `E2E_BASE_URL=http://localhost:3000 E2E_USER_EMAIL=… E2E_USER_PASSWORD=… pnpm e2e tests/e2e/wall-chart.spec.ts` | 1 passed |
| Events reach dev PostHog | see §2.14 | four event names in Live events |

**CI-equivalent sequence.** `.github/workflows/` contains exactly two workflows, `gen-types.yml` (regenerates types on pushes to `main`) and `validate-migrations.yml` (runs `scripts/validate-supabase-migrations.mjs` on `supabase/migrations/**` changes). **Neither runs lint, tests or a build for this app, and no workflow is added here** (per the WP's instruction). "CI-equivalent conditions" therefore means this local sequence, run against a production build rather than a dev server:

```
cd apps/organising-db
pnpm lint
pnpm test
pnpm build
pnpm start &            # serves the production build on :3000
E2E_BASE_URL=http://localhost:3000 \
E2E_USER_EMAIL=… E2E_USER_PASSWORD=… \
pnpm e2e
kill %1
```

`pnpm start` (not `pnpm dev`) is what makes it CI-equivalent: it exercises the same bundle a preview deploy serves, and `NEXT_PUBLIC_POSTHOG_*` are inlined at build time, so a dev-only `.env.local` that is not present at `pnpm build` will silently disable capture.

---

### 2.14 Verifying events reach the dev PostHog project

The exact manual check, and exactly what the verifier pastes as evidence:

1. Put the operator-supplied dev project key and host in `apps/organising-db/.env.local` (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`), then `pnpm build && pnpm start`.
2. Confirm the build actually received them: `curl -s localhost:3000/api/posthog/config-check` → expect `{"hasKey":true,"hasHost":true,"keyPrefix":"phc_","hostLooksLikeIngest":true}` (`src/app/api/posthog/config-check/route.ts:30-35`). **Paste this JSON.** If `hasKey` is false the rest of the check is meaningless.
3. In a browser: sign in at `/login`; from `/campaigns` click a campaign row (lands on `?tab=workforce&sub=wall-chart`); click a worker tile; open a unit's **Filter** popover and tick one Role checkbox; if the campaign has more than one unit type, change **Group units by** on the Assessment distribution card; save a rating from a tile's large badge.
4. Open the dev PostHog project → **Activity → Live events** (filter by the signed-in user via the `distinct_id`, which is the Supabase `user.id` set by `auth-context.tsx:305-306`).
5. **Paste as evidence:** a screenshot or copied rows of Live events showing all four names present —
   - `campaign_tab_opened` with `campaign_id`, `tab: "workforce"`, `sub: "wall-chart"`
   - `wallchart_first_interaction` with a plausible `ms_since_login` (tens of seconds), `interaction: "tile_click"`, `login_source: "login_form"`, appearing **exactly once**
   - `wallchart_filter_applied` with `scope: "unit"`, `filter_keys: ["roles"]`, `filter_count: 1`
   - `wallchart_group_selected` with `ou_type` and `group_count` (or a note that the campaign has ≤1 unit type, so `OuTypeSelector.tsx:21` hides the control)
   and, from the property panel of any one of them, confirmation that **no property contains a worker name, phone or email**.
6. Negative check (proves the no-op path): unset both env vars, `pnpm build && pnpm start`, repeat step 3, and confirm the browser makes **no requests to the PostHog host** (DevTools → Network, filter `i.posthog.com`) and the console shows no telemetry error. Paste "0 requests".

Steps 1–5 need the operator's dev project key (open question Q3). Step 6 needs nothing and should be run first.

---

### 2.15 Risks and the rules they could break

| Risk | Rule at stake | Mitigation |
|---|---|---|
| A telemetry call throws inside a wall-chart handler and breaks tile click or drag | "Nothing is removed from the product" | `track()` is `try/catch` with an empty handler, mirroring `phone/telemetry.ts:58-60`; every new call site is a leading statement that cannot alter the handler's return value; `noteFirstInteraction` returns early on a `null` payload |
| The stamp keys are read as "view state in storage" | "Do not keep view state in localStorage" | `sessionStorage` only, both keys `oux:`-prefixed, nothing in the UI reads them; stated as a rule in §2.2 |
| `campaign_tab_opened` double-fires on legacy `?tab=` redirects | metric quality (§8 weekly-return-rate) | the `needsRedirect(...)` guard (same helper as `page.tsx:188`); the effect is keyed on the **resolved** tab/sub |
| `wallchart_first_interaction` fires on every campaign opened in one sitting | §8 metric is per-login | once-per-session flag in `sessionStorage`, decided by the pure `firstInteractionPayload` |
| A stale `oux:login-ts` (tab left open overnight) reports an absurd duration | metric quality | `msSinceLogin` returns `null` beyond `MAX_LOGIN_AGE_MS` (6 h) and for backwards clocks; tested |
| The `onSaved` prop thread changes rating-save behaviour | "Nothing is removed" | optional prop at every hop, called as the first statement of the existing `onSuccess` (`inline-rating-popover.tsx:60, 204`); toast and `setOpen(false)` unchanged |
| Adding `@playwright/test` changes the typecheck surface | `pnpm build` must stay green | `tests/e2e/**` is already inside `tsconfig.json` `include`; `mobile-dialer.spec.ts` compiles today only because of `declare const test: any` (`:23-24`), which §2.8 replaces with a real import — a net improvement, not a regression |
| `pnpm e2e` fails in the operator's hands because Chromium's revision does not match | acceptance | `e2e:install` script + the pin fallback in Q1 |
| Flow one fails on a stripped dev database | acceptance | explicit failure messages naming Q2; the two structural assertions still pass on an empty campaign, so the failure is diagnostic |
| PostHog volume from `campaign_tab_opened` | none, but cost | one event per URL-resolved tab change; appendix D §3.2 counts ~44 surfaces, but a single organiser produces tens of events a day, not thousands. No session recording is enabled (`posthog-client.ts:15`) |
| §2.7's test repair looks like scope creep | "Do not widen scope beyond the work package" | it is a one-line constant change in an existing test, and the WP's own acceptance criterion is "`pnpm test` … pass", which is unreachable without it. Offered for deferral as Q4 |

---

## 3. Out of scope

Things considered and deliberately excluded:

- **PostHog dashboards, insights, funnels or cohorts.** The WP says "events visible in a dev PostHog project"; building the §8 dashboard is the operator's analysis step, not code.
- **Session recording.** Explicitly disabled today (`src/lib/posthog-client.ts:15`) and left disabled.
- **Feature flags via PostHog.** The workspace-mode flag is WP1.1's problem and, per plan §5.2, is `app_settings` / `user_profiles.workspace_prefs`, not PostHog.
- **Autocapture / heatmaps.** Not enabled; the four named events are the contract.
- **Instrumenting the other ~40 campaign surfaces**, the sidebar (`src/components/layout/sidebar.tsx:33-50`), the 12 header-bar actions (appendix D §3.3), or the build-list panel. Tab opens plus wall-chart group/filter/first-interaction is the WP's list.
- **Refactoring `src/lib/phone/telemetry.ts` onto the new module.** It works, it is 21 events wide, and a merge would be a pure-churn diff. The new module copies its shape instead.
- **A `usePostHog()` React hook or a PostHogProvider.** `initPostHogIfNeeded()` + a module-level `track()` is what the codebase already does in 3 places; adding a fourth idiom would be worse.
- **Server-side capture** (`posthog-node`). All four events are user interactions in client components.
- **A GitHub Actions workflow running lint/test/build/e2e.** The WP says not to add one unless one already exists for this app; none does (§2.13).
- **`webServer` in the Playwright config.** Rejected in favour of `E2E_BASE_URL` plus a documented sequence (§2.8).
- **The other four canonical e2e flows** (group selector, drag to Unassigned, three-screen create, SMS link). The verification standard assigns them to the packages that deliver the features; flow one only, here.
- **Rewriting `mobile-dialer.spec.ts`'s assertions** or seeding a dialer token. Two lines change (`declare` → `import`); its logic and its skip guard are untouched.
- **`data-testid` attributes.** None needed (§2.9); adding them would be markup churn for no gain.
- **Any schema change, RLS change or type regeneration.** None is required; `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` is not run.
- **Touching the production project `gteygwfgjvczanmrwgbr`**, including reads. Nothing in this package connects to a database at all except through the operator's own dev-pointed `.env.local`.
- **Renaming "Unallocated"/"No unit" to "Unassigned", tiles-above-charts, or the other phase-0 copy fixes.** Those are WP0.3.

---

## 4. Open questions

**Q1 — Playwright version / Chromium download.** `~/Library/Caches/ms-playwright` holds `chromium-1191 … 1228`; current Playwright (`1.63.0`) wants `chromium-1243`, which is absent. Default assumption: add `"@playwright/test": "^1.63.0"` and run `pnpm exec playwright install chromium` once (~150 MB, shared cache, one-time). **Confirm the download is acceptable**, or say so and the dependency is pinned to `1.56.0`, which maps to the already-present `chromium-1191`. Either choice is a one-line difference in `package.json`.

**Q2 — Dev campaign data for flow one.** DECISIONS.md records that "the current dev seed has campaign data stripped". Flow one needs the e2e account to see, on `/campaigns`, **at least one campaign row**, and that campaign to have **at least one member** (units are not required — 100% Unassigned is fine and is what decision 4's note expects). Choose one:
 (a) the operator seeds/points at a dev campaign with ≥1 member — **the plan's assumption**, spec written as described in §2.9; or
 (b) the content assertion (`[data-worker-id]` or `[data-ou-id="unassigned"]`) is dropped and the spec asserts only the URL, the `"Wall chart"` title and the `"Campaign summary"` heading, with a `TODO(WP2.x)` to restore it. Option (b) still needs one campaign row to click.

**Q3 — Dev PostHog project key and host.** Needed for `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in the verification environment (§2.14). Until supplied, `isPostHogEnabled()` is false and every `track()` call no-ops — the code ships and the negative check (§2.14 step 6) passes, but the "events visible in a dev PostHog project" criterion stays unmet. Please also confirm this key is a **dev/preview** project, not the project that receives production traffic.

**Q4 — The pre-existing `pnpm test` failure.** `src/lib/sms/__tests__/rating-source-taxonomy.test.ts:32` points at a migration that moved to `supabase/migrations_legacy/`, so `pnpm test` fails today. §2.7 fixes it in one line (repoint to `supabase/migrations/20260908050000_baseline_schema.sql`, which carries the same constraint at `:7517`). **Confirm this repair belongs in WP0.2**; if you would rather it landed separately, say so and WP0.2's acceptance is restated as "`pnpm test` shows no *new* failures and the 3 new analytics test files pass".

**Q5 — Test account role.** DECISIONS.md asks for a `user` account "and ideally one `viewer`". Flow one is read-only, so a `viewer` would pass it, but a `user` account is what WP1.6's role coverage will need and what exercises the real organiser path (`canWrite` gates the drag/rating handlers this package instruments — `WC:1240`, `worker-tile.tsx:271`). Assumption: **one `user`-role dev account** for `E2E_USER_EMAIL`. Confirm, or supply both and the config grows a second project later.

## 5. Orchestrator approval

**Approved 2026-09-08.** Answers to section 4:
- **Q1:** Pin `@playwright/test` to the release that maps to a Chromium revision already present in `~/Library/Caches/ms-playwright` (the plan identifies 1.56 → chromium-1191). No browser download. If the pinned release cannot find the cached browser at run time, stop and report rather than downloading.
- **Q2:** Option (a). Keep the content assertion. Flow one cannot pass until the operator seeds a dev campaign with at least one member and supplies the e2e account; record that in the ledger as an operator input rather than weakening the spec.
- **Q3:** Operator input; until supplied, the negative check (no capture when the key is absent) is the evidence and the criterion stays open in the ledger.
- **Q4:** Yes, the one-line repair of `rating-source-taxonomy.test.ts:32` belongs here, pointed at the baseline schema, and is listed as a deviation.
- **Q5:** One `user`-role dev account.
Branch: `feat/oux-wp0.2-instrumentation-e2e`, stacked on the WP0.3 branch if WP0.3 has not merged (both touch `campaigns/[id]/page.tsx` and `campaign-wall-chart.tsx`); PR base `develop`. Everything else stands.

## 6. Deviations from plan

1. **`@playwright/test` pinned to `1.56.1`, not `1.56.0`.** §5 Q1 says pin to the release whose Chromium revision is already cached, and instructed me to check the mapping first. The mapping was read from `browsers.json` files already on disk, not guessed: `1.56.0-alpha-*` → `chromium-1191`, **`1.56.1` → `chromium-1194`**, `1.60.0` → `chromium-1223`, `1.61.1` → `chromium-1228`, `1.63.0` → `chromium-1243`. `1.56.0` final is not present on this machine in any form, so its revision could not be verified without a network fetch; `1.56.1` is the nearest release whose mapping is verifiable from disk. Both `1191` and `1194` are cached, so either would have worked. Nothing was downloaded — see the Implementer notes for the evidence.

2. **`apps/organising-db/.env.example` was updated locally but is not in any commit.** The repo-root `.gitignore:25` rule `.env*` matches it and the file has never been tracked (`git ls-files` does not know it). Committing it would need `git add -f`, i.e. newly tracking a file the repo deliberately ignores — exactly the class of change that leaks a secret if anyone's local copy ever held one. The appended block is reproduced verbatim in the Implementer notes below so it is captured in a tracked file, and the same variables are documented in `tests/e2e/env.ts`. Plan §2.11's other two items (root `.gitignore`, no `turbo.json` change) are unaffected.

3. **`.gitignore` also ignores `apps/organising-db/test-results/` and `playwright-report/`.** Not in the plan, but `playwright test` writes `test-results/.last-run.json` on every run, including the credential-free run the acceptance criterion requires. One extra commit, no behaviour change.

4. **`wallchart_group_selected` uses the hoisted variant, not the state-updater variant.** §2.4 offered both and left the choice to the implementer with a comment. The track call sits above `setSelectedOuType`, using the `effectiveOuType` memo as `previous_ou_type`, so React StrictMode's dev double-invoke of the updater cannot emit the event twice. Commented in place.

5. **`handleOuTypeChange` is declared after the `effectiveOuType` memo, not at `:89` next to the state.** It reads `effectiveOuType`, so it cannot precede it. Still above the component's first early return, so hook order is unconditional.

6. ~~**The `campaign_tab_opened` effect carries an `eslint-disable-next-line react-hooks/exhaustive-deps`.** §2.3's dependency array is `[campaignId, campaignIdValid, activeTab, activeSub]` and deliberately omits `rawTab`/`rawSub`/`resolved`, which is the whole point (keying on the *resolved* pair is what de-duplicates). The lint rule cannot know that, so the suppression is explicit and commented, matching the existing redirect effect four lines above which does the same thing for the same reason.~~ **Superseded by fix round 1, finding 1**: keying on the resolved pair alone, combined with the `needsRedirect` early return, meant the event never fired at all. The effect now depends on the raw params too, de-duplicates with a ref, and the suppression is gone (the deps are complete and the rule is silent — verified by removing `campaignId` and watching it warn).

7. **`applyToAllScopes` spreads the filter for the Unassigned scope too.** §2.5 asked for one shared helper replacing both `onApplyToAll` bodies. The two originals differed by one character: the Unassigned body stored `filter` by reference and the unit body stored `{ ...filter }`. The shared helper uses `{ ...filter }` for every scope. `WallChartFilterState` is flat and the `Set` fields are shared by both forms, so this is behaviour-identical; noting it because it is a real (if invisible) diff.

8. **The plan's predicted test count is out of date.** §2.13 expects `Test Files 53 passed (53)`; the actual figure is **56 passed (56), 730 tests**, because WP0.3 added test files to this branch after the plan was written. The material claim — every file passes, including the repaired taxonomy test — holds.

9. ~~**`e2e:install` was kept as a script but never run.** §5 Q1 forbids a download; the script is only a discoverability aid for a future machine whose cache lacks `chromium-1194`. Nothing in this package invokes it.~~ **Superseded by fix round 1, finding 8**: the script is removed. §5 Q1 forbids a browser download, so shipping a one-command path to `playwright install chromium` is a hazard, not a convenience. §2.8 and §2.13's `pnpm e2e:install` row are plan text and stand as written; the shipped `package.json` has `e2e` only, and a machine whose cache lacks `chromium-1194` should stop and report (Q1's own instruction) rather than download.

10. **`tests/e2e/wall-chart.spec.ts` asserts an Overview round-trip beyond the flow-one steps in §2.9.** After the wall-chart assertions the spec clicks **Overview**, asserts `?tab=overview`, clicks **Workforce** then **Wall Chart / List**, and asserts `?sub=wall-chart` and the card title again (`wall-chart.spec.ts:61-69`). That is not in §2.9's step table; it is a WP0.3 hand-off, orchestrator-instructed, and it is the only automated coverage of the tab-URL contract — vitest cannot reach it, because the contract is between the tab list, `router.replace` and the resolved tab state in a rendered app. Fix round 1 leans on it: it is also what exercises the `campaign_tab_opened` de-duplication end to end (see finding 1 below).

Not deviations, recorded because they were checked: no `data-testid` was added to production markup; no migration was added or edited; no database was contacted; `turbo.json` was not touched; the app was never started.

### Implementer notes

**Playwright pin and cached Chromium.**

- Pinned: `"@playwright/test": "1.56.1"` (exact, no caret) in `apps/organising-db/package.json` devDependencies.
- Maps to **`chromium-1194`**, read from `node_modules/.pnpm/playwright-core@1.56.1/node_modules/playwright-core/browsers.json`.
- Already present: `~/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium` exists, and that is the exact path `playwright-core@1.56.1`'s registry expects on macOS (`lib/server/registry/index.js:81`).
- Installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm add -D --filter organising-db @playwright/test@1.56.1`. `playwright` is not in the root `pnpm.onlyBuiltDependencies` allow-list, so its postinstall was blocked by pnpm as well.
- `pnpm exec playwright install --dry-run chromium` reports every needed browser already resolved in the shared cache — `chromium-1194`, `chromium_headless_shell-1194`, `ffmpeg-1011` — so a real `install` would be a no-op:

  ```
  browser: chromium version 141.0.7390.37
    Install location:    /Users/troyb/Library/Caches/ms-playwright/chromium-1194
  browser: chromium-headless-shell version 141.0.7390.37
    Install location:    /Users/troyb/Library/Caches/ms-playwright/chromium_headless_shell-1194
  browser: ffmpeg
    Install location:    /Users/troyb/Library/Caches/ms-playwright/ffmpeg-1011
  ```

**`pnpm e2e` output** (from `apps/organising-db`, with `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` unset):

```
> organising-db@0.1.0 e2e /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db
> playwright test

Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.

Running 2 tests using 1 worker

  -  1 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  -  2 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart

  2 skipped
```

Exit code 0. Both specs skipped, not failed; the message comes from `global-setup.ts`, which proves the config and the global setup loaded.

**Event → call site** (paths relative to `apps/organising-db/`, line numbers as committed):

| Event | Call site | Trigger |
|---|---|---|
| `campaign_tab_opened` | `src/app/(dashboard)/campaigns/[id]/page.tsx:266` | effect over the raw and resolved `(tab, sub)`, de-duplicated by a ref keyed on `campaignId|tab|sub` (fix round 1; the earlier `needsRedirect` guard was removed because it suppressed every redirected URL) |
| `wallchart_group_selected` | `src/components/campaigns/WallChartAssessmentCharts.tsx:115` | `handleOuTypeChange`, wired to `OuTypeSelector` `onChange` at `:141` |
| `wallchart_filter_applied` | `src/components/campaigns/campaign-wall-chart.tsx:972` | `setFilter` — every per-unit and Unassigned filter/sort change |
| `wallchart_filter_applied` | `src/components/campaigns/campaign-wall-chart.tsx:989` | `applyToAllScopes`, called from both `onApplyToAll` bodies (`:1717`, `:2069`) |
| `wallchart_first_interaction` | `src/components/campaigns/campaign-wall-chart.tsx:962` | `noteFirstInteraction`, the single once-per-tab emitter |
| ↳ `interaction: "filter"` | `campaign-wall-chart.tsx:978`, `:995` | inside `setFilter` and `applyToAllScopes` |
| ↳ `interaction: "tile_click"` | `campaign-wall-chart.tsx:1141` | first statement of the tile `onClick`, before the toggle-select branch |
| ↳ `interaction: "drag"` | `campaign-wall-chart.tsx:1165` | first statement of `onDragStartRefs` |
| ↳ `interaction: "rating"` | `campaign-wall-chart.tsx:1183` → `worker-tile.tsx` `onRatingSaved` → `inline-rating-popover.tsx:64` and `:213` | first line of both popovers' `onSuccess` |
| login stamp `login_form` | `src/app/(auth)/login/page.tsx:77` | immediately before `router.push("/campaigns")` |
| login stamp `session_restored` | `src/lib/supabase/auth-context.tsx:215` | `INITIAL_SESSION` branch, only when a user exists and no stamp does |

**`.env.example` block** (appended locally; see deviation 2 for why it is not committed):

```
# PostHog (analytics). Both must be set or all capture no-ops.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Playwright e2e. DEV PROJECT ONLY (dpnnmkhabysfdogllsyh) — never production.
# With E2E_USER_* unset, the signed-in specs skip instead of failing.
E2E_BASE_URL=http://localhost:3000
E2E_USER_EMAIL=
E2E_USER_PASSWORD=
```

**Gates** (all from `apps/organising-db`):

| Gate | Result |
|---|---|
| `pnpm exec eslint <19 touched files>` | exit 0, no output |
| `pnpm test` | `Test Files 56 passed (56)` / `Tests 730 passed (730)` |
| `pnpm build` | `✓ Compiled successfully in 2.4min` |
| `pnpm exec tsc --noEmit -p tsconfig.json` | exit 0, no output (Playwright types resolve) |
| `pnpm e2e` (no credentials) | exit 0, `2 skipped` |

**Still open, and not achievable here:** §2.14 (events visible in a dev PostHog project) needs the operator's dev key (Q3), and flow one cannot actually run until the operator supplies the `user`-role dev account (Q5) and a dev campaign with at least one member (Q2). Both are operator inputs recorded in the ledger, not code gaps. The negative check — no PostHog requests when the key is absent — is what the code guarantees structurally: `track()` returns before touching `posthog` whenever `isPostHogEnabled()` is false.

**Commits on `feat/oux-wp0.2-instrumentation-e2e`:**

| SHA | Message |
|---|---|
| `b1da117` | `feat(oux-wp0.2): typed organiser-UX analytics module and pure timing logic` |
| `9b70c86` | `feat(oux-wp0.2): emit the four organiser-UX events at their call sites` |
| `2ed7579` | `fix(oux-wp0.2): point the SMS taxonomy test at the baseline schema` |
| `78ecd73` | `feat(oux-wp0.2): Playwright harness and canonical flow one` |
| `077b02b` | `chore(oux-wp0.2): ignore Playwright run artefacts` |

### Fix round 1

Reviewer findings applied on `feat/oux-wp0.2-instrumentation-e2e`. Each was verified against the file before editing.

**Blocking**

1. **`campaign_tab_opened` never fired.** `src/app/(dashboard)/campaigns/[id]/page.tsx` — the effect was keyed on the *resolved* `(tab, sub)` and returned early while `needsRedirect(rawTab, rawSub, resolved)` was true, on the theory that "the redirect will re-run this". It cannot: the redirect rewrites the raw params to the values the resolver already produced, so the resolved pair is unchanged and an effect keyed on it does not re-run. The result was silence for a bare `/campaigns/{id}`, for every legacy `?tab=`, and for every cluster-tab click (`handleTabChange` deletes `sub`, which always forces a redirect) — i.e. for the deep-link case §2.3 was written to capture. Fixed by depending on the raw params as well, dropping the `needsRedirect` skip, and de-duplicating with a `useRef<string | null>` holding the last emitted key. The suppression is gone: the deps are complete, and `react-hooks/exhaustive-deps` (enabled at `warn`, confirmed by deleting `campaignId` from the array and watching it warn) reports nothing.
   - New pure helper `tabOpenKey(campaignId, tab, sub)` in `src/lib/analytics/events.ts`, normalising `null`/`undefined` sub, with a test in `src/lib/analytics/__tests__/events.test.ts`. The **de-duplication itself is component logic and is not covered by vitest** — there is no React testing harness in this app for this page. The e2e Overview round-trip (deviation 10, `tests/e2e/wall-chart.spec.ts:61-69`) walks the same redirect-then-click sequence but asserts only URLs and titles; it does not observe emits, so the de-dup rests on the hand trace below and on `tabOpenKey`'s tests.

   **Hand trace** (bare `/campaigns/{id}`, campaign 12; `→` is a render):

   | # | Trigger | `rawTab`/`rawSub` | resolved `(tab, sub)` | key | ref before | emit? |
   |---|---|---|---|---|---|---|
   | 1 | first paint | `null` / `null` | `workforce` / `wall-chart` | `12\|workforce\|wall-chart` | `null` | **yes** |
   | 2 | redirect `router.replace(?tab=workforce&sub=wall-chart)` | `workforce` / `wall-chart` | `workforce` / `wall-chart` | same | same | no (ref hit) |
   | 3 | click **Overview** (`handleTabChange` sets `tab`, deletes `sub`) | `overview` / `null` | `overview` / `null` | `12\|overview\|` | `12\|workforce\|wall-chart` | **yes** |
   | 4 | click **Workforce** (sets `tab`, deletes `sub`) | `workforce` / `null` | `workforce` / `wall-chart` | `12\|workforce\|wall-chart` | `12\|overview\|` | **yes** |
   | 5 | redirect adds `sub=wall-chart` | `workforce` / `wall-chart` | `workforce` / `wall-chart` | same | same | no (ref hit) |

   Rows 1 and 4 are the two the old code emitted nothing for. Row 2 and row 5 are why the ref is needed once the `needsRedirect` skip is gone. Because the ref lives on the fiber, it also absorbs React StrictMode's dev double-invoke.

2. **The taxonomy test's slices were unbounded.** `src/lib/sms/__tests__/rating-source-taxonomy.test.ts` sliced `migration.slice(indexOf(needle))` against the 33k-line baseline dump, so each `toContain` searched to end of file and passed on a value declared anywhere later. Fixed with a local `declaration(text, start, terminators)` helper: the CHECK is bounded by the next `CONSTRAINT` or `;`, `fn_sms_to_rating` is anchored on `CREATE OR REPLACE FUNCTION "public"."fn_sms_to_rating"` (the schema-qualified quoted name the dump actually writes — the old anchor `CREATE OR REPLACE FUNCTION` matched the *first* of ~500 functions in the file, `apply_call_outcome_side_effects` at `:96`) and bounded by the closing `$$;`, and the `v_source := CASE` branch by `END;`. The legacy-values test now asserts against the bounded CHECK rather than the whole file. A new `it("bounds each slice to the declaration it asserts on")` guards the guard.

   **Failing-test proof.** In a scratch copy (backed up, mutated, restored; `git status` clean afterwards and the baseline byte-identical), `'sms_chat'::character varying, ` was deleted from line 7517 of `supabase/migrations/20260908050000_baseline_schema.sql`:

   ```
   × SMS rating source taxonomy > allows sms_chat in the campaign_activity_ratings source CHECK
     → expected 'campaign_activity_ratings_source_chec…' to contain '\'sms_chat\''
   Test Files  1 failed (1)
        Tests  1 failed | 9 passed (10)
   ```

   The same mutation would **not** have failed the old assertion: `'sms_chat'` still occurs at `:7527` (the `COMMENT ON COLUMN` for `source`), `:16363` and `:16535` (views), all *after* the anchor, so the unbounded slice still contained it. Restored, the file passes `10 passed (10)`.

**Advisory**

5. `src/components/campaigns/wall-chart/inline-rating-popover.tsx:63-69` and `:217-223` — `onSaved?.()` is now wrapped in `try {} catch {}` in both popovers, so a throwing callback cannot skip `setOpen(false)` and leave the popover open. This is what the prop's JSDoc ("Additive; never gates the save") already claimed.

7. `src/lib/analytics/__tests__/events.test.ts` — the `it("also holds for the surface property added by track()")` case asserted `FORBIDDEN.test("surface") === false`, which tests a regex literal against a string literal and nothing in `events.ts`. Removed; a comment in its place records why the block asserts only over real builder payloads.

8. `apps/organising-db/package.json` — `e2e:install` removed (see deviation 9, rewritten).

**Notes recorded rather than changed**

- **Deviation 10** (added above) declares the Overview round-trip assertion in `tests/e2e/wall-chart.spec.ts`.
- **The first-interaction flag is not cleared on sign-out.** `markFirstInteractionFired()` writes `oux:wallchart-first-interaction` to `sessionStorage` and nothing removes it, so a second sign-in in the same tab is not measured. Accepted as the stated semantics — "once per browser session", not "once per login". The `login_source` prop already separates a fresh `login_form` t0 from a `session_restored` one, and the §8 metric wants one number per sitting; adding a clear-on-sign-out would mean the analytics module reaching into the auth teardown path, which is a wider change than this package's remit. If WP1.x wants per-login measurement, the flag should be cleared where the Supabase `SIGNED_OUT` event is handled and this note retired.
- **`apps/organising-db/.env.example` is untracked by repo policy.** The repo-root `.gitignore:25` rule `.env*` matches it, so it is not in any commit (deviation 2). The block appended locally is reproduced verbatim in the Implementer notes above, and the same variable names are documented in code at `apps/organising-db/tests/e2e/env.ts` (`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`) and `apps/organising-db/playwright.config.ts` (`E2E_BASE_URL`), which are tracked.

**Gates after fix round 1** (from `apps/organising-db`):

| Gate | Result |
|---|---|
| `pnpm exec eslint` on the 5 touched source files | exit 0, no output |
| `pnpm test` | `Test Files 56 passed (56)` / `Tests 732 passed (732)` |
| `pnpm exec tsc --noEmit -p tsconfig.json` | exit 0 |
| `pnpm build` | compiled successfully, route table printed |
| `env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD pnpm e2e` | exit 0, `2 skipped` |

No browser was downloaded, no database was contacted, the app was never started, and `supabase/migrations/` is byte-identical to before the fix round.

## 7. Verification output

Verifier run 2026-09-08 at 5856996. Flow one not executed: no credentials (operator input); events not observed in PostHog: no dev key (operator input).

### 1. `pnpm lint` (develop baseline: "294 problems (143 errors, 151 warnings)")

```
$ pnpm lint 2>&1 | tail -6
  24:7  warning  'KNOWN_ACRONYMS' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
```

### 2. `pnpm test`

```
$ pnpm test 2>&1 | /usr/bin/grep -E 'Test Files|Tests |FAIL'
 Test Files  56 passed (56)
      Tests  730 passed (730)
```

### 3. `pnpm exec tsc --noEmit -p tsconfig.json`

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo "tsc exit $?"
tsc exit 0
```

### 4. `pnpm build`

```
$ pnpm build 2>&1 | tail -6
ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

### 5. `pnpm e2e` (no credentials)

```
$ env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD pnpm e2e 2>&1 | tail -15; echo "e2e exit $?"

> organising-db@0.1.0 e2e /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db
> playwright test

Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.

Running 2 tests using 1 worker

  -  1 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  -  2 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart

  2 skipped
e2e exit 0
```

No browser download was attempted.

### 6. Diff scope vs `feat/oux-wp0.3-defaults-copy-layout`

```
$ git diff --stat feat/oux-wp0.3-defaults-copy-layout..HEAD
 .gitignore                                         |   7 +
 apps/organising-db/package.json                    |   5 +-
 apps/organising-db/playwright.config.ts            |  34 +
 apps/organising-db/src/app/(auth)/login/page.tsx   |   5 +
 .../src/app/(dashboard)/campaigns/[id]/page.tsx    |  16 +
 .../campaigns/WallChartAssessmentCharts.tsx        |  29 +-
 .../components/campaigns/campaign-wall-chart.tsx   |  85 ++-
 .../campaigns/wall-chart/__tests__/filters.test.ts | 121 ++++
 .../src/components/campaigns/wall-chart/filters.ts |  34 +
 .../campaigns/wall-chart/inline-rating-popover.tsx |  10 +
 .../campaigns/wall-chart/worker-tile.tsx           |   8 +
 .../src/lib/analytics/__tests__/events.test.ts     | 159 +++++
 .../lib/analytics/__tests__/session-timing.test.ts | 147 +++++
 apps/organising-db/src/lib/analytics/events.ts     | 214 +++++++
 .../src/lib/analytics/session-timing.ts            | 124 ++++
 .../sms/__tests__/rating-source-taxonomy.test.ts   |   5 +-
 .../src/lib/supabase/auth-context.tsx              |   9 +
 apps/organising-db/tests/e2e/env.ts                |  14 +
 apps/organising-db/tests/e2e/global-setup.ts       |  54 ++
 apps/organising-db/tests/e2e/mobile-dialer.spec.ts |  10 +-
 apps/organising-db/tests/e2e/wall-chart.spec.ts    |  71 +++
 docs/organiser-ux-review/PROGRESS.md               |   2 +-
 docs/organiser-ux-review/wp/wp0.2.md               | 710 +++++++++++++++++++++
 pnpm-lock.yaml                                     |  49 +-
 24 files changed, 1892 insertions(+), 30 deletions(-)
```

```
$ git diff --name-only feat/oux-wp0.3-defaults-copy-layout..HEAD | /usr/bin/grep -v -E '^apps/organising-db/(src|tests)/|^docs/organiser-ux-review/|^apps/organising-db/(package.json|playwright.config.ts)$|^pnpm-lock.yaml$|^\.gitignore$' || echo "no unexpected files"
no unexpected files
```

```
$ git log --oneline feat/oux-wp0.3-defaults-copy-layout..HEAD
5856996 docs(oux-wp0.2): record deviations and implementer notes
077b02b chore(oux-wp0.2): ignore Playwright run artefacts
78ecd73 feat(oux-wp0.2): Playwright harness and canonical flow one
2ed7579 fix(oux-wp0.2): point the SMS taxonomy test at the baseline schema
9b70c86 feat(oux-wp0.2): emit the four organiser-UX events at their call sites
b1da117 feat(oux-wp0.2): typed organiser-UX analytics module and pure timing logic
c61c3b4 docs(oux): WP0.2 plan, approved
```

### 7. Privacy grep on `apps/organising-db/src/lib/analytics/*.ts`

```
$ /usr/bin/grep -rn -i -E 'name|email|phone|address|note' apps/organising-db/src/lib/analytics/*.ts
apps/organising-db/src/lib/analytics/events.ts:4: * One event-name union, one `track()`, and one typed wrapper per event, so the
apps/organising-db/src/lib/analytics/events.ts:7: * The shape deliberately mirrors `src/lib/phone/telemetry.ts` so there is one
apps/organising-db/src/lib/analytics/events.ts:15: * No event property may carry a worker's name, phone number, email address,
apps/organising-db/src/lib/analytics/events.ts:16: * address, notes, or any free text a worker or organiser typed. Every property
apps/organising-db/src/lib/analytics/events.ts:20: * filter *key names* ("occupations") and a count, never the selected occupation
apps/organising-db/src/lib/analytics/events.ts:40: * Allowed property value shapes. Widened from `phone/telemetry.ts` by
apps/organising-db/src/lib/analytics/events.ts:41: * `string[]` only, for `filter_keys` (a list of closed-union key names).
apps/organising-db/src/lib/analytics/events.ts:155:  /** Closed-union dimension names only — never the selected ids. */
apps/organising-db/src/lib/analytics/session-timing.ts:5: * named campaign". That needs a t0 recorded at sign-in and a once-per-session
```

### 8. New `localStorage` usage in `src`

```
$ git diff feat/oux-wp0.3-defaults-copy-layout..HEAD -- apps/organising-db/src | /usr/bin/grep -n '^+.*localStorage' || echo "no localStorage added"
1095:+ * localStorage". Both keys here are written to `sessionStorage`, not
1096:+ * `localStorage`, and neither is view state: one is a per-tab timing stamp and
```

### 9. `pnpm-lock.yaml` playwright entries

```
$ /usr/bin/grep -n "playwright" pnpm-lock.yaml | head -8
13:        version: 10.47.0(@opentelemetry/context-async-hooks@2.6.1(@opentelemetry/api@1.9.1))(@opentelemetry/core@2.6.1(@opentelemetry/api@1.9.1))(@opentelemetry/sdk-trace-base@2.6.1(@opentelemetry/api@1.9.1))(next@16.1.6(@babel/core@7.29.0)(@opentelemetry/api@1.9.1)(@playwright/test@1.56.1)(react-dom@19.2.3(react@19.2.3))(react@19.2.3))(react@19.2.3)(webpack@5.105.4)
172:        version: 16.1.6(@babel/core@7.29.0)(@opentelemetry/api@1.9.1)(@playwright/test@1.56.1)(react-dom@19.2.3(react@19.2.3))(react@19.2.3)
222:      '@playwright/test':
1570:  '@playwright/test@1.56.1':
4536:      '@playwright/test': ^1.51.1
4544:      '@playwright/test':
4720:  playwright-core@1.56.1:
4725:  playwright@1.56.1:
```

### Verifier run 2 (after fix round 1) at 923c901

```
$ pnpm lint 2>&1 | tail -3
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
```

```
$ pnpm test 2>&1 | /usr/bin/grep -E 'Test Files|Tests |FAIL'
 Test Files  56 passed (56)
      Tests  732 passed (732)
```

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo "tsc exit $?"
tsc exit 0
```

```
$ pnpm build 2>&1 | tail -6
├ ƒ /workers
├ ƒ /workers/[id]
├ ƒ /workload
├ ƒ /worksites
└ ƒ /worksites/[id]


ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand
```

```
$ env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD pnpm e2e 2>&1 | tail -8; echo "e2e exit $?"
Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.

Running 2 tests using 1 worker

  -  1 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  -  2 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart

  2 skipped
e2e exit 0
```

```
$ git diff --stat dce0691..HEAD
 apps/organising-db/package.json                    |  3 +-
 .../src/app/(dashboard)/campaigns/[id]/page.tsx    | 31 ++++++----
 .../campaigns/wall-chart/inline-rating-popover.tsx | 18 ++++--
 .../src/lib/analytics/__tests__/events.test.ts     | 30 +++++++++-
 apps/organising-db/src/lib/analytics/events.ts     | 19 +++++++
 .../sms/__tests__/rating-source-taxonomy.test.ts   | 64 ++++++++++++++++++---
 docs/organiser-ux-review/wp/wp0.2.md               | 66 +++++++++++++++++++++-
 7 files changed, 201 insertions(+), 30 deletions(-)
```

```
$ git log --oneline dce0691..HEAD
923c901 fix(oux-wp0.2): record fix round 1 in the work package
648ec7a fix(oux-wp0.2): make campaign_tab_opened fire and bound the taxonomy slices
```

```
$ git status --short
```



## 8. Reviewer findings

**Round 1 (2026-09-08, fresh reviewer): BLOCK.** Blocking: (1) the `campaign_tab_opened` effect keyed on the resolved tab and skipped on `needsRedirect`, so after the URL redirect its deps were unchanged and it never emitted for bare campaign URLs, legacy tabs, or any cluster-tab click; (2) the repointed taxonomy test sliced to end-of-file in the baseline dump, making three assertions vacuous. Advisories: `onSaved` placement before toast/close, a regex-only test assertion, the retained `e2e:install` script, undeclared Overview round-trip deviation, sign-out flag gap, untracked `.env.example`. Fixed in `648ec7a`, recorded in `923c901`.

**Round 2 (2026-09-08, fresh reviewer): APPROVE WITH ADVISORIES.** Both blocking findings independently proven closed: own hand trace of six navigation cases (one emit each, none doubled, invalid ids never emit); the constraint slice bounded to 702 characters and the function slice to 1,077, with a 9-of-9 mutation matrix failing the bounded test where 8 of 9 would have passed the old one. Advisories applied by the orchestrator: the event table row and de-dup coverage wording corrected in §6; §7 now carries verifier run 2 at HEAD; stale popover line refs noted. Two pre-existing observations recorded for later phases: tab writes use `router.replace`, so back/forward between tabs never re-enters a tab in place (metric caveat for WP1.x); `Number.isFinite(Number(id))` accepts non-integer strings (low impact).

### Flow one executed against the dev preview (orchestrator, 2026-09-08)

Run from `apps/organising-db` with `E2E_BASE_URL` set to the Vercel Preview of `feat/oux-wp0.4-data-hygiene` (phase-0 tip, contains this package) and the operator-supplied `E2E_USER_*` variables sourced from the shell profile (never printed). Dev campaign 1 was reassigned to the e2e account beforehand (recorded in PROGRESS.md). First attempt failed because the organiser filter showed zero campaigns and the table's only row was the "No results found." placeholder; after the reassignment:

```


Running 2 tests using 1 worker

  -  1 [chromium] › tests/e2e/mobile-dialer.spec.ts:30:7 › Mobile dialer — happy path › volunteer can sign in, claim, dial, record outcome, advance
  ✓  2 [chromium] › tests/e2e/wall-chart.spec.ts:23:7 › Wall chart — flow one › open a campaign from /campaigns and see the wall chart (14.1s)

  1 skipped
  1 passed (19.9s)
```

The "events visible in a dev PostHog project" criterion remains deferred (no dev PostHog project).
