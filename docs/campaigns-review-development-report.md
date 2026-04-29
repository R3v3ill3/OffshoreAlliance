# Campaigns review — development report

A consolidated report on the 9-phase campaigns section overhaul, written for
agents (and future humans) who need to understand, extend, or troubleshoot
the work without re-reading every commit.

- **Plan file:** `/Users/troyb/.claude/plans/i-d-like-to-review-quizzical-gem.md`
- **Branch / worktree:** `claude/angry-kowalevski-5ed8bf` (worktree at
  `.claude/worktrees/angry-kowalevski-5ed8bf`)
- **Incidental issues found along the way:**
  [`docs/campaigns-review-incidental-issues.md`](./campaigns-review-incidental-issues.md)
- **All 9 phases shipped end-to-end.** Migrations and component code live in
  the worktree; some migrations were committed in batches by the user during
  the work, the rest remain uncommitted at end of session.

## What this work was for

The campaigns section is the central workflow surface — wizard, planner,
stage planning, gates, allocation, reporting. Before this work:

- Two divergent creation paths (`campaign-wizard.tsx`, `planner-wizard.tsx`)
  captured the same data inconsistently.
- Wizard order forced organisers to enter `total_worker_estimate` before
  they had even picked employers/worksites.
- Only one agreement could be linked to a campaign (`replaced_agreement_id`).
- Campaign-level ambitions didn't exist — only stage ambitions, with no
  rollup story.
- Stage planning pages stacked 4–5 headers, leaving the working area too
  small. The 5 P2W steps rendered as horizontal tabs.
- Ambitions in `AmbitionPanel.tsx` rendered twice (once for selection, once
  as metric cards) with three different alternative colour treatments.
- Where-to-Play taxonomy mixed "Workplace organising committee" and
  "Structured organising conversations" into Communications Platforms;
  "Contact Method Priority" duplicated the per-row priority field.
- Stage overlap was permitted by the DB but had no UX or hard-gate guard.
- Plan refinements (edits to active/completed stages) had no audit trail.

## Locked decisions (set before work started)

These were chosen up front and shaped every subsequent phase:

| Decision | Choice | Why |
|---|---|---|
| Multi-agreement model | New `campaign_agreements` junction table | Junction lets us tag relationship_type (replaced/new/related) and is_primary; preserves backward compat via a trigger that mirrors the primary 'replaced' agreement back to the legacy single-FK column. |
| Campaign-level ambitions | New `campaign_ambitions` table + nullable `plan_ambitions.parent_campaign_ambition_id` | Separate lifecycles, one rollup view (`campaign_ambition_progress`); avoids overloading `plan_ambitions`. |
| Hard-gate overlap semantics | Configuration-driven (`enforcement_type='hard'` AND `is_active=true`) | Predictable rule that matches existing 'hard gate' usage; not assessment-driven. |
| WOC + SOC destination | Move to `plan_capacities` (with backfill) | They describe how organising capacity is exercised, not channels. |
| Iterative-planning audit | Lightweight `plan_revision_notes` table | Free-text "what changed and why" on edits to active/completed stages; avoids full versioning. |
| Phase 9 reporting | In scope, not deferred | Natural payoff for Phases 3, 6, 7. |
| Implementation-time defaults | Search bar removed from `header.tsx`; tab URL state via `?tab=`; step overrides as JSONB column | Documented in the plan file under "Remaining Implementation-Time Decisions". |

## Phases at a glance

| Phase | Theme | Migrations | Notable components | Status |
|---|---|---|---|---|
| 1 | Wizard restructure + multi-agreement + plan timeframe | `20260502100000_campaign_agreements`, `20260502110000_campaign_plan_timeframe` | `step-agreements`, `step-worker-estimate` | shipped |
| 2 | Campaign units in wizard + worker allocation rewrite | `20260503100000_campaign_unit_extensions` | `step-campaign-units`, `step-allocate-workers` (rewrite), `add-workers-client` patch | shipped |
| 3 | Campaign-level ambitions + stage→campaign rollup | `20260504100000_campaign_ambitions` | `step-campaign-ambitions`, AmbitionPanel parent picker | shipped |
| 4 | Manual create + all-settings editor | — | `campaign-settings`, `/campaigns/[id]/settings`, `/campaigns/new/manual` | shipped |
| 5 | Chrome cleanup + vertical P2W nav + tab URL | `20260505100000_step_overrides` | `P2WVerticalNav`; route-aware `cross-app-banner`, `header` | shipped |
| 6 | Stage overlap + hard-gate guard + revision audit | `20260506100000_stage_overlap_constraint`, `20260506110000_plan_revision_notes` | `StageTimelineGantt`, `PlanRefinementDialog`, `CampaignRevisionHistory` | shipped |
| 7 | Ambitions panel single-card redesign + sticky summary | — | `AmbitionCard`, `AmbitionStageSummary`; `AmbitionPanel` rewrite | shipped |
| 8 | Where-to-Play taxonomy cleanup + ambition linkage | `20260507100000_wtp_taxonomy_cleanup` | `WhereToPlayLandingDialog`; `WhereToPlayPanel` rewrite | shipped |
| 9 | Campaign progress dashboard | — | `CampaignProgressReport`, `/reports/campaign-progress`, Insights tab | shipped |

