/**
 * WP2.2 wrapper unit tests (docs/organiser-ux-review/wp/wp2.2.md §4.1): error
 * mapping for every SQLSTATE/constraint of §3.2 plus PGRST202, argument
 * serialisation for every method (exact `p_*` names, defaults, null handling),
 * and result parsing (malformed shapes rejected, extra keys tolerated).
 * Node only, no database: the client is a fake that records `rpc` calls.
 */

import { describe, expect, it } from "vitest";
import {
  ONE_UNIT_PER_GROUP_CONSTRAINT,
  STRUCTURE_RPC_NAMES,
  StructureApiError,
  extractConstraintName,
  isStructureApiError,
  mapPostgrestError,
  structureApi,
  type PostgrestErrorLike,
  type StructureRpcClient,
  type StructureRpcName,
} from "../structure-api";

interface RecordedCall {
  fn: string;
  args: Record<string, unknown> | undefined;
}

function fakeClient(response: { data?: unknown; error?: PostgrestErrorLike | null }) {
  const calls: RecordedCall[] = [];
  const client: StructureRpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
    },
  };
  return { client, calls };
}

async function expectApiError(promise: Promise<unknown>): Promise<StructureApiError> {
  try {
    await promise;
  } catch (error) {
    if (isStructureApiError(error)) return error;
    throw error;
  }
  throw new Error("expected the call to throw a StructureApiError");
}

const pgError = (code: string, message = "boom", details?: string, hint?: string): PostgrestErrorLike => ({
  code,
  message,
  details: details ?? null,
  hint: hint ?? null,
});

describe("structure-api error mapping (wp2.2.md §3.2)", () => {
  it.each<[string, string]>([
    ["42501", "forbidden"],
    ["22023", "invalid_argument"],
    ["P0002", "not_found"],
    ["P0001", "rule_violation"],
    ["PGRST202", "schema_missing"],
    ["23503", "unknown"],
    ["", "unknown"],
  ])("maps SQLSTATE %s to kind %s", (code, kind) => {
    const err = mapPostgrestError("structure_placements_move", pgError(code, "message text"));
    expect(err).toBeInstanceOf(StructureApiError);
    expect(err.kind).toBe(kind);
    expect(err.code).toBe(code);
    expect(err.rpc).toBe("structure_placements_move");
    expect(err.message).toBe("message text");
    expect(err.name).toBe("StructureApiError");
  });

  it("maps 23505 on campaign_worker_ou_one_unit_per_group (RPC pre-check form) to duplicate_in_group", () => {
    const err = mapPostgrestError(
      "structure_placements_assign",
      pgError(
        "23505",
        `duplicate key value violates unique constraint "${ONE_UNIT_PER_GROUP_CONSTRAINT}"`,
        "Key (worker_id, group_id)=(5, 9) already exists.",
        "A worker is in at most one unit per group (wp2.2.md §3.4 C-a)."
      )
    );
    expect(err.kind).toBe("duplicate_in_group");
    expect(err.constraint).toBe(ONE_UNIT_PER_GROUP_CONSTRAINT);
    expect(err.details).toContain("Key (worker_id, group_id)");
    expect(err.hint).toContain("C-a");
  });

  it("maps 23505 raised by the WP2.2b index (constraint named only in details) to duplicate_in_group", () => {
    const err = mapPostgrestError(
      "structure_placements_assign",
      pgError("23505", "duplicate key value", `violates unique constraint "${ONE_UNIT_PER_GROUP_CONSTRAINT}"`)
    );
    expect(err.kind).toBe("duplicate_in_group");
    expect(err.constraint).toBe(ONE_UNIT_PER_GROUP_CONSTRAINT);
  });

  it.each(["campaign_groups_campaign_name_key", "campaign_groups_one_fixed_kind_per_campaign"])(
    "maps 23505 on %s to duplicate_group",
    (constraint) => {
      const err = mapPostgrestError(
        "structure_group_create",
        pgError("23505", `duplicate key value violates unique constraint "${constraint}"`)
      );
      expect(err.kind).toBe("duplicate_group");
      expect(err.constraint).toBe(constraint);
    }
  );

  it("maps campaign_group_ensure's own 23505 (no constraint name) to duplicate_group", () => {
    const err = mapPostgrestError(
      "structure_group_create",
      pgError("23505", 'A group named "Shift" already exists in campaign 7; rename it before creating a custom group')
    );
    expect(err.kind).toBe("duplicate_group");
    expect(err.constraint).toBeUndefined();
  });

  it("maps 23505 on an unrelated constraint to unknown but keeps the code and constraint", () => {
    const err = mapPostgrestError(
      "structure_placements_assign",
      pgError("23505", 'duplicate key value violates unique constraint "campaign_worker_ou_ou_id_worker_id_key"')
    );
    expect(err.kind).toBe("unknown");
    expect(err.code).toBe("23505");
    expect(err.constraint).toBe("campaign_worker_ou_ou_id_worker_id_key");
  });

  it("extracts the constraint name from message before details", () => {
    expect(
      extractConstraintName({
        message: 'x violates unique constraint "from_message"',
        details: 'violates constraint "from_details"',
      })
    ).toBe("from_message");
    expect(extractConstraintName({ message: "nothing here", details: 'constraint "from_details"' })).toBe(
      "from_details"
    );
    expect(extractConstraintName({ message: "nothing here" })).toBeUndefined();
  });

  it("surfaces the mapped error from a wrapper call", async () => {
    const { client } = fakeClient({ error: pgError("42501", "no write permission on campaign 3") });
    const err = await expectApiError(
      structureApi(client).placements.unassign({ campaignId: 3, workerIds: [1] })
    );
    expect(err.kind).toBe("forbidden");
    expect(err.rpc).toBe("structure_placements_unassign");
  });

  it("does not wrap non-PostgREST rejections", async () => {
    const client: StructureRpcClient = {
      rpc() {
        return Promise.reject(new TypeError("network down"));
      },
    };
    await expect(structureApi(client).placements.unassign({ campaignId: 3, workerIds: [1] })).rejects.toThrow(
      TypeError
    );
  });
});

