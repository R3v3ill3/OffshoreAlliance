/**
 * WP2.2 Stage 5 — the wizard / settings "save units" and "save worker
 * allocation" sequences through the structure API (wp2.2.md §3.11 rows
 * 10–11; §8.3 D41–D45).
 *
 * The planners are pure: they are pinned on composition (which units are
 * deleted, updated, created, in what order, with which `client_ref` links
 * and `display_order`s; which placements are unassigned and assigned). The
 * `save*` helpers are pinned on the exact `rpc(name, { p_… })` calls they
 * issue against a recording fake client — the same evidence Stage 4 gave
 * for the wall chart (§11.8).
 */

import { describe, expect, it } from "vitest";
import { POSTGREST_PAGE_SIZE } from "@/lib/supabase/fetch-all-rows";

import { StructureApiError } from "../structure-api";
import {
  applyUnitsSaveResult,
  planPlacementsSave,
  planUnitsBulkSave,
  savePlacements,
  saveUnitDrafts,
  unitIdentityKey,
  validateUnitsSavePlan,
  UnitDraftValidationError,
  type ExistingUnitRow,
  type UnitDraftInput,
} from "../structure-save";
import { createFakeStructureClient } from "./fake-structure-client";

const CAMPAIGN = 7;

function existing(row: Partial<ExistingUnitRow> & { ou_id: number }): ExistingUnitRow {
  return {
    ou_type: "custom",
    unit_basis: null,
    parent_ou_id: null,
    is_group_container: false,
    ...row,
  };
}

function draft(d: Partial<UnitDraftInput> & { draft_id: string }): UnitDraftInput {
  return {
    ou_id: null,
    ou_type: "custom",
    name: d.draft_id,
    total_workers_estimated: null,
    unit_basis: null,
    ...d,
  };
}

describe("unitIdentityKey (D42 reuse rule)", () => {
  it("keys a scope unit on its type and whole basis, independent of key order", () => {
    expect(unitIdentityKey("worksite", { worksite_id: 5 })).toBe('worksite|{"worksite_id":5}');
    expect(unitIdentityKey("employer", { employer_id: 2, note: "x" })).toBe(unitIdentityKey("employer", { note: "x", employer_id: 2 }));
    expect(unitIdentityKey("job_type", { canonical_occupation_id: 9 })).toBe('job_type|{"canonical_occupation_id":9}');
    expect(unitIdentityKey("job_type", { occupation_group_id: 3 })).toBe('job_type|{"occupation_group_id":3}');
  });

  it("gives no key to custom, split-derived or empty bases", () => {
    expect(unitIdentityKey("custom", { custom: true })).toBeNull();
    expect(unitIdentityKey("custom", { parent_ou_id: 4, dimension: "custom" })).toBeNull();
    expect(unitIdentityKey("shift", null)).toBeNull();
    expect(unitIdentityKey("shift", undefined)).toBeNull();
    expect(unitIdentityKey("worksite", { worksite_id: null })).toBeNull();
  });
});

