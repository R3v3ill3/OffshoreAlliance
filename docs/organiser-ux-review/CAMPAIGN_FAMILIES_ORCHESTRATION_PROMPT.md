# Orchestration prompt: campaign families (spin-off a unit, share assessments)

**How to use this file.** Open a new Claude Code session on this repository with `main` checked out and paste everything inside the fenced block below as the first message. The session becomes the orchestrator for the two packages this file specifies (WP3.8 and WP3.9) and the operator tasks around them. It follows the phase-2 protocol (`PHASE2_MAIN_ORCHESTRATION_PROMPT.md`), delegates to sub-agents, never edits code itself except ledger and plan files, and never touches the production database.

**Why this file exists.** `PROGRESS.md` ("Programme backlog", 2026-09-17) records the operator's ask from campaign 64: a sector campaign has one unit per company; when a company moves into bargaining it needs its own structure (vessels as a group, shifts under each vessel) and its workers need both sector-wide and employer-specific assessments. The ledger says: *to be planned by a fresh agent with its own package, after the current phase-2 packages land; do not fold it into WP2.4c, WP2.5, WP2.6 or WP2.7.* This is that agent's prompt. The review behind it (2026-09-17, read-only on the realistic data set and the repo) is summarised inside the prompt so the agent does not re-derive it.

**Model for the orchestrator session:** Claude Fable 5.1 (`claude-fable-5-1`), effort `xhigh`. Same reasoning as the phase-2 prompt: it holds two packages, several operator decisions and a migration gate, and it approves every sub-agent plan. Give it the whole task up front (this file) and leave the method to it.

**Sub-agent models** are in the team table inside the prompt. Claude Code names (`fable`, `opus`, `sonnet`, `haiku`) are what the `Agent` tool's `model` parameter accepts; the API identifiers are `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Fable's thinking is always on and its depth is set with `output_config.effort`; Opus 5 runs adaptive thinking by default. Neither needs pre-scripted steps; both need the acceptance evidence named up front.

---

```markdown
# Mission

You are the orchestrator for **campaign families** in the Organiser UX programme (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`), in the `apps/organising-db` app of this repository. Two packages, delivered in order as merged, verified, reviewed pull requests into `main`:

- **WP3.8 Campaign families and shared assessments** — a one-level parent link between campaigns and an assessment scope that lets a parent campaign's assessment be rated from, and shown in, its child campaigns without duplicating ratings. Schema package.
- **WP3.9 Start a campaign from this unit** — the "spin off" the operator asked for: from a unit in a parent campaign, create the child campaign with its universe, organisers, parent link, pre-built groups and the shared assessments chosen, then land on its wall chart. UI package on top of WP3.8, WP2.7 and WP3.1.

Plus two things that are not packages: operator tasks that need no code (the Total Marine Technology campaign can be set up by hand today), and documentation amendments (a decision-register entry, plan §5.5 addendum, ledger rows).

Optimise for correctness and economy of effort, not speed. You inherit every rule, role and protocol of `docs/organiser-ux-review/PHASE2_MAIN_ORCHESTRATION_PROMPT.md` and, through it, `IMPLEMENTATION_ORCHESTRATION_PROMPT.md`. Where this prompt is silent, those files decide.

# The situation, as established on 2026-09-17 (do not re-derive; cite these)

**Campaign 64 "ROV sector wide".** `campaign_type = political`, `sector_wide = false`; universe = eight employers and no worksites, so the AND rule (`sync-campaign-universe.ts:129–143`) reduces to "primary employer is one of the eight". One group, Employer, eight employer units with `unit_basis {employer_id}`; Total Marine Technology is unit 653 (`{employer_id: 84}`). On the realistic data set (12 September): 276 members, 7 assessments all owned by campaign 64, 33 placements on the TMT unit. On production (17 September, `PROGRESS.md` WP2.4c row): two vessel units nested under the TMT unit, every sub-unit placement paired with its parent row, Worksite group sub-unit-only and correctly absent from the selector under SG-a.

