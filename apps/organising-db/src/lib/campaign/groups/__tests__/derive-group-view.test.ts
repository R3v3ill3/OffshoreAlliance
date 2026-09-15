/**
 * WP2.4 Stage 1 (wp2.4.md §4.1) — the pure group derivations, and their
 * equivalence with the `campaign_group_membership` view.
 *
 * The view (supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:156–160):
 *
 *   select g.campaign_id, g.group_id, g.kind, g.name as group_name, m.worker_id,
 *          p.id as placement_id, p.ou_id, p.is_primary, p.assignment_source
 *   from public.campaign_worker_membership m
 *   join public.campaign_groups g on g.campaign_id = m.campaign_id
 *   left join public.campaign_worker_ou p on p.worker_id = m.worker_id and p.group_id = g.group_id;
 *
 * `campaignGroupMembershipRows` below transcribes it over a fixture, with
 * `p.group_id` taken from the placement's unit exactly as the WP2.1 trigger
 * `cwo_set_group_id` derives it (20260912035329:722–743). The equivalence
 * cases then require `deriveGroupView` / `notInAnyGroup` to reproduce the
 * view's rows for every group — the consumption contract of wp2.1.md §2.3.
 */

import { describe, expect, it } from "vitest";
import {
  deriveGroupView,
  groupOfUnit,
  notInAnyGroup,
  sortUnits,
  unitsByWorker,
  unitsOfGroup,
  type GroupMemberLike,
  type GroupPlacementLike,
  type GroupUnitLike,
} from "../derive-group-view";

type Fixture = {
  groups: { group_id: number }[];
  members: GroupMemberLike[];
  ous: GroupUnitLike[];
  placements: GroupPlacementLike[];
};

/** The view, transcribed: one row per member × group; `ou_id` null when unplaced in that group. */
function campaignGroupMembershipRows(f: Fixture): { group_id: number; worker_id: number; ou_id: number | null }[] {
  const unitGroup = new Map(f.ous.map((u) => [u.ou_id, u.group_id ?? null]));
  const rows: { group_id: number; worker_id: number; ou_id: number | null }[] = [];
  for (const m of f.members) {
    for (const g of f.groups) {
      // `p.group_id = g.group_id` — the trigger-derived column equals the unit's group_id.
      const p = f.placements.find(
        (pl) => pl.worker_id === m.worker_id && unitGroup.get(pl.ou_id) === g.group_id
      );
      rows.push({ group_id: g.group_id, worker_id: m.worker_id, ou_id: p ? p.ou_id : null });
    }
  }
  return rows;
}

const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

/** Employer (100) and Worksite (200) groups; 300 = Shift; a legacy custom container with no group. */
const SMALL: Fixture = {
  groups: [{ group_id: 100 }, { group_id: 200 }, { group_id: 300 }],
  members: [{ worker_id: 1 }, { worker_id: 2 }, { worker_id: 3 }, { worker_id: 4 }, { worker_id: 5 }],
  ous: [
    // In the units query's order (`display_order`, `name`), as the chart receives them.
    { ou_id: 30, group_id: 300, display_order: 0, name: "Day" },
    { ou_id: 90, group_id: null, display_order: 0, name: "Legacy container" }, // custom-kind container
    { ou_id: 22, group_id: 200, display_order: 1, name: "Barrow" },
    { ou_id: 10, group_id: 100, display_order: 1, name: "Fugro" }, // Employer container, carries the group
    { ou_id: 21, group_id: 200, display_order: 1, name: "Ichthys" },
    { ou_id: 20, group_id: 200, display_order: 2, name: "KGP" },
  ],
  placements: [
    { ou_id: 10, worker_id: 1 }, // 1: Employer + Worksite (two groups)
    { ou_id: 20, worker_id: 1 },
    { ou_id: 21, worker_id: 2 }, // 2: Worksite only
    { ou_id: 90, worker_id: 3 }, // 3: only on the legacy container → counts for no group
    { ou_id: 30, worker_id: 99 }, // 99 is not a member → ignored
    // 4, 5: nowhere
  ],
};

