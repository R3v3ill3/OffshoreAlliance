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
  *Stage 4 fix round: that assumption did not hold for the nested-card drop (the second call had a different
  target); fixed in WP2.2 after all — §8.3 D32.*
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
| 1 | `move-worker-mutation.ts` | `placements.move` (one call per mutation; `toOuId: null` → unassign-all; new optional `withinGroupId` param reserved for WP2.4, unused now). `keepInParent` parent inserts (`:184–207`, `:265–289`) become part of the RPC's move (the parent, being a container with `group_id`, is now a legal target under C-e; when the parent has no `group_id` the RPC skips it and reports `skipped`). `onSettled` invalidations unchanged. — **done (Stage 4)** |
| 2 | `merge-units-dialog.tsx` | `units.merge`. — **done (Stage 4)** |
| 3 | `delete-organising-unit-dialog.tsx` | `units.remove` with `reassignments` built from the dialog's per-worker choices and `deleteChildren: true` (today's order). — **done (Stage 4)** |
| 4 | `create-organising-unit-dialog.tsx` | `units.create` (single / add-to-existing / container+members are three payload shapes of one call, with `assignments`); the display-order loop → part of the same call (`display_order` on each element). — **done (Stage 4)** |
| 5 | `worker-detail-sheet.tsx` | `placements.setPrimary`; `placements.unassign({ ouId })`. — **done (Stage 4)** |
| 6 | `unit-rating-control.tsx` | `units.update({ user_rating })`. — **done (Stage 4)** |
| 7 | `use-wall-chart-structure.ts` | `units.reorder`. — **done (Stage 4)** |
| 8 | `use-wall-chart-actions.ts` | `placements.unassign({ ouId })` per ref, batched by unit. — **done (Stage 4)** |
| 9 | `campaign-units-section.tsx` | `units.bulkSave` for the unit CRUD; `placements.assign` / `placements.unassign` for the member editor (`:798`, `:804`). — **done (Stage 5)** (`units.update` for the rating as row 6; the reallocate dialog is one `placements.move`, D50) |
| 10 | `campaign-wizard.tsx` | `units.bulkSave` (`:795–894`); `placements.unassign` + `placements.assign` (`:1102`, `:1118`). Wizard `cid` vs `campaign_id` advisory untouched. — **done (Stage 5)** (through `lib/campaign/structure-save.ts`, D41–D45) |
| 11 | `campaign-settings.tsx` | same as 10. — **done (Stage 5)** |
| 12 | `useRemoveWorkerFromCampaign.ts` | `placements.unassign` (all) — the membership delete that follows stays as is (not one of the two tables). — **done (Stage 5)** |
| 13 | `use-allocate-workers-to-ou.ts` | `placements.assign(onConflict: 'skip')` — today's insert has no `onConflict`, so a duplicate `(ou_id, worker_id)` currently errors; the hook's callers are checked and `skip` vs `error` chosen per caller (recorded in deviations). — **done (Stage 5)** (one caller, `workforce-bulk-toolbar.tsx`: `skip`, D46) |
| 14 | `recompute-ou-assignments.ts` | `placements.replaceRuleRows` (one call per campaign). — **done (Stage 6)** (rows attributed to the matching rule, D63) |
| 15 | `sync-campaign-universe.ts` | `placements.assign(source: 'universe' \| 'rule' per R, onConflict: 'skip')` per target unit; `loadOuTargets` paged (§3.10). — **done (Stage 6)** (`source: 'universe'`, R1; container parent per §3.7, D60; paging D61; counts D62) |
| 15a | `sync-universe-workers/route.ts` + `workforce-board.tsx:55–79` (sync-on-open) | Routed through the structure API by row 15: the route keeps calling `syncCampaignUniverseFromEmployersWorksites`, which after row 15 writes only through `placements.assign` (`source: 'universe'`, `onConflict: 'skip'`), so a page open is safe both before and after WP2.2b (a worker already placed in the target's group is skipped, never duplicated). WP2.2 does **not** change *when* the sync runs: the mount query, its `enabled: canWrite` and `staleTime` stay as they are; whether sync-on-open survives at all is WP2.4's decision (`PROGRESS.md` incidental findings). The guard test lists this route among the writer paths it documents and additionally asserts the route file contains no `.from("campaign_organising_units")` / `.from("campaign_worker_ou")` call, so a later direct write there cannot slip past the regex inventory. — **done (Stage 6, through row 15; no code change; guard case 3 green)** |
| 16 | `campaign-import/apply/route.ts` | `units.create` (`:525`, `:637`, with `client_ref` for the container→member link); `placements.assign(isPrimary: true, source: 'manual', onConflict: 'skip')`. — **done (Stage 6)** (one `units.create` for containers and members, D65) |
| 17 | `add-workers/route.ts` | `units.create`; `placements.assign`. — **done (Stage 6)** (`onConflict: 'skip'`, D66) |
| 18 | `create-worker/route.ts` | `placements.assign`. — **done (Stage 6)** (`onConflict: 'skip'`, D66) |
| 19 | `workers/duplicates/route.ts` | `placements.unassign` (all, for the duplicate worker) before `merge_workers`. — **done (Stage 6)** (one campaign, in the "remove" action; D67) |
| 20 | `worker-import/organising-units/route.ts` | `units.create`. — **done (Stage 6)** (D68) |
| 21 | `worker-import/apply/route.ts` | `placements.assign`. — **done (Stage 6)** (`onConflict: 'skip'`, D66) |
| — | `split-unit-dialog.tsx:436–441` | `units.split`; the legacy RPC is no longer called. — **done (Stage 4)** |

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
4a. **Supabase GitHub integration (found 2026-09-14, operator report):** the production project's GitHub
   integration has "deploy" set to **automatic on branch `main`**. If that deploy runs the repository's
   pending migrations on a push to `main`, the merge of PR #41 would apply whatever is not yet on
   production's ledger — after step 2 that is exactly WP2.2b, ahead of `10`/`20`/`00`/`04` (the order
   step 3 requires) and outside the run-sheet rule; the same hazard the Stage 7 review recorded for
   `supabase db push` (§8.2). Evidence that it may not fire: PR #40 (WP2.1) merged with a migration on
   2026-09-12 and production did not receive it until the operator's run sheet on 2026-09-13
   (`PROGRESS.md` WP2.1 row); the PR #41 "Supabase Preview" check is `skipped` and the integration
   comment said the PR was "ignored". Whether it fires or not is not to be tested on production:
   **before the merge the operator switches that deploy off (or to manual) and confirms it here**, and
   switches it back only after step 3 completes, when production's ledger carries both files and a
   deploy would apply nothing. Recorded as a human task in `PROGRESS.md`. **Operator confirmation
   2026-09-14: "i have switched the github deploy to manual."** The merge condition of this step is met;
   the switch-back stays a step-3 follow-up.
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
- Stage 4: `apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts` (D28), moved in
  Stage 5 to `apps/organising-db/src/lib/campaign/structure-error-message.ts` (D40)
- Stage 5: `apps/organising-db/src/lib/campaign/structure-save.ts` (the wizard/settings save plans, D41–D45),
  `src/lib/campaign/__tests__/structure-save.test.ts`, `src/lib/campaign/__tests__/fake-structure-client.ts`,
  `src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx`,
  `src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx`,
  `src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx`
- Stage 6: `apps/organising-db/src/components/campaigns/workforce/allocate-toast-message.ts` (D73) and
  `src/components/campaigns/workforce/__tests__/allocate-toast-message.test.ts`,
  `src/lib/campaign/__tests__/recompute-ou-assignments.test.ts` (D64)

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
| WP2.3 nested-card double `move` | second call is a no-op (`moved: 0`) — verified by an interaction test; advisory remains open for WP2.4 UI fix. *Stage 4 (D31): the no-op holds only when both calls name the same target; on the nested-card drop the second call named the parent container, so it was a second, different move. **Fixed in the Stage 4 fix round (D32): the parent card ignores a drop a nested card already consumed; one call per drop, pinned by the WP2.3 characterisation and a Stage 4 test (§11.9).* |
| e2e hygiene (`tests/e2e/structure-api.spec.ts`, review round 2 N4, advisory) | The chosen worker's original placements (`chosen`) live only in memory: a hard kill between `placeOnlyOn` and `afterAll` loses them and the worker is left as the last test placed it. **Deferred to Stage 5**, when the spec first runs on the preview: persist `chosen` to `test-results/` before the first write and restore from that file in the next `beforeAll` before sweeping. Until then the risk is one dev worker on campaign 1 whose placements must be put back by hand from the `[wp2.2] fixture` log line. |
| Merge loses dependants | explicit re-point list in `structure_unit_merge`; contract test per dependant table. |
| Unpaged placement read in `savePlacements` (Stage 5 review round 1, advisory 5) | `lib/campaign/structure-save.ts` reads `campaign_worker_ou … .in("ou_id", ouIds)` for the units the screen knows, without `.range()`; PostgREST's max-rows setting would truncate it silently. A truncated row is treated as absent, so it is neither unassigned nor re-assigned — it **survives** (safer than the legacy wipe-and-reinsert, which deleted every row regardless). Stage 6's paging of `loadOuTargets` (§3.10) does not cover this read; Stage 6 decides whether to page it with the same `PAGE_SIZE` loop. **Stage 6: paged** — `.order("ou_id").order("worker_id").range(from, from + PAGE_SIZE - 1)` until a short page, through the same helper as `loadOuTargets` (D71); 2,500-row test in `structure-save.test.ts`. **Stage 7 (A1, D77): the rationale above was inverted by D71 alone** — with `current` complete and the screens' hydration reads (`campaign_worker_ou` and `campaign_worker_membership` in `campaign-settings.tsx` / `campaign-wizard.tsx`) still unranged, a truncated `desired` would have made the save unassign every row past the first page (the legacy loss, not a regression against `main`; today's ~1,400 placements do not reach it). Both hydration reads on both screens are now paged through the same helper with a stable order, so `current` and `desired` are both complete; mounted 2,500-row case in `campaign-save-flows.structure-writes.test.tsx`. |
| Read-failure asymmetry in `structure-save.ts` (review round 2, A4 — carry to Stage 6) | `saveUnitDrafts` swallows the scope read's error as the legacy sequence did (`existing = []`: nothing deleted, `display_order` restarts at 0, no D42 reuse), while `savePlacements` throws on the same condition. Recommendation for Stage 6: make both throw (a failed read must not plan a save). **Stage 6: done** — `saveUnitDrafts` throws the read's error before planning; no RPC is issued (D70). |
| Membership rewritten before a refused placement save (review round 2, A5 — Stage 6 / WP2.4) | Wizard step 6 and the settings allocation save delete and re-insert `campaign_worker_membership` before `savePlacements`; a refused placement save (42501 or otherwise) leaves the membership rewritten and the placements as they were — the legacy order, now visible through the D53 line / toast rather than silent. Whether membership should follow the placements, or both go into one transaction, is a Stage 6 / WP2.4 question. **Stage 6: left to WP2.4 unchanged** (D72). |
| Bulk toolbar hides skipped placements (D46 follow-up, Stage 6 one-liner) | `components/campaigns/workforce/workforce-bulk-toolbar.tsx` ~:262 toasts `Allocated ${res.inserted} workers …` and ignores the hook's `skipped`; outside rows 9–13 — Stage 6 (or WP2.4) adds "N skipped: already in a unit of that group" (also recorded in §11.12). **Stage 6: done** — the toast appends `N skipped: already in a unit of that group.` when `skipped > 0` (D73; `allocate-toast-message.ts` + test). |
| Same-group copy now errors (K1) | approved behaviour change; message + e2e 2. |
| Employer materialisation changes full-mode observables | M2-a keeps it operator-timed; e2e asserts render + one worksite card per member. |
| Contract suite accidentally targets production | hard throw on production host; env names distinct from app env; no `.env` file read. |
| Legacy `check_worker_ou_group_exclusivity` (one container per `ou_type`) refuses cross-container same-type moves and merges (`P0001`) | Unchanged behaviour (D17); surfaced as `rule_violation` with the trigger's message; contract tests pin it so Stage 4 knows before the UI does; retirement of the trigger is a later package (§1.5). |
| Regen strips symbols again on promotion | G1 step 5; wrapper never uses generated `Functions`. |
| **Stage 7 advisories carried to WP2.4** (review round 1, A3 / A4 / A5 / A8; no code change in this PR) | **A3** — `create-organising-unit-dialog.tsx` drops `units.create`'s `moved` / `displaced` counts, so a picked worker who already held another unit of the new unit's group is moved silently (the RPC applies `p_assignments` with `move` semantics, §3.3); every sibling flow reports its skips (D43, D73, A6) — WP2.4 adds "N moved from another unit of the same group" to the dialog's summary. **A4** — record next to D22(e): under 2.2b, `structure__delete_unit` with `p_delete_children = false` detaches a custom-kind container's members, `cou_after_group_change` re-derives their placements' `group_id`, and the `cwo_set_group_id` pre-check can raise `23505 campaign_worker_ou_one_unit_per_group`, which `structureErrorMessage` renders as the K1 "Already in this group — use Move." in a delete context; reachable only through `structure_units_bulk_save` deleting a container without its members (the editor removes both, D52) or `structure_group_delete cascade_units` — WP2.4 gives the settings units-save toast `duplicateInGroupMessage(err, "A member's worker would be in two units of one group")`. **A5** — one intent, three conflict policies: `error` in the units-section assign dialog (D49) vs `skip` in the toolbar (D46), the grid (D43) and rows 16–18 / 21 (D66); each documented — WP2.4's UI consistency pass decides one. **A8** — row 5 (`worker-detail-sheet.tsx` `setPrimary` / `removeFromUnit`) has no `onError`; a `forbidden` is a stored mutation error nobody displays (legacy: RLS-silent 2xx; the tab is gated on `canWrite`, so unreachable for a refused user in practice) — same shape as D36; WP2.4 adds the toast. |
| **Operator note for G1 (Stage 7 review A7)** — `supabase/.temp/project-ref` is tracked and names production | On this checkout `supabase/.temp/project-ref` reads `gteygwfgjvczanmrwgbr` (production), so §5's "must print `dpnnmkhabysfdogllsyh` or `yqjkuobcawvigsfpgrcm`" precondition fails on a fresh clone, and a `supabase db push` without relinking would push **both** pending files (2.2a and 2.2b) to production at once, breaking G1 step 3's order (2.2b only after the code deploy and `04_postflight`). The G1 run sheet submits one file at a time through the SQL Editor; `scripts/data-hygiene/oux-wp2.2/README.md` (production section) now says "never run `supabase db push` from this checkout". Untracking `supabase/.temp/` is a follow-up outside this PR. |
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

