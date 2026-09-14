// @vitest-environment jsdom
/**
 * WP2.2 Stage 4 — every wall-chart writer now leaves the chart as exactly one
 * structure RPC per §3.11 row (docs/organiser-ux-review/wp/wp2.2.md §3.11
 * rows 1–8 and the split row), and the fake client records what it sent.
 *
 * These tests pin the *call*: its name, its exact `p_*` payload (defaults
 * included — `p_keep_in_parent: true`, `p_keep_source: false`,
 * `p_delete_children: true`), how many were issued, and the observable
 * aftermath the WP2.3 suite already pins for the read side — query
 * invalidations, toasts, `window.alert`, dialog closes. The RPC answers are
 * static (harness/backend.ts); nothing here simulates the database.
 *
 * The move mutation is NOT mocked in this file (the WP2.3 interaction tests
 * mock it because they pin the drop handler, not the write). The two
 * post-move universe helpers are, because they are row 15's writers.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
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
} from "./harness/mocks";
import {
  answerRpc,
  installBackend,
  resetBackend,
  rpcInvocations,
} from "./harness/backend";
import { buildWallChartFixture } from "./harness/fixture";
import { button, openDialog, openDialogTitles, selectionBar, tile, tileButton, unitCard } from "./harness/locate";
import {
  click,
  dragAndDrop,
  installJsdomShims,
  keydown,
  mountWallChart,
  type MountedWallChart,
} from "./harness/mount";
import { createWallChartQueryClient } from "./harness/query-client";

const universe = vi.hoisted(() => ({
  stamp: vi.fn<(client: unknown, workerIds: number[], unitBasis: unknown) => Promise<number>>(async () => 0),
  sync: vi.fn<(client: unknown, workerIds: number[]) => Promise<unknown>>(async () => ({})),
}));

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("sonner", () => sonnerMock());
vi.mock("@/lib/workers/sync-campaign-universe", () => ({
  stampEmployerWorksiteFromOu: universe.stamp,
  syncWorkersToMatchingCampaigns: universe.sync,
}));

// Imported last: these modules pull in every mocked edge above.
import { isStructureApiError } from "@/lib/campaign/structure-api";
import { CampaignWallChart } from "../../campaign-wall-chart";
import { CreateOrganisingUnitDialog } from "../create-organising-unit-dialog";
import { DeleteOrganisingUnitDialog } from "../delete-organising-unit-dialog";
import { MergeUnitsDialog } from "../merge-units-dialog";
import { MoveOrCopyWorkersDialog } from "../copy-worker-to-unit-dialog";
import { useMoveWorkersMutation, type MoveWorkerResult, type MoveWorkerVars } from "../move-worker-mutation";
import { SplitUnitDialog, type SplitMember } from "../split-unit-dialog";
import { ALREADY_IN_GROUP_MESSAGE } from "../structure-error-message";
import type { WallChartOU } from "../types";
import { UnitsTab } from "../worker-detail-sheet";

/** Worker 101 (Ada Adams) sits in ou 10 "Acme Group", an employer container. */
const ADA = 101;
/** Worker 102 (Ben Baker) sits in ou 11 "Acme North". */
const BEN = 102;
/** Worker 103 (Cara Carter) sits in ou 12 "Acme South". */
const CARA = 103;
/** Worker 105 (Eve Evans) sits in ou 20 "Port Alpha", a worksite. */
const EVE = 105;
/** Worker 106 (Finn Foster) sits in ou 20 "Port Alpha". */
const FINN = 106;
/** Worker 108 (Hugo Hall) sits in ou 10 (primary) and ou 12. */
const HUGO = 108;
/** Worker 112 (Lena Lane) is unassigned. */
const LENA = 112;

const CAMPAIGN = 1;

/** The K1 duplicate, as PostgREST relays the RPC's explicit 23505 (wp2.2.md §3.2). */
const DUPLICATE_IN_GROUP = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
  details:
    "Key (worker_id, group_id)=(105, 3) already exists. Worker 105 already has a placement in group 3 of campaign 1; move it instead of adding a second one.",
  hint: "A worker is in at most one unit per group (wp2.2.md §3.4 C-a).",
};

/** The legacy exclusivity trigger's refusal (wp2.2.md §8.3 D17), relayed as P0001. */
const EXCLUSIVITY_RULE = {
  code: "P0001",
  message:
    "Worker 101 is already assigned to a unit in a different employer group within this campaign. Workers can only belong to one group of any given type per campaign. Remove the worker from their existing employer group before reassigning.",
};

const FORBIDDEN = { code: "42501", message: "permission denied for campaign 1" };

const FIXTURE_OUS = buildWallChartFixture("small").tables.campaign_organising_units as WallChartOU[];

function ou(ouId: number): WallChartOU {
  const found = FIXTURE_OUS.find((o) => o.ou_id === ouId);
  if (!found) throw new Error(`fixture has no ou ${ouId}`);
  return found;
}

/** Flush microtasks and effects a few times so an awaited mutation chain settles. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Set a controlled React input's value through the native setter, then notify React. */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

function inputByPlaceholder(root: ParentNode, placeholder: string): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!input) throw new Error(`No input with placeholder "${placeholder}"`);
  return input;
}

/**
 * Radix Select in jsdom: an open key on the trigger opens the listbox in a
 * portal; a selection key dispatched on the option itself selects it (the
 * item's own keydown handler, independent of focus).
 */
async function selectOption(trigger: Element, optionText: string): Promise<void> {
  await keydown(trigger, "ArrowDown");
  const options = [...document.body.querySelectorAll('[role="option"]')];
  const option = options.find((o) => (o.textContent ?? "").replace(/\s+/gu, " ").trim() === optionText);
  if (!option) {
    throw new Error(
      `No option "${optionText}". Available: ${options.map((o) => (o.textContent ?? "").trim()).join(" | ")}`
    );
  }
  await keydown(option, "Enter");
  await flush();
}

function combobox(root: ParentNode): Element {
  const el = root.querySelector('[role="combobox"]');
  if (!el) throw new Error("No combobox");
  return el;
}

const CARD_ROOT = '[class~="print:break-inside-avoid"]';

/** A button the card renders itself — nested sub-unit cards repeat the rating controls. */
function ownButton(card: HTMLElement, name: string): HTMLButtonElement {
  const matches = [...card.querySelectorAll("button")].filter(
    (b) => b.parentElement?.closest(CARD_ROOT) === card && (b.getAttribute("aria-label") ?? "").trim() === name
  );
  if (matches.length !== 1) throw new Error(`${matches.length} own buttons named "${name}"`);
  return matches[0];
}

