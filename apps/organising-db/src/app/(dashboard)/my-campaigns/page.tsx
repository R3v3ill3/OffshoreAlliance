"use client";

// WP1.3 — My campaigns.
//
// Cards for the campaigns the signed-in organiser is on, a lead's compact
// team row, the Needs attention list and one New campaign button. No <h1>:
// `Header` supplies "My campaigns" from `pageTitles`. Every decision is in
// a pure, tested module; this file wires hooks to components.
//
// The single-campaign auto-open fires only on the hop from the landing gate
// (`?from=landing`, L4) and only once the campaigns query has resolved, so
// it never fires against an empty list and the sidebar link always shows
// the page. The param is replaced away either way, so a refresh cannot
// re-fire it.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/campaigns/create-campaign-dialog";
import { MyCampaignsGrid } from "@/components/campaigns/my/my-campaigns-grid";
import { MAX_TEAM_ROWS, MyCampaignTeamRow } from "@/components/campaigns/my/my-campaign-team-row";
import { NeedsAttentionList, RoleCheckProbe } from "@/components/campaigns/my/needs-attention-list";
import { useAuth } from "@/lib/supabase/auth-context";
import { useCampaignsAllStats } from "@/lib/hooks/useCampaignsAllStats";
import {
  useCampaignLastActivity,
  useMyCampaigns,
  useNeedsAttentionSources,
} from "@/lib/hooks/useMyCampaigns";
import { buildNeedsAttention } from "@/lib/campaign/needs-attention";
import {
  LANDING_PARAM,
  LANDING_PARAM_VALUE,
  MY_CAMPAIGNS_PATH,
  campaignChartHref,
  shouldAutoOpenSingleCampaign,
} from "@/lib/workspace/landing";

function MyCampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, canWrite, isLeadOrganiser, loading: authLoading } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { mine, team, resolved, isLoading, error, myOrganiserId, reportNamesByOrganiserId } =
    useMyCampaigns();

  const mineIds = useMemo(() => mine.map((c) => c.campaign_id), [mine]);
  // Last activity is shown on my cards and on the team rows that render —
  // the team row caps itself at MAX_TEAM_ROWS, so the RPC asks for no more.
  const lastActivityIds = useMemo(
    () => [...mineIds, ...team.slice(0, MAX_TEAM_ROWS).map((c) => c.campaign_id)],
    [mineIds, team]
  );

  // Four batched queries, scoped to my cards only (§2.3.1). `/campaigns`'s
  // unfiltered keys are untouched.
  const { statsMap, isLoading: statsLoading } = useCampaignsAllStats([], { campaignIds: mineIds });
  const lastActivity = useCampaignLastActivity(lastActivityIds);
  // One clock for every "Last activity" line: the moment the rows arrived
  // (0 until then, when every line is a skeleton or "No activity yet" anyway).
  const now = lastActivity.dataUpdatedAt;
  const sources = useNeedsAttentionSources(mineIds);

  // Role-check counts arrive from the deferred probes, one campaign at a time.
  const [roleCheckCounts, setRoleCheckCounts] = useState<ReadonlyMap<number, number>>(
    () => new Map()
  );
  const onRoleCheckCount = useCallback((campaignId: number, count: number) => {
    setRoleCheckCounts((prev) => {
      if (prev.get(campaignId) === count) return prev;
      const next = new Map(prev);
      next.set(campaignId, count);
      return next;
    });
  }, []);

  const needsAttention = useMemo(
    () =>
      buildNeedsAttention({
        campaigns: mine,
        pendingReview: sources.pendingReview,
        roleCheckCounts,
        phoneActions: sources.phoneActions,
        emailDrafts: sources.emailDrafts,
      }),
    [mine, sources.pendingReview, sources.phoneActions, sources.emailDrafts, roleCheckCounts]
  );

  // Auto-open (L4), then strip the landing param so a refresh does not re-fire.
  const fromLanding = searchParams.get(LANDING_PARAM) === LANDING_PARAM_VALUE;
  const landingHandled = useRef(false);
  useEffect(() => {
    if (!fromLanding || !resolved || landingHandled.current) return;
    landingHandled.current = true;
    const id = shouldAutoOpenSingleCampaign({ fromLanding, campaignIds: mineIds });
    router.replace(id != null ? campaignChartHref(id) : MY_CAMPAIGNS_PATH);
  }, [fromLanding, resolved, mineIds, router]);

  const notLinked = !authLoading && profile != null && myOrganiserId == null;
  const showTeam = isLeadOrganiser && team.length > 0;

  return (
    <div className="space-y-8">
      {canWrite && <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />}

      {/* "See all campaigns" is here on every render, not only in the empty
          state: in organiser mode the sidebar has no Campaigns row, so this
          link is the one-click path to the portfolio list that
          `nav-reachability.test.ts` records for decision 7. */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Link href="/campaigns" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          See all campaigns
        </Link>
        {canWrite && (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New campaign
          </Button>
        )}
      </div>

      {notLinked && (
        <p className="text-xs text-muted-foreground">
          Your account is not linked to an organiser record yet, so the list is not scoped to you by
          default. Use Administration to link your profile, or filter manually when campaigns exist.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load your campaigns: {error.message}
        </p>
      )}

      <MyCampaignsGrid
        campaigns={mine}
        loading={isLoading}
        statsMap={statsMap}
        statsLoading={statsLoading}
        lastActivityById={lastActivity.data}
        lastActivityLoading={lastActivity.isLoading}
        now={now}
        canWrite={canWrite}
        onNewCampaign={() => setCreateOpen(true)}
      />

      {showTeam && (
        <MyCampaignTeamRow
          campaigns={team}
          reportNamesByOrganiserId={reportNamesByOrganiserId}
          lastActivityById={lastActivity.data}
          lastActivityLoading={lastActivity.isLoading}
          now={now}
        />
      )}

      <NeedsAttentionList items={needsAttention} />

      {resolved && mineIds.length > 0 && (
        <RoleCheckProbe campaignIds={mineIds} onCount={onRoleCheckCount} />
      )}
    </div>
  );
}

export default function MyCampaignsRoutePage() {
  // `useSearchParams()` needs a Suspense boundary for the static build.
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      }
    >
      <MyCampaignsPage />
    </Suspense>
  );
}
