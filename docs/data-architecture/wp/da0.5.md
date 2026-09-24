# DA0.5 — Vessel-tracking schema

Status: **planning** (plan written 2026-09-22, awaiting orchestrator approval).
Ledger row: `../PROGRESS.md`. Convention: `README.md` in this directory.
Scripts: `scripts/data-hygiene/da0.5/`.

---

## 1. Specification

### 1.1 The plan's §5 row, verbatim

`docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md:383`:

> | DA0.5 | Vessel-tracking schema (D15): derive the DDL of `vessels`, `geofences` and the fourteen `mobilisation_*` tables read-only from `pg_catalog` (never by linking the CLI to production); if no other migration ledger owns them, commit it as a migration that is idempotent where the objects exist, with a header naming the module as owner; if the module has its own repository and migrations, commit a `docs/data-architecture/external-schema.md` note instead and an existence guard for every later migration that references `vessels`; regenerate types from the clone; reconcile `mobilisation_watch_contractors.employer_id` and `vessels.owner_operator_id` against the employer register | migration or external-schema note | `pnpm validate:migrations` green; a fresh clone carries the 16 tables; every `owner_operator_id` and watch-contractor `employer_id` resolves to a canonical employer |

### 1.2 The orchestration paragraph, verbatim

`docs/data-architecture/ORCHESTRATION_PROMPT.md:179`:

> **DA0.5 Vessel-tracking schema.** Opus planner; Fable implementer; Fable reviewer. Derive the DDL of `vessels`, `geofences` and the fourteen `mobilisation_*` tables read-only from `pg_catalog` through the connector (never by linking the CLI to production). Then one of two shapes, decided by the D15 ownership answer: if no other migration ledger owns the tables, commit the DDL as a migration that is idempotent where the objects already exist, with a header naming the module as owner, rehearsed on the 12 September clone (which lacks them) and on the fresh clone (which has them); if the module has its own repository and migrations, commit `docs/data-architecture/external-schema.md` describing the tables and their owner, and add an existence guard to every later migration that references `vessels` (DA1.2, DA2.2). Either way regenerate types from a clone that carries the tables and reconcile `vessels.owner_operator_id` and `mobilisation_watch_contractors.employer_id` against the employer register in the ledger's incidental findings. Blocked only by the D15 question; default to the external shape if it is unanswered when DA0.2 and DA0.3 are on production.

### 1.3 Sections this package depends on

- `OA_UNIVERSE_ALIGNMENT_PLAN.md` §1.11 (lines 195–203): the sixteen tables, the fourth alias store, the
  ledger-governance consequence.
- `OA_UNIVERSE_ALIGNMENT_PLAN.md` §6 D15 (line 456) and D17 (line 458).
- `ORCHESTRATION_PROMPT.md` lines 32–45 (non-negotiable rules), 100–110 (operator run sheets),
  243 (Phase 0 run-sheet order: DA0.2, DA0.5, DA0.3).
- `../PROGRESS.md`: standing notes, the D15 finding, the two incidental findings.

### 1.4 Decisions consumed, and what the repository answers

**D15**, `OA_UNIVERSE_ALIGNMENT_PLAN.md:456`, verbatim:

> | D15 | Sixteen vessel-tracking tables exist in production outside this repository's migration ledger (§1.11). Who owns their schema, and how does this repository reference them? | If no other ledger owns them, capture their DDL here (derived read-only) with a header naming the module as owner; if the module has its own repository and migrations, record them as external and guard every migration that references `vessels` with an existence check; either way link `worksites.vessel_id` and fold the watch-contractor aliases into `employer_name_aliases` | DA0.5, DA1.2 | **Decided (operator, 22 Sep):** the module stays a separate development piece (alerts on vessels heading towards fields during the construction and decommissioning lead time). **One question remains:** does the module have its own repository with migrations? Default if unanswered: treat as external with guards. |

D15's remaining question is answered by **this** repository, not by an external one. The module was merged
to `main` at `afc3eed8` ("Add a mobilisation radar for North-West Australia vessel early warning",
22 Sep 02:28 UTC) with `supabase/migrations/20260922040000_mobilisation_radar.sql` (766 lines), app code
under `apps/organising-db/src/lib/mobilisation/`, and all sixteen tables already in
`packages/db-types/generated.ts`. DA0.5 therefore takes the **in-repository** shape of the §5 row, not the
`external-schema.md` shape, and no existence guard is required on later migrations that reference
`vessels` (DA1.2, DA2.2) because this ledger owns the table. **The operator still confirms** that no other
checkout applied a different version of the DDL (§5, operator input O-1).

Because the migration file already exists and is applied, this package commits **no new migration**
(see §3.2 for why, and §3.1 for the proof that none is needed). Never edit `20260922040000`.

D17 fixes the rehearsal target: the 12 September clone `yqjkuobcawvigsfpgrcm`, which lacks the sixteen
tables — the right conditions for DA0.5's forward apply.

---

## 2. Files

### 2.1 Existing files this package reads and cites (no change)

| Path | What it is |
|---|---|
| `supabase/migrations/20260922040000_mobilisation_radar.sql` | The migration under proof. 766 lines, applied to production outside the ledger. **Never edited** (`ORCHESTRATION_PROMPT.md:42`). |
| `supabase/migrations/20260908050000_baseline_schema.sql` | Creates `employers`, `worksites`, `sectors`, `user_profiles`, `public.update_updated_at()` and `public.get_user_role()` — every object `20260922040000` references outside its own sixteen tables. |
| `packages/db-types/generated.ts` | Already carries all sixteen tables (§4.2). |
| `scripts/data-hygiene/oux-wp3.8/README.md` | Run-sheet style precedent. |
| `scripts/data-hygiene/oux-wp0.4/00_create_hygiene_log.sql:31-42` | `public._oux_hygiene_log` shape (columns and the `action` CHECK). |
| `scripts/validate-supabase-migrations.mjs` | What `pnpm validate:migrations` actually checks (§4.1). |
| `docs/data-architecture/worksheets/employers_adjudication_2026-09-22.csv` | Rows 120, 135, 155 bear on §4.3. |

### 2.2 New files (this package)

| Path | Kind |
|---|---|
| `docs/data-architecture/wp/da0.5.md` | this plan |
| `scripts/data-hygiene/da0.5/README.md` | run-sheet index and run order |
| `scripts/data-hygiene/da0.5/00_catalog_check.sql` | read-only; blocks A–J (catalog) and K–N (reconciliation), block O (ledger) |
| `scripts/data-hygiene/da0.5/10_record_ledger_row.sql` | mutating; production and clone |
| `scripts/data-hygiene/da0.5/90_remove_ledger_row.sql` | rollback of `10` |

### 2.3 Files this package does **not** create

- **No new migration.** §3.1 found no difference between the file and production, so a
  `2026092210xxxx_mobilisation_radar_reconcile.sql` would have nothing to reconcile.
- **No `docs/data-architecture/external-schema.md`.** The D15 question is answered by this repository
  (§1.4), so the external shape does not apply.
- **No type regeneration.** `packages/db-types/generated.ts` already carries all sixteen tables (§4.2).

---

## 3. Scripts and the evidence behind them

### 3.1 DDL proof: the file against production's `pg_catalog`

Read-only, through the connector, production `gteygwfgjvczanmrwgbr`, 2026-09-22. The queries are
`scripts/data-hygiene/da0.5/00_catalog_check.sql` blocks A–J; the raw output is pasted in §9.

**Result: 377 objects compared, 0 differ.** Every object the file creates exists in production with an
identical definition, and production holds no object of these sixteen tables that the file does not create.

| Object class | In file | In production | Identical | Difference | Evidence (block) |
|---|---|---|---|---|---|
| Tables (`public`) | 16 | 16 | 16 | none | A |
| Columns (name, ordinal, type, NOT NULL, default, identity) | 171 | 171 | 171 | none | B |
| — of which `GENERATED BY DEFAULT AS IDENTITY` | 12 | 12 | 12 | none | B (`attidentity = 'd'`) |
| PRIMARY KEY constraints | 16 | 16 | 16 | none | C |
| UNIQUE constraints | 13 | 13 | 13 | none | C |
| CHECK constraints (expression compared via `pg_get_constraintdef`) | 20 | 20 | 20 | none | C |
| FOREIGN KEY constraints (incl. `ON DELETE`) | 23 | 23 | 23 | none | C |
| Indexes (`pg_indexes`) | 33 | 33 | 33 | none | D |
| — explicit `CREATE INDEX IF NOT EXISTS` on `mobilisation_signals` | 4 | 4 | 4 | none | D |
| — backing a PK or UNIQUE constraint | 29 | 29 | 29 | none | D |
| RLS enabled flag | 16 | 16 (all `t`, none forced) | 16 | none | A |
| RLS policies (`pg_policies`: name, role, cmd, `USING`, `WITH CHECK`) | 27 | 27 | 27 | none | E |
| Triggers (`pg_get_triggerdef`) | 8 | 8 | 8 | none | F |
| Functions created by the file | 1 (`mobilisation_alert_audit()`) | 1 | 1 (`md5(pg_get_functiondef)` = `764235c6343f9cc8189502ba271571e5`, body byte-identical to lines 354–378) | none | G |
| `COMMENT ON TABLE` | 5 | 5 | 5 | none | A |
| Identity sequences + `USAGE, SELECT` to `authenticated`, `service_role` | 12 | 12 | 12 | none | I |
| Per-table grant sets (`anon` revoked; `authenticated` / `service_role` granted) | 16 | 16 | 16 | none (see note) | H |
| **Total** | **377** | **377** | **377** | **0** | |

Views: the file creates none (`grep -n 'CREATE .*VIEW' supabase/migrations/20260922040000_mobilisation_radar.sql`
returns nothing), and production has no view over these tables.

**Grants note (not a divergence).** Block H shows `anon` with **no** grant on any of the sixteen —
exactly what the file's `REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon` produces — but
`authenticated` and `service_role` each with the full privilege set on **all** sixteen, which is wider
than the file's explicit per-table `GRANT SELECT` / `GRANT UPDATE` lines. That is what the file produces
on a Supabase project: `pg_default_acl` for schema `public` grants `arwdDxtm` on new tables to `postgres`,
`anon`, `authenticated` and `service_role` at `CREATE TABLE` time, and the file revokes only from `PUBLIC`
and `anon`. The explicit `GRANT`s are a floor, not a ceiling; **RLS is what actually gates
`authenticated`**, and the 27 policies are present and identical. The same holds for the sequences: `anon`
shows `USAGE` from the default ACL although the file grants only to `authenticated` and `service_role`.
This is a property of the baseline, already noted at `oux-wp0.4/00_create_hygiene_log.sql:50-53`; it is
recorded here as an observation, not a DA0.5 change, and it is the same on any database the file is
applied to.

