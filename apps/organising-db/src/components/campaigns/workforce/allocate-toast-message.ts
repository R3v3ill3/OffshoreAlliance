/**
 * The "Assign to unit" success toast of the workforce bulk toolbar
 * (wp2.2.md §8.2 "Bulk toolbar hides skipped placements", Stage 6).
 *
 * `useAllocateWorkersToOu` assigns with `p_on_conflict: "skip"` (D46), so a
 * worker already on the unit, or already in another unit of the target's
 * group, is left out and counted in `skipped`. The toast used to report only
 * `inserted`; now it names the skipped count too, so an organiser who
 * selected ten workers and sees "Allocated 7" is told where the other three
 * went. Pure, so the wording is unit-tested without mounting the toolbar.
 */
export function allocateToastMessage(
  res: { inserted: number; skipped?: number } | null | undefined,
  requestedCount: number,
  targetName: string
): string {
  const inserted = res?.inserted ?? requestedCount;
  const skipped = res?.skipped ?? 0;
  let message = `Allocated ${inserted} worker${inserted === 1 ? "" : "s"} to ${targetName}.`;
  if (skipped > 0) {
    message += ` ${skipped} skipped: already in a unit of that group.`;
  }
  return message;
}
