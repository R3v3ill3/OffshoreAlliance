# WP1.5 — Actions hub

Planner output. Repository `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance`, app `apps/organising-db`.
Branch checked out: `feat/oux-wp1.1-workspace-mode` (content identical to merged `develop`). Every path below is relative to `apps/organising-db/` unless it starts with `supabase/` or `docs/`.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP1.5 Actions hub.** Standard implementer. Generalise the SMS hub (`src/components/sms/hub/*`, `src/lib/sms/hub-actions.ts`) to list email sends and call lists alongside SMS actions, my actions by default with All, status buckets, scope column; "Start something" cards for SMS, email and calls; the campaigns-page strip removed. Acceptance: every standalone entry point that exists today (appendix D 9 item 4) has a counterpart in the hub; pure helpers for row shaping and status buckets have tests. Depends on WP1.2; independent of WP1.3 and WP1.4.

### 1.2 Decisions consumed (`docs/organiser-ux-review/DECISIONS.md`, "Answers")

- **Decision 10 — Confirmed.** "Actions hub, one container mechanism, one-way Link to campaign with 'New campaign from this action'." The register's Blocks column says WP3.5/WP3.6 consume the container and linking; **"WP1.5 builds the hub UI and is not blocked"**. So this package builds the hub and *only* the hub. No `container_kind`, no Link to campaign, no "New campaign from this action".
- **Decision 7 — Amended.** "**No creation path is retired.** Visibility and prominence are reduced instead. … every old URL still works and is reachable from a documented location." This overrides the work-package phrase "the campaigns-page strip removed": the strip's four controls are **demoted, not deleted**, and §6 below gives the surviving destination for each with a proof-of-reachability table.
- **Decision 8 — Confirmed, with a note.** "A `user`-role organiser must be able to create campaigns and actions with themselves assigned." The hub's "Mine" filter therefore keys off `created_by = auth.uid()`, which is the column `can_write_to_campaign()` already honours, not off `campaigns.organiser_id`.
- **Decision 1 — Confirmed.** Plan 5.2's module table puts **Actions** on by default for organisers ("SMS blasts, chat boards, surveys and relays; email sends; call lists and sessions; task lists and the leader webform; standalone or campaign-linked"). WP1.2 owns the sidebar; §5 states the one line WP1.2 must add.
- **Plan 3.6 terminology.** "An action outside any campaign | standalone, org-wide, episode, standing campaign | **Standalone**". §7 lists the string replacements.

### 1.3 Standing constraints (planner preamble + `PROGRESS.md`)

- No production database access (`gteygwfgjvczanmrwgbr`). Dev is `dpnnmkhabysfdogllsyh`. **No migration and no type regen is needed in this package** (§2.1 proves it: every column read already exists in `supabase/migrations/20260908050000_baseline_schema.sql` and every table already has a permissive `SELECT` policy).
- Nothing is removed from the product; it is relocated. Full mode keeps working. No new campaign-creation path.
- No view state in `localStorage` — filters live in the URL (`?mine=`, `?bucket=`, `?kind=`, `?scope=`), exactly as `SmsHubPage.tsx:58,175-184` already does for `?scope=`.
- Lint budget: touched files lint clean on their changed lines; total error count must not rise above the 143/151 baseline.
- Verification from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`. Preview-based `pnpm e2e` with operator-supplied `E2E_USER_*`.

---

## 2. Plan

### 2.1 Data model of a hub row

#### 2.1.1 What an SMS "action" row is today

`src/app/api/sms/activity/route.ts` is the only SMS source. It is one server route that reads three tables and shapes them into one `SmsActivityRow` union discriminated by `kind`:

| Field | Where it comes from | route.ts line |
|---|---|---|
| `kind: 'blast'\|'chat'\|'survey'\|'relay'` | `sms_lists.mode` (`'p2p'` → `chat`, else `blast`); table identity for survey/relay | `329` |
| `id` | `sms_lists.list_id` / `sms_surveys.survey_id` / `sms_relays.relay_id` | `331`, `351`, `367` |
| `name` | `sms_lists.name` / `sms_surveys.title` / `sms_relays.name`, with a fallback | `333`, `353`, `369` |
| `status` | raw `status` column of each table | `334`, `354`, `370` |
| `campaign_id`, `campaign_name`, `scope`, `is_standalone` | `describeCampaign()` — joins `campaigns.is_sms_episode`; an episode campaign becomes `scope:'standalone'` with `campaign_name: null`; `campaign_id IS NULL` on a relay becomes `scope:'org'` | `300-316` |
| `audience_count` | `sms_lists.total_items`; survey = count of `sms_survey_sessions`; relay = count of `sms_relay_targets` | `337`, `357`, `373` |
| `progress_count` | `sms_lists.sent_items + delivered_items`; survey = sessions with `state='completed'`; relay = active targets | `338`, `358`, `374` |
| `created_at`, `updated_at` | the tables' own columns | `336`, `355-356`, `371-372` |
| `sender_number_id/phone/label` | `describeNumber()` over `sms_numbers` | `317-324` |
| `archived_at` | `*.archived_at` | `342`, `361`, `376` |

Fetching: `src/lib/hooks/useSmsHub.ts:25-51` (`useSmsActivity`) issues one React Query against that route, polling every 15 s while any blast or survey is `queued`/`sending` (`useSmsHub.ts:42-49`). The hub concatenates the four arrays at `SmsHubPage.tsx:66-74` and filters by scope at `76-83`.

Status bucketing and hrefs are already pure, in `src/lib/sms/hub-actions.ts`: `smsActionStatusGroup()` (`79-103`), `smsActionStatusLabel()` (`106-114`), `smsActionHref()` (`145-152`), `smsActionCampaignHref()` (`179-192`), with tests in `src/lib/sms/__tests__/hub-actions.test.ts`.

#### 2.1.2 Equivalent sources for email sends

There is **no cross-campaign email endpoint today**. The only email-list route is campaign-scoped: `src/app/api/campaigns/[id]/email-lists/route.ts:28-33` (`.eq('campaign_id', cid)`).

Baseline columns, `supabase/migrations/20260908050000_baseline_schema.sql`:

- `email_lists` at **11395-11414**: `list_id` (11396), `campaign_id integer NOT NULL` (11397) — this is the "`email_lists.campaign_id` NOT NULL" fact from plan 3.9 (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:153`), `draft_id` (11398), `name` (11399), `status` (11401) with `CHECK … draft|active|queued|sending|sent|completed|paused|cancelled` (11414), `total_items` (11404), `sent_items` (11405), `created_by uuid` (11406), `created_at`/`updated_at` (11407-11408), `scheduled_for` (11411), `delivered_items` (11412), `failed_items` (11413).
- `campaign_comms_drafts` at **11-column block starting `campaign_comms_drafts`** in the same file: `draft_id`, `campaign_id NOT NULL`, `platform` with `CHECK … email|sms|phone_script`, `title`, `subject`, `status` with `CHECK … generating|draft|approved|sent|failed`, `email_list_id`, `created_by uuid`, `created_at`, `updated_at`. A draft that already owns a list carries `email_list_id`, so listing both tables unfiltered would double-count. **Rule: an email row is (a) every `email_lists` row, plus (b) every `campaign_comms_drafts` row with `platform='email' AND email_list_id IS NULL`** — the un-listed drafts, which is exactly what an organiser calls "an email I started".
- Opening one: `/campaigns/{campaign_id}/email/wizard?draft_id={draft_id}` is the canonical deep link (`src/components/email/orchestrator/EmailResumeBanner.tsx:104,117,124`; `src/app/api/campaigns/[id]/worker-lists/[listId]/fire/email/route.ts:188`). For an `email_lists` row with `draft_id = NULL` there is no wizard target, so the row links to `/campaigns/{id}?tab=outreach&sub=comms` (the Comms sub-tab; `src/lib/campaign-tabs.ts:96` maps legacy `comms` → `{tab:'outreach', sub:'comms'}`).
- **The legacy Email wizard leaves no in-app record.** `docs/ORGANISER_UX_REVIEW_AND_PLAN.md:154`: it "pushes an audience … to Action Network and leaves no in-app send record; the resume banner deliberately ignores such drafts." Nothing to list. The hub says so in copy (§4) rather than pretending.

