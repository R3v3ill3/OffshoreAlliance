// @vitest-environment jsdom
/**
 * WP2.4 Stage 2 (wp2.4.md §4.3) — behavioural assertions for the v2 wall
 * chart: the Group selector and `?group=` / prefs, the per-group Unassigned
 * card, plan-5.6 drops as `structure_placements_move` / `_unassign` calls
 * (the move mutation is real here; the two post-move universe helpers are
 * mocked as in the WP2.2 structure-writes suite), no copy, the one
 * campaign-wide Filter and Colour by, Show empty units, the Units manager and
 * search over the per-user hidden set, the Not in any group view, the
 * zero-groups state, the refused-move toast, A8 and the MN-a dialog.
 *
 * WP2.4c (wp2.4c.md §4.3) updates the cases the nested reading changes on the
 * `small` fixture: ou 13 "South Deck" (Shift) is a child of ou 12 "Acme
 * South" (Employer), so in the Employer view it renders NESTED inside Acme
 * South and the Shift group — every unit of which is nested — is no longer
 * offered as a primary group (SG-a). The nested behaviours themselves are
 * pinned on the `nested` fixture in `wall-chart-v2.nesting.test.tsx`.
 *
 * Every expectation is a literal.
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
import { answerRpc, rpcInvocations, writeInvocations, queryInvocations } from "../../__tests__/harness/backend";
import { buildWallChartFixtureV2 } from "../../__tests__/harness/fixture";
import {
  button,
  cardTiles,
  filterCheckbox,
  maybeButton,
  openDialog,
  openDialogTitles,
  selectOption,
  selectionBar,
  tile,
  tileButton,
  unitCard,
  unitTitles,
} from "../../__tests__/harness/locate";
import {
  click,
  contextMenu,
  dragAndDrop,
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
import { UnitsTab } from "../../worker-detail-sheet";
import type { WallChartOU } from "../../types";

/** Worker 102 (Ben Baker) sits in ou 11 "Acme North" (Employer group). */
const BEN = 102;
/** Worker 103 (Cara Carter) sits in ou 12 "Acme South" (Employer group). */
const CARA = 103;
/** Worker 104 (Dan Dawson) sits in ou 13 "South Deck" (Shift group). */
const DAN = 104;
/** Worker 105 (Eve Evans) sits in ou 20 "Port Alpha" (Worksite group). */
const EVE = 105;
/** Worker 107 (Gina Grant) sits in ou 11 (Employer) and ou 20 (Worksite). */
const GINA = 107;
/** Worker 108 (Hugo Hall) sits in ou 10 (no group) and ou 12 (Employer). */
const HUGO = 108;
/** Worker 112 (Lena Lane) has no placement anywhere. */
const LENA = 112;

const CAMPAIGN = 1;
const EMPLOYER = "Unassigned in Employer";

const FORBIDDEN = { code: "42501", message: "permission denied for campaign 1" };

let mounted: MountedWallChart;

async function mount(
  options: Partial<Parameters<typeof mountWallChart>[0]> = {}
): Promise<MountedWallChart> {
  mounted = await mountWallChart({
    Component: CampaignWallChartV2,
    fixture: buildWallChartFixtureV2("small"),
    ...options,
  });
  return mounted;
}

/** Flush microtasks and effects a few times so an awaited mutation chain settles. */
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

async function chooseGroup(root: ParentNode, label: string): Promise<void> {
  await click(groupTrigger(root));
  await click(selectOption(label));
  await flush(2);
}

function emptyUnitsSwitch(root: ParentNode): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Show empty units"]');
  if (!el) throw new Error("No Show empty units switch");
  return el;
}

