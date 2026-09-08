# E — Prior design & review documentation: synthesis for the organiser-UX simplification

Method: read-only. Every document in the brief was read in full except `STREAM3_2_IMPLEMENTATION_PLAN.md` (skimmed: headers plus the UI sections §1.6, §2.4, §4.4 and the timeline). The SOC Field Guide was extracted from the .docx with `unzip -p … | sed` (python-docx unavailable). "Code check" means grep/ls against `apps/organising-db/src` and `supabase/migrations` at HEAD (2026-09-07). Git history for nearly all docs is one squashed import commit (2026-08-12), so dates are taken from the documents' own text; only `docs/SMS_HUB_UX.md` has real commit dates (2026-09-02, 2026-09-04).

---

## 0. Baseline the documents must be read against (code at HEAD, 2026-09-07)

- `app/page.tsx` redirects `/` to `/campaigns`. Sidebar (`components/layout/sidebar.tsx`): Campaigns, Dashboard, Overview, Worksites, Upcoming Projects, Email Inbox, SMS Tools, SMS Inbox, Reports, Guides; second group Email Imports, Email Wrappers, Administration. No sidebar entry for Workers / Employers / Agreements / Programs / Workload (routes exist; reached via Overview tabs or direct URL).
- Campaign list (`app/(dashboard)/campaigns/page.tsx` 133–139, ~413): default-scoped to `profile.organiser_id`; unlinked accounts see "Your account is not linked to an organiser record yet… Use Administration to link your profile". Row click already goes to `/campaigns/{id}?tab=workforce&sub=wall-chart`, i.e. the wall chart is already the landing surface from the list.
- Campaign detail (`app/(dashboard)/campaigns/[id]/page.tsx` 418–826): 8 top-level tabs — Overview | Plan & Execution (Strategy, Workplan, Actions, Task Lists, Pending Review, Role Check) | Section Plans | Workforce (Wall Chart / List, Campaign Units, Scope, Assessments, Data fields, Activists & WOCs, Foundational Readiness) | Outcomes (Reports, Results, Insights) | Outreach (Comms, Phone Ops, SMS, SOC) | Library | Bargaining (conditional). URL state `?tab=&sub=` with legacy redirects ("Phase A extension", line 169).
- Planner is absorbed: `/campaigns/[id]/plan`, `/plan/stage/[n]`, `/plan/gate/[n]`; `next.config.ts` 40–60 redirect `/planner/*`. `campaign_phase_enum` = preparing_to_bargain (stages 1–6), bargaining_to_win (7–11), post_settlement, and `standalone_activities` = stage 0, "per-campaign bucket for ambitions/assessments created outside the P2W/B2W stage sequence (Workforce → Assessments flow)" (`20260627100000_standalone_stage_plan.sql`). The Strategy sub-tab renders `CampaignPlanPanel` plus `Phase2WizardLaunchCard` ("Begin Phase 2: Bargaining to Win… unlock stages 7–11").
- Two schema-level "standalone" concepts already exist: `campaigns.is_standing` (`20260612100000_standing_campaign.sql`: "shared container for phone operations not belonging to a specific active campaign… exactly one… per organisation") and `campaigns.is_sms_episode` (`20260813005937_sms_episode_campaigns.sql`: hidden per-episode campaigns for standalone SMS, "hidden from the campaigns list and campaign chrome (assessments, wall chart, plan)").
- Creation paths (`campaigns/page.tsx` 310–390): "Create campaign" dialog → "Campaign wizard" (`/campaigns/new`; `new/page.tsx` dispatches to the planner-style `CampaignCreationWizard` when any of `campaign_id|agreement_id|organiser_id|expiry_date` is in the query, else `CampaignWizard`) or "Manual create" (`/campaigns/new/manual` → `/campaigns/[id]/settings`). The wizard is now 9 steps for bargaining (`campaign-wizard.tsx` 152: "bargaining plan handoff is step 9"; `step-situation-analysis.tsx` exists). Email wizard, Phone wizard, SOC wizard (`/campaigns/soc-wizard`) and "Import lists" also hang off the campaigns page.
- Units: `campaign_organising_units` carries `is_group_container`, `ou_group_id`, `parent_ou_id`, `unit_basis`, `display_order`. Triggers: no workers on containers; a worker may be in only one group per `ou_type` per campaign (`20260608100000_ou_group_integrity.sql`); three-level nesting only under a container — "Level 0: Employer group container / Level 1: Vessel / worksite unit / Level 2: Shift / crew sub-unit" (`20260612100000_ou_three_level_depth.sql`); container delete detaches children (`20260630…`); `campaign_unit_rules` rule-based assignment; `split_campaign_organising_unit()`; `merge-units-dialog.tsx`, `split-unit-dialog.tsx`. `create-organising-unit-dialog.tsx` has `single | group` modes, `GROUPABLE_TYPES`, placement top/bottom/after, "add to existing group".
- "Unassigned" today is campaign-wide, not per-group: one "Unassigned workers" pseudo-card in the wall chart (`campaign-wall-chart.tsx` 926 `UNASSIGNED_KEY = 0`, 1545–1600 `data-ou-id="unassigned"`), an "Unallocated" pseudo-unit in `campaign-units-section.tsx` (1772–1830), and a computed `ou_id IS NULL` bucket in the `campaign_unit_assignment_summary` view. The wall chart groups visible units by `ou_type` ("each 'dimension' is visually [separate]… workers can only be moved within a group", 1678–1680); `wall-chart/dnd.ts` carries `fromOuType` "used to enforce same-dimension-only moves".
- Universe: `campaign_employers` + `campaign_worksites` are the universe. `lib/workers/sync-campaign-universe.ts` docblock: "Campaigns declare a universe via campaign_employers / campaign_worksites. When a worker is placed at an employer or worksite, they should appear in every active/planning (non-SMS-episode) campaign whose universe includes that employer or worksite — and in any matching employer/worksite units." `campaign_universes` / `campaign_universe_rules` survive only as "Named universes (optional) — Labels for the Actions tab only. Campaign scope (employers, worksites, workers) is managed above" (campaign page 623–640). Three worker↔campaign tables still coexist: `campaign_worker_membership` (63 source files), `campaign_worker_ou` (31), `worker_campaign_connections` (11 — phone, call lists, list-builder, worker API).
- Roles: app roles admin / user / viewer (`lib/supabase/auth-context.tsx` 373–376; `canWrite = admin || user`). Campaign team roster `campaign_organisers` (campaign_role lead / organiser / coordinator / industrial_officer / specialist; per-campaign `reports_to` override; `20260403000000_campaign_organiser_team.sql`; API `/api/campaign-organisers/[campaignId]`) alongside the single `campaigns.organiser_id` owner used for list scoping. Admin "Organiser Patches" page exists (`/organiser-patches`). Worker leadership: global `workers.member_role_type_id` (contact / Activist / delegate) plus `is_bargaining_rep` and `is_hsr`; `oa_leader_role` and `engagement_level` have 0 code references.
- Wall chart v2 artefacts all present (see §1.1). Help hub `/help` ("Guides") serves 19 clips: OVERVIEW, A1–A5, B1–B3, C1–C3, E1–E3, D1–D4.