**The pattern already exists organically.** Campaigns 61 "Fugro" (48 members, 42 shared with 64) and 62 "programmed ROV" (64 members, 61 shared) are bargaining campaigns beside the sector campaign, each with one employer and its worksites as the universe. Fugro built roster panels as flat Custom units ("Fugro Etive – Panel 1a"…) because there was no vessel → panel shape. Cross-campaign membership is supported (`wp/wp2.1.md:320`); cross-campaign *placement* consistency is decision SM, recommended SM-a, delivered as WP2.4b (`wp/wp2.4.md:731–784`), still pending.

**Why the vessel → shift structure cannot live inside the sector campaign.**
- `cou_enforce_hierarchy_invariants` (`20260908050000_baseline_schema.sql:1688–1718`, trigger `:22441`) permits a third level only under a group container. Unit 653 is a plain unit, so employer → vessel → shift is refused there. Vessel → shift fits only when the vessel is a root of a Worksite group, i.e. in a campaign of its own.
- WP2.4c renders at most unit → sub-unit (NE-a) and hides sub-unit-only groups (SG-a); WP2.7 "Build from Who's in" is disabled for campaigns without worksite rows (`wp/wp2.7.md` §3.9). Adding worksites to 64's universe would flip the AND rule and shrink membership, and the new membership refresh (`lib/workers/refresh-campaign-universe-membership.ts:67–79`) refuses OR mode. The sector campaign stays employer-only.
- A vessel unit in a sector campaign keyed only `{worksite_id}` is matched by F1 to any member on that vessel whatever their employer (`sync-campaign-universe.ts:156–162`); both keys `{employer_id, worksite_id}` are the safe basis, and the matcher already ranks a both-key unit above an employer-only one (`:164–186`, `:370–376`).

**Why assessments are the real gap.** `campaign_activities.campaign_id` is NOT NULL (`baseline:8871`); ratings hang off `activity_id` (`:7502`); every reader is per campaign. App readers of `campaign_activities` (17 files, `grep 'from("campaign_activities")' src`): the chart's `assessment-selector.tsx:44–50`, `participation-selector.tsx`, `use-participation-predicate.ts`, `clear-ratings-dialog.tsx`, `worker-detail-sheet.tsx:1300–1304`, `campaign-assessments.tsx:160–163` and `:269–272`, `assessments/create-assessment-dialog.tsx`, `task-lists/create-task-list-dialog.tsx`, `activists/woc-meeting-dialog.tsx`, `activists/structure-tests-panel.tsx`, `import/worker-import-wizard.tsx`, `api/campaigns/[id]/participation-import/apply/route.ts:305–313` (refuses an activity whose `campaign_id` is not the route's), `api/campaigns/[id]/role-check/route.ts`, `api/campaigns/[id]/an-actions/route.ts`, `api/worker-import/apply/route.ts`, `api/call-share/[token]/route.ts`, `lib/sms/survey-runtime.ts`. Database readers: `campaign_worker_rating_summary` (`baseline:10699–10760`, joins ratings to membership on `a.campaign_id = m.campaign_id`), `worker_ambition_rating` (`:7710`, via `activity_ambitions` → plan, stays per plan), `v_worker_escalation_tier`, `vw_sms_assessment_report`, `vw_sms_chat_session_report`, `call_section_funnel`, `v_section_plan_*`, `worksites_view`. RLS: activities insert/update by role only (`:25923`, `:26299`), select `USING (true)` (`:26945`), delete by `can_write_to_campaign(campaign_id)` (`:27518`); ratings insert/update by role only (`:25927`, `:26303`), delete via the activity's campaign (`:27522–27524`). So a rating recorded from a child campaign against the parent's activity is already permitted by RLS; nothing routes it there yet.

**Where the create flow and the card menu are today.** Campaign rows are inserted by `campaign-wizard.tsx:609–613`, `campaigns/new/manual/page.tsx:73–77` and `api/campaign-import/apply/route.ts:108`; WP3.1 replaces the primary path with the three-screen flow (its spec is in the inherited prompt, phase 3). The v2 unit card menu is `wall-chart/v2/unit-card-menu.tsx:14` (`rename | estimate | assign | split | merge | delete`, `:58–71`). Plan §5.12's "New campaign from this action" (WP3.6) is the precedent for a "new campaign from X" dialog; reuse its shape, not its RPC.

