// @vitest-environment jsdom
/**
 * WP2.2 Stage 5 — every writer of the campaign units section
 * (docs/organiser-ux-review/wp/wp2.2.md §3.11 row 9) now leaves the
 * section as exactly one structure RPC, and the fake client records what it
 * sent. Mounted under the WP2.3 wall-chart harness (fixture tables + the
 * Stage 4 `rpc` edge), the way the Stage 4 tests pin rows 1–8 (§11.8).
 *
 * Pinned per path: the RPC name, its exact `p_*` payload (defaults
 * included), the call count, and the observable aftermath the legacy code
 * had — query invalidations, dialog closes, `window.alert`, the assign
 * feedback line — plus the two Stage 5 additions: the inline error line in
 * the unit dialog (D48) and the Type select fixed while editing (D48).
 */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
} from "../wall-chart/__tests__/harness/mocks";
import {
  DirectStructureWriteError,
  answerRpc,
  fakeFrom,
  installBackend,
  resetBackend,
  rpcInvocations,
  writeInvocations,
} from "../wall-chart/__tests__/harness/backend";
import { buildWallChartFixture, type WallChartFixture } from "../wall-chart/__tests__/harness/fixture";
import { button, openDialog } from "../wall-chart/__tests__/harness/locate";
import { click, keydown, mountWallChart, type MountedWallChart } from "../wall-chart/__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { CampaignUnitsSection } from "../campaign-units-section";

const CAMPAIGN = 1;
/** ou 20 "Port Alpha" (worksite) holds Eve (105), Finn (106), Gina (107), Ida (109), Jack (110), Kim (111). */
const PORT_ALPHA = 20;
/** Added by this file: a second worksite so the reallocate dialog has a same-type target. */
const PORT_BETA = 21;
const EVE = 105;
/** Worker 112 (Lena Lane) is unassigned. */
const LENA = 112;

const FORBIDDEN = { code: "42501", message: "no write permission on campaign 1" };
const DUPLICATE_IN_GROUP = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "campaign_worker_ou_one_unit_per_group"',
  details: "Key (worker_id, group_id)=(112, 3) already exists. Worker 112 already has a placement in group 3 of campaign 1; move it instead of adding a second one.",
};

