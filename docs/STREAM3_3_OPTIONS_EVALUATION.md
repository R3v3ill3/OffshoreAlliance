# STREAM3.3: Architectural Options Evaluation

## Executive Summary

This document provides detailed technical descriptions of 4 architectural approaches for the Offshore Alliance Platform, evaluating how each would work in practice.

**Current State**: Two Next.js applications (organising-db, oa-planner) deployed separately on Vercel, sharing a Supabase database, with cross-app deep links implemented in Stream 2.

---

## Option 1: Separate Apps with Deep Links (Current State)

### Architecture Overview

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│   Organising DB App             │    │   OA Planner App                │
│   oa.uconstruct.app             │    │   oaplanner.uconstruct.app      │
│                                 │    │                                 │
│   • Next.js 16.1.6              │    │   • Next.js 14.2.35             │
│   • React 19.2.3                │    │   • React 18.x                  │
│   • 168 TypeScript files        │    │   • 80 TypeScript files         │
│   • Tailwind CSS v4             │    │   • Tailwind CSS v3.4           │
│   • Radix UI components         │    │   • Radix UI components         │
│   • TanStack Query              │    │   • TanStack Query              │
│                                 │    │                                 │
│   Deployed: Vercel              │    │   Deployed: Vercel              │
└─────────────────────────────────┘    └─────────────────────────────────┘
                 │                                       │
                 └───────────────┬───────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Shared Supabase       │
                    │   • Authentication      │
                    │   • Database            │
                    │   • Realtime            │
                    │   • Storage             │
                    └─────────────────────────┘
```

### Technical Implementation

**Cross-App Navigation (Stream 2 Implementation)**

1. **ExternalLink Component**
   - Location: `apps/{app}/src/components/shared/external-link.tsx`
   - Handles cross-app navigation with visual indicators
   - Supports multiple variants (default, button, text)
   - Automatic return URL handling via query parameters

2. **BackButton Component**
   - Location: `apps/{app}/src/components/shared/back-button.tsx`
   - Stores return URLs in sessionStorage
   - Enables seamless navigation back to originating app

3. **Context Passing**
   - Query parameters: `agreement_id`, `employer_id`, `worksite_ids`, `return_to`
   - Utility functions: `buildCrossAppUrl()`, `buildUrlWithContext()`

**Shared Infrastructure**

- **Monorepo**: pnpm + Turborepo
- **Shared Types**: `@oa/db-types` package (Supabase-generated types)
- **Migrations**: Unified in `/supabase/migrations/`
- **CI/CD**: GitHub Actions for type generation

### Current Deployment

```
Vercel Project 1: Organising DB
- Root Directory: apps/organising-db
- Build Command: npm run build
- Output Directory: .next
- Environment: Production (Next.js 16)

Vercel Project 2: OA Planner
- Root Directory: apps/oa-planner
- Build Command: npm run build
- Output Directory: .next
- Environment: Production (Next.js 14)
- Cron Jobs: Weekly snapshots (/api/snapshots)
```

### Data Flow

```
User Flow:
1. User views agreement in Organising DB
2. Clicks "Create Campaign Plan" (ExternalLink)
3. Navigates to OA Planner with context (?agreement_id=123&employer_id=456)
4. Creates campaign in Planner
5. Clicks "View Agreement Details" to return
6. Returns to Organising DB agreement view
```

### Strengths

- **Independent deployments**: Deploy each app separately
- **Technology flexibility**: Different Next.js versions possible
- **Clear boundaries**: Separate codebases, focused teams
- **Fault isolation**: One app down doesn't affect the other
- **Scalable**: Can scale each app independently
- **Stream 2 complete**: Deep links already implemented

### Weaknesses

- **Navigation overhead**: Context switching between apps
- **Code duplication**: Shared components maintained separately
- **Inconsistent UX**: Different UI patterns across apps
- **Auth complexity**: Session management across domains
- **Shared state**: No React state sharing between apps
- **Build overhead**: Two separate builds and deployments

---

## Option 2: Separate Apps with Shared Navigation Shell

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Shared Navigation Shell                        │
│                    • Unified Header/Navigation                    │
│                    • Shared Authentication State                  │
│                    • Common UI Library                            │
│                    • Cross-App State Management                   │
└──────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   Organising DB App     │        │   OA Planner App        │
│   (Mounted as Module)   │        │   (Mounted as Module)   │
│                         │        │                         │
│   Routes:               │        │   Routes:               │
│   /agreements/*         │        │   /campaigns/*          │
│   /employers/*          │        │   /planning/*           │
│   /worksites/*          │        │   /reports/*            │
│   /workers/*            │        │                         │
└─────────────────────────┘        └─────────────────────────┘
```

