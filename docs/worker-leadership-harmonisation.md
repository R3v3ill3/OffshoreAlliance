# Worker Leadership Role Harmonisation

## Report and Implementation Plan

**Date:** 15 April 2026
**Status:** Proposed
**Scope:** Consolidate three overlapping worker role/classification systems into a single enduring role model, deprecate redundant fields, and enhance task allocation with automatic rating and organising unit integration.

---

## Part 1: Current State Analysis

### 1.1 Overview of the Problem

The platform currently tracks worker leadership roles and classifications through **three independent, overlapping systems** that have evolved separately. This creates confusion about which is the "source of truth" for a worker's leadership status, duplicates data entry, and prevents automation between task allocation, role assignment, and activity ratings.

The three systems are:

| System | Storage | Scope | Values |
|--------|---------|-------|--------|
| Global Organising Role | `workers.member_role_type_id` (FK) | Per worker, global | Contact, Activist, Bargaining Rep, Delegate |
| Campaign OA Leader Role | `campaign_worker_membership.oa_leader_role` (varchar) | Per worker per campaign | contact, activist, delegate |
| Engagement Level | `workers.engagement_level` (varchar) | Per worker, global | contact, activist, delegate, attendee, leader |

Additionally, HSR (Health & Safety Representative) status is tracked via a separate boolean `workers.is_hsr`.

The activity rating system (1-5 per activity) and overall/cumulative worker rating exist separately and interact with the role systems through ad-hoc display logic, but there is no automated connection between task assignment, role promotion, or rating defaults.

---

### 1.2 System A: Global Organising Role (`workers.member_role_type_id`)

#### Database Schema

**Table: `member_role_types`** (4 rows)

| role_type_id | role_name | display_name | is_default | sort_order |
|---|---|---|---|---|
| 3 | contact | Contact | true | 5 |
| 8 | Activist | Activist | false | 6 |
| 4 | bargaining_rep | Bargaining Rep | true | 7 |
| 7 | delegate | Delegate | true | 8 |

**Table: `workers`** -- relevant columns:
- `member_role_type_id` (integer, nullable, FK to `member_role_types.role_type_id`)
- `is_hsr` (boolean, nullable) -- separate HSR flag

#### How It Is Used

**Worker detail page** (`apps/organising-db/src/app/(dashboard)/workers/[id]/page.tsx`):
- Displayed under the label "Organising role" in the edit form
- Editable via a dropdown selecting from `member_role_types`
- Persisted directly to `workers.member_role_type_id`

**Wall chart side panel** (`apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx` lines 536-551):
- Editable in the worker detail sheet within the wall chart
- Separate from and alongside the OA leader role dropdown
- Saves to `workers.member_role_type_id` via the `updateWorker` mutation

**Worker filter bar** (`apps/organising-db/src/components/workers/worker-filter-bar.tsx`):
- Used as a filter dimension for the workers list

**Batch edit dialog** (`apps/organising-db/src/components/workers/batch-edit-dialog.tsx`):
- Allows bulk-setting organising role across multiple workers

**Import wizards** (`apps/organising-db/src/app/api/worker-import/apply/route.ts`, `apps/organising-db/src/app/api/membership-import/apply/route.ts`):
- Can set `member_role_type_id` on import

**Constants/helpers** (`apps/organising-db/src/lib/campaign/constants.ts`):
- `MEMBER_LIKE_ROLE_NAMES`: Set containing `"delegate"` and `"bargaining_rep"` -- used to determine member-like status for delegate eligibility. Note: `bargaining_rep` will move to a boolean flag, so this set will need updating to check `is_bargaining_rep` instead
- `isWorkerMemberLike()`: Checks if worker has a member-like role or union membership type
- `getWallChartDefaultCumulative()`: Uses `memberRoleName` as one of the inputs for default rating colour

#### Type Definitions

In `apps/organising-db/src/types/organising-row-types.ts`:

```typescript
export interface MemberRoleType {
  role_type_id: number;
  role_name: string;
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}
```

The worker record references it via `member_role_type_id: number | null`.

---

### 1.3 System B: Campaign OA Leader Role (`campaign_worker_membership.oa_leader_role`)