/** The `queryKey` of every `invalidateQueries` call a spied QueryClient received, in order. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

// ---------------------------------------------------------------------------
// Direct renders (dialogs and the mutation hook) under the fixture backend.
// ---------------------------------------------------------------------------

type Rendered = { container: HTMLElement; queryClient: QueryClient; unmount: () => void };

let rendered: Rendered | null = null;
let mounted: MountedWallChart | null = null;

async function render(
  node: React.ReactNode,
  fixture: ReturnType<typeof buildWallChartFixture> = buildWallChartFixture("small")
): Promise<Rendered> {
  installJsdomShims();
  installBackend(fixture);
  const queryClient = createWallChartQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  });
  await flush();
  rendered = {
    container,
    queryClient,
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
      queryClient.clear();
      resetBackend();
    },
  };
  return rendered;
}

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSpies();
  universe.stamp.mockClear();
  universe.sync.mockClear();
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  mounted?.unmount();
  mounted = null;
  alertSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Row 1 — useMoveWorkersMutation → structure_placements_move
// ---------------------------------------------------------------------------

type Mutation = ReturnType<typeof useMoveWorkersMutation>;

function MutationProbe({ onReady }: { onReady: (mutation: Mutation) => void }) {
  onReady(useMoveWorkersMutation("1"));
  return null;
}

async function renderMutation(): Promise<{ mutation: Mutation; queryClient: QueryClient }> {
  let mutation: Mutation | null = null;
  const { queryClient } = await render(
    <MutationProbe
      onReady={(m) => {
        mutation = m;
      }}
    />
  );
  if (!mutation) throw new Error("mutation hook did not render");
  return { mutation, queryClient };
}

async function run(mutation: Mutation, vars: MoveWorkerVars): Promise<MoveWorkerResult> {
  let result: MoveWorkerResult | null = null;
  await act(async () => {
    result = await mutation.mutateAsync(vars);
  });
  await flush();
  if (!result) throw new Error("mutation produced no result");
  return result;
}

async function runExpectingError(mutation: Mutation, vars: MoveWorkerVars): Promise<unknown> {
  let caught: unknown = null;
  await act(async () => {
    try {
      await mutation.mutateAsync(vars);
    } catch (error) {
      caught = error;
    }
  });
  await flush();
  return caught;
}

describe("row 1 — useMoveWorkersMutation issues structure_placements_move", () => {
  it("a move from one unit to another is one call with the source and the defaults", async () => {
    const { mutation, queryClient } = await renderMutation();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    answerRpc("structure_placements_move", {
      data: { moved: 1, inserted: 0, displaced: 0, removed: 0, skipped: 0, parent_inserted: 1 },
      error: null,
    });

    const result = await run(mutation, {
      refs: [{ workerId: ADA, fromOuId: 10 }],
      toOuId: 11,
      mode: "move",
    });

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [ADA],
          p_from_ou_id: 10,
          p_to_ou_id: 11,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    // A re-pointed row and a parent row both land the worker somewhere new.
    expect(result).toEqual({ inserted: 2, deleted: 0, skipped: 0 });
    // The post-move universe sync still runs for the moved workers.
    expect(universe.sync).toHaveBeenCalledTimes(1);
    expect(universe.sync.mock.calls[0][1]).toEqual([ADA]);
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-worker-ou", "1"],
      ["campaign-members-full", "1"],
      ["workers"],
    ]);
  });

  it("keepInParent: false is passed through as p_keep_in_parent: false", async () => {
    const { mutation } = await renderMutation();

    await run(mutation, {
      refs: [{ workerId: BEN, fromOuId: 11 }],
      toOuId: 12,
      mode: "move",
      keepInParent: false,
    });

    expect(rpcInvocations().map((c) => c.args.p_keep_in_parent)).toEqual([false]);
  });

  it("toOuId null is one unassign-all call (p_to_ou_id null, no source) and skips the sync", async () => {
    const { mutation } = await renderMutation();
    answerRpc("structure_placements_move", {
      data: { moved: 0, inserted: 0, displaced: 0, removed: 3, skipped: 0, parent_inserted: 0 },
      error: null,
    });

    const result = await run(mutation, {
      refs: [
        { workerId: ADA, fromOuId: 10 },
        { workerId: HUGO, fromOuId: 12 },
        { workerId: LENA, fromOuId: null },
      ],
      toOuId: null,
      mode: "move",
    });

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [ADA, HUGO, LENA],
          p_from_ou_id: null,
          p_to_ou_id: null,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(result).toEqual({ inserted: 0, deleted: 3, skipped: 0 });
    expect(universe.sync).not.toHaveBeenCalled();
    expect(universe.stamp).not.toHaveBeenCalled();
  });

  it("a copy is one call with p_keep_source: true and no source, whatever the refs say", async () => {
    const { mutation } = await renderMutation();
    answerRpc("structure_placements_move", {
      data: { moved: 0, inserted: 2, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 },
      error: null,
    });

    const result = await run(mutation, {
      refs: [
        { workerId: EVE, fromOuId: 20 },
        { workerId: FINN, fromOuId: 20 },
        { workerId: EVE, fromOuId: 20 },
      ],
      toOuId: 10,
      mode: "copy",
    });

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [EVE, FINN],
          p_from_ou_id: null,
          p_to_ou_id: 10,
          p_within_group_id: null,
          p_keep_source: true,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(result).toEqual({ inserted: 2, deleted: 0, skipped: 0 });
  });

  it("a move drawn from several source units is one call per source, in ref order", async () => {
    const { mutation } = await renderMutation();

    const result = await run(mutation, {
      refs: [
        { workerId: ADA, fromOuId: 10 },
        { workerId: HUGO, fromOuId: 12 },
        { workerId: CARA, fromOuId: 12 },
        // Already at the target: never sent, counted as skipped.
        { workerId: BEN, fromOuId: 11 },
        { workerId: LENA, fromOuId: null },
      ],
      toOuId: 11,
      mode: "move",
    });

    expect(rpcInvocations().map((c) => [c.name, c.args.p_from_ou_id, c.args.p_worker_ids])).toEqual([
      ["structure_placements_move", 10, [ADA]],
      ["structure_placements_move", 12, [HUGO, CARA]],
      ["structure_placements_move", null, [LENA]],
    ]);
    expect(rpcInvocations().every((c) => c.args.p_to_ou_id === 11)).toBe(true);
    expect(result.skipped).toBe(1);
    // One sync for the whole mutation, over every worker the refs named.
    expect(universe.sync).toHaveBeenCalledTimes(1);
    expect(universe.sync.mock.calls[0][1]).toEqual([ADA, HUGO, CARA, BEN, LENA]);
  });

  it("a copy to Unassigned and an empty ref list issue no RPC at all", async () => {
    const { mutation } = await renderMutation();

    expect(
      await run(mutation, { refs: [{ workerId: EVE, fromOuId: 20 }], toOuId: null, mode: "copy" })
    ).toEqual({ inserted: 0, deleted: 0, skipped: 1 });
    expect(await run(mutation, { refs: [], toOuId: 11, mode: "move" })).toEqual({
      inserted: 0,
      deleted: 0,
      skipped: 0,
    });

    expect(rpcInvocations()).toEqual([]);
    expect(universe.sync).not.toHaveBeenCalled();
  });

  it("a refused RPC surfaces as a StructureApiError of the mapped kind and still invalidates", async () => {
    const { mutation, queryClient } = await renderMutation();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    answerRpc("structure_placements_move", { data: null, error: DUPLICATE_IN_GROUP });

    const caught = await runExpectingError(mutation, {
      refs: [{ workerId: EVE, fromOuId: 20 }],
      toOuId: 10,
      mode: "copy",
    });

    expect(isStructureApiError(caught)).toBe(true);
    expect(isStructureApiError(caught) && caught.kind).toBe("duplicate_in_group");
    expect(isStructureApiError(caught) && caught.constraint).toBe("campaign_worker_ou_one_unit_per_group");
    expect(rpcInvocations()).toHaveLength(1);
    // Nothing after the RPC runs on failure; onSettled still refetches.
    expect(universe.sync).not.toHaveBeenCalled();
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-worker-ou", "1"],
      ["campaign-members-full", "1"],
      ["workers"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Copy dialog — K1 and D17 wording (wp2.2.md §3.4 C-c, §8.3 D17)
// ---------------------------------------------------------------------------

describe("copy dialog — refused copies are worded for organisers", () => {
  async function renderCopyDialog(): Promise<{ onOpenChange: ReturnType<typeof vi.fn> }> {
    const onOpenChange = vi.fn();
    await render(
      <MoveOrCopyWorkersDialog
        open
        onOpenChange={onOpenChange}
        campaignId="1"
        refs={[{ workerId: EVE, fromOuId: null }]}
        mode="copy"
        lockMode
        workerLabel="Eve Evans"
        ous={FIXTURE_OUS}
        excludeOuIds={[20]}
      />
    );
    return { onOpenChange };
  }

  it("a same-group copy shows the K1 message and keeps the dialog open", async () => {
    const { onOpenChange } = await renderCopyDialog();
    answerRpc("structure_placements_move", { data: null, error: DUPLICATE_IN_GROUP });
    const dialog = openDialog();

    await selectOption(combobox(dialog), "Acme North");
    await click(button(dialog, "Copy"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [EVE],
          p_from_ou_id: null,
          p_to_ou_id: 11,
          p_within_group_id: null,
          p_keep_source: true,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith(ALREADY_IN_GROUP_MESSAGE);
    expect(ALREADY_IN_GROUP_MESSAGE).toBe("Already in this group — use Move.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a legacy exclusivity refusal (D17) is shown as a rule, not as a raw error", async () => {
    await renderCopyDialog();
    answerRpc("structure_placements_move", { data: null, error: EXCLUSIVITY_RULE });
    const dialog = openDialog();

    await selectOption(combobox(dialog), "Acme North");
    await click(button(dialog, "Copy"));
    await flush();

    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith(
      `Not allowed by the unit structure rules: ${EXCLUSIVITY_RULE.message}`
    );
  });

  it("a successful copy reports the result and closes", async () => {
    const { onOpenChange } = await renderCopyDialog();
    answerRpc("structure_placements_move", {
      data: { moved: 0, inserted: 1, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 },
      error: null,
    });
    const dialog = openDialog();

    await selectOption(combobox(dialog), "Acme North");
    await click(button(dialog, "Copy"));
    await flush();

    expect(spies.toastError).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Mounted chart — the drop handler (row 1 caller), bulk remove (row 8),
// the unit rating (row 6) and the reorder (row 7).
// ---------------------------------------------------------------------------

describe("mounted chart writers", () => {
  async function mount(): Promise<MountedWallChart> {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
    });
    return mounted;
  }

  it("a same-type drop issues the move RPC and clears the selection", async () => {
    const { container } = await mount();
    await click(tileButton(container, ADA), { ctrlKey: true });
    expect(selectionBar(container)).not.toBeNull();

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_move",
        args: {
          p_campaign_id: CAMPAIGN,
          p_worker_ids: [ADA],
          p_from_ou_id: 10,
          p_to_ou_id: 11,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(spies.toastError).not.toHaveBeenCalled();
    expect(selectionBar(container)).toBeNull();
  });

  it("a shift-drop copy refused as a same-group duplicate toasts the K1 message", async () => {
    const { container } = await mount();
    answerRpc("structure_placements_move", { data: null, error: DUPLICATE_IN_GROUP });

    await dragAndDrop(tile(container, EVE), unitCard(container, "Acme Group"), { shiftKey: true });
    await flush();

    expect(rpcInvocations().map((c) => [c.args.p_to_ou_id, c.args.p_keep_source])).toEqual([[10, true]]);
    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith(ALREADY_IN_GROUP_MESSAGE);
  });

  it("a move refused by the legacy exclusivity trigger (D17) toasts the rule", async () => {
    const { container } = await mount();
    answerRpc("structure_placements_move", { data: null, error: EXCLUSIVITY_RULE });

    await dragAndDrop(tile(container, ADA), unitCard(container, "Acme North"));
    await flush();

    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith(
      `Not allowed by the unit structure rules: ${EXCLUSIVITY_RULE.message}`
    );
  });

  it("a drop on a nested card issues exactly one move RPC — the parent card does not move the worker again", async () => {
    // WP2.3's double-invoke advisory became user-visible under the RPC path
    // (the second, bubbled call named the parent container as its target and
    // displaced the sub-unit placement just made), so WP2.2 Stage 4 fixed it
    // in the card's drop handling (wp2.2.md §8.3 D32).
    const { container } = await mount();

    await dragAndDrop(tile(container, LENA), unitCard(container, "Acme North"));
    await flush();

    expect(rpcInvocations().map((c) => [c.name, c.args.p_from_ou_id, c.args.p_to_ou_id])).toEqual([
      ["structure_placements_move", null, 11],
    ]);
    expect(spies.toastError).not.toHaveBeenCalled();
  });

  it("row 8: Remove from unit issues one unassign per unit, batched by unit", async () => {
    const { container, queryClient } = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await click(tileButton(container, EVE), { ctrlKey: true });
    await click(tileButton(container, FINN), { shiftKey: true });
    await click(tileButton(container, ADA), { shiftKey: true });
    expect(selectionBar(container)?.textContent).toContain("3 workers selected");

    await click(button(selectionBar(container) as HTMLElement, "Remove from unit"));
    expect(openDialogTitles()).toEqual(["Remove workers from unit?"]);
    await click(button(openDialog(), "Remove"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [EVE, FINN], p_ou_id: 20, p_within_group_id: null },
      },
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [ADA], p_ou_id: 10, p_within_group_id: null },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-worker-ou", "1"],
      ["campaign-ou-coverage", "1"],
    ]);
    expect(selectionBar(container)).toBeNull();
    expect(openDialogTitles()).toEqual([]);
  });

  it("row 8: a refused unassign is toasted, the board refetches, and the selection is kept", async () => {
    const { container, queryClient } = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    answerRpc("structure_placements_unassign", { data: null, error: FORBIDDEN });

    await click(tileButton(container, EVE), { ctrlKey: true });
    await click(button(selectionBar(container) as HTMLElement, "Remove from unit"));
    await click(button(openDialog(), "Remove"));
    await flush();

    expect(rpcInvocations()).toHaveLength(1);
    expect(spies.toastError).toHaveBeenCalledTimes(1);
    expect(spies.toastError).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-worker-ou", "1"],
      ["campaign-ou-coverage", "1"],
    ]);
    expect(selectionBar(container)?.textContent).toContain("1 worker selected");
  });

  it("row 3 via the chart: deleting a group counts and removes every descendant, not only direct children", async () => {
    // Acme Group (10) has children 11 and 12, and 12 has the grandchild 13:
    // structure_unit_delete removes all three, so the confirm says so.
    const { container } = await mount();

    await click(button(container, "Units (5)"));
    await click(button(document.body, "Delete Acme Group"));
    const dialog = openDialog();
    expect(dialog.textContent).toContain("is a group with 3 sub-units");
    await click(button(dialog, "Delete group + 3 sub-units"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_delete",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 10, p_reassignments: [], p_delete_children: true },
      },
    ]);
  });

  async function openUnitActions(card: HTMLElement): Promise<HTMLElement[]> {
    // Radix's dropdown trigger opens on ArrowDown; the items render in a portal.
    await keydown(ownButton(card, "Unit actions"), "ArrowDown");
    await flush();
    return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  it("split (D34/D38): a sub-unit of a group container may be split, with no reason line", async () => {
    const { container } = await mount();

    const items = await openUnitActions(unitCard(container, "Acme North"));
    const split = items.find((i) => (i.textContent ?? "").includes("Split into sub-units"));
    if (!split) throw new Error("No Split menu item");

    expect(split.getAttribute("aria-disabled")).not.toBe("true");
    expect(split.textContent).not.toContain("Units nested under another unit cannot be split");
  });

  it("split (D34/D38): a sub-unit of a non-container parent is disabled with the visible reason", async () => {
    const fixture = buildWallChartFixture("small");
    const ous = (fixture.tables.campaign_organising_units as WallChartOU[]).map((o) =>
      o.ou_id === 10 ? { ...o, is_group_container: false } : o
    );
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: { ...fixture, tables: { ...fixture.tables, campaign_organising_units: ous } },
    });
    const { container } = mounted;
    // A non-container parent rolls its children up by default; expand to reach them.
    await click(button(container, "Expand all"));

    const items = await openUnitActions(unitCard(container, "Acme North"));
    const split = items.find((i) => (i.textContent ?? "").includes("Split into sub-units"));
    if (!split) throw new Error("No Split menu item");

    expect(split.getAttribute("aria-disabled")).toBe("true");
    expect(split.textContent).toContain("Units nested under another unit cannot be split");
  });

  it("row 6: rating a unit patches user_rating through structure_unit_update", async () => {
    const { container, queryClient } = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await click(ownButton(unitCard(container, "Port Alpha"), "Rate 3 — Mediocre"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_update",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 20, p_patch: { user_rating: 3 } },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([["campaign-ous", "1"]]);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("row 6: clicking the current rating clears it (user_rating null)", async () => {
    const { container } = await mount();

    // Acme Group carries user_rating 2 in the fixture.
    await click(ownButton(unitCard(container, "Acme Group"), "Rate 2 — Strong"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_update",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 10, p_patch: { user_rating: null } },
      },
    ]);
  });

  it("row 6: a refused rating write is announced through window.alert", async () => {
    const { container } = await mount();
    answerRpc("structure_unit_update", { data: null, error: FORBIDDEN });

    await click(ownButton(unitCard(container, "Port Alpha"), "Rate 1 — Extremely strong"));
    await flush();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
  });

  it("row 7: moving a top-level unit down is one structure_unit_reorder over the whole order", async () => {
    const { container, queryClient } = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await click(button(container, "Units (5)"));
    await click(button(document.body, "Move Acme Group down"));
    await flush();

    // Top-level order after the move: Port Alpha, then Acme Group with its
    // children (and the grandchild, which follows the ous order as an uncovered id).
    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_reorder",
        args: { p_campaign_id: CAMPAIGN, p_ou_ids: [20, 10, 11, 12, 13] },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([["campaign-ous", "1"]]);
  });
});

// ---------------------------------------------------------------------------
// Row 2 — MergeUnitsDialog → structure_unit_merge
// ---------------------------------------------------------------------------

describe("row 2 — MergeUnitsDialog issues structure_unit_merge", () => {
  async function renderMerge(): Promise<{ onOpenChange: ReturnType<typeof vi.fn>; queryClient: QueryClient }> {
    const onOpenChange = vi.fn();
    const { queryClient } = await render(
      <MergeUnitsDialog
        open
        onOpenChange={onOpenChange}
        campaignId="1"
        ous={[ou(11), ou(12)]}
        workerCountByOu={new Map([[11, 2], [12, 2]])}
      />
    );
    return { onOpenChange, queryClient };
  }

  it("merges the other units into the chosen survivor in one call, then invalidates and closes", async () => {
    const { onOpenChange, queryClient } = await renderMerge();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await click(button(openDialog(), "Merge (keep Acme North)"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_merge",
        args: { p_campaign_id: CAMPAIGN, p_survivor_ou_id: 11, p_source_ou_ids: [12] },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-ous", "1"],
      ["campaign-worker-ou", "1"],
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("a refused merge (a source with child units, D8) alerts the rule and stays open", async () => {
    const { onOpenChange } = await renderMerge();
    answerRpc("structure_unit_merge", {
      data: null,
      error: {
        code: "P0001",
        message: "organising unit 12 has child units; delete or move them before merging it",
      },
    });

    await click(button(openDialog(), "Merge (keep Acme North)"));
    await flush();

    expect(alertSpy).toHaveBeenCalledWith(
      "Not allowed by the unit structure rules: organising unit 12 has child units; delete or move them before merging it"
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Row 3 — DeleteOrganisingUnitDialog → structure_unit_delete
// ---------------------------------------------------------------------------

describe("row 3 — DeleteOrganisingUnitDialog issues structure_unit_delete", () => {
  const ALL_OUS = FIXTURE_OUS.map((o) => ({
    ou_id: o.ou_id,
    name: o.name,
    ou_type: o.ou_type,
    parent_ou_id: o.parent_ou_id ?? null,
    ou_group_id: o.parent_ou_id ?? null,
    is_group_container: o.is_group_container ?? false,
  }));

  const DELETE_INVALIDATIONS = [
    ["campaign-ous", "1"],
    ["campaign-worker-ou", "1"],
    ["campaign-ou-coverage", "1"],
    ["campaign-unit-rules", "1"],
  ];

  async function renderDelete(props: {
    unit: WallChartOU;
    childOuIds?: number[];
    workers?: { worker_id: number; label: string; is_primary?: boolean }[];
  }) {
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    const { queryClient } = await render(
      <DeleteOrganisingUnitDialog
        open
        onOpenChange={onOpenChange}
        campaignId="1"
        unit={{ ...props.unit, ou_group_id: props.unit.parent_ou_id ?? null }}
        allOus={ALL_OUS}
        childOuIds={props.childOuIds ?? []}
        workers={props.workers ?? []}
        onDeleted={onDeleted}
      />
    );
    return { onOpenChange, onDeleted, queryClient };
  }

  it("an empty unit: no reassignments, children deleted, then onDeleted and close", async () => {
    const { onOpenChange, onDeleted, queryClient } = await renderDelete({ unit: ou(20) });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await click(button(openDialog(), "Delete unit"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_delete",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 20, p_reassignments: [], p_delete_children: true },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual(DELETE_INVALIDATIONS);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a group with sub-units: one call with p_delete_children true and no reassignments", async () => {
    const { onDeleted } = await renderDelete({
      unit: ou(10),
      childOuIds: [11, 12],
      workers: [{ worker_id: ADA, label: "Adams, Ada", is_primary: true }],
    });

    await click(button(openDialog(), "Delete group + 2 sub-units"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_delete",
        args: { p_campaign_id: CAMPAIGN, p_ou_id: 10, p_reassignments: [], p_delete_children: true },
      },
    ]);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("workers reassigned in bulk to a sibling become one reassignment each (no is_primary key)", async () => {
    await renderDelete({
      unit: ou(11),
      workers: [
        { worker_id: BEN, label: "Baker, Ben", is_primary: true },
        { worker_id: 107, label: "Grant, Gina" },
      ],
    });
    const dialog = openDialog();

    await selectOption(combobox(dialog), "Acme South");
    await click(button(dialog, "Delete unit"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_unit_delete",
        args: {
          p_campaign_id: CAMPAIGN,
          p_ou_id: 11,
          p_reassignments: [
            { worker_id: BEN, to_ou_id: 12 },
            { worker_id: 107, to_ou_id: 12 },
          ],
          p_delete_children: true,
        },
      },
    ]);
  });

  it("\"Unassigned\" reassigns to null; a refused delete alerts and stays open", async () => {
    const { onOpenChange, onDeleted, queryClient } = await renderDelete({
      unit: ou(11),
      workers: [{ worker_id: BEN, label: "Baker, Ben" }],
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    answerRpc("structure_unit_delete", { data: null, error: FORBIDDEN });
    const dialog = openDialog();

    await selectOption(combobox(dialog), "Unassigned (remove from this unit only)");
    await click(button(dialog, "Delete unit"));
    await flush();

    expect(rpcInvocations()[0].args.p_reassignments).toEqual([{ worker_id: BEN, to_ou_id: null }]);
    expect(alertSpy).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    // onSettled, not onSuccess: the refetch happens on failure too.
    expect(invalidatedKeys(invalidate)).toEqual(DELETE_INVALIDATIONS);
  });
});

// ---------------------------------------------------------------------------
// Row 4 — CreateOrganisingUnitDialog → structure_units_create (+ reorder)
// ---------------------------------------------------------------------------

describe("row 4 — CreateOrganisingUnitDialog issues structure_units_create", () => {
  const CREATE_INVALIDATIONS = [
    ["campaign-ous", "1"],
    ["campaign-ou-coverage", "1"],
    ["campaign-ous-for-create-dialog", "1"],
    ["campaign-worker-ou", "1"],
    ["campaign-members-full", "1"],
  ];

  async function renderCreate(fixture = buildWallChartFixture("small")) {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    const { queryClient } = await render(
      <CreateOrganisingUnitDialog
        open
        onOpenChange={onOpenChange}
        campaignId="1"
        displayOrder={6}
        onCreated={onCreated}
      />,
      fixture
    );
    return { onOpenChange, onCreated, queryClient };
  }

  /** The small fixture plus a shift-type group container, so "add to existing group" is offered. */
  function fixtureWithShiftGroup() {
    const fixture = buildWallChartFixture("small");
    const shiftGroup: WallChartOU = {
      ou_id: 30,
      campaign_id: 1,
      name: "Shift Group",
      ou_type: "shift",
      total_workers_estimated: 0,
      display_order: 6,
      is_group_container: true,
      parent_ou_id: null,
      user_rating: null,
    };
    return {
      ...fixture,
      tables: {
        ...fixture.tables,
        campaign_organising_units: [...(fixture.tables.campaign_organising_units as WallChartOU[]), shiftGroup],
      },
    };
  }

  async function walkToReview(dialog: HTMLElement): Promise<void> {
    await click(button(dialog, "Next: placement"));
    await click(button(dialog, "Next: add workers"));
    await flush();
    await click(button(dialog, "Next: review"));
  }

  it("a single unit is one create call, then one reorder over the placed blocks", async () => {
    const { onOpenChange, onCreated, queryClient } = await renderCreate();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    answerRpc("structure_units_create", {
      data: {
        units: [{ client_ref: "single", ou_id: 77, group_id: 5 }],
        inserted: 0,
        moved: 0,
        skipped: 0,
        displaced: 0,
      },
      error: null,
    });
    const dialog = openDialog();

    await typeInto(inputByPlaceholder(dialog, "e.g. Day Shift"), "Night crew");
    await walkToReview(dialog);
    await click(button(dialog, "Create units"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_units_create",
        args: {
          p_campaign_id: CAMPAIGN,
          p_units: [
            {
              client_ref: "single",
              name: "Night crew",
              ou_type: "shift",
              display_order: 6,
              source: "manual",
              is_group_container: false,
            },
          ],
          p_assignments: [],
        },
      },
      {
        // Bottom placement: every top-level block in display order, children
        // after their parent, then the new unit.
        name: "structure_unit_reorder",
        args: { p_campaign_id: CAMPAIGN, p_ou_ids: [10, 11, 12, 20, 77] },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual(CREATE_INVALIDATIONS);
    expect(onCreated).toHaveBeenCalledWith(77);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("allocated workers ride the same call as p_assignments keyed by the element's client_ref", async () => {
    // Pins the targetByRef / allocatedDraftKeys mapping: only a draft whose
    // selection was allocated contributes, under its own client_ref.
    const { onCreated } = await renderCreate();
    answerRpc("structure_units_create", {
      data: {
        units: [{ client_ref: "single", ou_id: 77, group_id: 5 }],
        inserted: 1,
        moved: 0,
        skipped: 0,
        displaced: 0,
      },
      error: null,
    });
    const dialog = openDialog();

    await typeInto(inputByPlaceholder(dialog, "e.g. Day Shift"), "Night crew");
    await click(button(dialog, "Next: placement"));
    await click(button(dialog, "Next: add workers"));
    await flush();
    // Lena (112) is the campaign's unassigned member, so the picker's default
    // "unassigned only" filter shows her.
    const lena = [...dialog.querySelectorAll('[role="checkbox"]')].find((c) =>
      /Lena/u.test(c.getAttribute("aria-label") ?? "")
    );
    if (!lena) throw new Error("No picker checkbox for Lena Lane");
    await click(lena);
    await click(button(dialog, "Allocate selected workers"));
    await click(button(dialog, "Next: review"));
    await click(button(dialog, "Create units"));
    await flush();

    const calls = rpcInvocations();
    expect(calls.map((c) => c.name)).toEqual(["structure_units_create", "structure_unit_reorder"]);
    expect(calls[0].args.p_assignments).toEqual([
      { ou_ref: "single", worker_id: LENA, is_primary: false, source: "manual" },
    ]);
    expect(onCreated).toHaveBeenCalledWith(77);
  });

  it("adding a unit to an existing group is one create call with numeric parent/group ids and no reorder", async () => {
    const { onCreated, onOpenChange } = await renderCreate(fixtureWithShiftGroup());
    answerRpc("structure_units_create", {
      data: {
        units: [{ client_ref: "add-to-existing", ou_id: 31, group_id: 5 }],
        inserted: 0,
        moved: 0,
        skipped: 0,
        displaced: 0,
      },
      error: null,
    });
    const dialog = openDialog();

    await click(button(dialog, "Group of units"));
    // Shift groups exist in this fixture, so the wizard asks which action.
    await click(button(dialog, "Add to existing group"));
    // The group-type select comes first; the "Pick a group..." select is last.
    const pickers = dialog.querySelectorAll('[role="combobox"]');
    await selectOption(pickers[pickers.length - 1], "Shift Group");
    await typeInto(inputByPlaceholder(dialog, "e.g. Night Shift"), "Late shift");
    await click(button(dialog, "Next: add workers"));
    await flush();
    await click(button(dialog, "Next: review"));
    await click(button(dialog, "Create units"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_units_create",
        args: {
          p_campaign_id: CAMPAIGN,
          p_units: [
            {
              client_ref: "add-to-existing",
              name: "Late shift",
              ou_type: "shift",
              display_order: 6,
              source: "manual",
              is_group_container: false,
              parent_ou_id: 30,
              ou_group_id: 30,
              unit_basis: { custom: true },
            },
          ],
          p_assignments: [],
        },
      },
    ]);
    expect(onCreated).toHaveBeenCalledWith(31);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a new group and its members are one create call, members bound to the container by client_ref", async () => {
    const { onCreated } = await renderCreate();
    answerRpc("structure_units_create", {
      data: {
        units: [
          { client_ref: "container", ou_id: 80, group_id: 5 },
          { client_ref: "member-0", ou_id: 81, group_id: 5 },
          { client_ref: "member-1", ou_id: 82, group_id: 5 },
          { client_ref: "member-2", ou_id: 83, group_id: 5 },
        ],
        inserted: 0,
        moved: 0,
        skipped: 0,
        displaced: 0,
      },
      error: null,
    });
    const dialog = openDialog();

    await click(button(dialog, "Group of units"));
    await typeInto(inputByPlaceholder(dialog, "e.g. Offshore Shifts"), "Offshore Shifts");
    await click(button(dialog, "Set up 3 units"));
    await typeInto(inputByPlaceholder(dialog, "Unit 1 name"), "Days");
    await typeInto(inputByPlaceholder(dialog, "Unit 2 name"), "Nights");
    // Unit 3 keeps the name the wizard seeded ("Shift 3").
    await walkToReview(dialog);
    await click(button(dialog, "Create units"));
    await flush();

    const calls = rpcInvocations();
    expect(calls.map((c) => c.name)).toEqual(["structure_units_create", "structure_unit_reorder"]);
    expect(calls[0].args).toEqual({
      p_campaign_id: CAMPAIGN,
      p_units: [
        {
          client_ref: "container",
          name: "Offshore Shifts",
          ou_type: "shift",
          display_order: 6,
          source: "manual",
          is_group_container: true,
        },
        {
          client_ref: "member-0",
          name: "Days",
          ou_type: "shift",
          display_order: 7,
          source: "manual",
          is_group_container: false,
          parent_ou_id: "container",
          ou_group_id: "container",
          unit_basis: { custom: true },
        },
        {
          client_ref: "member-1",
          name: "Nights",
          ou_type: "shift",
          display_order: 8,
          source: "manual",
          is_group_container: false,
          parent_ou_id: "container",
          ou_group_id: "container",
          unit_basis: { custom: true },
        },
        {
          client_ref: "member-2",
          name: "Shift 3",
          ou_type: "shift",
          display_order: 9,
          source: "manual",
          is_group_container: false,
          parent_ou_id: "container",
          ou_group_id: "container",
          unit_basis: { custom: true },
        },
      ],
      p_assignments: [],
    });
    expect(calls[1].args).toEqual({ p_campaign_id: CAMPAIGN, p_ou_ids: [10, 11, 12, 20, 80, 81, 82, 83] });
    expect(onCreated).toHaveBeenCalledWith(80);
  });
});

// ---------------------------------------------------------------------------
// Split — SplitUnitDialog → structure_unit_split (legacy RPC no longer called)
// ---------------------------------------------------------------------------

describe("split — SplitUnitDialog issues structure_unit_split", () => {
  const MEMBERS: SplitMember[] = [
    {
      worker_id: EVE,
      first_name: "Eve",
      last_name: "Evans",
      canonical_occupation_id: null,
      canonical_occupation_name: null,
      shift_id: null,
      work_area_id: null,
      roster_panel_id: null,
      tag_names: [],
    },
    {
      worker_id: FINN,
      first_name: "Finn",
      last_name: "Foster",
      canonical_occupation_id: 71,
      canonical_occupation_name: "Deckhand",
      shift_id: null,
      work_area_id: null,
      roster_panel_id: null,
      tag_names: [],
    },
  ];

  async function renderSplit(parent: WallChartOU = ou(20), sourceContainer?: WallChartOU | null) {
    const onOpenChange = vi.fn();
    const onSplit = vi.fn();
    const { queryClient } = await render(
      <SplitUnitDialog
        open
        onOpenChange={onOpenChange}
        campaignId="1"
        parent={parent}
        sourceContainer={sourceContainer}
        members={MEMBERS}
        onSplit={onSplit}
      />
    );
    return { onOpenChange, onSplit, queryClient };
  }

  const keepInParentSwitch = (dialog: HTMLElement) => dialog.querySelector('[role="switch"]');

  /**
   * Walk dimension → one named child (of `type`, when given, through the
   * drafts step's type select) → Eve assigned → review.
   */
  async function defineOneChild(
    dialog: HTMLElement,
    name: string,
    opts: { dimension?: string; type?: string } = {}
  ): Promise<void> {
    const prefix = opts.dimension ?? "Custom (define your own)";
    const dimension = [...dialog.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").startsWith(prefix)
    );
    if (!dimension) throw new Error(`No dimension button "${prefix}"`);
    await click(dimension);
    await click(button(dialog, "Continue"));
    await flush();
    // A dimension with nothing to suggest seeds no draft; add one.
    if (!dialog.querySelector('input[placeholder="e.g. Day shift"]')) {
      await click(button(dialog, "Add sub-unit"));
    }
    await typeInto(inputByPlaceholder(dialog, "e.g. Day shift"), name);
    if (opts.type) await selectOption(combobox(dialog), opts.type);
    await click(button(dialog, "Continue"));
    // Assign Eve to the (only) draft.
    const checkbox = dialog.querySelector('[role="checkbox"][aria-label="Select Evans, Eve"]');
    if (!checkbox) throw new Error("No member checkbox for Eve");
    await click(checkbox);
    await click(button(dialog, "Assign"));
    await click(button(dialog, "Continue"));
  }
  const defineOneCustomChild = (dialog: HTMLElement, name: string) => defineOneChild(dialog, name);

  it("children and assignments are one call keyed by client_ref; keep-in-parent maps to p_keep_in_source", async () => {
    const { onOpenChange, onSplit, queryClient } = await renderSplit();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");
    // Port Alpha is a worksite; a custom-kind child lands in another group, so
    // the keep-in-parent switch is offered (D33).
    expect(keepInParentSwitch(dialog)).not.toBeNull();

    const draftRef = expect.stringMatching(/^sub_[a-z0-9]+$/u);
    answerRpc("structure_unit_split", {
      data: { children: [{ client_ref: "sub_x", ou_id: 90, group_id: 7 }], moved: 1, copied: 0, kept: 0, displaced: 0 },
      error: null,
    });

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    const calls = rpcInvocations();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("structure_unit_split");
    expect(calls[0].args).toEqual({
      p_campaign_id: CAMPAIGN,
      p_source_ou_id: 20,
      p_children: [
        {
          client_ref: draftRef,
          name: "Night watch",
          ou_type: "custom",
          unit_basis: { parent_ou_id: 20, dimension: "custom", custom: true },
          total_workers_estimated: null,
        },
      ],
      p_assignments: [{ child_ref: draftRef, worker_id: EVE }],
      p_keep_in_source: true,
      p_group_id: null,
    });
    const children = calls[0].args.p_children as { client_ref: string }[];
    const assignments = calls[0].args.p_assignments as { child_ref: string }[];
    expect(assignments[0].child_ref).toBe(children[0].client_ref);
    expect(invalidatedKeys(invalidate)).toEqual([
      ["campaign-ous", "1"],
      ["campaign-worker-ou", "1"],
      ["campaign-units", "1"],
      ["campaign-unit-hierarchy-summary", "1"],
    ]);
    expect(onSplit).toHaveBeenCalledWith({ createdOuIds: [90], assignedWorkers: 1 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("switching keep-in-parent off sends p_keep_in_source false", async () => {
    await renderSplit();
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");

    const toggle = dialog.querySelector('[role="switch"]');
    if (!toggle) throw new Error("No keep-in-parent switch");
    await click(toggle);
    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(rpcInvocations().map((c) => c.args.p_keep_in_source)).toEqual([false]);
  });

  it("the keep-in-parent switch is hidden when every child derives to the source's own group, and nothing is claimed", async () => {
    // A custom-kind source and the custom dimension's custom-kind child share
    // one group: rule C-k moves the worker out of the source whatever the
    // switch says, so the switch is not shown and p_keep_in_source is false.
    await renderSplit({ ...ou(20), ou_type: "custom" });
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");

    expect(keepInParentSwitch(dialog)).toBeNull();
    expect(dialog.textContent).not.toContain("Keep workers in");

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(rpcInvocations().map((c) => [c.name, c.args.p_keep_in_source])).toEqual([
      ["structure_unit_split", false],
    ]);
  });

  it("a custom source split on the activist dimension (network children) is cross-group: switch shown, keep-in-source true by default", async () => {
    // WP2.1 gives custom-kind units one group per type label, so "custom" and
    // "network" are different groups (D33, corrected).
    await renderSplit({ ...ou(20), ou_type: "custom" });
    const dialog = openDialog();
    await defineOneChild(dialog, "Ada's network", { dimension: "Activist connection" });

    expect(keepInParentSwitch(dialog)).not.toBeNull();
    expect(dialog.textContent).toContain("Keep workers in");
    expect(dialog.textContent).toContain("can stay in the parent for roll-up reporting");

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    const calls = rpcInvocations();
    expect(calls.map((c) => [c.name, c.args.p_keep_in_source])).toEqual([["structure_unit_split", true]]);
    expect((calls[0].args.p_children as { ou_type: string }[]).map((c) => c.ou_type)).toEqual(["network"]);
  });

  it("a fixed-kind source with a child of the same kind (shift under shift) hides the switch", async () => {
    await renderSplit({ ...ou(20), ou_type: "shift" });
    const dialog = openDialog();
    await defineOneChild(dialog, "Night watch", { type: "Shift" });

    expect(keepInParentSwitch(dialog)).toBeNull();
    expect(dialog.textContent).not.toContain("Keep workers in");
    expect(dialog.textContent).toContain("Workers assigned to a sub-unit move into it");

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    const calls = rpcInvocations();
    expect(calls.map((c) => [c.name, c.args.p_keep_in_source])).toEqual([["structure_unit_split", false]]);
    expect((calls[0].args.p_children as { ou_type: string }[]).map((c) => c.ou_type)).toEqual(["shift"]);
  });

  it("a custom-type source under a container whose row is unavailable is treated as cross-group: switch shown", async () => {
    // Without the container row the dialog cannot know the container's kind;
    // the conservative answer offers the switch (inert at worst, never wrong).
    await renderSplit({ ...ou(20), ou_type: "custom", parent_ou_id: 10, ou_group_id: 10 });
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");

    expect(keepInParentSwitch(dialog)).not.toBeNull();

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(rpcInvocations().map((c) => c.args.p_keep_in_source)).toEqual([true]);
  });

  it("a custom-type source under a FIXED-kind container derives as if top-level: same-type child hides the switch (D39)", async () => {
    // Acme Group (10) is an employer container: the source sits in the
    // "Custom" label group, and so does its custom child.
    await renderSplit({ ...ou(20), ou_type: "custom", parent_ou_id: 10, ou_group_id: 10 }, ou(10));
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");

    expect(keepInParentSwitch(dialog)).toBeNull();
    expect(dialog.textContent).toContain("Workers assigned to a sub-unit move into it");

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(rpcInvocations().map((c) => c.args.p_keep_in_source)).toEqual([false]);
  });

  it("a custom-type source under a CUSTOM-kind container sits in that container's group: switch shown (D39)", async () => {
    await renderSplit(
      { ...ou(20), ou_type: "custom", parent_ou_id: 10, ou_group_id: 10 },
      { ...ou(10), ou_type: "custom" }
    );
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");

    expect(keepInParentSwitch(dialog)).not.toBeNull();

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(rpcInvocations().map((c) => c.args.p_keep_in_source)).toEqual([true]);
  });

  it("mixed children (one same-group, one cross-group) show the switch with the partial-scope sentence (D39)", async () => {
    await renderSplit({ ...ou(20), ou_type: "shift" });
    const dialog = openDialog();
    const custom = [...dialog.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").startsWith("Custom (define your own)")
    );
    if (!custom) throw new Error("No Custom dimension button");
    await click(custom);
    await click(button(dialog, "Continue"));
    await flush();
    // Draft 1: same group as the shift source; draft 2 stays custom (cross-group).
    await typeInto(inputByPlaceholder(dialog, "e.g. Day shift"), "Day watch");
    await selectOption(dialog.querySelectorAll('[role="combobox"]')[0], "Shift");
    await click(button(dialog, "Add sub-unit"));
    const nameInputs = dialog.querySelectorAll<HTMLInputElement>('input[placeholder="e.g. Day shift"]');
    await typeInto(nameInputs[nameInputs.length - 1], "Night circle");
    await click(button(dialog, "Continue"));
    const checkbox = dialog.querySelector('[role="checkbox"][aria-label="Select Evans, Eve"]');
    if (!checkbox) throw new Error("No member checkbox for Eve");
    await click(checkbox);
    const assignButtons = [...dialog.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Assign");
    expect(assignButtons).toHaveLength(2);
    await click(assignButtons[0]);
    await click(button(dialog, "Continue"));

    expect(keepInParentSwitch(dialog)).not.toBeNull();
    expect(dialog.textContent).toContain("Applies only to the sub-units in a different group from");

    await click(button(dialog, "Create 2 sub-units"));
    await flush();

    const calls = rpcInvocations();
    expect(calls.map((c) => [c.name, c.args.p_keep_in_source])).toEqual([["structure_unit_split", true]]);
    expect((calls[0].args.p_children as { name: string; ou_type: string }[]).map((c) => [c.name, c.ou_type])).toEqual([
      ["Day watch", "shift"],
      ["Night circle", "custom"],
    ]);
  });

  it("a refused split (a duplicate in the child's group) names the placement, without the K1 'use Move' remedy", async () => {
    const { onOpenChange } = await renderSplit();
    const dialog = openDialog();
    await defineOneCustomChild(dialog, "Night watch");
    answerRpc("structure_unit_split", {
      data: null,
      error: {
        ...DUPLICATE_IN_GROUP,
        details:
          "Key (worker_id, group_id)=(105, 7) already exists. p_assignments[0]: worker 105 is already on organising unit 44 in that group.",
      },
    });

    await click(button(dialog, "Create 1 sub-unit"));
    await flush();

    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      "A worker is already placed in that group in another unit — worker 105 is already on organising unit 44 in that group."
    );
    expect(dialog.textContent).not.toContain(ALREADY_IN_GROUP_MESSAGE);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Row 5 — worker-detail-sheet UnitsTab → set_primary / unassign
// ---------------------------------------------------------------------------

describe("row 5 — UnitsTab issues structure_placements_set_primary and _unassign", () => {
  async function renderUnitsTab() {
    const { container, queryClient } = await render(
      <UnitsTab
        campaignId="1"
        workerId={HUGO}
        ous={FIXTURE_OUS}
        assignedOuIds={[10, 12]}
        primaryOuId={10}
        canWrite
      />
    );
    return { container, queryClient };
  }

  it("Make primary is one set_primary call for that unit", async () => {
    const { container, queryClient } = await renderUnitsTab();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    // Only the non-primary unit (Acme South) offers the button.
    await click(button(container, "Make primary"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_set_primary",
        args: { p_campaign_id: CAMPAIGN, p_worker_id: HUGO, p_ou_id: 12 },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([["campaign-worker-ou", "1"]]);
  });

  it("Remove is one unassign call for that placement only", async () => {
    const { container, queryClient } = await renderUnitsTab();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const rows = [...container.querySelectorAll("p.font-medium")];
    const acmeGroupRow = rows.find((p) => p.textContent === "Acme Group")?.closest("div.rounded");
    if (!acmeGroupRow) throw new Error("No Acme Group row");
    await click(button(acmeGroupRow, "Remove"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_placements_unassign",
        args: { p_campaign_id: CAMPAIGN, p_worker_ids: [HUGO], p_ou_id: 10, p_within_group_id: null },
      },
    ]);
    expect(invalidatedKeys(invalidate)).toEqual([["campaign-worker-ou", "1"]]);
  });
});

// ---------------------------------------------------------------------------
// The harness records nothing it was not asked (sanity for the rpc edge).
// ---------------------------------------------------------------------------

describe("rpc harness", () => {
  it("an RPC the harness does not describe fails loudly instead of answering", async () => {
    await render(<div />);
    const { fakeRpc } = await import("./harness/backend");

    expect(() => fakeRpc("structure_group_create", { p_campaign_id: 1 })).toThrow(
      "Unseeded rpc: structure_group_create"
    );
  });
});
