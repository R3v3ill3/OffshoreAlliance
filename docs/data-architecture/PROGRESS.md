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
- **Clone `yqjkuobcawvigsfpgrcm`** (`offshore-alliance-wp21-rehearsal`, 12 September) — **deleted by the operator
  2026-09-24; the ref no longer exists.** Historical note: it was the Phase 0 rehearsal
  target. Read-only check 2026-09-22: `_oux_env_marker` and `_oux_hygiene_log` present; 2,407 workers (2,293
  active), 171 employers, 174 worksites, 22 campaigns; no `vessels` or `mobilisation_*` tables. Its migration ledger
  ends at `20260917100000_wp3_8_campaign_families` and lacks `20260914090000` / `20260914090100` (WP2.2a/b: apply
  only under their own run sheet, per the UX ledger), `20260918120000_email_draft_attachments`,
  `20260921030000_membership_updates` and `20260922040000_mobilisation_radar`. Owner of the clone at the time of
  writing: this workstream (Phase 0 rehearsals); the UX programme's WP2.5 has not started.
- **Fresh clone `plbldfctqhnbyrsypuri` (from 2026-09-24, D17):** restored by the operator from a production backup taken
  after every Phase 0 run sheet had landed (ledger 20 rows ending `20260924010000`; 5,900 workers / 5,085 active; 179
  employers; 190 worksites; 22 campaigns; `_oux_hygiene_log` 3,878 rows; `name_match_reviews` and `vessels` present).
  Marked `clone` by the orchestrator on creation day. The Phase 1 rehearsal target; not wired to Vercel, cron,
  webhooks or messaging. Display name `OA_clone_2` (renamed by the operator 2026-09-24).
  **The 12 September clone `yqjkuobcawvigsfpgrcm` was deleted by the operator on 2026-09-24** after the pack
  comparison in `wp/da0.1.md` §7 was recorded. Three Supabase projects remain: production, normal dev, `OA_clone_2`.
- **Normal dev `dpnnmkhabysfdogllsyh`**: read freely; mutate with the operator's approval per file.
- **Permission prompts (operator decision 2026-09-24, "option 1"):** `.claude/settings.json` allows
  `mcp__Supabase__execute_sql` and the read-only listing tools without a per-call prompt, and denies
  `apply_migration`, `pause_project`, `restore_project`, `create_project`, branch and edge-function tools. The
  per-call prompt was the only technical barrier against an agent writing to production; from this date the
  protection is D0 (agents run SELECT-only, PII-free statements on `gteygwfgjvczanmrwgbr`), the run-sheet
  `_oux_env_marker` guard, and the rule that every mutating statement targets the clone or dev by explicit project
  ref. Remove the allow list to restore the prompts.
