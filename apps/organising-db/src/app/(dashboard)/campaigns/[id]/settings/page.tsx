"use client";

import { useParams } from "next/navigation";
import { CampaignSettings } from "@/components/campaigns/campaign-settings";

export default function CampaignSettingsPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return (
      <p className="text-muted-foreground">Invalid campaign id.</p>
    );
  }
  return <CampaignSettings campaignId={campaignId} />;
}
