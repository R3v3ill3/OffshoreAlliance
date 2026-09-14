import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { STORAGE_STATE } from "../../playwright.config";
import {
  E2E_FOREIGN_CAMPAIGN_ID,
  NO_CREDENTIALS_MESSAGE,
  NO_FOREIGN_CAMPAIGN_MESSAGE,
  hasE2ECredentials,
  hasE2EForeignCampaign,
} from "./env";
import {
  deleteUnitsByNamePrefix,
  restClientFor,
  sessionFromStorageState,
  type RestClient,
} from "./roles/campaign-cleanup";
import { UNITS_URL, collectAlerts, gotoDocument, openWallChart } from "./roles/unit-lifecycle";
import { withUserMode } from "./workspace-mode";

/**
 * WP2.2 §4.5 items 1–3 — the wall-chart writers through the structure API,
 * on the branch preview against normal dev (never production: `restClientFor`
 * refuses the production project ref outright).
 *
 *   1. Wall chart: drag a worker from unit A to unit B in the same group →
 *      exactly one placement in that group afterwards; drag to Unassigned →
 *      zero placements.
 *   2. Copy dialog: a same-group copy shows the K1 message and changes
 *      nothing (§3.4 C-c); a cross-group copy leaves two placements.
 *   3. Split dialog with a same-group child: the source no longer holds the
 *      moved worker (rule C-k); the "keep in parent" switch is not offered
 *      for that shape (D33).
 *
 * Items 4–6 (merge from the Units tab, the settings "save units" round trip
 * through `structure_units_bulk_save`, and the `user` role's visible error)
 * are the second describe block (Stage 5, wp2.2.md §11.12). Neither block
 * has run yet: both run on the branch preview when the operator schedules it.
 *
 * **What this spec writes, and how it leaves the campaign as found.** It runs
 * on the approved deterministic dev campaign (`CAMPAIGN_ID`), which the e2e
 * account owns. Every unit it uses it creates itself, through the product's
 * own `structure_units_create` RPC over REST as the signed-in user, named
 * with `UNIT_PREFIX` so a sweep in `beforeAll` and the `afterAll` cleanup can
 * find them regardless of how a previous run ended; deleting a unit removes
 * its placements with it. The worker it drags is an existing member of the
 * campaign chosen for having the fewest placements (ideally none, since
 * "drag to Unassigned" strips every placement the worker holds); whatever
 * placements that worker held before are recorded and re-assigned in
 * `afterAll` through `structure_placements_assign` (source and primary flag
 * preserved). The background universe sync is intercepted in the browser, as
 * in wall-chart-decomposition.spec.ts, so opening the chart writes nothing.
 * `withUserMode("full")` makes and restores one dev preference write.
 *
 * Every selector is an anchor the product already relies on: the
 * `data-worker-id` / `data-ou-id` hooks, dialog titles, button names, the
 * K1 sentence from structure-error-message.ts. No data-testid is added.
 */

/** The approved deterministic dev campaign; never discovered at runtime. */
const CAMPAIGN_ID = 1;
const SYNC_PATH = `/api/campaigns/${CAMPAIGN_ID}/sync-universe-workers`;

const UNIT_PREFIX = "WP2.2 e2e ";
/** The K1 sentence (structure-error-message.ts ALREADY_IN_GROUP_MESSAGE). */
const K1_MESSAGE = "Already in this group — use Move.";

interface PlacementRow {
  ou_id: number;
  worker_id: number;
  is_primary: boolean;
  assignment_source: string;
  assigned_rule_id: number | null;
  group_id: number | null;
}

interface Fixture {
  /** Same fixed kind ("shift"), so A and B share one group. */
  unitA: { ou_id: number; name: string; group_id: number | null };
  unitB: { ou_id: number; name: string; group_id: number | null };
  /** A "custom"-kind unit, so a copy into it is cross-group. */
  unitC: { ou_id: number; name: string; group_id: number | null };
  worker: { worker_id: number; first_name: string; last_name: string };
  /** The worker's placements before the spec touched anything. */
  originalPlacements: PlacementRow[];
}

