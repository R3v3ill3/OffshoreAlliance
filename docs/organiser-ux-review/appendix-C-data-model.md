# C — Data model audit: campaign architecture (universe → groups → units)

Read-only audit of the Supabase/Postgres schema in `/home/user/OffshoreAlliance` as of migration `20260907120000_sms_archive_delete.sql` (245 migration files). Nothing was edited, no migrations were run, the live database was not queried. All "current definition" claims are derived from the last migration (by filename timestamp) that (re)defines the object. Statements marked **[inference]** are reasoned from DDL/code rather than read verbatim.

Paths below are repository-relative to `/home/user/OffshoreAlliance/`. `M:` = `supabase/migrations/`, `A:` = `apps/organising-db/src/`.

---

## 0. Executive summary (what the schema can and cannot do today)

| Target-model concept | What exists today | Verdict |
|---|---|---|
| **Universe** (who is in the campaign) | Definition = `campaign_employers` + `campaign_worksites` (+ `campaign_agreements`); materialisation = `campaign_worker_membership` (UNIQUE campaign+worker). Sync is **application code**, not a trigger/RPC. Legacy `campaign_universes`/`campaign_universe_rules` still exist and are still queried by one page but play no part in membership. | Exists; two parallel definitions (legacy + live). |
| **Group** (a dimension such as worksite / shift / profession) | `campaign_organising_units` rows with `is_group_container = TRUE`; member units point at the container via `ou_group_id` (= `parent_ou_id`). Container and members share one `ou_type`. Several *named* groups of the same `ou_type` may coexist. Standalone (ungrouped) units are also allowed. | Partially exists: a group is a *named instance of a type*, not the dimension itself. |
| **Unit** | `campaign_organising_units` (non-container rows). `ou_type` is a VARCHAR CHECK with 11 values. Up to 3 levels (container → unit → sub-unit). | Exists. |
| **Group-specific "unassigned" unit** | Does **not** exist. "Unallocated" is computed **campaign-wide** (members with zero `campaign_worker_ou` rows), both in a SQL view (`campaign_unit_assignment_summary`, `ou_id IS NULL` row) and client-side. There is no per-group bucket and no row to attach ratings/coverage to. A trigger forbids assigning workers to the container itself. | Missing. |
| **One unit per group per worker** | Not enforced. `campaign_worker_ou` is UNIQUE `(ou_id, worker_id)` only. A trigger enforces the *weaker* rule "one **group** per `ou_type` per campaign" (a worker may be in many units of the same group, and in parent + sub-unit simultaneously by design: the "roll-up model"). `is_primary` marks one preferred unit per worker but has no DB constraint. | Missing; current design actively relies on multi-membership. |
| **Workers in no group at all** | Computable: members minus workers with any `campaign_worker_ou` row (view + UI already do this). Not computable per group by any existing view. | Campaign-wide yes; per-group no. |
| **Role gating** | `user_profiles.role ∈ {admin,user,viewer}` + `work_role` + `reports_to`; `can_write_to_campaign()` chain; `campaign_organisers` roster. OU tables use the older role-based RLS (**delete = admin only**). `app_settings` is an admin-only key/value store with no feature-flag rows. | Exists; inconsistent across tables. |

---

## 1. Campaign tables

### 1.1 `campaigns` — full column inventory

Base DDL: `M:0001_initial_schema.sql:227-239`. Generated type: `packages/db-types/generated.ts:8847-8873` (note: generated types lack `archived_at`, added 2026‑09‑07 — the types file is one migration stale).

| Column | Type / constraint | Added in |
|---|---|---|
| `campaign_id` | SERIAL PK | 0001:228 |
| `name` | VARCHAR(200) NOT NULL | 0001:229 |
| `description` | TEXT | 0001:230 |
| `campaign_type` | VARCHAR(20) NOT NULL CHECK IN (`'bargaining','organising','mobilisation','political'`) | 0001:231 |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK IN (`'planning','active','completed','suspended'`) | 0001:232 |
| `start_date`, `end_date` | DATE | 0001:233-234 |
| `organiser_id` | INT → `organisers` (the "primary lead") | 0001:235 |
| `notes` | TEXT | 0001:236 |
| `created_at`, `updated_at` | TIMESTAMPTZ (trigger `trg_campaigns_updated_at`, 0001:427) | 0001:237-238 |
| `enterprise_agreement_subtype` | VARCHAR(30) CHECK NULL or IN (`'new','replacement','boss_initiated'`) | `M:0013_campaign_workflow.sql:8-12` (re-applied idempotently in `M:20260331140000_campaign_workflow_tables.sql:14-32` because 0013 "was never applied to the live database") |
| `campaign_scope` | VARCHAR(40) CHECK IN (`'single_employer_single_site','single_employer_multi_site','multi_employer_single_site','multi_employer_multi_site'`) | 0013:13-22 |
| `total_worker_estimate` | INT ≥ 0 | 0013:23-24 |
| `sector_wide` | BOOLEAN NOT NULL DEFAULT false | 0013:25 |
| `created_by` | UUID → `auth.users` ON DELETE SET NULL (drives `is_campaign_creator`) | `M:20260402035940_permission_system.sql:19-20` |
| `replaced_agreement_id` | INT → `agreements` ON DELETE SET NULL; kept in sync from `campaign_agreements` by trigger | `M:20260403010000_campaign_replaced_agreement.sql:4-6`; sync trigger `M:20260502100000_campaign_agreements.sql:52-79` |
| `msd_required` | BOOLEAN NOT NULL DEFAULT FALSE (Majority Support Determination) | `M:20260408100000_campaign_msd_required.sql:1-2` |
| `plan_timeframe_weeks` | INT > 0 (replaces hard end date for bargaining) | `M:20260502110000_campaign_plan_timeframe.sql:16-18` |
| `current_phase` | `campaign_phase_enum` NOT NULL DEFAULT 'preparing_to_bargain' — enum values `'preparing_to_bargain','bargaining_to_win','post_settlement'` (+ `'standalone_activities'` added `M:20260627100000_standalone_stage_plan.sql:8`) | `M:20260510100000_campaign_phase_enum.sql:10-17` |
| `bargaining_commenced_at` | DATE | `M:20260511100000_bargaining_commencement.sql:13-14` |
| `wizard_bargaining_triage` | TEXT CHECK IN (`'not_started','underway','advanced'`) | `M:20260520100000_wizard_bargaining_triage_column.sql:10-12` |
| `is_standing` | BOOLEAN NOT NULL DEFAULT FALSE — "exactly one standing campaign should exist"; seeded `'OA Membership Outreach'`; grants write to any authenticated user via `can_write_to_campaign` | `M:20260612100000_standing_campaign.sql:25-43, 52-69` |
| `is_sms_episode` | BOOLEAN NOT NULL DEFAULT FALSE — hidden per-episode container for standalone SMS; excluded from lists by `A:lib/campaign/visible-campaigns.ts` | `M:20260813005937_sms_episode_campaigns.sql:12-23` |
| `archived_at` | TIMESTAMPTZ (SMS episodes only) | `M:20260907120000_sms_archive_delete.sql:42-46` |

There is **no** `kind`, `is_template`, `template_id`, `program_id`, or `project_id` column on `campaigns`. Status is a VARCHAR CHECK, not a Postgres enum; `current_phase` is the only true enum (`generated.ts:26759-26764`).

`campaigns_view` (`M:0004_views.sql:93-108`) = `campaigns.*` + `organiser_name` + `action_count` + `universe_count` (counts legacy `campaign_universes`). Not consumed by the app (grep found no references).

### 1.2 Campaign scope junctions (the *live* universe definition)

- `campaign_employers (id, campaign_id, employer_id, created_at, UNIQUE(campaign_id, employer_id))` — `M:0013:28-34`.
- `campaign_worksites (id, campaign_id, worksite_id NULL, sector_wide BOOL, created_at, CHECK (sector_wide OR worksite_id IS NOT NULL))`; partial unique indexes on `(campaign_id, worksite_id)` and one sector-wide row per campaign — `M:0013:36-51`.
- `campaign_agreements (id, campaign_id, agreement_id, relationship_type CHECK IN ('replaced','new','related'), is_primary, sort_order, …, UNIQUE(campaign_id, agreement_id))`, one primary replaced per campaign (partial unique index), trigger `sync_campaign_replaced_agreement` mirrors to `campaigns.replaced_agreement_id` — `M:20260502100000_campaign_agreements.sql:16-79`.

### 1.3 Organiser assignment to campaigns

