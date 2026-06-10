import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function showTiles(page) {
  const tile = page.locator('[data-worker-id]').first();
  if (await tile.count()) {
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    await tile.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function moveTile(page, ctx, n) {
  const t = page.locator('[data-worker-id]').nth(n);
  if (await t.count()) await ctx.move(t).catch(() => {});
}

// Manual pointer drag — the wall chart uses dnd-kit (pointer sensors), which
// ignores Playwright's HTML5 dragTo(). A small nudge after mousedown activates
// the drag sensor before moving to the drop zone.
async function pointerDrag(page, sourceLoc, targetLoc) {
  const tb = await sourceLoc.boundingBox();
  const db = await targetLoc.boundingBox();
  if (!tb || !db) return false;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 30, tb.y + tb.height / 2 - 8, { steps: 5 });
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 24 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}

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
    "This is the hinge. Turn what you see on the wall chart into action.",
    "Open the Build list panel.",
    "Give your list a name.",
    "Drag a worker straight from the chart into the list.",
    "Choose a purpose. Email, phone, or an activist task.",
    "Then fire it, and you jump straight into the right tool. Let's look at each next.",
  ],
  steps: [
    // 0 — show the chart of tiles.
    async (page, ctx) => {
      await showTiles(page);
      await moveTile(page, ctx, 0);
    },
    // 1 — open the Build list panel.
    async (page, ctx) => {
      const b = page.locator('button:has-text("Build list")').first();
      await ctx.move(b); await page.waitForTimeout(600); await b.click().catch(() => {});
      await page.waitForSelector("#build-list-name", { timeout: 8000 }).catch(() => {});
    },
    // 2 — name the list.
    async (page, ctx) => {
      const n = page.locator("#build-list-name").first();
      if (await n.count()) { await ctx.move(n); await n.click().catch(() => {}); await page.keyboard.type("EBA voting push — Day shift", { delay: 40 }); }
    },
    // 3 — drag a worker tile into the list (pointer drag for dnd-kit).
    async (page, ctx) => {
      await showTiles(page);
      const tile = page.locator('[data-worker-id]').first();
      const drop = page.locator("text=/Drop worker tiles/i").first();
      if (await tile.count()) await ctx.move(tile).catch(() => {});
      await page.waitForTimeout(300);
      if ((await tile.count()) && (await drop.count())) await pointerDrag(page, tile, drop);
    },
    // 4 — choose a purpose.
    async (page, ctx) => {
      const p = page.locator('button:has-text("Choose later"), button:has-text("Purpose")').first();
      if (await p.count()) {
        await ctx.move(p); await p.click().catch(() => {}); await page.waitForTimeout(700);
        const em = page.locator('[role="option"]:has-text("Email")').first();
        if (await em.count()) await em.click().catch(() => {}); else await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(400);
    },
    // 5 — fire it.
    async (page, ctx) => {
      const fire = page.locator('button:has-text("Fire")').first();
      if (await fire.count()) await ctx.move(fire).catch(() => {});
      await page.waitForTimeout(600);
    },
  ],
});
