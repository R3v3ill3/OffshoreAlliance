// A1 — "Add an employer". Records the Add-Employer walkthrough on develop with a
// visible cursor, narrates with Natasha, assembles intro + walkthrough + end card.
// Timing is synced to an ABSOLUTE narration timeline (no per-step drift) and the
// page-load lead is trimmed so audio starts exactly when the walkthrough does.
// Cleans up the demo employer before each run so re-runs don't pile up duplicates.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "../config.mjs";
import { login } from "../lib/auth.mjs";
import { cursorInitScript, moveTo } from "../lib/cursor.mjs";
import { generateSegments, buildVtt } from "../lib/tts.mjs";
import { captureSupabaseAuth, deleteByName } from "../lib/cleanup.mjs";
import * as ff from "../lib/ffmpeg.mjs";

const ID = "A1";
const TITLE = "Add an employer";
const DEMO_EMPLOYER = "Acme Energy Pty Ltd (DEMO)";
const work = path.join(OUT, ID);
const vidDir = path.join(work, "rec");
await fs.rm(vidDir, { recursive: true, force: true });
await fs.mkdir(vidDir, { recursive: true });

const SEGMENTS = [
  "Employers are the companies your campaign organises against, so this is where setup begins.",
  "From the Employers page, click Add Employer.",
  "Give the employer a name. This field is required.",
  "Set the category. Here we'll choose Principal Employer.",
  "You can keep it standalone, or place it under a parent company.",
  "When you're ready, click Save Employer.",
  "And that's it. Your employer is created. Next, add the worksites it operates.",
];

console.log("1) Narration via Natasha (en-AU)…");
const segs = await generateSegments(SEGMENTS, path.join(work, "audio"));
console.log("   durations:", segs.map((s) => s.duration.toFixed(1)).join("s, ") + "s");

console.log("2) Login + clean up any prior demo employer…");
const tmp = await chromium.launch({ headless: true });
const tctx = await tmp.newContext({ viewport: VIEWPORT });
const lp = await tctx.newPage();
if (!(await login(lp))) { await tmp.close(); throw new Error("login failed"); }
// Capture the app's own Supabase auth, then delete any leftover demo employer.
// Use a FRESH page (same-tab nav after login hits a transient that doesn't load
// data). Non-fatal: a cleanup miss must never block the render.
const cleanPage = await tctx.newPage();
const authP = captureSupabaseAuth(tctx, { debug: true });
await cleanPage.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await cleanPage.waitForSelector('button:has-text("Add Employer")', { timeout: 30000 }).catch(() => {});
const auth = await authP.catch(() => null);
if (auth) {
  const del = await deleteByName(auth, "employers", "employer_name", DEMO_EMPLOYER);
  console.log("   cleanup:", JSON.stringify(del));
} else {
  console.warn("   cleanup skipped: no Supabase auth captured");
}
const storageState = await tctx.storageState();
await tmp.close();

console.log("3) Capture walkthrough…");
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, recordVideo: { dir: vidDir, size: VIEWPORT } });
await ctx.addInitScript(cursorInitScript);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const navStart = Date.now();
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('button:has-text("Add Employer")', { timeout: 30000 });
await page.waitForTimeout(400);
const leadSec = (Date.now() - navStart) / 1000; // video portion before the walkthrough

// Absolute-timeline sync: each step ends at the cumulative narration time.
const t0 = Date.now();
let cum = 0;
const step = async (i, fn) => {
  cum += segs[i].duration;
  await fn();
  const waitMs = Math.round(cum * 1000 - (Date.now() - t0));
  if (waitMs > 0) await page.waitForTimeout(waitMs);
};

// 0 — settle on the page (gentle motion while the opening line plays)
await step(0, async () => {
  await page.mouse.move(900, 280, { steps: 16 });
  await page.mouse.move(640, 430, { steps: 16 });
});

// 1 — open the dialog (click lands as "click Add Employer" is spoken)
await step(1, async () => {
  const btn = page.locator('button:has-text("Add Employer")').first();
  await moveTo(page, btn);
  await page.waitForTimeout(900);
  await btn.click();
  await page.waitForSelector("#employer_name", { timeout: 10000 });
});

// 2 — type the name
await step(2, async () => {
  const f = page.locator("#employer_name");
  await moveTo(page, f);
  await f.click();
  await page.keyboard.type(DEMO_EMPLOYER, { delay: 45 });
});

// 3 — category: open, show options, then choose Principal Employer
await step(3, async () => {
  const cat = page.locator('button:has-text("Select category")').first();
  await moveTo(page, cat);
  await cat.click();
  await page.waitForTimeout(1400);
  await page.locator('[role="option"]:has-text("Principal")').first().click();
});

// 4 — parent company: open, show the choice, keep standalone
await step(4, async () => {
  const pc = page.locator('button:has-text("Standalone")').first();
  await moveTo(page, pc);
  await pc.click();
  await page.waitForTimeout(1300);
  await page.keyboard.press("Escape");
});

// 5 — save (click lands as "click Save Employer" is spoken)
await step(5, async () => {
  const save = page.locator('button:has-text("Save Employer")').first();
  await moveTo(page, save);
  await page.waitForTimeout(1100);
  await save.click();
  await page.waitForTimeout(1400);
});

// 6 — confirm: search for the new employer so the created row is visible
await step(6, async () => {
  const search = page.locator('input[placeholder="Search employers..."]').first();
  await moveTo(page, search);
  await search.click();
  await page.keyboard.type("Acme Energy", { delay: 50 });
});

await page.waitForTimeout(600); // small tail so -shortest trims to the audio
const video = page.video();
await page.close();
const recorded = await video.path();
await ctx.close();
await browser.close();
console.log(`   recorded: ${recorded}  (lead ${leadSec.toFixed(2)}s trimmed)`);

console.log("4) Assemble…");
const audioOut = path.join(work, "narration.mp3");
await ff.concatAudio(segs.map((s) => s.file), audioOut);
const intro = path.join(work, "intro.mp4");
const main = path.join(work, "main.mp4");
const endc = path.join(work, "end.mp4");
await ff.makeCard({ title: TITLE, subtitle: "OffshoreAlliance How-to", seconds: 2.5, out: intro });
await ff.makeCard({ title: "Up next", subtitle: "Add worksites    Import workers    Create a campaign", seconds: 4, out: endc });
await ff.buildMain({ video: recorded, audio: audioOut, lowerThird: TITLE, out: main, trimStart: leadSec });

const finalOut = path.join(work, `${ID}.mp4`);
await ff.concatParts([intro, main, endc], finalOut);

await fs.writeFile(path.join(work, `${ID}.vtt`), buildVtt(segs, { lead: 2.5 }));
await fs.writeFile(path.join(work, `${ID}.transcript.txt`), SEGMENTS.join("\n"));
const totalDur = await ff.durationOf(finalOut);
const manifest = {
  id: "A1", title: TITLE, series: "A", durationSec: Math.round(totalDur),
  summary: "Create an employer record, set its category and (optional) parent company.",
  tags: ["employer", "company", "add employer", "parent company", "ABN", "category", "setup"],
  associatedRoutes: ["/employers", "/employers/*"], routeWeight: 10,
  prerequisites: [], upNext: ["A2", "A3", "A4"],
  transcriptPath: "A1.transcript.txt", videoPath: "A1.mp4", downloadable: true,
};
await fs.writeFile(path.join(work, `${ID}.manifest.json`), JSON.stringify(manifest, null, 2));
console.log(`DONE → ${finalOut}  (${Math.round(totalDur)}s)`);
