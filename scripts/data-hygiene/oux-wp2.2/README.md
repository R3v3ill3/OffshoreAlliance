# OUX WP2.2 data hygiene, recovery and probe scripts

Operator-reviewed SQL artefacts for the WP2.2 structure API
(`docs/organiser-ux-review/wp/wp2.2.md`). They are not migrations. Execute
them only under explicit operator authorisation for the named environment and
exact step. They print only aggregates, database identifiers and structural
fields; they never select names or contact details. Plain SQL, no psql
meta-commands, explicit `BEGIN;`/`COMMIT;` (unlike the migrations, which the
Supabase CLI wraps itself), one file per submission with stop-on-error.

**Status (Stage 1):** every file here has been written but has NOT been executed
against any database. The first execution is Stage 2 on normal dev after
operator approval; the optional clone pass is wp2.2.md §0 step 5 / §4.4.

## Environment guard and the production line

Every mutating file starts with `BEGIN;` immediately followed by the same
guard the WP2.1 scripts use: it refuses to run unless
`public._oux_env_marker` is a valid clone/dev singleton
(`oux-wp2.1/01_environment_marker.sql`) **or**
`current_setting('oux.env', true) = 'production'` in the same transaction.

Production has no marker. For a production run the operator inserts

```sql
SET LOCAL oux.env = 'production';
```

immediately after **every** `BEGIN;` of the mutating file, in the same
submission. The committed files deliberately omit that line and contain no
project reference. `95_role_probes.sql` always rolls back and, like
`oux-wp2.1/95_role_probes.sql`, has no marker guard.

## Files and what each prints

| File | Purpose | Prints |
|---|---|---|
| `10_materialise_employer_placements.sql` | **M2-a** (wp2.2.md §3.7). Calls `public.structure_materialise_employer_placements(campaign_id)` for every campaign. Runs as `postgres` (or `service_role`): the RPC's permission pre-check admits an RLS-bypassing session without a JWT (`oux_internal.structure__assert_can_write`, deviation D1). An `authenticated` session is refused per campaign by the same pre-check. Stops (raises, nothing committed) when any worker's worksite-child placements span more than one Employer container in a campaign (**stop condition wp2.2.md §8.4 item 4**), or when the total placement count does not equal before + inserted. Idempotent: a re-run prints `inserted = 0` for every campaign. | Per campaign: placements before, after, inserted, skipped_existing, containers, multi_container_workers; a `TOTAL` row; H9 partitions before/after. |
| `20_relabel_unattributed_rule_rows.sql` | **R1-b** (wp2.2.md §3.8). `UPDATE campaign_worker_ou SET assignment_source = 'universe' WHERE assignment_source = 'rule' AND assigned_rule_id IS NULL`, logging every row to `public._oux_hygiene_log` (WP0.4 shape: script/action/table_name/row_pk/before_row/after_row/note) so the change is auditable and reversible. Requires WP2.2a (the widened CHECK) and the hygiene log table. Idempotent: a re-run updates and logs 0 rows. | rule-with-null-rule-id count before/after, universe count before/after, rows logged. |
| `90_rollback_wp2_2_structure_api.sql` | Recovery-only rollback of WP2.2a. Refuses to run while the WP2.2b objects exist (run `91` first). Unconditionally drops the 17 public `structure_*` RPCs, the `oux_internal` helpers and the schema and restores the baseline `check_no_worker_on_group_container()` body verbatim. Restores the two-value CHECK **only** when no `assignment_source = 'universe'` row exists; otherwise it emits a NOTICE with the count and leaves the three-value CHECK in place (reverse `10`/`20` by hand first if the two-value CHECK must come back; no automated reversal is provided). Migration-history repair is a separate operator command, not part of this file. | object counts before/after; the CHECK definition after; the number of universe rows that blocked the CHECK restore (0 = restored). |
| `91_rollback_wp2_2_enforcement.sql` | Recovery-only rollback of WP2.2b: drops `campaign_group_membership`, restores the WP2.1 derive-only `cwo_set_group_id()` verbatim, drops the unique index, recreates the non-unique `idx_cwo_worker_group` with its WP2.1 comment. | index/view/function state before/after. |
| `95_role_probes.sql` | Grant and RLS probes for the structure API; **always rolls back**. Asserts: no `structure__*` helper exists in `public`; `anon` cannot execute any `structure_*` RPC or any `oux_internal` helper and has no USAGE on the schema; `authenticated` can execute every public RPC on a campaign it created (a permission failure inside is `42501` from the pre-check, not a missing grant); `authenticated` gets `42501` from the pre-check on a campaign it cannot write to; `authenticated` holds nothing on `oux_internal` beyond USAGE + EXECUTE (no CREATE, no relations). Requires at least one `user`-role profile and one worker row. | `PASS`/`FAIL` notices and a final labelled result set. |

## Run order

### Normal dev (Stage 2 / Stage 3)

