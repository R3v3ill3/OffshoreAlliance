# Decision register — Organiser UX plan

Source: `docs/ORGANISER_UX_REVIEW_AND_PLAN.md`, section 9 ("Decisions needed before building").
Each decision lists the plan's recommendation, the work packages that cannot start until it is answered, and the operator's answer with the date. A decision is **Open** until the operator writes an answer here (or confirms the recommendation in the session, after which the orchestrator records it).

Status key: **Open** · **Confirmed** (recommendation accepted as written) · **Amended** (see answer).

| # | Decision | Plan recommendation | Blocks | Status |
|---|---|---|---|---|
| 1 | Organiser mode defaults | Accept the module table in plan 5.2 (Wall chart & people, Actions, Setup, Inbox on for organisers; Strategic planning, Bargaining, Insights, Data fields, Activists & WOCs, Library, Imports, Organisation databases off; Administration admins only). "Show everything" **allowed** for organisers. | WP1.1 and everything after it | Confirmed |
| 2 | Who is an admin | Convert the seven `admin` accounts whose `work_role` is `organiser` to `user`; name the two `lead_organiser` accounts as leads (they stay `admin` unless the operator says otherwise). Coordinator and industrial coordinator stay `admin`. (Appendix G.6.) | WP0.4, WP1.6 | Confirmed |
| 3 | Group kinds | `worksite`, `employer`, `shift`, `crew`, `occupation`, `work_area`, `custom`; labels Worksite, Employer, Shift, Crew, Occupation, Work area, Custom. "Occupation" rather than "Profession" because the data uses occupation. | WP2.1 | Amended |
| 4 | Unassigned is derived, not stored | Derived via the `campaign_group_membership` view (plan section 6). Not the materialised alternative (appendix C 8.5 option 2). | WP2.1 | Confirmed (with note) |
| 5 | No nesting in the organiser model | Flatten employer → worksite containers into two groups (Employer, Worksite); "Split" creates sibling units in the same group; `parent_ou_id` survives only as migration input. | WP2.1 | Amended |
| 6 | Default campaign kind | Organising. Bargaining campaigns get a prompt to add a strategic plan, not a ninth wizard step. | WP3.1 | Amended |
| 7 | Creation paths to retire | Manual create, the planner's standalone mode, import-creates-campaign, and wizard steps 3, 4, 7, 8, 9 (moved into the Strategic plan module). One three-screen create flow remains. | WP3.1, WP3.4 | Amended |
| 8 | Who may assign other organisers | Admins **and** lead organisers (`work_role = lead_organiser`). | WP1.6 | Confirmed (with note) |
| 9 | Guides budget | About ten clips re-recorded across phases 1 to 3 (OVERVIEW in phase 1; B1–B3 and C1–C3 in phase 2; A4 and A5 in phase 3). Re-recording is human work logged in the ledger; manifest updates are in scope. | WP1.7, WP2.9, WP3.7 (none of these block code) | Confirmed |
| 10 | Standalone actions | Actions hub as a top-level organiser item; one action-container mechanism for SMS, email and phone (`container_kind`), no new lists in the shared standing campaign; one-way Link to campaign with "New campaign from this action". | WP3.5, WP3.6 (WP1.5 builds the hub UI and is not blocked) | Confirmed |

## Operator inputs the work packages also need (not section 9 decisions)