---

## 1. Document by document

### 1.1 `WALLCHART_ENHANCEMENTS_V2.md`
- **Date/status:** undated; "Follow-up to the v1 wall-chart restructure (PR claude/ecstatic-haibt)"; an implementation plan.
- **Purpose:** close three gaps that "surfaced on first use" of the v1 wall chart — tiles could not be reallocated between units except via the detail sheet's Units tab; relationships were built one worker at a time; the add-link picker did not show which candidates were co-located with the leader's unit(s). No schema changes.
- **Decisions:**
  - Wall chart (§Feature 1): drag = move, Shift+drag = copy (matches existing right-click "Copy to unit"); ⌘/Shift+click multi-select with a sticky selection bar ("3 workers selected — Move to unit / Copy to unit / Link to leader / Clear"); drop on the "Unassigned" pseudo-unit deletes all `campaign_worker_ou` rows for the worker ("worker stays in the campaign via campaign_worker_membership"). Primary flag follows a move. Selections "can span units for a batch move to a common destination". Native HTML5 DnD, no dependency; keyboard path via the tile "⋯" menu (§Dependency decision).
  - Units: "drop on same unit: no-op"; copy into a unit already containing the worker is skipped with a toast (§Mutation). Drag-to-unmapped (the estimate − named grid) rejected: "Leaning no… v2 drops on Unassigned only" (§Open questions 3).
  - Roles/leaders (§Feature 2, §Open questions 2): "Link to leader" picker scoped to member roles 7/8 (delegate/activist) or `is_bargaining_rep`/`is_hsr`; whether Activists and Contacts count as leaders left open ("v2 implementation will include all three… easy to tighten later").
  - Deferred (§Out of scope, §Implementation phases): rule-based auto-linking of new unit members to the unit's delegate — "needs product sign-off on semantics (one leader per unit? multiple? what happens on role change?)"; manual `sort_order` within a unit; cross-campaign moves; atomic RPC; touch DnD via `@dnd-kit/core`.
- **Code check:** implemented. `use-wall-chart-selection.ts`, `move-worker-mutation.ts`, `bulk-add-followers-dialog.tsx`, `leader-unit-context.ts` all exist, plus `wall-chart-selection-bar.tsx` (Move to unit…, Copy to unit…, Remove from unit, Clear ratings…, Link to leader…), `link-to-leader-dialog.tsx`, `dnd.ts` (custom MIME types, native events; `@dnd-kit` appears only in `section-planning/SectionWhereToPlayPanel.tsx`). Deviation from plan: shipped DnD enforces same-dimension-only moves (`fromOuType`) and the group-exclusivity trigger (June) makes cross-group moves two-step. Auto-link on unit assignment: no trigger on `campaign_worker_ou` in the leader-links migrations (`20260415200000`, `20260605…`, `20260606…`) — still open.

### 1.2 `docs/campaigns-review-development-report.md`
- **Date/status:** late April – early May 2026 (migrations `20260502100000`–`20260507100000`; incidental log "started 2026-04-27 (Phase 3)"). "All 9 phases shipped end-to-end."
- **Purpose:** consolidated report on the 9-phase campaigns-section overhaul: wizard restructure + multi-agreement, campaign units in the wizard + allocation rewrite, campaign-level ambitions, manual create + settings editor, chrome cleanup + vertical P2W nav + tab URL state, stage-overlap hard-gate + revision audit, ambitions panel redesign, Where-to-Play taxonomy cleanup, campaign progress dashboard.
- **Decisions relevant to us:**
  - Campaign setup (§What this work was for, §Phase 1, §Phase 4, §Wizard step ordering): the stated problem was "two divergent creation paths" and a wizard that "forced organisers to enter total_worker_estimate before they had even picked employers/worksites". New order for bargaining: Basics → Employers & worksites → Agreements → Worker estimate → Campaign units → Allocate workers → Campaign ambitions → Plan handoff (8 steps; 7 for non-bargaining). Default `campaign_type = "bargaining"`. Phase 4 added the manual path: `/campaigns/new/manual` (name/type/status/organiser) → `/campaigns/[id]/settings` accordion of 8 sections, each saving independently — "Lets users skip the step-paged wizard entirely." It deliberately did not refactor the wizard: "favour clean isolation over a heavyweight shared-hook refactor; if the duplication becomes painful, extracting a useCampaignWizardEdits hook is the natural next step."
  - Units (§Phase 2): `ou_type` gained `employer`; `unit_basis` JSONB records the filter the unit was built from; "Use employers / worksites as campaign units" auto-creates one unit per selected entity; per-unit estimates validated against the campaign estimate with the remainder shown as Unallocated; "The 'Unallocated' bucket is intentionally computed, not a real row."
  - Navigation/chrome (§Phase 5, §Locked decisions): global header search removed; stage-planning routes collapse the global header and cross-app banner; `?tab=` URL state validated against `validTabs`; P2W steps moved from horizontal tabs to a vertical nav; campaign page top-right became "All settings" + "Re-run wizard" (§Phase 4).
  - Strategic-planning coupling (§Phases 3, 6, 8, 9): campaign-level ambitions with stage ambitions rolling up (`parent_campaign_ambition_id`, `campaign_ambition_progress` view); W2P rows link to a stage ambition (`linked_ambition_id`); WOC and SOC moved from W2P "channels" to `plan_capacities` ("they describe how organising capacity is exercised, not channels"); hard-gate overlap trigger; `plan_revision_notes`; Insights tab embeds `CampaignProgressReport`. Bargaining campaigns end the wizard with "Plan handoff — links to OA Planner".
