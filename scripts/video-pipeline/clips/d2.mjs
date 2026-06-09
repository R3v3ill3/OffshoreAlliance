import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

await runClip({
  id: "D2",
  title: "Phone tasking: build a call list & scripts",
  summary: "Create a call list in the 5-step wizard — details, build, call order, and script.",
  tags: ["phone", "call list", "script", "call order", "priority", "dialer setup"],
  associatedRoutes: ["/campaigns/*/phone", "/campaigns/*/phone/lists/*"],
  routeWeight: 9,
  prerequisites: ["C3"],
  upNext: ["D3", "D1", "D4"],
  upNextLabels: ["Run a calling session", "Email tasking", "Activist tasking"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}/phone`;
  },
  readySelector: 'button:has-text("New Call List")',
  segments: [
    "Phone banking, organised. The Phone hub holds your call lists, scripts, and the call report.",
    "Click New Call List to start the five-step builder.",
    "Give the list a name, and describe who's on it.",
    "Build the list with filters. By rating, worksite, or membership.",
    "Set the call order. Sequential, by rating, or least recently contacted.",
    "Attach a script, then review and create your list. Next, let's make the calls.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 300, { steps: 16 }); await page.mouse.move(700, 460, { steps: 14 }); },
    async (page, ctx) => {
      const b = page.locator('button:has-text("New Call List")').first();
      await ctx.move(b); await page.waitForTimeout(700); await b.click();
      await page.waitForSelector('input[placeholder*="Phone Outreach"], input[placeholder*="Stage 1"]', { timeout: 10000 }).catch(() => {});
    },
    async (page, ctx) => {
      const name = page.locator('input[placeholder*="Phone Outreach"], input[placeholder*="Stage 1"]').first();
      if (await name.count()) { await ctx.move(name); await name.click(); await page.keyboard.type("EBA outreach — Day shift (DEMO)", { delay: 40 }); }
      const desc = page.locator('textarea[placeholder*="Brief description"]').first();
      if (await desc.count()) { await desc.click(); await page.keyboard.type("Day shift workers to call about the EBA.", { delay: 25 }); }
    },
    async (page, ctx) => { const n = page.locator('button:has-text("Next")').first(); await ctx.move(n); await page.waitForTimeout(500); await n.click().catch(() => {}); await page.waitForTimeout(800); },
    async (page, ctx) => { const n = page.locator('button:has-text("Next")').first(); await ctx.move(n); await page.waitForTimeout(500); await n.click().catch(() => {}); await page.waitForTimeout(800); },
    async (page, ctx) => {
      const n = page.locator('button:has-text("Next")').first();
      if (await n.count()) { await ctx.move(n); await n.click().catch(() => {}); await page.waitForTimeout(900); }
      const create = page.locator('button:has-text("Create")').first();
      if (await create.count()) await ctx.move(create).catch(() => {});
      await page.waitForTimeout(600);
    },
  ],
});
