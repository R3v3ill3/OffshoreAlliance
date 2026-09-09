/**
 * PostgREST returns 2xx with zero rows when a DELETE or UPDATE is filtered
 * out by RLS, so a write that "succeeded" may have changed nothing. Every
 * campaign-scoped delete in the app passes `{ count: "exact" }` and then
 * runs its result through `assertRowsAffected` so the failure is loud (WP1.6).
 */

/**
 * Raised when a write succeeded at the transport level but changed fewer rows
 * than expected. Two causes look identical from the client: RLS filtered the
 * rows (no permission on this campaign), or the rows were changed or removed
 * by someone else since the page loaded. The message names both.
 */
export class NoRowsAffectedError extends Error {
  readonly expected: number;
  readonly actual: number;

  constructor(action: string, expected: number, actual: number) {
    super(
      `${action}: nothing changed. You may not have permission to change this campaign, or the data changed since you loaded it. Refresh and try again.`
    );
    this.name = "NoRowsAffectedError";
    this.expected = expected;
    this.actual = actual;
  }
}

export type CountedResult = { error: unknown; count: number | null };

/**
 * Throws when a counted PostgREST write affected fewer rows than expected.
 *
 * - `result.error` is rethrown untouched, so this can replace an
 *   `if (error) throw error` line one-for-one.
 * - `count` is null when the caller forgot `{ count: "exact" }` — treated as
 *   "unknown", not as failure, so adding the assertion can never turn a
 *   working call into a broken one.
 * - `expected <= 0` is a no-op: a worker may legitimately be in no unit.
 */
export function assertRowsAffected(result: CountedResult, expected: number, action: string): void {
  if (result.error) throw result.error;
  if (expected <= 0) return;
  if (result.count == null) return;
  if (result.count < expected) throw new NoRowsAffectedError(action, expected, result.count);
}
