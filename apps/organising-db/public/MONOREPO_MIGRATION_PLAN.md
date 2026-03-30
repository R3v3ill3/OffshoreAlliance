# Offshore Alliance — Monorepo Migration Plan

**Option 2: pnpm monorepo, separate Vercel deployments**

This document is written for an agent performing the migration. It covers every file that must be created, moved, or modified — in the order that minimises risk. The two apps remain independently deployed throughout; nothing about the runtime behaviour of either app changes until Phase 3.

---

## Context and Current State

| | Organising DB | OAPlanner |
|---|---|---|
| Repo path | `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance` | `/Volumes/DataDrive/cursor_repos/offshoreAlliance/OAPlanning` |
| Deployed URL | `https://oa.uconstruct.app` | `https://oaplanner.uconstruct.app` |
| Next.js version | 16.1.6 | 14.2.35 |
| React version | 19.2.3 | 18 |
| Tailwind version | 4 | 3.4 |
| `database.ts` lines | 789 (stale — missing planning tables) | 3,937 (current — includes all tables) |
| Migration naming | Sequential: `00001_initial_schema.sql` | Timestamp: `20260330000001_planning_tables.sql` |
| `vercel.json` | None | Yes — weekly cron at `/api/snapshots` |
| Path alias | `@/*` → `./src/*` | `@/*` → `./src/*` |
| Supabase project | `gteygwfgjvczanmrwgbr` (shared) | `gteygwfgjvczanmrwgbr` (same) |

**Root problem this migration solves:** The `database.ts` type file is maintained independently in each repo. Every schema migration in either repo causes the other app's types to become stale. This has already caused real integration issues (documented in `OA_PLANNER_RESPONSES.md`). The monorepo extracts types into a single shared package generated once from the live database.

**What this migration does NOT do:**
- Merge the two apps into a single Next.js app (that is Option 3 — a larger undertaking)
- Change either app's runtime behaviour, URLs, or Vercel deployments
- Require upgrading OAPlanner to Next.js 16 (though that should happen eventually)

---

## Target Directory Structure

```
offshore-alliance/                       ← monorepo root (rename or new repo)
├── apps/
│   ├── organising-db/                   ← all contents of OffshoreAlliance repo
│   │   ├── src/
│   │   ├── supabase/                    ← app-specific migration refs only (see Phase 2)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── ...
│   └── oa-planner/                      ← all contents of OAPlanning repo
│       ├── src/
│       ├── vercel.json                  ← cron config (already exists here)
│       ├── package.json
│       ├── next.config.mjs
│       ├── tsconfig.json
│       └── ...
├── packages/
│   └── db-types/
│       ├── package.json
│       └── index.ts                     ← generated + re-exported database types
├── supabase/
│   └── migrations/                      ← all migrations from both repos, merged
│       ├── 0001_initial_schema.sql      ← was 00001_initial_schema.sql
│       ├── 0002_rls_policies.sql
│       ├── ...
│       ├── 0013_campaign_workflow.sql   ← was 00013_campaign_workflow.sql
│       ├── 0014_planning_tables.sql     ← was 20260330000001_planning_tables.sql
│       ├── 0015_planning_rls.sql        ← was 20260330000002_rls_policies.sql
│       └── 0016_planning_seed.sql       ← was 20260330000003_seed_data.sql
├── .github/
│   └── workflows/
│       └── gen-types.yml                ← regenerates db-types on migration PRs
├── pnpm-workspace.yaml
├── package.json                         ← root workspace (scripts + devDeps only)
├── turbo.json
└── .gitignore
```

---

## Phase 1 — Shared `db-types` Package

**This is the highest-value, lowest-risk phase. It can be done before the app directories are restructured.**

### 1.1 Create the package directory

Create `packages/db-types/` with the following two files.

**`packages/db-types/package.json`:**
```json
{
  "name": "@oa/db-types",
  "version": "0.0.1",
  "private": true,
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts"
  }
}
```

**`packages/db-types/index.ts`:**

This file is the output of `supabase gen types typescript` plus a re-export line at the top. On first creation, copy the contents of OAPlanning's `src/types/database.ts` (the 3,937-line version — it is the current one). The Organising DB's `src/types/database.ts` is stale and must NOT be used as the source.

