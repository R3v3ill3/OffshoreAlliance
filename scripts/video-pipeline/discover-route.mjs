// Generic discovery: ROUTE=/worksites CLICK="Add Worksite" READY='...' node discover-route.mjs
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, OUT, VIEWPORT } from "./config.mjs";
import { login } from "./lib/auth.mjs";

const ROUTE = process.env.ROUTE || "/worksites";
const CLICK = process.env.CLICK || "";
const READY = process.env.READY || "";
const NAME = process.env.NAME || ROUTE.replace(/\W+/g, "_");
const DISC = path.join(OUT, "discovery");
await fs.mkdir(DISC, { recursive: true });

function dumpFn() {
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70);
  const root = document.querySelector('[role="dialog"]') || document.body;
  const q = (sel) => Array.from(root.querySelectorAll(sel));
  return {
    scope: document.querySelector('[role="dialog"]') ? "dialog" : "page",
    title: txt(root.querySelector("h1,h2,[role=heading]") || root).slice(0, 80),
    inputs: q("input,textarea").map((i) => ({ id: i.id || null, type: i.getAttribute("type"), ph: i.getAttribute("placeholder") || null })),
    comboboxes: q('[role="combobox"], button[aria-haspopup="listbox"]').map((c) => ({ text: txt(c) })),
    labels: q("label").map((l) => ({ text: txt(l), for: l.getAttribute("for") })),
    buttons: q("button").map((b) => ({ text: txt(b) })).filter((b) => b.text),
    links: q('a[href]').map((a) => ({ text: txt(a), href: a.getAttribute("href") })).filter((a) => a.text).slice(0, 40),
  };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const lp = await ctx.newPage();
await login(lp);
const page = await ctx.newPage(); // fresh page (avoids same-tab nav transient)
page.setDefaultTimeout(30000);
await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded" });
if (READY) await page.waitForSelector(READY, { timeout: 30000 }).catch(() => console.log("READY not found"));
await page.waitForTimeout(1500);
console.log(`PAGE ${ROUTE}:`);
console.log(JSON.stringify(await page.evaluate(dumpFn), null, 1));
await page.screenshot({ path: path.join(DISC, `route_${NAME}.png`) });

if (CLICK) {
  await page.locator(`button:has-text("${CLICK}")`).first().click().catch((e) => console.log("CLICK failed:", String(e).slice(0, 80)));
  await page.waitForTimeout(1500);
  console.log(`\nAFTER CLICK "${CLICK}":`);
  console.log(JSON.stringify(await page.evaluate(dumpFn), null, 1));
  await page.screenshot({ path: path.join(DISC, `route_${NAME}_dialog.png`) });
}
await browser.close();
console.log("DISCOVER_DONE");
