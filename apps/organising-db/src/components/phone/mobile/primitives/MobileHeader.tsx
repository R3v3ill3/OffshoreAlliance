"use client";

import { LogOut, Timer, AlertCircle } from "lucide-react";
import { useClaimCountdown } from "@/lib/phone/session/use-claim-countdown";

interface MobileHeaderProps {
  campaignName?: string | null;
  listName: string;
  callerLabel: string | null;
  claimedAt?: string | Date | null;
  onLogout?: () => void;
}

/**
 * Sticky top header for the mobile dialer.
 *
 * - Compact campaign + list crumb (truncated)
 * - "Signed in as …" line
 * - Live claim countdown badge when a contact is held
 * - End-of-session escape hatch (logout)
 */
export function MobileHeader({
  campaignName,
  listName,
  callerLabel,
  claimedAt,
  onLogout,
}: MobileHeaderProps) {
  const countdown = useClaimCountdown(claimedAt);

  return (
    <header className="sticky top-0 z-30 flex items-start gap-3 border-b bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
      <div className="min-w-0 flex-1">
        {campaignName ? (
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {campaignName}
          </p>
        ) : null}
        <h1 className="truncate text-base font-semibold leading-tight">{listName}</h1>
        <p className="truncate text-[12px] text-muted-foreground">
          {callerLabel ? `Signed in as ${callerLabel}` : "Anonymous caller"}
        </p>
      </div>

      {claimedAt ? (
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
            countdown.isExpired
              ? "bg-rose-100 text-rose-800"
              : countdown.isExpiringSoon
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
          }`}
          aria-label={
            countdown.isExpired
              ? "Claim expired"
              : `Hold expires in ${countdown.formatted}`
          }
        >
          {countdown.isExpired ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Timer className="h-3 w-3" />
          )}
          {countdown.formatted}
        </div>
      ) : null}

      {onLogout ? (
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="End calling session"
        >
          <LogOut className="h-4 w-4" />
        </button>
      ) : null}
    </header>
  );
}
