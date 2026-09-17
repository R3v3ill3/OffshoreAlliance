// @vitest-environment jsdom
/**
 * WP2.4c Stage 2 (wp2.4c.md §4.3) — nesting within a group on the v2 wall
 * chart, over the `nested` harness fixture: the campaign-42 shape the
 * operator found on production (`PROGRESS.md:103`) — an Employer container
 * "EDI Downer", four worksites under it (a facet link, never nesting), two
 * shift sub-units "Day" and "Night" under the largest worksite "KGP" (a
 * genuine NE-a nesting edge), a same-kind worksite child "Barrow Jetty"
 * (a SIBLING root under ruling 1) and a legacy container.
 *
 * Every expectation is a literal, and every write is asserted as the
 * `structure_placements_move` / `_unassign` payloads the RPC receives, in
 * order — the §3.7 step table is what this file pins on the chart.
 */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  spies,
  supabaseClientMock,
  workerDetailProviderMock,
} from "../../__tests__/harness/mocks";
import { answerRpc, rpcInvocations } from "../../__tests__/harness/backend";
import { buildWallChartFixtureV2 } from "../../__tests__/harness/fixture";
import {
  button,
  cardTiles,
  openDialog,
  openDialogTitles,
  selectOption,
  tile,
  tileButton,
  unitCard,
  unitTitles,
} from "../../__tests__/harness/locate";
import {
  click,
  contextMenu,
  dragAndDrop,
  fire,
  keydown,
  mountWallChart,
  type MountedWallChart,
} from "../../__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("sonner", () => sonnerMock());
vi.mock("@/lib/workers/sync-campaign-universe", () => ({
  stampEmployerWorksiteFromOu: async () => 0,
  syncWorkersToMatchingCampaigns: async () => ({}),
}));

// Imported last: this module pulls in every mocked edge above.
import { CampaignWallChartV2 } from "../../../campaign-wall-chart-v2";
import { CopyWorkerToUnitDialog } from "../../copy-worker-to-unit-dialog";
import { UnitsTab } from "../../worker-detail-sheet";
import type { WallChartOU } from "../../types";

const CAMPAIGN = 1;
const WORKSITE = 2;
const SHIFT = 3;

const KGP = 10;
const BARROW = 11;
const DAY = 20;
const NIGHT = 21;

/** KGP + Day. */
const PRIYA = 201;
/** KGP + Night. */
const QUENTIN = 202;
/** KGP, not yet on a shift. */
const ROSA = 203;
/** Night only — the child-only row (NP-a): no worksite placement at all. */
const SAM = 204;
/** Barrow + Day (under KGP) — the NC-a orphan. */
const TARA = 205;
/** KGP, not yet on a shift. */
const ALAN = 212;
/** Barrow. */
const CAL = 214;

const UNASSIGNED = "Unassigned in Worksite";
const FORBIDDEN = { code: "42501", message: "permission denied for campaign 1" };
const MOVE_OK = {
  data: { moved: 1, inserted: 0, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 },
  error: null,
};

let mounted: MountedWallChart;

async function mount(
  options: Partial<Parameters<typeof mountWallChart>[0]> = {}
): Promise<MountedWallChart> {
  mounted = await mountWallChart({
    Component: CampaignWallChartV2,
    fixture: buildWallChartFixtureV2("nested"),
    search: `group=${WORKSITE}`,
    ...options,
  });
  return mounted;
}

async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function groupTrigger(root: ParentNode): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>('button[aria-label="Group"]');
  if (!el) throw new Error("No Group selector");
  return el;
}

/** Only the moves and unassigns, as `[name, from, to, withinGroup]`, in order. */
function placementCalls(): Array<[string, unknown, unknown, unknown]> {
  return rpcInvocations()
    .filter((c) => c.name.startsWith("structure_placements_"))
    .map((c) => [c.name, c.args.p_from_ou_id ?? null, c.args.p_to_ou_id ?? null, c.args.p_within_group_id ?? null]);
}

