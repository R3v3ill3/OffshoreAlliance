# SMS Module — Phase 2 Implementation Plan (Inbox & 2-way conversations)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§9 Phase 2; model §3.1, routing §7.0, tables §7.1, UI §7.3)
**Builds on:** Phase 0 (`20260810100000_sms_foundations.sql`) + Phase 1 (`20260810120000_sms_broadcast.sql`) — both applied; `packages/db-types/generated.ts` includes their schema. The Phase 2 migration `20260810140000_sms_conversations.sql` is NOT applied in this phase — hand-written rows extended in `src/types/sms.ts`, and all new-table access goes through the untyped server/admin clients or API routes.
**Status:** Implemented 2026-08-10 (migration pending apply; db-types regeneration deferred until then).
**Git:** single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Objectives

1. `sms_conversations` / `sms_messages` / `sms_conversation_notes` / `sms_canned_replies` with the Spoke state machine (`needs_message → messaged → needs_response → convo → closed` + `triage`), soft-claim TTL fields, sticky escalation, atomic-counter RPCs.
2. Inbound webhook routing (brief §7.0 precedence: to-number → owning organiser → (number, member) pair → triage), extracted as a **pure, unit-tested decision function**.
3. Outbound blast mirroring: dispatch cron upserts conversation rows + outbound message rows for every successful send.
4. Reply sending (never blackout-blocked, no bulk compliance footer — brief decision 6), conversation management routes (assign / escalate / close / attach), notes, claim/release.
5. Three-pane desktop inbox inside the SMS Outreach sub-tab ("Blasts" | "Inbox" secondary tabs), mobile full-screen thread + bottom-sheet sidebar, Supabase Realtime presence (warn-don't-block) + live thread updates.
6. `WorkerSmsHistoryPanel` beside `WorkerCallHistoryPanel`.

Out of scope (later phases): in-chat assessment capture / scripted answers / rating writes (3 — the sidebar shows a placeholder), surveys (4), ballots (5), relay (6), AI drafting (7). All Phase 1 behaviour (status/unsubscribe webhooks, dispatch, blast UI, tests) is preserved.

---

## Work item 1 — Migration `supabase/migrations/20260810140000_sms_conversations.sql`

House style: idempotent DDL, `VARCHAR + CHECK` (no PG enums), `can_write_to_campaign()` RLS template, grants incl. sequences, `update_updated_at` triggers, `REVOKE`-then-`GRANT` on SECURITY DEFINER functions.

- **`sms_conversations`** — the thread table (brief §7.1): `conversation_id SERIAL`, `our_number_id INT NOT NULL → sms_numbers`, `worker_id INT NULL → workers ON DELETE SET NULL` (NULL = unmatched inbound/triage), `phone_e164 VARCHAR(16) NOT NULL` (member side), `campaign_id INT NULL → campaigns ON DELETE SET NULL`, `activity_id INT NULL → campaign_activities ON DELETE SET NULL`, `state VARCHAR(20) CHECK IN ('needs_message','messaged','needs_response','convo','closed','triage') DEFAULT 'triage'`, `assignee_user_id UUID → auth.users`, `escalated_to_user_id UUID → auth.users` (sticky: while set, the thread keeps surfacing in the escalation inbox regardless of state), `claim_user_id UUID → auth.users` + `claimed_until TIMESTAMPTZ` (soft claim TTL), `unread_count INT DEFAULT 0`, `last_message_at` / `last_inbound_at` / `last_outbound_at`, timestamps + trigger. `UNIQUE NULLS NOT DISTINCT (our_number_id, phone_e164, campaign_id)` — exactly one thread per number-pair per campaign scope (closed rows occupy the key too, which is what makes "reopen on new inbound" a single-row flow; requires PG ≥ 15, which both DBs run).
- **`sms_messages`**: `message_id BIGSERIAL`, `conversation_id INT NOT NULL → sms_conversations ON DELETE CASCADE`, `direction CHECK ('inbound','outbound')` (matching `sms_interactions.direction` values rather than the brief's shorthand in/out), `body TEXT`, `phone_e164`, `sender_user_id UUID` (outbound), `provider_message_id VARCHAR(100) UNIQUE` (plain UNIQUE constraint — NULLs allowed, and a full constraint so PostgREST `ON CONFLICT (provider_message_id)` upserts can infer it; a partial index cannot be inferred by PostgREST), `interaction_id INT → sms_interactions ON DELETE SET NULL` (link to the assessment-capture row when one exists), `status CHECK ('received','queued','sent','delivered','failed') DEFAULT 'received'`, `error TEXT`, `segments INT`, `created_at`. Index `(conversation_id, created_at)`.
- **`sms_conversation_notes`** (Textline-Whisper): `note_id SERIAL`, `conversation_id → CASCADE`, `author_user_id UUID NOT NULL`, `body TEXT NOT NULL`, `created_at`.
- **`sms_canned_replies`**: `reply_id SERIAL`, `campaign_id NULL → campaigns CASCADE` (NULL = org-wide), `title`, `body`, `is_active DEFAULT true`, `created_by`, timestamps + trigger. No seeds.
- **RPCs** (SECURITY DEFINER, `SET search_path = public`, REVOKE-then-GRANT):
  - `claim_sms_conversation(p_conversation_id INT, p_ttl_minutes INT DEFAULT 5) RETURNS BOOLEAN` — sets `claim_user_id = auth.uid(), claimed_until = now()+ttl` when unclaimed, expired, or already own; row-lock via UPDATE serialises races; returns `FOUND`. Granted to `authenticated`.
  - `release_sms_conversation(p_conversation_id INT) RETURNS BOOLEAN` — clears own claim only. Granted to `authenticated`.
  - `increment_sms_reply_count(p_send_id BIGINT, p_received_at TIMESTAMPTZ) RETURNS VOID` — `reply_count = reply_count + 1`, `first_reply_at = COALESCE(first_reply_at, …)`; replaces the Phase 1 webhook read-modify-write. Service-role only.
  - `touch_sms_conversation_inbound(p_conversation_id INT, p_occurred_at TIMESTAMPTZ) RETURNS VOID` — atomic `unread_count + 1`, `last_message_at`/`last_inbound_at` monotonic (GREATEST), state: worker-less triage rows stay `triage`, everything else flips to `needs_response` (Spoke: "inbound always flips to needs_response" — this deliberately covers `convo` and `closed` too, a superset of the transitions enumerated in the task spec, so re-opened and in-conversation threads land back in the Needs-response queue). `escalated_to_user_id` untouched (sticky escalation). Service-role only.
  - `touch_sms_conversation_outbound(p_conversation_id INT, p_occurred_at TIMESTAMPTZ) RETURNS VOID` — blast-mirror leg: `last_message_at`/`last_outbound_at`, state `needs_message|closed → messaged`, others unchanged. Service-role only. (1:1 replies do a plain RLS-checked UPDATE from the route instead — no counter arithmetic needed there.)
- **Realtime**: `DO` block `ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages` catching `duplicate_object` (already a member) **and** `undefined_object` (publication absent — e.g. CI shadow DB) so the migration can never fail on it.
- **RLS** (house template): `sms_conversations` — read `USING (true)` to authenticated; INSERT/UPDATE/DELETE gated `campaign_id IS NULL OR can_write_to_campaign(campaign_id)` (null-campaign rows are org-wide triage — any authenticated staff member can work them, per brief decision 4: staff organisers are the core scope). `sms_messages` — read true; INSERT with the same check via the parent conversation; no user UPDATE/DELETE (immutable; status transitions are service-role). `sms_conversation_notes` — read true, INSERT `author_user_id = auth.uid()`, author-only UPDATE/DELETE. `sms_canned_replies` — read true; writes `campaign_id IS NULL OR can_write_to_campaign(campaign_id)`.
- **Grants**: table grants matching the policies + `USAGE, SELECT` on all four sequences to `authenticated`.

## Work item 2 — Pure inbound-routing lib (unit-tested)

`apps/organising-db/src/lib/sms/conversation-routing.ts`:
- `findNumberForInbound(numbers, to)` — tolerant match of the webhook `to` field against `sms_numbers.phone_e164` (E.164 / digits / local `04…` forms, compared on the AU significant 9 digits).
- `resolveInboundConversation(input)` — the brief §7.0 precedence as a pure decision function:
  1. no matched number → `none/no_number` (fall back to Phase 1 behaviour);
  2. un-normalisable `from` → `none/no_phone` (can't key a thread);
  3. open (state ≠ closed) conversations on `(our_number_id, phone_e164)` → attach, preferring campaign-scoped then most-recent;
  4. else open conversations for a matched worker on this number (the "number's organiser most-recent-open context" leg) → attach most recent;
  5. else `create`: `state = 'needs_response'` when a worker matched else `'triage'`; `campaign_id` from the correlated/most-recent `sms_send_log` row when within 7 days, else NULL.
- Tests `src/lib/sms/__tests__/conversation-routing.test.ts`: every branch, campaign-preference ordering, recency tie-breaks, the 7-day window boundary, tolerant number matching.

## Work item 3 — Webhook inbound leg (`/api/sms/webhook`)

Extend the `inbound` branch only (auth, `status`, `unsubscribe`, idempotency and 500-on-event-failure behaviour unchanged):
- Resolve `from → phone_e164`, matched workers, `to → sms_numbers` row, send correlation (existing custom_ref/original_message_id lookup, now also used as the campaign hint; falls back to the worker's most recent `sms_send_log` row ≤ 7 days).
- Query open conversations for the pair (and worker fallback), run `resolveInboundConversation`, then create/attach. Creation races and closed-thread keys are handled by catching `23505` on INSERT and re-selecting the exact `(number, phone, campaign)` key (the touch RPC then reopens closed threads as `needs_response`).
- Keep the existing `sms_interactions` insert for matched workers (now `.select('id')` so the message can carry `interaction_id`); unmatched inbound no longer early-returns — it gets a triage conversation + message with no interaction row.
- Insert the `sms_messages` row idempotently (upsert `ignoreDuplicates` on `provider_message_id` when present); **only when the message row is new**: `touch_sms_conversation_inbound` (atomic unread bump + state flip) and `increment_sms_reply_count` (atomic — also fixes the Phase 1 read-modify-write). The `replied` delivery-event insert keeps its own unique-key dedupe.
- When no number/phone match → exact Phase 1 behaviour (interaction + reply count via the new RPC), so nothing regresses.
- `status` branch bonus: delivered/failed events now also transition the matching `sms_messages` row (monotonic, from `'sent'` only) so threads show delivery state.

## Work item 4 — Dispatch cron blast mirror (`/api/cron/dispatch-sms-queue`)

After per-item result writes, for the run's successful sends (batched, ≤500-row chunks):
1. Look up open (state ≠ closed) conversations on `(list sender number, phone)`; prefer the list's campaign scope, else most recent.
2. For phones without one: upsert `(our_number_id, phone_e164, campaign_id = list.campaign_id)` rows with `worker_id`, `state 'messaged'` — the upsert lands on the NULLS-NOT-DISTINCT key, so a closed same-key thread is reopened as `messaged` rather than duplicated.
3. Insert `sms_messages` rows (direction `outbound`, `sender_user_id = list.created_by`, `status 'sent'`, provider id, segments) — upsert on `provider_message_id` for crash-retry idempotency.
4. Batch-update pre-existing conversations: `last_outbound_at`/`last_message_at` + `needs_message → messaged` (two set-based UPDATEs, no read-modify-write).

## Work item 5 — Server routes

- **`POST /api/sms/conversations/[id]/messages`** — 1:1 reply. Auth via `createClient()`; `checkRateLimit`; explicit `rpc('can_write_to_campaign')` when the conversation is campaign-scoped (null-campaign triage = any authenticated staff); worker `sms_opt_out` blocks sending (403 — STOP is union-wide; the member must START/staff-restore first); sender = the conversation's number (must be active). **Never blackout-blocked, no compliance-footer requirement** (brief decision 6 — bulk-only rules); body sent exactly as typed (trimmed, ≤ 1600 chars). Sends via `getSmsProvider().sendBatch`; writes the `sms_messages` row through the **user client** (RLS-checked) and flips the conversation `state → 'convo'`, `unread_count → 0`, stamps `last_outbound_at`. Provider `blocked` → mirrors worker opt-out (admin client, compliance-critical) + message row `failed`; provider error → message row `failed` + 502.
- **`GET /api/sms/conversations`** — queue list: `inbox=mine|needs_response|unassigned|triage|escalated|all`, `campaign_id`, `state`, `worker_id`, `search` (digits → phone ilike; text → worker-name lookup then `.in(worker_id)`), `limit`/`offset`; embeds worker name + number label; non-`all` tabs exclude `closed`.
- **`GET /api/sms/conversations/[id]`** — conversation + worker summary (name, employer via FK embed, occupation, phone, opt-out state), messages (ascending, paged via `before` cursor), notes, and a `user_profiles` display-name map for assignee/escalation/claim/note-author UUIDs.
- **`PATCH /api/sms/conversations/[id]`** — `{action}`: `assign` (user or null), `escalate` / `de_escalate` (sticky `escalated_to_user_id`), `close` / `reopen`, `attach` (campaign/activity; `23505` on the thread key → 409 with a clear message). User client — RLS enforces campaign write on both old and new row.
- **`POST /api/sms/conversations/[id]/notes`** — insert internal note (author = caller).
- **`POST /api/sms/conversations/[id]/claim`** / **`DELETE …/claim`** — `claim_sms_conversation` / `release_sms_conversation` RPCs.
- **`GET/POST /api/sms/canned-replies`** — org-wide + campaign-scoped rows; minimal create.

## Work item 6 — UI

- `components/sms/InlineSmsOpsPanel.tsx` — secondary tabs **Blasts | Inbox** (existing content unchanged under Blasts; `?sms_list=` still auto-opens there).
- `components/sms/inbox/SmsInboxPanel.tsx` — three-pane desktop (brief §7.3): queue list (tabs Mine / Needs response / Unassigned / Triage / Escalated / All; unread + state badges; search; campaign-scope toggle "This campaign / All conversations"), thread pane, member sidebar. Mobile: list ↔ full-screen thread (back button); sidebar collapses to a bottom `Sheet` from the thread header.
- `components/sms/inbox/SmsThreadView.tsx` — bubbles by direction, internal notes inline in amber, day separators, reply composer with live segment counter, claim-on-open (warn "claimed by X" — never blocks), presence pill ("X is viewing") and typing-collision warning via a Supabase Realtime presence channel (`sms-conv-<id>`, presence meta `{name, typing}` — warn-don't-block per brief §3.1 item 6), `postgres_changes` subscription on `sms_messages` filtered to the conversation for live updates (works once the migration's publication guard has run; silently a no-op otherwise).
- `components/sms/inbox/SmsMemberSidebar.tsx` — profile summary (name, employer, occupation, phone), **rating placeholder** ("assessments land in Phase 3"), opt-out status + one-click staff opt-out (writes `workers.sms_opt_out` source `'staff'` via the typed browser client), canned-reply picker (insert into composer) + minimal create form, notes composer, assign / escalate / close / attach-campaign controls (`user_profiles` + `campaigns` via the typed browser client).
- `components/workers/WorkerSmsHistoryPanel.tsx` — whole-of-worker SMS history: conversations (via `GET /api/sms/conversations?worker_id=`) + blast log (`sms_send_log` joined to draft titles via the typed client — Phase 1 tables are in generated types). Rendered beside `WorkerCallHistoryPanel` at both call sites in `workers/[id]/page.tsx`.
- `lib/hooks/useSmsInbox.ts` — TanStack Query hooks over the routes + claim/renew/release lifecycle + the realtime/presence hook; sonner toasts in components.

## Work item 7 — Types

Extend `apps/organising-db/src/types/sms.ts` with hand-written rows for `sms_conversations`, `sms_messages`, `sms_conversation_notes`, `sms_canned_replies` (+ DTO shapes in the hook module). `generated.ts` untouched (migration not applied this phase).

## Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — Phase 1 suites still green + new `conversation-routing` suite (precedence, ordering, 7-day window, number matching).
3. ESLint on touched files (pre-existing errors ignored).
4. Deferred to apply-time: migration apply, `get_advisors`, realtime publication verification, live send.

## Notes / decisions taken in-phase

- Inbound flips `convo → needs_response` (Spoke verbatim, brief §3.1 item 2) — a superset of the transition list in the phase spec, deliberate so worked threads re-enter the queue.
- `sms_messages.provider_message_id` is a full UNIQUE constraint (not the partial-index house variant) so PostgREST upserts can target it; NULLs remain allowed.
- 1:1 replies to opted-out workers are blocked with a clear error (compliance posture; provider would return `blocked` regardless).
- Vessel/OU in the sidebar is skipped (no cheap single-hop join from `workers`); employer + occupation shown.
- Queue-tab counts (badge totals per tab) deferred — unread badges are per-row.

## Agent/model notes

Adversarial review should focus on: webhook routing correctness (precedence, race on conversation create, closed-thread reopen), claim RPC races, RLS on null-campaign conversations (org-wide triage writes), the realtime publication guard, and that Phase 1 webhook/dispatch behaviour is bit-for-bit preserved outside the inbound branch.
