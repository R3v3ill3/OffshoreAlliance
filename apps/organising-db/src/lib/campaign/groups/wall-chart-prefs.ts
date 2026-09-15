// WP2.4 Stage 1 — the `wallChart` document in `user_campaign_prefs.prefs`
// (docs/organiser-ux-review/wp/wp2.4.md §3.11, PR-a: one JSON document, no
// migration).
//
// Pure, never throws. Two halves:
//   * `parseWallChartPrefs` — the lenient reader for untrusted DB JSON: every
//     key is validated on its own, an unknown or malformed key is dropped
//     without invalidating the keys beside it, and — when the caller says
//     which ids exist — a stale group / unit / assessment id is dropped too
//     (a `colourBy` naming a deleted assessment therefore reads as
//     cumulative, and a `group` naming a deleted group falls through to the
//     next step of `resolveGroupSelection`).
//   * `filterStateToPrefs` / `filterStateFromPrefs` — the wall chart's
//     in-memory `WallChartFilterState` (Sets) ⇄ the stored shape (sorted
//     arrays), and `mergeWallChartPrefs`, which writes the `wallChart` key
//     into the last-read document so every other key (`compare`, `layout`,
//     anything a later package adds, at either level) survives.
//
// The stored document (§3.11):
//   wallChart: { v: 1, group?, colourBy?, filter?, sort?, sortFactFieldId?,
//                participation?, showEmptyUnits?, displayMode?, hiddenOuIds?,
//                overlay?, badges? }
// `compare` (WP2.5) and `layout` (WP2.6) are reserved beside these and are
// carried, never interpreted, here.

import { z } from "zod";
import type { FactFilter, FactFilterOp } from "@/lib/campaign-facts/types";
import {
  DEFAULT_FILTER_STATE,
  type ContactPresence,
  type RatingBucket,
  type RoleFilterKey,
  type SortKey,
  type WallChartFilterState,
} from "@/components/campaigns/wall-chart/filters";
import type { ParticipationSource } from "@/components/campaigns/wall-chart/participation-selector";
import { LIST_ACTIVITY_CHANNELS, type ListActivityChannel } from "@/components/campaigns/wall-chart/types";

export const WALL_CHART_PREFS_KEY = "wallChart";
export const WALL_CHART_PREFS_VERSION = 1;

// The closed unions of `filters.ts`, as runtime lists for zod. `satisfies`
// makes a drift between the two a type error here, not a silent drop.
const SORT_KEYS = [
  "last_name",
  "first_name",
  "cumulative_desc",
  "cumulative_asc",
  "last_activity_desc",
  "last_activity_asc",
  "relationships",
  "occupation",
  "fact_desc",
  "fact_asc",
] as const satisfies readonly SortKey[];
const ROLE_FILTER_KEYS = ["delegate", "activist", "contact", "hsr", "bargaining_rep", "none"] as const satisfies readonly RoleFilterKey[];
const RATING_BUCKETS = ["unrated", "1", "2", "3", "4", "5"] as const satisfies readonly RatingBucket[];
const CONTACT_PRESENCE = ["any", "has", "missing"] as const satisfies readonly ContactPresence[];
const FACT_FILTER_OPS = ["eq", "neq", "in", "gte", "lte", "between", "exists", "missing", "contains"] as const satisfies readonly FactFilterOp[];
const LIST_CHANNELS = LIST_ACTIVITY_CHANNELS as readonly [ListActivityChannel, ...ListActivityChannel[]];

const idSchema = z.number().int().positive();
const idArraySchema = z.array(idSchema);

const colourBySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cumulative") }),
  z.object({ kind: z.literal("assessment"), activityId: idSchema }),
]);

const participationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }),
  z.object({ kind: z.literal("latest") }),
  z.object({ kind: z.literal("activity"), activityId: idSchema, label: z.string() }),
  z.object({
    kind: z.literal("task_list"),
    taskListId: idSchema,
    activityId: idSchema.nullable(),
    label: z.string(),
  }),
]);

const factFilterSchema = z.object({
  field_id: idSchema,
  op: z.enum(FACT_FILTER_OPS),
  bool: z.boolean().optional(),
  int: z.number().optional(),
  int_max: z.number().optional(),
  enums: z.array(z.string()).optional(),
  text: z.string().optional(),
});

/** The filter dimensions as stored: every Set of the in-memory state is a sorted array. */
const serialisedFilterShape = {
  membershipTypeIds: idArraySchema,
  includeNonMember: z.boolean(),
  roles: z.array(z.enum(ROLE_FILTER_KEYS)),
  ratings: z.array(z.enum(RATING_BUCKETS)),
  occupationIds: idArraySchema,
  phone: z.enum(CONTACT_PRESENCE),
  email: z.enum(CONTACT_PRESENCE),
  assessmentFilters: z.array(z.object({ activityId: idSchema, buckets: z.array(z.enum(RATING_BUCKETS)) })),
  factFilters: z.array(factFilterSchema),
  /** "In unit of another group" (§3.10): unit ids of other groups. */
  otherGroupUnitIds: idArraySchema,
};
const serialisedFilterSchema = z.object(serialisedFilterShape).partial();

