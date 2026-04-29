/**
 * Runtime diagnostic shims for detecting auth client deadlocks and hung requests.
 *
 * Install at app startup (e.g., in providers.tsx) via installDiagnosticShims().
 * These are non-destructive — they wrap browser APIs to add logging without
 * changing behavior. Remove after the data-access issue is resolved.
 *
 * Detected conditions:
 * - navigator.locks held for > 10 seconds (potential deadlock)
 * - fetch requests to Supabase that take > 15 seconds (potential hang)
 * - fetch requests that never resolve
 */

const LOCK_WARN_MS = 10_000;
const FETCH_WARN_MS = 15_000;
const SUPABASE_HOST_FRAGMENT = "supabase.co";
const MAX_FETCH_DIAGNOSTIC_ENTRIES = 200;

let _installed = false;
let _activeLocks = 0;
let _pendingFetches = 0;
let _fetchSeq = 0;

type TimingClass = "queued_or_stalled" | "server_wait" | "download" | "unknown";

type FetchDiagnosticEntry = {
  id: number;
  method: string;
  path: string;
  search: string;
  startedAt: string;
  elapsedMs: number;
  status?: number;
  pendingAtStart: number;
  pendingAtEnd: number;
  timingClass: TimingClass;
  timing?: {
    queuedOrStalledMs?: number;
    serverWaitMs?: number;
    downloadMs?: number;
    transferSize?: number;
    encodedBodySize?: number;
  };
};

const _fetchEntries: FetchDiagnosticEntry[] = [];

/**
 * Diagnostic state snapshot — call from console for live debugging.
 */
export function getDiagnosticState() {
  return {
    activeLocks: _activeLocks,
    pendingFetches: _pendingFetches,
    installed: _installed,
    recordedFetches: _fetchEntries.length,
  };
}

// Expose for console debugging
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__diagState = getDiagnosticState;
}

function getMethod(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function getTimingBreakdown(
  url: string,
  startedAtPerf: number,
): FetchDiagnosticEntry["timing"] | undefined {
  if (typeof performance === "undefined" || !performance.getEntriesByName) {
    return undefined;
  }

  const entries = performance.getEntriesByName(url, "resource") as PerformanceResourceTiming[];
  const entry = [...entries].reverse().find((e) => e.startTime >= startedAtPerf - 20);
  if (!entry) return undefined;

  const queuedOrStalledMs =
    entry.requestStart > 0 ? Math.max(0, Math.round(entry.requestStart - entry.startTime)) : undefined;
  const serverWaitMs =
    entry.responseStart > 0 && entry.requestStart > 0
      ? Math.max(0, Math.round(entry.responseStart - entry.requestStart))
      : undefined;
  const downloadMs =
    entry.responseEnd > 0 && entry.responseStart > 0
      ? Math.max(0, Math.round(entry.responseEnd - entry.responseStart))
      : undefined;

  return {
    queuedOrStalledMs,
    serverWaitMs,
    downloadMs,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
  };
}

function classifyTiming(timing: FetchDiagnosticEntry["timing"]): TimingClass {
  if (!timing) return "unknown";

  const candidates: Array<[TimingClass, number]> = [
    ["queued_or_stalled", timing.queuedOrStalledMs ?? 0],
    ["server_wait", timing.serverWaitMs ?? 0],
    ["download", timing.downloadMs ?? 0],
  ];
  const [name, value] = candidates.reduce((max, item) => (item[1] > max[1] ? item : max));
  return value > 0 ? name : "unknown";
}

function recordFetchEntry(entry: FetchDiagnosticEntry): void {
  _fetchEntries.push(entry);
  if (_fetchEntries.length > MAX_FETCH_DIAGNOSTIC_ENTRIES) {
    _fetchEntries.splice(0, _fetchEntries.length - MAX_FETCH_DIAGNOSTIC_ENTRIES);
  }
}

function groupFetchBursts() {
  const bursts: FetchDiagnosticEntry[][] = [];
  for (const entry of _fetchEntries) {
    const lastBurst = bursts[bursts.length - 1];
    const previous = lastBurst?.[lastBurst.length - 1];
    if (!previous) {
      bursts.push([entry]);
      continue;
    }

    const gapMs = Date.parse(entry.startedAt) - Date.parse(previous.startedAt);
    if (gapMs <= 250) {
      lastBurst.push(entry);
    } else {
      bursts.push([entry]);
    }
  }

  return bursts.map((burst) => {
    const pathCounts = burst.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.path] = (acc[entry.path] ?? 0) + 1;
      return acc;
    }, {});

    return {
      startedAt: burst[0]?.startedAt,
      requestCount: burst.length,
      slowCount: burst.filter((entry) => entry.elapsedMs > 5000).length,
      maxElapsedMs: Math.max(...burst.map((entry) => entry.elapsedMs)),
      paths: pathCounts,
    };
  });
}

export function getFetchDiagnostics() {
  return {
    state: getDiagnosticState(),
    entries: [..._fetchEntries],
    slowEntries: _fetchEntries.filter((entry) => entry.elapsedMs > 5000),
    bursts: groupFetchBursts(),
  };
}

