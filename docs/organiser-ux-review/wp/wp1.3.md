# WP1.3 — My campaigns home

Planner output. Branch: `feat/oux-wp1.1-workspace-mode` (WP1.1's registry, resolver and
`useWorkspace()` are already on it — `src/lib/workspace/*`, commits `e5997f9`…`d61cb8d`).
Live schema: `supabase/migrations/20260908050000_baseline_schema.sql` **plus**
`supabase/migrations/20260909100000_workspace_mode.sql`. Everything under
`supabase/migrations_legacy/` is audit-only.

All app paths below are relative to `apps/organising-db/`.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP1.3 My campaigns home.** Standard implementer. Cards from `campaign_organisers`
> (appendix D 6), the lead's team row from `reports_to`, needs-attention items from the
> pending-review, role-check and resume-banner sources, one New campaign button;
> single-campaign organisers land on their chart. Acceptance: e2e flow one passes from a
> `user` account in under ten seconds; the strip of wizard links is gone from `/campaigns`.
> Depends on WP1.1, WP0.4 backfill.

### 1.2 Decisions consumed

From `docs/organiser-ux-review/DECISIONS.md` "Answers":

- **Decision 1 — Confirmed** (`DECISIONS.md:35`). Organiser mode is the module table of plan
  5.2 as written. Consumed here as the landing rule only: plan 5.2 (`:206` row "Landing page")
  says organiser mode lands on My campaigns and "an organiser with exactly one campaign lands
  on its wall chart"; full mode is unchanged. Nothing in this package reads
  `enabledModules` — the My campaigns page is not itself a module.
- **Decision 7 — Amended** (`DECISIONS.md:41`). "**No creation path is retired.** Visibility and
  prominence are reduced instead." This overrides the acceptance phrase "the strip of wizard
  links is gone from `/campaigns`": the strip is **demoted by WP1.5**, not deleted, and
  **this package changes nothing on `/campaigns`'s strip** (see §2.8). Create campaign,
  Actions and Import lists remain there. The one **New campaign** button on My campaigns
  opens the **existing** create dialog (`src/app/(dashboard)/campaigns/page.tsx:309-356`) —
  no new creation path is introduced.
- **Decision 8 — Confirmed, with a note** (`DECISIONS.md:43`). "A `user`-role organiser must be
  able to create campaigns and actions with themselves assigned." Consumed as: the New
  campaign button is gated on `canWrite` only (`auth-context.tsx:385` — `admin` **or**
  `user`), never on `isAdmin`, and it routes to the same two destinations as today
  (`/campaigns/new`, `/campaigns/new/manual`), which already set `created_by`.
- **Decision 2 — Confirmed** (`DECISIONS.md:36`) is consumed indirectly: the lead row is keyed
  off `user_profiles.work_role = 'lead_organiser'` until WP1.6 supplies `isLeadOrganiser`.

### 1.3 Source sections read

- `docs/ORGANISER_UX_REVIEW_AND_PLAN.md:236-244` (5.3 the whole My campaigns spec),
  `:202-235` (5.2 organiser mode, landing-page row), `:245-272` (5.4, for the wall-chart
  target and what is *not* in this package), `:122-134` (3.6 terminology).
- `docs/organiser-ux-review/appendix-D-navigation-roles.md:104-112` (2.1 redirect chain),
  `:113-125` (2.2 what `/campaigns` computes), `:126-140` (2.3 `/dashboard`),
  `:151-169` (3.2 Pending review / Role check rows), `:170-194` (3.3 header bar and the three
  resume banners), `:299-310` (6 campaign scoping), `:362-375` (10 items 6 and 8).
- Baseline: `campaign_organisers` `:9470-9478`; `campaigns` `:9651-9683`; `user_profiles`
  `:9887-9899`; `campaign_worker_membership` `:7698-7704`; `campaign_worker_ou` `:9636-9645`;
  `campaign_organising_units` `:9500-9525`; `campaign_leader_worker_links` `:9435-9444`;
  `campaign_worker_rating_summary` `:10699-10763`; `campaign_activity_ratings` `:7502-7521`;
  `campaign_activities` `:8869-8891`; `call_attempts` `:8135-8158`; `call_list_items`
  `:8187-8210`; `call_lists` `:8219-8235`; `sms_conversations` `:14120-14141`;
  `campaign_worker_lists` `:10567-10592`; `campaign_prospective_workers` `:9950,9957`;
  `phone_call_actions` `:12868-12884`; `campaign_comms_drafts` (policies `:26965`).
- RLS relevant to every read below: `campaign_organisers_read_all` (`baseline:28286`),
  `Authenticated read campaign_worker_lists` (`:26737`), `Authenticated read
  phone_call_actions` (`:26797`), `Authenticated users can read campaign_comms_drafts`
  (`:26965`), `Authenticated users can read campaign_prospective_workers` (`:26993`). All
  SELECTs this package makes are already read-all for `authenticated`; **no RLS policy is
  touched.**

---

## 2. Plan

### 2.0 What is built, in one paragraph

A new client route `/my-campaigns` renders one card per campaign the signed-in organiser is on,
a compact second row for a lead's team, a Needs-attention list, and one New campaign button.
A new neutral landing gate at `/` decides — after the profile is known — whether to send the
user to `/campaigns` (full mode, unchanged) or `/my-campaigns` (organiser mode), and My
campaigns auto-opens the wall chart when the user arrived from the gate and has exactly one
campaign. Every number on a card comes from the **existing** `useCampaignsAllStats` hook,
extended with an optional campaign-id filter; "last activity" comes from one new read-only
SQL function. All decision logic is pure and tested under vitest; the React components hold
no logic worth testing in `environment: "node"` (`vitest.config.ts:19-21`).

---

### 2.1 Route and landing

#### 2.1.1 Where the redirect lives today

| # | Site | Current | Change |
|---|---|---|---|
| 1 | `src/app/page.tsx:3-5` | server component, `redirect("/campaigns")` | **becomes the client landing gate** (below) |
| 2 | `src/app/(auth)/login/page.tsx:78` | `router.push("/campaigns")` after `stampLogin("login_form")` (`:77`) | `router.push("/")` |
| 3 | `src/lib/supabase/middleware.ts:71-75` | signed-in user on `/login` → `url.pathname = "/campaigns"` | `url.pathname = "/"` |
| 4 | `src/app/auth/set-password/page.tsx:49` | `router.push("/campaigns")` | `router.push("/")` |

`middleware.ts:50-69` already sends an unauthenticated request for `/` to `/login` (`/` matches
none of the public prefixes), so the gate never renders for a signed-out visitor.

#### 2.1.2 Why the gate is a route and not a redirect inside `/campaigns`

Mode is only knowable **client-side, after the profile loads**: `resolveWorkspace()` needs
`profile.work_role`, `profile.workspace_prefs` and the `get_workspace_defaults()` RPC
(`src/lib/workspace/use-workspace.tsx:60-70`). The three alternatives and why they lose:

- *Redirect inside `/campaigns`* — an organiser sees the Campaigns h1, tab bar, stat cards and
  DataTable skeleton before being replaced, and the four org-wide stats queries
  (`useCampaignsAllStats`, unfiltered) fire and are thrown away.
- *Point the redirects at `/my-campaigns` and bounce full-mode users back* — inverts the
  flicker onto admins and breaks "full mode unchanged".
- *Decide in middleware* — correct, but costs `get_workspace_defaults()` plus a
  `user_profiles` read on **every** navigation through `middleware.ts`, for a decision that
  matters once per session.

**Chosen: a neutral gate at `/`.** It is outside the `(dashboard)` route group, so it renders
no sidebar, no header and no dashboard chrome — nothing that could be the *wrong* page. It
issues no data query of its own; it consumes the auth/profile fetch `AuthProvider` performs
anyway. `Providers` (with `AuthProvider` and `WorkspaceProvider`) is mounted in the **root**
layout (`src/app/layout.tsx:42`, `src/components/providers.tsx:482`), so `useWorkspace()`
works at `/`.

**What happens on first paint:** a centred spinner and the line "Loading your workspace…",
inside the root layout only. It is replaced by a client-side `router.replace()` — not a new
document load — as soon as `useWorkspace().loading` is false. For a full-mode user the extra
step costs one client navigation and no extra request (`/campaigns`'s own queries are
`enabled: !!user` — `campaigns/page.tsx:155` — so they could not have started sooner anyway).

#### 2.1.3 New file — `src/app/page.tsx` (rewritten)

```tsx
"use client";
// Neutral landing gate (WP1.3). Renders no product surface, issues no query.
```

- reads `useWorkspace()` → `{ mode, loading }`;
- when `loading` is false, `router.replace(landingPathFor({ mode }))`;
- **failsafe**: a 5 000 ms `setTimeout` that replaces with `/campaigns` if the profile never
  resolves, so a broken profile fetch degrades to today's behaviour rather than a stuck
  spinner. (`useWorkspaceDefaults` is `enabled: !!user` with `retry: 1` —
  `useWorkspaceDefaults.ts:33-35` — and react-query v5 reports a disabled query as
  `isLoading: false`, so the timer is belt-and-braces, not the main path.)

#### 2.1.4 New pure module — `src/lib/workspace/landing.ts` (+ `__tests__/landing.test.ts`)

```ts
export const MY_CAMPAIGNS_PATH = "/my-campaigns";
export const FULL_MODE_LANDING_PATH = "/campaigns";
export const LANDING_PARAM = "from";            // ?from=landing
export const LANDING_PARAM_VALUE = "landing";

export function landingPathFor(input: { mode: WorkspaceMode }): string;
export function campaignChartHref(campaignId: number): string;
export function shouldAutoOpenSingleCampaign(input: {
  fromLanding: boolean;
  campaignIds: readonly number[];
}): number | null;
```

Rules (each is a numbered test case):

- **L1** `mode === "full"` → `/campaigns`. Full mode is byte-for-byte unchanged.
- **L2** `mode === "organiser"` → `/my-campaigns?from=landing`.
- **L3** `campaignChartHref(id)` → `` `/campaigns/${id}?tab=workforce&sub=wall-chart` ``.
  This is the string `campaigns/page.tsx:424` and `:445` already use. A bare `/campaigns/{id}`
  would also open the chart today (`src/lib/campaign-tabs.ts:104-106`,
  `DEFAULT_CAMPAIGN_TAB = "workforce"` / `DEFAULT_CAMPAIGN_SUB = "wall-chart"`, set by WP0.3),
  but the explicit form keeps one URL contract for the e2e assertion and survives WP1.4
  renaming the tab.
- **L4** `shouldAutoOpenSingleCampaign` returns the id only when `fromLanding === true` **and**
  `campaignIds.length === 1`; otherwise `null`.

**Why `?from=landing`.** The single-campaign rule is a landing rule, not a page rule. Without
the flag, an organiser with one campaign who clicks **My campaigns** in the sidebar is bounced
straight back to the chart and can never see the page — a trap. With it, the auto-open fires
only on the post-login hop, and the sidebar link (`/my-campaigns`, no param) always shows the
page. The param is read once and the page then `router.replace`s it away, so a refresh does
not re-fire it.

#### 2.1.5 Sidebar reachability

Plan 5.2 (`:206`) puts **My campaigns** first in the organiser sidebar; WP1.2 owns the module
-driven nav. This package adds the minimum that makes "reachable back to My campaigns via the
sidebar" true, marked in a comment as WP1.2's to absorb:

- `src/components/layout/sidebar.tsx:33-44` — keep `navItems` exactly as it is; add
  `export const myCampaignsNavItem = { href: "/my-campaigns", label: "My campaigns", icon: Home }`
  (`Home` is not yet imported at `:8-26`; `Megaphone` is already taken by Campaigns at `:34`).
- `sidebar.tsx:53` — `allNavHrefs` gains `/my-campaigns` so `isNavItemActive`
  (`src/lib/nav/active-nav.ts`, used at `sidebar.tsx:116`) resolves the new href.
- `sidebar.tsx:115` and `src/components/layout/mobile-nav.tsx:79` — render
  `mode === "organiser" ? [myCampaignsNavItem, ...navItems] : navItems`, where `mode` is
  `useWorkspace().mode`. **Full mode sees no new item.**
- `src/components/layout/header.tsx:22` — add `"/my-campaigns": "My campaigns"` to
  `pageTitles` (the map is keyed on the first path segment, `header.tsx:62-63`). The page
  therefore renders **no `<h1>` of its own** — `/campaigns` still duplicates its title
  (`campaigns/page.tsx:359`) and appendix D 9 item 5 lists that as a defect; the new page does
  not repeat it.

---

### 2.2 The "My campaigns" query

**Source of truth** (appendix D `:301-302`): `campaign_organisers` rows for my
`profile.organiser_id`, **union** campaigns whose `campaigns.organiser_id` is mine. The second
arm is belt and braces: WP0.4 script 02 backfills `campaign_organisers` from
`campaigns.organiser_id` and has run on dev (5 rows inserted, PROGRESS.md human-tasks row) but
not yet on production.

**One RPC or a client query?** A client query. `campaign_organisers` SELECT is
`auth.uid() IS NOT NULL` (`baseline:28286`) and `campaigns` SELECT is equally open, so a
PostgREST read needs no new server surface, no migration and no `SECURITY DEFINER`. Appendix D
10 item 6 (`:368`) proposes a shared `my_campaigns` RPC for the list page, dashboard widgets
**and** inbox pickers; that is a wider refactor than this package and is listed out of scope
(§3). The pure grouper below is the seam a later RPC can slot behind.

**Round trips** (`src/lib/hooks/useMyCampaigns.ts`, new):

| # | When | Query | Columns |
|---|---|---|---|
| Q0 | lead only | `user_profiles` `.eq("reports_to", user.id)` `.not("organiser_id","is",null)` | `user_id, organiser_id, display_name` |
| Q1 | always | `campaign_organisers` `.in("organiser_id", [myOrganiserId, ...reportOrganiserIds])` | `campaign_id, organiser_id, campaign_role` (`baseline:9470-9478`) |
| Q2 | always, after Q1 | `campaigns` `.or("organiser_id.in.(…),campaign_id.in.(…)")`, wrapped in `excludeSmsEpisodes()` | see below |

Q2's `select`: `campaign_id, name, campaign_type, status, is_standing, is_sms_episode,
start_date, end_date, total_worker_estimate, organiser_id, created_at, archived_at`
(`baseline:9651-9683`). `excludeSmsEpisodes` (`src/lib/campaign/visible-campaigns.ts:12-17`)
adds `.eq("is_sms_episode", false)` — the same shared filter `/campaigns` uses at
`campaigns/page.tsx:143`.

Two round trips for a plain organiser, three for a lead. Q2 is dependent on Q1 (`enabled:
q1.isSuccess`), which is why it is sequential; both are `staleTime: 60_000` to match the
existing stats queries (`useCampaignsAllStats.ts:111`).

**`isLeadOrganiser` until WP1.6.** `src/lib/campaign/lead-role.ts` (new, pure):

```ts
export const LEAD_WORK_ROLES = ["lead_organiser"] as const;
export function isLeadWorkRole(workRole: WorkRole | null): boolean;
```

`lead_organiser` only — the same predicate `useLeadOrganisers` uses
(`src/lib/hooks/usePlannerOptions.ts:152`, `.eq('work_role','lead_organiser')`) and the role
decision 2 names as the lead. `coordinator` and `industrial_coordinator` are deliberately
excluded (open question Q2, §4). One file, one export, so WP1.6 replaces it in one place.

#### 2.2.1 Pure grouper — `src/lib/campaign/my-campaigns.ts` (+ `__tests__/my-campaigns.test.ts`)

```ts
export interface MyCampaignRow {
  campaign_id: number; name: string; campaign_type: CampaignType; status: CampaignStatus;
  is_standing: boolean; is_sms_episode: boolean; start_date: string | null;
  end_date: string | null; total_worker_estimate: number | null;
  organiser_id: number | null; created_at: string; archived_at: string | null;
}
export interface MyCampaignsInput {
  campaigns: readonly MyCampaignRow[];
  rosterRows: readonly { campaign_id: number; organiser_id: number; campaign_role: string }[];
  myOrganiserId: number | null;
  reportOrganiserIds: readonly number[];
}
export interface GroupedMyCampaigns {
  mine: MyCampaign[];            // MyCampaignRow + myCampaignRole: string | null
  team: MyCampaign[];            // + teamOrganiserIds: number[]
}
export function groupMyCampaigns(input: MyCampaignsInput): GroupedMyCampaigns;
```

Rules (numbered test cases):

- **G1** A campaign is **mine** when a roster row has `organiser_id === myOrganiserId`, **or**
  `campaigns.organiser_id === myOrganiserId`. `myCampaignRole` is the roster row's
  `campaign_role` (`lead|organiser|coordinator|industrial_officer|specialist`,
  `baseline:9470-9478`) or `null` when only the owner column matched.
- **G2** A campaign is **team** when a roster row's `organiser_id` is in
  `reportOrganiserIds`, or `campaigns.organiser_id` is.
- **G3** Mine wins: a campaign in both appears only in `mine`.
- **G4** Drop `is_sms_episode === true` (defence in depth behind `excludeSmsEpisodes`; plan 3.6
  `:132` retires "episode" from the UI) and `is_standing === true` (the shared standing
  campaign is not a campaign anyone organises — plan 3.6 `:132`, "'standing campaign'
  disappears from the UI"; standalone actions live in the Actions hub, WP1.5).
- **G5** Dedupe by `campaign_id` (a user can hold several roster rows on one campaign).
- **G6** Order by `created_at` **descending**, tie-broken by `name` — identical to the
  `/campaigns` list order (`campaigns/page.tsx:153`). Deliberately **not** "last activity
  first": that value arrives from a later query (§2.4) and re-sorting on arrival would make
  the cards jump under the cursor.
- **G7** `myOrganiserId === null` (profile not linked to an organiser record) → both arrays
  empty; the page renders the not-linked notice, reusing the copy already at
  `campaigns/page.tsx:413-418`.
- **G8** `archived_at` is **not** filtered — `/campaigns` does not filter it either
  (`campaigns/page.tsx:143-154`), and nothing is removed from the product. The card shows an
  "Archived" muted pill so it is not mistaken for live work.

---

### 2.3 Card contents

One card per `mine` entry. Components (new): `src/components/campaigns/my/my-campaign-card.tsx`,
`my-campaigns-grid.tsx`, `my-campaign-team-row.tsx`, `needs-attention-list.tsx`.

**Name, type and status pills.** `STATUS_VARIANT` / `TYPE_VARIANT` are duplicated in four
places today (`campaigns/page.tsx:96-108`, `campaign-detail-header-bar.tsx:44-57`,
`CampaignsMetricsTable.tsx:68`). Extract the two maps **once** into
`src/components/campaigns/campaign-badge-variants.ts` and import them from
`campaigns/page.tsx:96-108` (delete the local copies there) and from the new card. The other
two call sites are left alone — out of scope, and touching them widens the diff for no
acceptance criterion.

**The four-number strip** (plan 5.3 `:240`: "people, in a unit, rated, leaders"). Every number
already exists in `useCampaignsAllStats` — reuse it, do not recompute:

| Label (3.6 words) | Value | Source |
|---|---|---|
| People | `stats.namedWorkers` | one row per `campaign_worker_membership` (`useCampaignsAllStats.ts:99, 193`; table `baseline:7698-7704`) |
| In a unit | `stats.workersInAnyOu` | distinct `worker_id` with a `campaign_worker_ou` row, mapped to the campaign through `campaign_organising_units.ou_id` (`useCampaignsAllStats.ts:142-155, 223-229, 264`; `campaign_worker_ou` has no `campaign_id` — `baseline:9636-9645`) |
| Rated | `r1+r2+r3+r4` = `namedWorkers − ratings.noRating` | `campaign_worker_rating_summary.cumulative_rating IS NOT NULL` (`useCampaignsAllStats.ts:119-120, 248-258`; view `baseline:10699-10763`) |
| Leaders | `stats.leadershipTotal` | `member_role_types.role_name ∈ {delegate, Activist, contact}` plus `workers.is_bargaining_rep` (`useCampaignsAllStats.ts:207-210`) — the same number the `/campaigns` "Leadership" stat card shows (`CampaignsDashboard.tsx:132`) |

`campaign_leader_worker_links` (`baseline:9435-9444`) is **not** used: it is the
leader→follower relationship overlay, not a leader count, and nothing on `/campaigns` counts
it. Picking the number `CampaignsDashboard` already computes means the card and the portfolio
page can never disagree.

**Rating-distribution bar.** Reuse `CompactRatingsBar`
(`src/components/campaigns/wall-chart/unit-summary-metrics.tsx:34-65`) — a 6 px stacked bar
with `aria-label="Rating distribution"` and a per-segment tooltip, already used by the
wall-chart sticky header (`wall-chart-summary-header.tsx:90`). Its `buckets` shape is
`{r1,r2,r3,r4,unrated}` and `CampaignAggStats.ratings` is `{noRating,r1,r2,r3,r4}`
(`useCampaignsAllStats.ts:17-23`), so add a pure mapper with tests:

```ts
// src/lib/campaign/my-campaign-metrics.ts (+ __tests__/my-campaign-metrics.test.ts)
export function toRatingBarBuckets(ratings: CampaignRatingBuckets):
  { r1: number; r2: number; r3: number; r4: number; unrated: number };