**Conclusion.** The committed file reproduces production's schema exactly. **No reconciling migration is
needed**, and none is written. If a future run of `00_catalog_check.sql` ever shows a difference, the
remedy is a **new** file `2026092210xxxx_mobilisation_radar_reconcile.sql` that brings the ledger's claim
in line with production — never an edit of `20260922040000`.

### 3.2 Idempotency analysis: what a re-run of the file on production would do

Production already holds every object. Statement by statement:

| Lines | Statements | Re-run on production |
|---|---|---|
| 10–349 | 16 × `CREATE TABLE IF NOT EXISTS` | **no-op** |
| 48, 67, 193, 268, 335 | 5 × `COMMENT ON TABLE` | **no-op** (same text re-set) |
| 196–203 | 4 × `CREATE INDEX IF NOT EXISTS` | **no-op** |
| 351 | `INSERT INTO mobilisation_settings (id) VALUES (1) ON CONFLICT DO NOTHING` | **no-op** |
| 354–378 | `CREATE OR REPLACE FUNCTION mobilisation_alert_audit()` | **no-op** (replaced with the identical body) |
| 380–405 | 8 × `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` | **no-op** (the `DROP IF EXISTS` makes each `CREATE` safe, atomically inside the transaction) |
| 408–504 | 6 seed `INSERT … ON CONFLICT … DO NOTHING` (geofences, watch contractors, vessels, watch keywords) | **no error**, but `INSERT INTO mobilisation_watch_vessels SELECT vessel_id FROM vessels ON CONFLICT DO NOTHING` (477–479) would **re-watch any vessel an organiser had deliberately taken off the watch list** — a silent data change |
| 508–530 | 3 × `UPDATE … SET employer_id` / `owner_operator_id … WHERE … IS NULL` | **no error**, but would **re-link any row whose employer link had been deliberately cleared** — a silent data change |
| 532–592 | 2 seed `INSERT … ON CONFLICT DO NOTHING` (sources, rules) | **no-op** |
| 598–613 | 16 × `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | **no-op** |
| 615–643 | the `REVOKE`/`GRANT` `DO` block and 11 explicit `GRANT`s | **no-op** |
| **645–735** | **27 × `CREATE POLICY`** — no `IF NOT EXISTS`, no `OR REPLACE` | **ERROR `42710`: policy "mobilisation read vessels" for table "vessels" already exists.** The first one aborts the transaction and every later statement with it |
| 737–766 | the sequence-grant `DO` block | never reached |

**Conclusion: the file cannot be re-run on production as-is.** It fails at line 645, and two of the
statements it would reach before that are silent data changes rather than no-ops. The plan's §5 row asks
for a migration "that is idempotent where the objects exist"; because the file already exists, is
applied and may not be edited, that requirement is met the other way round — **the production run sheet
is ledger-row-only**: insert the `20260922040000 mobilisation_radar` row so that `supabase db push`,
`supabase migration list` and `pnpm validate:migrations`-style checks agree with what production
actually holds, and never replay the statements.

### 3.3 `10_record_ledger_row.sql` — production and clone

Recommendation, and the whole of the production change.

- **Environment guard.** The WP2.1/2.2 guard (`scripts/data-hygiene/oux-wp3.8/10_campaign64_family.sql:30-47`):
  the file refuses unless `public._oux_env_marker` is a valid `clone`/`dev` singleton **or**
  `current_setting('oux.env', true) = 'production'` in the same transaction. Production has no marker; the
  operator inserts `SET LOCAL oux.env = 'production';` immediately after `BEGIN;` in the same submission.
  The committed file omits that line and names no project.
- **Preflight (counts and checksums).** (a) `supabase_migrations.schema_migrations` has **no** row for
  `20260922040000` — a second run stops here; (b) all **16** tables present, and the exception names the
  missing ones; (c) **27** policies, **8** triggers and `public.mobilisation_alert_audit()` present — the
  row is only truthful if the whole migration is applied, not just the tables; (d) the baseline row
  `20260908050000` is in the ledger — a sanity check that this is the right kind of database (the clone
  legitimately lacks four later versions, so no "no gap" claim is made); (e) `public._oux_hygiene_log` is
  present (the WP0.4 audit table), otherwise the script STOPs.
- **The change.** One statement:

  ```sql
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260922040000', 'mobilisation_radar');
  ```

  the same `(version, name)` shape the WP3.8 run sheet used for `20260917100000` (which is the one ledger
  row on production with `statements IS NULL`, §9). `statements` is left NULL deliberately: the statements
  are not being replayed.
- **Hygiene-log rows.** `public._oux_hygiene_log` **already exists on production** — 736 rows in the
  WP0.4 shape (`log_id, script, action, table_name, row_pk, before_row, after_row, note, logged_at,
  rolled_back_at`, `action` CHECK `update|insert|delete`), read-only check 2026-09-22 — and on the clone
  (`PROGRESS.md` standing notes). Its presence is therefore precondition **(e)**, a **STOP**, following
  `oux-wp3.8/10_campaign64_family.sql:68-69` and the rule that every mutating step logs what it changed
  (`ORCHESTRATION_PROMPT.md:106`). The script writes exactly one row **unconditionally**: `script =
  '10_record_ledger_row'`, `action = 'insert'`, `table_name = 'supabase_migrations.schema_migrations'`,
  `row_pk = {"version":"20260922040000"}`, `before_row = NULL`, `after_row = {version, name}`, `note`.
- **Post-assertions.** Exactly one row for `20260922040000`, and it is the `(version, name)` row this
  script writes (`name = 'mobilisation_radar'`, no `statements`). There is deliberately **no** assertion
  that `20260922040000` is the newest ledger version: a migration stamped later that reached the database
  first would abort an otherwise correct run. `ledger_max_version` is reported by the verification
  `SELECT`, not asserted.
- **Appended verification `SELECT`** (after `COMMIT;`): `ledger_row_present`, `ledger_name`,
  `ledger_max_version`, `ledger_rows`, `tables_present`, `policies`, `triggers`,
  `audit_function_present`, `log_rows_written`. Production expectation: `t`, `mobilisation_radar`,
  `20260922040000` (reported only), `17`, `16`, `27`, `8`, `t`, `1`.
- **Scope.** No table, column, constraint, index, policy, trigger, function, grant, sequence or business
  data row is created, altered or deleted.

### 3.4 Clone rehearsal design

Target: the 12 September clone `yqjkuobcawvigsfpgrcm` (D17). It has **none** of the sixteen tables; its
ledger ends at `20260917100000` with 12 rows.

**Prerequisite set: empty.** `20260922040000` references, outside its own sixteen tables:
`public.employers`, `public.worksites`, `public.sectors`, `auth.users`, `public.update_updated_at()` and
`public.get_user_role()` (which reads `public.user_profiles`). All six come from
`20260908050000_baseline_schema.sql`, and a read-only check on the clone (2026-09-22, §9) returns
`present = true` for every one. **None** of the four migrations the clone lacks — `20260914090000`,
`20260914090100`, `20260918120000`, `20260921030000` — is a prerequisite, and none is applied under this
package's run sheet. (That is DA0.3's problem, per the ledger's second incidental finding, not DA0.5's.)

**Seed rows on the clone: appropriate.** The file seeds 3 geofences, 14 watch contractors, 25 vessels,
25 watch vessels, 21 keywords, 8 sources, 4 rules and the singleton settings row. These are reference
data the module needs to function (the geofence rings mirror
`apps/organising-db/src/lib/mobilisation/geofences.ts`), not synthetic test data, and they are the same
rows production holds. They carry no personal data. They belong on the clone.

**Employer links on the clone will be identical to production's.** The file's three
`UPDATE … WHERE employer_id IS NULL` statements resolve `canonical_name` / `owner_name` against whatever
employer rows the target database holds, so in principle they could differ. On this clone they do not.
Checked read-only 2026-09-22: of the fourteen seeded contractor names, only `Saipem` and `Petrofac`
match an employer name or trading name, and they match the **same ids and names as production** —
`726 Saipem` (active) and `737 Petrofac` (active). None of the synthetic rows 787–794
(`TestCo Energy`, `TestCo 2` and the six same-day contractors) carries a name that collides with a seed
name. Expected on the clone after step 2, identical to production's §4.3 table:

| Row | Expected link |
|---|---|
| vessels 1–3 (`Castorone`, `Saipem Endeavour`, `Saipem Constellation`) | `owner_operator_id = 726` |
| vessels 4–25 | `owner_operator_id IS NULL` |
| watch contractor 1 (`Saipem`) | `employer_id = 726` |
| watch contractor 14 (`Petrofac`) | `employer_id = 737` |
| watch contractors 2–13 | `employer_id IS NULL` |
| links into 787–794 | **0** |

So blocks K–N of `00_catalog_check.sql` must reproduce production's reconciliation numbers exactly on
the clone (3 vessels linked, 2 contractors linked, 0 mismatched, 0 synthetic, 4 alias strings missing),
and any divergence is a finding, not noise.

**Run order on the clone** (agent, one file per submission, operator approval per file; the clone's
`_oux_env_marker` satisfies the guard, so no `SET LOCAL oux.env` is added):

1. `00_catalog_check.sql` blocks A–J and O — before. Expect blocks A–J empty, `tables_present = 0`,
   `ledger_max_version = '20260917100000'`, `ledger_rows = 12`.
2. The exact file `supabase/migrations/20260922040000_mobilisation_radar.sql`, unmodified, as **one**
   `BEGIN; … COMMIT;` submission through the SQL editor or `execute_sql`. **Never through the
   connector's `apply_migration`**: that would itself write a `20260922040000` ledger row carrying
   `statements`, which makes step 3 STOP at precondition (a) and step 5 refuse the row as not being
   `10`'s post-state. The connector's `apply_migration` is barred on production outright
   (`ORCHESTRATION_PROMPT.md:34`); this is the separate, mechanical reason it is barred here too.
3. `10_record_ledger_row.sql` — appended `SELECT` shows `ledger_row_present = t`,
   `ledger_name = 'mobilisation_radar'`, `ledger_rows = 13`, `tables_present = 16`, `policies = 27`,
   `triggers = 8`, `audit_function_present = t`, `log_rows_written = 1`
   (`ledger_max_version` reported, not asserted: `20260922040000` today).
4. `00_catalog_check.sql` blocks A–J **and K–N** — after-forward-1. Blocks A–I must equal the production
   output in §9.1 object for object; block J differs **only** in the event tables
   (`mobilisation_signals`, `_alerts`, `_alert_signals`: 0 on the clone, 19 / 18 / 18 on production);
   blocks K–N must reproduce §4.3's numbers exactly, per the table above.
5. `90_remove_ledger_row.sql` — `ledger_row_present = f`, `tables_present = 16`,
   `log_rows_stamped = 1`, `rollback_log_rows = 1`.
6. `10_record_ledger_row.sql` again — after-forward-2, appended `SELECT` identical to step 3.

The forward → rollback → forward rehearsal exercises `90`'s precondition (the row present) exactly as
`10` leaves it. The migration submission itself is **not** rolled back: dropping sixteen tables and their
seed data on the clone would buy nothing that re-creating the clone (D17) does not, and `90`'s job is to
reverse `10`, not the migration.

### 3.5 `90_remove_ledger_row.sql` — rollback

- Same environment guard.
- **Preconditions = exactly the state `10` leaves:** the `20260922040000` row is present, its `name` is
  `'mobilisation_radar'`, it carries no `statements` array, and `public._oux_hygiene_log` exists. If the
  row has statements or a different name, some other tool (a real `supabase db push` or the connector's
  `apply_migration`) wrote it, and deleting it would be a lie in the other direction — the script stops
  and names what it found.
- **The change:** `DELETE FROM supabase_migrations.schema_migrations AS sm WHERE sm.version =
  '20260922040000' RETURNING to_jsonb(sm.*)`, whose `RETURNING` feeds the audit row, so `before_row` is
  the **actual** deleted row rather than a hard-coded assumption of what it contained.
- **Hygiene log (unconditional, the table is a precondition):** the `action = 'delete'` row above, plus
  a stamp of `rolled_back_at = now()` on the matching `10_record_ledger_row` rows (which makes a second
  run a no-op on the log).
- **Post-assertions:** the row is gone; all **16** tables are still present — the rollback must not have
  disturbed the schema.
- **Appended verification `SELECT`:** `ledger_row_present = f`, `ledger_max_version`, `ledger_rows`,
  `tables_present = 16`, `log_rows_stamped` (>= 1, never 0 — the log is a precondition) and
  `rollback_log_rows` (>= 1).
- **Warning in the header:** a database left in this state is one that `supabase db push` would try to
  replay `20260922040000` against, which errors at the first `CREATE POLICY` (§3.2). Do not leave one
  there.

### 3.6 `00_catalog_check.sql`

`00_catalog_check.sql` is read-only: no `BEGIN`, no guard, no writes, safe on any of the three projects.
Blocks A–J are the §3.1 catalog queries as reusable `SELECT`s with their expected counts in the comments;
blocks K–N are the §4.3 reconciliation; block O is the ledger state `10` changes. It is run before and
after every mutating step and its output is pasted into §9 and §11.

---

## 4. Acceptance evidence

### 4.1 `pnpm validate:migrations` green

Run from the repository root, 2026-09-22, on `claude/determined-hypatia-y2cqau` at `74e6e48f`:

```
> offshore-alliance-monorepo@ validate:migrations /home/user/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 17 Supabase migrations with unique 14-digit versions.
```

**Green now, and DA0.5 does not change it.** What it proves is bounded:
`scripts/validate-supabase-migrations.mjs:6-46` reads `supabase/migrations/`, requires every filename to
match `^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$`, requires each 14-digit version to be unique and to
round-trip as a UTC calendar timestamp, and fails if the directory is empty. It never opens a database
and knows nothing about any project's ledger. The gap DA0.5 closes — production holding the objects with
no ledger row — is invisible to this script, which is precisely why the acceptance criterion needs
§4.4's ledger evidence beside it.

### 4.2 Types: no regeneration needed

All sixteen tables are already in `packages/db-types/generated.ts` (one `Row`/`Insert`/`Update` block
each; grepped 2026-09-22): `vessels`, `geofences`, `mobilisation_sources`, `mobilisation_signals`,
`mobilisation_rules`, `mobilisation_alerts`, `mobilisation_alert_signals`, `mobilisation_alert_events`,
`mobilisation_notifications`, `mobilisation_positions`, `mobilisation_prefs`,
`mobilisation_push_subscriptions`, `mobilisation_settings`, `mobilisation_watch_contractors`,
`mobilisation_watch_keywords`, `mobilisation_watch_vessels`. §3.1 found no schema difference, so the
generated types are correct and regeneration is **not** required.

**The agent cannot run the belt-and-braces check, and does not.** `pnpm gen:types` shells out to the
`supabase` CLI, which needs a Supabase access token this agent does not hold, and running any `supabase`
CLI command from this checkout is barred by the standing notes (`PROGRESS.md`; `ORCHESTRATION_PROMPT.md:42`,
whose `supabase/.temp/project-ref` names production). The check is therefore **deferred to the operator**,
as deviation 2 in §8: at the D17 fresh-clone step, `SUPABASE_PROJECT_REF=<fresh clone> pnpm gen:types`
with an explicit safe ref — never the root default — and a `git diff` on
`packages/db-types/generated.ts` that must come back **empty**. If it is not empty, that is a §3.1
finding and a new `2026092210xxxx_mobilisation_radar_reconcile.sql`, never an edit of `20260922040000`.

### 4.3 Incidental findings for the ledger — the employer-register reconciliation

Read-only, production, 2026-09-22 (`00_catalog_check.sql` blocks K–N). Organisation and vessel names only;
no personal data.

**Summary (block N).**

| Measure | Value |
|---|---|
| `vessels` rows | 25 |
| — with `owner_operator_id` | **3** (12%) |
| — linked to an employer whose name ≠ `owner_name` | **0** |
| — linked into the synthetic set 787–794 | **0** |
| — unlinked | **22** |
| `mobilisation_watch_contractors` rows | 14 |
| — with `employer_id` | **2** (14%) |
| — linked to an employer whose name ≠ `canonical_name` | **0** |
| — linked into the synthetic set 787–794 | **0** |
| — unlinked | **12** |
| alias strings in `mobilisation_watch_contractors.aliases` | 4 |
| — **missing from `employer_name_aliases`** | **4 (all of them)** |

**No link is wrong. The problem is that almost none exists**, because the migration's linker
(lines 508–530) matches only on an exact, case-insensitive `employer_name` (or `trading_name`) equality
and most of these companies have no employer row yet, or have one under a legal-entity name.

**Vessels (25).**

| `vessel_id` | `name` | `owner_name` | `owner_operator_id` | Matching `employers.employer_name` | Flag |
|---|---|---|---|---|---|
| 1 | Castorone | Saipem | 726 | Saipem | exact |
| 2 | Saipem Endeavour | Saipem | 726 | Saipem | exact |
| 3 | Saipem Constellation | Saipem | 726 | Saipem | exact |
| 4–9 | Audacia, Sandpiper, Fortitude, Solitaire, Lorelay, Pioneering Spirit | Allseas | NULL | — | **null link**; no `Allseas` employer row — DA1.1 creates one |
| 10–11 | Seven Oceans, Seven Oceanic | Subsea7 | NULL | — | **null link**; no `Subsea7` employer row — DA1.1 creates one |
| 12 | DLV 2000 | McDermott | NULL | — | **null link**; `MCDERMOTT AUSTRALIA PTY LTD` (68) exists but the string differs — DA1.1/DA1.4 |
| 13–15 | Fugro Etive, Fugro Equator, Blue Essence | Fugro | NULL | — | **null link**; `FUGRO AUSTRALIA PTY LTD` (40) exists but the string differs — DA1.1/DA1.4 |
| 16–18 | Southern Star, Southern Nova, Oriental Dragon | DeepOcean | NULL | — | **null link**; no row — DA1.1 creates `DeepOcean / Shelf Subsea` |
| 19–22 | Bravenes, Stornes, Nordnes, Van Oord dredger spread | Van Oord | NULL | — | **null link**; no row — DA1.1 creates one |
| 23–25 | Sapura Constructor, Sapura 3500, Sapura 1200 | Vantris | NULL | — | **null link**; no row — DA1.1 creates `Vantris` |

**Watch contractors (14).**

| `watch_id` | `canonical_name` | `aliases` | tier | `employer_id` | Matching employer name | Flag |
|---|---|---|---|---|---|---|
| 1 | Saipem | `{}` | core | 726 | Saipem | exact. Worksheet row 135: `proposed_action` = *keep; kind=marine key client* — **no merge proposed**, so the link survives Phase 1 |
| 2 | Allseas | `{}` | core | NULL | — | null link; DA1.1 creates the row |
| 3 | Subsea7 | `{Subsea 7}` | core | NULL | — | null link; alias `Subsea 7` **not in `employer_name_aliases`** |
| 4 | McDermott | `{}` | core | NULL | — | null link; `MCDERMOTT AUSTRALIA PTY LTD` (68) is the candidate (worksheet row 90: *canonical; alias for crewing entity recorded*) |
| 5 | Fugro | `{}` | core | NULL | — | null link; `FUGRO AUSTRALIA PTY LTD` (40) is the candidate (worksheet row 62: *canonical; alias for marine entity recorded*) |
| 6 | DeepOcean | `{Shelf Subsea}` | core | NULL | — | null link; alias `Shelf Subsea` **not in `employer_name_aliases`** |
| 7 | Van Oord | `{}` | core | NULL | — | null link; DA1.1 creates the row |
| 8 | Vantris | `{Sapura}` | core | NULL | — | null link; alias `Sapura` **not in `employer_name_aliases`** |
| 9 | DOF | `{}` | adjacent | NULL | — | null link; `DOF MANAGEMENT AUSTRALIA PTY LTD` (39) is the candidate (worksheet row 43: *keep; alias DOF Subsea (recorded)*) |
| 10 | TechnipFMC | `{Technip}` | adjacent | NULL | — | null link; alias `Technip` **is** an employer name (728) but **not in `employer_name_aliases`**. Worksheet row 155 (`Technip`, 728) is `proposed_relationship = ambiguous`, `proposed_action` = *split or annotate: Technip Energies (HUC principal, Crux) vs TechnipFMC (subsea)*, open question **Q-E18** — so the watch row must **not** be linked to 728 until Q-E18 is answered |
| 11 | Heerema | `{}` | adjacent | NULL | — | null link; DA1.1 creates the row |
| 12 | Boskalis | `{}` | adjacent | NULL | — | null link; DA1.1 creates the row |
| 13 | DEME | `{}` | adjacent | NULL | — | null link; no row |
| 14 | Petrofac | `{}` | adjacent | 737 | Petrofac | exact. Worksheet row 120: `proposed_action` = *keep* — **no merge proposed** |

**Alias strings not in `employer_name_aliases` (all four).** `Subsea 7` (watch 3), `Shelf Subsea`
(watch 6), `Sapura` (watch 8), `Technip` (watch 10). This is plan §1.11's "fourth alias store" in numbers:
the tracker's alias list and the employer register share nothing. DA1.4 (alias lock) folds them in; D15
names this as its own follow-through.

**No row of either table links to an employer the worksheet proposes to merge**, and none links into the
synthetic set 787–794, so **DA0.2 can run before DA0.5 without touching these tables** — which is the
Phase 0 order the prompt already sets (DA0.2 → DA0.5 → DA0.3).

**One data drift, no action.** `mobilisation_watch_contractors` `watch_id = 9` (`DOF`) has
`is_active = true` in production; the migration seeds it `false` (line 440). Someone re-activated it in
the app after the seed ran. The seed is `ON CONFLICT (canonical_name) DO NOTHING`, so nothing in this
package changes it, and it is **not** a schema difference. Recorded so a later reader does not mistake
it for one.

### 4.4 Which acceptance criteria DA0.5 satisfies, and which wait for Phase 1

| §5 acceptance criterion | Verdict | Evidence |
|---|---|---|
| `pnpm validate:migrations` green | **satisfied now**, and unchanged by this package | §4.1 |
| a fresh clone carries the 16 tables | **satisfiable now on the 12 September clone** (§3.4 steps 2–4: the migration applies cleanly there and its catalog matches production's). For the **fresh** clone of D17 — taken from production after Phase 0 — it is satisfied by construction, because a clone of production carries the tables and, once `10` has run on production, the ledger row too. Recorded at that point, not now | §3.4, §9 |
| every `owner_operator_id` and watch-contractor `employer_id` resolves to a canonical employer | **waits for Phase 1.** Today 3 of 25 vessels and 2 of 14 watch contractors are linked, and every link that exists resolves to a canonical, correctly-named, non-synthetic employer (0 mismatches). The 22 + 12 null links cannot be filled until DA1.1 creates the missing roots (Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris, Boskalis, Heerema — named in the plan's §5 DA1.1 row) and DA1.4 folds the four alias strings into `employer_name_aliases`. DA0.5's contribution is the measurement above, filed as the ledger's incidental findings, plus the proof that **no existing link is wrong** | §4.3 |

The strict reading of the third criterion — *every* link resolves — is therefore **deferred to DA1.2**,
which the plan's §5 row already makes responsible for "the key-clients tab's 38 vessels reconciled against
the 25 rows that table already holds (D15)". This is a deviation the orchestrator should confirm when
approving (§5, O-4).

### 4.5 Evidence the verifier pastes against

| Item | Where | Expected |
|---|---|---|
| Production before | `00_catalog_check.sql` block O | `tables_present = 16`, `ledger_row_present = f`, `ledger_max_version = 20260921030000`, `ledger_rows = 16` |
| Production after `10` | appended `SELECT` | `ledger_row_present = t`, `mobilisation_radar`, `ledger_rows = 17`, `tables_present = 16`, `27`, `8`, `t`, `log_rows_written = 1` (`ledger_max_version` reported, not asserted) |
| Clone before | block O | `tables_present = 0`, `ledger_max_version = 20260917100000`, `ledger_rows = 12` |
| Clone after migration + `10` | appended `SELECT` | as above with `ledger_rows = 13` |
| Clone after `90` | appended `SELECT` | `ledger_row_present = f`, `tables_present = 16`, `log_rows_stamped = 1`, `rollback_log_rows = 1` |
| Clone catalog vs production catalog | blocks A–I | row-for-row identical |
| Clone seed counts | block J | geofences 3, watch contractors 14, vessels 25, watch vessels 25, keywords 21, sources 8, rules 4, settings 1; event tables 0 |
| Reconciliation, production **and** clone | blocks K–N | the numbers in §4.3, identical on both (§3.4) |
| Validator | `pnpm validate:migrations` | `Validated 17 Supabase migrations with unique 14-digit versions.` |

---

## 5. Operator inputs

| # | Input | Tied to |
|---|---|---|
| **O-1** | **Confirm the D15 finding**: the mobilisation radar in this repository owns the sixteen tables, and no other checkout applied a different version of the DDL. §3.1 proves production's schema equals this file's, which makes a *different* DDL very unlikely, but only the operator can say whether another checkout ran it. Already on the `PROGRESS.md` human-tasks list | §1.4; must be answered before the production run sheet |
| **O-2** | **Approve the ledger-row run sheet** (§3.3): production takes `10_record_ledger_row.sql` only, and the migration file is never replayed there | §3.3; Phase 0 order DA0.2 → DA0.5 → DA0.3 |
| **O-3** | **Approve the clone apply** (§3.4): the agent submits `20260922040000_mobilisation_radar.sql` unmodified to `yqjkuobcawvigsfpgrcm`, then `10`, then `90`, then `10` again — one file per submission, output pasted before the next | §3.4 |
| **O-4** | **Confirm the acceptance split** in §4.4: DA0.5 satisfies the validator and the clone criteria and *measures* the employer links; filling the 22 + 12 null links moves to DA1.1 / DA1.2 / DA1.4 | §4.4 |

---

## 6. Risks

| # | Risk | Safeguard |
|---|---|---|
| R1 | Someone runs `supabase db push` against production before the ledger row exists, and it aborts at the first `CREATE POLICY` (§3.2) leaving a failed push in the tooling's state | The whole point of `10`. Until it runs, the standing rule holds: no `supabase` CLI command from this checkout (`PROGRESS.md` standing notes). Recorded as the ledger's first incidental finding, now answered |
| R2 | The migration is replayed on production by mistake, silently re-watching vessels and re-linking employers (§3.2, lines 477–479 and 508–530) | `10` never contains the migration's statements; the README says in bold that the file is not submitted on production; `10`'s own precondition (a) refuses a second run |
| R3 | A future `supabase db diff` or push writes a **real** `20260922040000` row with `statements`, and someone then runs `90` and deletes it | `90`'s precondition refuses a row that carries a `statements` array and says to stop and report |
| R4 | Production's schema drifts from the file between this plan and the run sheet (the weekly membership batch keeps production moving) | `00_catalog_check.sql` is re-run immediately before and after `10` on production; any difference stops the package and becomes a **new** `2026092210xxxx_mobilisation_radar_reconcile.sql`, never an edit of `20260922040000` |
| R5 | The clone is mutated by the mobilisation pollers after the tables land there, making every later checksum unreproducible | No mobilisation cron, service-role key or deployment is pointed at the clone (`apps/organising-db/vercel.json` crons run only against whatever project the deployment's `NEXT_PUBLIC_SUPABASE_URL` names, which is production); the tables are inert on the clone |
| R6 | The clone apply is blocked by a missing prerequisite migration | Checked read-only: the prerequisite set is empty (§3.4). If step 2 nonetheless errors, stop and report rather than applying `20260914090000` / `20260914090100`, which have their own run sheet in the UX ledger |
| R7 | `90` leaves a database whose ledger is silent again, and a later push errors | `90` is a rehearsal and recovery tool; its header says so and the clone run order ends with `10` re-applied |
| R8 | The four watch-contractor alias strings get folded into `employer_name_aliases` by two packages at once (DA0.5 and DA1.4) | DA0.5 **measures only** and writes nothing to `employer_name_aliases`; §4.3 hands the four strings to DA1.4 through the ledger's incidental findings |
| R9 | `mobilisation_watch_contractors.employer_id` is later pointed at `Technip` (728) while Q-E18 is open | Flagged explicitly in §4.3's watch-contractor table; DA1.1 owns Q-E18 |

---

## 7. Approval

_Orchestrator's written approval, dated, or the reasons the plan was sent back._

**Approved by the orchestrator, 2026-09-22**, against the §5 row, D15 and the rules, with these conditions:

1. The production change is ledger-row-only (`10_record_ledger_row.sql`); the migration file is never submitted to production. Confirmed against §3.2.
2. The acceptance split in §4.4 (DA0.5 measures the employer links and proves none is wrong; filling the null links is DA1.1 / DA1.2 / DA1.4) is accepted by the orchestrator and put to the operator as O-4 in the Phase 0 hand-over; it is recorded as deviation 1 in §8.
3. The clone rehearsal (§3.4) runs only after the Fable review in §10 returns no blocking finding.
4. DA0.5 writes nothing to `employer_name_aliases`, `vessels` or `mobilisation_watch_contractors` (R8, R9).
5. O-1 (the D15 confirmation) is required before the production run sheet, not before the clone rehearsal.

---

## 8. Deviations from plan

_Kept by the implementer; each with its justification._

| # | Deviation | Justification | Date |
|---|---|---|---|
| 1 | The §5 row's third acceptance criterion is split: DA0.5 measures the links and proves none is wrong; the null links are filled by DA1.1 / DA1.2 / DA1.4 | The missing employer roots do not exist until Phase 1 creates them; writing them here would widen the package (`ORCHESTRATION_PROMPT.md:44`) | 2026-09-22 |
| 2 | **Types are not regenerated by this package.** `packages/db-types/generated.ts` already carries all sixteen tables (§4.2, grep evidence) and §3.1 found no schema difference, so the committed types are already correct. The confirming `SUPABASE_PROJECT_REF=<fresh clone> pnpm gen:types` and its expected-empty `git diff packages/db-types/generated.ts` are deferred to the operator at the D17 fresh-clone step | `pnpm gen:types` shells out to the `supabase` CLI and needs an access token this agent does not hold, and any `supabase` CLI command from this checkout is barred (`PROGRESS.md` standing notes; `ORCHESTRATION_PROMPT.md:42`, whose `supabase/.temp/project-ref` names production). A non-empty diff would be a §3.1 finding and a **new** `2026092210xxxx_mobilisation_radar_reconcile.sql`, never an edit of `20260922040000` | 2026-09-22 (reviewer finding F5, fix round 1) |

Deviation 1 is proposed **in** the plan and needs approval rather than recording — see §4.4 and operator
input O-4.

---

## 9. Verification record

_Raw command output and rehearsal results pasted by the verifier: forward → rollback → forward again,
with the catalog output at each stage._

### 9.1 Production catalog, read-only, 2026-09-22 (planner)

Derived through the connector with the queries of `00_catalog_check.sql`. Headline results, to be
re-pasted in full by the verifier:

- Block A: 16 tables, `relrowsecurity = t` on all 16, `relforcerowsecurity = f` on all 16, comments on
  `vessels`, `geofences`, `mobilisation_signals`, `mobilisation_alert_events`, `mobilisation_positions`.
- Block B: 171 columns; every type, nullability, default and `attidentity` equal to the file.
- Block C: 72 constraints — 16 PK, 13 UNIQUE, 20 CHECK, 23 FK; every `pg_get_constraintdef` equal to the
  file's text modulo Postgres's normalisation (`IN (…)` → `= ANY (ARRAY[…])`, `BETWEEN` → `>= AND <=`).
- Block D: 33 indexes, including the four explicit `idx_mobilisation_signals_*`.
- Block E: 27 policies, all `PERMISSIVE`, all `{authenticated}`.
- Block F: 8 triggers, definitions equal to lines 380–405.
- Block G: `mobilisation_alert_audit` `md5(pg_get_functiondef)` = `764235c6343f9cc8189502ba271571e5`,
  body byte-identical to lines 354–378; prerequisites `update_updated_at`
  (`28c4c04688c55a53cda7430cc3b538ed`) and `get_user_role` (`286b2eb565b18a700b6867b6dbcd51f5`) present
  from the baseline.
- Block H: `anon` — no rows; `authenticated` and `service_role` — full set on all 16 (§3.1 grants note).
- Block I: 12 sequences, owner `postgres`, `USAGE` for `authenticated` and `service_role`.
- Block J: vessels 25, geofences 3, watch contractors 14, watch vessels 25, keywords 21, sources 8,
  rules 4, settings 1, signals 19, alerts 18, alert signals 18; alert events, notifications, prefs,
  push subscriptions and positions 0.
- Block O: `tables_present = 16`, `ledger_row_present = f`, `ledger_max_version = 20260921030000`,
  `ledger_rows = 16`. The ledger's 16 rows end `… 20260917100000 wp3_8_campaign_families` (the one row
  with `statements IS NULL`, written by the WP3.8 run sheet), `20260918120000 email_draft_attachments`,
  `20260921030000 membership_updates`.

### 9.2 Clone prerequisite check, read-only, 2026-09-22 (planner)

`yqjkuobcawvigsfpgrcm`: `employers`, `worksites`, `sectors`, `user_profiles`, `auth.users`,
`public.update_updated_at()`, `public.get_user_role()`, `_oux_env_marker`, `_oux_hygiene_log` — all
`present = true`; `vessels`, `geofences`, `mobilisation_signals` — `present = false`;
`ledger_max_version = 20260917100000`, `ledger_rows = 12`.

Employer rows the migration's linker will match on the clone: `726 Saipem` (active) and
`737 Petrofac` (active) — the same ids and names as production; the other twelve seeded contractor
names match no employer name or trading name, and none of the synthetic rows 787–794 collides with a
seed name. Hence §3.4's expected-links table.

### 9.3 Audit-log preconditions, read-only, 2026-09-22 (planner)

`public._oux_hygiene_log` is present on **both** mutating targets, so `10`'s and `90`'s precondition (e)
passes on each:

- production `gteygwfgjvczanmrwgbr`: present, **736 rows**, columns `log_id, script, action, table_name,
  row_pk, before_row, after_row, note, logged_at, rolled_back_at` — the WP0.4 shape
  (`oux-wp0.4/00_create_hygiene_log.sql:31-42`).
- clone `yqjkuobcawvigsfpgrcm`: present (`PROGRESS.md` standing notes, re-checked above).

### 9.4 Clone rehearsal

_Pasted by the verifier (Sonnet), via the connector, project `yqjkuobcawvigsfpgrcm`, 2026-09-22._

**Step 1 — `00_catalog_check.sql` blocks A–J and O (before).** Run as separate submissions, one block
per call.

Block A:
```
[]
```
Block B:
```
[]
```
Block C:
```
[]
```
Block D:
```
[]
```
Block E:
```
[]
```
Block F:
```
[]
```
Block G:
```
[{"function_name":"get_user_role","args":"","language":"sql","security_definer":true,
  "definition_md5":"286b2eb565b18a700b6867b6dbcd51f5",
  "definition":"CREATE OR REPLACE FUNCTION public.get_user_role()\n RETURNS text\n LANGUAGE sql\n STABLE SECURITY DEFINER\nAS $function$\n  SELECT role FROM public.user_profiles WHERE user_id = auth.uid();\n$function$\n"},
 {"function_name":"update_updated_at","args":"","language":"plpgsql","security_definer":false,
  "definition_md5":"28c4c04688c55a53cda7430cc3b538ed",
  "definition":"CREATE OR REPLACE FUNCTION public.update_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$function$\n"}]
