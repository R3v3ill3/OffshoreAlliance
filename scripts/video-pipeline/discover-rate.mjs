import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const lp = await ctx.newPage();
await login(lp);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE_URL}/campaigns/3?tab=workforce&sub=wall-chart`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Day Shift", { timeout: 30000 });
await page.waitForTimeout(1500);

// Locate a worker tile by a seeded surname, click it, and dump whatever opens.
const names = ["Smith", "Nguyen", "Jones", "Brown", "Wilson", "Liam", "Olivia"];
let clicked = null;
for (const n of names) {
  const loc = page.locator(`text=${n}`).first();
  if (await loc.count()) {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click().catch(() => {});
    clicked = n;
    break;
  }
}
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const pop = document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]');
  const root = pop || document.body;
  return {
    popoverPresent: !!pop,
    popoverText: pop ? txt(pop).slice(0, 200) : null,
    buttons: Array.from(root.querySelectorAll("button,[role=option],[role=menuitem]")).map((b) => txt(b)).filter(Boolean).slice(0, 30),
  };
});
console.log("clicked tile:", clicked);
console.log(JSON.stringify(after, null, 1));
await page.screenshot({ path: path.join(DISC, "rate_after_click.png") });
await browser.close();
console.log("RATE_DISCOVER_DONE");
