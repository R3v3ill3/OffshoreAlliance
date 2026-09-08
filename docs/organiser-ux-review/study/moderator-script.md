# Moderator script

Read `README.md` first. One sheet per participant from `results-template.md`.

**Dev only.** The session runs on the dev preview (Supabase dev
`dpnnmkhabysfdogllsyh`). Never production (`gteygwfgjvczanmrwgbr`). Check the
URL in the address bar before you start.

Placeholders `[CAMPAIGN]`, `[WORKER]`, `[SHIFT UNIT]` and `[WORKSITE]` are
filled in by the operator before the round. If any is still a placeholder when
you sit down, stop and get the value.

## Welcome

Read the consent paragraph in `README.md`. Then read this:

> As you work, please say what you are looking for, what you expect, and what
> surprises you. There is no right answer and no time pressure from me. If you
> get stuck, that is useful information, so keep talking.

If they go quiet, prompt with:

> What are you thinking?

Use only that prompt. Do not fill the silence with hints.

## What the moderator may and may not say

**May say:**

- "What would you do next?"
- "What did you expect to happen?"
- "Is this what you expected?"
- The participant's own words, echoed back to them.

**May not say:**

- The name of any tab, button or menu.
- "Try the X tab."
- "You're nearly there."
- Anything that confirms or denies correctness before the task ends.

## Assists

An **assist** is any moderator utterance that names a UI element, points at
the screen, or otherwise narrows the search.

Count assists. Write down what was said. A task with one or more assists can
be scored **partial** at best, never **success**.

## Errors

Count errors separately from assists. Tag each one slip or mistake
(https://www.nngroup.com/articles/slips/ ;
https://www.nngroup.com/articles/user-mistakes/):

- **Slip:** a wrong click the participant immediately corrects. "Slips occur
  when users intend to perform one action, but end up doing another."
- **Mistake:** a wrong destination the participant believes is right.
  "Mistakes occur when a user has developed a mental model of the interface
  that isn't correct."

## Success levels

Partial credit, per
https://www.nngroup.com/articles/success-rate-the-simplest-usability-metric/
("User success is the bottom line of usability").

- **Success:** met the criterion unaided.
- **Partial:** met it after one or more assists, or by a route the moderator
  had to unblock.
- **Fail:** abandoned, timed out, or ended in the wrong state.

## The three tasks

Read each task aloud, word for word. Do not paraphrase. The wording uses
today's labels on purpose.

### Task 1

> Open the wall chart for `[CAMPAIGN]`.

- **Start:** the login form, empty, on the preview URL. The timer and the
  click count start when the participant submits the login form, and **the
  submit itself is click 1**. (Submit goes to `/campaigns`; a row click there,
  click 2, goes to `?tab=workforce&sub=wall-chart`. Appendix D 2.1 and 2.2.)
  So today's shortest route is **2 clicks**, which is the number plan
  section 7 and the phase-3 target in `results-template.md` refer to. Do not
  record 1.
- **Stop:** the wall chart for `[CAMPAIGN]` is visible on screen.
- **Success:** wall chart visible. The **Wall Chart / List** sub-tab has two
  layouts and either one counts: if the participant lands on the list layout of
  that sub-tab for `[CAMPAIGN]`, that is a success. Write down which layout was
  showing when they stopped.
- **Record:** clicks and seconds, as well as the usual scores. Plan section 8
  target after phase 3 is 2 clicks and under 10 seconds.
- **Timeout:** 3 minutes.

### Task 2

> Put `[WORKER]` into the `[SHIFT UNIT]` shift.

- **Start:** wherever task 1 ended.
- **Stop:** the participant says they are done, or 5 minutes.
- **Success:** `[WORKER]` appears in `[SHIFT UNIT]`. Verify by reloading the
  unit yourself after the task ends, under Workforce, then **Campaign Units**.
  The wall chart's assignment path is also valid.
- **Record:** which route they took. Today's label for workers with no unit is
  **Unallocated**, which sits next to the units.
- **Timeout:** 5 minutes.

### Task 3

> Create a new campaign for `[WORKSITE]`.

- **Start:** wherever task 2 ended.
- **Stop:** the participant says they are done, or 8 minutes.
- **Success:** a campaign row exists with `[WORKSITE]` in scope, and the
  participant is on that campaign's page.
- **Record:** which of the two options in the **Create campaign** dialog they
  chose, **Campaign wizard** or **Manual create**, and whether they end up on
  the wall chart.
- **Timeout:** 8 minutes. Plan section 8 target is under 3 minutes and 90%
  success.

## Today's labels this script relies on

If a future editor changes any of these in the product, this script has to
change too. Sources are appendix D 3.2 (campaign tabs) and appendix D 1.5 (the
campaigns page action strip).

Paths are relative to `apps/organising-db/`.

| Label | Where |
|---|---|
| Workforce | campaign page top-level tab (`src/app/(dashboard)/campaigns/[id]/page.tsx:421`) |
| Wall Chart / List | Workforce sub-tab (`src/app/(dashboard)/campaigns/[id]/page.tsx:614`) |
| Campaign Units | Workforce sub-tab (`src/app/(dashboard)/campaigns/[id]/page.tsx:615`) |
| Scope | Workforce sub-tab (`src/app/(dashboard)/campaigns/[id]/page.tsx:616`) |
| Create campaign | campaigns page action strip (`src/app/(dashboard)/campaigns/page.tsx:382`) |
| Campaign wizard / Manual create | the two options in that dialog (`src/app/(dashboard)/campaigns/page.tsx:310-355`) |
| Assign to unit | bulk toolbar (`src/components/campaigns/workforce/workforce-bulk-toolbar.tsx:281`) |
| Unallocated | pseudo-unit for workers with no unit (`src/components/campaigns/campaign-units-section.tsx:1777`) |

## Debrief

After the SUS form, ask these three questions and write the answers down in
the participant's own words.

1. What was the hardest moment?
2. Was there anything you expected to find and did not?
3. What would you change first?

Then thank them and confirm nothing they did will affect real campaigns,
because the session ran on dev.

## After the session

Write down the exact name of the campaign the participant created in task 3.
At the end of the round these campaigns are deleted from dev (or the list is
handed to whoever can delete them) so they do not clutter the campaigns list
and make the next round's `[CAMPAIGN]` ambiguous. See `README.md`, "Clean up
after the round".