---

## Phase-by-phase detail

### Phase 1 — Wizard restructure + multi-agreement model

**Schema**

- [`20260502100000_campaign_agreements.sql`](../supabase/migrations/20260502100000_campaign_agreements.sql)
  - New table `campaign_agreements` (PK `id`, `campaign_id`, `agreement_id`,
    `relationship_type` ∈ {replaced, new, related}, `is_primary`,
    `sort_order`, timestamps, `UNIQUE(campaign_id, agreement_id)`).
  - Partial unique index on `(campaign_id) WHERE relationship_type='replaced'
    AND is_primary=true` — at most one primary replaced agreement per campaign.
  - Backfill: every existing `campaigns.replaced_agreement_id` becomes a
    primary 'replaced' row.
  - Trigger `sync_campaign_replaced_agreement` on
    `campaign_agreements (INSERT/UPDATE/DELETE)` — keeps
    `campaigns.replaced_agreement_id` mirrored from the primary 'replaced'
    row so legacy reads continue to work.
  - RLS policies (read for authenticated, insert/update for admin/user,
    delete for admin only).
- [`20260502110000_campaign_plan_timeframe.sql`](../supabase/migrations/20260502110000_campaign_plan_timeframe.sql)
  - New nullable column `campaigns.plan_timeframe_weeks INT` with CHECK > 0.

**Wizard restructure** (`apps/organising-db/src/components/campaigns/campaign-wizard.tsx`)

- Default `campaign_type = "bargaining"` (was `organising`).
- Step 1 changes:
  - Inline help describing what `sector_wide` does.
  - Replaced "End date" with a "Plan timeframe" 3-mode selector (weeks /
    months / custom date) — driven by helper `computePlanTimeframe(basics)`.
  - Removed `total_worker_estimate` (moved to Step 4).
  - Removed inline `ReplacedAgreementPicker` — agreements now have their own
    step.
- New ordering for bargaining: Basics → Employers/Worksites → Agreements →
  Worker estimate → Campaign units → Allocate workers → Campaign ambitions
  → Plan handoff (8 steps total; 7 for non-bargaining).
- New mutations: `saveAgreementsMutation`, `saveEstimateMutation`,
  `saveUnitsMutation`, `saveCampaignAmbitionsMutation`.
- Wizard scope query (`useQuery({queryKey: ["campaign-wizard-scope", campaignId], …})`)
  loads everything in parallel: employers, worksites, workers,
  campaign_agreements, campaign_organising_units, campaign_worker_ou,
  campaign_ambitions. Hydration is one-shot via a ref.

**New step components**

- [`step-agreements.tsx`](../apps/organising-db/src/components/campaigns/step-agreements.tsx) —
  multi-agreement picker. Surfaces agreements linked to selected
  employers/worksites first; supports inline create. Per-row
  relationship_type select + primary star.
- [`step-worker-estimate.tsx`](../apps/organising-db/src/components/campaigns/step-worker-estimate.tsx)
  — live worker count for selected employers/worksites; suggested estimate
  is `ceil(live × 1.10 / 10) × 10`; variance feedback.

**Planner-wizard awareness**

- `useExistingCampaignForPlanning` in [`usePlannerCampaigns.ts`](../apps/organising-db/src/lib/hooks/usePlannerCampaigns.ts)
  also fetches `campaign_agreements` and exposes them as
  `attached_agreements` on the result.
- [`planner-wizard.tsx`](../apps/organising-db/src/components/campaigns/planner-wizard.tsx)
  linked-campaign banner now lists every attached agreement with role +
  primary tag.

**Types**

- `CampaignAgreementRelationshipType` and `CampaignAgreementRow` exported from
  [`organising-row-types.ts`](../apps/organising-db/src/types/organising-row-types.ts).
- `Campaign` interface extended with optional `plan_timeframe_weeks` and
  `msd_required` fields (matches columns added in earlier migrations not yet
  reflected in regenerated `@oa/db-types`).

### Phase 2 — Campaign units + enhanced worker allocation

**Schema**

- [`20260503100000_campaign_unit_extensions.sql`](../supabase/migrations/20260503100000_campaign_unit_extensions.sql)
  - Drops + re-adds the `ou_type` CHECK constraint adding `'employer'`
    (full set: shift, department, network, job_type, worksite, employer,
    ethnic_community, crew_rotation, accommodation, work_area, custom).
  - Mirrors the same enum on `campaign_ou_candidates.suggested_ou_type`.
  - Adds `unit_basis JSONB` column for capturing the filter the unit was
    built from (e.g. `{"employer_id": 12}`, `{"occupation_group_id": 4}`).
  - Creates view `campaign_unit_assignment_summary` (per
    `(campaign_id, ou_id)` allocated worker counts; rows with `ou_id IS NULL`
    represent the synthetic "Unallocated" bucket).
