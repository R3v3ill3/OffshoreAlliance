import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function moveText(page, ctx, text) {
  const loc = page.locator(`text=${text}`).first();
  if (await loc.count()) await ctx.move(loc);
}

await runClip({
  id: "C1",
  title: "The wall chart, explained",
  summary: "Read the wall chart: unit cards, worker tiles, colours, badges and empty slots.",
  tags: ["wall chart", "tiles", "colours", "badges", "unit card", "empty slots"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 9,
  prerequisites: ["B1", "E1"],
  upNext: ["C2", "C3", "E1"],
  upNextLabels: ["Filter & sort", "Build a list", "The rating scale"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    const id = r?.[0]?.campaign_id;
    if (!id) throw new Error("C1: demo campaign not found");
    return `/campaigns/${id}?tab=workforce&sub=wall-chart`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "The wall chart is your campaign at a glance. Every column is a unit, and every tile is a worker.",
    "Each unit card shows its name, its type, and how many workers you expect.",
    "A worker's tile is coloured by their rating, from supportive leaders through to opposed.",
    "Grey slots show where you still have people to find.",
    "Up here you can switch between the cumulative view and a single assessment.",
    "Read at a glance who's with you and where to focus. Next, filter the chart to answer questions.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 360, { steps: 16 }); await page.mouse.move(640, 480, { steps: 14 }); },
    async (page, ctx) => { await moveText(page, ctx, "Day Shift"); },
    async (page, ctx) => {
      // move into the Day Shift card body where worker tiles sit
      const card = page.locator("text=Day Shift").first();
      const box = await card.boundingBox();
      if (box) { await page.mouse.move(box.x + 60, box.y + 80, { steps: 18 }); await page.mouse.move(box.x + 160, box.y + 80, { steps: 12 }); }
    },
    async (page) => {
      const card = await page.locator("text=Day Shift").first().boundingBox();
      if (card) await page.mouse.move(card.x + 360, card.y + 90, { steps: 16 });
    },
    async (page, ctx) => {
      const sel = page.locator('button:has-text("Cumulative")').first();
      if (await sel.count()) { await ctx.move(sel); await page.waitForTimeout(500); await sel.click().catch(() => {}); await page.waitForTimeout(900); await page.keyboard.press("Escape"); }
    },
    async (page, ctx) => { await moveText(page, ctx, "Assessment distribution"); await page.waitForTimeout(500); await page.mouse.move(760, 520, { steps: 14 }); },
  ],
});
