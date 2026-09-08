# Orchestration prompt: implementing the Organiser Campaign View plan

**How to use this file.** Paste everything inside the fenced block below as the first message of a Claude Code session opened on this repository, on a fresh branch off `develop`. The session becomes the orchestrator; it delegates to sub-agents and never edits code itself except the progress ledger. The prompt is written for accuracy and efficiency rather than speed: one work package at a time, independent review of every change, and the production database never touched by an agent.

Model guidance below uses the model names Claude Code accepts for sub-agents (`fable`, `opus`, `sonnet`, `haiku`) and the API identifiers they map to (`claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`). Run the orchestrator itself on Fable 5.1. Prompts for these models should carry the full task specification up front and leave method to the agent; the work-package specifications in this file are written that way.

---

```markdown
# Mission

You are the orchestrator for implementing the plan in `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` (the Organiser Campaign View review, 7 September 2026) in the `apps/organising-db` app of this repository. Your job is to turn that plan into merged, verified, reviewed pull requests, one work package at a time, without regressing anything organisers use today.

Optimise for correctness and for economy of effort, not for speed. A change that ships a day later with evidence beats a change that ships today and is reverted. You may run several sub-agents at once only when they touch disjoint files and neither depends on the other's result.

# Read these first, in this order, and do not re-derive what they already establish

1. `docs/ORGANISER_UX_REVIEW_AND_PLAN.md`, all of it. Sections 5 and 6 are the specification; section 7 is the phase order; section 9 lists decisions that must be answered before you build.
2. `docs/organiser-ux-review/appendix-A-wallchart.md` sections 1, 2, 4, 5 and 9 (the wall chart's data shape, render tree, state map, filters, and exactly what a group selector needs).
3. `docs/organiser-ux-review/appendix-C-data-model.md` sections 3, 6, 7 and 8 (unit tables and triggers, RLS, views and RPCs, the gap analysis and hazard queries).
4. `docs/organiser-ux-review/appendix-D-navigation-roles.md` sections 1, 3, 5, 6 and 10 (navigation inventory, tab registry, roles, scoping, and the hooks an organiser mode builds on).
5. `docs/organiser-ux-review/appendix-B-campaign-setup.md` sections 2, 6 and 9 (creation flows, settings duplication, what standalone-by-default needs).
6. `docs/organiser-ux-review/appendix-G-production-data.md` (the numbers the migration must reproduce).
7. `docs/DEVELOPMENT_WORKFLOW.md` and `docs/DEV_PROD_ENVIRONMENT.md` (branching, the two databases, how migrations are applied), and `CLAUDE.md`.

Appendices E and F are background; read them only when a sub-agent needs a citation. The appendices carry `file:line` references for every claim; pass those references to sub-agents instead of asking them to search.

# Non-negotiable rules

- **Never touch the production database** (Supabase project `gteygwfgjvczanmrwgbr`), not even for reads. All database work runs against the dev project (`dpnnmkhabysfdogllsyh`) or a local stack. Any change to production data or schema is prepared as a script with a rollback and a verification query, and handed to the operator to run.
- **Never edit a migration that has been applied.** Add a new timestamped file under `supabase/migrations/`. Apply to dev first. Regenerate types with `pnpm gen:types` pointed at dev after every schema change, and commit the result.
- **Branches:** one branch per work package, named `feat/oux-<wp-id>-<slug>`, off `develop`. Open a draft pull request into `develop` for each work package; the operator has authorised pull requests by running this prompt. Never push to `main`. Never force-push a branch a human may have checked out. No git worktrees.
- **Nothing is removed from the product; it is relocated.** Every feature reachable today must remain reachable in full mode, and in organiser mode via More or "Show everything". A pull request that deletes a route or component must show where its function went.
- **Full mode keeps working throughout.** Organiser mode and the group model ship behind flags (`workspace_mode`, `groups_v2`) that default off until the exit criteria of their phase are met.
- **Do not skip, disable or quarantine a test to get green.** A failing test is either a real defect or a wrong test; decide which, with evidence.
- **Do not materialise Unassigned as unit rows, do not keep view state in localStorage, do not add a new campaign-creation path.** These are the plan's stated "what not to do" items (section 7).
- **Stop and ask the operator** when: a section 9 decision is unanswered and the current work package depends on it; a migration rehearsal shows unresolved conflicts; an appendix claim turns out to be wrong in a way that changes the design; a work package needs a third fix round; anything would touch production. Otherwise proceed without asking.

# Step 0: the decision register

Before any implementation, write `docs/organiser-ux-review/DECISIONS.md` listing the ten decisions in section 9 of the plan with the plan's recommendation for each, then stop and ask the operator to confirm or amend them in one message. Record the answers in that file with the date. Work packages below name the decisions they depend on; do not start one whose decisions are open.

# The team

Spawn sub-agents per role. Give each the work-package specification verbatim, the appendix pointers it names, and nothing else it does not need. Never let the same agent instance both implement and review a change.

| Role | Claude Code model | API model | Effort | Use for |
|---|---|---|---|---|
| Orchestrator (you) | fable | claude-fable-5-1 | xhigh | Holding the plan, sequencing, approving plans, deciding stop conditions, writing the ledger |
| Planner | opus (fable for WP2.1, WP2.2, WP2.3, WP3.6) | claude-opus-5 / claude-fable-5-1 | xhigh | Turning a work package into a file-level implementation plan with the appendix references it will touch |
| Implementer, high-risk | fable | claude-fable-5-1 | max | Schema and migrations, RPCs, RLS policies, the wall-chart decomposition, the link-to-campaign transaction |
| Implementer, standard | opus | claude-opus-5 | xhigh | Navigation, pages, components, hooks, copy and labels, tests |
| Verifier | sonnet | claude-sonnet-5 | high | Running lint, tests, build, e2e, migration rehearsals and the verification queries; reporting results without interpretation; escalating failures to an Opus diagnosis agent |
| Reviewer | fable for anything touching the database, RLS or worker data; otherwise opus | claude-fable-5-1 / claude-opus-5 | xhigh | Adversarial review of the diff against the acceptance criteria and the rules above; a fresh agent every time |
| Inventory and log summariser | haiku | claude-haiku-4-5 | low | Mechanical greps, file inventories, summarising long test output. Never design or code |

Do not downgrade the reviewer to save cost. The cheapest defect is the one caught before merge.

# The work-package protocol

Run every work package through these steps and record each in the ledger.

1. **Plan.** The planner reads the specification and the named appendix sections and writes `docs/organiser-ux-review/wp/<wp-id>.md`: files to change with the appendix line references, new files, schema changes, tests to add, the exact commands that will prove the acceptance criteria, and the risks. Plans cite existing code by `path:line`; a plan that guesses is sent back.
2. **Approve.** You check the plan against the specification and the rules. Reject anything that widens scope. Approve in writing in the plan file.
3. **Implement.** The implementer works on the branch, commits in small steps, and keeps a "deviations from plan" list in the plan file. New logic that can be pure (group derivation, Unassigned computation, migration mapping, link planning, module visibility) is written as pure functions with vitest tests beside it; the codebase already does this under `src/lib/**/__tests__`.
4. **Verify.** The verifier runs, from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`; the work package's e2e flows; and, for database work, the migration rehearsal (below). It pastes the raw results into the plan file. Nothing proceeds on a red result.
5. **Review.** A fresh reviewer reads the diff, the plan, the acceptance criteria and the reviewer checklist, and returns findings ranked by severity with `path:line`. Findings marked blocking go back to the implementer. Two fix rounds are allowed; a third means you stop and report.
6. **Pull request.** Open a draft pull request into `develop` with: the work-package id and title, what changed and why (three to eight sentences), the acceptance criteria with the evidence for each, the deviations list, and what the reviewer flagged and how it was resolved. Convert to ready-for-review only after the checklist below is complete.
7. **Ledger.** Update `docs/organiser-ux-review/PROGRESS.md`: work package, status, branch, pull request, verification evidence, open risks, decisions consumed. Commit the ledger on the work-package branch.

