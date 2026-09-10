# D. Navigation, information architecture and role model — organising-db

Scope: `apps/organising-db` (Next.js 16.1.6 App Router, React 19, Supabase). All paths below are relative to `apps/organising-db/` unless they start with `supabase/` or `packages/` (monorepo root). Line numbers are from the current working tree (branch clean, `git status` empty). Anything not directly read from code is marked **(inference)**.

---

## 0. Executive summary

- The app has **one shell** (`src/app/(dashboard)/layout.tsx`) with a **flat 13-item sidebar** (10 for everyone + 3 admin) and a header that carries no navigation of its own. There is no per-role, per-team or per-setting nav customisation anywhere; the only nav gate in the whole app is `isAdmin` for the three admin links.
- Every role lands on **`/campaigns`** (a portfolio list + metrics), not on a campaign. Row click deep-links straight to the **Workforce → Wall Chart** sub-tab, while the detail page's own default is **Overview**.
- The campaign detail page is a **single 904-line client page** with **8 top-level tabs, 20 second-level sub-tabs and 16 third-level tabs (~44 surfaces)**, all URL-addressed via `?tab=&sub=`, plus a header bar with **12 actions** (11 write-gated) and 3 resume banners. Nothing on it is role- or setting-gated beyond `canWrite`; the Bargaining tab is gated by campaign phase only.
- Role model: `user_profiles.role ∈ {admin,user,viewer}` (+ free-text-ish `work_role`, `reports_to`, `organiser_id`). At the database level **admin and user are identical** (RLS: read-all, write if role in admin/user); `viewer` is read-only. A campaign-level permission system (tables, RPCs, helper functions) exists in the DB but is **not referenced by any RLS policy and its UI components are imported nowhere** (dormant).
- "My campaigns" = `campaigns.organiser_id === profile.organiser_id` (client-side filter on the list page). The `campaign_organisers` team table, `reports_to` hierarchy and organiser patches are **not** used for scoping. The dashboard's "My Team" filter is a **no-op** (server maps `team` → no filter).
- There is **no global campaign switcher**; the only way to change campaign is Back → list.
- Wall chart drag/drop is **native HTML5 DnD** (no touch polyfill) → effectively desktop-only **(inference from the mechanism)**; the only component that adapts to mobile is `DataTable`.
- No settings/feature-flag mechanism exists that could toggle modules per user/org: `app_settings` holds only integration credentials behind an admin-only allow-list.

---

## 1. Global navigation inventory

### 1.1 Shell

`src/app/(dashboard)/layout.tsx:9-17` — `<Sidebar/>` + column of `<Header/>` and `<main class="flex-1 overflow-y-auto p-6">`. One route group `(dashboard)` covers all 21 top-level areas (`find` of `src/app/(dashboard)`). There is **no `layout.tsx` under `campaigns/[id]`** (confirmed missing), so campaign context chrome is synthesised by the global `Header` from the pathname.

Routes that live **outside** the shell (token-gated, no Supabase session required; `src/lib/supabase/middleware.ts:50-65`): `/login`, `/auth/*`, `/leader/task` (leader webform), `/call/[token]` (shareable mobile dialer), `/r/[token]` (click redirector), `/u/[token]` (unsubscribe).

### 1.2 Sidebar — `src/components/layout/sidebar.tsx`

Desktop only: `hidden md:flex` (line 93), collapsible to `w-16` (in-memory state only, line 65). Brand header with looping video logo (97-112).

`navItems` (lines 33-44), rendered in this order, **no gating (all roles incl. viewer)**:

| # | Label | Route | Icon | Notes |
|---|---|---|---|---|
| 1 | Campaigns | `/campaigns` | Megaphone | |
| 2 | Dashboard | `/dashboard` | LayoutDashboard | |
| 3 | Overview | `/overview` | LayoutGrid | org databases (8 tabs) |
| 4 | Worksites | `/worksites` | MapPin | |
| 5 | Upcoming Projects | `/upcoming-projects` | Compass | regulator feed; admin buttons inside |
| 6 | Email Inbox | `/email/inbox` | Inbox | unread badge (130-140, `useEmailInboxUnreadCount`) |
| 7 | SMS Tools | `/sms` | MessageSquareMore | |
| 8 | SMS Inbox | `/sms/inbox` | MessageSquare | also reachable via SMS hub pills |
| 9 | Reports | `/reports` | BarChart3 | |
| 10 | Guides | `/help` | GraduationCap | page h1 says "How-to guides" |

`adminItems` (46-50), after a `<Separator/>`, gated `isAdmin` (145-167):

| # | Label | Route | Icon |
|---|---|---|---|
| 11 | Email Imports | `/email-imports` | MailOpen |
| 12 | Email Wrappers | `/email/wrappers` | LayoutTemplate |
| 13 | Administration | `/administration` | Settings |

Footer (170-215): display name or email (171-175), **Hard Refresh Connection** (176-187), **Sign out** (191-202), collapse toggle (203-214).

Active-state logic: longest-prefix match via `isNavItemActive` (`src/lib/nav/active-nav.ts:12-21`) over `allNavHrefs` (sidebar.tsx:53) so `/sms` and `/sms/inbox` do not both light up.

**Counts:** 13 top-level links (10 + 3 admin), **0 nested items** (the sidebar is completely flat), 3 footer controls. Visibility rules: 1 (`isAdmin`). Settings-driven rules: 0.

### 1.3 Header — `src/components/layout/header.tsx`

Three modes:
1. Stage-planning routes (`/campaigns/[id]/plan/stage/*`, `isStagePlanningRoute` in `src/lib/campaign/campaign-detail-routes.ts:15-18`): renders a **mobile-only** 12px bar with just `<MobileNav/>` (header.tsx:35-44). The stage page draws its own header.
2. Campaign detail routes (`isCampaignDetailRoute`, routes.ts:41-45; excludes `new|email-wizard|soc-wizard|phone-wizard|sms-tools` per routes.ts:6-12): the global header is **replaced entirely** by `<CampaignDetailHeaderBar/>` (header.tsx:46-60). See §3.3.
3. Everything else: `<MobileNav/>` trigger + `<h1>` from `pageTitles` (13-30) or fallback "Offshore Alliance" (62-69).

The header exposes **no search** (removed; comment 71-74), **no notifications, no user menu, no breadcrumbs, no campaign switcher**. Header actions on ordinary pages: **0**.

