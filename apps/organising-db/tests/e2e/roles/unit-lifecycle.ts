import { expect, type Page } from "@playwright/test";

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

export async function openWallChart(page: Page, campaignId: string | number): Promise<void> {
  const rpc = page.waitForResponse(WRITE_ACCESS_RPC, { timeout: 30_000 }).catch(() => null);
  await page.goto(WALL_CHART_URL(campaignId));
  await expect(page.getByText("Wall chart", { exact: true }).and(page.locator("div")).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Wall chart" })).toHaveAttribute("aria-pressed", "true");
  // The page falls back to the global role flag until this answers, so wait
  // for it before asserting the presence or absence of any write control.
  await rpc;
}

/** "New unit" sits alone when the campaign has no units, inside the Units popover otherwise. */
export async function clickNewUnit(page: Page): Promise<void> {
  const newUnit = page.getByRole("button", { name: "New unit" });
  if (!(await newUnit.isVisible())) {
    await page.getByRole("button", { name: /^Units/ }).click();
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
  // page.goto is a full document load, so the Units tab's React Query cache
  // is fresh — no stale "campaign-ous" entry from the wall chart survives.
  await page.goto(UNITS_URL(campaignId));
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

/** Deletes a campaign from /campaigns through CampaignDeleteDialog (the delete_campaign RPC). */
export async function deleteCampaign(page: Page, campaignName: string): Promise<void> {
  await page.goto("/campaigns");
  await page.getByPlaceholder("Search campaigns…").fill(campaignName);
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
  await expect(page.locator("table tbody tr", { hasText: campaignName })).toHaveCount(0, {
    timeout: 30_000,
  });
}
