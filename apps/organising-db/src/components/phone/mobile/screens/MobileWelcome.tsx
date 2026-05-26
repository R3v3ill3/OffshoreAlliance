"use client";

import { Loader2, PhoneCall } from "lucide-react";
import { tokens } from "@/lib/ui/dialer-tokens";

/**
 * Initial loading splash. Shown while the share-token bootstrap is in flight.
 * Intentionally minimal so the visual transition into the password gate / queue
 * is fast.
 */
export function MobileWelcome({ message }: { message?: string }) {
  return (
    <div className={tokens.layout.mobileScreen}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <PhoneCall className="h-7 w-7" />
        </div>
        <div className="space-y-1 text-center">
          <p className={tokens.type.title}>Preparing your dialer</p>
          <p className="text-sm text-muted-foreground">
            {message ?? "Loading the call list and script…"}
          </p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