/** The recorded `user_campaign_prefs` upserts, payload only, in order. */
function prefsUpserts(): unknown[] {
  return writeInvocations()
    .filter((w) => w.table === "user_campaign_prefs" && w.op === "upsert")
    .map((w) => w.payload);
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

/** The card's OWN ⋯ menu — a root card also contains its nested children's. */
function ownUnitActions(card: HTMLElement): HTMLButtonElement {
  const own = [...card.querySelectorAll("button")].filter(
    (b) =>
      b.getAttribute("aria-label") === "Unit actions" &&
      b.closest('[class~="print:break-inside-avoid"]') === card
  );
  if (own.length !== 1) throw new Error(`Expected one own "Unit actions" button, found ${own.length}`);
  return own[0];
}

async function openUnitActions(card: HTMLElement): Promise<HTMLElement[]> {
  await keydown(ownUnitActions(card), "ArrowDown");
  await flush(2);
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

async function chooseMenuItem(card: HTMLElement, label: string): Promise<void> {
  const items = await openUnitActions(card);
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

describe("Group selector, ?group= and prefs", () => {
  it("lists the groups in display order and then Not in any group, opening on the first group", async () => {
    const { container } = await mount();

    expect(groupTrigger(container).textContent).toBe("Employer");
    // South Deck is nested inside Acme South (wp2.4c.md §3.6, B1).
    expect(unitTitles(container)).toEqual(["Acme North", "Acme South", "South Deck", EMPLOYER]);

    await click(groupTrigger(container));
    // SG-a: Shift is sub-unit-only (its one unit is nested under an Employer
    // unit), so it is not offered and no "Unassigned in Shift" view exists.
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Employer",
      "Worksite",
      "Not in any group",
    ]);
  });

  it("writes the resolved group to the URL on first render when ?group= is absent", async () => {
    await mount();

    expect(spies.replace).toHaveBeenCalledTimes(1);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=1", { scroll: false });
  });

  it("does not rewrite a valid ?group= on first render", async () => {
    await mount({ search: "group=2" });

    expect(spies.replace).not.toHaveBeenCalled();
  });

  it("switching groups moves a worker from a unit card to that group's Unassigned card, writes ?group= and the prefs document, and clears the selection", async () => {
    const { container } = await mount();
    expect(cardTiles(unitCard(container, "Acme North"))).toEqual(["102 Ben Baker", "107 Gina Grant"]);
    await click(tileButton(container, GINA), { ctrlKey: true });
    expect(selectionBar(container)).not.toBeNull();
    spies.replace.mockClear();

    await chooseGroup(container, "Worksite");

    expect(groupTrigger(container).textContent).toBe("Worksite");
    expect(unitTitles(container)).toEqual(["Port Alpha", "Unassigned in Worksite"]);
    expect(cardTiles(unitCard(container, "Port Alpha"))).toContain("107 Gina Grant");
    expect(cardTiles(unitCard(container, "Unassigned in Worksite"))).toContain("104 Dan Dawson");
    expect(selectionBar(container)).toBeNull();
    expect(spies.replace).toHaveBeenCalledTimes(1);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=2", { scroll: false });
    expect(prefsUpserts()).toEqual([
      { user_id: "test-user", campaign_id: CAMPAIGN, prefs: { wallChart: { group: 2, v: 1 } } },
    ]);
  });

  it("the prefs read is scoped to the campaign and a stored group wins over the first group", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, group: 2 }, layout: "list" } }),
    });

    expect(groupTrigger(container).textContent).toBe("Worksite");
    expect(unitTitles(container)).toEqual(["Port Alpha", "Unassigned in Worksite"]);
    const read = queryInvocations().find((q) => q.table === "user_campaign_prefs");
    expect(read?.ops).toEqual([
      { method: "select", args: ["prefs"] },
      { method: "eq", args: ["campaign_id", CAMPAIGN] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=2", { scroll: false });
  });

  it("a prefs write carries the whole last-read document, so foreign keys survive", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, group: 2 }, layout: "list" } }),
    });

    await chooseGroup(container, "Employer");

    expect(prefsUpserts()).toEqual([
      { user_id: "test-user", campaign_id: CAMPAIGN, prefs: { layout: "list", wallChart: { v: 1, group: 1 } } },
    ]);
  });

  it("?ou= picks the focused unit's group", async () => {
    const { container } = await mount({ search: "ou=20" });

    expect(groupTrigger(container).textContent).toBe("Worksite");
    expect(unitTitles(container)).toEqual(["Port Alpha", "Unassigned in Worksite"]);
    // The link keeps ?ou= (the scroll-and-highlight effect reads it) and gains the group.
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?ou=20&group=2", { scroll: false });
  });

  it("?ou= wins over a conflicting valid ?group= and the link is rewritten to the unit's group (A6)", async () => {
    const { container } = await mount({ search: "ou=20&group=1" });

    expect(groupTrigger(container).textContent).toBe("Worksite");
    expect(spies.replace).toHaveBeenCalledTimes(1);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?ou=20&group=2", { scroll: false });
  });

  it("an invalid ?group= falls through and is rewritten", async () => {
    const { container } = await mount({ search: "group=99" });

    expect(groupTrigger(container).textContent).toBe("Employer");
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=1", { scroll: false });
  });
});

