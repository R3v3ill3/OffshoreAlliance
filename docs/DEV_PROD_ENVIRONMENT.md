# Dev / Prod Environment — Runbook

**Model:** two separate Supabase projects + explicit Vercel environment variables.
**No Supabase Branching** (it cannot replay this migration history from zero).

Last set up: 2026-06-03.

---

## Architecture

```
git: main     -> Vercel Production -> Supabase PROD (gteygwfgjvczanmrwgbr)  -> oa.uconstruct.app
git: develop  -> Vercel Preview    -> Supabase DEV  (dpnnmkhabysfdogllsyh)
```

| | Production | Development |
|---|---|---|
| Supabase project ref | `gteygwfgjvczanmrwgbr` | `dpnnmkhabysfdogllsyh` |
| Supabase URL | `https://gteygwfgjvczanmrwgbr.supabase.co` | `https://dpnnmkhabysfdogllsyh.supabase.co` |
| Region | ap-southeast-2 (Sydney) | ap-southeast-2 (Sydney) |
| Git branch | `main` | `develop` |
| Vercel target | Production | Preview |

The DEV database was seeded with a full copy of the PROD schema plus base/reference
data (employers, worksites, agreements, projects, workers, occupations, upcoming
projects, planning-framework lookups, comms templates, email imports) and the 11
auth logins. All campaign data was stripped: campaigns, campaign plans/tasks,
assessments, SOC sessions, call/email/phone activity, operational logs, and
personal OAuth tokens.

---

## Vercel environment variables

The app reads exactly three Supabase variables (`apps/organising-db/src/lib/supabase/*`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

- **Production** scope -> PROD credentials.
- **Preview** scope -> DEV credentials (set manually, all preview branches).

`NEXT_PUBLIC_*` is inlined at **build** time, so a preview must be **rebuilt**
(not just "redeployed from cache") to pick up changed values.

> The Supabase->Vercel integration manages the same three variable names for the
> Production/Development scopes. Keep its **Preview** syncing DISABLED, or it will
> overwrite the Preview values above with PROD credentials and break dev isolation.

---

## Migration workflow

The migration ledgers were rebased on 2026-09-08. DEV, PROD, and the repository
now share the same three canonical baseline versions:

- `20260908050000_baseline_schema.sql`
- `20260908050100_baseline_reference_data.sql`
- `20260908050200_baseline_platform_config.sql`

The files in `supabase/migrations_legacy/` are audit-only and must never be
replayed.

For every schema change:

1. Create exactly one new file under `supabase/migrations/` named
   `YYYYMMDDHHMMSS_snake_case_description.sql`. Do not create a different file
   or version for each environment.
2. Validate migration names and versions:
   ```bash
   pnpm validate:migrations
   ```
3. Link DEV, verify history alignment, dry-run, then apply:
   ```bash
   npx supabase link --project-ref dpnnmkhabysfdogllsyh
   env -u SUPABASE_DB_PASSWORD npx supabase migration list
   env -u SUPABASE_DB_PASSWORD npx supabase db push --dry-run
   env -u SUPABASE_DB_PASSWORD npx supabase db push
   ```
4. Test the DEV deployment and preview application.
5. Promote the same committed migration file through the normal
   `develop` -> `main` flow.
6. Link PROD, verify the same history, dry-run, then apply:
   ```bash
   npx supabase link --project-ref gteygwfgjvczanmrwgbr
   env -u SUPABASE_DB_PASSWORD npx supabase migration list
   env -u SUPABASE_DB_PASSWORD npx supabase db push --dry-run
   env -u SUPABASE_DB_PASSWORD npx supabase db push
   ```
7. Regenerate types from PROD:
   ```bash
   SUPABASE_PROJECT_REF=gteygwfgjvczanmrwgbr pnpm gen:types
   ```

Do not use independent `apply_migration` calls for normal deployments. They
generate environment-specific ledger versions and recreate the mismatch that
the baseline repaired. `supabase migration repair` is a recovery-only command;
take a fresh ledger backup before using it.

Generate TypeScript types from either project:
```bash
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types   # dev
SUPABASE_PROJECT_REF=gteygwfgjvczanmrwgbr pnpm gen:types   # prod (default)
```

---

## Re-seeding DEV later

The canonical migrations now replay successfully from an empty PostgreSQL 17
database and include deterministic reference data. Use them for a fresh DEV
schema. If DEV also needs a copy of selected PROD business data or auth users,
perform that as a separately reviewed data-clone operation; do not add those
rows or credentials to the migration baseline.

---

## One-time dashboard cleanup (no CLI/API available)

These could not be automated and should be done once in the dashboards:

1. **Supabase -> Project `gteygwfgjvczanmrwgbr` -> Branching:** turn the Branching
   feature OFF. (The broken `develop` branch has already been deleted.)
2. **Supabase -> Integrations / Vercel:** disable env-var **Preview** syncing (or
   disconnect the GitHub Branching integration entirely) so it cannot overwrite the
   manually-set Preview credentials.
