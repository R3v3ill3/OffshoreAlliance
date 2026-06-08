import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

await runClip({
  id: "A4",
  title: "Create a campaign — the manual way",
  summary: "Create a campaign via Manual create (not the wizard) and land in Settings.",
  tags: ["create campaign", "manual", "new campaign", "bargaining", "campaign type", "status"],
  associatedRoutes: ["/campaigns", "/campaigns/new/manual"],
  routeWeight: 10,
  prerequisites: ["A1", "A2", "A3"],
  upNext: ["A5", "A3", "B1"],
  upNextLabels: ["Configure from Settings", "Import workers", "Organising units"],
  cleanup: [{ table: "campaigns", column: "name", value: CAMPAIGN }],
  startUrl: "/campaigns",
  readySelector: 'button:has-text("Create campaign")',
  segments: [
    "Ready to start organising? You can create a campaign in seconds.",
    "Click Create campaign. Notice there are two paths.",
    "We'll take the manual path. The guided wizard is a separate guide.",
    "Give the campaign a name.",
    "Set the type and status. Bargaining, and Planning.",
    "Then click Create and open settings.",
    "Your campaign is created, and you land on its Settings page to configure it.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 300, { steps: 16 }); await page.mouse.move(700, 420, { steps: 14 }); },
    async (page, ctx) => {
      const btn = page.locator('button:has-text("Create campaign")').first();
      await ctx.move(btn); await page.waitForTimeout(800); await btn.click();
      await page.waitForSelector('button:has-text("Manual create")', { timeout: 10000 });
    },
    async (page, ctx) => {
      const man = page.locator('button:has-text("Manual create")').first();
      await ctx.move(man); await page.waitForTimeout(700); await man.click();
      await page.waitForSelector('input[placeholder="e.g. Acme EBA 2026"]', { timeout: 12000 });
    },
    async (page, ctx) => {
      const f = page.locator('input[placeholder="e.g. Acme EBA 2026"]').first();
      await ctx.move(f); await f.click(); await page.keyboard.type(CAMPAIGN, { delay: 40 });
    },
    async (page, ctx) => {
      // type + status already default to Bargaining / Planning — point them out
      const t = page.locator('button:has-text("Bargaining")').first();
      await ctx.move(t); await page.waitForTimeout(600);
      const s = page.locator('button:has-text("Planning")').first();
      await ctx.move(s); await page.waitForTimeout(600);
    },
    async (page, ctx) => {
      const create = page.locator('button:has-text("Create and open settings")').first();
      await ctx.move(create); await page.waitForTimeout(900); await create.click();
      await page.waitForTimeout(2500);
    },
    async (page) => { await page.mouse.move(900, 360, { steps: 16 }); },
  ],
});
