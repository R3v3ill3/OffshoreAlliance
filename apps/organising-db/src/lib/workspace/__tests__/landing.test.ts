import { describe, expect, it } from "vitest";
import {
  FULL_MODE_LANDING_PATH,
  LANDING_PARAM,
  LANDING_PARAM_VALUE,
  MY_CAMPAIGNS_PATH,
  campaignChartHref,
  landingPathFor,
  shouldAutoOpenSingleCampaign,
} from "../landing";

describe("landingPathFor", () => {
  it("L1 full mode → /campaigns, today's destination, unchanged", () => {
    expect(landingPathFor({ mode: "full" })).toBe("/campaigns");
    expect(FULL_MODE_LANDING_PATH).toBe("/campaigns");
  });

  it("L2 organiser mode → /my-campaigns?from=landing", () => {
    expect(landingPathFor({ mode: "organiser" })).toBe("/my-campaigns?from=landing");
    expect(MY_CAMPAIGNS_PATH).toBe("/my-campaigns");
    expect(`${LANDING_PARAM}=${LANDING_PARAM_VALUE}`).toBe("from=landing");
  });
});

describe("campaignChartHref", () => {
  it("L3 is the explicit tab/sub form /campaigns already pushes on a row click", () => {
    expect(campaignChartHref(42)).toBe("/campaigns/42?tab=workforce&sub=wall-chart");
  });
});

describe("shouldAutoOpenSingleCampaign", () => {
  it("L4 returns the id only from the landing hop with exactly one campaign", () => {
    expect(shouldAutoOpenSingleCampaign({ fromLanding: true, campaignIds: [7] })).toBe(7);
  });

  it("L4 never fires without the landing flag — the sidebar link always shows the page", () => {
    expect(shouldAutoOpenSingleCampaign({ fromLanding: false, campaignIds: [7] })).toBeNull();
  });

  it("L4 never fires for zero or several campaigns", () => {
    expect(shouldAutoOpenSingleCampaign({ fromLanding: true, campaignIds: [] })).toBeNull();
    expect(shouldAutoOpenSingleCampaign({ fromLanding: true, campaignIds: [1, 2] })).toBeNull();
  });
});
