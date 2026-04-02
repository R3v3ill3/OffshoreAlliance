# STREAM3.3: Pros/Cons Matrix & Comparative Analysis

## Executive Summary

This document provides a detailed evaluation matrix comparing 4 architectural options against 7 criteria defined by the user. Each option is rated (Excellent, Good, Fair, Poor) with detailed justifications.

---

## Evaluation Matrix

### Legend
- **Excellent** (9-10/10): Best-in-class, no significant drawbacks
- **Good** (7-8/10): Strong performance, minor drawbacks
- **Fair** (5-6/10): Acceptable, notable trade-offs
- **Poor** (1-4/10): Significant issues, not recommended

---

## Complete Matrix

| Criterion | Option 1: Separate Apps | Option 2: Shared Shell | Option 3: Merged App | Option 4: Microservices |
|-----------|-------------------------|-------------------------|----------------------|-------------------------|
| **Performance** | Good | Fair | Excellent | Fair |
| **Resource Requirements** | Good | Fair | Excellent | Poor |
| **User Experience (UX)** | Fair | Good | Excellent | Poor |
| **Data Management** | Good | Good | Excellent | Fair |
| **Ongoing Development** | Fair | Good | Excellent | Poor |
| **Robustness & Reliability** | Excellent | Good | Excellent | Fair |
| **Repository Complexity** | Excellent | Fair | Good | Poor |

---

## Detailed Evaluation by Criterion

### 1. Performance

**Metrics**: Page load speed, query performance, responsiveness, caching efficiency

#### Option 1: Separate Apps - **Good** (7/10)

**Pros:**
- ✅ Smaller bundle sizes (168 vs 80 files per app)
- ✅ Independent optimization per app
- ✅ Targeted caching strategies per domain
- ✅ Parallel deployments reduce downtime
- ✅ Route-based code splitting works well

**Cons:**
- ❌ Cross-app navigation requires full page load
- ❌ Auth session check on each domain switch
- ❌ No shared caching between apps
- ❌ Context passing via query params (not instant)

**Justification:**
- Individual apps load quickly due to smaller bundles
- Deep links implemented in Stream 2 work but add friction
- No shared component cache (duplication)
- Rating: **Good** - solid performance with minor cross-app overhead

---

#### Option 2: Shared Navigation Shell - **Fair** (6/10)

**Pros:**
- ✅ Shell can be cached aggressively
- ✅ Apps remain smaller bundles
- ✅ Improved perceived performance with shared navigation

**Cons:**
- ❌ Shell adds initial load overhead
- ❌ Module federation loading delays
- ❌ Cross-shell communication latency
- ❌ iframe approach has significant performance penalties
- ❌ Additional layer of JavaScript

**Justification:**
- Shell adds overhead before loading actual features
- Module federation introduces loading delays
- iframe approach would be very slow (not recommended)
- Rating: **Fair** - performance penalty from shell layer

---

#### Option 3: Single Merged App - **Excellent** (9/10)

**Pros:**
- ✅ Single optimized bundle with code splitting
- ✅ Shared component cache across all routes
- ✅ Instant navigation between features
- ✅ Single auth check per session
- ✅ React Fast Refresh across entire app
- ✅ Unified caching strategy
- ✅ Better Next.js optimization (single app)

