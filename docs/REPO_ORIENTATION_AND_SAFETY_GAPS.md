# Offshore Alliance Platform — Orientation & Safety Gaps

> Captured 2026-04-20 during a repo orientation session. Snapshot in time — verify against the live codebase before acting on specifics.

## 1. What the project is

A private, internal union organising platform for the Offshore Alliance (AWU + MUA joint initiative), targeting workers in Western Australia's offshore oil and gas sector. Two integrated functions: **campaign/worker database management** and **strategic campaign planning** (Playing to Win methodology).

**Architecture:** pnpm + Turborepo monorepo with a single Next.js application (`apps/organising-db`) that has absorbed what was originally a separate "OA Planner" app. The planner now lives as a `/campaigns/[id]/plan` sub-route, with permanent redirects from the old `/planner/*` paths. One shared Supabase PostgreSQL backend, one shared `packages/db-types` package.

## 2. Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| UI | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons |
| State | TanStack Query v5 (server state), Zustand v5 (sparse), React Context (auth, device) |
| Database | Supabase PostgreSQL (30+ tables) |
| Auth | Supabase Auth (SSR cookies) + custom refresh orchestration |
| Maps | Leaflet + react-leaflet |
| AI | Anthropic Claude API |
| File parsing | `xlsx`, `pdf-parse` |
| Comms | Action Network (email), Yabbr.io (SMS), Resend |
| Error tracking | Sentry (with session replay) |
| Package manager | pnpm 10 |
| Monorepo | Turborepo 2 |
| Deployment | Vercel (weekly cron for snapshots) |
| CI | GitHub Actions (auto-regenerate DB types on migration push) |

## 3. Directory structure (highlights)

```
/
├── apps/organising-db/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── campaigns/[id]/plan/    (absorbed OA Planner)
│   │   │   │   ├── campaigns/[id]/phone/   (phone banking)
│   │   │   │   └── ...workers, employers, worksites, agreements, reports, maps, administration
│   │   │   ├── api/                        (30+ endpoint groups)
│   │   │   └── leader/                     (token-gated leader task routes)
│   │   ├── components/                     (campaigns, phone, import, layout, ui...)
│   │   ├── lib/
│   │   │   ├── supabase/                   (client, server, admin, middleware, session-recovery, connection-monitor)
│   │   │   ├── hooks/                      (~19 query/mutation hooks)
│   │   │   ├── planning/                   (ambition status, p2w step completion)
│   │   │   ├── phone/                      (call flow state machine)
│   │   │   └── utils/, prompts/, ai-cache.ts, rate-limit-middleware.ts
│   │   ├── types/
│   │   └── middleware.ts
│   ├── scripts/                            (seed + taxonomy)
│   └── vercel.json                         (cron: weekly snapshots)
├── packages/db-types/                      (auto-generated Supabase types)
├── supabase/migrations/                    (0001–0016 + 50+ timestamped)
└── docs/                                   (analysis + planning docs)
```

## 4. Key entry points

**Auth / session:**
- `apps/organising-db/src/middleware.ts` — runs on every non-API route
- `apps/organising-db/src/lib/supabase/middleware.ts` — token refresh
- `apps/organising-db/src/components/providers.tsx` — QueryClient, auth-aware error handler, visibility-based refresh, 60s heartbeat probe

**App shell:**
- `apps/organising-db/src/app/layout.tsx`
- `apps/organising-db/src/app/(dashboard)/layout.tsx`

**Supabase clients:**
- `src/lib/supabase/client.ts` — singleton browser client, **`autoRefreshToken: false`** (intentional; see Section 8)
- `src/lib/supabase/server.ts` — server component client
- `src/lib/supabase/admin.ts` — service role client

**API routes of note:** `/api/campaigns/[id]/call-attempts`, `/api/phone-wizard/*`, `/api/employer-wizard/analyse|apply`, `/api/theory-of-winning`, `/api/snapshots`, `/api/workload`, `/api/action-network`, `/api/yabbr`.

