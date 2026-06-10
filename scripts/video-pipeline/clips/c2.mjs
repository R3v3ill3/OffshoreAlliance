import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

// The filter bar / assessment selector sit at the top; the worker tiles (which
// recolour when you filter or switch assessment) sit below the fold — so scroll
// to the tiles after each change to actually show the effect.
async function showTiles(page) {
  const tile = page.locator('[data-worker-id]').first();
  if (await tile.count()) {
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    await tile.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function showTop(page, triggerText) {
  const t = page.locator(`button:has-text("${triggerText}")`).first();
  if (await t.count()) {
    await t.scrollIntoViewIfNeeded().catch(() => {});
    await t.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function openPick(page, ctx, triggerText, optionText) {
  const t = page.locator(`button:has-text("${triggerText}")`).first();
  if (!(await t.count())) return;
  await ctx.move(t); await t.click().catch(() => {}); await page.waitForTimeout(700);
  if (optionText) {
    const o = page.locator(`[role="option"]:has-text("${optionText}")`).first();
    if (await o.count()) await o.click().catch(() => {}); else await page.keyboard.press("Escape");
  } else { await page.keyboard.press("Escape"); }
}
async function moveTile(page, ctx, n) {
  const t = page.locator('[data-worker-id]').nth(n);
  if (await t.count()) await ctx.move(t).catch(() => {});
}

await runClip({
  id: "C2",
  title: "Filter, sort & switch views",
  summary: "Narrow the wall chart with filters, switch cumulative vs per-assessment, and toggle list view.",
  tags: ["filter", "sort", "list view", "cumulative rating", "assessment view", "search workers"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["C1"],
  upNext: ["C3", "C1", "E2"],
  upNextLabels: ["Build a list", "The wall chart", "Create an assessment"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=wall-chart`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "Filters turn the wall chart into an answer machine. Narrow it to ask a question.",
    "Filter by rating. For example, show only your supportive workers.",
    "Switch between the cumulative view and a single assessment, and watch the tiles recolour.",
    "Group the chart by unit type, like shift or department.",
    "Or switch to a list view for a sortable table.",
    "Found your cohort? Next, build a list from it.",
  ],
  steps: [
    // 0 — show the chart of tiles.
    async (page, ctx) => {
      await showTiles(page);
      await moveTile(page, ctx, 0);
      await page.waitForTimeout(300);
      await moveTile(page, ctx, 3);
    },
    // 1 — filter by rating, then show the narrowed chart.
    async (page, ctx) => {
      await showTop(page, "Any supportive rating");
      await openPick(page, ctx, "Any supportive rating", "Supportive");
      await showTiles(page);
    },
    // 2 — switch assessment; show the tiles recolour.
    async (page, ctx) => {
      await showTop(page, "Cumulative");
      await openPick(page, ctx, "Cumulative", "EBA support check");
      await showTiles(page);
      await moveTile(page, ctx, 1);
    },
    // 3 — group by unit type.
    async (page, ctx) => {
      await showTop(page, "Shift");
      await openPick(page, ctx, "Shift (2 units)", null);
    },
    // 4 — switch to the list view.
    async (page, ctx) => {
      const list = page.locator('text="List"').first();
      if (await list.count()) { await ctx.move(list); await list.click().catch(() => {}); }
      await page.waitForTimeout(900);
    },
    // 5 — back to the wall chart; settle on the tiles.
    async (page, ctx) => {
      const wc = page.locator('text="Wall chart"').first();
      if (await wc.count()) { await ctx.move(wc); await wc.click().catch(() => {}); }
      await showTiles(page);
      await moveTile(page, ctx, 0);
    },
  ],
});
