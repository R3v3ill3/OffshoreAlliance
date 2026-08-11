# SMS Module — Phase 4 Implementation Plan (Survey engine)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§4.1 survey engine — THE spec for this phase; §2.3 constraint 3 STOP intercepted platform-side; §5.1 rating pipeline; §9 Phase 4 scope)
**Builds on:** Phases 0–3 (`docs/SMS_MODULE_PHASE{0,1,2,3}_PLAN.md`). `packages/db-types/generated.ts` is CURRENT through Phase 3; both DBs migrated through Phase 3. The Phase 4 migration `20260811120000_sms_surveys.sql` is NOT applied in this phase — all new-table access goes through the admin/service client or hand-written shims in `src/types/sms.ts`.
**Status:** Implemented 2026-08-11 (migration pending apply).
**Git:** no commit in this phase run (per task constraints); single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Objectives

1. `sms_surveys` / `sms_survey_questions` / `sms_survey_sessions` / `sms_survey_answers` with the §4.1 session state machine (`queued → invited → active → completed | expired | opted_out | handed_off | undeliverable`), `UNIQUE(survey_id, worker_id)`, and **one live session per phone** (partial unique index on `state IN ('invited','active')`).
2. A **pure, thoroughly unit-tested survey engine** (`lib/sms/survey-engine.ts`): tolerant answer parsing (value → label → synonyms → numeric; yes/no synonym sets; scale bounds; freetext-on-choice detection), branching `nextStep`, the 2-retry ladder → handoff, and question rendering.
3. Webhook inbound precedence per §4.1: reserved keywords → **open survey session on the phone** → conversational routing (Phase 2 behaviour unchanged when no session).
4. Timers cron (`/api/cron/sms-survey-timers`, every 10 min): invitation dispatch (blackout-respecting, one-live-per-phone deferral), question-timeout nudges (one per question), reminders (max `reminder_offsets.length`), session TTL expiry.
5. Outcome actions: answers on `write_rating` questions write ratings **via `sms_interactions` + the existing `trg_sms_to_rating` trigger** — zero new rating plumbing (brief §5.1).
6. Survey builder UI (Surveys tab in `InlineSmsOpsPanel`: Blasts | Inbox | Surveys): list, editor with live phone preview + >5-question warning + invitation compliance validation, audience selection at open time, open/close, funnel report.

Out of scope: ballots (Phase 5 — but the `purpose` column ships now with `'indicative_ballot'` allowed), relay (6), AI (7). All Phase 1–3 behaviour and tests preserved.

---

## The answer → rating write path (exact chain, decided)

Survey webhook leg → parsed answer on a question with `write_rating = true` and `survey.activity_id IS NOT NULL` → **INSERT `sms_interactions`** (admin client) with `activity_id = survey.activity_id`, `campaign_id = survey.campaign_id`, `direction 'inbound'`, `cta_response = parsed`, and `maps_to_rating` / `maps_to_binary` from the engine's `outcomeMapping()` → the EXISTING `trg_sms_to_rating` → `record_assessment_event(source 'sms', event_id NULL, phase 'actual')` → `campaign_activity_ratings`.

