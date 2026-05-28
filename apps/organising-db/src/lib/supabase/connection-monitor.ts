/**
 * Lightweight client-side connection health monitor.
 * Tracks Supabase auth and API health state for diagnostics.
 * Logs are kept in-memory (last N entries), written to console for
 * Sentry session-replay capture, and forwarded to Sentry breadcrumbs +
 * PostHog events for queryable production diagnostics.
 */

import * as Sentry from "@sentry/nextjs";

const MAX_LOG_ENTRIES = 50;

type ConnectionEventType =
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
  | "recovery_end"
  | "deployment_mismatch";

interface ConnectionEvent {
  ts: number;
  type: ConnectionEventType;
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

/**
 * Event types we want to surface as Sentry warnings (queryable as
 * `Connection: <type>` issues), in addition to breadcrumbs. Keep this
 * narrow — every captureMessage call counts against Sentry quota.
 */
const SENTRY_CAPTURE_TYPES = new Set<ConnectionEventType>([
  "token_refresh_fail",
  "session_lost",
  "lock_timeout",
  "network_error",
  "deployment_mismatch",
]);

const SENTRY_BREADCRUMB_LEVEL: Record<ConnectionEventType, "info" | "warning" | "error"> = {
  token_refresh_ok: "info",
  api_ok: "info",
  session_recovered: "info",
  visibility_change: "info",
  recovery_start: "info",
  recovery_end: "info",
  api_error: "warning",
  token_refresh_fail: "warning",
  session_lost: "warning",
  lock_timeout: "warning",
  network_error: "warning",
  deployment_mismatch: "warning",
};

function forwardToSentry(entry: ConnectionEvent): void {
  // Always add a breadcrumb so the trail accompanies any captured exception
  // that fires in the same session-replay window.
  try {
    Sentry.addBreadcrumb({
      category: "supabase-connection",
      message: entry.type,
      level: SENTRY_BREADCRUMB_LEVEL[entry.type],
      data: {
        detail: entry.detail,
        durationMs: entry.durationMs,
        traceId: entry.traceId,
        pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    });
  } catch {
    // If Sentry isn't initialised yet (very early init), swallow — there's
    // nowhere to log this error and we don't want to break the main flow.
  }

  // For critical types, also emit a queryable Sentry message so we can
  // build alerts/dashboards independently of any wrapping exception.
  if (SENTRY_CAPTURE_TYPES.has(entry.type)) {
    try {
      Sentry.captureMessage(`[supabase-connection] ${entry.type}`, {
        level: "warning",
        tags: {
          connection_event: entry.type,
        },
        extra: {
          detail: entry.detail,
          durationMs: entry.durationMs,
          traceId: entry.traceId,
          pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
          href: typeof window !== "undefined" ? window.location.href : undefined,
        },
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Forward to PostHog as a custom event. PostHog's posthog-js is loaded
 * lazily by initPostHogIfNeeded() in providers; if it hasn't initialised
 * we skip silently (no crash, no spam).
 */
function forwardToPostHog(entry: ConnectionEvent): void {
  if (typeof window === "undefined") return;
  // Read the global posthog object (set by posthog-js after init). We
  // import it dynamically to avoid coupling and to handle the
  // pre-initialisation case cleanly.
  const ph = (window as unknown as { posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  if (!ph?.capture) return;
  try {
    ph.capture("supabase_connection_event", {
      event_type: entry.type,
      detail: entry.detail,
      duration_ms: entry.durationMs,
      trace_id: entry.traceId,
    });
  } catch {
    // ignore
  }
}

export function logConnectionEvent(event: Omit<ConnectionEvent, "ts">): void {
  const entry: ConnectionEvent = { ...event, ts: Date.now() };
  eventLog.push(entry);
  if (eventLog.length > MAX_LOG_ENTRIES) eventLog.shift();

  if (
    event.type === "token_refresh_fail" ||
    event.type === "session_lost" ||
    event.type === "lock_timeout" ||
    event.type === "network_error" ||
    event.type === "deployment_mismatch"
  ) {
    console.warn("[connection-monitor]", event.type, event.detail ?? "", event.traceId ? `trace=${event.traceId}` : "");
  }

  forwardToSentry(entry);
  forwardToPostHog(entry);
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
      e.type === "network_error" ||
      e.type === "deployment_mismatch"
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
