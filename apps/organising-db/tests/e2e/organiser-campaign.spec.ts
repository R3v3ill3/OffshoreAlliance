import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { ADMIN_STORAGE_STATE, E2E_BASE_URL } from "../../playwright.config";
import {
  E2E_USER_EMAIL,
  NO_ADMIN_CREDENTIALS_MESSAGE,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";

/**
 * WP1.4: the campaign workspace.
 *
 * Test 1 is the zero-change-in-full-mode criterion measured in a browser.
 * Every account resolves to full mode by default, so the eight tabs, their
 * labels and their order must be exactly today's, and none of the
 * organiser-mode furniture may appear.
 *
 * Test 2 is the organiser-mode round trip, in the same shape as
 * organiser-nav.spec.ts: an admin flips the e2e user into organiser mode
 * through WP1.1's validated write path, the user reloads, and the four tabs,
 * More, the deep links, the switcher and the header actions are checked.
 * Its `finally` ALWAYS clears the override again — the dev database is
 * shared, and leaving the account in organiser mode would change what
 * wall-chart.spec.ts sees on the next run.
 *
 * Every selector is an anchor the product already relies on: the Radix
 * tablist, the two <nav> landmarks the organiser bar renders, the button
 * labels and `aria-pressed`. No data-testid is added to production markup.
 */

/** The dev seed's campaign; the same one wall-chart.spec.ts uses. */
const CAMPAIGN = "1";
const WALL_CHART_URL = `/campaigns/${CAMPAIGN}?tab=workforce&sub=wall-chart`;

const FULL_MODE_TABS = [
  "Overview",
  "Plan & Execution",
  "Section Plans",
  "Workforce",
  "Outcomes",
  "Outreach",
  "Library",
];

const ORGANISER_TABS = ["Wall chart", "People", "Activity", "Setup", "More"];

test.describe("Campaign workspace — full mode is today's page", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("the eight tabs, in order, with no organiser-mode furniture", async ({ page }) => {
    await page.goto(WALL_CHART_URL);

    const tabs = page.locator('[role="tablist"]').first().locator('[role="tab"]');
    await expect(tabs.first()).toBeVisible();
    const labels = await tabs.allTextContents();

    // Bargaining renders only at current_phase = 'bargaining_to_win', which
    // the seed campaign may or may not be at, so the seven unconditional
    // tabs are asserted exactly and the optional eighth is named.
    expect(labels.slice(0, FULL_MODE_TABS.length)).toEqual(FULL_MODE_TABS);
    expect(labels.slice(FULL_MODE_TABS.length)).toEqual(
      labels.length > FULL_MODE_TABS.length ? ["Bargaining"] : []
    );

    await expect(page.getByRole("button", { name: "New action" })).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Campaign sections"]')).toHaveCount(0);
    // The full-mode header keeps its own four controls.
    await expect(page.getByRole("button", { name: "Create Phone Call" })).toBeVisible();
  });
});

