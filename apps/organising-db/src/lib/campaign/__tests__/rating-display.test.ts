import { describe, expect, it } from "vitest";
import {
  RATING_KEY_LEVELS,
  ratingBg,
  ratingLabel,
  ratingTooltip,
} from "../rating-display";
import { RATING_LEVELS } from "@/types/planner-types";

describe("RATING_KEY_LEVELS", () => {
  it("is the 1-5 scale without the unassessed sentinel", () => {
    // The key explains the chips, and an unassessed worker has no chip.
    expect(RATING_KEY_LEVELS.map((r) => r.value)).toEqual([1, 2, 3, 4, 5]);
    expect(RATING_KEY_LEVELS.every((r) => r.value > 0)).toBe(true);
  });

  it("carries a description for every level, for the key's hover", () => {
    for (const level of RATING_KEY_LEVELS) {
      expect(level.description.trim()).not.toBe("");
      expect(level.tailwindBg.trim()).not.toBe("");
    }
  });
});

describe("ratingLabel", () => {
  it("uses the standard short label by default", () => {
    expect(ratingLabel(1)).toBe(
      RATING_LEVELS.find((r) => r.value === 1)?.shortLabel,
    );
  });

  it("prefers an assessment's renamed level", () => {
    expect(ratingLabel(1, { "1": "Ready to strike" })).toBe("Ready to strike");
  });

  it("ignores overrides for other levels", () => {
    expect(ratingLabel(2, { "1": "Ready to strike" })).toBe(
      RATING_LEVELS.find((r) => r.value === 2)?.shortLabel,
    );
  });

  it("falls back to the number for an unknown level", () => {
    expect(ratingLabel(9)).toBe("9");
  });
});

describe("ratingBg", () => {
  it("returns the level's colour", () => {
    expect(ratingBg(1)).toBe(
      RATING_LEVELS.find((r) => r.value === 1)?.tailwindBg,
    );
  });

  it("falls back for an unknown level rather than returning empty", () => {
    expect(ratingBg(9)).toBe("bg-muted");
  });
});

describe("ratingTooltip", () => {
  it("names the assessment, the level and what it means", () => {
    const text = ratingTooltip("EBA support", {
      rating: 1,
      binary_value: null,
    });
    expect(text).toContain("EBA support");
    expect(text).toContain("1");
    expect(text).toContain(
      RATING_LEVELS.find((r) => r.value === 1)!.shortLabel,
    );
    expect(text).toContain(
      RATING_LEVELS.find((r) => r.value === 1)!.description,
    );
  });

  it("shows a renamed level alongside the standard one", () => {
    // The organiser sees their own wording without losing the meaning
    // the colour is based on.
    const text = ratingTooltip(
      "EBA support",
      { rating: 1, binary_value: null },
      { "1": "Ready to strike" },
    );
    expect(text).toContain("Ready to strike");
    expect(text).toContain(
      RATING_LEVELS.find((r) => r.value === 1)!.shortLabel,
    );
  });

  it("does not repeat the name when it matches the standard one", () => {
    const standard = RATING_LEVELS.find((r) => r.value === 2)!.shortLabel;
    const text = ratingTooltip(
      "EBA support",
      { rating: 2, binary_value: null },
      { "2": standard },
    );
    expect(text.match(new RegExp(standard, "g"))).toHaveLength(1);
  });

  it("renders a binary value on its own", () => {
    expect(
      ratingTooltip("Vote intention", { rating: null, binary_value: "yes" }),
    ).toBe("Vote intention: yes");
  });

  it("says so when there is no value at all", () => {
    expect(
      ratingTooltip("EBA support", { rating: null, binary_value: null }),
    ).toBe("EBA support: not assessed");
  });
});