describe("drag rules (plan 5.6) and the selection bar", () => {
  it("a drop on a unit is one structure_placements_move per source unit with p_from_ou_id set", async () => {
    const { container } = await mount();
    // Ben (Acme North) and Cara (Acme South) selected, then Cara dragged onto Acme North.
    await click(tileButton(container, BEN), { ctrlKey: true });
    await click(tileButton(container, CARA), { shiftKey: true });

    await dragAndDrop(tile(container, CARA), unitCard(container, "Acme North"));
    await flush();

    // Ben is already there (no-op), so only Cara's source unit issues a call.
    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [CARA],
          p_from_ou_id: 12,
          p_to_ou_id: 11,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(selectionBar(container)).toBeNull();
  });

  it("the source is the worker's unit in the selected group, not the drag payload: from Unassigned it is null", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, EVE), unitCard(container, "Acme South"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [EVE],
          p_from_ou_id: null,
          p_to_ou_id: 12,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("a drop on Unassigned in <Group> is one move with p_to_ou_id null and p_within_group_id set", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, BEN), unitCard(container, EMPLOYER));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [BEN],
          p_from_ou_id: null,
          p_to_ou_id: null,
          p_within_group_id: 1,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("Shift-drop is the same move (CP-a: no copy), and the selection bar has no Copy button", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, BEN), unitCard(container, "Acme South"), { shiftKey: true });
    await flush();

    expect(rpcInvocations().map((c) => [c.name, c.args.p_keep_source])).toEqual([
      ["structure_placements_move", false],
    ]);

    await click(tileButton(container, BEN), { ctrlKey: true });
    const bar = selectionBar(container);
    if (!bar) throw new Error("No selection bar");
    expect([...bar.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual([
      "Move to unit…",
      "Remove from Employer",
      "Clear ratings…",
      "Link to leader…",
      "Clear",
    ]);
  });

  it("dropping on the unit the worker is already in is a no-op", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, BEN), unitCard(container, "Acme North"));
    await flush();

    expect(rpcInvocations()).toEqual([]);
  });

  it("Remove from <Group> is one structure_placements_unassign within the group", async () => {
    const { container } = await mount();
    await click(tileButton(container, BEN), { ctrlKey: true });
    await click(tileButton(container, CARA), { shiftKey: true });

    await click(button(container, "Remove from Employer"));
    expect(openDialogTitles()).toEqual(["Remove from Employer?"]);
    expect(openDialog().textContent).toContain(
      "2 workers will become Unassigned in Employer. They stay in the campaign and in their Units of every other Group."
    );
    await click(button(openDialog(), "Remove"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [BEN, CARA], p_ou_id: null, p_within_group_id: 1 },
      },
    ]);
    expect(selectionBar(container)).toBeNull();
  });

  it("a refused move surfaces the structure API's sentence as an error toast", async () => {
    const { container } = await mount();
    answerRpc("structure_placements_move", { data: null, error: FORBIDDEN });

    await dragAndDrop(tile(container, BEN), unitCard(container, "Acme South"));
    await flush();

    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
  });

  it("Select all is a click on the card count; a second click deselects", async () => {
    const { container } = await mount();

    await click(button(unitCard(container, "Acme North"), "Select all in Acme North"));
    expect(selectionBar(container)?.textContent).toContain("2 workers selected");
    expect(tileButton(container, BEN).getAttribute("aria-pressed")).toBe("true");

    await click(button(unitCard(container, "Acme North"), "Deselect all in Acme North"));
    expect(selectionBar(container)).toBeNull();
  });

  it("right-click opens a move-only dialog listing the group's units and Unassigned in <Group>, and Move issues the call", async () => {
    const { container } = await mount();

    await contextMenu(tile(container, BEN));
    expect(openDialogTitles()).toEqual(["Move worker"]);
    const dialog = openDialog();
    expect(dialog.textContent).toContain("Move Ben Baker to another Unit of Employer, or to Unassigned in Employer.");
    expect(dialog.textContent).not.toContain("Copy");

    await click(button(dialog, "Target unit"));
    // wp2.4c.md §3.7: the roots, each root's nested children right after it.
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Unassigned in Employer",
      "Acme North",
      "Acme South",
      "Acme South › South Deck",
    ]);
    await click(selectOption("Acme South"));
    await click(button(openDialog(), "Move"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [BEN],
          p_from_ou_id: 11,
          p_to_ou_id: 12,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(openDialogTitles()).toEqual([]);
  });
});