- `outcomeMapping(question, value)`: `scale` answers that are integers 1–5 → `maps_to_rating`; `yes_no` → `maps_to_binary` (`'yes'`/`'no'`); `choice` values that are integers 1–5 → `maps_to_rating`, otherwise `maps_to_binary = value` (clamped to 30 chars — `binary_value` is unconstrained VARCHAR(30)); `open_text` and out-of-1–5 scale values → no mapping (interaction row still inserted, trigger no-ops).
- **Not the RPC directly** — inserting the interaction row keeps a first-class inbound audit record, reuses the Phase 0/§5.1 pipeline verbatim, and cannot double-write (the survey path REPLACES the conversational-routing interaction insert for the message; exactly one interaction row per inbound, keyed UNIQUE on `external_message_id`).
- Every survey interaction row is stamped with `activity_id = survey.activity_id` (when set — the Phase 3 activity-scoping idiom), but `cta_response`/`maps_to_*` ride **only** on parsed `write_rating` answers — critical, because `fn_sms_to_rating` falls back to `cta_response` as a binary value whenever `activity_id` is set. Non-write_rating answers therefore carry the activity link with all three value fields NULL (trigger no-ops).
- Campaign/activity coherence is validated at build time (the surveys POST rejects an `activity_id` outside the survey's campaign), which is what makes the admin-client write safe.

## Work item 1 — Migration `supabase/migrations/20260811120000_sms_surveys.sql`

House style: idempotent DDL, VARCHAR + CHECK, `can_write_to_campaign()` RLS template, REVOKE-then-GRANT is N/A (no new RPCs — every service write is a plain admin-client statement), `update_updated_at` triggers, grants incl. sequences, `GRANT SELECT` views.

- **`sms_surveys`** — `survey_id SERIAL`, `campaign_id NOT NULL → campaigns CASCADE`, `activity_id NULL → campaign_activities SET NULL` (ratings target), `title VARCHAR(200)`, `purpose CHECK ('survey','indicative_ballot') DEFAULT 'survey'` (ballot columns land in Phase 5), `status CHECK ('draft','open','closed') DEFAULT 'draft'`, `version INT DEFAULT 1`, settings (`retry_limit INT DEFAULT 2`, `question_timeout_minutes INT DEFAULT 240`, `session_ttl_hours INT DEFAULT 72`, `reminder_offsets JSONB DEFAULT '[1440,2880]'`), `handoff_escalate_to UUID NULL`, `sender_number_id → sms_numbers`, `timezone VARCHAR(50) DEFAULT 'Australia/Perth'`, `blackout_override BOOLEAN DEFAULT false` + `blackout_override_reason`, `invitation_body TEXT` (first outbound — must pass `validateSmsBody`), `completion_body TEXT`, `opened_at`/`closed_at`, `created_by`, timestamps + trigger.
- **`sms_survey_questions`** — `question_id SERIAL`, `survey_id CASCADE`, `sort_order`, `prompt TEXT`, `qtype CHECK ('choice','yes_no','scale','open_text')`, `options JSONB` (choice: `[{value,label,synonyms[]}]`; scale: `{min,max}`), `branching JSONB NULL` (`{"<parsed value>": <question_id> | "end"}`), `write_rating BOOLEAN DEFAULT false`, `invalid_prompt TEXT NULL`, `nudge_text TEXT NULL`, timestamps + trigger.
- **`sms_survey_sessions`** — `session_id SERIAL`, `survey_id CASCADE`, `survey_version INT`, `worker_id NOT NULL → workers CASCADE`, `phone_e164 VARCHAR(16)`, `conversation_id NULL → sms_conversations SET NULL`, `state CHECK` (8 states above) `DEFAULT 'queued'`, `current_question_id NULL → sms_survey_questions SET NULL`, `retry_count INT DEFAULT 0`, `nudged BOOLEAN DEFAULT false` (per-question; reset on advance), `reminders_sent INT DEFAULT 0`, `last_prompt_at` (timer anchor for nudges), `invited_at`, `first_answer_at`, `last_activity_at`, `completed_at`, timestamps + trigger. `UNIQUE(survey_id, worker_id)`; **partial unique** `ON sms_survey_sessions(phone_e164) WHERE state IN ('invited','active')` — multiple `queued` sessions per phone allowed, exactly one live (§4.1). The index doubles as the race guard: a queued→invited transition that would create a second live session fails 23505 and the cron defers it.
- **`sms_survey_answers`** — `answer_id SERIAL`, `session_id CASCADE`, `question_id CASCADE`, `raw_body TEXT`, `parsed_value VARCHAR(50) NULL` (NULL = unparsed/freetext/handoff capture; open_text values clamped to 50 — verbatim lives in `raw_body`), `invalid_attempts INT DEFAULT 0` (powers the invalid-reply-rate report), `provider_message_id VARCHAR(100)`, `received_at`, `created_at`. **`UNIQUE(session_id, question_id)` with upsert semantics — re-answers overwrite; the append-only audit trail lives in `sms_messages`** (decision per phase spec).
- **Views:** `vw_sms_survey_funnel` (per-survey session counts by state + `started_count` from `first_answer_at`) and `vw_sms_survey_question_stats` (per-question `answered_count`, `unparsed_count`, `invalid_attempts` sum) — `GRANT SELECT TO authenticated` (Phase 1 view idiom).
- **RLS:** `sms_surveys`/`sms_survey_questions` — read `USING (true)` to authenticated; INSERT/UPDATE/DELETE gated `can_write_to_campaign` (questions via the parent survey). `sms_survey_sessions`/`sms_survey_answers` — **read authenticated, no write policies** (writes are service-role only: webhook, cron, and the open/close routes after an explicit `can_write_to_campaign` check).
- **Grants:** surveys/questions full CRUD + sequence usage to authenticated; sessions/answers `SELECT` only.
- **`activity_sequence_triggers.event_kind`: no change** — read of `20260607130000` confirms it is free-text `TEXT NOT NULL` (no CHECK), so per the phase spec the CHECK extension is skipped.

## Work item 2 — Pure engine `lib/sms/survey-engine.ts` (+ tests — the heart of the phase)

- `normaliseAnswer(raw)` — lowercase, trim, strip punctuation (Unicode-tolerant), collapse whitespace.
- `parseAnswer(question, rawBody)` → `{kind:'parsed', value}` | `{kind:'invalid'}` | `{kind:'freetext_on_choice'}`:
  - `choice`: match order **value → label → synonyms → numeric menu position** (1-based against the rendered menu order).
  - `yes_no`: built-in synonym sets (yes/y/yeah/yep/yea/ya/ok/okay/sure/si/aye/definitely/absolutely/true/1 vs no/n/nope/nah/na/never/false/2 — first-token match tolerated, e.g. "yes please").
  - `scale`: integer within `{min,max}` (bare number extraction, e.g. "8/10" rejected, "8" ok, "  8." ok).
  - `open_text`: always parses; value = raw trimmed (clamp to 50 happens at write time).
  - **Freetext-on-choice** (brief §4.1 — capture verbatim, surface to human, do NOT burn a retry): non-`open_text` question, no match, and the normalised reply has ≥ 3 words or > 60 chars.
- `nextStep(questions, currentQuestion, parsedValue)` — branching JSONB override (`question_id` | `'end'`) else next by `sort_order` → `{kind:'question'}` | `{kind:'complete'}`. Unknown branch targets fall back to sort order (belt against stale authoring).
- `retryLadder(question, retryCountSoFar, retryLimit)` — attempt 1: specific re-prompt (question's `invalid_prompt` or a generated "Sorry — reply with one of: …"); attempt 2: restructured numbered menu ("Please reply with just a number: 1. … 2. …"); at/after `retryLimit` (default 2) → `{kind:'handoff'}`.
- `renderQuestion(question)` — prompt + numbered menu for `choice`, "Reply YES or NO", "Reply with a number min–max", plain prompt for `open_text`. `renderInvitation(survey, firstQuestion)` — invitation_body + blank line + first question (**one combined send** — decided: a separate Q1 message would double invitation cost; the builder previews and segment-counts the combined body).
- `outcomeMapping(question, value)` (see write-path section) and `isStopKeyword(body)` (inline STOP/unsubscribe guard — belt behind Mobile Message's platform-side interception, §2.3 constraint 3).
- Tests `__tests__/survey-engine.test.ts`: parse tolerance/punctuation/case, synonyms (built-in + per-option), numeric menu position vs value collision, scale bounds + non-integer rejection, open_text passthrough, freetext-on-choice thresholds (word-count and length triggers; short garbage stays `invalid`), branching (override, `'end'`, fallthrough, unknown target), retry ladder copy + handoff at limit, renderers, outcomeMapping (scale 1–5 vs 0–10, yes_no, numeric choice, 30-char clamp), STOP keyword shapes.

## Work item 3 — Webhook survey leg (`/api/sms/webhook`)

Inbound precedence (§4.1) — inserted in the `inbound` branch after phone/worker resolution, **before** conversation routing; `status`/`unsubscribe` branches and the no-session inbound path are bit-for-bit Phase 3 behaviour:

1. **Reserved keywords:** inline STOP guard (`isStopKeyword`) — normally intercepted platform-side, but if seen: worker opt-out mirror + live/queued sessions on the phone → `opted_out`; never parsed as an answer. Audit-trail parity with the unsubscribe branch: a worker-matched STOP also inserts the `sms_interactions` row (no activity/cta/maps values — fires `trg_sms_optout_keyword` + `worker_activity_log`) and, when a terminated session already carries a conversation, appends the STOP message to that thread (no new routing is built for id-less STOPs without a thread). The **`unsubscribe` branch** now also terminates sessions on the phone (`queued`/`invited`/`active` → `opted_out`) per §2.3 constraint 3.
2. **Open survey session on the phone** (`state IN ('invited','active')` — the partial unique index guarantees ≤ 1): the survey path handles the message entirely (below) and conversation routing is skipped.
3. No session → Phase 2/3 conversational routing, unchanged.

Survey path (all admin-client):
- Belt: survey no longer `open` → session `expired`, fall through to conversational routing.
- **Idempotency gate (up front, before any write):** dedupe only when BOTH the thread message (by `provider_message_id`) AND an answer row for the current question already exist. A crash between the thread append and the answer upsert leaves the answer missing, so the provider retry **recovers** it (at-least-once) instead of dropping it (at-most-once). Residual edge (accepted): a branch loop-back re-answer that crashes post-append dedupes against the old answer — branch loops are rejected at build time anyway.
- **Id-less replay guard:** with no `provider_message_id` there is no dedupe handle, so an identical `raw_body` already captured on the current question within the last 10 minutes is treated as a redelivery. Residual window (accepted, documented): an id-less provider delivering a member's genuine identical re-send within 10 minutes is swallowed — Mobile Message always supplies ids, so this only affects the mock.
- Append the inbound `sms_messages` row to the session's conversation (upsert on `provider_message_id`; **all survey traffic lives in the thread** so handoff arrives with the transcript already in place).
- Insert the `sms_interactions` row (worker-matched; maps values only on parsed `write_rating` answers — see write path), link `interaction_id` on the message row.
- Parse against `current_question_id`:
  - **parsed** → upsert `sms_survey_answers` (overwrite semantics), reset `retry_count`/`nudged`, stamp `first_answer_at`/`last_activity_at`, state `invited → active`; `nextStep` → send next question (or `completion_body` + state `completed`); conversation gets **timestamp-only** touches (guarded, monotonic) — deliberately NOT `touch_sms_conversation_inbound`, so in-flight survey threads don't flood the needs-response queue with unread bumps.
  - **invalid** → `invalid_attempts` bump on the answer row (raw captured, `parsed_value` NULL), retry ladder: re-prompt sends + `retry_count` bump, or **handoff**: session `handed_off`, conversation escalated to `survey.handoff_escalate_to` (sticky `escalated_to_user_id`, only when unset) + `touch_sms_conversation_inbound` (unread + `needs_response` — this one SHOULD surface).
  - **freetext_on_choice** → capture (answer upsert, `parsed_value` NULL, no retry burn), no auto-reply, `touch_sms_conversation_inbound` so a human sees it; stamps `first_answer_at` (the free-text IS engagement — `started_count` must not undercount); session stays live (a follow-up proper answer overwrites and advances).
  - Every state transition is a guarded `UPDATE … WHERE state IN ('invited','active')` that reports whether it matched — when it didn't (cron expiry/opt-out race mid-flight), the outbound reply is **not** sent.
- **Blackout stance (decided, per phase spec):** question-to-question replies inside an active session are conversational — the member just texted us — and send immediately, never blackout-blocked (mirrors the Phase 2 1:1 rule). Invitations, nudges and reminders are bulk-adjacent and respect the blackout window (cron-side).
- Worker opt-out re-check before every prompt send; provider `blocked` → opt-out mirror + session `opted_out`.
- Prompt send failures never 500 the webhook (the answer is already recorded; the nudge timer recovers the conversation) — logged, session stays consistent.
- The `replied` delivery event still recorded; `increment_sms_reply_count` is skipped (survey prompts are not `sms_send_log` rows — their `custom_ref` is `survey-<session_id>`).
- **`sms_reply` sequence trigger: skipped, noted.** `tg_activity_event_evaluate_sequences` fires off `activity_events` inserts, and `activity_events.event_kind` has its own CHECK (`meeting|vote|action|other`) that excludes `sms_reply` — there is no ingestion point for a free-form `sms_reply` event without widening that CHECK, which is outside this phase's migration scope (per phase spec: "if triggers are driven by activity_events rows, skip and note"). `SequenceBuilder`'s placeholder text stays a hint.

Shared server helpers live in `lib/sms/survey-runtime.ts` (NOT pure — admin-client I/O): survey/question/session loaders, `ensureSurveyConversation` (thread-key upsert, the blast-mirror idiom), `sendSurveyPrompt` (provider send + outbound message append + `last_prompt_at` stamp), guarded conversation timestamp touch. Used by both the webhook and the timers cron.

## Work item 4 — Timers cron `/api/cron/sms-survey-timers` (vercel.json, every 10 min)

`CRON_SECRET` bearer auth + service client (dispatch-sms-queue clone). Per run (capped, error-summary response):

1. **Invitation dispatch:** for each `open` survey (blackout window open in the survey's timezone unless `blackout_override`): claim `queued` sessions one at a time (`UPDATE … WHERE state='queued'`; a 23505 from the one-live-per-phone index = another survey holds the phone → **defer**, stays queued). Pre-screen: worker opt-out → `opted_out`; phone missing/mismatch → `undeliverable`; live session already on the phone (any survey) → defer without claiming. Compliance re-check of `invitation_body` at dispatch time (non-compliant → survey skipped + surfaced, nothing sends). `ensureSurveyConversation` (campaign-scoped thread on the survey sender number) → send `renderInvitation` (invitation + Q1 combined) with `customRef survey-<session_id>` → session `invited` (invited_at, current_question_id = Q1, last_prompt_at, survey_version pinned). Provider `blocked` → opt-out mirror + `opted_out`; error/failure → revert claim to `queued` (transient) after marking nothing else; repeated failures surface in the summary.
2. **Question-timeout nudges:** live sessions with `nudged = false` and `last_prompt_at` older than `question_timeout_minutes` → one nudge (question `nudge_text` or "Just checking — " + re-rendered question). **Claim-before-send:** `nudged = true` + `last_prompt_at` are set by a guarded conditional UPDATE (`WHERE nudged = false AND state live`) BEFORE the provider call — an overlapping tick matches zero rows and skips; a failed send reverts the flag (best effort, logged; `last_prompt_at` stays stamped, so the retry waits out another timeout). Blackout-respecting (deferred to next window).
3. **Reminders:** live sessions with `reminders_sent < reminder_offsets.length` and `invited_at + offsets[reminders_sent]` elapsed → varied-copy reminder + re-rendered current question. Same claim-before-send shape: the counter is bumped conditionally on its previous value before the send, reverted (guarded) on failure. Anti-stacking guard: skipped when any prompt went out in the last 60 min. Blackout-respecting. Max 2 by default (§4.1). Invitation-path provider `error` results are surfaced in the run summary's `errors[]` as well as `undeliverable`.
4. **TTL expiry:** live sessions with `invited_at` older than `session_ttl_hours` → `expired` (set-based per survey). Also expires stragglers on `closed` surveys (belt — the close route does it first).

## Work item 5 — Routes (sms-lists conventions: auth, RLS + explicit `can_write_to_campaign` before admin writes, `checkRateLimit` on mutations)

- **`GET/POST /api/campaigns/[id]/sms-surveys`** — list (surveys + question counts + funnel view rows) / create (title, purpose, activity_id validated against the campaign, settings, invitation/completion bodies, sender, questions[]). Questions created in order; **branch targets arrive as question indexes and are rewritten to real `question_id`s server-side**. Validation: qtypes, choice needs ≥ 2 options, scale min < max, retry/timeout/TTL bounds, reminder_offsets an int array (≤ 2 entries per §4.1), **branch-graph cycle detection** (DFS over default-next + branch edges — a loop would re-ask questions forever, so branches effectively only point forward or to End), >5-question soft cap is UI-side only. The engine additionally sanitises options JSONB at parse time (non-string labels/synonyms are coerced/dropped), so even authoring that bypasses route validation via PostgREST can never make the webhook throw.
- **`GET/PATCH/DELETE /api/campaigns/[id]/sms-surveys/[surveyId]`** — detail (+questions + funnel + per-question stats); edit **draft-only** (questions replaced wholesale; editing after open is rejected — sessions pin `survey_version`, and post-open immutability is the Phase 4 simplification); delete draft-only.
- **`POST /api/campaigns/[id]/sms-surveys/[surveyId]/actions`** — `{action: 'open', audience}` | `{action:'close'}`. Open: draft-only, ≥ 1 question, active sender number, compliant invitation; audience = whole campaign or a saved worker list (sms-lists audience idiom, paged); screens opt-out/no-phone (reported, not sessioned); **sessions inserted 'queued' via the admin client** (service-role-only writes) after the explicit campaign gate, `ignoreDuplicates` on `(survey_id, worker_id)`; status `open` + `opened_at`. Close: `open → closed`, live sessions → `expired`.

## Work item 6 — UI (`components/sms/surveys/`, hooks in `lib/hooks/useSmsSurveys.ts`)

- `SmsSurveysPanel.tsx` — Surveys tab content: stat cards, survey cards (status/purpose badges, funnel mini-bar), "New survey" + detail sheets; open sheet with audience picker; close/confirm; funnel report (invited → started → completed + state breakdown + per-question answered/drop-off/invalid-rate table, `>10–15% invalid = rewrite` hint per §4.1). "Delivered" is approximated by invited (invitation-level delivery tracking deferred — noted).
- `SmsSurveyEditor.tsx` — linear question list (add/remove/reorder), per-type editors (choice option rows with value/label/synonyms, scale min/max, yes/no, open text), per-answer branch selects (choice/yes_no → question index or End), `write_rating` toggle (shown when the survey has an activity target), invalid/nudge overrides, invitation body with `validateSmsBody` + combined-invitation segment counter, completion body, settings block, **live phone-style preview** driven by the pure engine's renderers, **>5 questions warning** (§4.1 completion-cliff evidence).
- `InlineSmsOpsPanel.tsx` — third tab: **Blasts | Inbox | Surveys**.

## Work item 7 — Types

`types/sms.ts`: hand shims `SmsSurveyRow`, `SmsSurveyQuestionRow` (+ `ChoiceOption`/`ScaleRange`/qtype/branching), `SmsSurveySessionRow` (+ state union), `SmsSurveyAnswerRow`, funnel/stats DTOs. `generated.ts` untouched (migration not applied this phase).

## Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — Phase 1–3 suites green + the new `survey-engine` suite.
3. ESLint on touched files (pre-existing issues ignored).
4. Deferred to apply-time: migration apply + `get_advisors`, live invitation → answer → rating check on the sandbox number.

## Notes / decisions taken in-phase

- Invitation and Q1 are **one combined send** (cost + §4.1 funnel: "invited" implies the first question is in hand).
- Answers table is upsert-overwrite with an `invalid_attempts` counter; append-only audit = `sms_messages`.
- Survey Q↔A exchanges do timestamp-only conversation touches (no unread/needs_response) — only freetext-on-choice and handoff surface the thread to humans.
- In-session replies send immediately (conversational); invitations/nudges/reminders respect blackout.
- `activity_sequence_triggers.event_kind` has no CHECK → no migration change; firing `sms_reply` events is not possible without widening the `activity_events.event_kind` CHECK → skipped and noted for a later phase.
- No new SQL functions: every service-side write is a guarded plain statement; the partial unique index is the concurrency control for session liveness.

## Agent/model notes

Adversarial review focus: the one-live-per-phone index vs queued→invited claims (23505 deferral), webhook idempotency gating (message-row newness before any session transition), the `cta_response` trap (`fn_sms_to_rating` treats it as binary whenever `activity_id` is set — must stay NULL on non-write_rating answers), STOP handling in all three lanes (platform unsubscribe webhook, inline guard, provider `blocked`), survey-path bypass never regressing Phase 2/3 routing, and blackout enforcement split (cron yes / in-session no).
