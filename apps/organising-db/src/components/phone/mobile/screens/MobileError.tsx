"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/lib/ui/dialer-tokens";

interface MobileErrorProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function MobileError({ message, onRetry, retryLabel }: MobileErrorProps) {
  return (
    <div className={tokens.layout.mobileScreen}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className={tokens.type.title}>Something went wrong</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry ? (
          <Button onClick={onRetry} className={tokens.buttons.actionPrimary}>
            <RefreshCw className="h-4 w-4" />
            {retryLabel ?? "Try again"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
