// WP1.3 — the landing rule, pure.
//
// Where a signed-in user goes after the neutral gate at `/` decides, and
// whether My campaigns should hop straight to a single campaign's wall chart.
// No React, no `next/*`, so `__tests__/landing.test.ts` runs it directly.
//
// The single-campaign auto-open is a LANDING rule, not a page rule: it fires
// only when the user arrived from the gate (`?from=landing`). Without the flag
// an organiser with one campaign could never see the My campaigns page — the
// sidebar link would bounce them straight back to the chart.

import type { WorkspaceMode } from "./resolve";

export const MY_CAMPAIGNS_PATH = "/my-campaigns";
/** Full mode is byte-for-byte unchanged: today's post-login destination. */
export const FULL_MODE_LANDING_PATH = "/campaigns";
export const LANDING_PARAM = "from";
export const LANDING_PARAM_VALUE = "landing";

/** L1 / L2 — where the gate at `/` sends a user once the mode is known. */
export function landingPathFor(input: { mode: WorkspaceMode }): string {
  if (input.mode === "organiser") {
    return `${MY_CAMPAIGNS_PATH}?${LANDING_PARAM}=${LANDING_PARAM_VALUE}`;
  }
  return FULL_MODE_LANDING_PATH;
}

/**
 * L3 — the wall-chart URL `/campaigns` already pushes on a row click. The
 * explicit tab/sub form keeps one URL contract for the e2e assertion even
 * though a bare `/campaigns/{id}` resolves to the same view today.
 */
export function campaignChartHref(campaignId: number): string {
  return `/campaigns/${campaignId}?tab=workforce&sub=wall-chart`;
}

/** L4 — the id to open, only from the landing hop and only with exactly one campaign. */
export function shouldAutoOpenSingleCampaign(input: {
  fromLanding: boolean;
  campaignIds: readonly number[];
}): number | null {
  if (!input.fromLanding) return null;
  if (input.campaignIds.length !== 1) return null;
  return input.campaignIds[0];
}
