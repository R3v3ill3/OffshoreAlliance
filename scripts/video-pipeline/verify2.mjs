// Full-console diagnostic of an ISOLATED /employers load (separate page so
// /campaigns noise doesn't bleed in). Shows every console line + auth/supabase
// network so we can see whether INITIAL_SESSION fires and what else hits getSession.
import { chromium } from "playwright";
import { BASE_URL, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });

const loginPage = await ctx.newPage();
const ok = await login(loginPage);
console.log("login:", ok, "->", loginPage.url());

// Fresh page in the SAME context (shares auth cookies) so /employers mounts clean.
const page = await ctx.newPage();
let t0 = Date.now();
const rel = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
page.on("console", (m) => console.log(`${rel()} [${m.type()}] ${m.text().slice(0, 240)}`));
page.on("response", (r) => {
  const u = r.url();
  if (/\/api\/auth\/refresh|\/auth\/v1\/|supabase\.co\/rest\/v1\/(employers|user_profiles)/.test(u)) {
    console.log(`${rel()} HTTP ${r.status()} ${u.replace(BASE_URL, "").slice(0, 90)}`);
  }
});

t0 = Date.now();
console.log("--- navigating to /employers ---");
await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);

const s = await page.evaluate(() => ({
  records: (document.body.innerText.match(/(\d+)\s+records/i) || [])[0] || null,
  addBtn: !!Array.from(document.querySelectorAll("button")).find((b) => /add employer/i.test(b.innerText)),
  // sidebar email is rendered from auth state if present
  sidebarHasEmail: /troyburton@gmail\.com/i.test(document.body.innerText),
  fetches: (() => { try { return window.__supabaseFetchDiagnostics?.()?.state?.recordedFetches; } catch { return "?"; } })(),
}));
console.log("\nFINAL STATE:", JSON.stringify(s));
await browser.close();
console.log("VERIFY2_DONE");
