import { describe, expect, it } from "vitest";
import { createFakeStructureClient } from "@/lib/campaign/__tests__/fake-structure-client";
import {
  applyUniverseRefresh,
  classifyMemberEmployer,
  loadUniverseRefreshReview,
  planUniverseRefresh,
  refreshBlockedReason,
  workerDisplayName,
  type ClassifiedMember,
  type UniverseRefreshReview,
} from "../refresh-campaign-universe-membership";

const CAMPAIGN = 66;
const EMPLOYER = 10;

function member(partial: Partial<ClassifiedMember> & Pick<ClassifiedMember, "workerId" | "class">): ClassifiedMember {
  return {
    firstName: "Pat",
    lastName: `Worker${partial.workerId}`,
    employerId: partial.class === "no_employer" ? null : partial.employerId ?? 99,
    employerName: partial.class === "no_employer" ? null : "Other Co",
    worksiteId: 20,
    worksiteName: "Gorgon LNG",
    ...partial,
  };
}

function review(over: Partial<UniverseRefreshReview> = {}): UniverseRefreshReview {
  return {
    campaignId: CAMPAIGN,
    matchMode: "and",
    campaignEmployers: [{ employerId: EMPLOYER, employerName: "Downer" }],
    keepCount: 12,
    wrongEmployer: [member({ workerId: 101, class: "wrong_employer", employerId: 99, employerName: "Toll" })],
    noEmployer: [member({ workerId: 202, class: "no_employer" })],
    blockedReason: null,
    ...over,
  };
}

describe("classifyMemberEmployer", () => {
  it("keeps members whose employer is a campaign employer", () => {
    expect(classifyMemberEmployer(10, [10, 11])).toBe("keep");
  });

  it("flags a different employer as wrong_employer", () => {
    expect(classifyMemberEmployer(99, [10])).toBe("wrong_employer");
  });

  it("flags a missing employer as no_employer", () => {
    expect(classifyMemberEmployer(null, [10])).toBe("no_employer");
    expect(classifyMemberEmployer(undefined, [10])).toBe("no_employer");
  });
});

describe("refreshBlockedReason", () => {
  it("blocks sector-wide OR matching", () => {
    expect(refreshBlockedReason({ matchMode: "or", campaignEmployerCount: 1 })).toMatch(
      /Turn off “Include other employers/
    );
  });

  it("blocks a campaign with no saved employers", () => {
    expect(refreshBlockedReason({ matchMode: "and", campaignEmployerCount: 0 })).toMatch(
      /Save at least one campaign employer/
    );
  });

  it("allows AND matching with at least one employer", () => {
    expect(refreshBlockedReason({ matchMode: "and", campaignEmployerCount: 1 })).toBeNull();
  });
});

describe("planUniverseRefresh", () => {
  it("always removes wrong-employer members and applies each no-employer choice", () => {
    expect(
      planUniverseRefresh(review(), [{ workerId: 202, action: "remove" }])
    ).toEqual({
      removeWorkerIds: [101, 202],
      setEmployer: [],
    });

    expect(
      planUniverseRefresh(review(), [{ workerId: 202, action: "set_employer" }])
    ).toEqual({
      removeWorkerIds: [101],
      setEmployer: [{ workerId: 202, employerId: EMPLOYER }],
    });
  });

  it("uses the chosen campaign employer when there are several", () => {
    const multi = review({
      campaignEmployers: [
        { employerId: 10, employerName: "Downer" },
        { employerId: 11, employerName: "Chevron" },
      ],
    });
    expect(
      planUniverseRefresh(multi, [{ workerId: 202, action: "set_employer", employerId: 11 }])
    ).toEqual({
      removeWorkerIds: [101],
      setEmployer: [{ workerId: 202, employerId: 11 }],
    });
  });

  it("refuses set_employer when several campaign employers exist and none is chosen", () => {
    const multi = review({
      campaignEmployers: [
        { employerId: 10, employerName: "Downer" },
        { employerId: 11, employerName: "Chevron" },
      ],
    });
    expect(() =>
      planUniverseRefresh(multi, [{ workerId: 202, action: "set_employer" }])
    ).toThrow(/Choose which campaign employer/);
  });

  it("refuses a set_employer target that is not a saved campaign employer", () => {
    expect(() =>
      planUniverseRefresh(review(), [
        { workerId: 202, action: "set_employer", employerId: 77 },
      ])
    ).toThrow(/not a saved employer/);
  });

  it("refuses when a no-employer worker has no choice", () => {
    expect(() => planUniverseRefresh(review(), [])).toThrow(
      /Choose remove or set employer/
    );
  });

  it("refuses when matching is still OR", () => {
    expect(() =>
      planUniverseRefresh(
        review({ matchMode: "or", blockedReason: refreshBlockedReason({ matchMode: "or", campaignEmployerCount: 1 }) }),
        [{ workerId: 202, action: "remove" }]
      )
    ).toThrow(/Turn off “Include other employers/);
  });

  it("names a worker with only an id", () => {
    expect(workerDisplayName({ firstName: "", lastName: "  ", workerId: 9 })).toBe("Worker #9");
  });
});

