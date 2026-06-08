// Test whether disabling background timer throttling lets Supabase getSession
// finish within the app's 12s auth-context-init window.
import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, VIEWPORT, OUT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
  ],
});
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on("console", (m) => {
  const t = m.text();
  if (/timeout|getSession|connection-monitor|lock|reconnect/i.test(t)) console.log("  C:", t.slice(0, 200));
});

const ok = await login(page);
console.log("login:", ok, "->", page.url());
await page.bringToFront().catch(() => {});

await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.bringToFront().catch(() => {});
await page.waitForTimeout(12000);

const s = await page.evaluate(() => ({
  visibility: document.visibilityState,
  records: (document.body.innerText.match(/(\d+)\s+records/i) || [])[0] || null,
  addBtn: !!Array.from(document.querySelectorAll("button")).find((b) => /add employer/i.test(b.innerText)),
  diag: (() => { try { return JSON.stringify(window.__supabaseFetchDiagnostics?.()?.state); } catch (e) { return "err:" + e.message; } })(),
}));
console.log("STATE (anti-throttle):", JSON.stringify(s));
await page.screenshot({ path: path.join(OUT, "discovery", "42-antithrottle-employers.png") });
await browser.close();
console.log("THROTTLE_TEST_DONE");
