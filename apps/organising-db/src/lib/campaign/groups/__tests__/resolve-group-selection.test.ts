/** WP2.4 Stage 1 (wp2.4.md §3.11, §4.1) — the group-selection precedence chain. */

import { describe, expect, it } from "vitest";
import {
  groupParamValue,
  orderGroups,
  parseGroupParam,
  resolveGroupSelection,
  type ResolveGroupSelectionInput,
} from "../resolve-group-selection";
import { primaryGroups } from "../derive-group-tree";
import {
  CAMPAIGN_42_GROUPS,
  CAMPAIGN_42_GROUP_IDS,
  CAMPAIGN_42_OU_IDS,
  CAMPAIGN_42_UNITS,
} from "./fixtures/campaign-42-shape";

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

/**
 * WP2.4c Stage 1 (wp2.4c.md §3.5 SG-a, §4.1) — the optional `primaryIds`.
 * Absent, every case above is unchanged; present, the chain is narrowed to the
 * groups the selector offers and a nested unit opens on its root's group.
 */
describe("resolveGroupSelection — primaryIds (WP2.4c SG-a)", () => {
  const groups = CAMPAIGN_42_GROUPS;
  const ous = CAMPAIGN_42_UNITS;
  const primaryIds = primaryGroups(groups, ous).map((g) => g.group_id);

  function resolvePrimary(overrides: Partial<ResolveGroupSelectionInput> = {}) {
    return resolveGroupSelection({ groups, ous, primaryIds, ...overrides });
  }

  it("Shift is sub-unit-only, so it is not among the primary ids", () => {
    expect(primaryIds).toEqual([CAMPAIGN_42_GROUP_IDS.employer, CAMPAIGN_42_GROUP_IDS.worksite]);
  });

  it("a ?group= or a stored preference naming a sub-unit-only group falls through", () => {
    expect(resolvePrimary({ groupParam: String(CAMPAIGN_42_GROUP_IDS.shift) })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.employer,
      source: "first",
    });
    expect(resolvePrimary({ prefsGroup: CAMPAIGN_42_GROUP_IDS.shift })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.employer,
      source: "first",
    });
    expect(
      resolvePrimary({ groupParam: String(CAMPAIGN_42_GROUP_IDS.shift), prefsGroup: CAMPAIGN_42_GROUP_IDS.worksite })
    ).toEqual({ selection: CAMPAIGN_42_GROUP_IDS.worksite, source: "prefs" });
    // "none" is always reachable.
    expect(resolvePrimary({ groupParam: "none" })).toEqual({ selection: "none", source: "url" });
  });

  it("?ou= naming a nested unit resolves to its root's group, and the focus id is unchanged", () => {
    expect(resolvePrimary({ ouParam: String(CAMPAIGN_42_OU_IDS.day) })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.worksite,
      source: "ou",
    });
    expect(resolvePrimary({ ouParam: String(CAMPAIGN_42_OU_IDS.kgp) })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.worksite,
      source: "ou",
    });
    // A unit whose whole chain carries no primary group still falls through.
    expect(resolvePrimary({ ouParam: String(CAMPAIGN_42_OU_IDS.legacyContainer), groupParam: "none" })).toEqual({
      selection: "none",
      source: "url",
    });
  });

  it("without primaryIds the WP2.4 behaviour is byte-for-byte: the nested unit's OWN group wins", () => {
    expect(resolveGroupSelection({ groups, ous, ouParam: String(CAMPAIGN_42_OU_IDS.day) })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.shift,
      source: "ou",
    });
    expect(resolveGroupSelection({ groups, ous, groupParam: String(CAMPAIGN_42_GROUP_IDS.shift) })).toEqual({
      selection: CAMPAIGN_42_GROUP_IDS.shift,
      source: "url",
    });
  });

  it("with no primary group at all only Not in any group remains", () => {
    expect(resolvePrimary({ primaryIds: [], groupParam: "20" })).toEqual({ selection: "none", source: "none" });
  });
});