export function ratedCount(ratings: CampaignRatingBuckets): number;   // r1+r2+r3+r4
export function ratingBarTotal(stats: CampaignAggStats): number;      // namedWorkers
```

Rules: **M1** `noRating → unrated`, other keys pass through. **M2** `ratedCount` sums the four.
**M3** total 0 → `CompactRatingsBar` already returns `null` (`unit-summary-metrics.tsx:35`), so
the card renders a hairline placeholder instead of a collapsed bar.

#### 2.3.1 Performance: one round trip per data source, for all cards

`useCampaignsAllStats(planIds)` (`src/lib/hooks/useCampaignsAllStats.ts:87`) already issues
**four** queries total for the whole page — membership (`:95-112`), ratings (`:115-125`), OUs
(`:128-138`), worker↔OU (`:142-155`) — plus a P2W RPC that is skipped when `planIds` is empty
(`useP2wCompletionByPlanIds.ts:30, 37, 57`). It is exactly the "not per card" shape this
package needs. Two changes, both backwards-compatible:

```ts
// useCampaignsAllStats.ts:87 — signature only
export function useCampaignsAllStats(
  planIds: number[],
  opts?: { campaignIds?: readonly number[] },
)
```

- When `opts?.campaignIds` is **undefined** the three campaign-scoped queries keep today's
  filters *and today's query keys* (`['all-campaign-members']`, `['all-campaign-ratings']`,
  `['all-campaign-ous']` — `:97, 117, 130`). `/campaigns` is byte-for-byte unchanged and
  shares no cache entry with the new page.
- When it is provided, each gains `.in('campaign_id', ids)` and a key suffix, e.g.
  `['all-campaign-members', idsKey]` where `idsKey = [...ids].sort((a,b)=>a-b).join(',')` —
  the idiom already used at `:143` and `useP2wCompletionByPlanIds.ts:25`. The worker↔OU query
  (`:142-155`) needs no change: it is already scoped by the OU ids the filtered OU query
  returned.

My campaigns calls `useCampaignsAllStats([], { campaignIds: mine.map(c => c.campaign_id) })`.
For 2–6 cards that is four queries returning only those campaigns' rows — strictly less data
than `/campaigns` pulls today.

**The team row does not get the four numbers.** A lead with eight reports could have 40+ team
campaigns; pulling every membership row for them would dominate the ten-second budget for a
secondary row. `team` renders as a compact list (name, type pill, status pill, last activity,
"Open wall chart"), which is what plan 5.3 asks for ("in a second row") without the cost. This
is a stated risk, §2.9 R1.

**Primary action.** `<Link href={campaignChartHref(id)}>Open wall chart</Link>` — an anchor,
not a button, so it is keyboard- and middle-click-navigable and Playwright can address it as
`getByRole("link", { name: "Open wall chart" })`. The whole card is *not* a click target
(appendix D 9 item 6 records "Active Campaigns rows are not clickable" as a defect on
`/dashboard`; the fix is one honest link, not a div that swallows clicks).

---

### 2.4 "Last activity"

Plan 5.3 `:240`: "last activity (latest rating, call, SMS or list fire)". Where those live
(all line numbers in the baseline):

| Signal | Table | Timestamp | Campaign scope |
|---|---|---|---|
| latest rating | `campaign_activity_ratings` `:7502-7521` | `rated_at` | **none** — via `campaign_activities.campaign_id` `:8869-8891` |
| call | `call_attempts` `:8135-8158` | `started_at` | **none** — via `call_list_items.item_id` `:8187-8210` → `call_lists.campaign_id` `:8219-8235` |
| SMS | `sms_conversations` `:14120-14141` | `last_message_at` | `campaign_id` ✔ |
| list fire | `campaign_worker_lists` `:10567-10592` | `fired_at` | `campaign_id` ✔ |

`campaign_worker_rating_summary` cannot supply it: it exposes `last_activity_rating` (the
rating **value**) and deliberately drops `rated_at` (`baseline:10699-10763`).
`worker_campaign_connections.last_activity_at` (`:16133`) is per-worker and is only maintained
by a trigger on `worker_activity_log` that none of these four pathways write — do not use it.

**One query per campaign is not acceptable, and PostgREST cannot do it in one.** A per-campaign
max needs a GROUP BY; PostgREST has no aggregate. Doing it client-side per source per campaign
is 4 × N round trips (24 for six cards), which breaks the work package's own performance rule.
So: **one read-only SQL function, one round trip for every card.**

#### 2.4.1 New migration — `supabase/migrations/20260910090000_campaign_last_activity.sql`

Never edits an applied file. Adds one function; **no table, no policy, no grant on any table**.

```sql
-- WP1.3 — "last activity" for the My campaigns cards.
-- SECURITY INVOKER (the default): every underlying table's RLS applies to the
-- caller exactly as it would to a direct SELECT. Read-only, STABLE.
CREATE OR REPLACE FUNCTION public.campaign_last_activity(p_campaign_ids integer[])
RETURNS TABLE (campaign_id integer, last_activity_at timestamptz, last_activity_kind text)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT ids.cid,
         v.at,
         v.kind
  FROM unnest(coalesce(p_campaign_ids, ARRAY[]::integer[])[1:200]) AS ids(cid)
  CROSS JOIN LATERAL (
    SELECT x.at, x.kind
    FROM (VALUES
      ((SELECT max(r.rated_at) FROM campaign_activity_ratings r
          JOIN campaign_activities a ON a.activity_id = r.activity_id
         WHERE a.campaign_id = ids.cid AND a.is_perception = false), 'rating'::text),
      ((SELECT max(ca.started_at) FROM call_attempts ca
          JOIN call_list_items cli ON cli.item_id = ca.list_item_id
          JOIN call_lists cl ON cl.list_id = cli.list_id
         WHERE cl.campaign_id = ids.cid), 'call'::text),
      ((SELECT max(sc.last_message_at) FROM sms_conversations sc
         WHERE sc.campaign_id = ids.cid), 'sms'::text),
      ((SELECT max(l.fired_at) FROM campaign_worker_lists l
         WHERE l.campaign_id = ids.cid), 'list_fire'::text)
    ) AS x(at, kind)
    WHERE x.at IS NOT NULL
    ORDER BY x.at DESC
    LIMIT 1
  ) AS v;
$$;