/** The card's OWN ⋯ menu — a root card also contains its children's. */
function ownUnitActions(card: HTMLElement): HTMLButtonElement {
  const own = [...card.querySelectorAll("button")].filter(
    (b) =>
      b.getAttribute("aria-label") === "Unit actions" &&
      b.closest('[class~="print:break-inside-avoid"]') === card
  );
  if (own.length !== 1) throw new Error(`Expected one own "Unit actions" button, found ${own.length}`);
  return own[0];
}

async function menuItems(card: HTMLElement): Promise<string[]> {
  await keydown(ownUnitActions(card), "ArrowDown");
  await flush(2);
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((i) =>
    (i.textContent ?? "").trim()
  );
}

async function chooseMenuItem(card: HTMLElement, label: string): Promise<void> {
  await keydown(ownUnitActions(card), "ArrowDown");
  await flush(2);
  const items = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const item = items.find((i) => (i.textContent ?? "").trim() === label);
  if (!item) throw new Error(`No menu item "${label}" (have: ${items.map((i) => i.textContent).join(" | ")})`);
  await click(item);
  await flush(2);
}

beforeEach(() => {
  resetSpies();
});

afterEach(() => {
  mounted?.unmount();
});

describe("the nested band (B1, B5)", () => {
  it("renders the children inside the parent's card, with the parent's own area and the roll-up", async () => {
    const { container } = await mount();

    // The roots, KGP's two children nested inside its card, then Unassigned.
    expect(unitTitles(container)).toEqual([
      "KGP",
      "Day",
      "Night",
      "Barrow",
      "Ichthys",
      "Wheatstone",
      "Barrow Jetty",
      UNASSIGNED,
    ]);
    const kgp = unitCard(container, "KGP");
    expect(kgp.contains(unitCard(container, "Day"))).toBe(true);
    expect(kgp.contains(unitCard(container, "Night"))).toBe(true);
    expect(kgp.textContent).toContain("Units in KGP");

    // B1: the parent's own area holds the members in NONE of its children.
    expect(cardTiles(kgp)).toEqual(["212 Alan Ashby", "220 Ivy Ingram", "203 Rosa Ramirez"]);
    expect(cardTiles(unitCard(container, "Day"))).toEqual(["213 Bea Boyd", "201 Priya Patel"]);
    expect(cardTiles(unitCard(container, "Night"))).toEqual(["202 Quentin Quinn", "204 Sam Singh"]);

    // B5: the roll-up sentence and the sub-unit badge.
    expect(
      button(kgp, "Select all in KGP's own area (7 in unit · 3 not yet in a sub-unit)")
    ).toBeTruthy();
    expect(kgp.textContent).toContain("2 sub-units");

    // The other worksites nest nothing: a container link is a facet (NE-a) and
    // Barrow Jetty is a same-group child, so it is a SIBLING root (ruling 1).
    for (const title of ["Barrow", "Ichthys", "Wheatstone", "Barrow Jetty"]) {
      expect(unitCard(container, title).textContent).not.toContain("Units in ");
    }
    expect(cardTiles(unitCard(container, "Barrow Jetty"))).toEqual(["211 Zoe Zhang"]);
  });

  it("NP-a draws the child-only worker under the child; NC-a hides the orphan's second card", async () => {
    const { container } = await mount();

    // Sam holds the Night row and NO worksite row: the tree infers KGP from
    // `parent_ou_id`, so he is drawn on Night and is not Unassigned.
    expect(cardTiles(unitCard(container, "Night"))).toContain(`${SAM} Sam Singh`);
    expect(cardTiles(unitCard(container, UNASSIGNED))).not.toContain(`${SAM} Sam Singh`);

    // Tara holds Barrow AND a shift under KGP: her own row wins, the orphan is
    // counted but never drawn, so she is on exactly one card of this view.
    expect(cardTiles(unitCard(container, "Barrow"))).toContain(`${TARA} Tara Thomas`);
    expect(cardTiles(unitCard(container, "Day"))).not.toContain(`${TARA} Tara Thomas`);
    expect(container.querySelectorAll(`[data-worker-id="${TARA}"]`).length).toBe(1);
  });

  it("SG-a: the sub-unit-only Shift group is not offered and has no Unassigned card", async () => {
    const { container } = await mount();

    await click(groupTrigger(container));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Employer",
      "Worksite",
      "Not in any group",
    ]);
    await keydown(document.body, "Escape");
    expect(container.textContent).not.toContain("Unassigned in Shift");
  });

  it("SG-a: a stored sub-unit-only group falls through, and ?group= naming one is rewritten", async () => {
    const stored = await mount({
      fixture: buildWallChartFixtureV2("nested", { prefs: { wallChart: { v: 1, group: SHIFT } } }),
      search: "",
    });
    expect(groupTrigger(stored.container).textContent).toBe("Employer");
    stored.unmount();

    resetSpies();
    const { container } = await mount({ search: `group=${SHIFT}` });
    expect(groupTrigger(container).textContent).toBe("Employer");
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=1", { scroll: false });
  });

  it("?ou= on a nested unit opens its root's group and highlights the nested card", async () => {
    const { container } = await mount({ search: `ou=${DAY}` });

    expect(groupTrigger(container).textContent).toBe("Worksite");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(container.querySelector(`[data-ou-id="${DAY}"]`)?.className).toContain("ring-2");
  });
});