Stage 4 (2026-09-14, wall-chart writer switch; §11.8):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D28** | One new file under the wall chart, `components/campaigns/wall-chart/structure-error-message.ts` (`structureErrorMessage(err, fallback)`, `ALREADY_IN_GROUP_MESSAGE`), is the single place a `StructureApiError.kind` becomes the sentence an organiser sees: `duplicate_in_group` → "Already in this group — use Move." (K1, C-c), `rule_violation` → "Not allowed by the unit structure rules: <database sentence>" (D17 and the other P0001s), `forbidden` → "You don't have permission to change this campaign's units.", `schema_missing` → an "API not installed" sentence, every other kind → the RPC's own message. A plain `Error` keeps its own message unchanged (the WP2.3 "surfaces the mutation's own message" assertion holds byte-for-byte). Used by the copy dialog, the drop handler's toast, the merge / delete / rating alerts and the split dialog's alert line. | The Stage 4 brief listed ten files to touch; the K1 and D17 wording is needed in six of them and a copy in each would drift. The file is wall-chart-local and contains no write. | §3.11 (`copy-worker-to-unit-dialog.tsx` note); §7 "New". |
| **D29** | `useMoveWorkersMutation` in **move** mode issues one `structure_placements_move` per distinct source unit of the refs (Unassigned counts as one source, `p_from_ou_id: null`), in ref order, all with the same target; a ref whose source *is* the target is never sent and is counted as `skipped`. **Copy** is always one call with `p_from_ou_id: null` and `p_keep_source: true` (the legacy contract already ignored `fromOuId` for copies). **Unassign** (`toOuId: null`) is one call. Result mapping: `inserted = moved + inserted + parent_inserted`, `deleted = removed + displaced`, `skipped = skipped + refs not sent`. | §3.11 row 1 says "one call per mutation", but the RPC takes a single `p_from_ou_id`; sending `null` for a multi-source selection would insert a fresh `manual` row and leave a cross-group source row in place (not a move), and `p_from_ou_id = p_to_ou_id` is a `22023`. A bulk selection drawn from several units is therefore several transactions (still one per source, where the legacy code was one statement per row). | §3.11 row 1. |
| **D30** | `create-organising-unit-dialog.tsx` issues `units.create` (one call, the three shapes as payloads, `assignments` on the call, `display_order` on every element exactly as the legacy inserts set it) and then, when the wall-chart placement step applies (`needsPlacement`, i.e. not "add to existing group"), one `units.reorder` over the same id list the legacy per-unit update loop walked (`computeBlockOrder`, real ids from the create result). | §3.11 row 4 folds the display-order loop into the create call, but the loop renumbers *existing* top-level blocks too ("top" / "after" placement), which `structure_units_create` cannot do. Two calls (create, then a single reorder) instead of one call plus N updates; the create's own `display_order` values already land the new block where the legacy insert did, so a failure between the two leaves a consistent board. | §3.11 row 4. |
| **D31** | Recorded, not changed (WP2.3 advisory, WP2.4's fix): the nested-card drop reaches the parent card's handler for **move** as well as copy (no `stopPropagation` on `drop`). Under the RPC the second call is `structure_placements_move` to the **parent container**, not a repeat of the first, so §1.5 / §8.2's "harmless `moved: 0` no-op" holds only for an identical second call. Outcomes: a drag from **Unassigned** onto a sub-unit card ends with the worker on the parent container (the second call displaces the sub-unit row under C-b and inserts on the container, which is a legal target since WP2.1 gave Employer containers a `group_id` — for a custom-kind container, which has none, the second call raises `rule_violation` instead and the first move stands); a drag from the **parent** is filtered client-side (`allAlreadyThere`); a drag from a **sibling** makes the second call raise `P0002` (the source row was already re-pointed) → one error toast after a successful move, and the state is the first move only. The legacy code was also wrong in both cases (worker in both units; `NoRowsAffectedError` toast) but differently. Pinned by `wall-chart.structure-writes.test.tsx` ("a drop on a nested card still reaches the parent: two move RPCs, the second to the container"). | Found while writing the row-1 test. **Superseded by D32** (fix round, same day): the coordinator ruled it a user-visible regression and it is fixed in WP2.2. | §1.5; §8.2 row "WP2.3 nested-card double `move`". |

Stage 4 fix round (2026-09-14; §11.9):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D32** | The nested-card double drop is **fixed** in the wall chart, not merely recorded: `campaign-unit-card.tsx` `handleDrop` returns early (clearing its own drag highlight) when `e.nativeEvent.defaultPrevented` is already set, i.e. when a nested sub-unit card consumed the drop first (its handler calls `preventDefault` before `onWorkerDrop`). The event still bubbles; only one card acts on it, so a drop is exactly one `placements.move`. The WP2.3 characterisation "a drop on a nested card also reaches the parent card's handler" (which pinned two `moveWorkers.mutate` calls) now pins the single call under a new name; every other WP2.3 assertion is byte-for-byte. `PROGRESS.md`'s incidental-findings row for the double move now says it was fixed here. | WP2.3 recorded the double invocation as a latent defect ("the current no-op guard usually masks the second call"). The structure API turned it into a real one (D31): the second, bubbled call named the **parent container** as its target, so a drag from Unassigned onto a nested card displaced the sub-unit row it had just made (C-b) and left the worker on the container. §1.5 / §8.2's "harmless `moved: 0`" assumed an identical second call. The guard on the parent was chosen over `stopPropagation` in the child because the parent's `isDragOver` ring is set by the child's bubbled `dragover` events and no `dragleave` follows a drop, so the parent must still see the event to clear it. | §1.5 (double-invoke bullet no longer "not fixed"); §8.2 row; PROGRESS.md incidental findings. |
| **D33** | *(rewritten in review round 1; the round-0 text collapsed every custom-bucket type into one group, which is wrong — WP2.1's `campaign_group_target_for_unit` gives custom-kind units one group **per type label** and a member of a custom-kind container the container's group.)* `split-unit-dialog.tsx`: the "Keep workers in ‘<parent>’ too" switch is **hidden** (not rendered) when every named child would derive to the **same group as the source**, where "same group" (`childSharesSourceGroup`) means: both fixed kinds (`worksite`, `employer`, `shift`, `crew_rotation`→crew, `job_type`→occupation, `work_area`) and equal kind; or both custom-bucket types with the **same `ou_type`** and the source **not a member of a container** (`ou_group_id` null — the dialog cannot see the container's type, so any membership counts as another group and the switch is offered; inert at worst). In every other case the switch is rendered with its existing label, default (on) and behaviour and `keepInParent` is passed through; when hidden `p_keep_in_source` is `false`. The dialog description follows: the "can stay in the parent … or move into the sub-unit only" sentence only when the switch is shown, otherwise "Workers assigned to a sub-unit move into it: a worker is in one unit of a group at a time" (§3.6 terms). Tests: `custom` source + activist dimension (`network` children) → shown, `p_keep_in_source: true`; `shift` source + Shift child → hidden, `false`; `custom` source + custom child, no container → hidden (satisfies the corrected rule); `custom` source that is a container member + custom child → shown. | Under C-k the flag has no effect for a same-group child, and the dialog's default children take the source's `ou_type`, so the switch promised something the RPC would not do; the round-0 rule would have hidden it for cross-group splits (custom source split on activists; any member of a custom container) and sent `false`, moving workers the legacy RPC kept (review round 1, blocking 1). | §3.11 split row (UI note). |

Stage 4 review round 1 (2026-09-14; §11.10):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D34** | The wall chart keeps the legacy split RPC's refusal in the UI: `wall-chart-unit-hierarchy.tsx` disables "Split into sub-units" on a child card whose parent is **not** a group container (title "Only top-level units or units inside a group can be split."). Top-level units and members of a group container are unchanged. | `split_campaign_organising_unit` raised "cannot split OU … sub-unit of a non-container parent"; `structure_unit_split` allows it, and the child-card menu offered it on every child (review round 1, advisory 5). | §3.11 split row. |
| **D35** | `structure_unit_delete(p_delete_children = true)` removes **every descendant** (children, grandchildren, … via `parent_ou_id` / `ou_group_id` chains), where the legacy dialog deleted the direct children only and let grandchildren's `parent_ou_id` SET NULL. The confirm dialog now counts descendants (`wall-chart-dialogs.tsx` `descendantOuIds`, recursive over `childrenByParent`), so "Delete group + N sub-units" says what will go. Test: deleting Acme Group in the fixture says and sends 3 (11, 12, 13). | Advisory 6; the RPC's behaviour is Stage 1's design (§3.3), the dialog's copy had not caught up. | §3.3 `structure_unit_delete` (note); §3.11 row 3. |
| **D36** | `use-wall-chart-actions.ts` `handleBulkRemoveFromUnit` wraps its `placements.unassign` calls: a refusal is `toast.error(structureErrorMessage(…))`, the board still refetches, and the selection is kept (the Radix action closes the confirm dialog itself). Round-0 left it as an unhandled rejection, following "no new toasts where none existed". | Advisory 8: a `forbidden` must be a visible error. | §3.11 row 8. |
| **D37** | Split dialog wording for `duplicate_in_group`: `splitDuplicateInGroupMessage()` ("A worker is already placed in that group in another unit — <RPC DETAIL after the constraint sentence>") instead of the K1 "use Move" sentence, which is not the remedy for a cross-group child whose group already holds the worker. The drop handler and the copy dialog keep K1. | Advisory 4. | D28 (split exception). |

Stage 4 review round 2 (2026-09-14; §11.11):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D38** | The disabled "Split into sub-units" item on a child card of a non-container parent (D34) now shows its reason as a sub-line inside the item — "Units nested under another unit cannot be split" — instead of a `title` (never shown on a disabled Radix item). Wording uses §3.6 terms only ("unit"; "group" is not used). Tests: the sub-line and `aria-disabled` are present for a child of a non-container parent and absent for a child of a group container. | Review round 2 N2. | D34. |
| **D39** | Amends D33: the split dialog receives the container the source sits in (`WallChartDialogs` looks it up in `ous` by `parent.ou_group_id`; prop `sourceContainer`) and decides exactly as WP2.1's `campaign_group_target_for_unit`: a custom-bucket source under a **custom-kind** container is in that container's group (cross-group for any child → switch shown); under a **fixed-kind** container it derives as if top-level (same `ou_type` child → same group → switch hidden, `p_keep_in_source: false`); the conservative "show the switch" applies only when the source has an `ou_group_id` and the container row is genuinely unavailable (`sourceContainer === undefined`). With mixed children the switch's description adds "Applies only to the sub-units in a different group from ‘<parent>’; workers assigned to a sub-unit in the same group move into it." Tests: fixed-kind container + same-type child → hidden; custom-kind container → shown; row unavailable → shown; shift source with a Shift child and a custom child → shown with the partial sentence, `true`. | Review round 2 N3. | D33. |

Stage 5 (2026-09-14, settings / wizard / units-section / hook writers; §11.12):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D40** | `structure-error-message.ts` (D28) moved unchanged from `components/campaigns/wall-chart/` to `lib/campaign/`; its seven wall-chart importers and the Stage 4 test import re-pointed. | The settings toasts, the units-section alerts/inline line and the remove-from-campaign hook need the same sentences, and `lib/` must not import from the chart. | §7; D28. |
| **D41** | `saveUnitDrafts` issues `structure_units_bulk_save` on every "save units", even with nothing to delete, update or create (`p_delete_ou_ids: []`, `p_updates: []`, `p_creates: []`). | The RPC's permission pre-check is what turns a refused save into a visible error: the legacy sequence issued no statement for an empty diff and toasted "Campaign units saved." on a campaign the account could not write to (e2e item 6 relies on it). The empty call writes nothing. | §3.11 rows 10–11. |
| **D42** | A new draft that re-identifies an existing unit about to be deleted — same `ou_type`, both top-level and non-container, identical `unit_basis` carrying one of `worksite_id` / `employer_id` / `canonical_occupation_id` / `occupation_group_id` — is sent as an **update** of that unit (name, estimate, basis) instead of a delete plus a create; each existing unit matches at most one draft. `{ custom: true }` and split-derived bases never match. | The units editor's "employers / worksites as units" toggles remove and re-add the scope units as fresh drafts; the legacy save deleted and re-created them, losing their placements, `user_rating` and `campaign_unit_rules` (the "silently drop" defect the reviewer flags). The end state the user sees (the unit list) is unchanged; a non-matching draft still goes the legacy way. | §3.11 rows 10–11; §3.1 principle 7 (preserving, not changing). |
| **D43** | "Save worker allocation" (wizard step 6, settings) is the **difference** between the placements on the units the screen knows and the grid: `structure_placements_unassign` per unit for rows that left the grid, then `structure_placements_assign` (`manual`, not primary, `p_on_conflict: "skip"`) per unit for rows that joined it, units in ascending `ou_id`. Rows the grid keeps are not touched. The settings success toast reports skipped rows ("… N placements skipped: already in another unit of the same group."); the wizard, which has no toast, stays silent. | The legacy sequence deleted every row on the campaign's units and re-inserted the grid, so every placement lost its id, `is_primary`, `assignment_source` and `assigned_rule_id` on each save; the diff keeps them for unchanged rows. `skip` is the assign-family semantics of §3.11 (rows 13, 15, 16); the grid's "+ add" picker does not exclude same-type units, so a worker put in two units of one group is saved in the lower-numbered unit and counted as skipped rather than written twice (C-a). Downstream note: a kept `rule` row stays `rule` (Recompute may still replace it) where the legacy re-insert would have made it `manual`. | §3.11 rows 10–11. |
| **D44** | The update patch for an existing unit is `name`, `total_workers_estimated`, `unit_basis` only. | The legacy update also re-sent `ou_type`, `parent_ou_id`, `is_group_container` and `ou_group_id` with their unchanged values (the units editor never edits them on a saved unit: `updateUnit` is only called with `name` / `total_workers_estimated`); the structure API's whitelist excludes them (C-g). No-op today, so nothing is lost. | §3.11 rows 10–11. |
| **D45** | A created child carries `ou_group_id` only when its parent is a group container (an existing one, or a container created in the same call by `client_ref`); a sub-unit under a plain unit gets `parent_ou_id` only. The settings page's creates now carry the hierarchy (`parent_ou_id`, `is_group_container`, `ou_group_id`) exactly as the wizard's do. | The wizard's legacy insert set `ou_group_id = parent` for **every** non-container child, container or not; `structure_units_create` refuses `ou_group_id` on a non-container (22023), and the column's documented meaning (and every other creator: the create dialog, the split RPC) is container membership. The settings page's legacy insert dropped the hierarchy altogether, so a group drafted there was saved as flat plain units (a container with `is_group_container = false`) — a silent loss the shared planner removes. **Orchestrator to confirm both.** | §3.11 rows 10–11. |
| **D46** | `useAllocateWorkersToOu` → `placements.assign({ source: "manual", isPrimary: single worker only, onConflict: "skip" })`; the result is `{ inserted, skipped }`. Its one caller, `workforce-bulk-toolbar.tsx` (untouched), toasts `res.inserted` and `err.message`. | Row 13 as planned. The legacy insert failed the whole batch on a worker already on the unit (23505) and wrote a second same-group unit silently; now the former is skipped (the units section's own assign already did that) and the latter is skipped and counted. | §3.11 row 13. |
| **D47** | Units-section create paths (`createOu`, `acceptCandidate`) no longer read `max(display_order)` first; the element carries no `display_order` and the RPC derives it. | `structure__create_units` defaults `display_order` to `max + 1` over the campaign — the same value the legacy read computed — now inside the transaction. | §3.11 row 9. |
| **D48** | Units-section edit dialog: the Type select is disabled while editing an existing unit, with the line "The type is fixed once a unit exists — it decides which group the unit belongs to."; the update patch never sends `ou_type`. The dialog gains an inline `role="alert"` line for a refused create/update (`structureErrorMessage`, D36 precedent) and both mutations are reset when the dialog closes so a stale error never greets the next opening. | The structure API keeps `ou_type` immutable (C-g; the plan's `structure_unit_update` whitelist), while the legacy dialog let the type of a saved unit be changed. A silently dropped change was not acceptable; a visible, explained refusal is. The legacy dialog showed no error at all (a failed save re-enabled the button). **Orchestrator to decide** whether the type should instead become updatable through the API (SQL + wrapper change, not made here). | §3.11 row 9; §3.3 `structure_unit_update` (note). |
| **D49** | Units-section assign dialog → `placements.assign({ onConflict: "error" })`; a `duplicate_in_group` (and, as before, any message containing "group") shows the dialog's existing sentence "Some of these workers already belong to a different group of the same type in this campaign, so they can't also be assigned here."; other kinds go through `structureErrorMessage`. The feedback count is the RPC's `inserted`. | The dialog pre-filters workers already on the unit and already had a refusal sentence for the legacy Employer-exclusivity trigger — the same shape as C-a. `error` keeps the batch atomic and visible where `skip` would silently leave a worker out. | §3.11 row 9. |
| **D50** | Units-section reallocate dialog → one `placements.move({ fromOuId, toOuId, keepInParent: false })` (from Unallocated: `fromOuId: null`) instead of the plan's `assign` + `unassign` pair. | The dialog restricts targets to units of the source's type (same group for fixed kinds), so `assign(skip)` would skip the target and the following `unassign` would drop the worker; `assign(move)` + `unassign` is two transactions for what `move` does in one, re-pointing the row so `is_primary` and provenance travel with it (C-l; the legacy upsert+delete lost both). `keepInParent: false` because this dialog never created a placement on the target's parent container (D4 is wall-chart behaviour). | §3.11 row 9. |
| **D51** | Creates are ordered top-level drafts first (legacy pass 1), then children in as many passes as needed; a child of a **new** child (a sub-unit under a new group member) is created through its parent's `client_ref`. `display_order` values are identical to the legacy numbering whenever the legacy insert would have resolved every child. | The legacy two-pass insert dropped such a grandchild silently (its parent had no id yet, "safeChildRows"). | §3.11 rows 10–11. |
| **D52** | *(corrected in review round 1)* Recorded: of the RPC's validations, only the **blank / whitespace-only name** is new — the legacy insert/update saved it (`varchar(200) NOT NULL`, no non-empty CHECK); a name over 200 characters and a negative estimate were already refused by the column and its CHECK. Because every existing unit is re-sent on "save units" (D44), one legacy blank-named row would have made every later save fail — silently in the wizard (steps 5 and 6 had no error surface at all) and in settings with the RPC's `p_updates[n]` index. **Fixed by D53.** Also recorded: `structure__delete_unit` detaches a surviving member of a deleted container where the legacy `DELETE … IN (…)` failed with 23503 — unreachable from the editor (removing a container removes its members) but different for a stale draft list. | Found while mapping the flows; the fix is D53. | §8.2. |


Stage 5 review round 1 (2026-09-14; §11.13):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D53** | **Blocking 1.** (a) `structure-save.ts` `validateUnitsSavePlan(plan, drafts)` runs before the bulk-save RPC and throws `UnitDraftValidationError` with a sentence in §3.6 terms — `Unit 3 (worksite) has no name.` for a blank or whitespace-only name (an update of a legacy blank row, a reused unit or a create alike), `Unit "…" has a name longer than 200 characters.`, `Unit "…" has a negative worker estimate.` — mirroring `structure__create_units` / `structure__update_unit`; no RPC is issued. (b) The wizard renders `saveUnitsMutation.error` under step 5 and `saveWorkersMutation.error` under step 6 as a `<p role="alert" className="text-xs text-destructive">` line (the `step1Error` style) through `structureErrorMessage`. (c) Settings already toasted both saves through `structureErrorMessage`; the validation sentence rides the same toast. Tests: `structure-save.test.ts` (the sentences, the update / reuse / create paths, no RPC), `campaign-save-flows.structure-writes.test.tsx` (wizard steps 5/6 error lines and refusals, settings units-save toast and blank-name toast). | Reviewer blocking finding: a refused or invalid save was silent in the wizard and an index in settings. | §3.11 rows 10–11; D52. |
| **D54** | `duplicateInGroupMessage(err, lead)` in `structure-error-message.ts` is the general form of the split dialog's sentence (`splitDuplicateInGroupMessage` now wraps it, byte-identical output); the units-section assign dialog uses it with the lead "A worker is already in another unit of that group", so the sentence names the worker and the group from the RPC's DETAIL ("… — Worker 112 already has a placement in group 3 of campaign 1; move it instead of adding a second one."). The legacy Employer-exclusivity P0001 (a message mentioning "group") keeps the dialog's original sentence. | Advisory 2: "a different group of the same type" is not the group model's vocabulary. | D49. |
| **D55** | `saveUnitDrafts` reads the campaign's units with `.order("ou_id", { ascending: true })`, and `planUnitsBulkSave` sorts the delete candidates by `ou_id` before the D42 match, so with two legacy units of the same identity the lowest `ou_id` is reused whatever order the rows arrive in. Test: two same-basis rows in both orders. | Advisory 3. | D42. |
| **D56** | Settings "Allocate workers" grid receives only non-container units (`!u.is_group_container`), as the wizard's grid always did; for that flag to exist the settings scope query now selects `parent_ou_id, is_group_container, ou_group_id` and hydrates drafts as the wizard does (`parent_draft_id: srv_<parent>`), so a container is known as one and its members nest under it in the settings units editor instead of reading as plain units. Test: Ada, placed only on the container, shows no chip; "Acme North" remains pickable. | Advisory 6: a custom-kind container drafted in settings could be picked in the grid and refused with the P0001 sentence. The hydration change is what makes the filter real. | §3.11 row 11. |
| **D57** | Harness (`wall-chart/__tests__/harness/backend.ts`): a direct `insert/update/upsert/delete` on `campaign_organising_units` / `campaign_worker_ou` throws `DirectStructureWriteError` unless the test called `allowDirectStructureWrites()`; other tables are recorded (`writeInvocations()`); every chain's builder calls are recorded (`queryInvocations()`, used to pin the placement read's `.in("ou_id", …)` scope); the `structure_placements_assign` default answer is removed (an unexpected assign is an `UnseededBackendError` again; tests seed it with `answerRpc`). Stage 4's eight wall-chart suites re-run green under it (134 tests). | Advisory 4: the Stage 5 harness answered structure-table writes with success, so a regressed wall-chart writer would have passed. | §4.1 (harness note). |


Stage 5 review round 2 (2026-09-14; §11.14):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D58** | `validateUnitsSavePlan` also mirrors `structure__json_int` for `total_workers_estimated`: a fractional value → `Unit "Port Alpha" has a worker estimate that is not a whole number.`, a value above 2,147,483,647 → `Unit "…" has a worker estimate above 2,147,483,647.` The editor's number inputs (`step-campaign-units.tsx` ~:1272–1275, ~:889–893) are left as they are. Tests: planner (updates and creates, the boundary value passes) and the mounted wizard (no RPC, the sentence under step 5). | Review round 2 A2: "2.5" is typeable and the RPC refused it in index form. | D53. |
| **D59** | The wizard resets `saveUnitsMutation` in step 5's `onBack` and `saveWorkersMutation` in step 6's `onBack`, so a refusal said under a step does not greet a return to it; a later successful save clears the line by itself (a new `mutate` resets the error). Test: refusal → Back → forward through step 4's own save shows no line; refusal → success clears it; the same for step 6. | Review round 2 A3: the line was gated on the step but the mutation was never reset on navigation. | D53. |

Stage 6 (2026-09-14, lib and API-route writers, rows 14–21; §11.15):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D60** | Row 15, the §3.7 container inclusion (D13 follow-up). The exclusion line in `matchingOusForWorker` (`if (ou.isGroupContainer \|\| !ou.autoMatch \|\| ou.futureGroupKey == null) continue;`) is **unchanged**; after the specificity filter the function now appends, once each, the `ouGroupId` parent of every matched unit when that parent is in the list, `isGroupContainer` and has `futureGroupKey != null`. *Fix round 1 (A1):* before that, only the **first** equally specific candidate per partition (campaign + future group) is kept — the "keep one" the RPC would apply anyway under `p_on_conflict: "skip"` (C-a), decided per worker and in input order here — so a worker never carries two same-group children into `assignOuPlacements`, and the appended container is always the one of the child the worker lands on (test: children X under A and Y under B, both matching → `[X, A]`, and `[Y, B]` when the input order is reversed). Two Stage-4-era expectations that asserted both same-group duplicates (`[20, 21]`, `[22, 23, 25]`) now assert one (`[20]` / `[21]` by order, `[22, 23]`); the reason is stated in the test names. The stale-data case (a pre-existing placement in the group makes the RPC skip the child while the container is still assigned) is not resolved at sync time, as the plan does not ask it to be. `OuPlacementTarget` gains an optional `ouGroupId` (set by `loadOuTargets` from the `ou_group_id` it already selected). The container's own basis / `auto_match` is not consulted (as in M2, the child's match places the worker); the container is appended after the matched units. `loadOuTargets`' query is unchanged — no `group_id` column is read: for the legacy columns this module mirrors, "container with a group" is exactly `futureGroupKey != null` (a custom-kind container's key is null). Tests: three cases in `sync-campaign-universe.test.ts` (parent appended once after the matched units; no parent when the child did not match or the container has no key; an `ouGroupId` naming no unit ignored). | §3.7 asks for containers with `group_id` to be targets so members get the Employer placement at sync time; C-e makes them legal; `p_on_conflict: "skip"` makes the extra row idempotent and skips a worker already placed elsewhere in the Employer group. | §3.7; §3.11 row 15; D13. |
| **D61** | `loadOuTargets` is paged through the existing `fetchAllRows` helper (`lib/supabase/fetch-all-rows.ts`, already used for the worker reads in the same file) rather than a hand-written loop: `.order("ou_id", { ascending: true }).range(from, to)` per page, `PAGE_SIZE` exported as `POSTGREST_PAGE_SIZE` (= 1000; the test asserts the value). The helper stops at a short page and has a 100-page hard cap (100,000 units per campaign batch). `loadOuTargets` is exported for the test. | One loop, one constant; the plan's shape is preserved exactly (the test pins the three `range` calls `[0,999] [1000,1999] [2000,2999]` for 2,500 rows and the trailing empty request after a page-sized result). | §3.10. |
| **D62** | Row 15 counts: `ouAssignmentsUpserted` is now the RPC's `inserted` (the legacy count was the number of rows *sent*, ignored duplicates included); both result types gain `ouAssignmentsSkipped` (the RPC's `skipped`), which the sync-on-open route already returns through `{ success: true, ...result }`. `membershipsUpserted` / `workersAdded` are unchanged (membership is not a structure table). Callers (`campaign-settings.tsx`, `campaign-universe-section.tsx`) ignore the counts. Worker ids are batched per unit in the legacy `OU_CHUNK` (200) and units are visited in first-seen order. | The brief: use the RPC's `inserted` / `skipped`. | §3.11 rows 15, 15a. |
| **D63** | Row 14: (a) each desired row carries `assigned_rule_id` — the first include rule the worker matched, or, for a unit with exclude rules only (the include match is vacuous), the unit's first rule — so no Recompute row is written with the NULL attribution the pre-WP2.2 sync used and the R1-b relabel script keys on (`assignment_source = 'rule' AND assigned_rule_id IS NULL`); the legacy insert never set it. (b) A campaign with **no members** still returns without any call (the legacy early return) — its stale rule rows, if any, are left alone; a campaign with members and no rules calls `replaceRuleRows({ rows: [] })`. (c) Rules targeting a group container are still dropped before planning (the RPC refuses a container row with 22023, so the filter is what keeps a stray rule from failing the whole recompute). (d) The result gains `skipped`; the units section still reads `inserted` for its message. *Fix round 1:* (A2) the rules read is `.order("rule_id", { ascending: true })` and sorted again client-side, so when two units of one group both match a worker the lower `rule_id`'s unit is first in `p_rows` and is the one the RPC keeps (the second is `skipped`) — deterministic between clicks (test: rules arriving out of order → `[unit 10 / rule 2, unit 20 / rule 9]`); (A7) for an exclude-only unit the attribution names an **exclude** rule — kept deliberately: nothing in `src/` reads `assigned_rule_id`, and the point is that fresh Recompute rows stay out of R1-b's `assigned_rule_id IS NULL` relabel, which is therefore to be run once, before or with the deploy; (A10) with rules present the legacy cleared rule rows on **non-container** units only (HEAD `:338–345`) while the RPC deletes every `assignment_source = 'rule'` row of the campaign, containers included — no writer ever put a rule row on a container, so no observable change, but the scope statement differs; (A6) the units-section message now says `N worker(s) already placed in another unit of the same group.` when `skipped > 0` (appended to the assigned sentence, or alone when `inserted === 0`). Open question 2 decided: the no-members early return stays (A8). | (a) R1-b correctness going forward; (b)–(c) legacy behaviour kept, recorded; (d) the RPC reports it. | §3.11 row 14; §3.8 R1-b. |
| **D64** | `src/lib/campaign/__tests__/recompute-ou-assignments.test.ts` is **new** (6 tests): exact `p_rows` (with attribution), the no-rules `rows: []` call, the container-rule filter, the exclude-only attribution, the no-members no-call, a refused call. The brief assumed an existing test file for the recompute; none existed (`rg` over the repo: the function was untested). | Fact; §4.1 asks for these tests. | §4.1; §7. |
| **D65** | Row 16: the employer containers and their worksite members are **one** `structure_units_create` per import — a new container is element `client_ref: "container:<employerKey>"` and its members carry `parent_ou_id` / `ou_group_id` = that ref; a member of an existing container carries the container's id. The existing-units dedup read (`.in("parent_ou_id", …)`) now spans only existing containers (a new one has no members yet). Consequences: (a) the two legacy error strings `OU groups: …` / `OU units: …` become one `OU structure: <structureErrorMessage>` — a refused call creates nothing (atomic) where the legacy chunks could half-succeed; (b) `groupsCreated` / `unitsCreated` count the elements whose `client_ref` came back; (c) the legacy 200-row insert chunks are gone (one jsonb array; a campaign import has tens of containers and hundreds of units). Placements: one `placements.assign({ source: "manual", isPrimary: true, onConflict: "skip" })` per unit in `CHUNK`s of 200, with the legacy row-by-row retry on a refused batch (`OU assignment (worker n): …`); `assignmentsCreated` is the RPC's `inserted` (the legacy count was rows sent), skipped rows are not counted anywhere (the `stats` shape is unchanged). `isPrimary: true` is applied by `structure__set_primary`, i.e. campaign-wide (the legacy upsert set the row's flag only). *Fix round 1:* (A3) a blank or whitespace-only canonical name falls back to the employer key / `"Unit"` and every name is cut to 200 characters before the call (the RPC's 22023 would otherwise refuse the whole structure and the import would "succeed" with no units); a 22023 that names `p_units[n]` is reported as `OU structure ("<that element's name>"): …`; (A10) `display_order` — the legacy import left the column default (`0`) on every created unit, the RPC assigns `max + 1 + idx`; wall-chart order is unchanged in practice (ties were broken by `ou_id`, the same sequence) but the stored values differ. Open question 3 decided: no chunking (A9 — one plpgsql loop, milliseconds for thousands of elements; the 200-chunk split only ever bought partial success, traded for atomicity). | The brief's "one call can create a container and its members"; the read between the two legacy inserts only ever mattered for existing containers. | §3.11 row 16. |
| **D66** | Rows 17, 18, 21 → `placements.assign({ source: "manual", isPrimary: false, onConflict: "skip" })`: the legacy upserts were `onConflict: "ou_id,worker_id", ignoreDuplicates: true`, i.e. a duplicate on the unit was ignored, so `skip` is the legacy semantics; a worker already in a unit of the target's group is now skipped too (C-a) where the legacy wrote a same-group duplicate. Row 17: `ou_assignments_count` is the RPC's `inserted` (was the number of rows sent) and the response gains `ou_assignments_skipped`; `created_ou.name` echoes the request's (already trimmed) name. Row 21: the per-row error string goes through `structureErrorMessage` (a `forbidden` reads as the D28 sentence rather than the SQL message). | Legacy semantics; the brief asks to choose and record. | §3.11 rows 17, 18, 21. |
| **D67** | Row 19: the legacy delete was **per campaign** (it read the campaign's unit ids first and deleted the worker's rows on those units), so it is one `placements.unassign({ campaignId, workerIds: [workerId] })` — no loop over the worker's other campaigns, and the units pre-read is gone (the RPC scopes by campaign itself; `removed` may be 0). Corrected reading of §2.3 row 19: the delete lives in `removeFromCampaign`, the **"remove"** action's helper (placements → membership → call-list items, order kept); the **"merge"** action never deleted placements in this route — `merge_workers` is called directly and handles them — so "before `merge_workers`" describes two different actions, not a sequence. The route's `catch` maps a `StructureApiError` through `errorResponse(structureErrorMessage(err), { code, details, hint }, structureErrorStatus(err))`; other errors are unchanged. | Fact-finding on the legacy scope; the brief asked to check. | §2.3 row 19; §3.11 row 19. |
| **D68** | Row 20: `units.create({ units: [{ name, ou_type, is_group_container: false, source: "manual" }] })`; the response's `ou` is built as `{ ou_id: <RPC>, name, ou_type }` from the request (the legacy `.select("ou_id, name, ou_type").single()` echo) — same keys. | The RPC returns ids, not rows. | §3.11 row 20. |
| **D69** | `structureErrorStatus(err)` added to `lib/campaign/structure-error-message.ts`: 403 `forbidden`; 400 `invalid_argument` / `rule_violation` / `duplicate_in_group` / `duplicate_group`; 404 `not_found`; 500 otherwise and for anything that is not a `StructureApiError`. Rows 17, 18, 20 answer `{ success: false, error: "<legacy prefix>: <structureErrorMessage>" }` with that status (the legacy answered 500 with the raw message); row 19 through `errorResponse` (D67); rows 16 and 21 keep their per-item error strings. | The brief's status table; one mapping, not six. | §3.11 rows 16–21. |
| **D70** | A4 done: `saveUnitDrafts` throws the scope read's error before planning; no RPC is issued. *Fix round 1 (A4):* thrown as `new Error(error.message)` — the settings toast's `structureErrorMessage` shows `err.message` only for an `Error` instance, so the raw PostgREST object would have shown the generic fallback; `savePlacements` already threw an `Error` through the paging helper (D71). Test asserts `instanceof Error`. The test "treats a failed read … as nothing to delete" is replaced by "throws … and issues no RPC". The units read is **not** paged: a campaign's units number in the hundreds (the wizard renders them all), far below max-rows, and paging it would change the `[select, eq, order]` shape three mounted tests pin. | §8.2 row; a failed read must not plan a save. | §8.2 "Read-failure asymmetry". |
| **D71** | `savePlacements` read paged (§8.2 "Unpaged placement read"): `fetchAllRows` with `.select("ou_id, worker_id").in("ou_id", ouIds).order("ou_id", { ascending: true }).order("worker_id", { ascending: true }).range(from, to)` at `POSTGREST_PAGE_SIZE`; a read error is now thrown as `Error(message)` by the helper (was the raw object; the test's `message` match holds). `ReadChain` gains `range`. The mounted wizard test's ops assertion and the three `structure-save.test.ts` traces gain `order.order.range`; new 2,500-row test (3 reads; the row past the first page is unassigned, not re-assigned). | Same loop as D61; a truncated row would otherwise survive an unassign and be re-assigned-then-skipped. | §8.2. |
| **D72** | A5 (membership rewritten before a refused placement save) is **left to WP2.4 unchanged**. | Reordering the two writes only moves the asymmetry (a refused membership write after a successful placement save would leave placements for non-members, which `structure__worker_ids` then rejects on the next save), and one transaction needs a membership-aware RPC outside §3.3 — a design choice for WP2.4, not a Stage 6 row. | §8.2 "Membership rewritten…". |
| **D73** | Bulk toolbar toast: `allocateToastMessage(res, requested, targetName)` in **new** `components/campaigns/workforce/allocate-toast-message.ts` (pure) keeps the legacy sentence and appends ` N skipped: already in a unit of that group.` when `skipped > 0`; the toolbar calls it. Test: 3 cases (unchanged wording, appended count, missing result). The toolbar itself has no mounted test; the list view that renders it has none either. | §8.2 one-liner; the D46 follow-up. | §8.2 "Bulk toolbar hides skipped". |
| **D74** | `SplitOuSubUnitInput`, `SplitOuAssignmentInput`, `SplitOuRpcArgs`, `SplitOuRpcResultRow` deleted from `src/types/organising-row-types.ts` (`rg` over the repo: no importer since Stage 4 dropped the split dialog's use; only `packages/db-types/generated.ts` still names the legacy function, and it is regenerated). | The doc comment referred to the legacy split RPC nothing calls; deletion preferred by the brief. | §11.8 note. |
| **D75** | Test fake `fake-structure-client.ts`: `range(from, to)` records and **slices** the table's rows (the paging tests), `single()` / `not()` / `ilike()` / `neq()` recorded, defaults for `structure_units_create` and `structure_placements_replace_rule_rows`; a private field renamed (`single` → `singleRow`) to make room for the builder method. Existing Stage 5 tests unchanged by it. | Needed by the Stage 6 tests; the harness stays plain data. | §4.1 (harness note). |
| **D76** | eslint on the changed files reports 4 findings on lines Stage 6 did not touch: `campaign-import/apply/route.ts:415` (`_e164` / `_consent` unused, HEAD `:413`) and `create-worker/route.ts:47–49` (an unused `eslint-disable` directive and the `any` it was meant for, HEAD `:45–47`) — both pre-existing, shifted by the two new import lines; the lint total is unchanged at 294. Not fixed (outside the switch; touched lines are clean). | Touched-lines-clean rule; recorded rather than silently left. | §5. |

Stage 7 fix round 1 (2026-09-14, whole-PR review advisories A1, A2, A6, A7; §11.17):

| # | Deviation | Reason | Plan section changed |
|---|---|---|---|
| **D77** | The four hydration reads that build the allocation grid's `desired` set — `campaign_worker_membership` (`select("worker_id").eq("campaign_id", …)`) and `campaign_worker_ou` (`select("ou_id, worker_id, campaign_organising_units!inner(campaign_id)").eq("campaign_organising_units.campaign_id", …)`) in `campaign-settings.tsx` and `campaign-wizard.tsx` — go through `fetchAllRows` with a stable order (`.order("worker_id")`; `.order("ou_id").order("worker_id")`) and `.range(from, to)` pages of `POSTGREST_PAGE_SIZE`. Consequence: a failed read of either now **throws** the scope query (the legacy `cwoRows = cwo.error ? [] : …` swallowed a failed placement read into an empty `desired`, which after D43 would have meant "unassign everything" on the next save; the membership read already threw). The wall-chart test harness's `range()` now slices rows inclusively (as PostgREST, and as its `limit()` already did) so a paged read over a large fixture terminates. Test: mounted settings page with 2,500 placement rows → three `campaign_worker_ou` reads with `eq / order ou_id / order worker_id / range [0,999] [1000,1999] [2000,2999]`, one membership read with `eq / order worker_id / range [0,999]`, no RPC. | Stage 7 review A1: D71 paged the write side's `current` read while `desired` stayed unranged, which inverted §8.2's rationale (a truncated `desired` against a complete `current` = unassign the rest). | §8.2 "Unpaged placement read"; D71. |
| **D78** | `tests/e2e/structure-api.spec.ts`: (A2) the header states that the client-side `syncWorkersToMatchingCampaigns` `useMoveWorkersMutation` runs after a successful drop is **not** intercepted (only the sync-on-open route is), so a worker whose global employer / worksite matches a unit of campaign 1 can gain `universe` rows mid-test; test 2's whole-set assertion and test 1's `inGroup` filter exclude `assignment_source === "universe"`. (A6) `restoreWorker` first deletes, via REST, any row of the worker in the original placement's group (`campaign_worker_ou?worker_id=eq.&group_id=eq.` — `group_id` is the trigger-derived column, groups are campaign-scoped; applied before both the `assign` branch and the rule-row REST insert, so the restore lands on the original unit rather than being `skipped` against a sync-created row), and a 409 on the rule-row insert is logged and noted (`NOT restored …`) instead of thrown, so `afterAll` never fails after the unit sweep. Not run (no Playwright in this session); `tsc` covers `tests/e2e/**`. | Stage 7 review A2 / A6. | §4.5. |
| **D79** | `packages/db-types/generated.ts` regenerated from **normal dev** (`dpnnmkhabysfdogllsyh`, after 2.2a, before 2.2b) through the Supabase connector's type generator rather than `pnpm gen:types` (the CLI is never run from this checkout; its tracked project ref names production). Diff: the 17 `structure_*` RPC entries under `Functions` (argument names only; the wrapper stays hand-written, §3.9), the dev-only `_oux_env_marker` table (the clone/dev environment marker; production has none), two relationship columns re-ordered, and the `graphql_public` schema block **omitted** (the connector generates `public` only; nothing in the code references it — `rg` over the repo finds only a comment in the 2.2a migration). `tsc` clean. The post-merge regeneration from production (`.github/workflows/gen-types.yml`, §2.7) will restore `graphql_public`, drop `_oux_env_marker` and keep the RPC entries once production has 2.2a (G1). | §9.1 item 6 approved by the operator 2026-09-14; CLI forbidden. | §2.7, §5. |

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
| **T2** | Unit type change in the units-section edit dialog: the legacy dialog let a saved unit's `ou_type` change (the WP2.1 trigger cascade moved the unit and its placements to another group); interim = the Type select is disabled with a visible reason (D48). Widening `structure_unit_update`'s whitelist needs SQL plus C-a displacement after the cascade → operator decision, candidate for Stage 6 or WP2.7 | **pending operator** |

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

#### Stage 5 verifier run (2026-09-14, Sonnet, no database)

**1. `pnpm --filter organising-db exec tsc --noEmit`** (from `/home/user/OffshoreAlliance`)

```
(no output)
```

Exit code: 0

Note: `tsc --noEmit` produced no output and exit code 0, so the `.next/types` deletion/rerun contingency in the verifier instructions did not apply.

**2. `pnpm --filter organising-db test`** (from `/home/user/OffshoreAlliance`)

```
> organising-db@0.1.0 test /home/user/OffshoreAlliance/apps/organising-db
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

[... 94 passing test files trimmed — see the summary line below; the guard failure below is the full, untrimmed output ...]

 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 214ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 129ms
     → 8 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  lib/campaign/recompute-ou-assignments.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(8) ] to deeply equal []

stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 10081ms over 3 runs (runs: 11883, 10081, 7442; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 30988ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 30987ms
     → expected 10081.229044 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 8 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  lib/campaign/recompute-ou-assignments.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(8) ] to deeply equal []

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
+   "lib/campaign/recompute-ou-assignments.ts",
+   "lib/workers/sync-campaign-universe.ts",
+ ]

 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:90:7
     88|       found,
     89|       `${found.length} file(s) still write directly to campaign_organi…
     90|     ).toEqual([]);
       |       ^
     91|   });
     92|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 10081.229044 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16
     95|     expect(tiles).toBe(EXPECTED_TILES);
     96|     expect(cards).toBe(162);
     97|     expect(ms).toBeLessThan(BUDGET_MS);
       |                ^
     98|   }, 120_000);
     99| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  2 failed | 94 passed (96)
      Tests  2 failed | 1325 passed (1327)
   Start at  11:37:17
   Duration  86.62s (transform 6.81s, setup 0ms, collect 46.85s, tests 142.80s, environment 13.21s, prepare 9.43s)

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
Exit status 1
```

Exit code: 1

**3. `git diff --name-only HEAD` / `git ls-files --others --exclude-standard` + one eslint invocation over every `.ts`/`.tsx` path listed** (from `/home/user/OffshoreAlliance/apps/organising-db`)

`git diff --name-only HEAD`:

```
apps/organising-db/src/components/campaigns/campaign-settings.tsx
apps/organising-db/src/components/campaigns/campaign-units-section.tsx
apps/organising-db/src/components/campaigns/campaign-wizard.tsx
apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
apps/organising-db/src/lib/campaign/use-allocate-workers-to-ou.ts
apps/organising-db/src/lib/hooks/useRemoveWorkerFromCampaign.ts
apps/organising-db/tests/e2e/structure-api.spec.ts
docs/organiser-ux-review/wp/wp2.2.md
```

`git ls-files --others --exclude-standard`:

```
src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx
src/lib/campaign/__tests__/fake-structure-client.ts
src/lib/campaign/__tests__/structure-save.test.ts
src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx
src/lib/campaign/structure-error-message.ts
src/lib/campaign/structure-save.ts
src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx
```

`apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts` appears in the `git diff --name-only HEAD` list with a `D` (deleted) status in `git status --short`; it no longer exists on disk. `docs/organiser-ux-review/wp/wp2.2.md` is not `.ts`/`.tsx` and was excluded from the eslint invocation. All other paths from both lists (23 total, including the deleted one) were passed to eslint.

eslint invocation (`.ts`/`.tsx` paths from both lists joined, paths resolved relative to `apps/organising-db`):

```
$ pnpm exec eslint \
  src/components/campaigns/campaign-settings.tsx \
  src/components/campaigns/campaign-units-section.tsx \
  src/components/campaigns/campaign-wizard.tsx \
  src/components/campaigns/wall-chart/__tests__/harness/backend.ts \
  src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx \
  src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx \
  src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx \
  src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts \
  src/components/campaigns/wall-chart/merge-units-dialog.tsx \
  src/components/campaigns/wall-chart/split-unit-dialog.tsx \
  src/components/campaigns/wall-chart/structure-error-message.ts \
  src/components/campaigns/wall-chart/unit-rating-control.tsx \
  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts \
  src/lib/campaign/use-allocate-workers-to-ou.ts \
  src/lib/hooks/useRemoveWorkerFromCampaign.ts \
  tests/e2e/structure-api.spec.ts \
  src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx \
  src/lib/campaign/__tests__/fake-structure-client.ts \
  src/lib/campaign/__tests__/structure-save.test.ts \
  src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx \
  src/lib/campaign/structure-error-message.ts \
  src/lib/campaign/structure-save.ts \
  src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx

Oops! Something went wrong! :(

ESLint: 9.39.4

No files matching the pattern "src/components/campaigns/wall-chart/structure-error-message.ts" were found.
Please check for typing mistakes in the pattern.
```

Exit code: 2

**4. `pnpm --filter organising-db lint 2>&1 | tail -6`** (from `/home/user/OffshoreAlliance`)

```
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
```

Exit code (pipeline, first command): 1

Matches the stated baseline (294 problems = 143 errors / 151 warnings).

**5. `rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' -l`**

```
/home/user/OffshoreAlliance/apps/organising-db/src/lib/workers/sync-campaign-universe.ts
/home/user/OffshoreAlliance/apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
```

Exit code: 0

**6. `git -C /home/user/OffshoreAlliance status --short`**

```
 M apps/organising-db/src/components/campaigns/campaign-settings.tsx
 M apps/organising-db/src/components/campaigns/campaign-units-section.tsx
 M apps/organising-db/src/components/campaigns/campaign-wizard.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 D apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/use-allocate-workers-to-ou.ts
 M apps/organising-db/src/lib/hooks/useRemoveWorkerFromCampaign.ts
 M apps/organising-db/tests/e2e/structure-api.spec.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/__tests__/
?? apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx
?? apps/organising-db/src/lib/campaign/structure-error-message.ts
?? apps/organising-db/src/lib/campaign/structure-save.ts
?? apps/organising-db/src/lib/hooks/__tests__/
```

Exit code: 0

**7. `git -C /home/user/OffshoreAlliance diff --stat HEAD`**

```
 .../src/components/campaigns/campaign-settings.tsx | 113 +++------
 .../campaigns/campaign-units-section.tsx           | 264 +++++++++++----------
 .../src/components/campaigns/campaign-wizard.tsx   | 188 ++-------------
 .../wall-chart/__tests__/harness/backend.ts        |  43 +++-
 .../__tests__/wall-chart.structure-writes.test.tsx |   2 +-
 .../wall-chart/copy-worker-to-unit-dialog.tsx      |   2 +-
 .../wall-chart/delete-organising-unit-dialog.tsx   |   2 +-
 .../wall-chart/hooks/use-wall-chart-actions.ts     |   2 +-
 .../campaigns/wall-chart/merge-units-dialog.tsx    |   2 +-
 .../campaigns/wall-chart/split-unit-dialog.tsx     |   2 +-
 .../wall-chart/structure-error-message.ts          |  47 ----
 .../campaigns/wall-chart/unit-rating-control.tsx   |   2 +-
 .../__tests__/no-direct-structure-writes.test.ts   |  15 +-
 .../src/lib/campaign/use-allocate-workers-to-ou.ts |  58 +++--
 .../src/lib/hooks/useRemoveWorkerFromCampaign.ts   |  43 ++--
 apps/organising-db/tests/e2e/structure-api.spec.ts | 253 +++++++++++++++++++-
 docs/organiser-ux-review/wp/wp2.2.md               | 208 +++++++++++++++-
 17 files changed, 746 insertions(+), 500 deletions(-)
```

Exit code: 0

**8. `pnpm --filter organising-db exec vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx`** (from `/home/user/OffshoreAlliance`)

```
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 11036ms over 3 runs (runs: 14369, 11036, 9342; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 36440ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 36439ms
     → expected 11035.903694999997 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 11035.903694999997 to be less than 6000
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
   Start at  11:37:25
   Duration  45.90s (transform 2.95s, setup 0ms, collect 7.03s, tests 36.44s, environment 1.19s, prepare 99ms)

undefined
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx
```

Exit code: 1

#### Stage 4 verifier run (2026-09-14, Sonnet, no database)

**1. `pnpm --filter organising-db exec tsc --noEmit`** (from `/home/user/OffshoreAlliance`)

```
(no output)
```

Exit code: 0

**2. `pnpm --filter organising-db test`** (from `/home/user/OffshoreAlliance`)

```

> organising-db@0.1.0 test /home/user/OffshoreAlliance/apps/organising-db
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.nested-scope-wiring.test.tsx (3 tests) 378ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.nested-scopes.test.tsx (5 tests) 4849ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (34 tests) 8981ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx (21 tests) 11264ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.harness-cleanup.test.tsx (2 tests) 1594ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.characterization.test.tsx (8 tests) 5018ms
 ✓ src/lib/campaign/__tests__/structure-api.test.ts (51 tests) 28ms
 ✓ src/lib/actions/__tests__/hub-rows.test.ts (48 tests) 23ms
 ✓ src/lib/campaign/__tests__/workspace-tabs.test.ts (43 tests) 41ms
 ✓ src/lib/sms/__tests__/survey-engine.test.ts (49 tests) 29ms
 ✓ src/lib/an-surveys/__tests__/an-surveys-libs.test.ts (28 tests) 38ms
 ✓ src/lib/sms/__tests__/relay-engine.test.ts (46 tests) 16ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart-model.test.ts (24 tests) 12ms
 ✓ src/lib/workers/__tests__/sync-campaign-universe.test.ts (37 tests) 12ms
 ✓ src/lib/workspace/__tests__/resolve.test.ts (19 tests) 35ms
 ✓ src/lib/nav/__tests__/nav-reachability.test.ts (14 tests) 15ms
 ✓ src/lib/sms/__tests__/p2p.test.ts (29 tests) 15ms
 ✓ src/lib/sms/__tests__/survey-export.test.ts (20 tests) 12ms
 ✓ src/lib/sms/__tests__/relay-launch.test.ts (25 tests) 19ms
 ✓ src/lib/an-surveys/__tests__/ai.test.ts (7 tests) 31ms
 ✓ src/lib/an-survey-report/__tests__/helpers.test.ts (12 tests) 13ms
 ✓ src/lib/sms/__tests__/conversation-routing.test.ts (14 tests) 10ms
 ✓ src/lib/sms/__tests__/ballot.test.ts (22 tests) 10ms
 ✓ src/lib/sms/__tests__/rating-source-taxonomy.test.ts (10 tests) 8ms
 ✓ src/lib/sms/provider/__tests__/mobile-message-parse-webhook.test.ts (24 tests) 18ms
 ✓ src/lib/sms/__tests__/relay-target-guard.test.ts (14 tests) 7ms
 ✓ src/lib/nav/__tests__/nav-model.test.ts (13 tests) 27ms
 ✓ src/lib/analytics/__tests__/events.test.ts (14 tests) 11ms
 ✓ src/lib/an-surveys/__tests__/html-export.test.ts (6 tests) 21ms
 ✓ src/lib/hints/__tests__/help-manifest.test.ts (6 tests) 19ms
 ✓ src/lib/workspace/__tests__/prefs-schema.test.ts (13 tests) 13ms
 ✓ src/lib/phone/__tests__/call-flow-state.test.ts (11 tests) 10ms
 ✓ src/lib/campaign/__tests__/needs-attention.test.ts (9 tests) 15ms
 ✓ src/lib/__tests__/campaign-tabs.test.ts (18 tests) 13ms
 ✓ src/lib/campaign/__tests__/my-campaigns.test.ts (12 tests) 16ms
 ✓ src/lib/sms/__tests__/chat-rail-state.test.ts (18 tests) 11ms
 ✓ src/lib/sms/__tests__/archive-policy.test.ts (14 tests) 7ms
 ✓ src/lib/sms/__tests__/survey-report.test.ts (13 tests) 24ms
 ✓ src/lib/sms/__tests__/hub-actions.test.ts (15 tests) 10ms
 ✓ src/lib/sms/__tests__/survey-document.test.ts (17 tests) 9ms
 ✓ src/lib/sms/__tests__/audience-import.test.ts (16 tests) 12ms
 ✓ src/lib/phone/__tests__/outcome-model.test.ts (16 tests) 8ms
 ✓ src/lib/sms/__tests__/sms-reply-prompts.test.ts (10 tests) 9ms
 ✓ src/lib/campaign-facts/__tests__/values.test.ts (14 tests) 8ms
 ✓ src/lib/workspace/__tests__/prefs-payload.test.ts (9 tests) 10ms
 ✓ src/lib/sms/__tests__/survey-integrity.test.ts (9 tests) 10ms
 ✓ src/lib/import/__tests__/worker-matching.test.ts (11 tests) 13ms
 ✓ src/lib/sms/__tests__/build-list-readiness.test.ts (16 tests) 10ms
 ✓ src/lib/campaign/__tests__/campaign-detail-routes.test.ts (13 tests) 9ms
 ✓ src/lib/sms/__tests__/assessment-mapping.test.ts (11 tests) 6ms
 ✓ src/lib/sms/__tests__/blackout.test.ts (15 tests) 31ms
 ✓ src/lib/import/__tests__/participation-mapping.test.ts (11 tests) 7ms
 ✓ src/lib/sms/__tests__/sender-inbound.test.ts (15 tests) 7ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 171ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 91ms
     → 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  components/campaigns/campaign-settings.tsx
  components/campaigns/campaign-units-section.tsx
  components/campaigns/campaign-wizard.tsx
  lib/campaign/recompute-ou-assignments.ts
  lib/campaign/use-allocate-workers-to-ou.ts
  lib/hooks/useRemoveWorkerFromCampaign.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(13) ] to deeply equal []
 ✓ src/lib/workspace/__tests__/modules.test.ts (7 tests) 13ms
 ✓ src/lib/analytics/__tests__/session-timing.test.ts (26 tests) 8ms
 ✓ src/lib/campaign/__tests__/resume-links.test.ts (13 tests) 7ms
 ✓ src/lib/sms/__tests__/segments.test.ts (16 tests) 9ms
 ✓ src/lib/sms/__tests__/tapback.test.ts (9 tests) 10ms
 ✓ src/lib/campaign/__tests__/switcher-shortcut.test.ts (12 tests) 6ms
 ✓ src/components/campaigns/wall-chart/__tests__/filters.test.ts (25 tests) 8ms
 ✓ src/lib/sms/__tests__/pathway-targets.test.ts (9 tests) 5ms
 ✓ src/lib/campaign/__tests__/rating-display.test.ts (13 tests) 7ms
 ✓ src/lib/ai/__tests__/models.test.ts (6 tests) 67ms
 ✓ src/lib/workers/__tests__/duplicate-clusters.test.ts (6 tests) 9ms
 ✓ src/lib/sms/__tests__/chat-assessment-target.test.ts (13 tests) 6ms
 ✓ src/lib/api/__tests__/an-actions.test.ts (3 tests) 12ms
 ✓ src/lib/sms/__tests__/emoji.test.ts (10 tests) 14ms
 ✓ src/lib/sms/__tests__/reporting-cohorts.test.ts (7 tests) 6ms
 ✓ src/lib/api/__tests__/csv.test.ts (7 tests) 8ms
 ✓ src/lib/campaign/__tests__/my-campaign-metrics.test.ts (8 tests) 7ms
 ✓ src/lib/phone/__tests__/normalise-phone.test.ts (8 tests) 6ms
 ✓ src/lib/workspace/__tests__/landing.test.ts (10 tests) 7ms
 ✓ src/lib/supabase/__tests__/assert-rows-affected.test.ts (7 tests) 6ms
 ✓ src/lib/nav/__tests__/active-nav.test.ts (8 tests) 7ms
 ✓ src/lib/hints/__tests__/registry.test.ts (6 tests) 5ms
 ✓ src/lib/sms/provider/__tests__/list-senders.test.ts (8 tests) 8ms
 ✓ src/lib/auth/__tests__/work-role-flags.test.ts (12 tests) 6ms
 ✓ src/lib/sms/__tests__/compliance.test.ts (6 tests) 8ms
 ✓ src/lib/comms/__tests__/sanitise-email-html.test.ts (4 tests) 4ms
 ✓ src/lib/campaign/__tests__/assessment-form.test.ts (7 tests) 6ms
 ✓ src/lib/utils/__tests__/employer-match.test.ts (5 tests) 5ms
 ✓ src/lib/campaign/__tests__/workforce-view.test.ts (7 tests) 4ms
 ✓ src/lib/sms/__tests__/survey-validation.test.ts (5 tests) 4ms
 ✓ src/lib/device/__tests__/detect-mobile.test.ts (5 tests) 4ms
 ✓ src/lib/sms/__tests__/fact-mapping.test.ts (4 tests) 4ms
 ✓ src/lib/hints/__tests__/pick-rating-hint-anchor.test.ts (4 tests) 4ms
 ✓ src/lib/hints/__tests__/should-show.test.ts (7 tests) 4ms
 ✓ src/lib/workers/__tests__/worker-search-blob.test.ts (2 tests) 5ms
 ✓ src/components/audience/__tests__/AudienceWashLists.test.ts (3 tests) 3ms
 ✓ src/lib/sms/__tests__/populate-sms-list.test.ts (2 tests) 3ms
stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 9309ms over 3 runs (runs: 10172, 8636, 9309; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 29806ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 29805ms
     → expected 9309.345487999999 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  components/campaigns/campaign-settings.tsx
  components/campaigns/campaign-units-section.tsx
  components/campaigns/campaign-wizard.tsx
  lib/campaign/recompute-ou-assignments.ts
  lib/campaign/use-allocate-workers-to-ou.ts
  lib/hooks/useRemoveWorkerFromCampaign.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(13) ] to deeply equal []

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
+   "lib/campaign/recompute-ou-assignments.ts",
+   "lib/campaign/use-allocate-workers-to-ou.ts",
+   "lib/hooks/useRemoveWorkerFromCampaign.ts",
+   "lib/workers/sync-campaign-universe.ts",
+ ]

 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:93:7
     91|       found,
     92|       `${found.length} file(s) still write directly to campaign_organi…
     93|     ).toEqual([]);
       |       ^
     94|   });
     95|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 9309.345487999999 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16
     95|     expect(tiles).toBe(EXPECTED_TILES);
     96|     expect(cards).toBe(162);
     97|     expect(ms).toBeLessThan(BUDGET_MS);
       |                ^
     98|   }, 120_000);
     99| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  2 failed | 90 passed (92)
      Tests  2 failed | 1266 passed (1268)
   Start at  10:11:10
   Duration  49.97s (transform 4.50s, setup 0ms, collect 26.09s, tests 63.10s, environment 5.43s, prepare 6.81s)

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
Exit status 1
```

Exit code: 1

**3. `git diff --name-only HEAD` / `git ls-files --others --exclude-standard` + eslint on the union** (from `/home/user/OffshoreAlliance/apps/organising-db`)

`git diff --name-only HEAD`:

```
apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx
apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx
apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
docs/organiser-ux-review/PROGRESS.md
docs/organiser-ux-review/wp/wp2.2.md
```

`git ls-files --others --exclude-standard`:

```
src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
src/components/campaigns/wall-chart/structure-error-message.ts
tests/e2e/structure-api.spec.ts
```

eslint invocation (`.ts`/`.tsx` paths from both lists joined, paths resolved relative to `apps/organising-db`):

```
$ pnpm exec eslint \
  src/components/campaigns/wall-chart/__tests__/harness/backend.ts \
  src/components/campaigns/wall-chart/__tests__/harness/mocks.ts \
  src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx \
  src/components/campaigns/wall-chart/campaign-unit-card.tsx \
  src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx \
  src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx \
  src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx \
  src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts \
  src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts \
  src/components/campaigns/wall-chart/merge-units-dialog.tsx \
  src/components/campaigns/wall-chart/move-worker-mutation.ts \
  src/components/campaigns/wall-chart/split-unit-dialog.tsx \
  src/components/campaigns/wall-chart/unit-rating-control.tsx \
  src/components/campaigns/wall-chart/worker-detail-sheet.tsx \
  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts \
  src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx \
  src/components/campaigns/wall-chart/structure-error-message.ts \
  tests/e2e/structure-api.spec.ts

