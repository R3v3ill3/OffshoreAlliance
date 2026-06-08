import { runClip } from "../lib/clip.mjs";

const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
const NEW_ASSESS = "Site safety vote (DEMO)";

await runClip({
  id: "E2",
  title: "Create and configure an assessment",
  summary: "Create an assessment from a template or custom; choose binary vs 1–5 and link to ambitions.",
  tags: ["assessment", "create assessment", "template", "binary", "scale", "ambition link", "snapshot"],
  associatedRoutes: ["/campaigns/*"],
  routeWeight: 8,
  prerequisites: ["E1"],
  upNext: ["E3", "E1", "C1"],
  upNextLabels: ["Rate workers", "The rating scale", "The wall chart"],
  cleanup: [{ table: "campaign_activities", column: "title", value: NEW_ASSESS }],
  startUrl: async ({ get }) => {
    const r = await get(`campaigns?name=eq.${encodeURIComponent(CAMPAIGN)}`);
    return `/campaigns/${r?.[0]?.campaign_id}?tab=workforce&sub=assessments`;
  },
  readySelector: 'button:has-text("Add assessment")',
  segments: [
    "An assessment is a snapshot of where your workers stand on one question.",
    "To add one, click Add assessment.",
    "Pick a template, or build a custom one, and give it a title.",
    "Toggle binary for a simple yes or no, or leave it for the one-to-five scale.",
    "You can link it to your ambitions so ratings roll up to your goals.",
    "Click Create, and your assessment is ready to use.",
  ],
  steps: [
    async (page) => { await page.mouse.move(880, 320, { steps: 16 }); await page.mouse.move(640, 420, { steps: 14 }); },
    async (page, ctx) => {
      const b = page.locator('button:has-text("Add assessment")').first();
      await ctx.move(b); await page.waitForTimeout(800); await b.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    },
    async (page, ctx) => {
      const title = page.locator('[role="dialog"] input').first();
      await ctx.move(title); await title.click(); await page.keyboard.type(NEW_ASSESS, { delay: 45 });
    },
    async (page, ctx) => {
      const bin = page.locator('[role="dialog"] >> text=Binary / vote-style').first();
      await ctx.move(bin); await bin.click().catch(() => {}); await page.waitForTimeout(700); await bin.click().catch(() => {});
    },
    async (page, ctx) => {
      const amb = page.locator('[role="dialog"] >> text=Linked ambitions').first();
      if (await amb.count()) await ctx.move(amb);
      await page.waitForTimeout(500);
    },
    async (page, ctx) => {
      const create = page.locator('[role="dialog"] button:has-text("Create")').first();
      await ctx.move(create); await page.waitForTimeout(700); await create.click();
      await page.waitForTimeout(1800);
    },
  ],
});
