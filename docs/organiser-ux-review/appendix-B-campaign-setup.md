# Campaign creation & setup flow — technical + UX audit

App: `apps/organising-db` (Next.js 16 / React 19 / Supabase). Read-only audit; no files changed.
All paths are relative to `apps/organising-db/` unless they start with `supabase/` (repo root). Line numbers are from the files as read on 2026-09-07. Statements marked **[inference]** are conclusions drawn from the code rather than something the code states directly.

---

## 0. Headline findings

1. **There are four campaign-creation paths, not three.** Guided wizard, OA Planner wizard, manual create, and the campaigns-list "Import lists" wizard (`/api/campaign-import/apply`). Only the import path defaults to `campaign_type: "organising"` (`src/app/api/campaign-import/apply/route.ts:109`); the wizard, manual page and planner all default to `bargaining` (`campaign-wizard.tsx:189`, `manual/page.tsx:46`, `usePlannerCampaigns.ts:495` via planner-wizard).
2. **The wizard writes to the DB from step 1** (`campaign-wizard.tsx:592-596`), so an abandoned wizard leaves a visible shell campaign. It is 9 screens for bargaining / 8 otherwise (`:1432`), with only ~5–6 hard-required inputs, but the **Situation Analysis step is a hard gate for every campaign type** (`:1141-1146`; `step-situation-analysis.tsx:74,118-129`).
3. **A campaign can already exist without a strategic plan.** `campaign_stage_plans`, `gate_definitions`, `campaign_timelines` are separate tables written only by the planner hooks (`usePlannerCampaigns.ts:450-604, 606-775`). Plan coupling lives in UI copy, defaults, and handoffs — not in the schema. There is even a `Phase = 'standalone_activities'` and `STANDALONE_STAGE_NUMBER = 0` already defined (`src/types/planner-types.ts:93-100`).
4. **The unit architecture is three overlapping models:** (a) "dimensions" = all units of one `ou_type` (`step-campaign-units.tsx:673-678`), (b) "groups" = a container OU + member OUs (`supabase/migrations/20260608100000_ou_group_integrity.sql:4-17`), (c) legacy parent/child "sub-units" (`step-campaign-units.tsx:590-608`). The DB's documented target model — *employer group container → vessel/worksite unit → shift sub-unit* (`supabase/migrations/20260612100000_ou_three_level_depth.sql:9-11`) — **cannot be created by the wizard** (employer/worksite/job_type are excluded from groupable types, `step-campaign-units.tsx:152-161`); only the import route builds it (`campaign-import/apply/route.ts:511-518, 577-592`).
5. **"Unassigned/Unallocated" exists only as a campaign-wide bucket** (`campaign-units-section.tsx:429-438, 1772-1889`; `campaign-wall-chart.tsx:924-926, 1545-1594`). There is no per-group unassigned unit anywhere.
6. **The Settings page reuses the wizard's unit step but drops the group fields** — its unit save inserts without `parent_ou_id`/`is_group_container`/`ou_group_id` (`campaign-settings.tsx:177-181, 515-529`), so a group created in Settings is flattened into unrelated standalone units **[inference from code, high confidence]**.
7. **Universe = `campaign_employers` + `campaign_worksites`.** Workers are pulled in by `syncCampaignUniverseFromEmployersWorksites` — including silently whenever a writer opens the Wall Chart tab (`workforce-board.tsx:52-76`). A second, vestigial universe model (`campaign_universes` / `campaign_universe_rules`) still ships in the UI as "Named universes (optional)… Labels for the Actions tab only" (`src/app/(dashboard)/campaigns/[id]/page.tsx:629-633`).
8. **Organisers (role `user`) can already self-create campaigns** (RLS `supabase/migrations/0002_rls_policies.sql:94-98`; `canWrite` = admin|user `src/lib/supabase/auth-context.tsx:376`). Friction is elsewhere: the planner demands a *lead organiser* (`planner-wizard.tsx:463-466`; `usePlannerOptions.ts:152-153`), assigning another staff member needs an admin (`resolve-campaign-organiser.ts:80-84`), and campaign delete is admin-only at the DB (`0002_rls_policies.sql:101-103`) while the delete button shows for any writer (`campaigns/page.tsx:272-290`).

---

## 1. Entry points, routing and roles

### 1.1 All routes and buttons that start a campaign

| # | Where | What it does | Ref |
|---|---|---|---|
| 1 | `/campaigns` → **"Create campaign"** button (writers only) | Opens a selector dialog with two cards | `src/app/(dashboard)/campaigns/page.tsx:374-383`, dialog `:309-356` |
| 1a | Selector card **"Campaign wizard"** | `router.push("/campaigns/new")` | `:321` |
| 1b | Selector card **"Manual create"** | `router.push("/campaigns/new/manual")` | `:338` |
| 2 | `/campaigns` → **"Import lists"** button (writers only) | Opens `CampaignImportWizard`; its apply route creates a new campaign when `campaignId` is absent | `campaigns/page.tsx:396-403, 301-307`; `src/app/api/campaign-import/apply/route.ts:100-119` |
| 3 | `/campaigns/new?campaign_id=…` (also `agreement_id`, `organiser_id`, `expiry_date`) | Renders the **OA Planner wizard** instead of the campaign wizard | `src/app/(dashboard)/campaigns/new/page.tsx:9-19` |
| 3a | Plan & Execution → Strategy tab "Create Campaign Plan" | `/campaigns/new?campaign_id=X&organiser_id=…` | `src/components/campaigns/campaign-plan-panel.tsx:351, 374-378` |
| 3b | Settings → "Strategic plan" → "Re-run planner setup" (bargaining only) | `/campaigns/new?campaign_id=X` | `campaign-settings.tsx:1182-1188` |
| 3c | Wizard step 9 "Create Campaign Plan in OA Planner" | same URL | `campaign-wizard.tsx:2040-2050` |
| 3d | Agreement detail page | `/campaigns/new?agreement_id=…&employer_id=…` (standalone planner create) | `src/app/(dashboard)/agreements/[id]/page.tsx:624` |
| 3e | Dashboard expiring-agreements list | `/campaigns/new?agreement_id=…&expiry_date=…` | `src/app/(dashboard)/dashboard/page.tsx:645` |
| 4 | Empty-state text on the campaigns dashboard | Link to `/campaigns/new` | `src/components/campaigns/CampaignsDashboard.tsx:205` |
| 5 | Campaign header → Actions → **"Re-run wizard"** | `/campaigns/new?cid=X&edit=1` — opens the wizard in edit mode on step 1 only | `campaign-detail-header-bar.tsx:209-214` |
| 6 | Plan hub `SituationAnalysisCard` "Add/Edit" (when no `onEdit`) | `/campaigns/new?cid=X&step=7&edit=1` | `src/components/campaigns/planning/SituationAnalysisCard.tsx:66-69` |
| 7 | Wizard resume | `/campaigns/new?cid=X&step=N` restores step 2–9 | `campaign-wizard.tsx:146-159, 167-178` |

There is **no sidebar/nav entry** for creating a campaign (grep of `src/components/layout/` for `campaigns/new` returns nothing).

### 1.2 What chooses wizard vs planner vs manual

- `new/page.tsx:11-16`: if any of `campaign_id`, `agreement_id`, `organiser_id`, `expiry_date` is present → `<CampaignCreationWizard/>` (planner-wizard.tsx); otherwise `<CampaignWizard/>`.
- The manual page is a separate route (`/campaigns/new/manual`) and links back to the wizard (`manual/page.tsx:115-121`).
- The planner wizard has two modes: **linked** (`campaign_id` present → adds a plan to an existing campaign, `planner-wizard.tsx:174, 479-490`) and **standalone** (creates a new campaign + plan, `:491-506`).

### 1.3 Who can do it (role checks)

