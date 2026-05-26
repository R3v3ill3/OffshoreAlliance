/**
 * Playwright happy-path spec for the mobile shareable dialer.
 *
 * This spec is intentionally checked in even though Playwright is not yet
 * wired into CI. It documents the end-to-end behaviour expected of
 * `/call/[token]` and acts as a starting point once the runner is added.
 *
 * To run locally once Playwright is installed:
 *
 *   pnpm dlx playwright install chromium
 *   pnpm dlx playwright test apps/organising-db/tests/e2e/mobile-dialer.spec.ts
 *
 * The spec assumes:
 *   - The dev server is running on http://localhost:3000.
 *   - A test share token has been seeded and exposed as
 *     `MOBILE_DIALER_TEST_TOKEN`.
 *   - The token's password is exposed as `MOBILE_DIALER_TEST_PASSWORD`.
 *
 * Each section below maps 1:1 to a stage of the dialer flow.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const test: any;
declare const expect: any;

const TOKEN = process.env.MOBILE_DIALER_TEST_TOKEN;
const PASSWORD = process.env.MOBILE_DIALER_TEST_PASSWORD;

test.describe("Mobile dialer — happy path", () => {
  test.skip(!TOKEN || !PASSWORD, "Test token/password not set");

  test("volunteer can sign in, claim, dial, record outcome, advance", async ({
    page,
  }: {
    page: any;
  }) => {
    await page.goto(`/call/${TOKEN}`);

    // Password gate
    await page.getByLabel(/Your name/i).fill("E2E volunteer");
    await page.getByLabel(/Password/i).fill(PASSWORD!);
    await page.getByRole("button", { name: /Start calling/i }).click();

    // Queue → fetch next
    await expect(page.getByText(/Queue/i)).toBeVisible();
    await page.getByRole("button", { name: /Get next contact/i }).click();

    // Contact card
    await expect(page.getByText(/Now calling|Contact/i)).toBeVisible();
    // The OS dial intent fires tel:; in Playwright Chromium that becomes a
    // navigation to an unknown protocol — clicking the call button still
    // dispatches the dialer's `onCallPlaced` regardless.
    await page.getByRole("button", { name: /Call /i }).click();

    // In-call: pick dial disposition
    await page.getByRole("radio", { name: /Connected/i }).click();

    // Pick outcome
    await page.getByRole("radio", { name: /Interested, undecided/i }).click();

    // Save
    await page.getByRole("button", { name: /Save & next contact/i }).click();

    // Back at the queue or auto-grabbing next — either is acceptable, but
    // the "Now calling" view must clear.
    await expect(page.getByText(/Now calling/i)).not.toBeVisible({ timeout: 10_000 });
  });
});
