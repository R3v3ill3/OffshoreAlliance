// Workaround attempt: shim navigator.locks so the Supabase auth lock grants
// immediately (bypassing the getSession hang). Also captures the 400 response.
import { chromium } from "playwright";
import path from "node:path";
import { BASE_URL, VIEWPORT, OUT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });

// Replace navigator.locks with a pass-through that grants instantly.
await ctx.addInitScript(() => {
  try {
    const fake = {
      request: async (name, opts, cb) => {
        const callback = typeof opts === "function" ? cb === undefined ? opts : cb : cb;
        const realCb = typeof opts === "function" ? opts : cb;
        const fn = realCb || callback;
        const mode = typeof opts === "object" && opts && opts.mode ? opts.mode : "exclusive";
        return await fn({ name: typeof name === "string" ? name : "lock", mode });
      },
      query: async () => ({ held: [], pending: [] }),
    };
    Object.defineProperty(navigator, "locks", { value: fake, configurable: true });
  } catch (e) {}
});

const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const errs = [];
page.on("response", async (r) => {
  if (r.status() >= 400) {
    let body = "";
    try { body = (await r.text()).slice(0, 200); } catch {}
    errs.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 150)} :: ${body}`);
  }
});
page.on("console", (m) => {
  const t = m.text();
  if (/timeout|getSession|connection-monitor|lock|error|fail/i.test(t)) console.log("  C:", t.slice(0, 200));
});

const ok = await login(page);
console.log("login:", ok, "->", page.url());

await page.goto(`${BASE_URL}/employers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);

const s = await page.evaluate(() => ({
  records: (document.body.innerText.match(/(\d+)\s+records/i) || [])[0] || null,
  addBtn: !!Array.from(document.querySelectorAll("button")).find((b) => /add employer/i.test(b.innerText)),
  diag: (() => { try { return JSON.stringify(window.__supabaseFetchDiagnostics?.()?.state); } catch (e) { return "err:" + e.message; } })(),
}));
console.log("STATE (locks-shim):", JSON.stringify(s));
await page.screenshot({ path: path.join(OUT, "discovery", "41-locksshim-employers.png") });

console.log("\n=== 4xx/5xx responses ===");
console.log([...new Set(errs)].join("\n") || "(none)");

await browser.close();
console.log("LOCKS_TEST_DONE");
