# OA Planner Integration — Responses

**Responding to:** `OA_PLANNER_QUESTIONS.md`
**From:** OAPlanning codebase agent
**Date:** 2026-03-30

Each answer is marked with one of:
- **CONFIRMED** — verified from OAPlanning source code, migrations, or generated types
- **SCHEMA GAP** — the question references tables or fields not present in OAPlanning's `src/types/database.ts`
- **USER DECISION** — requires a policy or product decision from the team
- **PARTIAL** — partially answerable from code; remainder needs a decision

---

## CRITICAL: Schema Discrepancy — Read This First

Before answering individual questions, a critical finding must be flagged.

Several questions reference Organising DB tables and fields that **do not exist** in OAPlanning's `src/types/database.ts`. This generated file reflects the full schema of the shared Supabase project as of its last regeneration. Missing tables means either:

1. The Organising DB has added these tables since OAPlanning last ran `supabase gen types typescript`, making OAPlanning's types **stale**, or
2. The tables are planned but not yet created in the database

Tables/fields referenced in the questions that are **absent from OAPlanning's schema**:

| Referenced in questions | What OAPlanning's schema actually has |
|------------------------|---------------------------------------|
| `campaign_worker_membership` | Does not exist. Nearest equivalent: `worker_agreements` (only columns: `agreement_id`, `worker_id`, `id`) |
| `campaign_activity_ratings` | Does not exist at all |
| `campaign_employers` | Does not exist. OAPlanning uses `agreement_employers` (agreement-scoped, not campaign-scoped) |
| `campaign_worksites` | Does not exist. OAPlanning uses `agreement_worksites` (agreement-scoped) |
| `oa_leader_role` | No such field anywhere in the schema |
| `total_worker_estimate` | No such field anywhere in the schema |
| `canWrite` | No such field anywhere in the schema (user_profiles has `role` and `work_role` only) |

**Action required before integration:** Regenerate OAPlanning's `src/types/database.ts` by running:
```bash
supabase gen types typescript --project-id [project-id] > src/types/database.ts
```
This will expose whether these tables now exist in the live database, and will let both agents work from the same schema understanding.

---

## 1. Deployment & URL

**Q1.1 — Production URL**

**PARTIAL.** The URL `oaplanner.uconstruct.app` appears in the questions document and is assumed correct, but cannot be confirmed from code alone — it is not hardcoded in the OAPlanning source or `.env.local` (the `NEXT_PUBLIC_APP_URL` variable exists but its value is in `.env.local` which is not committed). **User to confirm the production URL.**

**Q1.2 — Vercel deployment?**

**CONFIRMED (partially).** OAPlanning is deployed on Vercel — `vercel.json` exists at the repo root and configures a cron job. Whether it uses the same Vercel team/org as the Organising DB is unknown from the codebase. **User to confirm team/org alignment.** This matters for whether a shared Edge Middleware layer is feasible.

**Q1.3 — Staging/preview URL?**

**USER DECISION.** No staging URL is present in code. Vercel automatically generates preview URLs per branch (`*.vercel.app`). The team should decide on a stable staging URL and add it to the `.env.local` / Vercel environment variable configuration.

---

## 2. Campaign Ownership — Which App Creates the `campaigns` Row?

**Q2.1 — Definitive campaign creation location?**

**CONFIRMED — dual-write risk exists today.** OAPlanning's `useCreateCampaign()` mutation (`src/lib/hooks/useCampaigns.ts`) independently inserts into the `campaigns` table. It does not check for existing records. Both apps can create `campaigns` rows for the same bargaining campaign, producing duplicates. There is no deduplication mechanism of any kind.

**Q2.2 — Should the OAPlanner wizard require an existing campaign?**

**USER DECISION.** Currently the wizard is entirely standalone — it creates its own `campaigns` row with no requirement for a pre-existing record. This must be a product decision: the recommended approach to eliminate dual-write risk is to pass `?campaign_id=` from the Organising DB (see Q10), which would cause OAPlanning to skip the `campaigns` insert and only create the planning rows (`campaign_stage_plans`, `gate_definitions`, etc.) against the existing ID. However this is a meaningful behaviour change that requires team alignment.

**Q2.3 — Is `campaign_type = 'bargaining'` the integration trigger?**

**CONFIRMED (partially).** OAPlanning's wizard form collects `campaign_type` as a free-text/select field and passes it directly to the `campaigns` insert — there is no type-based gating logic in OAPlanning today. The value `'bargaining'` would be stored correctly if the wizard or a deep link supplies it. Whether the Organising DB should gate the "Open in OAPlanner" CTA on `campaign_type === 'bargaining'` is a **USER DECISION** — organising and mobilisation campaigns don't have a planning workflow in OAPlanning currently, but nothing technically prevents it.

