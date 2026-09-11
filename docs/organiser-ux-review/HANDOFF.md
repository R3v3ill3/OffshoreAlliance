# Organiser UX programme — handoff (written 2026-09-10; status updated 2026-09-11)

This file is for whoever picks the work up next, human or agent. It records where the programme is, what
is left on the two tracks in front of it (getting phase 1 onto production; starting phase 2), and a
ready-to-paste prompt for an orchestrating agent. Nothing here replaces the documents it points at; it
tells you which ones to read and what they do not yet say.

## 1. Where things stand

**Phase 0 and phase 1 are complete and live in production.** Every work package was planned,
implemented, verified and reviewed to approval per the protocol in
`IMPLEMENTATION_ORCHESTRATION_PROMPT.md`, then merged into `develop` and promoted to `main`:

| PRs | Content |
|---|---|
| #22–#26 | Phase 0: decision register, test harness and baseline, copy/layout quick wins, data-hygiene scripts, usability study pack |
| #27–#33 | Phase 1: workspace mode (module registry, org and per-user prefs), module-driven nav, My campaigns home and landing gate, organiser campaign workspace (4 tabs + More, switcher), Actions hub, auth/RLS alignment, guides manifest + first-use rating hint |
| #34 | Tests only: e2e suite owns its preconditions (hint dismissal seeded, workspace mode pinned per spec) |
| #35 | Fix: Users edit dialog capped to the viewport with scrolling body, two-column module checklist, "Default for role" shows the resolved mode |

`develop` after the main-sync PR #36: `e6a97fc`; production promotion PR #37 merged to `main` at
`0f22d49` on 2026-09-11 and Vercel Production completed successfully. Gates on the phase-1 tree:
`tsc` clean; vitest green (1029+ tests); lint at the recorded baseline (294 problems, pre-existing;
standard is touched lines clean and the count not rising); full credentialled e2e green repeatedly on
Vercel previews.

**The six phase-1 migrations are applied to both dev and production:**

```
supabase/migrations/20260909100000_workspace_mode.sql
supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql
supabase/migrations/20260909130000_wp1_6_delete_campaign_standing_guard.sql
supabase/migrations/20260910090000_campaign_last_activity.sql
supabase/migrations/20260911090000_user_hint_dismissals.sql
supabase/migrations/20260911100000_user_hint_dismissals_check.sql
```

**What an organiser sees today on production and dev.** The operator set the org-wide default for the
`organiser` work role to organiser mode (Administration → Settings → Workspace card). A converted
`user`-role organiser was verified signing out/in, opening their campaigns, deleting an empty unit,
landing on My campaigns with the reduced nav and four-tab campaign workspace, and using "Show
everything". Per-user overrides remain available in Administration → Users.

**WP0.4 production data status.** The audit log is secured; script 02 inserted 21
`campaign_organisers` rows with zero missing campaigns; script 01 converted seven organisers after
WP1.6 was live. Script 03 safely deleted one eligible duplicate, but 29 further excess placements in
five partitions contain orphaned historical rule rows and are explicitly deferred to a reviewed
pre-WP2.1 data fix. Cross-campaign worker membership remains supported.

## 2. Documents to read, in order

1. `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` — the plan. Section 6 (data model) and section 7 phase 2 are
   what comes next.
2. `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md` — the mission, rules, team, protocol,
   reviewer checklist, and the WP2.x work breakdown (lines 140–160). The non-negotiable rules there stay in
   force; the summary in section 4 below does not soften them.
3. `docs/organiser-ux-review/DECISIONS.md` — the ten decisions, answered 2026-09-08 with amendments
   (3: user-defined group kind; 5: Employer and Worksite are independent facets, any cardinality;
   6: default kind Bargaining, plan prompted but optional; 7: nothing retired, only demoted; 8: users may
   self-assign). Operator inputs and WP1.6 sign-offs are recorded there too.
4. `docs/organiser-ux-review/PROGRESS.md` — the ledger (one row per WP, with evidence and open items),
   standing notes, phase exits, human tasks, incidental findings.
