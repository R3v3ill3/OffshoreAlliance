/**
 * workforce-view.ts
 *
 * Which layout the Workforce board opens on. Pure functions of the URL and the
 * device flag — nothing is persisted, so the URL stays the single source of
 * truth and the browser's back button keeps working.
 */

export type WorkforceView = "wall-chart" | "list";

/** Layout to use when the URL states no preference. Touch devices cannot drive
 *  the wall chart's HTML5 drag-and-drop, so they get the list. */
export function pickDefaultWorkforceView(isTouch: boolean): WorkforceView {
  return isTouch ? "list" : "wall-chart";
}

/** Explicit ?view= wins; anything else falls back to the device default. */
export function resolveWorkforceView(
  viewParam: string | null,
  isTouch: boolean
): WorkforceView {
  if (viewParam === "list") return "list";
  if (viewParam === "wall-chart") return "wall-chart";
  return pickDefaultWorkforceView(isTouch);
}
