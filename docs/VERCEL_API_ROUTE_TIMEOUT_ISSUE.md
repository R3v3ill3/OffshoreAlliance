# Vercel API Route Timeout Issue

## Date
8 April 2026

## Problem
All Next.js API routes (`/api/*`) on the deployed Vercel application time out with no HTTP response. Page routes (`/login`, `/dashboard`, etc.) respond correctly and immediately. This affects both the custom domain (`oa.uconstruct.app`) and the Vercel-generated URL (`offshore-alliance-git-main-reveille-strategy.vercel.app`).

The issue blocks the Resend inbound email webhook from reaching the app, preventing the newly built email import pipeline from functioning.

## Application Context
- **Monorepo**: pnpm + Turborepo
- **App**: `apps/organising-db` — Next.js 16.1.6 with Turbopack
- **Hosting**: Vercel (project: OffshoreAlliance)
- **Database**: Supabase (project ID: `gteygwfgjvczanmrwgbr`)
- **Custom domain**: `oa.uconstruct.app` (DNS via GoDaddy, nameservers: `ns67.domaincontrol.com`)
- **Vercel project URL**: `offshore-alliance-git-main-reveille-strategy.vercel.app`

## What Was Being Built
An email import pipeline using Resend inbound email. The workflow:
1. User forwards an email to `templates@mail.oa.uconstruct.app`
2. Resend receives the email and fires an `email.received` webhook to `https://oa.uconstruct.app/api/email-import/webhook`
3. The webhook route verifies the Resend signature, fetches full email content via the Resend API, and stores it in a new `email_imports` Supabase table
4. AI analysis extracts campaign context; user reviews and imports as a template

## Files Created/Modified in This Session

### New files
- `supabase/migrations/20260410000000_email_imports.sql` — migration for `email_imports` table (applied to production Supabase)
- `apps/organising-db/src/app/api/email-import/webhook/route.ts` — Resend webhook handler
- `apps/organising-db/src/app/api/email-import/route.ts` — list imports endpoint
- `apps/organising-db/src/app/api/email-import/[id]/route.ts` — get/update import
- `apps/organising-db/src/app/api/email-import/[id]/analyse/route.ts` — AI analysis endpoint
- `apps/organising-db/src/app/api/email-import/[id]/import-template/route.ts` — import as template
- `apps/organising-db/src/lib/hooks/useEmailImports.ts` — React Query hooks
- `apps/organising-db/src/app/(dashboard)/email-imports/page.tsx` — UI page

### Modified files
- `apps/organising-db/package.json` — added `resend ^6.10.0`
- `apps/organising-db/src/components/layout/sidebar.tsx` — added Email Imports nav item
- `apps/organising-db/.env.example` — added `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `turbo.json` — added `env` array to `build` task for server-side env vars

## DNS Configuration History

### Original state
- `oa.uconstruct.app` had a CNAME record pointing to `cname.vercel-dns.com` — app worked

### Changes made during session
1. Registered `oa.uconstruct.app` as a domain in Resend for inbound email
2. Resend's automatic DNS setup may have removed the CNAME record
3. App stopped loading on custom domain; worked on Vercel URL
4. Re-added CNAME for `oa` → `cname.vercel-dns.com` — app restored
5. Discovered CNAME and MX records cannot coexist on the same hostname (DNS standard)
6. Switched from CNAME to A record: `oa` → `76.76.21.21` (Vercel anycast IP)
7. Added MX record for `oa` → Resend inbound SMTP — MX verification kept failing
8. Removed `oa.uconstruct.app` from Resend (free tier: one domain limit)
9. Created new Resend domain: `mail.oa.uconstruct.app`
10. Added DNS records in GoDaddy for `mail.oa`: MX, TXT (SPF), TXT (DKIM) — all verified in Resend
11. Resend receiving enabled and verified on `mail.oa.uconstruct.app`

### Current DNS state (verified via dig)
- `oa.uconstruct.app` A record → `76.76.21.21` (Vercel) — **working**
- `mail.oa.uconstruct.app` MX record → `inbound-smtp.ap-northeast-1.amazonaws.com` priority 10 — **verified in Resend**
- `send.mail.oa.uconstruct.app` TXT (SPF) — **verified**
- `resend._domainkey.mail.oa.uconstruct.app` TXT (DKIM) — **verified**

## Resend Configuration
- Domain: `mail.oa.uconstruct.app` (verified, receiving enabled)
- Webhook: configured to POST to `https://oa.uconstruct.app/api/email-import/webhook` on `email.received` events
- API key and webhook signing secret added to Vercel environment variables (`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`)
- Test email sent from `troy@reveille.net.au` to `templates@mail.oa.uconstruct.app` — Resend received the email and fired the webhook
- Webhook delivery status: "attempting" → "request timed out"