describe("Filter, Colour by and Show empty units (campaign-wide)", () => {
  it("one Filter applies to every card, shows a chip, and the chip's × clears it", async () => {
    const { container } = await mount();
    expect(maybeButton(unitCard(container, "Acme North"), "Filter")).toBeNull();

    await click(button(container, "Filter"));
    await click(filterCheckbox("Unrated"));

    expect(cardTiles(unitCard(container, "Acme South"))).toEqual(["108 Hugo Hall"]);
    expect(cardTiles(unitCard(container, EMPLOYER))).toEqual([
      "106 Finn Foster",
      "109 Ida Irwin",
      "110 Jack Jones",
      "111 Kim King",
    ]);
    // Acme North (Ben 2, Gina 2) is empty after filtering and, with Show empty
    // units off, hidden; so is the nested South Deck (Dan, rated 4).
    expect(unitTitles(container)).toEqual(["Acme South", EMPLOYER]);
    expect(container.textContent).toContain("2 empty units hidden");
    expect(button(container, "Filter (1)")).toBeTruthy();
    const chips = container.querySelector('[aria-label="Active filters"]');
    expect(chips?.textContent).toContain("Rating");

    await click(button(container, "Remove Rating filter"));

    expect(unitTitles(container)).toEqual(["Acme North", "Acme South", "South Deck", EMPLOYER]);
    expect(container.querySelector('[aria-label="Active filters"]')).toBeNull();
  });

  it("the filter is written to prefs, debounced, with Sets as sorted arrays", async () => {
    const { container } = await mount();

    await click(button(container, "Filter"));
    await click(filterCheckbox("Unrated"));
    expect(prefsUpserts()).toEqual([]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    await flush(2);

    const payload = prefsUpserts()[0] as { prefs: { wallChart: Record<string, unknown> } };
    expect(payload.prefs.wallChart.filter).toMatchObject({ ratings: ["unrated"], otherGroupUnitIds: [] });
    expect(payload.prefs.wallChart.sort).toBe("last_name");
    expect(payload.prefs.wallChart.participation).toEqual({ kind: "any" });
  });

  it("Show empty units shows a unit emptied by the filter", async () => {
    const { container } = await mount();
    await click(button(container, "Filter"));
    await click(filterCheckbox("Unrated"));
    await keydown(document.body, "Escape");
    expect(unitTitles(container)).toEqual(["Acme South", EMPLOYER]);

    await click(emptyUnitsSwitch(container));

    expect(unitTitles(container)).toEqual(["Acme North", "Acme South", "South Deck", EMPLOYER]);
    expect(cardTiles(unitCard(container, "Acme North"))).toEqual([]);
    expect(container.textContent).not.toContain("empty unit hidden");
    expect(prefsUpserts().at(-1)).toMatchObject({ prefs: { wallChart: { showEmptyUnits: true } } });
  });

  it("the Participation source lives inside the Filter popover and counts as a filter", async () => {
    const { container } = await mount();
    await click(button(container, "Filter"));

    const popover = [...document.body.querySelectorAll('[role="dialog"]')].at(-1);
    if (!popover) throw new Error("No filter popover");
    const participation = [...popover.querySelectorAll('button[role="combobox"]')].find((b) =>
      b.textContent?.includes("Any supportive rating")
    );
    if (!participation) throw new Error("No Participation selector inside Filter");
    await click(participation);
    await click(selectOption("Latest activity"));
    await flush(2);

    expect(button(container, "Filter (1)")).toBeTruthy();
    expect(container.querySelector('[aria-label="Active filters"]')?.textContent).toContain(
      "Participation: Latest activity"
    );
    // A2: the source is a real filter — only the workers rated on the latest
    // activity (501: Ada, Ben, Cara) stay on screen, in every card.
    expect(cardTiles(unitCard(container, "Acme North"))).toEqual(["102 Ben Baker"]);
    expect(cardTiles(unitCard(container, "Acme South"))).toEqual(["103 Cara Carter"]);
    expect(cardTiles(unitCard(container, EMPLOYER))).toEqual(["101 Ada Adams"]);
  });

  it("A4: Colour by and Filter carry accessible names", async () => {
    const { container } = await mount();

    const colourBy = container.querySelector<HTMLButtonElement>('button[aria-label="Colour by"]');
    expect(colourBy?.getAttribute("role")).toBe("combobox");
    expect(colourBy?.textContent).toBe("Cumulative");
    expect(button(container, "Filter")).toBeTruthy();
    expect(button(container, "Group").getAttribute("role")).toBe("combobox");
    expect(container.querySelector('[role="switch"][aria-label="Show empty units"]')).not.toBeNull();
  });

  it("'In unit of another group' keeps only workers who hold one of the ticked units", async () => {
    const { container } = await mount();
    await click(button(container, "Filter"));

    // Employer is selected, so Worksite's Port Alpha and Shift's South Deck are offered.
    expect(filterCheckbox("Port Alpha")).toBeTruthy();
    expect(filterCheckbox("South Deck")).toBeTruthy();
    await click(filterCheckbox("Port Alpha"));

    expect(cardTiles(unitCard(container, "Acme North"))).toEqual(["107 Gina Grant"]);
    expect(cardTiles(unitCard(container, EMPLOYER))).toEqual([
      "105 Eve Evans",
      "106 Finn Foster",
      "109 Ida Irwin",
      "110 Jack Jones",
      "111 Kim King",
    ]);
    expect(container.querySelector('[aria-label="Active filters"]')?.textContent).toContain(
      "In unit of another group (1)"
    );
  });

  it("Colour by changes every card and tile at once and is written to prefs", async () => {
    const { container } = await mount();
    expect(tileButton(container, BEN).title).not.toContain("Petition ask");

    const colourBy = container.querySelector<HTMLButtonElement>('button[aria-label="Colour by"]');
    if (!colourBy) throw new Error("No Colour by control");
    await click(colourBy);
    // The option's suffix carries a locale-formatted date, so match its head.
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) =>
      o.textContent?.startsWith("Petition ask")
    );
    if (!option) throw new Error("No Petition ask option");
    await click(option);
    await flush();

    for (const title of ["Acme North", "Acme South", EMPLOYER]) {
      const assessing = [...unitCard(container, title).querySelectorAll("p")].map((p) => p.textContent);
      expect(assessing).toContain("Assessing: Petition ask");
    }
    expect(tileButton(container, BEN).title).toContain("Petition ask");
    expect(container.textContent).toContain("Tile colour shows each worker's rating for Petition ask");
    expect(prefsUpserts().at(-1)).toMatchObject({
      prefs: { wallChart: { colourBy: { kind: "assessment", activityId: 501 } } },
    });
  });

  it("%/# and Links are persisted in prefs, never in browser storage", async () => {
    const { container } = await mount();

    await click(button(container, "#"));
    await click(button(container, "Links"));

    expect(button(container, "#").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "Links (0)").getAttribute("aria-pressed")).toBe("true");
    expect(prefsUpserts().at(-1)).toMatchObject({ prefs: { wallChart: { displayMode: "count", overlay: true } } });
    expect(window.localStorage.length).toBe(0);
  });
});

