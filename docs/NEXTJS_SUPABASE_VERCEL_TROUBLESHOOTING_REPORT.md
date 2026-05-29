# Next.js + Supabase + Vercel — Troubleshooting Experience Report

> **Purpose:** Consolidated historical record of issues, diagnosis, troubleshooting steps, and rectifications related to Supabase connections, permissions, and user/session persistence on the Offshore Alliance platform.  
> **Audience:** Engineers troubleshooting similar stacks on other projects.  
> **Scope:** Documentation and commit history only — not a live health assessment of the current deployment.  
> **Last compiled:** 2026-05-25

---

## Executive summary

The Offshore Alliance organising platform (`apps/organising-db`) is a **Next.js 16 App Router** application on **Vercel**, backed by a shared **Supabase** project (Auth + Postgres + RLS). Over several months (April–May 2026), the team encountered recurring **“app feels disconnected”** reports, **silent infinite spinners**, **unexpected logouts**, and a separate **Vercel API route timeout** incident.

The root causes clustered into three systemic areas:

1. **Session persistence and refresh orchestration** — Supabase Auth’s default cross-tab locking and background refresh interact badly with Next.js SSR middleware, multi-tab usage, and custom refresh logic.
2. **Split data paths (“two-lane architecture”)** — Browser → Supabase REST works while Browser → `/api/*` → Supabase can fail independently, masking the true failure domain.
3. **RLS and server-side client selection** — Row-level security and JWT context differ between browser client, cookie-based server client, anon client, and service-role client; cron jobs and API routes are easy to misconfigure.

This report maps each documented incident to diagnosis steps taken and fixes applied, and extracts transferable lessons for other Next.js/Vercel/Supabase projects.

---

## Stack context

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16 (App Router), React 19 | Single app after OA Planner merge |
| Hosting | Vercel | Custom domain `oa.uconstruct.app`; Turborepo monorepo |
| Database / Auth | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | Hosted only; project ID `gteygwfgjvczanmrwgbr` |
| State | TanStack Query v5 | Primary server-state layer |
| Observability | Sentry (+ session replay), PostHog | Connection events forwarded from client monitor |
| Cron | Vercel cron → `POST /api/snapshots` | Requires service-role or cron secret auth |

**Primary source documents reviewed:**

- `docs/SUPABASE_DROPOUT_INVESTIGATION.md`
- `docs/VERCEL_API_ROUTE_TIMEOUT_ISSUE.md`
- `docs/REPO_ORIENTATION_AND_SAFETY_GAPS.md`
- `SECURITY_AND_GAPS.md`, `REMEDIATION_PLAN.md`, `REMEDIATION_PLAN_v2.md`
- `apps/organising-db/public/PLATFORM_CONTEXT.md`
- `apps/organising-db/public/OA_PLANNER_IMPLEMENTATION_CHECKLIST.md`
- `apps/organising-db/public/OA_PLANNER_RESPONSES.md`
- `CROSS_APP_DEEP_LINKS.md`
- `.cursor/plans/fix_api_timeout_on_vercel_4aa6d375.plan.md`

---

## Timeline of major incidents and fixes