#### Database Schema

**Table: `campaign_worker_membership`** -- relevant columns:
- `membership_id` (serial PK)
- `campaign_id` (FK to campaigns)
- `worker_id` (FK to workers)
- `oa_leader_role` (varchar(20), nullable, CHECK constraint: NULL or one of `'delegate'`, `'activist'`, `'contact'`)

Created in migration `20260331140000_campaign_workflow_tables.sql`:
```sql
CREATE TABLE IF NOT EXISTS campaign_worker_membership (
  membership_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  oa_leader_role VARCHAR(20)
    CHECK (
      oa_leader_role IS NULL
      OR oa_leader_role IN ('delegate', 'activist', 'contact')
    ),
  ...
  UNIQUE (campaign_id, worker_id)
);
```

**Current data:** Only value currently in use is `'activist'` (1 distinct value across 190 membership rows).

#### How It Is Used

**Campaign Structure tab** (`apps/organising-db/src/components/campaigns/campaign-structure.tsx` lines 56-67, 124-148):
- Primary UI for setting OA leader role per worker per campaign
- Dropdown with options: None, Contact, Activist, Delegate (members only)
- Delegate option disabled if worker is not member-like
- Saves via `updateOaRole` mutation to `campaign_worker_membership.oa_leader_role`

**Wall chart side panel** (`apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx` lines 552-571):
- Shows "OA leader role (this campaign)" dropdown alongside the global "Organising role" dropdown
- This is where the duplication is most visible: two role dropdowns side-by-side for the same worker

**Wall chart cell rendering** (lines 284-353):
- Reads `oa_leader_role` to display a label badge on each worker cell
- Passes `oaLeaderRole` to `getWallChartDefaultCumulative()` for default colour calculation

**Campaign Assessments** (`apps/organising-db/src/components/campaigns/campaign-assessments.tsx` lines 317, 329):
- Included in `fieldValues` for the assessment worker rows: `oa_leader_role: row.oa_leader_role`
- Available as a filter/sort dimension in the assessments table

**OU coverage summary view** (database view `campaign_ou_coverage_summary`):
- Counts OUs with contacts, activists, delegates based on `oa_leader_role`
- Used for reporting on organising unit coverage

**List builder API** (`apps/organising-db/src/app/api/campaigns/[id]/list-builder/route.ts` lines 43, 63, 96):
- Selects `oa_leader_role` from membership
- Filters by `oa_leader_role` when role filter is applied
- Returns `oa_leader_role` in worker data

**Push list API** (`apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts` lines 72, 83):
- Selects `oa_leader_role` from membership
- Filters by `oa_leader_role` when role filter is applied

**Action Network engagement sync** (`apps/organising-db/src/lib/api/an-engagement-sync.ts` lines 112, 147, 169):
- Selects `oa_leader_role` from membership
- Maps to worker data for AN sync
- Filters by OA roles

**Email wizard** (`apps/organising-db/src/components/campaigns/email-wizard/EmailWizardSteps.tsx`):
- References `oa_leader_role` for filtering recipients

**Campaign Units Section** (`apps/organising-db/src/components/campaigns/campaign-units-section.tsx`):
- References `oa_leader_role` through member data for OU management

#### Type Definition

```typescript
export type OaLeaderRole = "delegate" | "activist" | "contact";

export interface CampaignWorkerMembership {
  membership_id: number;
  campaign_id: number;
  worker_id: number;
  oa_leader_role: OaLeaderRole | null;
  created_at: string;
  updated_at: string;
}
```

---

### 1.4 System C: Engagement Level (`workers.engagement_level`)

#### Database Schema

**Table: `workers`** -- relevant column:
- `engagement_level` (varchar, NOT NULL, default `'contact'`)
- `engagement_score` (integer, NOT NULL, default 0)

**Distinct values currently in DB:** `contact`, `activist`, `delegate`, `attendee`, `leader`

Note: `attendee` and `leader` do not map to either of the other two role systems.

#### How It Is Used

**Worker detail page** (`apps/organising-db/src/app/(dashboard)/workers/[id]/page.tsx` lines 1422, 1590):
- Displayed as read-only "Engagement Level" field
- Shown alongside the engagement score progress bar
- Never editable in the UI

