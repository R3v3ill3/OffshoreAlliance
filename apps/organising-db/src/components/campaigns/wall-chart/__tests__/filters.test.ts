import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTER_STATE,
  activeFilterKeys,
  hasActiveFilter,
  type WallChartFilterState,
} from "../filters";

const state = (patch: Partial<WallChartFilterState> = {}): WallChartFilterState => ({
  ...DEFAULT_FILTER_STATE(),
  ...patch,
});

describe("activeFilterKeys", () => {
  it("returns nothing for the default (unfiltered) state", () => {
    expect(activeFilterKeys(DEFAULT_FILTER_STATE())).toEqual([]);
  });

  it("reports membership for a selected membership type", () => {
    expect(activeFilterKeys(state({ membershipTypeIds: new Set([1]) }))).toEqual([
      "membership",
    ]);
  });

  it("reports membership for includeNonMember alone", () => {
    expect(activeFilterKeys(state({ includeNonMember: true }))).toEqual(["membership"]);
  });

  it("reports roles", () => {
    expect(activeFilterKeys(state({ roles: new Set(["delegate"]) }))).toEqual(["roles"]);
  });

  it("reports ratings", () => {
    expect(activeFilterKeys(state({ ratings: new Set(["unrated"]) }))).toEqual(["ratings"]);
  });

  it("reports occupations", () => {
    expect(activeFilterKeys(state({ occupationIds: new Set([9]) }))).toEqual(["occupations"]);
  });

  it("reports phone and email presence", () => {
    expect(activeFilterKeys(state({ phone: "has" }))).toEqual(["phone"]);
    expect(activeFilterKeys(state({ email: "missing" }))).toEqual(["email"]);
  });

  it("reports assessments only when a bucket is actually chosen", () => {
    expect(
      activeFilterKeys(
        state({ assessmentFilters: [{ activityId: 1, buckets: new Set() }] })
      )
    ).toEqual([]);
    expect(
      activeFilterKeys(
        state({ assessmentFilters: [{ activityId: 1, buckets: new Set(["3"]) }] })
      )
    ).toEqual(["assessments"]);
  });

  it("reports facts", () => {
    expect(
      activeFilterKeys(state({ factFilters: [{ field_id: 4, op: "exists" }] }))
    ).toEqual(["facts"]);
  });

  it("reports every active dimension, in declaration order", () => {
    expect(
      activeFilterKeys(
        state({
          membershipTypeIds: new Set([1]),
          roles: new Set(["hsr"]),
          ratings: new Set(["1"]),
          occupationIds: new Set([2]),
          phone: "has",
          email: "has",
          assessmentFilters: [{ activityId: 7, buckets: new Set(["5"]) }],
          factFilters: [{ field_id: 4, op: "exists" }],
        })
      )
    ).toEqual([
      "membership",
      "roles",
      "ratings",
      "occupations",
      "phone",
      "email",
      "assessments",
      "facts",
    ]);
  });

  it("ignores sort — it is not a filter", () => {
    expect(activeFilterKeys(state({ sort: "cumulative_desc" }))).toEqual([]);
  });
});

describe("activeFilterKeys agrees with hasActiveFilter", () => {
  const table: WallChartFilterState[] = [
    DEFAULT_FILTER_STATE(),
    state({ sort: "relationships" }),
    state({ sortFactFieldId: 3 }),
    state({ membershipTypeIds: new Set([1, 2]) }),
    state({ includeNonMember: true }),
    state({ roles: new Set(["activist", "contact"]) }),
    state({ ratings: new Set(["2", "4"]) }),
    state({ occupationIds: new Set([11]) }),
    state({ phone: "missing" }),
    state({ email: "has" }),
    state({ assessmentFilters: [{ activityId: 1, buckets: new Set() }] }),
    state({ assessmentFilters: [{ activityId: 1, buckets: new Set(["unrated"]) }] }),
    state({ factFilters: [{ field_id: 1, op: "eq", bool: true }] }),
    state({ phone: "has", roles: new Set(["delegate"]) }),
  ];

  it.each(table.map((s, i) => [i, s] as const))(
    "state %i: keys.length > 0 === hasActiveFilter",
    (_i, s) => {
      expect(activeFilterKeys(s).length > 0).toBe(hasActiveFilter(s));
    }
  );
});
