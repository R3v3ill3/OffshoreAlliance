/**
 * WP2.3 Stage 0 — the QueryClient the harness mounts the chart under, and the
 * frozen `queryKeys` normalisation used by the characterisation contract.
 */

import { QueryClient } from "@tanstack/react-query";

/** Recursively key-sorted JSON, so two equal keys always serialise identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function stableQueryKey(queryKey: readonly unknown[]): string {
  return stableStringify(queryKey);
}

/**
 * Every key in the cache — enabled and disabled alike, because a disabled query
 * still occupies a cache entry and re-keying it is exactly the regression the
 * contract must catch — as stable JSON strings sorted with the default
 * lexicographic `Array.prototype.sort()`.
 */
export function normalizeQueryKeys(client: QueryClient): string[] {
  return client
    .getQueryCache()
    .getAll()
    .map((query) => stableQueryKey(query.queryKey))
    .sort();
}

/**
 * A query is "enabled" for our purposes when it has at least one observer that
 * is actually allowed to fetch. React Query models `enabled: false` as an
 * observer whose `enabled` option is false, so we read it back off the
 * observers rather than guessing from state.
 */
export function enabledQueries(client: QueryClient): { key: string; status: string; error: string | null }[] {
  return client
    .getQueryCache()
    .getAll()
    .filter((query) =>
      query.observers.some((observer) => {
        const enabled = (observer.options as { enabled?: unknown }).enabled;
        return enabled === undefined || enabled === true;
      })
    )
    .map((query) => ({
      key: stableQueryKey(query.queryKey),
      status: query.state.status,
      error: query.state.error instanceof Error ? query.state.error.message : null,
    }));
}

/**
 * `retry: false` so a failure surfaces on the first attempt; `staleTime`/`gcTime`
 * Infinity and no focus/reconnect refetching so a mount is deterministic; and a
 * default `queryFn` that throws, so a query without its own fetcher cannot
 * silently sit in `pending` and be mistaken for success.
 */
export function createWallChartQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: ({ queryKey }) => {
          throw new Error(`Unseeded query: ${stableQueryKey(queryKey)}`);
        },
      },
      mutations: { retry: false },
    },
  });
}