function installLockShim(): void {
  if (typeof navigator === "undefined" || !navigator.locks) return;

  const originalRequest = navigator.locks.request.bind(navigator.locks);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator.locks as any).request = function shimmedLockRequest(
    ...args: unknown[]
  ): Promise<unknown> {
    const lockName = args[0] as string;
    const startMs = Date.now();
    let acquired = false;
    _activeLocks++;

    const warnTimer = setTimeout(() => {
      if (!acquired) {
        console.warn(
          `[lock-diag] LOCK BLOCKED for ${LOCK_WARN_MS}ms: "${lockName}". ` +
            `Active locks: ${_activeLocks}. This may indicate a deadlock in @supabase/auth-js.`
        );
      }
    }, LOCK_WARN_MS);

    // The lock.request API has multiple overloads. We need to handle the case
    // where the callback is the 2nd or 3rd argument.
    const callbackIdx = typeof args[1] === "function" ? 1 : 2;
    const originalCallback = args[callbackIdx] as (lock: Lock | null) => Promise<unknown>;

    const wrappedCallback = async (lock: Lock | null): Promise<unknown> => {
      acquired = true;
      clearTimeout(warnTimer);
      const acquireMs = Date.now() - startMs;

      if (acquireMs > 1000) {
        console.warn(
          `[lock-diag] Lock "${lockName}" acquired after ${acquireMs}ms wait`
        );
      }

      try {
        return await originalCallback(lock);
      } finally {
        _activeLocks--;
        const heldMs = Date.now() - startMs - acquireMs;
        if (heldMs > 5000) {
          console.warn(
            `[lock-diag] Lock "${lockName}" held for ${heldMs}ms (acquire wait: ${acquireMs}ms)`
          );
        }
      }
    };

    const newArgs = [...args];
    newArgs[callbackIdx] = wrappedCallback;

    return (originalRequest as (...a: unknown[]) => Promise<unknown>)(...newArgs).catch((err: unknown) => {
      clearTimeout(warnTimer);
      _activeLocks--;
      console.warn(`[lock-diag] Lock "${lockName}" request rejected:`, err);
      throw err;
    });
  };
}

function installFetchShim(): void {
  if (typeof globalThis === "undefined" || !globalThis.fetch) return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function shimmedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isSupabase = url.includes(SUPABASE_HOST_FRAGMENT);

    if (!isSupabase) {
      return originalFetch(input, init);
    }

    const startMs = Date.now();
    const startPerf = typeof performance !== "undefined" ? performance.now() : 0;
    const pendingAtStart = _pendingFetches + 1;
    const requestId = ++_fetchSeq;
    _pendingFetches++;

    // Extract the path for compact logging
    const parsedUrl = (() => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    })();
    const urlPath = parsedUrl?.pathname ?? url.substring(0, 80);
    const urlSearch = parsedUrl?.search ?? "";

    const warnTimer = setTimeout(() => {
      console.warn(
        `[fetch-diag] SUPABASE REQUEST HANGING for ${FETCH_WARN_MS}ms: ${urlPath}. ` +
          `Pending Supabase fetches: ${_pendingFetches}.`
      );
    }, FETCH_WARN_MS);

    try {
      const response = await originalFetch(input, init);
      clearTimeout(warnTimer);
      _pendingFetches--;

      const elapsed = Date.now() - startMs;
      const timing = getTimingBreakdown(url, startPerf);
      const entry: FetchDiagnosticEntry = {
        id: requestId,
        method: getMethod(init),
        path: urlPath,
        search: urlSearch,
        startedAt: new Date(startMs).toISOString(),
        elapsedMs: elapsed,
        status: response.status,
        pendingAtStart,
        pendingAtEnd: _pendingFetches,
        timingClass: classifyTiming(timing),
        timing,
      };
      recordFetchEntry(entry);

      if (elapsed > 5000) {
        console.warn(
          `[fetch-diag] Slow Supabase response: ${urlPath} took ${elapsed}ms, status=${response.status}, ` +
            `pendingAtStart=${pendingAtStart}, class=${entry.timingClass}`
        );
      }

      // Log auth-related error responses
      if (response.status === 401 || response.status === 403) {
        console.warn(
          `[fetch-diag] Supabase auth error: ${urlPath} returned ${response.status}`
        );
      }

      return response;
    } catch (error) {
      clearTimeout(warnTimer);
      _pendingFetches--;
      const elapsed = Date.now() - startMs;
      const timing = getTimingBreakdown(url, startPerf);

      const errName = error instanceof Error ? error.name : "unknown";
      const errMsg = error instanceof Error ? error.message : String(error);

      recordFetchEntry({
        id: requestId,
        method: getMethod(init),
        path: urlPath,
        search: urlSearch,
        startedAt: new Date(startMs).toISOString(),
        elapsedMs: elapsed,
        pendingAtStart,
        pendingAtEnd: _pendingFetches,
        timingClass: classifyTiming(timing),
        timing,
      });

      console.warn(
        `[fetch-diag] Supabase fetch FAILED after ${elapsed}ms: ${urlPath}. ` +
          `Error: ${errName}: ${errMsg}`
      );
      throw error;
    }
  };
}

/**
 * Install diagnostic shims for navigator.locks and fetch.
 * Safe to call multiple times — only installs once.
 * Call this at app startup (e.g., in the Providers component's top-level useEffect).
 */
export function installDiagnosticShims(): void {
  if (_installed) return;
  if (typeof window === "undefined") return;

  _installed = true;
  installLockShim();
  installFetchShim();

  (window as unknown as Record<string, unknown>).__supabaseFetchDiagnostics = getFetchDiagnostics;

  console.info(
    "[diagnostics] Shims installed. Use window.__diagState() or window.__supabaseFetchDiagnostics() to inspect live state."
  );
}