# Read these first, in this order

1. `docs/organiser-ux-review/PHASE2_MAIN_ORCHESTRATION_PROMPT.md` — rules, environment facts, team, run sheets. Binding.
2. `docs/organiser-ux-review/PROGRESS.md` — the ledger; the 2026-09-17 backlog entry and the WP2.4c row with the campaign-64 context; the current state of WP2.4b, WP2.5, WP2.6, WP2.7, WP2.8, WP3.1.
3. `docs/organiser-ux-review/DECISIONS.md` — decisions 3, 4, 5 (as amended), 6, 7, 10; the WP2.1/2.2 amendments.
4. `docs/organiser-ux-review/wp/wp2.4.md` §3.15 (SM / WP2.4b) and `wp/wp2.4c.md` §3.2, §3.3, §3.17 — the mirror rule and the nesting model this work must not contradict.
5. `docs/organiser-ux-review/wp/wp2.7.md` §3.3, §3.9, §3.13 and `IMPLEMENTATION_ORCHESTRATION_PROMPT.md` phase 3 (WP3.1, WP3.6) — what WP3.9 composes.
6. `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` §5.5, §5.12, §6 — the model vocabulary and the linking precedent.
7. `apps/organising-db/src/lib/workers/sync-campaign-universe.ts` and `refresh-campaign-universe-membership.ts` — how membership and Employer/Worksite placements are derived; the spin-off relies on them rather than copying rows.
8. `CLAUDE.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/DEV_PROD_ENVIRONMENT.md`.

# Non-negotiable rules (in addition to the inherited ones)

- **One level.** A campaign has at most one parent; a campaign that has children cannot itself have a parent. Enforced in the database, not only the UI.
- **Ratings are never duplicated.** A shared assessment has one `campaign_activities` row (owned by the parent) and one rating row per worker. A child campaign reads and writes that row; it never gets a copy.
- **No cross-campaign unit or placement moves.** WP3.9 rebuilds structure in the child through the existing writers (universe sync, structure API, WP2.7 auto-build). No RPC re-parents `campaign_organising_units` or `campaign_worker_ou` rows across campaigns; no `parent_ou_id` ever points across campaigns (`baseline` comment on `parent_ou_id`: same campaign).
- **No new creation path.** WP3.9 opens WP3.1's create flow with prefilled state. If WP3.1 has not landed when WP3.9 is planned, WP3.9 waits; it does not build a fourth creator.
- **The sector campaign is not restructured.** Nothing in these packages adds worksites to campaign 64's universe, changes its match mode, or moves its nested vessel units.
- **Structure-table files are off limits** while WP2.5, WP2.6, WP2.7 and WP2.4b are in flight: `wall-chart/v2/**` (except the one menu item WP3.9 adds, agreed with the WP2.7 boundary table), `lib/campaign/groups/**`, `lib/workers/sync-campaign-universe.ts`, `structure-api.ts`, anything under `supabase/` those packages own. WP3.8 touches assessment readers, views and RLS only.
- **Production never read or written by an agent.** The realistic data set (`yqjkuobcawvigsfpgrcm`) may be read freely; it holds campaigns 61, 62 and 64 as of 12 September and is the right place to measure WP3.8's view changes. Mutating it (for example to rehearse the migration or create a TMT child) needs an approved run sheet.
- **Stop and ask the operator** on any open decision in §"Decisions", a third fix round, anything touching production, or a finding that contradicts "The situation" above.

# The team

