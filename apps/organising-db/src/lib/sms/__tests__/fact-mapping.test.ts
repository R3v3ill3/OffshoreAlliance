import { describe, expect, it } from "vitest";
import { mapSurveyAnswerToFact } from "../fact-mapping";
import type { CampaignDataField } from "@/lib/campaign-facts/types";

function field(
  overrides: Partial<CampaignDataField> & Pick<CampaignDataField, "value_type">
): Pick<CampaignDataField, "value_type" | "enum_options" | "scale_min" | "scale_max"> {
  return {
    enum_options: ["yes", "no", "unsure"],
    scale_min: 1,
    scale_max: 5,
    ...overrides,
  };
}

describe("mapSurveyAnswerToFact", () => {
  it("uses the parsed survey value when it is valid", () => {
    expect(mapSurveyAnswerToFact(field({ value_type: "integer" }), "2", "two")).toEqual({
      kind: "int",
      value: 2,
    });
  });

  it("falls back to the raw SMS body for text when parsed is empty", () => {
    expect(
      mapSurveyAnswerToFact(field({ value_type: "text" }), null, "Fatigue on swing")
    ).toEqual({ kind: "text", value: "Fatigue on swing" });
  });

  it("falls back to the raw body for boolean when parsed is blank", () => {
    expect(mapSurveyAnswerToFact(field({ value_type: "boolean" }), "  ", "Yes")).toEqual({
      kind: "bool",
      value: true,
    });
  });

  it("does not override an invalid parsed scale with the raw body", () => {
    expect(mapSurveyAnswerToFact(field({ value_type: "scale" }), "9", "3").kind).toBe("invalid");
  });
});