```typescript
// AUTO-GENERATED — do not edit manually.
// Regenerate with: pnpm run gen:types (from monorepo root)
// Source: supabase gen types typescript --project-id gteygwfgjvczanmrwgbr

export type Json = ...
// (full generated content here)
```

### 1.2 Set up the workspace root

**`pnpm-workspace.yaml`** (monorepo root):
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`package.json`** (monorepo root):
```json
{
  "name": "offshore-alliance-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "gen:types": "supabase gen types typescript --project-id gteygwfgjvczanmrwgbr > packages/db-types/index.ts"
  },
  "devDependencies": {
    "turbo": "^2",
    "supabase": "^2"
  }
}
```

**`turbo.json`** (monorepo root):
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### 1.3 Add `@oa/db-types` as a dependency in each app

In `apps/organising-db/package.json`, add to `dependencies`:
```json
"@oa/db-types": "workspace:*"
```

In `apps/oa-planner/package.json`, add to `dependencies`:
```json
"@oa/db-types": "workspace:*"
```

### 1.4 Update imports in both apps

**Organising DB** — replace the local type file with the package:

The Organising DB currently imports types directly (e.g. `import type { Campaign } from "@/types/database"`). These all resolve to `src/types/database.ts`.

Two options:
- **(Recommended — minimal change):** Replace `src/types/database.ts` with a single re-export file that just re-exports from the package:
  ```typescript
  // src/types/database.ts — now a thin re-export; do not edit directly
  export * from "@oa/db-types";
  ```
  This means zero import path changes across the app.

- **(Full replacement):** Do a global find-and-replace of `from "@/types/database"` → `from "@oa/db-types"` across all source files. More surgical but more changes.

The re-export approach is strongly recommended for the migration — it is a one-line change per app and can be done before the directory restructure.

**OAPlanner** — same pattern:

Replace `src/types/database.ts` with:
```typescript
// src/types/database.ts — now a thin re-export; do not edit directly
export * from "@oa/db-types";
```

OAPlanner also has `src/types/index.ts` which defines app-specific types (`StageNumber`, `GateNumber`, `STAGE_NAMES`, etc.) that import from `database.ts`. Those imports become `from "@oa/db-types"` or from the local re-export — either works.

### 1.5 Verify

After the re-export file is in place and `pnpm install` is run from the root:
- `pnpm run build` from `apps/organising-db` should succeed
- `pnpm run build` from `apps/oa-planner` should succeed
- Both should be using the same type definitions

---

## Phase 2 — Unified Migrations

**This phase consolidates the `supabase/migrations/` directories. It is important for avoiding future conflicts but does not affect app code.**

### 2.1 Understand the migration history

**Organising DB migrations** (sequential naming, `OffshoreAlliance/supabase/migrations/`):
```
00001_initial_schema.sql
00002_rls_policies.sql
00003_seed_data.sql
00004_views.sql
00005_work_roles_hierarchy.sql
00006_principal_employers.sql
00007_eba_coverage_views.sql
00008_employer_wizard_rpc.sql
00009_fix_pe_assignments.sql
00010_organising_universe.sql
00011_organising_universe_seed.sql
00012_work_scopes.sql
00013_campaign_workflow.sql
```

**OAPlanner migrations** (timestamp naming, `OAPlanning/supabase/migrations/`):
```
20260330000001_planning_tables.sql
20260330000002_rls_policies.sql
20260330000003_seed_data.sql
```

### 2.2 Merged naming convention

Adopt a 4-digit sequential prefix with a descriptive suffix, continuing from where the Organising DB left off:

```
supabase/migrations/
├── 0001_initial_schema.sql             ← from 00001_initial_schema.sql
├── 0002_rls_policies.sql               ← from 00002_rls_policies.sql
├── 0003_seed_data.sql                  ← from 00003_seed_data.sql
├── 0004_views.sql
├── 0005_work_roles_hierarchy.sql
├── 0006_principal_employers.sql
├── 0007_eba_coverage_views.sql
├── 0008_employer_wizard_rpc.sql
├── 0009_fix_pe_assignments.sql
├── 0010_organising_universe.sql
├── 0011_organising_universe_seed.sql
├── 0012_work_scopes.sql
├── 0013_campaign_workflow.sql          ← from 00013_campaign_workflow.sql
├── 0014_planning_tables.sql            ← from 20260330000001_planning_tables.sql
├── 0015_planning_rls_policies.sql      ← from 20260330000002_rls_policies.sql
└── 0016_planning_seed_data.sql         ← from 20260330000003_seed_data.sql
```