| Role | Claude Code model | API model | Effort | Use for |
|---|---|---|---|---|
| Orchestrator (you) | fable | claude-fable-5-1 | xhigh | Both packages, decisions, run sheets, ledger |
| Planner, WP3.8 | **fable** | claude-fable-5-1 | xhigh | Schema, view and RLS design touching worker ratings; the reader inventory must be complete |
| Planner, WP3.9 | opus | claude-opus-5 | xhigh | Composing the dialog from WP3.1, WP2.7 and the sync; the file-level plan |
| Implementer, WP3.8 | **fable** | claude-fable-5-1 | **max** | Migration, rollback, view rewrites, trigger, reader switch, contract tests |
| Implementer, WP3.9 | opus | claude-opus-5 | xhigh | Dialog, menu item, prefill, tests, e2e spec |
| Verifier | sonnet | claude-sonnet-5 | high | `pnpm --filter organising-db lint / test / build`, contract suite on dev, migration dry-run, read-only measurement queries; raw output only |
| Reviewer | **fable** for both packages | claude-fable-5-1 | xhigh | WP3.8 touches views, RLS and worker ratings; WP3.9 writes membership and placements through the sync. Fresh agent each time; two fix rounds maximum |
| Inventory and log summariser | haiku | claude-haiku-4-5 | low | The reader-inventory grep, view dependency listing, long output summaries; never designs or codes |

Give Fable and Opus the whole specification and the acceptance evidence up front; do not script their steps. Sonnet reports, never diagnoses; a red result goes to an Opus diagnosis agent. Do not drop the reviewer below Fable for these two packages: both change what a rating means across campaigns.

# Decisions the operator answers before planning (labels are unique programme-wide)

| # | Question | Options | Recommendation |
|---|---|---|---|
| **FAM** | How a child knows its parent | **FAM-a** `campaigns.parent_campaign_id` (nullable FK to `campaigns`, `ON DELETE SET NULL`, CHECK not self, trigger refusing a parent that itself has a parent and a child that has children); **FAM-b** a `campaign_links` table (many-to-many, kind column) | **FAM-a** — the scenario is strictly one sector → many employers; a link table is more UI and more edge cases for no present need |
| **ASC** | How an assessment is shared | **ASC-a** `campaign_activities.scope text NOT NULL DEFAULT 'campaign' CHECK (scope IN ('campaign','family'))`: a `family` activity is visible in the owner and in every child; **ASC-b** `campaign_activity_shares(activity_id, campaign_id)` explicit per-child links; **ASC-c** copy the activity per campaign and import ratings twice | **ASC-a** — one flag, one rule ("mine, or my parent's family-scoped"); ASC-b only if the operator needs to share with *some* children; ASC-c rejected (double entry, drift) |
| **RAT** | Where a rating recorded in a child lands | **RAT-a** on the parent's activity row (one row per worker per activity; sector participation counts it automatically); **RAT-b** on a child-local shadow activity rolled up by a view | **RAT-a** — that is what "shared" means; RAT-b duplicates |
| **VIEW** | Membership scoping of shared ratings in a child | **VIEW-a** `campaign_worker_rating_summary` (and every per-campaign rating read) sees a shared activity's ratings only for the viewing campaign's members; the parent sees all; **VIEW-b** the child sees every rating on the shared activity | **VIEW-a** — a child's chart must not show workers who are not in it |
| **SET** | Who may set or clear a parent | **SET-a** a writer of both campaigns (`can_write_to_campaign` on each), from the child's Basics sheet, parent list limited to campaigns with no parent; **SET-b** admins and lead organisers only | **SET-a** — consistent with decision 8 |
| **SPN** | What a spin-off does with the parent unit's sub-units (the vessels under TMT) | **SPN-a** rebuild: the child's Worksite group is auto-built from Who's in / worker records and placements come from the sync; the parent keeps its nested units untouched; **SPN-b** transactional move of the sub-unit rows and their placements into the child (migration-bearing RPC) | **SPN-a** — units are cheap, placements are re-derived, and the parent's sector view keeps its vessels; SPN-b only if the operator reports hand placements or unit ratings on those sub-units that must survive |
| **UNV** | The child's universe | **UNV-a** the source unit's basis only (employer 84 → AND mode with one dimension = all TMT workers), worksites added later by the organiser; **UNV-b** employer plus every worksite where a member currently sits | **UNV-a** — membership stays a strict subset of the parent's unit and the refresh dialog keeps working; UNV-b would drop workers whose primary worksite is not yet on the list |
| **KND** | The child's default kind | **KND-a** Bargaining (decision 6); **KND-b** the parent's kind | **KND-a** |
| **MIR** | Order relative to WP2.4b | **MIR-a** WP2.4b (SM-a) lands before WP3.9 ships so vessel moves in the child mirror into the parent's nested vessels; **MIR-b** WP3.9 first | **MIR-a** — otherwise every spin-off creates the stale-unit case SM was raised for |

