# DA0.5 — Vessel-tracking schema: scripts

Package: `docs/data-architecture/wp/da0.5.md`; specification in
`docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md` §5 row DA0.5 (line 383) and §6 D15 (line 456);
orchestration in `docs/data-architecture/ORCHESTRATION_PROMPT.md` line 179. Run-sheet style follows
`scripts/data-hygiene/oux-wp3.8/README.md`.

Operator-reviewed SQL artefacts. They are **not** migrations: never copy them under
`supabase/migrations/` and never run them with `supabase db push` (no `supabase` CLI command is run
from this checkout). Execute each only under explicit operator authorisation for the named
environment and exact step, one file per submission, output pasted before the next. Mutating files
start with `BEGIN;` and the WP2.1/2.2 environment guard: they refuse to run unless
`public._oux_env_marker` is a valid clone/dev singleton **or** `current_setting('oux.env', true) =
'production'` in the same transaction. Production has no marker; the operator adds
`SET LOCAL oux.env = 'production';` immediately after **every** `BEGIN;` in the same submission. The
committed files omit that line and name no project. Run as `postgres`, without RLS, never through
the connector's `apply_migration` on production.

## The thing being fixed

`supabase/migrations/20260922040000_mobilisation_radar.sql` (766 lines, merged to `main` at
`afc3eed8`) creates `vessels`, `geofences` and fourteen `mobilisation_*` tables. Those tables are
**live in production and hold data**, but production's `supabase_migrations.schema_migrations` has
no row for `20260922040000` (plan §1.11; `PROGRESS.md` D15 finding). The DDL has been proven
object-by-object against production's `pg_catalog` (`00_catalog_check.sql`; 377 objects compared,
0 differences), so the **schema is already right and only the ledger is untruthful**.

Production therefore takes the **ledger-row-only** shape: `10_record_ledger_row.sql` alone. The
migration file is **not** re-run there — it is not idempotent: its 27 `CREATE POLICY` statements
have no `IF NOT EXISTS` and no `OR REPLACE`, so a replay aborts with `42710` at the first of them.
(The 8 `CREATE TRIGGER` statements each follow a `DROP TRIGGER IF EXISTS` and *are* idempotent, as
are the `CREATE TABLE` and `CREATE INDEX` statements; `da0.5.md` §3.2 has the statement-by-statement
table.) No reconciling migration is needed, because nothing in production differs from the file.

The 12 September clone `offshore-alliance-wp21-rehearsal` has **none** of the sixteen tables, so
there the migration file itself is applied first, as its own submission, and `10` records the row
afterwards.

| File | Kind | Where it runs |
|---|---|---|
| `00_catalog_check.sql` | **read-only**, no guard, no `BEGIN`. Blocks A–J derive the sixteen tables' definition from `pg_catalog` (presence + RLS + comments, columns, constraints, indexes, policies, triggers, functions with `md5(pg_get_functiondef)`, grants, sequences, row counts); blocks K–N reconcile `vessels.owner_operator_id` and `mobilisation_watch_contractors.employer_id` / `aliases` against the employer register (names only, no PII); block O is the ledger state | production (agent read, or operator), the clone and dev — before and after every mutating step |
| `../../../supabase/migrations/20260922040000_mobilisation_radar.sql` | **migration** (not one of these scripts). Applied as a migration only where the sixteen tables are **absent** — the clone. One `BEGIN; … COMMIT;` submission | the clone (agent, under operator approval). **Never re-run on production** |
| `10_record_ledger_row.sql` | mutating, one statement of substance: `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260922040000','mobilisation_radar')`. Preconditions (all STOP): the row is absent, all 16 tables present, 27 policies, 8 triggers, `mobilisation_alert_audit()` present, baseline row present, `public._oux_hygiene_log` present. Logs one row to `public._oux_hygiene_log` (WP0.4 shape, `oux-wp0.4/00_create_hygiene_log.sql:31-42`) unconditionally. Post-assertions + an appended read-only `SELECT` after `COMMIT;` | production (operator) and the clone (agent, after the migration submission) |
| `90_remove_ledger_row.sql` | mutating rollback of `10`: preconditions are exactly the state `10` leaves (row present, `name = 'mobilisation_radar'`, no `statements` array, hygiene log present). Deletes the row and logs the **actual** deleted row as `before_row` via `DELETE … RETURNING`, stamps the `10` log rows `rolled_back_at`, asserts the sixteen tables are untouched | the clone (rehearsal: forward → `90` → forward again); production recovery only |

`10` and `90` change **no** table, column, constraint, index, policy, trigger, function, grant,
sequence or data row. The only thing either writes outside `_oux_hygiene_log` is the one ledger row.

## Run order

### 12 September clone `yqjkuobcawvigsfpgrcm` (rehearsal, agent, per-file operator approval)

