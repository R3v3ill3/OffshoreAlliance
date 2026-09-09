import { describe, expect, it } from "vitest";
import {
  FULL_MODE_LANDING_PATH,
  LANDING_PARAM,
  LANDING_PARAM_VALUE,
  MY_CAMPAIGNS_PATH,
  canDecideLanding,
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

describe("canDecideLanding", () => {
  it("L5 waits while auth, the profile or the org defaults are loading", () => {
    expect(canDecideLanding({ loading: true, hasUser: true, hasProfile: true })).toBe(false);
    expect(canDecideLanding({ loading: true, hasUser: false, hasProfile: false })).toBe(false);
  });

  it("L5 waits for a signed-in user whose profile has not arrived (the post-login gap)", () => {
    expect(canDecideLanding({ loading: false, hasUser: true, hasProfile: false })).toBe(false);
  });

  it("L5 decides once the profile is here", () => {
    expect(canDecideLanding({ loading: false, hasUser: true, hasProfile: true })).toBe(true);
  });

  it("L5 decides for no user at all — there is no profile to wait for", () => {
    expect(canDecideLanding({ loading: false, hasUser: false, hasProfile: false })).toBe(true);
  });
});