```
Block H:
```
[]
```
Block I:
```
[]
```
Block J:
```
ERROR: 42P01: relation "public.vessels" does not exist
LINE 1: SELECT 'vessels' AS table_name, count(*) AS rows FROM public.vessels
                                                              ^
```
Block O:
```
[{"tables_present":0,"ledger_row_present":false,"ledger_max_version":"20260917100000","ledger_rows":12}]
```

**Comparison against README step 1's expectation** (corrected by the orchestrator, README.md line 61:
`tables_present = 0`, `ledger_max_version = '20260917100000'`, `ledger_rows = 12`; blocks A–F, H and I
return no rows; block G shows only the two baseline functions `get_user_role` and `update_updated_at`;
block J errors `42P01 relation "public.vessels" does not exist` because it counts rows in the sixteen
tables that do not exist yet):

- Block O matches exactly: `tables_present = 0`, `ledger_row_present = f`, `ledger_max_version =
  '20260917100000'`, `ledger_rows = 12`.
- Blocks A–F, H, I returned no rows, as expected.
- Block G returned exactly the two baseline functions (`get_user_role`, `update_updated_at`);
  `mobilisation_alert_audit` correctly absent.
- Block J errored `42P01: relation "public.vessels" does not exist`, as expected.

**Step 1 verdict: matches.** No mismatch; proceed.

**Step 2 — the exact file `supabase/migrations/20260922040000_mobilisation_radar.sql`, unmodified, as
one `BEGIN; … COMMIT;` submission through `execute_sql`** (never `apply_migration`).

Result:
```
[]
```
(The submission's last statement is the sequence-grant `DO $$ … $$` block, which returns no result
set — an empty array is the correct output of a clean commit.) No error was returned; the transaction
committed.

**Step 3 — `10_record_ledger_row.sql` as one call.**

Appended `SELECT` result:
```
[{"ledger_row_present":true,"ledger_name":"mobilisation_radar","ledger_max_version":"20260922040000",
  "ledger_rows":13,"tables_present":16,"policies":27,"triggers":8,
  "audit_function_present":true,"log_rows_written":1}]
