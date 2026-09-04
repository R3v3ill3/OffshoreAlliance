# SMS module — operator how-to

A concise guide to running the SMS module day to day. Everything lives
under a campaign's **Outreach → SMS** sub-tab (Blasts / Inbox / Surveys /
Relays). Admin configuration is on the **Administration** page (Mobile
Message SMS card + SMS Status panel).

Compliance basics baked in everywhere: consent is present by definition
(numbers are given to the OA voluntarily); STOP always opts a member out
union-wide and START re-subscribes; opted-out members are excluded from
every audience and blocked at send time; bulk sends respect the
09:00–20:00 recipient-local window unless a recorded override is set.
One-to-one inbox replies are never window-blocked.

## Blasts

1. **Blasts → New SMS blast** — name it, pick the audience, write the
   message. The composer shows a live character/segment counter (1
   segment = 1 credit) and blocks non-compliant content.
   - Audience modes: **whole campaign**, a **saved worker list**, or
     **build audience** (add people manually or import from CSV/XLSX).
   - Manual add requires a name, valid AU mobile, and consent
     attestation. Matching an existing worker links them automatically.
   - CSV/XLSX import: columns for first name, last name, and mobile.
     Rows are matched against the campaign workforce; unmatched entries
     create new workers after a consent-basis attestation step.
   - Composed audiences (manual + import) are committed as a draft
     worker list when the blast is created.
2. Save as draft, then **Queue for sending** from the blast card. The
   dispatch cron drains it inside the send window; pause / resume /
   cancel from the card at any time.
3. The blast detail sheet shows the funnel (sent → delivered → failed)
   with per-recipient statuses and failure reasons.
4. **Export CSV** downloads the per-recipient outcomes.
5. **Create list from:** *Replied* / *Delivered, no reply* / *Failed*
   turns a cohort into a draft worker list you can fire into phone,
   email, task or another SMS — the follow-up loop.

Campaign-level rollup cards (delivery rate, reply rate — measured
against delivered, not sent — active conversations, opt-outs) and the
per-sender table (median reply latency; aim for under ~20 minutes) sit
at the top of the Blasts view.

## Inbox (2-way conversations)

- Tabs: **Mine / Needs response / Unassigned / Triage / Escalated / All**.
  Triage holds inbound from numbers not matched to a worker.
- Open a thread: message bubbles, internal notes (staff-only, shown
  inline), day separators. Presence pills warn when someone else is
  viewing or typing — advisory, never blocking.
- Sidebar: assign, escalate (sticky — replies keep routing to the
  escalatee), close/reopen, attach to campaign/activity, canned replies
  (insert into the composer; save the current draft as a new canned
  reply, optionally tagged to an assessment outcome), manual opt-out /
  opt-out lift.
- **Draft reply** (sparkles button): AI suggests up to three editable
  candidates — answer-only, answer + advance the ask, acknowledge &
  escalate — built from the thread, the member's profile and ratings,
  and the attached activity. Nothing is ever auto-sent; pick one, edit,
  send. Sent AI-derived replies are flagged on the message row for
  reporting. Requires `ANTHROPIC_API_KEY`; the button reports clearly
  when AI is not configured. Drafting is refused for opted-out members.

## In-chat assessments

With a thread matched to a worker and attached to a campaign, the
sidebar records activity assessments (1–5 or yes/no/unsure/abstain)
straight into the campaign ratings pipeline (source `sms`) — the wall
chart updates immediately. Recording an outcome that has a tagged canned
reply auto-loads that reply into the composer (scripted answers).

## Surveys

1. **Surveys → New survey** — questions are choice / yes-no / scale /
   open text, with per-answer branching and optional rating writes to a
   target activity. Keep it to ≤5 questions.
2. Open the survey against an audience — same picker as blasts: whole
   campaign, saved list, or build audience (manual add / CSV import
   with consent attestation). When fired from a worker list (Build
   List → SMS → Survey) that list is pre-selected by default.
   Invitations queue inside the send window; the engine parses replies,
   retries invalid answers, nudges stalled sessions and hands off to
   the inbox when someone needs a human.
3. The funnel report shows invited → started → completed with
   per-question drop-off and invalid-reply rates (>10–15% invalid =
   reword the question).
