# Cross-App Deep Links Implementation

## Overview
This implementation enables seamless navigation between the Organising DB and OA Planner applications within the Offshore Alliance Platform.

## Architecture

### Apps
- **Organising DB**: `https://oa.uconstruct.app` (or `http://localhost:3000` locally)
- **OA Planner**: `https://oaplanner.uconstruct.app`

### Shared Infrastructure
- Both apps share Supabase authentication
- Sessions persist across apps
- Context is passed via query parameters

## Components

### 1. ExternalLink Component
Location: `apps/{app}/src/components/shared/external-link.tsx`

A reusable component for cross-app navigation with:
- Visual indication (external link icon)
- Multiple variants (default, button, text)
- Automatic return URL handling
- Configurable target (_blank or _self)

**Props:**
```typescript
interface ExternalLinkProps {
  href: string;                    // Destination URL
  children: React.ReactNode;       // Link content
  className?: string;              // Additional styles
  showIcon?: boolean;              // Show external link icon (default: true)
  variant?: 'default' | 'button' | 'text';
  target?: '_blank' | '_self';     // Link target (default: '_blank')
  includeReturnUrl?: boolean;      // Add return_to parameter (default: true)
}
```

**Usage Examples:**
```tsx
// Button variant
<ExternalLink
  href="https://oaplanner.uconstruct.app/campaigns/123"
  variant="button"
  target="_blank"
>
  View Campaign Plan
</ExternalLink>

// Text variant
<ExternalLink
  href="https://oa.uconstruct.app/agreements/456"
  variant="text"
>
  View Agreement Details
</ExternalLink>

// Default variant
<ExternalLink href="https://example.com">
  External Link
</ExternalLink>
```

### 2. BackButton Component
Location: `apps/{app}/src/components/shared/back-button.tsx`

A smart back button that:
- Checks for `return_to` query parameter
- Stores return URL in sessionStorage
- Navigates back to originating app
- Falls back to default href

**Props:**
```typescript
interface BackButtonProps {
  href?: string;           // Default href
  label?: string;          // Button label (default: "Back")
  fallbackHref?: string;   // Fallback href
}
```

### 3. Utility Functions
Location: `apps/{app}/src/lib/utils/cross-app-links.ts`

#### buildCrossAppUrl()
Creates a URL with return_to parameter:
```typescript
buildCrossAppUrl(
  'https://oaplanner.uconstruct.app',
  '/campaigns/new',
  '/agreements/123' // Current path
)
// Returns: https://oaplanner.uconstruct.app/campaigns/new?return_to=%2Fagreements%2F123
```

#### buildUrlWithContext()
Creates a URL with context parameters:
```typescript
buildUrlWithContext(
  'https://oaplanner.uconstruct.app',
  '/campaigns/new',
  {
    agreement_id: 123,
    employer_id: 456,
    worksite_ids: '789,101'
  }
)
// Returns: https://oaplanner.uconstruct.app/campaigns/new?agreement_id=123&employer_id=456&worksite_ids=789%2C101
```

## Implementation Details

### Organising DB → OA Planner

#### Agreement Detail Page
File: `apps/organising-db/src/app/(dashboard)/agreements/[id]/page.tsx`

**Features:**
- Fetches campaigns linked to the agreement
- Shows "Create Campaign Plan" if no campaign exists
- Shows "View Campaign Plan" if campaign exists
- Passes context: `agreement_id`, `employer_id`

