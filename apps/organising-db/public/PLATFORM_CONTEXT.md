# OAPlanning — Platform Context for Integration

This document is written for an agent working on the **Offshore Alliance Organising Database** (or any developer extending the integration between the two applications). It covers the OAPlanning app's architecture, its relationship to the shared Supabase instance, every integration point, known gaps, and what would be needed to create a seamless unified user experience.

---

## 1. Platform Overview

**OAPlanning** is a campaign strategic planning tool for enterprise bargaining campaigns run by the Offshore Alliance. It implements a "Playing to Win" methodology structured around six sequential campaign stages and five gate assessments.

### Purpose

Organisers use this app to:
- Plan and track enterprise bargaining campaigns from initial contact mapping through to bargaining
- Set stage-level ambitions, "Where to Play" choices, and a Theory of Winning (AI-assisted)
- Manage capacity and resource allocation per stage
- Define and assess gate criteria that must be met before advancing stages
- Track timelines relative to agreement expiry dates and PABO deadlines
- Generate and export reporting snapshots

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.x (App Router) |
| Language | TypeScript 5, strict mode |
| Database | Supabase (shared with Organising DB) |
| Auth | Supabase Auth via `@supabase/ssr` (cookie-based) |
| Client state | TanStack Query v5 (React Query) |
| UI components | Radix UI primitives + shadcn/ui patterns |
| Styling | Tailwind CSS 3.4 + CSS variables |
| Forms | react-hook-form + zod v4 |
| AI | Anthropic Claude (`claude-opus-4-5`) via `@anthropic-ai/sdk` |
| Deployment | Vercel (with weekly cron job) |
| Path alias | `@/*` → `./src/*` |

### Repository Layout

```
OAPlanning/
├── src/
│   ├── app/
│   │   ├── (app)/                  # Authenticated shell layout
│   │   │   ├── layout.tsx          # Server: loads user + profile, renders AppShell
│   │   │   ├── dashboard/          # Active campaign cards, summary stats
│   │   │   ├── campaigns/          # List, create wizard, detail, stage, gate pages
│   │   │   ├── reports/            # Snapshot generation + CSV export
│   │   │   └── settings/           # User profile (admin only in nav)
│   │   ├── api/
│   │   │   ├── theory-of-winning/  # POST — calls Anthropic, returns ToW JSON
│   │   │   └── snapshots/          # POST (manual) / GET (Vercel cron)
│   │   ├── auth/callback/          # OAuth code exchange
│   │   └── login/                  # Email/password login page
│   ├── components/
│   │   ├── campaign/               # CampaignCreationWizard, CampaignTimeline
│   │   ├── planning/               # Per-stage planning panels (5 panels)
│   │   ├── gates/                  # GateAssessment component
│   │   ├── layout/                 # AppShell (nav, user menu, sign-out)
│   │   └── ui/                     # shadcn-style primitives
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser Supabase client
│   │   │   └── server.ts           # Server + service-role Supabase clients
│   │   ├── hooks/
│   │   │   ├── useCampaigns.ts     # Campaign list, detail, create mutation
│   │   │   ├── useStagePlan.ts     # Stage plan + all child data, mutations
│   │   │   ├── useGateAssessment.ts
│   │   │   ├── useOptions.ts       # Catalog option tables
│   │   │   └── useTheoryOfWinning.ts
│   │   └── utils/
│   │       ├── timeline.ts
│   │       ├── gate-logic.ts
│   │       └── option-sorting.ts
│   ├── types/
│   │   ├── database.ts             # Supabase-generated full schema types
│   │   └── index.ts                # App-facing aliases, enums, composite types
│   └── middleware.ts               # Auth guard + route redirects
├── supabase/migrations/
│   ├── 20260330000001_planning_tables.sql
│   ├── 20260330000002_rls_policies.sql
│   └── 20260330000003_seed_data.sql
└── vercel.json                     # Cron: GET /api/snapshots every Monday 09:00
```

