import { describe, expect, it } from "vitest";
import {
  sameModuleList,
  workspaceFormChanged,
  workspacePrefsPayload,
  workspaceSelectionEmpty,
  type WorkspaceFormState,
} from "../prefs-payload";
import type { WorkspaceModuleId } from "../modules";

const NO_OVERRIDE: WorkspaceFormState = {
  mode: "default",
  modules: null,
  allowShowEverything: undefined,
};

describe("sameModuleList", () => {
  it("compares null and list identity by value", () => {
    expect(sameModuleList(null, null)).toBe(true);
    expect(sameModuleList(null, [])).toBe(false);
    expect(sameModuleList(["inbox"], ["inbox"])).toBe(true);
    expect(sameModuleList(["inbox"], ["inbox", "actions"])).toBe(false);
    expect(sameModuleList(["inbox", "actions"], ["actions", "inbox"])).toBe(false);
  });
});

describe("workspaceFormChanged", () => {
  it("is false for an untouched form and true for each moved field", () => {
    expect(workspaceFormChanged(NO_OVERRIDE, { ...NO_OVERRIDE })).toBe(false);
    expect(workspaceFormChanged(NO_OVERRIDE, { ...NO_OVERRIDE, mode: "organiser" })).toBe(true);
    expect(workspaceFormChanged(NO_OVERRIDE, { ...NO_OVERRIDE, modules: ["inbox"] })).toBe(true);
    expect(
      workspaceFormChanged(NO_OVERRIDE, { ...NO_OVERRIDE, allowShowEverything: false })
    ).toBe(true);
  });
});

describe("workspaceSelectionEmpty", () => {
  it("only fires for an explicit empty list in organiser mode with defaults loaded", () => {
    const current: WorkspaceFormState = { ...NO_OVERRIDE, mode: "organiser", modules: [] };
    expect(
      workspaceSelectionEmpty({ current, effectiveMode: "organiser", defaultsAvailable: true })
    ).toBe(true);
    expect(
      workspaceSelectionEmpty({ current, effectiveMode: "organiser", defaultsAvailable: false })
    ).toBe(false);
    expect(
      workspaceSelectionEmpty({ current, effectiveMode: "full", defaultsAvailable: true })
    ).toBe(false);
    expect(
      workspaceSelectionEmpty({
        current: { ...current, modules: null },
        effectiveMode: "organiser",
        defaultsAvailable: true,
      })
    ).toBe(false);
  });
});

describe("workspacePrefsPayload", () => {
  it("sends nothing for a name-only edit (no workspace field moved)", () => {
    expect(
      workspacePrefsPayload({
        initial: NO_OVERRIDE,
        current: { ...NO_OVERRIDE },
        effectiveMode: "full",
        defaultsAvailable: true,
      })
    ).toBeUndefined();

    const storedModules: WorkspaceModuleId[] = ["inbox", "actions"];
    const stored: WorkspaceFormState = {
      mode: "organiser",
      modules: storedModules,
      allowShowEverything: false,
    };
    expect(
      workspacePrefsPayload({
        initial: stored,
        current: { ...stored, modules: [...storedModules] },
        effectiveMode: "organiser",
        defaultsAvailable: true,
      })
    ).toBeUndefined();
  });

  it("preserves the stored modules verbatim when the org defaults are unavailable", () => {
    const initial: WorkspaceFormState = {
      mode: "default",
      modules: ["inbox", "actions"],
      allowShowEverything: true,
    };
    // The resolver had to assume `full` without the defaults; the pinned list
    // must not be cleared on that guess.
    expect(
      workspacePrefsPayload({
        initial,
        current: { ...initial, mode: "full" },
        effectiveMode: "full",
        defaultsAvailable: false,
      })
    ).toEqual({ mode: "full", modules: ["inbox", "actions"], allowShowEverything: true });

    expect(
      workspacePrefsPayload({
        initial: NO_OVERRIDE,
        current: { ...NO_OVERRIDE, mode: "organiser" },
        effectiveMode: "full",
        defaultsAvailable: false,
      })
    ).toEqual({ mode: "organiser" });
  });

  it("sends nothing when the organiser selection is empty", () => {
    expect(
      workspacePrefsPayload({
        initial: NO_OVERRIDE,
        current: { ...NO_OVERRIDE, mode: "organiser", modules: [] },
        effectiveMode: "organiser",
        defaultsAvailable: true,
      })
    ).toBeUndefined();
  });

  it("sends the document for a normal organiser change", () => {
    expect(
      workspacePrefsPayload({
        initial: NO_OVERRIDE,
        current: { mode: "organiser", modules: ["inbox"], allowShowEverything: undefined },
        effectiveMode: "organiser",
        defaultsAvailable: true,
      })
    ).toEqual({ mode: "organiser", modules: ["inbox"] });
  });

  it("drops a pinned list in full mode and keeps a stored allowShowEverything", () => {
    expect(
      workspacePrefsPayload({
        initial: { mode: "organiser", modules: ["inbox"], allowShowEverything: false },
        current: { mode: "full", modules: ["inbox"], allowShowEverything: false },
        effectiveMode: "full",
        defaultsAvailable: true,
      })
    ).toEqual({ mode: "full", allowShowEverything: false });
  });

  it("clears the override entirely when the form returns to the role default", () => {
    expect(
      workspacePrefsPayload({
        initial: { mode: "organiser", modules: ["inbox"], allowShowEverything: undefined },
        current: NO_OVERRIDE,
        effectiveMode: "full",
        defaultsAvailable: true,
      })
    ).toEqual({});
  });
});
