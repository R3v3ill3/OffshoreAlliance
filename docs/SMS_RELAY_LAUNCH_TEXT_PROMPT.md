# SMS relays — "launch text" linkage: review and implementation prompt

**Status:** proposal, 2026-09-04. Nothing below is built yet.
**Related:** `docs/SMS_MODULE_PHASE6_PLAN.md` (relays), `docs/SMS_HUB_UX.md`
(hub wizard), `docs/SMS_MODULE_BRIEF.md` §6 ("Outbound broadcast invites
members to text the relay number" and the complementary tap-to-text pattern).

Part 1 is the review of what exists and the recommended design. Part 2 is a
self-contained prompt for an implementing agent (written for Claude Opus 5).

---

## Part 1 — Review and recommendation

### 1.1 What exists today

**Relay setup.** `NewRelaySheet` in
`apps/organising-db/src/components/sms/relays/SmsRelaysPanel.tsx` is one
scrollable sheet: name → spare-pool number → targets → prefix / suffix (with a
live forward preview) → member confirmation → moderation / quiet hours →
"More options" (bridging). It posts to `POST /api/sms/relays`, which writes on
the admin client after a `can_write_to_campaign` check and claims the number via
`assign_sms_number(number, 'relay')`. The relay is created **paused**; the
detail sheet has Activate / Pause / End.

The hub wizard (`components/sms/hub/SmsCreateActionPage.tsx`) reaches the
same sheet after two decisions: kind (blast / chat / survey / relay) and scope
(org-wide or a campaign for relays; standalone or a campaign for the others).
Standalone blasts get a hidden `is_sms_episode` campaign created up front and
deleted if the sheet closes unsaved. Org-wide relays have `campaign_id NULL`.

**The invite is not modelled.** The only nods to "tell members to text this
number" are:

- the composer's manual **Tap-to-text link** helper (`SmsComposer.tsx`),
  where the organiser types the number themselves;
- the relay detail's empty message-log copy: "Invite members to text
  0400 … — e.g. via a blast with a tap-to-text link."

There is no data link between a relay and a blast, no seeded body, no sender
guidance, and no gating between "relay is active" and "invite has gone out".

**Blasts** are `sms_lists` rows (`mode='blast'`) created through
`POST /api/campaigns/[id]/sms-lists` (body + `sender_number_id` + optional
audience), queued through `POST .../sms-lists/[listId]/actions`, and drained by
`app/api/cron/dispatch-sms-queue`. A blast **always** belongs to a campaign.

**Sender rules.** `lib/sms/sender-purpose.ts` marks `relay` and `survey`
purposes as inbox-unsafe. That is enforced in four places: the blast create
route, the blast PATCH route, the queue action, and the composer
(`smsComposerBlockers` + the sender select filter). The dispatch cron does not
recheck purpose, but it does **mirror every successful send into
`sms_conversations`** on the sender number so the Inbox shows the blast leg.

**Webhook precedence** is `STOP guard → survey → ballot → relay leg →
conversational`. On a number with a live (active or paused) relay,
`resolveRelayDirection` classes any sender who is not an active target as a
member, so the message is forwarded (or held / queued / moderated). There is no
"this is just a reply to our blast" path.

### 1.2 What that means for the two sender choices

| Sender for the launch text | Member experience | Consequences in the platform |
| --- | --- | --- |
| **A different (organiser) number** — recommended | Member reads the text, then has to tap the `sms:` link or type the relay number. One extra step; some drop-off. | Replies to the launch text land in the Inbox as normal. The relay log only ever contains deliberate messages to the target. Every existing sender guard stays intact. |
| **The relay number itself** | Member just hits reply. Highest conversion. | **Every** reply is forwarded to the target: "who is this?", "thanks", "take me off" variants that miss the STOP guard, a photo of the dog. The Inbox mirror would create outbound-only threads that never receive a reply (the relay leg eats them). The relay's paused / quiet-hours / moderation rules apply to what are really blast replies. |

Both are legitimate; the second is the "advocacy patch-through" in its purest
form and some campaigns will want it. The design has to make the trade-off
visible at the moment of choice, default to the safe option, and, when the relay
number is chosen, avoid the Inbox mirror and consider defaulting moderation on.

Reassurances worth noting in the UI copy: STOP is handled **before** the relay
leg, so opt-outs still work on a relay-number launch; an opted-out member who
texts the relay gets `RELAY_OPTED_OUT_REPLY` and is never forwarded.

### 1.3 Gaps the linkage has to close

1. **No data link.** Nothing records that blast X is the launch text for relay
   Y. The hub table, the relay detail and reporting cannot show it.
2. **Paused-relay race.** A relay is created paused. If the launch text is
   queued before activation, every member who texts in gets "Message received —
   forwarding is currently paused." The flow must not let that happen silently.
3. **Sender guard is all-or-nothing.** Allowing "send from the relay number"
   requires a narrow exception: relay-purpose sender permitted only when the
   list is a launch text for the relay that owns that exact number.
4. **Org-wide relays have no campaign; blasts need one.** The wizard already
   solves this for standalone blasts with a hidden episode campaign; the launch
   flow must reuse that path rather than invent another.
5. **Body seeding.** The organiser should not have to type the relay number, or
   remember the tap-to-text helper. The number (and an `sms:` link) belong in
   the seeded body, and the composer should warn if the number is missing when a
   different sender is used.
6. **Inbox mirror.** For a relay-number launch, `mirrorBlastConversations`
   should be skipped: an outbound-only thread on a number whose replies never
   reach the Inbox is misleading.

### 1.4 Recommended design

**Data.** One nullable FK, `sms_lists.relay_id → sms_relays(relay_id) ON DELETE
SET NULL`, with a partial index. A blast is optionally "the launch text for a
relay". Put it on `sms_lists` (authenticated-writable via the existing RLS)
rather than on `sms_relays` (service-role only), so the existing blast routes
can write it and a relay can have more than one (initial launch, reminder).

**Flow (hub wizard, both entry points).**

```
Kind: Relay → Scope → New relay sheet (unchanged fields)
  └─ new final section: "Launch text"
       ○ No launch text — I'll invite members another way
       ● Send a launch text now (opens the blast editor next)
           Send it from:
             ● A different number (recommended)  [organiser number select, defaults to yours]
             ○ The relay number itself
               ⚠ Replies to this text are treated as messages to <target label>
                 and forwarded automatically — including "who is this?".
                 STOP still works. Prefer a different number unless you want
                 every reply to reach the target.
  Create relay (paused)
  → NewBlastSheet, seeded:
      name    = "<relay name> — launch text"
      body    = launch template with the relay number and an sms: link filled in
      sender  = the choice above (relay number allowed only in this case)
      audience = normal picker (campaign lists, or org lists for org-wide)
      hidden  = relay_id
  Create blast (draft or with audience)
  → Relay detail opens, showing "Launch text: <name> (draft)" with
    [Activate relay and queue launch text]
```

The relay detail (campaign Relays tab and the hub) gets a **Launch text** card:
linked blasts with status, a "Send launch text" button when there is none
(routes to `/sms/new?kind=blast&launch_relay=<id>` so the hub wizard handles
scope — the relay's campaign, or an episode for an org-wide relay), and the
combined **Activate relay and queue launch text** action while the relay is
paused and a draft launch exists.

**Gating.** The queue action refuses to queue a list with `relay_id` while that
relay is not `active`, with copy that points at the combined button. The
combined button activates first, then queues; if the queue step fails the relay
stays active and the error is shown (both are idempotent and retryable).

**Sender exception.** A relay-purpose sender is accepted by the create, PATCH
and queue routes and by `smsComposerBlockers` **only** when
`list.relay_id` is set and `sms_relays.number_id === sender_number_id` for
that relay. Survey-purpose numbers stay blocked everywhere. Any other
relay-purpose number stays blocked.

**Seeding.** A pure module `lib/sms/relay-launch.ts` holds the default
template, a `{{relay_number}}` token renderer, the body-mentions-number check
and the sender decision, all unit-tested. The default template is the
campaign-neutral copy in §2.4 below.

**Dispatch.** When `list.relay_id` is set and the sender is that relay's
number, skip `mirrorBlastConversations`. `sms_send_log` still records every
send.

**Hub.** `/api/sms/activity` returns `relay_id` / `relay_name` on blast rows;
the actions table shows "Launch text for <relay>" under the name; the row menu
gains "Open relay". Duplicate of a launch blast carries `relay_id`.

---

## Part 2 — Implementation prompt (for Claude Opus 5)

Copy everything from the next heading to the end of the file into the agent.

---

# Task: link a "launch text" blast to SMS relay setup

You are working in the `OffshoreAlliance` monorepo (pnpm + turbo). The app is
`apps/organising-db` (Next.js App Router, Supabase, TanStack Query, shadcn/ui,
vitest). Follow `CLAUDE.md`: work on the currently checked-out branch, no
worktrees, no sub-branches, **one commit** for the whole feature, no PR unless
asked. Do not put model names in commits or code.

Read these before changing anything; they are the ground truth, not this prompt:

- `docs/SMS_MODULE_PHASE6_PLAN.md`, `docs/SMS_HUB_UX.md`,
  `docs/SMS_RELAY_LAUNCH_TEXT_PROMPT.md` (Part 1 — the review this prompt
  came from)
- `supabase/migrations/20260811160000_sms_relays.sql`,
  `20260901120000_sms_relay_reply_mode.sql`,
  `20260901140000_sms_relay_confirmation_template.sql`,
  `20260810120000_sms_broadcast.sql`, `20260812140000_sms_p2p_chats.sql`,
  `20260813005937_sms_episode_campaigns.sql`
- `apps/organising-db/src/components/sms/relays/SmsRelaysPanel.tsx`
  (`NewRelaySheet`, `RelayDetailSheet`, `RelayDetail`)
- `apps/organising-db/src/components/sms/hub/SmsCreateActionPage.tsx`,
  `SmsActionsTable.tsx`, `SmsHubPage.tsx`
- `apps/organising-db/src/components/sms/InlineSmsOpsPanel.tsx`
  (`NewBlastSheet`, `NewBlastInitial`, `ListDetailSheet`)
- `apps/organising-db/src/components/sms/SmsComposer.tsx`
  (`SmsComposer`, `smsComposerBlockers`, the tap-to-text helper)
- `apps/organising-db/src/lib/sms/sender-purpose.ts`,
  `relay-engine.ts`, `relay-runtime.ts`, `hub-actions.ts`, `sms-episode.ts`
- `apps/organising-db/src/app/api/campaigns/[id]/sms-lists/route.ts`,
  `.../sms-lists/[listId]/route.ts`, `.../sms-lists/[listId]/actions/route.ts`
- `apps/organising-db/src/app/api/sms/relays/route.ts`,
  `.../relays/[relayId]/route.ts`, `.../relays/[relayId]/actions/route.ts`
- `apps/organising-db/src/app/api/sms/activity/route.ts`
- `apps/organising-db/src/app/api/cron/dispatch-sms-queue/route.ts`
  (`mirrorBlastConversations` and its call site)
- `apps/organising-db/src/app/api/sms/webhook/route.ts` (relay leg, STOP guard)
- `apps/organising-db/src/lib/hooks/useSmsRelays.ts`, `useSmsBroadcast.ts`,
  `useSmsHub.ts`, `useSmsEpisodes.ts`
- `apps/organising-db/src/types/sms.ts`
- `apps/organising-db/src/lib/sms/__tests__/hub-actions.test.ts`,
  `relay-engine.test.ts` (test style)

## 1. Goal

When an organiser sets up a relay, let them attach a **launch text**: a blast
that invites members to text the relay number. The organiser chooses whether the
launch text is sent from a different (organiser) number or from the relay number
itself, is warned clearly about the second choice, and never ends up with a
launch text going out while the relay is still paused.

## 2. Decisions already made — do not re-open these

### 2.1 Data model

Add a migration `supabase/migrations/<timestamp>_sms_relay_launch_text.sql`:

```sql
ALTER TABLE sms_lists
  ADD COLUMN IF NOT EXISTS relay_id INTEGER
    REFERENCES sms_relays(relay_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sl_relay
  ON sms_lists(relay_id) WHERE relay_id IS NOT NULL;

COMMENT ON COLUMN sms_lists.relay_id IS
  'When set, this blast is a launch text for the relay: it invites members to text the relay number. A relay may have several (launch, reminder). The relay number is a permitted sender ONLY for lists carrying its relay_id.';
```

No change to `sms_relays`. No new tables. Use the same `IF NOT EXISTS` idiom as
the neighbouring migrations. Also add the column to `packages/db-types` if the
repo keeps hand-maintained types there; if types are generated, do not hand-edit
`generated.ts` — add `relay_id` to `SmsListRow` in `types/sms.ts` and follow
the existing "deploy-order safety" idiom in the blast create route (only include
`relay_id` in the insert when it is set).

### 2.2 Pure helpers — `apps/organising-db/src/lib/sms/relay-launch.ts`

Create this module with unit tests in
`apps/organising-db/src/lib/sms/__tests__/relay-launch.test.ts`. Everything
decision-shaped lives here so the sheet, the routes and the cron cannot drift.

```ts
export const RELAY_NUMBER_TOKEN = 'relay_number'      // {{relay_number}}
export const RELAY_SMS_LINK_TOKEN = 'relay_sms_link'  // {{relay_sms_link}} → sms:+61…

export const DEFAULT_RELAY_LAUNCH_TEMPLATE: string     // see §2.4

/** Render {{relay_number}} (display form, e.g. "0400 100 014") and
 *  {{relay_sms_link}} ("sms:+61400100014"). Leaves every other {{token}}
 *  untouched — the blast composer's own merge fields resolve at dispatch. */
export function renderRelayLaunchBody(template: string, relayPhoneE164: string): string

/** True when the body carries the relay number in any tolerant form
 *  (display, E.164, national, or an sms: link to it). Reuse the digit
 *  matching idiom from relay-engine.ts (matchPhoneInList / significantDigits)
 *  rather than writing a new one. */
export function launchBodyMentionsRelayNumber(body: string, relayPhoneE164: string): boolean

export type RelayLaunchSenderMode = 'different_number' | 'relay_number'

/** The only case in which a relay-purpose sender is acceptable for a blast:
 *  the list is a launch text for the relay that owns that exact number. */
export function isPermittedRelaySender(args: {
  senderNumberId: number | null | undefined
  senderPurpose: string | null | undefined
  listRelayId: number | null | undefined
  relayNumberId: number | null | undefined
}): boolean

/** Copy shown when the organiser picks the relay number as sender. Export it
 *  so the sheet and any server 4xx use identical words. */
export const RELAY_NUMBER_SENDER_WARNING: string

/** Default name for a launch blast: "<relay name> — launch text". */
export function relayLaunchBlastName(relayName: string): string

/** Queue gating: a launch text may only be queued once its relay is active. */
export function relayLaunchQueueBlocker(relayStatus: 'active' | 'paused' | 'ended' | null): string | null
```

Tests must cover: token rendering with both tokens and untouched foreign
tokens; the mention check for display / E.164 / `04…` / `sms:` forms and a
negative; `isPermittedRelaySender` truth table (relay purpose + matching relay
number → true; relay purpose + other relay's number → false; survey purpose →
false always; organiser purpose → true regardless of relay_id); the queue
blocker for each status.

### 2.3 Sender rules — `lib/sms/sender-purpose.ts` and its four callers

Keep `INBOX_UNSAFE_PURPOSES` and `inboxUnsafeSenderMessage` as they are for
every other caller. Add one server helper next to them that takes the list's
`relay_id`, loads the relay's `number_id`, and returns `null` when
`isPermittedRelaySender` says the sender is fine, otherwise the existing 409
copy. Use it in:

1. `POST /api/campaigns/[id]/sms-lists` — accept `relay_id?: number` in the
   body. When present: the relay must exist, must not be `ended`, and must be
   either org-wide or belong to this campaign (`campaign_id IS NULL OR
   campaign_id = cid`); reject otherwise with 400. Then run the sender check with
   the relay-aware helper.
2. `PATCH /api/campaigns/[id]/sms-lists/[listId]` — the sender check must read
   the list's existing `relay_id`. Do not allow `relay_id` to be changed here.
3. `POST .../sms-lists/[listId]/actions` (`queue`) — relay-aware sender check,
   **and** the new gate: when `relay_id` is set, load the relay status and
   refuse with 409 and `relayLaunchQueueBlocker(...)` copy if it is not `active`.
4. `smsComposerBlockers` in `SmsComposer.tsx` — add an optional
   `opts.allowRelayNumberId?: number` and treat that one number as permitted.

`filterInboxSafeSenders` stays as it is; the composer's `selectableSenders`
memo already re-includes a selected sender that is not in the safe list, so
passing the relay number in as the initial `sender_number_id` and adding a
prop `allowRelayNumberId` that keeps it selectable (with the warning rendered
under the select instead of the "reserved for surveys or relays" line) is enough.

### 2.4 Default launch template

`DEFAULT_RELAY_LAUNCH_TEMPLATE` must be **campaign-neutral**: no employer,
person, site or issue named. It only has to show the organiser the shape of a
good launch text, so that they replace the specifics rather than the structure.
Ship exactly this:

```
Hey {{first_name}}. [One or two lines on what has happened and why it matters.]
Text {{relay_number}} — it goes straight to [who] with your name and site on the end. Keep it polite, keep it short, make it your own. A few starters:

* "[Starter 1]"
* "[Starter 2]"
* "[Starter 3]"

Text {{relay_number}} now.
Offshore Alliance
```

Rules for the seed:

- `{{first_name}}` is the blast composer's own merge field and resolves at
  dispatch. `{{relay_number}}` and `{{relay_sms_link}}` resolve at seed time
  (see below). Nothing else in the template is a token.
- Square-bracket text is a **placeholder the organiser must replace**. Because
  the composer already treats `[…]` as literal text, add a soft check in the
  blast sheet when `initial.relay` is present: if the body still contains a
  `[…]` placeholder from the seed, show an amber warning "This still has
  placeholder text in square brackets" (warn, not block, since members'
  starters may legitimately use brackets, as in the example below).
- Keep "Offshore Alliance" on the last line so `validateSmsBody` reports the
  organisation name present.
- The composer's existing template picker (`comms_template_library`, platform
  `sms`) must remain available in the launch sheet, and a picked template also
  goes through `renderRelayLaunchBody` so `{{relay_number}}` and
  `{{relay_sms_link}}` resolve. Recommend in the HOWTO that campaign-specific
  launch texts be saved there.

