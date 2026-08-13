import { describe, expect, it } from "vitest";
import {
  getCampaignIdFromPath,
  isCampaignDetailRoute,
} from "../campaign-detail-routes";

describe("campaign-detail-routes", () => {
  it("treats sms-tools as a global tool, not a campaign detail page", () => {
    expect(getCampaignIdFromPath("/campaigns/sms-tools")).toBeNull();
    expect(isCampaignDetailRoute("/campaigns/sms-tools")).toBe(false);
  });

  it("still recognises numeric campaign ids", () => {
    expect(getCampaignIdFromPath("/campaigns/12")).toBe("12");
    expect(isCampaignDetailRoute("/campaigns/12")).toBe(true);
  });

  it("keeps email and phone wizards out of campaign chrome", () => {
    expect(getCampaignIdFromPath("/campaigns/email-wizard")).toBeNull();
    expect(getCampaignIdFromPath("/campaigns/phone-wizard")).toBeNull();
  });
});