describe("planUnitsBulkSave", () => {
  it("deletes what left the list, updates what stayed (name, estimate, basis only), creates the rest", () => {
    const plan = planUnitsBulkSave(
      [existing({ ou_id: 1, ou_type: "shift" }), existing({ ou_id: 2, ou_type: "shift" }), existing({ ou_id: 3, ou_type: "shift" })],
      [
        draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days", total_workers_estimated: 4, unit_basis: { custom: true } }),
        draft({ draft_id: "srv_3", ou_id: 3, ou_type: "shift", name: "Nights", total_workers_estimated: null }),
        draft({ draft_id: "d_new", ou_type: "custom", name: "Catering", total_workers_estimated: 2, unit_basis: { custom: true } }),
      ]
    );
    expect(plan.deleteOuIds).toEqual([2]);
    expect(plan.updates).toEqual([
      { ou_id: 1, name: "Days", total_workers_estimated: 4, unit_basis: { custom: true } },
      { ou_id: 3, name: "Nights", total_workers_estimated: null, unit_basis: null },
    ]);
    expect(plan.creates).toEqual([
      {
        client_ref: "d_new",
        name: "Catering",
        ou_type: "custom",
        total_workers_estimated: 2,
        unit_basis: { custom: true },
        display_order: 3,
        is_group_container: false,
      },
    ]);
    expect(plan.reusedOuIdByDraftId.size).toBe(0);
    expect(plan.droppedDraftIds).toEqual([]);
    // Never sent on an update: the type and the hierarchy columns (D44).
    for (const u of plan.updates) {
      expect(Object.keys(u).sort()).toEqual(["name", "ou_id", "total_workers_estimated", "unit_basis"]);
    }
  });

  it("numbers creates after the current units, parents first then children, as the legacy insert did", () => {
    const plan = planUnitsBulkSave(
      [existing({ ou_id: 1 }), existing({ ou_id: 2 })],
      [
        draft({ draft_id: "srv_1", ou_id: 1, name: "Keep" }),
        draft({ draft_id: "member", ou_type: "employer", name: "Acme North", unit_basis: { custom: true }, parent_draft_id: "container", is_group_container: false }),
        draft({ draft_id: "container", ou_type: "employer", name: "Acme", unit_basis: { custom: true }, is_group_container: true }),
        draft({ draft_id: "solo", ou_type: "custom", name: "Solo", unit_basis: { custom: true } }),
      ]
    );
    expect(plan.creates.map((c) => [c.client_ref, c.display_order])).toEqual([
      ["container", 2],
      ["solo", 3],
      ["member", 4],
    ]);
    const member = plan.creates.find((c) => c.client_ref === "member")!;
    // A member of a new container names it by client_ref, on both columns.
    expect(member.parent_ou_id).toBe("container");
    expect(member.ou_group_id).toBe("container");
    const container = plan.creates.find((c) => c.client_ref === "container")!;
    expect(container.is_group_container).toBe(true);
    expect(container.parent_ou_id).toBeUndefined();
    expect(container.ou_group_id).toBeUndefined();
  });

  it("sets ou_group_id only when the parent is a group container (D45)", () => {
    const plan = planUnitsBulkSave(
      [existing({ ou_id: 10, ou_type: "worksite", is_group_container: false }), existing({ ou_id: 20, ou_type: "employer", is_group_container: true })],
      [
        draft({ draft_id: "srv_10", ou_id: 10, ou_type: "worksite", name: "Port" }),
        draft({ draft_id: "srv_20", ou_id: 20, ou_type: "employer", name: "Acme", is_group_container: true }),
        // addSubUnit on a saved plain unit: parent_draft_id + parent_ou_id.
        draft({ draft_id: "sub", name: "Port – sub-unit", unit_basis: { parent_ou_id: 10, dimension: "custom" }, parent_draft_id: "srv_10", parent_ou_id: 10 }),
        // addToGroup on a saved container.
        draft({ draft_id: "newmember", ou_type: "employer", name: "Acme West", unit_basis: { custom: true }, parent_draft_id: "srv_20", parent_ou_id: 20, is_group_container: false }),
      ]
    );
    const sub = plan.creates.find((c) => c.client_ref === "sub")!;
    expect(sub.parent_ou_id).toBe(10);
    expect(sub.ou_group_id).toBeUndefined();
    const member = plan.creates.find((c) => c.client_ref === "newmember")!;
    expect(member.parent_ou_id).toBe(20);
    expect(member.ou_group_id).toBe(20);
  });

  it("resolves a child of a new child through its parent's client_ref instead of dropping it", () => {
    const plan = planUnitsBulkSave(
      [],
      [
        draft({ draft_id: "grandchild", name: "Deck crew", parent_draft_id: "member" }),
        draft({ draft_id: "member", ou_type: "employer", name: "Acme North", parent_draft_id: "container" }),
        draft({ draft_id: "container", ou_type: "employer", name: "Acme", is_group_container: true }),
      ]
    );
    expect(plan.creates.map((c) => c.client_ref)).toEqual(["container", "member", "grandchild"]);
    expect(plan.creates[2].parent_ou_id).toBe("member");
    expect(plan.creates[2].ou_group_id).toBeUndefined();
    expect(plan.droppedDraftIds).toEqual([]);
  });

  it("drops a child whose parent draft is gone and has no saved parent id (legacy safeChildRows)", () => {
    const plan = planUnitsBulkSave([], [draft({ draft_id: "orphan", name: "Orphan", parent_draft_id: "vanished" })]);
    expect(plan.creates).toEqual([]);
    expect(plan.droppedDraftIds).toEqual(["orphan"]);
  });

  it("falls back to parent_ou_id when the parent draft is gone but the parent was saved (legacy precedence)", () => {
    const plan = planUnitsBulkSave(
      [existing({ ou_id: 4 })],
      [draft({ draft_id: "srv_4", ou_id: 4, name: "Parent" }), draft({ draft_id: "child", name: "Child", parent_draft_id: "vanished", parent_ou_id: 4 })]
    );
    expect(plan.creates.map((c) => [c.client_ref, c.parent_ou_id])).toEqual([["child", 4]]);
    expect(plan.droppedDraftIds).toEqual([]);
  });

  it("D42: a scope unit toggled off and on again is updated in place, not deleted and re-created", () => {
    const plan = planUnitsBulkSave(
      [
        existing({ ou_id: 31, ou_type: "worksite", unit_basis: { worksite_id: 5 } }),
        existing({ ou_id: 32, ou_type: "worksite", unit_basis: { worksite_id: 6 } }),
        existing({ ou_id: 33, ou_type: "custom", unit_basis: { custom: true } }),
      ],
      [
        // The toggle re-added both worksites as new drafts, one renamed.
        draft({ draft_id: "w5", ou_type: "worksite", name: "Port Alpha (renamed)", total_workers_estimated: 12, unit_basis: { worksite_id: 5 } }),
        draft({ draft_id: "w6", ou_type: "worksite", name: "Port Beta", total_workers_estimated: 8, unit_basis: { worksite_id: 6 } }),
        // A custom unit removed and re-added has no identity: delete + create as before.
        draft({ draft_id: "c", ou_type: "custom", name: "Catering", unit_basis: { custom: true } }),
      ]
    );
    expect(plan.deleteOuIds).toEqual([33]);
    expect([...plan.reusedOuIdByDraftId.entries()]).toEqual([
      ["w5", 31],
      ["w6", 32],
    ]);
    expect(plan.updates).toEqual([
      { ou_id: 31, name: "Port Alpha (renamed)", total_workers_estimated: 12, unit_basis: { worksite_id: 5 } },
      { ou_id: 32, name: "Port Beta", total_workers_estimated: 8, unit_basis: { worksite_id: 6 } },
    ]);
    expect(plan.creates.map((c) => c.client_ref)).toEqual(["c"]);
    expect(plan.creates[0].display_order).toBe(3);
  });

  it("D42: reuse is limited to top-level, non-container units, one existing unit per draft", () => {
    const plan = planUnitsBulkSave(
      [
        existing({ ou_id: 41, ou_type: "employer", unit_basis: { employer_id: 9 }, is_group_container: true }),
        existing({ ou_id: 42, ou_type: "employer", unit_basis: { employer_id: 9 }, parent_ou_id: 41 }),
        existing({ ou_id: 43, ou_type: "employer", unit_basis: { employer_id: 9 } }),
      ],
      [
        draft({ draft_id: "e9a", ou_type: "employer", name: "Acme", unit_basis: { employer_id: 9 } }),
        draft({ draft_id: "e9b", ou_type: "employer", name: "Acme again", unit_basis: { employer_id: 9 } }),
      ]
    );
    // Only 43 is a top-level non-container; it goes to the first draft, the second is created.
    expect([...plan.reusedOuIdByDraftId.entries()]).toEqual([["e9a", 43]]);
    expect(plan.deleteOuIds).toEqual([41, 42]);
    expect(plan.creates.map((c) => c.client_ref)).toEqual(["e9b"]);
  });

  it("D55: with two legacy units of the same identity, the lowest ou_id is reused whatever order the rows arrive in", () => {
    const rows = [
      existing({ ou_id: 62, ou_type: "worksite", unit_basis: { worksite_id: 5 } }),
      existing({ ou_id: 61, ou_type: "worksite", unit_basis: { worksite_id: 5 } }),
    ];
    const drafts = [draft({ draft_id: "w5", ou_type: "worksite", name: "Port", unit_basis: { worksite_id: 5 } })];
    const forward = planUnitsBulkSave(rows, drafts);
    const reversed = planUnitsBulkSave([...rows].reverse(), drafts);
    for (const plan of [forward, reversed]) {
      expect([...plan.reusedOuIdByDraftId.entries()]).toEqual([["w5", 61]]);
      expect(plan.deleteOuIds).toEqual([62]);
    }
  });

  it("does not reuse a unit the list still holds by id", () => {
    const plan = planUnitsBulkSave(
      [existing({ ou_id: 51, ou_type: "worksite", unit_basis: { worksite_id: 1 } })],
      [
        draft({ draft_id: "srv_51", ou_id: 51, ou_type: "worksite", name: "Kept", unit_basis: { worksite_id: 1 } }),
        draft({ draft_id: "dup", ou_type: "worksite", name: "Duplicate", unit_basis: { worksite_id: 1 } }),
      ]
    );
    expect(plan.reusedOuIdByDraftId.size).toBe(0);
    expect(plan.deleteOuIds).toEqual([]);
    expect(plan.creates.map((c) => c.client_ref)).toEqual(["dup"]);
  });
});

