# Phase 0 hand-over — operator instructions

Prepared by the orchestrator session on 24 September 2026, branch `claude/determined-hypatia-y2cqau`. Everything
below was produced under the rules in `ORCHESTRATION_PROMPT.md`: nothing was written to production; every
production change is a run sheet you execute; every script was rehearsed on the 12 September clone
`yqjkuobcawvigsfpgrcm` (with the one exception in §1). The ledger is `PROGRESS.md`; per-package evidence is
`wp/da0.1.md`, `wp/da0.2.md`, `wp/da0.3.md`, `wp/da0.5.md`.

## 0. Where Phase 0 stands

| Package | State | Evidence |
|---|---|---|
| DA0.1 Baseline profile | complete | `wp/da0.1.md`: pack on production and clone; every plan §1.1 count reproduced or explained; production `workers_active` 5,749 |
| DA0.2 Remove the synthetic dataset | forward and rollback both proven on the clone (24 Sep): forward matched every prediction, rollback restored every data row byte for byte | `wp/da0.2.md` §9–§11 |
| DA0.3 Stop the bleed | code complete, two Fable reviews, migration on normal dev and rehearsed on the clone forward → back → forward; page at `/name-reviews` | `wp/da0.3.md` §9–§11 |
| DA0.4 Workstream set-up | complete | `PROGRESS.md`, `wp/README.md` |
| DA0.5 Vessel-tracking schema | ready: the committed migration equals production's catalog (377 objects, 0 differences); the production change is a ledger row only; rehearsed on the clone | `wp/da0.5.md` §9–§11 |

Commits on the branch: `74e6e48f` (DA0.4), `a8d4f73e` (DA0.1), the DA0.5 commit, `80fdb95e` (DA0.3), `d23c066a` (DA0.2),
plus this hand-over. No pull request was opened (none was requested); the branch is pushed.

## 1. Decisions you must give before anything runs on production

