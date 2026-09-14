# WP2.2 — Structure API (transactional RPCs) and the end of direct client writes

Status: **approved 2026-09-13 (R1, M2-a, K1, G1; §0 sequence clarified). Revision 4 (2026-09-14): the integration branch is `main`. Implementation not started.**
Written 2026-09-13 against `develop` at `1666660` (main `5fe7c93`); revised 2026-09-14 against `main` at `f5529a4a`. Depends on WP2.1 (code merged via
PR #39 `de338b5` / #40 `82ff71c`; **schema applied to production 2026-09-13, cleanup and postflight
complete 2026-09-14 — `wp/wp2.1.md` §15; also on normal dev, found applied 2026-09-14**).

Branch: `feat/oux-wp2.2-structure-api` (cut from `develop` at `1666660` before `develop` was parked; `origin/main` at `f5529a4a` merged in with `--no-ff` on 2026-09-14). Draft [PR #41](https://github.com/R3v3ill3/OffshoreAlliance/pull/41) into **`main`** (retargeted from `develop` in Step 0 of `PHASE2_MAIN_ORCHESTRATION_PROMPT.md`, 2026-09-14). `develop` is parked and not used; see `PROGRESS.md` standing notes and §10 Revision 4.

This document follows `wp/README.md`: specification → plan → approval → deviations → verification →
review. §0 is placed first because the operator must answer it before any implementation stage can run
against a database.

### Decision labels used in this document (each label is unique; none is reused)

| Label | Topic | Section |
|---|---|---|
| **S1 / S2 / S3** | (superseded 2026-09-13 by the plain step table in §0) | §0 |
| **R1 / R2** | Recompute / universe-sync provenance fix | §3.8 |
| **R1-b** | Relabel of existing unattributed `rule` rows (only if R1) | §3.8 |
| **M2-a / M2-b** | When Employer placements are materialised | §3.7 |
| **K1 / K2** | Same-group copy: reject (E2) or silently convert to move | §3.4 |
| **G1** | Promotion gate: WP2.2 code must not reach `main` before production has WP2.1 + WP2.2a schema | §6.4 |

---

## 0. Where the schema has to be, and when (answered 2026-09-13)

**The short version.** Nothing about WP2.1 is re-tested anywhere. The clone rehearsal of WP2.1 stands and is
the basis for applying WP2.1 to production now. Dev is not a test bed for data; it is simply the database
the Vercel previews and the WP2.2 contract tests connect to, so it needs the same tables or the new code has
nothing to call. Each dev step is one `supabase db push`, no scripts, no rehearsal.

As written (2026-09-13): WP2.1's migration was on the clone only. **Update 2026-09-14:** production
`gteygwfgjvczanmrwgbr` now has it, with cleanup and a passing `04` (`wp/wp2.1.md` §15) — step 1 below is
done. Dev `dpnnmkhabysfdogllsyh` was found to have it too on 2026-09-14 (ledger row present, 4 groups, 8
units grouped, 111/111 placements and memberships, no view, no unique index) — step 2 is done. WP2.1
**code** is live on `main`.

| Step | Database | Who | What | Why |
|---|---|---|---|---|
| 1 | **Production** | operator (Track B) | **Done 2026-09-13/14** (`wp/wp2.1.md` §15): migration applied 2026-09-13; `04` stopped at 134 F1 residuals; `02a`/13 mappings/`02b`/`03a`/`03b` run 2026-09-14; `04` passed. | Code is already on `main`; PITR (7 days) is the safety margin; this also ends the `generated.ts` regen divergence (§2.7). Does not wait for WP2.2. |
| 2 | **Dev** | operator | **Done** (found applied 2026-09-14; `wp/wp2.1.md` §15.6). | Previews and contract tests connect to dev. |
| 3 | — | implementer | Build WP2.2: code + two new migrations (2.2a additive RPCs, 2.2b enforcement) + two small scripts (§3.7 materialisation, §3.8 relabel). | — |
| 4 | **Dev** | operator | `supabase db push` of 2.2a when Stage 1 is ready. | Contract tests (§4.2) and preview e2e (§4.5) need the RPCs. |
| 5 | **Clone** (optional, recommended) | operator links, implementer runs approved commands | One pass of the **new** SQL only: 2.2a forward/rollback/forward, `10_materialise…`, `20_relabel…`, 2.2b forward/rollback/forward (§4.4). | These files have never run anywhere; this is what caught the deferred-FK bug in WP2.1. It is not a re-test of WP2.1. With PITR in place the operator may skip it. |
| 6 | **Production** | operator (Track B) | **Revision 4 (`main`-based).** In this order, as one checklist with each step's output pasted back before the next file is handed over: 2.2a (run sheet) → operator merges [PR #41](https://github.com/R3v3ill3/OffshoreAlliance/pull/41) into `main` (the WP2.2 code deploys to Vercel Production and `gen-types.yml` regenerates from production, now with the RPC symbols) → `10_materialise…` → `20_relabel…` (R1-b) → `00_preflight` → `03b` only if H9 > 0 → `04_postflight` (WP2.1's gate; **before** 2.2b, because it asserts the deferred view and unique index are absent — clone finding, D27) → 2.2b (its own post-assertions are the WP2.2b postflight) → read-only WP2.2b check. Every mutating file carries `SET LOCAL oux.env = 'production';` after each `BEGIN;` and a read-only verification `SELECT` after the final `COMMIT;`. | 2.2a is compatible with the old writers, so it goes first; the code needs 2.2a, so the merge goes second (G1, §6.4); the two scripts and the preflight run against the deployed code's data; 2.2b adds the unique index and would fail on any duplicate created between the steps, hence the single preflight re-check immediately before it. There is no separate `develop → main` promotion any more: the merge of PR #41 **is** the code deploy. |

Production application of every migration and script is **operator-only**. Nothing in this plan runs
anything against `gteygwfgjvczanmrwgbr`, not even a read.