describe("validateUnitsSavePlan (D53: the RPC's refusals, said before the call, naming the unit)", () => {
  it("names a blank-named unit by its position and type — an update (a legacy blank row) or a create", () => {
    const rows = [existing({ ou_id: 1, ou_type: "shift" }), existing({ ou_id: 2, ou_type: "worksite" })];
    const legacyBlank = [
      draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days" }),
      draft({ draft_id: "srv_2", ou_id: 2, ou_type: "worksite", name: "   " }),
    ];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave(rows, legacyBlank), legacyBlank)).toThrow(
      new UnitDraftValidationError("Unit 2 (worksite) has no name.")
    );
    const blankCreate = [draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days" }), draft({ draft_id: "n", ou_type: "job_type", name: "" })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave(rows, blankCreate), blankCreate)).toThrow("Unit 2 (job type) has no name.");
    const reusedBlank = [draft({ draft_id: "w", ou_type: "worksite", name: "", unit_basis: { worksite_id: 5 } })];
    const reusedRows = [existing({ ou_id: 9, ou_type: "worksite", unit_basis: { worksite_id: 5 } })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave(reusedRows, reusedBlank), reusedBlank)).toThrow("Unit 1 (worksite) has no name.");
  });

  it("mirrors the length and estimate rules with the unit's name", () => {
    const long = [draft({ draft_id: "n", name: "x".repeat(201) })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave([], long), long)).toThrow(
      `Unit "${"x".repeat(40)}…" has a name longer than 200 characters.`
    );
    const negative = [draft({ draft_id: "n", name: "Deck", total_workers_estimated: -1 })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave([], negative), negative)).toThrow('Unit "Deck" has a negative worker estimate.');
    const fine = [draft({ draft_id: "n", name: " Deck ", total_workers_estimated: 0 })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave([], fine), fine)).not.toThrow();
  });

  it("D58: a fractional or over-32-bit estimate is refused with the unit's name, on updates and creates alike", () => {
    const rows = [existing({ ou_id: 1, ou_type: "shift" })];
    const fractional = [draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days", total_workers_estimated: 2.5 })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave(rows, fractional), fractional)).toThrow(
      'Unit "Days" has a worker estimate that is not a whole number.'
    );
    const huge = [draft({ draft_id: "n", name: "Deck", total_workers_estimated: 2_147_483_648 })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave([], huge), huge)).toThrow(
      'Unit "Deck" has a worker estimate above 2,147,483,647.'
    );
    const max = [draft({ draft_id: "n", name: "Deck", total_workers_estimated: 2_147_483_647 })];
    expect(() => validateUnitsSavePlan(planUnitsBulkSave([], max), max)).not.toThrow();
  });

  it("saveUnitDrafts throws the sentence and issues no RPC", async () => {
    const fake = createFakeStructureClient({
      tables: { campaign_organising_units: [{ ou_id: 4, ou_type: "shift", unit_basis: null, parent_ou_id: null, is_group_container: false }] },
    });
    await expect(
      saveUnitDrafts(fake.client, CAMPAIGN, [draft({ draft_id: "srv_4", ou_id: 4, ou_type: "shift", name: "" })])
    ).rejects.toMatchObject({ name: "UnitDraftValidationError", message: "Unit 1 (shift) has no name." });
    expect(fake.rpcCalls()).toEqual([]);
  });
});

