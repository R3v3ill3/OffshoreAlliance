/**
 * WP2.3 Stage 0 — jsdom mount harness for the full wall-chart tree.
 *
 * The harness knows nothing about the component under test: the test passes it
 * in, so the same harness pins the monolith today and the decomposed shell
 * afterwards. It owns the environment (shims, act, localStorage, the
 * QueryClient) and the two guarantees the characterisation depends on:
 *
 *   1. every enabled query settles as `success` before the caller sees the DOM;
 *   2. an unseeded query, table or API route throws with the key that was missed.
 *
 * `vi.mock` lives in the test files, not here — this module is plain code.
 */

import type { ComponentType } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import { installBackend, resetBackend, setSearchParams } from "./backend";
import type { WallChartFixture } from "./fixture";
import { createWallChartQueryClient, enabledQueries } from "./query-client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export type WallChartComponent = ComponentType<{ campaignId: string; canWrite: boolean }>;

export type MountWallChartOptions = {
  Component: WallChartComponent;
  fixture: WallChartFixture;
  canWrite?: boolean;
  /** Query string seen by the mocked `useSearchParams`, e.g. `"buildList=1"`. */
  search?: string;
  /** Seeded before mount, e.g. `{ "wallchart:displayMode:1": "count" }`. */
  localStorage?: Record<string, string>;
};

export type MountedWallChart = {
  container: HTMLElement;
  queryClient: QueryClient;
  /** Force a server round-trip for one query and flush the resulting render. */
  refetch: (queryKey: readonly unknown[]) => Promise<void>;
  /**
   * Publish new data for one cached query and flush the resulting render, the
   * way a background refetch or an invalidation-driven update would. Used to
   * refresh a query whose `queryFn` would otherwise return the fixture
   * unchanged, so the test can tell a re-render apart from a no-op.
   */
  setQueryData: <T>(queryKey: readonly unknown[], updater: (previous: T) => T) => Promise<void>;
  unmount: () => void;
};

let shimmed = false;

/**
 * jsdom has no layout engine, so the APIs Radix and the overlay reach for are
 * absent rather than merely inert. These shims are the smallest set that lets
 * the real components mount; each returns a fixed zero-size answer, which keeps
 * the rendered output deterministic.
 *
 * `IntersectionObserver` is deliberately NOT shimmed: without it the summary
 * sentinel effect bails and `isSummaryStuck` stays false, which is the state
 * the snapshots pin.
 */
function installJsdomShims(): void {
  if (shimmed) return;
  shimmed = true;

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  if (!("ResizeObserver" in globalThis)) {
    class FakeResizeObserver implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = FakeResizeObserver;
  }

  const win = window as Window & { matchMedia?: typeof window.matchMedia };
  if (typeof win.matchMedia !== "function") {
    win.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView ??= function scrollIntoView(): void {};
  proto.hasPointerCapture ??= function hasPointerCapture(): boolean {
    return false;
  };
  proto.setPointerCapture ??= function setPointerCapture(): void {};
  proto.releasePointerCapture ??= function releasePointerCapture(): void {};
}

function assertQueriesSettled(queryClient: QueryClient): void {
  const bad = enabledQueries(queryClient).filter((q) => q.status !== "success");
  if (bad.length > 0) {
    const detail = bad
      .map((q) => `  ${q.status.padEnd(7)} ${q.key}${q.error ? ` -> ${q.error}` : ""}`)
      .join("\n");
    throw new Error(`Enabled queries did not settle as success:\n${detail}`);
  }
}

/** Flush microtasks and React effects until the cache stops changing. */
async function settle(queryClient: QueryClient): Promise<void> {
  let previous = "";
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const snapshot = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => `${JSON.stringify(q.queryKey)}:${q.state.status}:${q.state.dataUpdatedAt}`)
      .sort()
      .join("|");
    const fetching = queryClient.isFetching() > 0;
    if (!fetching && snapshot === previous) return;
    previous = snapshot;
  }
  throw new Error("Wall chart never reached a quiescent query state");
}

export async function mountWallChart(
  options: MountWallChartOptions
): Promise<MountedWallChart> {
  installJsdomShims();

  window.localStorage.clear();
  for (const [key, value] of Object.entries(options.localStorage ?? {})) {
    window.localStorage.setItem(key, value);
  }

  installBackend(options.fixture);
  setSearchParams(options.search ?? "");

  const container = document.createElement("div");
  document.body.appendChild(container);

  const queryClient = createWallChartQueryClient();
  const { Component } = options;
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <Component campaignId={options.fixture.campaignId} canWrite={options.canWrite ?? true} />
      </QueryClientProvider>
    );
  });

  await settle(queryClient);
  assertQueriesSettled(queryClient);

  return {
    container,
    queryClient,
    refetch: async (queryKey) => {
      const existing = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!existing) {
        throw new Error(`No cached query to refetch: ${JSON.stringify(queryKey)}`);
      }
      await act(async () => {
        await queryClient.refetchQueries({ queryKey, exact: true });
      });
      await settle(queryClient);
      assertQueriesSettled(queryClient);
    },
    setQueryData: async (queryKey, updater) => {
      const existing = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!existing) {
        throw new Error(`No cached query to update: ${JSON.stringify(queryKey)}`);
      }
      await act(async () => {
        queryClient.setQueryData(queryKey, updater);
        await Promise.resolve();
      });
      await settle(queryClient);
      assertQueriesSettled(queryClient);
    },
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
      queryClient.clear();
      resetBackend();
    },
  };
}

/** Dispatch a real bubbling event and flush the resulting render. */
export async function fire(target: Element, event: Event): Promise<void> {
  await act(async () => {
    target.dispatchEvent(event);
    await Promise.resolve();
  });
}

export async function click(
  target: Element,
  init: MouseEventInit = {}
): Promise<void> {
  await fire(
    target,
    new window.MouseEvent("click", { bubbles: true, cancelable: true, ...init })
  );
}

export async function contextMenu(target: Element): Promise<void> {
  await fire(
    target,
    new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })
  );
}

export async function keydown(
  target: Element,
  key: string,
  init: KeyboardEventInit = {}
): Promise<void> {
  await fire(
    target,
    new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init })
  );
}

/**
 * jsdom implements neither `DragEvent` nor `DataTransfer`, so we dispatch
 * `MouseEvent`s carrying a minimal `dataTransfer` shim. The product only ever
 * calls `setData` / `getData` / `types` / `effectAllowed` / `dropEffect`, which
 * is exactly what this provides.
 */
export function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    dropEffect: "none",
    effectAllowed: "all",
    get types(): readonly string[] {
      return [...store.keys()];
    },
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    getData: (format: string) => store.get(format) ?? "",
    clearData: (format?: string) => {
      if (format) store.delete(format);
      else store.clear();
    },
    setDragImage: () => {},
    items: [],
    files: [],
  };
  return dt as unknown as DataTransfer;
}

function dragEvent(type: string, dataTransfer: DataTransfer, init: MouseEventInit): Event {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer, configurable: true });
  return event;
}

/**
 * `dragstart` on the source (so the product writes its own payload), then
 * `dragover` + `drop` on the target carrying the same `dataTransfer`.
 * `shiftKey: true` is how the product distinguishes copy from move.
 */
export async function dragAndDrop(
  source: Element,
  target: Element,
  init: MouseEventInit = {}
): Promise<DataTransfer> {
  const dataTransfer = createDataTransfer();
  await fire(source, dragEvent("dragstart", dataTransfer, init));
  await fire(target, dragEvent("dragover", dataTransfer, init));
  await fire(target, dragEvent("drop", dataTransfer, init));
  return dataTransfer;
}
