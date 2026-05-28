/**
 * Lightweight client-side connection health monitor.
 * Tracks Supabase auth and API health state for diagnostics.
 * Logs are kept in-memory (last N entries), written to console for
 * Sentry session-replay capture, and forwarded to Sentry breadcrumbs +
 * PostHog events for queryable production diagnostics.
 */

import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { isPostHogEnabled } from "@/lib/posthog-config";

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
  // Diagnostic-only: the auth processLock was acquired/held slowly but did NOT
  // deadlock. Surfaces early lock pressure before it escalates to lock_timeout.
  | "lock_contended"
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
  lock_contended: "info",
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
 * Forward to PostHog as a custom event.
 *
 * IMPORTANT: we use the imported posthog-js module here, NOT `window.posthog`.
 * The npm `posthog-js` import does not assign itself to `window.posthog`, so the
 * previous `window.posthog` lookup silently no-op'd and zero connection events
 * ever reached PostHog. posthog-js is initialised by initPostHogIfNeeded()
 * (PostHogPageView); before that `__loaded` is false and we skip silently.
 */
function forwardToPostHog(entry: ConnectionEvent): void {
  if (typeof window === "undefined") return;
  if (!isPostHogEnabled()) return;
  try {
    // `__loaded` is set true by posthog-js once init() completes. Capturing
    // before that would be dropped anyway; skip without spam.
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) return;
    posthog.capture("supabase_connection_event", {
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
  /** All recent error-ish events (hard errors + lock timeouts). Back-compat. */
  recentErrors: number;
  /**
   * Genuine failures (not self-healing lock timeouts). Drives the loud
   * "Connection issues detected" banner.
   */
  hardErrors: number;
  /**
   * Transient auth-lock acquire timeouts. These are auto-recovered by the
   * reset-then-reload ladder, so they drive a quiet "Reconnecting" state
   * rather than the loud error banner.
   */
  lockTimeouts: number;
  lastError: ConnectionEvent | null;
  lastSuccess: ConnectionEvent | null;
} {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const recent = eventLog.filter((e) => e.ts > cutoff);
  const hardErrors = recent.filter(
    (e) =>
      e.type === "token_refresh_fail" ||
      e.type === "api_error" ||
      e.type === "session_lost" ||
      e.type === "network_error" ||
      e.type === "deployment_mismatch"
  );
  const lockTimeouts = recent.filter((e) => e.type === "lock_timeout");
  const errors = [...hardErrors, ...lockTimeouts];
  const successes = recent.filter(
    (e) =>
      e.type === "token_refresh_ok" ||
      e.type === "api_ok" ||
      e.type === "session_recovered"
  );

  return {
    recentErrors: errors.length,
    hardErrors: hardErrors.length,
    lockTimeouts: lockTimeouts.length,
    lastError: errors.length > 0 ? errors[errors.length - 1] : null,
    lastSuccess: successes.length > 0 ? successes[successes.length - 1] : null,
  };
}