/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:100:5
   98 |   useEffect(() => {
   99 |     if (!open) return;
> 100 |     setReassignMode(workers.length > 1 ? "bulk" : "individual");
      |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  101 |     setBulkTarget("");
  102 |     setPerWorkerTarget({});
  103 |   }, [open, unit.ou_id, workers.length]);  react-hooks/set-state-in-effect

/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
   244:3  warning  'ous' is defined but never used                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  1208:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1218) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps

✖ 3 problems (1 error, 2 warnings)
```

Exit code: 1

**4. `pnpm --filter organising-db lint 2>&1 | tail -6`** (from `/home/user/OffshoreAlliance`)

```
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.

/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
```

Exit code (pipeline, first command): 1

Matches the stated baseline (294 problems = 143 errors / 151 warnings).

**5. `rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns/wall-chart --glob '!**/__tests__/**' -l`**

```
(no output)
```

Exit code: 1 (rg convention: no matches found)

**6. `rg -n "split_campaign_organising_unit" apps/organising-db/src --glob '!**/__tests__/**'`**

```
/home/user/OffshoreAlliance/apps/organising-db/src/types/organising-row-types.ts:659:/** Argument shape for the split_campaign_organising_unit RPC. */
```

Exit code: 0

**7. `git -C /home/user/OffshoreAlliance status --short`**

```
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M docs/organiser-ux-review/PROGRESS.md
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
?? apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
?? apps/organising-db/tests/e2e/structure-api.spec.ts
```

Exit code: 0

**8. `git -C /home/user/OffshoreAlliance diff --stat HEAD`**

```
 .../wall-chart/__tests__/harness/backend.ts        |  82 ++++++
 .../wall-chart/__tests__/harness/mocks.ts          |  13 +-
 .../__tests__/wall-chart.interaction.test.tsx      |  15 +-
 .../campaigns/wall-chart/campaign-unit-card.tsx    |   8 +
 .../wall-chart/copy-worker-to-unit-dialog.tsx      |  13 +-
 .../wall-chart/create-organising-unit-dialog.tsx   | 175 +++++-------
 .../wall-chart/delete-organising-unit-dialog.tsx   | 104 ++-----
 .../wall-chart/hooks/use-wall-chart-actions.ts     |  19 +-
 .../wall-chart/hooks/use-wall-chart-structure.ts   |  14 +-
 .../campaigns/wall-chart/merge-units-dialog.tsx    |  40 +--
 .../campaigns/wall-chart/move-worker-mutation.ts   | 300 +++++---------------
 .../campaigns/wall-chart/split-unit-dialog.tsx     | 105 +++++--
 .../campaigns/wall-chart/unit-rating-control.tsx   |  22 +-
 .../campaigns/wall-chart/worker-detail-sheet.tsx   |  36 +--
 .../__tests__/no-direct-structure-writes.test.ts   |  13 +-
 docs/organiser-ux-review/PROGRESS.md               |   2 +-
 docs/organiser-ux-review/wp/wp2.2.md               | 312 ++++++++++++++++++++-
 17 files changed, 718 insertions(+), 555 deletions(-)
```

Exit code: 0

**9. `pnpm --filter organising-db exec vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx`** (from `/home/user/OffshoreAlliance`; path found via `find`)

```
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 7961ms over 3 runs (runs: 7961, 7281, 9721; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 26534ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 26532ms
     → expected 7960.811395 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 7960.811395 to be less than 6000
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
   Start at  10:16:24
   Duration  31.55s (transform 1.51s, setup 0ms, collect 3.74s, tests 26.53s, environment 671ms, prepare 60ms)

undefined
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx
```

Exit code: 1

Note: `tsc --noEmit` produced no output and exit code 0, so the `.next/types` deletion/rerun contingency in the verifier instructions did not apply.

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

#### Stage 3 — contract suite on normal dev, run 1 (before 2.2b) (2026-09-14, child session)

Run on branch `feat/oux-wp2.2-structure-api` at commit `c582085`, from `apps/organising-db`, with the command below
(this is the re-run after the network-blocked attempt recorded under the same heading above; this time the proxy
allowed the connection and every test body ran); exit code `0`. Raw output follows (ANSI colour codes stripped);
no diagnosis attempted. The one skipped test is the `OUX_CONTRACT_FOREIGN_USER_*`-gated permissions test
`a user without write permission on the campaign gets forbidden from every RPC (SKIPPED when OUX_CONTRACT_FOREIGN_USER_EMAIL/_PASSWORD are unset — report the skipped count)`,
which the suite skips because that optional pair was not set, as instructed.

Command:

```
OUX_CONTRACT_SUPABASE_URL=https://dpnnmkhabysfdogllsyh.supabase.co \
OUX_CONTRACT_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbm5ta2hhYnlzZmRvZ2xsc3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzAzOTUsImV4cCI6MjA5NjA0NjM5NX0.hPLcsxELs3gvVTUu7kGHjjxQsvuE0l0LQgfiPurNb7k \
OUX_CONTRACT_USER_EMAIL=<from E2E_USER_EMAIL> \
OUX_CONTRACT_USER_PASSWORD=<from E2E_USER_PASSWORD> \
OUX_CONTRACT_FOREIGN_CAMPAIGN_ID=3 \
pnpm test:contract 2>&1 | tee /tmp/contract-run-1.log; echo "exit=${PIPESTATUS[0]}"
```

Raw output (`exit=0`):

```

> organising-db@0.1.0 test:contract /home/user/OffshoreAlliance/apps/organising-db
> vitest run -c vitest.contract.config.ts

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/OffshoreAlliance/apps/organising-db

 ✓ src/lib/campaign/__contract__/structure-api.contract.test.ts (58 tests | 1 skipped) 103819ms
   ✓ fixture > derived the expected groups and the legacy container has no group (C-e precondition) 495ms
   ✓ structure_group_create > is idempotent for a fixed kind that already exists 490ms
   ✓ structure_group_create > creates a missing fixed kind once and then returns it 1275ms
   ✓ structure_group_create > creates a custom group and rejects a case-insensitive duplicate name (duplicate_group) 1008ms
   ✓ structure_group_create > rejects an unknown kind and a blank custom name (22023) 732ms
   ✓ structure_group_update > renames and reorders a custom group 1259ms
   ✓ structure_group_update > renaming a container-backed group renames its legacy container 1023ms
   ✓ structure_group_update > rejects a blank name, a missing group and a group of another campaign (C-i) 1309ms
   ✓ structure_group_reorder > sets display_order by position and keeps unlisted groups after the listed ones 755ms
   ✓ structure_group_reorder > rejects duplicates (22023) 485ms
   ✓ structure_group_delete > empty_only refuses a group that still has units (P0001) 706ms
   ✓ structure_group_delete > cascade_units deletes the group's units and their placements, then the group 1731ms
   ✓ structure_group_delete > rejects an unknown mode (22023) 483ms
   ✓ structure_units_create > creates a container plus members in one call via client_ref and applies assignments with move semantics 2322ms
   ✓ structure_units_create > C-g: a fixed-kind unit cannot be pinned to a custom group; a custom unit can 965ms
   ✓ structure_units_create > is atomic: a valid first element and an invalid second leave nothing behind 971ms
   ✓ structure_units_create > C-i: a parent from another campaign is rejected (22023); an unknown parent is not_found 729ms
   ✓ structure_units_create > rejects an unknown ou_type and a non-member assignment (22023) 767ms
   ✓ structure_unit_update > applies a whitelisted patch (estimated_size alias) and returns the keys 1114ms
   ✓ structure_unit_update > rejects keys outside the whitelist (description, leader_worker_id, ou_type) with 22023 1186ms
   ✓ structure_unit_update > not_found for a missing unit and 22023 for another campaign's unit (C-i) 691ms
   ✓ structure_unit_reorder > sets a 0-based display_order for the listed units 1168ms
   ✓ structure_unit_reorder > rejects duplicates and foreign units 706ms
   ✓ structure_unit_delete > moves and removes placements per reassignment, carries the primary (C-h), and removes the rest 2968ms
   ✓ structure_unit_delete > detaches children by default and deletes them with deleteChildren 1985ms
   ✓ structure_unit_delete > is atomic: a bad second reassignment leaves the unit and its placements untouched 1427ms
   ✓ structure_unit_merge > re-points, collapses (primary OR-ed), preserves provenance (C-l), re-points unit rules and deletes the sources 3941ms
   ✓ structure_unit_merge > C-j: refuses a cross-group merge and a survivor that is also a source; nothing changes 2130ms
   ✓ structure_unit_merge > legacy check_worker_ou_group_exclusivity still refuses merging worksites of two different Employer containers (P0001 → rule_violation; wp2.2.md §3.4 C-j note) 3458ms
   ✓ structure_unit_merge > refuses a source that has child units (P0001) 2144ms
   ✓ structure_unit_split > C-k: same-group children take the workers out of the source; keepInSource is ignored and reported as displaced 3298ms
   ✓ structure_unit_split > cross-group children honour keepInSource (kept) or move the source row (moved) 3469ms
   ✓ structure_unit_split > is atomic: assigning one worker to two siblings raises duplicate_in_group and creates no children 1757ms
   ✓ structure_unit_split > rejects a fixed-kind p_group_id (C-g) 528ms
   ✓ structure_units_bulk_save > deletes, updates and creates in one call 1991ms
   ✓ structure_units_bulk_save > is atomic: a unit both deleted and updated is refused and nothing changes 1437ms
   ✓ structure_placements_assign > inserts, skips a same-group conflict by default, moves with onConflict move, errors with onConflict error (C-a) 2401ms
   ✓ structure_placements_assign > C-e: a legacy container without a group rejects placements (P0001); an Employer container with a group accepts them 1223ms
   ✓ structure_placements_assign > C-h: isPrimary makes the placement the single campaign-wide primary 1811ms
   ✓ structure_placements_assign > rejects a non-member (22023), an unknown worker (P0002), a bad source and a bad conflict mode (22023) 2139ms
   ✓ structure_placements_move > C-b/C-l: a move re-points the source row (same id, same provenance) and displaces the target group's other placement 2268ms
   ✓ structure_placements_move > re-issuing a completed move is a no-op (skipped), and a missing source row is not_found 1246ms
   ✓ structure_placements_move > dragging from Unassigned inserts a manual row and displaces the worker's other placement in that group 1299ms
   ✓ structure_placements_move > C-c / K1: copy is allowed across groups and refused within a group (23505, state unchanged) 2340ms
   ✓ structure_placements_move > C-d: unassign within one group removes only that group's placement; without a group removes all 2891ms
   ✓ structure_placements_move > keepInParent creates the Employer-container placement for a worksite child target (M2 going forward) and can be turned off 2738ms
   ✓ structure_placements_move > legacy check_worker_ou_group_exclusivity still refuses a move between worksites of two different Employer containers (P0001 → rule_violation; wp2.2.md §3.4 C-b note) 2146ms
   ✓ structure_placements_move > rejects same source and target, withinGroupId with a target, and a container without a group (C-e) 982ms
   ✓ structure_placements_unassign > removes one placement, a group's placement, or everything; idempotent 2285ms
   ✓ structure_placements_set_primary > C-h: clears the other primary and sets this one; not_found without a placement 2301ms
   ✓ structure_placements_replace_rule_rows > R1: replaces rule rows only; manual and universe rows survive; same-group manual rows win (skipped) 2207ms
   ✓ structure_placements_replace_rule_rows > rejects a container target, a foreign rule id and a malformed element (22023) 994ms
   ✓ structure_materialise_employer_placements > M2: gives every worksite-child member one universe placement on the Employer container; idempotent 2416ms
   ✓ permissions (42501 from the pre-check, never a silent no-op) > the main user gets forbidden on OUX_CONTRACT_FOREIGN_CAMPAIGN_ID (always runs) 2333ms
   ✓ permissions (42501 from the pre-check, never a silent no-op) > a missing campaign is not_found 498ms
   ✓ invariants after the suite > C-a: no (worker, group) pair holds two placements; C-h: no worker holds two primaries 1202ms
   ✓ invariants after the suite > C-f: no RPC created a unit named Unassigned 482ms

 Test Files  1 passed (1)
      Tests  57 passed | 1 skipped (58)
   Start at  22:03:55
   Duration  104.67s (transform 177ms, setup 0ms, collect 304ms, tests 103.82s, environment 0ms, prepare 86ms)

exit=0
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

#### 2.2b applied to normal dev (2026-09-14, orchestrator via the Supabase connector, operator-approved)

Operator approval 2026-09-14 ("1 - approved") for the exact file
`supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql` at commit `5f61208f` (unchanged
since; sha256 prefix `593430d2`). Submitted to `dpnnmkhabysfdogllsyh` through the connector's `execute_sql` as one
multi-statement submission (implicit single transaction; the file's own precondition and postcondition `DO` blocks
ran inside it) with the ledger row `20260914090100 wp2_2_one_unit_per_group_enforcement` appended in the same
submission. Preconditions before the run (read-only, 22:0x UTC): H9 partitions 0, marker `dev`, ledger had 2.2a only,
no unique index, no view, 111 placements. The branch preview carried Stage 6 (`1a1293f2`, Vercel Ready 13:12 UTC)
before the submission, and contract run 1 (pre-2.2b) had passed.

Result row of the submission:

```
placements 111 | view_rows 143 | groups 4 | h9_partitions 0
```

Read-only verification afterwards:

```
unique_index                     true
unique_index_is_unique           true
membership_view                  true
support_index_dropped            true
cwo_set_group_id_has_precheck    true
cwo_set_group_id_md5             e1be39ecea849c6127934eeb84557307
ledger_2_2b                      1
ledger_all_wp2                   20260912035329 wp2_1_campaign_groups; 20260914090000 wp2_2_structure_api; 20260914090100 wp2_2_one_unit_per_group_enforcement
h9_partitions                    0
view_rows_vs_placements          143 / 111
anon_select_on_view              false
authenticated_write_on_view      false
```

Normal dev now carries WP2.1 + 2.2a + marker + `10` + `20` + 2.2b, the same end state as the clone rehearsal.
Next: contract run 2 (post-2.2b), then the e2e on the preview.

### 9.2a Stage 6 verifier run (2026-09-14)

Independent verifier, fresh session. Repo `/home/user/OffshoreAlliance`, branch `feat/oux-wp2.2-structure-api`,
HEAD `c92816cf` plus the uncommitted Stage 6 working-tree changes (unchanged since §11.15). No database, no
`supabase` CLI, no `.env.local`, no `pnpm dev`/`start`, no Playwright, no commits/push/stash/branch
switch/worktree; nothing modified except this subsection.

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test
 ...
stdout | src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
[wp2.3] render-cost median 8000ms over 3 runs (runs: 9943, 8000, 7551; tiles=250, cards=162)

 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 27116ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 27114ms
     → expected 8000.035607000002 to be less than 6000

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8000.035607000002 to be less than 6000
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx:97:16
     95|     expect(tiles).toBe(EXPECTED_TILES);
     96|     expect(cards).toBe(162);
     97|     expect(ms).toBeLessThan(BUDGET_MS);
       |                ^
     98|   }, 120_000);
     99| });

 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1365 passed (1366)
 ELIFECYCLE  Test failed. See above for more details.
[exit=1]

$ pnpm --filter organising-db exec eslint src/app/api/campaign-import/apply/route.ts "src/app/api/campaigns/[id]/add-workers/route.ts" "src/app/api/campaigns/[id]/create-worker/route.ts" "src/app/api/campaigns/[id]/workers/duplicates/route.ts" src/app/api/worker-import/apply/route.ts src/app/api/worker-import/organising-units/route.ts src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx src/components/campaigns/workforce/workforce-bulk-toolbar.tsx src/lib/campaign/__tests__/fake-structure-client.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__tests__/structure-save.test.ts src/lib/campaign/recompute-ou-assignments.ts src/lib/campaign/structure-error-message.ts src/lib/campaign/structure-save.ts src/lib/workers/__tests__/sync-campaign-universe.test.ts src/lib/workers/sync-campaign-universe.ts src/types/organising-row-types.ts src/components/campaigns/workforce/__tests__/allocate-toast-message.test.ts src/components/campaigns/workforce/allocate-toast-message.ts src/lib/campaign/__tests__/recompute-ou-assignments.test.ts
/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaign-import/apply/route.ts
  415:27  warning  '_e164' is assigned a value but never used     @typescript-eslint/no-unused-vars
  415:54  warning  '_consent' is assigned a value but never used  @typescript-eslint/no-unused-vars

/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
  47:1   warning  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-explicit-any')
  49:13  error    Unexpected any. Specify a different type                                                               @typescript-eslint/no-explicit-any

