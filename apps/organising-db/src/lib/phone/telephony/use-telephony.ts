"use client";

import { useEffect, useMemo, useRef } from "react";
import { TelLinkProvider } from "./tel-link-provider";
import type { CallEvent, TelephonyProvider } from "./types";

/**
 * Hook that exposes a telephony provider singleton (per browser tab).
 *
 * Today this always returns the `TelLinkProvider`. A follow-up will gate
 * the resolution on a feature flag / campaign config so a browser-calling
 * provider can be swapped in for selected campaigns without changing any
 * component that consumes telephony.
 *
 * The optional `onEvent` callback subscribes the component to lifecycle
 * events for the lifetime of the hook caller. Each unique handler is
 * subscribed once (using a ref) so re-renders don't leak listeners.
 */
export function useTelephony(onEvent?: (event: CallEvent) => void): TelephonyProvider {
  const provider = useMemo<TelephonyProvider>(() => new TelLinkProvider(), []);

  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!provider.onCallEvent) return;
    const unsubscribe = provider.onCallEvent((event) => {
      handlerRef.current?.(event);
    });
    return unsubscribe;
  }, [provider]);

  return provider;
}
