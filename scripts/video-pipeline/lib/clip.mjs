// Reusable how-to clip runner. Each clip is a concise spec; this handles
// narration (Natasha), demo-data cleanup, optional seeding, recording with a
// visible cursor on an absolute narration timeline, ffmpeg assembly (intro +
// lower-third + walkthrough + end card + captions), and the manifest record.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "../config.mjs";
import { login } from "./auth.mjs";
import { cursorInitScript, moveTo } from "./cursor.mjs";
import { generateSegments, buildVtt } from "./tts.mjs";
import { captureSupabaseAuth, deleteByName } from "./cleanup.mjs";
import * as ff from "./ffmpeg.mjs";

const LAUNCH_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

/**
 * spec: {
 *   id, title, summary, tags[], associatedRoutes[], routeWeight,
 *   prerequisites[], upNext[], upNextLabels[],
 *   segments: string[],                         // narration, one per step
 *   cleanup?: [{ table, column, value }],       // demo rows to delete first
 *   seed?: async ({ auth, page, get }) => any,  // optional pre-state (REST/UI)
 *   startUrl: string | async ({auth, seeded, get}) => string,
 *   readySelector?: string,                     // wait for this before timeline
 *   steps: Array<async (page, ctx) => void>,    // one per segment; ctx.move(loc)
 * }
 */
export async function runClip(spec) {
  const {
    id, title, segments, steps, startUrl,
    cleanup = [], seed, readySelector,
    summary = "", tags = [], associatedRoutes = [], routeWeight = 5,
    prerequisites = [], upNext = [], upNextLabels = [],
  } = spec;
  if (steps.length !== segments.length)
    throw new Error(`[${id}] steps (${steps.length}) must match segments (${segments.length})`);

  const work = path.join(OUT, id);
  const vidDir = path.join(work, "rec");
  await fs.rm(vidDir, { recursive: true, force: true });
  await fs.mkdir(vidDir, { recursive: true });

  console.log(`[${id}] 1) narration via Natasha…`);
  const segs = await generateSegments(segments, path.join(work, "audio"));

  console.log(`[${id}] 2) login + cleanup${seed ? " + seed" : ""}…`);
  const tmp = await chromium.launch({ headless: true });
  const tctx = await tmp.newContext({ viewport: VIEWPORT });
  const lp = await tctx.newPage();
  if (!(await login(lp))) { await tmp.close(); throw new Error(`[${id}] login failed`); }
  const cp = await tctx.newPage();
  const authP = captureSupabaseAuth(tctx);
  await cp.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
  await cp.waitForSelector('button:has-text("Add Employer")', { timeout: 30000 }).catch(() => {});
  const auth = await authP.catch(() => null);

  // Small REST GET helper for seeds / URL resolution.
  const get = async (pathAndQuery) => {
    if (!auth) return null;
    const res = await fetch(`${auth.origin}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: auth.apikey, Authorization: auth.authorization },
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  };

  if (auth) {
    for (const c of cleanup) {
      const r = await deleteByName(auth, c.table, c.column, c.value);
      console.log(`[${id}]    cleanup ${c.table}.${c.column}="${c.value}" → ${r.ok ? `deleted ${r.deleted}` : `status ${r.status}`}`);
    }
  } else {
    console.warn(`[${id}]    no Supabase auth captured — cleanup/seed skipped`);
  }
  let seeded = null;
  if (seed && auth) seeded = await seed({ auth, page: cp, get });
  const storageState = await tctx.storageState();
  await tmp.close();

  const url = typeof startUrl === "function" ? await startUrl({ auth, seeded, get }) : startUrl;

  console.log(`[${id}] 3) capture → ${url}`);
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const bctx = await browser.newContext({ viewport: VIEWPORT, storageState, recordVideo: { dir: vidDir, size: VIEWPORT } });
  await bctx.addInitScript(cursorInitScript);
  const page = await bctx.newPage();
  page.setDefaultTimeout(30000);

  const navStart = Date.now();
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
  if (readySelector) await page.waitForSelector(readySelector, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  const leadSec = (Date.now() - navStart) / 1000;

  const ctx = { move: (loc, o) => moveTo(page, loc, o), seeded, get, BASE_URL };
  const t0 = Date.now();
  let cum = 0;
  for (let i = 0; i < steps.length; i++) {
    cum += segs[i].duration;
    try { await steps[i](page, ctx); }
    catch (e) { console.warn(`[${id}]    step ${i} error: ${String(e).slice(0, 140)}`); }
    const w = Math.round(cum * 1000 - (Date.now() - t0));
    if (w > 0) await page.waitForTimeout(w);
  }
  await page.waitForTimeout(600);
  const video = page.video();
  await page.close();
  const recorded = await video.path();
  await bctx.close();
  await browser.close();

  console.log(`[${id}] 4) assemble (lead ${leadSec.toFixed(2)}s trimmed)…`);
  const audioOut = path.join(work, "narration.mp3");
  await ff.concatAudio(segs.map((s) => s.file), audioOut);
  const intro = path.join(work, "intro.mp4");
  const main = path.join(work, "main.mp4");
  const endc = path.join(work, "end.mp4");
  await ff.makeCard({ title, subtitle: "OffshoreAlliance How-to", seconds: 2.5, out: intro });
  await ff.makeCard({ title: "Up next", subtitle: upNextLabels.join("     ") || "More guides in the how-to hub", seconds: 4, out: endc });
  await ff.buildMain({ video: recorded, audio: audioOut, lowerThird: title, out: main, trimStart: leadSec });
  const finalOut = path.join(work, `${id}.mp4`);
  await ff.concatParts([intro, main, endc], finalOut);

  await fs.writeFile(path.join(work, `${id}.vtt`), buildVtt(segs, { lead: 2.5 }));
  await fs.writeFile(path.join(work, `${id}.transcript.txt`), segments.join("\n"));
  const durationSec = Math.round(await ff.durationOf(finalOut));
  const manifest = {
    id, title, series: id[0], durationSec, summary, tags,
    associatedRoutes, routeWeight, prerequisites, upNext,
    transcriptPath: `${id}.transcript.txt`, videoPath: `${id}.mp4`, downloadable: true,
  };
  await fs.writeFile(path.join(work, `${id}.manifest.json`), JSON.stringify(manifest, null, 2));
  console.log(`[${id}] DONE → ${finalOut} (${durationSec}s)`);
  return { id, finalOut, durationSec, manifest };
}