---

## 3. Agreement Linking

**Q3.1 — One agreement per campaign? Greenfield support?**

**CONFIRMED.** `campaign_timelines.agreement_id` is explicitly nullable in the migration (`agreement_id INTEGER REFERENCES agreements(agreement_id)` with no `NOT NULL`). The wizard handles the no-agreement case — if neither `agreement_id` nor `expiry_date` is provided, no `campaign_timelines` row is created. Greenfield campaigns are fully supported.

**Q3.2 — Consistency between agreement-linked and campaign-linked employers/worksites?**

**SCHEMA GAP.** OAPlanning has no visibility of `campaign_employers` or `campaign_worksites` tables — they do not exist in its schema. OAPlanning can only reach employers and worksites via the path:
```
campaign_timelines.agreement_id
  → agreements.agreement_id
  → agreement_employers → employers
  → agreement_worksites → worksites
```
If the Organising DB directly links campaigns to employers or worksites outside of the agreement structure, OAPlanning will not see those entities. This is a real gap: for greenfield campaigns with no agreement, OAPlanning has no employer or worksite context at all. This feeds directly into the known bug documented in `PLATFORM_CONTEXT.md` section 9 where `campaign_context.employer_name` is incorrectly set.

**Q3.3 — Should the Organising DB wizard collect `agreement_id` in step 1 for bargaining campaigns?**

**USER DECISION.** Architecturally, the cleanest flow is: Organising DB creates campaign → user selects agreement → system deep-links to OAPlanning with both `campaign_id` and `agreement_id` pre-filled. Whether this is collected in step 1 of the wizard or a subsequent step is a product design decision for the Organising DB team.

---

## 4. Authentication & Session Sharing

**Q4.1 — Has cross-origin session sharing been tested?**

**CONFIRMED — not tested.** Both apps use the same Supabase URL and anon key (verified in source). However, cross-subdomain session sharing via `@supabase/ssr` cookies has not been explicitly tested or configured in OAPlanning. By default, Supabase SSR sets cookies to the exact domain of the server rendering the page — not the parent domain. Without explicit cookie domain configuration, navigating from `uconstruct.app` to `oaplanner.uconstruct.app` will result in the session cookie not being sent and the user being prompted to log in again.

**Q4.2 — Are both apps on the same parent domain (`*.uconstruct.app`)?**

**USER DECISION / CONFIRM.** If yes, cookie sharing can be enabled by setting `cookieOptions: { domain: '.uconstruct.app' }` in both apps' Supabase client configuration. This change would need to be made in OAPlanning's `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`. **User must confirm both apps share the `uconstruct.app` parent domain.** If they are on separate top-level domains, a token-passing approach is required.

**Q4.3 — OAuth PKCE or shared-cookie approach?**

**USER DECISION.** If the shared-cookie approach works (confirmed same parent domain), it is simpler and should be used. OAuth PKCE adds complexity and is only needed for different top-level domains.

---

## 5. RLS & Access Control

**Q5.1 — The `is_assigned_to_campaign()` oversharing bug: fix before go-live?**

**CONFIRMED — bug exists, fix recommended before go-live.** The bug is documented in `PLATFORM_CONTEXT.md` section 9. The current SQL:
```sql
JOIN agreements a ON a.agreement_id = ao.agreement_id
```
does not constrain `a.agreement_id` to the campaign's linked agreement. Any organiser assigned to any agreement in the system may pass the check for any campaign. This is a meaningful security issue that becomes more visible when the Organising DB starts reading OAPlanning data via the shared connection. **Recommend fixing before integration goes live.** The fix is to add:
```sql
AND a.agreement_id = (
  SELECT ct.agreement_id FROM campaign_timelines ct
  WHERE ct.campaign_id = p_campaign_id
)
```
Note: this fix would make the function return `false` for campaigns with no `campaign_timelines` row (greenfield), so the `OR c.organiser_id = up.organiser_id` branch must also be retained.

**Q5.2 — Should Organising DB campaign assignment automatically grant OAPlanning access?**

**USER DECISION.** The cleanest answer depends on Q2.2: if OAPlanning always links to an Organising DB campaign via `campaign_id`, then organising DB campaign assignment (however it is stored) should logically grant read access to planning data. The current `is_assigned_to_campaign()` function uses `agreement_organisers` as its proxy — this will need updating once `campaign_worker_membership` or equivalent is clarified.

**Q5.3 — Role model reconciliation (`canWrite` vs `work_role`)?**