- **Branch (deviation from the prompt's `feat/da-<wp-id>-<slug>` rule):** this session is bound to
  `claude/determined-hypatia-y2cqau` by the harness and may not push elsewhere, so every Phase 0 package is
  committed there, one commit per completed package, and the operator opens pull requests from it (none is opened
  by the agent unless asked). The docs branch `claude/data-architecture-cleaning-plan-3ib8jt` (plan, worksheets,
  pack) was merged into it at `02c58444`.
- **Commands:** from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`; root: `pnpm validate:migrations`;
  contract suite `pnpm test:contract` on dev when a PostgREST string changes.
- **Hand-over:** `PHASE0_HANDOVER.md` (24 September 2026) holds the operator's step-by-step instructions for the production run sheets (DA0.2 → DA0.5 → DA0.3) and the fresh clone (D17).
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
| DA0.1 | Baseline profile (pack on production and the clone) | **complete 2026-09-22** (`a8d4f73e`): pack run statement by statement on production (read-only, D0) and the clone; every §1.1 count reproduced or explained (`campaign_worker_membership` 3,456 vs 3,415 is sync-on-open drift); `00` made clone-safe (`membership_update_batches` moved to `00b`, `occupation_groups` added) | `claude/determined-hypatia-y2cqau` | [#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67) | `wp/da0.1.md` §2–§6: production `workers_active` 5,749, employers 187, worksites 194, campaigns 24; clone 2,293 / 171 / 174 / 22; `test` worksite cluster 196–199 on both | Clone lacks the lineage-C rows and two campaigns (predates the September sync) | D0 |
| DA0.2 | Remove the synthetic dataset | **on production 2026-09-24 (P1, P2, P3 matched exactly; pack re-run recorded in wp/da0.2.md §11.2)** — earlier: plan `wp/da0.2.md` approved; Fable review rounds 1–2 (two blocking findings fixed); clone rehearsal complete — dry run, forward 1 (active 2,293 → 1,629, every prediction matched), rollback (every data row restored byte for byte, 2,653 log rows stamped), forward 2 identical to forward 1. The rollback needed four fix rounds found only by rehearsal (a PL/pgSQL alias collision, a temp-table projection, parents-first reinsert order across the six roots, a NULL cast, deferred constraints before re-enabling triggers), rounds 3–4 under the operator's P7 authorisation. P1, P2 confirmed and P6 acknowledged 2026-09-24. Clone left post-forward-2 (D17) | `claude/determined-hypatia-y2cqau` | [#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67) | `wp/da0.2.md` §9 (00 #1–#4, dry run, forward 1, 90, forward 2 pasted); production preflight 250 rows, 664 in scope, md5 identical on both projects | Production run in a quiet window before the next weekly batch; keep the hygiene-log rows 30 days | D4, D16 |
| DA0.3 | Stop the bleed (alias check, one resolution path, review queue, raw names) | **merged to `main` 2026-09-24** ([#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67) at `a6a3d2d9`, after the migration landed on production: P1 → P2 → P3 matched, checksums unchanged); next: the weekly batch through the new path — earlier: code complete, two Fable reviews, clone rehearsal complete (14 steps: migration + ledger row → `20` decisions rehearsal → `91` → `90` rollback identical to before → ledger repair → migration again identical to after-forward-1 → `20` → `91`; clone left forward). Plan `wp/da0.3.md` approved with the nine §5 decisions; migration `20260922120000_da0_3_name_match_reviews.sql` (both alias CHECKs widened; `name_match_reviews`; `fold_name()`; `decide_name_match()`; raw-name columns on `workers`) applied to normal dev with its ledger row; `@oa/employer-matching` gains `proposeNameMatch`; single resolution path (`lib/import/resolve-names.ts`, `POST /api/import/resolve-names`) in both wizards and the weekly update; three matchers and both client insert paths removed; Name Reviews page at `/name-reviews` (admin block); replay fixture and harness; Fable review round 1 (database half) APPROVE WITH ADVISORIES → applied; round 2 (whole package) APPROVE WITH ADVISORIES → applied | `claude/determined-hypatia-y2cqau` | | tsc 0; lint 298 = baseline; tests 1,945/1,946 (known render-budget timing failure); build 0; 18 migrations validated; 108 DA0.3 unit tests + 15 page tests; PostgREST strings P1–P9 probed on dev with the anon key (no parse error); harness: 2,400 rows → 0 created, 9 queued, 0 queued on the second pass | Contract suites and the preview replay need `OUX_CONTRACT_*` / `E2E_USER_*` accounts (human tasks); types hand-added to `generated.ts` (deviation; regen from dev/clone expected to be a no-op); the third import path `api/campaign-import/apply` still creates rows (assigned to DA4.2) | D5, Q-S10 |
| DA0.4 | Workstream set-up (this ledger, `wp/README.md`, D15 finding) | complete 2026-09-22 (docs) | `claude/determined-hypatia-y2cqau` | | docs only | | D0–D17 |
| DA0.5 | Vessel-tracking schema | **complete on production 2026-09-24** (P1 → P2 → P2b → P3 all matched; ledger rows 20260922040000, 20260923220000, 20260924010000 recorded; catalog unchanged) — earlier: plan `wp/da0.5.md` approved with conditions; DDL proof 377 objects / 0 differences between `20260922040000_mobilisation_radar.sql` and production; Fable review round 1 CHANGES REQUIRED (F1 hygiene-log precondition) → fix round 1 → round 2 APPROVE WITH ADVISORIES (two doc advisories applied); clone rehearsal complete (migration applied as one submission, `10` → catalog A–N identical to production, K–N 3/2/0/0/4 → `90` → `10` again identical). The clone now carries the sixteen tables and ledger row `20260922040000` | `claude/determined-hypatia-y2cqau` | [#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67) | `pnpm validate:migrations` 17 green; production catalog vs file: identical; clone catalog vs production: identical; `wp/da0.5.md` §9 | Production ledger still lacks the row until the operator runs `scripts/data-hygiene/da0.5/10_record_ledger_row.sql` (ledger-row-only; the migration file is never replayed on production). Types not regenerated here (deviation 2; generated.ts already carries the tables) | D15 |
| DA2.1 | Provenance columns and vocabularies (`fact_reviews`) — runs before DA1.1 | **plan written 2026-09-24** (`wp/da2.1.md`: migration `20260925010000_da2_1_provenance.sql`; employers +11 columns, worksites +17, agreement_worksites +6 with `mapping_confidence` → `confidence`; cycle guards; `fact_reviews` + `record_fact_review()`; 369 worksheet rows to load). Open: O-1 reuse `worksites.operator_id` as the facility operator instead of a new column (orchestrator recommends yes; §3.2 amendment for the operator), O-4 catch dev up with the five missing migrations before rehearsal, O-5 the fresh clone | `claude/determined-hypatia-y2cqau` | | | Lands on the fresh clone first (D17); the clone does not exist yet | D13 |
| DA1.1 | Employers round | **adjudicated 2026-09-24** (`wp/da1.1-round.md` §11–§13: S1–S30 answered by the operator in the session; 116 worksheet rows decided; D12 amended, D3 noted; 24 merges, 12 children, 130 keeps, 11 out, 2 placeholders, 18 new rows in three rounds) → next: Fable planner for the merge and coverage scripts (with the `merge_employers` corrective migration) after DA2.1's migration | `claude/determined-hypatia-y2cqau` | | | Merges change campaign universes (plan §7); every affected campaign listed before the operator sees a run sheet | D2, D3, D11, D12 |
| DA1.3 | Scope taxonomy | **plan written 2026-09-24** (`wp/da1.3.md`: migration `20260925090000_da1_3_scope_taxonomy.sql` adds `work_scopes.code`, the 14 map scopes as top-level rows with existing entries re-parented beneath, `scope_crosswalk`; back-fill of `agreement_scopes` from `sector_id` then `source_sheet` covers 135/136 agreements, 1096 needs a per-agreement addition); awaiting the operator's crosswalk confirmations (bundled with the DA1.1 round) and the fresh clone | `claude/determined-hypatia-y2cqau` | | | Readers of `work_scopes` that assume a flat list | D7 |
| DA1.2, DA1.4, DA2.2–DA6.2 | remaining packages | not started | | | | | |

## Phase exits

| Phase | Exit criteria | Evidence | Date |
|---|---|---|---|
| 0 | DA0.2, DA0.3 and DA0.5 on production; pack shows 5,085 active workers; no new lineage-C rows after the next weekly membership batch | **Complete 2026-09-24.** Run sheets: DA0.2 P1–P3 (active workers 5,749 → 5,085; no `test` cluster), DA0.5 P1–P3 (three ledger rows), DA0.3 P1–P3 (migration; checksums unchanged). Merged to `main` via [#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67); gen-types produced no diff. **Exit criterion met by the `membership_weekly_update` import at 07:04 UTC** (import_logs: 0 created / 42 updated): employers 179 and worksites 190 unchanged (0 created), 19 employer aliases and 15 worksite aliases written with `source = 'import'`, `name_match_reviews` needs_review 15 / unmatched 5 / auto 34, 41 workers carry raw names; active workers 5,094 (recommencements in the batch). Fresh clone `plbldfctqhnbyrsypuri` (`OA_clone_2`) verified against production (`wp/da0.1.md` §7): identical except the rows that import wrote after the backup | 2026-09-24 |

## Human tasks (not code)

| Task | Raised by | Status |
|---|---|---|
| Supply `OUX_CONTRACT_*` accounts (dev) so the two DA0.3 contract suites (`src/lib/import/__contract__/`, `src/lib/hooks/__contract__/`) can run, and `E2E_USER_*` for the preview replay of `scripts/data-hygiene/da0.3/fixtures/replay_status_sync.xlsx` through the membership wizard (plan §3.4) | DA0.3 | pending — both precede the DA0.3 production run sheet |
| **DA0.2 P7** and **P1, P2, P6** (`wp/da0.2.md` §5) before the production run sheet | DA0.2 | **Done 2026-09-24**: P7 authorised, rollback rehearsed and proven after fix rounds 3–4b; P1 and P2 confirmed; P6 acknowledged (ten roles). Production run sheet: `scripts/data-hygiene/da0.2/prod/` |
| Confirm the D15 finding above (the mobilisation radar in this repository owns the sixteen tables; no other checkout applied a different DDL) | DA0.4 | **Confirmed by the operator 2026-09-24 (O-1)**; O-4 and DA0.3 §5 items 1–9 confirmed the same day |
| Create a fresh production-shaped clone after Phase 0's run sheets have landed on production (D17); then run the pack on it and on production, confirm the counts match, record the new ref here and in the UX ledger, retire the 12 September clone | D17 | **Done 2026-09-24: `plbldfctqhnbyrsypuri` = `OA_clone_2`**, marker set, pack comparison recorded (`wp/da0.1.md` §7: identical apart from the post-backup import). **`yqjkuobcawvigsfpgrcm` deleted by the operator 2026-09-24.** |
| Run the Phase 0 production run sheets in the order DA0.2 → DA0.5 → DA0.3 | Phase 0 | **Done 2026-09-24** (every step matched; records in each `wp/*.md` §11.1) |
| Open the pull request from `claude/determined-hypatia-y2cqau` into `main` and merge it; check the gen-types workflow's regeneration produces no diff | DA0.3 | **Merged 2026-09-24** ([#67](https://github.com/R3v3ill3/OffshoreAlliance/pull/67), operator instruction in the session). Validate-migrations run 77 and gen-types run 203 both succeeded on `a6a3d2d9`; the regeneration from production committed nothing, so the hand-added DA0.3 and mobilisation types were exact (DA0.3 deviation and DA0.5 deviation 2 closed) |
| Import the next weekly membership batch as usual, then check: queue rows present, employers/worksites unchanged (Phase 0 exit criterion); work the queue at `/name-reviews` | Phase 0 exit | **Met 2026-09-24 07:04 UTC** (see Phase exits); the batch was run by the operator (confirmed 2026-09-24). **Queue worked by the operator 2026-09-24, verified on production**: 0 open rows; employers 9 confirmed / 1 overridden, worksites 5 confirmed / 1 overridden / 4 rejected; 34 `auto` rows untouched; employers still 179 (0 created), worksites 191 (1 created by the operator, id 451, in scope for DA1.2); aliases written today 29 employer / 20 worksite; 0 workers with a raw employer name and no employer, 2 with a raw worksite name and no worksite (the rejected rows) |

## Incidental findings (not part of any work package until assigned)

| Found in | Finding | Assigned to |
|---|---|---|
| Merge of `main` (2026-09-24, `5b38f9ee`) | Main's Projects consolidation (`cb195929`) adds two lint errors in `src/app/(dashboard)/projects/page.tsx` (baseline moves 298 → 300 on the merged tree) and its calendar commit leaves `src/app/(dashboard)/mobilisation/_components/__tests__/calendar-grid.test.tsx` failing `tsc --noEmit` (TS2769; the Next build excludes test files, so `pnpm build` still passes and vitest runs the file green). Both files are byte-identical to `main`; not touched by this branch. | operator / the mobilisation session |
| DA0.5 hand-over (2026-09-24) | Two further mobilisation migrations landed on `main` after the plan (`20260923220000_mobilisation_recipients.sql`, `20260924010000_mobilisation_signal_schedule.sql`) and their objects are live on production **without ledger rows** — the third and fourth out-of-ledger applications by the mobilisation work. DA0.5's run sheet now records all three rows (P2, P2b). The operator should ask the mobilisation session to apply future migrations through the ledger (one `BEGIN; … COMMIT;` submission plus the ledger row, or the promotion gate), or every later `supabase db push` will fail on their `CREATE POLICY` statements. | operator; DA0.5 (P2b) |
| DA2.1 planning (2026-09-24) | `merge_employers` does not re-point `programs.principal_employer_id` (3 rows), so a merge whose victim is a program's principal fails on the victim delete; and it silently blanks links it does not handle: `vessels.owner_operator_id` (3), `mobilisation_watch_contractors.employer_id` (2), `upcoming_project_employers.employer_id` (43), mobilisation signals and alerts (4 each). Together with the `worksite_scopes` dedup defect below, `merge_employers` needs a corrective migration before any DA1.1 merge. | DA1.1 planner (blocking input) |
| DA2.1 planning (2026-09-24) | `user`-role organisers can write the new provenance columns through the app's existing table grants, and app edits do not restamp `source`. | DA4.2 / DA6.2 |
| DA2.1 planning (2026-09-24) | Some worksheet proposal labels are outside the new vocabularies (`grain=onshore_facility`, `hub`, `field`, `region`; `kind=drilling contractor`); DA1.1/DA1.2 map them when the rounds are scripted. | DA1.1 / DA1.2 |
| DA1.3 planning (2026-09-24) | `merge_employers` dedupes `worksite_scopes` by (employer, worksite) only, ignoring `scope_id` (`baseline_schema.sql:4290-4302`), so a merge survivor keeps one scope per worksite and loses the rest (Monadelphous at Crux holds 3). Must be fixed or worked around before any DA1.1 merge that moves `worksite_scopes` rows. | DA1.1 planner (blocking input) |
| DA1.3 planning (2026-09-24) | The two flat scope filters (`worksites/page.tsx:615`, `employers-tab.tsx:845`) match exact scope ids, so after DA1.3 picking a top-level scope will not show rows filed under its children. Usability, not correctness. | DA5.3 or a UI follow-up |
| DA1.3 planning (2026-09-24) | `upcoming_project_employers.role_type` is `Operator` on all 84 rows; the NOPSEMA scraper hard-codes it (`apps/scraper/src/pipeline/match.ts:57`), so the crosswalk from `role_type` has no data to map today. | recorded |
| DA0.2 P4 (2026-09-24) | The pack's `07_hierarchy_and_patches.sql` printed organiser (staff) names, which DA0.1 and the P4 record had pasted. Staff names are not member data, but the workstream's committed files carry organisation and worksite names only, so both records now show organiser ids and the pack statement selects `organiser_id` instead of the name. | closed 2026-09-24 |
| DA0.4 set-up (2026-09-22) | `20260922040000_mobilisation_radar.sql` is on `main` and its tables are live in production, but production's migration ledger has no row for it; the next `supabase db push` against production would try to re-run it (it is `IF NOT EXISTS` on tables; policies, triggers and functions need checking). | DA0.5 |
| DA0.2 planning (2026-09-22) | Action Network may hold people or tags for the 664 synthetic workers (386 `worker_an_tags` and 16 `an_tag_sync_log` rows are deleted by `10`); nothing outside the database is touched by the package. | operator (Action Network housekeeping) |
| DA0.3 planning (2026-09-22) | `api/campaign-import/apply` (`:139-170`, `:217-243`) is a third import path (campaign lists, 5 runs on production) that still creates employers and worksites; it reads aliases already. Not named in plan §1.9; not widened into DA0.3. | DA4.2 |
| DA0.3 review (2026-09-23) | A fuzzy `auto` accept writes its alias onto whichever row scores highest, which on today's register can be a lineage-C duplicate (e.g. a misspelt worksite row) rather than the canonical row; there is no worksite merge or alias-management UI yet, so such aliases are re-pointed only by DA1.2's merge routine / DA1.4. `auto` rows on the Name Reviews page therefore offer only Confirm-same-target or Reject. | DA1.1 / DA1.2 / DA1.4 |
| DA0.3 review (2026-09-23) | The migration's `REVOKE … FROM PUBLIC, anon` convention (also in `20260918120000` and `20260921030000`) leaves `authenticated` with the default-privilege ALL on new tables; DA0.3's file now also revokes from `authenticated`. The two earlier migrations are already applied and are not edited. | operator housekeeping (a later migration) |
| DA0.5 reconciliation (2026-09-22, production, read-only) | `vessels`: 25 rows, 3 linked (`owner_operator_id` → Saipem 726, all exact), 22 null, 0 mismatched, 0 into the synthetic set. `mobilisation_watch_contractors`: 14 rows, 2 linked (Saipem 726, Petrofac 737), 12 null, 0 mismatched. The null links wait for DA1.1 to create the missing roots (Allseas, Subsea7, DeepOcean / Shelf Subsea, Van Oord, Vantris, Boskalis, Heerema). `Technip` (728) is worksheet row 155, ambiguous (Q-E18): do not link watch contractor 10 to it. | DA1.1 / DA1.2 |
| DA0.5 reconciliation (2026-09-22) | The four strings in `mobilisation_watch_contractors.aliases` (`Subsea 7`, `Shelf Subsea`, `Sapura`, `Technip`) are absent from `employer_name_aliases`; DA0.5 writes nothing there. | DA1.4 (alias lock folds them in) |
| DA0.5 DDL proof (2026-09-22) | One data drift, not schema: `mobilisation_watch_contractors.watch_id = 9` (DOF) is `is_active = true` on production and `false` in the migration's seed (app edit; the seed is `ON CONFLICT DO NOTHING`). | none needed; recorded |
| DA0.4 set-up (2026-09-22) | The clone's ledger is five migrations behind the repository (see standing notes). DA0.3's migration and rehearsal may depend on `20260921030000_membership_updates`; the planner must say which prerequisites the clone rehearsal applies first and under which run sheet. | DA0.3 planner |
