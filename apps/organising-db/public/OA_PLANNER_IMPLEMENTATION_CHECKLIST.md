# OA Planner — Implementation Checklist

This document lists all changes required **in the OAPlanning repository** (`oaplanner.uconstruct.app`) to complete the cross-app integration. It is the counterpart to the changes already made in the Organising DB (`oa.uconstruct.app`).

Priority levels:
- **P0** — required before any cross-app navigation works correctly
- **P1** — required for the deep-link and campaign-linking flow to work without data duplication
- **P2** — quality and correctness improvements to AI-generated content

---

## P0 — Must do first

### P0.1 — Regenerate `src/types/database.ts`

The type file in OAPlanning is stale and is missing several tables that exist in the live Supabase database. Run:

```bash
supabase gen types typescript --project-id gteygwfgjvczanmrwgbr > src/types/database.ts
```

After regeneration, verify that the following tables now appear in the generated types:
- `campaign_worker_membership` (and its `oa_leader_role` field)
- `campaign_employers`
- `campaign_worksites`
- `campaign_activity_ratings`

Re-run the gate criteria auto-population assessment (Questions doc section 7) once the types are confirmed.

---

### P0.2 — Configure Supabase cookie domain for cross-subdomain session sharing

Both apps are on `*.uconstruct.app`. Add `cookieOptions: { domain: '.uconstruct.app' }` to OAPlanning's three Supabase client configurations so that session cookies are scoped to the shared parent domain and recognised by the Organising DB.

**Files to update:**

`src/lib/supabase/client.ts`:
```typescript
return createBrowserClient(url, anonKey, {
  cookieOptions: { domain: '.uconstruct.app' },
})
```

`src/lib/supabase/server.ts` (in `createClient()`):
```typescript
return createServerClient(url, anonKey, {
  cookieOptions: { domain: '.uconstruct.app' },
  cookies: { ... },
})
```

`src/middleware.ts` (in the `createServerClient` call inside `updateSession` or equivalent):
```typescript
cookieOptions: { domain: '.uconstruct.app' },
```

**Without this change**, navigating from the Organising DB to OAPlanner will always prompt the user to log in again, defeating the seamless UX goal.

---

### P0.3 — Add environment variable and "View in Organising DB" back-link

Add to `.env.local` (and Vercel environment variables):
```
NEXT_PUBLIC_ORGANISING_DB_URL=https://oa.uconstruct.app
```

On the OAPlanning campaign detail page (`src/app/(app)/campaigns/[id]/page.tsx`), add a back-link in the header or action bar:

```tsx
<a href={`${process.env.NEXT_PUBLIC_ORGANISING_DB_URL}/campaigns/${campaignId}`}>
  ← View in Organising DB
</a>
```

Also add a `CrossAppBanner` equivalent in OAPlanning's layout (`src/components/layout/AppShell.tsx`) showing:
```
[ OA Planner ]  ·  [ Organising DB ]
```
The Organising DB link should navigate same-tab (no `target="_blank"`) since cookie sharing is now configured.

---

## P1 — Required for correct campaign linking

### P1.1 — Support `?campaign_id=` in the campaign creation wizard

**File:** `src/app/(app)/campaigns/new/page.tsx` and `src/components/campaign/CampaignCreationWizard.tsx`

The wizard currently creates a new `campaigns` row unconditionally. When `?campaign_id=` is present in the URL, it should:

1. Read the param from `searchParams` in the page component and pass it to the wizard
2. Skip the `campaigns` insert in `useCreateCampaign()` — use the provided ID instead
3. Verify the campaign exists: `supabase.from('campaigns').select('campaign_id').eq('campaign_id', campaignId).single()`
4. Guard against duplicate initialisation: if `campaign_stage_plans` rows already exist for this `campaign_id`, show an error or redirect to the existing plan

```typescript
// In useCreateCampaign mutation:
if (existingCampaignId) {
  // Skip insert, use existingCampaignId for all downstream inserts
  return existingCampaignId;
}
// Otherwise, insert as normal
const { data } = await supabase.from('campaigns').insert(payload).select('campaign_id').single();
return data.campaign_id;
```

---

### P1.2 — Support pre-fill query parameters in the wizard

Extend the wizard to read and apply these additional URL parameters:

| Parameter | Field to pre-fill |
|-----------|-------------------|
| `?agreement_id=` | Agreement picker in the timeline step |
| `?expiry_date=` | Expiry date field in the timeline step |
| `?organiser_id=` | Lead organiser picker in the campaign basics step |

