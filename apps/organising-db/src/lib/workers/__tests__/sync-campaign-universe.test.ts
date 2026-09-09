import { describe, expect, it } from "vitest";
import {
  matchingOusForWorker,
  planUniverseSyncTargets,
  workerMatchesCampaignUniverse,
  type CampaignUniverse,
  type OuPlacementTarget,
  type WorkerPlacement,
} from "../sync-campaign-universe";

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
      isGroupContainer: true,
      employerId: 5,
      worksiteId: null,
    },
    {
      ouId: 2,
      campaignId: 10,
      isGroupContainer: false,
      employerId: 5,
      worksiteId: null,
    },
    {
      ouId: 3,
      campaignId: 10,
      isGroupContainer: false,
      employerId: null,
      worksiteId: 20,
    },
    {
      ouId: 4,
      campaignId: 10,
      isGroupContainer: false,
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