const wallChartPrefsShape = {
  group: z.union([idSchema, z.literal("none")]),
  colourBy: colourBySchema,
  filter: serialisedFilterSchema,
  sort: z.enum(SORT_KEYS),
  sortFactFieldId: idSchema.nullable(),
  participation: participationSchema,
  showEmptyUnits: z.boolean(),
  displayMode: z.enum(["pct", "count"]),
  hiddenOuIds: idArraySchema,
  overlay: z.boolean(),
  badges: z.array(z.enum(LIST_CHANNELS)),
};

export type SerialisedFilter = z.infer<typeof serialisedFilterSchema>;
export type ColourByPref = z.infer<typeof colourBySchema>;
export type WallChartPrefs = { v: typeof WALL_CHART_PREFS_VERSION } & Partial<
  z.infer<z.ZodObject<typeof wallChartPrefsShape>>
>;

/** Ids that exist now; a stored id outside a given set is dropped on read. */
export type KnownIds = {
  groupIds?: ReadonlySet<number>;
  ouIds?: ReadonlySet<number>;
  activityIds?: ReadonlySet<number>;
  /** Campaign data fields (`sortFactFieldId`, `factFilters[].field_id`); fix round 1, A6. */
  factFieldIds?: ReadonlySet<number>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One key, on its own: the parsed value, or `undefined` when absent or malformed. */
function readKey<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  if (value === undefined) return undefined;
  const r = schema.safeParse(value);
  return r.success ? r.data : undefined;
}

function keepKnown(ids: number[] | undefined, known: ReadonlySet<number> | undefined): number[] | undefined {
  if (ids === undefined || known === undefined) return ids;
  return ids.filter((id) => known.has(id));
}

/**
 * Never throws. Always returns a document (at least `{ v: 1 }`): unknown keys
 * are ignored, a malformed key is dropped on its own, and stale ids are
 * dropped when `known` names the live sets.
 */
export function parseWallChartPrefs(raw: unknown, known: KnownIds = {}): WallChartPrefs {
  const out: WallChartPrefs = { v: WALL_CHART_PREFS_VERSION };
  if (!isPlainObject(raw)) return out;

  const group = readKey(wallChartPrefsShape.group, raw.group);
  if (group !== undefined && (group === "none" || known.groupIds === undefined || known.groupIds.has(group))) {
    out.group = group;
  }

  const colourBy = readKey(wallChartPrefsShape.colourBy, raw.colourBy);
  if (
    colourBy !== undefined &&
    (colourBy.kind === "cumulative" || known.activityIds === undefined || known.activityIds.has(colourBy.activityId))
  ) {
    out.colourBy = colourBy;
  }

  if (isPlainObject(raw.filter)) {
    // Key by key, so one malformed dimension does not discard the rest.
    const filter: SerialisedFilter = {};
    for (const key of Object.keys(serialisedFilterShape) as (keyof typeof serialisedFilterShape)[]) {
      const value = readKey(serialisedFilterShape[key] as z.ZodType<unknown>, raw.filter[key]);
      if (value !== undefined) (filter as Record<string, unknown>)[key] = value;
    }
    if (filter.otherGroupUnitIds !== undefined) {
      filter.otherGroupUnitIds = keepKnown(filter.otherGroupUnitIds, known.ouIds);
    }
    if (filter.assessmentFilters !== undefined && known.activityIds !== undefined) {
      const live = known.activityIds;
      filter.assessmentFilters = filter.assessmentFilters.filter((f) => live.has(f.activityId));
    }
    if (filter.factFilters !== undefined && known.factFieldIds !== undefined) {
      const live = known.factFieldIds;
      filter.factFilters = filter.factFilters.filter((f) => live.has(f.field_id));
    }
    out.filter = filter;
  }

  const sort = readKey(wallChartPrefsShape.sort, raw.sort);
  if (sort !== undefined) out.sort = sort;
  const sortFactFieldId = readKey(wallChartPrefsShape.sortFactFieldId, raw.sortFactFieldId);
  if (
    sortFactFieldId !== undefined &&
    (sortFactFieldId === null || known.factFieldIds === undefined || known.factFieldIds.has(sortFactFieldId))
  ) {
    out.sortFactFieldId = sortFactFieldId;
  }

  const participation = readKey(wallChartPrefsShape.participation, raw.participation);
  if (
    participation !== undefined &&
    (participation.kind !== "activity" || known.activityIds === undefined || known.activityIds.has(participation.activityId))
  ) {
    out.participation = participation;
  }

  const showEmptyUnits = readKey(wallChartPrefsShape.showEmptyUnits, raw.showEmptyUnits);
  if (showEmptyUnits !== undefined) out.showEmptyUnits = showEmptyUnits;
  const displayMode = readKey(wallChartPrefsShape.displayMode, raw.displayMode);
  if (displayMode !== undefined) out.displayMode = displayMode;
  const hiddenOuIds = keepKnown(readKey(wallChartPrefsShape.hiddenOuIds, raw.hiddenOuIds), known.ouIds);
  if (hiddenOuIds !== undefined) out.hiddenOuIds = hiddenOuIds;
  const overlay = readKey(wallChartPrefsShape.overlay, raw.overlay);
  if (overlay !== undefined) out.overlay = overlay;
  const badges = readKey(wallChartPrefsShape.badges, raw.badges);
  if (badges !== undefined) out.badges = badges;

  return out;
}