function ok(res: { status: number; body: unknown }, what: string): void {
  expect(res.status, `${what}: HTTP ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(200);
  expect(res.status, `${what}: HTTP ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(300);
}

/** Every placement of one worker on this campaign's units, with the WP2.1 group. */
async function placementsOf(client: RestClient, workerId: number): Promise<PlacementRow[]> {
  const res = await client.get(
    "/rest/v1/campaign_worker_ou?select=ou_id,worker_id,is_primary,assignment_source,assigned_rule_id,group_id,campaign_organising_units!inner(campaign_id)" +
      `&campaign_organising_units.campaign_id=eq.${CAMPAIGN_ID}&worker_id=eq.${workerId}&order=ou_id`
  );
  ok(res, "reading campaign_worker_ou");
  return (res.body as PlacementRow[]).map(
    ({ ou_id, worker_id, is_primary, assignment_source, assigned_rule_id, group_id }) => ({
      ou_id,
      worker_id,
      is_primary,
      assignment_source,
      assigned_rule_id,
      group_id,
    })
  );
}

/** The product's create RPC, called the way the wrapper calls it (wp2.2.md §11.2). */
async function createUnits(
  client: RestClient,
  units: Record<string, unknown>[]
): Promise<{ client_ref: string | null; ou_id: number; group_id: number | null }[]> {
  const res = await client.post("/rest/v1/rpc/structure_units_create", {
    p_campaign_id: CAMPAIGN_ID,
    p_units: units,
    p_assignments: [],
  });
  ok(res, "structure_units_create");
  return (res.body as { units: { client_ref: string | null; ou_id: number; group_id: number | null }[] }).units;
}

interface AssignResult {
  inserted: number;
  moved: number;
  skipped: number;
  displaced: number;
}

async function assign(
  client: RestClient,
  ouId: number,
  workerId: number,
  opts: { source?: string; isPrimary?: boolean } = {}
): Promise<AssignResult> {
  const res = await client.post("/rest/v1/rpc/structure_placements_assign", {
    p_campaign_id: CAMPAIGN_ID,
    p_ou_id: ouId,
    p_worker_ids: [workerId],
    p_source: opts.source ?? "manual",
    p_is_primary: opts.isPrimary ?? false,
    p_on_conflict: "skip",
  });
  ok(res, `structure_placements_assign(${ouId}, ${workerId})`);
  return res.body as AssignResult;
}

/** Every placement of the worker in the campaign goes (the wall chart's own "drag to Unassigned" call). */
async function unassignAll(client: RestClient, workerId: number): Promise<void> {
  const res = await client.post("/rest/v1/rpc/structure_placements_move", {
    p_campaign_id: CAMPAIGN_ID,
    p_worker_ids: [workerId],
    p_from_ou_id: null,
    p_to_ou_id: null,
    p_within_group_id: null,
    p_keep_source: false,
    p_keep_in_parent: true,
  });
  ok(res, `structure_placements_move(unassign ${workerId})`);
}

/**
 * Each test's own precondition, independent of the others' end state: the
 * worker holds exactly one placement, on `ouId` (the original placements are
 * restored once, in afterAll).
 */
async function placeOnlyOn(client: RestClient, workerId: number, ouId: number): Promise<void> {
  await unassignAll(client, workerId);
  await assign(client, ouId, workerId);
  expect((await placementsOf(client, workerId)).map((p) => p.ou_id), "precondition: one placement").toEqual([ouId]);
}

/**
 * The member with the fewest placements on the campaign (zero when there is
 * such a member), so the "drag to Unassigned" step disturbs as little as
 * possible; whatever it does disturb is put back by `afterAll`.
 */
async function pickWorker(client: RestClient): Promise<Fixture["worker"] | null> {
  const members = await client.get(
    `/rest/v1/campaign_worker_membership?campaign_id=eq.${CAMPAIGN_ID}&select=worker_id&order=worker_id&limit=200`
  );
  ok(members, "reading campaign_worker_membership");
  const memberIds = (members.body as { worker_id: number }[]).map((m) => m.worker_id);
  if (memberIds.length === 0) return null;

  const placed = await client.get(
    "/rest/v1/campaign_worker_ou?select=worker_id,campaign_organising_units!inner(campaign_id)" +
      `&campaign_organising_units.campaign_id=eq.${CAMPAIGN_ID}&worker_id=in.(${memberIds.join(",")})`
  );
  ok(placed, "reading campaign_worker_ou");
  const counts = new Map<number, number>(memberIds.map((id) => [id, 0]));
  for (const row of placed.body as { worker_id: number }[]) {
    counts.set(row.worker_id, (counts.get(row.worker_id) ?? 0) + 1);
  }
  const workerId = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];

  const worker = await client.get(`/rest/v1/workers?worker_id=eq.${workerId}&select=worker_id,first_name,last_name`);
  ok(worker, "reading workers");
  const row = (worker.body as Fixture["worker"][])[0];
  return row ?? null;
}

