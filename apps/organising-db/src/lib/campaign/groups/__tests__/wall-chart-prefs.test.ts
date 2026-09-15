/** WP2.4 Stage 1 (wp2.4.md §3.11, §4.1) — the `wallChart` prefs document: lenient parse, filter round-trip, merge. */

import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER_STATE, type WallChartFilterState } from "@/components/campaigns/wall-chart/filters";
import {
  WALL_CHART_PREFS_KEY,
  filterStateFromPrefs,
  filterStateToPrefs,
  mergeWallChartPrefs,
  parseWallChartPrefs,
} from "../wall-chart-prefs";

const FULL_DOC = {
  v: 1,
  group: 20,
  colourBy: { kind: "assessment", activityId: 7 },
  filter: {
    membershipTypeIds: [3, 1],
    includeNonMember: true,
    roles: ["hsr", "delegate"],
    ratings: ["3", "unrated"],
    occupationIds: [9],
    phone: "has",
    email: "missing",
    assessmentFilters: [{ activityId: 7, buckets: ["5", "1"] }],
    factFilters: [{ field_id: 4, op: "in", enums: ["a", "b"] }],
    otherGroupUnitIds: [101, 100],
  },
  sort: "cumulative_desc",
  sortFactFieldId: null,
  participation: { kind: "activity", activityId: 7, label: "Site meeting" },
  showEmptyUnits: true,
  displayMode: "count",
  hiddenOuIds: [100, 200],
  overlay: true,
  badges: ["phone", "sms"],
};

describe("parseWallChartPrefs (lenient reader)", () => {
  it("returns { v: 1 } for anything that is not a document", () => {
    for (const v of [null, undefined, [], "x", 0, true]) expect(parseWallChartPrefs(v), String(v)).toEqual({ v: 1 });
  });

  it("round-trips a full document and ignores unknown keys at both levels", () => {
    const parsed = parseWallChartPrefs({ ...FULL_DOC, compare: { a: 1 }, layout: "list", filter: { ...FULL_DOC.filter, future: 1 } });
    expect(parsed).toEqual(FULL_DOC);
  });

  it("drops a malformed key on its own and keeps the keys beside it", () => {
    const parsed = parseWallChartPrefs({
      group: "worksite",
      colourBy: { kind: "assessment" },
      sort: "by_magic",
      sortFactFieldId: "4",
      participation: { kind: "activity", activityId: "x" },
      showEmptyUnits: "yes",
      displayMode: "percent",
      hiddenOuIds: [1, "2", 3],
      overlay: 1,
      badges: ["phone", "fax"],
      filter: {
        membershipTypeIds: [1, 2],
        roles: ["delegate", "boss"],
        phone: "maybe",
        assessmentFilters: [{ activityId: 7, buckets: ["9"] }],
        factFilters: "none",
        otherGroupUnitIds: [5],
      },
    });
    expect(parsed).toEqual({
      v: 1,
      filter: { membershipTypeIds: [1, 2], otherGroupUnitIds: [5] },
    });
  });

  it("drops stale ids when the live sets are given: group, colourBy activity, hidden units, other-group units, assessment filters, participation activity", () => {
    const known = {
      groupIds: new Set([10]),
      ouIds: new Set([100]),
      activityIds: new Set([8]),
    };
    const parsed = parseWallChartPrefs(FULL_DOC, known);
    expect(parsed.group).toBeUndefined();
    expect(parsed.colourBy).toBeUndefined(); // → cumulative by absence
    expect(parsed.hiddenOuIds).toEqual([100]);
    expect(parsed.filter?.otherGroupUnitIds).toEqual([100]);
    expect(parsed.filter?.assessmentFilters).toEqual([]);
    expect(parsed.participation).toBeUndefined();

    // Ids that still exist survive; "none", "cumulative" and non-activity participation never depend on ids.
    const live = parseWallChartPrefs(
      { ...FULL_DOC, group: "none", colourBy: { kind: "cumulative" }, participation: { kind: "latest" } },
      { groupIds: new Set(), ouIds: new Set([100, 101, 200]), activityIds: new Set([7]) }
    );
    expect(live.group).toBe("none");
    expect(live.colourBy).toEqual({ kind: "cumulative" });
    expect(live.participation).toEqual({ kind: "latest" });
    expect(live.hiddenOuIds).toEqual([100, 200]);
    expect(live.filter?.assessmentFilters).toEqual([{ activityId: 7, buckets: ["5", "1"] }]);
  });

  it("drops a stale data-field id from sortFactFieldId and factFilters when factFieldIds is given (A6)", () => {
    const doc = { ...FULL_DOC, sortFactFieldId: 4, filter: { ...FULL_DOC.filter, factFilters: [{ field_id: 4, op: "exists" }, { field_id: 5, op: "exists" }] } };
    const stale = parseWallChartPrefs(doc, { factFieldIds: new Set([5]) });
    expect(stale.sortFactFieldId).toBeUndefined();
    expect(stale.filter?.factFilters).toEqual([{ field_id: 5, op: "exists" }]);
    const live = parseWallChartPrefs(doc, { factFieldIds: new Set([4, 5]) });
    expect(live.sortFactFieldId).toBe(4);
    expect(live.filter?.factFilters).toHaveLength(2);
    expect(parseWallChartPrefs({ sortFactFieldId: null }, { factFieldIds: new Set() }).sortFactFieldId).toBeNull();
  });

  it("a v other than 1 is still read leniently (forward compatible)", () => {
    expect(parseWallChartPrefs({ v: 2, group: 3 })).toEqual({ v: 1, group: 3 });
  });
});