describe("the §3.7 drop table on the chart (B3)", () => {
  it("row 7 — the parent's own area → a child: one move onto the child, keepInParent", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, ALAN), unitCard(container, "Day"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [ALAN],
          p_from_ou_id: null,
          p_to_ou_id: DAY,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("row 8 — child → sibling child in the same group: one move, source is the row held", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, PRIYA), unitCard(container, "Night"));
    await flush();

    expect(placementCalls()).toEqual([["structure_placements_move", DAY, NIGHT, null]]);
  });

  it("row 4 — child → the parent's own area: the shift row goes, the worksite row stays", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, QUENTIN), unitCard(container, "KGP"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [QUENTIN],
          p_from_ou_id: null,
          p_to_ou_id: null,
          p_within_group_id: SHIFT,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("row 4 (child-only) — the parent row is ADDED before the shift row is removed", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, SAM), unitCard(container, "KGP"));
    await flush();

    // Adds before removes: a refusal part-way never leaves the worker with
    // fewer placements than they started with.
    expect(placementCalls()).toEqual([
      ["structure_placements_move", null, KGP, null],
      ["structure_placements_move", null, null, SHIFT],
    ]);
  });

  it("row 10 — another root's area → a child under KGP: the worksite move first, then the shift", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, CAL), unitCard(container, "Day"));
    await flush();

    expect(placementCalls()).toEqual([
      ["structure_placements_move", BARROW, KGP, null],
      ["structure_placements_move", null, DAY, null],
    ]);
  });

  it("row 12 — a nested tile → Unassigned in <Group>: the group's row and the shift row both go (NS-a)", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, PRIYA), unitCard(container, UNASSIGNED));
    await flush();

    expect(placementCalls()).toEqual([
      ["structure_placements_move", null, null, WORKSITE],
      ["structure_placements_move", null, null, SHIFT],
    ]);
  });

  it("a refusal on the second step names the step and still refetches", async () => {
    const { container } = await mount();
    answerRpc("structure_placements_move", MOVE_OK);
    answerRpc("structure_placements_move", { data: null, error: FORBIDDEN });

    await dragAndDrop(tile(container, PRIYA), unitCard(container, UNASSIGNED));
    await flush();

    expect(spies.toastError).toHaveBeenCalledWith(
      "Step 2 of 2 failed: You don't have permission to change this campaign's units. The chart shows what was saved."
    );
    // `onSettled`, not `onSuccess`: the board refetches what the database holds.
    const cache = mounted.queryClient.getQueryCache();
    expect(cache.find({ queryKey: ["campaign-worker-ou", "1"], exact: false })).toBeTruthy();
  });

  it("dropping a worker on the card they are already on is a no-op", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, PRIYA), unitCard(container, "Day"));
    await flush();

    expect(rpcInvocations()).toEqual([]);
  });

  it("Remove from Worksite on a nested tile issues the group's unassign and the shift's (D1)", async () => {
    const { container } = await mount();
    await click(tileButton(container, PRIYA), { ctrlKey: true });

    await click(button(container, "Remove from Worksite"));
    await click(button(openDialog(), "Remove"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [PRIYA], p_ou_id: null, p_within_group_id: WORKSITE },
      },
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [PRIYA], p_ou_id: null, p_within_group_id: SHIFT },
      },
    ]);
  });

  it("Move to unit… offers each root's children as <Root> › <Child>", async () => {
    const { container } = await mount();

    await contextMenu(tile(container, ROSA));
    await click(button(openDialog(), "Target unit"));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      UNASSIGNED,
      "KGP",
      "KGP › Day",
      "KGP › Night",
      "Barrow",
      "Ichthys",
      "Wheatstone",
      "Barrow Jetty",
    ]);

    await click(selectOption("KGP › Night"));
    await click(button(openDialog(), "Move"));
    await flush();

    expect(placementCalls()).toEqual([["structure_placements_move", null, NIGHT, null]]);
  });
});

