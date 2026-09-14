// @vitest-environment jsdom
/**
 * WP2.2 Stage 5 — `useAllocateWorkersToOu` (wp2.2.md §3.11 row 13): one
 * `structure_placements_assign` per call, `manual`, primary only for a
 * single worker, `p_on_conflict: "skip"` (D46); the result reports what
 * was inserted and what was skipped; the two invalidations are unchanged.
 * The only caller is the workforce bulk toolbar, which toasts
 * `res.inserted` and `err.message`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeStructureClient, type FakeStructureClient } from "./fake-structure-client";

const state = vi.hoisted(() => ({ fake: null as unknown as FakeStructureClient }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => state.fake.client,
  getKnownExpiryMs: () => Date.now() + 60 * 60 * 1000,
  refreshSessionViaServer: async () => ({ ok: true, expiresAt: null, reason: "ok" as const }),
}));

import { useAllocateWorkersToOu, type AllocateWorkersArgs, type AllocateWorkersResult } from "../use-allocate-workers-to-ou";

type Mutation = ReturnType<typeof useAllocateWorkersToOu>;

function Harness({ onReady }: { onReady: (m: Mutation) => void }) {
  onReady(useAllocateWorkersToOu("7"));
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

describe("useAllocateWorkersToOu through the structure API", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let queryClient: QueryClient;
  let latest: Mutation | null = null;

  async function mount() {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(m) => (latest = m)} />
        </QueryClientProvider>
      );
    });
    if (!latest) throw new Error("hook did not render");
    return latest;
  }

  async function run(mutation: Mutation, args: AllocateWorkersArgs) {
    const outcome: { result?: AllocateWorkersResult; error?: Error } = {};
    await act(async () => {
      mutation.mutate(args, {
        onSuccess: (result) => (outcome.result = result),
        onError: (error) => (outcome.error = error),
      });
    });
    await flush();
    return outcome;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    state.fake = createFakeStructureClient();
    latest = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    queryClient.clear();
  });

  it("bulk toolbar: several workers → one assign, not primary, skip on a same-group conflict", async () => {
    state.fake.answerRpc("structure_placements_assign", { data: { inserted: 2, moved: 0, skipped: 1, displaced: 0 } });
    const mutation = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const outcome = await run(mutation, { ouId: 20, workerIds: [105, 106, 112] });

    expect(state.fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_assign",
        args: {
          p_campaign_id: 7,
          p_ou_id: 20,
          p_worker_ids: [105, 106, 112],
          p_source: "manual",
          p_is_primary: false,
          p_on_conflict: "skip",
        },
      },
    ]);
    expect(outcome.result).toEqual({ inserted: 2, skipped: 1 });
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["campaign-worker-ou", "7"],
      ["campaign-ou-coverage", "7"],
    ]);
  });

  it("isPrimary applies to a single worker only", async () => {
    const mutation = await mount();
    await run(mutation, { ouId: 20, workerIds: [105], isPrimary: true });
    await run(mutation, { ouId: 20, workerIds: [105, 106], isPrimary: true });
    expect(state.fake.rpcCalls().map((c) => c.args.p_is_primary)).toEqual([true, false]);
  });

  it("an empty selection writes nothing", async () => {
    const mutation = await mount();
    const outcome = await run(mutation, { ouId: 20, workerIds: [] });
    expect(state.fake.rpcCalls()).toEqual([]);
    expect(outcome.result).toEqual({ inserted: 0, skipped: 0 });
  });

  it("a refusal reaches the caller's onError as the StructureApiError (the toolbar toasts err.message)", async () => {
    state.fake.answerRpc("structure_placements_assign", {
      error: { code: "P0001", message: "organising unit 10 is a group container without a group and cannot hold placements; assign workers to the units inside it" },
    });
    const mutation = await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const outcome = await run(mutation, { ouId: 10, workerIds: [105] });
    expect(outcome.result).toBeUndefined();
    expect(outcome.error).toMatchObject({ name: "StructureApiError", kind: "rule_violation" });
    expect(outcome.error?.message).toMatch(/group container/);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