### Technical Implementation

**Approach A: Micro-Frontends (Module Federation)**

```javascript
// Shell app (Next.js 16)
// next.config.js
module.exports = {
  webpack: (config) => {
    config.plugins.push(
      new ModuleFederationPlugin({
        name: 'shell',
        remotes: {
          organising: 'organising@https://oa.uconstruct.app/remoteEntry.js',
          planner: 'planner@https://oaplanner.uconstruct.app/remoteEntry.js',
        },
        shared: {
          react: { singleton: true },
          'react-dom': { singleton: true },
          '@supabase/supabase-js': { singleton: true },
        },
      })
    );
    return config;
  },
};
```

**Approach B: iframe-Based Isolation**

```tsx
// Shell component
export function NavigationShell() {
  const [currentApp, setCurrentApp] = useState<'organising' | 'planner'>('organising');

  return (
    <div>
      <SharedHeader onNavigate={setCurrentApp} />
      <iframe
        src={currentApp === 'organising' 
          ? 'https://oa.uconstruct.app' 
          : 'https://oaplanner.uconstruct.app'}
        className="w-full h-full"
      />
    </div>
  );
}
```

**Approach C: Monorepo with Shared UI Package**

```
packages/
  ├── ui/                    # Shared UI components
  │   ├── button.tsx
  │   ├── dialog.tsx
  │   ├── navigation.tsx
  │   └── header.tsx
  ├── auth/                  # Shared auth logic
  └── db-types/              # Existing shared types
```

### Shared State Management

```typescript
// Cross-app state via Context + localStorage
interface SharedAuthState {
  user: User | null;
  session: Session | null;
  signIn: (credentials) => Promise<void>;
  signOut: () => Promise<void>;
}

// BroadcastChannel for cross-tab communication
const authChannel = new BroadcastChannel('oa_auth_channel');

authChannel.onmessage = (event) => {
  if (event.data.type === 'SIGN_OUT') {
    // Sign out in all apps
    router.push('/login');
  }
};
```

### Unified Navigation

```tsx
// Shared header component
export function UnifiedHeader() {
  const pathname = usePathname();
  const isOrganising = pathname.startsWith('/organising');
  const isPlanner = pathname.startsWith('/planner');

  return (
    <header className="border-b">
      <nav className="flex items-center gap-6">
        <Link href="/organising/dashboard" className={cn(isOrganising && 'font-bold')}>
          Organising DB
        </Link>
        <Link href="/planner/campaigns" className={cn(isPlanner && 'font-bold')}>
          Campaign Planner
        </Link>
        <UserMenu />
      </nav>
    </header>
  );
}
```

### Deployment Options

**Option A: Single Deployment**
```
Vercel Project: Offshore Alliance (Single)
- Routes: /organising/* → organising-db app
- Routes: /planner/* → oa-planner app
- Next.js middleware for routing
```

**Option B: Separate Deployments with Shell**
```
Vercel Project 1: Navigation Shell (new)
Vercel Project 2: Organising DB (existing, modified)
Vercel Project 3: OA Planner (existing, modified)
```

### Strengths

- **Unified UX**: Consistent navigation and authentication
- **Shared components**: Reduced code duplication
- **Incremental migration**: Can adopt gradually
- **Independent development**: Teams still work separately
- **Flexible deployment**: Can deploy shell independently

