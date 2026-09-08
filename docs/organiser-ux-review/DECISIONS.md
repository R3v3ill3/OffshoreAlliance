# Decision register — Organiser UX plan

Source: `docs/ORGANISER_UX_REVIEW_AND_PLAN.md`, section 9 ("Decisions needed before building").
Each decision lists the plan's recommendation, the work packages that cannot start until it is answered, and the operator's answer with the date. A decision is **Open** until the operator writes an answer here (or confirms the recommendation in the session, after which the orchestrator records it).

Status key: **Open** · **Confirmed** (recommendation accepted as written) · **Amended** (see answer).

| # | Decision | Plan recommendation | Blocks | Status |
|---|---|---|---|---|
| 1 | Organiser mode defaults | Accept the module table in plan 5.2 (Wall chart & people, Actions, Setup, Inbox on for organisers; Strategic planning, Bargaining, Insights, Data fields, Activists & WOCs, Library, Imports, Organisation databases off; Administration admins only). "Show everything" **allowed** for organisers. | WP1.1 and everything after it | Open |
| 2 | Who is an admin | Convert the seven `admin` accounts whose `work_role` is `organiser` to `user`; name the two `lead_organiser` accounts as leads (they stay `admin` unless the operator says otherwise). Coordinator and industrial coordinator stay `admin`. (Appendix G.6.) | WP0.4, WP1.6 | Open |
| 3 | Group kinds | `worksite`, `employer`, `shift`, `crew`, `occupation`, `work_area`, `custom`; labels Worksite, Employer, Shift, Crew, Occupation, Work area, Custom. "Occupation" rather than "Profession" because the data uses occupation. | WP2.1 | Open |
| 4 | Unassigned is derived, not stored | Derived via the `campaign_group_membership` view (plan section 6). Not the materialised alternative (appendix C 8.5 option 2). | WP2.1 | Open |
| 5 | No nesting in the organiser model | Flatten employer → worksite containers into two groups (Employer, Worksite); "Split" creates sibling units in the same group; `parent_ou_id` survives only as migration input. | WP2.1 | Open |
| 6 | Default campaign kind | Organising. Bargaining campaigns get a prompt to add a strategic plan, not a ninth wizard step. | WP3.1 | Open |
| 7 | Creation paths to retire | Manual create, the planner's standalone mode, import-creates-campaign, and wizard steps 3, 4, 7, 8, 9 (moved into the Strategic plan module). One three-screen create flow remains. | WP3.1, WP3.4 | Open |
| 8 | Who may assign other organisers | Admins **and** lead organisers (`work_role = lead_organiser`). | WP1.6 | Open |
| 9 | Guides budget | About ten clips re-recorded across phases 1 to 3 (OVERVIEW in phase 1; B1–B3 and C1–C3 in phase 2; A4 and A5 in phase 3). Re-recording is human work logged in the ledger; manifest updates are in scope. | WP1.7, WP2.9, WP3.7 (none of these block code) | Open |
| 10 | Standalone actions | Actions hub as a top-level organiser item; one action-container mechanism for SMS, email and phone (`container_kind`), no new lists in the shared standing campaign; one-way Link to campaign with "New campaign from this action". | WP3.5, WP3.6 (WP1.5 builds the hub UI and is not blocked) | Open |

## Operator inputs the work packages also need (not section 9 decisions)

| Item | Needed by | Notes |
|---|---|---|
| A dev-database test account with role `user` (and ideally one `viewer`), credentials supplied out of band | WP0.2 (e2e), WP1.6 (role coverage) | Dev project `dpnnmkhabysfdogllsyh` only. Never production. |
| A dev PostHog project key for the preview environment | WP0.2 | Events must be visible somewhere the operator can check. |
| Dev re-seeded from a production snapshot (schema plus campaign data) before each schema package | WP2.1, WP0.4 rehearsal | `docs/DEV_PROD_ENVIRONMENT.md` says the current dev seed has campaign data stripped; the migration rehearsal needs the real structure (appendix G counts). |
| The pilot group for organiser mode | Phase 1 exit | Named by the operator. |

## Answers

_Record answers here with the date. Example:_

- _2026-09-08 — Decision 1: Confirmed._