The Organising DB sends all four params when deep-linking from:
- Campaign wizard step 4 (bargaining campaigns): `?campaign_id={id}&organiser_id={id}`
- Dashboard expiry warning: `?agreement_id={id}&expiry_date={date}`
- Agreement detail page (future): `?agreement_id={id}&expiry_date={date}`

---

### P1.3 — Fix `is_assigned_to_campaign()` RLS oversharing bug

**File:** `supabase/migrations/20260330000002_rls_policies.sql`

The current function joins `agreements` without constraining it to the campaign's linked agreement. Any organiser assigned to any agreement in the system may pass the check for any campaign.

Fix by adding the constraint:
```sql
CREATE OR REPLACE FUNCTION is_assigned_to_campaign(p_campaign_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN agreement_organisers ao ON ao.organiser_id = up.organiser_id
    JOIN campaign_timelines ct ON ct.campaign_id = p_campaign_id
    JOIN agreements a ON a.agreement_id = ao.agreement_id
      AND a.agreement_id = ct.agreement_id   -- ← this line was missing
    WHERE up.user_id = auth.uid()
  )
  OR EXISTS (
    -- Retain the direct lead organiser path for campaigns without a timeline
    SELECT 1 FROM campaigns c
    JOIN user_profiles up ON up.organiser_id = c.organiser_id
    WHERE c.campaign_id = p_campaign_id
      AND up.user_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER;
```

Apply via a new migration file:
```
supabase/migrations/20260330000004_fix_rls_is_assigned_to_campaign.sql
```

---

### P1.4 — Fix cron snapshot route to use service role client

**File:** `src/app/api/snapshots/route.ts` — the `GET` handler

The Vercel cron job sends no user session. The current code uses `createClient()` (browser/anon) which evaluates RLS with `auth.uid() = null`, causing all campaign queries to return empty results.

Change to:
```typescript
// GET handler (cron)
const supabase = await createServiceClient(); // bypasses RLS
```

Confirm `createServiceClient()` is already available at `src/lib/supabase/server.ts`. If not, add it following the pattern from `PLATFORM_CONTEXT.md` section 13.

---

## P2 — Quality improvements

### P2.1 — Fix employer name in Theory of Winning AI context

**File:** `src/app/(app)/campaigns/[id]/stage/[stageNumber]/page.tsx`

`campaign_context.employer_name` is currently set to the **lead organiser's name**, not the employer. Fix by extending the `useCampaign(id)` query to join through the agreement path:

```
campaign_timelines.agreement_id
  → agreements
  → agreement_employers
  → employers.employer_name
```

Update the `useCampaign` hook in `src/lib/hooks/useCampaigns.ts` to include this join, then read `employer_name` from the nested result instead of `organisers.organiser_name`.

---

### P2.2 — Fix worksite names in Theory of Winning AI context

**File:** Same page as P2.1

`campaign_context.worksite_names` is currently hardcoded as `[]`. Fix by adding the join:

```
campaign_timelines.agreement_id
  → agreements
  → agreement_worksites
  → worksites.worksite_name
```

Return the array of worksite names and pass it to the AI prompt.

---

### P2.3 — No employer/worksite preview in campaign creation wizard

**File:** `src/components/campaign/CampaignCreationWizard.tsx`

When a user selects an `agreement_id` in the wizard, add a preview card showing:
- Agreement name / short name
- Employer(s) from `agreement_employers → employers`
- Worksite(s) from `agreement_worksites → worksites`
- Agreement expiry date (if not already auto-filled)

This helps data entry accuracy and is especially important when pre-filling from `?agreement_id=` (the user should see what they're linking to).

---

## Summary

| ID | Priority | Item | Status |
|----|----------|------|--------|
| P0.1 | P0 | Regenerate `database.ts` types | Pending |
| P0.2 | P0 | Configure cookie domain `.uconstruct.app` | Pending |
| P0.3 | P0 | Add `NEXT_PUBLIC_ORGANISING_DB_URL` + back-link + CrossAppBanner | Pending |
| P1.1 | P1 | Support `?campaign_id=` in wizard (skip campaigns insert) | Pending |
| P1.2 | P1 | Support `?agreement_id=`, `?expiry_date=`, `?organiser_id=` pre-fill | Pending |
| P1.3 | P1 | Fix `is_assigned_to_campaign()` RLS bug | Pending |
| P1.4 | P1 | Fix cron snapshot route — use service client | Pending |
| P2.1 | P2 | Fix employer name in Theory of Winning AI context | Pending |
| P2.2 | P2 | Fix worksite names in Theory of Winning AI context | Pending |
| P2.3 | P2 | Add agreement preview in wizard after agreement selection | Pending |

---

*Document created: 2026-03-30. Update the Status column as items are completed in the OAPlanning repository.*