- The "Unallocated" bucket is intentionally **computed**, not a real row.

**New step component**

- [`step-campaign-units.tsx`](../apps/organising-db/src/components/campaigns/step-campaign-units.tsx)
  - "Use employers / worksites as campaign units" toggles auto-create one
    `campaign_organising_units` row per selected entity (`ou_type='employer'`
    or `'worksite'`, `unit_basis = { employer_id }` / `{ worksite_id }`).
  - Pickers for occupational grouping (`ou_type='job_type'`,
    `unit_basis.occupation_group_id`) and individual occupation
    (`unit_basis.canonical_occupation_id`).
  - "Custom unit" free-form (`ou_type='custom'`, `unit_basis.custom=true`).
  - Per-unit `total_workers_estimated` input. Sum validation against
    campaign-level `total_worker_estimate`; remainder shown as the
    Unallocated bucket.

**Worker allocation rewrite**

- [`step-allocate-workers.tsx`](../apps/organising-db/src/components/campaigns/step-allocate-workers.tsx)
  - Sortable / filterable worker table (columns: name, employer, worksite,
    occupation + group).
  - Per-row pill toggles for assigning to each campaign unit.
  - Bulk-action bar: select all filtered, add/remove from campaign,
    "Allocate selection" to a unit (or to "Unallocated" which clears unit
    assignments). Allocation state is held in
    `WorkerUnitAllocation = Record<worker_id, Set<ou_id>>`.
  - Uses `useUpdateAmbition`-style optimistic patterns; persistence happens
    in `saveWorkersMutation` in the wizard.

**Wizard wiring**

- New state `units: CampaignUnitDraft[]` and
  `workerUnitAllocations: WorkerUnitAllocation`.
- `saveUnitsMutation`: deletes removed units, updates kept ones, inserts
  drafts (and splices server-returned `ou_id`s back into local state via a
  `draft_id → ou_id` map).
- `saveWorkersMutation` extended to also delete + reinsert
  `campaign_worker_ou` rows for the campaign's units, matching the in-memory
  allocation map.

**Compatibility patch**

- [`add-workers-client.tsx`](../apps/organising-db/src/components/campaigns/add-workers-client.tsx)
  — `OU_TYPE_LABELS` map gained `employer: "Employer"` so existing add-workers
  route compiles against the broadened `CampaignOuType`.

### Phase 3 — Campaign-level ambitions

**Schema**

- [`20260504100000_campaign_ambitions.sql`](../supabase/migrations/20260504100000_campaign_ambitions.sql)
  - New table `campaign_ambitions` (PK `campaign_ambition_id`, `campaign_id`,
    `category` ∈ {membership, member_leaders, activism, industrial_outcomes},
    `subcategory`, `label`, `target_value`, `target_value_max`, `target_unit`,
    `target_date`, `current_value`, `current_value_overridden`,
    `current_value_override_reason`, `notes`, `sort_order`, timestamps).
  - New column `plan_ambitions.parent_campaign_ambition_id INTEGER NULL` FK
    to `campaign_ambitions(campaign_ambition_id) ON DELETE SET NULL`.
  - Partial index `idx_plan_ambitions_parent_campaign_ambition` for the
    rollup query.
  - View `campaign_ambition_progress` — per (campaign, campaign ambition)
    counts: `linked_stage_ambition_count`,
    `linked_stage_ambition_achieved_count`, `linked_stage_achievement_pct`.
    Used by Phase 9 reporting.
  - Standard RLS policies.

**New step component**

- [`step-campaign-ambitions.tsx`](../apps/organising-db/src/components/campaigns/step-campaign-ambitions.tsx)
  - Four grouped sections (one per category), each with curated subcategory
    templates (e.g. member_leaders → contacts, activists, delegates,
    bargaining_reps, hsrs).
  - Per-row label, target value/unit, target date, notes.
  - "Skip for now" option preserves the wizard's all-skippable flow.

**Stage planner integration**

- New hook `useCampaignAmbitions(campaignId)` in [`useStagePlan.ts`](../apps/organising-db/src/lib/hooks/useStagePlan.ts).
- `useUpdateAmbition` accepts `parent_campaign_ambition_id?: number | null`.
- `AmbitionPanel.tsx` (in Phase 7 split into `AmbitionCard.tsx`) shows a
  "Connects to" picker per ambition when campaign-level ambitions exist.

**Types**

- `CampaignAmbitionCategory` and `CampaignAmbitionRow` in
  `organising-row-types.ts`.

### Phase 4 — Manual create + all-settings editor

**Approach**

- Phase 4 deliberately did not refactor `CampaignWizard`. Instead it built a
  parallel accordion editor that reuses the step components.

**New components / routes**