ALTER FUNCTION public.campaign_last_activity(integer[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.campaign_last_activity(integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_last_activity(integer[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.campaign_last_activity(integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_last_activity(integer[]) TO service_role;
```

Notes the implementer must keep:

- `is_perception = false` mirrors `campaign_worker_rating_summary`'s own filter
  (`baseline:10699-10763`), so "latest rating" means the same thing here as on the wall chart.
- `fired_at IS NOT NULL` is implied by `max()`; **no `status = 'fired'` filter** — a list fired
  and later archived keeps `fired_at` (`baseline:10567-10592`, status CHECK
  `draft|fired|archived`).
- `[1:200]` caps the array so a crafted call cannot ask for the whole table.
- `anon` is revoked deliberately, matching WP1.1's precedent
  (`20260909100000_workspace_mode.sql:52-54`) rather than the baseline's blanket
  `GRANT ALL … TO anon`.
- The rating arm has **no supporting index** (`campaign_activity_ratings` indexes are
  `activity_id, worker_id, event_id, import_batch_id, rating_phase`,
  `baseline:20701-20725`). At dev scale this is a sub-millisecond `max()` over a small
  filtered set. **No index is added in this package** — see risk §2.9 R5 and open question Q1.

Types are regenerated afterwards: `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`
from the repo root (PROGRESS.md standing note). Never without the variable.

#### 2.4.2 Client and formatting

`src/lib/hooks/useMyCampaigns.ts` exports `useCampaignLastActivity(campaignIds)` →
`supabase.rpc("campaign_last_activity", { p_campaign_ids: ids })`, `enabled: ids.length > 0`,
`staleTime: 60_000`, keyed `['campaign-last-activity', idsKey]`. It is **not** awaited by the
card's first paint: the card renders name, pills, numbers and bar, and the last-activity line
fills in when it lands. This is why G6 does not sort on it.

Pure formatter in `src/lib/campaign/my-campaign-metrics.ts` (+ tests):

```ts
export function formatLastActivity(
  at: string | null, kind: LastActivityKind | null, now: number,
): string;   // "Rating 2 days ago" | "SMS today" | "No activity yet"
```

Rules: **F1** null → "No activity yet". **F2** future or unparseable → "No activity yet"
(never a negative age). **F3** < 24 h → "today"; < 48 h → "yesterday"; else "N days ago" up to
30, then a `dd MMM yyyy` date via `date-fns` `format` (the app's existing formatter,
`campaigns/page.tsx:4, 111-117`). **F4** kind labels use plan 3.6 words: `rating` → "Rating",
`call` → "Call", `sms` → "SMS", `list_fire` → "List fired".

---

### 2.5 Needs attention

Plan 5.3 `:241`: items "pulled from the existing pending-review and role-check queues and the
resume banners (an in-progress phone, email or SMS action), each deep-linking into the right
campaign".

#### 2.5.1 The four sources, and what each costs

| Source | Existing code | What My campaigns does | Round trips |
|---|---|---|---|
| Pending review | `usePendingReviewCount` — `src/components/campaigns/pending-review-tab.tsx:90-104`, a `head: true` count on `campaign_prospective_workers` filtered `campaign_id` + `review_status = 'pending'` | **one** multi-campaign query modelled on `pending-review-widget.tsx:40-43`: `.select("prospective_id, campaign_id").eq("review_status","pending").in("campaign_id", ids)`, grouped client-side. Partial index `idx_cpw_review_status … WHERE review_status='pending'` (`baseline:20873`) covers it | 1 |
| Phone resume | `ResumeBanner` — `src/components/phone/orchestrator/ResumeBanner.tsx:24-42`, `phone_call_actions` `.eq('campaign_id',…).eq('created_by', user.id).eq('status','in_progress')` | same predicate with `.in("campaign_id", ids)`, selecting `action_id, campaign_id, entry_branch, script_id, list_ids, created_at` | 1 |
| Email resume | `EmailResumeBanner` — `src/components/email/orchestrator/EmailResumeBanner.tsx:40-60`, `campaign_comms_drafts` `.eq('created_by', user.id).eq('platform','email').eq('status','draft').not('entry_branch','is',null)` | same predicate with `.in("campaign_id", ids)`, selecting `draft_id, campaign_id, entry_branch, email_list_id, subject` | 1 |
| SMS resume | `SmsResumeBanner` — `src/components/sms/orchestrator/SmsResumeBanner.tsx:22-25` | **nothing.** It is a deliberate stub that returns `null`; there is no in-flight SMS state to resume until Phase 10's `sms_chat_sessions` (its own doc comment, `:3-16`). No SMS item is produced and none is invented | 0 |
| Role check | `useRoleCheckCount` — `src/components/campaigns/role-check-tab.tsx:73-82` | `useRoleCheckCount(id)` **per campaign, deferred**, capped at the first 6 of `mine` | ≤6, non-blocking |

**Role check is the one expensive source and it is handled honestly.** There is no count
endpoint: `useRoleCheckCount` shares its key and its whole payload with `RoleCheckTab`
(`role-check-tab.tsx:64, 73-82`) and `/api/campaigns/[id]/role-check/route.ts` runs five
sequential Supabase queries (`:48, :66, :85, :126`, final predicate in JS at `:140-144`) to
produce it. Therefore, on this page:

- the hooks are mounted in a small `RoleCheckProbe` child rendered **only after** `mine` has
  resolved, so they never sit in front of the first paint;
- they are capped to the first six campaigns of `mine` (`MAX_ROLE_CHECK_PROBES = 6`), with a
  comment naming the cost and pointing at the fix (a real count endpoint, WP1.6 or later);
- `staleTime: 30_000` is inherited from `role-check-tab.tsx:79`, so a revisit within the
  session costs nothing;
- the Needs-attention list renders progressively — role-check items appear as they land and
  **nothing on the page waits for them**, so they cannot spend the ten-second budget.

#### 2.5.2 Deep links

Extract the two banner href switches into one pure module so the page and the banners can
never drift, and so the URLs are testable:

`src/lib/campaign/resume-links.ts` (+ `__tests__/resume-links.test.ts`)

```ts
export function phoneResumeHref(a: { campaign_id: number; action_id: number;
  entry_branch: PhoneEntryBranch | null; script_id: number | null;
  list_ids: number[] | null }): string;
export function emailResumeHref(d: { campaign_id: number; draft_id: number;
  entry_branch: EmailEntryBranch | null; email_list_id: number | null }): string;
```

`phoneResumeHref` is the switch currently inline at `ResumeBanner.tsx:73-118` — six branches:
`script_first` (`:81-82`), `list_first` (`:88`), `assessment_first` (`:93`),
`assessment_list_first` (`:98`), `build_list` (`:107`, falling back to `:111` when
`list_ids[0]` is null), default (`:116`). `emailResumeHref` is the switch at
`EmailResumeBanner.tsx:94-130` — `ai_first`/`paste_first` (`:104`),
`ai_list_first`/`paste_list_first` (`:112` vs `:117` on `email_list_id`), `build_list`
(`:124`), default (`:128`). `ResumeBanner.tsx:73-118` and `EmailResumeBanner.tsx:94-130` are
**rewritten to call these functions**, so the banners and the home page emit identical URLs and
the branches finally have tests (one per branch, plus the two null fallbacks).

Queue links, unchanged routing:

- Pending review → `` `/campaigns/${id}?tab=plan&sub=pending-review` `` — the exact string at
  `src/components/dashboard/pending-review-widget.tsx:127`.
- Role check → `` `/campaigns/${id}?tab=plan&sub=role-check` `` — **new string, zero routing
  change**: `plan` is in `VALID_TABS` (`src/lib/campaign-tabs.ts:33`), `resolveTabParams`
  honours an explicit `sub` for cluster tabs (`campaign-tabs.ts:139-142`), `sub` is not
  validated against a whitelist, and `<TabsContent value="role-check">` already exists at
  `src/app/(dashboard)/campaigns/[id]/page.tsx:598`.

#### 2.5.3 Pure builder — `src/lib/campaign/needs-attention.ts` (+ `__tests__/needs-attention.test.ts`)

```ts
export type NeedsAttentionKind = "pending_review" | "role_check" | "phone_resume" | "email_resume";
export interface NeedsAttentionItem {
  key: string; kind: NeedsAttentionKind; campaignId: number; campaignName: string;
  label: string; href: string; count?: number;
}
export function buildNeedsAttention(input: {
  campaigns: readonly { campaign_id: number; name: string }[];
  pendingReview: readonly { campaign_id: number }[];
  roleCheckCounts: ReadonlyMap<number, number>;
  phoneActions: readonly PhoneResumeRow[];
  emailDrafts: readonly EmailResumeRow[];
}): NeedsAttentionItem[];
```

Rules (numbered test cases):

- **N1** Pending-review rows are grouped to one item per campaign with `count = n`; label
  `"n people to review"` / `"1 person to review"`.
- **N2** A role-check count of 0 or `undefined` produces no item; > 0 produces
  `"n leaders to check"`, href per §2.5.2.
- **N3** One phone item per in-progress action, label `"Finish the call action you started"`,
  href `phoneResumeHref(...)`.
- **N4** One email item per draft, label `"Finish the email you started"` (with the draft
  `subject` appended when non-empty), href `emailResumeHref(...)`.
- **N5** Rows whose `campaign_id` is not in `campaigns` are dropped — the queries are scoped by
  `.in()`, but a stale cache must never render an item pointing at a campaign the user cannot
  see, or an item with a blank name.
- **N6** Order: resume items first (they are the user's own unfinished work), then pending
  review, then role check; within a kind, by campaign name. Deterministic — the list must not
  reshuffle as the deferred role-check probes land.
- **N7** No items → the section is not rendered at all (no empty "Needs attention" heading).
- **N8** `key` is `` `${kind}:${campaignId}:${id ?? ""}` `` — stable across refetches so React
  does not remount rows.

---

### 2.6 New campaign button

The create-campaign dialog is **inline** in `src/app/(dashboard)/campaigns/page.tsx:309-356`
(comment `{/* Campaign creation selector dialog */}` at `:309`, closing `</Dialog>` at `:356`),
driven by `createSelectorOpen` state (`:130`) and opened by the strip button at `:376-383`. It
offers exactly two options: **Campaign wizard** → `router.push("/campaigns/new")` (`:317`) and
**Manual create** → `router.push("/campaigns/new/manual")` (`:335`).

Change: extract it verbatim into
`src/components/campaigns/create-campaign-dialog.tsx`:

```tsx
export function CreateCampaignDialog({ open, onOpenChange }:
  { open: boolean; onOpenChange: (v: boolean) => void }) { … }
```

- The JSX, copy and both `router.push` targets move across **unchanged** — same two options,
  same strings, same destinations. `Wand2` and `Settings as SettingsIcon` move with it
  (check `campaigns/page.tsx:8` before deleting either from that import list: an unused import
  is a lint error and the budget forbids raising the count).
- `campaigns/page.tsx:309-356` becomes `<CreateCampaignDialog open={createSelectorOpen}
  onOpenChange={setCreateSelectorOpen} />`. The strip button at `:376-383` is untouched.
- My campaigns renders one `<Button>New campaign</Button>`, gated on `canWrite`
  (`auth-context.tsx:385` — `admin` or `user`; decision 8), that sets the same state and
  renders the same dialog.

**No new creation path.** Zero new routes, zero new dialogs, zero changes to
`/campaigns/new`, `/campaigns/new/manual` or the planner-wizard variant.

---

### 2.7 The page itself

`src/app/(dashboard)/my-campaigns/page.tsx` (new, `"use client"`), inside the dashboard route
group so it gets the sidebar and the `Header` title from §2.1.5. Structure, top to bottom:

1. **Auto-open effect** — `shouldAutoOpenSingleCampaign({ fromLanding, campaignIds })` from
   `useSearchParams()`; on a hit, `router.replace(campaignChartHref(id))`. Guarded on the
   campaigns query having resolved, so it never fires against an empty list.
2. **Header row** — "New campaign" button (§2.6) right-aligned. No `<h1>`; `Header` supplies it.
3. **Not-linked notice** — when `profile.organiser_id == null`, the copy already at
   `campaigns/page.tsx:413-418`, verbatim.
4. **Cards grid** — `mine`, `md:grid-cols-2 xl:grid-cols-3`. Loading: skeleton cards (count =
   3), never a spinner that collapses the layout.
5. **Empty state** — "You are not on any campaign yet." plus the New campaign button and a
   plain link to `/campaigns` ("See all campaigns"), so nothing is a dead end.
6. **"My team's campaigns"** — rendered only when `isLeadWorkRole(profile.work_role)` **and**
   `team.length > 0`; compact rows (§2.3.1).
7. **"Needs attention"** — `NeedsAttentionList`, rendered only when items exist (N7).
8. **`RoleCheckProbe`** — invisible child mounting the deferred role-check hooks (§2.5.1).

Terminology audit for every string on the page (plan 3.6 `:122-134`): "My campaigns",
"New campaign", "Open wall chart", "People", "In a unit", "Rated", "Leaders", "Last activity",
"Needs attention", "My team's campaigns", "Archived", "See all campaigns". No "OU", no "unit
view", no "scope", no "universe", no "P2W", no "episode", no "standing campaign", no "Campaign
Plan".

---

### 2.8 The strip on `/campaigns`

**This package changes nothing about the strip.** `campaigns/page.tsx:374-405` is left exactly
as it is.

The acceptance phrase "the strip of wizard links is gone from `/campaigns`" is satisfied by
**WP1.5**, whose plan (`/tmp/oux-plans/wp1.5.md` §2.6, lines 352-362) demotes it under decision
7 (Amended): Email wizard → the hub's Email card, Phone wizard → the hub's Calls card, SMS
tools → one "Actions" link; **Create campaign and Import lists stay on the strip**. WP1.5 is
"independent of WP1.3 and WP1.4" (its own §1.1), so:

- if WP1.5 merges first, this package does nothing there — the file it would have touched has
  already changed and there is no conflict, because §2.6's only edit to that file is the
  dialog extraction at `:309-356`, which is a different region from the strip at `:374-405`;
- if WP1.5 has **not** merged, this package still does nothing there.

Either way `/campaigns` keeps every entry point it has today. Nothing is removed anywhere in
this package.

---

### 2.9 Risks and the rules they could break

| # | Risk | Rule it could break | Mitigation |
|---|---|---|---|
| R1 | **Lead-organiser row query cost.** A lead with many reports produces Q0 + a large `.in()` on `campaign_organisers` and a large `.or()` on `campaigns` | ten-second budget | Team campaigns get **no** stats queries (§2.3.1); the row is name/pills/last activity/link only. `mine` alone drives `useCampaignsAllStats`. If a lead's team list is long, it is capped at 12 rows with a "See all campaigns" link to `/campaigns` (which already has an organiser filter, `CampaignsDashboard.tsx:175-187`) |
| R2 | **Landing redirect flicker.** A visible bounce, or a stuck spinner if the profile never loads | "full mode keeps working" | Neutral gate at `/` renders no product surface and issues no query (§2.1.2); 5 s failsafe → `/campaigns`; `router.replace` (client navigation, no document reload); the gate is the *only* mode-dependent redirect — nothing else in the app is touched |
| R3 | **The e2e account has exactly one campaign** (PROGRESS.md: dev campaign 1, `organiser_id` 4 → 10), so in organiser mode the landing gate sends it straight to the chart and the My-campaigns page is never seen by flow one | acceptance criterion | The spec handles **all three** landing outcomes explicitly (§2.10.3), and a **separate** deterministic test visits `/my-campaigns` without `?from=landing`, where the auto-open cannot fire (L4) |
| R4 | **Role check is a five-query API call per campaign** with no count endpoint | ten-second budget | Deferred, capped at 6, `staleTime: 30_000`, nothing waits on it (§2.5.1) |
| R5 | **`campaign_last_activity` rating arm is unindexed** (`baseline:20701-20725` — no index on `rated_at`) | production performance | Dev-scale is trivial. No index is added here: `CREATE INDEX` inside a migration transaction takes a write lock, and the operator has not yet re-seeded dev from production, so there is no evidence about the row count. Open question Q1 |
| R6 | **Cache staleness on Needs attention.** `pending-review-tab.tsx:190-205` `invalidate()` fires four keys and knows nothing about this page's key — the same defect the dashboard widget already has (`['dashboard-pending-review']`) | correctness of a count | The page's keys are `['my-campaigns', …]` with `staleTime: 60_000` and react-query's default refetch-on-mount/focus, so returning to the page after acting on a queue refreshes it. Adding this page's key to `invalidate()` is a one-line change **inside** `pending-review-tab.tsx:190-205` and is included |
| R7 | **`campaign_organisers` not yet backfilled on production** (WP0.4 script 02 is pending there) | cards missing for real users | The second arm of the union (`campaigns.organiser_id = mine`) covers exactly that case (§2.2, G1) — the page is correct before and after the backfill |
| R8 | Extracting the create dialog changes `/campaigns` behaviour by accident | "nothing is removed; full mode unchanged" | The extraction is verbatim; both `router.push` targets and every string move unchanged; the strip button and its state are untouched. Proven by the e2e full-mode branch (§2.10.3) still opening a campaign from `/campaigns` |
| R9 | Adding `/my-campaigns` to `allNavHrefs` changes active-state resolution for another item | nav regression | `isNavItemActive(pathname, href, allNavHrefs)` resolves the longest matching href; `/my-campaigns` is not a prefix of, and shares no prefix with, any existing entry (`sidebar.tsx:33-50`) |

---

### 2.10 Tests and the commands that prove each criterion

All commands run from `apps/organising-db` unless stated.

#### 2.10.1 New vitest files (pure logic only — `vitest.config.ts:18` sets `environment: "node"`)

| File | Covers |
|---|---|
| `src/lib/workspace/__tests__/landing.test.ts` | L1–L4 (§2.1.4) |
| `src/lib/campaign/__tests__/my-campaigns.test.ts` | G1–G8 (§2.2.1) |
| `src/lib/campaign/__tests__/my-campaign-metrics.test.ts` | M1–M3, F1–F4 (§2.3, §2.4.2) |
| `src/lib/campaign/__tests__/needs-attention.test.ts` | N1–N8 (§2.5.3) |
| `src/lib/campaign/__tests__/resume-links.test.ts` | every phone branch (6 + null fallback) and email branch (4 + null fallback) against the URLs at `ResumeBanner.tsx:81-116` and `EmailResumeBanner.tsx:104-128` |
| `src/lib/campaign/__tests__/lead-role.test.ts` | `isLeadWorkRole` over all six `work_role` CHECK values (`baseline:9894`) |

Sibling `__tests__` folders, matching `src/lib/campaign/__tests__/` (which already holds
`campaign-detail-routes.test.ts`, `workforce-view.test.ts`, …) and
`src/lib/workspace/__tests__/` (WP1.1).

#### 2.10.2 Verification commands

```
pnpm lint                     # touched files clean on changed lines; total errors must not rise above 143/151
pnpm test                     # all existing tests plus the six new files
pnpm build
pnpm validate:migrations      # from the repo root — the new migration file
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types   # from the repo root, after the migration is applied to dev
```

The migration is applied to **dev only** (`dpnnmkhabysfdogllsyh`). Production
(`gteygwfgjvczanmrwgbr`) is never touched, not even read.

#### 2.10.3 e2e — flow one, phase-1 form

`tests/e2e/wall-chart.spec.ts` is rewritten. Its header comment already anticipates this:
"WP1.3 later changes the start page; this spec follows it" (`:6-7`).

**Setup change first.** `tests/e2e/global-setup.ts:48` waits for `/\/campaigns(\?|$)/` after
sign-in. With the gate that becomes `/campaigns`, `/my-campaigns?from=landing`, **or**
`/campaigns/{id}?…`, so the wait becomes:

```ts
await page.waitForURL(/\/(my-campaigns|campaigns)(\/|\?|$)/, { timeout: 30_000 });
```

**Test A — "flow one: sign in and reach a wall chart in under ten seconds"** (new, in its own
`test.describe` with `test.use({ storageState: { cookies: [], origins: [] } })` so it performs
its own login and the budget is measured from the login submit, not from a restored session).

```ts
await page.goto("/login");
await page.locator("#email").fill(E2E_USER_EMAIL);          // selectors: global-setup.ts:43-45
await page.locator("#password").fill(E2E_USER_PASSWORD);
const t0 = Date.now();
await page.getByRole("button", { name: /sign in/i }).click();

// Both modes are asserted: the operator may or may not have flipped this
// account to organiser mode, and the account owns exactly one dev campaign.
await page.waitForURL(/\/(my-campaigns|campaigns)(\/|\?|$)/, { timeout: 20_000 });
const url = new URL(page.url());

if (/^\/campaigns\/\d+$/.test(url.pathname)) {
  // organiser mode + exactly one campaign — the landing gate opened the chart.
} else if (url.pathname === "/my-campaigns") {
  await page.getByRole("link", { name: "Open wall chart" }).first().click();
} else {
  // full mode — today's path, unchanged.
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.first().click();
}

await expect(page).toHaveURL(/\/campaigns\/\d+(\?.*tab=workforce.*sub=wall-chart)?/);
await expect(wallChartCardTitle).toBeVisible();
await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible();
await expect(page.getByRole("button", { name: "Wall chart" }))
  .toHaveAttribute("aria-pressed", "true");
expect(Date.now() - t0, "login → wall chart must be under 10 s").toBeLessThan(10_000);
```

`wallChartCardTitle` is the locator already defined at `wall-chart.spec.ts:27-30` (the
`CardTitle` div, `.first()` to avoid strict-mode collision with the view-toggle button of the
same name). The elapsed assertion comes **after** the visibility assertions so a failure says
"the chart never appeared", not "it was slow".

**Test B — "My campaigns lists my campaigns and opens the wall chart"** (new, uses the shared
signed-in storage state, so it is mode-independent: `/my-campaigns` is a real route in both
modes and, without `?from=landing`, L4 forbids the auto-open).

```ts
await page.goto("/my-campaigns");
await expect(page.getByRole("heading", { name: "My campaigns" })).toBeVisible();  // header.tsx h1
const card = page.getByRole("link", { name: "Open wall chart" }).first();
await expect(card, "the e2e account must be on at least one dev campaign").toBeVisible({ timeout: 30_000 });
await expect(page.getByText("In a unit").first()).toBeVisible();   // the four-number strip
await card.click();
await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/);
await expect(wallChartCardTitle).toBeVisible();
await expect(page.locator("[data-worker-id]").first()
  .or(page.locator('[data-ou-id="unassigned"]'))).toBeVisible();
```

**Test C — the Overview round-trip** (`wall-chart.spec.ts:61-69`) is kept verbatim, appended to
test B. It is the WP0.3 hand-off and nothing here changes it.

Selector discipline is unchanged from WP0.2: every selector is a role, a heading, or a string
the product already renders. **No `data-testid` is added to production markup.**

Run: `pnpm e2e` with `E2E_BASE_URL` set to this branch's Vercel preview and `E2E_USER_EMAIL` /
`E2E_USER_PASSWORD` sourced from the shell profile (PROGRESS.md standing note). Credentials are
never printed, never written to the repo, and never typed by an agent into a form — the harness
reads them from the environment (`tests/e2e/env.ts:9-11`).

#### 2.10.4 Which command proves which acceptance criterion

| Criterion | Proof |
|---|---|
| "e2e flow one passes from a `user` account in under ten seconds" | `pnpm e2e` → test A (its final `expect(…).toBeLessThan(10_000)`) |
| "the strip of wizard links is gone from `/campaigns`" | Satisfied by WP1.5 (§2.8, decision 7 Amended). This package's proof of *no regression* is test A's full-mode branch and `pnpm build` |
| Cards come from `campaign_organisers` | `my-campaigns.test.ts` G1–G8 + test B |
| Lead's team row from `reports_to` | `my-campaigns.test.ts` G2/G3, `lead-role.test.ts` |
| Needs attention from the three sources | `needs-attention.test.ts` N1–N8, `resume-links.test.ts` |
| One New campaign button, existing dialog | `pnpm build` + test A's full-mode branch (the `/campaigns` strip still opens the same dialog) |
| Single-campaign organisers land on their chart | `landing.test.ts` L2/L4 + test A's first branch |

---

### 2.11 Complete file list

**New**

| Path | Purpose |
|---|---|
| `src/app/(dashboard)/my-campaigns/page.tsx` | the page (§2.7) |
| `src/components/campaigns/my/my-campaigns-grid.tsx` | cards grid + skeleton + empty state |
| `src/components/campaigns/my/my-campaign-card.tsx` | one card (§2.3) |
| `src/components/campaigns/my/my-campaign-team-row.tsx` | the lead's compact second row |
| `src/components/campaigns/my/needs-attention-list.tsx` | Needs attention + `RoleCheckProbe` |
| `src/components/campaigns/create-campaign-dialog.tsx` | extracted from `campaigns/page.tsx:309-356` |
| `src/components/campaigns/campaign-badge-variants.ts` | `STATUS_VARIANT` / `TYPE_VARIANT`, extracted |
| `src/lib/workspace/landing.ts` (+ `__tests__/`) | `landingPathFor`, `campaignChartHref`, `shouldAutoOpenSingleCampaign` |
| `src/lib/campaign/my-campaigns.ts` (+ `__tests__/`) | `groupMyCampaigns` |
| `src/lib/campaign/my-campaign-metrics.ts` (+ `__tests__/`) | rating-bar mapping, `formatLastActivity` |
| `src/lib/campaign/needs-attention.ts` (+ `__tests__/`) | `buildNeedsAttention` |
| `src/lib/campaign/resume-links.ts` (+ `__tests__/`) | `phoneResumeHref`, `emailResumeHref` |
| `src/lib/campaign/lead-role.ts` (+ `__tests__/`) | `isLeadWorkRole` (WP1.6 replaces) |
| `src/lib/hooks/useMyCampaigns.ts` | Q0–Q2, `useCampaignLastActivity`, needs-attention queries |
| `supabase/migrations/20260910090000_campaign_last_activity.sql` | one read-only function (§2.4.1) |

**Changed**

| Path:line | Change |
|---|---|
| `src/app/page.tsx:1-5` | server `redirect("/campaigns")` → client landing gate |
| `src/app/(auth)/login/page.tsx:78` | `router.push("/campaigns")` → `router.push("/")` |
| `src/lib/supabase/middleware.ts:73` | `url.pathname = "/campaigns"` → `"/"` |
| `src/app/auth/set-password/page.tsx:49` | `router.push("/campaigns")` → `router.push("/")` |
| `src/components/layout/header.tsx:22` | add `"/my-campaigns": "My campaigns"` |
| `src/components/layout/sidebar.tsx:8-26, 33-44, 53, 115` | `Home` import; `myCampaignsNavItem`; `/my-campaigns` in `allNavHrefs`; organiser-mode-only prepend |
| `src/components/layout/mobile-nav.tsx:12, 79` | same organiser-mode-only prepend |
| `src/app/(dashboard)/campaigns/page.tsx:8, 96-108, 309-356` | import bookkeeping; badge maps imported instead of declared; dialog replaced by `<CreateCampaignDialog/>`. **Strip at `:374-405` untouched** |
| `src/lib/hooks/useCampaignsAllStats.ts:87, 95-155` | optional `opts.campaignIds`; default path and query keys unchanged |
| `src/components/phone/orchestrator/ResumeBanner.tsx:73-118` | switch replaced by `phoneResumeHref(...)` |
| `src/components/email/orchestrator/EmailResumeBanner.tsx:94-130` | switch replaced by `emailResumeHref(...)` |
| `src/components/campaigns/pending-review-tab.tsx:190-205` | `invalidate()` also fires the My-campaigns key (R6) |
| `tests/e2e/global-setup.ts:48` | widen the post-login URL wait |
| `tests/e2e/wall-chart.spec.ts` | tests A, B, C (§2.10.3) |

---

## 3. Out of scope

Things I was tempted to include and did not:

1. **A shared `my_campaigns` RPC** used by the campaigns list, dashboard widgets and the inbox
   pickers (appendix D 10 item 6, `:368`). The pure `groupMyCampaigns` is the seam for it; a
   cross-surface scoping refactor is a work package of its own.
2. **The campaign switcher and the More menu** (plan 5.4 `:250`) — WP1.4.
3. **The Actions hub, and any change to the `/campaigns` strip** — WP1.5 / WP3.4 under decision
   7 (Amended). This package removes nothing from `/campaigns`.
4. **A `campaign_organisers` write UI** ("add an organiser to my campaign") — WP1.6 under
   decision 8. This package only reads the table.
5. **A cheap role-check count endpoint.** `/api/campaigns/[id]/role-check` runs five queries to
   produce a number (`route.ts:48-144`). Fixing it is worth doing and belongs with WP1.6's
   auth work; here it is deferred and capped instead (§2.5.1).
6. **A real SMS resume banner.** `SmsResumeBanner` is a stub (`:22-25`) and there is no
   `sms_chat_sessions` table until the SMS module's Phase 10. No SMS needs-attention item is
   invented.
7. **De-duplicating `STATUS_VARIANT`/`TYPE_VARIANT` everywhere.** Only the two call sites this
   package needs are unified; `campaign-detail-header-bar.tsx:44-57` and
   `CampaignsMetricsTable.tsx:68` are left alone.
8. **Removing the duplicate `<h1>Campaigns</h1>`** at `campaigns/page.tsx:359` (appendix D 9
   item 5). The new page simply does not add one.
9. **A `last_activity_at` column on `workload_dashboard_summary`** (`baseline:17454-17486`),
   which is where such a value would naturally live. A read-only function is a smaller,
   reversible step.
10. **Making the whole card clickable**, `?returnTo=` round-trips from the chart back to My
    campaigns, and a "recently viewed" ordering. One honest link per card; sidebar for the way
    back.
11. **Any `localStorage` persistence** — no view state is stored anywhere in this package
    (the orchestrator's standing rule).

---

## 4. Open questions

Only two need the operator; everything else has a stated assumption above.

**Q1 — May WP1.3 add one read-only SQL function (`campaign_last_activity`) to dev?**
Plan 5.3 lists "last activity" as card content, and it cannot be computed in one round trip
without it (§2.4). The function is `STABLE`, `SECURITY INVOKER`, touches no policy and creates
no table; it is a smaller change than WP1.1's `get_workspace_defaults()`. **Assumption if no
answer: build it as specified.** If the operator would rather WP1.3 ship with no schema change
at all, the fallback is to drop "latest rating" and "call" from the definition and compute last
activity from the two directly campaign-scoped tables only (`sms_conversations.last_message_at`
and `campaign_worker_lists.fired_at`) in one PostgREST query — cheaper, but it misses the
signal organisers generate most often. The same question covers whether to add
`idx_car_activity_rated_at ON campaign_activity_ratings(activity_id, rated_at DESC)`; the plan
above does **not** add it, pending the dev re-seed that would show whether it is needed.

**Q2 — Which `work_role` values count as "a lead" for the team row until WP1.6?**
The plan assumes `lead_organiser` only, matching `useLeadOrganisers`
(`usePlannerOptions.ts:152`) and decision 2. `coordinator` and `industrial_coordinator` also
sit above organisers in `is_lead_organiser_for_campaign` (`baseline:3711-3745`) and could
reasonably see a team row. **Assumption if no answer: `lead_organiser` only**, in one exported
constant (`src/lib/campaign/lead-role.ts`) that WP1.6 replaces.

## 5. Orchestrator approval

**Approved 2026-09-09.** Q1: build the migration — a `STABLE SECURITY INVOKER` read-only function that touches no policy or table is acceptable; the reviewer (Fable, because a migration is involved) must confirm it reads only through existing RLS and grants execute to `authenticated` only. Q2: the team row follows the same lead set WP1.6 defines (`lead_organiser`, `coordinator`, `industrial_coordinator`, matching `is_coordinator_or_lead()`), held in one shared constant `LEAD_WORK_ROLES` under `src/lib/auth/` that WP1.6 reuses. The neutral landing gate at `/` with a 5 s failsafe is accepted; the `?from=landing` guard on single-campaign auto-open is accepted. Branch `feat/oux-wp1.3-my-campaigns`, stacked on the phase-1 tip; PR base `develop`. Sequencing: after WP1.5 and WP1.2.

## 6. Deviations from plan

Implemented 2026-09-09 on `feat/oux-wp1.3-my-campaigns` (stacked on WP1.2 → WP1.6 → WP1.5 →
WP1.1). Every departure from §2, with the reason:

1. **No `src/lib/campaign/lead-role.ts` and no `lead-role.test.ts`** (§2.2, §2.10.1). Per §5
   Q2 the team row uses WP1.6's shared constant: `useMyCampaigns` reads
   `useAuth().isLeadOrganiser`, which `auth-context.tsx:421` derives from `LEAD_WORK_ROLES` in
   `src/lib/auth/work-role-flags.ts` (`lead_organiser`, `coordinator`,
   `industrial_coordinator`). Nothing is duplicated; the six-value coverage already lives in
   `src/lib/auth/__tests__/work-role-flags.test.ts`.
2. **No edits to `sidebar.tsx`, `mobile-nav.tsx` or `header.tsx`** (§2.1.5, §2.11). WP1.2's
   nav model already renders the My campaigns row in organiser mode and hides it in full mode;
   the only nav change is `MY_CAMPAIGNS_HREF` in `src/lib/nav/nav-model.ts` flipping from
   `"/campaigns"` to `"/my-campaigns"`. `pageTitles["/my-campaigns"] = "My campaigns"` was
   already present at `header.tsx:25` — verified, not re-added. Consequences, exactly:
   - `src/lib/nav/__tests__/__snapshots__/nav-model.test.ts.snap`: six lines changed, all
     `"href": "/campaigns"` → `"/my-campaigns"` on the `my_campaigns` row of organiser-mode
     cases 3, 4, 5, 6, 8 and 9. Nothing else in the snapshot moved; the full-mode cases 1, 2
     and 7 are byte-identical.
   - `nav-model-fixture.ts`: **unchanged** (it pins full mode only).
   - `nav-reachability.test.ts`: `ALL_NAV_HREFS` expectation gains `/my-campaigns`; the
     organiser default row's href becomes `/my-campaigns`; and the "only `/sms/inbox` needs
     Show everything" assertions become `["/campaigns", "/sms/inbox"]` — see item 3.
   - `tests/e2e/organiser-nav.spec.ts`: unchanged (it locates the row by name, not href).
3. **"See all campaigns" is rendered on every render of `/my-campaigns`, not only in the
   empty state** (§2.7 item 5). Flipping the href made `/campaigns` a full-mode row that
   organiser mode no longer shows, which failed WP1.2's decision-7 reachability proof. The
   page's header row now carries the link (plan 3.6 vocabulary) so the portfolio list is one
   click from the My campaigns row, and the proof records `/campaigns` as the second documented
   exception next to `/sms/inbox`, with both in-page paths asserted.
4. **The "last activity" clock is react-query's `dataUpdatedAt`, not `Date.now()`** (§2.4.2
   `now` argument). `eslint-plugin-react-hooks` in this repo flags `Date.now()` during render
   (`react-hooks/purity`) and `setState` inside an effect (`react-hooks/set-state-in-effect`);
   the moment the rows arrived is the honest "now" for their ages and needs neither.
5. **`useCampaignLastActivity` is called with `mine` and `team` ids together** (§2.4.2 "for
   every card"). §2.3.1 lists last activity on the team row, so both go in the one RPC call
   (still one round trip; the function caps at 200 ids).
6. **`useCampaignsAllStats([], { campaignIds: [] })` issues no query** and reports
   `isLoading: false` (§2.3.1 did not say). A filtered call with nothing to filter on has
   nothing to fetch. The unfiltered path is byte-identical to before, including its keys.
7. **Migration SQL differs from the §2.4.1 listing in four ways**, all in
   `supabase/migrations/20260910090000_campaign_last_activity.sql`: `SECURITY INVOKER` is
   stated explicitly rather than left as the default; every table is schema-qualified
   (`public.…`) even with `search_path` pinned; a `COMMENT ON FUNCTION` is added; and the
   slice is `unnest((coalesce(p_campaign_ids, ARRAY[]::integer[]))[1:200])` — the listing's
   `unnest(coalesce(…)[1:200])` is not valid PostgreSQL (a subscript on a function call needs
   the extra parentheses).
8. **Q2's `.or()` omits the `campaign_id.in.()` arm when the roster is empty** (§2.2).
   PostgREST rejects an empty `in.()` list; a plain organiser with no roster rows still gets
   the owner-column arm.
9. **`pendingReviewHref` and `roleCheckHref` are exported from `needs-attention.ts`** (§2.5.2
   had the strings inline) so the tests pin them by name.
10. **`MyCampaign.teamOrganiserIds` exists on both groups** (`[]` for `mine`) rather than only
    on `team` (§2.2.1), so the two arrays share one type.
11. **Test A's `toHaveURL` uses a 30 s timeout** (§2.10.3 listing used the default). Same
    reason as the WP0.2 spec's note about cold preview deployments; the 10 s budget assertion
    is unchanged and still comes after the visibility assertions.
12. The New campaign button and the shared dialog render only when `canWrite` (§2.6 gates the
    button; the dialog is gated too so a viewer mounts nothing it cannot use).

**Where every number on a card comes from** (§2.3, no new computation):

| Card label | Value | Existing computation |
|---|---|---|
| People | `stats.namedWorkers` | `useCampaignsAllStats.ts` — `s.namedWorkers++` per `campaign_worker_membership` row |
| In a unit | `stats.workersInAnyOu` | `useCampaignsAllStats.ts` — distinct `worker_id` in `campaign_worker_ou`, mapped through `campaign_organising_units.ou_id` |
| Rated | `ratedCount(stats.ratings)` = `r1+r2+r3+r4` | `useCampaignsAllStats.ts` — buckets from `campaign_worker_rating_summary.cumulative_rating`; M2 tested |
| Leaders | `stats.leadershipTotal` | `useCampaignsAllStats.ts` — `delegate`/`Activist`/`contact` role names plus `is_bargaining_rep`; the `/campaigns` "Leadership" stat |
| Rating bar | `toRatingBarBuckets(stats.ratings)` over `ratingBarTotal(stats)` = `namedWorkers` | `CompactRatingsBar` (`unit-summary-metrics.tsx`), M1/M3 tested |
| Last activity | `campaign_last_activity()` row, `formatLastActivity` | new read-only function (§2.4.1), F1–F4 tested |
| Needs attention counts | `buildNeedsAttention` | rows from the same predicates as `pending-review-widget.tsx`, `ResumeBanner.tsx`, `EmailResumeBanner.tsx`, `useRoleCheckCount`; N1–N8 tested |

### Implementer notes

**Commits** (all `feat(oux-wp1.3):`):

- `0322bf3` — migration + the five pure modules and their 48 vitest cases
- `6a527bf` — `CreateCampaignDialog` and badge variants extracted; banners call `resume-links`
- `2a8209b` — `/my-campaigns` page, hooks, components, landing gate, redirects, R6 invalidate
- `8ef6689` — `MY_CAMPAIGNS_HREF` flip, nav test/snapshot updates, flow one rewritten

**New files** (app paths relative to `apps/organising-db/`):

- `supabase/migrations/20260910090000_campaign_last_activity.sql` — the migration
- `src/lib/workspace/landing.ts`, `src/lib/workspace/__tests__/landing.test.ts`
- `src/lib/campaign/my-campaigns.ts`, `my-campaign-metrics.ts`, `resume-links.ts`,
  `needs-attention.ts` and their four `__tests__/*.test.ts`
- `src/lib/hooks/useMyCampaigns.ts`
- `src/components/campaigns/campaign-badge-variants.ts`, `create-campaign-dialog.tsx`
- `src/components/campaigns/my/my-campaign-card.tsx`, `my-campaigns-grid.tsx`,
  `my-campaign-team-row.tsx`, `needs-attention-list.tsx`
- `src/app/(dashboard)/my-campaigns/page.tsx`

**Changed files:** `src/app/page.tsx` (rewritten as the gate), `src/app/(auth)/login/page.tsx`,
`src/app/auth/set-password/page.tsx`, `src/lib/supabase/middleware.ts`,
`src/app/(dashboard)/campaigns/page.tsx` (dialog and badge maps only; the strip is untouched),
`src/lib/hooks/useCampaignsAllStats.ts`, `src/lib/nav/nav-model.ts`,
`src/lib/nav/__tests__/nav-reachability.test.ts`,
`src/lib/nav/__tests__/__snapshots__/nav-model.test.ts.snap`,
`src/components/campaigns/pending-review-tab.tsx`,
`src/components/phone/orchestrator/ResumeBanner.tsx`,
`src/components/email/orchestrator/EmailResumeBanner.tsx`, `tests/e2e/wall-chart.spec.ts`,
`tests/e2e/global-setup.ts`.

**Gates run from `apps/organising-db`** (2026-09-09, before the migration is applied anywhere):

- `pnpm exec eslint <every touched file>` — 0 problems
- `pnpm test` — 70 files, 932 tests passed (six nav snapshot lines updated, href only)
- `pnpm exec tsc --noEmit -p tsconfig.json` — clean
- `pnpm build` — compiled; `ƒ /my-campaigns` registered
- `env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD -u E2E_ADMIN_EMAIL -u E2E_ADMIN_PASSWORD pnpm e2e`
  — 10 skipped, exit 0
- repo root `pnpm validate:migrations` — "Validated 7 Supabase migrations"

**Notes for the verifier and reviewer:**

- The `.rpc("campaign_last_activity", …)` call in `useMyCampaigns.ts` typechecks because
  `createClient()` returns an untyped `SupabaseClient` (same as `get_workspace_defaults` in
  WP1.1). After `gen:types` the entry appears in `packages/db-types/generated.ts`; no cast to
  remove.
- The function reads seven tables, each with `FOR SELECT TO "authenticated" USING (true)` in
  the baseline: `campaign_activity_ratings` (`:26949`), `campaign_activities` (`:26945`),
  `call_attempts` (`:26681`), `call_list_items` (`:26689`), `call_lists` (`:26697`),
  `sms_conversations` (`:26821`), `campaign_worker_lists` (`:26737`). EXECUTE is granted to
  `authenticated` and `service_role` only; PUBLIC and `anon` are revoked.
- Nothing in this package was run against a database. The migration is unapplied.

**Verifier hand-off, in order:**

1. `supabase link` / confirm the linked project is **dev** `dpnnmkhabysfdogllsyh` (never
   `gteygwfgjvczanmrwgbr`).
2. `supabase db push --dry-run` → expect only `20260910090000_campaign_last_activity.sql`;
   then `supabase db push`.
3. Repo root: `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`; confirm
   `campaign_last_activity` appears under `Functions` in `packages/db-types/generated.ts`.
4. `apps/organising-db`: `pnpm exec tsc --noEmit -p tsconfig.json`, `pnpm test`, `pnpm build`.
5. Credentialled e2e against this branch's Vercel preview: `E2E_BASE_URL=<preview>
   E2E_USER_EMAIL=… E2E_USER_PASSWORD=… E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… pnpm e2e`.
   The timed flow one is `wall-chart.spec.ts` "sign in and reach a wall chart in under ten
   seconds"; it reports which of the three landing branches it took only by its URL, so note
   the account's mode. Run it in both modes if the operator can flip the account (the
   organiser-nav spec's admin PATCH is the write path).
6. Prefs reset check: after the run, `GET /api/admin/users` must show the e2e user's
   `workspace_prefs` as `{}` (the organiser-nav spec asserts this in its `finally`).

### Fix round 1

Implemented 2026-09-09 on `feat/oux-wp1.3-my-campaigns` after the §7 verifier run (at 60de980;
migration applied to dev, types regenerated). Items are the reviewer's numbering.

**Blocking**

1. **Landing gate decided before the profile arrived** (`src/app/page.tsx`,
   `use-workspace.tsx`, `auth-context.tsx`). After the login form, `useAuth().loading` is
   already false (INITIAL_SESSION on `/login` had no user and cleared it) and the SIGNED_IN
   branch never re-armed it, so the gate could — and with a cached defaults query always did —
   read `mode` while the profile was still in flight, when `resolveWorkspace()` returns `full`.
   Two changes, both small: `auth-context.tsx` gains `profileLoading`, raised synchronously in
   the SIGNED_IN / USER_UPDATED / PASSWORD_RECOVERY branch (a React state set, not a Supabase
   call — the WP1.6 macrotask deferral is untouched) and cleared in a `finally` once the
   deferred `fetchProfile` lands; `useWorkspace().loading` folds it in. The gate itself now
   decides on `canDecideLanding()` (new pure L5 in `landing.ts`: not while anything loads, and
   never for a signed-in user without a profile), keeping the 5 s failsafe to `/campaigns`. Four
   L5 cases in `landing.test.ts` (loading → wait; user without profile → wait; profile → decide;
   no user → decide).
2. **Test A raced the page's own `?from=landing` hop** (`tests/e2e/wall-chart.spec.ts`). After
   the first post-login wait the spec now waits for a URL without the `from` param before
   branching on the pathname, so branch 1 is observable; its comment is reworded honestly (it is
   My campaigns' L4 hop that opens the chart, not the gate).
3. **Test A full-mode failure — diagnosis.** A throwaway script
   (`apps/organising-db/test-results/wp1.3-rowclick-diag.mjs`, git-ignored) drove the preview
   through four scenarios, inspecting the first `table tbody tr` at the moment it became visible:
   whether a React `onClick` was attached, its `.overflow-x-auto` ancestor, the element under
   its centre, and the URL trail after the click.

   | Scenario | onClick attached | element at centre | after click |
   |---|---|---|---|
   | storage state, `goto /campaigns` (phase 0's path) | yes | ratings-bar span | `/campaigns/1?tab=workforce&sub=wall-chart` at 4.6 s |
   | storage state, `goto /` (gate hop) | **no** | `img.object-contain` | stays `/campaigns` |
   | form login, click as soon as visible (test A's path) | **no** | `img.object-contain` | stays `/campaigns` |
   | form login, 3 s settle, then click | yes | ratings-bar span | `/campaigns/1?tab=…` at 1.7 s |

   The row the failing click hit is the **DataTable's loading row** (`data-table.tsx:290`, a
   `TableRow` holding the `EurekaLoadingSpinner` image), not the dashboard's per-campaign row
   that phase 0 clicked. Arriving from the gate is a soft navigation, so `/campaigns` renders
   while its campaigns query is still in flight: the dashboard (`!isLoading && user`) is not
   mounted yet and the DataTable renders its spinner row — a visible `tbody tr` with no handler.
   Phase 0's full reload never met it because the page arrived with auth still loading. So:
   not hydration, not `isMobile` (Desktop Chrome, `<table>` confirmed), not a nested link or
   a `stopPropagation` cell, and not the gate undoing a navigation (no `framenavigated` at all).
   The product is not broken for a real user — the placeholder is transient and the row click
   navigates once the list has loaded (scenario 4). **Spec fix only:** the full-mode branch now
   locates `table tbody tr` that `has` an `a[href*="sub=wall-chart"]` — the dashboard row's
   first cell carries that link and neither placeholder row can — and clicks the row as before.
3b. **Mode oracle.** With the admin storage state present (`hasE2EAdminCredentials`), test A
   reads the account's `role`, `work_role` and `workspace_prefs` from `GET /api/admin/users` and
   the org defaults from `GET /api/admin/workspace-defaults`, resolves the mode with the
   product's own `resolveWorkspace()` (pure, imported via the `@/` alias — Playwright honours
   `tsconfig.json` paths), counts "my" campaigns through the REST config global setup captured
   (`restClientFor` + `groupMyCampaigns`, the hook's own owner-or-roster rule, `is_sms_episode`
   filtered as the hook does), and asserts: full → `/campaigns`; organiser with one → `/campaigns/<id>`;
   organiser with several (or none) → `/my-campaigns`. If the REST config is missing the organiser
   case accepts either organiser branch; without the admin state the oracle is skipped. The read
   happens before `t0`, so it is outside the 10 s budget.

**Advisory**

4. `my-campaigns/page.tsx` — the last-activity RPC now receives `mine` plus at most
   `MAX_TEAM_ROWS` (12) team ids, the rows the team row can render.
5. `needs-attention-list.tsx` — the probe calls `useRoleCheckCount(id, { retry: 1 })`; the hook
   gained an optional `{ retry }` and `RoleCheckTab`'s own query is unchanged.
6. One path constant: `landing.ts` owns `MY_CAMPAIGNS_PATH` (pure — a type import only) and
   `nav-model.ts` re-exports it as `MY_CAMPAIGNS_HREF`, so the nav suites are untouched and
   `nav-model.ts` stays free of React and `next/*`.
7. "Your account is not linked to an organiser record yet…" on `/my-campaigns` is reused
   verbatim from `campaigns/page.tsx:354` (the same unlinked-profile case). Left as is.

**Gates** (from `apps/organising-db`, 2026-09-09):

- `pnpm exec eslint <the ten touched files>` — exit 0, no findings
- `pnpm test` — 70 files, 936 tests passed (932 + the four L5 cases)
- `pnpm exec tsc --noEmit -p tsconfig.json` — clean
- `pnpm build` — compiled (`✓ Compiled successfully in 2.2min`), 130 static pages, `ƒ /my-campaigns` registered, exit 0
- `env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD -u E2E_ADMIN_EMAIL -u E2E_ADMIN_PASSWORD pnpm e2e`
  — 10 skipped, exit 0
- `E2E_BASE_URL=https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app pnpm e2e
  tests/e2e/wall-chart.spec.ts`, twice, credentials from the shell profile:
  - run 1: test A 14.6 s, test B 20.7 s — `2 passed (50.1s)`
  - run 2: test A 12.0 s, test B 10.2 s — `2 passed (1.4m)`

  (Test durations include the oracle read and Playwright's own waits; the in-test 10 s budget
  assertion from the submit passed in both.)

**What the runs prove.** The preview is built at `ba0b490`, so it carries none of this round's
product code. Both runs therefore prove items 2, 3 and 3b — the spec fixes — against the
account in **full mode** (the oracle resolved `full` and required `/campaigns`; the fixed locator
found the dashboard row and the click navigated). They do **not** exercise item 1's gate change:
in full mode the premature decision and the correct one land on the same `/campaigns`. Item 1 is
covered by the L5 unit cases and by tsc/build; the organiser-mode landing after a form login is
for the next preview (built from this round) — the §6 hand-off step 5 note about flipping the
account applies, and after the flip the oracle will require `/campaigns/<id>` for this
one-campaign account.

**Commits:** `8a617cf` (the code, all items above) and this documentation commit.

## 7. Verification output

Verifier run 2026-09-09 at a5f3197; migration applied to dev; preview https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app

### 1. project-ref and migration validation

```
$ cat supabase/.temp/project-ref
dpnnmkhabysfdogllsyh

$ pnpm validate:migrations
> offshore-alliance-monorepo@ validate:migrations
> node scripts/validate-supabase-migrations.mjs
Validated 7 Supabase migrations with unique 14-digit versions.
```

Green. project-ref confirmed dev before any CLI command; 7 migrations validated.

### 2. Migration list, dry-run, push

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 | 20260909100000 | 2026-09-09 10:00:00
   20260909120000 | 20260909120000 | 2026-09-09 12:00:00
   20260909130000 | 20260909130000 | 2026-09-09 13:00:00
   20260910090000 |                | 2026-09-10 09:00:00

$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push --dry-run
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260910090000_campaign_last_activity.sql
Finished supabase db push.

$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push
Do you want to push these migrations to the remote database?
 • 20260910090000_campaign_last_activity.sql
Applying migration 20260910090000_campaign_last_activity.sql...
Finished supabase db push.

$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 | 20260909100000 | 2026-09-09 10:00:00
   20260909120000 | 20260909120000 | 2026-09-09 12:00:00
   20260909130000 | 20260909130000 | 2026-09-09 13:00:00
   20260910090000 | 20260910090000 | 2026-09-10 09:00:00
```

Green. Before the push: 6 applied remote, `20260910090000` local-only, as expected. Dry-run named exactly that one file. Push applied cleanly, no password prompt at any point. After the push: all 7 local versions show a matching remote version.

### 3. Function shape, grants, and an invoker-role probe

```sql
select proname, prosecdef, provolatile from pg_proc where proname = 'campaign_last_activity';
→ [{"proname":"campaign_last_activity","prosecdef":false,"provolatile":"s"}]
```

`prosecdef = false` (SECURITY INVOKER, not DEFINER), `provolatile = 's'` (STABLE) — both as expected.

```sql
select grantee, privilege_type from information_schema.routine_privileges where routine_name='campaign_last_activity';
→ [{"grantee":"service_role","privilege_type":"EXECUTE"},
   {"grantee":"authenticated","privilege_type":"EXECUTE"},
   {"grantee":"postgres","privilege_type":"EXECUTE"}]
```

`authenticated` and `service_role` both hold EXECUTE (`postgres` is the owner); `anon` is absent, as expected.

Rolled-back invoker-role probe, one call, `BEGIN … ROLLBACK`:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f7c048e2-ecfe-4e9c-8715-7f4c899f0d37","role":"authenticated"}';
SELECT * FROM public.campaign_last_activity(ARRAY[1]);
ROLLBACK;
→ [{"campaign_id":1,"last_activity_at":"2026-06-05 06:52:57.550996+00","last_activity_kind":"rating"}]
```

Green. The function is callable as `authenticated` for campaign 1 and returns a real row (kind `rating`), consistent with the desktop screenshot's "Last activity: Rating 05 Jun 2026" in §9 below. Transaction rolled back — no state left behind.

### 4. Type regeneration

```
$ SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types
> offshore-alliance-monorepo@ gen:types
> supabase gen types typescript --project-id ${SUPABASE_PROJECT_REF:-gteygwfgjvczanmrwgbr} > packages/db-types/generated.ts

$ git diff --stat packages/db-types/generated.ts
 packages/db-types/generated.ts | 8 ++++++++
 1 file changed, 8 insertions(+)

$ git diff packages/db-types/generated.ts | grep -n "campaign_last_activity"
9:+      campaign_last_activity: {
```

Green. `campaign_last_activity` appears under `Functions` in the regenerated types, an 8-line pure addition. Committed alone: **a5f3197** — "chore(oux-wp1.3): regenerate database types from dev".

### 5. tsc, tests, lint, build (from `apps/organising-db`)

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0

$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  70 passed (70)
      Tests  932 passed (932)

$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)

$ pnpm build 2>&1 | tail
├ ƒ /my-campaigns
...
ƒ Proxy (Middleware)
ƒ  (Dynamic)  server-rendered on demand
```

Green on all four. tsc clean; 70 files / 932 tests passed (matches the implementer's gate numbers); lint at the exact baseline 294/143/151 (no new problems); build compiled cleanly with `ƒ /my-campaigns` registered as a route, no errors in the build log.

### 6. Prefs before

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs":{}}]
```

Green. `{}` as expected, before any e2e run.

### 7. Preview deployment

```
$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=ba0b490ef238952d9a5144e22ae9d5cfbe11bd62&per_page=3"
→ one deployment, id 6347214371, environment "Preview"

$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6347214371/statuses"
→ state "success", target_url "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app"
```

Green. The deployment for `ba0b490` was already built and marked `success` on first poll — no 15-minute wait needed. Preview URL: **https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app**

### 8. Credentialled e2e, full suite, both projects

```
$ cd apps/organising-db
$ E2E_FOREIGN_CAMPAIGN_ID=3 E2E_BASE_URL=<preview> pnpm e2e
Running 10 tests using 1 worker

  ✓ 1 [chromium] actions-hub.spec.ts › open /actions, see the three start cards and the status buckets (7.2s)
  ✓ 2 [chromium] actions-hub.spec.ts › /sms still works and lands on the hub with its params intact (3.5s)
  - 3 [chromium] mobile-dialer.spec.ts › Mobile dialer — happy path (skipped, no volunteer creds)
  ✓ 4 [chromium] organiser-nav.spec.ts › the ten rows, in order, with no organiser-mode furniture (3.4s)
  ✓ 5 [chromium] organiser-nav.spec.ts › organiser mode shows four primary items, Organisation and Show everything (15.0s)
  ✓ 6 [chromium] roles/unit-lifecycle-user.spec.ts › creates a campaign, then creates, renames and deletes a unit and the campaign (12.6s)
  ✓ 7 [chromium] roles/unit-lifecycle-user.spec.ts › offers no write controls on a campaign the account cannot write to (4.4s)
  ✘ 8 [chromium] wall-chart.spec.ts:61 › Wall chart — flow one, from the login submit › sign in and reach a wall chart in under ten seconds (30.6s)
  ✓ 9 [chromium] wall-chart.spec.ts:103 › My campaigns › lists my campaigns and opens the wall chart (9.3s)
  ✓ 10 [chromium-admin] roles/unit-lifecycle-admin.spec.ts › creates, renames and deletes a unit on any campaign (8.2s)

  1) wall-chart.spec.ts:61 › sign in and reach a wall chart in under ten seconds
     Test timeout of 30000ms exceeded.
     Error: expect(page).toHaveURL(expected) failed
     Expected pattern: /\/campaigns\/\d+(\?.*tab=workforce.*sub=wall-chart)?/
     Received string:  "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/campaigns"
     Call log: - Expect "toHaveURL" with timeout 30000ms
         29 × unexpected value "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/campaigns"
       at tests/e2e/wall-chart.spec.ts:89:24

  1 failed, 1 skipped, 8 passed (2.0m)
```

**Red — test A ("flow one") fails, reproducibly.** The account resolved to full mode (`/campaigns`, not `/my-campaigns` or `/campaigns/{id}` — the operator has not flipped it to organiser mode for this run). The full-mode branch of the test asserts a campaign row is visible on `/campaigns` (it is — `error-context.md` shows one row, "testco1", with an `<a href="/campaigns/1?tab=workforce&sub=wall-chart">` link inside a `cursor:pointer` `<tr>`), clicks `rows.first()`, then waits up to 30 s for the URL to change. It never changes; the page stays at `/campaigns`. Re-ran the single test in isolation to rule out a fleet flake:

```
$ pnpm exec playwright test tests/e2e/wall-chart.spec.ts -g "sign in and reach a wall chart"
✘ 1 [chromium] sign in and reach a wall chart in under ten seconds (30.1s)
  Received string: ".../campaigns" (30 × unexpected value)
```

Same failure, same received URL, on a clean second run — not a flake. Test A's full-mode branch (`rows.first().click()` on the `<tr>`, `wall-chart.spec.ts:83`) does not navigate on this preview; the row is visibly clickable and contains a working `<a href>` per the DOM snapshot, but the click on the row element does not trigger the navigation the test expects. This is a regression relative to the acceptance criterion ("e2e flow one passes … in under ten seconds") and blocks that criterion; it is reported without further diagnosis or fix, per the verifier's scope.

Test B ("My campaigns lists my campaigns and opens the wall chart") **passed** — the same "click the card's Open wall chart link, land on `/campaigns/{id}?...tab=workforce...sub=wall-chart`" round trip that test A's *organiser-mode* branches would exercise. Test C (the Overview round trip, appended to test B) also passed. The WP1.2 organiser round trip (`organiser-nav.spec.ts`, test 5) passed, including its own PATCH-based mode flip and reset. All other non-skipped specs passed (9 of 10; 1 skipped for missing volunteer creds, expected).

Post-run checks:

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs":{}}]

select campaign_id, name from campaigns where name like 'WP1.6%';
→ []
```

Both green: prefs are `{}` after the run (the organiser-nav spec's own reset held), and no leftover `WP1.6…` campaigns from the role-lifecycle specs' cleanup.

### 9. Landing evidence

A throwaway script (`apps/organising-db/test-results/wp1.3-landing-evidence.mjs`, git-ignored, not committed) drove the three landing scenarios using the storage states `global-setup` already wrote (`tests/e2e/.auth/user.json`, `tests/e2e/.auth/admin.json`) and the same admin `PATCH /api/admin/update-user` body the WP1.2 spec uses.

```json
{
  "fullModeUrl": "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/campaigns",
  "setOrganiserModeOk": true,
  "organiserModeLandingUrl": "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/campaigns/1?tab=workforce&sub=wall-chart",
  "desktopShotUrl": "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/my-campaigns",
  "mobileShotUrl": "https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app/my-campaigns",
  "resetOk": true,
  "workspacePrefsAfterReset": {}
}
```

- **(a) Full mode, `goto /`:** settled at `/campaigns`. Expected, matches landing.ts L1.
- **(b) Organiser mode (after the admin PATCH), `goto /`:** settled at `/campaigns/1?tab=workforce&sub=wall-chart` — **not** `/my-campaigns`. Per the `?from=landing` rule (L4/§2.1.4): the e2e account owns exactly one dev campaign, so the neutral gate at `/` applied `shouldAutoOpenSingleCampaign` and sent it straight to the chart rather than to `/my-campaigns`. This is the documented behaviour for a single-campaign organiser, not a defect — it is the same branch test A's organiser-mode path (untested above, since the account was in full mode for the e2e run) would take.
- `/my-campaigns` desktop screenshot (1280×800): saved to `/tmp/oux-plans/shots/wp1.3-my-campaigns.png`. Shows one card ("testco1", `bargaining` / `active` pills), the four numbers (95 People, 95 In a unit, 61 Rated, 10 Leaders), the rating-distribution bar, "Last activity: Rating 05 Jun 2026", an "Open wall chart" link, a "Needs attention" section ("5 leaders to check — testco1"), "See all campaigns", and a "New campaign" button. Matches the expected content exactly.
- iPhone-13 emulation screenshot: saved to `/tmp/oux-plans/shots/wp1.3-my-campaigns-mobile.png` (1170×1992). Same card content, reflowed for mobile; nothing clipped or missing.
- Prefs reset to `{}` via the admin API (script's own `resetOk: true`), confirmed independently by SQL:

```sql
select workspace_prefs from user_profiles where user_id = 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37';
→ [{"workspace_prefs":{}}]
```

Green.

### Summary table

| Step | Result | Key values |
|---|---|---|
| 1. project-ref / validate:migrations | 🟢 green | dev ref confirmed; 7 migrations validated |
| 2. migration list / dry-run / push | 🟢 green | 6→7 applied remote; dry-run named exactly `20260910090000_campaign_last_activity.sql` |
| 3. function shape / grants / invoker probe | 🟢 green | `prosecdef=false`, `provolatile=s`; grants `authenticated`+`service_role` only; probe row for campaign 1, kind `rating` |
| 4. type regeneration | 🟢 green | +8 lines, `campaign_last_activity` present; committed **a5f3197** |
| 5. tsc / test / lint / build | 🟢 green | tsc 0; 70 files/932 tests passed; lint 294/143/151 (baseline); build ok, `/my-campaigns` registered |
| 6. prefs before | 🟢 green | `{}` |
| 7. preview deployment | 🟢 green | `success`, https://offshore-alliance-42qbtrjx4-reveille-strategy.vercel.app |
| 8. e2e full suite | 🔴 **red** | 8 passed, 1 failed (test A, "flow one", full-mode branch — row click does not navigate; reproduced on a clean re-run), 1 skipped; test B/C, WP1.2 organiser round trip, and both role-coverage specs all passed; prefs and cleanup both verified after |
| 9. landing evidence | 🟢 green | full mode → `/campaigns`; organiser mode (1 campaign) → `/campaigns/1?tab=workforce&sub=wall-chart` per `?from=landing`/L4; both screenshots captured with full expected content; prefs reset to `{}` and confirmed by SQL |

**Commits this run:** `a5f3197` (types), and this documentation commit (below).

## 8. Reviewer findings

_(reviewer)_
