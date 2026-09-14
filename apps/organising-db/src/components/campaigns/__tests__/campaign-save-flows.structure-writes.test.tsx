// @vitest-environment jsdom
/**
 * WP2.2 Stage 5 review round 1 — the wizard's step 5 / step 6 and the
 * settings page's "Campaign units" / "Allocate workers" saves, mounted for
 * real under the wall-chart harness (docs/organiser-ux-review/wp/wp2.2.md
 * §11.13; D53, D56).
 *
 * Pinned: the exact structure RPC each save issues (from the drafts the
 * screen hydrated out of the fixture), the `ouIds` scope of the placement
 * read (`campaign_worker_ou … .in("ou_id", …)`, through the harness query
 * log), the step transition after success (`router.replace(…&step=6|7)`),
 * the settings toasts including the skipped-count form, and — BLOCKING 1 —
 * that a refused or invalid save is SAID: the wizard's new error line under
 * steps 5 and 6, the settings toast, and the blank-name sentence that names
 * the unit instead of the RPC's `p_updates[n]` index.
 */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchApiMock, navigationMock, resetSpies, sonnerMock, spies, supabaseClientMock } from "../wall-chart/__tests__/harness/mocks";
import { answerRpc, queryInvocations, rpcInvocations, writeInvocations } from "../wall-chart/__tests__/harness/backend";
import type { WallChartFixture } from "../wall-chart/__tests__/harness/fixture";
import { button } from "../wall-chart/__tests__/harness/locate";
import { click, mountWallChart, type MountedWallChart } from "../wall-chart/__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("sonner", () => sonnerMock());
// Both screens gate on `useAuth().canWrite` (the role, not the campaign); the
// shared mock has no such field, so a `user` who can write is spelled out here.
vi.mock("@/lib/supabase/auth-context", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "organiser@example.test" },
    profile: { user_id: "test-user", role: "user" },
    role: "user",
    loading: false,
    profileLoading: false,
    canWrite: true,
    isAdmin: false,
    isUser: true,
    isLeadOrganiser: false,
    signOut: async () => {},
  }),
}));

// Imported last: they pull in the mocked edges above.
import { CampaignSettings } from "../campaign-settings";
import { CampaignWizard } from "../campaign-wizard";

const CAMPAIGN = 1;
const FORBIDDEN = { code: "42501", message: "no write permission on campaign 1" };
const PERMISSION_SENTENCE = "You don't have permission to change this campaign's units.";

const UNITS = [
  { ou_id: 10, campaign_id: 1, name: "Acme Group", ou_type: "employer", total_workers_estimated: 8, unit_basis: { employer_id: 7 }, display_order: 1, is_group_container: true, parent_ou_id: null, ou_group_id: null, user_rating: null },
  { ou_id: 11, campaign_id: 1, name: "Acme North", ou_type: "employer", total_workers_estimated: 4, unit_basis: { custom: true }, display_order: 2, is_group_container: false, parent_ou_id: 10, ou_group_id: 10, user_rating: null },
  { ou_id: 20, campaign_id: 1, name: "Port Alpha", ou_type: "worksite", total_workers_estimated: 6, unit_basis: { worksite_id: 5 }, display_order: 3, is_group_container: false, parent_ou_id: null, ou_group_id: null, user_rating: null },
];

/** Placements as the scope query and the save's read both see them (the same fake table). */
function placements() {
  return [
    { ou_id: 10, worker_id: 101 },
    { ou_id: 11, worker_id: 102 },
    { ou_id: 20, worker_id: 105 },
    // Worker 111 is NOT a member: the grid never lists them, so the save must unassign this row.
    { ou_id: 20, worker_id: 111 },
  ];
}

const MEMBERS = [101, 102, 105].map((worker_id) => ({ worker_id }));

/** `workers` rows in the shape the allocation grid selects (joins null). */
const GRID_WORKERS = [
  { worker_id: 101, first_name: "Ada", last_name: "Adams", employer_id: null, worksite_id: null, canonical_occupation_id: null, employers: null, worksites: null, occupations: null, is_active: true },
  { worker_id: 102, first_name: "Ben", last_name: "Baker", employer_id: null, worksite_id: null, canonical_occupation_id: null, employers: null, worksites: null, occupations: null, is_active: true },
  { worker_id: 105, first_name: "Eve", last_name: "Evans", employer_id: null, worksite_id: null, canonical_occupation_id: null, employers: null, worksites: null, occupations: null, is_active: true },
];