describe("hidden units, the Units manager and search (HU-a, appendix A 2.3)", () => {
  it("the Units manager lists the selected group's units, hides one, and the prefs payload carries it", async () => {
    const { container } = await mount();

    await click(button(container, "Units (3)"));
    const popover = [...document.body.querySelectorAll('[role="dialog"]')].at(-1);
    if (!popover) throw new Error("No Units popover");
    expect(popover.textContent).toContain("Hidden units are remembered for you on every device.");
    // wp2.4c.md §3.9: the tree — each root, with its nested children under it.
    expect([...popover.querySelectorAll("label")].map((l) => l.textContent?.trim())).toEqual([
      "Acme North",
      "Acme South(1)",
      "South Deck",
    ]);
    const box = popover.querySelector<HTMLElement>("#wc-ou-vis-11");
    if (!box) throw new Error("No visibility checkbox for Acme North");
    await click(box);

    expect(unitTitles(container)).toEqual(["Acme South", "South Deck", EMPLOYER]);
    expect(button(container, "Units (2/3)")).toBeTruthy();
    expect(prefsUpserts().at(-1)).toEqual({
      user_id: "test-user",
      campaign_id: CAMPAIGN,
      prefs: { wallChart: { v: 1, hiddenOuIds: [11] } },
    });
  });

  it("Show all clears the selected group's hidden units only", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, hiddenOuIds: [11, 20] } } }),
    });
    expect(unitTitles(container)).toEqual(["Acme South", "South Deck", EMPLOYER]);

    await click(button(container, "Units (2/3)"));
    await click(button(document.body, "Show all"));

    expect(unitTitles(container)).toEqual(["Acme North", "Acme South", "South Deck", EMPLOYER]);
    expect(prefsUpserts().at(-1)).toMatchObject({ prefs: { wallChart: { hiddenOuIds: [20] } } });
  });

  it("A10: a stored hidden id that names no unit is pruned on the next hidden-set write", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, hiddenOuIds: [11, 999] } } }),
    });
    expect(button(container, "Units (2/3)")).toBeTruthy();

    await click(button(container, "Units (2/3)"));
    const box = document.body.querySelector<HTMLElement>("#wc-ou-vis-12");
    if (!box) throw new Error("No visibility checkbox for Acme South");
    await click(box);

    expect(prefsUpserts().at(-1)).toMatchObject({ prefs: { wallChart: { hiddenOuIds: [11, 12] } } });
  });

  it("finding a worker in a hidden unit un-hides it, highlights it, and opens the sheet", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, hiddenOuIds: [11] } } }),
    });
    expect(unitTitles(container)).toEqual(["Acme South", "South Deck", EMPLOYER]);

    await click(button(container, "Find worker"));
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="Search workers by name…"]');
    if (!input) throw new Error("No search input");
    await typeInto(input, "ben");
    const item = [...document.body.querySelectorAll<HTMLElement>('[cmdk-item], [role="option"]')].find((i) =>
      i.textContent?.includes("Ben Baker")
    );
    if (!item) throw new Error("No search result for Ben Baker");
    // The result names the worker's unit IN THE SELECTED GROUP.
    expect(item.textContent).toContain("Acme North");
    await click(item);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(unitTitles(container)).toEqual(["Acme North", "Acme South", "South Deck", EMPLOYER]);
    expect(spies.openWorkerDetail).toHaveBeenCalledWith(BEN);
    expect(container.querySelector('[data-ou-id="11"]')?.className).toContain("ring-2");
    expect(prefsUpserts().at(-1)).toMatchObject({ prefs: { wallChart: { hiddenOuIds: [] } } });
  });
});