- Client roles: `role = profile?.role ?? "viewer"`; `isAdmin = role === "admin"`; `canWrite = role === "admin" || role === "user"` (`src/lib/supabase/auth-context.tsx:361-376`).
- Wizard: renders "You do not have permission to create campaigns." when `!canWrite` (`campaign-wizard.tsx:1456-1458`); logs a console warning only (`:132-141`). Manual: same gate (`manual/page.tsx:94-100`). Settings: `campaign-settings.tsx:716-722`.
- **Planner wizard has no client-side role gate** (no `useAuth` in `planner-wizard.tsx`); it relies on RLS.
- DB (RLS): `campaigns` insert/update allowed for `get_user_role() IN ('admin','user')`, delete admin-only (`supabase/migrations/0002_rls_policies.sql:77-106`). Planning tables use `can_write_to_campaign()` = admin OR creator OR lead organiser for campaign OR assigned OR explicit edit permission (`supabase/migrations/20260402035940_permission_system.sql:189-197`), extended for standing campaigns (`20260612100000_standing_campaign.sql`). `campaign_ou_candidates` writes: admin/user (`20260408200100_ou_discovery_schema.sql:63,68`).
- API routes reject `role === 'viewer'`: `src/app/api/campaigns/[id]/add-workers/route.ts:68-78`, `sync-universe-workers/route.ts:30-40`.
- **Permission-model inconsistency:** the `campaigns` row itself is writable by any `user` (coarse policy), while planning child tables use the finer `can_write_to_campaign`. So any organiser can edit any campaign's basics but may be refused on its plan **[inference]**.
- Organiser assignment: `resolveCampaignOrganiserId` auto-creates an `organisers` row for **yourself** (`resolve-campaign-organiser.ts:86-103`) but **throws for non-admins assigning another staff member without an organiser record** (`:80-84`).
- Planner "Lead Organiser" list = `user_profiles.work_role = 'lead_organiser'` with non-null `organiser_id` (`src/lib/hooks/usePlannerOptions.ts:143-170`, filter at `:152-153`); submit requires one (`planner-wizard.tsx:463-466, 1143`). Default: URL param → existing campaign's organiser → self if lead → your `reports_to` manager (`:320-346`).

---

## 2. Step-by-step flows

### 2.1 `campaign-wizard.tsx` (guided wizard) — 9 steps (8 for non-bargaining)

Step titles: `campaign-wizard.tsx:1420-1430`; `totalSteps = campaign_type === "bargaining" ? 9 : 8` (`:1432`). Each step is its own DB write; navigation is `router.replace('/campaigns/new?cid=…&step=…')` (`:167-178`). Leaving mid-flow triggers `beforeunload` (`:1356-1364`) and a `window.confirm("Save your current step's progress before leaving the wizard?")` on SPA navigation (`:1371-1415`).

| Step | Screen | Inputs (R = required) | Writes | On continue |
|---|---|---|---|---|
| 1 | **Basics & scope** (`:1495-1794`) | Name **R** (`:1506-1512`); Description (`:1513-1520`); Campaign type: bargaining/organising/mobilisation/political, default **bargaining** (`:1522-1540`, `:189`); EA subtype: new/replacement/boss_initiated (`:1541-1568`, labels `src/lib/campaign/constants.ts:52-56`); *bargaining only* "Where is bargaining at?" not_started/underway/advanced (`:1577-1604`); Status: planning/active/completed/suspended, default planning (`:1607-1625`); Organiser (auto-defaults to current user, `:1626-1634`, `campaign-organiser-select.tsx:64-69`); Start date (`:1636-1643`); "Campaign plan timeframe" mode weeks/months/custom + number/date (`:1644-1705`, helper `:95-118`); Campaign scope **R** — 4-value enum (`:1706-1733`, `:73-78`, labels `constants.ts:45-50`); Sector-wide campaign checkbox (`:1734-1753`); Notes (`:1754-1761`). Validation `step1Valid = name && campaign_scope` (`:1434-1436`). | `createCampaignMutation` **inserts `campaigns`** with name, campaign_type, status, sector_wide + optional description, start_date, end_date (computed), plan_timeframe_weeks, organiser_id (resolved), notes, campaign_scope, enterprise_agreement_subtype, wizard_bargaining_triage (`:556-611`). In edit mode `updateCampaignMutation` (`:613-665`). | → step 2 with new id (`:606`). Edit mode → `/campaigns/:id` (`:656-658`). |
| 2 | **Employers & worksites** (`step-employers-worksites.tsx`) | Employer list (radio when single-employer scope, `:60-64, 823`); "Sector-wide worksites (no specific site)" checkbox (`:831-841`); Worksite list, gated behind employer selection for single-employer & multi/multi scopes (`:667-669, 886-889`); site-first ordering for multi-employer-single-site (`:72-74, 703-783`); "Add employer"/"Add worksite" dialogs (select existing or create — inserts `employers`/`worksites`, `:415-503`, and links via `employer_worksite_roles` upsert `:505-523, 566-586`); "Import workers" (`:1010-1020`). **R:** ≥1 employer OR ≥1 worksite OR sector-wide (`:658-659`). Button label defaults to **"Continue to workers"** (`:970`) although the next wizard step is Agreements. | `saveScopeMutation`: delete-all then re-insert `campaign_employers`, `campaign_worksites` (sector-wide = row with `worksite_id null, sector_wide true`, `:697-703`); upserts `agreement_employers` when a replaced agreement is set (`:681-694`). **No universe sync call here.** (`campaign-wizard.tsx:667-720`) | → step 3 |
| 3 | **Agreements** (`step-agreements.tsx`) | Optional (`:356-360`). Search list ordered "linked first" (`:162-176`); per selection: relationship_type replaced/new/related (default related `:189-198`) and a per-bucket "primary" star (`:207-214`); "Create new agreement" dialog inserts an `agreements` row with status Expired or Under_Negotiation (`:126-154`). | `saveAgreementsMutation`: delete + insert `campaign_agreements` with sort_order (`campaign-wizard.tsx:722-747`). A DB trigger mirrors to legacy `campaigns.replaced_agreement_id` (comment `:588-590`). | → step 4 |
| 4 | **Worker estimate** (`step-worker-estimate.tsx`) | Live count of active workers in scope (`:60-133`, limit 10 000); suggested = count×1.1 rounded up to 10 (`:136-140`) auto-filled (`:143-146`); one number input (`:240-269`); variance warnings (`:271-299`); "Import workers" (`:221-237`). Never blocks. | `campaigns.total_worker_estimate` (`campaign-wizard.tsx:749-765`) | → step 5 |
| 5 | **Campaign units** (`step-campaign-units.tsx`) — see §4 | "Build from scope" toggles (one unit per employer / per worksite, even estimate split `:323-379`); "Add a group of units" 4-phase flow (`:463-557, 722-1000`); "Add a single unit" (occupational grouping / occupation / custom, `:383-459, 1003-1071`); per-unit name + estimate, "Sub" (legacy sub-unit `:590-608`); inline per-group worker allocation (`:1467-1704`); dimension sums/warnings (`:612-640, 1080-1105, 1180-1201`). Never blocks. | `saveUnitsMutation`: diff delete/update/insert on `campaign_organising_units` (parents pass then children `:834-913`, resolves `parent_ou_id`/`ou_group_id` `:810-814, 867-876`); then **in-memory** auto-allocation of scope workers to employer/worksite-basis units (`:935-981`) and proportional re-estimate of those units (`:983-1034`); merges step-5 group pre-allocations (`:1053-1075`). (`campaign-wizard.tsx:767-1081`) | → step 6 |
| 6 | **Allocate workers** (`step-allocate-workers.tsx`) | Candidates = active workers in scope (`:113-173`, limit 5 000). Per row: "on campaign" checkbox (`:661-668`), unit chips + "+ add" picker (`:686-765`); filters incl. "Unallocated (on campaign)" (`:511-524`); bulk bar: Add/Remove from campaign, allocate selection to a unit or "Unallocated (clear units)" (`:527-583`); cross-group conflict warning (`:346-385, 585-608`); footer per-unit counts + "Unallocated: N" (`:781-809`); import (`:830-844`). Button "Next step" (`:825`). Never blocks. | `saveWorkersMutation`: delete + insert `campaign_worker_membership`; **delete all `campaign_worker_ou` rows for the campaign's units and re-insert** (`:1096-1121`, so rule/is_primary metadata is lost); `stampEmployerWorksiteFromOu` mutates global `workers.employer_id/worksite_id` (`:1123-1131`); `syncWorkersToMatchingCampaigns` adds these workers to **other** campaigns (`:1132-1134`). (`campaign-wizard.tsx:1083-1148`) | → step 7 ("runs for every campaign type", `:1141-1146`) |
| 7 | **Situation analysis** (`step-situation-analysis.tsx`) | `SurveyPanel` with 7 sections (`situation-analysis/SurveyPanel.tsx:128-167`, titles `:204,229,293,311,330,346,367`): 1 State of employer interaction **R** (11 states, `src/lib/situation-analysis/constants.ts:11-77`), 2 Top workplace issues **R** (≥1 label), 3 Upcoming workforce changes, 4 Employer relationships, 5 HR / employer rep posture, 6 Workforce union history, 7 Bargaining context (NERR status **R** when triage is underway/advanced, `:92-94, 158-166`; prior ballots ×7 fields, key disputes, support estimate). Plus `AiAssistPanel` and `AiChatPanel` (`step-situation-analysis.tsx:101-111`). Gate: `isSituationAnalysisComplete` (`src/lib/situation-analysis/types.ts:251-262`; button `:118-129`). Triage pre-fills the state (`:66-72`). | Upsert of the single `is_current` row in `campaign_situation_analyses` (~22 columns) (`campaign-wizard.tsx:1150-1222`) | → step 8 |
| 8 | **Campaign ambitions** (`step-campaign-ambitions.tsx`) | 4 categories (membership, member_leaders, activism, industrial_outcomes `:63-68`) × templates (`:81-156`, 11 templates + custom); each ambition: label, target, unit, by-date, notes (`:432-503`); baseline "Starting point" from current members (`:204-282`). **"Skip for now"** (`:557-561`). | Diff delete/update/insert on `campaign_ambitions` (`campaign-wizard.tsx:1224-1321`) | bargaining → step 9; others → `/campaigns/:id` (`:1315-1319, 1916-1922`) |
| 9 | **Create campaign plan** (bargaining only, `campaign-wizard.tsx:1927-2062`) | Three branches: `post_settlement` → "Go to campaign overview" (`:1937-1965`); triage underway/advanced → "Launch Bargaining to Win setup" → `/campaigns/:id/bargaining-wizard?mode=standalone&from_wizard=1` or "Skip for now — go to campaign" (`:1967-2015`); default → "Create Campaign Plan in OA Planner" → `/campaigns/new?campaign_id=X&organiser_id=…` or "Skip for now" (`:2018-2061`). Copy: "OA Planner uses a 'Playing to Win' methodology with six campaign stages and five gate assessments" (`:2036-2037`). | nothing | overview / planner / B2W wizard |

