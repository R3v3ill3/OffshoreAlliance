# SMS Module — Phase 5 Implementation Plan (Indicative ballot mode)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§4.2 — THE spec: compliance boundary + banner language, roll-first mechanics, vote-once by member, revote policy, hash receipts, confidential-not-anonymous storage, immutable event log; §8 decision + §8.1: in-app ballots **supplement** formal AEC/FWC-agent ballots, never replace them, with explicit UI framing; default revote policy `locked`; confidential-not-anonymous accepted).
**Builds on:** Phase 4 (`docs/SMS_MODULE_PHASE4_PLAN.md`, migration `20260811120000_sms_surveys.sql`). `packages/db-types/generated.ts` is CURRENT through Phase 4 (incl. `sms_surveys` with the `purpose` CHECK already allowing `'indicative_ballot'`); both DBs are migrated through Phase 4. The Phase 5 migration `20260811140000_sms_ballots.sql` is NOT applied in this phase — new-table/column access goes through the admin/service client (both app Supabase clients are untyped) and hand shims in `src/types/sms.ts`.
**Status:** Implemented 2026-08-11 (migration pending apply).
**Git:** no commit in this phase run (per task constraints); single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Design principle

**A ballot IS a survey** with `purpose = 'indicative_ballot'` plus integrity extras. Everything rides the Phase 4 machinery — sessions, the parse/retry/branch engine, the timers cron, the inbox threads, the same route tree. Phase 5 adds: a frozen eligibility roll, vote-once/revote semantics, hash receipts, an append-only event log, an aggregate-only tally view, and the mandatory indicative-only compliance framing. No forked route trees, no second engine.

## Compliance boundary (brief §4.2 + §8.1 — decided language)

- Fixed UI banner (non-editable, shown in the editor and the ballot detail):
  **“Indicative poll only — formal protected action ballots must be conducted by the AEC or an FWC-approved ballot agent.”**
- Stored framing: a ballot cannot be OPENED unless its `invitation_body` contains the word **“indicative”** (case-insensitive; validated at open and re-checked by the dispatch cron as a belt). The editor auto-appends “This is an indicative poll only — it does not replace a formal AEC ballot.” when toggling a draft to ballot mode without the word present, and warns until it is.
- Confidentiality is documented honestly as **confidential, not anonymous** (§4.2): vote choices live in `sms_survey_answers` keyed by session→worker, and the member’s own SMS history holds their vote anyway (SMS is not receipt-free). The reporting surface is aggregate-only; per-member choices are simply never rendered for restricted ballots.

## Work item 1 — Migration `supabase/migrations/20260811140000_sms_ballots.sql`

House style: idempotent DDL, VARCHAR + CHECK, RLS enable + policy-in-DO-block, GRANT SELECT views.

1. **`ALTER TABLE sms_surveys ADD COLUMN IF NOT EXISTS`:**
   - `revote_policy VARCHAR(20) NOT NULL DEFAULT 'locked' CHECK ('locked','revote_until_close')` — §8.1 default `locked`.
   - `receipt_salt UUID NOT NULL DEFAULT gen_random_uuid()` — per-ballot salt for receipt hashes (backfilled for existing rows by the column default).
   - `results_restricted BOOLEAN NOT NULL DEFAULT false` — when true the UI renders no per-member answer surface; the tally view is the only reporting surface.
2. **`sms_ballot_roll`** — the eligibility roll frozen at open (§4.2 “roll first”): `roll_id SERIAL`, `survey_id → sms_surveys CASCADE`, `worker_id → workers CASCADE`, `phone_e164 VARCHAR(16)`, `included_at TIMESTAMPTZ DEFAULT now()`, `source VARCHAR(30) DEFAULT 'audience_freeze' CHECK`, `UNIQUE(survey_id, worker_id)`. Rows = exactly the invited audience (post consent/phone screening — the same rows that become `queued` sessions). Service-role writes only; authenticated SELECT.
3. **`sms_ballot_events`** — the immutable audit log (§4.2): `event_id BIGSERIAL`, `survey_id CASCADE`, `event_type VARCHAR(30) CHECK ('roll_frozen','invitation_sent','vote_received','vote_superseded','vote_rejected_locked','receipt_sent','ballot_opened','ballot_closed','tally_generated')`, `worker_id NULL`, `session_id NULL → sms_survey_sessions SET NULL`, `payload JSONB`, `occurred_at TIMESTAMPTZ DEFAULT now()`. **Append-only via grants:** authenticated gets SELECT only (no INSERT/UPDATE/DELETE grants or policies); every insert is service-role. No block-update trigger — a trigger would also break the legitimate `ON DELETE CASCADE` path when a campaign (→ surveys → events) is deleted; the grant model is the enforcement, documented here.
   - **Event payload confidentiality rule:** `vote_received`/`receipt_sent` payloads never contain the choices or the receipt code — storing the code beside `worker_id` would let staff map code→member, defeating the self-verification design. `vote_superseded` DOES snapshot the prior answers in its payload (that is its audit purpose — supersessions are logged per §4.2); this is part of the confidential-not-anonymous tradeoff.
