import { describe, expect, it } from "vitest";
import {
  displayFactValue,
  factMatchesFilter,
  fieldKeyForCategory,
  parseFactRawValue,
  parsedToRpcArgs,
  rankToSuggestedHeat,
  slugifyFieldKey,
  workerPassesFactFilters,
} from "../values";
import type { CampaignDataField, WorkerCampaignFact } from "../types";

function field(
  overrides: Partial<CampaignDataField> & Pick<CampaignDataField, "value_type">
): CampaignDataField {
  return {
    field_id: 1,
    campaign_id: 10,
    fieldset_id: null,
    key: "claim.fatigue",
    label: "Fatigue",
    category: "claims",
    enum_options: ["high", "medium", "low"],
    scale_min: 1,
    scale_max: 5,
    filterable: true,
    sortable: true,
    sort_order: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function fact(
  overrides: Partial<WorkerCampaignFact> = {}
): WorkerCampaignFact {
  return {
    fact_id: 1,
    campaign_id: 10,
    worker_id: 5,
    field_id: 1,
    value_bool: null,
    value_int: null,
    value_text: null,
    value_enum: null,
    value_json: null,
    collected_at: "",
    source: "staff",
    source_ref: null,
    notes: null,
    recorded_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("fieldKeyForCategory", () => {
  it("prefixes claims and compliance slugs", () => {
    expect(fieldKeyForCategory("claims", "Fatigue Rank")).toBe("claim.fatigue_rank");
    expect(fieldKeyForCategory("compliance", "Witnessed underpayment")).toBe(
      "compliance.witnessed_underpayment"
    );
  });

  it("keeps an explicit key", () => {
    expect(fieldKeyForCategory("claims", "x", "claim.custom")).toBe("claim.custom");
  });
});

describe("slugifyFieldKey", () => {
  it("strips punctuation", () => {
    expect(slugifyFieldKey("  Fatigue / heat?? ")).toBe("fatigue_heat");
  });
});

describe("parseFactRawValue", () => {
  it("parses yes/no", () => {
    expect(parseFactRawValue(field({ value_type: "boolean" }), "Yes")).toEqual({
      kind: "bool",
      value: true,
    });
    expect(parseFactRawValue(field({ value_type: "boolean" }), "0")).toEqual({
      kind: "bool",
      value: false,
    });
  });

  it("parses scale within bounds", () => {
    expect(parseFactRawValue(field({ value_type: "scale" }), "3")).toEqual({
      kind: "int",
      value: 3,
    });
    expect(parseFactRawValue(field({ value_type: "scale" }), "9").kind).toBe("invalid");
  });

  it("maps enum case-insensitively", () => {
    expect(parseFactRawValue(field({ value_type: "enum" }), "HIGH")).toEqual({
      kind: "enum",
      value: "high",
    });
  });

  it("splits multi_enum on commas", () => {
    expect(
      parseFactRawValue(field({ value_type: "multi_enum" }), "high, Low")
    ).toEqual({ kind: "multi", value: ["high", "low"] });
  });
});

describe("parsedToRpcArgs", () => {
  it("only fills the matching column", () => {
    expect(parsedToRpcArgs({ kind: "bool", value: true }).p_value_bool).toBe(true);
    expect(parsedToRpcArgs({ kind: "int", value: 2 }).p_value_int).toBe(2);
    expect(parsedToRpcArgs({ kind: "multi", value: ["a"] }).p_value_json).toEqual(["a"]);
  });
});

describe("factMatchesFilter", () => {
  it("treats missing as missing", () => {
    expect(factMatchesFilter(null, { field_id: 1, op: "missing" })).toBe(true);
    expect(factMatchesFilter(fact(), { field_id: 1, op: "exists" })).toBe(true);
  });

  it("matches boolean and rank ranges", () => {
    expect(
      factMatchesFilter(fact({ value_bool: true }), {
        field_id: 1,
        op: "eq",
        bool: true,
      })
    ).toBe(true);
    expect(
      factMatchesFilter(fact({ value_int: 2 }), {
        field_id: 1,
        op: "between",
        int: 1,
        int_max: 2,
      })
    ).toBe(true);
  });

  it("matches enum in lists", () => {
    expect(
      factMatchesFilter(fact({ value_enum: "high" }), {
        field_id: 1,
        op: "in",
        enums: ["high", "medium"],
      })
    ).toBe(true);
  });
});

describe("workerPassesFactFilters", () => {
  it("requires every filter", () => {
    const map = new Map([
      [1, fact({ field_id: 1, value_bool: true })],
      [2, fact({ field_id: 2, value_int: 1 })],
    ]);
    expect(
      workerPassesFactFilters(map, [
        { field_id: 1, op: "eq", bool: true },
        { field_id: 2, op: "lte", int: 2 },
      ])
    ).toBe(true);
    expect(
      workerPassesFactFilters(map, [
        { field_id: 1, op: "eq", bool: true },
        { field_id: 2, op: "eq", int: 5 },
      ])
    ).toBe(false);
  });
});

describe("displayFactValue", () => {
  it("renders boolean and enum labels", () => {
    expect(
      displayFactValue(field({ value_type: "boolean" }), fact({ value_bool: false }))
    ).toBe("No");
    expect(
      displayFactValue(
        field({
          value_type: "enum",
          enum_options: [{ value: "high", label: "High heat" }],
        }),
        fact({ value_enum: "high" })
      )
    ).toBe("High heat");
  });
});

describe("rankToSuggestedHeat", () => {
  it("maps first rank to 5 and last to 1", () => {
    expect(rankToSuggestedHeat(1, 5)).toBe(5);
    expect(rankToSuggestedHeat(5, 5)).toBe(1);
    expect(rankToSuggestedHeat(3, 5)).toBe(3);
  });
});
