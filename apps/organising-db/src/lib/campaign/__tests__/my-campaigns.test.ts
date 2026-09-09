import { describe, expect, it } from "vitest";
import { groupMyCampaigns, type MyCampaignRow, type MyCampaignRosterRow } from "../my-campaigns";

function campaign(overrides: Partial<MyCampaignRow> & { campaign_id: number }): MyCampaignRow {
  return {
    name: `Campaign ${overrides.campaign_id}`,
    campaign_type: "organising",
    status: "active",
    is_standing: false,
    is_sms_episode: false,
    start_date: null,
    end_date: null,
    total_worker_estimate: null,
    organiser_id: null,
    created_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function roster(campaign_id: number, organiser_id: number, campaign_role = "organiser"): MyCampaignRosterRow {
  return { campaign_id, organiser_id, campaign_role };
}

const ME = 10;
const REPORT_A = 21;
const REPORT_B = 22;
const STRANGER = 99;

function group(
  campaigns: MyCampaignRow[],
  rosterRows: MyCampaignRosterRow[],
  opts: { myOrganiserId?: number | null; reportOrganiserIds?: number[] } = {}
) {
  return groupMyCampaigns({
    campaigns,
    rosterRows,
    myOrganiserId: opts.myOrganiserId === undefined ? ME : opts.myOrganiserId,
    reportOrganiserIds: opts.reportOrganiserIds ?? [REPORT_A, REPORT_B],
  });
}

const ids = (rows: { campaign_id: number }[]) => rows.map((r) => r.campaign_id);

describe("groupMyCampaigns", () => {
  it("G1 a roster row makes a campaign mine and carries its campaign_role", () => {
    const out = group([campaign({ campaign_id: 1 })], [roster(1, ME, "lead")]);
    expect(ids(out.mine)).toEqual([1]);
    expect(out.mine[0].myCampaignRole).toBe("lead");
    expect(out.team).toEqual([]);
  });

  it("G1 the owner column alone makes a campaign mine, with a null role", () => {
    const out = group([campaign({ campaign_id: 1, organiser_id: ME })], []);
    expect(ids(out.mine)).toEqual([1]);
    expect(out.mine[0].myCampaignRole).toBeNull();
  });

  it("G1 a stranger's campaign is neither mine nor my team's", () => {
    const out = group([campaign({ campaign_id: 1, organiser_id: STRANGER })], [roster(1, STRANGER)]);
    expect(out).toEqual({ mine: [], team: [] });
  });

  it("G2 a report's roster row, or a report as owner, makes a campaign my team's", () => {
    const out = group(
      [campaign({ campaign_id: 1 }), campaign({ campaign_id: 2, organiser_id: REPORT_B })],
      [roster(1, REPORT_A)]
    );
    expect(out.mine).toEqual([]);
    expect(ids(out.team).sort()).toEqual([1, 2]);
    expect(out.team.find((c) => c.campaign_id === 1)?.teamOrganiserIds).toEqual([REPORT_A]);
    expect(out.team.find((c) => c.campaign_id === 2)?.teamOrganiserIds).toEqual([REPORT_B]);
  });

  it("G2 team ids are the distinct reports on the campaign, sorted", () => {
    const out = group(
      [campaign({ campaign_id: 1, organiser_id: REPORT_B })],
      [roster(1, REPORT_B), roster(1, REPORT_A), roster(1, STRANGER)]
    );
    expect(out.team[0].teamOrganiserIds).toEqual([REPORT_A, REPORT_B]);
  });

  it("G3 mine wins: a campaign in both groups appears only in mine", () => {
    const out = group([campaign({ campaign_id: 1 })], [roster(1, ME), roster(1, REPORT_A)]);
    expect(ids(out.mine)).toEqual([1]);
    expect(out.team).toEqual([]);
    expect(out.mine[0].teamOrganiserIds).toEqual([]);
  });

  it("G4 SMS episodes and the standing container are dropped from both groups", () => {
    const out = group(
      [
        campaign({ campaign_id: 1, organiser_id: ME, is_sms_episode: true }),
        campaign({ campaign_id: 2, organiser_id: ME, is_standing: true }),
        campaign({ campaign_id: 3, organiser_id: REPORT_A, is_standing: true }),
        campaign({ campaign_id: 4, organiser_id: ME }),
      ],
      [roster(1, ME), roster(2, ME), roster(3, REPORT_A)]
    );
    expect(ids(out.mine)).toEqual([4]);
    expect(out.team).toEqual([]);
  });

  it("G5 several roster rows on one campaign produce one entry; the first role wins", () => {
    const out = group(
      [campaign({ campaign_id: 1 }), campaign({ campaign_id: 1 })],
      [roster(1, ME, "coordinator"), roster(1, ME, "organiser")]
    );
    expect(ids(out.mine)).toEqual([1]);
    expect(out.mine[0].myCampaignRole).toBe("coordinator");
  });

  it("G6 orders by created_at descending, tie-broken by name — the /campaigns order", () => {
    const out = group(
      [
        campaign({ campaign_id: 1, organiser_id: ME, name: "Beta", created_at: "2026-01-01T00:00:00Z" }),
        campaign({ campaign_id: 2, organiser_id: ME, name: "Alpha", created_at: "2026-01-01T00:00:00Z" }),
        campaign({ campaign_id: 3, organiser_id: ME, name: "Zed", created_at: "2026-03-01T00:00:00Z" }),
        campaign({ campaign_id: 4, organiser_id: REPORT_A, name: "Old", created_at: "2025-01-01T00:00:00Z" }),
        campaign({ campaign_id: 5, organiser_id: REPORT_A, name: "New", created_at: "2026-06-01T00:00:00Z" }),
      ],
      []
    );
    expect(ids(out.mine)).toEqual([3, 2, 1]);
    expect(ids(out.team)).toEqual([5, 4]);
  });

  it("G7 an unlinked profile (organiser_id null) has no campaigns in either group", () => {
    const out = group(
      [campaign({ campaign_id: 1, organiser_id: null })],
      [roster(1, REPORT_A)],
      { myOrganiserId: null }
    );
    expect(out).toEqual({ mine: [], team: [] });
  });

  it("G8 archived campaigns are kept, not filtered — the card marks them", () => {
    const out = group(
      [campaign({ campaign_id: 1, organiser_id: ME, archived_at: "2026-02-01T00:00:00Z" })],
      []
    );
    expect(ids(out.mine)).toEqual([1]);
    expect(out.mine[0].archived_at).toBe("2026-02-01T00:00:00Z");
  });

  it("with no reports, nothing is ever team", () => {
    const out = group(
      [campaign({ campaign_id: 1, organiser_id: REPORT_A })],
      [roster(1, REPORT_A)],
      { reportOrganiserIds: [] }
    );
    expect(out).toEqual({ mine: [], team: [] });
  });
});