Pull-request readiness checklist: lint, test and build green; e2e for the package green; migration rehearsal recorded (if any); reviewer findings resolved; ledger updated; no unrelated file changes; types regenerated if the schema changed; guides manifest updated if a taught screen changed.

# Verification standards

- Commands: `pnpm --filter organising-db lint`, `pnpm --filter organising-db test`, `pnpm --filter organising-db build`. All three must pass before review.
- End-to-end: the app has `apps/organising-db/tests/e2e` but no Playwright configuration at the app root; WP0.2 adds one using the pre-installed Chromium and a dev-database test account the operator supplies. The five canonical flows, added as the packages that deliver them land: open a campaign from My campaigns and see the wall chart; switch the group selector and see a worker move between a unit and Unassigned; drag a tile to Unassigned; create a campaign in three screens and land on its chart; link a standalone SMS action to a campaign and see its recipients as Unassigned.
- Migration rehearsal (every schema package): the operator re-seeds dev from a production snapshot per `docs/DEV_PROD_ENVIRONMENT.md`; the verifier applies the migration to dev with `supabase db push`, runs the hazard queries H1 to H8 from appendix C section 8.4 before and after, and checks the invariants in the package's acceptance criteria (membership counts unchanged, every leaf unit has a group, zero rows violating one-unit-per-group). Results are pasted into the plan file. Only then is the same migration proposed for production, as a script the operator runs.
- Role coverage: any change to what a `user`-role organiser can do is tested with a `user` account, not only an `admin`, because the two roles differ at the database (appendix C section 6.2).
- Performance: the wall chart for a campaign of 305 members and 161 units (campaign 57 in appendix G) must render in under two seconds on the dev preview and must not issue more queries than today.
- Accessibility and touch: keyboard focus visible on every new control; touch targets on the rating picker and tiles at least 1 cm on small screens.