**Where the user lands:** non-bargaining → campaign Overview (`/campaigns/:id`); bargaining → step 9 card → Overview, OA Planner wizard, or Bargaining-to-Win wizard.

**Field / decision count (wizard).** Hard-required: name, scope (step 1); ≥1 employer/worksite/sector-wide (step 2); employer interaction state + ≥1 top issue (step 7); + NERR status when triage underway/advanced. That is **5–6 mandatory inputs across 9 screens**, plus 8 "Continue" clicks and 1 routing decision. Distinct controls presented (excluding repeated rows): step 1 = 13 (12 non-bargaining); step 2 ≈ 5 + 2 dialogs (each with 2 tabs); step 3 ≈ 3 + create dialog (2); step 4 = 1; step 5 ≈ 2 toggles + group flow (type, name, count, N names, N estimates, plus allocation table) + single add (3) + per-unit (name, estimate, sub, delete); step 6 ≈ 4 filters + 6 bulk controls + per-worker 2–3; step 7 ≈ 25+ discrete inputs; step 8 = 4 category pickers × 5 fields per ambition; step 9 = 1. Roughly **60–80 controls before repeating rows** **[count, approximate]**.

### 2.2 `planner-wizard.tsx` (`CampaignCreationWizard`, "OA Planner") — 3 steps

`STEPS` = Select Agreement, Set Parameters, Configure Timeline (`planner-wizard.tsx:45-49`).

| Step | Inputs | Notes |
|---|---|---|
| 1 Select Enterprise Agreement (`:694-808`) | Radio-style list from `useAgreements` (status Current/Expired/Under_Negotiation, `usePlannerOptions.ts:95-123`). **Required** unless linked mode without replacement subtype / agreement context (`agreementRequired`, `:178-183`; "Continue without agreement" `:793-800`). | Selecting builds a 6-stage timeline backwards from PABO (expiry − 30 d) or forwards (`:354-403`; `buildInitialStageTimeline`). Linked campaigns with a replaced/attached agreement auto-select and skip to step 2 (`:218-311`). |
| 2 Set Campaign Parameters (`:811-947`) | Campaign Name (read-only when linked `:872-881`); Description (read-only when linked `:883-901`); **Lead Organiser (required, lead-organiser-only list)** (`:903-924`); "MSD (Majority Support Determination) Required" switch (`:926-944`). | |
| 3 Configure Timeline (`:950-1117`) | Campaign start date (`:1003-1047`); "Stages already complete" (only if linked + status active, `:967-1001`); per-stage duration in days/weeks for 6 stages (`:1065-1114`); PABO countdown (`:1049-1063`). | |

**Submit (`:462-511`).**
- Linked: `useAddPlanToCampaign` (`src/lib/hooks/usePlannerCampaigns.ts:450-604`) → `campaigns.update({ status: 'active', organiser_id?, start_date? })` (`:469-475`, **status forced to active**); upsert 6 `campaign_stage_plans` (`:486-507`); insert 2 `plan_ambitions` per stage ("Expected new members", "Membership density" = 12 rows, `:517-544`); insert 5 `gate_definitions` (`:546-560`); if agreement/expiry → `campaign_timelines` + `stage_timeline_targets` (`:562-594`). Then `/campaigns/:id` (`planner-wizard.tsx:490`).
- Standalone: `useCreateCampaign` (`:606-775`) → insert `campaigns` {name, description, campaign_type: `existingCampaign?.campaign_type || 'bargaining'` (`planner-wizard.tsx:495`), organiser_id, start_date, **status 'active'** (`usePlannerCampaigns.ts:630`), msd_required} then the same scaffolding. **No `campaign_scope`, no employers/worksites, no units, no situation analysis.** Then `/campaigns/:id` (`:505`).
- Guard: a linked campaign that already `has_plan` (`campaign_stage_plans.length > 0`, `usePlannerCampaigns.ts:415`) is redirected to `/campaigns/:id` (`planner-wizard.tsx:204-213`). A 15 s "Still loading" escape hatch exists (`:186-196, 527-567`).

**Decisions:** 1 agreement pick (or skip), name/description (standalone), lead organiser, MSD toggle, start date, up to 6 durations, optionally completed-stage count ≈ **12 controls; 2 required** (organiser, name) + agreement when required.

### 2.3 `manual/page.tsx` (manual create)

Fields: Name **R**, Campaign type (default bargaining), Status (default planning), Organiser (auto-defaults to self) (`manual/page.tsx:45-48, 137-186`). Inserts `campaigns` (`:58-84`) then `router.replace('/campaigns/:id/settings')` (`:82`). **4 fields, 1 required.** Doc comment: "Captures only the absolute minimum… then redirects straight to /campaigns/[id]/settings" (`:32-38`).

### 2.4 `CampaignImportWizard` ("Import lists")

Not audited in depth (out of the requested file list) but relevant: if no `campaignId`, `/api/campaign-import/apply` inserts `campaigns` with `campaign_type || "organising"`, `status || "planning"`, `organiser_id` (`route.ts:100-119`); upserts `campaign_employers`/`campaign_worksites` (`:301, :306`), membership (`:471`), and — when "Build organising units now — one group per employer, with a unit per vessel, and assign workers automatically" is ticked (default on; `src/components/import/campaign-import-wizard.tsx:236, 1289-1291`) — creates **employer-typed group containers** with `unit_basis {employer_id}` (`route.ts:488-536`) and **worksite-typed member units** with `parent_ou_id = ou_group_id = container`, `unit_basis {worksite_id, employer_id}` (`:538-595`), plus `campaign_worker_ou` assignments (`:650-669`) and a worker list (`:688`). This is the only path that produces the DB's intended three-level model.

---

## 3. The universe model

### 3.1 What a "campaign universe" is

Code definition (`src/lib/workers/sync-campaign-universe.ts:3-12`): "Campaigns declare a universe via `campaign_employers` / `campaign_worksites`. When a worker is placed at an employer or worksite, they should appear in every active/planning (non-SMS-episode) campaign whose universe includes that employer or worksite — and in any matching employer/worksite units." Type `CampaignUniverse = { campaignId, employerIds, worksiteIds }` (`:20-24`); match = employer OR worksite (`:37-48`).

