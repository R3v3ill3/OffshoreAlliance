import { resolve } from "node:path";

import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

import { groupMyCampaigns, type MyCampaignRosterRow, type MyCampaignRow } from "@/lib/campaign/my-campaigns";
import { HINT_BY_ID } from "@/lib/hints/registry";
import { LANDING_PARAM } from "@/lib/workspace/landing";
import { resolveWorkspace, type WorkspaceMode } from "@/lib/workspace/resolve";
import type { UserRole, WorkRole } from "@/types/organising-row-types";

import { ADMIN_STORAGE_STATE, E2E_BASE_URL, STORAGE_STATE } from "../../playwright.config";
import {
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";
import { restClientFor, sessionFromStorageState, type RestClient } from "./roles/campaign-cleanup";

/**
 * Canonical flow one, phase-1 form (WP0.2 → WP1.3): sign in and reach a wall
 * chart in under ten seconds.
 *
 * Test A performs its own login (empty storage state) so the budget is
 * measured from the sign-in submit, not from a restored session. After the
 * submit the landing gate at `/` sends the account to one of three places,
 * and all three are asserted — the operator may or may not have flipped this
 * account to organiser mode, and the account owns exactly one dev campaign:
 *   1. `/campaigns/{id}?…`   organiser mode + one campaign: My campaigns'
 *                            landing hop (landing.ts L4) opened the chart;
 *   2. `/my-campaigns`       organiser mode + several campaigns: click "Open wall chart";
 *   3. `/campaigns`          full mode: today's path, unchanged — click the first row.
 *
 * Which branch is *correct* is not the page's word to take: with the admin
 * storage state present, the spec reads the account's role, work_role and
 * workspace_prefs from GET /api/admin/users and the org defaults from
 * GET /api/admin/workspace-defaults, resolves the mode with the product's own
 * `resolveWorkspace()`, counts "my" campaigns through the REST config global
 * setup captured, and asserts the branch matches. Without the admin state
 * that oracle is skipped and the three branches are merely accepted.
 *
 * Test B visits `/my-campaigns` directly with the shared signed-in session.
 * It is mode-independent: the route exists in both modes and, without
 * `?from=landing`, the single-campaign auto-open cannot fire (landing.ts L4).
 * The WP0.3 Overview round-trip (test C in the plan) is appended to it.
 *
 * Every selector is an anchor the product already relies on — the "Wall
 * chart" card title, the "Campaign summary" heading, aria-pressed on the
 * view toggle, the "Open wall chart" link text, the "In a unit" stat label and
 * the data-worker-id / data-ou-id hooks the wall chart's own scroll and
 * overlay code queries. No data-testid is added to production markup.
 *
 * The content assertion accepts the Unassigned card OR any tile, because at
 * instigation it is common for 100% of the membership to be Unassigned. It
 * does require the campaign to have at least one member.
 */

/**
 * The card title is a <div> (CardTitle); the view-toggle <button> carries the
 * same string, so scope to the div and take the first match rather than
 * tripping Playwright's strict mode.
 */
function wallChartCardTitle(page: Page) {
  return page.getByText("Wall chart", { exact: true }).and(page.locator("div")).first();
}

/** The three structural wall-chart assertions every test ends on. */
async function expectWallChart(page: Page) {
  await expect(wallChartCardTitle(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
}

/** Where the landing gate can send a signed-in account. */
const POST_LOGIN_URL = /\/(my-campaigns|campaigns)(\/|\?|$)/;

/**
 * The account's expected landing, from the admin API and the product's own
 * resolver. `mineCount` is null when the REST config global setup writes is
 * missing (the count needs a user-session query, not an admin one).
 */
type ExpectedLanding =
  | { mode: "full" }
  | { mode: "organiser"; mineCount: number | null };

async function expectedLandingFor(
  browser: Browser,
  request: APIRequestContext
): Promise<ExpectedLanding | null> {
  if (!hasE2EAdminCredentials) return null;
  const admin = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: resolve(__dirname, "../..", ADMIN_STORAGE_STATE),
  });
  try {
    const list = await admin.request.get("/api/admin/users");
    expect(list.ok(), "the admin account must be able to list users").toBeTruthy();
    const { users } = (await list.json()) as {
      users: {
        user_id: string;
        email?: string;
        role: UserRole;
        work_role: string | null;
        workspace_prefs?: unknown;
        organiser_id: number | null;
      }[];
    };
    const row = users.find((u) => u.email?.toLowerCase() === E2E_USER_EMAIL.toLowerCase());
    expect(row, "the E2E_USER account must exist on dev").toBeTruthy();
    if (!row) return null;

    const defaults = await admin.request.get("/api/admin/workspace-defaults");
    expect(defaults.ok(), "the admin account must be able to read the workspace defaults").toBeTruthy();
    const mode: WorkspaceMode = resolveWorkspace({
      role: row.role,
      workRole: (row.work_role ?? null) as WorkRole | null,
      orgDefaults: await defaults.json(),
      userPrefs: row.workspace_prefs,
      sessionShowEverything: false,
    }).mode;
    if (mode === "full") return { mode };

    // "My" campaigns, the way useMyCampaigns builds them (owner column or a
    // campaign_organisers row for my organiser_id), through the pure grouper.
    if (row.organiser_id == null) return { mode, mineCount: 0 };
    const rest = restClientFor(request, sessionFromStorageState(STORAGE_STATE));
    if (!rest) return { mode, mineCount: null };
    const roster = await rest.get(
      `/rest/v1/campaign_organisers?organiser_id=eq.${row.organiser_id}&select=campaign_id,organiser_id,campaign_role`
    );
    expect(roster.status, "campaign_organisers must be readable by the e2e user").toBe(200);
    const rosterRows = roster.body as MyCampaignRosterRow[];
    const rosterIds = [...new Set(rosterRows.map((r) => r.campaign_id))];
    const filter =
      rosterIds.length > 0
        ? `or=(organiser_id.eq.${row.organiser_id},campaign_id.in.(${rosterIds.join(",")}))`
        : `organiser_id=eq.${row.organiser_id}`;
    const campaigns = await rest.get(
      `/rest/v1/campaigns?${filter}&is_sms_episode=eq.false&select=campaign_id,name,campaign_type,status,is_standing,is_sms_episode,start_date,end_date,total_worker_estimate,organiser_id,created_at,archived_at`
    );
    expect(campaigns.status, "campaigns must be readable by the e2e user").toBe(200);
    const { mine } = groupMyCampaigns({
      campaigns: campaigns.body as MyCampaignRow[],
      rosterRows,
      myOrganiserId: row.organiser_id,
      reportOrganiserIds: [],
    });
    return { mode, mineCount: mine.length };
  } finally {
    await admin.close();
  }
}

test.describe("Wall chart — flow one, from the login submit", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  // Own login: the budget starts at the submit, not at a restored session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sign in and reach a wall chart in under ten seconds", async ({
    page,
    browser,
    request,
  }) => {
    // Read the oracle before the clock starts; it is not part of the budget.
    const expected = await expectedLandingFor(browser, request);

    await page.goto("/login");
    // Selectors from src/app/(auth)/login/page.tsx, as in global-setup.ts.
    await page.locator("#email").fill(E2E_USER_EMAIL);
    await page.locator("#password").fill(E2E_USER_PASSWORD);
    const t0 = Date.now();
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(POST_LOGIN_URL, { timeout: 20_000 });
    // The gate's organiser-mode hop is `/my-campaigns?from=landing`, and the
    // page then replaces that with either the single campaign's chart or the
    // bare `/my-campaigns` once its query resolves. Reading the URL before
    // the param is gone would race that second hop (and could never observe
    // branch 1), so wait for it to settle first.
    await page.waitForURL(
      (u) => POST_LOGIN_URL.test(u.pathname) && !u.searchParams.has(LANDING_PARAM),
      { timeout: 30_000 }
    );
    const url = new URL(page.url());

    if (expected) {
      const branch = `landed on ${url.pathname} (account resolves to ${expected.mode} mode${
        expected.mode === "organiser" ? `, ${expected.mineCount ?? "?"} of my campaigns` : ""
      })`;
      if (expected.mode === "full") {
        expect(url.pathname, branch).toBe("/campaigns");
      } else if (expected.mineCount === 1) {
        expect(url.pathname, branch).toMatch(/^\/campaigns\/\d+$/);
      } else if (expected.mineCount != null) {
        expect(url.pathname, branch).toBe("/my-campaigns");
      } else {
        expect(url.pathname, branch).toMatch(/^\/(my-campaigns|campaigns\/\d+)$/);
      }
    }

    if (/^\/campaigns\/\d+$/.test(url.pathname)) {
      // 1. organiser mode + exactly one campaign — My campaigns' landing hop
      //    (landing.ts L4) already opened the chart; nothing to click.
    } else if (url.pathname === "/my-campaigns") {
      // 2. organiser mode + several campaigns — one honest link per card.
      await page.getByRole("link", { name: "Open wall chart" }).first().click();
    } else {
      // 3. full mode — today's path, unchanged: the dashboard's per-campaign
      //    row, as phase 0 clicked it. Scoped to the row that carries the
      //    wall-chart link because the DataTable further down renders a
      //    spinner row (and a "No results found." row) as `tbody tr` too,
      //    and after the gate's soft navigation the campaigns query is still
      //    in flight — a bare `table tbody tr` matched that spinner row,
      //    which has no click handler, so the click landed and nothing moved.
      const rows = page.locator("table tbody tr", {
        has: page.locator('a[href*="sub=wall-chart"]'),
      });
      await expect(
        rows.first(),
        "Expected at least one campaign row on /campaigns. The e2e account must be able to see a dev campaign with at least one member (WP0.2 open question Q2)."
      ).toBeVisible({ timeout: 30_000 });
      await rows.first().click();
    }

    // Branch 1 lands on the explicit tab/sub URL too (landing.ts L3), but a
    // bare /campaigns/{id} would still be the chart, so the query is optional.
    await expect(page).toHaveURL(/\/campaigns\/\d+(\?.*tab=workforce.*sub=wall-chart)?/, {
      timeout: 30_000,
    });
    await expectWallChart(page);

    // After the visibility assertions on purpose: a failure here says "it was
    // slow", not "the chart never appeared".
    expect(Date.now() - t0, "login → wall chart must be under 10 s").toBeLessThan(10_000);
  });
});

