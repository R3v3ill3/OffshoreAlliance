// Discovery run: log into develop and dump the real DOM controls + screenshots
// for the login page and the /employers add-employer flow, so clip scripts can
// use reliable selectors. Outputs to output/discovery/.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");

async function dumpControls(page) {
  return await page.evaluate(() => {
    const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
    const q = (sel) => Array.from(document.querySelectorAll(sel));
    return {
      url: location.href,
      title: document.title,
      buttons: q('button, [role="button"], a[href]')
        .map((b) => ({
          tag: b.tagName.toLowerCase(),
          text: txt(b),
          id: b.id || null,
          testid: b.getAttribute("data-testid") || null,
          aria: b.getAttribute("aria-label") || null,
          href: b.getAttribute("href") || null,
        }))
        .filter((b) => b.text || b.aria)
        .slice(0, 150),
      inputs: q("input, textarea, select").map((i) => ({
        tag: i.tagName.toLowerCase(),
        type: i.getAttribute("type") || null,
        name: i.getAttribute("name") || null,
        id: i.id || null,
        placeholder: i.getAttribute("placeholder") || null,
        aria: i.getAttribute("aria-label") || null,
        testid: i.getAttribute("data-testid") || null,
      })),
      dialogText: q('[role="dialog"]').map((d) => txt(d).slice(0, 400)),
    };
  });
}

async function snap(page, name) {
  await fs.writeFile(path.join(DISC, `${name}.json`), JSON.stringify(await dumpControls(page), null, 2));
  await page.screenshot({ path: path.join(DISC, `${name}.png`), fullPage: false });
  console.log(`  wrote ${name}.json + .png  (${page.url()})`);
}

await fs.mkdir(DISC, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

console.log("1) landing / login page");
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await snap(page, "01-landing");

console.log("2) logging in");
const did = await login(page);
console.log("   login performed:", did);
await page.waitForTimeout(2500);
await snap(page, "02-after-login");

console.log("3) /employers");
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await snap(page, "03-employers");

console.log("4) Add Employer dialog");
const addBtn = page.locator('button:has-text("Add Employer")').first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(1800);
  await snap(page, "04-add-employer-dialog");
} else {
  console.log('   "Add Employer" button not found by text — see 03-employers.json for candidates');
}

await browser.close();
console.log("DISCOVERY_DONE ->", DISC);
