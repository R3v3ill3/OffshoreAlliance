# Stream 3-4: UI Integration Options Analysis

**Document Version:** 1.0
**Date:** 2026-04-02
**Author:** Planning Agent 3.4
**Status:** Draft Analysis

## Executive Summary

This document analyzes 4 distinct approaches to UI integration between Organising DB and OA Planner, ranging from minimal changes (current state) to full unification. Each option is evaluated on user experience, development complexity, data consistency, and workflow disruption.

**Recommendation:** **Option B (Embedded Planner)** - Best balance of UX improvement and development effort.

---

## 1. Option A: Linked Apps (Current State)

### 1.1 Description

**What it is:** Separate applications with deep-link navigation
**Current Implementation:** Stream 2 (complete)

**User Experience:**
- Two browser tabs/windows
- Manual navigation between apps
- Context passing via query parameters
- Shared authentication

### 1.2 Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Organising DB     │         │     OA Planner      │
│   (Separate Tab)    │         │   (Separate Tab)    │
├─────────────────────┤         ├─────────────────────┤
│ • Campaign Mgmt     │         │ • Strategic Planning │
│ • Workers DB        │         │ • Stage Planning     │
│ • Actions/Tasks     │         │ • Gate Assessment    │
│ • Reports           │         │ • Timelines          │
└─────────────────────┘         └─────────────────────┘
         ▲                                 ▲
         │         Deep Links              │
         └─────────────────────────────────┘
              (Context Passing)
```

### 1.3 Pros

✅ **Implementation Complete** (Stream 2)
✅ **Clear Separation** - Distinct mental models
✅ **Independent Development** - No cross-app dependencies
✅ **Flexible Deployment** - Apps can deploy independently
✅ **Focused UX** - Each app optimized for its purpose
✅ **Performance** - Smaller bundle sizes
✅ **Maintenance** - Simpler codebase per app

### 1.4 Cons

❌ **Context Switching** - Users must switch tabs
❌ **Data Fragmentation** - Info spread across apps
❌ **Navigation Friction** - Manual links required
❌ **State Loss** - No shared client state
❌ **Confusion Risk** - Users may forget which app does what
❌ **Duplicate Views** - Same data viewed separately
❌ **Workflow Disruption** - Interrupts planning ↔ execution flow

### 1.5 Development Complexity

**Current Status:** ✅ COMPLETE

**Ongoing Effort:** Minimal
- Maintain deep links
- Update context parameters
- Fix navigation bugs

**Effort Estimate:** 1-2 days/month maintenance

### 1.6 Data Consistency

**Mechanism:** Shared database, separate caches

**Consistency Level:** EVENTUAL
- Updates visible when users refresh
- No real-time sync between apps
- Risk of stale data during concurrent edits

**Conflict Risk:** LOW
- Users aware of separate contexts
- Explicit app boundaries

### 1.7 Workflow Impact

**Typical User Journey:**
```
1. User in Organising DB (managing workers)
2. Clicks "View Campaign Plan"
3. New tab opens → OA Planner
4. User reviews strategic plan
5. Clicks "Back to Campaign"
6. Returns to Organising DB tab
7. Continues managing workers
```

**Disruption Points:**
- Tab switching (medium friction)
- Context re-orientation (medium friction)
- Separate authentication checks (low friction)

**Suitability:**
- ✅ Power users who understand separation
- ✅ Users who focus on one app per session
- ❌ Users who need fluid planning ↔ execution workflow

### 1.8 Enhancement Opportunities

**Low-Code Improvements:**
1. Breadcrumb navigation showing app context
2. "Return to [App]" buttons
3. Cross-app notification badges
4. Shared keyboard shortcuts
5. Unified color scheme

**Example:**
```tsx
// Enhanced breadcrumb
<Breadcrumb>
  <BreadcrumbItem href="/campaigns/123">
    <OrganisingDBIcon /> Campaign Details
  </BreadcrumbItem>
  <BreadcrumbSeparator />
  <BreadcrumbItem href={plannerUrl} target="_blank">
    <PlannerIcon /> Strategic Plan
  </BreadcrumbItem>
</Breadcrumb>

// Notification badge
<Badge count={crossAppNotifications}>
  <CampaignLink />
