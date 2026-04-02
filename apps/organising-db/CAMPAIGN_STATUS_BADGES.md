# Campaign Status Badges - Implementation Report

## Overview
Implemented Agent 2.3: Campaign Status Badges for the Offshore Alliance Platform. The badges display the planning status of campaigns linked to agreements from the OA Planner, providing quick visibility into campaign progress directly in the Organising DB.

## Files Created/Modified

### Created Files

1. **`/apps/organising-db/src/components/campaigns/campaign-status-badge.tsx`**
   - Reusable badge component with 4 states
   - Handles client-side data fetching
   - Clickable navigation to OA Planner
   - Two size variants: sm (list view) and lg (detail page)

2. **`/apps/organising-db/src/app/api/agreements/[id]/campaign-status/route.ts`**
   - API endpoint to fetch campaign status for an agreement
   - Implements status determination logic
   - Joins agreements → campaign_timelines → campaigns → campaign_stage_plans

### Modified Files

3. **`/apps/organising-db/src/app/(dashboard)/agreements/page.tsx`**
   - Added "Campaign Status" column to agreements list
   - Replaced old "Campaign Plan" text link with new badge component
   - Badge size: sm (compact for list view)

4. **`/apps/organising-db/src/app/(dashboard)/agreements/[id]/page.tsx`**
   - Added prominent campaign status badge to agreement detail header
   - Displayed alongside agreement status badge
   - Badge size: lg (larger, more prominent)
   - Uses flex-wrap for responsive layout

## Badge States and Logic

### 1. "No campaign plan" - Grey Badge
**Variant:** `secondary`
**Condition:** No campaign linked to this agreement via `campaign_timelines`
**Navigation:** Click to navigate to campaigns list (for creating new campaign)
**Icon:** None
**User Action:** Create a new campaign plan

### 2. "Stage X: [Stage Name]" - Blue Badge
**Variant:** `info`
**Condition:**
- Campaign exists
- Campaign status is 'planning' or 'active'
- Active stage plan exists (status = 'active' in `campaign_stage_plans`)
**Display:** Shows stage number and stage name (e.g., "Stage 2: Mobilization")
**Navigation:** Click to navigate to the campaign in OA Planner
**User Action:** View/edit campaign details

### 3. "Campaign complete" - Green Badge
**Variant:** `success`
**Condition:** Campaign status = 'completed'
**Navigation:** Click to navigate to the campaign in OA Planner
**User Action:** View completed campaign details

### 4. "Planning blocked" - Amber Badge
**Variant:** `warning`
**Condition:** Campaign exists but:
- No active stage plan exists (status = 'active' in `campaign_stage_plans`)
- AND campaign status is 'planning' or 'active' (but has no active stage)
- OR campaign status = 'suspended'
**Definition of "Blocked":**
This state indicates:
- Campaign was created but no stage plans have been set up yet
- All stage plans are completed but campaign isn't marked as complete
- Campaign has been suspended
- Gates have failed and blocked progress (implicit from no active stage)

**Navigation:** Click to navigate to the campaign in OA Planner to resolve
**User Action:** Unblock by creating/activating stage plans or updating campaign status

## Database Schema (Joins)

The implementation queries the following tables in order:

```
agreements
  ↓ (via agreement_id)
campaign_timelines
  ↓ (via campaign_id)
campaigns
  ↓ (via campaign_id)
campaign_stage_plans (where status = 'active')
```

### Key Tables

**campaign_timelines:**
- Links agreements to campaigns
- Fields: `timeline_id`, `campaign_id`, `agreement_id`

**campaigns:**
- Core campaign data
- Fields: `campaign_id`, `name`, `status` (planning/active/completed/suspended)

**campaign_stage_plans:**
- Stage plans for each campaign
- Fields: `plan_id`, `campaign_id`, `stage_number`, `stage_name`, `status`
- Status values: draft, active, completed, blocked

## Performance Considerations

### Current Implementation
- Client-side data fetching per badge component
- Each badge makes an individual API call
- Suitable for small to medium agreement lists

### Production Optimizations (Recommended)
For large agreement lists (>100 items), consider:

1. **Server-Side Rendering with Batch Queries:**
   ```typescript
   // Fetch all agreement campaign statuses in one query
   const agreementIds = agreements.map(a => a.agreement_id);
   const statuses = await batchFetchCampaignStatuses(agreementIds);
   ```