#### 2.1.3 Equivalent source for call lists

Also campaign-scoped only today: `src/app/api/calls/lists/route.ts:14-17` **requires** `campaign_id` (400 without it); `src/app/api/campaigns/[id]/call-lists/route.ts` is the per-campaign variant.

`call_lists` baseline **8219-8235**: `list_id` (8220), `campaign_id integer NOT NULL` (8221), `script_id` (8222), `name` (8223), `status` (8225) with `CHECK … draft|active|completed|paused` (8234), `priority_strategy` (8227), `total_items` (8228), `completed_items` (8229), `created_by uuid` (8230), `created_at`/`updated_at` (8231-8232), `section_plan_id` (8233).

Standalone call lists are filed under the shared standing campaign: `campaigns.is_standing boolean NOT NULL DEFAULT false` at baseline **9674**, commented at **9710** ("a shared container for phone operations not belonging to a specific active campaign"). `PhoneWizardSteps.tsx:361-373` is the code that files them there when no `?campaign_id=` is supplied. So **a `call_lists` row whose campaign `is_standing` is `true` is Standalone**, and every other row is campaign-scoped.

Results without extra queries: `total_items` / `completed_items` are maintained on the row, so no `call_attempts` aggregation is needed. Sessions (`call_attempts`, baseline 8135) are deliberately **not** read — one row per list is the hub's grain, and `completed_items` already summarises them.

Opening one: `/campaigns/{campaign_id}/phone/lists/{list_id}` (`src/app/(dashboard)/campaigns/[id]/phone/page.tsx:338,345`).

#### 2.1.4 The `HubActionRow` union — new file `src/lib/actions/hub-rows.ts`

New directory `src/lib/actions/` (cross-kind; `src/lib/sms/` stays SMS-only). Pure — no React, no Supabase client, no `next/*` imports — so vitest can exercise it directly.

```ts
export type HubActionKind =
  | 'sms_blast' | 'sms_chat' | 'sms_survey' | 'sms_relay'
  | 'email_send' | 'call_list'

export type HubActionBucket = 'live' | 'drafts_paused' | 'finished' | 'archived'

export type HubActionScope =
  | { kind: 'campaign'; campaignId: number; name: string }
  | { kind: 'standalone' }

export interface HubActionRow {
  /** Stable across kinds; the table key and the `?open=` token. */
  key: string                 // `${kind}:${id}` e.g. "call_list:88"
  kind: HubActionKind
  name: string
  /** The raw source status, for the badge. */
  status: string
  /** Organiser-facing status word (chat boards say "active", not "draft"). */
  statusLabel: string
  bucket: HubActionBucket
  audienceSize: number
  /** Kind-specific one-liner: "212/240 messaged", "18/40 called", "3q · 12/50 completed". */
  results: string
  scope: HubActionScope
  owner: { userId: string | null; isMine: boolean; unknown: boolean }
  updatedAt: string           // ISO
  href: string
  /** Where it lives inside its campaign, when it has one; null for Standalone. */
  campaignHref: string | null
}
```

Deviations from the work package's field list, and why:

- **`bucket` has a fourth value, `archived`.** The SMS hub already ships an Archived chip driven by `archived_at` (`hub-actions.ts:84`, `SmsActionsTable.tsx:211`, `SmsHubPage.tsx:59-62,265-267`). Dropping it would be a behaviour change to SMS, which the acceptance criteria forbid. `email_lists`, `campaign_comms_drafts` and `call_lists` have **no** `archived_at` column, so their rows are never `archived`.
- **`scope` has no `org` variant.** Plan 3.6 collapses "org-wide" into **Standalone** (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:133`). An org-wide relay (`sms_relays.campaign_id IS NULL`) shapes to `{ kind: 'standalone' }`. The `?scope=org` **URL parameter** and the create wizard's `org` radio (`SmsScopePicker.tsx:37-41`) are untouched — only the hub's displayed word changes (§7).
- **`owner.unknown`.** `created_by` is nullable on all six sources (`sms_lists` 8-col block "created_by" uuid; `sms_surveys`; `sms_relays`; `email_lists:11406`; `call_lists:8230`; `campaign_comms_drafts`). Legacy rows have no owner. See §3.

Pure functions in the same file, each with tests:

```ts
export function bucketFor(kind: HubActionKind, status: string, archivedAt?: string | null): HubActionBucket
export function statusLabelFor(kind: HubActionKind, status: string, archivedAt?: string | null): string
export function shapeSmsRow(row: SmsActivityRow, ctx: ShapeCtx): HubActionRow
export function shapeEmailRow(row: EmailActivityRow, ctx: ShapeCtx): HubActionRow
export function shapeCallListRow(row: CallActivityRow, ctx: ShapeCtx): HubActionRow
export function sortHubRows(rows: HubActionRow[]): HubActionRow[]     // updatedAt desc
export function filterHubRows(rows, f: { mine: boolean; bucket: HubActionBucket|'all'; kind: HubActionKind|'all'; search: string }): HubActionRow[]
export function countBy(rows: HubActionRow[]): { byKind: Record<string, number>; byBucket: Record<string, number> }
export const ACTIONS_HUB_PATH = '/actions'
export const HUB_KIND_LABEL: Record<HubActionKind, string>
export const HUB_BUCKET_LABEL: Record<HubActionBucket, string>   // Live · Drafts & paused · Finished · Archived
```

`ShapeCtx = { currentUserId: string | null }`.

**`bucketFor` truth table** (each row cites the `CHECK` constraint that enumerates the statuses):

| kind | source status set (baseline line) | live | drafts_paused | finished |
|---|---|---|---|---|
| `sms_blast` | `sms_lists_status_check`: draft, queued, sending, sent, paused, cancelled | queued, sending | draft, paused | sent, cancelled |
| `sms_chat` | same set, but `draft` means "board open" (`hub-actions.ts:91-93`) | draft | — | everything else |
| `sms_survey` | `sms_surveys_status_check`: draft, open, paused, closed | open | draft, paused | closed |
| `sms_relay` | `sms_relays_status_check`: active, paused, ended | active | paused | ended |
| `email_send` (list) | `email_lists_status_check` (**11414**): draft, active, queued, sending, sent, completed, paused, cancelled | active, queued, sending | draft, paused | sent, completed, cancelled |
| `email_send` (draft, no list) | `campaign_comms_drafts_status_check`: generating, draft, approved, sent, failed | — | generating, draft, approved | sent, failed |
| `call_list` | `call_lists_status_check` (**8234**): draft, active, completed, paused | active | draft, paused | completed |

`archivedAt` non-null short-circuits to `archived` for the four SMS kinds, mirroring `hub-actions.ts:84`. The three SMS branches **delegate to the existing `smsActionStatusGroup`/`smsActionStatusLabel`** and map `pending` → `drafts_paused`, so the SMS behaviour has exactly one definition and cannot drift.

`results` strings (kind-specific summary):

| kind | string | source |
|---|---|---|
| `sms_blast`, `sms_chat` | `` `${progress}/${audience} messaged` `` | unchanged from `SmsActionsTable.tsx:84` |
| `sms_survey` | `` `${questions}q · ${progress}/${audience} completed` `` | `SmsActionsTable.tsx:80` |
| `sms_relay` | `` `${progress}/${audience} target(s) active` `` | `SmsActionsTable.tsx:82` |
| `email_send` (list) | `` `${delivered}/${total} delivered` `` + `` ` · ${failed} failed` `` when `failed_items > 0` | `email_lists.delivered_items/total_items/failed_items` (11412, 11404, 11413) |
| `email_send` (draft) | `'Not sent yet'` | no list attached |
| `call_list` | `` `${completed}/${total} called` `` | `call_lists.completed_items/total_items` (8229, 8228) |

`href` per kind:

| kind | href | proof |
|---|---|---|
| `sms_*` | `smsActionHref(ref)` — `/actions?open=<ref>`, chats `/campaigns/{c}/sms/chat/{id}` | `hub-actions.ts:145-152` (base path changed in §5) |
| `email_send` with `draft_id` | `/campaigns/{c}/email/wizard?draft_id={d}` | `EmailResumeBanner.tsx:104` |
| `email_send` without `draft_id` | `/campaigns/{c}?tab=outreach&sub=comms` | `campaign-tabs.ts:96` |
| `call_list` | `/campaigns/{c}/phone/lists/{id}` | `phone/page.tsx:338` |

`campaignHref` reuses `smsActionCampaignHref()` (`hub-actions.ts:179-192`) for SMS kinds and is the same value as `href` for email/calls when scope is `campaign`, `null` when Standalone.

**Scope resolution** is one pure helper so all three shapers agree:

```ts
export function scopeFor(
  campaignId: number | null,
  campaign: { name: string | null; is_sms_episode: boolean; is_standing: boolean } | undefined,
): HubActionScope
```

Returns `{ kind: 'standalone' }` when `campaignId == null` (org-wide relay), when `is_sms_episode` (baseline **9675**, comment **9714**) or when `is_standing` (baseline **9674**, comment **9710**); otherwise `{ kind: 'campaign', campaignId, name: campaign?.name ?? 'Campaign' }`.

Tests: **new file `src/lib/actions/__tests__/hub-rows.test.ts`**, following the existing pattern of `src/lib/sms/__tests__/hub-actions.test.ts`.

Cases:
1. `bucketFor` — every status in every `CHECK` constraint above, all six kinds, plus `archivedAt` short-circuit and an unknown status falling to `finished` (never crash on data drift).
2. `bucketFor` SMS parity — for all four SMS kinds and all their statuses, `bucketFor` equals `smsActionStatusGroup` with `pending` renamed. This is the regression pin the risk register asks for.
3. `shapeEmailRow` — a queued list, a paused list, a sent list with failures, a list on the standing campaign is **not** Standalone (email has no standing convention; only `is_sms_episode` and `is_standing` do, and email never uses either — assert it maps to `campaign`), a draft with no list, campaign name propagated, `href` for both draft/no-draft cases.
4. `shapeCallListRow` — a list on a `is_standing` campaign → `{kind:'standalone'}`; a list on an ordinary campaign → campaign name; `results` string; `href`.
5. `shapeSmsRow` — an episode campaign → `{kind:'standalone'}`; an org-wide relay (`campaign_id: null`) → `{kind:'standalone'}` (the terminology change, pinned); a real campaign → its name; survey `results` keeps the `Nq · ` prefix.
6. `owner` — `created_by === currentUserId` → `isMine`; `created_by === null` → `unknown: true, isMine: false`; `currentUserId === null` → nothing is mine and nothing is `unknown`-flagged as an error.
7. `sortHubRows` — mixed kinds interleave strictly by `updatedAt` desc; stable for equal timestamps (tie-break on `key`).
8. `filterHubRows` / `countBy` — mine, bucket, kind and free-text search over name + campaign name; counts are computed **before** the bucket filter and **after** the mine filter, so the chip numbers describe what the chip would show.

### 2.2 Fetching

Three React Queries, merged client-side. Rationale: `useSmsActivity` (`useSmsHub.ts:25-51`) already exists, is polled, and is shared with the campaign SMS panels via `SMS_ACTIVITY_QUERY_KEY` (`useSmsHub.ts:22`); wrapping it in a new combined route would change its cache key and its poll semantics — an SMS regression for no gain.

**Change to an existing route (additive only): `src/app/api/sms/activity/route.ts`**

- `29-59` — add `created_by: string | null` to `SmsActivityRow`.
- `100` — add `created_by` to the `sms_lists` select list.
- `110` — add `created_by` to the `sms_surveys` select list.
- `119` — add `created_by` to the `sms_relays` select list.
- `139-174` — add `created_by: string | null` to the three local row casts.
- `330-345`, `350-364`, `366-379` — pass `created_by` through onto the emitted rows.

No new queries, no new joins, no changed filters, no changed limits. `LIMIT` stays 200 per kind (`route.ts:25`).

**New route `src/app/api/email/activity/route.ts`** — modelled line-for-line on `sms/activity/route.ts`:

```
GET /api/email/activity        → { lists: EmailActivityRow[], drafts: EmailActivityRow[] }
GET /api/email/activity?campaign_id=N   → narrowed (for later reuse; the hub does not send it)
```

1. `createClient()` + `auth.getUser()`, 401 when absent (`sms/activity/route.ts:85-89`).
2. `email_lists` select `list_id, campaign_id, draft_id, name, status, total_items, sent_items, delivered_items, failed_items, created_by, created_at, updated_at`, `.order('updated_at', {ascending:false}).limit(200)`.
3. `campaign_comms_drafts` select `draft_id, campaign_id, platform, title, subject, status, email_list_id, created_by, created_at, updated_at`, `.eq('platform','email').is('email_list_id', null).order('updated_at',{ascending:false}).limit(200)`.
4. One batched `campaigns` read for the union of `campaign_id`s: `select('campaign_id, name, is_sms_episode, is_standing').in('campaign_id', ids)` — the same single-read pattern as `sms/activity/route.ts:215-220`.
5. Emit rows carrying `campaign: {name, is_sms_episode, is_standing}` so `scopeFor` can run purely on the client.

**New route `src/app/api/calls/activity/route.ts`** — same shape:

```
GET /api/calls/activity → { lists: CallActivityRow[] }
```

`call_lists` select `list_id, campaign_id, script_id, name, status, total_items, completed_items, created_by, created_at, updated_at`, `.order('updated_at',{ascending:false}).limit(200)`, plus the same batched `campaigns` read. Deliberately **not** selecting `*` and the two nested relations the existing `/api/calls/lists` route pulls (`src/app/api/calls/lists/route.ts:24`) — the hub needs neither `call_list_scripts` nor `call_scripts`, and the narrower select is what keeps the cross-campaign read cheap.

**RLS: no migration needed.** `supabase/migrations/20260908050000_baseline_schema.sql`:
- `26697` — `CREATE POLICY "Authenticated read call_lists" ON "public"."call_lists" FOR SELECT TO "authenticated" USING (true);`
- `26769` — `CREATE POLICY "Authenticated read email_lists" … USING (true);`
- `26833` — `CREATE POLICY "Authenticated read sms_lists" … USING (true);`

Cross-campaign reads already work for any authenticated user, and the hub is read-only. Writes are unchanged and still gated by `can_write_to_campaign()` (`27319`, `27383`, `27462`, `27504`, `27601`, `27677`). WP1.6 owns tightening reads; this package must not pre-empt it.

**New hook file `src/lib/hooks/useActionsHub.ts`**

```ts
export const EMAIL_ACTIVITY_QUERY_KEY = ['email-activity'] as const
export const CALL_ACTIVITY_QUERY_KEY  = ['call-activity']  as const
export function useEmailActivity()   // staleTime 30_000, no poll
export function useCallActivity()    // staleTime 30_000, no poll
export function useHubActionRows(opts: { showArchived: boolean }): {
  rows: HubActionRow[]; isLoading: boolean; isError: boolean; archivedTotal: number
}
```

`useHubActionRows` calls `useSmsActivity(undefined, {archived: …})` (unchanged signature), `useEmailActivity()`, `useCallActivity()`, reads `user.id` from `useAuth()` (`src/lib/supabase/auth-context.tsx:31,376`), maps every source array through the matching shaper, concatenates and `sortHubRows`. `isLoading` is true while any query is loading; **a failing email or calls query does not blank the SMS rows** — it sets a per-kind error the page renders as an inline "Call lists could not be loaded. Retry." strip. `fetchApi` (`src/lib/api/fetch-api.ts:44`) is used for both new routes, matching `useSmsHub.ts:38`.

**Filter state, all in the URL** (no `localStorage`):

| param | values | default |
|---|---|---|
| `mine` | `1` \| `0` | `1` — **my actions by default** |
| `bucket` | `live` \| `drafts_paused` \| `finished` \| `archived` \| absent (= All) | absent |
| `kind` | any `HubActionKind` \| absent (= All) | absent |
| `scope` | `standalone` \| `<campaignId>` \| absent | absent (parsed by the existing `parseScopeParam`, `hub-actions.ts:50-57`) |
| `q` | free text | absent |
| `open` | action ref | absent (existing deep-link contract, `hub-actions.ts:131-142`) |

Buckets render as a chip row **Live · Drafts & paused · Finished · Archived · All** with counts, reusing the `ChipRow` component already in `SmsActionsTable.tsx:408-439`. A second chip row filters kind: **All · Blasts · Chats · Surveys · Relays · Emails · Call lists**. A **Mine / All** two-chip toggle sits first. The scope column shows `scope.name` or the literal `Standalone`.

### 2.3 "Mine" vs "All"

**How the SMS hub scopes to the signed-in user today: it does not.** `SmsHubPage.tsx:60-83` fetches every row in the universe and filters only by `?scope=`. `/api/sms/activity` has no user predicate (`route.ts:96-128`). This package introduces the first per-user default.

**Owner column per source** — all six have `created_by uuid`, nullable:

| Source | column | baseline line | who writes it |
|---|---|---|---|
| `sms_lists` | `created_by` | in the `sms_lists` DDL block | SMS create paths |
| `sms_surveys` | `created_by` | in the `sms_surveys` DDL block | survey editor |
| `sms_relays` | `created_by` | in the `sms_relays` DDL block | relay editor |
| `email_lists` | `created_by` | **11406** | `POST /api/campaigns/[id]/email-lists` |
| `call_lists` | `created_by` | **8230** | `POST /api/calls/lists` — `src/app/api/calls/lists/route.ts:74` sets `created_by: user.id` |
| `campaign_comms_drafts` | `created_by` | in its DDL block | draft creation |

So **no source lacks an owner column** and no per-kind "fall back to All" is needed. What *is* needed is a rule for legacy rows where `created_by IS NULL`:

- A row with `created_by IS NULL` is **not** "mine". It carries `owner.unknown = true`.
- When Mine is active and `unknown` rows exist that would otherwise pass the filters, the table renders one muted line above it: **"N older actions have no recorded owner. Switch to All to see them."** with All as a link. Nothing becomes invisible without being announced — the rule the whole plan runs on.
- `owner.isMine` is computed against `useAuth().user.id`, i.e. `auth.uid()` — the same identity `can_write_to_campaign()` uses through `created_by` (decision 8's note). Deliberately **not** `campaigns.organiser_id`: that is campaign ownership, and appendix D §6 records it is "a client-side filter on the list page only" (`docs/organiser-ux-review/appendix-D-navigation-roles.md:301`). An organiser who ran an action inside somebody else's campaign should still see it under Mine.
- Filtering happens client-side on the shaped rows. The routes keep returning the universe (200/kind), so the Mine/All toggle is instant and the same cache serves both — and `/api/sms/activity` keeps its exact current response, which is what "no behaviour change for SMS" means.

### 2.4 "Start something" cards

New file `src/components/actions/hub/StartSomethingCards.tsx`. Three cards, leading with the job (the copy pattern established in `SmsActionKindPicker.tsx:29-64`).

| Card | Primary | Secondary | Proof the destination exists |
|---|---|---|---|
| **SMS** | `New SMS action` → `smsCreateHref({})` = `/sms/new` | the four kind links (`smsCreateHref({kind})`), unchanged from `SmsHubPage.tsx:232-250` | `hub-actions.ts:165-176`; `src/app/(dashboard)/sms/new/page.tsx` |
| **Email** | `Email from a campaign` → campaign picker dialog → `/campaigns/{id}/email/setup/order` | `Send without a campaign (Email wizard)` → `/campaigns/email-wizard` | `CreateEmailOrchestrator.tsx:28` builds exactly that href and **needs a campaign id**; `src/app/(dashboard)/campaigns/email-wizard/page.tsx:5-11` |
| **Calls** | `New call list` → `/campaigns/phone-wizard` | `Call list in a campaign` → campaign picker dialog → `/campaigns/{id}/phone/lists/new` | `PhoneWizardSteps.tsx:361-373` files a list on the `is_standing` campaign when no `?campaign_id=` is given; `phone/page.tsx:68` uses the per-campaign href |

**Honest labelling of the Email secondary.** The card body reads:

> **Send without a campaign (Email wizard)** — pushes the audience to Action Network. Nothing about the send is recorded here, so it will not appear in this list.

That is the literal content of `docs/ORGANISER_UX_REVIEW_AND_PLAN.md:154`. This is the only place in the hub that promises less than it lists, and it says so.

**Campaign picker dialog.** One shared `<HubCampaignPickerDialog>` in the same file, wrapping the existing `CampaignCombobox` exported from `src/components/sms/hub/SmsScopePicker.tsx:117`, fed by `useSmsHubCampaigns()` (`useSmsHub.ts:74-91`), which already applies `excludeSmsEpisodes` (`src/lib/campaign/visible-campaigns.ts:12-17`). It lists campaigns; it has **no "create a campaign" affordance** — decision 7 and the standing rule "no new campaign-creation path".

Cards are wrapped in `canWrite` exactly as `SmsHubPage.tsx:228` does, so a `viewer` sees the list and no start cards.

**Not built here:** the "Where does this belong?" step. Plan 5.12 bullet 2 puts one unified wizard behind the container mechanism, which is WP3.5. The cards go where the flows exist today, as the work package directs.

### 2.5 Routes and navigation

| Route | Today | After |
|---|---|---|
| `/actions` | — | **new**: `src/app/(dashboard)/actions/page.tsx` renders `ActionsHubPage` inside the same `<Suspense>` wrapper `sms/page.tsx:7-19` uses |
| `/sms` | `SmsHubPage` (`src/app/(dashboard)/sms/page.tsx:16`) | **redirect** to `/actions`, forwarding every search param |
| `/sms/new` | create wizard | unchanged |
| `/sms/inbox` | inbox | unchanged |
| `/sms/numbers` | numbers | unchanged |
| `/campaigns/sms-tools` | redirect → `/sms` (`campaigns/sms-tools/page.tsx:17`) | redirect → `/actions` (one string) |

`src/app/(dashboard)/sms/page.tsx` is rewritten as a server redirect, modelled on `src/app/(dashboard)/campaigns/sms-tools/page.tsx:1-18`:

```ts
export default async function SmsHubRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string|string[]|undefined>> }) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) { const s = Array.isArray(v) ? v[0] : v; if (s != null) qs.set(k, s) }
  redirect(qs.toString() ? `/actions?${qs}` : '/actions')
}
```

Bookmarks keep working: `/sms`, `/sms?scope=standalone`, `/sms?open=blast:3:4&standalone=1` all land on the same view at `/actions`. `/sms/new`, `/sms/inbox`, `/sms/numbers` are separate route segments and are untouched by a `page.tsx` at `/sms`.

**Hub base path becomes a constant.** `hub-actions.ts:151` hardcodes `` `/sms?${params}` ``. Change to `` `${ACTIONS_HUB_PATH}?${params}` `` importing from `src/lib/actions/hub-rows.ts`; likewise `SMS_EPISODE_TOOLS_HREF` at `src/lib/campaign/visible-campaigns.ts:10` becomes `'/actions?scope=standalone'`. Three existing assertions change in `src/lib/sms/__tests__/hub-actions.test.ts:103,105,107`. Consumers that need no edit because they call the helper: `SmsCreateActionPage.tsx:283,298,317`, `SmsNumbersPage.tsx:274-275`, `SmsArchiveDeleteControls.tsx:359`, `campaigns/[id]/page.tsx:292`, `campaign-detail-header-bar.tsx:118,127`. Inside the hub page itself, the four literal `'/sms'` / `` `/sms?${…}` `` strings at `SmsHubPage.tsx:126,142,155,181` become `ACTIONS_HUB_PATH`.

**Pills stay three.** `SmsHubNav.tsx:21-23`: `{ id:'actions', href:'/sms' … }` → `href: ACTIONS_HUB_PATH`. Inbox `/sms/inbox` and Numbers `/sms/numbers` unchanged. The nav component is shared with `sms/inbox/page.tsx:37` and `SmsNumbersPage.tsx:108`, so both keep a working Actions pill. The `aria-label="SMS sections"` (`SmsHubNav.tsx:29`) becomes `"Actions sections"`; the file keeps its path so the two other importers need no change.

**Sidebar — WP1.2's job, not this package's.** The one-line change WP1.2 must make, stated here so it can be picked up verbatim:

> In `src/components/layout/sidebar.tsx:40`, replace
> `{ href: "/sms", label: "SMS Tools", icon: MessageSquareMore },`
> with
> `{ href: "/actions", label: "Actions", icon: LayoutList },`
> mapped to module id `actions` in the registry. `allNavHrefs` (`sidebar.tsx:53`) picks it up automatically; `pageTitles` needs an `/actions` entry.

This package **does not touch `sidebar.tsx`**. Until WP1.2 lands, the existing "SMS Tools" item still reaches the hub through the `/sms` redirect, so `/actions` is never orphaned at any commit.

### 2.6 Campaigns-page strip

`src/app/(dashboard)/campaigns/page.tsx:374-405` today. **Decision 7 (Amended) means demote, not delete.** Destination for each of the five controls:

| Strip control | Line today | Where it goes | Still reachable at |
|---|---|---|---|
| Create campaign | `376-383` | **stays** on the strip (primary; it is the one creation entry plan 5.3 keeps) | `campaigns/page.tsx` strip |
| Email wizard | `384-387` | **hub Email card secondary link** (§2.4) | `/actions` → Email card → "Send without a campaign (Email wizard)"; URL `/campaigns/email-wizard` still resolves (`email-wizard/page.tsx:5`); also still listed on the campaigns empty state, `CampaignsDashboard.tsx:225-231` |
| Phone wizard | `388-391` | **hub Calls card primary link** (§2.4) | `/actions` → Calls card → "New call list"; URL `/campaigns/phone-wizard` still resolves (`phone-wizard/page.tsx:5`); also `CampaignsDashboard.tsx:232-238` |
| SMS tools | `392-395` | **the hub itself** | the single "Actions" link replacing these three; `/sms` redirects; `CampaignsDashboard.tsx:239-247` still links `/sms` |
| Import lists | `396-403` | **stays** on the strip as a secondary control. It is an import, module **Imports** in plan 5.2 (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:230`), and WP1.4/More re-homes it. Out of scope here. | `campaigns/page.tsx` strip |

