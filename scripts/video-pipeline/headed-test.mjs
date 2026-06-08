// Test whether running HEADED (visible browser) clears the Supabase auth-lock
// getSession hang that breaks data loading in headless automation.
import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, VIEWPORT, OUT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const browser = await chromium.launch({ headless: false, args: ["--window-size=1920,1080"] });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/timeout|getSession|connection-monitor|lock|error|fail/i.test(t)) console.log("  C:", t.slice(0, 200));
});

const ok = await login(page);
console.log("login:", ok, "->", page.url());

await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);

const s = await page.evaluate(() => ({
  records: (document.body.innerText.match(/(\d+)\s+records/i) || [])[0] || null,
  addBtn: !!Array.from(document.querySelectorAll("button")).find((b) => /add employer/i.test(b.innerText)),
  diag: (() => {
    try {
      return JSON.stringify(window.__supabaseFetchDiagnostics?.()?.state);
    } catch (e) {
      return "err:" + e.message;
    }
  })(),
}));
console.log("STATE (headed):", JSON.stringify(s));
await page.screenshot({ path: path.join(OUT, "discovery", "40-headed-employers.png") });
await browser.close();
console.log("HEADED_TEST_DONE");