describe("applyUnitsSaveResult", () => {
  it("resolves ids from the reuse map and the created list, parent ids and container membership for state", () => {
    const rows = [existing({ ou_id: 31, ou_type: "worksite", unit_basis: { worksite_id: 5 } }), existing({ ou_id: 20, ou_type: "employer", is_group_container: true })];
    const drafts = [
      draft({ draft_id: "w5", ou_type: "worksite", name: "Port", unit_basis: { worksite_id: 5 } }),
      draft({ draft_id: "container", ou_type: "employer", name: "Acme", is_group_container: true }),
      draft({ draft_id: "member", ou_type: "employer", name: "Acme North", parent_draft_id: "container" }),
      draft({ draft_id: "sub", name: "Sub", parent_draft_id: "srv_20", parent_ou_id: 20 }),
      draft({ draft_id: "plainchild", name: "Plain child", parent_draft_id: "w5" }),
    ];
    const plan = planUnitsBulkSave(rows, drafts);
    const out = applyUnitsSaveResult(drafts, rows, plan, {
      deleted_ou_ids: [],
      updated_ou_ids: [31],
      created: [
        { client_ref: "container", ou_id: 100, group_id: 9 },
        { client_ref: "member", ou_id: 101, group_id: 9 },
        { client_ref: "sub", ou_id: 102, group_id: 9 },
        { client_ref: "plainchild", ou_id: 103, group_id: 5 },
      ],
      placements_removed: 0,
    });
    expect(out.map((d) => [d.draft_id, d.ou_id, d.parent_ou_id ?? null, d.ou_group_id ?? null])).toEqual([
      ["w5", 31, null, null],
      ["container", 100, null, null],
      ["member", 101, 100, 100],
      ["sub", 102, 20, 20],
      ["plainchild", 103, 31, null],
    ]);
  });
});