### 2.3 Important note on applied migrations

**The Supabase migration system tracks applied migrations by filename in the `supabase_migrations.schema_migrations` table.** If the live database has already applied migrations under their old names, renaming them will cause `supabase db push` to attempt to re-apply them. To avoid this:

1. Do NOT run `supabase db push` after renaming. The live database is already correct.
2. The renamed files are for **source control organisation only** — new migrations going forward use the 4-digit format.
3. If you need to reset a local dev database from scratch, `supabase db reset` will apply all migrations in filename order, which is why consistent naming matters.

### 2.4 Future migrations

All new migration files created after the monorepo is established should follow the format:
```
0017_description_of_change.sql
```
Both apps' agents should create new migrations here, not in app-local directories.

---

## Phase 3 — App Directory Restructure

**This is the most disruptive phase. Do it in a single commit after Phases 1 and 2 are verified.**

### 3.1 Move the Organising DB app

From the monorepo root, move all contents of the `OffshoreAlliance` repo into `apps/organising-db/`:

```bash
mkdir -p apps/organising-db
# Move all app files (src, public, package.json, next.config.ts, tsconfig.json, etc.)
# Do NOT move: supabase/migrations (already unified in Phase 2), .git
```

Files that stay at the monorepo root: `.gitignore`, `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `supabase/`.

Files that move to `apps/organising-db/`: everything else from the Organising DB repo.

### 3.2 Move the OAPlanner app

From the monorepo root, move all contents of the `OAPlanning` repo into `apps/oa-planner/`:

```bash
mkdir -p apps/oa-planner
# Move all app files (src, public, package.json, next.config.mjs, tsconfig.json, vercel.json, etc.)
# Do NOT move: supabase/migrations (already unified in Phase 2), .git
```

OAPlanner's `vercel.json` (the cron config) stays in `apps/oa-planner/vercel.json`.

### 3.3 Update `tsconfig.json` path aliases

Both apps use `"@/*": ["./src/*"]` which is relative to the tsconfig file location. Since the tsconfig moves with the app into `apps/organising-db/tsconfig.json` and `apps/oa-planner/tsconfig.json`, the path alias does not need to change — it still resolves relative to the app directory. No imports need updating.

### 3.4 Update `next.config` if needed

Neither app currently has path rewrites or other config that references absolute filesystem paths, so no changes are needed. Verify by running `pnpm build` in each app directory.

---

## Phase 4 — Vercel Configuration

**Both Vercel projects continue to exist. Only the root directory setting changes.**

### 4.1 Organising DB Vercel project

In the Vercel dashboard for the Organising DB project:
- Go to **Settings → General → Root Directory**
- Change from `.` (repo root) to `apps/organising-db`
- Save and trigger a redeployment

Environment variables remain unchanged — they are per-project in Vercel, not per-directory.

### 4.2 OAPlanner Vercel project

In the Vercel dashboard for the OAPlanner project:
- Go to **Settings → General → Root Directory**
- Change from `.` (repo root) to `apps/oa-planner`
- Save and trigger a redeployment

The `apps/oa-planner/vercel.json` cron configuration will continue to work — Vercel reads `vercel.json` relative to the root directory.

### 4.3 Build command

Vercel's default build command (`next build`) works correctly when the root directory is set to an app directory. No custom build command is needed.

If you want Vercel to use Turborepo for the build (to take advantage of remote caching), set the build command to:
```
cd ../.. && pnpm turbo run build --filter=organising-db
```
(or `--filter=oa-planner` for the OAPlanner project). This is optional — standard `next build` works fine.

---

## Phase 5 — CI: Automated Type Regeneration

**This completes the setup by eliminating the manual type-drift problem.**

### 5.1 GitHub Actions workflow

Create `.github/workflows/gen-types.yml` at the monorepo root:

```yaml
name: Regenerate database types

on:
  push:
    paths:
      - "supabase/migrations/**"
  workflow_dispatch:

jobs:
  gen-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install Supabase CLI
        run: npm install -g supabase

      - name: Generate types
        run: |
          supabase gen types typescript \
            --project-id gteygwfgjvczanmrwgbr \
            > packages/db-types/index.ts
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Commit updated types
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: regenerate database types"
          file_pattern: "packages/db-types/index.ts"
