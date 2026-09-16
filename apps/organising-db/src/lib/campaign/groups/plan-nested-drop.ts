// WP2.4c Stage 1 — the nested drop planner
// (docs/organiser-ux-review/wp/wp2.4c.md §3.7, NX-a / NS-a; B3).
//
// Pure, never throws. A superset of `planDrop` (`plan-drop.ts`, unchanged
// under NV-a): with a group whose units have no children this planner emits
// exactly the calls `planDrop` + `useMoveWorkersMutation` issue today, and the
// §4.1 superset case proves it by running both.
//
// A drop inside a nested group can need more than one transaction, because
// the worker's placement in the PARENT's group and their placement in the
// CHILD's group are two rows in two groups and `structure_placements_move`
// writes one target at a time. The plan is therefore an ordered list of
// steps, each an existing RPC call, executed in order by
// `useMoveWorkersMutation`'s additive `steps` (NX-a; no new RPC, no
// migration).
//
// The rules the §3.7 table encodes, restated here because every one of them
// is pinned by a case in `__tests__/plan-nested-drop.test.ts`:
//
//   * ADDS BEFORE REMOVES. The parent move comes first, then the child move,
//     then the unassigns, so a refusal part-way never leaves the worker with
//     fewer placements than they started with.
//   * The parent placement is written EXPLICITLY whenever the worker's row in
//     the parent's group is not the target's root: the RPC's own
//     `p_keep_in_parent` places the parent with `skip`, so a worker already on
//     another worksite would keep it (§3.2).
//   * `keepInParent` is `true` on every move step, so the RPC's `skip` is the
//     idempotent no-op it is designed to be when the root already holds the
//     worker.
//   * `fromOuId` is always a row the worker actually holds (or `null`), never
//     the display node, so the RPC can never raise `P0002`.
//   * A target outside the tree is a noop (the WP2.4 D7 guard); `"none"` (Not
//     in any group) has no drop targets.
//   * NS-a: a worker who leaves a root's subtree loses the child placement
//     they held under it. A child held under the target's own root in another
//     group stays (one unit per group each).
//   * Steps are merged across the dropped selection per (kind, target,
//     source, group), so a multi-select drop is a handful of calls.

import type { DropRef } from "./plan-drop";
import type { GroupTree } from "./derive-group-tree";

export type MoveStep =
  | { kind: "move"; toOuId: number; fromOuId: number | null; workerIds: number[]; keepInParent: true }
  | { kind: "unassign"; withinGroupId: number; workerIds: number[] };

export type NestedDropPlan =
  /** Nothing to send: every ref is already on the target card, or there is no target. */
  | { kind: "noop" }
  /** The ordered RPC calls, and the workers they cover with the source each holds in the selected group. */
  | { kind: "steps"; steps: MoveStep[]; refs: DropRef[] };

export type PlanNestedDropInput = {
  refs: readonly DropRef[];
  /** The card dropped on, or `null` for the group's Unassigned card. */
  targetOuId: number | null;
  /** The selected group; `"none"` (Not in any group) has no drop targets. */
  groupId: number | "none";
  /** The nested view of that group (`deriveGroupTree`). */
  tree: GroupTree;
  /** The group a unit carries (`groupOfUnit` of `derive-group-view.ts`), for the child steps. */
  groupOfUnit: (ouId: number) => number | null;
};

/** Merge key → the workers it covers, in first-appearance order. */
type StepBucket<K> = { key: K; workerIds: number[] };

function bucket<K>(buckets: StepBucket<K>[], key: K, workerId: number): void {
  const found = buckets.find((b) => b.key === key);
  if (found) {
    if (!found.workerIds.includes(workerId)) found.workerIds.push(workerId);
    return;
  }
  buckets.push({ key, workerIds: [workerId] });
}

