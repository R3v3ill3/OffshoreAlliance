import { expect, type Page } from "@playwright/test";

import type { RestClient } from "../roles/campaign-cleanup";

/**
 * WP2.4 (wp2.4.md §4.5) — helpers for the groups_v2 spec. Nothing here is
 * shared with an existing spec or helper (the plan forbids editing them);
 * the REST and RPC calls are the same product calls `structure-api.spec.ts`
 * makes, restated over the WP2.1 group model.
 *
 * Every read is through `restClientFor` (the signed-in session's own token;
 * the production project is refused before any call). Every write is a
 * product RPC (`structure_units_create`, `structure_placements_assign`,
 * `structure_placements_move`) or a `delete_campaign`-style sweep by name
 * prefix, all as the e2e user under RLS.
 */

/** The approved deterministic dev campaign; never discovered at runtime. */
export const CAMPAIGN_ID = 1;
export const SYNC_PATH = `/api/campaigns/${CAMPAIGN_ID}/sync-universe-workers`;
export const UNIT_PREFIX = "WP2.4 e2e ";
/** The K1 sentence (structure-error-message.ts ALREADY_IN_GROUP_MESSAGE). */
export const K1_MESSAGE = "Already in this group — use Move.";

/** The wall chart with an explicit group, or without one (the resolved view is then written to the URL). */
export const WALL_CHART_URL = (group?: number | "none") =>
  `/campaigns/${CAMPAIGN_ID}?tab=workforce&sub=wall-chart${group !== undefined ? `&group=${group}` : ""}`;

export interface GroupRow {
  group_id: number;
  kind: string;
  name: string;
  display_order: number;
}

export interface UnitRow {
  ou_id: number;
  name: string;
  group_id: number | null;
}

export interface PlacementRow {
  ou_id: number;
  worker_id: number;
  is_primary: boolean;
  assignment_source: string;
  assigned_rule_id: number | null;
  group_id: number | null;
}

/** One row of the `campaign_group_membership` view — the oracle of §4.5. */
export interface MembershipViewRow {
  group_id: number;
  worker_id: number;
  ou_id: number | null;
}

export interface Fixture {
  /** Group G1 and its unit A; group G2 and its unit C (§4.5). */
  g1: GroupRow;
  g2: GroupRow;
  unitA: UnitRow;
  unitC: UnitRow;
  worker: { worker_id: number; first_name: string; last_name: string };
  /** The worker's placements before the spec touched anything. */
  originalPlacements: PlacementRow[];
  /** True when the spec created A/C itself (two custom units), so they are swept in afterAll. */
  createdUnits: boolean;
}