describe("Not in any group and the empty structure", () => {
  it("Not in any group holds the members with no placement in any group; a container without a group counts for nothing", async () => {
    const { container } = await mount({ search: "group=none" });

    expect(groupTrigger(container).textContent).toBe("Not in any group");
    expect(unitTitles(container)).toEqual(["Not in any group"]);
    // Ada sits only on the legacy container (no group); Lena has no placement at all.
    expect(cardTiles(unitCard(container, "Not in any group"))).toEqual(["101 Ada Adams", "112 Lena Lane"]);
    expect(maybeButton(container, "Remove from Employer")).toBeNull();
  });

  it("from Not in any group, Move to unit… lists every unit across groups as Group › Unit and moves into that group", async () => {
    const { container } = await mount({ search: "group=none" });
    await click(tileButton(container, LENA), { ctrlKey: true });
    const bar = selectionBar(container);
    if (!bar) throw new Error("No selection bar");
    expect(maybeButton(bar, "Remove from unit")).toBeNull();

    await click(button(bar, "Move to unit…"));
    await click(button(openDialog(), "Target unit"));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Employer › Acme North",
      "Employer › Acme South",
      "Worksite › Port Alpha",
      "Shift › South Deck",
    ]);
    await click(selectOption("Worksite › Port Alpha"));
    await click(button(openDialog(), "Move"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [LENA],
          p_from_ou_id: null,
          p_to_ou_id: 20,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("with the container carrying a group, its placements count and Hugo/Ada are in that group's unit", async () => {
    const { container } = await mount({
      fixture: buildWallChartFixtureV2("small", { withEmployerGroup: true }),
      search: "group=4",
    });

    expect(unitTitles(container)).toEqual(["Acme Group", "Unassigned in Company"]);
    expect(cardTiles(unitCard(container, "Acme Group"))).toEqual(["101 Ada Adams", "108 Hugo Hall"]);
  });

  it("zero groups: only Not in any group, selected, the whole membership as one flat grid", async () => {
    const { container } = await mount({ fixture: buildWallChartFixtureV2("small", { groups: [] }) });

    expect(groupTrigger(container).textContent).toBe("Not in any group");
    await click(groupTrigger(container));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Not in any group",
    ]);
    await keydown(document.body, "Escape");
    expect(container.textContent).toContain(
      "This campaign has no groups yet. Add units in Setup to start placing people."
    );
    expect(cardTiles(unitCard(container, "Not in any group"))).toHaveLength(12);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?group=none", { scroll: false });
  });
});

