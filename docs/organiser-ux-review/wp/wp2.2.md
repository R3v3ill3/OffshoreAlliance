# WP2.2 — Structure API (transactional RPCs) and the end of direct client writes

Status: **approved 2026-09-13 (R1, M2-a, K1, G1; §0 sequence clarified). Implementation not started.**
Written 2026-09-13 against `develop` at `1666660` (main `5fe7c93`). Depends on WP2.1 (code merged via
PR #39 `de338b5` / #40 `82ff71c`; **schema not applied to production or normal dev**).

Branch (not yet created): `feat/oux-wp2.2-structure-api` off `develop`; draft PR into `develop`.

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

Today: WP2.1's migration is on the clone only. Neither dev `dpnnmkhabysfdogllsyh` nor production
`gteygwfgjvczanmrwgbr` has `campaign_groups` / `group_id`. WP2.1 **code** is already live on `main`.

| Step | Database | Who | What | Why |
|---|---|---|---|---|
| 1 | **Production** | operator (Track B) | Apply WP2.1 now, using the runbook already rehearsed on the clone: `00_preflight` → `03a`/`03b` only if the preflight says so → migration (`supabase db push` or `psql -1`) → `04_postflight`. | Code is already on `main`; PITR (7 days) is the safety margin; this also ends the `generated.ts` regen divergence (§2.7). Does not wait for WP2.2. |
| 2 | **Dev** | operator | `supabase db push` of the WP2.1 migration. Nothing else. | Previews and contract tests connect to dev. |
| 3 | — | implementer | Build WP2.2: code + two new migrations (2.2a additive RPCs, 2.2b enforcement) + two small scripts (§3.7 materialisation, §3.8 relabel). | — |
| 4 | **Dev** | operator | `supabase db push` of 2.2a when Stage 1 is ready. | Contract tests (§4.2) and preview e2e (§4.5) need the RPCs. |
| 5 | **Clone** (optional, recommended) | operator links, implementer runs approved commands | One pass of the **new** SQL only: 2.2a forward/rollback/forward, `10_materialise…`, `20_relabel…`, 2.2b forward/rollback/forward (§4.4). | These files have never run anywhere; this is what caught the deferred-FK bug in WP2.1. It is not a re-test of WP2.1. With PITR in place the operator may skip it. |
| 6 | **Production** | operator (Track B) | In this order: 2.2a → merge `develop → main` (WP2.2 code) → `10_materialise…` and `20_relabel…` (with `SET LOCAL oux.env = 'production';`) → `00_preflight` once more → `03b` only if it reports duplicates → 2.2b → `04_postflight`. | 2.2a is compatible with the old writers, so it can go first; the code needs 2.2a, so it goes second (G1, §6.4); 2.2b adds the unique index and would fail if any duplicate placements appeared between steps 1 and 6, hence the single preflight re-check. |

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
| **C-b** | Move onto a unit displaces the worker's existing placement in the **target's** group (whatever unit it is on) and removes the source placement. | `structure_placements_move`. |
| **C-c** | Copy (keep source) is allowed only across groups. **K1 (recommended):** same-group copy raises `23505 duplicate_in_group` and the UI shows "already in this group — use Move". **K2:** silently convert to move. K1 is the E2 handoff's stated semantics ("copy_worker_placement (cross-group only)"). | `structure_placements_move` with `p_keep_source`. |
| **C-d** | Dropping on a group's Unassigned removes only that group's placement; the legacy global Unassigned removes all. | `p_within_group_id` vs null. |
| **C-e** | Legacy containers accept placements only when they carry a `group_id` (Employer-group units after WP2.1). Custom-kind containers (`group_id IS NULL`) still reject. | `check_no_worker_on_group_container()` relaxed in WP2.2a (§3.6) + RPC `P0001`. |
| **C-f** | Unassigned is derived, never stored; no RPC creates such a row or unit. | Code review + contract test asserting no unit named "Unassigned" is ever created by any RPC. |
| **C-g** | Fixed-kind units get their group from `ou_type` (trigger); callers cannot choose it. Custom units may be pinned to a custom group. | `structure_units_create` / `_split` argument validation. |
| **C-h** | `is_primary` is campaign-wide single-valued (today's semantics). RPCs never leave two primaries or zero primaries when a worker still has placements. | `_assign`, `_move`, `_merge`, `_delete`, `_set_primary`. |
| **C-i** | Every id argument must belong to `p_campaign_id`. | `22023` pre-check. |
| **C-j** | Merge requires all units in one group; the survivor cannot be a source. | `structure_unit_merge`. |
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

Programme rule: one commit per completed unit; feature branch off `develop`. Proposed units = Stage 1,
Stage 3, Stage 4, Stage 5, Stage 6, Stage 7 (six commits, squash-merged by the PR as with #38/#39).
Every git command is put to the operator individually before it runs. `supabase/.temp/*` is never staged.

### 6.3 PR

Draft PR `feat/oux-wp2.2-structure-api → develop`, titled `feat(oux-wp2.2): transactional structure API
and enforcement migration`. Body: this plan's §3 summary, the writer table with ticks, the evidence matrix,
and the explicit **G1** notice.

### 6.4 G1 — promotion gate (binding)

Unlike WP2.1, WP2.2 code **requires** the schema: every structure write becomes an RPC call, so a
production deploy without WP2.1 + WP2.2a would fail every move/create/delete with `PGRST202`. Therefore:

1. `develop` may carry WP2.2 (its previews use normal dev, which has the schema after §0 steps 2 and 4).
2. **No `develop → main` PR is opened until the operator confirms WP2.1 and WP2.2a are applied to
   production** (Track B; rehearsed `supabase db push` or `psql -1`; never autocommit `psql -f`).
3. Production order after that: promote code → verify wall-chart writes on production (operator, UI only) →
   operator runs `10_materialise…` (M2-a) and `20_relabel…` (R1-b if approved) with `SET LOCAL oux.env =
   'production';` → `00_preflight_hazards` → `03b` if H9 > 0 → WP2.2b → `04_postflight`.
4. Only after step 3 completes on production may WP2.4 consume `campaign_group_membership`.
5. Side effect: with WP2.1 + WP2.2a on production before the promotion, `gen-types.yml` will regenerate
   **with** the symbols, ending the develop/main `generated.ts` divergence. (The RPC `Functions` entries
   still are not consumed by code — §2.7.)

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
| Regen strips symbols again on promotion | G1 step 5; wrapper never uses generated `Functions`. |
| Lint total creep from 21 touched files | touched lines clean; each stage records the total. |

### 8.3 Deviations from plan (implementer keeps)

_None yet._

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
| **G1** | Promotion gate: no `develop → main` until production has WP2.1 + WP2.2a | required (not optional) |
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

_pending_

### 9.3 Reviewer findings and resolution

_pending_

## 10. Revision history

- **Revision 2** (2026-09-13): §0 rewritten as a plain six-step table after operator feedback; approvals
  recorded in §9.1 (R1, M2-a, K1, G1).
- **Revision 1** (2026-09-13): initial plan. Recommends S1 + S2, R1 (+R1-b), M2-a, K1, G1, separate
  contract config, C-k. Two migrations (2.2a additive/compatible, 2.2b enforcement). 15 public RPCs; 21
  writer files + split dialog switched; guard test as the automated acceptance check.
