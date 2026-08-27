import { describe, expect, it } from "vitest";
import {
  matchingOusForWorker,
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