describe("the card menus and the dialogs (SP-a, §3.9)", () => {
  it("SP-a: a nested card offers no Split…; a root still does", async () => {
    const { container } = await mount();

    expect(await menuItems(unitCard(container, "Day"))).toEqual([
      "Rename…",
      "Set estimate…",
      "Assign people…",
      "Merge…",
      "Delete…",
    ]);
    await keydown(document.body, "Escape");
    await flush(2);
    expect(await menuItems(unitCard(container, "KGP"))).toEqual([
      "Rename…",
      "Set estimate…",
      "Assign people…",
      "Split…",
      "Merge…",
      "Delete…",
    ]);
  });

  it("Delete… on a root announces its sub-units and deletes them with it (D17 closed)", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "KGP"), "Delete…");
    const dialog = openDialog();
    expect(dialog.textContent).toContain("2 sub-units");
    await click(button(dialog, "Delete group + 2 sub-units"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_delete",
        args: {
          p_campaign_id: CAMPAIGN,
          p_ou_id: KGP,
          p_reassignments: [],
          p_delete_children: true,
        },
      },
    ]);
  });

  it("Delete… names EVERY child the RPC removes, not only the nested ones (review B-2)", async () => {
    // The Employer view draws the container "EDI Downer" as an ordinary card
    // (NE-a: a container link is a facet, so nothing nests under it) — but
    // `structure_unit_delete` still removes every `parent_ou_id` child, which
    // here is all four worksites and, through them, their shifts.
    const { container } = await mount({ search: "group=1" });

    await chooseMenuItem(unitCard(container, "EDI Downer"), "Delete…");
    const dialog = openDialog();
    expect(dialog.textContent).toContain("is a group with 4 sub-units");
    expect(button(dialog, "Delete group + 4 sub-units")).toBeTruthy();
  });

  it("Delete… on a root announces its C-k same-group child too (review B-2)", async () => {
    // "Barrow Jetty" is a worksite child of "Barrow": ruling 1 makes it a
    // SIBLING root card, so it is not in `childrenByRoot` — but it is still a
    // `parent_ou_id` child and the RPC deletes it with Barrow.
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "Barrow"), "Delete…");
    const dialog = openDialog();
    expect(dialog.textContent).toContain("is a group with 1 sub-unit");
    expect(button(dialog, "Delete group + 1 sub-unit")).toBeTruthy();
  });

  it("Delete… on a nested card offers its sibling as the reassignment target", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "Day"), "Delete…");
    expect(openDialogTitles()).toEqual(["Delete unit and reassign workers"]);
    const dialog = openDialog();
    const target = [...dialog.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')].at(-1);
    if (!target) throw new Error("No reassignment target control");
    await click(target);
    const options = [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options).toContain("Night");
    expect(options).not.toContain("Barrow");
  });

  it("Merge… on a nested card offers only its siblings in the same group under the same root", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "Day"), "Merge…");
    await click(button(openDialog(), "Merge with"));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(["Night"]);
  });

  it("Merge… on a root offers the other roots, never a nested card", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "KGP"), "Merge…");
    await click(button(openDialog(), "Merge with"));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Barrow",
      "Ichthys",
      "Wheatstone",
      "Barrow Jetty",
    ]);
  });

  it("Split… on a root opens the unchanged split dialog (B4)", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "KGP"), "Split…");
    expect(openDialogTitles()).toEqual(["Split “KGP” into sub-units"]);
  });
});