- **Code check:** implemented and since extended — settings and manual routes; all `step-*.tsx`; header comment at `header.tsx` 71 confirms removal of search; `?tab=`/`?sub=`; Insights under Outcomes; `/reports/campaign-progress`. Since then the wizard grew a situation-analysis step (9 steps) and the page grew Section Plans, Outreach, Library and Bargaining tabs.

### 1.3 `docs/campaigns-review-incidental-issues.md`
- **Date/status:** "started 2026-04-27 (Phase 3)"; all seven entries "Open".
- **Purpose:** out-of-scope findings during the review.
- **Relevant:** #1 global search bar "purely decorative… users on stage planning pages… have already flagged that the chrome stack is too heavy" — resolved (removed globally). #2 `campaign-wizard.tsx` "one of the largest and slowest components in the app". #4 `as any` casts in `plan/page.tsx` and stage page. #5 unused args in `useStagePlan.ts`/`useGateAssessment.ts`. #7 type generation needs deploy-then-regen. Nothing else UX-relevant.

### 1.4 `STREAM3_1_EXECUTIVE_SUMMARY.md`, `STREAM3_1_OVERLAP_ANALYSIS.md`, `STREAM3_1_RECOMMENDATIONS.md`, `STREAM3_1_UX_IMPACT.md`
- **Date/status:** analysis completed 2 April 2026 (Planning Agent 3.1); proposals with a "decision meeting" as next step — no decision recorded in any later doc.
- **Purpose:** map confusion between projects, programs, campaign universes and hierarchies; propose Option A (rename + backfill, 3 weeks), B (consolidate, 7 weeks), C (contracts-centric redesign, 16 weeks); recommend hybrid A → B → C.
- **Decisions/recommendations relevant to us:**
  - Universe: three parallel scope mechanisms — `campaign_universe_rules`, `campaign_employers`+`campaign_worksites`, `campaigns.campaign_scope` — "unclear which is authoritative" (OVERLAP §1.3, §3.3; EXEC §Key Findings 2). Option B keeps the direct tables, deprecates universe rules, computes the reach pattern (RECOMMENDATIONS §B1.1; UX_IMPACT §B1 "[REMOVED] Universe rules form / Manual reach pattern selection").
  - Units: OVERLAP §8 asks whether OUs are subsets of universes and whether a worker can be in multiple OUs; recommends "Document relationship: OUs are subsets of universes… Add UI to show universe → OU hierarchy." Options B and C propose removing OUs: "[REMOVED] Organizing Units tab (concept deprecated)" (UX_IMPACT §B2), OU structure "flattened to tags" (RECOMMENDATIONS §B1.2, §B5 cons), "Removed: Organizing Units complexity" (UX_IMPACT §C2).
  - Worker↔campaign: three tables; consolidate to `worker_campaign_connections` (OVERLAP §7; RECOMMENDATIONS §B1.2).
  - Campaign setup: computed reach pattern (§A1), single scope mechanism (§B1), and ultimately "3 steps instead of 6" via contract selection with a live worker-count preview (§C2).
  - Hierarchy: `parent_worksite_id` all NULL; hub → programs migration "deliberately abandoned" it; Option B drops the column (RECOMMENDATIONS §B1.3).
  - Strategic planning: "Planning vs execution disconnect… add ambition_id FK to campaign_activities" (OVERLAP §9).
  - Organiser pain points (EXEC §User Impact Assessment): campaign creation confusing; project display empty; worker search limited; agreement coverage unclear; principal employer invisible; worker profiles fragmented; dashboard empty sections.
- **Code check:** Option A renames not done (`site_projects` 0 refs, `coverage_type` 0; `campaign_scope` used in 5 files and drives the wizard pickers). Option B partial: universe rules demoted to optional action labels, not removed; `worker_campaign_connections` exists (migration `20260402170000`) and is used in phone/list paths but did not replace membership/OU; OU removal rejected in practice (OUs became the core structure). `parent_worksite_id` neither dropped nor populated (3 refs: types, worksite pages). Option C not done (no `contracts`/`contract_workers`/`operational_groups`; a separate `worksite_contracts` bridge table from `20260331191000` predates the analysis and is referenced in 3 source files). The ambition↔activity link exists in another form (`plan_where_to_play.linked_ambition_id`; `ambition_activity_contribution` view per REPO_ORIENTATION §6).

### 1.5 `STREAM3_2_CURRENT_STATE.md`, `STREAM3_2_HIERARCHY_OPTIONS.md`, `STREAM3_2_INDUSTRY_CONTEXT.md`, `STREAM3_2_IMPLEMENTATION_PLAN.md` (plan skimmed)
- **Date/status:** 2 April 2026; analysis + 8-week plan; not adopted.
- **Purpose:** decide what to do with the dormant worksite `parent_worksite_id` and how to model offshore facility hierarchies.
- **Decisions/recommendations:**
  - CURRENT_STATE §2: hubs converted to programs by `20260331200000_hub_to_programs.sql`, which cleared `parent_worksite_id`; §6 hierarchy reporting is computed flat paths (Geo → Service Type → Producer → Worksite; `worksite-hierarchy-explorer.tsx`); §9 open question 5 "How would organisers interact with a hierarchical worksite structure?" unanswered; §10 "Decision Required" remove / keep / populate.
  - HIERARCHY_OPTIONS §Recommended Approach: Option B (typed hierarchies) on an Option A (adjacency) foundation — geographic basin → field → installation via `parent_worksite_id`, hub↔satellite via a junction table, programs kept.
  - INDUSTRY_CONTEXT §7.1: hub = "central point for worker contacts, delegate networks"; §7.3 contractors rotate between sites within a program; §8 mobile facilities need time-based location.
  - IMPLEMENTATION_PLAN §1.6, §2.4, §4.4: tree view + breadcrumbs on worksite list/detail, operational network graph, location history, audit log, bulk import.
- **Code check:** not implemented (no `hierarchy_level`/`hierarchy_path`, no ops hierarchy table; `parent_worksite_id` is still a "Parent Worksite: None (standalone)" field on the worksite form per HOW_TO A2). The analysis never connects worksite hierarchy to campaign unit hierarchy; the app subsequently built hierarchy inside campaigns (employer group → vessel/worksite → shift/crew).

