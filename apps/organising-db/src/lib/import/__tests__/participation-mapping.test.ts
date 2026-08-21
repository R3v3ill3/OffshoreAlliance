import { describe, expect, it } from "vitest";
import {
  autoMapParticipationHeader,
  cellContainsToken,
  isLeadershipRoleName,
  isTruthyCell,
  resolveExtraCell,
  targetToRatingFields,
  type ResponseValueMapping,
} from "../participation-import-shared";

describe("autoMapParticipationHeader", () => {
  it("maps identity columns and leaves question columns alone", () => {
    expect(autoMapParticipationHeader("email")).toBe("email");
    expect(autoMapParticipationHeader("mobile_number")).toBe("phone");
    expect(autoMapParticipationHeader("first_name")).toBe("first_name");
    expect(autoMapParticipationHeader("contact")).toBe("ignore");
    expect(autoMapParticipationHeader("oa_be_contact")).toBe("ignore");
  });
});

describe("isTruthyCell", () => {
  it("accepts Action Network checkbox and yes-no values", () => {
    expect(isTruthyCell("1")).toBe(true);
    expect(isTruthyCell("Yes")).toBe(true);
    expect(isTruthyCell(" TRUE ")).toBe(true);
    expect(isTruthyCell("checked")).toBe(true);
    expect(isTruthyCell("x")).toBe(true);
  });

  it("rejects blanks and no", () => {
    expect(isTruthyCell("")).toBe(false);
    expect(isTruthyCell("0")).toBe(false);
    expect(isTruthyCell("no")).toBe(false);
    expect(isTruthyCell("Be a contact")).toBe(false);
  });
});

describe("cellContainsToken", () => {
  it("matches a segment in a combined multi-select cell", () => {
    const cell = "Be a contact, Ask others to join the union";
    expect(cellContainsToken(cell, "be a contact")).toBe(true);
    expect(cellContainsToken(cell, "Ask others to join the union")).toBe(true);
    expect(cellContainsToken(cell, "steward")).toBe(false);
  });

  it("matches a phrase inside a longer sentence", () => {
    expect(cellContainsToken("I will ask others to join", "ask others")).toBe(true);
  });

  it("ignores blank tokens and blank cells", () => {
    expect(cellContainsToken("Be a contact", "  ")).toBe(false);
    expect(cellContainsToken("", "contact")).toBe(false);
  });
});

describe("resolveExtraCell", () => {
  const yes = { kind: "binary" as const, value: "yes" };

  it("truthy mode records the matched target only when the cell is checked", () => {
    expect(resolveExtraCell("1", { mode: "truthy" }, yes)).toEqual(yes);
    expect(resolveExtraCell("", { mode: "truthy" }, yes)).toEqual({ kind: "ignore" });
  });

  it("contains mode uses the token", () => {
    expect(
      resolveExtraCell("Be a contact, Ask others", { mode: "contains", token: "be a contact" }, yes)
    ).toEqual(yes);
    expect(
      resolveExtraCell("Ask others", { mode: "contains", token: "be a contact" }, yes)
    ).toEqual({ kind: "ignore" });
  });

  it("exact mode uses the per-value map", () => {
    const valueMappings: ResponseValueMapping[] = [
      { rawValue: "Yes", count: 10, target: { kind: "binary", value: "yes" } },
      { rawValue: "Maybe", count: 3, target: { kind: "rating", rating: 3 } },
      { rawValue: "", count: 2, target: { kind: "ignore" } },
    ];
    expect(resolveExtraCell("Yes", { mode: "exact", valueMappings }, yes)).toEqual({
      kind: "binary",
      value: "yes",
    });
    expect(resolveExtraCell("Maybe", { mode: "exact", valueMappings }, yes)).toEqual({
      kind: "rating",
      rating: 3,
    });
    expect(resolveExtraCell("No", { mode: "exact", valueMappings }, yes)).toEqual({
      kind: "ignore",
    });
  });
});

describe("targetToRatingFields", () => {
  it("splits rating vs binary vs ignore", () => {
    expect(targetToRatingFields({ kind: "rating", rating: 2 })).toEqual({
      rating: 2,
      binary_value: null,
    });
    expect(targetToRatingFields({ kind: "binary", value: "yes" })).toEqual({
      rating: null,
      binary_value: "yes",
    });
    expect(targetToRatingFields({ kind: "ignore" })).toEqual({
      rating: null,
      binary_value: null,
    });
  });
});

describe("isLeadershipRoleName", () => {
  it("treats contact, activist and delegate as leadership roles", () => {
    expect(isLeadershipRoleName("Contact")).toBe(true);
    expect(isLeadershipRoleName("activist")).toBe(true);
    expect(isLeadershipRoleName("DELEGATE")).toBe(true);
    expect(isLeadershipRoleName("member")).toBe(false);
    expect(isLeadershipRoleName(null)).toBe(false);
  });
});