describe("saveUnitDrafts — the exact structure_units_bulk_save call", () => {
  it("reads the current units, then issues one bulk save with deletes, updates and creates", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaign_organising_units: [
          { ou_id: 1, ou_type: "shift", unit_basis: null, parent_ou_id: null, is_group_container: false },
          { ou_id: 2, ou_type: "shift", unit_basis: null, parent_ou_id: null, is_group_container: false },
        ],
      },
    });
    fake.answerRpc("structure_units_bulk_save", {
      data: { deleted_ou_ids: [2], updated_ou_ids: [1], created: [{ client_ref: "d1", ou_id: 55, group_id: 3 }], placements_removed: 1 },
    });
    const outcome = await saveUnitDrafts(fake.client, CAMPAIGN, [
      draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days", total_workers_estimated: 3 }),
      draft({ draft_id: "d1", ou_type: "custom", name: "Catering", unit_basis: { custom: true } }),
    ]);

    expect(fake.trace()).toEqual(["from:campaign_organising_units.select.eq.order", "rpc:structure_units_bulk_save"]);
    expect(fake.fromCalls()[0].ops).toEqual([
      { method: "select", args: ["ou_id, ou_type, unit_basis, parent_ou_id, is_group_container"] },
      { method: "eq", args: ["campaign_id", CAMPAIGN] },
      { method: "order", args: ["ou_id", { ascending: true }] },
    ]);
    expect(fake.rpcCalls()[0].args).toEqual({
      p_campaign_id: CAMPAIGN,
      p_delete_ou_ids: [2],
      p_updates: [{ ou_id: 1, name: "Days", total_workers_estimated: 3, unit_basis: null }],
      p_creates: [
        {
          client_ref: "d1",
          name: "Catering",
          ou_type: "custom",
          total_workers_estimated: null,
          unit_basis: { custom: true },
          display_order: 2,
          is_group_container: false,
        },
      ],
    });
    expect(outcome.drafts.map((d) => [d.draft_id, d.ou_id])).toEqual([
      ["srv_1", 1],
      ["d1", 55],
    ]);
    expect(outcome.result.placements_removed).toBe(1);
  });

  it("D41: still issues the bulk save when there is nothing to change, so a refusal is visible", async () => {
    const fake = createFakeStructureClient({
      tables: { campaign_organising_units: [{ ou_id: 1, ou_type: "shift", unit_basis: null, parent_ou_id: null, is_group_container: false }] },
    });
    fake.answerRpc("structure_units_bulk_save", {
      error: { code: "42501", message: "no write permission on campaign 7" },
    });
    await expect(
      saveUnitDrafts(fake.client, CAMPAIGN, [draft({ draft_id: "srv_1", ou_id: 1, ou_type: "shift", name: "Days" })])
    ).rejects.toMatchObject({ name: "StructureApiError", kind: "forbidden", code: "42501" });
    expect(fake.rpcCalls()[0].args).toMatchObject({ p_delete_ou_ids: [], p_creates: [] });
  });

  it("A4 (Stage 6): throws on a failed read of the current units and issues no RPC — a save is never planned from a read that did not happen", async () => {
    const fake = createFakeStructureClient({
      errors: { campaign_organising_units: { code: "PGRST000", message: "read failed" } },
    });
    const thrown = await saveUnitDrafts(fake.client, CAMPAIGN, [draft({ draft_id: "srv_9", ou_id: 9, ou_type: "shift", name: "Days" })]).catch((e: unknown) => e);
    // A real Error (fix round 1, A4): the settings toast shows `err.message` only for an Error instance.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("read failed");
    expect(fake.trace()).toEqual(["from:campaign_organising_units.select.eq.order"]);
    expect(fake.rpcCalls()).toEqual([]);
  });
});