**Worker import routes** (`apps/organising-db/src/app/api/worker-import/apply/route.ts` line 156, `apps/organising-db/src/app/api/membership-import/apply/route.ts` line 169):
- Hardcoded to `"contact"` when creating new workers via import
- `engagement_score` hardcoded to `0`

**Type definition** (in `organising-row-types.ts`):
```typescript
engagement_score: number;
engagement_level: string;
```

No enum constraint in TypeScript, just a string field.

---

### 1.5 Activity Rating System

#### Database Schema

**Table: `campaign_activities`**
- `activity_id` (serial PK)
- `campaign_id` (FK)
- `title` (varchar)
- `activity_kind` (varchar, default `'task'`) -- values: `task`, `assessment`
- `is_binary` (boolean) -- for vote-style yes/no activities
- `template_key` (varchar, nullable) -- links to predefined templates

**Table: `campaign_activity_ratings`**
- `rating_id` (serial PK)
- `activity_id` (FK to campaign_activities)
- `worker_id` (FK to workers)
- `rating` (integer, 1-5)
- `binary_value` (varchar, nullable) -- for vote-style activities
- `source` (varchar, default `'staff'`) -- values: `staff`, `leader_form`
- `rated_at` (timestamptz)
- Unique constraint on `(activity_id, worker_id)`

**View: `campaign_worker_rating_summary`**
- Computes `cumulative_rating`: rounded average of all ratings for the worker within the campaign
- Computes `last_activity_rating`: most recent rating for the worker

#### Default Rating Logic

In `apps/organising-db/src/lib/campaign/constants.ts`, the function `getWallChartDefaultCumulative()`:

```typescript
export function getWallChartDefaultCumulative(args: {
  unionMembershipTypeName: string | null | undefined;
  memberRoleName: string | null | undefined;
  oaLeaderRole: string | null | undefined;
}): 1 | 2 | null {
  const r = args.memberRoleName;
  if (r === "delegate") return 1;
  const oa = args.oaLeaderRole;
  if (oa === "activist" || oa === "delegate") return 1;
  const u = args.unionMembershipTypeName;
  if (u && UNION_MEMBER_LIKE_TYPE_NAMES.has(u)) return 2;
  return null;
}
```

This function currently checks BOTH the global role (`memberRoleName`) AND the campaign OA role (`oaLeaderRole`) -- another manifestation of the dual system.

---

### 1.6 Task Lists and Organising Units

#### Task Lists

**Table: `campaign_task_lists`**
- `task_list_id` (serial PK)
- `campaign_id` (FK)
- `activity_id` (FK to campaign_activities) -- which activity the task relates to
- `leader_worker_id` (FK to workers, nullable) -- the worker leading this task
- `leader_organiser_id` (FK to organisers, nullable) -- OR an organiser leading it
- `status` (varchar, default `'active'`)
- `title` (varchar, nullable)

**Table: `campaign_task_list_items`**
- `id` (serial PK)
- `task_list_id` (FK)
- `worker_id` (FK to workers) -- a worker on the list
- `sort_order` (integer)

**Table: `campaign_leader_tokens`**
- `token_id` (serial PK)
- `task_list_id` (FK)
- `token_hash` (text) -- hashed token for external leader form access
- `expires_at`, `revoked_at`, `last_used_at` (timestamptz)

**Current data:** 1 task list, 5 items, 0 tokens.

#### Organising Units

**Table: `campaign_organising_units`**
- `ou_id` (serial PK)
- `campaign_id` (FK)
- `ou_type` (varchar) -- values: shift, department, network, job_type, worksite, ethnic_community, crew_rotation, accommodation, work_area, custom
- `name` (varchar)
- `total_workers_estimated` (integer, nullable)
- `anchor_worker_id` (FK to workers, nullable) -- the "anchor" or natural leader of the unit
- `source` (varchar, default `'manual'`) -- manual, wtp_seeded
- `commonality_logic` (text, nullable) -- description of what groups these workers
- `target_size` (integer, nullable) -- desired unit size