async function createFixtureUnits(
  client: RestClient,
  stamp: number,
  worker: Fixture["worker"],
  originalPlacements: PlacementRow[]
): Promise<Fixture> {
  const created = await createUnits(client, [
    { client_ref: "a", name: `${UNIT_PREFIX}A ${stamp}`, ou_type: "shift", source: "manual" },
    { client_ref: "b", name: `${UNIT_PREFIX}B ${stamp}`, ou_type: "shift", source: "manual" },
    { client_ref: "c", name: `${UNIT_PREFIX}C ${stamp}`, ou_type: "custom", source: "manual" },
  ]);
  const byRef = new Map(created.map((u) => [u.client_ref, u]));
  const unit = (ref: string, name: string) => {
    const u = byRef.get(ref);
    if (!u) throw new Error(`structure_units_create returned no unit for client_ref "${ref}"`);
    return { ou_id: u.ou_id, name, group_id: u.group_id };
  };
  return {
    unitA: unit("a", `${UNIT_PREFIX}A ${stamp}`),
    unitB: unit("b", `${UNIT_PREFIX}B ${stamp}`),
    unitC: unit("c", `${UNIT_PREFIX}C ${stamp}`),
    worker,
    originalPlacements,
  };
}

/**
 * Put back the placements the chosen worker had before the spec ran (new row
 * ids; same units, source, primary flag and rule provenance). A row with an
 * `assigned_rule_id` has no structure RPC that can recreate it with that id
 * (only Recompute's replace_rule_rows, which rewrites the whole campaign), so
 * that one case is a direct REST insert — test cleanup, not product code;
 * `group_id` is trigger-derived and never sent.
 */
async function restoreWorker(client: RestClient, workerId: number, originalPlacements: PlacementRow[]): Promise<string[]> {
  const notes: string[] = [];
  const now = await placementsOf(client, workerId);
  const have = new Set(now.map((p) => p.ou_id));
  for (const p of originalPlacements) {
    if (have.has(p.ou_id)) continue;
    if (p.assigned_rule_id == null) {
      // `p_on_conflict: "skip"` never moves a row, so the one worker is either
      // inserted or (already there) skipped; anything else means the restore
      // did not land and the run must say so rather than log "restored".
      const r = await assign(client, p.ou_id, p.worker_id, { source: p.assignment_source, isPrimary: p.is_primary });
      console.log(`[cleanup] assign(${p.ou_id}, ${p.worker_id}): inserted=${r.inserted} skipped=${r.skipped} moved=${r.moved} displaced=${r.displaced}`);
      if (r.inserted + r.skipped !== 1) {
        throw new Error(
          `[cleanup] restoring worker ${p.worker_id} on unit ${p.ou_id} did not land: ${JSON.stringify(r)} (expected inserted + skipped = 1)`
        );
      }
    } else {
      const res = await client.post(
        "/rest/v1/campaign_worker_ou",
        {
          ou_id: p.ou_id,
          worker_id: p.worker_id,
          is_primary: p.is_primary,
          assignment_source: p.assignment_source,
          assigned_rule_id: p.assigned_rule_id,
        },
        "return=minimal"
      );
      ok(res, `restoring rule placement (${p.ou_id}, ${p.worker_id})`);
    }
    notes.push(
      `restored worker ${p.worker_id} on unit ${p.ou_id} (${p.assignment_source}${p.assigned_rule_id != null ? `, rule ${p.assigned_rule_id}` : ""}${p.is_primary ? ", primary" : ""})`
    );
  }
  return notes;
}

/** Stops the background universe sync from writing, and records that it did (wall-chart-decomposition.spec.ts). */
async function interceptUniverseSync(page: Page) {
  const state = { requested: 0, fulfilled: 0, serverAnswered: [] as string[] };
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === SYNC_PATH) state.requested += 1;
  });
  page.on("response", (res) => {
    if (new URL(res.url()).pathname !== SYNC_PATH) return;
    const headers = res.headers();
    const serverish = ["x-vercel-id", "x-vercel-cache", "server", "x-matched-path"].filter(
      (h) => headers[h] !== undefined
    );
    if (serverish.length > 0) state.serverAnswered.push(serverish.join(","));
  });
  await page.route(`**${SYNC_PATH}`, async (route) => {
    state.fulfilled += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, workersAdded: 0 }),
    });
  });
  return state;
}

