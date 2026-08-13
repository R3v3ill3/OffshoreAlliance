/**
 * Route helpers for campaign-detail chrome in the global header.
 * Keeps pathname rules in one place so Header and other callers stay aligned.
 */

const NON_DETAIL_CAMPAIGN_SEGMENTS = new Set([
  "new",
  "email-wizard",
  "soc-wizard",
  "phone-wizard",
  "sms-tools",
]);

/** Stage planning pages render their own focused chrome — skip the campaign header. */
export function isStagePlanningRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/campaigns\/[^/]+\/plan\/stage\//.test(pathname);
}

export function getCampaignIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  if (!match) return null;
  const segment = match[1];
  if (NON_DETAIL_CAMPAIGN_SEGMENTS.has(segment)) return null;
  return segment;
}

/** True for /campaigns/[id] and sub-routes, excluding list/wizard flows. */
export function isCampaignDetailRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (isStagePlanningRoute(pathname)) return false;
  return getCampaignIdFromPath(pathname) !== null;
}
