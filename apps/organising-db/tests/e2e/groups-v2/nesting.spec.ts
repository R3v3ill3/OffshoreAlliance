import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_IGNORE_HTTPS_ERRORS, STORAGE_STATE } from "../../../playwright.config";
import { NO_CREDENTIALS_MESSAGE, hasE2ECredentials } from "../env";
import { WALL_CHART_RATING_HINT_ID, insertHintDismissal } from "../hint-dismissals";
import { deleteUnitsByNamePrefix, restClientFor, sessionFromStorageState, type RestClient } from "../roles/campaign-cleanup";
import { gotoDocument } from "../roles/unit-lifecycle";
import { withUserPrefs } from "../user-prefs";
import {
  CAMPAIGN_ID,
  NESTED_PREFIX,
  UNIT_PREFIX,
  WALL_CHART_URL,
  cardById,
  cardHeading,
  expectSheetUnits,
  expectTileOn,
  findOrCreateNestedFixture,
  groupSelector,
  membershipOf,
  pickWorker,
  placeOnlyOn,
  placementsOf,
  recordPlacementMoves,
  removeUnit,
  restoreWorker,
  scriptUniverseSync,
  tileOn,
  type Fixture,
  type NestedFixture,
  type PlacementRow,
} from "./helpers";

/**
 * WP2.4c (wp2.4c.md §4.5) — nesting within a group on the v2 wall chart, on
 * the branch preview against normal dev (never production: `restClientFor`
 * refuses the production project ref before any call).
 *
 * The shape under test is campaign 42's, built here the way §4.6 builds it by
 * hand: a worksite root **A** of a primary group with two `shift` sub-units,
 * "Day" and "Night", nested under it (`structure_units_create` with
 * `parent_ou_id`, which is the shape `structure_unit_split` leaves behind).
 *
 *   1. The tree on screen (B1, B5) and SG-a: opened on A's group, Day and
 *      Night are drawn INSIDE A's card under "Units in <A>", A carries the
 *      "2 sub-units" badge and the roll-up count "<n> in unit · <m> not yet
 *      in a sub-unit", the worker sits in A's own area — and the sub-unit-only
 *      Shift group is NOT offered by the Group control, with no "Unassigned in
 *      <Shift>" card anywhere.
 *   2. The four drags of the §3.7 table, each asserted three ways: the ordered
 *      `structure_placements_move` payloads (NX-a — one RPC per step, adds
 *      before removes), the `campaign_group_membership` oracle, and the
 *      worker's sheet (Units tab, "<Group> › <Unit>" per placement).
 *        - A's own area → Day:   one move(null → Day, keep_in_parent) …………… Worksite → A, Shift → Day
 *        - Day → Night:          one move(Day → Night, keep_in_parent) ……………… Worksite → A, Shift → Night
 *        - Night → A's own area: one unassign within Shift (NS-a) ……………………… Worksite → A, Shift → null
 *        - Day → Unassigned in <Group>: unassign within the group, then
 *          within Shift (D1) ……………………………………………………………………………………………………………… both null
 *
 * Preconditions this spec owns, as WP2.4's `groups-v2.spec.ts` does:
 * `withUserPrefs({ mode: "full", flags: { groups_v2: true } })` (one
 * record/pin/restore of the e2e account's document through the admin API);
 * the rating and group-selector hint dismissals seeded so no callout can
 * cover a drag; the sync-on-open route fulfilled with an all-zero answer so
 * the oracle is stable. Every fixture unit is named with `NESTED_PREFIX`
 * (which starts with `UNIT_PREFIX`, so either suite's sweep removes a
 * leftover), the two sub-units are deleted in `afterAll` through
 * `structure_unit_delete`, and the chosen worker's original placements are
 * recorded and restored.
 *
 * Acceptance is HT-a (§4.6): the operator performs the equivalent steps by
 * hand from `wp/wp2.4c-acceptance-checklist.md`. This spec is written and
 * type-checked so it can run from the e2e workflow whenever the credentials
 * exist; it has never been run (wp2.2.md D80/D81).
 */

const ZERO_SYNC = { success: true, workersAdded: 0, membersAdded: 0, ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 0 };

