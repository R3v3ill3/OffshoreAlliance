// @vitest-environment jsdom
/**
 * WP2.3 Stage 0 — explicit behavioural assertions for the wall chart.
 *
 * The characterisation snapshots pin what the chart *renders*; these pin what
 * it *does*. They exist because the decomposition moves selection, drag/drop,
 * per-scope state and URL writing across module boundaries, and a snapshot of
 * the initial render would not notice any of that breaking.
 *
 * Every expectation is a literal — no expected value is computed by re-running
 * product logic in the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  moveWorkerMutationMock,
  moveWorkersFailsWith,
  navigationMock,
  resetSpies,
  sonnerMock,
  spies,
  supabaseClientMock,
  workerDetailProviderMock,
} from "./harness/mocks";
import { buildWallChartFixture } from "./harness/fixture";
import {
  button,
  cardTiles,
  filterCheckbox,
  metrics,
  openDialog,
  openDialogTitles,
  selectionBar,
  summaryCard,
  tile,
  tileButton,
  unitCard,
  unitTitles,
} from "./harness/locate";
import {
  click,
  contextMenu,
  dragAndDrop,
  keydown,
  mountWallChart,
  type MountedWallChart,
} from "./harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("@/components/campaigns/wall-chart/move-worker-mutation", () =>
  moveWorkerMutationMock()
);
vi.mock("sonner", () => sonnerMock());

// The product's own drag MIME type, so the payload assertion reads the same
// key the drop targets read. Its literal value is pinned below, because
// importing the constant alone would let a change to the wire format pass.
import { DND_MIME_TYPE } from "../dnd";

// Imported last: this module pulls in every mocked edge above.
import { CampaignWallChart } from "../../campaign-wall-chart";

/** Worker 105 (Eve Evans) sits in ou 20 "Port Alpha", a worksite. */
const EVE = 105;
/** Worker 101 (Ada Adams) sits in ou 10 "Acme Group", an employer. */
const ADA = 101;
/** Worker 112 (Lena Lane) is unassigned. */
const LENA = 112;

let mounted: MountedWallChart;

async function mount(
  options: Partial<Parameters<typeof mountWallChart>[0]> = {}
): Promise<MountedWallChart> {
  mounted = await mountWallChart({
    Component: CampaignWallChart,
    fixture: buildWallChartFixture("small"),
    ...options,
  });
  return mounted;
}

beforeEach(() => {
  resetSpies();
});

afterEach(() => {
  mounted?.unmount();
});

describe("selection", () => {
  it("plain click opens the worker detail sheet and does not select", async () => {
    const { container } = await mount();

    await click(tileButton(container, EVE));

    expect(spies.openWorkerDetail).toHaveBeenCalledTimes(1);
    expect(spies.openWorkerDetail.mock.calls[0][0]).toBe(EVE);
    expect(selectionBar(container)).toBeNull();
  });

  it("ctrl-click selects instead of opening, and shift-click adds", async () => {
    const { container } = await mount();

    await click(tileButton(container, EVE), { ctrlKey: true });
    expect(spies.openWorkerDetail).not.toHaveBeenCalled();
    expect(tileButton(container, EVE).getAttribute("aria-pressed")).toBe("true");
    expect(selectionBar(container)?.textContent).toContain("1 worker selected");

    await click(tileButton(container, 106), { shiftKey: true });
    expect(selectionBar(container)?.textContent).toContain("2 workers selected");
  });

  it("Escape clears the selection", async () => {
    const { container } = await mount();

    await click(tileButton(container, EVE), { ctrlKey: true });
    expect(selectionBar(container)).not.toBeNull();

    await keydown(tileButton(container, EVE), "Escape");

    expect(selectionBar(container)).toBeNull();
    expect(tileButton(container, EVE).getAttribute("aria-pressed")).toBeNull();
  });
});

