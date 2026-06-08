import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

await runClip({
  id: "C3",
  title: "Build a list and fire it",
  summary: "Build a worker list on the wall chart, set a purpose, and fire it into a tasking pathway.",
  tags: ["build list", "fire", "drag", "purpose", "email", "phone", "activist task", "recipients"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["C1"],
  upNext: ["D1", "D2", "D4"],
  upNextLabels: ["Email tasking", "Phone tasking", "Activist tasking"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=wall-chart`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "This is the hinge. Turn what you see into action.",
    "Open the Build list panel.",
    "Give your list a name.",
    "Drag a worker, or a whole unit, into the list.",
    "Choose a purpose. Email, phone, or an activist task.",
    "Then fire it, and you jump straight into the right tool. Let's look at each next.",
  ],
  steps: [
    async (page) => { await page.mouse.move(880, 320, { steps: 14 }); },
    async (page, ctx) => {
      const b = page.locator('button:has-text("Build list")').first();
      await ctx.move(b); await page.waitForTimeout(700); await b.click();
      await page.waitForSelector("#build-list-name", { timeout: 8000 });
    },
    async (page, ctx) => {
      const n = page.locator("#build-list-name").first();
      await ctx.move(n); await n.click(); await page.keyboard.type("EBA voting push — Day shift", { delay: 40 });
    },
    async (page, ctx) => {
      const card = page.locator("text=Day Shift").first();
      const drop = page.locator("text=/Drop worker tiles/i").first();
      await ctx.move(card);
      try { await card.dragTo(drop, { timeout: 4000 }); } catch {}
      await page.waitForTimeout(400);
    },
    async (page, ctx) => {
      const p = page.locator('button:has-text("Choose later")').first();
      if (await p.count()) { await ctx.move(p); await p.click(); await page.waitForTimeout(800);
        const em = page.locator('[role="option"]:has-text("Email")').first();
        if (await em.count()) await em.click(); else await page.keyboard.press("Escape");
      }
    },
    async (page, ctx) => {
      const fire = page.locator('button:has-text("Fire")').first();
      if (await fire.count()) await ctx.move(fire); else await page.mouse.move(1500, 500, { steps: 12 });
      await page.waitForTimeout(500);
    },
  ],
});
