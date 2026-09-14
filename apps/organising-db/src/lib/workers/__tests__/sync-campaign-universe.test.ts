import { describe, expect, it } from "vitest";
import { createFakeStructureClient } from "@/lib/campaign/__tests__/fake-structure-client";
import {
  PAGE_SIZE,
  employerWorksiteFromOuBasis,
  futureGroupKeyForLegacyOu,
  loadOuTargets,
  matchingOusForWorker,
  planUniverseSyncTargets,
  syncCampaignUniverseFromEmployersWorksites,
  syncWorkersToMatchingCampaigns,
  workerMatchesCampaignUniverse,
  type CampaignUniverse,
  type OuPlacementTarget,
  type WorkerPlacement,
} from "../sync-campaign-universe";

describe("employerWorksiteFromOuBasis", () => {
  it("accepts only positive int4-compatible integers and digit strings", () => {
    expect(
      employerWorksiteFromOuBasis({
        employer_id: 2_147_483_647,
        worksite_id: "00020",
      })
    ).toEqual({ employerId: 2_147_483_647, worksiteId: 20 });
  });

  it("treats JSON numeric 1.0 as runtime integer 1 after parsing", () => {
    expect(employerWorksiteFromOuBasis({ employer_id: 1.0 })).toEqual({
      employerId: 1,
      worksiteId: null,
    });
  });

  it.each([
    ["float number", 1.5],
    ["negative number", -1],
    ["zero", 0],
    ["overflow number", 2_147_483_648],
    ["decimal string", "1.0"],
    ["exponent string", "1e3"],
    ["negative string", "-1"],
    ["whitespace-padded string", " 20 "],
    ["overflow string", "2147483648"],
    ["non-number", "abc"],
  ])("rejects %s basis values", (_label, value) => {
    expect(
      employerWorksiteFromOuBasis({
        employer_id: value,
        worksite_id: value,
      })
    ).toEqual({ employerId: null, worksiteId: null });
  });

  it("preserves null behavior for missing or non-object basis", () => {
    expect(employerWorksiteFromOuBasis(null)).toEqual({
      employerId: null,
      worksiteId: null,
    });
    expect(employerWorksiteFromOuBasis({})).toEqual({
      employerId: null,
      worksiteId: null,
    });
  });
});

const programmedCampaign: CampaignUniverse = {
  campaignId: 10,
  employerIds: [5],
  worksiteIds: [20],
};

const rovSectorCampaign: CampaignUniverse = {
  campaignId: 11,
  employerIds: [5, 6, 7],
  worksiteIds: [20, 21],
};

const otherEmployerCampaign: CampaignUniverse = {
  campaignId: 12,
  employerIds: [99],
  worksiteIds: [88],
};

const programmedWorker: WorkerPlacement = {
  workerId: 1,
  employerId: 5,
  worksiteId: 20,
};

const programmedOtherSite: WorkerPlacement = {
  workerId: 2,
  employerId: 5,
  worksiteId: 21,
};

const unplaced: WorkerPlacement = {
  workerId: 3,
  employerId: null,
  worksiteId: null,
};

describe("workerMatchesCampaignUniverse", () => {
  it("matches a bargaining campaign by employer even when the worksite differs", () => {
    expect(workerMatchesCampaignUniverse(programmedOtherSite, programmedCampaign)).toBe(true);
  });

  it("matches a sector campaign that lists the same employer", () => {
    expect(workerMatchesCampaignUniverse(programmedWorker, rovSectorCampaign)).toBe(true);
  });

  it("does not match a campaign for a different employer", () => {
    expect(workerMatchesCampaignUniverse(programmedWorker, otherEmployerCampaign)).toBe(false);
  });

  it("does not match unplaced workers", () => {
    expect(workerMatchesCampaignUniverse(unplaced, programmedCampaign)).toBe(false);
  });

  it("matches by worksite alone when employer is unset", () => {
    expect(
      workerMatchesCampaignUniverse(
        { workerId: 4, employerId: null, worksiteId: 20 },
        programmedCampaign
      )
    ).toBe(true);
  });
});