**Table: `campaign_worker_ou`**
- `id` (serial PK)
- `ou_id` (FK to campaign_organising_units)
- `worker_id` (FK to workers)
- `is_primary` (boolean, default false) -- whether this is the worker's primary unit
- `assignment_source` (varchar, default `'manual'`) -- manual, rule_based
- `assigned_rule_id` (FK to campaign_unit_rules, nullable)

**Table: `campaign_unit_rules`**
- Rules for automatic worker assignment to OUs based on dimensions (employer, worksite, occupation, etc.)

**Current data:** 2 OUs (1 wtp_seeded, 1 manual), 14 worker-OU assignments.

#### Current Gaps

1. **No link between task lists and OUs** -- task lists are created independently from OUs. A leader's task list workers are not automatically grouped into an OU, and the task creation dialog does not offer OU selection.

2. **No auto-rating on task assignment** -- when workers are added to a task list, no activity rating is created. The leader must manually rate each worker.

3. **No auto-role-promotion** -- when a worker is given leadership responsibilities (assigned as task list leader), their organising role is not automatically updated.

4. **Leader counting uses task lists, not roles** -- the `workload_campaign_entities` view counts leaders from `campaign_task_lists.leader_worker_id`, not from role assignments. This means leader counts are based on task allocation, not on who has a leadership role.

---

### 1.7 Key Views and Functions Affected

| View/Function | References | Impact |
|---|---|---|
| `campaign_ou_coverage_summary` | `oa_leader_role` | Counts OUs with contacts/activists/delegates |
| `campaign_worker_rating_summary` | Activity ratings only | No role-based defaults in DB, only in frontend |
| `workload_campaign_entities` | `campaign_task_lists.leader_worker_id` | Leader count from task lists |
| `workload_dashboard_summary` | Aggregates from above views | Dashboard totals |
| `workers_view` | `member_role_type_id`, `engagement_level`, `engagement_score` | Worker list view |
| `getWallChartDefaultCumulative()` | Both `memberRoleName` and `oaLeaderRole` | Wall chart cell colours |
| `isWorkerMemberLike()` | `memberRoleName` | Delegate eligibility |

---

### 1.8 Summary of Issues

1. **Three overlapping role systems** with inconsistent values, no sync, and different scopes
2. **Dual dropdowns in wall chart** for the same conceptual role (global vs campaign)
3. **engagement_level is a dead field** -- set to `"contact"` on import, never edited, overlaps with role system
4. **No automation** between task assignment, role promotion, and activity ratings
5. **OUs and task lists are disconnected** -- organising units should be the natural grouping for task allocation
6. **Rating defaults split across DB and frontend** -- `getWallChartDefaultCumulative()` implements defaults in JS, but the `campaign_worker_rating_summary` view has no knowledge of role-based defaults
7. **oa_leader_role CHECK constraint missing `'bargaining_rep'`** -- the campaign role doesn't even support the full role set
8. **Bargaining Rep conflated with hierarchy** -- Bargaining Rep is a positional appointment (like HSR) that should be independent of the Contact/Activist/Delegate hierarchy, but is currently stored as a role in the same hierarchy

---

## Part 2: Target State (Harmonised Model)

### 2.1 Design Principles

1. **Single source of truth** for leadership roles: `workers.member_role_type_id`
2. **Roles are enduring** -- they persist beyond any specific campaign
3. **Ratings are episodic** -- per activity within a campaign, on a 1-5 scale
4. **Overall rating is computed** -- from activity ratings, with role-based defaults
5. **Task allocation drives automation** -- assigning a task auto-rates, auto-promotes roles
6. **Organising units are the default grouping** for task allocation

### 2.2 Enduring Leadership Roles

The leadership model has two dimensions:

#### A. Role Hierarchy (single role, one of)

| Role | Sort Order | Description |
|------|-----------|-------------|
| Contact | 1 | Known worker, initial contact made |
| Activist | 2 | Actively participating in organising |
| Delegate | 3 | Elected/appointed workplace delegate (members only) |

**Storage:** `workers.member_role_type_id` FK to `member_role_types` (existing, unchanged).

#### B. Independent Positional Flags (can coexist with any role)

