// @vitest-environment jsdom
/**
 * WP2.4 Stage 1 (wp2.4.md §3.11 PR-a, §4.1) — `useUserCampaignPrefs`: the
 * read chain (`select("prefs").eq("campaign_id", id).maybeSingle()`), the
 * upsert payload (`{ user_id, campaign_id, prefs }` on
 * `user_id,campaign_id`) with the last-read document merged so foreign keys
 * survive, the 400 ms debounce, writes queued until the document is known,
 * and a refused write that toasts once and keeps the in-memory state.
 *
 * The recording fake client, as in `useRemoveWorkerFromCampaign.test.tsx`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeStructureClient, type FakeStructureClient } from "@/lib/campaign/__tests__/fake-structure-client";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeStructureClient,
  user: { id: "user-1" } as { id: string } | null,
  toastError: vi.fn<(message: string) => void>(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => state.fake.client,
  getKnownExpiryMs: () => Date.now() + 60 * 60 * 1000,
  refreshSessionViaServer: async () => ({ ok: true, expiresAt: null, reason: "ok" as const }),
}));
vi.mock("@/lib/supabase/auth-context", () => ({
  useAuth: () => ({ user: state.user }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: state.toastError, info: vi.fn(), warning: vi.fn() },
}));

import {
  PREFS_READ_FAILED_MESSAGE,
  PREFS_WRITE_DEBOUNCE_MS,
  PREFS_WRITE_FAILED_MESSAGE,
  useUserCampaignPrefs,
  userCampaignPrefsQueryKey,
  type UseUserCampaignPrefsResult,
} from "../useUserCampaignPrefs";

function Harness({ onRender }: { onRender: (r: UseUserCampaignPrefsResult) => void }) {
  onRender(useUserCampaignPrefs("7"));
  return null;
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await flush(2);
}

const STORED = {
  compare: { groupIds: [1, 2] },
  layout: "list",
  wallChart: { v: 1, group: 3, hiddenOuIds: [9], reservedByLater: true },
};

function upserts() {
  return state.fake
    .fromCalls()
    .filter((c) => c.table === "user_campaign_prefs" && c.ops.some((o) => o.method === "upsert"))
    .map((c) => c.ops.find((o) => o.method === "upsert")!.args);
}

/**
 * A1: the same recording fake, but every `upsert` returns a promise the test
 * resolves by hand, so two concurrent writes can be completed out of order.
 */
function deferredUpserts(fake: FakeStructureClient) {
  const pending: Array<{ args: unknown[]; resolve: () => void }> = [];
  const client = {
    from(table: string) {
      const chain = fake.client.from(table) as unknown as Record<string, unknown> & {
        upsert: (...args: unknown[]) => unknown;
      };
      const original = chain.upsert.bind(chain);
      chain.upsert = (...args: unknown[]) => {
        original(...args); // recorded like any other call
        let resolve!: () => void;
        const done = new Promise<{ data: null; error: null }>((r) => {
          resolve = () => r({ data: null, error: null });
        });
        pending.push({ args, resolve });
        return { then: done.then.bind(done) };
      };
      return chain;
    },
    rpc: fake.client.rpc,
  };
  return { client, pending };
}

