# Workload Dashboard - Verification Checklist

## 📋 Pre-Deployment Checklist

Use this checklist to verify the Workload Dashboard is ready for deployment.

### Phase 1: Database Setup

- [ ] **Migration Applied**
  - Run: `npx supabase db push`
  - Verify: Check Supabase dashboard → Database → Tables
  - Expected: 5 new views starting with `workload_`

- [ ] **Views Created**
  ```sql
  SELECT table_name
  FROM information_schema.views
  WHERE table_schema = 'public' AND table_name LIKE 'workload%';
  ```
  Expected results:
  - workload_campaigns_by_stage
  - workload_campaign_progress
  - workload_campaign_entities
  - workload_campaign_activities
  - workload_dashboard_summary

- [ ] **RPC Function Created**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'get_workload_dashboard_data';
  ```
  Expected: 1 row returned

- [ ] **Indexes Created**
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename LIKE 'workload%';
  ```
  Expected: 3+ indexes

### Phase 2: Application Setup

- [ ] **Dependencies Installed**
  ```bash
  cd apps/organising-db
  npm list recharts
  npm list @radix-ui/react-progress
  ```
  Expected: Both packages installed

- [ ] **Dev Server Starts**
  ```bash
  npm run dev
  ```
  Expected: Server starts on port 3000 with no errors

- [ ] **Build Successful**
  ```bash
  npm run build
  ```
  Expected: Build completes without TypeScript errors

### Phase 3: Functional Testing

#### Main Dashboard (`/dashboard`)

- [ ] **Page Loads**
  - Navigate to http://localhost:3000/dashboard
  - Expected: Page loads, workload section visible

- [ ] **Summary Stats Display**
  - Expected: 3 stat cards (Total Campaigns, Avg Progress, Activities)
  - Expected: Alert badges if overdue/due-soon campaigns exist

- [ ] **Filters Render**
  - Expected: 3 filter dropdowns (Organiser, Status, Time Period)
  - Expected: All options visible

- [ ] **Metrics Display**
  - Campaigns by Stage: Bar chart visible
  - Progress: Progress bars visible
  - Entities: Entity counts visible
  - Activities: Activity list visible

- [ ] **Existing Dashboard Content**
  - Expected: Original dashboard content still visible below workload section
  - Expected: No breaking changes to existing features

#### Full Workload Page (`/workload`)

- [ ] **Page Loads**
  - Navigate to http://localhost:3000/workload
  - Expected: Full-screen workload dashboard

- [ ] **All Metrics Visible**
  - Expected: All 4 metrics display with full data
  - Expected: Larger layout than main dashboard section

- [ ] **Filters Work**
  - Change "Organiser" filter
  - Change "Status" filter
  - Change "Time Period" filter
  - Expected: Data updates instantly, no page reload

#### Navigation

- [ ] **Sidebar Link**
  - Expected: "Workload" link visible in sidebar
  - Click: Navigates to `/workload`

- [ ] **Drill-Down Navigation**
  - Click any campaign card
  - Expected: Navigates to `/campaigns/{id}`
  - Expected: Campaign detail page loads

- [ ] **Browser Navigation**
  - Use browser back button
  - Expected: Returns to workload dashboard
  - Expected: Filters preserved

### Phase 4: Data Verification

- [ ] **Metric 1: Campaigns by Stage**
  - Expected: Bar chart with stage labels
  - Expected: Campaign counts per stage
  - Hover: Tooltip shows count

- [ ] **Metric 2: Progress Towards Ambitions**
  - Expected: Progress bars for each campaign
  - Expected: Percentage badges
  - Expected: Criteria counts (met/total)
  - Expected: Pending assessment indicators

- [ ] **Metric 3: Entities per Campaign**
  - Expected: Worksite counts
  - Expected: Employer counts
  - Expected: Worker counts
  - Expected: Leader counts

- [ ] **Metric 4: Activities Underway**
  - Expected: Total activity count per campaign
  - Expected: Breakdown by activity type
  - Expected: Status badges
  - Expected: Sorted by most active

