import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTER_STATE,
  activeFilterKeys,
  applyFilters,
  hasActiveFilter,
  type WallChartFilterState,
} from "../filters";
import type { WallChartRatingSummary, WallChartWorker } from "../types";

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

// ---------------------------------------------------------------------------
// WP2.4 (wp2.4.md §3.10, §4.1) — the two additive dimensions. The cases above
// are unchanged: a state without the new keys, and the default state, report
// and filter exactly as before.
// ---------------------------------------------------------------------------

const worker = (id: number): WallChartWorker => ({ worker_id: id, first_name: "W", last_name: String(id) }) as unknown as WallChartWorker;

describe("WP2.4 — in unit of another group / participation", () => {
  const workerById = new Map<number, WallChartWorker>([1, 2, 3].map((id) => [id, worker(id)]));
  const ratingByWorker = new Map<number, WallChartRatingSummary>();
  // 1 → units 10 (group A) and 20 (group B); 2 → unit 21 (group B); 3 → nothing.
  const unitsByWorkerAllGroups = new Map<number, Set<number>>([
    [1, new Set([10, 20])],
    [2, new Set([21])],
  ]);

  it("the defaults are inactive: no keys, hasActiveFilter false, applyFilters returns the ids untouched", () => {
    expect(DEFAULT_FILTER_STATE().otherGroupUnitIds?.size).toBe(0);
    expect(DEFAULT_FILTER_STATE().participation).toEqual({ kind: "any" });
    expect(activeFilterKeys(DEFAULT_FILTER_STATE())).toEqual([]);
    expect(hasActiveFilter(DEFAULT_FILTER_STATE())).toBe(false);
    // A state built before WP2.4 (keys absent) behaves the same.
    const legacy = { ...DEFAULT_FILTER_STATE() };
    delete legacy.otherGroupUnitIds;
    delete legacy.participation;
    expect(activeFilterKeys(legacy)).toEqual([]);
    expect(hasActiveFilter(legacy)).toBe(false);
    const ids = [1, 2, 3];
    expect(applyFilters(ids, workerById, ratingByWorker, legacy)).toBe(ids);
  });

  it("reports other_group and participation as keys, after the existing dimensions", () => {
    expect(activeFilterKeys(state({ otherGroupUnitIds: new Set([20]) }))).toEqual(["other_group"]);
    expect(activeFilterKeys(state({ participation: { kind: "latest" } }))).toEqual(["participation"]);
    expect(
      activeFilterKeys(
        state({ phone: "has", otherGroupUnitIds: new Set([20]), participation: { kind: "activity", activityId: 1, label: "x" } })
      )
    ).toEqual(["phone", "other_group", "participation"]);
    expect(hasActiveFilter(state({ participation: { kind: "any" } }))).toBe(false);
  });

  it("keeps a worker iff they hold a placement on one of the chosen units (OR within the set)", () => {
    const s = state({ otherGroupUnitIds: new Set([20, 21]) });
    expect(applyFilters([1, 2, 3], workerById, ratingByWorker, s, undefined, undefined, undefined, undefined, unitsByWorkerAllGroups)).toEqual([1, 2]);
    const only20 = state({ otherGroupUnitIds: new Set([20]) });
    expect(applyFilters([1, 2, 3], workerById, ratingByWorker, only20, undefined, undefined, undefined, undefined, unitsByWorkerAllGroups)).toEqual([1]);
  });

  it("ANDs with the other dimensions", () => {
    const s = state({ otherGroupUnitIds: new Set([20, 21]), phone: "has" });
    const withPhone = new Map(workerById);
    withPhone.set(2, { ...worker(2), phone: "0400" } as unknown as WallChartWorker);
    expect(applyFilters([1, 2, 3], withPhone, ratingByWorker, s, undefined, undefined, undefined, undefined, unitsByWorkerAllGroups)).toEqual([2]);
  });

  it("without the all-groups index nobody can be confirmed, so nobody passes", () => {
    const s = state({ otherGroupUnitIds: new Set([20]) });
    expect(applyFilters([1, 2, 3], workerById, ratingByWorker, s)).toEqual([]);
  });

  it("participation alone never filters in applyFilters (the predicate is the view-metrics hook's)", () => {
    const s = state({ participation: { kind: "latest" } });
    expect(applyFilters([1, 2, 3], workerById, ratingByWorker, s)).toEqual([1, 2, 3]);
  });
});