---

## 2. Shared Supabase Instance

Both OAPlanning and the Organising Database connect to the **same Supabase project**. This means:

- Auth sessions are shared — a user who signs in to either app is authenticated in both
- All tables from both apps exist in the same `public` schema
- RLS policies on planning tables explicitly traverse organising tables (`agreement_organisers`, `user_profiles`, `campaigns`) to determine access rights
- The generated `src/types/database.ts` file contains **all** tables from both apps — it reflects the full combined schema

### Environment Variables

| Variable | Scope | Used in |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Browser + server clients, middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Browser + server clients, middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | `createServiceClient()` in `server.ts` — bypasses RLS |
| `ANTHROPIC_API_KEY` | Server only | `POST /api/theory-of-winning` |
| `CRON_SECRET` | Server only | `GET /api/snapshots` (Vercel cron auth header) |
| `NEXT_PUBLIC_APP_URL` | Public | Auth redirect base URL |

> The organising database must use the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values. Auth tokens issued by either app are valid across both.

---

## 3. Database Schema — Table Ownership Map

### Owned by the Organising Database (pre-existing, not defined in OAPlanning migrations)

These tables are assumed to exist and are referenced via foreign keys or RLS joins. OAPlanning reads from them but does not manage their lifecycle.

| Table | Role |
|-------|------|
| `campaigns` | Core campaign record — `campaign_id`, `name`, `description`, `campaign_type`, `organiser_id`, `start_date`, `status` |
| `organisers` | Organiser people records — `organiser_id`, `organiser_name`, `email`, `phone` |
| `agreements` | Enterprise agreements — `agreement_id`, `agreement_name`, `short_name`, `expiry_date`, `status` |
| `agreement_organisers` | Junction: which organisers are assigned to which agreements |
| `agreement_worksites` | Junction: worksites covered by each agreement |
| `agreement_employers` | Junction: employers bound by each agreement |
| `workers` | Individual worker/member records |
| `worker_agreements` | Junction: worker membership against agreements |
| `worksites` | Physical worksite records |
| `employers` | Employer company records |
| `sectors` | Industry sector classifications |
| `unions` | Union entities |
| `user_profiles` | App user profiles — `user_id` (FK to `auth.users`), `organiser_id`, `role`, `work_role`, `reports_to` |
| `projects` | (Present in schema — purpose unclear from OAPlanning perspective) |
| `tags`, `worker_tags`, `worksite_tags`, `employer_tags` | Tagging system |
| `documents` | Document attachments |
| `communications_log` | Communication history |
| `import_logs` | Data import audit trail |
| **Views** | `agreements_view`, `campaigns_view`, `employers_view`, `organising_universe_view`, `workers_view`, `worksites_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary` |

### Owned by OAPlanning (added via `supabase/migrations/`)

| Table | Role |
|-------|------|
| `campaign_stage_plans` | One row per campaign per stage (6 rows per campaign). Holds status, planned/actual dates. |
| `plan_ambitions` | Stage ambition items — links to `ambition_options` catalog or custom text |
| `plan_where_to_play` | Stage "Where to Play" choices — category + option + rationale + priority |
| `plan_theory_of_winning` | AI-generated or manual Theory of Winning statement + gap analysis + risk assessment (JSONB) |
| `plan_capacities` | Required capacities/resources per stage — status, assigned organiser, gap description |
| `plan_management_systems` | Management rhythms per stage — frequency, responsible organiser, metrics JSONB |
| `gate_definitions` | 5 gates per campaign — name, enforcement type (`hard`/`soft`) |
| `gate_criteria` | Individual measurable criteria within each gate — metric type, target value, current value, is_met |
| `gate_assessments` | Audit trail of gate review outcomes (`passed`, `failed`, `override_approved`, `deferred`) |
| `campaign_timelines` | Agreement expiry date, PABO date, peak engagement target date — one per campaign |
| `stage_timeline_targets` | Planned/actual start+end dates per stage within the timeline |
| `reporting_snapshots` | Periodic JSONB state snapshots for dashboards and export |
| `ambition_options` | Catalog of standard ambition options per stage (seeded, user-extensible) |
| `wtp_categories` | "Where to Play" category definitions |
| `wtp_options` | Options within each WTP category |
| `capacity_options` | Catalog of standard capacity/resource options per stage |
| `management_system_options` | Catalog of standard management rhythm options per stage |