describe("loadUniverseRefreshReview", () => {
  it("classifies members against saved campaign_employers and blocks OR campaigns", async () => {
    const { client } = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, sector_wide: false }],
        campaign_worksites: [{ worksite_id: 20, sector_wide: false }],
        campaign_employers: [{ employer_id: EMPLOYER }],
        campaign_worker_membership: [{ worker_id: 1 }, { worker_id: 2 }, { worker_id: 3 }],
        workers: [
          { worker_id: 1, first_name: "Keep", last_name: "Me", employer_id: EMPLOYER, worksite_id: 20 },
          { worker_id: 2, first_name: "Toll", last_name: "Hand", employer_id: 99, worksite_id: 20 },
          { worker_id: 3, first_name: "No", last_name: "Boss", employer_id: null, worksite_id: 20 },
        ],
        employers: [
          { employer_id: EMPLOYER, employer_name: "Downer" },
          { employer_id: 99, employer_name: "Toll" },
        ],
        worksites: [{ worksite_id: 20, worksite_name: "Gorgon LNG" }],
      },
    });

    const loaded = await loadUniverseRefreshReview(client, CAMPAIGN);
    expect(loaded.matchMode).toBe("and");
    expect(loaded.blockedReason).toBeNull();
    expect(loaded.campaignEmployers).toEqual([{ employerId: EMPLOYER, employerName: "Downer" }]);
    expect(loaded.keepCount).toBe(1);
    expect(loaded.wrongEmployer.map((m) => m.workerId)).toEqual([2]);
    expect(loaded.wrongEmployer[0].employerName).toBe("Toll");
    expect(loaded.noEmployer.map((m) => m.workerId)).toEqual([3]);
    expect(loaded.noEmployer[0].worksiteName).toBe("Gorgon LNG");
  });

  it("blocks when campaigns.sector_wide is on", async () => {
    const { client } = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, sector_wide: true }],
        campaign_worksites: [],
        campaign_employers: [{ employer_id: EMPLOYER }],
        campaign_worker_membership: [],
        workers: [],
        employers: [{ employer_id: EMPLOYER, employer_name: "Downer" }],
        worksites: [],
      },
    });
    const loaded = await loadUniverseRefreshReview(client, CAMPAIGN);
    expect(loaded.matchMode).toBe("or");
    expect(loaded.blockedReason).toMatch(/Turn off “Include other employers/);
  });
});

describe("applyUniverseRefresh", () => {
  it("sets no-employer workers first, then unassigns and deletes wrong-employer members", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, sector_wide: false }],
        campaign_worksites: [{ worksite_id: 20, sector_wide: false }],
        campaign_employers: [{ employer_id: EMPLOYER }],
        campaign_worker_membership: [{ worker_id: 2 }, { worker_id: 3 }],
        workers: [
          { worker_id: 2, first_name: "Toll", last_name: "Hand", employer_id: 99, worksite_id: 20 },
          { worker_id: 3, first_name: "No", last_name: "Boss", employer_id: null, worksite_id: 20 },
        ],
        employers: [
          { employer_id: EMPLOYER, employer_name: "Downer" },
          { employer_id: 99, employer_name: "Toll" },
        ],
        worksites: [{ worksite_id: 20, worksite_name: "Gorgon LNG" }],
        call_lists: [{ list_id: 5 }],
      },
      counts: { campaign_worker_membership: 1 },
    });
    fake.answerRpc("structure_placements_unassign", { data: { removed: 1 } });

    const result = await applyUniverseRefresh(fake.client, {
      campaignId: CAMPAIGN,
      noEmployerChoices: [{ workerId: 3, action: "set_employer" }],
    });

    expect(result).toEqual({ removed: 1, employersSet: 1 });
    expect(fake.trace().filter((t) => t.startsWith("rpc:") || t.includes("workers.update") || t.includes("membership.delete") || t.includes("call_list"))).toEqual([
      "from:workers.update.in",
      "rpc:structure_placements_unassign",
      "from:campaign_worker_membership.delete.eq.in",
      "from:call_lists.select.eq",
      "from:call_list_items.delete.in.in",
    ]);
    const workerUpdate = fake.fromCalls().find((c) => c.table === "workers" && c.ops.some((o) => o.method === "update"));
    expect(workerUpdate?.ops).toEqual([
      { method: "update", args: [{ employer_id: EMPLOYER }] },
      { method: "in", args: ["worker_id", [3]] },
    ]);
    expect(fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [2], p_ou_id: null, p_within_group_id: null },
      },
    ]);
  });

  it("does not write when the campaign is still sector-wide", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, sector_wide: true }],
        campaign_worksites: [],
        campaign_employers: [{ employer_id: EMPLOYER }],
        campaign_worker_membership: [{ worker_id: 2 }],
        workers: [{ worker_id: 2, first_name: "Toll", last_name: "Hand", employer_id: 99, worksite_id: 20 }],
        employers: [{ employer_id: EMPLOYER, employer_name: "Downer" }, { employer_id: 99, employer_name: "Toll" }],
        worksites: [],
        call_lists: [],
      },
    });

    await expect(
      applyUniverseRefresh(fake.client, { campaignId: CAMPAIGN, noEmployerChoices: [] })
    ).rejects.toThrow(/Turn off “Include other employers/);
    expect(fake.rpcCalls()).toEqual([]);
    expect(fake.fromCalls().some((c) => c.ops.some((o) => o.method === "delete" || o.method === "update"))).toBe(
      false
    );
  });
});
