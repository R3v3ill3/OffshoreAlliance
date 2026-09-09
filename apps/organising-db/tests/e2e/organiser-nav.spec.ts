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
 * WP1.2: navigation driven by the workspace module registry.
 *
 * Test 1 is the zero-change-in-full-mode criterion measured in a browser —
 * every account resolves to full mode by default, so the rendered order and
 * labels must equal today's sidebar. Test 2 is the organiser-mode round trip:
 * an admin flips the e2e user into organiser mode through WP1.1's own write
 * path, the user reloads, and the four primary items, the collapsed
 * Organisation disclosure and the Show everything control must be there.
 *
 * Every selector is an anchor the product already relies on — the aside's
 * nav, the label spans, `aria-expanded` on the disclosure and `aria-pressed`
 * on the toggle. No data-testid is added to production markup.
 *
 * Test 2 writes to the shared dev database, so its `finally` ALWAYS clears
 * the override again: leaving the user in organiser mode would change what
 * wall-chart.spec.ts sees on /campaigns on the next run.
 */

/** The label spans; the unread badge is the only other span and it is aria-labelled. */
const LABELS = "aside nav a > span:not([aria-label])";

const FULL_MODE_LABELS = [
  "Campaigns",
  "Dashboard",
  "Overview",
  "Worksites",
  "Upcoming Projects",
  "Email Inbox",
  "Actions",
  "SMS Inbox",
  "Reports",
  "Guides",
];

test.describe("Sidebar — full mode is today's sidebar", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("the ten rows, in order, with no organiser-mode furniture", async ({ page }) => {
    await page.goto("/campaigns");
    await expect(page.locator(LABELS).first()).toBeVisible();

    expect(await page.locator(LABELS).allTextContents()).toEqual(FULL_MODE_LABELS);
    await expect(page.getByRole("button", { name: "Show everything" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Organisation" })).toHaveCount(0);
  });
});

test.describe("Sidebar — the organiser-mode round trip", () => {
  test.skip(
    !hasE2ECredentials || !hasE2EAdminCredentials,
    `${NO_CREDENTIALS_MESSAGE} ${NO_ADMIN_CREDENTIALS_MESSAGE}`
  );

  test("organiser mode shows four primary items, Organisation and Show everything", async ({
    page,
    browser,
  }) => {
    // A second context signed in as the dev admin, from the storage state
    // global setup already wrote. No credentials are typed into a form here.
    // `browser.newContext()` does not inherit the config's `use` block, so
    // baseURL is passed explicitly for the relative API paths below.
    const admin = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: resolve(__dirname, "../..", ADMIN_STORAGE_STATE),
    });

    try {
      // GET /api/admin/users joins auth.admin.listUsers, so every profile
      // carries an `email` to match the e2e user on.
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
        // WP1.1's validated write path: workspacePrefsSchema parses the body
        // before the service-role client touches the column.
        const set = await admin.request.patch("/api/admin/update-user", {
          data: { userId, workspacePrefs: { mode: "organiser" } },
        });
        expect(set.ok(), await set.text()).toBeTruthy();

        // A full reload is required: AuthProvider caches workspace_prefs with
        // the profile at sign-in, so a client-side navigation keeps the old
        // value.
        await page.goto("/campaigns");
        await page.reload();

        const nav = page.locator("aside nav");
        await expect(nav.getByRole("link", { name: "My campaigns" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Actions" })).toBeVisible();
        // The unread badge is inside the link and carries its own aria-label,
        // so the link's accessible name is "Inbox <n> unread email
        // conversations" whenever the account has unread mail. Anchor on the
        // start of the name instead, which also keeps it distinct from
        // "SMS Inbox".
        await expect(nav.getByRole("link", { name: /^Inbox/ })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Guides" })).toBeVisible();
        expect(await page.locator(LABELS).allTextContents()).toEqual([
          "My campaigns",
          "Actions",
          "Inbox",
          "Guides",
        ]);

        // The Organisation section is a disclosure, collapsed on first render.
        const organisation = nav.getByRole("button", { name: "Organisation" });
        await expect(organisation).toHaveAttribute("aria-expanded", "false");
        await organisation.click();
        await expect(organisation).toHaveAttribute("aria-expanded", "true");

        // Modules that are merely off are muted with the reason, not links.
        await expect(nav.getByText("Ask an admin to enable").first()).toBeAttached();
        await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);

        // "Show everything" is the out: one click restores the full sidebar.
        const showEverything = page.getByRole("button", { name: "Show everything" });
        await expect(showEverything).toHaveAttribute("aria-pressed", "false");
        await showEverything.click();
        await expect(showEverything).toHaveAttribute("aria-pressed", "true");
        await expect(nav.getByRole("link", { name: "SMS Inbox" })).toBeVisible();
        expect(await page.locator(LABELS).allTextContents()).toEqual(FULL_MODE_LABELS);
      } finally {
        // `null` parses to `{}` and clears the override. Idempotent, so a
        // re-run after a crash also restores the account. Asserted, not
        // fire-and-forget: a silently failed reset leaves the shared dev
        // account in organiser mode and breaks wall-chart.spec.ts on the next
        // run — exactly the failure risk R8 names.
        const reset = await admin.request.patch("/api/admin/update-user", {
          data: { userId, workspacePrefs: null },
        });
        expect(reset.ok(), await reset.text()).toBe(true);

        // Read it back from the same route the test used to find the user:
        // GET /api/admin/users selects * from user_profiles, so the cleared
        // column comes back as {}.
        const after = await admin.request.get("/api/admin/users");
        expect(after.ok(), "the reset must be verifiable").toBe(true);
        const { users: usersAfter } = (await after.json()) as {
          users: { user_id: string; workspace_prefs?: unknown }[];
        };
        // The row itself must still be there. `?? {}` on a missing row would
        // have passed this assertion for a user who had been deleted, or for
        // a response shape change that dropped `workspace_prefs` entirely —
        // neither of which is "the override was cleared".
        const rowAfter = usersAfter.find((u) => u.user_id === userId);
        expect(rowAfter, "the e2e user's profile row must still exist").toBeTruthy();
        // `?.` and no `?? {}` fallback: if the row is missing this reads
        // `undefined`, which does not equal `{}`, so the assertion bites.
        expect(rowAfter?.workspace_prefs, "workspace_prefs must be exactly {}").toEqual({});
      }
    } finally {
      await admin.close();
    }
  });
});
