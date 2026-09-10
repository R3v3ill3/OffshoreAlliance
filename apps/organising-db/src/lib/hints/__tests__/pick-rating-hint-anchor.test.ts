import { describe, expect, it } from "vitest";
import { pickRatingHintAnchor } from "../pick-rating-hint-anchor";

describe("pickRatingHintAnchor", () => {
  it("prefers the first Unassigned worker when Unassigned has anyone", () => {
    expect(
      pickRatingHintAnchor({
        unassignedWorkerIds: [42, 7],
        units: [{ ouId: 1, workerIds: [3] }],
      })
    ).toEqual({ ouId: null, workerId: 42 });
  });

  it("falls through to the first non-empty unit in the given order", () => {
    expect(
      pickRatingHintAnchor({
        unassignedWorkerIds: [],
        units: [
          { ouId: 9, workerIds: [] },
          { ouId: 5, workerIds: [11, 12] },
          { ouId: 2, workerIds: [1] },
        ],
      })
    ).toEqual({ ouId: 5, workerId: 11 });
  });

  it("returns null for an empty chart", () => {
    expect(pickRatingHintAnchor({ unassignedWorkerIds: [], units: [] })).toBeNull();
  });

  it("returns null when every unit is empty and Unassigned is empty (hasTiles === false)", () => {
    const anchor = pickRatingHintAnchor({
      unassignedWorkerIds: [],
      units: [
        { ouId: 1, workerIds: [] },
        { ouId: 2, workerIds: [] },
      ],
    });
    expect(anchor).toBeNull();
    expect(anchor !== null).toBe(false);
  });
});
