// @vitest-environment jsdom
/**
 * WP2.4 Stage 1 (wp2.4.md §3.7, §4.1) — `useMoveWorkersMutation` forwards
 * `withinGroupId` as `p_within_group_id` on the `toOuId: null` move (a drop
 * on a group's Unassigned card) and nowhere else; without it the legacy
 * strip-all call is byte-for-byte what WP2.2 Stage 4 pinned
 * (`wall-chart.structure-writes.test.tsx`, which is not edited).
 *
 * Same shape as `lib/hooks/__tests__/useRemoveWorkerFromCampaign.test.tsx`:
 * the recording fake client, no wall-chart harness.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeStructureClient, type FakeStructureClient } from "@/lib/campaign/__tests__/fake-structure-client";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeStructureClient,
  stamp: vi.fn(async () => 0),
  sync: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => state.fake.client,
  getKnownExpiryMs: () => Date.now() + 60 * 60 * 1000,
  refreshSessionViaServer: async () => ({ ok: true, expiresAt: null, reason: "ok" as const }),
}));
vi.mock("@/lib/workers/sync-campaign-universe", () => ({
  stampEmployerWorksiteFromOu: state.stamp,
  syncWorkersToMatchingCampaigns: state.sync,
}));

import { structureErrorMessage } from "@/lib/campaign/structure-error-message";
import { isLikelyAuthError } from "@/lib/supabase/session-recovery";

import { MoveStepError, useMoveWorkersMutation, type MoveWorkerResult, type MoveWorkerVars } from "../move-worker-mutation";

type Mutation = ReturnType<typeof useMoveWorkersMutation>;

function Harness({ onReady }: { onReady: (m: Mutation) => void }) {
  onReady(useMoveWorkersMutation("7"));
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

const MOVE_RESULT = { moved: 0, inserted: 0, displaced: 0, removed: 2, skipped: 0, parent_inserted: 0 };

describe("useMoveWorkersMutation — withinGroupId (WP2.4)", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let queryClient: QueryClient;
  let latest: Mutation | null = null;

  async function mount(): Promise<Mutation> {
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

  async function run(mutation: Mutation, vars: MoveWorkerVars): Promise<MoveWorkerResult> {
    let result: MoveWorkerResult | null = null;
    await act(async () => {
      result = await mutation.mutateAsync(vars);
    });
    await flush();
    if (!result) throw new Error("no result");
    return result;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    state.fake = createFakeStructureClient({
      tables: { campaign_organising_units: [{ unit_basis: null }] },
    });
    state.stamp.mockClear();
    state.sync.mockClear();
    latest = null;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    queryClient.clear();
  });

  it("a drop on a group's Unassigned card: one structure_placements_move with p_to_ou_id null and p_within_group_id set", async () => {
    state.fake.answerRpc("structure_placements_move", { data: MOVE_RESULT });
    const mutation = await mount();

    const result = await run(mutation, {
      refs: [
        { workerId: 1, fromOuId: 10 },
        { workerId: 2, fromOuId: 11 },
        { workerId: 1, fromOuId: 10 },
      ],
      toOuId: null,
      mode: "move",
      withinGroupId: 5,
    });

    expect(state.fake.rpcCalls()).toEqual([
      {
        kind: "rpc",
        name: "structure_placements_move",
        args: {
          p_campaign_id: 7,
          p_worker_ids: [1, 2],
          p_from_ou_id: null,
          p_to_ou_id: null,
          p_within_group_id: 5,
          p_keep_source: false,
          p_keep_in_parent: true,
        },
      },
    ]);
    expect(result).toEqual({ inserted: 0, deleted: 2, skipped: 0 });
    // No target unit: no stamping and no cross-campaign sync, as for the legacy unassign.
    expect(state.stamp).not.toHaveBeenCalled();
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("without withinGroupId the legacy strip-all call is unchanged (p_within_group_id null)", async () => {
    state.fake.answerRpc("structure_placements_move", { data: MOVE_RESULT });
    const mutation = await mount();

    await run(mutation, { refs: [{ workerId: 1, fromOuId: 10 }], toOuId: null, mode: "move" });

    expect(state.fake.rpcCalls()[0].args).toMatchObject({ p_to_ou_id: null, p_within_group_id: null });
  });

  it("withinGroupId is never forwarded with a target unit (the RPC refuses the pair), nor by a copy", async () => {
    state.fake.answerRpc("structure_placements_move", { data: { ...MOVE_RESULT, moved: 1, removed: 0 } });
    const mutation = await mount();

    await run(mutation, { refs: [{ workerId: 1, fromOuId: 10 }], toOuId: 11, mode: "move", withinGroupId: 5 });
    expect(state.fake.rpcCalls()).toHaveLength(1);
    expect(state.fake.rpcCalls()[0].args).toMatchObject({ p_from_ou_id: 10, p_to_ou_id: 11, p_within_group_id: null });

    const copy = await run(mutation, { refs: [{ workerId: 1, fromOuId: 10 }], toOuId: null, mode: "copy", withinGroupId: 5 });
    expect(copy).toEqual({ inserted: 0, deleted: 0, skipped: 1 });
    expect(state.fake.rpcCalls()).toHaveLength(1);
  });
  // ---------------------------------------------------------------------------
  // WP2.4c (wp2.4c.md §3.7 NX-a, §4.1) — the additive `steps`
  // ---------------------------------------------------------------------------

  it("steps run in order, one structure_placements_move each, and the refs loop does not run", async () => {
    for (let i = 0; i < 3; i++) state.fake.answerRpc("structure_placements_move", { data: { ...MOVE_RESULT, moved: 1, removed: 0 } });
    const mutation = await mount();

    // "Barrow area → Day": the parent row first, then the child row, then the
    // shift held under the old worksite (adds before removes).
    await run(mutation, {
      refs: [{ workerId: 1, fromOuId: 11 }],
      toOuId: 20,
      mode: "move",
      steps: [
        { kind: "move", toOuId: 10, fromOuId: 11, workerIds: [1, 2], keepInParent: true },
        { kind: "move", toOuId: 20, fromOuId: null, workerIds: [1, 2], keepInParent: true },
        { kind: "unassign", withinGroupId: 5, workerIds: [1] },
      ],
    });

    expect(state.fake.rpcCalls().map((c) => c.args)).toEqual([
      { p_campaign_id: 7, p_worker_ids: [1, 2], p_from_ou_id: 11, p_to_ou_id: 10, p_within_group_id: null, p_keep_source: false, p_keep_in_parent: true },
      { p_campaign_id: 7, p_worker_ids: [1, 2], p_from_ou_id: null, p_to_ou_id: 20, p_within_group_id: null, p_keep_source: false, p_keep_in_parent: true },
      { p_campaign_id: 7, p_worker_ids: [1], p_from_ou_id: null, p_to_ou_id: null, p_within_group_id: 5, p_keep_source: false, p_keep_in_parent: true },
    ]);
    expect(state.fake.rpcCalls()).toHaveLength(3);
  });

  it("the stamping and the reverse sync run once, after the last step", async () => {
    for (let i = 0; i < 2; i++) state.fake.answerRpc("structure_placements_move", { data: MOVE_RESULT });
    const mutation = await mount();

    await run(mutation, {
      refs: [{ workerId: 1, fromOuId: null }],
      toOuId: 20,
      mode: "move",
      steps: [
        { kind: "move", toOuId: 10, fromOuId: null, workerIds: [1], keepInParent: true },
        { kind: "move", toOuId: 20, fromOuId: null, workerIds: [1], keepInParent: true },
      ],
    });

    expect(state.sync).toHaveBeenCalledTimes(1);
    expect(state.fake.trace()).toEqual([
      "rpc:structure_placements_move",
      "rpc:structure_placements_move",
      "from:campaign_organising_units.select.eq.maybeSingle",
    ]);
  });

  it("a refusal on step 2 stops the run and rejects with the step index and the structure sentence", async () => {
    state.fake.answerRpc("structure_placements_move", { data: MOVE_RESULT });
    state.fake.answerRpc("structure_placements_move", {
      error: { message: "organising unit 21 is a group container", code: "P0001", details: null, hint: null },
    });
    const mutation = await mount();

    let error: unknown = null;
    await act(async () => {
      try {
        await mutation.mutateAsync({
          refs: [{ workerId: 1, fromOuId: null }],
          toOuId: 20,
          mode: "move",
          steps: [
            { kind: "move", toOuId: 10, fromOuId: null, workerIds: [1], keepInParent: true },
            { kind: "move", toOuId: 20, fromOuId: null, workerIds: [1], keepInParent: true },
            { kind: "unassign", withinGroupId: 5, workerIds: [1] },
          ],
        });
      } catch (err) {
        error = err;
      }
    });
    await flush();

    expect(error).toBeInstanceOf(MoveStepError);
    const stepError = error as MoveStepError;
    expect(stepError.stepIndex).toBe(2);
    expect(stepError.stepCount).toBe(3);
    expect(stepError.message).toBe(
      "Step 2 of 3 failed: Not allowed by the unit structure rules: organising unit 21 is a group container. The chart shows what was saved."
    );
    expect(structureErrorMessage(stepError, "Moving the worker failed.")).toBe(stepError.message);
    // The third step is never issued, and nothing is stamped or synced.
    expect(state.fake.rpcCalls()).toHaveLength(2);
    expect(state.stamp).not.toHaveBeenCalled();
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("MoveStepError keeps the refusal's status/code, so the auth-aware retry still fires (A-1)", () => {
    const authRefusal = Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" });
    const wrapped = new MoveStepError(2, 3, authRefusal);
    expect(wrapped.status).toBe(401);
    expect(wrapped.code).toBe("PGRST301");
    expect(wrapped.cause).toBe(authRefusal);
    expect(isLikelyAuthError(wrapped)).toBe(true);
    // The sentence is still §3.13's.
    expect(wrapped.message).toBe("Step 2 of 3 failed: JWT expired. The chart shows what was saved.");
    // A structure refusal is not an auth error and is not retried.
    expect(isLikelyAuthError(new MoveStepError(1, 2, new Error("Not allowed by the unit structure rules")))).toBe(false);
  });

  it("an empty steps list leaves the WP2.4 refs path in charge", async () => {
    state.fake.answerRpc("structure_placements_move", { data: MOVE_RESULT });
    const mutation = await mount();

    await run(mutation, { refs: [{ workerId: 1, fromOuId: 10 }], toOuId: null, mode: "move", withinGroupId: 5, steps: [] });

    expect(state.fake.rpcCalls()).toHaveLength(1);
    expect(state.fake.rpcCalls()[0].args).toMatchObject({ p_to_ou_id: null, p_within_group_id: 5 });
  });
});
