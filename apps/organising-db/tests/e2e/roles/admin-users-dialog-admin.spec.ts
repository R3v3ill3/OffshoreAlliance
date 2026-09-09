import { expect, test } from "@playwright/test";

import { NO_ADMIN_CREDENTIALS_MESSAGE, hasE2EAdminCredentials } from "../env";

/**
 * WP1.1 fix — Administration → Users, the per-user edit dialog must stay
 * usable on a laptop viewport.
 *
 * The WP1.1 workspace section made the dialog ~1490px tall in a 720px-high
 * window with no scroll region of its own, so the footer sat below the fold
 * and Save could not be clicked at all. This asserts the two things that
 * broke: Save is inside the viewport when the dialog opens, and it is still
 * inside the viewport after the module checklist is scrolled to its last row.
 *
 * Lives in `tests/e2e/roles/` and ends in `-admin.spec.ts` because that is
 * what `playwright.config.ts` matches into the `chromium-admin` project —
 * /administration is admin-only, so the E2E_USER session would never see it.
 * Skips cleanly when E2E_ADMIN_* are unset.
 */
test.describe("WP1.1 — Administration → Users edit dialog fits the viewport", () => {
  // A cold preview can take a while to serve /administration.
  test.describe.configure({ timeout: 120_000 });
  test.skip(!hasE2EAdminCredentials, NO_ADMIN_CREDENTIALS_MESSAGE);

  // The reported laptop height. Overrides the project's device viewport only.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Save stays reachable, before and after scrolling the modules", async ({ page }) => {
    await page.goto("/administration");

    // "System Management" → "Users" are the default tabs, so the table is
    // the first thing rendered once the admin users query resolves.
    const editButtons = page.getByTitle("Edit user details");
    await expect(editButtons.first()).toBeVisible({ timeout: 60_000 });
    await editButtons.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Workspace mode")).toBeVisible();

    const save = dialog.getByRole("button", { name: /save changes/i });
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const expectInViewport = async (label: string) => {
      const box = await save.boundingBox();
      expect(box, `${label}: Save Changes has no bounding box`).not.toBeNull();
      if (!box || !viewport) return;
      expect(box.y, `${label}: Save Changes is above the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        `${label}: Save Changes is below the viewport (bottom ${box.y + box.height} > ${viewport.height})`
      ).toBeLessThanOrEqual(viewport.height);
      expect(box.x, `${label}: Save Changes is left of the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${label}: Save Changes is right of the viewport`
      ).toBeLessThanOrEqual(viewport.width);
    };

    await expect(save).toBeVisible();
    await expectInViewport("on open");

    // The last row of the registry (modules.ts) — scrolling to it moves the
    // dialog's own scroll region, which must not move the pinned footer.
    const lastModule = dialog.locator("#edit-user-ws-administration");
    await expect(lastModule).toHaveCount(1);
    await lastModule.scrollIntoViewIfNeeded();

    await expect(save).toBeVisible();
    await expectInViewport("after scrolling the module checklist");

    // Leave the account exactly as it was: Cancel, never Save.
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
  });
});