```

**Comparison against README step 3's expectation** (`ledger_row_present = t`,
`ledger_name = 'mobilisation_radar'`, `ledger_rows = 13`, `tables_present = 16`, `policies = 27`,
`triggers = 8`, `audit_function_present = t`, `log_rows_written = 1`): **matches exactly**, field for
field. `ledger_max_version = '20260922040000'` (reported only, as the script specifies).

**Step 4 — `00_catalog_check.sql` blocks A–J and K–N (after-forward-1).**

Block A (16 rows): all 16 tables present, `rls_enabled = t` / `rls_forced = f` on all 16; `table_comment`
set on exactly 5 — `geofences`, `mobilisation_alert_events`, `mobilisation_positions`,
`mobilisation_signals`, `vessels` — with text identical to the migration file's `COMMENT ON TABLE`
statements (lines 48, 67, 193, 268, 335).

Block B (171 rows counted): every table's column set, ordinal, data type, `not_null`, default and
`identity` reproduced (e.g. `vessels` 23 columns ending `updated_at`; `mobilisation_signals` 26 columns;
`mobilisation_alert_events` 8; `mobilisation_watch_contractors` 10; full row set recorded in the
connector transcript, object-for-object identical to the migration file's `CREATE TABLE` bodies).

Block C (72 constraints): 16 PRIMARY KEY, 13 UNIQUE (backing the `_unique` constraints), 20 CHECK, 23
FOREIGN KEY — including `vessels_owner_operator_id_fkey … ON DELETE SET NULL`,
`mobilisation_alert_signals_*_fkey … ON DELETE CASCADE`, `mobilisation_alerts_rule_id_fkey` with no
action — all `pg_get_constraintdef` text identical to the file modulo Postgres's `IN(...)` →
`= ANY(ARRAY[...])` normalisation, same as production (§9.1).

Block D (33 indexes): all present, including the four explicit `idx_mobilisation_signals_occurred`,
`_watch`, `_vessel`, `_layer`, plus the 29 backing PK/UNIQUE indexes.

Block E (27 policies): all `PERMISSIVE`, all `roles = {authenticated}`, `USING`/`WITH CHECK` text
identical to the file (e.g. `mobilisation write vessels`, `mobilisation admin update settings`,
`mobilisation write own prefs` spot-checked byte-identical to lines 647–650, 732–735, 715–718).

Block F (8 triggers): 7 `BEFORE UPDATE … update_updated_at()` (vessels, geofences,
mobilisation_watch_contractors, mobilisation_rules, mobilisation_alerts, mobilisation_prefs,
mobilisation_settings) + `trg_mobilisation_alert_audit AFTER UPDATE ON mobilisation_alerts`.

Block G (3 functions): `get_user_role` md5 `286b2eb565b18a700b6867b6dbcd51f5`, `update_updated_at` md5
`28c4c04688c55a53cda7430cc3b538ed`, `mobilisation_alert_audit` md5 `764235c6343f9cc8189502ba271571e5` —
all three identical to §9.1's production values.

Block H: `authenticated` and `service_role` each show the full privilege set
(`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`) on all 16 tables; `anon` and `PUBLIC` show
no rows — matches the file's `REVOKE ALL … FROM PUBLIC, anon` plus Supabase's default-ACL floor, same
as production (§9.1, §3.1 grants note).

Block I (12 sequences): owner `postgres`, `authenticated_usage = t`, `service_role_usage = t`,
`anon_usage = t` on all 12 — matches production's Block I (anon's `USAGE` comes from the default ACL,
not the file's explicit grants, per §3.1).

**Blocks A–I comparison verdict: identical to §9.1's production output, object for object.** No
divergence found in tables, columns, constraints, indexes, policies, triggers, functions, grants or
sequences.

Block J (row counts):
```
geofences 3, mobilisation_alert_events 0, mobilisation_alert_signals 0, mobilisation_alerts 0,
mobilisation_notifications 0, mobilisation_positions 0, mobilisation_prefs 0,
mobilisation_push_subscriptions 0, mobilisation_rules 4, mobilisation_settings 1,
mobilisation_signals 0, mobilisation_sources 8, mobilisation_watch_contractors 14,
mobilisation_watch_keywords 21, mobilisation_watch_vessels 25, vessels 25
```
Matches the expected seed counts (geofences 3, watch contractors 14, vessels 25, watch vessels 25,
keywords 21, sources 8, rules 4, settings 1) with all eight event tables at 0 — differing from
production (§9.1: signals 19, alerts 18, alert_signals 18) exactly as the README predicts (live data
vs. none).

Block K (vessels, 25 rows): vessel_id 1–3 (`Castorone`, `Saipem Endeavour`, `Saipem Constellation`) →
`owner_operator_id = 726`, `linked_employer_name = 'Saipem'`, `link_state = 'exact'`; vessel_id 4–25 →
`owner_operator_id = NULL`, `link_state = 'unlinked'`. Matches §3.4's expected-links table exactly.

Block L (watch contractors, 14 rows): watch_id 1 (`Saipem`) → `employer_id = 726`, `link_state =
'exact'`; watch_id 14 (`Petrofac`) → `employer_id = 737`, `link_state = 'exact'`; watch_id 2–13 →
`employer_id = NULL`, `link_state = 'unlinked'`. Matches §3.4 exactly.

Block M (alias strings, 4 rows): `Subsea 7` (watch 3), `Shelf Subsea` (watch 6), `Sapura` (watch 8),
`Technip` (watch 10) — all four `in_employer_name_aliases = 0`; `Technip` alone has
`alias_is_an_employer_name = 1`. Matches §4.3's production finding exactly (all four missing from the
register; `Technip` is a distinct employer name, flagged Q-E18).

Block N (summary):
```
{"vessels_total":25,"vessels_linked":3,"vessels_name_mismatch":0,"vessels_into_synthetic":0,
 "contractors_total":14,"contractors_linked":2,"contractors_name_mismatch":0,
 "contractors_into_synthetic":0,"alias_strings_missing_from_register":4}
