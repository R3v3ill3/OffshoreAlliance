// Follow-up discovery: find where "Add Employer" actually lives (likely /overview),
// and confirm whether employer data loads on /employers after a longer wait.
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
      buttons: q('button, [role="button"], [role="tab"], a[href]')
        .map((b) => ({ tag: b.tagName.toLowerCase(), role: b.getAttribute("role") || null, text: txt(b), aria: b.getAttribute("aria-label") || null, href: b.getAttribute("href") || null }))
        .filter((b) => b.text || b.aria)
        .slice(0, 200),
      inputs: q("input, textarea, select").map((i) => ({ type: i.getAttribute("type") || null, name: i.getAttribute("name") || null, id: i.id || null, placeholder: i.getAttribute("placeholder") || null })),
      dialogText: q('[role="dialog"]').map((d) => txt(d).slice(0, 500)),
    };
  });
}
async function snap(page, name) {
  await fs.writeFile(path.join(DISC, `${name}.json`), JSON.stringify(await dumpControls(page), null, 2));
  await page.screenshot({ path: path.join(DISC, `${name}.png`), fullPage: false });
  console.log(`  wrote ${name}  (${page.url()})`);
}

await fs.mkdir(DISC, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

await login(page);

console.log("A) /overview");
await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
await snap(page, "10-overview");

// Look for an Employers tab and click it
for (const label of ["Employers", "Employer"]) {
  const tab = page.locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`).first();
  if (await tab.count()) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(2500);
    await snap(page, "11-overview-employers-tab");
    break;
  }
}

// Hunt for any "Add Employer" / "Add" button now visible
const addCandidates = await page.locator('button:has-text("Add"), [role="button"]:has-text("Add")').allInnerTexts().catch(() => []);
console.log("   Add-button candidates:", JSON.stringify(addCandidates));

const addEmp = page.locator('button:has-text("Add Employer")').first();
if (await addEmp.count()) {
  await addEmp.scrollIntoViewIfNeeded().catch(() => {});
  await addEmp.click();
  await page.waitForTimeout(1800);
  await snap(page, "12-add-employer-dialog");
  console.log("   OPENED Add Employer dialog on /overview");
} else {
  console.log('   "Add Employer" still not found on /overview employers tab');
}

console.log("B) /employers with longer wait (data load check)");
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const recordsText = await page.locator("text=/records/").first().innerText().catch(() => "n/a");
console.log("   records line:", recordsText);
await snap(page, "13-employers-after-wait");

await browser.close();
console.log("DISCOVERY2_DONE");
