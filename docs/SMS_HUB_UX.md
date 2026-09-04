# SMS hub — content and layout

The SMS hub is the org-wide home for SMS: everything that has run or is
running, a single way to start something new, and the number registry.
It lives at `/sms` in the main side menu (**SMS Tools**), with the inbox
one entry below it. Campaign SMS tabs are unchanged — they remain the
campaign's own slice of the same data.

## Routes

| Route | Section | What it is for |
| --- | --- | --- |
| `/sms` | Actions | Snapshot, "start something", and the unified table of every blast, chat board, survey and relay. |
| `/sms/new` | Create | Kind → scope → editor. `?kind=`, `?scope=`, `?duplicate=` preset it; `?kind=blast&launch_relay=<id>` opens a relay's launch text. |
| `/sms/inbox` | Inbox | The existing three-pane inbox, now wearing the hub header. |
| `/sms/numbers` | Numbers | Which platform number is doing what, with admin reassignment inline. |
| `/campaigns/sms-tools` | — | Redirects to `/sms`, carrying `?standalone=1` / `?campaign_id=` across as `?scope=`. |

## Why this shape

**One list, not five tabs.** The old hub had a Blasts / Surveys / Chats
tab strip on top of a second, campaign-scoped tab strip. An organiser
looking for "the thing I set up yesterday" does not think in table names.
The hub now shows one table across kinds with chips for kind and status
bucket, a scope select (all / standalone / org-wide / a campaign), and
free-text search over name, campaign and number. Status buckets are
organiser words: **Live**, **Drafts & paused**, **Finished**.

**Scope is a decision, not a filter.** The old "Send as" select mixed
three things (nothing chosen, standalone, a campaign) and unlocked the
working panel only once picked. Creation is now a wizard with two
explicit questions in order: what do you want to run, and where does it
belong. Each scope option is stated as its consequence ("wall-chart
lists, assessments and campaign reporting stay off") rather than as data
model. Relays offer **Org-wide** where the others offer **Standalone**,
because a relay has no episode campaign — `campaign_id NULL` is its
standalone.

**The editor opens in place.** After Continue, the wizard opens the same
create sheet the campaign tab uses, against the chosen campaign (or a
hidden episode it creates first and discards if the sheet is closed
unsaved). No bounce to the campaign page; the organiser lands back on
the hub with the new action's detail sheet open. Chat boards open their
workspace instead, as they do everywhere.

**A relay's launch text is part of setting the relay up.** The relay
sheet's last step asks whether to send one and who from (an organiser
number, or the relay number itself with the warning that every reply is
then forwarded to the target). It never builds the blast: it hands back
a launch intent and the wizard opens the ordinary blast sheet, seeded
with the relay number rendered into the body — one code path for the
blast, wherever the relay was created. `?kind=blast&launch_relay=<id>`
is the same sheet reached directly, from the relay detail's *Send launch
text* or from the campaign Relays tab; it locks the kind to blast, takes
the scope from the relay (its campaign, or an episode for an org-wide
one) and asks the sender question at the top of the sheet. The blast
carries `sms_lists.relay_id`, which is what lets it send from the relay
number, gates queueing on the relay being active, and lets the table
label it *Launch text for &lt;relay&gt;* with an **Open relay** action.

**Open and duplicate from the row.** Blasts, surveys and relays open in
the same detail sheets the campaign tabs use (`?open=<kind:campaign:id>`
deep-links one). Duplicate sends the row's kind, scope and ref into the
wizard, which preloads message, sender and settings — never the
audience, which is always attached fresh. Surveys reuse the editor's
existing catalogue clone; relays copy targets and templates but not the
number (one live relay per number).

**Numbers are a first-class page.** The registry was admin-only and
purpose-only. Organisers choosing a sender need to see what is already
on a number. Each row shows purpose, owner, whether replies reach OA,
what is live, what is set up, open thread count, and (expanded) the
history with links. Attention notes surface the cases the routing rules
care about: an organiser number claimed by a live survey or relay, a
reserved number with nothing on it, a retired number still in use.
Admins reassign purpose / organiser and retire here; adding numbers
stays in Administration → SMS.

## Layout, top to bottom

1. **Header** — title, one-line purpose, the three-pill section nav, and
   the single primary button *New SMS action*.
2. **Snapshot tiles** — Live now · Drafts & paused · Awaiting review
   (relay moderation) · Finished · Numbers (links to the numbers page).
3. **Start something** — four cards, one per kind, leading with the job
   ("Get an answer from each person") over the mechanism.
4. **All SMS actions** — the table. Columns: action (icon, name, kind),
   status, scope, number, progress, updated, row menu (Open · Duplicate ·
   Open in campaign).

## Pure helpers

`src/lib/sms/hub-actions.ts` holds the action ref encoding, scope param
parsing, status buckets and hrefs, with tests in `__tests__`. The
activity and numbers APIs (`/api/sms/activity`, `/api/sms/numbers`) are
the only data sources; both are read-only and assemble everything in a
handful of batched reads.