```

**Blocks K–N comparison verdict: reproduces production's reconciliation exactly** (§4.3 / README step
4's expectation: 3 vessels linked, 2 watch contractors linked, 0 mismatched, 0 synthetic, 4 alias
strings missing) — **no divergence.**

**Step 4 verdict: matches, no mismatch.**

**Step 5 — `90_remove_ledger_row.sql` as one call.**

Result:
```
[{"ledger_row_present":false,"ledger_max_version":"20260917100000","ledger_rows":12,
  "tables_present":16,"log_rows_stamped":1,"rollback_log_rows":1}]
```

**Comparison against README step 5's expectation** (`ledger_row_present = f`, `tables_present = 16`,
`log_rows_stamped = 1`, `rollback_log_rows = 1`): **matches exactly.**

**Step 6 — `10_record_ledger_row.sql` again (after-forward-2).**

Appended `SELECT` result:
```
[{"ledger_row_present":true,"ledger_name":"mobilisation_radar","ledger_max_version":"20260922040000",
  "ledger_rows":13,"tables_present":16,"policies":27,"triggers":8,
  "audit_function_present":true,"log_rows_written":1}]
```

**Comparison against step 3:** identical on every field (`ledger_row_present`, `ledger_name`,
`ledger_max_version`, `ledger_rows`, `tables_present`, `policies`, `triggers`,
`audit_function_present`, `log_rows_written`) — the appended `SELECT` carries no timestamp columns, so
there is no timestamp difference to note either; the two results are byte-identical.

**Rehearsal outcome: all six steps ran, all six matched their stated expectation. No STOP, no
divergence, no mismatch found anywhere in blocks A–N across the before/after-forward-1 comparison, or
in the forward → rollback → forward cycle.**

### 9.5 Clone rehearsal of 12 (verifier), 2026-09-24

_Pasted by the verifier (Sonnet), via the connector, project `yqjkuobcawvigsfpgrcm`, 2026-09-24. Same
rules: `execute_sql` only, never `apply_migration`, nothing run against production or dev._

**Step 1 — `supabase/migrations/20260923220000_mobilisation_recipients.sql`, one `BEGIN; … COMMIT;`.**
Result: `[]`, no error. Matches ("Expect no error").

**Step 2 — `supabase/migrations/20260924010000_mobilisation_signal_schedule.sql`, one `BEGIN; …
COMMIT;`.** Result: `[]`, no error. Matches.

**Step 3 — `12_record_later_ledger_rows.sql`.** Appended `SELECT`:
```
[{"rows_20260923220000":1,"rows_20260924010000":1,"ledger_rows":16,
  "ledger_max_version":"20260924010000","recipients_table":true,"recipients_policies":2,
  "signals_new_columns":2,"arrival_index":true,"log_rows_written":2}]