- `organisers (organiser_id, organiser_name, email, phone, is_active)` — `M:0001:56-62`. Linked to auth users via `user_profiles.organiser_id` (`M:0001:385`).
- `campaigns.organiser_id` — the single "primary lead" (`M:0001:235`).
- `campaign_organisers (id, campaign_id, organiser_id, campaign_role CHECK IN ('lead','organiser','coordinator','industrial_officer','specialist') DEFAULT 'organiser', reports_to_organiser_id → organisers, added_at, UNIQUE(campaign_id, organiser_id))` — `M:20260403000000_campaign_organiser_team.sql:11-25`. RLS: read for any authenticated; write via `can_write_to_campaign(campaign_id)` (lines 29-33).
- `agreement_organisers (agreement_id, organiser_id, UNIQUE)` + `is_primary`, `agreement_role CHECK IN ('organiser','lead','industrial_officer')`, one primary per agreement — `M:0001:179-184`, `M:0005_work_roles_hierarchy.sql:15-23`. Feeds `is_assigned_to_campaign()` through `campaign_timelines.agreement_id`.
- `organiser_patches (patch_id, organiser_id, patch_name, description)` and `organiser_patch_assignments (patch_id, entity_type CHECK IN ('worksite','employer','agreement'), entity_id)` — `M:0001:316-328`. **Not referenced by any permission function or RLS policy** (grep of migrations); patches are descriptive only.

### 1.4 Campaign templates

There is **no `campaign_templates` table**. "Template" exists only as:
- `campaign_activities.template_key VARCHAR(80)` (`M:0013:81`) with a partial unique index on non-null keys (`M:20260513120000:20-22`, `M:20260514120000:31-33`) used by seed packs (PIA, PABO, endorsement, WOC quick-start RPCs such as `seed_bargaining_quickstart_activities`, `seed_pia_pack_*`).
- `comms_template_library` (`M:20260409100000_comms_draft_system.sql:14`) for comms drafts.
- Wizard behaviour in the app (`A:components/campaigns/campaign-wizard.tsx`) — not a DB construct.

### 1.5 Programs / projects linkage

- `projects` (site-level, `worksite_id NOT NULL`, `work_type`, `project_status`, `absorbed_into_project_id`) — `M:0010_organising_universe.sql:29-49`; junctions `project_employers`, `project_agreements` (0010:59-80); `workers.project_id` (0010:103-104).
- `programs` (multi-worksite grouping, `principal_employer_id`, `program_status`) + `program_worksites (is_primary, is_current)` — `M:20260331190000_programs.sql:14-59`.
- **No FK from `campaigns` to programs or projects.** The only campaign-side reference to projects is the legacy rule type `campaign_universe_rules.rule_type IN (… 'project','work_type','onshore_offshore')` (`M:0010:110-118`). `docs/relationship-map.md:96-102` records that `project_employers`/`project_agreements` were empty and `workers.project_id` all NULL at snapshot time.

### 1.6 Planning-related tables (for completeness)

`campaign_stage_plans (UNIQUE(campaign_id, stage_number), status, workplan_status, phase …)` — `M:0014_planning_tables.sql:81-95`, stage range 0–11 (`M:20260627100000:10-14`); `plan_ambitions`, `plan_where_to_play`, `plan_theory_of_winning`, `plan_capacities`, `plan_management_systems` (0014:98-173); `gate_definitions`/`gate_criteria`/`gate_assessments` (0014:180-222); `campaign_timelines (campaign_id UNIQUE, agreement_id, pabo_available_date …)` (0014:229-240); `campaign_stage_workplan_tasks` with `assigned_ou_id → campaign_organising_units` (`M:20260408200000_stage_workplan_tasks.sql:8-27`, line 20); `campaign_ou_candidates` (WTP-seeded unit suggestions, §3.8); section plans (`section_plans`, `M:20260606120000`), etc. `delete_campaign(p_campaign_id)` RPC (admin or lead only) removes non-cascading planning rows first — current definition `M:20260408200000_stage_workplan_tasks.sql:87-129`.

---

## 2. Universe tables

### 2.1 Legacy: `campaign_universes` / `campaign_universe_rules`

```sql
-- M:0001_initial_schema.sql:241-254
CREATE TABLE campaign_universes (
  universe_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT
);
CREATE TABLE campaign_universe_rules (
  rule_id SERIAL PRIMARY KEY,
  universe_id INT NOT NULL REFERENCES campaign_universes(universe_id) ON DELETE CASCADE,
  rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('agreement','worksite','employer','member_role','sector')),
  rule_entity_id INT NOT NULL,
  include BOOLEAN NOT NULL DEFAULT true
);
```
Rule types widened to add `'project','work_type','onshore_offshore'` (`M:0010:110-118`). `campaign_actions.universe_id` references it (`M:0001:267`). Generated types: `generated.ts:7944-7950`, `7912-7919`.

**Status:** legacy but not dead. `A:app/(dashboard)/campaigns/[id]/page.tsx:272-349` still queries both tables, offers a "create universe" dialog, and uses `universe_id` for the `campaign_actions` form (line 362). **No function, trigger, view (other than `campaigns_view.universe_count`), or membership sync reads `campaign_universe_rules`.** `STREAM3_1_ENTITY_RELATIONSHIPS.md:216-236` already flagged these as one of "three parallel mechanisms" for scope.

### 2.2 Live universe definition

`campaign_employers` + `campaign_worksites` (+ `campaign_agreements`, §1.2). The "Scope" tab (`page.tsx:616-624`) renders `A:components/campaigns/campaign-universe-section.tsx`, which edits those junctions and calls the sync (below). `campaign_worksites.sector_wide` is the only "whole sector" switch; there is no rule engine.

### 2.3 Materialised membership: `campaign_worker_membership`

```sql
-- M:0013_campaign_workflow.sql:54-73 (re-applied M:20260331140000:61-80)
CREATE TABLE campaign_worker_membership (
  membership_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id   INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  created_at, updated_at TIMESTAMPTZ,
  UNIQUE (campaign_id, worker_id)
);
```
`oa_leader_role` was added in 0013, dropped (`M:20260415100000_leadership_harmonisation.sql:88-89`), re-added (`M:20260605100000:282-290`) and dropped again (`M:20260605120000_revert_oa_leader_role_use_global.sql:134-138`, "0/673 rows had a non-null value") — union role is a **global** worker attribute (`workers.member_role_type_id`), not per-campaign. Current Row type: `generated.ts:8493-8500` (5 columns). There is no `source`/`added_via`/`is_active` column; removal is a hard DELETE (`A:lib/hooks/useRemoveWorkerFromCampaign.ts:85-91`).

Trigger: `trg_activist_profile_on_membership AFTER INSERT` → `fn_activist_profile_on_membership()` (`M:20260717100000_activist_woc_module.sql:564-567`) auto-creates `campaign_activist_profiles` for activist-like roles.

### 2.4 Sync mechanism — application code, no DB function

There is **no SQL function, trigger, or RPC** that populates `campaign_worker_membership` from the universe (grep for universe/sync/populate across migrations found only `sync_campaign_replaced_agreement`). Membership is maintained by `A:lib/workers/sync-campaign-universe.ts`:

- `workerMatchesCampaignUniverse` (lines 37-48): worker is in the universe if `workers.employer_id ∈ campaign_employers` **or** `workers.worksite_id ∈ campaign_worksites`. Agreements, occupation, sector, `sector_wide` are **not** considered.
- `matchingOusForWorker` (50-66): auto-places the worker in every non-container unit whose `unit_basis.employer_id` / `unit_basis.worksite_id` matches (`assignment_source = 'rule'`).
- `syncWorkersToMatchingCampaigns(supabase, workerIds)` (224-286): for all `status IN ('planning','active')` non-SMS-episode campaigns; upserts membership (`onConflict: campaign_id,worker_id, ignoreDuplicates`) then OU rows (`onConflict: ou_id,worker_id`). Call sites: worker edit (`A:app/api/workers/[workerId]/route.ts:31`), batch update (`api/workers/batch-update/route.ts:134`), worker import (`api/worker-import/apply/route.ts:622`), campaign import (`api/campaign-import/apply/route.ts:474`), wizard (`components/campaigns/campaign-wizard.tsx:1133`), wall-chart moves (`wall-chart/move-worker-mutation.ts:296`), detail sheet (`wall-chart/worker-detail-sheet.tsx:456`).
- `syncCampaignUniverseFromEmployersWorksites(supabase, campaignId)` (297-378): pull every active worker at the campaign's employers/worksites into membership. Called from `campaign-universe-section.tsx:255,312` and `campaign-settings.tsx:443`.
- `ensureCampaignUniverseJunctions` (384-418) widens the universe to match imported workers; `stampEmployerWorksiteFromOu` (434-456) fills blank `workers.employer_id/worksite_id` from a unit's `unit_basis` when a worker is dropped into it.

