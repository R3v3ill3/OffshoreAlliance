// WP1.7 — the one predicate that decides whether a first-use hint renders.
// Pure, so the truth table lives in __tests__/should-show.test.ts.

import { HINT_BY_ID, type HintId } from "./registry";

export interface ShouldShowHintInput {
  /** A user_hint_dismissals row exists for (this user, this hint). */
  seen: boolean;
  /** The dismissals query has resolved. False while loading or on error. */
  loaded: boolean;
  /** The screen has at least one thing the hint can point at. */
  hasTiles: boolean;
  /**
   * Dismissed in this session but not (yet) known to be persisted. The hook
   * folds this into `seen` via the query cache and passes false; the input
   * stays so a caller without a cache can express it directly.
   */
  dismissedThisSession: boolean;
  /** The viewer may edit. A read-only viewer has no rating control to hint at. */
  canWrite: boolean;
}

/**
 * Fails closed on purpose: while the dismissals query is loading (or errored)
 * nothing renders, because a hint that flashes and vanishes is worse than no
 * hint, and a hint shown to someone who dismissed it last week is a bug
 * report. An entry carrying `pending` is refused unconditionally — it is
 * data, not a control.
 */
export function shouldShowHint(id: HintId, input: ShouldShowHintInput): boolean {
  if (HINT_BY_ID[id]?.pending) return false;
  const { seen, loaded, hasTiles, dismissedThisSession, canWrite } = input;
  return loaded && !seen && !dismissedThisSession && hasTiles && canWrite;
}
