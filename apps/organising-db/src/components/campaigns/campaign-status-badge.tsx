"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

/**
 * Campaign Status Badge
 *
 * Displays the planning status of a campaign linked to an agreement.
 *
 * States:
 * 1. "No campaign plan" - grey badge - No campaign found for this agreement
 * 2. "Stage X: [Stage Name]" - blue badge - Active stage in campaign plan
 * 3. "Campaign complete" - green badge - Campaign marked as completed
 * 4. "Planning blocked" - amber badge - No active stage plan, or all gates failed
 *
 * @param agreementId - The agreement ID to fetch campaign status for
 * @param size - 'sm' for compact list view, 'lg' for detail page
 */

export interface CampaignStatus {
  exists: boolean;
  campaignId: number | null;
  status: "no_campaign" | "active" | "completed" | "blocked";
  stageNumber: number | null;
  stageName: string | null;
  isLoading: boolean;
}

interface CampaignStatusBadgeProps {
  agreementId: number;
  size?: "sm" | "lg";
  className?: string;
}

const SIZE_STYLES = {
  sm: "text-xs px-2 py-0.5",
  lg: "text-sm px-3 py-1",
};

export function CampaignStatusBadge({
  agreementId,
  size = "sm",
  className = "",
}: CampaignStatusBadgeProps) {
  const router = useRouter();

  // Client-side query to get the campaign status
  // NOTE: In production with large lists, consider:
  // - Server-side rendering with batch queries
  // - Caching layer to avoid N+1 queries
  // - WebSocket/polling for real-time updates
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>({
    exists: false,
    campaignId: null,
    status: "no_campaign",
    stageNumber: null,
    stageName: null,
    isLoading: true,
  });

  useEffect(() => {
    async function fetchCampaignStatus() {
      try {
        const response = await fetch(
          `/api/agreements/${agreementId}/campaign-status`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch campaign status");
        }
        const data = await response.json();
        setCampaignStatus({
          ...data,
          isLoading: false,
        });
      } catch (error) {
        console.error("Error fetching campaign status:", error);
        setCampaignStatus({
          exists: false,
          campaignId: null,
          status: "no_campaign",
          stageNumber: null,
          stageName: null,
          isLoading: false,
        });
      }
    }

    fetchCampaignStatus();
  }, [agreementId]);

  if (campaignStatus.isLoading) {
    return (
      <div className={`flex items-center gap-1 ${SIZE_STYLES[size]}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  // No campaign plan
  if (!campaignStatus.exists || campaignStatus.status === "no_campaign") {
    return (
      <Badge
        variant="secondary"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-secondary/80`}
        onClick={() => router.push("/campaigns")}
        title="No campaign plan - Click to create one"
      >
        No campaign plan
      </Badge>
    );
  }

  // Campaign complete
  if (campaignStatus.status === "completed") {
    return (
      <Badge
        variant="success"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-green-200 dark:hover:bg-green-900`}
        onClick={() =>
          campaignStatus.campaignId &&
          router.push(`/oa-planner/campaigns/${campaignStatus.campaignId}`)
        }
        title="Campaign completed - Click to view details"
      >
        Campaign complete
      </Badge>
    );
  }

  // Planning blocked
  // Definition: No active stage plan exists, campaign is in planning/active state
  // This could mean:
  // - No stage plans have been created yet
  // - All stage plans are completed but campaign isn't marked complete
  // - Gates have failed and blocked progress
  if (campaignStatus.status === "blocked") {
    return (
      <Badge
        variant="warning"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900`}
        onClick={() =>
          campaignStatus.campaignId &&
          router.push(`/oa-planner/campaigns/${campaignStatus.campaignId}`)
        }
        title="Planning blocked - Click to resolve"
      >
        Planning blocked
      </Badge>
    );
  }

  // Active stage
  if (
    campaignStatus.status === "active" &&
    campaignStatus.stageNumber &&
    campaignStatus.stageName
  ) {
    return (
      <Badge
        variant="info"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900`}
        onClick={() =>
          campaignStatus.campaignId &&
          router.push(`/oa-planner/campaigns/${campaignStatus.campaignId}`)
        }
        title={`Stage ${campaignStatus.stageNumber}: ${campaignStatus.stageName} - Click to view campaign`}
      >
        Stage {campaignStatus.stageNumber}: {campaignStatus.stageName}
      </Badge>
    );
  }

  // Fallback - should not reach here
  return (
    <Badge variant="secondary" className={`${SIZE_STYLES[size]} ${className}`}>
      Unknown
    </Badge>
  );
}
