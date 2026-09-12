# WP2.1 — Schema and migration (campaign groups)

**Revision 2** (2026-09-12). Revision 1 was rejected by the orchestrator; the mandatory amendments are
incorporated below and listed in §13.

**Operator-approved post-review matcher amendment** (2026-09-12): within each worker's
`(campaign_id, future-group-key)` partition, only eligible matches at maximum recognised-basis
specificity are selected. This narrow amendment follows the transactional clone STOP recorded in §14.5;
it does not alter E2, M2 or C1 and grants no approval beyond matcher/ranking alignment.

Status: **CLONE REHEARSAL COMPLETE/GREEN — NORMAL-DEV SCHEMA/E2E WAIVED FOR THIS SHIPMENT BY OPERATOR
2026-09-13.** Clone `yqjkuobcawvigsfpgrcm` is the production-shaped migration acceptance environment.
Normal dev is thin, noncritical and materially different; skipping it is an explicit verification gap,
not a pass. `groups_v2` is not yet introduced and no application consumer reads the new schema. Clone-generated
types and final local gates are complete; reviewer approved for PR/main with production DB gate. Evidence
commit and PR remain pending.
Production DB application remains operator-gated.

Branch: `feat/oux-wp2.1-schema-migration` off `develop` at `4d2ff4b` (WP2.3 PR #38 merged).
Planner: Fable. Implementer: GPT-5.6 high-risk implementer. Final reviewer verdict:
**APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**; documentation corrections A1–A3/A5 are incorporated here.

Authority order applied: workspace/user rules and the orchestrator brief → `HANDOFF.md` → `DECISIONS.md`
amendments → `PROGRESS.md` → `IMPLEMENTATION_ORCHESTRATION_PROMPT.md` → `ORGANISER_UX_REVIEW_AND_PLAN.md`
and appendices as amended.

### Decision labels used in this document (each label is unique; none is reused)

| Label | Choice | Recommendation |
|---|---|---|
| **E1 / E2** | Enforce `UNIQUE (worker_id, group_id)` in WP2.1 (E1) **vs** defer uniqueness enforcement and the `campaign_group_membership` view to WP2.2's enforcement migration (E2) | **E2** |
| **M1 / M2** | Materialise Employer-group placement rows in the WP2.1 backfill (M1) **vs** create the Employer group only and let WP2.2 materialise placements through the structure API (M2) | **M2** |
| **C1 / C2** | Canonicalise duplicate auto-fill bases non-destructively with an audited flag (C1) **vs** destructive unit merge (C2) | **C1** |
| **F1** | Apply the universe-sync matcher fix (all present basis keys match; honour `auto_match=false`; keep only maximum-specificity matches per campaign/future group) in WP2.1 | **required; specificity amendment approved** |

Environments: **clone** `yqjkuobcawvigsfpgrcm` = production-shaped migration rehearsal and accepted WP2.1
migration evidence environment (counts, checksums, H1–H10, cleanup and rollback are proven here).
**Normal dev** `dpnnmkhabysfdogllsyh` = thin/noncritical/different; its WP2.1 schema/e2e integration is
waived for this deadline shipment and may later be refreshed/replaced or migrated separately. **Production**
`gteygwfgjvczanmrwgbr` is entirely outside WP2.1 implementation and rehearsal; its ref is never used in an
agent command, script or executable SQL.

---

## 0. Specification (verbatim) and the decisions it consumes

> WP2.1 Schema and migration. High-risk implementer; Fable planner and reviewer. Implement plan section 6:
> campaign_groups, group_id on units and worker-unit rows with the trigger and unique index,
> campaign_group_membership view, user_campaign_prefs; the backfill following the mapping table in section 6
> (employer containers to an Employer group, their worksite children to a Worksite group, custom containers
> to named Custom groups, standalone units to a group per type); dependent views recreated in order.
> Acceptance: rehearsal on a production-seeded dev database shows membership counts unchanged, every leaf
> unit with a group_id, zero one-unit-per-group violations, hazard queries H1–H8 reproduced before and after,
> and a written rollback. Depends on decisions 3, 4 and 5; WP1.6 merged.

Decisions consumed (from `DECISIONS.md`):

- **Decision 3 (amended).** Group kinds are fixed: `worksite, employer, shift, crew, occupation, work_area,
  custom`. User-defined kinds are `custom` plus a free-text label; no open-ended CHECK. §2.1 decides that
  `name` suffices and no `kind_label` column is added, and states the WP2.7/WP3.1 display contract.
- **Decision 4.** Unassigned is derived, never materialised. 100 % Unassigned is normal and must scale.
- **Decision 5 (amended).** Employer and Worksite are independent, many-valued facets, never parent/child.
  A worker is in at most one unit per group per campaign; the same worker may be in many campaigns
  (operator reconfirmed 2026-09-11). No uniqueness on `worker_id` alone or on `campaign_id + worker_id`
  beyond what exists today.
- **Decision 8 (note).** `created_by` defaults to the creator (`auth.uid()`), NULL for service-role/psql.
  `campaign_groups.created_by` follows the same idiom.

Non-negotiables this plan honours: `groups_v2` is not introduced by WP2.1; full mode and every current writer keep working
**unchanged** until WP2.2/2.4/2.8; nothing in this WP retires `is_group_container`, `ou_group_id`,
`parent_ou_id` or any old writer; nothing touches production; no localStorage; no new campaign-creation
path; no application dev/start; normal-dev preview e2e is explicitly waived for this shipment.

### 0.1 Recorded deviation from the WP2.1 minimum acceptance (requires operator approval — decision E2)

The spec's "unique index" and "zero one-unit-per-group violations" clauses are delivered as follows under E2:

- The **unique index is not created in WP2.1.** A non-unique index on the same columns is created so the
  data is ready; the unique index, the duplicate-rejecting trigger check and the `campaign_group_membership`
  view are created by WP2.2's enforcement migration (§6.4) after the transactional structure API replaces
  the split/move/merge/copy client writers.
- "Zero violations" is **proven on the clone** by the cleanup (§3) and re-checked by the postflight
  (H9 = 0), and becomes a **hard precondition of WP2.2's enforcement migration**, not of WP2.1's migration.
- Reason (§1.4 D1): with the index installed, the current full-mode split RPC (children inserted before
  parent rows are removed; children of a custom-kind unit default to the parent's group), the move mutation
  (insert target before delete source) and the merge dialog (upsert survivor before delete source) all fail
  on same-group operations. "A readable error" is not "full mode keeps working". Patching those clients in a
  schema WP would widen scope into WP2.2's transactional API; deferring enforcement keeps every writer
  behaving exactly as today.
- "Rehearsal on a production-seeded dev database" is satisfied by the **clone** (production-shaped);
  normal dev is not production-seeded and its schema/e2e run is waived for this shipment.

If the operator prefers E1 instead, this plan does not cover it: E1 requires rewriting the split RPC and the
client writers first, which is WP2.2's scope; the planner would return a separate plan.

---

## 1. Current DDL and object inventory (item 1)

Citations are `B:<line>` into `supabase/migrations/20260908050000_baseline_schema.sql` unless another
migration is named. Everything below was confirmed live on the clone by the read-only queries in §1.3.

### 1.1 Tables and columns

| Object | Where defined | Notes relevant to WP2.1 |
|---|---|---|
| `campaign_organising_units` | B:9500–9525; comments B:9531–9547; sequence B:9551–9563; PK B:19036 | Columns (clone-confirmed order): `ou_id, campaign_id, ou_type, name, total_workers_estimated, source_metadata, anchor_worker_id, created_at, updated_at, commonality_logic, target_size, source, display_order, unit_basis, parent_ou_id, is_group_container, ou_group_id, user_rating`. `ou_type` CHECK of 11 values (B:9519): `shift, department, network, job_type, worksite, employer, ethnic_community, crew_rotation, accommodation, work_area, custom`. `ou_id`/`campaign_id` are `integer`. |
| FKs on units | B:23510 `anchor_worker_id` SET NULL; B:23515 `campaign_id` CASCADE; B:23520 `ou_group_id` NO ACTION; B:23525 `parent_ou_id` SET NULL | `ou_group_id` NO ACTION means a container with members cannot be deleted — relevant to §2.4 container→group provenance. |
| Indexes on units | B:20853 `idx_cou_campaign`; B:20857 `idx_cou_campaign_display_order`; B:20861 `idx_cou_ou_group` (partial); B:20865 `idx_cou_parent` | Clone-confirmed set: these four + PK. |
| Triggers on units | B:22381 `trg_campaign_organising_units_updated_at` → `update_updated_at()` (B:6735); B:22437 `trg_cou_enforce_group_consistency` → `cou_enforce_group_consistency()` (B:1626–1652); B:22441 `trg_cou_enforce_two_level_depth` → `cou_enforce_hierarchy_invariants()` (B:1658–1713, comment B:1717) | Clone-confirmed. The existing `updated_at` trigger remains enabled during the migration backfill. Its expected timestamp churn is measured separately from substantive unit integrity (§7.1, §8.3). |
| RLS on units | enable B:28294; SELECT policy `Authenticated users can read campaign_organising_units` B:26985; write policies `wp16_cou_insert/update/delete` from `20260909120000_wp1_6_campaign_write_policies.sql` lines 158–293 | Clone-confirmed: exactly `SELECT` + three `wp16_cou_*`. The baseline write policies at B:25553/25585/25959/26007/26331/26375 are gone. |
| Grants on units | B:31123–31125 ALL to `anon`, `authenticated`, `service_role` | Pre-existing `anon` grant is out of scope; **new objects must REVOKE from `anon`** because `ALTER DEFAULT PRIVILEGES` (B:33373–33396; clone-confirmed `pg_default_acl` shows `anon=arwdDxtm` for both `postgres` and `supabase_admin` owners) grants ALL to `anon` on every new table. |
| `campaign_worker_ou` | B:9636–9645; sequence B:10670–10682; UNIQUE `(ou_id, worker_id)` B:19161–19162; PK B:19166 | Columns: `id, ou_id, worker_id, is_primary, created_at, assignment_source, assigned_rule_id`. `assignment_source` CHECK `('manual','rule')`. No `updated_at`. |
| FKs on cwo | B:23805 `assigned_rule_id` SET NULL; B:23810 `ou_id` CASCADE; B:23815 `worker_id` CASCADE | Deleting a unit cascades its placements — the merge dialog relies on this (§3.7, why C2 is unsafe). |
| Indexes on cwo | B:20981 `idx_cwo_assignment_source`; B:20985 `idx_cwo_ou`; B:20989 `idx_cwo_worker` | Clone-confirmed: these three + PK + `campaign_worker_ou_ou_id_worker_id_key`. |
| Triggers on cwo | B:22417 `trg_check_no_worker_on_group_container` → B:1083–1102; B:22421 `trg_check_worker_ou_group_exclusivity` → B:1209–1247 | Both `BEFORE INSERT OR UPDATE OF ou_id`. Exclusivity = one *container* per `ou_type` per campaign; it does **not** stop two placements inside the same container or two standalone units of one type (that is H1/H3). |
| RLS on cwo | enable B:28377; SELECT policy B:27033; `wp16_cwo_insert/update/delete` (WP1.6 migration) | Clone-confirmed. cwo write policies are scoped by EXISTS join to the unit's campaign. |
| `campaign_unit_rules` | B:10407–10421; PK B:19116; FKs B:23710, B:23715 | `dimension_type` CHECK of 8 values. Clone: 2 current rules, campaigns 23 (ou 62) and 58 (ou 614). |
| `campaign_worker_membership` | B:7698 | Untouched by WP2.1 (count invariant). |
| `campaigns` | B:9651; PK `campaign_id` B:19177 | FK target for `campaign_groups.campaign_id` and `user_campaign_prefs.campaign_id`. |
| `workers` | PK `worker_id` B:20227 | Provides the *current dimension* (`employer_id`, `worksite_id`) used by the cleanup and by universe sync. |
| `user_profiles` | B:9887; `workspace_prefs` from `20260909100000_workspace_mode.sql` | Precedent for user-scoped prefs; `user_campaign_prefs` is per-campaign and separate by design (plan §6). |
| `_oux_hygiene_log` | `scripts/data-hygiene/oux-wp0.4/00_create_hygiene_log.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) | Present on the clone with rows `01=14, 02=21, 03=1` — the clone backup post-dates the production WP0.4 hygiene run. Reused by the WP2.1 cleanup (§3). |
| Generated types | `packages/db-types/generated.ts` | Generated successfully from migrated clone only with `SUPABASE_PROJECT_REF=yqjkuobcawvigsfpgrcm pnpm gen:types` (exit 0, 2026-09-13). Never run without an explicit safe ref; the script's default is production. |

### 1.2 Functions and views that read the two tables

Functions: `can_write_to_campaign` B:994; `get_user_role` B:3346; `check_no_worker_on_group_container`
B:1083; `check_worker_ou_group_exclusivity` B:1209; `cou_enforce_group_consistency` B:1626;
`cou_enforce_hierarchy_invariants` B:1658; `delete_campaign` (replaced by
`20260909130000_wp1_6_delete_campaign_standing_guard.sql`); `is_admin` B:3638; `merge_workers` B:4405;
`remap_worker_id` B:5355–5439 (generic — walks every unique index containing `worker_id`; when WP2.2 adds
the unique index it is handled automatically); `split_campaign_organising_unit` B:6147–6238 (comment
B:6244; inserts child rows with `ON CONFLICT (ou_id, worker_id) DO NOTHING`, children default to
`ou_type='custom'` and `unit_basis={parent_ou_id}`, parent rows are removed only when
`p_keep_in_parent=false` and only *after* the child inserts).

Views that depend on `campaign_organising_units` or `campaign_worker_ou` (clone-confirmed via `pg_depend`,
with their live `reloptions`):

| View | Baseline lines | `security_invoker` |
|---|---|---|
| `campaign_ou_coverage_summary` | B:9808–9838 | true |
| `campaign_unit_assignment_summary` | B:10331–10367 | true |
| `campaign_unit_hierarchy_summary` | B:10370–10404 | true |
| `campaign_worker_unit_membership_summary` | B:10763–10774 | true |
| `v_campaign_coverage_map` (→ `v_campaign_coverage_summary` B:15604–15621 depends on it, not on the tables directly) | B:15562–15601 | true |
| `v_campaign_foundational_readiness` | B:15624+ | true |
| `v_section_plan_workforce_mapping` | B:15851–15885 | `on` (same effect) |
| `v_woc_unit_representation` | B:15975–16010 | true |
| `vw_call_action_report` | ~B:16150–16216 | **none** (empty `reloptions`) |

`campaign_worker_rating_summary` (B:10699) and `v_campaign_activist_register` (B:15503) do not reference
either table.

**Pre-existing security advisories recorded for later review (not WP2.1 scope; nothing here changes them):**

- `vw_call_action_report` has no `security_invoker`, so it reads its base tables with the owner's rights.
- `split_campaign_organising_unit` is granted to `anon` in the baseline grant block and relies on invoker
  rights/RLS for protection. Left unchanged; WP2.2 replaces the split path and should revoke `anon` on the
  old RPC or retire it in WP2.8.

### 1.3 Clone confirmation (read-only, aggregates only)

Run 2026-09-12 via Supabase MCP `execute_sql` against `yqjkuobcawvigsfpgrcm` only. No names, contact or
free-text columns were selected; identifiers below are campaign/unit ids only.

- `PostgreSQL 17.6`; `supabase_migrations.schema_migrations` = exactly the nine repo versions
  `20260908050000 … 20260911100000`.
- `campaign_groups`, `user_campaign_prefs`, `campaign_group_membership`: absent.
- Counts: `campaign_worker_membership` 2,726; `campaign_worker_ou` 1,652; `campaign_organising_units` 239;
  campaigns 22 (14 with units, **8 with no units at all**).
- Shape per type (units / containers / with `parent_ou_id` / with `ou_group_id` / level-2 non-container
  parent): custom 18/2/7/7/0; employer 28/18/0/0/0; job_type 9/0/0/0/0; shift 5/0/0/0/0; work_area
  23/0/0/0/0; worksite 156/0/143/143/0. Parent→child pairs: employer→worksite 143, custom→custom 7. No
  `department`, `network`, `ethnic_community`, `accommodation`, `crew_rotation` units exist.
- Placement rows on container rows: **0**. Units that map to no group under §2.4 (custom-kind containers
  that *become* groups): **2**. Units carrying both `employer_id` and `worksite_id` in `unit_basis`: 124.
- Rule-source rows: 234, **all 234 with `assigned_rule_id IS NULL`**; by campaign 42=108, 64=55, 26=41,
  57=30. Rule-source rows sitting on a unit that has a current `campaign_unit_rules` row: **0** (so all 234
  are *unattributed*, §3.2 — not "orphaned"). Rule-source rows whose unit basis matches the worker's current
  employer or worksite under today's OR matcher: 230 of 234.
- Existing rows that do not match the worker's current dimension: manual 22, rule 1.
- **H9 (new, §3.2)** — `(campaign, future group, worker)` partitions with >1 unit: **10 partitions / 34
  excess rows**, campaigns 26, 42, 57, 64; by kind: worksite 3, employer 7. This equals H1 (2/26) + H3
  (8/8) here — no cross-container same-type duplicates exist on the clone.
- **H10 (new, §3.2)** — distinct `(campaign, future group, employer/worksite basis)` keys carried by more
  than one leaf unit: **13**, all `kind:worksite` in campaign 57, each shared by 2–3 units under the *same*
  employer container. 251 current campaign-57 members match one of these duplicate keys.
- Pre-amendment resolution preview of the 10 H9 partitions under the §3.5 decision order (AND dimension semantics,
  before canonicalisation): 8 resolve by unique current-dimension match; **2 unresolved** — one 2-row
  partition where both rows are unattributed rule-source rows matching nothing, and one 26-row partition
  (the H1 worker) where 3 rows match the current dimension because the three units share one H10 basis.
  After C1 canonicalisation the 26-row partition is expected to resolve by unique match; the 2-row partition
  needs an operator placement mapping.
- Custom-kind container names: no case-insensitive collisions within a campaign; none equal a reserved
  fixed/custom-type label.
- Universe-sync exposure: with today's OR matcher, **299 campaign-57 member/group partitions would be
  written into more than one Worksite-group unit (5,651 target rows)** on the next sync event for those
  workers; with AND semantics the residual is 249 partitions, all caused by the 13 H10 keys; with AND
  semantics plus C1 canonicalisation the original member-only preview expected zero. The exact live
  campaign-universe predicate later exposed 226 employer-fallback overlaps after C1. The approved
  maximum-specificity amendment suppresses those 226 fallback targets and leaves zero equal-maximum
  residuals in the read-only clone simulation (§14.5).

### 1.4 Design-changing drift found and how revision 2 resolves it

**D1 — Immediate uniqueness breaks real full-mode features.** `wall-chart/move-worker-mutation.ts:169–230`
inserts the target row before deleting the source; `merge-units-dialog.tsx:61–85` upserts into the survivor
before deleting the source unit; `split_campaign_organising_unit` (B:6147–6238) inserts child rows before
removing parent rows and defaults children to `ou_type='custom'`, so splitting a custom-kind unit with
keep-in-parent (the dialog default, `split-unit-dialog.tsx:120`) places the worker in two units of the same
group. Under `UNIQUE (worker_id, group_id)` all of these fail. **Resolution: E2** — WP2.1 populates
`group_id` and ships non-unique indexes; WP2.2 installs uniqueness after its transactional API replaces
those writers (§6.4). No client writer is patched in WP2.1 except the matcher (F1).

**D2 — `assigned_rule_id` cannot attribute rule-source rows, and universe sync is an active duplicate
source.** Both writers — `lib/workers/sync-campaign-universe.ts:333,433` and
`lib/campaign/recompute-ou-assignments.ts:351–356` — write `assignment_source='rule'` with no
`assigned_rule_id` (clone: 234/234 NULL), so NULL means nothing about history. `matchingOusForWorker`
(`sync-campaign-universe.ts:50–66`) matches a unit when *either* `unit_basis.employer_id` *or*
`unit_basis.worksite_id` matches; the 143 worksite children carry their employer's id, so a worker at
employer E matches *every* worksite unit under E — the mechanism behind the 26-row H1 partition. Script 03's
guard (skip any partition with a rule-source row) protects nothing real. **Resolution:** provenance
definitions in §3.2, the F1 matcher fix (§6.3), and the cleanup in §3.

**D3 — Campaign 57 has 13 structurally duplicated worksite bases (H10).** Any correct dimension-based sync
places a matching worker in all units sharing a basis. A destructive merge is not available on the clone
(no app is connected) and is not proven data-safe (unit delete cascades placements and may cascade or null
other `ou_id` dependants: coverage, WOC, rules, workplan/list-source). **Resolution: C1** — a non-destructive,
audited canonical-basis flag (§3.4) that leaves every unit row, name and basis key intact.

Scope drift that is *not* design-changing: the spec's "dependent views recreated in order" is unnecessary
because the migration only *adds* nullable columns and Postgres does not invalidate views on `ADD COLUMN`;
the ordered list is recorded in §5 for the rollback contingency and WP2.8, and acceptance is met by proving
the ten view definitions and `reloptions` are byte-identical before and after (§8.3).

**No design-changing blocker remains** with E2, M2, C1 and amended F1 approved.

---

## 2. Target schema for WP2.1 (item 2)

### 2.1 `campaign_groups`

```sql
create table public.campaign_groups (
  group_id      integer generated by default as identity primary key,
  campaign_id   integer not null references public.campaigns(campaign_id) on delete cascade,
  kind          text    not null check (kind in ('worksite','employer','shift','crew','occupation','work_area','custom')),
  name          varchar(200) not null check (btrim(name) <> ''),
  display_order integer not null default 0,
  source_ou_id  integer references public.campaign_organising_units(ou_id) on delete set null,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index campaign_groups_campaign_name_key on public.campaign_groups (campaign_id, lower(btrim(name)));
create unique index campaign_groups_one_fixed_kind_per_campaign on public.campaign_groups (campaign_id, kind) where kind <> 'custom';
create unique index campaign_groups_source_ou_key on public.campaign_groups (source_ou_id) where source_ou_id is not null;
create index idx_campaign_groups_campaign_display on public.campaign_groups (campaign_id, display_order, group_id);
create trigger trg_campaign_groups_updated_at before update on public.campaign_groups for each row execute function public.update_updated_at();
comment on table  public.campaign_groups is 'WP2.1: a facet of a campaign (Worksite, Employer, Shift, Crew, Occupation, Work area, or a user-defined Custom kind). Target rule: a worker is in at most one unit per group per campaign (enforced by WP2.2). Unassigned is derived (members with no placement in the group), never stored.';
comment on column public.campaign_groups.kind is 'Fixed set (decision 3). User-defined kinds are kind=custom; the group name is the kind label.';
comment on column public.campaign_groups.name is 'Display name with the same 200-character capacity as organising-unit names. For kind=custom this IS the user-defined kind label (no separate kind_label column — see wp2.1.md §2.1). Unique per campaign, case-insensitive.';
comment on column public.campaign_groups.source_ou_id is 'Provenance only: the legacy custom-kind container this group was backfilled from (WP2.1). NULL for groups created after WP2.1 or derived per type. Retired with the container columns in WP2.8.';
```

Deviations from the plan's sample SQL, with reasons:

- `unique (campaign_id, name)` → case-insensitive expression index; "Shift" vs "shift" must not coexist.
- Added partial unique `(campaign_id, kind) where kind <> 'custom'`: exactly one group per fixed kind per
  campaign — what makes "the Worksite group of campaign X" well-defined for the backfill, the trigger and
  WP2.2's API. Custom kinds are many per campaign by design.
- Added `source_ou_id` (provenance for the two custom containers that become groups; lets full-mode
  container renames follow through — §4.3) and `created_by` (decision 8 idiom).
- **`kind_label` is not added.** `name` suffices: for `kind='custom'` the name *is* the user-defined kind
  label; for fixed kinds the name defaults to the label and is renameable. Contract for WP2.7/WP3.1:
  `display_kind_label = CASE kind WHEN 'custom' THEN name ELSE <fixed label> END`; the fixed labels are
  the `label` column of `campaign_group_kind_for_ou_type()` (§2.5) so SQL and TypeScript share one source.
- `display_order` default rank by kind: worksite 10, employer 20, shift 30, crew 40, occupation 50,
  work_area 60, custom-by-type 71–75, custom-from-container 80+.

### 2.2 `group_id` on units and placements (WP2.1 part)

```sql
alter table public.campaign_organising_units
  add column group_id integer references public.campaign_groups(group_id)
    on delete no action deferrable initially deferred;
alter table public.campaign_worker_ou
  add column group_id integer references public.campaign_groups(group_id)
    on delete no action deferrable initially deferred;
-- after the backfill (§7.1 step order):
alter table public.campaign_worker_ou alter column group_id set not null;
alter table public.campaign_organising_units
  add constraint cou_leaf_requires_group check (group_id is not null or is_group_container);
create index idx_cwo_worker_group on public.campaign_worker_ou (worker_id, group_id);   -- NON-unique in WP2.1 (E2)
create index idx_cwo_group_ou     on public.campaign_worker_ou (group_id, ou_id);
create index idx_cou_group        on public.campaign_organising_units (group_id);
comment on column public.campaign_organising_units.group_id is 'WP2.1: the group this unit belongs to. NULL only for legacy custom-kind containers (which became groups, see campaign_groups.source_ou_id). NOT NULL enforced in WP2.8 when containers are retired.';
comment on column public.campaign_worker_ou.group_id is 'WP2.1: denormalised from the unit (trigger-maintained, never set by writers). One unit per (worker_id, group_id) is the target rule; it is NOT enforced until WP2.2''s enforcement migration replaces idx_cwo_worker_group with a unique index. Cross-campaign membership is unaffected because groups are per campaign.';
```

**Not created in WP2.1 (E2, handed to WP2.2 §6.4):** `create unique index campaign_worker_ou_one_unit_per_group
on campaign_worker_ou (worker_id, group_id)`; the duplicate-rejecting check inside `cwo_set_group_id()`;
the `campaign_group_membership` view.

Skeptical notes against the plan's sample: the plan's `on delete cascade` from `campaign_groups` to units is
rejected — a cascading group delete would silently destroy units, placements and coverage rows. Both
group references instead use `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`. Deferral lets campaign
deletion finish both the campaign→groups and campaign→units→placements cascade paths before checking the
references; direct group deletion still fails at transaction/autocommit-statement commit while any unit or
placement survives. WP2.2's delete-group RPC must still move or delete units explicitly. `NOT NULL` on
`units.group_id` is *not*
enforceable in WP2.1 because the two custom containers legitimately have no group (they are groups); the
CHECK `cou_leaf_requires_group` gives the same guarantee for every non-container row now, and WP2.8
tightens it to `NOT NULL` when `is_group_container` is retired. `NOT NULL` on `campaign_worker_ou.group_id`
*is* enforceable now: containers cannot hold placements (existing trigger; clone confirms 0 rows).

**Cross-campaign guarantee:** the (future) unique key is `(worker_id, group_id)` and every group belongs to
exactly one campaign; a worker in campaigns A and B has placements against different `group_id`s. No index
includes `campaign_id + worker_id` or `worker_id` alone.

### 2.3 `campaign_group_membership` view — deferred to WP2.2's enforcement migration (E2)

Revision 1 created the view in WP2.1 and argued "≤ 1 placement per (member, group) because of the unique
index". Without the index that claim is false: until WP2.2 a `(member, group)` pair can legitimately have
several rows (every H9 partition, and every same-group split/copy done in full mode in the meantime). Two
options were weighed: create the view now with a documented multiplicity/non-consumption contract, or defer
it. **Chosen: defer.** Nothing consumes the view in WP2.1 (`groups_v2` is not yet introduced and WP2.1 adds no reader), a
view whose documented contract is "may be wrong" invites accidental consumption once it appears in
generated types, and deferring makes the WP2.1 migration strictly additive columns/tables. The definition
WP2.2 will create (unchanged from revision 1 apart from the section it lives in):

```sql
create view public.campaign_group_membership with (security_invoker = true) as
select g.campaign_id, g.group_id, g.kind, g.name as group_name, m.worker_id,
       p.id as placement_id, p.ou_id, p.is_primary, p.assignment_source
from public.campaign_worker_membership m
join public.campaign_groups g on g.campaign_id = m.campaign_id
left join public.campaign_worker_ou p on p.worker_id = m.worker_id and p.group_id = g.group_id;
revoke all on public.campaign_group_membership from public, anon;
grant select on public.campaign_group_membership to authenticated, service_role;
```

Consumption contract (binding on WP2.2/2.4/2.7): no application code reads `campaign_group_membership`
or relies on one-unit-per-group until the enforcement migration has been applied to the target database
and H9 = 0 has been re-verified there.

### 2.4 Mapping from today's shapes to groups (the "future group key")

Used identically by the cleanup (§3), the migration backfill (§7.1) and the maintenance trigger (§4.2):

| Today's shape | Group | Unit's `group_id` |
|---|---|---|
| Employer container (`is_group_container`, `ou_type='employer'`) — 18 | the campaign's `employer` group | set (the container row *is* a unit of the Employer group) |
| Worksite child of an employer container — 143 | the campaign's `worksite` group | set |
| Standalone unit of a fixed-kind type: `worksite, employer, shift, crew_rotation→crew, job_type→occupation, work_area` | the campaign's group of that kind | set |
| Custom-kind container (`is_group_container`, `ou_type` ∈ `custom, network, ethnic_community, accommodation, department`) — 2 | **becomes** a `custom` group named after the container (`source_ou_id` = container) | **NULL** |
| Custom-kind leaf inside a custom-kind container — 7 | that container's group | set |
| Standalone or level-2 custom-kind leaf (H8 population) — 9 | the campaign's `custom` group named by type label (`Custom`, `Network`, `Ethnic community`, `Accommodation`, `Department`) | set |
| Level-2 unit under a non-container parent (0 today) | by its own `ou_type` as above | set |
| Campaign with no units (8) | no groups created | — |
| Members with no placement (H6: 1,218) | nothing written; Unassigned is derived | — |

`department` maps to `custom`/"Department" rather than to `work_area` so a worker may be in one department
and one work area at once (decision 5's independence principle). No department units exist today, the
mapping is a pure function and reversible, so this is a planner decision, not an operator one.

### 2.5 Helper functions (pure, SECURITY INVOKER)

```sql
create or replace function public.campaign_group_kind_for_ou_type(p_ou_type text)
returns table (kind text, label text, rank integer) language sql immutable as $$
  select v.kind, v.label, v.rank from (values
    ('worksite','worksite','Worksite',10), ('employer','employer','Employer',20), ('shift','shift','Shift',30),
    ('crew_rotation','crew','Crew',40),   ('job_type','occupation','Occupation',50), ('work_area','work_area','Work area',60),
    ('department','custom','Department',71), ('custom','custom','Custom',72), ('network','custom','Network',73),
    ('ethnic_community','custom','Ethnic community',74), ('accommodation','custom','Accommodation',75)
  ) v(ou_type, kind, label, rank) where v.ou_type = p_ou_type
$$;

-- Returns zero rows for a custom-kind container (it becomes a group, not a unit of one).
create or replace function public.campaign_group_target_for_unit(p_ou_type text, p_is_container boolean, p_ou_group_id integer)
returns table (kind text, name text, source_ou_id integer, rank integer) language plpgsql stable as $$
declare k record; parent record;
begin
  select * into k from public.campaign_group_kind_for_ou_type(p_ou_type);
  if k.kind is null then raise exception 'unknown ou_type %', p_ou_type; end if;
  if k.kind <> 'custom' then return query select k.kind, k.label, null::integer, k.rank; return; end if;
  if p_is_container then return; end if;
  if p_ou_group_id is not null then
    select c.ou_id, c.name, c.ou_type, c.is_group_container into parent
      from public.campaign_organising_units c where c.ou_id = p_ou_group_id;
    if parent.is_group_container and (select kk.kind from public.campaign_group_kind_for_ou_type(parent.ou_type) kk) = 'custom' then
      return query select 'custom'::text, parent.name::text, parent.ou_id, 80; return;
    end if;
  end if;
  return query select 'custom'::text, k.label, null::integer, k.rank;
end $$;

create or replace function public.campaign_group_ensure(p_campaign_id integer, p_kind text, p_name text, p_source_ou_id integer, p_rank integer)
returns integer language plpgsql as $$
declare v_id integer;
begin
  if p_source_ou_id is not null then
    select group_id into v_id from public.campaign_groups where source_ou_id = p_source_ou_id;
  else
    select group_id into v_id from public.campaign_groups
     where campaign_id = p_campaign_id and kind = p_kind
       and source_ou_id is null
       and (p_kind <> 'custom' or lower(btrim(name)) = lower(btrim(p_name)));
  end if;
  if v_id is not null then return v_id; end if;
  insert into public.campaign_groups (campaign_id, kind, name, source_ou_id, display_order)
  values (p_campaign_id, p_kind, p_name, p_source_ou_id, p_rank)
  on conflict do nothing returning group_id into v_id;
  if v_id is null then
    if p_source_ou_id is not null then
      select group_id into v_id from public.campaign_groups where source_ou_id = p_source_ou_id;
    else
      select group_id into v_id from public.campaign_groups
       where campaign_id = p_campaign_id and kind = p_kind
         and source_ou_id is null
         and (p_kind <> 'custom' or lower(btrim(name)) = lower(btrim(p_name)));
    end if;
    if v_id is null then
      raise exception using errcode = '23505',
        message = format('A group named "%s" already exists in campaign %s; rename it before creating a %s group', p_name, p_campaign_id, p_kind);
    end if;
  end if;
  return v_id;
end $$;
```

These run as the invoking user (no `SECURITY DEFINER`): an `authenticated` user who can insert a unit can
write to that campaign (WP1.6 `wp16_cou_insert`), and the `campaign_groups` write policy (§2.6) uses the
same predicate, so a trigger-created group passes RLS. `anon` has no rights on any of it.

### 2.6 RLS, grants, ownership

`campaign_groups`:

```sql
alter table public.campaign_groups enable row level security;
create policy campaign_groups_select on public.campaign_groups for select to authenticated using (true);
create policy campaign_groups_insert on public.campaign_groups for insert to authenticated
  with check (public.get_user_role() in ('admin','user') and public.can_write_to_campaign(campaign_id));
create policy campaign_groups_update on public.campaign_groups for update to authenticated
  using (public.get_user_role() in ('admin','user') and public.can_write_to_campaign(campaign_id))
  with check (public.get_user_role() in ('admin','user') and public.can_write_to_campaign(campaign_id));
create policy campaign_groups_delete on public.campaign_groups for delete to authenticated
  using (public.get_user_role() in ('admin','user') and public.can_write_to_campaign(campaign_id));
revoke all on public.campaign_groups from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_groups to authenticated;
grant all on public.campaign_groups to service_role;
revoke all on sequence public.campaign_groups_group_id_seq from public, anon, authenticated;
grant usage, select on sequence public.campaign_groups_group_id_seq to authenticated, service_role;
```

The SELECT policy mirrors the units table's existing "authenticated users can read" policy (B:26985) —
groups are structural, not personal data. Write policies copy the WP1.6 pattern (implementer: read
`20260909120000` lines 158–293 and reuse the exact predicate text).

`user_campaign_prefs` (unchanged from revision 1; independent of uniqueness):

```sql
create table public.user_campaign_prefs (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  campaign_id integer not null references public.campaigns(campaign_id) on delete cascade,
  prefs       jsonb   not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object'),
  updated_at  timestamptz not null default now(),
  primary key (user_id, campaign_id)
);
create trigger trg_user_campaign_prefs_updated_at before update on public.user_campaign_prefs for each row execute function public.update_updated_at();
alter table public.user_campaign_prefs enable row level security;
create policy ucp_select on public.user_campaign_prefs for select to authenticated using (user_id = auth.uid());
create policy ucp_insert on public.user_campaign_prefs for insert to authenticated with check (user_id = auth.uid());
create policy ucp_update on public.user_campaign_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ucp_delete on public.user_campaign_prefs for delete to authenticated using (user_id = auth.uid());
revoke all on public.user_campaign_prefs from public, anon, authenticated;
grant select, insert, update, delete on public.user_campaign_prefs to authenticated;
grant all on public.user_campaign_prefs to service_role;
comment on table public.user_campaign_prefs is 'WP2.1: per-user, per-campaign UI preferences (active group, collapsed groups, sort). Owner-only RLS. Replaces localStorage for these keys (plan §6). Shape is owned by WP2.4/WP2.7; WP2.1 stores an opaque JSON object and no application code reads it yet.';
```

Owner-only (`user_id = auth.uid()`), same idiom as `user_hint_dismissals`
(`20260911090000_user_hint_dismissals.sql` lines 51–54). Justified non-owner access: `service_role` only,
for e2e seeding and any admin API that must clear a user's prefs (WP1.7f precedent). No admin read of other
users' prefs. All objects owned by `postgres` (the `db push` role), matching the baseline.

---

## 3. Pre-migration cleanup artefacts (orphan-rule prerequisite and H10 canonicalisation)

### 3.1 Why script 03's guard is too broad

`scripts/data-hygiene/oux-wp0.4/03_resolve_duplicate_placements.sql` builds
`rule_partitions AS (SELECT DISTINCT campaign_id, dim_key, worker_id FROM keyed WHERE assignment_source = 'rule')`
and skips every partition in it, on the theory that a rule would recreate a deleted row. But both rule
writers leave `assigned_rule_id` NULL, only two units in the estate have a current rule, and none of the 234
rule-source rows sits on a unit with a current rule. So the guard protected 9 of 10 clone partitions for a
rule that does not exist, while the writer that *would* recreate a row (universe sync from the worker's
current employer/worksite) is not what it tests. Script 03 is left untouched; the artefacts below supersede
it for this purpose.

### 3.2 Definitions

- **Future group key (fgk)** of a leaf unit: the §2.4 mapping. In the cleanup scripts (which run before the
  §2.5 functions exist) it is the byte-identical CASE expression marked `-- FGK-EXPRESSION` in each file and
  in the migration; the reviewer diffs the copies.
- **Partition (H9)**: `(campaign_id, fgk, worker_id)` with more than one `campaign_worker_ou` row.
  H9 ⊇ H1 ∪ H3.
- **Auto-fill basis** of a unit: the top-level `unit_basis.employer_id` / `unit_basis.worksite_id` keys.
  **Auto-match enabled**: at least one of those keys present and `unit_basis.auto_match` is not `false`
  (the C1 flag, §3.4).
- **Raw dimension match** of a unit/placement row: its unit is auto-match enabled and *every present*
  recognised basis key equals the worker's current `workers.employer_id` / `worksite_id` (AND semantics).
- **Basis specificity**: the count of present recognised keys among `employer_id` and `worksite_id` (1 or
  2 for eligible units). A **dimension match** under amended F1 is a raw match whose specificity equals
  the maximum raw-match specificity in that `(campaign_id, fgk, worker_id)` partition. Equally specific
  ties remain matches until C1 disables noncanonical duplicate-basis units.
- **Attributable campaign-unit-rule row**: `assignment_source='rule'` **and** the unit has a current
  `campaign_unit_rules` row (0 on the clone).
- **Unattributed rule-source row**: `assignment_source='rule'` and the unit has no current rule (all 234 on
  the clone). `assigned_rule_id IS NULL` is *not* evidence of anything: both current writers omit it. These
  rows are **not** called orphaned and their `assignment_source` is **never changed** by WP2.1 (§3.6).
- **H10 duplicate basis set**: units of one `(campaign_id, fgk)` sharing the same auto-fill basis
  (`employer_id`/`worksite_id` pair), more than one unit.
- **Canonical unit** of an H10 set: the one unit the operator designates as the auto-fill target (C1).

### 3.3 Artefacts (all under `scripts/data-hygiene/oux-wp2.1/`, plain SQL, no psql meta-commands)

| File | Purpose | Mutates |
|---|---|---|
| `README.md` | run order, environments, rollback order, production-guard rule (§3.8) | — |
| `00_preflight_hazards.sql` | H1–H8 (verbatim from appendix C §8.4 lines 429–475) + H9, H10, counts/checksums (§8.3), rule-provenance attribution, name-collision check, per-partition resolution preview, and the **H10 chooser output**: for each duplicate set, `campaign_id, fgk, employer_id, worksite_id` and per unit `ou_id, ou_type, parent_ou_id, is_group_container, source, display_order, created_at, placement_count, rule_count, coverage_row_count, dependant_ref_count` — ids and structural facts only, no names. Also the current-production read-only preflight the operator runs (agent never). | no |
| `01_environment_marker.sql` | creates `public._oux_env_marker(env text)` with one row (`clone` or `dev`). Operator-run once per non-production DB. Never run on production. | yes (marker only) |
| `02a_h10_canonical_basis_mapping.sql` | creates `public._oux_wp21_canonical_basis (campaign_id int, fgk text, employer_id int, worksite_id int, canonical_ou_id int not null, note text, primary key (campaign_id, fgk, coalesce(employer_id,0), coalesce(worksite_id,0)))` + commented insert template. **No ids in the committed file.** | yes (empty table) |
| `02b_placement_mapping.sql` | creates `public._oux_wp21_placement_mapping (campaign_id int, fgk text, worker_id int, keep_ou_id int null, note text, primary key (campaign_id, fgk, worker_id))` + template. `keep_ou_id NULL` = remove every placement of this worker in this group. No ids committed. | yes (empty table) |
| `03a_canonicalise_duplicate_bases.sql` | C1 (§3.4): flags non-canonical units `auto_match=false`, logged. | yes |
| `03a_rollback.sql` | restores `unit_basis` from the log. | yes |
| `03b_resolve_future_group_conflicts.sql` | placement cleanup (§3.5). | yes |
| `03b_rollback.sql` | re-inserts deleted rows / reverts `is_primary` flips from the log. | yes |
| `04_postflight_hazards.sql` | `00` plus the post-migration assertions of §8.3 and the dependant-reference checksum comparison (§3.7). | no |
| `90_rollback_wp2_1_campaign_groups.sql` | the migration rollback (§7.3). Operator-run, recovery-only; never a migration. | yes |
| `95_role_probes.sql` | RLS probes (§8.5), WP1.6 `95_role_probes.sql` idiom. | no (rolled back) |

### 3.4 `03a_canonicalise_duplicate_bases.sql` — C1, non-destructive canonical basis

Mechanism: add `"auto_match": false` at the top level of `unit_basis` on every **non-canonical** unit of a
mapped H10 set. Nothing else in the row changes: name, `ou_type`, parent, `employer_id`/`worksite_id` keys
and any other `unit_basis` metadata are preserved, so full-mode display, coverage, WOC, rules and
`stampEmployerWorksiteFromOu` (which stamps a worker's blank employer/worksite from the target unit) behave
as today. The only behavioural effect is that the F1 matcher skips flagged units, so universe sync fills
exactly one unit per basis. Justification for this over deleting the keys: it is reversible by removing one
key, leaves the unit's factual basis visible, and the matcher change is already in scope (F1). If the
operator prefers key removal instead, the same script structure applies with the keys moved under
`unit_basis.auto_match_disabled` for reversibility — but the flag is recommended.

PRE-CHECK (aborts the transaction on failure): environment guard (§3.8); `_oux_hygiene_log` and
`_oux_wp21_canonical_basis` exist; every mapping row's `canonical_ou_id` is a member of its set and is not
already flagged; every H10 set present in the data has a mapping row — otherwise **STOP** listing the
unmapped sets (ids only). CHANGE: for each non-canonical unit in a mapped set,
`INSERT INTO _oux_hygiene_log (script, action='update', table_name='campaign_organising_units', row_pk, before_row, after_row, note)`
then `UPDATE campaign_organising_units SET unit_basis = unit_basis || '{"auto_match": false}'::jsonb WHERE ou_id = …`
with the `updated_at` trigger left **enabled** (this is a deliberate operator edit; the `updated_at` change
is recorded in `after_row`). POST-CHECK: for every `(campaign_id, fgk, basis)` exactly one auto-match-enabled
unit remains; unit count, placement count, and the dependant-reference checksums (§3.7) unchanged. Then
re-evaluate F1 exposure for all current workers that pass the application's planning/active, non-SMS and
employer/worksite OR campaign-universe predicate. Rank raw matches by basis specificity inside each
`(campaign_id, fgk, worker_id)` and count only equal-maximum candidates as final targets. The script
reports pre-specificity multi-target partitions/excess, suppressed fallback targets, post-specificity
residuals and affected campaigns. More than one equal-maximum target remains a **STOP inside the same
transaction**, so every C1 unit/log update rolls back; such a tie still requires a reviewed C1 mapping
amendment before continuing.

`03a_rollback.sql`: restore `unit_basis` from `before_row` for each logged row with `rolled_back_at IS
NULL`, run `SET CONSTRAINTS ALL IMMEDIATE` after the row restore and before re-enabling the timestamp
trigger, then set `rolled_back_at`. This clears any deferred RI events before the `ALTER TABLE` without
changing cleanup semantics. No dependency on the migration state (works before or after WP2.1's migration).

If a **destructive unit merge** is ever wanted for the duplicate sets, it goes to a separately reviewed later
package after merge semantics exist for every `ou_id` dependant (coverage, WOC, rules, candidates,
workplan/list-source). C2 is out of scope here.

### 3.5 `03b_resolve_future_group_conflicts.sql` — placement cleanup

Runs **after** `03a` so dimension matching already reflects the canonical units.

PRE-CHECK (raises to abort): environment guard; `_oux_hygiene_log`, `_oux_wp21_placement_mapping` exist;
every mapping row targets an existing partition and its `keep_ou_id` (if not NULL) belongs to that partition
— otherwise **STOP** (stale mapping). Build `partitions` (H9) and per-row facts:
`basis_specificity`, `raw_dim_match`, maximum-specificity `dim_match`, `attributable_rule`, `is_primary`,
`assignment_source`.

Decision order per partition; first applicable rule wins; **never** newest `id`/`created_at`, never
"prefer the rule-source row":

1. **Operator placement mapping** → keeper = `keep_ou_id` (or remove-all when NULL).
2. **Exactly one maximum-specificity dimension-matching row** → keeper. A lower-specificity matching
   fallback does not create ambiguity. If any *other* row in the partition is an attributable
   campaign-unit-rule row, the rule and the dimension disagree → **unresolved**.
3. No dimension match, **exactly one `is_primary`** row → keeper.
4. No dimension match, no primary, **exactly one `manual` row and every other row is an unattributed
   rule-source row** → keeper = the manual row.
5. Otherwise → **unresolved**.

If any partition is unresolved → write to `public._oux_wp21_conflicts (campaign_id, fgk, worker_id, rows
jsonb)` (ids, flags, sources only) and **RAISE EXCEPTION** listing `campaign_id/fgk/worker_id`. Nothing is
deleted anywhere until every partition resolves; the operator adds placement-mapping rows and re-runs.

CHANGE: for each non-keeper row, log `action='delete'` with `before_row` and `note` (`mapping`,
`unique_dimension_match`, `unique_primary`, `single_manual_vs_unattributed_rule`, `mapping_remove_all`),
then delete by `id`. If a deleted row had `is_primary = true` and the keeper does not, update the keeper
(`action='update'`, before/after logged) so H7 stays 0 and the worker's primary placement in the group
survives.

POST-CHECK: H9 = 0; H2/H5/H7 = 0 (or unchanged); membership count unchanged; placement count = before −
deleted; every deleted row is in the log with `rolled_back_at IS NULL`; `assignment_source` distribution
changed only by the deleted rows (no relabels).

`03b_rollback.sql`: re-insert `before_row` for `action='delete'`, revert `action='update'`, set
`rolled_back_at`. PRE-CHECK: targets absent, units exist. Because WP2.1 installs no unique index, the
rollback works before *or* after the WP2.1 migration (the `cwo_set_group_id` trigger simply re-derives
`group_id`). After WP2.2's enforcement migration it would be blocked — that migration's plan must say so.

### 3.6 Provenance handling and the Recompute risk (for WP2.2)

`assignment_source` is preserved on every surviving row. Relabelling unattributed rule-source rows as
`manual` would need its own decision because it changes what Recompute deletes: `recompute-ou-assignments.ts:236–243`
deletes **every** `assignment_source='rule'` row of a campaign that has no current rules — including
universe-sync rows — and `:334–345` clears rule rows in every non-container unit before re-inserting. This
pre-existing risk (a Recompute click on campaigns 26/42/57/64 removes 234 placements on the clone) is
recorded here for WP2.2, which owns the writers; WP2.1 neither triggers nor masks it.

### 3.7 Dependant-reference integrity check (proves C1 touched nothing else)

`00`/`04` derive the set of foreign keys that reference `campaign_organising_units(ou_id)` dynamically from
`pg_constraint` (no hand-kept list), and for each referencing table emit `count(*)` and
`md5(string_agg(<pk>||':'||<ou_id column>, ',' order by <pk>))`. All must be identical before/after `03a`,
`03b`, the migration and the rollback. The same block covers `campaign_unit_rules`, coverage, candidates,
WOC and any workplan/list-source tables automatically.

### 3.8 Environment guard (corrected)

Every mutating script (`03a`, `03a_rollback`, `03b`, `03b_rollback`, `90`) begins with:

```sql
do $$ begin
  if to_regclass('public._oux_env_marker') is not null then
    return;                                                   -- clone/dev: persistent marker table (01_environment_marker.sql)
  end if;
  if current_setting('oux.env', true) = 'production' then
    return;                                                   -- production: guard value supplied in the SAME submission (see below)
  end if;
  raise exception 'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction.';
end $$;
```

- Clone and normal dev carry the persistent `_oux_env_marker` table (operator-created once by `01`).
- Production (phase 2, **outside WP2.1**) has no marker. A future operator-run production mutation must put
  `set local oux.env = 'production';` **inside the same transaction/submission** as the change (the
  committed files start with `begin;` and the operator adds that one line immediately after it at run
  time), because a `SET` in a separate SQL-editor submission does not persist into another session. The
  committed files never contain that line and never contain a project ref.
- The agent never sets `oux.env` and never links to production, so an agent-run script can only mutate a
  database the operator has marked.

---

## 4. Maintaining `group_id` on placements and units (item 4)

### 4.1 Rules

- Writers never set `campaign_worker_ou.group_id`; it is always derived from the unit and any explicit value
  is overwritten. Re-parenting a placement (`UPDATE … SET ou_id`) re-derives it.
- Re-grouping a *unit* (`UPDATE campaign_organising_units SET group_id`) cascades to its placements in the
  same statement.
- A unit's group must belong to the unit's campaign (trigger check).
- **No duplicate rejection in WP2.1** (E2). Same-group duplicates created by full-mode writers between
  WP2.1 and WP2.2 are simply rows with equal `(worker_id, group_id)`; H9 in `04`/WP2.2's precondition finds
  them.

### 4.2 Triggers

```sql
-- Units: derive the group for old writers that do not know about groups.
create or replace function public.cou_default_group() returns trigger language plpgsql as $$
declare t record; k text;
begin
  select kind into k from public.campaign_group_kind_for_ou_type(new.ou_type);
  if new.is_group_container and k = 'custom' then
    new.group_id := null;                       -- this row is a group, not a unit of one (handled AFTER)
    return new;
  end if;
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id) then
    if not exists (select 1 from public.campaign_groups g where g.group_id = new.group_id and g.campaign_id = new.campaign_id) then
      raise exception 'group % does not belong to campaign %', new.group_id, new.campaign_id;
    end if;
    return new;                                 -- explicit value from a WP2.2+ writer: respected
  end if;
  if new.group_id is null
     or (tg_op = 'UPDATE' and (new.campaign_id is distinct from old.campaign_id
                               or new.ou_type is distinct from old.ou_type
                               or new.ou_group_id is distinct from old.ou_group_id
                               or new.is_group_container is distinct from old.is_group_container)) then
    select * into t from public.campaign_group_target_for_unit(new.ou_type, new.is_group_container, new.ou_group_id);
    new.group_id := public.campaign_group_ensure(new.campaign_id, t.kind, t.name, t.source_ou_id, t.rank);
  end if;
  return new;
end $$;
create trigger trg_cou_y_default_group before insert or update of campaign_id, ou_type, ou_group_id, parent_ou_id, is_group_container, group_id
  on public.campaign_organising_units for each row execute function public.cou_default_group();

-- Units: keep the container-derived group row in step, and cascade re-grouping to placements.
create or replace function public.cou_after_group_change() returns trigger language plpgsql as $$
declare k text;
begin
  select kind into k from public.campaign_group_kind_for_ou_type(new.ou_type);
  if new.is_group_container and k = 'custom' then
    perform public.campaign_group_ensure(new.campaign_id, 'custom', new.name, new.ou_id, 80);
    if tg_op = 'UPDATE' and (new.name is distinct from old.name or new.campaign_id is distinct from old.campaign_id) then
      update public.campaign_groups set campaign_id = new.campaign_id, name = new.name where source_ou_id = new.ou_id;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    update public.campaign_worker_ou set group_id = new.group_id where ou_id = new.ou_id;
  end if;
  return null;
end $$;
create trigger trg_cou_z_after_group_change after insert or update of campaign_id, name, ou_type, ou_group_id, parent_ou_id, is_group_container, group_id
  on public.campaign_organising_units for each row execute function public.cou_after_group_change();

-- Placements: always derive from the unit. (WP2.2's enforcement migration adds the duplicate pre-check here.)
create or replace function public.cwo_set_group_id() returns trigger language plpgsql as $$
declare v_group integer;
begin
  select group_id into v_group from public.campaign_organising_units where ou_id = new.ou_id;
  if v_group is null then
    raise exception 'unit % has no group (is it a legacy container?)', new.ou_id;
  end if;
  new.group_id := v_group;
  return new;
end $$;
create trigger trg_cwo_z_set_group_id before insert or update of ou_id, group_id
  on public.campaign_worker_ou for each row execute function public.cwo_set_group_id();
```

Ordering: on `campaign_worker_ou` the two existing BEFORE triggers fire first alphabetically
(`trg_check_…` < `trg_cwo_…`), then `trg_cwo_z_set_group_id`; they are independent (the container check
already rejects container units, so `v_group IS NULL` is unreachable for containers and the raise is
defensive). On units, `trg_cou_enforce_group_consistency` and
`trg_cou_enforce_two_level_depth` normalise legacy hierarchy fields first, then
`trg_cou_y_default_group` derives the group. The `updated_at` trigger runs on every update as today.

### 4.3 Current writers after WP2.1 (re-walked under E2 — behaviour is unchanged for all of them)

| Writer (appendix A §9 inventory) | After WP2.1 |
|---|---|
| `create-organising-unit-dialog.tsx`, `campaign-units-section.tsx`, wizard, imports creating units | identical UX; the unit silently gets `group_id`; a custom-kind container also gets its `campaign_groups` row. Only new failure: a container named the same as an existing group in that campaign (0 collisions today; readable error) |
| Container rename / delete | group name follows; delete still blocked while children exist (existing FK), otherwise group survives with `source_ou_id = NULL` |
| `split_campaign_organising_unit` (all paths, incl. same-group keep-in-parent) | works exactly as today; may create same-group duplicates, which H9 reports |
| `move-worker-mutation.ts`, `merge-units-dialog.tsx`, `copy-worker-to-unit-dialog` | unchanged code, unchanged behaviour (no P2/P3 patches in WP2.1 — they belong to WP2.2's transactional API) |
| `syncWorkersToMatchingCampaigns` | Amended F1 matcher: all present keys match, `auto_match=false` is skipped, and lower-specificity same-group fallbacks are suppressed; campaign membership remains OR-based and writes remain `upsert … ignoreDuplicates` |
| `recompute-ou-assignments.ts` | unchanged (see §3.6 risk) |
| `merge_workers` / `remap_worker_id` | unchanged; will handle the WP2.2 unique index generically |
| `delete-organising-unit-dialog`, `use-allocate-workers-to-ou`, add-workers/create-worker routes, worker/campaign import apply | unchanged |

### 4.4 Employer-group placement rows — decision M1 / M2 (recommend M2)

The plan's mapping row says members of a worksite child are "placed in both" the Worksite and Employer
groups.

- **M1 — materialise now.** Insert one Employer-group placement per (member, container) onto the 18
  container rows in the backfill. Requires bypassing `check_no_worker_on_group_container` for the migration,
  adds ~1,400 rows (the placement-count invariant becomes "+ inserted"), changes full-mode observables
  (`is_multi_unit_member`, Units-tab rows, wall-chart `parentExclusiveWorkersByOu`), and no current writer
  maintains those rows — they go stale on the first full-mode move.
- **M2 — schema only (recommended).** Create the Employer group and give the 18 containers `group_id`;
  insert no placement rows. `campaign_worker_ou` count is unchanged (a strong, checkable invariant). The
  Employer group reads 100 % Unassigned in those campaigns until WP2.2 materialises placements through the
  structure API and relaxes the container trigger for units that have a `group_id`. Decision 4 says 100 %
  Unassigned is normal.

Recorded as a deliberate deviation from the plan §6 mapping row, carried to WP2.2.

---

## 5. Dependent views — order, definitions, what CASCADE would take (item 5)

**WP2.1 drops or recreates no existing view.** `ADD COLUMN` leaves dependent views valid; none of the ten
views references `group_id`. Acceptance evidence is `md5(pg_get_viewdef(oid))` + `reloptions` for the ten
views before and after (§8.3), which must be identical.

Dependency-safe drop/recreate order for (a) a rollback contingency in which a column *type* must change and
(b) WP2.8. Definitions come from the **baseline/latest migrations**, never from legacy files.
Drop order (leaves first): `v_campaign_coverage_summary` (B:15604) → `v_campaign_coverage_map` (B:15562)
→ `v_campaign_foundational_readiness` (B:15624) → `v_woc_unit_representation` (B:15975) →
`v_section_plan_workforce_mapping` (B:15851) → `vw_call_action_report` (~B:16150) →
`campaign_worker_unit_membership_summary` (B:10763) → `campaign_unit_hierarchy_summary` (B:10370) →
`campaign_unit_assignment_summary` (B:10331) → `campaign_ou_coverage_summary` (B:9808). Recreate in reverse.

A careless `DROP … CASCADE` would silently remove and require re-applying: each view's
`WITH (security_invoker = …)`, its `COMMENT ON VIEW` (e.g. B:10367), `ALTER VIEW … OWNER TO postgres`, and
the per-view grants. No indexes exist on views. `v_section_plan_workforce_mapping` hard-codes
`ou_type = 'worksite'` and `v_woc_unit_representation` recurses over `parent_ou_id` excluding containers —
both keep working because those columns are untouched; both are WP2.8 rewrite candidates.

No new view depends on `group_id` in WP2.1 (the membership view is WP2.2's), so the rollback (§7.3) has no
view to drop.

---

## 6. Feature flag, phased rollout, enforcement timing, WP2.2 handoff (item 6)

### 6.1 What is enforced when

| Enforcement | WP2.1 | WP2.2 enforcement migration | WP2.8 |
|---|---|---|---|
| `campaign_worker_ou.group_id NOT NULL` | yes | — | — |
| `cou_leaf_requires_group` CHECK | yes | — | → `units.group_id NOT NULL` |
| `UNIQUE (worker_id, group_id)` | **no** (non-unique `idx_cwo_worker_group`) | **yes** (replaces the non-unique index) | — |
| duplicate pre-check in `cwo_set_group_id` | no | yes | — |
| `campaign_group_membership` view | no | yes | — |
| `campaign_groups` write policies, `user_campaign_prefs` | yes | — | — |
| old columns / triggers / writers | untouched | routed through RPCs | retired |

`groups_v2` is not yet introduced and WP2.1 adds **no UI, no reads of `user_campaign_prefs`, no localStorage,
no campaign-creation path**. Every full-mode screen keeps reading the old columns. Generated types gain the
new tables/columns; nothing consumes them until WP2.2.

Merging WP2.1 code before applying its production migration is compatible with this boundary: the only
runtime change, F1, selects legacy columns only and narrows auto-match targets; the new schema, membership
view and unique enforcement have no consumer; `groups_v2` is not yet introduced. This does not authorise a
production mutation. The operator must first run the current production `00` preflight, review/supply
canonical and placement mappings, execute the rehearsed cleanup sequence, and only then apply the
migration. The production `00` result
`malformed_or_nonpositive_basis_units` must be zero before F1 matching can be relied upon. The agent never
queries or mutates production.

### 6.2 Full-mode behaviour under E2 — unchanged

No full-mode operation gains a new failure mode in WP2.1 other than the group-name collision on creating a
custom-kind container (§4.3). Same-group split/copy/move/merge behave exactly as today, including creating
duplicates; that is accepted for the WP2.1→WP2.2 window and is why WP2.2 re-runs the cleanup before
enforcing.

### 6.3 F1 — the one code change in WP2.1 (approved and amended)

`apps/organising-db/src/lib/workers/sync-campaign-universe.ts:50–66` `matchingOusForWorker` and the target
loader that feeds it:

- a unit matches only if **every present** auto-fill key matches (`employer_id` and/or `worksite_id`);
  units with neither key never match (as today);
- units whose `unit_basis.auto_match === false` never match (the C1 flag);
- group eligible matches by `(campaign_id, fgk)`, calculate specificity as the number of present recognised
  basis keys, and retain only candidates at that partition's maximum specificity. Preserve input order
  among retained equal-maximum candidates;
- derive `fgk` without migration-only columns: fixed types → `kind:<mapped-kind>`; custom child of a
  custom-kind container → `source:<container-ou-id>`; other custom leaf → `type:<ou-type>`; custom-kind
  container → no key. The loader selects only legacy `ou_type`, `ou_group_id`, container and basis columns,
  so deploying code before the migration does not fail.

Tests (`__tests__/sync-campaign-universe.test.ts`): both-keys unit matches only employer+worksite;
employer-only by employer; worksite-only by worksite; flagged unit never matches; a mixed list yields one
worksite child, not nineteen; both-key beats same-group employer fallback; fallback survives absent or
mismatched specific units; campaigns/groups isolate ranking; equal-specificity duplicates survive until
C1 disables one; output order is stable; legacy FGK derivation is covered. F1 is necessary
**independently of uniqueness**: it stops the active duplicate source (D2). The former P2/P3 client
patches are dropped from WP2.1; their intent is delivered by WP2.2's transactional `move`/`merge` RPCs.

### 6.4 Exact WP2.2 enforcement handoff (binding on the WP2.2 plan)

WP2.2 must, in this order, before any later group-model consumer reads group data:

1. Ship transactional structure RPCs that implement one-unit-per-group semantics atomically:
   `move_worker_placement` (single `UPDATE … SET ou_id`, or delete+insert in one transaction),
   `copy_worker_placement` (cross-group only), `merge_units` (moves placements and every `ou_id` dependant
   explicitly, then deletes), `split_unit` (children in a new or different group; remove parent rows before
   inserting when same-group), plus Employer-placement materialisation (M2) and the Recompute fix (§3.6).
2. Route `move-worker-mutation.ts`, `merge-units-dialog.tsx`, `copy-worker-to-unit-dialog`,
   `split-unit-dialog.tsx` through those RPCs (or gate the old paths) so no writer inserts before deleting.
   Reconcile generated `Insert` typing: `campaign_worker_ou.group_id` is database-NOT-NULL but intentionally
   trigger-populated, so callers must not be forced to invent it; use the structure RPC/API typing boundary
   rather than requiring clients to send a derived value.
3. Remove the current unpaged organising-unit loader risk before relying on complete group membership or
   auto-match results at scale; explicitly page the OU query (or provide an equivalent uncapped server-side
   path) and test beyond the PostgREST row limit.
4. Re-run `oux-wp2.1/00_preflight_hazards.sql` and, if H9 > 0, `03b_resolve_future_group_conflicts.sql`
   (same STOP rules) on the target database.
5. Apply the **enforcement migration** `wp2_2_one_unit_per_group_enforcement`, one transaction:
   precondition `DO` block raising if H9 > 0 (message names script `03b`); `drop index idx_cwo_worker_group`;
   `create unique index campaign_worker_ou_one_unit_per_group on campaign_worker_ou (worker_id, group_id)`;
   `create or replace function cwo_set_group_id()` with the duplicate pre-check (`raise … errcode 23505,
   constraint 'campaign_worker_ou_one_unit_per_group'`); `create view campaign_group_membership` (§2.3) with
   grants; post-assertions (index exists, H9 = 0, view row arithmetic of §8.3).
6. Only after step 5 on a given database may `campaign_group_membership` be consumed and the later
   group-model consumer/flag be introduced. Rollback of step 5 = drop view, restore the derive-only trigger function,
   drop the unique index, recreate `idx_cwo_worker_group`.

---

## 7. Migration mechanics, locks, rollback (item 7)

### 7.1 One file, CLI-managed execution, ordered sections

File created **only after approval** with `npx supabase migration new wp2_1_campaign_groups` (filename
validated by `pnpm validate:migrations`). No applied migration is edited. The file contains no explicit
`BEGIN`/`COMMIT`, matching repository convention. Supabase CLI v2.84.4 executed each file as one implicit
pipelined transaction. The first 55006 failure rolled back every object and the ledger entry, proving
migration-file atomicity in the rehearsed path. PostgreSQL emitted 25P01 because this was not an explicit
transaction block; observed behavior nevertheless shows the named `SET CONSTRAINTS` flushed queued
deferred RI events, because both subsequent `ALTER TABLE` paths succeeded on two later applications.
This confirms the migration header's one-CLI-managed-transaction statement. The partial-object
precondition remains defense in depth. Production/operator execution must use the
rehearsed `supabase db push`, or an explicitly single-transaction alternative
`psql -1 -v ON_ERROR_STOP=1 -f <migration-file>`. Plain autocommit `psql -f` is forbidden: migration temp
tables and postconditions require one transaction. Sections, in order:

1. Helper functions (§2.5).
2. **Preconditions** (`DO` block; failure is a STOP, followed by an explicit partial-object/data check):
   0 placements on container rows; no case-insensitive name collision between a custom-kind container name
   and any reserved fixed/custom-type label or another container in the same campaign; capture `count(*)` of
   `campaign_worker_ou`, `campaign_worker_membership`, `campaign_organising_units` into a temp table.
   **H9 is reported (`RAISE NOTICE`) but is not a precondition** in WP2.1 (E2); it is WP2.2's precondition.
3. `create table campaign_groups` + indexes + trigger + comments + RLS + grants (§2.1, §2.6).
4. `add column group_id` on both tables (nullable), FKs (§2.2).
5. Backfill with the existing unit `updated_at` trigger left enabled: (a) custom-kind containers →
   `campaign_groups` rows (`source_ou_id`, name, rank 80+rn);
   (b) every other unit: `update … set group_id = (select campaign_group_ensure(...) from
   campaign_group_target_for_unit(...))` for rows that are not custom-kind containers;
   (c) `update campaign_worker_ou p set group_id = u.group_id from campaign_organising_units u where u.ou_id = p.ou_id`.
   The migration snapshots unit timestamps first, updates only units that receive a non-NULL `group_id`,
   and asserts/reports that exactly those rows advanced `updated_at`. (Under M1, if chosen against
   recommendation, Employer placement inserts would go here; M2 inserts none.)
6. Immediately after both backfill `UPDATE`s:
   `SET CONSTRAINTS public.campaign_organising_units_group_id_fkey, public.campaign_worker_ou_group_id_fkey IMMEDIATE;`.
   This fires and clears pending deferred RI update checks before subsequent table/index DDL while leaving
   both FK definitions `DEFERRABLE INITIALLY DEFERRED`. Under the rehearsed implicit pipelined transaction,
   PostgreSQL warns 25P01 because it is not an explicit transaction block, but the queued RI events were
   flushed: the following `ALTER TABLE` succeeded on both corrected applications, and postflight verified
   the intended catalog definitions.
7. Constraints and indexes: `NOT NULL` on `campaign_worker_ou.group_id`; `cou_leaf_requires_group`;
   `idx_cwo_worker_group` (non-unique); `idx_cwo_group_ou`; `idx_cou_group`.
8. Triggers (§4.2).
9. `user_campaign_prefs` (§2.6).
10. **Post-assertions** (`DO` block): the three counts equal the step-2 capture; every non-container unit
    has `group_id`; every placement's `group_id` equals its unit's; every unit's group is in its campaign;
    every custom-kind container has exactly one group with `source_ou_id`; `to_regclass` of
    `campaign_groups` and `user_campaign_prefs` not null; both group FKs are deferred `NO ACTION`; H9
    reported; timestamp-change set/count equals the units with populated `group_id`.

### 7.2 Locks and downtime

`ADD COLUMN` (nullable, no default), `ADD CONSTRAINT` and `CREATE INDEX` (non-concurrent, inside the
CLI execution) take `ACCESS EXCLUSIVE` on the two tables: ~239 + 1,652 rows, sub-second on the clone. The
backfill updates all 1,652 placement rows once. The first failed clone push was observed to roll back
every object and its ledger row, proving atomicity for the Supabase CLI v2.84.4 implicit pipelined
transaction. The partial-object guard and post-failure verification remain mandatory defense in depth.

### 7.3 Written rollback — `90_rollback_wp2_1_campaign_groups.sql` (recovery-only)

```sql
begin;
-- environment guard (§3.8)
drop trigger if exists trg_cwo_z_set_group_id on public.campaign_worker_ou;
drop trigger if exists trg_cou_z_after_group_change on public.campaign_organising_units;
drop trigger if exists trg_cou_y_default_group on public.campaign_organising_units;
drop function if exists public.cwo_set_group_id();
drop function if exists public.cou_after_group_change();
drop function if exists public.cou_default_group();
alter table public.campaign_worker_ou drop column if exists group_id;          -- drops FK, NOT NULL, idx_cwo_worker_group, idx_cwo_group_ou
alter table public.campaign_organising_units drop constraint if exists cou_leaf_requires_group;
alter table public.campaign_organising_units drop column if exists group_id;   -- drops FK and idx_cou_group
drop table if exists public.user_campaign_prefs;
drop table if exists public.campaign_groups;                                    -- drops policies, indexes, identity sequence, source_ou_id FK
drop function if exists public.campaign_group_ensure(integer, text, text, integer, integer);
drop function if exists public.campaign_group_target_for_unit(text, boolean, integer);
drop function if exists public.campaign_group_kind_for_ou_type(text);
-- POST-CHECK: counts/checksums and ten dependent views unchanged; both tables,
-- all six functions and all three maintenance triggers absent
commit;
```

Row data is untouched by the rollback (only added columns/objects are removed), so it is exact. No existing
view references the dropped columns (§5). Afterwards the migration history entry must be marked reverted
with `npx supabase migration repair --status reverted <version>` — **recovery-only, and it requires explicit
operator approval each time it is run, including during the stage-2 rehearsal** (it rewrites
`supabase_migrations.schema_migrations` on the linked project; read-back of `supabase/.temp/project-ref`
immediately before). If the cleanup must also be undone: `03b_rollback.sql` then `03a_rollback.sql`.
Regenerate types after a rollback on dev.

---

## 8. Test plan (item 8)

### 8.1 Unit tests (vitest) and static checks

- F1 matcher cases (§6.3), including maximum-specificity fallback suppression, partition isolation, ties,
  order, legacy FGK derivation, and JSON numeric `1.0` becoming runtime integer `1` while decimal/exponent
  strings remain rejected. No test touches Supabase.
- `pnpm validate:migrations` (`scripts/validate-supabase-migrations.mjs`).
- `pnpm --filter organising-db lint`; `pnpm --filter organising-db test`; `pnpm --filter organising-db build`
  (after types are regenerated from the clone for this shipment).

### 8.2 Migration SQL validation (clone)

- Clone `db push` succeeds; rollback (§7.3, with approved `migration repair`) then re-push; the final exact
  `04` file exits 0 and shared baseline evidence labels match. Mapping/group helper labels legitimately
  appear or disappear as their schema objects exist or are rolled back; A1 comparison never requires
  unlike stage-specific label sets to be identical.
- A deliberate precondition failure is rehearsed by running the migration file's precondition block alone
  against a temp table with one placement on a container row (not by mutating real data).

### 8.3 Before/after/rollback snapshots — proven on the **clone** (production-shaped)

- Counts: `campaign_worker_membership`, `campaign_worker_ou`, `campaign_organising_units`, `campaign_groups`.
- Checksums (md5 of ordered `string_agg`; names hashed, never printed):
  placements `(id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id)`;
  substantive units `(ou_id, campaign_id, ou_type, hash(name), total_workers_estimated,
  hash(source_metadata), anchor_worker_id, created_at, hash(commonality_logic), target_size, hash(source),
  display_order, unit_basis, parent_ou_id, is_group_container, ou_group_id, user_rating)`;
  unit `updated_at` is excluded from that substantive checksum and emitted under a separate stable-label
  metadata checksum; membership `(campaign_id, worker_id)`; rules `(rule_id, campaign_id, ou_id)`;
  dependant-reference checksums (§3.7).
  Expected: placements change only by the `03b` logged deletions/updates; units change only by the `03a`
  logged `unit_basis` edit plus its normal timestamp metadata, while migration backfill advances
  `updated_at` exactly for units receiving `group_id`; membership, rules and dependants remain identical.
  Migration-only `group_id` and metadata-only `updated_at` are excluded from substantive comparison.
- H1–H8 verbatim (appendix C §8.4 lines 429–475) + H9/H10, at five points: pre-`03a`, post-`03a`,
  post-`03b`, post-migration, post-rollback. Expected post-`03b`/post-migration: H1 = 0, H3 = 0, H9 = 0,
  H2/H5/H7 = 0, H6 unchanged (1,218/15), H8 unchanged (34 — informational), H4 unchanged, H10 = 0 after
  `03a` when "auto-match-enabled units per basis" is the measure.
- F1 evidence records pre-specificity multi-target partitions/excess, suppressed fallback targets,
  post-specificity equal-maximum residuals and affected campaigns. Equal-maximum residual = 0 immediately
  inside `03a` and again in `04`; a nonzero result rolls back the C1 transaction and requires the reviewed
  mapping-amendment loop in §3.4.
- Ten dependent views: `md5(pg_get_viewdef(c.oid))` and `reloptions` identical before/after.
- Capture the final stable-label aggregate/checksum result set from `00` and `04`. SQL Editor and `psql`
  format intermediate result sets/notices differently, so notices are supporting diagnostics rather than
  the sole evidence channel.
- Group-model assertions: every non-container unit has `group_id`; every placement's `group_id` = its
  unit's; number of distinct `(worker_id, group_id)` pairs = placement count (i.e. H9 = 0) — reported, not
  enforced. (The view row-arithmetic check moves to WP2.2 with the view.)

### 8.4 Generated types (clone for this release)

After explicitly confirming the linked/target ref, `SUPABASE_PROJECT_REF=yqjkuobcawvigsfpgrcm pnpm gen:types`
regenerates
`packages/db-types/generated.ts`. **Completed exit 0 on 2026-09-13.** The diff contains the expected WP2.1
tables, columns, relationships and functions plus one harmless generator-ordering change: two
`user_profiles_organiser_id_fkey` relationship entries swapped order. It is not a WP2.1-only-symbol diff.
Read-only inspection
confirmed both new tables, nullable `campaign_organising_units.group_id`, non-null
`campaign_worker_ou.group_id`, the generated relationships
`campaign_groups_campaign_id_fkey`, `campaign_groups_source_ou_id_fkey`,
`campaign_organising_units_group_id_fkey`, `campaign_worker_ou_group_id_fkey` and
`user_campaign_prefs_campaign_id_fkey`, the three functions, and no `campaign_group_membership` view.
Generated `campaign_worker_ou.Insert.group_id` is required even though
the database trigger derives it; WP2.2 must resolve that API/type boundary. Types must never be generated
with the script's default production ref. Normal dev may later be refreshed/replaced or migrated and
regenerated separately.

### 8.5 RLS role probes (`95_role_probes.sql`, rolled back; clone)

Using the two e2e accounts' ids looked up in-SQL by role (emails never printed), `set local role
authenticated` + `request.jwt.claims`: (a) `user` on a campaign they can write → custom-container rename
propagates, leaf insertion derives a group and placement insertion derives the same group; direct deletion
of that populated group fails when both deferred FKs are forced immediate; deletion of the populated
campaign succeeds and both FKs then validate; (b) direct empty-group CRUD succeeds; (c) `user` on a
campaign they cannot write → all writes fail, select succeeds; (d) `anon` → no access to
`campaign_groups` or `user_campaign_prefs`; (e) `user_campaign_prefs` owner can upsert/read/delete their
row, cannot read another user's row; (f) `service_role` can read both users' prefs.

`95_role_probes.sql` deliberately has no environment-marker guard because it is rollback-only. This is a
runbook constraint: execute the exact whole file only, with stop-on-error, never extracted statements or a
modified copy.

### 8.6 Normal-dev integration and preview waiver (2026-09-13)

The operator explicitly waived normal-dev WP2.1 schema migration and preview e2e for this deadline
shipment. Dev is thin, noncritical and materially unlike the production-shaped clone. Clone acceptance
does not convert the missing dev/e2e run into a pass: this is a conscious verification gap. `groups_v2`
is not yet introduced, no UI/schema consumer ships in WP2.1, and F1 reads only legacy columns. Dev may later be
refreshed/replaced or receive the migration and its own checks separately.

---

## 9. Exact verification commands and project-ref safety (item 9)

Every Supabase CLI command is immediately preceded by reading `supabase/.temp/project-ref` and pasting the
value into the evidence; a mismatch is a STOP. The production ref never appears in an agent command,
script, env var or executable SQL. Actual clone channels were: Supabase MCP `execute_sql` for authorised
`03a`/`03b` cleanup diagnostics, forward runs, rollbacks and reapplications; Supabase CLI for migration
push/dry-run, exact `04`/`95`/`90` execution and migration repair. Earlier text calling MCP read-only was
incorrect. No channel accessed production.

Stage 2 — clone (only after operator approval to link):

```
cat supabase/.temp/project-ref
npx supabase link --project-ref yqjkuobcawvigsfpgrcm
cat supabase/.temp/project-ref
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/00_preflight_hazards.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/02a_h10_canonical_basis_mapping.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/02b_placement_mapping.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03a_canonicalise_duplicate_bases.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03a_rollback.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03a_canonicalise_duplicate_bases.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03b_resolve_future_group_conflicts.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03b_rollback.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/03b_resolve_future_group_conflicts.sql
cat supabase/.temp/project-ref
npx supabase db push --dry-run
cat supabase/.temp/project-ref
npx supabase db push
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/04_postflight_hazards.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/95_role_probes.sql
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/90_rollback_wp2_1_campaign_groups.sql
cat supabase/.temp/project-ref
npx supabase migration repair --status reverted <version>          # explicit operator approval required
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/04_postflight_hazards.sql
cat supabase/.temp/project-ref
npx supabase db push
psql "$WP21_CLONE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp2.1/04_postflight_hazards.sql
npx supabase link --project-ref dpnnmkhabysfdogllsyh
cat supabase/.temp/project-ref
```

(`01_environment_marker.sql` is run by the operator on the clone before `03a`; the first `03a`/`03b` runs
are expected to STOP until the operator supplies `_oux_wp21_canonical_basis` and, if still needed,
`_oux_wp21_placement_mapping` rows from the `00` output.)

Stage 3 — repo:

```
pnpm validate:migrations
pnpm --filter organising-db lint
pnpm --filter organising-db test
pnpm --filter organising-db build
```

Stage 5 — normal dev (waived for the 2026-09-13 shipment):

No normal-dev mutation, schema migration or e2e is run for this shipment. The exact current `00` file was
run read-only and was clean on thin dev: 8 units, 111 memberships, 111 placements, F1 residual 0 and H10
residual 0. This is preflight context, not integration. Type generation used
`SUPABASE_PROJECT_REF=yqjkuobcawvigsfpgrcm pnpm gen:types`, completed exit 0 with the explicit clone target.
Any later normal-dev refresh/replacement, migration, `04`/`95` evidence, regenerated types and preview e2e
form a separate integration package. Git commands require explicit per-command agreement;
`supabase/.temp/*` remains protected.

---

## 10. Files, stages, acceptance evidence, risks, stop conditions (item 10)

### 10.1 File-by-file

| File | Action |
|---|---|
| `supabase/migrations/<ts>_wp2_1_campaign_groups.sql` | new (via `migration new`), §7.1 |
| `scripts/data-hygiene/oux-wp2.1/{README.md, 00_preflight_hazards.sql, 01_environment_marker.sql, 02a_h10_canonical_basis_mapping.sql, 02b_placement_mapping.sql, 03a_canonicalise_duplicate_bases.sql, 03a_rollback.sql, 03b_resolve_future_group_conflicts.sql, 03b_rollback.sql, 04_postflight_hazards.sql, 90_rollback_wp2_1_campaign_groups.sql, 95_role_probes.sql}` | new, §3/§7.3/§8.5 |
| `apps/organising-db/src/lib/workers/sync-campaign-universe.ts` + `__tests__/sync-campaign-universe.test.ts` | F1 |
| `packages/db-types/generated.ts` | regenerated from clone for this release; normal dev waived |
| `docs/organiser-ux-review/wp/wp2.1.md` | this file; evidence appended at stage 6 |
| `docs/organiser-ux-review/PROGRESS.md`, `HANDOFF.md`, `DECISIONS.md` | **evidence commit only** (§11) |
| Not touched | `move-worker-mutation.ts`, `merge-units-dialog.tsx`, split RPC/dialog, `scripts/data-hygiene/oux-wp0.4/*`, any applied migration, `supabase/.temp/*`, `.env*` |

### 10.2 Stages

0. Plan approval: E2, M2, C1, F1 (§12). No files change before this.
1. Repo artefacts written (migration file, twelve scripts, F1 + tests). No database touched.
2. Clone rehearsal (§9): preflight → operator mappings → `03a` forward/rollback/forward → `03b`
   forward/rollback/forward → migration push → postflight/probes → rollback (`90` + approved `repair`) →
   re-push → postflight/probes. **Complete/green; CLI relinked to normal dev.**
3. Verifier: lint/test/build/validate; re-reads snapshots; diffs the `FGK-EXPRESSION` copies; confirms no
   production ref and no ids in committed scripts.
4. Reviewer (Fable) against the checklist in `IMPLEMENTATION_ORCHESTRATION_PROMPT.md`; fix rounds.
5. Operator waiver: skip normal-dev schema/e2e for this shipment; types generated from migrated clone.
6. Single evidence commit (plan + evidence + ledger reconciliation §11); PR only when requested.

### 10.3 Acceptance-evidence matrix

| Acceptance clause | Evidence (environment) |
|---|---|
| membership counts unchanged | `00` vs `04` count + membership checksum (clone) |
| every leaf unit with a group_id | post-assertion + `04` query (clone and dev) |
| zero one-unit-per-group violations | H9 = 0 in `04` after `03b` (clone); **uniqueness deferred to WP2.2 by approved deviation §0.1** |
| H1–H8 reproduced before and after | `00`/`04` outputs pasted verbatim at the five points of §8.3 (clone) |
| written rollback | `90_…sql` in repo + rehearsal output (clone) |
| "rehearsal on a production-seeded dev database" | satisfied by the production-shaped clone; normal-dev schema/e2e waived for this shipment as an explicit verification gap |
| views recreated in order | not required (§5); ten view md5/reloptions identical (clone) |
| full mode keeps working | no client writer changed except legacy-column-only F1; clone role probes and local tests green; normal-dev preview e2e waived as an explicit gap |

### 10.4 Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Same-group duplicates accumulate between WP2.1 and WP2.2 | accepted (identical to today); F1 removes the main source; WP2.2 re-runs `03b` before enforcing |
| R2 | Cleanup deletes a placement the operator wanted | STOP-not-choose; every delete logged with reason; `03b_rollback` rehearsed |
| R3 | Migration or script run against the wrong project | read-back before every CLI command; production ref never typed; marker/same-transaction guard on mutating scripts; clone relinked to dev immediately |
| R4 | Trigger-created groups fail RLS for a `user`-role organiser | policies share the WP1.6 predicate; probe (a) |
| R5 | `anon` inherits rights via default privileges | explicit REVOKE on every new table/sequence; probe (c) |
| R6 | Name collision between a container name and a reserved fixed/custom-type label | precondition check; runtime readable error |
| R7 | expected `updated_at` churn obscures substantive unit drift | keep the existing trigger enabled; exclude `updated_at` only from the comprehensive substantive checksum, emit a separate timestamp checksum, and assert/report migration timestamp changes equal populated `group_id` rows |
| R8 | C1 flag ignored by a reader other than the matcher | flag is additive; only the matcher reads it; F1 tests cover it |
| R9 | Recompute deletes universe-sync rows (pre-existing) | recorded for WP2.2 (§3.6); no relabelling |
| R10 | Generated types drift | clone generation exit 0; expected schema inspected; harmless two-entry relationship ordering swap accepted in final review; explicit ref mandatory |
| R11 | `migration repair` misused | recovery-only; explicit approval per run; read-back first |

### 10.5 Stop conditions

Stop and report (no fix attempts) if: a WP2.1 precondition fails on dev; `03a`/`03b` report unmapped sets or
unresolved partitions the operator has not mapped; `supabase/.temp/project-ref` reads anything but the
expected ref; any view md5 differs after the migration; membership, rules or dependant-reference checksums
differ at any point; the placement count differs from `before − 03b deletions`; the F1 tests fail; the
operator declines E2 (E1 needs a different plan).

Deviations: approved §0.1 (E2 incl. view deferral), §4.4 (M2), §5 (views not recreated), plus the dated
normal-dev schema/e2e waiver in §8.6. The waiver is a verification gap, not a pass.

Operator decisions E2/M2/C1/F1 and the specificity/FK amendments: **approved**. Clone rehearsal:
**complete/green**. Clone-generated types and final local gates: **complete**. Final reviewer:
**APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**. Evidence commit and PR: **pending**.

---

## 11. Ledger reconciliation — for the evidence commit only (item 11)

Do not edit during planning or implementation. At stage 6, in the same single commit:

- `PROGRESS.md`: WP2.3 row → "merged, PR #38 at `4d2ff4b`"; WP2.1 row → status, clone ref
  `yqjkuobcawvigsfpgrcm` (disposable rehearsal), baseline `4d2ff4b`, evidence pointers; incidental
  findings: `vw_call_action_report` lacks `security_invoker`; split RPC granted to `anon` (§1.2);
  Recompute deletes universe-sync rows (§3.6); universe-sync OR-matching as the H1 mechanism (D2);
  campaign-57 H10 duplicate bases and the C1 flag (D3).
- `HANDOFF.md`: current status → phase-1 production complete; `develop` at `4d2ff4b`; WP2.1 state; the
  orphan-rule pre-task is subsumed by `scripts/data-hygiene/oux-wp2.1/03b_…` (WP0.4 script 03 not
  rewritten); uniqueness enforcement is WP2.2's first deliverable (§6.4); the operator runs
  `00_preflight_hazards.sql` on production before the phase-2 deploy (agent never).
- `DECISIONS.md`: record E2, M2, C1, F1 and the §0.1 deviation.

---

## 12. Operator decisions and approvals

Three decisions, each stated so it can be answered without cross-reference:

| # | Question | Recommendation |
|---|---|---|
| **E** | Uniqueness timing: **E1** install `UNIQUE (worker_id, group_id)` in WP2.1 (needs the split RPC and move/merge clients rewritten first — not covered by this plan) **or** **E2** defer the unique index, the duplicate-rejecting trigger check and the `campaign_group_membership` view to WP2.2's enforcement migration, recorded as a deviation from WP2.1's minimum acceptance | **E2** |
| **M** | Employer-group placements: **M1** insert them in the WP2.1 backfill onto the 18 employer-container rows **or** **M2** create the Employer group only and let WP2.2 materialise placements via the structure API | **M2** |
| **C** | Campaign-57 duplicate worksite bases: **C1** keep every unit and flag the non-canonical ones `unit_basis.auto_match=false` (audited, reversible; operator supplies the canonical unit per basis from the preflight output) **or** **C2** destructive unit merge in a separately reviewed later package | **C1** |

Not operator decisions (resolved by safety constraints or pure/reversible design): F1 matcher fix (required;
approved as part of the plan), `department` → custom "Department", index/trigger names, script numbering,
environment-guard mechanism.

Post-review approval: after the §14.5 clone STOP, the operator approved only the F1
maximum-basis-specificity amendment and alignment of its SQL simulations/resolution logic. This does not
approve another database execution or any other stage.

Approvals required, in order:

1. Approve this plan with E2, M2, C1 and the F1 scope addition.
2. Approve `npx supabase migration new wp2_1_campaign_groups`.
3. Approve linking the CLI to the clone `yqjkuobcawvigsfpgrcm` for stage 2 (immediate relink to dev
   afterwards); provide `WP21_CLONE_DB_URL` in the implementer's shell (never printed) or run the mutating
   scripts yourself; run `01_environment_marker.sql` on the clone; supply the two mapping tables' rows from
   the preflight output.
4. Approve each `npx supabase migration repair --status reverted <version>` individually (recovery-only).
5. **Superseded 2026-09-13:** normal-dev schema/e2e is waived for this shipment. Generate types from clone;
   approve each git command individually. Production application remains a later operator-only gate.

### Recommended sequence

(a) approve E2 / M2 / C1 and the F1 matcher fix →
(b) implement the scripts and the schema migration **without** unique enforcement →
(c) clone: cleanup forward/rollback/forward, schema migration push/rollback/re-apply, snapshots and probes →
(d) clone-generated `packages/db-types/generated.ts`, final verifier/reviewer →
(e) ship to `develop`/`main` before `groups_v2` is introduced, under the recorded normal-dev waiver →
(f) WP2.2 immediately delivers the transactional structure API and the enforcement migration (§6.4) before
any later group-model consumer exists.

---

## 13. Revision history

- **Revision 1** (2026-09-12): initial plan; recommended immediate uniqueness with client compat patches;
  rejected.
- **Revision 2** (2026-09-12): uniqueness and membership view deferred to WP2.2 (E2) with an exact handoff;
  only the matcher fix (F1) remains as code; H10 handled by non-destructive canonical-basis flag (C1) with
  its own mapping table; rule provenance defined as attributable vs unattributed, `assignment_source`
  preserved; unique decision labels; generated-types path corrected to `packages/db-types/generated.ts`;
  production guard corrected to same-submission `set local`; clone vs normal-dev roles separated;
  verification commands un-chained; `migration repair` marked recovery-only with per-run approval; split
  RPC `anon` grant recorded as a pre-existing advisory; open decisions reduced to E, M, C.
- **Post-review amendment** (2026-09-12): after the transactional 03a STOP, F1 now retains only
  maximum-specificity matches per campaign/future group; SQL exposure and 03b keeper logic are aligned.
  E2/M2/C1 and schema DDL are unchanged.
- **Recovery amendment** (2026-09-12): records successful clone cleanup and rollback cycles, the failed and
  later successful migration attempts, postflight/role-probe evidence, schema rollback and ledger repair,
  and mechanical recovery after an external checkout discarded the uncommitted repository artefacts.
- **Shipment waiver** (2026-09-13): operator directs shipment from production-shaped clone evidence,
  explicitly waives normal-dev schema/e2e for this release, and directs pending type generation from the
  clone. This records a verification gap and does not authorise production application.

---

## 14. Stage-1 repository implementation evidence

Stage-1 implementation completed 2026-09-12 as repository artefacts. Subsequent explicitly authorised
database mutations were confined to the disposable clone and are recorded below. Production was never
queried or touched by the agent; normal dev has not received WP2.1. No types were generated and no app
dev/start, commit or push was performed.

### 14.1 Files implemented

- `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql`
- `scripts/data-hygiene/oux-wp2.1/README.md`
- `scripts/data-hygiene/oux-wp2.1/00_preflight_hazards.sql`
- `scripts/data-hygiene/oux-wp2.1/01_environment_marker.sql`
- `scripts/data-hygiene/oux-wp2.1/02a_h10_canonical_basis_mapping.sql`
- `scripts/data-hygiene/oux-wp2.1/02b_placement_mapping.sql`
- `scripts/data-hygiene/oux-wp2.1/03a_canonicalise_duplicate_bases.sql`
- `scripts/data-hygiene/oux-wp2.1/03a_rollback.sql`
- `scripts/data-hygiene/oux-wp2.1/03b_resolve_future_group_conflicts.sql`
- `scripts/data-hygiene/oux-wp2.1/03b_rollback.sql`
- `scripts/data-hygiene/oux-wp2.1/04_postflight_hazards.sql`
- `scripts/data-hygiene/oux-wp2.1/90_rollback_wp2_1_campaign_groups.sql`
- `scripts/data-hygiene/oux-wp2.1/95_role_probes.sql`
- `apps/organising-db/src/lib/workers/sync-campaign-universe.ts`
- `apps/organising-db/src/lib/workers/__tests__/sync-campaign-universe.test.ts`
- `docs/organiser-ux-review/wp/wp2.1.md` normative sections and this evidence section

No ledger, applied migration, generated type, Supabase temp, package/lock/env, WP0.4, WP2.3 or unrelated
source file was edited.

### 14.2 Implemented schema and cleanup behaviour

The migration file has no explicit transaction wrapper. Clone `db push` used a pipelined implicit
transaction rather than an explicit transaction block; see the 25P01 advisory in §14.8. It creates
`campaign_groups` with the fixed kind/name contract,
the existing-unit-compatible `varchar(200)` name capacity, safe provenance and explicit FK delete
semantics; backfills every approved legacy shape; adds/maintains `group_id`; creates the non-unique
support/index set; installs RLS, grants, ownership, comments and explicit PUBLIC/`anon`/`authenticated`
revokes before narrow grants; and creates owner-only `user_campaign_prefs`. Both unit and placement
`group_id` FKs are `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`, allowing campaign cascades to
finish before validation while direct group deletion still fails if either dependent shape survives. The
migration snapshots/asserts the ten existing view definitions and
reloptions without dropping or recreating a view. Under E2 it creates neither the unique
`(worker_id, group_id)` index nor its duplicate-rejecting trigger check nor
`campaign_group_membership`. Under M2 it inserts no Employer placements. The pre-existing unit
`updated_at` trigger remains enabled during group backfill. The migration snapshots timestamps, updates
only units receiving a populated `group_id`, and asserts/reports that the changed-timestamp set is exactly
that populated set; timestamp metadata is excluded only from the comprehensive substantive unit checksum.

The cleanup scripts use separate canonical-basis and placement mappings with no committed source IDs.
Both persistent unit-referencing helpers have stable primary keys and cascading metadata FKs, so dynamic
checksums can order them and they cannot block full-mode unit/campaign deletion; the canonical table keeps
the approved expression unique index in addition to its identity PK. `03a` validates complete/current
mappings, preserves each unit and all unrelated `unit_basis` fields, logs the exact rows, and changes only
top-level `auto_match=false` plus the normal `updated_at` trigger effect; its rollback restores both fields
exactly. `03b` attributes rules only through a live rule on the unit, applies mapping → unique
maximum-specificity current-dimension match → unique primary → single manual versus unattributed rule
order, preserves
`assignment_source`, and logs every promotion/deletion. Its first transaction replaces ID-only diagnostics
with `planned`/`unresolved` state; its change transaction marks `applied` only on success; rollback marks
`rolled_back`; active audit rows prohibit a second apply until rollback. Dynamic FK discovery/checksums
exclude only `campaign_worker_ou` (separately checksummed and intentionally changed by `03b`) and cover all
other `ou_id` dependants.

The amended F1 matcher leaves campaign-universe membership OR semantics unchanged. OU placement skips
containers and `auto_match=false`, requires at least one parsed employer/worksite basis, requires every
present parsed basis to match, then keeps only maximum-specificity candidates per campaign/future group.
The future-group key is derived entirely from pre-migration legacy type/container fields and retained
candidates preserve input order. Tests cover employer-only/worksite-only match and mismatch, both-key
match and each-side mismatch, disabled/no-key units, fallback suppression/retention, partition isolation,
equal-specificity ties, output order, legacy FGK derivation, the mixed-child regression, and existing cases. Basis
parsing covers the same accepted positive int4 value domain as cleanup SQL for representable runtime
values: integer numbers or digit strings are accepted; floats, negatives, decimal/exponent strings,
whitespace-padded strings and overflow are ignored. JavaScript necessarily treats JSON numeric `1.0` as
runtime integer `1`; this case is explicit in the tests and no lexical byte-equivalence claim is made.

### 14.3 Local verification

These gates were captured before the 2026-09-13 docs/type-source amendment. They remain valid historical
evidence; final post-types local verification is recorded in §14.12.

- `pnpm validate:migrations`: **PASS** — 10 migrations, unique 14-digit versions.
- Targeted sync-campaign-universe Vitest: **PASS** — 1 file, 37 tests.
- `pnpm test` from `apps/organising-db`: **PASS** — 83 files, 1,118 tests.
- `pnpm tsc --noEmit -p tsconfig.json`: **PASS**.
- Touched-file ESLint: **PASS**, no findings.
- `pnpm lint`: repository baseline remains exactly **294 problems** (143 errors, 151 warnings), exit 1 as
  expected; touched files are clean.
- `pnpm build`: **PASS** (Next.js 16.1.6 production build).
- IDE diagnostics on the touched TypeScript and SQL paths: **none**.
- Static SQL review: **PASS** — the five delimited future-group-key CASE expressions are byte-identical;
  no production project ref, hard-coded mapping/source IDs, contact/person-name selection, existing-view
  drop, Employer-placement insert, deferred membership-view DDL, or deferred unique-index DDL was found;
  the migration has no explicit `BEGIN`/`COMMIT`; both group FKs have the exact deferred `NO ACTION` shape;
  all approved mutating cleanup/recovery scripts have environment
  guards; all twelve approved artefacts are present. Review-round static checks also confirmed the renamed
  trigger/rollback pairing, helper PK/cascade pairing, explicit `03b` statuses, group-id-independent
  rollback comparisons, conflict-table version precheck, post-C1 F1 STOP, stable 00/04 evidence labels,
  complete rollback object assertions, and authenticated privilege revokes. Amendment checks confirm
  maximum-specificity ranking in `00`/`03a`/`03b`/`04`, unchanged byte-identical FGK blocks, and a loader
  select containing only pre-migration OU columns. Timestamp-amendment checks confirm the migration has
  no unit-trigger disable/enable or `session_replication_role`, captures/asserts the exact changed-timestamp
  set, and `00`/`04` use matching comprehensive substantive-unit fields plus a separate stable-label
  `updated_at` metadata checksum. The deferred-FK override check confirms exactly one named
  `SET CONSTRAINTS ... IMMEDIATE` between the placement backfill and the first following `ALTER TABLE`;
  `03a_rollback` likewise flushes deferred checks before trigger re-enable.

### 14.4 Implementation-level deviations and readiness

There is no deviation from E2, M2 or C1. F1 has the narrow operator-approved maximum-specificity amendment
recorded above; no broader approval is claimed. Pre-rehearsal review fix round 1 resolved its two blockers;
round 2 then identified and closed the remaining terminal blocker: the unit-side `RESTRICT` FK retained an
order-dependent campaign cascade diamond. The final implementation records these corrections, constraints
and hardenings:

**Reviewer BLOCK (round 2): CLOSED in repository artefacts.** Both unit and placement group references now
use the identical deferred `NO ACTION` shape; migration/postflight assert both, and `95` covers direct-group
rejection plus populated campaign deletion. Clone database proof is complete; normal-dev proof remains
waived for this shipment.

1. PostgreSQL cannot put `coalesce(...)` expressions in a primary-key constraint, so
   `_oux_wp21_canonical_basis` keeps the plan's exact logical key as a unique expression index and now has
   a separate identity primary key for dynamic dependant-checksum ordering. The placement mapping already
   has a stable composite PK.
2. The unit BEFORE and AFTER triggers list `campaign_id`; the AFTER trigger also lists `ou_group_id` and
   `parent_ou_id`. PostgreSQL
   `UPDATE OF` is based on the statement's target list, not values changed by a BEFORE trigger; omitting
   these columns would fail to cascade a derived group change after reparenting. Container provenance also
   follows a campaign move as well as a rename.
3. The two mapping-table creation scripts use the same environment guard as the mutating cleanup scripts,
   tightening the approved safety boundary.
4. The derivation trigger is named `trg_cou_y_default_group`, sorting after the existing
   `trg_cou_enforce_*` BEFORE triggers so they normalise legacy hierarchy fields first. The revision-2
   illustrative trigger name/order is superseded by this reviewed correction; rollback and postflight use
   the corrected name.
5. Both unit and placement `group_id` use deferred `NO ACTION`. This removes both order-dependent
   campaign-delete cascade diamonds without cascading direct group deletion into product rows. Postflight
   asserts the exact shape; the rolled-back role probe artefact rejects direct populated-group deletion,
   deletes a populated campaign, then forces both constraints immediate. The exact probe completed on the
   clone and rolled back without residue.
6. Mapping rows are rehearsal/control metadata. Their canonical/keeper unit FKs cascade so full-mode
   deletion is not blocked and `keep_ou_id` is never converted to NULL/remove-all. `90` deliberately leaves
   hygiene helpers/logs available for the documented cleanup rollback sequence.
7. `03b` has explicit `unresolved`/`planned`/`applied`/`rolled_back` diagnostics. Unresolved or aborted
   attempts can be recomputed; one successful apply is allowed per rollback cycle, preventing a failed or
   aborted transaction from appearing applied.
8. Leaf-to-container conversion is not a supported WP2.1 writer flow. A populated custom-kind leaf
   conversion is rejected when placement propagation encounters the container's NULL group; other direct
   conversions are not newly normalised by WP2.1. No current application writer for that transition was
   identified, so this remains a documented structural-writer constraint rather than a scope expansion.
9. Source-less custom group lookup explicitly excludes provenance-backed groups; all reserved labels
   (`Custom`, `Network`, `Ethnic community`, `Accommodation`, `Department` plus fixed labels) are included
   in collision preconditions. Group names retain the full existing 200-character unit-name capacity.
10. New exposed/helper tables and identity sequences revoke default privileges from `authenticated` before
    granting only intended access. Postflight and role probes assert no authenticated `TRUNCATE`, helper,
    or unintended sequence privileges.
11. Review fix round 2 removed explicit migration `BEGIN`/`COMMIT` to use the Supabase CLI transaction,
    added the post-C1 F1 STOP inside `03a`, added stable final evidence result sets to `00`/`04`, versioned
    the persistent `03b` conflict-table shape, and strengthened `90` to prove all maintenance
    triggers/functions are absent.
12. The approved matcher amendment ranks eligible matches only within `(campaign_id, fgk, worker_id)`.
    Lower-specificity matches remain fallbacks when no more-specific row matches; equal-maximum ties remain
    subject to C1 and the hard STOP. TypeScript derives the same FGK from legacy columns, while
    `00`/`03a`/`03b`/`04` use the delimited SQL specificity ranking.
13. A clone `db push` exposed PostgreSQL error `55006` at the statement that attempted to re-enable
    `trg_campaign_organising_units_updated_at`. The root cause was pending deferred FK update checks from
    the unit and placement `group_id` backfills; trigger re-enable was only the first following
    `ALTER TABLE` statement to encounter them. The operator overrode the earlier timestamp-only diagnosis:
    both trigger-altering statements stay removed, and the migration now issues the exact named
    `SET CONSTRAINTS ... IMMEDIATE` immediately after the two backfill updates. It does not use
    `session_replication_role` or alter the existing trigger/function. Expected timestamp churn remains
    explicit evidence rather than suppressed.
14. `03a_rollback.sql` now clears all deferred constraints immediately after restoring the audited rows
    and before re-enabling the existing timestamp trigger. This is an ordering hardening only; its
    before/after restoration, audit lifecycle and cleanup semantics are unchanged.

The pre-existing `vw_call_action_report` owner-rights/security-invoker advisory and split-RPC `anon` grant
remain unchanged and out of WP2.1 scope. No existing view definition or grant was altered.

### 14.5 Authorised clone 03a STOP and amendment evidence

The clone precheck returned one `env='clone'` marker, 13 canonical mappings and zero placement mappings.
Executing the committed pre-amendment `03a` as one MCP query returned exactly:
`ERROR P0001: 03a STOP: 226 live campaign-universe future-group/worker partitions retain multiple enabled
F1 targets; this transaction is rolled back—extend the canonical mapping only under a reviewed plan
amendment before 03b`. Read-only rollback verification returned 239 units, 16 expected noncanonical units,
zero total/mapped `auto_match=false` units, and zero active/total 03a log rows. No product or audit change
persisted.

The operator then approved only the maximum-specificity amendment. The supplied read-only clone
simulation result is 226 pre-specificity multi-target partitions / 226 excess targets, 226 fallback
targets suppressed, zero post-specificity partitions / zero excess, one campaign affected. Fresh review
approved that narrow amendment; amended `03a` then completed the forward/rollback/reapply cycle in §14.7.

### 14.6 Authorised clone migration failure and deferred-FK flush amendment

The first clone `db push` failed exactly with:
`ERROR 55006 cannot ALTER TABLE campaign_organising_units because it has pending trigger events`
at the statement re-enabling `trg_campaign_organising_units_updated_at`. Subsequent review established
that pending deferred FK update checks from the two `group_id` backfills were the cause; trigger re-enable
was merely the first statement to encounter them. The CLI-managed migration transaction rolled back fully.
Read-only verification found the migration absent from the ledger;
`campaign_groups`, `user_campaign_prefs`, and both `group_id` columns absent; 239 units, 1,618 placements
and 2,726 memberships; and the authorised cleanup state retained at 16 active `03a` changes and 34 active
`03b` deletion logs.

The operator explicitly overrode the earlier timestamp-only correction and approved the named deferred-FK
flush plus the narrow `03a_rollback` ordering hardening recorded in items 13–14. That correction received
fresh review before the later successful clone applications; all prior security, FK, E2/M2/C1/F1,
specificity, timestamp-evidence and rollback decisions remained intact.

### 14.7 Authorised clone cleanup forward/rollback/reapply evidence

The active disposable clone marker was exactly `clone`. Initial production-shaped baseline was 239 units,
1,652 placements and 2,726 memberships; H9 was 10 partitions / 34 excess rows, H10 had 13 duplicate
enabled-basis sets, and 234 rule-source placements were unattributed to a live rule on their unit. The
operator supplied 13 canonical-basis mappings and one placement mapping: campaign 57 /
`kind:worksite` / worker 3014 → keeper OU 556.

After the maximum-specificity amendment, exact committed `03a` execution succeeded with 16
`units_disabled_and_logged`. Aggregate verification showed 239 units, 1,652 placements and 2,726
memberships; 16 mapped noncanonical units had `auto_match=false`; all 13 mapped bases had exactly one
enabled unit; active valid `03a` logs numbered 16; and the equal-maximum-specificity F1 residual was zero.
No product row or dependent OU reference was deleted.

The authorised `03a_rollback.sql` rehearsal restored the same 239/1,652/2,726 product counts, zero mapped
disabled units, zero active and 16 rolled-back `03a` logs, and multiple enabled candidates for all 13
bases. Exact `03a` reapply then restored 16 disabled units and 16 new active valid logs while retaining
the prior 16 rolled-back logs; the residual remained zero and product/dependent counts remained unchanged.

Initial exact `03b` Block 1 diagnostics found 10 future-group conflicts: nine planned
`unique_dimension_match` partitions and one unresolved partition requiring operator mapping. The reviewed
mapping was campaign 57 / `kind:worksite` / worker 3014 → keeper OU 556. Re-running exact Block 1 yielded
10 planned rows, nine `unique_dimension_match` and one `mapping`, with zero unresolved rows and no product
change.

Exact full `03b` then applied all 10 partitions, deleting 34 placement rows and making zero primary-update
changes: 239 units, 1,618 placements and 2,726 memberships remained. It produced 34 active valid delete
logs; H1/H2/H3/H5/H7/H9 were zero; 1,508 campaign members remained in at least one unit with the recorded
coverage checksum `92b812e3af78b5526806a421ca6dc103` unchanged; `03a` state remained 16; and unit,
membership and dependent OU references were unchanged. The authorised `03b_rollback.sql` rehearsal
restored 1,652 placements, H9 10 partitions /
34 excess, zero active and 34 rolled-back delete logs, and 10 `rolled_back` diagnostics. Exact full reapply
returned to 1,618 placements, 10 `applied` diagnostics, 34 new active delete logs plus the retained 34
rolled-back logs, all listed hazards zero, and the same 1,508-member coverage/dependent checksums.

### 14.8 Successful migration, postflight, probes and recovery

The first corrected application reported preflight H9 0/0,
`WARNING 25P01 SET CONSTRAINTS can only be used in transaction blocks`, expected `updated_at` metadata
churn on 237 populated units, postflight H9 0/0, and `db push` exit 0. Terminal review established the
precise interpretation: Supabase CLI v2.84.4 executes the file as one implicit pipelined transaction, not
an explicit transaction block, which causes the warning. The first 55006 attempt fully rolled back all
objects and its ledger entry, proving atomicity. On both corrected applications the named statement still
flushed queued deferred RI events—the subsequent `ALTER TABLE` succeeded—and catalog verification showed
both FKs remained `DEFERRABLE INITIALLY DEFERRED`. Preserve 25P01 as deployment evidence; it is neither a
migration failure nor evidence that the flush was skipped.

Exact postflight and the fully rolled-back role probes were green on the clone, including deferred-FK,
derive-trigger, RLS/grant, campaign-delete and E2 object-boundary checks.

The schema recovery rehearsal then removed WP2.1 schema objects/columns while retaining cleanup. The first
separately approved migration-repair attempt failed because the shell supplied a stale password; it made no
ledger change. The guarded approved retry succeeded and marked `20260912035329` reverted. The clone then
had schema/ledger reverted while `03a` 16 and `03b` 34 remained applied.

### 14.9 External checkout loss and repository recovery

An external switch to old `main` and back to `feat/oux-wp2.1-schema-migration` discarded the uncommitted
WP2.1 repository artefacts. This is a process deviation, not a product/schema decision. Recovery used the
retained revision-2 full-document write and the implementer's ordered patch history: 340 applicable hunks
were replayed in memory; one earlier failed README hunk was skipped because its corrected replacement was
present later in the history. The exact migration version/path, all 12 hygiene/recovery artefacts, the F1
source/test and this plan were then restored. No Git command or database action was used for recovery.

Semantic identity to the latest reviewed state is asserted by the recovered behavior and static/local
gates. Byte identity cannot be guaranteed independently because the discarded working-tree files no
longer exist for a byte comparison; the migration and scripts were reconstructed from their exact ordered
patch payloads rather than rewritten from memory.

The recovered cleanup scripts were **not** re-executed from the recovered bytes. Their prior clone
cleanup evidence proves the pre-loss versions, while static semantic review covers the recovered files;
this is carried as a production-application gate and is not a `develop`/`main` merge blocker under the
operator waiver. The recovered migration, exact `04`, and exact `95` were re-run successfully after
recovery; do not describe the recovered cleanup files themselves as byte-rehearsed.

### 14.10 Post-recovery local verification

This is the successful recovery gate; the later final verification after clone type generation is
recorded separately in §14.12.

- `pnpm validate:migrations`: **PASS** — 10 unique 14-digit migration versions, including the restored
  `20260912035329` path.
- Targeted F1 Vitest: **PASS** — 1 file, 37 tests.
- Full `pnpm test`: **PASS** — 83 files, 1,118 tests.
- `pnpm tsc --noEmit -p tsconfig.json`: **PASS**.
- Touched-file ESLint: **PASS**, no findings.
- `pnpm lint`: expected repository baseline — 294 problems (143 errors, 151 warnings), exit 1; touched
  files remain clean.
- `pnpm build`: **PASS** — Next.js 16.1.6, 130 static pages generated.
- IDE diagnostics on recovered source, SQL and documentation: none.
- Static recovery checks: **PASS** — five 324-character FGK blocks are byte-identical; specificity ranking
  remains in `00`/`03a`/`03b`/`04`; both group FKs remain deferred `NO ACTION`; the exact named constraint
  flush is after both backfills and before following table/index DDL; migration trigger suppression remains
  absent; helper PK/CASCADE FKs, 03a residual STOP, 03b schema/status guard, rollback-safe comparisons,
  narrow grants, final 00/04 evidence, 90 object assertions, expanded 95 probes and 03a rollback flush are
  present. No executable production ref, PII selection, hard-coded mapping, Employer-placement insert,
  membership-view creation or worker/group uniqueness enforcement was found.

### 14.11 Final guarded clone reapply and current handoff

After recovery and fresh semantic review, the final guarded `db push` reapplied the same single WP2.1
migration successfully with the same 25P01 warning and expected notices. The migration ledger contained
all ten versions. Executing the exact current `04_postflight_hazards.sql` exited 0.

Final aggregate evidence was:

- 20 groups: custom 5, employer 3, occupation 1, shift 1, work_area 4 and worksite 6;
- 239 units, of which 237 had `group_id`; the two legacy custom-kind containers correctly retained NULL;
- 1,618 placements, all with non-NULL `group_id` equal to their unit; 2,726 memberships; zero preferences;
- two `group_id` FKs with `NO ACTION`, deferrable and initially deferred;
- no `campaign_group_membership` view and no one-unit-per-group unique enforcement;
- 16 active valid `03a` rows and 34 active valid `03b` deletion rows;
- F1 pre-specificity partitions 226, fallback targets suppressed 226 and equal-maximum residual 0;
- H1/H2/H3/H5/H7/H9 zero, H6 unchanged at 1,218/15, H8 unchanged at 34 and H10 enabled duplicates zero;
- the final `04` aggregate/checksum result set was captured. All shared application/dependant labels,
  including membership coverage 1,508 / `92b812e3af78b5526806a421ca6dc103`, matched the approved cleanup
  baseline. A1 comparison applies to shared labels; mapping/group helper labels legitimately
  appear/disappear across pre-cleanup, installed-schema and rollback stages. All ten pre-existing view
  definition/reloptions labels were unchanged where comparable.

Executing the exact current `95_role_probes.sql` exited 0 and rolled back fully. Residue counts remained
22 campaigns, 20 groups, 239 units, 1,618 placements, 2,726 memberships and zero preferences.

The clone rehearsal is complete and green. The CLI's final linked ref was restored to normal dev
`dpnnmkhabysfdogllsyh`. Every database mutation in this work was clone-only; production was never queried
or touched by the agent. On 2026-09-13 the operator waived normal-dev schema/e2e for this shipment and
directed type generation from the clone. Clone-generated types and final local gates are complete; final
reviewer approved for PR/main with the production DB gate. Evidence commit and PR remain pending.
Production application remains blocked on the operator's current
production `00` preflight, reviewed canonical/placement mappings, rehearsed cleanup and migration sequence.
This evidence is not final package approval.

### 14.12 Final release gates after dev waiver (2026-09-13)

- Clone type generation:
  `SUPABASE_PROJECT_REF=yqjkuobcawvigsfpgrcm pnpm gen:types` — **exit 0**, wrote
  `packages/db-types/generated.ts`.
- Generated-type inspection: `campaign_groups` and `user_campaign_prefs` are present;
  `campaign_organising_units.group_id` is nullable with its `campaign_groups` relationship;
  `campaign_worker_ou.group_id` is non-null with its relationship; generated FK relationships include
  campaign-group campaign/source, both group-id links and preference campaign; `campaign_group_ensure`,
  `campaign_group_kind_for_ou_type` and `campaign_group_target_for_unit` are present; deferred
  `campaign_group_membership` is absent. `campaign_worker_ou.Insert.group_id` is required by generated
  typing despite trigger derivation and is a binding WP2.2 API concern. The only non-WP2.1-symbol diff is
  a harmless generator ordering swap of two `user_profiles_organiser_id_fkey` relationship entries.
- TypeScript: **exit 0**.
- Migration validation: **10 valid migrations**.
- Targeted F1: **37/37**.
- Full tests: **83 files / 1,118 tests**.
- Touched-file ESLint: **exit 0**.
- App lint: exactly **294** findings (**143 errors / 151 warnings**), accepted unchanged baseline.
- App build: **exit 0**, Next.js 16, **130 routes**.
- Thin normal-dev evidence: exact current `00_preflight_hazards.sql` ran read-only and clean with 8 units,
  111 memberships, 111 placements, F1 residual 0 and H10 residual 0. No WP2.1 schema migration or e2e ran
  there; the operator waiver remains an explicit gap and dev is not called integrated.
- Active CLI ref after evidence: normal dev `dpnnmkhabysfdogllsyh`.

Final reviewer verdict: **APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**. WP2.1 is ready for the evidence
commit and PR/main path. No commit, PR or merge is claimed.
