# One-time reconciliation scripts

Files in this directory record one-time, environment-specific recovery work.
They are not active migrations and must not be passed to `supabase db push`.

`20260908050300_dev_to_prod.sql` was rehearsed against an isolated DEV snapshot
and applied once to DEV before both ledgers were replaced by the canonical
baseline. PROD already contained those objects, so the script must never be
applied there.