describe("useUserCampaignPrefs", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let queryClient: QueryClient;
  let latest: UseUserCampaignPrefsResult | null = null;

  async function mount(): Promise<void> {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onRender={(r) => (latest = r)} />
        </QueryClientProvider>
      );
    });
    await flush();
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    state.user = { id: "user-1" };
    state.fake = createFakeStructureClient({ tables: { user_campaign_prefs: [{ prefs: STORED }] } });
    state.toastError.mockReset();
    latest = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    queryClient.clear();
  });

  it("reads the caller's row for the campaign and parses the wallChart key", async () => {
    await mount();
    const reads = state.fake.fromCalls().filter((c) => c.table === "user_campaign_prefs");
    expect(reads).toHaveLength(1);
    expect(reads[0].ops).toEqual([
      { method: "select", args: ["prefs"] },
      { method: "eq", args: ["campaign_id", 7] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(latest?.isLoaded).toBe(true);
    expect(latest?.wallChart).toEqual({ v: 1, group: 3, hiddenOuIds: [9] });
    expect(queryClient.getQueryData(userCampaignPrefsQueryKey(7))).toEqual(STORED);
  });

  it("a missing row reads as an empty document; no user means no read", async () => {
    state.fake = createFakeStructureClient({ tables: { user_campaign_prefs: [] } });
    await mount();
    expect(latest?.isLoaded).toBe(true);
    expect(latest?.wallChart).toEqual({ v: 1 });

    act(() => root?.unmount());
    state.user = null;
    state.fake = createFakeStructureClient({ tables: { user_campaign_prefs: [{ prefs: STORED }] } });
    await mount();
    expect(state.fake.fromCalls()).toEqual([]);
    expect(latest?.isLoaded).toBe(false);
  });

  it("an immediate write upserts the last-read document with the patch merged in, keeping every foreign key, and updates the cache", async () => {
    await mount();
    act(() => latest!.setWallChart({ group: "none", showEmptyUnits: true }));
    await flush();

    expect(upserts()).toEqual([
      [
        {
          user_id: "user-1",
          campaign_id: 7,
          prefs: {
            compare: { groupIds: [1, 2] },
            layout: "list",
            wallChart: { v: 1, group: "none", hiddenOuIds: [9], reservedByLater: true, showEmptyUnits: true },
          },
        },
        { onConflict: "user_id,campaign_id" },
      ],
    ]);
    expect(latest?.wallChart).toEqual({ v: 1, group: "none", hiddenOuIds: [9], showEmptyUnits: true });
    expect((queryClient.getQueryData(userCampaignPrefsQueryKey(7)) as { wallChart: { group: unknown } }).wallChart.group).toBe("none");
    expect(state.toastError).not.toHaveBeenCalled();
  });

  it("debounced writes coalesce into one upsert after the window; the UI reads the new value at once", async () => {
    await mount();
    act(() => latest!.setWallChart({ sort: "first_name" }, { debounce: true }));
    expect(latest?.wallChart.sort).toBe("first_name");
    act(() => latest!.setWallChart({ sortFactFieldId: 4 }, { debounce: true }));
    await wait(PREFS_WRITE_DEBOUNCE_MS / 2);
    expect(upserts()).toEqual([]);
    await wait(PREFS_WRITE_DEBOUNCE_MS);
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0][0]).toMatchObject({
      prefs: { wallChart: { v: 1, group: 3, sort: "first_name", sortFactFieldId: 4 } },
    });
  });

  it("an immediate write flushes a pending debounced patch with it (one upsert)", async () => {
    await mount();
    act(() => latest!.setWallChart({ sort: "occupation" }, { debounce: true }));
    act(() => latest!.setWallChart({ overlay: true }));
    await flush();
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0][0]).toMatchObject({ prefs: { wallChart: { sort: "occupation", overlay: true } } });
    await wait(PREFS_WRITE_DEBOUNCE_MS + 50);
    expect(upserts()).toHaveLength(1);
  });

  it("a write made before the document is known is applied in memory at once and written once the read lands", async () => {
    // A slow read: the fake resolves synchronously, so hold the query back by disabling the user until after the patch.
    state.user = null;
    await mount();
    expect(latest?.isLoaded).toBe(false);
    act(() => latest!.setWallChart({ group: 5 }));
    expect(latest?.wallChart.group).toBe(5);
    expect(upserts()).toEqual([]);

    // The user arrives; the read runs, then the queued patch is written over the stored document.
    state.user = { id: "user-1" };
    act(() => latest!.setWallChart({}, { debounce: true })); // any state change re-renders with the user present
    await wait(PREFS_WRITE_DEBOUNCE_MS + 50);
    expect(latest?.isLoaded).toBe(true);
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0][0]).toEqual({
      user_id: "user-1",
      campaign_id: 7,
      prefs: { ...STORED, wallChart: { ...STORED.wallChart, group: 5 } },
    });
  });

  it("a refused write toasts once, the in-memory state stays in force, and the next write re-sends the refused patch", async () => {
    await mount();
    state.fake = createFakeStructureClient({
      tables: { user_campaign_prefs: [{ prefs: STORED }] },
      errors: { user_campaign_prefs: { code: "42501", message: "new row violates row-level security policy" } },
    });
    act(() => latest!.setWallChart({ group: "none" }));
    await flush();
    act(() => latest!.setWallChart({ overlay: true }));
    await flush();

    expect(state.toastError).toHaveBeenCalledTimes(1);
    expect(state.toastError).toHaveBeenCalledWith(PREFS_WRITE_FAILED_MESSAGE);
    expect(latest?.wallChart).toMatchObject({ group: "none", overlay: true });
    expect(latest?.isError).toBe(false);
    // A5: the second upsert carries the refused `group: "none"` as well as its own patch.
    expect(upserts()).toHaveLength(2);
    expect(upserts()[1][0]).toEqual({
      user_id: "user-1",
      campaign_id: 7,
      prefs: { ...STORED, wallChart: { ...STORED.wallChart, group: "none", overlay: true } },
    });
  });

  it("A1: two concurrent writes resolving in reverse order leave the cache and the next upsert carrying both patches", async () => {
    await mount();
    const deferred = deferredUpserts(state.fake);
    state.fake = { ...state.fake, client: deferred.client as unknown as FakeStructureClient["client"] };
    act(() => latest!.setWallChart({ displayMode: "count" }));
    await flush(2);
    act(() => latest!.setWallChart({ showEmptyUnits: true }));
    await flush(2);
    expect(deferred.pending).toHaveLength(2);
    // Every in-flight upsert carries the whole overlay so far.
    expect((deferred.pending[1].args[0] as { prefs: { wallChart: unknown } }).prefs.wallChart).toEqual({
      ...STORED.wallChart,
      displayMode: "count",
      showEmptyUnits: true,
    });

    // The SECOND response lands first, then the first (older) one.
    deferred.pending[1].resolve();
    await flush();
    deferred.pending[0].resolve();
    await flush();

    const cached = queryClient.getQueryData(userCampaignPrefsQueryKey(7)) as { wallChart: Record<string, unknown> };
    expect(cached.wallChart).toMatchObject({ displayMode: "count", showEmptyUnits: true });
    expect(latest?.wallChart).toMatchObject({ displayMode: "count", showEmptyUnits: true });

    act(() => latest!.setWallChart({ overlay: true }));
    await flush(2);
    expect(deferred.pending).toHaveLength(3);
    expect((deferred.pending[2].args[0] as { prefs: { wallChart: unknown } }).prefs.wallChart).toEqual({
      ...STORED.wallChart,
      displayMode: "count",
      showEmptyUnits: true,
      overlay: true,
    });
    deferred.pending[2].resolve();
    await flush();
    expect(state.toastError).not.toHaveBeenCalled();
  });

  it("A2: a failed read reports isError, toasts once, and keeps every write queued rather than writing over an unknown document", async () => {
    state.fake = createFakeStructureClient({
      tables: { user_campaign_prefs: [{ prefs: STORED }] },
      errors: { user_campaign_prefs: { code: "PGRST301", message: "connection refused" } },
    });
    await mount();
    // useQuery retries once (retryDelay 1 s) before it settles as an error.
    await wait(1300);
    expect(latest?.isError).toBe(true);
    expect(latest?.isLoaded).toBe(false);
    expect(latest?.isLoading).toBe(false);
    expect(state.toastError).toHaveBeenCalledTimes(1);
    expect(state.toastError).toHaveBeenCalledWith(PREFS_READ_FAILED_MESSAGE);

    act(() => latest!.setWallChart({ group: "none" }));
    await flush();
    act(() => latest!.setWallChart({ overlay: true }, { debounce: true }));
    await wait(PREFS_WRITE_DEBOUNCE_MS + 50);
    expect(latest?.wallChart).toMatchObject({ group: "none", overlay: true });
    expect(upserts()).toEqual([]);
    expect(state.toastError).toHaveBeenCalledTimes(1);
  });

  it("A5 (D6): unmounting with a debounced change pending sends it at once", async () => {
    await mount();
    act(() => latest!.setWallChart({ sort: "occupation" }, { debounce: true }));
    expect(upserts()).toEqual([]);
    act(() => root?.unmount());
    root = null;
    await flush();
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0][0]).toEqual({
      user_id: "user-1",
      campaign_id: 7,
      prefs: { ...STORED, wallChart: { ...STORED.wallChart, sort: "occupation" } },
    });
  });
});