describe("planPlacementsSave", () => {
  it("unassigns rows that left the grid and assigns rows that joined it, grouped by unit in ascending order", () => {
    const plan = planPlacementsSave(
      [
        { ou_id: 20, worker_id: 105 },
        { ou_id: 20, worker_id: 106 },
        { ou_id: 11, worker_id: 102 },
        { ou_id: 12, worker_id: 103 },
      ],
      [
        { ou_id: 20, worker_id: 106 },
        { ou_id: 12, worker_id: 105 },
        { ou_id: 11, worker_id: 102 },
        { ou_id: 11, worker_id: 109 },
        { ou_id: 12, worker_id: 103 },
      ]
    );
    expect(plan.unassign).toEqual([{ ouId: 20, workerIds: [105] }]);
    expect(plan.assign).toEqual([
      { ouId: 11, workerIds: [109] },
      { ouId: 12, workerIds: [105] },
    ]);
  });

  it("leaves an unchanged grid untouched (D43: kept rows keep their flags and provenance)", () => {
    const rows = [
      { ou_id: 1, worker_id: 2 },
      { ou_id: 1, worker_id: 3 },
    ];
    expect(planPlacementsSave(rows, [...rows].reverse())).toEqual({ unassign: [], assign: [] });
  });

  it("empties every unit when the grid is empty (the legacy wipe)", () => {
    const plan = planPlacementsSave(
      [
        { ou_id: 2, worker_id: 9 },
        { ou_id: 1, worker_id: 9 },
        { ou_id: 1, worker_id: 8 },
      ],
      []
    );
    expect(plan.unassign).toEqual([
      { ouId: 1, workerIds: [8, 9] },
      { ouId: 2, workerIds: [9] },
    ]);
    expect(plan.assign).toEqual([]);
  });
});