describe("matchingOusForWorker", () => {
  const ous: OuPlacementTarget[] = [
    {
      ouId: 1,
      campaignId: 10,
      futureGroupKey: "kind:employer",
      isGroupContainer: true,
      autoMatch: true,
      employerId: 5,
      worksiteId: null,
    },
    {
      ouId: 2,
      campaignId: 10,
      futureGroupKey: "kind:employer",
      isGroupContainer: false,
      autoMatch: true,
      employerId: 5,
      worksiteId: null,
    },
    {
      ouId: 3,
      campaignId: 10,
      futureGroupKey: "kind:worksite",
      isGroupContainer: false,
      autoMatch: true,
      employerId: null,
      worksiteId: 20,
    },
    {
      ouId: 4,
      campaignId: 10,
      futureGroupKey: "kind:employer",
      isGroupContainer: false,
      autoMatch: true,
      employerId: 99,
      worksiteId: null,
    },
  ];

  it("places a worker into matching employer and worksite units, skipping group containers", () => {
    expect(matchingOusForWorker(programmedWorker, ous)).toEqual([2, 3]);
  });

  it("does not place an unplaced worker", () => {
    expect(matchingOusForWorker(unplaced, ous)).toEqual([]);
  });

  it("requires both employer and worksite when both basis keys are present", () => {
    const both: OuPlacementTarget[] = [
      {
        ouId: 5,
        campaignId: 10,
        futureGroupKey: "kind:worksite",
        isGroupContainer: false,
        autoMatch: true,
        employerId: 5,
        worksiteId: 20,
      },
    ];

    expect(matchingOusForWorker(programmedWorker, both)).toEqual([5]);
    expect(matchingOusForWorker({ ...programmedWorker, employerId: 6 }, both)).toEqual([]);
    expect(matchingOusForWorker({ ...programmedWorker, worksiteId: 21 }, both)).toEqual([]);
  });

  it("supports employer-only and worksite-only units independently", () => {
    expect(matchingOusForWorker(programmedWorker, [ous[1]])).toEqual([2]);
    expect(
      matchingOusForWorker({ ...programmedWorker, employerId: 6 }, [ous[1]])
    ).toEqual([]);
    expect(matchingOusForWorker(programmedWorker, [ous[2]])).toEqual([3]);
    expect(
      matchingOusForWorker({ ...programmedWorker, worksiteId: 21 }, [ous[2]])
    ).toEqual([]);
  });

  it("skips units with auto_match=false", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 6,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: false,
          employerId: 5,
          worksiteId: 20,
        },
      ])
    ).toEqual([]);
  });

  it("skips units with no employer or worksite basis", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 7,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: null,
          worksiteId: null,
        },
      ])
    ).toEqual([]);
  });

  it("selects only the intended child from a mixed employer worksite list", () => {
    const children: OuPlacementTarget[] = [
      {
        ouId: 8,
        campaignId: 10,
        futureGroupKey: "kind:worksite",
        isGroupContainer: false,
        autoMatch: true,
        employerId: 5,
        worksiteId: 19,
      },
      {
        ouId: 9,
        campaignId: 10,
        futureGroupKey: "kind:worksite",
        isGroupContainer: false,
        autoMatch: true,
        employerId: 5,
        worksiteId: 20,
      },
      {
        ouId: 10,
        campaignId: 10,
        futureGroupKey: "kind:worksite",
        isGroupContainer: false,
        autoMatch: true,
        employerId: 5,
        worksiteId: 21,
      },
      {
        ouId: 11,
        campaignId: 10,
        futureGroupKey: "kind:worksite",
        isGroupContainer: false,
        autoMatch: false,
        employerId: 5,
        worksiteId: 20,
      },
    ];

    expect(matchingOusForWorker(programmedWorker, children)).toEqual([9]);
  });

  it("prefers a both-key match over an employer-only fallback in one group", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 12,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: null,
        },
        {
          ouId: 13,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: 20,
        },
      ])
    ).toEqual([13]);
  });

  it("retains a fallback when no more-specific unit matches", () => {
    const fallback: OuPlacementTarget = {
      ouId: 14,
      campaignId: 10,
      futureGroupKey: "kind:worksite",
      isGroupContainer: false,
      autoMatch: true,
      employerId: 5,
      worksiteId: null,
    };
    const mismatchedSpecific: OuPlacementTarget = {
      ...fallback,
      ouId: 15,
      worksiteId: 21,
    };

    expect(matchingOusForWorker(programmedWorker, [fallback])).toEqual([14]);
    expect(matchingOusForWorker(programmedWorker, [fallback, mismatchedSpecific])).toEqual([14]);
  });

  it("isolates specificity ranking by future group", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 16,
          campaignId: 10,
          futureGroupKey: "kind:employer",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: null,
        },
        {
          ouId: 17,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: 20,
        },
      ])
    ).toEqual([16, 17]);
  });

  it("isolates specificity ranking by campaign", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 18,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: 20,
        },
        {
          ouId: 19,
          campaignId: 11,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: null,
        },
      ])
    ).toEqual([18, 19]);
  });

  it("keeps only the first of two equally specific duplicates in one group (Stage 6 fix round 1, A1 — was both until WP2.2b), and still the canonical one once C1 disables the other", () => {
    const canonical: OuPlacementTarget = {
      ouId: 20,
      campaignId: 10,
      futureGroupKey: "kind:worksite",
      isGroupContainer: false,
      autoMatch: true,
      employerId: 5,
      worksiteId: 20,
    };
    const duplicate: OuPlacementTarget = { ...canonical, ouId: 21 };

    expect(matchingOusForWorker(programmedWorker, [canonical, duplicate])).toEqual([20]);
    expect(matchingOusForWorker(programmedWorker, [duplicate, canonical])).toEqual([21]);
    expect(
      matchingOusForWorker(programmedWorker, [
        canonical,
        { ...duplicate, autoMatch: false },
      ])
    ).toEqual([20]);
  });

  it("preserves input order among maximum-specificity candidates, one per group (A1: 25 is a second kind:worksite unit and is dropped)", () => {
    expect(
      matchingOusForWorker(programmedWorker, [
        {
          ouId: 22,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: 20,
        },
        {
          ouId: 23,
          campaignId: 10,
          futureGroupKey: "kind:employer",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: null,
        },
        {
          ouId: 24,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: null,
        },
        {
          ouId: 25,
          campaignId: 10,
          futureGroupKey: "kind:worksite",
          isGroupContainer: false,
          autoMatch: true,
          employerId: 5,
          worksiteId: 20,
        },
      ])
    ).toEqual([22, 23]);
  });
});