| Approx. date | Symptom / trigger | Primary classification | Key rectification |
|--------------|-------------------|------------------------|-------------------|
| 2026-04-08 | Intermittent data loss, infinite loading, logout requiring browser restart | Auth refresh races, stale cookies | `autoRefreshToken: false`, fetch timeouts, cookie cleanup, session recovery |
| 2026-04-08 | All `/api/*` routes hang on Vercel; Resend webhook fails | Vercel routing / middleware / DNS | Middleware matcher excludes `api/`; DNS restored; build-time client fix |
| 2026-04-16 | Continued intermittent Supabase access loss | Auth state corruption | Expanded session-recovery, diagnostics, heartbeat |
| 2026-04-17 | Planner wizard hangs; “Create Plan” broken | Web Lock deadlock | Load timeout escape hatch; wizard navigation fix |
| 2026-04-29–30 | Silent spinners on API-backed features (e.g. email Analyse) | Lane 2 hangs + no client timeout | `fetchApi()` with bounded timeouts + `X-Request-Id` |
| 2026-05-04 | Users kicked to login during wizard (perceived crash) | Cross-tab lock steal + aggressive timeout | `processLock` instead of `navigator.locks`; 12s auth op timeout; visibility handler no longer force-logouts on timeout |
| 2026-05-29 | Repeating `lock_timeout` every ~12s after tab background; banner + forced logout on Full Reset | **Auth-lock deadlock (H7)** — orphaned `processLock` leaves `lockAcquired` stuck; dead promises pinned in dedupe refs | Unpin dead promises + `resetClient()` clears refs; **reset-then-reload recovery ladder (no logout)**; visibility-gated heartbeat; quiet "Reconnecting…" UI; `instrumentedLock` + fixed PostHog forwarding. See dropout investigation §L |
| 2026-04-02+ | RLS oversharing; cron snapshots empty | Permissions / wrong Supabase client | Documented; permission system migration; cron uses admin client |

---

## Issue 1 — Intermittent “Supabase disconnect” and infinite loading

### Reported symptoms

- Pages stuck on loading spinners with no console error
- Data queries silently stop returning
- Sign-out/sign-in or **full browser restart** sometimes required to recover
- Re-login often fixed API-route failures while direct Supabase queries had appeared fine

### Diagnosis steps taken

1. **Classified request path** — Documented “two-lane” architecture (see § Architecture lessons):
   - **Lane 1:** Browser → Supabase REST/RPC via `createBrowserClient`
   - **Lane 2:** Browser → Next.js `/api/*` → server `createClient` + `getUser()` → Supabase / external providers

2. **Built incident intake checklist** — Timestamp, lane, pending Network request, console `[connection-monitor]` events, deployment ID, Supabase auth logs (`docs/SUPABASE_DROPOUT_INVESTIGATION.md` §B).

3. **Reproduction matrix** — Cold start, 45–60 min idle, background tab, multi-tab, laptop sleep, lane contrast (`§C`).

4. **Hypothesis labelling** — Session skew (H1), API hang (H2), provider stall (H3), platform outage (H4), RLS/JWT surprise (H5), browser/edge (H6).

5. **Added client instrumentation** — `connection-monitor.ts`, `cookie-diagnostics.ts`, `diagnostics-shim.ts` (navigator.locks + fetch tracing), Sentry breadcrumbs, PostHog events.

6. **Git archaeology** — Commits `a9501da`, `9f52246`, `4cca512`, `8aa3907`, `a64f520` capture the iterative fix sequence.

### Root causes identified (historical)

| Cause | Mechanism |
|-------|-----------|
| Refresh token race | Supabase refresh tokens are **single-use**. Concurrent refreshes from middleware, client auto-refresh timer, visibility handler, and mutations rotated the same token → **“Invalid Refresh Token: Already Used”** → corrupted auth state |
| `navigator.locks` cross-tab steal | Default `@supabase/auth-js` lock uses browser Web Locks with ~5s acquire timeout. Second tab **steals** lock → first tab’s `getSession`/`getUser` aborts → inconsistent state |
| Hung auth calls | Native `fetch` and `getSession()` have **no timeout**; broken auth client → infinite spinner |
| Incomplete logout | `signOut()` through broken client could timeout without clearing cookies; stale `sb-*` cookies reloaded on next client init |
| Over-aggressive recovery | 6s `getSession` timeout treated as confirmed session loss → `forceLogoutToLogin` during legitimate slow refresh (especially multi-tab) |

### Rectification steps applied

#### A. Disable built-in auto-refresh; centralize refresh

