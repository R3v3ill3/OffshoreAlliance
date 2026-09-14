/**
 * WP2.3 Stage 0 — the fake data edges the mocked modules delegate to.
 *
 * Every query in the wall-chart tree reaches the network through one of two
 * edges: a PostgREST builder from `createClient()` or `fetchApi("/api/...")`.
 * This module implements both against a `WallChartFixture`, so a query is
 * either satisfied from the fixture or fails loudly with the table / route it
 * asked for — which is what makes "no unseeded enabled query" an assertion
 * rather than a hope.
 *
 * Filters (`.eq`, `.in`, `.order`, …) are accepted and ignored: a fixture is a
 * single campaign, so returning the table's rows is the same answer PostgREST
 * would give. `.limit` and `.single` / `.maybeSingle` are honoured because
 * callers depend on their shape.
 *
 * This file contains no `vi.mock` and no spies; the test files own those and
 * point them here.
 */

import type { WallChartFixture } from "./fixture";

export type FakePostgrestResult = { data: unknown[] | null; error: { message: string } | null };

/** The shape `PostgrestError` has on the wire, as `structure-api.ts` reads it. */
export type FakeRpcError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export type FakeRpcResult = { data: unknown; error: FakeRpcError | null };

/** One recorded `client.rpc(name, args)` call, in issue order. */
export type RpcInvocation = { name: string; args: Record<string, unknown> };

let backend: WallChartFixture | null = null;
let searchParams = new URLSearchParams();
let rpcLog: RpcInvocation[] = [];
let rpcAnswers = new Map<string, FakeRpcResult[]>();

export class UnseededBackendError extends Error {}

export function installBackend(fixture: WallChartFixture): void {
  backend = fixture;
}

export function resetBackend(): void {
  backend = null;
  searchParams = new URLSearchParams();
  rpcLog = [];
  rpcAnswers = new Map();
}

export function setSearchParams(search: string): void {
  searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function currentSearchParams(): URLSearchParams {
  return searchParams;
}

/**
 * Whether a fixture is currently installed. The backend is module-global, so a
 * mount that fails part-way could leave one behind for the next test; the
 * harness's own cleanup test reads this to prove it does not.
 */
export function backendInstalled(): boolean {
  return backend !== null;
}

function requireBackend(): WallChartFixture {
  if (!backend) {
    throw new UnseededBackendError("No wall-chart fixture installed: call installBackend() first");
  }
  return backend;
}

class FakePostgrestQuery implements PromiseLike<FakePostgrestResult> {
  private rows: readonly unknown[];

  constructor(rows: readonly unknown[]) {
    this.rows = rows;
  }

  select(): this {
    return this;
  }
  eq(): this {
    return this;
  }
  neq(): this {
    return this;
  }
  in(): this {
    return this;
  }
  is(): this {
    return this;
  }
  not(): this {
    return this;
  }
  gt(): this {
    return this;
  }
  gte(): this {
    return this;
  }
  lt(): this {
    return this;
  }
  lte(): this {
    return this;
  }
  or(): this {
    return this;
  }
  filter(): this {
    return this;
  }
  order(): this {
    return this;
  }
  range(): this {
    return this;
  }
  limit(count: number): this {
    this.rows = this.rows.slice(0, count);
    return this;
  }
  then<TResult1 = FakePostgrestResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakePostgrestResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve<FakePostgrestResult>({ data: [...this.rows], error: null }).then(
      onfulfilled,
      onrejected
    );
  }
  single(): Promise<{ data: unknown; error: { message: string } | null }> {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
}

/** `createClient().from` stand-in. Throws for a table the fixture does not describe. */
export function fakeFrom(table: string): FakePostgrestQuery {
  const fixture = requireBackend();
  const rows = fixture.tables[table];
  if (!rows) {
    throw new UnseededBackendError(`Unseeded table: ${table}`);
  }
  return new FakePostgrestQuery(rows);
}

/**
 * WP2.2 Stage 4 — the `rpc` edge. Every structure write now leaves the wall
 * chart as `client.rpc("structure_*", { p_… })` (wp2.2.md §3.9), so the fake
 * client records each call and answers it with the RPC's own result shape,
 * which the wrapper's zod schema then accepts. A test asserts on the exact
 * `p_*` payload through `rpcInvocations()`; nothing here is a spy, so the
 * calls are plain data the same way the fixture tables are.
 *
 * Deliberately minimal (wp2.2.md §4.1): the answers are static and the fake
 * applies nothing to the fixture tables — the observable outcomes the tests
 * pin are the call, the invalidations, the toasts and the dialog state, not a
 * simulated database.
 */
const DEFAULT_RPC_RESULTS: Readonly<Record<string, unknown>> = {
  structure_units_create: { units: [], inserted: 0, moved: 0, skipped: 0, displaced: 0 },
  structure_unit_update: { ou_id: 0, updated_keys: [] },
  structure_unit_reorder: { updated: 0 },
  structure_unit_delete: {
    deleted_ou_ids: [],
    placements_moved: 0,
    placements_removed: 0,
    placements_displaced: 0,
  },
  structure_unit_merge: { moved: 0, collapsed: 0, deleted_ou_ids: [], repointed: {} },
  structure_unit_split: { children: [], moved: 0, copied: 0, kept: 0, displaced: 0 },
  structure_placements_move: {
    moved: 0,
    inserted: 0,
    displaced: 0,
    removed: 0,
    skipped: 0,
    parent_inserted: 0,
  },
  structure_placements_unassign: { removed: 0 },
  structure_placements_set_primary: { placement_id: 0, cleared: 0 },
};

/**
 * Queue the next answer for one RPC name (each call consumes one; the static
 * default answers once the queue is empty). Pass `{ error }` to make the
 * wrapper throw the mapped `StructureApiError`.
 */
export function answerRpc(name: string, result: FakeRpcResult): void {
  const queue = rpcAnswers.get(name) ?? [];
  queue.push(result);
  rpcAnswers.set(name, queue);
}

/** Every `rpc` call made since the backend was installed, in order. */
export function rpcInvocations(): RpcInvocation[] {
  return rpcLog.map((call) => ({ name: call.name, args: { ...call.args } }));
}

/** `createClient().rpc` stand-in. Throws for an RPC the harness does not describe. */
export function fakeRpc(name: string, args: Record<string, unknown> = {}): Promise<FakeRpcResult> {
  requireBackend();
  rpcLog.push({ name, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> });
  const queued = rpcAnswers.get(name)?.shift();
  if (queued) return Promise.resolve(queued);
  if (!(name in DEFAULT_RPC_RESULTS)) {
    throw new UnseededBackendError(`Unseeded rpc: ${name}`);
  }
  return Promise.resolve({ data: DEFAULT_RPC_RESULTS[name], error: null });
}

/** `fetchApi` stand-in. Throws for a route the fixture does not describe. */
export function fakeFetchApi(input: string | URL): Promise<Response> {
  const fixture = requireBackend();
  const url = typeof input === "string" ? input : input.toString();
  const pathname = url.split("?")[0];
  if (!(pathname in fixture.apiRoutes)) {
    throw new UnseededBackendError(`Unseeded API route: ${pathname}`);
  }
  const body = fixture.apiRoutes[pathname];
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}
