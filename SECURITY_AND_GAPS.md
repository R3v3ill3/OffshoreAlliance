# Offshore Alliance Platform — Security, Gaps & Failure Points

> **Last Updated:** 2026-04-02
> **Purpose:** This document identifies security vulnerabilities, unfinished functionality, missing features, and potential failure points across the Offshore Alliance Platform (Organising DB + OA Planner).

---

## Table of Contents

1. [Security Vulnerabilities](#security-vulnerabilities)
2. [Unfinished / Missing Functionality](#unfinished--missing-functionality)
3. [Data Quality Issues](#data-quality-issues)
4. [Integration Gaps](#integration-gaps)
5. [Performance & Scalability Concerns](#performance--scalability-concerns)
6. [Failure Points](#failure-points)
7. [Known Bugs](#known-bugs)

---

## Security Vulnerabilities

### Critical Severity

#### 1. RLS Policy Oversharing in OA Planner
**Location:** `is_assigned_to_campaign()` RLS function

**Issue:** The join between `campaigns` and `agreements` is not constrained. An organiser assigned to **any** agreement in the system may pass this check for **any** campaign.

**Current Implementation:**
```sql
SELECT 1 FROM user_profiles up
JOIN agreement_organisers ao ON ao.organiser_id = up.organiser_id
JOIN campaigns c ON c.campaign_id = p_campaign_id
JOIN agreements a ON a.agreement_id = ao.agreement_id
WHERE up.user_id = auth.uid()
```

**Risk:** Organisers may access planning data for campaigns they should not see.

**Mitigation Required:** Add constraint `AND a.agreement_id = (SELECT agreement_id FROM campaign_timelines WHERE campaign_id = p_campaign_id)` or equivalent.

---

#### 2. Cron Snapshot Route Uses Anon Client
**Location:** `apps/oa-planner/src/app/api/snapshots/route.ts` (GET handler)

**Issue:** The Vercel cron job calls `/api/snapshots` with no user session. The route uses the anonymous Supabase client, which means RLS is evaluated with `auth.uid() = null`. This fails for campaigns requiring authenticated access.

**Risk:** Weekly snapshots fail to generate; reporting data incomplete.

**Mitigation Required:** Use `createServiceClient()` (service role) for the cron GET handler to bypass RLS.

---

#### 3. Service Role Key Exposure Risk
**Location:** Both applications

**Issue:** `SUPABASE_SERVICE_ROLE_KEY` must be present in server environment for admin operations. If leaked, it grants full database access bypassing all RLS.

**Risk:** Complete database compromise if key is exposed.

**Mitigation Required:**
- Ensure service role key is never used in client-side code
- Rotate keys immediately if suspected exposure
- Consider using Vercel Environment Variables for restricted access

---

### Medium Severity

#### 4. No Rate Limiting on API Routes
**Location:** All API routes in both applications

**Issue:** No rate limiting implemented on API endpoints including:
- `/api/import` (file upload)
- `/api/action-network` (email sending)
- `/api/yabbr` (SMS sending)
- `/api/employer-wizard/analyse` (AI API calls)
- `/api/theory-of-winning` (AI API calls)

**Risk:** API abuse, unexpected costs from external services (Action Network, Yabbr, Anthropic), DoS attacks.

**Mitigation Required:** Implement rate limiting (e.g., `express-rate-limit` or Vercel edge middleware).

---

#### 5. AI Prompt Injection Risk
**Location:** `POST /api/theory-of-winning`, `POST /api/employer-wizard/analyse`

**Issue:** User-controlled data (employer names, worksite names, ambitions) is passed directly to AI prompts without sanitization. Malicious input could attempt prompt injection.

**Risk:** AI model output manipulated, unexpected behavior, potential data leakage through AI responses.

**Mitigation Required:** Sanitize and validate all user input before passing to AI; use structured prompts with clear delimiters.

---

#### 6. Unvalidated File Upload
**Location:** `/api/import` (Organising DB)

**Issue:** File upload accepts XLSX and PDF files without strict validation of file contents, size limits, or structure.

**Risk:** Memory exhaustion from large files, potential parsing exploits, malformed data injection.

**Mitigation Required:** Add file size limits, content-type validation, and structured parsing with error handling.

---

## Unfinished / Missing Functionality

### Data Structure Gaps

#### 1. Projects Table Underutilized
**Status:** Structurally present but relationally under-linked

**Issue:**
- `projects` has 16 rows (all active)
- `project_employers` is **empty** (0 rows)
- `project_agreements` is **empty** (0 rows)
- `workers.project_id` is **null** for all workers

**Impact:** Project cards appear empty/unhelpful; project-level reporting incomplete; no worker-to-project linkage.

**Required Work:**
- Backfill `project_employers` for all in-scope projects
- Backfill `project_agreements` for all in-scope projects
- Decide whether `workers.project_id` should be maintained
- If yes, update workflow and backfill data

---

#### 2. No Worksite Hierarchy Data
**Status:** Schema exists but no data

**Issue:** `worksites.parent_worksite_id` is null for all 39 worksites.

**Impact:** Parent/child worksite model exists but has no populated relationships; hierarchical reporting not functional.

**Required Work:**
- Confirm whether worksite hierarchy is intended
- If yes, populate `parent_worksite_id` where applicable
- Update UI to display hierarchical relationships

---

### Feature Gaps

#### 3. No Deep Links Between Applications
**Status:** Not implemented

**Issue:** There are no links from OA Planner to Organising DB pages (agreement detail, employer profile, worksite profile) or vice versa.

**Impact:** Organisers must switch manually between apps with no contextual continuity; disjointed user experience.

**Required Work:**
- Add "Create Campaign Plan" button on agreement detail pages in Organising DB
- Add contextual links from OA Planner campaign detail to Organising DB entities
- Consider shared navigation shell

---

#### 4. Gate Criteria Current Values Manual Only
**Status:** No live data connection

**Issue:** Gate criteria `current_value` and `is_met` fields are manually updated via forms. No live connection to organising DB tables (e.g., `worker_agreements` for membership density, `workers` for contact counts).

**Impact:** Gate assessments based on stale or incorrect data; extra manual work for organisers.

**Required Work:**
- Implement API route or Supabase function to auto-populate `gate_criteria.current_value`
- Map gate criteria to database queries:
  - Membership Density → `worker_agreements` count
  - Contact Details Verified → `workers` with non-null phone + email
  - Active WOCs → (depends on WOC data storage)

---

#### 5. Employer/Worksite Data Not Shown in Campaign Creation
**Status:** UI incomplete

**Issue:** When an organiser selects an `agreement_id` in the OA Planner campaign creation wizard, no employer or worksite information is shown.

**Impact:** Reduced data entry accuracy; organisers must cross-reference manually.

**Required Work:**
- Pull employer/worksite data from `agreements_view` or organising DB tables
- Display preview in wizard UI

---

#### 6. No Campaign Planning Status in Organising DB
**Status:** Not implemented

**Issue:** Agreement cards/pages in Organising DB show no indication of whether a campaign plan exists or what stage it's at.

**Impact:** Organisers must check OA Planner separately; missed opportunities for proactive campaign planning.

**Required Work:**
- Query `campaigns` + `campaign_stage_plans` on agreement pages
- Display status badge (No campaign plan / Stage X: [Name] / Campaign complete)

---

### Missing Core Features

#### 7. No Organiser Workload Dashboard
**Status:** Not implemented

**Issue:** No unified view showing an organiser's:
- Campaigns they are the lead organiser for
- Campaigns they are assigned to (via `agreement_organisers`)
- Capacity items assigned to them (`plan_capacities.assigned_to`)
- Management systems they're responsible for (`plan_management_systems.responsible_organiser_id`)

**Impact:** Difficult to assess organiser capacity and allocate work effectively.

**Required Work:**
- Create unified organiser workload view (could be in either app)

---

#### 8. Agreement Expiry-Driven Campaign Auto-Creation Not Implemented
**Status:** Not implemented

**Issue:** No warnings on agreements expiring within N months that have no active campaign plan. No prompts to create campaigns.

**Impact:** Missed planning windows; reactive rather than proactive campaign planning.

**Required Work:**
- Add warning/reminder system on agreement pages
- Create "Create Campaign from Agreement" shortcut

---

## Data Quality Issues

### Identified Inconsistencies

#### 1. User-Observed Groups Count vs Database Snapshot
**Issue:** UI shows 4 employer groups; database query yields 5 parent groups (Chevron, JADESTONE ENERGY, WOODSIDE ENERGY LTD, Santos, Shell).

**Possible Causes:**
- Environment mismatch (dev vs prod)
- Cached data
- Active filters in UI

**Verification Query:**
```sql
with parent_ids as (
  select distinct parent_employer_id as parent_id
  from public.employers
  where parent_employer_id is not null
)
select count(*) as employer_group_count
from parent_ids;
```

---

#### 2. Principal Employer Context Missing from AI Prompts
**Location:** `apps/oa-planner/src/app/(app)/campaigns/[id]/stage/[stageNumber]/page.tsx`

**Issues:**
1. `campaign_context.employer_name` uses the lead organiser's name, not the employer
2. `campaign_context.worksite_names` is passed as empty array `[]`

**Correct Joins Required:**
- Employer: `campaign_timelines.agreement_id → agreements.agreement_id → agreement_employers → employers`
- Worksites: `campaign_timelines.agreement_id → agreements.agreement_id → agreement_worksites → worksites`

**Impact:** AI-generated Theory of Winning statements are less accurate; missing context reduces quality of strategic planning.

---

## Integration Gaps

### Cross-Application Issues

#### 1. Dual Employer-Employer Connection Methods
**Issue:** Two ways to connect employers to operational footprint:
- Via `project_employers` (currently unused)
- Via `employer_worksite_roles` (populated)

**Impact:** Confusion over which method to use; inconsistent data model.

**Recommendation:** Decide on single source of truth; deprecate or populate the other.

---

#### 2. Principal Employer in Multiple Contexts
**Issue:** `worksites.principal_employer_id` and `programs.principal_employer_id` both point into `employers` table.

**Impact:** Valid but semantically distinct (site principal vs program principal). Risk of confusion in queries and reporting.

**Recommendation:** Document semantics clearly; ensure queries use correct field for intended purpose.

---

#### 3. No Unified Organiser Assignment View
**Issue:** Organiser assignments exist in multiple places:
- `campaigns.organiser_id` (lead organiser)
- `agreement_organisers` (agreement assignments)
- `employer_worksite_roles` (worksite roles)
- `plan_capacities.assigned_to` (capacity assignments)
- `plan_management_systems.responsible_organiser_id` (management systems)

**Impact:** No single view of an organiser's total responsibilities; difficult to assess workload.

---

## Performance & Scalability Concerns

#### 1. No Pagination on Large Data Sets
**Location:** Multiple listing pages across both apps

**Issue:** Queries may return up to 1000 rows (Supabase default) without pagination. Large tables (workers, communications_log) will exceed this.

**Impact:** Slow page loads; incomplete data display; potential errors.

**Required Work:** Implement pagination or infinite scroll on all list views.

---

#### 2. No Database Indexes Documented
**Issue:** No clear documentation of which indexes exist on frequently queried columns (e.g., `workers.engagement_level`, `agreements.expiry_date`, `campaigns.status`).

**Impact:** Slow queries as data grows; degraded performance.

**Required Work:** Audit and document indexes; add indexes for common query patterns.

---

#### 3. AI Token Limits for Large Datasets
**Location:** `POST /api/employer-wizard/analyse`

**Issue:** If employer list is very large (>200), single AI call may exceed token limits.

**Impact:** Analysis fails or returns incomplete results.

**Required Work:** Implement batching for large datasets.

---

## Failure Points

### Single Points of Failure

#### 1. Supabase Service Dependency
**Issue:** Both applications depend entirely on Supabase for:
- Authentication
- Database
- Real-time subscriptions (if used)

**Impact:** Supabase outage = complete system unavailable.

**Mitigation:**
- Monitor Supabase status
- Consider backup/authentication fallback
- Document disaster recovery procedures

---

#### 2. External API Dependencies
**Dependencies:**
- Action Network API (emails)
- Yabbr.io API (SMS)
- Anthropic Claude API (Theory of Winning)
- Nominatim (geocoding)

**Failure Modes:**
- API downtime → features unavailable
- API key rotation required → manual intervention
- Rate limits exceeded → messages not sent
- Cost overruns -> unexpected charges

**Mitigation:**
- Implement retry logic with exponential backoff
- Add error handling and user notifications
- Monitor usage and costs
- Document API key rotation procedures

---

#### 3. Cron Job Execution
**Location:** Vercel cron for weekly snapshots

**Issue:** If cron job fails (due to RLS issue or other error), no retry mechanism exists. Snapshot simply doesn't get created.

**Impact:** Incomplete reporting data; gaps in historical tracking.

**Mitigation:**
- Fix RLS issue (see Security Vulnerability #2)
- Add error logging and alerting
- Consider manual trigger fallback

---

## Known Bugs

### From PLATFORM_CONTEXT.md (OA Planner)

1. **Employer name incorrectly sourced from lead organiser name** (see Data Quality Issue #2 above)

2. **Worksite names not populated in AI context** (see Data Quality Issue #2 above)

3. **Gate criteria current values manually entered only** (see Feature Gaps #4 above)

---

### Additional Issues Identified

#### 4. No Data Validation on Employer Merge
**Location:** Organising DB employer merge functionality

**Issue:** When merging employers, no validation prevents circular references or merging a Principal Employer into a non-Principal Employer.

**Impact:** Data integrity issues; broken hierarchies.

**Mitigation:** Add validation rules for merge operations.

---

#### 5. Import Logs Not Expiry-Managed
**Location:** `import_logs` table

**Issue:** No mechanism to archive or delete old import logs. Table will grow indefinitely.

**Impact:** Database bloat; degraded query performance over time.

**Mitigation:** Implement log retention policy with archival/deletion.

---

## Recommended Action Priority

### High Priority (Security & Data Integrity)
1. Fix RLS `is_assigned_to_campaign()` oversharing
2. Fix cron snapshot route to use service client
3. Backfill `project_employers` and `project_agreements`
4. Fix AI prompt employer/worksite context

### Medium Priority (Feature Completeness)
5. Implement deep links between applications
6. Auto-populate gate criteria from live data
7. Add employer/worksite preview to campaign creation wizard
8. Add campaign planning status badges to Organising DB

### Low Priority (Quality of Life)
9. Implement organiser workload dashboard
10. Add agreement expiry-driven campaign prompts
11. Add pagination to all list views
12. Implement import log retention policy

---

**Note:** This document should be reviewed and updated regularly as issues are resolved and new ones are discovered.
