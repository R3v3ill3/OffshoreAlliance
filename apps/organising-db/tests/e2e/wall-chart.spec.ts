import { expect, test, type Page } from "@playwright/test";

import { E2E_USER_EMAIL, E2E_USER_PASSWORD, NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "./env";

/**
 * Canonical flow one, phase-1 form (WP0.2 → WP1.3): sign in and reach a wall
 * chart in under ten seconds.
 *
 * Test A performs its own login (empty storage state) so the budget is
 * measured from the sign-in submit, not from a restored session. After the
 * submit the landing gate at `/` sends the account to one of three places,
 * and all three are asserted — the operator may or may not have flipped this
 * account to organiser mode, and the account owns exactly one dev campaign:
 *   1. `/campaigns/{id}?…`   organiser mode + one campaign: the gate opened the chart;
 *   2. `/my-campaigns`       organiser mode + several campaigns: click "Open wall chart";
 *   3. `/campaigns`          full mode: today's path, unchanged — click the first row.
 *
 * Test B visits `/my-campaigns` directly with the shared signed-in session.
 * It is mode-independent: the route exists in both modes and, without
 * `?from=landing`, the single-campaign auto-open cannot fire (landing.ts L4).
 * The WP0.3 Overview round-trip (test C in the plan) is appended to it.
 *
 * Every selector is an anchor the product already relies on — the "Wall
 * chart" card title, the "Campaign summary" heading, aria-pressed on the
 * view toggle, the "Open wall chart" link text, the "In a unit" stat label and
 * the data-worker-id / data-ou-id hooks the wall chart's own scroll and
 * overlay code queries. No data-testid is added to production markup.
 *
 * The content assertion accepts the Unassigned card OR any tile, because at
 * instigation it is common for 100% of the membership to be Unassigned. It
 * does require the campaign to have at least one member.
 */

/**
 * The card title is a <div> (CardTitle); the view-toggle <button> carries the
 * same string, so scope to the div and take the first match rather than
 * tripping Playwright's strict mode.
 */
function wallChartCardTitle(page: Page) {
  return page.getByText("Wall chart", { exact: true }).and(page.locator("div")).first();
}

/** The three structural wall-chart assertions every test ends on. */
async function expectWallChart(page: Page) {
  await expect(wallChartCardTitle(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
}

/** Where the landing gate can send a signed-in account. */
const POST_LOGIN_URL = /\/(my-campaigns|campaigns)(\/|\?|$)/;

test.describe("Wall chart — flow one, from the login submit", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  // Own login: the budget starts at the submit, not at a restored session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sign in and reach a wall chart in under ten seconds", async ({ page }) => {
    await page.goto("/login");
    // Selectors from src/app/(auth)/login/page.tsx, as in global-setup.ts.
    await page.locator("#email").fill(E2E_USER_EMAIL);
    await page.locator("#password").fill(E2E_USER_PASSWORD);
    const t0 = Date.now();
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(POST_LOGIN_URL, { timeout: 20_000 });
    const url = new URL(page.url());

    if (/^\/campaigns\/\d+$/.test(url.pathname)) {
      // 1. organiser mode + exactly one campaign — the gate opened the chart.
    } else if (url.pathname === "/my-campaigns") {
      // 2. organiser mode + several campaigns — one honest link per card.
      await page.getByRole("link", { name: "Open wall chart" }).first().click();
    } else {
      // 3. full mode — today's path, unchanged.
      const rows = page.locator("table tbody tr");
      await expect(
        rows.first(),
        "Expected at least one campaign row on /campaigns. The e2e account must be able to see a dev campaign with at least one member (WP0.2 open question Q2)."
      ).toBeVisible({ timeout: 30_000 });
      await rows.first().click();
    }

    // Branch 1 lands on the explicit tab/sub URL too (landing.ts L3), but a
    // bare /campaigns/{id} would still be the chart, so the query is optional.
    await expect(page).toHaveURL(/\/campaigns\/\d+(\?.*tab=workforce.*sub=wall-chart)?/, {
      timeout: 30_000,
    });
    await expectWallChart(page);

    // After the visibility assertions on purpose: a failure here says "it was
    // slow", not "the chart never appeared".
    expect(Date.now() - t0, "login → wall chart must be under 10 s").toBeLessThan(10_000);
  });
});

test.describe("My campaigns", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("lists my campaigns and opens the wall chart", async ({ page }) => {
    await page.goto("/my-campaigns");
    // header.tsx renders the page title as the h1.
    await expect(page.getByRole("heading", { name: "My campaigns" })).toBeVisible();

    const card = page.getByRole("link", { name: "Open wall chart" }).first();
    await expect(
      card,
      "the e2e account must be on at least one dev campaign (campaign_organisers or campaigns.organiser_id)"
    ).toBeVisible({ timeout: 30_000 });
    // The four-number strip.
    await expect(page.getByText("In a unit").first()).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/, {
      timeout: 30_000,
    });
    await expectWallChart(page);

    // One CSS selector, then .first(): `.first().or(...)` binds .first() to the
    // left operand only, so when both a tile and the Unassigned card exist the
    // locator resolves to two elements and trips strict mode. The wall chart's
    // members and OU queries run after the page mounts, so give them the same
    // 30s the navigation gets.
    await expect(
      page.locator('[data-worker-id], [data-ou-id="unassigned"]').first(),
      "Expected at least one worker tile or the Unassigned card. A campaign with zero members renders neither (WP0.2 open question Q2)."
    ).toBeVisible({ timeout: 30_000 });

    // Overview round-trip (WP0.3 hand-off), kept verbatim. Vitest cannot cover
    // this: it is the URL contract between the tab list and the resolved tab
    // state.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).toHaveURL(/tab=overview/);

    await page.getByRole("tab", { name: "Workforce" }).click();
    await page.getByRole("tab", { name: "Wall Chart / List" }).click();
    await expect(page).toHaveURL(/sub=wall-chart/);
    await expect(wallChartCardTitle(page)).toBeVisible();
  });
});
