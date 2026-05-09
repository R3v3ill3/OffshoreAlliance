import type { NonOaUnionCountEntry } from "@/lib/workers/other-union-display";
import { isWorkerMemberLike, isWorkerOaMember } from "@/lib/campaign/constants";
import type { ActivityRating, WallChartRatingSummary, WallChartWorker } from "./types";
import { isSupportiveBinaryOutcome } from "./binary-assessment";

// Role-type ids confirmed active in member_role_types:
// Contact=3, Delegate=7, Activist=8. Bargaining Rep (4) is deprecated as a role
// (moved to workers.is_bargaining_rep boolean); HSR is workers.is_hsr.
export const ROLE_IDS = {
  CONTACT: 3,
  DELEGATE: 7,
  ACTIVIST: 8,
} as const;

export type WallChartMetrics = {
  total: number;
  members: number;
  /** OA-specific members: financial_member or member_pending only. */
  oaMembers: number;
  delegates: number;
  activists: number;
  contacts: number;
  hsrs: number;
  bargainingReps: number;
  ratedCount: number;
  avgCumulative: number | null;
  /** Numerator & denominator for participation. */
  participationCount: number;
  participationTotal: number;
  /**
   * Non-OA members with `non_oa_union_option` set, by badge initials — empty when none.
   */
  nonOaUnionCounts: NonOaUnionCountEntry[];
  /**
   * Metrics for the currently-selected assessment. Null when the wall chart is
   * in cumulative view (no assessment picked).
   */
  assessment: AssessmentMetrics | null;
  /** Workers with a phone number on file. */
  phoneCount: number;
  /** Workers with an email address on file. */
  emailCount: number;
  /** Workers in this scope who also belong to at least one other organising unit. */
  multiUnitCount: number;
  /** Cumulative-rating distribution across named workers. */
  ratingBuckets: { r1: number; r2: number; r3: number; r4: number; unrated: number };
};

export type AssessmentMetrics = {
  ratedCount: number;
  avgRating: number | null;
  supportiveCount: number;
  opposedCount: number;
  /** For binary assessments: count of workers whose binary_value is the "supportive" outcome. */
  binarySupportiveCount: number;
  binaryTotalRated: number;
  isBinary: boolean;
};

export type AssessmentMetricsInput = {
  ratings: Map<number, ActivityRating>;
  isBinary: boolean;
  /** Value of `binary_value` that counts as a supportive outcome (e.g. 'attended', 'yes'). */
  supportiveBinaryValue?: string | null;
};

export type ParticipationPredicate = (workerId: number) => boolean;

export type ComputeMetricsOptions = {
  /** Pre-computed set of worker ids that belong to ≥2 organising units. */
  multiUnitWorkerIds?: ReadonlySet<number>;
};

/**
 * Compute metrics for a set of workers.
 * @param workerIds the workers in scope (unit or campaign)
 * @param workerById resolver for worker records
 * @param ratingByWorker cumulative/last rating map
 * @param isParticipating predicate; when omitted we fall back to "any rating recorded"
 */
export function computeMetrics(
  workerIds: number[],
  workerById: Map<number, WallChartWorker>,
  ratingByWorker: Map<number, WallChartRatingSummary>,
  isParticipating?: ParticipationPredicate,
  assessmentInput?: AssessmentMetricsInput,
  options?: ComputeMetricsOptions
): WallChartMetrics {
  const out: WallChartMetrics = {
    total: workerIds.length,
    members: 0,
    oaMembers: 0,
    delegates: 0,
    activists: 0,
    contacts: 0,
    hsrs: 0,
    bargainingReps: 0,
    ratedCount: 0,
    avgCumulative: null,
    participationCount: 0,
    participationTotal: workerIds.length,
    nonOaUnionCounts: [],
    assessment: null,
    phoneCount: 0,
    emailCount: 0,
    multiUnitCount: 0,
    ratingBuckets: { r1: 0, r2: 0, r3: 0, r4: 0, unrated: 0 },
  };

  const nonOaTally = new Map<string, number>();
  let cumSum = 0;

  for (const id of workerIds) {
    const w = workerById.get(id);
    if (!w) continue;

    if (
      isWorkerMemberLike({
        unionMembershipTypeName: w.union_membership_type?.type_name,
        memberRoleName: w.member_role_type?.role_name,
        isBargainingRep: w.is_bargaining_rep,
      })
    ) {
      out.members += 1;
    }

    if (isWorkerOaMember({ unionMembershipTypeName: w.union_membership_type?.type_name })) {
      out.oaMembers += 1;
    }

    if (w.union_membership_type?.type_name === "non_oa_member") {
      const bi = w.non_oa_union_option?.badge_initials?.trim();
      if (bi) nonOaTally.set(bi, (nonOaTally.get(bi) ?? 0) + 1);
    }

    switch (w.member_role_type_id) {
      case ROLE_IDS.DELEGATE:
        out.delegates += 1;
        break;
      case ROLE_IDS.ACTIVIST:
        out.activists += 1;
        break;
      case ROLE_IDS.CONTACT:
        out.contacts += 1;
        break;
    }
    if (w.is_bargaining_rep) out.bargainingReps += 1;
    if (w.is_hsr) out.hsrs += 1;

    if (w.phone?.trim()) out.phoneCount += 1;
    if (w.email?.trim()) out.emailCount += 1;
    if (options?.multiUnitWorkerIds?.has(id)) out.multiUnitCount += 1;

    const r = ratingByWorker.get(id);
    if (r?.cumulative_rating != null) {
      out.ratedCount += 1;
      cumSum += r.cumulative_rating;
      const cr = r.cumulative_rating;
      if (cr <= 1) out.ratingBuckets.r1 += 1;
      else if (cr <= 2) out.ratingBuckets.r2 += 1;
      else if (cr <= 3) out.ratingBuckets.r3 += 1;
      else out.ratingBuckets.r4 += 1;
    } else {
      out.ratingBuckets.unrated += 1;
    }

    if (isParticipating) {
      if (isParticipating(id)) out.participationCount += 1;
    } else if (r?.has_supportive_activity_rating) {
      out.participationCount += 1;
    }
  }

  out.nonOaUnionCounts = [...nonOaTally.entries()]
    .map(([initials, count]) => ({ initials, count }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.initials.localeCompare(b.initials));

  out.avgCumulative = out.ratedCount > 0 ? Math.round((cumSum / out.ratedCount) * 10) / 10 : null;

  if (assessmentInput) {
    const am: AssessmentMetrics = {
      ratedCount: 0,
      avgRating: null,
      supportiveCount: 0,
      opposedCount: 0,
      binarySupportiveCount: 0,
      binaryTotalRated: 0,
      isBinary: assessmentInput.isBinary,
    };
    let sum = 0;
    for (const id of workerIds) {
      const rv = assessmentInput.ratings.get(id);
      if (!rv) continue;
      if (assessmentInput.isBinary) {
        if (rv.binary_value != null) {
          am.binaryTotalRated += 1;
          if (isSupportiveBinaryOutcome({
            binaryValue: rv.binary_value,
            supporterOutcomeValue: assessmentInput.supportiveBinaryValue,
          })) {
            am.binarySupportiveCount += 1;
          }
        }
      } else if (rv.rating != null) {
        am.ratedCount += 1;
        sum += rv.rating;
        if (rv.rating <= 2) am.supportiveCount += 1;
        if (rv.rating >= 4) am.opposedCount += 1;
      }
    }
    am.avgRating = am.ratedCount > 0 ? Math.round((sum / am.ratedCount) * 10) / 10 : null;
    out.assessment = am;
  }

  return out;
}

export function pctOrDash(n: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
