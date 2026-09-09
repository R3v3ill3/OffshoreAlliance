# WP1.6 operator scripts (Organiser UX review — auth and RLS alignment)

**Operator-run SQL. Not migrations.** Nothing in this folder goes under `supabase/migrations/` and nothing here is
ever run with `supabase db push`. Plan, reasoning and expected values: `docs/organiser-ux-review/wp/wp1.6.md`.

The migrations this folder accompanies are `supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql`
and `supabase/migrations/20260909130000_wp1_6_delete_campaign_standing_guard.sql` (fix round 1).

## Files

| File | What it does | Where |
|---|---|---|
| `00_preflight_organiser_write_access.sql` | **Read-only.** The wp1.6.md §6 pre-flight (R1): campaigns whose named `user`-role organiser would have no route to write access after WP1.6. One SELECT, no impersonation, no `SET ROLE`. Expected result: **zero rows**. | Any environment, production included. |
| `01_postflight_write_coverage.sql` | **Read-only.** The §6 post-flight: per-account roster and created-campaign counts, so the operator can see the shape of the change. No single expected value. | Any environment, production included. |
| `95_role_probes.sql` | Role-coverage probes for `user` (negative on a foreign campaign, positive on a campaign it creates, standing-campaign guard, self-escalation on its own profile, the organiser mint path), `viewer` (borrowed account, demoted for the transaction) and `service_role`. One transaction that **always rolls back**; nothing persists. Prints `PASS`/`FAIL`/`SKIP`/`NOTE` per probe and includes the §6 pre-flight query. | **DEV ONLY** (`dpnnmkhabysfdogllsyh`). Never production: it impersonates an account, demotes it and flips a campaign to standing inside the transaction. |
| `90_rollback_wp1_6_policies.sql` | Reverses **both** WP1.6 migrations: drops the 15 `wp16_*` policies, restores the 15 generation-1 policies verbatim from the baseline, restores `delete_campaign()` to its baseline body, drops `campaigns_i_can_write`, `link_organiser_for_profile` and the `user_profiles` guard trigger. Leaves `campaigns.created_by DEFAULT auth.uid()` in place (see the comment in the file). | Whichever environment needs the rollback; operator-run. |
| `91_rollback_standing_guard_only.sql` | Reverses only `20260909130000` (the standing-campaign guard): restores `delete_campaign()` to the `20260909120000` body, keeping the rest of WP1.6. | Whichever environment needs it; operator-run. |

## Production run sheet

All SQL below is run by the operator against production with `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f <file>`
(or pasted into the SQL editor; the two read-only files have no `psql`-only directives). `95_role_probes.sql`
is **DEV ONLY** and does not appear in this sheet.

1. **Pre-flight, before anything ships.** `00_preflight_organiser_write_access.sql` → **zero rows.** Any row is a
   campaign WP0.4 script 02 has not covered; stop and fix the roster first. (While WP0.4 script 01 is still held,
   `role = 'user'` will match few or no accounts — that is expected; the meaningful check is step 4.)
2. **Deploy WP1.6.** Merge the branch through the normal `develop → main` flow. The migrations
   (`20260909120000`, `20260909130000`) reach production with the operator's `supabase db push` against the
   production project ref, run after the app deploy is live (the app is safe against either order: controls hide
   rather than break while the RPC is absent — wp1.6.md §3.2).
3. **Post-flight.** `01_postflight_write_coverage.sql` — read the per-account roster and created-campaign counts;
   every organiser who should keep write access has a non-zero `campaigns_on_roster` or `campaigns_created`, or a
   lead/coordinator `work_role`.
4. **Pre-flight again.** `00_preflight_organiser_write_access.sql` → **zero rows**, immediately before step 5. This
   is the run that matters: it is evaluated against the accounts step 5 is about to convert.
5. **WP0.4 script 01.** `scripts/data-hygiene/oux-wp0.4/01_role_conversion.sql` (held until now — see that
   folder's README for its pre-check and rollback).
6. **Spot-check one converted account.** Have one organiser whose role step 5 changed sign out and back in (the
   auth context caches the role per session), open a campaign of their own, and delete an empty unit from the
   wall chart's Units popover. The delete must complete without an alert. If it fails, `01_rollback.sql` in the
   WP0.4 folder reverts the conversion; `90_rollback_wp1_6_policies.sql` here reverts the policies.

## Running the probes (dev only)

```bash
# discovery pass: prints the impersonated account, per-campaign writability and the pre-flight query
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v e2e_uid='<auth uid of the e2e user account>' \
  -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql

# full pass: pick a campaign whose `writable` is false and one of its ou_ids from the discovery output
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v e2e_uid='<auth uid>' \
  -v foreign_campaign_id=<id> -v foreign_ou_id=<ou id> \
  -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql
```

Expected output is `PASS` on every probe line **except the annotated lead/coordinator case** in section 3
(`user/link_organiser_for_profile(other)`), which prints `NOTE … allowed … by design` instead when the
impersonated account's `work_role` is lead/coordinator — the RPC lets leads link colleagues (decision 8), so
`not_authorized` is only expected for a plain organiser. `SKIP` lines name a precondition the database lacks
(no foreign campaign id supplied, no second organisers row, no standing campaign). Any `WARNING ... FAIL` is a
failed acceptance criterion; paste the whole output into wp1.6.md §12. The e2e account's auth uid comes from
`SELECT user_id FROM user_profiles WHERE display_name = '<the e2e account>'`; it is not a secret but is not
recorded in this repository either.

`psql` is required (the `\set`/`\if` directives and `SET LOCAL ROLE` do not work in the Supabase SQL editor,
which also cannot show the `NOTICE` lines).

## Running the rollback

Paste `90_rollback_wp1_6_policies.sql` as one submission (it is a single `BEGIN` … `COMMIT`), or
`psql "<connection string>" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql`.
If a statement fails the session is left in an aborted transaction: run `ROLLBACK;` before doing anything else.
Then revert the WP1.6 app commits if the rollback is expected to be long-lived (wp1.6.md §3.2).
To remove only the standing-campaign guard and keep everything else, use `91_rollback_standing_guard_only.sql`
the same way.
