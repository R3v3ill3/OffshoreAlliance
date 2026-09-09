import { expect, test } from "@playwright/test";

import {
  E2E_FOREIGN_CAMPAIGN_ID,
  NO_ADMIN_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2EForeignCampaign,
} from "../env";
import { collectAlerts, createUnit, deleteUnit, openWallChart, renameUnit } from "./unit-lifecycle";

/**
 * WP1.6 role coverage — the `admin` role (runs in the `chromium-admin`
 * project as the E2E_ADMIN account; skips cleanly without E2E_ADMIN_*).
 *
 * Same create / rename / delete unit steps as the user spec, but on a
 * campaign the user account can NOT write to (E2E_FOREIGN_CAMPAIGN_ID), which
 * proves "admin unchanged: any campaign". When that id is not set it falls
 * back to the first campaign on /campaigns — still "any campaign" for an
 * admin, just not the contrast case. It creates and removes only its own
 * unit and never deletes a campaign it did not create.
 */
test.describe("WP1.6 role coverage — admin", () => {
  test.skip(!hasE2EAdminCredentials, NO_ADMIN_CREDENTIALS_MESSAGE);

  test("creates, renames and deletes a unit on any campaign", async ({ page }) => {
    test.setTimeout(180_000);
    const alerts = collectAlerts(page);
    const stamp = Date.now();
    const unitName = `WP1.6 admin unit ${stamp}`;
    const renamedUnitName = `${unitName} renamed`;

    let campaignId = E2E_FOREIGN_CAMPAIGN_ID;
    if (!hasE2EForeignCampaign) {
      test.info().annotations.push({
        type: "fallback",
        description:
          "E2E_FOREIGN_CAMPAIGN_ID is unset: using the first row on /campaigns. This proves 'admin can write on a campaign' but not the contrast with the campaign the user account cannot write to.",
      });
      await page.goto("/campaigns");
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
