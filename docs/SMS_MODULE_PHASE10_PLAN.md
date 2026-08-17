# SMS Module — Phase 10 Implementation Plan (3-pane chat workspace: roster · conversation · member)

**Parent brief:** `docs/SMS_EXPANSION_BRIEF.md` (§E0/E0b/E3/E4 chat workspace; §4.2 navigation; §5.1 decision 2 — SMS route family)
**Supersedes:** brief §5.1 **decision 8b** (member board band + focus pane). See §0.2.
**Builds on:** Phase 8 (`SMS_MODULE_PHASE8_PLAN.md`), Phase 9 (`SMS_MODULE_PHASE9_PLAN.md`), and the shipped P2P chat board (`37b39dc`, `bd88e80`, migrations `20260812140000_sms_p2p_chats.sql` / `20260813055432_sms_p2p_item_body_override.sql`).
**Status:** Implemented 2026-08-17 — code complete, `tsc` / `vitest` (360 tests) / `eslint` / `next build` all clean. **Migration not yet applied to DEV or PROD.** Decisions §0 answered by the user; not to be reopened.

### Deviations from the plan, as built

1. **Assessment writes resolve the effective campaign server-side.** The plan put the nominated-campaign membership upsert in WI-12's list route. It belongs in `POST /api/sms/conversations/[id]/assessments`, because that route validates the activity against the conversation's campaign — which for a standalone chat is the episode campaign, so it would have rejected every nominated-campaign activity. It now resolves the board's `assessment_campaign_id` through the list item, validates against that, gates `can_write_to_campaign` on it, and upserts membership on the first real save.
2. **Pin actions live on the p2p route**, not a generic `sms-lists` PATCH — that route already owns `close` and `set_item_body`, so board concerns stay in one place. New actions: `set_assessments`, `nominate_assessment_campaign`.
3. **`SmsP2pBoard.tsx` (806 lines) deleted**, per risk 6. Before removing it, its two capabilities the workspace lacked were preserved: `AddPeopleDialog` was extracted to `SmsAddPeopleDialog.tsx` and wired into the workspace header, and the per-row "Do not contact" control became a first-class opt-out section at the top of the member pane.
4. **State re-seeding uses React's adjust-during-render pattern**, not effects — `react-hooks/set-state-in-effect` rejects the effect form, and the render form avoids committing a render with stale fields.
5. **`GET …/p2p` returns `campaign_is_sms_episode`** so the workspace can decide between "attach a campaign" and "nominate a real campaign" without a second query.
**Git:** primary working directory, no worktrees, single commit at phase end on the currently checked-out branch (`main`), per `CLAUDE.md`. **No agent runs any git command without explicit per-command user approval.**

All `src/**` paths are relative to `apps/organising-db/`. Migrations live at repo root under `supabase/migrations/`.

---

## 0. Decisions

### 0.1 Settled 2026-08-17

| # | Question | Outcome |
|---|---|---|
| 1 | Chat workspace layout | **Three panes: roster rail (left, narrow) · conversation (middle) · member card (right, always visible).** Selecting a name in the rail populates both the middle and right panes. |
| 2 | Rail row styling | **Entire row background colour-coded by state**, name clearly legible, **slow orange pulse when a new response has arrived**. |
| 3 | Which worker card | **New compact, campaign-optional `WorkerChatCard`.** `WorkerDetailSheet` is not reused directly — it is 1,524 lines, wall-chart-typed, and requires a real campaign plus `campaign_worker_membership` rows, so it cannot serve triage threads or episode-backed standalone chats. The chat card deep-links out to the full sheet when a real campaign exists. |
| 4 | Editable field scope | **Everything the wall chart allows**, by progressive disclosure: Details always available (campaign-optional); Units / Relationships / Development / Activity render only when the thread is attached to a real (non-episode) campaign. Reuse the exported tab components; export the two private ones. |
| 5 | Assessment grain | **Pinned per-board targets + inline creation.** Pinned assessments render in the **right pane, expanded by default**, one tap per member. The full-campaign list remains available as a collapsed fallback. |
| 6 | Standalone (episode) chats | **Prompt to nominate a real campaign** whose assessments ratings write against; membership created on first rating save. |
| 7 | Where sending lives | **The opener composes in the middle pane.** Selecting someone not yet messaged shows their opener — pre-filled from the board template, editable, with a Send button — instead of an empty thread. A **Select** toggle in the rail header turns rows into checkboxes and docks a "Select next N / Send to N" bar at the rail foot for bulk waves. |
| 8 | What stops the pulse | **Opening the thread stops the pulse** (`unread_count → 0` via a new `mark_read` action); the row **stays static amber** while `conversation.state = 'needs_response'`, i.e. seen but unanswered. |
| 9 | Palette | **Desaturated state tints for row backgrounds + a saturated `RATING_LEVELS` chip for the rating.** A green row must never ambiguously mean both "supportive" and "replied". |

