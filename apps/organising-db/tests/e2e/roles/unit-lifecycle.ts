import { expect, test, type Page } from "@playwright/test";

/**
 * Shared steps for the WP1.6 role-coverage specs: create, rename and delete
 * an organising unit on a campaign. Every selector is an anchor the product
 * already relies on (button names, dialog titles, the data-ou-id hook the
 * wall chart's own scroll code queries). No data-testid is added.
 *
 * Not a spec: Playwright's default testMatch only collects *.spec.ts.
 */

export const WALL_CHART_URL = (campaignId: string | number) =>
  `/campaigns/${campaignId}?tab=workforce&sub=wall-chart`;
/**
 * The Units tab. The sub-tab id is "campaign-units" — the TabsTrigger value in
 * src/app/(dashboard)/campaigns/[id]/page.tsx. resolveTabParams
 * (src/lib/campaign-tabs.ts) honours any explicit ?sub= without validating it
 * and needsRedirect() sees nothing to rewrite, so an unknown value such as the
 * earlier "sub=units" left <Tabs value="units"> matching no TabsContent: the
 * page rendered the tab bar and NO sub-tab body, and renameUnit() waited 30s
 * for a row that could never exist (wp1.6.md §12.11, every attempt, both roles).
 */
export const UNITS_URL = (campaignId: string | number) =>
  `/campaigns/${campaignId}?tab=workforce&sub=campaign-units`;

/** The `campaigns_i_can_write` RPC the campaign page's canWrite waits on. */
export const WRITE_ACCESS_RPC = /\/rest\/v1\/rpc\/campaigns_i_can_write/;
/**
 * The AuthProvider's profile fetch (auth-context.tsx fetchProfile): the first
 * PostgREST request of every healthy document load, issued from the
 * INITIAL_SESSION callback within ~100ms of hydration.
 */
export const PROFILE_FETCH = /\/rest\/v1\/user_profiles\?/;
/** The /campaigns list query (src/app/(dashboard)/campaigns/page.tsx, queryKey ["campaigns"]). */
export const CAMPAIGNS_LIST_QUERY = /\/rest\/v1\/campaigns\?select=campaign_id/;

/**
 * How long a freshly loaded document gets to issue PROFILE_FETCH. The app's
 * own auth-init fallback fires at 8s (INITIAL_SESSION_FALLBACK_MS); a cold
 * preview can take several seconds to hydrate, so this is generous.
 */
const AUTH_INIT_BUDGET_MS = 20_000;
const MAX_DOCUMENT_LOADS = 3;

/**
 * Collects every window.alert the page raises. delete-organising-unit-dialog's
 * onError surfaces `NoRowsAffectedError` through window.alert, so a non-empty
 * list after a delete means the write failed loudly — which the positive
 * specs assert never happens, and which is the "not silent" half of the
 * negative case.
 */
