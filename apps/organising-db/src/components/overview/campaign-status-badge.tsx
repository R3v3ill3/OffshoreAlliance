"use client";

import { Badge } from "@/components/ui/badge";
import { Megaphone, CalendarOff } from "lucide-react";

export interface CampaignWithStages {
  campaign_id: number;
  name: string;
  status: string;
  campaign_employers: { employer_id: number }[];
  campaign_stage_plans: { stage_number: number; status: string }[];
}

interface CampaignStatusBadgeProps {
  employerIds: number[];
  campaigns: CampaignWithStages[];
}

export function getCampaignStatusForEmployers(
  employerIds: number[],
  campaigns: CampaignWithStages[]
): { campaign: CampaignWithStages; activeStage: number | null } | null {
  if (!employerIds.length) return null;

  const empSet = new Set(employerIds);

  // Find campaigns that include any of these employers
  const matched = campaigns.filter((c) =>
    c.campaign_employers.some((ce) => empSet.has(ce.employer_id))
  );

  if (!matched.length) return null;

  // Prefer campaigns with an active stage plan; fall back to any campaign
  for (const campaign of matched) {
    const activeStages = campaign.campaign_stage_plans
      .filter((sp) => sp.status === "active")
      .map((sp) => sp.stage_number);

    if (activeStages.length > 0) {
      return {
        campaign,
        activeStage: Math.max(...activeStages),
      };
    }
  }

  // No active stage — return first matched campaign as "unplanned"
  return { campaign: matched[0], activeStage: null };
}

export function CampaignStatusBadge({
  employerIds,
  campaigns,
}: CampaignStatusBadgeProps) {
  const result = getCampaignStatusForEmployers(employerIds, campaigns);

  if (!result) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CalendarOff className="h-3 w-3" />
        Unplanned
      </Badge>
    );
  }

  const { campaign, activeStage } = result;

  if (activeStage !== null) {
    return (
      <Badge variant="default" className="gap-1">
        <Megaphone className="h-3 w-3" />
        {campaign.name} — Stage {activeStage}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Megaphone className="h-3 w-3" />
      {campaign.name}
    </Badge>
  );
}
