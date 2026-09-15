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
  /** Units, for the `?ou=` step: only `ou_id` and `group_id` are read. */
  ous: readonly { readonly ou_id: number; readonly group_id?: number | null }[];
  /** Raw `?ou=` value; `null`/`undefined` when absent. */
  ouParam?: string | null;
  /** Raw `?group=` value; `null`/`undefined` when absent. */
  groupParam?: string | null;
  /** `wallChart.group` from the prefs document; `null`/`undefined` when absent. */
  prefsGroup?: GroupSelection | null;
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

  // 1. `?ou=`: the unit's group, when the unit exists and carries a known group.
  const ouId = parseId(input.ouParam);
  if (ouId != null) {
    const unit = input.ous.find((o) => o.ou_id === ouId);
    const groupId = unit?.group_id ?? null;
    if (groupId != null && known.has(groupId)) return { selection: groupId, source: "ou" };
  }

  // 2. `?group=`.
  const fromUrl = parseGroupParam(input.groupParam);
  if (isKnownSelection(fromUrl, known)) return { selection: fromUrl, source: "url" };

  // 3. prefs.
  if (isKnownSelection(input.prefsGroup, known)) return { selection: input.prefsGroup, source: "prefs" };

  // 4. first group; 5. none.
  const first = ordered[0];
  if (first) return { selection: first.group_id, source: "first" };
  return { selection: "none", source: "none" };
}