2. **Caching Layer:**
   - Cache campaign statuses in Redis/Upstash
   - Invalidate on campaign updates
   - TTL: 5-15 minutes

3. **WebSocket/Real-time Updates:**
   - Subscribe to campaign changes
   - Update badges in real-time when campaigns are modified

4. **Database View:**
   ```sql
   CREATE VIEW agreement_campaign_status AS
   SELECT
     a.agreement_id,
     c.campaign_id,
     c.status as campaign_status,
     csp.stage_number,
     csp.stage_name,
     csp.status as stage_status
   FROM agreements a
   LEFT JOIN campaign_timelines ct ON a.agreement_id = ct.agreement_id
   LEFT JOIN campaigns c ON ct.campaign_id = c.campaign_id
   LEFT JOIN campaign_stage_plans csp ON c.campaign_id = csp.campaign_id AND csp.status = 'active';
   ```

## Navigation

The badges navigate to:
- **No campaign:** `/campaigns` (campaigns list)
- **Has campaign:** `/oa-planner/campaigns/{campaignId}` (OA Planner)

**Note:** OA Planner URL can be configured via `NEXT_PUBLIC_OA_PLANNER_URL` environment variable.
Defaults to: `https://oaplanner.uconstruct.app`

## Edge Cases Handled

1. **No campaign linked:** Shows "No campaign plan" badge
2. **Campaign without stage plans:** Shows "Planning blocked" badge
3. **Campaign completed:** Shows "Campaign complete" badge
4. **Multiple campaigns per agreement:** Uses first found campaign (via campaign_timelines UNIQUE constraint)
5. **API errors:** Gracefully falls back to "No campaign plan" with console error
6. **Loading state:** Shows spinner while fetching data

## Testing

### Manual Testing Steps

1. **Test "No campaign plan" state:**
   - Find an agreement without a linked campaign
   - Verify grey badge displays "No campaign plan"
   - Click badge - should navigate to campaigns list

2. **Test "Stage X: [Stage Name]" state:**
   - Create a campaign with active stage plan
   - Link to an agreement via campaign_timelines
   - Verify blue badge shows stage number and name
   - Click badge - should navigate to OA Planner campaign

3. **Test "Campaign complete" state:**
   - Mark a campaign as completed
   - Verify green badge displays "Campaign complete"
   - Click badge - should navigate to campaign

4. **Test "Planning blocked" state:**
   - Create a campaign without active stage plans
   - Or suspend a campaign
   - Verify amber badge displays "Planning blocked"
   - Click badge - should navigate to campaign

5. **Test agreement list page:**
   - Navigate to `/agreements`
   - Verify "Campaign Status" column appears
   - Verify badges are compact (sm size)
   - Verify all badges load correctly

6. **Test agreement detail page:**
   - Navigate to any agreement detail page
   - Verify campaign status badge appears next to agreement name
   - Verify badge is larger (lg size)
   - Verify badge wraps on mobile (flex-wrap)

### Database Setup for Testing

```sql
-- Create a test campaign
INSERT INTO campaigns (name, description, campaign_type, status)
VALUES ('Test Campaign', 'Testing badge', 'bargaining', 'active');

-- Link to an agreement via campaign_timelines
INSERT INTO campaign_timelines (campaign_id, agreement_id)
VALUES (1, 123); -- Replace with actual campaign_id and agreement_id

-- Create an active stage plan
INSERT INTO campaign_stage_plans (campaign_id, stage_number, stage_name, status)
VALUES (1, 2, 'Mobilization', 'active');
```

## Future Enhancements

1. **Tooltip on Hover:** Show more details about campaign progress
2. **Progress Bar:** Visual indicator of stage completion
3. **Quick Actions:** Dropdown menu from badge for common actions
4. **Filter by Status:** Add filter option on agreements list
5. **Bulk Actions:** Update multiple campaign statuses at once
6. **Real-time Updates:** WebSocket integration for live updates
7. **Analytics:** Track which badges are clicked most often

## Conclusion

The Campaign Status Badges feature has been successfully implemented with:
- ✅ Badge component with 4 distinct states
- ✅ API endpoint for status determination
- ✅ Integration into agreements list page
- ✅ Integration into agreement detail page
- ✅ Click navigation to OA Planner
- ✅ Proper error handling and loading states
- ✅ Responsive design with two size variants
- ✅ Clear definition of "planning blocked" criteria

The implementation follows existing patterns in the codebase, uses consistent styling with other badges, and provides a smooth user experience for navigating between the Organising DB and OA Planner.