### 1.6 `docs/STREAM3_3_RECOMMENDATION.md`, `docs/STREAM3_3_ANALYSIS_INDEX.md`
- **Date/status:** 2 April 2026; recommendation adopted in substance.
- **Purpose:** choose between two separate apps (organising-db + oa-planner), a shared shell, a single merged app, or microservices.
- **Decisions:** Option 3 — one Next.js app with route prefixes `/organising/*` and `/planner/*` (RECOMMENDATION §Architecture Overview); reject Option 2 ("complexity without proportional benefit") and Option 4 ("catastrophic for this team"). Navigation rationale: "seamless navigation, consistent UI, unified search, no context switching" (§Why Option 3 Wins).
- **Code check:** merged, but not with those prefixes — the planner lives under `/campaigns/[id]/plan/*` with `/planner/*` redirects (REPO_ORIENTATION §1 confirms). "Unified search" never delivered (search was removed instead).

### 1.7 `docs/stream3-4/` (README, INTEGRATION_MAP, DATA_FLOW_DESIGN, UI_OPTIONS, PHASED_PLAN, DATA_MODEL_CHANGES)
- **Date/status:** 2 April 2026; 18-month integration plan; superseded by the in-app merge.
- **Purpose:** integrate Organising DB and OA Planner — 50+ integration points, sync design, four UI options (A linked, B embedded iframe, C unified, D shared workspace), four phases, schema additions.
- **Decisions/recommendations relevant to us:**
  - Strategic-planning coupling: recommended Option B (iframe embed) short-term → D → C (UI_OPTIONS §6). Option C's campaign page = Overview | Planning | Execution (UI_OPTIONS §3.2, PHASED_PLAN §3.3.2); Option D = Management / Planning mode toggle persisted per campaign (UI_OPTIONS §4.5; DATA_MODEL §3.2 `campaign_view_preferences`). Phase 2 proposed a plan-status → campaign-status trigger, universe → W2P import RPC, timeline auto-calc from agreement expiry, ambition progress materialised view, gate-outcome notifications, capacity gaps → actions, management systems → recurring actions (PHASED_PLAN §2.3; DATA_FLOW §2.1–2.7).
  - Units: "OUs become 'Where to Play' focus categories; worker counts inform capacity requirements; anchor workers identify delegated capacities" (INTEGRATION_MAP §3.1C).
  - Universe: universe rules should seed W2P (§3.1B) — presumes the rule-based universe that has since been demoted.
  - Organiser workflow: planning → execution → monitoring loop diagrams (INTEGRATION_MAP §4.2–4.4); Option A con "Users may forget which app does what" (UI_OPTIONS §1.4).
  - README §Common Questions: "Can we stop after Phase 2? Yes."
- **Code check:** none of the Phase 2–4 artefacts exist (0 migrations for `notifications`, `sync_failures`, `cross_app_audit_log`, `ambition_progress_mv`, `import_universe_to_wtp`, timeline auto-calc trigger; no `PlannerEmbed`). A plain `ambition_progress` view and the campaigns-review `campaign_ambition_progress` view exist instead. The iframe path was leapfrogged by the in-app merge.

### 1.8 `docs/worker-leadership-harmonisation.md`
- **Date/status:** 15 April 2026, "Proposed"; implemented by `20260415100000_leadership_harmonisation.sql`; re-litigated in June — `20260605100000_leader_tasking_enhanced.sql` re-introduced per-campaign `oa_leader_role`, and `20260605120000_revert_oa_leader_role_use_global.sql` reverted it the same day ("union role… is a GLOBAL property of the worker, not a per-campaign attribute… 0/673 rows had a non-null value").
- **Purpose:** collapse three overlapping role systems into one global role plus positional flags; automate role/rating side-effects from task allocation; make OUs the default grouping for tasking.
- **Decisions:**
  - Roles (§2.1–2.3): single source of truth `workers.member_role_type_id` (Contact / Activist / Delegate); Bargaining Rep and HSR as independent booleans; "Roles are enduring… Ratings are episodic"; remove `oa_leader_role`, `engagement_level`, `engagement_score`.
  - Wall chart (§1.3, §2.4, Phase 3 table): remove the duplicate "OA leader role (this campaign)" dropdown; badge from the global role; default cumulative rating 1 for any leadership role or bargaining rep, 2 for members, null otherwise; "HSR alone does not affect the default rating."
  - Units/tasking (§2.5, Phase 5): task-list dialog should default to an OU picker, allow "Create organising unit from this list", keep manual selection and post-creation editing; leader assignment auto-promotes to at least Activist and auto-rates 1; list workers are not auto-rated.
  - Pain points (§1.8): three overlapping role systems; dual dropdowns; dead `engagement_level`; no automation between tasking, role and rating; "OUs and task lists are disconnected — organising units should be the natural grouping for task allocation"; rating defaults split DB/frontend; leader counts derived from task lists not roles.
- **Code check:** implemented — 0 refs to `oa_leader_role` / `engagement_level`; 25 files use `is_bargaining_rep`; `getWallChartDefaultCumulative({unionMembershipTypeName, memberRoleName, isBargainingRep})` (`lib/campaign/constants.ts` 138–150) matches §2.4; `task-lists/create-task-list-dialog.tsx` references `ou_id`; side-effects refined in `20260606100000_leader_only_task_list_side_effects.sql`. Divergence: the June migration will "NOT upgrade contact to activist (a contact is an intentional softer designation)", whereas §2.2 said promote "if currently Contact or null".

### 1.9 `docs/relationship-map.md`
- **Date/status:** undated live-DB snapshot (39 worksites, 16 projects, 3 programs, 69 employers, 64 employer_worksite_roles); descriptive.
- **Purpose:** map worksites, principal worksites, projects, programs, principal employers and employer parent/child as they exist.
- **Relevant:** §1 "Principal worksite" is a derived UI concept, not a table. §5 gaps — projects under-linked (empty `project_employers`/`project_agreements`), `workers.project_id` all NULL, no worksite hierarchy; overlaps — two ways to connect employers to footprint; site principal vs program principal are distinct semantics. §7 checklist: backfill project junctions, decide `workers.project_id`, decide `parent_worksite_id`, add data-quality checks.
- **Code check:** still an accurate description of the schema; backfills not verifiable from code. Nothing here addresses organiser workflow.

