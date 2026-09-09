import { request as playwrightRequest } from "@playwright/test";

import type { HintId } from "@/lib/hints/registry";

import { STORAGE_STATE } from "../../playwright.config";
import { restClientFor, sessionFromStorageState, type RestClient } from "./roles/campaign-cleanup";

/**
 * WP1.7 follow-up — the suite-wide invariant for first-use hints:
 * **the e2e user is always "hint dismissed" except inside the hint spec.**
 *
 * Why: the WP1.7 rating hint is per-user server-side state, so once the hint
 * spec resets it the hint reappears in every other spec — specs written before
 * WP1.7 existed. Two observed casualties on the develop preview: flow one's
 * "Campaign summary" heading (the hint's scroll-into-view collapses the sticky
 * summary) and organiser-campaign's Build list step (the hint's popover layer
 * coexists with the open New action menu). Both passed in isolation, which is
 * the signature of order dependence, not of a product bug.
 *
 * So global setup seeds the dismissal for the signed-in account before any
 * spec runs, and the hint spec — the only place the hint is wanted — deletes
 * it in `beforeEach` and puts it back in `afterEach`. The suite is then
 * order-independent and a crashed hint spec costs at most that one run.
 *
 * Everything here goes through the signed-in session's own token via
 * `restClientFor` (tests/e2e/roles/campaign-cleanup.ts): the REST origin and
 * anon key come from what the app itself sent during sign-in, the project ref
 * comes from the session cookie, and the production project is refused
 * outright. RLS allows a user only their own rows, so this can write nothing
 * the product could not write for the same account.
 */

/** The hint the wall-chart spec exercises (src/lib/hints/registry.ts). */
export const WALL_CHART_RATING_HINT_ID: HintId = "wall_chart_rating";

/**
 * Inserts the dismissal row for the signed-in user, treating "already there"
 * as success: `resolution=ignore-duplicates` is PostgREST's ON CONFLICT DO
 * NOTHING, which the table's INSERT-only grant allows (the WP1.7 migration
 * grants no UPDATE, so a merge-duplicates upsert would be refused).
 */
export async function insertHintDismissal(
  client: RestClient,
  hintId: HintId
): Promise<{ status: number; body: unknown }> {
  return client.post(
    "/rest/v1/user_hint_dismissals",
    { user_id: client.session.userId, hint_id: hintId },
    "resolution=ignore-duplicates,return=minimal"
  );
}

/**
 * Global-setup seed: mark the e2e user as having dismissed `hintId`.
 *
 * Silent no-op when there is no session or no REST config (a credential-less
 * run, where every signed-in spec skips anyway); throws only where
 * `restClientFor` does — a session belonging to the production project.
 */
export async function seedHintDismissal(hintId: HintId): Promise<void> {
  const api = await playwrightRequest.newContext();
  try {
    const client = restClientFor(api, sessionFromStorageState(STORAGE_STATE));
    if (!client) return;
    const res = await insertHintDismissal(client, hintId);
    const ok = res.status >= 200 && res.status < 300;
    console.log(
      `[hints] seed dismissal "${hintId}" for the e2e user: ${ok ? `HTTP ${res.status}` : `FAILED HTTP ${res.status} ${JSON.stringify(res.body)}`}`
    );
  } finally {
    await api.dispose();
  }
}
