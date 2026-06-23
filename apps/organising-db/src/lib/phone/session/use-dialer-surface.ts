"use client";

import { useCallback, useEffect, useState } from "react";

export type DialerSurface = "mobile" | "desktop";

const STORAGE_KEY = "oa_dialer_surface_pref";

function readQueryOverride(): DialerSurface | null {
  if (typeof window === "undefined") return null;
  try {
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "desktop" || mode === "mobile" ? mode : null;
  } catch {
    return null;
  }
}

function readStoredPref(): DialerSurface | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "desktop" || value === "mobile" ? value : null;
  } catch {
    return null;
  }
}

function persistPref(surface: DialerSurface) {
  try {
    localStorage.setItem(STORAGE_KEY, surface);
  } catch {
    // Ignore storage errors (private browsing, storage full, etc.)
  }
}

/**
 * Auto-detect the best surface for the current device: desktop only when the
 * device has a fine pointer (mouse/trackpad) AND a wide viewport. Coarse-pointer
 * or narrow devices fall back to the mobile dialer.
 */
function autoDetect(): DialerSurface {
  if (typeof window === "undefined") return "mobile";
  try {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    return finePointer && wide ? "desktop" : "mobile";
  } catch {
    return "mobile";
  }
}

/**
 * Resolves which dialer surface (mobile vs desktop) to render for the shared
 * call link. Resolution order: explicit `?mode=` query override → a previously
 * stored manual preference → device auto-detect.
 *
 * Returns `null` until resolved on mount so the page can render a neutral
 * loader and avoid an SSR/CSR hydration mismatch.
 */
export function useDialerSurface(): {
  surface: DialerSurface | null;
  setSurface: (surface: DialerSurface) => void;
} {
  const [surface, setSurfaceState] = useState<DialerSurface | null>(null);

  // Resolve client-side on mount so SSR renders the neutral loader and we
  // avoid a hydration mismatch (window-based detection can't run on the server).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const queryOverride = readQueryOverride();
    if (queryOverride) {
      // A shared `?mode=` link wins and is remembered for the rest of the
      // session on this device.
      persistPref(queryOverride);
      setSurfaceState(queryOverride);
      return;
    }
    setSurfaceState(readStoredPref() ?? autoDetect());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setSurface = useCallback((next: DialerSurface) => {
    persistPref(next);
    setSurfaceState(next);
  }, []);

  return { surface, setSurface };
}
