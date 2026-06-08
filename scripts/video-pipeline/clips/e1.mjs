import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";

async function moveText(page, ctx, text) {
  const loc = page.locator(`text=${text}`).first();
  if (await loc.count()) await ctx.move(loc);
}

await runClip({
  id: "E1",
  title: "The rating scale, explained",
  summary: "The six rating states (1 Supportive leader … 5 Oppositional leader + Unassessed) and their colours.",
  tags: ["rating", "scale", "supportive leader", "supporter", "neutral", "opposed", "unassessed", "colours"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 3,
  prerequisites: [],
  upNext: ["E2", "E3", "C1"],
  upNextLabels: ["Create an assessment", "Rate workers", "The wall chart"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=wall-chart`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "Every worker gets a rating, and the colour tells you where they stand.",
    "One and two are your supporters. Supportive leaders, and supporters.",
    "Three is neutral. Undecided, or not yet engaged.",
    "Four and five are opposed. Opposed, and oppositional leaders.",
    "And grey means unassessed. Not missing, just not yet measured. The colours mean the same everywhere in the app.",
  ],
  steps: [
    async (page, ctx) => { await moveText(page, ctx, "Assessment distribution"); await page.mouse.move(760, 470, { steps: 16 }); },
    async (page) => { const d = await page.locator("text=Assessment distribution").first().boundingBox(); if (d) await page.mouse.move(d.x + 120, d.y + 70, { steps: 16 }); },
    async (page) => { const d = await page.locator("text=Assessment distribution").first().boundingBox(); if (d) await page.mouse.move(d.x + 320, d.y + 70, { steps: 14 }); },
    async (page) => { const d = await page.locator("text=Assessment distribution").first().boundingBox(); if (d) await page.mouse.move(d.x + 520, d.y + 70, { steps: 14 }); },
    async (page, ctx) => { await moveText(page, ctx, "Day Shift"); const c = await page.locator("text=Day Shift").first().boundingBox(); if (c) await page.mouse.move(c.x + 420, c.y + 90, { steps: 16 }); },
  ],
});
