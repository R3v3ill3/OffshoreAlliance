import type { AssessmentMetricsInput } from "./metrics";
import type { RatingFilterAssessmentContext } from "./filters";
import type { ActivityRating, AssessmentSelection } from "./types";

/**
 * WP2.3 — the wall chart's private pure helpers, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:139–213` and `WC:958`) so the shell carries
 * only composition.
 *
 * React-free by contract (§3.3): nothing here imports React, and every
 * function is a pure transformation of its arguments — `readHierarchyView` is
 * the one exception in that it reads `window.localStorage`, which it already
 * did, guarded by the same `typeof window === "undefined"` check.
 */

/** Per-unit filter state key: 0 = unassigned, positive = ou_id. */
export const UNASSIGNED_KEY = 0;

export function activityIdsForWallChartSelections(
  campaignDefault: AssessmentSelection,
  overrides: Map<number, AssessmentSelection>
): number[] {
  const s = new Set<number>();
  if (campaignDefault.kind === "assessment") s.add(campaignDefault.activityId);
  for (const v of overrides.values()) {
    if (v.kind === "assessment") s.add(v.activityId);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * ou_id -> parent ou_id (null for a top-level unit). `UNASSIGNED_KEY` is never
 * a key here, so the unassigned scope always resolves flat.
 */
export type ParentByOu = ReadonlyMap<number, number | null>;

/**
 * The override that applies to a scope: its own, else the nearest ancestor's,
 * else nothing. Without `parentByOu` this is the flat per-scope lookup it
 * always was. A malformed parent chain (a cycle, or a parent missing from the
 * map) ends the walk rather than looping or throwing.
 */
export function resolveScopeOverride<T>(
  scopeKey: number,
  overrides: ReadonlyMap<number, T | undefined>,
  parentByOu?: ParentByOu
): T | undefined {
  const visited = new Set<number>();
  let key: number | null | undefined = scopeKey;
  while (key != null && !visited.has(key)) {
    visited.add(key);
    const own = overrides.get(key);
    if (own !== undefined) return own;
    key = parentByOu?.get(key);
  }
  return undefined;
}

/**
 * A sub-unit follows the nearest ancestor unit that has a View override unless
 * it has its own; otherwise the campaign default.
 */
export function effectiveAssessmentForScope(
  scopeKey: number,
  campaignDefault: AssessmentSelection,
  overrides: ReadonlyMap<number, AssessmentSelection>,
  parentByOu?: ParentByOu
): AssessmentSelection {
  return resolveScopeOverride(scopeKey, overrides, parentByOu) ?? campaignDefault;
}

export function buildAssessmentMetricsInput(
  sel: AssessmentSelection,
  byActivity: Map<number, Map<number, ActivityRating>>
): AssessmentMetricsInput | undefined {
  if (sel.kind !== "assessment") return undefined;
  const ratings = byActivity.get(sel.activityId) ?? new Map();
  return {
    ratings,
    isBinary: sel.isBinary,
    supportiveBinaryValue: sel.supporterOutcomeValue,
  };
}

export function scopeAssessmentFilterAndSort(
  scopeKey: number,
  campaignDefault: AssessmentSelection,
  overrides: ReadonlyMap<number, AssessmentSelection>,
  byActivity: Map<number, Map<number, ActivityRating>>,
  parentByOu?: ParentByOu
): {
  activityRatings?: Map<number, ActivityRating>;
  ratingCtx?: RatingFilterAssessmentContext;
  sortAssessment?: {
    selection: Extract<AssessmentSelection, { kind: "assessment" }>;
    activityRatings: Map<number, ActivityRating>;
  };
} {
  const effective = effectiveAssessmentForScope(scopeKey, campaignDefault, overrides, parentByOu);
  if (effective.kind !== "assessment") return {};
  const activityRatings = byActivity.get(effective.activityId) ?? new Map();
  return {
    activityRatings,
    ratingCtx: { selection: effective },
    sortAssessment: { selection: effective, activityRatings },
  };
}

export type UnitHierarchyViewMode = "unit" | "subunit";

export const hierarchyViewKey = (campaignId: string) => `wallchart:subUnitView:${campaignId}`;

export function readHierarchyView(campaignId: string): Map<number, UnitHierarchyViewMode> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(hierarchyViewKey(campaignId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, UnitHierarchyViewMode>;
    return new Map(
      Object.entries(parsed)
        .filter(([, mode]) => mode === "unit" || mode === "subunit")
        .map(([id, mode]) => [Number(id), mode])
    );
  } catch {
    return new Map();
  }
}
