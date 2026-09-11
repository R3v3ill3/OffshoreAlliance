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

let backend: WallChartFixture | null = null;
let searchParams = new URLSearchParams();

export class UnseededBackendError extends Error {}

export function installBackend(fixture: WallChartFixture): void {
  backend = fixture;
}

export function resetBackend(): void {
  backend = null;
  searchParams = new URLSearchParams();
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