**SCHEMA GAP.** `canWrite` does not exist in OAPlanning's `database.ts`. OAPlanning's `user_profiles` has: `role` (string — `'admin'` used), `work_role` (string | null — `'lead_organiser'` used). The Organising DB appears to use a different role model with `canWrite`. Until `database.ts` is regenerated, the Organising DB's full role structure is not visible to OAPlanning. **This reconciliation cannot be completed until the schema types are refreshed.** Once regenerated, a mapping document can be produced.

---

## 6. WOC (Workplace Organising Committee) Data

**Q6.1 — How is WOC membership tracked?**

**SCHEMA GAP — blocker.** `campaign_worker_membership` does not exist in OAPlanning's schema. The only worker-to-agreement linkage visible to OAPlanning is `worker_agreements`, which has three columns only: `id`, `agreement_id`, `worker_id` — no role, no WOC flag, no leadership designation of any kind. OAPlanning currently has no way to compute WOC establishment or coverage from the database. **This is a blocker for gate criteria auto-population.** The team must clarify:
- Does `campaign_worker_membership` now exist in the live database (post-OAPlanning type regeneration)?
- If not, is WOC tracked another way?

**Q6.2 — Is `oa_leader_role` the intended WOC representation?**

**SCHEMA GAP.** `oa_leader_role` does not exist anywhere in OAPlanning's `database.ts`. If this field exists on `campaign_worker_membership` in the live DB, it will appear after type regeneration. Once confirmed, OAPlanning can define gate criteria thresholds accordingly. A suggested mapping would be: "WOC established" = at least one worker with `oa_leader_role = 'delegate'` per key worksite.

**Q6.3 — Existing views or functions for engagement density?**

**SCHEMA GAP.** No views computing WOC coverage or engagement density are visible to OAPlanning. The views OAPlanning can see are: `agreements_view`, `campaigns_view`, `employers_view`, `organising_universe_view`, `workers_view`, `worksites_view`, `worksite_employer_eba_status`, `principal_employer_eba_summary`. None appear purpose-built for gate metric computation. After type regeneration, a fresh view list should be checked. If such views exist in the Organising DB, OAPlanning can query them directly.

---

## 7. Gate Criteria Auto-Population

**Q7.1 — Which criteria can be auto-populated?**

**SCHEMA GAP (most rows) / PARTIAL (some rows).** Assessment of each proposed criterion against OAPlanning's current schema:

| Gate | Criterion | Proposed source | Status |
|------|-----------|-----------------|--------|
| Gate 1 | Contact details verified | `workers` where phone + email not null | **PARTIAL** — `workers` table exists; phone/email columns need confirmation after type regen |
| Gate 1 | Member engagement threshold | `campaign_activity_ratings` | **SCHEMA GAP** — table does not exist in OAPlanning's schema |
| Gate 2 | WOC established | `campaign_worker_membership` where `oa_leader_role = 'delegate'` | **SCHEMA GAP** — table and field do not exist |
| Gate 3 | Membership density | `campaign_worker_membership` count / `total_worker_estimate` | **SCHEMA GAP** — both the table and `total_worker_estimate` field are missing. `worker_agreements` count / some denominator could work but there is no worker estimate field |
| Gate 3 | Log of Claims survey | External survey tool | **CONFIRMED absent** — no survey data in the database; manual entry only |

After `database.ts` is regenerated, this table should be revisited. OAPlanning's gate criteria `current_value` field is a free text `VARCHAR` — any computed value from the Organising DB can be written there without schema changes.

**Q7.2 — Real-time vs scheduled auto-population?**

**USER DECISION.** From OAPlanning's architecture perspective: real-time (live query on gate page load) is straightforward using the existing TanStack Query pattern — add an additional query in `useGateAssessment` that pulls live values. A scheduled approach writing to `gate_criteria.current_value` is more reliable for snapshots and reports but adds cron complexity. **Recommendation:** real-time for the gate assessment page; the weekly cron snapshot (`/api/snapshots`) can capture the live values at snapshot time. User to decide.

---

## 8. Navigation & UX Design

**Q8.1 — What should cross-app navigation look like?**

**USER DECISION.** From OAPlanning's implementation perspective:
- Option A (sidebar link) is the lowest-effort change — one line in `src/components/layout/AppShell.tsx`
- Option B (top banner tab switcher) is moderate effort — a shared component added above the existing layout in `src/app/(app)/layout.tsx`
- Option C (shared npm package) requires monorepo/package infrastructure that does not exist today

Recommendation: start with Option B implemented independently in both apps (copy-paste, not a shared package) and extract to a package if/when a third app joins the ecosystem.

