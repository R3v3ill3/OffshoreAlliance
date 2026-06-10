import { runClip } from "../lib/clip.mjs";
import { BASE_URL } from "../config.mjs";
import path from "node:path";
import { OUT } from "../config.mjs";

// A3 — Import workers from a list (Excel).
// The 11-step Worker Import Wizard (/workers → Import Workers): Upload → Map
// Columns (auto-mapped) → Map Values (membership) → Employer → Worksites →
// Occupations → Review → Dedup → Confirm → Start Import → Done. This clip drives
// the substantive mapping steps and narrates the rest; the step rail conveys the
// full journey. Uses the committed dummy file (self-contained — creates workers).
const DUMMY = path.resolve(OUT, "../../../apps/organising-db/public/excel_worker_import_dummy_1.xlsx");

// Map any unmapped membership-value dropdowns to a real category (prefer
// "Non-member"; never the leading "ignore" option) so the step reads as
// complete on camera.
async function mapEmptyValues(page) {
  const combos = page.locator('[role="dialog"] button[role="combobox"]');
  const n = await combos.count();
  for (let i = 0; i < n; i++) {
    const cb = combos.nth(i);
    const txt = (await cb.innerText().catch(() => "")).trim();
    if (txt && !/^(select|choose|—|\s*|ignore)/i.test(txt)) continue; // already mapped to a real value
    await cb.click().catch(() => {});
    await page.waitForTimeout(250);
    let opt = page.locator('[role="option"]').filter({ hasText: /Non-?member/i }).first();
    if (!(await opt.count())) opt = page.locator('[role="option"]').nth(1); // skip the leading "ignore"
    if (await opt.count()) await opt.click().catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
}

await runClip({
  id: "A3",
  title: "Import workers from a list (Excel)",
  summary:
    "Run the worker import wizard end to end — upload a spreadsheet, let it auto-map your columns, map values and an employer, and import (with duplicate checking).",
  tags: ["import", "workers", "excel", "spreadsheet", "upload", "column mapping", "dedup", "members"],
  associatedRoutes: ["/workers", "/workers/*"],
  routeWeight: 10,
  prerequisites: ["A1", "A2"],
  upNext: ["A4", "A5", "B1"],
  upNextLabels: ["Create a campaign", "Configure settings", "Units explained"],
  startUrl: "/workers",
  readySelector: 'button:has-text("Import Workers")',
  segments: [
    "Got your members in a spreadsheet? Import the whole list at once. From Workers, choose Import Workers.",
    "Drop in your Excel file, and the wizard reads it straight away.",
    "It maps your columns for you — name, email, worksite, occupation. You only fix the exceptions, then continue.",
    "Then map your spreadsheet's own values, like membership status, onto your database's categories.",
    "From here the wizard walks you through the employer, the worksites and occupations, and a review of every row.",
    "It checks for duplicates and imports — adding new workers, and updating the ones you already have.",
  ],
  steps: [
    // 0 — open the wizard (shows the 11-step rail).
    async (page, ctx) => {
      const b = page.locator('button:has-text("Import Workers")').first();
      await ctx.move(b); await page.waitForTimeout(500); await b.click().catch(() => {});
      await page.waitForSelector('input[type="file"]', { timeout: 8000 }).catch(() => {});
      await page.mouse.move(720, 230, { steps: 12 }); // glance along the step rail
    },
    // 1 — upload the spreadsheet.
    async (page) => {
      const input = page.locator('input[type="file"]').first();
      if (await input.count()) await input.setInputFiles(DUMMY).catch(() => {});
      await page.waitForSelector('button:has-text("Continue")', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    // 2 — column mapping: show the auto-map, then continue.
    async (page, ctx) => {
      await page.mouse.move(760, 380, { steps: 16 });
      await page.mouse.move(700, 470, { steps: 12 });
      const cont = page.locator('[role="dialog"] button:has-text("Continue")').first();
      if (await cont.count()) { await ctx.move(cont); await page.waitForTimeout(400); await cont.click().catch(() => {}); }
      await page.waitForTimeout(900);
    },
    // 3 — value mapping (membership): resolve the unmapped values cleanly.
    async (page) => {
      await page.mouse.move(740, 360, { steps: 14 });
      await mapEmptyValues(page);
      await page.mouse.move(700, 300, { steps: 12 });
      await page.waitForTimeout(400);
    },
    // 4 — narrate the rest: glance at the step rail + the "Select Employer" gate.
    async (page, ctx) => {
      await page.mouse.move(560, 230, { steps: 14 });
      await page.mouse.move(820, 230, { steps: 14 });
      const sel = page.locator('[role="dialog"] button:has-text("Select Employer")').first();
      if (await sel.count()) await ctx.move(sel).catch(() => {});
    },
    // 5 — settle on the wizard for the dedup/import narration.
    async (page) => {
      await page.mouse.move(700, 360, { steps: 14 });
      await page.waitForTimeout(500);
    },
  ],
});