### 1.10 `docs/HOW_TO_VIDEOS_WORKPLAN.md` and `docs/HOW_TO_VIDEOS_HANDOFF.md`
- **Date/status:** Workplan "draft for review" with five decisions "locked" (§0); Handoff last updated 2026-06-10, "FULL CATALOGUE COMPLETE — all 18 component clips + OVERVIEW produced".
- **Purpose:** an 18-clip how-to library for the manual campaign pathway, served in-app at `/help`, recorded on the `develop` deployment against a demo campaign.
- **The organiser workflow the library teaches (WORKPLAN §2 "Suggested learning path" and §4.2 spec cards):**
  1. A1 Add an employer (`/employers` → "Add Employer"; category; parent company Standalone / existing / new).
  2. A2 Add worksites (`/worksites` → "Add Worksite"; Type; Principal Employer vs Operator — "the part users get wrong"; "Parent Worksite: None (standalone)"; Offshore toggle; map).
  3. A3 Import workers (`/workers` → "Import Workers"; 11-step wizard: Upload → Map Columns → Map Values → Assessments → Employer → Worksites → Occupations → Review Rows → Dedup → Confirm → Done).
  4. A4 Create a campaign the manual way (`/campaigns` → "Create campaign" → "Manual create" → `/campaigns/new/manual` → "Create and open settings"; "The guided wizard is a separate guide").
  5. A5 Configure from Settings (accordion: Basics, Employers & Worksites, Agreements, Worker Estimate, Organising Units, Workers, Ambitions; "Settings is your campaign's control panel; fill sections in any order").
  6. B1 Units, groups, subgroups explained (OU types shift / department / worksite / crew rotation / work area / network / ethnic community / accommodation / job type / custom; group container = named header, "Workers are never assigned to a group container"; exclusivity: one group per unit-type per campaign).
  7. B2 Create units and groups (single vs group mode; HANDOFF: "Add unit" is a single-screen form; per-unit rule row = the rule-based builder).
  8. B3 Allocate workers ("Assign workers"; primary vs additional; drag to move, Shift+drag to copy; multi-unit indicator).
  9. C1 Read the wall chart (unit card: name, type, count, estimate; tile: initials, rating colour, role badge Contact/Activist/Delegate, non-OA union badge, multi-unit indicator, in-build-list check; empty/greyed slots = unfilled estimate; nested sub-unit cards; click → detail sheet).
  10. C2 Filter, sort, switch views (filters: membership, employer, worksite, roles, occupations, rating; assessment selector Cumulative vs specific; Wall chart vs List).
  11. C3 Build a list and "fire" it (drag tiles/unit headers into a list; Purpose Email / Phone / Activist task; leader slot for Activist task) — "the hinge between the wall chart and all tasking".
  12. E1 Rating scale (0 Unassessed grey; 1 Supportive leader sky blue; 2 Supporter green; 3 Neutral amber; 4 Opposed red; 5 Oppositional leader dark red; "Unassessed is a real, visible category").
  13. E2 Create an assessment (template/custom; binary vs 1–5; link to ambitions).
  14. E3 Rate workers (table cell, bulk, inline popover on the chart; "Ratings drive the colours, the filters, the call order, and your strength snapshots").
  15. D1 Email tasking; D2 Build call list + script (call order Sequential / By Rating / By Assessment Rating / Least Recently Contacted / Random); D3 Run a calling session (dial outcomes, script stepper, CTA and assessment ratings, notes → next contact); D4 Activist task lists + leader webform (5-step dialog Anchor → Leader → Activity → Workers → Options; leader rates followers on `/leader/task/[token]`).
  - OVERVIEW §4.3 chapter 7: "How it all loops: ratings from tasking flow back to the wall chart and strength snapshots."
- **Decisions relevant to us:** the manual path is the taught default ("Manual pathway only", §4.1 Constraints); the wall chart is "the campaign's operational picture" (§4.3); a context-aware help drawer matched on `associatedRoutes` was designed (§5.2) with C1–C3 weighted high on `sub=wall-chart`; demo account needs "permissions to create campaigns and write ratings" (§0.3).
- **Handoff lessons (§3, §5, §7, §9):** wall-chart tiles are "below the summary/distribution blocks" so every clip had to scroll them into view; the wall-chart List view and assessments were empty until `campaign_worker_membership` was seeded — "membership is via campaign_worker_ou (OU allocation), but the wall-chart List view + some features query a campaign SCOPE/UNIVERSE that the seed did NOT populate"; D4 lives on Plan & Execution → Task Lists, per-list action is "Generate link" not "Send to leader"; the email composer cards ignore synthetic clicks in headless; the auth `getSession()`-at-mount deadlock was the production "connection dropout".
- **Code check:** `/help` hub and 19-clip manifest present. In-page context drawer not found in the help directory (not exhaustively verified).

### 1.11 `docs/SMS_HUB_UX.md`
- **Date/status:** committed 2026-09-02 and 2026-09-04; shipped.
- **Purpose:** rationale and layout of the org-wide SMS hub at `/sms` ("SMS Tools") — the most recent worked example of a UX decision pattern.
- **Decision patterns worth reusing (§Why this shape, §Layout):**
  - "One list, not five tabs" — replaced a kind-tab strip stacked on a campaign-scoped tab strip with one table plus chips; "An organiser looking for 'the thing I set up yesterday' does not think in table names"; status buckets in organiser words: Live / Drafts & paused / Finished.
  - "Scope is a decision, not a filter" — creation is a wizard asking what you want to run, then where it belongs; each scope option "stated as its consequence ('wall-chart lists, assessments and campaign reporting stay off') rather than as data model".
  - "The editor opens in place" — no bounce to the campaign page; standalone work uses a hidden episode campaign created first and discarded if unsaved.
  - "Numbers are a first-class page"; header = title + one-line purpose + three-pill section nav + one primary button; snapshot tiles; "Start something" cards "leading with the job ('Get an answer from each person') over the mechanism"; pure helpers with tests; read-only batched APIs.
- **Code check:** `/sms`, `/sms/new`, `/sms/inbox`, `/sms/numbers` and the `/campaigns/sms-tools` redirect exist.

### 1.12 `docs/REPO_ORIENTATION_AND_SAFETY_GAPS.md`
- **Date/status:** 2026-04-20 snapshot.
- **Purpose:** orientation and safety gaps.
- **Relevant:** §1 single app; planner absorbed under `/campaigns/[id]/plan` with `/planner/*` redirects. §6 three roles admin / user / viewer, RLS everywhere. §8a RLS oversharing via `is_assigned_to_campaign()`'s unconstrained agreement join. §8f "`/campaigns/[id]/page.tsx` is a large client component with 8+ tabs, all queries, and inline dialog state." §8g CrossAppBanner is a placeholder. §8 incomplete: "Worksite parent/child hierarchy in schema; UI underdeveloped", projects "future functionality", "Organiser workload dashboard is partial". §10 no automated tests. §11 recent wall-chart work (in-chart assessment creation, HSR badge, task creation from worker drawer); auth/session "most fragile".
- **Code check:** consistent; the campaign page has since grown further (8 top-level tabs, ~20 sub-tabs).