✖ 4 problems (1 error, 3 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
[exit=1]
  [all four on lines Stage 6 did not touch, matching D76]

$ pnpm --filter organising-db lint 2>&1 | tail -3
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.
 ELIFECYCLE  Command failed with exit code 1.
[exit=1]

$ rg -n "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]" src --glob '!**/__tests__/**' --glob '!**/__contract__/**' | rg "\.(insert|update|upsert|delete)\("
[no output — exit=1, no matches — pass]

$ pnpm --filter organising-db exec vitest run src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 136ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
[exit=0]

$ git diff --stat
 .../src/app/api/campaign-import/apply/route.ts     | 163 ++++++++------
 .../app/api/campaigns/[id]/add-workers/route.ts    |  73 +++---
 .../app/api/campaigns/[id]/create-worker/route.ts  |  31 +--
 .../api/campaigns/[id]/workers/duplicates/route.ts |  27 +--
 .../src/app/api/worker-import/apply/route.ts       |  23 +-
 .../api/worker-import/organising-units/route.ts    |  36 +--
 .../campaign-save-flows.structure-writes.test.tsx  |   4 +
 .../campaigns/workforce/workforce-bulk-toolbar.tsx |   3 +-
 .../campaign/__tests__/fake-structure-client.ts    |  35 ++-
 .../__tests__/no-direct-structure-writes.test.ts   |  36 ++-
 .../lib/campaign/__tests__/structure-save.test.ts  |  47 +++-
 .../src/lib/campaign/recompute-ou-assignments.ts   | 119 +++++-----
 .../src/lib/campaign/structure-error-message.ts    |  23 ++
 .../src/lib/campaign/structure-save.ts             |  38 +++-
 .../__tests__/sync-campaign-universe.test.ts       | 213 ++++++++++++++++++
 .../src/lib/workers/sync-campaign-universe.ts      | 191 ++++++++++++----
 .../src/types/organising-row-types.ts              |  26 ---
 docs/organiser-ux-review/wp/wp2.2.md               | 250 +++++++++++++++++++--
 18 files changed, 996 insertions(+), 342 deletions(-)

$ git status --short
 M apps/organising-db/src/app/api/campaign-import/apply/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/add-workers/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/workers/duplicates/route.ts
 M apps/organising-db/src/app/api/worker-import/apply/route.ts
 M apps/organising-db/src/app/api/worker-import/organising-units/route.ts
 M apps/organising-db/src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/workforce/workforce-bulk-toolbar.tsx
 M apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
 M apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
 M apps/organising-db/src/lib/campaign/structure-error-message.ts
 M apps/organising-db/src/lib/campaign/structure-save.ts
 M apps/organising-db/src/lib/workers/__tests__/sync-campaign-universe.test.ts
 M apps/organising-db/src/lib/workers/sync-campaign-universe.ts
 M apps/organising-db/src/types/organising-row-types.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/workforce/__tests__/
?? apps/organising-db/src/components/campaigns/workforce/allocate-toast-message.ts
?? apps/organising-db/src/lib/campaign/__tests__/recompute-ou-assignments.test.ts

No file under supabase/ or supabase/.temp appears in either the diff-stat or the status output — confirmed clean.
```

**Plan-state checks:** §3.11 rows 14–21 are each marked "**done (Stage 6)**" (lines 509–517). §8.3 carries
D60 through D76 in sequence (lines 893–909). §11.15 "Stage 6 — lib and API-route writers (2026-09-14)" exists
(line 3611) with its own raw command output, files-changed table and per-row wrapper-call table.

**Verdict: PASS.** `tsc --noEmit` is clean. The full `pnpm test` run is 98 passed / 1 failed test files
(99 total), 1,365 passed / 1 failed tests (1,366 total) — the single failure is the pre-existing
`wall-chart.render-cost.test.tsx` timing assertion (8000ms against its 6000ms budget), the same
machine-dependent flake recorded at every prior stage (§11.8, §11.12–§11.15) and unrelated to Stage 6's
change set; no other test regressed and no test was skipped, deleted or weakened. `eslint` on the 20
changed/new files reports the same 4 pre-existing findings on lines Stage 6 did not touch (D76); full
`pnpm lint` totals 294 problems (143 errors, 151 warnings), matching the recorded baseline exactly. The §5
acceptance grep for a direct insert/update/upsert/delete on `campaign_organising_units` /
`campaign_worker_ou` outside tests returns no matches, and the guard test
(`no-direct-structure-writes.test.ts`) passes all 3 cases standalone, including the multi-line-safe
case-2 acceptance criterion. `git diff --stat` / `git status --short` show only the 18 files (17 source +
this plan doc) Stage 6 is documented to have touched, plus the 3 new files; nothing under `supabase/` or
`supabase/.temp` changed. §3.11 rows 14–21, §8.3 D60–D76 and §11.15 are all present as required. No
deviation from what Stage 6 (§11.15) itself reported.

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

#### Stage 4 reviews (2026-09-14, wall-chart writer switch; static, no database)

- **Verifier (Sonnet, §9.2 "Stage 4 verifier run"):** `tsc` clean; 1,268 tests / 1,266 passing at that point
  (only the guard acceptance case listing the 13 remaining writers, and the pre-existing render-cost timing
  test); eslint on the 18 changed files shows only three problems that exist at HEAD in the same files
  (`delete-organising-unit-dialog.tsx` set-state-in-effect, two `worker-detail-sheet.tsx` warnings —
  confirmed by linting the committed versions); lint total 294 (baseline); no direct write under
  `wall-chart/`; the legacy split RPC is referenced only by a doc comment in `src/types/organising-row-types.ts`.
- **Orchestrator fix round before review (D32, D33):** the implementer's own finding D31 — under the RPC path
  the nested-card double drop moved the worker onto the parent container — was fixed rather than recorded
  (one `placements.move` per drop; the WP2.3 characterisation now pins the single call); the split dialog's
  keep-in-parent switch was hidden where C-k makes it inert.
- **Review 1 (fresh Fable): CHANGES REQUIRED.** Blocking: (1) D33's same-group premise was wrong — WP2.1 gives
  custom-kind units a group per type label and a member of a custom container sits in the container's
  group, so hiding the switch would have silently moved workers out of the parent on cross-group splits;
  (2) the new e2e spec asserted the hidden switch and located the copy dialog by a title that changes.
  Advisories: split copy text, K1 wording inside the split dialog, nested split of a non-container's child
  newly allowed, descendant vs direct-child delete count, a stale contract comment, an unhandled
  `forbidden` in bulk remove, two untested create-dialog shapes, e2e hygiene. **Resolution:** all ten
  applied (D33 rewritten, D34–D37, §11.10).
- **Review 2 (fresh Fable): CHANGES REQUIRED → APPROVE WITH ADVISORIES after one word.** All ten round-1
  fixes confirmed FIXED with `path:line` evidence; the same-group rule was checked against WP2.1's
  derivation for all eleven `ou_type` values. One blocking e2e locator ambiguity ("Assign" also matched
  "Unassign"), four advisories (invisible `title` on a disabled menu item, container-aware exactness of the
  split rule, in-memory e2e restore state, unverified restore). **Resolution:** N1, N2, N3, N5 applied
  (D38, D39, §11.11); N4 recorded in §8.2 for Stage 5. Orchestrator verified the final round directly
  (no non-exact role locator remains; sub-line present; rule reads as specified; wall-chart interaction
  and structure-writes tests green; guard lists the same 13 files).
- Fix rounds used at Stage 4: two reviewer rounds (the maximum), both closed.

#### Stage 5 reviews (2026-09-14, settings / wizard / units-section / hook writers; static, no database)

- **Verifier (Sonnet, §9.2 "Stage 5 verifier run"):** `tsc` clean; 1,327 tests / 1,325 passing at that point
  (only the guard acceptance case, now listing the 8 remaining writers of rows 14–21, and the pre-existing
  render-cost timing test); lint total 294 (baseline); its eslint step errored only because the relocated
  `structure-error-message.ts` path no longer exists under `wall-chart/` (the implementer's per-file eslint
  showed only the pre-existing `delete-organising-unit-dialog.tsx` finding); the plan's single-line `rg`
  finds 3 of the guard's 8 files (D7).
- **Review 1 (fresh Fable): CHANGES REQUIRED.** Blocking: the wizard's steps 5 and 6 had no error surface
  while the RPC refuses a blank unit name the legacy path saved, and `planUnitsBulkSave` re-sends every
  existing unit, so one legacy blank-named row would have broken every later save of that campaign —
  silently in the wizard and as an index (`p_updates[3]`) in settings. Decision raised: D48 removes the
  full-mode ability to change a unit's type (which moved the unit and its placements to another group via
  the WP2.1 cascade) → recorded as **T2, pending operator** in §9.1 with the interim (type fixed after
  creation, visible reason). Advisories: D49 wording under the group model; D46 skipped rows uncounted in
  the toolbar toast (outside rows 9–13, Stage 6); D42 nondeterministic reuse read; D43 unpaged read (rows
  survive, safer than legacy); harness softened by a success-answering write; missing component-level pins;
  D45 consequences for three readers and the settings grid listing containers; e2e selectors verified.
  **Resolution:** all applied (D53–D57, §11.13): client-side validation naming the unit before any RPC,
  `role="alert"` error lines under wizard steps 5/6, D54 wording from the RPC DETAIL, `.order("ou_id")`,
  harness throws on direct structure-table writes, `!is_group_container` grid filter matching the wizard,
  §8.2 rows, component pins for the wizard and settings save flows.
- **Review 2 (fresh Fable): APPROVE WITH ADVISORIES.** All seven round-1 fixes confirmed with `path:line`
  evidence; completeness of the client validation checked against the RPC rules for every producible
  input. Advisories: A1 Stage 5 ledger row missing (added in this commit); A2 non-integer estimate refused
  in index form; A3 stale wizard error after Back/forward; A4 read-failure asymmetry in
  `structure-save.ts` (pre-existing); A5 membership rewritten before a refused placement save
  (legacy-identical order, now visible). **Resolution:** A2, A3 applied (D58, D59, §11.14); A4, A5 and the
  toolbar note recorded in §8.2 for Stage 6 / WP2.4. Orchestrator verified the final round directly
  (validation sentences present, both `reset()` calls present, Stage 5 suites and guard behave as expected,
  no direct write in rows 9–13).
- Fix rounds used at Stage 5: two reviewer rounds (the maximum), both closed. 1,348 tests / 1,346 passing.

**Stage 6 — lib and API-route writers, rows 14–21 (2026-09-14)**

- **Verifier (Sonnet, static, no database): PASS** (§9.2a). `tsc` clean; 1,366 tests / 1,365 passing (only
  the pre-existing render-cost timing test); eslint on the changed files shows only the four pre-existing
  findings on untouched lines (D76); lint total 294 (baseline); the §5 acceptance `rg` returns nothing and
  the guard test's three cases pass with an empty inventory; nothing under `supabase/` changed; §3.11 rows
  14–21 marked done, D60–D76 present, §11.15 present.
- **Review 1 (fresh Fable): APPROVE WITH ADVISORIES** — no blocking finding. Verified independently: every
  Stage 6 call site sends only the keys the SQL whitelists and reads only the keys the jsonb returns
  (`structure_placements_assign/_unassign/_replace_rule_rows`, `structure_units_create`,
  `structure__create_units`, `structure__place`, `structure__worker_ids`); membership is upserted before
  every assign in rows 15–18 and 21; the six routes' client callers still branch on `success`/`error`;
  the new 403/404 answers do not trip `isLikelyAuthError`; the legacy exclusivity trigger cannot be reached
  from the new sync path. Advisories: A1 order-dependent Employer container when a worker's matched
  children span two containers; A2 unordered rules read makes same-group duplicates and `assigned_rule_id`
  nondeterministic; A3 a blank vessel/employer name now sinks the whole atomic import structure call; A4
  `saveUnitDrafts` threw a raw PostgREST object so the settings toast lost the message; A5 sync `onError`s
  showed raw SQL text; A6 the Recompute message ignored `skipped`; A7–A9 answered the implementer's open
  questions 1–3 (keep the include-rule attribution but document the exclude-rule case; keep the no-members
  early return; no chunking); A10 two implicit semantic changes to record in D63/D65; A11 M2 timing note
  for the operator (row 15a writes Employer placements from the first page open after deploy, ahead of
  `10_materialise…`); A12 agrees with D72. **Resolution (fix round 1, §11.16):** A1–A6 applied (one
  candidate per group in `matchingOusForWorker` and only its parent appended, D60; `.order("rule_id")`,
  D63; name fallbacks and element-named 22023 message, D65; `new Error(message)`, D70; `structureErrorMessage`
  in the three sync `onError`s; `skipped` wording in the Recompute result); A7–A10 recorded in D63/D65; A11
  carried to the G1 run sheet; A12 as recorded. Orchestrator verified the final round directly (`tsc` clean;
  the 19 touched suites 311/311; eslint only the D76 findings; the acceptance `rg` empty; all edits under
  `apps/organising-db/src/` and this file; nothing under `supabase/`).
- Fix rounds used at Stage 6: one reviewer round (of the maximum two). 1,368 tests / 1,367 passing.

**Stage 7 — whole pull request (2026-09-14)**

- **Review 1 (fresh Fable, full diff `f5529a4a...1a1293f2`, static, no database): APPROVE WITH ADVISORIES** —
  no blocking finding. Checked independently: `validate:migrations` 13 OK; `tsc` clean including `tests/e2e`;
  1,367/1,368 tests; eslint total below baseline; the §5 acceptance `rg` empty; no caller of the legacy
  split RPC; nothing under `.github/`, `supabase/config.toml`, `supabase/.temp`, `.env*` or `generated.ts`
  touched. Migrations: all 31 functions `SECURITY INVOKER` with a `pg_catalog`-first `search_path` and
  schema-qualified calls; the pre-check predicate matches the `wp16_*` policies; C-a…C-l implemented as
  §3.4 states with delete-before-write so the bodies hold with and without 2.2b's index; both files
  non-repeatable; `90`/`91` genuinely reverse; the legacy `merge_workers` → `remap_worker_id` path stays
  correct under the unique index. Wrapper: every `p_*` name, default and result key matches the SQL; error
  mapping covers both 23505 forms and `PGRST202`. Writers: all 21 rows plus split/copy through
  `structureApi`; the 48 remaining `.from(...)` sites are reads; the D56/`savePlacements` container hazard
  chased and cleared. Contract suite: one `describe` per RPC, every C-a…C-l rule has an `it`, refuses the
  production host. Advisories: A1 hydration reads unpaged (inverts the §8.2 rationale of D71); A2 e2e test 2
  races the un-intercepted client-side universe sync; A3 create dialog silently `move`-displaces; A4 K1
  sentence reachable in a delete context after 2.2b; A5 three conflict policies for one intent (WP2.4); A6
  e2e rule-row restore can 23505 under 2.2b; A7 tracked `supabase/.temp/project-ref` names production, so
  `db push` from this checkout would push 2.2a and 2.2b together (operator note for G1); A8 row-5
  mutations have no error surface (legacy-identical). **Resolution (fix round 1, §11.17):** A1 (D77), A2 and
  A6 (D78) applied; A7 written into the README's production section and §8.2; A3, A4, A5, A8 carried to
  WP2.4 in §8.2. Orchestrator verified the round directly (`tsc` clean; the campaign, wall-chart and
  lib/campaign suites 397/398 with only the render-cost timing test failing; eslint clean on the changed
  files; the universe filter and the group-scoped pre-delete present in the e2e spec).
- Fix rounds used at Stage 7: one reviewer round (of the maximum two). 1,369 tests / 1,368 passing.
- Still outstanding for Stage 7: the contract suite (Stage 3, both runs), the e2e run on the preview, the
  types regeneration from dev, and 2.2b on dev — all waiting on the operator (§9.1 items 4–6 and the
  environment network setting).

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


### 11.8 Stage 4 — wall-chart writer switch (2026-09-14)

No database, CLI, Playwright, commit or `structure-api.ts` change. Every wall-chart writer of §2.3 rows 1–8 and
the split dialog now writes only through `structureApi(createClient())`; the guard inventory shrank from 21 to
the 13 files of rows 9–21. Deviations D28–D31 (§8.3). Stops: none of §8.4 was hit.

**Files changed** (all under `apps/organising-db/`):

| File | Change |
|---|---|
| `src/components/campaigns/wall-chart/move-worker-mutation.ts` | Rewritten around `placements.move` (D29); `assertRowsAffected` no longer imported; post-move universe helpers and `onSettled` invalidations unchanged. |
| `src/components/campaigns/wall-chart/merge-units-dialog.tsx` | `units.merge`; alert wording through D28. |
| `src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx` | `units.remove`; `assertRowsAffected` no longer imported; alert wording through D28; `onSettled` unchanged. |
| `src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx` | `units.create` (+ `units.reorder`, D30); the `CreatedTarget` type is gone; no `onError` added (none existed). |
| `src/components/campaigns/wall-chart/worker-detail-sheet.tsx` | `UnitsTab`: `placements.setPrimary`, `placements.unassign({ ouId })`; still no toast/alert (none existed). |
| `src/components/campaigns/wall-chart/unit-rating-control.tsx` | `units.update({ user_rating })`; the `scoped` cast is gone; alert wording through D28. |
| `src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts` | `units.reorder` (one call, was one update per unit). |
| `src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts` | `placements.unassign({ ouId })` per unit; drop-handler toast wording through D28 (plain `Error` messages unchanged). |
| `src/components/campaigns/wall-chart/split-unit-dialog.tsx` | `units.split`; the legacy RPC is no longer called; `SplitOuRpcResultRow` import dropped; alert line wording through D28. |
| `src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx` | K1 / D17 toast wording through D28 only. |
| `src/components/campaigns/wall-chart/structure-error-message.ts` | **New** (D28). |
| `src/components/campaigns/wall-chart/__tests__/harness/backend.ts` | `fakeRpc` records `{ name, args }`, answers each RPC with its static result shape (or a queued `answerRpc(...)` answer / error), throws `UnseededBackendError` for an RPC it does not describe; `rpcInvocations()`; `resetBackend()` clears both. |
| `src/components/campaigns/wall-chart/__tests__/harness/mocks.ts` | `createClient()` gains `rpc: fakeRpc`; the module mock also exports `getKnownExpiryMs` (fresh) and `refreshSessionViaServer` (ok) because `useAuthAwareMutation` reads them before every mutation — the first time a mutation actually runs under the harness. |
| `src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx` | **New**, 33 tests: exact `p_*` payloads per row (defaults included), call counts, invalidations, toasts / alerts, dialog closes, the K1 and D17 sentences, the nested-card double move (D31). The WP2.3 files are untouched. |
| `src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` | Eight wall-chart entries removed from `REMAINING_DIRECT_WRITERS`; case 2 stays a plain failing `it`. |
| `tests/e2e/structure-api.spec.ts` | **New**, §4.5 items 1–3 (written, not run — Stage 5 runs it on the preview). |
| `docs/organiser-ux-review/wp/wp2.2.md` | §3.11 ticks, §8.2 row note, §8.3 D28–D31, this section. |

**Per row — what each writer now calls:**

| Row | Wrapper call and argument mapping |
|---|---|
| 1 `move-worker-mutation.ts` | `placements.move({ campaignId: Number(campaignId), workerIds, fromOuId, toOuId, keepSource, keepInParent })`. Move: one call per distinct `fromOuId` (incl. `null`), `keepInParent: vars.keepInParent` (wrapper default `true` → `p_keep_in_parent: true`), `p_keep_source: false`; copy: one call, `fromOuId: null`, `keepSource: true`; `toOuId: null` + move: one call `{ workerIds, toOuId: null }` (`p_from_ou_id: null`, `p_within_group_id: null`); copy + `toOuId: null`: no call, `skipped: n`. Result: `inserted = moved + inserted + parent_inserted`, `deleted = removed + displaced`, `skipped = skipped + refs whose source is the target`. Then `stampEmployerWorksiteFromOu` / `syncWorkersToMatchingCampaigns` as before. |
| 2 `merge-units-dialog.tsx` | `units.merge({ campaignId: Number(campaignId), survivorOuId: survivor.ou_id, sourceOuIds: toDelete ids })`. |
| 3 `delete-organising-unit-dialog.tsx` | `units.remove({ campaignId, ouId: unit.ou_id, reassignments: [{ worker_id, to_ou_id }], deleteChildren: true })`. `is_primary` is not sent: the RPC re-points the source row, so the flag travels with it (D9), which is what the legacy `wasPrimary` upsert + clear achieved. The "delete group + N sub-units" and "no workers" paths send `p_reassignments: []`. |
| 4 `create-organising-unit-dialog.tsx` | `units.create({ campaignId, units, assignments })` with `client_ref`s `single` / `add-to-existing` / `container` + `member-<i>`; members carry `parent_ou_id: "container"`, `ou_group_id: "container"`, `unit_basis: { custom: true }`, `display_order: displayOrder + 1 + i`; `assignments: [{ ou_ref: client_ref, worker_id, is_primary: false, source: "manual" }]`; then `units.reorder({ campaignId, ouIds: computeBlockOrder(...) })` when `needsPlacement` (D30). Focus = the `ou_id` returned for the focus ref. |
| 5 `worker-detail-sheet.tsx` (`UnitsTab`) | `placements.setPrimary({ campaignId, workerId, ouId })`; `placements.unassign({ campaignId, workerIds: [workerId], ouId })`. |
| 6 `unit-rating-control.tsx` | `units.update({ campaignId, ouId, patch: { user_rating: value \| null } })`. |
| 7 `use-wall-chart-structure.ts` | `units.reorder({ campaignId, ouIds: orderedOuIds })`. |
| 8 `use-wall-chart-actions.ts` | `placements.unassign({ campaignId, workerIds, ouId })` once per unit of the selection. |
| split `split-unit-dialog.tsx` | `units.split({ campaignId, sourceOuId: parent.ou_id, children: [{ client_ref: draft_id, name, ou_type, unit_basis, total_workers_estimated: null }], assignments: [{ child_ref: draft_id, worker_id }], keepInSource: keepInParent })`; `parent_ou_id`, `display_order` and `source` come from the RPC's defaults (= the legacy function's values). `onSplit` gets `result.children[].ou_id`. |
| copy dialog | unchanged writer (row 1); `onError` → D28 wording. |

**Behaviour notes for the reviewer** (all sanctioned by the plan unless marked): a same-group copy now
raises K1 instead of inserting a duplicate (C-c); a same-group split child moves the worker out of the source
(C-k) — the dialog's "Keep workers in the parent too" switch still reads as if it applied there (UI string
decision left to the orchestrator, §11.8 report item 4); a forbidden write raises `forbidden` (42501) where
the legacy code got an RLS zero-row `NoRowsAffectedError`, so the same alerts / toasts fire with the D28
sentence; a cross-group split child whose group already holds the worker elsewhere is now refused
(`duplicate_in_group`) where the legacy `ON CONFLICT DO NOTHING` silently skipped it; `units.remove` deletes
every descendant, not only the direct children the dialog listed. The `rg` for the legacy split name still
hits `src/types/organising-row-types.ts:659` — a doc comment on the now-unused `SplitOuRpcArgs` /
`SplitOuRpcResultRow` types, outside the Stage 4 touch list; nothing calls the function.

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError|structure-writes|no-direct-structure-writes"
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (33 tests) 8512ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 161ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 77ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 29860ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:93:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 9685.54589 to be less than 6000
 Test Files  2 failed | 90 passed (92)
      Tests  2 failed | 1265 passed (1267)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -A14 "13 file(s) still write"   # guard case 2, the 13 files
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  components/campaigns/campaign-settings.tsx
  components/campaigns/campaign-units-section.tsx
  components/campaigns/campaign-wizard.tsx
  lib/campaign/recompute-ou-assignments.ts
  lib/campaign/use-allocate-workers-to-ou.ts
  lib/hooks/useRemoveWorkerFromCampaign.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(13) ] to deeply equal []

$ pnpm --filter organising-db exec eslint src/components/campaigns/wall-chart/move-worker-mutation.ts src/components/campaigns/wall-chart/merge-units-dialog.tsx src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx src/components/campaigns/wall-chart/worker-detail-sheet.tsx src/components/campaigns/wall-chart/unit-rating-control.tsx src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts src/components/campaigns/wall-chart/split-unit-dialog.tsx src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx src/components/campaigns/wall-chart/structure-error-message.ts src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/wall-chart/__tests__/harness/mocks.ts src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx src/lib/campaign/__tests__/no-direct-structure-writes.test.ts tests/e2e/structure-api.spec.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.
Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:100:5
   98 |   useEffect(() => {
   99 |     if (!open) return;
> 100 |     setReassignMode(workers.length > 1 ? "bulk" : "individual");
      |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  101 |     setBulkTarget("");
  102 |     setPerWorkerTarget({});
  103 |   }, [open, unit.ou_id, workers.length]);  react-hooks/set-state-in-effect
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
   244:3  warning  'ous' is defined but never used                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  1208:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1218) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps
✖ 3 problems (1 error, 2 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\([\x27\"]campaign_(organising_units|worker_ou)[\x27\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns/wall-chart --glob '!**/__tests__/**' -l
[exit=1 — no output]

$ rg -n "split_campaign_organising_unit" apps/organising-db/src --glob '!**/__tests__/**'
apps/organising-db/src/types/organising-row-types.ts:659:/** Argument shape for the split_campaign_organising_unit RPC. */
[exit=0]
```

Reading: `tsc` clean; 1,267 tests (was 1,234), 1,265 passing — the two failures are guard case 2 (by design,
13 files = §2.3 rows 9–21) and the pre-existing render-cost timing test (9.7 s vs 6 s on this runner); eslint
on the changed files reports only the pre-existing `delete-organising-unit-dialog.tsx:100` set-state-in-effect
error and the two pre-existing `worker-detail-sheet.tsx` warnings (all present at `e9379dd5`, none on a changed
line); lint total 294 = baseline; no direct write left under `wall-chart/`.

```
$ git status --short
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
?? apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
?? apps/organising-db/tests/e2e/structure-api.spec.ts
```

Stage 4 stops here; the e2e spec runs in Stage 5 on the preview.


### 11.9 Stage 4 fix round (2026-09-14)

Same constraints as §11.8 (no database, CLI, Playwright or commit; wall-chart scope only; no test weakened).
Coordinator decisions recorded: D28, D29, D30 and the e2e fixture's `afterAll` restore accepted; the silent
error surfaces (create dialog, `UnitsTab`, reorder, bulk remove) stay as they were; the
`src/types/organising-row-types.ts:659` doc comment on the now-unused `SplitOuRpcArgs` /
`SplitOuRpcResultRow` types is left alone — **Stage 6 cleanup candidate** (the only remaining `rg` hit for
the legacy split name outside docs).

**FIX 1 — nested-card double move (D32).** `campaign-unit-card.tsx` `handleDrop`: an early return when
`e.nativeEvent.defaultPrevented` is already true (a nested sub-unit card consumed the drop), clearing the
parent's own drag highlight. One `placements.move` per drop. Tests: `wall-chart.interaction.test.tsx` "a
drop on a nested card is handled by that card only — the parent card does not move the worker again"
(replaces the double-invocation characterisation; description says why); `wall-chart.structure-writes.test.tsx`
"a drop on a nested card issues exactly one move RPC" (one `structure_placements_move`, target 11, no toast).
`PROGRESS.md` incidental-findings row updated (that cell only).

**FIX 2 — split "keep in parent" switch (D33).** *Superseded in §11.10: the "same group" rule below was
wrong for the custom bucket; D33 is rewritten there.* `split-unit-dialog.tsx`: `groupKindForOuType()` mirrors
WP2.1's mapping; `hasCrossGroupChild` over the named drafts decides whether `ReviewStep` renders the switch
(`showKeepInParent`); `keepInSource` is `keepInParent` when shown, `false` when hidden. Tests: the existing
worksite-source split now also asserts the switch is present; new "the keep-in-parent switch is hidden when
every child derives to the source's own group, and nothing is claimed" (custom-kind source, custom child →
no switch, `p_keep_in_source: false`).