Record the answers in `DECISIONS.md` as decision 11 (campaign families: FAM, SET, SPN, UNV, KND, MIR) and decision 12 (shared assessments: ASC, RAT, VIEW), dated, and reference them from both plan files.

# WP3.8 Campaign families and shared assessments

**Specification.** Add the parent link and the assessment scope; make every per-campaign assessment read and write honour "owned by this campaign, or owned by my parent with `scope = 'family'`", with ratings filtered to the viewing campaign's membership; expose both in the UI. Migration `supabase/migrations/<ts>_wp3_8_campaign_families.sql` with rollback `scripts/data-hygiene/oux-wp3.8/90_rollback_wp3_8_campaign_families.sql`, both in the WP2.1/2.2 style (preconditions that refuse a repeated apply, no explicit BEGIN/COMMIT, post-assertions).

Schema (under FAM-a, ASC-a):
- `campaigns.parent_campaign_id integer NULL REFERENCES campaigns(campaign_id) ON DELETE SET NULL`, CHECK `parent_campaign_id <> campaign_id`, index on `parent_campaign_id`, trigger `campaigns_enforce_one_level` (BEFORE INSERT OR UPDATE OF `parent_campaign_id`) refusing a parent that has a parent and a child that has children; a parent may not be `is_sms_episode` or `is_standing`.
- `campaign_activities.scope` as above; COMMENT stating the rule. No change to ratings.
- A helper `campaign_family_activity_ids(p_campaign_id integer) RETURNS SETOF integer` (STABLE, SECURITY INVOKER, `SET search_path`) returning owned activity ids plus the parent's `family` ones, so SQL and PostgREST readers share one definition.
- `campaign_worker_rating_summary` rewritten so `rating_activity` joins on `a.activity_id IN (SELECT campaign_family_activity_ids(m.campaign_id))` and the `last_activity_rating` subquery does the same; membership join unchanged (VIEW-a). `v_worker_escalation_tier` and the SMS/call report views: the planner lists each one with its line range and states per view whether it must change (the rule: any view that answers "this campaign's assessments" changes; a view keyed to a plan or a list does not).
- RLS: activities and ratings policies are already permissive enough for RAT-a (`:25923`, `:25927`); the delete policy on activities stays owner-only (`:27518`). The planner confirms with a `user`-role contract test that a child organiser can rate a parent's family activity and cannot delete it.
- Generated types: `parent_campaign_id` and `scope` appear in `packages/db-types/generated.ts` only after production carries the migration (the regen hazard in `CURRENT_STATUS_AND_NEXT_STEPS.md`); the code must not depend on the generated types for either column until then.