export function planNestedDrop(input: PlanNestedDropInput): NestedDropPlan {
  if (input.groupId === "none") return { kind: "noop" };
  const groupId = input.groupId;
  const tree = input.tree;
  if (tree.groupId !== groupId) return { kind: "noop" };

  // Distinct workers, first-seen order; every source is re-derived from the
  // tree, never taken from the drag payload (`planDrop`'s rule).
  const workers: number[] = [];
  const seen = new Set<number>();
  for (const ref of input.refs) {
    if (seen.has(ref.workerId)) continue;
    seen.add(ref.workerId);
    workers.push(ref.workerId);
  }
  if (workers.length === 0) return { kind: "noop" };

  const rootOfChild = new Map<number, number>();
  for (const [rootId, children] of tree.childrenByRoot) {
    for (const child of children) rootOfChild.set(child.ou_id, rootId);
  }

  /** Every child-node placement the worker holds in this tree: the rendered one and the NC-a orphan. */
  const heldChildrenOf = (workerId: number): number[] => {
    const held: number[] = [];
    const rendered = tree.childPlacementByWorker.get(workerId);
    if (rendered != null) held.push(rendered);
    const orphan = tree.orphanChildByWorker.get(workerId);
    if (orphan != null && !held.includes(orphan)) held.push(orphan);
    return held;
  };

  // Phase 1 (the row in the selected group), phase 2 (the row in the child's
  // group), phase 3 (the removes). Adds before removes, in that order.
  const parentMoves: StepBucket<number | null>[] = [];
  const childMoves: StepBucket<number | null>[] = [];
  const unassigns: StepBucket<number>[] = [];
  const refs: DropRef[] = [];

  const target = input.targetOuId;
  /** Where the phase-1 (selected group) move points: the target itself, or its root. */
  let parentMoveTarget: number | null = null;

  if (target == null) {
    // A drop on "Unassigned in <Group>": the worker leaves the group's unit
    // and every child placement they hold under it (NS-a).
    for (const workerId of workers) {
      const placement = tree.placementByWorker.get(workerId) ?? null;
      const held = heldChildrenOf(workerId);
      let planned = false;
      if (placement != null) {
        bucket(unassigns, groupId, workerId);
        planned = true;
      }
      for (const child of held) {
        const childGroup = input.groupOfUnit(child);
        // A child in the selected group is the same row the unassign above removes.
        if (childGroup == null || childGroup === groupId) continue;
        bucket(unassigns, childGroup, workerId);
        planned = true;
      }
      if (planned) refs.push({ workerId, fromOuId: placement });
    }
  } else {
    if (!tree.nodeIds.has(target)) return { kind: "noop" };
    const targetGroup = input.groupOfUnit(target);
    if (targetGroup == null) return { kind: "noop" };
    const targetIsChild = rootOfChild.has(target);
    /** The card the worker counts under once the drop lands (a root, or a flat foreign-nested card). */
    const targetRoot = targetIsChild ? rootOfChild.get(target)! : target;
    /**
     * The target carries the selected group, so it IS where the group's row
     * goes: a root or a flat foreign-nested card. Under NE-a as narrowed by
     * ruling 1 a child node is always in another group, so this is never a
     * nested card (a C-k same-group Split child is a root, §3.3).
     */
    const targetHoldsGroupRow = targetGroup === groupId;
    parentMoveTarget = targetHoldsGroupRow ? target : targetRoot;

    for (const workerId of workers) {
      if (tree.nodeByWorker.get(workerId) === target) continue; // already there (the legacy no-op rule)
      const placement = tree.placementByWorker.get(workerId) ?? null;
      const held = heldChildrenOf(workerId);
      let planned = false;

      if (targetHoldsGroupRow) {
        // The group's row is re-pointed to the target (a root or a flat card);
        // the RPC writes nothing for a parent in the target's own group
        // (`structure_placements_move` :2726–2731).
        if (placement !== target) {
          bucket(parentMoves, placement, workerId);
          planned = true;
        }
      } else {
        // A child in another group: the parent row first (explicitly — the
        // RPC's `skip` would leave the old root in place), then the child.
        if (placement !== targetRoot) {
          bucket(parentMoves, placement, workerId);
          planned = true;
        }
        const heldInTargetGroup = held.find((x) => input.groupOfUnit(x) === targetGroup) ?? null;
        if (heldInTargetGroup !== target) {
          bucket(childMoves, heldInTargetGroup, workerId);
          planned = true;
        }
      }

      for (const child of held) {
        const childGroup = input.groupOfUnit(child);
        if (childGroup == null) continue;
        // A child row in the selected group is re-pointed by the move above.
        if (childGroup === groupId) continue;
        // The row the child step re-points (or the RPC displaces) is not removed.
        if (!targetHoldsGroupRow && childGroup === targetGroup) continue;
        // A child under the target's own root in another group stays: the
        // worker holds one unit per group and has not left that subtree.
        if (targetIsChild && rootOfChild.get(child) === targetRoot) continue;
        bucket(unassigns, childGroup, workerId);
        planned = true;
      }

      if (planned) refs.push({ workerId, fromOuId: placement });
    }
  }

  const steps: MoveStep[] = [];
  for (const b of parentMoves) {
    steps.push({ kind: "move", toOuId: parentMoveTarget!, fromOuId: b.key, workerIds: b.workerIds, keepInParent: true });
  }
  for (const b of childMoves) {
    steps.push({ kind: "move", toOuId: target!, fromOuId: b.key, workerIds: b.workerIds, keepInParent: true });
  }
  for (const b of unassigns) {
    steps.push({ kind: "unassign", withinGroupId: b.key, workerIds: b.workerIds });
  }

  if (steps.length === 0) return { kind: "noop" };
  return { kind: "steps", steps, refs };
}
