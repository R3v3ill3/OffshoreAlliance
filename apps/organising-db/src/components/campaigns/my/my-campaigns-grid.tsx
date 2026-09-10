"use client";

// WP1.3 — the cards grid, its skeleton and its empty state.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CampaignAggStats } from "@/lib/hooks/useCampaignsAllStats";
import type { CampaignLastActivity } from "@/lib/hooks/useMyCampaigns";
import type { MyCampaign } from "@/lib/campaign/my-campaigns";
import { MyCampaignCard, MyCampaignCardSkeleton } from "./my-campaign-card";

const SKELETON_COUNT = 3;

export function MyCampaignsGrid({
  campaigns,
  loading,
  statsMap,
  statsLoading,
  lastActivityById,
  lastActivityLoading,
  now,
  canWrite,
  onNewCampaign,
}: {
  campaigns: readonly MyCampaign[];
  loading: boolean;
  statsMap: ReadonlyMap<number, CampaignAggStats>;
  statsLoading: boolean;
  lastActivityById: ReadonlyMap<number, CampaignLastActivity> | undefined;
  lastActivityLoading: boolean;
  now: number;
  canWrite: boolean;
  onNewCampaign: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <MyCampaignCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">You are not on any campaign yet.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {canWrite && (
            <Button type="button" onClick={onNewCampaign}>
              New campaign
            </Button>
          )}
          <Link href="/campaigns" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            See all campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {campaigns.map((c) => (
        <MyCampaignCard
          key={c.campaign_id}
          campaign={c}
          stats={statsMap.get(c.campaign_id)}
          statsLoading={statsLoading}
          lastActivity={lastActivityById?.get(c.campaign_id)}
          lastActivityLoading={lastActivityLoading}
          now={now}
        />
      ))}
    </div>
  );
}