`pageTitles` inconsistencies: it names 8 routes that are *not* in the sidebar (`/workers`, `/employers`, `/programs`, `/agreements`, `/work-scopes`, `/templates`, `/workload`, `/organiser-patches`) and omits 3 routes that *are* (`/help`, `/upcoming-projects`, `/email-imports` → title falls back to "Offshore Alliance"). Most pages also render their own `<h1>` (e.g. `dashboard/page.tsx:291`, `campaigns/page.tsx:359`, `overview/page.tsx:21`), so the title appears twice.

### 1.4 Mobile nav — `src/components/layout/mobile-nav.tsx`

Hamburger `md:hidden` (54) opens a left `Sheet` (300px). It imports and reuses `navItems`, `adminItems`, `allNavHrefs` from the sidebar (12) with the same `isAdmin` gate (107-130) and the same email badge (95-102). Footer: name, Hard Refresh Connection, Sign out (134-172). **Inventory is identical to the desktop sidebar** — no mobile-specific ordering or trimming.

### 1.5 Secondary / nested navs (not in the sidebar)

| Where | Items | File:lines |
|---|---|---|
| SMS hub pills (`SmsHubNav`) | Actions `/sms`, Inbox `/sms/inbox`, Numbers `/sms/numbers` | `src/components/sms/hub/SmsHubNav.tsx:21-23` |
| Campaigns page tab bar | Tabs: Campaigns, Templates; write-only action strip: Create campaign (dialog → wizard/manual), Email wizard `/campaigns/email-wizard`, Phone wizard `/campaigns/phone-wizard`, SMS tools `/sms`, Import lists (CampaignImportWizard) | `campaigns/page.tsx:362-406` |
| Overview page tabs (8) | Projects, Sectors, Employer Groups, Workers, Employers, Programs, Agreements, Work Scopes | `overview/page.tsx:28-68` |
| Administration (admin) | 4 top tabs: System Management (Users, Roles & membership, Sectors, Worker dimensions, Workload, Organiser Patches), Data Management (Import History, Membership Import, Employer Wizard, Reference Data Import), Settings, System Monitoring | `administration/page.tsx:2476-2548` |
| Reports hub | 13 report cards (`ReportType` union `reports/page.tsx:61-74`); 5 route to sub-pages: `/reports/campaign-progress`, `/reports/bargaining`, `/reports/sms`, `/reports/campaign-facts`, `/reports/universe` | `reports/page.tsx:86-215` |

### 1.6 Top-level pages inside the shell that are NOT in the sidebar

Inbound-link counts exclude the sidebar and `pageTitles` (grep over `src`):

| Route | What it renders | Inbound refs |
|---|---|---|
| `/workers`, `/employers`, `/agreements`, `/programs`, `/work-scopes` | thin wrappers around the same `overview/*-tab` components used by `/overview` (`workers/page.tsx:3,9`, etc.) | 9 / 18 / 14 / 5 / 1 |
| `/templates` | `TemplatesTab` — same component as the Templates tab on `/campaigns` (`templates/page.tsx:3,9`) | 0 (only `pageTitles`) |
| `/organiser-patches` | `OrganiserPatchesTab` — same as Administration → System → Organiser Patches (`organiser-patches/page.tsx:3`) | 0 |
| `/workload` | `WorkloadTab` — same as Administration → System → Workload (`workload/page.tsx:3`) | 1 (`dashboard/page.tsx:408`) |
| `/sms/new`, `/sms/numbers` | SMS create page / number allocations | 5 / 2 (SMS pills + hub) |
| `/email/wrappers` (admin) | wrapper editor | 1 (`administration/page.tsx:1846`) |
| `/reports/*` sub-pages | see above | 1-3 each |

---

## 2. Default landing page after login

### 2.1 Redirect chain (identical for every role)

- `src/app/page.tsx:4` — `redirect("/campaigns")`.
- Login form success → `router.push("/campaigns")` (`src/app/(auth)/login/page.tsx:73`).
- Middleware: signed-in user requesting `/login` → `/campaigns` (`src/lib/supabase/middleware.ts:71-75`); unauthenticated → `/login` (50-69).
- Invite flow: `auth/callback/route.ts:7` defaults `next` to `/auth/set-password`; `set-password/page.tsx:49` → `/campaigns`.

There is **no role branch** anywhere in this chain; admin, user and viewer all land on `/campaigns`.

### 2.2 What `/campaigns` shows — `src/app/(dashboard)/campaigns/page.tsx`

- `<h1>Campaigns</h1>` (359) under a header that already says "Campaigns".
- Tabs **Campaigns / Templates** (364-373) + the `canWrite` action strip (374-405).
- Organiser scoping notice when the profile is not linked to an organiser (413-418).
- `CampaignsDashboard` (419-434): organiser `<Select>` defaulting to `profile.organiser_id` (135-139; "All organisers" option), **5 stat cards** — Total estimate, Mapping, Membership, Leadership, Participation (`src/components/campaigns/CampaignsDashboard.tsx:271-297`) — then `CampaignsMetricsTable`. Empty-state links to `/campaigns/new`, `/campaigns/email-wizard`, `/campaigns/phone-wizard`, `/sms`, `/campaigns/soc-wizard` (205-252).
- `DataTable` of all non-episode campaigns (`excludeSmsEpisodes`, 144-154) with columns Name (+Standing badge), Type, Status, Start, End, Organiser, Campaign Plan (badge + link to `/campaigns/[id]/plan`), and a delete column if `canWrite` (214-295).
- **Row click → `/campaigns/{id}?tab=workforce&sub=wall-chart`** (424, 445).

Is it campaign-centric? It is campaign-*list*-centric: a portfolio view with org-wide metrics filtered by organiser. It is not a "my campaign" home; an organiser with 1-2 campaigns still sees the full metrics/table apparatus, and the write strip advertises five different tools.

Viewer differences: `canWrite=false` hides the action strip, the Import wizard and the delete column; everything else is identical.

### 2.3 `/dashboard` — `src/app/(dashboard)/dashboard/page.tsx`

