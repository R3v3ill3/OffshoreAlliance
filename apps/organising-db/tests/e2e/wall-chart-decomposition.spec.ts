import { expect, test, type Page, type Request } from "@playwright/test";

import { STORAGE_STATE } from "../../playwright.config";
import { NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "./env";
import { restClientFor, sessionFromStorageState } from "./roles/campaign-cleanup";
import { withUserMode } from "./workspace-mode";

/**
 * WP2.3 — the browser-side half of the wall-chart decomposition baseline.
 *
 * The jsdom characterisation suite
 * (`src/components/campaigns/wall-chart/__tests__/`) pins what the chart
 * renders and does. It cannot see two things that this work package can
 * plausibly break, so they are pinned here instead:
 *
 *   1. **Load shape.** Splitting one module into eleven changes what the
 *      route's chunk graph looks like. This test records the requests the page
 *      makes, the JavaScript bytes it pulls, and how long it takes to paint a
 *      usable chart, and fails if the request count grows past the frozen
 *      ceiling — the signal that extraction introduced a waterfall.
 *   2. **Real browser interaction.** Radix's portals, focus management and
 *      pointer handling are shimmed away in jsdom. A real click on a real
 *      trigger is the only way to know the popovers still open after the
 *      controls move into their own components.
 *
 * **What this spec writes.** It is not read-only, and the distinction matters:
 *
 *   - **No campaign or domain write happens.** Mounting `WorkforceBoard` as a
 *     writer fires `POST /api/campaigns/1/sync-universe-workers`, which pulls
 *     workers from the campaign's employer/worksite universe into
 *     `campaign_worker_membership` and `campaign_worker_ou` — an upsert against
 *     the very rows the REST oracle below counts. That request is intercepted
 *     in the browser and fulfilled with the product's own success shape, so it
 *     never reaches the backend. The test asserts that, rather than assuming
 *     it.
 *   - **One reversible preference write does happen.** `withUserMode("full")`
 *     records the account's current `workspace_prefs`, pins `{ mode: "full" }`
 *     through the admin API for the suite, and restores exactly what it
 *     recorded in `afterAll` (tests/e2e/workspace-mode.ts). That is shared dev
 *     account state, not campaign data.
 *
 * The chart is opened directly on the approved deterministic dev campaign,
 * `/campaigns/1?tab=workforce&sub=wall-chart`. Going through `/my-campaigns`
 * and clicking `.first()` — as the earlier draft did — measured the portfolio
 * page's requests, its prefetches and whatever campaign happened to sort
 * first, none of which is the route under test.
 */

/** The approved deterministic dev campaign; never discovered at runtime. */
const CAMPAIGN_ID = 1;
const WALL_CHART_URL = `/campaigns/${CAMPAIGN_ID}?tab=workforce&sub=wall-chart`;
const SYNC_PATH = `/api/campaigns/${CAMPAIGN_ID}/sync-universe-workers`;

/**
 * The ceiling is on the requests that **load this route** — its document, its
 * `_next/static` chunks, its `/api` calls and its Supabase reads — and not on
 * the raw total.
 *
 * Why the raw total is the wrong metric here. Across the Stage 0 baseline runs
 * it ranged 109–148, and every extra request came from one of two sources that
 * have nothing to do with the wall chart:
 *
 *   - **Third-party chatter.** PostHog batching, Sentry envelopes (6 in one
 *     run, 22 in another) and the vercel.live preview toolbar keep talking for
 *     as long as the run happens to take.
 *   - **Next.js nav prefetching.** `next/link` opportunistically prefetches the
 *     sidebar's routes — `/dashboard`, `/worksites`, `/email/inbox`,
 *     `/upcoming-projects`, `/campaigns/1/sms/setup` and so on. Whether those
 *     land inside the quiet window is a matter of scheduling luck; they
 *     accounted for the whole 65→89 swing in same-origin requests between runs.
 *
 * A ceiling over that noise would have to be set so loose that a genuine
 * waterfall could hide beneath it. Route-load requests held at 89, 88 and 90
 * across the three baseline runs — 79 distinct URLs in every one — and they are
 * exactly what decomposition can change: one more chunk, one more API call, one
 * more Supabase round trip. The ceiling sits ~7% above the observed maximum.
 * Everything else is still counted and logged.
 *
 * See docs/organiser-ux-review/wp/wp2.3.md §9.5.
 */
const MAX_LOAD_REQUESTS = 96;

/** Analytics and preview-toolbar origins: recorded, but not part of the ceiling. */
const THIRD_PARTY_HOST = /(^|\.)posthog\.com$|(^|\.)sentry\.io$|(^|\.)vercel\.live$/u;

type RequestKind = "route-load" | "nav-prefetch" | "third-party";

/**
 * Which bucket a request falls in.
 *
 * "route-load" is the document for this campaign plus everything the route
 * pulls to render: build assets under `/_next/`, its own API routes, and the
 * dev Supabase REST origin. A same-origin GET for some *other* app path is a
 * `next/link` prefetch, not part of this page's load.
 */
function classify(request: Request): RequestKind {
  const url = new URL(request.url());
  if (THIRD_PARTY_HOST.test(url.host)) return "third-party";
  if (url.host.endsWith(".supabase.co")) return "route-load";
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return "route-load";
  if (url.pathname === `/campaigns/${CAMPAIGN_ID}`) return "route-load";
  // Static assets the layout itself references (fonts, images, video poster).
  if (/\.(?:png|gif|jpe?g|svg|webp|woff2?|mp4|ico|css)$/u.test(url.pathname)) return "route-load";
  return "nav-prefetch";
}

/** The chart is quiet once nothing new has been requested for this long. */
const QUIET_MS = 2_000;

/** Normalised so the list is comparable across runs and deployments. */
function normalizeRequest(request: Request): string {
  const url = new URL(request.url());
  const path = url.pathname
    // Next build-id and content-hash segments.
    .replace(/\/_next\/static\/[^/]+\//u, "/_next/static/<build>/")
    .replace(/-[0-9a-f]{8,}\./giu, "-<hash>.")
    // Campaign / worker / unit ids.
    .replace(/\b\d{2,}\b/gu, "<id>");
  return `${request.method()} ${url.host}${path}`;
}

function wallChartCardTitle(page: Page) {
  return page.getByText("Wall chart", { exact: true }).and(page.locator("div")).first();
}

/** Unit cards: the card class `CampaignUnitCard` renders, narrowed to the ones with a unit heading. */
function unitCards(page: Page) {
  return page.locator('[class*="break-inside-avoid"]').filter({ has: page.locator("h3") });
}

/**
 * What campaign 1 must render, computed from the database through the e2e
 * user's own dev session rather than hard-coded.
 *
 * `restClientFor` refuses the production project outright and returns null
 * (with a `[cleanup]` line saying why) when global setup did not capture the
 * REST config, so a run without the oracle skips rather than silently
 * asserting nothing.
 */
interface WallChartOracle {
  /** Every unit on the campaign, in `display_order, name` order. */
  units: { ou_id: number; name: string; parent_ou_id: number | null; is_group_container: boolean }[];
  /** Unit cards the chart renders with default (empty) per-browser view state. */
  expectedCardNames: string[];
  /** `campaign_worker_ou` rows joined to this campaign — one tile each. */
  assignmentRows: number;
  /** Members with no `campaign_worker_ou` row — one tile each, in the Unassigned card. */
  unassignedMembers: number;
  /** Tiles the chart must render. */
  expectedTiles: number;
}

async function readOracle(
  request: Parameters<typeof restClientFor>[0]
): Promise<WallChartOracle | null> {
  const client = restClientFor(request, sessionFromStorageState(STORAGE_STATE));
  if (!client) return null;

  const ous = await client.get(
    `/rest/v1/campaign_organising_units?campaign_id=eq.${CAMPAIGN_ID}` +
      "&select=ou_id,name,parent_ou_id,is_group_container,display_order&order=display_order,name"
  );
  expect(ous.status, "campaign_organising_units must be readable by the e2e user").toBe(200);
  const members = await client.get(
    `/rest/v1/campaign_worker_membership?campaign_id=eq.${CAMPAIGN_ID}&select=worker_id`
  );
  expect(members.status, "campaign_worker_membership must be readable by the e2e user").toBe(200);
  // campaign_worker_ou has no campaign_id of its own; it is scoped through its unit.
  const assignments = await client.get(
    "/rest/v1/campaign_worker_ou?select=ou_id,worker_id,campaign_organising_units!inner(campaign_id)" +
      `&campaign_organising_units.campaign_id=eq.${CAMPAIGN_ID}`
  );
  expect(assignments.status, "campaign_worker_ou must be readable by the e2e user").toBe(200);

  const units = ous.body as WallChartOracle["units"];
  const memberIds = new Set((members.body as { worker_id: number }[]).map((m) => m.worker_id));
  const assignmentRowList = assignments.body as { ou_id: number; worker_id: number }[];
  const assignedIds = new Set(assignmentRowList.map((a) => a.worker_id));
  const unassignedMembers = [...memberIds].filter((w) => !assignedIds.has(w)).length;

  /**
   * Which units get a card, from `campaign-wall-chart.tsx`:
   *   - only `parent_ou_id == null` units render at the top level (the rest are
   *     nested inside their parent's card);
   *   - a top-level unit's children render as their own cards only when the
   *     parent's hierarchy view is "subunit", whose default is
   *     `ou.is_group_container`. A fresh Playwright context has no localStorage,
   *     so the default is what applies and no unit is hidden.
   * Deeper descendants need an explicit per-unit expansion click, so they are
   * not counted.
   */
  const childrenOf = new Map<number, WallChartOracle["units"]>();
  for (const u of units) {
    if (u.parent_ou_id == null) continue;
    const siblings = childrenOf.get(u.parent_ou_id) ?? [];
    siblings.push(u);
    childrenOf.set(u.parent_ou_id, siblings);
  }
  const expectedCardNames: string[] = [];
  for (const u of units.filter((x) => x.parent_ou_id == null)) {
    expectedCardNames.push(u.name);
    if (u.is_group_container) {
      for (const child of childrenOf.get(u.ou_id) ?? []) expectedCardNames.push(child.name);
    }
  }

  return {
    units,
    expectedCardNames,
    assignmentRows: assignmentRowList.length,
    unassignedMembers,
    // One tile per assignment row (a worker in two units gets two tiles), plus
    // one per member the chart shows under "Unassigned workers".
    expectedTiles: assignmentRowList.length + unassignedMembers,
  };
}

test.describe("Wall chart decomposition baseline", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  // The chart under test is the full-mode workspace's, as in wall-chart.spec.ts.
  // This makes and restores one dev preference write; see the header.
  withUserMode("full");

  /**
   * Stops the background universe sync from writing to the campaign, and
   * records that it did. Returns a live counter plus the guarantee that every
   * matching request was answered here rather than by the backend.
   */
  async function interceptUniverseSync(page: Page) {
    const state = {
      fulfilled: 0,
      requested: 0,
      serverAnswered: [] as string[],
      /** Every sync the page asked for was answered by the handler below. */
      allIntercepted(): boolean {
        return this.requested > 0 && this.fulfilled === this.requested;
      },
    };

    page.on("request", (r) => {
      if (new URL(r.url()).pathname === SYNC_PATH) state.requested += 1;
    });
    // A fulfilled response carries only the headers set below. A response that
    // reached Vercel carries its own (`x-vercel-id`, `server`, …), so their
    // presence is direct evidence the interception leaked.
    page.on("response", async (res) => {
      if (new URL(res.url()).pathname !== SYNC_PATH) return;
      const headers = res.headers();
      const serverish = ["x-vercel-id", "x-vercel-cache", "server", "x-matched-path"].filter(
        (h) => headers[h] !== undefined
      );
      if (serverish.length > 0) state.serverAnswered.push(serverish.join(","));
    });

    await page.route(`**${SYNC_PATH}`, async (route) => {
      state.fulfilled += 1;
      // The exact shape workforce-board.tsx's queryFn parses: `success` must be
      // truthy or it throws, and `workersAdded: 0` means it invalidates
      // nothing — so the load shape stays the one the product produces when
      // the universe is already in sync.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, workersAdded: 0 }),
      });
    });

    return state;
  }

  test("load census: requests, JavaScript bytes and time to a usable chart", async ({
    page,
    request,
  }) => {
    // The oracle runs before the clock starts; its REST calls are made from
    // the API context, not the page, so they are not in the census.
    const oracle = await readOracle(request);
    test.skip(
      !oracle,
      "Skipped: no REST client for the signed-in session (see the [cleanup] line above); the census must be checked against the database, not against itself."
    );
    if (!oracle) return;
    console.log(
      `[wp2.3] oracle ${JSON.stringify({
        units: oracle.units.length,
        topLevel: oracle.units.filter((u) => u.parent_ou_id == null).length,
        groupContainers: oracle.units.filter((u) => u.is_group_container).length,
        expectedCards: oracle.expectedCardNames.length,
        assignmentRows: oracle.assignmentRows,
        unassignedMembers: oracle.unassignedMembers,
        expectedTiles: oracle.expectedTiles,
      })}`
    );

    const sync = await interceptUniverseSync(page);

    const requests: string[] = [];
    const routeLoad: string[] = [];
    const kindCounts: Record<RequestKind, number> = {
      "route-load": 0,
      "nav-prefetch": 0,
      "third-party": 0,
    };
    let lastRequestAt = Date.now();
    let scriptBodyBytes = 0;

    page.on("request", (r) => {
      const normalized = normalizeRequest(r);
      requests.push(normalized);
      const kind = classify(r);
      kindCounts[kind] += 1;
      if (kind === "route-load") routeLoad.push(normalized);
      lastRequestAt = Date.now();
    });
    page.on("response", async (response) => {
      if (response.request().resourceType() !== "script") return;
      try {
        const length = response.headers()["content-length"];
        scriptBodyBytes += length ? Number(length) : (await response.body()).byteLength;
      } catch {
        // A response body can be gone by the time we ask (redirects, aborts).
        // Missing one script is a smaller problem than failing the census.
      }
    });

    const started = Date.now();
    await page.goto(WALL_CHART_URL);
    await expect(page).toHaveURL(/\/campaigns\/1\?.*sub=wall-chart/, { timeout: 30_000 });
    await expect(wallChartCardTitle(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible({
      timeout: 30_000,
    });
    // A card is the first thing the chart renders that proves data arrived.
    await expect(unitCards(page).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-worker-id]").first()).toBeVisible({ timeout: 30_000 });

    // Network quiet: a usable chart is visible AND nothing new has been
    // requested for QUIET_MS. Event-driven off the request listener above —
    // a fixed sleep would only assume quiet, and would also bake its own
    // duration into the elapsed figure.
    await expect
      .poll(() => Date.now() - lastRequestAt, {
        message: `the chart must stop requesting for ${QUIET_MS} ms`,
        timeout: 30_000,
        intervals: [100],
      })
      .toBeGreaterThanOrEqual(QUIET_MS);
    // The clock stops at the last request, not at the end of the quiet window.
    const elapsed = lastRequestAt - started;

    /**
     * Resource Timing, the plan's metric (§6.2). Script entries are picked
     * lexically by pathname so the filter does not depend on `initiatorType`,
     * which varies with how a chunk was pulled in (preload vs import).
     *
     * Caveats, both of which make these numbers a floor:
     *   - `transferSize` is 0 for a memory/disk cache hit and includes response
     *     headers (~300 B/entry) when it is not;
     *   - both are 0 for a cross-origin resource served without
     *     `Timing-Allow-Origin`, which is why the third-party totals are
     *     reported separately from the app's own `_next/static` chunks.
     */
    const timing = await page.evaluate(() => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const isScript = (name: string) => {
        try {
          return new URL(name).pathname.endsWith(".js");
        } catch {
          return false;
        }
      };
      const scripts = entries.filter((e) => isScript(e.name));
      const sum = (list: PerformanceResourceTiming[], key: "transferSize" | "encodedBodySize") =>
        list.reduce((total, e) => total + (e[key] || 0), 0);
      const own = scripts.filter((e) => e.name.includes("/_next/static/"));
      return {
        scriptEntries: scripts.length,
        transferSize: sum(scripts, "transferSize"),
        encodedBodySize: sum(scripts, "encodedBodySize"),
        ownChunkEntries: own.length,
        ownTransferSize: sum(own, "transferSize"),
        ownEncodedBodySize: sum(own, "encodedBodySize"),
        zeroTransfer: scripts.filter((e) => !e.transferSize).length,
      };
    });

    const census = {
      requests: requests.length,
      routeLoadRequests: kindCounts["route-load"],
      navPrefetchRequests: kindCounts["nav-prefetch"],
      thirdPartyRequests: kindCounts["third-party"],
      distinctRequests: new Set(requests).size,
      distinctRouteLoad: new Set(routeLoad).size,
      elapsedMs: elapsed,
      unitCards: await unitCards(page).count(),
      tiles: await page.locator("[data-worker-id]").count(),
      syncRequested: sync.requested,
      syncFulfilledLocally: sync.fulfilled,
    };
    console.log(`[wp2.3] load census ${JSON.stringify(census)}`);
    console.log(`[wp2.3] resource timing ${JSON.stringify(timing)}`);
    console.log(
      `[wp2.3] script bytes: resourceTiming.encodedBodySize=${timing.encodedBodySize} ` +
        `transferSize=${timing.transferSize} responseBodies=${scriptBodyBytes}`
    );
    // The route-load list is the frozen baseline; the rest is logged for context.
    console.log(`[wp2.3] route-load list\n${[...new Set(routeLoad)].sort().join("\n")}`);
    console.log(
      `[wp2.3] excluded list\n${[...new Set(requests.filter((r) => !routeLoad.includes(r)))]
        .sort()
        .join("\n")}`
    );
    test.info().annotations.push({ type: "wp2.3-census", description: JSON.stringify(census) });
    test.info().annotations.push({ type: "wp2.3-timing", description: JSON.stringify(timing) });

    // 1. The universe sync was intercepted every time, so nothing was written.
    expect(sync.requested, "WorkforceBoard must fire the universe sync as a writer").toBeGreaterThan(
      0
    );
    expect(
      sync.allIntercepted(),
      `every sync request must have been answered by the interceptor (requested ${sync.requested}, fulfilled ${sync.fulfilled})`
    ).toBe(true);
    expect(
      sync.serverAnswered,
      "a sync response carrying server headers means the interception leaked and the campaign may have been written to"
    ).toEqual([]);

    // 2. The chart rendered what the database says it should.
    expect(oracle.expectedTiles, "campaign 1 must have at least one tile to render").toBeGreaterThan(
      0
    );
    expect(
      census.tiles,
      `tiles must equal campaign_worker_ou rows (${oracle.assignmentRows}) plus members with no assignment (${oracle.unassignedMembers})`
    ).toBe(oracle.expectedTiles);
    expect(
      (await unitCards(page).locator("h3").allTextContents()).map((t) => t.trim()).sort(),
      "the rendered unit cards must be exactly the units the database says render by default"
    ).toEqual([...oracle.expectedCardNames].sort());

    // 3. The load shape.
    expect(
      census.routeLoadRequests,
      `loading the wall chart took ${census.routeLoadRequests} route-load requests (of ${census.requests} total, ${census.navPrefetchRequests} nav prefetches and ${census.thirdPartyRequests} third-party); the frozen Stage 0 ceiling is ${MAX_LOAD_REQUESTS}. A jump here means extraction introduced a request waterfall.`
    ).toBeLessThanOrEqual(MAX_LOAD_REQUESTS);
  });

  test("browser-only interaction: portalled controls open, and view state survives a reload", async ({
    page,
  }) => {
    const sync = await interceptUniverseSync(page);

    await page.goto(WALL_CHART_URL);
    await expect(wallChartCardTitle(page)).toBeVisible({ timeout: 30_000 });

    // 1. A Radix Select trigger — a portal, focus trap and pointer handling
    //    that jsdom cannot exercise.
    const assessment = page.getByRole("combobox").first();
    await expect(assessment).toBeVisible({ timeout: 30_000 });
    await assessment.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();

    // 2. The %/# toggle is local view state persisted to localStorage; a real
    //    reload is the only way to prove the round trip.
    const counts = page.getByRole("button", { name: "#", exact: true });
    const percentages = page.getByRole("button", { name: "%", exact: true });
    await expect(percentages).toHaveAttribute("aria-pressed", "true");

    await counts.click();
    await expect(counts).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(wallChartCardTitle(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "#", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Put the account's browser state back the way it was found.
    await page.getByRole("button", { name: "%", exact: true }).click();
    await expect(page.getByRole("button", { name: "%", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Two page loads, so the sync fires twice; neither may reach the backend.
    expect(sync.serverAnswered, "the universe sync must never reach the backend").toEqual([]);
    expect(sync.allIntercepted()).toBe(true);
  });
});