/** A unit card by its `data-ou-id` wrapper (tiles carry the attribute too, but no heading). */
function unitCardById(page: Page, ouId: number | "unassigned") {
  return page.locator(`[data-ou-id="${ouId}"]`).filter({ has: page.locator("h3") }).first();
}

/** The worker's tile inside one card. */
function tileIn(page: Page, ouId: number | "unassigned", workerId: number) {
  return unitCardById(page, ouId).locator(`[data-worker-id="${workerId}"]`).first();
}

async function openChart(page: Page): Promise<void> {
  await openWallChart(page, CAMPAIGN_ID);
  await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible({ timeout: 30_000 });
}

/** Wait for the chart to show the worker in exactly these cards (after the invalidation refetch). */
async function expectTileIn(page: Page, ouId: number | "unassigned", workerId: number, visible: boolean) {
  if (visible) await expect(tileIn(page, ouId, workerId)).toBeVisible({ timeout: 30_000 });
  else await expect(tileIn(page, ouId, workerId)).toHaveCount(0, { timeout: 30_000 });
}

test.describe("WP2.2 structure API — wall-chart writers on the preview", () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  withUserMode("full");

  let client: RestClient | null = null;
  let fixture: Fixture | null = null;
  /** Recorded before any write, so afterAll can restore even if the fixture units failed to create. */
  let chosen: { worker: Fixture["worker"]; originalPlacements: PlacementRow[] } | null = null;
  let apiForCleanup: APIRequestContext | null = null;

  test.beforeAll(async ({ playwright }) => {
    if (!hasE2ECredentials) return;
    test.setTimeout(120_000);
    apiForCleanup = await playwright.request.newContext();
    client = restClientFor(apiForCleanup, sessionFromStorageState(STORAGE_STATE));
    if (!client) return;
    const swept = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
    if (swept > 0) console.log(`[cleanup] removed ${swept} leftover "${UNIT_PREFIX}" unit(s) on campaign ${CAMPAIGN_ID}.`);
    const worker = await pickWorker(client);
    if (!worker) return;
    chosen = { worker, originalPlacements: await placementsOf(client, worker.worker_id) };
    fixture = await createFixtureUnits(client, Date.now(), worker, chosen.originalPlacements);
    console.log(
      `[wp2.2] fixture ${JSON.stringify({
        units: [fixture.unitA, fixture.unitB, fixture.unitC],
        worker: fixture.worker.worker_id,
        originalPlacements: fixture.originalPlacements.length,
      })}`
    );
  });

  test.afterAll(async () => {
    if (!client) return;
    try {
      // Units are found by prefix, so whatever was created before a throw goes too.
      const removed = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
      console.log(`[cleanup] removed ${removed} "${UNIT_PREFIX}" unit(s) (their placements went with them).`);
      if (chosen) {
        for (const note of await restoreWorker(client, chosen.worker.worker_id, chosen.originalPlacements)) {
          console.log(`[cleanup] ${note}`);
        }
      }
    } finally {
      await apiForCleanup?.dispose();
    }
  });

  test("1. same-group drag leaves exactly one placement in the group; drag to Unassigned leaves none", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    test.skip(!fixture, "Skipped: campaign 1 has no members to drag.");
    if (!client || !fixture) return;
    const { unitA, unitB, worker } = fixture;
    expect(unitA.group_id, "A and B must share a group (same fixed kind)").toBe(unitB.group_id);

    // Own precondition: the worker holds exactly one placement, on A.
    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    const sync = await interceptUniverseSync(page);
    await openChart(page);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    // A → B (same group): structure_placements_move re-points the row.
    const moveRpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await tileIn(page, unitA.ou_id, worker.worker_id).dragTo(unitCardById(page, unitB.ou_id));
    expect((await moveRpc).status(), "structure_placements_move must succeed").toBe(200);
    await expectTileIn(page, unitB.ou_id, worker.worker_id, true);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, false);

    const inGroup = (await placementsOf(client, worker.worker_id)).filter((p) => p.group_id === unitA.group_id);
    expect(inGroup.map((p) => p.ou_id), "exactly one placement in the group, on B").toEqual([unitB.ou_id]);

    // B → Unassigned: every placement of the worker in the campaign goes.
    const unassignRpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await tileIn(page, unitB.ou_id, worker.worker_id).dragTo(unitCardById(page, "unassigned"));
    expect((await unassignRpc).status()).toBe(200);
    await expectTileIn(page, "unassigned", worker.worker_id, true);

    expect(await placementsOf(client, worker.worker_id), "no placement at all after the drop on Unassigned").toEqual([]);
    expect(sync.serverAnswered, "the universe sync must never reach the backend").toEqual([]);
  });

  test("2. copy dialog: same-group copy shows the K1 message and changes nothing; cross-group copy adds a placement", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    test.skip(!fixture, "Skipped: campaign 1 has no members to copy.");
    if (!client || !fixture) return;
    const { unitA, unitB, unitC, worker } = fixture;

    // Own precondition, independent of test 1: exactly one placement, on A.
    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    const before = await placementsOf(client, worker.worker_id);
    await interceptUniverseSync(page);
    await openChart(page);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    // Right-click the tile: the Move/Copy dialog for that assignment. Its title
    // follows the mode ("Move worker" → "Copy worker" once Copy is toggled).
    await tileIn(page, unitA.ou_id, worker.worker_id).click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: /^(Move|Copy) worker$/ });
    await expect(dialog).toBeVisible();
    // The mode toggle carries aria-pressed; the submit button does not.
    const copyToggle = dialog.getByRole("button", { name: "Copy", exact: true }).and(page.locator("[aria-pressed]"));
    const copySubmit = dialog.getByRole("button", { name: "Copy", exact: true }).and(page.locator(":not([aria-pressed])"));
    await copyToggle.click();
    await expect(copyToggle).toHaveAttribute("aria-pressed", "true");
    await expect(dialog).toHaveAccessibleName("Copy worker");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: unitB.name }).click();
    const refused = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await copySubmit.click();
    // The RPC refuses with the explicit 23505 (K1); the dialog stays open and says why.
    expect((await refused).status(), "a same-group copy is refused by the RPC").toBeGreaterThanOrEqual(400);
    await expect(page.getByText(K1_MESSAGE)).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeVisible();
    expect(await placementsOf(client, worker.worker_id), "state unchanged after the refused copy").toEqual(before);

    // Cross-group copy (custom kind): allowed, two placements afterwards.
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: unitC.name }).click();
    const copied = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_placements_move"));
    await copySubmit.click();
    expect((await copied).status()).toBe(200);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expectTileIn(page, unitC.ou_id, worker.worker_id, true);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    const after = await placementsOf(client, worker.worker_id);
    expect(after.map((p) => p.ou_id).sort((x, y) => x - y)).toEqual([unitA.ou_id, unitC.ou_id].sort((x, y) => x - y));
  });

  test("3. split with a same-group child moves the worker out of the source (C-k)", async ({ page }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    test.skip(!fixture, "Skipped: campaign 1 has no members to split.");
    if (!client || !fixture) return;
    const { unitA, worker } = fixture;
    const childName = `${UNIT_PREFIX}child ${Date.now()}`;

    // Own precondition, independent of tests 1–2: exactly one placement, on A.
    await placeOnlyOn(client, worker.worker_id, unitA.ou_id);
    await interceptUniverseSync(page);
    await openChart(page);
    await expectTileIn(page, unitA.ou_id, worker.worker_id, true);

    await unitCardById(page, unitA.ou_id).getByRole("button", { name: "Unit actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Split into sub-units", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Split “/ });
    await expect(dialog).toBeVisible();

    // Custom dimension, one child of the SOURCE's own type (shift → same group).
    await dialog.getByRole("button", { name: /^Custom \(define your own\)/ }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog.getByPlaceholder("e.g. Day shift").fill(childName);
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Shift", exact: true }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("checkbox", { name: `Select ${worker.last_name}, ${worker.first_name}` })
      .click();
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    // A shift child under a shift source is same-group: the "keep in parent"
    // switch is not offered at all (C-k moves the worker; wp2.2.md D33).
    await expect(dialog.getByRole("switch")).toHaveCount(0);
    await expect(dialog.getByText("Keep workers in")).toHaveCount(0);
    await expect(dialog.getByText("Workers assigned to a sub-unit move into it")).toBeVisible();

    const split = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_unit_split"));
    await dialog.getByRole("button", { name: "Create 1 sub-unit", exact: true }).click();
    expect((await split).status(), "structure_unit_split must succeed").toBe(200);
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const placements = await placementsOf(client, worker.worker_id);
    const child = await client.get(
      `/rest/v1/campaign_organising_units?campaign_id=eq.${CAMPAIGN_ID}&name=eq.${encodeURIComponent(childName)}&select=ou_id,parent_ou_id,group_id`
    );
    ok(child, "reading the split child");
    const childRow = (child.body as { ou_id: number; parent_ou_id: number | null; group_id: number | null }[])[0];
    expect(childRow, "the split created the child").toBeTruthy();
    expect(childRow.parent_ou_id, "today's nested shape is kept").toBe(unitA.ou_id);
    expect(childRow.group_id, "the child is in the source's group").toBe(unitA.group_id);
    expect(placements.some((p) => p.ou_id === unitA.ou_id), "the source no longer holds the moved worker").toBe(false);
    expect(placements.some((p) => p.ou_id === childRow.ou_id), "the child holds the worker").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stage 5 — §4.5 items 4–6 (wp2.2.md §11.12). Same fixture discipline as
// above: every unit is created by this block under STAGE5_PREFIX (which the
// first block's `UNIT_PREFIX` sweep also matches, so a crash in either block
// is swept by the next run), the worker's original placements are recorded
// before any write and restored in afterAll, and every selector is an anchor
// the product already relies on (button names, dialog titles, the units
// section's row markup that unit-lifecycle.ts `renameUnit` uses).
// ---------------------------------------------------------------------------

const STAGE5_PREFIX = `${UNIT_PREFIX}s5 `;
const FORBIDDEN_MESSAGE = "You don't have permission to change this campaign's units.";

interface UnitRow {
  ou_id: number;
  name: string;
  ou_type: string;
}

/** Every unit of a campaign, by id, through REST as the signed-in user. */
async function unitsOf(client: RestClient, campaignId: string | number): Promise<UnitRow[]> {
  const res = await client.get(
    `/rest/v1/campaign_organising_units?campaign_id=eq.${campaignId}&select=ou_id,name,ou_type&order=ou_id`
  );
  ok(res, `reading campaign_organising_units of campaign ${campaignId}`);
  return (res.body as UnitRow[]).map(({ ou_id, name, ou_type }) => ({ ou_id, name, ou_type }));
}

/** A rule on one unit (`campaign_unit_rules` is not a structure table; test fixture, not product code). */
async function createRule(client: RestClient, ouId: number): Promise<number> {
  const res = await client.post(
    "/rest/v1/campaign_unit_rules",
    {
      campaign_id: CAMPAIGN_ID,
      ou_id: ouId,
      include: true,
      dimension_type: "occupation",
      operator: "contains",
      value_text: "wp2.2 e2e",
    },
    "return=representation"
  );
  ok(res, `creating a rule on unit ${ouId}`);
  const row = (res.body as { rule_id: number }[])[0];
  if (!row) throw new Error("campaign_unit_rules insert returned no row");
  return row.rule_id;
}

/** The settings accordion section "Campaign units" (collapsed by default), expanded. */
async function openSettingsUnits(page: Page, campaignId: string | number): Promise<void> {
  await gotoDocument(page, `/campaigns/${campaignId}/settings`, `settings of campaign ${campaignId}`);
  const trigger = page.getByRole("button", { name: /^Campaign units/ });
  await expect(trigger, "the settings page must render its Campaign units section").toBeVisible({ timeout: 30_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(page.getByRole("button", { name: "Save campaign units", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** One "Save campaign units" click, resolved with the bulk-save RPC's HTTP status. */
async function saveCampaignUnits(page: Page): Promise<number> {
  const rpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_units_bulk_save"));
  await page.getByRole("button", { name: "Save campaign units", exact: true }).click();
  return (await rpc).status();
}

/** The units-step row (step-campaign-units.tsx UnitRow) whose name input holds `name`. */
function unitRowNamed(page: Page, name: string) {
  return page.locator("div.rounded-md.border", { has: page.locator(`input[value="${name}"]`) }).first();
}

test.describe("WP2.2 structure API — Stage 5 writers on the preview (§4.5 items 4–6)", () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  withUserMode("full");

  let client: RestClient | null = null;
  let chosen: { worker: Fixture["worker"]; originalPlacements: PlacementRow[] } | null = null;
  let apiForCleanup: APIRequestContext | null = null;

  test.beforeAll(async ({ playwright }) => {
    if (!hasE2ECredentials) return;
    test.setTimeout(120_000);
    apiForCleanup = await playwright.request.newContext();
    client = restClientFor(apiForCleanup, sessionFromStorageState(STORAGE_STATE));
    if (!client) return;
    const swept = await deleteUnitsByNamePrefix(client, STAGE5_PREFIX, CAMPAIGN_ID);
    if (swept > 0) console.log(`[cleanup] removed ${swept} leftover "${STAGE5_PREFIX}" unit(s) on campaign ${CAMPAIGN_ID}.`);
    const worker = await pickWorker(client);
    if (!worker) return;
    chosen = { worker, originalPlacements: await placementsOf(client, worker.worker_id) };
  });

  test.afterAll(async () => {
    if (!client) return;
    try {
      const removed = await deleteUnitsByNamePrefix(client, STAGE5_PREFIX, CAMPAIGN_ID);
      console.log(`[cleanup] removed ${removed} "${STAGE5_PREFIX}" unit(s) (their placements and rules went with them).`);
      if (chosen) {
        for (const note of await restoreWorker(client, chosen.worker.worker_id, chosen.originalPlacements)) {
          console.log(`[cleanup] ${note}`);
        }
      }
    } finally {
      await apiForCleanup?.dispose();
    }
  });

  test("4. merge from the Units tab: the survivor holds the union, the sources are gone, the unit rule is re-pointed", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    test.skip(!chosen, "Skipped: campaign 1 has no members to place.");
    if (!client || !chosen) return;
    const stamp = Date.now();
    const created = await createUnits(client, [
      { client_ref: "a", name: `${STAGE5_PREFIX}merge A ${stamp}`, ou_type: "shift", source: "manual" },
      { client_ref: "b", name: `${STAGE5_PREFIX}merge B ${stamp}`, ou_type: "shift", source: "manual" },
    ]);
    const unitA = created.find((u) => u.client_ref === "a")!;
    const unitB = created.find((u) => u.client_ref === "b")!;
    expect(unitA.group_id, "A and B must share a group (C-j)").toBe(unitB.group_id);
    const nameA = `${STAGE5_PREFIX}merge A ${stamp}`;
    const nameB = `${STAGE5_PREFIX}merge B ${stamp}`;

    // Precondition: the worker sits on B only (one shift placement, C-a); a rule points at B.
    await placeOnlyOn(client, chosen.worker.worker_id, unitB.ou_id);
    const ruleId = await createRule(client, unitB.ou_id);
    const alerts = collectAlerts(page);

    await gotoDocument(page, UNITS_URL(CAMPAIGN_ID), `Units tab of campaign ${CAMPAIGN_ID}`);
    await expect(page.getByRole("tab", { name: "Campaign Units" })).toHaveAttribute("aria-selected", "true", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Merge units", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Select units to merge" });
    await expect(picker).toBeVisible();
    await picker.locator("label", { hasText: nameA }).getByRole("checkbox").click();
    await picker.locator("label", { hasText: nameB }).getByRole("checkbox").click();
    await picker.getByRole("button", { name: "Choose survivor (2 selected)", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Merge duplicate units" });
    await expect(dialog).toBeVisible();
    await dialog.locator(`label[for="merge-survivor-${unitA.ou_id}"]`).click();
    const merge = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/structure_unit_merge"));
    await dialog.getByRole("button", { name: `Merge (keep ${nameA})`, exact: true }).click();
    expect((await merge).status(), "structure_unit_merge must succeed").toBe(200);
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const placements = await placementsOf(client, chosen.worker.worker_id);
    expect(placements.some((p) => p.ou_id === unitA.ou_id), "the survivor holds the worker moved from B").toBe(true);
    expect(placements.some((p) => p.ou_id === unitB.ou_id), "the source no longer holds the worker").toBe(false);
    const units = await unitsOf(client, CAMPAIGN_ID);
    expect(units.some((u) => u.ou_id === unitB.ou_id), "the source unit is gone").toBe(false);
    expect(units.some((u) => u.ou_id === unitA.ou_id), "the survivor remains").toBe(true);
    const rule = await client.get(`/rest/v1/campaign_unit_rules?rule_id=eq.${ruleId}&select=rule_id,ou_id`);
    ok(rule, "reading the re-pointed rule");
    expect((rule.body as { ou_id: number }[]).map((r) => r.ou_id), "campaign_unit_rules re-pointed to the survivor").toEqual([
      unitA.ou_id,
    ]);
    expect(alerts, "no window.alert: the merge dialog announces failures that way").toEqual([]);
  });

  test("5. settings 'Save campaign units' round trip through structure_units_bulk_save: create, rename in place, delete", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    if (!client) return;
    const stamp = Date.now();
    const name = `${STAGE5_PREFIX}settings ${stamp}`;
    const renamed = `${name} renamed`;
    const before = await unitsOf(client, CAMPAIGN_ID);
    const alerts = collectAlerts(page);

    // Create: "Add a single unit" → Custom unit → Add → Save.
    await openSettingsUnits(page, CAMPAIGN_ID);
    const addCard = page.locator("div.rounded-md.border", { has: page.getByText("Add a single unit", { exact: true }) }).first();
    await addCard.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Custom unit", exact: true }).click();
    await addCard.getByPlaceholder("e.g. Day shift, Drilling crew, Catering…").fill(name);
    await addCard.getByRole("button", { name: "Add", exact: true }).click();
    await expect(unitRowNamed(page, name)).toBeVisible();
    expect(await saveCampaignUnits(page), "structure_units_bulk_save (create) must succeed").toBe(200);
    await expect(page.getByText("Campaign units saved.").first()).toBeVisible({ timeout: 15_000 });

    const afterCreate = await unitsOf(client, CAMPAIGN_ID);
    const createdRow = afterCreate.find((u) => u.name === name);
    expect(createdRow, "the new unit exists after the save").toBeTruthy();
    expect(createdRow!.ou_type).toBe("custom");
    expect(
      afterCreate.filter((u) => u.name !== name).map((u) => u.ou_id),
      "every other unit is untouched by the save"
    ).toEqual(before.map((u) => u.ou_id));

    // Rename: the same row, updated in place (same ou_id), never deleted and re-created.
    await unitRowNamed(page, name).getByRole("textbox").first().fill(renamed);
    expect(await saveCampaignUnits(page), "structure_units_bulk_save (update) must succeed").toBe(200);
    await expect(page.getByText("Campaign units saved.").first()).toBeVisible({ timeout: 15_000 });
    const afterRename = await unitsOf(client, CAMPAIGN_ID);
    expect(afterRename.find((u) => u.ou_id === createdRow!.ou_id)?.name, "renamed in place").toBe(renamed);
    expect(afterRename.some((u) => u.name === name), "no unit with the old name").toBe(false);
    expect(afterRename.map((u) => u.ou_id), "the id set is unchanged by a rename").toEqual(afterCreate.map((u) => u.ou_id));

    // Delete: remove the row, save.
    await unitRowNamed(page, renamed).getByTitle("Remove unit").click();
    await expect(unitRowNamed(page, renamed)).toHaveCount(0);
    expect(await saveCampaignUnits(page), "structure_units_bulk_save (delete) must succeed").toBe(200);
    await expect(page.getByText("Campaign units saved.").first()).toBeVisible({ timeout: 15_000 });
    const afterDelete = await unitsOf(client, CAMPAIGN_ID);
    expect(afterDelete.map((u) => u.ou_id), "back to the units the campaign had before").toEqual(before.map((u) => u.ou_id));
    expect(alerts).toEqual([]);
  });

  test("6. a `user` without write permission on the campaign gets a visible error on a structure write, not a silent no-op", async ({
    page,
  }) => {
    test.skip(!hasE2EForeignCampaign, NO_FOREIGN_CAMPAIGN_MESSAGE);
    test.skip(!client, "Skipped: no REST client for the signed-in session (see the [cleanup] line above).");
    if (!client) return;
    const alerts = collectAlerts(page);
    // May be empty under RLS; the point is that it is the same afterwards.
    const before = await unitsOf(client, E2E_FOREIGN_CAMPAIGN_ID);

    // The settings page is gated on the account's role, not on the campaign
    // (campaign-settings.tsx `useAuth().canWrite`), so a `user` reaches the
    // save button on a campaign they cannot write to. Before WP2.2 the RLS
    // filtered writes returned 2xx with no rows and the page toasted
    // "Campaign units saved."; the RPC's permission pre-check (42501) is the
    // visible refusal (wp2.2.md D41).
    await openSettingsUnits(page, E2E_FOREIGN_CAMPAIGN_ID);
    const status = await saveCampaignUnits(page);
    expect(status, "structure_units_bulk_save must be refused for a campaign the account cannot write to").toBeGreaterThanOrEqual(400);
    await expect(page.getByText(FORBIDDEN_MESSAGE).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Campaign units saved.")).toHaveCount(0);

    expect(await unitsOf(client, E2E_FOREIGN_CAMPAIGN_ID), "nothing changed on the foreign campaign").toEqual(before);
    expect(alerts).toEqual([]);
  });
});