4. **Export answers CSV** (one row per answer) and **Create list
   from:** *Completed* / *Started, not completed* / *Non-responders*
   (non-responders excludes anyone who opted out).

## Indicative ballots

A survey with purpose *indicative ballot*. Opening **freezes the
eligibility roll**; one vote per member (default `locked` — re-votes
rejected and logged), receipts texted back and verifiable against the
recomputed receipt list, append-only audit log. The banner is permanent:
indicative only — never a substitute for formal AEC/FWC ballots.
Results-restricted ballots show the aggregate tally only; per-member
answer export is blocked.

## Relays ("patch-through" / forwarding)

Relays forward member texts from a dedicated number to external targets
(and bridge replies back) with attribution prefixes — no platform access
for the external party. Created paused; activate explicitly. Optional
moderation queue; pause or end at any time; full message log retained.

**Launch text.** Nobody can use a relay they do not know the number of,
so the last step of the create wizard offers a **launch text**: a blast
inviting members to text the relay. Switch it on and you land straight
in the blast sheet with the message seeded (a campaign-neutral template
with the relay number and a tap-to-text link already filled in — replace
the square-bracket placeholders; the sheet warns while any are left) and
the audience picker ready. The relay detail lists every launch text and
opens each one; "Send launch text" on a relay that has none starts the
same flow (`/sms/new?kind=blast&launch_relay=<id>`), and the hub table
labels the blast "Launch text for &lt;relay&gt;" with an **Open relay**
row action.

You choose who it comes from:

- **A different number (recommended)** — an organiser number. Replies
  land in the Inbox as usual, and members text the relay themselves from
  the number in the message.
- **The relay number itself** — then *every* reply is treated as a
  message to the target and forwarded automatically, including "who is
  this?" and "thanks". STOP still opts the member out. Choose it only
  when you want that; the sheet offers to turn the moderation queue on
  at the same time. Sends from the relay number deliberately create no
  Inbox thread (the relay leg owns those replies), though the send log
  is written as usual.

A launch text cannot be queued while its relay is still paused — members
who took up the invitation would just get "Message received — forwarding
is currently paused" and never be forwarded. When the relay is paused
and the launch text is a draft, the relay detail shows one button,
**Activate relay and queue launch text**, that does both in the right
order. Save campaign-specific launch texts to the SMS template library
(Comms → templates, platform `sms`) so the next one starts from your own
wording rather than the default.

## Sandbox testing (before go-live)

- **Mock provider** (Administration → Mobile Message SMS → provider
  "Mock"): sends succeed without credits, webhooks can be simulated —
  use it for end-to-end flow testing in DEV.
- **Mobile Message sandbox** (provider "Mobile Message" with sandbox
  credentials): real API calls without carrier delivery.
  - Simulate an inbound reply with the sandbox `POST /v1/test-inbound`
    endpoint (aim it at a claimed sender number; the message arrives
    through the normal webhook and lands in the inbox/survey engine).
  - Numbers ending in **000** simulate delivery failure — use them to
    exercise the failed cohort, failure reasons and retry surfaces.
- Fire a test blast at a seeded test campaign, answer a survey by
  simulated inbound, STOP/START a test number, and check the funnel,
  inbox routing and opt-out mirroring before touching production.

## Go-live checklist

1. **Real credentials:** replace sandbox API key/secret in the
   Administration → Mobile Message SMS card (PROD environment only).
2. **Claim the 6 numbers:** provision the dedicated numbers in the
   Mobile Message dashboard (Settings → Sender IDs), then record them in
   the SMS Status panel with purposes (one per organiser + spares) —
   inbound routing follows the number → organiser assignment.
3. **Webhook:** point the Mobile Message webhook at the same URL
   (`/api/sms/webhook?token=…`) with the production webhook token (see
   `app_settings.sms_webhook_token`; rotatable from admin).
4. **Provider flip:** switch the provider from Mock to Mobile Message in
   the admin card.
5. **Purge test data:** delete/cancel test blasts, surveys and
   conversations from the test campaign, and clear any test opt-outs
   before real traffic starts.
6. Sanity-check: send a 1-recipient blast to a staff phone, reply to it,
   confirm delivery receipt + inbox thread + STOP handling.
