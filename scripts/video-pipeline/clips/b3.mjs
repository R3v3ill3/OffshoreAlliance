import { runClip } from "../lib/clip.mjs";

// B3 — Allocate workers to units.
// Campaign Units tab → a unit's "Assign worker" opens a bulk-assign dialog
// (search/filter, tick workers, "Set as primary", "Assign selected (N)").
// Uses the first unit (Day Shift); "Show only unassigned workers" is on by
// default, so each run picks from whoever isn't yet in that unit.
const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

await runClip({
  id: "B3",
  title: "Allocate workers to units",
  summary:
    "Put workers into organising units — open a unit's assign panel, tick the workers, mark a primary unit, and assign them in bulk. A worker can sit in more than one unit.",
  tags: ["allocate workers", "assign", "organising unit", "multi-unit", "primary unit", "bulk assign"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["B2"],
  upNext: ["C1", "C2", "E3"],
  upNextLabels: ["The wall chart", "Filter & sort", "Rate workers"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=campaign-units`;
  },
  readySelector: "text=Campaign units",
  segments: [
    "Now put workers into your units. From a unit, choose Assign worker.",
    "The panel lists your campaign workers — search, filter, and tick the ones for this unit.",
    "A worker can belong to more than one unit. The Units column shows where they already sit.",
    "Tick as many as you need, then assign them all in one go.",
    "And they're allocated. Your workforce is structured and ready for the wall chart.",
  ],
  steps: [
    // 0 — open the first unit's assign dialog.
    async (page, ctx) => {
      const a = page.locator('button:has-text("Assign worker")').first();
      await a.scrollIntoViewIfNeeded().catch(() => {});
      await ctx.move(a); await page.waitForTimeout(400); await a.click().catch(() => {});
      await page.waitForSelector('[role="dialog"] input[placeholder*="Search"]', { timeout: 8000 }).catch(() => {});
    },
    // 1 — search area + tick the first worker (Radix checkboxes are buttons).
    async (page, ctx) => {
      const search = page.locator('[role="dialog"] input[placeholder*="Search"]').first();
      if (await search.count()) { await ctx.move(search).catch(() => {}); await page.waitForTimeout(400); }
      const boxes = page.locator('[role="dialog"] table [role="checkbox"]');
      const first = boxes.nth(1); // nth(0) = header select-all
      if (await first.count()) { await ctx.move(first).catch(() => {}); await first.click().catch(() => {}); }
      await page.waitForTimeout(400);
    },
    // 2 — multi-unit: tick a second worker, glance at the Units column.
    async (page, ctx) => {
      const boxes = page.locator('[role="dialog"] table [role="checkbox"]');
      const second = boxes.nth(2);
      if (await second.count()) { await ctx.move(second).catch(() => {}); await second.click().catch(() => {}); }
      await page.waitForTimeout(300);
      const units = page.locator('[role="dialog"] th', { hasText: "Units" }).first();
      if (await units.count()) await ctx.move(units).catch(() => {});
    },
    // 3 — assign the selection.
    async (page, ctx) => {
      const assign = page.locator('[role="dialog"] button:has-text("Assign selected")').first();
      if (await assign.count()) { await ctx.move(assign); await page.waitForTimeout(400); await assign.click().catch(() => {}); }
      await page.waitForTimeout(1200);
    },
    // 4 — settle on the updated unit.
    async (page, ctx) => {
      const dayshift = page.locator("text=Day Shift").first();
      if (await dayshift.count()) await dayshift.scrollIntoViewIfNeeded().catch(() => {});
      await page.mouse.move(700, 380, { steps: 14 });
      await page.waitForTimeout(400);
    },
  ],
});
