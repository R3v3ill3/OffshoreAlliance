# Orchestration prompt: phase 2 onward, integrating on `main`

**How to use this file.** Open a new Claude Code session on this repository with `main` checked out and paste everything inside the fenced block below as the first message. The session becomes the orchestrator for the rest of the Organiser UX programme. It delegates to sub-agents, never edits code itself except the ledger and plan files, and never touches the production database.

**Model for the orchestrator session:** Claude Fable 5.1 (`claude-fable-5-1`), effort `xhigh`. Fable's thinking is always on, its turns on hard problems can run for many minutes, and it does best with the full task given up front and the method left to it. That is how this prompt and the work-package specifications it points to are written. Do not run the orchestrator on a smaller model: it holds the whole plan, decides stop conditions and approves every sub-agent plan.

**Sub-agent models** are in the team table inside the prompt. The Claude Code names are what the `Agent` tool's `model` parameter accepts (`fable`, `opus`, `sonnet`, `haiku`); the API identifiers are the same models by name (`claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`).

---

```markdown
# Mission

You are the orchestrator continuing the Organiser UX programme (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`, 7 September 2026) in the `apps/organising-db` app of this repository. Phases 0 and 1 are live on production. Phase 2 has started: WP2.1 (campaign groups schema) and WP2.3 (wall chart decomposition) are complete, WP2.2 (structure API) is planned and approved but not built. Your job is to deliver WP2.2 and then the rest of phase 2, then phases 3 and 4, one work package at a time, as merged, verified, reviewed pull requests, without regressing anything organisers use today.

Optimise for correctness and economy of effort, not speed. Nothing merges without evidence. The production database is never touched by an agent, not even for a read.

# What changed since the previous orchestrator, and why you are reading this file

1. **Integration branch is now `main`.** The programme previously integrated on `develop` and promoted to `main` in batches. From today, `develop` is parked at `68400084` (three commits behind `main`) and is not used: do not branch from it, merge into it, merge from it, or delete it. Every feature branch is cut from `main`; every pull request targets `main`. Because a merge to `main` deploys to Vercel Production immediately and triggers a types regeneration from the production database, the promotion gate below applies to every pull request that carries a migration.
2. **WP2.1 is complete on production and on normal dev.** The schema was applied to production on 13 September, the C1/03b cleanup and a passing postflight followed on 14 September, and normal dev already carried the migration. Evidence: `docs/organiser-ux-review/wp/wp2.1.md` §15. Do not re-run any WP2.1 script or migration anywhere.
3. **The WP2.2 plan lives on a branch cut from `develop`.** `feat/oux-wp2.2-structure-api` holds three docs-only commits (the approved plan, and the WP2.1 production evidence) and is draft PR #41 into `develop`. Step 0 below moves it onto `main`.
4. **Three Supabase projects exist and stay as they are for this development phase.** Their roles are under "Environment facts". Returning to two projects is an end-of-programme task, not something to plan around now.
5. **Two findings from the production run that bind WP2.2.** (a) Opening a campaign page runs a universe sync in the background (`WorkforceBoard` posts to `/api/campaigns/[id]/sync-universe-workers` on mount for any writer), so it is a live writer path and will be the first thing to hit the WP2.2b unique index. (b) The WP2.1 run sheet was executed out of order on production (migration before cleanup); nothing broke, but WP2.2's production sequence must be run as one checklist with each step's output pasted before the next.

# Read these first, in this order; do not re-derive what they establish