Before (`campaigns/page.tsx:374-405`) — five controls, three of them comms:

```
[ Create campaign ] [ Email wizard ] [ Phone wizard ] [ SMS tools ] [ Import lists ]
```

After — three controls, the three comms links collapsed into one:

```
[ Create campaign ] [ Actions ] [ Import lists ]
```

Concretely: delete lines `384-395` (the three `<Link>` blocks) and insert one in their place:

```tsx
<Link href="/actions" className={tabBarActionClassName}>
  <LayoutList className="h-4 w-4 shrink-0" />
  Actions
</Link>
```

Import bookkeeping in the same file: `Mail`, `Phone` and `MessageSquare` become unused in the strip — check the rest of the file before deleting them from the `lucide-react` import (they are also used by the create-selector dialog); add `LayoutList`. An unused import is a lint error and the budget forbids raising the count.

`CampaignsDashboard.tsx:215-247` (the empty-state list) is **left alone**: it is the "documented location" decision 7 asks for, it is only rendered when the user has no campaigns, and touching it belongs to WP1.3 (My campaigns home). Its three links are extra reachability, not the primary path.

**Proof nothing becomes unreachable** — every route that the strip was the entry point for, after this change:

| URL | Reachable from | path:line |
|---|---|---|
| `/campaigns/email-wizard` | hub Email card; campaigns empty state | new `StartSomethingCards.tsx`; `CampaignsDashboard.tsx:226` |
| `/campaigns/phone-wizard` | hub Calls card; campaigns empty state | new `StartSomethingCards.tsx`; `CampaignsDashboard.tsx:233` |
| `/sms` | redirect to `/actions`; sidebar `sidebar.tsx:40`; campaigns empty state `CampaignsDashboard.tsx:240` | — |
| `/actions` | campaigns strip; sidebar after WP1.2; hub pills | `campaigns/page.tsx` (new line); `SmsHubNav.tsx:21` |
| `CampaignImportWizard` | campaigns strip (unchanged) | `campaigns/page.tsx:396-403` |
| create-campaign dialog | campaigns strip (unchanged) | `campaigns/page.tsx:376-383` |