---

## 4. Foreign Key Integration Points

These are the database-level joins that bridge OAPlanning tables to organising tables. They are the integration seam an agent must understand.

```
campaigns.organiser_id
    → organisers.organiser_id
    (Lead organiser for the campaign)

campaign_timelines.agreement_id
    → agreements.agreement_id
    (Agreement whose expiry drives the campaign timeline)

plan_capacities.assigned_to
    → organisers.organiser_id
    (Organiser responsible for a specific capacity item)

plan_management_systems.responsible_organiser_id
    → organisers.organiser_id
    (Organiser responsible for a management rhythm)

campaign_stage_plans.created_by  /  gate_assessments.assessed_by  /  gate_assessments.approved_by
    → auth.users.id
    (Audit trail of who performed actions)

user_profiles.organiser_id
    → organisers.organiser_id
    (Ties an authenticated user to their organiser record)

user_profiles.reports_to
    → user_profiles.user_id
    (Reporting hierarchy used by is_lead_organiser_for_campaign() RLS)
```

### RLS Join Path (Critical)

The `is_assigned_to_campaign()` helper determines whether a logged-in user can access planning data for a campaign. It traverses organising tables:

```sql
user_profiles.organiser_id
    → agreement_organisers.organiser_id
    → agreements.agreement_id
    (any agreement, not filtered to campaign's agreement — see Known Issues)
    → campaigns.campaign_id  (checked separately)
```

This means: **if an organiser is assigned to any agreement in the system, and there is a campaign, they may pass this check**. See section 9 for the full risk assessment.

---

## 5. Authentication and User Roles

### Auth Flow

1. User visits any route — `src/middleware.ts` applies Supabase session cookie refresh
2. Unauthenticated requests to non-public routes are redirected to `/login`
3. Login page calls `supabase.auth.signInWithPassword()` client-side; on success redirects to `/dashboard`
4. OAuth callback at `/auth/callback` exchanges code for session
5. `(app)/layout.tsx` (server component) calls `supabase.auth.getUser()` and fetches `user_profiles` with nested `organisers` — if no user, redirects to `/login`

### Public routes (no auth required)
- `/auth/*`
- `/api/auth/*`
- `/login`

### User Profile Structure

The `user_profiles` table (owned by organising DB) is the source of truth for roles:

```typescript
{
  user_id: string          // FK → auth.users.id
  organiser_id: number     // FK → organisers.organiser_id
  role: string             // 'admin' | (other roles)
  work_role: string        // 'lead_organiser' | (other roles)
  reports_to: string       // user_id of manager (UUID)
  // ... other profile fields
}
```

### Role Behaviour in OAPlanning

| Role | Access |
|------|--------|
| `role = 'admin'` | Full access to all campaigns and all planning data; Settings nav link; Admin badge in UI |
| `work_role = 'lead_organiser'` | Full read/write on campaigns where they are the lead organiser or where the organiser reports to them |
| Assigned organiser | Read on most planning data; write on stage plans, plan child tables; cannot create/approve gate assessments |

---

## 6. RLS Security Model

All OAPlanning tables have RLS enabled. Three Postgres helper functions (defined as `SECURITY DEFINER`) are the foundation:

### `is_admin()`
```sql
SELECT EXISTS (
  SELECT 1 FROM user_profiles
  WHERE user_id = auth.uid() AND role = 'admin'
);
```

