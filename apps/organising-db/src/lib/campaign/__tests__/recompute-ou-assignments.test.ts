/**
 * WP2.2 Stage 6 — `recomputeOuAssignments` writes only through
 * `structure_placements_replace_rule_rows` (wp2.2.md §3.11 row 14, §3.8 R1,
 * §4.1). The fake client records every `from(...)` chain and `rpc(...)`
 * call, so each test pins the exact `p_rows` payload and that no chain on
 * `campaign_worker_ou` is a write.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@oa/db-types";
import { recomputeOuAssignments } from "../recompute-ou-assignments";
import { createFakeStructureClient, type FakeStructureClientOptions } from "./fake-structure-client";

const CAMPAIGN = 7;

const member = (worker_id: number, worker: Record<string, unknown>) => ({
  worker_id,
  worker: {
    worker_id,
    employer_id: null,
    worksite_id: null,
    occupation: null,
    classification: null,
    shift_id: null,
    work_area_id: null,
    roster_panel_id: null,
    canonical_occupation_id: null,
    canonical_occupation: null,
    ...worker,
  },
});

const rule = (rule_id: number, ou_id: number, patch: Record<string, unknown> = {}) => ({
  rule_id,
  ou_id,
  include: true,
  dimension_type: "employer",
  operator: "equals",
  value_int: 5,
  value_text: null,
  ...patch,
});

function client(tables: FakeStructureClientOptions["tables"]) {
  const fake = createFakeStructureClient({ tables });
  return { fake, supabase: fake.client as unknown as SupabaseClient<Database> };
}

function structureWrites(fake: ReturnType<typeof createFakeStructureClient>) {
  return fake
    .fromCalls()
    .filter((c) => c.table === "campaign_worker_ou" || c.table === "campaign_organising_units")
    .filter((c) => c.ops.some((o) => ["insert", "update", "upsert", "delete"].includes(o.method)));
}

describe("recomputeOuAssignments — one structure_placements_replace_rule_rows per campaign", () => {
  it("plans the desired rule rows and sends them all in ONE call, attributed to the include rule that matched", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [
        member(101, { employer_id: 5 }),
        member(102, { employer_id: 5, worksite_id: 20 }),
        member(103, { employer_id: 9 }),
      ],
      campaign_unit_rules: [
        rule(1, 10), // employer 5 → unit 10
        rule(2, 11, { dimension_type: "worksite", value_int: 20 }), // worksite 20 → unit 11
        rule(3, 10, { include: false, dimension_type: "worksite", value_int: 20 }), // but not worksite 20 in unit 10
      ],
      campaign_organising_units: [
        { ou_id: 10, is_group_container: false },
        { ou_id: 11, is_group_container: false },
        { ou_id: 12, is_group_container: false },
      ],
      worker_tags: [],
      occupation_aliases: [],
    });
    fake.answerRpc("structure_placements_replace_rule_rows", { data: { removed: 4, inserted: 2, skipped: 0 } });

    const result = await recomputeOuAssignments(supabase, CAMPAIGN);

    expect(fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_replace_rule_rows",
        args: {
          p_campaign_id: CAMPAIGN,
          p_rows: [
            { ou_id: 10, worker_id: 101, assigned_rule_id: 1 },
            { ou_id: 11, worker_id: 102, assigned_rule_id: 2 },
          ],
        },
      },
    ]);
    expect(result).toEqual({ inserted: 2, removed: 4, skipped: 0 });
    expect(structureWrites(fake)).toEqual([]);
    // The reads are the legacy ones: membership, rules, units, tags (aliases only when an occupation is set).
    expect(fake.trace()).toEqual([
      "from:campaign_worker_membership.select.eq",
      "from:campaign_unit_rules.select.eq.order",
      "from:campaign_organising_units.select.eq",
      "from:worker_tags.select.in",
      "rpc:structure_placements_replace_rule_rows",
    ]);
  });

  it("a campaign with members but no rules still issues the call with rows: [] (withdraws every rule row; manual and universe rows survive by R1)", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [member(101, { employer_id: 5 })],
      campaign_unit_rules: [],
      campaign_organising_units: [{ ou_id: 10, is_group_container: false }],
    });
    fake.answerRpc("structure_placements_replace_rule_rows", { data: { removed: 3, inserted: 0, skipped: 0 } });

    const result = await recomputeOuAssignments(supabase, CAMPAIGN);

    expect(fake.rpcCalls()).toEqual([
      { kind: "rpc", name: "structure_placements_replace_rule_rows", args: { p_campaign_id: CAMPAIGN, p_rows: [] } },
    ]);
    expect(result).toEqual({ inserted: 0, removed: 3, skipped: 0 });
    expect(structureWrites(fake)).toEqual([]);
  });

  it("rules on a group container are dropped before planning (a stray container rule cannot fail the whole recompute)", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [member(101, { employer_id: 5 })],
      campaign_unit_rules: [rule(1, 99)],
      campaign_organising_units: [
        { ou_id: 99, is_group_container: true },
        { ou_id: 10, is_group_container: false },
      ],
    });
    await recomputeOuAssignments(supabase, CAMPAIGN);
    expect(fake.rpcCalls().map((c) => c.args)).toEqual([{ p_campaign_id: CAMPAIGN, p_rows: [] }]);
  });

  it("a unit with exclude rules only attributes its rows to the unit's first rule, so no Recompute row carries the NULL attribution the R1-b relabel keys on", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [member(101, { employer_id: 5 }), member(102, { employer_id: 6 })],
      campaign_unit_rules: [rule(4, 10, { include: false, value_int: 6 })],
      campaign_organising_units: [{ ou_id: 10, is_group_container: false }],
      worker_tags: [],
    });
    await recomputeOuAssignments(supabase, CAMPAIGN);
    expect(fake.rpcCalls()[0].args).toEqual({
      p_campaign_id: CAMPAIGN,
      p_rows: [{ ou_id: 10, worker_id: 101, assigned_rule_id: 4 }],
    });
  });

  it("A2: rules are read ordered by rule_id and the desired rows follow it, so of two same-group units that both match, the lower rule_id's unit is first in p_rows (the RPC keeps the first, skips the second)", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [member(101, { employer_id: 5 })],
      // Arrives out of order; unit 20 (rule 9) and unit 10 (rule 2) are both employer-5 rules.
      campaign_unit_rules: [rule(9, 20), rule(2, 10)],
      campaign_organising_units: [
        { ou_id: 10, is_group_container: false },
        { ou_id: 20, is_group_container: false },
      ],
      worker_tags: [],
    });
    await recomputeOuAssignments(supabase, CAMPAIGN);
    const rulesRead = fake.fromCalls().find((c) => c.table === "campaign_unit_rules");
    expect(rulesRead?.ops.map((o) => o.method)).toEqual(["select", "eq", "order"]);
    expect(rulesRead?.ops[2]).toEqual({ method: "order", args: ["rule_id", { ascending: true }] });
    expect(fake.rpcCalls()[0].args).toEqual({
      p_campaign_id: CAMPAIGN,
      p_rows: [
        { ou_id: 10, worker_id: 101, assigned_rule_id: 2 },
        { ou_id: 20, worker_id: 101, assigned_rule_id: 9 },
      ],
    });
  });

  it("a campaign with no members writes nothing (as before Stage 6)", async () => {
    const { fake, supabase } = client({ campaign_worker_membership: [] });
    const result = await recomputeOuAssignments(supabase, CAMPAIGN);
    expect(result).toEqual({ inserted: 0, removed: 0, skipped: 0 });
    expect(fake.rpcCalls()).toEqual([]);
  });

  it("a refused call reaches the caller as a StructureApiError (the units section shows its message)", async () => {
    const { fake, supabase } = client({
      campaign_worker_membership: [member(101, { employer_id: 5 })],
      campaign_unit_rules: [rule(1, 10)],
      campaign_organising_units: [{ ou_id: 10, is_group_container: false }],
      worker_tags: [],
    });
    fake.answerRpc("structure_placements_replace_rule_rows", {
      error: { code: "42501", message: "no write permission on campaign 7" },
    });
    await expect(recomputeOuAssignments(supabase, CAMPAIGN)).rejects.toMatchObject({
      name: "StructureApiError",
      kind: "forbidden",
      code: "42501",
    });
  });
});
