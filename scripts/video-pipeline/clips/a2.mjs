import { runClip } from "../lib/clip.mjs";

const NAME = "Acme FPSO Northstar (DEMO)";
const EMP = "Acme Energy"; // the A1 demo employer (Principal Employer)

async function pickOption(page, ctx, triggerText, optionText) {
  const trigger = page.locator(`button:has-text("${triggerText}")`).first();
  await ctx.move(trigger);
  await trigger.click();
  await page.waitForTimeout(700);
  await page.locator(`[role="option"]:has-text("${optionText}")`).first().click();
}

await runClip({
  id: "A2",
  title: "Add worksites & link them to employers",
  summary: "Create a worksite and set its Principal Employer vs Operator; plot it on the map.",
  tags: ["worksite", "site", "platform", "FPSO", "principal employer", "operator", "offshore"],
  associatedRoutes: ["/worksites", "/worksites/*"],
  routeWeight: 10,
  prerequisites: ["A1"],
  upNext: ["A3", "A1", "A4"],
  upNextLabels: ["Import workers", "Add an employer", "Create a campaign"],
  cleanup: [{ table: "worksites", column: "worksite_name", value: NAME }],
  startUrl: "/worksites",
  readySelector: 'button:has-text("Add Worksite")',
  segments: [
    "Worksites are where the work actually happens. Platforms, F P S Os, and gas plants.",
    "From the Worksites page, click Add Worksite.",
    "Give the worksite a name.",
    "Choose its type. Here, an F P S O.",
    "Set the Principal Employer, the asset owner, and the Operator that runs it day to day.",
    "Mark it offshore if it's out at sea, then click Save Worksite.",
    "Your worksite is created and linked to its employer. Next, bring in the workforce.",
  ],
  steps: [
    async (page) => { await page.mouse.move(900, 280, { steps: 16 }); await page.mouse.move(640, 430, { steps: 16 }); },
    async (page, ctx) => {
      const btn = page.locator('button:has-text("Add Worksite")').first();
      await ctx.move(btn); await page.waitForTimeout(900); await btn.click();
      await page.waitForSelector("#worksite_name", { timeout: 10000 });
    },
    async (page, ctx) => {
      const f = page.locator("#worksite_name"); await ctx.move(f); await f.click();
      await page.keyboard.type(NAME, { delay: 45 });
    },
    async (page, ctx) => { await pickOption(page, ctx, "Select type", "FPSO"); },
    async (page, ctx) => {
      await pickOption(page, ctx, "Select principal employer", EMP);
      await page.waitForTimeout(400);
      await pickOption(page, ctx, "Select operator", EMP);
    },
    async (page, ctx) => {
      const off = page.locator("#is_offshore").first();
      await ctx.move(off); await off.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const save = page.locator('button:has-text("Save Worksite")').first();
      await ctx.move(save); await page.waitForTimeout(500); await save.click();
      await page.waitForTimeout(1400);
    },
    async (page, ctx) => {
      const s = page.locator('input[placeholder="Search worksites..."]').first();
      await ctx.move(s); await s.click(); await page.keyboard.type("Acme FPSO", { delay: 50 });
    },
  ],
});