### `is_lead_organiser_for_campaign(p_campaign_id INTEGER)`
```sql
-- User's work_role = 'lead_organiser' AND they own the campaign's organiser_id
-- OR they manage the organiser via reports_to chain
```

### `is_assigned_to_campaign(p_campaign_id INTEGER)`
```sql
-- User's organiser_id is in agreement_organisers for any agreement
-- (not campaign-specific — see Known Issues)
-- OR user's organiser_id = campaigns.organiser_id
```

### Policy Tiers Per Table

| Table group | Admin | Lead organiser | Assigned organiser |
|-------------|-------|----------------|--------------------|
| Option/catalog tables | ALL | read | read |
| `campaign_stage_plans` | ALL | ALL | read + update |
| Plan child tables (`plan_ambitions`, `plan_where_to_play`, `plan_theory_of_winning`, `plan_capacities`, `plan_management_systems`) | ALL | ALL | ALL |
| `gate_definitions` | ALL | ALL | read |
| `gate_criteria` | ALL | ALL | ALL |
| `gate_assessments` | ALL | ALL | read only (no insert) |
| `campaign_timelines` | ALL | ALL | read |
| `stage_timeline_targets` | ALL | ALL | ALL |
| `reporting_snapshots` | ALL | ALL | read |

---

## 7. Application Routes and Features

### Route Map

| Route | Page file | Description |
|-------|-----------|-------------|
| `/` | `app/page.tsx` | Redirect → `/dashboard` |
| `/login` | `app/login/page.tsx` | Email + password login form |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth session exchange |
| `/dashboard` | `(app)/dashboard/page.tsx` | Active campaign cards with stage progress, PABO countdown, expiry badges |
| `/campaigns` | `(app)/campaigns/page.tsx` | All campaigns list with search and status filter |
| `/campaigns/new` | `(app)/campaigns/new/page.tsx` | `CampaignCreationWizard` — multi-step form |
| `/campaigns/[id]` | `(app)/campaigns/[id]/page.tsx` | Campaign summary: timeline, stage cards, gate progress |
| `/campaigns/[id]/stage/[stageNumber]` | `(app)/campaigns/[id]/stage/[stageNumber]/page.tsx` | "Playing to Win" tabs: Ambitions, Where to Play, Theory of Winning, Capacities, Management Systems |
| `/campaigns/[id]/gate/[gateNumber]` | `(app)/campaigns/[id]/gate/[gateNumber]/page.tsx` | Gate criteria assessment form + assessment history |
| `/reports` | `(app)/reports/page.tsx` | Campaign report UI, manual snapshot trigger, CSV export |
| `/settings` | `(app)/settings/page.tsx` | User profile display (admin-only nav entry) |

### Campaign Creation Wizard (`CampaignCreationWizard`)

The wizard collects:
- Campaign name, description, type
- Lead organiser (selected from `organisers` table)
- Start date
- Agreement link (`agreement_id` from `agreements` table) and/or manual expiry date
- Whether MSD (Majority Support Determination) is required
- Stage date planning (planned start/end per stage)
- Gate enforcement type overrides

On completion it inserts:
1. `campaigns` row
2. 6 × `campaign_stage_plans` rows (stage 1 = `active`, others = `draft`)
3. 5 × `gate_definitions` rows
4. Default `gate_criteria` rows per gate (4 criteria each, ~20 total)
5. `campaign_timelines` row (if agreement/expiry provided)
6. `stage_timeline_targets` rows (if stage dates provided)

### Stage Planning Page (The Core Feature)

At `/campaigns/[id]/stage/[stageNumber]`, five tabs are rendered:

1. **Ambitions** (`AmbitionPanel`) — Select from `ambition_options` catalog or add custom; set target value/unit/date
2. **Where to Play** (`WhereToPlayPanel`) — Select options from `wtp_categories`/`wtp_options`; mark inclusions/exclusions; set priority and rationale
3. **Theory of Winning** (`TheoryOfWinningPanel`) — Manual edit or AI-generate via Anthropic; stores if-then statement, gap analysis, risk assessment, member agency text, employer response plan
4. **Capacities** (`CapacitiesPanel`) — Select from `capacity_options`; set status (`needed`/`available`/`gap`/`in_progress`); assign organiser; describe gaps
5. **Management Systems** (`ManagementSystemsPanel`) — Select from `management_system_options`; set frequency and responsible organiser

### AI Theory of Winning

The `POST /api/theory-of-winning` route assembles a structured prompt from:
- Campaign context (employer name, worksite names, agreement name/expiry, sector, is_greenfield, days to PABO)
- Current stage ambitions, WTP choices, capacities
- Previous stage's theory (for continuity)

It calls `claude-opus-4-5` and parses the response as JSON. The response shape is:

```typescript
interface TheoryOfWinningResponse {
  if_then_statement: string
  gap_analysis: GapAnalysisItem[]       // JSONB stored in plan_theory_of_winning
  risk_assessment: RiskAssessmentItem[] // JSONB stored in plan_theory_of_winning
  member_agency_assessment: string
  employer_response_considerations: string
}
```

---

## 8. Data Flow

```
Browser request
    │
    ▼
src/middleware.ts
    │  Refresh Supabase session cookie
    │  Redirect unauthenticated → /login
    │
    ▼
(app)/layout.tsx  [Server Component]
    │  createServerClient() — reads cookies
    │  supabase.auth.getUser()
    │  supabase.from('user_profiles').select('*, organisers(*)')
    │  Passes user + profile to AppShell (client component)
    │
    ▼
Page component  [Client Component — 'use client']
    │  TanStack Query hooks (useCampaigns, useStagePlan, etc.)
    │  createClient() — browser Supabase client
    │  Supabase PostgREST queries with RLS
    │
    ▼
Supabase Database (shared instance)
    │  RLS evaluated per-row using auth.uid()
    │  is_admin() / is_lead_organiser_for_campaign() / is_assigned_to_campaign()
    │
    ▼
TanStack Query cache
    │  queryKey: ['campaigns'], ['campaign', id], ['stage-plan', campaignId, stageNum]
    │  Mutations call queryClient.invalidateQueries() to refresh UI
    │
    ▼
React component render
```

### Key Query Shapes

**`useCampaigns()`** — list view:
```
campaigns (*)
  organisers (organiser_name, email)
  campaign_stage_plans (plan_id, stage_number, stage_name, status)
  campaign_timelines (timeline_id, agreement_expiry_date, pabo_available_date, working_backwards,
    agreements (agreement_name, short_name))
  gate_definitions (gate_id, gate_number, gate_name, enforcement_type)
```

**`useCampaign(id)`** — detail view:
```
campaigns (*)
  organisers (organiser_name, email, phone)
  campaign_stage_plans (plan_id, stage_number, stage_name, status, planned/actual dates)
  campaign_timelines (*,
    agreements (agreement_name, short_name, expiry_date, status)
    stage_timeline_targets (*))
  gate_definitions (*,
    gate_criteria (*))
```

**`useStagePlan(campaignId, stageNumber)`** — stage planning view:
```
campaign_stage_plans (*)
  plan_ambitions (*, ambition_options(*))
  plan_where_to_play (*, wtp_categories(*), wtp_options(*))
  plan_theory_of_winning (*)
  plan_capacities (*, capacity_options(*), organisers(organiser_name))
  plan_management_systems (*, management_system_options(*), organisers(organiser_name))
```

---

## 9. Known Issues and Integration Gaps

### Bug: Employer name incorrectly sourced

**Location:** `src/app/(app)/campaigns/[id]/stage/[stageNumber]/page.tsx`

