import { BASE_URL, EMAIL, PASSWORD } from "../config.mjs";

/**
 * Robust login to the develop preview. Verifies it actually left /login, and
 * retries (auth can be flaky / slow in automation). Returns true on success.
 */
export async function login(page, { retries = 2 } = {}) {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set OA_DEMO_EMAIL and OA_DEMO_PASSWORD environment variables.");
  }
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    // Already authenticated? (app redirects /login -> /campaigns)
    if (!page.url().includes("/login")) return true;

    await page.locator('input#email, input[type="email"]').first().fill(EMAIL);
    await page.locator('input#password, input[type="password"]').first().fill(PASSWORD);
    await page
      .locator('button:has-text("Sign in"), button[type="submit"], button:has-text("Sign In")')
      .first()
      .click();

    try {
      await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 22000 });
      await page.waitForTimeout(1500);
      return true;
    } catch {
      const msg = await page
        .locator("text=/invalid|incorrect|wrong|error|failed|too many/i")
        .first()
        .innerText()
        .catch(() => null);
      console.log(`  login attempt ${attempt} did not leave /login (msg: ${msg ?? "none"})`);
    }
  }
  return false;
}
