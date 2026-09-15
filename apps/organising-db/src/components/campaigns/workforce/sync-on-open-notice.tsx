"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncNoticeMessage } from "@/lib/workers/sync-notice-message";

/**
 * WP2.4 (SY-c, wp2.4.md §3.14) — the dismissible inline notice the workforce
 * board shows after the sync-on-open POST, on both wall-chart paths and the
 * List layout. Rendered only when the pure `syncNoticeMessage` has something
 * to say (something CHANGED: members enrolled, placements made or, with
 * WP2.4b, moved); "already placed" on its own is silent. Inline, not a
 * toast, so it stays until read; not a modal, so it never blocks the chart.
 * Dismissed state is React state for this mount — the parent keys the
 * component on the sync result, so a later sync may show a new notice; nothing
 * is persisted.
 */
export function SyncOnOpenNotice({ result }: { result: unknown }) {
  const [dismissed, setDismissed] = useState(false);
  const message = syncNoticeMessage(result);
  if (message === null || dismissed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm print:hidden"
    >
      <p className="min-w-0">{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss sync notice"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}