describe("unitsOfGroup / sortUnits / groupOfUnit", () => {
  it("returns the units carrying the group in the caller's order (the units query's: display_order, name)", () => {
    expect(unitsOfGroup(SMALL.ous, 200).map((u) => u.ou_id)).toEqual([22, 21, 20]);
    expect(unitsOfGroup(SMALL.ous, 100).map((u) => u.ou_id)).toEqual([10]);
    expect(unitsOfGroup(SMALL.ous, 999)).toEqual([]);
  });

  it("keeps input order even when it is not sorted — the query's collation order is trusted, never re-sorted (A4 / D8)", () => {
    const ous: GroupUnitLike[] = [
      { ou_id: 2, group_id: 5, display_order: 1, name: "b" },
      { ou_id: 1, group_id: 5, display_order: 1, name: "B" }, // a case tie Postgres may order either way
      { ou_id: 3, group_id: 5, display_order: 0, name: "c" },
    ];
    expect(unitsOfGroup(ous, 5).map((u) => u.ou_id)).toEqual([2, 1, 3]);
  });

  it("sortUnits orders unsorted rows by display_order (missing last), then name, then ou_id, and never returns a unit without a group through unitsOfGroup", () => {
    const ous: GroupUnitLike[] = [
      { ou_id: 1, group_id: 5, display_order: null, name: "a" },
      { ou_id: 2, group_id: 5, display_order: 3, name: "b" },
      { ou_id: 4, group_id: 5, display_order: 3, name: "B" },
      { ou_id: 3, group_id: null, display_order: 0, name: "c" },
    ];
    expect(sortUnits(ous).map((u) => u.ou_id)).toEqual([3, 2, 4, 1]);
    expect(unitsOfGroup(sortUnits(ous), 5).map((u) => u.ou_id)).toEqual([2, 4, 1]);
  });

  it("groupOfUnit gives the unit's group, null for a container without one or an unknown unit", () => {
    expect(groupOfUnit(SMALL.ous, 20)).toBe(200);
    expect(groupOfUnit(SMALL.ous, 90)).toBeNull();
    expect(groupOfUnit(SMALL.ous, 12345)).toBeNull();
  });
});

describe("deriveGroupView", () => {
  it("Unassigned is per group: a worker in one group is Unassigned in the others", () => {
    const worksite = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, 200);
    expect(worksite.units.map((u) => u.ou_id)).toEqual([22, 21, 20]);
    expect(worksite.workersByUnit.get(20)).toEqual([1]);
    expect(worksite.workersByUnit.get(21)).toEqual([2]);
    expect(worksite.workersByUnit.get(22)).toEqual([]);
    expect(worksite.unassignedWorkerIds).toEqual([3, 4, 5]);
    expect([...worksite.placementByWorker.entries()]).toEqual([[1, 20], [2, 21]]);

    const employer = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, 100);
    expect(employer.workersByUnit.get(10)).toEqual([1]);
    expect(employer.unassignedWorkerIds).toEqual([2, 3, 4, 5]);

    const shift = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, 300);
    expect(shift.workersByUnit.get(30)).toEqual([]); // 99 is not a member
    expect(shift.unassignedWorkerIds).toEqual([1, 2, 3, 4, 5]);
  });

  it("an Employer container with a group_id is an ordinary unit of that group", () => {
    const employer = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, 100);
    expect(employer.units).toEqual([SMALL.ous.find((u) => u.ou_id === 10)]);
  });

  it("a placement on a legacy container (group_id null) counts for no group", () => {
    for (const g of [100, 200, 300]) {
      const view = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, g);
      expect(view.unassignedWorkerIds, `group ${g}`).toContain(3);
      expect(view.placementByWorker.has(3), `group ${g}`).toBe(false);
    }
  });

  it("zero groups / an unknown group: no units, everyone Unassigned", () => {
    const view = deriveGroupView(SMALL.members, SMALL.ous, SMALL.placements, 4242);
    expect(view.units).toEqual([]);
    expect(view.workersByUnit.size).toBe(0);
    expect(view.unassignedWorkerIds).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps member order, collapses duplicate members, and keeps the first placement should a legacy row set hold two in one group", () => {
    const members: GroupMemberLike[] = [{ worker_id: 7 }, { worker_id: 6 }, { worker_id: 7 }];
    const ous: GroupUnitLike[] = [
      { ou_id: 1, group_id: 9, display_order: 0, name: "A" },
      { ou_id: 2, group_id: 9, display_order: 1, name: "B" },
    ];
    const placements: GroupPlacementLike[] = [
      { ou_id: 2, worker_id: 7 },
      { ou_id: 1, worker_id: 7 },
    ];
    const view = deriveGroupView(members, ous, placements, 9);
    expect(view.workersByUnit.get(2)).toEqual([7]);
    expect(view.workersByUnit.get(1)).toEqual([]);
    expect(view.unassignedWorkerIds).toEqual([6]);
  });
});

describe("notInAnyGroup", () => {
  it("is the set of members Unassigned in every group; a legacy-container placement does not remove a worker from it", () => {
    expect(notInAnyGroup(SMALL.members, SMALL.ous, SMALL.placements)).toEqual([3, 4, 5]);
  });

  it("with no grouped units (zero groups) it is the whole membership, in order, without duplicates", () => {
    const ous: GroupUnitLike[] = [{ ou_id: 90, group_id: null }];
    const members = [{ worker_id: 2 }, { worker_id: 1 }, { worker_id: 2 }];
    expect(notInAnyGroup(members, ous, [{ ou_id: 90, worker_id: 2 }])).toEqual([2, 1]);
    expect(notInAnyGroup(members, [], [])).toEqual([2, 1]);
  });
});

