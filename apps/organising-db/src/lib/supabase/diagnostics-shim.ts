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

let _installed = false;
let _activeLocks = 0;
let _pendingFetches = 0;

/**
 * Diagnostic state snapshot — call from console for live debugging.
 */
export function getDiagnosticState() {
  return {
    activeLocks: _activeLocks,
    pendingFetches: _pendingFetches,
    installed: _installed,
  };
}

// Expose for console debugging
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__diagState = getDiagnosticState;
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
    _pendingFetches++;

    // Extract the path for compact logging
    const urlPath = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url.substring(0, 80);
      }
    })();

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
      if (elapsed > 5000) {
        console.warn(
          `[fetch-diag] Slow Supabase response: ${urlPath} took ${elapsed}ms, status=${response.status}`
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

      const errName = error instanceof Error ? error.name : "unknown";
      const errMsg = error instanceof Error ? error.message : String(error);

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

  console.info(
    "[diagnostics] Shims installed. Use window.__diagState() to inspect live state."
  );
}