Universe-adjacent fields on `campaigns`: `campaign_scope` (4-value enum; only shapes the step-2 picker, `step-employers-worksites.tsx:60-74, 667-669`), `sector_wide` boolean (step 1, `campaign-wizard.tsx:1734-1753`), plus a **second** sector-wide flag as a `campaign_worksites` row with `worksite_id NULL, sector_wide TRUE` (step 2, `:697-703`; universe section `campaign-universe-section.tsx:333-349`). Nothing in code keeps the two sector-wide flags in sync **[inference]**.

### 3.2 Universe rules — which entities?

- **Effective universe:** employers and worksites only (`campaign_employers`, `campaign_worksites`). Sync ignores the sector-wide row (`.not("worksite_id","is",null)`, `sync-campaign-universe.ts:140, 326`) — so a sector-wide campaign with no employers syncs nothing (`:332-334`) **[inference]**.
- **Agreements:** attached via `campaign_agreements` (relationship replaced/new/related, `src/types/organising-row-types.ts:88-94`) — used for planner timeline/PABO and EA-linked hints (`step-employers-worksites.tsx:354-381`), **not** for worker matching.
- **Occupations / occupation groups / work scopes / shifts / work areas / roster panels / tags:** not universe rules; they appear as unit `unit_basis` keys (`organising-row-types.ts:139-158`) and as per-unit `campaign_unit_rules` dimensions (employer, worksite, occupation, occupation_grouping, shift, work_area, relational, roster_panel; `supabase/migrations/20260414123000_campaign_unit_rules.sql:21-43`; `src/lib/campaign/recompute-ou-assignments.ts:4-20`).
- **Legacy named universes:** `campaign_universes` + `campaign_universe_rules` (`supabase/migrations/0001_initial_schema.sql:241-254`), rule types agreement, worksite, employer, member_role, sector, project, work_type, onshore_offshore (`organising-row-types.ts:296-304`). UI: "Named universes (optional) — Labels for the Actions tab only" (`src/app/(dashboard)/campaigns/[id]/page.tsx:629-633`); create name+description only (`:335-350`); rules are displayed but there is **no UI to add rules** (`:707-719`). Vestigial.

### 3.3 How workers get pulled in (`sync-universe-workers`)

`syncCampaignUniverseFromEmployersWorksites(supabase, campaignId)` (`sync-campaign-universe.ts:297-378`): skip SMS-episode campaigns (`:311`); collect active workers whose `employer_id ∈ campaign employers` ∪ `worksite_id ∈ campaign worksites` (`:336-358`); upsert `campaign_worker_membership` (`:365-366`); place each into every non-container OU whose `unit_basis.employer_id`/`worksite_id` matches, `assignment_source: 'rule'` (`:50-66, 368-377`). Add-only; nothing is removed when scope shrinks **[inference]**.

Triggered from: Settings "Save employers & worksites" (`campaign-settings.tsx:443`), universe section add employer/add worksite (`campaign-universe-section.tsx:255, 312`; **not** on remove `:285-292, 324-331`), and `POST /api/campaigns/[id]/sync-universe-workers` (`route.ts:5-10, 43`) which `WorkforceBoard` fires automatically on mount for writers with a 5-minute staleTime (`src/components/campaigns/workforce/workforce-board.tsx:52-76`). Reverse direction `syncWorkersToMatchingCampaigns` (`:224-286`, planning/active only `:113-114`) is called from wizard step 6 (`campaign-wizard.tsx:1133`) and the add-workers API (`add-workers/route.ts:199`). **The wizard's step 2 never calls sync** — workers enter via explicit step-6 selection, then later via the wall-chart mount.

### 3.4 Universe ↔ units

Units are independent rows; the only link is `unit_basis.employer_id / worksite_id` (created by the step-5 "Build from scope" toggles, `step-campaign-units.tsx:338-345, 367-374`, and by import). Sync places workers into those units only. Everything else (occupation units, custom units, groups, sub-units) is filled manually, by `campaign_unit_rules` + "Recompute rules" (`campaign-units-section.tsx:657-674`), or by WTP suggestions. The universe determines *membership candidates*; units *partition members*; membership without a unit = "Unallocated".

---

## 4. The unit model as seen from setup

### 4.1 Schema

`campaign_organising_units` (`supabase/migrations/0013_campaign_workflow.sql:110-121` + later): `ou_type` (11 values: shift, department, network, job_type, worksite, employer, ethnic_community, crew_rotation, accommodation, work_area, custom — `organising-row-types.ts:111-122`; CHECK widened in `20260503100000_campaign_unit_extensions.sql:16-25`), `name`, `total_workers_estimated`, `anchor_worker_id`, `commonality_logic`, `target_size`, `source` (manual | wtp_seeded | generated | field_discovery, `20260408200100_ou_discovery_schema.sql:9-13`), `unit_basis` JSONB (`20260503100000:27-31`; shape `organising-row-types.ts:139-158`), `display_order`, `parent_ou_id` (`20260524100000_ou_hierarchy_and_worker_dimensions.sql:21-34`), `is_group_container` + `ou_group_id` (`20260608100000_ou_group_integrity.sql:26-44`), `user_rating` (`20260701100000_ou_user_rating.sql`).
`campaign_worker_ou`: UNIQUE(ou_id, worker_id), `is_primary`, `assignment_source` manual|rule, `assigned_rule_id` (`0013:129-136`; `20260414123000:7-10`).
Triggers: container/member consistency (`20260608100000:48-83`), **no workers on containers** (`:89-113`), **one group per `ou_type` per worker per campaign** (`:119-139+`), hierarchy depth = 2 for standalone parents, 3 when the root is a container (`20260612100000_ou_three_level_depth.sql:1-18`), delete-detach fixes (`20260630100000_ou_container_delete_detach_children.sql:1-20`).

### 4.2 Types, hierarchy, groups in step 5

- **Draft shape** `CampaignUnitDraft` (`step-campaign-units.tsx:46-70`): `ou_type`, `name`, `total_workers_estimated`, `unit_basis`, `parent_draft_id`/`parent_ou_id`, `is_group_container`, `ou_group_id`.
- **"Dimension"**: all units sharing an `ou_type` (`:612-615`); copy: "Units of the same type form a dimension — each dimension covers your full worker population independently. Workers can belong to one group per type." (`:673-678`). Per-dimension estimate sums and over-total warnings (`:617-640, 1080-1105, 1180-1201`).
- **Scope units**: toggles create one `employer`/`worksite` unit per selected entity with `unit_basis {employer_id|worksite_id}` and an even estimate split (`:323-379`).
- **Single units**: "Occupational grouping" → `ou_type job_type`, `unit_basis {occupation_group_id}` (`:408-432`); "Occupation" → `job_type`, `{canonical_occupation_id}` (`:434-458`); "Custom" → `custom`, `{custom:true}` (`:389-406`).
- **Groups**: GROUPABLE types = shift, department, crew_rotation, work_area, network, ethnic_community, accommodation, custom (`:152-161`) — **worksite, employer, job_type cannot be grouped**. Flow phases `choose_action → configure → define_members → add_to_existing` (`:165-170, 473-557`): pick type → "Set up group" → (if groups of that type exist: add-to-existing or new, `:482-490`) → group name + member count 2–20 (`:498, 801-861`) → name/estimate each member (`:864-929`) → "Confirm group" creates a container draft (`is_group_container:true`, `unit_basis {custom:true}`, same `ou_type`, `:512-521`) + members with `parent_draft_id` (`:523-532`). Add-to-existing appends one member (`:538-557`).
- **Sub-units** (legacy): "Sub" on any standalone unit creates a `custom` child with `unit_basis {parent_ou_id, dimension:'custom'}` (`:590-608`; badge "sub-unit" `:1256-1261`). On save, any non-container child gets `ou_group_id = parent` even when the parent is not a container (`campaign-wizard.tsx:813-814, 873-876`) — which then subjects it to the group-exclusivity trigger **[inference]**.
- **Rendering**: raw `ou_type` codes are shown as badges (e.g. `job_type`, `:1253-1255`) while pickers use labels (`OU_TYPE_LABELS` `:137-149`).
- **Group allocation panel** (`:1314-1704`): per group, multi-select scope workers and assign to one member unit (single membership within a group, `:1507-1524`; "Remove from group" = `__unallocate__`, `:1518, 1579`); stored in `pendingGroupAllocations` keyed by draft id (`:72-76`) and merged into step 6 (`campaign-wizard.tsx:1053-1075`).

### 4.3 Size estimates and "relative size"

