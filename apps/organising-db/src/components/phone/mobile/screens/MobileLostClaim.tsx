"use client";

import { Timer, ArrowRight } from "lucide-react";
import { tokens } from "@/lib/ui/dialer-tokens";

interface MobileLostClaimProps {
  onContinue: () => void;
}

/**
 * Shown when the soft claim TTL elapsed mid-session. The contact has been
 * released back into the shared queue and we ask the caller whether they
 * want to grab the next available one. We don't auto-redirect — losing
 * context silently would be jarring.
 */
export function MobileLostClaim({ onContinue }: MobileLostClaimProps) {
  return (
    <div className={tokens.layout.mobileScreen}>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <Timer className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className={tokens.type.title}>Hold expired</p>
          <p className="text-sm text-muted-foreground">
            Your 15-minute hold on this contact ended, so they were returned to the queue for someone else to call. If you completed the call, record the outcome on the next contact’s notes.
          </p>
        </div>
      </div>
      <div className={tokens.layout.mobileActionBar}>
        <button type="button" onClick={onContinue} className={tokens.buttons.actionPrimary}>
          <ArrowRight className="h-5 w-5" />
          Continue with the next contact
        </button>
      </div>
    </div>
  );
}