function sortedIds(set: ReadonlySet<number>): number[] {
  return [...set].sort((a, b) => a - b);
}

function sortedKeys<T extends string>(set: ReadonlySet<T>, order: readonly T[]): T[] {
  return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * The stored form of a filter state: the dimensions under `filter` (Sets as
 * sorted arrays), and `sort`, `sortFactFieldId`, `participation` beside it,
 * as §3.11 lays the document out.
 */
export function filterStateToPrefs(
  state: WallChartFilterState
): Pick<WallChartPrefs, "filter" | "sort" | "sortFactFieldId" | "participation"> {
  return {
    filter: {
      membershipTypeIds: sortedIds(state.membershipTypeIds),
      includeNonMember: state.includeNonMember,
      roles: sortedKeys(state.roles, ROLE_FILTER_KEYS),
      ratings: sortedKeys(state.ratings, RATING_BUCKETS),
      occupationIds: sortedIds(state.occupationIds),
      phone: state.phone,
      email: state.email,
      assessmentFilters: state.assessmentFilters.map((f) => ({
        activityId: f.activityId,
        buckets: sortedKeys(f.buckets, RATING_BUCKETS),
      })),
      factFilters: state.factFilters.map((f) => ({ ...f })),
      otherGroupUnitIds: sortedIds(state.otherGroupUnitIds ?? new Set<number>()),
    },
    sort: state.sort,
    sortFactFieldId: state.sortFactFieldId,
    participation: state.participation ?? { kind: "any" },
  };
}

/**
 * A filter state from a parsed document: `DEFAULT_FILTER_STATE()` with every
 * stored dimension applied over it, so a document written by an older
 * version, or one with a dropped key, still yields a complete state.
 */
export function filterStateFromPrefs(prefs: WallChartPrefs): WallChartFilterState {
  const state = DEFAULT_FILTER_STATE();
  const f = prefs.filter ?? {};
  if (f.membershipTypeIds !== undefined) state.membershipTypeIds = new Set(f.membershipTypeIds);
  if (f.includeNonMember !== undefined) state.includeNonMember = f.includeNonMember;
  if (f.roles !== undefined) state.roles = new Set(f.roles);
  if (f.ratings !== undefined) state.ratings = new Set(f.ratings);
  if (f.occupationIds !== undefined) state.occupationIds = new Set(f.occupationIds);
  if (f.phone !== undefined) state.phone = f.phone;
  if (f.email !== undefined) state.email = f.email;
  if (f.assessmentFilters !== undefined) {
    state.assessmentFilters = f.assessmentFilters.map((af) => ({
      activityId: af.activityId,
      buckets: new Set(af.buckets),
    }));
  }
  if (f.factFilters !== undefined) state.factFilters = f.factFilters.map((ff) => ({ ...ff }) as FactFilter);
  if (f.otherGroupUnitIds !== undefined) state.otherGroupUnitIds = new Set(f.otherGroupUnitIds);
  if (prefs.sort !== undefined) state.sort = prefs.sort;
  if (prefs.sortFactFieldId !== undefined) state.sortFactFieldId = prefs.sortFactFieldId;
  if (prefs.participation !== undefined) state.participation = prefs.participation as ParticipationSource;
  return state;
}

/**
 * The whole `user_campaign_prefs.prefs` document with `patch` applied to its
 * `wallChart` key. Every other top-level key, and every key inside
 * `wallChart` the patch does not name, is carried verbatim; a patch value of
 * `undefined` removes that key. A document that is not an object is treated
 * as empty. Always stamps `v`.
 */
export function mergeWallChartPrefs(
  document: unknown,
  patch: Partial<Omit<WallChartPrefs, "v">>
): Record<string, unknown> {
  const doc = isPlainObject(document) ? document : {};
  const current = isPlainObject(doc[WALL_CHART_PREFS_KEY]) ? doc[WALL_CHART_PREFS_KEY] : {};
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  next.v = WALL_CHART_PREFS_VERSION;
  return { ...doc, [WALL_CHART_PREFS_KEY]: next };
}