describe("matchingOusForWorker — §3.7 container parent (WP2.2 Stage 6)", () => {
  const employerContainer: OuPlacementTarget = {
    ouId: 1,
    campaignId: 10,
    futureGroupKey: "kind:employer",
    isGroupContainer: true,
    autoMatch: true,
    employerId: 5,
    worksiteId: null,
  };
  const worksiteChild: OuPlacementTarget = {
    ouId: 3,
    campaignId: 10,
    futureGroupKey: "kind:worksite",
    isGroupContainer: false,
    autoMatch: true,
    employerId: 5,
    worksiteId: 20,
    ouGroupId: 1,
  };

  it("adds the group container a matched member belongs to, after the matched units, once", () => {
    const sibling: OuPlacementTarget = { ...worksiteChild, ouId: 4, futureGroupKey: "kind:shift" };
    expect(matchingOusForWorker(programmedWorker, [employerContainer, worksiteChild, sibling])).toEqual([3, 4, 1]);
  });

  it("does not add the container when the member did not match, nor a container without a group", () => {
    expect(matchingOusForWorker({ ...programmedWorker, worksiteId: 21 }, [employerContainer, worksiteChild])).toEqual([]);
    const customContainer: OuPlacementTarget = { ...employerContainer, ouId: 50, futureGroupKey: null };
    expect(
      matchingOusForWorker(programmedWorker, [customContainer, { ...worksiteChild, ouGroupId: 50 }])
    ).toEqual([3]);
  });

  it("A1 (fix round 1): a worker matching worksite children under two containers gets one child and that child's container only", () => {
    const containerA = employerContainer; // ouId 1
    const containerB: OuPlacementTarget = { ...employerContainer, ouId: 2 };
    const childX: OuPlacementTarget = { ...worksiteChild, ouId: 3, employerId: null, ouGroupId: 1 }; // worksite-only basis
    const childY: OuPlacementTarget = { ...worksiteChild, ouId: 5, employerId: null, ouGroupId: 2 };
    const childZ: OuPlacementTarget = { ...worksiteChild, ouId: 6, employerId: null, worksiteId: 99, ouGroupId: 2 };
    expect(matchingOusForWorker(programmedWorker, [containerA, containerB, childX, childZ, childY])).toEqual([3, 1]);
    expect(matchingOusForWorker(programmedWorker, [containerB, containerA, childY, childX])).toEqual([5, 2]);
  });

  it("ignores an ouGroupId that names no unit of the list, and never consults the container's own basis", () => {
    expect(matchingOusForWorker(programmedWorker, [{ ...worksiteChild, ouGroupId: 999 }])).toEqual([3]);
    expect(
      matchingOusForWorker(programmedWorker, [{ ...employerContainer, employerId: 99, autoMatch: false }, worksiteChild])
    ).toEqual([3, 1]);
  });
});

