import { runClip } from "../lib/clip.mjs";
import { BASE_URL } from "../config.mjs";

// D4 — Activist tasking: task lists & the leader webform.
// Two linked flows: the staff "Leader task lists" tab, then the public
// /leader/task/[token] webform the leader fills in. Structure is seeded via
// SQL (activist-assessed activity "Crew safety conversation (DEMO)" + task
// list "Day-shift crew — safety check-in (DEMO)" with leader Liam + 5
// followers). The clip's seed() mints a password-protected leader token via
// the staff API so the webform can be unlocked on camera.
const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
const LIST_TITLE = "Day-shift crew — safety check-in (DEMO)";
const LEADER_PASSWORD = "demo1234";

async function moveText(page, ctx, t) {
  const l = page.locator(`text=${t}`).first();
  if (await l.count()) await ctx.move(l).catch(() => {});
}

await runClip({
  id: "D4",
  title: "Activist tasking: task lists & the leader webform",
  summary:
    "Give a worker leader a list of crewmates to assess and recruit, then see the secure web form they fill in — ratings flow straight back into the campaign.",
  tags: ["activist", "task list", "leader", "webform", "delegate", "membership ask", "peer assessment", "tasking"],
  associatedRoutes: ["/campaigns/*", "/leader/task/*"],
  routeWeight: 8,
  prerequisites: ["C3", "E1"],
  upNext: ["E1", "D3", "C3"],
  upNextLabels: ["The rating scale", "Run a calling session", "Build a list"],
  // Mint a password-protected leader token for the seeded task list.
  seed: async ({ page, get }) => {
    const r = await get(
      `campaign_task_lists?campaign_id=eq.3&title=eq.${encodeURIComponent(LIST_TITLE)}&select=task_list_id&order=task_list_id.desc&limit=1`
    );
    const taskListId = r?.[0]?.task_list_id ?? 1;
    let token = null;
    try {
      const resp = await page.request.post(
        `${BASE_URL}/api/campaigns/3/task-lists/${taskListId}/token`,
        { headers: { "Content-Type": "application/json" }, data: { password: LEADER_PASSWORD, expiresInHours: 24 } }
      );
      const body = await resp.json().catch(() => ({}));
      token = body?.token ?? null;
      console.log(`[D4] minted leader token for list ${taskListId}: ${token ? token.slice(0, 10) + "…" : "FAILED"}`);
    } catch (e) {
      console.warn(`[D4] token mint error: ${String(e).slice(0, 120)}`);
    }
    return { taskListId, token, password: LEADER_PASSWORD };
  },
  startUrl: `/campaigns/3?tab=plan&sub=task-lists`,
  readySelector: "text=Leader task lists",
  segments: [
    "Activist tasking puts your leaders to work. You give a worker leader a short list of their own crewmates to assess and recruit.",
    "You build the list in a few steps, link an activity so the ratings flow to it, then generate a secure link to send the leader.",
    "This is what the leader opens, on their phone or laptop. They unlock it with the password you shared with them.",
    "Inside, their crew is listed and ready to assess. They tap a worker to open them up.",
    "They set a rating on the one-to-five scale, from supportive leader through to opposed, and add any notes.",
    "They can also flag anyone keen to join the union, then close the card.",
    "And when they submit, every rating flows straight back into the campaign, ready for your next move.",
  ],
  steps: [
    // 0 — staff: the seeded leader task list.
    async (page, ctx) => {
      await moveText(page, ctx, "Day-shift crew");
      await page.waitForTimeout(700);
      await moveText(page, ctx, "Crew safety conversation");
    },
    // 1 — staff: building + sending (New task list / Generate link).
    async (page, ctx) => {
      const nt = page.locator('button:has-text("New task list")').first();
      if (await nt.count()) { await ctx.move(nt); await page.waitForTimeout(700); }
      const gl = page.locator('button:has-text("Generate link")').first();
      if (await gl.count()) await ctx.move(gl).catch(() => {});
      await page.waitForTimeout(500);
    },
    // 2 — leader: open the webform via the minted token and unlock.
    async (page, ctx) => {
      const token = ctx.seeded?.token;
      if (!token) { console.warn("[D4] no token — skipping leader flow"); return; }
      await page.goto(`${BASE_URL}/leader/task/${token}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#leader-password', { timeout: 15000 }).catch(() => {});
      const pw = page.locator('#leader-password');
      if (await pw.count()) {
        await ctx.move(pw).catch(() => {});
        await pw.click().catch(() => {});
        await page.keyboard.type(ctx.seeded.password, { delay: 55 });
        const unlock = page.locator('button:has-text("Unlock")').first();
        await ctx.move(unlock).catch(() => {});
        await unlock.click().catch(() => {});
      }
      // wait for the worker list to render post-auth
      await page.waitForSelector('button:has-text("Nguyen"), button:has-text("Olivia")', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
    },
    // 3 — leader: open the first crew member.
    async (page, ctx) => {
      const card = page.locator('button:has-text("Olivia")').first();
      if (await card.count()) {
        await ctx.move(card); await page.waitForTimeout(500);
        await card.click().catch(() => {});
        await page.waitForSelector('text=Assessment', { timeout: 8000 }).catch(() => {});
      }
    },
    // 4 — leader: set a rating on the 1-5 scale.
    async (page, ctx) => {
      const trigger = page.locator('button[role="combobox"]:has-text("select rating")').first();
      if (await trigger.count()) {
        await ctx.move(trigger); await page.waitForTimeout(400);
        await trigger.click().catch(() => {});
        await page.waitForSelector('[role="option"]', { timeout: 2500 }).catch(() => {});
        const opt = page.getByRole("option").nth(1); // value 2 (Supporter)
        if (await opt.count()) { await ctx.move(opt).catch(() => {}); await opt.click().catch(() => {}); }
      }
      await page.waitForTimeout(500);
    },
    // 5 — leader: glance at membership, then close the card.
    async (page, ctx) => {
      const mem = page.locator('button[role="combobox"]:has-text("Set membership")').first();
      if (await mem.count()) { await ctx.move(mem).catch(() => {}); await page.waitForTimeout(600); }
      const done = page.locator('button:has-text("Done")').first();
      if (await done.count()) { await ctx.move(done).catch(() => {}); await done.click().catch(() => {}); }
      await page.waitForTimeout(500);
    },
    // 6 — leader: submit; wait out the reload and end on the assessed list.
    async (page, ctx) => {
      const submit = page.locator('button:has-text("Submit changes")').first();
      if (await submit.count()) { await ctx.move(submit); await page.waitForTimeout(400); await submit.click().catch(() => {}); }
      // let the post-submit reload finish so the final frame shows the
      // persisted rating (not the transient loading spinner)
      await page.waitForSelector('text=/assessed/', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await moveText(page, ctx, "assessed");
    },
  ],
});
