"use client";

// WP1.3 — one My campaigns card.
//
// Every number is one `useCampaignsAllStats` already computes for the
// `/campaigns` stat cards (People = namedWorkers, In a unit = workersInAnyOu,
// Rated = r1+r2+r3+r4, Leaders = leadershipTotal); the bar is the wall
// chart's own `CompactRatingsBar`. Nothing here recomputes a count, so the
// card and the portfolio page can never disagree.

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompactRatingsBar } from "@/components/campaigns/wall-chart/unit-summary-metrics";
import { STATUS_VARIANT, TYPE_VARIANT } from "@/components/campaigns/campaign-badge-variants";
import type { CampaignAggStats } from "@/lib/hooks/useCampaignsAllStats";
import type { CampaignLastActivity } from "@/lib/hooks/useMyCampaigns";
import type { MyCampaign } from "@/lib/campaign/my-campaigns";
import {
  formatLastActivity,
  ratedCount,
  ratingBarTotal,
  toRatingBarBuckets,
} from "@/lib/campaign/my-campaign-metrics";
import { campaignChartHref } from "@/lib/workspace/landing";

export const OPEN_WALL_CHART_LABEL = "Open wall chart";

export function CampaignPills({ campaign }: { campaign: Pick<MyCampaign, "campaign_type" | "status" | "archived_at"> }) {
  return (
    <>
      <Badge variant={TYPE_VARIANT[campaign.campaign_type]}>{campaign.campaign_type}</Badge>
      <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
      {campaign.archived_at && (
        <Badge variant="outline" className="text-muted-foreground">
          Archived
        </Badge>
      )}
    </>
  );
}

export function LastActivityLine({
  activity,
  loading,
  now,
}: {
  activity: CampaignLastActivity | undefined;
  loading: boolean;
  now: number;
}) {
  if (loading && activity === undefined) {
    return <Skeleton className="h-3.5 w-28" aria-hidden="true" />;
  }
  return (
    <span className="text-xs text-muted-foreground">
      Last activity: {formatLastActivity(activity?.at ?? null, activity?.kind ?? null, now)}
    </span>
  );
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-semibold tabular-nums leading-tight">
        {loading ? <Skeleton className="h-6 w-8" aria-hidden="true" /> : value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function MyCampaignCard({
  campaign,
  stats,
  statsLoading,
  lastActivity,
  lastActivityLoading,
  now,
}: {
  campaign: MyCampaign;
  /** Undefined until the batched stats land, or when the campaign has no rows in any source. */
  stats: CampaignAggStats | undefined;
  statsLoading: boolean;
  lastActivity: CampaignLastActivity | undefined;
  lastActivityLoading: boolean;
  now: number;
}) {
  const showSkeleton = statsLoading && stats === undefined;
  const people = stats?.namedWorkers ?? 0;
  const inUnit = stats?.workersInAnyOu ?? 0;
  const rated = stats ? ratedCount(stats.ratings) : 0;
  const leaders = stats?.leadershipTotal ?? 0;
  const barTotal = stats ? ratingBarTotal(stats) : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2 pb-3">
        <CardTitle className="text-base leading-snug">{campaign.name}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <CampaignPills campaign={campaign} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="People" value={people} loading={showSkeleton} />
          <Stat label="In a unit" value={inUnit} loading={showSkeleton} />
          <Stat label="Rated" value={rated} loading={showSkeleton} />
          <Stat label="Leaders" value={leaders} loading={showSkeleton} />
        </div>
        {/* M3: with nobody named the bar returns null, so keep a hairline so
            the layout does not collapse. */}
        {stats && barTotal > 0 ? (
          <CompactRatingsBar buckets={toRatingBarBuckets(stats.ratings)} total={barTotal} />
        ) : (
          <div className="h-[6px] w-full rounded bg-muted" aria-hidden="true" />
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <LastActivityLine activity={lastActivity} loading={lastActivityLoading} now={now} />
          <Link
            href={campaignChartHref(campaign.campaign_id)}
            className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {OPEN_WALL_CHART_LABEL}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyCampaignCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="space-y-2 pb-3">
        <Skeleton className="h-5 w-2/3" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-14" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-6 w-8" />
              <Skeleton className="mt-1 h-3 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[6px] w-full" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