`campaign_context.employer_name` passed to the Theory of Winning AI prompt is set from:
```typescript
(campaign as any)?.organisers?.organiser_name
```
This is the **lead organiser's name**, not the employer. The correct value requires joining:
```
campaign_timelines.agreement_id
  → agreements.agreement_id
  → agreement_employers.agreement_id
  → employers.employer_id
  → employers.employer_name
```
This join is not currently in the `useCampaign` query. Fixing it would significantly improve AI output quality.

### Gap: Worksite names not populated in AI context

**Location:** Same page as above

`campaign_context.worksite_names` is passed as an empty array `[]`. The correct join is:
```
campaign_timelines.agreement_id
  → agreements.agreement_id
  → agreement_worksites.agreement_id
  → worksites.worksite_id
  → worksites.worksite_name
```

### Gap: Gate criteria current values manually entered only

Gate criteria `current_value` and `is_met` fields are manually updated via the gate assessment form. There is no live data connection to organising DB tables (e.g. `worker_agreements` for membership density, `workers` for contact counts). These could be auto-populated from organising DB queries.

### Risk: `is_assigned_to_campaign()` RLS oversharing

The current implementation:
```sql
SELECT 1 FROM user_profiles up
JOIN agreement_organisers ao ON ao.organiser_id = up.organiser_id
JOIN campaigns c ON c.campaign_id = p_campaign_id
JOIN agreements a ON a.agreement_id = ao.agreement_id
WHERE up.user_id = auth.uid()
```
The join between `campaigns` and `agreements` is not constrained — it does not require `a.agreement_id = c.agreement_id` (via `campaign_timelines`). An organiser assigned to any agreement may pass this check for any campaign. This is probably an oversight and should be audited.

### Bug: Cron snapshot route uses anon client

**Location:** `src/app/api/snapshots/route.ts` — `GET` handler

The route is called by the Vercel cron job with no user session. The code uses `createClient()` (browser/anon client), which means Supabase evaluates RLS with `auth.uid() = null`. This will fail for any campaign where the RLS policies require an authenticated user. The route should use `createServiceClient()` (service role) for the cron GET handler.

### Gap: No employer/worksite data in campaign creation wizard preview