| Item | Needed by | Notes |
|---|---|---|
| A dev-database test account with role `user` (and ideally one `viewer`), credentials supplied out of band as `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`; plus one dev campaign visible to that account with at least one member (100% Unassigned is fine) | WP0.2 (e2e flow one), WP1.6 (role coverage) | Dev project `dpnnmkhabysfdogllsyh` only. Never production. |
| A dev PostHog project key and host (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`) for the preview environment, confirmed as a dev project | WP0.2 | **2026-09-08: not set up for dev.** Capture no-ops without a key; the "events visible in a dev PostHog project" criterion is deferred until the operator creates one. Not blocking. |
| A dev-pointed environment for the app | WP0.3 screenshots, every later e2e run | **2026-09-08: resolved by Vercel.** Every `feat/oux-*` branch gets a Vercel preview deployment backed by the dev project; agents use the branch preview URL as `E2E_BASE_URL` and never run the app locally (the local `.env.local` still targets production). |
| Dev re-seeded from a production snapshot (schema plus campaign data) before each schema package | WP2.1 (WP0.4 no longer) | **2026-09-08: operator accepts dev-data-only rehearsal for WP0.4**; production is still in testing, so the production run is the first full-scale pass and its pre-checks are the gate. Still wanted before WP2.1. |
| The pilot group for organiser mode | Phase 1 exit | Named by the operator. |

## Answers

Answered by the operator in the orchestration session on **2026-09-08**.

- **Decision 1 — Confirmed.** Module table in plan 5.2 as written; "Show everything" allowed for organisers.
- **Decision 2 — Confirmed.** The seven `admin` accounts with `work_role = organiser` become `user`; the two lead organisers are named as leads.
- **Decision 3 — Amended.** The seven kinds stand, **plus a user-defined group kind**: an organiser must be able to create a group whose kind is not in the fixed list.
  *Implication for WP2.1:* `campaign_groups.kind` keeps the fixed values (they drive auto-fill from worker fields) and `custom` carries a free-text label that is the group's display name and "kind" as far as the organiser is concerned (for example a Custom group labelled "Language" or "Rotation"). The WP2.1 planner must show how a user-defined kind is created in the editor and in create-flow step 3, and may propose a `kind_label` column if `name` alone is not enough. No open-ended `kind` CHECK values.
- **Decision 4 — Confirmed, with a note.** Unassigned is derived. **At instigation it is common for 100% of the membership to be Unassigned.** *Implication for WP2.4 and WP2.5:* the Unassigned card and the "Not in any group" view must render a whole membership (hundreds of tiles) within the performance budget, and the empty-structure state (no groups, or groups with no placements) must read as normal, not as an error.
- **Decision 5 — Amended.** Nesting is removed, **but Employer and Worksite must be dynamic**: a single employer may span several worksites, a worksite may host several employers, and campaigns may have many of both. *Implication for WP2.1, WP2.7 and WP3.1:* Employer and Worksite are two independent groups (facets), never parent and child; a worker sits in one Employer unit and one Worksite unit regardless of which side is "many"; the migration's flattening of the 18 employer containers into two groups is the mechanism; the create flow and the editor pre-build both groups from the universe and must not assume either side is singular. Compare (employer × worksite) is the view for the intersection.
- **Decision 6 — Amended.** Default campaign kind is **Bargaining**, not Organising. Bargaining campaigns are prompted to add a strategic plan, and the prompt is **clearly optional**. *Implication for WP3.1 and WP3.3:* `current_phase` still defaults to `standalone_activities` for any campaign without a plan (bargaining included) until a plan is attached; nothing gates on the plan.
- **Decision 7 — Amended.** **No creation path is retired.** Visibility and prominence are reduced instead. Manual create remains important and stays reachable; the planner's standalone mode, the import wizard's campaign creation and wizard steps 3, 4, 7, 8, 9 are nested under optional components and/or limited to admins. *Implication:* WP3.4 is renamed "Demote creation paths": the campaigns page and My campaigns offer one primary New campaign action leading to the three-screen flow; manual create is a secondary link from that flow (or More); planner-standalone and import-creates-campaign are admin-visible or inside their modules; every old URL still resolves. The WP3.4 acceptance criterion "every old URL redirects" becomes "every old URL still works and is reachable from a documented location".
- **Decision 8 — Confirmed, with a note.** Admins and lead organisers may assign other organisers. **A `user`-role organiser must be able to create campaigns and actions with themselves assigned.** *Implication for WP1.6 and WP3.1:* role-coverage tests include a `user` account creating a campaign as its own organiser and then editing and deleting its own units; the `created_by` path in `can_write_to_campaign()` is what makes this work and must be set on every creation path.
- **Decision 9 — Confirmed.** Guides are re-recorded (human task, tracked in the ledger).
- **Decision 10 — Confirmed.** Actions hub, one container mechanism, one-way Link to campaign with "New campaign from this action".

**Operator inputs** (test accounts, PostHog key, dev re-seed, pilot group) will be supplied by the operator as each package needs them.

**Test accounts (2026-09-08).** The operator supplies two dev accounts (one `admin` / lead organiser, one `user` / organiser) directly through `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` in the environment where `pnpm e2e` runs. Credentials are never written into the repository, plan files or agent prompts, and no agent types them into a form; the harness reads them from the environment. Interface testing happens on the dev previews first; production is used later for full-scale testing.
