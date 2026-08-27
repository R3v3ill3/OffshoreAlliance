import type { FactFilter } from "@/lib/campaign-facts/types";
import type { WorkerCampaignFact } from "@/lib/campaign-facts/types";
import { numericFactValue, workerPassesFactFilters } from "@/lib/campaign-facts/values";
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
  | "cumulative_asc"
  | "last_activity_desc"
  | "last_activity_asc"
  | "relationships"
  | "occupation"
  | "fact_desc"
  | "fact_asc";

export type RelationshipSortLink = {
  leader_worker_id: number;
  follower_worker_id: number;
};

export type RatingBucket = "unrated" | "1" | "2" | "3" | "4" | "5";

export type RoleFilterKey = "delegate" | "activist" | "contact" | "hsr" | "bargaining_rep" | "none";

/** Tri-state presence filter for a contact field (phone / email). */
export type ContactPresence = "any" | "has" | "missing";

/**
 * Filter on a *specific* assessment's ratings, independent of the unit's
 * current assessment view. `buckets` reuses the RatingBucket scale where
 * "unrated" means the worker has no rating on this assessment and "1".."5"
 * are the rating bands (binary votes map through the same colour bands).
 * Empty `buckets` = the filter is inactive.
 */
export type AssessmentRatingFilter = {
  activityId: number;
  buckets: Set<RatingBucket>;
};

/**
 * Ratings + metadata needed to evaluate {@link AssessmentRatingFilter}s. The
 * wall chart loads ratings for any filtered assessment on demand and supplies
 * this lookup to {@link applyFilters}.
 */
export type AssessmentFilterLookup = {
  ratingsByActivity: Map<number, Map<number, ActivityRating>>;
  selectionByActivity: Map<
    number,
    Extract<AssessmentSelection, { kind: "assessment" }>
  >;
};

export type WallChartFilterState = {
  sort: SortKey;
  membershipTypeIds: Set<number>;
  includeNonMember: boolean;
  /** Empty set = all. */
  roles: Set<RoleFilterKey>;
  /** Empty set = all. */
  ratings: Set<RatingBucket>;
  occupationIds: Set<number>;
  /** Presence of a phone number. */
  phone: ContactPresence;
  /** Presence of an email address. */
  email: ContactPresence;
  /** Per-assessment rating filters (AND across entries). */
  assessmentFilters: AssessmentRatingFilter[];
  factFilters: FactFilter[];
  sortFactFieldId: number | null;
};

export const DEFAULT_FILTER_STATE = (): WallChartFilterState => ({
  sort: "last_name",
  membershipTypeIds: new Set(),
  includeNonMember: false,
  roles: new Set(),
  ratings: new Set(),
  occupationIds: new Set(),
  phone: "any",
  email: "any",
  assessmentFilters: [],
  factFilters: [],
  sortFactFieldId: null,
});

/** Assessment filters that actually constrain (at least one bucket chosen). */
export function activeAssessmentFilters(
  s: WallChartFilterState
): AssessmentRatingFilter[] {
  return s.assessmentFilters.filter((f) => f.buckets.size > 0);
}

export function hasActiveFilter(s: WallChartFilterState): boolean {
  return (
    s.membershipTypeIds.size > 0 ||
    s.includeNonMember ||
    s.roles.size > 0 ||
    s.ratings.size > 0 ||
    s.occupationIds.size > 0 ||
    s.phone !== "any" ||
    s.email !== "any" ||
    activeAssessmentFilters(s).length > 0 ||
    s.factFilters.length > 0
  );
}

function hasValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