Additive only: nothing removes a worker from membership when they leave the universe; removal is manual (`useRemoveWorkerFromCampaign`, reason `'no_longer_in_universe'`). Other direct membership upserts: `api/campaigns/[id]/add-workers/route.ts:100-106`, `create-worker`, `participation-import/apply`, `sms-audience/*`, `email-audience/import`, `campaign-wizard.tsx:1090`.

### 2.5 Parallel worker↔campaign link: `worker_campaign_connections`

`M:20260402170000_worker_campaign_connections.sql:9-64` — `UNIQUE(worker_id, campaign_id)`, `connection_status`, `support_level`, engagement counters, `worker_activity_log` child (82-110), RPCs `get_campaign_workers`, `get_worker_campaigns`, `get_worker_connection_details` (167-261). Note `campaign_id REFERENCES campaign_timelines(campaign_id)` (line 12), **not** `campaigns` — a campaign without a timeline row cannot have connections. Its RLS references `user_profiles.role IN ('admin','coordinator')` (lines 284, 302, 320, 333) although `'coordinator'` is not a legal `role` value (§6.1) **[inference: that branch can never be true]**. `STREAM3_1_ENTITY_RELATIONSHIPS.md:262-282` lists it as the third parallel worker→campaign path.

---

## 3. Organising unit tables

### 3.1 `campaign_organising_units` — current columns

Base DDL `M:0013_campaign_workflow.sql:110-127`. Current Row type `generated.ts:5925-5945`.

| Column | Type / constraint | Added in |
|---|---|---|
| `ou_id` | SERIAL PK | 0013:111 |
| `campaign_id` | INT NOT NULL → campaigns ON DELETE CASCADE | 0013:112 |
| `ou_type` | VARCHAR(30) NOT NULL, CHECK (see §4.1) | 0013:113-114; widened 20260408200100:16-24; 20260503100000:16-25 |
| `name` | VARCHAR(200) NOT NULL | 0013:115 |
| `total_workers_estimated` | INT ≥ 0 (size estimate) | 0013:116 |
| `source_metadata` | JSONB | 0013:117 |
| `anchor_worker_id` | INT → workers ON DELETE SET NULL ("anchor"/lead contact) | 0013:118 |
| `created_at`, `updated_at` | trigger `trg_campaign_organising_units_updated_at` | 0013:119-125 |
| `commonality_logic` | TEXT | `M:20260408200100_ou_discovery_schema.sql:10` |
| `target_size` | INT ≥ 0 | 20260408200100:11 |
| `source` | VARCHAR(30) DEFAULT 'manual' CHECK IN (`'manual','wtp_seeded','generated','field_discovery'`) | 20260408200100:12-13 |
| `display_order` | INTEGER NOT NULL DEFAULT 0; backfilled by name; index `(campaign_id, display_order)` | `M:20260416210000_campaign_ou_display_order.sql:3-21` |
| `unit_basis` | JSONB — filter the unit was built from; documented shapes `{"employer_id"}`, `{"worksite_id"}`, `{"canonical_occupation_id"}`, `{"occupation_group_id"}`, `{"custom": true}`, multi-key allowed | `M:20260503100000_campaign_unit_extensions.sql:27-31`; app shape `A:types/organising-row-types.ts:139-158` adds `shift_id`, `work_area_id`, `roster_panel_id`, `parent_ou_id`, `dimension`, `value`, `tag_category`, `leader_worker_id` |
| `parent_ou_id` | INT NULL → self ON DELETE SET NULL; CHECK `parent_ou_id <> ou_id`; index `(campaign_id, parent_ou_id, display_order)` | `M:20260524100000_ou_hierarchy_and_worker_dimensions.sql:21-38` |
| `is_group_container` | BOOLEAN NOT NULL DEFAULT FALSE | `M:20260608100000_ou_group_integrity.sql:26-27` |
| `ou_group_id` | INT NULL → self; **must equal `parent_ou_id` when set**; FK changed to ON DELETE NO ACTION | 20260608100000:28-44; `M:20260630100000_ou_container_delete_detach_children.sql:52-56` |
| `user_rating` | SMALLINT CHECK 1..5 (1 = extremely strong … 5 = hostile), subjective organiser rating of the unit | `M:20260701100000_ou_user_rating.sql:5-11` |

There is **no** `is_default`, `is_unassigned`, `is_catch_all`, `group_id` (separate entity), `dimension`, or `campaign_group_id` column. There is no `campaign_groups` / `campaign_dimensions` table.

### 3.2 Hierarchy and "group" rules (triggers)

1. `cou_enforce_hierarchy_invariants()` — BEFORE INSERT OR UPDATE OF `parent_ou_id, campaign_id` (`trg_cou_enforce_two_level_depth`, `M:20260524100000:42-83`; current body `M:20260612100000_ou_three_level_depth.sql:24-88`). Rules: parent must exist and be in the same campaign; parent-of-parent allowed **only if** the grandparent `is_group_container` (so depth ≤ 3: container → unit → sub-unit; standalone parents allow depth 2 only).
2. `cou_enforce_group_consistency()` — BEFORE INSERT OR UPDATE OF `is_group_container, ou_group_id, parent_ou_id` (`M:20260608100000:48-83`; current body `M:20260630100000:25-50`): `ou_group_id` with NULL `parent_ou_id` is auto-cleared (was an exception; changed so cascade deletes work); `ou_group_id` must equal `parent_ou_id` when both set; a container cannot itself be a group member.
3. Consequence **[inference]**: level-2 sub-units (parent = a member unit) necessarily have `ou_group_id = NULL`, so they are **outside** the group-exclusivity rule below; `split_campaign_organising_unit` never sets `ou_group_id` (`M:20260612100000:162-179`).

The 20260612 header describes the intended shape as *nested*: "Level 0: Employer group container / Level 1: Vessel / worksite unit / Level 2: Shift / crew sub-unit" — i.e. groups as a **hierarchy**, whereas 20260608 describes groups as **orthogonal named sets per `ou_type`** ("one group per ou_type per campaign"). Both readings are supported by the same columns; the redesign should pick one.

### 3.3 `campaign_worker_ou` — worker ↔ unit membership

```sql
-- M:0013_campaign_workflow.sql:129-139
CREATE TABLE campaign_worker_ou (
  id SERIAL PRIMARY KEY,
  ou_id INT NOT NULL REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ou_id, worker_id)
);
-- M:20260414123000_campaign_unit_rules.sql:7-18, 53-55
  assignment_source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK IN ('manual','rule'),
  assigned_rule_id INT NULL REFERENCES campaign_unit_rules(rule_id) ON DELETE SET NULL
```
Row type `generated.ts:8616-8625`. **No `campaign_id` column** — campaign scope always requires a join to `campaign_organising_units`.

**Cardinality (as enforced by the DB):**
- A worker can be in **any number of units** (across campaigns, within a campaign, within an `ou_type`, and within a group). Only `(ou_id, worker_id)` is unique.
- No FK/trigger requires the worker to also be in `campaign_worker_membership` for that campaign **[inference]** — `use-allocate-workers-to-ou.ts` and `move-worker-mutation.ts` insert `campaign_worker_ou` rows without touching membership; the reporting views start from membership, so such rows would be invisible to "Unallocated" logic.
- `is_primary`: no DB uniqueness. The app treats it as "at most one primary unit per worker per campaign": `worker-detail-sheet.tsx:1579-1592` clears all then sets one; `move-worker-mutation.ts:141-244` migrates the flag; bulk allocate sets it only for single-worker allocations (`use-allocate-workers-to-ou.ts:31-35`). Only `campaign_worker_ou.is_primary` is displayed in the Units tab ("(primary)", `campaign-units-section.tsx:1560`); no view or RPC reads it.

**Triggers on `campaign_worker_ou`** (`M:20260608100000_ou_group_integrity.sql`):
- `trg_check_no_worker_on_group_container` BEFORE INSERT OR UPDATE OF `ou_id` → `check_no_worker_on_group_container()` (89-113): raises if the target OU `is_group_container`.
- `trg_check_worker_ou_group_exclusivity` BEFORE INSERT OR UPDATE OF `ou_id` → `check_worker_ou_group_exclusivity()` (124-171): if the target unit has `ou_group_id`, raise when the worker already has a row in a unit of the **same campaign, same `ou_type`, different `ou_group_id`**. It explicitly does *not* apply to standalone units (`ou_group_id IS NULL`) and does **not** prevent multiple units within the same group. It fires only on `campaign_worker_ou` writes — re-grouping a unit (`UPDATE campaign_organising_units SET ou_group_id/parent_ou_id/ou_type`) is not re-validated **[inference]**.
- UI mismatch **[inference]**: `A:components/campaigns/step-allocate-workers.tsx:340-380, 585-604` only *warns* about cross-group conflicts ("Allocating them will add them to this group too"), but the trigger would reject the insert.