For the test file only, use this filled-in example as a fixture to show the
intended end state (it is real campaign copy and must not ship as a default):

```
Hey {{first_name}}. Downer copped a flogging on their dud EA. Mark Wakelin is too shy to tell us exactly how bad.
Maybe if we all ask him, he'll get the courage to cough up the numbers.
Text {{relay_number}} — it goes straight to Mark with your name and site on the end. Keep it polite, keep it short, make it your own. A few starters:

* "Mark, [name] from [site]. What was the vote count? Cheers."
* "G'day Mark. Yes/No split on the EA please. Ta."
* "Mark, what's Downer scared of? Release the numbers."
* "Morning Mark. Everyone knows the EA got flogged. Just tell us by how much."

Text {{relay_number}} now. Let's see if Mark can count.
Offshore Alliance
```

Do **not** add `relay_number` to `ALL_TEMPLATE_VARIABLES`: it is resolved at
seed time, because a relay's number is fixed for its life (`number_id NOT NULL`,
never reassigned; ending a relay releases the number). Resolving at dispatch
would need the cron to know about relays for no benefit.

### 2.5 Sender choice and warning copy

Two radio options in the relay sheet's new "Launch text" section, in this order:

- **Send from a different number (recommended)** — an organiser-number select
  (inbox-safe senders only, defaulting to the signed-in organiser's number
  exactly as the composer does). Helper text: "Replies to the launch text land
  in the Inbox as usual. Members text the relay number themselves — the message
  carries it and a tap-to-text link."