- Set `autoRefreshToken: false` on browser client (`client.ts`).
- All refresh paths routed through **`coordinatedRefreshSession()`** mutex to deduplicate in-flight refreshes.
- Refresh orchestration split across:
  1. **Middleware** — server-side session refresh on page navigations (`middleware.ts` → `updateSession`)
  2. **Visibility handler** — proactive refresh when tab becomes visible (`providers.tsx`)
  3. **60s heartbeat** — probes session / DB connectivity
  4. **Pre-mutation guard** — `ensureValidSession()` in `useAuthAwareMutation.ts` (~5 min before JWT expiry)

#### B. Replace cross-tab Web Locks with in-tab `processLock`

- Commit `8aa3907`: `auth.lock = processLock` (from `@supabase/supabase-js`) instead of default `navigatorLock`.
- Rationale documented in code: cross-tab serialization forfeited; refresh tokens still single-use server-side; cookie writes last-writer-wins; `BroadcastChannel` still propagates auth events.
- References captured: supabase-js #2178, #2308, #2235, #1594.

#### C. Timeouts at every layer

| Layer | Timeout | Purpose |
|-------|---------|---------|
| Supabase browser fetch | 20s (`SUPABASE_FETCH_TIMEOUT_MS`) | Prevent hung REST/auth calls |
| Auth operations (`getSession`, etc.) | 12s (`SUPABASE_AUTH_OP_TIMEOUT_MS`, raised from 6s) | Prevent UI block; avoid false force-logout |
| `/api` client calls (`fetchApi`) | 60s default; 120s LLM/upload; 600s SSE | Surface `AbortError` instead of infinite spinner |
| Coordinated refresh (recovery) | 12s | Bounded recovery attempt |
| Sign-out | 5s | Fall through to manual cookie clear |

#### D. Session recovery and “nuclear reset”

- `session-recovery.ts`: graduated recovery (refresh → getSession → DB probe → optional workload RPC probe).
- **Circuit breaker** (30s window) prevents recovery cascades.
- **`forceLogoutToLogin`**: clears cookies (both `.uconstruct.app` and host-only), localStorage/sessionStorage `sb-*` keys, resets client singleton.
- **`nuclearReset()`**: bypasses auth client entirely when it is hung.
- **`isLikelyAuthError()`**: distinguishes 401/JWT errors from RLS 403; treats lock/timeout sentinels as auth failures for recovery routing.

#### E. Visibility handler behaviour fix

- Commit `a64f520`: on `getSession` **timeout**, log and **return** — do **not** escalate to force-logout.
- Rationale: underlying auth call may still complete; in-flight queries use cached access token; genuine invalidity surfaces as 401 on next query.

#### F. Observability and user-facing diagnostics

- `ConnectionStatusBanner` with copy-to-clipboard diagnostics.
- Connection events: `token_refresh_ok/fail`, `session_lost`, `lock_timeout`, `recovery_start/end`, etc.
- Critical events forwarded to Sentry (`captureMessage`) and PostHog.

#### G. Dependency upgrade

- `@supabase/ssr` upgraded (0.9 → 0.10+) for CDN cache-header fix (commit `9f52246`).

### Transferable lessons

1. **Do not assume Supabase SSR “just works” with multiple refresh consumers** — If middleware refreshes, disable client `autoRefreshToken` and deduplicate all other refresh entry points.
2. **Multi-tab SPA + Supabase Auth = test explicitly** — Default Web Locks cause production-only failures; consider `processLock` or documented lock strategy.
3. **Never treat auth operation timeout as confirmed logout** — Prefer soft fail; let the next real 401 drive recovery.
4. **Logout must clear cookies outside the auth client** — When the client is broken, `signOut()` is unreliable.
5. **Add fetch timeouts everywhere** — Both Supabase SDK fetch and app-level `/api` fetch.

---

## Issue 2 — Vercel API route total timeout (April 2026)

### Reported symptoms

- **All** `/api/*` routes returned no HTTP response (pending forever)
- Page routes (`/login`, `/dashboard`) responded instantly
- Affected custom domain **and** Vercel preview URL
- Resend inbound webhook to `/api/email-import/webhook` timed out
- In-browser app mostly worked because it uses **Lane 1** (direct Supabase), not API routes

### Diagnosis steps taken