### 1.13 `WORKLOAD_DASHBOARD_README.md`, `QUICK_START_WORKLOAD_DASHBOARD.md`
- **Date/status:** migration `20260402190000_workload_dashboard_views.sql`; "fully implemented".
- **Purpose:** Organiser Workload Dashboard as "the central element of the Organising DB landing page".
- **Decisions:** four metrics (campaigns by stage, ambition progress from gate criteria, worksites/employers/workers/leaders per campaign, activities underway); filters Organiser "Me Only" vs "My Team" "(uses created_by field)", status, period; drill-down to `/campaigns/{id}`; sidebar "Workload" link (README §Pages 12); future: saved filter presets, mobile view, real-time (§Future Enhancements). Lists `campaign_ous` / `campaign_ou_leaders` as leader sources (§Database Schema Used).
- **Code check:** `/dashboard` renders the workload section (`dashboard/page.tsx` 317–351, default filter "team"); `/workload` route exists; no sidebar entry for `/workload` at HEAD; `/` now redirects to `/campaigns`, so the "landing page" premise no longer holds. REPO_ORIENTATION §8 calls the dashboard "partial".

### 1.14 `docs/Offshore_Alliance_SOC_Field_Guide_v3.docx` — summarised in §4 below.

---

## 2. Consolidated pain points about organiser UX (previously identified)

