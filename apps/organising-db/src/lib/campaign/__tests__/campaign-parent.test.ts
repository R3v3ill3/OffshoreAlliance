/**
 * WP3.8 loader tests (docs/organiser-ux-review/wp/wp3.8.md §4.1, hotfix 2 /
 * D40): the loader makes plain primary-key reads and never an embed — one
 * read when the campaign has no parent, two when it has one — plus its null
 * handling: a fake client returning `{ parent_campaign_id: null }`, a parent
 * row with a name, a parent row that cannot be read, no row, and a query
 * error on either read. Node only, no database; the browser client module is
 * mocked so the hook's import does not touch it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    throw new Error("createClient must not be called by the loader tests");
  },
}));

import {
  CAMPAIGN_PARENT_NAME_SELECT,
  CAMPAIGN_PARENT_QUERY_KEY,
  CAMPAIGN_PARENT_SELECT,
  NO_PARENT,
  loadCampaignParent,
  type CampaignParentClient,
  type CampaignParentQueryChain,
  type CampaignParentQueryResult,
} from "../campaign-parent";

// Type-level check only (never executed): the app's clients — the browser
// factory's default `SupabaseClient` and the routes' `SupabaseClient<any>` —
// satisfy the loader's minimal client shape, so Stage 3 passes them without a cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _untypedClientIsAccepted: CampaignParentClient = null as unknown as SupabaseClient<any>;
const _defaultClientIsAccepted: CampaignParentClient = null as unknown as SupabaseClient;
void _untypedClientIsAccepted;
void _defaultClientIsAccepted;

interface Recorded {
  table: string;
  select: string;
  eq: [string, number];
  maybeSingle: boolean;
}

/**
 * A recording fake answering each `maybeSingle()` from `results` in call
 * order (the last result repeats), so a test scripts read 1 (the campaign's
 * own row) and read 2 (the parent's row) separately.
 */
function fakeClient(...results: CampaignParentQueryResult[]): { client: CampaignParentClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let next = 0;
  const client: CampaignParentClient = {
    from(table): CampaignParentQueryChain {
      return {
        select(columns) {
          return {
            eq(column, value) {
              const rec: Recorded = { table, select: columns, eq: [column, value], maybeSingle: false };
              calls.push(rec);
              return {
                maybeSingle: () => {
                  rec.maybeSingle = true;
                  const result = results[Math.min(next, results.length - 1)];
                  next += 1;
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const OWN_NO_PARENT: CampaignParentQueryResult = { data: { parent_campaign_id: null }, error: null };
const OWN_WITH_PARENT: CampaignParentQueryResult = { data: { parent_campaign_id: 64 }, error: null };
const PARENT_ROW: CampaignParentQueryResult = { data: { campaign_id: 64, name: "ROV sector wide" }, error: null };

describe("loadCampaignParent (wp3.8.md §3.5, D40: no embed)", () => {
  it("neither select string names a relationship (no '!' and no '(' — D40)", () => {
    for (const s of [CAMPAIGN_PARENT_SELECT, CAMPAIGN_PARENT_NAME_SELECT]) {
      expect(s).not.toContain("!");
      expect(s).not.toContain("(");
      expect(s).not.toContain("_fkey");
    }
  });

  it("no parent: exactly one read — parent_campaign_id by campaign_id, maybeSingle", async () => {
    const { client, calls } = fakeClient(OWN_NO_PARENT);
    expect(await loadCampaignParent(client, 61)).toEqual({ parentId: null, parentName: null });
    expect(calls).toEqual([
      { table: "campaigns", select: "parent_campaign_id", eq: ["campaign_id", 61], maybeSingle: true },
    ]);
  });

  it("a parent: two reads — the campaign's parent_campaign_id, then the parent's campaign_id, name by primary key", async () => {
    const { client, calls } = fakeClient(OWN_WITH_PARENT, PARENT_ROW);
    expect(await loadCampaignParent(client, "61")).toEqual({ parentId: 64, parentName: "ROV sector wide" });
    expect(calls).toEqual([
      { table: "campaigns", select: "parent_campaign_id", eq: ["campaign_id", 61], maybeSingle: true },
      { table: "campaigns", select: "campaign_id, name", eq: ["campaign_id", 64], maybeSingle: true },
    ]);
    for (const call of calls) {
      expect(call.select).not.toContain("!");
      expect(call.select).not.toContain("(");
    }
  });

  it("a string parent id is normalised", async () => {
    const { client, calls } = fakeClient({ data: { parent_campaign_id: "64" }, error: null }, PARENT_ROW);
    expect(await loadCampaignParent(client, 61)).toEqual({ parentId: 64, parentName: "ROV sector wide" });
    expect(calls[1].eq).toEqual(["campaign_id", 64]);
  });

  it("a parent id whose row cannot be read, or has a blank name → the id with no name", async () => {
    const missing = fakeClient(OWN_WITH_PARENT, { data: null, error: null });
    expect(await loadCampaignParent(missing.client, 61)).toEqual({ parentId: 64, parentName: null });
    const blank = fakeClient(OWN_WITH_PARENT, { data: { campaign_id: 64, name: "   " }, error: null });
    expect(await loadCampaignParent(blank.client, 61)).toEqual({ parentId: 64, parentName: null });
  });

  it("no row (unknown campaign) → { null, null } after one read", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    expect(await loadCampaignParent(client, 999)).toEqual({ parentId: null, parentName: null });
    expect(calls).toHaveLength(1);
  });

  it("returns a fresh copy of NO_PARENT, never the frozen constant", async () => {
    const { client } = fakeClient(OWN_NO_PARENT);
    const result = await loadCampaignParent(client, 61);
    expect(result).toEqual(NO_PARENT);
    expect(result).not.toBe(NO_PARENT);
  });

  it("an unusable campaign id never queries", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    expect(await loadCampaignParent(client, "abc")).toEqual({ parentId: null, parentName: null });
    expect(await loadCampaignParent(client, 0)).toEqual({ parentId: null, parentName: null });
    expect(calls).toEqual([]);
  });

  it("a query error on read 1 is thrown with the campaign-parent prefix (the column may be missing before the migration)", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "column campaigns.parent_campaign_id does not exist" },
    });
    await expect(loadCampaignParent(client, 61)).rejects.toThrow(
      /^campaign-parent: column campaigns\.parent_campaign_id does not exist$/u
    );
  });

  it("a query error on read 2 is thrown with the same prefix, never hidden as a missing name", async () => {
    const { client } = fakeClient(OWN_WITH_PARENT, { data: null, error: { message: "permission denied" } });
    await expect(loadCampaignParent(client, 61)).rejects.toThrow(/^campaign-parent: permission denied$/u);
  });

  it("the query key prefix is the one the Basics sheet invalidates", () => {
    expect(CAMPAIGN_PARENT_QUERY_KEY).toBe("campaign-parent");
  });
});
