# Quick Start: Workload Dashboard

## 🚀 Get Started in 3 Steps

### Step 1: Run the Migration
```bash
cd /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance
npx supabase db push
```

### Step 2: Start the Dev Server
```bash
cd apps/organising-db
npm run dev
```

### Step 3: Access the Dashboard
- **Main Dashboard**: http://localhost:3000/dashboard
- **Workload Page**: http://localhost:3000/workload

## 📊 What You'll See

### 4 Key Metrics Displayed:

1. **Campaigns by Stage** - Bar chart showing campaign distribution
2. **Progress Towards Ambitions** - Progress bars with percentages
3. **Worksites/Employers/Workers** - Entity counts per campaign
4. **Activities Underway** - Active actions, assessments, and stage plans

### Visual Indicators:
- 🔴 **Red** = Overdue items
- 🟡 **Amber** = Due within 7 days
- 🟢 **Green** = On track

## 🎯 Features

### Filters
- **Organiser**: Me Only / My Team
- **Status**: All / Active / Planning / Paused / Completed
- **Time Period**: All Time / Last 30 Days / Last 90 Days / Last Year

### Drill-Down
- Click any campaign card → View full campaign details
- Maintains filter context when navigating

## 📁 Files Created

### Database (1 file)
- `supabase/migrations/20260402190000_workload_dashboard_views.sql`

### API (1 file)
- `apps/organising-db/src/app/api/workload/route.ts`

### Components (7 files)
- `apps/organising-db/src/components/dashboard/campaigns-by-stage-chart.tsx`
- `apps/organising-db/src/components/dashboard/campaign-progress-card.tsx`
- `apps/organising-db/src/components/dashboard/campaign-entities-card.tsx`
- `apps/organising-db/src/components/dashboard/campaign-activities-card.tsx`
- `apps/organising-db/src/components/dashboard/workload-filters.tsx`
- `apps/organising-db/src/components/dashboard/workload-summary-stats.tsx`
- `apps/organising-db/src/components/ui/progress.tsx`

### Pages (2 files)
- `apps/organising-db/src/app/(dashboard)/workload/page.tsx` (NEW)
- `apps/organising-db/src/app/(dashboard)/dashboard/page.tsx` (MODIFIED)
- `apps/organising-db/src/components/layout/sidebar.tsx` (MODIFIED)

## 🔍 Troubleshooting

### Dashboard shows no data?
Check you have campaigns:
```sql
SELECT COUNT(*) FROM campaigns WHERE status IN ('active', 'progress');
```

### Progress shows 0%?
Check gate criteria exist:
```sql
SELECT * FROM gate_criteria_with_status;
```

### API returns 401?
Make sure you're logged in to the app.

## 📚 Full Documentation
See `WORKLOAD_DASHBOARD_README.md` for complete details.

## ✅ Testing Checklist

- [ ] Dashboard loads at `/dashboard`
- [ ] Workload page loads at `/workload`
- [ ] Filters work and update data
- [ ] Charts render correctly
- [ ] Progress bars show percentages
- [ ] Entity counts display
- [ ] Activity counts are accurate
- [ ] Click campaign → navigates to detail
- [ ] Visual indicators (red/amber/green) work
- [ ] Sidebar link navigates to workload page

---

**Ready to organize! 🎉**
