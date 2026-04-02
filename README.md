# Offshore Alliance Platform

A monorepo containing two integrated web applications for the Offshore Alliance — a joint union initiative (AWU + MUA) organising workers in Western Australia's offshore oil and gas sector.

## Overview

The Offshore Alliance Platform is a full-stack campaign management system built with:
- **Next.js** (App Router) for both applications
- **Supabase** (PostgreSQL) as the shared backend database
- **TypeScript** throughout
- **Tailwind CSS** + **shadcn/ui** for UI components
- **pnpm** + **Turborepo** for monorepo management

### Applications

| App | Description | URL |
|-----|-------------|-----|
| **Organising DB** | Campaign management database for tracking workers, employers, worksites, agreements, campaigns, and communications | [oa.uconstruct.app](https://oa.uconstruct.app) |
| **OA Planner** | Strategic planning tool implementing the "Playing to Win" methodology across a 6-stage enterprise bargaining campaign model | [oaplanner.uconstruct.app](https://oaplanner.uconstruct.app) |

---

## Organising DB Application

### Core Features

#### **Workers Management**
- Track members, contacts, delegates, and non-members
- Engagement scoring and level classification
- Worker profiles with contact details, employer/worksite assignments
- Import workers from XLSX/PDF files with column mapping

#### **Employers Directory**
- Complete employer database with categories (Producer, Major Contractor, Subcontractor, Labour Hire, Specialist, Principal Employer)
- Parent company hierarchy (`parent_employer_id` relationships)
- ABN tracking
- Employer-to-worksite role assignments (Owner, Operator, Principal Contractor, Subcontractor)
- Employer merge functionality with conflict resolution

#### **Worksites Management**
- Geographic database of offshore platforms, onshore facilities, and vessels
- Interactive Leaflet maps with color-coded markers
- Principal employer assignments per worksite
- Worksite hierarchy (parent/child relationships)
- Basin and work scope classifications

#### **Agreements (Enterprise Bargaining Agreements)**
- EBA tracking with expiry monitoring
- Dues increase schedules
- Succession chains
- Agreement-to-employer and agreement-to-worksite linkages
- Agreement status tracking (Current, Expired, Under Negotiation, Terminated)

#### **Campaigns Management**
- Campaign universes with configurable rules
- Action tracking with results logging
- Campaign leader tasks with token-based access
- Task lists for campaign activities
- Member mobilisation tracking

#### **Reports**
- Pre-built reports (agreement expiry, membership density, etc.)
- Custom report builder
- Universe-based reporting
- CSV export functionality

#### **Maps & Visualisations**
- Interactive Leaflet maps
- Color-coded markers by EBA status
- Filtering by employer, worksite type, sector
- Information overlays with key details

#### **Integrations**
- **Action Network API** — Email campaign integration
- **Yabbr.io SMS** — SMS messaging integration
- Geocoding via Nominatim (OpenStreetMap)

#### **Data Import**
- XLSX spreadsheet import with column mapping
- PDF file parsing
- Preview and validation before import
- Reference data clustering and analysis
- Import logging and history

#### **Organiser Patches**
- Assign worksites, employers, and agreements to organisers
- Workload management and territory assignment

---

## OA Planner Application

### Core Features

#### **Campaign Planning with "Playing to Win" Methodology**

The OA Planner implements a structured 5-step strategic planning process applied across 6 campaign stages:

**6 Campaign Stages:**
1. Contact ID & Mapping
2. Intro Comms & Education
3. Member Mobilisation
4. Develop Claims / MSD
5. Endorsement & Commence Bargaining
6. Bargaining to Win

**5 Playing to Win Steps (per stage):**
1. **Ambitions** — Define measurable success targets
2. **Where to Play** — Choose focus areas and exclusions
3. **Theory of Winning** — AI-assisted causal logic chains (via Anthropic Claude)
4. **Capacities & Resources** — Required vs available resources
5. **Management Systems** — Planning rhythms and accountability structures

#### **Gate System**
- 5 gates between campaign stages with configurable thresholds
- Hard and soft gate enforcement options
- Gate criteria assessment with audit trail
- MSD (Majority Support Determination) hard gate support

#### **Timeline Management**
- Auto-calculated timelines from agreement expiry dates
- PABO (Protected Action Bargaining Option) date tracking
- Working backwards mode for expiry-constrained campaigns
- Planned vs actual date tracking

#### **AI Integration**
- Anthropic Claude API for Theory of Winning generation
- Gap analysis and risk assessment
- Member agency evaluation
- Employer response planning considerations

#### **Reporting**
- Campaign progress snapshots (automated weekly + manual)
- Stage completion reporting
- Gate assessment reports
- CSV export functionality

---

## Shared Infrastructure

### Database Schema (30+ Tables)

**Core Entities:**
- `employers` — Companies with hierarchical relationships
- `worksites` — Physical locations with principal employer assignments
- `workers` — Individual worker/member records
- `agreements` — Enterprise bargaining agreements
- `campaigns` — Campaign records
- `projects` — Project-level tracking
- `programs` — Program grouping across projects

**Relationship Tables:**
- `agreement_employers`, `agreement_worksites`, `agreement_unions`
- `employer_worksite_roles`, `worksite_contracts`
- `project_employers`, `project_agreements`
- `worker_agreements`, `worker_assignments`

**Planning Tables (OA Planner):**
- `campaign_stage_plans` — One plan per stage per campaign
- `plan_ambitions`, `plan_where_to_play`, `plan_theory_of_winning`
- `plan_capacities`, `plan_management_systems`
- `gate_definitions`, `gate_criteria`, `gate_assessments`
- `campaign_timelines`, `stage_timeline_targets`, `reporting_snapshots`

**Supporting Tables:**
- `sectors`, `unions`, `member_role_types`, `work_scopes`
- `documents`, `communications_log`, `organiser_patches`
- `tags`, `import_logs`

### Authentication & Authorization

- **Supabase Auth** for user authentication
- **Role-Based Access Control (RBAC)** with roles:
  - `admin` — Full access to all data
  - `user` — Standard organiser access
  - `viewer` — Read-only access
- **Row Level Security (RLS)** on all tables
- Lead organiser reporting hierarchy support

### Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (Organising DB), Next.js 14 (OA Planner), React 19/18 |
| UI | Tailwind CSS, shadcn/ui, Radix UI primitives |
| State | TanStack Query (React Query) v5 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Maps | Leaflet + OpenStreetMap |
| File Parsing | xlsx, pdf-parse |
| AI | Anthropic Claude API (OA Planner) |
| Deployment | Vercel |
| Package Manager | pnpm |
| Monorepo | Turborepo |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project
- pnpm installed globally

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd OffshoreAlliance

# Install dependencies
pnpm install

# Configure environment variables (see below)
cp apps/organising-db/.env.local.example apps/organising-db/.env.local
cp apps/oa-planner/.env.local.example apps/oa-planner/.env.local
```

### Environment Variables

**Organising DB:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ACTION_NETWORK_API_KEY=your-action-network-key
YABBR_API_KEY=your-yabbr-key
YABBR_API_URL=https://cloud.yabb.com
```

**OA Planner:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
CRON_SECRET=your-cron-secret
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

### Development

```bash
# Run both applications
pnpm dev

# Run specific application
pnpm dev --filter organising-db
pnpm dev --filter oa-planner

# Build all applications
pnpm build

# Generate database types
pnpm gen:types
```

---

## Deployment

Both applications are deployed to Vercel as separate projects pointing to this monorepo:

- **Organising DB** — Root Directory: `apps/organising-db`
- **OA Planner** — Root Directory: `apps/oa-planner`

A GitHub Actions workflow automatically regenerates database types when migrations change.

---

## Project Structure

```
OffshoreAlliance/
├── apps/
│   ├── organising-db/        # Campaign management database app
│   │   ├── src/
│   │   │   ├── app/          # Next.js App Router pages
│   │   │   ├── components/   # UI components
│   │   │   ├── lib/          # Utilities, Supabase clients
│   │   │   └── types/        # TypeScript types
│   │   └── package.json
│   └── oa-planner/           # Campaign strategic planner app
│       ├── src/
│       │   ├── app/          # Next.js App Router pages
│       │   ├── components/   # UI components
│       │   ├── lib/          # Utilities, Supabase clients
│       │   └── types/        # TypeScript types
│       └── package.json
├── packages/
│   └── db-types/             # Shared Supabase-generated types
├── supabase/
│   └── migrations/           # Unified database migrations (0001–0016+)
├── docs/                     # Additional documentation
├── package.json              # Monorepo root
├── pnpm-workspace.yaml       # Workspace configuration
└── turbo.json                # Task configuration
```

---

## License

Private — Offshore Alliance internal use only.
