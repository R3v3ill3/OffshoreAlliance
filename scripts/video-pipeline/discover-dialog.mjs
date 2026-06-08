// Capture the Add Employer dialog's real controls (now that the page loads).
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");
await fs.mkdir(DISC, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const loginPage = await ctx.newPage();
await login(loginPage);

const page = await ctx.newPage();
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
// wait for data (Add button) to appear
await page.waitForSelector('button:has-text("Add Employer")', { timeout: 25000 });
console.log("employers loaded, opening dialog…");
await page.locator('button:has-text("Add Employer")').first().click();
await page.waitForTimeout(1500);

const dump = await page.evaluate(() => {
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const dlg = document.querySelector('[role="dialog"]') || document.body;
  const within = (sel) => Array.from(dlg.querySelectorAll(sel));
  return {
    dialogTitle: txt(dlg.querySelector("h1,h2,[role=heading]") || dlg).slice(0, 80),
    inputs: within("input,textarea").map((i) => ({
      type: i.getAttribute("type"), id: i.id || null, name: i.getAttribute("name") || null,
      placeholder: i.getAttribute("placeholder") || null, aria: i.getAttribute("aria-label") || null,
    })),
    // Radix selects render as buttons with role=combobox; labels usually precede them
    comboboxes: within('[role="combobox"], button[aria-haspopup="listbox"], button[aria-haspopup="dialog"]').map((c) => ({
      text: txt(c), aria: c.getAttribute("aria-label") || null, id: c.id || null,
    })),
    labels: within("label").map((l) => ({ text: txt(l), forId: l.getAttribute("for") || null })),
    buttons: within("button").map((b) => ({ text: txt(b), type: b.getAttribute("type") || null })),
  };
});
console.log(JSON.stringify(dump, null, 2));
await page.screenshot({ path: path.join(DISC, "60-add-employer-dialog.png") });
await browser.close();
console.log("DIALOG_DISCOVERY_DONE");