**Code:**
```typescript
const { data: linkedCampaigns = [] } = useQuery({
  queryKey: ["agreement-campaigns", id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("campaign_id, name, status")
      .eq("agreement_id", agreementId);
    if (error) throw error;
    return data ?? [];
  },
  enabled: !!user && agreementIdValid,
});

// In JSX:
{linkedCampaigns.length > 0 ? (
  <ExternalLink
    href={`${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/campaigns/${linkedCampaigns[0].campaign_id}`}
    variant="button"
    target="_blank"
  >
    View Campaign Plan
  </ExternalLink>
) : (
  <ExternalLink
    href={`${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/campaigns/new?agreement_id=${agreement.agreement_id}&employer_id=${agreement.employer_id || ''}`}
    variant="outline"
    target="_blank"
  >
    <Plus className="h-4 w-4" />
    Create Campaign Plan
  </ExternalLink>
)}
```

#### Agreement List Page
File: `apps/organising-db/src/app/(dashboard)/agreements/page.tsx`

**Features:**
- Added "Campaign Plan" column
- Shows "Create" link if no campaign
- Shows "View Plan" link if campaign exists

**Code:**
```typescript
{
  key: "campaign_plan",
  header: "Campaign Plan",
  sortable: false,
  render: (row) => {
    const campaigns = row.campaigns;
    if (!campaigns || campaigns.length === 0) {
      return (
        <ExternalLink
          href={`${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/campaigns/new?agreement_id=${row.agreement_id}`}
          variant="text"
          className="text-xs"
        >
          Create
        </ExternalLink>
      );
    }
    return (
      <ExternalLink
        href={`${process.env.NEXT_PUBLIC_OA_PLANNER_URL}/campaigns/${campaigns[0].campaign_id}`}
        variant="text"
        className="text-xs"
      >
        View Plan
      </ExternalLink>
    );
  },
}
```

### OA Planner → Organising DB

#### Campaign Detail Page
File: `apps/oa-planner/src/app/(app)/campaigns/[id]/page.tsx`

**Features:**
- "View Agreement Details" button (if agreement_id exists)
- "View Employer Details" button (if employer_id exists)
- Both open in new tabs

**Code:**
```typescript
const organisingDbUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://oa.uconstruct.app';

// In JSX:
{(campaign as any).agreement_id && (
  <ExternalLink
    href={`${organisingDbUrl}/agreements/${(campaign as any).agreement_id}`}
    variant="outline"
    target="_blank"
  >
    View Agreement Details
  </ExternalLink>
)}
{(campaign as any).employer_id && (
  <ExternalLink
    href={`${organisingDbUrl}/employers/${(campaign as any).employer_id}`}
    variant="outline"
    target="_blank"
  >
    View Employer Details
  </ExternalLink>
)}
```

## Environment Configuration

### Environment Variables

#### Organising DB (.env.local / .env.example)
```bash
# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ORGANISING_DB_URL=http://localhost:3000
NEXT_PUBLIC_OA_PLANNER_URL=https://oaplanner.uconstruct.app
```

#### OA Planner (.env.local / .env.example)
```bash
# App URLs
NEXT_PUBLIC_SITE_URL=https://oa.uconstruct.app
NEXT_PUBLIC_OA_PLANNER_URL=https://oaplanner.uconstruct.app
NEXT_PUBLIC_ORGANISING_DB_URL=https://oa.uconstruct.app
```

## Return URL Handling

### Flow
1. User navigates from App A to App B
2. ExternalLink component adds `return_to` query parameter with current path
3. App B receives the return_to parameter
4. BackButton component stores return_to in sessionStorage
5. When user clicks back, navigates to stored URL

### Implementation
```typescript
// In ExternalLink component
const fullHref = React.useMemo(() => {
  if (!includeReturnUrl || target === '_self') return href;

  try {
    const url = new URL(href);
    url.searchParams.set('return_to', pathname);
    return url.toString();
  } catch {
    return href;
  }
}, [href, includeReturnUrl, pathname, target]);

// In BackButton component
React.useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('return_to');

  if (returnTo) {
    sessionStorage.setItem('cross_app_return_url', returnTo);
  }
}, []);

const handleClick = () => {
  const storedReturnUrl = sessionStorage.getItem('cross_app_return_url');

  if (storedReturnUrl) {
    sessionStorage.removeItem('cross_app_return_url');
    window.location.href = storedReturnUrl;
  } else if (href) {
    router.push(href);
  }
};
```

## Database Relationships

### Campaigns Table
```sql
CREATE TABLE campaigns (
  campaign_id SERIAL PRIMARY KEY,
  agreement_id INTEGER REFERENCES agreements(agreement_id),
  employer_id INTEGER REFERENCES employers(employer_id),
  name TEXT NOT NULL,
  status TEXT,
  -- ... other fields
);
```

### Query for Campaigns in Organising DB
```typescript
const { data } = await supabase
  .from("campaigns")
  .select("campaign_id, name, status")
  .eq("agreement_id", agreementId);
```

## Styling

### Visual Indicators
- External links show an external link icon
- Buttons use primary/outline variants
- Links open in new tabs (target="_blank")
- Hover effects for better UX

### Consistency
- Both apps use identical ExternalLink component
- Same variants and styling options
- Consistent icon usage

## Testing

### Test Cases
1. **Create Campaign Plan**
   - Navigate to agreement detail page in Organising DB
   - Click "Create Campaign Plan"
   - Verify OA Planner opens with correct context
   - Verify agreement_id and employer_id are passed

2. **View Campaign Plan**
   - Navigate to agreement with existing campaign
   - Click "View Campaign Plan"
   - Verify correct campaign opens in OA Planner

3. **Return to Organising DB**
   - From OA Planner campaign page, click "View Agreement Details"
   - Verify Organising DB opens in new tab
   - Verify correct agreement is displayed

4. **Return URL Flow**
   - Navigate from Organising DB to OA Planner
   - Use BackButton or browser back
   - Verify return to original location

## Future Enhancements

### Potential Improvements
1. **Worksite Links**: Add links to individual worksites from campaigns
2. **Context Preservation**: Maintain more context across navigation
3. **In-App Navigation**: Option to open in same tab vs new tab
4. **Breadcrumbs**: Show cross-app breadcrumb trail
5. **Analytics**: Track cross-app navigation patterns

### Additional Context Parameters
```typescript
interface ContextParams {
  agreement_id?: number;
  employer_id?: number;
  worksite_ids?: string;  // Comma-separated list
  campaign_id?: number;
  return_to?: string;      // Return path
}
```

## Troubleshooting

### Common Issues

#### 1. Environment Variables Not Loading
- Ensure `.env.local` files are in correct app directories
- Restart dev server after adding variables
- Check for typos in variable names

#### 2. Return URL Not Working
- Ensure `includeReturnUrl` prop is true
- Check that pathname is available (use client component)
- Verify sessionStorage is enabled in browser

#### 3. Links Not Opening
- Check URL construction
- Verify environment variables are set
- Ensure target app is running/accessible

#### 4. Auth Not Persisting
- Verify both apps use same Supabase project
- Check cookie domain settings
- Ensure auth tokens are shared

## Files Created/Modified

### Created Files
1. `apps/organising-db/src/components/shared/external-link.tsx`
2. `apps/organising-db/src/components/shared/back-button.tsx`
3. `apps/organising-db/src/lib/utils/cross-app-links.ts`
4. `apps/organising-db/.env.example`
5. `apps/oa-planner/src/components/shared/external-link.tsx`
6. `apps/oa-planner/src/components/shared/back-button.tsx`
7. `apps/oa-planner/src/lib/utils/cross-app-links.ts`
8. `apps/oa-planner/.env.example`

### Modified Files
1. `apps/organising-db/src/app/(dashboard)/agreements/[id]/page.tsx`
2. `apps/organising-db/src/app/(dashboard)/agreements/page.tsx`
3. `apps/oa-planner/src/app/(app)/campaigns/[id]/page.tsx`
4. `apps/organising-db/.env.local`
5. `apps/oa-planner/.env.local`

## Summary

This implementation provides a robust cross-app navigation system that:
- ✅ Links Organising DB agreements to OA Planner campaigns
- ✅ Links OA Planner campaigns back to Organising DB
- ✅ Passes context via query parameters
- ✅ Handles return URLs for seamless navigation
- ✅ Provides visual indicators for external links
- ✅ Supports multiple styling variants
- ✅ Uses environment configuration for flexibility
- ✅ Maintains Supabase auth across apps
- ✅ Creates utility functions for reusable URL building

The system is extensible and can be enhanced with additional context parameters, more sophisticated return handling, and expanded cross-app workflows.
