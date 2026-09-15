// WP2.4 (SY-c, docs/organiser-ux-review/wp/wp2.4.md §3.14) — the sentence the
// workforce board shows after the sync-on-open POST.
//
// Pure, never throws, input untrusted (the route's JSON). Each clause renders
// only when its count is > 0, singular and plural handled; the message is
// `null` — nothing renders — unless something CHANGED: `membersAdded`,
// `ouAssignmentsUpserted` or (WP2.4b) `placementsMoved`. `ouAssignmentsSkipped`
// ("already placed") and `manualPlacementsKept` are context, never a change,
// so on their own they produce no notice (§3.14 "shown only when something
// changed"; §8.2 "never reported as a change"). Unknown keys are ignored and
// `workersAdded` — every matched member, not the newly enrolled — is
// deliberately not read.
//
// WP2.4b's two counts (`placementsMoved`, `manualPlacementsKept`) are accepted
// now so the notice needs no second UI change when the mirror lands (§3.15).

export type SyncNoticeCounts = {
  membersAdded?: number;
  ouAssignmentsUpserted?: number;
  ouAssignmentsSkipped?: number;
  /** WP2.4b (SM-a): universe placements re-pointed to the compatible unit. */
  placementsMoved?: number;
  /** WP2.4b (SM-a): manual/rule placements left where an organiser put them. */
  manualPlacementsKept?: number;
};

const CHANGE_KEYS: readonly (keyof SyncNoticeCounts)[] = [
  "membersAdded",
  "ouAssignmentsUpserted",
  "placementsMoved",
];

function count(result: unknown, key: keyof SyncNoticeCounts): number {
  if (typeof result !== "object" || result === null) return 0;
  const v = (result as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** True when the sync enrolled, placed or (WP2.4b) moved anyone — the board's invalidation condition. */
export function syncChangedSomething(result: unknown): boolean {
  return CHANGE_KEYS.some((key) => count(result, key) > 0);
}

/**
 * "Sync on open: 12 workers added to this campaign, 9 placed in units, 3
 * already placed." — or `null` when nothing changed.
 */
export function syncNoticeMessage(result: unknown): string | null {
  if (!syncChangedSomething(result)) return null;

  const clauses: string[] = [];
  const added = count(result, "membersAdded");
  if (added > 0) clauses.push(`${added} ${plural(added, "worker", "workers")} added to this campaign`);
  const placed = count(result, "ouAssignmentsUpserted");
  if (placed > 0) clauses.push(`${placed} placed in ${plural(placed, "a unit", "units")}`);
  const skipped = count(result, "ouAssignmentsSkipped");
  if (skipped > 0) clauses.push(`${skipped} already placed`);
  const moved = count(result, "placementsMoved");
  if (moved > 0) clauses.push(`${moved} moved to match their current site`);
  const kept = count(result, "manualPlacementsKept");
  if (kept > 0) clauses.push(`${kept} kept where an organiser placed them`);

  return `Sync on open: ${clauses.join(", ")}.`;
}