### 3.4 Rule-based assignment: `campaign_unit_rules`

`M:20260414123000_campaign_unit_rules.sql:21-55`: `(rule_id, campaign_id, ou_id → OU CASCADE, include BOOL, dimension_type, operator CHECK IN ('equals','contains'), value_int, value_text, CHECK (value_int OR value_text))`. `dimension_type` CHECK (current, `M:20260524100000:486-500`): `'employer','worksite','occupation','occupation_grouping','shift','work_area','roster_panel','relational'`. Evaluation is **client-side** in `A:lib/campaign/recompute-ou-assignments.ts` (`recomputeOuAssignments`, 158-362): per OU, include-rules OR'd then exclude-rules applied; deletes every `assignment_source='rule'` row in all non-container OUs of the campaign and reinserts; manual rows untouched; rules targeting containers are dropped (222-232). Invoked from `campaign-units-section.tsx:658`. RLS: read all; insert/update/delete for `admin,user` (delete widened in `M:20260701110000_campaign_unit_rules_user_delete.sql:12-22` because a `user`'s delete "silently did nothing").

### 3.5 `split_campaign_organising_unit()` RPC

Current definition `M:20260612100000_ou_three_level_depth.sql:95-222` (earlier `M:20260524100000:315-427`, alias fix `M:20260509110000`). Atomically inserts N sub-units under `p_parent_ou_id` (`ou_type` defaults to `'custom'`, `unit_basis` defaults to `{"parent_ou_id": …}`, `source='manual'`) and bulk-inserts `campaign_worker_ou` rows (`ON CONFLICT DO NOTHING`); `p_keep_in_parent DEFAULT TRUE` — when false, removes the parent's rows for the assigned workers. Callable by `authenticated`, SECURITY INVOKER. Used by `A:components/campaigns/wall-chart/split-unit-dialog.tsx`.

### 3.6 Leader / follower and coverage tables

- `campaign_leader_worker_links (link_id, campaign_id, leader_worker_id, follower_worker_id, notes, created_by, …, CHECK leader<>follower, UNIQUE(campaign_id, leader_worker_id, follower_worker_id))` — `M:20260415200000_campaign_leader_worker_links.sql:7-18`; "cross-unit relationships are supported (no ou_id on the link itself)" (74-77). RLS: admin/user write, **admin-only delete** (66-70).
- `campaign_task_lists (leader_worker_id | leader_organiser_id, activity_id, status …)` + `campaign_task_list_items` + `campaign_leader_tokens` — `M:0013:142-181`. Side-effect trigger `fn_task_list_item_side_effects()` (current `M:20260606100000_leader_only_task_list_side_effects.sql:51`; prior `M:20260605120000:38-128`): auto-rate 1 (`source='task_take'`, `rating_phase='expected'`), ensure membership, promote `workers.member_role_type_id` to activist (one-way ratchet), insert leader→follower link.
- `campaign_ou_coverage (coverage_id, ou_id UNIQUE → OU CASCADE, leader_worker_id, second_worker_id, reachable_48h, priority_action)` — `M:20260717100000_activist_woc_module.sql:348-369`; one coverage row per unit.
- `campaign_organising_units.anchor_worker_id` (0013:118) — older "anchor" concept, counted by `campaign_ou_coverage_summary.ous_with_anchor`.
- `campaign_wocs.scope_ou_id` ("typically a group container OU", 20260717:105-128) and `woc_scope_units (woc_id, ou_id PK)` (130-135) — WOC representation is derived over the subtree via `v_woc_unit_representation`.

### 3.7 'Primary unit' concept

Only `campaign_worker_ou.is_primary` (§3.3). No `workers.primary_ou_id`, no view column. `campaign_worker_lists.leader_worker_id`, `campaign_ou_coverage.leader_worker_id` are per-list/per-unit leaders, not a worker's home unit.

### 3.8 Other tables that reference `ou_id`

| Table.column | FK action | Migration |
|---|---|---|
| `campaign_unit_rules.ou_id` | CASCADE | 20260414123000:24 |
| `campaign_stage_workplan_tasks.assigned_ou_id` | SET NULL | 20260408200000:20 |
| `campaign_ou_candidates.accepted_ou_id` (WTP-seeded suggestions; `suggested_ou_type` mirrors the ou_type list; `source_wtp_id → plan_where_to_play`) | SET NULL | 20260408200100:27-53 |
| `campaign_worker_list_items.source_ou_id` | SET NULL | 20260613100000:58 |
| `section_plan_workforce_mapping_overrides.worksite_ou_id` (expects `ou_type='worksite'`) | CASCADE | 20260607110000:119-134 |
| `campaign_wocs.scope_ou_id` | SET NULL | 20260717100000:111 |
| `woc_scope_units.ou_id` | CASCADE | 20260717100000:132 |
| `structure_test_results.ou_id` (UNIQUE per test) | CASCADE | 20260717100000:315 |
| `campaign_ou_coverage.ou_id` (UNIQUE) | CASCADE | 20260717100000:350 |

Deleting a container: `parent_ou_id` ON DELETE SET NULL detaches children (they become standalone, `ou_group_id` auto-cleared by the consistency trigger, `M:20260630100000:1-20`).

---

## 4. Existing "group" / unit-type taxonomy

### 4.1 `ou_type` CHECK — exact current values

`M:20260503100000_campaign_unit_extensions.sql:19-25` (mirrored on `campaign_ou_candidates.suggested_ou_type`, 38-44):

```
'shift', 'department', 'network', 'job_type', 'worksite',
'employer',
'ethnic_community', 'crew_rotation', 'accommodation', 'work_area', 'custom'
```
History: 0013 had 5 (`shift, department, network, job_type, worksite`); 20260408200100 added `ethnic_community, crew_rotation, accommodation, work_area, custom`; 20260503100000 added `employer`. It is a VARCHAR CHECK (drop/re-add pattern), not a Postgres enum and not a lookup table. App mirror: `A:types/organising-row-types.ts:110-122` (`CampaignOuType`), labels in `wall-chart/types.ts:158-174`.

Which types the UI lets you make a **group** of: `GROUPABLE_OU_TYPES = shift, department, crew_rotation, work_area, network, ethnic_community, accommodation, custom` (`A:components/campaigns/step-campaign-units.tsx:152-161`; similar `GROUPABLE_TYPES` in `wall-chart/create-organising-unit-dialog.tsx:59+`). `employer`, `worksite`, `job_type` units are created as **standalone** rows with `unit_basis` (`docs/campaigns-review-development-report.md:156-163`). Code comments nonetheless refer to "Group container OUs (employer groups)" (`recompute-ou-assignments.ts:222-223`; `M:20260612100000` header) — **[inference]** employer-typed containers exist in data via the wall-chart dialog.

### 4.2 Group columns

`is_group_container`, `ou_group_id` (= `parent_ou_id`), enforced by the triggers in §3.2–3.3. The group creation flow writes: container `{ou_type: T, is_group_container: true}` then members `{ou_type: T, parent_ou_id: container, ou_group_id: container, is_group_container: false}` (`create-organising-unit-dialog.tsx:389-420`; wizard `step-campaign-units.tsx:509-560`, persisted by `campaign-wizard.tsx:767+`). The container's `total_workers_estimated` is NULL; members carry estimates.

### 4.3 Worker-level dimensions (the raw material for "groups")

- `workers.employer_id`, `workers.worksite_id` (0001:133-134), `workers.project_id` (0010:104).
- `workers.canonical_occupation_id → occupations` (`M:20260401000000_reference_data_aliases.sql:63`), `occupations.occupation_group_id → occupation_groups (group_id, name, display_order, is_active)` (`M:20260407000000_occupation_taxonomy.sql:6-18`), `occupation_aliases`, `worker_additional_occupations`, `worker_specialisations`.
- `workers.shift_id → worker_shift_options`, `workers.work_area_id → worker_work_area_options`, `workers.roster_panel_id → worker_roster_panel_options` — each lookup `(id, name, employer_id NULL, worksite_id NULL, is_active, sort_order)` with a scoped case-insensitive unique name (`M:20260524100000:89-194`).
- `workers.member_role_type_id → member_role_types` (0001:25-32; seed 0003:34-41 `member, member_other_union, contact, bargaining_rep(deactivated), non_member, resigned_member, delegate`; `activist` added later — code resolves by `role_name ILIKE 'activist'`), `workers.union_membership_type_id → union_membership_types` (`non_member, resigned_member, financial_member, …, member_pending, non_oa_member`; `M:20260407120000:5-17`), `workers.is_bargaining_rep`, `workers.is_hsr`, `workers.non_oa_union_option_id`.
- `worker_tags` / `tags(tag_category)` — used by rule `dimension_type='relational'` and legacy shift/work_area text rules.

