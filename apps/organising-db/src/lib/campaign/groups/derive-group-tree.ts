// WP2.4c Stage 1 — nesting within a group, derived
// (docs/organiser-ux-review/wp/wp2.4c.md §3.3 NE-a, §3.4 NV-a/NC-a, §3.5 SG-a).
//
// Pure: no React, no I/O, never throws. A second derivation BESIDE
// `derive-group-view.ts`, which is not edited (NV-a): the flat contract
// (`deriveGroupView`, `unitsOfGroup`, `notInAnyGroup`, `unitsByWorker`,
// `groupOfUnit`) stays exactly what WP2.4 shipped and is the oracle the
// equivalence test compares this module against (§4.1).
//
// Principle 10 (§3.1): nesting is a RENDERING of `parent_ou_id`, not a third
// group model. A sub-unit is still a unit of its own group and its placements
// still carry that group; the tree is derived per group view from the three
// row sets the chart already holds and nothing is stored.
//
// The nesting edge (NE-a as narrowed by ruling 1, §3.3): unit C is nested
// under unit P iff `C.parent_ou_id = P.ou_id`, P is a known unit of the
// campaign, P is NOT a group container, P carries a `group_id` and that group
// DIFFERS from C's. Two links are therefore facets, not nesting:
//   * a link to a container (the Employer container → worksite link decision 5
//     flattened), so the Employer view keeps showing one ordinary card per
//     container and the Worksite group keeps every worksite as a root;
//   * a link to a parent in C's OWN group (the same-kind Split child, wp2.2.md
//     C-k). The one-unit-per-group index (WP2.2b) means a worker can never
//     hold both the parent and that child, so it can never carry the parent +
//     child pair the nested model is built on: "Split creates sibling units in
//     the same group" (DECISIONS.md:14) still holds, and such a child renders
//     as an ordinary root card beside its parent.
// Under NE-a the deepest rendered tree is two levels (unit → sub-unit) and
// every child of a root is a unit of another group.
//
// The placement pair is NOT a data invariant (§3.2, NP-a): nothing guarantees
// that a worker placed on a sub-unit also holds a placement on the sub-unit's
// parent, and nothing removes the child placement when the parent placement
// moves. This module therefore derives and TOLERATES both shapes and reports
// them: `childOnlyByWorker` (a child placement with no placement in the
// parent's group — rendered under the child, counted in the root's roll-up)
// and `orphanChildByWorker` (a child placement under a root other than the
// worker's own placement in the parent's group — NOT drawn in this group's
// view, NC-a, because a worker twice in one group's view contradicts the
// one-unit-per-group reading the band is built on).
//
// Cost is linear in members + units + placements; no query is added
// (`parent_ou_id` and `is_group_container` are already in the units
// `select("*")` the chart issues).

import { unitsOfGroup, type GroupMemberLike, type GroupPlacementLike, type GroupUnitLike } from "./derive-group-view";
import { orderGroups, type GroupLike } from "./resolve-group-selection";

/** A unit row as the tree reads it: the flat row plus the two hierarchy columns. */
export type TreeUnitLike = GroupUnitLike & {
  readonly parent_ou_id?: number | null;
  readonly is_group_container?: boolean | null;
};

export type GroupTree<U extends TreeUnitLike = TreeUnitLike> = {
  groupId: number;
  /** Units of G with no nesting parent, in the units query's order (the cards). */
  roots: U[];
  /**
   * Units of G nested under a unit of another group (the mixed case: a Shift
   * group with one standalone root and shifts under worksites). Rendered flat
   * after the roots as "<Parent> › <Unit>", so every placement in G is on
   * screen exactly once. A flat card is treated as a root without children.
   */
  foreignNested: U[];
  /** root → its nested children (any group), in the units query's order. Every root has an entry. */
  childrenByRoot: Map<number, U[]>;
  /** Every card in G's view: roots, their children, foreignNested. */
  nodeIds: Set<number>;
  /** worker → the ONE card that shows the tile (child when the worker holds one under their root; else the root / flat card). */
  nodeByWorker: Map<number, number>;
  /** worker → the root (or flat card) they count under — the compare/list value of "in U" (§3.17). */
  rootByWorker: Map<number, number>;
  /** node → tiles, member order. Every node has an entry. */
  workersByNode: Map<number, number[]>;
  /** root → every worker in its subtree (own area + children), member order — the roll-up (B5). */
  subtreeByRoot: Map<number, number[]>;
  /** worker → their actual placement on a unit of G, when any (= `deriveGroupView().placementByWorker`). */
  placementByWorker: Map<number, number>;
  /** worker → the child node they hold under their root, when any (the row the RPC re-points; absent for a root-only worker). */
  childPlacementByWorker: Map<number, number>;
  /** Members with no placement on any node of G's tree — "Unassigned in G". */
  unassignedWorkerIds: number[];
  /** Divergence from the view (§3.2, §4.1): child-only workers → inferred root. */
  childOnlyByWorker: Map<number, number>;
  /** NC-a: child placements under a root other than the worker's own G placement → not rendered in G's view. */
  orphanChildByWorker: Map<number, number>;
};

