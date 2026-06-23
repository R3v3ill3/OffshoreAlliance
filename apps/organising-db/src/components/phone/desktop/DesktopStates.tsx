"use client";

import { CheckCircle2, Loader2, PhoneOff, RotateCw, TriangleAlert } from "lucide-react";
import { DesktopShell } from "./DesktopShell";
import type { RecentMobileAttempt } from "@/components/phone/mobile/screens/MobileQueue";
import type { CallSessionBootstrap, CallSessionCaller } from "@/lib/phone/session/types";

/** Neutral full-screen loader while the surface / bootstrap resolves. */
export function DesktopLoading({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-muted/20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

/** Hard error (bad token, load failure, lockout). */
export function DesktopError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/20 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 text-base font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            <RotateCw className="h-4 w-4" />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The held claim expired or was force-released by a coordinator. */
export function DesktopLostClaim({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/20 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <PhoneOff className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-base font-semibold">This contact was released</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your hold on this contact expired or was handed to another caller, so any unsaved notes
          here weren&apos;t recorded. Grab the next contact to keep going.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-95"
        >
          Get next contact
        </button>
      </div>
    </div>
  );
}

interface DesktopWrapUpProps {
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  recent: RecentMobileAttempt[];
  onCheckForMore: () => void;
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
}

/** End-of-queue summary screen. */
export function DesktopWrapUp({
  bootstrap,
  caller,
  recent,
  onCheckForMore,
  onSwitchToMobile,
  onLogout,
}: DesktopWrapUpProps) {
  const list = bootstrap.list as { name: string };
  return (
    <DesktopShell
      listName={list.name}
      callerLabel={caller.label}
      onSwitchToMobile={onSwitchToMobile}
      onLogout={onLogout}
    >
      <div className="w-full space-y-5 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <div>
          <p className="text-2xl font-semibold tracking-tight">Nice work</p>
          <p className="mt-1 text-sm text-muted-foreground">
            There are no more contacts to call right now. You recorded {recent.length} call
            {recent.length === 1 ? "" : "s"} this session.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckForMore}
          className="inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-medium transition hover:bg-muted"
        >
          <RotateCw className="h-4 w-4" />
          Check for more
        </button>
      </div>
    </DesktopShell>
  );
}