### 0.2 Recorded reversal of decision 8b

Brief §E0 chose a **member board band + focus pane** and explicitly recorded the roster-rail layout as *rejected*, reasoning that thirty members in a rail shows ~12 without scrolling and that the right rail is contested below `xl`.

The user has chosen the 3-pane roster layout (2026-08-17). Decision 8b is **superseded**. The two objections are answered as follows, and the answers are requirements of this plan, not commentary:

- **Rail density.** Rows are two lines (name + status/time), ~44px. A 224px × full-height rail shows ~18 at 1080p and ~24 at 1440p, with the colour ladder making the ones that matter findable by scanning rather than reading. A **"Needs reply" filter chip** at the rail head collapses the list to actionable rows, which is the real answer to volume.
- **Right rail below `xl`.** Handled explicitly by the responsive rules in §4.2 — the right pane collapses to an overlay at `<lg`, and the workspace occupies a full-height dedicated route rather than a 4-levels-deep `h-[70vh]` box.

`docs/SMS_EXPANSION_BRIEF.md` §5.1 is amended in this phase to record the supersession.

---

## 1. Objectives

1. **Ship the 3-pane chat workspace** at a dedicated full-height route: roster rail · conversation · member card.
2. **Make the rail scannable** — full-row state tints, legible names, slow orange pulse on new inbound, "Needs reply" filter.
3. **View and edit the worker information card from chat**, always visible in the right pane, working for unmatched/triage threads and standalone episode chats.
4. **Assessments and notes visible by default** in the right pane, at one-tap grain, with inline assessment creation.
5. **Keep the progressive send workflow** — opener in the middle pane for unmessaged members, bulk waves via the rail's Select mode. No new send path; `p2p-send` is reused unchanged.
6. **Fix per-conversation drafts** (§E0b) — the current single-`draft`-string pattern silently destroys half-typed messages on switch, which a 30-chat workflow makes routine.

Out of scope: objection/issue capture (§E2 — Phase 11, isolated); source taxonomy split and SMS reporting views (§F — Phase 12); the `sms_messages.campaign_id` realtime denormalisation (§E5 — follow-up, see §6.3); redesigning the Inbox's left queue.

---

## 2. Current state

### 2.1 What the board is today

[`SmsP2pBoard.tsx`](../apps/organising-db/src/components/sms/p2p/SmsP2pBoard.tsx) (806 lines) renders **inside a `Sheet` capped at `sm:max-w-4xl`** (896px) with a `max-h-[55vh]` scrolling table. Each row is a checkbox + name + employer + phone + status badges + a thread badge that opens `SmsThreadDialog`. This is structurally incompatible with a 3-pane workspace — hence the route move (§4.1).

Refresh is a 10-second poll (`P2P_BOARD_POLL_MS` in `src/lib/hooks/useSmsP2p.ts`). There is no realtime on the board.

### 2.2 What already works — do not rebuild

