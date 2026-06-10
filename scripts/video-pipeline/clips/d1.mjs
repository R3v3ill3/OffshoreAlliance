import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
async function moveText(page, ctx, t) { const l = page.locator(`text=${t}`).first(); if (await l.count()) await ctx.move(l); }

await runClip({
  id: "D1",
  title: "Email tasking: reach a cohort by email",
  summary: "Start an email from your campaign — draft first or build the recipient list first; both end at the send step.",
  tags: ["email", "compose", "send", "recipients", "comms", "broadcast", "tasking"],
  associatedRoutes: ["/campaigns/*/email/*"],
  routeWeight: 9,
  prerequisites: ["C3"],
  upNext: ["D2", "D4", "C3"],
  upNextLabels: ["Phone tasking", "Activist tasking", "Build a list"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}/email/setup/order`;
  },
  readySelector: "text=Draft email first",
  segments: [
    "Email is one of your fastest ways to reach a whole cohort of workers.",
    "Start it from the campaign with Create Email, then choose where to begin.",
    "Draft the email first, and build your recipient list afterwards.",
    "Or build the list first. Filter your workers, then write the message.",
    "Either path ends at the same send step. And firing a list from the wall chart brings your recipients straight in.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 280, { steps: 16 }); await page.mouse.move(700, 360, { steps: 14 }); },
    async (page, ctx) => { await moveText(page, ctx, "Order"); await page.waitForTimeout(500); await page.mouse.move(960, 300, { steps: 12 }); },
    async (page, ctx) => { await moveText(page, ctx, "Draft email first"); await page.waitForTimeout(600); },
    async (page, ctx) => { await moveText(page, ctx, "Build the list first"); await page.waitForTimeout(600); },
    async (page, ctx) => { await moveText(page, ctx, "Draft email first"); await page.mouse.move(1100, 380, { steps: 12 }); },
  ],
});
