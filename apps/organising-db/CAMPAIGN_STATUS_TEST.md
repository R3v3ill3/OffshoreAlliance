# Campaign Status Badges - Testing Guide

## Quick Start Testing

### 1. Test API Endpoint Directly

```bash
# Test with an actual agreement ID
curl http://localhost:3000/api/agreements/123/campaign-status

# Expected response structure:
{
  "exists": true,
  "campaignId": 1,
  "status": "active",
  "stageNumber": 2,
  "stageName": "Mobilization"
}
```

### 2. Test Badge Component in Browser

Navigate to:
- **List view:** http://localhost:3000/agreements
- **Detail view:** http://localhost:3000/agreements/123

## Test Data Setup

### Option 1: Using SQL (via Supabase Dashboard)

```sql
-- 1. Create a test campaign
INSERT INTO campaigns (name, description, campaign_type, status)
VALUES (
  'Test Campaign for Badge',
  'Testing campaign status badges',
  'bargaining',
  'active'
)
RETURNING campaign_id;

-- 2. Link to an existing agreement
INSERT INTO campaign_timelines (campaign_id, agreement_id)
VALUES (
  <campaign_id_from_step_1>,
  <existing_agreement_id>
);

-- 3. Create an active stage plan
INSERT INTO campaign_stage_plans (
  campaign_id,
  stage_number,
  stage_name,
  status
)
VALUES (
  <campaign_id_from_step_1>,
  2,
  'Mobilization',
  'active'
);
```

### Option 2: Using the UI

1. Navigate to OA Planner: http://localhost:3001/campaigns
2. Create a new campaign
3. Link it to an agreement
4. Create stage plans
5. Return to Organising DB to see the badge

## Test Scenarios

### Scenario 1: No Campaign Plan
**Expected:** Grey badge "No campaign plan"

```sql
-- Ensure no campaign_timelines entry for agreement
DELETE FROM campaign_timelines WHERE agreement_id = <test_agreement_id>;
```

**Verify:**
- Badge shows "No campaign plan"
- Badge is grey (secondary variant)
- Click navigates to /campaigns

### Scenario 2: Active Stage
**Expected:** Blue badge "Stage 2: Mobilization"

```sql
-- Set up active campaign with stage
UPDATE campaigns SET status = 'active' WHERE campaign_id = <test_campaign_id>;
UPDATE campaign_stage_plans SET status = 'active'
WHERE campaign_id = <test_campaign_id> AND stage_number = 2;
```

**Verify:**
- Badge shows stage number and name
- Badge is blue (info variant)
- Click navigates to OA Planner campaign

### Scenario 3: Campaign Complete
**Expected:** Green badge "Campaign complete"

```sql
UPDATE campaigns SET status = 'completed' WHERE campaign_id = <test_campaign_id>;
```

**Verify:**
- Badge shows "Campaign complete"
- Badge is green (success variant)
- Click navigates to OA Planner campaign

### Scenario 4: Planning Blocked
**Expected:** Amber badge "Planning blocked"

```sql
-- Option A: Campaign with no active stage
UPDATE campaigns SET status = 'active' WHERE campaign_id = <test_campaign_id>;
UPDATE campaign_stage_plans SET status = 'completed'
WHERE campaign_id = <test_campaign_id>;

-- Option B: Suspended campaign
UPDATE campaigns SET status = 'suspended' WHERE campaign_id = <test_campaign_id>;
```

**Verify:**
- Badge shows "Planning blocked"
- Badge is amber (warning variant)
- Click navigates to OA Planner campaign

## Performance Testing

### Test with Large Lists

```sql
-- Create 100 test agreements with campaigns
INSERT INTO campaign_timelines (campaign_id, agreement_id)
SELECT
  <test_campaign_id>,
  agreement_id
FROM agreements
LIMIT 100;
```

**Check:**
- Page load time
- Badge loading spinners
- API response times
- Browser console for errors

### Load Testing API Endpoint

```bash
# Using Apache Bench
ab -n 100 -c 10 http://localhost:3000/api/agreements/123/campaign-status

# Or using curl in a loop
for i in {1..50}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    http://localhost:3000/api/agreements/123/campaign-status
done
```

## Browser Console Testing

Open browser console and test API directly:

```javascript
// Test API fetch
fetch('/api/agreements/123/campaign-status')
  .then(r => r.json())
  .then(data => console.log('Campaign Status:', data))
  .catch(err => console.error('Error:', err));
```

## Visual Regression Testing

Take screenshots at different breakpoints:

1. **Mobile (< 640px):** Badges should wrap, not overflow
2. **Tablet (640px - 1024px):** Badges should be readable
3. **Desktop (> 1024px):** Badges should display properly in table

### Test Steps:
1. Open agreements list page
2. Resize browser window
3. Verify badges wrap with flex-wrap
4. Verify text remains readable
5. Verify click targets remain usable

## Edge Case Testing

### 1. API Error Handling
```javascript
// Simulate API error by using invalid agreement ID
fetch('/api/agreements/999999/campaign-status')
  .then(r => r.json())
  .then(data => console.log('Should show no campaign:', data));
```

**Expected:** Badge shows "No campaign plan" (no crash)

### 2. Network Latency
- Use Chrome DevTools → Network tab
- Throttle to "Slow 3G"
- Verify loading spinners display
- Verify badges eventually load

### 3. Concurrent Requests
- Open multiple agreement detail pages in different tabs
- Verify all badges load independently
- Check for race conditions or memory leaks

## Accessibility Testing

### Keyboard Navigation
1. Tab to badge
2. Press Enter
3. Verify navigation occurs

### Screen Reader Testing
1. Enable VoiceOver/NVDA
2. Navigate to badge
3. Verify badge text is announced
4. Verify tooltip is available

### Color Contrast
- Use axe DevTools or similar
- Verify all badge variants meet WCAG AA standards
- Test in both light and dark modes

## Debugging Tips

### If Badge Doesn't Load

1. **Check browser console:**
   ```javascript
   // Look for errors like:
   // - Failed to fetch
   // - 404 Not Found
   // - 500 Internal Server Error
   ```

2. **Check API directly:**
   ```bash
   curl -v http://localhost:3000/api/agreements/123/campaign-status
   ```

3. **Check database:**
   ```sql
   -- Verify campaign_timelines entry exists
   SELECT * FROM campaign_timelines WHERE agreement_id = 123;

   -- Verify campaign exists
   SELECT * FROM campaigns WHERE campaign_id = 1;

   -- Verify stage plans exist
   SELECT * FROM campaign_stage_plans WHERE campaign_id = 1;
   ```

### If Badge Shows Wrong Status

1. **Check campaign status:**
   ```sql
   SELECT status FROM campaigns WHERE campaign_id = 1;
   ```

2. **Check active stage:**
   ```sql
   SELECT * FROM campaign_stage_plans
   WHERE campaign_id = 1 AND status = 'active';
   ```

3. **Check API response:**
   ```javascript
   fetch('/api/agreements/123/campaign-status')
     .then(r => r.json())
     .then(data => console.log('Full response:', data));
   ```

## Common Issues and Solutions

### Issue: Badge shows "Unknown"
**Cause:** API returned unexpected data structure
**Fix:** Check API route and CampaignStatus interface match

### Issue: Click doesn't navigate
**Cause:** Router not properly initialized or invalid path
**Fix:** Check useRouter() is called, verify paths exist

### Issue: Badge doesn't update when campaign changes
**Cause:** Client-side cache, no real-time updates
**Fix:** Refresh page or implement real-time updates (future enhancement)

### Issue: Performance issues on large lists
**Cause:** N+1 queries (one API call per badge)
**Fix:** Implement batch queries or caching (see implementation report)

## Success Criteria

✅ All 4 badge states display correctly
✅ Badges navigate to correct locations
✅ Loading states display properly
✅ Errors are handled gracefully
✅ Performance is acceptable (< 2s per page load)
✅ Works on mobile, tablet, and desktop
✅ Accessible via keyboard and screen reader
✅ No console errors or warnings
✅ API returns correct data structure
✅ Edge cases handled (no campaign, suspended, etc.)

## Next Steps After Testing

1. If all tests pass: Mark feature as complete ✅
2. If issues found: Create bug tickets and fix
3. If performance issues: Implement optimizations
4. If UX issues: Iterate on design
5. Document any additional test cases discovered
