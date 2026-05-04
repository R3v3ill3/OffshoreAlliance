/**
 * campaign-tabs.ts
 *
 * Central registry for campaign detail page tab routing.
 *
 * Phase A — Foundation:
 *   - REDIRECT_MAP: maps every legacy ?tab= value to a new {tab, sub} pair so
 *     old bookmarked URLs are automatically rewritten to the clustered structure.
 *   - resolveTabParams: apply the redirect map and return a normalised {tab, sub}.
 */

/** The full set of top-level tab identifiers (current + future cluster names). */
export const VALID_TABS = [
  "overview",
  "campaign-plan",
  "workplan",
  "universe",
  "assessments",
  "reporting",
  "insights",
  "wall",
  "tasklists",
  "comms",
  "phone",
  "actions",
  "results",
  "bargaining",
  // Future cluster tabs (added by Phases B–E):
  "plan",
  "workforce",
  "outreach",
  "outcomes",
  // Phase F:
  "library",
] as const;

export type ValidTab = (typeof VALID_TABS)[number];

/** Default sub-tab for each top-level cluster tab. */
export const DEFAULT_SUB: Partial<Record<ValidTab, string>> = {
  plan: "workplan",
  workforce: "universe",
  outreach: "comms",
  outcomes: "reports",
};

interface ResolvedTabParams {
  tab: string;
  sub: string | null;
}

/**
 * REDIRECT_MAP
 *
 * Maps legacy ?tab= values to their new clustered {tab, sub} equivalents.
 * Keys are the old tab values; values are the canonical {tab, sub} pairs.
 *
 * Legacy key  →  new tab      new sub
 * ──────────────────────────────────────
 * workplan    →  plan         workplan
 * actions     →  plan         actions
 * tasklists   →  plan         task-lists
 * universe    →  workforce    universe
 * assessments →  workforce    assessments
 * wall        →  workforce    wall-chart
 * comms       →  outreach     comms
 * phone       →  outreach     phone
 * reporting   →  outcomes     reports
 * insights    →  outcomes     insights
 * results     →  outcomes     results
 */
export const REDIRECT_MAP: Record<string, { tab: string; sub: string }> = {
  workplan: { tab: "plan", sub: "workplan" },
  actions: { tab: "plan", sub: "actions" },
  tasklists: { tab: "plan", sub: "task-lists" },
  universe: { tab: "workforce", sub: "universe" },
  assessments: { tab: "workforce", sub: "assessments" },
  wall: { tab: "workforce", sub: "wall-chart" },
  comms: { tab: "outreach", sub: "comms" },
  phone: { tab: "outreach", sub: "phone" },
  reporting: { tab: "outcomes", sub: "reports" },
  insights: { tab: "outcomes", sub: "insights" },
  results: { tab: "outcomes", sub: "results" },
};

/**
 * resolveTabParams
 *
 * Given the raw ?tab= and ?sub= values from the URL, returns the canonical
 * {tab, sub} pair after:
 *   1. Applying REDIRECT_MAP for legacy tab values.
 *   2. Falling back to the default sub-tab for known cluster tabs when ?sub= is absent.
 *
 * Returns null for `sub` when the resolved tab has no sub-tabs.
 */
export function resolveTabParams(
  tab: string | null,
  sub: string | null
): ResolvedTabParams {
  if (!tab) {
    return { tab: "overview", sub: null };
  }

  // Apply legacy redirect if applicable.
  const redirect = REDIRECT_MAP[tab];
  if (redirect) {
    return {
      tab: redirect.tab,
      // Honor an explicit ?sub= even after a tab redirect (future-proof).
      sub: sub ?? redirect.sub,
    };
  }

  // Known cluster tab with no explicit sub — apply default.
  const defaultSub = DEFAULT_SUB[tab as ValidTab];
  if (defaultSub !== undefined) {
    return { tab, sub: sub ?? defaultSub };
  }

  // Ordinary tab (overview, campaign-plan, bargaining, etc.) — no sub.
  return { tab, sub: null };
}

/**
 * needsRedirect
 *
 * Returns true when the raw URL params differ from the resolved params,
 * meaning a router.replace() is needed to rewrite the URL.
 */
export function needsRedirect(
  rawTab: string | null,
  rawSub: string | null,
  resolved: ResolvedTabParams
): boolean {
  return rawTab !== resolved.tab || rawSub !== resolved.sub;
}
