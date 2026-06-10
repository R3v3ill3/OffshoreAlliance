import { runClip } from "../lib/clip.mjs";

// D3 — Running a calling session.
// Pre-seeded (via Supabase SQL) demo call list "EBA outreach — Day shift (DEMO)"
// on campaign 3: 8 pending workers (with AU mobiles) + a 4-section script.
// This clip drives the live CallSessionPage: dial outcome → script → outcome →
// support level → notes → Save & Phone Next. No real calls are placed — the
// dialer only logs outcomes.
const CAMPAIGN = "Acme Energy EBA 2026 — DEMO";
const LIST_NAME = "EBA outreach — Day shift (DEMO)";

async function moveText(page, ctx, t) {
  const l = page.locator(`text=${t}`).first();
  if (await l.count()) await ctx.move(l).catch(() => {});
}

await runClip({
  id: "D3",
  title: "Phone tasking: running a calling session",
  summary:
    "Work a call list in the dialer — log the dial outcome, follow the script, record the result and support level, then move to the next contact.",
  tags: ["phone", "calling", "dialer", "call session", "outcome", "support level", "notes", "tasking"],
  associatedRoutes: ["/campaigns/*/phone/call/*", "/campaigns/*/phone/live"],
  routeWeight: 9,
  prerequisites: ["D2"],
  upNext: ["D4", "D2", "D1"],
  upNextLabels: ["Activist tasking", "Build a call list", "Email tasking"],
  startUrl: async ({ get }) => {
    const r = await get(
      `call_lists?campaign_id=eq.3&name=eq.${encodeURIComponent(LIST_NAME)}&select=list_id&order=created_at.desc&limit=1`
    );
    const id = r?.[0]?.list_id ?? 1;
    return `/campaigns/3/phone/call/${id}`;
  },
  readySelector: "text=What happened when you dialed?",
  segments: [
    "Time to make the calls. Each worker comes up with their phone number, and your script, ready to go.",
    "Dial the number, then log what happened. Liam picks up, so we choose Connected.",
    "Now work through the script. Open the conversation, hear what matters, and move to the ask.",
    "Capture where they land. Set an overall support level as you talk.",
    "Record the result, a positive outcome, and add a quick note.",
    "Then save, and phone next.",
    "The following contact loads automatically, and every call feeds your report and ratings.",
  ],
  steps: [
    // 0 — contact card: linger on the number, then the name.
    async (page, ctx) => {
      const tel = page.locator('a[href^="tel:"]').first();
      if (await tel.count()) { await ctx.move(tel); await page.waitForTimeout(700); }
      await moveText(page, ctx, "Liam Smith");
    },
    // 1 — dial outcome: Connected.
    async (page, ctx) => {
      const b = page.locator('button:has-text("Connected")').first();
      await ctx.move(b); await page.waitForTimeout(500);
      await b.click().catch(() => {});
      await page.waitForTimeout(700);
    },
    // 2 — work through the script via the stepper's Next control.
    async (page, ctx) => {
      const next = page.locator('button:has-text("Next")').first();
      if (await next.count()) {
        await ctx.move(next); await page.waitForTimeout(400);
        await next.click().catch(() => {});
        await page.waitForTimeout(600);
        await next.click().catch(() => {});
      } else {
        await moveText(page, ctx, "The ask");
      }
    },
    // 3 — set overall support level. Target the Radix Select trigger by its
    // combobox role + "Assess…" placeholder so we don't match the header's
    // "Add assessment" button.
    async (page, ctx) => {
      const trigger = page.locator('button[role="combobox"]:has-text("Assess")').first();
      if (await trigger.count()) {
        await ctx.move(trigger); await page.waitForTimeout(400);
        await trigger.click().catch(() => {});
        await page.waitForSelector('[role="option"]', { timeout: 2500 }).catch(() => {});
        const opt = page.getByRole("option", { name: "Supporter", exact: true }).first();
        if (await opt.count()) {
          await ctx.move(opt).catch(() => {});
          await opt.click().catch(() => {});
        } else {
          // close the portal cleanly rather than leaving it open over the form
          await page.keyboard.press("Escape").catch(() => {});
        }
      }
      await page.waitForTimeout(300);
    },
    // 4 — record the outcome + a note.
    async (page, ctx) => {
      const pos = page.locator('button:has-text("Positive Outcome")').first();
      if (await pos.count()) { await ctx.move(pos); await page.waitForTimeout(400); await pos.click().catch(() => {}); }
      await page.waitForTimeout(500);
      const notes = page.locator('textarea[placeholder*="Notes from this call"]').first();
      if (await notes.count()) {
        await notes.click().catch(() => {});
        await page.keyboard.type("Keen on the roster changes — will vote yes and talk to his crew.", { delay: 18 });
      }
    },
    // 5 — save the attempt (this advances to the next contact).
    async (page, ctx) => {
      const save = page.locator('button:has-text("Save & Phone Next")').first();
      if (await save.count()) { await ctx.move(save); await page.waitForTimeout(400); await save.click().catch(() => {}); }
      await page.waitForTimeout(400);
    },
    // 6 — reveal the freshly-loaded next contact by its new number.
    async (page, ctx) => {
      await page
        .waitForFunction(
          (old) => {
            const a = document.querySelector('a[href^="tel:"]');
            return a && a.getAttribute("href") !== old;
          },
          "tel:0400058571",
          { timeout: 7000 }
        )
        .catch(() => {});
      const tel = page.locator('a[href^="tel:"]').first();
      if (await tel.count()) await ctx.move(tel).catch(() => {});
    },
  ],
});
