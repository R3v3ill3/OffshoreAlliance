import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function expand(page, ctx, label) {
  const sec = page.locator(`text="${label}"`).first();
  await ctx.move(sec);
  await sec.click().catch(() => {});
}

await runClip({
  id: "A5",
  title: "Configure a campaign from Settings",
  summary: "Tour the campaign Settings accordion; each section saves independently.",
  tags: ["campaign settings", "configure", "accordion", "basics", "ambitions", "worker estimate"],
  associatedRoutes: ["/campaigns/*/settings"],
  routeWeight: 9,
  prerequisites: ["A4"],
  upNext: ["B1", "A4", "A3"],
  upNextLabels: ["Organising units", "Create a campaign", "Import workers"],
  startUrl: async ({ get }) => {
    const rows = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    const row = Array.isArray(rows) ? rows[0] : null;
    const id = row?.campaign_id ?? row?.id;
    if (!id) throw new Error("A5: demo campaign not found — run A4 first");
    return `/campaigns/${id}/settings`;
  },
  readySelector: 'text="Basics"',
  segments: [
    "Settings is your campaign's control panel. Fill it in any order. Each section saves on its own.",
    "Start with Basics, for the description, start date, and timeframe.",
    "Employers and worksites links the companies and sites you're organising.",
    "Worker estimate records how many workers you expect.",
    "Campaign units and Allocate workers structure your workforce. Each has its own guide.",
    "And Campaign ambitions captures your goals. That's your campaign, configured.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 280, { steps: 16 }); await page.mouse.move(700, 360, { steps: 14 }); },
    async (page, ctx) => { await expand(page, ctx, "Basics"); await page.waitForTimeout(800); },
    async (page, ctx) => { await expand(page, ctx, "Basics"); await expand(page, ctx, "Employers & worksites"); await page.waitForTimeout(600); },
    async (page, ctx) => { await expand(page, ctx, "Employers & worksites"); await expand(page, ctx, "Worker estimate"); await page.waitForTimeout(600); },
    async (page, ctx) => { await ctx.move(page.locator('text="Campaign units"').first()); await page.waitForTimeout(700); await ctx.move(page.locator('text="Allocate workers"').first()); },
    async (page, ctx) => { await ctx.move(page.locator('text="Campaign ambitions"').first()); await page.waitForTimeout(700); },
  ],
});