- [`campaign-settings.tsx`](../apps/organising-db/src/components/campaigns/campaign-settings.tsx)
  — accordion editor with 8 sections (Basics, Employers/Worksites,
  Agreements, Worker estimate, Campaign units, Allocate workers, Campaign
  ambitions, Strategic plan). Each section saves independently. Hydration is
  via a single parallel-fetch query (mirrors the wizard scope query).
- [`campaigns/[id]/settings/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/[id]/settings/page.tsx)
  — renders `<CampaignSettings campaignId={id} />`.
- [`campaigns/new/manual/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/new/manual/page.tsx)
  — bootstrap form (name + type + status + organiser) → creates the
  campaign row → redirects to `/campaigns/[id]/settings`. Lets users skip the
  step-paged wizard entirely.

**Navigation entry points**

- [`campaigns/[id]/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx):
  top-right buttons changed from a single "Edit" to **All settings** (→
  settings page) and **Re-run wizard** (→ existing
  `/campaigns/new?cid=X&edit=1`).
- [`campaigns/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/page.tsx)
  index: new "Manual create" link in the actions bar.

**Compatibility note**

- `CampaignSettings` re-implements the wizard's mutation logic (yes, some
  duplication). The decision was to favour clean isolation over a heavyweight
  shared-hook refactor; if the duplication becomes painful, extracting a
  `useCampaignWizardEdits(campaignId)` hook is the natural next step.

### Phase 5 — Chrome cleanup + stage planning UX

**Schema**

- [`20260505100000_step_overrides.sql`](../supabase/migrations/20260505100000_step_overrides.sql)
  - Adds `campaign_stage_plans.step_overrides JSONB NOT NULL DEFAULT '{}'`.
    Map of P2W tab id → override value.

**DB-backed step overrides**

- [`useP2wStepOverrides.ts`](../apps/organising-db/src/lib/hooks/useP2wStepOverrides.ts)
  — full rewrite. Reads via React Query (30s staleTime), writes via
  `useAuthAwareMutation` with optimistic cache patch + `onSettled`
  invalidation. Override state syncs across browsers and users.

**Vertical P2W nav**

- [`P2WVerticalNav.tsx`](../apps/organising-db/src/components/campaigns/planning/P2WVerticalNav.tsx)
  — sidebar on `sm:` and up, horizontal scroll on small screens. Each step
  shows number badge / checkmark, label, active highlighting.

**Stage page restructure**

