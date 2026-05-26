"use client";

import { useEffect } from "react";

/**
 * Registers the mobile dialer service worker on mount. Lives in the
 * `/call/[token]` layout so the worker only attaches to the share-link
 * surface (not the staff dashboard, which has different cache semantics).
 *
 * The worker itself is published at /call-dialer-sw.js so the registration
 * scope can stay tightly bound to `/call/`.
 */
export function MobileServiceWorkerBootstrap() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Defer registration so we don't compete with the bootstrap fetch.
    const id = setTimeout(() => {
      navigator.serviceWorker
        .register("/call-dialer-sw.js", { scope: "/call/" })
        .catch((err) => {
          // Soft-fail — the dialer still works without offline support.
          console.warn("Service worker registration failed:", err);
        });
    }, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}