There is **no field called "relative size"**. Sizing is absolute `total_workers_estimated` per unit; scope toggles split the campaign estimate evenly (`step-campaign-units.tsx:334-337, 363-366`); after save the wizard re-estimates employer/worksite units proportionally to actual worker counts (`campaign-wizard.tsx:983-1034`); the step shows "Estimate sum: X / total · Unallocated remainder: Y" or per-dimension "rem." (`:1082-1103`). Post-setup only: `target_size` ("5-50 typical"), `commonality_logic`, `anchor_worker_id` (`campaign-units-section.tsx:1930-1982`), and a 1–5 `user_rating` (`:1266-1300`). The estimate also drives wall-chart placeholder slots (warning copy `campaign-basics-edit-sheet.tsx:207-218`).

### 4.4 Templates

No unit templates in setup. Templates exist for **ambitions** (`step-campaign-ambitions.tsx:81-156`) and post-setup **"Suggested units"** derived from Playing-to-Win "Where to Play" rows of the campaign's stage plans (`campaign-units-section.tsx:1040-1123`; `src/lib/campaign/generate-ou-candidates.ts:28-149`, which reads `plan_where_to_play` via `campaign_stage_plans:32-47`). The campaigns-list "Templates" tab (`campaigns/page.tsx:369-372`, `templates-tab.tsx`) is a comms template editor (imports `TemplateEditor`, `:24`), not a campaign-structure template.

### 4.5 Allocation (step 6) and "unassigned/unallocated" handling

- Step 6 semantics: membership (`campaign_worker_membership`) and unit allocation (`campaign_worker_ou`) are separate; a worker can be on the campaign with zero units → "Unallocated" (`step-allocate-workers.tsx:191-195, 239-253`; copy `:434-440`). Units passed to step 6 exclude containers (`campaign-wizard.tsx:1878`).
- **Every surface implements "unassigned" as a campaign-wide derived bucket (no OU row):**
  - Wizard step 5 synthetic "Unallocated" row, single-dimension only (`step-campaign-units.tsx:1163-1176`).
  - Wizard step 6 filter/bulk target/footer badge (`:517, 568, 805-807`).
  - Units section "Unallocated" pseudo-unit = members with no OU (`campaign-units-section.tsx:429-438, 1772-1889`), with "Assign to unit…" (`:1788-1797, 2108-2230`).
  - Wall chart "Unassigned workers" card, filter key 0 (`campaign-wall-chart.tsx:313, 401-406, 791, 924-926, 1545-1594`).
  - Add-workers page default `unitMode: "unallocated"` (`add-workers-client.tsx:102-112, 422-433`) → API discriminated union (`add-workers/route.ts:22-40`).
  - Wall-chart add-worker dialog "Unassigned (campaign member only)" (`add-campaign-worker-dialog.tsx:453-456, 669-672, 683`).
  - Import wizard "No Unit" (`worker-import-wizard.tsx:3284, 3443`).
- **There is no per-group unassigned.** The nearest thing is the per-dimension "rem." figure in step 5 and the group panel's "Remove from group".

---

## 5. Strategic-plan coupling

### 5.1 Where the wizard forces or assumes planning

| Location | Coupling |
|---|---|
| Step 1 "Campaign plan timeframe" with bargaining-centric help copy (`campaign-wizard.tsx:1644-1650`) | writes `plan_timeframe_weeks` (`supabase/migrations/20260502110000_campaign_plan_timeframe.sql:17-18`) |
| Step 1 default `campaign_type = bargaining` (`:189`) and bargaining triage (`:1577-1604`) | routing to step 9 |
| Step 7 Situation Analysis — **mandatory for all types** (`:1141-1146`; gate `step-situation-analysis.tsx:74`) ; copy references "campaign plan page", "theory-of-winning" (`:80-88`; `SituationAnalysisCard.tsx:90-95`) | hard gate |
| Step 8 copy: "frame the stage planning that follows — every stage ambition can optionally link back" (`step-campaign-ambitions.tsx:347-353`) | assumes stage plans; skippable |
| Step 9 OA Planner / B2W handoff (`:1927-2062`) | bargaining only; skippable |
| `campaigns.current_phase` defaults to `preparing_to_bargain` for every campaign (`supabase/migrations/20260510100000_campaign_phase_enum.sql:17`) | non-bargaining campaigns are nominally in a bargaining phase |
| Planner forces `status: 'active'` (`usePlannerCampaigns.ts:469, 630`) | adding a plan flips status |

### 5.2 Minimum viable campaign today

`campaigns` requires only `name`, `campaign_type` (NOT NULL) and `status` (default planning) (`supabase/migrations/0001_initial_schema.sql:227-239`). Manual create (`manual/page.tsx:66-76`) and the import route (`route.ts:105-114`) already create such rows. **A campaign can exist without a plan, without scope, without units, without workers.**

### 5.3 What shows empty / breaks without a plan

- Campaigns list: "No plan" text in the Campaign Plan column and a link to `/campaigns/:id/plan` (`campaigns/page.tsx:77-80, 255-270`); Planning metric column renders `CampaignPlanningVisual` with empty stage plans (`CampaignsMetricsTable.tsx:256-263`).
- Plan & Execution → Strategy: "No campaign plan yet… Create one to track stage progress, gate assessments, and your Theory of Winning" + "Create Campaign Plan" (`campaign-plan-panel.tsx:348, 361-381`).
- `/campaigns/:id/plan`: renders with `stagePlans = []` (`plan/page.tsx:163-167`) and a "stage 1" link (`:259-260`) into the P2W stage editor (which imports `useInitializeCampaignStagePlans`, `plan/stage/[stageNumber]/page.tsx:5`) **[behaviour of that page not audited]**.
- Overview: `SituationAnalysisCard` "No situation analysis on file yet…" (`SituationAnalysisCard.tsx:90-95`); `CampaignStageCoveragePanel` always renders an 11-column "Section coverage by P2W stage" grid, empty text "No section plans have generated stage mappings yet." (`CampaignStageCoveragePanel.tsx:21-33, 59-71`).
- Units section "Suggest from plan" is a no-op without WTP rows (`generate-ou-candidates.ts:32-49` → 0 candidates).
- Header "View full plan" always shown (`campaign-detail-header-bar.tsx:221-223`); Settings "Strategic plan" accordion only for bargaining (`campaign-settings.tsx:1154-1194`); "Bargaining" tab for bargaining type (`[id]/page.tsx:425-426`).
- Agreements list status badge shows `no_campaign` (`campaign-status-badge.tsx:11, 73`).
- Section plans (`section-plans` tab, `SectionPlansTab.tsx`) do **not** depend on stage plans (no stage-plan gating found in `CreateSectionPlanDialog.tsx`), though they include a P2W `StageMappingPanel`.

### 5.4 Existing hooks for standalone

`Phase` includes `standalone_activities` and `STANDALONE_STAGE_NUMBER = 0` ("ambitions outside the P2W/B2W sequence") (`src/types/planner-types.ts:93-107`). `campaigns.is_standing` is a *different* concept (shared catch-all for phone ops, `20260612100000_standing_campaign.sql:24-29`), as is `is_sms_episode` (hidden per-SMS campaigns, `20260813005937_sms_episode_campaigns.sql`; excluded from lists by `src/lib/campaign/visible-campaigns.ts:12-17`).

---

## 6. Post-setup management surfaces

### 6.1 `campaign-settings.tsx` (`/campaigns/:id/settings`, "All settings")

Accordion, each section saves independently (`:744-746`):

| Section | Contents | Save | Ref |
|---|---|---|---|
| Basics | Name, Description, Type, EA subtype, Status, Organiser, Start date, Plan timeframe, Campaign scope (**"Not set" allowed**), Sector-wide, Notes | `saveBasicsMutation` also writes `total_worker_estimate` | `:756-1001` (scope none `:958`), `:358-399` |
| Employers & worksites | Reuses `StepEmployersWorksites` | delete/re-insert + **universe sync** | `:1004-1030`, `:401-454` (sync `:443`) |
| Worker estimate | Reuses `StepWorkerEstimate` | `total_worker_estimate` | `:1033-1058`, `:456-475` |
| Campaign units | Reuses `StepCampaignUnits` | `saveUnitsMutation` — **no `parent_ou_id`/`is_group_container`/`ou_group_id` on update or insert**; scope query doesn't load them either; `pendingGroupAllocations` never resolved | `:1061-1088`, `:477-554`, `:177-181` |
| Allocate workers | Reuses `StepAllocateWorkers`; units list **does not exclude containers** | delete/re-insert membership + `campaign_worker_ou` (no stamp/sync) | `:1091-1125` (`:1110-1117`), `:556-605` |
| Campaign ambitions | Reuses `StepCampaignAmbitions` (no skip) | diff save | `:1128-1151`, `:607-696` |
| Strategic plan (bargaining only) | "Open plan" (`?tab=campaign-plan`), "Re-run planner setup" | — | `:1154-1194` |

