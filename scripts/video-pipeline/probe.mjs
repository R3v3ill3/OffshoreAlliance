// Probe the Supabase dropout on /employers using the app's own diagnostics shims,
// and test whether "Hard Refresh Connection" restores data within an automated session.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");
await fs.mkdir(DISC, { recursive: true });

async function probeState(page) {
  return await page.evaluate(() => {
    const safe = (fn) => {
      try {
        const v = fn();
        return typeof v === "string" ? v : JSON.stringify(v);
      } catch (e) {
        return "ERR:" + e.message;
      }
    };
    const body = document.body.innerText;
    return {
      url: location.href,
      records: (body.match(/(\d+)\s+records/i) || [])[0] || null,
      hasAddEmployer: !!Array.from(document.querySelectorAll("button")).find((b) =>
        /add employer/i.test(b.innerText)
      ),
      hasSpinnerHint: /loading|connecting/i.test(body),
      diagState: safe(() => window.__diagState && window.__diagState()).slice(0, 1800),
      supaDiag: safe(() => window.__supabaseFetchDiagnostics && window.__supabaseFetchDiagnostics()).slice(0, 2500),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on("console", (m) => {
  const t = m.text();
  if (/error|fail|timeout|abort|stuck|reconnect|dropout|supabase/i.test(t)) console.log("  CONSOLE:", t.slice(0, 220));
});

const ok = await login(page);
console.log("login ok:", ok, "->", page.url());
if (!ok) {
  await page.screenshot({ path: path.join(DISC, "29-login-failed.png") });
  await browser.close();
  process.exit(2);
}

console.log("\n--- /employers (initial) ---");
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const s1 = await probeState(page);
console.log(JSON.stringify(s1, null, 2));
await page.screenshot({ path: path.join(DISC, "30-emp-probe-initial.png") });

const hard = page.locator('button:has-text("Hard Refresh Connection")').first();
if (await hard.count()) {
  console.log("\n--- clicking 'Hard Refresh Connection' ---");
  await hard.click().catch(() => {});
  await page.waitForTimeout(9000);
  const s2 = await probeState(page);
  console.log(JSON.stringify(s2, null, 2));
  await page.screenshot({ path: path.join(DISC, "31-emp-probe-afterhard.png") });
} else {
  console.log("  (no Hard Refresh Connection button found — app shell not loaded?)");
}

await fs.writeFile(path.join(DISC, "probe-result.json"), JSON.stringify({ initial: s1 }, null, 2));
await browser.close();
console.log("\nPROBE_DONE");
