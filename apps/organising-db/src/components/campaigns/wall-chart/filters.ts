import { assessmentNumericForWallChart } from "./rating-colour";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartRatingSummary,
  WallChartWorker,
} from "./types";

/** When rating filter runs against per-activity rows, pass this for binary-aware buckets. */
export type RatingFilterAssessmentContext = {
  selection: Extract<AssessmentSelection, { kind: "assessment" }>;
};

export type SortKey =
  | "last_name"
  | "first_name"
  | "cumulative_desc"
  | "last_activity_desc"
  | "role"
  | "occupation";

export type RatingBucket = "unrated" | "1" | "2" | "3" | "4" | "5";

export type RoleFilterKey = "delegate" | "activist" | "contact" | "hsr" | "bargaining_rep" | "none";

export type WallChartFilterState = {
  sort: SortKey;
  membershipTypeIds: Set<number>;
  includeNonMember: boolean;
  /** Empty set = all. */
  roles: Set<RoleFilterKey>;
  /** Empty set = all. */
  ratings: Set<RatingBucket>;
  occupationIds: Set<number>;
};

export const DEFAULT_FILTER_STATE = (): WallChartFilterState => ({
  sort: "last_name",
  membershipTypeIds: new Set(),
  includeNonMember: false,
  roles: new Set(),
  ratings: new Set(),
  occupationIds: new Set(),
});

export function hasActiveFilter(s: WallChartFilterState): boolean {
  return (
    s.membershipTypeIds.size > 0 ||
    s.includeNonMember ||
    s.roles.size > 0 ||
    s.ratings.size > 0 ||
    s.occupationIds.size > 0
  );
}

function roleKey(worker: WallChartWorker): RoleFilterKey[] {
  const keys: RoleFilterKey[] = [];
  const rn = worker.member_role_type?.role_name?.toLowerCase();
  if (rn === "delegate") keys.push("delegate");
  if (rn === "activist") keys.push("activist");
  if (rn === "contact") keys.push("contact");
  if (worker.is_hsr) keys.push("hsr");
  if (worker.is_bargaining_rep) keys.push("bargaining_rep");
  if (keys.length === 0) keys.push("none");
  return keys;
}

function ratingBucket(rating: number | null | undefined): RatingBucket {
  if (rating == null) return "unrated";
  if (rating < 2) return "1";
  if (rating < 3) return "2";
  if (rating < 4) return "3";
  if (rating < 5) return "4";
  return "5";
}

export function applyFilters(
  ids: number[],
  workerById: Map<number, WallChartWorker>,
  ratingByWorker: Map<number, WallChartRatingSummary>,
  state: WallChartFilterState,
  /** When provided, the Rating filter is applied against these per-activity ratings instead of cumulative. */
  activityRatings?: Map<number, ActivityRating>,
  /** Required when `activityRatings` is set and the assessment is binary — selects correct numeric band. */
  ratingAssessmentContext?: RatingFilterAssessmentContext
): number[] {
  if (!hasActiveFilter(state)) return ids;

  return ids.filter((id) => {
    const w = workerById.get(id);
    if (!w) return false;

    // Membership
    if (state.membershipTypeIds.size > 0 || state.includeNonMember) {
      const mId = w.union_membership_type_id;
      const matchesType = mId != null && state.membershipTypeIds.has(mId);
      const isNonMember = mId == null;
      if (!matchesType && !(state.includeNonMember && isNonMember)) return false;
    }

    // Roles
    if (state.roles.size > 0) {
      const rk = roleKey(w);
      if (!rk.some((k) => state.roles.has(k))) return false;
    }

    // Ratings — sources from per-activity ratings when in assessment view, else cumulative.
    if (state.ratings.size > 0) {
      let ratingValue: number | null | undefined;
      if (activityRatings && ratingAssessmentContext) {
        ratingValue = assessmentNumericForWallChart(
          ratingAssessmentContext.selection,
          activityRatings.get(id)
        );
      } else if (activityRatings) {
        ratingValue = activityRatings.get(id)?.rating ?? null;
      } else {
        ratingValue = ratingByWorker.get(id)?.cumulative_rating;
      }
      const bucket = ratingBucket(ratingValue);
      if (!state.ratings.has(bucket)) return false;
    }

    // Occupations
    if (state.occupationIds.size > 0) {
      const oId = w.canonical_occupation_id;
      if (oId == null || !state.occupationIds.has(oId)) return false;
    }

    return true;
  });
}

export function applySort(
  ids: number[],
  workerById: Map<number, WallChartWorker>,
  ratingByWorker: Map<number, WallChartRatingSummary>,
  sort: SortKey,
  opts?: {
    assessmentSort?: {
      selection: Extract<AssessmentSelection, { kind: "assessment" }>;
      activityRatings: Map<number, ActivityRating>;
    };
  }
): number[] {
  const copy = [...ids];
  const cmpString = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
  const cmpNumDesc = (a: number | null | undefined, b: number | null | undefined) => {
    const av = a ?? -Infinity;
    const bv = b ?? -Infinity;
    if (av === bv) return 0;
    return av > bv ? -1 : 1;
  };
  const roleRank = (w: WallChartWorker | undefined): number => {
    // Delegate > Activist > Bargaining Rep > HSR > Contact > None
    if (!w) return 99;
    if (w.member_role_type?.role_name === "delegate") return 0;
    if (w.member_role_type?.role_name === "activist") return 1;
    if (w.is_bargaining_rep) return 2;
    if (w.is_hsr) return 3;
    if (w.member_role_type?.role_name === "contact") return 4;
    return 5;
  };

  copy.sort((a, b) => {
    const wa = workerById.get(a);
    const wb = workerById.get(b);
    switch (sort) {
      case "first_name": {
        const c = cmpString(wa?.first_name, wb?.first_name);
        return c !== 0 ? c : cmpString(wa?.last_name, wb?.last_name);
      }
      case "cumulative_desc":
        if (opts?.assessmentSort) {
          const { selection, activityRatings } = opts.assessmentSort;
          return cmpNumDesc(
            assessmentNumericForWallChart(selection, activityRatings.get(a)),
            assessmentNumericForWallChart(selection, activityRatings.get(b))
          );
        }
        return cmpNumDesc(
          ratingByWorker.get(a)?.cumulative_rating,
          ratingByWorker.get(b)?.cumulative_rating
        );
      case "last_activity_desc":
        return cmpNumDesc(
          ratingByWorker.get(a)?.last_activity_rating,
          ratingByWorker.get(b)?.last_activity_rating
        );
      case "role": {
        const c = roleRank(wa) - roleRank(wb);
        return c !== 0 ? c : cmpString(wa?.last_name, wb?.last_name);
      }
      case "occupation": {
        const c = cmpString(
          wa?.canonical_occupation?.canonical_name,
          wb?.canonical_occupation?.canonical_name
        );
        return c !== 0 ? c : cmpString(wa?.last_name, wb?.last_name);
      }
      case "last_name":
      default: {
        const c = cmpString(wa?.last_name, wb?.last_name);
        return c !== 0 ? c : cmpString(wa?.first_name, wb?.first_name);
      }
    }
  });
  return copy;
}
