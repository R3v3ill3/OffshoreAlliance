// WP1.3 — which campaigns are "mine" and which are "my team's", pure.
//
// Source of truth (appendix D §6): `campaign_organisers` rows for my
// organiser_id, union campaigns whose `campaigns.organiser_id` is mine. The
// second arm covers production until WP0.4's backfill has run there (R7).
// The hook (`useMyCampaigns`) fetches; this file decides. It is the seam a
// later shared `my_campaigns` RPC can slot behind (appendix D §10 item 6).

import type { CampaignStatus, CampaignType } from "@/types/organising-row-types";

export interface MyCampaignRow {
  campaign_id: number;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  is_standing: boolean;
  is_sms_episode: boolean;
  start_date: string | null;
  end_date: string | null;
  total_worker_estimate: number | null;
  organiser_id: number | null;
  created_at: string;
  archived_at: string | null;
}

export interface MyCampaignRosterRow {
  campaign_id: number;
  organiser_id: number;
  campaign_role: string;
}

export interface MyCampaignsInput {
  campaigns: readonly MyCampaignRow[];
  rosterRows: readonly MyCampaignRosterRow[];
  myOrganiserId: number | null;
  reportOrganiserIds: readonly number[];
}

export interface MyCampaign extends MyCampaignRow {
  /** The roster row's campaign_role, or null when only the owner column matched (G1). */
  myCampaignRole: string | null;
  /** Organiser ids from my team on this campaign (G2); empty for `mine`. */
  teamOrganiserIds: number[];
}

export interface GroupedMyCampaigns {
  mine: MyCampaign[];
  team: MyCampaign[];
}

/** G6 — `/campaigns` list order: created_at descending, then name. */
function byCreatedDescThenName(a: MyCampaignRow, b: MyCampaignRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.name.localeCompare(b.name);
}

export function groupMyCampaigns(input: MyCampaignsInput): GroupedMyCampaigns {
  const { campaigns, rosterRows, myOrganiserId, reportOrganiserIds } = input;

  // G7 — an unlinked profile has no campaigns, in either group.
  if (myOrganiserId == null) return { mine: [], team: [] };

  const reportIds = new Set(reportOrganiserIds);
  const myRoleByCampaign = new Map<number, string>();
  const teamIdsByCampaign = new Map<number, Set<number>>();

  for (const row of rosterRows) {
    if (row.organiser_id === myOrganiserId) {
      // First roster row wins for the role label (G5 dedupes on campaign_id).
      if (!myRoleByCampaign.has(row.campaign_id)) {
        myRoleByCampaign.set(row.campaign_id, row.campaign_role);
      }
    } else if (reportIds.has(row.organiser_id)) {
      let set = teamIdsByCampaign.get(row.campaign_id);
      if (!set) {
        set = new Set();
        teamIdsByCampaign.set(row.campaign_id, set);
      }
      set.add(row.organiser_id);
    }
  }

  const mine: MyCampaign[] = [];
  const team: MyCampaign[] = [];
  const seen = new Set<number>();

  for (const c of campaigns) {
    // G5 — one entry per campaign_id.
    if (seen.has(c.campaign_id)) continue;
    seen.add(c.campaign_id);

    // G4 — neither container is a campaign anyone organises.
    if (c.is_sms_episode || c.is_standing) continue;

    // G1 — roster row or owner column.
    const isMine = myRoleByCampaign.has(c.campaign_id) || c.organiser_id === myOrganiserId;
    if (isMine) {
      // G3 — mine wins.
      mine.push({
        ...c,
        myCampaignRole: myRoleByCampaign.get(c.campaign_id) ?? null,
        teamOrganiserIds: [],
      });
      continue;
    }

    // G2 — a report's roster row, or a report as the owner.
    const teamIds = new Set(teamIdsByCampaign.get(c.campaign_id) ?? []);
    if (c.organiser_id != null && reportIds.has(c.organiser_id)) teamIds.add(c.organiser_id);
    if (teamIds.size > 0) {
      team.push({
        ...c,
        myCampaignRole: null,
        teamOrganiserIds: [...teamIds].sort((a, b) => a - b),
      });
    }
  }

  // G6 — deterministic order; G8 — archived rows are kept, the card marks them.
  mine.sort(byCreatedDescThenName);
  team.sort(byCreatedDescThenName);
  return { mine, team };
}
