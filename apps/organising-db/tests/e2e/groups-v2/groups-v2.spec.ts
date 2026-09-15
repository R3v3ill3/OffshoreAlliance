import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_IGNORE_HTTPS_ERRORS, STORAGE_STATE } from "../../../playwright.config";
import { NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "../env";
import { WALL_CHART_RATING_HINT_ID, insertHintDismissal } from "../hint-dismissals";
import { deleteUnitsByNamePrefix, restClientFor, sessionFromStorageState, type RestClient } from "../roles/campaign-cleanup";
import { gotoDocument } from "../roles/unit-lifecycle";
import { withUserPrefs } from "../user-prefs";
import {
  CAMPAIGN_ID,
  K1_MESSAGE,
  UNIT_PREFIX,
  WALL_CHART_URL,
  cardById,
  chooseGroup,
  expectTileIn,
  findOrCreateFixture,
  groupSelector,
  membershipOf,
  pickWorker,
  placeOnlyOn,
  placementsOf,
  restoreWorker,
  scriptUniverseSync,
  tileIn,
  type Fixture,
  type PlacementRow,
} from "./helpers";

/**
 * WP2.4 (wp2.4.md §4.5) — flows two and three on the v2 wall chart, on the
 * branch preview against normal dev (never production: `restClientFor`
 * refuses the production project ref before any call).
 *
 *   1. Flow two — "switch the group selector and see a worker move between a
 *      unit and Unassigned": W placed only on A (group G1); the chart opened
 *      on G1 shows W in A; choosing G2 puts `?group=<G2>` in the URL and W in
 *      "Unassigned in <G2>"; dragging W onto C (G2) places W there; the
 *      `campaign_group_membership` oracle reads G1 → A, G2 → C; a reload with
 *      no `?group=` opens on G2 (prefs); choosing G1 shows W still in A.
 *   2. Flow three — "drag a tile to Unassigned": with G2 selected, W dragged
 *      from C onto "Unassigned in <G2>" lands in that card; the oracle reads
 *      G2 → null and G1 → A (the per-group semantics that distinguish this
 *      from structure-api.spec.ts test 1); then Remove from <G1> in G1 → G1
 *      → null too, and W appears in Not in any group.
 *   3. Hidden units and search: hide A in the Units manager, reload (still
 *      hidden — prefs), Find worker → A un-hidden and highlighted, sheet open.
 *   4. Control inventory: no View / Badges / Sort / Filter on a unit card, no
 *      Copy in the selection bar.
 *   5. Sync-on-open notice: the scripted route answer shows the sentence and
 *      Dismiss removes it; an all-zero answer shows nothing.
 *
 * Preconditions this spec owns: `withUserPrefs({ mode: "full", flags: {
 * groups_v2: true } })` (one record/pin/restore of the e2e account's document
 * through the admin API); the `wall_chart_group_selector` and
 * `wall_chart_rating` dismissals seeded for the e2e user so no callout
 * coexists with a drag; the sync route fulfilled in the browser with a
 * scripted answer so the oracle is stable and the notice can be asserted.
 * Fixture units are created only when campaign 1 has fewer than two groups
 * with a unit, named with `UNIT_PREFIX`, and swept in `afterAll`; the chosen
 * worker's placements are recorded and restored in `afterAll`.
 *
 * Acceptance is E2-b (§4.5): the operator performs these steps by hand from
 * the checklist; this spec is written and type-checked so it can run from the
 * e2e workflow whenever the credentials exist.
 */

const ZERO_SYNC = { success: true, workersAdded: 0, membersAdded: 0, ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 0 };
const CHANGED_SYNC = { success: true, workersAdded: 3, membersAdded: 1, ouAssignmentsUpserted: 2, ouAssignmentsSkipped: 1 };

async function openChart(page: Parameters<typeof gotoDocument>[0], group?: number | "none"): Promise<void> {
  await gotoDocument(page, WALL_CHART_URL(group), `v2 wall chart of campaign ${CAMPAIGN_ID}`);
  await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible({ timeout: 30_000 });
  await expect(groupSelector(page)).toBeVisible({ timeout: 30_000 });
}

test.describe("WP2.4 groups_v2 — flows two and three on the preview", () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  withUserPrefs({ mode: "full", flags: { groups_v2: true } });

  let client: RestClient | null = null;
  let fixture: Fixture | null = null;
  let chosen: { worker: Fixture["worker"]; originalPlacements: PlacementRow[] } | null = null;
  let apiForCleanup: APIRequestContext | null = null;

  test.beforeAll(async ({ playwright }) => {
    if (!hasE2ECredentials) return;
    test.setTimeout(120_000);
    apiForCleanup = await playwright.request.newContext({ ignoreHTTPSErrors: E2E_IGNORE_HTTPS_ERRORS });
    client = restClientFor(apiForCleanup, sessionFromStorageState(STORAGE_STATE));
    if (!client) return;
    // Both hints dismissed for the e2e user (§3.16, §4.5): never a callout over a drag.
    for (const hint of [WALL_CHART_RATING_HINT_ID, "wall_chart_group_selector"] as const) {
      const res = await insertHintDismissal(client, hint);
      expect(res.status, `seeding the ${hint} dismissal`).toBeLessThan(300);
    }
    const swept = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
    if (swept > 0) console.log(`[cleanup] removed ${swept} leftover "${UNIT_PREFIX}" unit(s) on campaign ${CAMPAIGN_ID}.`);
    const worker = await pickWorker(client);
    if (!worker) return;
    chosen = { worker, originalPlacements: await placementsOf(client, worker.worker_id) };
    fixture = await findOrCreateFixture(client, worker, chosen.originalPlacements);
    console.log(`[wp2.4] fixture ${JSON.stringify(fixture && { g1: fixture.g1, g2: fixture.g2, unitA: fixture.unitA, unitC: fixture.unitC, worker: worker.worker_id, createdUnits: fixture.createdUnits })}`);
  });

  test.afterAll(async () => {
    if (!client) return;
    try {
      if (chosen) {
        for (const note of await restoreWorker(client, chosen.worker.worker_id, chosen.originalPlacements)) {
          console.log(`[cleanup] ${note}`);
        }
      }
      const removed = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
      if (removed > 0) console.log(`[cleanup] removed ${removed} "${UNIT_PREFIX}" unit(s).`);
    } finally {
      await apiForCleanup?.dispose();
    }
  });

  test("1. flow two — switch the group selector and see the worker move between a unit and Unassigned", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: campaign 1 has no members, or no second group could be made.");
    if (!client || !fixture) return;
    const { g1, g2, unitA, unitC, worker } = fixture;

    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page, g1.group_id);
    await expect(groupSelector(page)).toHaveText(g1.name);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    await chooseGroup(page, g2.name);
    await expect(page).toHaveURL(new RegExp(`[?&]group=${g2.group_id}(&|$)`));
    await expectTileIn(page, "unassigned", worker.worker_id, true);
    await expect(cardById(page, "unassigned").getByRole("heading")).toHaveText(`Unassigned in ${g2.name}`);

    const moveRpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await tileIn(page, "unassigned", worker.worker_id).dragTo(cardById(page, unitC.ou_id));
    expect((await moveRpc).status(), "structure_placements_move must succeed").toBe(200);
    await expectTileIn(page, unitC.ou_id, worker.worker_id, true);
    await expectTileIn(page, "unassigned", worker.worker_id, false);

    const rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === g1.group_id)?.ou_id, "G1 → A").toBe(unitA.ou_id);
    expect(rows.find((r) => r.group_id === g2.group_id)?.ou_id, "G2 → C").toBe(unitC.ou_id);

    // Reload with no ?group=: the selector opens on G2 (prefs), and the URL gains it.
    await openChart(page);
    await expect(groupSelector(page)).toHaveText(g2.name);
    await expect(page).toHaveURL(new RegExp(`[?&]group=${g2.group_id}(&|$)`));
    await chooseGroup(page, g1.name);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);
  });

  test("2. flow three — drag a tile to Unassigned removes the placement in that group only; Remove from <Group> empties the other", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: campaign 1 has no members, or no second group could be made.");
    if (!client || !fixture) return;
    const { g1, g2, unitA, unitC, worker } = fixture;

    // Own precondition: A in G1 and C in G2.
    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    const placed = await placementsOf(client, worker.worker_id);
    expect(placed.map((p) => p.ou_id)).toEqual([unitA.ou_id]);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page, g2.group_id);
    const toC = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await tileIn(page, "unassigned", worker.worker_id).dragTo(cardById(page, unitC.ou_id));
    expect((await toC).status()).toBe(200);
    await expectTileIn(page, unitC.ou_id, worker.worker_id, true);

    // C → Unassigned in G2: p_to_ou_id null, p_within_group_id G2.
    const unassignRpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await tileIn(page, unitC.ou_id, worker.worker_id).dragTo(cardById(page, "unassigned"));
    const response = await unassignRpc;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ p_to_ou_id: null, p_within_group_id: g2.group_id });
    await expectTileIn(page, "unassigned", worker.worker_id, true);

    let rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === g2.group_id)?.ou_id, "G2 row is Unassigned").toBeNull();
    expect(rows.find((r) => r.group_id === g1.group_id)?.ou_id, "G1 row still A").toBe(unitA.ou_id);

    // Bulk: select W in G1 and Remove from <G1>.
    await chooseGroup(page, g1.name);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);
    await tileIn(page, unitA.ou_id, worker.worker_id).getByRole("button").first().click({ modifiers: ["Control"] });
    await page.getByRole("button", { name: `Remove from ${g1.name}`, exact: true }).click();
    const unassign = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_unassign"));
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
    expect((await unassign).status()).toBe(200);
    await expectTileIn(page, "unassigned", worker.worker_id, true);

    rows = await membershipOf(client, worker.worker_id);
    expect(rows.every((r) => r.ou_id === null), "Unassigned in every group").toBe(true);
    await chooseGroup(page, "Not in any group");
    await expectTileIn(page, "not-in-any-group", worker.worker_id, true);
  });

  test("3. hidden units are remembered per user and search un-hides", async ({ page }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: no fixture.");
    if (!client || !fixture) return;
    const { g1, unitA, worker } = fixture;

    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page, g1.group_id);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    await page.getByRole("button", { name: /^Units \(\d+\)$/ }).click();
    await page.locator(`#wc-ou-vis-${unitA.ou_id}`).click();
    await page.keyboard.press("Escape");
    await expect(cardById(page, unitA.ou_id)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Units \(\d+\/\d+\)$/ })).toBeVisible();

    await openChart(page, g1.group_id);
    await expect(cardById(page, unitA.ou_id)).toHaveCount(0);

    await page.getByRole("button", { name: "Find worker" }).click();
    await page.getByPlaceholder("Search workers by name…").fill(worker.last_name);
    await page.getByRole("option", { name: new RegExp(`${worker.first_name} ${worker.last_name}`) }).first().click();
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);
    await expect(page.getByRole("dialog", { name: `${worker.first_name} ${worker.last_name}` })).toBeVisible({ timeout: 15_000 });
  });

  test("4. control inventory: no per-unit View, Badges, Sort or Filter; no Copy in the selection bar", async ({ page }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: no fixture.");
    if (!client || !fixture) return;
    const { g1, unitA, worker } = fixture;

    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page, g1.group_id);
    const card = cardById(page, unitA.ou_id);
    await expect(card).toBeVisible();
    for (const name of ["View", "Badges", "Sort", "Filter", "Apply to all units", "Expand all", "Collapse all"]) {
      await expect(card.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
      await expect(card.getByRole("combobox", { name })).toHaveCount(0);
    }
    await expect(card.getByRole("button", { name: "Unit actions", exact: true })).toBeVisible();

    await tileIn(page, unitA.ou_id, worker.worker_id).getByRole("button").first().click({ modifiers: ["Control"] });
    const bar = page.getByRole("region", { name: "Wall chart selection" });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button", { name: "Copy to unit…" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Move to unit…" })).toBeVisible();

    // The sheet's copy dialog names a same-group target with the K1 sentence.
    await page.keyboard.press("Escape");
    await tileIn(page, unitA.ou_id, worker.worker_id).getByRole("button").first().click();
    await page.getByRole("tab", { name: "Units" }).click();
    await page.getByRole("button", { name: "Add to another unit" }).click();
    const dialog = page.getByRole("dialog", { name: "Copy worker" });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(K1_MESSAGE).first()).toBeVisible({ timeout: 15_000 });
  });

  test("5. sync-on-open notice (SY-c): shown when the scripted answer changed something, dismissible; silent on zeros", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    if (!client) return;

    await scriptUniverseSync(page, CHANGED_SYNC);
    await openChart(page);
    const notice = page.getByRole("status").filter({ hasText: "Sync on open:" });
    await expect(notice).toHaveText("Sync on open: 1 worker added to this campaign, 2 placed in units, 1 already placed.", {
      timeout: 30_000,
    });
    await notice.getByRole("button", { name: "Dismiss sync notice" }).click();
    await expect(notice).toHaveCount(0);

    await page.unroute(`**/api/campaigns/${CAMPAIGN_ID}/sync-universe-workers`);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page);
    await expect(page.getByRole("status").filter({ hasText: "Sync on open:" })).toHaveCount(0);
  });
});