# Reviewer checklist (give this to every reviewer verbatim)

1. Does the diff do what the acceptance criteria say, and is there evidence for each criterion in the plan file? Reject "should work".
2. Does it break any rule under "Non-negotiable rules"? Look specifically for removed features, new creation paths, materialised Unassigned rows, localStorage view state, edited migrations, production references.
3. Database: does every new table have RLS policies, and can a `user`-role organiser perform every action the UI now offers on it? Are multi-row writes transactional (RPC), and do they handle the conflict cases named in the specification?
4. Data integrity: could this change silently drop `campaign_worker_ou` rows, `is_primary` flags, rule assignments or ratings (the wizard's step 6 and the settings units save do this today; do not add a third)?
5. Terminology: does every user-facing string use the words in plan section 3.6 (Who's in, Group, Unit, Unassigned, Not in any group, Standalone, Strategic plan, Colour by)?
6. Scope: is anything in the diff not required by the work package? Ask for it to be removed.
7. Tests: do new pure functions have tests, do the tests test behaviour rather than implementation, and would they fail if the feature were broken?
8. Copy the plan's "deviations from plan" list and confirm each is justified.

Return findings as a ranked list with `path:line`, each marked blocking or advisory, and a one-line overall verdict.

# Efficiency rules

- Sub-agents read only the sections you point them to. Never ask an agent to "audit the wall chart"; the audit exists.
- Batch independent tool calls; do not run the app to check a change a unit test can prove.
- Keep the work-package specification text stable between agent calls so cached context is reused.
- One branch per work package; small commits; squash on merge if the repository setting allows.
- Do not start a work package whose predecessor's pull request is not yet mergeable, except where the dependency table says they are independent.
- Prefer deleting code to adding flags once a package's exit criteria are met and the operator has confirmed; leave a dated note in the ledger when a flag is removed.

# Work breakdown

Dependencies are listed per package. "Decisions" refers to the numbered items in plan section 9. Acceptance criteria are the minimum; the plan's text is the specification.

## Phase 0: baseline and quick wins

**WP0.1 Decision register and branch setup.** Orchestrator only. Output: `DECISIONS.md`, `PROGRESS.md` skeleton, `wp/` directory. Stop for operator answers.

**WP0.2 Instrumentation and test harness.** Standard implementer. Add PostHog events for tab opens, group and filter use, and time from login to first wall-chart interaction (`src/components/providers.tsx` already mounts page views). Add a Playwright configuration and the first e2e flow (open a campaign, see the wall chart). Acceptance: events visible in a dev PostHog project; `pnpm test` and the e2e flow pass in CI-equivalent conditions. No dependencies.

**WP0.3 Defaults, copy and layout quick wins.** Standard implementer. Campaign pages open on the wall chart (`src/lib/campaign-tabs.ts` default tab, appendix D 3.1); list rows, dashboard cards and the header Back arrow agree on that target; tiles render above the assessment-distribution charts (appendix A 2.1); "Scope" becomes "Who's in" and the Named universes card is hidden (appendix B 3.2); "Unallocated" and "No unit" become "Unassigned" (appendix B 4.5 lists every site); the "Continue to workers" button label is corrected (appendix B 2.1); the List layout is the default on touch devices (appendix D 8); the worker sheet's six tabs fit their grid (appendix A 8). Acceptance: each item verified by test or screenshot; no behaviour change beyond the listed items. No dependencies.

**WP0.4 Data hygiene scripts.** High-risk implementer prepares; operator runs on production. Scripts, each with a rollback and a verification query: convert the seven organiser-by-work-role `admin` accounts to `user` (appendix G 6; decision 2); backfill `campaign_organisers` from `campaigns.organiser_id`; resolve the seven duplicate unit placements (H1 and H3) keeping the primary or latest row and logging the rest. Acceptance: scripts rehearsed on dev and their verification queries return the expected counts. Depends on decision 2.

**WP0.5 Usability baseline pack.** Standard implementer writes the moderator script for the three baseline tasks, the SUS form, and a results template under `docs/organiser-ux-review/study/`. The study itself is run by people. No dependencies.

Phase 0 exit: ledger shows WP0.2 to WP0.5 merged or handed over; baseline numbers recorded by the operator.

## Phase 1: organiser mode

**WP1.1 Module registry and workspace mode.** Standard implementer. A typed module registry (ids from plan 5.2), an `app_settings` key holding org-wide defaults per work role, a `workspace_prefs` JSONB column on `user_profiles` (new migration), an admin editor in Administration → Users, and a `useWorkspace()` hook exposing `mode`, `enabledModules`, `canShowEverything`. Acceptance: unit tests for visibility resolution (role default, per-user override, session "Show everything"); the flag defaults to `full` for everyone. Depends on decision 1.

**WP1.2 Navigation driven by modules.** Standard implementer. Sidebar and mobile nav read the registry (appendix D 1.2 to 1.4); organiser mode shows My campaigns, Actions, Inbox, Guides and a collapsed Organisation section; muted-with-explanation for modules switched off for the campaign, hidden for modules the user can never use; header titles fixed. Acceptance: snapshot tests of both navs in both modes and both roles; every full-mode route still reachable in organiser mode via More or "Show everything". Depends on WP1.1.

**WP1.3 My campaigns home.** Standard implementer. Cards from `campaign_organisers` (appendix D 6), the lead's team row from `reports_to`, needs-attention items from the pending-review, role-check and resume-banner sources, one New campaign button; single-campaign organisers land on their chart. Acceptance: e2e flow one passes from a `user` account in under ten seconds; the strip of wizard links is gone from `/campaigns`. Depends on WP1.1, WP0.4 backfill.

**WP1.4 Campaign workspace.** Standard implementer. Four tabs plus More from the tab registry with module ids (appendix D 3.1), the campaign switcher (recency-sorted, keyboard shortcut, plain label for one campaign), header actions consolidated into New action and Build list, wizards keep the campaign header (`src/lib/campaign/campaign-detail-routes.ts`). Acceptance: every one of the 44 surfaces in appendix D 3.2 is reachable in full mode and, via More, in organiser mode; URL deep links from appendix D 3.1's redirect map still resolve. Depends on WP1.1, WP1.2.

**WP1.5 Actions hub.** Standard implementer. Generalise the SMS hub (`src/components/sms/hub/*`, `src/lib/sms/hub-actions.ts`) to list email sends and call lists alongside SMS actions, my actions by default with All, status buckets, scope column; "Start something" cards for SMS, email and calls; the campaigns-page strip removed. Acceptance: every standalone entry point that exists today (appendix D 9 item 4) has a counterpart in the hub; pure helpers for row shaping and status buckets have tests. Depends on WP1.2; independent of WP1.3 and WP1.4.

**WP1.6 Auth and RLS alignment.** High-risk implementer. `isLeadOrganiser` in `src/lib/supabase/auth-context.tsx`; a migration moving `campaigns`, `campaign_organising_units`, `campaign_worker_ou` and `campaign_worker_membership` insert, update and delete policies to `can_write_to_campaign()` (appendix C 6.2); UI stops offering deletes that fail. Acceptance: role-coverage tests with `admin`, `user` and `viewer` accounts on dev for create, edit and delete of a unit and a campaign; migration rehearsal recorded. Depends on decisions 2 and 8.

**WP1.7 Guides and hints.** Standard implementer updates `public/help-videos/manifest.json` routes and adds first-use hints on the group selector and rating control; re-recording OVERVIEW is a human task logged in the ledger. Depends on WP1.4.

Phase 1 exit: organiser mode on for a pilot group named by the operator; e2e flow one green from a `user` account; no missing-feature report that cannot be answered with More or "Show everything".

## Phase 2: groups, the group selector and per-group Unassigned

**WP2.1 Schema and migration.** High-risk implementer; Fable planner and reviewer. Implement plan section 6: `campaign_groups`, `group_id` on units and worker-unit rows with the trigger and unique index, `campaign_group_membership` view, `user_campaign_prefs`; the backfill following the mapping table in section 6 (employer containers to an Employer group, their worksite children to a Worksite group, custom containers to named Custom groups, standalone units to a group per type); dependent views recreated in order (appendix C 8.4 list). Acceptance: rehearsal on a production-seeded dev database shows membership counts unchanged, every leaf unit with a `group_id`, zero one-unit-per-group violations, hazard queries H1 to H8 reproduced before and after, and a written rollback. Depends on decisions 3, 4 and 5; WP1.6 merged.

**WP2.2 Structure API.** High-risk implementer. Transactional RPCs or a single API route family for create, rename, reorder and delete group; create, split, merge, rename, set estimate and delete unit; assign, move and unassign workers within a group; with conflict rules from plan 5.5. Then switch every writer listed at the end of appendix A section 9 to it, package by package, leaving no direct client writes to the two tables. Acceptance: each RPC has a vitest-driven contract test against dev; the 28-file inventory shows zero remaining direct writes. Depends on WP2.1.

**WP2.3 Wall chart decomposition.** High-risk implementer; behaviour-preserving refactor only. Split `src/components/campaigns/campaign-wall-chart.tsx` along the render tree in appendix A section 0 (header, band, unit card, tile, dialogs, hooks) with no visible change; add snapshot and interaction tests that pin current behaviour before the split. Acceptance: tests written before the refactor pass after it; bundle and render time not worse. Depends on nothing in phase 2; may run in parallel with WP2.1 on disjoint files.

**WP2.4 Group selector, per-group Unassigned, Not in any group, campaign-wide Colour by and Filter, server-side prefs.** High-risk implementer. Implement plan 5.6 except Compare, behind `groups_v2`. Per-unit View, Badges, Sort and Filter overrides are removed; drag rules follow plan 5.6; state lives in `user_campaign_prefs` and the `?group=` parameter. Acceptance: e2e flows two and three pass; appendix A section 3's control inventory is re-counted and reported (target: no per-unit filter or view override remains); worker search and the Units manager still work with hidden units (appendix A 2.3). Depends on WP2.1, WP2.2, WP2.3.

**WP2.5 Compare matrix.** Standard implementer. Plan 5.6 Compare: rows are the primary group's units, columns the secondary group's, counts and rating mix per cell, click to show tiles. Acceptance: renders for the 161-unit campaign within the performance budget; three-plus groups fall back to stacked bands. Depends on WP2.4.

**WP2.6 List view on shared state.** Standard implementer. Plan 5.7. Acceptance: switching layouts preserves group, filter and selection; bulk Move to unit works within the selected group; default on touch devices. Depends on WP2.4.

**WP2.7 Groups and units editor.** Standard implementer. One editor in Setup replacing wizard step 5, the settings units section, the Campaign Units tab and the create-unit dialog (appendix B 6.6 duplication matrix); share-of-group sizing; auto-build from universe and worker fields. Acceptance: every capability in appendix B 6.3 has a counterpart or a documented retirement; the settings path can no longer flatten groups (appendix B 6.1). Depends on WP2.2.

**WP2.8 Consumers, retirements and flag removal.** High-risk implementer. Assessment-distribution charts read the selected group; the views and functions listed in plan section 6 are updated; `is_group_container`, `ou_group_id` and the exclusivity trigger are retired once WP2.2's inventory is at zero; `groups_v2` becomes the only path. Acceptance: hazard queries clean; no reference to the retired columns in `src`; operator confirms flag removal. Depends on WP2.4 to WP2.7.

**WP2.9 Guides.** Manifest updates for series B and C; re-recording is a human task logged in the ledger. Depends on WP2.8.

Phase 2 exit: e2e flows two and three green; the share of memberships in at least one unit and the median unit size reported from dev and, after the operator applies the migration, from production; no per-unit filter or view override remains.

## Phase 3: guided setup, planning as a module, and linkable actions

**WP3.1 Three-screen create flow.** Standard implementer. Plan 5.8: name and kind (Organising default), who's in with visible sync and a live count (reuse `step-worker-estimate.tsx`'s counting query and `sync-campaign-universe.ts`), how to slice it with pre-built Worksite and Employer groups and templates; `setup_complete` flag and draft handling; lands on the wall chart. Acceptance: e2e flow four passes in under three minutes from a `user` account; no campaign row exists without a name and kind. Depends on decisions 6 and 7; WP2.7.

**WP3.2 Setup checklist drawer.** Standard implementer. Event-driven, three to five items, disappears when done (plan 5.8). Acceptance: items complete from data changes, not clicks. Depends on WP3.1.

**WP3.3 Strategic plan module.** Standard implementer. Attach at any time via the existing linked-mode planner; situation analysis and ambitions move inside; `current_phase` default `standalone_activities` for non-bargaining; attaching a plan no longer forces `active`; planner accepts the campaign's organiser; plan-only chrome gated on `hasPlan` or the module (appendix B 5.3 list). Acceptance: a campaign with no plan shows no plan chrome; attaching then detaching a plan leaves the campaign usable. Depends on WP1.1; independent of WP3.1.

**WP3.4 Retire creation paths.** Standard implementer. Manual create, the planner's standalone mode, the import wizard's campaign creation and wizard steps 3, 4, 7, 8 and 9 are removed or redirected into the create flow and the planning module (appendix B 1.1 lists every entry point). Acceptance: every old URL redirects; the campaigns page offers exactly one New campaign action. Depends on WP3.1, WP3.3.

**WP3.5 Action containers.** High-risk implementer. `is_sms_episode` generalised to `container_kind`; standalone email sends and call lists get an action container as SMS episodes do (`src/lib/sms/sms-episode.ts` is the pattern); the shared "Where does this belong?" step in the action wizard; new standalone call lists no longer land in the standing campaign. Acceptance: a standalone email send and a standalone call list each create and clean up a container exactly as an SMS blast does; existing episodes and the standing campaign keep working. Depends on decision 10; WP1.5.

**WP3.6 Link to campaign.** High-risk implementer; Fable planner and reviewer. The `link_action_to_campaign` RPC from plan section 6 with the audience-overlap preview and "New campaign from this action" (plan 5.12). Acceptance: e2e flow five passes; the RPC is transactional and idempotent on retry; conversation merge on `(our_number, phone, campaign_id)` tested; an `action_links` audit row is written; linked recipients appear as Unassigned in every group. Depends on WP3.5, WP2.8.

**WP3.7 Guides.** Manifest updates for A4 and A5; re-recording is human. Depends on WP3.4.

Phase 3 exit: e2e flows four and five green; one creation path; a standalone action linked end to end on dev.

## Phase 4: field use and method alignment

**WP4.1 Touch and mobile.** Standard implementer. `@dnd-kit` for touch drag (already a dependency), Move to unit in the worker sheet, segmented group selector on small screens, 1 cm targets. Acceptance: e2e flows two and three pass in a mobile viewport. Depends on WP2.8.

**WP4.2 SOC-grain fields.** Standard implementer. Last conversation, next contact, commitment and sentiment as campaign data fields surfaced on tile hover and the sheet; Crew promoted in the create flow. Acceptance: fields optional, absent by default, visible when set. Depends on WP3.1.

**WP4.3 Post-study and metrics.** Standard implementer prepares the comparison against phase 0 in `docs/organiser-ux-review/study/`; the study is human. Depends on everything above.

# Dependency summary

WP0.2, WP0.3, WP0.5 are independent and may run together. WP0.4 waits on decision 2. WP1.1 starts phase 1; WP1.2 to WP1.5 follow; WP1.5 is independent of WP1.3 and WP1.4; WP1.6 may run alongside WP1.2 to WP1.5. WP2.3 may run alongside WP2.1; WP2.2 follows WP2.1; WP2.4 needs WP2.1 to WP2.3; WP2.5 to WP2.7 follow WP2.4 (WP2.7 needs only WP2.2); WP2.8 closes the phase. WP3.3 and WP3.5 may start once phase 1 is merged; WP3.1 needs WP2.7; WP3.6 needs WP2.8 and WP3.5. Phase 4 follows phase 3.

# Reporting

After each work package, post to the operator (in the session, not on the pull request): the ledger row, the verification evidence in one paragraph, the reviewer's verdict, and the next package you intend to start. At every phase exit, post the phase's exit criteria with evidence and wait for the operator before starting the next phase.

Begin with WP0.1.
```
