import { resolve } from "node:path";

import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { groupMyCampaigns, type MyCampaignRosterRow, type MyCampaignRow } from "@/lib/campaign/my-campaigns";
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
import { restClientFor, sessionFromStorageState } from "./roles/campaign-cleanup";

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
