# Workload Dashboard Implementation

## Overview
The Organiser Workload Dashboard has been implemented as the central element of the Organising DB landing page. It provides real-time visibility into campaign progress, activities, and resource allocation.

## Files Created/Modified

### Database Layer
1. **`supabase/migrations/20260402190000_workload_dashboard_views.sql`**
   - Creates 5 optimized views for workload metrics
   - Creates RPC function `get_workload_dashboard_data` with filtering
   - Includes performance indexes

### API Layer
2. **`apps/organising-db/src/app/api/workload/route.ts`**
   - API endpoint to fetch filtered workload data
   - Supports filtering by organiser, status, and time period
   - Returns aggregated metrics and campaign details

### UI Components
3. **`apps/organising-db/src/components/dashboard/campaigns-by-stage-chart.tsx`**
   - Bar chart showing campaigns grouped by stage
   - Color-coded by stage status

4. **`apps/organising-db/src/components/dashboard/campaign-progress-card.tsx`**
   - Progress bars for each campaign's ambition completion
   - Shows met/total criteria and pending assessments
   - Visual indicators for overdue/due soon items

5. **`apps/organising-db/src/components/dashboard/campaign-entities-card.tsx`**
   - Display worksites, employers, workers, and leaders per campaign
   - Grid layout with icon-based entity counts

6. **`apps/organising-db/src/components/dashboard/campaign-activities-card.tsx`**
   - Shows all activities currently underway
   - Sorted by most active campaigns
   - Breakdown of in-progress actions, pending assessments, active stage plans

7. **`apps/organising-db/src/components/dashboard/workload-filters.tsx`**
   - Filter controls for organiser, status, and time period
   - Reactive filtering with instant updates

8. **`apps/organising-db/src/components/dashboard/workload-summary-stats.tsx`**
   - Summary statistics: total campaigns, average progress, activities underway
   - Alert badges for overdue and due-soon campaigns

9. **`apps/organising-db/src/components/ui/progress.tsx`**
   - Radix UI progress bar component (was missing)

### Pages
10. **`apps/organising-db/src/app/(dashboard)/workload/page.tsx`**
    - Full-screen workload dashboard page
    - Accessible via `/workload` route

11. **`apps/organising-db/src/app/(dashboard)/dashboard/page.tsx`** (MODIFIED)
    - Integrated workload dashboard as central element
    - Added workload summary section with all 4 key metrics
    - Maintains existing dashboard content below workload section

12. **`apps/organising-db/src/components/layout/sidebar.tsx`** (MODIFIED)
    - Added "Workload" navigation link with Activity icon

## Installation Instructions

### Step 1: Run the Database Migration

```bash
# From the monorepo root
cd /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance

# Apply the migration to your Supabase project
npx supabase db push

# OR apply manually via Supabase dashboard:
# 1. Go to SQL Editor in Supabase
# 2. Copy contents of: supabase/migrations/20260402190000_workload_dashboard_views.sql
# 3. Run the SQL script
```

### Step 2: Verify the Views Were Created

Run this query in Supabase SQL Editor:

```sql
-- Check that views exist
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'workload%';

-- Should return:
-- workload_campaigns_by_stage
-- workload_campaign_progress
-- workload_campaign_entities
-- workload_campaign_activities
-- workload_dashboard_summary

-- Test the RPC function
SELECT * FROM get_workload_dashboard_data();
```

### Step 3: Restart the Development Server

```bash
# From the organising-db directory
cd apps/organising-db
npm run dev
```

### Step 4: Access the Dashboard

1. **Main Dashboard**: Navigate to `/dashboard` - workload section is now the central element
2. **Full Workload Dashboard**: Navigate to `/workload` for dedicated page
3. **Sidebar Link**: Click "Workload" in the left sidebar

## Features Implemented

### 4 Key Metrics

#### 1. Campaigns by Stage
- Visual breakdown (bar chart)
- Groups campaigns by: Not Started, Planning, Activation, Mobilization, Gate Review, Consolidation, Completion
- Color-coded by stage type
- Click chart to filter campaigns by stage

#### 2. Progress Towards Ambitions
- For each active campaign stage, calculates ambition completion percentage
- Shows progress bars with percentages
- Formula: (met criteria / total criteria) × 100
- Displays pending gate assessments
- Visual status indicators (overdue, due soon)

#### 3. Worksites/Employers/Workers per Campaign
- Counts entities for each campaign
- Displays as cards with:
  - Worksite count
  - Employer count
  - Worker count
  - OA Leader count
- Grid layout for easy scanning

#### 4. Campaign Activities Underway
- Derived from:
  - `campaign_actions` with status='in_progress'
  - `gate_assessments` with outcome='pending'
  - `campaign_stage_plans` with status='active'
