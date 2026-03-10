# Offshore Alliance Campaign Database

A full-stack campaign management database for the Offshore Alliance union, built with Next.js, Supabase, and Tailwind CSS.

## Features

- **Workers Management** - Track members, contacts, delegates, and non-members with engagement scoring
- **Employers** - Complete employer directory with categories, ABN tracking, and worksite role assignments
- **Worksites** - Geographic database of offshore/onshore facilities with interactive Leaflet maps
- **Agreements (EBAs)** - Enterprise bargaining agreement tracking with dues increase schedules, succession chains, and expiry monitoring
- **Campaigns** - Full campaign management with customisable universes, action tracking, and result logging
- **Reports** - Pre-built and custom reports with CSV export (agreement expiry, membership density, etc.)
- **Import** - XLSX and PDF file import with column mapping and preview
- **Maps** - Interactive Leaflet maps with colour-coded markers, filtering, and info overlays
- **Integrations** - Action Network API and Yabbr.io SMS integration
- **RBAC** - Role-based access control (Admin / User / Viewer)
- **Organiser Patches** - Assign worksites, employers, and agreements to organisers

## Tech Stack

- **Frontend**: Next.js 16 (App Router, TypeScript)
- **UI**: Tailwind CSS + shadcn/ui components
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth with custom RBAC
- **Maps**: Leaflet + OpenStreetMap
- **Geocoding**: Nominatim (free, no API key required)
- **File Parsing**: xlsx (spreadsheets), pdf-parse (PDFs)
- **Deployment**: Vercel (frontend) + Supabase (backend)

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (create one at [supabase.com](https://supabase.com))

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.local` and update with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ACTION_NETWORK_API_KEY=your-action-network-key
YABBR_API_KEY=your-yabbr-key
YABBR_API_URL=https://cloud.yabb.com
```

### 3. Set up the database

Run the SQL migration files in order in the Supabase SQL Editor:

1. `supabase/migrations/00001_initial_schema.sql` - Creates all tables
2. `supabase/migrations/00002_rls_policies.sql` - Sets up Row Level Security
3. `supabase/migrations/00003_seed_data.sql` - Seeds reference data (sectors, unions, member roles)
4. `supabase/migrations/00004_views.sql` - Creates database views

### 4. Create your first admin user

1. Create a user in the Supabase Auth dashboard
2. Update their profile in `user_profiles` table: set `role` to `admin`

### 5. Seed spreadsheet data (optional)

To import the existing EBA spreadsheet data:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npx tsx scripts/seed-from-spreadsheet.ts
```

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    (auth)/login/          # Login page
    (dashboard)/           # Main app with sidebar layout
      dashboard/           # Dashboard with stats and charts
      workers/             # Worker management
      employers/           # Employer directory
      worksites/           # Worksite management with maps
      agreements/          # EBA tracking
      campaigns/           # Campaign management
      reports/             # Report builder
      administration/      # Admin panel (users, roles, settings)
      organiser-patches/   # Organiser workload management
    api/
      import/              # XLSX/PDF file import endpoint
      action-network/      # Action Network API proxy
      yabbr/               # Yabbr SMS API proxy
  components/
    ui/                    # shadcn/ui components
    layout/                # Sidebar, header
    data-tables/           # Reusable data table component
    maps/                  # Leaflet map components
    import/                # Import wizard dialog
  lib/
    supabase/              # Supabase client, server, middleware, auth context
    api/                   # Action Network and Yabbr client libraries
    utils/                 # Engagement scoring, geocoding, export utilities
  types/                   # TypeScript type definitions
supabase/
  migrations/              # SQL migration files
scripts/
  seed-from-spreadsheet.ts # Data seeding script
```

## Database Schema

The database includes 30+ tables covering:

- **Reference tables**: sectors, unions, member_role_types
- **Entity tables**: employers, worksites, agreements, workers, organisers
- **Relationship tables**: agreement_worksites, agreement_unions, employer_worksite_roles, worker_agreements, etc.
- **Campaign tables**: campaigns, campaign_universes, campaign_universe_rules, campaign_actions, campaign_action_results
- **Supporting tables**: documents, communications_log, organiser_patches, tags, import_logs, user_profiles

## Deployment to Vercel

1. Push the repo to GitHub
2. Import the project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## License

Private - Offshore Alliance internal use only.