describe("savePlacements — the exact unassign / assign calls", () => {
  it("reads the placements on the units in scope, unassigns first, then assigns with manual / skip", async () => {
    const fake = createFakeStructureClient({
      tables: {
        campaign_worker_ou: [
          { ou_id: 20, worker_id: 105 },
          { ou_id: 20, worker_id: 106 },
          { ou_id: 11, worker_id: 102 },
        ],
      },
    });
    fake.answerRpc("structure_placements_unassign", { data: { removed: 1 } });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 1, moved: 0, skipped: 1, displaced: 0 } });
    fake.answerRpc("structure_placements_assign", { data: { inserted: 1, moved: 0, skipped: 0, displaced: 0 } });

    const outcome = await savePlacements(fake.client, CAMPAIGN, [11, 12, 20], [
      { ou_id: 20, worker_id: 106 },
      { ou_id: 11, worker_id: 102 },
      { ou_id: 11, worker_id: 109 },
      { ou_id: 12, worker_id: 105 },
      { ou_id: 11, worker_id: 110 },
    ]);

    expect(fake.trace()).toEqual([
      "from:campaign_worker_ou.select.in.order.order.range",
      "rpc:structure_placements_unassign",
      "rpc:structure_placements_assign",
      "rpc:structure_placements_assign",
    ]);
    expect(fake.fromCalls()[0].ops).toEqual([
      { method: "select", args: ["ou_id, worker_id"] },
      { method: "in", args: ["ou_id", [11, 12, 20]] },
      { method: "order", args: ["ou_id", { ascending: true }] },
      { method: "order", args: ["worker_id", { ascending: true }] },
      { method: "range", args: [0, POSTGREST_PAGE_SIZE - 1] },
    ]);
    expect(fake.rpcCalls().map((c) => c.args)).toEqual([
      { p_campaign_id: CAMPAIGN, p_worker_ids: [105], p_ou_id: 20, p_within_group_id: null },
      {
        p_campaign_id: CAMPAIGN,
        p_ou_id: 11,
        p_worker_ids: [109, 110],
        p_source: "manual",
        p_is_primary: false,
        p_on_conflict: "skip",
      },
      {
        p_campaign_id: CAMPAIGN,
        p_ou_id: 12,
        p_worker_ids: [105],
        p_source: "manual",
        p_is_primary: false,
        p_on_conflict: "skip",
      },
    ]);
    expect(outcome).toMatchObject({ removed: 1, inserted: 2, moved: 0, skipped: 1 });
  });

  it("Stage 6 (§8.2 unpaged read): pages the placement read in PAGE_SIZE ranges until a short page, so a row past PostgREST's max-rows is neither re-assigned nor left out of the unassign set", async () => {
    const n = 2_500;
    const rows = Array.from({ length: n }, (_, i) => ({ ou_id: 5, worker_id: i + 1 }));
    const fake = createFakeStructureClient({ tables: { campaign_worker_ou: rows } });
    fake.answerRpc("structure_placements_unassign", { data: { removed: 1 } });
    // The grid keeps every row but the last one, and adds one new worker.
    const desired = [...rows.slice(0, n - 1), { ou_id: 5, worker_id: 9_999 }];
    const outcome = await savePlacements(fake.client, CAMPAIGN, [5], desired);

    const reads = fake.fromCalls().filter((c) => c.table === "campaign_worker_ou");
    expect(reads).toHaveLength(Math.ceil(n / POSTGREST_PAGE_SIZE));
    expect(reads.map((c) => c.ops.find((o) => o.method === "range")?.args)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(outcome.plan.unassign).toEqual([{ ouId: 5, workerIds: [n] }]);
    expect(outcome.plan.assign).toEqual([{ ouId: 5, workerIds: [9_999] }]);
    expect(fake.rpcCalls().map((c) => [c.name, c.args.p_worker_ids])).toEqual([
      ["structure_placements_unassign", [n]],
      ["structure_placements_assign", [9_999]],
    ]);
  });

  it("with no units in scope reads nothing and only assigns", async () => {
    const fake = createFakeStructureClient();
    await savePlacements(fake.client, CAMPAIGN, [], [{ ou_id: 5, worker_id: 1 }]);
    expect(fake.trace()).toEqual(["rpc:structure_placements_assign"]);
  });

  it("with an unchanged grid issues no RPC at all", async () => {
    const fake = createFakeStructureClient({ tables: { campaign_worker_ou: [{ ou_id: 5, worker_id: 1 }] } });
    const outcome = await savePlacements(fake.client, CAMPAIGN, [5], [{ ou_id: 5, worker_id: 1 }]);
    expect(fake.trace()).toEqual(["from:campaign_worker_ou.select.in.order.order.range"]);
    expect(outcome).toMatchObject({ removed: 0, inserted: 0, skipped: 0 });
  });

  it("throws on a failed read rather than writing blind, and stops at the first refused RPC", async () => {
    const failing = createFakeStructureClient({ errors: { campaign_worker_ou: { code: "PGRST000", message: "read failed" } } });
    await expect(savePlacements(failing.client, CAMPAIGN, [5], [])).rejects.toMatchObject({ message: "read failed" });
    expect(failing.rpcCalls()).toEqual([]);

    const refused = createFakeStructureClient({ tables: { campaign_worker_ou: [{ ou_id: 5, worker_id: 1 }] } });
    refused.answerRpc("structure_placements_unassign", { error: { code: "42501", message: "no write permission on campaign 7" } });
    const err = await savePlacements(refused.client, CAMPAIGN, [5], [{ ou_id: 6, worker_id: 1 }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StructureApiError);
    expect((err as StructureApiError).kind).toBe("forbidden");
    expect(refused.trace()).toEqual(["from:campaign_worker_ou.select.in.order.order.range", "rpc:structure_placements_unassign"]);
  });
});
