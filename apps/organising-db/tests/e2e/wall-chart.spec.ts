import { expect, test } from "@playwright/test";

import { NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "./env";

/**
 * Canonical flow one (WP0.2, phase-0 form): open a campaign from /campaigns and
 * see the wall chart. WP1.3 later changes the start page; this spec follows it.
 *
 * Every selector below is an anchor the product already relies on — the
 * "Wall chart" card title, the "Campaign summary" heading, aria-pressed on the
 * view toggle, and the data-worker-id / data-ou-id hooks the wall chart's own
 * scroll and overlay code queries. No data-testid is added to production markup.
 *
 * The content assertion accepts the Unassigned card OR any tile, because at
 * instigation it is common for 100% of the membership to be Unassigned. It does
 * require the campaign to have at least one member: on a stripped dev seed the
 * two structural assertions above it still pass, so a failure says exactly
 * which condition was missing.
 */
test.describe("Wall chart — flow one", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("open a campaign from /campaigns and see the wall chart", async ({ page }) => {
    // The card title is a <div> (CardTitle); the view-toggle <button> carries
    // the same string, so scope to the div and take the first match rather than
    // tripping Playwright's strict mode.
    const wallChartCardTitle = page
      .getByText("Wall chart", { exact: true })
      .and(page.locator("div"))
      .first();

    await page.goto("/campaigns");

    const rows = page.locator("table tbody tr");
    // The DataTable renders a literal "No results found." row when empty, so an
    // empty dev seed fails here rather than further down.
    await expect(
      rows.first(),
      "Expected at least one campaign row on /campaigns. The e2e account must be able to see a dev campaign with at least one member (WP0.2 open question Q2)."
    ).toBeVisible({ timeout: 30_000 });

    await rows.first().click();

    await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/);

    await expect(wallChartCardTitle).toBeVisible();
    await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await expect(
      page
        .locator("[data-worker-id]")
        .first()
        .or(page.locator('[data-ou-id="unassigned"]')),
      "Expected at least one worker tile or the Unassigned card. A campaign with zero members renders neither (WP0.2 open question Q2)."
    ).toBeVisible();

    // Overview round-trip (WP0.3 hand-off). Vitest cannot cover this: it is the
    // URL contract between the tab list and the resolved tab state.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).toHaveURL(/tab=overview/);

    await page.getByRole("tab", { name: "Workforce" }).click();
    await page.getByRole("tab", { name: "Wall Chart / List" }).click();
    await expect(page).toHaveURL(/sub=wall-chart/);
    await expect(wallChartCardTitle).toBeVisible();
  });
});
