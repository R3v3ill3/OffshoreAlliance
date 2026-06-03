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

## Migration workflow (manual)

1. Add a new migration file under `supabase/migrations/`.
2. Apply to DEV and test on the develop preview:
   ```bash
   supabase link --project-ref dpnnmkhabysfdogllsyh
   supabase db push
   ```
3. Merge `develop` -> `main` (and keep prod fixes flowing back into `develop`).
4. Apply the same migrations to PROD:
   ```bash
   supabase link --project-ref gteygwfgjvczanmrwgbr
   supabase db push
   ```

Generate TypeScript types from either project:
```bash
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types   # dev
SUPABASE_PROJECT_REF=gteygwfgjvczanmrwgbr pnpm gen:types   # prod (default)
```

---

## Re-seeding DEV from PROD later

Re-run the clone (full schema + base data, campaign data stripped, logins copied):
the procedure is dump `--schema-only` + dump `--data-only` from prod, load into dev
with `session_replication_role = replica`, then truncate the campaign/activity/plan/
assessment/call/email-activity tables. Reset sequences afterward
(`setval` to `max(id)`), and restore framework rows that share a nullable
`campaign_id` (e.g. global `call_objections`, the 4 global `gate_definitions`,
`soc_stage_content`).

---

## One-time dashboard cleanup (no CLI/API available)

These could not be automated and should be done once in the dashboards:

1. **Supabase -> Project `gteygwfgjvczanmrwgbr` -> Branching:** turn the Branching
   feature OFF. (The broken `develop` branch has already been deleted.)
2. **Supabase -> Integrations / Vercel:** disable env-var **Preview** syncing (or
   disconnect the GitHub Branching integration entirely) so it cannot overwrite the
   manually-set Preview credentials.