Missing from Settings: **Agreements** (no `StepAgreements`), Situation analysis, bargaining triage, replaced-agreement hint.

### 6.2 `campaign-universe-section.tsx` (Workforce → **Scope** tab)

Copy: "Campaign scope: the employers and worksites this campaign covers. These rarely change." (`:377-381`). Actions (all `canWrite`): Add employer (dialog over all active employers; sync; auto-link to replaced EA `:247-283`), Remove employer (`:285-292`, no sync), Add worksite (filtered to employer-linked/principal sites unless "Show all"; links to first employer; sync `:301-322, 239-245, 612-623`), Remove worksite (`:324-331`), "Use sector-wide" (deletes all worksite rows, confirm dialog `:333-349, 547-567`), "Use specific worksites" (`:351-358`). Worksite actions disabled until an employer exists (`:461-462, 481-482`). Below it: "Named universes (optional)" card (`[id]/page.tsx:626-726`).

### 6.3 `campaign-units-section.tsx` (Workforce → **Campaign Units** tab)

- Coverage card: total units, with contact, with activist, assigned distinct workers, workers in multiple units (`:1008-1038`).
- "Suggested units" from WTP: accept / reject / customise (`:1040-1123`, mutations `:440-511`).
- Header buttons: **Suggest from plan**, **Recompute rules**, **New group** (opens `CreateOrganisingUnitDialog`), **Add unit** (dialog: name, type, estimated workers, target size, commonality logic, anchor worker `:1893-2004`; edit reuses it), **Merge units** (≥2) (`:1125-1183, 2294-2371`).
- Per unit: name/type/est/source/commonality, rating 1–5 (`:1266-1300`), Edit, **Assign worker** (picker dialog `:2006-2050`, conflict dialog `:2052-2068`), menu: Split into sub-units (`:1365-1385`, `SplitUnitDialog`), Assign workers, Delete unit (`:1398-1403`, `DeleteOrganisingUnitDialog` with reassignment targets `src/lib/campaign/ou-reassignment-targets.ts:15-42`); "Show sub-units" toggle; worker table with checkboxes, bulk **Remove from unit** / **Reallocate to…** (restricted to same `ou_type` or sibling sub-units `:2117-2129`), per-row remove; **Assignment rules** builder per unit (include/exclude × dimension × operator × value; adding/deleting auto-recomputes `:676-732, 1596-1755`). Container units show "This is an employer group — assign workers and rules to the vessel units within it" (`:1625-1628`).
- "Unallocated" pseudo-unit with select-all, "Assign to unit…" (`:1772-1889`).

### 6.4 `wall-chart/create-organising-unit-dialog.tsx` ("New group" / "New unit")

4-step mini-wizard: 1 Units (single or group of units, group phases mirror step 5 `:604-848`), 2 Placement (top / bottom / after a top-level unit; rewrites `display_order` for **every** unit `:852-894, 440-454`), 3 Workers (per new unit, select then click "Allocate selected workers"; cannot proceed with un-allocated selections `:896-993, 1078-1087`), 4 Review. Writes containers/members with `parent_ou_id`+`ou_group_id` (`:388-438`) and `campaign_worker_ou` (`:456-475`). GROUPABLE types again exclude employer/worksite/job_type (`:59-68`).

### 6.5 Other post-setup surfaces touching universe/units/workers

- Wall chart (Workforce → Wall Chart / List): "Units" popover (visibility per browser, ordering saved, New unit, delete; `wall-chart-unit-manager.tsx:88-134`); "Add worker" in header and per unit/sub-unit (`campaign-wall-chart.tsx:1462, 1974-1976, 2177-2179, 2268-2269`); drag/drop moves; split/delete/merge dialogs; auto universe sync on mount (`workforce-board.tsx:52-76`).
- `/campaigns/:id/add-workers`: table + filters; radio "unallocated / existing unit / new unit (name+type)" → `POST add-workers` (new unit has no `unit_basis`, `route.ts:145-153`) (`add-workers-client.tsx:102-112, 286-309, 422-490`).
- Worker import wizard: per raw unit value → match existing OU or create via `POST /api/worker-import/organising-units` (`worker-import-wizard.tsx:1443-1476`; `route.ts:37-47`).
- Overview: read-only "Employers & worksites" card → "Manage scope" (`campaign-employers-worksites-card.tsx:87-98`); basics edit sheet (name, organiser, dates, estimate; `campaign-basics-edit-sheet.tsx:283-398`); situation analysis edit sheet (`SituationAnalysisEditSheet.tsx:36-45`).
- Plan hub: change lead organiser (lead-only list), team members with roles (`plan/page.tsx:197-256`).

### 6.6 Duplication matrix (same data, multiple editors)

| Data | Wizard | Settings | Other |
|---|---|---|---|
| Basics | step 1 | Basics | header basics sheet (subset), plan hub organiser |
| Scope (employers/worksites/sector) | step 2 | Employers & worksites | Scope tab (universe section), Overview card link, import wizard |
| Estimate | step 4 | Worker estimate + Basics | basics sheet |
| Agreements | step 3 | — | planner step 1 (timeline only) |
| Units | step 5 | Campaign units (**lossy for groups**) | Units tab Add unit / New group / Split / Merge; wall chart New unit; add-workers "new unit"; import wizard; `worker-import/organising-units` API; WTP suggestions |
| Allocation | step 5 group panel + step 6 | Allocate workers | Units tab assign/reallocate/rules; wall chart DnD/Add worker; add-workers page; import; universe sync |
| Situation analysis | step 7 | — | Overview sheet; plan hub link (broken, see §8) |
| Ambitions | step 8 (`campaign_ambitions`) | Campaign ambitions | planner `plan_ambitions` per stage (different table) |
| Organiser | step 1 (all staff, `campaign-organiser-select.tsx:50-62`) | Basics | basics sheet; planner/plan hub (lead organisers only) |

---

## 7. Terminology audit

