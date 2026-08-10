# SMS Module — Phase 3 Implementation Plan (In-chat assessment capture)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§3.1 item 7 Spoke scripted answers, §5.1 existing rating pipeline, §7.3 context scoping)
**Builds on:** Phase 2 (`docs/SMS_MODULE_PHASE2_PLAN.md`) — inbox, conversations, canned replies, `useSmsInbox` hooks. `packages/db-types/generated.ts` is CURRENT (all Phase 0–2 SMS tables + `record_assessment_event` present); the Phase 2 hand-written rows in `src/types/sms.ts` remain the source for conversation-table shapes.
**Status:** Implemented 2026-08-11 (migration `20260811100000_sms_assessment_capture.sql` pending apply — one nullable column, everything else works without it).
**Git:** single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Objectives

1. **Sidebar rating capture (the core):** when a conversation is worker-matched and campaign-attached, the member sidebar renders a ratings panel over the campaign's assessments (`campaign_activities.activity_kind = 'assessment'`) — 1–5 chips with `RATING_LEVELS` colours + an explicit "Unassessed" state, binary options (`VOTE_SUPPORTER_OPTIONS`) where `is_binary`, per-activity notes. Writes go through the **existing** pipeline: `record_assessment_event(source 'sms')` → `campaign_activity_ratings`.
2. **Scripted answers (Spoke §3.1 item 7, scoped pragmatically):** when the conversation is attached to an activity, quick-capture buttons record the member's reply as an outcome ("Record: Yes") AND pre-fill the compose box from a canned reply linked via a new nullable `sms_canned_replies.outcome_value` column.
3. **Context scope switcher (brief §7.3):** thread-header segmented control — This activity / This campaign / All history — with server support on the conversation GET; non-native scopes are read-only merges, the composer keeps sending to the current conversation.
4. **Wall-chart activation:** drop the SMS "not yet available" empty-state special case in `worker-detail-sheet.tsx` — the `vw_campaign_worker_list_activity` sms branch (Phase 1 migration §9) already feeds it.

Out of scope (later phases): surveys (4), ballots (5), relay (6), AI drafting (7). All Phase 1–2 behaviour and tests preserved.

---

## The assessment write path (exact chain)

`SmsAssessmentPanel` → `useSaveSmsAssessment` → **`POST /api/sms/conversations/[id]/assessments`** → auth (`createClient()` user session) + rate limit + `rpc('can_write_to_campaign')` → **`rpc('record_assessment_event')`** (user client; the RPC is `SECURITY DEFINER` with `GRANT EXECUTE TO authenticated` — 20260805100000) with `p_source 'sms'`, `p_rating_phase 'actual'`, `p_event_id NULL`, `p_actor_id = auth user` → upsert into `campaign_activity_ratings` on `(activity_id, worker_id, rating_phase, event_id)` (`UNIQUE NULLS NOT DISTINCT`).

Decisions inside that chain:

- **RPC direct, not an `sms_interactions` insert.** `trg_sms_to_rating` fires only on `INSERT` with `direction='inbound'` — a staff-recorded assessment is not an inbound message, and the trigger swallows errors (`EXCEPTION WHEN OTHERS`), so the RPC gives the route real error surfacing. This mirrors `record_call_attempt`'s internal calls.
- **`p_event_id := NULL`**, following `20260624110000_fix_call_attempt_rating_event_id.sql`: an SMS thread is not an `activity_events` occurrence; NULL = "rating against the activity in general" and avoids the `car_event_id_fk` violation.
- **Explicit Unassessed = row delete.** `record_assessment_event` refuses all-null values, so clearing a previously saved rating deletes the `(activity, worker, 'actual', NULL-event)` row through the user client — same as the wall-chart Ratings tab's delete, RLS-gated identically.
- **Guard rails:** conversation must be worker-matched and campaign-attached; the activity must belong to that campaign; `can_write_to_campaign` is checked before any write (matching `POST …/messages`).
- **`worker_campaign_connections` / `worker_activity_log`: deliberately untouched.** There is no lightweight shared RPC for the connection upsert (`record_call_attempt` does it inline in SQL), and an assessment save is a *judgement*, not a *contact* — the SMS contact itself already happened as message traffic, and re-saves of an upsert must not inflate `contact_count`. Wiring contact counters to message traffic is a candidate for a later phase; noted per the phase spec's escape hatch.

Known upstream quirk (accepted, documented for review): the RPC's `ON CONFLICT` uses `COALESCE(EXCLUDED.x, old.x)` for rating/binary/notes — saving a rating over an old binary keeps the old binary (and vice versa), and notes can't be cleared to NULL via the RPC. Identical semantics to every other `record_assessment_event` caller; the explicit-clear path (delete) is the reset hatch.

## Work item 1 — Migration `supabase/migrations/20260811100000_sms_assessment_capture.sql`

Minimal by design: `ALTER TABLE sms_canned_replies ADD COLUMN IF NOT EXISTS outcome_value VARCHAR(30) NULL` + comment. No backfill, no new grants (table-level grants cover new columns), **no change to `record_assessment_event`** (already executable by `authenticated`). Idempotent, house style.

## Work item 2 — Server routes