1. `docs/organiser-ux-review/CURRENT_STATUS_AND_NEXT_STEPS.md` — current state, environment safety, what is done.
2. `docs/organiser-ux-review/HANDOFF.md` sections 1, 3, 4 and 6 — environment facts an agent cannot derive from the repo, the non-negotiables, phase 2 order.
3. `docs/organiser-ux-review/DECISIONS.md` — the ten decisions plus the WP2.1 amendments E2, M2, C1, F1 and the WP2.2 approvals R1, M2-a, K1, G1, T, C-k.
4. `docs/organiser-ux-review/PROGRESS.md` — the ledger. You own it from now on.
5. `docs/organiser-ux-review/wp/wp2.1.md` §2.3, §3.6, §6.4 and §15 — the schema WP2.2 builds on, the Recompute risk, the exact enforcement handoff, and the production evidence.
6. `docs/organiser-ux-review/wp/wp2.2.md` — the approved WP2.2 plan. Section 0 is the database sequence; §3.11 is the writer switch table; §6 is stages and the G1 gate; §9.1 records the approvals.
7. `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md` — the protocol you inherit (team, work-package protocol, verification standards, reviewer checklist, efficiency rules) and the specifications for WP2.4 to WP4.3. Where that file says `develop`, read `main`; where it says "never push to `main`", read "never push to `main` directly; pull requests only". Everything else in it stands.
8. `scripts/data-hygiene/oux-wp2.1/README.md` — the run-sheet style every later production script follows.
9. `CLAUDE.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/DEV_PROD_ENVIRONMENT.md`.

The plan and appendices under `docs/organiser-ux-review/appendix-*.md` carry `file:line` references for every claim. Pass those references to sub-agents rather than asking them to search.

# Non-negotiable rules (in addition to those in the inherited prompt)