4. **`vw_sms_ballot_tally`** — aggregate counts ONLY (no worker ids): per (survey, question, parsed_value) vote counts over **completed** sessions (an abandoned half-vote is not a vote), `WHERE purpose = 'indicative_ballot'` **and `qtype <> 'open_text'`** — verbatim free texts are not a tally and must not leak onto the restricted-ballot reporting surface (they stay readable via the existing answer surfaces for unrestricted ballots). `GRANT SELECT TO authenticated`. Turnout = COUNT(roll) vs funnel `completed_count`, computed route-side.
4b. **Audit-trail hardening:** the Phase 4 `sms_surveys` UPDATE/DELETE policies are DROPped and recreated **draft-only** (`status = 'draft' AND can_write_to_campaign(...)`, in both USING and WITH CHECK) — without this, staff could PostgREST-delete an open/closed ballot (cascading away the roll and event log) or rewrite `purpose`/`revote_policy`/invitation framing post-open. Legitimate post-draft transitions (the open/close status flips, `opened_at`/`closed_at`) move to the SERVICE ROLE in the actions route, behind its existing explicit `can_write_to_campaign` check, with status-guarded UPDATEs (`draft → open`, `open → closed`).
5. **Confidentiality separation — the pragmatic version (decided, per phase spec):** `sms_survey_answers` RLS stays read `USING (true)` for authenticated. True row-level restriction of choice reads to an audit role requires a role model the app does not have (per-user DB roles or a claims-based RLS predicate + role management UI) — out of scope. What ships: the UI never renders per-member choices for restricted ballots, the detail route returns only aggregates/receipts/events for the ballot block, and the tally view is the reporting surface. A determined staff member with PostgREST access can still read `sms_survey_answers` — documented honestly as confidential-not-anonymous (§4.2, accepted in §8.1).
6. Receipts: **no schema** — computed at completion time and recomputed for the audit list; never stored.

## Work item 2 — Pure ballot logic `lib/sms/ballot.ts` (+ tests)

Server/test-only module (imports `node:crypto` — never imported by client components; UI-safe constants live in `survey-validation.ts`).

- `computeBallotReceipt(receiptSalt, workerId, orderedParsedAnswers[])` → sha256 over `salt|workerId|q1:a1|q2:a2|…` — each answer is **bound to its question id** so a branch revote answering different questions with the same values cannot collide, and the `|`/`:` separators prevent `["1","23"]` vs `["12","3"]` and `12:"3"` vs `1:"23"` ambiguity (deliberate details on top of the spec’s “salt + worker_id + ordered parsed answers”). First 10 hex chars, uppercased, formatted `XXXX-XXXX-XX`.
- Ordered parsed answers = the session’s non-NULL `parsed_value`s (with their question ids) in question order (`sort_order`, `question_id`). Deterministic: same member + same choices + same salt ⇒ same code, so the audit list can be recomputed at any time (no stored receipts).
- `appendReceiptToCompletion(completionBody, receipt)` → completion + `Your receipt: XXXX-XXXX-XX. Keep this to verify your vote was counted.` (receipt sentence alone when no completion body).
- `decideBallotRevote(revotePolicy, parseResult)` → `'reject_locked' | 'supersede' | 'not_vote_attempt'`. Only a **parsed** answer to the ballot’s first question counts as a vote attempt — invalid/freetext inbound from a completed voter is a normal message and falls through to the Phase 2 inbox untouched (no auto-reply, no event). This keeps “call me back please” from being answered with “your vote is already recorded”.
- `LOCKED_REPLY` copy: “Your vote is already recorded and can’t be changed. This ballot allows one vote per member.” (close info omitted — ballots close manually; there is no scheduled close time to cite).
- Tests (`__tests__/ballot.test.ts`): receipt determinism; sensitivity to salt / worker / answer values / answer order; separator ambiguity; format shape; completion append with/without body; revote decision matrix (locked/revote × parsed/invalid/freetext).

## Work item 3 — Runtime (`lib/sms/survey-runtime.ts`, minimal extension)