### Weaknesses

- **Complexity**: Micro-frontends add architectural complexity
- **Performance**: Additional shell layer adds overhead
- **State synchronization**: Cross-app state is complex
- **iframe limitations**: Poor UX if using iframe approach
- **Version conflicts**: Shared dependencies must align
- **Build complexity**: Module federation configuration is tricky

---

## Option 3: Single Merged App with Route Prefixes

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              Single Next.js Application                          │
│                                                                  │
│   /                              (Landing/Home)                  │
│   ├── /organising/               (Organising DB routes)          │
│   │   ├── /agreements/*                                           │
│   │   ├── /employers/*                                            │
│   │   ├── /worksites/*                                            │
│   │   ├── /workers/*                                              │
│   │   ├── /programs/*                                             │
│   │   └── /dashboard/                                             │
│   │                                                                │
│   ├── /planner/                   (OA Planner routes)             │
│   │   ├── /campaigns/*                                            │
│   │   ├── /planning/*                                             │
│   │   ├── /reports/*                                              │
│   │   └── /dashboard/                                             │
│   │                                                                │
│   ├── /shared/                    (Shared resources)              │
│   │   ├── /components/                                            │
│   │   ├── /lib/                                                   │
│   │   └── /types/                                                 │
│   │                                                                │
│   └── /api/                       (API routes)                    │
│                                                                  │
│   • Single Next.js version (16.x)                                │
│   • Single React version (19.x)                                  │
│   • Shared layouts, auth, components                             │
│   • Unified build and deployment                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Technical Implementation

**Directory Structure**

```
offshore-alliance/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Landing page
│   │   ├── shared/
│   │   │   ├── layout.tsx          # Shared layout
│   │   │   └── loading.tsx
│   │   │
│   │   ├── organising/             # Organising DB routes
│   │   │   ├── layout.tsx          # Organising-specific layout
│   │   │   ├── page.tsx            # /organising
│   │   │   ├── agreements/
│   │   │   │   ├── page.tsx        # /organising/agreements
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # /organising/agreements/123
│   │   │   ├── employers/
│   │   │   ├── worksites/
│   │   │   ├── workers/
│   │   │   └── dashboard/
│   │   │
│   │   └── planner/                # OA Planner routes
│   │       ├── layout.tsx          # Planner-specific layout
│   │       ├── page.tsx            # /planner
│   │       ├── campaigns/
│   │       │   ├── page.tsx        # /planner/campaigns
│   │       │   ├── new/
│   │       │   │   └── page.tsx    # /planner/campaigns/new
│   │       │   └── [id]/
│   │       │       └── page.tsx    # /planner/campaigns/123
│   │       └── dashboard/
│   │
│   ├── components/
│   │   ├── shared/                 # Shared components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── navigation.tsx
│   │   │   └── data-table.tsx
│   │   ├── organising/             # Organising-specific
│   │   └── planner/                # Planner-specific
│   │
│   ├── lib/
│   │   ├── supabase/               # Shared auth/client
│   │   ├── queries/                # Shared queries
│   │   └── utils/                  # Shared utilities
│   │
│   └── types/
│       └── database.ts             # Re-exported db-types
```

**Route Configuration**

```typescript
// middleware.ts for route protection
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected routes
  const protectedPaths = ['/organising', '/planner'];
  const isProtectedRoute = protectedPaths.some(path =>
    pathname.startsWith(path)
  );

  if (isProtectedRoute) {
    // Check auth
    const token = request.cookies.get('sb-access-token');
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/organising/:path*', '/planner/:path*'],
};
```

**Shared Layout**

```tsx
// src/app/shared/layout.tsx
export function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedNavigation />
      <main className="container">
        {children}
      </main>
    </div>
  );
}
```

**Organising-Specific Layout**

```tsx
// src/app/organising/layout.tsx
export function OrganisingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SharedLayout>
      <div className="flex">
        <OrganisingSidebar />
        <div className="flex-1">
          <OrganisingBreadcrumbs />
          {children}
        </div>
      </div>
    </SharedLayout>
  );
}
```

**Unified Navigation**

```tsx
// src/components/shared/navigation.tsx
export function UnifiedNavigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/organising/dashboard', label: 'Dashboard', section: 'organising' },
    { href: '/organising/agreements', label: 'Agreements', section: 'organising' },
    { href: '/organising/employers', label: 'Employers', section: 'organising' },
    { href: '/planner/campaigns', label: 'Campaigns', section: 'planner' },
    { href: '/planner/reports', label: 'Reports', section: 'planner' },
  ];

  return (
    <nav className="border-b">
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "hover:text-foreground/80",
                pathname.startsWith(item.href) && "font-bold"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <UserMenu />
      </div>
    </nav>
  );
}
```

**Cross-Feature Navigation**

```tsx
// Navigate from agreement to campaign
export function AgreementCard({ agreement }: { agreement: Agreement }) {
  const router = useRouter();

  const handleCreateCampaign = () => {
    // Direct navigation - no URL construction needed
    router.push({
      pathname: '/planner/campaigns/new',
      query: { agreement_id: agreement.id }
    });
  };

  return (
    <Card>
      <Button onClick={handleCreateCampaign}>
        Create Campaign Plan
      </Button>
    </Card>
  );
}
```

**Shared Components**

```tsx
// src/components/shared/data-table.tsx
// Used by both Organising and Planner
export function DataTable<T>({
  columns,
  data,
  ...props
}: DataTableProps<T>) {
  // Single implementation for both apps
}
```

**Migration Strategy**

```bash
# Phase 1: Set up structure
1. Create new monorepo package: apps/offshore-alliance
2. Copy organising-db routes to /organising/*
3. Copy oa-planner routes to /planner/*
4. Extract shared components to /shared/*

# Phase 2: Unify dependencies
1. Upgrade to Next.js 16 across both
2. Standardize on React 19
3. Merge Tailwind configurations
4. Create shared UI library

# Phase 3: Merge authentication
1. Single Supabase auth implementation
2. Shared middleware for route protection
3. Unified auth state management

# Phase 4: Deploy single app
1. Single Vercel project
2. Environment variable consolidation
3. DNS update (optional)
```

### Deployment

```
Single Vercel Project:
- Build Command: npm run build
- Output Directory: .next
- Routes: All routes in single app
- Environment Variables: Consolidated from both apps

DNS:
- oa.uconstruct.app → Single Vercel app
- oaplanner.uconstruct.app → Same Vercel app (or redirect)
```

### Strengths

- **Simplified deployment**: Single build, single deploy
- **Shared code**: Eliminates duplication
- **Unified UX**: Consistent navigation and components
- **Easy state sharing**: React Context across routes
- **Better performance**: No cross-app overhead
- **Simpler auth**: Single auth implementation
- **Cost efficient**: One deployment to manage

### Weaknesses

- **Large codebase**: 248+ TypeScript files in one app
- **Monolithic**: Changes affect entire app
- **Build time**: Longer builds with all code
- **Version lock**: Must use same Next.js/React versions
- **Team coordination**: More merge conflicts
- **All-or-nothing**: Harder to run features independently
- **Migration effort**: Significant work to merge

---

## Option 4: Microservices Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend Shell                             │
│                   • User Interface                              │
│                   • Routing & Navigation                        │
│                   • Composition Layer                           │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│   Organising      │ │   Campaign        │ │   Shared          │
│   Service         │ │   Planning        │ │   Services        │
│                   │ │   Service         │ │                   │
│   • Agreements    │ │   • Campaigns     │ │   • Auth          │
│   • Employers     │ │   • Planning      │ │   • Notifications │
│   • Worksites     │ │   • Gates/Stages  │ │   • Search        │
│   • Workers       │ │   • Reports       │ │   • File Storage  │
└───────────────────┘ └───────────────────┘ └───────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Event Bus         │
                    │   (Message Queue)   │
                    └─────────────────────┘
```

### Technical Implementation

**Backend Services (Supabase Edge Functions)**

```typescript
// Organising Service
// supabase/functions/organising-service/index.ts
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/organising', '');

  switch (path) {
    case '/agreements':
      return await handleAgreements(req);
    case '/employers':
      return await handleEmployers(req);
    default:
      return new Response('Not found', { status: 404 });
  }
});

// Campaign Planning Service
// supabase/functions/planning-service/index.ts
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/planning', '');

  switch (path) {
    case '/campaigns':
      return await handleCampaigns(req);
    case '/plans':
      return await handlePlans(req);
    default:
      return new Response('Not found', { status: 404 });
  }
});
```

**Frontend Shell (Next.js App Router)**

```typescript
// app/layout.tsx
export default function RootLayout() {
  return (
    <html>
      <body>
        <AppProvider>
          <Shell />
        </AppProvider>
      </body>
    </html>
  );
}

// components/shell.tsx
function Shell() {
  return (
    <div className="app-shell">
      <ShellNavigation />
      <ShellContent />
    </div>
  );
}
```

**Feature Modules**

```typescript
// app/organising/agreements/page.tsx
'use client';

export function AgreementsPage() {
  const { data, isLoading } = useAgreements(); // Hook to Organising service

  return (
    <div>
      <h1>Agreements</h1>
      <AgreementsList data={data} loading={isLoading} />
    </div>
  );
}

// hooks/use-agreements.ts
export function useAgreements() {
  return useQuery({
    queryKey: ['agreements'],
    queryFn: async () => {
      const response = await fetch('/api/organising/agreements');
      return response.json();
    },
  });
}
```

**Event-Driven Communication**

```typescript
// Event types
interface DomainEvent {
  type: string;
  payload: any;
  timestamp: Date;
}

// Campaign created event
interface CampaignCreatedEvent extends DomainEvent {
  type: 'campaign.created';
  payload: {
    campaignId: string;
    agreementId: string;
    employerId: string;
  };
}

// Event publisher
export async function publishEvent(event: DomainEvent) {
  await supabase.from('events').insert({
    type: event.type,
    payload: event.payload,
    timestamp: event.timestamp,
  });
}

// Event subscriber (Realtime subscription)
supabase
  .channel('domain-events')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'events',
  }, (payload) => {
    handleDomainEvent(payload.new);
  })
  .subscribe();
```

**Service Mesh**

```typescript
// API Gateway pattern
// app/api/[...service]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { service: string[] } }
) {
  const [serviceName, ...path] = params.service;

  // Route to appropriate service
  const serviceUrl = getServiceUrl(serviceName);
  const url = `${serviceUrl}/${path.join('/')}`;

  return await fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
}

function getServiceUrl(service: string): string {
  const services = {
    organising: process.env.ORGANISING_SERVICE_URL,
    planning: process.env.PLANNING_SERVICE_URL,
    shared: process.env.SHARED_SERVICE_URL,
  };

  return services[service] || '';
}
```

**Database per Service (Optional)**

```sql
-- Organising DB
CREATE DATABASE organising_db;
-- Tables: agreements, employers, worksites, workers

-- Planning DB
CREATE DATABASE planning_db;
-- Tables: campaigns, plans, gates, stages

-- Shared DB
CREATE DATABASE shared_db;
-- Tables: users, auth, notifications
```

### Deployment Architecture

```
Frontend:
├── Vercel (Shell app)
│   └── Next.js 16
│   └── UI components only
│
Backend Services:
├── Supabase Edge Functions
│   ├── organising-service
│   ├── planning-service
│   └── shared-service
│
Event Bus:
├── Supabase Realtime
│   └── PostgreSQL events table
│
Data Layer:
├── Supabase PostgreSQL
│   └── Shared or separate databases
```

### Service Communication

```typescript
// Synchronous (HTTP)
const agreement = await fetch(
  '/api/organising/agreements/123'
).then(r => r.json());

// Asynchronous (Events)
await publishEvent({
  type: 'campaign.created',
  payload: { campaignId: '456', agreementId: '123' },
  timestamp: new Date(),
});

// Query/Response pattern
const response = await supabase.rpc('query_service', {
  service: 'organising',
  query: 'agreements_by_employer',
  params: { employer_id: 123 },
});
```

### Strengths

- **Independent scaling**: Scale services independently
- **Technology flexibility**: Different tech stacks per service
- **Fault isolation**: One service down doesn't crash everything
- **Team autonomy**: Teams own services end-to-end
- **Event-driven**: Loose coupling between services
- **Future-proof**: Easy to add new services

### Weaknesses

- **Over-engineering**: Too complex for current needs
- **Operational overhead**: Multiple services to manage
- **Network latency**: Service-to-service calls
- **Data consistency**: Distributed transactions are hard
- **Debugging complexity**: Issues span multiple services
- **Deployment complexity**: Orchestrate multiple deployments
- **Small team mismatch**: Team likely too small for this

### When This Makes Sense

- 10+ developers
- 5+ distinct domains
- High traffic requiring independent scaling
- Different teams need different tech stacks
- Regulatory requirements for service isolation

---

## Comparison Summary

| Aspect | Option 1 | Option 2 | Option 3 | Option 4 |
|--------|----------|----------|----------|----------|
| **Apps** | 2 separate | 2 separate + shell | 1 merged | Shell + services |
| **Deployments** | 2 | 2-3 | 1 | 1 + services |
| **Builds** | 2 separate | 2 separate | 1 unified | 1 + service builds |
| **Codebases** | 2 independent | 2 + shared | 1 monorepo | 1 + service repos |
| **Navigation** | Deep links (implemented) | Unified shell | Route prefixes | Service routing |
| **Auth** | 2 implementations | Shared in shell | 1 implementation | 1 shared service |
| **State sharing** | Query parameters | Context/localStorage | React Context | Events/API |
| **Complexity** | Low | Medium | Medium | Very High |
| **Migration effort** | None (current) | Medium | High | Very High |

---

## Technical Considerations

### Next.js Version Compatibility

- **Current**: Organising DB (16.1.6), OA Planner (14.2.35)
- **Issue**: Breaking changes between versions
- **Options 1/2**: Can keep separate versions
- **Option 3**: Must standardize (recommend 16.x)
- **Option 4**: Services can use different versions

### React Version Mismatch

- **Current**: Organising DB (19.2.3), OA Planner (18.x)
- **Issue**: React 19 has breaking changes
- **Options 1/2**: Can keep separate versions
- **Option 3**: Must upgrade Planner to React 19
- **Option 4**: Services can use different versions

### Tailwind CSS Versions

- **Current**: Organising DB (v4), OA Planner (v3.4)
- **Issue**: v4 has different configuration
- **Options 1/2**: Can keep separate versions
- **Option 3**: Must standardize (recommend v4)
- **Option 4**: Services can use different versions

### Supabase Client

- All options can share same Supabase project
- Options 2/3/4 benefit from single auth implementation
- Realtime subscriptions easier in merged app

---

## Decision Framework

Choose **Option 1** if:
- Stream 2 deep links are sufficient
- Teams want autonomy
- Different tech stacks are valuable
- Independent scaling is needed

Choose **Option 2** if:
- Want unified UX without full merge
- Need gradual migration path
- Shared components are valuable
- Can handle micro-frontend complexity

Choose **Option 3** if:
- Want simplest architecture
- Prioritize developer experience
- Unified UX is critical
- Don't need independent scaling

Choose **Option 4** if:
- Large team (10+ developers)
- Need independent scaling
- Different tech stacks per service
- Event-driven patterns are beneficial
- **NOT recommended for current team size**

---

## Next Steps

After reviewing this evaluation:

1. **Read** `STREAM3_3_PROS_CONS_MATRIX.md` for detailed ratings
2. **Review** `STREAM3_3_COST_ANALYSIS.md` for cost breakdown
3. **Assess** `STREAM3_3_RISK_ASSESSMENT.md` for risks
4. **Decide** based on `STREAM3_3_RECOMMENDATION.md`