1. **curl matrix** across page vs API routes on both domains (`docs/VERCEL_API_ROUTE_TIMEOUT_ISSUE.md`).
2. **Ruled out TLS** — handshake succeeded; no response bytes received.
3. **Ruled out route-specific code** — pre-existing routes (`/api/templates`, `/api/action-network`) also timed out.
4. **Checked Vercel Deployment Protection** — was enabled initially; disabled and redeployed; timeouts persisted.
5. **Reviewed middleware** — matcher originally included `/api/*`; API routes created Supabase server client on every request.
6. **Verified env vars** on Vercel — Supabase keys, Resend keys present; added missing `ANTHROPIC_API_KEY`.
7. **DNS investigation** — Resend inbound email setup had altered `oa.uconstruct.app` records (CNAME/MX conflict); app page routes restored after A record fix, but API timeout was separate.

### Root causes identified (historical)

| Cause | Notes |
|-------|-------|
| Middleware intercepting `/api/*` | Global middleware ran Supabase session logic before API handlers; suspected choke point (`.cursor/plans/fix_api_timeout_on_vercel_4aa6d375.plan.md`) |
| Build-time side effects | `new Resend()` at module scope failed build and indicated pattern of top-level client init |
| Missing Turbo env passthrough | Server env vars not declared in `turbo.json` `build.env` |
| DNS collateral | Custom domain breakage during email setup; orthogonal to API timeout but confused diagnosis |

### Rectification steps applied

1. **Middleware matcher excludes API routes** — Current config:
   ```
   /((?!api/|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico)$).*)
   ```
   Documented in `VERCEL_API_ROUTE_TIMEOUT_ISSUE.md` §Current understanding (2026-04-30).

2. **Lazy client factories** — e.g. `getResendClient()` inside handlers, not module scope.

3. **`turbo.json` env array** — Ensures server secrets available at build/runtime in monorepo.

4. **Planned (from plan doc)** — `/api/ping` smoke route; stage logging in webhook/templates routes; bounded external call timeouts in webhook.

5. **`fetchApi()` wrapper** (commit `4cca512`) — Client-side bounded fetches for `/api/*` so remaining server stalls become user-visible aborts, not silent spinners.

### Transferable lessons

1. **Exclude `/api/*` from auth middleware by default** — Perform auth inside route handlers with `createClient()`; middleware session refresh is for page navigations.
2. **Keep a zero-dependency `/api/health` or `/api/ping`** — Separates Vercel routing from Supabase/provider latency.
3. **Never instantiate third-party SDK clients at module top level** in Next.js — Builds and cold starts execute that code.
4. **Declare server env vars in Turborepo `build.env`** — Prevents “works locally, empty at build on Vercel”.
5. **When pages work but API doesn’t, suspect middleware or serverless config first** — Not Supabase outage.

---

## Issue 3 — Cross-subdomain session persistence (multi-app)

### Reported symptoms

- Users expected single sign-on between Organising DB and OA Planner subdomains
- Cross-origin session sharing **not tested** before integration (`OA_PLANNER_RESPONSES.md` §4)

### Diagnosis steps taken

1. Confirmed both apps used same Supabase URL and anon key.
2. Identified default `@supabase/ssr` behaviour: cookies scoped to **exact host**, not parent domain.
3. Documented requirement: both apps on `*.uconstruct.app`.

### Rectification steps applied

1. **`getCookieOptions()`** (`cookie-options.ts`):
   - Production: `domain: '.uconstruct.app'`, `path: '/'`, `sameSite: 'lax'`
   - `maxAge: 86400` aligned with Supabase JWT expiry (24h)
   - Localhost / Vercel preview: host-only cookies (no domain)

2. Applied to browser client, server client, and middleware Supabase clients.

3. **Monorepo consolidation** — OA Planner absorbed into `apps/organising-db` as `/campaigns/[id]/plan`, reducing cross-app cookie dependency (per `REPO_ORIENTATION_AND_SAFETY_GAPS.md`).

