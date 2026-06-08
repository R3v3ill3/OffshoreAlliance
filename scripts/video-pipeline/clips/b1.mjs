import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
async function moveText(page, ctx, t) { const l = page.locator(`text=${t}`).first(); if (await l.count()) await ctx.move(l); }

await runClip({
  id: "B1",
  title: "Organising units, groups & subgroups — explained",
  summary: "What organising units, group containers and member subgroups are, and how they relate.",
  tags: ["organising unit", "OU", "group", "subgroup", "container", "shift", "department", "structure"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 3,
  prerequisites: [],
  upNext: ["B2", "B3", "C1"],
  upNextLabels: ["Create units & groups", "Allocate workers", "The wall chart"],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=campaign-units`;
  },
  readySelector: "text=Day Shift",
  segments: [
    "An organising unit is a group of workers you organise as a block. By shift, department, worksite, or crew.",
    "Here we have three units. Day Shift, Night Shift, and Maintenance.",
    "Units of the same type can be bundled under a group container. A named header, like Shifts.",
    "Workers are never on the container itself, only on its member units, the subgroups.",
    "And a worker can be in just one group per type. You can't be on both Day and Night shift. Next, let's create some.",
  ],
  steps: [
    async (page) => { await page.mouse.move(880, 320, { steps: 14 }); await page.mouse.move(620, 440, { steps: 14 }); },
    async (page, ctx) => { await moveText(page, ctx, "Day Shift"); await page.waitForTimeout(500); await moveText(page, ctx, "Night Shift"); await page.waitForTimeout(400); await moveText(page, ctx, "Maintenance"); },
    async (page, ctx) => { await moveText(page, ctx, "Day Shift"); await page.mouse.move(700, 380, { steps: 12 }); },
    async (page, ctx) => { await moveText(page, ctx, "Night Shift"); },
    async (page, ctx) => { await moveText(page, ctx, "Maintenance"); await page.mouse.move(760, 460, { steps: 12 }); },
  ],
});
