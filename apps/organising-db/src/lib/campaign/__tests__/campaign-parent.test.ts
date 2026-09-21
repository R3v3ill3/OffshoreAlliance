/**
 * WP3.8 loader tests (docs/organiser-ux-review/wp/wp3.8.md §4.1): the loader's
 * select string, the FK-named embed, and its null handling — a fake client
 * returning `{ parent_campaign_id: null }`, a row with an embedded parent, an
 * array-shaped embed, no row, and a query error. Node only, no database; the
 * browser client module is mocked so the hook's import does not touch it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    throw new Error("createClient must not be called by the loader tests");
  },
}));

import {
  CAMPAIGN_PARENT_QUERY_KEY,
  CAMPAIGN_PARENT_SELECT,
  NO_PARENT,
  loadCampaignParent,
  parseCampaignParent,
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

function fakeClient(result: CampaignParentQueryResult): { client: CampaignParentClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
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

describe("loadCampaignParent (wp3.8.md §3.5)", () => {
  it("selects parent_campaign_id and the embed through campaigns_parent_campaign_id_fkey, by campaign_id, maybeSingle", async () => {
    const { client, calls } = fakeClient({ data: { parent_campaign_id: null, parent: null }, error: null });
    await loadCampaignParent(client, 61);
    expect(calls).toEqual([
      {
        table: "campaigns",
        select: "parent_campaign_id, parent:campaigns!campaigns_parent_campaign_id_fkey(campaign_id, name)",
        eq: ["campaign_id", 61],
        maybeSingle: true,
      },
    ]);
    expect(CAMPAIGN_PARENT_SELECT).toContain("campaigns!campaigns_parent_campaign_id_fkey");
  });

  it("no parent → { null, null }", async () => {
    const { client } = fakeClient({ data: { parent_campaign_id: null, parent: null }, error: null });
    expect(await loadCampaignParent(client, "61")).toEqual({ parentId: null, parentName: null });
  });

  it("an embedded parent object → its id and name", async () => {
    const { client } = fakeClient({
      data: { parent_campaign_id: 64, parent: { campaign_id: 64, name: "ROV sector wide" } },
      error: null,
    });
    expect(await loadCampaignParent(client, 61)).toEqual({ parentId: 64, parentName: "ROV sector wide" });
  });

  it("an array-shaped embed → the first element", async () => {
    const { client } = fakeClient({
      data: { parent_campaign_id: "64", parent: [{ campaign_id: "64", name: "ROV sector wide" }] },
      error: null,
    });
    expect(await loadCampaignParent(client, 61)).toEqual({ parentId: 64, parentName: "ROV sector wide" });
  });

  it("a parent id without a usable embed → the id with no name", async () => {
    const { client } = fakeClient({ data: { parent_campaign_id: 64, parent: [] }, error: null });
    expect(await loadCampaignParent(client, 61)).toEqual({ parentId: 64, parentName: null });
    const blank = fakeClient({ data: { parent_campaign_id: 64, parent: { campaign_id: 64, name: "   " } }, error: null });
    expect(await loadCampaignParent(blank.client, 61)).toEqual({ parentId: 64, parentName: null });
  });

  it("no row (unknown campaign) → { null, null }", async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await loadCampaignParent(client, 999)).toEqual({ parentId: null, parentName: null });
  });

  it("an unusable campaign id never queries", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    expect(await loadCampaignParent(client, "abc")).toEqual({ parentId: null, parentName: null });
    expect(await loadCampaignParent(client, 0)).toEqual({ parentId: null, parentName: null });
    expect(calls).toEqual([]);
  });

  it("a query error is thrown, never hidden (the column may be missing before the migration)", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'column campaigns.parent_campaign_id does not exist' },
    });
    await expect(loadCampaignParent(client, 61)).rejects.toThrow(/parent_campaign_id does not exist/u);
  });
});

describe("parseCampaignParent", () => {
  it("returns a fresh copy of NO_PARENT for nothing", () => {
    const a = parseCampaignParent(null);
    expect(a).toEqual(NO_PARENT);
    expect(a).not.toBe(NO_PARENT);
    expect(parseCampaignParent(undefined)).toEqual(NO_PARENT);
    expect(parseCampaignParent("x")).toEqual(NO_PARENT);
  });

  it("ignores an embed whose id disagrees with parent_campaign_id", () => {
    expect(parseCampaignParent({ parent_campaign_id: 64, parent: { campaign_id: 65, name: "Other" } })).toEqual({
      parentId: 64,
      parentName: null,
    });
  });

  it("the query key prefix is the one the Basics sheet invalidates", () => {
    expect(CAMPAIGN_PARENT_QUERY_KEY).toBe("campaign-parent");
  });
});
