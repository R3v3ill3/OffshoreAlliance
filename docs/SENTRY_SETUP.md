# Sentry Integration Setup

## Overview

Sentry error tracking has been integrated into both Organising DB and OA Planner applications.

## Environment Variables Required

Add the following environment variables to your Vercel projects:

### For both apps (Organising DB & OA Planner):

```env
# Sentry DSN (Data Source Name) - Get from Sentry dashboard
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Sentry Organization (optional, for source map uploads)
SENTRY_ORG=your-org-slug

# Sentry Project Name (optional, for source map uploads)
SENTRY_PROJECT=your-project-name
```

## Getting Your Sentry DSN

1. Log in to [Sentry.io](https://sentry.io)
2. Create a new project or select an existing one
3. Go to **Settings** → **Client Keys (DSN)**
4. Copy the DSN URL
5. Add it as `NEXT_PUBLIC_SENTRY_DSN` in your Vercel project settings

## Configuration Details

### Server-Side Error Tracking
- File: `sentry.server.config.ts` (shared root)
- Captures server-side errors, API route failures
- Includes performance monitoring traces

### Client-Side Error Tracking
- File: `sentry.client.config.ts` (shared root)
- Captures browser errors, component failures
- Includes session replay for debugging

### Error Filtering

Both configurations filter out:
- Expected authentication errors (login flows)
- Common browser extension errors
- Health check endpoint transactions

### Sampling Rates

**Development:**
- 100% of transactions traced
- 10% session replay

**Production:**
- 20% of transactions traced
- 10% session replay
- Adjust based on your Sentry plan quota

## Features Enabled

1. **Error Tracking** — All unhandled errors are captured
2. **Performance Monitoring** — API route tracing enabled
3. **Session Replay** — Browser session recordings for debugging
4. **Source Maps** — Uploaded automatically in production for better stack traces

## Viewing Errors

1. Go to your Sentry dashboard
2. Select the appropriate project
3. View **Issues** for error list
4. Use **Performance** tab for transaction traces
5. Use **Replays** tab for session recordings

## Testing Sentry

After deployment, you can test Sentry integration by:

1. Trigger an intentional error (e.g., throw new Error("Test Sentry"))
2. Check Sentry dashboard for the error
3. Verify that stack traces are readable (source maps working)

## Notes

- Source maps are automatically uploaded by Vercel during build
- Errors are tagged with environment (development/production)
- User information is attached when available (via auth context)
- Sensitive data (passwords, tokens) is automatically masked