- `recordBallotEvents(db, rows[])` — best-effort service-role insert (logged, never throws — a lost event must not 500 the webhook; at-least-once semantics documented).
- **Ballot completion** (inside `processSurveyInbound`, on the guarded `completed` transition when `purpose === 'indicative_ballot'`): load the session’s answers, compute the receipt, append the receipt sentence to `completion_body`, send (the completion send is now unconditional for ballots — the receipt must go out even with no authored completion body). Events: `vote_received` (worker, session; payload = provider_message_id only — no choices) always; `receipt_sent` only when the provider send succeeded (`sendReply` now returns the send result to make that observable).
- `findCompletedBallotSessionByPhone(db, phone)` — most recent `completed` session on the phone whose survey is `open` + `purpose 'indicative_ballot'` (inner-join filter; most recent `completed_at` wins if the phone somehow completed two open ballots).
- `processBallotPostCompletion(db, provider, args)` — the completed-session leg:
  - Belt: bundle missing / survey not open / not a ballot / no questions → `handled:false`.
  - Parse the inbound against **Q1**; `decideBallotRevote`:
  - `not_vote_attempt` → `handled:false` (conversational routing proceeds, bit-for-bit Phase 2/3).
  - **Idempotency gate for BOTH branches, before any state change:** a thread message row already existing for the `provider_message_id` means webhook redelivery → return `deduplicated` untouched. Load-bearing for supersede: a redelivery of the ORIGINAL completing message would otherwise reopen the session, and the inner `processSurveyInbound`’s own dedupe would never re-complete it — permanently un-completing the vote and logging a spurious supersession.
  - `reject_locked` → ensure/attach the thread, append the inbound (idempotent upsert), plain `sms_interactions` row (activity link, all three value fields NULL — the `cta_response` trap), quiet timestamp touch, `vote_rejected_locked` event (payload: raw body clip + provider id), opt-out re-check then send `LOCKED_REPLY` from the ballot’s sender number. Answers are NOT modified. `handled:true`.
  - `supersede` → guarded reopen `UPDATE … SET state 'active', current_question_id Q1, retry_count 0, nudged false, completed_at NULL, invited_at <now> WHERE session_id AND state='completed'` (0 rows or 23505 from the one-live-per-phone index → `handled:false`, belt); then **DELETE the session’s answer rows** — a revote taking a different branch must not leave stale answers ghosting into the tally view or baked into the new receipt (the prior vote survives in the `vote_superseded` payload snapshot, taken before the reopen); then `vote_superseded` event with the **prior answers snapshot** in payload; then hand the SAME inbound to `processSurveyInbound` on the refreshed session — the parsed Q1 answer records fresh, branches/advances, and re-completion mints a NEW receipt (last response wins, both votes’ receipts derivable, supersession logged). `invited_at` is re-stamped so the TTL timer restarts for the revote window (otherwise a late revote could be instantly expired by the cron mid-revote).
  - Redelivery topology: once reopened the session is LIVE, so a webhook retry is caught by `findLiveSessionByPhone` → `processSurveyInbound`’s existing dedupe — the completed-ballot leg only ever sees a message while the session is still `completed`.
  - Crash window (documented): a crash between the reopen and the `vote_superseded` insert loses that one event row (the reopen itself is exactly-once via the guarded state transition; the answer path recovers at-least-once as in Phase 4).

## Work item 4 — Webhook (`/api/sms/webhook`)

Precedence gains **step 2b**, between the live-session leg and conversational routing (exactly the “completed sessions currently fall through” point):

1. Reserved keywords (unchanged).
2. Live (`invited`/`active`) session on the phone → `processSurveyInbound` (unchanged).
2b. **No live session handled** → most recent completed session on an OPEN `indicative_ballot` → `processBallotPostCompletion`; when handled, record the `replied` delivery event and return (same shape as the survey leg).
3. Else conversational routing, bit-for-bit unchanged. Ordinary surveys’ completed sessions still fall straight through — 2b triggers only for open indicative ballots.

## Work item 5 — Routes (purpose-aware, no forked trees)

- **POST /sms-surveys** — accepts `purpose` (`'survey' | 'indicative_ballot'`), `revote_policy` (default `'locked'`), `results_restricted` (default false). `survey-validation.ts` drops its Phase-4 “ballot mode lands in Phase 5” rejection and validates the two new fields; `validateSurveyQuestions` is purpose-aware and rejects an `open_text` FIRST question for ballots (an open_text Q1 parses everything, so the revote leg would swallow every conversational message from completed voters).
- **PATCH /sms-surveys/[surveyId]** — same three fields editable (draft-only, as before); question validation uses the effective purpose (`body.purpose ?? survey.purpose`).
- **POST …/actions `open`** — for ballots, additionally: reject unless `invitation_body` contains the whole word “indicative” (`/\bindicative\b/i` — message cites the brief §4.2/§8.1 boundary); reject an `open_text` Q1 (belt behind the validators); **freeze the roll** — insert `sms_ballot_roll` rows for the exact invited audience (the same screened rows that become queued sessions) via the admin client; `ballot_opened` + `roll_frozen` events (payload: roll count + screened-out counts).
- **POST …/actions `close`** — for ballots: `ballot_closed` + `tally_generated` events (tally payload = the view’s rows at close time — the frozen result snapshot in the audit log).
- **GET /sms-surveys/[surveyId]** — for ballots returns a `ballot` block: `turnout` (roll count vs completed votes + pct), `tally` (view rows), `receipts` (recomputed over completed sessions — paged reads, codes only, **sorted lexicographically** so list order cannot be correlated with vote timing), `events` (most recent 200), `revote/restricted` flags ride on the survey row. Receipts are recomputed, never stored — a member reads their code from their own phone and staff confirm “your receipt appears in the list”. **`receipt_salt` is stripped from every API response** (list + detail — with the salt, staff could brute-force receipt→member mappings); the answers query chunks sessions at `floor(1000 / questionCount)` so >10-question ballots cannot silently truncate under the PostgREST row cap and corrupt the recomputed receipts. The open/close **status flips run on the service role** (the staff UPDATE policy is draft-only post-Phase 5), status-guarded, behind the route's explicit `can_write_to_campaign` check.
- **Timers cron** — ballots: `invitation_sent` events for successful invitation dispatches (batched per survey, best-effort); the “indicative” framing re-checked at dispatch time next to the Phase 4 compliance re-check (non-compliant ballot → invitations held + surfaced).

