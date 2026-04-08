---
name: Fix API Timeout On Vercel
overview: Isolate why all `/api/*` routes time out on Vercel while page routes work, then apply minimal code/config changes to restore API responsiveness and Resend webhook delivery reliability.
todos:
  - id: exclude-api-from-middleware
    content: Update middleware matcher to stop intercepting /api routes
    status: pending
  - id: add-api-ping-smoke-test
    content: Add minimal /api/ping route for deployment/runtime verification
    status: pending
  - id: instrument-key-api-routes
    content: Add concise logs to webhook and templates handlers for timing and entry/exit visibility
    status: pending
  - id: bound-external-call-latency
    content: Add timeout/fail-fast behavior in webhook external operations
    status: pending
  - id: verify-domains-and-resend-flow
    content: Run URL and webhook validation checks and confirm end-to-end delivery
    status: pending
isProject: false
---

# Fix Vercel API Route Timeouts

## Working Hypothesis
The global middleware matcher in [`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/middleware.ts`](/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/middleware.ts) currently includes `/api/*`, and all reported failures are API-only timeouts. This points to request interception/runtime behavior before handlers, not route-specific business logic.

## Scope
- Validate middleware as the choke point for API requests.
- Restore reliable API responses on both custom and Vercel URLs.
- Confirm Resend webhook route can return fast and deterministically.

## Implementation Plan
1. Narrow middleware matcher to exclude `/api/*` and metadata/static paths.
   - Update [`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/middleware.ts`](/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/middleware.ts) matcher from broad catch-all to an exclusion pattern that skips `api`, `_next/static`, `_next/image`, and favicon/robots/sitemap.
   - Keep auth/session logic in API handlers (already present via `createClient()` in routes), so behavior remains correct.

2. Add a zero-dependency API smoke endpoint for platform verification.
   - Add `GET /api/ping` route under [`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api`](/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api) returning immediate JSON without Supabase/Resend calls.
   - Use this endpoint to distinguish platform routing/runtime issues from DB/provider latency.

3. Add lightweight request lifecycle logging for high-signal routes.
   - Add entry/exit/error logs in:
     - [`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api/email-import/webhook/route.ts`](/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api/email-import/webhook/route.ts)
     - [`/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api/templates/route.ts`](/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance/apps/organising-db/src/app/api/templates/route.ts)
   - Goal: confirm whether requests enter handlers and where elapsed time accumulates.

4. Ensure webhook path fails fast and avoids indefinite upstream waits.
   - Add explicit timeout handling around any external call (`resend.webhooks.verify`, `resend.emails.receiving.get`, Supabase writes where practical) so webhook always returns within bounded time.
   - Return clear non-2xx for retriable failures and log stable correlation fields (`svix-id`, `email_id`).

5. Validate end-to-end from both domains and from Resend.
   - Verify: `/api/ping`, `/api/templates` (expect 401/200, not timeout), `/api/email-import/webhook` (signature failure returns 400 quickly).
   - Re-run Resend inbound test to `templates@mail.oa.uconstruct.app` and confirm webhook delivery status becomes successful.

## Expected Outcome
- API routes return immediate HTTP responses instead of hanging.
- Resend webhook reaches Vercel endpoint and records/handles inbound emails reliably.
- Remaining failures (if any) become observable as explicit errors rather than silent timeouts.