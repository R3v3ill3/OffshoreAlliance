# SMS Module — Development Brief (Research & Recommendations)

**Status:** Phase 0 (foundations) implemented 2026-08-10 — consent columns + STOP promotion, unified E.164 normalisation, SmsProvider abstraction (Mobile Message + mock), yabbr removed, sms_numbers registry, Mobile Message admin card, cron registered. Migration `20260810100000_sms_foundations.sql` pending apply. Mobile Message sandbox account being requested by OA.
**Date:** 2026-08-10 (updated with decisions same day)
**Scope:** Broadcast SMS with metrics · 2-way conversations (chat inbox) · in-chat engagement tracking, ratings & assessments · context scoping (activity / campaign / worker) · automated surveys & indicative ballots with integrity controls · "patch-through" relay · desktop + mobile.
**Provider:** Mobile Message API (https://help.mobilemessage.com.au/api, full reference at https://mobilemessage.com.au/api-documentation, OpenAPI spec at `/assets/openapi.json`).

---

## 1. Executive summary

Every requested capability is buildable, and the app is far better prepared than expected — there is already a working inbound-SMS→rating pipeline (`sms_interactions` + `trg_sms_to_rating` → `campaign_activity_ratings` with `source='sms'`), SMS-ready activity kinds (`sms_blast`, `sms_survey`), SMS-capable comms drafts/templates, and UI affordances (wall-chart SMS channel, badges, sequence-builder `sms_blast` step) waiting to be lit up. The module is largely a fourth channel sibling to the existing phone/email/task pattern, not a greenfield build.

**One requirement needs redesign:** true patch-through where the forwarded SMS appears to come from the original sender's mobile number is **not possible** — Mobile Message (like every compliant AU provider) only sends from registered sender IDs, and the ACMA SMS Sender ID regime (fully in force 1 July 2026) exists specifically to prevent it. The recommended replacement — **relay with attribution** — achieves every stated goal (visibility, target's number never exposed, pausable/cancellable) except literal caller-ID impersonation: the target receives from a stable dedicated number with the member identified via the configurable prefix/suffix, and replies bridge back through the platform.

**One compliance boundary:** formal protected action ballots must legally be conducted by the AEC or an FWC-approved ballot agent (FWA s443/s468A). The in-app ballot feature must be positioned as **indicative/informal polling only**, with explicit UI labelling.

**Two hard prerequisites with no existing precedent in the codebase:** (a) worker-level SMS consent/opt-out (no `workers.sms_opt_out` or any do-not-contact flag exists today — Spam Act 2003 requires a functional STOP); (b) unified E.164 phone normalisation (three divergent implementations exist today).

---

## 2. Provider findings — Mobile Message API

### 2.1 What it supports (all verified against docs)

| Capability | Support | Notes |
|---|---|---|
| Bulk send | ✅ | `POST /v1/messages`, up to **10,000 msgs/request**, 5 concurrent requests, 400+ msg/s to carriers. `custom_ref` per message for campaign tagging. |
| Scheduling | ✅ | `scheduled_for` per message; `DELETE /v1/messages` cancels scheduled sends with full credit refund. |
| Delivery reports | ✅ | `status` webhooks (`delivered`/`failed`, per message part) + `GET /v1/messages` polling (`pending/scheduled/sent/delivered/failed/cancelled`). Coarse — no carrier error codes. |
| Inbound / 2-way | ✅ | `inbound` webhooks with **`original_message_id`/`original_custom_ref` reply correlation built in**, plus `GET /v1/inbound` polling fallback. Requires a dedicated (or shared) number. |
| Webhook integrity | ✅ | HMAC signing (`X-MM-Timestamp`/`X-MM-Signature`), ~4h retry with exponential backoff, **not order-guaranteed** → handlers must be idempotent. |
| Opt-out handling | ✅ | Automatic STOP processing on dedicated/shared numbers → `type:"unsubscribe"` webhook; subsequent sends return `status:"blocked"`. `{optout}` token (20 chars). **API does not auto-append opt-out text — our composer must enforce it.** |
| Dedicated numbers | ✅ | First free with any credit purchase; extras **$100+GST/yr**; provisioned in seconds via dashboard (no API endpoint — manual step). |
| Sender IDs | ✅ | Registered senders only: dedicated/shared numbers, ACMA-registered alphanumeric (one-way), or owner-verified own mobiles (`POST /v1/senders`). |
| Idempotency | ✅ | `Idempotency-Key` header on sends. |
| Sandbox | ✅ | Test accounts on request (behave identically, sending disconnected). |
| MMS | ❌ | Not supported at all. |
| Arbitrary "from" number | ❌ | **Blocks literal patch-through.** See §6. |
| Logic engine / auto-replies | ❌ | No Twilio-Studio equivalent — all survey/routing logic lives in our app behind webhooks (fine: we want deep integration anyway). |
| Per-number webhook routing | ❌ | One inbound + one status URL per account; route internally off the payload `to` field. |

