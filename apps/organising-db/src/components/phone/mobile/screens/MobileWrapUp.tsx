"use client";

import { useMemo } from "react";
import { CheckCircle2, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { tokens } from "@/lib/ui/dialer-tokens";
import { OUTCOME_META } from "@/lib/phone/outcome-model";
import type { RecentMobileAttempt } from "./MobileQueue";
import type { CallSessionBootstrap, CallSessionCaller } from "@/lib/phone/session/types";

interface MobileWrapUpProps {
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  recent: RecentMobileAttempt[];
  /** Token expiry — informational so the volunteer knows the link won't last forever. */
  tokenExpiresAt?: string | null;
  onCheckForMore: () => void;
  onLogout?: () => void;
}

/**
 * End-of-list / end-of-session screen. Shows a personal mini-report of the
 * outcomes the volunteer recorded this session, with a countdown to share
 * token expiry.
 */
export function MobileWrapUp({
  bootstrap,
  caller,
  recent,
  tokenExpiresAt,
  onCheckForMore,
  onLogout,
}: MobileWrapUpProps) {
  const summary = useMemo(() => {
    const tally = new Map<string, number>();
    for (const entry of recent) {
      if (!entry.outcome_classification) continue;
      const key = entry.outcome_classification;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .map(([value, count]) => ({ value, count, meta: OUTCOME_META[value as keyof typeof OUTCOME_META] }))
      .sort((a, b) => b.count - a.count);
  }, [recent]);

  const callsConnected = recent.filter((entry) => entry.outcome_classification !== "unable_to_reach" && entry.outcome_classification !== "voicemail_left").length;
  const expiresInHours = tokenExpiresAt
    ? Math.max(0, Math.round((Date.parse(tokenExpiresAt) - Date.now()) / 3_600_000))
    : null;

  return (
    <div className={tokens.layout.mobileScreen}>
      <main className="flex-1 px-4 pt-6">
        <div className="space-y-1 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className={tokens.type.hero}>Thanks, {caller.label ?? "caller"}.</p>
          <p className="text-sm text-muted-foreground">
            {recent.length === 0
              ? "No calls recorded in this session — come back when you have more time."
              : `You worked through ${recent.length} contact${recent.length === 1 ? "" : "s"} on ${bootstrap.list.name}.`}
          </p>
        </div>

        {recent.length > 0 ? (
          <div className={`${tokens.layout.mobileCard} mt-5 p-5 space-y-4`}>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-3xl font-semibold tabular-nums">{recent.length}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Calls recorded
                </p>
              </div>
              <div>
                <p className="text-3xl font-semibold tabular-nums">{callsConnected}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Connected
                </p>
              </div>
            </div>

            {summary.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your outcomes
                </p>
                <ul className="space-y-1">
                  {summary.map((entry) => (
                    <li
                      key={entry.value}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                    >
                      <span>{entry.meta?.label ?? entry.value}</span>
                      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {expiresInHours != null ? (
          <p className="mt-5 rounded-lg bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
            This call link {expiresInHours > 0 ? `expires in ~${expiresInHours} hour${expiresInHours === 1 ? "" : "s"}` : "has expired"}.
          </p>
        ) : null}
      </main>

      <div className={tokens.layout.mobileActionBar}>
        <button type="button" onClick={onCheckForMore} className={tokens.buttons.actionPrimary}>
          <RefreshCw className="h-5 w-5" />
          Check for more contacts
        </button>
        {onLogout ? (
          <button type="button" onClick={onLogout} className={tokens.buttons.actionSecondary}>
            <LogOut className="h-4 w-4" />
            End session
          </button>
        ) : (
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Session saved
          </p>
        )}
      </div>
    </div>
  );
}
