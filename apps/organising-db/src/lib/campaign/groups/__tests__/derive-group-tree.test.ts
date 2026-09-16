/**
 * WP2.4c Stage 1 (wp2.4c.md §4.1) — the nested derivation, and its
 * equivalence with the `campaign_group_membership` view.
 *
 * The view (20260914090100_wp2_2_one_unit_per_group_enforcement.sql:156–160)
 * is transcribed below exactly as `derive-group-view.test.ts` transcribes it,
 * so the two suites compare the same oracle. §3.4 re-states the equivalence
 * for the nested case: `placementByWorker` is the view's `ou_id` unchanged,
 * and `rootByWorker` equals it except for a named divergence set, which the
 * read-only `scripts/data-hygiene/oux-wp2.4c/00_nesting_shape.sql` counts on a
 * real database. Queries (b) and (c) of that file are transcribed here too.
 *
 * THE ONE DIVERGENCE CLASS (§3.4, and the only one the cases below find):
 *   (b) child-only — a cross-group child placement whose worker holds no
 *       placement in the parent's group. The view says NULL for the parent's
 *       group, the tree says the inferred root (NP-a).
 * Under NE-a as narrowed by ruling 1 (a child nests only when its group
 * differs from its parent's) a C-k same-group Split child is a ROOT, so the
 * second divergence class the first Stage-1 round found is gone: for its
 * members the view and `rootByWorker` both say that unit (§11.9).
 */

import { describe, expect, it } from "vitest";
import {
  childrenByNestingParent,
  deriveGroupTree,
  indexUnitsById,
  isPrimaryGroup,
  nestingParentOf,
  primaryGroups,
  type TreeUnitLike,
} from "../derive-group-tree";
import { deriveGroupView, notInAnyGroup } from "../derive-group-view";
import {
  CAMPAIGN_42_GROUPS,
  CAMPAIGN_42_GROUP_IDS as G,
  CAMPAIGN_42_MEMBERS,
  CAMPAIGN_42_OU_IDS as OU,
  CAMPAIGN_42_PLACEMENTS,
  CAMPAIGN_42_UNITS,
  CAMPAIGN_42_WORKER_IDS as W,
  CAMPAIGN_42_CREW_GROUP_ID,
  CAMPAIGN_42_SUB_UNIT_OU_IDS as SUB,
  CAMPAIGN_42_SUB_UNIT_PLACEMENTS,
  campaign42UnitsWithStandaloneShift,
  campaign42UnitsWithSubUnitGroups,
  type Campaign42Placement,
  type Campaign42Unit,
} from "./fixtures/campaign-42-shape";

const UNITS = CAMPAIGN_42_UNITS;
const MEMBERS = CAMPAIGN_42_MEMBERS;
const PLACEMENTS = CAMPAIGN_42_PLACEMENTS;
const GROUP_IDS = CAMPAIGN_42_GROUPS.map((g) => g.group_id);

