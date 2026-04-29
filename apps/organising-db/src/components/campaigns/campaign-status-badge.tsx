"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/fetch-api";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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

type BatchResult = Record<
  number,
  {
    exists: boolean;
    campaignId: number | null;
    status: "no_campaign" | "active" | "completed" | "blocked";
    stageNumber: number | null;
    stageName: string | null;
  }
>;

function useBatchCampaignStatus() {
  return useQuery<BatchResult>({
    queryKey: ["campaign-status-batch"],
    queryFn: async () => {
      const res = await fetchApi("/api/campaign-status-batch");
      if (!res.ok) throw new Error("Failed to fetch campaign statuses");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function openInPlanner(campaignId: number) {
  window.location.href = `/campaigns/${campaignId}/plan`;
}

export function CampaignStatusBadge({
  agreementId,
  size = "sm",
  className = "",
}: CampaignStatusBadgeProps) {
  const { data: batchData, isLoading } = useBatchCampaignStatus();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1 ${SIZE_STYLES[size]}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  const status = batchData?.[agreementId];

  if (!status || !status.exists || status.status === "no_campaign") {
    return (
      <Badge
        variant="secondary"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-secondary/80`}
        onClick={() => window.open("/campaigns", "_self")}
        title="No campaign plan - Click to create one"
      >
        No campaign plan
      </Badge>
    );
  }

  if (status.status === "completed") {
    return (
      <Badge
        variant="success"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-green-200 dark:hover:bg-green-900`}
        onClick={() => status.campaignId && openInPlanner(status.campaignId)}
        title="Campaign completed - Click to view details"
      >
        Campaign complete
      </Badge>
    );
  }

  if (status.status === "blocked") {
    return (
      <Badge
        variant="warning"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900`}
        onClick={() => status.campaignId && openInPlanner(status.campaignId)}
        title="Planning blocked - Click to resolve"
      >
        Planning blocked
      </Badge>
    );
  }

  if (
    status.status === "active" &&
    status.stageNumber &&
    status.stageName
  ) {
    return (
      <Badge
        variant="info"
        className={`${SIZE_STYLES[size]} ${className} cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900`}
        onClick={() => status.campaignId && openInPlanner(status.campaignId)}
        title={`Stage ${status.stageNumber}: ${status.stageName} - Click to view campaign`}
      >
        Stage {status.stageNumber}: {status.stageName}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={`${SIZE_STYLES[size]} ${className}`}>
      Unknown
    </Badge>
  );
}
