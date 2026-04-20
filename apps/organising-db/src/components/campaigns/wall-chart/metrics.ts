import { isWorkerMemberLike } from "@/lib/campaign/constants";
import type { ActivityRating, WallChartRatingSummary, WallChartWorker } from "./types";

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
   * Metrics for the currently-selected assessment. Null when the wall chart is
   * in cumulative view (no assessment picked).
   */
  assessment: AssessmentMetrics | null;
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
  assessmentInput?: AssessmentMetricsInput
): WallChartMetrics {
  const out: WallChartMetrics = {
    total: workerIds.length,
    members: 0,
    delegates: 0,
    activists: 0,
    contacts: 0,
    hsrs: 0,
    bargainingReps: 0,
    ratedCount: 0,
    avgCumulative: null,
    participationCount: 0,
    participationTotal: workerIds.length,
    assessment: null,
  };

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

    const r = ratingByWorker.get(id);
    if (r?.cumulative_rating != null) {
      out.ratedCount += 1;
      cumSum += r.cumulative_rating;
    }

    if (isParticipating) {
      if (isParticipating(id)) out.participationCount += 1;
    } else if (r?.has_supportive_activity_rating) {
      out.participationCount += 1;
    }
  }

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
      const r = assessmentInput.ratings.get(id);
      if (!r) continue;
      if (assessmentInput.isBinary) {
        if (r.binary_value != null) {
          am.binaryTotalRated += 1;
          if (
            assessmentInput.supportiveBinaryValue &&
            r.binary_value === assessmentInput.supportiveBinaryValue
          ) {
            am.binarySupportiveCount += 1;
          }
        }
      } else if (r.rating != null) {
        am.ratedCount += 1;
        sum += r.rating;
        // 1 = supportive_leader, 2 = supporter (rating_level seed).
        if (r.rating <= 2) am.supportiveCount += 1;
        // 4 = opposed, 5 = oppositional_leader.
        if (r.rating >= 4) am.opposedCount += 1;
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
