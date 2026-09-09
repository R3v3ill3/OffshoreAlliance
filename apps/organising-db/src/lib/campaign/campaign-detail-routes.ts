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

/**
 * The SMS chat workspace (/campaigns/[id]/sms/chat/[listId]). A
 * standalone board's campaign is a hidden episode; the campaign header
 * must not bounce it to the hub the way it does for the episode's
 * detail page.
 */
export function isSmsChatWorkspaceRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/campaigns\/[^/]+\/sms\/chat\/[^/]+/.test(pathname);
}

/** True for /campaigns/[id] and sub-routes, excluding list/wizard flows. */
export function isCampaignDetailRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (isStagePlanningRoute(pathname)) return false;
  return getCampaignIdFromPath(pathname) !== null;
}

// ── WP1.4: wizards keep the campaign header ─────────────────────────────
//
// Appendix D pain point 9: launch the SOC, email or phone wizard from
// inside a campaign and the campaign name, the back arrow and the three
// resume banners vanish mid-task, because those routes live outside
// /campaigns/[id] and NON_DETAIL_CAMPAIGN_SEGMENTS excludes them.
//
// The three functions above are unchanged, so every existing caller keeps
// its behaviour. `campaignIdForChrome` is the new, additive answer: a
// wizard that carries a campaign id in the URL gets that campaign's
// chrome; a standalone launch stays chrome-less exactly as today.

/** Query params a campaign-family wizard may carry its campaign in. */
export const CAMPAIGN_CHROME_PARAMS = ["cid", "campaign_id"] as const;

/**
 * Wizard routes that keep the campaign header when they carry a campaign id.
 * `new/manual` is excluded: it creates a campaign, it never edits one.
 * `sms-tools` is excluded: it is a redirect.
 */
const CHROME_WIZARD_PATHS = new Set([
  "/campaigns/new",
  "/campaigns/soc-wizard",
  "/campaigns/email-wizard",
  "/campaigns/phone-wizard",
]);

/**
 * True for the four wizard paths above — the routes where this package
 * newly mounts the campaign header. Callers that redirect need it: a
 * redirect written for `/campaigns/[id]` would now fire mid-wizard, which
 * is the one thing "wizards keep the campaign header" must not cause.
 */
export function isCampaignChromeWizardRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return CHROME_WIZARD_PATHS.has(normalisePath(pathname));
}

function normalisePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function readParam(
  search: URLSearchParams | string | null,
  key: string
): string | null {
  if (search == null) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  // `.get()` returns the first value, which is the behaviour we want for a
  // repeated ?cid=1&cid=2.
  return params.get(key);
}

/** A campaign id is a positive integer and nothing else. */
function parseCampaignId(raw: string | null): string | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? String(n) : null;
}

/**
 * The campaign whose header chrome this route should render, or null.
 *
 * Detail routes answer from the path; the four campaign-family wizards
 * answer from ?cid= / ?campaign_id= so a wizard launched from inside a
 * campaign keeps the name, the back arrow and the resume banners. A
 * standalone launch (no id) stays chrome-less, exactly as today.
 *
 * Both param names are accepted because the app emits both: the campaign
 * page and the header bar send `cid` (page.tsx's SOC card,
 * `/campaigns/new?cid=&edit=1`), while the planner wizard and
 * SocWizardSteps read `campaign_id`. Making the header correct for either
 * is this package's job; the SOC wizard's own pre-fill mismatch is a
 * separate one-line change in someone else's file and is out of scope.
 */
export function campaignIdForChrome(
  pathname: string | null,
  search: URLSearchParams | string | null
): string | null {
  if (!pathname) return null;
  // The stage planner draws its own header — never ours, id or no id.
  if (isStagePlanningRoute(pathname)) return null;

  const fromPath = getCampaignIdFromPath(pathname);
  if (fromPath) return fromPath;

  if (!isCampaignChromeWizardRoute(pathname)) return null;

  for (const key of CAMPAIGN_CHROME_PARAMS) {
    const id = parseCampaignId(readParam(search, key));
    if (id) return id;
  }
  return null;
}
