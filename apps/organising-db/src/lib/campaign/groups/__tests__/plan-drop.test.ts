/** WP2.4 Stage 1 (wp2.4.md §3.9, §4.1) — the drop planner. */

import { describe, expect, it } from "vitest";
import { planDrop, type DropRef } from "../plan-drop";

// Group 5: units 10 and 11. Ada (1) in 10, Bob (2) in 11, Cy (3) Unassigned, Dee (4) in 10.
const placementByWorker = new Map<number, number>([
  [1, 10],
  [2, 11],
  [4, 10],
]);
const G = 5;
const groupUnitIds = new Set([10, 11]);

const refs = (...pairs: [number, number | null][]): DropRef[] => pairs.map(([workerId, fromOuId]) => ({ workerId, fromOuId }));

describe("planDrop", () => {
  it("a drop on the unit a worker already holds is a no-op", () => {
    expect(planDrop({ refs: refs([1, 10]), targetOuId: 10, groupId: G, groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
  });

  it("re-derives every ref's source from the group view, not the payload, drops refs already at the target, and lists each worker once", () => {
    const plan = planDrop({
      refs: refs([1, 999], [2, 11], [4, 10], [3, null], [1, 10]),
      targetOuId: 11,
      groupId: G,
      groupUnitIds,
      placementByWorker,
    });
    // Bob is already on 11 → dropped; Ada appears once with her real source (10, not 999).
    // The mutation groups these by fromOuId: one placements.move from 10, one from Unassigned.
    expect(plan).toEqual({
      kind: "move",
      toOuId: 11,
      refs: [
        { workerId: 1, fromOuId: 10 },
        { workerId: 4, fromOuId: 10 },
        { workerId: 3, fromOuId: null },
      ],
    });
  });

  it("a target that is not a unit of the selected group is a no-op (never a cross-group move through p_from_ou_id)", () => {
    expect(planDrop({ refs: refs([1, 10]), targetOuId: 99, groupId: G, groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
    expect(planDrop({ refs: refs([3, null]), targetOuId: 99, groupId: G, groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
  });

  it("a drop from Unassigned is a move whose source is null", () => {
    const plan = planDrop({ refs: refs([3, null]), targetOuId: 10, groupId: G, groupUnitIds, placementByWorker });
    expect(plan).toEqual({ kind: "move", toOuId: 10, refs: [{ workerId: 3, fromOuId: null }] });
  });

  it("a drop on Unassigned unassigns within the group, only for workers who hold a unit in it", () => {
    const plan = planDrop({ refs: refs([1, 10], [3, null], [2, 11]), targetOuId: null, groupId: G, groupUnitIds, placementByWorker });
    expect(plan).toEqual({
      kind: "unassign",
      withinGroupId: G,
      workerIds: [1, 2],
      refs: [
        { workerId: 1, fromOuId: 10 },
        { workerId: 2, fromOuId: 11 },
      ],
    });
  });

  it("a drop on Unassigned by workers who are already Unassigned is a no-op", () => {
    expect(planDrop({ refs: refs([3, null]), targetOuId: null, groupId: G, groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
  });

  it("Not in any group has no drop targets", () => {
    expect(planDrop({ refs: refs([1, 10]), targetOuId: 11, groupId: "none", groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
    expect(planDrop({ refs: refs([1, 10]), targetOuId: null, groupId: "none", groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
  });

  it("an empty selection is a no-op", () => {
    expect(planDrop({ refs: [], targetOuId: 10, groupId: G, groupUnitIds, placementByWorker })).toEqual({ kind: "noop" });
  });
});