- **Send from the relay number** — `RELAY_NUMBER_SENDER_WARNING`:
  "Every reply to this text is treated as a message to the target and forwarded
  automatically — including 'who is this?' and 'thanks'. STOP still opts the
  member out. Only choose this if you want every reply to reach the target."
  When chosen and `moderation_required` is off, add a second line offering to
  turn moderation on ("Turn on the moderation queue so you approve what goes
  through") with an inline switch that toggles the relay's moderation setting
  in the same form.

### 2.6 Flow and where the pieces live

**`NewRelaySheet` (`SmsRelaysPanel.tsx`).** Add a final section "Launch text"
before the Create button: a switch "Send a launch text to invite members" (off
by default; on when the hub wizard passes `initial.launch`), and when on, the
sender choice from §2.5. Change `onCreated` to
`onCreated(relayId: number, launch: RelayLaunchIntent | null)` where

```ts
export interface RelayLaunchIntent {
  relayId: number
  relayName: string
  relayPhoneE164: string
  relayNumberId: number
  relayCampaignId: number | null
  senderMode: RelayLaunchSenderMode
  senderNumberId: number | null   // relay number id when senderMode is relay_number
}
```

The sheet already has the spare number list from `useSmsSenders`; the phone is
available client-side before create returns.

**`SmsCreateActionPage.tsx` (hub wizard).** After the relay sheet resolves
with a launch intent, open `NewBlastSheet` in the same page:

- campaign: the relay's campaign when set; otherwise create a hidden episode
  with `createEpisode({ kind: 'blast', name: relayLaunchBlastName(...) })`
  exactly as the standalone path does, and delete it if the blast sheet closes
  unsaved.
- `initial`: `name = relayLaunchBlastName(relayName)`,
  `composer.body = renderRelayLaunchBody(DEFAULT_RELAY_LAUNCH_TEMPLATE, phone)`,
  `composer.sender_number_id = senderNumberId`, and a new
  `initial.relay = { relay_id, phone_e164, number_id }`.
- On created: `finish({ kind: 'relay', id: relayId })` so the organiser lands
  on the relay detail, which now shows the launch text.

Also accept a new URL param `?kind=blast&launch_relay=<relayId>`: load the relay
via `useSmsRelayDetail`, lock kind to blast, derive scope from the relay
(campaign → that campaign; org-wide → standalone/episode), and open the blast
sheet seeded as above with `senderMode = 'different_number'` by default and the
sender choice rendered at the top of the blast sheet (reuse the same component).
This is the path the relay detail's "Send launch text" button uses.

**`NewBlastSheet` (`InlineSmsOpsPanel.tsx`).** Extend `NewBlastInitial` with
`relay?: { relay_id: number; phone_e164: string; number_id: number }`. When
present: pass `relay_id` in the create body; pass
`allowRelayNumberId = relay.number_id` to the composer and to
`smsComposerBlockers`; show a small banner "Launch text for <relay> — the
message should tell members to text <number>"; and when the sender is **not**
the relay number and `launchBodyMentionsRelayNumber` is false, show an amber
warning (not a block) "This text doesn't mention the relay number — members
won't know where to text." with a one-click "Insert number and tap-to-text
link" that appends `{{relay_number}}`-rendered text at the cursor via the
existing `insertAtCursor` path (expose it through a ref or lift the helper;
keep it small).

**`RelayDetail` (`SmsRelaysPanel.tsx`).** Add a "Launch text" card between the
lifecycle controls and the moderation queue:

- Lists linked blasts (name, status badge, recipients messaged) — open each in
  `ListDetailSheet` with the blast's own campaign id.
- If none: button **Send launch text** → `/sms/new?kind=blast&launch_relay=<id>`.
- If the relay is `paused` and a linked blast is in `draft`: primary button
  **Activate relay and queue launch text**. Client-side: `action('activate')`
  then `useSmsListAction(campaignId).mutate('queue')`. On queue failure the
  relay stays active; show the error. Existing single actions stay.
- If the relay is `active` and a linked draft exists: **Queue launch text**.

The relay detail route `GET /api/sms/relays/[relayId]` must return
`launch_lists: Array<{ list_id, campaign_id, name, status, total_items,
sent_items, mode }>` (blast mode only) so the card has its data without an
extra hook. Extend `SmsRelayDetail` in `useSmsRelays.ts` accordingly.

**Hub table.** `GET /api/sms/activity` returns `relay_id` and `relay_name` on
blast rows (one extra batched read of `sms_relays` for the distinct ids).
`SmsActionsTable` shows "Launch text for <relay_name>" as the secondary line
under a blast's name and adds "Open relay" to the row menu. Duplicate of a
launch blast passes `relay_id` through `useDuplicateSource` so the copy stays a
launch text; the duplicate seed does not copy the sender when it was the relay
number of a different relay (it never will be here, but guard it).

**Dispatch cron.** In `dispatch-sms-queue/route.ts`, at the
`mirrorBlastConversations` call: skip the mirror when `list.relay_id` is set
**and** the relay's `number_id === list.sender_number_id`. Load the relay's
`number_id` once per list alongside the existing sender read (the list is
already selected with `*`; add `relay_id` to the select if it is explicit).
Leave `sms_send_log` writes untouched. Comment the reason in one sentence.

**Campaign Relays tab.** `SmsRelaysPanel`'s own `NewRelaySheet` usage (outside
the hub) should also accept the launch section; on created with an intent,
route to `/sms/new?kind=blast&launch_relay=<id>` rather than duplicating the
episode logic in the panel. One code path for the blast side.

