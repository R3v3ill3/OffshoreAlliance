import type { ActivityRating } from "@/components/campaigns/wall-chart/types";

/**
 * Collapses multiple rating rows for the same worker into one canonical row.
 * Preference order: actual phase > expected phase, then latest rated_at wins.
 */
export function collapseActivityRatingsToWorkerMap(
  rows: ActivityRating[]
): Map<number, ActivityRating> {
  const phaseRank = (phase: string | null | undefined) =>
    phase === "actual" ? 2 : phase === "expected" ? 1 : 0;
  const best = new Map<number, ActivityRating>();
  for (const row of rows) {
    const cur = best.get(row.worker_id);
    if (!cur) {
      best.set(row.worker_id, row);
      continue;
    }
    const curPhase = phaseRank(cur.rating_phase);
    const newPhase = phaseRank(row.rating_phase);
    if (newPhase > curPhase) {
      best.set(row.worker_id, row);
      continue;
    }
    if (newPhase < curPhase) continue;
    const curAt = cur.rated_at ?? "";
    const newAt = row.rated_at ?? "";
    if (newAt > curAt) best.set(row.worker_id, row);
  }
  return best;
}
