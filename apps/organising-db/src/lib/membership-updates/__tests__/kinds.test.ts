import { describe, expect, it } from "vitest";
import {
  computeNetMovement,
  defaultActionForUnmatched,
  formatWeekEnding,
  membershipUpdateStoragePath,
} from "../kinds";

describe("computeNetMovement", () => {
  it("is (new + recommenced) - (resigned + unfinancial)", () => {
    expect(computeNetMovement({ new: 15, recommenced: 9, resigned: 6, unfinancial: 17 })).toBe(1);
    expect(computeNetMovement({ new: 0, recommenced: 0, resigned: 3, unfinancial: 2 })).toBe(-5);
  });
});

describe("defaults", () => {
  it("creates unmatched new members and skips unmatched rows from the other files", () => {
    expect(defaultActionForUnmatched("new")).toBe("create");
    expect(defaultActionForUnmatched("recommenced")).toBe("skip");
    expect(defaultActionForUnmatched("resigned")).toBe("skip");
    expect(defaultActionForUnmatched("unfinancial")).toBe("skip");
  });

  it("formats and paths", () => {
    expect(formatWeekEnding("2026-09-10")).toBe("10/09/2026");
    expect(membershipUpdateStoragePath("2026-09-10", "resigned")).toBe("2026-09-10/resigned.xlsx");
  });
});