- **`POST /api/sms/conversations/[id]/assessments`** (new): body `{activity_id, rating, binary_value, notes}`. Auth → `checkRateLimit` → load conversation → 409 unless worker-matched + campaign-attached → activity must belong to the conversation's campaign → `can_write_to_campaign` → clear (both values null ⇒ delete) or save via `rpc('record_assessment_event')` as above. Returns `{ok, rating_id}` / `{ok, cleared}`.
- **`GET /api/sms/conversations/[id]?scope=`** — `conversation` (default; bit-for-bit Phase 2 response), `activity`, `campaign`, `all`:
  - `activity` (requires `activity_id` on the thread): the native conversation's messages filtered to those whose `interaction_id` → `sms_interactions.activity_id` matches, **plus** messages at/after the earliest linked one ("messages after attach" — attach time isn't stored, so the first activity-linked message is the cut line; empty until a linked message exists, with a UI hint).
  - `campaign` (requires worker + campaign): messages merged across **all** of this worker's conversations in the campaign, ascending, capped at the newest 200; read-only.
  - `all` (requires worker): same merge across every conversation for the worker (the whole-of-worker leg, server-side rather than embedding `WorkerSmsHistoryPanel` — same data, no layout surgery in the thread pane).
  - Non-native scopes add `conversation_labels` (conversation_id → campaign/number label) so merged bubbles show provenance; `notes` stay native-thread-only (they're per-conversation).
- **`/api/sms/canned-replies`**: GET selects + POST accepts optional `outcome_value` (trimmed, ≤30 chars, nullable).
- **`/api/sms/webhook` (inbound leg, additive):** the two open-conversation candidate selects also pull `activity_id`; when the routing decision *attaches* to an activity-attached thread, the `sms_interactions` insert now stamps that `activity_id`. `trg_sms_to_rating` stays a no-op for these rows (no `maps_to_rating`/`maps_to_binary`/`cta_response`), but the interaction↔activity link powers the activity scope and the brief §5.1 pipeline for any future keyword mapping. No other webhook behaviour changes.

## Work item 3 — UI

- **`components/sms/inbox/SmsAssessmentPanel.tsx`** (new): replaces the Phase 2 sidebar placeholder. Fetches the campaign's assessments (typed browser client, mirroring the wall-chart Ratings tab query) + the worker's current `'actual'`/NULL-event ratings. Per activity: chips — explicit **Unassessed** (zinc, `RATING_LEVELS[0]`) + 1–5 in `RATING_LEVELS` colours with `rating_labels` overrides (CtaRatingsPanel's rendering) or `VOTE_SUPPORTER_OPTIONS` pills when `is_binary` — plus a notes input and a dirty-aware Save. Saved state re-syncs from the ratings query.
- **Quick capture (scripted answers)** in the same panel, shown when the thread has an attached activity: "Record reply outcome" buttons (binary options, or the 5 levels for scale assessments). One tap = record via the same route **and**, when a canned reply with matching `outcome_value` exists (campaign-scoped preferred over org-wide), load its body into the compose box — Spoke's answer→record→next-script gesture, sized to our stack.
- **`SmsMemberSidebar.tsx`**: placeholder swapped for the panel; new "Attach to activity" select (campaign activities; uses the existing PATCH `attach` action, which already accepts `activity_id`) so threads can be activity-scoped without leaving the inbox; the save-as-canned form gains an optional outcome select (from the attached activity's options) writing `outcome_value`.
- **`SmsThreadView.tsx`**: header segmented control — *This thread/This activity* | *This campaign* | *All history* (segments render only when applicable: activity attached / campaign + worker / worker). Non-native scopes fetch via `useSmsScopedMessages`, render read-only with provenance labels and an info line; the composer stays live and always sends to the current conversation.
- **`worker-detail-sheet.tsx`**: the `channel === "sms"` empty-state special case ("not yet available") is removed — sms rows render exactly like phone/email/task (the view already returns list_name/list_status/added_at in the shared shape).

## Work item 4 — Hooks & types

- `useSmsInbox.ts`: `useSmsScopedMessages(conversationId, scope)` (GET with `?scope=`, enabled for non-native scopes), `useSaveSmsAssessment(conversationId, campaignId, workerId)` (invalidates the conversation, `campaign-rating-summary`, `campaign-activity-ratings(+dist)`, `worker-activity-ratings` — same set as `useSaveActivityRating`), `useCreateCannedReply` carries `outcome_value`.
- `types/sms.ts`: `SmsCannedReplyRow.outcome_value: string | null`; scope DTO types.

## Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — all suites green (routing tests untouched).
3. ESLint on touched files (pre-existing issues ignored).
4. Deferred to apply-time: migration apply + `get_advisors`; live capture check that a sidebar save lands in `campaign_activity_ratings` with `source='sms'` and surfaces on the wall chart.

## Notes / decisions taken in-phase

- Assessment writes call `record_assessment_event` directly from the route via the user client — the RPC is granted to `authenticated`, so no admin-client fallback was needed; `can_write_to_campaign` still gates it because SECURITY DEFINER bypasses RLS.
- No `worker_campaign_connections` / `worker_activity_log` writes (rationale above).
- Activity scope's "messages after attach" is approximated by the first activity-linked message (no attach timestamp is stored; adding one was judged not worth a second migration column this phase).
- `sms_interactions` gets no row for staff-recorded assessments — `campaign_activity_ratings` (source `'sms'`, `rated_by_user_id`) is the audit record, exactly as for phone-pathway ratings.

## Agent/model notes

Adversarial review should focus on: the `can_write_to_campaign` gate ahead of the SECURITY DEFINER RPC (no campaign-less writes possible), the clear-vs-save split (delete scoping to `rating_phase='actual'` + `event_id IS NULL`), scope-merge query caps and read-only enforcement (composer must never post to a non-native conversation), the webhook `activity_id` stamp not waking `trg_sms_to_rating`, and the RPC's COALESCE upsert quirk when flipping between rating and binary.