/** `ou_id` → the row, for the parent lookups below. */
export function indexUnitsById<U extends TreeUnitLike>(ous: readonly U[]): Map<number, U> {
  const byId = new Map<number, U>();
  for (const ou of ous) byId.set(ou.ou_id, ou);
  return byId;
}

/**
 * NE-a (§3.3, ruling 1): the id of the unit `ou` nests under, or `null` when
 * the link is not a nesting edge — no parent, an unknown parent, a group
 * container (a facet link), a parent without a group of its own, a parent in
 * `ou`'s OWN group (the C-k same-group Split child, which is a sibling), or a
 * self-link.
 */
export function nestingParentOf(ou: TreeUnitLike, ouById: ReadonlyMap<number, TreeUnitLike>): number | null {
  const parentId = ou.parent_ou_id ?? null;
  if (parentId == null || parentId === ou.ou_id) return null;
  const parent = ouById.get(parentId);
  if (!parent) return null;
  if (parent.is_group_container === true) return null;
  if (parent.group_id == null) return null;
  if (parent.group_id === (ou.group_id ?? null)) return null;
  return parent.ou_id;
}

/**
 * nesting parent id → its children across every group, in the caller's (the
 * units query's) order. Only parents with at least one child have an entry.
 */
export function childrenByNestingParent<U extends TreeUnitLike>(ous: readonly U[]): Map<number, U[]> {
  const ouById = indexUnitsById(ous);
  const out = new Map<number, U[]>();
  for (const ou of ous) {
    const parentId = nestingParentOf(ou, ouById);
    if (parentId == null) continue;
    const list = out.get(parentId) ?? [];
    list.push(ou);
    out.set(parentId, list);
  }
  return out;
}

/**
 * SG-a / B2 (§3.5): a group is primary — offered in the Group selector — when
 * it has no units at all, or at least one of its units is a root (has no
 * nesting parent). A group every unit of which is nested under a unit of
 * another group is sub-unit-only: its units are already on screen inside their
 * parents' cards, so listing it would produce the "Unassigned in Shift" band
 * the operator rejected. (§3.5's "or a nesting parent in G itself" clause was
 * written before ruling 1; a nesting parent is now never in G, so a same-group
 * child is a root here and the two readings agree.)
 */
export function isPrimaryGroup(groupId: number, ous: readonly TreeUnitLike[]): boolean {
  const ouById = indexUnitsById(ous);
  const units = unitsOfGroup(ous, groupId);
  if (units.length === 0) return true;
  return units.some((u) => nestingParentOf(u, ouById) === null);
}

/** The primary groups in selector order (`orderGroups`): the Group control's list (SG-a). */
export function primaryGroups<G extends GroupLike>(groups: readonly G[], ous: readonly TreeUnitLike[]): G[] {
  return orderGroups(groups).filter((g) => isPrimaryGroup(g.group_id, ous));
}

/**
 * The nested view of group `groupId` (§3.4).
 *
 * Only members count and only placements on units count, exactly as
 * `deriveGroupView`: a placement whose worker is not a member is ignored, and
 * where a legacy row set holds two placements in one group the first in input
 * order wins (the one-unit-per-group index of WP2.2b makes that impossible on
 * a current database).
 *
 * For member w, with `p` = w's placement on a unit of G and `c` = w's
 * placement on a child node whose root is R:
 *   * `c` present and (`p` absent or `p === R`) → the tile is on `c`, the
 *     roll-up counts w under R, and when `p` is absent w is recorded in
 *     `childOnlyByWorker` (NP-a);
 *   * else `p` present → the tile is on `p`; a `c` under a root other than
 *     `p` is recorded in `orphanChildByWorker` and not drawn (NC-a);
 *   * neither → Unassigned in G.
 * A unit of G whose `parent_ou_id` names another unit of G (the C-k same-kind
 * Split child) is a ROOT of G under ruling 1, so its members count under it
 * and not under its parent — which is what the view says too.
 */