When an organiser selects an `agreement_id` in the creation wizard, no employer or worksite information is shown in the UI. A richer preview (pulled from `agreements_view` or the organising DB's `employers`/`worksites` tables) would improve data entry accuracy.

### Gap: No deep links to/from organising DB

There are no links from OAPlanning to organising DB pages (agreement detail, employer profile, worksite profile) or vice versa. Organisers must switch manually between apps with no contextual continuity.

---

## 10. Integration Opportunities

These are the enhancements that would create a seamless unified experience between OAPlanning and the Organising DB.

### High Priority

**1. Deep-link: Organising DB → OAPlanning campaign creation**

Add a "Create Campaign Plan" button on agreement detail pages in the organising DB that links to:
```
https://[oaplanning-url]/campaigns/new?agreement_id=123&expiry_date=2026-12-31
```
OAPlanning's wizard needs to accept these query params and pre-fill the agreement and expiry date fields.

**2. Deep-link: OAPlanning → Organising DB entities**

On the campaign detail page, add contextual links to:
- The linked agreement's detail page in the organising DB
- The lead organiser's profile in the organising DB
- The employer(s) on the agreement

**3. Live gate metric auto-population**

Several gate criteria map directly to data in the organising DB:

| Gate criterion | Source table | Query |
|---------------|-------------|-------|
| Membership Density (Gate 3) | `worker_agreements` | Count members / workers on agreement scope |
| Contact Details Verified (Gate 1) | `workers` | Count workers with non-null phone + email |
| Active WOCs (Gate 3) | Organising DB concept | Depends on how WOC data is stored |
| Log of Claims Survey Completion | External (survey tool) | Would require integration |

An API route or Supabase function could populate `gate_criteria.current_value` automatically.

**4. Campaign planning status badge in Organising DB**

On agreement cards/list pages in the organising DB, show a campaign planning status badge:
- "No campaign plan" (no `campaigns` row or no `campaign_stage_plans`)
- "Stage X: [Name]" (active stage)
- "Campaign complete"

Query: `SELECT * FROM campaigns JOIN campaign_stage_plans WHERE agreement_id = X`

### Medium Priority

**5. Shared navigation shell**

Add a top-level navigation switcher (e.g. a top bar) present in both apps that lets organisers move between the two without losing context. Could be implemented as:
- A shared component published to a private npm package
- A copy-paste shared layout with a feature flag for active app
- A combined Next.js app with route-level separation

**6. Unified organiser workload view**

A page (in either or both apps) showing an organiser's:
- Campaigns they are the lead organiser for
- Campaigns they are assigned to (via `agreement_organisers`)
- Capacity items assigned to them (`plan_capacities.assigned_to`)
- Management systems they are responsible for (`plan_management_systems.responsible_organiser_id`)

**7. Agreement expiry-driven campaign auto-creation prompts**

In the organising DB, surface a warning on agreements expiring within N months that have no active campaign plan. Prompt the user to create one with a single click.

### Lower Priority

**8. Cross-app reporting**

A unified dashboard (could be in either app or a new page) combining:
- Agreements expiring by quarter (organising DB)
- Campaign stage progress against expiry deadlines (OAPlanning)
- Organiser capacity across campaigns (OAPlanning `plan_capacities`)

**9. Worksite-level planning**

Currently, campaigns are at the agreement level. If the organising DB tracks engagement by worksite, OAPlanning could add worksite-level gate criteria (e.g. WOC coverage per worksite) sourced from `agreement_worksites`.

**10. Merge into a single Next.js app**

The cleanest long-term integration is a single app with:
- `/organising/*` — organising database features
- `/planning/*` — OAPlanning features
- Shared auth, shared layout, shared Supabase client
- Single `database.ts` type file
- Shared `user_profiles` context accessible everywhere

---

## 11. Information an Agent Should Confirm Before Building

Before implementing any cross-app integration, resolve these open questions:

| Question | Why it matters |
|---------|---------------|
| What is the Organising DB's repository path and URL? | Need to make changes to both repos |
| Does the Organising DB have its own `campaigns` table definition/migration, or does it use OAPlanning's? | Determines which app "owns" campaign creation |
| What framework/tech stack does the Organising DB use? | Integration approach differs if it's also Next.js vs. another framework |
| What roles/permissions model does the Organising DB use for its own pages? | Ensures nav/auth integration does not break existing access control |
| Are the apps intended to be merged into one Next.js app, or remain separate with deep-links? | Changes the integration architecture entirely |
| What is the intended URL strategy? | Same domain with path prefix (`/planning`, `/organising`), separate subdomains, or separate domains? |
| How is the `user_profiles` table structured in the Organising DB? | The `role` and `work_role` columns are relied upon by OAPlanning RLS — any changes affect both apps |
| Does the Organising DB have existing deep-link patterns to follow? | Consistency of URL structure across apps |
| Are there any existing API routes in the Organising DB that OAPlanning could call? | Avoids duplicating cross-DB queries |
| How is WOC (Workplace Organising Committee) membership tracked in the Organising DB? | Gate 2/3 criteria reference WOC establishment |

---

## 12. Type System Reference

### Core OAPlanning Types (`src/types/index.ts`)

```typescript
// Stage/Gate enumerations
type StageNumber = 1 | 2 | 3 | 4 | 5 | 6
type GateNumber = 1 | 2 | 3 | 4 | 5

// Stage names (used throughout UI)
const STAGE_NAMES = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win',
}

// Gate names
const GATE_NAMES = {
  1: 'Member Engagement Threshold',
  2: 'Engagement Ready Assessment',
  3: 'Log of Claims Survey Participation',
  4: 'Ready for Bargaining',
  5: 'Strike Ready',
}

// Status enums
type CapacityStatus = 'needed' | 'available' | 'gap' | 'in_progress'
type GateOutcome = 'passed' | 'failed' | 'override_approved' | 'deferred'
type PlanStatus = 'draft' | 'active' | 'completed' | 'blocked'
type GateEnforcementType = 'hard' | 'soft'
type MetricType = 'percentage' | 'count' | 'boolean' | 'date'
type SnapshotType = 'daily' | 'weekly' | 'gate_review' | 'manual'
```

### Composite Types

```typescript
// Full stage plan including all related planning data
interface StagePlanWithData extends CampaignStagePlan {
  ambitions: PlanAmbition[]
  where_to_play: PlanWhereToPlay[]
  theory_of_winning: PlanTheoryOfWinning[]
  capacities: PlanCapacity[]
  management_systems: PlanManagementSystem[]
}

// Campaign with timeline and agreement (partially implemented in queries)
interface CampaignWithTimeline extends Campaign {
  timeline?: CampaignTimeline & { stage_targets: StageTimelineTarget[] }
  agreement?: Agreement & { employer_name?: string; sector_name?: string }
  stage_plans: CampaignStagePlan[]
  gates: GateDefinition[]
}
```

### The `database.ts` Type File

`src/types/database.ts` is auto-generated by the Supabase CLI (`supabase gen types typescript`). It contains the full `Database` type including all tables from both apps. If the Organising DB adds new tables or modifies existing ones, this file must be regenerated in OAPlanning (and vice versa if OAPlanning's migrations run). The file should be regenerated after any schema change with:

```bash
supabase gen types typescript --project-id [project-id] > src/types/database.ts
```

---

## 13. Supabase Client Usage Patterns

### Browser client (`src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr'
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```
Used in: all `'use client'` hooks, login page. RLS applies with the logged-in user's JWT.

### Server client (`src/lib/supabase/server.ts`)
```typescript
import { createServerClient } from '@supabase/ssr'
// Reads and writes session cookies
export async function createClient() { ... }
```
Used in: `(app)/layout.tsx`, API routes. RLS applies with the logged-in user's JWT from cookies.

### Service client (`src/lib/supabase/server.ts`)
```typescript
export async function createServiceClient() {
  // Uses SUPABASE_SERVICE_ROLE_KEY — bypasses all RLS
}
```
Used in: should be used in the cron `GET /api/snapshots` route (currently not — see Known Issues).

---

## 14. Cron Job

**Vercel cron configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/snapshots",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

Schedule: every Monday at 09:00 UTC.

The cron calls `GET /api/snapshots` with the header:
```
Authorization: Bearer [CRON_SECRET]
```

The route validates this header and then iterates active campaigns to generate `reporting_snapshots` entries. **Currently broken for campaigns where the executing user (anon) fails RLS** — should be rewritten to use `createServiceClient()`.

---

## 15. Quick Reference: Where to Find Things

| I need to... | Look here |
|---|---|
| Understand how campaigns are created | `src/lib/hooks/useCampaigns.ts` → `useCreateCampaign()` |
| Understand stage planning data structure | `src/lib/hooks/useStagePlan.ts` |
| See all gate criteria defaults | `src/types/index.ts` → `DEFAULT_GATE_CRITERIA` or `useCreateCampaign()` |
| Understand RLS rules | `supabase/migrations/20260330000002_rls_policies.sql` |
| See all table schemas | `supabase/migrations/20260330000001_planning_tables.sql` |
| See what data the AI receives | `src/types/index.ts` → `TheoryOfWinningRequest` interface |
| See the full DB type schema | `src/types/database.ts` |
| Find auth/session handling | `src/middleware.ts`, `src/app/(app)/layout.tsx`, `src/lib/supabase/` |
| Understand the navigation structure | `src/components/layout/AppShell.tsx` |
| See seed data for option catalogs | `supabase/migrations/20260330000003_seed_data.sql` |