describe("unitsByWorker", () => {
  it("indexes every placement across every group (the 'all groups' index for the other-group filter)", () => {
    const index = unitsByWorker(SMALL.placements);
    expect([...index.get(1)!]).toEqual([10, 20]);
    expect([...index.get(3)!]).toEqual([90]);
    expect(index.has(4)).toBe(false);
  });
});

/** A deterministic pseudo-random fixture (LCG), so the equivalence case covers many shapes without flakiness. */
function generate(seed: number): Fixture {
  let s = seed >>> 0;
  const rnd = (n: number) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % n;
  };
  const groups = [{ group_id: 1 }, { group_id: 2 }, { group_id: 3 }];
  const ous: GroupUnitLike[] = [];
  let ouId = 100;
  for (const g of groups) {
    const n = 1 + rnd(4);
    for (let i = 0; i < n; i++) ous.push({ ou_id: ouId++, group_id: g.group_id, display_order: rnd(3), name: `u${ouId}` });
  }
  // Two legacy containers without a group.
  ous.push({ ou_id: 900, group_id: null, display_order: 0, name: "legacy A" });
  ous.push({ ou_id: 901, group_id: null, display_order: 0, name: "legacy B" });

  const memberCount = 20 + rnd(30);
  const members: GroupMemberLike[] = [];
  for (let w = 1; w <= memberCount; w++) members.push({ worker_id: w });

  const placements: GroupPlacementLike[] = [];
  for (const m of members) {
    for (const g of groups) {
      // One unit at most per group (the WP2.2b unique index), ~60 % placed.
      if (rnd(10) < 6) {
        const units = ous.filter((u) => u.group_id === g.group_id);
        placements.push({ ou_id: units[rnd(units.length)].ou_id, worker_id: m.worker_id });
      }
    }
    if (rnd(10) === 0) placements.push({ ou_id: 900 + rnd(2), worker_id: m.worker_id });
  }
  // Placements of non-members (never rows of the view).
  placements.push({ ou_id: 100, worker_id: 5000 });
  placements.push({ ou_id: 900, worker_id: 5001 });
  return { groups, members, ous, placements };
}

describe("equivalence with campaign_group_membership (wp2.1.md §2.3 consumption contract)", () => {
  const fixtures: [string, Fixture][] = [
    ["hand-written", SMALL],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed): [string, Fixture] => [`generated seed ${seed}`, generate(seed)]),
  ];

  it.each(fixtures)("%s: Unassigned per group equals the view's ou_id IS NULL rows, and each unit's workers equal its rows", (_label, f) => {
    const rows = campaignGroupMembershipRows(f);
    for (const g of f.groups) {
      const view = deriveGroupView(f.members, f.ous, f.placements, g.group_id);
      const groupRows = rows.filter((r) => r.group_id === g.group_id);

      expect(groupRows.length, "one row per member per group").toBe(f.members.length);
      expect(sorted(view.unassignedWorkerIds)).toEqual(
        sorted(groupRows.filter((r) => r.ou_id === null).map((r) => r.worker_id))
      );
      for (const u of view.units) {
        expect(sorted(view.workersByUnit.get(u.ou_id)!), `unit ${u.ou_id}`).toEqual(
          sorted(groupRows.filter((r) => r.ou_id === u.ou_id).map((r) => r.worker_id))
        );
      }
      // Every placed row of the view names a unit the derivation shows.
      const placedRows = groupRows.filter((r) => r.ou_id !== null);
      const shown = new Set(view.units.map((u) => u.ou_id));
      for (const r of placedRows) expect(shown.has(r.ou_id!), `row unit ${r.ou_id}`).toBe(true);
      // The two partitions cover the membership exactly once.
      const placedIds = [...view.workersByUnit.values()].flat();
      expect(sorted([...placedIds, ...view.unassignedWorkerIds])).toEqual(sorted(f.members.map((m) => m.worker_id)));
    }
  });

  it.each(fixtures)("%s: Not in any group equals the members whose every view row has ou_id IS NULL", (_label, f) => {
    const rows = campaignGroupMembershipRows(f);
    const expected = f.members
      .map((m) => m.worker_id)
      .filter((w) => rows.filter((r) => r.worker_id === w).every((r) => r.ou_id === null));
    expect(notInAnyGroup(f.members, f.ous, f.placements)).toEqual(expected);
  });

  it("with zero groups the view has no rows and Not in any group is the whole membership", () => {
    const f: Fixture = { ...SMALL, groups: [], ous: SMALL.ous.filter((u) => u.group_id == null) };
    expect(campaignGroupMembershipRows(f)).toEqual([]);
    expect(notInAnyGroup(f.members, f.ous, f.placements)).toEqual([1, 2, 3, 4, 5]);
  });
});
