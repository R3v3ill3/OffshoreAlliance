# @oa/scraper

Companion service that scrapes regulator-published "approved projects and activities"
data and writes it to Supabase for the main organising-db app to render.

Currently scrapes [NOPSEMA's listing](https://info.nopsema.gov.au/home/approved_projects_and_activities)
filtered to WA + NT regions (GS, MW, NW, PIL, SW + NT). The `SourceAdapter` interface
in `src/sources/types.ts` is designed to accept additional sources (e.g. the WA
state-government register) via new files in `src/sources/`.

## Local development

```bash
cp apps/scraper/.env.example apps/scraper/.env
# edit .env with your Supabase preview branch credentials
pnpm install
pnpm --filter @oa/scraper scrape:once    # one-shot run, prints results
pnpm --filter @oa/scraper dev            # HTTP server with auto-reload
```

POST a manual scrape:

```bash
curl -X POST http://localhost:8080/scrape \
  -H "x-scraper-secret: $SCRAPER_SHARED_SECRET" \
  -H "x-triggered-by: manual:test"
```

## How it works

1. `pipeline/run.ts` opens a row in `upcoming_projects_scrape_runs` for observability.
2. The active source adapter (`sources/nopsema.ts`) walks the listing pages, fetches
   each detail page with a polite delay, and yields `NormalisedUpcomingProject`
   records filtered to WA/NT only.
3. `pipeline/upsert.ts` upserts each record into `upcoming_projects` keyed by
   `(source, external_id)`. `last_seen_at` is bumped every run; `last_changed_at`
   only when a tracked field actually changes.
4. `pipeline/match.ts` runs each scraped `organisation` through
   `@oa/employer-matching::proposeEmployerMatch`, which returns an outcome of
   `auto` / `needs_review` / `unmatched` plus the top-3 candidate proposals
   (Principal Employers receive a +0.05 score boost). The result is persisted
   in `upcoming_project_employers`.
5. Records whose `match_status` is `confirmed`, `overridden`, or `rejected`
   are NOT overwritten on subsequent runs — admin decisions are sticky.
6. `pipeline/deactivate.ts` flips `is_active=false` on rows whose `external_id`
   is no longer present upstream.
7. The scrape_run row is closed with success/partial/failed plus counts.

## Deploying to Railway

1. Create a new Railway project and add a service from this repo.
2. Configure the service:
   - **Root Directory**: `/` (the repo root — the Dockerfile needs the
     workspace context to resolve `@oa/employer-matching` and the
     pnpm lockfile).
   - **Config-as-code path**: `apps/scraper/railway.toml` — Railway will
     pick up `dockerfilePath = apps/scraper/Dockerfile` from there.
   - **Watch Paths** *(optional but recommended)*: `apps/scraper/**`,
     `packages/employer-matching/**`, `pnpm-lock.yaml` — prevents
     Railway redeploying when unrelated repo files change.
3. Set the following service environment variables (from the dashboard,
   never committed):
   - `SUPABASE_URL` — production Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role key (server-only secret)
   - `SCRAPER_SHARED_SECRET` — long random string; must match the same
     value configured in Vercel for the organising-db app
   - `NOPSEMA_URL` *(optional)* — override the default listing URL
   - `SCRAPER_CONTACT_EMAIL` *(optional)* — included in the User-Agent
4. Add a **Cron Job** in Railway → Settings → Cron:
   - Command: `node dist/cron.js`
   - Schedule: `0 16 * * *` (16:00 UTC = 02:00 AEST)
5. Note Railway's public URL for the service and configure it in Vercel
   as `RAILWAY_SCRAPER_URL` (consumed by the admin refresh API route).

The HTTP server exposes:

- `GET /health` — Railway healthcheck.
- `POST /scrape` — protected by `x-scraper-secret`; returns 202 immediately
  and runs the scrape asynchronously.

## Adding a new source

1. Implement a new `SourceAdapter` in `src/sources/<name>.ts`.
2. Register it in `src/sources/index.ts`.
3. Apply a new migration that expands the `source` CHECK constraint on
   `upcoming_projects` to include the new identifier.
4. Optionally add a UI filter chip to `/upcoming-projects`.

No table redesign required.
