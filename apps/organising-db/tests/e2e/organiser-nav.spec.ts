import { expect, test } from "@playwright/test";

import {
  NO_ADMIN_CREDENTIALS_MESSAGE,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";
import {
  findE2EUserId,
  openAdminContext,
  readUserPrefs,
  restoreUserPrefs,
  setUserMode,
  withUserMode,
} from "./workspace-mode";

/**
 * WP1.2: navigation driven by the workspace module registry.
 *
 * Test 1 is the zero-change-in-full-mode criterion measured in a browser —
 * the suite pins the e2e account to full mode first (`withUserMode`), so the
 * rendered order and labels must equal today's sidebar. Test 2 is the
 * organiser-mode round trip:
 * an admin flips the e2e user into organiser mode through WP1.1's own write
 * path, the user reloads, and the four primary items, the collapsed
 * Organisation disclosure and the Show everything control must be there.
 *
 * Every selector is an anchor the product already relies on — the aside's
 * nav, the label spans, `aria-expanded` on the disclosure and `aria-pressed`
 * on the toggle. No data-testid is added to production markup.
 *
 * Test 2 writes to the shared dev database, so its `finally` ALWAYS puts the
 * account's previous `workspace_prefs` back: leaving the user in organiser
 * mode would change what wall-chart.spec.ts sees on /campaigns on the next
 * run. It restores what was recorded rather than clearing to `{}`, which was
 * only ever right by accident (tests/e2e/workspace-mode.ts).
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
  "Surveys & Forms",
  "Guides",
];

test.describe("Sidebar — full mode is today's sidebar", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  // "Full mode" is the precondition, not a property of the account: with no
  // per-user override the e2e account follows the org-wide default for its
  // work role, which an admin can change in the app at any time. Pin it.
  withUserMode("full");

  test("the eleven rows, in order, with no organiser-mode furniture", async ({ page }) => {
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
    const admin = await openAdminContext(browser);

    try {
      // GET /api/admin/users joins auth.admin.listUsers, so every profile
      // carries an `email` to match the e2e user on.
      const userId = await findE2EUserId(admin);
      if (!userId) return;
      // What to put back afterwards — whatever is there now, which is not
      // necessarily `{}`.
      const previousPrefs = await readUserPrefs(admin, userId);

      try {
        // WP1.1's validated write path: workspacePrefsSchema parses the body
        // before the service-role client touches the column.
        await setUserMode(admin, userId, "organiser");

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
        // Put back exactly what was recorded above — not `{}`, which would
        // erase a deliberate per-user override an operator had set.
        // Idempotent, so a re-run after a crash also restores the account.
        // Asserted inside the helper, not fire-and-forget: a silently failed
        // reset leaves the shared dev account in organiser mode and breaks
        // wall-chart.spec.ts on the next run — exactly the failure risk R8
        // names. The helper also reads the value back from GET
        // /api/admin/users and requires the profile row to still exist, so a
        // deleted user or a changed response shape cannot pass as "restored".
        await restoreUserPrefs(admin, userId, previousPrefs);
      }
    } finally {
      await admin.close();
    }
  });
});