```
Every field matches the stated expectation except the absolute `ledger_rows` value: the coordinator's
message did not give a number, only "previous + 2". A raw dump of the ledger (below) shows 14 rows
existed immediately before this step, not the 13 the clone held at the end of the prior rehearsal
(2026-09-22) — the extra row is `20260922120000 da0_3_name_match_reviews`, added to this shared clone
between the two rehearsals by other work (visible in the repository's untracked `da0.3` files), not by
anything this script ran. `14 + 2 = 16` — the formula holds. Raw dump:
```
[{"version":"20260908050000","name":"baseline_schema"}, {"version":"20260908050100","name":"baseline_reference_data"},
 {"version":"20260908050200","name":"baseline_platform_config"}, {"version":"20260909100000","name":"workspace_mode"},
 {"version":"20260909120000","name":"wp1_6_campaign_write_policies"}, {"version":"20260909130000","name":"wp1_6_delete_campaign_standing_guard"},
 {"version":"20260910090000","name":"campaign_last_activity"}, {"version":"20260911090000","name":"user_hint_dismissals"},
 {"version":"20260911100000","name":"user_hint_dismissals_check"}, {"version":"20260912035329","name":"wp2_1_campaign_groups"},
 {"version":"20260913000000","name":"an_survey_reports"}, {"version":"20260917100000","name":"wp3_8_campaign_families"},
 {"version":"20260922040000","name":"mobilisation_radar"}, {"version":"20260922120000","name":"da0_3_name_match_reviews"},
 {"version":"20260923220000","name":"mobilisation_recipients"}, {"version":"20260924010000","name":"mobilisation_signal_schedule"}]
```
Not a mismatch of this script's own behaviour; flagged and not diagnosed away.

**Step 4 — `91_remove_later_ledger_rows.sql`.** Result:
```
[{"rows_present_after":0,"ledger_rows":14,"rollback_log_rows":2,"log_rows_stamped":2}]
```
Matches exactly (`rows_present_after = 0`, `rollback_log_rows = 2`, `log_rows_stamped = 2`).

**Step 5 — `12_record_later_ledger_rows.sql` again.** Result:
```
[{"rows_20260923220000":1,"rows_20260924010000":1,"ledger_rows":16,
  "ledger_max_version":"20260924010000","recipients_table":true,"recipients_policies":2,
  "signals_new_columns":2,"arrival_index":true,"log_rows_written":2}]