Sidebar item #2 (not the landing page). Contents, top to bottom:
1. 5 **org-wide** stat cards: Total Workers, Total Members, Agreements (Current), Active Campaigns, Expiring in 90 Days (244-281; queries 42-123).
2. "Organiser Workload Dashboard" card (321-417): `WorkloadFilters` (Organiser: My Team / Me Only; Status; Time period — `src/components/dashboard/workload-filters.tsx:45-46, 58-64, 78-83`), `WorkloadSummaryStats`, `CampaignsByStageChart`, `CampaignProgressCard`, `CampaignEntitiesCard`, `CampaignActivitiesCard` (top 5 each), button → `/workload`.
3. "EBA Coverage by Principal Employer" chart + per-employer cards (420-499) → `/reports`, `/worksites`.
4. "Agreements Expiring Soon (Calendar View)" (502-523).
5. Grid: `PendingReviewWidget` (links to `?tab=plan&sub=pending-review`, `pending-review-widget.tsx:127`), "Active Campaigns" list (**rows are not links**, 549-564), `WorksiteDistributionChart`.
6. "Recent Activity" — static placeholder text (580-589).
7. "N Agreements Expiring Without a Campaign Plan" collapsible → `/campaigns/new?agreement_id=…` (592-657).

Verdict: agreement/EBA- and org-centric with a workload section; not organiser- or campaign-centric. Same for all roles.

---

## 3. Campaign detail page

### 3.1 Tab registry — `src/lib/campaign-tabs.ts`

- `VALID_TABS` (13-39): 20 identifiers — 7 current clusters (`overview`, `plan`, `workforce`, `outreach`, `outcomes`, `library`, `section-plans`, `bargaining` = 8 incl. bargaining) plus 12 legacy names kept for redirects.
- `DEFAULT_SUB` (51-56): `plan→strategy`, `workforce→wall-chart`, `outreach→comms`, `outcomes→reports`.
- `REDIRECT_MAP` (84-97): 12 legacy `?tab=` values → `{tab, sub}`.
- `resolveTabParams` (109-135): no `?tab` → `overview`; unknown tab → `overview` (page.tsx:174-181); `needsRedirect` (143-149) drives a `router.replace` (page.tsx:186-206).
- The registry holds **no labels, no components, no gating** — those live inline in the page.

### 3.2 Rendered tabs — `src/app/(dashboard)/campaigns/[id]/page.tsx`

Top-level `TabsList` (417-428), order as rendered; **default tab = Overview**; all URL-addressed (`?tab=`, `?sub=`; handlers 208-237); Workforce adds `?view=list|wall-chart` (`workforce-board.tsx:15-47`); Build list adds `?buildList=1`; SMS adds `?sms_list=`.

| # | Tab (label) | `tab` | Sub-tabs (label → component) | Gating |
|---|---|---|---|---|
| 1 | Overview | (none) | — Import worker list button (canWrite, 431-438); `CampaignOverviewMetrics` (439: cards "Campaign plan progress", "Campaign KPIs", "Ambition progress by stage" — `CampaignOverviewMetrics.tsx:214,263,313`); `ActivistOverviewCard` (440); `CampaignEmployersWorksitesCard` (441); details card (442-513); `SituationAnalysisCard` (515-519); `CampaignStageCoveragePanel` (521, "Section coverage by P2W stage") | none |
| 2 | Plan & Execution | `plan` | Strategy → `CampaignPlanPanel` (+ `Phase2WizardLaunchCard` when phase is null/`preparing_to_bargain`, 539-544); Workplan → `CampaignWorkplanSection` (548); Actions → `CampaignActionsSection` (552-563); Task Lists → `CampaignTaskListsSection` (567); Pending review (count badge) → `PendingReviewTab` (571; trigger 856-868); Role check (count badge) → `RoleCheckTab` (575; trigger 873-885) | none |
| 3 | Section Plans | `section-plans` | `SectionPlansTab` (818-822) | none |
| 4 | Workforce | `workforce` | Wall Chart / List → `WorkforceBoard` (738; internal toggle wall-chart/list); Campaign Units → `CampaignUnitsSection` + `CoveragePanel` (741-746); Scope → `CampaignUniverseSection` + "Named universes (optional)" card (623-727); Assessments → `CampaignAssessmentsSection` (730); Data fields → `CampaignDataFieldsSection` (734); Activists & WOCs → `ActivistsWocsSection` (748-752; internal Register / 4A Tasking / WOCs / Structure Tests — `activists-wocs-section.tsx:59-62`); Foundational Readiness → `FoundationalReadinessPanel` (755) | none |
| 5 | Outcomes | `outcomes` | Reports → `CampaignReportingCharts` (592; Mapping / Membership density / OA leadership / Unit assignment); Results → `CampaignResultsSection` (596); Insights → `BargainingInsightsWidget` (only if `bargaining_to_win`) + `CampaignProgressReport embedded` (599-604) | none |
| 6 | Outreach | `outreach` | Comms → `CampaignCommsSection` (775; internal Drafts & Send / List Builder / Inbox — `campaign-comms-section.tsx:89-91`); Phone Ops → `InlinePhoneOpsPanel` (779; has its own "Create Phone Call" — `InlinePhoneOpsPanel.tsx:66-71`); SMS → `InlineSmsOpsPanel` (783; internal Blasts / Inbox / Surveys / Chats — `InlineSmsOpsPanel.tsx:292-304`); SOC → card linking `/campaigns/soc-wizard?cid=` (786-803). Plus `OutreachCleanupPanel` always shown under the sub-tabs (806-809) | none |
| 7 | Library | `library` | `LibrarySection` (812-816; internal Documents / Agreements / Offers — `library/campaign-library.tsx:30-32`) | none |
| 8 | Bargaining | `bargaining` | stub card → button to `/campaigns/[id]/bargaining` (889-904) | **only if `campaign.current_phase === "bargaining_to_win"`** (425-427) |

**Counts:** 8 top-level tabs (7 unconditional + 1 phase-gated); **20 second-level sub-tabs** (6 + 7 + 3 + 4); **16 third-level tabs/toggles** (Comms 3, SMS 4, Activists 4, Library 3, Workforce view toggle 2) → **≈44 distinct surfaces** on one URL. Role gating: **none** (only `canWrite` props on write affordances, e.g. 415, 431, 548, 567, 571, 575, 624, 635, 730, 734, 738, 742-750, 775, 814). Setting gating: none.