| Flag | Storage | Affects Rating Default? | Description |
|------|---------|------------------------|-------------|
| HSR | `workers.is_hsr` (boolean) | **No** | Health & Safety Representative -- a formal safety role, independent of organising leadership |
| Bargaining Rep | `workers.is_bargaining_rep` (boolean, **new**) | **Yes** (default 1) | Bargaining representative -- an organising leadership position, independent of the role hierarchy |

Bargaining Rep is a positional appointment that can apply to a worker at any point in the role hierarchy and implies organising leadership (hence default rating of 1). HSR is a safety appointment with no bearing on organising leadership or support ratings. A worker can be a Contact who is also a Bargaining Rep, or a Delegate who is also HSR, etc.

**Storage change:** Remove Bargaining Rep from `member_role_types` table. Add `workers.is_bargaining_rep` boolean column (nullable, default null) to mirror `workers.is_hsr`.

**Auto-promotion rule:** When a worker is assigned as a task list leader, their role is auto-promoted to at least Activist (if currently Contact or null).

### 2.3 Fields to Remove

| Field | Table | Reason |
|-------|-------|--------|
| `oa_leader_role` | `campaign_worker_membership` | Redundant -- campaigns reference global role via worker join |
| `engagement_level` | `workers` | Redundant -- replaced by `member_role_type_id` |
| `engagement_score` | `workers` | Orphaned -- no longer has a paired level field |
| Bargaining Rep row | `member_role_types` (role_type_id=4) | Moved to independent boolean `workers.is_bargaining_rep` |

### 2.4 Rating System (Enhanced)

**Per-activity ratings** remain unchanged: `campaign_activity_ratings` with 1-5 scale.

**Overall/cumulative rating** enhanced with role-based defaults:

| Worker Status | Default Cumulative | Rationale |
|---|---|---|
| Has any leadership role (Contact, Activist, Delegate) or is Bargaining Rep | **1** (supportive leader) | Leaders and bargaining reps are assumed supportive until rated otherwise |
| Union member without leadership role or Bargaining Rep flag | **2** | Members are engaged but uncharacterised |
| Non-member, no role | **null** (no default) | Unknown engagement |

Note: **HSR alone does not affect the default rating.** HSR is a formal safety appointment, not an indicator of organising leadership or support level. A worker who is only an HSR (with no other role) is treated the same as any other member or non-member for rating purposes.

**Implementation:** Update `getWallChartDefaultCumulative()` to derive defaults from `member_role_type` and `is_bargaining_rep` (removing `oaLeaderRole` parameter; `is_hsr` is not a factor). Optionally move this logic into the `campaign_worker_rating_summary` database view for consistency.

### 2.5 Task List and OU Integration

#### Auto-behaviours on task list creation/assignment:

1. **Leader auto-rating:** When a worker is assigned as task list leader (`campaign_task_lists.leader_worker_id`), auto-insert a rating of 1 (supportive leader) for the linked activity (if no rating exists for that leader+activity). This reflects that being assigned as a leader implies support.
2. **Leader auto-role-promotion:** The same leader is auto-promoted to at least Activist (role_type_id 8) if their current role is NULL or Contact (3). Workers who are already Activist or Delegate are unaffected.
3. **No auto-rating for list workers:** Workers added to a task list (`campaign_task_list_items`) are NOT automatically rated. They are added for assessment by the leader; the leader rates them via the external link.
4. **OU linkage:** Workers on a task list should form (or be assigned to) an organising unit

#### Enhanced task creation UI:

The task list creation dialog should:
- Default to **OU picker** as the worker selection method (select an existing OU to populate the list)
- Allow **creating a new OU** from the selected workers
- Allow **manual worker selection** (current behaviour) as an alternative
- Allow **editing** the worker list after creation (move workers between OUs for specific tasks)

---

## Part 3: Implementation Plan

### Phase 1: Data Reconciliation Migration

**Goal:** Ensure no data is lost when dropping columns.

**Steps:**
1. **Bargaining Rep migration:** For each worker with `member_role_type_id = 4` (bargaining_rep):
   - Set `workers.is_bargaining_rep = true`
   - Set `member_role_type_id` to the next most appropriate role (Delegate if member-like, otherwise Activist)
