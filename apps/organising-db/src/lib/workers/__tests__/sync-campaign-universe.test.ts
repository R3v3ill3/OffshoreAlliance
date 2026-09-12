import { describe, expect, it } from "vitest";
import {
  employerWorksiteFromOuBasis,
  futureGroupKeyForLegacyOu,
  matchingOusForWorker,
  planUniverseSyncTargets,
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

  it("keeps equally specific duplicates until C1 disables a noncanonical unit", () => {
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

    expect(matchingOusForWorker(programmedWorker, [canonical, duplicate])).toEqual([20, 21]);
    expect(
      matchingOusForWorker(programmedWorker, [
        canonical,
        { ...duplicate, autoMatch: false },
      ])
    ).toEqual([20]);
  });

  it("preserves input order among maximum-specificity candidates", () => {
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
    ).toEqual([22, 23, 25]);
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