describe("filterStateToPrefs / filterStateFromPrefs", () => {
  const state = (): WallChartFilterState => ({
    ...DEFAULT_FILTER_STATE(),
    sort: "fact_asc",
    sortFactFieldId: 4,
    membershipTypeIds: new Set([3, 1, 2]),
    includeNonMember: true,
    roles: new Set(["hsr", "delegate"]),
    ratings: new Set(["3", "unrated"]),
    occupationIds: new Set([9]),
    phone: "has",
    email: "missing",
    assessmentFilters: [{ activityId: 7, buckets: new Set(["5", "1"]) }],
    factFilters: [{ field_id: 4, op: "between", int: 1, int_max: 5 }],
    otherGroupUnitIds: new Set([101, 100]),
    participation: { kind: "task_list", taskListId: 3, activityId: null, label: "Callers" },
  });

  it("serialises Sets as sorted arrays (ids ascending, keys in their declared order)", () => {
    expect(filterStateToPrefs(state())).toEqual({
      filter: {
        membershipTypeIds: [1, 2, 3],
        includeNonMember: true,
        roles: ["delegate", "hsr"],
        ratings: ["unrated", "3"],
        occupationIds: [9],
        phone: "has",
        email: "missing",
        assessmentFilters: [{ activityId: 7, buckets: ["1", "5"] }],
        factFilters: [{ field_id: 4, op: "between", int: 1, int_max: 5 }],
        otherGroupUnitIds: [100, 101],
      },
      sort: "fact_asc",
      sortFactFieldId: 4,
      participation: { kind: "task_list", taskListId: 3, activityId: null, label: "Callers" },
    });
  });

  it("round-trips through the lenient parser back to an equal state (Sets restored)", () => {
    const original = state();
    const stored = JSON.parse(JSON.stringify(filterStateToPrefs(original)));
    const restored = filterStateFromPrefs(parseWallChartPrefs(stored));
    expect(restored).toEqual(original);
    expect(restored.membershipTypeIds).toBeInstanceOf(Set);
    expect(restored.assessmentFilters[0].buckets).toBeInstanceOf(Set);
    expect(restored.otherGroupUnitIds).toBeInstanceOf(Set);
  });

  it("a state without the WP2.4 keys serialises with empty defaults, and a document without them restores the defaults", () => {
    const legacy = { ...DEFAULT_FILTER_STATE() };
    delete legacy.otherGroupUnitIds;
    delete legacy.participation;
    const stored = filterStateToPrefs(legacy);
    expect(stored.filter?.otherGroupUnitIds).toEqual([]);
    expect(stored.participation).toEqual({ kind: "any" });

    expect(filterStateFromPrefs({ v: 1 })).toEqual(DEFAULT_FILTER_STATE());
    expect(filterStateFromPrefs({ v: 1, filter: { phone: "has" }, sort: "occupation" })).toEqual({
      ...DEFAULT_FILTER_STATE(),
      phone: "has",
      sort: "occupation",
    });
  });
});

describe("mergeWallChartPrefs", () => {
  it("writes the wallChart key and keeps every foreign key at both levels (compare, layout, anything else)", () => {
    const document = {
      compare: { groupIds: [1, 2] },
      layout: "list",
      somethingElse: 42,
      wallChart: { v: 1, group: 10, hiddenOuIds: [5], compareLocal: "kept too" },
    };
    const next = mergeWallChartPrefs(document, { group: "none", showEmptyUnits: true });
    expect(next).toEqual({
      compare: { groupIds: [1, 2] },
      layout: "list",
      somethingElse: 42,
      wallChart: { v: 1, group: "none", hiddenOuIds: [5], compareLocal: "kept too", showEmptyUnits: true },
    });
    // The input is not mutated.
    expect(document.wallChart.group).toBe(10);
  });

  it("treats a non-object document as empty, stamps v, and removes a key patched to undefined", () => {
    expect(mergeWallChartPrefs(null, { group: 3 })).toEqual({ [WALL_CHART_PREFS_KEY]: { v: 1, group: 3 } });
    expect(mergeWallChartPrefs("x", {})).toEqual({ wallChart: { v: 1 } });
    expect(mergeWallChartPrefs({ wallChart: "broken", other: 1 }, { overlay: true })).toEqual({ other: 1, wallChart: { v: 1, overlay: true } });
    expect(mergeWallChartPrefs({ wallChart: { v: 1, group: 3, overlay: true } }, { group: undefined })).toEqual({ wallChart: { v: 1, overlay: true } });
  });
});