```
Identical to step 3, field for field, as expected (`log_rows_written = 2` again since step 4 stamped
the earlier rows `rolled_back_at`, so only the freshly-written pair is unstamped).

**Step 6 — clone left forward.** No further action: step 5 leaves the ledger carrying both
`20260923220000` and `20260924010000`, and both migration files are applied. No rollback follows.

**Outcome: all five mutating/verification steps matched their stated expectation.** No STOP.

### 9.6 Production run

_To be pasted by the operator, see §11._

---

## 10. Review

_The reviewer's ranked findings with `path:line`, blocking or advisory, and the overall verdict; fix
rounds recorded (two maximum)._

**2026-09-22 — Reviewer: Fable, round 1.** Read-only verification on production `gteygwfgjvczanmrwgbr`
and the clone `yqjkuobcawvigsfpgrcm` through the connector (pg_catalog, counts, organisation and vessel
names only); no file other than this section edited; nothing committed.

**What was verified and holds.** (1) DDL spot-checks against production, all identical to the file:
`vessels_type_check`, `vessels_imo_format_check`, `mobilisation_signals_confidence_check` (CHECK);
`vessels_owner_operator_id_fkey … ON DELETE SET NULL`, `mobilisation_alert_signals_*_fkey … ON DELETE CASCADE`,
`mobilisation_alerts_rule_id_fkey` with no action (FK, lines 45 / 250–252 / 231); policies
`mobilisation write vessels`, `mobilisation admin update settings`, `mobilisation write own prefs`
(USING / WITH CHECK, lines 647–650, 732–735, 715–718); `mobilisation_alert_audit()` body byte-identical to
lines 354–378, md5 `764235c6343f9cc8189502ba271571e5`; the four `idx_mobilisation_signals_*` definitions
(lines 196–203); all 8 trigger definitions. Class counts reproduced: 171 columns, 16 PK, 13 UNIQUE,
20 CHECK, 23 FK, 33 indexes, 27 policies, 8 triggers, 0 views. (2) Line 645 is `CREATE POLICY` with no
`IF NOT EXISTS`/`OR REPLACE`; lines 477–479 and 508–530 are as §3.2 describes. (3) Environment guard in
`10` and `90` byte-identical to `oux-wp3.8/10_campaign64_family.sql:31-47`; production has no
`_oux_env_marker`, the clone's marker is a `clone` singleton. (4) `supabase_migrations.schema_migrations`
on both projects: `version text NOT NULL` (no default), `statements text[]`, `name text`, `created_by text`,
`idempotency_key text`, `rollback text[]`, all nullable — `INSERT (version, name)` is valid; production
ledger is 16 rows, max `20260921030000`, `20260917100000` the one `statements IS NULL` row. (5) §4.3
counts reproduced exactly: vessels 25 / linked 3 / mismatch 0 / synthetic 0; contractors 14 / 2 / 0 / 0;
alias strings 4, all 4 absent from `employer_name_aliases`; DOF (`watch_id` 9) `is_active = true` in
production against the seed's `false`. Only organisation and vessel names appear in §4.3 and the scripts.
(6) `scripts/validate-supabase-migrations.mjs` reads the directory only, never a database; run 2026-09-22:
`Validated 17 Supabase migrations with unique 14-digit versions.` (7) `20260922040000` is unchanged since
`afc3eed8` (`git log`, no working-tree diff). (8) Migration atomicity on the clone: one transaction, so a
part-way failure leaves nothing; every prerequisite (`employers.employer_name/trading_name/is_active`,
`worksites`, `sectors`, `user_profiles`, `auth.users`, `update_updated_at()`, `get_user_role()`) is present
on the clone. Tests: not applicable, no code in the package.

| # | Finding | `path:line` | Blocking? | Round | Resolution |
|---|---|---|---|---|---|
| F1 | **Production already has `public._oux_hygiene_log`** (736 rows from WP0.4/WP2.x/WP3.8 scripts, columns `log_id, script, action, table_name, row_pk, before_row, after_row, note, logged_at, rolled_back_at`, `action` CHECK `update/insert/delete`). The plan says the operator "creates it under DA0.2's run sheet or it is skipped" and §9.2 lists it for the clone only; `10` and `90` therefore make the log optional (`IF to_regclass(...) IS NOT NULL`), where the precedent STOPs when it is missing (`oux-wp3.8/10_campaign64_family.sql:68-69`, `91_…:57-59`) and the rule is that every mutating step logs (`ORCHESTRATION_PROMPT.md:106`). Fix: in both scripts move the log check into the preconditions as `RAISE EXCEPTION '10 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)'`, write the log row unconditionally, and correct §3.3, §9.2 and the `90` header/`SELECT` comment (`log_rows_stamped >= 1`, never 0) | `wp/da0.5.md:194-197`, `10_record_ledger_row.sql:137-154`, `90_remove_ledger_row.sql:71-94,123-124` | **blocking** | 1 |**fix round 1: applied.** `10` gains precondition (e) `IF to_regclass('public._oux_hygiene_log') IS NULL THEN RAISE EXCEPTION '10 STOP: …'` and writes its audit row unconditionally (the `DO`/`IF` wrapper is gone); `90` gains the same precondition and writes both its `delete` row and the `rolled_back_at` stamp unconditionally. Plan §3.3 now records the 736-row production log and cites `oux-wp3.8/10_campaign64_family.sql:68-69`; new §9.3 pastes the read-only evidence for both projects; `90`'s header and `SELECT` comment now read `log_rows_stamped >= 1, never 0`, and the `SELECT`'s `CASE WHEN … IS NULL THEN 0` arm is gone |
| F2 | `90`'s precondition is not exactly `10`'s post-state: it checks presence and no `statements`, but not `name = 'mobilisation_radar'`, while its `before_row` hard-codes that name (line 87) rather than reading it. Add `AND name = 'mobilisation_radar'` to the precondition (STOP otherwise) and build `before_row` from the row itself | `90_remove_ledger_row.sql:47-63,87` | advisory | 1 |**fix round 1: applied.** `90`'s preconditions now also require `name = 'mobilisation_radar'` (the exception reports what it found), and the delete is `DELETE … AS sm … RETURNING to_jsonb(sm.*)` feeding the log, so `before_row` is the actual deleted row. Plan §3.5 and the README row updated |
| F3 | `10`'s post-assertion "newest version in the ledger" (lines 167–171) is order-dependent, not a truth condition: if any later-stamped migration (DA0.3's, or any UX-programme file) reaches production before this run sheet, `10` aborts although the row would be correct. Phase 0 order protects it today; either drop the assertion or assert `max(version) >= '20260922040000'`. Likewise precondition (d)'s comment ("every earlier migration … cannot make it the newest row over a gap") is false on the clone, where the row will sit over four missing versions; reword to what is checked (the baseline row) | `10_record_ledger_row.sql:123-127,167-171`; `wp/da0.5.md:182-183,198` | advisory | 1 |**fix round 1: applied.** The `max(version) <> '20260922040000'` post-assertion is **dropped**, with a comment saying why, and replaced by an assertion that the row is the `(version, name)` row the script writes with no `statements`. `ledger_max_version` is now reported by the verification `SELECT`, not asserted, in the scripts, the plan (§3.3, §3.4, §4.5) and the README. Precondition (d)'s comment no longer claims 'no gap': it now says it is a sanity check on the target database and names the four migrations the clone legitimately lacks |
| F4 | The clone's employer links will **not** differ from production's, contrary to §3.4 and the README: the clone holds `Saipem` (726) and `Petrofac` (737) active and no `Technip`; no other seed `owner_name`/`canonical_name` matches any clone `employer_name`/`trading_name`, and none of the synthetic 787–794 names collides. Expected clone result after step 2: vessels 1–3 → 726, watch 1 → 726, watch 14 → 737, 0 links into 787–794 — identical to production. State this precisely so step 4 can compare the two link columns as well, and note that DA0.2's clone rehearsal is unaffected (no row links into the synthetic set) | `wp/da0.5.md:225-230`; `README.md:65-67` | advisory | 1 |**fix round 1: applied.** Re-checked read-only 2026-09-22: `726 Saipem` and `737 Petrofac` exist on the clone under the same ids and names, no other seeded contractor name matches an employer name or trading name, and none of 787–794 collides. Plan §3.4 now says the links are **identical** to production's and gives the expected-value table (vessels 1–3 → 726, watch 1 → 726, watch 14 → 737, 0 into 787–794); §9.2 records the evidence; clone step 4 now runs blocks **K–N** too and must reproduce §4.3's numbers exactly; `README.md` step 2 carries the same values |
| F5 | The §5 row and the orchestration paragraph require "regenerate types from a clone that carries the tables"; §4.2 makes it optional. Either run `SUPABASE_PROJECT_REF=yqjkuobcawvigsfpgrcm pnpm gen:types` after §3.4 step 3 and paste the (expected empty) `git diff --stat packages/db-types/generated.ts` into §9.3, or record the omission as deviation 2 in §8 with the §3.1 proof as justification. Today it is neither | `wp/da0.5.md:316-326,478-480` | advisory | 1 |**fix round 1: applied as deviation 2 (§8).** §4.2 now states that `pnpm gen:types` shells out to the `supabase` CLI and needs an access token the agent does not hold, that any `supabase` CLI command from this checkout is barred, and that the confirming regeneration and empty `git diff` are deferred to the operator's D17 fresh-clone step |
| F6 | `README.md:29-30` and the `10` header say the 8 `CREATE TRIGGER` statements are non-idempotent; §3.2 (line 153) correctly says each is preceded by `DROP TRIGGER IF EXISTS` and is a no-op. Only the 27 `CREATE POLICY` statements fail. Align the README and header with §3.2 | `README.md:29-30`; `10_record_ledger_row.sql:16-17` | advisory | 1 |**fix round 1: applied.** `README.md` and the `10` header now say only the 27 `CREATE POLICY` statements fail (42710 at the first) and state explicitly that the 8 `CREATE TRIGGER` statements each follow a `DROP TRIGGER IF EXISTS` and *are* idempotent, as are the `CREATE TABLE` and `CREATE INDEX` statements |
| F7 | The README forbids `apply_migration` on production only. On the clone, `apply_migration` for step 2 would itself write a `20260922040000` row **with** `statements`, so `10` would STOP at (a) and `90` at its statements check. Say explicitly that step 2 on the clone goes through `execute_sql` as one `BEGIN; … COMMIT;` submission, never `apply_migration` | `README.md:16-17,61-62`; `wp/da0.5.md:237-238` | advisory | 1 |**fix round 1: applied.** Clone step 2 in both `README.md` and plan §3.4 now says the migration goes in as one `BEGIN; … COMMIT;` submission through the SQL editor or `execute_sql`, **never** `apply_migration`, with the mechanical reason (it would write a `20260922040000` row carrying `statements`, making `10` STOP at precondition (a) and `90` refuse the row). The `10` header carries the same warning |
| F8 | Scope: §3.6's `vercel.json` cron note, its list of environment-variable names and operator input O-5 are not required by the §5 row. Keep the one-line risk (R5) and drop the paragraph, the variable list and O-5 | `wp/da0.5.md:277-290,440` | advisory | 1 |**fix round 1: applied.** §3.6's `vercel.json` paragraph and its environment-variable list are cut, §3.6 is retitled `00_catalog_check.sql`, operator input **O-5** is removed and the §2.1 `vercel.json` row is dropped. Risk **R5** keeps the point in one sentence |
| F9 | Line citations: the hygiene-log shape is `oux-wp0.4/00_create_hygiene_log.sql:31-42` (not 37–50); the default-ACL note is at `:50-53` (not 45–47) | `wp/da0.5.md:66,133` | advisory | 1 |**fix round 1: applied.** §2.1 now cites `oux-wp0.4/00_create_hygiene_log.sql:31-42` for the log shape; §3.1's default-ACL note now cites `:50-53`. Both scripts cite `:31-42` where they write the log row |

**Deviations from plan (§8), reviewed.** Deviation 1 — the third acceptance criterion split between DA0.5
(measure; 0 wrong links) and DA1.1 / DA1.2 / DA1.4 (fill the null links) — is justified: the 22 + 12 null
links need employer rows that do not exist (Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris,
Boskalis, Heerema, DEME) and the §5 DA1.1 row already names their creation; filling them here would widen the
package and pre-empt Q-E18 (`Technip` 728). Confirmed by the orchestrator's approval condition 2. A second
deviation (types not regenerated) exists but is unrecorded — F5.

**Non-negotiables:** no production write or CLI link by an agent; no personal field in any query or file;
`20260922040000` unedited; no history invented. **Data integrity:** `10` and `90` touch one ledger row (and
the log); the clone apply is atomic and its seed rows are the reference data production holds.

Verdict: **CHANGES REQUIRED** (F1 only; F2–F9 advisory). Round 1, Fable, 2026-09-22.

**Fix round 1 (planner, 2026-09-22): all nine findings applied** — see the Resolution column above and §8 deviation 2. No mutating SQL was run; nothing was committed. Returned for re-review. Fix rounds used: 1 of 2.

**2026-09-22 — Reviewer: Fable, round 2.** Re-read `wp/da0.5.md`, `README.md`, `10_record_ledger_row.sql`
and `90_remove_ledger_row.sql`; `00_catalog_check.sql` confirmed unchanged; `20260922040000` still unchanged
since `afc3eed8`. No SQL run this round; no file edited but this section.

| # | Round-1 finding | Round-2 check | Status |
|---|---|---|---|
| F1 | log optional | `10_record_ledger_row.sql:136-140` precondition (e) STOPs without `public._oux_hygiene_log`; the log `INSERT` at `:152-163` is a bare statement, no `DO`/`IF` wrapper. `90_remove_ledger_row.sql:80-82` same STOP; its `delete` row (`:90-104`) and `rolled_back_at` stamp (`:107-112`) are unconditional; header `:8-9` and `SELECT` comment `:141-142` say `>= 1, never 0`, the `CASE … THEN 0` arm is gone. Plan §3.3 records the 736-row production log; §9.3 pastes the evidence for both projects | **resolved** |
| F2 | `90` precondition ≠ `10` post-state | `90_remove_ledger_row.sql:49-52` presence, `:58-65` refuses `array_length(statements,1) > 0`, `:68-76` requires `name = 'mobilisation_radar'` and reports the name found; `:90-104` `DELETE … AS sm … RETURNING to_jsonb(sm.*)` feeds `before_row`, so the log holds the actual deleted row | **resolved** |
| F3 | newest-version assertion | `10_record_ledger_row.sql:176-192`: the `max(version)` assertion is gone, replaced by exactly-one-row (`:169-174`) plus `(version, name, no statements)` (`:177-185`), with the reason in a comment; `ledger_max_version` is reported only (`:204-205,210`). Precondition (d)'s comment (`:128-131`) now names the four versions the clone lacks and makes no "no gap" claim | **resolved** (one wording residue, A1 below) |
| F4 | clone links "will differ" | Plan §3.4 expected-value table: vessels 1–3 → 726, 4–25 NULL, watch 1 → 726, watch 14 → 737, watch 2–13 NULL, 0 into 787–794; §9.2 records the read-only evidence; clone step 4 now runs K–N and must reproduce §4.3 exactly; `README.md:70-77` carries the same values. Matches my own round-1 check of the clone | **resolved** |
| F5 | types regeneration unrecorded | §8 deviation 2 recorded with justification (CLI/access-token bar; deferred to the operator's D17 fresh-clone step with an explicit safe ref and an expected-empty diff); §4.2 rewritten to match | **resolved** |
| F6 | triggers called non-idempotent | `README.md:29-33` and `10_record_ledger_row.sql:15-19`: only the 27 `CREATE POLICY` fail (42710); triggers, tables, indexes idempotent | **resolved** |
| F7 | `apply_migration` on the clone | `README.md:63-67`, plan §3.4 step 2 and `10_record_ledger_row.sql:20-24`: one `BEGIN; … COMMIT;` submission through the SQL editor or `execute_sql`, never `apply_migration`, with the mechanical reason | **resolved** |
| F8 | scope: `vercel.json`, env-var list, O-5 | §3.6 is now the `00_catalog_check.sql` paragraph only; no `CRON_SECRET`/`NEWSAPI` strings remain; O-5 gone (O-1–O-4 remain); `vercel.json` survives only inside R5's one sentence | **resolved** |
| F9 | line citations | §2.1 cites `oux-wp0.4/00_create_hygiene_log.sql:31-42`; §3.1 default-ACL note cites `:50-53`; both scripts cite `:31-42` | **resolved** |

Remaining findings (none blocking):

| # | Finding | `path:line` | Blocking? | Round | Resolution |
|---|---|---|---|---|---|
| A1 | §3.3's preflight bullet still reads "(d) the baseline row `20260908050000` is in the ledger, so the insert cannot become the newest row over a gap" and does not list precondition (e) — the "no gap" wording the script itself dropped under F3. Reword to the script's own comment (sanity check on the target; the clone legitimately lacks four versions) and add "(e) `public._oux_hygiene_log` present" to the list | `wp/da0.5.md:182-183` | advisory | 2 | applied by the orchestrator (2026-09-22) |
| A2 | §11's row "clone 4" still says `00_catalog_check.sql` A–J (after-forward-1), whereas §3.4 step 4, §4.5 and `README.md:82-86` now require blocks K–N as well. Align the run-sheet record row | `wp/da0.5.md` §11 row "clone 4" | advisory | 2 | applied by the orchestrator (2026-09-22) |

Verdict: **APPROVE WITH ADVISORIES** (A1, A2). Round 2, Fable, 2026-09-22. Approval condition 3 (§7) is
met: no blocking finding remains, so the clone rehearsal may proceed.

---

## 11. Run sheet record

| Step | File | Project | Output | Date | Run by |
|---|---|---|---|---|---|
| clone 1 | `00_catalog_check.sql` A–J, O (before) | clone | matches corrected expectation: A–F, H, I empty; G shows 2 baseline functions; J errors `42P01` (tables absent); O: `tables_present=0`, `ledger_rows=12`, `ledger_max_version=20260917100000` | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 2 | `supabase/migrations/20260922040000_mobilisation_radar.sql` | clone | applied cleanly as one `BEGIN;…COMMIT;` via `execute_sql`, no error | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 3 | `10_record_ledger_row.sql` | clone | matches: `ledger_row_present=t`, `mobilisation_radar`, `ledger_rows=13`, `tables_present=16`, `policies=27`, `triggers=8`, `audit_function_present=t`, `log_rows_written=1` | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 4 | `00_catalog_check.sql` A–J, K–N (after-forward-1) | clone | A–I identical to §9.1 production; J: event tables 0 (vs 19/18/18 on production), seed counts match; K–N: 3 vessels linked / 2 contractors linked / 0 mismatched / 0 synthetic / 4 alias strings missing — matches §4.3 exactly | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 5 | `90_remove_ledger_row.sql` | clone | matches: `ledger_row_present=f`, `tables_present=16`, `log_rows_stamped=1`, `rollback_log_rows=1` | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 6 | `10_record_ledger_row.sql` (after-forward-2) | clone | matches; identical to clone 3's result field for field | 2026-09-22 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 7 | `supabase/migrations/20260923220000_mobilisation_recipients.sql` | clone | applied cleanly, no error | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 8 | `supabase/migrations/20260924010000_mobilisation_signal_schedule.sql` | clone | applied cleanly, no error | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 9 | `12_record_later_ledger_rows.sql` | clone | matches: `rows_20260923220000=1`, `rows_20260924010000=1`, `ledger_rows=16` (14 before + 2; shared-clone drift from a concurrent DA0.3 row, not a script fault), `ledger_max_version=20260924010000`, `recipients_table=t`, `recipients_policies=2`, `signals_new_columns=2`, `arrival_index=t`, `log_rows_written=2` | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 10 | `91_remove_later_ledger_rows.sql` | clone | matches: `rows_present_after=0`, `ledger_rows=14`, `rollback_log_rows=2`, `log_rows_stamped=2` | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| clone 11 | `12_record_later_ledger_rows.sql` (again, clone left forward) | clone | matches; identical to clone 9's result field for field | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| prod 1 | `00_catalog_check.sql` O (before) | production | | | operator |
| prod 2 | `10_record_ledger_row.sql` with `SET LOCAL oux.env = 'production';` | production | | | operator |
| prod 3 | `00_catalog_check.sql` A–J, K–N (after) | production | | | operator |

## 12. Operator decisions received (session, 2026-09-24)

| Input | Decision |
|---|---|
| O-1 | Confirmed: the mobilisation radar in this repository owns the sixteen tables; no other checkout applied a different DDL. The production ledger-row run sheet is unblocked |
| O-4 | Confirmed as accepted by the orchestrator (acceptance split with Phase 1) |

## 13. Later mobilisation migrations (orchestrator, 2026-09-24)

After this plan was written, `main` gained `20260923220000_mobilisation_recipients.sql` (table
`mobilisation_recipients`: two policies, one trigger, RLS, a seed of the admin/user profiles) and
`20260924010000_mobilisation_signal_schedule.sql` (`mobilisation_signals.arrival_at`, `ends_at`, index
`idx_mobilisation_signals_arrival`). Read-only on production the same day: every object of both files is present
(recipients table with both policies by name, the trigger, RLS on, 11 seed rows; both columns; the index), the
radar file is unchanged on `main`, and the ledger still ends at `20260921030000` with 16 rows — the same
outside-the-ledger pattern as the radar file, which is why the catalog summary on production now reads 173 columns
and 34 indexes against the radar file's 171 and 33. The package therefore gains `12_record_later_ledger_rows.sql`
(+ rollback `91_remove_later_ledger_rows.sql`) and the production run sheet becomes P1 → P2 → P2b → P3
(`prod/README.md`). `main` was merged into the branch the same day so the two files exist here and
`pnpm validate:migrations` counts 20. The clone rehearsal of `12` (apply the two files as one submission each, then
`12`, then `91`, then `12`) is recorded in §9.5 when run. Deviation 3, recorded here: the §5 row's "a fresh clone
carries the 16 tables" is now seventeen, and the D17 fresh clone will carry all three ledger rows once P2/P2b have run.

### 11.1 Production run (operator, SQL Editor, 2026-09-24)

| Step | File | Outcome | Values pasted |
|---|---|---|---|
| P1 | `prod/P1_before.sql` | matched | tables 16, columns 173, constraints 72, indexes 34, policies 27, triggers 8, audit md5 `764235c6343f9cc8189502ba271571e5`, recipients_table t / 2 policies, signals_new_columns 2, mobilisation_ledger_rows null, ledger_max_version 20260921030000, ledger_rows 16, vessels 25/3/0/0, contractors 14/2/0/0, alias strings missing 4 |
| P2 | `prod/P2_record_ledger_row.sql` | **committed; matched** except `policies 29` (expected 27): the appended SELECT counts `policyname LIKE 'mobilisation %'`, which since `20260923220000` includes the two recipients policies; the precondition (c) count over the sixteen named tables was 27 and passed | ledger_row_present t, ledger_name mobilisation_radar, ledger_max_version 20260922040000, ledger_rows 17, tables_present 16, policies 29, triggers 8, audit_function_present t, log_rows_written 1 |
| P2b | `prod/P2b_record_later_ledger_rows.sql` | **committed; matched exactly** | rows_20260923220000 1, rows_20260924010000 1, ledger_rows 19, ledger_max_version 20260924010000, recipients_table t, recipients_policies 2, signals_new_columns 2, arrival_index t, log_rows_written 2 |
| P3 | `prod/P3_after.sql` | **matched**: catalog identical to P1 (16 / 173 / 72 / 34 / 27 / 8, same md5); mobilisation_ledger_rows 20260922040000,20260923220000,20260924010000; ledger_max_version 20260924010000; ledger_rows 19; reconciliation 25/3/0/0, 14/2/0/0, 4. **DA0.5 complete on production 2026-09-24.** | |