### 2.2 Pricing

Credits ex GST: 4c (500+), 3.5c (1k+), 3c (10k+), 2.5c (100k+); credits never expire; no monthly fees; **inbound free**. One credit = one 160-char GSM-7 part (unicode: 70/67 chars — the composer must warn on emoji/smart-quotes).

### 2.3 Key integration constraints to design around

1. **Account-level webhooks** → single `/api/sms/webhook` route dispatching on `to` number + event type.
2. **Out-of-order, at-least-once webhook delivery** → idempotency via UNIQUE on provider message id; state transitions must be monotonic.
3. **STOP is intercepted platform-side** → a survey answer of "stop" opts the member out before our parser ever sees it; treat `unsubscribe` webhooks as both consent events and (if a survey session is open) session terminators.
4. **Number provisioning is manual** → admin runbook step, numbers stored in an `sms_numbers` table with purpose assignments.
5. **Reply correlation** (`original_message_id`) matches the *most recent* outbound — good default, but our own conversation state remains the source of truth for thread attachment.

---

## 3. Best-practice findings — P2P texting platforms

Studied: GetThru/ThruText, Scale to Win, Spoke (open source — schema directly inspectable), Hustle, CallHub, Impactive, SimpleTexting, Textline, OpenPhone, yabbr (public docs are login-gated; findings directional), Strive/Ascend, Twilio Messaging Services.

### 3.1 The patterns that matter for this build

