// Diagnose why /employers shows 0 records + spinner in an automated session.
// Captures console messages, failed requests, and 4xx/5xx responses (esp. Supabase),
// then tries "Hard Refresh Connection" and a plain reload to see if data returns.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const DISC = path.join(OUT, "discovery");
await fs.mkdir(DISC, { recursive: true });

const console_msgs = [];
const failed = [];
const httpErrors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

page.on("console", (m) => console_msgs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
page.on("requestfailed", (r) =>
  failed.push(`${r.method()} ${r.url().slice(0, 160)} :: ${r.failure()?.errorText || "?"}`)
);
page.on("response", (r) => {
  const s = r.status();
  if (s >= 400) httpErrors.push(`${s} ${r.request().method()} ${r.url().slice(0, 180)}`);
});

async function recordsLine() {
  return await page.locator("text=/records/i").first().innerText().catch(() => "n/a");
}
async function hasAddBtn() {
  return (await page.locator('button:has-text("Add Employer"), button:has-text("Add employer")').count()) > 0;
}

await login(page);
console.log("logged in, now at:", page.url());

console.log("\n--- visit /employers (initial) ---");
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
console.log("records:", await recordsLine(), "| Add Employer button:", await hasAddBtn());
await page.screenshot({ path: path.join(DISC, "20-emp-initial.png") });

// Try the app's own remedy
const hard = page.locator('button:has-text("Hard Refresh Connection")').first();
if (await hard.count()) {
  console.log("\n--- clicking 'Hard Refresh Connection' ---");
  await hard.click().catch(() => {});
  await page.waitForTimeout(8000);
  console.log("records:", await recordsLine(), "| Add Employer button:", await hasAddBtn());
  await page.screenshot({ path: path.join(DISC, "21-emp-after-hardrefresh.png") });
}

// Try a plain reload
console.log("\n--- plain reload of /employers ---");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
console.log("records:", await recordsLine(), "| Add Employer button:", await hasAddBtn());
await page.screenshot({ path: path.join(DISC, "22-emp-after-reload.png") });

// Dump captured diagnostics
const report = {
  finalUrl: page.url(),
  httpErrors: [...new Set(httpErrors)].slice(0, 60),
  failedRequests: [...new Set(failed)].slice(0, 60),
  consoleTail: console_msgs.slice(-80),
};
await fs.writeFile(path.join(DISC, "diag-report.json"), JSON.stringify(report, null, 2));

console.log("\n=== HTTP ERRORS (4xx/5xx) ===");
console.log(report.httpErrors.join("\n") || "(none)");
console.log("\n=== FAILED REQUESTS ===");
console.log(report.failedRequests.join("\n") || "(none)");
console.log("\n=== CONSOLE (tail) ===");
console.log(report.consoleTail.join("\n") || "(none)");

await browser.close();
console.log("\nDIAG_DONE ->", path.join(DISC, "diag-report.json"));