```

### 5.2 Required secrets

Add to GitHub repository secrets:
- `SUPABASE_ACCESS_TOKEN` — your Supabase personal access token (from supabase.com/dashboard/account/tokens)

### 5.3 Manual regeneration

Any developer can also regenerate types locally at any time:
```bash
pnpm run gen:types
```
(Runs from monorepo root; requires Supabase CLI installed and logged in.)

---

## Recommended Execution Order

| Phase | Task | Risk | Time estimate |
|-------|------|------|---------------|
| 1.1–1.3 | Create `packages/db-types`, workspace root files | Zero — no app code changes | 30 min |
| 1.4 | Add re-export shim to both apps' `src/types/database.ts` | Very low — one-line change per app | 15 min |
| 1.5 | Verify builds pass in both apps | — | 15 min |
| 2.1–2.4 | Unify migrations into `supabase/migrations/` | Low — no DB changes | 20 min |
| 5.1–5.2 | Set up CI workflow | Zero — new file only | 20 min |
| 3.1–3.4 | Move app directories into `apps/` | Medium — large file move | 30 min |
| 4.1–4.2 | Update Vercel root directory settings | Low — one setting per project | 10 min |
| 4.3 | Trigger redeployments and verify | — | 15 min |

**Total estimated time: ~2.5 hours**

Phase 1 can be done immediately in the current two-repo structure as a preparatory step, before the monorepo itself exists. The `packages/db-types/` directory can live temporarily in either repo and be moved in Phase 3.

---

## Version Mismatch Note

OAPlanner runs Next.js **14.2.35** with React **18**. The Organising DB runs Next.js **16.1.6** with React **19**. This is **not a blocker** for the monorepo migration — each app maintains its own `package.json` and builds independently. Turborepo handles mixed-version apps natively.

However, the mismatch should be resolved eventually. The recommended upgrade path for OAPlanner:
1. Upgrade Next.js: `pnpm up next@latest` in `apps/oa-planner/`
2. Upgrade React: `pnpm up react@latest react-dom@latest` and `@types/react@latest @types/react-dom@latest`
3. Run the Next.js codemod: `npx @next/codemod@canary upgrade latest`
4. Resolve any breaking changes (async `cookies()`, `params` being a Promise in route handlers, etc.)

This upgrade is a separate task from the monorepo migration. Do not attempt both simultaneously.

---

## Known Naming Conflicts to Resolve

Both apps have files with the same name at the same relative path. In the monorepo structure these are in different `apps/` directories, so there is no actual conflict — but an agent should be aware they exist:

| Relative path | Organising DB | OAPlanner |
|---|---|---|
| `src/lib/supabase/client.ts` | Browser client | Browser client |
| `src/lib/supabase/server.ts` | Server client | Server client |
| `src/lib/supabase/middleware.ts` | Session middleware | Session middleware |
| `src/types/database.ts` | Stale (789 lines) → becomes re-export shim | Current (3,937 lines) → becomes re-export shim |
| `src/middleware.ts` | Auth guard | Auth guard |
| `src/app/layout.tsx` | Root layout | Root layout |

These files exist in separate `apps/` directories and do not conflict. They simply need to be maintained consistently — both Supabase client files, for example, should both have the `cookieOptions: { domain: '.uconstruct.app' }` setting that was added to the Organising DB in the integration work.

---

## Files Not to Consolidate

These files should remain separate per-app and should NOT be merged:

- `package.json` — each app has different deps (e.g. OAPlanner has `react-hook-form`; Organising DB has `leaflet`)
- `next.config.ts` / `next.config.mjs` — app-specific Next.js configuration
- `tailwind.config.ts` — OAPlanner uses Tailwind 3; Organising DB uses Tailwind 4 (different config format)
- `.env.local` — per-app environment variables (shared Supabase keys, but also app-specific vars)
- `vercel.json` — only OAPlanner has one (cron job); Organising DB may need one in future
- `src/components/` — each app has its own component library; do not merge
- `src/app/` — route trees are distinct; do not merge

---

*Document created: 2026-03-30. This plan covers Option 2 (monorepo with separate deployments). For the full app merge (Option 3), a separate plan is required after OAPlanner is upgraded to Next.js 16.*
