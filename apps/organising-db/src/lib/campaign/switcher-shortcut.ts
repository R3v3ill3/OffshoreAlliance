/**
 * switcher-shortcut.ts — WP1.4.
 *
 * The campaign switcher's keyboard chord, `g` then `c`, as a pure state
 * machine. No DOM types beyond the fields it reads, so the whole thing is
 * testable in the node environment and the component keeps only the
 * addEventListener plumbing.
 *
 * Why a chord and not Cmd/Ctrl+K: a grep for global `keydown` handlers finds
 * three, all local — MobileBottomSheet (Escape, inside a sheet),
 * EmailComposer (Cmd/Ctrl+S to save a draft, with Cmd/Ctrl+K deliberately
 * left to the editor's link command) and use-claim-auto-renew (activity
 * detection). There is no global command palette. Cmd/Ctrl+K is the one
 * combination the email composer explicitly reserves, and the composer is
 * reachable inside a campaign, where this header is mounted. A Linear-style
 * `g` chord collides with nothing.
 */

export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** tagName of event.target, upper-case, or null. */
  targetTag: string | null;
  /** event.target.isContentEditable */
  targetEditable: boolean;
}

export const SWITCHER_CHORD = ["g", "c"] as const;
export const CHORD_TIMEOUT_MS = 1500;

/** Shown on the trigger's title and in the popover, so the chord is discoverable. */
export const SWITCHER_CHORD_HINT = "G then C";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export interface ChordState {
  key: string;
  at: number;
}

export interface ChordStep {
  pending: ChordState | null;
  open: boolean;
}

/**
 * One key press. Returns the next chord state and whether the switcher
 * should open.
 *
 * S1 any modifier held → no-op, chord reset.
 * S2 the event target is a form field or contenteditable → no-op, reset, so
 *    typing "g" in the wall chart's search box does nothing.
 * S3 `g` starts the chord.
 * S4 `c` within CHORD_TIMEOUT_MS of `g` opens and resets.
 * S5 `c` after the timeout does not open.
 * S6 any other key resets.
 * S7 `g` then `g` keeps the chord pending — a double tap is still a start.
 */
export function stepChord(
  pending: ChordState | null,
  ev: ShortcutKeyEvent,
  now: number
): ChordStep {
  // S1 — a modified key belongs to the browser or another handler.
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return { pending: null, open: false };

  // S2 — never steal a keystroke from something the user is typing into.
  if (ev.targetEditable) return { pending: null, open: false };
  if (ev.targetTag && TYPING_TAGS.has(ev.targetTag)) return { pending: null, open: false };

  const key = ev.key.toLowerCase();
  const [first, second] = SWITCHER_CHORD;

  // S4/S5 — the second key, but only inside the window.
  if (
    key === second &&
    pending?.key === first &&
    now - pending.at <= CHORD_TIMEOUT_MS
  ) {
    return { pending: null, open: true };
  }

  // S3/S7 — the first key always (re)starts the chord.
  if (key === first) return { pending: { key: first, at: now }, open: false };

  // S6 — anything else drops it.
  return { pending: null, open: false };
}

/** Read the fields `stepChord` needs off a real KeyboardEvent. */
export function toShortcutKeyEvent(ev: KeyboardEvent): ShortcutKeyEvent {
  const target = ev.target as HTMLElement | null;
  return {
    key: ev.key,
    metaKey: ev.metaKey,
    ctrlKey: ev.ctrlKey,
    altKey: ev.altKey,
    shiftKey: ev.shiftKey,
    targetTag: target?.tagName ? target.tagName.toUpperCase() : null,
    targetEditable: Boolean(target?.isContentEditable),
  };
}