describe("hidden units, empty units, the Units manager and search", () => {
  it("hiding a nested card removes it but keeps its workers in the root's roll-up", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("nested", { prefs: { wallChart: { v: 1, hiddenOuIds: [DAY] } } }),
    });

    expect(unitTitles(container)).not.toContain("Day");
    expect(
      button(unitCard(container, "KGP"), "Select all in KGP's own area (7 in unit · 3 not yet in a sub-unit)")
    ).toBeTruthy();
    // And they are NOT moved into the parent's own area.
    expect(cardTiles(unitCard(container, "KGP"))).toEqual(["212 Alan Ashby", "220 Ivy Ingram", "203 Rosa Ramirez"]);
  });

  it("hiding a root hides its whole subtree", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("nested", { prefs: { wallChart: { v: 1, hiddenOuIds: [KGP] } } }),
    });

    expect(unitTitles(container)).toEqual([
      "Barrow",
      "Ichthys",
      "Wheatstone",
      "Barrow Jetty",
      UNASSIGNED,
    ]);
  });

  it("finding a worker un-hides BOTH the hidden root and the hidden nested card in one write (review A-1)", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("nested", { prefs: { wallChart: { v: 1, hiddenOuIds: [KGP, DAY] } } }),
    });
    expect(unitTitles(container)).not.toContain("KGP");

    await click(button(container, "Find worker"));
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="Search workers by name…"]');
    if (!input) throw new Error("No search input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "priya");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    const item = [...document.body.querySelectorAll<HTMLElement>('[cmdk-item], [role="option"]')].find((i) =>
      i.textContent?.includes("Priya Patel")
    );
    if (!item) throw new Error("No search result for Priya Patel");
    await click(item);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Two `toggleHidden` calls in a row would have written the second only,
    // leaving the root hidden and the highlight on a card nobody renders.
    expect(unitTitles(container)).toContain("KGP");
    expect(unitTitles(container)).toContain("Day");
    expect(container.querySelector(`[data-ou-id="${DAY}"]`)?.className).toContain("ring-2");
  });

  it("the Units manager lists the nested cards under their root", async () => {
    const { container } = await mount();

    await click(button(container, "Units (7)"));
    const popover = [...document.body.querySelectorAll('[role="dialog"]')].at(-1);
    if (!popover) throw new Error("No Units popover");
    expect([...popover.querySelectorAll("label")].map((l) => l.textContent?.trim())).toEqual([
      "KGP(2)",
      "Day",
      "Night",
      "Barrow",
      "Ichthys",
      "Wheatstone",
      "Barrow Jetty",
    ]);
  });

  it("reordering a root carries its children with it", async () => {
    const { container } = await mount();
    await click(button(container, "Units (7)"));

    await click(button(document.body, "Move KGP down"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_reorder",
        // A-6: the Shift units (Day, Night) are NOT renumbered — only the
        // selected Group's own units are sent.
        args: { p_campaign_id: CAMPAIGN, p_ou_ids: [BARROW, KGP, 12, 13, 14] },
      },
    ]);
  });

  it("Show empty units off hides a nested card emptied by the Filter, and D17 counts both levels", async () => {
    const { container } = await mount();
    // The only activist in KGP's subtree is Sam, on Night: Day and KGP's own
    // area empty, KGP's SUBTREE does not, so KGP stays with Night inside it.
    await click(button(container, "Filter"));
    const box = [...document.body.querySelectorAll('[role="checkbox"]')].find(
      (c) => (c.parentElement?.textContent ?? "").trim() === "Activist"
    );
    if (!box) throw new Error("No Activist filter checkbox");
    await click(box);
    await keydown(document.body, "Escape");
    await flush(2);

    expect(unitTitles(container)).toEqual(["KGP", "Night", "Barrow Jetty", UNASSIGNED]);
    expect(cardTiles(unitCard(container, "Night"))).toEqual([`${SAM} Sam Singh`]);
    // D17: three roots whose whole subtree is empty (Barrow, Ichthys,
    // Wheatstone) counted once each, plus the one empty child of a rendered
    // root (Day) — never a dropped root's children on top.
    expect(container.textContent).toContain("4 empty units hidden");
  });

  it("Find worker names the nested card as <Root> › <Child> and highlights it", async () => {
    const { container } = await mount();

    await click(button(container, "Find worker"));
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="Search workers by name…"]');
    if (!input) throw new Error("No search input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, "priya");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    const item = [...document.body.querySelectorAll<HTMLElement>('[cmdk-item], [role="option"]')].find((i) =>
      i.textContent?.includes("Priya Patel")
    );
    if (!item) throw new Error("No search result for Priya Patel");
    expect(item.textContent).toContain("KGP › Day");

    await click(item);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(spies.openWorkerDetail).toHaveBeenCalledWith(PRIYA);
    expect(container.querySelector(`[data-ou-id="${DAY}"]`)?.className).toContain("ring-2");
  });
});

