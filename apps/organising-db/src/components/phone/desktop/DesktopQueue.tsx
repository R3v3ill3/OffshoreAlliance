"use client";

import { CheckCircle2, History, Loader2, PhoneCall } from "lucide-react";
import { DesktopShell } from "./DesktopShell";
import { OUTCOME_META } from "@/lib/phone/outcome-model";
import type { RecentMobileAttempt } from "@/components/phone/mobile/screens/MobileQueue";
import type { CallSessionBootstrap, CallSessionCaller } from "@/lib/phone/session/types";

interface DesktopQueueProps {
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  recent: RecentMobileAttempt[];
  isFetchingNext: boolean;
  /** Surfaced when fetching the next contact fails. */
  error?: string | null;
  onFetchNext: () => void;
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
}

/**
 * Desktop between-calls screen. Shows list progress and the primary
 * "Get next contact" action; the contact is held for the caller for 15
 * minutes once claimed.
 */
export function DesktopQueue({
  bootstrap,
  caller,
  recent,
  isFetchingNext,
  error,
  onFetchNext,
  onSwitchToMobile,
  onLogout,
}: DesktopQueueProps) {
  const list = bootstrap.list as { name: string; total_items?: number; completed_items?: number };
  const total = list.total_items ?? 0;
  const completed = list.completed_items ?? 0;
  const remaining = Math.max(total - completed, 0);

  return (
    <DesktopShell
      listName={list.name}
      callerLabel={caller.label}
      onSwitchToMobile={onSwitchToMobile}
      onLogout={onLogout}
    >
      <div className="w-full space-y-5 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Queue</p>
          <p className="text-3xl font-semibold tracking-tight">
            {remaining > 0 ? `${remaining} to go` : "Queue clear"}
          </p>
          <p className="text-sm text-muted-foreground">
            {remaining > 0
              ? "Grab the next contact, dial them on your phone, then record what happened. They’ll be held for you for 15 minutes."
              : "All contacts have been called or skipped. Check back later or finish your session."}
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium tabular-nums">{completed}</span>
            <span className="text-xs text-muted-foreground">of {total} done</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${total > 0 ? Math.min(100, (completed / total) * 100) : 0}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onFetchNext}
          disabled={isFetchingNext || remaining === 0}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50"
        >
          {isFetchingNext ? (
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : remaining === 0 ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <PhoneCall className="h-5 w-5" aria-hidden="true" />
          )}
          {remaining === 0 ? "All done" : "Get next contact"}
        </button>

        {recent.length > 0 ? (
          <div className="rounded-xl border bg-background p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Your recent calls
            </p>
            <ul className="mt-2 divide-y">
              {recent.slice(0, 10).map((entry) => {
                const meta = entry.outcome_classification
                  ? OUTCOME_META[entry.outcome_classification]
                  : null;
                return (
                  <li
                    key={entry.attempt_id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{entry.contact_label}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.placed_at.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {meta ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {meta.label}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </DesktopShell>
  );
}