- [`campaigns/[id]/plan/stage/[stageNumber]/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/[id]/plan/stage/[stageNumber]/page.tsx):
  horizontal Tabs strip replaced with vertical nav + content-area flex row.
  Footer step status select now persists server-side.

**Chrome cleanup**

- [`header.tsx`](../apps/organising-db/src/components/layout/header.tsx)
  — non-functional global search input removed. Stage planning routes
  (`/campaigns/*/plan/stage/*`) collapse the global header entirely (mobile
  nav still rendered on small screens).
- [`cross-app-banner.tsx`](../apps/organising-db/src/components/layout/cross-app-banner.tsx)
  — route-aware: returns `null` on stage planning routes.

**Tab URL persistence**

- [`campaigns/[id]/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx):
  `?tab=...` drives the active tab via `useSearchParams`. Default `overview`
  emits a clean URL with no param. Validates against a `validTabs` list to
  reject malformed URL inputs.

### Phase 6 — Stage overlap UX + hard-gate enforcement

**Schema**

- [`20260506100000_stage_overlap_constraint.sql`](../supabase/migrations/20260506100000_stage_overlap_constraint.sql)
  - Function `enforce_stage_overlap_with_hard_gates()` on
    `campaign_stage_plans (BEFORE INSERT/UPDATE OF planned_start_date,
    planned_end_date, stage_number, campaign_id)`. Raises `check_violation`
    if the new dates overlap an adjoining stage when the gate between them
    is `enforcement_type='hard'` AND `is_active=true`.
  - Function `check_gate_change_against_overlap()` on
    `gate_definitions (BEFORE INSERT/UPDATE OF enforcement_type, is_active)`.
    Raises `check_violation` if flipping a gate to hard+active would lock an
    existing overlap.
  - Soft / inactive gates allow overlap (preserves prior non-linear
    planning).
- [`20260506110000_plan_revision_notes.sql`](../supabase/migrations/20260506110000_plan_revision_notes.sql)
  - Append-only table `plan_revision_notes` (campaign_id,
    stage_number_affected, revision_type ∈ {schedule_change, scope_change,
    ambition_change, capacity_change, management_change,
    where_to_play_change, theory_change, other}, notes,
    triggers_downstream_shift, revised_by, revised_at). Indexes on
    campaign_id, (campaign_id, stage_number_affected), and revised_at DESC.
    RLS allows read + insert; intentionally no update / delete policies.

**New components**

- [`StageTimelineGantt.tsx`](../apps/organising-db/src/components/campaigns/planning/StageTimelineGantt.tsx)
  — date-aligned Gantt of the 6 stages; computes overlap days between
  adjacent stages and renders lock pills (hard-gated) or amber overlap-day
  badges (soft).
- [`PlanRefinementDialog.tsx`](../apps/organising-db/src/components/campaigns/planning/PlanRefinementDialog.tsx)
  — modal that captures revision_type + notes + triggers_downstream_shift,
  persists a `plan_revision_notes` row, then runs the caller's
  `onConfirmed` callback (where the actual mutation lives).
- [`CampaignRevisionHistory.tsx`](../apps/organising-db/src/components/campaigns/planning/CampaignRevisionHistory.tsx)
  — newest-first feed of revisions. Degrades gracefully (returns empty
  list) on environments where the migration hasn't been applied.

**Wiring**

- [`CampaignStageDatesEditor.tsx`](../apps/organising-db/src/components/campaigns/planning/CampaignStageDatesEditor.tsx):
  `StageRow` type extended with optional `status`. New helper
  `detectActiveCompletedEdit()` finds the lowest-numbered modified stage
  that's currently `active` or `completed`. `handleSave` routes through
  `PlanRefinementDialog` instead of saving directly when one exists. Save
  also surfaces the trigger's check_violation message via toast.
- Plan overview page renders the Gantt below the existing CampaignTimeline
  and `CampaignRevisionHistory` before the team section. Passes `status`
  through to the dates editor.
- Stage page renders an inline overlap banner: blue when a hard active gate
  locks the boundary, amber when soft.

**Types**

- `PlanRevisionType` and `PlanRevisionNoteRow` in
  `organising-row-types.ts`.

### Phase 7 — Ambitions panel single-card redesign

**No schema changes.**

**New components**

- [`AmbitionCard.tsx`](../apps/organising-db/src/components/campaigns/planning/AmbitionCard.tsx)
  — single card per ambition combining selection state, scope, gate, target,
  date, "Connects to" picker, delete affordance. One consistent neutral
  surface; `is_achieved` gives a subtle green tint; metric-incomplete is a
  small inline pill, not a card-level color.
- [`AmbitionStageSummary.tsx`](../apps/organising-db/src/components/campaigns/planning/AmbitionStageSummary.tsx)
  — sticky right-rail card with total / metrics-set % / hard-gate count /
  campaign-linked count + quick links to gate page and campaign-level
  ambitions in settings.

**Refactor**

- [`AmbitionPanel.tsx`](../apps/organising-db/src/components/campaigns/planning/AmbitionPanel.tsx):
  the inline per-ambition `<div>` block (~285 lines, three alternative color
  treatments) replaced with `<AmbitionCard>` inside a 2-column layout (`lg:grid-cols-3`,
  cards span 2, sticky summary spans 1). Auto-link tooltip metadata
  (member-count ↔ density mirroring) passed as `linkedTo` /
  `linkedTotals` props so the visual cue still appears.
- File length: 814 → 522 lines.

### Phase 8 — Where-to-Play taxonomy cleanup + ambition linkage

**Schema**

- [`20260507100000_wtp_taxonomy_cleanup.sql`](../supabase/migrations/20260507100000_wtp_taxonomy_cleanup.sql)
  - Adds `plan_where_to_play.linked_ambition_id INTEGER NULL` FK to
    `plan_ambitions(ambition_id) ON DELETE SET NULL`.
  - Seeds `Workplace Organising Committee (WOC) meetings` and
    `Structured Organising Conversations (SOC)` into `capacity_options` for
    all 6 stages with `category='organising_practice'`.
  - Backfills any existing `plan_where_to_play` rows referencing the
    deprecated WOC / SOC `wtp_options` into matching `plan_capacities` rows
    (idempotent via `WHERE NOT EXISTS`).
  - Soft-deprecates the two `wtp_options` rows
    (`is_active=FALSE`) so they stop surfacing in new selections.
  - Soft-deprecates the `Contact Method Priority` `wtp_categories` row.

**New component**

- [`WhereToPlayLandingDialog.tsx`](../apps/organising-db/src/components/campaigns/planning/WhereToPlayLandingDialog.tsx)
  — two-step prompt (pick stage ambition → pick category). Marks each
  ambition with `Achieved` / `Covered` badges. Routes the user back to the
  panel with the chosen category expanded and the next add pre-linked to the
  selected ambition (via a `pendingAmbitionForCategory: Map<categoryId,
  ambitionId>` ref cleared after one consume).

**Rewrite**

- [`WhereToPlayPanel.tsx`](../apps/organising-db/src/components/campaigns/planning/WhereToPlayPanel.tsx):
  - Auto-opens the landing dialog on first render when there are ambitions
    but no W2P rows yet (eslint-disabled set-state-in-effect with rationale
    comment).
  - Toolbar button (`Compass · Pursue an ambition`) reopens it.
  - Categories grouped via `wtpCategoryGroup(categoryName)` helper:
    **Focus** (contacts / worksites / employers / sectors / OUs) vs
    **Approach** (everything else). Group is presentational only; the
    `wtp_categories` table doesn't carry a group column.
  - Per selected choice: a "Pursues" picker bound to a stage ambition,
    persisting via `linked_ambition_id`.
  - Card containers carry `id="wtp-category-N"` for the landing dialog's
    smooth-scroll routing.

**Hook updates**

- [`useStagePlan.ts`](../apps/organising-db/src/lib/hooks/useStagePlan.ts):
  `useAddWhereToPlay` and `useUpdateWhereToPlay` accept
  `linked_ambition_id?: number | null`.

**Stage page wiring**

- Stage page passes `ambitions={stagePlanData?.ambitions}` into
  `<WhereToPlayPanel>` for the landing dialog and per-row picker.

### Phase 9 — Campaign progress dashboard

**No schema changes** — relies on:

- `campaign_ambition_progress` view (Phase 3)
- `plan_revision_notes` table (Phase 6)
- `gate_definitions` + `gate_assessments` (existing)
- `campaign_stage_plans` (existing)
- `plan_ambitions.parent_campaign_ambition_id` (Phase 3)

**New component**

- [`CampaignProgressReport.tsx`](../apps/organising-db/src/components/reports/CampaignProgressReport.tsx)
  — single component with `campaignId` and `embedded` props. Pulls campaign
  metadata, stage rows (planned vs actual), gates with assessments,
  campaign ambition rollup, and stage ambitions for orphan detection.
  Renders summary tiles, the Gantt (Phase 6), planned-vs-actual variance
  table, gate outcomes table, campaign ambition rollup cards, plan-coherence
  card with collapsible orphan list, and embeds `CampaignRevisionHistory`.

**Routes**

- [`reports/campaign-progress/page.tsx`](../apps/organising-db/src/app/(dashboard)/reports/campaign-progress/page.tsx)
  — campaign picker driven by `?cid=`.
- Insights tab on
  [`campaigns/[id]/page.tsx`](../apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx)
  — same component embedded inside the campaign detail page; deep-linkable
  via `?tab=insights`.

**Reports index**

- [`reports/page.tsx`](../apps/organising-db/src/app/(dashboard)/reports/page.tsx):
  `ReportOption` extended with optional `href` so cards can route to
  sub-routes instead of inline rendering. New "Campaign Progress" card
  routes to `/reports/campaign-progress`.

---

## Database state at end of work

8 new migrations, all dated `20260502*` through `20260507*` (sequentially
greater than the prior latest `20260501120000_participation_supportive`):

1. `20260502100000_campaign_agreements.sql`
2. `20260502110000_campaign_plan_timeframe.sql`
3. `20260503100000_campaign_unit_extensions.sql`
4. `20260504100000_campaign_ambitions.sql`
5. `20260505100000_step_overrides.sql`
6. `20260506100000_stage_overlap_constraint.sql`
7. `20260506110000_plan_revision_notes.sql`
8. `20260507100000_wtp_taxonomy_cleanup.sql`

**To apply**: push them to the hosted Supabase project, then run
`pnpm gen:types` to refresh `packages/db-types/index.ts` so the embedded
generated types reflect the new tables, columns, and views.

**Tables added**:

- `campaign_agreements`
- `campaign_ambitions`
- `plan_revision_notes`

**Views added**:

- `campaign_unit_assignment_summary`
- `campaign_ambition_progress`

**Columns added**:

- `campaigns.plan_timeframe_weeks`
- `campaign_organising_units.unit_basis` (JSONB)
- `campaign_stage_plans.step_overrides` (JSONB)
- `plan_ambitions.parent_campaign_ambition_id`
- `plan_where_to_play.linked_ambition_id`

**Triggers added**:

- `trg_sync_campaign_replaced_agreement` (on `campaign_agreements`)
- `trg_enforce_stage_overlap_with_hard_gates` (on `campaign_stage_plans`)
- `trg_check_gate_change_against_overlap` (on `gate_definitions`)
- `trg_campaign_agreements_updated_at` (on `campaign_agreements`)
- `trg_campaign_ambitions_updated_at` (on `campaign_ambitions`)

**Constraint changes**:

- `campaign_organising_units.ou_type` CHECK extended to include `'employer'`
  (and the same on `campaign_ou_candidates.suggested_ou_type`).

**Seed updates**:

- `wtp_options` for "WOC (Workplace Organising Committee) meetings" and
  "Structured Organising Conversations (SOC)" → `is_active=false`.
- `wtp_categories` for "Contact Method Priority" → `is_active=false`.
- New `capacity_options` rows for WOC + SOC across all 6 stages with
  `category='organising_practice'`.

---

## Frontend file map

```
apps/organising-db/src/
  app/(dashboard)/
    campaigns/
      [id]/
        page.tsx                      ← tabs + URL state + Insights tab; Edit → Settings
        plan/
          page.tsx                    ← Gantt + CampaignRevisionHistory + status pass-through
          stage/[stageNumber]/page.tsx ← vertical P2W nav + overlap banner
        settings/                     ← NEW (Phase 4)
          page.tsx
      new/
        page.tsx                      ← unchanged dispatch to wizard / planner-wizard
        manual/                       ← NEW (Phase 4)
          page.tsx
      page.tsx                        ← Manual create link added
    reports/
      page.tsx                        ← Campaign Progress entry; ReportOption.href
      campaign-progress/              ← NEW (Phase 9)
        page.tsx
  components/
    campaigns/
      campaign-wizard.tsx             ← reorder + multi-agreement + new mutations
      campaign-settings.tsx           ← NEW (Phase 4)
      planner-wizard.tsx              ← attached_agreements display
      step-agreements.tsx             ← NEW (Phase 1)
      step-worker-estimate.tsx       ← NEW (Phase 1)
      step-campaign-units.tsx         ← NEW (Phase 2)
      step-allocate-workers.tsx       ← REWRITTEN (Phase 2)
      step-campaign-ambitions.tsx     ← NEW (Phase 3)
      add-workers-client.tsx          ← OU_TYPE_LABELS gained 'employer'
      planning/
        AmbitionPanel.tsx             ← REFACTORED (Phase 7)
        AmbitionCard.tsx              ← NEW (Phase 7)
        AmbitionStageSummary.tsx      ← NEW (Phase 7)
        WhereToPlayPanel.tsx          ← REWRITTEN (Phase 8)
        WhereToPlayLandingDialog.tsx  ← NEW (Phase 8)
        StageTimelineGantt.tsx        ← NEW (Phase 6)
        PlanRefinementDialog.tsx      ← NEW (Phase 6)
        CampaignRevisionHistory.tsx   ← NEW (Phase 6)
        CampaignStageDatesEditor.tsx  ← refinement-dialog wiring (Phase 6)
        P2WVerticalNav.tsx            ← NEW (Phase 5)
    layout/
      cross-app-banner.tsx            ← route-aware (Phase 5)
      header.tsx                      ← search bar removed; route-aware (Phase 5)
    reports/
      CampaignProgressReport.tsx      ← NEW (Phase 9)
  lib/hooks/
    useStagePlan.ts                   ← +useCampaignAmbitions, +linked_ambition_id, +parent_campaign_ambition_id
    useP2wStepOverrides.ts            ← REWRITTEN (Phase 5)
    usePlannerCampaigns.ts            ← +attached_agreements
  types/
    organising-row-types.ts           ← new types: CampaignAgreementRelationshipType,
                                        CampaignOuUnitBasis, CampaignAmbitionCategory,
                                        CampaignAmbitionRow, PlanRevisionType,
                                        PlanRevisionNoteRow
docs/
  campaigns-review-incidental-issues.md
  campaigns-review-development-report.md  ← THIS FILE
supabase/migrations/
  20260502100000_campaign_agreements.sql
  20260502110000_campaign_plan_timeframe.sql
  20260503100000_campaign_unit_extensions.sql
  20260504100000_campaign_ambitions.sql
  20260505100000_step_overrides.sql
  20260506100000_stage_overlap_constraint.sql
  20260506110000_plan_revision_notes.sql
  20260507100000_wtp_taxonomy_cleanup.sql
```

---

## Wizard step ordering — at end of Phase 9

For bargaining campaigns (8 steps total):

1. **Basics** — name, description, type (default `bargaining`), EA subtype,
   status, organiser, start date, plan timeframe (weeks/months/custom),
   campaign scope (with sector_wide help), notes.
2. **Employers & worksites** — uses scope to drive single/multi-select and
   filter ordering.
3. **Agreements** — multi-agreement attachment; one primary `replaced` per
   campaign.
4. **Worker estimate** — live count from selected scope + suggestion +
   variance feedback.
5. **Campaign units** — toggles + occupational pickers + custom; per-unit
   estimates with sum check.
6. **Allocate workers** — sortable/filterable table, bulk allocate to unit.
7. **Campaign ambitions** — four-category form; skippable.
8. **Plan handoff** — links to OA Planner with `?campaign_id=…`.

Non-bargaining campaigns end after step 7 (no plan handoff).

---

## Verification status at end of session

- `pnpm --filter organising-db exec tsc --noEmit` — clean for all phases.
- ESLint on every file touched in each phase — clean for new code.
- Pre-existing lint patterns unchanged: `as any` casts in
  `plan/page.tsx` and `plan/stage/[stageNumber]/page.tsx`,
  `set-state-in-effect` in `campaign-wizard.tsx` and
  `CampaignStageDatesEditor.tsx`, unused `_campaign_id` /
  `_stage_number` args in `useStagePlan.ts` /
  `useGateAssessment.ts`. All tracked in
  [`campaigns-review-incidental-issues.md`](./campaigns-review-incidental-issues.md).
- ESLint baseline pre-existing total at session start: 199 problems (101
  errors, 98 warnings). End of session: same count (no regressions
  introduced).

**Not yet verified end-to-end**: dev-server smoke test (env-locked machine)
and applying migrations to a real Supabase project. Both require user
environment.

---

## Common troubleshooting

### "Type error on `parent_campaign_ambition_id` / `linked_ambition_id` / `step_overrides`"

The columns exist in the migrations but `@oa/db-types` is generated from the
hosted Supabase project. Until the migration is applied + `pnpm gen:types`
is rerun, the generated types don't reflect the new columns. Several
components carry **optional-chained shims** that document this — for example
`AmbitionRow` in `AmbitionPanel.tsx` carries
`parent_campaign_ambition_id?: number | null` with a comment pointing to the
migration.

### "Stage save fails with check_violation"

The Phase 6 trigger
`enforce_stage_overlap_with_hard_gates` raised the exception. Check that
the gate between the stage you're saving and its neighbour is configured
as `enforcement_type='hard'` AND `is_active=true`. If you need to overlap,
flip the gate to soft first; the trigger only fires for hard active gates.

### "Trying to flip gate to hard fails with check_violation"

The companion trigger `check_gate_change_against_overlap` rejects the change
because the adjoining stages already overlap. Resolve the overlap (push the
later stage's start out) before locking the gate.

### "campaigns.replaced_agreement_id seems out of sync with my UI"

The Phase 1 trigger `sync_campaign_replaced_agreement` mirrors the legacy
column from the primary 'replaced' row in `campaign_agreements`. If you
INSERT/UPDATE/DELETE a `campaign_agreements` row, the legacy column is
updated. If you write directly to `campaigns.replaced_agreement_id`, the
junction table is **not** updated — write through `campaign_agreements`
instead.

### "Where-to-Play landing dialog won't auto-open"

It only auto-opens when `ambitions.length > 0 && whereToPlay.length === 0`.
Clicking the toolbar `Compass · Pursue an ambition` button always opens it.

### "P2W step override doesn't sync between browsers"

The hook `useP2wStepOverrides` writes to
`campaign_stage_plans.step_overrides` JSONB. If the value isn't appearing,
check that:

1. The Phase 5 migration `20260505100000_step_overrides.sql` has been
   applied (the column has a NOT NULL DEFAULT '{}' so the first row write
   should succeed in any case).
2. RLS isn't blocking the update (the column reuses the existing
   `campaign_stage_plans` policies).

### "Insights tab is empty / shows zeros"

The dashboard pulls from `campaign_ambition_progress` (Phase 3) and
`plan_revision_notes` (Phase 6). On environments without those migrations
applied, `useQuery` returns empty arrays (intentional graceful degrade) and
the cards render placeholder text. Confirm the migrations have been applied
to the project the app is connected to.

### "Tab selection doesn't survive a refresh"

Phase 5 added `?tab=` URL state on `/campaigns/[id]/page.tsx`. The
`validTabs` array is the source of truth — if you've added a tab, add it
there too or the URL state will fall back to `overview`.

---

## Cross-phase dependencies

```
Phase 1 ─► Phase 4 (settings page reuses wizard step components)
Phase 2 ─► Phase 4
Phase 3 ─► Phase 4
Phase 3 ─► Phase 7 (AmbitionCard "Connects to" picker)
Phase 3 ─► Phase 9 (campaign_ambition_progress view)
Phase 5 ─► Phase 9 (Insights tab uses ?tab= URL state)
Phase 6 ─► Phase 9 (CampaignRevisionHistory + StageTimelineGantt reused)
```

If a phase fails to apply, the dependents will degrade gracefully (return
empty arrays, hide UI sections) but functionality will be missing.

---

## Memory files written for future sessions

- `~/.claude/projects/.../memory/campaigns_review_plan.md` — 9-phase summary
  with per-phase deliverables, cross-references, and locked decisions.
- `~/.claude/projects/.../memory/MEMORY.md` — index pointer to the above.

Both files are **point-in-time**; verify against current code before acting
on cited behaviour.

---

## Suggested next moves (in priority order)

1. **Apply migrations + run `pnpm gen:types`.** Casts shrugged into Phase 1+
   components depend on the regenerated types to stop being `as unknown`.
2. **Smoke-test in dev**: each wizard step through to completion; settings
   page edits; manual-create flow; stage page vertical nav; hard-gate
   overlap rejection (toggle a gate to hard then try to overlap); WTP
   landing dialog; Insights tab.
3. **Walk through the [incidental-issues log](./campaigns-review-incidental-issues.md)** —
   none are blocking; consider a follow-up to remove the dead global search
   bar entirely (currently only hidden on stage routes) and to refactor the
   set-state-in-effect cluster in `campaign-wizard.tsx`.
4. **Backfill verification**: spot-check a real bargaining campaign before
   and after migration to confirm `campaign_agreements` got its row, the
   universe-section query still resolves, and the planner-wizard banner
   shows the right list.
