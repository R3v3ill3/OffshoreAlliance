# Organiser UX — current status and next steps

**Written 2026-09-13.** This file is the durable handoff for a cloud agent or a new session that does not have this computer or the originating chat. It is operational, not archival. If it disagrees with older prose in `HANDOFF.md` section 7, this file and GitHub win.

## Read this first

- **Phase 0 and phase 1 are complete and live on production.** Do not rerun the phase-1 production run sheet.
- **Do not apply WP2.1 SQL, cleanup scripts, or `supabase db push` to production now.** Shipping the WP2.1 *code* is compatible with the current production schema. The production database rollout is a later, operator-only gate.
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

| Environment | Ref | Role | Agent access |
|---|---|---|---|
| Production | `gteygwfgjvczanmrwgbr` | Live organiser app and data | **Never.** Operator only. |
| Normal dev | `dpnnmkhabysfdogllsyh` | Thin, noncritical, not production-shaped | Allowed. CLI should stay linked here after any clone work. |
| Disposable clone | `yqjkuobcawvigsfpgrcm` | Production-shaped WP2.1 rehearsal | Allowed only when isolated (no Vercel, cron, webhooks, or edge functions). |

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
| WP2.1 | Campaign groups schema + F1 matcher + data cleanup | **Code is on a branch with an open PR. Production DB is not applied.** See below. |
| WP2.2–2.9 | Structure API, group UI, compare, list, editor, consumers, guides | **Not started.** |
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

### WP2.1 code release (current edge)