function buildFixture(overrides: Partial<Record<string, unknown[]>> = {}): WallChartFixture {
  return {
    campaignId: String(CAMPAIGN),
    apiRoutes: {},
    tables: {
      campaigns: [
        {
          campaign_id: CAMPAIGN,
          name: "Fixture campaign",
          description: "",
          campaign_type: "organising",
          status: "planning",
          start_date: null,
          end_date: null,
          organiser_id: null,
          notes: "",
          campaign_scope: null,
          total_worker_estimate: null,
          sector_wide: false,
          enterprise_agreement_subtype: null,
          replaced_agreement_id: null,
          plan_timeframe_weeks: null,
          bargaining_triage: null,
        },
      ],
      campaign_employers: [],
      campaign_worksites: [],
      campaign_worker_membership: MEMBERS,
      campaign_agreements: [],
      campaign_organising_units: UNITS,
      campaign_worker_ou: placements(),
      campaign_ambitions: [],
      campaign_situation_analyses: [],
      user_profiles: [],
      workers: GRID_WORKERS,
      employers: [],
      worksites: [],
      occupation_groups: [],
      occupations: [],
      worker_tags: [],
      ...overrides,
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function alertLine(root: ParentNode): string | null {
  const el = root.querySelector('p[role="alert"]');
  return el ? collapse(el.textContent) : null;
}

/** The units-step row (step-campaign-units.tsx UnitRow) whose name input holds `name`. */
function unitRowInput(root: ParentNode, name: string): HTMLInputElement {
  const input = [...root.querySelectorAll("input")].find((i) => (i as HTMLInputElement).value === name);
  if (!input) throw new Error(`No unit row input with value "${name}"`);
  return input as HTMLInputElement;
}

/** The updates the fixture units hydrate into (every unit is re-sent, as the legacy update did). */
const FIXTURE_UPDATES = UNITS.map((u) => ({
  ou_id: u.ou_id,
  name: u.name,
  total_workers_estimated: u.total_workers_estimated,
  unit_basis: u.unit_basis,
}));

/** The wizard reads `cid` and `step` from the (mocked) search params; the harness passes props it ignores. */
function WizardShell() {
  return <CampaignWizard />;
}
function SettingsAt1() {
  return <CampaignSettings campaignId={CAMPAIGN} />;
}

describe("wizard and settings save flows through the structure API (wp2.2.md §11.13)", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
  });

  async function mountWizard(step: number, fixture = buildFixture()): Promise<MountedWallChart> {
    mounted = await mountWallChart({ Component: WizardShell, fixture, search: `cid=${CAMPAIGN}&step=${step}` });
    return mounted;
  }

  async function mountSettings(fixture = buildFixture()): Promise<MountedWallChart> {
    mounted = await mountWallChart({ Component: SettingsAt1, fixture });
    return mounted;
  }

  describe("wizard step 5 — save units", () => {
    it("Continue → one structure_units_bulk_save over the hydrated drafts, then step 6", async () => {
      const { container } = await mountWizard(5);
      await click(button(container, "Continue"));
      await flush();

      expect(rpcInvocations()).toEqual([
        {
          name: "structure_units_bulk_save",
          args: { p_campaign_id: CAMPAIGN, p_delete_ou_ids: [], p_updates: FIXTURE_UPDATES, p_creates: [] },
        },
      ]);
      expect(alertLine(container)).toBeNull();
      expect(spies.replace).toHaveBeenCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=6`, { scroll: false });
      expect(writeInvocations()).toEqual([]);
    });

    it("a refused save (42501) is said under the step and the wizard stays on step 5 (D53)", async () => {
      answerRpc("structure_units_bulk_save", { data: null, error: FORBIDDEN });
      const { container } = await mountWizard(5);
      await click(button(container, "Continue"));
      await flush();

      expect(rpcInvocations()).toHaveLength(1);
      expect(alertLine(container)).toBe(PERMISSION_SENTENCE);
      expect(spies.replace).not.toHaveBeenCalled();
    });

    it("a refusal does not follow the user: Back clears it, and a later successful save clears it (D59)", async () => {
      answerRpc("structure_units_bulk_save", { data: null, error: FORBIDDEN });
      const { container } = await mountWizard(5);
      await click(button(container, "Continue"));
      await flush();
      expect(alertLine(container)).toBe(PERMISSION_SENTENCE);

      // Back to step 4 (the wizard resets the mutation), then forward through step 4's own save.
      await click(button(container, "Back"));
      await flush();
      expect(spies.replace).toHaveBeenLastCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=4`, { scroll: false });
      expect(alertLine(container)).toBeNull();
      await click(button(container, "Continue"));
      await flush();
      expect(spies.replace).toHaveBeenLastCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=5`, { scroll: false });
      expect(alertLine(container)).toBeNull();

      // A second refusal, then a successful save: the line goes with the success.
      answerRpc("structure_units_bulk_save", { data: null, error: FORBIDDEN });
      await click(button(container, "Continue"));
      await flush();
      expect(alertLine(container)).toBe(PERMISSION_SENTENCE);
      await click(button(container, "Continue"));
      await flush();
      expect(alertLine(container)).toBeNull();
      expect(spies.replace).toHaveBeenLastCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=6`, { scroll: false });
      expect(rpcInvocations().map((c) => c.name)).toEqual(["structure_units_bulk_save", "structure_units_bulk_save", "structure_units_bulk_save"]);
    });

    it("a fractional estimate is refused before any RPC, naming the unit (D58)", async () => {
      const { container } = await mountWizard(5);
      const estimate = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).value === "6");
      if (!estimate) throw new Error("No estimate input holding 6 (Port Alpha)");
      await typeInto(estimate as HTMLInputElement, "2.5");
      await click(button(container, "Continue"));
      await flush();
      expect(rpcInvocations()).toEqual([]);
      expect(alertLine(container)).toBe('Unit "Port Alpha" has a worker estimate that is not a whole number.');
    });

    it("a blank unit name is refused before any RPC, naming the unit (D53)", async () => {
      const { container } = await mountWizard(5);
      await typeInto(unitRowInput(container, "Port Alpha"), "   ");
      await click(button(container, "Continue"));
      await flush();

      expect(rpcInvocations()).toEqual([]);
      expect(alertLine(container)).toBe("Unit 3 (worksite) has no name.");
      expect(spies.replace).not.toHaveBeenCalled();
    });
  });

  describe("wizard step 6 — save worker allocation", () => {
    it("Continue → membership rewrite, the placement read scoped to the units the step knows, one unassign for the non-member row, then step 7", async () => {
      answerRpc("structure_placements_unassign", { data: { removed: 1 }, error: null });
      const { container } = await mountWizard(6);
      await click(button(container, "Next step"));
      await flush();

      const membership = writeInvocations().filter((w) => w.table === "campaign_worker_membership");
      expect(membership.map((w) => w.op)).toEqual(["delete", "insert"]);
      expect(membership[1].payload).toEqual(MEMBERS.map((m) => ({ campaign_id: CAMPAIGN, worker_id: m.worker_id })));

      const read = queryInvocations().filter((q) => q.table === "campaign_worker_ou" && q.ops.some((o) => o.method === "in"));
      expect(read.map((q) => q.ops)).toEqual([
        [
          { method: "select", args: ["ou_id, worker_id"] },
          { method: "in", args: ["ou_id", [10, 11, 20]] },
          // Stage 6: the read is paged (§8.2 "Unpaged placement read").
          { method: "order", args: ["ou_id", { ascending: true }] },
          { method: "order", args: ["worker_id", { ascending: true }] },
          { method: "range", args: [0, 999] },
        ],
      ]);
      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_unassign",
          args: { p_campaign_id: CAMPAIGN, p_worker_ids: [111], p_ou_id: 20, p_within_group_id: null },
        },
      ]);
      expect(alertLine(container)).toBeNull();
      expect(spies.replace).toHaveBeenCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=7`, { scroll: false });
    });

    it("a refused unassign is said under the step and the wizard stays on step 6 (D53); Back clears it (D59)", async () => {
      answerRpc("structure_placements_unassign", { data: null, error: FORBIDDEN });
      const { container } = await mountWizard(6);
      await click(button(container, "Next step"));
      await flush();
      expect(alertLine(container)).toBe(PERMISSION_SENTENCE);
      expect(spies.replace).not.toHaveBeenCalled();

      await click(button(container, "Back"));
      await flush();
      expect(spies.replace).toHaveBeenLastCalledWith(`/campaigns/new?cid=${CAMPAIGN}&step=5`, { scroll: false });
      expect(alertLine(container)).toBeNull();
    });
  });

  describe("settings — Campaign units", () => {
    async function openUnits(container: HTMLElement): Promise<void> {
      const trigger = [...container.querySelectorAll("button")].find((b) => collapse(b.textContent).startsWith("Campaign units"));
      if (!trigger) throw new Error("No Campaign units accordion trigger");
      await click(trigger);
      await flush();
    }

    it("Save campaign units → one structure_units_bulk_save and the success toast", async () => {
      const { container } = await mountSettings();
      await openUnits(container);
      await click(button(container, "Save campaign units"));
      await flush();
      expect(rpcInvocations()).toEqual([
        {
          name: "structure_units_bulk_save",
          args: { p_campaign_id: CAMPAIGN, p_delete_ou_ids: [], p_updates: FIXTURE_UPDATES, p_creates: [] },
        },
      ]);
      expect(spies.toastSuccess).toHaveBeenCalledWith("Campaign units saved.");
      expect(spies.toastError).not.toHaveBeenCalled();
    });

    it("a refused save toasts the permission sentence", async () => {
      answerRpc("structure_units_bulk_save", { data: null, error: FORBIDDEN });
      const { container } = await mountSettings();
      await openUnits(container);
      await click(button(container, "Save campaign units"));
      await flush();
      expect(spies.toastError).toHaveBeenCalledWith(PERMISSION_SENTENCE);
      expect(spies.toastSuccess).not.toHaveBeenCalled();
    });

    it("a blank unit name toasts the unit's own sentence and issues no RPC (D53)", async () => {
      const { container } = await mountSettings();
      await openUnits(container);
      await typeInto(unitRowInput(container, "Acme North"), "");
      await click(button(container, "Save campaign units"));
      await flush();
      expect(rpcInvocations()).toEqual([]);
      expect(spies.toastError).toHaveBeenCalledWith("Unit 2 (employer) has no name.");
    });
  });

  describe("settings — Allocate workers", () => {
    async function openAllocate(container: HTMLElement): Promise<void> {
      const trigger = [...container.querySelectorAll("button")].find((b) => collapse(b.textContent).startsWith("Allocate workers"));
      if (!trigger) throw new Error("No Allocate workers accordion trigger");
      await click(trigger);
      await flush();
    }

    it("the grid lists no group container (D56), unlike the legacy settings grid", async () => {
      // The grid's worker query runs only with campaign scope (a worksite here).
      const { container } = await mountSettings(
        buildFixture({ campaign_worksites: [{ worksite_id: 5, sector_wide: false }], worksites: [{ worksite_id: 5, worksite_name: "Port Alpha" }] })
      );
      await openAllocate(container);
      const adaRow = [...container.querySelectorAll("tr")].find((tr) => collapse(tr.textContent).includes("Adams"));
      if (!adaRow) throw new Error("No grid row for Ada Adams");
      // Ada's only placement is on the container (ou 10): with the container
      // filtered out she has no chip; the member unit and the worksite remain pickable.
      expect(collapse(adaRow.textContent)).not.toContain("Acme Group");
      expect(collapse(container.textContent)).toContain("Acme North");
    });

    it("Save worker allocation → unassign for the row the grid no longer wants; the plain success toast", async () => {
      answerRpc("structure_placements_unassign", { data: { removed: 1 }, error: null });
      const { container } = await mountSettings();
      await openAllocate(container);
      await click(button(container, "Save worker allocation"));
      await flush();
      expect(rpcInvocations()).toEqual([
        {
          name: "structure_placements_unassign",
          args: { p_campaign_id: CAMPAIGN, p_worker_ids: [111], p_ou_id: 20, p_within_group_id: null },
        },
      ]);
      expect(spies.toastSuccess).toHaveBeenCalledWith("Worker allocation saved.");
    });

    it("a row the grid wants that the database lost since load is re-assigned, and a skipped row is said in the toast (D43)", async () => {
      // The screen hydrated from the full placement list; before the save,
      // the database has lost Ben's row (someone else's change).
      const rows = placements();
      const fixture = buildFixture({ campaign_worker_ou: rows });
      const { container } = await mountSettings(fixture);
      await openAllocate(container);
      rows.splice(rows.findIndex((r) => r.worker_id === 102), 1);
      answerRpc("structure_placements_unassign", { data: { removed: 1 }, error: null });
      answerRpc("structure_placements_assign", { data: { inserted: 0, moved: 0, skipped: 1, displaced: 0 }, error: null });
      await click(button(container, "Save worker allocation"));
      await flush();

      expect(rpcInvocations().map((c) => [c.name, c.args])).toEqual([
        ["structure_placements_unassign", { p_campaign_id: CAMPAIGN, p_worker_ids: [111], p_ou_id: 20, p_within_group_id: null }],
        [
          "structure_placements_assign",
          { p_campaign_id: CAMPAIGN, p_ou_id: 11, p_worker_ids: [102], p_source: "manual", p_is_primary: false, p_on_conflict: "skip" },
        ],
      ]);
      expect(spies.toastSuccess).toHaveBeenCalledWith(
        "Worker allocation saved. 1 placement skipped: already in another unit of the same group."
      );
    });

    it("a refused save toasts the permission sentence", async () => {
      answerRpc("structure_placements_unassign", { data: null, error: FORBIDDEN });
      const { container } = await mountSettings();
      await openAllocate(container);
      await click(button(container, "Save worker allocation"));
      await flush();
      expect(spies.toastError).toHaveBeenCalledWith(PERMISSION_SENTENCE);
      expect(spies.toastSuccess).not.toHaveBeenCalled();
    });
  });
});
