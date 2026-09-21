import { describe, expect, it } from "vitest";
import { weeklyUpdatesHref } from "../href";

describe("weeklyUpdatesHref", () => {
  it("opens Data Management → Weekly Updates", () => {
    expect(weeklyUpdatesHref()).toBe("/administration?tab=data&sub=weekly_updates");
  });

  it("deep-links a ready batch into the import wizard", () => {
    expect(weeklyUpdatesHref(42)).toBe("/administration?tab=data&sub=weekly_updates&batch=42");
  });
});
