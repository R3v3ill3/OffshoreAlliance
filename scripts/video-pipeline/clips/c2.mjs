import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function openPick(page, ctx, triggerText, optionText) {
  const t = page.locator(`button:has-text("${triggerText}")`).first();
  if (!(await t.count())) return;
  await ctx.move(t); await t.click(); await page.waitForTimeout(700);
  if (optionText) {
    const o = page.locator(`[role="option"]:has-text("${optionText}")`).first();
    if (await o.count()) await o.click(); else await page.keyboard.press("Escape");
  } else { await page.keyboard.press("Escape"); }
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
    "Switch between the cumulative view and a single assessment.",
    "Group the chart by unit type, like shift or department.",
    "Or switch to a list view for a sortable table.",
    "Found your cohort? Next, build a list from it.",
  ],
  steps: [
    async (page) => { await page.mouse.move(880, 300, { steps: 16 }); await page.mouse.move(620, 430, { steps: 14 }); },
    async (page, ctx) => { await openPick(page, ctx, "Any supportive rating", "Supportive"); },
    async (page, ctx) => { await openPick(page, ctx, "Cumulative", "EBA support check"); },
    async (page, ctx) => { await openPick(page, ctx, "Shift (2 units)", null); },
    async (page, ctx) => {
      const list = page.locator('text="List"').first();
      if (await list.count()) { await ctx.move(list); await list.click().catch(() => {}); }
      await page.waitForTimeout(900);
    },
    async (page, ctx) => {
      const wc = page.locator('text="Wall chart"').first();
      if (await wc.count()) await ctx.move(wc).catch(() => {});
      await page.mouse.move(760, 460, { steps: 14 });
    },
  ],
});
