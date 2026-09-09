import { expect, test } from "@playwright/test";

import { ADMIN_STORAGE_STATE } from "../../../playwright.config";
import {
  E2E_FOREIGN_CAMPAIGN_ID,
  NO_ADMIN_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2EForeignCampaign,
} from "../env";
import {
  ADMIN_UNIT_PREFIX,
  deleteUnitsByNamePrefix,
  restClientFor,
  sessionFromCookies,
  sessionFromStorageState,
  sweepAdminUnits,
} from "./campaign-cleanup";
import {
  collectAlerts,
  createUnit,
  deleteUnit,
  gotoDocument,
  openWallChart,
  renameUnit,
} from "./unit-lifecycle";

/**
 * WP1.6 role coverage — the `admin` role (runs in the `chromium-admin`
 * project as the E2E_ADMIN account; skips cleanly without E2E_ADMIN_*).
 *
 * Same create / rename / delete unit steps as the user spec, but on a
 * campaign the user account can NOT write to (E2E_FOREIGN_CAMPAIGN_ID), which
 * proves "admin unchanged: any campaign". When that id is not set it falls
 * back to the first campaign on /campaigns — still "any campaign" for an
 * admin, just not the contrast case. It creates and removes only its own
 * unit and never deletes a campaign it did not create; beforeAll sweeps any
 * "WP1.6 admin unit …" a previous run left, and afterEach removes this run's
 * unit if the UI step did not (fix round 2, item D).
 */
test.describe("WP1.6 role coverage — admin", () => {
  // Several full page loads on a cold preview plus 30s per-step waits.
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2EAdminCredentials, NO_ADMIN_CREDENTIALS_MESSAGE);

  /** The campaign and unit-name stamp of the running test, for afterEach. */
  let created: { campaignId: string; unitName: string } | null = null;

  test.beforeAll(async () => {
    if (!hasE2EAdminCredentials) return;
    test.setTimeout(120_000);
    await sweepAdminUnits(ADMIN_STORAGE_STATE);
  });

  test.afterEach(async ({ page, request }) => {
    if (!created) return;
    const { campaignId, unitName } = created;
    created = null;
    const session =
      (await page
        .context()
        .cookies()
        .then(sessionFromCookies)
        .catch(() => null)) ?? sessionFromStorageState(ADMIN_STORAGE_STATE);
    const client = restClientFor(request, session);
    if (!client) return;
    // Covers both the original and the renamed unit.
    const removed = await deleteUnitsByNamePrefix(client, unitName, campaignId);
    if (removed > 0) {
      test.info().annotations.push({
        type: "cleanup",
        description: `${removed} unit(s) named "${unitName}…" were still on campaign ${campaignId} after the test; removed via REST.`,
      });
    }
  });

  test("creates, renames and deletes a unit on any campaign", async ({ page }) => {
    const alerts = collectAlerts(page);
    const stamp = Date.now();
    const unitName = `${ADMIN_UNIT_PREFIX}${stamp}`;
    const renamedUnitName = `${unitName} renamed`;

    let campaignId = E2E_FOREIGN_CAMPAIGN_ID;
    if (!hasE2EForeignCampaign) {
      test.info().annotations.push({
        type: "fallback",
        description:
          "E2E_FOREIGN_CAMPAIGN_ID is unset: using the first row on /campaigns. This proves 'admin can write on a campaign' but not the contrast with the campaign the user account cannot write to.",
      });
      await gotoDocument(page, "/campaigns", "campaigns list");
      const rows = page.locator("table tbody tr");
      await expect(
        rows.first(),
        "Expected at least one campaign row on /campaigns for the admin account."
      ).toBeVisible({ timeout: 30_000 });
      await rows.first().click();
      await page.waitForURL(/\/campaigns\/(\d+)\?/, { timeout: 30_000 });
      campaignId = page.url().match(/\/campaigns\/(\d+)\?/)?.[1] ?? "";
      expect(campaignId).toMatch(/^\d+$/);
    }
    created = { campaignId, unitName };

    await openWallChart(page, campaignId);
    await createUnit(page, unitName);
    await renameUnit(page, campaignId, unitName, renamedUnitName);
    await deleteUnit(page, campaignId, renamedUnitName);

    expect(
      alerts,
      "No window.alert may fire: delete-organising-unit-dialog surfaces NoRowsAffectedError that way."
    ).toEqual([]);
  });
});
