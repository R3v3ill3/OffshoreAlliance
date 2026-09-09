import { describe, expect, it } from "vitest";
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

  it("refuses a pending entry even when every input is true", () => {
    // wall_chart_group_selector is data only until WP2.4 wires the control.
    expect(shouldShowHint("wall_chart_group_selector", ALL_TRUE)).toBe(false);
  });
});
