// @vitest-environment jsdom
/**
 * WP2.2 Stage 5 — `useRemoveWorkerFromCampaign` (wp2.2.md §3.11 row 12):
 * the worker's placements go through ONE `structure_placements_unassign`
 * (no unit, no group = every placement in the campaign), issued BEFORE the
 * membership delete, which stays a counted PostgREST delete. The success
 * toast, the error toast, the `onRemoved` callback and the `onSettled`
 * invalidations are pinned as they were.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeStructureClient, type FakeStructureClient } from "@/lib/campaign/__tests__/fake-structure-client";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeStructureClient,
  toastSuccess: vi.fn<(message: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => state.fake.client,
  getKnownExpiryMs: () => Date.now() + 60 * 60 * 1000,
  refreshSessionViaServer: async () => ({ ok: true, expiresAt: null, reason: "ok" as const }),
}));
vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: state.toastError, info: vi.fn(), warning: vi.fn() },
}));

import { useRemoveWorkerFromCampaign, type RemovalOptions } from "../useRemoveWorkerFromCampaign";

type Mutation = ReturnType<typeof useRemoveWorkerFromCampaign>;

function Harness({ onReady, onRemoved }: { onReady: (m: Mutation) => void; onRemoved?: () => void }) {
  const mutation = useRemoveWorkerFromCampaign({ campaignId: "7", workerId: 105, workerName: "Eve Evans", onRemoved });
  onReady(mutation);
  return null;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("useRemoveWorkerFromCampaign through the structure API", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let queryClient: QueryClient;
  let latest: Mutation | null = null;

  async function mount(opts: { onRemoved?: () => void } = {}) {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(m) => (latest = m)} onRemoved={opts.onRemoved} />
        </QueryClientProvider>
      );
    });
    if (!latest) throw new Error("hook did not render");
    return latest;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    state.fake = createFakeStructureClient({
      tables: { worker_campaign_connections: [{ connection_id: 900 }], call_lists: [] },
      counts: { campaign_worker_membership: 1 },
    });
    state.toastSuccess.mockReset();
    state.toastError.mockReset();
    latest = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    queryClient.clear();
  });

  it("issues one structure_placements_unassign for every placement, then the counted membership delete", async () => {
    state.fake.answerRpc("structure_placements_unassign", { data: { removed: 2 } });
    const onRemoved = vi.fn();
    const mutation = await mount({ onRemoved });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      mutation.mutate({ reasonCode: "removed_from_campaign" } satisfies RemovalOptions);
    });
    await flush();

    expect(state.fake.trace()).toEqual([
      "from:worker_campaign_connections.select.eq.eq.maybeSingle",
      "rpc:structure_placements_unassign",
      "from:campaign_worker_membership.delete.eq.eq",
      "from:call_lists.select.eq",
      "from:worker_activity_log.insert",
    ]);
    expect(state.fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_unassign",
        args: { p_campaign_id: 7, p_worker_ids: [105], p_ou_id: null, p_within_group_id: null },
      },
    ]);
    const membershipDelete = state.fake.fromCalls().find((c) => c.table === "campaign_worker_membership")!;
    expect(membershipDelete.ops).toEqual([
      { method: "delete", args: [{ count: "exact" }] },
      { method: "eq", args: ["campaign_id", 7] },
      { method: "eq", args: ["worker_id", 105] },
    ]);
    expect(state.toastSuccess).toHaveBeenCalledWith("Eve Evans removed from campaign.");
    expect(state.toastError).not.toHaveBeenCalled();
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["campaign-members-full", "7"],
      ["campaign-members", "7"],
      ["campaign-worker-ou", "7"],
      ["campaign-list-builder-workers", 7],
      ["campaign-ou-coverage", "7"],
      ["campaign-rating-summary", "7"],
      ["workers"],
      ["call-list-items"],
    ]);
  });

  it("uses the per-mutate worker id (the dialler) and passes it to the RPC", async () => {
    const mutation = await mount();
    await act(async () => {
      mutation.mutate({ reasonCode: "no_longer_in_universe", workerId: 108, workerName: "Hugo Hall" });
    });
    await flush();
    expect(state.fake.rpcCalls()[0].args).toEqual({ p_campaign_id: 7, p_worker_ids: [108], p_ou_id: null, p_within_group_id: null });
    expect(state.toastSuccess).toHaveBeenCalledWith("Hugo Hall removed from campaign.");
  });

  it("a refused unassign (42501) is a visible error toast and the membership delete never runs", async () => {
    state.fake.answerRpc("structure_placements_unassign", {
      error: { code: "42501", message: "no write permission on campaign 7" },
    });
    const onRemoved = vi.fn();
    const mutation = await mount({ onRemoved });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      mutation.mutate({ reasonCode: "removed_from_campaign" });
    });
    await flush();

    expect(state.fake.trace()).toEqual([
      "from:worker_campaign_connections.select.eq.eq.maybeSingle",
      "rpc:structure_placements_unassign",
    ]);
    expect(state.toastError).toHaveBeenCalledWith("You don't have permission to change this campaign's units.");
    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
    // onSettled still refetches so the panel shows the real state.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaign-worker-ou", "7"] });
  });

  it("a worker in no unit is fine (removed: 0), and a missing membership row is then the loud check", async () => {
    state.fake = createFakeStructureClient({
      tables: { worker_campaign_connections: [], call_lists: [] },
      counts: { campaign_worker_membership: 0 },
    });
    const mutation = await mount();
    await act(async () => {
      mutation.mutate({ reasonCode: "removed_from_campaign" });
    });
    await flush();
    expect(state.fake.trace()).toEqual([
      "from:worker_campaign_connections.select.eq.eq.maybeSingle",
      "rpc:structure_placements_unassign",
      "from:campaign_worker_membership.delete.eq.eq",
    ]);
    expect(state.toastError).toHaveBeenCalledWith(
      "Removing the worker from the campaign: nothing changed. You may not have permission to change this campaign, or the data changed since you loaded it. Refresh and try again."
    );
  });

  it("unit rows removed but no membership row: warns and succeeds, as before", async () => {
    state.fake = createFakeStructureClient({
      tables: { worker_campaign_connections: [], call_lists: [] },
      counts: { campaign_worker_membership: 0 },
    });
    state.fake.answerRpc("structure_placements_unassign", { data: { removed: 1 } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mutation = await mount();
    await act(async () => {
      mutation.mutate({ reasonCode: "removed_from_campaign" });
    });
    await flush();
    expect(warn).toHaveBeenCalledWith(
      "useRemoveWorkerFromCampaign: worker 105 had 1 unit row(s) on campaign 7 but no campaign_worker_membership row; unit rows removed, nothing else to delete."
    );
    expect(state.toastSuccess).toHaveBeenCalledWith("Eve Evans removed from campaign.");
    warn.mockRestore();
  });
});
