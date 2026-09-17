/**
 * Edge auto-scroll geometry for the wall chart's drag and drop.
 *
 * The wall chart uses the browser's native HTML5 drag and drop (see `dnd.ts`),
 * and Chromium does not auto-scroll the page when a native drag approaches the
 * viewport edge. That limits a drag to the units that happened to be on screen
 * when the card was picked up. This module is the pure half of the fix: given
 * where the pointer is, how fast should the page move this frame?
 *
 * Nothing here touches the DOM, so it is exhaustively unit-testable; the hook
 * in `use-drag-auto-scroll.ts` is the only part that needs a browser.
 */

/** Distance from an edge, in CSS pixels, within which scrolling engages. */
export const DEFAULT_EDGE_THRESHOLD_PX = 96;

/** Fastest the page may move in a single animation frame, in CSS pixels. */
export const DEFAULT_MAX_SPEED_PX = 18;

export type ScrollVelocityOptions = {
  /** Size of the active band at each edge. Default {@link DEFAULT_EDGE_THRESHOLD_PX}. */
  threshold?: number;
  /** Cap on |velocity|. Default {@link DEFAULT_MAX_SPEED_PX}. */
  maxSpeed?: number;
};

/**
 * Pixels to scroll this frame for a pointer at `pointerY` in a viewport of
 * `viewportHeight`. Negative scrolls up, positive scrolls down, zero does
 * nothing.
 *
 * The viewport is three regions: a band of `threshold` pixels at the top, a
 * dead zone in the middle where the result is always 0, and a matching band at
 * the bottom. Inside a band the speed eases in quadratically with how deep the
 * pointer is — a pointer that has just entered the band barely moves the page,
 * one pressed against the edge moves it at `maxSpeed` — so the operator can
 * aim without the page bolting away from them.
 *
 * Inputs are defensive rather than trusting: a pointer dragged past the edge
 * (negative, or beyond `viewportHeight`) clamps to full speed in that
 * direction, and a non-finite or non-positive input yields 0. On a viewport
 * shorter than two bands the bands shrink to half the height each so they meet
 * in the middle instead of overlapping.
 */
export function scrollVelocityFor(
  pointerY: number,
  viewportHeight: number,
  options: ScrollVelocityOptions = {}
): number {
  if (!Number.isFinite(pointerY) || !Number.isFinite(viewportHeight)) return 0;
  if (viewportHeight <= 0) return 0;

  const maxSpeed = normalisePositive(options.maxSpeed, DEFAULT_MAX_SPEED_PX);
  const requested = normalisePositive(options.threshold, DEFAULT_EDGE_THRESHOLD_PX);
  if (maxSpeed === 0 || requested === 0) return 0;

  // Never let the two bands overlap: on a short viewport they meet exactly at
  // the midpoint, which keeps the dead zone from inverting.
  const band = Math.min(requested, viewportHeight / 2);
  const y = clamp(pointerY, 0, viewportHeight);

  if (y < band) {
    return -maxSpeed * ease((band - y) / band);
  }
  const bottomEdge = viewportHeight - band;
  if (y > bottomEdge) {
    return maxSpeed * ease((y - bottomEdge) / band);
  }
  return 0;
}

/** Quadratic ease-in on a 0..1 depth, clamped so the cap always holds. */
function ease(depth: number): number {
  const d = clamp(depth, 0, 1);
  return d * d;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A finite, positive override, else the fallback. 0 and negatives disable. */
function normalisePositive(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}
