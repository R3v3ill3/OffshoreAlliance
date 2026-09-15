// WP2.4 Stage 1 — the group model as the wall chart consumes it
// (docs/organiser-ux-review/wp/wp2.4.md §3.3, principle 5 "derived, never
// stored").
//
// Pure: no React, no I/O, never throws. Everything here is a function of the
// three row sets the chart already holds (members, units, placements), so
// Unassigned and Not in any group are never materialised and never stored.
//
// Semantics (§3.3), stated once so the §4.1 equivalence test can transcribe
// the `campaign_group_membership` view beside them:
//   * a placement belongs to group G iff its unit's `group_id === G` — the
//     same value the WP2.1 trigger `cwo_set_group_id` derives onto the row;
//   * Unassigned in G = members with no such placement (= the view's rows for
//     G with `ou_id IS NULL`);
//   * Not in any group = members with no placement on any unit that carries a
//     `group_id` (= `ou_id IS NULL` on every one of the member's view rows).
//     A placement on a legacy container with `group_id NULL` counts for no
//     group, so it does not remove a worker from Not in any group (§8.2).
//
// The inputs are structural so WP2.6/2.7 can pass their own row types; the
// wall chart passes `WallChartWorker[]`, `WallChartOU[]` and
// `WallChartOUAssignment[]` unchanged.

/** A member row: only the worker id is read. */
export type GroupMemberLike = { readonly worker_id: number };

/** A unit row: the group it carries, and the two ordering keys. */
export type GroupUnitLike = {
  readonly ou_id: number;
  readonly group_id?: number | null;
  readonly display_order?: number | null;
  readonly name?: string | null;
};

/** A placement row (`campaign_worker_ou` as the chart selects it). */
export type GroupPlacementLike = {
  readonly ou_id: number;
  readonly worker_id: number;
};

export type GroupView<U extends GroupUnitLike = GroupUnitLike> = {
  groupId: number;
  /** Units of the group, in the caller's (the units query's) order. */
  units: U[];
  /** Worker ids per unit of the group, in member order. Every unit has an entry, empty or not. */
  workersByUnit: Map<number, number[]>;
  /** Members with no placement on any unit of the group, in member order. */
  unassignedWorkerIds: number[];
  /** worker id → the unit the member holds in this group (absent = Unassigned). */
  placementByWorker: Map<number, number>;
};

function compareUnits(a: GroupUnitLike, b: GroupUnitLike): number {
  const ao = a.display_order ?? Number.POSITIVE_INFINITY;
  const bo = b.display_order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  const an = a.name ?? "";
  const bn = b.name ?? "";
  const byName = an.localeCompare(bn, undefined, { sensitivity: "base" });
  return byName !== 0 ? byName : a.ou_id - b.ou_id;
}

/**
 * `display_order`, then `name` (locale, base sensitivity), then `ou_id` — for
 * a caller whose rows are NOT already in the units query's order. The wall
 * chart never needs it: its rows arrive ordered by Postgres
 * (`.order("display_order").order("name")`, `use-wall-chart-structure.ts:53–61`)
 * and `unitsOfGroup` keeps that order, so case/accent ties sort exactly as
 * the legacy chart shows them (fix round 1, A4 / D8).
 */
export function sortUnits<U extends GroupUnitLike>(ous: readonly U[]): U[] {
  return [...ous].sort(compareUnits);
}

/**
 * The units of group `groupId`: every unit whose `group_id` is that group —
 * Employer containers that carry the group included, legacy custom-kind
 * containers (`group_id NULL`) never — in the caller's order (a stable
 * filter). Pass the units query's rows and the order is the query's,
 * `display_order, name`; pass unsorted rows through `sortUnits` first.
 */
export function unitsOfGroup<U extends GroupUnitLike>(
  ous: readonly U[],
  groupId: number
): U[] {
  return ous.filter((ou) => ou.group_id === groupId);
}

/** The group a unit carries, or `null` for an unknown unit or a unit with no group. */
export function groupOfUnit(ous: readonly GroupUnitLike[], ouId: number): number | null {
  const ou = ous.find((o) => o.ou_id === ouId);
  return ou?.group_id ?? null;
}

/**
 * worker id → the ids of every unit the worker holds a placement on, across
 * every group (and on units without a group). This is the "all groups" index
 * `applyFilters` takes for the "in unit of another group" dimension
 * (§3.10); the tile index the v2 chart passes is `workersByUnit` of ONE
 * group, never this map (§3.13).
 */
export function unitsByWorker(
  placements: readonly GroupPlacementLike[]
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const p of placements) {
    const set = out.get(p.worker_id) ?? new Set<number>();
    set.add(p.ou_id);
    out.set(p.worker_id, set);
  }
  return out;
}

/**
 * The group view: the units of `groupId`, who sits in each, and who is
 * Unassigned in that group.
 *
 * Only members count (the view starts from `campaign_worker_membership`); a
 * placement whose worker is not a member, or whose unit is not a unit of the
 * group, is ignored. The one-unit-per-group index (WP2.2b) means a member
 * has at most one placement in the group; should a legacy row set violate
 * that, the first placement in input order wins and the others are ignored.
 */
export function deriveGroupView<U extends GroupUnitLike>(
  members: readonly GroupMemberLike[],
  ous: readonly U[],
  placements: readonly GroupPlacementLike[],
  groupId: number
): GroupView<U> {
  const units = unitsOfGroup(ous, groupId);
  const unitIds = new Set(units.map((u) => u.ou_id));
  const memberIds = new Set(members.map((m) => m.worker_id));

  const placementByWorker = new Map<number, number>();
  for (const p of placements) {
    if (!unitIds.has(p.ou_id)) continue;
    if (!memberIds.has(p.worker_id)) continue;
    if (placementByWorker.has(p.worker_id)) continue;
    placementByWorker.set(p.worker_id, p.ou_id);
  }

  const workersByUnit = new Map<number, number[]>();
  for (const u of units) workersByUnit.set(u.ou_id, []);
  const unassignedWorkerIds: number[] = [];
  const seen = new Set<number>();
  for (const m of members) {
    if (seen.has(m.worker_id)) continue;
    seen.add(m.worker_id);
    const ouId = placementByWorker.get(m.worker_id);
    if (ouId == null) {
      unassignedWorkerIds.push(m.worker_id);
    } else {
      workersByUnit.get(ouId)!.push(m.worker_id);
    }
  }

  return { groupId, units, workersByUnit, unassignedWorkerIds, placementByWorker };
}

/**
 * Members with no placement on any unit that carries a `group_id` — Unassigned
 * in every group (§3.8). With zero groups this is the whole membership (the
 * flat-grid state of decision 4). Member order; duplicates collapsed.
 */
export function notInAnyGroup(
  members: readonly GroupMemberLike[],
  ous: readonly GroupUnitLike[],
  placements: readonly GroupPlacementLike[]
): number[] {
  const groupedUnitIds = new Set<number>();
  for (const ou of ous) if (ou.group_id != null) groupedUnitIds.add(ou.ou_id);
  const placedSomewhere = new Set<number>();
  for (const p of placements) if (groupedUnitIds.has(p.ou_id)) placedSomewhere.add(p.worker_id);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of members) {
    if (seen.has(m.worker_id)) continue;
    seen.add(m.worker_id);
    if (!placedSomewhere.has(m.worker_id)) out.push(m.worker_id);
  }
  return out;
}
