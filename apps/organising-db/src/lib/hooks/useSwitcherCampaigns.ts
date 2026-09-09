"use client";

/**
 * useSwitcherCampaigns — WP1.4.
 *
 * The campaign switcher's list, recency-sorted. One seam, so the switcher
 * and the My campaigns home can never disagree about what "my campaigns"
 * means: this delegates to WP1.3's `useMyCampaigns()` (whose pure
 * `groupMyCampaigns` already drops SMS-episode and standing containers) and
 * takes `mine` then `team`.
 *
 * Recency is real recency of work on the campaign — the latest rating,
 * call, SMS or list fire — from WP1.3's `campaign_last_activity(integer[])`
 * RPC, one round trip for the whole list. Nulls sort last and ties break on
 * `created_at` descending, which is the order `/campaigns` uses.
 *
 * Explicitly not used: `campaigns.updated_at`, which moves only when the
 * campaign row itself is written, so a campaign edited once in March would
 * outrank one worked daily; and localStorage, which the standing rules
 * forbid for view state. True per-user "last opened" recency needs
 * `user_campaign_prefs`, which is WP2.1's.
 *
 * Cost: no query of its own, and the hook is only ever mounted in organiser
 * mode (the header renders the switcher nowhere else). Both underlying
 * queries are `staleTime: 60_000` and their React Query keys are shared with
 * /my-campaigns, so opening a campaign after visiting that page costs
 * nothing at all.
 */

import { useMemo } from "react";
import {
  useCampaignLastActivity,
  useMyCampaigns,
} from "@/lib/hooks/useMyCampaigns";
import type { CampaignStatus, CampaignType } from "@/types/organising-row-types";

export interface SwitcherCampaign {
  campaign_id: number;
  name: string;
  status: CampaignStatus;
  campaign_type: CampaignType;
  /** True for a campaign of one of my reports rather than one of mine. */
  isTeam: boolean;
}

export interface UseSwitcherCampaignsResult {
  data: SwitcherCampaign[];
  isLoading: boolean;
}

export function useSwitcherCampaigns(): UseSwitcherCampaignsResult {
  const { mine, team, isLoading } = useMyCampaigns();

  const rows = useMemo(
    () => [
      ...mine.map((c) => ({ ...c, isTeam: false })),
      ...team.map((c) => ({ ...c, isTeam: true })),
    ],
    [mine, team]
  );

  const ids = useMemo(() => rows.map((c) => c.campaign_id), [rows]);
  const { data: activity } = useCampaignLastActivity(ids);

  const data = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aAt = activity?.get(a.campaign_id)?.at ?? null;
      const bAt = activity?.get(b.campaign_id)?.at ?? null;
      // Nulls last: a campaign nobody has worked yet is not "most recent".
      if (aAt !== bAt) {
        if (aAt == null) return 1;
        if (bAt == null) return -1;
        return aAt < bAt ? 1 : -1;
      }
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map(
      (c): SwitcherCampaign => ({
        campaign_id: c.campaign_id,
        name: c.name,
        status: c.status,
        campaign_type: c.campaign_type,
        isTeam: c.isTeam,
      })
    );
  }, [rows, activity]);

  return { data, isLoading };
}
