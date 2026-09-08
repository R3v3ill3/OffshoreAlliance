# WP0.5 — Usability baseline pack (plan)

## 1. Specification

Work package, verbatim from `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md:118`:

> **WP0.5 Usability baseline pack.** Standard implementer writes the moderator script for the three baseline tasks, the SUS form, and a results template under `docs/organiser-ux-review/study/`. The study itself is run by people. No dependencies.

**Decisions consumed:** none. `docs/organiser-ux-review/DECISIONS.md` lists no decision blocking WP0.5 (the "Blocks" column names WP0.2/0.4/1.x/2.x/3.x only), and the orchestration prompt line 190 confirms WP0.5 is independent. The pack must not pre-empt decisions: it measures **today's UI**, so every task uses today's labels, and no phase-1+ vocabulary appears in the task wording.

**Operator inputs required before a round can run** (`DECISIONS.md`, "Operator inputs" table): a dev-database account per participant on project `dpnnmkhabysfdogllsyh`; dev seeded with campaign data (the current dev seed has campaign data stripped — `docs/DEV_PROD_ENVIRONMENT.md`, "The DEV database was seeded…"). These are recorded as blanks in the pack, not resolved by this work package.

**Source sections the content comes from:**
- Three tasks and "record task success, time, errors and SUS": plan section 7, Phase 0 bullet 2 (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`).
- Metrics table columns and the method paragraph (five-participant think-aloud, same three tasks each phase, SUS, card sort, tree test): plan section 8.
- Card-sort vocabulary: plan section 3.6 terminology table, plus the six terms named in section 8 (universe, group, unit, crew, structure test, plan).
- Citations: `docs/organiser-ux-review/appendix-F-research.md` section H — H.1 (five users; "the best results come from testing no more than 5 users"; first five find 85% of problems), H.3 (success rate; "User success is the bottom line of usability"; partial credit by defined levels), H.4 (slips vs mistakes), H.6 (card sort generates IA, tree test evaluates it; neutral labels), H.8 (Brooke SUS: ten items, 0–100, mean 68) and the "Top 15" item 15.
- Task 1 start point: appendix D 2.1 (login form success → `router.push("/campaigns")`, `src/app/(auth)/login/page.tsx:73`; `src/app/page.tsx:4` redirects to `/campaigns`; no role branch) and 2.2 (what `/campaigns` shows; row click → `/campaigns/{id}?tab=workforce&sub=wall-chart`, `campaigns/page.tsx:424,445`).

## 2. Plan

Docs-only. **No code, no schema, no tests.** Six new files under a new directory `docs/organiser-ux-review/study/`. Each file is short enough to read on a phone while moderating: no file over ~2 screens of prose, tasks and criteria as bullets and small tables, no nested tables.

### 2.1 `docs/organiser-ux-review/study/README.md` (new)
Purpose: how to run one round.
- Who: five organisers per round (cite appendix F H.1 with the NN/g URL). Same three tasks every phase (plan section 8 method paragraph).
- When: baseline now (phase 0); re-run after phase 4 (plan section 7, Phase 4 bullet 3). Tree test of the four-tab labels **before** phase 1 is built; card sort of the vocabulary **before** phase 2 (plan section 8 method paragraph).
- Session shape: 45 minutes — 5 welcome, 30 tasks, 5 SUS, 5 debrief. One moderator, one note-taker; think-aloud (appendix F H.5).
- Consent line to read verbatim, covering: voluntary, stop any time, we are testing the software not you, notes and (optional) screen recording, no recording of the participant's face, results reported without names.
- **Data safety (mandatory paragraph):** the round runs on the **dev preview** (Vercel Preview, Supabase dev `dpnnmkhabysfdogllsyh`) against seeded test data. **Never production** (`gteygwfgjvczanmrwgbr`) — participants create and modify real records during tasks 2 and 3, so a production session would write junk into live campaigns. The operator fills in, before the round: preview URL, participant login, the **named campaign** for task 1, the **named worker** and **named shift unit** for task 2, the **worksite** for task 3. In the scripts these appear as `[CAMPAIGN]`, `[WORKER]`, `[SHIFT UNIT]`, `[WORKSITE]`. Cross-reference `docs/DEV_PROD_ENVIRONMENT.md`.
- What to record: point at `results-template.md`; note that clicks and seconds for task 1 start at the login form submit.
- **Label note:** phase-0 wording uses today's labels; the phase-4 re-run swaps them for the new ones (Wall chart tab, Who's in, Group, Unit, Unassigned — plan section 3.6) while keeping the same three goals, so the numbers stay comparable.

### 2.2 `docs/organiser-ux-review/study/moderator-script.md` (new)
- Welcome + think-aloud instruction, verbatim ("say what you are looking for, what you expect, and what surprises you"; if they go quiet, prompt with "what are you thinking?" only).
- **What the moderator may say:** "what would you do next?", "what did you expect to happen?", "is this what you expected?"; echoing the participant's own words. **May not say:** the name of any tab, button or menu; "try the X tab"; "you're nearly there"; anything that confirms or denies correctness before the task ends.
- **Assist (definition, used by all three tasks):** any moderator utterance that names a UI element, points at the screen, or otherwise narrows the search. Count assists; a task with ≥1 assist can be at best **partial**. Errors are counted separately and classified slip vs mistake (appendix F H.4): a wrong click that the participant immediately corrects is a slip; a wrong destination they believe is right is a mistake.
- **Success levels** (partial credit per appendix F H.3): **success** = met the criterion unaided; **partial** = met it after ≥1 assist, or by a route the moderator had to unblock; **fail** = abandoned, timed out, or wrong end state.
- Task wording, exact, in today's labels (do **not** paraphrase into the new vocabulary):
  - **Task 1 — "Open the wall chart for `[CAMPAIGN]`."** Start: the login form, empty, on the preview URL; the timer and click count start on **submit** of the login form (appendix D 2.1: submit → `/campaigns`; `/campaigns` row click → `?tab=workforce&sub=wall-chart`, appendix D 2.2). Stop: the wall chart for `[CAMPAIGN]` is visible on screen. **Success = wall chart visible.** Record clicks and seconds (the plan section 8 row "Clicks and seconds from login to the wall chart of a named campaign"; target after phase 3 is 2 clicks / under 10 s). Timeout 3 minutes.
  - **Task 2 — "Put `[WORKER]` into the `[SHIFT UNIT]` shift."** Start: wherever task 1 ended. Stop: participant says they are done, or timeout 5 minutes. **Success = `[WORKER]` appears in `[SHIFT UNIT]`** (moderator verifies by reloading the unit — today under Workforce → **Campaign Units** (`src/app/(dashboard)/campaigns/[id]/page.tsx:615`) or via the wall chart's assignment path; today's neighbouring label for "no unit" is **Unallocated**, `campaign-units-section.tsx:1777`). Note which route they took.
  - **Task 3 — "Create a new campaign for `[WORKSITE]`."** Start: wherever task 2 ended. Stop: participant says they are done, or timeout 8 minutes. **Success = a campaign row exists with `[WORKSITE]` in scope, and the participant is on that campaign's page.** Record which of the two dialog options they chose — **Campaign wizard** (`/campaigns/new`) or **Manual create** (`/campaigns/new/manual`), both behind the **Create campaign** button (`src/app/(dashboard)/campaigns/page.tsx:382`, dialog 310-355; appendix D 1.5) — and whether they land on the wall chart. Plan section 8 target: under 3 minutes, 90%.
- Today's label references the script cites so a future editor knows what to change: Workforce tab (`campaigns/[id]/page.tsx:421`), **Wall Chart / List** sub-tab (614), **Campaign Units** (615), **Scope** (616), **Create campaign** (`campaigns/page.tsx:382`), **Assign to unit** (`workforce-bulk-toolbar.tsx:281`). Appendix D 3.2 is the single citation for the campaign tab labels.
- Closing debrief: three questions (hardest moment; anything you expected and did not find; what you would change first).

### 2.3 `docs/organiser-ux-review/study/sus-form.md` (new)
- The standard ten Brooke statements, in order, unmodified apart from the system name, with the note that **the wording is Brooke's standard and must not be reworded** or the 0–100 comparison and the 68 benchmark stop meaning anything (appendix F H.8):
  1. I think that I would like to use this system frequently. 2. I found the system unnecessarily complex. 3. I thought the system was easy to use. 4. I think that I would need the support of a technical person to be able to use this system. 5. I found the various functions in this system were well integrated. 6. I thought there was too much inconsistency in this system. 7. I would imagine that most people would learn to use this system very quickly. 8. I found the system very cumbersome to use. 9. I felt very confident using the system. 10. I needed to learn a lot of things before I could get going with this system.
- Scale: 1 = Strongly disagree … 5 = Strongly agree, every item answered, no "N/A".
- Scoring: odd items score (x − 1); even items score (5 − x); sum the ten; multiply by 2.5 → 0–100. State that **SUS is not a percentage** and that the average is 68 (appendix F H.8, MeasuringU). Cite Brooke's paper URL and the MeasuringU "10 things about SUS" URL as they appear in appendix F H.8.
- One line: administered once per participant, at the end, before the debrief.

### 2.4 `docs/organiser-ux-review/study/results-template.md` (new)
- Per participant: ID (P1…P5), role in the union, `work_role`, number of campaigns they run, device and browser used, date, moderator, note-taker.
- Per task, a small table: success / partial / fail, seconds, clicks (task 1 only), errors (count, each tagged slip or mistake), assists (count + what was said), verbatim quotes.
- SUS: the ten item scores per participant, the computed 0–100 score, and the mean across participants.
- A summary table whose rows are the plan section 8 metrics this study feeds, with a **Baseline (phase 0)** column to fill and the phase-3/4 target beside it, so it drops straight into section 8: clicks+seconds login→wall chart (target 2 clicks / <10 s); place a worker in the right unit (target 90% first-time, unaided); create a campaign and land on its chart (target 90%, <3 min); SUS (target >70 and +10 over baseline). Note that the four PostHog/data rows in section 8 come from WP0.2 and WP0.3, not from this study.
- A short "issues found" list, one line each, with the task and participant IDs that hit it.

### 2.5 `docs/organiser-ux-review/study/card-sort.md` (new)
- Open sort, run with organisers before phase 2 (plan section 8 method paragraph). Instructions: group the cards however they make sense to you, name each group in your own words, leave anything meaningless in a "don't know" pile; no right answer; think aloud.
- Cards are the **terms currently in use**, kept neutral (appendix F H.6: "Labels in a card sorting study must be neutral to prevent keyword matching") — so the recommended words are **not** signalled as answers. Drawn from plan section 3.6's "Terms in use" column plus the six terms named in section 8: universe, scope, campaign scope, target universe, named universe, workers in scope, organising unit, campaign unit, unit, sub-unit, group, cohort, segment, crew, unallocated, no unit, unassigned, plan, campaign plan, strategic plan, workplan, section plan, stage plan, structure test, wall chart, list view, standalone, episode, standing campaign, organiser record. 30 cards. Instruct the operator to run ~20–24 of these (trim, don't add) so the sort fits 15 minutes, keeping the six section-8 terms in every trimmed set. **"colour by" is not a card** — it is a recommended label from section 5.6, not a term in use, and no such string exists in the product.
- What to record: the groups, their names, and any card the participant could not place. What we are testing: whether "group" and "unit" match the organisers' own words (appendix F H.6, "Applies here").

### 2.6 `docs/organiser-ux-review/study/tree-test.md` (new)
- Run before phase 1 is built (plan section 8 method paragraph); text-only tree, no UI, no back-channel hints; record the path taken and whether they backtracked.
- The tree is the four-tab campaign workspace from plan section 5.4: **Wall chart · People · Activity · Setup · More ▾**, with the second level as section 5.4 states it (Setup → Who's in, Groups & units, Organisers, Basics; More → Strategic plan, Bargaining, Section plans, Insights, Data fields, Activists & WOCs, Library, Imports; Activity → assessments, lists, calls, SMS, email, tasks). Every second-level cell must be a **showable label**, not a description of the tab: Wall chart → Wall chart, List; People → List, Filters, Bulk actions (section 5.4 lists exactly these). The deliberate "List" collision between Wall chart and People is what the tree test is there to expose.
- 10 find-tasks phrased as goals, with **no word from the tree in any task** (that rules out plan, list, assessment, organiser, who's in, group, unit, wall chart, activity, setup, insight, library, import, bargaining, section, data field, call, SMS, email, task): see how a shift is tracking; change which employers and sites the campaign covers; add a shift to the campaign; find out which colleagues are working on this campaign; send a text message to a set of workers; see what was recorded about individual workers last week; change the campaign's start date; see how we intend to win this campaign over the next year; find a document about the agreement; find every worker at one site who has no phone number recorded. The last of these is the Wall chart / People discriminator; it takes the slot of "see how the campaign is going overall", which duplicated task 1's phrasing.
- Record: first click, destination, correct/incorrect, seconds. Cite appendix F H.6 for card sort vs tree test.

### 2.7 Also touched
- `docs/organiser-ux-review/PROGRESS.md:64` — the row "Run the usability baseline study (WP0.5 pack) | Phase 0 | pending" stays `pending` (the study is human work); add one WP0.5 row for the pack itself, marked done, following the file's existing row format. No other file changes.

### 2.8 Verification (exact commands)
Docs-only package, so the acceptance check is that nothing in the app changed and a human reads the six files.
- From `apps/organising-db`: `pnpm lint` — must still pass (proves no code was touched; there is no code in this package).
- `git status --porcelain` — the only changes are the six new files under `docs/organiser-ux-review/study/` plus the `PROGRESS.md` row.
- Reviewer check, recorded in the PR: (a) the three tasks in `moderator-script.md` are the three in plan section 7 Phase 0 bullet 2, in that order; (b) the ten SUS statements in `sus-form.md` are Brooke's standard ten in the standard order with the standard 1–5 scale and the ×2.5 scoring; (c) every task uses a label that exists in today's UI, checked against appendix D 3.2 and 1.5; (d) the data-safety paragraph names dev `dpnnmkhabysfdogllsyh` and forbids production.
- **No tests.** `pnpm test` and `pnpm build` are unaffected; run `pnpm test` once only to confirm no regression if the reviewer wants belt and braces.

### 2.9 Risks and the rules they could break
- **Using the new vocabulary in the phase-0 task wording** would break the baseline (participants would be tested on labels that do not exist yet) and would make the phase-4 comparison meaningless. Mitigation: the label-provenance list in 2.2 and the reviewer check 2.8(c). This is the one place where the orchestrator rule "every user-facing string uses the plan's terminology" is deliberately not applied — the study documents are moderator instructions describing today's screens, not product strings; the README states the phase-4 swap explicitly.
- **A session run against production** would write test campaigns and unit placements into live data. Mitigation: the data-safety paragraph is the first substantive section of the README and repeats at the top of the moderator script.
- **Rewording SUS** ("this system" → product name in more than the noun, dropping an item, using a 1–7 scale) invalidates the 0–100 score and the 68 benchmark. Mitigation: the "do not reword" note and reviewer check 2.8(b).
- Placeholder drift (operator forgets to fill `[WORKER]`): the README's pre-round checklist lists all five placeholders in one place.

## 3. Out of scope

- Running the study, recruiting participants, scheduling, obtaining consent, and recording or analysing any results. Filling in the placeholders and the summary table is operator work.
- Any code, component, route, string, migration, feature flag or test. No `src/**` file is touched.
- Seeding the dev database, creating test accounts, or standing up the preview — operator inputs listed in `DECISIONS.md`.
- Building the tree test or card sort in a tool (Optimal Workshop, Maze). The pack is markdown the moderator can run on paper or in a spreadsheet; buying a tool is a separate decision.
- The other section 8 metrics (campaigns with a group, memberships in a unit, PostHog return rate, support questions) — WP0.2, WP0.3 and appendix G supply those; the results template only points at them.
- UMUX-Lite (appendix F H.8) as an in-app pulse — a phase-1+ product change, not a moderator document.
- A 20–40 participant quantitative benchmark (appendix F H.2). Phase 0 is the five-participant qualitative round the plan asks for.

## 4. Open questions

None blocking. Assumptions taken, to be corrected by the operator if wrong:
- Five participants are available and are organisers (not admins). If fewer than five, the round still runs and the README says to report n.
- Sessions are moderated, possibly remote (appendix F H.5 allows both); the script is written to work either way and does not assume screen sharing beyond the moderator seeing the participant's screen.
- The dev database will have campaign data by the time a round runs; if it does not, tasks 1 and 2 have nothing to point at, and the README says the round cannot start until the operator confirms a usable `[CAMPAIGN]` and `[WORKER]`.
- The pack ships in the same PR/branch as the rest of phase 0 documentation work, on `feat/oux-wp0.1-decision-register`, with no branch switch.

## 5. Orchestrator approval

**Approved 2026-09-08** with two corrections to section 4's assumptions:
- The package ships on its own branch `feat/oux-wp0.5-usability-baseline-pack` (one branch per work package), stacked on the WP0.1 branch until PR #22 merges; PR base is `develop`.
- `PROGRESS.md` already has a WP0.5 ledger row; update its status, branch and PR columns rather than adding a row. Keep the human-task row "Run the usability baseline study" as pending.
Everything else stands as written. Scope is the six files under `docs/organiser-ux-review/study/` plus the ledger row.

## 6. Deviations from plan

- **Ledger row.** Section 2.7 says to add a WP0.5 row; the orchestrator
  approval (section 5) says to update the existing one. Followed the approval:
  the existing row 0.5 now reads `in review`, branch
  `feat/oux-wp0.5-usability-baseline-pack`, verification "docs only: lint
  unchanged". The PR column is left blank for the orchestrator. The human-task
  row "Run the usability baseline study (WP0.5 pack)" is unchanged and still
  `pending`.
- **File path correction.** Section 2.2 cites `workforce-bulk-toolbar.tsx:281`
  for "Assign to unit" and `campaign-units-section.tsx:1777` for "Unallocated".
  Both are bare filenames. The real paths, relative to `apps/organising-db/`,
  are `src/components/campaigns/workforce/workforce-bulk-toolbar.tsx:281` and
  `src/components/campaigns/campaign-units-section.tsx:1777`; the script's
  label table now cites those in full, and the other four rows in that table
  are given as `src/app/(dashboard)/campaigns/...` for the same reason. All
  cited labels and line numbers were checked against the source and are correct
  as written.
- **Placeholder table has six rows, not five.** Section 2.9 calls for "all five
  placeholders in one place". The README's pre-round table lists the four
  bracketed placeholders (`[CAMPAIGN]`, `[WORKER]`, `[SHIFT UNIT]`,
  `[WORKSITE]`) plus the preview URL and the participant login, which section
  2.1 also requires the operator to fill in. Six rows, one table.
- **PROGRESS.md standing-note paragraph** recording the `develop` baseline was
  added by the orchestrator on this branch (commit `c8639d2`); orchestrator
  housekeeping, not part of the pack.

Everything else is as planned. No `src/**` file was touched.

### Fix round 1 (reviewer findings 1–11)

- Five tree-test find-tasks contained a tree label word (strategic plan, who is
  in, assessments, list, organising). Rewritten as goals; the rule "no word
  from the tree in any task" is now stated in both `tree-test.md` and section
  2.6, with the excluded words listed.
- The "colour by" card is removed (a section 5.6 recommendation, not a term in
  use; no such string in `apps/organising-db/src`). Bare **unit** and bare
  **plan** added, because plan section 8 names them. 30 cards.
- Login-form submit is stated as click 1 in `README.md` and
  `moderator-script.md`, so today's route records 2 clicks and matches plan
  section 7 and the phase-3 target in `results-template.md`.
- `Wall chart` and `People` now have showable child labels, and a tenth
  find-task discriminates between them.
- Task 1 succeeds on either layout of the Wall Chart / List sub-tab; the
  moderator records which layout was showing.
- "Clicks and seconds from login to a standalone SMS or email composer" added
  to the results template's "not from this study" list (WP0.2 instrumentation).
- Both scripts tell the operator to delete the task-3 campaigns from dev after
  each round.

## 7. Verification output

Docs-only package. The evidence that it is docs-only is that the lint error
count is unchanged from the `develop` baseline and that no non-docs file
appears in the diff. Measured 2026-09-08 at `c8639d2`, immediately before the
fix-round-1 commit; the fix round touched the same eight docs files and no
others.

`develop` baseline for comparison, from `PROGRESS.md` standing notes: `pnpm
lint` 143 errors / 151 warnings, all pre-existing. `pnpm lint` exits non-zero on
`develop` for that reason, so a non-zero exit here is expected and is not a
regression.

```
$ cd apps/organising-db && pnpm lint 2>&1 | tail -3
  7 errors and 16 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
```

The count line from the same run, which `tail -3` cuts off:

```
✖ 294 problems (143 errors, 151 warnings)
```

143 errors / 151 warnings: identical to the baseline.

```
$ git diff --stat feat/oux-wp0.1-decision-register..c8639d2   # measured before fix round 1; see round-2 review note below
 docs/organiser-ux-review/PROGRESS.md               |   3 +-
 docs/organiser-ux-review/study/README.md           | 118 ++++++++++++++++
 docs/organiser-ux-review/study/card-sort.md        |  90 +++++++++++++
 docs/organiser-ux-review/study/moderator-script.md | 147 ++++++++++++++++++++
 docs/organiser-ux-review/study/results-template.md | 131 ++++++++++++++++++
 docs/organiser-ux-review/study/sus-form.md         |  60 +++++++++
 docs/organiser-ux-review/study/tree-test.md        |  75 +++++++++++
 docs/organiser-ux-review/wp/wp0.5.md               | 150 +++++++++++++++++++++
 8 files changed, 773 insertions(+), 1 deletion(-)
```

```
$ git diff --name-only feat/oux-wp0.1-decision-register..HEAD | grep -v '^docs/' || echo none
none
```


## 8. Reviewer findings

**Round 1 (2026-09-08, fresh reviewer): BLOCK.** Three blocking findings: tree-test find-tasks reused tree label words; "colour by" card was a recommended term, not one in use; login-submit click counting was ambiguous against the 2-click target. Eight advisories (stale verification block, missing bare unit/plan cards, task-1 layout rule, Wall chart/People child labels, abbreviated paths, orphaned section-8 metric, dev cleanup instruction, undeclared orchestrator deviation). All addressed in commit 0437536.

**Round 2 (2026-09-08, fresh reviewer): APPROVE WITH ADVISORIES.** All three blocking findings verified closed; regression pass clean (SUS standard ten, three tasks match plan §7, every cited code line correct, URLs verbatim from appendix F, no non-docs file in the diff). Five advisories, applied by the orchestrator in the final commit: §7 diff-stat relabelled to the commit it was measured at (`c8639d2`; the block cannot be self-consistent at HEAD because this file's own line count is in the stat); task 10 reworded to drop "who"; task 10 marked mandatory; tree-test exclusion list widened to every tree label; moderator-script provenance sentence corrected.
