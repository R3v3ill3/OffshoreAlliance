# Usability baseline pack

How to run one round of the organiser usability study.

This pack is moderator paperwork. It does not change the product. The study
itself is run by people.

Files in this folder:

- `README.md` (this file): how to run a round.
- `moderator-script.md`: what to say, the three tasks, how to score them.
- `sus-form.md`: the ten SUS statements and the scoring rule.
- `results-template.md`: where the numbers go.
- `card-sort.md`: vocabulary card sort, run before phase 2.
- `tree-test.md`: navigation tree test, run before phase 1 is built.

## Data safety: read this first

Run every session on the **dev preview**. That is the Vercel Preview
deployment backed by Supabase dev project `dpnnmkhabysfdogllsyh`, against
seeded test data.

**Never run a session on production** (`gteygwfgjvczanmrwgbr`,
`oa.uconstruct.app`). Participants create and modify real records during
tasks 2 and 3. A production session would write junk campaigns and junk unit
placements into live campaign data.

See `docs/DEV_PROD_ENVIRONMENT.md` for which URL points at which project.

### Fill these in before the round

The operator fills all of these in before the first session. The scripts use
them as placeholders.

| Placeholder | What it is | Value |
|---|---|---|
| (preview URL) | the dev preview address the participant opens | |
| (login) | the participant's dev account and password, given out of band | |
| `[CAMPAIGN]` | a named campaign that exists in dev, used in task 1 | |
| `[WORKER]` | a named worker in that campaign, used in task 2 | |
| `[SHIFT UNIT]` | a named shift unit in that campaign, used in task 2 | |
| `[WORKSITE]` | a worksite the participant will create a campaign for, in task 3 | |

The dev seed has had campaign data stripped in the past
(`docs/DEV_PROD_ENVIRONMENT.md`). Do not start a round until the operator has
confirmed a usable `[CAMPAIGN]`, `[WORKER]` and `[SHIFT UNIT]` on dev. Without
them, tasks 1 and 2 have nothing to point at.

### Clean up after the round

Task 3 leaves one new campaign per participant on dev, all named after
`[WORKSITE]`. After every round, delete them (or write down the exact names and
hand the list to whoever can delete them). Left in place they clutter the
campaigns list and make the next round's `[CAMPAIGN]` ambiguous, which changes
the click count for task 1. Do not delete the seeded `[CAMPAIGN]` itself.

## Who takes part

Five organisers per round. NN/g: "The best results come from testing no more
than 5 users and running as many small tests as you can afford", and the first
five find about 85% of the usability problems
(https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/ ;
https://www.nngroup.com/articles/how-many-test-users/).

Organisers, not admins. If fewer than five are available, run the round anyway
and report the number of participants (n) with the results.

## When to run

- **Baseline: now (phase 0).** This is the round the pack is written for.
- **Re-run after phase 4**, with the same three goals, and compare
  (plan section 7, phase 4).
- **Tree test before phase 1 is built** (`tree-test.md`).
- **Card sort before phase 2** (`card-sort.md`).

The same three tasks are used every phase so the numbers stay comparable
(plan section 8, method paragraph).

## Session shape

45 minutes:

| Minutes | What |
|---|---|
| 5 | Welcome and consent |
| 30 | The three tasks |
| 5 | SUS form |
| 5 | Debrief |

One moderator and one note-taker. The participant thinks aloud. Think-aloud is
the first tool to reach for: "Simple usability tests where users think out
loud are cheap, robust, flexible, and easy to learn"
(https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/).

Sessions can be in person or remote and moderated
(https://www.nngroup.com/articles/remote-usability-tests/). The moderator needs
to see the participant's screen. Nothing else is assumed.

## Consent, read verbatim

> This is voluntary. You can stop at any time, and you do not have to give a
> reason. We are testing the software, not you. If something is hard to use,
> that is the software's fault and it is what we want to find. I will take
> notes. With your permission we will also record the screen, but not your
> face. Results are reported without names. Do you agree to take part, and are
> you happy for us to record the screen?

Record the answer on the results sheet. If they say no to recording, run the
session with notes only.

## What to record

Use `results-template.md`. One sheet per participant.

For task 1, the timer and the click count start when the participant submits
the login form. They do not start when the browser opens.

**The login submit is click 1.** Count it. Today's shortest route is submit
(click 1) followed by one click on the campaign's row in the list (click 2),
which lands on the wall chart: **2 clicks**. That is why plan section 7 says
"two clicks from login" and why the phase-3 target in `results-template.md` is
2 clicks. If you do not count the submit you will record 1 and the baseline
will not compare with the target.

## Label note

The phase-0 task wording uses **today's labels**. This is deliberate. The study
measures today's UI, so it must use the words that are on today's screens.

When the study is re-run after phase 4, swap the labels for the new ones
(Wall chart tab, Who's in, Group, Unit, Unassigned: plan section 3.6) and keep
the three goals identical. The goals are what stays comparable across rounds,
not the wording.