`campaign_unit_rules.dimension_type` is the only place the word "dimension" is a schema concept.

### 4.4 Related JSON config

`unit_basis` (§3.1) and `source_metadata` on units; `ambition_options` seed rows about "Define {n} organising units of 5-50 workers" (`M:20260408200100:130-139`); `wtp_categories` row 'Organising Units' (121-127).

---

## 5. Assessment / rating tables (what a per-group view must aggregate)

All of the following are keyed by `(campaign_id, worker_id)` or `(activity_id → campaign_id, worker_id)`; none carries an `ou_id`. A per-group/unit aggregate therefore always goes `campaign_worker_ou → campaign_organising_units` then joins on `worker_id`.

| Table / view | Key facts | Migration |
|---|---|---|
| `campaign_activities` | `(activity_id, campaign_id, title, template_key, activity_kind, is_binary, supporter_outcome_value, is_custom, rating_labels JSONB, …)`; `activity_kind` widened beyond `'task','assessment'` in 20260520210000/20260608110000 | `M:0013:76-90`; `rating_labels` `M:20260507120000:5-11` |
| `campaign_activity_ratings` | `rating INT 1..5 NULL`, `binary_value`, `rating_phase CHECK ('expected','actual') DEFAULT 'actual'`, `event_id → activity_events`, `source CHECK ('staff','leader_form','call_outcome','task_take','sms','email','petition','meeting')`, `rated_by_user_id`, `notes`; `UNIQUE NULLS NOT DISTINCT (activity_id, worker_id, rating_phase, event_id)` (`car_worker_phase_event_uq`); `CHECK (rating IS NOT NULL OR binary_value IS NOT NULL)` | `M:0013:92-107`; `M:20260424110000_ratings_phase_and_event.sql:29-115` |
| `rating_level` | canonical scale 0 unassessed, 1 supportive_leader, 2 supporter, 3 neutral, 4 opposed, 5 oppositional_leader; `is_supportive`, colour tokens | `M:20260423120000:21-69` |
| `campaign_worker_rating_summary` (view) | per member: `cumulative_rating` (base rating 1 for contact/activist/delegate/bargaining rep, 2 for financial/non-OA/pending member, averaged with numeric ratings), `last_activity_rating`, `has_supportive_activity_rating`, `supportive_activity_count`; binary aliases normalised | current `M:20260611110000_normalize_binary_support_tracking.sql:8-140` |
| Capture tables | `sms_interactions`, `email_cta_responses`, `petition_signatures (UNIQUE activity,worker)`, `meeting_attendance (UNIQUE event,worker)`; `activity_events`; triggers derive ratings via `record_assessment_event()` (current `M:20260805100000:137`) | `M:20260425100000:20-135` |
| `campaign_worker_facts` + `campaign_data_fields` / `campaign_data_fieldsets` + `worker_campaign_fact_history` | latest-wins `(campaign_id, worker_id, field_id)` typed values (`boolean, enum, integer, scale, text, multi_enum`), `source CHECK ('sms_survey','an_csv','email','phone','staff')`; RPC `record_campaign_fact()` | `M:20260822100000:23-171, 244-407` |
| `campaign_leader_worker_links` | leader→follower per campaign (§3.6) | 20260415200000 |
| `worker_campaign_connections` / `worker_activity_log` | status, support_level, counters (§2.5) | 20260402170000 |
| `campaign_activist_profiles`, `activist_tasks`, `campaign_wocs`, `woc_members`, `structure_tests`/`structure_test_results (ou_id)`, `campaign_ou_coverage (ou_id)` | activist/WOC module; `v_campaign_coverage_map` gives per-unit assigned/member counts, density, leader rating, coverage status | `M:20260717100000` (views 610-800) |
| `campaign_organising_units.user_rating` | per-unit subjective 1..5; UI averages sub-units (`A:lib/campaign/unit-rating.ts`) | 20260701100000 |
| `campaign_prospective_workers` | staged leader-form workers with `rating` | 0013:184-198 |
| Participation import | `apply_participation_import()` | 20260805100000/110000 |

Existing per-unit aggregates already written (reference for a per-group design): `campaign_ou_coverage_summary` (per campaign: `total_ous`, `sized_ous` 5-50, `ous_with_contact/activist/delegate` via `member_role_types.role_name`, `ous_with_anchor`, `total_estimated_workers`, `total_assigned_workers`; current `M:20260415100000:100-138`; note it does **not** exclude containers **[inference]**), `campaign_unit_assignment_summary` (per campaign+ou allocated count incl. synthetic NULL row; current `M:20260608100000:181-232`), `campaign_unit_hierarchy_summary` (per top-level OU: child count/ids, distinct workers across parent+children; `M:20260524100000:243-294`), `campaign_worker_unit_membership_summary` (`unit_count`, `is_multi_unit_member`; `M:20260414123000:58-74`), `v_section_plan_workforce_mapping` (per `ou_type='worksite'` unit: workers, members, density, unrated; `M:20260607110000:85-108`), `v_campaign_coverage_map/summary`, `v_woc_unit_representation` (recursive over `parent_ou_id`, excludes containers; `M:20260717100000:759-800`).

---

## 6. Roles and permissions

### 6.1 App role model

- `user_profiles (user_id PK → auth.users, role VARCHAR(10) CHECK IN ('admin','user','viewer') DEFAULT 'viewer', display_name, organiser_id → organisers, phone, work_role, reports_to)` — `M:0001:381-388`; `work_role CHECK IN ('coordinator','lead_organiser','organiser','industrial_officer','industrial_coordinator','specialist')`, `reports_to UUID → user_profiles` — `M:0005_work_roles_hierarchy.sql:2-12`. Row type `generated.ts:18297-18308`. New users default to `viewer` (`handle_new_user`, 0001:434-445).
- `get_user_role()` (`M:0002:40-43`), `is_admin()` (`M:20260402035940:108-114`), `is_coordinator_or_lead()` (117-129: admin or work_role lead_organiser/coordinator/industrial_coordinator).
- Campaign write chain — `can_write_to_campaign(p)` current `M:20260612100000_standing_campaign.sql:52-69`:
  `standing campaign (any authenticated) OR is_admin() OR is_campaign_creator() [campaigns.created_by = auth.uid()] OR is_lead_organiser_for_campaign() OR is_assigned_to_campaign() OR has_campaign_edit_permission()`.
  - `is_lead_organiser_for_campaign` current `M:20260403000000:60-102`: (1) user's organiser is `campaigns.organiser_id` **and** `work_role IN (lead_organiser, coordinator, industrial_coordinator)`; (2) `campaign_organisers.campaign_role='lead'`; (3) user is `campaign_organisers.reports_to_organiser_id` for a team member and has a lead/coordinator work_role; (4) legacy global `reports_to` chain.
  - `is_assigned_to_campaign` current `M:20260403000000:36-56`: via `agreement_organisers → campaign_timelines.agreement_id`, or any `campaign_organisers` row.
  - `campaign_edit_permissions` / `campaign_permission_requests` + RPCs `request/grant/deny/revoke_campaign_edit_permission`, `get_pending_permission_requests`, `get_my_campaign_permissions` (`M:20260402035940:46-101, 204-493`). Permissions are persistent; leads/coordinators/admins approve.
- Organiser patches (`organiser_patches`, `organiser_patch_assignments`) are **not** used by any policy or function.

### 6.2 RLS on the campaign / unit tables (two generations coexist)