Note the default mismatch: the page defaults to Overview, but the list page (`campaigns/page.tsx:424,445`) and the header "Build list" toggle (`header-bar:92-94`) force `workforce/wall-chart`; dashboard widgets link to bare `/campaigns/[id]` (`campaign-progress-card.tsx:85`, etc.) or `?tab=plan&sub=pending-review`.

### 3.3 Header bar — `src/components/campaigns/campaign-detail-header-bar.tsx`

Mounted by the global header for every `/campaigns/[id]/**` route except stage pages. Always shows `<MobileNav/>` (237) so the full sidebar inventory is one tap away even inside a campaign.

| # | Control | Gate | Target | Lines |
|---|---|---|---|---|
| 1 | Back arrow ("Back to campaigns") | — | `/campaigns` | 238-246 |
| 2 | Pencil "Edit campaign basics" | canWrite | `CampaignBasicsEditSheet` | 258-268, 297-303 |
| — | Type badge, Status badge, date range | — | display | 269-278 |
| 3 | **Build ▾** → Build list (checkbox) | canWrite | toggles `?buildList=1`, forces `tab=workforce&sub=wall-chart` | 85-104, 148-158 |
| 4 | Build ▾ → Import worker list | canWrite | `WorkerImportWizard` | 160-163, 318-328 |
| 5 | Build ▾ → Add assessment | canWrite | `CreateAssessmentDialog` | 164-166, 304-317 |
| 6 | Build ▾ → Task management | canWrite | `?tab=plan&sub=task-lists&from=header` | 167-171 |
| 7 | **Create Phone Call** | canWrite | `CreatePhoneCallOrchestrator` | 174-182 |
| 8 | **Create Email** | canWrite | `CreateEmailOrchestrator` | 183-191 |
| 9 | **Create SMS** | canWrite | `CreateSmsOrchestrator` | 192-200 |
| 10 | **Actions ▾** → Re-run wizard | canWrite | `/campaigns/new?cid=&edit=1` | 209-214 |
| 11 | Actions ▾ → All settings | canWrite | `/campaigns/[id]/settings` | 215-220 |
| 12 | Actions ▾ → View full plan | canWrite | `/campaigns/[id]/plan` | 221-223 |
| — | `ResumeBanner`, `EmailResumeBanner`, `SmsResumeBanner` | — | resume in-flight phone/email/SMS flows | 288-290 |

**Total: 12 actions (11 write-gated) + 3 conditional banners.** SMS-episode campaigns get a minimal "← SMS / Standalone chat board" header (120-136) or are redirected to `/sms?scope=standalone` (110-118).

---

## 4. Campaign sub-routes (one line each)

Under `src/app/(dashboard)/campaigns/[id]/` (all inherit the campaign header bar unless noted):

| Route | Purpose | Who |
|---|---|---|
| `settings` | `CampaignSettings` accordion: Basics, Scope, Estimate, Units, Allocate, Ambitions, Plan (`campaign-settings.tsx:756-1163`); target of "manual create" and "All settings" | organiser/admin configuring |
| `plan` | P2W plan overview: breadcrumb, Campaign Timeline, Stage Gantt, Stage planned dates, **Campaign Team** (campaign_organisers CRUD), revision history, Stage Plans list (`plan/page.tsx:172-533`) | lead/planner |
| `plan/stage/[n]` | Focused stage planner with its own header (global header suppressed `header.tsx:35-44`); Back to Campaign (250, 261, 538), prev/next stage, gate link (371) | planner |
| `plan/gate/[n]` | Gate assessment + ambition assessment (`GateAssessmentComponent`, `GateAmbitionAssessment`) | lead |
| `section-plans/[sectionPlanId]` | Period-scoped section planner stepper (panels routed by step, 150-152) | organiser/lead |
| `bargaining` | Bargaining Hub: stage cards, Strength & Decisions, PABO, PIA Actions, Endorsement Votes, Bargaining Stages (`bargaining/page.tsx:142-386`) | bargaining lead / IO |
| `bargaining/stage/[n]` | Bargaining stage planner (own header, 312) | bargaining lead |
| `bargaining/decisions` | "Strength & Decisions": strength assessments + decision points | lead |
| `bargaining/pabo`, `bargaining/pabo/[paboId]` | PABO applications list/detail (`canWrite` gate on detail :22) | IO |
| `bargaining/actions` | "PIA Actions": action ladder + participation | lead |
| `bargaining/votes`, `bargaining/votes/[voteId]` | Endorsement votes list/detail | lead |
| `bargaining-wizard` | Phase 2 entry wizard, `?mode=continuation|standalone` (doc 3-13) | lead |
| `phone` | Phone hub: scripts + call lists (delete/share controls 111, 337-354) | organiser |
| `phone/setup` → `phone/setup/order` | Pathway picker → order picker; creates `phone_call_actions`; Back chain documented 4-11 | organiser |
| `phone/lists/new` | Call-list builder (1450 lines; priority strategies 74-82) | organiser |
| `phone/lists/[listId]` | List detail: edit, "Share for mobile calling", active links, currently calling | organiser/coordinator |
| `phone/scripts/[scriptId]` | Script editor | organiser |
| `phone/assessment-setup` | Assessment-only pathway setup | organiser |
| `phone/call/[listId]` | Canonical call session (`CallSessionPage`) | caller |
| `phone/live` | Coordinator live-action dashboard (15s polling / realtime) | coordinator |
| `email/setup/order` | Email order picker (hot-select; "Back returns to the campaign page" 10-12) | organiser |
| `email/lists/new` | 3-step email list builder | organiser |
| `email/wizard` | `EmailComposer` (7-line page); reached via resume banner / orchestrator | organiser |
| `email/import` | CSV/XLSX audience upload with consent attestation (doc 3-11) | organiser |
| `sms/setup` | SMS pathway picker (`canWrite` gate 166); routes into Outreach → SMS | organiser |
| `sms/chat/[listId]` | 3-pane chat workspace; minimal header for episode campaigns | organiser |
| `add-workers` | Server page rendering `AddWorkersClient` — **orphan**: no inbound link anywhere (`grep "/add-workers"` finds only the page and API); superseded by `AddCampaignWorkerDialog` in the wall chart **(inference)** | — |

Campaign-family routes outside `[id]` (the header treats them as non-detail, so campaign chrome is lost — `campaign-detail-routes.ts:6-12`):