export function ok(res: { status: number; body: unknown }, what: string): void {
  expect(res.status, `${what}: HTTP ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(200);
  expect(res.status, `${what}: HTTP ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(300);
}

export async function groupsOf(client: RestClient): Promise<GroupRow[]> {
  const res = await client.get(
    `/rest/v1/campaign_groups?campaign_id=eq.${CAMPAIGN_ID}&select=group_id,kind,name,display_order&order=display_order,group_id`
  );
  ok(res, "reading campaign_groups");
  return res.body as GroupRow[];
}

export async function unitsOf(client: RestClient): Promise<UnitRow[]> {
  const res = await client.get(
    `/rest/v1/campaign_organising_units?campaign_id=eq.${CAMPAIGN_ID}&select=ou_id,name,group_id&order=display_order,name`
  );
  ok(res, "reading campaign_organising_units");
  return res.body as UnitRow[];
}

/** Every placement of one worker on this campaign's units, with the WP2.1 group. */
export async function placementsOf(client: RestClient, workerId: number): Promise<PlacementRow[]> {
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

/** The oracle: the worker's row per group in `campaign_group_membership` (`ou_id` null = Unassigned in that group). */
export async function membershipOf(client: RestClient, workerId: number): Promise<MembershipViewRow[]> {
  const res = await client.get(
    `/rest/v1/campaign_group_membership?campaign_id=eq.${CAMPAIGN_ID}&worker_id=eq.${workerId}&select=group_id,worker_id,ou_id&order=group_id`
  );
  ok(res, "reading campaign_group_membership");
  return res.body as MembershipViewRow[];
}

export async function createUnits(
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

export interface AssignResult {
  inserted: number;
  moved: number;
  skipped: number;
  displaced: number;
}

export async function assign(
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

/** Every placement of the worker in the campaign goes (the legacy "drag to Unassigned" call). */
export async function unassignAll(client: RestClient, workerId: number): Promise<void> {
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

/** Each test's own precondition: the worker holds exactly one placement, on `ouId`. */
export async function placeOnlyOn(client: RestClient, workerId: number, ouId: number): Promise<void> {
  await unassignAll(client, workerId);
  await assign(client, ouId, workerId);
  expect((await placementsOf(client, workerId)).map((p) => p.ou_id), "precondition: one placement").toEqual([ouId]);
}

/** The member with the fewest placements on the campaign, so the spec disturbs as little as possible. */
export async function pickWorker(client: RestClient): Promise<Fixture["worker"] | null> {
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
  return (worker.body as Fixture["worker"][])[0] ?? null;
}

/**
 * Two groups with a unit each (§4.5): the campaign's own groups when it has
 * two with a unit, else two `custom` units created through the structure API
 * (the WP2.1 trigger derives their group; two custom units land in the same
 * custom group, so the second is created with its own `ou_group_name` — a
 * container-less custom group per name — and both groups are read back).
 */
export async function findOrCreateFixture(
  client: RestClient,
  worker: Fixture["worker"],
  originalPlacements: PlacementRow[]
): Promise<Fixture | null> {
  const groups = await groupsOf(client);
  const units = await unitsOf(client);
  const withUnit = groups.filter((g) => units.some((u) => u.group_id === g.group_id));
  if (withUnit.length >= 2) {
    const [g1, g2] = withUnit;
    const unitA = units.find((u) => u.group_id === g1.group_id);
    const unitC = units.find((u) => u.group_id === g2.group_id);
    if (unitA && unitC) return { g1, g2, unitA, unitC, worker, originalPlacements, createdUnits: false };
  }
  const stamp = Date.now();
  const created = await createUnits(client, [
    { client_ref: "a", name: `${UNIT_PREFIX}A ${stamp}`, ou_type: "shift", source: "manual" },
    { client_ref: "c", name: `${UNIT_PREFIX}C ${stamp}`, ou_type: "custom", source: "manual" },
  ]);
  const byRef = new Map(created.map((u) => [u.client_ref, u]));
  const a = byRef.get("a");
  const c = byRef.get("c");
  if (!a || !c || a.group_id == null || c.group_id == null || a.group_id === c.group_id) return null;
  const after = await groupsOf(client);
  const g1 = after.find((g) => g.group_id === a.group_id);
  const g2 = after.find((g) => g.group_id === c.group_id);
  if (!g1 || !g2) return null;
  return {
    g1,
    g2,
    unitA: { ou_id: a.ou_id, name: `${UNIT_PREFIX}A ${stamp}`, group_id: a.group_id },
    unitC: { ou_id: c.ou_id, name: `${UNIT_PREFIX}C ${stamp}`, group_id: c.group_id },
    worker,
    originalPlacements,
    createdUnits: true,
  };
}

/** Put back the placements the chosen worker had before the spec ran (same units, source, primary flag). */
export async function restoreWorker(client: RestClient, workerId: number, originalPlacements: PlacementRow[]): Promise<string[]> {
  const notes: string[] = [];
  await unassignAll(client, workerId);
  for (const p of originalPlacements) {
    if (p.assigned_rule_id == null) {
      const r = await assign(client, p.ou_id, p.worker_id, { source: p.assignment_source, isPrimary: p.is_primary });
      notes.push(`assign(${p.ou_id}, ${p.worker_id}): inserted=${r.inserted} skipped=${r.skipped}`);
      continue;
    }
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
    notes.push(
      res.status === 409
        ? `NOT restored: rule placement (${p.ou_id}, ${p.worker_id}, rule ${p.assigned_rule_id}) refused with 409`
        : `restored rule placement (${p.ou_id}, ${p.worker_id}): HTTP ${res.status}`
    );
  }
  return notes;
}

/** The sync-on-open route, fulfilled in the browser with a scripted answer (§4.5, SY-c); records every request. */
export async function scriptUniverseSync(page: Page, answer: Record<string, unknown>) {
  const state = { requested: 0 };
  await page.route(`**${SYNC_PATH}`, async (route) => {
    state.requested += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  return state;
}

/** A card by its `data-ou-id` wrapper: a unit id, "unassigned" or "not-in-any-group". */
export function cardById(page: Page, key: number | "unassigned" | "not-in-any-group") {
  return page.locator(`[data-ou-id="${key}"]`).filter({ has: page.locator("h3") }).first();
}

export function tileIn(page: Page, key: number | "unassigned" | "not-in-any-group", workerId: number) {
  return cardById(page, key).locator(`[data-worker-id="${workerId}"]`).first();
}

export function groupSelector(page: Page) {
  return page.getByRole("combobox", { name: "Group", exact: true });
}

export async function chooseGroup(page: Page, name: string): Promise<void> {
  await groupSelector(page).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(groupSelector(page)).toHaveText(name);
}

export async function expectTileIn(
  page: Page,
  key: number | "unassigned" | "not-in-any-group",
  workerId: number,
  visible: boolean
) {
  if (visible) await expect(tileIn(page, key, workerId)).toBeVisible({ timeout: 30_000 });
  else await expect(tileIn(page, key, workerId)).toHaveCount(0, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// WP2.4c (wp2.4c.md §4.5) — nesting within a group. Everything below is
// additive: the WP2.4 spec above is untouched, and every write is the same
// product RPC the chart itself calls (`structure_units_create` with
// `parent_ou_id`, `structure_unit_delete`), as the e2e user under RLS.
// ---------------------------------------------------------------------------

/**
 * The nesting fixture's unit names. The prefix STARTS WITH `UNIT_PREFIX`, so
 * the WP2.4 spec's `deleteUnitsByNamePrefix(UNIT_PREFIX)` sweep removes a
 * leftover of this spec too, whichever suite runs next.
 */
export const NESTED_PREFIX = `${UNIT_PREFIX}nested `;

/** A unit row with the two columns the nesting rules read (`wp2.4c.md` §3.3). */
export interface UnitTreeRow extends UnitRow {
  parent_ou_id: number | null;
  is_group_container: boolean;
  ou_type: string | null;
}

export async function unitTreeOf(client: RestClient): Promise<UnitTreeRow[]> {
  const res = await client.get(
    `/rest/v1/campaign_organising_units?campaign_id=eq.${CAMPAIGN_ID}` +
      "&select=ou_id,name,group_id,parent_ou_id,is_group_container,ou_type&order=display_order,name"
  );
  ok(res, "reading campaign_organising_units (tree)");
  return res.body as UnitTreeRow[];
}

/**
 * Sub-units of `parentOuId`, created through the product's own create RPC
 * with `parent_ou_id` — the shape `structure_unit_split` leaves behind
 * (`wp2.2.md` §3.3; the checklist's step 1 creates it by hand through Split).
 * The WP2.1 trigger derives each child's group from `ou_type`, so a `shift`
 * child of a worksite lands in the campaign's Shift group: a NESTING edge
 * under NE-a (the parent's group differs from the child's).
 */
export async function createNestedUnits(
  client: RestClient,
  parentOuId: number,
  names: readonly string[],
  ouType: string
): Promise<{ ou_id: number; group_id: number | null; name: string }[]> {
  const created = await createUnits(
    client,
    names.map((name, i) => ({
      client_ref: `nested-${i}`,
      name,
      ou_type: ouType,
      parent_ou_id: parentOuId,
      source: "manual",
    }))
  );
  return created.map((u, i) => ({ ou_id: u.ou_id, group_id: u.group_id, name: names[i] }));
}

/**
 * `structure_unit_delete` — the RPC the card's Delete… dialog calls. Remaining
 * placements on the unit are removed by the RPC, so a fixture sub-unit can be
 * deleted without reassigning first; `deleteChildren` is the dialog's
 * "Delete group + N sub-units" branch.
 */
export async function removeUnit(client: RestClient, ouId: number, deleteChildren: boolean): Promise<void> {
  const res = await client.post("/rest/v1/rpc/structure_unit_delete", {
    p_campaign_id: CAMPAIGN_ID,
    p_ou_id: ouId,
    p_reassignments: [],
    p_delete_children: deleteChildren,
  });
  ok(res, `structure_unit_delete(${ouId}, deleteChildren=${deleteChildren})`);
}

/** NE-a: a `parent_ou_id` link nests only when the parent carries a DIFFERENT group. */
export function nestsUnder(child: UnitTreeRow, byId: Map<number, UnitTreeRow>): UnitTreeRow | null {
  if (child.parent_ou_id == null || child.group_id == null) return null;
  const parent = byId.get(child.parent_ou_id);
  if (!parent || parent.is_group_container || parent.group_id == null) return null;
  return parent.group_id === child.group_id ? null : parent;
}

/** SG-a: a group is sub-unit-only when every unit it has nests under a unit of another group. */
export function isSubUnitOnlyGroup(rows: UnitTreeRow[], groupId: number): boolean {
  const byId = new Map(rows.map((u) => [u.ou_id, u]));
  const units = rows.filter((u) => u.group_id === groupId);
  return units.length > 0 && units.every((u) => nestsUnder(u, byId) !== null);
}

export interface NestedFixture {
  /** The primary group the chart is opened on (campaign 42's Worksite). */
  group: GroupRow;
  /** Root A of that group: the card the sub-units are drawn inside. */
  root: UnitTreeRow;
  /** The sub-units' own group (campaign 42's Shift), derived by the WP2.1 trigger. */
  childGroup: GroupRow;
  /** "Day" and "Night", in card order. */
  day: { ou_id: number; name: string };
  night: { ou_id: number; name: string };
  /** True when no other unit of `childGroup` is a root, so SG-a can be asserted. */
  childGroupIsSubUnitOnly: boolean;
  worker: Fixture["worker"];
  originalPlacements: PlacementRow[];
  /** True when the spec created A itself, so `afterAll` removes it. */
  createdRoot: boolean;
}

/**
 * The campaign-42 shape (§4.6): a root A of a primary group with two `shift`
 * sub-units under it. A is the campaign's own worksite when it has one that
 * the depth trigger allows a sub-unit under (top-level, or a child of a group
 * container — `cou_enforce_hierarchy_invariants`); otherwise the spec creates
 * one under `NESTED_PREFIX`. Returns null when the shape cannot be made, and
 * the caller skips rather than asserts against a shape that is not there.
 */
export async function findOrCreateNestedFixture(
  client: RestClient,
  worker: Fixture["worker"],
  originalPlacements: PlacementRow[]
): Promise<NestedFixture | null> {
  const stamp = Date.now();
  let rows = await unitTreeOf(client);
  let byId = new Map(rows.map((u) => [u.ou_id, u]));
  const canHoldSubUnits = (u: UnitTreeRow) =>
    u.group_id != null &&
    !u.is_group_container &&
    (u.parent_ou_id == null || byId.get(u.parent_ou_id)?.is_group_container === true);

  let createdRoot = false;
  let root =
    rows.find((u) => canHoldSubUnits(u) && u.ou_type === "worksite") ?? rows.find(canHoldSubUnits) ?? null;
  if (!root) {
    const [made] = await createUnits(client, [
      { client_ref: "root", name: `${NESTED_PREFIX}Site ${stamp}`, ou_type: "worksite", source: "manual" },
    ]);
    if (!made || made.group_id == null) return null;
    createdRoot = true;
    rows = await unitTreeOf(client);
    byId = new Map(rows.map((u) => [u.ou_id, u]));
    root = byId.get(made.ou_id) ?? null;
  }
  if (!root || root.group_id == null) return null;

  const children = await createNestedUnits(
    client,
    root.ou_id,
    [`${NESTED_PREFIX}Day ${stamp}`, `${NESTED_PREFIX}Night ${stamp}`],
    "shift"
  );
  const [day, night] = children;
  if (!day || !night) return null;
  if (day.group_id == null || day.group_id !== night.group_id || day.group_id === root.group_id) {
    // Not a nesting edge under NE-a (a same-group child is a sibling root, D6).
    return null;
  }

  const groups = await groupsOf(client);
  const group = groups.find((g) => g.group_id === root.group_id);
  const childGroup = groups.find((g) => g.group_id === day.group_id);
  if (!group || !childGroup) return null;

  const after = await unitTreeOf(client);
  return {
    group,
    root,
    childGroup,
    day: { ou_id: day.ou_id, name: day.name },
    night: { ou_id: night.ou_id, name: night.name },
    childGroupIsSubUnitOnly: isSubUnitOnlyGroup(after, childGroup.group_id),
    worker,
    originalPlacements,
    createdRoot,
  };
}

/**
 * ONE tile, on ONE card. A nested card's DOM sits inside its root's card, so
 * `tileIn` (which scopes by the card element) cannot tell "in A's own area"
 * from "in Day inside A". Every tile carries both ids (`worker-tile.tsx`),
 * which is exactly the distinction every §3.7 row turns on.
 */
export function tileOn(page: Page, ouId: number, workerId: number) {
  return page.locator(`[data-worker-id="${workerId}"][data-ou-id="${ouId}"]`).first();
}

export async function expectTileOn(page: Page, ouId: number, workerId: number, visible: boolean) {
  if (visible) await expect(tileOn(page, ouId, workerId)).toBeVisible({ timeout: 30_000 });
  else await expect(page.locator(`[data-worker-id="${workerId}"][data-ou-id="${ouId}"]`)).toHaveCount(0, { timeout: 30_000 });
}

/**
 * A root card's OWN area as a drop target: its heading. A drop anywhere in a
 * root card bubbles to the root's handler unless a nested card consumed it
 * first (`campaign-unit-card.tsx` D32), and the heading is above the nested
 * cards, so dropping there always means "the parent's own area" (§3.7 row 4).
 */
export function cardHeading(page: Page, key: number | "unassigned" | "not-in-any-group") {
  return cardById(page, key).locator("h3").first();
}

/** The ordered `structure_placements_move` payloads a drop issued (NX-a: one call per step). */
export interface MoveRpcLog {
  readonly calls: Record<string, unknown>[];
  reset(): void;
  expectOrdered(expected: Record<string, unknown>[], what: string): Promise<void>;
}

export async function recordPlacementMoves(page: Page): Promise<MoveRpcLog> {
  const calls: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/rest/v1/rpc/structure_placements_move")) return;
    try {
      calls.push((request.postDataJSON() ?? {}) as Record<string, unknown>);
    } catch {
      calls.push({ unparsed: request.postData() ?? "" });
    }
  });
  return {
    calls,
    reset: () => calls.splice(0, calls.length),
    expectOrdered: async (expected, what) => {
      await expect
        .poll(() => calls.length, { timeout: 30_000, message: `${what}: ${expected.length} RPC call(s)` })
        .toBe(expected.length);
      expect(calls, what).toMatchObject(expected);
    },
  };
}

/**
 * The second oracle (§4.5): the worker's sheet, Units tab, whose rows read
 * "<Group> › <Unit>" — one per placement, so a nested worker's two rows say
 * which worksite and which shift they hold. Opened from a named tile and
 * closed again.
 */
export async function expectSheetUnits(
  page: Page,
  ouId: number,
  worker: Fixture["worker"],
  rows: { present?: string[]; absent?: string[] }
): Promise<void> {
  const name = `${worker.first_name} ${worker.last_name}`;
  await tileOn(page, ouId, worker.worker_id).getByRole("button").first().click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("tab", { name: "Units" }).click();
  for (const row of rows.present ?? []) {
    await expect(sheet.getByText(row, { exact: true }), `the sheet lists "${row}"`).toBeVisible({ timeout: 15_000 });
  }
  for (const row of rows.absent ?? []) {
    await expect(sheet.getByText(row, { exact: true }), `the sheet does not list "${row}"`).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden({ timeout: 15_000 });
}
