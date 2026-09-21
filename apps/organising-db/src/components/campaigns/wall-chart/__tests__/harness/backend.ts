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

/**
 * One recorded write chain on a NON-structure table (WP2.2 Stage 5): the
 * units section updates `campaign_ou_candidates` after the structure RPC
 * that accepts a candidate, and the test pins that the row update still
 * follows the RPC. Structure-table writes never appear here — the guard
 * test and the RPC log are the evidence for those.
 */
export type WriteInvocation = { table: string; op: "insert" | "update" | "upsert" | "delete"; payload: unknown };

/** One recorded `from(table)` chain (every builder method in call order), read or write (Stage 5 review). */
export type QueryInvocation = { table: string; ops: Array<{ method: string; args: unknown[] }> };

/** The two tables no component may write directly (wp2.2.md §3.9). */
const STRUCTURE_TABLES = new Set(["campaign_organising_units", "campaign_worker_ou"]);

/**
 * Thrown by a direct `insert/update/upsert/delete` on a structure table under
 * the harness unless the test opted in with `allowDirectStructureWrites()`:
 * a regressed writer must fail its test, not be answered with success.
 */
export class DirectStructureWriteError extends Error {
  constructor(table: string, op: string) {
    super(`Direct ${op} on ${table} under the harness: structure writes go through structureApi (wp2.2.md §3.9)`);
    this.name = "DirectStructureWriteError";
  }
}

let backend: WallChartFixture | null = null;
let searchParams = new URLSearchParams();
let rpcLog: RpcInvocation[] = [];
let rpcAnswers = new Map<string, FakeRpcResult[]>();
let writeLog: WriteInvocation[] = [];
let queryLog: QueryInvocation[] = [];
let directStructureWritesAllowed = false;
/** WP3.8 fix round 1 (F4c): queued errors for the next write on `table:op`, consumed one per write. */
let writeAnswers = new Map<string, FakeRpcError[]>();

export class UnseededBackendError extends Error {}

export function installBackend(fixture: WallChartFixture): void {
  backend = fixture;
}

export function resetBackend(): void {
  backend = null;
  searchParams = new URLSearchParams();
  rpcLog = [];
  rpcAnswers = new Map();
  writeLog = [];
  queryLog = [];
  directStructureWritesAllowed = false;
  writeAnswers = new Map();
}

/**
 * WP3.8 fix round 1 (F4c, additive): make the next `insert/update/upsert/delete`
 * on `table` resolve with `error` (the PostgREST error shape) instead of
 * success. The write is still recorded. Each queued answer serves one write.
 */
export function answerWrite(table: string, op: WriteInvocation["op"], error: FakeRpcError): void {
  const key = `${table}:${op}`;
  const queue = writeAnswers.get(key) ?? [];
  queue.push(error);
  writeAnswers.set(key, queue);
}

/** Opt one test in to recorded (not refused) direct writes on the structure tables. */
export function allowDirectStructureWrites(): void {
  directStructureWritesAllowed = true;
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
  private readonly table: string;
  private readonly record: QueryInvocation;
  /** A queued write error (answerWrite), returned by `then` / `single` / `maybeSingle`. */
  private error: FakeRpcError | null = null;

  constructor(table: string, rows: readonly unknown[]) {
    this.table = table;
    this.rows = rows;
    this.record = { table, ops: [] };
    queryLog.push(this.record);
  }

  private note(method: string, args: unknown[]): this {
    this.record.ops.push({ method, args: JSON.parse(JSON.stringify(args)) as unknown[] });
    return this;
  }

  private write(op: WriteInvocation["op"], payload: unknown): this {
    if (STRUCTURE_TABLES.has(this.table) && !directStructureWritesAllowed) {
      throw new DirectStructureWriteError(this.table, op);
    }
    this.note(op, payload === null ? [] : [payload]);
    writeLog.push({ table: this.table, op, payload: JSON.parse(JSON.stringify(payload ?? null)) as unknown });
    this.rows = [];
    this.error = writeAnswers.get(`${this.table}:${op}`)?.shift() ?? null;
    return this;
  }
  /** Stage 5: recorded, answered with no rows; the fixture tables are never changed. */
  insert(payload: unknown): this {
    return this.write("insert", payload);
  }
  update(payload: unknown): this {
    return this.write("update", payload);
  }
  upsert(payload: unknown): this {
    return this.write("upsert", payload);
  }
  delete(): this {
    return this.write("delete", null);
  }

  select(...args: unknown[]): this {
    return this.note("select", args);
  }
  eq(...args: unknown[]): this {
    return this.note("eq", args);
  }
  neq(...args: unknown[]): this {
    return this.note("neq", args);
  }
  in(...args: unknown[]): this {
    return this.note("in", args);
  }
  is(...args: unknown[]): this {
    return this.note("is", args);
  }
  not(...args: unknown[]): this {
    return this.note("not", args);
  }
  gt(...args: unknown[]): this {
    return this.note("gt", args);
  }
  gte(...args: unknown[]): this {
    return this.note("gte", args);
  }
  lt(...args: unknown[]): this {
    return this.note("lt", args);
  }
  lte(...args: unknown[]): this {
    return this.note("lte", args);
  }
  or(...args: unknown[]): this {
    return this.note("or", args);
  }
  filter(...args: unknown[]): this {
    return this.note("filter", args);
  }
  order(...args: unknown[]): this {
    return this.note("order", args);
  }
  /** Stage 7 (D77): slices like PostgREST (`from`..`to` inclusive) so a paged read over a large fixture terminates. */
  range(from: number, to: number): this {
    this.note("range", [from, to]);
    this.rows = this.rows.slice(from, to + 1);
    return this;
  }
  limit(count: number): this {
    this.note("limit", [count]);
    this.rows = this.rows.slice(0, count);
    return this;
  }
  then<TResult1 = FakePostgrestResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakePostgrestResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve<FakePostgrestResult>(
      this.error ? { data: null, error: this.error } : { data: [...this.rows], error: null }
    ).then(onfulfilled, onrejected);
  }
  single(): Promise<{ data: unknown; error: { message: string } | null }> {
    this.note("single", []);
    return Promise.resolve({ data: this.error ? null : (this.rows[0] ?? null), error: this.error });
  }
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> {
    this.note("maybeSingle", []);
    return Promise.resolve({ data: this.error ? null : (this.rows[0] ?? null), error: this.error });
  }
}

/** `createClient().from` stand-in. Throws for a table the fixture does not describe. */
export function fakeFrom(table: string): FakePostgrestQuery {
  const fixture = requireBackend();
  const rows = fixture.tables[table];
  if (!rows) {
    throw new UnseededBackendError(`Unseeded table: ${table}`);
  }
  return new FakePostgrestQuery(table, rows);
}

/** Every non-structure write chain issued since the backend was installed, in order (Stage 5). */
export function writeInvocations(): WriteInvocation[] {
  return writeLog.map((w) => ({ ...w }));
}

/** Every `from(table)` chain issued since the backend was installed, in order, with its builder calls. */
export function queryInvocations(): QueryInvocation[] {
  return queryLog.map((q) => ({ table: q.table, ops: q.ops.map((o) => ({ method: o.method, args: [...o.args] })) }));
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
  structure_units_bulk_save: { deleted_ou_ids: [], updated_ou_ids: [], created: [], placements_removed: 0 },
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
