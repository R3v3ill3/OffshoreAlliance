import { runClip } from "../lib/clip.mjs";

// E3 — Rate workers (inline, on the wall chart).
// Requires the campaign universe (campaign_worker_membership) to be seeded for
// campaign 3 — done via SQL so the wall chart lists the demo workforce. Flow:
// switch the assessment selector from Cumulative to a specific assessment, then
// click a worker tile's rating badge → InlineRatingPopover → RatingPicker → Save
// (tile recolours), then switch back to the cumulative view.
const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

// Open a Radix Select/listbox trigger by visible text, then pick an option.
async function openPick(page, ctx, triggerText, optionText) {
  const t = page.locator(`button:has-text("${triggerText}")`).first();
  if (!(await t.count())) return;
  await ctx.move(t); await t.click().catch(() => {}); await page.waitForTimeout(700);
  if (optionText) {
    const o = page.locator(`[role="option"]:has-text("${optionText}")`).first();
    if (await o.count()) { await ctx.move(o).catch(() => {}); await o.click().catch(() => {}); }
    else await page.keyboard.press("Escape");
  } else { await page.keyboard.press("Escape"); }
  await page.waitForTimeout(500);
}

// Click a worker tile's quick-rate badge (the role="button" inside the tile).
async function openQuickRate(page, ctx, workerId) {
  let tile = page.locator(`[data-worker-id="${workerId}"]`).first();
  if (!(await tile.count())) tile = page.locator('[data-worker-id] [role="button"]').first().locator("xpath=ancestor::*[@data-worker-id]");
  if (!(await tile.count())) return false;
  await tile.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  const badge = tile.locator('[role="button"]').first();
  const target = (await badge.count()) ? badge : tile;
  await ctx.move(target).catch(() => {});
  await page.waitForTimeout(400);
  await target.click().catch(() => {});
  return true;
}

await runClip({
  id: "E3",
  title: "Rate workers",
  summary:
    "Set ratings inline on the wall chart — pick an assessment, quick-rate a worker on the 1–5 scale, and read cumulative vs per-assessment support.",
  tags: ["rate workers", "rating", "inline", "quick rate", "cumulative", "assessment ratings", "colours"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["E1", "E2"],
  upNext: ["D1", "D2", "C3"],
  upNextLabels: ["Email tasking", "Phone tasking", "Build a list"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=wall-chart`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "Ratings are how you measure support. The wall chart colours every worker by how they rate.",
    "First, pick the assessment you're rating against — here, the EBA support check.",
    "Click a worker's rating to open the quick-rate panel.",
    "Choose where they sit on the one-to-five scale, then save. The tile recolours straight away.",
    "And switch back to the cumulative view to see overall support across every assessment combined.",
  ],
  steps: [
    // 0 — bring the unit tiles into view.
    async (page, ctx) => {
      await moveToTiles(page);
      await page.mouse.move(820, 460, { steps: 14 });
    },
    // 1 — select the EBA support check assessment.
    async (page, ctx) => {
      await openPick(page, ctx, "Cumulative", "EBA support check");
    },
    // 2 — open the quick-rate popover on a worker tile (Noah Jones / DEMOW-3).
    async (page, ctx) => {
      const ok = await openQuickRate(page, ctx, 1585);
      if (!ok) await openQuickRate(page, ctx, 1585);
      await page.waitForSelector('[data-radix-popper-content-wrapper] button[role="combobox"], [role="dialog"] button[role="combobox"]', { timeout: 6000 }).catch(() => {});
    },
    // 3 — set a rating (1 — Supportive leader) and save.
    async (page, ctx) => {
      const trigger = page.locator('[data-radix-popper-content-wrapper] button[role="combobox"]').first();
      if (await trigger.count()) {
        await ctx.move(trigger).catch(() => {});
        await trigger.click().catch(() => {});
        await page.waitForSelector('[role="option"]', { timeout: 2500 }).catch(() => {});
        const opt = page.getByRole("option").nth(1); // value 1 (Unassessed is index 0)
        if (await opt.count()) { await ctx.move(opt).catch(() => {}); await opt.click().catch(() => {}); }
      }
      await page.waitForTimeout(500);
      const save = page.getByRole("button", { name: "Save", exact: true }).first();
      if (await save.count()) { await ctx.move(save).catch(() => {}); await save.click().catch(() => {}); }
      await page.waitForTimeout(900);
    },
    // 4 — back to the cumulative view.
    async (page, ctx) => {
      await openPick(page, ctx, "EBA support check", "Cumulative");
    },
  ],
});

async function moveToTiles(page) {
  const u = page.locator("text=Day Shift").first();
  if (await u.count()) await u.scrollIntoViewIfNeeded().catch(() => {});
}