### 2.7 Copy and guardrails already in the codebase to reuse

- `RELAY_PAUSED_REPLY`, `RELAY_OPTED_OUT_REPLY`, `firstForwardConfirmation`
  in `relay-engine.ts` — the launch step's helper text should mention that
  members who text before activation get the paused reply; that is the reason
  for the gate.
- `validateSmsBody` / `countSegmentsWorstCase` — the seeded body is long
  (several parts); the composer already shows this. Do not shorten the default.
- `toDisplay` / `toE164` in `lib/phone/normalise-phone.ts`.
- `SAMPLE_DATA` for previews.

## 3. Non-goals

- No change to the webhook relay leg or to `resolveRelayDirection`. A reply
  to a relay-number launch **is** a member message; that is the point of the
  choice, and the warning exists because of it.
- No new relay status, no scheduling coupling between blast `scheduled_for`
  and relay activation beyond the queue gate.
- No `{{relay_number}}` at dispatch time (see §2.4).
- No change to survey-purpose sender rules.
- Do not touch `packages/db-types/generated.ts` by hand.

## 4. Acceptance criteria

1. Creating a relay with "Send a launch text" on, sender = different number,
   lands in the blast sheet with name, body (relay number rendered twice, `sms:`
   link present), sender and audience picker ready; creating the blast lands on
   the relay detail showing the draft launch text and the combined button.