</Badge>
```

### 1.9 Overall Assessment

**Score:** 6/10

**Best For:**
- Current state maintenance
- Users preferring separate tools
- Independent app development

**Not Recommended For:**
- Users needing seamless workflow
- Real-time collaboration
- Unified campaign oversight

---

## 2. Option B: Embedded Planner

### 2.1 Description

**What it is:** OA Planner embedded as iframe within Organising DB
**Implementation:** Moderate development effort

**User Experience:**
- Single browser tab (Organising DB)
- Planner loads in embedded iframe
- Seamless context switching
- Shared authentication via postMessage

### 2.2 Architecture

```
┌─────────────────────────────────────────────────┐
│              Organising DB (Host)               │
│  ┌───────────────────────────────────────────┐  │
│  │  Campaign Detail Page                     │  │
│  │                                           │  │
│  │  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Campaign     │  │  OA Planner      │  │  │
│  │  │ Info         │  │  (iframe)        │  │  │
│  │  │              │  │                  │  │  │
│  │  │ • Workers    │  │  • Stage Plans   │  │  │
│  │  │ • Actions    │  │  • Ambitions     │  │  │
│  │  │ • Progress   │  │  • Gates         │  │  │
│  │  └──────────────┘  └──────────────────┘  │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  postMessage API ↔ Shared State Management       │
└─────────────────────────────────────────────────┘
```

### 2.3 Pros

✅ **Single Tab** - No tab switching
✅ **Shared Context** - Campaign info always visible
✅ **Unified URL** - Shareable links work
✅ **Independent Apps** - Planner remains standalone
✅ **Incremental Migration** - Can roll out gradually
✅ **Performance Isolation** - iframe crashes don't host
✅ **Version Flexibility** - Different deployment cycles

### 2.4 Cons

❌ **iframe Limitations** - CSS, JS restrictions
❌ **postMessage Complexity** - Cross-frame communication
❌ **Responsive Challenges** - Mobile sizing issues
❌ **SEO Impact** - Embedded content not indexed
❌ **Authentication Overhead** - Token passing required
❌ **Memory Usage** - Two React instances
❌ **Development Complexity** - Cross-frame debugging

### 2.5 Development Complexity

**Implementation Effort:** 2-3 weeks

**Components Required:**
1. **Iframe Container Component**
   ```tsx
   // apps/organising-db/src/components/planner/PlannerEmbed.tsx
   export function PlannerEmbed({ campaignId }: Props) {
     const plannerUrl = useMemo(() =>
       `${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/embed/campaigns/${campaignId}`,
       [campaignId]
     )

     const [iframeHeight, setIframeHeight] = useState(600)

     useEffect(() => {
       const handleMessage = (event: MessageEvent) => {
         if (event.origin !== process.env.NEXT_PUBLIC_OA_PLANNER_URL) return

         switch (event.data.type) {
           case 'resize':
             setIframeHeight(event.data.height)
             break
           case 'navigation':
             router.push(event.data.url)
             break
           case 'auth':
             // Refresh tokens
             break
         }
       }

       window.addEventListener('message', handleMessage)
       return () => window.removeEventListener('message', handleMessage)
     }, [])

     return (
       <iframe
         src={plannerUrl}
         style={{ width: '100%', height: iframeHeight, border: 'none' }}
         title="OA Planner"
       />
     )
   }
   ```

2. **postMessage Communication Layer**
   ```tsx
   // apps/oa-planner/src/lib/embed/post-message.ts
   export class PostMessageAPI {
     private target: Window

     constructor(target: Window) {
       this.target = target
     }

     sendHeight(height: number) {
       this.target.postMessage({
         type: 'resize',
         height
       }, '*')
     }

     sendNavigation(url: string) {
       this.target.postMessage({
         type: 'navigation',
         url
       }, '*')
     }

     sendAuthUpdate(token: string) {
       this.target.postMessage({
         type: 'auth',
         token
       }, '*')
     }

     onMessage(callback: (data: any) => void) {
       window.addEventListener('message', (event) => {
         if (event.origin !== process.env.NEXT_PUBLIC_SITE_URL) return
         callback(event.data)
       })
     }
   }

     // Hook for auto-resize
     export function useAutoResize() {
       const api = useMemo(() =>
         new PostMessageAPI(window.parent),
         []
       )

       useEffect(() => {
         const resizeObserver = new ResizeObserver(entries => {
           const height = entries[0].contentRect.height
           api.sendHeight(height)
         })

         resizeObserver.observe(document.body)
         return () => resizeObserver.disconnect()
       }, [api])
     }

     // Hook for auth sync
     export function useAuthSync() {
       const { session } = useAuth()
       const api = useMemo(() =>
         new PostMessageAPI(window.parent),
         []
       )

       useEffect(() => {
         if (session?.access_token) {
           api.sendAuthUpdate(session.access_token)
         }
       }, [session, api])
     }
   ```

3. **Embedded Route Handler**
   ```tsx
   // apps/oa-planner/src/app/(app)/embed/campaigns/[id]/page.tsx
   export default function EmbeddedCampaignPage({ params }: Props) {
     useAutoResize()
     useAuthSync()

     // Hide nav, header in embed mode
     return (
       <div className="embed-mode">
         <CampaignDetailContent id={params.id} />
       </div>
     )
   }

     // CSS for embed mode
     // apps/oa-planner/src/app/embed.css
     .embed-mode .header,
     .embed-mode .sidebar,
     .embed-mode .breadcrumbs {
       display: none !important;
     }

     .embed-mode {
       padding: 1rem;
     }
   ```

4. **Authentication Bridge**
   ```tsx
   // apps/organising-db/src/lib/embed/auth-bridge.ts
   export function usePlannerAuth() {
     const { session } = useAuth()

     const getPlannerToken = useCallback(() => {
       // Use same Supabase session
       return session?.access_token
     }, [session])

     const refreshPlannerToken = useCallback(async () => {
       // Refresh token via shared session
       const { data } = await supabase.auth.refreshSession()
       return data.session?.access_token
     }, [])

     return {
       getPlannerToken,
       refreshPlannerToken
     }
   }
   ```

**Effort Breakdown:**
- Iframe container: 2 days
- postMessage API: 3 days
- Embedded routes: 2 days
- Auth bridge: 2 days
- Testing: 5 days
- **Total:** ~14 days

### 2.6 Data Consistency

**Mechanism:** Shared database + postMessage state sync

**Consistency Level:** NEAR REAL-TIME
- Updates visible immediately in iframe
- Host app can poll for changes
- Bi-directional state synchronization

**State Sync Example:**
```tsx
// Host (Organising DB) sends campaign updates to iframe
function CampaignDetail({ campaignId }) {
  const [campaign, setCampaign] = useState()

  useEffect(() => {
    // Send campaign updates to iframe
     const iframe = document.querySelector('iframe')
     iframe?.contentWindow?.postMessage({
       type: 'campaign-update',
       data: campaign
     }, '*')
   }, [campaign])

   return <PlannerEmbed campaignId={campaignId} />
}