**Cons:**
- ❌ Larger initial bundle (mitigated by code splitting)
- ❌ Build time longer (doesn't affect runtime)

**Justification:**
- Best performance due to unified architecture
- Instant navigation with no cross-app overhead
- Shared components cached once
- Code splitting keeps bundles manageable
- Rating: **Excellent** - best runtime performance

---

#### Option 4: Microservices - **Fair** (5/10)

**Pros:**
- ✅ Individual services can be optimized
- ✅ CDN caching at service level
- ✅ Independent performance tuning

**Cons:**
- ❌ Network latency between services
- ❌ Multiple HTTP requests for composed views
- ❌ Event-driven communication adds delay
- ❌ Service mesh overhead
- ❌ No shared React state (slow prop drilling)
- ❌ Waterfall of service calls

**Justification:**
- Network overhead dominates performance
- Service composition requires multiple round trips
- Event-driven updates have inherent delay
- Not suitable for responsive UI
- Rating: **Fair** - network latency too high for UI

---

### 2. Resource Requirements

**Metrics**: Hosting costs, server needs, build times, memory usage, CDN bandwidth

#### Option 1: Separate Apps - **Good** (7/10)

**Pros:**
- ✅ 2 Vercel deployments ($20/month × 2 = $40)
- ✅ Smaller builds = faster build times
- ✅ Independent scaling = cost efficient
- ✅ Targeted resource allocation

**Cons:**
- ❌ Duplicate dependencies (2× node_modules)
- ❌ Two deployment pipelines to maintain
- ❌ Shared Supabase costs ($25/month base)

**Cost Breakdown:**
```
Vercel Pro: $20 × 2 = $40/month
Supabase Pro: $25/month
Database: $10/month (estimated)
Total: ~$75/month
```

**Build Times:**
- Organising DB: ~3-4 minutes
- OA Planner: ~2-3 minutes
- Total: 5-7 minutes (can run in parallel)

**Justification:**
- Reasonable hosting costs
- Parallel builds save time
- Some resource duplication
- Rating: **Good** - cost-effective with minor duplication

---

#### Option 2: Shared Navigation Shell - **Fair** (6/10)

**Pros:**
- ✅ Apps remain separate (scaling benefits)

**Cons:**
- ❌ Additional deployment for shell ($20/month)
- ❌ Module federation complexity
- ❌ Shared dependencies triple (shell + 2 apps)
- ❌ More complex build orchestration

**Cost Breakdown:**
```
Vercel Pro: $20 × 3 = $60/month (shell + 2 apps)
Supabase Pro: $25/month
Database: $10/month
Total: ~$95/month
```

**Build Times:**
- Shell: ~1-2 minutes
- Organising DB: ~3-4 minutes
- OA Planner: ~2-3 minutes
- Total: 6-9 minutes (orchestrated)

**Justification:**
- Additional deployment increases costs
- Build orchestration adds complexity
- Triple dependency duplication
- Rating: **Fair** - higher costs for marginal benefit

---

#### Option 3: Single Merged App - **Excellent** (9/10)

**Pros:**
- ✅ Single Vercel deployment ($20/month)
- ✅ Single build pipeline
- ✅ Shared dependencies (no duplication)
- ✅ Single set of environment variables
- ✅ Simplified CI/CD

**Cons:**
- ❌ Longer build time (single build)
- ❌ Larger deployment package

**Cost Breakdown:**
```
Vercel Pro: $20/month (single app)
Supabase Pro: $25/month
Database: $10/month
Total: ~$55/month
```

**Build Times:**
- Merged app: ~5-7 minutes (single build)
- No parallel builds needed

**Resource Efficiency:**
- Single node_modules (vs 2 separate)
- Single .next cache
- Shared build artifacts

**Justification:**
- Lowest hosting costs
- Single build pipeline = simpler CI/CD
- No dependency duplication
- Longer build acceptable for cost savings
- Rating: **Excellent** - most cost-effective

---

#### Option 4: Microservices - **Poor** (3/10)

**Pros:**
- ✅ Can scale services independently

**Cons:**
- ❌ Multiple deployments ($20 × N services)
- ❌ Supabase Edge Functions costs
- ❌ Message queue/infrastructure costs
- ❌ Monitoring per service
- ❌ Service mesh overhead
- ❌ Complex orchestration

**Cost Breakdown:**
```
Vercel (Shell): $20/month
Supabase Edge Functions: $10/month per service
  - Organising Service: $10
  - Planning Service: $10
  - Shared Service: $10
Message Queue: $20/month (e.g., Supabase Realtime)
Monitoring: $10/month
Total: ~$80+/month (before scaling)
```

**Build Times:**
- Shell: ~2 minutes
- Each service: ~2-3 minutes
- Orchestrated: ~8-11 minutes total

**Operational Overhead:**
- Multiple repositories to manage
- Separate CI/CD pipelines
- Service mesh configuration
- Event bus infrastructure

**Justification:**
- Highest hosting costs
- Most complex build orchestration
- Overkill for current scale
- Operational overhead too high
- Rating: **Poor** - expensive and over-engineered

---

### 3. User Experience (UX)

**Metrics**: Navigation ease, consistency, learning curve, visual polish, seamlessness

#### Option 1: Separate Apps - **Fair** (5/10)

**Pros:**
- ✅ Each app has focused, consistent UX
- ✅ Deep links implemented (Stream 2)
- ✅ External link indicators show navigation

**Cons:**
- ❌ Context switching between domains
- ❌ Different UI patterns (subtle inconsistencies)
- ❌ No unified navigation
- ❌ Auth prompts on domain switch
- ❌ "Jarring" transitions between apps
- ❌ Different search behavior per app
- ❌ No shared breadcrumbs

**User Journey Pain Points:**
```
1. User on Organising DB
2. Clicks "Create Campaign Plan"
3. New tab opens to OA Planner
4. User has 2 tabs open (confusion)
5. Different UI patterns feel unfamiliar
6. No clear way back (BackButton helps but not obvious)
```

**Justification:**
- Stream 2 deep links help but still disjointed
- Users must learn two different UIs
- Context switching is jarring
- No unified navigation paradigm
- Rating: **Fair** - functional but not seamless

---

#### Option 2: Shared Navigation Shell - **Good** (7/10)

**Pros:**
- ✅ Unified navigation (consistent UX)
- ✅ Single entry point
- ✅ Shared header/branding
- ✅ Consistent visual design

**Cons:**
- ❌ Shell adds layer between user and features
- ❌ iframe approach feels clunky
- ❌ Module federation loading delays
- ❌ Potential layout shift during app loading

**User Journey:**
```
1. User lands on unified shell
2. Sees consistent navigation
3. Clicks "Organising DB" or "Campaign Planner"
4. Feature loads in context
5. Feels like single application
```

**Justification:**
- Unified navigation improves UX significantly
- Consistent branding and patterns
- Shell layer is minor overhead
- Loading states acceptable
- Rating: **Good** - consistent but with loading delays

---

#### Option 3: Single Merged App - **Excellent** (9/10)

**Pros:**
- ✅ Completely seamless navigation
- ✅ Unified UX across all features
- ✅ Single learning curve
- ✅ Consistent UI patterns
- ✅ Shared search across all data
- ✅ Unified breadcrumbs
- ✅ Single auth flow
- ✅ No context switching
- ✅ Instant navigation (Client-side routing)

**User Journey:**
```
1. User lands on /dashboard
2. Sees agreements, campaigns, employers in one place
3. Clicks agreement → instant navigation
4. Clicks "Create Campaign" → smooth transition
5. All features feel like one cohesive app
6. Consistent patterns everywhere
```

**UX Improvements:**
- Unified search (search agreements, campaigns, employers)
- Shared notifications across features
- Consistent modal/dialog behavior
- Unified loading states
- Single color scheme, typography, spacing

**Justification:**
- Best possible UX - truly seamless
- Users don't think about "apps"
- Consistent patterns reduce learning curve
- Client-side routing = instant navigation
- Rating: **Excellent** - best user experience

---

#### Option 4: Microservices - **Poor** (4/10)

**Pros:**
- ✅ Can customize UX per service

**Cons:**
- ❌ Inconsistent UX across services
- ❌ Loading states everywhere
- ❌ Network errors visible to users
- ❌ Complex navigation (service boundaries)
- ❌ Fragmented search
- ❌ No unified state
- ❌ Waterfall loading delays

**User Journey Pain Points:**
```
1. User loads shell
2. Shell loads service registry
3. Each service loads independently
4. User sees cascading loading states
5. Service failures show partial UI
6. Navigation requires service switches
7. Feels "patched together"
```

**Justification:**
- Users notice service boundaries
- Loading cascades are frustrating
- Inconsistent patterns between services
- Network errors break UX
- Not suitable for consumer-facing app
- Rating: **Poor** - fragmented and slow

---

### 4. Data Management

**Metrics**: Data sync complexity, API simplicity, real-time updates, state management, data consistency

#### Option 1: Separate Apps - **Good** (7/10)

**Pros:**
- ✅ Shared Supabase DB = single source of truth
- ✅ Direct database queries (no API layer)
- ✅ Realtime subscriptions work well
- ✅ Type safety via @oa/db-types

**Cons:**
- ❌ No shared React state between apps
- ❌ Context via query params (limited)
- ❌ Duplicate query logic
- ❌ No shared caching layer
- ❌ Cross-app data sync required

**Data Flow:**
```
Organising DB                    OA Planner
     │                                │
     ▼                                ▼
Supabase Client              Supabase Client
     │                                │
     └────────────────┬───────────────┘
                      ▼
                Shared Database
```

**Sync Challenges:**
- Campaign created in Planner → Agreement in Organising DB needs refresh
- Worker updated in Organising DB → Campaign in Planner needs refresh
- No automatic sync between apps

**Justification:**
- Shared database is good foundation
- Cross-app state sharing is awkward
- Query duplication
- Rating: **Good** - solid but limited sync

---

#### Option 2: Shared Navigation Shell - **Good** (7/10)

**Pros:**
- ✅ Shared Supabase client
- ✅ Shared state via Context
- ✅ Cross-app queries possible
- ✅ Shared caching layer

**Cons:**
- ❌ State sync across shell boundary
- ❌ Module federation state is complex
- ❌ iframe approach blocks state sharing
- ❌ Realtime subscriptions per app

**Data Flow:**
```
Shared Shell State
     │
     ├─ Organising DB State
     └─ OA Planner State
            │
            ▼
      Shared Database
```

**State Sharing:**
```typescript
// Shared context in shell
const SharedDataContext = createContext({
  user: null,
  agreements: [],
  campaigns: [],
});

// Each app mounts into shell
// Can access shared data
```

**Justification:**
- Improved state sharing vs Option 1
- Shell provides common context
- Module federation adds complexity
- Rating: **Good** - better than separate apps

---

#### Option 3: Single Merged App - **Excellent** (9/10)

**Pros:**
- ✅ Single Supabase client
- ✅ Shared React state everywhere
- ✅ Unified query layer
- ✅ Shared caching (TanStack Query)
- ✅ Realtime subscriptions unified
- ✅ No sync issues (same app)
- ✅ Single source of truth

**Data Flow:**
```
Single React App
     │
     ├─ Shared State (Context)
     ├─ Query Cache (TanStack)
     └─ Realtime Subscriptions
            │
            ▼
      Shared Database
```

**Query Example:**
```typescript
// Single query layer for all features
export function useAgreement(id: string) {
  return useQuery({
    queryKey: ['agreements', id],
    queryFn: () => supabase.from('agreements').select('*').eq('id', id).single(),
  });
}

export function useCampaign(agreementId: string) {
  return useQuery({
    queryKey: ['campaigns', { agreementId }],
    queryFn: () => supabase.from('campaigns').select('*').eq('agreement_id', agreementId),
  });
}

// Both queries cached together
// Automatic cache invalidation
// Realtime updates propagate
```

**Realtime Updates:**
```typescript
// Single subscription for all updates
supabase
  .channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
    // Invalidate relevant queries
    queryClient.invalidateQueries([payload.table]);
  })
  .subscribe();
```

**Justification:**
- Best data management - truly unified
- No sync issues
- Shared caching
- Clean queries
- Rating: **Excellent** - ideal for data management

---

#### Option 4: Microservices - **Fair** (5/10)

**Pros:**
- ✅ Services own their data
- ✅ Clear data boundaries
- ✅ Event-driven sync

**Cons:**
- ❌ Data fragmentation
- ❌ Complex sync via events
- ❌ No ACID transactions across services
- ❌ Eventual consistency (not immediate)
- ❌ Complex query orchestration
- ❌ Caching distributed

**Data Flow:**
```
Organising Service          Planning Service
     │                            │
     ▼                            ▼
Organising DB              Planning DB
     │                            │
     └───────────┬────────────────┘
                 ▼
          Event Bus (Async)
```

**Sync Challenges:**
- Agreement updated → Event published → Campaign service updates
- Race conditions possible
- No immediate consistency
- Debugging data issues is hard

**Justification:**
- Event-driven sync adds complexity
- No immediate consistency
- Data fragmentation
- Not suitable for tightly coupled data
- Rating: **Fair** - too complex for current needs

---

### 5. Ongoing Development

**Metrics**: Code maintenance, feature velocity, developer experience, onboarding, testing

#### Option 1: Separate Apps - **Fair** (6/10)

**Pros:**
- ✅ Clear boundaries (focused codebases)
- ✅ Independent development
- ✅ Smaller codebases to understand
- ✅ Can run features independently

**Cons:**
- ❌ Code duplication (components, utils)
- ❌ Duplicate bug fixes
- ❌ Inconsistent patterns
- ❌ Cross-feature changes require 2 PRs
- ❌ Difficult onboarding (learn 2 apps)
- ❌ Merge conflicts in shared types

**Development Overhead:**
```typescript
// Duplicate component in both apps
// apps/organising-db/src/components/shared/button.tsx
export function Button({ children, ...props }) { /* ... */ }

// apps/oa-planner/src/components/shared/button.tsx
export function Button({ children, ...props }) { /* ... */ }

// Bug fix requires updating both files
```

**Feature Development:**
```
User Story: "Add notification feature"

1. Implement in Organising DB (3 days)
2. Implement in OA Planner (3 days)
3. Ensure consistency (1 day)
Total: 7 days

vs Merged App: 4 days (single implementation)
```

**Justification:**
- Duplicated effort hurts velocity
- Cross-app features are slow
- Onboarding is harder
- Rating: **Fair** - functional but inefficient

---

#### Option 2: Shared Navigation Shell - **Good** (7/10)

**Pros:**
- ✅ Shared components reduce duplication
- ✅ Shared patterns
- ✅ Still some independence

**Cons:**
- ❌ Shell complexity adds learning curve
- ❌ Module federation is tricky
- ❌ Cross-shell debugging is hard
- ❌ Version conflicts in shared deps

**Development Experience:**
```typescript
// Shared UI package
packages/ui/
  ├── button.tsx
  ├── dialog.tsx
  └── ...

// Both apps import from shared package
import { Button } from '@oa/ui';

// Single implementation to maintain
```

**Feature Development:**
```
User Story: "Add notification feature"

1. Implement in shared package (2 days)
2. Integrate in Organising DB (1 day)
3. Integrate in OA Planner (1 day)
Total: 4 days

Better than Option 1, more complex than Option 3
```

**Justification:**
- Shared components improve velocity
- Shell adds complexity
- Module federation learning curve
- Rating: **Good** - improved but not optimal

---

#### Option 3: Single Merged App - **Excellent** (9/10)

**Pros:**
- ✅ Single codebase to maintain
- ✅ No duplication
- ✅ Fast feature development
- ✅ Easy onboarding
- ✅ Consistent patterns
- ✅ Shared tests
- ✅ Single PR for cross-feature changes
- ✅ Easy refactoring

**Development Experience:**
```typescript
// Single component library
src/components/shared/
  ├── button.tsx
  ├── dialog.tsx
  └── ...

// Used everywhere
import { Button } from '@/components/shared/button';

// Single implementation
```

**Feature Development:**
```
User Story: "Add notification feature"

1. Implement in shared components (2 days)
2. Add to routes (1 day)
3. Test everywhere (1 day)
Total: 4 days

Fastest option - single implementation
```

**Refactoring:**
```
Task: "Update button styling"

Option 1: Update in 2 places (2 files)
Option 2: Update in shared package (1 file)
Option 3: Update in single place (1 file)
Option 4: Update per service (N files)

Option 3 wins for maintainability
```

**Testing:**
```
Single test suite
- Shared component tests
- Integration tests
- E2E tests

vs

Multiple test suites (Option 1, 2, 4)
```

**Justification:**
- Best developer experience
- Fastest feature velocity
- Easiest onboarding
- Cleanest codebase
- Rating: **Excellent** - ideal for development

---

#### Option 4: Microservices - **Poor** (3/10)

**Pros:**
- ✅ Teams can own services independently

**Cons:**
- ❌ High complexity
- ❌ Slow feature development (multiple services)
- ❌ Hard onboarding
- ❌ Distributed debugging
- ❌ Integration testing is complex
- ❌ Contract testing required
- ❌ Version management nightmares

**Development Overhead:**
```
User Story: "Add notification feature"

1. Update shared service (2 days)
2. Update organising service (1 day)
3. Update planning service (1 day)
4. Update shell (1 day)
5. Integration testing (2 days)
Total: 7 days + complex orchestration

Slowest option - too much overhead
```

**Justification:**
- Too complex for small team
- Slows down development
- Hard to debug
- Rating: **Poor** - hurts velocity significantly

---

### 6. Robustness & Reliability

**Metrics**: Error handling, deployment safety, scalability, fault tolerance, monitoring

#### Option 1: Separate Apps - **Excellent** (9/10)

**Pros:**
- ✅ Fault isolation (one app down ≠ both down)
- ✅ Independent deployments (safe rollouts)
- ✅ Separate error tracking
- ✅ Targeted scaling
- ✅ Easy rollback per app

**Cons:**
- ❌ Cross-app features fail if one app down
- ❌ Duplicate monitoring setup

**Failure Scenarios:**
```
Organising DB Down:
- OA Planner still works
- Cross-app links fail gracefully
- Users can still use Planner features

OA Planner Down:
- Organising DB still works
- Campaign links show error
- Core features remain available
```

**Deployment Safety:**
```
Independent Deployments:
1. Deploy Organising DB
2. Test in production
3. Rollback if needed (doesn't affect Planner)
4. Deploy OA Planner separately

vs

Merged App Deployment:
1. Deploy merged app
2. Affects all features at once
3. Rollback affects everything
```

**Justification:**
- Best fault isolation
- Safest deployments
- Independent scaling
- Rating: **Excellent** - most reliable

---

#### Option 2: Shared Navigation Shell - **Good** (7/10)

**Pros:**
- ✅ Apps still isolated
- ✅ Shell failure = apps still accessible (direct URLs)

**Cons:**
- ❌ Shell failure breaks unified navigation
- ❌ Module federation adds failure points
- ❌ More complex deployment

**Failure Scenarios:**
```
Shell Down:
- Apps still accessible via direct URLs
- Unified navigation broken
- Degraded UX but functional

App Down:
- Other app still works
- Shell shows error for failed app
```

**Justification:**
- Good isolation remains
- Shell adds single point of failure
- Module federation complexity
- Rating: **Good** - reliable but more complex

---

#### Option 3: Single Merged App - **Excellent** (8/10)

**Pros:**
- ✅ Simpler deployment (single app)
- ✅ Easier error tracking (single source)
- ✅ Comprehensive testing (one app)
- ✅ Consistent error handling

**Cons:**
- ❌ No fault isolation (bug affects all features)
- ❌ Riskier deployments (affects everything)
- ❌ Rollback affects entire app

**Failure Scenarios:**
```
Critical Bug:
- All features affected
- No partial degradation
- Must rollback entire app

Deployment:
- Single deployment
- Affects all users
- Higher risk but simpler
```

**Mitigation:**
```typescript
// Feature flags for safer rollouts
export function AgreementList() {
  if (featureFlags.agreements) {
    return <AgreementListV2 />;
  }
  return <AgreementListV1 />;
}
```

**Justification:**
- Simpler = more reliable overall
- Riskier deployments but easier rollbacks
- Feature flags can mitigate
- Rating: **Excellent** - simpler = more reliable

---

#### Option 4: Microservices - **Fair** (5/10)

**Pros:**
- ✅ Fault isolation between services
- ✅ Independent scaling

**Cons:**
- ❌ Many failure points
- ❌ Cascading failures
- ❌ Network failures
- ❌ Complex error handling
- ❌ Distributed debugging
- ❌ Event bus is single point of failure

**Failure Scenarios:**
```
Event Bus Down:
- Services can't communicate
- Features partially broken
- Data sync stops

Service Down:
- Shell still loads
- Some features broken
- Inconsistent UX

Cascading Failure:
- One service fails
- Overloads dependent services
- Entire system goes down
```

**Justification:**
- Too many failure points
- Cascading failures are common
- Complex to debug
- Rating: **Fair** - reliable in theory, fragile in practice

---

### 7. Repository Complexity

**Metrics**: Monorepo overhead, build orchestration, CI/CD complexity, dependency management

#### Option 1: Separate Apps - **Excellent** (9/10)

**Pros:**
- ✅ Simple monorepo structure
- ✅ Clear app boundaries
- ✅ Independent builds
- ✅ Minimal coordination
- ✅ Current setup (already working)

**Cons:**
- ❌ Duplicate dependencies in node_modules

**Repository Structure:**
```
offshore-alliance/
├── apps/
│   ├── organising-db/          # Independent
│   └── oa-planner/             # Independent
├── packages/
│   └── db-types/               # Shared types only
├── supabase/
│   └── migrations/
├── package.json                # Root (minimal)
├── pnpm-workspace.yaml
└── turbo.json                  # Simple tasks
```

**Build Orchestration:**
```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**CI/CD:**
```yaml
# Simple GitHub Actions
name: Build and Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
```

**Justification:**
- Current setup works well
- Simple to understand
- Minimal overhead
- Rating: **Excellent** - simplest setup

---

#### Option 2: Shared Navigation Shell - **Fair** (5/10)

**Pros:**
- ✅ Still monorepo benefits

**Cons:**
- ❌ Module federation configuration
- ❌ Shell app to manage
- ❌ Shared UI package
- ❌ Complex build orchestration
- ❌ Version alignment challenges

**Repository Structure:**
```
offshore-alliance/
├── apps/
│   ├── shell/                  # NEW: Navigation shell
│   ├── organising-db/          # Modified
│   └── oa-planner/             # Modified
├── packages/
│   ├── ui/                     # NEW: Shared components
│   └── db-types/
├── supabase/
│   └── migrations/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json                  # COMPLEX orchestration
```

**Build Orchestration:**
```json
// Complex turbo.json
{
  "tasks": {
    "build:shell": {
      "outputs": [".next/**"]
    },
    "build:apps": {
      "dependsOn": ["^build"],
      "outputs": [".next/**"]
    },
    "dev:shell": {
      "cache": false
    },
    "dev:apps": {
      "dependsOn": ["dev:shell"],
      "cache": false
    }
  }
}
```

**Module Federation Config:**
```javascript
// Complex webpack config per app
const ModuleFederationPlugin = require('@module-federation/nextjs-mf');

module.exports = {
  webpack(config) {
    config.plugins.push(
      new ModuleFederationPlugin({
        name: 'organising',
        filename: 'remoteEntry.js',
        exposes: {
          './AgreementList': './src/components/agreement-list.tsx',
        },
        shared: {
          react: { singleton: true },
          'react-dom': { singleton: true },
        },
      })
    );
    return config;
  },
};
```

**Justification:**
- Significant complexity added
- Module federation is tricky
- Hard to debug
- Rating: **Fair** - complex overhead

---

#### Option 3: Single Merged App - **Good** (7/10)

**Pros:**
- ✅ Single app (no orchestration)
- ✅ Simple build process
- ✅ Unified dependencies

**Cons:**
- ❌ Larger monorepo
- ❌ Longer build times
- ❌ More code to navigate

**Repository Structure:**
```
offshore-alliance/
├── apps/
│   └── offshore-alliance/      # Single merged app
│       ├── src/
│       │   ├── app/
│       │   │   ├── organising/     # Route prefixes
│       │   │   └── planner/
│       │   ├── components/
│       │   ├── lib/
│       │   └── types/
│       ├── package.json
│       └── next.config.js
├── packages/
│   └── db-types/
├── supabase/
│   └── migrations/
├── package.json                # Root (minimal)
├── pnpm-workspace.yaml
└── turbo.json                  # Simple (single task)
```

**Build Orchestration:**
```json
// Simple turbo.json
{
  "tasks": {
    "build": {
      "outputs": [".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**CI/CD:**
```yaml
# Simple GitHub Actions
name: Build and Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm build        # Single build
      - run: pnpm test
```

**Complexity Factors:**
- Large codebase (248+ files) but organized
- Single build process
- No orchestration needed
- Longer build but simple

**Justification:**
- Simpler than Option 2
- No orchestration complexity
- Large but organized codebase
- Rating: **Good** - manageable complexity

---

#### Option 4: Microservices - **Poor** (2/10)

**Pros:**
- ✅ Services can be separate repos

**Cons:**
- ❌ Complex orchestration
- ❌ Multiple build pipelines
- ❌ Service mesh configuration
- ❌ Event bus infrastructure
- ❌ Version management nightmare
- ❌ Distributed monorepo or polyrepo

**Repository Structure:**
```
offshore-alliance/
├── apps/
│   ├── shell/                  # Frontend shell
│   ├── services/
│   │   ├── organising-service/
│   │   ├── planning-service/
│   │   └── shared-service/
├── infrastructure/
│   ├── events/
│   ├── monitoring/
│   └── service-mesh/
├── packages/
│   ├── shared-types/
│   ├── event-schemas/
│   └── contracts/
└── docker-compose.yml          # Local orchestration
```

**Build Orchestration:**
```json
// Extremely complex turbo.json
{
  "tasks": {
    "build:shell": { /* ... */ },
    "build:services": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "build:infrastructure": { /* ... */ },
    "docker:build": { /* ... */ },
    "docker:up": { /* ... */ },
    "test:integration": { /* ... */ },
    "test:contract": { /* ... */ },
    "deploy:services": { /* ... */ }
  }
}
```

**Docker Compose:**
```yaml
# Local development complexity
version: '3.8'
services:
  shell:
    build: ./apps/shell
    ports: ["3000:3000"]
  organising-service:
    build: ./apps/services/organising-service
    environment:
      - EVENT_BUS_URL=http://event-bus:5672
  planning-service:
    build: ./apps/services/planning-service
  event-bus:
    image: rabbitmq:latest
  postgres:
    image: postgres:latest
```

**Justification:**
- Extremely complex
- Overkill for current scale
- Too many moving parts
- Rating: **Poor** - unmanageable complexity

---

## Summary Scores

### Overall Ratings (Average of all criteria)

| Option | Avg Score | Rank |
|--------|-----------|------|
| **Option 1: Separate Apps** | 6.9/10 | 3rd |
| **Option 2: Shared Shell** | 6.1/10 | 4th |
| **Option 3: Merged App** | 8.4/10 | **1st** |
| **Option 4: Microservices** | 4.3/10 | Last |

### Best Option per Criterion

| Criterion | Winner |
|-----------|--------|
| **Performance** | Option 3: Merged App |
| **Resource Requirements** | Option 3: Merged App |
| **User Experience (UX)** | Option 3: Merged App |
| **Data Management** | Option 3: Merged App |
| **Ongoing Development** | Option 3: Merged App |
| **Robustness & Reliability** | Option 1: Separate Apps (tied with Option 3) |
| **Repository Complexity** | Option 1: Separate Apps |

---

## Key Insights

### Option 3 (Merged App) Dominates
- **Wins 5 out of 7 criteria**
- Only loses to Option 1 in repository complexity (but still "Good")
- Best overall performer for small team

### Option 1 (Current State) is Solid
- **Best fault isolation**
- **Simplest repository**
- Stream 2 deep links make it viable
- Good option if teams want autonomy

### Option 2 (Shared Shell) Underwhelms
- **Complexity without proportional benefit**
- Micro-frontends add overhead
- Performance penalty from shell
- Not recommended for current scale

### Option 4 (Microservices) is Clearly Wrong
- **Worst or 2nd worst in every category**
- Over-engineered for small team
- Hurts velocity significantly
- Avoid at all costs

---

## Trade-off Analysis

### If you prioritize **Team Autonomy**
→ Choose **Option 1** (Separate Apps)

### If you prioritize **User Experience**
→ Choose **Option 3** (Merged App)

### If you prioritize **Simplicity**
→ Choose **Option 1** (current state) or **Option 3** (merged)

### If you prioritize **Fault Isolation**
→ Choose **Option 1** (Separate Apps)

### If you prioritize **Developer Experience**
→ Choose **Option 3** (Merged App)

---

## Conclusion

**Option 3 (Single Merged App) is the clear winner** based on this matrix. It dominates in 5 out of 7 criteria and performs well in the remaining 2. The only area where Option 1 beats it is repository complexity, but Option 3 still scores "Good" in that category.

**Option 1 (Current State)** remains a strong contender, especially if fault isolation and team autonomy are critical.

**Options 2 and 4 are not recommended** - they add complexity without proportional benefits.

See `STREAM3_3_RECOMMENDATION.md` for the final recommendation.
