#!/bin/bash

# Test script for Workload Dashboard
# This script helps verify the implementation is working correctly

echo "🔍 Workload Dashboard Test Script"
echo "=================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File exists: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} File missing: $1"
        ((FAILED++))
        return 1
    fi
}

# Function to check if a directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Directory exists: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Directory missing: $1"
        ((FAILED++))
        return 1
    fi
}

echo "📁 Checking file structure..."
echo "----------------------------"

# Check database migration
check_file "supabase/migrations/20260402190000_workload_dashboard_views.sql"

# Check API route
check_file "apps/organising-db/src/app/api/workload/route.ts"

# Check components
check_file "apps/organising-db/src/components/dashboard/campaigns-by-stage-chart.tsx"
check_file "apps/organising-db/src/components/dashboard/campaign-progress-card.tsx"
check_file "apps/organising-db/src/components/dashboard/campaign-entities-card.tsx"
check_file "apps/organising-db/src/components/dashboard/campaign-activities-card.tsx"
check_file "apps/organising-db/src/components/dashboard/workload-filters.tsx"
check_file "apps/organising-db/src/components/dashboard/workload-summary-stats.tsx"
check_file "apps/organising-db/src/components/ui/progress.tsx"

# Check pages
check_file "apps/organising-db/src/app/(dashboard)/workload/page.tsx"

# Check modified files
check_file "apps/organising-db/src/app/(dashboard)/dashboard/page.tsx"
check_file "apps/organising-db/src/components/layout/sidebar.tsx"

echo ""
echo "📊 Checking file contents..."
echo "----------------------------"

# Check if migration file contains the views
if grep -q "workload_dashboard_summary" "supabase/migrations/20260402190000_workload_dashboard_views.sql" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Migration contains workload_dashboard_summary view"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Migration missing workload_dashboard_summary view"
    ((FAILED++))
fi

# Check if API route exists
if grep -q "get_workload_dashboard_data" "apps/organising-db/src/app/api/workload/route.ts" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} API route calls get_workload_dashboard_data function"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} API route missing get_workload_dashboard_data call"
    ((FAILED++))
fi

# Check if workload page exists
if grep -q "WorkloadDashboardPage" "apps/organising-db/src/app/(dashboard)/workload/page.tsx" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Workload page component exists"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Workload page component missing"
    ((FAILED++))
fi

# Check if main dashboard includes workload section
if grep -q "WorkloadFilters" "apps/organising-db/src/app/(dashboard)/dashboard/page.tsx" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Main dashboard includes workload section"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Main dashboard missing workload section"
    ((FAILED++))
fi

# Check if sidebar has workload link
if grep -q 'href: "/workload"' "apps/organising-db/src/components/layout/sidebar.tsx" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Sidebar includes workload link"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Sidebar missing workload link"
    ((FAILED++))
fi

echo ""
echo "📦 Checking dependencies..."
echo "----------------------------"

# Check if recharts is installed
if grep -q '"recharts"' "apps/organising-db/package.json" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Recharts is installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Recharts may not be installed (run: npm install)"
fi

# Check if @radix-ui/react-progress is installed
if grep -q '"@radix-ui/react-progress"' "apps/organising-db/package.json" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Radix Progress is installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Radix Progress may not be installed (run: npm install)"
fi

echo ""
echo "📈 Test Results Summary"
echo "======================"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "1. Run the database migration:"
    echo "   npx supabase db push"
    echo ""
    echo "2. Start the development server:"
    echo "   cd apps/organising-db && npm run dev"
    echo ""
    echo "3. Navigate to:"
    echo "   - Main dashboard: http://localhost:3000/dashboard"
    echo "   - Workload page: http://localhost:3000/workload"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the errors above.${NC}"
    echo ""
    echo "📚 See WORKLOAD_DASHBOARD_README.md for detailed instructions"
    exit 1
fi