// Iframe (OA Planner) receives updates
useEffect(() => {
   const handleMessage = (event: MessageEvent) => {
     if (event.data.type === 'campaign-update') {
       queryClient.setQueryData(
         ['campaign', event.data.data.campaign_id],
         event.data.data
       )
     }
   }

   window.addEventListener('message', handleMessage)
   return () => window.removeEventListener('message', handleMessage)
}, [])
```

**Conflict Risk:** LOW-MEDIUM
- Shared state managed via postMessage
- Last-write-wins for conflicting updates
- User aware of embedded context

### 2.7 Workflow Impact

**Typical User Journey:**
```
1. User in Organising DB (campaign detail page)
2. Planner loads in embedded panel
3. User reviews strategic plan (same page)
4. User makes changes in planner
5. Updates sync to host via postMessage
6. User continues managing workers (same page)
7. No tab switching required
```

**Disruption Points:**
- iframe loading delay (low friction)
- Cross-frame communication (low friction)
- Mobile responsiveness (medium friction)

**Suitability:**
- ✅ Users needing seamless workflow
- ✅ Desktop users (primary use case)
- ✅ Users who need context switching
- ⚠️ Mobile users (responsive challenges)

### 2.8 Responsive Design Strategy

**Desktop (>1024px):**
```
┌─────────────────────────────────────────────┐
│  Campaign Info │  OA Planner (Full Height)  │
│  (Sidebar)     │                             │
└─────────────────────────────────────────────┘
```

**Tablet (768-1024px):**
```
┌─────────────────────────────────────────────┐
│  Tabs: Campaign | Planner                   │
├─────────────────────────────────────────────┤
│  [Active Tab Content]                       │
└─────────────────────────────────────────────┘
```

**Mobile (<768px):**
```
Option 1: Stack vertically
┌─────────────────────┐
│  Campaign Info      │
├─────────────────────┤
│  OA Planner         │
│  (scrollable)       │
└─────────────────────┘