- **Send path.** `POST …/sms-lists/[listId]/p2p-send` with opt-out hard-skip, blackout soft-warning, 50-per-call cap, and conversation create/attach on the `(our_number_id, phone_e164, campaign_id)` key. Untouched by this phase.
- **Board selection logic.** `selectNextN`, `pruneP2pSelection`, `isP2pSendable`, `filterP2pItems`, `p2pItemTemplate`, `renderP2pBody`, `P2P_SEND_CAP` — all pure and unit-tested in `src/lib/sms/p2p.ts` / `__tests__/p2p.test.ts`. Reused verbatim.
- **Thread pane.** `SmsThreadView` — bubbles, notes inline, day separators, presence, typing collision, soft-claim banner, scope switcher, AI draft candidates, segment counter. Reused as the middle pane.
- **Assessment write path.** `POST /api/sms/conversations/[id]/assessments` → `record_assessment_event(p_source := 'sms')`, with `can_write_to_campaign` gating before the `SECURITY DEFINER` RPC, activity→campaign ownership validation, and explicit-Unassessed row deletion. Correct; reused unchanged.
- **`CreateAssessmentDialog`** with `lockKind="assessment"` + `onCreated(activityId)` — reusable inline.
- **`WorkerRelationshipsTab`** and **`WorkerDevelopmentTab`** — exported, self-contained props. Reuse as-is.
- **`WorkerEditDialog`** (`src/components/phone/WorkerEditDialog.tsx`) — precedent for the compact editable form and its employer/worksite change-confirmation flow.

### 2.3 Gaps this phase closes