describe("drag and drop", () => {
  it("dropping a worker on another unit of the same type moves them", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"));

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(spies.moveWorkers.mock.calls[0][0]).toEqual({
      refs: [{ workerId: ADA, fromOuId: 10, fromOuType: "employer" }],
      toOuId: 11,
      mode: "move",
    });
  });

  it("the drag writes a version-1 payload for the dragged worker under the product MIME type", async () => {
    // The payload is the contract between the tile that starts the drag and
    // the card that receives it — it crosses a module boundary the
    // decomposition moved, and no other assertion reads it.
    expect(DND_MIME_TYPE).toBe("application/x-oa-wallchart-worker");
    const { container } = await mount();

    const dataTransfer = await dragAndDrop(
      tile(container, ADA),
      unitCard(container, "Acme North")
    );

    expect([...dataTransfer.types]).toContain(DND_MIME_TYPE);
    expect(JSON.parse(dataTransfer.getData(DND_MIME_TYPE))).toEqual({
      version: 1,
      refs: [{ workerId: ADA, fromOuId: 10, fromOuType: "employer" }],
    });

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(spies.moveWorkers.mock.calls[0][0]).toEqual({
      refs: [{ workerId: ADA, fromOuId: 10, fromOuType: "employer" }],
      toOuId: 11,
      mode: "move",
    });
    // `mutate(variables, { onSuccess, onError })` — not `mutateAsync`.
    expect(spies.moveWorkers.mock.calls[0][1]).toEqual({
      onSuccess: expect.any(Function),
      onError: expect.any(Function),
    });
  });

  it("holding shift while dropping copies instead of moving", async () => {
    const { container } = await mount();

    // Port Alpha is top-level, so exactly one card's drop handler sees this.
    await dragAndDrop(tile(container, LENA), unitCard(container, "Port Alpha"), {
      shiftKey: true,
    });

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(spies.moveWorkers.mock.calls[0][0]).toEqual({
      refs: [{ workerId: LENA, fromOuId: null, fromOuType: null }],
      toOuId: 20,
      mode: "copy",
    });
  });

  it("a drop on a nested card also reaches the parent card's handler", async () => {
    // Drop events are not stopped at the sub-unit card, so a copy onto
    // "Acme North" is seen by "Acme Group" too. Pinned as-is: it is the
    // current behaviour, and the decomposition must not change it silently.
    const { container } = await mount();

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"), {
      shiftKey: true,
    });

    expect(spies.moveWorkers).toHaveBeenCalledTimes(2);
    expect(spies.moveWorkers.mock.calls.map((c) => [c[0].toOuId, c[0].mode])).toEqual([
      [11, "copy"],
      [10, "copy"],
    ]);
  });

  it("moving across ou_types is blocked silently — no mutation and no toast", async () => {
    const { container } = await mount();

    // Eve is in the worksite "Port Alpha"; "Acme Group" is an employer.
    await dragAndDrop(tile(container, EVE), unitCard(container, "Acme Group"));

    expect(spies.moveWorkers).not.toHaveBeenCalled();
    expect(spies.toastError).not.toHaveBeenCalled();
    expect(spies.toastInfo).not.toHaveBeenCalled();
    expect(spies.toastWarning).not.toHaveBeenCalled();
  });

  it("copying across ou_types is allowed", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, EVE), unitCard(container, "Acme Group"), {
      shiftKey: true,
    });

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(spies.moveWorkers.mock.calls[0][0]).toEqual({
      refs: [{ workerId: EVE, fromOuId: 20, fromOuType: "worksite" }],
      toOuId: 10,
      mode: "copy",
    });
  });

  it("dropping on Unassigned moves to toOuId null", async () => {
    const { container } = await mount();

    await dragAndDrop(tile(container, ADA), unitCard(container, "Unassigned workers"));

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(spies.moveWorkers.mock.calls[0][0].toOuId).toBeNull();
    expect(spies.moveWorkers.mock.calls[0][0].mode).toBe("move");
  });

  it("a failed move surfaces the mutation's own message as an error toast", async () => {
    const { container } = await mount();
    moveWorkersFailsWith("No rows affected when removing the source assignment");

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"));

    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith(
      "No rows affected when removing the source assignment"
    );
  });

  it("a successful move clears the selection it acted on", async () => {
    const { container } = await mount();

    await click(tileButton(container, ADA), { ctrlKey: true });
    expect(selectionBar(container)).not.toBeNull();

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"));

    expect(spies.moveWorkers).toHaveBeenCalledTimes(1);
    expect(selectionBar(container)).toBeNull();
  });
});