describe("structure-api argument serialisation (wp2.2.md §3.3, §3.9)", () => {
  const ok = (data: unknown) => fakeClient({ data });

  it("exposes exactly the seventeen RPC names in the union", () => {
    expect([...STRUCTURE_RPC_NAMES]).toEqual([
      "structure_group_create",
      "structure_group_update",
      "structure_group_reorder",
      "structure_group_delete",
      "structure_units_create",
      "structure_unit_update",
      "structure_unit_reorder",
      "structure_unit_delete",
      "structure_unit_merge",
      "structure_unit_split",
      "structure_units_bulk_save",
      "structure_placements_assign",
      "structure_placements_move",
      "structure_placements_unassign",
      "structure_placements_set_primary",
      "structure_placements_replace_rule_rows",
      "structure_materialise_employer_placements",
    ]);
  });

  it("groups.create serialises with a null display order by default", async () => {
    const { client, calls } = ok({ group_id: 9, created: true });
    const res = await structureApi(client).groups.create({ campaignId: 4, kind: "custom", name: "Crew A" });
    expect(calls).toEqual([
      {
        fn: "structure_group_create",
        args: { p_campaign_id: 4, p_kind: "custom", p_name: "Crew A", p_display_order: null },
      },
    ]);
    expect(res).toEqual({ group_id: 9, created: true });
  });

  it("groups.create passes an explicit display order", async () => {
    const { client, calls } = ok({ group_id: 9, created: false });
    await structureApi(client).groups.create({ campaignId: 4, kind: "worksite", name: "", displayOrder: 3 });
    expect(calls[0].args).toEqual({ p_campaign_id: 4, p_kind: "worksite", p_name: "", p_display_order: 3 });
  });

  it("groups.update serialises omitted fields as null", async () => {
    const { client, calls } = ok({ group_id: 9 });
    await structureApi(client).groups.update({ campaignId: 4, groupId: 9, displayOrder: 2 });
    expect(calls).toEqual([
      {
        fn: "structure_group_update",
        args: { p_campaign_id: 4, p_group_id: 9, p_name: null, p_display_order: 2 },
      },
    ]);
  });

  it("groups.reorder passes the id array through unchanged", async () => {
    const { client, calls } = ok({ updated: 2, unlisted: 1 });
    await structureApi(client).groups.reorder({ campaignId: 4, groupIds: [9, 7] });
    expect(calls).toEqual([{ fn: "structure_group_reorder", args: { p_campaign_id: 4, p_group_ids: [9, 7] } }]);
  });

  it("groups.remove serialises the mode", async () => {
    const { client, calls } = ok({ group_id: 9, deleted_ou_ids: [], placements_removed: 0 });
    await structureApi(client).groups.remove({ campaignId: 4, groupId: 9, mode: "cascade_units" });
    expect(calls).toEqual([
      { fn: "structure_group_delete", args: { p_campaign_id: 4, p_group_id: 9, p_mode: "cascade_units" } },
    ]);
  });

  it("units.create defaults assignments to an empty array and passes elements verbatim", async () => {
    const { client, calls } = ok({
      units: [{ client_ref: "c", ou_id: 1, group_id: 2 }],
      inserted: 0,
      moved: 0,
      skipped: 0,
      displaced: 0,
    });
    const units = [
      { client_ref: "c", name: "Container", ou_type: "employer", is_group_container: true },
      { client_ref: "m", name: "Member", ou_type: "worksite", parent_ou_id: "c", ou_group_id: "c", unit_basis: { custom: true } },
    ];
    await structureApi(client).units.create({ campaignId: 4, units });
    expect(calls).toEqual([
      { fn: "structure_units_create", args: { p_campaign_id: 4, p_units: units, p_assignments: [] } },
    ]);
  });

  it("units.create passes assignments", async () => {
    const { client, calls } = ok({ units: [], inserted: 1, moved: 0, skipped: 0, displaced: 0 });
    const assignments = [{ ou_ref: "m", worker_id: 5, is_primary: true }];
    await structureApi(client).units.create({
      campaignId: 4,
      units: [{ client_ref: "m", name: "Member", ou_type: "worksite" }],
      assignments,
    });
    expect(calls[0].args?.p_assignments).toEqual(assignments);
  });

  it("units.update passes the patch object verbatim (no group_id ever)", async () => {
    const { client, calls } = ok({ ou_id: 7, updated_keys: ["name", "user_rating"] });
    await structureApi(client).units.update({ campaignId: 4, ouId: 7, patch: { name: "N", user_rating: 3 } });
    expect(calls).toEqual([
      {
        fn: "structure_unit_update",
        args: { p_campaign_id: 4, p_ou_id: 7, p_patch: { name: "N", user_rating: 3 } },
      },
    ]);
    expect(JSON.stringify(calls[0].args)).not.toContain("group_id");
  });

  it("units.reorder passes the id array", async () => {
    const { client, calls } = ok({ updated: 3 });
    await structureApi(client).units.reorder({ campaignId: 4, ouIds: [3, 1, 2] });
    expect(calls).toEqual([{ fn: "structure_unit_reorder", args: { p_campaign_id: 4, p_ou_ids: [3, 1, 2] } }]);
  });

  it("units.remove defaults reassignments to [] and deleteChildren to false", async () => {
    const { client, calls } = ok({
      deleted_ou_ids: [7],
      placements_moved: 0,
      placements_removed: 0,
      placements_displaced: 0,
    });
    await structureApi(client).units.remove({ campaignId: 4, ouId: 7 });
    expect(calls).toEqual([
      {
        fn: "structure_unit_delete",
        args: { p_campaign_id: 4, p_ou_id: 7, p_reassignments: [], p_delete_children: false },
      },
    ]);
  });

  it("units.remove passes reassignments including a null target", async () => {
    const { client, calls } = ok({
      deleted_ou_ids: [7],
      placements_moved: 1,
      placements_removed: 1,
      placements_displaced: 0,
    });
    const reassignments = [
      { worker_id: 1, to_ou_id: 8, is_primary: true },
      { worker_id: 2, to_ou_id: null },
    ];
    await structureApi(client).units.remove({ campaignId: 4, ouId: 7, reassignments, deleteChildren: true });
    expect(calls[0].args).toEqual({
      p_campaign_id: 4,
      p_ou_id: 7,
      p_reassignments: reassignments,
      p_delete_children: true,
    });
  });

  it("units.merge serialises survivor and sources", async () => {
    const { client, calls } = ok({ moved: 1, collapsed: 0, deleted_ou_ids: [2, 3], repointed: {} });
    await structureApi(client).units.merge({ campaignId: 4, survivorOuId: 1, sourceOuIds: [2, 3] });
    expect(calls).toEqual([
      {
        fn: "structure_unit_merge",
        args: { p_campaign_id: 4, p_survivor_ou_id: 1, p_source_ou_ids: [2, 3] },
      },
    ]);
  });

  it("units.split applies the defaults (keepInSource false, groupId null, assignments [])", async () => {
    const { client, calls } = ok({ children: [], moved: 0, copied: 0, kept: 0, displaced: 0 });
    const children = [{ client_ref: "a", name: "A" }];
    await structureApi(client).units.split({ campaignId: 4, sourceOuId: 9, children });
    expect(calls).toEqual([
      {
        fn: "structure_unit_split",
        args: {
          p_campaign_id: 4,
          p_source_ou_id: 9,
          p_children: children,
          p_assignments: [],
          p_keep_in_source: false,
          p_group_id: null,
        },
      },
    ]);
  });

  it("units.split passes explicit options", async () => {
    const { client, calls } = ok({ children: [], moved: 0, copied: 0, kept: 0, displaced: 0 });
    const assignments = [{ child_ref: "a", worker_id: 5 }];
    await structureApi(client).units.split({
      campaignId: 4,
      sourceOuId: 9,
      children: [{ client_ref: "a", name: "A", ou_type: "custom", parent_ou_id: null }],
      assignments,
      keepInSource: true,
      groupId: 12,
    });
    expect(calls[0].args).toMatchObject({ p_assignments: assignments, p_keep_in_source: true, p_group_id: 12 });
    expect((calls[0].args?.p_children as unknown[])[0]).toEqual({
      client_ref: "a",
      name: "A",
      ou_type: "custom",
      parent_ou_id: null,
    });
  });

  it("units.bulkSave defaults every list to []", async () => {
    const { client, calls } = ok({ deleted_ou_ids: [], updated_ou_ids: [], created: [], placements_removed: 0 });
    await structureApi(client).units.bulkSave({ campaignId: 4 });
    expect(calls).toEqual([
      {
        fn: "structure_units_bulk_save",
        args: { p_campaign_id: 4, p_delete_ou_ids: [], p_updates: [], p_creates: [] },
      },
    ]);
  });

  it("units.bulkSave passes deletes, flat updates and creates", async () => {
    const { client, calls } = ok({ deleted_ou_ids: [1], updated_ou_ids: [2], created: [], placements_removed: 0 });
    await structureApi(client).units.bulkSave({
      campaignId: 4,
      deleteOuIds: [1],
      updates: [{ ou_id: 2, name: "Renamed", total_workers_estimated: 12 }],
      creates: [{ name: "New", ou_type: "shift" }],
    });
    expect(calls[0].args).toEqual({
      p_campaign_id: 4,
      p_delete_ou_ids: [1],
      p_updates: [{ ou_id: 2, name: "Renamed", total_workers_estimated: 12 }],
      p_creates: [{ name: "New", ou_type: "shift" }],
    });
  });

  it("placements.assign applies the defaults manual / false / skip", async () => {
    const { client, calls } = ok({ inserted: 2, moved: 0, skipped: 0, displaced: 0 });
    await structureApi(client).placements.assign({ campaignId: 4, ouId: 7, workerIds: [1, 2] });
    expect(calls).toEqual([
      {
        fn: "structure_placements_assign",
        args: {
          p_campaign_id: 4,
          p_ou_id: 7,
          p_worker_ids: [1, 2],
          p_source: "manual",
          p_is_primary: false,
          p_on_conflict: "skip",
        },
      },
    ]);
  });

  it("placements.assign passes universe / primary / move", async () => {
    const { client, calls } = ok({ inserted: 0, moved: 1, skipped: 0, displaced: 0 });
    await structureApi(client).placements.assign({
      campaignId: 4,
      ouId: 7,
      workerIds: [1],
      source: "universe",
      isPrimary: true,
      onConflict: "move",
    });
    expect(calls[0].args).toMatchObject({ p_source: "universe", p_is_primary: true, p_on_conflict: "move" });
  });

  it("placements.move serialises an unassign-all as nulls with keepSource false and keepInParent true", async () => {
    const { client, calls } = ok({ moved: 0, inserted: 0, displaced: 0, removed: 2, skipped: 0, parent_inserted: 0 });
    await structureApi(client).placements.move({ campaignId: 4, workerIds: [1, 2] });
    expect(calls).toEqual([
      {
        fn: "structure_placements_move",
        args: {
          p_campaign_id: 4,
          p_worker_ids: [1, 2],
          p_from_ou_id: null,
          p_to_ou_id: null,
          p_within_group_id: null,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
  });

  it("placements.move serialises a copy with explicit source/target and keepInParent false", async () => {
    const { client, calls } = ok({ moved: 0, inserted: 1, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 });
    await structureApi(client).placements.move({
      campaignId: 4,
      workerIds: [1],
      fromOuId: 7,
      toOuId: 8,
      keepSource: true,
      keepInParent: false,
    });
    expect(calls[0].args).toEqual({
      p_campaign_id: 4,
      p_worker_ids: [1],
      p_from_ou_id: 7,
      p_to_ou_id: 8,
      p_within_group_id: null,
      p_keep_source: true,
      p_keep_in_parent: false,
    });
  });

  it("placements.move serialises a per-group unassign", async () => {
    const { client, calls } = ok({ moved: 0, inserted: 0, displaced: 0, removed: 1, skipped: 0, parent_inserted: 0 });
    await structureApi(client).placements.move({ campaignId: 4, workerIds: [1], toOuId: null, withinGroupId: 3 });
    expect(calls[0].args).toMatchObject({ p_to_ou_id: null, p_within_group_id: 3, p_from_ou_id: null });
  });

  it("placements.unassign serialises omitted scope as nulls", async () => {
    const { client, calls } = ok({ removed: 1 });
    await structureApi(client).placements.unassign({ campaignId: 4, workerIds: [1] });
    expect(calls).toEqual([
      {
        fn: "structure_placements_unassign",
        args: { p_campaign_id: 4, p_worker_ids: [1], p_ou_id: null, p_within_group_id: null },
      },
    ]);
  });

  it("placements.unassign passes ouId and withinGroupId", async () => {
    const { client, calls } = ok({ removed: 1 });
    await structureApi(client).placements.unassign({ campaignId: 4, workerIds: [1], ouId: 7 });
    expect(calls[0].args).toMatchObject({ p_ou_id: 7, p_within_group_id: null });
    await structureApi(client).placements.unassign({ campaignId: 4, workerIds: [1], withinGroupId: 3 });
    expect(calls[1].args).toMatchObject({ p_ou_id: null, p_within_group_id: 3 });
  });

  it("placements.setPrimary serialises ids", async () => {
    const { client, calls } = ok({ placement_id: 55, cleared: 1 });
    await structureApi(client).placements.setPrimary({ campaignId: 4, workerId: 1, ouId: 7 });
    expect(calls).toEqual([
      { fn: "structure_placements_set_primary", args: { p_campaign_id: 4, p_worker_id: 1, p_ou_id: 7 } },
    ]);
  });

  it("placements.replaceRuleRows passes rows verbatim", async () => {
    const { client, calls } = ok({ removed: 3, inserted: 2, skipped: 0 });
    const rows = [
      { ou_id: 7, worker_id: 1, assigned_rule_id: 10 },
      { ou_id: 7, worker_id: 2, assigned_rule_id: null },
    ];
    await structureApi(client).placements.replaceRuleRows({ campaignId: 4, rows });
    expect(calls).toEqual([
      { fn: "structure_placements_replace_rule_rows", args: { p_campaign_id: 4, p_rows: rows } },
    ]);
  });

  it("placements.materialiseEmployer passes only the campaign id", async () => {
    const { client, calls } = ok({ inserted: 0, skipped_existing: 0, containers: 0, multi_container_workers: 0 });
    await structureApi(client).placements.materialiseEmployer({ campaignId: 4 });
    expect(calls).toEqual([{ fn: "structure_materialise_employer_placements", args: { p_campaign_id: 4 } }]);
  });

  it("every method calls exactly one RPC whose name is in the union, and PGRST202 maps to schema_missing", async () => {
    const seen = new Set<StructureRpcName>();
    let callCount = 0;
    const recorder: StructureRpcClient = {
      rpc(fn, args) {
        callCount += 1;
        seen.add(fn as StructureRpcName);
        // What PostgREST answers on a database without WP2.2a (wp2.2.md §8.2).
        return Promise.resolve({
          data: null,
          error: {
            code: "PGRST202",
            message: `Could not find the function public.${fn}(${Object.keys(args ?? {}).join(", ")}) in the schema cache`,
            hint: null,
            details: null,
          },
        });
      },
    };
    const rec = structureApi(recorder);
    const invocations: Array<Promise<unknown>> = [
      rec.groups.create({ campaignId: 1, kind: "custom", name: "x" }),
      rec.groups.update({ campaignId: 1, groupId: 1, name: "y" }),
      rec.groups.reorder({ campaignId: 1, groupIds: [1] }),
      rec.groups.remove({ campaignId: 1, groupId: 1, mode: "empty_only" }),
      rec.units.create({ campaignId: 1, units: [{ name: "u", ou_type: "custom" }] }),
      rec.units.update({ campaignId: 1, ouId: 1, patch: { name: "n" } }),
      rec.units.reorder({ campaignId: 1, ouIds: [1] }),
      rec.units.remove({ campaignId: 1, ouId: 1 }),
      rec.units.merge({ campaignId: 1, survivorOuId: 1, sourceOuIds: [2] }),
      rec.units.split({ campaignId: 1, sourceOuId: 1, children: [{ name: "c" }] }),
      rec.units.bulkSave({ campaignId: 1 }),
      rec.placements.assign({ campaignId: 1, ouId: 1, workerIds: [1] }),
      rec.placements.move({ campaignId: 1, workerIds: [1], toOuId: 1 }),
      rec.placements.unassign({ campaignId: 1, workerIds: [1] }),
      rec.placements.setPrimary({ campaignId: 1, workerId: 1, ouId: 1 }),
      rec.placements.replaceRuleRows({ campaignId: 1, rows: [] }),
      rec.placements.materialiseEmployer({ campaignId: 1 }),
    ];
    const results = await Promise.allSettled(invocations);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      const err = (r as PromiseRejectedResult).reason as StructureApiError;
      expect(err.kind).toBe("schema_missing");
      expect(err.code).toBe("PGRST202");
    }
    expect(callCount).toBe(invocations.length);
    expect([...seen].sort()).toEqual([...STRUCTURE_RPC_NAMES].sort());
  });
});

describe("structure-api result parsing (wp2.2.md §3.2 return shapes)", () => {
  it("rejects a malformed shape with kind unknown / code invalid_result", async () => {
    const { client } = fakeClient({ data: { group_id: "nine", created: true } });
    const err = await expectApiError(structureApi(client).groups.create({ campaignId: 1, kind: "custom", name: "x" }));
    expect(err.kind).toBe("unknown");
    expect(err.code).toBe("invalid_result");
    expect(err.rpc).toBe("structure_group_create");
    expect(err.message).toContain("structure_group_create returned an unexpected result shape");
  });

  it("rejects a null result", async () => {
    const { client } = fakeClient({ data: null });
    const err = await expectApiError(structureApi(client).placements.unassign({ campaignId: 1, workerIds: [1] }));
    expect(err.code).toBe("invalid_result");
  });

  it("rejects a missing stable key", async () => {
    const { client } = fakeClient({ data: { moved: 1, inserted: 0, displaced: 0, removed: 0 } });
    const err = await expectApiError(structureApi(client).placements.move({ campaignId: 1, workerIds: [1], toOuId: 2 }));
    expect(err.code).toBe("invalid_result");
  });

  it("rejects non-integer counts and malformed nested units", async () => {
    const { client } = fakeClient({
      data: { units: [{ client_ref: "a", ou_id: 1.5, group_id: 2 }], inserted: 0, moved: 0, skipped: 0, displaced: 0 },
    });
    const err = await expectApiError(
      structureApi(client).units.create({ campaignId: 1, units: [{ name: "u", ou_type: "custom" }] })
    );
    expect(err.code).toBe("invalid_result");
  });

  it("accepts extra keys (adding a key is non-breaking)", async () => {
    const { client } = fakeClient({
      data: { removed: 2, inserted: 1, skipped: 0, future_key: "ignored", nested: { a: 1 } },
    });
    const res = await structureApi(client).placements.replaceRuleRows({ campaignId: 1, rows: [] });
    expect(res).toEqual({ removed: 2, inserted: 1, skipped: 0 });
  });

  it("accepts null client_ref and null group_id in created units", async () => {
    const { client } = fakeClient({
      data: { units: [{ client_ref: null, ou_id: 10, group_id: null }], inserted: 0, moved: 0, skipped: 0, displaced: 0 },
    });
    const res = await structureApi(client).units.create({
      campaignId: 1,
      units: [{ name: "u", ou_type: "custom", is_group_container: true }],
    });
    expect(res.units).toEqual([{ client_ref: null, ou_id: 10, group_id: null }]);
  });

  it("parses the merge repointed record", async () => {
    const { client } = fakeClient({
      data: { moved: 1, collapsed: 0, deleted_ou_ids: [2], repointed: { campaign_unit_rules: 3, woc_scope_units: 0 } },
    });
    const res = await structureApi(client).units.merge({ campaignId: 1, survivorOuId: 1, sourceOuIds: [2] });
    expect(res.repointed).toEqual({ campaign_unit_rules: 3, woc_scope_units: 0 });
  });
});