describe("loadOuTargets — paged (wp2.2.md §3.10, WP2.2 Stage 6)", () => {
  it("reads every row in ceil(n / PAGE_SIZE) ordered ranges and stops at the short page", async () => {
    const n = 2_500;
    const rows = Array.from({ length: n }, (_, i) => ({
      ou_id: i + 1,
      campaign_id: 10,
      ou_type: "worksite",
      ou_group_id: null,
      is_group_container: false,
      unit_basis: { worksite_id: i + 1 },
    }));
    const fake = createFakeStructureClient({ tables: { campaign_organising_units: rows } });

    const targets = await loadOuTargets(fake.client, [10]);

    expect(PAGE_SIZE).toBe(1000);
    expect(targets).toHaveLength(n);
    expect(targets.map((t) => t.ouId)).toEqual(rows.map((r) => r.ou_id));
    expect(targets[n - 1]).toEqual({
      ouId: n,
      campaignId: 10,
      futureGroupKey: "kind:worksite",
      isGroupContainer: false,
      autoMatch: true,
      employerId: null,
      worksiteId: n,
      ouGroupId: null,
    });
    const reads = fake.fromCalls();
    expect(reads).toHaveLength(Math.ceil(n / PAGE_SIZE));
    expect(reads.map((c) => c.ops)).toEqual(
      [0, 1000, 2000].map((from) => [
        { method: "select", args: ["ou_id, campaign_id, ou_type, ou_group_id, is_group_container, unit_basis"] },
        { method: "in", args: ["campaign_id", [10]] },
        { method: "order", args: ["ou_id", { ascending: true }] },
        { method: "range", args: [from, from + PAGE_SIZE - 1] },
      ])
    );
  });

  it("a page-sized result is followed by one more (empty) request, so nothing past the page is lost", async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ou_id: i + 1,
      campaign_id: 10,
      ou_type: "shift",
      ou_group_id: null,
      is_group_container: false,
      unit_basis: null,
    }));
    const fake = createFakeStructureClient({ tables: { campaign_organising_units: rows } });
    const targets = await loadOuTargets(fake.client, [10]);
    expect(targets).toHaveLength(PAGE_SIZE);
    expect(fake.fromCalls()).toHaveLength(2);
  });
});

