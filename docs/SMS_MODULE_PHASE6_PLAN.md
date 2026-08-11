# SMS Module — Phase 6 plan: Relay & forwarding ("patch-through")

**Spec:** `docs/SMS_MODULE_BRIEF.md` §6 (relay-with-attribution — advocacy
patch-through + external-party forwarding) and §7.0 (relays draw numbers from
the spare pool). **Integrates with:** the Phase 2 inbound routing
(`docs/SMS_MODULE_PHASE2_PLAN.md`) — a relay claims a number, so the webhook
checks relays BEFORE conversation attach for that number.

**Status:** implemented 2026-08-11. Migration
`20260811160000_sms_relays.sql` (NOT applied — no DB changes in this phase's
build step).

---

## 1. Mechanism (one paragraph)

An admin configures a **relay**: one dedicated number (claimed from the spare
pool via `assign_sms_number` → purpose `relay`) bridged to one or more target
mobiles. Members text the relay number; after consent + keyword checks (and
optional moderation) the message is forwarded to every active target FROM the
relay number, body = rendered prefix + member message + rendered suffix
(merge fields `{{first_name}}`, `{{last_name}}`, `{{employer_name}}` from the
matched worker; unmatched → "A member"). A target's reply is bridged back to
the **last member whose message was actually forwarded** on that relay, from
the same relay number the member originally texted — the member never sees
the target's number and vice versa. Status `active | paused | ended` takes
effect on the next webhook. Everything is logged in `sms_relay_messages`.

## 2. Data model — `20260811160000_sms_relays.sql`

- **`sms_relays`** — `relay_id SERIAL`, `campaign_id NULL` (org-wide
  allowed), `name`, `number_id NOT NULL → sms_numbers` (purpose `relay`
  enforced at route level; set via `assign_sms_number`), `prefix_template` /
  `suffix_template` TEXT, `status CHECK ('active','paused','ended') DEFAULT
  'paused'` (explicit activation), `moderation_required BOOL DEFAULT false`,
  `quiet_hours_respected BOOL DEFAULT true` + `timezone DEFAULT
  'Australia/Perth'` (forwarding only 09:00–20:00; outside the window
  member→target forwards queue for the next window), `created_by`,
  timestamps. **Partial unique `UNIQUE(number_id) WHERE status != 'ended'`**
  — one live relay per number.
- **`sms_relay_targets`** — `target_id SERIAL`, `relay_id CASCADE`,
  `phone_e164 NOT NULL` (never exposed to members), `display_name
  VARCHAR(100)`, `is_active DEFAULT true`, `UNIQUE(relay_id, phone_e164)`.
- **`sms_relay_messages`** — `relay_message_id BIGSERIAL`, `relay_id`,
  `direction CHECK ('member_to_target','target_to_member')`,
  `member_worker_id NULL`, `member_phone_e164`, `target_id NULL`,
  `body` (original), `forwarded_body` (prefix+body+suffix, member→target
  only), `moderation_status CHECK
  ('auto_approved','pending','approved','rejected') DEFAULT 'auto_approved'`,
  `moderated_by/at`, `provider_message_id UNIQUE` (inbound idempotency),
  `forward_provider_message_id`, `forward_status CHECK
  ('queued','sent','delivered','failed','held','rejected') DEFAULT 'queued'`,
  `forwarded_at`, `created_at`. Index `(relay_id, created_at DESC)`.

