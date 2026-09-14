# Organiser UX — current status and next steps

**Written 2026-09-13; updated 2026-09-14 after the WP2.1 production database rollout completed, and again on 2026-09-14 when the integration branch moved from `develop` to `main`.** This file is the durable handoff for a cloud agent or a new session that does not have this computer or the originating chat. It is operational, not archival. If it disagrees with older prose in `HANDOFF.md` section 7, this file and GitHub win.

## Read this first

- **Phase 0 and phase 1 are complete and live on production.** Do not rerun the phase-1 production run sheet.
- **The integration branch is `main` (from 2026-09-14).** `develop` is parked at `f5529a4a` (equal to `main` at parking) and is not used: do not branch from it, merge into it, merge from it, or delete it. Every feature branch is cut from `main`; every pull request targets `main`; never push to `main` directly. Because a merge to `main` deploys to Vercel Production immediately and regenerates `packages/db-types/generated.ts` from production, **a pull request that carries a migration is merged only after the operator has applied that migration to production** (promotion gate; `PROGRESS.md` standing notes). Older text below that says `develop` describes the state at the time it was written. The orchestration prompt for this phase is `PHASE2_MAIN_ORCHESTRATION_PROMPT.md` in this directory.
- **WP2.1 and WP2.3 code are on `main` and deployed to Vercel Production** ([PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) → `develop` at `de338b5`; [PR #40](https://github.com/R3v3ill3/OffshoreAlliance/pull/40) → `main` at `82ff71c`, both 2026-09-12 UTC). **The WP2.1 schema IS applied to production** (migration 2026-09-13; cleanup and passing postflight 2026-09-14; `wp/wp2.1.md` §15). The live app still does not consume `campaign_groups`, `group_id` or `user_campaign_prefs`; only the F1 matcher (legacy columns) is live.
- **Do not re-run any WP2.1 script or the migration on production.** The Track B run sheet below is retained as the record of what ran and as the template for WP2.2's own migrations; it is finished for WP2.1.
- **Next package is WP2.2 Structure API.** Its plan is `docs/organiser-ux-review/wp/wp2.2.md` (approved). §0 steps 1 and 2 are done: production and normal dev both carry the WP2.1 migration (dev verified read-only 2026-09-14 via the Supabase connector: ledger row `20260912035329 wp2_1_campaign_groups` (and `20260913000000 an_survey_reports`) present; `campaign_groups` and `user_campaign_prefs` tables, both `group_id` columns, 4 groups, 8 units all grouped, 111 placements / 111 memberships, 0 flagged units, no membership view, no unique index). **No database action is outstanding.** Stage 1 (migrations, wrapper, unit tests, guard test) may start now.
- **Agents never read or mutate production** (`gteygwfgjvczanmrwgbr`), including via Supabase MCP, CLI, or SQL Editor.
- **`groups_v2` is not introduced.** No application code consumes `campaign_groups`, `user_campaign_prefs`, or unit/placement `group_id`.
- Local `apps/organising-db/.env.local` points at production. Agents must not run `pnpm dev` / `pnpm start`. Verify on Vercel previews.

## Authoritative references (read in this order)

1. This file — current state and the next operator/agent actions.
2. `docs/organiser-ux-review/HANDOFF.md` — environment facts, non-negotiables, phase-1 completion.
3. `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md` — protocol and WP2.x breakdown.
4. `docs/organiser-ux-review/DECISIONS.md` — section-9 decisions plus WP2.1 E2/M2/C1/F1 amendments.
5. `docs/organiser-ux-review/PROGRESS.md` — ledger.
6. `docs/organiser-ux-review/wp/wp2.1.md` — schema, cleanup, clone evidence, production gate.
7. `docs/organiser-ux-review/wp/wp2.3.md` — wall-chart decomposition (merged).
8. `scripts/data-hygiene/oux-wp2.1/README.md` — operator SQL run order and rollback.
9. `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` sections 6 and 7 — original specification, as amended by `DECISIONS.md`.

Amendments in `DECISIONS.md` override stale text in the original plan and in the archival prompt at the bottom of `HANDOFF.md`.

## Environment safety

Three Supabase projects exist and stay as they are for the rest of this development phase (do not propose changing the arrangement; returning to two projects is an end-of-programme human task in `PROGRESS.md`):

| Environment | Ref | Role today | Agent access |
|---|---|---|---|
| Production | `gteygwfgjvczanmrwgbr` | Live app; `main` → Vercel Production. Has WP2.1 with cleanup. PITR enabled. | **Never.** Operator only, via run sheets the agent prepares. |
| Normal dev | `dpnnmkhabysfdogllsyh` | Backs every Vercel Preview (all non-`main` branches) and the e2e accounts. Thin: 8 units, 111 placements. Has WP2.1. CLI should stay linked here after any other CLI work. | Read freely; mutate with per-file operator approval. |
| Realistic data set (`offshore-alliance-wp21-rehearsal`) | `yqjkuobcawvigsfpgrcm` | Production-shaped copy from 2026-09-12 with WP2.1 and cleanup applied: 22 campaigns, 2,407 workers, the 161-unit campaign. Retained for the rest of phase 2 (WP2.5's performance acceptance needs it). Contains real worker contact details and real staff accounts. Not wired to Vercel. Migration ledger one behind the repo (`20260913000000_an_survey_reports`; apply in the next approved run sheet that touches it). | Read freely; mutate only under an approved run sheet. Never wire it to Vercel, cron, webhooks or messaging credentials without the operator's explicit instruction. |

`supabase/.temp/*` is tracked and a fresh clone links to production. Those files always look modified locally. **Never commit them.** Relink to normal dev after any clone or production CLI command.

Vercel: `main` → Production; every other branch → Preview built against **dev**.

## Progress against the initiating plan

The initiating chat asked an orchestrator to (1) finish phase 1 onto production and (2) run phase 2 under the work-package protocol. Status against that mission:

| Track | Plan intent | Status |
|---|---|---|
| Phase 0 | Decision register, harness, hygiene scripts, usability pack | **Merged** PRs #22–#26. Usability *study* (human) still pending. |
| Phase 1 | Organiser workspace mode, nav, My campaigns, campaign workspace, Actions hub, RLS, guides | **Merged** PRs #27–#35. Promoted to `main` by [PR #37](https://github.com/R3v3ill3/OffshoreAlliance/pull/37) at `0f22d49` on 2026-09-11. Vercel Production succeeded. |
| Phase 1 production DB | Six migrations + WP0.4 hygiene | **Complete.** All six phase-1 migrations are on production. Roster backfill 21/0 missing; one safe duplicate removed; seven organisers converted to `user` after WP1.6 was live; organiser-mode role default enabled. Operator verified sign-out/in, campaigns, unit delete, My campaigns, reduced nav, Show everything. |
| WP0.4 leftover | Orphaned historical rule placements | **Deferred into WP2.1 cleanup**, not an incomplete phase-1 rollout. Do not rerun old WP0.4 script 03 for those rows. |
| WP2.3 | Behaviour-preserving wall-chart split | **Merged** [PR #38](https://github.com/R3v3ill3/OffshoreAlliance/pull/38) at `4d2ff4b`. Shell 2635 → 320 lines. Reviewer: APPROVE WITH ADVISORIES. |
| WP2.1 | Campaign groups schema + F1 matcher + data cleanup | **Complete.** Code merged ([PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) at `de338b5`, promoted by [PR #40](https://github.com/R3v3ill3/OffshoreAlliance/pull/40) at `82ff71c`). **Production DB applied 2026-09-13; cleanup and passing `04` 2026-09-14** (`wp/wp2.1.md` §15). |
| WP2.2 | Structure API | **Plan approved 2026-09-13** (R1, M2-a, K1, G1). §0 step 1 done; step 2 (WP2.1 to dev) found already done 2026-09-14; draft [PR #41](https://github.com/R3v3ill3/OffshoreAlliance/pull/41) holds the plan; implementation not started. |
| WP2.4–2.9 | Group UI, compare, list, editor, consumers, guides | **Not started.** |
| WP3.3 / WP3.5 | May start after phase 1 | **Not started.** |

### Phase-1 migrations already on production (do not re-apply)

```
supabase/migrations/20260909100000_workspace_mode.sql
supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql
supabase/migrations/20260909130000_wp1_6_delete_campaign_standing_guard.sql
supabase/migrations/20260910090000_campaign_last_activity.sql
supabase/migrations/20260911090000_user_hint_dismissals.sql
supabase/migrations/20260911100000_user_hint_dismissals_check.sql
```

### WP2.1 code release (merged 2026-09-12 UTC)

- Branch: `feat/oux-wp2.1-schema-migration` off `develop` at `4d2ff4b`.
- PR: [PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) **MERGED** into `develop` (squash) at `de338b5` (`feat(oux-wp2.1): add campaign groups schema foundation (#39)`). The `Validate Supabase migrations` CI failure on `8153d2b` (`actions/setup-node` `cache: pnpm` path error) was fixed on the branch (`57a92b7`, `cache: pnpm` removed); CI is green on `de338b5`, `332331d`, and `82ff71c`.
- `develop` then received `332331d` (merge `main` into `develop`; kept the clone-generated WP2.1 types).
- Promotion: [PR #40](https://github.com/R3v3ill3/OffshoreAlliance/pull/40) `develop` → `main` **MERGED** at `82ff71c` (`feat(oux): promote WP2.3 and WP2.1 to production`). Vercel Production: **success** for `82ff71c` and for the follow-up `5fe7c93`.
- **Types regeneration on `main`:** `.github/workflows/gen-types.yml` runs on every push to `main` that touches `supabase/migrations/**` and generates from **production**. Because production then lacked the WP2.1 schema, its auto-commit `5fe7c93` (`chore: regenerate database types`) removed `campaign_groups`, `user_campaign_prefs`, the three `campaign_group_*` functions, both `group_id` columns and the `_oux_*` helper tables from `packages/db-types/generated.ts` (and added a `graphql_public` block). This is harmless on `main` today because no application code consumes those symbols and the browser client is untyped (`createClient(): SupabaseClient`).
- **Reconciliation 2026-09-13:** `develop` merged `main` at `1666660` (`--no-ff`, `generated.ts` kept byte-identical to `332331d`, so WP2.1 symbols remain on `develop`). `develop` is now `main` + the WP2.1 types. **Resolved for WP2.1 on 2026-09-13:** the next regen, `9138424f` (after PR #42, generated from production with the schema applied), kept every WP2.1 symbol. `main` is now `develop` + that regen (`graphql_public` block, fkey ordering swap); `develop` should merge `main` before WP2.2 Stage 1. The same hazard recurs for WP2.2a's RPC symbols until they reach production (G1); WP2.2 must not depend on generated `Functions` types for its RPC contract (see `wp/wp2.2.md`).
- Reviewer verdict recorded: **APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**.
- Operator dated waiver (2026-09-13): skip normal-dev schema apply and e2e for this shipment. Thin-dev read-only `00` was clean (8 units / 111 memberships / 111 placements / F1 and H10 residual 0). That is a recorded gap, not a pass. **Superseded 2026-09-14: normal dev does have the WP2.1 migration (verified read-only 2026-09-14 via the Supabase connector: ledger row `20260912035329 wp2_1_campaign_groups` (and `20260913000000 an_survey_reports`) present; `campaign_groups` and `user_campaign_prefs` tables, both `group_id` columns, 4 groups, 8 units all grouped, 111 placements / 111 memberships, 0 flagged units, no membership view, no unique index), and production does too (see "WP2.1 production database rollout" below).**

WP2.1 ships:

- Migration `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql` (schema + backfill; uniqueness and membership view **not** created).
- F1 matcher in `apps/organising-db/src/lib/workers/sync-campaign-universe.ts` (legacy columns only; max-specificity).
- Clone-generated types in `packages/db-types/generated.ts`.
- Hygiene/recovery scripts under `scripts/data-hygiene/oux-wp2.1/`.

Approved deviations:

| Label | Decision |
|---|---|
| **E2** | Defer `UNIQUE (worker_id, group_id)`, the duplicate-rejecting trigger, and `campaign_group_membership` to WP2.2. |
| **M2** | Create Employer groups now; materialise Employer placements in WP2.2. |
| **C1** | Keep duplicate units. Canonical unit stays auto-matchable; noncanonical units get reversible `unit_basis.auto_match=false`. |
| **F1** | All present recognised basis keys must match; then keep only maximum-specificity matches per `(campaign, future group, worker)`. Campaign-universe membership stays OR. |

Same worker may belong to many campaigns. Target remains one unit per group **per campaign**.

Local gates recorded on the shipment: clone type generation exit 0; `tsc` exit 0; 10 valid migrations; F1 37/37; full tests 83 files / 1,118; touched ESLint exit 0; lint baseline 294; Next.js 16 build exit 0 / 130 routes.

### Clone rehearsal (evidence only — not production counts)

Clone `yqjkuobcawvigsfpgrcm` proved cleanup forward/rollback/reapply, migration recovery/reapply, postflight, and rolled-back role probes. Final clone shape recorded in the programme docs: 20 groups; 237 units grouped + 2 legacy custom containers with null group; all placements grouped; membership checksum unchanged; H1/H2/H3/H5/H7/H9/F1 residual/H10-enabled 0.

Do **not** reuse clone mapping IDs on production. Build mappings from a fresh production `00`.

### WP2.1 production database rollout (complete 2026-09-14)

Full evidence: `wp/wp2.1.md` §15. Summary:

- **2026-09-13:** the operator applied `20260912035329_wp2_1_campaign_groups.sql` to production **before** the cleanup steps. Detected from `main`'s regen `9138424f` keeping the WP2.1 symbols; confirmed by a catalog query (ledger row present, both `group_id` columns, 20 groups).
- **2026-09-13:** exact `04_postflight_hazards.sql` STOPPED: 134 equal-maximum F1 partitions after C1. Cause: C1 never ran (0 flagged units, no `03a` audit rows, no mapping tables).
- **2026-09-14:** cleanup run in the original order, post-migration, one agent-prepared file per SQL Editor submission (guard line pre-inserted; `postgres` role; RLS bypassed): `00` (13 H10 sets, 134 residual) → `02a` → 13 canonical mappings (all campaign 57 / worksite group; most placements, ties by display order) → `02b` → `03a` (16 units flagged) → `03b` Block 1 (100 partitions, 1 unresolved: worker 3014) → 1 placement override (keep unit 556) → full `03b` (177 duplicate placements removed, 100 partitions applied) → `04` **passed** (F1 residual 0, H10 0, 226 fallback suppressed — identical to the clone simulation; all dependant and view checksums unchanged from the preflight).
- Observed during the run: opening campaign 57's wall chart triggered the app's sync-on-open (`WorkforceBoard` → `/api/campaigns/[id]/sync-universe-workers`), adding 334 members and 233 placements; the cleanup handled them. Production row totals drift on page open; compare hazard counts.
- Deviations recorded: migration-before-cleanup; the clone re-rehearsal of the recovered cleanup bytes was skipped (they ran on production directly and passed their own checks; the two rollback scripts have never run on those bytes); `95` not run (clone-only); CLI not used.
- Helper tables (`_oux_hygiene_log`, `_oux_wp21_canonical_basis`, `_oux_wp21_placement_mapping`, `_oux_wp21_conflicts`) are retained on purpose.

**Recovered-bytes gate:** an external checkout switch discarded uncommitted WP2.1 files; they were reconstructed and the recovered migration / exact `04` / exact `95` were re-run. The recovered **cleanup** script bytes were not re-executed. Production application must re-rehearse `03b_rollback → 03a_rollback → 03a → 03b → 04` on the clone and record green before touching production.

CLI v2.84.4 runs each migration file as one implicit pipelined transaction. A first `55006` failure rolled back all objects and the ledger row (atomicity proven). Successful applies emit PostgreSQL `25P01` on `SET CONSTRAINTS` because there is no explicit `BEGIN`; the flush still worked. Keep that warning as deployment evidence. Production must use rehearsed `supabase db push` or `psql -1`; never plain autocommit `psql -f`.

## What to do next (code vs database)

These are two separate tracks. A cloud agent can do Track A with GitHub + the repo. Track B is operator-only.

### Track A — WP2.1 code shipment (**complete 2026-09-12 UTC**)

Steps 1–5 are done: CI fix `57a92b7`; [PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) merged to `develop` at `de338b5`; [PR #40](https://github.com/R3v3ill3/OffshoreAlliance/pull/40) merged to `main` at `82ff71c`; Vercel Production succeeded. The F1 matcher is live; the schema types are present on `develop` (and stripped again on `main` by the production regen — see above). **No production database change happened.** Full mode keeps working. `groups_v2` remains unintroduced.

Step 6 (decided 2026-09-13, `wp/wp2.2.md` §0): the operator applies WP2.1 to **production** (**done 2026-09-13/14**, see above) and to **dev** `dpnnmkhabysfdogllsyh` by one `supabase db push` (**found already applied 2026-09-14**); WP2.2's own migrations (2.2a additive RPCs, 2.2b enforcement) follow the same two targets, with one optional clone pass of the new SQL, and production receives 2.2a → WP2.2 code → scripts → 2.2b (gate G1).

Git rules for any agent: no worktrees, no sub-branches, one commit per completed unit, every exact `git` command needs operator approval, never force-push, never skip hooks.

### Track B — production database rollout (WP2.1 portion **complete 2026-09-14**; operator only)

The WP2.1 run is finished; see "WP2.1 production database rollout" above and `wp/wp2.1.md` §15. The manual runbook below is kept as the record of the intended order and as the template WP2.2 §0 step 6 will follow for 2.2a/2.2b. Agents prepare files and stop; the operator runs them.

### After WP2.1 schema exists somewhere WP2.2 can use

WP2.2 owns:

- Transactional move / copy / merge / split API (replace current client writers).
- Re-run H9 cleanup, then enforce unique `(worker_id, group_id)`, duplicate-rejecting trigger, and `campaign_group_membership`.
- Materialise Employer placements (M2).
- Fix/review Recompute provenance (it can remove universe-sync rows).
- Handle generated `campaign_worker_ou.Insert.group_id` being required even though the trigger fills it.
- Page / uncap `loadOuTargets`.
- Only then introduce and consume `groups_v2` (WP2.4+).

Phase 2 remaining order: WP2.2 → WP2.4 → WP2.5 / WP2.6 / WP2.7 (2.7 needs only 2.2) → WP2.8 → WP2.9.

## Manual production SQL runbook

**STOP. Operator-only. Agents never execute this.**

Checked-in authority: `scripts/data-hygiene/oux-wp2.1/README.md` and the script headers. Use the files from the merged commit, not an older local copy.

### Prerequisites

- Production backup / PITR timestamp recorded.
- Confirm SQL Editor / CLI project ref is production `gteygwfgjvczanmrwgbr` before every command, then relink CLI to normal dev immediately afterwards.
- Re-rehearse recovered cleanup bytes on the clone first: `03b_rollback` → `03a_rollback` → `03a` → `03b` → `04`. Record green. Do not call the recovered cleanup files byte-rehearsed until that happens.
- `_oux_hygiene_log` from WP0.4 must remain until both WP2.1 cleanup rollbacks are no longer needed.

### Never on production

- `01_environment_marker.sql` — clone/dev only.
- `95_role_probes.sql` — rollback-only, no environment marker, creates data; clone/dev rehearsal only, and only as the exact whole file.
- Blind reuse of clone canonical or placement mapping IDs.
- Plain autocommit `psql -f` of the migration.
- MCP `apply_migration`.
- Editing the applied migration file.

### Production mutating-script guard

The committed mutating files (`02a`, `02b`, `03a`, `03b` both blocks, their rollbacks, `90`) refuse to run unless `_oux_env_marker` is a valid clone/dev singleton **or** `oux.env` is `production` in the same transaction.

On production, the operator adds this line immediately after **every** `BEGIN;` in the **same** SQL Editor submission / `psql` transaction:

```sql
SET LOCAL oux.env = 'production';
```

Never commit that line or the production project ref into the repo.

### Production sequence

1. **Read-only preflight.** Run `00_preflight_hazards.sql`. Record every stable label. Hard stop unless `malformed_or_nonpositive_basis_units = 0`. Record H9/H10, F1 pre/max residual, memberships/placements/unit checksums. Unexpected shapes → stop.
2. **Build mappings from that production `00`.** Populate `02a` (`_oux_wp21_canonical_basis`) with one reviewed canonical unit per duplicate basis. Create/populate `02b` only for H9 partitions that deterministic rules cannot resolve. Human approval for every ambiguous keeper. `keep_ou_id = NULL` means remove-all for that partition.
3. **`03a` in one transaction** (with the production `SET LOCAL`). Expect only `auto_match` changes. No units, placements, or memberships deleted. STOP and rollback on equal-maximum F1 residuals after C1.
4. **`03b` Block 1** in its own transaction (with `SET LOCAL`). Inspect unresolved partitions. When all planned, run the **full exact file in one DB session** — temp/diagnostic tables span Block 1 and Block 2. Block 2 logs and deletes excess placements only. Preserve one unit per group per campaign. Multi-campaign membership stays allowed.
5. **Post-cleanup checks.** Re-run the relevant `00`/`04` labels the README names. Do not apply schema if H9/F1 residuals remain.
6. **Apply the migration** with linked-ref confirmation, then either:
   - `npx supabase db push` (rehearsed path), or
   - `psql -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260912035329_wp2_1_campaign_groups.sql`
   
   Expect `25P01` on `SET CONSTRAINTS` if using the CLI implicit pipeline. Confirm the migration ledger row. Relink CLI to normal dev.
7. **`04_postflight_hazards.sql`.** Confirm groups/backfill, both FKs still `DEFERRABLE INITIALLY DEFERRED`, no unique `(worker_id, group_id)`, no `campaign_group_membership` view, authenticated has no helper-table / TRUNCATE / unintended sequence privileges.
8. Spot-check existing full-mode behaviour. There is no groups UI yet.

### Production rollback order

1. Schema: `90_rollback_wp2_1_campaign_groups.sql` (with production `SET LOCAL`).
2. Migration ledger repair — **separate explicit approval** for the exact repair command and target. Not inside `90`.
3. `03b_rollback.sql`
4. `03a_rollback.sql`

Mappings, helper tables, and `_oux_hygiene_log` are retained on purpose. Do not run cleanup rollbacks after WP2.2 uniqueness is installed.

## Cloud-agent continuation checklist

A cloud agent picking this up with only GitHub + this repo should:

1. Read this file, then `HANDOFF.md`, `DECISIONS.md`, `PROGRESS.md`, `wp/wp2.1.md`, `wp/wp2.2.md`, and `scripts/data-hygiene/oux-wp2.1/README.md`.
2. Treat GitHub as source of truth for PR/CI/preview. As of 2026-09-14 (after Step 0 of the `main` orchestration): PRs #39–#43 merged; `main` = `f5529a4a` (includes regen `9138424f` with WP2.1 symbols); `develop` parked at `f5529a4a` (equal to `main`; not used); draft PR #41 on `feat/oux-wp2.2-structure-api` targets `main` and carries `origin/main` merged in (`93df7e28`); Vercel Production green; validate-migrations green.
3. Not run any production SQL, MCP query, or `supabase` command against `gteygwfgjvczanmrwgbr`.
4. Not run the app locally.
5. Continue with WP2.2 under the protocol: plan approved by the operator → implement on `feat/oux-wp2.2-structure-api` → verify → fresh review → draft PR #41 into `main`, merged by the operator only after WP2.2a is on production (G1). Ask before every exact git command that pushes or opens a pull request, before merging, and before any database mutation.
6. Update `PROGRESS.md` / `HANDOFF.md` only after evidence exists (CI green, merge SHAs, operator confirmation).
7. Track B for WP2.1 is done on production and dev; no database action is outstanding until WP2.2a exists. Prepare WP2.2a/2.2b run sheets the same way (one file per submission, guard line pre-inserted, read-only verification appended). Dev may be applied by the operator's CLI `db push` or, with the operator's approval, by the agent through the Supabase connector's `apply_migration` — never production.

Suggested opening prompt for a new orchestrating session:

> You are continuing the Organiser UX programme. Read `docs/organiser-ux-review/CURRENT_STATUS_AND_NEXT_STEPS.md` first. Phase 0/1 are live on production. WP2.3 and WP2.1 are complete, including the WP2.1 schema, cleanup and passing postflight on production (`wp/wp2.1.md` §15). Your job is WP2.2 Structure API per the approved `docs/organiser-ux-review/wp/wp2.2.md`: production and normal dev both carry the WP2.1 migration, so no database action is outstanding (§0 steps 1–2 done). Do not touch production. Do not introduce `groups_v2`. Follow `IMPLEMENTATION_ORCHESTRATION_PROMPT.md`.

## Open advisories (do not silently fold into a WP)

- **`gen-types.yml` regenerates from production on every `main` push touching migrations.** Resolved for WP2.1 symbols on 2026-09-13 (`9138424f` kept them once production had the schema). It will strip WP2.2a's RPC symbols until 2.2a reaches production, which is why G1 exists. Not a WP2.2 change.
- **Sync-on-open:** the campaign page's `WorkforceBoard` runs a universe sync on mount for any writer. Production membership/placement totals move whenever a campaign is opened; compare hazard counts in before/after evidence. Recorded as an incidental finding in `PROGRESS.md`.
- WP2.3 fake PostgREST harness does not fully emulate projection / predicate / order.
- Nested-card drop bubbling can invoke move twice; characterisation pins current behaviour.
- Recovered WP2.1 cleanup bytes ran on production without the clone re-rehearsal and passed their own checks; `03a_rollback` / `03b_rollback` have never run on those bytes — rehearse on a fresh clone before any production rollback.
- Normal-dev e2e was waived for the WP2.1 shipment (conscious gap). Normal dev now has the WP2.1 migration (found applied 2026-09-14), so WP2.2 previews and contract tests can run against it; the WP2.1 e2e gap itself stays recorded.
- Generated types: `campaign_worker_ou.Insert.group_id` required despite trigger; harmless `user_profiles_organiser_id_fkey` relationship ordering swap.
- `supabase/.temp/` still tracked.
- Production `00` (2026-09-14) showed `malformed_or_nonpositive_basis_units = 0`; F1 may be relied on.
- Incidental: SOC wizard `cid` vs `campaign_id`; Users-dialog checklist reflow / hover-only tooltip.
- Human tasks still pending: usability baseline study; OVERVIEW clip; B1–B3 / C1–C3 (WP2.9).

## Definition of done for this handoff

A later agent can complete the programme from this file plus the repo if it can:

1. Explain that production organisers already have phase-1 UX and must not be “enabled” by more phase-1 SQL.
2. Point at PRs #39/#40 (merged), the types-regen reconciliation, and the production DB gate without asking this chat.
3. Run WP2.2 under the protocol without touching production, per the approved `wp/wp2.2.md` (§0 sequence, G1 promotion gate).
4. Explain that WP2.1 is fully applied on production (schema, C1, 03b, passing `04`) and on normal dev (schema only; no cleanup needed), then hand the operator a stop-gated sequence for WP2.2a/2.2b when — and only when — they ask.
