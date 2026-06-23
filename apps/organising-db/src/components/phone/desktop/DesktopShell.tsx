"use client";

import type { ReactNode } from "react";
import { Building2, Clock, LogOut, Phone, Smartphone, User } from "lucide-react";
import { useClaimCountdown } from "@/lib/phone/session/use-claim-countdown";

export interface DesktopShellHeaderProps {
  listName: string;
  campaignName?: string | null;
  callerLabel: string | null;
  /** Live `claimed_at` of the held contact — drives the hold-timer chip. */
  claimedAt?: string | null;
  /** Switch back to the phone-optimised dialer layout. */
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
}

/**
 * Sticky top bar shared by every desktop dialer screen. Shows the list /
 * campaign context, the signed-in caller, the soft-claim hold timer, and the
 * surface toggle + sign-out affordances.
 */
export function DesktopShellHeader({
  listName,
  campaignName,
  callerLabel,
  claimedAt,
  onSwitchToMobile,
  onLogout,
}: DesktopShellHeaderProps) {
  const countdown = useClaimCountdown(claimedAt ?? null);
  const showTimer = !!claimedAt && !countdown.isExpired;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{listName}</p>
            {campaignName ? (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{campaignName}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showTimer ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                countdown.isExpiringSoon
                  ? "bg-amber-100 text-amber-800"
                  : "bg-muted text-muted-foreground"
              }`}
              title="How long this contact is held for you before returning to the shared queue"
            >
              <Clock className="h-3.5 w-3.5" />
              Held {countdown.formatted}
            </span>
          ) : null}

          {callerLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <User className="h-3.5 w-3.5" />
              {callerLabel}
            </span>
          ) : null}

          {onSwitchToMobile ? (
            <button
              type="button"
              onClick={onSwitchToMobile}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Switch to the phone-optimised layout"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Phone view
            </button>
          ) : null}

          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Page wrapper for the centred desktop screens (queue, wrap-up, gates). The
 * working call screen renders its own scroll + sticky-footer layout and uses
 * `DesktopShellHeader` directly.
 */
export function DesktopShell({
  children,
  ...headerProps
}: DesktopShellHeaderProps & { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-muted/20">
      <DesktopShellHeader {...headerProps} />
      <main className="mx-auto flex max-w-3xl flex-col px-6 py-10">{children}</main>
    </div>
  );
}