**Forward-status semantics (decided in-phase):**
`held` = not scheduled to forward (pending moderation, relay paused,
opted-out member, or an unbridgeable target reply); `queued` = approved and
awaiting a send slot or retry (the cron's ONLY concern); `sending` =
claimed by an in-flight send (dispatch-queue idiom — `claimed_at`-stamped,
stale claims swept back to `queued` after 15 min); `sent`/`delivered`/
`failed` = provider outcome, with `forwarded_at` stamped ONLY on a
successful send (a never-delivered message can never win the bridge);
`rejected` = moderation rejected. Moderation-pending rows are
`('pending','held')`; approval flips them to `('approved','queued')` and
forwards immediately when the window is open, else the cron picks them up
at window-open. `forwarded_body` stores the exact outbound copy for BOTH
directions (member→target: prefix+body+suffix; target→member: display-name-
prefixed reply) so deferred/retried forwards send byte-identical text.

**RLS (hardened after adversarial review):** ALL THREE tables are
authenticated-READ, service-role-WRITE only. Relays/targets deliberately
carry no authenticated write policies: the webhook's relay leg routes on
the relay row alone and OUTRANKS conversational routing, so a direct
PostgREST insert pointing a relay at an organiser's number would silently
siphon that number's member traffic off-platform. Every write goes through
the `/api/sms/relays*` routes on the admin client after an explicit
`can_write_to_campaign` check (org-wide relays: any authenticated staff,
still route-mediated). Belt: `findLiveRelayByNumberId` additionally
requires `sms_numbers.purpose = 'relay'` (purpose is written only by the
admin-gated `assign_sms_number`), so a rogue relay row on a non-relay
number never routes. Targets' `phone_e164` is staff-visible (staff
configure it).

## 3. Webhook — inbound precedence (Phase 6 leg)

`STOP guard → survey session → ballot leg → **RELAY leg** → conversational.`
The number-registry fetch is hoisted above the relay check and reused by the
conversational leg (single query, unchanged behaviour). The relay leg fires
ONLY when the `to` number's registry row carries a **live (active|paused)**
relay; `ended` relays release the number back to normal routing.

- **Direction:** `from` matches an ACTIVE target of that relay (tolerant
  last-9-digit matching, same as the number registry) → `target_to_member`;
  else member leg.
- **Target→member:** bridge = most recent `member_to_target` row on the
  relay with `forwarded_at NOT NULL` (pure `chooseBridgeMember`), EXCLUDING
  candidates whose phone matches any target of the relay — active or
  inactive — so a deactivated target texting in through the member leg can
  never capture other targets' replies. No bridge → row stored with no
  member, `held`, no forward. Relay paused → stored, `held` (no auto-reply
  to targets). Bridged member opted out → `held`. Else forward the target's
  body to the member FROM the relay number, prefixed `"<display_name>: "`
  when a display name is set (replies read naturally). Target replies are
  conversational — never quiet-hours-blocked (the Phase 2 1:1 rule) — and a
  transiently-failed bridge send stays `queued` for the cron to retry.
- **Member→target:** consent check first (any matched worker
  `sms_opt_out` → store `held`, polite decline reply, stop). Insert
  `member_to_target` row (dedupe on `provider_message_id`; redelivery = no
  side effects). `forwarded_body` is rendered AT WEBHOOK TIME (so deferred/
  moderated forwards keep the wording current at receipt). Then:
  paused → `held` + auto-reply "Message received — forwarding is currently
  paused."; moderation → `('pending','held')`, no forward; quiet hours
  closed → `queued` (cron forwards at window open); else forward NOW to all
  active targets from the relay number (single `sendBatch`, first forward's
  provider id recorded). First-EVER member message on the relay (and only
  when the forward actually went out) → one confirmation: "Your message has
  been passed on. Replies will come from this number."
- **Logging:** relay traffic creates NO inbox conversations (distinct
  surface), but worker-matched member messages DO insert `sms_interactions`
  rows (no activity/cta fields) for worker history, deduped on
  `external_message_id`. Delivery-status webhooks additionally mirror
  `sent → delivered/failed` onto `sms_relay_messages.forward_status` via
  `forward_provider_message_id` (same monotonic guard as messages/log).

## 4. Cron

`processQueuedRelayForwards` appended to **`/api/cron/sms-survey-timers`**
(chosen over dispatch-sms-queue: the timers route is the module's
"deferred sends" home and already blackout-aware; dispatch-sms-queue is
tightly list-shaped). It forwards `('auto_approved'|'approved', 'queued')`
rows — BOTH directions — on ACTIVE relays whose window is open, and nothing
else (member→target rows fan out to the active targets; target→member rows
retry the stored bridge reply to the member). Claim-before-send in the
dispatch-queue idiom (`queued → sending` + `claimed_at`; `sending → sent` +
`forwarded_at` only after a successful provider result; provider throw
reverts to `queued`), plus a stale-claim sweep: `sending` rows older than
15 minutes are re-queued and logged.

