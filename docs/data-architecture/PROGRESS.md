# Progress ledger — OA Universe alignment (data architecture)

Orchestration of `OA_UNIVERSE_ALIGNMENT_PLAN.md` (22 September 2026) under `ORCHESTRATION_PROMPT.md`. One row per
work package. Structural decisions are the plan's §6 (D0–D17); row-level decisions are the worksheets under
`worksheets/`; per-package plans, verification output and reviewer findings are in `wp/<wp-id>.md` (convention in
`wp/README.md`).

Status key: **not started** · **blocked (D-n)** · **planning** · **approved** · **implementing** · **verifying** ·
**in review** · **ready for run sheet** · **handed over** (operator runs it) · **on production** · **complete**.

## Standing notes

- **Inherited from the organiser UX programme** (`docs/organiser-ux-review/PROGRESS.md` standing notes, all of them):
  the promotion gate, the three Supabase projects, the PostgREST-proof rule, the lint baseline (298: 146 errors /
  152 warnings on `main` at `e2cf34a2`), never `supabase` CLI from this checkout, never `pnpm dev` / `pnpm start`,
  never commit `supabase/.temp/*`, never edit an applied migration, types only with an explicit safe ref.
- **Production `gteygwfgjvczanmrwgbr` is read-only for agents** (decision D0: the profiling pack and equivalent
  SELECT-only, PII-free queries). Every production change is an operator run sheet in the oux-wp3.8 style.
- **Clone `yqjkuobcawvigsfpgrcm`** (`offshore-alliance-wp21-rehearsal`, 12 September): the Phase 0 rehearsal
  target. Read-only check 2026-09-22: `_oux_env_marker` and `_oux_hygiene_log` present; 2,407 workers (2,293
  active), 171 employers, 174 worksites, 22 campaigns; no `vessels` or `mobilisation_*` tables. Its migration ledger
  ends at `20260917100000_wp3_8_campaign_families` and lacks `20260914090000` / `20260914090100` (WP2.2a/b: apply
  only under their own run sheet, per the UX ledger), `20260918120000_email_draft_attachments`,
  `20260921030000_membership_updates` and `20260922040000_mobilisation_radar`. Owner of the clone at the time of
  writing: this workstream (Phase 0 rehearsals); the UX programme's WP2.5 has not started.