- No 3-pane workspace, and no route that can host one — the board is 4 levels deep in a sheet.
- No worker editing anywhere in SMS; `SmsConversationWorkerSummary` is 11 read-only fields.
- `SmsAssessmentPanel` is the wrong grain (one dirty-save row per campaign assessment) and in the wrong place (`hidden … xl:flex` sidebar → bottom sheet on a 13" laptop).
- No inline assessment creation — the empty state says "add one from the wall chart header".
- No mark-read path: `unread_count` clears only on reply (`…/messages/route.ts:181`) or close.
- Rail state is not derivable today — item status and conversation state are separate fields with no merged ladder.
- `UnitsTab` / `RatingsTab` are private to `worker-detail-sheet.tsx`.
- Drafts are a single string cleared on conversation switch (`SmsInboxPanel.tsx:96`).

---

## 3. Migration — `supabase/migrations/20260817100000_sms_chat_workspace.sql`

Two columns on `sms_lists`, mirroring the phone precedent (`phone_call_actions.selected_assessment_ids`, `20260613160000`). No new tables; both inherit `sms_lists` RLS.

```sql
ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS selected_assessment_ids INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[];

ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS assessment_campaign_id INTEGER
    REFERENCES campaigns(campaign_id) ON DELETE SET NULL;
```

- **`selected_assessment_ids`** — pinned targets for a `mode='p2p'` board. Ignored for `mode='blast'`.
- **`assessment_campaign_id`** — decision 6. NULL means "use `sms_lists.campaign_id`". Set only when the list's own campaign is `is_sms_episode`. `ON DELETE SET NULL` degrades to "pick a campaign again" rather than orphaning the board.
- Postgres cannot FK an array element, so integrity is enforced in the route (§4.7) and **stale ids are filtered on read, not errored** — an assessment deleted mid-session must not break the workspace.
- `COMMENT ON COLUMN` both, documenting the episode-nomination semantics and the array-integrity contract.

**No `mark_read` schema change** — the action reuses the existing `sms_conversations.unread_count` column.

**Apply:** MCP `apply_migration` DEV (`dpnnmkhabysfdogllsyh`) → `get_advisors` (security + performance) → PROD (`gteygwfgjvczanmrwgbr`) → `pnpm gen:types`. Both DBs stay in sync pre-launch per `docs/DEVELOPMENT_WORKFLOW.md`.

---

## 4. Work items

### WI-1 — Pure libs + tests

**`src/lib/sms/chat-rail-state.ts`** — the testable core of the new rail.

```ts
export type SmsRailState =
  | 'not_messaged' | 'sending' | 'messaged' | 'new_reply'
  | 'needs_response' | 'in_conversation' | 'closed'
  | 'opted_out' | 'failed'

export function deriveRailState(item: SmsP2pBoardItem): SmsRailState
export function railStateRank(state: SmsRailState): number   // sort: actionable first
export function isActionable(state: SmsRailState): boolean   // "Needs reply" filter
```

Merges `sms_list_items.status` with `sms_conversations.state` + `unread_count`. Precedence, highest first: `opted_out` → `failed` → `new_reply` (`unread_count > 0`) → `needs_response` → `in_conversation` → `closed` → `messaged` → `sending` → `not_messaged`.

**`src/lib/sms/chat-assessment-target.ts`** — resolves which campaign's assessments apply:

```ts
resolveAssessmentTarget(input: {
  conversationCampaignId: number | null
  conversationCampaignIsEpisode: boolean
  boardAssessmentCampaignId: number | null
  workerId: number | null
}):
  | { state: 'ready'; campaignId: number }
  | { state: 'needs_worker' }
  | { state: 'needs_campaign' }
  | { state: 'needs_real_campaign' }
```

Plus `pruneSelectedAssessmentIds(selected, liveActivityIds)`.

Vitest suites in `src/lib/sms/__tests__/`, matching house style (`p2p.test.ts`, `conversation-routing.test.ts`). Every branch, including episode-with- and without-nomination, and every rail-state precedence pair.

### WI-2 — Route: `app/(dashboard)/campaigns/[id]/sms/chat/[listId]/page.tsx` (new)

Full-height workspace under the existing SMS route family (brief decision 2; sibling of the shipped `sms/setup`). Standalone episode chats reach it via their episode campaign id — episode campaigns are real `campaigns` rows, so the campaign-scoped route works unchanged.

**Height.** `app/(dashboard)/layout.tsx` is `h-screen overflow-hidden` with `main` as `flex-1 overflow-y-auto p-6`, so `main` has a definite height and an `h-full min-h-0 flex` child fills it. Negate the gutter with `-m-6` so the workspace runs edge to edge; **verify the campaign header bar (`isCampaignDetailRoute`) and any resume banners still render above it** and subtract their height rather than assuming `100vh`.

The existing `SmsP2pPanel` sheet entry point navigates here instead of opening the sheet. Keep the sheet mount for one release behind nothing — delete it, since the route supersedes it and two live surfaces on one board invites divergent state.

### WI-3 — `src/components/sms/workspace/SmsChatWorkspace.tsx` (new)

The shell. Owns selection, per-conversation drafts, and Select mode.

```
┌─ rail (w-56, shrink-0) ─┬─ conversation (flex-1 min-w-0) ─┬─ member (w-80, shrink-0) ─┐
│ board name + counts     │ SmsThreadView                   │ WorkerChatCard            │
│ search + Needs reply    │   …or SmsOpenerComposer when    │ SmsPinnedAssessment       │
│ [Select] toggle         │      not yet messaged           │ conversation notes        │
│ ─ rows ─                │                                 │ (all expanded by default) │
│ [send bar in Select]    │                                 │                           │
└─────────────────────────┴─────────────────────────────────┴───────────────────────────┘
```

**Per-conversation drafts (§E0b).** `Map<number, string>` keyed by `conversation_id`, plus a separate `Map<number, string>` keyed by `item_id` for unsent openers. Switching members must never discard typed text. This is a behavioural fix, not a nicety — add a test asserting the drafts map survives a switch-and-return.

**Responsive** (§0.2 objection 2):

| Breakpoint | Layout |
|---|---|
| `≥2xl` (1536) | rail 240 / chat flex / member 360 |
| `xl` (1280–1535) | rail 224 / chat flex / member 320 |
| `lg` (1024–1279) | rail + chat; member pane collapses to a header toggle opening a right-side overlay `Sheet` |
| `<lg` | single pane — rail is the default view; selecting pushes chat full-screen with a back arrow; member card in a bottom `Sheet`. Mirrors the Inbox's existing mobile pattern. |

### WI-4 — `src/components/sms/workspace/SmsChatRail.tsx` (new)

**Row anatomy** (two lines, ~44px):

- Line 1: **member name**, `text-sm font-medium truncate` — the loudest text in the row, per the requirement.
- Line 2: state word · relative time since last inbound · unread count · rating chip.
- Full-row background from the state tint. `text-foreground` throughout; **never** dim the whole row with `opacity`, which destroys name legibility — opted-out rows use a rose tint and a strikethrough on the name instead.

**Palette** (decision 9) — desaturated tints, deliberately distinct from `RATING_LEVELS`:

| Rail state | Background | Notes |
|---|---|---|
| `not_messaged` | `bg-slate-50` | |
| `sending` | `bg-sky-50` | |
| `messaged` | `bg-sky-50` | awaiting first reply |
| `new_reply` | `bg-orange-100` | **slow pulse** |
| `needs_response` | `bg-amber-50` | seen, unanswered |
| `in_conversation` | `bg-emerald-50` | |
| `closed` | `bg-slate-100` | muted text |
| `opted_out` | `bg-rose-50` | name struck through |
| `failed` | `bg-red-50` | |

Selected row: a 3px left border in `border-primary` plus a ring — **not** a background change, which would destroy the state signal.

The rating chip reuses `RATING_LEVELS` saturated colours at `text-[10px]`, so the two palettes never collide (brief §E0 palette rule).

**The pulse.** A keyframe animating `background-color` between `orange-100` and `orange-200` over ~2.4s, `ease-in-out infinite alternate` — slow, not a strobe. Defined in `src/app/globals.css` (Tailwind v4: plain `@keyframes` + a utility class; confirm the file's existing convention before adding).

```css
@media (prefers-reduced-motion: reduce) {
  .sms-rail-pulse { animation: none; background-color: var(--color-orange-200); }
}
```

The reduced-motion branch is **required**, not optional — a persistently animating list is a vestibular trigger and this rail can have a dozen pulsing rows. Accompany the pulse with a non-colour cue (unread count badge) so the signal survives both reduced motion and colour-vision deficiency.

**Rail header:** board name, `sent/total · N to go`, a search input, a **Needs reply** filter chip (`isActionable`), a status `Select`, and the **Select** mode toggle. Default sort is `railStateRank` (actionable first), with a "board order" alternative.

**Select mode:** rows grow a checkbox, and a bar docks at the rail foot with "Select next [N]" and "Send to N". Reuses `selectNextN` / `pruneP2pSelection` / `P2P_SEND_CAP` unchanged. Exiting Select mode clears the selection.

### WI-5 — `src/components/sms/workspace/SmsOpenerComposer.tsx` (new)

The middle pane for a member with no conversation yet (decision 7).

- Renders the resolved opener via `p2pItemTemplate` + `renderP2pBody` with the item's merge context — exactly what the board's preview does today.
- Editable; saves the per-item override through `useSmsP2pSetItemBody` (existing).
- Live segment count (`countSegments`), compliance surface (`validateSmsBody`), soft blackout warning (`isWithinSendWindow`) — all existing helpers, no reimplementation.
- **Send** → `useSmsP2pSend([item.item_id])`. No new send path.
- **Wrong-recipient safety (§E0b):** the member's name appears in the textarea placeholder **and** on the Send button ("Send to Jo Nguyen"). Do not auto-advance after sending — the rail selection stays put.
- Opted-out / no-mobile members render the reason instead of a composer, with the existing "Do not contact" affordance.

### WI-6 — `mark_read` action

Add `case 'mark_read'` to the PATCH switch in `app/api/sms/conversations/[id]/route.ts` (alongside `assign` / `escalate` / `close` / `attach`), setting `unread_count = 0` and **nothing else**. Leaving `state` untouched is the point — `needs_response` persists, so the row drops from pulsing orange to static amber (decision 8).

Called by the workspace when a conversation with `unread_count > 0` is selected. Debounce so rapid rail arrow-keying doesn't fire a request per row.

### WI-7 — `src/components/workers/WorkerChatCard.tsx` (new)

The campaign-optional card, right pane.

```ts
{
  workerId: number
  campaignId: number | null          // effective campaign; NULL ⇒ Details only
  campaignIsEpisode?: boolean
  canWrite: boolean
  density?: 'compact' | 'full'
  onSaved?: () => void
}
```

**Sections** (accordion; Details and the summary expanded by default):

1. **Details — always available, campaign-optional.** Own implementation (do not import `DetailsTab`, which takes a `WallChartWorker` and a required `campaignId: string`). Fields mirroring `DetailsTab` + `WorkerEditDialog`: first/last/preferred name, phone, email, occupation (`canonical_occupation_id`, with create-new), employer + worksite (with the `WorkerEditDialog` change-confirmation flow), `member_role_type_id`, `union_membership_type_id`, `non_oa_union_option_id`, `is_hsr`, `is_bargaining_rep`. Dirty-aware single Save. Worker notes list + composer (`worker_notes.campaign_id` is already nullable).
2. **Activity / ratings** — `<RatingsTab>` (WI-8). Campaign-gated.
3. **Units** — `<UnitsTab>` (WI-8). Campaign-gated; fetches `campaign_organising_units` + `campaign_worker_ou` for the **one** worker, not the whole member set as `CampaignWorkerDetailProvider` does.
4. **Relationships** — `<WorkerRelationshipsTab>`. Campaign-gated.
5. **Development** — `<WorkerDevelopmentTab>`. Campaign-gated.
6. **Footer** — "Open full member record" deep link to the wall chart, only when a real campaign exists.

With `campaignId == null` or `campaignIsEpisode`, sections 2–6 collapse to one dashed hint: *"Attach this conversation to a campaign to see units, relationships, development and ratings."*

Writes go through `PATCH /api/workers/[workerId]` (WI-9) — not direct client Supabase calls — so SMS surfaces get one audited, rate-limited, permission-checked path. Wall-chart writes are untouched.

**Cache invalidation** must match `DetailsTab`'s `onSuccess` list so an edit from chat updates the wall chart in the same session: `campaign-members-full`, `campaign-members`, `campaign-rating-summary`, `campaign-list-stats-members`, `campaign-list-builder-workers`, `worker`, `workers` — plus `['sms-conversation', conversationId]` and `['sms-p2p-board', …]`.

### WI-8 — Export the two private tabs

In `src/components/campaigns/wall-chart/worker-detail-sheet.tsx`, add `export` to `UnitsTab` and `RatingsTab`. No behavioural change, no prop change, no refactor of a 1,524-line file. Check for name collisions with existing exports first.

### WI-9 — `app/api/workers/[workerId]/route.ts` (new)

`GET` (full card payload in one request, rather than the six queries `DetailsTab` fires) and `PATCH` (field updates). Route Handlers only — no server actions, per house convention.

- Auth → `checkRateLimit` → Zod-validated body.
- **Permission:** when `campaign_id` is supplied, gate on `can_write_to_campaign`; otherwise rely on the `workers` RLS policies under the user client. **Never** the service client.
- Normalise `phone` via `toE164`; reject an invalid AU mobile with a 400 carrying actionable copy.
- Audit row in `worker_activity_log` (`details_updated`), mirroring `WorkerEditDialog`, tagged with the originating `sms_conversation_id` when supplied.

`app/api/workers/` currently holds only `batch-update/route.ts`; adding `[workerId]/route.ts` alongside is consistent.

### WI-10 — `src/components/sms/inbox/SmsPinnedAssessment.tsx` (new)

Right pane, **expanded by default** (decision 5).

- One compact row per pinned assessment: title + rating chips (1–5 in `RATING_LEVELS` with `rating_labels` overrides, or `VOTE_SUPPORTER_OPTIONS` pills when `is_binary`) + an explicit **Unassessed** chip. **One tap saves** — no dirty-save button, unlike the sidebar panel. Optimistic chip state with rollback on error.
- Reuses `POST /api/sms/conversations/[id]/assessments` and `useSaveSmsAssessment`. **No new write path.**
- Target resolution via `resolveAssessmentTarget` (WI-1); each non-`ready` state renders its own remedy inline:
  - `needs_worker` → "Match this conversation to a member".
  - `needs_campaign` → campaign picker (reuse the sidebar's `excludeSmsEpisodes` query).
  - `needs_real_campaign` → decision 6 prompt: "Standalone chat — choose the campaign these assessments belong to", persisted to `sms_lists.assessment_campaign_id`.
- Empty pinned set → **Pin an assessment** opening `<CreateAssessmentDialog lockKind="assessment" onCreated={…} />`, which creates **and** pins in one gesture.
- Conversation notes render directly below, expanded, reusing `useAddSmsNote` and the note list already in `SmsMemberSidebar`.

### WI-11 — Board setup: pin the assessment at start

In the chat pathway setup (`app/(dashboard)/campaigns/[id]/sms/setup/page.tsx` → board create), add an optional **"Assessment for this chat"** step: multi-select of the campaign's assessments plus **Create new**. Mirrors the phone pathway's assessment-setup step. Skippable — pinning is also possible mid-session via WI-10. For a standalone chat this is where the decision-6 nomination naturally happens first.

### WI-12 — Routes and types

- **`PATCH …/sms-lists/[listId]`** (or the existing `…/[listId]/actions`, whichever matches the file's shape) accepts `{ selected_assessment_ids?: number[], assessment_campaign_id?: number | null }`.
  - `can_write_to_campaign` on the list's campaign **and** on the nominated campaign — an organiser must not pin assessments from a campaign they cannot write to.
  - Every id must be an `activity_kind='assessment'` row in the effective campaign; reject unknown ids with a 400 naming them.
  - `assessment_campaign_id` may only be set when the list's own campaign is `is_sms_episode`; 409 otherwise.
  - On **first rating save** (not on nomination), upsert `campaign_worker_membership` into the nominated campaign, reusing the chunked pattern in `ensureSmsEpisodeMembership` (`src/lib/sms/sms-episode.ts`). Nominating must not bulk-add 300 people because someone opened a dropdown.
- **`GET …/[listId]/p2p`** grows `list.selected_assessment_ids`, `list.assessment_campaign_id`, and per item `rating_summary: { activity_id, rating, binary_value } | null` (for the rail chip) and `last_inbound_at` (for the rail's relative time).
- **`src/types/sms.ts`**: extend `SmsP2pBoardPayload['list']` and `SmsP2pBoardItem` accordingly. Keep the "TODO replace with generated types" header — the switchover is not this phase's job.
- `pnpm gen:types` after the migration applies.

### WI-13 — Shared panes with the Inbox

Extract the middle+right composition into `src/components/sms/workspace/SmsConversationPanes.tsx`, consumed by both `SmsChatWorkspace` and `SmsInboxPanel`. **Do not** force a shared left rail — the Inbox's is a filtered queue with six state tabs, the workspace's is a board roster with a colour ladder; unifying them would be worse than two components.

Consequence for the Inbox: it inherits `WorkerChatCard` and `SmsPinnedAssessment` in its sidebar. Keep `SmsAssessmentPanel` there as the collapsed "All campaign assessments" fallback.

---

## 5. Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` green, including new `chat-rail-state.test.ts` and `chat-assessment-target.test.ts`.
3. ESLint clean on touched files (pre-existing issues excepted).
4. Migration applied DEV → `get_advisors` clean → PROD; `pnpm gen:types` committed.
5. **End-to-end against the mock provider:**
   - Open a board at the new route; confirm three panes at 1440px, right pane overlaid at 1100px, single pane at 800px.
   - Select an unmessaged member → opener composes in the middle pane with their name on the Send button → send → row moves to `messaged`.
   - Simulate an inbound → row turns orange and pulses within one poll → select it → pulse stops, row goes static amber, `unread_count` is 0 and `state` is still `needs_response` → reply → row goes green.
   - **`prefers-reduced-motion: reduce` in devtools: confirm no animation, static orange, unread badge still present.**
   - Type a half-draft on member A, switch to B, return to A — draft intact. Same for an unsent opener.
   - Select mode: "Select next 10" → send → confirm the 50 cap still warns.
   - Record a rating from the right pane at **1280px** — the regression that motivated the phase — and confirm it lands on the wall chart.
   - Edit phone, employer and role from the card; confirm the wall chart updates without a reload and `worker_activity_log` has the audit row.
   - Standalone chat: nomination prompt → nominate → rate → membership created, rating on that campaign's wall chart.
   - Triage thread (no worker): card and pinned control both show remedy copy; neither 500s.
   - Create an assessment inline from the empty pinned state; confirm created **and** pinned.
6. Extend `apps/organising-db/testsprite_tests/` for the workspace route.
7. Amend `docs/SMS_EXPANSION_BRIEF.md` §5.1 to record the 8b supersession (§0.2).

---

## 6. Risks and mitigations

1. **10-second poll vs. "flashes when a response arrives".** A pulse that starts up to 10s late undercuts the whole signal. *Mitigation:* drop the workspace route to a **5-second** poll (matching the brief's pulse-poll decision) while leaving `P2P_BOARD_POLL_MS` at 10s elsewhere. A handful of organisers on a small indexed query is negligible load. The `sms_messages.campaign_id` realtime upgrade (§E5) remains a follow-up and needs **no UI change** when it lands.
2. **Animated rows are an accessibility hazard.** A dozen pulsing rows is a vestibular trigger. `prefers-reduced-motion` handling is a release blocker, not a polish item, and the unread badge must carry the signal independently of both motion and colour.
3. **Editing `workers` from a high-throughput surface.** *Mitigation:* the card header always shows name and phone; the Send button names the recipient; no bulk-apply anywhere on this surface.
4. **Phone edits vs. live threads.** `sms_conversations.phone_e164` is part of the routing key (`our_number_id`, `phone_e164`, `campaign_id`). Editing `workers.phone` does **not** re-key existing conversations, and must not — history belongs to the number it was sent to. *Mitigation:* warn explicitly on save when the new number differs from the open conversation's, stating that the current thread stays on the old number and new sends use the new one. Confirm against `conversation-routing.ts` and add a test asserting the no-rekey contract.
5. **`can_write_to_campaign` is not enforced by RLS for the ratings RPC.** Every new write checks it explicitly, exactly as the assessments route documents. Adversarial review should treat a missing check as a blocker.
6. **Two live surfaces on one board.** *Mitigation:* delete the `SmsP2pPanel` sheet mount when the route lands. Two surfaces over one board invites divergent state.
7. **Stale pinned ids.** Covered by `pruneSelectedAssessmentIds` and a filter on read.
8. **Two assessment surfaces** (pinned + full list) write the same slot (`rating_phase='actual'`, `event_id IS NULL`). *Mitigation:* both read and invalidate the same query key `['sms-worker-assessment-ratings', …]`. On the review checklist.
9. **Scope creep into Phases 11/12.** Objections/issues and the source-taxonomy split are **not** in this commit. `source` stays `'sms'` until Phase 12.
10. **Phase size.** This is larger than Phases 8 or 9. Sequence per §7 so the independently shippable pieces land and typecheck first; if it must be split, the natural seam is after WI-9 (card + routes, wired into the existing Inbox sidebar) with the workspace shell following.

---

## 7. Sequencing

WI-1 (pure libs + tests) → §3 migration → WI-8 exports → WI-9 worker route → WI-7 card → WI-10 pinned assessment → WI-6 `mark_read` → WI-12 routes/types → WI-4 rail → WI-5 opener composer → WI-3 shell → WI-2 route → WI-13 shared panes → WI-11 setup step → verification.

Everything through WI-10 is independently shippable into the existing Inbox sidebar and should typecheck and pass tests on its own — that is the split seam if the phase needs one. Single commit at the end, on user approval of the specific git command.