| Table | SELECT | INSERT/UPDATE | DELETE | Source |
|---|---|---|---|---|
| `campaigns`, `campaign_universes`, `campaign_universe_rules`, `campaign_actions` | any authenticated | `get_user_role() IN ('admin','user')` | **admin only** | `M:0002:50-106` |
| `campaign_employers`, `campaign_worksites`, `campaign_worker_membership`, **`campaign_organising_units`**, **`campaign_worker_ou`**, `campaign_prospective_workers` | any authenticated | `admin,user` | **admin only** | `M:0013:241-277` (no later change found by grep) |
| `campaign_activities`, `campaign_activity_ratings`, `campaign_task_lists`, `campaign_task_list_items`, `campaign_leader_tokens` | any | `admin,user` | `can_write_to_campaign(...) OR is_admin()` | delete widened `M:20260422120000` |
| `campaign_unit_rules` | any | `admin,user` | `admin,user` | `M:20260414123000:77-108`, `M:20260701110000` |
| `campaign_leader_worker_links` | any | `admin,user` | **admin only** | `M:20260415200000:43-72` |
| `campaign_ou_candidates`, `worker_*_options` | any | `admin,user` | admin only | 20260408200100:55-72; 20260524100000:433-480 |
| `campaign_organisers`, planning tables, gates, timelines, `campaign_worker_lists(+items)`, `campaign_agreements`, capture tables, facts, activist/WOC tables, `campaign_ou_coverage`, `structure_tests` | any | `can_write_to_campaign(campaign_id)` (FOR ALL or per-op) | same | 20260402035940:499-636; 20260403000000:29-33; 20260613100000:69-115; 20260822100000:441-515; 20260717100000 |
| `worker_campaign_connections` | `can_write_to_campaign` via `campaign_timelines` OR role IN ('admin','coordinator') | same | role IN ('admin','coordinator') only | 20260402170000:267-372 |
| `app_settings` | admin only | admin only | admin only | 20260417110000:15-40 |

Practical consequences for the redesign **[inference]**:
- Any `user`-role organiser (i.e. everyone who is not `admin`) **cannot delete** `campaign_organising_units`, `campaign_worker_ou` or `campaign_leader_worker_links` rows via the client; PostgREST returns success with 0 rows (the exact symptom recorded for `campaign_unit_rules` in `M:20260701110000:1-10`). The wall-chart delete-unit dialog (`A:components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:110-177`) and `useRemoveWorkerFromCampaign` (deletes `campaign_worker_ou` + membership) and `move-worker-mutation` ("move" deletes source rows) run with the user's client, so they silently no-op for non-admins unless the app is normally used by admins. No API route with the service-role client (`A:lib/supabase/admin.ts`) writes to OU tables; the only service-role users of these tables are the token-based leader/call-share routes.
- Unit *creation/editing* is gated only by global role (`admin`/`user`), **not** by `can_write_to_campaign` — a `user` can create units on any campaign, including ones they are not assigned to, whereas activities/lists on the same campaign require campaign write access.
- The `'coordinator'` value in the `worker_campaign_connections` policies is not a legal `user_profiles.role`, so those branches are dead.

### 6.3 Settings / feature flags

- `app_settings (key TEXT PK, value TEXT, updated_at, updated_by)` — admin-only read/write; seeded keys are integration secrets (`action_network_api_key`, Mobile Message keys, `sms_webhook_token`, SendGrid keys, `email_webhook_token`, `email_inbound_token`; `M:20260417110000:42-48`, `M:20260810100000:348-358`, `M:20260810120000:416-419`, `M:20260820100000:484-506`). **No per-role feature gating exists**; because SELECT is admin-only it cannot be read by `user`/`viewer` clients to gate UI.
- `feature_flags` and `workspace_settings` tables were **proposed** in `docs/stream3-4/STREAM3_4_DATA_MODEL_CHANGES.md:732-790, 517-545` and never created (grep of migrations).
- Visibility flags on campaigns (`is_standing`, `is_sms_episode`, `archived_at`) are the only "gates" and are content, not role, based.

---

## 7. Views, RPCs and SQL functions used by the wall chart / campaign pages

### 7.1 Views (definition → app consumer)

| View | Current definition | Consumed by |
|---|---|---|
| `campaign_worker_rating_summary` | `M:20260611110000:8-140` | wall chart (`campaign-wall-chart.tsx`), workforce list, assessments, ambitions step, phone wizard, call-list/worker-list populate routes |
| `campaign_ou_coverage_summary` | `M:20260415100000:100-138` | `campaign-units-section.tsx`, `useCampaignCurrentStats.ts`, `campaign-basics-edit-sheet.tsx`, `campaign-plan-panel.tsx` |
| `campaign_worker_unit_membership_summary` | `M:20260414123000:58-74` | `CampaignUnitMetricsTable.tsx`, `useCampaignCurrentStats.ts`, `api/campaigns/[id]/list-builder`, `push-list` |
| `campaign_unit_assignment_summary` (synthetic Unallocated row) | `M:20260608100000:181-232` | **not referenced by the app** (wall chart computes `unassignedWorkerIds` client-side, `campaign-wall-chart.tsx:791`; units section computes `unallocatedMembers`, `campaign-units-section.tsx:429-435`) |
| `campaign_unit_hierarchy_summary` | `M:20260524100000:243-294` | **not referenced by the app** |
| `v_campaign_coverage_map`, `v_campaign_coverage_summary`, `v_woc_unit_representation`, `v_campaign_activist_register` | `M:20260717100000:610-800` | activists module (`use-coverage-data.ts`, `use-woc-data.ts`, `structure-tests-panel.tsx`, export route) |
| `v_section_plan_workforce_mapping` | `M:20260607110000:85-108` | section planning |
| `organising_universe_view` | `M:0010:228-283` | `app/(dashboard)/reports/universe/page.tsx` |
| `workers_view` | `M:20260521000000:94` | (not by campaign pages) |
| `campaigns_view`, `workload_*`, `ambition_*`, `call_*`, `vw_campaign_worker_list_activity`, `vw_campaign_worker_call_status`, `gate_criteria_with_status`, `v_campaign_foundational_readiness` | various | dashboards / phone / plan |

Full list of public views in `generated.ts:20894-26215`.

### 7.2 Functions / RPCs relevant to campaign & units (latest definition)

| Function | Purpose | Latest definition |
|---|---|---|
| `split_campaign_organising_unit(p_parent_ou_id, p_sub_units JSONB, p_assignments JSONB, p_keep_in_parent)` | atomic split (§3.5); only RPC that writes OU tables | `M:20260612100000_ou_three_level_depth.sql:95-222` |
| `cou_enforce_hierarchy_invariants()` / `cou_enforce_group_consistency()` / `check_no_worker_on_group_container()` / `check_worker_ou_group_exclusivity()` | triggers (§3.2–3.3) | 20260612100000:24-88 / 20260630100000:25-50 / 20260608100000:89-113 / 124-171 |
| `can_write_to_campaign`, `is_admin`, `is_campaign_creator`, `is_lead_organiser_for_campaign`, `is_assigned_to_campaign`, `has_campaign_edit_permission`, `is_coordinator_or_lead`, `get_user_role` | permission chain (§6.1) | 20260612100000_standing_campaign.sql:52-69; 20260402035940; 20260403000000; 0002 |
| `delete_campaign(p_campaign_id)` | ordered delete, admin or lead | `M:20260408200000:87-129` |
| `record_assessment_event(...)` | upsert rating from any source | `M:20260805100000:137` (orig 20260425110000:18) |
| `record_call_attempt(...)` | phone outcome → rating side-effects | `M:20260811170000:27` |
| `record_campaign_fact(...)` | typed worker facts | `M:20260822100000:244-407` |
| `fn_task_list_item_side_effects()`, `fn_auto_rate_promote_task_list_leader()` | task-list side effects | `M:20260606100000:51, 110` |
| `fn_activist_profile_on_membership()` / `fn_activist_profile_on_rating()` / `fn_activist_profile_on_role_change()` | activist profiles | `M:20260717100000:413-567` |
| `get_campaign_workers`, `get_worker_campaigns`, `get_worker_connection_details` | connection model reads | `M:20260402170000:167-261` |
| `merge_workers`, `remap_worker_id` | worker merge (remaps `campaign_worker_ou` etc.) | `M:20260822120000` |
| `set_campaign_phase`, `begin_bargaining_phase`, `transition_to_post_settlement`, `refresh_gate_criteria_for_campaign`, `seed_*` | planning | various |

App `.rpc()` call inventory (grep): `record_call_attempt`, `record_assessment_event`, `delete_campaign`, `can_write_to_campaign`, `split_campaign_organising_unit`, `merge_workers`, `match_workers_for_import`, `apply_participation_import`, `get_campaign_worker_call_status`, permission RPCs, `materialise_sequence_run`, `seed_*`, SMS/claim RPCs. Everything else the wall chart does (assign, move, copy, unassign, set primary, create/delete units, group creation, rule recompute, universe sync) is **client-side PostgREST CRUD** without transactions.

---

## 8. Gap analysis against the target model

### 8.1 What maps to "group" today

