import { describe, expect, it } from "vitest";
import { HINT_BY_ID } from "../registry";
import { shouldShowHint, type ShouldShowHintInput } from "../should-show";

const ALL_TRUE: ShouldShowHintInput = {
  seen: false,
  loaded: true,
  hasTiles: true,
  dismissedThisSession: false,
  canWrite: true,
};

describe("shouldShowHint", () => {
  it("shows the rating hint when loaded, unseen, undismissed, with tiles and write access", () => {
    expect(shouldShowHint("wall_chart_rating", ALL_TRUE)).toBe(true);
  });

  it.each<[string, Partial<ShouldShowHintInput>]>([
    ["already seen", { seen: true }],
    ["dismissed this session", { dismissedThisSession: true }],
    ["no tiles", { hasTiles: false }],
    ["read-only viewer", { canWrite: false }],
    ["dismissals not loaded (fails closed)", { loaded: false }],
  ])("refuses when %s", (_label, override) => {
    expect(shouldShowHint("wall_chart_rating", { ...ALL_TRUE, ...override })).toBe(false);
  });

  it("shows the group-selector hint now that WP2.4 wired the control", () => {
    expect(shouldShowHint("wall_chart_group_selector", ALL_TRUE)).toBe(true);
  });

  it("refuses a pending entry even when every input is true", () => {
    // No registered entry is pending any more (wp2.4.md §3.16), so the guard
    // is exercised by marking one pending for the duration of this case.
    const entry = HINT_BY_ID.wall_chart_group_selector;
    entry.pending = "WPx.y";
    try {
      expect(shouldShowHint("wall_chart_group_selector", ALL_TRUE)).toBe(false);
    } finally {
      delete entry.pending;
    }
  });
});