## Work item 6 — UI (`components/sms/surveys/`)

- **Editor** — purpose selector **Survey | Indicative ballot**. In ballot mode: the fixed non-editable compliance banner (exact §4.2 language above); auto-append of the indicative sentence on toggle when missing + persistent warning while `invitation_body` lacks “indicative” (server rejects open anyway); revote policy selector (locked default, labelled “One vote per member” / “Allow re-votes until close — last vote counts, supersessions logged”); results-restricted switch (“aggregate tally only — no per-member choices shown”).
- **Panel** — ballot badge on cards; draft detail shows the banner and opens with the roll-freeze semantics explained; ballot detail (open/closed) shows: banner, **turnout vs roll** (On roll / Votes cast / Turnout %), **tally table** per question (aggregate counts + share bars, from the view rows), **receipt list** (codes only, monospace, collapsible), **event log timeline** (from `sms_ballot_events`), close control. For `results_restricted` ballots the Phase 4 per-question stats block (which exposes unparsed-capture drill-in counts) is hidden — the tally is the whole reporting surface. No per-member answer surface exists for ballots in either mode.
- Hooks: `SmsSurveyDetail.ballot` extras + the three new settings fields on the save payload.

## Work item 7 — Types

`types/sms.ts` hand shims: `SmsBallotRevotePolicy`, three new `SmsSurveyRow` fields, `SmsBallotRollRow`, `SmsBallotEventType`/`SmsBallotEventRow`, `VwSmsBallotTallyRow`, `SmsBallotDetail` (turnout/tally/receipts/events DTO). `generated.ts` untouched (migration not applied this phase; both app Supabase clients are untyped so no tsc friction).

## Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — Phase 1–4 suites green + the new `ballot` suite.
3. ESLint on touched files (pre-existing issues ignored).
4. Deferred to apply-time: migration apply + `get_advisors`, live ballot open → vote → receipt → revote-locked check on the sandbox number.

## Notes / decisions taken in-phase

- Vote-attempt detection = “parses as a Q1 answer”; anything else from a completed voter routes to the inbox untouched (no robotic locked-reply to unrelated messages).
- Supersede feeds the SAME triggering inbound through the normal survey machinery after reopening at Q1 — a one-question ballot revote is therefore a single text.
- Receipt hash input uses `|` separators; receipts recomputed on read, never stored; codes never placed in event payloads (worker_id + code would de-anonymise the audit list).
- `sms_ballot_events` append-only is enforced by grants, not a trigger (a trigger would break campaign-delete cascades).
- `invited_at` re-stamped on supersede reopen so TTL restarts for the revote.
- Ballot completion sends even with no authored completion body (the receipt must reach the voter).
- Documented, left as-is: the locked path's id-less (mock-provider) redelivery has no dedupe handle; shared-handset votes attribute to the session's member (vote-once is by member per §4.2); a close racing step 2b can reject/reopen against a just-closed ballot (the bundle re-check narrows this to one webhook's flight time). **Small-ballot correlation caveat:** with very few voters, cross-referencing the tally, turnout and the receipt-list size can narrow who voted which way — inherent to publishing any small tally, accepted under confidential-not-anonymous.

## Agent/model notes

Adversarial review focus: the completed-ballot leg must never swallow conversational messages (only parsed Q1 answers trigger it); redelivery paths for locked (message-id gate) vs supersede (live-session takeover on retry); the reopen 23505 belt; receipt list ordering vs event-log timing correlation; `cta_response` staying NULL on the locked-path interaction row; roll rows matching sessionRows exactly; `results_restricted` hiding every per-answer surface the panel renders.
