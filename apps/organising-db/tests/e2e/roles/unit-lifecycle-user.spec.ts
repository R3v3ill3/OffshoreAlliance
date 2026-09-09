import { expect, test } from "@playwright/test";

import { STORAGE_STATE } from "../../../playwright.config";
import {
  E2E_FOREIGN_CAMPAIGN_ID,
  NO_CREDENTIALS_MESSAGE,
  NO_FOREIGN_CAMPAIGN_MESSAGE,
  hasE2ECredentials,
  hasE2EForeignCampaign,
} from "../env";
import {
  ROLE_CHECK_CAMPAIGN_PREFIX,
  campaignExists,
  deleteCampaignViaRpc,
  restClientFor,
  sessionFromCookies,
  sessionFromStorageState,
  sweepRoleCheckCampaigns,
} from "./campaign-cleanup";
import {
  campaignsListRows,
  collectAlerts,
  createUnit,
  deleteCampaign,
  deleteUnit,
  gotoDocument,
  openCampaignsList,
  openWallChart,
  renameUnit,
  showAllOrganisers,
} from "./unit-lifecycle";

/**
 * WP1.6 role coverage — the `user` role (runs in the `chromium` project as the
 * E2E_USER account, which after WP0.4's hygiene run on dev is role='user').
 *
 * Positive path (decision 8's note): a user creates a campaign with
 * themselves assigned, then creates, renames and deletes a unit on it, then
 * deletes the campaign. The spec creates its own fixture and removes it, so
 * it depends on no dev data and leaves dev clean: beforeAll sweeps any
 * "WP1.6 role check …" campaign this account left behind, and afterEach
 * deletes the campaign through the same delete_campaign RPC if the UI step
 * did not get to it (fix round 2, item D).
 *
 * Negative path (§2.7.3): on a campaign the account cannot write to, the
 * write controls are absent. Which campaign that is must be discovered, not
 * hard-coded (E2E_FOREIGN_CAMPAIGN_ID from the 95_role_probes.sql discovery
 * query); without it that test skips with a clear message.
 */
