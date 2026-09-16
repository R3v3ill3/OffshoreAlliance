/**
 * WP2.4c Stage 1 (wp2.4c.md §3.7, §4.1) — the nested drop planner: every row
 * of the §3.7 step table with its exact step list and order.
 *
 * The invariants each case re-checks: adds before removes; `keepInParent` is
 * `true` on every move; `fromOuId` is always a row the worker actually holds
 * (or `null`), never the display card; a target outside the tree, `"none"`
 * and an empty selection are noops; steps merge per (kind, target, source,
 * group). The last describe proves the superset property: with a group whose
 * units have no children, the planner emits exactly the calls `planDrop` +
 * `useMoveWorkersMutation` issue today.
 */

import { describe, expect, it } from "vitest";
import { deriveGroupTree } from "../derive-group-tree";
import { groupOfUnit } from "../derive-group-view";
import { planDrop, type DropPlan, type DropRef } from "../plan-drop";
import { planNestedDrop, type MoveStep, type NestedDropPlan } from "../plan-nested-drop";
import {
  CAMPAIGN_42_CREW_GROUP_ID,
  CAMPAIGN_42_GROUP_IDS as G,
  CAMPAIGN_42_MEMBERS,
  CAMPAIGN_42_OU_IDS as OU,
  CAMPAIGN_42_PLACEMENTS,
  CAMPAIGN_42_SUB_UNIT_OU_IDS,
  CAMPAIGN_42_SUB_UNIT_PLACEMENTS,
  CAMPAIGN_42_UNITS,
  CAMPAIGN_42_WORKER_IDS as W,
  campaign42UnitsWithStandaloneShift,
  campaign42UnitsWithSubUnitGroups,
} from "./fixtures/campaign-42-shape";

const MEMBERS = CAMPAIGN_42_MEMBERS;

/** The crew group and the extra sub-units the "sibling group" rows of §3.7 need. */
const CREW = CAMPAIGN_42_CREW_GROUP_ID;
const SUB = CAMPAIGN_42_SUB_UNIT_OU_IDS;
const VARIANT_UNITS = campaign42UnitsWithSubUnitGroups();
const VARIANT_PLACEMENTS = CAMPAIGN_42_SUB_UNIT_PLACEMENTS;

const tree = deriveGroupTree(MEMBERS, CAMPAIGN_42_UNITS, CAMPAIGN_42_PLACEMENTS, G.worksite);
const variantTree = deriveGroupTree(MEMBERS, VARIANT_UNITS, VARIANT_PLACEMENTS, G.worksite);

const refs = (...workerIds: number[]): DropRef[] => workerIds.map((workerId) => ({ workerId, fromOuId: null }));

function plan(workerIds: number[], targetOuId: number | null, variant = false): NestedDropPlan {
  return planNestedDrop({
    refs: refs(...workerIds),
    targetOuId,
    groupId: G.worksite,
    tree: variant ? variantTree : tree,
    groupOfUnit: (ouId) => groupOfUnit(variant ? VARIANT_UNITS : CAMPAIGN_42_UNITS, ouId),
  });
}

function steps(workerIds: number[], targetOuId: number | null, variant = false): MoveStep[] {
  const result = plan(workerIds, targetOuId, variant);
  return result.kind === "steps" ? result.steps : [];
}

const move = (fromOuId: number | null, toOuId: number, ...workerIds: number[]): MoveStep => ({
  kind: "move",
  toOuId,
  fromOuId,
  workerIds,
  keepInParent: true,
});
const unassign = (withinGroupId: number, ...workerIds: number[]): MoveStep => ({
  kind: "unassign",
  withinGroupId,
  workerIds,
});

/**
 * `structure_placements_move` in miniature, enough to re-derive the chart from
 * what a plan leaves behind: a move displaces the worker's other rows in the
 * target's group and then places them on the target (`:2809–2820`); an
 * unassign removes their row in that group (`:2676–2690`).
 */