test.describe("Campaign workspace — the organiser-mode round trip", () => {
  test.skip(
    !hasE2ECredentials || !hasE2EAdminCredentials,
    `${NO_CREDENTIALS_MESSAGE} ${NO_ADMIN_CREDENTIALS_MESSAGE}`
  );

  test("four tabs plus More, deep links, the switcher and every header action", async ({
    page,
    browser,
  }) => {
    const admin = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: resolve(__dirname, "../..", ADMIN_STORAGE_STATE),
    });

    try {
      const list = await admin.request.get("/api/admin/users");
      expect(list.ok(), "the admin account must be able to list users").toBeTruthy();
      const { users } = (await list.json()) as {
        users: { user_id: string; email?: string }[];
      };
      const userId = users.find(
        (u) => u.email?.toLowerCase() === E2E_USER_EMAIL.toLowerCase()
      )?.user_id;
      expect(userId, "the E2E_USER account must exist on dev").toBeTruthy();
      if (!userId) return;

      try {
        const set = await admin.request.patch("/api/admin/update-user", {
          data: { userId, workspacePrefs: { mode: "organiser" } },
        });
        expect(set.ok(), await set.text()).toBeTruthy();

        // AuthProvider caches workspace_prefs with the profile at sign-in, so
        // a full reload is required for the new mode to take effect.
        await page.goto(WALL_CHART_URL);
        await page.reload();

        // 1 — the four tabs and More.
        const nav = page.locator('nav[aria-label="Campaign sections"]');
        await expect(nav).toBeVisible();
        await expect(nav.locator("button")).toHaveText(ORGANISER_TABS);

        // 2 — More lists the enabled modules and mutes the rest with a reason.
        const more = nav.getByRole("button", { name: "More" });
        await more.click();
        const menu = page.getByRole("menu");
        // Role check is wall_chart_people, which is on by default, so it is a
        // live item; the strategic-plan and insights surfaces are not.
        await expect(menu.getByRole("menuitem", { name: /Role check/ })).toBeEnabled();
        await expect(menu.getByText("Ask an admin to enable").first()).toBeVisible();
        // Radix marks a disabled item with aria-disabled, not the native
        // attribute, because it is a <div role="menuitem">.
        await expect(
          menu.getByRole("menuitem", { name: /Pending review/ })
        ).toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");

        // 3 — mode is presentation, never permission: a deep link to a
        // surface behind More still renders, and More says where you are.
        await page.goto(`/campaigns/${CAMPAIGN}?tab=plan&sub=pending-review`);
        await expect(
          page
            .getByText("Pending leader-form submissions")
            .or(page.getByText("No pending submissions to review."))
        ).toBeVisible();
        await expect(
          page.locator('nav[aria-label="Campaign sections"]').getByRole("button", {
            name: /More/,
          })
        ).toContainText("Pending review");

        // 4 — every legacy ?tab= still rewrites to its documented pair.
        const redirects: [string, string][] = [
          ["wall", "tab=workforce&sub=wall-chart"],
          ["universe", "tab=workforce&sub=universe"],
          ["workplan", "tab=plan&sub=workplan"],
          ["tasklists", "tab=plan&sub=task-lists"],
        ];
        for (const [legacy, expected] of redirects) {
          await page.goto(`/campaigns/${CAMPAIGN}?tab=${legacy}`);
          await expect
            .poll(() => new URL(page.url()).search, {
              message: `?tab=${legacy} must rewrite to ${expected}`,
            })
            .toContain(expected);
          await expect(page.locator('nav[aria-label="Campaign sections"]')).toBeVisible();
        }

        // 5 — the switcher. With more than one campaign it is a popover the
        // g-then-c chord opens; with exactly one it collapses to a label,
        // which is itself the single-campaign acceptance criterion.
        await page.goto(WALL_CHART_URL);
        // The trigger's accessible name is the campaign name, so anchor on
        // the listbox affordance the product already declares.
        const switcher = page.locator('button[aria-haspopup="listbox"]');
        if ((await switcher.count()) > 0) {
          await page.keyboard.press("g");
          await page.keyboard.press("c");
          await expect(page.getByPlaceholder("Find a campaign")).toBeVisible();
          await expect(page.getByText("All campaigns")).toBeVisible();
          await page.keyboard.press("Escape");
        } else {
          // The plain-label branch: a label, and no listbox to open.
          await expect(page.getByPlaceholder("Find a campaign")).toHaveCount(0);
        }

        // 6 — the header. New action ▾ holds the five creation paths.
        await page.getByRole("button", { name: "New action" }).click();
        const newAction = page.getByRole("menu");
        await expect(newAction.getByRole("menuitem")).toHaveText([
          "Call list",
          "SMS",
          "Email",
          "Task list",
          "Assessment",
        ]);
        await page.keyboard.press("Escape");

        // Build list is a top-level toggle over the existing ?buildList=1.
        const buildList = page.getByRole("button", { name: "Build list" });
        await expect(buildList).toHaveAttribute("aria-pressed", "false");
        await buildList.click();
        await expect(page).toHaveURL(/buildList=1/);
        await expect(buildList).toHaveAttribute("aria-pressed", "true");

        // …and the ⋯ menu holds the five demoted actions, none removed.
        await page.getByRole("button", { name: "More campaign actions" }).click();
        await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
          "Import worker list",
          "Task management",
          "Re-run wizard",
          "All settings",
          "View full plan",
        ]);
        await page.keyboard.press("Escape");
      } finally {
        // `null` parses to `{}` and clears the override. Asserted, not
        // fire-and-forget: a silently failed reset leaves the shared dev
        // account in organiser mode and breaks the other specs.
        const reset = await admin.request.patch("/api/admin/update-user", {
          data: { userId, workspacePrefs: null },
        });
        expect(reset.ok(), await reset.text()).toBe(true);

        const after = await admin.request.get("/api/admin/users");
        expect(after.ok(), "the reset must be verifiable").toBe(true);
        const { users: usersAfter } = (await after.json()) as {
          users: { user_id: string; workspace_prefs?: unknown }[];
        };
        const rowAfter = usersAfter.find((u) => u.user_id === userId);
        expect(rowAfter, "the e2e user's profile row must still exist").toBeTruthy();
        expect(rowAfter?.workspace_prefs, "workspace_prefs must be exactly {}").toEqual({});
      }
    } finally {
      await admin.close();
    }
  });
});