test.describe("My campaigns", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  test("lists my campaigns and opens the wall chart", async ({ page }) => {
    await page.goto("/my-campaigns");
    // header.tsx renders the page title as the h1.
    await expect(page.getByRole("heading", { name: "My campaigns" })).toBeVisible();

    const card = page.getByRole("link", { name: "Open wall chart" }).first();
    await expect(
      card,
      "the e2e account must be on at least one dev campaign (campaign_organisers or campaigns.organiser_id)"
    ).toBeVisible({ timeout: 30_000 });
    // The four-number strip.
    await expect(page.getByText("In a unit").first()).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/, {
      timeout: 30_000,
    });
    await expectWallChart(page);

    // One CSS selector, then .first(): `.first().or(...)` binds .first() to the
    // left operand only, so when both a tile and the Unassigned card exist the
    // locator resolves to two elements and trips strict mode. The wall chart's
    // members and OU queries run after the page mounts, so give them the same
    // 30s the navigation gets.
    await expect(
      page.locator('[data-worker-id], [data-ou-id="unassigned"]').first(),
      "Expected at least one worker tile or the Unassigned card. A campaign with zero members renders neither (WP0.2 open question Q2)."
    ).toBeVisible({ timeout: 30_000 });

    // Overview round-trip (WP0.3 hand-off), kept verbatim. Vitest cannot cover
    // this: it is the URL contract between the tab list and the resolved tab
    // state.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).toHaveURL(/tab=overview/);

    await page.getByRole("tab", { name: "Workforce" }).click();
    await page.getByRole("tab", { name: "Wall Chart / List" }).click();
    await expect(page).toHaveURL(/sub=wall-chart/);
    await expect(wallChartCardTitle(page)).toBeVisible();
  });
});