- Shows breakdown by activity type
- Sorted by most active campaigns

### Drill-Down Capability
- Click any campaign card → navigates to campaign detail page (`/campaigns/{id}`)
- Uses Next.js Link components for navigation
- Maintains filter context when navigating

### Filtering
- **By Organiser**: "Me Only" vs "My Team" (uses `created_by` field)
- **By Status**: All, Active, Planning, Paused, Completed
- **By Time Period**: All Time, Last 30 Days, Last 90 Days, Last Year
- Filters are applied client-side via API parameters

### Visual Indicators
- **Overdue items**: Red badge/text with amber background
- **Due soon (within 7 days)**: Amber badge/text
- **On track**: Green indicators
- Progress bars with percentage completion
- Activity counts with status badges

## Database Schema Used

The dashboard queries these existing tables:
- `campaigns` - Core campaign data
- `campaign_stage_plans` - Stage planning status
- `campaign_timelines` - Timeline and agreement links
- `campaign_actions` - Action items
- `gate_definitions` - Gate configuration
- `gate_criteria` - Gate criteria with status
- `gate_assessments` - Assessment records
- `campaign_worksites` - Worksite relationships
- `agreements` - Agreement data
- `workers` - Worker records
- `worker_agreements` - Worker-agreement links
- `agreement_worksites` - Agreement-worksite relationships
- `campaign_ous` - Organising units
- `campaign_ou_leaders` - OA leader assignments

## Performance Optimizations

1. **Database Views**: Pre-computed joins and aggregations
2. **Indexes**: Added on frequently-filtered columns
3. **Query Caching**: 5-minute stale time on client
4. **RPC Function**: Single call with filtering logic in database
5. **Pagination**: Campaign lists limited to 5 items on main dashboard

## Testing

### Manual Testing Checklist

1. **Dashboard Loads**
   - [ ] Navigate to `/dashboard` - workload section visible
   - [ ] Navigate to `/workload` - full page loads
   - [ ] No console errors

2. **Filters Work**
   - [ ] Change "Organiser" filter - data updates
   - [ ] Change "Status" filter - data updates
   - [ ] Change "Time Period" filter - data updates

3. **Metrics Display**
   - [ ] Campaigns by Stage chart shows data
   - [ ] Progress bars show for campaigns
   - [ ] Entity counts display correctly
   - [ ] Activity counts are accurate

4. **Drill-Down Navigation**
   - [ ] Click campaign card → navigates to detail page
   - [ ] Browser back button returns to dashboard

5. **Visual Indicators**
   - [ ] Overdue campaigns show red indicators
   - [ ] Due-soon campaigns show amber indicators
   - [ ] Progress percentages calculate correctly

### Sample Data Query

To populate sample data for testing, run:

```sql
-- Check if you have campaigns with data
SELECT
    c.campaign_id,
    c.name,
    c.status,
    COUNT(DISTINCT cw.worksite_id) as worksite_count,
    COUNT(DISTINCT ca.action_id) as action_count
FROM campaigns c
LEFT JOIN campaign_worksites cw ON c.campaign_id = cw.campaign_id
LEFT JOIN campaign_actions ca ON c.campaign_id = ca.campaign_id
GROUP BY c.campaign_id, c.name, c.status
ORDER BY c.created_at DESC
LIMIT 10;
```

## Troubleshooting

### Issue: Dashboard shows "No campaign data available"
**Solution**: Ensure you have campaigns with status='active' or status='planning'

### Issue: Progress percentages show 0%
**Solution**: Ensure gate criteria exist and have been assessed. Run:
```sql
SELECT * FROM gate_criteria_with_status;
```

### Issue: API returns 401 Unauthorized
**Solution**: Check that you're logged in and have the authenticated role

### Issue: Charts don't render
**Solution**: Check browser console for errors. Ensure Recharts is installed:
```bash
npm list recharts
```

## Future Enhancements

Potential improvements for future iterations:
1. Export dashboard data to CSV/PDF
2. Email digest of workload metrics
3. Historical trend analysis
4. Campaign comparison view
5. Resource allocation recommendations
6. Mobile-optimized view
7. Real-time updates via Supabase Realtime
8. Custom date range picker
9. Saved filter presets
10. Performance targets/goals per campaign

## Support

For issues or questions:
1. Check the browser console for errors
2. Verify database views exist: `SELECT * FROM information_schema.views WHERE table_name LIKE 'workload%'`
3. Test the API directly: `/api/workload`
4. Review the migration SQL for any errors during application

## Summary

The Workload Dashboard is now fully implemented and ready to use. Run the migration, restart the dev server, and navigate to `/dashboard` to see it in action!