## Troubleshooting Conducted

### Build issues (resolved)
- Initial build failed: `Error: Missing API key. Pass it to the constructor new Resend("re_123")` — Resend client was instantiated at module level, running during Next.js page data collection at build time
- Fix: moved `new Resend()` into a `getResendClient()` factory function called inside the request handler
- Also added env vars to `turbo.json` `build.env` array to suppress Turbo warnings and ensure availability

### API route timeout testing
All tests performed after successful deployment (deployment ID: `dpl_8U4gexJ1uLdNYKkTYNWJLXVm581B`).

| URL | Method | Result |
|-----|--------|--------|
| `https://oa.uconstruct.app/login` | GET | 200 — instant |
| `https://oa.uconstruct.app/dashboard` | GET | 307 redirect to /login — instant |
| `https://oa.uconstruct.app/api/email-import` | GET | Timeout (no response) |
| `https://oa.uconstruct.app/api/email-import/webhook` | POST | Timeout (no response) |
| `https://oa.uconstruct.app/api/templates` | GET | Timeout (no response) |
| `https://oa.uconstruct.app/api/action-network?resource=tags` | GET | Timeout (no response) |
| `https://offshore-alliance-git-main-reveille-strategy.vercel.app/login` | GET | 200 — instant |
| `https://offshore-alliance-git-main-reveille-strategy.vercel.app/api/email-import` | GET | Timeout (no response) |

- User also confirmed `/api/email-import` times out when navigated to directly in Chrome and Safari
- TLS handshake succeeds (valid Let's Encrypt cert for `oa.uconstruct.app`), HTTP request is sent, but no response bytes are ever received
- The timeout affects ALL `/api/*` routes, including pre-existing ones (e.g., `/api/templates`, `/api/action-network`) — not just the new email import routes
- The app functions normally in the browser because client-side code queries Supabase directly (via `@supabase/ssr` client), not through Next.js API routes

### Vercel Deployment Protection
- Vercel Authentication was enabled under "Standard Protection" at the start of the session
- This was initially suspected as the cause because external requests (curl, webhooks) would be blocked by Vercel Auth
- User disabled Vercel Authentication in Vercel project settings
- Redeployed from Vercel dashboard (same commit, clean build)
- API routes still time out after disabling and redeploying
- Current state: Vercel Authentication is disabled

### Middleware analysis
The app's middleware (`src/middleware.ts` + `src/lib/supabase/middleware.ts`) runs on all routes per its matcher config. For `/api/*` routes, it creates a Supabase server client but skips the `getUser()` call and returns `NextResponse.next()` immediately. Page routes go through the same middleware and work correctly, so the middleware itself is unlikely to be the cause.

### Environment variables
- All Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) confirmed present in Vercel project settings, scoped to Production
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` confirmed present
- `ANTHROPIC_API_KEY` was missing from the base project (only set in the orphaned OA-Planner app) — added during session, but this only affects the AI analysis endpoint, not basic API route connectivity
- Supabase project (`gteygwfgjvczanmrwgbr.supabase.co`) confirmed reachable externally (returns 401 on unauthenticated REST call, as expected)

## Key Observations
1. The API route timeout is not specific to the new email import routes — it affects all `/api/*` routes
2. The timeout occurs on both the custom domain and the Vercel-generated URL
3. Page routes work correctly on both URLs
4. The app's in-browser functionality is unaffected because it uses direct Supabase client queries
5. It is unknown whether external API route access ever worked on this deployment, as Vercel Authentication was enabled before this session
