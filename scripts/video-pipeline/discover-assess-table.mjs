import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
await login(await ctx.newPage());
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE_URL}/campaigns/3?tab=workforce&sub=assessments`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=EBA support check", { timeout: 30000 });
await page.waitForTimeout(1200);
// expand the assessment to reveal the per-worker table (click its header/row)
await page.locator("text=EBA support check").first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(DISC, "assess_table.png"), fullPage: true });
const info = await page.evaluate(() => {
  const txt = (e) => (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
  // find any seeded worker name row
  const row = Array.from(document.querySelectorAll("tr,[role=row]")).find((r) => /Smith|Nguyen|Liam|Olivia/.test(r.textContent || ""));
  return {
    rowFound: !!row,
    rowText: row ? txt(row) : null,
    rowButtons: row ? Array.from(row.querySelectorAll("button,[role=button],[role=combobox]")).map(txt).slice(0, 12) : [],
    tables: document.querySelectorAll("table").length,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
console.log("ASSESS_TABLE_DONE");