Option 2: Tab navigation
┌─────────────────────┐
│ [Campaign] [Planner]│
├─────────────────────┤
│ [Active Content]    │
└─────────────────────┘
```

### 2.9 Overall Assessment

**Score:** 8/10

**Best For:**
- Seamless workflow requirements
- Desktop-first users
- Incremental integration approach

**Not Recommended For:**
- Mobile-first experience
- SEO-critical content
- Simple iframe requirements

**Recommendation:** **PREFERRED OPTION** - Best balance of UX and effort

---

## 3. Option C: Unified UI

### 3.1 Description

**What it is:** Single application with planning + management features
**Implementation:** Major refactoring effort

**User Experience:**
- Single browser tab
- Unified navigation
- Seamless feature integration
- Consistent design language

### 3.2 Architecture

```
┌─────────────────────────────────────────────────┐
│           Offshore Alliance Platform            │
│  ┌───────────────────────────────────────────┐  │
│  │  Unified Navigation                       │  │
│  │  [Dashboard] [Campaigns] [Planning]      │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Campaign Detail Page (Unified)           │  │
│  │                                           │  │
│  │  Tabs: Overview | Planning | Execution    │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐ │  │
│  │  │  [Active Tab Content]               │ │  │
│  │  │                                     │ │  │
│  │  │  Overview: Workers, Actions,        │ │  │
│  │  │           Progress Charts           │ │  │
│  │  │                                     │ │  │
│  │  │  Planning: Stage plans, Ambitions,  │ │  │
│  │  │           Gates, Timelines          │ │  │
│  │  │                                     │ │  │
│  │  │  Execution: Tasks, Ratings,         │ │  │
│  │  │            Communications           │ │  │
│  │  └─────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  Shared State Management (Zustand/Redux)         │
└─────────────────────────────────────────────────┘
```

### 3.3 Pros

✅ **Best UX** - Completely seamless experience
✅ **Single Codebase** - Simplified maintenance
✅ **Unified Design** - Consistent look and feel
✅ **Shared State** - No cross-app sync needed
✅ **Better Mobile** - Single responsive design
✅ **Single Auth** - No token passing
✅ **Performance** - Single bundle, optimized

### 3.4 Cons

❌ **Massive Refactor** - Merge two codebases
❌ **Feature Conflicts** - Resolve overlapping functionality
❌ **Monolithic** - Larger bundle size
❌ **Deployment Risk** - All-or-nothing releases
❌ **Team Coordination** - Require close collaboration
❌ **Development Time** - 3-6 months
❌ **Migration Risk** - Data migration, user training

### 3.5 Development Complexity

**Implementation Effort:** 3-6 months

**Major Components:**

1. **Codebase Consolidation**
   ```bash
   # Create new unified app structure
   apps/
   └── offshore-alliance/
       ├── src/
       │   ├── app/
       │   │   ├── (app)/
       │   │   │   ├── campaigns/
       │   │   │   │   ├── [id]/
       │   │   │   │   │   ├── page.tsx
       │   │   │   │   │   ├── overview/
       │   │   │   │   │   ├── planning/
       │   │   │   │   │   └── execution/
       │   │   │   │   └── new/
       │   │   │   ├── dashboard/
       │   │   │   ├── workers/
       │   │   │   ├── employers/
       │   │   │   └── reports/
       │   │   └── (auth)/
       │   ├── components/
       │   │   ├── campaigns/ (merged)
       │   │   ├── planning/ (from OA Planner)
       │   │   ├── workers/ (from ODB)
       │   │   └── shared/
       │   ├── lib/
       │   │   ├── hooks/ (merged)
       │   │   ├── api/ (unified)
       │   │   └── state/ (shared)
       │   └── styles/
       └── package.json
   ```

2. **State Management Unification**
   ```typescript
   // apps/offshore-alliance/src/lib/state/campaign-store.ts
   import { create } from 'zustand'

   interface CampaignStore {
     // Foundation data
     campaign: Campaign | null
     workers: Worker[]
     actions: Action[]

     // Planning data
     stagePlans: StagePlan[]
     ambitions: Ambition[]
     gates: Gate[]

     // UI state
     activeTab: 'overview' | 'planning' | 'execution'
     activeStage: number | null

     // Actions
     setCampaign: (campaign: Campaign) => void
     setWorkers: (workers: Worker[]) => void
     setStagePlans: (plans: StagePlan[]) => void
     setActiveTab: (tab: string) => void
   }

   export const useCampaignStore = create<CampaignStore>((set) => ({
     campaign: null,
     workers: [],
     actions: [],
     stagePlans: [],
     ambitions: [],
     gates: [],
     activeTab: 'overview',
     activeStage: null,

     setCampaign: (campaign) => set({ campaign }),
     setWorkers: (workers) => set({ workers }),
     setStagePlans: (stagePlans) => set({ stagePlans }),
     setActiveTab: (activeTab) => set({ activeTab }),
   }))
   ```

3. **Route Unification**
   ```typescript
   // apps/offshore-alliance/src/app/(app)/campaigns/[id]/page.tsx
   export default function UnifiedCampaignPage({ params }: Props) {
     const { activeTab } = useCampaignStore()
     const campaignId = parseInt(params.id)

     return (
       <div className="campaign-container">
         <CampaignHeader campaignId={campaignId} />

         <Tabs value={activeTab} onValueChange={setActiveTab}>
           <TabsList>
             <TabsTrigger value="overview">Overview</TabsTrigger>
             <TabsTrigger value="planning">Planning</TabsTrigger>
             <TabsTrigger value="execution">Execution</TabsTrigger>
           </TabsList>

           <TabsContent value="overview">
             <CampaignOverview campaignId={campaignId} />
           </TabsContent>

           <TabsContent value="planning">
             <CampaignPlanning campaignId={campaignId} />
           </TabsContent>

           <TabsContent value="execution">
             <CampaignExecution campaignId={campaignId} />
           </TabsContent>
         </Tabs>
       </div>
     )
   }

     // apps/offshore-alliance/src/app/(app)/campaigns/[id]/planning/page.tsx
     export default function CampaignPlanningPage({ params }: Props) {
       const campaignId = parseInt(params.id)

       return (
         <div className="planning-container">
           <StageNavigation campaignId={campaignId} />
           <AmbitionPanel campaignId={campaignId} />
           <WhereToPlayPanel campaignId={campaignId} />
           <TheoryOfWinningPanel campaignId={campaignId} />
           <CapacitiesPanel campaignId={campaignId} />
           <ManagementSystemsPanel campaignId={campaignId} />
         </div>
       )
     }
   ```

4. **Component Migration**
   ```typescript
   // Migrate components from both apps
   // Resolve naming conflicts
   // Standardize props
   // Unify styling

   // Example: CampaignCard components
   // Before: Two separate implementations
   // After: Single unified component

   export function CampaignCard({
     campaign,
     variant = 'management', // | 'planning'
     showActions = true,
     showPlanning = true,
     onClick
   }) {
     return (
       <Card>
         <CardHeader>
           <CardTitle>{campaign.name}</CardTitle>
         </CardHeader>
         <CardContent>
           {variant === 'management' && (
             <ManagementView campaign={campaign} />
           )}
           {variant === 'planning' && (
             <PlanningView campaign={campaign} />
           )}
         </CardContent>
       </Card>
     )
   }
   ```

5. **API Layer Unification**
   ```typescript
   // apps/offshore-alliance/src/lib/api/unified-client.ts
   class UnifiedAPIClient {
     private supabase: SupabaseClient

     constructor() {
       this.supabase = createClient()
     }

     // Campaign operations
     async getCampaign(id: number) {
       return this.supabase
         .from('campaigns')
         .select('*, campaigns_stage_plans(*), gate_definitions(*)')
         .eq('campaign_id', id)
         .single()
     }

     // Worker operations
     async getWorkers(filters: WorkerFilters) {
       return this.supabase
         .from('workers')
         .select('*, campaign_worker_membership(*)')
         .match(filters)
     }

     // Planning operations
     async getStagePlans(campaignId: number) {
       return this.supabase
         .from('campaign_stage_plans')
         .select('*, plan_ambitions(*), plan_where_to_play(*)')
         .eq('campaign_id', campaignId)
     }

     // Unified queries
     async getCampaignOverview(campaignId: number) {
       const [campaign, workers, plans, actions] = await Promise.all([
         this.getCampaign(campaignId),
         this.getWorkers({ campaign_id: campaignId }),
         this.getStagePlans(campaignId),
         this.getActions({ campaign_id: campaignId })
       ])

       return { campaign, workers, plans, actions }
     }
   }
   ```

**Effort Breakdown:**
- Codebase consolidation: 4 weeks
- Component migration: 4 weeks
- Route unification: 2 weeks
- State management: 2 weeks
- API layer: 2 weeks
- Testing: 4 weeks
- **Total:** ~18 weeks (4.5 months)

### 3.6 Data Consistency

**Mechanism:** Single app, shared state

**Consistency Level:** REAL-TIME
- Instant updates across all views
- No sync required
- Optimistic UI updates

**State Management:**
```typescript
// Centralized state store
const useCampaignStore = create<CampaignStore>((set, get) => ({
  // ... state

  // Optimistic updates
  updateAmbition: async (ambitionId: number, updates: Partial<Ambition>) => {
     // Update local state immediately
     set((state) => ({
       ambitions: state.ambitions.map((a) =>
         a.ambition_id === ambitionId
           ? { ...a, ...updates }
           : a
       )
     }))

     // Persist to server
     try {
       await api.updateAmbition(ambitionId, updates)
     } catch (error) {
       // Rollback on error
       set((state) => ({
         ambitions: get().previousAmbitions
       }))
     }
   }
}))
```

**Conflict Risk:** VERY LOW
- Single source of truth
- No concurrent app edits
- Consistent state model

### 3.7 Workflow Impact

**Typical User Journey:**
```
1. User opens campaign detail page
2. Default view: Overview tab
3. User clicks "Planning" tab
4. Strategic plan loads (same page, instant)
5. User updates ambition
6. Overview tab shows badge (real-time)
7. User clicks "Execution" tab
8. Task list loads with updated context
9. No page reloads, no app switching
```

**Disruption Points:**
- Initial learning curve (medium friction)
- New navigation patterns (low friction)
- Feature discovery (low friction)

**Suitability:**
- ✅ All user types
- ✅ All workflows
- ✅ Best long-term solution

### 3.8 Migration Strategy

**Phase 1: Preparation (4 weeks)**
- Audit components from both apps
- Document feature overlap
- Design unified architecture
- Set up new repo structure

**Phase 2: Core Migration (8 weeks)**
- Migrate shared components
- Consolidate state management
- Unify API layer
- Set up unified routing

**Phase 3: Feature Integration (4 weeks)**
- Migrate planning features
- Migrate management features
- Resolve feature conflicts
- Unify design system

**Phase 4: Testing & Launch (2 weeks)**
- End-to-end testing
- Performance optimization
- User acceptance testing
- Gradual rollout

**Rollback Plan:**
- Keep old apps running in parallel
- Feature flags for gradual migration
- Database schema compatible with both
- Emergency switch to old apps

### 3.9 Overall Assessment

**Score:** 9/10

**Best For:**
- Long-term platform vision
- All user types
- Best possible UX

**Not Recommended For:**
- Quick wins
- Resource-constrained teams
- Short timelines

**Recommendation:** **LONG-TERM GOAL** - Ultimate solution, but requires significant investment

---

## 4. Option D: Shared Workspace

### 4.1 Description

**What it is:** Common campaign view with app-specific "modes"
**Implementation:** Medium refactoring effort

**User Experience:**
- Single browser tab
- Unified campaign dashboard
- Toggle between "Management" and "Planning" modes
- Shared navigation and context

### 4.2 Architecture

```
┌─────────────────────────────────────────────────┐
│        Offshore Alliance Workspace             │
│  ┌───────────────────────────────────────────┐  │
│  │  Unified Navigation                       │  │
│  │  [Dashboard] [Campaigns] [Reports]        │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Campaign Workspace                       │  │
│  │                                           │  │
│  │  Mode: [Management ▾] [Planning ▾]       │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐ │  │
│  │  │  [Active Mode Content]              │ │  │
│  │  │                                     │ │  │
│  │  │  Management Mode:                   │ │  │
│  │  │  - Workers, Actions, Progress       │ │  │
│  │  │                                     │ │  │
│  │  │  Planning Mode:                     │ │  │
│  │  │  - Stage plans, Ambitions, Gates    │ │  │
│  │  └─────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  Shared Components (persistent across modes)     │
└─────────────────────────────────────────────────┘
```

### 4.3 Pros

✅ **Unified Context** - Single campaign view
✅ **Mode Switching** - Quick toggle between modes
✅ **Shared Components** - Reuse common UI elements
✅ **Incremental** - Can evolve from Option B
✅ **Separate Concerns** - Apps maintain distinct features
✅ **Flexible** - Can add more modes later
✅ **Better Mobile** - Single responsive design

### 4.4 Cons

❌ **Mode Confusion** - Users may not understand separation
❌ **Context Switching** - Still requires mode toggle
❌ **Development Overhead** - Maintain both modes
❌ **Complex State** - Share state across modes
❌ **Feature Duplication** - Some features in both modes
❌ **Navigation Complexity** - Breadcrumbs across modes

### 4.5 Development Complexity

**Implementation Effort:** 6-8 weeks

**Components Required:**

1. **Workspace Container**
   ```tsx
   // apps/organising-db/src/app/(dashboard)/campaigns/[id]/workspace/page.tsx
   export default function CampaignWorkspacePage({ params }: Props) {
     const [mode, setMode] = useState<'management' | 'planning'>('management')
     const campaignId = parseInt(params.id)

     return (
       <div className="workspace-container">
         <WorkspaceHeader
           campaignId={campaignId}
           mode={mode}
           onModeChange={setMode}
         />

         <WorkspaceContent
           campaignId={campaignId}
           mode={mode}
         />
       </div>
     )
   }

     // apps/organising-db/src/components/workspace/WorkspaceHeader.tsx
     export function WorkspaceHeader({
       campaignId,
       mode,
       onModeChange
     }: Props) {
       const { data: campaign } = useCampaign(campaignId)

       return (
         <div className="workspace-header">
           <div className="campaign-info">
             <h1>{campaign?.name}</h1>
             <p>{campaign?.description}</p>
           </div>

           <ModeToggle
             currentMode={mode}
             onModeChange={onModeChange}
           />
         </div>
       )
     }

     // apps/organising-db/src/components/workspace/ModeToggle.tsx
     export function ModeToggle({
       currentMode,
       onModeChange
     }: Props) {
       return (
         <div className="mode-toggle">
           <button
             className={currentMode === 'management' ? 'active' : ''}
             onClick={() => onModeChange('management')}
           >
             <ManagementIcon /> Management
           </button>
           <button
             className={currentMode === 'planning' ? 'active' : ''}
             onClick={() => onModeChange('planning')}
           >
             <PlanningIcon /> Planning
           </button>
         </div>
       )
     }
   ```

2. **Workspace Content Router**
   ```tsx
   // apps/organising-db/src/components/workspace/WorkspaceContent.tsx
   export function WorkspaceContent({
     campaignId,
     mode
   }: Props) {
     const sharedData = useSharedWorkspaceData(campaignId)

     return (
       <div className="workspace-content">
         <SharedSidebar campaignId={campaignId} />

         {mode === 'management' && (
           <ManagementMode
             campaignId={campaignId}
             sharedData={sharedData}
           />
         )}

         {mode === 'planning' && (
           <PlanningMode
             campaignId={campaignId}
             sharedData={sharedData}
           />
         )}
       </div>
     )
   }

     // apps/organising-db/src/components/workspace/ManagementMode.tsx
     export function ManagementMode({
       campaignId,
       sharedData
     }: Props) {
       return (
         <div className="mode-content management-mode">
           <WorkersList campaignId={campaignId} />
           <ActionsList campaignId={campaignId} />
           <ProgressCharts campaignId={campaignId} />
         </div>
       )
     }

     // apps/organising-db/src/components/workspace/PlanningMode.tsx
     export function PlanningMode({
       campaignId,
       sharedData
     }: Props) {
       return (
         <div className="mode-content planning-mode">
           <StageNavigation campaignId={campaignId} />
           <AmbitionPanel campaignId={campaignId} />
           <WhereToPlayPanel campaignId={campaignId} />
           <TheoryOfWinningPanel campaignId={campaignId} />
           <CapacitiesPanel campaignId={campaignId} />
           <ManagementSystemsPanel campaignId={campaignId} />
         </div>
       )
     }
   ```

3. **Shared Data Hook**
   ```typescript
   // apps/organising-db/src/lib/hooks/useSharedWorkspaceData.ts
   export function useSharedWorkspaceData(campaignId: number) {
     const { data: campaign } = useCampaign(campaignId)
     const { data: workers } = useWorkers(campaignId)
     const { data: stagePlans } = useStagePlans(campaignId)
     const { data: actions } = useActions(campaignId)

     // Shared across modes
     return useMemo(() => ({
       campaign,
       workers: workers || [],
       stagePlans: stagePlans || [],
       actions: actions || [],
       // Computed data
       workerCount: workers?.length || 0,
       activeStage: stagePlans?.find(s => s.status === 'active'),
       pendingActions: actions?.filter(a => a.status === 'pending').length || 0
     }), [campaign, workers, stagePlans, actions])
   }
   ```

4. **Mode Persistence**
   ```typescript
   // apps/organising-db/src/lib/hooks/useWorkspaceMode.ts
   export function useWorkspaceMode(campaignId: number) {
     const [mode, setMode] = useState<'management' | 'planning'>('management')

     // Persist mode preference
     useEffect(() => {
       const saved = localStorage.getItem(`workspace-mode-${campaignId}`)
       if (saved) setMode(saved as 'management' | 'planning')
     }, [campaignId])

     const handleModeChange = useCallback((newMode: 'management' | 'planning') => {
       setMode(newMode)
       localStorage.setItem(`workspace-mode-${campaignId}`, newMode)
     }, [campaignId])

     return [mode, handleModeChange] as const
   }
   ```

**Effort Breakdown:**
- Workspace container: 1 week
- Mode toggle system: 1 week
- Content router: 1 week
- Shared data layer: 1 week
- Mode-specific views: 2 weeks
- Testing: 2 weeks
- **Total:** ~8 weeks

### 4.6 Data Consistency

**Mechanism:** Single app, mode-specific caches

**Consistency Level:** REAL-TIME
- Shared state across modes
- Mode switches don't lose data
- Background sync when mode active

**State Management:**
```typescript
// Mode-specific state
interface WorkspaceState {
   shared: {
     campaign: Campaign
     workers: Worker[]
   }
   management: {
     actions: Action[]
     ratings: Rating[]
   }
   planning: {
     stagePlans: StagePlan[]
     ambitions: Ambition[]
   }
   ui: {
     activeMode: 'management' | 'planning'
     sidebarCollapsed: boolean
   }
}