2. **OA leader role reconciliation:** For each worker with `campaign_worker_membership.oa_leader_role` set to a value that implies a higher rank than their current `workers.member_role_type_id`:
   - Promote `member_role_type_id` to match the higher role
   - E.g., if `oa_leader_role = 'activist'` and `member_role_type_id` is null or Contact, set to Activist
3. **Engagement level reconciliation:** For each worker with `engagement_level` that implies a higher rank than their current `member_role_type_id`:
   - Map `engagement_level` values to role hierarchy and promote if higher
   - `attendee` and `leader` map to Activist (closest equivalent)
4. Log all promotions for audit
5. **Remove Bargaining Rep from `member_role_types`:** Delete or deactivate the row with `role_type_id = 4`

**Affected files:**
- New migration file in `supabase/migrations/`

### Phase 2: Schema Migration

**Goal:** Remove redundant columns and update dependent views.

**Steps:**
1. Add column `workers.is_bargaining_rep` (boolean, nullable, default null)
2. Drop column `campaign_worker_membership.oa_leader_role` (and its CHECK constraint)
3. Drop columns `workers.engagement_level` and `workers.engagement_score`
4. Deactivate/delete Bargaining Rep row from `member_role_types` (role_type_id=4)
5. Update view `campaign_ou_coverage_summary`:
   - Replace `oa_leader_role` joins with `member_role_types` via workers
   - Count OUs by worker's global role instead of campaign-specific role
6. Update view `campaign_worker_rating_summary` (optional):
   - Could incorporate role-based defaults directly, or keep in frontend
7. Add database trigger on `campaign_task_lists` INSERT/UPDATE of `leader_worker_id`:
   - Auto-promote `leader_worker_id` to at least Activist in `workers.member_role_type_id`
   - Auto-insert rating of 1 (supportive leader) for the leader on the linked activity
8. No trigger on `campaign_task_list_items` INSERT -- workers are added for assessment and should not be auto-rated

**Affected files:**
- New migration file in `supabase/migrations/`
- `apps/organising-db/src/types/organising-row-types.ts` -- remove `OaLeaderRole` type, update `CampaignWorkerMembership` interface, update `Worker` interface
- `packages/db-types/index.ts` -- regenerate types

### Phase 3: Frontend Role Consolidation

**Goal:** Replace all `oa_leader_role` references with `member_role_type`.

| File | Change Required |
|------|----------------|
| `campaign-structure.tsx` | Remove OA leader role dropdown; show worker's global role (editable, saving to `workers.member_role_type_id`) |
| `campaign-wall-chart.tsx` (lines 288, 342-345, 453, 467-505, 510-511, 552-571) | Replace `oa_leader_role` badge with `member_role_type.display_name`; remove "OA leader role (this campaign)" dropdown from side panel; keep only "Organising role" dropdown |
| `campaign-assessments.tsx` (line 329) | Replace `oa_leader_role` field value with `member_role_type` display name |
| `campaign-units-section.tsx` | Replace member data shape references |
| `campaign-list-builder.tsx` (lines 66, 364, 803-806) | Replace `oa_leader_role` with global role for display and CSV export |
| `email-wizard/EmailWizardSteps.tsx` | Replace `oa_leader_role` filter with global role filter |
| `constants.ts` (lines 64-78) | Simplify `getWallChartDefaultCumulative()`: remove `oaLeaderRole` parameter, derive from `memberRoleName` + `isBargainingRep` (HSR is not a factor). Update `MEMBER_LIKE_ROLE_NAMES` and `isWorkerMemberLike()` to check `is_bargaining_rep` boolean |

### Phase 4: API Route Updates

| File | Change Required |
|------|----------------|
| `api/campaigns/[id]/list-builder/route.ts` (lines 43, 63, 96) | Replace `oa_leader_role` select/filter with `member_role_type` join |
| `api/campaigns/[id]/push-list/route.ts` (lines 72, 83) | Replace `oa_leader_role` select/filter with `member_role_type` join |
| `api/worker-import/apply/route.ts` (line 156) | Remove `engagement_level` and `engagement_score` from insert |
| `api/membership-import/apply/route.ts` (line 169) | Remove `engagement_level` and `engagement_score` from insert |
| `lib/api/an-engagement-sync.ts` (lines 112, 147, 169) | Replace `oa_leader_role` with `member_role_type` join; update filter logic |