Files touched this round: `campaign-unit-card.tsx`, `split-unit-dialog.tsx`,
`__tests__/wall-chart.interaction.test.tsx`, `__tests__/wall-chart.structure-writes.test.tsx`,
`docs/organiser-ux-review/PROGRESS.md` (one cell), this file (§1.5 note, §8.2 row, §8.3 D31 note + D32/D33,
§11.9).

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError|structure-writes|interaction|no-direct-structure-writes"
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (34 tests) 9026ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx (21 tests) 11522ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 168ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 79ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 29162ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:93:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 9083.062664000001 to be less than 6000
 Test Files  2 failed | 90 passed (92)
      Tests  2 failed | 1266 passed (1268)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/components/campaigns/wall-chart/campaign-unit-card.tsx src/components/campaigns/wall-chart/split-unit-dialog.tsx src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx src/components/campaigns/wall-chart/move-worker-mutation.ts src/components/campaigns/wall-chart/merge-units-dialog.tsx src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx src/components/campaigns/wall-chart/worker-detail-sheet.tsx src/components/campaigns/wall-chart/unit-rating-control.tsx src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx src/components/campaigns/wall-chart/structure-error-message.ts src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/wall-chart/__tests__/harness/mocks.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts tests/e2e/structure-api.spec.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.
Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:100:5
   98 |   useEffect(() => {
   99 |     if (!open) return;
> 100 |     setReassignMode(workers.length > 1 ? "bulk" : "individual");
      |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  101 |     setBulkTarget("");
  102 |     setPerWorkerTarget({});
  103 |   }, [open, unit.ou_id, workers.length]);  react-hooks/set-state-in-effect
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
   244:3  warning  'ous' is defined but never used                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  1208:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1218) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps
✖ 3 problems (1 error, 2 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\([\x27\"]campaign_(organising_units|worker_ou)[\x27\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns/wall-chart --glob '!**/__tests__/**' -l
[exit=1 — no output]
```

Reading: `tsc` clean; 1,268 tests (§11.8: 1,267; one added), 1,266 passing — the two failures are guard case 2
(the same 13 files) and the pre-existing render-cost timing test; eslint on the changed files reports only the
pre-existing `delete-organising-unit-dialog.tsx:100` error and the two pre-existing `worker-detail-sheet.tsx`
warnings; lint total 294 = baseline; no direct write under `wall-chart/`.

```
$ git status --short
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M docs/organiser-ux-review/PROGRESS.md
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
?? apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
?? apps/organising-db/tests/e2e/structure-api.spec.ts
```

The Stage 4 fix round stops here.


### 11.10 Stage 4 review round 1 (2026-09-14)

Fresh reviewer: two blocking findings, eight advisories, all applied. Same constraints (no database, CLI,
Playwright or commit; wall-chart scope plus the plan/ledger; no test weakened).

| Finding | Change |
|---|---|
| **B1** D33 premise | `split-unit-dialog.tsx` `childSharesSourceGroup()` (`:132`) replaces the one-bucket rule: fixed kinds compare by kind; custom-bucket types are the same group only with the same `ou_type` and a source with no `ou_group_id`. Payload `:494` (`keepInParent` when shown, `false` when hidden), description `:632`. D33 rewritten. Tests: custom + activist (network) → shown, `true`; shift + Shift → hidden, `false`; custom + custom (no container) → hidden; custom container member + custom → shown. |
| **B2** e2e spec | `:462–464` the split switch is asserted absent (`toHaveCount(0)`, no "Keep workers in", the "move into it" sentence visible); `:398` dialog located by `/^(Move\|Copy) worker$/`; `:401–402` the Copy toggle is the button carrying `aria-pressed`, the submit the one without. |
| **A3** description | `:632` shows the stay-or-move sentence only with the switch; otherwise "Workers assigned to a sub-unit move into it: a worker is in one unit of a group at a time." |
| **A4** split duplicate | `structure-error-message.ts` `splitDuplicateInGroupMessage()` (`:44`); split dialog `onError` `:511`. D37. Test updated to the new sentence. |
| **A5** nested split | `wall-chart-unit-hierarchy.tsx:775` child-card menu item disabled (with the refusal as its title) when the parent is not a group container. D34. |
| **A6** descendants | `wall-chart-dialogs.tsx` `descendantOuIds()` (`:37`, used `:281`). D35. Test: "row 3 via the chart: deleting a group counts and removes every descendant". |
| **A7** contract comment | `move-worker-mutation.ts:22–37` now states D4/D19: the parent placement is kept/created only when the parent can hold placements and is in a different group from the target. |
| **A8** bulk remove | `use-wall-chart-actions.ts:217–228` try/catch → `toast.error(structureErrorMessage(…))`, refetch either way, selection kept on failure. D36. Test: "row 8: a refused unassign is toasted…". |
| **A9** tests | create dialog: "allocated workers ride the same call as p_assignments keyed by the element's client_ref" (single mode, Lena allocated → `[{ ou_ref: "single", worker_id: 112, is_primary: false, source: "manual" }]`) and "adding a unit to an existing group…" (fixture plus a shift container 30: numeric `parent_ou_id`/`ou_group_id` 30, `display_order` 6, one call, no reorder). Merge D8 test now expects the RPC's text "organising unit 12 has child units; delete or move them before merging it". |
| **A10** e2e hygiene | `chosen` (worker + original placements) is recorded before any write and `afterAll` always sweeps by prefix and restores from it (`:305–338`); `restoreWorker` carries `assigned_rule_id` (a rule row is restored by a direct REST insert — test cleanup, not product code — since no structure RPC recreates one with its rule id; `:225–247`); tests 1–3 each start from `placeOnlyOn(worker, A)` (`:152`, unassign-all then assign). |

Decisions recorded: D28, D29, D30, the `afterAll` restore and the silent error surfaces accepted; the
`src/types/organising-row-types.ts:659` doc comment on the unused `SplitOuRpcArgs` / `SplitOuRpcResultRow`
types stays — **Stage 6 cleanup candidate**.

Files touched this round: `split-unit-dialog.tsx`, `structure-error-message.ts`, `wall-chart-unit-hierarchy.tsx`,
`wall-chart-dialogs.tsx`, `move-worker-mutation.ts`, `hooks/use-wall-chart-actions.ts`,
`__tests__/wall-chart.structure-writes.test.tsx` (41 tests, was 34), `tests/e2e/structure-api.spec.ts`, this
file (§8.3 D33 rewrite + D34–D37, §11.9 note, §11.10).

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError|structure-writes|interaction|no-direct-structure-writes"
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx (21 tests) 10673ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (41 tests) 10997ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 156ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 81ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 27826ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:93:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8689.964428000003 to be less than 6000
 Test Files  2 failed | 90 passed (92)
      Tests  2 failed | 1273 passed (1275)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/components/campaigns/wall-chart/campaign-unit-card.tsx src/components/campaigns/wall-chart/split-unit-dialog.tsx src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx src/components/campaigns/wall-chart/wall-chart-dialogs.tsx src/components/campaigns/wall-chart/move-worker-mutation.ts src/components/campaigns/wall-chart/merge-units-dialog.tsx src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx src/components/campaigns/wall-chart/worker-detail-sheet.tsx src/components/campaigns/wall-chart/unit-rating-control.tsx src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx src/components/campaigns/wall-chart/structure-error-message.ts src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/wall-chart/__tests__/harness/mocks.ts src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx src/lib/campaign/__tests__/no-direct-structure-writes.test.ts tests/e2e/structure-api.spec.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.
Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:100:5
   98 |   useEffect(() => {
   99 |     if (!open) return;
> 100 |     setReassignMode(workers.length > 1 ? "bulk" : "individual");
      |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  101 |     setBulkTarget("");
  102 |     setPerWorkerTarget({});
  103 |   }, [open, unit.ou_id, workers.length]);  react-hooks/set-state-in-effect
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
   244:3  warning  'ous' is defined but never used                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  1208:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1218) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps
✖ 3 problems (1 error, 2 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\([\x27\"]campaign_(organising_units|worker_ou)[\x27\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns/wall-chart --glob '!**/__tests__/**' -l
[exit=1 — no output]
```

Reading: `tsc` clean; 1,275 tests (§11.9: 1,268; seven added), 1,273 passing — the two failures are guard case 2
(the same 13 files) and the pre-existing render-cost timing test; eslint on the changed files reports only the
pre-existing `delete-organising-unit-dialog.tsx:100` error and the two pre-existing `worker-detail-sheet.tsx`
warnings; lint total 294 = baseline; no direct write under `wall-chart/`.

```
$ git status --short
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/wall-chart-dialogs.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M docs/organiser-ux-review/PROGRESS.md
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
?? apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
?? apps/organising-db/tests/e2e/structure-api.spec.ts
```

Review round 1 stops here.


### 11.11 Stage 4 review round 2 (2026-09-14)

Second fresh reviewer: all ten round-1 fixes confirmed; one blocking e2e defect and four advisories. N1, N2, N3,
N5 applied; N4 recorded in §8.2 (deferred to Stage 5). Final Stage 4 round; same constraints.

| Item | Change |
|---|---|
| **N1** (blocking) | `tests/e2e/structure-api.spec.ts`: every role locator that could match a sibling by substring is `exact: true` — `Assign` (`:475`, no longer matches "Unassign"), `Continue`, `Create 1 sub-unit`, `Split into sub-units`, `Unit actions`; the Copy toggle/submit pair was already exact and disambiguated by `aria-pressed`; the dimension button uses an anchored regex. |
| **N2** | `wall-chart-unit-hierarchy.tsx:785` sub-line "Units nested under another unit cannot be split" rendered inside the disabled item; the `title` removed. **D38.** Tests: "split (D34/D38): a sub-unit of a group container may be split, with no reason line" and "… of a non-container parent is disabled with the visible reason" (fixture with Acme Group as a non-container, revealed through Expand all; the item carries `aria-disabled="true"` and the sub-line). |
| **N3** | `wall-chart-dialogs.tsx:262` passes `sourceContainer` (looked up in `ous` by `ou_group_id`); `split-unit-dialog.tsx:141` `childSharesSourceGroup(childType, source, sourceContainer)` decides per WP2.1's derivation; `:713` `keepInParentIsPartial`; `:1190` the partial-scope sentence. **D39.** Tests: fixed-kind container + same-type child → hidden/`false`; custom-kind container → shown/`true`; container row unavailable → shown; mixed (Shift + custom under a shift source) → shown with the sentence. |
| **N5** | e2e `restoreWorker` (`:229–247`): `assign()` returns the RPC result; each restore logs `inserted/skipped/moved/displaced` and throws when `inserted + skipped !== 1` (`:242`) — `p_on_conflict: "skip"` never moves, so anything else means the row did not land. |
| **N4** (advisory) | Recorded in §8.2 as an e2e-hygiene risk; mitigation (persist `chosen` to `test-results/`, restore in the next `beforeAll`) deferred to Stage 5. |

Files touched this round: `wall-chart-unit-hierarchy.tsx`, `wall-chart-dialogs.tsx`, `split-unit-dialog.tsx`,
`__tests__/wall-chart.structure-writes.test.tsx` (46 tests, was 41), `tests/e2e/structure-api.spec.ts`, this
file (§8.2 row, §8.3 D38–D39, §11.11).

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError|structure-writes|interaction|no-direct-structure-writes"
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx (21 tests) 10749ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (46 tests) 13005ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 164ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 79ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 28047ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
AssertionError: 13 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts:93:7
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 9255.150227 to be less than 6000
 Test Files  2 failed | 90 passed (92)
      Tests  2 failed | 1278 passed (1280)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=0]

$ pnpm --filter organising-db exec eslint src/components/campaigns/wall-chart/campaign-unit-card.tsx src/components/campaigns/wall-chart/split-unit-dialog.tsx src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx src/components/campaigns/wall-chart/wall-chart-dialogs.tsx src/components/campaigns/wall-chart/move-worker-mutation.ts src/components/campaigns/wall-chart/merge-units-dialog.tsx src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx src/components/campaigns/wall-chart/worker-detail-sheet.tsx src/components/campaigns/wall-chart/unit-rating-control.tsx src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx src/components/campaigns/wall-chart/structure-error-message.ts src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/wall-chart/__tests__/harness/mocks.ts src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx src/lib/campaign/__tests__/no-direct-structure-writes.test.ts tests/e2e/structure-api.spec.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.
Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:100:5
   98 |   useEffect(() => {
   99 |     if (!open) return;
> 100 |     setReassignMode(workers.length > 1 ? "bulk" : "individual");
      |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  101 |     setBulkTarget("");
  102 |     setPerWorkerTarget({});
  103 |   }, [open, unit.ou_id, workers.length]);  react-hooks/set-state-in-effect
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
   244:3  warning  'ous' is defined but never used                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  1208:9  warning  The 'rows' logical expression could make the dependencies of useMemo Hook (at line 1218) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rows' in its own useMemo() Hook  react-hooks/exhaustive-deps
✖ 3 problems (1 error, 2 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\([\x27\"]campaign_(organising_units|worker_ou)[\x27\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns/wall-chart --glob '!**/__tests__/**' -l
[exit=1 — no output]
```

Reading: `tsc` clean; 1,280 tests (§11.10: 1,275; five added), 1,278 passing — the two failures are guard case 2
(the same 13 files) and the pre-existing render-cost timing test; eslint on the changed files reports only the
pre-existing `delete-organising-unit-dialog.tsx:100` error and the two pre-existing `worker-detail-sheet.tsx`
warnings; lint total 294 = baseline; no direct write under `wall-chart/`.

```
$ git status --short
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/mocks.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/create-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-structure.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/move-worker-mutation.ts
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/wall-chart-dialogs.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/wall-chart-unit-hierarchy.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/worker-detail-sheet.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M docs/organiser-ux-review/PROGRESS.md
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
?? apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
?? apps/organising-db/tests/e2e/structure-api.spec.ts
```

Stage 4 stops here.

### 11.12 Stage 5 — settings, wizard, units-section and hook writers (2026-09-14)

No database, CLI, Playwright, commit or `structure-api.ts` change; no migration touched. Rows 9–13 of §2.3 now
write only through `structureApi(client)` with the client each file already used; the guard inventory shrank
from 13 to the 8 files of rows 14–21. Deviations D40–D52 (§8.3). Stops: none of §8.4 was hit; the two
behaviours the wrapper cannot express (`ou_type` on an existing unit, `ou_group_id` on a non-container
parent) are handled visibly / normalised and flagged for decision (D48, D45) rather than worked around silently.

**Files changed** (all under `apps/organising-db/`):

| File | Change |
|---|---|
| `src/components/campaigns/campaign-units-section.tsx` | Row 9: `acceptCandidate` / `createOu` → `units.bulkSave({ creates: [one] })` (D47); `updateOu` → `units.bulkSave({ updates: [one] })` without `ou_type`, Type select fixed while editing, inline error line, reset on close (D48); `assignOu` → `placements.assign(onConflict: "error")` (D49); `rateUnit` → `units.update({ user_rating })`; `removeFromUnitMutation` → `placements.unassign({ ouId })` + the legacy `assertRowsAffected` count check on `removed`; `reallocateToUnitMutation` → `placements.move(keepInParent: false)` (D50). Alerts / feedback through `structureErrorMessage`. `assertRowsAffected` still imported (rules + the count check). |
| `src/components/campaigns/campaign-wizard.tsx` | Row 10: step 5 `saveUnitsMutation` → `saveUnitDrafts(supabase, campaignId, units)`; step 6 `saveWorkersMutation` → `savePlacements(supabase, campaignId, ouIds, allocationRows)`; the auto-allocation, `stampEmployerWorksiteFromOu` / `syncWorkersToMatchingCampaigns` calls, invalidations and `setStep` transitions unchanged; `cid` vs `campaign_id` advisory untouched. |
| `src/components/campaigns/campaign-settings.tsx` | Row 11: the same two helpers; `setUnits(saved.drafts)`; toasts through `structureErrorMessage`; the allocation toast reports skipped rows (D43). |
| `src/lib/hooks/useRemoveWorkerFromCampaign.ts` | Row 12: `placements.unassign({ campaignId, workerIds: [workerId] })` (all placements); the `ou_id` read is gone; the membership delete, worker update, call-list scrub and audit row unchanged; `onError` through `structureErrorMessage`. |
| `src/lib/campaign/use-allocate-workers-to-ou.ts` | Row 13: `placements.assign(source manual, isPrimary single-only, onConflict skip)`; result `{ inserted, skipped }` (D46). |
| `src/lib/campaign/structure-save.ts` | **New**: `planUnitsBulkSave`, `applyUnitsSaveResult`, `saveUnitDrafts`, `planPlacementsSave`, `savePlacements` (D41–D45, D51). Reads through the caller's client; writes only through `structureApi`. Outside the brief's touch list for the same reason D28 was (the two screens would otherwise duplicate 100 lines of planning that must be unit-tested without mounting 1,000-line components). |
| `src/lib/campaign/structure-error-message.ts` | **Moved** from the wall chart (D40); body unchanged, header notes the move. |
| Seven wall-chart importers + `wall-chart.structure-writes.test.tsx` | Import path only. |
| `src/components/campaigns/wall-chart/__tests__/harness/backend.ts` | **Harness change**: `FakePostgrestQuery` takes its table name and records `insert` / `update` / `upsert` / `delete` chains into `writeInvocations()` (answered with no rows; fixture tables never change); `resetBackend` clears it; `DEFAULT_RPC_RESULTS` gains `structure_units_bulk_save` and `structure_placements_assign`. Needed so the accept-candidate path (RPC, then the `campaign_ou_candidates` row update) can be pinned. `mocks.ts` unchanged. |
| `src/lib/campaign/__tests__/fake-structure-client.ts` | **New** recording fake (from-chains and rpc in one ordered `calls` list) for the node/hook tests. |
| `src/lib/campaign/__tests__/structure-save.test.ts` | **New**, 22 tests: planner composition (deletes/updates/creates, ordering, `client_ref` links, `ou_group_id` rule, grandchild, dropped orphan, reuse rule and its limits), result application, and the exact `p_*` payloads of `saveUnitDrafts` / `savePlacements` including the empty-diff call (D41), the failed-read paths and a refused RPC. |
| `src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx` | **New**, 5 tests: exact unassign payload, order (unassign → membership delete → call lists → audit row), toasts, `onRemoved`, the eight invalidations, forbidden path, `removed: 0` + missing membership = loud, unit rows without membership = warn. |
| `src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx` | **New**, 4 tests: exact assign payload with `skip`, primary-for-one-only, empty selection, refusal reaches the caller. |
| `src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx` | **New**, 16 tests, the real section mounted under the wall-chart harness: every row-9 path's exact `p_*` payload, dialog closes, invalidations, `window.alert` wording, the inline error line and Type select (D48), the group sentence (D49), the candidate row update after the RPC, and "no direct write" through the harness write log. |
| `src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` | Five entries removed from `REMAINING_DIRECT_WRITERS` (8 remain); case 2 stays a plain failing `it`. |
| `tests/e2e/structure-api.spec.ts` | §4.5 items 4–6 appended as a second describe block (own prefix, own beforeAll/afterAll, restore of the chosen worker). Not run. |
| `docs/organiser-ux-review/wp/wp2.2.md` | §3.11 ticks, §7, §8.3 D40–D52, this section. |

**Per row — wrapper call and argument mapping:**

| Row | Wrapper call and mapping |
|---|---|
| 9 create (`createOu`) | `units.bulkSave({ campaignId: Number(campaignId), creates: [{ name, ou_type, source: "manual", total_workers_estimated?, anchor_worker_id?, commonality_logic?, target_size? }] })` — the optional keys only when the form field is set, as the legacy payload; no `display_order` (D47). |
| 9 accept candidate | `units.bulkSave({ creates: [{ name, ou_type, total_workers_estimated, commonality_logic, source: "wtp_seeded" }] })` → `created[0].ou_id` → the `campaign_ou_candidates` update as before. |
| 9 edit (`updateOu`) | `units.bulkSave({ updates: [{ ou_id, name, commonality_logic: text \| null, total_workers_estimated: n \| null, anchor_worker_id: n \| null, target_size: n \| null }] })` — the legacy patch minus `ou_type` (D48). |
| 9 rating | `units.update({ campaignId, ouId, patch: { user_rating: value \| null } })`. |
| 9 assign dialog | `placements.assign({ ouId, workerIds (pre-filtered: not already on the unit), source: "manual", isPrimary: assignPrimary && one worker, onConflict: "error" })` (D49). |
| 9 remove from unit (row / bulk) | `placements.unassign({ workerIds, ouId })`, then `assertRowsAffected({ error: null, count: removed }, workerIds.length, "Removing the workers from the unit")` — the legacy wording, now meaning "changed since you loaded" only (the RPC cannot be RLS-silent). |
| 9 reallocate | `placements.move({ workerIds, fromOuId (null from Unallocated), toOuId, keepInParent: false })` → `p_keep_source: false, p_within_group_id: null` (D50). |
| 10 / 11 save units | `saveUnitDrafts`: read `ou_id, ou_type, unit_basis, parent_ou_id, is_group_container` of the campaign's units (a failed read = nothing to delete, as before) → `units.bulkSave({ campaignId, deleteOuIds, updates: [{ ou_id, name, total_workers_estimated, unit_basis }], creates: [{ client_ref: draft_id, name, ou_type, total_workers_estimated, unit_basis, display_order: existing.length + i, is_group_container, parent_ou_id?: id \| client_ref, ou_group_id?: id \| client_ref (containers only) }] })` → drafts resolved from `reusedOuIdByDraftId` and `created[].client_ref`. Always one call (D41). |
| 10 / 11 save allocation | `savePlacements`: read `ou_id, worker_id` on the state's `ouIds` (a failed read throws) → `placements.unassign({ workerIds, ouId })` per unit with rows to drop → `placements.assign({ ouId, workerIds, source: "manual", isPrimary: false, onConflict: "skip" })` per unit with rows to add (D43). Membership delete/insert before it unchanged; the wizard's post-save universe helpers unchanged. |
| 12 | `placements.unassign({ campaignId: Number(campaignId), workerIds: [workerId] })` → `p_ou_id: null, p_within_group_id: null`; `removed` feeds the legacy "unit rows removed but no membership row" warning. |
| 13 | `placements.assign({ campaignId: Number(campaignId), ouId, workerIds, source: "manual", isPrimary: !!isPrimary && workerIds.length === 1, onConflict: "skip" })` (D46). |

**`onConflict` per caller:** row 13's only caller (`workforce-bulk-toolbar.tsx`, bulk "Assign to unit") →
`skip` (D46); the units-section assign dialog → `error` (D49); wizard step 6 / settings allocation →
`skip` (D43); row 12 and the units-section remove paths are unassigns (no conflict semantics); the
reallocate dialog is a `move` (C-b displacement, D50).

**Preserved vs still lost, per screen (the data-integrity comparison the brief asks for):**

| Screen | Today's loss | Now |
|---|---|---|
| Units section — create / edit / rating | Nothing (single-row writes). | Nothing; `user_rating`, placements and rules untouched by an edit. |
| Units section — reallocate | The target row was a fresh `manual`, non-primary row and the source row was deleted: `is_primary`, `assignment_source`, `assigned_rule_id` and the row id were lost on every move. | **Preserved**: `structure_placements_move` re-points the source row (C-l); a same-group placement on another unit is displaced (C-a), which the legacy left as a duplicate. From Unallocated a new `manual` row is inserted, as before. |
| Units section — assign / remove | None beyond the rows asked for. | Same. |
| Wizard step 5 / settings "save units" — a unit the user removed | Its placements (FK cascade), `campaign_unit_rules` and `campaign_ou_coverage` (cascade), rating (the row) all went. | **Identical loss, explicit mechanism**: `structure__delete_unit` deletes the unit's placements and the row; `campaign_unit_rules` / `campaign_ou_coverage` / `woc_scope_units` / `structure_test_results` / `section_plan_workforce_mapping_overrides` go with their `ON DELETE CASCADE`, the `SET NULL` dependants are nulled (§3.3 list). Nothing can preserve rows of a unit the user deleted. |
| Wizard step 5 / settings — a scope unit toggled off and on (same `unit_basis`) | Deleted and re-created: placements, rating, rules lost. | **Preserved** (D42): updated in place. |
| Wizard step 5 / settings — an existing unit kept | Nothing (the legacy update never touched `user_rating` or placements). | Same. A legacy **blank-named** unit is the one thing the RPC refuses that the legacy update re-saved; since every unit is re-sent, the save is refused until that unit is named — said as `Unit n (type) has no name.` under the wizard step / in the settings toast, before any RPC (D53; round 1 corrected the earlier D52 reading that length and estimate refusals were also new). |
| Wizard step 6 / settings "save worker allocation" | Every placement on the campaign's units was deleted and the grid re-inserted: every row lost its id, `is_primary`, `assignment_source` (rule / universe rows became `manual`) and `assigned_rule_id`, whether or not the grid changed it. | **Preserved for every row the grid keeps** (D43). Rows the grid drops go (as they should); a worker moved between two units in the grid is an unassign + a `manual`, non-primary assign, so *that* row's flag and provenance are still lost, as today. |
| Remove from campaign (row 12) | All placements of the worker deleted; membership deleted. | Identical. |
| Bulk allocate (row 13) | A worker already on the unit failed the batch; a same-group duplicate was written. | Skipped and counted (D46). |

**Raw command output** (this session, after every change):

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|structure-writes|no-direct-structure-writes|structure-save|useRemove|use-allocate"
 ✓ src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx (16 tests) 13718ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (46 tests) 20245ms
 ✓ src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx (5 tests) 122ms
 ✓ src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx (4 tests) 108ms
 ✓ src/lib/campaign/__tests__/structure-save.test.ts (22 tests) 31ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 218ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 114ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 32723ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
 Test Files  2 failed | 94 passed (96)
      Tests  2 failed | 1325 passed (1327)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=1]

$ pnpm --filter organising-db test 2>&1 | grep -A9 "file(s) still write"   # guard case 2, the 8 files
     → 8 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  lib/campaign/recompute-ou-assignments.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(8) ] to deeply equal []

$ pnpm --filter organising-db exec eslint src/components/campaigns/campaign-units-section.tsx src/components/campaigns/campaign-wizard.tsx src/components/campaigns/campaign-settings.tsx src/lib/hooks/useRemoveWorkerFromCampaign.ts src/lib/campaign/use-allocate-workers-to-ou.ts src/lib/campaign/structure-save.ts src/lib/campaign/structure-error-message.ts src/components/campaigns/wall-chart/merge-units-dialog.tsx src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx src/components/campaigns/wall-chart/unit-rating-control.tsx src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx src/components/campaigns/wall-chart/split-unit-dialog.tsx src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__tests__/structure-save.test.ts src/lib/campaign/__tests__/fake-structure-client.ts src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx tests/e2e/structure-api.spec.ts
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  [… the pre-existing react-hooks/set-state-in-effect finding at :100, present at e9379dd5 and in §11.8; only the import line of this file changed]
✖ 1 problem (1 error, 0 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src/components/campaigns apps/organising-db/src/lib/hooks apps/organising-db/src/lib/campaign --glob '!**/__tests__/**' -l
apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
[exit=0]

$ git status --short
 M apps/organising-db/src/components/campaigns/campaign-settings.tsx
 M apps/organising-db/src/components/campaigns/campaign-units-section.tsx
 M apps/organising-db/src/components/campaigns/campaign-wizard.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 D apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/use-allocate-workers-to-ou.ts
 M apps/organising-db/src/lib/hooks/useRemoveWorkerFromCampaign.ts
 M apps/organising-db/tests/e2e/structure-api.spec.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/__tests__/
?? apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx
?? apps/organising-db/src/lib/campaign/structure-error-message.ts
?? apps/organising-db/src/lib/campaign/structure-save.ts
?? apps/organising-db/src/lib/hooks/__tests__/
```

Reading: `tsc` clean; 1,327 tests (was 1,280), 1,325 passing — the two failures are guard case 2 (by design,
8 files = §2.3 rows 14–21) and the pre-existing render-cost timing test; eslint on the changed files reports
only the pre-existing `delete-organising-unit-dialog.tsx:100` finding (its only change is the D40 import
path); lint total 294 = baseline; the `rg` line finds only row 14 (`recompute-ou-assignments.ts`, Stage 6);
no direct write remains in rows 9–13; `supabase/.temp/*` untouched.

**D45 consequences to carry into WP2.7 (review round 1, advisory 6):** sub-units created after Stage 5 under a
plain (non-container) parent carry `ou_group_id = NULL`, and the readers that treat `ou_group_id` as "in a
group" — `components/campaigns/workforce/workforce-list-view.tsx` (~:288, :448, :609),
`lib/campaign/ou-reassignment-targets.ts` (~:35) and `components/campaigns/step-allocate-workers.tsx`
(~:353–378, the cross-group conflict hint) — read them as "not in a group", while legacy rows created by the
wizard keep the old shape (`ou_group_id = parent`). Both shapes coexist until WP2.7 normalises or the
readers switch to `group_id`. The settings allocation grid no longer lists containers (D56).

**Stage 6 one-liner (D46 follow-up, advisory 7):** `components/campaigns/workforce/workforce-bulk-toolbar.tsx`
~:262 toasts `Allocated ${res.inserted} workers …` and ignores the hook's `skipped`; outside rows 9–13, so
Stage 6 (or WP2.4) adds "N skipped: already in a unit of that group" to that toast.

**Decisions for the orchestrator before Stage 6** (none blocks Stage 6's own rows):

1. D48 — `ou_type` of an existing unit is now fixed in the units-section edit dialog (visible, explained). The
   alternative is to add `ou_type` to `structure_unit_update`'s whitelist (SQL + wrapper; the WP2.1 triggers
   already re-derive `group_id` and cascade it to the placements), which Stage 5 did not do.
2. D45 — a sub-unit under a plain (non-container) unit is created with `ou_group_id = NULL` where the wizard
   wrote the parent's id; and the settings page now saves drafted groups as groups. Confirm both.
3. D43 — `skip` for the allocation grid: a worker put in two units of one group lands in the lower-numbered
   one and is counted (settings toast; the wizard has no toast). `error` would refuse the whole save with a
   partial state (unassigns already applied).
4. D42 — the reuse rule (type + identical basis on the four scope keys). Confirm the keys, or ask for a
   narrower rule.
5. ~~D52 — the wizard's steps 5 and 6 have no error surface~~ — **resolved in review round 1 (D53)**: the
   sentence names the unit and is rendered under the step / in the settings toast.
6. e2e item 6 assumes the settings page renders for a `user` on `E2E_FOREIGN_CAMPAIGN_ID` (it is gated on
   role only) and that its scope reads are RLS-visible or empty; the test is written to pass either way but
   has not run.
7. `lib/campaign/structure-save.ts` and the test fake are new files outside the brief's touch list (D28's
   reasoning); `useAllocateWorkersToOu`'s result gained `skipped` (its caller ignores extra keys).

Stage 5 stops here; items 1–6 of the e2e spec run on the preview when the operator schedules them.

### 11.13 Stage 5 review round 1 (2026-09-14)

Fresh-reviewer round on §11.12: one blocking finding (D52's silent refusal), one recorded decision (D48 →
§9.1 T2, no code change), advisories 2–9. Same constraints (no database, no commits, no SQL or
`structure-api.ts` change, no test weakened). Deviations D53–D57 (§8.3); D52 corrected.

**Per item:**

| Item | Where | What changed |
|---|---|---|
| Blocking 1 (a) | `src/lib/campaign/structure-save.ts` — `UnitDraftValidationError`, `validateUnitsSavePlan()` (called in `saveUnitDrafts` after planning, before the RPC) | Blank / whitespace-only name → `Unit 3 (worksite) has no name.` (position in the list, type label); > 200 chars and negative estimate mirrored with the unit's name. No RPC issued (D53). |
| Blocking 1 (b) | `src/components/campaigns/campaign-wizard.tsx` — after the step-5 `<StepCampaignUnits/>` and the step-6 `<StepAllocateWorkers/>` blocks | `saveUnitsMutation.error` / `saveWorkersMutation.error` rendered as `<p role="alert" className="text-xs text-destructive">` through `structureErrorMessage(…)`. |
| Blocking 1 (c) | `src/components/campaigns/campaign-settings.tsx` `saveUnitsMutation.onError`, `saveWorkersMutation.onError` | Already `structureErrorMessage`; the D53 sentence rides the same toast (test: "Unit 2 (employer) has no name."). |
| Blocking 1 tests | `src/lib/campaign/__tests__/structure-save.test.ts` (+4: the sentences per path, `saveUnitDrafts` throws with no RPC); **new** `src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx` (12: wizard step 5 success / refused / blank name, step 6 success / refused, settings units success / refused / blank name, settings grid D56, allocation success / skipped-count toast / refused) | Wizard and settings mounted for real under the wall-chart harness with a units + placements fixture. |
| D48 decision | §9.1 row **T2**, "pending operator" | No code change. |
| Advisory 2 | `src/lib/campaign/structure-error-message.ts` `duplicateInGroupMessage(err, lead)`; `campaign-units-section.tsx` `assignOu.onError` | D54 wording; test updated to the new sentence, plus a pin that the legacy P0001 keeps the old one. |
| Advisory 3 | `structure-save.ts` `saveUnitDrafts` read `.order("ou_id", { ascending: true })`; `planUnitsBulkSave` sorts delete candidates | D55; test with two same-basis rows in both orders; the read's ops pinned `[select, eq, order]`. |
| Advisory 4 | `wall-chart/__tests__/harness/backend.ts` | D57: `DirectStructureWriteError` for the two tables unless `allowDirectStructureWrites()`; `queryInvocations()`; `structure_placements_assign` default removed. Stage 4 suites re-run: 8 files, 134 tests green. Pin: `campaign-units-section.structure-writes.test.tsx` "the harness refuses a direct write on a structure table". |
| Advisory 5 | §8.2 new row | Unpaged `savePlacements` read; truncated rows survive; Stage 6 to decide paging. |
| Advisory 6 | `campaign-settings.tsx` scope query + draft mapping (hierarchy columns), grid `units` filter `!u.is_group_container`; §11.12 D45-consequences paragraph | D56. |
| Advisory 7 | §11.12 Stage 6 one-liner | `workforce-bulk-toolbar.tsx` ~:262 hides `skipped`. |
| Advisory 8 | `campaign-save-flows.structure-writes.test.tsx` | Pins: the `campaign_worker_ou` read `.in("ou_id", [10, 11, 20])` (the units the step knows, container included), `router.replace("/campaigns/new?cid=1&step=6")` / `…step=7` after success and not after a refusal, the membership delete + insert payload, the settings "Worker allocation saved. 1 placement skipped: …" toast. |
| Advisory 9 | §11.12 preserved-vs-lost table, "existing unit kept" row | D52 sentence corrected (only the blank name is new). |

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|structure-writes|no-direct-structure-writes|structure-save|useRemove|use-allocate|save-flows"
 ✓ src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx (12 tests) 2358ms
 ✓ src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx (18 tests) 10490ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (46 tests) 18150ms
 ✓ src/lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx (5 tests) 97ms
 ✓ src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx (4 tests) 115ms
 ✓ src/lib/campaign/__tests__/structure-save.test.ts (26 tests) 21ms
 ❯ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests | 1 failed) 200ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 109ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 36939ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
 Test Files  2 failed | 95 passed (97)
      Tests  2 failed | 1343 passed (1345)
[exit=1]

$ pnpm --filter organising-db test 2>&1 | grep -A9 "file(s) still write"   # guard case 2, the same 8 files
     → 8 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  lib/campaign/recompute-ou-assignments.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(8) ] to deeply equal []

$ pnpm exec vitest run src/components/campaigns/wall-chart/__tests__ --exclude "**/wall-chart.render-cost.test.tsx"   # Stage 4 suites under the hardened harness (D57)
 Test Files  8 passed (8)
      Tests  134 passed (134)

$ pnpm --filter organising-db exec eslint <the 22 changed/new files of §11.12 + campaign-save-flows.structure-writes.test.tsx; the deleted wall-chart path skipped>
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  [… the pre-existing react-hooks/set-state-in-effect finding at :100 (§11.8); only this file's import line changed]
✖ 1 problem (1 error, 0 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' -l | sort
apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
apps/organising-db/src/lib/workers/sync-campaign-universe.ts
[exit=0]   # rows 18, 14, 15 — the single-line regex finds 3 of the guard's 8 (D7); none of rows 9–13

$ git status --short
 M apps/organising-db/src/components/campaigns/campaign-settings.tsx
 M apps/organising-db/src/components/campaigns/campaign-units-section.tsx
 M apps/organising-db/src/components/campaigns/campaign-wizard.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 D apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/use-allocate-workers-to-ou.ts
 M apps/organising-db/src/lib/hooks/useRemoveWorkerFromCampaign.ts
 M apps/organising-db/tests/e2e/structure-api.spec.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/__tests__/
?? apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx
?? apps/organising-db/src/lib/campaign/structure-error-message.ts
?? apps/organising-db/src/lib/campaign/structure-save.ts
?? apps/organising-db/src/lib/hooks/__tests__/
```

Reading: `tsc` clean; 1,345 tests (1,343 passing; +18 since §11.12), the same two expected failures; the
guard lists the same 8 files; eslint only the pre-existing finding; lint 294 = baseline; no direct write in
rows 9–13; Stage 4's suites green under the hardened harness; `supabase/.temp/*` untouched.

### 11.14 Stage 5 review round 2 (2026-09-14)

Second fresh reviewer: approve with advisories; A2 and A3 applied, A4 and A5 recorded, the toolbar note
mirrored into §8.2. Same constraints. Deviations D58–D59 (§8.3).

| Item | Where | What changed |
|---|---|---|
| A2 | `src/lib/campaign/structure-save.ts` `validateUnitsSavePlan` (~:262–270, `INT32_MAX`) | Fractional / over-32-bit estimate refused before the RPC with the unit's name (D58). Tests: `structure-save.test.ts` (+1), `campaign-save-flows.structure-writes.test.tsx` ("a fractional estimate is refused before any RPC, naming the unit"). Input handlers untouched. |
| A3 | `src/components/campaigns/campaign-wizard.tsx` step-5 `onBack` (~:1714) and step-6 `onBack` (~:1751) | `saveUnitsMutation.reset()` / `saveWorkersMutation.reset()` before `setStep` (D59). Tests: refusal → Back → forward (through step 4's "Continue") shows no stale line; refusal → successful save clears it; step-6 refusal → Back clears it. |
| A4 | §8.2 row "Read-failure asymmetry" | Recorded for Stage 6 (recommend both helpers throw). |
| A5 | §8.2 row "Membership rewritten before a refused placement save" | Recorded for Stage 6 / WP2.4. |
| Toolbar note | §8.2 row "Bulk toolbar hides skipped placements" (also §11.12) | Mirrored. |

**Raw command output:**

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|save-flows|structure-save"
 ✓ src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx (14 tests) 3402ms
 ✓ src/lib/campaign/__tests__/structure-save.test.ts (27 tests) 82ms
   × no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6) 98ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 36015ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/campaign/__tests__/no-direct-structure-writes.test.ts > no direct structure writes (wp2.2.md §3.9 guard) > no direct writers remain (acceptance criterion; expected to fail until Stage 6)
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
 Test Files  2 failed | 95 passed (97)
      Tests  2 failed | 1346 passed (1348)
[exit=1]

$ pnpm --filter organising-db test 2>&1 | grep -A9 "file(s) still write"   # guard case 2, the same 8 files
     → 8 file(s) still write directly to campaign_organising_units / campaign_worker_ou:
  app/api/campaign-import/apply/route.ts
  app/api/campaigns/[id]/add-workers/route.ts
  app/api/campaigns/[id]/create-worker/route.ts
  app/api/campaigns/[id]/workers/duplicates/route.ts
  app/api/worker-import/apply/route.ts
  app/api/worker-import/organising-units/route.ts
  lib/campaign/recompute-ou-assignments.ts
  lib/workers/sync-campaign-universe.ts: expected [ …(8) ] to deeply equal []

$ pnpm --filter organising-db exec eslint <the 23 changed/new files of §11.13; the deleted wall-chart path skipped>
/home/user/OffshoreAlliance/apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
  100:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  [… the pre-existing react-hooks/set-state-in-effect finding at :100 (§11.8); only this file's import line changed]
✖ 1 problem (1 error, 0 warnings)
[exit=1]

$ pnpm --filter organising-db lint 2>&1 | tail -3
/home/user/OffshoreAlliance/apps/organising-db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 lint: `eslint`
Exit status 1
$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ git status --short
 M apps/organising-db/src/components/campaigns/campaign-settings.tsx
 M apps/organising-db/src/components/campaigns/campaign-units-section.tsx
 M apps/organising-db/src/components/campaigns/campaign-wizard.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/harness/backend.ts
 M apps/organising-db/src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/hooks/use-wall-chart-actions.ts
 M apps/organising-db/src/components/campaigns/wall-chart/merge-units-dialog.tsx
 M apps/organising-db/src/components/campaigns/wall-chart/split-unit-dialog.tsx
 D apps/organising-db/src/components/campaigns/wall-chart/structure-error-message.ts
 M apps/organising-db/src/components/campaigns/wall-chart/unit-rating-control.tsx
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/use-allocate-workers-to-ou.ts
 M apps/organising-db/src/lib/hooks/useRemoveWorkerFromCampaign.ts
 M apps/organising-db/tests/e2e/structure-api.spec.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/__tests__/
?? apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
?? apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
?? apps/organising-db/src/lib/campaign/__tests__/use-allocate-workers-to-ou.test.tsx
?? apps/organising-db/src/lib/campaign/structure-error-message.ts
?? apps/organising-db/src/lib/campaign/structure-save.ts
?? apps/organising-db/src/lib/hooks/__tests__/
```

Reading: `tsc` clean; 1,348 tests (1,346 passing; +3 since §11.13), the same two expected failures; the guard
lists the same 8 files; eslint only the pre-existing finding; lint 294 = baseline; `supabase/.temp/*`
untouched. Stage 5 is complete; the e2e spec (items 1–6) runs on the preview when the operator schedules it.

### 11.15 Stage 6 — lib and API-route writers (2026-09-14)

No database, CLI, Playwright, commit, migration or `structure-api.ts` change. Rows 14–21 of §2.3 now write
only through `structureApi(client)` with the client each file already used (the two libraries: the caller's
client; the six routes: the user-session server client); the guard inventory is **empty** and case 2 — the
acceptance criterion — is green. Deviations D60–D76 (§8.3). Stops: none of §8.4 was hit. The brief's
"existing test file" for the recompute did not exist (D64); the recompute, the sync, the paged reads, A4 and
the toolbar toast are all pinned by node tests on the recording fake.

**Files changed** (all under `apps/organising-db/`):

| File | Change |
|---|---|
| `src/lib/campaign/recompute-ou-assignments.ts` | Row 14: planning unchanged; the three write sites → one `placements.replaceRuleRows({ campaignId, rows })` (rows attributed, D63); result `{ inserted, removed, skipped }`; the `scoped` read type loses `delete` / `insert`. |
| `src/lib/workers/sync-campaign-universe.ts` | Row 15: `upsertOuAssignments` → `assignOuPlacements` (one `placements.assign` per campaign+unit, `universe` / `skip`, worker ids in `OU_CHUNK`s); `matchingOusForWorker` appends the matched member's group container (D60); `OuPlacementTarget.ouGroupId?`; `loadOuTargets` exported and paged (`PAGE_SIZE`, D61); `SyncWorkersResult` / `SyncCampaignUniverseResult` gain `ouAssignmentsSkipped` (D62). No `assignment_source` string and no `campaign_worker_ou` reference remain in the file. |
| `src/app/api/campaign-import/apply/route.ts` | Row 16: one `units.create` for containers + members with `client_ref`s (D65); one `placements.assign` per unit (`manual`, primary, `skip`) with the row-by-row retry; `OU structure: …` error string. |
| `src/app/api/campaigns/[id]/add-workers/route.ts` | Row 17: `units.create` (with the legacy `display_order` read kept); `placements.assign(skip)`; `ou_assignments_skipped` in the response; status through `structureErrorStatus` (D66, D69). |
| `src/app/api/campaigns/[id]/create-worker/route.ts` | Row 18: `placements.assign(skip)` in `finishAttach`; the container refusal and the `stampEmployerWorksiteFromOu` / sync calls unchanged. |
| `src/app/api/campaigns/[id]/workers/duplicates/route.ts` | Row 19: `placements.unassign({ campaignId, workerIds: [workerId] })` in `removeFromCampaign`; the units pre-read is gone; the `catch` maps a `StructureApiError` (D67). |
| `src/app/api/worker-import/organising-units/route.ts` | Row 20: `units.create`; `ou` echoed from the RPC id + the request (D68). |
| `src/app/api/worker-import/apply/route.ts` | Row 21: `maybeAssignWorkerToOu` → `placements.assign(skip)`; row errors through `structureErrorMessage`. |
| `src/lib/campaign/structure-error-message.ts` | `structureErrorStatus` (D69). |
| `src/lib/campaign/structure-save.ts` | A4: `saveUnitDrafts` throws on the read error (D70); `savePlacements` read paged (D71); `ReadChain.range`. |
| `src/components/campaigns/workforce/workforce-bulk-toolbar.tsx`, **new** `workforce/allocate-toast-message.ts` | The skipped count in the toast (D73). |
| `src/types/organising-row-types.ts` | Four legacy split-RPC types deleted (D74). |
| `src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` | `REMAINING_DIRECT_WRITERS = []`; case 2 renamed "no direct writers remain (acceptance criterion)"; doc comment. |
| `src/lib/campaign/__tests__/fake-structure-client.ts` | D75. |
| **new** `src/lib/campaign/__tests__/recompute-ou-assignments.test.ts` | 6 tests (D64). |
| `src/lib/workers/__tests__/sync-campaign-universe.test.ts` | +8 tests: container parent (3), paging (2), the exact per-unit assign calls of both sync entry points, the refused-assign path. |
| `src/lib/campaign/__tests__/structure-save.test.ts` | A4 test replaced; the paged-read ops; +1 paging test (2,500 rows). |
| `src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx` | The placement read's ops assertion gains `order.order.range`. |
| **new** `src/components/campaigns/workforce/__tests__/allocate-toast-message.test.ts` | 3 tests. |
| `docs/organiser-ux-review/wp/wp2.2.md` | §3.11 ticks, §7, §8.2 outcomes, §8.3 D60–D76, this section. |

**Per row — wrapper call, `source` and `onConflict`:**

| Row | Wrapper call and mapping |
|---|---|
| 14 | `placements.replaceRuleRows({ campaignId, rows: [{ ou_id, worker_id, assigned_rule_id }] })` → `p_rows` = the full desired set (attribution D63), once per campaign; `rows: []` when there are rules on no non-container unit; no call when the campaign has no members. |
| 15 (`syncWorkersToMatchingCampaigns`, `syncCampaignUniverseFromEmployersWorksites`) | per campaign + unit, in first-seen order: `placements.assign({ campaignId, ouId, workerIds (≤ 200 per call), source: "universe", isPrimary: false, onConflict: "skip" })` → `p_source: "universe", p_is_primary: false, p_on_conflict: "skip"`; targets = the matched units **and** each matched member's group container (D60). Membership upsert first, as before. |
| 15a | no change; the route returns `{ success: true, workersAdded, ouAssignmentsUpserted, ouAssignmentsSkipped }`. |
| 16 | `units.create({ campaignId, units: [ …containers { client_ref: "container:<ek>", ou_type: "employer", name, is_group_container: true, source: "manual", unit_basis: { employer_id } \| null }, …members { client_ref: "unit:<i>", ou_type: "worksite", name, parent_ou_id: <id \| container ref>, ou_group_id: <same>, is_group_container: false, source: "manual", unit_basis } ] })`; then per unit `placements.assign({ campaignId, ouId, workerIds (≤ 200), source: "manual", isPrimary: true, onConflict: "skip" })`, row-by-row on a refused batch. |
| 17 | `units.create({ campaignId, units: [{ name, ou_type, display_order: nextOrder, source: "manual" }] })`; `placements.assign({ campaignId, ouId: targetOuId, workerIds: body.worker_ids, source: "manual", isPrimary: false, onConflict: "skip" })`. |
| 18 | `placements.assign({ campaignId, ouId: body.ou_id, workerIds: [workerId], source: "manual", isPrimary: false, onConflict: "skip" })`. |
| 19 | `placements.unassign({ campaignId, workerIds: [workerId] })` → `p_ou_id: null, p_within_group_id: null` (every placement of the worker in this campaign), then the membership delete and the call-list scrub as before. |
| 20 | `units.create({ campaignId: body.campaignId, units: [{ name, ou_type: body.ouType, is_group_container: false, source: "manual" }] })`. |
| 21 | `placements.assign({ campaignId, ouId: row.ouId, workerIds: [workerId], source: "manual", isPrimary: false, onConflict: "skip" })` per row, after the membership upsert. |

**`onConflict` / `source` per caller:** rows 15 / 15a → `universe` + `skip` (R1; sync-on-open is idempotent
and never duplicates); rows 16, 17, 18, 21 → `manual` + `skip` (the legacy `ignoreDuplicates`, D65–D66);
row 14 → the RPC's own `rule` + skip semantics; row 19 is an unassign.

**Error surfaces:** rows 17, 18, 20 → `{ success: false, error }` with `structureErrorStatus` (D69); row 19 →
`errorResponse` with the mapped status (D67); rows 16 and 21 → their per-item `errors[]` strings through
`structureErrorMessage`; row 14 → the units section's existing `onError` message; row 15 → the callers'
existing toasts / the route's 500.

**Raw command output** (this session, after every change):

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError|no-direct-structure-writes|recompute-ou|sync-campaign-universe|structure-save|allocate-toast|campaign-save-flows"
 ✓ src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx (14 tests) 2402ms
 ✓ src/lib/campaign/__tests__/structure-save.test.ts (28 tests) 50ms
 ✓ src/lib/workers/__tests__/sync-campaign-universe.test.ts (45 tests) 51ms
 ✓ src/lib/campaign/__tests__/recompute-ou-assignments.test.ts (6 tests) 14ms
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 144ms
 ✓ src/components/campaigns/workforce/__tests__/allocate-toast-message.test.ts (3 tests) 4ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 27662ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8740.125732 to be less than 6000
 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1365 passed (1366)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=1]

$ pnpm --filter organising-db exec eslint src/lib/campaign/recompute-ou-assignments.ts src/lib/workers/sync-campaign-universe.ts src/app/api/campaign-import/apply/route.ts "src/app/api/campaigns/[id]/add-workers/route.ts" "src/app/api/campaigns/[id]/create-worker/route.ts" "src/app/api/campaigns/[id]/workers/duplicates/route.ts" src/app/api/worker-import/organising-units/route.ts src/app/api/worker-import/apply/route.ts src/lib/campaign/structure-save.ts src/lib/campaign/structure-error-message.ts src/components/campaigns/workforce/workforce-bulk-toolbar.tsx src/components/campaigns/workforce/allocate-toast-message.ts src/types/organising-row-types.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/__tests__/fake-structure-client.ts src/lib/campaign/__tests__/structure-save.test.ts src/lib/campaign/__tests__/recompute-ou-assignments.test.ts src/lib/workers/__tests__/sync-campaign-universe.test.ts src/components/campaigns/workforce/__tests__/allocate-toast-message.test.ts src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx
/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaign-import/apply/route.ts
  415:27  warning  '_e164' is assigned a value but never used     @typescript-eslint/no-unused-vars
  415:54  warning  '_consent' is assigned a value but never used  @typescript-eslint/no-unused-vars

/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
  47:1   warning  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-explicit-any')
  49:13  error    Unexpected any. Specify a different type                                                               @typescript-eslint/no-explicit-any

✖ 4 problems (1 error, 3 warnings)
[exit=1]
  [all four on lines Stage 6 did not touch — HEAD :413 and :45–47, shifted by the two new import lines; D76]

$ git diff -U0 HEAD -- src/app/api/campaigns/[id]/create-worker/route.ts | grep '^@@'
@@ -4,0 +5,2 @@ import { toE164 } from "@/lib/phone/normalise-phone";
@@ -284,13 +286,12 @@ export async function POST(
@@ -300 +301 @@ export async function POST(
@@ -302 +303 @@ export async function POST(

$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ rg -n --pcre2 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]\)(\s*as\s+never)?\s*\.\s*(insert|update|upsert|delete)\(" apps/organising-db/src --glob '!**/__tests__/**' ; echo "exit=$? (1 = no matches = pass)"
exit=1 (1 = no matches = pass)

$ cd apps/organising-db && rg -c "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]" src --glob '!**/__tests__/**' --glob '!**/__contract__/**' | awk -F: '{s+=$2} END {print s}'
48
$ rg -n -A1 "\.from\(['\"]campaign_(organising_units|worker_ou)['\"]" src --glob '!**/__tests__/**' --glob '!**/__contract__/**' | paste - - | grep -v "\.select("
src/components/campaigns/campaign-settings.tsx:180: .from("campaign_organising_units") => -181- // D56: the hierarchy columns too, as the wizard hydrates them, so a
  [the one chain whose next line is not `.select(` is a comment; its `.select(` follows it — every one of the 48 is a read]

$ git status --short
 M apps/organising-db/src/app/api/campaign-import/apply/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/add-workers/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/create-worker/route.ts
 M apps/organising-db/src/app/api/campaigns/[id]/workers/duplicates/route.ts
 M apps/organising-db/src/app/api/worker-import/apply/route.ts
 M apps/organising-db/src/app/api/worker-import/organising-units/route.ts
 M apps/organising-db/src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx
 M apps/organising-db/src/components/campaigns/workforce/workforce-bulk-toolbar.tsx
 M apps/organising-db/src/lib/campaign/__tests__/fake-structure-client.ts
 M apps/organising-db/src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 M apps/organising-db/src/lib/campaign/__tests__/structure-save.test.ts
 M apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts
 M apps/organising-db/src/lib/campaign/structure-error-message.ts
 M apps/organising-db/src/lib/campaign/structure-save.ts
 M apps/organising-db/src/lib/workers/__tests__/sync-campaign-universe.test.ts
 M apps/organising-db/src/lib/workers/sync-campaign-universe.ts
 M apps/organising-db/src/types/organising-row-types.ts
 M docs/organiser-ux-review/wp/wp2.2.md
?? apps/organising-db/src/components/campaigns/workforce/__tests__/
?? apps/organising-db/src/components/campaigns/workforce/allocate-toast-message.ts
?? apps/organising-db/src/lib/campaign/__tests__/recompute-ou-assignments.test.ts

$ git diff --stat   (before the plan-file edit)
 .../src/app/api/campaign-import/apply/route.ts     | 163 +++++++++-------
 .../app/api/campaigns/[id]/add-workers/route.ts    |  73 ++++---
 .../app/api/campaigns/[id]/create-worker/route.ts  |  31 +--
 .../api/campaigns/[id]/workers/duplicates/route.ts |  27 +--
 .../src/app/api/worker-import/apply/route.ts       |  23 ++-
 .../api/worker-import/organising-units/route.ts    |  36 ++--
 .../campaign-save-flows.structure-writes.test.tsx  |   4 +
 .../campaigns/workforce/workforce-bulk-toolbar.tsx |   3 +-
 .../campaign/__tests__/fake-structure-client.ts    |  35 +++-
 .../__tests__/no-direct-structure-writes.test.ts   |  36 ++--
 .../lib/campaign/__tests__/structure-save.test.ts  |  47 ++++-
 .../src/lib/campaign/recompute-ou-assignments.ts   | 119 ++++++------
 .../src/lib/campaign/structure-error-message.ts    |  23 +++
 .../src/lib/campaign/structure-save.ts             |  38 +++-
 .../__tests__/sync-campaign-universe.test.ts       | 213 +++++++++++++++++++++
 .../src/lib/workers/sync-campaign-universe.ts      | 191 +++++++++++++-----
 .../src/types/organising-row-types.ts              |  26 ---
 17 files changed, 759 insertions(+), 329 deletions(-)
```

**The 48 remaining `.from("campaign_organising_units" | "campaign_worker_ou")` sites, all reads** (each chain
continues with `.select(`; the §5 write regex matches none):

| Where | Why it is a read |
|---|---|
| `lib/workers/sync-campaign-universe.ts:300` | `loadOuTargets` — the paged unit read (D61). |
| `lib/campaign/structure-save.ts:425, :525` | the scope reads of `saveUnitDrafts` / `savePlacements` (D70, D71). |
| `lib/campaign/recompute-ou-assignments.ts:233` | the units read that finds containers (D63 c). |
| `lib/campaign/generate-ou-candidates.ts:57` | candidate generation reads existing units. |
| `lib/hooks/usePlannerOptions.ts:293`, `useAssessmentDistributions.ts:74, :91`, `useCampaignListStats.ts:221, :239`, `useCampaignsAllStats.ts:165, :181`, `useCampaignCurrentStats.ts:140, :156` | dashboard / list statistics queries. |
| `app/api/campaigns/[id]/push-list/route.ts:151`, `list-builder/route.ts:249`, `activists/export/route.ts:106` | list building and export read placements. |
| `app/api/campaigns/[id]/add-workers/route.ts:123, :138` | row 17's unit lookup and the `display_order` read kept for `units.create`. |
| `app/api/campaigns/[id]/create-worker/route.ts:225` | row 18's unit / container lookup. |
| `app/api/campaign-import/apply/route.ts:503, :597` | row 16's existing-container and existing-member dedup reads. |
| `app/api/worker-import/apply/route.ts:386` | row 21's `unit_basis` prefetch for the employer/worksite stamp. |
| `components/campaigns/campaign-wizard.tsx:272, :279`, `campaign-settings.tsx:180, :190` | the scope hydration reads (rows 10–11). |
| `components/campaigns/campaign-worker-detail-provider.tsx:76`, `campaign-worker-assignment-picker.tsx:184, :200`, `workforce/workforce-list-view.tsx:198`, `campaign-list-builder.tsx:209`, `campaign-units-section.tsx:291, :309`, `campaign-workplan.tsx:202`, `add-workers-client.tsx:178`, `activists/woc-meeting-dialog.tsx:212`, `activists/use-woc-data.ts:43` | screen data loads (`useQuery` reads). |
| `components/campaigns/wall-chart/create-organising-unit-dialog.tsx:209`, `normalize-members.ts:148`, `move-worker-mutation.ts:138`, `leader-unit-context.ts:51, :69`, `hooks/use-wall-chart-structure.ts:57` | wall-chart reads (the `move-worker-mutation` one is the post-move `unit_basis` read for the stamp helper). |
| `components/import/worker-import-wizard.tsx:677`, `components/workers/WorkerChatCard.tsx:345, :363`, `components/email/inbox/EmailContextSidebar.tsx:138` | import wizard unit list; worker card and inbox context reads. |

Reading: `tsc` clean; 1,366 tests (was 1,348 in §11.14; +18), 1,365 passing — the only failure is the
pre-existing render-cost timing test `wall-chart.render-cost.test.tsx > CampaignWallChart render cost >
renders 305 members across 161 units within budget` (8.7 s against a 6 s budget on this box; it was the same
failure in §11.8, §11.12–§11.14); guard cases 1–3 all pass, case 2 with an empty inventory; eslint on the
changed files reports only the four pre-existing findings on untouched lines (D76); lint total 294 = baseline;
the §5 acceptance `rg` finds nothing; 48 read sites remain and each is a `.select(`; `supabase/.temp/*`
untouched; no commit.

**Open questions for the orchestrator** (none blocks the PR):

1. D63 (a) — `assigned_rule_id` attribution on Recompute rows (first matching include rule, else the unit's first
   rule). Confirm, or ask for NULL as the legacy insert wrote (which would make R1-b's relabel pick up fresh
   Recompute rows).
2. ~~D63 (b) — a campaign with no members still writes nothing on Recompute.~~ **Decided (fix round 1, A8): kept** —
   a no-write user pressing Recompute on an empty campaign would otherwise get 42501 where nothing happened before.
3. ~~D65 (c) — no 200-element chunking.~~ **Decided (fix round 1, A9): no chunking.**
4. D62 / D66 — the `ouAssignmentsUpserted` and `ou_assignments_count` counts now mean "inserted", not "sent";
   the new `*Skipped` keys carry the difference. No caller displays them today.
5. D72 — A5 stays with WP2.4.
6. The e2e spec (§4.5) is unchanged by Stage 6 and still has not run; the sync-on-open path (row 15a) now
   writes `universe` rows with `skip`, which is what §4.5 item 3 expects.

Stage 6 stops here; the working tree is left uncommitted for the orchestrator.

### 11.16 Stage 6 fix round 1 (2026-09-14)

The fresh reviewer approved Stage 6 with advisories (A1–A12; review saved in the session scratchpad). Same
constraints as Stage 6: no database, CLI, Playwright, commit or migration change; edits under
`apps/organising-db/src/` and this file only. A7–A9 and A12 are decisions recorded in D63 / D65 / D72 (open
questions 1–3 of §11.15 closed); A11 is an operator note for G1 (run `10_materialise_employer_placements.sql`
promptly after the deploy; the §4.5 e2e is still the only check that the chart renders a container placement).

| Advisory | Change | Test |
|---|---|---|
| A2 — unordered rules read | `recompute-ou-assignments.ts`: `.order("rule_id", { ascending: true })` on the `campaign_unit_rules` read, and the rows sorted by `rule_id` client-side as well (so the fake-backed test is honest and the order does not depend on the server). The `scoped` read type gains `order`. D63. | `recompute-ou-assignments.test.ts` +1: rules arriving out of order → the read's ops are `select.eq.order` with `["rule_id", { ascending: true }]`, and `p_rows` is `[unit 10 / rule 2, unit 20 / rule 9]`. The first test's trace gains `.order`. |
| A3 — blank name sinks the structure call | `campaign-import/apply/route.ts`: container name `((canonicalName ?? ek).trim() \|\| ek).slice(0, 200)`; unit name `(… .trim() \|\| "Unit").slice(0, 200)`; the elements array is built once (`structureElements`) and a 22023 naming `p_units[n]` is reported as `OU structure ("<element name>"): …` (`isStructureApiError` imported). D65. | No route test (none exists for this route); `tsc` + eslint. |
| A4 — raw PostgREST object thrown | `structure-save.ts` `saveUnitDrafts`: `throw new Error(error.message)`. D70. | `structure-save.test.ts`: the A4 test now asserts `toBeInstanceOf(Error)` with the message. |
| A1 — order-dependent Employer container | `sync-campaign-universe.ts` `matchingOusForWorker`: after the specificity filter only the first candidate per partition key (campaign + future group) is kept, in input order; the container appended is then always the kept child's. D60. | `sync-campaign-universe.test.ts` +1: X under A and Y under B both match → `[3, 1]`; reversed input → `[5, 2]`. Two pre-existing expectations follow the rule: `[20, 21]` → `[20]` (and `[21]` for the reversed input), `[22, 23, 25]` → `[22, 23]`; renamed to say why. |
| A5 — raw SQL text in three `onError`s | `campaign-settings.tsx` (save employers/worksites) and `campaign-universe-section.tsx` (add employer, add worksite): `structureErrorMessage(e, <the existing fallback>)`; the section imports it. | Covered by the D28 sentence tests of the helper; no mounted test for these three handlers. |
| A6 — Recompute message ignores `skipped` | `campaign-units-section.tsx`: `N worker(s) already placed in another unit of the same group.` appended to the assigned sentence when `skipped > 0`, or shown alone when `inserted === 0 && skipped > 0`; "No campaign workers matched the current rules." only when both are 0. D63. | Not mounted (the section's harness would need the recompute's five reads seeded); wording only. |
| A10 — deviation completeness | D63: the RPC's rule-row clearing spans containers (legacy: non-container units only). D65: `display_order` is now `max + 1 + idx` (legacy: the column default 0). | — |
| A7 / A8 / A9 | Recorded as decided in D63 (exclude-rule attribution kept; R1-b to be run once before or with the deploy; no-members early return kept) and D65 (no chunking); §11.15 open questions 2 and 3 struck through. | — |

**Raw command output** (this session, after the fix-round changes):

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ cd apps/organising-db && pnpm exec vitest run src/lib/campaign/__tests__/recompute-ou-assignments.test.ts src/lib/workers/__tests__/sync-campaign-universe.test.ts src/lib/campaign/__tests__/structure-save.test.ts src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx
 ✓ src/lib/campaign/__tests__/recompute-ou-assignments.test.ts (7 tests) 22ms
 ✓ src/lib/workers/__tests__/sync-campaign-universe.test.ts (46 tests) 27ms
 ✓ src/lib/campaign/__tests__/structure-save.test.ts (28 tests) 47ms
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 162ms
 ✓ src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx (14 tests) 2053ms
 ✓ src/components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx (18 tests) 6386ms
 Test Files  6 passed (6)
      Tests  116 passed (116)

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError"
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 28079ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8190.517897999998 to be less than 6000
 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1367 passed (1368)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=1]

$ pnpm --filter organising-db exec eslint src/lib/campaign/recompute-ou-assignments.ts src/lib/workers/sync-campaign-universe.ts src/app/api/campaign-import/apply/route.ts src/lib/campaign/structure-save.ts src/components/campaigns/campaign-settings.tsx src/components/campaigns/campaign-universe-section.tsx src/components/campaigns/campaign-units-section.tsx src/lib/campaign/__tests__/recompute-ou-assignments.test.ts src/lib/workers/__tests__/sync-campaign-universe.test.ts src/lib/campaign/__tests__/structure-save.test.ts
/home/user/OffshoreAlliance/apps/organising-db/src/app/api/campaign-import/apply/route.ts
  415:27  warning  '_e164' is assigned a value but never used     @typescript-eslint/no-unused-vars
  415:54  warning  '_consent' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (0 errors, 2 warnings)
[exit=0]
  [the two pre-existing D76 warnings on an untouched line]

$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)

$ guard test (in the touched-files run above)
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 162ms
```

Reading: `tsc` clean; 1,368 tests (+2 since §11.15), 1,367 passing — the only failure is the pre-existing
render-cost timing test; guard cases 1–3 green with an empty inventory; eslint on the fix-round files reports
only the two pre-existing D76 warnings; lint total 294 = baseline. Stage 6 fix round 1 stops here; the working
tree is left uncommitted for the orchestrator.

### 11.17 Stage 7 fix round 1 (2026-09-14)

The whole-PR fresh review (Stage 7, round 1; review saved in the session scratchpad) approved with
advisories A1–A8. This round takes A1, A2, A6 and A7 in code / README, and records A3, A4, A5 and A8 as §8.2
rows carried to WP2.4. Same constraints as Stages 6: no database, CLI, Playwright, commit or migration
change; edits under `apps/organising-db/` (`src/` and `tests/e2e/`), `scripts/data-hygiene/oux-wp2.2/README.md`
and this file only.

| Advisory | Change | Test |
|---|---|---|
| A1 — hydration reads unpaged (D71 inverted the §8.2 rationale) | `campaign-settings.tsx` and `campaign-wizard.tsx`: the `campaign_worker_membership` and `campaign_worker_ou` scope reads go through `fetchAllRows` with `.order("worker_id")` / `.order("ou_id").order("worker_id")` and `.range(from, to)`; the two `cw2.error` / `cwo.error` branches are gone (the helper throws). Harness `range()` slices. §8.2 row corrected. D77. | `campaign-save-flows.structure-writes.test.tsx` +1 (mounted settings, 2,500 placement rows): the three ordered `range` triples on `campaign_worker_ou`, the one on `campaign_worker_membership`, no RPC. All 15 pass; the Stage 4/5 wall-chart suites re-run green under the slicing `range()` (152/153, the one failure the render-cost timing test). |
| A2 — e2e test 2 whole-set equality races the un-intercepted post-drop sync | `tests/e2e/structure-api.spec.ts`: header sentence; test 2's `after` and test 1's `inGroup` exclude `assignment_source === "universe"`. D78. | Not run; `tsc` covers the spec (exit 0). |
| A6 — `restoreWorker`'s REST insert can collide under 2.2b | Same file: same-group rows of the worker are deleted via REST before either restore branch; a 409 on the rule-row insert is logged and noted, not thrown. D78. | As above. |
| A7 — `supabase/.temp/project-ref` names production | `scripts/data-hygiene/oux-wp2.2/README.md` production section: "Never run `supabase db push` from this checkout …" paragraph; §8.2 operator note for G1. | — |
| A3 / A4 / A5 / A8 | §8.2 row "Stage 7 advisories carried to WP2.4" (A4 recorded next to D22(e) by reference). | — |

**Raw command output** (this session, after the changes):

```
$ pnpm --filter organising-db exec tsc --noEmit
[exit=0]

$ cd apps/organising-db && pnpm exec vitest run src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx src/components/campaigns/wall-chart/__tests__ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts
 ✓ src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx (15 tests) 2156ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.nested-scope-wiring.test.tsx (3 tests) 397ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.nested-scopes.test.tsx (5 tests) 4329ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.interaction.test.tsx (21 tests) 11337ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.structure-writes.test.tsx (46 tests) 13218ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.harness-cleanup.test.tsx (2 tests) 1619ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart-model.test.ts (24 tests) 11ms
 ✓ src/components/campaigns/wall-chart/__tests__/filters.test.ts (25 tests) 8ms
 ✓ src/lib/campaign/__tests__/no-direct-structure-writes.test.ts (3 tests) 178ms
 ✓ src/components/campaigns/wall-chart/__tests__/wall-chart.characterization.test.tsx (8 tests) 5089ms
 ❯ src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx (1 test | 1 failed) 25908ms
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 25907ms
 Test Files  1 failed | 10 passed (11)
      Tests  1 failed | 152 passed (153)

$ pnpm --filter organising-db test 2>&1 | grep -E "Test Files|Tests |×|FAIL|AssertionError"
   × CampaignWallChart render cost > renders 305 members across 161 units within budget 29113ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/campaigns/wall-chart/__tests__/wall-chart.render-cost.test.tsx > CampaignWallChart render cost > renders 305 members across 161 units within budget
AssertionError: expected 8862.486469 to be less than 6000
 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1368 passed (1369)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  organising-db@0.1.0 test: `vitest run`
[exit=1]

$ pnpm --filter organising-db exec eslint src/components/campaigns/campaign-settings.tsx src/components/campaigns/campaign-wizard.tsx src/components/campaigns/wall-chart/__tests__/harness/backend.ts src/components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx tests/e2e/structure-api.spec.ts
[exit=0]   (no findings)

$ pnpm --filter organising-db lint 2>&1 | grep -F problems | tail -1
✖ 294 problems (143 errors, 151 warnings)
```

Reading: `tsc` clean (the e2e spec included); 1,369 tests (+1), 1,368 passing — the only failure is the
pre-existing render-cost timing test; the guard is green with an empty inventory; eslint reports nothing on
the changed files; lint total 294 = baseline. Stage 7 fix round 1 stops here; the working tree is left
uncommitted for the orchestrator.