| Route | Purpose |
|---|---|
| `campaigns/new` | Wizard entry: `CampaignCreationWizard` (planner wizard) when `?campaign_id|agreement_id|organiser_id|expiry_date` present, else `CampaignWizard` (`new/page.tsx:11-18`); also "Re-run wizard" via `?cid=&edit=1` |
| `campaigns/new/manual` | Minimal bootstrap (name/type/status/organiser) → redirects to `settings` (doc 32-38; `canWrite` gate 94) |
| `campaigns/email-wizard` | Org-level `EmailWizardSteps` |
| `campaigns/phone-wizard` | Org-level `PhoneWizardSteps`; `phone-wizard/call/[listId]` is a deprecated redirect |
| `campaigns/soc-wizard` | Structure-of-Concern wizard (`?cid=`) |
| `campaigns/sms-tools` | Redirect → `/sms` (hub moved out of campaigns) |

---

## 5. Role model

### 5.1 Roles and where they live

- `UserRole = "admin" | "user" | "viewer"` — `src/types/organising-row-types.ts:1`.
- `WorkRole = coordinator | lead_organiser | organiser | industrial_officer | industrial_coordinator | specialist` — `organising-row-types.ts:3-9`. Labels in Administration (`administration/page.tsx:77-78`).
- Per-campaign team roles (`campaign_organisers.campaign_role`): `lead | organiser | coordinator | industrial_officer | specialist` — `src/app/api/campaign-organisers/[campaignId]/route.ts:62,111`.
- Per-agreement roles: `organiser | lead | industrial_officer` — `organising-row-types.ts:11`.
- **Storage:** `public.user_profiles` (`packages/db-types/generated.ts:18297-18308`): `user_id`, `role`, `work_role`, `reports_to` (uuid → another user), `organiser_id` (→ `organisers`), `display_name`, `phone`. Nothing is stored in Supabase auth metadata. Row is created by trigger `handle_new_user()` (`supabase/migrations/0001_initial_schema.sql:437-445`) with role `viewer` (per `invite-user/route.ts:97`), then updated by the invite route.
- Typed client shape: `UserProfile` (`organising-row-types.ts:832-842`).

### 5.2 How the client learns the role

`AuthProvider` (`src/lib/supabase/auth-context.tsx`): on `INITIAL_SESSION` it fetches `user_profiles` by `user_id` (`fetchProfile` 111-145; 192-209) and exposes via `useAuth()` (384): `user`, `profile`, `role = profile?.role ?? "viewer"` (361), `isAdmin`, `isUser`, `isViewer`, `canWrite = admin || user` (373-376), plus session-recovery helpers. `work_role`, `reports_to`, `organiser_id` are available on `profile` but **no derived flag (e.g. `isLeadOrganiser`) exists**. A second, independent fetch of the same row exists in `useCurrentUserProfile` (`src/lib/hooks/usePlannerOptions.ts:172-192`).

### 5.3 Server-side checks

- Every `/api/admin/*` route inlines `profile.role !== "admin"` (e.g. `admin/settings/route.ts:27-46`, `admin/users`, `admin/update-user:35`, `admin/invite-user:32`, `admin/sms/status`, `admin/rate-limits`, `admin/ai-cache`, `admin/manual-archive`, `admin/refresh-gate-criteria`, `admin/set-user-password`, `admin/delete-user`), plus `employers/merge:28`, `employer-wizard/*`, `upcoming-projects/refresh|rematch`, `sms-surveys/[surveyId]:665`, `sms/numbers` (`can_manage`).
- `requireStaffUser` (`src/lib/campaign/auth-api.ts:3-20`) returns only admin|user.
- Viewer is blocked from ~20 campaign write APIs by `profile.role === "viewer"` checks (e.g. `campaigns/[id]/add-workers/route.ts:73`, `create-worker:159`, `sms-audience/*`, `participation-import/*`, `workers/batch-update:47`, `sms/episodes:173`).
- `work_role` gates exactly **one** server route: `/api/permissions/pending/route.ts:25-30` (admin or `lead_organiser|coordinator|industrial_coordinator`).
- `resolveCampaignOrganiser` (`src/lib/campaign/resolve-campaign-organiser.ts:43,80`): non-admins cannot assign a campaign/task to another user's organiser (used in `campaign-basics-edit-sheet:237`, `create-task-list-dialog:477`, `campaign-settings:364`, `campaign-wizard:562,619`, `new/manual:64`, `fire/task/route.ts:92-97`).

### 5.4 Database enforcement (RLS)

`supabase/migrations/0002_rls_policies.sql`: `get_user_role()` (40-43); **SELECT for all authenticated `USING (true)`** on every data table incl. `campaigns` and `user_profiles` (50-71); **INSERT/UPDATE/DELETE when `get_user_role() IN ('admin','user')`** (77-…). Consequences: at the DB level **admin ≡ user** for data; `viewer` is read-only; there is **no campaign/organiser scoping** of reads or writes.

Campaign-level permission system (`supabase/migrations/20260402035940_permission_system.sql`): adds `campaigns.created_by`; tables `campaign_edit_permissions`, `campaign_permission_requests` (with RLS 84-101); helpers `is_admin`, `is_coordinator_or_lead` (uses `work_role`), `is_campaign_creator`, `is_lead_organiser_for_campaign` (uses `reports_to`, 141-158), `is_assigned_to_campaign` (via `agreement_organisers`), `has_campaign_edit_permission`, `can_write_to_campaign` (188-198); RPCs `request/grant/deny_campaign_edit_permission`, `get_my_campaign_permissions` (440), `get_pending_permission_requests`. **No RLS policy on any table references `can_write_to_campaign`** (grep across `supabase/migrations`), and the UI for it — `src/components/permissions/{my-permissions-panel,pending-requests-panel,request-campaign-access-modal}.tsx` — is **imported by no page** (grep). API routes `/api/permissions/{request,approve,deny,revoke,my-permissions,pending}` exist but are only called by those orphaned panels. The system is dormant.

### 5.5 Every UI gate found

`isAdmin`:
- Sidebar/mobile admin section — `sidebar.tsx:145`, `mobile-nav.tsx:107`.
- Administration page access ("Access Denied") — `administration/page.tsx:2457-2470`.
- Overview → Employers tab: merge selection + admin actions — `overview/employers-tab.tsx:198-221, 449, 685`.
- Worksite detail admin-only control — `worksites/[id]/page.tsx:1579`.
- Upcoming Projects refresh/rematch buttons + `MatchReviewPanel` admin branches — `upcoming-projects/page.tsx:247, 377`; `_components/match-review-panel.tsx:189, 204, 338`.
- SMS archive policy — `src/lib/sms/archive-policy.ts:150-182`.
- Organiser reassignment (see 5.3).

