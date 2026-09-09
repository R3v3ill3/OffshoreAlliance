import { describe, expect, it } from "vitest";
import { NoRowsAffectedError, assertRowsAffected } from "../assert-rows-affected";

describe("assertRowsAffected", () => {
  it("rethrows result.error untouched", () => {
    const original = new Error("boom");
    expect(() => assertRowsAffected({ error: original, count: 0 }, 1, "Deleting the unit")).toThrow(
      original
    );
    // A PostgREST error object (not an Error instance) is thrown as-is too.
    const pgErr = { code: "42501", message: "new row violates row-level security policy" };
    try {
      assertRowsAffected({ error: pgErr, count: null }, 1, "Deleting the unit");
      expect.fail("expected a throw");
    } catch (e) {
      expect(e).toBe(pgErr);
    }
  });

  it("passes when count equals expected", () => {
    expect(() => assertRowsAffected({ error: null, count: 1 }, 1, "x")).not.toThrow();
    expect(() => assertRowsAffected({ error: null, count: 5 }, 5, "x")).not.toThrow();
  });

  it("passes when count exceeds expected", () => {
    expect(() => assertRowsAffected({ error: null, count: 3 }, 1, "x")).not.toThrow();
  });

  it("throws NoRowsAffectedError when count is below expected", () => {
    let caught: unknown;
    try {
      assertRowsAffected({ error: null, count: 0 }, 1, "Deleting the unit");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NoRowsAffectedError);
    const err = caught as NoRowsAffectedError;
    expect(err.name).toBe("NoRowsAffectedError");
    expect(err.expected).toBe(1);
    expect(err.actual).toBe(0);
    expect(err.message).toContain("Deleting the unit");
    // The message covers both causes (RLS, and a concurrent change) and the remedy.
    expect(err.message).toMatch(/may not have permission/);
    expect(err.message).toMatch(/changed since you loaded it/);
    expect(err.message).toMatch(/Refresh and try again/);
  });

  it("throws on a partial write (some rows filtered by RLS)", () => {
    expect(() => assertRowsAffected({ error: null, count: 2 }, 4, "Removing the workers")).toThrow(
      NoRowsAffectedError
    );
  });

  it("passes when count is null (caller omitted { count: 'exact' })", () => {
    expect(() => assertRowsAffected({ error: null, count: null }, 1, "x")).not.toThrow();
  });

  it("passes when expected <= 0 regardless of count", () => {
    expect(() => assertRowsAffected({ error: null, count: 0 }, 0, "x")).not.toThrow();
    expect(() => assertRowsAffected({ error: null, count: 0 }, -1, "x")).not.toThrow();
  });
});
