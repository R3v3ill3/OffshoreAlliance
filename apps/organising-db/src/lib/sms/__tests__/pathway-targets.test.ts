import { describe, expect, it } from "vitest";
import { resolveSmsPathwayTarget } from "../pathway-targets";

describe("resolveSmsPathwayTarget", () => {
  it("blast with a cohort fires the blast pathway", () => {
    expect(
      resolveSmsPathwayTarget({ pathway: "blast", campaignId: 12, workerListId: 34 }),
    ).toEqual({ kind: "fire", body: { pathway: "blast" } });
  });

  it("blast without a cohort navigates to the blasts tab with new_blast=1", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "blast",
      campaignId: 12,
      workerListId: null,
    });
    expect(target).toEqual({
      kind: "navigate",
      href: "/campaigns/12?tab=outreach&sub=sms&sms_view=blasts&new_blast=1",
    });
  });

  it("survey with a cohort navigates with survey_source_list", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "survey",
      campaignId: 12,
      workerListId: 34,
    });
    expect(target).toEqual({
      kind: "navigate",
      href: "/campaigns/12?tab=outreach&sub=sms&sms_view=surveys&survey_source_list=34",
    });
  });

  it("survey without a cohort navigates to the surveys tab with new_survey=1", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "survey",
      campaignId: 12,
      workerListId: undefined,
    });
    expect(target).toEqual({
      kind: "navigate",
      href: "/campaigns/12?tab=outreach&sub=sms&sms_view=surveys&new_survey=1",
    });
  });

  it("chat is always unavailable with a cohort", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "chat",
      campaignId: 12,
      workerListId: 34,
    });
    expect(target.kind).toBe("unavailable");
  });

  it("chat is always unavailable without a cohort (regression guard: never routes at the inbox)", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "chat",
      campaignId: 12,
      workerListId: null,
    });
    expect(target.kind).toBe("unavailable");
  });

  it("every navigate href carries tab=outreach&sub=sms", () => {
    const targets = [
      resolveSmsPathwayTarget({ pathway: "blast", campaignId: 1, workerListId: null }),
      resolveSmsPathwayTarget({ pathway: "survey", campaignId: 1, workerListId: null }),
      resolveSmsPathwayTarget({ pathway: "survey", campaignId: 1, workerListId: 2 }),
    ];
    for (const t of targets) {
      if (t.kind === "navigate") {
        expect(t.href).toContain("tab=outreach&sub=sms");
      }
    }
  });

  it("interpolates campaign and list ids rather than templating them", () => {
    const target = resolveSmsPathwayTarget({
      pathway: "survey",
      campaignId: "999",
      workerListId: "555",
    });
    expect(target).toEqual({
      kind: "navigate",
      href: "/campaigns/999?tab=outreach&sub=sms&sms_view=surveys&survey_source_list=555",
    });
  });
});
