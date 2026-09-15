/** WP2.4 Stage 1 (wp2.4.md §3.11, §4.1) — the group-selection precedence chain. */

import { describe, expect, it } from "vitest";
import {
  groupParamValue,
  orderGroups,
  parseGroupParam,
  resolveGroupSelection,
  type ResolveGroupSelectionInput,
} from "../resolve-group-selection";

const GROUPS = [
  { group_id: 30, display_order: 2 },
  { group_id: 10, display_order: 1 },
  { group_id: 20, display_order: 1 },
];
const OUS = [
  { ou_id: 100, group_id: 30 },
  { ou_id: 101, group_id: 20 },
  { ou_id: 900, group_id: null },
];

function resolve(overrides: Partial<ResolveGroupSelectionInput> = {}) {
  return resolveGroupSelection({ groups: GROUPS, ous: OUS, ...overrides });
}

describe("orderGroups", () => {
  it("orders by display_order (nulls last) then group_id", () => {
    expect(orderGroups([...GROUPS, { group_id: 5, display_order: null }]).map((g) => g.group_id)).toEqual([10, 20, 30, 5]);
  });
});

describe("parseGroupParam / groupParamValue", () => {
  it("round-trips ids and none, and rejects everything else", () => {
    expect(parseGroupParam("20")).toBe(20);
    expect(parseGroupParam("none")).toBe("none");
    expect(parseGroupParam(" none ")).toBe("none");
    for (const bad of ["", "0", "-1", "1.5", "abc", "20abc", null, undefined]) {
      expect(parseGroupParam(bad), String(bad)).toBeNull();
    }
    expect(groupParamValue(20)).toBe("20");
    expect(groupParamValue("none")).toBe("none");
  });
});

describe("resolveGroupSelection — precedence ?ou → ?group → prefs → first group → none", () => {
  it("?ou= wins: the focused unit's group", () => {
    expect(resolve({ ouParam: "100", groupParam: "20", prefsGroup: 10 })).toEqual({ selection: 30, source: "ou" });
  });

  it("?ou= naming an unknown unit, a unit without a group, or garbage falls through", () => {
    expect(resolve({ ouParam: "12345", groupParam: "20" })).toEqual({ selection: 20, source: "url" });
    expect(resolve({ ouParam: "900", groupParam: "20" })).toEqual({ selection: 20, source: "url" });
    expect(resolve({ ouParam: "x", groupParam: "20" })).toEqual({ selection: 20, source: "url" });
  });

  it("?group= wins over prefs when it names a live group or none", () => {
    expect(resolve({ groupParam: "20", prefsGroup: 10 })).toEqual({ selection: 20, source: "url" });
    expect(resolve({ groupParam: "none", prefsGroup: 10 })).toEqual({ selection: "none", source: "url" });
  });

  it("an invalid or stale ?group= falls through to prefs", () => {
    expect(resolve({ groupParam: "999", prefsGroup: 10 })).toEqual({ selection: 10, source: "prefs" });
    expect(resolve({ groupParam: "abc", prefsGroup: "none" })).toEqual({ selection: "none", source: "prefs" });
  });

  it("a stale prefs group falls through to the first group by display_order", () => {
    expect(resolve({ prefsGroup: 999 })).toEqual({ selection: 10, source: "first" });
    expect(resolve({})).toEqual({ selection: 10, source: "first" });
    expect(resolve({ prefsGroup: null })).toEqual({ selection: 10, source: "first" });
  });

  it("with no groups only none remains, whatever the inputs say", () => {
    expect(resolve({ groups: [], ouParam: "100", groupParam: "30", prefsGroup: 30 })).toEqual({ selection: "none", source: "none" });
    expect(resolve({ groups: [], groupParam: "none" })).toEqual({ selection: "none", source: "url" });
  });

  it("never throws on nonsense", () => {
    expect(() =>
      resolveGroupSelection({
        groups: GROUPS,
        ous: OUS,
        ouParam: "NaN",
        groupParam: "1e9",
        prefsGroup: -1,
      })
    ).not.toThrow();
  });
});
