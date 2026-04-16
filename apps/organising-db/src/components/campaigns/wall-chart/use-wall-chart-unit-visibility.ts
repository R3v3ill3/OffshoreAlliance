"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(campaignId: string) {
  return `wallchart:unit-visibility:${campaignId}`;
}

function readHidden(campaignId: string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(campaignId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is number => typeof x === "number" && Number.isFinite(x)));
  } catch {
    return new Set();
  }
}

/** Per-browser visibility of unit cards on the wall chart (not persisted to DB). */
export function useWallChartUnitVisibility(campaignId: string) {
  const [hiddenOuIds, setHiddenOuIds] = useState<Set<number>>(() => readHidden(campaignId));

  useEffect(() => {
    setHiddenOuIds(readHidden(campaignId));
  }, [campaignId]);

  const persist = useCallback(
    (next: Set<number>) => {
      setHiddenOuIds(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey(campaignId), JSON.stringify([...next]));
      } catch {
        // ignore
      }
    },
    [campaignId]
  );

  const toggleOu = useCallback(
    (ouId: number) => {
      const next = new Set(hiddenOuIds);
      if (next.has(ouId)) next.delete(ouId);
      else next.add(ouId);
      persist(next);
    },
    [hiddenOuIds, persist]
  );

  const showAll = useCallback(() => persist(new Set()), [persist]);

  const setHidden = useCallback((ids: Set<number>) => persist(ids), [persist]);

  return { hiddenOuIds, toggleOu, showAll, setHidden };
}
