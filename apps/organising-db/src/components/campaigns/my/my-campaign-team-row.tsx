"use client";

// WP1.3 — a lead's "My team's campaigns" row.
//
// Compact on purpose (risk R1): a lead with eight reports can have 40+ team
// campaigns, and pulling every membership row for them would dominate the
// ten-second budget for a secondary row. Name, pills, last activity and the
// link only — no stats queries. Capped at 12 rows; `/campaigns` has the
// organiser filter for the rest.

import Link from "next/link";
import type { CampaignLastActivity } from "@/lib/hooks/useMyCampaigns";
import type { MyCampaign } from "@/lib/campaign/my-campaigns";
import { campaignChartHref } from "@/lib/workspace/landing";
import { CampaignPills, LastActivityLine, OPEN_WALL_CHART_LABEL } from "./my-campaign-card";

export const MAX_TEAM_ROWS = 12;

export function MyCampaignTeamRow({
  campaigns,
  reportNamesByOrganiserId,
  lastActivityById,
  lastActivityLoading,
  now,
}: {
  campaigns: readonly MyCampaign[];
  reportNamesByOrganiserId: ReadonlyMap<number, string>;
  lastActivityById: ReadonlyMap<number, CampaignLastActivity> | undefined;
  lastActivityLoading: boolean;
  now: number;
}) {
  if (campaigns.length === 0) return null;
  const shown = campaigns.slice(0, MAX_TEAM_ROWS);
  const hidden = campaigns.length - shown.length;

  return (
    <section aria-labelledby="my-team-campaigns-heading" className="space-y-3">
      <h2 id="my-team-campaigns-heading" className="text-lg font-semibold">
        My team&apos;s campaigns
      </h2>
      <ul className="divide-y rounded-xl border bg-card">
        {shown.map((c) => {
          const names = c.teamOrganiserIds
            .map((id) => reportNamesByOrganiserId.get(id)?.trim())
            .filter((n): n is string => !!n);
          return (
            <li key={c.campaign_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{c.name}</span>
                  <CampaignPills campaign={c} />
                </div>
                {names.length > 0 && (
                  <div className="text-xs text-muted-foreground">{names.join(", ")}</div>
                )}
              </div>
              <LastActivityLine activity={lastActivityById?.get(c.campaign_id)} loading={lastActivityLoading} now={now} />
              <Link
                href={campaignChartHref(c.campaign_id)}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {OPEN_WALL_CHART_LABEL}
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          {hidden} more not shown.{" "}
          <Link href="/campaigns" className="font-medium text-primary underline-offset-4 hover:underline">
            See all campaigns
          </Link>
        </p>
      )}
    </section>
  );
}
