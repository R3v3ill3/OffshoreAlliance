# SMS Expansion — Development Brief (Phases 8–12)

**Status:** Scoped. Decisions recorded §5 (2026-08-11). Ready for phase planning.
**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (Phases 0–7 research, decisions, provider findings)
**Builds on:** Phases 0–6 as implemented (`docs/SMS_MODULE_PHASE0_PLAN.md` … `PHASE6_PLAN.md`)
**Git:** primary working directory, no worktrees, single commit per phase (per `CLAUDE.md`). Work on the currently checked-out branch (`main`).
**Environment (pre-launch):** `main` is currently used for development and testing; the `main`/`develop` split exists so development can continue without impacting a live production version *once launched*. Until launch, keep **both** branches and **both** Supabase projects in sync — apply every migration to DEV (`dpnnmkhabysfdogllsyh`) first, then PROD (`gteygwfgjvczanmrwgbr`). Project refs and procedures: `docs/DEVELOPMENT_WORKFLOW.md`.
**Parent Phase 7:** not implemented — it is being run in a separate Claude Code session and is paused pending a usage-limit reset. Phases 8–12 do not depend on it. Its reporting/polish scope overlaps workstream F; the Phase 12 plan must note the overlap so the two efforts don't double-build.

---

## 1. What this brief covers

Six requested capabilities, restated as workstreams:

| ID | Workstream | One-line summary |
|----|-----------|------------------|
| **A** | SMS in the campaign header bar | Add an SMS entry point alongside Build list / Add assessment / Task management / Create Phone Call / Create Email. |
| **B** | SMS as a Build List purpose | Add `sms` to the wall-chart Build List purpose picker and fire bar. |
| **C** | Consistent audience building for SMS | Bring SMS blast audience selection to parity with email/phone, plus manual number entry and CSV/XLSX import with an optional match against the campaign workforce. |
| **D** | Assessments in SMS surveys | Let the survey author attach an existing assessment or create a new one inline, matching the phone-call setup. |
| **E** | Peer-to-peer chat workspace | Load a list, select a subset, send an editable template opener, then monitor and work many simultaneous 1:1 threads with a pinned assessment plus issue/objection capture. Sessions save and resume. |
| **F** | SMS assessment tracking & reporting | Track assessments made over SMS, report chats initiated / replies received / assessments recorded, and surface SMS assessments on the wall chart. |

