/**
 * WP3.8 — loading a campaign's parent once (wp3.8.md §3.5 "Loading
 * `parent_campaign_id` once").
 *
 * `loadCampaignParent(client, campaignId)` is the one read every reader of
 * §3.5 makes before its own query: server routes call it directly with their
 * server client; client components use `useCampaignParent(campaignId)` and gate
 * their query on `isSuccess`, so the first render already has the family rows.
 *
 * **No embed** (hotfix 2, wp3.8.md D40). `campaigns.parent_campaign_id` is a
 * self-referencing FK, and PostgREST resolves a relationship hint on such a
 * constraint in one direction only: the constraint-name hint
 * (`campaigns!campaigns_parent_campaign_id_fkey`) is refused outright (PGRST200,
 * D39), and the column hint (`campaigns!parent_campaign_id`) resolved on
 * production in the one-to-many direction — the campaign's CHILDREN, an array
 * — so the parent's name never arrived ("Part of campaign 64", "Shared from
 * parent campaign"). The direction cannot be proven against dev (anon has no
 * row access), so the ambiguity is designed out: two plain primary-key reads,
 * `parent_campaign_id` for the campaign, then `campaign_id, name` for the
 * parent when there is one. Nothing here names a relationship.
 *
 * Before the migration is on the target database the first select fails with
 * a PostgREST error — surfaced, never hidden. The app's clients are untyped
 * (`SupabaseClient<any>`), so the minimal `CampaignParentClient` shape below is
 * what both the real client and a test fake satisfy;
 * `packages/db-types/generated.ts` is not consulted (§3.9).
 */

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/** Read 1: the campaign's own row. No embed, no relationship hint (D40). */
export const CAMPAIGN_PARENT_SELECT = "parent_campaign_id";

/** Read 2: the parent's row, by primary key. */
export const CAMPAIGN_PARENT_NAME_SELECT = "campaign_id, name";

export const CAMPAIGN_PARENT_QUERY_KEY = "campaign-parent" as const;

export type CampaignParent = { parentId: number | null; parentName: string | null };

export const NO_PARENT: Readonly<CampaignParent> = Object.freeze({ parentId: null, parentName: null });

export interface CampaignParentQueryResult {
  data: unknown;
  error: { message: string } | null;
}

/**
 * The query chain the loader drives on `from("campaigns")` — the same shape
 * for both reads. Kept as its own type so a recording fake in the unit tests
 * is typed; the loader narrows to it internally.
 */
export interface CampaignParentQueryChain {
  select(columns: string): {
    eq(column: string, value: number): {
      maybeSingle(): PromiseLike<CampaignParentQueryResult>;
    };
  };
}

/**
 * The subset of the Supabase client `loadCampaignParent` needs: anything with
 * a PostgREST-style `from`. Both `SupabaseClient` flavours used in the app
 * satisfy it without a cast (pinned by a type-level check in
 * `__tests__/campaign-parent.test.ts`) — matching the generic builder chain
 * structurally instead makes tsc recurse (TS2589), which is why the return is
 * `unknown` here and narrowed inside, the way `StructureRpcClient` keeps to
 * `rpc` (structure-api.ts).
 */
export interface CampaignParentClient {
  from(table: string): unknown;
}

function normaliseId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function readCampaignRow(
  client: CampaignParentClient,
  columns: string,
  campaignId: number
): Promise<unknown> {
  const chain = client.from("campaigns") as CampaignParentQueryChain;
  const { data, error } = await chain.select(columns).eq("campaign_id", campaignId).maybeSingle();
  if (error) throw new Error(`campaign-parent: ${error.message}`);
  return data;
}

/**
 * `{ parentId, parentName }` for `campaignId`: one read when the campaign has
 * no parent (or does not exist — RLS hides nothing on `campaigns`, so "no row"
 * means "no such campaign"), two when it has one. `parentName` is null when
 * the parent row cannot be read or has a blank name. Throws on either query
 * error.
 */
export async function loadCampaignParent(
  client: CampaignParentClient,
  campaignId: number | string
): Promise<CampaignParent> {
  const id = normaliseId(campaignId);
  if (id === null) return { ...NO_PARENT };

  const own = await readCampaignRow(client, CAMPAIGN_PARENT_SELECT, id);
  const parentId = normaliseId((own as { parent_campaign_id?: unknown } | null)?.parent_campaign_id);
  if (parentId === null) return { ...NO_PARENT };

  const parent = await readCampaignRow(client, CAMPAIGN_PARENT_NAME_SELECT, parentId);
  const name = (parent as { name?: unknown } | null)?.name;
  return { parentId, parentName: typeof name === "string" && name.trim() ? name : null };
}

/**
 * `["campaign-parent", <id>]`, cached for five minutes; disabled (and keyed
 * `0`) for an unusable id so callers can still spread the key into their own.
 */
export function useCampaignParent(campaignId: number | string | null | undefined) {
  const supabase = createClient();
  const id = normaliseId(campaignId);
  return useQuery<CampaignParent>({
    queryKey: [CAMPAIGN_PARENT_QUERY_KEY, id ?? 0],
    enabled: id !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadCampaignParent(supabase, id ?? 0),
  });
}