1. **Thread key = (our number, member number) pair.** SMS has no thread IDs. Inbound resolution: match open conversation on the pair → else most-recently-messaged context for that member on that number → else triage inbox with polite auto-reply (Strive's "Default Automation").
2. **Contact state machine (Spoke, copy verbatim):** `needs_message → messaged → needs_response → convo → closed`. Every queue, badge and report derives from this enum. Inbound always flips to `needs_response`.
3. **Send modes:** (a) admin blast (scheduled), (b) volunteer click-to-send P2P, (c) **blast initials + humans work replies** — recommended default for OA: automated initials are lawful in AU with consent, and organiser time is the scarce resource.
4. **Assignment, two tiers:** persistent member↔organiser routing (Hustle) as default where a standing relationship exists; dynamic batch claiming with release (Spoke/Scale to Win) for blitzes. The existing `claim_next_call_list_item()` soft-claim + TTL machinery is the same pattern.
5. **Sticky escalation inbox** (Scale to Win): once a thread is escalated (legal/industrial question), all future replies keep routing to the escalation inbox until de-escalated.
6. **Collision prevention:** soft claim + realtime presence ("X is viewing/typing") — warn, don't block. Supabase Realtime makes this cheap. Upgrade to hard locks only if collisions actually occur.
7. **The key UX — data capture inside the chat:** three-pane desktop (queue | thread | member sidebar), where the sidebar holds profile, rating/assessment controls, tags, opt-out button, internal notes; mobile collapses the sidebar to a bottom sheet. **Spoke's crown jewel:** selecting a scripted answer simultaneously records the response, loads the child script into the compose box, and fires side effects (rating update, tag, list add). Answers write to first-class member/assessment tables, never a texting silo.
8. **Internal notes** rendered in-thread in a distinct colour (Textline "Whispers"), with @-mentions.
9. **Composer guardrails:** live GSM-7/UCS-2 segment counter with merge-field worst-case estimation; launch blocked unless org name + opt-out line present; test-send-to-self; no third-party link shorteners (carrier spam filtering).
10. **Quiet hours:** no statutory AU rule (unlike US TCPA) but the convention is firm — default 9:00–20:00 recipient-local, every queued message stamped `send_before`, enforcement at the send worker, not just the UI.
11. **Metrics:** funnel (loaded → sent → delivered → replied → surveyed → opted out) with **delivered** as the response-rate denominator; per-sender reply latency (replying within ~20 min lifts engagement ~20%); "create list from responders" as a one-click follow-up action (CallHub) — closes the organising loop.
12. **Opt-out:** union-wide suppression (not per-campaign), keyword + one-click manual opt-out in-thread, START to re-subscribe, both logged; suppression applied in every audience query and re-checked at send time.

---

## 4. Best-practice findings — surveys, polling, ballots

### 4.1 Survey engine (reference: Twilio Studio, sized down)

The market splits into **reply-native SMS surveys** (higher completion for ≤5 short questions) vs **SMS-delivered web-link surveys** (better for long/validated instruments). Recommendation: build reply-native as the core; a web-link fallback via existing share-token patterns is a later option.

**Authoring model — linear list with optional per-answer branch** (not a flow canvas; matches how organisers think):

- Question types: `choice` (numbered menu with synonym sets), `yes_no`, `scale` (numeric range), `open_text` (verbatim, optional AI categorisation later).
- Per-survey settings: retry limit (default 2), question timeout (default 4h) + one nudge, session TTL (default 72h), reminder schedule (max 2, varied copy), quiet hours, handoff inbox, revote policy.
- Definitions are versioned; a session pins the version it started on.

**Per-recipient session state machine:**
`queued → invited → active(current_question, retry_count) → completed | expired | opted_out | handed_off | undeliverable`, with UNIQUE(survey, member) and **one active session per phone** (partial unique index).

**Inbound routing precedence (the critical function):**
1. Reserved keywords (STOP → opt-out + end session; HELP; human-escape word).
2. Open survey session on this phone → parse against current question (normalise case/whitespace/punctuation; value → label → synonyms → numeric).
   - Parse OK → record → branch → next question or complete (→ fire outcome actions).
   - Fail → retry ladder: (1) specific re-prompt with options, (2) restructured numbered menu, (3) hand off to organiser inbox with transcript, raw reply stored as unparsed.
   - Long free-text on a choice question → capture verbatim, surface to human, don't burn a retry.
3. No session → conversational inbox (normal 2-way flow).

**Evidence-based defaults:** cap surveys at 5 questions (completion cliffs after Q3–Q6: 1–3Q ≈ 83%, 9–14Q ≈ 56%); invitation + max 2 reminders to non-completers (reminders lift response 14–18%; SMS replies cluster within hours, so 24–72h gaps); track invalid-reply rate per question (>10–15% = rewrite the question).

**Outcome actions (first-class, defined at build time):** write answer → member field / support rating / `campaign_activity_ratings`, apply tag, add to list/segment, notify organiser, chain the next automation (existing `activity_sequences` machinery — `sms_reply` trigger is already hinted in `SequenceBuilder.tsx`).

### 4.2 Ballot mode (integrity layer on top of the survey engine)

> **Compliance boundary (must appear in UI):** formal protected action ballots must be conducted by the AEC (FWA s443(4) default) or an FWC-approved eligible ballot agent (s468A); the same applies to formal EA votes and registered-organisation elections. In-app ballots are **indicative only** — temperature checks, log-of-claims endorsement, straw polls. Commercial approved agents (Vero Voting, CorpVote) exist for the formal ones.

Mechanics, copied from election-grade practice:

- **Roll first:** freeze an eligibility roll at open; report turnout against the roll.
- **Vote-once by member, not phone** (handles shared handsets): UNIQUE(ballot, member); one completed vote per member.
- **Revote policy** per ballot: `locked` (default; "your vote is already recorded") vs `revote_until_close` (last response wins, supersessions logged).
- **Receipts:** on completion send a short verification code = hash(choices + member salt); a results audit view lists codes only, so voters can self-verify without admins mapping code→member.
- **Confidentiality (honest tradeoff):** SMS voting is inherently not receipt-free (the vote sits in the member's message history) and true anonymity+auditability simultaneously is an open research problem. Recommended: store vote-choice rows separated from delivery metadata, restrict choice-level reads to an audit role, document as "confidential, not anonymous".
- **Immutable event log:** roll frozen, invitations, credential/vote received (with provider message id), supersessions, close, tally.

---

## 5. Existing codebase — what the module builds on

(Full architecture map retained in research; the load-bearing facts:)

### 5.1 Already exists and is reused as-is

- **`sms_interactions`** (activity_id, worker_id, campaign_id, direction, body, cta_response, maps_to_rating/binary, external_message_id) with full RLS — the inbound store. Add: `phone_e164`, `send_id` FK, UNIQUE on `external_message_id` (webhook idempotency).
- **`trg_sms_to_rating` → `record_assessment_event(source:'sms')`** — inbound SMS with an `activity_id` already upserts `campaign_activity_ratings`. **No new rating plumbing needed for the basic path.**
- `campaign_activities.activity_kind` already allows `sms_blast`/`sms_survey`; `template_key='respond_sms'`; `campaign_activity_ratings.source` already allows `'sms'`.
- `campaign_comms_drafts` / `comms_template_library` already support `platform='sms'`; merge-field registry (`lib/comms/template-variables.ts`) is shared and already reused by phone scripts.
- `campaign_worker_lists` "build list → fire into channel" pattern — `fire/sms` is the obvious fourth sibling next to phone/email/task; the wall-chart already renders an (empty) SMS channel and the activity view comment says SMS is "intentionally absent" pending a list table.
- Patterns to clone: `record_call_attempt()` (atomic write path incl. `worker_campaign_connections` + `worker_activity_log`), `email_lists`/`email_send_log`/`email_engagement_events` (table shapes), Resend webhook route (raw-body signature verification, admin client, 200-on-skip), cron auth pattern (`CRON_SECRET`), soft-claim/TTL queue RPCs, share-token gated public routes, `can_write_to_campaign()` RLS template, Activists & WOCs module as the newest full-module template.

### 5.2 Gaps the module must fill (prerequisites)

1. **No worker-level consent/opt-out of any kind** — no `workers.sms_opt_out`, no do-not-contact flag; even email unsubscribe is unimplemented. Spam Act hard requirement.
2. **Phone normalisation split-brain** — three inconsistent implementations (import: local `04…`; display; yabbr client: E.164). Must unify into one `lib/phone/normalise-phone.ts` and add `workers.phone_e164` (+ optional `phone_status` mirroring `email_status`).
3. **Orphaned yabbr scaffolding** — `lib/api/yabbr.ts` + `/api/yabbr` route are dead code with **no auth, no rate limit, no persistence**, and an env-vs-`app_settings` key split-brain. **Decided (§8): remove entirely** — client, route, and the admin "Yabbr API" settings card (replaced by a Mobile Message card). Salvage before deletion: the `formatAustralianPhone()` E.164 logic (folds into the unified normaliser) and the `DEFAULT_SMS_TEMPLATES` seed content (re-seeded into `comms_template_library` with `platform='sms'`).
4. `do_not_call` disposition from phone ops is never promoted to a worker-level flag — unify with new consent columns.
5. `/api/cron/materialise-sequence-runs` is written but **not scheduled in `vercel.json`** — `sms_blast` sequence steps depend on it.

---

## 6. Patch-through: what we can and cannot build

**Cannot build (declare out of scope):** forwarding an inbound SMS so it lands on the third party's phone appearing to come from the member's own mobile. Blocked three ways: Mobile Message requires registered senders (owner-verified via SMS link); ACMA's Sender ID Register regime (in force 1 July 2026) regulates sender identity precisely to kill this pattern; no compliant carrier route offers it anywhere (spoofed-sender routes are the smishing mechanism). yabbr has no publicly documented SMS patch-through either — if OA has seen it demonstrated, get the mechanics in writing before relying on it (likely it was patch-through *calling*, which is an established product category, or relay-with-attribution).

**Accepted replacement — "SMS relay with attribution"** (meets the stated goals: dedicated inbound number, forwarding, prefix/suffix, target's number never exposed to members, pause/cancel at any time). Two use cases, one mechanism:

- **Advocacy patch-through** — members text a campaign number; messages forward to a target (MP, employer contact) with attribution; replies bridge back.
- **External-party forwarding (decided in scope, 2026-08-10)** — messages arriving on a particular number for a particular campaign are forwarded to an external party (e.g. an official, contractor, or ally **without platform access**), so they can participate in campaign SMS traffic while OA retains full visibility, logging, and the ability to pause/cancel — and without ever exposing the external party's number to members. This is the general form of the feature; advocacy patch-through is a configuration of it.

Design:

- Admin configures a **relay**: dedicated number ↔ one or more target mobiles, with prefix/suffix template (merge fields: member name, employer, vessel/OU), status `active | paused | ended`, optional per-member moderation queue, quiet hours, audit log.
- Outbound broadcast invites members to text the relay number.
- Inbound to that number → consent + keyword checks → (optional moderation) → forwarded to target(s) **from a stable platform dedicated number**, body = prefix + member message + suffix.
- Target replies → bridged back to the member (from the number the member originally texted), with the pair-mapping preserving thread continuity both ways. Member never sees the target's number; target never sees a raw unattributed message.
- Everything logged to the campaign activity; pause/cancel is a status flip that takes effect on the next webhook.

**Complementary pattern — member-originated actions:** broadcast a tappable `sms:`/`tel:` link so contact genuinely originates from the member's own phone and number (the only lawful way the target sees authentic member identity). Cheap to add to the composer; recommended as a sibling option in the relay setup UI.

Number budget note: each concurrently active relay target-context needs its own dedicated number ($100+GST/yr) to keep pair-mapping unambiguous — relays draw from the spare pool (§7.0).

---

## 7. Recommended architecture

### 7.0 Number model (decided 2026-08-10): one number per organiser

Starting inventory: **6 dedicated numbers** — one per organiser plus ~2 spares (first free, then $100+GST/yr each; provisioned manually via the Mobile Message dashboard and recorded in `sms_numbers`).

- Each organiser is assigned a number; all their outbound traffic (broadcasts they run, replies they send) originates from it, so a member always hears from "their" organiser's number — sticky sender and reply-to-organiser routing fall out of the assignment naturally, and the member's phone keeps one continuous thread per organiser relationship.
- Inbound resolution becomes: `to` number → owning organiser → open conversation on (number, member) pair → else most-recent context for that member with that organiser → else triage.
- Spares serve: relays (each active relay target-context claims one), survey-only sends where a campaign number is preferable, and organiser onboarding/turnover (a number can be reassigned; the `sms_numbers` history preserves attribution of past traffic).
- Consequence to accept: a member worked by two organisers has two threads (one per number). That matches the organising model (persistent organiser↔member relationships) and the phone-ops precedent.
- Cross-campaign traffic on one organiser number is disambiguated by our conversation state (activity/campaign linkage on the conversation row), not by the number — same as every platform studied.

### 7.1 Data model (new tables — following house conventions: SERIAL PKs, VARCHAR+CHECK, RLS via `can_write_to_campaign()`, service-role-only for webhook/event tables)

- `sms_numbers` — provisioned dedicated numbers: purpose (`organiser | relay | survey | spare`), `organiser_id` (nullable), status, assignment history (reassignment-safe attribution).
- `sms_lists` / `sms_list_items` — clone of `email_lists`/`email_list_items` (+ `phone_e164`, statuses incl. `delivered/failed/opted_out`); `campaign_worker_lists.fired_sms_list_id` + `default_purpose` CHECK extension.
- `sms_send_log` — clone of `email_send_log`: UNIQUE(draft, worker), provider_message_id, delivery timestamps, failure_reason, reply_count.
- `sms_delivery_events` — clone of `email_engagement_events`; service-role only.
- `sms_conversations` — the thread table: (our_number, worker_id/phone_e164) pair, campaign_id, activity_id (nullable), state enum (Spoke's), assignee, escalation inbox, last_message_at, claim fields (reuse soft-claim/TTL pattern).
- `sms_messages` — per-message rows linked to conversation + send_log/interaction; direction, body, segments, status, error.
- Internal notes: `sms_conversation_notes` (Whisper pattern).
- Survey engine: `sms_surveys`, `sms_survey_questions`, `sms_survey_sessions`, `sms_survey_answers` (+ ballot columns: roll snapshot table, receipt hash, event log table).
- Relay: `sms_relays`, `sms_relay_targets`, `sms_relay_messages` (moderation state, forward status).
- Consent: `workers.sms_opt_out` + `sms_opt_out_at/source`, `workers.phone_e164`, optional `phone_status`.
- Optional unifier RPC: `record_sms_message()` in the shape of `record_call_attempt()` (message row + list counters + `worker_campaign_connections(preferred_contact_method:'sms')` + `worker_activity_log` + rating upsert).

### 7.2 Server layer

- **`SmsProvider` interface** (modelled on `lib/phone/telephony/types.ts`): `sendBatch`, `getStatus`, `listSenders`, webhook payload verification/parsing. First impl: `MobileMessageProvider`. Keeps yabbr/Twilio swappable.
- **Single webhook route** `/api/sms/webhook` (clone Resend route shape): raw body → HMAC verify → dispatch on type (`inbound` | `unsubscribe` | `status`) → idempotent upserts via admin client → routing precedence (keywords → survey session → conversation pair → relay → triage).
- **Outbound dispatcher** `/api/cron/dispatch-sms-queue`: DB-state queue + cron drain (the `activity_sequence_runs` idiom), enforcing blackout windows (`send_before` stamps — see below), opt-out re-check at send time, throttle via `rate_limit_config`, `Idempotency-Key` on provider calls. Also register the existing unscheduled `materialise-sequence-runs` cron.
- **Blackout windows (decided 2026-08-10):** bulk sends respect a dynamic blackout period with marketing-standard defaults (send window 9:00–20:00 recipient-local; blocked outside it), **overrideable per campaign/send** — consent is explicit and the sector runs 24/7 (offshore swings mean "daytime" is meaningless for some cohorts), so an organiser with cause can widen or shift the window at composition time, with the override recorded on the send. One-to-one replies from the inbox are never blocked. Timezone source: worker's state/worksite where known, else campaign default.
- Reporting views: `vw_sms_campaign_summary` (shape of `call_campaign_summary`), fourth UNION branch in `vw_campaign_worker_list_activity`.

### 7.3 UI

- **Outreach → SMS sub-tab** (4th trigger beside Comms/Phone Ops/SOC) → `InlineSmsOpsPanel` modelled on `InlinePhoneOpsPanel`; route tree `campaigns/[id]/sms/{setup,lists,inbox,surveys,relays,live}` cloning phone/email trees; orchestrator wizard cloning `CreatePhoneCallOrchestrator`.
- **Composer:** reuse TipTap merge-field machinery + template library (`platform='sms'`); add GSM-7/UCS-2 segment counter with worst-case merge estimation, mandatory org-name + opt-out validation, test-send-to-self.
- **Inbox:** desktop three-pane (queue | thread | member sidebar with rating/assessment/tags/opt-out/notes — the sidebar writes through existing assessment plumbing); mobile collapses sidebar to bottom sheet; Tailwind-responsive only (no `use-dialer-surface` split needed — reuse `dialer-tokens` type/sentiment tokens). Realtime presence for collision warnings.
- **Context scoping (explicit user requirement):** the thread view carries a scope switcher — *this activity* (messages linked to the activity) / *this campaign* (all conversations with this worker in the campaign) / *all history* (whole-of-worker, via `WorkerSmsHistoryPanel` beside the existing call/email history panels). Data model supports it natively since every message carries worker + campaign + optional activity.
- **Survey builder:** list-based editor with per-answer branch overrides, live preview as a simulated phone thread, funnel report per survey (sent→delivered→started→completed, per-question drop-off).
- **Relay manager:** relay setup wizard, moderation queue, pause/cancel, per-relay audit log.
- Wall chart: remove the SMS empty state; fire/sms endpoint; admin page: provider credentials card (fix key-source split-brain: `app_settings` with env fallback), numbers inventory, credit balance readout.

---

## 8. Decisions (recorded 2026-08-10)

1. **Provider: Mobile Message, confirmed.** All yabbr code removed (client, `/api/yabbr` route, admin settings card) — see §5.2 item 3 for salvage notes. `SmsProvider` interface retained so a future provider swap stays cheap. OA is requesting a Mobile Message sandbox account (by email to hello@mobilemessage.com.au).
2. **Relay-with-attribution accepted** in place of sender impersonation, explicitly covering both advocacy patch-through and the general **external-party forwarding** use case (§6): campaign traffic on a given number forwarded to an external party without granting them platform access, with OA visibility and pause/cancel retained. Member-originated `sms:`/`tel:` links ship alongside as a composer option.
3. **Numbers: one per organiser + spares — 6 to start** (§7.0).
4. **Inbox access: staff organisers are the core scope. Delegate share links are a nice-to-have, not a must-have** — designed-for but deferred (Phase 8 stretch); the share-token pattern from phone ops is the template when it's picked up.
5. **Consent: present by definition.** All numbers are given voluntarily and explicitly to the OA for OA communications before import or manual entry — so consent exists prior to any list build. Still shipping (Spam Act + good practice): union-wide opt-out (STOP keyword + in-thread manual opt-out + START re-subscribe), consent-source recorded at import/entry, and suppression enforced in every audience query and at send time.
6. **Blackout windows: dynamic, defaulted to marketing standards, overrideable.** Bulk sends default to 9:00–20:00 recipient-local; per-campaign/per-send override is legitimate and expected given explicit consent and the 24/7 nature of offshore work; overrides are recorded. One-to-one replies never blocked. (§7.2.)
7. **AI reply drafting: in scope, context-aware.** See §8.2.

### 8.1 Remaining items — resolved (2026-08-10)

- **Ballots:** confirmed — in-app SMS balloting **supplements** formal AEC/FWC-agent-controlled ballots (e.g. protected industrial action), never replaces them, and the UI will say so explicitly. With that framing the compliance burden is modest: the indicative-only banner, vote-once integrity, and the audit log per §4.2; default revote policy `locked`; confidential-not-anonymous storage accepted.
- **Volumes/credits:** start at the 10k credit tier (3c/part); volume expected to grow post-launch — revisit tier after first campaigns.
- **MMS:** not required. Keep the option open if Mobile Message adds MMS later: the `SmsProvider` interface includes an optional media capability flag from day one, and `sms_messages` carries a nullable `media` JSONB column so schema and interface need no migration if/when MMS arrives (composer support would be a small later feature).

### 8.2 AI reply drafting — scope

Context-aware drafting inside the inbox, following the existing `AiBriefPanel` pattern from the email composer:

- **Context assembled per draft:** the conversation transcript; the worker's profile, current rating (1–5/unassessed), recent assessments and activity history; the campaign/activity the thread is scoped to (including the activity's CTA and script/canned replies); relevant campaign context variables (organiser name, employer, agreement).
- **Surface:** "Draft reply" action in the thread composer offering 1–3 candidate replies (e.g. answer + advance-the-CTA, answer-only, escalate/handoff tone), each editable before send — **never auto-sent**; segment counter applies to drafts.
- **Guardrails:** drafts must respect the member's opt-out state and scope (no inventing commitments, no industrial/legal advice — escalation is the canned answer for those; align with the existing sticky-escalation inbox); log that a draft was AI-assisted on the message row.
- **Stretch (same machinery):** open-text survey answer categorisation/sentiment rollups (uComms-style) for survey reporting, and suggested next-best-action after a rating change.
- Uses the Claude API consistent with the app's existing AI panels; model per the app's current AI configuration.

---

## 9. Delivery plan for the multi-agent build

Phases are sequential (each is a committable, testable increment per house git rules — no worktrees, single commit per phase):

- **Phase 0 — Foundations:** consent columns + STOP promotion + consent-source at import/entry; unified `normalise-phone.ts` + `workers.phone_e164` backfill; `SmsProvider` interface + `MobileMessageProvider` (against the sandbox account); **remove all yabbr code** (client, route, admin card — salvaging E.164 logic and template seeds per §5.2); `sms_numbers` with per-organiser assignment (§7.0); Mobile Message admin settings card; schedule `materialise-sequence-runs`.
- **Phase 1 — Broadcast:** `sms_lists`/`sms_send_log`/`sms_delivery_events`; composer with segment counter + compliance validation; fire/sms; dispatch cron with blackout windows (defaults + recorded overrides) and throttling; delivery webhook leg; basic metrics.
- **Phase 2 — Inbox & 2-way:** `sms_conversations`/`sms_messages`; inbound webhook routing (number → organiser → pair); three-pane inbox + mobile sheet; organiser assignment, claims, presence, canned replies, internal notes, escalation inbox; triage for unsolicited inbound.
- **Phase 3 — In-chat assessment capture:** sidebar rating/assessment writes through `record_assessment_event`; scripted answer → response + next script + side effects; context scope switcher (activity/campaign/worker); `WorkerSmsHistoryPanel`; wall-chart channel activation.
- **Phase 4 — Survey engine:** builder, session state machine, parser + retry ladder, nudges/reminders, outcome actions, funnel reporting; `sms_reply` sequence trigger.
- **Phase 5 — Ballot mode:** roll freeze, vote-once, revote policy (default `locked`), receipts, audit log, indicative-only labelling, restricted results view.
- **Phase 6 — Relay & forwarding:** relay config (advocacy patch-through and external-party forwarding, §6), forwarding + two-way bridging from spare numbers, moderation queue, pause/cancel, audit.
- **Phase 7 — AI assist, reporting & polish:** context-aware reply drafting (§8.2); campaign summary views, per-sender stats incl. reply latency, "list from responders", exports, docs/how-to.
- **Phase 8 (stretch, unscheduled) — Delegate share links:** password-gated delegate inbox access via the phone-ops share-token pattern; nice-to-have per §8 decision 4.

### 9.1 Orchestration recommendation

- **Pattern:** orchestrator-in-the-loop, one phase at a time — *not* a fire-and-forget fan-out. Phases share tables and routes; parallel mutation agents would conflict, and CLAUDE.md forbids worktrees. Within a phase: research/read agents may fan out in parallel; implementation is a single agent (or the orchestrator directly); then an independent review pass before the phase commit.
- **Per phase:** (1) planning agent produces a file-level plan from this brief + the codebase map; (2) implementation against the plan; (3) adversarial review agent (fresh context) checks the diff against the brief's compliance requirements (opt-out enforcement, RLS template adherence, webhook idempotency) — these are the highest-consequence failure modes; (4) migration review before any `supabase/migrations` file is finalised (213 existing migrations; naming/idempotency conventions matter); (5) single commit.
- **Verification harness:** a mock `SmsProvider` implementation from day one so send/webhook flows are testable without credits; seeded test campaign; the existing TestSprite setup (`apps/organising-db/testsprite_tests/`) can be extended per phase.
- **Standing context:** give every agent this brief + the §5 codebase map; require the RLS template and the `record_call_attempt()` write-path shape by name.

### 9.2 Model choice recommendation

- **Orchestrator / planning / adversarial review:** highest-capability tier available (Fable 5 / Opus-class). Planning quality and review rigour dominate outcomes here; these are low-token, high-leverage steps.
- **Implementation within a well-specified phase plan:** Sonnet-class is sufficient and faster/cheaper for the clone-heavy work (Phases 1–2 and the reporting half of Phase 7 are largely pattern-following against named templates). Use the top tier for Phase 0 (consent + normalisation touch many files), Phase 4 (state machine correctness), Phase 5 (integrity logic), Phase 6 (relay routing correctness), the AI-drafting half of Phase 7 (prompt/context design), and anything RLS/webhook-security related.
- **Not recommended:** Haiku-class for any code in this codebase (dense conventions, high blast radius on `workers`/ratings tables); background/batch agents for migrations (review those synchronously).

---

## 10. Key sources

Mobile Message API reference & help centre (mobilemessage.com.au/api-documentation; help.mobilemessage.com.au/api) · Spoke schema & ops docs (github.com/StateVoicesNational/Spoke) · GetThru/ThruText, Scale to Win, Hustle, CallHub, Impactive, Textline, OpenPhone help centres · Twilio Studio widget docs (survey state-machine reference) & Messaging Policy · ACMA SMS Sender ID Register (acma.gov.au) · Spam Act 2003 guidance · FWC/AEC protected action ballot rules (FWA s443, s468A; Form F34C) · ElectionBuddy/Vero Voting/CorpVote (ballot integrity practice) · uComms/yabbr public materials.
