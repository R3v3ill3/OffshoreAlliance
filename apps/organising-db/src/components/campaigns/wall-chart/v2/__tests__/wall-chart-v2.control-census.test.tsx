// @vitest-environment jsdom
/**
 * WP2.4 Stage 2 (wp2.4.md §4.3, §2.3) — the appendix A §3 control census,
 * re-counted on the v2 wall chart.
 *
 * Mounts the whole workforce board (flag on) over the `small` fixture with a
 * selection, once with the build list closed and once open, and REPORTS the
 * interactive elements per region as a console table the verifier pastes
 * into §9.2 / §11. It ASSERTS the plan's targets: no per-unit View, Badges,
 * Sort or Filter control, no "Apply to all units", "Unit view", "Show
 * sub-units", "Expand all", "Collapse all" or "Copy to unit…" anywhere, and
 * at most 2 controls per unit card (+1 for the build-list drag handle).
 *
 * Counting rule (stated so the numbers can be read): an "element" is a
 * button, input, select, textarea, link or an element with an interactive
 * role; a "control" collapses the five buttons of one rating control into
 * one and reports the "Select all" click on the card count on its own line
 * (plan 5.6 makes "Select all" a click on the count, not a control of its
 * own — appendix A #37).
 */

import { describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
  workerDetailProviderMock,
} from "../../__tests__/harness/mocks";
import { buildWallChartFixtureV2 } from "../../__tests__/harness/fixture";
import { accessibleName, tileButton, unitCard } from "../../__tests__/harness/locate";
import { click, mountWallChart, type MountedWallChart } from "../../__tests__/harness/mount";

const flags = vi.hoisted(() => ({ groupsV2: true }));

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
vi.mock("@/lib/workspace/use-workspace", () => ({
  useWorkspace: () => ({ flags }),
}));

// Imported last: this module pulls in every mocked edge above.
import { WorkforceBoard } from "../../../workforce/workforce-board";

const CARD_ROOT = '[class~="print:break-inside-avoid"]';
const INTERACTIVE =
  'button, input, select, textarea, a[href], [role="button"], [role="checkbox"], [role="switch"], [role="combobox"], [role="menuitem"], [role="option"]';

/** The controls the v2 chart must not carry (appendix A §3 rows 22, 26–29, 33–35, 38–39, 41–49, 7, 52). */
const FORBIDDEN_NAMES = [
  /^View$/u,
  /^Apply to all units$/u,
  /^Unit view$/u,
  /^Show sub-units$/u,
  /^Expand all$/u,
  /^Collapse all$/u,
  /^Copy to unit…$/u,
];

type Region = { name: string; elements: string[]; controls: string[] };

function interactiveIn(root: Element, exclude: (el: Element) => boolean): Element[] {
  const seen = new Set<Element>();
  for (const el of root.querySelectorAll(INTERACTIVE)) {
    if (exclude(el)) continue;
    seen.add(el);
  }
  return [...seen];
}

function name(el: Element): string {
  return accessibleName(el) || el.getAttribute("title") || el.getAttribute("placeholder") || `<${el.tagName.toLowerCase()}>`;
}

/** Five "Rate n — …" buttons are one rating control; "Select all / Deselect all" is the count click. */
function collapse(names: string[]): string[] {
  const out: string[] = [];
  let ratingSeen = false;
  for (const n of names) {
    if (/^Rate \d — /u.test(n)) {
      if (!ratingSeen) out.push("Rating (5 levels)");
      ratingSeen = true;
      continue;
    }
    out.push(n);
  }
  return out;
}

function region(nameOf: string, root: Element, exclude: (el: Element) => boolean = () => false): Region {
  const elements = interactiveIn(root, exclude).map(name);
  return { name: nameOf, elements, controls: collapse(elements) };
}

function inTile(el: Element): boolean {
  return el.closest("[data-worker-id]") !== null;
}

function census(container: HTMLElement, label: string): Record<string, Region> {
  // The chart's outer `Card` carries no locator class of its own: CardTitle → CardHeader → Card.
  const chart = [...container.querySelectorAll("div")].find(
    (d) => d.children.length === 0 && d.textContent === "Wall chart"
  )?.parentElement?.parentElement;
  if (!chart) throw new Error("No wall chart card");
  const toolbar = container.querySelector("[data-wall-chart-toolbar]");
  const bar = container.querySelector('[role="region"][aria-label="Wall chart selection"]');
  const charts = [...container.querySelectorAll("div")].find(
    (d) => d.children.length === 0 && d.textContent === "Assessment distribution"
  )?.parentElement?.parentElement;
  const cards = [...container.querySelectorAll(CARD_ROOT)].filter((c) => c.querySelector("h3"));
  const unassigned = cards.find((c) => c.querySelector("h3")?.textContent?.startsWith("Unassigned in"));
  const unitCards = cards.filter((c) => c !== unassigned);
  const firstTile = container.querySelector("[data-worker-id]");
  if (!toolbar || !bar || !charts || !unassigned || unitCards.length === 0 || !firstTile) {
    throw new Error(`Census regions missing: toolbar=${!!toolbar} bar=${!!bar} charts=${!!charts} unassigned=${!!unassigned} units=${unitCards.length} tile=${!!firstTile}`);
  }

  const out: Record<string, Region> = {};
  out.board = region("board (outside the chart card)", container, (el) => chart.contains(el));
  out.selectionBar = region("selection bar", bar);
  out.toolbar = region("toolbar (sticky header)", toolbar, (el) => bar.contains(el));
  out.charts = region("charts card", charts);
  out.print = region("print", chart, (el) => name(el) !== "Print");
  unitCards.forEach((card, i) => {
    const r = region(`unit card: ${card.querySelector("h3")?.textContent}`, card, inTile);
    const handle = card.querySelector('[draggable="true"]:not([data-worker-id])');
    if (handle) {
      r.elements.push(`[build-list drag handle] ${name(handle)}`);
      r.controls.push(`[build-list drag handle] ${name(handle)}`);
    }
    out[`unitCard${i}`] = r;
  });
  out.unassignedCard = region(`unassigned card: ${unassigned.querySelector("h3")?.textContent}`, unassigned, inTile);
  out.tile = region(`tile: ${firstTile.getAttribute("data-worker-name")}`, firstTile);

  const table = Object.values(out).map((r) => ({
    region: r.name,
    elements: r.elements.length,
    controls: r.controls.filter((c) => !/^(Select|Deselect) all in /u.test(c) && !c.startsWith("[build-list")).length,
    countClick: r.controls.filter((c) => /^(Select|Deselect) all in /u.test(c)).length,
    buildListHandle: r.controls.filter((c) => c.startsWith("[build-list")).length,
    names: r.controls.join(" | "),
  }));
  console.log(`[wp2.4 census] ${label}\n` + JSON.stringify(table, null, 2));
  return out;
}