/** The roll-up sentence of §3.13, with the numbers left to the dev data. */
const ROLL_UP = /^Select all in .+'s own area \(\d+ in unit · \d+ not yet in a sub-unit\)$/;

async function openChart(page: Parameters<typeof gotoDocument>[0], group?: number | "none"): Promise<void> {
  await gotoDocument(page, WALL_CHART_URL(group), `v2 wall chart of campaign ${CAMPAIGN_ID}`);
  await expect(page.getByRole("heading", { name: "Campaign summary" })).toBeVisible({ timeout: 30_000 });
  await expect(groupSelector(page)).toBeVisible({ timeout: 30_000 });
}

test.describe("WP2.4c groups_v2 — nesting within a group on the preview", () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(!hasE2ECredentials, NO_CREDENTIALS_MESSAGE);
  withUserPrefs({ mode: "full", flags: { groups_v2: true } });

  let client: RestClient | null = null;
  let fixture: NestedFixture | null = null;
  let chosen: { worker: Fixture["worker"]; originalPlacements: PlacementRow[] } | null = null;
  let apiForCleanup: APIRequestContext | null = null;

  test.beforeAll(async ({ playwright }) => {
    if (!hasE2ECredentials) return;
    test.setTimeout(120_000);
    apiForCleanup = await playwright.request.newContext({ ignoreHTTPSErrors: E2E_IGNORE_HTTPS_ERRORS });
    client = restClientFor(apiForCleanup, sessionFromStorageState(STORAGE_STATE));
    if (!client) return;
    for (const hint of [WALL_CHART_RATING_HINT_ID, "wall_chart_group_selector"] as const) {
      const res = await insertHintDismissal(client, hint);
      expect(res.status, `seeding the ${hint} dismissal`).toBeLessThan(300);
    }
    const swept = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
    if (swept > 0) console.log(`[cleanup] removed ${swept} leftover "${UNIT_PREFIX}" unit(s) on campaign ${CAMPAIGN_ID}.`);
    const worker = await pickWorker(client);
    if (!worker) return;
    chosen = { worker, originalPlacements: await placementsOf(client, worker.worker_id) };
    fixture = await findOrCreateNestedFixture(client, worker, chosen.originalPlacements);
    console.log(
      `[wp2.4c] fixture ${JSON.stringify(
        fixture && {
          group: fixture.group,
          root: { ou_id: fixture.root.ou_id, name: fixture.root.name },
          childGroup: fixture.childGroup,
          day: fixture.day,
          night: fixture.night,
          childGroupIsSubUnitOnly: fixture.childGroupIsSubUnitOnly,
          worker: worker.worker_id,
          createdRoot: fixture.createdRoot,
        }
      )}`
    );
  });

  test.afterAll(async () => {
    if (!client) return;
    try {
      if (chosen) {
        for (const note of await restoreWorker(client, chosen.worker.worker_id, chosen.originalPlacements)) {
          console.log(`[cleanup] ${note}`);
        }
      }
      if (fixture) {
        // The sub-units first (their placements go with them), then the root
        // only when this spec created it — the campaign's own worksite stays.
        for (const child of [fixture.night, fixture.day]) {
          await removeUnit(client, child.ou_id, false);
          console.log(`[cleanup] structure_unit_delete(${child.ou_id}) "${child.name}".`);
        }
        if (fixture.createdRoot) await removeUnit(client, fixture.root.ou_id, true);
      }
      const removed = await deleteUnitsByNamePrefix(client, UNIT_PREFIX, CAMPAIGN_ID);
      if (removed > 0) console.log(`[cleanup] removed ${removed} "${NESTED_PREFIX}"/"${UNIT_PREFIX}" unit(s).`);
    } finally {
      await apiForCleanup?.dispose();
    }
  });

  test("1. the group's tree is on screen and the sub-unit-only group is not offered (B1, B5, SG-a)", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: campaign 1 has no members, or the nested shape could not be made.");
    if (!client || !fixture) return;
    const { group, root, childGroup, day, night, worker } = fixture;

    await placeOnlyOn(client, worker.worker_id, root.ou_id);
    await scriptUniverseSync(page, ZERO_SYNC);
    await openChart(page, group.group_id);
    await expect(groupSelector(page)).toHaveText(group.name);

    // The two sub-units are drawn INSIDE A's card, under the "Units in <A>"
    // caption — not as cards of their own beside it (§3.6, XP-a).
    const rootCard = cardById(page, root.ou_id);
    await expect(rootCard).toBeVisible({ timeout: 30_000 });
    await expect(rootCard).toContainText(`Units in ${root.name}`);
    for (const child of [day, night]) {
      await expect(
        rootCard.locator(`[data-ou-id="${child.ou_id}"]`).filter({ has: page.locator("h3") }),
        `${child.name} nests inside ${root.name}`
      ).toHaveCount(1);
      await expect(cardById(page, child.ou_id).locator("h3")).toHaveText(child.name);
    }
    await expect(rootCard.getByText("2 sub-units", { exact: true })).toBeVisible();
    // B5: the roll-up sentence over the whole subtree, and the count button
    // that says it selects the root's OWN tiles (D15, D22).
    await expect(rootCard.getByRole("button", { name: ROLL_UP }).first()).toBeVisible();
    // The worker is in A's own area, not in a sub-unit.
    await expectTileOn(page, root.ou_id, worker.worker_id, true);
    await expectTileOn(page, day.ou_id, worker.worker_id, false);

    // SG-a: the sub-unit-only group is not a view the chart can be put into.
    if (fixture.childGroupIsSubUnitOnly) {
      await groupSelector(page).click();
      await expect(
        page.getByRole("option", { name: childGroup.name, exact: true }),
        `${childGroup.name} is sub-unit-only and is not offered`
      ).toHaveCount(0);
      await expect(page.getByRole("option", { name: group.name, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      test.info().annotations.push({
        type: "wp2.4c",
        description: `SG-a not asserted: campaign ${CAMPAIGN_ID} already has a ROOT unit in "${childGroup.name}", so that group is primary.`,
      });
    }
    await expect(page.getByRole("heading", { name: `Unassigned in ${childGroup.name}` })).toHaveCount(0);
  });

  test("2. the §3.7 drags: parent area → child → sibling → parent area → Unassigned (NX-a, NS-a, D1)", async ({
    page,
  }) => {
    test.skip(!client, "Skipped: no REST client for the signed-in session.");
    test.skip(!fixture, "Skipped: campaign 1 has no members, or the nested shape could not be made.");
    if (!client || !fixture) return;
    const { group, root, childGroup, day, night, worker } = fixture;

    await placeOnlyOn(client, worker.worker_id, root.ou_id);
    await scriptUniverseSync(page, ZERO_SYNC);
    const rpc = await recordPlacementMoves(page);
    await openChart(page, group.group_id);
    await expectTileOn(page, root.ou_id, worker.worker_id, true);

    const base = { p_campaign_id: CAMPAIGN_ID, p_worker_ids: [worker.worker_id], p_keep_source: false };
    const rootLabel = `${group.name} › ${root.name}`;
    const dayLabel = `${childGroup.name} › ${day.name}`;
    const nightLabel = `${childGroup.name} › ${night.name}`;

    // (a) A's own area → Day. The worker already holds A, so the plan is ONE
    // step: the child row, written with `p_keep_in_parent` so the RPC's `skip`
    // leaves A in place (§3.7 row 7).
    rpc.reset();
    await tileOn(page, root.ou_id, worker.worker_id).dragTo(cardById(page, day.ou_id));
    await rpc.expectOrdered(
      [{ ...base, p_from_ou_id: null, p_to_ou_id: day.ou_id, p_within_group_id: null, p_keep_in_parent: true }],
      "A's own area → Day"
    );
    await expectTileOn(page, day.ou_id, worker.worker_id, true);
    await expectTileOn(page, root.ou_id, worker.worker_id, false);
    let rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === group.group_id)?.ou_id, "the group's row is still A").toBe(root.ou_id);
    expect(rows.find((r) => r.group_id === childGroup.group_id)?.ou_id, "the shift row is Day").toBe(day.ou_id);
    await expectSheetUnits(page, day.ou_id, worker, { present: [rootLabel, dayLabel], absent: [nightLabel] });

    // (b) Day → Night: two children of A in one group, so the child row is
    // re-pointed and nothing else is written (§3.7 row 8).
    rpc.reset();
    await tileOn(page, day.ou_id, worker.worker_id).dragTo(cardById(page, night.ou_id));
    await rpc.expectOrdered(
      [{ ...base, p_from_ou_id: day.ou_id, p_to_ou_id: night.ou_id, p_within_group_id: null, p_keep_in_parent: true }],
      "Day → Night"
    );
    await expectTileOn(page, night.ou_id, worker.worker_id, true);
    await expectTileOn(page, day.ou_id, worker.worker_id, false);
    rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === group.group_id)?.ou_id, "the group's row is still A").toBe(root.ou_id);
    expect(rows.find((r) => r.group_id === childGroup.group_id)?.ou_id, "the shift row is Night").toBe(night.ou_id);
    await expectSheetUnits(page, night.ou_id, worker, { present: [rootLabel, nightLabel], absent: [dayLabel] });

    // (c) Night → A's own area (the heading, never a nested card): the group's
    // row is already A, so the plan is ONE unassign within the shift group —
    // "the parent's area holds the members in none of its children" (§3.7
    // row 4, D8).
    rpc.reset();
    await tileOn(page, night.ou_id, worker.worker_id).dragTo(cardHeading(page, root.ou_id));
    await rpc.expectOrdered(
      [{ ...base, p_from_ou_id: null, p_to_ou_id: null, p_within_group_id: childGroup.group_id, p_keep_in_parent: true }],
      "Night → A's own area"
    );
    await expectTileOn(page, root.ou_id, worker.worker_id, true);
    await expectTileOn(page, night.ou_id, worker.worker_id, false);
    rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === group.group_id)?.ou_id, "the group's row is still A").toBe(root.ou_id);
    expect(rows.find((r) => r.group_id === childGroup.group_id)?.ou_id, "the shift row is gone").toBeNull();
    await expectSheetUnits(page, root.ou_id, worker, { present: [rootLabel], absent: [dayLabel, nightLabel] });

    // Back into Day (the same single step as (a)) so the last drag starts from
    // a sub-unit, which is the case D1 exists for.
    rpc.reset();
    await tileOn(page, root.ou_id, worker.worker_id).dragTo(cardById(page, day.ou_id));
    await rpc.expectOrdered(
      [{ ...base, p_from_ou_id: null, p_to_ou_id: day.ou_id, p_within_group_id: null, p_keep_in_parent: true }],
      "A's own area → Day (again)"
    );
    await expectTileOn(page, day.ou_id, worker.worker_id, true);

    // (d) Day → "Unassigned in <Group>": the group's row goes, and so does the
    // shift row under it — otherwise the worker would re-appear inside the
    // worksite they were just removed from as a child-only tile (§3.7 row 12,
    // NS-a / D1). Two unassigns, the selected group first.
    rpc.reset();
    await tileOn(page, day.ou_id, worker.worker_id).dragTo(cardById(page, "unassigned"));
    await rpc.expectOrdered(
      [
        { ...base, p_from_ou_id: null, p_to_ou_id: null, p_within_group_id: group.group_id, p_keep_in_parent: true },
        { ...base, p_from_ou_id: null, p_to_ou_id: null, p_within_group_id: childGroup.group_id, p_keep_in_parent: true },
      ],
      "Day → Unassigned in the group"
    );
    // An Unassigned tile carries no unit id, so it is found inside the card.
    await expect(cardById(page, "unassigned").locator(`[data-worker-id="${worker.worker_id}"]`)).toBeVisible({
      timeout: 30_000,
    });
    await expectTileOn(page, day.ou_id, worker.worker_id, false);
    await expectTileOn(page, root.ou_id, worker.worker_id, false);
    rows = await membershipOf(client, worker.worker_id);
    expect(rows.find((r) => r.group_id === group.group_id)?.ou_id, "the group's row is gone").toBeNull();
    expect(rows.find((r) => r.group_id === childGroup.group_id)?.ou_id, "the shift row is gone too").toBeNull();
    expect(
      (await placementsOf(client, worker.worker_id)).map((p) => p.ou_id),
      "no placement is left behind anywhere in the subtree"
    ).not.toContain(day.ou_id);
  });
});
