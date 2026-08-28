# Offshore Alliance — Organising Database (organising-db)

## Product Overview

The Offshore Alliance Organising Database ("Campaign Database") is an internal
web application used by union organisers to run enterprise-bargaining and
member-organising campaigns end to end. It centralises workers, worksites,
employers, enterprise agreements, and campaigns, and provides tooling for phone
banking, email outreach, bargaining management, planning, and reporting.

- **Audience:** Union organisers, lead organisers, and administrators.
- **Platform:** Responsive web app (desktop-first).
- **Tech stack:** Next.js 16 (App Router, React 19), TypeScript, Supabase
  (Postgres + Auth, cookie-based sessions via `@supabase/ssr`), TanStack Query,
  Radix UI + Tailwind CSS, Zod + react-hook-form, Recharts, Leaflet maps.
- **Auth model:** Supabase email/password. Sessions are stored in cookies.
  Most routes require authentication; a small set of token-gated routes
  (shareable mobile call dialer, campaign-leader task pages) are reachable
  without a Supabase user session.

## Goals

1. Give organisers a single source of truth for the people, places, and
   agreements involved in a campaign.
2. Support the full campaign lifecycle: mapping contacts, outreach (phone +
   email), bargaining, and reporting.
3. Enforce role-based access (admin, lead organiser, assigned organiser) via
   Supabase Row Level Security.
4. Provide clear dashboards and reports on campaign progress and coverage.

## User Roles

- **Admin** — full access; user administration; system settings.
- **Lead organiser** — full read/write on their campaigns and reports.
- **Assigned organiser** — read/write on assigned campaign data; cannot manage
  users or approve certain gated actions.
- **Token-guest (no login)** — limited, token-scoped access to a single call
  list (mobile dialer) or a single leader task page.

## Authentication & Access

- **Login page (`/login`):** Email + password form. On success the user is
  redirected to `/campaigns`. Invalid credentials show an inline error. The
  page also surfaces session-expiry / signed-out messages via a `reason` query
  param.
- **Set password (`/auth/set-password`):** New/invited users set their password.
- **Route protection:** Unauthenticated users hitting any protected route are
  redirected to `/login`. Authenticated users hitting `/login` are redirected to
  `/campaigns`.
- **Sign out:** Clears the session via the server and returns the user to login.

## Core Features & Pages

### Campaigns
- **Campaigns list (`/campaigns`):** Browse, search, and filter campaigns.
- **Create campaign (`/campaigns/new`, `/campaigns/new/manual`):** Guided
  wizard and manual creation.
- **Wizards:** Email wizard, phone wizard, and SOC (scope-of-campaign) wizard
  for quickly standing up outreach.
- **Campaign detail (`/campaigns/[id]`):** Overview of a single campaign with
  navigation into its sub-tools.
- **Campaign settings (`/campaigns/[id]/settings`).**
- **Add workers to a campaign (`/campaigns/[id]/add-workers`).**
- **Wall chart / planning (`/campaigns/[id]/plan`, stages and gates):**
  Stage-by-stage planning with gate criteria assessments.

### Phone banking / calling
- **Phone home (`/campaigns/[id]/phone`)** with setup, scripts, assessment
  setup, call lists, and a live calling view.
- **Call lists (`/campaigns/[id]/phone/lists/[listId]`, `/call/[listId]`):**
  Create, populate, and work call lists; record call attempts and outcomes.
- **Call scripts (`/campaigns/[id]/phone/scripts/[scriptId]`).**
- **Shareable mobile dialer (`/call/[token]`):** Token-gated page (URL token +
  password) so volunteers can make calls without a full login.

### Email outreach
- **Email wizard, list creation, and send order setup**
  (`/campaigns/[id]/email/...`).
- **Email imports (`/email-imports`).**

### Bargaining
- **Bargaining hub (`/campaigns/[id]/bargaining`)** with stages, actions,
  decisions, votes, and PABO (protected-action ballot order) tracking.

### Entities (data management)
- **Workers (`/workers`, `/workers/[id]`):** Member/worker records.
- **Worksites (`/worksites`, `/worksites/[id]`):** Physical sites, with map
  support.
- **Employers (`/employers`, `/employers/[id]`).**
- **Agreements (`/agreements`, `/agreements/[id]`):** Enterprise agreements,
  expiry tracking, assigned organisers.
- **Programs (`/programs`, `/programs/[id]`).**
- **Work scopes (`/work-scopes`), Upcoming projects (`/upcoming-projects`).**

### Planning & workload
- **Dashboard / Overview (`/dashboard`, `/overview`).**
- **Workload (`/workload`):** Organiser workload distribution.
- **Organiser patches (`/organiser-patches`):** Geographic / portfolio
  assignment of organisers.

### Reporting
- **Reports (`/reports`)** including bargaining, campaign-progress, and
  universe reports. Supports on-screen analysis and export (e.g. XLSX/CSV).

### Templates, Help & Administration
- **Templates (`/templates`).**
- **Help (`/help`).**
- **Administration (`/administration`):** User management (invite, update,
  delete, set password), rate limits, retention status, AI cache, settings.
  Admin-only.

### Leader task pages
- **Leader task (`/leader/task/[token]`):** Token-gated page where a campaign
  leader completes an assigned task without a full Supabase login.

## Key User Flows (happy paths)

1. **Sign in:** Visit `/login`, enter valid credentials, land on `/campaigns`.
2. **Browse campaigns:** Search/filter the campaigns list and open a campaign.
3. **Create a campaign:** Launch the create wizard, complete required steps, and
   see the new campaign in the list / detail page.
4. **Build a call list & make calls:** From a campaign's phone area, create and
   populate a call list, open the calling view, and record a call attempt.
5. **Manage entities:** Open Workers / Worksites / Employers / Agreements lists,
   open a record's detail page, and view related data.
6. **View reports:** Open `/reports`, choose a report, and view/export results.
7. **Admin user management:** As an admin, open `/administration` and invite or
   update a user.
8. **Sign out:** Use the user menu to sign out and return to `/login`.

## Validation & Error Handling Expectations

- Login rejects invalid credentials with a visible error and never navigates
  away on failure.
- Protected pages redirect to `/login` when unauthenticated.
- Forms validate required fields (Zod) and show inline messages.
- Network/permission failures surface user-friendly errors rather than blank
  screens.

## Non-Goals (for this test pass)

- Sending real outbound emails or live phone calls to real people.
- Modifying production data destructively (prefer read/navigation flows and
  clearly reversible actions where possible).
- Testing the separate `scraper` service or the OAPlanning sister app.

## Test Account

A test account will be provided in the TestSprite configuration portal
(email + password) for authenticated flows.
