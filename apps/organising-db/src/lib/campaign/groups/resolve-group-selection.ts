// WP2.4 Stage 1 — which group the wall chart shows
// (docs/organiser-ux-review/wp/wp2.4.md §3.11 "Resolution").
//
// Pure, never throws. The precedence chain, stated once:
//   1. `?ou=<id>`   — the focused unit's group (the scroll-and-highlight link);
//   2. `?group=`    — a valid `<group_id>` or `none`;
//   3. prefs        — `wallChart.group` if that group still exists (or `none`);
//   4. first group  — by `display_order`, then `group_id`;
//   5. `none`       — Not in any group (the only view when there are no groups).
// Invalid values never throw; each step falls through to the next.
//
// WP2.4c (wp2.4c.md §3.5, SG-a): the optional `primaryIds` narrows every step
// to the groups the selector offers — the primary groups, i.e. everything but
// a group whose every unit is nested under a unit of another group
// (`primaryGroups` of `derive-group-tree.ts`). A `?group=` or a stored
// preference naming a sub-unit-only group then falls through exactly as a
// deleted group does today, so no view exists that the Group control cannot
// reach and "Unassigned in Shift" is never rendered. `?ou=` naming a nested
// unit resolves to the nearest ancestor carrying a primary group — its root's
// group under NE-a — and the focus effect still scrolls to the nested card.
// Absent (the WP2.4 callers and their cases): today's behaviour, unchanged.

export type GroupSelection = number | "none";

export type GroupSelectionSource = "ou" | "url" | "prefs" | "first" | "none";

export type ResolvedGroupSelection = {
  selection: GroupSelection;
  source: GroupSelectionSource;
};

export type GroupLike = {
  readonly group_id: number;
  readonly display_order?: number | null;
};

export type ResolveGroupSelectionInput = {
  groups: readonly GroupLike[];
  /**
   * Units, for the `?ou=` step: `ou_id` and `group_id`, plus `parent_ou_id`
   * for the WP2.4c walk to the nearest ancestor with a primary group.
   */
  ous: readonly {
    readonly ou_id: number;
    readonly group_id?: number | null;
    readonly parent_ou_id?: number | null;
  }[];
  /** Raw `?ou=` value; `null`/`undefined` when absent. */
  ouParam?: string | null;
  /** Raw `?group=` value; `null`/`undefined` when absent. */
  groupParam?: string | null;
  /** `wallChart.group` from the prefs document; `null`/`undefined` when absent. */
  prefsGroup?: GroupSelection | null;
  /**
   * WP2.4c SG-a: the ids the Group selector offers (`primaryGroups`). Absent
   * or `null` → every group is selectable, which is WP2.4's behaviour.
   */
  primaryIds?: ReadonlySet<number> | readonly number[] | null;
};

export const NONE_GROUP_PARAM = "none";

/** Groups in selector order: `display_order` ascending (nulls last), then `group_id`. */
export function orderGroups<G extends GroupLike>(groups: readonly G[]): G[] {
  return [...groups].sort((a, b) => {
    const ao = a.display_order ?? Number.POSITIVE_INFINITY;
    const bo = b.display_order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao < bo ? -1 : 1;
    return a.group_id - b.group_id;
  });
}

/** A positive integer id from a URL value, else `null`. */
function parseId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * `?group=` as a selection, or `null` when it names nothing: `none` → `"none"`;
 * a positive integer → that id (existence is checked by the resolver).
 */
export function parseGroupParam(raw: string | null | undefined): GroupSelection | null {
  if (typeof raw !== "string") return null;
  if (raw.trim() === NONE_GROUP_PARAM) return "none";
  return parseId(raw);
}

/** The `?group=` value for a selection. */
export function groupParamValue(selection: GroupSelection): string {
  return selection === "none" ? NONE_GROUP_PARAM : String(selection);
}

function isKnownSelection(candidate: GroupSelection | null | undefined, known: ReadonlySet<number>): candidate is GroupSelection {
  if (candidate == null) return false;
  return candidate === "none" || known.has(candidate);
}

export function resolveGroupSelection(input: ResolveGroupSelectionInput): ResolvedGroupSelection {
  const ordered = orderGroups(input.groups);
  const known = new Set(ordered.map((g) => g.group_id));
  // Selectable = the primary ids that are live groups; every group when the
  // caller passes none (WP2.4).
  const selectable =
    input.primaryIds == null
      ? known
      : new Set([...input.primaryIds].filter((id) => known.has(id)));

  // 1. `?ou=`: the unit's group, or — when that group is not selectable — the
  //    nearest ancestor's (a nested unit opens on its root's group, §3.5).
  const ouId = parseId(input.ouParam);
  if (ouId != null) {
    // First row wins for a duplicated `ou_id`, as WP2.4's `find` did.
    const byId = new Map<number, (typeof input.ous)[number]>();
    for (const o of input.ous) if (!byId.has(o.ou_id)) byId.set(o.ou_id, o);
    let unit = byId.get(ouId);
    const walked = new Set<number>();
    while (unit && !walked.has(unit.ou_id)) {
      walked.add(unit.ou_id);
      const groupId = unit.group_id ?? null;
      if (groupId != null && selectable.has(groupId)) return { selection: groupId, source: "ou" };
      // Without `primaryIds` the focused unit's own group is the only step
      // (WP2.4, unchanged): no group, no view.
      if (input.primaryIds == null) break;
      const parentId = unit.parent_ou_id ?? null;
      unit = parentId == null ? undefined : byId.get(parentId);
    }
  }

  // 2. `?group=`.
  const fromUrl = parseGroupParam(input.groupParam);
  if (isKnownSelection(fromUrl, selectable)) return { selection: fromUrl, source: "url" };

  // 3. prefs.
  if (isKnownSelection(input.prefsGroup, selectable)) return { selection: input.prefsGroup, source: "prefs" };

  // 4. first selectable group; 5. none.
  const first = ordered.find((g) => selectable.has(g.group_id));
  if (first) return { selection: first.group_id, source: "first" };
  return { selection: "none", source: "none" };
}
