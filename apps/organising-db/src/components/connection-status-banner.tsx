"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHealthSummary } from "@/lib/supabase/connection-monitor";
import { useAuth } from "@/lib/supabase/auth-context";

export function ConnectionStatusBanner() {
  const [errorCount, setErrorCount] = useState(0);
  const [lastDetail, setLastDetail] = useState<string | null>(null);
  const { hardRefreshConnection, connectionRecoveryInProgress } = useAuth();

  useEffect(() => {
    const check = () => {
      const summary = getHealthSummary();
      setErrorCount(summary.recentErrors);
      setLastDetail(summary.lastError?.detail ?? null);
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (errorCount < 3) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg dark:border-amber-700 dark:bg-amber-950">
        <div className="flex items-start gap-3">
          <WifiOff className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Connection issues detected
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 truncate">
              {lastDetail ?? "Some requests are failing"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 text-xs h-7 gap-1 border-amber-300"
            disabled={connectionRecoveryInProgress}
            onClick={() => void hardRefreshConnection()}
          >
            <RefreshCw className={`h-3 w-3 ${connectionRecoveryInProgress ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