`canWrite` (admin|user): header bar (`header-bar:138, 258`), campaigns list strip/import/delete (`campaigns/page.tsx:272, 301, 374`), campaign detail import button and every section's `canWrite` prop (page.tsx:415-814), `sms/setup:166`, `new/manual:94`, worksite/agreement detail edit controls, `bargaining/pabo/[paboId]:22`, `sms/chat/[listId]:31`.

Phase gates: Bargaining tab (page.tsx:425), `Phase2WizardLaunchCard` (540-544), `BargainingInsightsWidget` (600).

Profile-link gate: campaigns list organiser filter default + notice (`campaigns/page.tsx:135-139, 413-418`).

### 5.6 Settings / feature-flag mechanisms

- `app_settings` (key/value) — admin-only `GET/PATCH /api/admin/settings` with an `ALLOWED_KEYS` allow-list of **integration credentials only** (Action Network key, Mobile Message creds, `sms_provider`, webhook tokens, SendGrid, from-address) — `src/app/api/admin/settings/route.ts:4-23, 48-91`. Read by SMS/email providers (`src/lib/sms/provider/index.ts:39`, `src/lib/email/provider/index.ts:32`) and webhooks. Admin UI: Administration → Settings (`SettingsTab`, `administration/page.tsx:1581`).
- Env flags only: `NEXT_PUBLIC_AI_CACHE_ENABLED` (`src/lib/ai-cache.ts:58`), PostHog config.
- Per-viewer prefs only in `localStorage` (`wallchart:displayMode:<campaignId>` — `wall-chart/use-display-mode.ts:6-35`); sidebar collapse is transient state (`sidebar.tsx:65`).
- **There is no per-user, per-team or per-org mechanism to enable/disable modules.** `user_profiles` has no preferences/JSON column.
- Admin-configurable per-user fields today (Administration → System → Users): Permission level (admin/user/viewer), display name, email, phone, Work Role, Reports To (`administration/page.tsx:546-623`); API allow-list `update-user/route.ts:127-136` (`work_role`, `reports_to`, `role`, `display_name`, `phone`); organiser link via `organiser_id`.
- Product-spec mismatch: `OA_PRODUCT_SPEC.md:31-35` describes Admin / Lead organiser / Assigned organiser, whereas code implements admin/user/viewer + free `work_role`.

---

## 6. Campaign scoping

- **"My campaigns" today** = campaigns whose `campaigns.organiser_id` equals `profile.organiser_id` — a client-side filter on the list page only (`campaigns/page.tsx:135-139, 207-212`; `CampaignsDashboard.tsx:100-103`). Campaigns have a single owner organiser plus `created_by` (permission migration) — see `CampaignDetail.organiser_id` (page.tsx:93).
- **Campaign team** (`campaign_organisers` with `campaign_role`, `reports_to_organiser_id`): CRUD via `/api/campaign-organisers/[campaignId]` and `usePlannerCampaigns.ts:216-302`; shown only on `/campaigns/[id]/plan` "Campaign Team" (352-420). **Not used for scoping any list.**
- **Lead hierarchy** (`user_profiles.reports_to`): used by the planner wizard to default the campaign organiser to the user's lead (`planner-wizard.tsx:335-345`), by `useLeadOrganisers` (`usePlannerOptions.ts:143-170`), by DB helper `is_lead_organiser_for_campaign`, and by `/api/permissions/pending`. **Not used for any list filter.**
- **Workload "My Team / Me Only"**: client sends `filterOrganiser=team|me` (`workload-filters.tsx:45-46`); the API maps only `"me"` → `user.id`, and `"team"` → `null` = no filter (`src/app/api/workload/route.ts:63-66`); the RPC filters `wds.created_by = p_filter_organiser` (`supabase/migrations/20260404000000_fix_workload_function_return_type.sql:65`). So **"My Team" shows everyone**, and "Me" matches `created_by` (user id), not `organiser_id`. Default is "team" (`dashboard/page.tsx:37`, `workload-tab.tsx:18`).
- **Organiser patches** (`organiser_patches`, `organiser_patch_assignments`): assign worksites/employers/agreements to organisers (README:17; admin tab, `/organiser-patches`, report card). Not used for campaign scoping.
- Hidden SMS-episode campaigns are excluded from every list via `excludeSmsEpisodes` (`src/lib/campaign/visible-campaigns.ts:12-17`).
- **Campaign switcher:** none globally. Local pickers exist in: campaigns list organiser filter (`CampaignsDashboard.tsx:175-187`), SMS inbox campaign dropdown (`sms/inbox/page.tsx:5-6`; `SmsInboxPanel.tsx:11-13`), Email inbox "All campaigns" select (`EmailInboxPanel.tsx:320-323`), SMS hub scope select (`SmsHubPage.tsx:268-277`), Reports "Pick a campaign" (`reports/campaign-progress/page.tsx:75`, `reports/campaign-facts/page.tsx:73`). Inside a campaign the only route to another campaign is Back → `/campaigns`.

---

## 7. Cross-links out of the campaign context

Exits from `/campaigns/[id]` (page + header bar + overview cards):

| # | From | To | Return path provided? |
|---|---|---|---|
| 1 | Overview → "Employers & worksites" card | `/employers/[id]` (`campaign-employers-worksites-card.tsx:114-121`), `/worksites/[id]` (146-153); plain `<Link>` with `ExternalLink` icon, no `?from=` | No: `/employers/[id]` has "Back to Employers" (`employers/[id]/page.tsx:799-800`) and `/worksites/[id]` "Back to Worksites" (`worksites/[id]/page.tsx:1305-1306`) → lists, not the campaign |
| 2 | Header Back arrow | `/campaigns` list (`header-bar:242`) | n/a |
| 3 | Outreach → SOC card | `/campaigns/soc-wizard?cid=` (page.tsx:797) — leaves campaign chrome (`campaign-detail-routes.ts:8`) | wizard-internal only |
| 4 | Actions → Re-run wizard | `/campaigns/new?cid=…&edit=1` (`header-bar:210`) — leaves campaign chrome | wizard-internal only |
| 5 | Wizard step "allocate workers" | `/workers` (`step-allocate-workers.tsx:468`) | No |
| 6 | Header/plan links | `/plan`, `/plan/stage/[n]`, `/bargaining`, `/settings`, phone/email/sms sub-routes | Yes: breadcrumbs (`plan/page.tsx:172-174`, `bargaining/page.tsx:131-133`), "Back to Campaign" (`plan/stage:250,261,538`), and the shared header bar |

