# DA0.3 — Stop the bleed: scripts

Package: `docs/data-architecture/wp/da0.3.md` (approved §7); specification in
`docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md` §5 row DA0.3 (line 381) and
`docs/data-architecture/ORCHESTRATION_PROMPT.md` line 175. Run-sheet style follows
`scripts/data-hygiene/oux-wp3.8/README.md`.

Operator-reviewed SQL artefacts. They are **not** migrations: never copy them under
`supabase/migrations/` and never run them with `supabase db push` (no `supabase` CLI command is run
from this checkout). Execute each only under explicit operator authorisation for the named
environment and exact step, one file per submission, output pasted before the next. Mutating files
start with `BEGIN;` and the WP2.1/2.2 environment guard: they refuse to run unless
`public._oux_env_marker` is a valid clone/dev singleton **or** `current_setting('oux.env', true) =
'production'` in the same transaction (`20` and `92` admit clone/dev only). Production has no
marker; the operator adds `SET LOCAL oux.env = 'production';` immediately after **every** `BEGIN;`
in the same submission. The committed files omit that line and name no project. Run as `postgres`,
never through the connector's `apply_migration` on production.

No file here reads or writes a person's data: the fixture and the rehearsal use `Fixture` /
`Person <n>` / `da03-<n>@example.invalid`; the logs carry organisation strings and ids only.

| File | Kind | Where it runs |
|---|---|---|
| `00_preflight.sql` | **read-only**, no guard, no `BEGIN`. One row: employers / worksites count + md5, alias counts by source and max(id), workers with the DA0.3 raw columns, the DA0.3 objects, both alias CHECK texts, `name_match_reviews` by status, md5 of the four reviewer-checklist views, the ledger row. Works before and after the migration | every environment, before and after every step below |
| `01_export_reference_lists.sql` | **read-only**: the employer and worksite reference lists with aliases as two json columns (organisation strings only) → `fixtures/reference_employers.json`, `reference_worksites.json` | production (agent, D0 read-only) — run 2026-09-22 |
| `../../../supabase/migrations/20260922120000_da0_3_name_match_reviews.sql` | **migration** (schema + two functions; no application row changed): alias CHECKs widened, `fold_name()`, `name_match_reviews`, `decide_name_match()`, three `workers` columns. Idempotent | dev (agent, §7 input 4: one `BEGIN; … COMMIT;` submission + the ledger row `('20260922120000','da0_3_name_match_reviews')` as its own statement) → clone (rehearsal, verifier) → production (operator run sheet) |
| `20_rehearse_decisions.sql` | mutating, **clone only**: one rehearsal `import_logs` row, six synthetic workers, six queue rows; `decide_name_match()` confirm / reopen / reject / override / create / reject and the "already exists" error; the admin gate as a user-role account; everything logged to `public._oux_hygiene_log` (`script = 'da0.3/20'`). Impersonates the first admin for the transaction via `set_config('request.jwt.claims', …)`; no id in the file | clone (verifier). Rehearsed on dev inside a rolled-back transaction by the implementer (plan §11) |
| `91_clear_da0_3_data.sql` | mutating: reverses `20` or an application replay — queue rows, post-migration aliases, synthetic workers, the raw columns on every worker, the rehearsal / replay import logs, the rehearsal-created rows; stamps `20`'s log rows `rolled_back_at`. **Requires** `SET LOCAL da03.ws_alias_max_id_before = '<n>';` after `BEGIN;` (the `ws_alias_max_id` `00` printed before the migration) so pre-existing worksite `import` aliases survive; STOPs without it | clone (rehearsal), dev (after the e2e replay if `92` is not enough) |
| `90_rollback_da0_3_name_match_reviews.sql` | schema rollback of the migration; **STOPs** while any queue row, any worker raw column or any alias outside the baseline vocabulary exists (run `91` first — it never silently drops data); restores both CHECKs to the baseline vocabularies and compares the admitted values (the constraint text differs by Postgres version). The ledger repair `DELETE … WHERE version = '20260922120000'` is quoted in the header, never executed | clone (rehearsal: forward → `91` → `90` → forward again); recovery only elsewhere |
| `92_remove_fixture_workers.sql` | mutating, dev: removes the e2e replay's rows — its `import_logs` rows (`file_name = 'replay_status_sync.xlsx'`), their queue rows, the aliases that account wrote since the replay, the synthetic workers (`reference_id LIKE 'DA03-%'`); logged | dev, after each replay |
| `fixture-lib.ts`, `build-fixture.ts`, `fixtures/` | the replay fixture (plan §3.4): production reference lists + `variants.json` → `replay_status_sync.xlsx` (2,400 rows, status-sync layout, synthetic people) and `expected.json` (the harness's counts). Rebuild from `apps/organising-db`: `pnpm exec tsx ../../scripts/data-hygiene/da0.3/build-fixture.ts`. Asserted by `apps/organising-db/src/lib/import/__tests__/replay-fixture.test.ts` | committed; no database access |

## Run order

### Normal dev (done by the implementer, 2026-09-22, plan §11)

1. `00` (before).
2. The migration as one `BEGIN; … COMMIT;` submission, then the ledger row as its own statement.
3. `00` (after): objects present, `employers` / `worksites` md5 unchanged, the four view md5s unchanged.
4. REST probes P1–P8 with the anon key (plan §9); `20`'s body inside `BEGIN; … ROLLBACK;` (no residue).
5. Later (operator): the contract suite `pnpm test:contract src/lib/import/__contract__/name-match-reviews.contract.test.ts`
   with `OUX_CONTRACT_*` in the shell, the e2e replay of `fixtures/replay_status_sync.xlsx` through the
   membership wizard as `status_sync` on the dev-backed preview, then `92`.

### Clone `yqjkuobcawvigsfpgrcm` (rehearsal, verifier; plan §3.2)

`00` (before) → migration + ledger row → `00` (after-forward-1) → harness test locally → `20` → `00` →
`91` (with `SET LOCAL da03.ws_alias_max_id_before = '<n>'` from the first `00`) → `00` (data cleared;
`employers` / `worksites` md5 identical to before) → `90` → `00` (after-rollback: identical to before) →
ledger repair `DELETE` as its own approved statement → migration + ledger row again → `00`
(after-forward-2 identical to after-forward-1) → `20` → `91` → leave the clone forward.
No prerequisite migration is applied to the clone (plan §2.3.6: the file depends on baseline objects only). The clone's ledger max is `20260922040000` since DA0.5's rehearsal (review A4); that changes nothing here.

### Production (operator only; plan §3.3)

`00` → `BEGIN; SET LOCAL oux.env = 'production'; <migration>; <ledger row>; COMMIT;` → `00` → merge the PR →
types regenerate → the next weekly batch goes through the new path → `00` shows queue rows and 0 new
employers / worksites since the run. No data run sheet: the package changes no existing row.

## Notes

- Risk R2 (plan §6): after (a) the reference wizard's employer aliases save. Do not run the reference
  wizard's washing rounds until DA1.1's adjudication lands; the decision function's ambiguity guard
  refuses a second target for a folded alias in the meantime.
- `91` is a Phase 0 tool: it treats every `oa_universe` / `fwc` alias as post-migration (true until the
  DA3.x loads).