| Concept | Terms found (user-facing unless noted) | Refs |
|---|---|---|
| Universe / scope | "universe scope" (`campaign-wizard.tsx:1502`); "Campaign scope" = the 4-value enum (`:1707`) **and** the employers/worksites list (`campaign-universe-section.tsx:378`); tab label **"Scope"** hosting `CampaignUniverseSection` (`[id]/page.tsx:616`); "Manage scope" (`campaign-employers-worksites-card.tsx:96`); "Named universes" (`[id]/page.tsx:629`); "Target Universe" (`EmailWizardSteps.tsx:1280`); "Universe" size (`FoundationalReadinessPanel.tsx:134`); "Universe" select on actions (`campaign-actions-section.tsx:225`); "worker universe" (`step-campaign-units.tsx:674`); "Workers currently in scope" (`step-worker-estimate.tsx:170`); "targets for this campaign" (`step-employers-worksites.tsx:697`); code: `CampaignUniverse`, `sync-universe-workers`, "Universe sync failed" (`workforce-board.tsx:64`). Two "sector-wide" controls: "Sector-wide campaign" (`campaigns.sector_wide`) vs "Sector-wide worksites (no specific site)" / "Use sector-wide" (`campaign_worksites` row). | |
| Unit | "Campaign units" (`campaign-wizard.tsx:1425`; `campaign-settings.tsx:1064`; tab `[id]/page.tsx:615`; section title `campaign-units-section.tsx:1127`); "Organising unit(s)" (`:1902, 1186`; `create-organising-unit-dialog.tsx:585`; add-workers `:450`; "Organising Unit Coverage" `campaign-plan-panel.tsx:456`); "OU" ("OU coverage" `:1011`); "unit" / "sub-unit" (`step-campaign-units.tsx:1259`; units section `:1225`); "group" / "group container" / "employer group" / "vessel units" (`:1627`); "dimension" (`step-campaign-units.tsx:675`; `campaign-units-section.tsx:2162`); "cohort" (header build-list copy `campaign-detail-header-bar.tsx:154`); "crew" only as `crew_rotation` type; raw codes like `job_type` shown as badges (`step-campaign-units.tsx:1254`) vs "Job type"/"Occupational grouping"/"Occupation" pickers (`:1017-1019`); "Unit type" vs "Type". Grep counts in campaign UI: ou 394, ous 171, sub-unit(s) 75, organising unit(s) 57, campaign unit(s) 23, segment(s) 44, cohort(s) 19, crew(s) 35. | |
| Group vs type | Wizard/dialog "group" = typed container of same-type units (`step-campaign-units.tsx:512-532`); import route "group" = employer container of worksite units (`campaign-import/apply/route.ts:511-518, 581-584`); units section assumes every container is an "employer group" with "vessel units" (`:1627`); DB comment says containers are "Created by the group creation flow in the campaign wizard" (`20260608100000:35-38`) but the intended 3-level model names employer→vessel→crew (`20260612100000:9-11`). "Group" also means occupation *group* (`occupation_groups`, "Occupational grouping") and the step-6 conflict copy "different shift group" (`step-allocate-workers.tsx:590-595`). | |
| Unassigned | "Unallocated" (wizard step 5/6, units section), "Unassigned" / "Unassigned workers" (wall chart, add-worker dialog), "No Unit" (import), "Remove from group" (`__unallocate__`), "Unallocated (clear units)" | §4.5 |
| Plan | "Campaign plan timeframe" / "Plan timeframe" (`campaign-wizard.tsx:1645`; `campaign-settings.tsx:880`; `campaign-basics-edit-sheet.tsx:321`); "campaign plan" (`campaign-plan-panel.tsx:368`; list column `campaigns/page.tsx:257`); "strategic plan" / "Strategic plan" (`campaign-settings.tsx:1158, 1171`; `campaign-plan-panel.tsx:370`; wizard `:2028`); "OA Planner" (`:1167`; `campaign-wizard.tsx:2029, 2036, 2049`); "Playing to Win" / "P2W" — described as "six campaign stages and five gate assessments" (`campaign-wizard.tsx:2036-2037`) vs "the 11-stage Playing-to-Win framework" (`CampaignStageCoveragePanel.tsx:59-63`; `planner-types.ts:70-80`); "Bargaining to Win" / "B2W"; "stage plan(s)" (`campaign_stage_plans`); "section plan(s)" (tab `[id]/page.tsx:420`); "Workplan" sub-tab (`:531`) vs "Plan & Execution" tab (`:419`) vs "Strategy" sub-tab (`:530`); "Create Campaign Plan" vs "Create Campaign Plan in OA Planner" vs "Re-run planner setup" vs "View full plan" vs "View Full Plan"; "Campaign ambitions" (`campaign_ambitions`) vs stage "plan ambitions"/"hard gates" (`plan_ambitions`); "Situation analysis" vs SOC "Context". | |
| SOC | `OA_PRODUCT_SPEC.md` calls it "SOC (scope-of-campaign) wizard"; code: "Structured Organising Conversation… 8-stage SOC" (`SocWizardLaunchCard.tsx:56-59`; `SocWizardSteps.tsx:3-9`). | |
| Organiser | "Organiser" (wizard/settings), "Campaign organiser" (`campaign-organiser-select.tsx:24`), "Lead Organiser" (`planner-wizard.tsx:904`), "Lead:" (`plan/page.tsx:249`), "team members"/campaign roles (`plan/page.tsx:37-45`); also "organiser record" vs "staff account" (`campaign-organiser-select.tsx:88-91`). | |
| Membership | "on campaign" / "Add to campaign" (step 6), "named workers"/"named in campaign" (`campaign-basics-edit-sheet.tsx:394`), "members" (units section), "candidates" (`step-allocate-workers.tsx:783`), "workers in scope". | |
| Wizard names | "Campaign wizard" (selector), `CampaignCreationWizard` = the planner (`planner-wizard.tsx:146`), "OA Planner setup", "Re-run wizard" (actually edits basics only), "Re-run planner setup", "Bargaining to Win setup", "Email wizard", "Phone wizard", "SOC wizard". | |

---

## 8. Pain points inferred from the code

**Sequencing / structure**
1. Campaign row is created on step 1 (`campaign-wizard.tsx:592-596`) and appears in the list immediately; there is no draft state or cleanup for abandoned wizards **[inference]**.
2. 9 screens, each a server round-trip, with a confirm-on-leave interceptor that monkey-patches `history.pushState` (`:1371-1415`).
3. Step 7 (situation analysis) is a hard gate for organising/mobilisation/political campaigns too (`:1141-1146`; `step-situation-analysis.tsx:74`).
4. `campaign_scope` is required in the wizard (`:1434-1436`) but optional in Settings (`campaign-settings.tsx:958`) and unset by manual/planner/import creation; the step-2 code already handles "no scope" (`step-employers-worksites.tsx:610-613`).
5. Bargaining triage sits in step 1 but only matters at steps 7 and 9 (`:229-233`).
6. Units (step 5) come before workers (step 6), yet step 5 already offers per-group allocation (`step-campaign-units.tsx:1467-1704`), then step 6 re-does allocation; step 6's save **wipes and re-inserts** `campaign_worker_ou` for all units (`campaign-wizard.tsx:1096-1121`), dropping `assignment_source: 'rule'`/`is_primary` set elsewhere — re-running step 6 (or Settings "Save worker allocation", `campaign-settings.tsx:574-595`) is destructive **[inference]**.
7. Step 6 mutates global worker records (`stampEmployerWorksiteFromOu`, `:1123-1131`) and other campaigns (`syncWorkersToMatchingCampaigns`, `:1132-1134`) as a side effect of a wizard step.

