// WP1.7 — which single tile the rating hint attaches to.
//
// Chosen purely (no mount-order registration, no effects, no refs) so the
// choice is deterministic and testable in environment:node.

export interface RatingHintAnchorInput {
  /** campaign-wall-chart.tsx `unassignedWorkerIds`, already sorted. */
  unassignedWorkerIds: readonly number[];
  /** `visibleOus` mapped through `visibleWorkersForOu`, in render order. */
  units: readonly { ouId: number; workerIds: readonly number[] }[];
}

export interface RatingHintAnchor {
  ouId: number | null;
  workerId: number;
}

/**
 * The first tile in the chart's own DOM order: the Unassigned card renders
 * first and the type bands after it, so Unassigned wins when it has anyone.
 * Returns null when the chart has no tiles at all — which is also the
 * `hasTiles` answer for shouldShowHint().
 *
 * Known limitation (wp1.7.md §2.3.3): membership here is unfiltered, while
 * each card filters at render time. If the organiser has filtered the anchor
 * worker out of view the tile does not render and the hint is simply not
 * shown that visit; nothing is written, so it returns on the next unfiltered
 * visit.
 */
export function pickRatingHintAnchor(i: RatingHintAnchorInput): RatingHintAnchor | null {
  if (i.unassignedWorkerIds.length > 0) {
    return { ouId: null, workerId: i.unassignedWorkerIds[0] };
  }
  for (const u of i.units) {
    if (u.workerIds.length > 0) return { ouId: u.ouId, workerId: u.workerIds[0] };
  }
  return null;
}
