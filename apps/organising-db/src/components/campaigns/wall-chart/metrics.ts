import { isWorkerMemberLike } from "@/lib/campaign/constants";
import type { WallChartRatingSummary, WallChartWorker } from "./types";

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
  isParticipating?: ParticipationPredicate
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
    } else if (r?.cumulative_rating != null || r?.last_activity_rating != null) {
      out.participationCount += 1;
    }
  }

  out.avgCumulative = out.ratedCount > 0 ? Math.round((cumSum / out.ratedCount) * 10) / 10 : null;
  return out;
}

export function pctOrDash(n: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