**Mislabels / dead ends**
8. Step 2 button reads "Continue to workers" (`step-employers-worksites.tsx:970`) but leads to Agreements.
9. `SituationAnalysisCard` links to `/campaigns/new?cid=X&step=7&edit=1` (`SituationAnalysisCard.tsx:66-69`), but in edit mode the wizard **ignores `step` and opens step 1** (`campaign-wizard.tsx:146-149`); saving there returns to the campaign (`:656-658`) without ever reaching step 7 **[inference from init logic; plan hub uses this fallback per the component's doc `:41-49`]**.
10. "Re-run wizard" (`campaign-detail-header-bar.tsx:209-214`) only edits Basics.
11. Settings "Campaign units" flattens groups (§6.1) and "Allocate workers" can target container OUs, which the DB rejects (`20260608100000:89-113`) **[inference]**.
12. "Suggest from plan" is inert without stage plans (`generate-ou-candidates.ts:32-49`).
13. "Named universes" can be created but never given rules (`[id]/page.tsx:335-350, 707-719`).
14. Wizard cannot build the DB's intended employer→vessel→shift model (`GROUPABLE_OU_TYPES` `step-campaign-units.tsx:152-161`; dialog `:59-68`), and cannot add to an import-created employer container ("Add to existing group" filters by the selected member type, `:483-485`, `create-organising-unit-dialog.tsx:218-221`).
15. Planner: lead-organiser-only picker (`usePlannerOptions.ts:152-153`), `status` forced to `active` (`usePlannerCampaigns.ts:469, 630`), redirect when a plan exists (`planner-wizard.tsx:204-213`), and a 15 s hang escape hatch that documents a known auth-lock problem (`:186-196, 546-551`).
16. Silent side effects: opening the Wall Chart tab pulls workers into the campaign (`workforce-board.tsx:52-76`); removing an employer never removes its workers (`campaign-universe-section.tsx:285-292`); sector-wide campaigns with no employers sync nothing (`sync-campaign-universe.ts:332-334`).

**Organiser (non-admin) blocks**
17. Cannot assign another staff member who lacks an organiser record (`resolve-campaign-organiser.ts:80-84`).
18. Delete campaign button is shown for writers (`campaigns/page.tsx:272-290`) but RLS delete on `campaigns` is admin-only (`0002_rls_policies.sql:101-103`) **[inference: will fail at DB]**.
19. Planner requires a lead organiser; a plain organiser without a `reports_to` lead gets an empty picker (`planner-wizard.tsx:320-346`).
20. List shows a warning when the profile isn't linked to an organiser (`campaigns/page.tsx:413-418`).

**Code health**
21. Component sizes: `campaign-wizard.tsx` 2071, `campaign-units-section.tsx` 2374, `step-campaign-units.tsx` 1704 lines; hydration anti-patterns are logged in `docs/campaigns-review-incidental-issues.md:26-41` (#2) and `:43-50` (#3).
22. Comments only; no TODO/FIXME in the audited files. "Legacy" markers: `replaced_agreement_id` deprecated (`campaign-wizard.tsx:588-590`), "Legacy single-unit add" (`step-campaign-units.tsx:381`), "legacy sub-unit" (`:1134`). Comments reference developer-local plan paths (`src/lib/campaign/constants.ts:27`; `planner-wizard.tsx:187`).
23. No automated tests cover campaign creation (`tests/` contains only `e2e/mobile-dialer.spec.ts` and `load/claim-concurrency.ts`).
24. Product spec terminology conflict for "SOC" (§7).

---

## 9. What would need to change

### 9(a) Standalone-by-default campaigns; planning as an optional add-on

Schema: **nothing blocks it** — plan tables are separate and `hasPlan` is derived (`campaign-plan-panel.tsx:348`; `usePlannerCampaigns.ts:415`). Recommended changes:
1. Wizard: make step 7 skippable (drop the `canContinue` gate, `step-situation-analysis.tsx:118-129`) or move it into the optional planning module; remove/replace step 9 with an opt-in "Add strategic planning" card; default `campaign_type` to `organising` (`campaign-wizard.tsx:189`, `manual/page.tsx:46`; the import route already does, `route.ts:109`); make `campaign_scope` optional (`:1434-1436`); rename "Campaign plan timeframe" to a neutral "Timeframe".
2. Defaults: set `campaigns.current_phase` to `standalone_activities` for non-bargaining campaigns (enum exists, `planner-types.ts:93-98`; DB default `20260510100000:17`); stop forcing `status: 'active'` when a plan is attached (`usePlannerCampaigns.ts:469, 630`).
3. "Connect planning at any point": `useAddPlanToCampaign` (linked mode) already does this; surface it uniformly — Plan panel (already), Settings "Strategic plan" for all types (`campaign-settings.tsx:1154`), header action, and hide plan-only chrome when `!hasPlan` (`CampaignStageCoveragePanel`, "View full plan", "Suggest from plan", Bargaining tab).
4. Planner: allow the campaign's existing organiser (any staff) instead of lead-only (`usePlannerOptions.ts:143-170`; `planner-wizard.tsx:463-466`); allow re-planning instead of redirecting (`:204-213`).

### 9(b) Organiser self-setup (in addition to admin setup)

Already permitted for role `user` (RLS `0002:94-98`; `canWrite`). To make it smooth: keep organiser = self as default (already, `campaign-organiser-select.tsx:64-69`); keep the self-record auto-create (`resolve-campaign-organiser.ts:86-103`); replace the non-admin throw for other staff with a request/notify flow or auto-create behind an admin toggle (`:80-84`); reconcile the coarse `campaigns` write policy with `can_write_to_campaign` (§1.3) and hide/allow delete consistently (`campaigns/page.tsx:272-290` vs `0002:101-103`); use `created_by` (`20260402035940_permission_system.sql:19-20`) so a self-created campaign is editable by its creator under the finer policy. Admin setup = same paths; the only admin-specific capability today is assigning others.

### 9(c) Explicit named "groups" of units with a per-group "unassigned" unit

Current substrate: group = container OU (`is_group_container`) + members (`parent_ou_id = ou_group_id`), exclusivity per `ou_type` (`20260608100000`), plus two competing "group" meanings (typed groups vs employer groups). Required changes:
1. **Make the group the primary architecture** (universe → groups → units): render containers as first-class groups everywhere (wizard step 5 tree already does; units section treats them as "employer groups" `:1625-1628`; wall chart unit manager shows them as collapsible `wall-chart-unit-manager.tsx:138-235`). Decide whether groups are typed (wizard) or free (import) and relax `GROUPABLE_OU_TYPES` / `GROUPABLE_TYPES` accordingly (`step-campaign-units.tsx:152-161`; `create-organising-unit-dialog.tsx:59-68`).
2. **Per-group unassigned**: two viable designs.
   - *Derived*: per group, unassigned = campaign members not in any of that group's member units. All inputs exist (`unallocatedMembers` logic `campaign-units-section.tsx:429-438`; per-dimension remainder `step-campaign-units.tsx:1094-1103`); needs a per-group card in the wall chart (today one global card `campaign-wall-chart.tsx:1545-1594`), a per-group bucket in the units section, and per-group filters in step 6.
   - *Materialised*: auto-create one system member unit per group (e.g. `is_system_unassigned`) so membership in a group is explicit. This interacts with the "no workers on containers" and one-group-per-type triggers (`20260608100000:89-139`) and with every writer that creates units without a group (add-workers "new unit" `add-workers/route.ts:145-153`; `worker-import/organising-units/route.ts:37-47`; Settings units save `campaign-settings.tsx:515-529`; step-5 single add `step-campaign-units.tsx:383-459`). A default group ("All workers") would also satisfy the standalone case.
3. Fix the lossy paths first: Settings units/allocation (§6.1), the legacy sub-unit `ou_group_id` assignment (`campaign-wizard.tsx:813-814, 873-876`), and the destructive step-6 re-insert (`:1096-1121`).
4. Terminology: pick one of unit / organising unit / OU, one of group / dimension / type, and one of unassigned / unallocated / no unit (§7).
5. A reusable "groups + unassigned panel" UI pattern already exists in Administration's employer wizard (`src/components/administration/employer-wizard.tsx:619-659, 1169-1177, 1642-1660` — "N employers not in any group") and could be adapted.

---

## Appendix A — Files read

`src/app/(dashboard)/campaigns/new/page.tsx`, `new/manual/page.tsx`, `page.tsx`, `[id]/page.tsx` (partial), `[id]/settings/page.tsx`, `[id]/plan/page.tsx` (partial), `[id]/section-plans/[sectionPlanId]/page.tsx` (head), `soc-wizard/page.tsx`, `[id]/add-workers/page.tsx`; `src/components/campaigns/campaign-wizard.tsx`, `planner-wizard.tsx`, `step-employers-worksites.tsx`, `step-agreements.tsx`, `step-worker-estimate.tsx`, `step-campaign-units.tsx`, `step-allocate-workers.tsx`, `step-situation-analysis.tsx`, `step-campaign-ambitions.tsx`, `campaign-universe-section.tsx`, `campaign-units-section.tsx`, `campaign-settings.tsx`, `campaign-basics-edit-sheet.tsx`, `wall-chart/create-organising-unit-dialog.tsx`, `wall-chart/wall-chart-unit-manager.tsx`, `wall-chart/types.ts` (partial), `campaign-plan-panel.tsx` (partial), `campaign-detail-header-bar.tsx` (partial), `campaign-employers-worksites-card.tsx`, `workforce/workforce-board.tsx`, `CampaignStageCoveragePanel.tsx`, `planning/SituationAnalysisCard.tsx` (partial), `planning/SocWizardLaunchCard.tsx`, `situation-analysis/SurveyPanel.tsx` (partial), `add-workers-client.tsx` (partial); `src/lib/campaign/*.ts`, `src/lib/workers/sync-campaign-universe.ts`, `src/lib/situation-analysis/{constants,types}.ts` (partial), `src/lib/hooks/usePlannerCampaigns.ts` (partial), `usePlannerOptions.ts` (partial), `src/lib/supabase/auth-context.tsx` (grep), `src/types/organising-row-types.ts` (partial), `src/types/planner-types.ts` (partial); `src/app/api/campaigns/[id]/{add-workers,sync-universe-workers}/route.ts`, `src/app/api/worker-import/organising-units/route.ts`, `src/app/api/campaign-import/apply/route.ts` (partial); `supabase/migrations/` — 0001, 0002, 0013, 20260402035940, 20260408200100, 20260414123000, 20260503100000, 20260510100000, 20260524100000, 20260608100000, 20260612100000 (both), 20260630100000 (partial reads); `docs/campaigns-review-incidental-issues.md`; `OA_PRODUCT_SPEC.md`.

Not audited: `campaign-wall-chart.tsx` beyond greps, `split-unit-dialog.tsx`, `delete-organising-unit-dialog.tsx`, `merge-units-dialog.tsx`, `CampaignImportWizard` UI, `plan/stage/[stageNumber]/page.tsx`, the bargaining wizard, section-planning internals.
