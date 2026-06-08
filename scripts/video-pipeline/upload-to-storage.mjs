// Upload help-videos media to Supabase Storage in DEV and/or PROD.
// DEV: authenticated user token (captured via login) + the bucket's auth-write policy.
// PROD: service_role key read from apps/organising-db/.env.local (never printed).
// TARGET=dev|prod|both (default both).
import { chromium } from "playwright";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { BASE_URL, VIEWPORT, ROOT } from "./config.mjs";
import { login } from "./lib/auth.mjs";
import { captureSupabaseAuth } from "./lib/cleanup.mjs";

const MEDIA = path.resolve(ROOT, "../../apps/organising-db/public/help-videos");
const ENV_FILE = path.resolve(ROOT, "../../apps/organising-db/.env.local");
const BUCKET = "help-videos";
const mimeOf = (f) => (f.endsWith(".mp4") ? "video/mp4" : f.endsWith(".vtt") ? "text/vtt" : "text/plain");

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

async function uploadAll(label, { origin, apikey, token }) {
  const files = (await fsp.readdir(MEDIA)).filter((f) => /\.(mp4|vtt|txt)$/.test(f));
  let ok = 0, fail = 0;
  for (const f of files) {
    const body = await fsp.readFile(path.join(MEDIA, f));
    const res = await fetch(`${origin}/storage/v1/object/${BUCKET}/${encodeURIComponent(f)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, apikey, "content-type": mimeOf(f), "x-upsert": "true" },
      body,
    });
    if (res.ok) ok++;
    else { fail++; console.log(`  [${label}] FAIL ${f}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 140)}`); }
  }
  console.log(`[${label}] origin=${origin} → uploaded ${ok}, failed ${fail} (of ${files.length})`);
}

const target = process.env.TARGET || "both";

if (target === "dev" || target === "both") {
  const b = await chromium.launch({ headless: true });
  const c = await b.newContext({ viewport: VIEWPORT });
  const lp = await c.newPage();
  await login(lp);
  const cp = await c.newPage();
  const ap = captureSupabaseAuth(c);
  await cp.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
  await cp.waitForSelector('button:has-text("Add Employer")', { timeout: 30000 }).catch(() => {});
  const auth = await ap.catch(() => null);
  await b.close();
  if (!auth) throw new Error("DEV: could not capture Supabase auth");
  await uploadAll("DEV", { origin: auth.origin, apikey: auth.apikey, token: auth.authorization.replace(/^Bearer\s+/i, "") });
}

if (target === "prod" || target === "both") {
  const env = parseEnv(ENV_FILE);
  const origin = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error("PROD: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  if (!origin.includes("gteygwfgjvczanmrwgbr")) console.log(`  [PROD] note: .env.local URL is ${origin}`);
  await uploadAll("PROD", { origin, apikey: key, token: key });
}
console.log("UPLOAD_DONE");
