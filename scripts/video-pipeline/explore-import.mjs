// Exploration v2: drive the worker-import wizard end-to-end with the dummy
// file, using each step's real proceed button. Screenshots + state per step.
import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const FILE = path.resolve(OUT, "../../../apps/organising-db/public/excel_worker_import_dummy_1.xlsx");
const DISC = path.join(OUT, "discovery");

// Ordered candidate proceed buttons (first enabled match wins each iteration).
const PROCEED = [
  "Continue", "Select Employer", "Match Worksites", "Match Occupations",
  "Review Rows", "Proceed to Confirm", "Start Import", "Confirm Import", "Import",
];

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: VIEWPORT });
const lp = await c.newPage();
await login(lp);
const page = await c.newPage();
page.setDefaultTimeout(30000);
await page.goto(`${BASE_URL}/workers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator('button:has-text("Import Workers")').first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.locator('input[type="file"]').first().setInputFiles(FILE).catch((e) => console.log("setInputFiles:", String(e).slice(0, 120)));
await page.waitForTimeout(2500);

async function snap(i) {
  const info = await page.evaluate(() => {
    const active = document.querySelector('[role="dialog"] [data-active="true"], [role="dialog"] .text-primary');
    const buttons = Array.from(document.querySelectorAll('[role="dialog"] button'))
      .map((b) => `${(b.innerText || "").replace(/\s+/g, " ").trim()}${b.disabled ? "[x]" : ""}`).filter((t) => t && t !== "[x]");
    const combos = Array.from(document.querySelectorAll('[role="dialog"] button[role="combobox"]')).map((b) => (b.innerText || "").replace(/\s+/g, " ").trim());
    const note = (document.querySelector('[role="dialog"] p')?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90);
    return { buttons: buttons.slice(0, 16), combos: combos.slice(0, 8), note };
  });
  await page.screenshot({ path: path.join(DISC, `imp_${String(i).padStart(2, "0")}.png`) });
  console.log(`\n[${i}] note="${info.note}"\n    combos=${JSON.stringify(info.combos)}\n    buttons=${JSON.stringify(info.buttons)}`);
  return info;
}

for (let i = 0; i < 14; i++) {
  const info = await snap(i);
  if (info.buttons.some((t) => /done|finish|import complete|imported|view workers/i.test(t)) || /complete|imported/i.test(info.note)) {
    console.log("REACHED DONE/COMPLETE"); break;
  }
  // On the employer step, pick an employer first (combobox or a "Acme" option).
  if (info.buttons.some((t) => /^Select Employer/i.test(t)) === false && info.combos.length && i >= 1) {
    // try selecting an employer if a placeholder combobox exists
    const emptyCombo = page.locator('[role="dialog"] button[role="combobox"]').filter({ hasText: /select|choose|employer/i }).first();
    if (await emptyCombo.count()) {
      await emptyCombo.click().catch(() => {});
      await page.waitForTimeout(500);
      const opt = page.locator('[role="option"]').filter({ hasText: /Acme|DEMO/i }).first();
      if (await opt.count()) { await opt.click().catch(() => {}); console.log("    (picked employer option)"); await page.waitForTimeout(600); }
      else { await page.keyboard.press("Escape").catch(() => {}); }
    }
  }
  let clicked = false;
  for (const label of PROCEED) {
    const btn = page.locator(`[role="dialog"] button:has-text("${label}")`).first();
    if ((await btn.count()) && (await btn.isEnabled().catch(() => false))) {
      await btn.click().catch(() => {});
      console.log(`    -> clicked "${label}"`);
      clicked = true; break;
    }
  }
  if (!clicked) { console.log("    -> stuck (no enabled proceed). buttons above."); break; }
  await page.waitForTimeout(1200);
}
await b.close();
console.log("\nEXPLORE_DONE");