function fixedPageTotal(c: Record<string, Region>): number {
  return (
    c.board.controls.length +
    c.selectionBar.controls.length +
    c.toolbar.controls.length +
    c.charts.controls.length +
    c.print.controls.length
  );
}

function unitCardControls(r: Region): string[] {
  return r.controls.filter((n) => !/^(Select|Deselect) all in /u.test(n));
}

describe("WP2.4 control census (appendix A §3 re-count)", () => {
  let mounted: MountedWallChart | null = null;

  async function mountBoard(search: string): Promise<HTMLElement> {
    resetSpies();
    mounted?.unmount();
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small"),
      search,
    });
    // A selection, so the selection bar is on screen.
    await click(tileButton(mounted.container, 102), { ctrlKey: true });
    return mounted.container;
  }

  it("build list closed: reports the counts and carries no per-unit override control", async () => {
    const container = await mountBoard("view=wall-chart");
    const c = census(container, "build list closed, one worker selected");

    // Nothing named View / Badges / Sort / Filter inside any unit card; nothing
    // named Apply to all units / Unit view / Show sub-units / Expand all /
    // Collapse all / Copy to unit… anywhere on the page.
    for (const key of Object.keys(c).filter((k) => k.startsWith("unitCard") || k === "unassignedCard")) {
      const names = c[key].elements;
      expect(names.filter((n) => /^(View|Badges.*|Sort|Filter( \(\d+\))?)$/u.test(n))).toEqual([]);
    }
    const everything = interactiveIn(container, () => false).map(name);
    for (const re of FORBIDDEN_NAMES) expect(everything.filter((n) => re.test(n))).toEqual([]);
    expect(container.querySelector('button[role="combobox"][aria-label="View"]')).toBeNull();

    // Per unit card: rating + ⋯ menu, and the count click.
    for (const key of Object.keys(c).filter((k) => k.startsWith("unitCard"))) {
      expect(unitCardControls(c[key])).toEqual(["Rating (5 levels)", "Unit actions"]);
      expect(unitCardControls(c[key]).length).toBeLessThanOrEqual(2);
    }
    // Unassigned card: no toolbar control at all (only the count click).
    expect(unitCardControls(c.unassignedCard)).toEqual([]);
    // Fixed page controls: board 4 + selection bar 5 (Add to build list needs the panel) + toolbar 12 + charts 2 + print 1.
    expect(c.board.controls.length).toBe(4);
    expect(c.selectionBar.controls.length).toBe(5);
    expect(c.toolbar.controls).toEqual([
      "Group",
      "Show empty units",
      "Colour by",
      "Filter",
      "Badges: none",
      "%",
      "#",
      "Links",
      "Find worker",
      "Add worker",
      "Import Workers",
      "Units (2)",
    ]);
    expect(c.charts.controls.length).toBe(2);
    expect(c.print.controls).toEqual(["Print"]);
    expect(fixedPageTotal(c)).toBe(24);
    // Per tile: the tile button, its rating badge and its contact badges as DOM elements.
    expect(unitCard(container, "Acme North")).toBeTruthy();
    expect(c.tile.elements.length).toBeGreaterThan(0);
  });

  it("build list open: the selection bar gains Add to build list and each card gains the drag handle", async () => {
    const container = await mountBoard("view=wall-chart&buildList=1");
    const c = census(container, "build list open, one worker selected");

    expect(c.selectionBar.controls.length).toBe(6);
    expect(fixedPageTotal(c)).toBe(25);
    for (const key of Object.keys(c).filter((k) => k.startsWith("unitCard"))) {
      const controls = unitCardControls(c[key]);
      expect(controls.length).toBeLessThanOrEqual(3);
      expect(controls.filter((n) => !n.startsWith("[build-list"))).toEqual(["Rating (5 levels)", "Unit actions"]);
    }
    mounted?.unmount();
    mounted = null;
  });
});