describe("universe sync writes only through structure_placements_assign (wp2.2.md §3.11 row 15, WP2.2 Stage 6)", () => {
  const CAMPAIGN = 10;
  const units = [
    { ou_id: 1, campaign_id: CAMPAIGN, ou_type: "employer", ou_group_id: null, is_group_container: true, unit_basis: { employer_id: 5 } },
    { ou_id: 3, campaign_id: CAMPAIGN, ou_type: "worksite", ou_group_id: 1, is_group_container: false, unit_basis: { employer_id: 5, worksite_id: 20 } },
    { ou_id: 4, campaign_id: CAMPAIGN, ou_type: "worksite", ou_group_id: 1, is_group_container: false, unit_basis: { employer_id: 5, worksite_id: 21 } },
  ];
  const workers = [
    { worker_id: 101, employer_id: 5, worksite_id: 20 },
    { worker_id: 102, employer_id: 5, worksite_id: 20 },
    { worker_id: 103, employer_id: 5, worksite_id: 21 },
  ];

  it("syncCampaignUniverseFromEmployersWorksites: one assign per target unit — universe / skip — and the container parent receives the members too", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, status: "active", is_sms_episode: false }],
        campaign_employers: [{ employer_id: 5 }],
        campaign_worksites: [],
        workers,
        campaign_organising_units: units,
      },
    });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 2, moved: 0, skipped: 0, displaced: 0 } });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 2, moved: 0, skipped: 1, displaced: 0 } });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 1, moved: 0, skipped: 0, displaced: 0 } });

    const result = await syncCampaignUniverseFromEmployersWorksites(fake.client, CAMPAIGN);

    expect(fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_assign",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 3, p_worker_ids: [101, 102], p_source: "universe", p_is_primary: false, p_on_conflict: "skip" },
      },
      {
        kind: "rpc",
        name: "structure_placements_assign",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 1, p_worker_ids: [101, 102, 103], p_source: "universe", p_is_primary: false, p_on_conflict: "skip" },
      },
      {
        kind: "rpc",
        name: "structure_placements_assign",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 4, p_worker_ids: [103], p_source: "universe", p_is_primary: false, p_on_conflict: "skip" },
      },
    ]);
    // Membership (not a structure table) is still upserted directly, before the placements.
    expect(fake.trace().filter((t) => t.startsWith("from:campaign_worker_membership"))).toEqual([
      "from:campaign_worker_membership.upsert",
    ]);
    expect(fake.trace().indexOf("from:campaign_worker_membership.upsert")).toBeLessThan(
      fake.trace().indexOf("rpc:structure_placements_assign")
    );
    expect(result).toEqual({ workersAdded: 3, ouAssignmentsUpserted: 5, ouAssignmentsSkipped: 1 });
    expect(
      fake
        .fromCalls()
        .filter((c) => c.table === "campaign_worker_ou" || (c.table === "campaign_organising_units" && c.ops.some((o) => o.method !== "select" && o.method !== "in" && o.method !== "order" && o.method !== "range")))
    ).toEqual([]);
  });

  it("syncWorkersToMatchingCampaigns: the same call shape per campaign and unit, counts from the RPC result", async () => {
    const fake = createFakeStructureClient({
      tables: {
        workers: [workers[0]],
        campaigns: [{ campaign_id: CAMPAIGN }],
        campaign_employers: [{ campaign_id: CAMPAIGN, employer_id: 5 }],
        campaign_worksites: [],
        campaign_organising_units: units,
      },
    });
    fake.answerRpc("campaigns_i_can_write", { data: [CAMPAIGN] });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 1, moved: 0, skipped: 0, displaced: 0 } });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 0, moved: 0, skipped: 1, displaced: 0 } });

    const result = await syncWorkersToMatchingCampaigns(fake.client, [101]);

    expect(fake.rpcCalls().map((c) => [c.name, c.args])).toEqual([
      ["campaigns_i_can_write", { p_campaign_ids: [CAMPAIGN] }],
      ["structure_placements_assign", { p_campaign_id: CAMPAIGN, p_ou_id: 3, p_worker_ids: [101], p_source: "universe", p_is_primary: false, p_on_conflict: "skip" }],
      ["structure_placements_assign", { p_campaign_id: CAMPAIGN, p_ou_id: 1, p_worker_ids: [101], p_source: "universe", p_is_primary: false, p_on_conflict: "skip" }],
    ]);
    expect(result).toEqual({
      membershipsUpserted: 1,
      ouAssignmentsUpserted: 1,
      ouAssignmentsSkipped: 1,
      campaignsTouched: 1,
      campaignsSkippedNoAccess: 0,
    });
  });

  it("a refused assign (42501) surfaces as a StructureApiError, after the membership upsert", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaigns: [{ campaign_id: CAMPAIGN, status: "active", is_sms_episode: false }],
        campaign_employers: [{ employer_id: 5 }],
        campaign_worksites: [],
        workers: [workers[0]],
        campaign_organising_units: units,
      },
    });
    fake.answerRpc("structure_placements_assign", { error: { code: "42501", message: "no write permission on campaign 10" } });
    await expect(syncCampaignUniverseFromEmployersWorksites(fake.client, CAMPAIGN)).rejects.toMatchObject({
      name: "StructureApiError",
      kind: "forbidden",
    });
    expect(fake.rpcCalls()).toHaveLength(1);
  });
});