4. **Deep links** — `CROSS_APP_DEEP_LINKS.md` documents `return_to` query param + `sessionStorage` for cross-app navigation context.

### Transferable lessons

1. **Explicitly set `cookieOptions.domain`** for subdomain SSO with Supabase SSR.
2. **Match cookie `maxAge` to JWT expiry** — Browser dropping cookies early causes unnecessary re-auth.
3. **Prefer single Next.js app over cross-subdomain auth** when feasible — materially reduces session sync complexity.

---

## Issue 4 — RLS, permissions, and server client selection

### Reported symptoms

- Organisers seeing planning data for campaigns they should not access (RLS oversharing)
- Weekly cron snapshots failing or returning empty data
- Queries returning empty results in cron context despite data existing

### Diagnosis steps taken

1. **Security audit** (`SECURITY_AND_GAPS.md`, `PLATFORM_CONTEXT.md` §9):
   - `is_assigned_to_campaign()` joined agreements without constraining to campaign’s agreement
   - `/api/snapshots` GET used anon/session client → `auth.uid() = null` under RLS

2. **Product decision** (`REMEDIATION_PLAN_v2.md`):
   - Universal **read** access; restricted **write** with permission grants
   - Persistent edit permissions (not one-time)

3. **False-positive auth errors** — RLS violations return 403; must not treat all 403s as logout signals (`isLikelyAuthError` checks codes `PGRST301`, `INVALID_JWT`).

### Rectification steps applied

1. **Permission system migration** (`20260402035940_permission_system.sql`):
   - `campaign_edit_permissions`, `campaign_permission_requests`
   - `created_by` on campaigns
   - RLS helper functions for write checks

2. **Cron snapshot route** — Switched GET handler to `createAdminClient()` / service role (`snapshots/route.ts`; documented fix in checklist P1.4).

3. **Documented remaining RLS item** — `is_assigned_to_campaign()` constraint fix listed as high priority in security docs (simplified read model may have superseded strict need — verify against live migrations before applying elsewhere).

4. **Service role discipline** — Server-only; never in client bundles; used for cron, admin routes, audit writes.

### Transferable lessons

1. **Map every server entry point to a client type:**

   | Client | JWT context | RLS |
   |--------|-------------|-----|
   | Browser | User | Enforced |
   | Server (`createClient` + cookies) | User | Enforced |
   | Anon / no session | `null` | Often denies all |
   | Service role | Bypass | **Bypasses RLS** |

2. **Cron and webhooks have no user session** — Use service role + separate auth (`CRON_SECRET`, webhook signatures).

3. **403 ≠ 401** — RLS denials need different UX from auth expiry.

4. **RLS helper SQL deserves unit tests** — Join oversights grant broader access than intended.

---

## Issue 5 — Planner / wizard-specific auth deadlocks

### Reported symptoms

- Campaign planner wizard infinite loading
- “Create Plan” navigation broken
- Long-running planner queries hanging with no error

### Diagnosis steps taken

1. Traced to **`usePlannerCampaigns`** and **`planner-wizard.tsx`** holding Web Locks through async planner loads.
2. Identified held lock surviving `resetClient()` — only full document navigation clears it.

### Rectification steps applied

1. **Load timeout escape hatch** (commit `d5e8f10`) — planner query bounded; user can recover without restart.
2. **Web Lock deadlock fix** (commit `771f6f9`) — navigation and mutation patterns adjusted to release locks before long operations.
3. **`useAuthAwareMutation`** used for planner writes with preemptive refresh.

### Transferable lessons

1. Long async UI flows + Supabase auth locks = **deadlock risk** — audit lock hold duration across awaits.
2. **`resetClient()` does not release Web Locks** — document navigation may be required.

---

## Architecture lessons — the “two-lane” model

Documented in `SUPABASE_DROPOUT_INVESTIGATION.md` §E:

```
Lane 1:  React UI → createBrowserClient → *.supabase.co/rest/v1/...
Lane 2:  React UI → fetch('/api/...') → Route Handler → createServerClient → Supabase + Anthropic/Resend/...
```