**Q8.2 — Landing page when navigating from Organising DB to OAPlanner?**

**USER DECISION.** OAPlanning can support both patterns depending on whether `campaign_id` is passed in the URL:
- With `?campaign_id=X` → land on `/campaigns/X` (the campaign detail page)
- Without `campaign_id` → land on `/dashboard` or `/campaigns/new`

The Organising DB deep link should always include `campaign_id` once the campaign exists in OAPlanning. **Recommended:** always pass `campaign_id` so the user lands in context.

**Q8.3 — "View in Organising DB" link back from OAPlanning?**

**USER DECISION.** OAPlanning can add this link to the campaign detail page (`src/app/(app)/campaigns/[id]/page.tsx`). It requires knowing the Organising DB's production URL — store it in an environment variable (`NEXT_PUBLIC_ORGANISING_DB_URL`) and construct the link as `${NEXT_PUBLIC_ORGANISING_DB_URL}/campaigns/${campaign_id}`. **User to provide the Organising DB URL and confirm URL structure.**

---

## 9. Agreement Expiry Warning

**Q9.1 — Where should the warning appear?**

**USER DECISION.** OAPlanning already implements expiry-based urgency on the dashboard (PABO countdown badges, red/amber/green expiry indicators on campaign cards). The Organising DB equivalent would mirror this pattern. From OAPlanning's data: the query `campaigns LEFT JOIN campaign_timelines WHERE agreement_expiry_date < NOW() + INTERVAL '12 months' AND campaigns.campaign_id NOT IN (SELECT campaign_id FROM campaign_stage_plans)` would identify agreements with approaching expiry and no planning data. The Organising DB can run this query against the shared database directly.

**Q9.2 — 12-month threshold appropriate?**

**USER DECISION.** The 12-month primary / 6-month urgency escalation is a reasonable default. OAPlanning's dashboard uses 6 months (red) and 12 months (amber) as its own thresholds. Aligning both apps to the same thresholds is recommended.

**Q9.3 — Dismissible warnings?**

**USER DECISION.** OAPlanning does not implement any dismissible warning pattern. If dismissal is required, it would need a new database mechanism (a `dismissed_warnings` table or a JSONB field on `user_profiles`). If implemented in the Organising DB, OAPlanning could optionally read the same table. **Suggest deferring this until there is confirmed user demand.**

---

## 10. OAPlanner Wizard — Pre-fill Parameters

**Q10.1 — What query parameters does the wizard currently accept?**

**CONFIRMED — none.** OAPlanning's campaign creation wizard (`src/app/(app)/campaigns/new/page.tsx` → `CampaignCreationWizard`) reads no query parameters today. The component receives no props from the page that would carry URL parameters. All four proposed parameters need to be implemented on the OAPlanning side:

| Parameter | Purpose | Implementation needed |
|-----------|---------|----------------------|
| `?campaign_id=` | Link to existing Organising DB campaign | Yes — page must read `searchParams`, pass to wizard; wizard must skip `campaigns` insert |
| `?agreement_id=` | Pre-fill agreement picker | Yes — pre-select agreement in wizard step |
| `?expiry_date=` | Pre-fill expiry date | Yes — pre-populate date field |
| `?organiser_id=` | Pre-fill lead organiser | Yes — pre-select organiser in wizard step |

**Q10.2 — If `?campaign_id=` is passed, skip `campaigns` insert?**

**CONFIRMED — yes, this is the correct behaviour and it must be explicitly implemented.** Currently `useCreateCampaign()` always inserts a new `campaigns` row as its first step. The mutation needs a new code path: if `campaign_id` is provided, skip the insert and use the supplied ID for all subsequent inserts (`campaign_stage_plans`, `gate_definitions`, etc.). A guard should also check that the supplied `campaign_id` exists and has no existing `campaign_stage_plans` (to prevent duplicate initialisation).

---

## 11. Data Consistency & Dual-Write Risk

**Q11.1 — Risk of duplicate campaign records?**

**CONFIRMED — risk is real and unmitigated today.** Both apps insert into `campaigns`. There is no unique constraint, no deduplication check, and no linking mechanism between a campaign created in the Organising DB and one created in OAPlanning. If a user creates a campaign in each app for the same bargaining campaign, they will have two separate `campaigns` rows with different `campaign_id` values and no relationship between them.

**Q11.2 — Should OAPlanning be modified to only accept `campaign_id` as input?**

**USER DECISION — with a strong recommendation.** The recommended approach is:
1. Short term: implement `?campaign_id=` support in the wizard (Q10.2 above) so the Organising DB can link directly
2. Medium term: consider removing the standalone wizard or gating it behind an admin flag, making OAPlanning campaigns always linked to an Organising DB campaign
3. Long term: if apps merge, this problem disappears