Operator answer (2026-09-13): sequence accepted as the clarification of the earlier S1/S2/S3 question; steps
1–2 are the operator's to schedule; step 5 remains optional at the operator's discretion.

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 Specification (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:144`)

> **WP2.2 Structure API.** High-risk implementer. Transactional RPCs or a single API route family for
> create, rename, reorder and delete group; create, split, merge, rename, set estimate and delete unit;
> assign, move and unassign workers within a group; with conflict rules from plan 5.5. Then switch every
> writer listed at the end of appendix A section 9 to it, package by package, leaving no direct client writes
> to the two tables. Acceptance: each RPC has a vitest-driven contract test against dev; the 28-file inventory
> shows zero remaining direct writes. Depends on WP2.1.

### 1.2 Binding additions from the orchestration prompt (WP2.2 must explicitly plan)

1. Transactional move/copy/merge/split.
2. Re-run H9 cleanup, then add `UNIQUE (worker_id, group_id)`, the duplicate-rejecting trigger and the
   `campaign_group_membership` view (security-invoker).
3. Materialise Employer placements (decision M2 from WP2.1).
4. Fix/review Recompute (it removes universe-sync rows).
5. Handle `campaign_worker_ou.Insert.group_id` being required in generated types at the API/RPC boundary.
6. Page/uncap `loadOuTargets`.
7. Do **not** introduce or consume `groups_v2` (WP2.4+).

### 1.3 Binding handoff from wp2.1.md

- §6.4 "Exact WP2.2 enforcement handoff" — the six ordered steps (RPCs → route the four wall-chart writers →
  page the OU loader → re-run H9 → enforcement migration `wp2_2_one_unit_per_group_enforcement` → only
  then may `campaign_group_membership` be consumed). This plan implements steps 1–5 and leaves step 6 to
  WP2.4.
- §2.3 — the exact `campaign_group_membership` definition and the consumption contract.
- §3.6 — the Recompute risk (`recompute-ou-assignments.ts:236–243` and `:338–345`).
- §4.4 — M2: Employer group exists with `group_id` on the 18 containers; no placement rows yet; WP2.2
  materialises them "through the structure API and relaxes the container trigger for units that have a
  `group_id`".
- E2 — the unique index, trigger check and view are WP2.2's; the non-unique `idx_cwo_worker_group` is to be
  dropped when the unique index lands.

### 1.4 Plan §5.5 "conflict rules" as this plan reads them

Plan §5.5 does not contain a list headed "conflict rules"; the rules are the partition semantics stated
there (`ORGANISER_UX_REVIEW_AND_PLAN.md:288–294`) plus §6 (`:391–393`, `:420`, `:424`, `:428`):

- Every group is a complete partition of the membership: each member is in exactly one unit of the
  group, otherwise in that group's derived **Unassigned** (never stored).
- Dropping on a group's Unassigned removes the worker from their unit **in that group** only.
- No nesting in the organiser's model; Employer → Worksite nesting is two groups; a member of a worksite
  child is placed in both the Worksite and the Employer group (the M2 backlog).
- "Split a unit" creates sibling units in the same group; `keep_in_parent` is removed from the split
  contract for same-group children.
- "Workers in two units of one group": keep the primary (or the latest) and log the rest (the H9 rule
  already implemented by `03b`).
- Writes to the two tables go through one transactional API.

§3.4 turns these into the explicit rule set C-a…C-l that each RPC enforces.

### 1.5 Not in WP2.2 (recorded so it is not folded in silently)

- `groups_v2`, the group view selector, per-group Unassigned rendering, `campaign_group_membership`
  consumption (WP2.4+; wp2.1.md §2.3 consumption contract).
- Group **UI**: the group RPCs (`structure_group_*`) ship with contract tests only. No screen creates,
  renames or deletes groups in WP2.2 (WP2.4/2.5).
- Dropping `is_group_container`, `ou_group_id`, `check_worker_ou_group_exclusivity`, or the legacy
  `split_campaign_organising_unit()` function (plan §6 "once every client writer has moved" — the DB
  retirement is a later, separately approved package; WP2.2 only stops **calling** the legacy split RPC).
- Updating the reporting views listed in plan §6 `:428`.
- WP2.3 advisories: fake PostgREST harness completeness, nested-card double `move` invocation, tracked
  `supabase/.temp/`, SOC wizard `cid` vs `campaign_id`. The double-invoke advisory becomes **harmless**
  under WP2.2 (the second call is an idempotent no-op returning `moved: 0`) and is noted in §8.2, not fixed.
- Reads of the two tables (selects) — they stay where they are.

---

## 2. Current-state map

### 2.1 Schema after WP2.1 (as applied on the clone; not yet on dev/production)

- `campaign_groups(group_id, campaign_id, kind, name, display_order, source_ou_id, …)`; unique
  `(campaign_id, lower(btrim(name)))`, partial unique `(campaign_id, kind) where kind <> 'custom'`,
  unique `source_ou_id` (`20260912035329:400–442`).
- `campaign_organising_units.group_id` nullable, FK `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`
  (`:505`), CHECK `cou_leaf_requires_group` (`:584`) — null only for legacy custom-kind containers.
  `trg_cou_y_default_group` (BEFORE; `cou_default_group()` `:610`) derives the group from
  `campaign_group_target_for_unit` + `campaign_group_ensure` (`:38`, `:95`); `trg_cou_z_after_group_change`
  (AFTER; `:678`).
- `campaign_worker_ou.group_id` NOT NULL, FK deferrable (`:513`), derive-only trigger
  `trg_cwo_z_set_group_id` / `cwo_set_group_id()` (`:722–743`) which **raises** when the unit has no group
  and deliberately does not reject duplicates (comment `:757`). Non-unique `idx_cwo_worker_group` (`:588`).
- Pre-existing triggers still active: `check_no_worker_on_group_container` (baseline `:1083–1102`, rejects
  any placement on `is_group_container = true`) and `check_worker_ou_group_exclusivity` (`:1209–1247`,
  one container per `ou_type` per campaign; returns early when the unit's `ou_group_id IS NULL`, so a
  placement on a container itself is **not** blocked by it — only by the container trigger).
- `assignment_source` CHECK allows only `'manual'`, `'rule'` (baseline `:9644`).
- RLS: `wp16_cou_*` / `wp16_cwo_*` and `campaign_groups_*` policies all reduce to
  `can_write_to_campaign(campaign_id)` (SECURITY DEFINER, baseline `:994`), so RLS-filtered
  `UPDATE`/`DELETE` return 2xx with zero rows.

### 2.2 The existing transactional precedent

`split_campaign_organising_unit(p_parent_ou_id int, p_sub_units jsonb, p_assignments jsonb,
p_keep_in_parent boolean default true) RETURNS TABLE(sub_index int, ou_id int)` (baseline `:6147–6238`) —
plpgsql, SECURITY INVOKER (default), inserts children, inserts placements `ON CONFLICT DO NOTHING`, deletes
parent rows only when `p_keep_in_parent = false`; granted to `anon, authenticated, service_role`
(`:30187–30189`). Called from `split-unit-dialog.tsx:436–441`. It is the model for "one function = one
transaction, RLS applies inside"; WP2.2 generalises it and tightens the grants (no `anon`).

`delete_campaign` (`20260909130000:75–126`) is the SECURITY DEFINER precedent with an explicit
`auth.uid()` / `is_admin` / lead / creator check. WP2.2 RPCs stay **SECURITY INVOKER** (RLS is the
authority) and add an explicit `can_write_to_campaign` pre-check so that permission failures raise
`42501` instead of silently affecting zero rows.

### 2.3 Direct writers today (the inventory the acceptance criterion counts)

Appendix A §9 lists 28 files that *reference* `campaign_organising_units`. Of those and the
`campaign_worker_ou` referencers, **21 non-test files write** to one of the two tables (regex
`.from(['"]campaign_(organising_units|worker_ou)['"])` followed by `.insert|.update|.upsert|.delete`,
including `as never` casts). All paths are under `apps/organising-db/src/`.

| # | File | Writes (line: op → table) | Package |
|---|---|---|---|
| 1 | `components/campaigns/wall-chart/move-worker-mutation.ts` | `:73–96` delete all placements of a worker (`toOuId: null`); `:169–230` insert target **then** delete source; `:146–167`, `:232–250` primary-flag migration; `:184–207`, `:265–289` keep-in-parent parent inserts | wall chart |
| 2 | `components/campaigns/wall-chart/merge-units-dialog.tsx` | `:54–93` upsert survivor placements, then delete source unit per id | wall chart |
| 3 | `components/campaigns/wall-chart/delete-organising-unit-dialog.tsx` | `:104–199` per-worker reassignment upsert / primary clear / delete, then children delete, then unit delete | wall chart |
| 4 | `components/campaigns/wall-chart/create-organising-unit-dialog.tsx` | `:324–486` single / add-to-existing / container+members inserts; `:447–453` display_order updates; `:455–474` placement inserts | wall chart |
| 5 | `components/campaigns/wall-chart/worker-detail-sheet.tsx` | `:1593`, `:1599` update `is_primary`; `:1611` delete placement | wall chart |
| 6 | `components/campaigns/wall-chart/unit-rating-control.tsx` | `:48` update `user_rating` | wall chart |
| 7 | `components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts` | `:97` update `display_order` loop | wall chart |
| 8 | `components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts` | `:211` delete placement (`as never`) | wall chart |
| 9 | `components/campaigns/campaign-units-section.tsx` | `:457`, `:544` insert units; `:588` update; `:633` upsert; `:747` update; `:758` delete (`as never`); `:798` upsert placements; `:804` delete | settings/units |
| 10 | `components/campaigns/campaign-wizard.tsx` | `:795` delete, `:816` update, `:840`, `:894` insert units; `:1102` delete, `:1118` insert placements `{ou_id, worker_id}` | settings/units |
| 11 | `components/campaigns/campaign-settings.tsx` | `:495` delete, `:504` update, `:518` insert units; `:579` delete, `:592` insert placements | settings/units |
| 12 | `lib/hooks/useRemoveWorkerFromCampaign.ts` | `:83` delete placements | hooks |
| 13 | `lib/hooks/use-allocate-workers-to-ou.ts` | `:44` insert placements (no `onConflict`) | hooks |
| 14 | `lib/campaign/recompute-ou-assignments.ts` | `:236–243` delete all `rule` rows when no rules; `:338–345` clear rule rows on non-container units; inserts of rule rows | lib |
| 15 | `lib/workers/sync-campaign-universe.ts` | `:297–312` upsert placements `onConflict "ou_id,worker_id" ignoreDuplicates` (writes `assignment_source: "rule"`, `:435`, `:535`); `:230–279` unpaged `loadOuTargets` | lib |
| 16 | `app/api/campaign-import/apply/route.ts` | `:525`, `:637` insert units; `:669`, `:676` upsert placements `{is_primary: true, assignment_source: "manual"}` | API routes |
| 17 | `app/api/campaigns/[id]/add-workers/route.ts` | `:146` insert; `:179` upsert placements | API routes |
| 18 | `app/api/campaigns/[id]/create-worker/route.ts` | `:284` upsert placement | API routes |
| 19 | `app/api/campaigns/[id]/workers/duplicates/route.ts` | `:130` delete placements (then `:215` `rpc("merge_workers")`) | API routes |
| 20 | `app/api/worker-import/organising-units/route.ts` | `:38` insert units | API routes |
| 21 | `app/api/worker-import/apply/route.ts` | `:261` upsert placements | API routes |
| 15a | `app/api/campaigns/[id]/sync-universe-workers/route.ts` (**sync-on-open**, added in Revision 4) | No direct write of its own: `:43` calls `syncCampaignUniverseFromEmployersWorksites` (row 15) with the user-session server client after a role check (`:30–41`, viewers rejected). What makes it a writer path is its caller: `components/campaigns/workforce/workforce-board.tsx:55–79` runs `useQuery(["sync-universe-workers", campaignId])`, which POSTs this route on every campaign-page mount for any user with `canWrite` (`enabled: canWrite`, 5-minute `staleTime`), so **opening a campaign writes to both tables** through row 15. On production on 2026-09-14 one page open enrolled 334 workers and inserted 233 placements (`wp/wp2.1.md` §15.3); it will be the first writer to meet the WP2.2b unique index. The same library function is also called from `campaign-settings.tsx:443` and `campaign-universe-section.tsx:255, 312` (user-initiated syncs; they ride row 15 too). | lib (via row 15) / API routes |

Plus: `wall-chart/split-unit-dialog.tsx:436–441` calls the legacy RPC (not a direct write, but §6.4 step 2
names it); `wall-chart/copy-worker-to-unit-dialog.tsx` writes only through `useMoveWorkersMutation`.

All API routes use the **user-session** server client (`lib/supabase/server.ts`), not the service-role
client, so RLS applies to them exactly as to the browser.

### 2.4 Why the current writers cannot satisfy one-unit-per-group

- Insert-before-delete (`move-worker-mutation.ts:169–230`) creates a transient duplicate
  `(worker_id, group_id)` — rejected outright once the unique index exists.
- Same-group copy (`copy-worker-to-unit-dialog` → move mutation with keep) and same-group split with
  `p_keep_in_parent = true` create permanent duplicates.
- Merge (`merge-units-dialog.tsx:54–93`) upserts survivor rows while source rows still exist.
- Every multi-statement writer is non-atomic: a failure between statements leaves partial state.
- `campaign_worker_ou.Insert.group_id: number` is required in `packages/db-types/generated.ts:9028–9037`;
  the writers compile only because the browser `createClient()` is untyped (`lib/supabase/client.ts`).
  Any move to a typed client would force callers to invent a trigger-derived value.

### 2.5 Recompute and universe-sync provenance (wp2.1.md §3.6)

`sync-campaign-universe.ts:435, 535` stamps universe placements `assignment_source: "rule"` with
`assigned_rule_id = NULL`. `recompute-ou-assignments.ts:236–243` deletes **every** `rule` row of a campaign
with no current rules and `:338–345` clears rule rows on all non-container units before re-inserting. Net:
a Recompute click removes universe-sync placements (234 rows across campaigns 26/42/57/64 on the clone).

### 2.6 The unpaged loader

`loadOuTargets` (`sync-campaign-universe.ts:230–279`) does one `.in("campaign_id", batch)` select per
batch with no `.range()`; PostgREST's max-rows setting silently truncates it. §6.4 step 3 requires paging
before any consumer relies on complete group membership.

### 2.7 Types-regeneration hazard (design constraint)

`.github/workflows/gen-types.yml` regenerates `packages/db-types/generated.ts` from **production** on
every `main` push touching `supabase/migrations/**` and auto-commits. Until production has a migration's
schema, its symbols are stripped on promotion (observed at `5fe7c93`; reconciled in `1666660`). Therefore:

- WP2.2 **never** relies on generated `Database["public"]["Functions"]` entries for the new RPCs; all
  RPC argument and result types are hand-written in the wrapper (§3.9).
- `pnpm gen:types` is run at most once, from **normal dev** after WP2.2a is applied there, with an explicit
  non-production `SUPABASE_PROJECT_REF`, only to keep `generated.ts` truthful for the table types.
- G1 (§6.4): promotion to `main` waits for production to have WP2.1 + WP2.2a; then the regen will contain
  the symbols and the develop/main divergence stops recurring.

---

## 3. Target design

### 3.1 Principles

1. **One RPC = one transaction.** Every structure mutation the app performs is a single
   `supabase.rpc(...)` call into a plpgsql `SECURITY INVOKER` function with `SET search_path = public,
   pg_temp`. RLS remains the authority; each function additionally pre-checks
   `can_write_to_campaign(p_campaign_id)` and raises `42501` so failures are never silent.
2. **Cross-campaign guard.** Every `ou_id`, `group_id`, `worker_id` argument is verified to belong to
   `p_campaign_id` (`22023 invalid_parameter_value`, message names the offending id).
3. **Rows affected are asserted in SQL.** `GET DIAGNOSTICS` after each statement; zero rows where one was
   expected raises `P0002 no_data_found`. This replaces the client-side `assertRowsAffected` idiom.
4. **Delete before insert, always.** Same-group displacement is performed before the new row is written,
   so the RPCs are correct both before and after the unique index (WP2.2b) exists.
5. **Derived values are never sent by clients.** `campaign_worker_ou.group_id` is set by the WP2.1
   trigger; the RPC bodies never write it. Clients send only `ou_id`/`worker_id`/`is_primary`/source.
6. **Unassigned is never materialised.** No RPC creates an "Unassigned" unit or a row for it.
7. **Full mode keeps working.** Every current writer's *observable* result is preserved, except the two
   E2-sanctioned changes listed under K1 (§3.4 C-c) and same-group split (C-k), which the operator approves
   here.
8. **Nothing removed, only relocated.** Legacy DB objects stay; only their *callers* move.
9. **No new flags.** The RPC path is not flag-gated (a flag would keep the legacy writers alive and defeat
   the "zero direct writes" acceptance). The gate is G1, not a runtime flag.

### 3.2 Naming, errors, grants

- Names: `structure_<noun>_<verb>` in `public`. Comments on every function cite `wp2.2.md §3.x`.
- Errors (SQLSTATE → meaning → client mapping in the wrapper):

  | SQLSTATE | Raised when | Wrapper `StructureApiError.kind` |
  |---|---|---|
  | `42501` | `can_write_to_campaign` false | `forbidden` |
  | `22023` | argument outside `p_campaign_id`, mixed groups where one is required, invalid enum value | `invalid_argument` |
  | `P0002` | referenced unit/group/placement not found or zero rows affected | `not_found` |
  | `23505` (constraint `campaign_worker_ou_one_unit_per_group`) | would create a second placement in the same group (copy same-group, split keep same-group, assign with `p_on_conflict = 'error'`) | `duplicate_in_group` |
  | `23505` (constraint `campaign_groups_campaign_name_key` / `campaign_groups_one_fixed_kind_per_campaign`) | group name/kind collision | `duplicate_group` |
  | `P0001` | business rule (e.g. deleting the survivor, container without `group_id` receiving a placement) | `rule_violation` |

  The `23505` before WP2.2b is raised **explicitly** by the RPC's pre-check with `USING errcode = '23505',
  constraint = 'campaign_worker_ou_one_unit_per_group'`; after WP2.2b the unique index and the trigger raise
  the same code and constraint name, so the client contract does not change when enforcement lands.
- Grants: `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role;` for every
  function (tighter than the legacy split RPC).
- Return shapes: `jsonb` objects with stable keys (`{ "ou_ids": [...], "moved": n, "displaced": n, … }`),
  validated in the wrapper with zod schemas. Tables are avoided so that adding a key is non-breaking.

### 3.3 RPC family

All functions take `p_campaign_id integer` first. `p_actor` is never a parameter (`auth.uid()` inside).

**Groups (contract tests only in WP2.2; no UI consumer)**

| Function | Behaviour |
|---|---|
| `structure_group_create(p_campaign_id, p_kind text, p_name text, p_display_order int default null)` | Wraps `campaign_group_ensure` for fixed kinds (idempotent: returns the existing group); for `custom`, inserts a new group with the given name. Returns `{ group_id, created bool }`. |
| `structure_group_update(p_campaign_id, p_group_id, p_name text default null, p_display_order int default null)` | Rename and/or reorder one group. Fixed-kind groups may be renamed (label only; `kind` is immutable). |
| `structure_group_reorder(p_campaign_id, p_group_ids int[])` | Sets `display_order` = array position for the listed groups; unlisted groups keep their order after the listed ones. |
| `structure_group_delete(p_campaign_id, p_group_id, p_mode text)` | `p_mode ∈ ('empty_only','cascade_units')`. `empty_only` raises `P0001` if any unit has `group_id`; `cascade_units` calls the unit-delete logic for each unit (placements removed, `ou_id` dependants handled as in `structure_unit_delete` with `p_reassignments = '[]'`). FK is `NO ACTION`, so units must be gone before the group row is deleted. |

**Units**

| Function | Behaviour |
|---|---|
| `structure_units_create(p_campaign_id, p_units jsonb, p_assignments jsonb default '[]')` | Batch create. Each element: `{ name, ou_type, description?, estimated_size?, display_order?, is_group_container?, parent_ou_id?, ou_group_id?, ou_group_name?, group_id? (custom only), unit_basis?, client_ref? }`. Inserts units in order (a `client_ref` may be referenced as `parent_ou_id`/`ou_group_id` by later elements, so containers-plus-members are one call). `group_id` may be given only for custom-kind units; for fixed kinds it must be null or equal the derived group (`22023`). Then applies `p_assignments` `[{ ou_ref, worker_id, is_primary?, source? }]` via the assign logic with `p_on_conflict = 'move'` semantics **within the created units' groups**. Returns `{ units: [{ client_ref, ou_id, group_id }] }`. Replaces create-dialog, wizard, settings, units-section, import and worker-import unit inserts. |
| `structure_unit_update(p_campaign_id, p_ou_id, p_patch jsonb)` | Whitelisted keys: `name, description, estimated_size, display_order, user_rating, leader_worker_id, unit_basis`. Raises `22023` on any other key. Fires the WP2.1 AFTER trigger as today for `name`. |
| `structure_unit_reorder(p_campaign_id, p_ou_ids int[])` | `display_order` = array position. Replaces `use-wall-chart-structure.ts:97` and `create-organising-unit-dialog.tsx:447–453`. |
| `structure_unit_delete(p_campaign_id, p_ou_id, p_reassignments jsonb default '[]', p_delete_children boolean default false)` | `p_reassignments` = `[{ worker_id, to_ou_id \| null, is_primary? }]` — per worker, either move the placement (same rules as `structure_placements_move`) or remove it. Any remaining placements on the unit (and on children when `p_delete_children`) are deleted. Children: when `p_delete_children = false`, children keep their rows (`parent_ou_id` FK is `SET NULL`; `ou_group_id` FK is `NO ACTION`, so members of a container **must** be deleted or detached first — the RPC detaches by setting `ou_group_id = null` only when the caller passes `p_delete_children = false` **and** the unit is a container; the delete dialog today deletes children first, `:104–199`, so the dialog passes `true`). All other `ou_id` dependants rely on their declared FK actions (§2.3 list in wp2.1.md / baseline: `campaign_ou_candidates.accepted_ou_id` SET NULL, `campaign_ou_coverage` CASCADE, `campaign_stage_workplan_tasks.assigned_ou_id` SET NULL, `campaign_unit_rules` CASCADE, `campaign_wocs.scope_ou_id` SET NULL, `campaign_worker_list_items.source_ou_id` SET NULL, `section_plan_workforce_mapping_overrides` CASCADE, `structure_test_results` CASCADE, `woc_scope_units` CASCADE, `campaign_groups.source_ou_id` SET NULL) — the RPC does not change those semantics. Returns `{ deleted_ou_ids, placements_moved, placements_removed }`. |
| `structure_unit_merge(p_campaign_id, p_survivor_ou_id, p_source_ou_ids int[])` | All units must share `group_id` (`22023` otherwise — merging across facets is not a merge). For each worker on a source: if absent from survivor → `UPDATE … SET ou_id = survivor` (preserves id, `assignment_source`, `assigned_rule_id`; `is_primary` preserved); if present → delete the source row and OR the `is_primary` flag onto the survivor row. Then re-points the *explicit* dependants the merge dialog would otherwise lose: `campaign_unit_rules.ou_id`, `campaign_ou_coverage.ou_id`, `woc_scope_units.ou_id`, `structure_test_results.ou_id`, `campaign_worker_list_items.source_ou_id`, `campaign_wocs.scope_ou_id`, `campaign_stage_workplan_tasks.assigned_ou_id`, `campaign_ou_candidates.accepted_ou_id`, `section_plan_workforce_mapping_overrides.worksite_ou_id` → survivor (`ON CONFLICT DO NOTHING` where a unique key exists; the implementer enumerates each table's unique keys in the deviations log), then deletes the source units. Returns `{ moved, collapsed, deleted_ou_ids }`. |
| `structure_unit_split(p_campaign_id, p_source_ou_id, p_children jsonb, p_assignments jsonb, p_keep_in_source boolean default false, p_group_id int default null)` | Children are created via the same element shape as `structure_units_create` (default `ou_type` = source's; `parent_ou_id` = source when the caller keeps today's nested shape). Each child's group is derived by the trigger; `p_group_id` may pin custom children to a specific custom group. For each `{ child_ref, worker_id }`: if the child's group = source's group → the source placement is **moved** (C-k; `p_keep_in_source` is ignored and reported as `displaced`); if different → insert a new placement and honour `p_keep_in_source`. Returns `{ children: [{ client_ref, ou_id, group_id }], moved, copied, kept }`. The legacy `split_campaign_organising_unit` is left in place, uncalled. |
| `structure_units_bulk_save(p_campaign_id, p_delete_ou_ids int[], p_updates jsonb, p_creates jsonb)` | Transactional replacement for the wizard/settings "save units" sequences (`campaign-wizard.tsx:795–894`, `campaign-settings.tsx:495–518`, `campaign-units-section.tsx`): deletes (via unit-delete logic, no reassignment), then updates (`structure_unit_update` logic per element), then creates (`structure_units_create` logic). Returns `{ deleted_ou_ids, updated_ou_ids, created: [...] }`. |

**Placements**

| Function | Behaviour |
|---|---|
| `structure_placements_assign(p_campaign_id, p_ou_id, p_worker_ids int[], p_source text default 'manual', p_is_primary boolean default false, p_on_conflict text default 'skip')` | Batch assign to one unit. Rejects containers without `group_id` (`P0001`, today's container rule) and `p_source` outside the CHECK list (`22023`). Per worker: if already on `p_ou_id` → no-op (`skipped`); else if the worker already has a placement in the unit's group: `skip` → leave it; `move` → `UPDATE` that row to `p_ou_id`; `error` → `23505`. Otherwise insert. When `p_is_primary`, clears the campaign-wide primary first (C-h). Returns `{ inserted, moved, skipped }`. Replaces every upsert/insert of placements in the inventory (rows 4, 9, 10, 11, 13, 15, 16, 17, 18, 21). |
| `structure_placements_move(p_campaign_id, p_worker_ids int[], p_from_ou_id int default null, p_to_ou_id int default null, p_within_group_id int default null, p_keep_source boolean default false)` | The wall-chart move. `p_to_ou_id` null → unassign: with `p_within_group_id` remove only that group's placements (per-group Unassigned drop, plan §5.5); without → strip all campaign placements (today's full-mode `toOuId: null`, `move-worker-mutation.ts:73–96`). With a target: for each worker, delete any placement in the target's group other than the source row (`displaced`), then `UPDATE` the source row's `ou_id` (or insert `manual` when there is no source row, e.g. from Unassigned). `p_keep_source = true` (copy) is honoured only when source and target groups differ (C-c); same-group → `23505` under K1. Primary flag: carried with the moved row; if a displaced/removed row was the campaign primary and the worker keeps other placements, the moved/target row becomes primary (matches `:146–167`, `:232–250`). Returns `{ moved, inserted, displaced, removed }`. |
| `structure_placements_unassign(p_campaign_id, p_worker_ids int[], p_ou_id int default null, p_within_group_id int default null)` | Thin alias of the unassign branch above for readability at the call sites (`use-wall-chart-actions.ts:211`, `worker-detail-sheet.tsx:1611`, `useRemoveWorkerFromCampaign.ts:83`, `duplicates/route.ts:130`). `p_ou_id` set → remove that one placement; `p_within_group_id` → that group; neither → all. |
| `structure_placements_set_primary(p_campaign_id, p_worker_id, p_ou_id)` | Clears the worker's other `is_primary` rows in the campaign, sets this one (`worker-detail-sheet.tsx:1593–1599`). |
| `structure_placements_replace_rule_rows(p_campaign_id, p_rows jsonb)` | Recompute's single writer (§3.8): deletes the campaign's rows with `assignment_source = 'rule'` (scope per R1/R2), then inserts `p_rows` `[{ ou_id, worker_id, assigned_rule_id }]` as `rule` with `p_on_conflict = 'skip'` semantics against existing `manual`/`universe` rows. Returns `{ removed, inserted, skipped }`. |
| `structure_materialise_employer_placements(p_campaign_id)` | M2 (§3.7). Returns `{ inserted, skipped_existing, containers }`. |

### 3.4 Conflict rules (explicit; each is a contract test)

| Rule | Statement | Enforced by |
|---|---|---|
| **C-a** | A worker has at most one placement per `(campaign, group)`. | Every RPC deletes/moves the existing same-group row before writing; WP2.2b adds the unique index and trigger check. |
| **C-b** | Move onto a unit displaces the worker's existing placement in the **target's** group (whatever unit it is on) and removes the source placement. *Fix round 1 note (D17):* the legacy `trg_check_worker_ou_group_exclusivity` (baseline `:22421`, BEFORE INSERT OR UPDATE OF `ou_id`) still refuses, with `P0001` → `rule_violation`, a move between worksites of two **different** Employer containers, because during BEFORE UPDATE the re-pointed row is still visible with its old `ou_id`. Not a regression (today's insert-before-delete fails the same way); pinned by a contract test. | `structure_placements_move`. |
| **C-c** | Copy (keep source) is allowed only across groups. **K1 (recommended):** same-group copy raises `23505 duplicate_in_group` and the UI shows "already in this group — use Move". **K2:** silently convert to move. K1 is the E2 handoff's stated semantics ("copy_worker_placement (cross-group only)"). | `structure_placements_move` with `p_keep_source`. |
| **C-d** | Dropping on a group's Unassigned removes only that group's placement; the legacy global Unassigned removes all. | `p_within_group_id` vs null. |
| **C-e** | Legacy containers accept placements only when they carry a `group_id` (Employer-group units after WP2.1). Custom-kind containers (`group_id IS NULL`) still reject. | `check_no_worker_on_group_container()` relaxed in WP2.2a (§3.6) + RPC `P0001`. |
| **C-f** | Unassigned is derived, never stored; no RPC creates such a row or unit. | Code review + contract test asserting no unit named "Unassigned" is ever created by any RPC. |
| **C-g** | Fixed-kind units get their group from `ou_type` (trigger); callers cannot choose it. Custom units may be pinned to a custom group. | `structure_units_create` / `_split` argument validation. |
| **C-h** | `is_primary` is campaign-wide single-valued (today's semantics). RPCs never leave two primaries or zero primaries when a worker still has placements. | `_assign`, `_move`, `_merge`, `_delete`, `_set_primary`. |
| **C-i** | Every id argument must belong to `p_campaign_id`. | `22023` pre-check. |
| **C-j** | Merge requires all units in one group; the survivor cannot be a source. *Fix round 1 note (D17):* merging worksites of two different Employer containers is refused by the same legacy trigger (`P0001` → `rule_violation`), as the merge dialog's upsert is today; pinned by a contract test. | `structure_unit_merge`. |
| **C-k** | Same-group split children take the worker **out** of the source (siblings partition the group); `p_keep_in_source` applies only to cross-group children. | `structure_unit_split`. Full-mode behaviour change sanctioned by E2/§6.4 step 1; approved here. |
| **C-l** | Provenance is preserved on move/merge (`assignment_source`, `assigned_rule_id`, `id`); new rows from user actions are `manual`. | `UPDATE … SET ou_id` rather than delete+insert wherever a source row exists. |

### 3.5 Migration WP2.2a — `wp2_2_structure_api`

File: `supabase/migrations/<UTC ts>_wp2_2_structure_api.sql` (created with `npx supabase migration new
wp2_2_structure_api`, after operator approval of that command). One transaction. Additive and **compatible
with the legacy writers**, so it can be applied before the code deploy (required by the production order in
§6.4).

Sections, in order:

1. `assignment_source` CHECK widened to `('manual','rule','universe')` — **only if R1** (§3.8). Implemented
   as `ALTER TABLE … DROP CONSTRAINT campaign_worker_ou_assignment_source_check; ADD CONSTRAINT … CHECK (…)
   NOT VALID; VALIDATE CONSTRAINT …` to avoid a full-table exclusive scan under lock.
2. `CREATE OR REPLACE FUNCTION check_no_worker_on_group_container()` — relaxed (C-e): reject only when
   `is_group_container AND group_id IS NULL`. Comment cites M2 and this section.
3. Internal helpers (plpgsql, `SECURITY INVOKER`, not granted to clients):
   `structure__assert_can_write(p_campaign_id)`, `structure__assert_unit_in_campaign(p_campaign_id, p_ou_id)`,
   `structure__group_of_unit(p_ou_id)`, `structure__place(...)` (the shared assign/move core),
   `structure__delete_unit_rows(...)`. Double underscore marks "internal"; revoked from `PUBLIC, anon,
   authenticated` and executable only because the public RPCs are `SECURITY INVOKER` owned by `postgres`
   — the implementer confirms on the clone that a direct `authenticated` call to a helper fails with
   `42501` (role probe, §4.4).
4. The public RPCs of §3.3, each with `COMMENT ON FUNCTION`.
5. `structure_materialise_employer_placements` (§3.7).
6. Grants (§3.2).
7. Post-assertions in a `DO` block: every function exists with the expected argument signature; the
   relaxed trigger function's `prosrc` contains `group_id IS NULL`.

Rollback (`scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql`, recovery-only): drop the
functions in reverse dependency order, restore the baseline `check_no_worker_on_group_container()` body
verbatim, restore the two-value CHECK **only if no `universe` rows exist** (the script raises otherwise
and prints the count).

### 3.6 Migration WP2.2b — `wp2_2_one_unit_per_group_enforcement`

Exactly wp2.1.md §6.4 step 5, in one transaction, in a **separate file** so the operator can apply it on
production only after the code deploy and the H9 re-count (production order §6.4):

1. Precondition `DO` block: `SELECT worker_id, group_id FROM campaign_worker_ou GROUP BY 1,2 HAVING
   count(*) > 1`; if any → `RAISE EXCEPTION 'H9 = %; run scripts/data-hygiene/oux-wp2.1/03b_resolve_future_group_conflicts.sql first'`.
2. `DROP INDEX idx_cwo_worker_group;`
3. `CREATE UNIQUE INDEX campaign_worker_ou_one_unit_per_group ON campaign_worker_ou (worker_id, group_id);`
   (plain `CREATE UNIQUE INDEX` inside the transaction; the table is small — 1,400-row order — so
   `CONCURRENTLY` is not needed and would forbid the single-transaction rule.)
4. `CREATE OR REPLACE FUNCTION cwo_set_group_id()` — same derivation plus: `IF EXISTS (SELECT 1 FROM
   campaign_worker_ou x WHERE x.worker_id = NEW.worker_id AND x.group_id = v_group_id AND x.id IS DISTINCT
   FROM NEW.id) THEN RAISE unique_violation USING constraint = 'campaign_worker_ou_one_unit_per_group',
   message = …` (errcode `23505`). The pre-check gives a readable message; the index is the guarantee.
5. `CREATE VIEW campaign_group_membership WITH (security_invoker = true) AS …` verbatim from wp2.1.md §2.3;
   `REVOKE ALL … FROM PUBLIC, anon; GRANT SELECT … TO authenticated, service_role;`
6. Post-assertions: index exists and is unique; H9 = 0; view row arithmetic (for each campaign,
   `count(view rows) = count(groups) × count(members)` — one row per (group, member) because of the
   `LEFT JOIN` on a now-unique key).

Rollback (`91_rollback_wp2_2_enforcement.sql`): drop view, restore the WP2.2a-era derive-only
`cwo_set_group_id()`, drop the unique index, recreate `idx_cwo_worker_group`.

**No application code consumes the view in WP2.2** (wp2.1.md §2.3 contract; §1.5).

### 3.7 M2 — Employer placements

`structure_materialise_employer_placements(p_campaign_id)`:

- For each container unit `c` with `is_group_container AND group_id IS NOT NULL` (the Employer-group units)
  and each worker `w` who has a placement on a non-container unit `u` with `u.ou_group_id = c.ou_id` (the
  worksite children), insert one row `(c.ou_id, w, is_primary = false, assignment_source = <'universe' under
  R1 | 'rule' under R2 with assigned_rule_id NULL>)` unless `w` already has a placement in `c.group_id`
  (`skipped_existing`). At most one Employer placement per worker per campaign: when a worker's children span
  two containers (should be 0 after `03b`; asserted), choose the container of the worker's primary
  placement, else the lowest `c.ou_id`.
- Idempotent; safe to re-run.
- Going forward, `sync-campaign-universe.ts` includes containers with `group_id` in `loadOuTargets`
  (today it excludes containers) and assigns through `structure_placements_assign(p_on_conflict = 'skip')`,
  so new members get their Employer placement at sync time. The implementer confirms the exact exclusion
  predicate at `:230–279` and records it in the deviations log.

**When to run (operator decision):**

- **M2-a (recommended):** not in a migration. Script
  `scripts/data-hygiene/oux-wp2.2/10_materialise_employer_placements.sql` (env-guarded like the WP2.1
  scripts; `SET LOCAL oux.env` rule applies to production) calls the RPC for every campaign and prints
  before/after counts. Rehearsed on the clone (§0 step 5, optional), run on production by the operator after the code deploy
  (Track B). Keeps WP2.2a's `campaign_worker_ou` count invariant ("unchanged") checkable.
- **M2-b:** call it from WP2.2a's migration body. Rejected: ties ~1,400 row inserts to the schema change
  and breaks the "additive, compatible with old writers" property (old full-mode moves would not maintain
  the rows — though the new writers do).

Full-mode observables that change once materialised (recorded; operator approves): the multi-unit
indicator (`is_multi_unit_member`), `unitsByWorker`, the Units tab rows, and the wall chart's
`parentExclusiveWorkersByOu` will show the Employer container as a unit the worker is in. The e2e in §4.5
asserts the wall chart still renders and that a worksite member appears in exactly one worksite card.

### 3.8 Recompute and universe-sync provenance

Two designs; **R1 recommended**.

- **R1 — a third provenance value.** Widen the CHECK to include `'universe'` (WP2.2a §1).
  `sync-campaign-universe.ts:435, 535` write `'universe'`; `structure_materialise_employer_placements`
  writes `'universe'`; Recompute (`structure_placements_replace_rule_rows`) deletes **only**
  `assignment_source = 'rule'`. Clear, testable, visible in the data. Existing production rows created by
  the sync before WP2.2 remain `'rule'` with `assigned_rule_id IS NULL` and would still be removed by the
  next Recompute — hence **R1-b**: optional script `20_relabel_unattributed_rule_rows.sql` (`UPDATE … SET
  assignment_source = 'universe' WHERE assignment_source = 'rule' AND assigned_rule_id IS NULL`), env-guarded,
  operator-run, rehearsed on the clone with a printed count (expected 234-order on the clone). Without R1-b
  the pre-existing risk is unchanged, not worsened.
- **R2 — attribution only.** No new value. Recompute withdraws only rows with `assigned_rule_id IS NOT NULL`
  or on units that currently have live rules; new Recompute writes always set `assigned_rule_id`. Avoids a
  CHECK change but leaves `'rule'` ambiguous forever and depends on `campaign_unit_rules` history.

Under either, `recompute-ou-assignments.ts` keeps its planning logic and replaces its three write sites
with one `structure_placements_replace_rule_rows` call per campaign (the RPC receives the full desired
rule-row set; §2.3 row 14).

### 3.9 Typing boundary — `apps/organising-db/src/lib/campaign/structure-api.ts`

```ts
export type StructureRpcName = "structure_group_create" | … | "structure_materialise_employer_placements";
export interface StructureApiError extends Error { kind: "forbidden" | "invalid_argument" | "not_found" | "duplicate_in_group" | "duplicate_group" | "rule_violation" | "unknown"; code: string; constraint?: string; hint?: string }
export function structureApi(client: SupabaseClient) {
  return {
    groups:     { create, update, reorder, remove },
    units:      { create, update, reorder, remove, merge, split, bulkSave },
    placements: { assign, move, unassign, setPrimary, replaceRuleRows, materialiseEmployer },
  };
}
```

- Argument types are hand-written interfaces; results are parsed with zod schemas (zod is already a
  dependency — confirm in `package.json`; if not, hand-written narrowing functions are used instead — no
  new dependency without approval).
- `client.rpc(name, args)` is the only call; `PostgrestError` → `StructureApiError` via `code` and the
  `constraint` extracted from `details`/`message`.
- Works with both the untyped browser client and the server client; the API routes construct it from the
  user-session server client, so RLS semantics are unchanged.
- **No `campaign_worker_ou.Insert` / `Update` or `campaign_organising_units.Insert` object is constructed
  anywhere in `src/` after WP2.2**, which is how the generated `group_id: number` requirement is "handled
  at the boundary": the boundary never builds those types.
- A guard test `src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` (node, no DB) scans `src/`
  (excluding `__tests__`) with the §2.3 regex and asserts **zero** matches; it is the automated form of the
  acceptance criterion and fails the build on regression.

### 3.10 `loadOuTargets` paging

`.order("ou_id", { ascending: true }).range(from, from + PAGE_SIZE - 1)` loop per campaign batch until a
short page (`PAGE_SIZE = 1000`, exported for tests). Filter widened for M2 (§3.7). Tests in
`sync-campaign-universe.test.ts` use the existing fake-client pattern with 2,500 synthetic rows and assert
every row is returned and the request count is `ceil(n / PAGE_SIZE)`.

### 3.11 Writer switch table (package by package; the PR must show every row done)

| # (§2.3) | File | Replacement |
|---|---|---|
| 1 | `move-worker-mutation.ts` | `placements.move` (one call per mutation; `toOuId: null` → unassign-all; new optional `withinGroupId` param reserved for WP2.4, unused now). `keepInParent` parent inserts (`:184–207`, `:265–289`) become part of the RPC's move (the parent, being a container with `group_id`, is now a legal target under C-e; when the parent has no `group_id` the RPC skips it and reports `skipped`). `onSettled` invalidations unchanged. |
| 2 | `merge-units-dialog.tsx` | `units.merge`. |
| 3 | `delete-organising-unit-dialog.tsx` | `units.remove` with `reassignments` built from the dialog's per-worker choices and `deleteChildren: true` (today's order). |
| 4 | `create-organising-unit-dialog.tsx` | `units.create` (single / add-to-existing / container+members are three payload shapes of one call, with `assignments`); the display-order loop → part of the same call (`display_order` on each element). |
| 5 | `worker-detail-sheet.tsx` | `placements.setPrimary`; `placements.unassign({ ouId })`. |
| 6 | `unit-rating-control.tsx` | `units.update({ user_rating })`. |
| 7 | `use-wall-chart-structure.ts` | `units.reorder`. |
| 8 | `use-wall-chart-actions.ts` | `placements.unassign({ ouId })` per ref, batched by unit. |
| 9 | `campaign-units-section.tsx` | `units.bulkSave` for the unit CRUD; `placements.assign` / `placements.unassign` for the member editor (`:798`, `:804`). |
| 10 | `campaign-wizard.tsx` | `units.bulkSave` (`:795–894`); `placements.unassign` + `placements.assign` (`:1102`, `:1118`). Wizard `cid` vs `campaign_id` advisory untouched. |
| 11 | `campaign-settings.tsx` | same as 10. |
| 12 | `useRemoveWorkerFromCampaign.ts` | `placements.unassign` (all) — the membership delete that follows stays as is (not one of the two tables). |
| 13 | `use-allocate-workers-to-ou.ts` | `placements.assign(onConflict: 'skip')` — today's insert has no `onConflict`, so a duplicate `(ou_id, worker_id)` currently errors; the hook's callers are checked and `skip` vs `error` chosen per caller (recorded in deviations). |
| 14 | `recompute-ou-assignments.ts` | `placements.replaceRuleRows` (one call per campaign). |
| 15 | `sync-campaign-universe.ts` | `placements.assign(source: 'universe' \| 'rule' per R, onConflict: 'skip')` per target unit; `loadOuTargets` paged (§3.10). |
| 15a | `sync-universe-workers/route.ts` + `workforce-board.tsx:55–79` (sync-on-open) | Routed through the structure API by row 15: the route keeps calling `syncCampaignUniverseFromEmployersWorksites`, which after row 15 writes only through `placements.assign` (`source: 'universe'`, `onConflict: 'skip'`), so a page open is safe both before and after WP2.2b (a worker already placed in the target's group is skipped, never duplicated). WP2.2 does **not** change *when* the sync runs: the mount query, its `enabled: canWrite` and `staleTime` stay as they are; whether sync-on-open survives at all is WP2.4's decision (`PROGRESS.md` incidental findings). The guard test lists this route among the writer paths it documents and additionally asserts the route file contains no `.from("campaign_organising_units")` / `.from("campaign_worker_ou")` call, so a later direct write there cannot slip past the regex inventory. |
| 16 | `campaign-import/apply/route.ts` | `units.create` (`:525`, `:637`, with `client_ref` for the container→member link); `placements.assign(isPrimary: true, source: 'manual', onConflict: 'skip')`. |
| 17 | `add-workers/route.ts` | `units.create`; `placements.assign`. |
| 18 | `create-worker/route.ts` | `placements.assign`. |
| 19 | `workers/duplicates/route.ts` | `placements.unassign` (all, for the duplicate worker) before `merge_workers`. |
| 20 | `worker-import/organising-units/route.ts` | `units.create`. |
| 21 | `worker-import/apply/route.ts` | `placements.assign`. |
| — | `split-unit-dialog.tsx:436–441` | `units.split`; the legacy RPC is no longer called. |

`copy-worker-to-unit-dialog.tsx` gains the K1 error message mapping only.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run in `pnpm test`

- `structure-api.test.ts`: error mapping (`PostgrestError` → `StructureApiError` for each SQLSTATE/constraint
  in §3.2); argument serialisation for every wrapper method; result schema parsing rejects malformed shapes.
- `no-direct-structure-writes.test.ts`: the §3.9 guard.
- `sync-campaign-universe.test.ts`: paging (§3.10); `'universe'` source under R1; container-with-group
  inclusion.
- `recompute-ou-assignments` tests: the planner produces the `p_rows` set and calls the RPC exactly once
  per campaign; no direct table calls (fake client records `rpc` invocations).
- Existing wall-chart interaction tests (WP2.3) updated so their fake client answers `rpc(...)` instead of
  `from(...).insert` chains; assertions on **observable** outcomes are kept byte-for-byte (query
  invalidations, toasts, dialog closes). The WP2.3 harness's `rpc` support is extended minimally (the
  "fake PostgREST harness incomplete" advisory is **not** otherwise addressed).

No test is skipped, quarantined or deleted. Test count must be ≥ today's 1,118.

### 4.2 Contract tests (vitest, DB-backed) — `pnpm test:contract`

New config `apps/organising-db/vitest.contract.config.ts` (`include: src/**/__contract__/**/*.contract.test.ts`,
`environment: node`, `testTimeout: 30_000`, `fileParallelism: false`) and script
`"test:contract": "vitest run -c vitest.contract.config.ts"`. Kept out of `pnpm test` so the default suite
stays hermetic; this is an environment-gated integration suite, not a skipped test (recorded as a
deliberate design choice for approval).

- File: `src/lib/campaign/__contract__/structure-api.contract.test.ts`.
- Environment: `OUX_CONTRACT_SUPABASE_URL`, `OUX_CONTRACT_SUPABASE_ANON_KEY`, `OUX_CONTRACT_USER_EMAIL`,
  `OUX_CONTRACT_USER_PASSWORD` (a user with write permission on its own campaigns — the existing e2e user
  qualifies; values live only in the operator's/implementer's shell, never printed or stored). The suite
  **throws** (does not skip) if the URL host is `gteygwfgjvczanmrwgbr.supabase.co`, mirroring
  `tests/e2e/roles/campaign-cleanup.ts:106–113`; it fails with a clear message when the variables are
  absent, so an accidental "green because nothing ran" is impossible.
- Fixture: `beforeAll` signs in with `@supabase/supabase-js` (already a dependency), creates one campaign
  named `WP2.2 contract <runId>` through the same REST insert the e2e cleanup helper uses (not a product
  campaign-creation path), plus employer/worksite/custom units and a handful of members; `afterAll`
  deletes the campaign (cascade) and asserts zero leftover rows. A second signed-in client for a user
  **without** write permission exercises `42501` (`E2E_FOREIGN_CAMPAIGN_ID` pattern).
- One `describe` per RPC; each conflict rule C-a…C-l has at least one `it`. Each test asserts the
  **database state** after the call (rows per `(worker, group)`, `is_primary` invariant, dependants
  re-pointed after merge, source rows gone after same-group split) and the returned counts.
- Atomicity tests: a payload that is valid for its first element and invalid for its second must leave
  zero rows changed.
- Enforcement-agnostic: the suite passes on a database with WP2.2a only **and** with WP2.2b applied (the
  duplicate tests accept the RPC pre-check's `23505` or the index's `23505`, same constraint name). Run
  twice on normal dev (before and after WP2.2b) and once on the clone; all three outputs are pasted in §9.
- *Fix round 1 (D18):* `OUX_CONTRACT_FOREIGN_CAMPAIGN_ID` is **required** (the forbidden-campaign test
  always runs); the foreign-user pair is optional but must be set as a pair. The only skip the suite can
  produce is the foreign-user test, named as such; **every Stage 3 paste must report the skipped count.**

### 4.3 Migration validation (CI + local)

`pnpm validate:migrations` for both files (filename/timestamp rules of `scripts/validate-supabase-migrations.mjs`).
`supabase db push --dry-run` output pasted for dev.

### 4.4 Clone rehearsal (§0 step 5, optional; operator links the CLI, implementer runs only the approved commands)

In order, each output pasted in §9: `00_preflight_hazards.sql` (H9 count) → WP2.2a forward → `90` rollback →
WP2.2a forward → `10_materialise_employer_placements.sql` (before/after counts; re-run → `inserted = 0`) →
(R1-b if approved) `20_relabel…` → `03b` if H9 > 0 (with the WP2.1 STOP rules) → WP2.2b forward → `91`
rollback → WP2.2b forward → contract suite against the clone (if credentials are supplied) → role probes
(`95_role_probes.sql` extended with: `authenticated` cannot execute `structure__*` helpers; `anon` cannot
execute any `structure_*`). Relink CLI to normal dev immediately after; `git status` must show no
`supabase/.temp/*` change staged.

### 4.5 e2e (Playwright, Vercel preview of the feature branch → normal dev)

New `tests/e2e/structure-api.spec.ts`, using the WP1.6/WP2.3 fixtures and `restClientFor`:

1. Wall chart: drag a worker from unit A to unit B in the same worksite group → exactly one placement in
   that group afterwards (REST read); drag to Unassigned → zero.
2. Copy dialog same-group → the K1 message is shown, state unchanged; cross-group copy → two placements.
3. Split dialog with same-group children → source no longer holds the moved workers (C-k).
4. Merge → survivor holds the union; source units gone; unit rules re-pointed (REST read of
   `campaign_unit_rules`).
5. Settings "save units" round trip via `bulkSave`.
6. Role: the `user` role without campaign write permission gets a visible error, not a silent no-op
   (`unit-lifecycle-user.spec.ts` pattern).

Existing e2e (`wall-chart.spec.ts`, `wall-chart-decomposition.spec.ts`, `roles/*`) must stay green.

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit
pnpm --filter organising-db lint           # touched lines clean; total warnings ≤ 294
pnpm --filter organising-db test           # ≥ 1,118 tests, 0 skipped by WP2.2
pnpm validate:migrations

# acceptance: zero direct writes (also enforced by the guard test)
rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = no matches = pass)"

# contract tests (normal dev only; env in shell, never printed)
cd apps/organising-db && OUX_CONTRACT_SUPABASE_URL=… OUX_CONTRACT_SUPABASE_ANON_KEY=… OUX_CONTRACT_USER_EMAIL=… OUX_CONTRACT_USER_PASSWORD=… pnpm test:contract

# migrations on normal dev (operator-approved, CLI linked to dpnnmkhabysfdogllsyh)
npx supabase link --project-ref dpnnmkhabysfdogllsyh
npx supabase db push --dry-run && npx supabase db push

# types (once, dev only, after WP2.2a is on dev)
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types && git diff --stat packages/db-types/generated.ts

# e2e against the branch preview (credentials from the operator's shell)
cd apps/organising-db && PLAYWRIGHT_BASE_URL=<preview-url> pnpm exec playwright test tests/e2e/structure-api.spec.ts tests/e2e/wall-chart.spec.ts tests/e2e/roles
```

Project-ref safety: before any `supabase` command, `cat supabase/.temp/project-ref` must print
`dpnnmkhabysfdogllsyh` or `yqjkuobcawvigsfpgrcm`; the implementer stops if it prints anything else.
Never `pnpm dev`/`pnpm start`.

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages (each ends with the checks that can run at that point)

| Stage | Content | Needs DB? |
|---|---|---|
| 0 | This plan + ledger updates (already in the working tree). | No |
| 1 | WP2.2a + WP2.2b migration files, rollback scripts, hygiene scripts `10`/`20`, `structure-api.ts` wrapper, wrapper unit tests, guard test (initially **failing** — documents the 21 files), `validate:migrations`. | No |
| 2 | Operator: apply WP2.1 + WP2.2a to normal dev (§0 steps 2 and 4); optional clone pass (§0 step 5, §4.4). | Yes (operator) |
| 3 | Contract suite green on dev (and clone if credentials). | Yes |
| 4 | Writer switch — wall chart package (rows 1–8 + split dialog); WP2.3 interaction tests updated; preview e2e items 1–3. | Preview |
| 5 | Writer switch — settings/wizard/units-section + hooks (rows 9–13); preview e2e items 4–6. | Preview |
| 6 | Writer switch — lib + API routes (rows 14–21), `loadOuTargets` paging, Recompute; guard test turns green; full e2e; `gen:types` from dev. | Preview |
| 7 | Verifier output pasted (§9.2); fresh reviewer (max two fix rounds, §9.3); PROGRESS.md updated with evidence. | — |

### 6.2 Commits

Programme rule: one commit per completed unit; the feature branch integrates on `main` (Revision 4: it was cut
from `develop` before `develop` was parked and has since merged `origin/main` with `--no-ff`; from here it
only ever merges `main` in, never rebases). Proposed units = Stage 1, Stage 3, Stage 4, Stage 5, Stage 6,
Stage 7 (six commits, squash-merged by the PR as with #38/#39).
Every git command is put to the operator individually before it runs. `supabase/.temp/*` is never staged.

### 6.3 PR

Draft [PR #41](https://github.com/R3v3ill3/OffshoreAlliance/pull/41) `feat/oux-wp2.2-structure-api → main`
(base retargeted from `develop` on 2026-09-14), titled `feat(oux-wp2.2): transactional structure API and
enforcement migration`. Body: this plan's §3 summary, the writer table with ticks, the evidence matrix, and
the explicit **G1** notice. It is marked ready only after Stage 7, and it is **merged by the operator only
after WP2.2a is on production** (§6.4): merging deploys the code to Vercel Production.

### 6.4 G1 — promotion gate (binding)

Unlike WP2.1, WP2.2 code **requires** the schema: every structure write becomes an RPC call, so a
production deploy without WP2.1 + WP2.2a would fail every move/create/delete with `PGRST202`. Therefore:

1. The branch may carry WP2.2 (its Vercel preview uses normal dev, which has WP2.1 and gets 2.2a at §0
   step 4). Nothing on the branch reaches production until PR #41 is merged.
2. **PR #41 is not merged into `main` until the operator confirms WP2.2a is applied to production**
   (WP2.1 already is: `wp/wp2.1.md` §15). A merge to `main` deploys to Vercel Production immediately and
   regenerates `packages/db-types/generated.ts` from production, so the schema has to be there first.
   Production application is by operator run sheet: one file per SQL Editor submission, prepared from the
   committed migration with `SET LOCAL oux.env = 'production';` after every `BEGIN;` in mutating files and
   a read-only verification `SELECT` appended after the final `COMMIT;`; `postgres` role, RLS bypassed;
   never the connector's `apply_migration` on production.
3. Production order after that, one checklist, each output pasted before the next file is handed over:
   operator merges PR #41 → verify wall-chart writes on production (operator, UI only) →
   `10_materialise…` (M2-a) → `20_relabel…` (R1-b) → `00_preflight_hazards` → `03b` if H9 > 0 →
   `04_postflight` (WP2.1's gate, which must precede 2.2b: it raises `WP2.1 schema/deferred-object boundary is
   incorrect` once the view or unique index exists — D27) → WP2.2b (its post-assertions are the postflight) →
   read-only WP2.2b check. Before/after evidence compares hazard counts and checksums, not row totals
   (sync-on-open moves the totals whenever a campaign is opened; §2.3 row 15a).
4. Only after step 3 completes on production may WP2.4 begin and consume `campaign_group_membership`.
5. Side effect: with WP2.1 + WP2.2a on production before the merge, `gen-types.yml` regenerates **with**
   the symbols on the merge push. With `develop` parked there is no second integration branch, so the
   `generated.ts` divergence of `5fe7c93`/`1666660` cannot recur. (The RPC `Functions` entries still are
   not consumed by code — §2.7.)

This gate is the WP2.2 instance of the programme-wide promotion gate recorded in `PROGRESS.md` standing
notes on 2026-09-14: every pull request that carries a migration is merged only after the operator has
applied that migration to production.

---

## 7. Files

New:
- `supabase/migrations/<ts>_wp2_2_structure_api.sql`
- `supabase/migrations/<ts>_wp2_2_one_unit_per_group_enforcement.sql`
- `scripts/data-hygiene/oux-wp2.2/README.md`, `10_materialise_employer_placements.sql`,
  `20_relabel_unattributed_rule_rows.sql` (R1-b), `90_rollback_wp2_2_structure_api.sql`,
  `91_rollback_wp2_2_enforcement.sql`
- `apps/organising-db/src/lib/campaign/structure-api.ts`
- `apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts`
- `apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts`
- `apps/organising-db/src/lib/campaign/__contract__/structure-api.contract.test.ts`
- `apps/organising-db/vitest.contract.config.ts`
- `apps/organising-db/tests/e2e/structure-api.spec.ts`

Modified: the 21 files of §2.3, `split-unit-dialog.tsx`, `copy-worker-to-unit-dialog.tsx` (K1 message),
WP2.3 interaction-test harness, `sync-campaign-universe.test.ts`, `apps/organising-db/package.json`
(`test:contract`), `scripts/data-hygiene/oux-wp2.1/95_role_probes.sql` (extended probes),
`packages/db-types/generated.ts` (dev regen, once), `PROGRESS.md` (evidence commit).

Not modified: `.github/workflows/gen-types.yml` (its production source is an operator decision outside
WP2.2, recorded in PROGRESS.md incidental findings), any `campaigns` creation path, any feature flag.

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion | Evidence |
|---|---|
| Transactional RPCs for group create/rename/reorder/delete | WP2.2a file; contract tests `structure_group_*` (incl. atomicity) |
| Unit create/split/merge/rename/estimate/delete | contract tests per RPC; e2e 3–5 |
| Assign/move/unassign within a group; conflict rules §5.5 | contract tests C-a…C-l; e2e 1–2 |
| Every appendix-A writer switched; zero direct writes | §3.11 table ticked in PR; guard test green; `rg` command exit 1 |
| Contract tests against a DB with WP2.1 schema | §4.2 output on normal dev (pre- and post-WP2.2b) pasted in §9.2 |
| Transactional move/copy/merge/split | contract atomicity tests |
| H9 re-run then unique index + trigger + view | clone rehearsal log (§4.4); WP2.2b post-assertions |
| M2 materialised | `10_` before/after counts on clone; idempotence re-run |
| Recompute fixed | R-decision implemented; unit test proving universe rows survive Recompute; contract test |
| `Insert.group_id` handled at boundary | no `campaign_worker_ou.Insert` construction in `src/` (grep in §9.2) |
| `loadOuTargets` paged | unit test with 2,500 rows |
| No `groups_v2` | grep `groups_v2` in diff = 0 |
| Full mode keeps working | existing e2e green on preview; WP2.3 interaction tests green |
| No localStorage / no new flags / no campaign-creation path | reviewer checklist |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Deploying WP2.2 code to a DB without the RPCs (`PGRST202`) | G1; previews only from dev after §0 steps 2 and 4; wrapper maps `PGRST202` to a distinct `schema_missing` error surfaced in the UI. |
| RLS-filtered silent no-ops inside SECURITY INVOKER bodies | explicit `can_write_to_campaign` pre-check + `GET DIAGNOSTICS` assertions; role probes. |
| Helper functions callable directly | revoked from `authenticated`; probe in §4.4. |
| Deferred FK flush at commit (WP2.1 §14.6 lesson) | RPC bodies delete dependants before parents; contract atomicity tests include a unit delete with placements. |
| WP2.3 nested-card double `move` | second call is a no-op (`moved: 0`) — verified by an interaction test; advisory remains open for WP2.4 UI fix. |
| Merge loses dependants | explicit re-point list in `structure_unit_merge`; contract test per dependant table. |
| Same-group copy now errors (K1) | approved behaviour change; message + e2e 2. |
| Employer materialisation changes full-mode observables | M2-a keeps it operator-timed; e2e asserts render + one worksite card per member. |
| Contract suite accidentally targets production | hard throw on production host; env names distinct from app env; no `.env` file read. |
| Legacy `check_worker_ou_group_exclusivity` (one container per `ou_type`) refuses cross-container same-type moves and merges (`P0001`) | Unchanged behaviour (D17); surfaced as `rule_violation` with the trigger's message; contract tests pin it so Stage 4 knows before the UI does; retirement of the trigger is a later package (§1.5). |
| Regen strips symbols again on promotion | G1 step 5; wrapper never uses generated `Functions`. |
| Lint total creep from 21 touched files | touched lines clean; each stage records the total. |

### 8.3 Deviations from plan (implementer keeps)

Stage 1 (2026-09-14, static implementation; nothing below has run against a database yet — §11).

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D1** | The `structure__*` helpers live in a private schema `oux_internal` (USAGE + EXECUTE granted to `authenticated` and `service_role`, revoked from `PUBLIC` and `anon`), not in `public` with EXECUTE revoked from `authenticated`. Every helper call is schema-qualified. The role probe asserts that `anon` cannot execute any `structure_*` / `oux_internal` function and that no `structure__*` function exists in `public`; it does **not** assert that `authenticated` gets `42501` on a helper. | A `SECURITY INVOKER` function runs as its caller, so the caller needs EXECUTE on every function the body calls; revoking the helpers from `authenticated` would break every public RPC for real users. Keeping them off the REST surface is done by schema: PostgREST exposes only the configured schemas (project default `public, graphql_public`; `supabase/config.toml` has no `[api]` section). **Operator check before Stage 2:** confirm in the dev/production API settings that `oux_internal` is not (and is never added to) the exposed schemas. | §3.5 item 3; §4.4 role probes; §8.2 "Helper functions callable directly". |
| **D2** | New file `scripts/data-hygiene/oux-wp2.2/95_role_probes.sql` instead of extending the rehearsed `oux-wp2.1/95_role_probes.sql`. | The WP2.1 file is rehearsed evidence and must stay byte-identical. | §4.4; §7 "Modified". |
| **D3** | `campaign_organising_units` has no `description` and no `leader_worker_id` column (the latter is on `campaign_ou_coverage`, baseline `:9500–9518`), and the estimate column is `total_workers_estimated`. The unit element shape (`structure_units_create` / `_split` / `_bulk_save`) and the `structure_unit_update` whitelist use the real columns: `name, ou_type, total_workers_estimated (alias estimated_size), target_size, commonality_logic, display_order, is_group_container, parent_ou_id, ou_group_id, ou_group_name, group_id, unit_basis, source, anchor_worker_id, user_rating, source_metadata` (update: `name, total_workers_estimated/estimated_size, target_size, commonality_logic, display_order, user_rating, anchor_worker_id, unit_basis, source_metadata`). `description` / `leader_worker_id` raise `22023`. | The plan's key names do not exist in the schema (`packages/db-types/generated.ts:6467–6486` confirms). | §3.3 `structure_units_create`, `structure_unit_update`. |
| **D4** | `structure_placements_move` gains `p_keep_in_parent boolean DEFAULT true` and returns two extra keys, `skipped` and `parent_inserted`. With a sub-unit target whose parent has a group of its own (the Employer container), the parent placement is kept/created (`skip` semantics); a source that *is* that parent is retained (copy semantics for that worker); when the parent has no `group_id`, or shares the target's group, nothing is written for the parent. | §3.11 row 1 assigns the legacy `keepInParent` inserts (`move-worker-mutation.ts:184–207, 265–289`) to the RPC, but §3.3 gave the RPC no way to express it; default `true` = today's default. Additive. | §3.3 `structure_placements_move`; §3.9 `move` args. |
| **D5** | `apps/organising-db/vitest.config.ts` gains `exclude: [...configDefaults.exclude, "src/**/__contract__/**"]`. | Its existing `src/**/*.test.{ts,tsx}` glob collected `structure-api.contract.test.ts`, which throws without the `OUX_CONTRACT_*` variables — `pnpm test` was no longer hermetic (§4.2 requires it to be). One-line change to an existing file outside the plan's "Modified" list. | §4.2; §7 "Modified". |
| **D6** | The RPC family is 17 functions: the 16 rows of §3.3 (4 group + 7 unit + 5 placement) plus `structure_materialise_employer_placements`. | §3.5 item 4's "the public RPCs of §3.3" was counted as 15 in the Stage-1 brief; the table has 16 + M2. No design change. | §3.5 item 4 (count only). |
| **D7** | §2.3 row 13's real path is `lib/campaign/use-allocate-workers-to-ou.ts` (not `lib/hooks/`). The guard test's scanner accepts the `as never` cast **inside** `.from("campaign_worker_ou" as never)` (rows 8, 9) as well as after the paren, and chains broken across lines; the plan's single-line `rg` command in §5 finds only 6 of the 21 files today. The guard test is the authoritative inventory; the `rg` line is kept as a secondary check. | Verified by hand: the scanner finds exactly the 21 files of §2.3 and nothing else (§11). | §2.3 row 13; §5 acceptance command (advisory). |
| **D8** | `structure_unit_merge` refuses a source that has child units (`P0001`) instead of re-pointing `parent_ou_id` / `ou_group_id`. Unique keys found on the re-point list: `campaign_ou_coverage(ou_id)`, `woc_scope_units(woc_id, ou_id)`, `structure_test_results(structure_test_id, ou_id)`, `section_plan_workforce_mapping_overrides(section_plan_id, worksite_ou_id)` — for each, the survivor's own row wins and the leftover source row goes with the source unit's `ON DELETE CASCADE`; `campaign_unit_rules`, `campaign_worker_list_items.source_ou_id`, `campaign_wocs.scope_ou_id`, `campaign_stage_workplan_tasks.assigned_ou_id`, `campaign_ou_candidates.accepted_ou_id` have no unique key on the column and are re-pointed outright. Every re-point asserts its visible row count (`P0002` on an RLS gap, never silent loss). | Child units are not in the plan's re-point list; today's dialog fails on the same case with `23503` (`ou_group_id` FK is `NO ACTION`). Not stop condition §8.4 item 5: every unique key is covered by the plan's "`ON CONFLICT DO NOTHING` where a unique key exists" rule. | §3.3 `structure_unit_merge`. |
| **D9** | C-h is implemented as: an RPC never creates a second primary, and never drops a primary the worker had **by its own action** (moved/collapsed/displaced/reassigned rows carry the flag to the target row). A plain `unassign` of a primary row does not promote another placement, matching today's `worker-detail-sheet` remove. | Today's data routinely has workers with placements and no primary (sync and assign write `is_primary = false`), so a literal "never zero primaries" would change behaviour for every assign. | §3.4 C-h (interpretation). |
| **D10** | `oux_internal.structure__assert_can_write` (a) applies the same predicate as the `wp16_*` write policies, `get_user_role() IN ('admin','user') AND can_write_to_campaign()`, so a viewer gets `42501` rather than a zero-row no-op; (b) admits a session with `auth.uid() IS NULL` only when `current_user` has `rolsuper` or `rolbypassrls` (`postgres`, `service_role`) — how `10_materialise_employer_placements.sql` calls the RPC; (c) raises `P0002` for a missing campaign. | The plan named only `can_write_to_campaign`; the operator script needs a JWT-less path. | §3.1 principle 1; §3.7 M2-a. |
| **D11** | `structure_placements_move` with `p_to_ou_id = null` ignores `p_from_ou_id` (legacy `toOuId: null` strips all placements); a single placement is removed through `structure_placements_unassign(p_ou_id)`. `structure_group_delete cascade_units` does not delete a legacy custom-kind container whose group is removed (the container is not a unit of the group; its next update re-creates the group through the WP2.1 AFTER trigger). | Plan-literal semantics made explicit in the function comments. | §3.3 (clarification). |
| **D12** | `structure_materialise_employer_placements` considers a container only for children whose `group_id` differs from the container's (Employer container → worksite children). A same-kind container/member pair (the create dialog's shape) is skipped because C-a forbids a worker on both. | §3.7 said "container units with `is_group_container AND group_id IS NOT NULL`"; production data is employer→worksite (wp2.1.md §1.3), so the result is the same there. | §3.7. |
| **D13** | `loadOuTargets` (`sync-campaign-universe.ts:229–279`) does **not** exclude containers in its query; the exclusion is in `matchingOusForWorker` at `:110` (`if (ou.isGroupContainer \|\| !ou.autoMatch \|\| ou.futureGroupKey == null) continue;`). Recorded for Stage 6 as §3.7 asks. | Fact-finding only. | §3.7 (record). |
| **D14** | Placement `is_primary` semantics inside `structure_placements_assign`: with `p_is_primary`, a worker already on the unit still becomes primary there (clear-then-set). *Fix round 1 (8c):* with `p_on_conflict = 'skip'` and the worker elsewhere in the unit's group, the call returns `skipped` and does **not** touch the primary flag (the worker never lands on the unit). | Makes `assign(isPrimary: true)` mean "ensure on unit and primary", which is what the import route's upsert `{is_primary: true}` intends (§2.3 row 16). | §3.3 `structure_placements_assign`. |

Fix round 1 (2026-09-14, reviewer findings; §11.6):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D15** | WP2.2b grants on `campaign_group_membership` are `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role; GRANT SELECT … TO authenticated, service_role;` (the view text stays verbatim). The post-assertion additionally checks `service_role` has no INSERT/UPDATE/DELETE. | The view is created by `postgres` in `public`, where the baseline's `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon/authenticated/service_role` (`20260908050000:33393–33396`) applies; the wp2.1.md §2.3 revoke (`public, anon`) would have left `authenticated` with full privileges and failed the post-assertion, rolling back the file (blocking finding 1). The default privileges are scoped `IN SCHEMA public`; `oux_internal` holds functions only (PUBLIC EXECUTE already revoked), so nothing else is affected. | §3.6 item 5; wp2.1.md §2.3 grant lines. |
| **D16** | `90_rollback_wp2_2_structure_api.sql` drops the functions and the schema and restores the trigger body unconditionally; only the two-value CHECK restore is conditional (NOTICE with the `universe` row count, three-value CHECK left in place when rows exist). Final result set reports the CHECK definition after and the blocking row count. README updated. | §3.5 says only the CHECK restore is conditional (finding 3). | Rollback paragraph of §3.5; README. |
| **D17** | Recorded, not changed: the legacy `trg_check_worker_ou_group_exclusivity` refuses `UPDATE … SET ou_id` between worksites of two different Employer containers (move) and a merge of such worksites, with `P0001` → `rule_violation`, because the BEFORE UPDATE trigger still sees the row's old `ou_id`. The contract fixture gains a second Employer container with a worksite child and two tests pin the behaviour. *Round 2 (A4):* the asymmetry is deliberate and correct as written — the parent-container-source branch of `structure_placements_move` (D19: delete then insert) **succeeds** when the displaced row sat under another Employer's worksite, whereas the plain move path (`UPDATE … SET ou_id`) raises `P0001` from the legacy trigger for the same target; Stage 4 should expect both in the UI. | Not a regression — today's insert-before-delete fails identically — but Stage 4 must know before the UI does (finding 2). | §3.4 C-b, C-j; §8.2. |
| **D18** | Contract suite: `OUX_CONTRACT_FOREIGN_CAMPAIGN_ID` is required (throws with the other variables); the forbidden-campaign test always runs and exercises three RPCs. The foreign-user pair stays optional but one-without-the-other throws; the gated test's name states the skip reason; README/§4.2 require the Stage 3 paste to report the skipped count. | `it.skipIf` tests could vanish silently (finding 4). | §4.2; README. |
| **D19** | D4 corner: when the move's source is the target's parent Employer container, the RPC now displaces the worker's other placement in the target's group first (C-b), then inserts the target placement, keeping the parent row (copy semantics for the parent only). Previously that path used `structure__place(…, 'error')` and raised `23505` when the worker already sat on another worksite of the employer. *Round 2 (A4):* because this branch deletes before it inserts, it succeeds even when the displaced row was under **another** Employer's worksite, while the plain move path (`UPDATE … SET ou_id`) raises `P0001` from the legacy exclusivity trigger for that same target (D17) — correct as written; Stage 4 should expect the asymmetry. | The same drop from any other source displaces; the parent-source case must not differ (finding 5). | §3.3 `structure_placements_move`; D4. |
| **D20** | `structure__create_units` rejects a blank-string `parent_ou_id` / `ou_group_id` reference with `22023`. | `coalesce(v_ref, '')` let `""` resolve to the first element without a `client_ref` (finding 6). | §3.3 `structure_units_create`. |
| **D21** | Recorded, not changed: on the remove-only paths (`structure_placements_unassign`, the unassign branch of `structure_placements_move`, `structure_placements_set_primary`) worker ids are verified to exist (`P0002`) but **not** to be members; a non-member id yields `removed: 0` (or `P0002` "no placement" for `set_primary`) rather than `22023`. Deletes are scoped to the campaign's units, so nothing outside the campaign can be touched. §3.1 principle 2 holds for every argument that can create or move a row. | Exact semantics stated so the principle is not over-claimed (finding 7). | §3.1 principle 2 (scope). |
| **D22** | Minor SQL: (a) `structure_group_update`'s container rename asserts one row with `GET DIAGNOSTICS` (`P0002` otherwise); (b) the "avoids a scan under lock" comment on the CHECK drop/add is corrected — inside the single transaction the DROP already holds ACCESS EXCLUSIVE, the two-step form is kept for run-sheet/rollback symmetry; (c) see D14; (d) `structure_placements_replace_rule_rows` deletes every `rule` row, including one that was `is_primary`, and re-inserts non-primary — a worker whose only primary was a rule row ends the Recompute with no primary (today's Recompute does the same; D9 reading); (e) `structure__delete_unit`'s detach path (`p_delete_children = false`) re-derives the children's group through the WP2.1 BEFORE trigger; for a custom-kind container named like a reserved type label (e.g. "Custom") `campaign_group_ensure` can raise its own `23505` — the delete dialog passes `deleteChildren: true` (§3.11 row 3), so this is reachable only by a direct caller; (f) 2.2a's post-assertion and `95` assert `anon`/`authenticated` are `NOT rolsuper AND NOT rolbypassrls` (the D10(b) bypass depends on it). | Finding 8. | §3.3, §3.5, §3.8, §4.4. |
| **D23** | 2.2a section 1 is tolerant of an already-widened CHECK: the precondition accepts exactly the two-value or the three-value shape (values extracted from `pg_get_constraintdef`; anything else raises) and rows in `(manual, rule, universe)`; a `DO` block skips the drop/add/validate with a NOTICE when `universe` is already allowed. Post-assertion unchanged. README states that a re-forward after a `90` that left the three-value CHECK is supported and that `10`/`20` are never reversed automatically. | Round 2 A1: after `90` with `universe` rows (D16) the original preconditions made 2.2a un-reapplicable. | §3.5 item 1; README. |
| **D24** | The role assertions in 2.2a's post-assertion block and in `95` now require `count(*) FILTER (WHERE NOT rolsuper AND NOT rolbypassrls) = 2` over exactly `anon` and `authenticated` (raise otherwise). | Round 2 A2: the previous `count(*) … = 0` form passed vacuously if a role row was missing. | §3.5 item 7; §4.4. |
| **D25** | Contract suite's forbidden-campaign test reads the foreign campaign's placements through the main client before and after the three refused calls and asserts equality (may be RLS-empty), matching the foreign-user test's shape. | Round 2 A3. | §4.2. |
| **D27** | The production and clone sequences run `oux-wp2.1/04_postflight_hazards.sql` **before** 2.2b, not after it: `04` asserts that `campaign_group_membership` and `campaign_worker_ou_one_unit_per_group` do not exist (its "schema/deferred-object boundary" block) and would STOP after 2.2b. 2.2b's own post-assertions plus a read-only check are the WP2.2b postflight. | Found during the clone rehearsal (2026-09-14) by reading `04` before running it. Orchestrator amendment to §0 step 6, §6.4 step 3 and the scripts README. | §0 step 6; §6.4 step 3; README run order. |
| **D26** | Evidence correction: the "PL/pgSQL balance check" in §11.4/§11.6 was a Python keyword-pairing check (`IF`/`END IF`, `LOOP`/`END LOOP`, `BEGIN`/`END` with SQL `CASE … END` discounted, comments and string literals stripped) over every `$tag$ … $tag$` block, not a libpg-query PL/pgSQL parse; the scratchpad `check.mjs` never ran (no `parseQuery`/`parsePlPgSQL` export in the installed build). Only `check-sql.mjs` (`parse`, SQL grammar) was used. §11.6 reworded; the keyword check re-run and labelled accurately in §11.7. | Round 2 evidence note. | §11.4, §11.6. |

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. `supabase/.temp/project-ref` shows anything other than the two allowed refs.
2. Any command would touch `gteygwfgjvczanmrwgbr`.
3. H9 > 0 on the clone after `03b` has already been run once in this WP.
4. `10_materialise…` would insert more than one Employer placement for any worker in a campaign.
5. A dependant table in the merge re-point list has a unique key not covered by the plan.
6. Any existing test would need to be skipped, deleted or weakened to pass.
7. The guard test cannot be made green without touching a file outside §2.3 (undiscovered writer).
8. Lint total would exceed 294 or `tsc` fails in an untouched file.
9. The contract suite's fixture cannot be created without a product campaign-creation path.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Recommendation |
|---|---|---|
| **S** | Where the schema goes and when — answered by the §0 step table (production WP2.1 now; dev gets each migration by one `db push`; one optional clone pass of the new SQL) | §0 steps 1–6 |
| **R** | Recompute provenance: **R1** new `'universe'` source (+ **R1-b** relabel script for existing NULL-rule-id rows, operator-run); **R2** attribution-only | **R1**, with **R1-b** rehearsed on the clone and left to the operator for production |
| **M2** | Employer materialisation timing: **M2-a** operator-run script after code deploy; **M2-b** inside WP2.2a | **M2-a** |
| **K** | Same-group copy: **K1** reject with message; **K2** silently convert to move | **K1** |
| **G1** | Promotion gate: PR #41 is not merged into `main` until production has WP2.1 + WP2.2a (Revision 4 wording; approved on 2026-09-13 as "no `develop → main`", same gate) | required (not optional) |
| **T** | Contract suite as a separate `pnpm test:contract` config (environment-gated, fails loudly without env) rather than inside `pnpm test` | approve |
| **C-k** | Same-group split takes workers out of the source (full-mode change) | approve |

Approvals required, in order:

1. Approve this plan with S, R, M2, K, G1, T, C-k answered.
2. Approve `git checkout -b feat/oux-wp2.2-structure-api` (off `develop` at `1666660`) and the Stage-0
   commit of this plan plus the three ledger files; approve `git push -u origin feat/oux-wp2.2-structure-api`
   and opening the draft PR.
3. Approve `npx supabase migration new wp2_2_structure_api` and `… wp2_2_one_unit_per_group_enforcement`.
4. Operator applies WP2.1 + WP2.2a to normal dev (§0 steps 2 and 4) — or approves the implementer running the exact
   `supabase link` / `db push` commands of §5.
5. Approve linking the CLI to the clone (§0 step 5, optional) after confirming it is still isolated; supply clone
   credentials in the shell only if the contract suite is to run there; approve relink to dev afterwards.
6. Approve each subsequent stage commit and the `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`
   run individually.

**Operator answers (2026-09-13 01:33 UTC):** R1 approved (with R1-b as an operator-run script); M2-a
approved; K1 approved; G1 approved; production timing clarified as §0 steps 1–6. Git commands in approval
item 2 approved. Decisions T and C-k were not objected to and are carried as recommended; the operator may
overrule them before Stage 4.

**Orchestrator approval:** plan approved for implementation on `feat/oux-wp2.2-structure-api` subject to
§0 steps 1–2 being scheduled by the operator (Stage 1 does not need a database; Stages 3–6 do).

### 9.2 Verification output (verifier pastes raw output)

#### Stage 1 verifier run (2026-09-14, Sonnet, no database)

**1. `pnpm validate:migrations`**

```
> offshore-alliance-monorepo@ validate:migrations /home/user/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 13 Supabase migrations with unique 14-digit versions.
```
Exit code: 0

**2. `pnpm --filter organising-db exec tsc --noEmit`**

```
(no output)
```
Exit code: 0

**3. `pnpm --filter organising-db test` (full run)**

```
> organising-db@0.1.0 test /home/user/OffshoreAlliance/apps/organising-db
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

[... 89 passing test files trimmed to summary; full list of files is unchanged from the pre-Stage-1 baseline except for the two new files below ...]

 ✓ src/lib/campaign/__tests__/structure-api.test.ts (51 tests) 32ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 111ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 50ms
     → 21 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  components/campaigns/campaign-settings.tsx
  components/campaigns/campaign-units-section.tsx
  components/campaigns/campaign-wizard.tsx
  components/campaigns/wall-chart/create-organising-unit-dialog.tsx
  components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
  components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
  components/campaigns/wall-chart/merge-units-dialog.tsx
  components/campaigns/wall-chart/move-worker-mutation.ts
  components/campaigns/wall-chart/unit-rating-control.tsx
  components/campaigns/wall-chart/worker-detail-sheet.tsx
  lib/campaign/recompute-ou-assignments.ts
  lib/campaign/use-allocate-workers-to-ou.ts
  lib/hooks/useRemoveWorkerFromCampaign.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(21) ] to deeply equal []

[... remaining passing test files trimmed to summary ...]

stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 6682ms over 3 runs (runs: 6682, 5688, 7090; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 20608ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 20608ms
     → expected 6681.761664 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 21 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  components/campaigns/campaign-settings.tsx
  components/campaigns/campaign-units-section.tsx
  components/campaigns/campaign-wizard.tsx
  components/campaigns/wall-chart/create-organising-unit-dialog.tsx
  components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
  components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
  components/campaigns/wall-chart/merge-units-dialog.tsx
  components/campaigns/wall-chart/move-worker-mutation.ts
  components/campaigns/wall-chart/unit-rating-control.tsx
  components/campaigns/wall-chart/worker-detail-sheet.tsx
  lib/campaign/recompute-ou-assignments.ts
  lib/campaign/use-allocate-workers-to-ou.ts
  lib/hooks/useRemoveWorkerFromCampaign.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(21) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "app/api/campaign-import/apply/route.ts",
+   "app/api/campaigns/[id]/add-workers/route.ts",
+   "app/api/campaigns/[id]/create-worker/route.ts",
+   "app/api/campaigns/[id]/workers/duplicates/route.ts",
+   "app/api/worker-import/apply/route.ts",
+   "app/api/worker-import/organising-units/route.ts",
+   "components/campaigns/campaign-settings.tsx",
+   "components/campaigns/campaign-units-section.tsx",
+   "components/campaigns/campaign-wizard.tsx",
+   "components/campaigns/wall-chart/create-organising-unit-dialog.tsx",
+   "components/campaigns/wall-chart/delete-organising-unit-dialog.tsx",
+   "components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts",
+   "components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts",
+   "components/campaigns/wall-chart/merge-units-dialog.tsx",
+   "components/campaigns/wall-chart/move-worker-mutation.ts",
+   "components/campaigns/wall-chart/unit-rating-control.tsx",
+   "components/campaigns/wall-chart/worker-detail-sheet.tsx",
+   "lib/campaign/recompute-ou-assignments.ts",
+   "lib/campaign/use-allocate-workers-to-ou.ts",
+   "lib/hooks/useRemoveWorkerFromCampaign.ts",
+   "lib/workers/sync-campaign-universe.ts",
+ ]

 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:100:7
     98|       found,
     99|       `${found.length} file(s) still write directly to campaign_organi…
    100|     ).toEqual([]);
       |       ^
    101|   });
    102| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 6681.761664 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16
     95|     expect(tiles).toBe(EXPECTED_TILES);
     96|     expect(cards).toBe(162);
     97|     expect(ms).toBeLessThan(BUDGET_MS);
       |                ^
     98|   }, 120_000);
     99| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  2 failed | 89 passed (91)
      Tests  2 failed | 1232 passed (1234)
   Start at  05:53:09
   Duration  41.48s (transform 3.44s, setup 0ms, collect 18.16s, tests 39.25s, environment 3.88s, prepare 5.21s)

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
Exit status 1
```
Exit code: 1

**4. `pnpm exec eslint` (from `apps/organising-db`) on the Stage 1 files**

Files: `src/lib/campaign/structure-api.ts src/lib/campaign/__tests__/structure-api.test.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__contract__/structure-api.contract.test.ts vitest.contract.config.ts vitest.config.ts`

```
(no output)
```
Exit code: 0

**5. `pnpm --filter organising-db lint 2>&1 | tail -6`**

```
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
```
Exit code: 1

**6. `rg -n --pcre2` direct-write scan (excluding `__tests__` and `__contract__`)**

```
/home/user/OffshoreAlliance/apps/organising-db/src/lib/workers/sync-campaign-universe.ts
/home/user/OffshoreAlliance/apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/campaign-units-section.tsx
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
```
Exit code: 0

**7. `git status --short`**

```
 M apps/organising-db/package.json
 M apps/organising-db/vitest.config.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/lib/campaign/__contract__/
?? apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts
?? apps/organising-db/src/lib/campaign/structure-api.ts
?? apps/organising-db/vitest.contract.config.ts
?? scripts/data-hygiene/oux-wp2.2/
?? supabase/migrations/20260914090000_wp2_2_structure_api.sql
?? supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql
```
Exit code: 0

**8. `git diff --stat`**

```
 apps/organising-db/package.json      |   1 +
 apps/organising-db/vitest.config.ts  |   5 +-
 docs/organiser-ux-review/wp/wp2.2.md | 247 ++++++++++++++++++++++++++++++++++-
 3 files changed, 251 insertions(+), 2 deletions(-)
```
Exit code: 0

**9. `wc -l` of new migration files and everything under `scripts/data-hygiene/oux-wp2.2/`**

```
  3256 /home/user/OffshoreAlliance/supabase/migrations/20260914090000_wp2_2_structure_api.sql
   281 /home/user/OffshoreAlliance/supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql
  3537 total

  130 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/20_relabel_unattributed_rule_rows.sql
   88 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/README.md
  134 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/91_rollback_wp2_2_enforcement.sql
  222 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/95_role_probes.sql
  192 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql
  187 /home/user/OffshoreAlliance/scripts/data-hygiene/oux-wp2.2/10_materialise_employer_placements.sql
  953 total
```
Exit code: 0 (both invocations)

**10. Repeat run, restricted to the timing test (for flakiness visibility)**

Command: `pnpm --filter organising-db exec vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx`

(Path guess confirmed via `find` — matches exactly `src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx`.)

```
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 6778ms over 3 runs (runs: 6778, 5818, 6942; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 20630ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 20630ms
     → expected 6778.459658 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 6778.459658 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16
     95|     expect(tiles).toBe(EXPECTED_TILES);
     96|     expect(cards).toBe(162);
     97|     expect(ms).toBeLessThan(BUDGET_MS);
       |                ^
     98|   }, 120_000);
     99| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  05:55:50
   Duration  24.54s (transform 1.15s, setup 0ms, collect 2.93s, tests 20.63s, environment 526ms, prepare 49ms)

undefined
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx
```
Exit code: 1

Result across both runs: run 1 median 6682ms (runs 6682/5688/7090), run 2 median 6778ms (runs 6778/5818/6942) — both above the 6000ms budget, consistently failing rather than flaking.


#### Stage 2 — WP2.2a on normal dev `dpnnmkhabysfdogllsyh` (2026-09-14)

- **Pre-checks (read-only, connector):** ledger 11 rows through `20260913000000`; WP2.1 objects present;
  0 `structure_*` functions; CHECK `(manual, rule)`; H9 = 0; 4 groups / 8 units / 111 placements /
  111 memberships / 0 containers with a group; 1,470 workers; 5 campaigns; campaign 3 has organiser 4 and no
  roster row for organiser 10 (qualifies as the contract suite's foreign campaign); the e2e profile is
  `user` / `organiser` / organiser_id 10; `_oux_env_marker` **absent** (needed before `10`/`20`);
  `_oux_hygiene_log` present; `anon`/`authenticated` neither superuser nor bypassrls, `service_role`
  bypassrls; PostgreSQL 17.6. PostgREST exposed schemas on dev: `public, graphql_public` (a read-only GET
  with `Accept-Profile: oux_internal` returned `PGRST106`), so `oux_internal` is unreachable via the API.
- **Apply:** the operator pasted the agent-prepared file (`BEGIN;` + the exact committed bytes of
  `20260914090000_wp2_2_structure_api.sql` at `5f61208f`, sha256 `060f9e7daa606361…` + `COMMIT;` + a
  read-only verification `SELECT`) into the dev SQL Editor as one submission. Result rows:
  `public_structure_rpcs` 17; `oux_internal_helpers` 14; `assignment_source_check` lists `manual`, `rule`,
  `universe`; `anon_can_execute_group_create` false; `container_trigger_relaxed` true. The connector was
  not used for the apply: echoing 3,336 lines through a tool argument risks a transcription error, and the
  paste rehearses the production hand-over format.
- **Post-apply (connector, read-only):** `md5(prosrc)` of all 32 functions (17 RPCs, 14 helpers, the
  relaxed trigger function) equals the bodies in the committed file; 0 `SECURITY DEFINER`; `search_path`
  pinned on every new function. **Ledger:** row `20260914090000 wp2_2_structure_api` inserted through the
  connector (statement text records the source commit and checksum) so `supabase migration list` matches
  the repo. 2.2b is deliberately **not** on dev yet.
- **`95_role_probes.sql` (exact file, connector):** completed without exception (every failed probe is a
  `RAISE EXCEPTION`); final row `17 / 14 / 0 / false / true / probe campaign 52`; rolled back — campaign 52
  absent afterwards, counts unchanged (5 campaigns / 111 placements / 111 memberships / 8 units / 4 groups).
  Probe 4 was not skipped: the probe user has 5 non-writable campaigns, so the `42501` path was exercised.
- **`oux-wp2.1/01_environment_marker.sql` (connector, `SET LOCAL oux.marker_env = 'dev';` after `BEGIN;`):**
  committed; result `env = dev`, `marked_at 2026-09-14 07:54:23+00`.
- **`10_materialise_employer_placements.sql` (exact file, connector, as `postgres`):** guard and
  required-object checks passed; STOP condition 0; per campaign (1, 3, 4, 5, 6) `inserted 0 /
  skipped_existing 0 / containers 0 / multi_container_workers 0`; TOTAL placements 111 → 111; H9 0 → 0;
  post-checks passed; committed. Dev has no Employer containers, so the idempotence re-run is deferred to the
  clone, where it is meaningful.
- **`20_relabel_unattributed_rule_rows.sql` (exact file, connector):** `rule_null_rule_id` 0 → 0;
  `universe` 0 → 0; `manual` 111 unchanged; total 111; `rows_logged` 0; post-checks passed; committed.
- Not yet run on dev: contract suite (Stage 3, needs `OUX_CONTRACT_*` credentials), 2.2b (after Stage 6).

#### Stage 3 — contract suite on normal dev, run 1 (before 2.2b) (2026-09-14, child session)

Run on branch `feat/oux-wp2.2-structure-api` at commit `005a2cd`, from `apps/organising-db`, with the command below; the run
failed to reach the dev project (proxy refused the tunnel to `dpnnmkhabysfdogllsyh.supabase.co`) before any test body ran, so
all 58 tests were skipped; the one permitted retry with `NODE_USE_ENV_PROXY=1` prepended failed the same way (exit code 1
both times). Raw output of both attempts follows; no diagnosis attempted.

Command (attempt 1; attempt 2 identical with `NODE_USE_ENV_PROXY=1` prepended):

```
OUX_CONTRACT_SUPABASE_URL=https://dpnnmkhabysfdogllsyh.supabase.co \
OUX_CONTRACT_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbm5ta2hhYnlzZmRvZ2xsc3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzAzOTUsImV4cCI6MjA5NjA0NjM5NX0.hPLcsxELs3gvVTUu7kGHjjxQsvuE0l0LQgfiPurNb7k \
OUX_CONTRACT_USER_EMAIL=<from E2E_USER_EMAIL> \
OUX_CONTRACT_USER_PASSWORD=<from E2E_USER_PASSWORD> \
OUX_CONTRACT_FOREIGN_CAMPAIGN_ID=3 \
pnpm test:contract 2>&1 | tee /tmp/contract-run-1.log; echo "exit=${PIPESTATUS[0]}"
```

Attempt 1 raw output (`exit=1`):

```

> organising-db@0.1.0 test:contract /home/user/OffshoreAlliance/apps/organising-db
> vitest run -c vitest.contract.config.ts

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

 ❯ src/lib/campaign/__contract__/structure-api.contract.test.ts (58 tests | 58 skipped) 256ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/campaign/__contract__/structure-api.contract.test.ts [ src/lib/campaign/__contract__/structure-api.contract.test.ts ]
Error: WP2.2 contract suite: sign-in failed: Unexpected token 'H', "Host not i"... is not valid JSON
 ❯ src/lib/campaign/__contract__/structure-api.contract.test.ts:284:11
    282|   const signIn = await client.auth.signInWithPassword({ email: env.ema…
    283|   if (signIn.error || !signIn.data.session) {
    284|     throw new Error(`WP2.2 contract suite: sign-in failed: ${signIn.er…
       |           ^
    285|   }
    286|   api = structureApi(client);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  58 skipped (58)
   Start at  08:58:52
   Duration  900ms (transform 130ms, setup 0ms, collect 202ms, tests 256ms, environment 0ms, prepare 59ms)

 ELIFECYCLE  Command failed with exit code 1.
exit=1
```

Attempt 2 raw output, `NODE_USE_ENV_PROXY=1` prepended (`exit=1`):

```
(node:2249) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:2262) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)