5. `docs/organiser-ux-review/wp/wp1.1.md` … `wp1.7.md` — per-package plans, deviations, verification
   output and reviewer findings. `wp1.6.md` matters most for the production transition.
6. `docs/organiser-ux-review/appendix-A-wallchart.md` and `appendix-C-data-model.md` — WP2.1 and WP2.3
   are specified against these. Note the standing finding that appendix-cited migration files now live in
   `supabase/migrations_legacy/` (audit only); the live schema is
   `supabase/migrations/20260908050000_baseline_schema.sql` plus the files listed above.

## 3. Environment facts an agent cannot derive from the repo

- **Two Supabase projects.** Dev `dpnnmkhabysfdogllsyh` (all work). Production `gteygwfgjvczanmrwgbr`
  (never touched by an agent, not even a read). `supabase/.temp/project-ref` shows which project the CLI is
  linked to; check it before any `supabase` command. The `.temp` files are tracked in git and a fresh clone
  links to production, so they always show as modified locally; do not commit them. Recommended: gitignore
  `supabase/.temp/`.
- **`apps/organising-db/.env.local` points at production.** No agent runs the app locally. `pnpm build`
  is fine; `pnpm dev` is not. Product verification happens on Vercel branch previews.
- **Vercel.** Git `main` deploys to Production; every other branch gets a Preview built with the dev
  project's credentials. Find a commit's preview URL with
  `gh api repos/R3v3ill3/OffshoreAlliance/deployments?sha=<sha>` then
  `gh api repos/R3v3ill3/OffshoreAlliance/deployments/<id>/statuses` (`environment_url` on the `success`
  status). Vercel CLI is not installed. PostHog is not configured for previews.
