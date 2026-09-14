/**
 * WP2.2 Stage 6 — the bulk "Assign to unit" toast reports the hook's
 * `skipped` count (wp2.2.md §8.2 "Bulk toolbar hides skipped placements",
 * D46 follow-up).
 */

import { describe, expect, it } from "vitest";
import { allocateToastMessage } from "../allocate-toast-message";

describe("allocateToastMessage", () => {
  it("keeps the legacy sentence when nothing was skipped", () => {
    expect(allocateToastMessage({ inserted: 3, skipped: 0 }, 3, "Deck crew")).toBe(
      "Allocated 3 workers to Deck crew."
    );
    expect(allocateToastMessage({ inserted: 1, skipped: 0 }, 1, "Deck crew")).toBe(
      "Allocated 1 worker to Deck crew."
    );
  });

  it("appends the skipped count and the reason when the RPC left workers out", () => {
    expect(allocateToastMessage({ inserted: 7, skipped: 3 }, 10, "Deck crew")).toBe(
      "Allocated 7 workers to Deck crew. 3 skipped: already in a unit of that group."
    );
    expect(allocateToastMessage({ inserted: 0, skipped: 1 }, 1, "Deck crew")).toBe(
      "Allocated 0 workers to Deck crew. 1 skipped: already in a unit of that group."
    );
  });

  it("falls back to the requested count and the generic target when the result is missing", () => {
    expect(allocateToastMessage(undefined, 4, "unit")).toBe("Allocated 4 workers to unit.");
    expect(allocateToastMessage({ inserted: 2 }, 4, "unit")).toBe("Allocated 2 workers to unit.");
  });
});
