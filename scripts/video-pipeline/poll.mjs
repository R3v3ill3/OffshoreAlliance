// Poll /employers for up to 60s after login, logging the auth/connection recovery
// timeline — does the server-refresh fallback eventually load data?
import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, VIEWPORT, OUT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

let t0 = Date.now();
const rel = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/connection-monitor|AuthProvider|getSession|refresh|session|lock|recover|profile|api_|token_/i.test(t)) {
    logs.push(`${rel()} [${m.type()}] ${t.slice(0, 220)}`);
  }
});
page.on("response", (r) => {
  if (/\/api\/auth\/refresh/.test(r.url())) logs.push(`${rel()} HTTP ${r.status()} /api/auth/refresh`);
});

const ok = await login(page);
console.log("login:", ok, "->", page.url());

t0 = Date.now();
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => ({
    rec: (document.body.innerText.match(/(\d+)\s+records/i) || [])[0] || null,
    add: !!Array.from(document.querySelectorAll("button")).find((b) => /add employer/i.test(b.innerText)),
    fetches: (() => { try { return window.__supabaseFetchDiagnostics?.()?.state?.recordedFetches; } catch { return "?"; } })(),
  }));
  console.log(`${rel()} rec=${s.rec} add=${s.add} fetches=${s.fetches}`);
  if (s.add) { console.log(">>> RECOVERED (Add Employer button present)"); break; }
}

console.log("\n--- captured timeline ---");
console.log(logs.join("\n") || "(no relevant console events)");
await page.screenshot({ path: path.join(OUT, "discovery", "50-poll-final.png") });
await browser.close();
console.log("POLL_DONE");