- **E2E.** Playwright `@playwright/test@1.56.1`, pinned to the cached Chromium build (no download). Run from
  `apps/organising-db`: `E2E_BASE_URL=<preview url> pnpm e2e`. Credentials are `E2E_USER_EMAIL` /
  `E2E_USER_PASSWORD` (a `user`/organiser account, organiser_id 10, auth uid
  `f7c048e2-ecfe-4e9c-8715-7f4c899f0d37`) and `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (an admin /
  lead organiser). They live only in the operator's `~/.zshrc`; load with `source ~/.zshrc >/dev/null 2>&1`
  and never print them. Without them the suite skips every signed-in spec (14 skipped, 0 failed) and that
  is the credential-less gate. Two projects: `chromium` and `chromium-admin` (specs under
  `tests/e2e/roles/*-admin.spec.ts`). Storage states under gitignored `tests/e2e/.auth/`. The REST helper
  `restClientFor` refuses a production session. `E2E_FOREIGN_CAMPAIGN_ID=3` is the campaign the e2e user
  must not be able to write to. Dev campaign 1 belongs to organiser 10 (reassigned for flow one).
- **Types.** After any migration on dev: `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` and
  commit `packages/db-types`.
- **Dev data state.** The operator ran the WP0.4 hygiene scripts on dev on 2026-09-08 (02 inserted 5,
  03 deleted 2, 01 converted 4). Dev has had no refresh from production since; campaign data is thin.
  Phase 2's WP2.1 wants a production-seeded dev database for its rehearsal. Only the operator can produce
  that snapshot (Supabase dashboard backup or their own `pg_dump`); an agent must not read production to
  make one.
- **Bash gotcha.** Use absolute paths; `cd apps/organising-db` fails when the shell is already there.
  Delete `.next/types` before `tsc` if it reports errors in generated route types.

## 4. Non-negotiables (summary; the orchestration prompt is authoritative)

Never touch production `gteygwfgjvczanmrwgbr`. Never edit an applied migration; add a timestamped file,
apply to dev first, regenerate types. Branches `feat/oux-<wp-id>-<slug>` off `develop`, draft PRs into
`develop`, never push to `main`, no worktrees, no sub-branches, one commit per completed unit. Nothing is
removed, only relocated; full mode keeps working; new flags default off. Do not skip or quarantine tests.
No materialised Unassigned rows; no localStorage view state; no new campaign-creation path. Fresh reviewer
agent each round; at most two fix rounds, then stop and report. Stop and ask the operator on open
decisions, migration conflicts, wrong appendix claims, third fix rounds, or anything touching production.

## 5. Track A — phase 1 production transition (completed 2026-09-11)

Production promotion [PR #37](https://github.com/R3v3ill3/OffshoreAlliance/pull/37) merged at
`0f22d49`; Vercel Production succeeded; the production migration ledger contains all six phase-1
migrations. WP1.6 pre-flight returned zero rows, the post-flight roster was reviewed, seven organisers
were converted to `user`, and the operator verified the organiser flow and enabled Organiser mode for
all users with the organiser work role.

Do not rerun the production run sheet as a deployment step. Its audit log and rollback scripts remain
available. Script 03's remaining orphan-rule placements are a phase-2 prerequisite, recorded in
`PROGRESS.md`, not an incomplete phase-1 rollout.

Outstanding housekeeping remains separately authorised: gitignore/untrack `supabase/.temp/`; consider
blanking `sms_provider` on dev; rotate the two passwords pasted during setup; and address lint debt in a
separate task.

## 6. Track B — phase 2

**Gate answered.** The pilot is all users with the organiser work role; phase 2 is approved; a
production-derived dev snapshot is to be prepared after the phase-1 rollout and is still pending.
WP2.3 therefore started first. WP2.1 may be planned, but implementation/rehearsal remains blocked on
the snapshot and the reviewed cleanup of the orphaned rule placements found during the production
WP0.4 run.

**Order** (from the orchestration prompt's dependency summary): WP2.1 and WP2.3 in parallel → WP2.2 →
WP2.4 → WP2.5, WP2.6, WP2.7 (2.7 needs only 2.2) → WP2.8 → WP2.9. WP3.3 and WP3.5 may also start now
that phase 1 is merged.

**WP2.1 Schema and migration** (Fable planner and reviewer; high-risk implementer). Plan section 6:
`campaign_groups` (with a user-defined `kind` per decision 3), `group_id` on units and worker-unit rows
with the trigger and unique index, `campaign_group_membership` view, `user_campaign_prefs` (server-side
per-user state replaces the removed localStorage state); the backfill mapping from section 6, where
decision 5 makes Employer and Worksite independent facets; dependent views recreated in the order in
appendix C 8.4. Acceptance: rehearsal on production-seeded dev shows membership counts unchanged, every
leaf unit has a `group_id`, zero one-unit-per-group violations, hazard queries H1–H8 reproduced before and
after, written rollback. Behind `groups_v2`, default off. Regenerate types.

**WP2.3 Wall chart decomposition — implemented and approved, PR pending.** Commit `1694b8a` reduces
`src/components/campaigns/campaign-wall-chart.tsx` from 2,635 to 320 lines across focused
hooks/components with no runtime behaviour change. Local gates and the dev-backed branch preview are
green; frozen characterisation tests pass against the pre-refactor and decomposed implementations; the
fresh terminal reviewer returned APPROVE WITH ADVISORIES after an operator-authorised third test-only
round. The sole advisory is the fake PostgREST harness's incomplete projection/predicate/order
emulation. Final evidence/ledger commit and PR remain.

**Things phase 1 left that phase 2 touches.**
- Incidental findings in `PROGRESS.md` (unassigned): SOC wizard `cid` mismatch; `supabase/.temp`
  tracked; appendix's 45-surface count. Assign or leave, but do not fold silently into a WP.
- Human tasks: OVERVIEW clip re-record (phase 1 changes); B1–B3 and C1–C3 re-record is WP2.9; usability
  baseline study (WP0.5 pack) still pending. The phase-1 portion of the WP0.4 production run is complete;
  its orphan-rule cleanup is a pre-WP2.1 code/data task.
- A separate operator session was started from this one on 2026-09-10 titled "Make e2e full-mode specs own
  their workspace default". If it produced a branch or PR, reconcile it with #34's `withUserMode` helper
  before adding more e2e suites.
- Advisories accepted but not acted on: the two-column module checklist also reflows the Settings card;
  the checklist `title` tooltip is hover-only; the Users dialog admin suffix is suppressed while loading.

## 7. Prompt for the next orchestrating agent

> **Superseded status notice (2026-09-11):** the prompt below predates the completed production rollout
> and WP2.3 implementation. Do not paste it unchanged. Use sections 1, 5 and 6 above plus
> `PROGRESS.md` and `wp/wp2.3.md` as the current state.

Paste the following as the opening message of a new session in this repository.

---

You are the orchestrator for the Organiser UX programme in `apps/organising-db`. Phases 0 and 1 are
complete and merged into `develop` (PRs #22–#35). Your job is to (1) prepare the operator's transition of
phase 1 to production and (2) run phase 2, one work package at a time, exactly under the protocol in
`docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md`.

Read, in order, and do not re-derive what they establish: `docs/organiser-ux-review/HANDOFF.md` (this
file: state, environment facts, the two tracks), `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md`
(rules, team, protocol, reviewer checklist, WP2.x breakdown), `docs/organiser-ux-review/DECISIONS.md`
(answered, with amendments), `docs/organiser-ux-review/PROGRESS.md` (ledger), `docs/ORGANISER_UX_REVIEW_AND_PLAN.md`
sections 5.5–5.7, 6 and 7, and `docs/organiser-ux-review/wp/wp1.6.md`. Then `git fetch` and confirm
`develop` is at or past `e55b52d`, `cat supabase/.temp/project-ref` prints `dpnnmkhabysfdogllsyh`, and
`git status` shows only the `supabase/.temp/*` files modified.

Non-negotiables, unchanged: never touch the production database `gteygwfgjvczanmrwgbr`, not even a read;
all DB work on dev `dpnnmkhabysfdogllsyh`; never edit an applied migration (timestamped file, dev first,
`SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`); branches `feat/oux-<wp-id>-<slug>` off
`develop`, draft PRs into `develop`, never push to `main`, no worktrees; nothing removed, only relocated;
full mode keeps working; `groups_v2` and any new flag default off; never skip or quarantine tests; no
materialised Unassigned rows, no localStorage view state, no new campaign-creation path; fresh reviewer
each round, two fix rounds maximum then stop and report; stop and ask on open decisions, migration
conflicts, wrong appendix claims, third fix rounds, or anything touching production. The local
`apps/organising-db/.env.local` targets production: no agent runs the app locally; verify on Vercel branch
previews and with `E2E_BASE_URL=<preview> pnpm e2e` (credentials from `source ~/.zshrc`, never printed).

Step 1 (Track A). Produce a checklist for the operator from HANDOFF.md section 5, with the exact
commands and the expected result of each step, and post it. Do not execute any of it. Ask whether WP0.4
scripts 00 → 02 → 03 have been run on production.

Step 2 (gate). Ask the operator the three phase 1 exit questions in HANDOFF.md section 6 (pilot group; go
for phase 2; production snapshot into dev, and when). Wait for the answers. If the snapshot is deferred,
start WP2.3 alone and plan WP2.1 without executing the rehearsal.

Step 3 (Track B). Run WP2.1 (Fable planner and reviewer, high-risk implementer) and WP2.3 (high-risk
implementer, behaviour-preserving) in parallel on disjoint files, then WP2.2, WP2.4, and onward per the
dependency summary. For each package: planner writes `docs/organiser-ux-review/wp/wp2.x.md`; operator
approves the plan; implementer works on its branch; verifier runs `tsc`, vitest, lint (touched lines clean,
count not above 294), migration validation on dev, and the e2e flows the package names, against the branch
preview; a fresh reviewer applies the checklist; fix rounds as protocol. After each package report the
ledger row, the evidence, the reviewer verdict and the next package. At the phase 2 exit post the criteria
from `PROGRESS.md` and wait.

Reconcile first: check for any branch or PR from the operator's separate session "Make e2e full-mode
specs own their workspace default" and align it with `tests/e2e/workspace-mode.ts` before adding e2e
suites.

---