// State persists across mode switches
const useWorkspaceStore = create<WorkspaceState>((set) => ({
   shared: {
     campaign: null,
     workers: []
   },
   management: {
     actions: [],
     ratings: []
   },
   planning: {
     stagePlans: [],
     ambitions: []
   },
   ui: {
     activeMode: 'management',
     sidebarCollapsed: false
   }
}))
```

**Conflict Risk:** LOW
- Single app context
- Mode-specific edits isolated
- Shared data explicitly managed

### 4.7 Workflow Impact

**Typical User Journey:**
```
1. User opens campaign workspace
2. Default mode: Management
3. User reviews worker list
4. User clicks "Planning" mode toggle
5. Page updates to planning view (same tab)
6. User updates ambition target
7. User switches back to Management mode
8. Updated progress shown (auto-synced)
9. No page reloads
```

**Disruption Points:**
- Mode toggle (low friction)
- Context re-orientation (low friction)
- Feature discovery (medium friction)

**Suitability:**
- ✅ Users who understand mode separation
- ✅ Users who focus on one mode at a time
- ✅ Desktop and tablet users
- ⚠️ Users who need simultaneous view (both modes)

### 4.8 Mobile Responsive Strategy

**Desktop (>1024px):**
```
┌─────────────────────────────────────────────┐
│  Campaign Info │  [Mode Toggle]             │
├─────────────────────────────────────────────┤
│  Shared Sidebar │  Mode Content (Full)      │
│  (Persistent)   │                            │
└─────────────────────────────────────────────┘
```

**Tablet (768-1024px):**
```
┌─────────────────────────────────────────────┐
│  Campaign Info                              │
│  [Mode Toggle]                              │
├─────────────────────────────────────────────┤
│  Collapsible Sidebar │  Mode Content        │
└─────────────────────────────────────────────┘
```

**Mobile (<768px):**
```
┌─────────────────────────────────────────────┐
│  Campaign Name ▼                           │
│  [Management] [Planning]                   │
├─────────────────────────────────────────────┤
│  [Mode Content - Full Width]               │
│                                             │
│  (Sidebar accessible via drawer)           │
└─────────────────────────────────────────────┘
```

### 4.9 Overall Assessment

**Score:** 7.5/10

**Best For:**
- Evolution from Option B
- Users who prefer mode separation
- Teams wanting incremental unification

**Not Recommended For:**
- Users needing simultaneous views
- Simple requirements (Option B sufficient)
- Full unification needed (Option C better)

**Recommendation:** **EVOLUTIONARY PATH** - Good stepping stone to Option C

---

## 5. Comparison Summary

### 5.1 Feature Comparison Matrix

| Feature | Option A (Linked) | Option B (Embedded) | Option C (Unified) | Option D (Shared Workspace) |
|---------|-------------------|---------------------|-------------------|----------------------------|
| **User Experience** |
| Single tab | ❌ | ✅ | ✅ | ✅ |
| Seamless navigation | ❌ | ✅ | ✅ | ✅ |
| Mode switching | N/A | N/A | N/A | ⚠️ |
| Context retention | ❌ | ✅ | ✅ | ✅ |
| Mobile-friendly | ✅ | ⚠️ | ✅ | ✅ |
| **Development** |
| Implementation time | ✅ Complete | ⚠️ 2-3 weeks | ❌ 3-6 months | ⚠️ 6-8 weeks |
| Maintenance effort | Low | Medium | Low | Medium |
| Team coordination | Low | Medium | High | Medium |
| Deployment risk | Low | Low | High | Medium |
| **Data & State** |
| Real-time sync | ❌ | ⚠️ | ✅ | ✅ |
| Conflict resolution | N/A | Required | Minimal | Required |
| State management | Separate | Complex | Unified | Mode-based |
| **Flexibility** |
| Independent releases | ✅ | ✅ | ❌ | ⚠️ |
| Feature flags | ✅ | ✅ | ✅ | ✅ |
| Rollback plan | Simple | Simple | Complex | Medium |
| A/B testing | ✅ | ✅ | ✅ | ✅ |

### 5.2 Score Comparison

| Criterion | Option A | Option B | Option C | Option D |
|-----------|----------|----------|----------|----------|
| **User Experience** (30%) |
| Navigation ease | 2/5 | 4/5 | 5/5 | 4/5 |
| Context switching | 1/5 | 4/5 | 5/5 | 3/5 |
| Mobile experience | 5/5 | 3/5 | 5/5 | 4/5 |
| **Development** (25%) |
| Implementation speed | 5/5 | 4/5 | 1/5 | 3/5 |
| Maintenance ease | 4/5 | 3/5 | 5/5 | 3/5 |
| Team coordination | 5/5 | 4/5 | 2/5 | 3/5 |
| **Data Consistency** (25%) |
| Real-time sync | 1/5 | 3/5 | 5/5 | 4/5 |
| Conflict handling | 4/5 | 3/5 | 5/5 | 3/5 |
| State management | 2/5 | 3/5 | 5/5 | 4/5 |
| **Flexibility** (20%) |
| Independent releases | 5/5 | 4/5 | 1/5 | 2/5 |
| Rollback plan | 5/5 | 4/5 | 2/5 | 3/5 |
| **WEIGHTED SCORE** | **3.1/5** | **3.6/5** | **4.1/5** | **3.4/5** |

---

## 6. Recommendation

### 6.1 Primary Recommendation: **Option B (Embedded Planner)**

**Rationale:**
1. **Best Balance:** Optimal trade-off between UX improvement and development effort
2. **Incremental:** Can implement in 2-3 weeks without major refactoring
3. **Low Risk:** Apps remain independently deployable
4. **Reversible:** Easy to rollback if issues arise
5. **Foundation:** Provides foundation for future evolution to Option C or D

**Implementation Priority:**
1. **Phase 1 (Week 1):** Iframe container + postMessage API
2. **Phase 2 (Week 2):** Embedded routes + auth bridge
3. **Phase 3 (Week 3):** Responsive design + testing

### 6.2 Evolution Path: **Option B → Option D → Option C**

**Timeline:**
- **Short-term (0-3 months):** Implement Option B
- **Medium-term (3-9 months):** Evolve to Option D (shared workspace)
- **Long-term (9-18 months):** Unify to Option C (single app)

**Justification:**
- Option B provides immediate UX improvement
- Option D tests unified workspace concept
- Option C delivers ultimate UX with proven patterns

### 6.3 Alternative Recommendation

**If resources are constrained:** **Enhance Option A**
- Add cross-app notification badges
- Implement unified breadcrumbs
- Create shared keyboard shortcuts
- Build "app switcher" component

**If long-term vision is priority:** **Jump to Option C**
- Requires 3-6 month investment
- Delivers best possible UX
- Future-proofs platform
- Worth it for committed teams

---

## 7. Implementation Checklist

### 7.1 Option B Implementation

**Pre-Implementation:**
- [ ] Review iframe security best practices
- [ ] Test postMessage communication
- [ ] Design responsive breakpoints
- [ ] Plan authentication flow

**Development:**
- [ ] Build iframe container component
- [ ] Implement postMessage API
- [ ] Create embedded routes in OA Planner
- [ ] Build authentication bridge
- [ ] Add auto-resize functionality
- [ ] Implement cross-frame state sync

**Testing:**
- [ ] Test cross-frame communication
- [ ] Verify authentication persistence
- [ ] Test responsive breakpoints
- [ ] Performance testing (bundle sizes)
- [ ] Security testing (XSS, frame injection)

**Launch:**
- [ ] Feature flag for gradual rollout
- [ ] Monitor cross-frame errors
- [ ] A/B test vs Option A
- [ ] Gather user feedback

---

## 8. Conclusion

The integration approach should balance:
1. **User needs** - Seamless workflow, minimal friction
2. **Business constraints** - Timeline, resources, risk tolerance
3. **Technical reality** - Current architecture, team skills
4. **Future vision** - Long-term platform goals

**Option B (Embedded Planner)** represents the optimal balance for the current stage of platform development, with a clear evolution path toward deeper integration (Options D and C) as the platform matures.

**Key Success Factors:**
- Maintain independent app deployment capability
- Implement robust cross-frame communication
- Design for mobile responsiveness
- Plan for evolutionary growth
- Monitor performance and user feedback

---

**Next Steps:**
1. Stakeholder review and approval
2. Technical proof-of-concept (postMessage)
3. Detailed implementation planning
4. Resource allocation and timeline
