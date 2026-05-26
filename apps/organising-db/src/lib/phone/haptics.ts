/**
 * Small wrapper around `navigator.vibrate` so we can express dialer
 * haptics in semantic units instead of millisecond literals.
 *
 * - All functions are no-ops on the server, in browsers without the
 *   Vibration API, and when the user has set `prefers-reduced-motion`
 *   (we treat reduced-motion as a strong signal that they don't want
 *   buzzy feedback either).
 * - All functions are safe to call without awaiting; they swallow
 *   any errors so they never block the calling code path.
 */

type HapticIntent = "tap" | "submit" | "success" | "warning" | "error";

const PATTERNS: Record<HapticIntent, number | number[]> = {
  tap: 10,
  submit: 20,
  success: [12, 30, 12],
  warning: [25, 25, 25],
  error: [40, 20, 60],
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  return !prefersReducedMotion();
}

export function haptic(intent: HapticIntent): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[intent]);
  } catch {
    /* ignore */
  }
}

export const hapticTap = () => haptic("tap");
export const hapticSubmit = () => haptic("submit");
export const hapticSuccess = () => haptic("success");
export const hapticWarning = () => haptic("warning");
export const hapticError = () => haptic("error");
