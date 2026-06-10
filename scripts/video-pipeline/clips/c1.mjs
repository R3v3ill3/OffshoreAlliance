import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function moveText(page, ctx, text) {
  const loc = page.locator(`text=${text}`).first();
  if (await loc.count()) await ctx.move(loc).catch(() => {});
}

// The wall-chart tiles render below the campaign summary + assessment
// distribution blocks, so the page must be scrolled before the worker tiles
// are on screen. moveTo() only moves the synthetic cursor to an element's
// current box — it does NOT scroll — so scroll explicitly first.
async function showTiles(page, { center = true } = {}) {
  const tile = page.locator('[data-worker-id]').first();
  if (await tile.count()) {
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    if (center) await tile.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function showTop(page) {
  const sel = page.locator('button:has-text("Cumulative")').first();
  if (await sel.count()) {
    await sel.scrollIntoViewIfNeeded().catch(() => {});
    await sel.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function moveTile(page, ctx, n) {
  const t = page.locator('[data-worker-id]').nth(n);
  if (await t.count()) await ctx.move(t).catch(() => {});
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
    // 0 — scroll the worker tiles into view and sweep across them.
    async (page, ctx) => {
      await showTiles(page);
      await moveTile(page, ctx, 0);
      await page.waitForTimeout(400);
      await moveTile(page, ctx, 2);
    },
    // 1 — the unit card header (name / type / estimate).
    async (page, ctx) => {
      await moveText(page, ctx, "Day Shift");
    },
    // 2 — a worker tile, coloured by rating.
    async (page, ctx) => {
      await moveTile(page, ctx, 1);
      await page.waitForTimeout(500);
      await moveTile(page, ctx, 3);
    },
    // 3 — grey/empty slots: scroll a little further down the chart.
    async (page, ctx) => {
      await page.evaluate(() => window.scrollBy(0, 230)).catch(() => {});
      await page.waitForTimeout(400);
      const tiles = page.locator('[data-worker-id]');
      const cnt = await tiles.count();
      if (cnt > 6) await ctx.move(tiles.nth(cnt - 2)).catch(() => {});
      else await page.mouse.move(900, 620, { steps: 14 });
    },
    // 4 — back up to the assessment selector; open it to show the choices.
    async (page, ctx) => {
      await showTop(page);
      const sel = page.locator('button:has-text("Cumulative")').first();
      if (await sel.count()) {
        await ctx.move(sel); await page.waitForTimeout(400);
        await sel.click().catch(() => {});
        await page.waitForTimeout(800);
        await page.keyboard.press("Escape").catch(() => {});
      }
    },
    // 5 — settle back on the tiles.
    async (page, ctx) => {
      await showTiles(page);
      await moveTile(page, ctx, 0);
      await page.waitForTimeout(400);
    },
  ],
});