| Target | Closest existing construct | Fit |
|---|---|---|
| Group = dimension (worksite / shift / profession) | `ou_type` value + `is_group_container` row of that type | Partial. A container is a *named* group ("Early Shifts"); a campaign may have several containers of the same `ou_type` (the exclusivity trigger exists for that case) plus standalone units of that type. The target treats the dimension itself as the group, i.e. **exactly one group per dimension per campaign**. |
| Group has units | member units with `ou_group_id = container` | Direct fit. |
| Employer / worksite / job_type groups | standalone units with `unit_basis.employer_id` etc.; no container | Not grouped today; wizard excludes them from group creation. |
| Dimension source data | `workers.employer_id / worksite_id / canonical_occupation_id(→group) / shift_id / work_area_id / roster_panel_id`, `campaign_unit_rules.dimension_type` | Rich enough to auto-derive groups and units. |

### 8.2 Missing for per-group "unassigned" units

1. No row-level concept: no `is_default`/`is_unassigned` column; no auto-created bucket unit; `M:20260503100000:11-13` explicitly decided "'Unallocated' is intentionally a computed bucket … no new ou_type and no auto-created row".
2. The computed bucket is **campaign-wide** (member with zero `campaign_worker_ou` rows): view `campaign_unit_assignment_summary` (`ou_id IS NULL`), `campaign-wall-chart.tsx:791, 1545-1662` ("Unassigned workers" card), `campaign-units-section.tsx:429-435, 1772-1860` ("Unallocated"). A worker in a shift unit but in no worksite unit is *not* surfaced as unassigned anywhere.
3. The container cannot double as the bucket (`check_no_worker_on_group_container` raises).
4. Anything that hangs off `ou_id` (`campaign_ou_coverage`, `structure_test_results`, `user_rating`, `campaign_unit_rules`, list items' `source_ou_id`, WOC scope) cannot attach to a synthetic bucket — a real row is needed if "unassigned" should be rateable/coverable; conversely a real row will be counted by `campaign_ou_coverage_summary.total_ous/sized_ous`, `v_campaign_coverage_summary.units_mapped`, `v_woc_unit_representation`, `campaign_unit_hierarchy_summary`, `v_section_plan_workforce_mapping` unless every view is taught to exclude it.
5. Per-group unassigned is computable today with one query (membership MINUS workers with a row in any unit of that group) but **no view provides it**, and `campaign_worker_ou` has no `campaign_id`/`group_id` so the query must join through `campaign_organising_units`.

### 8.3 Constraints that must change for "one unit per group per worker"

- `campaign_worker_ou UNIQUE (ou_id, worker_id)` is the only uniqueness. To get one-per-group you need either (a) a denormalised `group_id` (or `ou_group_id`) on `campaign_worker_ou` maintained by trigger from the unit, with `UNIQUE (worker_id, group_id)`; or (b) a BEFORE INSERT/UPDATE trigger that counts existing rows in units of the same group. Option (a) also fixes the missing `campaign_id` and makes per-group queries index-friendly.
- `check_worker_ou_group_exclusivity` implements a different rule (one *group* per type); it would become redundant if every type has exactly one group, or must be extended to "one unit per group". It must also be re-validated when units are re-grouped/re-typed (`campaign_organising_units` UPDATE), which nothing does today.
- The **roll-up model** conflicts: `parent_ou_id` comment (`M:20260524100000:34-38`) — "workers in a sub-unit typically remain assigned to the parent too"; `move-worker-mutation.ts:175-201, 259-283` inserts a parent row whenever a worker is moved/copied into a sub-unit (`keepInParent` default true); `split_campaign_organising_unit(p_keep_in_parent DEFAULT TRUE)`. Under one-per-group, parent+sub-unit rows in the same group are a violation unless sub-units are treated as refinements (derive the parent from the child) or excluded from the group.
- `is_primary` becomes meaningless within a group; the cross-group "home unit" question remains (no constraint today).
- Rule recompute (`recomputeOuAssignments`) can legitimately match a worker to two units of the same group (rules are per unit, OR'd); a precedence rule (first match by `display_order`, or fail) must be defined, otherwise the recompute's bulk insert (`recompute-ou-assignments.ts:358`) will fail as a whole under a new constraint.
- Universe sync (`matchingOusForWorker`, `sync-campaign-universe.ts:50-66`) pushes a worker into **every** employer/worksite unit whose basis matches; duplicate worksite units in one group would collide.
- `copy` mode (shift-drag / "Copy to unit", `move-worker-mutation.ts:247-284`; `copy-worker-to-unit-dialog.tsx`) is inherently multi-membership and would have to be restricted to cross-group copies.
- `campaign_worker_unit_membership_summary.is_multi_unit_member` semantics change (multi across groups becomes normal).

### 8.4 Data-migration hazards (verify on the live DB before designing)

Counts cannot be verified from the repo (live DB not queried). `M:20260605120000:17` implies ~673 membership rows in June 2026. Suggested read-only checks:

```sql
-- H1. Workers in >1 unit of the SAME group (would violate one-per-group)
SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id, COUNT(*) AS units
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cou.ou_group_id IS NOT NULL
GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- H2. Parent + sub-unit roll-up rows (same worker in a unit and its parent)
SELECT c.campaign_id, cwo_c.worker_id, c.ou_id AS child_ou, c.parent_ou_id
FROM campaign_worker_ou cwo_c
JOIN campaign_organising_units c ON c.ou_id = cwo_c.ou_id AND c.parent_ou_id IS NOT NULL
JOIN campaign_worker_ou cwo_p ON cwo_p.ou_id = c.parent_ou_id AND cwo_p.worker_id = cwo_c.worker_id;

-- H3. Workers in >1 STANDALONE unit of the same ou_type (no group today, so no rule applied)
SELECT cou.campaign_id, cou.ou_type, cwo.worker_id, COUNT(*)
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- H4. Shape per campaign/type: >1 container of a type, or a mix of containers and standalone units
SELECT campaign_id, ou_type,
       COUNT(*) FILTER (WHERE is_group_container) AS containers,
       COUNT(*) FILTER (WHERE NOT is_group_container AND ou_group_id IS NULL AND parent_ou_id IS NULL) AS standalone_units,
       COUNT(*) FILTER (WHERE ou_group_id IS NOT NULL) AS grouped_units,
       COUNT(*) FILTER (WHERE parent_ou_id IS NOT NULL AND ou_group_id IS NULL) AS level2_subunits
FROM campaign_organising_units GROUP BY 1,2 ORDER BY 1,2;

-- H5. campaign_worker_ou rows whose worker is NOT a member of the unit's campaign (invisible to Unallocated logic)
SELECT COUNT(*) FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
LEFT JOIN campaign_worker_membership m ON m.campaign_id = cou.campaign_id AND m.worker_id = cwo.worker_id
WHERE m.membership_id IS NULL;

-- H6. Members with no unit at all (today's campaign-wide Unallocated)
SELECT m.campaign_id, COUNT(*) FROM campaign_worker_membership m
WHERE NOT EXISTS (SELECT 1 FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
                  WHERE cou.campaign_id = m.campaign_id AND cwo.worker_id = m.worker_id)
GROUP BY 1;

-- H7. Multiple is_primary per worker per campaign
SELECT cou.campaign_id, cwo.worker_id, COUNT(*) FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
WHERE cwo.is_primary GROUP BY 1,2 HAVING COUNT(*) > 1;

-- H8. Units with no usable dimension ('custom', or empty unit_basis) that would need a group assigned
SELECT campaign_id, ou_type, COUNT(*) FROM campaign_organising_units
WHERE NOT is_group_container AND (ou_type = 'custom' OR unit_basis IS NULL OR unit_basis = '{}'::jsonb)
GROUP BY 1,2;
```

Additional hazards:
- **Standalone units** (`ou_group_id IS NULL`) of every type, including all wizard-generated `employer`/`worksite`/`job_type` units, need a home group; `custom` units (default for split sub-units without a type) have no dimension.
- **Level-2 sub-units** (container → unit → sub-unit) carry `ou_group_id = NULL` and are outside group rules.
- **`ou_type` is a CHECK constraint** shared with `campaign_ou_candidates`; introducing a group entity or new type values means the drop/re-add dance in two tables, plus regenerating `packages/db-types/generated.ts` (already stale: missing `campaigns.archived_at`).
- **Dependent views** must be dropped/recreated in order (pattern `DROP VIEW … CASCADE`): `campaign_unit_assignment_summary`, `campaign_unit_hierarchy_summary`, `campaign_ou_coverage_summary`, `v_campaign_coverage_map` → `v_campaign_coverage_summary`, `v_woc_unit_representation`, `v_section_plan_workforce_mapping` (hard-codes `ou_type='worksite'`), `campaign_worker_unit_membership_summary`.
- **FK cascade behaviour** on container delete: children are detached (SET NULL) rather than deleted; an auto-created unassigned unit would survive its group's deletion unless handled.
- **RLS**: any migration that auto-creates/deletes bucket rows on behalf of `user`-role organisers must run as SECURITY DEFINER or the OU policies must be moved to `can_write_to_campaign` (today: delete = admin only on `campaign_organising_units`, `campaign_worker_ou`, `campaign_leader_worker_links`).
- **Trigger ordering on `campaign_worker_ou`**: two BEFORE triggers already exist; a new uniqueness trigger must tolerate the `split` RPC's `ON CONFLICT (ou_id, worker_id) DO NOTHING` bulk insert (a raised exception aborts the whole split).
- **Legacy `campaign_universes`** still has UI and `campaign_actions.universe_id`; a "universe" rename/redesign must decide whether to retire or repurpose it.
- **`worker_campaign_connections` FK to `campaign_timelines`** — removal audits (`useRemoveWorkerFromCampaign:61-68, 125-139`) only work for campaigns that have a timeline.

### 8.5 Minimal-change sketch (for discussion, not a recommendation)

Two viable shapes given what exists:
1. **Keep OU table, add a first-class group entity**: `campaign_ou_groups (group_id, campaign_id, dimension ou_type, name, display_order, UNIQUE(campaign_id, dimension))`, `campaign_organising_units.group_id NOT NULL` for leaf units, `is_unassigned BOOLEAN` with a partial unique index `(group_id) WHERE is_unassigned`, `campaign_worker_ou.group_id` denormalised + `UNIQUE (worker_id, group_id)`; retire `is_group_container`/`ou_group_id`/`parent_ou_id` for groups (keep `parent_ou_id` only for sub-units if the roll-up model survives). Views become `GROUP BY group_id`.
2. **Reuse containers as groups**: enforce one container per `(campaign_id, ou_type)` (partial unique index `WHERE is_group_container`), auto-create an `is_unassigned` member unit per container by trigger, forbid standalone leaf units, and swap the exclusivity trigger for a one-unit-per-group check. Cheaper but keeps the container/parent duality and the roll-up ambiguity.

Either way, "workers in no group" = members with no `campaign_worker_ou` row (H6) — trivially available; "workers not assigned in group G" = members minus rows in G's units, which the unassigned unit makes explicit if assignment to it is materialised (trigger on membership insert / group creation) rather than computed.

---

## 9. Prior design docs on groups / dimensions and their status

| Document | Proposal | Status |
|---|---|---|
| `M:20260608100000_ou_group_integrity.sql` (header + comments) | "first-class group semantics": container rows, `ou_group_id`, no workers on containers, **one group per ou_type per campaign** | Implemented (this is the live group model). |
| `M:20260612100000_ou_three_level_depth.sql` (header) | Employer container → vessel/worksite unit → shift/crew sub-unit | Implemented (hierarchy trigger relaxed); frames groups as nesting rather than orthogonal dimensions. |
| `M:20260503100000_campaign_unit_extensions.sql:11-13`; `docs/campaigns-review-development-report.md:136-176` (Phase 2) | 'Unallocated' deliberately computed, not a row; `employer` type; `unit_basis`; per-unit estimates summed against `campaigns.total_worker_estimate` | Implemented; the "computed bucket" decision is the one the target model reverses. |
| `M:20260414123000_campaign_unit_rules.sql`; `M:20260524100000_ou_hierarchy_and_worker_dimensions.sql` | rule `dimension_type` vocabulary; typed worker dimensions (shift / work_area / roster_panel lookups) "mirroring the canonical_occupation_id pattern" | Implemented; rules evaluated client-side. |
| `WALLCHART_ENHANCEMENTS_V2.md:1-60, 90-150, 364-385` | drag/drop move & copy, "Unassigned pseudo-unit", primary-flag migration; open questions: auto-link to delegate of *primary unit*, one leader per unit | Implemented (v2 mutation); open questions unresolved. |
| `docs/HOW_TO_VIDEOS_WORKPLAN.md:305-309`; `docs/HOW_TO_VIDEOS_AGENT_PROMPTS.template.md:411-414` | Glossary: unit vs group container vs member unit; "a worker can be in only one group per unit-type" | Documentation of the live model (training material). |
| `STREAM3_1_ENTITY_RELATIONSHIPS.md:138-160, 216-260, 425-450` | Identifies three parallel scope mechanisms (`campaign_universes`, `campaign_employers`, `campaign_worksites`) and three worker↔campaign links (membership, OU, connections); asks "How do OUs relate to campaign_universes?"; recommends choosing ONE mechanism | Partially resolved in practice (employers/worksites + membership are live; universes legacy) — never formally decided; no group/dimension proposal. |
| `STREAM3_2_CURRENT_STATE.md`, `STREAM3_2_HIERARCHY_OPTIONS.md:637-665` | Worksite hierarchy options (adjacency / typed multi-hierarchy / path / closure); recommends typed hierarchies with adjacency base; `parent_worksite_id` unused | Not implemented; concerns `worksites`, not OUs. |
| `docs/stream3-4/STREAM3_4_DATA_MODEL_CHANGES.md:45-58, 517-545, 732-790` | Lists `campaign_organising_units` as "shift/department organization"; proposes `workspace_settings` and `feature_flags` tables | Settings/flags not implemented; no OU changes proposed. |
| `docs/relationship-map.md` | employer/worksite/program/project graph; `parent_worksite_id` all NULL; projects under-linked | Informational. |

No prior document proposes a per-group unassigned unit or a one-unit-per-group constraint; the closest is the exclusivity trigger (one group per type) and the campaign-wide "Unassigned" pseudo-unit.

---

## Appendix A — Migration index for this audit

| Topic | Migrations |
|---|---|
| campaigns / scope | 0001 (227-283), 0004 (93-108), 0013, 20260331140000, 20260402035940, 20260403010000, 20260408100000, 20260502100000, 20260502110000, 20260510100000, 20260511100000, 20260520100000, 20260612100000_standing_campaign, 20260627100000, 20260813005937, 20260907120000 |
| universe / membership | 0001 (241-254), 0010 (110-118, 228-283), 0013 (54-73), 20260402170000, 20260415100000 (88-89), 20260605100000 (282-290), 20260605120000, 20260717100000 (564-567) |
| organising units | 0013 (110-139), 20260408200100, 20260414123000, 20260416210000, 20260503100000, 20260509110000, 20260524100000, 20260608100000, 20260612100000_ou_three_level_depth, 20260630100000, 20260701100000, 20260701110000 |
| leaders / coverage | 0013 (142-198), 20260415100000, 20260415200000, 20260605100000, 20260605120000, 20260606100000, 20260613100000, 20260717100000 |
| assessments | 0013 (76-107, 201-226), 20260423120000, 20260424100000, 20260424110000, 20260425100000, 20260425110000, 20260429120000, 20260501120000, 20260507120000, 20260611110000, 20260805100000, 20260822100000 |
| roles / RLS | 0001 (381-388), 0002, 0005, 0015, 20260402035940, 20260403000000, 20260417110000, 20260422120000, 20260612100000_standing_campaign, 20260701110000 |

## Appendix B — App files that define the unit/group behaviour

`A:lib/workers/sync-campaign-universe.ts`, `A:lib/campaign/recompute-ou-assignments.ts`, `A:lib/campaign/ou-reassignment-targets.ts` (same-type / same-group move targets), `A:lib/campaign/use-allocate-workers-to-ou.ts`, `A:lib/campaign/unit-rating.ts`, `A:lib/hooks/useRemoveWorkerFromCampaign.ts`, `A:components/campaigns/wall-chart/{move-worker-mutation.ts, types.ts, normalize-members.ts, create-organising-unit-dialog.tsx, split-unit-dialog.tsx, merge-units-dialog.tsx, delete-organising-unit-dialog.tsx, copy-worker-to-unit-dialog.tsx, worker-detail-sheet.tsx}`, `A:components/campaigns/{campaign-wall-chart.tsx, campaign-units-section.tsx, campaign-universe-section.tsx, step-campaign-units.tsx, step-allocate-workers.tsx, campaign-wizard.tsx}`, `A:types/organising-row-types.ts:110-158`, `A:app/(dashboard)/campaigns/[id]/page.tsx:272-349, 616-624`, `packages/db-types/generated.ts` (Row types cited above).