- **Production (`gteygwfgjvczanmrwgbr`) is never read or written by an agent**, through the Supabase connector, the CLI, the SQL Editor, or the app. Every production change is prepared as a file the operator pastes and runs, in the style described under "Operator run sheets".
- **Branches:** `feat/oux-<wp-id>-<slug>` off `main`. Draft pull request into `main`. One commit per completed unit of work, small and descriptive. Never push to `main` directly. Never rebase, amend or force-push a pushed branch; merge `main` into the branch instead. No git worktrees. Never commit `supabase/.temp/*`. Every exact `git` command that pushes or opens a pull request is put to the operator first.
- **Promotion gate, every package with a migration.** A pull request that adds a migration is merged only after the operator has applied that migration to production, because the merge deploys code that expects the schema and regenerates `packages/db-types/generated.ts` from production. Order per package: migration file on the branch → applied to normal dev (operator, or the agent through the connector with the operator's approval for that exact file) → preview, e2e and contract tests green → operator applies the same file to production via the run sheet → operator merges the pull request → any post-merge scripts. This generalises WP2.2's G1 to the whole programme.
- **Dev database mutations** (normal dev only) need the operator's approval per file. Reads of dev are free. The realistic data set may be read; it may be mutated only under an approved run sheet and only while it stays isolated.
- **`groups_v2` is not introduced before WP2.4**, and no code consumes `campaign_group_membership` before WP2.2b is on production.
- **Sync-on-open is a writer.** Any inventory of code that writes to `campaign_organising_units` or `campaign_worker_ou` includes the sync route and the `WorkforceBoard` mount query. WP2.2 routes it through the structure API like every other writer; WP2.4 decides whether sync-on-open survives.
- **Do not skip, disable or quarantine a test.** Do not widen a package. Do not fold advisories into a package silently; record them in the ledger's incidental findings.
- **Stop and ask the operator** when: a decision the package depends on is open; a migration rehearsal shows unresolved conflicts; a run sheet step returns something its file did not predict; a package needs a third fix round; anything would touch production; a Supabase project's role would change.

# Environment facts

| Project | Ref | Role today | Agent access |
|---|---|---|---|
| Production | `gteygwfgjvczanmrwgbr` | Live app, `main` → Vercel Production. Has WP2.1 with cleanup. PITR enabled. | **Never.** |
| Normal dev | `dpnnmkhabysfdogllsyh` | Backs every Vercel Preview (all non-`main` branches) and the e2e accounts. Thin: 8 units, 111 placements. Has WP2.1. | Read freely; mutate with per-file approval. |
| Realistic data set (`offshore-alliance-wp21-rehearsal`) | `yqjkuobcawvigsfpgrcm` | Production-shaped copy from 12 September with WP2.1 and cleanup applied: 22 campaigns, 2,407 workers, the 161-unit campaign. Retained for the rest of phase 2 as the place to test against realistic data (WP2.5's performance acceptance needs it). Contains real worker contact details and real staff accounts. Not wired to Vercel. | Read freely; mutate only under an approved run sheet. Do not wire it to Vercel, cron, webhooks or messaging credentials without the operator's explicit instruction. |

The operator has parked any fix-up of the dev arrangement for the duration of this development phase. Three projects stay as they are: production, the thin dev behind the previews and e2e accounts, and the realistic data set. Do not propose changing that arrangement. When a package needs realistic data (WP2.5 is the first; WP2.4's drag rules and WP2.6's list view may want it too), the planner says so in the plan, proposes the least invasive way to use the realistic data set for that package (a read-only measurement script, an approved run sheet, or a temporary preview pointed at it with test-only messaging credentials), and the operator approves that use per package.

**End-of-programme task, recorded in the ledger's human tasks now:** when this development process is finished, return to two Supabase projects (production and one dev). The likely shape is scrubbing the realistic data set of contact details and staff accounts and making it the dev project, then pausing and later deleting the thin dev, but that is decided then, not now. Nothing in phase 2, 3 or 4 should make that harder: keep the realistic data set's migration ledger in step with the repo (it is currently one migration behind, `20260913000000_an_survey_reports`; apply it there as part of the next approved run sheet that touches it), and keep every e2e fixture expressible through environment variables so it can be recreated in whichever project becomes dev.

Local `apps/organising-db/.env.local` points at production; agents must not run `pnpm dev` or `pnpm start`. Verify on Vercel previews. The Supabase CLI link target in `supabase/.temp/` is tracked in git and may point at production; never run a `supabase` command without first printing `supabase/.temp/project-ref` and confirming it is dev or the clone.

# The team

Spawn a fresh sub-agent per role per package. Give each the work-package specification verbatim, the plan file, and the appendix pointers it names, and nothing it does not need. The same agent instance never both implements and reviews.

| Role | Claude Code model | API model | Effort | Use for |
|---|---|---|---|---|
| Orchestrator (you) | fable | claude-fable-5-1 | xhigh | Holding the plan, sequencing, approving plans, deciding stop conditions, writing the ledger, preparing operator run sheets |
| Planner | opus; **fable** for WP2.2, WP2.4, WP2.8, WP3.6 | claude-opus-5 / claude-fable-5-1 | xhigh | Turning a work package into a file-level plan with `path:line` citations |
| Implementer, high-risk | fable | claude-fable-5-1 | max | Migrations, RPCs, RLS, transactional writers, the Recompute fix, anything that writes to the two structure tables, WP3.6 |
| Implementer, standard | opus | claude-opus-5 | xhigh | Pages, components, hooks, navigation, copy, tests, guides manifest |
| Verifier | sonnet | claude-sonnet-5 | high | Running lint, tests, build, e2e, contract tests, migration dry-runs and verification queries; pasting raw output; no interpretation |
| Reviewer | **fable** for anything touching the database, RLS, migrations, worker data or the structure API; otherwise opus | claude-fable-5-1 / claude-opus-5 | xhigh | Adversarial review against the acceptance criteria and the rules; a fresh agent every time; two fix rounds maximum |
| Inventory and log summariser | haiku | claude-haiku-4-5 | low | Mechanical greps, file inventories, summarising long test or SQL output; never designs or writes code |

Guidance on using these models:

- Give Fable and Opus the whole task up front and let them choose the method. Do not pre-script steps for them; do pre-script the acceptance evidence you want back.
- Run Fable implementers at `max` only for the packages listed; `xhigh` is the right default for everything else agentic. Do not drop the reviewer below `xhigh` or below the model shown to save cost.
- Sonnet verifiers report; they do not diagnose. A red result goes to an Opus diagnosis agent, then back to the implementer.
- Haiku never touches product code or plans.
- Each sub-agent gets the same specification text across calls so cached context is reused.

# Operator run sheets (how every production or dev mutation is handed over)

This is what worked on 14 September. Follow it exactly.

- One file per SQL Editor submission, prepared by the agent from the committed script: the production guard line `SET LOCAL oux.env = 'production';` already inserted after every `BEGIN;`, and a read-only verification `SELECT` appended after the final `COMMIT;` so the editor, which shows only the last result set, displays something useful.
- Files are handed over one step at a time. Each step states what it changes, what the operator should expect to see, and exactly what to paste back. The next file is not sent until the previous result is in hand and matches. No speculation about later steps.
- Run without RLS, as the `postgres` role. Never through the connector's `apply_migration` on production.
- After every mutating step, a read-only check of the invariants the step promised, before the next step.
- Before-and-after evidence compares hazard counts and checksums, not row totals: totals drift whenever a writer opens a campaign.
- The dev copy of the same sequence may be applied by the agent through the connector, one file at a time, with the operator's approval per file, using the migration's version as its name so the ledger matches the CLI.
- Every run is recorded in the package's plan file with the pasted outputs, and summarised in the ledger row, before the pull request is marked ready.

# Step 0: move WP2.2 onto `main` and record the parking of `develop`

Do this before any implementation. Each `git` command below is put to the operator before it runs.

1. `git fetch origin`. Confirm `main` is at or after `f5529a4a` and that `origin/develop` is at `68400084`.
2. Check out `feat/oux-wp2.2-structure-api` from origin. Merge `origin/main` into it with `--no-ff` (the branch carries docs only, so no conflicts are expected; if any appear, stop and report). Push.
3. Retarget draft PR #41 to base `main`. Confirm it shows only the three docs commits plus the merge.
4. Make one docs commit on that branch, "Revision 4" of `wp/wp2.2.md`, that: replaces every `develop` reference in `wp/wp2.2.md` §0, §6.3 and §6.4 with the `main`-based sequence (2.2a to production → merge the pull request → `10_materialise…` and `20_relabel…` → `00_preflight` → `03b` if needed → 2.2b → `04_postflight`); adds the sync-on-open route to the §2.3 writer inventory and §3.11 switch table; updates `PROGRESS.md` standing notes and `CURRENT_STATUS_AND_NEXT_STEPS.md` to say that `develop` is parked at `68400084` and `main` is the integration branch; and adds the end-of-programme "return to two Supabase projects" row to the ledger's human tasks with the environment facts above. Save this prompt verbatim as `docs/organiser-ux-review/PHASE2_MAIN_ORCHESTRATION_PROMPT.md` in the same commit.
5. Post the ledger state to the operator and wait for a go before Stage 1.

# WP2.2, as it now runs

Follow `wp/wp2.2.md` §6.1 stages with these adjustments:

- **Stage 1** (migrations 2.2a and 2.2b, rollbacks, scripts `10` and `20`, the typed wrapper, unit tests, the guard test that initially fails naming the 21 direct writers plus the sync route) needs no database. Start it immediately after Step 0.
- **Stage 2**: 2.2a to normal dev through the connector with per-file approval, or by the operator's CLI. The optional clone pass (§0 step 5) is at the operator's discretion; recommend it, since these files have never run anywhere, and prepare it as a run sheet.
- **Stages 3 to 6** as planned: contract suite on dev; writer switch in three commits (wall chart; settings, wizard and hooks; lib and API routes including the sync route and `loadOuTargets` paging and the Recompute fix); e2e on the branch preview.
- **Stage 7**: verifier output, fresh Fable review, ledger.
- **Promotion**: prepare the production run sheet for 2.2a; the operator applies it; the operator merges PR #41; then the operator runs `10`, `20` (R1-b), `00`, `03b` if H9 > 0, 2.2b, `04`, each as a handed-over file. Only after 2.2b is on production may WP2.4 begin.

# Phase 2 order after WP2.2

WP2.4 → WP2.5, WP2.6, WP2.7 in parallel where files are disjoint (WP2.7 needs only WP2.2) → WP2.8 → WP2.9. WP3.3 and WP3.5 may be planned at any time and started when an implementer is free; they touch none of the structure tables. Specifications are in the inherited prompt under "Phase 2" and "Phase 3". Each package follows the seven-step protocol from that prompt: plan, approve, implement, verify, review, pull request, ledger.

# Reporting

After each work package, post to the operator in the session: the ledger row, the verification evidence in one paragraph, the reviewer's verdict, the run sheet the operator now needs to execute if any, and the next package you intend to start. At every phase exit, post the exit criteria with evidence and wait. When you hand over a run sheet, hand it over one step at a time as described above.

Begin with Step 0.
```
