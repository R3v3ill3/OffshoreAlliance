import { describe, expect, it } from "vitest";
import {
  CUSTOM_TEMPLATE,
  seedIsBinaryForTemplate,
  supporterOutcomeForSave,
} from "../assessment-form";

describe("seedIsBinaryForTemplate", () => {
  it("seeds binary from a template that defaults to it", () => {
    expect(seedIsBinaryForTemplate("vote", false)).toBe(true);
  });

  it("seeds a rating scale for templates with no binary default", () => {
    expect(seedIsBinaryForTemplate("attend_worksite_meeting", true)).toBe(false);
  });

  it("keeps the author's choice when they pick Custom", () => {
    // Switching to Custom is not a reset — someone who has chosen
    // binary and then goes to Custom to write their own title should
    // not silently get a rating scale.
    expect(seedIsBinaryForTemplate(CUSTOM_TEMPLATE, true)).toBe(true);
    expect(seedIsBinaryForTemplate(CUSTOM_TEMPLATE, false)).toBe(false);
  });

  it("falls back to a rating scale for an unknown template key", () => {
    expect(seedIsBinaryForTemplate("not_a_template", true)).toBe(false);
  });
});

describe("supporterOutcomeForSave", () => {
  it("saves nothing for a rating-scale assessment", () => {
    expect(supporterOutcomeForSave(false, "yes")).toBeNull();
    expect(supporterOutcomeForSave(false, null)).toBeNull();
  });

  it("keeps an explicit choice", () => {
    expect(supporterOutcomeForSave(true, "no")).toBe("no");
  });

  it("defaults an untouched binary form to yes", () => {
    // The picker renders "yes" at rest, so saving nothing would
    // contradict what the author was looking at. This previously only
    // happened for the vote template.
    expect(supporterOutcomeForSave(true, "")).toBe("yes");
    expect(supporterOutcomeForSave(true, null)).toBe("yes");
    expect(supporterOutcomeForSave(true, undefined)).toBe("yes");
    expect(supporterOutcomeForSave(true, "   ")).toBe("yes");
  });
});