- Branch: `feat/oux-wp2.1-schema-migration` off `develop` at `4d2ff4b`.
- Commit: `8153d2b` — `feat(oux-wp2.1): add campaign groups schema foundation`.
- PR: [PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) **OPEN** into `develop` (ready, not draft). Mergeable, but GitHub reports **UNSTABLE** because CI failed.
- Vercel Preview: **success** at https://offshore-alliance-jn7u1dgkn-reveille-strategy.vercel.app
- CI `Validate Supabase migrations` on `8153d2b`: **FAILURE** ([run 34725536945](https://github.com/R3v3ill3/OffshoreAlliance/actions/runs/34725536945)). Cause: `actions/setup-node` `cache: pnpm` then unused-cache cleanup (`Path Validation Error`). This is a workflow-cache problem, not a migration-content failure. A local uncommitted edit already removes `cache: pnpm` from `.github/workflows/validate-migrations.yml`; that edit is **not** on the remote branch yet.
- Reviewer verdict already recorded: **APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**.
- Operator dated waiver (2026-09-13): skip normal-dev schema apply and e2e for this shipment. Thin-dev read-only `00` was clean (8 units / 111 memberships / 111 placements / F1 and H10 residual 0). That is a recorded gap, not a pass.

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

**Recovered-bytes gate:** an external checkout switch discarded uncommitted WP2.1 files; they were reconstructed and the recovered migration / exact `04` / exact `95` were re-run. The recovered **cleanup** script bytes were not re-executed. Production application must re-rehearse `03b_rollback → 03a_rollback → 03a → 03b → 04` on the clone and record green before touching production.

CLI v2.84.4 runs each migration file as one implicit pipelined transaction. A first `55006` failure rolled back all objects and the ledger row (atomicity proven). Successful applies emit PostgreSQL `25P01` on `SET CONSTRAINTS` because there is no explicit `BEGIN`; the flush still worked. Keep that warning as deployment evidence. Production must use rehearsed `supabase db push` or `psql -1`; never plain autocommit `psql -f`.

## What to do next (code vs database)

These are two separate tracks. A cloud agent can do Track A with GitHub + the repo. Track B is operator-only.

### Track A — finish the WP2.1 code shipment (do this first)

1. On `feat/oux-wp2.1-schema-migration`, commit the unused-cache CI fix already present locally in `.github/workflows/validate-migrations.yml` (remove `cache: pnpm` from `actions/setup-node`). Do not commit `supabase/.temp/*`.
2. Push the branch and confirm [PR #39](https://github.com/R3v3ill3/OffshoreAlliance/pull/39) checks go green. The Vercel preview is already green.
3. After CI is green, ask the operator to merge PR #39 into `develop` (squash, one commit). Agents do not merge without an explicit request.
4. After `develop` has WP2.1, ask the operator before opening or merging `develop` → `main`. Never push to `main`.
5. After merge to `main`, Vercel Production will deploy the F1 matcher and unused schema types. **That is still not a production database change.** Full mode keeps working. `groups_v2` remains unintroduced.
6. Then start WP2.2 only after the operator confirms whether production schema rollout should happen before or after the structure API work. The planned order is WP2.1 schema on the environments that will run WP2.2 writers, then WP2.2.

Git rules for any agent: no worktrees, no sub-branches, one commit per completed unit, every exact `git` command needs operator approval, never force-push, never skip hooks.

### Track B — production database rollout (later; operator only)

**Do not start Track B until** WP2.1 code/migration is on `main` **and** the operator explicitly chooses schema rollout. Agents prepare commands and stop.

See the runbook below.

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

1. Read this file, then `HANDOFF.md`, `DECISIONS.md`, `PROGRESS.md`, `wp/wp2.1.md`, and `scripts/data-hygiene/oux-wp2.1/README.md`.
2. Treat GitHub as source of truth for PR/CI/preview. As of 2026-09-13: PR #39 open; Vercel green; validate-migrations red on `cache: pnpm`.
3. Not run any production SQL, MCP query, or `supabase` command against `gteygwfgjvczanmrwgbr`.
4. Not run the app locally.
5. Finish Track A (CI fix → green checks → operator merge). Ask before every exact git command, before opening/merging PRs, and before any database mutation.
6. Update `PROGRESS.md` / `HANDOFF.md` only after evidence exists (CI green, merge SHAs, operator confirmation).
7. Leave Track B as a prepared operator run sheet unless the operator explicitly starts it.

Suggested opening prompt for a new orchestrating session:

> You are continuing the Organiser UX programme. Read `docs/organiser-ux-review/CURRENT_STATUS_AND_NEXT_STEPS.md` first. Phase 0/1 are live on production. WP2.3 is merged. WP2.1 code is in PR #39; production DB application is blocked. Your first job is Track A: get PR #39 CI green and ready for the operator to merge. Do not touch production. Do not introduce `groups_v2`. Follow `IMPLEMENTATION_ORCHESTRATION_PROMPT.md` for later packages.

## Open advisories (do not silently fold into a WP)

- WP2.3 fake PostgREST harness does not fully emulate projection / predicate / order.
- Nested-card drop bubbling can invoke move twice; characterisation pins current behaviour.
- Recovered WP2.1 cleanup bytes need a clone re-rehearsal before production.
- Normal-dev schema/e2e waiver is a conscious gap.
- Generated types: `campaign_worker_ou.Insert.group_id` required despite trigger; harmless `user_profiles_organiser_id_fkey` relationship ordering swap.
- `supabase/.temp/` still tracked.
- Production `00` must show `malformed_or_nonpositive_basis_units = 0` before relying on F1.
- Incidental: SOC wizard `cid` vs `campaign_id`; Users-dialog checklist reflow / hover-only tooltip.
- Human tasks still pending: usability baseline study; OVERVIEW clip; B1–B3 / C1–C3 (WP2.9).

## Definition of done for this handoff

A later agent can complete the programme from this file plus the repo if it can:

1. Explain that production organisers already have phase-1 UX and must not be “enabled” by more phase-1 SQL.
2. Point at PR #39, the CI failure, and the production DB gate without asking this chat.
3. Run Track A without touching production.
4. Hand the operator an exact, stop-gated Track B sequence when — and only when — the operator asks to apply WP2.1 on production.
