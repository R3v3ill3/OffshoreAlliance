import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_CHROME_PARAMS,
  campaignIdForChrome,
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

// ── WP1.4 — campaignIdForChrome ─────────────────────────────────────────
//
// C7: the three cases above are the pre-existing behaviour and are left
// exactly as they were. Everything below is additive.

describe("campaignIdForChrome — a wizard launched from a campaign keeps its header", () => {
  it("C1 — a detail route answers from the path", () => {
    expect(campaignIdForChrome("/campaigns/12", null)).toBe("12");
    expect(campaignIdForChrome("/campaigns/12/plan", null)).toBe("12");
    expect(campaignIdForChrome("/campaigns/12/sms/chat/7", null)).toBe("12");
    // A query string on a detail route is irrelevant; the path wins.
    expect(campaignIdForChrome("/campaigns/12", "cid=99")).toBe("12");
  });

  it("C2 — the stage planner draws its own header, id or no id", () => {
    expect(campaignIdForChrome("/campaigns/12/plan/stage/3", null)).toBeNull();
    expect(campaignIdForChrome("/campaigns/12/plan/stage/3", "cid=12")).toBeNull();
  });

  it("C3 — the four wizards answer from ?cid= or ?campaign_id=", () => {
    expect(campaignIdForChrome("/campaigns/new", "cid=12&edit=1")).toBe("12");
    expect(campaignIdForChrome("/campaigns/soc-wizard", "cid=12")).toBe("12");
    expect(campaignIdForChrome("/campaigns/email-wizard", "cid=12")).toBe("12");
    expect(campaignIdForChrome("/campaigns/phone-wizard", "cid=12")).toBe("12");
    // The planner wizard and SocWizardSteps use the other name.
    expect(campaignIdForChrome("/campaigns/new", "campaign_id=12")).toBe("12");
    expect(campaignIdForChrome("/campaigns/soc-wizard", "campaign_id=12")).toBe("12");
  });

  it("C3 — a URLSearchParams is accepted as well as a string", () => {
    const params = new URLSearchParams({ cid: "12", edit: "1" });
    expect(campaignIdForChrome("/campaigns/new", params)).toBe("12");
  });

  it("C4 — a trailing slash is tolerated and cid wins over campaign_id", () => {
    expect(campaignIdForChrome("/campaigns/new/", "cid=12")).toBe("12");
    expect(campaignIdForChrome("/campaigns/new", "cid=12&campaign_id=99")).toBe("12");
    expect(CAMPAIGN_CHROME_PARAMS[0]).toBe("cid");
  });

  it("C5 — anything that is not a positive integer leaves the wizard chrome-less", () => {
    for (const search of [null, "", "cid=", "cid=0", "cid=-1", "cid=abc", "cid=12abc"]) {
      expect(campaignIdForChrome("/campaigns/email-wizard", search), String(search)).toBeNull();
    }
    // A repeated param takes the first value only.
    expect(campaignIdForChrome("/campaigns/new", "cid=1&cid=2")).toBe("1");
  });

  it("C6 — sms-tools and new/manual stay out of campaign chrome", () => {
    expect(campaignIdForChrome("/campaigns/sms-tools", "cid=12")).toBeNull();
    expect(campaignIdForChrome("/campaigns/new/manual", "cid=12")).toBeNull();
  });

  it("returns null for a null pathname and for unrelated routes", () => {
    expect(campaignIdForChrome(null, "cid=12")).toBeNull();
    expect(campaignIdForChrome("/workers", "cid=12")).toBeNull();
  });
});
