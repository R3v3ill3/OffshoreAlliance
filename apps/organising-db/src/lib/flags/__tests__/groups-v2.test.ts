/**
 * WP2.4 (FL-b, wp2.4.md §3.2, §4.1) — the one reader of `groups_v2` reads the
 * workspace context's resolved flags and nothing else; default off.
 */

import { describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ flags: { groupsV2: false } as { groupsV2: boolean } }));

vi.mock("@/lib/workspace/use-workspace", () => ({
  useWorkspace: () => ({ flags: ctx.flags }),
}));

import { isGroupsV2, useGroupsV2 } from "../groups-v2";

describe("isGroupsV2 (pure)", () => {
  it("is true only for an explicit true", () => {
    expect(isGroupsV2({ groupsV2: true })).toBe(true);
    expect(isGroupsV2({ groupsV2: false })).toBe(false);
    expect(isGroupsV2(null)).toBe(false);
    expect(isGroupsV2(undefined)).toBe(false);
  });
});

describe("useGroupsV2 (reads useWorkspace().flags)", () => {
  it("is false by default and true when the context resolves the flag on", () => {
    ctx.flags = { groupsV2: false };
    expect(useGroupsV2()).toBe(false);
    ctx.flags = { groupsV2: true };
    expect(useGroupsV2()).toBe(true);
  });
});
