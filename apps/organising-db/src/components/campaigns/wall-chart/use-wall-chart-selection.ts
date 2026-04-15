"use client";

import { useCallback, useState } from "react";

/**
 * Multi-select state for the wall chart. Scoped to a single CampaignWallChart
 * instance — no global context needed.
 *
 * A selection entry is a (ouId, workerId) pair, because the same worker can
 * appear in multiple unit cards (multi-unit membership). We key by
 * `${ouId}:${workerId}` to avoid confusing "move this worker from unit A" vs
 * "from unit B" when the worker sits in both.
 */

export type SelectionKey = string; // `${ouId}:${workerId}` ; ou "u" = unassigned
export type SelectedRef = { ouId: number | null; workerId: number };

export function makeKey(ouId: number | null, workerId: number): SelectionKey {
  return `${ouId ?? "u"}:${workerId}`;
}

export function parseKey(key: SelectionKey): SelectedRef {
  const [ouPart, wPart] = key.split(":");
  return {
    ouId: ouPart === "u" ? null : Number(ouPart),
    workerId: Number(wPart),
  };
}

export type WallChartSelection = {
  keys: Set<SelectionKey>;
  size: number;
  has: (ouId: number | null, workerId: number) => boolean;
  toggle: (ouId: number | null, workerId: number) => void;
  selectOnly: (ouId: number | null, workerId: number) => void;
  clear: () => void;
  /** Returns distinct worker ids in the selection (dedupes across units). */
  workerIds: () => number[];
  /** Returns selected refs, one per (ouId, workerId) key. */
  refs: () => SelectedRef[];
};

export function useWallChartSelection(): WallChartSelection {
  const [keys, setKeys] = useState<Set<SelectionKey>>(() => new Set());

  const has = useCallback(
    (ouId: number | null, workerId: number) => keys.has(makeKey(ouId, workerId)),
    [keys]
  );

  const toggle = useCallback((ouId: number | null, workerId: number) => {
    const k = makeKey(ouId, workerId);
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const selectOnly = useCallback((ouId: number | null, workerId: number) => {
    setKeys(new Set([makeKey(ouId, workerId)]));
  }, []);

  const clear = useCallback(() => {
    setKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const workerIds = useCallback(() => {
    const s = new Set<number>();
    for (const k of keys) s.add(parseKey(k).workerId);
    return [...s];
  }, [keys]);

  const refs = useCallback(() => [...keys].map(parseKey), [keys]);

  return { keys, size: keys.size, has, toggle, selectOnly, clear, workerIds, refs };
}