**Why this matters on Vercel + Supabase:**

| Observation | Implication |
|-------------|-------------|
| Lane 1 healthy, Lane 2 broken | Problem is **not** Supabase platform-wide — inspect Vercel functions, middleware, server auth cookies |
| Re-login fixes Lane 2 only | **Session skew (H1)** — browser JWT/cookies out of sync with server `getUser()` |
| Pending `/api` fetch forever | **API hang (H2/H3)** — add server stage logs + client `fetchApi` timeout |
| Direct REST 401/403 | Auth or RLS — use Supabase dashboard auth logs |

**Middleware note:** API routes are **explicitly excluded** from Next.js middleware in this repo. Any historical API-only timeout attributed to middleware should be re-verified if the matcher changes.

---

## Observability checklist (implemented or specified)

From `SUPABASE_DROPOUT_INVESTIGATION.md` §G and connection-monitor work:

| Signal | Where |
|--------|-------|
| Client connection event log | `connection-monitor.ts` (in-memory + console) |
| Sentry breadcrumbs / warnings | Critical: `session_lost`, `lock_timeout`, `token_refresh_fail` |
| PostHog `supabase_connection_event` | Funnel / cohort analysis |
| `X-Request-Id` on `/api` calls | `fetch-api.ts` |
| Server stage markers (specified) | `auth_ok`, `db_fetch_ok`, `provider_start/end`, `response_sent` |
| Cookie diagnostics on tab focus | `cookie-diagnostics.ts` |
| Lock / fetch diagnostic shims | `diagnostics-shim.ts` |

**Recommended intake fields for any new project:** UTC timestamp, lane (1 vs 2), session age, tab background/sleep, pending Network row, deployment SHA, Vercel function logs filtered by `X-Request-Id`.

---

## Environment and deployment checklist

Compiled from `REPO_ORIENTATION_AND_SAFETY_GAPS.md` §9, `VERCEL_API_ROUTE_TIMEOUT_ISSUE.md`, and Turbo config:

### Required Vercel env vars (production)

| Variable | Role |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron, admin API, bypass RLS |
| `CRON_SECRET` | Authorize cron snapshot route |
| `ANTHROPIC_API_KEY` | AI API routes |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Email pipeline |
| `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` | Cookie domain detection |

### Monorepo / build

- Declare server secrets in **`turbo.json` → `build.env`**
- Avoid module-scope SDK initialization
- CI uses `supabase gen types` on migration push; local types lag until migration applied to hosted project

### DNS (custom domain + email)

- **CNAME and MX cannot coexist on same hostname** — use subdomain (e.g. `mail.oa.uconstruct.app`) for inbound email
- Document DNS state before/after third-party auto-setup (Resend removed CNAME during session)

---

## Recommended runbook for similar projects

When a user reports “disconnected” or hung UI:

1. **Identify lane** — Network tab: `supabase.co` vs same-origin `/api/`.
2. **Check console** — `[connection-monitor]` event types.
3. **Note session age and multi-tab** — Re-login fixing issue → session skew or refresh race.
4. **Check platforms** — [status.supabase.com](https://status.supabase.com), Vercel function logs, Sentry replay.
5. **Assign hypothesis** — H1–H6 from dropout investigation doc.
6. **Run reproduction matrix** — idle, background tab, sleep, multi-tab, lane contrast.
7. **Do not change code until classified** — Avoid fixing Supabase when the problem is middleware, or vice versa.

---

## Items documented but requiring verification on forked projects

These appear in planning/security docs as **identified** or **partially addressed**. This report does not assert current production state:

| Item | Source | Documented intended fix |
|------|--------|-------------------------|
| `is_assigned_to_campaign()` RLS oversharing | `SECURITY_AND_GAPS.md` | Constrain join to campaign’s agreement |
| Server stage logging on API routes | `SUPABASE_DROPOUT_INVESTIGATION.md` §G.1 | Structured logs with `requestId` |
| `/api/ping` smoke endpoint | `.cursor/plans/fix_api_timeout_on_vercel_4aa6d375.plan.md` | Zero-dependency health route |
| Rate limiting on API routes | `SECURITY_AND_GAPS.md` | Admin-configurable per user |
| Local Supabase for type generation | `campaigns-review-incidental-issues.md` | `gen:types:local` against `supabase start` |
| OA Planner cookie domain on second app | `OA_PLANNER_IMPLEMENTATION_CHECKLIST.md` P0.2 | May be moot after monorepo merge |

---

## Key code touchpoints (for cross-reference)

| Concern | File(s) |
|---------|---------|
| Browser Supabase client, refresh mutex, processLock | `apps/organising-db/src/lib/supabase/client.ts` |
| Cookie domain / maxAge | `apps/organising-db/src/lib/supabase/cookie-options.ts` |
| Middleware session refresh | `apps/organising-db/src/lib/supabase/middleware.ts`, `middleware.ts` |
| Recovery / logout / nuclear reset | `apps/organising-db/src/lib/supabase/session-recovery.ts` |
| Connection telemetry | `apps/organising-db/src/lib/supabase/connection-monitor.ts` |
| Visibility + heartbeat + query-cache auth recovery | `apps/organising-db/src/components/providers.tsx` |
| Pre-mutation session guard | `apps/organising-db/src/lib/hooks/useAuthAwareMutation.ts` |
| Bounded `/api` fetch | `apps/organising-db/src/lib/api/fetch-api.ts` |
| Cron admin client | `apps/organising-db/src/app/api/snapshots/route.ts` |
| Permission RLS migration | `supabase/migrations/20260402035940_permission_system.sql` |

---

## Git commits — auth / connection fix chronology

| Commit | Summary |
|--------|---------|
| `a9501da` | Initial connection fixes: health route, connection monitor, cookie options, provider refactor |
| `9f52246` | Resolve intermittent data access loss: autoRefresh off, fetch timeout, cookie cleanup, nuclear reset, diagnostics |
| `d5e8f10` | Planner load timeout escape hatch |
| `771f6f9` | Web Lock deadlock + Create Plan navigation |
| `96df114` | Expanded diagnostics shim |
| `4d2dcbe` | Supabase package updates |
| `4cca512` | Disconnect fixes: migrate client fetches to `fetchApi`, API route logging |
| `8aa3907` | **processLock** replaces navigator.locks; Sentry/PostHog connection events |
| `a64f520` | Stop force-logout on transient getSession timeout; 12s auth op budget |
| `634b415` / PR #8 | Merge auth op timeout branch |

---

## Summary — top 10 lessons for other Next.js + Vercel + Supabase projects

1. **Treat auth refresh as a distributed systems problem** — one mutex, many entry points.
2. **Disable `autoRefreshToken` when middleware also refreshes.**
3. **Evaluate `processLock` vs `navigatorLock` for multi-tab SPAs.**
4. **Exclude `/api/*` from session middleware; authenticate in handlers.**
5. **Timeout every fetch** — Supabase SDK, auth ops, and `/api` client calls.
6. **Never force-logout on auth op timeout** — wait for real 401 from data plane.
7. **Clear cookies in logout without relying on auth client.**
8. **Use service role only in trusted server contexts** — cron, webhooks with verification.
9. **Know your two lanes** — direct Supabase vs API routes fail independently on Vercel.
10. **Instrument early** — connection event log + request IDs + Sentry breadcrumbs pay off across intermittent reports.

---

## Document maintenance

When new incidents occur, append to the incident log template in `docs/SUPABASE_DROPOUT_INVESTIGATION.md` §F and update this report’s timeline table. Link DNS or routing changes to `docs/VERCEL_API_ROUTE_TIMEOUT_ISSUE.md`.

**Related operational runbook:** [SUPABASE_DROPOUT_INVESTIGATION.md](./SUPABASE_DROPOUT_INVESTIGATION.md)