const ids = (units: readonly { ou_id: number }[]) => units.map((u) => u.ou_id);
const entries = (m: ReadonlyMap<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
const worksiteTree = (
  units: readonly Campaign42Unit[] = UNITS,
  placements: readonly Campaign42Placement[] = PLACEMENTS
) => deriveGroupTree(MEMBERS, units, placements, G.worksite);

// ---------------------------------------------------------------------------
// NE-a: what is a nesting edge
// ---------------------------------------------------------------------------

describe("nestingParentOf / childrenByNestingParent (NE-a, §3.3)", () => {
  const byId = indexUnitsById(UNITS);
  const unit = (ouId: number) => UNITS.find((u) => u.ou_id === ouId)!;

  it("a link to a group container is a facet link and never nests", () => {
    // EDI Downer is the Employer container; its worksites stay roots of Worksite.
    expect(nestingParentOf(unit(OU.kgp), byId)).toBeNull();
    expect(nestingParentOf(unit(OU.barrow), byId)).toBeNull();
    expect(nestingParentOf(unit(OU.employerContainer), byId)).toBeNull();
    expect(childrenByNestingParent(UNITS).has(OU.employerContainer)).toBe(false);
  });

  it("a link to a plain parent of ANOTHER group nests (both D45 shapes)", () => {
    expect(nestingParentOf(unit(OU.day), byId)).toBe(OU.kgp); // ou_group_id NULL (post-WP2.2)
    expect(nestingParentOf(unit(OU.night), byId)).toBe(OU.kgp);
    expect([...childrenByNestingParent(UNITS)].map(([p, kids]) => [p, ids(kids)])).toEqual([
      [OU.kgp, [OU.day, OU.night]],
    ]);
  });

  it("a link to a parent in the unit's OWN group is a sibling link, not nesting (ruling 1, C-k)", () => {
    // Barrow Jetty is a worksite under a worksite: one unit per group (WP2.2b)
    // makes the parent + child pair impossible there, so it never nests.
    expect(nestingParentOf(unit(OU.barrowJetty), byId)).toBeNull();
    expect(childrenByNestingParent(UNITS).has(OU.barrow)).toBe(false);
  });

  it("a child that carries no group of its own never nests (a legacy container cannot hold a drop)", () => {
    const rows: TreeUnitLike[] = [
      { ou_id: 10, group_id: 2, parent_ou_id: null },
      { ou_id: 90, group_id: null, parent_ou_id: 10, is_group_container: true },
    ];
    expect(nestingParentOf(rows[1], indexUnitsById(rows))).toBeNull();
    const tree = deriveGroupTree([{ worker_id: 1 }], rows, [{ ou_id: 90, worker_id: 1 }], 2);
    expect([...tree.nodeIds]).toEqual([10]);
    expect(tree.unassignedWorkerIds).toEqual([1]);
  });

  it("an unknown parent, a parent without a group and a self-link are not nesting edges", () => {
    const odd: TreeUnitLike[] = [
      { ou_id: 1, group_id: 1, parent_ou_id: 999 }, // parent not in the campaign's rows
      { ou_id: 2, group_id: 1, parent_ou_id: 90 }, // parent is the legacy container (group NULL)
      { ou_id: 3, group_id: 1, parent_ou_id: 3 }, // self-link
      { ou_id: 4, group_id: 1, parent_ou_id: 5 }, // parent in the same group (C-k)
      { ou_id: 5, group_id: 1, parent_ou_id: null },
      { ou_id: 90, group_id: null, parent_ou_id: null, is_group_container: true },
    ];
    const oddById = indexUnitsById(odd);
    for (const u of odd) expect(nestingParentOf(u, oddById), String(u.ou_id)).toBeNull();
    expect(childrenByNestingParent(odd).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SG-a: primary groups
// ---------------------------------------------------------------------------

describe("isPrimaryGroup / primaryGroups (SG-a, §3.5)", () => {
  it("Shift is sub-unit-only and is not offered; Employer and Worksite are", () => {
    expect(isPrimaryGroup(G.employer, UNITS)).toBe(true);
    expect(isPrimaryGroup(G.worksite, UNITS)).toBe(true);
    expect(isPrimaryGroup(G.shift, UNITS)).toBe(false);
    expect(primaryGroups(CAMPAIGN_42_GROUPS, UNITS).map((g) => g.group_id)).toEqual([G.employer, G.worksite]);
  });

  it("a group with no units is primary (nothing of it is nested anywhere)", () => {
    const empty = [...CAMPAIGN_42_GROUPS, { group_id: 4, campaign_id: 1, kind: "crew", name: "Crew", display_order: 4 }];
    expect(isPrimaryGroup(4, UNITS)).toBe(true);
    expect(primaryGroups(empty, UNITS).map((g) => g.group_id)).toEqual([G.employer, G.worksite, 4]);
  });

  it("the mixed case: one standalone shift root makes Shift primary and the nested shifts render flat", () => {
    const units = campaign42UnitsWithStandaloneShift();
    expect(isPrimaryGroup(G.shift, units)).toBe(true);
    expect(primaryGroups(CAMPAIGN_42_GROUPS, units).map((g) => g.group_id)).toEqual([G.employer, G.worksite, G.shift]);
    const shift = deriveGroupTree(MEMBERS, units, PLACEMENTS, G.shift);
    expect(ids(shift.roots)).toEqual([OU.swing]);
    expect(ids(shift.foreignNested)).toEqual([OU.day, OU.night]);
    expect([...shift.nodeIds].sort((a, b) => a - b)).toEqual([OU.day, OU.night, OU.swing]);
    // Every rendered root has a roll-up entry, the flat cards included (A-2).
    for (const card of [...shift.roots, ...shift.foreignNested]) {
      expect(shift.subtreeByRoot.get(card.ou_id), `subtree ${card.ou_id}`).toEqual(
        shift.workersByNode.get(card.ou_id)
      );
    }
  });

  it("primary groups come back in selector order, whatever order the caller holds them in", () => {
    const shuffled = [...CAMPAIGN_42_GROUPS].reverse();
    expect(primaryGroups(shuffled, UNITS).map((g) => g.group_id)).toEqual([G.employer, G.worksite]);
  });
});

// ---------------------------------------------------------------------------
// The Worksite tree (B1, B5)
// ---------------------------------------------------------------------------

describe("deriveGroupTree — the Worksite view of campaign 42 (§3.4)", () => {
  const tree = worksiteTree();

  it("roots are the worksites (Barrow Jetty among them); only Day/Night nest, under KGP", () => {
    expect(ids(tree.roots)).toEqual([OU.kgp, OU.barrow, OU.ichthys, OU.wheatstone, OU.barrowJetty]);
    expect(tree.foreignNested).toEqual([]);
    expect([...tree.childrenByRoot].map(([root, kids]) => [root, ids(kids)])).toEqual([
      [OU.kgp, [OU.day, OU.night]],
      [OU.barrow, []],
      [OU.ichthys, []],
      [OU.wheatstone, []],
      [OU.barrowJetty, []],
    ]);
    expect([...tree.nodeIds].sort((a, b) => a - b)).toEqual([
      OU.kgp,
      OU.barrow,
      OU.ichthys,
      OU.wheatstone,
      OU.barrowJetty,
      OU.day,
      OU.night,
    ].sort((a, b) => a - b));
  });

  it("a C-k same-group child is an ordinary root: its members are NOT rolled up into its parent (ruling 1)", () => {
    expect(ids(tree.roots)).toContain(OU.barrowJetty);
    expect(tree.childrenByRoot.get(OU.barrow)).toEqual([]);
    expect(tree.nodeByWorker.get(W.sameKindChild)).toBe(OU.barrowJetty);
    expect(tree.rootByWorker.get(W.sameKindChild)).toBe(OU.barrowJetty);
    expect(tree.subtreeByRoot.get(OU.barrowJetty)).toEqual([W.sameKindChild]);
    expect(tree.subtreeByRoot.get(OU.barrow)).not.toContain(W.sameKindChild);
    expect(tree.childPlacementByWorker.has(W.sameKindChild)).toBe(false);
  });

  it("the parent's own area holds the members who are in none of its children", () => {
    expect(tree.workersByNode.get(OU.kgp)).toEqual([203, 212, 220]);
    expect(tree.workersByNode.get(OU.day)).toEqual([W.pairedDay, 213]);
    expect(tree.workersByNode.get(OU.night)).toEqual([W.pairedNight, W.childOnly]);
    expect(tree.workersByNode.get(OU.barrowJetty)).toEqual([W.sameKindChild]);
    expect(tree.workersByNode.get(OU.ichthys)).toEqual([W.ichthysOnly, 216]);
    expect(tree.workersByNode.get(OU.wheatstone)).toEqual([W.wheatstoneOnly, 217]);
  });

  it("the roll-up (B5) covers the root and every child, in member order", () => {
    expect(tree.subtreeByRoot.get(OU.kgp)).toEqual([201, 202, 203, 204, 212, 213, 220]);
    expect(tree.subtreeByRoot.get(OU.barrow)).toEqual([205, 214, 215]);
    expect(tree.subtreeByRoot.get(OU.barrowJetty)).toEqual([211]);
    expect(tree.subtreeByRoot.get(OU.ichthys)).toEqual([206, 216]);
    expect(tree.subtreeByRoot.get(OU.wheatstone)).toEqual([207, 217]);
    // Every root has an entry, and the subtree is the union of the cards' tiles.
    for (const root of tree.roots) {
      const own = tree.workersByNode.get(root.ou_id)!;
      const kids = (tree.childrenByRoot.get(root.ou_id) ?? []).flatMap((c) => tree.workersByNode.get(c.ou_id)!);
      expect([...tree.subtreeByRoot.get(root.ou_id)!].sort()).toEqual([...own, ...kids].sort());
    }
  });

  it("a child-only worker renders under the child and counts in the root's roll-up (NP-a)", () => {
    expect(tree.nodeByWorker.get(W.childOnly)).toBe(OU.night);
    expect(tree.rootByWorker.get(W.childOnly)).toBe(OU.kgp);
    expect(entries(tree.childOnlyByWorker)).toEqual([[W.childOnly, OU.kgp]]);
    expect(tree.placementByWorker.has(W.childOnly)).toBe(false);
    expect(tree.unassignedWorkerIds).not.toContain(W.childOnly);
  });

  it("an orphan child placement is counted, returned and NOT drawn — the worker's own placement wins (NC-a)", () => {
    expect(entries(tree.orphanChildByWorker)).toEqual([[W.orphan, OU.day]]);
    expect(tree.nodeByWorker.get(W.orphan)).toBe(OU.barrow);
    expect(tree.rootByWorker.get(W.orphan)).toBe(OU.barrow);
    expect(tree.workersByNode.get(OU.barrow)).toContain(W.orphan);
    expect(tree.workersByNode.get(OU.day)).not.toContain(W.orphan);
    // One card per worker: the tile is drawn exactly once in the whole view.
    for (const workerId of MEMBERS.map((m) => m.worker_id)) {
      const cards = [...tree.workersByNode.values()].filter((list) => list.includes(workerId));
      expect(cards.length, `worker ${workerId}`).toBeLessThanOrEqual(1);
    }
  });

  it("childPlacementByWorker is the row the RPC re-points, and is absent for a root-only worker", () => {
    expect(entries(tree.childPlacementByWorker)).toEqual([
      [201, OU.day],
      [202, OU.night],
      [204, OU.night],
      [213, OU.day],
    ]);
    expect(tree.childPlacementByWorker.has(203)).toBe(false);
    expect(tree.childPlacementByWorker.has(W.orphan)).toBe(false); // the orphan is not under their root
  });

  it("Unassigned in Worksite is the members with no card in the tree — a nested worker is not among them", () => {
    expect(tree.unassignedWorkerIds).toEqual([
      W.containerOnly,
      W.unassignedEverywhere,
      W.legacyOnly,
      218,
      219,
    ]);
  });

  it("the tree adds nothing to Not in any group (§3.5: unchanged)", () => {
    expect(notInAnyGroup(MEMBERS, UNITS, PLACEMENTS)).toEqual([W.unassignedEverywhere, W.legacyOnly, 218]);
  });
});

describe("deriveGroupTree — the Employer view and the hygiene rules", () => {
  it("a container root never nests: the Employer view is one flat card (NE-a)", () => {
    const tree = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, G.employer);
    expect(ids(tree.roots)).toEqual([OU.employerContainer]);
    expect(tree.childrenByRoot.get(OU.employerContainer)).toEqual([]);
    expect(tree.foreignNested).toEqual([]);
    expect(tree.workersByNode.get(OU.employerContainer)).toEqual([W.containerOnly, 219]);
    expect(tree.unassignedWorkerIds).toHaveLength(MEMBERS.length - 2);
    expect(tree.childOnlyByWorker.size).toBe(0);
    expect(tree.orphanChildByWorker.size).toBe(0);
  });

  it("member order is kept, non-members are ignored and duplicate member rows collapse", () => {
    const withDuplicate = [...MEMBERS, { worker_id: W.pairedDay, first_name: "Priya", last_name: "Patel" }];
    const tree = deriveGroupTree(withDuplicate, UNITS, PLACEMENTS, G.worksite);
    expect(tree.workersByNode.get(OU.day)).toEqual([W.pairedDay, 213]);
    expect(tree.nodeByWorker.has(W.nonMember)).toBe(false);
    expect([...tree.workersByNode.values()].flat()).not.toContain(W.nonMember);
  });

  it("an unknown group is an empty tree, and nothing throws on nonsense rows", () => {
    const tree = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, 999);
    expect(tree.roots).toEqual([]);
    expect(tree.nodeIds.size).toBe(0);
    expect(tree.unassignedWorkerIds).toHaveLength(MEMBERS.length);
    expect(() =>
      deriveGroupTree(
        [{ worker_id: 1 }],
        [{ ou_id: 5, group_id: 2, parent_ou_id: 5 }],
        [{ ou_id: 5, worker_id: 1 }, { ou_id: 6, worker_id: 1 }],
        2
      )
    ).not.toThrow();
  });
});

describe("deriveGroupTree — a root with children in TWO groups (review B-1)", () => {
  const units = campaign42UnitsWithSubUnitGroups();
  const placements = CAMPAIGN_42_SUB_UNIT_PLACEMENTS;
  const tree = deriveGroupTree(MEMBERS, units, placements, G.worksite);

  it("the root's children are every nested unit of any group, in the units query's order", () => {
    expect(ids(tree.childrenByRoot.get(OU.kgp)!)).toEqual([OU.day, OU.night, SUB.kgpCrew]);
    expect(ids(tree.childrenByRoot.get(OU.barrow)!)).toEqual([SUB.barrowNight, SUB.barrowCrew]);
  });

  it("a worker holding two children of one root is drawn ONCE and counted once in the roll-up", () => {
    // 220 holds KGP (Worksite) + KGP Crew (Crew) + Day (Shift).
    expect(tree.nodeByWorker.get(W.twoChildren)).toBe(OU.day);
    expect(tree.rootByWorker.get(W.twoChildren)).toBe(OU.kgp);
    expect(tree.workersByNode.get(OU.day)).toContain(W.twoChildren);
    expect(tree.workersByNode.get(SUB.kgpCrew)).not.toContain(W.twoChildren);
    expect(tree.subtreeByRoot.get(OU.kgp)!.filter((w) => w === W.twoChildren)).toHaveLength(1);
    const cards = [...tree.workersByNode.values()].filter((list) => list.includes(W.twoChildren));
    expect(cards).toHaveLength(1);
  });

  it("EVERY held child row is reported, not just the drawn one (what the planner clears)", () => {
    expect(tree.childPlacementsByWorker.get(W.twoChildren)).toEqual([OU.day, SUB.kgpCrew]);
    expect(tree.childPlacementByWorker.get(W.twoChildren)).toBe(OU.day);
    // It is not an NC-a orphan: both children are under the worker's own root.
    expect(tree.orphanChildByWorker.has(W.twoChildren)).toBe(false);
    // A child under ANOTHER root is still reported as the orphan (203: KGP + Barrow Night).
    expect(tree.orphanChildByWorker.get(203)).toBe(SUB.barrowNight);
    expect(tree.childPlacementsByWorker.get(203)).toEqual([SUB.barrowNight]);
  });

  it("which card draws the tile does not depend on the order the placement rows arrive in", () => {
    // `fetchOuAssignments` issues no ORDER BY and pages with .range(), so the
    // rows can come back in any order; the card order decides, not the rows.
    const reversed = deriveGroupTree(MEMBERS, units, [...placements].reverse(), G.worksite);
    expect(reversed.nodeByWorker.get(W.twoChildren)).toBe(OU.day);
    expect(reversed.childPlacementsByWorker.get(W.twoChildren)).toEqual([OU.day, SUB.kgpCrew]);
    expect(reversed.workersByNode.get(SUB.kgpCrew)).toEqual(tree.workersByNode.get(SUB.kgpCrew));
  });

  it("the Crew group is sub-unit-only too, so the selector still offers Employer and Worksite only", () => {
    expect(isPrimaryGroup(CAMPAIGN_42_CREW_GROUP_ID, units)).toBe(false);
    expect(primaryGroups(CAMPAIGN_42_GROUPS, units).map((g) => g.group_id)).toEqual([G.employer, G.worksite]);
  });
});

// ---------------------------------------------------------------------------
// Equivalence with `campaign_group_membership` (§3.4, §4.1)
// ---------------------------------------------------------------------------

/** The view, transcribed: one row per member × group; `ou_id` null when unplaced in that group. */
function viewOuId(
  units: readonly Campaign42Unit[],
  placements: readonly Campaign42Placement[],
  groupId: number,
  workerId: number
): number | null {
  const unitGroup = new Map(units.map((u) => [u.ou_id, u.group_id ?? null]));
  const row = placements.find((p) => p.worker_id === workerId && unitGroup.get(p.ou_id) === groupId);
  return row ? row.ou_id : null;
}

type NestedPlacementRow = { worker_id: number; ou_id: number; parent_ou_id: number };

/**
 * `00_nesting_shape.sql` (b) and (c), transcribed: placements on a child of a
 * plain (non-container, grouped) parent in ANOTHER group — which under NE-a as
 * narrowed by ruling 1 is exactly "a placement on a nested sub-unit", and the
 * only shape in which the parent + child pair can exist at all (a same-group
 * parent can never hold the worker beside the child, wp2.2.md C-a) — split by
 * what the worker holds in the parent's group. The SQL joins
 * `campaign_worker_membership` (review A-4); here the caller filters by
 * `memberIds`, and the cases assert both readings, so the non-member row the
 * fixture carries on purpose is accounted for.
 */
function nestingShapeRows(units: readonly Campaign42Unit[], placements: readonly Campaign42Placement[]) {
  const byId = new Map(units.map((u) => [u.ou_id, u]));
  const childOnly: NestedPlacementRow[] = [];
  const orphan: NestedPlacementRow[] = [];
  const paired: NestedPlacementRow[] = [];
  for (const p of placements) {
    const unit = byId.get(p.ou_id);
    const parent = unit?.parent_ou_id != null ? byId.get(unit.parent_ou_id) : undefined;
    if (!unit || !parent) continue;
    if (parent.is_group_container || parent.group_id == null) continue;
    if (parent.group_id === unit.group_id) continue;
    const inParentGroup = placements.find(
      (q) => q.worker_id === p.worker_id && byId.get(q.ou_id)?.group_id === parent.group_id
    );
    const row = { worker_id: p.worker_id, ou_id: p.ou_id, parent_ou_id: parent.ou_id };
    if (!inParentGroup) childOnly.push(row);
    else if (inParentGroup.ou_id !== parent.ou_id) orphan.push(row);
    else paired.push(row);
  }
  return { childOnly, orphan, paired };
}

describe("equivalence with campaign_group_membership (§3.4, §4.1)", () => {
  const memberIds = MEMBERS.map((m) => m.worker_id);

  it("the flat derivation is untouched: placementByWorker is the view's ou_id for every member and group", () => {
    for (const groupId of GROUP_IDS) {
      const view = deriveGroupView(MEMBERS, UNITS, PLACEMENTS, groupId);
      const tree = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, groupId);
      for (const workerId of memberIds) {
        const expected = viewOuId(UNITS, PLACEMENTS, groupId, workerId);
        expect(view.placementByWorker.get(workerId) ?? null, `view ${groupId}/${workerId}`).toBe(expected);
        expect(tree.placementByWorker.get(workerId) ?? null, `tree ${groupId}/${workerId}`).toBe(expected);
      }
    }
  });

  it("rootByWorker equals the view except on the child-only set — and on nothing else (§3.4)", () => {
    const divergent: { groupId: number; workerId: number; view: number | null; root: number }[] = [];
    for (const groupId of GROUP_IDS) {
      const tree = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, groupId);
      for (const workerId of memberIds) {
        const root = tree.rootByWorker.get(workerId);
        if (root == null) continue;
        const view = viewOuId(UNITS, PLACEMENTS, groupId, workerId);
        if (view !== root) divergent.push({ groupId, workerId, view, root });
      }
    }
    expect(divergent).toEqual([
      // (b): the view says NULL for Worksite, the tree infers KGP from parent_ou_id.
      { groupId: G.worksite, workerId: W.childOnly, view: null, root: OU.kgp },
    ]);
    // The C-k member is NOT a divergence under ruling 1: both say Barrow Jetty.
    const worksite = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, G.worksite);
    expect(worksite.rootByWorker.get(W.sameKindChild)).toBe(
      viewOuId(UNITS, PLACEMENTS, G.worksite, W.sameKindChild)
    );
  });

  it("the divergence sets are exactly queries (b) and (c) of 00_nesting_shape.sql", () => {
    const shape = nestingShapeRows(UNITS, PLACEMENTS);
    const worksite = deriveGroupTree(MEMBERS, UNITS, PLACEMENTS, G.worksite);
    expect(shape.childOnly.filter((r) => memberIds.includes(r.worker_id))).toEqual([
      { worker_id: W.childOnly, ou_id: OU.night, parent_ou_id: OU.kgp },
    ]);
    expect([...worksite.childOnlyByWorker.keys()]).toEqual([W.childOnly]);
    expect(shape.orphan.filter((r) => memberIds.includes(r.worker_id))).toEqual([
      { worker_id: W.orphan, ou_id: OU.day, parent_ou_id: OU.kgp },
    ]);
    expect([...worksite.orphanChildByWorker.keys()]).toEqual([W.orphan]);
    // The pair is the ordinary case: three paired placements. The non-member's
    // row (299 on Day) classifies as child-only and is filtered out above,
    // exactly as `00_nesting_shape.sql` filters by membership (A-4).
    expect(shape.paired.map((r) => r.worker_id)).toEqual([201, 202, 213]);
    expect(shape.childOnly.map((r) => r.worker_id)).toEqual([W.childOnly, W.nonMember]);
  });

  it("with the child-only and orphan rows removed, the two agree exactly", () => {
    const shape = nestingShapeRows(UNITS, PLACEMENTS);
    const drop = new Set(
      [...shape.childOnly, ...shape.orphan].map((r) => `${r.worker_id}:${r.ou_id}`)
    );
    const placements = PLACEMENTS.filter((p) => !drop.has(`${p.worker_id}:${p.ou_id}`));
    for (const groupId of GROUP_IDS) {
      const tree = deriveGroupTree(MEMBERS, UNITS, placements, groupId);
      for (const workerId of memberIds) {
        const view = viewOuId(UNITS, placements, groupId, workerId);
        // `rootByWorker` is the "in U" value; `nodeByWorker` is the card the
        // tile is drawn on and is a child of that root by construction.
        expect(tree.rootByWorker.get(workerId) ?? null, `${groupId}/${workerId}`).toBe(view);
      }
    }
  });
});