### Phase 5: Visual Indicators

- [ ] **Overdue Items**
  - Expected: Red badges
  - Expected: Amber background on cards
  - Expected: Warning icon visible

- [ ] **Due Soon Items**
  - Expected: Amber badges
  - Expected: "Due soon" text visible
  - Expected: Clock icon visible

- [ ] **On Track Items**
  - Expected: Green progress indicators
  - Expected: No warning badges

- [ ] **Loading States**
  - Expected: Spinner visible while loading
  - Expected: Skeleton screens or loading text

- [ ] **Empty States**
  - Expected: Helpful message when no data
  - Expected: No broken UI

### Phase 6: Edge Cases

- [ ] **No Campaigns**
  - Delete/modify filter to show no results
  - Expected: Empty state message
  - Expected: No errors

- [ ] **No Permissions**
  - Log out, try to access dashboard
  - Expected: Redirected to login
  - Expected: No data exposed

- [ ] **Large Data Sets**
  - If > 50 campaigns exist
  - Expected: Performance acceptable
  - Expected: UI not overwhelmed

- [ ] **Filter Combinations**
  - Try all filter combinations
  - Expected: No crashes
  - Expected: Logical results

### Phase 7: Performance

- [ ] **Initial Load**
  - Expected: Dashboard loads in < 3 seconds
  - Expected: Spinner visible during load

- [ ] **Filter Changes**
  - Change filters rapidly
  - Expected: Updates in < 1 second
  - Expected: No lag or freezing

- [ ] **Memory Usage**
  - Leave dashboard open for 10+ minutes
  - Expected: No memory leaks
  - Expected: Browser remains responsive

### Phase 8: Browser Compatibility

- [ ] **Chrome/Edge**
  - Expected: All features work

- [ ] **Firefox**
  - Expected: All features work

- [ ] **Safari** (if on Mac)
  - Expected: All features work

- [ ] **Mobile Responsive**
  - Resize browser to mobile width
  - Expected: Layout adapts
  - Expected: All content accessible

### Phase 9: Documentation

- [ ] **README Files Created**
  - WORKLOAD_DASHBOARD_README.md exists
  - QUICK_START_WORKLOAD_DASHBOARD.md exists
  - WORKLOAD_IMPLEMENTATION_SUMMARY.md exists

- [ ] **Documentation Accurate**
  - Read through all README files
  - Expected: Instructions match implementation
  - Expected: All commands work

### Phase 10: Code Quality

- [ ] **TypeScript Compiles**
  ```bash
  npm run build
  ```
  Expected: No TypeScript errors

- [ ] **No Console Errors**
  - Open browser DevTools
  - Navigate dashboard
  - Expected: No red errors in console

- [ ] **No ESLint Warnings**
  ```bash
  npm run lint
  ```
  Expected: No critical warnings

## 🚀 Ready to Deploy?

If all checkboxes are marked, the Workload Dashboard is ready for production deployment!

### Deployment Steps

1. **Merge to main branch**
   ```bash
   git checkout main
   git merge workload-dashboard
   ```

2. **Apply migration to production**
   ```bash
   npx supabase db push --db-url <production-db-url>
   ```

3. **Deploy to production**
   ```bash
   # Use your deployment process (Vercel, etc.)
   ```

4. **Post-Deployment Verification**
   - Access production URL
   - Test all features again
   - Monitor error logs
   - Verify performance

5. **User Communication**
   - Notify users of new feature
   - Share documentation links
   - Gather feedback

## 📝 Notes

Use this section to record any issues found during testing:

```
Issue 1: [Description]
Status: [Fixed/Open]
Notes: [Any relevant details]

Issue 2: [Description]
Status: [Fixed/Open]
Notes: [Any relevant details]
```

---

**Last Updated**: 2026-04-02
**Implemented By**: Agent 2.1 (Claude)
**Status**: Ready for Testing