**The single most important instruction for the implementing agents: a large fraction of this is already built.** Read section 2 before planning anything. Several requested items are configuration or wiring changes over existing machinery, and at least one (F's wall-chart surfacing) may already be complete.

---

## 2. What already exists — do not rebuild

### 2.1 SMS module as shipped (Phases 0–6)

- **Location:** `/campaigns/[id]?tab=outreach&sub=sms` → `src/components/sms/InlineSmsOpsPanel.tsx`. Four tabs: **Blasts**, **Inbox**, **Surveys**, **Relays**. There is **no** `/campaigns/[id]/sms/*` route segment — the module is entirely query-param driven.
- **Provider:** Mobile Message (`src/lib/sms/provider/`), with a mock provider for dev/test. Not Twilio.
- **Broadcast:** `sms_lists` / `sms_list_items` / `sms_send_log` / `sms_delivery_events`, dispatched by the `dispatch-sms-queue` cron every 5 minutes with blackout-window and throttle logic.
- **Conversations:** `sms_conversations` / `sms_messages` / `sms_conversation_notes` / `sms_canned_replies`, with a three-pane inbox (`SmsInboxPanel` → `SmsThreadView` + `SmsMemberSidebar`), soft claims, presence, escalation, triage, and a scope switcher (thread / activity / campaign / all history).
- **Assessment capture in chat:** `SmsAssessmentPanel` already writes through `record_assessment_event(source 'sms')` → `campaign_activity_ratings`, with 1–5 `RATING_LEVELS` chips, `rating_labels` overrides, `VOTE_SUPPORTER_OPTIONS` binaries, an explicit Unassessed state, and canned-reply quick capture.
- **Surveys:** `sms_surveys` + questions/sessions/answers, a builder with live preview, and a **ratings target already wired** — `sms_surveys.activity_id` plus a per-question `write_rating` toggle that writes ratings via `sms_interactions` → `trg_sms_to_rating`.
- **Ballots** (Phase 5) and **Relays** (Phase 6) exist and are out of scope here except where noted.
- **Realtime:** `sms_messages` is in the `supabase_realtime` publication. `useSmsConversationRealtime()` subscribes **per open conversation** (presence + `postgres_changes`). The conversation *list* has no realtime — it falls back to a 30-second poll.
- **Merge fields:** the composer supports `{{first_name}}`-style tokens with worst-case segment counting. Personalised openers are already possible.
- **Blast → conversation mirror:** `dispatch-sms-queue` creates or reuses a conversation per (sender number, member) pair and appends the outbound message. **Outbound-initiated threads already work** — this is the foundation workstream E builds on.

### 2.2 Already-present hooks for the requested work

| Requested thing | Already exists |
|---|---|
| `sms` as a worker-list purpose in the DB | `campaign_worker_lists.default_purpose` CHECK already allows `'sms'`; `fired_sms_list_id` column exists (`20260810120000_sms_broadcast.sql`). |
| Fire a worker list into SMS | `POST /api/campaigns/[id]/worker-lists/[listId]/fire/sms` exists and works end to end. |
| Assessment target on a survey | `sms_surveys.activity_id` + `sms_survey_questions.write_rating` + the "Ratings target (assessment activity)" select in `SmsSurveyEditor`. |
| SMS assessments on the wall chart | `campaign_activity_ratings.source = 'sms'` is an allowed value; Phase 3 removed the wall-chart "SMS not yet available" special case. **Verify before building.** |
| Worker's SMS list membership on the wall chart | `vw_campaign_worker_list_activity` already unions the `sms` channel. |
| Phone normalisation | `src/lib/phone/normalise-phone.ts` (`toE164`, `toE164Any`, `toLocal`, `toDisplay`). |
| Import matching | `src/lib/import/worker-matching.ts` — tiered email → phone → name matching, unit-tested. |
| Spreadsheet parsing | `xlsx` (SheetJS). No papaparse. |

---

## 3. Workstreams

### A. SMS entry point in the campaign header bar

**Requirement.** An SMS button in the persistent campaign header alongside Build list, Add assessment, Task management, Create Phone Call, Create Email.

**Where.** `src/components/campaigns/campaign-detail-header-bar.tsx` (buttons at lines ~92–164). This header renders on every `/campaigns/[id]/*` route.

**Decided.** Build a `CreateSmsOrchestrator` plus a `/campaigns/[id]/sms/setup` route with a pathway picker — **Blast / Chat / Survey** — mirroring the phone `PathwayPicker`. The header button navigates there, exactly as Create Phone Call and Create Email navigate to their setup routes. This also gives workstream E a full-height home (§4.2) and an SMS resume-banner slot alongside `ResumeBanner` and `EmailResumeBanner`.

The rejected alternative was linking the button straight to `?tab=outreach&sub=sms`. It is one line of work but leaves SMS behaving differently from its two neighbours and gives the chat workspace nowhere to live.

**Header overcrowding — decided: group, do not simply append.** The header already carries six controls plus an Actions dropdown in a `flex-wrap` row above the campaign name and date range; a seventh will wrap on a 13" laptop. The SMS button is added *and* existing controls are grouped to make room. Preferred grouping, for the planning agent to confirm against the live layout: collapse **Build list / Add assessment / Task management** into a single "Build" dropdown, leaving three primary "Create …" actions (Phone / Email / SMS) plus Actions. Verify the grouped controls keep their current keyboard and `aria-pressed` behaviour — Build list is a toggle bound to `?buildList=1`, not a navigation, and must not lose that semantics inside a menu.

---

### B. SMS as a Build List purpose

**Requirement.** Add SMS to the Build List purpose select in the wall-chart right-hand panel, add an SMS button to the fire bar, and launch an SMS workflow with the four SMS choices.

**Where.** `src/components/campaigns/wall-chart/build-list-panel.tsx` and `src/components/campaigns/wall-chart/use-build-list.ts`.

**The easy 80%.** The DB and the fire route already accept SMS. The remaining changes are small and enumerable:

- `BuildListPurpose` type (`use-build-list.ts:8`) — add `"sms"`.
- `PURPOSE_OPTIONS` (`build-list-panel.tsx:49`) — add the SMS entry with a `MessageSquare` icon.
- `handlePurposeChange` valid array (`build-list-panel.tsx:213`) — add `"sms"`.
- `FireBar` icon map (`build-list-panel.tsx:585`).
- Worker-lists route validation arrays: `worker-lists/route.ts` (POST) and `worker-lists/[listId]/route.ts` (PATCH) both hardcode `['email','phone','task']`.

**Gap — the contact-readiness warning.** `missingContactKind` currently warns on missing `worker.email` or `worker.phone`. SMS readiness is different: it needs `workers.phone_e164` present **and** `workers.sms_opt_out = false`. The build-list items query does not currently select those columns. Extend the select and add an `sms` warning kind ("N without a mobile, M opted out") so the organiser sees the real sendable count before firing.

**Fire targets — decided: Blast / Chat / Survey. Relay is dropped.**

| Choice | Status |
|---|---|
| **Blast** | Already implemented exactly this way. `fire/sms` creates an `sms_lists` draft and redirects to the composer. |
| **Chat** (what "inbox" meant in the original request) | In scope — this is workstream E's entry point. Needs the session model from §E1. |
| **Survey** | In scope, but different plumbing. Surveys freeze their audience at *open* time, not create time. Firing a list into a survey means creating a **draft** survey with that list pinned as its intended roll, opened later. Needs a new column (`sms_surveys.source_worker_list_id`) or an audience-spec JSONB. |
| **Relay** | **Dropped (decided).** A relay binds one dedicated number to a set of *external* targets. A worker cohort is not a relay input, so firing a list into one has no defined meaning. Relays remain a standalone configuration surface in the SMS tab. |

The SMS fire button therefore opens a three-way pathway picker, consistent with how the phone pathway asks for a script and assessment before the dialler opens.

**Conflict — single-shot firing.** `campaign_worker_lists` records one `status='fired'`, one `fired_draft_id`, and one `fired_*_list_id` per channel. The same cohort cannot currently be fired to phone *and* SMS without the second fire overwriting `fired_draft_id` and re-stamping `fired_at`. Multi-channel campaigns on one cohort are a plausible organiser workflow. Decide whether to (a) accept the limitation, (b) allow re-fire with the channel-specific column only, or (c) move to a `campaign_worker_list_fires` child table. Flag to the product owner.

---

### C. Consistent audience building for SMS blasts

**Requirement.** SMS blast creation should offer list selection and creation on par with email and phone, plus manual entry of individual numbers, plus CSV/XLSX import, with a prompt asking whether to check imported records against the existing campaign workforce.

**Current state.** `NewBlastSheet` in `InlineSmsOpsPanel.tsx` (lines ~418–545) offers a **single Select**: "Whole campaign (all members)" or one saved worker list. That is materially thinner than the email and phone pathways.

**Hard schema barrier — `sms_list_items.worker_id` is `NOT NULL`.**

```sql
worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
...
UNIQUE(list_id, worker_id)
```

Manually typed numbers and imported unknown numbers **cannot be stored today**. The same applies to `sms_send_log.worker_id`.

**Decided: every recipient resolves to a real `workers` row. `worker_id` stays `NOT NULL`.** This preserves every downstream invariant — opt-out checking, assessment writes, wall-chart appearance, conversation↔worker routing, `vw_campaign_worker_list_activity` — at the cost of a confirmation step in the import wizard. The rejected alternatives were a nullable `worker_id` (breaks the `UNIQUE(list_id, worker_id)` guard and makes opt-out unenforceable) and a separate `sms_adhoc_recipients` table (maximum duplication).

**Why not `campaign_prospective_workers`.** The staging table exists (`first_name`/`last_name` NOT NULL, `phone`, `review_status` pending/approved/rejected/merged, with merge and promote routes) and is the natural home for "someone told us about a person we don't have". It is *not* usable here, because `sms_list_items.worker_id` is a hard FK to `workers` — a prospective worker cannot be a recipient without being promoted first, which puts a review gate in the middle of a send workflow. Prospective workers stay scoped to the leader-form flow they were built for.

**Creation is gated, not free-form.** New workers created from manual entry or import must:

- carry a first name **and** last name — **decided: a bare number with no name is not a supported input** (it would also fail `campaign_prospective_workers`' NOT NULL constraints, so there is no fallback path for it anywhere in the app);
- carry a valid AU mobile, normalised via `toE164` at parse time, with per-row rejection reasons shown in the review step rather than silent failure at send time;
- pass duplicate detection on `phone_e164` and name before insert, reusing `src/lib/import/worker-matching.ts`;
- be stamped with a creation source (`sms_manual_entry` / `sms_import`) and the consent basis on `workers.sms_consent_source`;
- appear in the import review step for organiser confirmation **before** anything is queued for sending.

**Compliance barrier — this is not only a technical question.** Under the Spam Act 2003 (Cth), consent must exist before a commercial/organising SMS is sent. Numbers arriving via CSV have no consent provenance. The schema has `workers.sms_consent_source` for exactly this. The import wizard **must** capture a consent basis and record it; do not ship a silent import path. Recommend an explicit attestation step naming the consent source (membership form, workplace signup sheet, direct request) with the value written to every created/updated worker.

**Opt-out barrier.** Suppression is per-worker (`workers.sms_opt_out`). A bare phone number with no worker row cannot be checked against the opt-out register, so option 2 above would let the system text people who have sent STOP. If any non-worker recipient path is accepted, a **phone-level suppression table** becomes mandatory, checked at both audience-build and send time.

**Reuse, do not reinvent.**

- Parsing: `xlsx` (SheetJS), as used by `worker-import-wizard.tsx` and the participation import.
- Matching: `src/lib/import/worker-matching.ts` — tiered email (auto) → phone (auto) → name (confirm/review) → unmatched. Unit-tested. The requested "check against existing campaign workforce" prompt maps directly onto its existing tiers.
- The review UI: `src/components/campaigns/wall-chart/participation-import/` is the closest existing analogue (parse → match → review → apply) and should be the visual and structural template.
- Normalisation: `toE164` / `toE164Any`. Reject non-AU-mobile numbers at parse time with a clear per-row reason, not at send time.

**Consistency — decided: build shared, wire SMS only.** The app already has four or five separate answers to "who receives this?": the wall-chart Build List, the Outreach → Comms "List Builder", the phone setup list step, the email wizard list step, and the SMS blast's single dropdown. Each was built independently, so an organiser learns the same task several times and any new capability (e.g. "exclude anyone contacted in the last 7 days") has to be built four times.

Rather than adding a fifth implementation or refactoring two shipped flows mid-build, the new picker is written as a **channel-agnostic `<AudiencePicker>` component from day one** — it takes a channel prop and knows the per-channel contact requirement (email address / any phone / mobile + SMS consent) — but **only SMS is wired to it in this release**. Migrating email and phone onto it is a separate, independently schedulable phase with its own regression testing. This buys the shared code without betting this build on refactoring working email and phone pathways.

---

### D. Assessments in SMS surveys

**Requirement.** When setting up a survey, allow output to an existing assessment or creation of a new assessment, as per the phone-call functionality.

**Already built.** `SmsSurveyEditor` has a "Ratings target (assessment activity)" select and a per-question "Write answer to the ratings target" toggle. Answers on those questions write ratings through `sms_interactions` → `trg_sms_to_rating` → `record_assessment_event(source 'sms')`. Full detail in `docs/SMS_MODULE_PHASE4_PLAN.md` §"The answer → rating write path".

**Genuine gaps versus phone parity:**

1. **No inline creation.** Phone has `CreateAssessmentDialog` (also mounted in the campaign header with `lockKind="assessment"`). The survey editor only picks from existing activities. Fix: mount the same dialog from the editor with an "+ New assessment" affordance and refresh the activity list on create. Low effort, high value.
2. **One target, not many.** `sms_surveys.activity_id` is a single FK. Phone stores `phone_call_actions.selected_assessment_ids` (an array) and renders one rating row per assessment via `SessionAssessmentRatingsPanel`. A survey with five questions can currently only feed one assessment. Fix options: (a) per-question `activity_id` override on `sms_survey_questions`, or (b) a survey-level array plus per-question target selection. Option (a) is more expressive and a smaller migration.
3. **Activity list filtering.** Verify what the `activities` prop passed to `SmsSurveyEditor` contains. It should be `campaign_activities WHERE activity_kind = 'assessment'`, matching `SmsAssessmentPanel`. Note `activity_kind` has a CHECK constraint currently allowing `task, assessment, industrial_action, phone_bank, sms_survey, woc_meeting, site_visit` — extending it requires a migration that drops and re-adds the constraint (see `20260607140000_section_soc_and_woc.sql` for the house idiom).

---

### E. Peer-to-peer chat workspace

This is the largest workstream by an order of magnitude. Treat it as its own phase, possibly two.

**Requirement, restated as a workflow.** An organiser loads a list of (say) thirty workers with their worker information visible; sorts and filters that list; bulk- or individually selects names; sends an editable template opener to the selection; the selected members move into an "active" panel with visual indicators when each replies; the organiser clicks between members to run many discrete simultaneous conversations; a pinned assessment lets them record a rating without leaving the chat; issues and objections can be recorded as in the phone interface; the session saves and can be resumed.

**What already carries this.**

- Outbound-initiated threads work (the blast mirror in `dispatch-sms-queue` creates conversations and appends outbound messages).
- The thread view, composer, notes, canned replies, claims, presence, and per-conversation realtime all exist.
- `SmsAssessmentPanel` already records assessments from a thread.
- Merge tokens (`{{first_name}}`) already personalise the opener.

#### E0. Workspace layout — decided

**Context that shaped this decision.** The established mass-texting products (Spoke, ThruText/GetThru, Hustle) deliberately do **not** let a texter juggle simultaneous threads. They serialise: assign a batch, sweep the initial sends, then work a "needs reply" queue one contact at a time. Texting turn latency is minutes, so many visible threads is mostly dead screen and switching carries a real error cost. The tools that do present a thread list (Textline, Front, OpenPhone) target lower volume and higher touch. The requested workflow sits between the two — assessing thirty members is a volume task, but the organiser also wants visibility.

**Resolution: separate monitoring from working, over one session.**

**Decided layout — member board + focused thread, with a queue button.**

- **Board band** (top, collapsible, fixed height): a wrapping grid of compact member tiles, one per session member, colour-coded by *conversation state*, each showing unread count, minutes since last inbound, and a small rating chip once assessed. Thirty tiles fit in roughly three rows. Adapt from `components/campaigns/wall-chart/worker-tile.tsx` — organisers already read that visual language fluently.
- **Focus pane** (below): the selected thread in the main column, with the **pinned assessment inline directly under the composer** (not in the sidebar — see E3), and objections/issues as collapsible sections or a right rail.
- **Next button**: "next member needing a reply" inside the focus pane, giving the queue paradigm's throughput without giving up the board's visibility.

**Palette collision to avoid.** `RATING_LEVELS` colours are already the app's language for *assessment ratings*. Do not reuse them for *conversation state* on the board tiles — a green tile must not ambiguously mean both "supportive" and "replied". Use a distinct state palette for the tile body and keep the rating as a small separate chip.

Rejected alternatives, recorded so they are not relitigated: a roster rail + thread (cheapest, but thirty members means a scrolling rail showing ~12, and the right rail is already contested and hidden below `xl`); queue-only (highest throughput, but removes the requested monitoring and the ability to prioritise a known delegate); multi-column/TweetDeck (columns sit idle at SMS turn speeds, does not scale past three, and multiplies the worst error class in the feature — sending the wrong message to the wrong member).

#### E0b. Operational rules for the session

These apply regardless of layout and should be specified in the Phase 10 plan.

- **Opener pacing.** Thirty openers at once means thirty replies inside ten minutes. Default to **waves** (e.g. 10 every 2 minutes, configurable) with an explicit "send all now" override.
- **Concurrency cap.** Soft cap of ~40 *active* conversations per session; remaining members held `pending` and auto-promoted as others close. A session may be larger than the cap.
- **"Needs attention" definition.** Unread inbound, plus an ageing timer — amber at 5 minutes unanswered, red at 15. Without this the board is decorative rather than actionable.
- **Per-conversation drafts.** `SmsInboxPanel` currently holds a single `draft` string and clears it on conversation switch. In a thirty-chat workflow that silently destroys half-typed messages. Drafts must be keyed per conversation and survive switching.
- **Wrong-recipient safety.** Show the member's name in the composer placeholder *and* on the send button. Do **not** auto-advance after recording an assessment — "record and next" is a separate, deliberate button.
- **Session ownership.** The session takes a soft claim (`claim_sms_conversation`) on its conversations while active, refreshed on a heartbeat, released on close. Another organiser sees "X is working this" but is warned, not blocked — consistent with the existing presence design.
- **Late replies.** Inbound arriving after a session closes falls into the normal inbox needs-response queue and still counts in session reporting via `first_reply_at`. The session does **not** auto-reopen.

**What does not exist.**

#### E1. The session construct

There is no equivalent of `call_lists` + `call_list_items` + `phone_call_actions` for SMS chat. A "session" that groups thirty conversations into one organiser working set — with a pinned assessment, per-member progress, and resumability — has no home in the schema.

**Recommendation:** mirror the phone model, which is the closest well-understood precedent in this codebase.

- `sms_chat_sessions` — analogous to `phone_call_actions`: `campaign_id`, `name`, `source_worker_list_id`, `sender_number_id`, `template_body`, `selected_assessment_ids` (array, matching phone), `status` (`draft | active | paused | completed`), `created_by`, timestamps.
- `sms_chat_session_items` — analogous to `call_list_items`: `session_id`, `worker_id`, `conversation_id` (nullable until the opener sends), `state` (`pending | opener_sent | awaiting_reply | replied | closed | skipped | undeliverable`), `opener_sent_at`, `first_reply_at`, `sort_order`.

This gives resumability, per-member state for the active panel, a natural reporting grain, and a pinned-assessment home, all without inventing new patterns.

#### E2. Issue and objection capture — the highest-risk schema change

`call_attempt_objections` and `call_issue_observations` are both keyed on `attempt_id → call_attempts(attempt_id)`, which is `NOT NULL`. **There is no attempt-equivalent for SMS**, so these tables cannot currently record anything from a chat.

Three options:

1. **Polymorphic source on the existing tables.** Make `attempt_id` nullable, add `sms_conversation_id` (and/or `sms_chat_session_item_id`), add a CHECK that exactly one source is set. Preserves a single objection bank and a single reporting grain. **Risk:** `vw_call_action_report` counts `objection_count` / `issue_count` per attempt and would silently start missing or mis-joining rows; every consumer of these tables must be audited. Also requires the tables' RLS policies to be re-derived for the SMS source.
2. **Parallel SMS tables** (`sms_chat_objections`, `sms_chat_issues`). Zero risk to phone reporting; duplicates the objection bank join and forces every future cross-channel report to union two shapes.
3. **A generalised `contact_events` abstraction** covering phone, SMS, and future channels. Architecturally cleanest, far too large for this brief. Note it as the eventual target and do not attempt it now.

**Decided: option 1 — extend the phone tables polymorphically**, with a dedicated migration-review pass and an explicit regression check on `vw_call_action_report` before the phase commits. Reuse the shared `call_objections` bank (which already supports campaign-scoped and global-default rows) and the `heat` 1–5 issue model, so phone and SMS produce directly comparable data. The RLS policies on both tables must be re-derived to cover the SMS source, not just inherited.

This is the single highest-regression change in the brief. Isolate it in its own phase (11) and do not bundle unrelated work into that commit.

#### E3. The pinned assessment

`SmsAssessmentPanel` today renders **every** campaign assessment as a separate row with its own dirty-save button, inside `SmsMemberSidebar`. Two problems for this workflow:

- **Wrong grain.** The organiser assessing thirty members against one question needs one pinned control and one tap per member, not a scrolling list of every assessment in the campaign. Phone solves this with `phone_call_actions.selected_assessment_ids` chosen at setup. Mirror it via `sms_chat_sessions.selected_assessment_ids`.
- **Wrong place.** The sidebar is `hidden … xl:flex` — below the `xl` breakpoint it collapses into a bottom sheet. On a 13" laptop the pinned assessment would be behind a sheet, defeating "record an assessment whilst continuing to chat". Phone renders assessments **inline in the main call column** (`SessionAssessmentRatingsPanel` inside the Complete Call form). The chat workspace should do the same: pinned assessment in the main column, directly above or below the composer.

#### E4. The roster panel — sort, filter, bulk select

The inbox queue is a flat conversation list with six state tabs and a free-text search over name and phone. Workstream E needs a **worker-attribute** roster: sortable and filterable by worksite, organising unit, membership status, current rating, last contact — with checkbox multi-select and select-all-filtered.

The wall chart already has the selection idioms (`WallChartSelectionBar`, multi-select tiles, `use-build-list`), and the workforce **list** view (`workforce-list-view.tsx`) already has a sortable worker table. Neither is currently reusable inside the inbox. Decide early whether to extract a shared "worker roster table" component or build a chat-specific one; the extraction is the better long-term answer and the worse short-term estimate.

#### E5. Realtime at session scale — a real engineering constraint

`useSmsConversationRealtime()` opens one channel per open conversation. Thirty simultaneous chats means thirty channels, or a session-scoped subscription. The conversation *list* currently polls every 30 seconds, which is far too slow for "visual indicators of when responses from each are received".

**The blocker:** `sms_messages` has no `campaign_id` or session column. Supabase `postgres_changes` filters on a single column of the changed row, and the only thing on a message row is `conversation_id` — so there is no way to subscribe to "all messages in this session" as the schema stands.

**Decided: denormalise `campaign_id` onto `sms_messages` (one filtered listener) + a 5-second pulse poll as the reconciliation layer.**

- **Migration:** add nullable `campaign_id` to `sms_messages`, populate via a `BEFORE INSERT` trigger reading the parent conversation, and backfill existing rows. **The trigger is the point** — it means the six insert sites (webhook, dispatch cron mirror, 1:1 reply route, survey runtime, relay runtime, relay moderation) are untouched, eliminating the "missed an insert site" bug class entirely. Index it for the realtime filter.
- **Why `campaign_id` and not `chat_session_id`:** a message belongs to a conversation, and a conversation can appear in several sessions over its life, so a session id on a message row would be false. Campaign is stable, meaningful, and independently useful.
- **Accepted caveat:** if a conversation is later re-attached to a different campaign, its historical messages keep the original value. This is arguably correct — it records provenance at send time, matching the person-properties-at-event-time semantics used elsewhere in the stack. Document it in the migration comment.
- **Client:** one `postgres_changes` subscription filtered `campaign_id=eq.<id>`, routed to board tiles client-side. This also replaces the 30-second poll on the conversation list for the **whole** inbox, not just the chat workspace.
- **Pulse poll:** `GET /api/sms/chat-sessions/[id]/pulse` every 5 seconds returning a compact `{conversation_id, state, unread_count, last_inbound_at}[]`. This is the correctness layer — it survives sleep/wake, reconnects, and realtime outages, and guarantees the board is never stale after a dropped socket. A handful of organisers hitting a small indexed query is negligible load.
- **Focused thread keeps its existing per-conversation channel** — that is where presence and typing indicators matter, and the code already works.

Rejected: N per-conversation listeners (fine at 30, degrades past ~50 and worsens with concurrent organisers, since Supabase evaluates each filter server-side per change); webhook broadcast as the sole mechanism (fire-and-forget, so a reconnecting client silently misses events and needs a reconcile poll anyway, plus an extra HTTP call in the webhook hot path).

**De-risking option if the migration slips:** the pulse poll alone ships a working board at 5-second latency. The realtime listener can be added later with no UI change. Do not let the migration block Phase 10.

#### E6. Dispatch latency for the opener

Blasts are drained by a cron every five minutes. A chat opener to thirty people must go out **now**, not on the next cron tick. This needs either a synchronous send path (respecting Mobile Message rate limits, the blackout window, per-number throughput, and opt-out suppression) or a priority lane in the queue with a much shorter cron interval. Do not reuse the blast dispatcher unchanged.

Also confirm the provider's per-number throughput. Thirty individualised messages from one organiser number in quick succession may trip carrier or provider rate limiting and should be paced.

#### E7. Claims and concurrency

Soft claims (`claim_sms_conversation` with a TTL) exist. Define what happens when two organisers run overlapping sessions containing the same member, and whether a session claims its conversations en bloc on resume. Warn, do not block — consistent with the existing presence design.

---

### F. Assessment tracking and reporting over SMS

**Requirement.** Track when assessments are made via the SMS interface; report chats initiated, interactions received, and assessments recorded; use the existing binary/scaled rating system; surface SMS assessments on wall charts and elsewhere.

**Already done (verify, don't rebuild).** `campaign_activity_ratings.source` accepts `'sms'`; the inbox assessment panel and the survey `write_rating` path both write it; Phase 3 activated the SMS channel on the wall chart. The rating ladder (1 = supportive leader … 5 = oppositional leader, 0/NULL = unassessed) and binary options are shared with phone. **First task: confirm an SMS-recorded rating appears on the wall chart today.** If it does, this half of workstream F is a verification exercise.

**Gap 1 — source taxonomy is too coarse. Decided: split it.** Every SMS-derived rating currently lands as `source = 'sms'`, whether it came from a staff member tapping a chip in the inbox, a survey answer, or an inbound keyword, so "assessments made via SMS chat" is unanswerable from the data.

Extend the `campaign_activity_ratings.source` CHECK with **`sms_chat`**, **`sms_survey`** and **`sms_inbound`**, consistent with the existing `phone_call_live` / `phone_call_share_link` split rather than adding a parallel provenance column. Required work: the CHECK migration; a decision on whether to backfill existing `'sms'` rows (they are attributable — inbox writes carry `rated_by_user_id`, survey writes do not) or leave `'sms'` as a legacy value; and updating **every** producer — the assessments route (`sms_chat`), `fn_sms_to_rating` via the survey path (`sms_survey`), and any keyword-mapped inbound (`sms_inbound`). Audit every reader of `source` before the CHECK changes.

**Known trap:** that phone split is currently **broken** — `20260613110000_outcome_model.sql` migrated existing rows to `phone_call_live`, but `record_call_attempt()` still writes `'call_outcome'`. Do not replicate this failure mode. Whatever taxonomy is chosen must be written by every producer, and a test should assert it.

**Gap 2 — no SMS reporting exists at all.** The `/reports` registry has no SMS entry and there are no SMS analogues of `vw_call_action_report`, `call_campaign_summary`, `call_section_funnel`, or `call_outcome_summary`. Requested metrics and their sources:

| Metric | Source |
|---|---|
| Chats initiated | `sms_chat_session_items` where `opener_sent_at IS NOT NULL` |
| Interactions received | inbound `sms_messages`, and distinct conversations with ≥1 inbound |
| Assessments recorded via SMS | `campaign_activity_ratings` filtered by the new source taxonomy |
| Response rate | replied ÷ opener_sent per session |
| Time to first reply | `first_reply_at − opener_sent_at` |
| Per-organiser throughput | grouped by session `created_by` / conversation assignee |

Follow the phone precedent: SQL views with `GRANT SELECT TO authenticated`, a route under `/api/campaigns/[id]/sms/report`, a panel in the SMS tab, and an entry in the `/reports` registry.

---

## 4. Cross-cutting concerns

### 4.1 Verify migration apply state before planning

The seven SMS migrations (`20260810100000` through `20260811160000` — foundations, broadcast, conversations, assessment capture, surveys, ballots, relays) were authored recently and at least one is documented as "pending apply". Check the full range, not just the `20260811*` files.

**Ground truth (verified 2026-08-11):** all seven SMS migrations are applied to **both** DEV and PROD. Both databases record migrations under **apply-time versions** (MCP `apply_migration` style — e.g. DEV `20260810111705_sms_foundations`), not the local file timestamps; PROD's history has 259 entries in that style, DEV's has 12 (reseeded 2026-06-09). Consequence: `supabase db push` would treat every local file as unapplied — the established apply path for this repo is MCP `apply_migration` (DEV first, then PROD), and later phases should use it.

**Resolved trap — duplicate migration timestamp.** The former `20260624110000_fix_call_attempt_rating_event_id.sql` shared its version with the tracked `20260624110000_user_oauth_connections.sql`. It was renamed to `20260811170000_fix_call_attempt_rating_event_id.sql` and applied to DEV and PROD on 2026-08-11 (advisors clean — no new findings). Both databases' `record_call_attempt` now passes `p_event_id := NULL`. Note its content still writes `p_source := 'call_outcome'`, so the §F taxonomy bug remains open for Phase 12.

**Generated types.** `packages/db-types/generated.ts` already *contains* the SMS tables (surveys, ballots, relays, conversations are all present). The real questions are (a) whether it is **current** against the latest applied migrations, and (b) what the switchover plan is for code still importing the hand-written `src/types/sms.ts` (which carries a "TODO replace with generated types" header and is still what the SMS hooks use).

**Methodology.** Determine apply state by querying `supabase_migrations.schema_migrations` on **both** projects (refs in `docs/DEVELOPMENT_WORKFLOW.md`) via the Supabase MCP or read-only SQL — do not re-link the CLI to check. Plans built on a wrong assumption here will produce type errors and runtime surprises.

### 4.2 Navigation architecture

SMS is the only major module with no route segments. Phone has `/campaigns/[id]/phone/{setup,scripts,lists,call,live,assessment-setup}`; email has `/campaigns/[id]/email/{setup,wizard}`. SMS lives at `?tab=outreach&sub=sms`, and the chat workspace would sit four levels deep (campaign tab → outreach sub-tab → SMS tab → inbox pane) inside a `h-[70vh]` box.

A thirty-chat monitoring workspace needs full viewport height and its own URL for resumability and deep-linking. **Recommend a `/campaigns/[id]/sms/` route family**, at minimum `setup` and `chat/[sessionId]`, and keep the existing tab as the overview. This also resolves workstream A cleanly.

### 4.3 Compliance is a first-class requirement, not a footnote

Opt-out enforcement, the blackout window (09:00–20:00 with recorded overrides), `validateSmsBody` compliance checks (organisation identification and opt-out guidance), and consent provenance apply to **every** new send path: chat openers, chat replies, survey invitations fired from lists, and imported audiences. `src/lib/sms/compliance.ts` and `src/lib/sms/blackout.ts` already exist — route every new sender through them rather than reimplementing. The adversarial review pass should treat a bypassed opt-out check as a release blocker.

### 4.4 House conventions the agents must follow

- **Paths:** all `src/**` paths in this brief are relative to `apps/organising-db/`. Migrations live at the repo root under `supabase/migrations/`. State this in every subagent prompt.
- **Migrations:** new timestamped files only (`YYYYMMDDHHMMSS_snake_case.sql`); never edit an applied migration. Idempotent DDL, `VARCHAR` + CHECK over enums, RLS via the `can_write_to_campaign()` template, `update_updated_at` triggers, grants including sequences, `GRANT SELECT` on views. Follow `docs/DEVELOPMENT_WORKFLOW.md`: dev DB first, then prod — and pre-launch, **both** databases are updated as part of completing a phase, since prod is not yet live.
- **Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/Radix, TanStack Query v5. **No server actions anywhere in this codebase** — mutations go through Route Handlers under `src/app/api/`. Zod for input validation.
- **Types:** `@oa/db-types` generated types are the source of truth; regenerate with `pnpm gen:types` after migrations land.
- **Tests:** Vitest for pure logic. The SMS library has strong precedent (`src/lib/sms/__tests__/`: compliance, segments, conversation routing, survey engine, relay engine, ballot). Every new pure module — session state transitions, roster filtering, import matching extensions, merge-field expansion — should ship with tests in that style.
- **Git:** primary working directory, no worktrees, one commit per completed phase, no PR unless explicitly requested. **Do not run any git command without explicit per-command approval from the user.**

---

## 5. Decisions

### 5.1 Resolved (2026-08-11)

| # | Decision | Outcome | Detail |
|---|---|---|---|
| 1 | Header bar layout | Add the SMS button **and** group existing controls (preferred: Build list / Add assessment / Task management into a "Build" dropdown). Do not simply append a seventh button. | §A |
| 2 | Dedicated SMS routes | **Yes** — build `/campaigns/[id]/sms/*` (`setup`, `chat/[sessionId]`), with a `CreateSmsOrchestrator` and a Blast/Chat/Survey pathway picker. | §A, §4.2 |
| 3 | Relay as a fire target | **Dropped.** Build List purposes are Email / Phone / Activist task / SMS, and the SMS pathway offers Blast / Chat / Survey only. | §B |
| 4 | Multi-channel firing of one cohort | **Per-channel re-fire (decided 2026-08-11, Phase 8 planning).** A cohort may be fired once per channel; each fire route writes only its channel-specific column (`fired_call_list_id` / `fired_sms_list_id` / email's `fired_draft_id` — `fire/sms` stops writing `fired_draft_id` since it has its own column). `fired_at` means "most recent fire". A `campaign_worker_list_fires` child table remains the eventual target if per-fire history is ever needed. | §B |
| 5 | Non-worker recipients | **All recipients resolve to real `workers` rows**; `sms_list_items.worker_id` stays `NOT NULL`. Manual and imported entries create gated worker records (name required, E.164 validated, duplicate-checked, consent-stamped, organiser-confirmed). Not prospective workers. | §C |
| 5b | Bare numbers with no name | **Not supported.** First and last name are required for every created recipient. | §C |
| 6 | Shared audience picker | Build a **channel-agnostic `<AudiencePicker>`** from day one, but wire **only SMS** to it in this release. Email and phone migration is a separate, independently scheduled phase. | §C |
| 7 | Objection/issue capture | **Extend the phone tables polymorphically** (`attempt_id` nullable + SMS source column + exactly-one CHECK), with a dedicated migration review and a `vw_call_action_report` regression check. | §E2 |
| 8 | Realtime approach | **Denormalise `campaign_id` onto `sms_messages`** (populated by a `BEFORE INSERT` trigger, so no insert site is touched) for a single filtered listener, **plus a 5-second pulse poll** as the reconciliation layer. Focused thread keeps its per-conversation channel. | §E5 |
| 8b | Chat workspace layout | **Member board + focused thread, with a "next member needing a reply" button.** Board tiles adapted from `worker-tile.tsx`; pinned assessment inline in the main column, not the sidebar. | §E0 |
| 9 | Source taxonomy | **Split** `'sms'` into `sms_chat` / `sms_survey` / `sms_inbound` via a CHECK migration, updating every producer and auditing every reader. | §F |
| 11 | Multi-assessment survey targeting | **Ship in Phase 8 (decided 2026-08-11).** Per-question `activity_id` override on `sms_survey_questions` (option (a) from §D): one nullable FK column, `COALESCE(question.activity_id, survey.activity_id)` at the interaction stamp in the survey runtime, per-question target select in `SmsSurveyEditor`. Becomes Phase 8's only migration. | §D |

### 5.2 Still open — resolve at the relevant phase plan

| # | Question | Blocks |
|---|---|---|
| 10 | **Backfill of existing `source='sms'` rows** when the taxonomy splits — reclassify by attributability (`rated_by_user_id` present ⇒ `sms_chat`), or leave `'sms'` as a legacy value in the CHECK? (Ground truth 2026-08-11: zero `source='sms'` rows exist on either DB yet, so this may resolve to "nothing to backfill" — re-check at Phase 12. Also note PROD's `source` CHECK includes `an_sync` / `an_report_import`, which DEV's does not; the Phase 12 CHECK migration must be written against the union.) | Phase 12 (§F) |

---

## 6. Delivery plan

Sequential phases, each a committable and testable increment. Numbering continues the existing module.

| Phase | Scope | Depends on |
|---|---|---|
| **8 — Access & wiring** | Workstream A (`/campaigns/[id]/sms/setup` route, `CreateSmsOrchestrator`, header button **plus** control grouping), workstream B (Build List `sms` purpose, SMS contact-readiness warning, Blast/Chat/Survey pathway picker), workstream D (inline assessment creation in the survey editor). Small, low-risk, immediately visible. | Open Q4 |
| **9 — Audience building** | Workstream C: channel-agnostic `<AudiencePicker>` wired to SMS, manual number entry with gated worker creation, CSV/XLSX import with matching, consent capture and organiser confirmation. | Phase 8 |
| **10 — Chat workspace, core** | Workstream E0/E0b/E1/E3/E4/E6: session model, member board + focus layout, roster sort/filter/bulk select, wave-paced opener dispatch, pinned assessment inline, per-conversation drafts, save and resume. Includes the `sms_messages.campaign_id` migration and pulse-poll endpoint (E5), since the board depends on them. | Phase 8 |
| **11 — Chat workspace, capture** | Workstream E2 and E7: polymorphic objection/issue capture, claim semantics. **Highest schema risk — isolate it, no unrelated work in this commit.** | Phase 10 |
| **12 — Reporting** | Workstream F: source taxonomy migration, SMS reporting views, report route and panel, `/reports` registry entry, wall-chart verification. | Open Q10; Phases 10–11 |

Note the realtime work moved into Phase 10 rather than 11 — the board is unusable without it, and the de-risking fallback (pulse poll only) lives in the same phase.

### 6.1 Orchestration

Follow the pattern established in `docs/SMS_MODULE_BRIEF.md` §9.1, which worked for Phases 0–6: **orchestrator-in-the-loop, one phase at a time.** Not a fire-and-forget fan-out — phases share tables and routes, parallel mutation agents would conflict, and `CLAUDE.md` forbids worktrees.

**Orchestrator responsibilities:**

- Establish ground truth first: migration apply state, generated-types currency, and whether SMS assessments already reach the wall chart (§4.1, §F).
- Treat §5.1 as settled — do not reopen those decisions. Put the three §5.2 questions to the user when planning the phase they block. Do not guess. Once answered, record the outcome in §5.1 of this brief so it stays the single source of truth for later phases.
- Per phase: (1) a **planning agent** produces a file-level plan in the house `docs/SMS_MODULE_PHASE<N>_PLAN.md` style — objectives, exact write paths, work items by file, verification checklist, in-phase decisions; (2) **implementation** by a single agent against that plan; (3) an **adversarial review agent** with fresh context checks the diff; (4) a **migration review** before any `supabase/migrations` file is finalised; (5) a single commit **only after the user approves the specific git command**.
- Research and read-only agents may fan out in parallel. Implementation must not.

**Adversarial review must specifically target:** opt-out and blackout enforcement on every new send path; RLS template adherence on new tables; webhook and dispatch idempotency; the `vw_call_action_report` regression if objection tables change; and whether the new source taxonomy is written by every producer (the `call_outcome` / `phone_call_live` bug is the cautionary precedent).

### 6.2 Model recommendations

Consistent with `docs/SMS_MODULE_BRIEF.md` §9.2, expressed as concrete slugs.

| Role | Model | Why |
|---|---|---|
| Orchestrator | `claude-opus-5-thinking-high` or `claude-fable-5-thinking-high` | Sequencing, decision surfacing, and cross-phase coherence dominate outcomes. Low token volume, high leverage. |
| Codebase research / read-only mapping | `claude-sonnet-5-thinking-high` (parallel fan-out) | Fast, cheap, accurate for search-and-summarise. Several can run concurrently. |
| Phase planning agent | `claude-opus-5-thinking-high` | Plan quality determines implementation quality. This is where the leverage is. |
| Implementation — Phases 8, 9, 12 | `claude-sonnet-5-thinking-high` | Pattern-following against named templates once the plan is specific. |
| Implementation — Phases 10, 11 | `claude-opus-5-thinking-high` | Session state machine, polymorphic schema change, realtime architecture. Correctness-critical and precedent-light. |
| Adversarial review (fresh context) | `claude-opus-5-thinking-high` or `gpt-5.2` | A different model catches different failure classes; run it on every phase diff. |
| Migration review | `claude-opus-5-thinking-high` | ~220 existing migrations; naming, idempotency, RLS, and grant conventions all matter, and mistakes are expensive to unwind. |

**Not recommended:** any small/fast tier (`composer-2.5-fast`, `gpt-5.6-*-medium`) for code in this repository — the conventions are dense and the blast radius on `workers` and the ratings tables is high. Never run migration work as a background or batch agent; review it synchronously.

### 6.3 Verification per phase

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — all suites green, including new tests for any pure module added.
3. ESLint clean on touched files (pre-existing issues excepted).
4. Migration applied to dev, `get_advisors` checked for RLS and security findings, then applied to prod (both instances are kept in sync pre-launch).
5. A live end-to-end check of the phase's headline path against the mock provider — for Phase 10 that means: build a list, open a session, send openers, receive a simulated reply, record an assessment, close and resume the session.
6. The existing TestSprite suite (`apps/organising-db/testsprite_tests/`) extended for the new UI surfaces.