describe("the card's ⋯ menu (MN-a) and the sheet (A8)", () => {
  it("the menu carries Rename, Set estimate, Assign people, Split, Merge, Delete and nothing else", async () => {
    const { container } = await mount();

    const items = await openUnitActions(unitCard(container, "Acme North"));
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "Rename…",
      "Set estimate…",
      "Assign people…",
      "Split…",
      "Merge…",
      "Delete…",
    ]);
  });

  it("Rename… is one structure_unit_update with a name patch", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "Acme North"), "Rename…");
    expect(openDialogTitles()).toEqual(["Rename Unit"]);
    const input = openDialog().querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("No name input");
    expect(input.value).toBe("Acme North");
    await typeInto(input, "Acme North East");
    await click(button(openDialog(), "Save"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_update",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 11, p_patch: { name: "Acme North East" } },
      },
    ]);
    expect(openDialogTitles()).toEqual([]);
  });

  it("Set estimate… is one structure_unit_update with a total_workers_estimated patch; a refusal toasts", async () => {
    const { container } = await mount();
    answerRpc("structure_unit_update", { data: null, error: FORBIDDEN });

    await chooseMenuItem(unitCard(container, "Acme South"), "Set estimate…");
    expect(openDialogTitles()).toEqual(["Set estimate"]);
    const input = openDialog().querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("No estimate input");
    expect(input.value).toBe("3");
    await typeInto(input, "7");
    await click(button(openDialog(), "Save"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_update",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 12, p_patch: { total_workers_estimated: 7 } },
      },
    ]);
    expect(spies.toastError).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
    expect(openDialogTitles()).toEqual(["Set estimate"]);
  });

  it("Assign people… opens the add-worker dialog with the unit as context", async () => {
    const { container } = await mount();

    await chooseMenuItem(unitCard(container, "Acme North"), "Assign people…");

    expect(openDialogTitles()).toHaveLength(1);
    expect(openDialog().textContent).toContain("Acme North");
  });

  it("the unit card carries no View, Badges, Sort or Filter control", async () => {
    const { container } = await mount();
    const card = unitCard(container, "Acme North");

    expect([...card.querySelectorAll("button")].filter((b) => !b.closest("[data-worker-id]")).map((b) =>
      (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()
    )).toEqual([
      "Select all in Acme North",
      "Rate 1 — Extremely strong",
      "Rate 2 — Strong",
      "Rate 3 — Mediocre",
      "Rate 4 — Weak",
      "Rate 5 — Hostile",
      "Unit actions",
    ]);
    expect(card.querySelector('button[role="combobox"]')).toBeNull();
  });

  it("A8: a refused Remove in the sheet's Units tab toasts instead of failing silently, and rows carry the Group prefix", async () => {
    const fixture = buildWallChartFixtureV2("small");
    const ous = fixture.tables.campaign_organising_units as WallChartOU[];
    const { container } = await mountWallChart({
      Component: () => (
        <UnitsTab
          campaignId="1"
          workerId={HUGO}
          ous={ous}
          assignedOuIds={[10, 12]}
          primaryOuId={10}
          canWrite
          groupNameById={new Map([[1, "Employer"]])}
        />
      ),
      fixture,
    });
    mounted = { container, queryClient: mounted?.queryClient, unmount: () => {} } as unknown as MountedWallChart;
    answerRpc("structure_placements_unassign", { data: null, error: FORBIDDEN });

    const rows = [...container.querySelectorAll("p.font-medium")].map((p) => p.textContent);
    expect(rows).toEqual(["Acme Group", "Employer › Acme South"]);
    await click(button(container.querySelector("div.rounded") as HTMLElement, "Remove"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [HUGO], p_ou_id: 10, p_within_group_id: null },
      },
    ]);
    expect(spies.toastError).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
  });

  it("Dan is nested under Acme South in the Employer view and Shift is not offered (wp2.4c.md §4.3)", async () => {
    const { container } = await mount();

    // NP-a: Dan holds the shift row only, so the tree infers his root from
    // `parent_ou_id` and draws him inside Acme South's card, on South Deck —
    // not in "Unassigned in Employer", which is what the flat view said.
    expect(cardTiles(unitCard(container, "South Deck"))).toEqual([`${DAN} Dan Dawson`]);
    expect(cardTiles(unitCard(container, EMPLOYER))).not.toContain(`${DAN} Dan Dawson`);
    // The roll-up counts him under Acme South (B5), whose own area does not.
    expect(button(unitCard(container, "Acme South"), "Select all in Acme South (3 in unit · 2 not yet in a sub-unit)")).toBeTruthy();

    // SG-a: there is no Shift view to switch to.
    await click(groupTrigger(container));
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent)).not.toContain("Shift");
  });
});