The clone's ledger ends at `20260917100000` and it lacks `20260914090000`, `20260914090100`,
`20260918120000` and `20260921030000`. `20260922040000` depends on **none** of them: everything it
references outside its own sixteen tables — `public.employers`, `public.worksites`,
`public.sectors`, `auth.users`, `public.update_updated_at()`, `public.get_user_role()` (and
`public.user_profiles`, which `get_user_role` reads) — comes from
`20260908050000_baseline_schema.sql`, and all of it is present on the clone (checked read-only,
2026-09-22). So none of the four missing migrations is a prerequisite and none is applied here.

1. `00_catalog_check.sql` blocks A–J and O (before). Expect `tables_present = 0`,
   `ledger_max_version = '20260917100000'`, `ledger_rows = 12`; blocks A–F, H and I return no rows, block G shows only the two baseline functions `get_user_role` and `update_updated_at`, and block J errors with `42P01 relation "public.vessels" does not exist` because it counts rows in the sixteen tables that do not exist yet (expected before step 2).
2. The exact file `supabase/migrations/20260922040000_mobilisation_radar.sql`, unmodified, as one
   `BEGIN; … COMMIT;` submission **through the SQL editor or `execute_sql`** — **never** through the
   connector's `apply_migration`, which would itself write a `20260922040000` ledger row carrying
   `statements`, making step 3 STOP at its precondition (a) and step 5 refuse the row. The clone
   marker is present, so no `SET LOCAL oux.env` is added.
   Its seed rows (3 geofences, 14 watch contractors, 25 vessels, 25 watch vessels, 21 keywords,
   8 sources, 4 rules, 1 settings row) are reference data the module needs to work and are
   appropriate on the clone. Its three `UPDATE … SET employer_id / owner_operator_id` link
   statements resolve against the clone's own employer rows, and on this clone that yields
   **exactly the same links as production**: vessels 1–3 (`Castorone`, `Saipem Endeavour`,
   `Saipem Constellation`) → employer **726** `Saipem`; watch contractor 1 (`Saipem`) → **726**;
   watch contractor 14 (`Petrofac`) → **737** `Petrofac`; every other vessel and watch row NULL;
   **0** links into the synthetic set 787–794. Checked read-only 2026-09-22: 726 and 737 exist on
   the clone under the same ids and names, no other seed name matches an employer name or trading
   name, and none of 787–794 collides with a seed name (`da0.5.md` §3.4).
3. `10_record_ledger_row.sql` as its own submission. Expect the appended `SELECT` to show
   `ledger_row_present = t`, `ledger_name = 'mobilisation_radar'`, `ledger_rows = 13`,
   `tables_present = 16`, `policies = 27`, `triggers = 8`, `audit_function_present = t`,
   `log_rows_written = 1` (`ledger_max_version` is reported, not asserted: `20260922040000` today).
4. `00_catalog_check.sql` blocks A–J **and K–N** (after-forward-1). Blocks A–I must match the
   production output pasted in `da0.5.md` §9.1 object for object; block J differs only in the event
   tables (`mobilisation_signals`, `_alerts`, `_alert_signals` are 0 here, 19 / 18 / 18 on
   production); blocks K–N must reproduce production's reconciliation exactly (3 vessels linked,
   2 watch contractors linked, 0 mismatched, 0 synthetic, 4 alias strings missing).
5. `90_remove_ledger_row.sql`. Expect `ledger_row_present = f`, `tables_present = 16`,
   `log_rows_stamped = 1`, `rollback_log_rows = 1`.
6. `10_record_ledger_row.sql` again (after-forward-2) — the appended `SELECT` identical to step 3.

### Production `gteygwfgjvczanmrwgbr` (operator only)

Phase 0 run-sheet order is DA0.2 → **DA0.5** → DA0.3.

1. `00_catalog_check.sql` block O. Expect `tables_present = 16`, `ledger_row_present = f`,
   `ledger_max_version = '20260921030000'`, `ledger_rows = 16`.
2. `BEGIN; SET LOCAL oux.env = 'production'; <the body of 10_record_ledger_row.sql>; COMMIT;` plus
   its appended `SELECT`. Expect `ledger_row_present = t`, `ledger_name = 'mobilisation_radar'`,
   `ledger_rows = 17`, `tables_present = 16`, `policies = 27`, `triggers = 8`,
   `audit_function_present = t`, `log_rows_written = 1` (`ledger_max_version` is reported, not
   asserted: `20260922040000` today). Production already holds `public._oux_hygiene_log`
   (736 rows, WP0.4 shape, read-only check 2026-09-22), so the script's log precondition passes and
   its audit row is written there.
3. `00_catalog_check.sql` blocks A–J and K–N again; paste into `da0.5.md` §9 and §11.

The migration file is **not** submitted on production. If step 1 ever shows
`ledger_row_present = t`, stop: someone else recorded it, and `10` will refuse anyway.
