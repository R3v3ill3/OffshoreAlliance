import { describe, expect, it } from "vitest";
import { HINTS, HINT_BY_ID } from "../registry";

/**
 * WP1.7 — the hint registry is the single definition of every first-use
 * hint's id, copy and wiring status. These assertions are what "one
 * sentence, plan-3.6 vocabulary, pending until the control exists" mean
 * when executed.
 */

/** Retired vocabulary (plan 3.6, WP0.3). */
const RETIRED = /scope|universe|unalloc|no unit|\bOU\b|sms tools|standing campaign|episode/i;

describe("hint registry", () => {
  it("has unique snake_case ids that satisfy the user_hint_dismissals CHECK", () => {
    const ids = HINTS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Same expression as user_hint_dismissals_hint_id_check
    // (supabase/migrations/20260911100000_user_hint_dismissals_check.sql).
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
  });

  it("HINT_BY_ID covers every entry and only those", () => {
    expect(Object.keys(HINT_BY_ID).sort()).toEqual(HINTS.map((h) => h.id).sort());
    for (const h of HINTS) expect(HINT_BY_ID[h.id]).toBe(h);
  });

  it("copy is exactly one sentence", () => {
    for (const h of HINTS) {
      // One terminal full stop, and it is the last character. An em dash is
      // allowed (wall_chart_group_selector joins its two clauses with one);
      // a semicolon or a mid-string ". " would be a second sentence.
      expect(h.copy.endsWith("."), `${h.id} ends with a full stop`).toBe(true);
      expect(h.copy.split(".").length - 1, `${h.id} has one full stop`).toBe(1);
      expect(h.copy.includes(". "), `${h.id} has no mid-sentence break`).toBe(false);
      expect(h.copy.includes(";"), `${h.id} uses no semicolon join`).toBe(false);
    }
  });

  it("copy is plan-3.6 clean", () => {
    for (const h of HINTS) {
      expect(RETIRED.test(h.copy), `${h.id} copy uses a retired word: ${h.copy}`).toBe(false);
    }
  });

  it("the group-selector hint uses Group, Unit and Unassigned with 3.6 capitalisation", () => {
    const copy = HINT_BY_ID.wall_chart_group_selector.copy;
    expect(copy).toContain("Group");
    expect(copy).toContain("Unit");
    expect(copy).toContain("Unassigned");
  });

  it("exactly one entry is pending, and it is the group selector waiting on WP2.4", () => {
    const pending = HINTS.filter((h) => h.pending);
    expect(pending.map((h) => h.id)).toEqual(["wall_chart_group_selector"]);
    expect(pending[0].pending).toBe("WP2.4");
  });
});