Answer these in the session (or by editing the plan files' §5 tables); the run sheets are gated on them.

| # | Question | Where recorded | Default if you say nothing |
|---|---|---|---|
| DA0.2 P7 | Authorised 24 Sep; the rollback then needed three more fix rounds (reinsert order, a cast, deferred constraints) and passed on the clone the same day. | `wp/da0.2.md` §5, §9–§10 | done |
| DA0.2 P1 | Confirmed 24 Sep: the 304 `member_number` values are synthetic. | `wp/da0.2.md` §12 | done |
| DA0.2 P2 | Confirmed 24 Sep: 681, 1537 and 1541 are synthetic. | `wp/da0.2.md` §12 | done |
| DA0.2 P6 | The ten roles are every role row touching the synthetic entities (listed in `wp/da0.2.md` §12); the plan's 11 was a miscount. | `wp/da0.2.md` §12 | proceed on 10 (acknowledged 24 Sep) |
| DA0.5 O-1 | Confirmed 24 Sep. | `wp/da0.5.md` §12 | done |
| DA0.5 O-4 | Accept that DA0.5 measures the employer links and proves none wrong; the 22 + 12 null links are filled in Phase 1. | `wp/da0.5.md` §4.4 | accepted by the orchestrator |
| DA0.3 §5 items 1–9 | Wizards read-only for names; admin-block nav; synthetic fixture; dev + clone applies (done); campaign-import path to DA4.2; worksite CHECK widened; back-fill fills null FKs only; sticky `rejected`; one `import_logs` row per file. | `wp/da0.3.md` §7 | as decided by the orchestrator |

## 2. How every SQL Editor submission works (read once)

1. Open the Supabase dashboard → project → **SQL Editor**, signed in as the project owner (the `postgres` role).
2. Paste **one file per submission**, unmodified, from the committed path named in the step.
3. The `prod/` files already contain the production guard line (`SET LOCAL oux.env = 'production';` after `BEGIN;`),
   so nothing needs editing. Never paste a `prod/` file into the clone or dev.
4. The editor shows only the **last** statement's result. Every file under a package's `prod/` folder returns exactly
   one result row, and that row is what you paste back. Use the `prod/` files; the parent-folder scripts are the
   committed sources they were generated from.
5. If a submission errors, the transaction has already rolled back; nothing changed. Paste the error verbatim and stop.
6. Never use the connector's `apply_migration`, `supabase db push` or any `supabase` CLI command against production for
   these files. The migrations are applied by pasting the file as one `BEGIN; … COMMIT;` submission and then inserting
   the ledger row as its own statement (the WP3.8 mechanism).

## 3. Production run sheets, in order: DA0.2 → DA0.5 → DA0.3

Do them in a quiet window (DA0.2's assertions are strict; a concurrent write aborts it harmlessly) and before the next
weekly membership batch, so the baseline of 5,749 active workers still applies. Paste each result into the session
before the next step; the orchestrator (or you) records it in the package's `wp/*.md` §11.

### 3.1 DA0.2 — remove the synthetic dataset (P1, P2, P6, P7 answered 24 Sep; rollback proven on the clone)

Ready-to-paste files in `scripts/data-hygiene/da0.2/prod/`. Quiet window; before the next weekly batch.

| Step | File | Expect |
|---|---|---|
| P1 | `P1_preflight_before.sql` (read-only, about 250 rows) | E Σ 3119 rows / 72 tables; F Σ 16; G BLOCKER Σ 2 (worker 1536 only); scope md5 `f6589df6e2507a35542632026c3d0c34`; `workers_active` 5749. Any other BLOCKER row or a different md5: stop |
| P2 | `P2_remove_test_dataset.sql` (mutating, one transaction) | `workers_active 5085, workers_total 5900, campaigns_15_37 0, employers_787_794 0, worksites_196_199 0, roles 0, w1536 'emp=741 ws=185 cwm=50', test_worksite_cluster 0, log_rows_pending 3139, snapshot_rows_logged 3138`. Anything else: run `PX1_rollback.sql` and report |
| P3 | `P3_preflight_after.sql` (read-only) | entities gone; every campaign checksum other than 15/37/64 identical to P1; 64 has one membership fewer |
| P4 | the profiling pack `scripts/data-hygiene/oa-universe/00`–`07` (read-only) | `workers_active 5085`; `05` shows no `test` worksite cluster. Paste into `wp/da0.2.md` §11 |

Keep the hygiene-log rows for at least 30 days (WP0.4 retention rule): `PX1_rollback.sql` restores everything from
them until they are cleaned up.

### 3.2 DA0.5 — record the vessel-tracking migration in the ledger (O-1 confirmed 24 Sep)

Ready-to-paste files in `scripts/data-hygiene/da0.5/prod/` (the `SET LOCAL` line is already in the mutating file; each
file returns one row). Run in order, paste each row back before the next:

| Step | File | Expect |
|---|---|---|
| P1 | `P1_before.sql` (read-only) | tables 16, columns 173, constraints 72, indexes 34, policies 27, triggers 8, function md5 `764235c6…`, recipients table t with 2 policies, signal columns 2, `mobilisation_ledger_rows` NULL, ledger max `20260921030000`, ledger rows 16, vessels 25/3/0/0, contractors 14/2/0/0, 4 alias strings missing |
| P2 | `P2_record_ledger_row.sql` (mutating: one ledger row) | `ledger_row_present t, ledger_name mobilisation_radar, ledger_rows 17, tables_present 16, policies 27, triggers 8, audit_function_present t, log_rows_written 1` |
| P2b | `P2b_record_later_ledger_rows.sql` (mutating: two ledger rows) | `rows_20260923220000 1, rows_20260924010000 1, ledger_rows 19, log_rows_written 2` |
| P3 | `P3_after.sql` (read-only) | as P1 except `mobilisation_ledger_rows` = the three versions, ledger max `20260924010000`, ledger rows 19 |

Three rows, not one: after the DA0.5 plan was written, `main` gained two further mobilisation migrations
(`20260923220000_mobilisation_recipients.sql`, `20260924010000_mobilisation_signal_schedule.sql`) whose objects are
already live on production without ledger rows (checked read-only 24 Sep), the same pattern as the radar file. None
of the three migration files is ever submitted to production (their `CREATE POLICY` statements would fail and the
recipients seed would re-add removed people).

### 3.3 DA0.3 — stop the bleed (migration, then merge, then the next weekly batch)

Ready-to-paste files in `scripts/data-hygiene/da0.3/prod/`. The two contract suites and the preview replay
(`PROGRESS.md` human tasks) are optional extra evidence; the migration and code are fully rehearsed.

| Step | File | Expect |
|---|---|---|
| P1 | `P1_preflight_before.sql` (read-only) | employers 187 / worksites 194 with md5s; aliases merge 39 / import 8; DA0.3 objects absent; raw columns 0 |
| P2 | `P2_migration.sql` (the migration + ledger row, one transaction) | one row: `20260922120000 / da0_3_name_match_reviews / t / t / t / 3` |
| P3 | `P3_preflight_after.sql` (read-only) | same counts, md5s and view md5s as P1; objects present; both CHECKs `merge, manual, import, oa_universe, fwc` |
| 4 | Merge the branch into `main` (open the pull request from `claude/determined-hypatia-y2cqau`); the gen-types workflow regenerates `packages/db-types/generated.ts` from production (expected no diff) | Vercel Production green; `/name-reviews` in the admin block |
| 5 | Import the next weekly membership batch as usual, then run `P3_preflight_after.sql` again | queue rows in `name_match_reviews`; employers/worksites md5 unchanged since P3 (Phase 0 exit criterion). Work the queue at `/name-reviews` |

### 3.4 Phase 0 exit check

Run the pack `00`–`07` on production once more: `workers_active` 5,085, no `test` cluster, employers and worksites
unchanged by the weekly batch. Paste into `PROGRESS.md` "Phase exits".

## 4. Setting up the fresh production-shaped clone (decision D17) — DONE 24 Sep: `plbldfctqhnbyrsypuri`; display name `OA_clone_2`; steps 3–6 done by the orchestrator; step 7 (pause the old clone) remains

Do this **after** §3.1–§3.3 have landed on production, so the clone carries the synthetic removal, the vessel-tracking
ledger row and DA0.3's migration. The agent never clones production.

1. **Create the project from a production backup.** Supabase dashboard → project `gteygwfgjvczanmrwgbr` → **Database → Backups** (or **Point in Time** if you prefer a timestamp) → **Restore to a new project**. Name it `offshore-alliance-da-phase1-rehearsal`, region `ap-southeast-2` (the same as production), the same Postgres major version. This is how the 12 September clone was made. Wait until the new project is `ACTIVE_HEALTHY`.
2. **Isolate it.** In the new project: do not connect it to Vercel, GitHub, cron, webhooks or any messaging or AIS credential (`PROGRESS.md` standing note; the mobilisation pollers write with the service-role key and must never point here). Do not create a Vercel integration for it. Keep its service-role key out of every `.env` file.
3. **Mark it as a clone.** SQL Editor → paste `scripts/data-hygiene/oux-wp2.1/01_environment_marker.sql` with the line `SET LOCAL oux.marker_env = 'clone';` inserted immediately after `BEGIN;`. Expect one row `clone | <now>`. From then on every run sheet's guard accepts the clone without any `SET LOCAL oux.env` line.
4. **Confirm the audit table.** `SELECT to_regclass('public._oux_hygiene_log');` → `_oux_hygiene_log` (it comes with the backup; if the backup pre-dates §3.1, the DA0.2 log rows are absent, which is fine).
5. **Confirm the ledger.** `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;` → ends `20260921030000 membership_updates, 20260922040000 mobilisation_radar, 20260922120000 da0_3_name_match_reviews` (18 rows). If a row is missing, the backup predates that run sheet: take a newer backup rather than replaying files by hand.
6. **Run the pack** `scripts/data-hygiene/oa-universe/00`–`07` on the new clone and on production, one statement at a time, and compare `00`: every count must match (the weekly batch may move `workers`, `campaign_worker_membership` and `campaign_worker_ou` between the two reads; note the difference). Tell the session the new ref; it records the ref and the comparison in `PROGRESS.md` (standing notes and D17) and in `docs/organiser-ux-review/PROGRESS.md`.
7. **Retire the 12 September clone** `yqjkuobcawvigsfpgrcm` once the comparison is recorded: pause it in the dashboard first (Project settings → General → Pause project); delete it only after the UX programme confirms WP2.5 has not started on it.
8. **Types (optional check):** `SUPABASE_PROJECT_REF=<new ref> pnpm gen:types` from a checkout that has a Supabase access token, then `git diff packages/db-types/generated.ts` — expected empty (DA0.5 deviation 2 and DA0.3's hand-added types). A non-empty diff is a finding for the session, never an edit of an applied migration.

## 5. Other human tasks recorded in the ledger

- Supply `OUX_CONTRACT_*` (dev) and `E2E_USER_*` accounts for DA0.3's contract suites and the preview replay.
- Action Network: the 664 synthetic workers had 386 tag rows; nothing outside the database is touched by DA0.2 —
  remove their Action Network records separately if any exist.
- The `MMA` / `IAS Group` / `Rigforce` / `Technip` questions and the null vessel links belong to Phase 1 (DA1.1, DA1.2,
  DA1.4), as recorded in `PROGRESS.md` incidental findings.

## 6. What the next session does

With P7 answered and §3 complete, the next orchestrator session starts Phase 1 (DA2.1's migration, then DA1.1's
employers round) against the fresh clone, per `ORCHESTRATION_PROMPT.md` "Dependency summary".