Campaign setup
1. Two divergent creation paths capturing the same data inconsistently; worker estimate demanded before employers/worksites chosen. [campaigns-review §What this work was for]
2. Three parallel scope mechanisms — "Which one do I use? All of them?" [STREAM3_1 UX_IMPACT §B1; OVERLAP §1.3]
3. Three ways to add workers to a campaign — "Which should I use? Are they the same?" [UX_IMPACT §B2]
4. Six-step creation with OU creation as a step; "Removed: Organizing Units complexity" as the fix. [UX_IMPACT §C2]
5. `campaign-wizard.tsx` is "one of the largest and slowest components in the app". [incidental-issues #2]

Chrome and navigation
6. Stage planning pages stacked 4–5 headers; "users on stage planning pages… have already flagged that the chrome stack is too heavy". [campaigns-review §What this work was for; incidental-issues #1]
7. Decorative global search bar. [incidental-issues #1] — removed.
8. Campaign detail is one very large client component with 8+ tabs and all queries. [REPO_ORIENTATION §8f] — now 8 tabs / ~20 sub-tabs (code).
9. Cross-app context switching; "Users may forget which app does what". [stream3-4 UI_OPTIONS §1.4] — the merge removed the tab switching but the planner remains its own route tree.
10. SMS: a kind-tab strip on top of a campaign-scoped tab strip; organisers "do not think in table names"; "Send as" select mixed nothing / standalone / campaign and gated the editor. [SMS_HUB_UX §Why this shape]

Wall chart
11. Tiles could not be reallocated except via the detail sheet; relationships one at a time; unit-mates invisible when linking. [WALLCHART_V2 intro] — fixed.
12. Two role dropdowns for the same worker in the wall-chart sheet. [harmonisation §1.3, §1.8] — fixed.
13. Tiles sit below summary/distribution blocks; every clip had to scroll them into view. [HANDOFF §3 C-series fix]
14. Wall chart List view / assessments empty unless `campaign_worker_membership` is populated; OU allocation alone is not enough; scope vs membership confused even the seed author. [HANDOFF §5, §7 E3]

Units and groups
15. Unclear whether OUs are subsets of the universe, whether a worker can be in multiple OUs, whether an OU member can be outside the universe. [OVERLAP §8]
16. OUs and task lists disconnected; leader counts derived from task lists rather than roles. [harmonisation §1.6 Current Gaps, §1.8]
17. Multi-unit workers and primary-vs-additional assignment need a whole clip to explain. [WORKPLAN §4.2 B3]

Roles and leaders
18. Three overlapping leadership-role systems; `engagement_level` a dead field; no automation between tasking, role and rating; rating defaults split between DB and frontend. [harmonisation §1.8]
19. Ambiguity over who counts as a "leader" for linking (delegates only vs activists/contacts). [WALLCHART_V2 §Open questions 2]

Reference data
20. Projects tab empty ("Useless tab"); principal employer invisible on the worksite Employers tab ("Where's Woodside?"); agreements show no coverage; dashboard has empty sections; worker profile fragmented across tabs. [UX_IMPACT §A2–A6; EXEC §User Impact]
21. "Principal Employer vs Operator — the part users get wrong." [WORKPLAN §4.2 A2]
22. Organiser accounts not linked to an organiser record → campaign list not scoped to the user. [code: `campaigns/page.tsx` ~413]

Strategic-planning coupling
23. No connection between strategic plans and operational activities. [OVERLAP §9] — partly addressed (ambition rollups, W2P ↔ ambition links).
24. Manual re-entry between planning and execution; manual status updates. [stream3-4 README §Problem Statement] — the sync layer was never built.

---

## 3. Previously proposed but not implemented (relevant to our goals)

| Idea | Source | Status / stated reason for deferral |
|---|---|---|
| Deprecate `campaign_universe_rules`; computed reach pattern; one scope mechanism | STREAM3_1 RECOMMENDATIONS §B1.1; UX_IMPACT §B1 | Proposed; the "decision meeting" was never recorded. Partially superseded: rules demoted to optional action labels, not removed. |
| Consolidate worker↔campaign to `worker_campaign_connections` | RECOMMENDATIONS §B1.2; OVERLAP §7 | Proposed; noted con "some data loss (OU structure flattened to tags)". Not done; three tables coexist. |
| Remove the Organising Units tab / concept | UX_IMPACT §B2, §C2 | De facto rejected — OUs became the central structure (groups, 3-level depth, rules, split/merge). |
| Show universe → OU hierarchy; validate OU members are in the universe | OVERLAP §8 | Not built as UI; `sync-campaign-universe.ts` does the inverse (universe membership auto-creates OU placement). |
| Drop or populate `parent_worksite_id`; worksite tree view / breadcrumbs / network graph | RECOMMENDATIONS §B1.3; STREAM3_2 CURRENT_STATE §10, IMPLEMENTATION_PLAN §1.6, §2.4 | "Decision Required"; never taken. |
| Contracts-centric model; 3-step campaign creation with live worker-count preview; saved searches; bulk actions | RECOMMENDATIONS §C; UX_IMPACT §C2, §C5 | "Defer C… plan properly" (EXEC §Recommended Approach). Live count landed narrowly as `step-worker-estimate.tsx`. |
| Auto-link new unit members to the unit's delegate | WALLCHART_V2 §Open questions 1 | "Needs product sign-off on semantics… Flagged for future plan." |
| Manual `sort_order` within a unit | WALLCHART_V2 §Out of scope | "Current sort is filter-driven." (`display_order` now exists on units, not workers.) |
| Touch/pointer DnD via `@dnd-kit` | WALLCHART_V2 §Dependency decision | "If tablet/touch becomes a requirement later." |
| Cross-campaign worker moves | WALLCHART_V2 §Out of scope | Out of scope. |
| Shared workspace with a Management / Planning mode toggle persisted per campaign | stream3-4 UI_OPTIONS §4; DATA_MODEL §3.2 | "Evolutionary path"; never built. |
| Overview / Planning / Execution three-tab campaign page | UI_OPTIONS §3.2; PHASED_PLAN §3.3.2 | Long-term Option C; the actual page went to 8 tabs instead. |
| Plan-status → campaign-status trigger; timeline auto-calc from agreement expiry; capacity gaps → actions; management systems → recurring actions; gate-outcome notifications | PHASED_PLAN §2.3; DATA_FLOW §2.5–2.7 | Scheduled Apr–Jun 2026; none present. |
| Merge with `/organising/*` + `/planner/*` prefixes and "unified search" | STREAM3_3 RECOMMENDATION §Architecture Overview | Merged differently (`/campaigns/[id]/plan`); unified search not built. |
| Task-list dialog defaulting to an OU picker; "create OU from this list" | harmonisation §2.5 Phase 5 | `create-task-list-dialog.tsx` references `ou_id`; extent not verified. |
| Extract `useCampaignWizardEdits` to remove wizard/settings duplication | campaigns-review §Phase 4 Compatibility note | "If the duplication becomes painful." |
| Command palette / cross-entity search to replace the removed bar | incidental-issues #1 | Not built. |
| Context-aware help drawer on every page (route-matched clips) | WORKPLAN §5.2 | Only the `/help` hub shipped (drawer not found; not exhaustively verified). |
| Workload dashboard: saved filter presets, mobile view, real-time | WORKLOAD README §Future Enhancements | Not built; dashboard "partial" (REPO_ORIENTATION §8). |
| Hierarchy to answer "which contractors work across multiple sites… where to find contractor representatives" | STREAM3_2 INDUSTRY_CONTEXT §7.3 | Not built. |

---

## 4. Organising methodology — SOC Field Guide v3 (Reveille Strategy; "Applied to the Monadelphous shutdown campaign")

What the guide is: a conversation-structure field guide for organisers and delegates, worked against one live campaign. It is not a data-model or software spec; it never uses the words "wall chart", "unit", "universe", "structure test", "activist" or "contact". The summary below separates what it says from what it implies.

**(a) Vocabulary the guide uses**
- Structured Organising Conversation (SOC): eight stages — 1 Introduction, 2 Build rapport, 3 Identify issues, 4 Agitate, 5 Hope, 6 Action (CTA), 7 Inoculation, 8 Close + next steps (§3; Appendix). Two underlying dynamics: open → closed questions; safe → challenging (§4).
- Hope frames: "Opportunity of a lifetime", "The plan", "Don't take the lolly" (§6). EAR objection handling: Equalise, Acknowledge, Redirect (§8). Pitfalls: over-talking, solving instead of organising, skipping inoculation, recruiting on perks (§9).
- People: worker; organiser (external, "you"); delegate ("We need a delegate on this crew… Will you take it on?" §5.6; "permanent delegate structure", §10.4); "member organisers" (§1); company-side crew lead / supervisor (§5.7). No leadership ladder beyond delegate is named.
- Reads (the guide's equivalent of ratings): population read — Permanent workforce / Experienced shutdown worker / Green hat (§2.3, §7.1); sentiment read — Happy / Unhappy / Manipulable (§7.2), explicitly "not labels. Re-read each time." Commitment states: soft yes vs pinned-down commitment vs no/stall (§5.6). "Who is leading their crew, who is leading the wrong way" (§10.2) is the nearest thing to a supportive-leader / oppositional-leader scale.
- Structure tests: not named. The functional equivalents are (i) the ballot maths — electorate ≈ 554, company needs ≈ 278 yes, i.e. ≈ 83% of the 300 incoming (§2.4); (ii) the graded CTAs — vote no; sign up now on my phone; have the same conversation with the four on your crew this week; come to Thursday's briefing; take on the delegate role (§5.6); (iii) density — "a campaign with half the workforce having had a thirty-minute SOC will outperform one with a quarter of the workforce having had an hour" (§10.2).
- Mapping / wall chart practice: "Begin worksite mapping" during rapport; "Every name they mention is a node on the chart you're building in your head" (§5.2); "Map relentlessly. Know who has had a conversation, who hasn't, who is still soft, who is leading their crew, who is leading the wrong way" (§10.2); delegates "know who the leaders are on every crew, who is wavering… They're your map" (§10.4); debrief question "What did I learn about the worksite that goes into the map?" and "Capture the answers in your tracking system. Patterns across conversations are how a campaign learns… debrief daily, not weekly" (§11.2).
- Universe: the word is absent; operationally it is the three populations on one worksite voting in one ballot (§2.3).

**(b) The organiser's day-to-day loop**
Study the SOC before a swing (§1) → find workers off-site — camp common room, smoko, bus, gym, laundry, the walk to the gate; "the workplace itself is the most surveilled location" (§10.3) → run the eight stages, placing the worker's population and sentiment as you go (§5.2, §7) → leave with a specific, time-bound, proportionate commitment and a locked-in next contact ("I'll catch you at smoko on Thursday", §5.8) → inoculate before closing (§5.7, §5.8) → debrief every conversation against the nine questions in §11.2 and record it → roleplay agitation, the CTA and the three hope frames with other organisers/delegates (§11.1) → repeat for density across all three populations, working through delegates as "the front line into the permanent workforce" while organisers focus on incoming workers (§10.4). The loop is tight because the ballot date is fixed by the company (§10.1).

**(c) How the guide expects workers to be grouped**
- Primary grouping is population on the worksite: permanents (254) vs experienced shutdown hands vs green hats among the ~300 incoming (§2.3, §7.1) — a classification by tenure/experience and contract status, not by employer, classification or occupation.
- Secondary grouping is the crew: "Who are you crewing with?" (§5.2); "the four blokes on your crew" (§5.6); "who is leading their crew" (§10.2); "We need a delegate on this crew" (§5.6); delegates know "the leaders on every crew" (§10.4). The crew is the unit of leadership, of the peer-conversation ask and of delegate coverage.
- Shift/swing is a cadence ("next swing", §5.7) rather than a named group; camp/accommodation is conversation territory (§10.3), not a unit.
- Cross-group solidarity is a stated objective — the company's plan "only works because the three populations vote in different directions" (§10.5) — so the organiser must see coverage and sentiment per population and per crew.
- Not covered: worksite vs employer hierarchy, occupation/classification groupings, a numeric support scale. The guide's states are population, sentiment, commitment and next-contact date.

**(d) What this implies for the software**
A per-campaign map of named workers with: population and crew; crew leader / delegate; whether an SOC has happened; sentiment read; the issue with heat; objections met; the specific commitment and the next-contact date; and density counts per population and crew against the ballot maths. The app's wall chart + units + assessments + relationships + task lists cover most of this, but the guide's grain (crew and population; commitment plus a dated next contact) is finer and more time-bound than the app's rating-centric tile, and its population classification has no direct OU type (closest: `crew_rotation`, `custom`).

---

## 5. Contradictions a new plan must resolve

Between documents
1. **Units in or out.** STREAM3_1 Options B/C propose removing organising units ("[REMOVED] Organizing Units tab (concept deprecated)", UX_IMPACT §B2); harmonisation §2.5, campaigns-review Phase 2, WALLCHART_V2, the OU migrations (June) and the how-to library (B1–B3) all treat OUs as central. Retire the removal recommendation explicitly.
2. **What "universe" is.** STREAM3_1 wanted the direct tables as the single mechanism; stream3-4 designed sync from `campaign_universe_rules` (INTEGRATION_MAP §3.1B); the campaigns review kept universes as action labels; today `campaign_employers`/`campaign_worksites` plus `sync-campaign-universe.ts` define the universe and auto-place workers into employer/worksite units. One definition is needed before "universe → groups → units" can be drawn.
3. **Which table means "in this campaign".** STREAM3_1 said consolidate to `worker_campaign_connections`; the HANDOFF shows `campaign_worker_membership` is what the wall-chart List/assessments read; `campaign_worker_ou` is what allocation writes; phone paths use `worker_campaign_connections`. Pick one source each for "in the campaign" and "in a unit".
4. **Default creation path.** The campaigns review made the wizard default to `bargaining` with a planner handoff as its last step; the how-to library teaches the manual path and calls the wizard "a separate guide". "Standalone by default" aligns with the library, not the wizard.
5. **Planning as spine or module.** STREAM3_3 / stream3-4 pushed toward tighter planner integration (embedded → unified, three-tab page, auto-sync); the campaigns review then built P2W/B2W stage machinery into the campaign page; the June `standalone_activities` stage-0 bucket and the `is_standing` / `is_sms_episode` flags show the app already needs "campaigns without a plan". No document decides whether planning is optional.
6. **Who is a leader.** WALLCHART_V2 links to delegates, activists, contacts, bargaining reps and HSRs; harmonisation says HSR is not a leadership indicator; the June revert refuses Contact → Activist promotion while the April doc required it; the SOC guide speaks only of delegates and crew leaders. Define "leader" once for linking, tasking, WOC rostering and the guide's vocabulary.
7. **Landing page and "my campaigns".** WORKLOAD_README made `/dashboard` the landing page; code lands on `/campaigns` (row click → wall chart). The workload "Me Only" filter uses `created_by`, the campaigns list uses `campaigns.organiser_id`, RLS uses `campaign_organisers` plus agreement assignment (REPO_ORIENTATION §8a) — three definitions of "my campaigns".
8. **Navigation model.** STREAM3_3 promised unified search; the campaigns review removed search; SMS_HUB_UX added a module hub with its own three-pill nav. The app now mixes global side-nav modules (SMS Tools, Email Inbox) with campaign-scoped tabs (Outreach → SMS / Comms) over the same data.

Between documents and code
9. **DnD library.** HANDOFF §3 says C3's drag was rewritten "since Playwright's HTML5 dragTo() doesn't trigger dnd-kit"; the wall chart uses native HTML5 DnD (`dnd.ts`), and `@dnd-kit` appears only in `SectionWhereToPlayPanel.tsx`. The library's description of the wall chart's DnD is wrong or refers to a since-replaced build-list implementation.
10. **Cross-unit moves.** WALLCHART_V2 allowed selections to span units for a batch move; code enforces same-dimension-only moves (`fromOuType`) and one-group-per-`ou_type` exclusivity (trigger). A per-group "unassigned" unit must be a member of its group or it will collide with the exclusivity rule.
11. **Chrome reduction outrun.** The campaigns review documents an 8-step wizard and a `validTabs` list; code has a 9-step wizard and an 8-tab / ~20-sub-tab page with `?sub=`.
12. **Which hierarchy is real.** STREAM3_2 and REPO_ORIENTATION describe a worksite parent/child hierarchy "in schema; UI underdeveloped"; the how-to A2 clip teaches "Parent Worksite: None (standalone)"; hierarchy was actually built inside campaigns (employer group → vessel/worksite → shift/crew, `20260612…`). Decide whether organisers ever see a worksite hierarchy.
13. **`campaign_scope`.** STREAM3_1 OVERLAP §1.3 calls it "likely unused"; it is referenced in 5 source files and drives the wizard's single/multi pickers (campaigns review Phase 1).
14. **Workload leader source.** WORKLOAD_README lists `campaign_ous` and `campaign_ou_leaders`; the schema uses `campaign_organising_units.anchor_worker_id`, and harmonisation §1.6 shows `workload_campaign_entities` counting leaders from `campaign_task_lists.leader_worker_id`; since April `campaign_leader_worker_links` also exists. Re-check the dashboard's leader count before reusing it.
15. **Library drift.** HOW_TO D4 spec says "Send to leader"; the UI says "Generate link" (HANDOFF §7). The library drifted from the UI within weeks; any navigation change should budget for re-recording A4–A5, B1–B3 and C1–C3.