### 2.7 Terminology

Grep of the hub for the banned words (`src/components/sms/hub/*`, `src/lib/sms/hub-actions.ts`):

- **"episode"** — 24 hits, **all in code comments or internal identifiers**, none in a user-facing string: `hub-actions.ts:10,33`; `SmsScopePicker.tsx:6`; `SmsCreateActionPage.tsx:13,22,81,82,184,186,188,200,209,217,266,277,289,306,469,499,514,532,557,634`. The internal `episode` field name and the `is_sms_episode` column stay (they are the data model); nothing to replace in UI copy. Two comments that read as user-facing guidance are reworded to say "Standalone" alongside the mechanism, so the next reader does not reintroduce the word into copy: `hub-actions.ts:10`, `SmsScopePicker.tsx:6`.
- **"standing campaign"** — **zero hits** in the hub. It appears in `PhoneWizardSteps.tsx:341-343` (a comment) and in the baseline comment at `20260908050000_baseline_schema.sql:9710`. No UI string. The hub's new call-list rows must never print the standing campaign's name ("OA Membership Outreach") — `scopeFor` (§2.1.4) returns `{kind:'standalone'}` for `is_standing`, so the Scope column prints **Standalone**. Test 4 in §2.1.4 pins this.
- **"Org-wide"** — user-facing, 3 hits, and plan 3.6 folds it into Standalone:
  - `SmsActionsTable.tsx:73` `if (row.scope === 'org') return 'Org-wide'` → the generalised table uses `scope.kind === 'standalone' ? 'Standalone' : scope.name`; the `'org'` branch disappears with the row shape.
  - `SmsHubPage.tsx:279` `<SelectItem value="org">Org-wide relays</SelectItem>` → **"Standalone"**, merged with the existing `standalone` option into one filter value (the client filter accepts both `scope==='standalone'` and `scope==='org'` source values). The `?scope=org` **URL** value keeps parsing (`hub-actions.ts:52-53`) so old links still work.
  - `SmsScopePicker.tsx:38` `label: 'Org-wide'` → **`'Standalone — not part of a campaign'`**, matching the `standalone` option at `SmsScopePicker.tsx:33`; the description at `:39-40` keeps the relay-specific consequence ("Shows on every campaign's Relays tab and here in the hub"). The radio **value** stays `'org'` — `scopeOptionsForKind` (`hub-actions.ts:42-44`) and the create page's episode logic depend on it, and changing it would be a real behaviour change.
