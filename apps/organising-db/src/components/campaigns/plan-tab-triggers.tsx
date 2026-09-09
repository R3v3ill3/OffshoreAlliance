"use client";

/**
 * The two count-badged triggers in the Plan cluster's sub-tab row.
 *
 * Moved verbatim out of campaigns/[id]/page.tsx by WP1.4 so both the page
 * and CampaignTabBar can render them; the markup, the query keys and the
 * badge variant are unchanged.
 */

import { Badge } from "@/components/ui/badge";
import { TabsTrigger } from "@/components/ui/tabs";
import { usePendingReviewCount } from "@/components/campaigns/pending-review-tab";
import { useRoleCheckCount } from "@/components/campaigns/role-check-tab";

// ── Pending Review trigger (Phase 5) ──────────────────────────────────
// Renders the "Pending review" sub-tab inside the Plan cluster with a live
// count badge. The badge uses the same React Query key the tab uses, so the
// count drops to zero immediately after Approve / Merge / Reject mutations
// invalidate the queue.
export function PendingReviewTabTrigger({ campaignId }: { campaignId: number }) {
  const { data: count = 0 } = usePendingReviewCount(campaignId);
  return (
    <TabsTrigger value="pending-review" className="gap-1.5">
      Pending review
      {count > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}

// ── Role Check trigger (post-Phase-6 remediation) ─────────────────────
// Surfaces workers rated 1 (supportive_leader) whose global union role
// is unset / non-leader. Reviewers confirm the role with a single click.
export function RoleCheckTabTrigger({ campaignId }: { campaignId: number }) {
  const { data: count = 0 } = useRoleCheckCount(campaignId);
  return (
    <TabsTrigger value="role-check" className="gap-1.5">
      Role check
      {count > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}