## 5. State management

- **TanStack Query** is primary. Keys follow `['entity', id, sub-id]`. `staleTime` defaults to 5 min. Writes use `useAuthAwareMutation` (pre-mutation token check, one auth-error retry).
- **AuthContext** (`src/lib/supabase/auth-context.tsx`) exposes `user`, `profile`, role flags, `signOut`, `hardRefreshConnection`.
- **DeviceContext** — `isMobile`, set server-side via middleware `x-viewport` header.
- **Zustand** — declared dependency but sparse usage (worker wall chart DnD).
- **Pure reducer** — phone banking call flow FSM in `src/lib/phone/call-flow-state.ts`.

## 6. Database / backend

- Supabase project ID (hardcoded in workflow + `gen:types` script): **`gteygwfgjvczanmrwgbr`**.
- 60+ migration files. `0001`–`0016` foundational; timestamped files are post-2026-03-30 incremental. Most recent: `20260430120000_call_list_scripts.sql`.
- RLS enabled on all tables. Three roles: `admin`, `user`, `viewer`.
- Type gen: `pnpm gen:types` → `packages/db-types/index.ts`. Auto-triggered by GH Actions on migration changes.
- Key views: `worker_ambition_rating`, `ambition_progress`, `ambition_activity_contribution`, `campaign_worker_rating_summary`.
- Key RPCs: `get_workload_dashboard_data`, `check_rate_limit`, `log_rate_limit_request`, `record_call_attempt`, `record_assessment_event`.

## 7. Tooling

- `pnpm dev` — Turborepo; Next.js on port 3000.
- `pnpm build` — checks env vars at build time.
- `pnpm lint` — `eslint-config-next` 16.1.6.
- `pnpm gen:types` — requires `SUPABASE_ACCESS_TOKEN`.
- GH Actions workflow `.github/workflows/gen-types.yml` auto-commits regenerated types.
- Sentry via `withSentryConfig` in `next.config.ts`.
- Vercel cron: `POST /api/snapshots` Mondays 09:00 UTC.

## 8. Known issues & concerns (safety gaps)

### Critical / security

**a) RLS oversharing on planning tables.** The `is_assigned_to_campaign()` function joins `agreements` to `campaigns` without constraining the join — an organiser on *any* agreement passes the check for *any* campaign. Documented in `SECURITY_AND_GAPS.md` §1. Fix: constrain the join to the specific agreement linked to the campaign.

**b) Cron snapshot route uses anon client, not service role.** `/api/snapshots` GET handler (Vercel cron) creates a regular server client — RLS blocks it without a user session. Weekly automated snapshots silently fail or produce incomplete data. Fix: use `createAdminClient()` in GET. (POST path already uses the authed user correctly.)

**c) CI pnpm version mismatch.** GH Actions workflow pins `pnpm@9`; monorepo `packageManager` is `pnpm@10.17.1`. Could cause subtle install differences between CI-regenerated types and local dev.

### Type safety gaps

- Multiple `as any` casts in planner pages (`plan/page.tsx`, `stage/[stageNumber]/page.tsx`, `gate/[gateNumber]/page.tsx`) because Supabase generics can't infer joined relations. Runtime-safe, but TS won't catch `.select()` shape drift.
- `rate-limit-middleware.ts` has `data as any` after `check_rate_limit` RPC (return type absent from generated types).

### Architectural concerns

**d) Auth token refresh is fully manual.** `autoRefreshToken: false`. Refresh happens in four places: middleware, visibility handler, 60s heartbeat probe, pre-mutation `ensureValidSession()`. Intentional (to prevent "Already Used" refresh token races) but any gap leaves users silently expired. Diagnostics shim, cookie diagnostics, connection monitor, and session-recovery modules are scaffolding for this.

**e) Singleton Supabase browser client.** `createClient()` returns a module-level `_client`. Necessary for the refresh-deduplication mutex, but `resetClient()` during nuclear reset / sign-out can leave a brief window where concurrent refetches see a stale/undefined client.

