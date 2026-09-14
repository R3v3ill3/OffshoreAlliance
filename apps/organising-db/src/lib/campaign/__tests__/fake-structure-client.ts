/**
 * WP2.2 Stage 5 — a recording fake of the Supabase client for the node and
 * hook tests of the settings / wizard / hook writers (wp2.2.md §11.12).
 *
 * Every `from(table)…` chain and every `rpc(name, args)` call is appended to
 * one `calls` list in issue order, so a test can assert both the exact `p_*`
 * payload of a structure RPC and its position relative to the reads and the
 * non-structure writes around it (e.g. "unassign, then the membership
 * delete"). Reads answer from `tables`; writes answer `{ data: null, error,
 * count }` from `counts`; RPCs answer from a per-name queue, then a static
 * default per RPC (the wrapper's zod schema accepts each default).
 *
 * Not a spy and not a `vi.mock`: plain data, like the wall-chart harness.
 */

import type { PostgrestErrorLike } from "../structure-api";

export type RecordedFromCall = {
  kind: "from";
  table: string;
  /** Builder methods in call order, e.g. `select`, `eq`, `in`, `delete`, `maybeSingle`. */
  ops: Array<{ method: string; args: unknown[] }>;
};

export type RecordedRpcCall = {
  kind: "rpc";
  name: string;
  args: Record<string, unknown>;
};

export type RecordedCall = RecordedFromCall | RecordedRpcCall;

export type FakeRpcAnswer = { data?: unknown; error?: PostgrestErrorLike | null };

export interface FakeStructureClientOptions {
  /** Rows a `select` chain on that table resolves with (filters are ignored). */
  tables?: Record<string, unknown[]>;
  /** `count` a write chain on that table resolves with (default `null`). */
  counts?: Record<string, number | null>;
  /** An error every chain on that table resolves with. */
  errors?: Record<string, PostgrestErrorLike>;
}

const DEFAULT_RPC_RESULTS: Readonly<Record<string, unknown>> = {
  structure_units_bulk_save: { deleted_ou_ids: [], updated_ou_ids: [], created: [], placements_removed: 0 },
  structure_unit_update: { ou_id: 0, updated_keys: [] },
  structure_placements_assign: { inserted: 0, moved: 0, skipped: 0, displaced: 0 },
  structure_placements_unassign: { removed: 0 },
  structure_placements_move: { moved: 0, inserted: 0, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 },
};

type ChainResult = { data: unknown; error: PostgrestErrorLike | null; count: number | null };

class FakeChain implements PromiseLike<ChainResult> {
  private write = false;
  private single = false;

  constructor(
    private readonly record: RecordedFromCall,
    private readonly opts: FakeStructureClientOptions
  ) {}

  private note(method: string, args: unknown[]): this {
    this.record.ops.push({ method, args: JSON.parse(JSON.stringify(args ?? [])) as unknown[] });
    return this;
  }

  select(...args: unknown[]): this {
    return this.note("select", args);
  }
  eq(...args: unknown[]): this {
    return this.note("eq", args);
  }
  in(...args: unknown[]): this {
    return this.note("in", args);
  }
  order(...args: unknown[]): this {
    return this.note("order", args);
  }
  limit(...args: unknown[]): this {
    return this.note("limit", args);
  }
  delete(...args: unknown[]): this {
    this.write = true;
    return this.note("delete", args);
  }
  update(...args: unknown[]): this {
    this.write = true;
    return this.note("update", args);
  }
  insert(...args: unknown[]): this {
    this.write = true;
    return this.note("insert", args);
  }
  upsert(...args: unknown[]): this {
    this.write = true;
    return this.note("upsert", args);
  }
  maybeSingle(): this {
    this.single = true;
    return this.note("maybeSingle", []);
  }

  private resolve(): ChainResult {
    const error = this.opts.errors?.[this.record.table] ?? null;
    if (this.write) {
      return { data: null, error, count: this.opts.counts?.[this.record.table] ?? null };
    }
    const rows = this.opts.tables?.[this.record.table] ?? [];
    return { data: this.single ? (rows[0] ?? null) : [...rows], error, count: null };
  }

  then<TResult1 = ChainResult, TResult2 = never>(
    onfulfilled?: ((value: ChainResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

export function createFakeStructureClient(opts: FakeStructureClientOptions = {}) {
  const calls: RecordedCall[] = [];
  const rpcQueues = new Map<string, FakeRpcAnswer[]>();

  const client = {
    from(table: string) {
      const record: RecordedFromCall = { kind: "from", table, ops: [] };
      calls.push(record);
      return new FakeChain(record, opts);
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ kind: "rpc", name, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> });
      const queued = rpcQueues.get(name)?.shift();
      if (queued) {
        return Promise.resolve({ data: queued.data ?? null, error: queued.error ?? null });
      }
      if (!(name in DEFAULT_RPC_RESULTS)) {
        throw new Error(`fake client: no default answer for rpc ${name}`);
      }
      return Promise.resolve({ data: DEFAULT_RPC_RESULTS[name], error: null });
    },
  };

  return {
    client,
    calls,
    /** Queue the next answer for one RPC name (each call consumes one). */
    answerRpc(name: string, answer: FakeRpcAnswer): void {
      const queue = rpcQueues.get(name) ?? [];
      queue.push(answer);
      rpcQueues.set(name, queue);
    },
    rpcCalls(): RecordedRpcCall[] {
      return calls.filter((c): c is RecordedRpcCall => c.kind === "rpc");
    },
    fromCalls(): RecordedFromCall[] {
      return calls.filter((c): c is RecordedFromCall => c.kind === "from");
    },
    /** `"rpc:<name>"` / `"from:<table>.<ops>"` per call, in order — for order assertions. */
    trace(): string[] {
      return calls.map((c) =>
        c.kind === "rpc" ? `rpc:${c.name}` : `from:${c.table}.${c.ops.map((o) => o.method).join(".")}`
      );
    },
  };
}

export type FakeStructureClient = ReturnType<typeof createFakeStructureClient>;
