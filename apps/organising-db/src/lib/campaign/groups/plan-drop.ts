// WP2.4 Stage 1 — the drop planner (docs/organiser-ux-review/wp/wp2.4.md
// §3.9, plan 5.6 drag rules).
//
// Pure, never throws. A drop on the v2 chart is planned here and executed by
// `useMoveWorkersMutation` (one `placements.move` per source unit, or one
// `placements.move` with `toOuId: null` + `withinGroupId` for the group's
// Unassigned card). There is no copy (CP-a): Shift produces the same plan.
//
// Every ref's source is taken from the GROUP VIEW (`placementByWorker`: the
// unit the worker holds in the selected group), not from the drag payload,
// so a selection that spans several cards is grouped by the unit each worker
// actually sits in, and a worker who is Unassigned in the group has a `null`
// source. The cross-`ou_type` guard of the legacy handler is not reproduced:
// every unit on screen is in the selected group, and the RPC is the authority.
// The one guard kept here (fix round 1, A3): a target that is not a unit of
// the selected group is a `noop`, so a stray id can never move a row across
// groups through `p_from_ou_id`.
//
// The `refs` of a plan are the executable form: `useMoveWorkersMutation`
// groups them by `fromOuId` itself, one `placements.move` per source.

export type DropRef = {
  workerId: number;
  /** The card the tile was dragged from; informational — the plan re-derives the source. */
  fromOuId: number | null;
};

export type DropPlan =
  /** Nothing to send: every ref is already at the target, or there is no target (Not in any group). */
  | { kind: "noop" }
  /** Refs re-derived from the group view; the mutation issues one `placements.move` per distinct `fromOuId` (`null` = from Unassigned in the group). */
  | { kind: "move"; toOuId: number; refs: DropRef[] }
  /** One `placements.move({ toOuId: null, withinGroupId })`: remove from the unit in this group only. */
  | { kind: "unassign"; withinGroupId: number; workerIds: number[]; refs: DropRef[] };

export type PlanDropInput = {
  refs: readonly DropRef[];
  /** The unit dropped on, or `null` for the group's Unassigned card. */
  targetOuId: number | null;
  /** The selected group; `"none"` (Not in any group) has no drop targets. */
  groupId: number | "none";
  /** The ids of the selected group's units (`deriveGroupView().units`); a target outside them is a no-op. */
  groupUnitIds: ReadonlySet<number>;
  /** worker id → the unit the worker holds in the selected group (from `deriveGroupView`). */
  placementByWorker: ReadonlyMap<number, number>;
};

export function planDrop(input: PlanDropInput): DropPlan {
  if (input.groupId === "none") return { kind: "noop" };

  // Distinct workers, first-seen order; the source is the group view's.
  const seen = new Set<number>();
  const workers: number[] = [];
  for (const ref of input.refs) {
    if (seen.has(ref.workerId)) continue;
    seen.add(ref.workerId);
    workers.push(ref.workerId);
  }

  if (input.targetOuId == null) {
    // Drop on Unassigned in G: only workers who hold a unit in G have anything to remove.
    const workerIds = workers.filter((w) => input.placementByWorker.has(w));
    if (workerIds.length === 0) return { kind: "noop" };
    return {
      kind: "unassign",
      withinGroupId: input.groupId,
      workerIds,
      refs: workerIds.map((workerId) => ({ workerId, fromOuId: input.placementByWorker.get(workerId) ?? null })),
    };
  }

  if (!input.groupUnitIds.has(input.targetOuId)) return { kind: "noop" };

  const refs: DropRef[] = [];
  for (const workerId of workers) {
    const fromOuId = input.placementByWorker.get(workerId) ?? null;
    if (fromOuId === input.targetOuId) continue; // already there (legacy no-op rule)
    refs.push({ workerId, fromOuId });
  }
  if (refs.length === 0) return { kind: "noop" };
  return { kind: "move", toOuId: input.targetOuId, refs };
}