export function deriveGroupTree<U extends TreeUnitLike>(
  members: readonly GroupMemberLike[],
  ous: readonly U[],
  placements: readonly GroupPlacementLike[],
  groupId: number
): GroupTree<U> {
  const ouById = indexUnitsById(ous);
  const groupUnits = unitsOfGroup(ous, groupId);
  const groupUnitIds = new Set(groupUnits.map((u) => u.ou_id));
  const childrenOf = childrenByNestingParent(ous);

  const roots = groupUnits.filter((u) => nestingParentOf(u, ouById) === null);
  const rootIds = new Set(roots.map((u) => u.ou_id));

  const childrenByRoot = new Map<number, U[]>();
  /** child node id → the root it renders under. */
  const rootOfChild = new Map<number, number>();
  for (const root of roots) {
    const children = [...(childrenOf.get(root.ou_id) ?? [])];
    childrenByRoot.set(root.ou_id, children);
    for (const child of children) rootOfChild.set(child.ou_id, root.ou_id);
  }

  // A unit of G that is neither a root nor a child of a root of G renders
  // flat, so no placement in G is off screen. Under ruling 1 a child of a root
  // is never a unit of G, so this is exactly "nested under another group's
  // unit" (the mixed case), plus — defensively — any chain whose middle unit
  // is not a root of G.
  const foreignNested = groupUnits.filter((u) => !rootIds.has(u.ou_id) && !rootOfChild.has(u.ou_id));

  const nodeIds = new Set<number>(rootIds);
  for (const id of rootOfChild.keys()) nodeIds.add(id);
  for (const u of foreignNested) nodeIds.add(u.ou_id);

  const memberIds = new Set(members.map((m) => m.worker_id));

  // The worker's row in G (first in input order wins — `deriveGroupView`'s
  // rule) and every child-node placement they hold, in input order.
  const placementByWorker = new Map<number, number>();
  const childPlacementsByWorker = new Map<number, number[]>();
  for (const p of placements) {
    if (!memberIds.has(p.worker_id)) continue;
    if (groupUnitIds.has(p.ou_id) && !placementByWorker.has(p.worker_id)) {
      placementByWorker.set(p.worker_id, p.ou_id);
    }
    if (rootOfChild.has(p.ou_id)) {
      const list = childPlacementsByWorker.get(p.worker_id) ?? [];
      if (!list.includes(p.ou_id)) list.push(p.ou_id);
      childPlacementsByWorker.set(p.worker_id, list);
    }
  }

  const nodeByWorker = new Map<number, number>();
  const rootByWorker = new Map<number, number>();
  const childPlacementByWorker = new Map<number, number>();
  const childOnlyByWorker = new Map<number, number>();
  const orphanChildByWorker = new Map<number, number>();
  const workersByNode = new Map<number, number[]>();
  for (const id of nodeIds) workersByNode.set(id, []);
  const subtreeByRoot = new Map<number, number[]>();
  for (const id of rootIds) subtreeByRoot.set(id, []);
  const unassignedWorkerIds: number[] = [];

  const seen = new Set<number>();
  for (const m of members) {
    const w = m.worker_id;
    if (seen.has(w)) continue;
    seen.add(w);

    const p = placementByWorker.get(w) ?? null;
    const heldChildren = childPlacementsByWorker.get(w) ?? [];

    let node: number | null = null;
    let root: number | null = null;
    let child: number | null = null;

    if (p != null) {
      // A root or a flat card — under ruling 1 every child node is a unit of
      // another group, so the worker's row in G is never itself a child node.
      // A child held under it is where the tile goes.
      root = p;
      child = heldChildren.find((x) => rootOfChild.get(x) === p) ?? null;
      node = child ?? p;
    } else if (heldChildren.length > 0) {
      // Child-only (NP-a): the root is inferred from `parent_ou_id`.
      child = heldChildren[0];
      root = rootOfChild.get(child)!;
      node = child;
      childOnlyByWorker.set(w, root);
    }

    if (node == null || root == null) {
      unassignedWorkerIds.push(w);
      continue;
    }

    // NC-a: a child placement under a root other than the one the worker's own
    // G placement puts them in is counted and returned, never drawn.
    if (p != null) {
      const orphan = heldChildren.find((x) => rootOfChild.get(x) !== root);
      if (orphan != null) orphanChildByWorker.set(w, orphan);
    }

    nodeByWorker.set(w, node);
    rootByWorker.set(w, root);
    if (child != null) childPlacementByWorker.set(w, child);
    workersByNode.get(node)!.push(w);
    subtreeByRoot.get(root)?.push(w);
  }

  return {
    groupId,
    roots,
    foreignNested,
    childrenByRoot,
    nodeIds,
    nodeByWorker,
    rootByWorker,
    workersByNode,
    subtreeByRoot,
    placementByWorker,
    childPlacementByWorker,
    unassignedWorkerIds,
    childOnlyByWorker,
    orphanChildByWorker,
  };
}
