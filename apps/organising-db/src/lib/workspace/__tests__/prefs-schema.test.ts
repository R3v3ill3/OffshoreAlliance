import { describe, expect, it } from "vitest";
import {
  parseWorkspaceDefaults,
  parseWorkspacePrefs,
  workspaceDefaultsSchema,
  workspaceModeSchema,
  workspacePrefsSchema,
} from "../prefs-schema";

const NOT_DOCUMENTS: unknown[] = [null, undefined, [], "x", 0, true];

describe("workspaceModeSchema", () => {
  it("accepts only full and organiser", () => {
    expect(workspaceModeSchema.safeParse("full").success).toBe(true);
    expect(workspaceModeSchema.safeParse("organiser").success).toBe(true);
    expect(workspaceModeSchema.safeParse("simple").success).toBe(false);
  });
});

describe("workspacePrefsSchema (strict, API write path)", () => {
  it("parses and round-trips a valid document", () => {
    const doc = { mode: "organiser", modules: ["actions", "inbox"], allowShowEverything: false };
    const r = workspacePrefsSchema.safeParse(doc);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual(doc);
    expect(workspacePrefsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown module ids, unknown keys and a non-enum mode", () => {
    expect(workspacePrefsSchema.safeParse({ modules: ["actions", "not_a_module"] }).success).toBe(false);
    expect(workspacePrefsSchema.safeParse({ mode: "simple" }).success).toBe(false);
    expect(workspacePrefsSchema.safeParse({ mode: "full", typo: 1 }).success).toBe(false);
    expect(workspacePrefsSchema.safeParse({ allowShowEverything: "yes" }).success).toBe(false);
  });
});

describe("workspaceDefaultsSchema (strict, API write path)", () => {
  it("parses and round-trips a valid document", () => {
    const doc = {
      byWorkRole: {
        organiser: { mode: "organiser", modules: ["wall_chart_people"], allowShowEverything: true },
        lead_organiser: { mode: "full" },
      },
    };
    const r = workspaceDefaultsSchema.safeParse(doc);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual(doc);
    expect(workspaceDefaultsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown work-role keys, unknown module ids and unknown keys", () => {
    expect(workspaceDefaultsSchema.safeParse({ byWorkRole: { admin: { mode: "full" } } }).success).toBe(false);
    expect(
      workspaceDefaultsSchema.safeParse({ byWorkRole: { organiser: { modules: ["nope"] } } }).success
    ).toBe(false);
    expect(workspaceDefaultsSchema.safeParse({ byWorkRole: { organiser: { mode: "simple" } } }).success).toBe(false);
    expect(workspaceDefaultsSchema.safeParse({ byWorkRole: {}, extra: true }).success).toBe(false);
    expect(workspaceDefaultsSchema.safeParse({ byWorkRole: { organiser: { mode: "full", x: 1 } } }).success).toBe(false);
  });
});

describe("parseWorkspacePrefs (lenient reader)", () => {
  it("returns null for anything that is not a document", () => {
    for (const v of NOT_DOCUMENTS) expect(parseWorkspacePrefs(v), String(v)).toBeNull();
  });

  it("strips unknown module ids but keeps the rest of the document", () => {
    expect(parseWorkspacePrefs({ mode: "organiser", modules: ["actions", "not_a_module"] })).toEqual({
      mode: "organiser",
      modules: ["actions"],
    });
  });

  it("ignores unknown top-level keys and returns null for a malformed field", () => {
    expect(parseWorkspacePrefs({ mode: "full", future: 1 })).toEqual({ mode: "full" });
    expect(parseWorkspacePrefs({ mode: "simple" })).toBeNull();
    expect(parseWorkspacePrefs({ modules: "actions" })).toBeNull();
    expect(parseWorkspacePrefs({})).toEqual({});
  });
});

describe("parseWorkspaceDefaults (lenient reader)", () => {
  it("returns null for anything that is not a document", () => {
    for (const v of NOT_DOCUMENTS) expect(parseWorkspaceDefaults(v), String(v)).toBeNull();
    expect(parseWorkspaceDefaults({ byWorkRole: 5 })).toBeNull();
    expect(parseWorkspaceDefaults({ byWorkRole: [] })).toBeNull();
  });

  it("drops one unusable role entry and keeps the entries beside it", () => {
    expect(
      parseWorkspaceDefaults({
        byWorkRole: {
          organiser: { mode: "organiser", modules: ["inbox"] },
          coordinator: "x",
          specialist: { mode: "simple" },
          lead_organiser: { mode: "full" },
        },
      })
    ).toEqual({
      byWorkRole: {
        organiser: { mode: "organiser", modules: ["inbox"] },
        lead_organiser: { mode: "full" },
      },
    });
    // A document whose only entry is unusable degrades to an empty map, not
    // to `null` — the caller then falls back per work role, not wholesale.
    expect(parseWorkspaceDefaults({ byWorkRole: { organiser: "x" } })).toEqual({
      byWorkRole: {},
    });
  });

  it("strips unknown work-role keys and unknown module ids but keeps the rest", () => {
    expect(
      parseWorkspaceDefaults({
        byWorkRole: {
          organiser: { mode: "organiser", modules: ["inbox", "nope"] },
          admin: { mode: "full" },
        },
      })
    ).toEqual({ byWorkRole: { organiser: { mode: "organiser", modules: ["inbox"] } } });
    expect(parseWorkspaceDefaults({})).toEqual({});
    expect(parseWorkspaceDefaults({ byWorkRole: {}, future: true })).toEqual({ byWorkRole: {} });
  });
});
