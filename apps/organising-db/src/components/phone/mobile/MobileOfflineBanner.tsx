"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCcw } from "lucide-react";

type Status = "online" | "offline" | "queued" | "syncing";

/**
 * Live offline/sync indicator for the mobile dialer. Shows whenever the
 * device drops offline, when the service worker has queued an attempt,
 * and when queued attempts are syncing back to the server.
 *
 * Stays out of the way (top inset, full-width pill) and ignores the
 * "online" state entirely to avoid distracting callers in normal flow.
 */
export function MobileOfflineBanner() {
  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onOnline = () => {
      setStatus("syncing");
      try {
        navigator.serviceWorker.controller?.postMessage({ type: "replay-now" });
      } catch {
        /* ignore */
      }
      setTimeout(() => setStatus("online"), 1500);
    };
    const onOffline = () => setStatus("offline");

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "attempt_queued") setStatus("queued");
      if (data.type === "attempt_synced") setStatus("syncing");
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  if (status === "online") return null;

  const copy =
    status === "offline"
      ? "You're offline — attempts will be queued and synced when you reconnect."
      : status === "queued"
        ? "An attempt was saved offline and will sync as soon as you're back online."
        : "Syncing queued attempts…";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[env(safe-area-inset-top,0px)]`}
    >
      <div
        className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md ${
          status === "syncing"
            ? "bg-blue-600 text-white"
            : status === "queued"
              ? "bg-amber-500 text-white"
              : "bg-slate-900 text-white"
        }`}
      >
        {status === "syncing" ? (
          <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CloudOff className="h-3.5 w-3.5" />
        )}
        <span>{copy}</span>
      </div>
    </div>
  );
}
