/**
 * Server-side device detection for the `x-viewport` request header.
 *
 * The flag is derived from the user agent in the proxy (`src/proxy.ts`) rather
 * than from a media query so that server and client agree during hydration.
 * Note that iPad is treated as mobile: the wall chart's HTML5 drag-and-drop is
 * unusable on any touch device, so tablets get the same default as phones
 * (WP0.3 §2.7).
 */
const MOBILE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/** True when the user agent belongs to a touch/mobile device. */
export function detectMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return MOBILE_USER_AGENT.test(userAgent);
}