test.describe("WP1.6 role coverage — user", () => {
  // Each test is several full page loads on a cold preview plus the 30s
  // per-step waits; the default 30s test timeout closed the context mid-test
  // (§12 run 2, unit-lifecycle-user.spec.ts:80).
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  /** The campaign the positive test created, for afterEach's fallback delete. */
  let createdCampaignId: string | null = null;

  test.beforeAll(async () => {
    if (!hasE2ECredentials) return;
    test.setTimeout(120_000);
    await sweepRoleCheckCampaigns(STORAGE_STATE);
  });

  test.afterEach(async ({ page, request }) => {
    if (!createdCampaignId) return;
    const campaignId = createdCampaignId;
    createdCampaignId = null;
    // Prefer the live context's cookies (the middleware may have rotated the
    // token during the test); fall back to the storage state if the page is
    // already unusable (test timeout).
    const session =
      (await page
        .context()
        .cookies()
        .then(sessionFromCookies)
        .catch(() => null)) ?? sessionFromStorageState(STORAGE_STATE);
    const client = restClientFor(request, session);
    if (!client) return;
    if (!(await campaignExists(client, campaignId))) return;
    const result = await deleteCampaignViaRpc(client, campaignId);
    test.info().annotations.push({
      type: "cleanup",
      description: `campaign ${campaignId} was still present after the test; delete_campaign RPC: ${result.ok ? "deleted" : result.detail}`,
    });
    expect(result.ok, `Fallback cleanup of campaign ${campaignId} via delete_campaign failed: ${result.detail}`).toBe(
      true
    );
  });

  test("creates a campaign, then creates, renames and deletes a unit and the campaign", async ({
    page,
  }) => {
    const alerts = collectAlerts(page);
    const stamp = Date.now();
    const campaignName = `${ROLE_CHECK_CAMPAIGN_PREFIX}${stamp}`;
    const unitName = `WP1.6 unit ${stamp}`;
    const renamedUnitName = `${unitName} renamed`;

    // 1. Create the campaign via manual create (src/app/(dashboard)/campaigns/new/manual/page.tsx).
    await gotoDocument(page, "/campaigns/new/manual", "manual create page");
    await expect(page.getByRole("heading", { name: /Create campaign/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("You do not have permission to create campaigns.")).toHaveCount(0);
    await page.getByPlaceholder("e.g. Acme EBA 2026").fill(campaignName);
    await page.getByRole("button", { name: /Create and open settings/ }).click();
    await page.waitForURL(/\/campaigns\/(\d+)\/settings/, { timeout: 60_000 });
    const campaignId = page.url().match(/\/campaigns\/(\d+)\/settings/)?.[1];
    expect(campaignId, "manual create must redirect to /campaigns/<id>/settings").toBeTruthy();
    createdCampaignId = campaignId!;

    // 2. The wall chart renders, and the write-access RPC says we can write.
    await openWallChart(page, campaignId!);

    // 3. Create a unit.
    await createUnit(page, unitName);

    // 4. Rename it (campaign_organising_units UPDATE under wp16_cou_update).
    await renameUnit(page, campaignId!, unitName, renamedUnitName);

    // 5. Delete it (campaign_organising_units DELETE under wp16_cou_delete).
    await deleteUnit(page, campaignId!, renamedUnitName);
    expect(
      alerts,
      "No window.alert may fire: delete-organising-unit-dialog surfaces NoRowsAffectedError that way."
    ).toEqual([]);

    // 6. Delete the campaign (delete_campaign() with the is_campaign_creator arm),
    //    from the list reached by client-side navigation off the wall chart.
    await deleteCampaign(page, campaignName);
    expect(alerts).toEqual([]);
    // afterEach re-checks that the row is gone and only then clears the fixture.
  });

  test("offers no write controls on a campaign the account cannot write to", async ({ page }) => {
    test.skip(!hasE2EForeignCampaign, NO_FOREIGN_CAMPAIGN_MESSAGE);
    const alerts = collectAlerts(page);

    await openWallChart(page, E2E_FOREIGN_CAMPAIGN_ID);

    // campaign-detail-header-bar.tsx renders the campaign name as the <h1>
    // inside its <header>; the /campaigns search box is filtered on it below.
    const heading = page.locator("header h1").first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
    const foreignCampaignName = (await heading.textContent())?.trim() ?? "";
    expect(foreignCampaignName, "the campaign header must show the campaign name").not.toBe("");

    // The page must have real content, otherwise "hidden" is vacuous. One CSS
    // selector, then .first(): `.first().or(...)` binds .first() to the left
    // operand only and trips strict mode when both a tile and the Unassigned
    // card are present (wp1.6.md §12.11 attempt 2).
    await expect(
      page.locator('[data-worker-id], [data-ou-id="unassigned"]').first(),
      "Expected at least one worker tile or the Unassigned card on the foreign campaign."
    ).toBeVisible({ timeout: 30_000 });

    // wall-chart-unit-manager.tsx: "New unit" (standalone or inside the Units popover).
    await expect(page.getByRole("button", { name: "New unit" })).toHaveCount(0);
    const unitsPopover = page.getByRole("button", { name: /^Units/ });
    if (await unitsPopover.isVisible()) {
      await unitsPopover.click();
      await expect(page.getByRole("button", { name: "New unit" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }

    // And the list page offers no delete for it either (campaigns_i_can_write gate).
    // Filter by name exactly as deleteCampaign() does: the DataTable paginates,
    // so without the filter a row off the first page would make this check
    // vacuous. The row must be present before its delete control is asserted absent.
    // The list defaults to this account's own organiser, which hides the
    // foreign campaign (a different organiser by construction): widen to all.
    const { writeAccess } = await openCampaignsList(page);
    await writeAccess;
    await showAllOrganisers(page);
    await page.getByPlaceholder("Search campaigns…").fill(foreignCampaignName);
    const row = campaignsListRows(page).filter({
      has: page.locator(`a[href^="/campaigns/${E2E_FOREIGN_CAMPAIGN_ID}/plan"]`),
    });
    await expect(
      row,
      "The foreign campaign must appear in the filtered /campaigns list."
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(row.getByRole("button", { name: /^Delete / })).toHaveCount(0);

    expect(alerts).toEqual([]);
  });
});