/**
 * WP1.7 — the first-use rating hint shows once per user, then stays dismissed.
 *
 * The copy is the literal sentence from the registry, so the spec and the
 * product cannot drift. The dismissal row is reset through the same signed-in
 * session via `restClientFor` (which refuses the production project outright)
 * both before and after each test, using the owner-only DELETE policy the
 * WP1.7 migration adds. Without a REST client the tests skip rather than run
 * without a reset: a spec that cannot clean up must not run twice.
 *
 * Precondition the operator must know: the dev e2e account's campaign must
 * have at least one worker tile AND the account must have write access, or
 * the hint correctly does not render and the assertion below says so.
 *
 * Fix round 1 (findings 1, 2, 11): two tests, because opening the rating
 * control dismisses the hint by design, so "Got it" and "click the badge"
 * cannot both be exercised on one visible hint. Each asserts that neither
 * the worker sheet (a `role=dialog` whose heading is the worker's name,
 * `campaign-worker-detail-provider.tsx` SheetTitle) nor anything else opened
 * by mistake; the badge test asserts that the rating popover — the element
 * the badge's `aria-controls` points at, containing the "Save" button of
 * `inline-rating-popover.tsx` — opened on the first click.
 */
test.describe("Wall chart — first-use rating hint", () => {
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);

  const HINT_ID = "wall_chart_rating";
  const HINT_COPY = HINT_BY_ID[HINT_ID].copy;
  const dismissalPath = (userId: string) =>
    `/rest/v1/user_hint_dismissals?hint_id=eq.${HINT_ID}&user_id=eq.${userId}&select=hint_id`;

  let rest: RestClient | null = null;

  test.beforeEach(async ({ request }) => {
    rest = restClientFor(request, sessionFromStorageState(STORAGE_STATE));
    test.skip(
      !rest,
      "Skipped: no REST client for the signed-in session (see the [cleanup] line above); the hint spec must be able to reset its own dismissal."
    );
    if (!rest) return;
    const reset = await rest.delete(dismissalPath(rest.session.userId));
    expect(
      [200, 204],
      `resetting the hint dismissal must succeed (got ${reset.status}: ${JSON.stringify(reset.body)})`
    ).toContain(reset.status);
  });

  test.afterEach(async () => {
    if (!rest) return;
    await rest.delete(dismissalPath(rest.session.userId));
  });

  /** Opens the e2e account's first campaign on the wall chart and waits for the hint. */
  async function openWallChartWithHint(page: Page) {
    await page.goto("/my-campaigns");
    const card = page.getByRole("link", { name: "Open wall chart" }).first();
    await expect(
      card,
      "the e2e account must be on at least one dev campaign (campaign_organisers or campaigns.organiser_id)"
    ).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page).toHaveURL(/\/campaigns\/\d+\?.*tab=workforce.*sub=wall-chart/, {
      timeout: 30_000,
    });
    await expectWallChart(page);
    await expect(
      page.locator('[data-worker-id], [data-ou-id="unassigned"]').first(),
      "Expected at least one worker tile or the Unassigned card."
    ).toBeVisible({ timeout: 30_000 });

    // The hinted tile: the anchor wrapper (`first-use-hint.tsx`,
    // data-hint-anchor) is rendered whether or not the hint is visible and
    // sits inside exactly one [data-worker-id] tile, whose badge is the span
    // with role=button (`worker-tile.tsx` largeBadge).
    const anchor = page.locator(`[data-hint-anchor="${HINT_ID}"]`);
    await expect(
      anchor,
      "the hint anchor must render: the e2e account's campaign needs at least one worker tile and the account needs write access to it"
    ).toHaveCount(1, { timeout: 30_000 });
    // One hint, not one per tile. (`toBeVisible` is not "in the viewport":
    // the callout can be below the fold with its anchor and still pass.)
    const hint = page.getByText(HINT_COPY, { exact: true });
    await expect(hint, "the first-use rating hint must render").toBeVisible({ timeout: 30_000 });
    await expect(hint).toHaveCount(1);

    // Fix round 2: the anchor tile can be below the fold, and the callout is
    // positioned next to it, so "Got it" would be off-screen too (verifier
    // run 2: "element is outside of the viewport" on every retry). The
    // product now brings the anchor into view when the hint appears
    // (`first-use-hint.tsx`); give it a moment and report what it did — the
    // line is evidence for a preview that carries the change, not an
    // assertion, so the spec still passes on one that does not. Then scroll
    // anyway (belt and braces), which proves the callout independently.
    const productScrolled = await waitForAnchorClear(anchor, 3_000);
    console.log(`[hint] anchor clear before the spec scrolled: ${productScrolled ? "yes" : "no"}`);
    await bringAnchorIntoView(page, anchor);

    // The worker's name, the same first+last string the sheet uses as its
    // heading: `data-worker-name` on the tile root (`worker-tile.tsx`, fix
    // round 2) when the build carries it, else the text of the name span —
    // the `line-clamp-2` span beside the cumulative dot inside the tile
    // button (`worker-tile.tsx`, `{displayName}`). Not parsed out of the
    // button's `title`: a name containing ". " (initials) would be cut short.
    const tile = page.locator("[data-worker-id]").filter({ has: anchor });
    const workerName = (
      (await tile.getAttribute("data-worker-name")) ??
      (await tile.getByRole("button").first().locator("span.line-clamp-2").first().textContent()) ??
      ""
    ).trim();
    expect(workerName, "the hinted tile must carry the worker's name").not.toBe("");
    const badge = anchor.getByRole("button").first();
    const workerSheet = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: workerName, exact: true }) });
    return { hint, badge, workerName, workerSheet };
  }

  /**
   * Scrolls the hinted tile into view and waits until it is really there.
   *
   * One scroll is not enough on this page: the campaign
   * summary above the tiles is sticky and collapses when its sentinel leaves
   * the viewport (`campaign-wall-chart.tsx`, `isSummaryStuck`), with scroll
   * anchoring disabled, so a scroll that carries the sentinel across the
   * viewport edge is followed by a layout shift of everything below it. A
   * tile centred by the first scroll can end up behind the stuck bar (where
   * Playwright's click hits the bar, retries with another alignment, and
   * the re-expansion pushes the rating popover below the fold — the badge
   * test's failure on the fix-round-2 preview run). So: scroll, let the
   * re-layout happen, and accept only when the anchor is fully inside the
   * viewport and the element under its centre is the anchor itself, on two
   * checks in a row; otherwise scroll again, at most three times. The scroll
   * is an explicit `scrollIntoView({ block: "center" })`, not Playwright's
   * `scrollIntoViewIfNeeded()`: "if needed" is geometric, and a badge behind
   * the stuck bar is inside the viewport rect, so it would never move again.
   */
  async function bringAnchorIntoView(page: Page, anchor: Locator) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await anchor.evaluate((el) => el.scrollIntoView({ block: "center" }));
      if (await waitForAnchorClear(anchor, 1_200)) return;
    }
    expect(await isAnchorClear(anchor), "the hinted tile must be in the viewport and uncovered after scrolling").toBe(true);
  }

  /** Fully inside the viewport, and the element under its centre is the anchor itself (not a sticky bar). */
  const isAnchorClear = (anchor: Locator) =>
    anchor.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });

  /** True once the anchor has been clear on two checks 150 ms apart (a settled position), within `timeoutMs`. */
  async function waitForAnchorClear(anchor: Locator, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let settled = 0;
    while (Date.now() < deadline && settled < 2) {
      await anchor.page().waitForTimeout(150);
      settled = (await isAnchorClear(anchor)) ? settled + 1 : 0;
    }
    return settled >= 2;
  }

  async function expectDismissalPersisted(client: RestClient) {
    // The write is fire-and-forget after the click, so poll rather than read once.
    await expect
      .poll(
        async () => {
          const res = await client.get(dismissalPath(client.session.userId));
          return Array.isArray(res.body) ? res.body.length : -1;
        },
        { message: "the dismissal row must be written for the signed-in user", timeout: 10_000 }
      )
      .toBe(1);
  }

  test("the rating hint shows once, then stays dismissed", async ({ page }) => {
    if (!rest) return;
    const client = rest;
    const { hint, badge, workerSheet } = await openWallChartWithHint(page);

    await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toHaveCount(0);

    // The write is a round trip, so once the row exists everything the click
    // could have opened synchronously has long since rendered: the negatives
    // below are asserted after this settled positive, not the instant after
    // the click, when "not open yet" would pass as "did not open".
    await expectDismissalPersisted(client);
    // "Got it" must not bubble into the tile (finding 2): no worker sheet, and
    // the badge's own popover did not open either.
    await expect(workerSheet).toHaveCount(0);
    await expect(badge).toHaveAttribute("aria-expanded", "false");

    // After a reload the hint is absent — asserted only once the dismissals
    // query has answered, because the hint fails closed while loading and
    // "not painted yet" must not pass as "dismissed".
    const dismissalsAnswered = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/user_hint_dismissals") && r.request().method() === "GET",
      { timeout: 30_000 }
    );
    await page.reload();
    await expectWallChart(page);
    await expect(
      page.locator('[data-worker-id], [data-ou-id="unassigned"]').first()
    ).toBeVisible({ timeout: 30_000 });
    await dismissalsAnswered;
    await expect(hint).toHaveCount(0);
    await expect(workerSheet).toHaveCount(0);
  });

  test("the hinted badge opens its rating control on the first click", async ({ page }) => {
    if (!rest) return;
    const client = rest;
    const { hint, badge, workerSheet } = await openWallChartWithHint(page);

    // Finding 1: the first click on the badge, while the hint is visible,
    // must open the rating popover — not be swallowed by a remount. The
    // badge must be clear of the sticky summary first (see bringAnchorIntoView),
    // or Playwright's own retry scroll moves the popover off-screen.
    await bringAnchorIntoView(page, page.locator(`[data-hint-anchor="${HINT_ID}"]`));
    await badge.click();
    await expect(badge).toHaveAttribute("aria-expanded", "true");
    const controlsId = await badge.getAttribute("aria-controls");
    expect(controlsId, "the badge is the rating popover's trigger (aria-controls)").toBeTruthy();
    const ratingPopover = page.locator(`[id="${controlsId}"]`);
    await expect(ratingPopover).toBeVisible();
    await expect(ratingPopover.getByRole("button", { name: "Save" })).toBeVisible();
    // Opening the control counts as "found it": the hint is gone, and no
    // worker sheet opened.
    await expect(hint).toHaveCount(0);
    await expect(workerSheet).toHaveCount(0);

    await ratingPopover.getByRole("button", { name: "Cancel" }).click();
    await expect(ratingPopover).toHaveCount(0);
    await expect(workerSheet).toHaveCount(0);

    await expectDismissalPersisted(client);
  });
});
