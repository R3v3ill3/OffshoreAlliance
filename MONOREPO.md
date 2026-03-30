# Offshore Alliance Monorepo

pnpm + Turborepo monorepo containing both Offshore Alliance platforms, sharing a single Supabase database and generated type package.

## Structure

```
├── apps/
│   ├── organising-db/        Organising DB app (Next.js 16, React 19)
│   │                         Deployed to: oa.uconstruct.app
│   └── oa-planner/           OA Campaign Planner (Next.js 14, React 18)
│                             Deployed to: oaplanner.uconstruct.app
├── packages/
│   └── db-types/             Shared Supabase-generated TypeScript types (@oa/db-types)
├── supabase/
│   └── migrations/           Unified migrations (0001–0016) from both apps
├── .github/workflows/
│   └── gen-types.yml         CI: auto-regenerates db-types when migrations change
├── package.json              Monorepo root (turbo + supabase devDeps only)
├── pnpm-workspace.yaml       Workspace: apps/* + packages/*
└── turbo.json                Task config: build, dev, lint
```

## Quick Start

```bash
pnpm install                          # install all workspace deps
pnpm dev                              # run both apps via turbo
pnpm dev --filter organising-db       # run just Organising DB
pnpm dev --filter oa-planner          # run just OA Planner
pnpm build                            # build both apps
```

## Shared Types

Both apps depend on `@oa/db-types` (workspace package). Each app has a thin re-export at `src/types/database.ts` so existing import paths work unchanged.

To regenerate types from the live database:

```bash
pnpm gen:types
```

This runs `supabase gen types typescript` against project `gteygwfgjvczanmrwgbr` and writes the output to `packages/db-types/index.ts`. The CI workflow does this automatically when migration files change.

## Migrations

All migrations live in `supabase/migrations/` at the monorepo root. New migrations should follow the format:

```
0017_description_of_change.sql
```

## Vercel Deployment

Each app is a separate Vercel project pointing to this repo:

- **Organising DB** — Root Directory: `apps/organising-db`
- **OA Planner** — Root Directory: `apps/oa-planner`

Environment variables are configured per-project in Vercel. Both apps share the same Supabase project.