- **"SMS Tools"** vs hub "Actions" (appendix D pain point 5, `appendix-D-navigation-roles.md:353`) — resolved by WP1.2's sidebar line (§2.5); this package makes the destination match the word.
- Page title and description on `/actions`: h1 **"Actions"**, description **"SMS, email and calls — standalone or linked to a campaign. See what is running, start something new, or pick up where you left off."** (generalising `SmsHubPage.tsx:194-195`).

No other plan-3.6 term (Who's in, Group, Unit, Unassigned, Not in any group, Strategic plan, Colour by) appears in any string this package writes.

### 2.8 Coverage inventory (the acceptance table)

Appendix D §9 item 4 ("Duplicated entry points", `docs/organiser-ux-review/appendix-D-navigation-roles.md:347-352`) lists the entry points. Every one that starts or reaches a **standalone-capable** SMS / email / phone action gets a hub counterpart. The last two bullets (Import worker list, Campaign creation) are not actions — they are covered for completeness with their explicit non-goal.

| # | Entry point today | path:line today | Hub counterpart | path:line after |
|---|---|---|---|---|
| 1 | Campaign header **Create Phone Call** | `campaign-detail-header-bar.tsx:174` | unchanged (campaign-scoped, stays); hub Calls card is the standalone twin | `StartSomethingCards.tsx` — Calls card |
| 2 | Outreach → Phone Ops **Create Phone Call** | `InlinePhoneOpsPanel.tsx:66-71` | unchanged; hub lists every call list it creates | `ActionsTable` rows, kind `call_list` |
| 3 | Org-level **`/campaigns/phone-wizard`** (list strip) | `campaigns/page.tsx:388` | **Calls card → `/campaigns/phone-wizard`** | `StartSomethingCards.tsx`; strip link removed at `campaigns/page.tsx:388-391` |
| 4 | `/campaigns/phone-wizard` (empty state) | `CampaignsDashboard.tsx:233` | unchanged (second reachable location) | `CampaignsDashboard.tsx:233` |
| 5 | Build-list fire → `/fire/phone` | `api/campaigns/[id]/worker-lists/[listId]/fire/phone` | unchanged; the call list it creates appears in the hub | `ActionsTable` rows, kind `call_list` |
| 6 | Campaign header **Create SMS** | `campaign-detail-header-bar.tsx` (Create SMS) | unchanged; hub SMS card is the standalone twin | `StartSomethingCards.tsx` — SMS card |
| 7 | Outreach → SMS panel | `InlineSmsOpsPanel.tsx` | unchanged | `ActionsTable` rows, kinds `sms_*` |
| 8 | `/sms` hub "Start a new SMS action" cards | `SmsHubPage.tsx:229-248` | **moved into the SMS card** | `StartSomethingCards.tsx` — SMS card |
| 9 | `/sms/new` | `src/app/(dashboard)/sms/new/page.tsx` | unchanged; SMS card links to it | `hub-actions.ts:165-176` |
| 10 | Sidebar **SMS Tools** | `sidebar.tsx:40` | WP1.2 relabels to **Actions** → `/actions`; `/sms` redirects meanwhile | `sms/page.tsx` (redirect) |
| 11 | List-strip **SMS tools** | `campaigns/page.tsx:392` | **strip "Actions" link → `/actions`** | `campaigns/page.tsx` (new line) |
| 12 | `/sms` from the campaigns empty state | `CampaignsDashboard.tsx:240` | unchanged (redirects to `/actions`) | `CampaignsDashboard.tsx:240` |
| 13 | Build-list fire → `/fire/sms` | `api/campaigns/[id]/worker-lists/[listId]/fire/sms` | unchanged; result appears in the hub | `ActionsTable` rows |
| 14 | Campaign header **Create Email** | `campaign-detail-header-bar.tsx:185` (`CreateEmailOrchestrator`) | unchanged; hub Email card's primary is the same destination with a campaign picker in front | `StartSomethingCards.tsx` — Email card |
| 15 | Comms → Drafts & Send | `campaigns/[id]?tab=outreach&sub=comms` (`campaign-tabs.ts:96`) | unchanged; hub lists its lists and drafts | `ActionsTable` rows, kind `email_send` |
| 16 | **`/campaigns/email-wizard`** (list strip) | `campaigns/page.tsx:384` | **Email card secondary → `/campaigns/email-wizard`**, honestly labelled | `StartSomethingCards.tsx`; strip link removed at `campaigns/page.tsx:384-387` |
| 17 | `/campaigns/email-wizard` (empty state) | `CampaignsDashboard.tsx:226` | unchanged (second reachable location) | `CampaignsDashboard.tsx:226` |
| 18 | Build-list fire → `/fire/email` | `api/.../fire/email/route.ts:188` | unchanged; the draft it creates appears in the hub | `ActionsTable` rows, kind `email_send` |
| 19 | Standalone SMS via hidden episode | `SmsCreateActionPage.tsx:184` | listed as **Standalone** | `scopeFor` in `hub-rows.ts` |
| 20 | Standalone call list via the standing campaign | `PhoneWizardSteps.tsx:361-373` | listed as **Standalone** | `scopeFor` in `hub-rows.ts` |
| 21 | Standalone email (legacy wizard → Action Network) | `EmailWizardSteps.tsx` | **no row exists to list** — stated in the Email card copy and in the hub's empty hint | `StartSomethingCards.tsx` (copy) |
| — | Import worker list (8 mount points) | `appendix-D:351` | **not an action.** Module *Imports* (plan 5.2:230); WP1.4 re-homes it; strip control unchanged | `campaigns/page.tsx:396-403` |
| — | Campaign creation (5 paths) | `appendix-D:352` | **not an action** and explicitly out of scope (no new campaign-creation path); strip control unchanged | `campaigns/page.tsx:376-383` |

Row 21 is the only gap, and it is a gap in the **data**, not in the hub: plan 3.9 records that the legacy Email wizard writes nothing in-app. The acceptance criterion is met by naming it in product copy rather than by silently omitting it.

### 2.9 File-by-file change list

**New files (8)**

| Path | Purpose |
|---|---|
| `src/lib/actions/hub-rows.ts` | The pure module of §2.1.4: `HubActionRow`, `bucketFor`, `statusLabelFor`, `scopeFor`, `shapeSmsRow`, `shapeEmailRow`, `shapeCallListRow`, `sortHubRows`, `filterHubRows`, `countBy`, `ACTIONS_HUB_PATH`, labels |
| `src/lib/actions/__tests__/hub-rows.test.ts` | vitest, the eight case groups of §2.1.4 |
| `src/app/api/email/activity/route.ts` | cross-campaign email lists + un-listed email drafts |
| `src/app/api/calls/activity/route.ts` | cross-campaign call lists |
| `src/lib/hooks/useActionsHub.ts` | `useEmailActivity`, `useCallActivity`, `useHubActionRows` |
| `src/app/(dashboard)/actions/page.tsx` | route shell, `<Suspense>` + `ActionsHubPage` (mirrors `sms/page.tsx:7-19`) |
| `src/components/actions/hub/ActionsHubPage.tsx` | the generalised hub (moved from `SmsHubPage.tsx`, extended) |
| `src/components/actions/hub/ActionsTable.tsx` | the generalised table (moved from `SmsActionsTable.tsx`, extended) |
| `src/components/actions/hub/StartSomethingCards.tsx` | the three cards + shared campaign picker dialog |
| `tests/e2e/actions-hub.spec.ts` | §2.11 |

**Modified files (8)**

| Path:line | Change |
|---|---|
| `src/app/api/sms/activity/route.ts:29-59,100,110,119,139-174,330-379` | thread `created_by` through; additive only |
| `src/lib/sms/hub-actions.ts:10,33,151` | comment wording; `smsActionHref` base becomes `ACTIONS_HUB_PATH` |
| `src/lib/sms/__tests__/hub-actions.test.ts:103,105,107` | three href assertions `/sms?` → `/actions?` |
| `src/lib/campaign/visible-campaigns.ts:10` | `SMS_EPISODE_TOOLS_HREF` → `/actions?scope=standalone` |
| `src/components/sms/hub/SmsHubNav.tsx:21,29` | Actions pill href → `/actions`; aria-label → "Actions sections" |
| `src/components/sms/hub/SmsScopePicker.tsx:6,38` | comment; `org` option label → Standalone wording (value unchanged) |
| `src/components/sms/hub/SmsNumbersPage.tsx:46` | `STATUS_TONE` import repointed to `@/components/actions/hub/ActionsTable` |
| `src/app/(dashboard)/sms/page.tsx:1-19` | rewritten as a param-preserving redirect to `/actions` |
| `src/app/(dashboard)/campaigns/sms-tools/page.tsx:17` | redirect target `/sms` → `/actions` (2 strings) |
| `src/app/(dashboard)/campaigns/page.tsx:384-395` | three comms links → one **Actions** link; `lucide-react` imports adjusted |

**Deleted files (2)** — moved, not removed; every export survives at the new path:

- `src/components/sms/hub/SmsHubPage.tsx` → `src/components/actions/hub/ActionsHubPage.tsx`
- `src/components/sms/hub/SmsActionsTable.tsx` → `src/components/actions/hub/ActionsTable.tsx` (keeps exporting `STATUS_TONE`, used by `SmsNumbersPage.tsx:381`)

`SmsHubNav.tsx`, `SmsCreateActionPage.tsx`, `SmsActionKindPicker.tsx`, `SmsScopePicker.tsx`, `SmsNumbersPage.tsx` **stay** at `src/components/sms/hub/` — they are SMS-specific (kind picker, create wizard, number registry) or shared by the inbox/numbers pages. `SMS_ACTION_KIND_META` (`SmsActionKindPicker.tsx:28-64`) is imported by the new table for the four SMS icons; two new meta entries for `email_send` and `call_list` (icons `Mail`, `Phone`, matching `campaigns/page.tsx:385,389`) live in `src/components/actions/hub/ActionsTable.tsx`.

**No schema change. No `supabase/migrations/` file. No `pnpm gen:types` run.** Justified in §2.2 (all columns exist in the baseline; all three `SELECT` policies are `USING (true)`).

### 2.10 What is preserved in the SMS hub, verbatim

Because "no behaviour change for SMS" is an acceptance condition, these carry over into `ActionsHubPage`/`ActionsTable` unchanged:

- `?open=<ref>` deep links and the three detail sheets (`SmsHubPage.tsx:105-117,310-343`) — `ListDetailSheet`, `SurveyDetailSheet`, `RelayDetailSheet`, including `standaloneMode` / `hideAssessments` derivation at `111-117`.
- Duplicate (`SmsHubPage.tsx:160-173`) and Open-relay (`147-158`).
- Archive / un-archive / delete via `SmsActionOpsLauncher` (`SmsActionsTable.tsx:395-403`) — **SMS kinds only**; the row menu offers none of these for `email_send` / `call_list` (no `archived_at` column, and delete is owned by the existing per-kind UIs).
- The `showArchived` toggle and `archived_total` (`SmsHubPage.tsx:59-62,265-267`) — counts SMS only, labelled so.
- Snapshot tiles (`SmsHubPage.tsx:209-225`): Live now, Drafts & paused, Awaiting review, Finished, Numbers. Live / Drafts & paused / Finished now count **all six kinds**; "Awaiting review" and "Numbers" stay SMS-only and are labelled "Relay messages held for moderation" / link to `/sms/numbers` as today.
- The 15 s poll while a blast or survey is in flight (`useSmsHub.ts:42-49`).
- "Open in campaign" (`SmsActionsTable.tsx:374-384`) generalises to `row.campaignHref`.

### 2.11 Tests and the commands that prove each acceptance criterion

**Unit (vitest).** From `apps/organising-db`:

```
pnpm test -- hub
```

`vitest run hub` matches both `src/lib/sms/__tests__/hub-actions.test.ts` (existing, 3 assertions updated) and `src/lib/actions/__tests__/hub-rows.test.ts` (new). Proves: *"pure helpers for row shaping and status buckets have tests"*.

```
pnpm test
```

Full suite. Baseline is 732 passing (`PROGRESS.md`, WP0.2 row). Must not regress. Proves: *"no SMS hub regressions"* — the SMS-parity case (§2.1.4 case 2) fails loudly if `bucketFor` and `smsActionStatusGroup` ever disagree.

**Types and lint.**

```
pnpm lint
pnpm build
```

`pnpm build` runs `next build` and type-checks every touched route and component. Lint must not raise the 143/151 baseline; every touched file lints clean on its changed lines.

**e2e — new spec `tests/e2e/actions-hub.spec.ts`**, following `tests/e2e/wall-chart.spec.ts:1-20` (same `hasE2ECredentials` skip guard from `tests/e2e/env.ts`, same "no data-testid in production markup" rule — every selector is an anchor the product already relies on):

```ts
test.describe("Actions hub", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE)

  test("open /actions, see the three start cards and one bucket of rows", async ({ page }) => {
    await page.goto("/actions")
    await expect(page.getByRole("heading", { name: "Actions", level: 1 })).toBeVisible()

    // Start something — one card per channel.
    const start = page.getByRole("region", { name: "Start something" })
    await expect(start.getByRole("link", { name: /New SMS action/i })).toBeVisible()
    await expect(start.getByRole("link", { name: /Email wizard/i })).toBeVisible()
    await expect(start.getByRole("link", { name: /New call list/i })).toBeVisible()

    // Mine is the default; All is one click away.
    await expect(page.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "All" }).first().click()
    await expect(page).toHaveURL(/[?&]mine=0/)

    // At least one status bucket chip, with a count.
    const buckets = page.getByRole("group", { name: "Status" })
    for (const label of ["Live", "Drafts & paused", "Finished"]) {
      await expect(buckets.getByRole("button", { name: new RegExp(label) })).toBeVisible()
    }
    await buckets.getByRole("button", { name: /Drafts & paused/ }).click()
    await expect(page).toHaveURL(/[?&]bucket=drafts_paused/)

    // The Scope column exists and says either a campaign name or "Standalone".
    await expect(page.getByRole("columnheader", { name: "Scope" })).toBeVisible()
  })

  test("/sms still works and lands on the hub", async ({ page }) => {
    await page.goto("/sms?scope=standalone")
    await expect(page).toHaveURL(/\/actions\?.*scope=standalone/)
  })
})
```

Run against the branch preview (never locally — `PROGRESS.md` standing note: `.env.local` points at production):

```
E2E_BASE_URL=<branch preview URL> pnpm e2e -- actions-hub
```

with `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` sourced from the operator's shell profile for the `user`-role dev account. Proves: *"a spec that signs in as `user`, opens `/actions`, sees the SMS/Email/Calls cards and at least one row bucket"*, and that bookmarks survive.

**Manual acceptance:** §2.8's coverage table is the checklist. Each "path:line after" is verified by clicking the link on the preview.

### 2.12 Risks and the rules they could break

| # | Risk | Rule it could break | Mitigation |
|---|---|---|---|
| 1 | **Query cost.** Three cross-campaign reads instead of one, each `LIMIT 200`, each with a batched `campaigns` lookup. | Performance budget; the hub is the organiser's landing area after WP1.2. | Narrow selects (named columns, never `*` — contrast `api/calls/lists/route.ts:24`); indexes exist for the ordering-adjacent access (`idx_el_campaign` **21081**, `idx_el_status` **21093**, `idx_cl_campaign` **20773**, `idx_cl_status` **20781**); email and calls have `staleTime: 30_000` and **no poll** (only SMS polls, and only while something is in flight, `useSmsHub.ts:42-49`); the two new queries are independent, so a slow one does not block the SMS list. If a preview run shows the page over budget, the fallback is a single `/api/actions/activity` route that issues the same reads in one round trip — same shapers, no UI change. |
| 2 | **SMS hub regressions.** The generalisation moves two files and rewrites the row type. | "No behaviour change for SMS"; nothing is removed from the product. | The existing shaper is pinned *before* it is touched: §2.1.4 case 2 asserts `bucketFor` ≡ `smsActionStatusGroup` for all four kinds × every status; the existing `hub-actions.test.ts` keeps running unchanged apart from three href strings; §2.10 enumerates every preserved behaviour; the detail sheets, duplicate, archive and deep-link paths are moved, not rewritten. |
| 3 | **`created_by IS NULL` on legacy rows** silently empties the default Mine view. | "Nothing is removed from the product"; "no missing-feature report unanswerable". | `owner.unknown` flag + the explicit "N older actions have no recorded owner. Switch to All." line (§2.3), with a unit test. |
| 4 | **Reading three tables cross-campaign** looks like a permissions widening. | Never pre-empt WP1.6. | It is not a widening: all three `SELECT` policies are already `USING (true)` (baseline **26697**, **26769**, **26833**) and the campaign-scoped routes already return the same rows to the same users. The hub adds no write path. When WP1.6 narrows reads, the three new routes narrow with every other read; nothing here assumes `USING (true)` beyond today. |
| 5 | **`/sms` redirect breaks a flow mid-task.** `SmsCreateActionPage` pushes `smsActionHref(...)` after saving. | Bookmarks must keep working; no dead ends. | `smsActionHref` is changed at the same commit to emit `/actions?...`, so the redirect is only ever hit by external bookmarks; the redirect forwards every search param including `open` and `standalone`; `/sms/new`, `/sms/inbox`, `/sms/numbers` are untouched route segments. |
| 6 | **Terminology change to "Org-wide"** is a user-visible relabel of an existing relay concept. | Plan 3.6 requires it; but a mid-flight organiser may be confused. | The radio **value** and the `?scope=org` URL contract are unchanged, so no data or link breaks; only the displayed word changes, and the relay-specific description at `SmsScopePicker.tsx:39-40` is kept so the consequence is still stated. |
| 7 | **Depends on WP1.2** (sidebar / module registry), which is "not started". | Ordering. | This package touches no navigation registry. `/actions` is reachable from day one via the campaigns strip and the hub pills, and via `/sms` → `/actions`. §2.5 states WP1.2's one-line change; if WP1.2 slips, the hub is still fully reachable. |
| 8 | **Lint budget.** Removing three strip links can orphan `lucide-react` imports in a 900-line file. | Total lint errors must not rise. | The change list (§2.9) calls this out explicitly; `pnpm lint` before and after, error counts compared against the 143/151 baseline. |
| 9 | **Un-listed email drafts double-count** if `email_list_id` is set later. | Correctness of the list. | The route filters `.is('email_list_id', null)` at read time, so a draft that gains a list moves from the drafts array to the lists array on the next fetch — never both. A unit test covers the pairing rule. |

---

## 3. Out of scope

Tempted, and deliberately not done:

1. **Link to campaign / "New campaign from this action"** (plan 5.12 bullets 5-6). Decision 10 assigns these to **WP3.6**. The `HubActionRow` type is shaped so a `linkable: boolean` and a row-menu item drop in without a rewrite, but no such field is added now.
2. **The `container_kind` action-container mechanism** (decision 10, **WP3.5**). Standalone call lists keep living on the `is_standing` campaign (`PhoneWizardSteps.tsx:361-373`) and standalone SMS keeps using episode campaigns; the hub *presents* both as Standalone without changing either.
3. **The unified "Where does this belong?" create wizard** (plan 5.12 bullet 2). WP3.5. The Start cards go to the flows that exist today, as the work package directs.
4. **Sidebar edit** (`sidebar.tsx:40`) and the module registry. WP1.2. Stated as a one-line instruction in §2.5, not made here.
5. **Re-homing "Import lists"** into a More menu. Plan 5.2 module *Imports*; WP1.4. The strip control stays where it is.
6. **Touching `CampaignsDashboard.tsx:215-247`** (the campaigns empty state). WP1.3 replaces that page; the three links there are extra reachability that decision 7 wants kept.
7. **Any campaign-creation affordance** in the hub's campaign picker. Standing rule.
8. **Task lists and the leader webform**, which plan 5.2:222 lists inside the Actions module. The work package names three kinds — SMS, email, calls — and the union is closed at six. Adding a seventh kind is a later, additive change.
9. **Call sessions** as their own rows. `call_lists.completed_items` (**8229**) already summarises them and one row per list is the hub's grain; `call_attempts` (**8135**) is not read.
10. **Aggregating the SMS/email/calls queries into one route.** Kept as the documented fallback under risk 1 rather than done speculatively, because merging would change `SMS_ACTIVITY_QUERY_KEY` (`useSmsHub.ts:22`), which the campaign SMS panels share.
11. **Any RLS or schema change.** §2.2 proves none is needed; WP1.6 owns read tightening.
12. **A per-kind Archived concept for email and calls.** Neither table has `archived_at`; inventing one is a migration and belongs with the container work.
13. **Retiring `/campaigns/sms-tools`.** It keeps redirecting, now to `/actions` — decision 7's "every old URL still works".

---

## 4. Open questions

None blocking. Assumptions stated and proceeding:

1. **WP1.2's module id for the hub is `actions` and its href is `/actions`.** Assumed from plan 5.2's module table (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:222`, row "Actions"). This package does not depend on it: `/actions` is reachable without any sidebar change.
2. **"Mine" means `created_by = auth.uid()`**, not `campaigns.organiser_id`. Assumed from decision 8's note and from appendix D §6's finding that `organiser_id` scoping is "a client-side filter on the list page only" (`appendix-D-navigation-roles.md:301`). If the operator wants "actions in campaigns I organise" instead, that is a one-line change in `filterHubRows` plus one extra field on the row — flagged, not blocking.
3. **`/sms` redirects rather than aliases.** Assumed: one code path, and the URL the organiser sees matches the sidebar word. Every param is forwarded, so no bookmark breaks. If the operator prefers `/sms` to keep rendering the hub in place, that is a two-line change (render `ActionsHubPage` instead of `redirect`) with no other consequence.
4. **The legacy Email wizard's Action Network sends stay unlisted.** Plan 3.9 (`ORGANISER_UX_REVIEW_AND_PLAN.md:154`) says there is nothing in-app to list. Recording those sends would be a new write path and a schema change — out of scope. The hub says so in copy.
5. **The standing campaign's name is never shown for a standalone call list.** Assumed from plan 3.6's "'standing campaign' disappears from the UI". Pinned by a unit test.

## 5. Orchestrator approval

**Approved 2026-09-09** as written; all five assumptions accepted. Notes: (2) "Mine" = `created_by = auth.uid()` is right for this package; once WP1.3 makes `campaign_organisers` the source of "my campaigns", widening "Mine" to include actions in campaigns I organise is a one-line follow-up to consider there, not here. (3) `/sms` redirecting to `/actions` with params forwarded is accepted; `/sms/new`, `/sms/inbox`, `/sms/numbers` unchanged. Sequencing: the dependency table lists WP1.5 after WP1.2, but this plan keeps the sidebar entry out of scope, so WP1.5 may be implemented as soon as the checkout is free after WP1.1; WP1.2 adds the nav entry. Branch `feat/oux-wp1.5-actions-hub` off `develop` (or stacked on the phase-1 tip if WP1.1 has not merged); PR base `develop`. Reviewer tier: opus (no schema or RLS change; the two new read routes reuse existing read-all policies — the reviewer must still confirm they leak nothing across campaigns beyond what the SMS activity route already exposes).

## 6. Deviations from plan

_(implementer keeps this list)_

## 7. Verification output

_(verifier pastes raw output)_

## 8. Reviewer findings

_(reviewer)_
