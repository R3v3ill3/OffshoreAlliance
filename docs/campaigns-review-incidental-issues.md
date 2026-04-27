# Campaigns review — incidental issues log

This file collects issues found *while* implementing the 9-phase campaigns
review (`/Users/troyb/.claude/plans/i-d-like-to-review-quizzical-gem.md`)
that are **not** in scope for that plan but are worth fixing later. Each entry
has enough context to act on cold — file path, what's wrong, why it matters,
and a sketch of the fix.

Last updated: started 2026-04-27 (Phase 3).

## Open

### 1. `header.tsx` global search bar is purely decorative

- **Where:** `apps/organising-db/src/components/layout/header.tsx`, lines 37–44
- **Symptom:** The search `<Input>` in the global header has no `onChange`,
  no `onSubmit`, no query state. Typing in it does nothing. Renders on every
  dashboard page (campaigns, workers, employers, plan stages, etc.).
- **Why it matters:** Users on stage planning pages especially have already
  flagged that the chrome stack is too heavy; a non-functional search bar
  takes pixels and creates wasted-click friction.
- **Suggested fix:** Either delete it (Phase 5 of the campaigns plan will
  remove it from stage pages, but a global removal is cleaner) or wire it
  to a global command-palette / cross-entity search.

### 2. `react-hooks/set-state-in-effect` violations in `campaign-wizard.tsx`

- **Where:**
  - `apps/organising-db/src/components/campaigns/campaign-wizard.tsx:129`
    (`setBasicsHydrated(!editMode)` inside the basics-hydrated reset effect)
  - `apps/organising-db/src/components/campaigns/campaign-wizard.tsx:330`
    (multiple `setSelectedX(wizardScope.x)` calls inside the wizard-scope
    hydration effect)
- **Symptom:** ESLint flags both as anti-patterns ("calling setState
  synchronously within an effect can trigger cascading renders").
- **Why it matters:** Pre-existing pattern, not regressed by the campaigns
  plan, but worth refactoring — this file is one of the largest and slowest
  components in the app and the cascading renders compound.
- **Suggested fix:** Move the hydration into a `useSyncExternalStore` or
  `useDeferredValue` pattern, or shift the state into `useReducer` initialised
  from server data.

### 3. `react/no-unescaped-entities` errors in `campaign-wizard.tsx`

- **Where:** `apps/organising-db/src/components/campaigns/campaign-wizard.tsx:1126`
  (`"Playing to Win"` text in the Step 7 plan-handoff card)
- **Symptom:** Unescaped quotes around `"Playing to Win"`.
- **Why it matters:** Pre-existing, not regressed. Fixed inline if you ever
  rewrite the plan handoff card; otherwise low priority.
- **Suggested fix:** Replace `"` with `&quot;` or use a single-quote synonym.

### 4. `Unexpected any` errors across lib + planning UI

- **Where (lib utilities):**
  - `apps/organising-db/src/lib/api/an-tag-sync.ts` — lines 27, 28, 39, 94
  - `apps/organising-db/src/lib/api/fetch-workload-dashboard.ts` — line 3
  - `apps/organising-db/src/lib/pagination-utils.ts` — lines 55, 63
  - `apps/organising-db/src/lib/rate-limit-middleware.ts` — line 72
- **Where (planning UI):**
  - `apps/organising-db/src/app/(dashboard)/campaigns/[id]/plan/stage/[stageNumber]/page.tsx`
    — multiple `(campaign as any)` and `(stagePlanData?.X || []) as any`
    casts on every panel render.
  - `apps/organising-db/src/app/(dashboard)/campaigns/[id]/plan/page.tsx`
    — same shape: `(campaign as any).campaign_timelines`,
    `(campaign as any).campaign_stage_plans`, `gatesForTimeline as any`.
    Both files cast the campaign row because the planner-side query
    embeds `campaign_timelines` / `campaign_stage_plans` / `organisers`
    relations the generated `Campaign` type doesn't capture.
- **Symptom:** Several internal helpers and the stage page leak `any`
  types. ESLint rule `@typescript-eslint/no-explicit-any`.
- **Why it matters:** Unrelated to campaigns work but accumulates risk —
  `as any` on the panel prop bridges hides the cost of mismatched row
  shapes (e.g. when activity_ambitions or rating_phase rolls forward).
- **Suggested fix:** One file at a time. For the stage page specifically:
  align the panel prop types with what `useStagePlan` actually returns
  (drop the cast); for the lib utilities, replace `any` with `unknown`
  plus narrowing, or import the table row type from `@oa/db-types`.

### 5. Unused `_campaign_id` / `_stage_number` arguments in planning hooks

- **Where:**
  - `apps/organising-db/src/lib/hooks/useGateAssessment.ts` — lines 180, 230
  - `apps/organising-db/src/lib/hooks/useStagePlan.ts` — lines 277, 340, 401,
    430, 480, 511, 540, 574
- **Symptom:** Many destructured args prefixed `_` are still flagged as
  unused. Suggests either the hooks were stubbed for a TODO that was lost,
  or the lint config isn't allowing `_`-prefix as the convention says.
- **Why it matters:** Indicates either dead arguments (sloppy) or
  not-fully-implemented hooks that may surprise future readers.
- **Suggested fix:** Audit each — if the args are genuinely unused, remove
  them from the function signature; if they were stubbed for future use,
  follow up.

### 6. Dead constant `KNOWN_ACRONYMS` in `cluster-utils.ts`

- **Where:** `apps/organising-db/src/lib/utils/cluster-utils.ts:24`
- **Symptom:** `'KNOWN_ACRONYMS' is assigned a value but never used`.
- **Why it matters:** Dead code. Likely meant to be used by a later
  similarity check that never landed.
- **Suggested fix:** Either wire it into the cluster scoring, or delete it.

### 7. Database type generation requires deploy-then-regen cycle

- **Where:** `package.json` script `gen:types` shells out to
  `supabase gen types typescript --project-id gteygwfgjvczanmrwgbr`.
- **Symptom:** Local dev that adds a new column / table cannot get matching
  TypeScript types until the migration is applied to the hosted project.
  Forces every developer to either cast through `unknown` (as we did in
  Phase 1 + 2) or push migrations to share branches before they're verified.
- **Why it matters:** Slows feedback loop; encourages `as unknown` casts
  that hide errors.
- **Suggested fix:** Add a parallel `gen:types:local` that points at a
  local Supabase via `supabase start` + `supabase db reset`, so types can
  be regenerated against unapplied migrations.

## Resolved

(none yet)