Worker profiles: the wall chart and list view open `WorkerDetailSheet` in place (`campaign-worker-detail-provider.tsx`; no `/workers/` link in `worker-detail-sheet.tsx`, `worker-tile.tsx`, `workforce-list-view.tsx`). `/workers/[id]` is reached from Overview → Workers and from the Email inbox sidebar (`EmailContextSidebar.tsx:183`); it navigates back with `router.back()` (`workers/[id]/page.tsx:973, 985, 1005`) and has no link to campaigns. `/agreements/[id]` links *forward* to a linked campaign's plan (615) or to `/campaigns/new?agreement_id=` (624). Report sub-pages pick a campaign but expose no link back into the detail page **(inference from headings grep; not exhaustively verified)**. No entity page reads a `returnTo`/`from` param; the only `returnTo` usage is inside the phone/email setup chains.

**Count:** 4 distinct ways out of campaign context from the detail page itself (employer, worksite, campaigns list, and the two wizards that drop the campaign header), plus the ever-present sidebar/mobile menu (10-13 items) that is rendered on every campaign route via `<MobileNav/>` in the header bar and the desktop sidebar.

---

## 8. Mobile

- Sidebar hidden below `md`; `MobileNav` Sheet exposes the **identical** 10 (+3 admin) items plus name / Hard Refresh / Sign out (`mobile-nav.tsx:79-172`). No task-first or trimmed mobile nav.
- Device detection is **server-side UA sniffing** in `src/proxy.ts:8-11` → `x-viewport` header → `RootLayout` (`src/app/layout.tsx:36-37`) → `DeviceProvider` (`src/components/providers.tsx:475`; `src/contexts/device-context.tsx`). The **only consumer** is `DataTable` (`src/components/data-tables/data-table.tsx:69, 188-240`), which renders cards instead of rows. iPad is classified as mobile (regex includes `iPad`).
- Campaign header bar wraps (`flex-wrap`, `header-bar:236`) with 5 buttons + dropdowns; top-level tabs wrap (`flex flex-wrap h-auto`, page.tsx:417); the four sub-tab lists have no wrap class (529, 585, 613, 765) — **(inference)** likely horizontal overflow on phones.
- **Wall chart:** native HTML5 drag-and-drop — `draggable`/`onDragStart`/`dataTransfer` with custom MIME types (`wall-chart/worker-tile.tsx:219-225, 315-316`; drop in `wall-chart/campaign-unit-card.tsx:139-141`; `wall-chart/dnd.ts:8-9`), Shift-key toggles copy (141). No touch polyfill in `package.json` or `src`; `@dnd-kit` is installed but used only by `section-planning/SectionWhereToPlayPanel.tsx:253-255`. The 2527-line `campaign-wall-chart.tsx` has 2 responsive utility classes (1619, 1915). **(inference)** Mobile browsers do not fire HTML5 drag events for touch, so moving workers between units, dragging into Build list and unit reordering are unusable on phones/tablets; the List view (`workforce-list-view.tsx`, `overflow-x-auto` table at 733) is the de-facto mobile fallback but is not auto-selected.
- Inboxes are mobile-aware: `SmsInboxPanel.tsx:4-6` collapses to list ↔ full-screen thread with a bottom Sheet; `EmailInboxPanel.tsx` has responsive handling (11 matches).
- Dedicated mobile flows exist **outside** the shell: `/call/[token]` volunteer dialer (shared from `phone/lists/[listId]` "Share for mobile calling", 569; `InlinePhoneOpsPanel.tsx:257`) and `/leader/task` webform.
- Stage-planner routes show a mobile-only header with just the menu (`header.tsx:35-44`).

---

## 9. Pain points (inferred from the inventory)

1. **Flat, mixed-purpose sidebar.** 13 peers with no grouping: organiser tasks (Campaigns, Email Inbox, SMS Inbox), org databases (Overview, Worksites, Upcoming Projects), analytics (Dashboard, Reports), training (Guides) and admin. Dashboard / Overview / Reports / Workload overlap heavily; SMS has two entries while Email has one (its hub is split between sidebar and admin items).
2. **Campaign detail depth.** 8 × 20 × 16 ≈ 44 surfaces, three levels deep (Outreach → Comms → Inbox; Workforce → Activists & WOCs → 4A Tasking; Outreach → SMS → Chats). Everything is on one client page (904 lines) that also holds universe/action dialogs (335-371, 626-727).
3. **Inconsistent defaults.** Detail default = Overview; list row and Build-list → Workforce/Wall chart; dashboard cards → Overview; pending-review widget → Plan/Pending review; Templates on the list page vs `/templates`.
4. **Duplicated entry points.**
   - Phone: header **Create Phone Call** (`header-bar:174`) *and* Outreach → Phone Ops **Create Phone Call** (`InlinePhoneOpsPanel.tsx:66-71`), plus org-level `/campaigns/phone-wizard` (list strip `campaigns/page.tsx:388`, empty-state `CampaignsDashboard.tsx:233`), Build-list fire → `/fire/phone`.
   - SMS: header **Create SMS**, Outreach → SMS panel, `/sms` hub "Start a new SMS action" cards (`SmsHubPage.tsx:229-248`), `/sms/new`, sidebar SMS Tools, list-strip "SMS tools", Build-list fire → `/fire/sms`.
   - Email: header **Create Email**, Comms → Drafts & Send, `/campaigns/email-wizard` (list strip + empty state), Build-list fire → `/fire/email`.
   - Import worker list: header Build menu, Overview tab button (page.tsx:431-438), wall chart, three wizard steps, Overview → Workers tab, Administration — 8 mount points of `WorkerImportWizard`.
   - Campaign creation: Create campaign dialog (wizard | manual), planner-wizard variant of `/campaigns/new`, Dashboard "Create Plan", agreement page "new campaign", list-strip "Import lists" (`CampaignImportWizard`).
