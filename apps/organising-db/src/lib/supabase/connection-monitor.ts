/**
 * Lightweight client-side connection health monitor.
 * Tracks Supabase auth and API health state for diagnostics.
 * Logs are kept in-memory (last N entries) and written to console
 * so they appear in Sentry session replays and browser DevTools.
 */

const MAX_LOG_ENTRIES = 50;

interface ConnectionEvent {
  ts: number;
  type:
    | "token_refresh_ok"
    | "token_refresh_fail"
    | "api_error"
    | "api_ok"
    | "visibility_change"
    | "session_lost"
    | "session_recovered"
    | "lock_timeout"
    | "network_error"
    | "recovery_start"
    | "recovery_end";
  detail?: string;
  durationMs?: number;
  traceId?: string;
}

const eventLog: ConnectionEvent[] = [];

let _traceCounter = 0;

export function generateTraceId(): string {
  _traceCounter += 1;
  return `rcv-${Date.now()}-${_traceCounter}`;
}

export function logConnectionEvent(event: Omit<ConnectionEvent, "ts">): void {
  const entry: ConnectionEvent = { ...event, ts: Date.now() };
  eventLog.push(entry);
  if (eventLog.length > MAX_LOG_ENTRIES) eventLog.shift();

  if (
    event.type === "token_refresh_fail" ||
    event.type === "session_lost" ||
    event.type === "lock_timeout" ||
    event.type === "network_error"
  ) {
    console.warn("[connection-monitor]", event.type, event.detail ?? "", event.traceId ? `trace=${event.traceId}` : "");
  }
}

export function getRecentEvents(): ConnectionEvent[] {
  return [...eventLog];
}

export function getHealthSummary(): {
  recentErrors: number;
  lastError: ConnectionEvent | null;
  lastSuccess: ConnectionEvent | null;
} {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const recent = eventLog.filter((e) => e.ts > cutoff);
  const errors = recent.filter(
    (e) =>
      e.type === "token_refresh_fail" ||
      e.type === "api_error" ||
      e.type === "session_lost" ||
      e.type === "lock_timeout" ||
      e.type === "network_error"
  );
  const successes = recent.filter(
    (e) =>
      e.type === "token_refresh_ok" ||
      e.type === "api_ok" ||
      e.type === "session_recovered"
  );

  return {
    recentErrors: errors.length,
    lastError: errors.length > 0 ? errors[errors.length - 1] : null,
    lastSuccess: successes.length > 0 ? successes[successes.length - 1] : null,
  };
}