describe("the sheet and Assign people… (NC-a visibility, AP-a)", () => {
  it("the sheet's Units tab still lists the orphan's shift row (NC-a)", async () => {
    const fixture = buildWallChartFixtureV2("nested");
    const ous = fixture.tables.campaign_organising_units as WallChartOU[];
    const { container } = await mountWallChart({
      Component: () => (
        <UnitsTab
          campaignId="1"
          workerId={TARA}
          ous={ous}
          assignedOuIds={[BARROW, DAY]}
          primaryOuId={BARROW}
          canWrite
          groupNameById={new Map([[WORKSITE, "Worksite"], [SHIFT, "Shift"]])}
        />
      ),
      fixture,
    });
    mounted = { container, unmount: () => {} } as unknown as MountedWallChart;

    expect([...container.querySelectorAll("p.font-medium")].map((p) => p.textContent)).toEqual([
      "Worksite › Barrow",
      "Shift › Day",
    ]);
  });

  it("AP-a: Assign people… on a nested card also writes the root row", async () => {
    const base = buildWallChartFixtureV2("nested");
    const { container } = await mount({
      fixture: {
        ...base,
        apiRoutes: {
          ...base.apiRoutes,
          "/api/campaigns/1/create-worker": { success: true, worker_id: 901 },
          "/api/workers/search": { workers: [] },
        },
      },
    });

    await chooseMenuItem(unitCard(container, "Day"), "Assign people…");
    expect(openDialogTitles()).toEqual(["Add worker"]);
    const dialog = openDialog();
    expect(dialog.textContent).toContain("They will be assigned to the organising unit you opened this from.");

    // Radix Tabs activate on pointer-down, not on click.
    const newWorkerTab = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
      (t.textContent ?? "").includes("New worker")
    );
    if (!newWorkerTab) throw new Error("No New worker tab");
    await fire(newWorkerTab, new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await click(newWorkerTab);
    await flush(2);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    for (const [id, value] of [
      ["wc-add-fn", "Nina"],
      ["wc-add-ln", "Novak"],
    ] as const) {
      const input = document.body.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`No ${id} input`);
      await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        await Promise.resolve();
      });
    }
    await click(button(openDialog(), "Add worker"));
    await flush(8);

    // One follow-up move onto the root: the writer behind the dialog places
    // the worker on the sub-unit only (§3.10).
    expect(placementCalls()).toEqual([["structure_placements_move", null, KGP, null]]);
  });

  it("AP-a on a FLAT foreign-nested card never moves a worker off their worksite (review B-1)", async () => {
    // The mixed case (§3.4): a standalone shift root makes Shift primary, so
    // Day and Night render FLAT in the Shift view while their root KGP is a
    // unit of Worksite. The selected group is Shift; the root's group is not.
    const base = buildWallChartFixtureV2("nested");
    const fixture = {
      ...base,
      tables: {
        ...base.tables,
        campaign_organising_units: [
          ...(base.tables.campaign_organising_units as WallChartOU[]),
          {
            ou_id: 22,
            campaign_id: 1,
            name: "Swing",
            ou_type: "shift",
            total_workers_estimated: 2,
            display_order: 10,
            is_group_container: false,
            parent_ou_id: null,
            ou_group_id: null,
            group_id: SHIFT,
            user_rating: null,
          } as WallChartOU,
        ],
      },
      apiRoutes: {
        ...base.apiRoutes,
        // The added worker turns out to be Cal, already a member sitting on
        // the worksite "Barrow".
        "/api/campaigns/1/create-worker": { success: true, worker_id: CAL },
        "/api/workers/search": { workers: [] },
      },
    };
    const { container } = await mount({ fixture, search: `group=${SHIFT}` });

    // §3.6 / §3.13: the flat cards are titled "<Parent> › <Unit>" (A-2).
    // Swing holds nobody, so Show empty units off leaves the two flat cards.
    expect(unitTitles(container)).toEqual(["KGP › Day", "KGP › Night", "Unassigned in Shift"]);

    await chooseMenuItem(unitCard(container, "KGP › Day"), "Assign people…");
    const dialog = openDialog();
    const newWorkerTab = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
      (t.textContent ?? "").includes("New worker")
    );
    if (!newWorkerTab) throw new Error("No New worker tab");
    await fire(newWorkerTab, new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await click(newWorkerTab);
    await flush(2);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    for (const [id, value] of [
      ["wc-add-fn", "Cal"],
      ["wc-add-ln", "Curtis"],
    ] as const) {
      const input = document.body.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`No ${id} input`);
      await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        await Promise.resolve();
      });
    }
    await click(button(openDialog(), "Add worker"));
    await flush(8);

    // Cal holds Barrow in the ROOT's group (Worksite), so nothing is sent:
    // `move(null → KGP)` would displace Barrow (C-b) and silently move him to
    // another worksite out of a dialog's success callback.
    expect(placementCalls()).toEqual([]);
  });

  it("AP-a on a flat card still adds the root row for a worker who holds no worksite (review B-1)", async () => {
    const base = buildWallChartFixtureV2("nested");
    const fixture = {
      ...base,
      apiRoutes: {
        ...base.apiRoutes,
        // Gita holds no placement at all — Unassigned in every group.
        "/api/campaigns/1/create-worker": { success: true, worker_id: 218 },
        "/api/workers/search": { workers: [] },
      },
    };
    const { container } = await mount({ fixture });

    await chooseMenuItem(unitCard(container, "Day"), "Assign people…");
    const dialog = openDialog();
    const newWorkerTab = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
      (t.textContent ?? "").includes("New worker")
    );
    if (!newWorkerTab) throw new Error("No New worker tab");
    await fire(newWorkerTab, new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    await click(newWorkerTab);
    await flush(2);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    for (const [id, value] of [
      ["wc-add-fn", "Gita"],
      ["wc-add-ln", "Gupta"],
    ] as const) {
      const input = document.body.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`No ${id} input`);
      await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        await Promise.resolve();
      });
    }
    await click(button(openDialog(), "Add worker"));
    await flush(8);

    expect(placementCalls()).toEqual([["structure_placements_move", null, KGP, null]]);
  });

  it("AP-a: the sheet's copy dialog locks a nested target until the worker is in its root", async () => {
    const fixture = buildWallChartFixtureV2("nested");
    const ous = fixture.tables.campaign_organising_units as WallChartOU[];
    const { container } = await mountWallChart({
      Component: () => (
        <CopyWorkerToUnitDialog
          open
          onOpenChange={() => {}}
          campaignId="1"
          workerId={CAL}
          workerName="Cal Curtis"
          ous={ous}
          // Cal holds Barrow (Worksite) and no shift at all.
          currentOuIds={[BARROW]}
          groups={[
            { group_id: WORKSITE, name: "Worksite" },
            { group_id: SHIFT, name: "Shift" },
          ]}
        />
      ),
      fixture,
    });
    mounted = { container, unmount: () => {} } as unknown as MountedWallChart;

    await click(button(document.body, "Choose a target unit…"));
    const options = [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    // Day and Night sit under KGP and Cal's Worksite row is Barrow, so both
    // carry the §3.13 sentence and are disabled; the Worksite roots keep the
    // WP2.4 one-unit-per-group lock.
    expect(options).toContain("Shift › Day — Move to KGP first");
    expect(options).toContain("Shift › Night — Move to KGP first");
    const day = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent?.startsWith("Shift › Day")
    );
    expect(day?.getAttribute("data-disabled")).not.toBeNull();
    expect(options).toContain("Worksite › Ichthys — Already in this group — use Move.");
  });
});
