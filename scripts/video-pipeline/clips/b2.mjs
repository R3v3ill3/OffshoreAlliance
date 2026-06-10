import { runClip } from "../lib/clip.mjs";

// B2 — Create organising units and groups.
// Campaign Units tab: "Add unit" opens a single-screen form (Name, Type,
// Estimated, Target, Commonality, Anchor → Save); each unit card carries a
// rule-based "Assignment rules" row (Include / Occupation / contains / value →
// Add rule); "New group" bundles units of one type. Cleanup removes any prior
// demo unit so re-runs don't duplicate.
const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
const UNIT_NAME = "Cranes & Rigging (DEMO)";

await runClip({
  id: "B2",
  title: "Create organising units and groups",
  summary:
    "Build a campaign's organising units — add a single unit, let it auto-fill by rule, and bundle several units into a group.",
  tags: ["create unit", "organising unit", "group", "campaign units", "assignment rules", "shift", "work area"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["B1"],
  upNext: ["B3", "C1", "B1"],
  upNextLabels: ["Allocate workers", "The wall chart", "Units explained"],
  cleanup: [{ table: "campaign_organising_units", column: "name", value: UNIT_NAME }],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=campaign-units`;
  },
  readySelector: "text=Campaign units",
  segments: [
    "Organising units slice your workforce into blocks you can organise — by shift, department, work area, or crew.",
    "Add a unit. Give it a name, pick a type, and an estimated size.",
    "Save it, and it joins your campaign units straight away.",
    "Each unit can fill itself by rule — for example, include every worker whose occupation contains a keyword.",
    "And use New group to bundle several units of the same type under one header.",
  ],
  steps: [
    // 0 — tour the units tab.
    async (page) => {
      await page.mouse.move(740, 300, { steps: 16 });
      await page.mouse.move(620, 470, { steps: 14 });
    },
    // 1 — open Add unit and fill the form.
    async (page, ctx) => {
      const add = page.locator('button:has-text("Add unit")').first();
      await ctx.move(add); await page.waitForTimeout(400); await add.click().catch(() => {});
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {});
      const inputs = page.locator('[role="dialog"] input');
      const name = inputs.nth(0);
      if (await name.count()) { await name.click().catch(() => {}); await page.keyboard.type(UNIT_NAME, { delay: 35 }); }
      // Type select (first combobox in the dialog)
      const typeSel = page.locator('[role="dialog"] button[role="combobox"]').first();
      if (await typeSel.count()) {
        await ctx.move(typeSel).catch(() => {}); await typeSel.click().catch(() => {});
        await page.waitForSelector('[role="option"]', { timeout: 2000 }).catch(() => {});
        const opt = page.locator('[role="option"]:has-text("Work area")').first();
        if (await opt.count()) await opt.click().catch(() => {}); else await page.keyboard.press("Escape").catch(() => {});
      }
      const est = inputs.nth(1);
      if (await est.count()) { await est.click().catch(() => {}); await page.keyboard.type("6", { delay: 40 }); }
    },
    // 2 — save; reveal the new unit.
    async (page, ctx) => {
      const save = page.locator('[role="dialog"] button:has-text("Save")').first();
      if (await save.count()) { await ctx.move(save); await page.waitForTimeout(400); await save.click().catch(() => {}); }
      await page.waitForTimeout(1200);
      const card = page.locator(`text=${UNIT_NAME}`).first();
      if (await card.count()) await card.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
    },
    // 3 — the rule-based auto-assignment row.
    async (page, ctx) => {
      const inc = page.locator('button[role="combobox"]:has-text("Include")').first();
      if (await inc.count()) { await inc.scrollIntoViewIfNeeded().catch(() => {}); await ctx.move(inc).catch(() => {}); await page.waitForTimeout(500); }
      const occ = page.locator('button[role="combobox"]:has-text("Occupation")').first();
      if (await occ.count()) await ctx.move(occ).catch(() => {});
      await page.waitForTimeout(300);
      const addRule = page.locator('button:has-text("Add rule")').first();
      if (await addRule.count()) await ctx.move(addRule).catch(() => {});
    },
    // 4 — groups.
    async (page, ctx) => {
      const ng = page.locator('button:has-text("New group")').first();
      if (await ng.count()) { await ng.scrollIntoViewIfNeeded().catch(() => {}); await ctx.move(ng).catch(() => {}); }
      await page.waitForTimeout(500);
    },
  ],
});