> organising-db@0.1.0 test:contract /home/user/OffshoreAlliance/apps/organising-db
> vitest run -c vitest.contract.config.ts

(node:2275) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

(node:2275) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:2311) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | src/lib/campaign/__contract__/structure-api.contract.test.ts
TypeError: fetch failed
    at node:internal/deps/undici/undici:14976:13
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at _handleRequest (/home/user/OffshoreAlliance/node_modules/.pnpm/@supabase+auth-js@2.104.1/node_modules/@supabase/auth-js/src/lib/fetch.ts:187:14)
    at _request (/home/user/OffshoreAlliance/node_modules/.pnpm/@supabase+auth-js@2.104.1/node_modules/@supabase/auth-js/src/lib/fetch.ts:160:16)
    at SupabaseAuthClient.signInWithPassword (/home/user/OffshoreAlliance/node_modules/.pnpm/@supabase+auth-js@2.104.1/node_modules/@supabase/auth-js/src/GoTrueClient.ts:1048:15)
    at /home/user/OffshoreAlliance/apps/organising-db/src/lib/campaign/__contract__/structure-api.contract.test.ts:282:18
    at callSuiteHook (file:///home/user/OffshoreAlliance/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:964:22)
    at runSuite (file:///home/user/OffshoreAlliance/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1175:29)
    at runFiles (file:///home/user/OffshoreAlliance/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1262:5)
    at startTests (file:///home/user/OffshoreAlliance/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1271:3) {
  [cause]: DOMException [Error]: Request was cancelled.
      at new DOMException (node:internal/per_context/domexception:76:18)
      at makeAppropriateNetworkError (node:internal/deps/undici/undici:9559:182)
      at httpNetworkFetch (node:internal/deps/undici/undici:11270:18)
      at processTicksAndRejections (node:internal/process/task_queues:103:5)
      at httpNetworkOrCacheFetch (node:internal/deps/undici/undici:11145:33)
      at httpFetch (node:internal/deps/undici/undici:10978:37)
      at node:internal/deps/undici/undici:10740:20
      at mainFetch (node:internal/deps/undici/undici:10730:20) {
    cause: RequestAbortedError [AbortError]: Proxy response (403) !== 200 when HTTP Tunneling
        at Client.connect (node:internal/deps/undici/undici:8581:26)
        at processTicksAndRejections (node:internal/process/task_queues:103:5) {
      code: 'UND_ERR_ABORTED',
      [Symbol(undici.error.UND_ERR)]: true,
      [Symbol(undici.error.UND_ERR_ABORT)]: true,
      [Symbol(undici.error.UND_ERR_ABORTED)]: true
    }
  }
}

 ❯ src/lib/campaign/__contract__/structure-api.contract.test.ts (58 tests | 58 skipped) 331ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/campaign/__contract__/structure-api.contract.test.ts [ src/lib/campaign/__contract__/structure-api.contract.test.ts ]
Error: WP2.2 contract suite: sign-in failed: fetch failed
 ❯ src/lib/campaign/__contract__/structure-api.contract.test.ts:284:11
    282|   const signIn = await client.auth.signInWithPassword({ email: env.ema…
    283|   if (signIn.error || !signIn.data.session) {
    284|     throw new Error(`WP2.2 contract suite: sign-in failed: ${signIn.er…
       |           ^
    285|   }
    286|   api = structureApi(client);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  58 skipped (58)
   Start at  08:59:03
   Duration  1.03s (transform 138ms, setup 0ms, collect 216ms, tests 331ms, environment 0ms, prepare 64ms)

 ELIFECYCLE  Command failed with exit code 1.
exit=1
```

#### Clone rehearsal — realistic data set `yqjkuobcawvigsfpgrcm` (2026-09-14, §0 step 5 / §4.4)

- **State before (read-only, connector):** marker `clone @ 2026-09-12 05:48:45+00`; 0 `structure_*`
  functions; CHECK `(manual, rule)`; H9 = 0; 20 groups / 239 units / 1,618 placements / 2,726 memberships;
  18 containers with a group; 207 `rule` rows with `assigned_rule_id IS NULL` (R1-b targets); 22 campaigns;
  2,407 workers; `an_survey_reports` absent (ledger ends at `20260912035329`, one behind the repo);
  `_oux_hygiene_log` 136 rows; `_oux_wp21_conflicts` present.
- **Exact `oux-wp2.1/00_preflight_hazards.sql` (read-only, connector), final evidence set:**
  `application:campaign_worker_ou` 1618 / `02e9750044fff0872db5ceaf8cbf4676`;
  `application:campaign_organising_units` 239 / `8adec341ff176305497e637a83919adf` (identical to production's
  2026-09-14 postflight); `application:campaign_worker_membership` 2726 / `7ade52719c51303ad9e3794ebeb6a026`;
  `application:campaign_unit_rules` 2 / `5019cdf74e1f62903c4f75b5c0625db1`;
  `metadata:campaign_organising_units_updated_at` 239 / `69bf1652efe412438f703b5d259b78e8`;
  hazards `f1_pre_specificity_multi_target_partitions` 226 / `7749bb7d…`, `f1_pre_specificity_excess_targets`
  226 / `aaf76cce…`, `f1_fallback_targets_suppressed` 226 / `aaf76cce…`, `f1_max_specificity_multi_target_partitions`
  0, `f1_max_specificity_excess_targets` 0, `h10_enabled_duplicate_basis_sets` 0 (the production shape);
  `ou_dependant:*` — canonical_basis 13 / `beef3d5a…`, placement_mapping 1 / `43e67509…`, campaign_groups
  source_ou_id 2 / `c5e740c1…`, units ou_group_id 150 / `5bcd99bf…`, units parent_ou_id 150 / `5bcd99bf…`,
  campaign_unit_rules 2 / `3da92745…`, campaign_worker_list_items 818 / `6384f89f…`, all others 0;
  all ten `view:*` present (`46cd5f4b…`, `df730743…`, `fda9dfd3…`, `1e4a878f…`, `a37a221c…`, `a0ec642b…`,
  `6d35c54b…`, `8fff6560…`, `d60b5f5a…`, `530614e3…`). No STOP raised.
- **Step 1 — `20260913000000_an_survey_reports` (connector, exact file + ledger row in one submission):**
  5 `an_survey_*` tables created; ledger 11 rows, top `20260913000000 an_survey_reports`. The clone's ledger
  now matches the repo (end-of-programme task in `PROGRESS.md`).
- **Step 2 — 2.2a forward (operator paste of the prepared file: `BEGIN;` + exact bytes at `5f61208f` +
  `COMMIT;` + check):** `public_structure_rpcs` 17; `oux_internal_helpers` 14; CHECK lists `universe`;
  `anon_can_execute_group_create` false; `container_trigger_relaxed` true; `unattributed_rule_rows_unchanged`
  207. Connector read-back: `md5(prosrc)` of all 32 functions equals the file; 0 `SECURITY DEFINER`.
- **Step 3 — `90_rollback_wp2_2_structure_api.sql` (exact file, connector):** `public_rpcs_before` 17 →
  `public_rpcs_after` 0; `helpers_before` 14; `internal_schema_remains` false; `check_definition_after` =
  two-value `(manual, rule)`; `universe_rows_blocking_check_restore` 0; placements 1,618 and units 239
  unchanged; committed. Restored `check_no_worker_on_group_container()` body `md5(prosrc)` =
  `cccde5a9642091135737f8ccadce27f4` = the baseline file's body (byte-identical), `prosecdef` false,
  `proconfig` null (as the baseline).
- **Step 4 — 2.2a forward again (operator paste, third submission; one earlier attempt arrived truncated and
  was rejected by the parser before any statement ran):** same six verification rows as step 2. Connector
  read-back: `bodies_match_file` 32 of 32; 0 `SECURITY DEFINER`; placements 1,618; H9 0.
- **Step 5 — `10_materialise_employer_placements.sql` (exact file, connector):** STOP condition 0; campaign 57
  `placements_before` 303 → `placements_after` 606, `inserted` 303, `skipped_existing` 0, `containers` 18,
  `multi_container_workers` 0; every other campaign 0 containers / 0 inserted; TOTAL 1,618 → 1,921; H9 0 → 0;
  post-checks passed; committed.
- **Step 6 — `10` re-run (idempotence):** TOTAL 1,921 → 1,921, `inserted` 0, `skipped_existing` 303,
  `containers` 18, campaigns with inserts 0; H9 0 → 0.
- **Step 7 — `20_relabel_unattributed_rule_rows.sql` (exact file, connector):** `rule_null_rule_id` 207 → 0;
  `rule_attributed` 0 unchanged; `universe` 303 → 510; `manual` 1,411 unchanged; total 1,921; `rows_logged`
  207; post-checks passed; committed. `03b` not needed (H9 = 0 throughout).
- **Step 8 — 2.2b forward (exact file, connector):** preconditions passed; placements 1,921; `view_rows` 3,217;
  groups 20; `h9_partitions` 0; post-assertions (unique index valid, support index gone, trigger pre-check
  present, view `security_invoker`, grants, groups × members arithmetic, counts unchanged) passed.
- **Step 9 — `91_rollback_wp2_2_enforcement.sql` (exact file, connector):** `view_rows_before` 3,217;
  `view_remains` false; `unique_index_remains` false; `support_index_restored` true; H9 0; placements 1,921
  unchanged; restored `cwo_set_group_id()` body `md5(prosrc)` = `e6a82738313df9b1955d3d7ed3d7a12d` = the
  WP2.1 migration's body (byte-identical).
- **Step 10 — exact `oux-wp2.1/04_postflight_hazards.sql` (read-only), run with WP2.1 + 2.2a + `10` + `20`
  applied and 2.2b rolled back (the only state in which it is valid — D27):** PASSED.
  `application:campaign_organising_units` 239 / `8adec341…` (unchanged); `campaign_worker_membership` 2726 /
  `7ade5271…` (unchanged); `campaign_unit_rules` 2 / `5019cdf7…` (unchanged);
  `application:campaign_worker_ou` 1921 / `5cddaed4c530462cca7baa9aa37fc5e3` (changed by `10`/`20`, as
  intended); `metadata:…updated_at` unchanged; hazards 226 / 226 / 226 / 0 / 0 / H10 0 (identical to the
  preflight); every `ou_dependant:*` and `view:*` checksum identical to the preflight.
- **Step 11 — 2.2b forward again (exact file, connector; final clone state):** placements 1,921; `view_rows`
  3,217 = 1,921 placed pairs + 1,296 derived Unassigned pairs; groups 20; H9 0; post-assertions passed.
- **Step 12 — `95_role_probes.sql` (exact file, connector):** completed without exception (every failed probe is
  a `RAISE EXCEPTION`); final row 17 / 14 / 0 / false / true / probe campaign 68; rolled back. Under the
  unique index, the `user`-role owner probe executed all 17 public RPCs, `anon` was refused on a public RPC
  and on a helper, and the foreign-campaign probe raised `42501`.
- **Clone rehearsal verdict:** every file in `scripts/data-hygiene/oux-wp2.2/` and both migrations have now
  run forward, and both rollbacks forward → back → forward, on production-shaped data with real Employer
  containers (303 materialised placements) and real unattributed rule rows (207 relabelled); the WP2.1 `04`
  gate passes in its correct slot (D27). The clone is left at WP2.1 + 2.2a + `10` + `20` + 2.2b with marker
  `clone`; its ledger carries `20260913000000` (2.2a/2.2b were applied out of band and are intentionally not
  in its ledger — the clone is not a `db push` target).

### 9.3 Reviewer findings and resolution

#### Stage 1 reviews (2026-09-14, static pre-execution reviews; nothing had run on a database)

- **Verifier (Sonnet, §9.2):** independently reproduced the implementer's checks — migrations validate (13), `tsc`
  clean, lint total 294 (baseline), the six new TS files eslint-clean, 1,232 tests passing with exactly two
  failures: the guard test's acceptance case (by design until Stage 6, listing the 21 writers) and the
  pre-existing `wall-chart.render-cost` timing budget (untouched file, untouched subject; consistently over
  6,000 ms in this sandbox).
- **Review 1 (fresh Fable): CHANGES REQUIRED.** One blocking finding: 2.2b's `campaign_group_membership` view
  inherits the baseline's `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO authenticated`, the plan's
  `revoke … from public, anon` left `authenticated` with full rights, and the file's own post-assertion would
  have raised and rolled the migration back on dev. Seven advisories: legacy exclusivity trigger still refuses
  cross-container same-type moves/merges (record + pin by contract test); `90` refused the whole rollback when
  `universe` rows exist; two `42501` contract tests could skip silently; the parent-container-source move
  corner errored instead of displacing; blank `client_ref` references resolved silently; C-i over-claimed on
  remove-only paths; minor SQL points (missing `GET DIAGNOSTICS`, a void comment, role-attribute probe).
  Sections found clean: apply-ability on baseline + WP2.1 (every name verified), trigger interplay
  (`trg_cwo_z_set_group_id` fires on `UPDATE OF ou_id, group_id`, so `UPDATE … SET ou_id` re-derives
  `group_id`), C-a…C-l, security posture (32 functions, all `SECURITY INVOKER`, `pg_catalog`-first
  `search_path`, zero `SECURITY DEFINER`, no `anon` EXECUTE), `90`/`91` restored bodies byte-identical to
  their originals, wrapper/SQL `p_*` parity, guard scanner correctness, contract suite hygiene. **Resolution:**
  all eight applied in fix round 1 (§8.3 D15–D22, §11.6).
- **Review 2 (fresh Fable, fix-round verification): APPROVE WITH ADVISORIES.** All eight round-1 fixes
  confirmed FIXED with `path:line` evidence. Four advisories: A1 2.2a could not be re-applied after a `90` that
  left the three-value CHECK; A2 the role-attribute assertion passed vacuously on a missing role row; A3 the
  forbidden-campaign contract test lacked a before/after state read; A4 document the delete-then-insert vs
  `UPDATE` asymmetry under the legacy trigger for Stage 4. Also corrected an inaccurate evidence line in §11.6.
  **Resolution:** all applied in fix round 2 (§8.3 D23–D26, §11.7).
- Fix rounds used at Stage 1: two (the second advisory-only). The Stage 7 review of the whole diff is separate
  and still to come.

## 10. Revision history

- **Revision 4** (2026-09-14): the integration branch is `main`. `develop` is parked at `f5529a4a` (equal to
  `main` at parking; the phase-2 prompt expected `68400084`) and is not used. §0 step 6, §6.2–§6.4 and §9.1
  G1 now describe the `main`-based sequence (2.2a to production → operator merges PR #41 → `10` → `20` →
  `00` → `03b` if H9 > 0 → 2.2b → `04`), run as one checklist with each step's output pasted before the next
  (lesson from the WP2.1 production run, `wp/wp2.1.md` §15.5). Sync-on-open (`WorkforceBoard` →
  `/api/campaigns/[id]/sync-universe-workers`) added to the §2.3 writer inventory as row 15a and to the
  §3.11 switch table; WP2.2 routes it through the structure API and leaves its timing to WP2.4.
  `origin/main` (`f5529a4a`) merged into the branch with `--no-ff` (`93df7e28`, docs-only, no conflicts);
  PR #41 retargeted to `main`. The orchestration prompt for this phase is saved verbatim as
  `docs/organiser-ux-review/PHASE2_MAIN_ORCHESTRATION_PROMPT.md`.
- **Revision 3** (2026-09-14): §0 step 1 recorded as done (production has WP2.1 with cleanup and a passing
  postflight; `wp/wp2.1.md` §15). Step 2 (dev) was found already applied the same day, so no
  database action is outstanding; Stage 1 may start. §2.7's regen hazard no longer applies to WP2.1 symbols (G1 still applies to
  WP2.2a).
- **Revision 2** (2026-09-13): §0 rewritten as a plain six-step table after operator feedback; approvals
  recorded in §9.1 (R1, M2-a, K1, G1).
- **Revision 1** (2026-09-13): initial plan. Recommends S1 + S2, R1 (+R1-b), M2-a, K1, G1, separate
  contract config, C-k. Two migrations (2.2a additive/compatible, 2.2b enforcement). 15 public RPCs; 21
  writer files + split dialog switched; guard test as the automated acceptance check.

## 11. Stage-1 implementation evidence (2026-09-14)

**Nothing in this section has been executed against a database.** No Supabase MCP tool, no `supabase` CLI
command, no network call to any Supabase host and no local PostgreSQL were used; `supabase/.temp/project-ref`
was not touched (it points at production and was read only to confirm that). The SQL below is statically
checked only: (a) every file parses under the PostgreSQL 17 grammar (`libpg-query` 17.7.4, `parse`, run from
a scratch directory — 70 / 15 / 11 / 9 / 44 / 13 / 11 statements for 2.2a / 2.2b / 10 / 20 / 90 / 91 / 95),
(b) every PL/pgSQL block was checked for `IF/END IF`, `LOOP/END LOOP`, `BEGIN/END` balance, and (c) the
function bodies were desk-reviewed against the baseline objects listed in §11.3. **The first execution of any
of it is Stage 2 on normal dev after operator approval.** Deviations are in §8.3 (D1–D14).

### 11.1 Files

New:

| File | Role |
|---|---|
| `supabase/migrations/20260914090000_wp2_2_structure_api.sql` | WP2.2a (§3.5): CHECK widened; relaxed container trigger; schema `oux_internal` + 14 helpers; 17 public RPCs; grants; post-assertions. 3,256 lines. |
| `supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql` | WP2.2b (§3.6): H9 precondition; unique index; duplicate pre-check trigger; `campaign_group_membership`; post-assertions. |
| `scripts/data-hygiene/oux-wp2.2/README.md` | run order (dev / clone / production), rollback order, per-file output, the production `SET LOCAL` rule, never-on-production list. |
| `scripts/data-hygiene/oux-wp2.2/10_materialise_employer_placements.sql` | M2-a, env-guarded, stop condition §8.4 item 4, idempotent. |
| `scripts/data-hygiene/oux-wp2.2/20_relabel_unattributed_rule_rows.sql` | R1-b, env-guarded, logs to `_oux_hygiene_log`. |
| `scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql` | recovery-only rollback of 2.2a. |
| `scripts/data-hygiene/oux-wp2.2/91_rollback_wp2_2_enforcement.sql` | recovery-only rollback of 2.2b. |
| `scripts/data-hygiene/oux-wp2.2/95_role_probes.sql` | grant/RLS probes, always rolls back (D2). |
| `apps/organising-db/src/lib/campaign/structure-api.ts` | the typing boundary (§3.9). |
| `apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts` | 51 unit tests: error mapping, serialisation, result parsing. |
| `apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` | the guard (3 cases; case 2 fails by design until Stage 6). |
| `apps/organising-db/src/lib/campaign/__contract__/structure-api.contract.test.ts` | contract suite (§4.2), run at Stage 3. |
| `apps/organising-db/vitest.contract.config.ts` | `pnpm test:contract` config. |

Modified: `apps/organising-db/package.json` (`test:contract` script), `apps/organising-db/vitest.config.ts`
(one `exclude` line, D5), this file (§8.3, §11). No product code, no writer file, no `generated.ts`, no
`supabase/.temp` change. Timestamps chosen: `20260914090000` and `20260914090100` (both later than
`20260913000000_an_survey_reports.sql`; `pnpm validate:migrations` passes).

### 11.2 RPC signatures as implemented (all `RETURNS jsonb`, plpgsql, `SECURITY INVOKER`, `SET search_path TO pg_catalog, public, oux_internal`)

```sql
structure_group_create(p_campaign_id integer, p_kind text, p_name text, p_display_order integer DEFAULT NULL)
  → {group_id, created}
structure_group_update(p_campaign_id integer, p_group_id integer, p_name text DEFAULT NULL, p_display_order integer DEFAULT NULL)
  → {group_id}
structure_group_reorder(p_campaign_id integer, p_group_ids integer[])
  → {updated, unlisted}
structure_group_delete(p_campaign_id integer, p_group_id integer, p_mode text)
  → {group_id, deleted_ou_ids, placements_removed}
structure_units_create(p_campaign_id integer, p_units jsonb, p_assignments jsonb DEFAULT '[]')
  → {units:[{client_ref, ou_id, group_id}], inserted, moved, skipped, displaced}
structure_unit_update(p_campaign_id integer, p_ou_id integer, p_patch jsonb)
  → {ou_id, updated_keys}
structure_unit_reorder(p_campaign_id integer, p_ou_ids integer[])
  → {updated}
structure_unit_delete(p_campaign_id integer, p_ou_id integer, p_reassignments jsonb DEFAULT '[]', p_delete_children boolean DEFAULT false)
  → {deleted_ou_ids, placements_moved, placements_removed, placements_displaced}
structure_unit_merge(p_campaign_id integer, p_survivor_ou_id integer, p_source_ou_ids integer[])
  → {moved, collapsed, deleted_ou_ids, repointed:{<table>: n}}
structure_unit_split(p_campaign_id integer, p_source_ou_id integer, p_children jsonb, p_assignments jsonb, p_keep_in_source boolean DEFAULT false, p_group_id integer DEFAULT NULL)
  → {children:[{client_ref, ou_id, group_id}], moved, copied, kept, displaced}
structure_units_bulk_save(p_campaign_id integer, p_delete_ou_ids integer[], p_updates jsonb, p_creates jsonb)
  → {deleted_ou_ids, updated_ou_ids, created:[…], placements_removed}
structure_placements_assign(p_campaign_id integer, p_ou_id integer, p_worker_ids integer[], p_source text DEFAULT 'manual', p_is_primary boolean DEFAULT false, p_on_conflict text DEFAULT 'skip')
  → {inserted, moved, skipped, displaced}
structure_placements_move(p_campaign_id integer, p_worker_ids integer[], p_from_ou_id integer DEFAULT NULL, p_to_ou_id integer DEFAULT NULL, p_within_group_id integer DEFAULT NULL, p_keep_source boolean DEFAULT false, p_keep_in_parent boolean DEFAULT true)
  → {moved, inserted, displaced, removed, skipped, parent_inserted}
structure_placements_unassign(p_campaign_id integer, p_worker_ids integer[], p_ou_id integer DEFAULT NULL, p_within_group_id integer DEFAULT NULL)
  → {removed}
structure_placements_set_primary(p_campaign_id integer, p_worker_id integer, p_ou_id integer)
  → {placement_id, cleared}
structure_placements_replace_rule_rows(p_campaign_id integer, p_rows jsonb)
  → {removed, inserted, skipped}
structure_materialise_employer_placements(p_campaign_id integer)
  → {inserted, skipped_existing, containers, multi_container_workers}
```

Internal (schema `oux_internal`, D1): `structure__assert_can_write(integer)`, `structure__unit(integer, integer)`,
`structure__group(integer, integer)`, `structure__worker_ids(integer, integer[], boolean)`,
`structure__set_primary(integer, integer, integer)`,
`structure__place(integer, campaign_organising_units, integer, text, boolean, text, integer) → (outcome, displaced, lost_primary)`,
`structure__json_int/_bool/_text/_object(jsonb, text, text)`, `structure__json_array(jsonb, text)`,
`structure__create_units(integer, jsonb, jsonb)`, `structure__update_unit(integer, campaign_organising_units, jsonb)`,
`structure__delete_unit(integer, campaign_organising_units, jsonb, boolean)`.

### 11.3 Baseline objects confirmed (`supabase/migrations/20260908050000_baseline_schema.sql`)

- CHECK: `campaign_worker_ou_assignment_source_check` (`:9644`), `('manual','rule')` — widened by 2.2a, restored by `90`.
- Unique keys: `campaign_worker_ou_ou_id_worker_id_key (ou_id, worker_id)` (`:19161`); `campaign_ou_coverage_ou_id_key (ou_id)`;
  `woc_scope_units_pkey (woc_id, ou_id)`; `structure_test_results_structure_test_id_ou_id_key`;
  `section_plan_workforce_mappin_section_plan_id_worksite_ou_i_key (section_plan_id, worksite_ou_id)`;
  `campaign_worker_list_items_list_id_worker_id_key` (not on the ou column). `campaign_unit_rules` carries `campaign_id`.
- FKs to `campaign_organising_units(ou_id)` (`:23521–25126`): self `ou_group_id` NO ACTION, self `parent_ou_id` SET NULL,
  `campaign_ou_candidates.accepted_ou_id` SET NULL, `campaign_ou_coverage.ou_id` CASCADE,
  `campaign_stage_workplan_tasks.assigned_ou_id` SET NULL, `campaign_unit_rules.ou_id` CASCADE,
  `campaign_wocs.scope_ou_id` SET NULL, `campaign_worker_list_items.source_ou_id` SET NULL,
  `campaign_worker_ou.ou_id` CASCADE, `section_plan_workforce_mapping_overrides.worksite_ou_id` CASCADE,
  `structure_test_results.ou_id` CASCADE, `woc_scope_units.ou_id` CASCADE; plus WP2.1 `campaign_groups.source_ou_id` SET NULL.
  No later migration adds another referencer. Matches the §3.3 list; no undocumented dependant (§8.4 item 5 not triggered).
- Trigger functions: `check_no_worker_on_group_container()` (`:1083–1102`, `LANGUAGE plpgsql`, no SECURITY/search_path
  clause — preserved); `check_worker_ou_group_exclusivity()` (`:1209–1247`, left in place; note it fires on
  `UPDATE OF ou_id`, so a move between member units of two *different* containers of the same `ou_type` is still
  refused, exactly as today's insert-before-delete is); `cou_enforce_group_consistency()` (`:1626`) and
  `cou_enforce_hierarchy_invariants()` (`:1658`) — the unit inserts respect their invariants (`ou_group_id = parent_ou_id`).
- Write policies on the nine re-point tables all exist for `authenticated` (`FOR ALL … _write` or
  `Admin/User can update …`); the merge asserts the re-point counts so an RLS gap raises `P0002`.
- `can_write_to_campaign` (`:994`) is `SECURITY DEFINER`; `get_user_role()` / `is_admin()` likewise; the pre-check
  combines them exactly as `20260909120000_wp1_6_campaign_write_policies.sql` does.
- `packages/db-types/generated.ts:6467–6486`: no `description` / `leader_worker_id` on units (D3).

### 11.4 Raw command output

```
$ pnpm validate:migrations

> offshore-alliance-monorepo@ validate:migrations /home/user/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 13 Supabase migrations with unique 14-digit versions.
[exit=0]

$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -v '^ *$' | grep -E 'Test Files|Tests |×|FAIL|AssertionError|expected|file\(s\) still write|✓|^ *\+ ' 
… (89 passing files elided; the two new files:)
 ✓ src/lib/campaign/__tests__/structure-api.test.ts (51 tests) 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 21 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  lib/workers/sync-campaign-universe.ts: expected [ …(21) ] to deeply equal []
+ Received
+ Array [
+   "app/api/campaign-import/apply/route.ts",
+   "app/api/campaigns/[id]/add-workers/route.ts",
+   "app/api/campaigns/[id]/create-worker/route.ts",
+   "app/api/campaigns/[id]/workers/duplicates/route.ts",
+   "app/api/worker-import/apply/route.ts",
+   "app/api/worker-import/organising-units/route.ts",
+   "components/campaigns/campaign-settings.tsx",
+   "components/campaigns/campaign-units-section.tsx",
+   "components/campaigns/campaign-wizard.tsx",
+   "components/campaigns/wall-chart/create-organising-unit-dialog.tsx",
+   "components/campaigns/wall-chart/delete-organising-unit-dialog.tsx",
+   "components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts",
+   "components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts",
+   "components/campaigns/wall-chart/merge-units-dialog.tsx",
+   "components/campaigns/wall-chart/move-worker-mutation.ts",
+   "components/campaigns/wall-chart/unit-rating-control.tsx",
+   "components/campaigns/wall-chart/worker-detail-sheet.tsx",
+   "lib/campaign/recompute-ou-assignments.ts",
+   "lib/campaign/use-allocate-workers-to-ou.ts",
+   "lib/hooks/useRemoveWorkerFromCampaign.ts",
+   "lib/workers/sync-campaign-universe.ts",
+ ]
     99|       `${found.length} file(s) still write directly to campaign_organi…
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 7478.059343 to be less than 6000
 Test Files  2 failed | 89 passed (91)
      Tests  2 failed | 1232 passed (1234)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/lib/campaign/structure-api.ts src/lib/campaign/__tests__/structure-api.test.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__contract__/structure-api.contract.test.ts vitest.contract.config.ts vitest.config.ts
[exit=0]

$ pnpm --filter organising-db lint 2>&1 | tail -6
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1

$ rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' --glob '!**/__contract__/**' -l
apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
apps/organising-db/src/lib/workers/sync-campaign-universe.ts
apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
apps/organising-db/src/components/campaigns/campaign-units-section.tsx
apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
[exit=0]

$ git status --short
 M apps/organising-db/package.json
 M apps/organising-db/vitest.config.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/lib/campaign/__contract__/
?? apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts
?? apps/organising-db/src/lib/campaign/structure-api.ts
?? apps/organising-db/vitest.contract.config.ts
?? scripts/data-hygiene/oux-wp2.2/
?? supabase/migrations/20260914090000_wp2_2_structure_api.sql
?? supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql
[exit=0]
```

Reading: 1,234 tests, 1,232 passing (baseline before Stage 1: 1,180 total, 1,179 passing + the same
render-cost failure). The two failures are (1) guard case 2, failing by design with the 21-file listing above,
and (2) `wall-chart.render-cost.test.tsx`, a timing budget (6,000 ms) that this sandbox misses before and after
Stage 1 (baseline 6,581 ms; in isolation after Stage 1 7,134 ms) — not a WP2.2 file, not caused by WP2.2, and
not skipped or weakened. Lint total 294 = the recorded baseline (the new files contribute 0 problems; the
`tail -3` form of the §5 command shows only the pnpm error lines, hence `tail -6`). The `rg` line finds 6
files because it is single-line and expects the cast after the paren (D7); the guard test's scanner finds
exactly the 21 files of §2.3.

### 11.5 Open questions for the orchestrator / operator before Stage 2

1. **PostgREST exposed schemas (D1).** Confirm on dev and production that the API "Exposed schemas" setting
   does not include `oux_internal` (default `public, graphql_public`). The helpers are `SECURITY INVOKER` and
   executable by `authenticated`; their only REST protection is the schema not being exposed.
2. **`10_` execution path.** The script must run as `postgres` (SQL editor) or `service_role`; an
   `authenticated` session is refused per campaign by the pre-check. Confirm this matches the operator's run
   sheet. No automated reversal of `10_`/`20_` is provided; `90` refuses while `universe` rows exist.
3. **Contract-suite prerequisites on dev:** a `user`-role account that can create campaigns
   (`OUX_CONTRACT_USER_*`); at least four `workers` rows (the suite uses the first six by id or
   `OUX_CONTRACT_WORKER_IDS`, because a user-role account cannot delete workers it creates); optionally a second
   non-admin account (`OUX_CONTRACT_FOREIGN_USER_*`) and a campaign the main account cannot write to
   (`OUX_CONTRACT_FOREIGN_CAMPAIGN_ID`) for the `42501` tests (`it.skipIf` when absent — the only visible skips
   in the suite). The suite inserts one `campaign_unit_rules` row on its own fixture unit for the merge
   re-point test and deletes it. `delete_campaign` cascades the rest; `afterAll` asserts zero leftovers.
4. **`collapsed > 0` in `structure_unit_merge`** needs a pre-WP2.2b duplicate the API cannot create; it is
   covered only by the clone rehearsal on real H9 data (§0 step 5), not by the contract suite.
5. **Plan-text corrections to approve:** D3 (column names), D4 (`p_keep_in_parent`), D8 (merge refuses
   sources with children), D9 (C-h reading), D12 (M2 predicate).
6. **Pre-existing failing test** `wall-chart.render-cost.test.tsx` (timing) — outside WP2.2; decide whether the
   verifier's environment is expected to pass it.

### 11.6 Fix round 1 (2026-09-14)

Still no database, CLI, commit or product-code change. Findings from the fresh reviewer and what changed
(deviation rows D15–D22 in §8.3):

| # | Finding | Change |
|---|---|---|
| 1 (blocking) | 2.2b view grants: baseline default privileges (`:33393–33396`) give `authenticated` ALL on new `public` relations; the wp2.1.md §2.3 revoke (`public, anon`) would have failed the post-assertion and rolled back the file. | `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role; GRANT SELECT … TO authenticated, service_role;` (view text verbatim). Post-assertion also checks `service_role` has no INSERT/UPDATE/DELETE. Checked the rest: the default privileges are `IN SCHEMA public` only; `oux_internal` holds functions only (their PUBLIC EXECUTE was already revoked); no table or sequence was created anywhere. **D15.** |
| 2 | Legacy `trg_check_worker_ou_group_exclusivity` refuses cross-container same-type `UPDATE … SET ou_id` (move) and merge with `P0001`. | Recorded under §3.4 C-b/C-j and §8.2; contract fixture gains `employerB` + `siteB`; two tests pin `rule_violation` for the move (`keepInParent: false`) and the merge, asserting unchanged state. The materialise test's `containers` expectation becomes 2. **D17.** |
| 3 | `90` refused the whole rollback while `universe` rows existed. | Functions/schema/trigger body rolled back unconditionally; CHECK restore in its own conditional `DO` (NOTICE + count, three-value CHECK left in place); post-assertion accepts either outcome consistently; result set adds `universe_rows_blocking_check_restore`. README updated. **D16.** |
| 4 | `42501` tests were `it.skipIf` and could vanish. | `OUX_CONTRACT_FOREIGN_CAMPAIGN_ID` required (throws when absent); its test always runs and covers three RPCs; foreign-user pair must be both-or-neither (throws otherwise); the gated test's name states the skip; README/§4.2 require the Stage 3 paste to report the skipped count. **D18.** |
| 5 | Parent-container source → worksite target routed to `structure__place(…, 'error')`, raising `23505` where every other source displaces. | New `ELSIF` branch: displace the worker's rows in the target's group, insert the target placement, keep the parent row (copy semantics for the parent only), carry a displaced primary. **D19.** |
| 6 | `coalesce(v_ref, '')` let a blank `parent_ou_id` / `ou_group_id` string resolve to an unnamed element. | Blank string references raise `22023`. **D20.** |
| 7 | Remove-only paths verify worker existence, not membership. | No code change; exact semantics recorded. **D21.** |
| 8a | `structure_group_update` container rename lacked `GET DIAGNOSTICS`. | Filter `name IS DISTINCT FROM` dropped; one row asserted (`P0002`). **D22.** |
| 8b | "avoids a scan under lock" comment void inside one transaction. | Comment corrected; code kept. **D22.** |
| 8c | `'skip'` + `p_is_primary` with the worker elsewhere in the group leaves the flag untouched. | Added to D14. |
| 8d | `replace_rule_rows` re-inserts a previously primary rule row as non-primary. | Recorded (D22, §3.8/D9). |
| 8e | Detach path on a custom-kind container named like a type label can hit `campaign_group_ensure`'s `23505`. | Recorded (D22); dialog passes `deleteChildren: true`. |
| 8f | D10(b) bypass depends on `anon`/`authenticated` not being superuser/bypassrls. | Assertion added to 2.2a's post-assertion `DO` block and to `95_role_probes.sql`. **D22.** |

Files touched in this round: both migrations, `oux-wp2.2/90_…`, `oux-wp2.2/95_…`, `oux-wp2.2/README.md`,
`__contract__/structure-api.contract.test.ts`, this file (§3.4, §4.2, §8.2, §8.3, §11.6). Grammar parse
(libpg-query 17, PostgreSQL 17 grammar, `check-sql.mjs` → `parse`) of the four changed SQL files passes
(statement counts below; `90` is now 42 statements, `DoStmt` 4). The line "plpgsql blocks with structural
mismatches: 0" below is the output of a Python **keyword-pairing** check, not a PL/pgSQL parse (D26): for every
`$tag$ … $tag$` block in all seven files, with comments and string literals stripped, it requires `IF` = `END IF`,
`LOOP` = `END LOOP`, and `BEGIN` = `END` − SQL `CASE` count. No PL/pgSQL parser was available (the installed
libpg-query builds export `parse` only).

Raw output:

```
$ node /tmp/claude-0/-home-user-OffshoreAlliance/a610ec8e-ce19-5d90-bc84-f9d8f12d581b/scratchpad/pgparse/check-sql.mjs supabase/migrations/20260914090000_wp2_2_structure_api.sql supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql scripts/data-hygiene/oux-wp2.2/95_role_probes.sql
OK  supabase/migrations/20260914090000_wp2_2_structure_api.sql: 70 statements {"DoStmt":3,"AlterTableStmt":3,"CommentStmt":29,"CreateFunctionStmt":32,"CreateSchemaStmt":1,"GrantStmt":2}
OK  supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql: 15 statements {"DoStmt":2,"CreateStmt":1,"InsertStmt":1,"DropStmt":1,"IndexStmt":1,"CommentStmt":3,"CreateFunctionStmt":1,"ViewStmt":1,"GrantStmt":2,"AlterTableStmt":1,"SelectStmt":1}
OK  scripts/data-hygiene/oux-wp2.2/90_rollback_wp2_2_structure_api.sql: 42 statements {"TransactionStmt":2,"DoStmt":4,"CreateTableAsStmt":1,"DropStmt":32,"CreateFunctionStmt":1,"CommentStmt":1,"SelectStmt":1}
OK  scripts/data-hygiene/oux-wp2.2/95_role_probes.sql: 11 statements {"TransactionStmt":2,"DoStmt":4,"VariableSetStmt":4,"SelectStmt":1}
[exit=0]

$ pnpm validate:migrations

> offshore-alliance-monorepo@ validate:migrations /home/user/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 13 Supabase migrations with unique 14-digit versions.
[exit=0]

$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E 'Test Files|Tests |×|FAIL|AssertionError|structure-api.test|no-direct-structure-writes.test'
 ✓ src/lib/campaign/__tests__/structure-api.test.ts (51 tests) 26ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 110ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 55ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 22931ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 21 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:100:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 7215.946166 to be less than 6000
 Test Files  2 failed | 89 passed (91)
      Tests  2 failed | 1232 passed (1234)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/lib/campaign/structure-api.ts src/lib/campaign/__tests__/structure-api.test.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__contract__/structure-api.contract.test.ts vitest.contract.config.ts vitest.config.ts
[exit=0]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
[exit=0]

$ git status --short
 M apps/organising-db/package.json
 M apps/organising-db/vitest.config.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/lib/campaign/__contract__/
?? apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts
?? apps/organising-db/src/lib/campaign/structure-api.ts
?? apps/organising-db/vitest.contract.config.ts
?? scripts/data-hygiene/oux-wp2.2/
?? supabase/migrations/20260914090000_wp2_2_structure_api.sql
?? supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql
[exit=0]

$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

plpgsql blocks with structural mismatches: 0
```

Reading: unchanged from §11.4 — 1,234 tests, 1,232 passing; the two failures are guard case 2 (by design)
and the pre-existing render-cost timing test (7,216 ms vs the 6,000 ms budget in this sandbox); eslint on
every new/changed TS file clean; lint total 294 = baseline; `git status` shows the same 11 entries.

### 11.7 Fix round 2 (2026-09-14)

Still no database, CLI, commit or product-code change. Reviewer advisories A1–A4 plus the evidence note
(deviation rows D23–D26 in §8.3):

| # | Change |
|---|---|
| A1 | 2.2a section 0 accepts a CHECK whose values are exactly `(manual, rule)` or exactly `(manual, rule, universe)` (values extracted from `pg_get_constraintdef`; any other shape raises) and rows in the three values; section 1 is a `DO` block that skips the drop/add/validate with a NOTICE when `universe` is already allowed. Post-assertion unchanged. README rollback section: a re-forward after a `90` that left the three-value CHECK is supported for that reason; `10`/`20` are never reversed automatically. **D23.** |
| A2 | 2.2a post-assertion and `95` now require `count(*) FILTER (WHERE NOT rolsuper AND NOT rolbypassrls) = 2` over exactly `anon` and `authenticated`. **D24.** |
| A3 | Forbidden-campaign contract test reads the foreign campaign's placements through the main client before and after the three refused calls and asserts equality. **D25.** |
| A4 | One sentence added to D17 and D19 stating the delete-then-insert (parent-source) vs `UPDATE … SET ou_id` (plain move) asymmetry under the legacy exclusivity trigger; correct as written, Stage 4 should expect it. |
| Evidence note | §11.6 reworded: the "structural mismatches: 0" line came from a Python keyword-pairing check, not a PL/pgSQL parse; the scratchpad `check.mjs` never ran (no `parseQuery`/`parsePlPgSQL` in the installed libpg-query build); only `check-sql.mjs` (`parse`, SQL grammar) was used. The keyword check is re-run below under an accurate label. **D26.** |

Files touched this round: 2.2a migration, `oux-wp2.2/95_role_probes.sql`, `oux-wp2.2/README.md`, the
contract suite, this file (§8.3 D17/D19/D23–D26, §11.6, §11.7). 2.2a is now 68 statements (`DoStmt` 4):
the three section-1 `ALTER TABLE` statements moved inside a `DO` block.

Raw output:

```
$ node /tmp/claude-0/-home-user-OffshoreAlliance/a610ec8e-ce19-5d90-bc84-f9d8f12d581b/scratchpad/pgparse/check-sql.mjs supabase/migrations/20260914090000_wp2_2_structure_api.sql scripts/data-hygiene/oux-wp2.2/95_role_probes.sql
OK  supabase/migrations/20260914090000_wp2_2_structure_api.sql: 68 statements {"DoStmt":4,"CommentStmt":29,"CreateFunctionStmt":32,"CreateSchemaStmt":1,"GrantStmt":2}
OK  scripts/data-hygiene/oux-wp2.2/95_role_probes.sql: 11 statements {"TransactionStmt":2,"DoStmt":4,"VariableSetStmt":4,"SelectStmt":1}
[exit=0]

$ python3 /tmp/claude-0/-home-user-OffshoreAlliance/a610ec8e-ce19-5d90-bc84-f9d8f12d581b/scratchpad/plpgsql-keyword-check.py
keyword-pairing check (IF/END IF, LOOP/END LOOP, BEGIN/END minus SQL CASE) over 60 dollar-quoted blocks in 7 files: 0 mismatches
[exit=0]

$ pnpm validate:migrations

> offshore-alliance-monorepo@ validate:migrations /home/user/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 13 Supabase migrations with unique 14-digit versions.
[exit=0]

$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E 'Test Files|Tests |×|FAIL|AssertionError|structure-api.test|no-direct-structure-writes.test'
 ✓ src/lib/campaign/__tests__/structure-api.test.ts (51 tests) 30ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 117ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 58ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 20725ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 21 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:100:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 6715.741373000001 to be less than 6000
 Test Files  2 failed | 89 passed (91)
      Tests  2 failed | 1232 passed (1234)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/lib/campaign/structure-api.ts src/lib/campaign/__tests__/structure-api.test.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__contract__/structure-api.contract.test.ts vitest.contract.config.ts vitest.config.ts
[exit=0]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
[exit=0]

$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)
[exit=0]

$ git status --short
 M apps/organising-db/package.json
 M apps/organising-db/vitest.config.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/lib/campaign/__contract__/
?? apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-api.test.ts
?? apps/organising-db/src/lib/campaign/structure-api.ts
?? apps/organising-db/vitest.contract.config.ts
?? scripts/data-hygiene/oux-wp2.2/
?? supabase/migrations/20260914090000_wp2_2_structure_api.sql
?? supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql
[exit=0]
```

Reading: unchanged — 1,234 tests, 1,232 passing; the two failures are guard case 2 (by design) and the
pre-existing render-cost timing test (6,716 ms vs 6,000 ms); eslint clean on every new/changed TS file; lint
total 294 = baseline; `git status` shows the same 11 entries. Stage 1 stops here.