function applySteps(
  placements: readonly { ou_id: number; worker_id: number; is_primary: boolean }[],
  plan: MoveStep[]
): { ou_id: number; worker_id: number; is_primary: boolean }[] {
  const groupOf = (ouId: number) => groupOfUnit(VARIANT_UNITS, ouId);
  let rows = placements.map((p) => ({ ...p }));
  for (const step of plan) {
    const group = step.kind === "move" ? groupOf(step.toOuId) : step.withinGroupId;
    rows = rows.filter((r) => !(step.workerIds.includes(r.worker_id) && groupOf(r.ou_id) === group));
    if (step.kind === "move") {
      for (const workerId of step.workerIds) rows.push({ ou_id: step.toOuId, worker_id: workerId, is_primary: false });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The §3.7 table, row by row
// ---------------------------------------------------------------------------

describe("planNestedDrop — a root as the target (§3.7 rows 1–5)", () => {
  it("row 1 — the worker's card is already the target: noop", () => {
    expect(plan([203], OU.kgp)).toEqual({ kind: "noop" });
  });

  it("row 2 — from Unassigned in the group: one move from null", () => {
    expect(steps([W.unassignedEverywhere], OU.kgp)).toEqual([move(null, OU.kgp, W.unassignedEverywhere)]);
  });

  it("row 3 — from another root with no child placement: one move", () => {
    expect(steps([214], OU.kgp)).toEqual([move(OU.barrow, OU.kgp, 214)]);
  });

  it("row 4 — from a child of the target: the child placement is dropped (the parent's own area)", () => {
    // Paired worker: the Worksite row is already KGP, so only the shift goes.
    expect(steps([W.pairedDay], OU.kgp)).toEqual([unassign(G.shift, W.pairedDay)]);
    // Child-only worker: the parent row is created first (adds before removes).
    expect(steps([W.childOnly], OU.kgp)).toEqual([
      move(null, OU.kgp, W.childOnly),
      unassign(G.shift, W.childOnly),
    ]);
    // A sibling group under the same root goes too: the parent's own area is
    // "in none of its children".
    expect(steps([212], OU.kgp, true)).toEqual([unassign(CREW, 212)]);
  });

  it("row 5 — leaving a root's subtree drops the child placement held under it (NS-a)", () => {
    expect(steps([W.pairedNight], OU.barrow)).toEqual([
      move(OU.kgp, OU.barrow, W.pairedNight),
      unassign(G.shift, W.pairedNight),
    ]);
    expect(steps([215], OU.kgp, true)).toEqual([move(OU.barrow, OU.kgp, 215), unassign(G.shift, 215)]);
  });

  it("an NC-a orphan is dropped when the worker moves to a root outside its subtree", () => {
    // 203 holds KGP + a shift under Barrow; dropping them on Barrow keeps the
    // shift (it is under Barrow) — dropping them on Wheatstone removes it.
    expect(steps([203], OU.barrow, true)).toEqual([move(OU.kgp, OU.barrow, 203), unassign(G.shift, 203)]);
    expect(steps([203], OU.wheatstone, true)).toEqual([
      move(OU.kgp, OU.wheatstone, 203),
      unassign(G.shift, 203),
    ]);
  });
});

describe("planNestedDrop — a nested card as the target (§3.7 rows 6–11)", () => {
  it("row 6 — the worker is already on that child card: noop", () => {
    expect(plan([W.pairedDay], OU.day)).toEqual({ kind: "noop" });
  });

  it("row 7 — from the parent's own area: one move into the child, parent untouched", () => {
    expect(steps([203], OU.day)).toEqual([move(null, OU.day, 203)]);
    // With an orphan elsewhere in the child's group, that row is re-pointed (C-l).
    expect(steps([203], OU.day, true)).toEqual([move(SUB.barrowNight, OU.day, 203)]);
  });

  it("row 8 — between siblings of the same group: the child row is re-pointed", () => {
    expect(steps([W.pairedDay], OU.night)).toEqual([move(OU.day, OU.night, W.pairedDay)]);
  });

  it("row 9 — a sibling in another group under the same root stays", () => {
    expect(steps([212], OU.day, true)).toEqual([move(null, OU.day, 212)]);
    // …including for a worker who already holds BOTH children of this root:
    // the crew row is neither re-pointed nor removed by a drop on the shift.
    expect(steps([W.twoChildren], OU.night, true)).toEqual([move(OU.day, OU.night, W.twoChildren)]);
  });

  it("row 10 — from another root (or its child): parent first, then child, then the removes", () => {
    expect(steps([214], OU.day)).toEqual([move(OU.barrow, OU.kgp, 214), move(null, OU.day, 214)]);
    // The child held under the old root in the target's own group is re-pointed…
    expect(steps([215], OU.day, true)).toEqual([move(OU.barrow, OU.kgp, 215), move(SUB.barrowNight, OU.day, 215)]);
    // …and one held in another group is unassigned (NS-a).
    expect(steps([214], OU.day, true)).toEqual([
      move(OU.barrow, OU.kgp, 214),
      move(null, OU.day, 214),
      unassign(CREW, 214),
    ]);
  });

  it("a worker holding TWO children of one root loses BOTH when they leave it (review B-1, NS-a)", () => {
    // 220 holds KGP + Day (Shift) + KGP Crew (Crew).
    expect(steps([W.twoChildren], OU.barrow, true)).toEqual([
      move(OU.kgp, OU.barrow, W.twoChildren),
      unassign(G.shift, W.twoChildren),
      unassign(CREW, W.twoChildren),
    ]);
    // Onto a child of another root: the shift row is re-pointed, the crew row goes.
    expect(steps([W.twoChildren], SUB.barrowNight, true)).toEqual([
      move(OU.kgp, OU.barrow, W.twoChildren),
      move(OU.day, SUB.barrowNight, W.twoChildren),
      unassign(CREW, W.twoChildren),
    ]);
    // Onto the root's own area: "in none of its children" clears both (row 4).
    expect(steps([W.twoChildren], OU.kgp, true)).toEqual([
      unassign(G.shift, W.twoChildren),
      unassign(CREW, W.twoChildren),
    ]);
  });

  it("an orphan child placement is normalised into a pair by the next drop (NC-a)", () => {
    // 205 holds Barrow + Day (a shift under KGP): dropping them on Day writes
    // the missing KGP row and leaves the shift row where it is.
    expect(steps([W.orphan], OU.day)).toEqual([move(OU.barrow, OU.kgp, W.orphan)]);
  });

  it("row 11 — from Unassigned in the group: the parent row, then the child row", () => {
    expect(steps([W.unassignedEverywhere], OU.day)).toEqual([
      move(null, OU.kgp, W.unassignedEverywhere),
      move(null, OU.day, W.unassignedEverywhere),
    ]);
  });
});

describe("planNestedDrop — Unassigned in the group (§3.7 row 12)", () => {
  it("removes the group's row and every child placement held under it", () => {
    expect(steps([W.pairedDay], null)).toEqual([unassign(G.worksite, W.pairedDay), unassign(G.shift, W.pairedDay)]);
    expect(steps([203], null)).toEqual([unassign(G.worksite, 203)]);
    expect(steps([W.childOnly], null)).toEqual([unassign(G.shift, W.childOnly)]);
    expect(plan([W.unassignedEverywhere], null)).toEqual({ kind: "noop" });
  });

  it("an NC-a orphan is removed with the group's row (D1: 'each child group held', §3.7)", () => {
    expect(steps([W.orphan], null)).toEqual([unassign(G.worksite, W.orphan), unassign(G.shift, W.orphan)]);
  });

  it("every child row goes, so a removed worker cannot reappear inside the root (review B-1, D1)", () => {
    expect(steps([W.twoChildren], null, true)).toEqual([
      unassign(G.worksite, W.twoChildren),
      unassign(G.shift, W.twoChildren),
      unassign(CREW, W.twoChildren),
    ]);

    // …and re-deriving the chart from the rows the steps leave behind shows the
    // worker Unassigned in Worksite and drawn on no card — the regression D1
    // exists to prevent (checklist step 7).
    const after = applySteps(VARIANT_PLACEMENTS, steps([W.twoChildren], null, true));
    const tree = deriveGroupTree(MEMBERS, VARIANT_UNITS, after, G.worksite);
    expect(tree.unassignedWorkerIds).toContain(W.twoChildren);
    expect(tree.nodeByWorker.has(W.twoChildren)).toBe(false);
    expect(tree.childOnlyByWorker.has(W.twoChildren)).toBe(false);
    expect([...tree.workersByNode.values()].flat()).not.toContain(W.twoChildren);
  });
});

describe("planNestedDrop — the C-k sibling root and the flat foreign-nested card (§3.7 rows 13–14)", () => {
  it("row 13 — a C-k same-group child is an ordinary root (ruling 1): one move re-points the group's row", () => {
    expect(steps([214], OU.barrowJetty)).toEqual([move(OU.barrow, OU.barrowJetty, 214)]);
    expect(steps([W.unassignedEverywhere], OU.barrowJetty)).toEqual([
      move(null, OU.barrowJetty, W.unassignedEverywhere),
    ]);
    // It is a root of Worksite, so moving there leaves KGP's subtree and the
    // shift held under KGP goes with it (NS-a).
    expect(steps([W.pairedDay], OU.barrowJetty)).toEqual([
      move(OU.kgp, OU.barrowJetty, W.pairedDay),
      unassign(G.shift, W.pairedDay),
    ]);
    expect(plan([W.sameKindChild], OU.barrowJetty)).toEqual({ kind: "noop" });
    // …and dropping its member on the PARENT card is an ordinary root-to-root
    // move, not a "leave the nest" step list.
    expect(steps([W.sameKindChild], OU.barrow)).toEqual([move(OU.barrowJetty, OU.barrow, W.sameKindChild)]);
  });

  it("row 14 — a foreign-nested card is a root without children", () => {
    const units = campaign42UnitsWithStandaloneShift();
    const shiftTree = deriveGroupTree(MEMBERS, units, CAMPAIGN_42_PLACEMENTS, G.shift);
    const shiftPlan = planNestedDrop({
      refs: refs(W.pairedNight),
      targetOuId: OU.day,
      groupId: G.shift,
      tree: shiftTree,
      groupOfUnit: (ouId) => groupOfUnit(units, ouId),
    });
    expect(shiftPlan).toEqual({
      kind: "steps",
      steps: [move(OU.night, OU.day, W.pairedNight)],
      refs: [{ workerId: W.pairedNight, fromOuId: OU.night }],
    });
  });
});

describe("planNestedDrop — guards and merging", () => {
  it("a target outside the tree, Not in any group and an empty selection are noops", () => {
    expect(plan([214], OU.legacyContainer)).toEqual({ kind: "noop" }); // a unit, but not a card of this view
    expect(plan([214], 999)).toEqual({ kind: "noop" });
    expect(plan([], OU.day)).toEqual({ kind: "noop" });
    expect(
      planNestedDrop({ refs: refs(214), targetOuId: OU.day, groupId: "none", tree, groupOfUnit: () => G.shift })
    ).toEqual({ kind: "noop" });
    // A tree for another group can never be planned against this selection.
    expect(
      planNestedDrop({
        refs: refs(214),
        targetOuId: OU.day,
        groupId: G.shift,
        tree,
        groupOfUnit: (ouId) => groupOfUnit(CAMPAIGN_42_UNITS, ouId),
      })
    ).toEqual({ kind: "noop" });
  });

  it("a multi-select drop merges per (kind, target, source, group) and lists each worker once", () => {
    const result = plan([214, 215, W.unassignedEverywhere, 214, W.childOnly], OU.day);
    expect(result).toEqual({
      kind: "steps",
      steps: [
        // The child-only worker joins the "from Unassigned" parent step: the
        // missing KGP row is written before their shift row is re-pointed.
        move(OU.barrow, OU.kgp, 214, 215),
        move(null, OU.kgp, W.unassignedEverywhere, W.childOnly),
        move(null, OU.day, 214, 215, W.unassignedEverywhere),
        move(OU.night, OU.day, W.childOnly),
      ],
      refs: [
        { workerId: 214, fromOuId: OU.barrow },
        { workerId: 215, fromOuId: OU.barrow },
        { workerId: W.unassignedEverywhere, fromOuId: null },
        { workerId: W.childOnly, fromOuId: null },
      ],
    });
  });

  it("every move carries keepInParent and a source the worker actually holds (never the display card)", () => {
    const targets: (number | null)[] = [OU.kgp, OU.barrow, OU.day, OU.night, OU.barrowJetty, null];
    for (const target of targets) {
      for (const workerId of MEMBERS.map((m) => m.worker_id)) {
        const result = plan([workerId], target, true);
        if (result.kind !== "steps") continue;
        for (const step of result.steps) {
          if (step.kind !== "move") continue;
          expect(step.keepInParent, `${workerId}→${target}`).toBe(true);
          if (step.fromOuId == null) continue;
          const held = VARIANT_PLACEMENTS.some((p) => p.worker_id === workerId && p.ou_id === step.fromOuId);
          expect(held, `worker ${workerId} holds ${step.fromOuId}`).toBe(true);
        }
        // Adds before removes.
        const firstUnassign = result.steps.findIndex((s) => s.kind === "unassign");
        const lastMove = result.steps.map((s) => s.kind).lastIndexOf("move");
        if (firstUnassign >= 0 && lastMove >= 0) expect(firstUnassign).toBeGreaterThan(lastMove);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The superset property (§4.1): a flat group plans exactly what WP2.4 plans
// ---------------------------------------------------------------------------

/** What `useMoveWorkersMutation` issues for a `planDrop` plan, as steps. */
function stepsForDropPlan(dropPlan: DropPlan): MoveStep[] {
  if (dropPlan.kind === "noop") return [];
  if (dropPlan.kind === "unassign") {
    return [{ kind: "unassign", withinGroupId: dropPlan.withinGroupId, workerIds: dropPlan.workerIds }];
  }
  const bySource: MoveStep[] = [];
  for (const ref of dropPlan.refs) {
    const found = bySource.find((s) => s.kind === "move" && s.fromOuId === ref.fromOuId);
    if (found && found.kind === "move") {
      if (!found.workerIds.includes(ref.workerId)) found.workerIds.push(ref.workerId);
      continue;
    }
    bySource.push({
      kind: "move",
      toOuId: dropPlan.toOuId,
      fromOuId: ref.fromOuId,
      workerIds: [ref.workerId],
      keepInParent: true,
    });
  }
  return bySource;
}

describe("planNestedDrop is a superset of planDrop (§4.1)", () => {
  // A flat group: Ichthys and Wheatstone have no children, so a view built from
  // them alone is exactly the WP2.4 case.
  const FLAT_UNITS = CAMPAIGN_42_UNITS.filter((u) => u.ou_id === OU.ichthys || u.ou_id === OU.wheatstone);
  const FLAT_PLACEMENTS = CAMPAIGN_42_PLACEMENTS.filter((p) =>
    [OU.ichthys, OU.wheatstone].includes(p.ou_id as typeof OU.ichthys)
  );
  const flatTree = deriveGroupTree(MEMBERS, FLAT_UNITS, FLAT_PLACEMENTS, G.worksite);
  const groupUnitIds = new Set(FLAT_UNITS.map((u) => u.ou_id));

  const cases: { refs: DropRef[]; target: number | null }[] = [
    { refs: [{ workerId: 206, fromOuId: OU.ichthys }], target: OU.ichthys }, // already there
    { refs: refs(206, 216, 207, W.unassignedEverywhere), target: OU.wheatstone },
    { refs: refs(W.unassignedEverywhere), target: OU.ichthys },
    { refs: refs(206, W.unassignedEverywhere, 207), target: null },
    { refs: refs(W.unassignedEverywhere), target: null },
    { refs: refs(206), target: OU.day }, // outside the group
    { refs: [], target: OU.ichthys },
  ];

  it("emits the same RPC calls as planDrop + useMoveWorkersMutation for every planDrop case", () => {
    for (const { refs: dropRefs, target } of cases) {
      const flat = planDrop({
        refs: dropRefs,
        targetOuId: target,
        groupId: G.worksite,
        groupUnitIds,
        placementByWorker: flatTree.placementByWorker,
      });
      const nested = planNestedDrop({
        refs: dropRefs,
        targetOuId: target,
        groupId: G.worksite,
        tree: flatTree,
        groupOfUnit: (ouId) => groupOfUnit(FLAT_UNITS, ouId),
      });
      const label = `${dropRefs.map((r) => r.workerId).join(",")}→${target}`;
      expect(nested.kind === "steps" ? nested.steps : [], label).toEqual(stepsForDropPlan(flat));
      if (flat.kind !== "noop") {
        expect(nested.kind === "steps" ? nested.refs : [], label).toEqual(flat.refs);
      }
    }
  });
});