Application:
- One pure module `lib/campaign/families.ts`: `familyActivityFilter(campaignId, parentId)` used by every PostgREST reader (`.or(...)` on `campaign_id` and `scope`), `isFamilyActivity(activity, campaignId)`, `familyLabel(parentName)`; vitest beside it.
- Every reader in the inventory above switches to the helper. `participation-import/apply/route.ts:305–313` accepts a family activity of the parent (ratings then land on the parent's row, RAT-a). `campaign-assessments.tsx` shows a **Shared from <parent>** section: definition read-only (title, type, labels), ratings editable, no delete; a `family` activity in the parent shows a **Shared with N campaigns** badge and a scope toggle. `assessment-selector.tsx` and `participation-selector.tsx` list family assessments with the badge. `worker-detail-sheet.tsx` shows them under the same heading.
- Basics edit sheet (`campaign-basics-edit-sheet.tsx`): **Part of** selector (SET-a), listing campaigns the user can write to that have no parent and are not SMS episodes or standing; clearing it is allowed. The campaign header shows "Part of <parent>" as a link; the parent's Setup shows its children.
- Telemetry: `campaign_parent_set`, `assessment_scope_changed`, `family_assessment_rated` (campaign, parent, activity).

Data, operator-run after the migration is on production: set campaign 64 as the parent of 61 and 62 (and of the TMT child once created), and mark whichever of 64's seven assessments are sector-wide as `family`. Prepared as a run sheet; the agent never decides which assessments are sector-wide.

**Acceptance evidence** (the verifier pastes each into `wp/wp3.8.md` §9.2):
1. Migration applied to normal dev; `validate:migrations`, `lint`, `test`, `build` green; rollback applied and re-applied on the realistic data set under an approved run sheet, with before/after checksums of `campaign_activities`, `campaign_activity_ratings` and the view output for campaigns 61, 62, 64 unchanged where scope is untouched.
2. Contract tests on dev: one-level trigger refuses grandparent and grandchild; family helper returns owned plus parent-family ids and nothing from a sibling; a `user` on the child can insert a rating on the parent's family activity and cannot delete the activity; `campaign_worker_rating_summary` for the child counts a family rating for a member and not for a non-member (VIEW-a).
3. jsdom: Assessments tab renders the Shared section; the chart selector lists a family assessment with the badge; rating from the child's sheet posts against the parent's `activity_id`.
4. Read-only measurement on the realistic data set: for campaign 64 with 61 and 62 as children and one assessment flagged family, the child summaries change only for shared workers, and the parent's counts are unchanged.
5. Operator hand-test on the branch preview (E2 pattern): set a parent, share an assessment, rate a worker from the child, see the rating in the parent's Assessments tab.

**Promotion gate:** the inherited one. Migration on dev → preview green → operator applies to production → operator merges → operator runs the campaign-64 data run sheet.

**Depends on:** nothing in flight (it touches no structure file). May start now, in parallel with WP2.5/2.6/2.7, on `feat/oux-wp3.8-campaign-families` off `main`.

# WP3.9 Start a campaign from this unit

**Specification.** From a unit card in the v2 chart (`unit-card-menu.tsx`: new action `spin_off`, label "Start a campaign from this unit…") and from the WP2.7 editor's unit row, open a dialog that creates the child campaign and lands on its chart. The dialog is WP3.6's "New campaign from this action" shape (plan §5.12) applied to a unit, and it opens WP3.1's three-screen create flow with state prefilled rather than inserting a campaign itself.

Preconditions (menu item disabled with a reason otherwise): the unit has a non-custom basis with `employer_id` and/or `worksite_id`; the current campaign has no parent (one level); the actor can write to the current campaign; no existing child of this campaign already has the same universe basis (if one does, the item reads "Open <child>" and navigates).

Prefill: name "<unit name>" (editable); kind per KND; universe per UNV from the unit's basis; organisers = the actor plus the current campaign's organisers (editable); `parent_campaign_id` = the current campaign (FAM); **Share these assessments** — checklist of the parent's assessments, pre-ticked where `scope = 'family'` already, ticking one sets the scope (ASC-a) when the flow completes; **Build the Worksite group** — on by default, runs WP2.7's Build from Who's in after the sync; the vessels become roots of the child's Worksite group and shifts are added later with WP2.7's Nest under (SPN-a). Membership and Employer/Worksite placements come from `syncCampaignUniverseFromEmployersWorksites`; nothing is copied.

Completion: the flow's last screen lands on the child's wall chart with WP2.4's sync notice ("N workers added, M placed…"). The parent's unit card gains a footer link "Organised in <child> →". A `campaign_spun_off` telemetry event (parent, child, unit, members). Idempotent on retry: a second run for the same unit opens the existing child.

Out of scope, recorded so it is not folded in: moving sub-unit rows (SPN-b); a "merge back" or un-spin; spinning off a sub-unit; multi-level families; touch drag (WP4.1).

**Acceptance evidence:**
1. `lint`, `test`, `build` green; jsdom tests for the menu preconditions (custom unit disabled; campaign with a parent disabled; existing child → Open) and for the dialog's prefill from a both-key unit basis.
2. Contract test on dev: a spin-off from a fixture parent produces a child with `parent_campaign_id` set, `campaign_employers` = the unit's employer, membership = the parent unit's members with that employer, Worksite units built and universe placements present, chosen assessments `family`.
3. e2e (Playwright, written and type-checked; run per the D80/D81 rule of `wp/wp2.2.md`): flow "spin off a unit": open the parent chart, Start a campaign from this unit, complete the create flow, land on the child's chart with a Worksite group and a shared assessment in the selector.
4. Operator hand-test on the preview with the campaign-64 shape recreated on dev (an employer unit with two nested vessel units).

**Depends on:** WP3.8 (on production), WP2.7 (auto-build, Nest under, the editor's unit row), WP3.1 (the create flow), and, per MIR-a, WP2.4b. Branch `feat/oux-wp3.9-spin-off-unit` off `main`. No migration expected; if the planner finds one is needed (for example an idempotency key on `campaigns` such as `spun_off_from_ou_id`), it says so and the promotion gate applies.

# Operator tasks that need no code (do these first; record them in the ledger)

1. **Create "Total Marine Technology" as a bargaining campaign by hand**, the way campaigns 61 and 62 were: universe = employer 84 only (UNV-a); let the sync enrol members; Worksite group with one unit per vessel (Constructor, Normand); shifts under each vessel via Split with "keep in parent" on the legacy chart today, or WP2.7's Nest under once it lands. This is the campaign-42 shape WP2.4c renders. Do not mirror the vessels into 64.
2. **Keep campaign 64 employer-only.** Do not add worksites to its universe or switch match mode. If the two nested vessel units in 64 carry `unit_basis {worksite_id}` alone, set both keys (`{employer_id: 84, worksite_id: …}`) through the editor or a run sheet, so the F1 matcher cannot place another employer's worker on them (`sync-campaign-universe.ts:156–162`). The agent prepares a read-only query for the current basis of those two units; the operator runs it on production and pastes the result.
3. **Decide which of campaign 64's seven assessments are sector-wide** (the petition-style ones) so WP3.8's data run sheet can flag them `family`. The agent lists the seven by title from the realistic data set; the operator answers.
4. **Answer decision SM (WP2.4b)** if still open; recommendation SM-a stands.

# Documentation amendments (docs-only commits on the package branches)

- `DECISIONS.md`: decisions 11 and 12 with the answers above.
- `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` §5.5: an addendum "Campaign families": one-level parent link, shared assessments, spin-off; the sector-campaign shape (Employer primary, vessels nested, Worksite sub-unit-only) recorded as correct.
- `wp/wp2.4c.md` §4.6 / operator checklist: the SG-a hidden Worksite group in a sector campaign is expected, not a bug (already in the ledger; add it to the checklist wording).
- `PROGRESS.md`: rows 3.8 and 3.9; the backlog entry marked "planned here"; the operator tasks above as human tasks; the spin-off's SPN-b left as a recorded option.
- `IMPLEMENTATION_ORCHESTRATION_PROMPT.md` phase 3: append the WP3.8 and WP3.9 specifications (verbatim from this file) after WP3.7 so the programme's single list of packages stays complete.

# Sequencing

1. Operator tasks 1–4 and the decisions table (one message to the operator; "as recommended" is a complete answer).
2. WP3.8: plan (Fable) → approve → implement (Fable, `max`) → verify (Sonnet) → review (Fable) → draft PR → dev migration → preview → production run sheet → merge → campaign-64 data run sheet. Parallel with WP2.5/2.6/2.7; file boundaries stated in the plan's §3.15 the way `wp/wp2.7.md` §3.15 does.
3. WP3.9: plan only after WP2.7 and WP3.1 are merged and WP3.8 is on production; implement after WP2.4b (MIR-a). If the operator wants the TMT campaign linked and sharing assessments before WP3.9 exists, WP3.8's Basics "Part of" selector and scope toggle are enough; WP3.9 is the guided path for the next company.
4. Ledger and reporting per the inherited prompt: after each package, the ledger row, the evidence paragraph, the reviewer's verdict, the run sheet the operator now needs, and the next step.

Begin with the operator tasks and the decisions table.
```
