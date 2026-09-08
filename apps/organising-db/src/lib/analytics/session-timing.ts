/**
 * Login → first-wall-chart-interaction timing (WP0.2).
 *
 * The plan's §8 metric is "clicks and seconds from login to the wall chart of a
 * named campaign". That needs a t0 recorded at sign-in and a once-per-session
 * "already measured" flag, both of which outlive a client-side navigation.
 *
 * STORAGE RULE. The orchestrator's rule is "do not keep view state in
 * localStorage". Both keys here are written to `sessionStorage`, not
 * `localStorage`, and neither is view state: one is a per-tab timing stamp and
 * the other a per-tab "already measured" flag. Nothing in the UI reads them —
 * losing them degrades a metric, not a view. (`session-recovery.ts` clears only
 * `sb-`-prefixed sessionStorage keys, so the `oux:` keys survive a recovery.)
 *
 * Everything that makes a decision is a pure function taking `now` as an
 * argument, so the whole timer is testable without fake timers or a DOM; the
 * three storage edges are one-liners wrapped in try/catch.
 */

import type {
  Interaction,
  LoginSource,
  WallchartFirstInteractionProps,
} from "./events";

/** A stamp older than this is treated as unusable (tab left open overnight). */
export const MAX_LOGIN_AGE_MS = 6 * 60 * 60 * 1000;

export const LOGIN_STAMP_KEY = "oux:login-ts";
export const FIRST_INTERACTION_KEY = "oux:wallchart-first-interaction";

export type LoginStamp = { ts: number; source: LoginSource };

const LOGIN_SOURCES: readonly LoginSource[] = ["login_form", "session_restored"];

/**
 * Milliseconds between the login stamp and `now`, or null when the number
 * would be a lie: no stamp, a clock that moved backwards, or a stale stamp.
 */
export function msSinceLogin(loginTs: number | null, now: number): number | null {
  if (loginTs === null) return null;
  if (!Number.isFinite(loginTs) || !Number.isFinite(now)) return null;
  if (now < loginTs) return null;
  const delta = now - loginTs;
  if (delta > MAX_LOGIN_AGE_MS) return null;
  return delta;
}

/** `"<epochMs>:<source>"`. Inverse of {@link parseLoginStamp}. */
export function formatLoginStamp(ts: number, source: LoginSource): string {
  return `${ts}:${source}`;
}

/** Parses a stored stamp. Returns null on any malformed input. */
export function parseLoginStamp(raw: string | null): LoginStamp | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep <= 0) return null;
  const tsRaw = raw.slice(0, sep);
  const source = raw.slice(sep + 1);
  if (!/^\d+$/.test(tsRaw)) return null;
  if (!LOGIN_SOURCES.includes(source as LoginSource)) return null;
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return null;
  return { ts, source: source as LoginSource };
}

/**
 * The whole once-per-session + timing decision as one pure function: returns
 * the exact props for `trackWallchartFirstInteraction`, or null when the event
 * must not fire.
 */
export function firstInteractionPayload(a: {
  stamp: LoginStamp | null;
  now: number;
  campaignId: number;
  interaction: Interaction;
  alreadyFired: boolean;
}): WallchartFirstInteractionProps | null {
  if (a.alreadyFired) return null;
  return {
    campaign_id: a.campaignId,
    ms_since_login: msSinceLogin(a.stamp?.ts ?? null, a.now),
    interaction: a.interaction,
    login_source: a.stamp?.source ?? "unknown",
  };
}

// ---------------------------------------------------------------------------
// Storage edges. One line each, never throw, never read during render.
// ---------------------------------------------------------------------------

export function stampLogin(source: LoginSource, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(LOGIN_STAMP_KEY, formatLoginStamp(now, source));
  } catch {
    /* storage unavailable — the metric degrades, nothing else does */
  }
}

export function readLoginStamp(): LoginStamp | null {
  try {
    return parseLoginStamp(window.sessionStorage.getItem(LOGIN_STAMP_KEY));
  } catch {
    return null;
  }
}

export function hasFiredFirstInteraction(): boolean {
  try {
    return window.sessionStorage.getItem(FIRST_INTERACTION_KEY) === "1";
  } catch {
    // Cannot tell — assume it has, so a broken storage cannot spam the event.
    return true;
  }
}

export function markFirstInteractionFired(): void {
  try {
    window.sessionStorage.setItem(FIRST_INTERACTION_KEY, "1");
  } catch {
    /* storage unavailable — the metric degrades, nothing else does */
  }
}