### Phase 5: Task List / OU Integration Enhancement

**Goal:** Add OU-based task allocation with auto-behaviours.

**Changes to `campaign-task-lists.tsx`:**
1. Add OU picker to the "New task list" dialog:
   - "Populate from organising unit" dropdown (lists existing OUs)
   - Selecting an OU pre-populates the worker checklist with OU members
   - Workers remain individually editable (add/remove from the pre-populated list)
2. Add "Create organising unit from this list" option:
   - After creating a task list, offer to create a new OU from the list's workers
   - Or auto-create if user opts in during creation
3. Frontend triggers for auto-behaviours (in addition to DB triggers):
   - After creating a task list, invalidate worker queries to reflect role promotions
   - Show feedback if a leader was auto-promoted

**New capabilities:**
- Workers can be allocated to leaders in different OUs for specific tasks
- The default workflow is: select OU -> create task list for that OU -> assign leader
- But users can override by manually selecting individual workers

### Phase 6: Cleanup and Verification

**Cleanup:**
- Remove `workers.engagement_level` display from worker detail page (lines 1422, 1590)
- Remove `workers.engagement_score` progress bar from worker detail page
- Add `workers.is_bargaining_rep` checkbox/toggle to worker detail page (alongside existing HSR toggle)
- Update worker detail `WorkerDetail` interface to remove deprecated fields and add `is_bargaining_rep`
- Update `workers_view` database view to remove `engagement_level` and `engagement_score`
- Regenerate database types (`packages/db-types/index.ts`)

**Verification checklist:**
- [ ] Wall chart renders correctly with role from `member_role_types` instead of `oa_leader_role`
- [ ] Wall chart cell colours use correct defaults (1 for leaders, 2 for members)
- [ ] Campaign structure tab shows global role, correctly saves to worker record
- [ ] OU coverage summary view correctly counts roles via worker join
- [ ] Workload dashboard leader counts remain accurate
- [ ] List builder filters work with global role instead of campaign role
- [ ] Push list (AN sync) works with global role
- [ ] Task list creation with OU picker works
- [ ] Workers added to task list are NOT auto-rated (trigger removed)
- [ ] Leader assigned to task list is auto-rated 1 (supportive leader) for linked activity (DB trigger)
- [ ] Leader auto-role-promotion to Activist works when currently NULL or Contact (DB trigger)
- [ ] Worker import no longer requires engagement_level
- [ ] Worker detail page no longer shows engagement_level

---

## Part 4: Data Model Diagrams

### Current State (Before Harmonisation)

```
workers
├── member_role_type_id  ──FK──>  member_role_types (Contact/Activist/BargRep/Delegate)
├── is_hsr               (boolean)
├── (no is_bargaining_rep field)
├── engagement_level      (varchar: contact/activist/delegate/attendee/leader)  <-- REDUNDANT
└── engagement_score      (integer)                                             <-- ORPHANED

campaign_worker_membership
├── worker_id     ──FK──>  workers
├── campaign_id   ──FK──>  campaigns
└── oa_leader_role (varchar: contact/activist/delegate)                         <-- REDUNDANT

campaign_task_lists
├── leader_worker_id  ──FK──>  workers   (no auto-promotion)
├── activity_id       ──FK──>  campaign_activities
└── (no link to OUs)

campaign_task_list_items
├── worker_id  ──FK──>  workers   (no auto-rating)
└── (no link to OUs)

campaign_organising_units
├── anchor_worker_id  ──FK──>  workers
└── (not linked to task lists)
```

### Target State (After Harmonisation)