describe("controls", () => {
  it("right-click opens the move/copy dialog for the worker whose tile was clicked", async () => {
    const { container } = await mount();
    expect(openDialogTitles()).toEqual([]);

    await contextMenu(tile(container, ADA));

    expect(openDialogTitles()).toEqual(["Move worker"]);
    // The dialog names its subject, so this proves the right-clicked tile's
    // worker reached it — not merely that some dialog opened.
    const dialog = openDialog();
    expect(dialog.textContent).toContain("Move Ada Adams to another organising unit.");
    // Ada is in an employer unit, and the dialog says so.
    expect(dialog.textContent).toContain("Showing Employer units only");
    expect(dialog.textContent).not.toContain("Eve Evans");
  });

  it("the no-units campaign explains how to add one", async () => {
    // Characterised as `empty-state=...` too; asserted here so the copy is
    // pinned by a named behaviour and not only by a snapshot line.
    const fixture = buildWallChartFixture("small");
    const { container } = await mount({
      fixture: {
        ...fixture,
        tables: { ...fixture.tables, campaign_organising_units: [], campaign_worker_ou: [] },
      },
    });

    const paragraphs = [...container.querySelectorAll("p")].map((p) =>
      (p.textContent ?? "").replace(/\s+/gu, " ").trim()
    );

    expect(paragraphs).toContain(
      "Add organising units to group workers into frames on the wall chart. Until then, members appear under unassigned above (if any). Use New unit above when you have access."
    );
    expect(unitTitles(container)).toEqual(["Unassigned workers"]);
  });

  it("the %/# toggle switches metrics to raw counts and persists the choice", async () => {
    const { container } = await mount();
    expect(metrics(summaryCard(container))).toContain("Members=75%");

    await click(button(container, "#"));

    expect(metrics(summaryCard(container))).toContain("Members=9");
    expect(button(container, "#").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "%").getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("wallchart:displayMode:1")).toBe("count");
  });

  it("the Links toggle flips the relationship overlay and persists it", async () => {
    const { container } = await mount();
    expect(button(container, "Links").getAttribute("aria-pressed")).toBe("false");

    await click(button(container, "Links"));

    // Switching the overlay on also reveals the link count in the label.
    expect(button(container, "Links (0)").getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("wallchart:overlay:1")).toBe("1");
  });

  it("Expand all / Collapse all switches every parent between sub-unit and roll-up", async () => {
    const { container } = await mount();
    expect(unitTitles(container)).toEqual([
      "Unassigned workers",
      "Acme Group",
      "Acme North",
      "Acme South",
      "Port Alpha",
    ]);

    await click(button(container, "Expand all"));

    // Acme South stops rolling its child up, but that child only becomes
    // visible once Acme South's own content is expanded.
    expect(unitTitles(container)).toEqual([
      "Unassigned workers",
      "Acme Group",
      "Acme North",
      "Acme South",
      "Port Alpha",
    ]);

    await click(button(unitCard(container, "Acme South"), "Expand unit"));

    expect(unitTitles(container)).toEqual([
      "Unassigned workers",
      "Acme Group",
      "Acme North",
      "Acme South",
      "South Deck",
      "Port Alpha",
    ]);

    await click(button(container, "Collapse all"));

    expect(unitTitles(container)).toEqual([
      "Unassigned workers",
      "Acme Group",
      "Port Alpha",
    ]);
  });

  it("closing the build list rewrites the query string without scrolling", async () => {
    const { container } = await mount({ search: "buildList=1&view=wall-chart" });

    await click(button(container, "Close build list panel"));

    expect(spies.replace).toHaveBeenCalledTimes(1);
    expect(spies.replace).toHaveBeenCalledWith("/campaigns/1?view=wall-chart", {
      scroll: false,
    });
  });
});

describe("per-scope state", () => {
  it("a unit's own filter still filters that unit after the units data is refreshed", async () => {
    // Per-scope filter state is keyed by ou_id and held above the card, so a
    // refresh of the units query is exactly the event that could drop it.
    const { container } = await mount();

    expect(cardTiles(unitCard(container, "Port Alpha"))).toEqual([
      "105 Eve Evans",
      "106 Finn Foster",
      "107 Gina Grant",
      "109 Ida Irwin",
      "110 Jack Jones",
      "111 Kim King",
    ]);

    // Filter Port Alpha down to its unrated members, through the real control.
    await click(button(unitCard(container, "Port Alpha"), "Filter"));
    await click(filterCheckbox("Unrated"));

    const filtered = ["106 Finn Foster", "109 Ida Irwin", "110 Jack Jones", "111 Kim King"];
    expect(cardTiles(unitCard(container, "Port Alpha"))).toEqual(filtered);
    expect(button(unitCard(container, "Port Alpha"), "Filter (1)")).toBeTruthy();
    // The filter is Port Alpha's alone.
    expect(cardTiles(unitCard(container, "Unassigned workers"))).toEqual(["112 Lena Lane"]);

    // Republish the units query with a renamed unit, so the refresh is
    // observable and cannot be mistaken for a no-op re-render.
    await mounted.setQueryData<{ ou_id: number; name: string }[]>(
      ["campaign-ous", "1"],
      (previous) =>
        previous.map((ou) => (ou.ou_id === 12 ? { ...ou, name: "Acme South Renamed" } : { ...ou }))
    );

    expect(unitTitles(container)).toContain("Acme South Renamed");
    expect(cardTiles(unitCard(container, "Port Alpha"))).toEqual(filtered);
    expect(button(unitCard(container, "Port Alpha"), "Filter (1)")).toBeTruthy();
  });

  it("selection and display mode survive a refresh of the underlying member data", async () => {
    const { container, queryClient } = await mount();

    await click(tileButton(container, EVE), { ctrlKey: true });
    await click(button(container, "#"));
    expect(selectionBar(container)?.textContent).toContain("1 worker selected");

    await mounted.refetch(["campaign-members-full", "1"]);

    expect(selectionBar(container)?.textContent).toContain("1 worker selected");
    expect(tileButton(container, EVE).getAttribute("aria-pressed")).toBe("true");
    expect(metrics(summaryCard(container))).toContain("Members=9");
    expect(
      queryClient.getQueryState(["campaign-members-full", "1"])?.dataUpdateCount
    ).toBeGreaterThan(1);
  });

  it("keeps the unassigned worker unassigned across a refresh", async () => {
    const { container } = await mount();
    expect(tile(container, LENA).getAttribute("data-ou-id")).toBe("");

    await mounted.refetch(["campaign-worker-ou", "1", "10,11,12,13,20"]);

    expect(tile(container, LENA).getAttribute("data-ou-id")).toBe("");
  });
});