2. The combined button activates the relay and queues the blast; the relay
   detail refreshes to `active` and the launch card shows `queued`.
3. Queuing a launch text while its relay is paused (via the blast detail
   sheet's own Queue) returns 409 with the gate copy; the blast sheet shows it.
4. Choosing "the relay number" shows the warning and the moderation nudge;
   the composer accepts the relay number as sender; the create route accepts
   it; the queue route accepts it; a relay-purpose number that is **not** this
   relay's is still rejected in all three places with the existing 409 copy.
5. With sender = relay number, a dispatched send writes `sms_send_log` but
   creates no `sms_conversations` row (unit-test the predicate; the cron itself
   is not unit-tested today, so cover the helper and inspect the call site).
6. `/sms/new?kind=blast&launch_relay=<id>` works for both a campaign-linked
   and an org-wide relay (episode created, deleted on cancel).
7. Hub table shows "Launch text for <relay>" and "Open relay" for the blast;
   the relay detail lists it; duplicate keeps the link.
8. `pnpm --filter organising-db test`, `pnpm --filter organising-db lint` and
   a type check (`pnpm --filter organising-db exec tsc --noEmit`) pass.
9. Docs: add a "Launch text" paragraph to `docs/SMS_MODULE_HOWTO.md` (Relays
   section) and a short note to `docs/SMS_HUB_UX.md` (wizard shape, the
   `launch_relay` param). Update the header comment of `SmsRelaysPanel.tsx`.

## 5. Working method

- Start with the migration, types and `relay-launch.ts` + tests, and run the
  tests. Then the four sender-rule call sites and the queue gate. Then the
  sheets and the wizard. Then the relay detail card, activity API and hub
  table. Then the cron mirror skip and docs.
- Keep each change minimal and local. Reuse existing components and hooks; do
  not fork `SmsComposer`.
- Before committing, re-read your diff for: a relay-purpose sender slipping
  through anywhere other than the one permitted case; the episode campaign
  leaking when the blast sheet is cancelled; the relay detail card fetching
  per-row.
- One commit. Message shape:
  `feat(sms): launch text linked to relay setup — sender choice, relay-number warning, activate-and-queue gate`.
  Do not open a PR.