describe("futureGroupKeyForLegacyOu", () => {
  it("mirrors fixed and custom future-group identities without group_id", () => {
    const customContainer = {
      ouId: 50,
      ouType: "network",
      ouGroupId: null,
      isGroupContainer: true,
    };

    expect(
      futureGroupKeyForLegacyOu(
        { ouId: 51, ouType: "worksite", ouGroupId: null, isGroupContainer: false },
        undefined
      )
    ).toBe("kind:worksite");
    expect(
      futureGroupKeyForLegacyOu(
        { ouId: 52, ouType: "custom", ouGroupId: 50, isGroupContainer: false },
        customContainer
      )
    ).toBe("source:50");
    expect(
      futureGroupKeyForLegacyOu(
        { ouId: 53, ouType: "network", ouGroupId: null, isGroupContainer: false },
        undefined
      )
    ).toBe("type:network");
    expect(futureGroupKeyForLegacyOu(customContainer, undefined)).toBeNull();
  });
});

describe("planUniverseSyncTargets (WP1.6)", () => {
  const matching = [programmedCampaign, rovSectorCampaign];

  it("keeps every matching campaign when all are writable", () => {
    const result = planUniverseSyncTargets(matching, new Set([10, 11]));
    expect(result.allowed).toEqual(matching);
    expect(result.skippedNoAccess).toBe(0);
  });

  it("drops and counts campaigns the actor cannot write to, preserving order", () => {
    const result = planUniverseSyncTargets(matching, new Set([11]));
    expect(result.allowed.map((c) => c.campaignId)).toEqual([11]);
    expect(result.skippedNoAccess).toBe(1);
  });

  it("skips everything when nothing is writable (viewer, or RPC returned nothing)", () => {
    const result = planUniverseSyncTargets(matching, new Set());
    expect(result.allowed).toEqual([]);
    expect(result.skippedNoAccess).toBe(2);
  });

  it("ignores writable ids that did not match", () => {
    const result = planUniverseSyncTargets([programmedCampaign], new Set([10, 999]));
    expect(result.allowed.map((c) => c.campaignId)).toEqual([10]);
    expect(result.skippedNoAccess).toBe(0);
  });

  it("is a no-op on an empty match list", () => {
    expect(planUniverseSyncTargets([], new Set([10]))).toEqual({ allowed: [], skippedNoAccess: 0 });
  });
});