## 5. Routes (`/api/sms/relays…` — relays can be org-wide, so not under
`/api/campaigns/[id]`)

All: auth required; explicit `can_write_to_campaign` RPC when the relay is
campaign-scoped; `checkRateLimit` on mutations. ALL relay-table writes run
on the ADMIN client after the explicit check (the tables are
service-role-write-only — see §2); reads use the user client.

- `GET/POST /api/sms/relays` — list (optional `?campaign_id=`) with target
  counts + message/pending counts; create (explicit campaign gate,
  validates spare+active number AND that no target matches any of our own
  `sms_numbers` — tolerant compare, kills relay rings/self-targets — then
  claims the number via `assign_sms_number(number_id,'relay')` — admin-gated
  inside the RPC, matching brief §6 "admin-configured"; RPC failure rolls
  the relay back, rollback errors logged).
- `GET/PATCH /api/sms/relays/[relayId]` — detail (relay + targets + message
  log ≤200 + pending queue); PATCH name/templates/moderation/quiet-hours
  (not status).
- `POST /api/sms/relays/[relayId]/actions` — `activate | pause | end`;
  `end` parks remaining `queued` rows as `held` (logged — no lying terminal
  `queued` states) and releases the number back to the spare pool via
  `assign_sms_number(number_id,'spare')`.
- `POST/PATCH /api/sms/relays/[relayId]/targets` — add (own-number guard as
  on create) / toggle active.
- `GET/POST /api/sms/relays/[relayId]/moderation` — pending list; approve
  (→ forward now / queue on closed window) or reject; refused on ended
  relays.

## 6. Pure logic — `lib/sms/relay-engine.ts` (unit-tested)

`matchPhoneInList` (tolerant digit matching — shared by target-direction
resolution, the own-number target guard and bridge-candidate exclusion),
`matchRelayTarget`, `resolveRelayDirection`, `chooseBridgeMember`
(bridging-map choice), `renderRelayTemplate` (+ strip unresolved tokens,
`GENERIC_MEMBER_CONTEXT` = "A member"), `composeForwardBody`,
`composeTargetReplyBody`, `decideMemberForward` (paused → moderation →
quiet-hours → forward-now precedence), reply-copy constants. Quiet-hours boundary itself reuses the tested
`isWithinSendWindow` from `lib/sms/blackout.ts`. I/O lives in
`lib/sms/relay-runtime.ts` (service-role, survey-runtime idiom).

## 7. UI

- `InlineSmsOpsPanel` gains a 4th tab: **Blasts | Inbox | Surveys | Relays**.
- `components/sms/relays/SmsRelaysPanel.tsx`: relay cards; create wizard
  (spare-number picker, targets, prefix/suffix with live preview via
  `SAMPLE_DATA`, moderation + quiet-hours toggles); detail sheet (message
  log with direction badges, moderation queue approve/reject,
  activate/pause/resume/end, per-target activity + toggle).
- `SmsComposer`: "Include tap-to-text link" helper (brief §6 complementary
  member-originated pattern) — inserts `sms:+61…?body=…` into the body.

## 8. Out of scope / deviations recorded

- Multi-target forwards store ONE `member_to_target` row (idempotency key =
  inbound provider id); only the first target-forward's provider id lands in
  `forward_provider_message_id`.
- Resume does NOT re-forward `held` messages (pause takes effect on the next
  webhook; the cron forwards `queued` only) — staff can see held rows in the
  log. Approved-but-deferred (`queued`) rows DO forward after resume.
- Bridging is last-forwarded-member (brief §6): a target's reply routes to
  the most recently forwarded member — noted inline in the relay detail UI.
- The first-message confirmation is sent only when the forward actually
  goes out immediately (not for held/queued/pending messages).
- Merge-field set is fixed at `{{first_name}}/{{last_name}}/{{employer_name}}`.
- No AI drafting (Phase 7). No DB apply, no commit in this build step.
