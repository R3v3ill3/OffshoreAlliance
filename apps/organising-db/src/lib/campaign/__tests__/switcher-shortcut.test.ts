import { describe, expect, it } from "vitest";

import {
  CHORD_TIMEOUT_MS,
  SWITCHER_CHORD,
  SWITCHER_CHORD_HINT,
  stepChord,
  type ShortcutKeyEvent,
} from "../switcher-shortcut";

const ev = (over: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  key: "g",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  targetTag: "BODY",
  targetEditable: false,
  ...over,
});

const PENDING = { key: "g", at: 1_000 };

describe("stepChord — g then c opens the campaign switcher", () => {
  it("S1 — a held modifier is a no-op and drops the chord", () => {
    for (const mod of ["metaKey", "ctrlKey", "altKey"] as const) {
      expect(stepChord(PENDING, ev({ key: "c", [mod]: true }), 1_100), mod).toEqual({
        pending: null,
        open: false,
      });
    }
  });

  it("S2 — typing into a field never steals the keystroke", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(stepChord(null, ev({ targetTag: tag }), 0), tag).toEqual({
        pending: null,
        open: false,
      });
      expect(stepChord(PENDING, ev({ key: "c", targetTag: tag }), 1_100), tag).toEqual({
        pending: null,
        open: false,
      });
    }
    expect(stepChord(PENDING, ev({ key: "c", targetEditable: true }), 1_100)).toEqual({
      pending: null,
      open: false,
    });
  });

  it("S3 — g starts the chord", () => {
    expect(stepChord(null, ev({ key: "g" }), 500)).toEqual({
      pending: { key: "g", at: 500 },
      open: false,
    });
  });

  it("S4 — c inside the window opens and resets", () => {
    expect(stepChord(PENDING, ev({ key: "c" }), 1_000 + CHORD_TIMEOUT_MS)).toEqual({
      pending: null,
      open: true,
    });
    expect(stepChord(PENDING, ev({ key: "c" }), 1_001)).toEqual({
      pending: null,
      open: true,
    });
  });

  it("S5 — c after the window does not open", () => {
    expect(stepChord(PENDING, ev({ key: "c" }), 1_001 + CHORD_TIMEOUT_MS)).toEqual({
      pending: null,
      open: false,
    });
  });

  it("S5 — c with no pending g does nothing", () => {
    expect(stepChord(null, ev({ key: "c" }), 0)).toEqual({ pending: null, open: false });
  });

  it("S6 — any other key resets the chord", () => {
    expect(stepChord(PENDING, ev({ key: "x" }), 1_100)).toEqual({
      pending: null,
      open: false,
    });
  });

  it("S7 — g then g keeps the chord pending, restarting the clock", () => {
    expect(stepChord(PENDING, ev({ key: "g" }), 1_100)).toEqual({
      pending: { key: "g", at: 1_100 },
      open: false,
    });
  });

  it("is case-insensitive, so Shift+G then C still works", () => {
    const first = stepChord(null, ev({ key: "G", shiftKey: true }), 0);
    expect(first.pending).toEqual({ key: "g", at: 0 });
    expect(stepChord(first.pending, ev({ key: "C", shiftKey: true }), 10).open).toBe(true);
  });

  it("states the chord and its hint in one place", () => {
    expect(SWITCHER_CHORD).toEqual(["g", "c"]);
    expect(SWITCHER_CHORD_HINT).toBe("G then C");
  });
});