**Q11.3 — Are there existing campaigns with OAPlanning data (consistent IDs)?**

**USER DECISION / CONFIRM.** This cannot be determined from code alone — it requires checking the live database. The team should run:
```sql
SELECT c.campaign_id, c.name, COUNT(csp.plan_id) as plan_count
FROM campaigns c
LEFT JOIN campaign_stage_plans csp ON csp.campaign_id = c.campaign_id
GROUP BY c.campaign_id, c.name
ORDER BY plan_count DESC;
```
This will show which campaigns already have OAPlanning data and whether those IDs are consistent with Organising DB expectations.

---

## 12. Reporting & Snapshots

**Q12.1 — Should the Organising DB surface `reporting_snapshots` data?**

**USER DECISION.** The `reporting_snapshots` table is accessible to any authenticated user with appropriate RLS permissions (admin or lead organiser). The Organising DB can query it directly. The snapshot `data` column is a JSONB blob — the Organising DB agent would need the schema of that blob to parse it. The blob is built in `src/app/api/snapshots/route.ts` and contains: `campaign_id`, `campaign_name`, `status`, `current_stage`, `stages_completed`, `gates_passed`, `agreement_expiry_date`, `pabo_available_date`, and full `stage_plans` and `gates` arrays. This structure is stable and queryable.

**Q12.2 — Unified cross-app report?**

**USER DECISION.** Technically feasible since both apps share the database. A combined view or report page would query:
- Organising DB metrics: member density, action results, worker counts
- OAPlanning metrics: stage progress, gate pass rates from `reporting_snapshots` or live tables

Recommend deciding the primary home for such a report (one app or a dedicated `/reports` route) before building.

---

## 13. Long-Term Architecture

**Q13.1 — Intention to merge into a single Next.js app?**

**USER DECISION.** From OAPlanning's technical perspective, a merge is achievable. OAPlanning uses Next.js 14 App Router — the Organising DB would need to be on a compatible version. The main merge tasks would be: combine `src/app/` route trees, merge `database.ts` type generation (already shared), unify `AppShell` navigation, and consolidate `package.json`. The stale `database.ts` problem (the root cause of the schema gaps in this document) would be permanently solved by a merged app. **The schema drift already argues in favour of a monorepo or merge.** User to set timeline.

**Q13.2 — Shared `@offshore-alliance/ui` npm package?**

**USER DECISION.** If remaining as separate apps, a shared UI package is worthwhile for: the cross-app nav banner, any shared badge/indicator components, and the `database.ts` type file (published as `@offshore-alliance/db-types`). Publishing `database.ts` as a shared package would solve the type drift problem without a full merge. **Recommended if staying as two apps beyond 6 months.**

**Q13.3 — N-app scalability?**

**USER DECISION.** If more apps join the ecosystem, the shared-cookie + shared-Supabase pattern scales well, but the type drift problem gets worse with each app. A monorepo with a single `packages/db-types` package generated by a shared CI step (not per-app) is the robust solution for N > 2 apps.

---

## Summary: Immediate Action Items

Before any integration work begins, these items should be resolved:

| Priority | Item | Who |
|---------|------|-----|
| **P0** | Regenerate `src/types/database.ts` in OAPlanning to get the current live schema | OAPlanning agent |
| **P0** | Confirm whether `campaign_worker_membership`, `oa_leader_role`, `total_worker_estimate`, `canWrite` exist in the live DB after regen | Both agents |
| **P0** | Confirm production URLs for both apps and parent domain (`*.uconstruct.app`?) | User |
| **P1** | Decide: will OAPlanning support `?campaign_id=` deep link and skip campaigns insert? | User |
| **P1** | Fix `is_assigned_to_campaign()` RLS bug before go-live | OAPlanning agent |
| **P1** | Fix cron snapshot route to use `createServiceClient()` | OAPlanning agent |
| **P1** | Configure Supabase cookie domain for cross-subdomain session sharing | Both agents |
| **P2** | Implement wizard query parameter support (`agreement_id`, `expiry_date`, `organiser_id`, `campaign_id`) | OAPlanning agent |
| **P2** | Add `NEXT_PUBLIC_ORGANISING_DB_URL` env var and "View in Organising DB" link | OAPlanning agent |
| **P2** | Decide navigation UX pattern (Option A/B/C) | User |
| **P3** | Decide on unified reporting, expiry warnings, and long-term architecture | User |

---

*Document created: 2026-03-30. Please add team decisions inline and return this file for the next round of implementation planning.*