```
workers
├── member_role_type_id  ──FK──>  member_role_types (Contact/Activist/Delegate)
├── is_hsr               (boolean)   -- independent positional flag
└── is_bargaining_rep    (boolean)   -- independent positional flag (NEW)

campaign_worker_membership
├── worker_id     ──FK──>  workers
├── campaign_id   ──FK──>  campaigns
└── (role accessed via workers.member_role_type_id join)

campaign_task_lists
on the Campaigns Page, I'd like to move the "Campaign Wizard", "Email Wizard" "Phone Wizard" and "+ Create Cam├── leader_worker_id  ──FK──>  workers   (auto-promotes to Activist + auto-rates leader as 1)
├── activity_id       ──FK──>  campaign_activities
└── ou_id             ──FK──>  campaign_organising_units  (optional, links list to OU)

campaign_task_list_items
├── worker_id  ──FK──>  workers   (no auto-rating; workers are added for assessment)
└── (workers form/join an OU via campaign_worker_ou)

campaign_organising_units
├── anchor_worker_id  ──FK──>  workers
└── (workers assigned via campaign_worker_ou)
```

---

## Part 5: Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data loss from dropping `oa_leader_role` | Phase 1 data reconciliation promotes all higher values to global role before drop |
| Data loss from dropping `engagement_level` | Phase 1 reconciles engagement_level values to global role hierarchy |
| Bargaining Rep data loss | Phase 1 migrates all `member_role_type_id = 4` workers to `is_bargaining_rep = true` + appropriate hierarchy role before removing the role type |
| Downstream breakage in views | Views are updated in the same migration that drops columns |
| API breakage | All API routes updated in Phase 4 before deployment |
| External integrations (Action Network) | AN sync updated to use global role in Phase 4 |
| Wall chart visual regression | Default colour logic simplified but produces same results (1 for leaders, 2 for members) |
| `isWorkerMemberLike()` regression | Updated to check `is_bargaining_rep` boolean in addition to role name, preserving delegate eligibility logic |
| DB triggers failing silently | Triggers wrapped in exception handlers, logged; frontend also shows auto-promotion feedback |

---

## Appendix A: Complete File Inventory

### Files with `oa_leader_role` references (to be updated or removed):

1. `apps/organising-db/src/components/campaigns/campaign-structure.tsx`
2. `apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx`
3. `apps/organising-db/src/components/campaigns/campaign-assessments.tsx`
4. `apps/organising-db/src/components/campaigns/campaign-units-section.tsx`
5. `apps/organising-db/src/components/campaigns/campaign-list-builder.tsx`
6. `apps/organising-db/src/components/campaigns/email-wizard/EmailWizardSteps.tsx`
7. `apps/organising-db/src/app/api/campaigns/[id]/list-builder/route.ts`
8. `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts`
9. `apps/organising-db/src/lib/api/an-engagement-sync.ts`
10. `apps/organising-db/src/lib/campaign/constants.ts`
11. `apps/organising-db/src/lib/hooks/useCampaignCurrentStats.ts`
12. `apps/organising-db/src/types/organising-row-types.ts`
13. `packages/db-types/index.ts`
14. `supabase/migrations/20260331140000_campaign_workflow_tables.sql` (historical, no change needed)
15. `supabase/migrations/20260408200100_ou_discovery_schema.sql`
16. Database views: `campaign_ou_coverage_summary`

### Files with `engagement_level` references (to be updated or removed):

1. `apps/organising-db/src/app/(dashboard)/workers/[id]/page.tsx`
2. `apps/organising-db/src/app/api/worker-import/apply/route.ts`
3. `apps/organising-db/src/app/api/membership-import/apply/route.ts`
4. `apps/organising-db/src/types/organising-row-types.ts`
5. `packages/db-types/index.ts`
6. `apps/organising-db/scripts/seed-test-onshore-worksite.ts`
7. Database views: `workers_view`

### Files with task list / OU code (to be enhanced):

1. `apps/organising-db/src/components/campaigns/campaign-task-lists.tsx`
2. `apps/organising-db/src/app/api/campaign-leader/[token]/route.ts`
3. `apps/organising-db/src/app/api/campaigns/[id]/task-lists/[taskListId]/token/route.ts`
4. `apps/organising-db/src/components/campaigns/campaign-units-section.tsx`
5. `apps/organising-db/src/lib/campaign/recompute-ou-assignments.ts`
6. `apps/organising-db/src/lib/campaign/generate-ou-candidates.ts`