/** The small wall-chart fixture plus the tables the units section reads and a second worksite. */
function buildSectionFixture(): WallChartFixture {
  const base = buildWallChartFixture("small");
  const members = base.tables.campaign_worker_membership as Array<{
    worker_id: number;
    worker: { worker_id: number; first_name: string; last_name: string };
  }>;
  const workerById = new Map(members.map((m) => [m.worker_id, m.worker]));
  const placements = (base.tables.campaign_worker_ou as Array<{ ou_id: number; worker_id: number; is_primary: boolean }>).map(
    (row, i) => ({
      id: 5000 + i,
      ...row,
      assignment_source: "manual",
      worker: workerById.get(row.worker_id) ?? null,
    })
  );
  return {
    ...base,
    tables: {
      ...base.tables,
      campaign_organising_units: [
        ...base.tables.campaign_organising_units,
        {
          ou_id: PORT_BETA,
          campaign_id: 1,
          name: "Port Beta",
          ou_type: "worksite",
          total_workers_estimated: 2,
          display_order: 6,
          is_group_container: false,
          parent_ou_id: null,
          user_rating: null,
        },
      ],
      campaign_worker_ou: placements,
      campaign_unit_rules: [],
      campaign_ou_coverage_summary: [],
      campaign_ou_candidates: [
        {
          candidate_id: 301,
          campaign_id: 1,
          suggested_name: "Night crew",
          suggested_ou_type: "shift",
          source: "wtp_analysis",
          estimated_workers: 5,
          commonality_logic: "Same roster",
          status: "suggested",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      employers: [],
      worksites: [],
      workers: [],
      worker_tags: [],
    },
  };
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

/** Radix Select in jsdom (as in the Stage 4 tests): open with a key, select with a key on the option. */
async function selectOption(trigger: Element, optionText: string): Promise<void> {
  await keydown(trigger, "ArrowDown");
  const options = [...document.body.querySelectorAll('[role="option"]')];
  const option = options.find((o) => (o.textContent ?? "").replace(/\s+/gu, " ").trim() === optionText);
  if (!option) {
    throw new Error(`No option "${optionText}". Available: ${options.map((o) => (o.textContent ?? "").trim()).join(" | ")}`);
  }
  await keydown(option, "Enter");
  await flush();
}

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

/** The section renders each unit as `div.rounded-md.border` holding `<p class="font-medium">{name}</p>`. */
function unitBlock(root: ParentNode, name: string): HTMLElement {
  const label = [...root.querySelectorAll("p.font-medium")].find((p) => collapse(p.textContent) === name);
  const block = label?.closest("div.rounded-md.border");
  if (!block) {
    throw new Error(
      `No unit block "${name}". Available: ${[...root.querySelectorAll("p.font-medium")].map((p) => collapse(p.textContent)).join(" | ")}`
    );
  }
  return block as HTMLElement;
}

function titled(root: ParentNode, title: string): HTMLButtonElement {
  const el = root.querySelector(`button[title="${title}"]`);
  if (!el) throw new Error(`No button titled "${title}"`);
  return el as HTMLButtonElement;
}

function rowOf(root: ParentNode, workerLabel: string): HTMLElement {
  const row = [...root.querySelectorAll("tr")].find((tr) => collapse(tr.textContent).includes(workerLabel));
  if (!row) throw new Error(`No row containing "${workerLabel}"`);
  return row as HTMLElement;
}

function checkbox(root: ParentNode, label: string): HTMLElement {
  const el = root.querySelector(`[role="checkbox"][aria-label="${label}"]`);
  if (!el) {
    throw new Error(
      `No checkbox "${label}". Available: ${[...root.querySelectorAll('[role="checkbox"]')].map((c) => c.getAttribute("aria-label")).join(" | ")}`
    );
  }
  return el as HTMLElement;
}

function dialogInputs(dialog: HTMLElement): HTMLInputElement[] {
  return [...dialog.querySelectorAll("input")] as HTMLInputElement[];
}

describe("CampaignUnitsSection writers through the structure API (wp2.2.md §3.11 row 9)", () => {
  let mounted: MountedWallChart | null = null;
  let alerts: string[] = [];
  let invalidations: unknown[][] = [];

  beforeEach(() => {
    resetSpies();
    alerts = [];
    invalidations = [];
    vi.spyOn(window, "alert").mockImplementation((message?: unknown) => {
      alerts.push(String(message));
    });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
  });

  async function mount(): Promise<MountedWallChart> {
    mounted = await mountWallChart({ Component: CampaignUnitsSection, fixture: buildSectionFixture(), canWrite: true });
    vi.spyOn(mounted.queryClient, "invalidateQueries").mockImplementation((filters) => {
      invalidations.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? []);
      return Promise.resolve();
    });
    return mounted;
  }

  describe("unit dialog (create / edit)", () => {
    it("Add unit → one structure_units_bulk_save with a single create; no display_order is sent (D47)", async () => {
      const { container } = await mount();
      await click(button(container, "Add unit"));
      const dialog = openDialog();
      expect(collapse(dialog.querySelector("h2")?.textContent)).toBe("Organising unit");
      const [name, estimate] = dialogInputs(dialog);
      await typeInto(name, "Night crew");
      await typeInto(estimate, "12");
      await click(button(dialog, "Save"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_units_bulk_save",
          args: {
            p_campaign_id: CAMPAIGN,
            p_delete_ou_ids: [],
            p_updates: [],
            p_creates: [{ name: "Night crew", ou_type: "department", source: "manual", total_workers_estimated: 12 }],
          },
        },
      ]);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(invalidations).toEqual([
        ["campaign-ous", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
      expect(alerts).toEqual([]);
    });

    it("Edit unit → one bulk save with a single update: the legacy patch minus ou_type; the Type select is fixed (D48)", async () => {
      const { container } = await mount();
      await click(titled(unitBlock(container, "Port Alpha"), "Edit unit"));
      const dialog = openDialog();
      expect(collapse(dialog.querySelector("h2")?.textContent)).toBe("Edit organising unit");
      const type = dialog.querySelector('[role="combobox"]') as HTMLElement;
      expect(type.hasAttribute("disabled") || type.getAttribute("data-disabled") != null).toBe(true);
      expect(collapse(dialog.textContent)).toContain("The type is fixed once a unit exists");

      const [name] = dialogInputs(dialog);
      expect(name.value).toBe("Port Alpha");
      await typeInto(name, "Port Alpha East");
      await click(button(dialog, "Save changes"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_units_bulk_save",
          args: {
            p_campaign_id: CAMPAIGN,
            p_delete_ou_ids: [],
            p_updates: [
              {
                ou_id: PORT_ALPHA,
                name: "Port Alpha East",
                commonality_logic: null,
                total_workers_estimated: 6,
                anchor_worker_id: null,
                target_size: null,
              },
            ],
            p_creates: [],
          },
        },
      ]);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(invalidations).toEqual([
        ["campaign-ous", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
    });

    it("a refused save keeps the dialog open and shows the sentence inline; closing clears it (D48)", async () => {
      answerRpc("structure_units_bulk_save", { data: null, error: FORBIDDEN });
      const { container } = await mount();
      await click(titled(unitBlock(container, "Port Alpha"), "Edit unit"));
      const dialog = openDialog();
      await click(button(dialog, "Save changes"));
      await flush();

      expect(rpcInvocations()).toHaveLength(1);
      expect(openDialog()).toBe(dialog);
      expect(collapse(dialog.querySelector('[role="alert"]')?.textContent)).toBe(
        "You don't have permission to change this campaign's units."
      );
      expect(invalidations).toEqual([]);
      expect(alerts).toEqual([]);

      await click(button(dialog, "Cancel"));
      await flush();
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      // Reopened for a create: no stale error line.
      await click(button(container, "Add unit"));
      expect(openDialog().querySelector('[role="alert"]')).toBeNull();
    });
  });

  it("rating → structure_unit_update with the one key (as row 6)", async () => {
    const { container } = await mount();
    const block = unitBlock(container, "Port Alpha");
    const three = [...block.querySelectorAll("button")].find((b) => collapse(b.textContent) === "3");
    if (!three) throw new Error("No rating button 3 on Port Alpha");
    await click(three);
    await flush();

    expect(rpcInvocations()).toEqual([
      { name: "structure_unit_update", args: { p_campaign_id: CAMPAIGN, p_ou_id: PORT_ALPHA, p_patch: { user_rating: 3 } } },
    ]);
    expect(invalidations).toEqual([["campaign-ous", "1"]]);
    expect(alerts).toEqual([]);
  });

  it("a refused rating is announced with the structure sentence through window.alert", async () => {
    answerRpc("structure_unit_update", { data: null, error: FORBIDDEN });
    const { container } = await mount();
    const block = unitBlock(container, "Port Alpha");
    const three = [...block.querySelectorAll("button")].find((b) => collapse(b.textContent) === "3");
    await click(three!);
    await flush();
    expect(alerts).toEqual(["You don't have permission to change this campaign's units."]);
    expect(invalidations).toEqual([]);
  });

  describe("remove from unit", () => {
    it("per-row remove → one structure_placements_unassign for the unit; the confirm dialog closes", async () => {
      answerRpc("structure_placements_unassign", { data: { removed: 1 }, error: null });
      const { container } = await mount();
      const block = unitBlock(container, "Port Alpha");
      await click(titled(rowOf(block, "Eve Evans"), "Remove from unit"));
      const confirm = openDialog();
      expect(collapse(confirm.textContent)).toContain("Remove 1 worker from this unit?");
      await click(button(confirm, "Remove"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_unassign",
          args: { p_campaign_id: CAMPAIGN, p_worker_ids: [EVE], p_ou_id: PORT_ALPHA, p_within_group_id: null },
        },
      ]);
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
      expect(invalidations).toEqual([
        ["campaign-worker-ou", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
      expect(alerts).toEqual([]);
    });

    it("bulk remove → the selected workers in one call", async () => {
      answerRpc("structure_placements_unassign", { data: { removed: 2 }, error: null });
      const { container } = await mount();
      const block = unitBlock(container, "Port Alpha");
      await click(checkbox(block, "Select Eve Evans"));
      await click(checkbox(block, "Select Finn Foster"));
      await click(button(block, "Remove from unit"));
      await click(button(openDialog(), "Remove"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_unassign",
          args: { p_campaign_id: CAMPAIGN, p_worker_ids: [EVE, 106], p_ou_id: PORT_ALPHA, p_within_group_id: null },
        },
      ]);
    });

    it("fewer rows than asked (the data changed since the page loaded) stays loud, as the counted delete was", async () => {
      answerRpc("structure_placements_unassign", { data: { removed: 0 }, error: null });
      const { container } = await mount();
      await click(titled(rowOf(unitBlock(container, "Port Alpha"), "Eve Evans"), "Remove from unit"));
      await click(button(openDialog(), "Remove"));
      await flush();
      expect(alerts).toEqual([
        "Removing the workers from the unit: nothing changed. You may not have permission to change this campaign, or the data changed since you loaded it. Refresh and try again.",
      ]);
      expect(invalidations).toEqual([]);
    });
  });

  describe("reallocate", () => {
    it("from a unit → one structure_placements_move (source → target, keepInParent false, D50)", async () => {
      const { container } = await mount();
      const block = unitBlock(container, "Port Alpha");
      await click(checkbox(block, "Select Eve Evans"));
      await click(button(block, "Reallocate to…"));
      const dialog = openDialog();
      expect(collapse(dialog.querySelector("h2")?.textContent)).toBe("Reallocate to another unit");
      await selectOption(dialog.querySelector('[role="combobox"]')!, "Port Beta");
      await click(button(dialog, "Reallocate"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_move",
          args: {
            p_campaign_id: CAMPAIGN,
            p_worker_ids: [EVE],
            p_from_ou_id: PORT_ALPHA,
            p_to_ou_id: PORT_BETA,
            p_within_group_id: null,
            p_keep_source: false,
            p_keep_in_parent: false,
          },
        },
      ]);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      // onSettled, as before.
      expect(invalidations).toEqual([
        ["campaign-worker-ou", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
      expect(alerts).toEqual([]);
    });

    it("from Unallocated → the same RPC with no source (a manual row is inserted)", async () => {
      const { container } = await mount();
      await click(checkbox(container, "Select Lena Lane"));
      await click(button(container, "Assign to unit…"));
      const dialog = openDialog();
      expect(collapse(dialog.querySelector("h2")?.textContent)).toBe("Assign to unit");
      await selectOption(dialog.querySelector('[role="combobox"]')!, "Port Alpha");
      await click(button(dialog, "Assign"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_move",
          args: {
            p_campaign_id: CAMPAIGN,
            p_worker_ids: [LENA],
            p_from_ou_id: null,
            p_to_ou_id: PORT_ALPHA,
            p_within_group_id: null,
            p_keep_source: false,
            p_keep_in_parent: false,
          },
        },
      ]);
    });

    it("a refused move is announced through window.alert with the structure sentence and still refetches", async () => {
      answerRpc("structure_placements_move", {
        data: null,
        error: { code: "P0001", message: "Worker 105 is already assigned to a unit in a different employer group within this campaign." },
      });
      const { container } = await mount();
      const block = unitBlock(container, "Port Alpha");
      await click(checkbox(block, "Select Eve Evans"));
      await click(button(block, "Reallocate to…"));
      const dialog = openDialog();
      await selectOption(dialog.querySelector('[role="combobox"]')!, "Port Beta");
      await click(button(dialog, "Reallocate"));
      await flush();

      expect(alerts).toEqual([
        "Not allowed by the unit structure rules: Worker 105 is already assigned to a unit in a different employer group within this campaign.",
      ]);
      expect(openDialog()).toBe(dialog);
      expect(invalidations).toEqual([
        ["campaign-worker-ou", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
    });
  });

  describe("assign dialog", () => {
    it("Assign worker → one structure_placements_assign, manual, p_on_conflict error (D49); the dialog closes", async () => {
      answerRpc("structure_placements_assign", { data: { inserted: 1, moved: 0, skipped: 0, displaced: 0 }, error: null });
      const { container } = await mount();
      await click(button(unitBlock(container, "Port Alpha"), "Assign worker"));
      const dialog = openDialog();
      expect(collapse(dialog.querySelector("h2")?.textContent)).toBe("Assign to Port Alpha");
      await click(checkbox(dialog, "Select Lena Lane"));
      await click(button(dialog, "Assign selected (1)"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_assign",
          args: {
            p_campaign_id: CAMPAIGN,
            p_ou_id: PORT_ALPHA,
            p_worker_ids: [LENA],
            p_source: "manual",
            p_is_primary: false,
            p_on_conflict: "error",
          },
        },
      ]);
      // The feedback line is a prop of the picker inside the dialog, so on
      // success it closes with it (as before); the error cases below pin it.
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(invalidations).toEqual([
        ["campaign-worker-ou", "1"],
        ["campaign-ou-coverage", "1"],
      ]);
    });

    it("a same-group duplicate (23505) refuses the batch and names the worker and group from the RPC detail (D54)", async () => {
      answerRpc("structure_placements_assign", { data: null, error: DUPLICATE_IN_GROUP });
      const { container } = await mount();
      await click(button(unitBlock(container, "Port Alpha"), "Assign worker"));
      const dialog = openDialog();
      await click(checkbox(dialog, "Select Lena Lane"));
      await click(button(dialog, "Assign selected (1)"));
      await flush();

      expect(rpcInvocations()).toHaveLength(1);
      expect(openDialog()).toBe(dialog);
      expect(collapse(dialog.textContent)).toContain(
        "A worker is already in another unit of that group — Worker 112 already has a placement in group 3 of campaign 1; move it instead of adding a second one."
      );
      expect(invalidations).toEqual([]);
    });

    it("the legacy Employer-exclusivity refusal (P0001 mentioning a group) keeps the dialog's own sentence", async () => {
      answerRpc("structure_placements_assign", {
        data: null,
        error: { code: "P0001", message: "Worker 112 is already assigned to a unit in a different employer group within this campaign." },
      });
      const { container } = await mount();
      await click(button(unitBlock(container, "Port Alpha"), "Assign worker"));
      const dialog = openDialog();
      await click(checkbox(dialog, "Select Lena Lane"));
      await click(button(dialog, "Assign selected (1)"));
      await flush();
      expect(collapse(dialog.textContent)).toContain(
        "Some of these workers already belong to a different group of the same type in this campaign, so they can't also be assigned here."
      );
    });

    it("a forbidden assign shows the permission sentence in the dialog", async () => {
      answerRpc("structure_placements_assign", { data: null, error: FORBIDDEN });
      const { container } = await mount();
      await click(button(unitBlock(container, "Port Alpha"), "Assign worker"));
      const dialog = openDialog();
      await click(checkbox(dialog, "Select Lena Lane"));
      await click(button(dialog, "Assign selected (1)"));
      await flush();
      expect(collapse(dialog.textContent)).toContain("You don't have permission to change this campaign's units.");
    });
  });

  it("Accept a suggested unit → one bulk save create (source wtp_seeded), then the candidate row update", async () => {
    answerRpc("structure_units_bulk_save", {
      data: { deleted_ou_ids: [], updated_ou_ids: [], created: [{ client_ref: null, ou_id: 77, group_id: 3 }], placements_removed: 0 },
      error: null,
    });
    const { container } = await mount();
    await click(titled(container, "Accept"));
    await flush();

    expect(rpcInvocations()).toEqual([
      {
        name: "structure_units_bulk_save",
        args: {
          p_campaign_id: CAMPAIGN,
          p_delete_ou_ids: [],
          p_updates: [],
          p_creates: [
            {
              name: "Night crew",
              ou_type: "shift",
              total_workers_estimated: 5,
              commonality_logic: "Same roster",
              source: "wtp_seeded",
            },
          ],
        },
      },
    ]);
    expect(writeInvocations()).toEqual([
      { table: "campaign_ou_candidates", op: "update", payload: { status: "accepted", accepted_ou_id: 77 } },
    ]);
    expect(invalidations).toEqual([
      ["campaign-ous", "1"],
      ["campaign-ou-candidates", "1"],
      ["campaign-ou-coverage", "1"],
    ]);
  });

  it("the harness refuses a direct write on a structure table (a regressed writer fails its test)", () => {
    installBackend(buildSectionFixture());
    try {
      expect(() => fakeFrom("campaign_worker_ou").delete()).toThrow(DirectStructureWriteError);
      expect(() => fakeFrom("campaign_organising_units").update({ name: "x" })).toThrow(
        "Direct update on campaign_organising_units under the harness: structure writes go through structureApi (wp2.2.md §3.9)"
      );
      expect(() => fakeFrom("campaign_ou_candidates").update({ status: "rejected" })).not.toThrow();
      expect(writeInvocations()).toEqual([{ table: "campaign_ou_candidates", op: "update", payload: { status: "rejected" } }]);
    } finally {
      resetBackend();
    }
  });

  it("the section reads the two structure tables and never writes them directly (harness write log)", async () => {
    const { container } = await mount();
    await click(button(container, "Add unit"));
    await typeInto(dialogInputs(openDialog())[0], "X");
    await click(button(openDialog(), "Save"));
    await flush();
    expect(writeInvocations()).toEqual([]);
    expect(rpcInvocations().map((c) => c.name)).toEqual(["structure_units_bulk_save"]);
  });
});