- **Normal dev `dpnnmkhabysfdogllsyh`**: read freely; mutate with the operator's approval per file.
- **Branch (deviation from the prompt's `feat/da-<wp-id>-<slug>` rule):** this session is bound to
  `claude/determined-hypatia-y2cqau` by the harness and may not push elsewhere, so every Phase 0 package is
  committed there, one commit per completed package, and the operator opens pull requests from it (none is opened
  by the agent unless asked). The docs branch `claude/data-architecture-cleaning-plan-3ib8jt` (plan, worksheets,
  pack) was merged into it at `02c58444`.
- **Commands:** from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`; root: `pnpm validate:migrations`;
  contract suite `pnpm test:contract` on dev when a PostgREST string changes.
- **Sub-agent rule:** every sub-agent receives the plan's §5 row verbatim and the sections it needs; the same agent
  never both implements and reviews; Fable reviews anything touching the database, worker data, merges, imports or
  the structure API.

## Decision register (from plan §6, as at 2026-09-22)

| # | Subject | Status |
|---|---|---|
| D0 | Read-only profiling on production by agents | Decided |
| D1 | Extend existing tables, no parallel model | Decided |
| D2 | Lineage-A rows merge into the legal employer; facility and scope onto the agreement | Decided, amended |
| D3 | Restore Monadelphous and Programmed agreement-holding subsidiaries | Decided |
| D4 | Remove the April synthetic dataset | Decided; identity confirmed 22 Sep |
| D5 | Imports stop auto-creating; unmatched names queue with search-and-map before create | Decided |
| D6 | `engagements` evolves `worksite_contracts` | Decided |
| D7 | Scope taxonomy: map's 14 scopes on top of `work_scopes`; `sectors` stays | Decided |
| D8 | Two operator roles per worksite with dates | Decided |
| D9 | Placeholders retired; coverage areas and fleets as grains; fleets hold vessels | Decided, amended |
| D10 | Patch model with overlaps allowed; allocation logic deferred to DA5.2 | Decided in principle |
| D11 | Universe boundary: Wandoo and Qube in, Alkimos out; rest row by row | Decided |
| D12 | `MMA` alias unwound; IAS and Rigforce stay merged, 827 and 798 merged in | Decided, corrected |
| D13 | Confidence H/M/L and source vocabulary | Decided |
| D14 | Coordinate `unit_basis.engagement_id` with WP2.7 | Decided |
| D15 | Ownership of the sixteen vessel-tracking tables | **Answered by the repository on 2026-09-22 (pending operator confirmation, see below)** |
| D16 | Worker 1536 kept, re-pointed to AWU WA Branch (741) / AWU Head Office (185); out of campaign 64 | Decided |
| D17 | Fresh clone after Phase 0; re-created at each phase boundary; old clone retired then | Decided |

**D15 finding (orchestrator, 2026-09-22, read-only):** the vessel-tracking module is the mobilisation radar merged
to `main` at `afc3eed8` ("Add a mobilisation radar for North-West Australia vessel early warning", 22 Sep 02:28 UTC)
with migration `supabase/migrations/20260922040000_mobilisation_radar.sql` (766 lines; `CREATE TABLE IF NOT EXISTS`
for `vessels`, `geofences` and the fourteen `mobilisation_*` tables) and the app code under
`apps/organising-db/src/lib/mobilisation/` and `src/app/(dashboard)/mobilisation/`; `packages/db-types/generated.ts`
already carries the tables (`014e607d`). So no other repository owns the schema: this ledger does. However, the
production migration ledger (`supabase_migrations.schema_migrations`, read 2026-09-22) ends at
`20260921030000_membership_updates` and has **no row for `20260922040000`**, although the tables exist and hold data
(plan §1.11). DA0.5 therefore takes the in-repository shape: prove the committed file reproduces production's DDL,
record the ledger row on production by run sheet, and apply the file to the clone. The operator is asked to confirm
that no other checkout applied a different version of the DDL.

## Ledger

| WP | Title | Status | Branch | PR | Verification | Open risks | Decisions consumed |
|---|---|---|---|---|---|---|---|
| DA0.1 | Baseline profile (pack on production and the clone) | **complete 2026-09-22** (`a8d4f73e`): pack run statement by statement on production (read-only, D0) and the clone; every §1.1 count reproduced or explained (`campaign_worker_membership` 3,456 vs 3,415 is sync-on-open drift); `00` made clone-safe (`membership_update_batches` moved to `00b`, `occupation_groups` added) | `claude/determined-hypatia-y2cqau` | | `wp/da0.1.md` §2–§6: production `workers_active` 5,749, employers 187, worksites 194, campaigns 24; clone 2,293 / 171 / 174 / 22; `test` worksite cluster 196–199 on both | Clone lacks the lineage-C rows and two campaigns (predates the September sync) | D0 |
| DA0.2 | Remove the synthetic dataset | planning | `claude/determined-hypatia-y2cqau` | | | 664 workers and cascaded rows; rollback must reinsert exactly | D4, D16 |
| DA0.3 | Stop the bleed (alias check, one resolution path, review queue, raw names) | **code complete and reviewed 2026-09-24; clone rehearsal pending** (after DA0.2's). Plan `wp/da0.3.md` approved with the nine §5 decisions; migration `20260922120000_da0_3_name_match_reviews.sql` (both alias CHECKs widened; `name_match_reviews`; `fold_name()`; `decide_name_match()`; raw-name columns on `workers`) applied to normal dev with its ledger row; `@oa/employer-matching` gains `proposeNameMatch`; single resolution path (`lib/import/resolve-names.ts`, `POST /api/import/resolve-names`) in both wizards and the weekly update; three matchers and both client insert paths removed; Name Reviews page at `/name-reviews` (admin block); replay fixture and harness; Fable review round 1 (database half) APPROVE WITH ADVISORIES → applied; round 2 (whole package) APPROVE WITH ADVISORIES → applied | `claude/determined-hypatia-y2cqau` | | tsc 0; lint 298 = baseline; tests 1,945/1,946 (known render-budget timing failure); build 0; 18 migrations validated; 108 DA0.3 unit tests + 15 page tests; PostgREST strings P1–P9 probed on dev with the anon key (no parse error); harness: 2,400 rows → 0 created, 9 queued, 0 queued on the second pass | Contract suites and the preview replay need `OUX_CONTRACT_*` / `E2E_USER_*` accounts (human tasks); types hand-added to `generated.ts` (deviation; regen from dev/clone expected to be a no-op); the third import path `api/campaign-import/apply` still creates rows (assigned to DA4.2) | D5, Q-S10 |
| DA0.4 | Workstream set-up (this ledger, `wp/README.md`, D15 finding) | complete 2026-09-22 (docs) | `claude/determined-hypatia-y2cqau` | | docs only | | D0–D17 |
| DA0.5 | Vessel-tracking schema | **ready for run sheet (2026-09-22)**: plan `wp/da0.5.md` approved with conditions; DDL proof 377 objects / 0 differences between `20260922040000_mobilisation_radar.sql` and production; Fable review round 1 CHANGES REQUIRED (F1 hygiene-log precondition) → fix round 1 → round 2 APPROVE WITH ADVISORIES (two doc advisories applied); clone rehearsal complete (migration applied as one submission, `10` → catalog A–N identical to production, K–N 3/2/0/0/4 → `90` → `10` again identical). The clone now carries the sixteen tables and ledger row `20260922040000` | `claude/determined-hypatia-y2cqau` | | `pnpm validate:migrations` 17 green; production catalog vs file: identical; clone catalog vs production: identical; `wp/da0.5.md` §9 | Production ledger still lacks the row until the operator runs `scripts/data-hygiene/da0.5/10_record_ledger_row.sql` (ledger-row-only; the migration file is never replayed on production). Types not regenerated here (deviation 2; generated.ts already carries the tables) | D15 |
| DA1.1–DA6.2 | Phases 1–6 | not started | | | | | |

## Phase exits

| Phase | Exit criteria | Evidence | Date |
|---|---|---|---|
| 0 | DA0.2, DA0.3 and DA0.5 on production; pack shows 5,085 active workers; no new lineage-C rows after the next weekly membership batch | | |

## Human tasks (not code)

| Task | Raised by | Status |
|---|---|---|
| Supply `OUX_CONTRACT_*` accounts (dev) so the two DA0.3 contract suites (`src/lib/import/__contract__/`, `src/lib/hooks/__contract__/`) can run, and `E2E_USER_*` for the preview replay of `scripts/data-hygiene/da0.3/fixtures/replay_status_sync.xlsx` through the membership wizard (plan §3.4) | DA0.3 | pending — both precede the DA0.3 production run sheet |
| Confirm the D15 finding above (the mobilisation radar in this repository owns the sixteen tables; no other checkout applied a different DDL) | DA0.4 | pending |
| Create a fresh production-shaped clone after Phase 0's run sheets have landed on production (D17); then run the pack on it and on production, confirm the counts match, record the new ref here and in the UX ledger, retire the 12 September clone | D17 | pending — instructions in the Phase 0 hand-over |
| Run the Phase 0 production run sheets in the order DA0.2 → DA0.5 → DA0.3 (one file per submission, output pasted back before the next) | Phase 0 | pending |

## Incidental findings (not part of any work package until assigned)

| Found in | Finding | Assigned to |
|---|---|---|
| DA0.4 set-up (2026-09-22) | `20260922040000_mobilisation_radar.sql` is on `main` and its tables are live in production, but production's migration ledger has no row for it; the next `supabase db push` against production would try to re-run it (it is `IF NOT EXISTS` on tables; policies, triggers and functions need checking). | DA0.5 |
| DA0.3 planning (2026-09-22) | `api/campaign-import/apply` (`:139-170`, `:217-243`) is a third import path (campaign lists, 5 runs on production) that still creates employers and worksites; it reads aliases already. Not named in plan §1.9; not widened into DA0.3. | DA4.2 |
| DA0.3 review (2026-09-23) | A fuzzy `auto` accept writes its alias onto whichever row scores highest, which on today's register can be a lineage-C duplicate (e.g. a misspelt worksite row) rather than the canonical row; there is no worksite merge or alias-management UI yet, so such aliases are re-pointed only by DA1.2's merge routine / DA1.4. `auto` rows on the Name Reviews page therefore offer only Confirm-same-target or Reject. | DA1.1 / DA1.2 / DA1.4 |
| DA0.3 review (2026-09-23) | The migration's `REVOKE … FROM PUBLIC, anon` convention (also in `20260918120000` and `20260921030000`) leaves `authenticated` with the default-privilege ALL on new tables; DA0.3's file now also revokes from `authenticated`. The two earlier migrations are already applied and are not edited. | operator housekeeping (a later migration) |
| DA0.5 reconciliation (2026-09-22, production, read-only) | `vessels`: 25 rows, 3 linked (`owner_operator_id` → Saipem 726, all exact), 22 null, 0 mismatched, 0 into the synthetic set. `mobilisation_watch_contractors`: 14 rows, 2 linked (Saipem 726, Petrofac 737), 12 null, 0 mismatched. The null links wait for DA1.1 to create the missing roots (Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris, Boskalis, Heerema). `Technip` (728) is worksheet row 155, ambiguous (Q-E18): do not link watch contractor 10 to it. | DA1.1 / DA1.2 |
| DA0.5 reconciliation (2026-09-22) | The four strings in `mobilisation_watch_contractors.aliases` (`Subsea 7`, `Shelf Subsea`, `Sapura`, `Technip`) are absent from `employer_name_aliases`; DA0.5 writes nothing there. | DA1.4 (alias lock folds them in) |
| DA0.5 DDL proof (2026-09-22) | One data drift, not schema: `mobilisation_watch_contractors.watch_id = 9` (DOF) is `is_active = true` on production and `false` in the migration's seed (app edit; the seed is `ON CONFLICT DO NOTHING`). | none needed; recorded |
| DA0.4 set-up (2026-09-22) | The clone's ledger is five migrations behind the repository (see standing notes). DA0.3's migration and rehearsal may depend on `20260921030000_membership_updates`; the planner must say which prerequisites the clone rehearsal applies first and under which run sheet. | DA0.3 planner |