1. `20260914090000_wp2_2_structure_api.sql` (WP2.2a), applied as one
   submission (`BEGIN;` + exact file + `COMMIT;` + read-only check) in the dev
   SQL Editor or by `psql -1 -v ON_ERROR_STOP=1 -f`, then the ledger row
   `20260914090000 wp2_2_structure_api` inserted into
   `supabase_migrations.schema_migrations`. **Do not `supabase db push` while
   2.2b is also pending in the folder** — push applies every pending file and
   2.2b must wait for the writer switch (Stage 6). Done 2026-09-14
   (wp2.2.md §9.2).
1a. `oux-wp2.1/01_environment_marker.sql` with `SET LOCAL oux.marker_env = 'dev';`
   after `BEGIN;` (dev has no marker; `10`/`20` refuse without it).
2. `95_role_probes.sql` (rolls back).
3. Contract suite (`pnpm test:contract`, env in the shell only) — Stage 3.
   Required: `OUX_CONTRACT_SUPABASE_URL`, `_ANON_KEY`, `_USER_EMAIL`,
   `_USER_PASSWORD`, `OUX_CONTRACT_FOREIGN_CAMPAIGN_ID` (a dev campaign the
   user cannot write to — the e2e `E2E_FOREIGN_CAMPAIGN_ID` campaign
   qualifies). Optional pair `OUX_CONTRACT_FOREIGN_USER_EMAIL`/`_PASSWORD`
   (both or neither; one alone throws). **The Stage 3 paste must report the
   skipped count** — the only skip the suite can produce is the foreign-user
   test, and its name says why.
4. `10_materialise_employer_placements.sql`, then re-run it (expect `inserted = 0`).
5. `20_relabel_unattributed_rule_rows.sql`.
6. `oux-wp2.1/00_preflight_hazards.sql`; `oux-wp2.1/03b_…` only if H9 > 0.
7. `20260914090100_wp2_2_one_unit_per_group_enforcement.sql` (WP2.2b), same
   mechanism as step 1 (one submission, then its ledger row), only after the
   Stage 6 writer switch is on the branch preview: other branches' previews
   share dev and still run the legacy writers.
8. Contract suite again (enforcement-agnostic; both runs pasted in wp2.2.md §9.2).

### Clone (optional, wp2.2.md §0 step 5 / §4.4)

`oux-wp2.1/00_preflight_hazards.sql` → WP2.2a forward → `90` → WP2.2a forward →
`10` (then re-run) → `20` → `oux-wp2.1/03b` if H9 > 0 → WP2.2b forward → `91` →
WP2.2b forward → contract suite (if credentials) → `95`. Relink the CLI to
normal dev immediately afterwards; `git status` must show no `supabase/.temp/*`
change.

### Production (operator only; wp2.2.md §0 step 6 / §6.4)

One checklist, each output pasted before the next file is handed over:
WP2.2a (run sheet: `SET LOCAL oux.env = 'production';` after every `BEGIN;`
of a mutating file, a read-only verification `SELECT` after the final
`COMMIT;`) → operator merges PR #41 (code deploy) → `10` → `20` →
`oux-wp2.1/00_preflight_hazards.sql` → `oux-wp2.1/03b` only if H9 > 0 →
`oux-wp2.1/04_postflight_hazards.sql` (BEFORE 2.2b: it asserts the deferred view
and unique index are absent and stops otherwise, wp2.2.md D27) → WP2.2b (its
post-assertions are the WP2.2b postflight) → read-only WP2.2b check.

**Never run `supabase db push` from this checkout** (wp2.2.md Stage 7 review, A7):
`supabase/.temp/project-ref` is tracked in git and names **production**
(`gteygwfgjvczanmrwgbr`), so wp2.2.md §5's project-ref precondition fails on a
fresh clone, and a `db push` without relinking would push **both** pending
files — 2.2a and 2.2b — to production in one go, breaking the order above
(2.2b only after the code deploy and `04_postflight`). Production receives one
file at a time through the SQL Editor, as the checklist says.

## Rollback order

1. `91_rollback_wp2_2_enforcement.sql` (only if WP2.2b was applied).
2. Reverse `20`/`10` by hand if the two-value CHECK must come back (`90` otherwise leaves the three-value CHECK and says so). `10`/`20` are never reversed automatically.
3. `90_rollback_wp2_2_structure_api.sql`.
   A later re-forward of WP2.2a after a `90` that left the three-value CHECK in place is supported: 2.2a's section 1 detects an already-widened CHECK (exactly `manual, rule, universe`) and skips the drop/add with a NOTICE, and its precondition accepts `universe` rows; any other CHECK shape still stops it.
4. Migration-history repair (separate, explicitly approved command).

## Never on production

- `oux-wp2.1/01_environment_marker.sql` (creates the clone/dev marker).
- Any file without the `SET LOCAL oux.env = 'production';` line added by the
  operator at run time.
- The contract suite (`pnpm test:contract`) — it throws on the production host.
- Anything run by the agent: the agent never links to or queries production.
