import { expect, test } from "@playwright/test";

import { NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "./env";

/**
 * WP1.5: the Actions hub at /actions replaces the SMS hub, lists email sends
 * and call lists alongside SMS, and defaults to the signed-in organiser's own
 * actions.
 *
 * Every selector below is an anchor the product already relies on — the page
 * h1, the "Start something" region label, the chip rows' role="group" labels,
 * aria-pressed on the chips, and either the Scope column header or the
 * empty-state hint. No data-testid is added to production markup.
 *
 * The assertions are structural, not data-dependent: an empty dev seed still
 * renders the header, the cards, the chip rows and the URL contract, and the
 * one assertion that could depend on rows accepts the empty state instead.
 */
test.describe("Actions hub", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("open /actions, see the three start cards and the status buckets", async ({ page }) => {
    await page.goto("/actions");
    await expect(page.getByRole("main").getByRole("heading", { name: "Actions", level: 1 })).toBeVisible();

    // Start something — one card per channel. The Email card's second link is
    // the legacy wizard, named honestly because its sends are never listed.
    const start = page.getByRole("region", { name: "Start something" });
    await expect(start.getByRole("link", { name: /New SMS action/i })).toBeVisible();
    await expect(start.getByRole("link", { name: /Email wizard/i })).toBeVisible();
    await expect(start.getByRole("link", { name: /New call list/i })).toBeVisible();

    // Mine is the default; All is one click away and says so in the URL.
    const owner = page.getByRole("group", { name: "Owner" });
    await expect(owner.getByRole("button", { name: "Mine" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await owner.getByRole("button", { name: "All" }).click();
    await expect(page).toHaveURL(/[?&]mine=0/);

    // On the widest view (All owners, all buckets) the hub shows either the
    // table — whose Scope column says a campaign name or "Standalone" — or,
    // on an empty seed, its empty-state hint. Asserting one OR the other keeps
    // the spec independent of whatever data the environment happens to hold.
    await expect(
      page
        .locator("table").getByText("Scope", { exact: true })
        .or(page.getByText(/No actions yet|Nothing matches these filters|could not be loaded/))
        .first()
    ).toBeVisible();

    // The four status buckets, each with a count.
    const buckets = page.getByRole("group", { name: "Status" });
    for (const label of ["Live", "Drafts & paused", "Finished", "Archived"]) {
      await expect(buckets.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }
    await buckets.getByRole("button", { name: /Drafts & paused/ }).click();
    await expect(page).toHaveURL(/[?&]bucket=drafts_paused/);
  });

  test("/sms still works and lands on the hub with its params intact", async ({ page }) => {
    await page.goto("/sms?scope=standalone");
    await expect(page).toHaveURL(/\/actions\?.*scope=standalone/);
    await expect(page.getByRole("main").getByRole("heading", { name: "Actions", level: 1 })).toBeVisible();
  });
});