export function collectAlerts(page: Page): string[] {
  const alerts: string[] = [];
  page.on("dialog", (dialog) => {
    alerts.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return alerts;
}

/**
 * A full document load of an app page, guarded against the auth start-up
 * deadlock diagnosed in wp1.6.md §11 fix round 2: on a warm load whose
 * hydration beats auth-js's cookie read, the AuthProvider awaited a Supabase
 * query inside the SIGNED_IN callback while auth-js still held its init lock,
 * and every query on the page then hung with no timeout (the list page's
 * "Loading" row that never resolved). The product fix in auth-context.tsx
 * defers that work out of the callback; until a build carrying it is the one
 * under test, this guard turns the hang into a bounded reload with an
 * annotation, and on a fixed build it never fires. A healthy load is
 * recognised by the AuthProvider's PROFILE_FETCH request; a wedged client
 * never sends it (the fallback at 8s only refreshes the server cookie).
 */
export async function gotoDocument(page: Page, url: string, label: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_DOCUMENT_LOADS; attempt += 1) {
    // Registered before the navigation so a fast hydration cannot slip past it.
    const profileFetch = page.waitForRequest(PROFILE_FETCH, { timeout: AUTH_INIT_BUDGET_MS }).then(
      () => true,
      () => false
    );
    if (attempt === 1) await page.goto(url);
    else await page.reload();
    if (await profileFetch) return;
    test.info().annotations.push({
      type: "auth-init-stall",
      description: `${label}: no user_profiles fetch within ${AUTH_INIT_BUDGET_MS / 1000}s of document load ${attempt} — the Supabase auth client wedged at start-up (wp1.6.md §11 fix round 2); reloading.`,
    });
  }
  throw new Error(
    `${label}: the app never fetched user_profiles in ${MAX_DOCUMENT_LOADS} document loads of ${url} — the auth client is wedging at start-up (wp1.6.md §11 fix round 2).`
  );
}

export async function openWallChart(page: Page, campaignId: string | number): Promise<void> {
  const rpc = page.waitForResponse(WRITE_ACCESS_RPC, { timeout: 30_000 }).catch(() => null);
  await gotoDocument(page, WALL_CHART_URL(campaignId), `wall chart of campaign ${campaignId}`);
  await expect(page.getByText("Wall chart", { exact: true }).and(page.locator("div")).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute("aria-pressed", "true");
  // The page falls back to the global role flag until this answers, so wait
  // for it before asserting the presence or absence of any write control.
  await rpc;
}

/**
 * Client-side navigation to /campaigns through the sidebar link
 * (src/components/layout/sidebar.tsx navItems[0], rendered as <Link href="/campaigns">).
 * Deliberately not page.goto: a full document load of this small page after a
 * warm campaign page hits the auth start-up deadlock on every attempt (see
 * gotoDocument), whereas a client-side transition keeps the mounted
 * AuthProvider and its healthy client. Resolves once the list query has
 * answered and the DataTable's loading row is gone. Returns the pending
 * `campaigns_i_can_write` response (null on timeout — the list may already
 * hold a cached answer for the same id set) for callers that assert on the
 * presence or absence of the delete control.
 */
export async function openCampaignsList(page: Page): Promise<{ writeAccess: Promise<unknown> }> {
  const listQuery = page.waitForResponse(CAMPAIGNS_LIST_QUERY, { timeout: 30_000 });
  const writeAccess = page.waitForResponse(WRITE_ACCESS_RPC, { timeout: 30_000 }).catch(() => null);
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await page.waitForURL(/\/campaigns(\?|$)/, { timeout: 30_000 });
  await listQuery;
  // data-table.tsx renders a <TableRow> with the EurekaLoadingSpinner (role="status") while loading.
  await expect(page.locator("table tbody [role=status]")).toHaveCount(0, { timeout: 30_000 });
  return { writeAccess };
}

/**
 * Rows of the campaigns DataTable on /campaigns. The page renders TWO tables
 * — CampaignsDashboard's overview grid above the list, whose rows also carry
 * the campaign name — so an unscoped `table tbody tr` matches twice (fix
 * round 2, run 1). The list is the table whose header has the "Start Date"
 * sort button (data-table.tsx renders each sortable header as a button).
 */
export function campaignsListRows(page: Page) {
  return page
    .locator("table")
    .filter({ has: page.getByRole("button", { name: "Start Date" }) })
    .locator("tbody tr");
}

/**
 * Sets CampaignsDashboard's "Filter by organiser" Select to "All organisers".
 * The list defaults to the signed-in account's own organiser
 * (campaigns/page.tsx selectedOrganiserId), which hides every campaign with
 * another organiser — including the foreign campaign the negative test
 * asserts on. The trigger is the Radix combobox that follows the
 * "Filter by organiser:" span (CampaignsDashboard.tsx).
 */
export async function showAllOrganisers(page: Page): Promise<void> {
  const trigger = page
    .getByText("Filter by organiser:", { exact: true })
    .locator("xpath=following-sibling::*[@role='combobox'][1]");
  await expect(trigger, "The organiser filter must render on /campaigns.").toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await page.getByRole("option", { name: "All organisers" }).click();
  await expect(trigger).toHaveText("All organisers");
}

/**
 * Opens the create-unit wizard. wall-chart-unit-manager.tsx renders "New unit"
 * standing alone when the campaign has no units, and inside the "Units (n)"
 * popover otherwise — both only when canWrite. Waits for whichever control is
 * rendered instead of probing isVisible() straight after navigation (the
 * §12 run 2 attempt 3 admin timeout: the probe ran before the RPC answered,
 * fell through to the popover path, and waited 180s for a button that was
 * still gated).
 */
export async function clickNewUnit(page: Page): Promise<void> {
  const newUnit = page.getByRole("button", { name: "New unit" });
  const unitsMenu = page.getByRole("button", { name: /^Units/ });
  await expect(
    newUnit.or(unitsMenu).first(),
    "Neither the standalone New unit button nor the Units popover trigger rendered on the wall chart."
  ).toBeVisible({ timeout: 30_000 });
  if (!(await newUnit.isVisible())) {
    await unitsMenu.click();
    await expect(
      newUnit,
      "The Units popover must offer New unit: campaigns_i_can_write answered false (or not at all) for this account."
    ).toBeVisible({ timeout: 15_000 });
  }
  await newUnit.click();
}

/** Walks the create-unit wizard (details → placement → workers → review) for a single unit. */
export async function createUnit(page: Page, unitName: string): Promise<void> {
  await clickNewUnit(page);
  const dialog = page.getByRole("dialog", { name: "New organising unit" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("e.g. Day Shift").fill(unitName);

  const createButton = dialog.getByRole("button", { name: /Create units/ });
  for (let step = 0; step < 4 && !(await createButton.isVisible()); step += 1) {
    await dialog.getByRole("button", { name: /^Next:/ }).click();
  }
  await expect(createButton).toBeVisible();
  await createButton.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await expect(unitCard(page, unitName)).toBeVisible({ timeout: 30_000 });
}

export function unitCard(page: Page, unitName: string) {
  return page.locator("[data-ou-id]", { hasText: unitName }).first();
}

/** Renames a unit from the Units tab (campaign-units-section's "Edit unit" dialog). */
export async function renameUnit(
  page: Page,
  campaignId: string | number,
  fromName: string,
  toName: string
): Promise<void> {
  // A full document load, so the Units tab's React Query cache is fresh — no
  // stale "campaign-ous" entry from the wall chart survives.
  await gotoDocument(page, UNITS_URL(campaignId), `Units tab of campaign ${campaignId}`);
  // Fail here, with a clear message, if the sub-tab id ever changes again,
  // rather than 30s later on the row locator.
  await expect(
    page.getByRole("tab", { name: "Campaign Units" }),
    "UNITS_URL must select the Campaign Units sub-tab (TabsTrigger value 'campaign-units')."
  ).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  // campaign-units-section.tsx renders each unit as <div class="rounded-md border …">
  // with <p class="font-medium">{ou.name}</p> and a title="Edit unit" button.
  const row = page
    .locator("div.rounded-md.border", { has: page.locator("p.font-medium", { hasText: fromName }) })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTitle("Edit unit").click();

  const dialog = page.getByRole("dialog", { name: "Edit organising unit" });
  await expect(dialog).toBeVisible();
  const nameInput = dialog.locator("input").first();
  await expect(nameInput).toHaveValue(fromName);
  await nameInput.fill(toName);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await expect(page.locator("p.font-medium", { hasText: toName }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Deletes an empty unit from the wall chart's Units popover. */
export async function deleteUnit(page: Page, campaignId: string | number, unitName: string): Promise<void> {
  await openWallChart(page, campaignId);
  await expect(unitCard(page, unitName)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^Units/ }).click();
  await page.getByRole("button", { name: `Delete ${unitName}`, exact: true }).click();

  const confirm = page.getByRole("alertdialog", { name: "Delete organising unit?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete unit" }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });

  await expect(unitCard(page, unitName)).toBeHidden({ timeout: 30_000 });
}

/**
 * Deletes a campaign from /campaigns through CampaignDeleteDialog (the
 * delete_campaign RPC). Must be called from a dashboard page (the wall chart):
 * the list is reached by client-side navigation — see openCampaignsList.
 */
export async function deleteCampaign(page: Page, campaignName: string): Promise<void> {
  await openCampaignsList(page);
  await page.getByPlaceholder("Search campaigns…").fill(campaignName);
  // Under the default organiser filter: the creator assigned themselves, so
  // the row must be there without widening the filter.
  await expect(campaignsListRows(page).filter({ hasText: campaignName })).toHaveCount(1, { timeout: 30_000 });
  // campaigns/page.tsx renders the control only once campaigns_i_can_write has
  // answered for the list's id set (hidden while loading), so this wait also
  // covers the RPC.
  const deleteButton = page.getByRole("button", { name: `Delete ${campaignName}`, exact: true });
  await expect(
    deleteButton,
    "The delete control must be offered on a campaign this account created (campaigns_i_can_write)."
  ).toBeVisible({ timeout: 30_000 });
  await deleteButton.click();

  const confirm = page.getByRole("alertdialog", { name: "Delete campaign?" });
  await expect(confirm).toBeVisible();
  await confirm.locator("#delete-campaign-name-db").fill(campaignName);
  await confirm.getByRole("button", { name: "Delete campaign" }).click();

  // The dialog closes only on success; on not_authorized it stays open with
  // the error paragraph, which is the assertion that delete_campaign()'s
  // is_campaign_creator arm landed.
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  await expect(campaignsListRows(page).filter({ hasText: campaignName })).toHaveCount(0, {
    timeout: 30_000,
  });
}