5. **Inconsistent labels.** Sidebar "Guides" vs h1 "How-to guides"; "SMS Tools" vs hub "Actions"; Workforce sub-tab "Scope" renders `CampaignUniverseSection` + "Named universes"; "Wall Chart / List"; "Overview" means org databases at top level but campaign summary inside a campaign; header "Agreements (EBAs)" vs page "Agreements"; duplicate h1 + header title on most pages; fallback title "Offshore Alliance" on `/help`, `/upcoming-projects`, `/email-imports`.
6. **Orphans and duplicates.** `/campaigns/[id]/add-workers` (no inbound link); permissions panels (unused); `/workers`, `/programs`, `/agreements`, `/work-scopes`, `/templates`, `/organiser-patches`, `/workload` are thin duplicates of Overview/Admin/Campaigns tabs reachable mainly by URL; Dashboard "Recent Activity" is a static placeholder (580-589) and its "Active Campaigns" rows are not clickable (549-564).
7. **Admin tools mixed with organiser tools.** Upcoming Projects (regulator import) in the main nav; admin-only merge inside Overview → Employers; admin control on worksite detail; "Import lists" next to "Create campaign"; Workload and Organiser Patches exist both as pages and as Administration sub-tabs; Email Imports / Email Wrappers promoted to top-level items.
8. **Role model too coarse for the ask.** admin ≡ user at the DB; no client notion of lead organiser; "My Team" is a no-op; the campaign permission system is dormant; product spec and code disagree on roles.
9. **Context loss in wizards.** `soc-wizard`, `new?cid=`, `email-wizard`, `phone-wizard` are deliberately excluded from the campaign header (`campaign-detail-routes.ts:6-12`), so the campaign name/back/resume banners disappear mid-task.
10. **Mobile.** Identical nav to desktop; wall chart drag unusable on touch; sub-tab rows likely overflow; only `DataTable` adapts.

---

## 10. Concrete hooks for an "organiser campaign view"

Existing code that a simplified, admin-configurable organiser mode can build on:

1. **Auth context** — `useAuth()` already returns `profile.work_role`, `profile.reports_to`, `profile.organiser_id`, `isAdmin`, `canWrite` (`auth-context.tsx:29-41, 361-377`). Adding `isLeadOrganiser`/`isOrganiser` derived flags is a one-file change; `PUBLIC_PATHS` (27) shows the pattern for route classes.
2. **Nav arrays** — `navItems` / `adminItems` / `allNavHrefs` are exported from `sidebar.tsx:33-53` and consumed by both `Sidebar` and `MobileNav`; a `module`/`group`/`visibleWhen(ctx)` field on each item gives one place to hide non-campaign items for organisers and keep them under a "More" group. `isNavItemActive` already handles nested hrefs.
3. **Shell + route helpers** — `(dashboard)/layout.tsx` is the single shell; `Header` already branches by route (`isCampaignDetailRoute`, `isStagePlanningRoute`, `getCampaignIdFromPath`), and `CampaignDetailHeaderBar` already embeds `MobileNav` and a minimal "episode" variant (120-136) — precedents for a campaign-first chrome where the campaign header is the primary nav and the sidebar becomes secondary.
4. **Tab registry** — `src/lib/campaign-tabs.ts` (`VALID_TABS`, `DEFAULT_SUB`, `REDIRECT_MAP`, `resolveTabParams`) is the natural place to add per-tab `module` keys and an `enabledTabs` filter; unknown/hidden tabs already fall back to `overview` (page.tsx:174-181, 186-206), so hiding a tab is safe for bookmarks.
5. **Settings storage** — `app_settings` + `/api/admin/settings` `ALLOWED_KEYS` (`admin/settings/route.ts:4-23`) can hold an org-wide `organiser_modules` JSON with admin UI in Administration → Settings (`SettingsTab` 1581). For per-user overrides, `user_profiles` (typed at `organising-row-types.ts:832-842`) is the home: add a column (migration), extend `update-user/route.ts:127-136` allow-list and the Users form (`administration/page.tsx:546-623`), and read it through `AuthProvider.fetchProfile` (`select("*")`, 113-117) so it arrives with the role.
6. **Scoping primitives** — `profile.organiser_id` filter (`campaigns/page.tsx:135-139`), `campaign_organisers` API + hooks (`usePlannerCampaigns.ts:216-302`), `useLeadOrganisers`/`reports_to` (`usePlannerOptions.ts:143-170`), and DB helpers `is_lead_organiser_for_campaign`, `is_assigned_to_campaign`, `can_write_to_campaign` (permission migration 141-198) can back a single `my_campaigns` RPC (owner ∪ team member ∪ reports-to-lead) used by the list page, dashboard widgets and inbox pickers. `excludeSmsEpisodes` (`visible-campaigns.ts`) shows the pattern of one shared filter applied to every list query.
7. **Focused-mode precedents** — stage planner pages render their own chrome and "Back to Campaign" (`plan/stage/[n]:250-261`), and the SMS chat workspace has a minimal header — reusable for a distraction-free organiser layout.
8. **Deep-link targets already exist** — `PendingReviewWidget` (`?tab=plan&sub=pending-review`), `CampaignProgressCard`/`CampaignEntitiesCard`/`CampaignActivitiesCard` (`/campaigns/[id]`), Build-list fire redirects (`?tab=outreach&sub=sms&sms_list=`) — a "my campaign" home can be composed from these cards without new routes.
9. **Mobile primitives** — `DeviceProvider`/`useDevice` (`contexts/device-context.tsx`) and `DataTable` card mode; `WorkforceBoard`'s `?view=list` toggle (`workforce-board.tsx:15-47`) could default to `list` when `isMobile`.
10. **Per-viewer persistence pattern** — `use-display-mode.ts` (localStorage per campaign) and `sessionStorage` cooldown keys in `providers.tsx` show the accepted client-side persistence idiom for lightweight preferences (e.g. "last campaign", "simple mode" until a server column exists).
11. **Telemetry** — `PostHogPageView` (`providers.tsx:478`) is mounted globally; nav usage can be measured before and after the change.
12. **Help content** — `public/help-videos/manifest.json` series A-E (Set up a campaign, Units, Wall charts, Tasking, Assessments) map cleanly onto a campaign-first IA and could be surfaced contextually inside the campaign instead of as a top-level "Guides" item.