**f) Large page components.** `/campaigns/[id]/page.tsx` is a large client component with 8+ tabs, all queries, and inline dialog state. `reference-data-wizard.tsx` (~1250 lines) has several `as any` casts.

**g) CrossAppBanner is a placeholder.** Currently a static "Offshore Alliance Platform" label with a database icon. README describes cross-app nav to `oaplanner.uconstruct.app`, not implemented.

**h) AI cache is a stub.** `isAICachingEnabled()` returns false unless `NEXT_PUBLIC_AI_CACHE_ENABLED=true`. AI routes don't actually cache.

**i) Dev debug artifact in code.** `src/lib/agent-debug-log.ts` has a hardcoded session ID (`"019616"`) and localhost endpoint (`http://127.0.0.1:7908/...`). Guarded by `NEXT_PUBLIC_AGENT_DEBUG_INGEST !== "1"` but worth reviewing before prod.

**j) Import log retention.** No archival/deletion for `import_logs`. Grows unbounded.

**k) No employer-merge validation.** Circular references and invalid hierarchy merges (Principal → Subcontractor) not prevented.

### Incomplete features

- Gate criteria `current_value` manual-only — no automated data pull.
- Worksite parent/child hierarchy in schema; UI underdeveloped.
- `projects` table + `project_employers` / `project_agreements` — marked "future functionality".
- Deep links between the two apps not fully implemented.
- Organiser workload dashboard is partial.

## 9. Missing config & setup docs

**No `.env.local.example` exists** under `apps/organising-db/` despite the README referencing it:

```
cp apps/organising-db/.env.local.example apps/organising-db/.env.local
```

Required env vars (assembled from source — `turbo.json`, `admin.ts`, `cookie-options.ts`, `sentry.client.config.ts`, README):

| Variable | Used for | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin + cron | Yes |
| `ANTHROPIC_API_KEY` | AI features | Yes (for AI) |
| `ACTION_NETWORK_API_KEY` | Email integration | Yes (for email) |
| `YABBR_API_KEY` / `YABBR_API_URL` | SMS | Yes (for SMS) |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Email sending + webhook | Yes |
| `CRON_SECRET` | `/api/snapshots` GET auth | Yes (prod) |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry | Optional dev |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` | Cookie domain | Optional |
| `NEXT_PUBLIC_AI_CACHE_ENABLED` | AI cache stub | Optional |
| `NEXT_PUBLIC_AGENT_DEBUG_INGEST` | Dev debug ingest | Dev-only |
| `SUPABASE_ACCESS_TOKEN` | `pnpm gen:types` | CI-only |

**No `supabase/config.toml`** — project uses hosted Supabase exclusively. Local Supabase dev requires `supabase link` + `supabase db pull`.

## 10. Testing

**No automated test suite.** No Jest/Vitest/Playwright config. Testing is manual. The only testing-adjacent artifacts:
- `scripts/test-workload-dashboard.sh` — bash API probe
- Seed scripts under `apps/organising-db/scripts/`
- `CAMPAIGN_STATUS_TEST.md` — manual test cases

## 11. Recent activity patterns (as of 2026-04-20)

Heaviest recent work areas:
1. **Auth / connection reliability** — Web Lock deadlock, token refresh races, "infinite loading" fixes; custom refresh orchestration was built up over many commits.
2. **Phone banking** — FSM-based call flow, scripts, outcomes, dispositions.
3. **Assessment / rating system** — linking call outcomes → ambition ratings, activity events, ambition rollup views.
4. **Wall chart** — in-chart assessment creation, HSR badge, task creation from worker drawer.

**Most fragile area for bug-chasing:** the auth/session layer — heavily patched, multiple overlapping refresh mechanisms.

**Second most fragile:** phone banking call flow — new FSM, multiple recent outcome-recording fixes.
