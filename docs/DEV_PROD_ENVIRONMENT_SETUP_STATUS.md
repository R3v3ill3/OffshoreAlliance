# Dev/Prod Environment Setup — Status Report

**Date:** 2026-06-03

---

## Goal

Establish a two-environment deployment workflow:

- **Production** — `main` git branch → Vercel production deployment → live Supabase database. Used for bug fixes and small UI/UX changes pushed directly.
- **Development** — `develop` git branch → Vercel preview deployment → isolated Supabase database. Used to test significant additions before shipping to production.
- Every change pushed to production is also merged into development to keep them in sync.
- Larger features are developed and tested in development, then merged to production in bulk.

---

## What Has Been Implemented

### Git

- `develop` branch exists on GitHub (`origin/develop`) and is synced with `main`.
- Both branches are at the same commit as of the end of this session.

### Codebase

- `package.json` (`gen:types` script) updated: hardcoded Supabase production project ref replaced with `${SUPABASE_PROJECT_REF:-gteygwfgjvczanmrwgbr}` to allow generating TypeScript types from either the dev or production Supabase project.
- Committed to `main` and merged into `develop`.

### Supabase

- **Supabase GitHub integration** connected to the GitHub repository (`R3v3ill3/OffshoreAlliance`). Working directory set to `.` (repo root).
- **Supabase `develop` branch** created manually through the Supabase UI. It is listed under the branch dropdown and shows a link to the correct GitHub project.
- **Supabase Vercel integration** connected: Supabase project `OffshoreAlliance` linked to Vercel project `offshore-alliance`. Production, Preview, and Development environment variable syncing are all enabled. A resync was performed after enabling Preview syncing.

### Vercel

- The existing Vercel project (`offshore-alliance`) is connected to GitHub.
- Production branch is `main`, mapped to `oa.uconstruct.app`.
- Preview environment covers all unassigned git branches, including `develop`. Vercel automatically deploys `develop` on every push. The preview deployment has a Vercel-generated URL.
- The three Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) were deleted from Vercel's manual environment variable store so the Supabase integration could own and manage them.

---

## Current Errors and Problems

### 1. Supabase `develop` branch — status: Unhealthy

The `develop` Supabase branch shows **status: Unhealthy** in the Supabase dashboard. Its workflow logs show:

```
Migrations: failed
2 pending
03 Jun 26 15:18:39
```

### 2. Supabase production (`main`) branch — migration failures

The production branch in the Supabase branching UI is showing migration failures that did not exist before this session. Two separate failure events today:

```
Migrations: failed
1 skipped
2 pending
03 Jun 26 15:02:57

Migrations: failed
1 skipped
2 pending
03 Jun 26 12:12:31
```

### 3. Vercel Preview deployment — 500 error

The Vercel preview deployment URL for the `develop` branch returns:

```
500: INTERNAL_SERVER_ERROR
Code: MIDDLEWARE_INVOCATION_FAILED
ID: syd1::jhmbx-1780466389278-f3f67bf974fb
```

### 4. Supabase credentials not injected into Vercel Preview

DevTools confirmed the preview deployment was connecting to the production Supabase project (`gteygwfgjvczanmrwgbr.supabase.co`) rather than the develop branch database. After the resync, `NEXT_PUBLIC_SUPABASE_URL` was found to be blank in the Vercel Preview environment. Attempts to manually set it via the Vercel UI were blocked; the Rotate option was identified as the mechanism to update it but had not been used at the time this session ended.

---

## Production Status

- Production app (`oa.uconstruct.app`) confirmed loading and returning data normally as of the end of this session.
- The migration failures shown in the Supabase branching UI do **not** appear to have affected the running production database.
