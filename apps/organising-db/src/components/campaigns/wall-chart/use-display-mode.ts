"use client";

import { useState } from "react";
import type { DisplayMode } from "./unit-summary-metrics";

const KEY = (campaignId: string) => `wallchart:displayMode:${campaignId}`;

function readInitial(campaignId: string): DisplayMode {
  if (typeof window === "undefined") return "pct";
  try {
    const stored = window.localStorage.getItem(KEY(campaignId));
    if (stored === "pct" || stored === "count") return stored;
  } catch {
    // ignore
  }
  return "pct";
}

/** Persists the %/# display mode per campaign in localStorage. Falls back to pct. */
export function useDisplayMode(campaignId: string): [DisplayMode, (m: DisplayMode) => void] {
  const [mode, setMode] = useState<DisplayMode>(() => readInitial(campaignId));

  const update = (m: DisplayMode) => {
    setMode(m);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KEY(campaignId), m);
      } catch {
        // ignore
      }
    }
  };

  return [mode, update];
}
