"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff, RefreshCw, LogIn, Zap, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHealthSummary, getRecentEvents } from "@/lib/supabase/connection-monitor";
import { forceLogoutToLogin, nuclearReset } from "@/lib/supabase/session-recovery";
import { useAuth } from "@/lib/supabase/auth-context";

const PUBLIC_PATHS = ["/login", "/auth"];

function formatEventTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().substring(11, 19); // HH:MM:SS
}

function buildDiagnosticsText(): string {
  const events = getRecentEvents();
  const lines = events.map((e) => {
    const time = formatEventTimestamp(e.ts);
    const trace = e.traceId ? ` trace=${e.traceId}` : "";
    const dur = e.durationMs != null ? ` ${e.durationMs}ms` : "";
    return `${time} [${e.type}] ${e.detail ?? ""}${dur}${trace}`;
  });
  return lines.join("\n");
}

function DiagnosticsDisclosure() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEventCount(getRecentEvents().length);
    const interval = setInterval(() => setEventCount(getRecentEvents().length), 2000);
    return () => clearInterval(interval);
  }, [open]);

  return (
    <div className="mt-2 border-t border-amber-200 dark:border-amber-800 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 hover:underline"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Diagnostics ({eventCount} events)
      </button>
      {open && (
        <div className="mt-1.5">
          <pre className="text-[10px] leading-tight text-amber-900 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-950/60 rounded p-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {buildDiagnosticsText() || "(no events captured)"}
          </pre>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 hover:underline"
            onClick={() => {
              const text = buildDiagnosticsText();
              if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ConnectionStatusBanner() {
  const [errorCount, setErrorCount] = useState(0);
  const [lastDetail, setLastDetail] = useState<string | null>(null);
  const { user, loading, hardRefreshConnection, connectionRecoveryInProgress } = useAuth();
  const pathname = usePathname();

  const isProtectedRoute = !PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
  const isSessionLost = !loading && !user && isProtectedRoute;

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

  if (isSessionLost) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 shadow-lg dark:border-red-700 dark:bg-red-950">
          <div className="flex items-start gap-3">
            <LogIn className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Session expired
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Your session has ended. Please sign in again.
              </p>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1 border-red-300"
                onClick={() => forceLogoutToLogin("session_expired")}
              >
                <LogIn className="h-3 w-3" />
                Sign in
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1 border-red-300"
                onClick={() => nuclearReset()}
              >
                <Zap className="h-3 w-3" />
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connection issues banner when errors are detected
  if (errorCount >= 3) {
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
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1 border-amber-300"
                disabled={connectionRecoveryInProgress}
                onClick={() => void hardRefreshConnection()}
              >
                <RefreshCw className={`h-3 w-3 ${connectionRecoveryInProgress ? "animate-spin" : ""}`} />
                Refresh connection
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1 border-amber-300 text-amber-800"
                onClick={() => nuclearReset()}
              >
                <Zap className="h-3 w-3" />
                Full Reset
              </Button>
            </div>
          </div>
          <DiagnosticsDisclosure />
        </div>
      </div>
    );
  }

  return null;
}
