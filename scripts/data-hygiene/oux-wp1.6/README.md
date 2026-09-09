# WP1.6 operator scripts (Organiser UX review — auth and RLS alignment)

**Operator-run SQL. Not migrations.** Nothing in this folder goes under `supabase/migrations/` and nothing here is
ever run with `supabase db push`. Plan, reasoning and expected values: `docs/organiser-ux-review/wp/wp1.6.md`.

The migration this folder accompanies is `supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql`.

## Files

| File | What it does | Where |
|---|---|---|
| `95_role_probes.sql` | Role-coverage probes for `user` (negative on a foreign campaign, positive on a campaign it creates, self-escalation on its own profile), `viewer` (borrowed account, demoted for the transaction) and `service_role`. One transaction that **always rolls back**; nothing persists. Prints `PASS`/`FAIL` per probe and includes the §6 pre-flight query. | **DEV ONLY** (`dpnnmkhabysfdogllsyh`). Never production. |
| `90_rollback_wp1_6_policies.sql` | Reverses the migration: drops the 15 `wp16_*` policies, restores the 15 generation-1 policies verbatim from the baseline, restores `delete_campaign()` to its baseline body, drops `campaigns_i_can_write`, `link_organiser_for_profile` and the `user_profiles` guard trigger. Leaves `campaigns.created_by DEFAULT auth.uid()` in place (see the comment in the file). | Whichever environment needs the rollback; operator-run. |

## Running the probes

```bash
# discovery pass: prints the impersonated account, per-campaign writability and the pre-flight query
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v e2e_uid='<auth uid of the e2e user account>' \
  -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql

# full pass: pick a campaign whose `writable` is false and one of its ou_ids from the discovery output
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v e2e_uid='<auth uid>' \
  -v foreign_campaign_id=<id> -v foreign_ou_id=<ou id> \
  -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql
```

Expected output is `PASS` on every probe line. Any `WARNING ... FAIL` is a failed acceptance criterion; paste the
whole output into wp1.6.md §12. The e2e account's auth uid comes from
`SELECT user_id FROM user_profiles WHERE display_name = '<the e2e account>'`; it is not a secret but is not
recorded in this repository either.

`psql` is required (the `\set`/`\if` directives and `SET LOCAL ROLE` do not work in the Supabase SQL editor,
which also cannot show the `NOTICE` lines).

## Running the rollback

Paste `90_rollback_wp1_6_policies.sql` as one submission (it is a single `BEGIN` … `COMMIT`), or
`psql "<connection string>" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql`.
If a statement fails the session is left in an aborted transaction: run `ROLLBACK;` before doing anything else.
Then revert the WP1.6 app commits if the rollback is expected to be long-lived (wp1.6.md §3.2).
