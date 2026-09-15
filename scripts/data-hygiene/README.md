Operator-run SQL for one-off production data hygiene. Each sub-folder has its own README with run order and rollbacks.
Nothing here is a migration: never copy these files under `supabase/migrations/` and never run them with `supabase db push`.

- `campaign-42-employer-mismatch/` — read-only report: campaign 42 members whose employer is not the campaign employer (OR-universe / wall-chart leak).