function passesPresence(present: boolean, filter: ContactPresence): boolean {
  if (filter === "has") return present;
  if (filter === "missing") return !present;
  return true;
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
  ratingAssessmentContext?: RatingFilterAssessmentContext,
  factsByWorker?: Map<number, Map<number, WorkerCampaignFact>>,
  /** Ratings + metadata for evaluating per-assessment rating filters. */
  assessmentLookup?: AssessmentFilterLookup
): number[] {
  if (!hasActiveFilter(state)) return ids;

  const assessmentFilters = activeAssessmentFilters(state);

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

    // Phone / email presence
    if (!passesPresence(hasValue(w.phone), state.phone)) return false;
    if (!passesPresence(hasValue(w.email), state.email)) return false;

    // Per-assessment rating filters (AND across assessments, OR within buckets).
    if (assessmentFilters.length > 0) {
      for (const af of assessmentFilters) {
        const selection = assessmentLookup?.selectionByActivity.get(af.activityId);
        const ratings = assessmentLookup?.ratingsByActivity.get(af.activityId);
        // Metadata not loaded yet (e.g. mid-fetch): the worker counts as
        // unrated for this assessment until the ratings arrive.
        const numeric = selection
          ? assessmentNumericForWallChart(selection, ratings?.get(id))
          : null;
        if (!af.buckets.has(ratingBucket(numeric))) return false;
      }
    }

    if (state.factFilters.length > 0) {
      if (
        !workerPassesFactFilters(
          factsByWorker?.get(id) ?? new Map(),
          state.factFilters
        )
      ) {
        return false;
      }
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
    relationshipLinks?: RelationshipSortLink[];
    factSort?: {
      fieldId: number;
      factsByWorker: Map<number, Map<number, WorkerCampaignFact>>;
    };
  }
): number[] {
  const copy = [...ids];
  const cmpString = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
  const cmpWorkerName = (a: number, b: number) => {
    const wa = workerById.get(a);
    const wb = workerById.get(b);
    const last = cmpString(wa?.last_name, wb?.last_name);
    return last !== 0 ? last : cmpString(wa?.first_name, wb?.first_name);
  };
  const cmpNumDesc = (a: number | null | undefined, b: number | null | undefined) => {
    const av = a ?? -Infinity;
    const bv = b ?? -Infinity;
    if (av === bv) return 0;
    return av > bv ? -1 : 1;
  };
  const cmpNumAsc = (a: number | null | undefined, b: number | null | undefined) => {
    const av = a ?? Infinity;
    const bv = b ?? Infinity;
    if (av === bv) return 0;
    return av < bv ? -1 : 1;
  };
  const leaderRank = (workerId: number): number => {
    const rn = workerById.get(workerId)?.member_role_type?.role_name?.toLowerCase();
    if (rn === "delegate") return 0;
    if (rn === "activist") return 1;
    if (rn === "contact") return 2;
    return 99;
  };

  if (sort === "relationships") {
    return sortByRelationships(copy, {
      workerById,
      relationshipLinks: opts?.relationshipLinks ?? [],
      leaderRank,
      cmpWorkerName,
    });
  }

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
      case "cumulative_asc":
        if (opts?.assessmentSort) {
          const { selection, activityRatings } = opts.assessmentSort;
          return cmpNumAsc(
            assessmentNumericForWallChart(selection, activityRatings.get(a)),
            assessmentNumericForWallChart(selection, activityRatings.get(b))
          );
        }
        return cmpNumAsc(
          ratingByWorker.get(a)?.cumulative_rating,
          ratingByWorker.get(b)?.cumulative_rating
        );
      case "last_activity_desc":
        return cmpNumDesc(
          ratingByWorker.get(a)?.last_activity_rating,
          ratingByWorker.get(b)?.last_activity_rating
        );
      case "last_activity_asc":
        return cmpNumAsc(
          ratingByWorker.get(a)?.last_activity_rating,
          ratingByWorker.get(b)?.last_activity_rating
        );
      case "occupation": {
        const c = cmpString(
          wa?.canonical_occupation?.canonical_name,
          wb?.canonical_occupation?.canonical_name
        );
        return c !== 0 ? c : cmpString(wa?.last_name, wb?.last_name);
      }
      case "fact_desc":
      case "fact_asc": {
        const fieldId = opts?.factSort?.fieldId;
        const byWorker = opts?.factSort?.factsByWorker;
        const num = (id: number) =>
          fieldId == null
            ? null
            : numericFactValue(byWorker?.get(id)?.get(fieldId) ?? null);
        return sort === "fact_desc" ? cmpNumDesc(num(a), num(b)) : cmpNumAsc(num(a), num(b));
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

export function factSortOpts(
  filter: WallChartFilterState,
  factsByWorker: Map<number, Map<number, WorkerCampaignFact>>
): {
  factSort?: {
    fieldId: number;
    factsByWorker: Map<number, Map<number, WorkerCampaignFact>>;
  };
} {
  if (
    (filter.sort === "fact_asc" || filter.sort === "fact_desc") &&
    filter.sortFactFieldId != null
  ) {
    return {
      factSort: { fieldId: filter.sortFactFieldId, factsByWorker },
    };
  }
  return {};
}

function sortByRelationships(
  ids: number[],
  opts: {
    workerById: Map<number, WallChartWorker>;
    relationshipLinks: RelationshipSortLink[];
    leaderRank: (workerId: number) => number;
    cmpWorkerName: (a: number, b: number) => number;
  }
): number[] {
  const visible = new Set(ids);
  const followersByLeader = new Map<number, number[]>();

  for (const link of opts.relationshipLinks) {
    if (!visible.has(link.leader_worker_id) || !visible.has(link.follower_worker_id)) continue;
    if (opts.leaderRank(link.leader_worker_id) >= 99) continue;
    const followers = followersByLeader.get(link.leader_worker_id) ?? [];
    followers.push(link.follower_worker_id);
    followersByLeader.set(link.leader_worker_id, followers);
  }

  const leaders = ids
    .filter((id) => opts.leaderRank(id) < 99)
    .sort((a, b) => {
      const rank = opts.leaderRank(a) - opts.leaderRank(b);
      return rank !== 0 ? rank : opts.cmpWorkerName(a, b);
    });

  const emitted = new Set<number>();
  const out: number[] = [];

  for (const leaderId of leaders) {
    if (!visible.has(leaderId) || emitted.has(leaderId)) continue;
    out.push(leaderId);
    emitted.add(leaderId);

    const followers = [...new Set(followersByLeader.get(leaderId) ?? [])]
      .filter((id) => visible.has(id) && !emitted.has(id) && opts.leaderRank(id) >= 99)
      .sort(opts.cmpWorkerName);

    for (const followerId of followers) {
      out.push(followerId);
      emitted.add(followerId);
    }
  }

  const remaining = ids
    .filter((id) => !emitted.has(id))
    .sort((a, b) => {
      const rank = opts.leaderRank(a) - opts.leaderRank(b);
      return rank !== 0 ? rank : opts.cmpWorkerName(a, b);
    });

  return [...out, ...remaining];
}
