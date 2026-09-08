import { describe, expect, it } from "vitest";

import {
  MAX_LOGIN_AGE_MS,
  firstInteractionPayload,
  formatLoginStamp,
  msSinceLogin,
  parseLoginStamp,
} from "../session-timing";

const T0 = 1_700_000_000_000;

describe("msSinceLogin", () => {
  it("returns the elapsed milliseconds for a normal delta", () => {
    expect(msSinceLogin(T0, T0 + 42_000)).toBe(42_000);
  });

  it("returns 0 when no time has passed", () => {
    expect(msSinceLogin(T0, T0)).toBe(0);
  });

  it("returns null without a stamp", () => {
    expect(msSinceLogin(null, T0)).toBeNull();
  });

  it("returns null when the clock moved backwards", () => {
    expect(msSinceLogin(T0, T0 - 1)).toBeNull();
  });

  it("returns null beyond the maximum login age", () => {
    expect(msSinceLogin(T0, T0 + MAX_LOGIN_AGE_MS + 1)).toBeNull();
  });

  it("accepts the exact boundary", () => {
    expect(msSinceLogin(T0, T0 + MAX_LOGIN_AGE_MS)).toBe(MAX_LOGIN_AGE_MS);
  });

  it("returns null for non-finite inputs", () => {
    expect(msSinceLogin(Number.NaN, T0)).toBeNull();
    expect(msSinceLogin(T0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatLoginStamp / parseLoginStamp", () => {
  it("round-trips both login sources", () => {
    for (const source of ["login_form", "session_restored"] as const) {
      const raw = formatLoginStamp(T0, source);
      expect(parseLoginStamp(raw)).toEqual({ ts: T0, source });
    }
  });

  it("formats as <epochMs>:<source>", () => {
    expect(formatLoginStamp(T0, "login_form")).toBe(`${T0}:login_form`);
  });

  it.each([null, "", "abc", "123", ":login_form", "abc:login_form", "123:bogus", "12.5:login_form"])(
    "returns null for malformed input %p",
    (raw) => {
      expect(parseLoginStamp(raw)).toBeNull();
    }
  );
});

describe("firstInteractionPayload", () => {
  it("returns null once the event has already fired this session", () => {
    expect(
      firstInteractionPayload({
        stamp: { ts: T0, source: "login_form" },
        now: T0 + 1_000,
        campaignId: 7,
        interaction: "tile_click",
        alreadyFired: true,
      })
    ).toBeNull();
  });

  it("still builds a payload without a stamp, marked unknown", () => {
    expect(
      firstInteractionPayload({
        stamp: null,
        now: T0,
        campaignId: 7,
        interaction: "drag",
        alreadyFired: false,
      })
    ).toEqual({
      campaign_id: 7,
      ms_since_login: null,
      interaction: "drag",
      login_source: "unknown",
    });
  });

  it("carries the timing and source of a login_form stamp", () => {
    expect(
      firstInteractionPayload({
        stamp: { ts: T0, source: "login_form" },
        now: T0 + 12_345,
        campaignId: 42,
        interaction: "tile_click",
        alreadyFired: false,
      })
    ).toEqual({
      campaign_id: 42,
      ms_since_login: 12_345,
      interaction: "tile_click",
      login_source: "login_form",
    });
  });

  it("labels a restored session distinctly so it can be filtered out", () => {
    const payload = firstInteractionPayload({
      stamp: { ts: T0, source: "session_restored" },
      now: T0 + 500,
      campaignId: 1,
      interaction: "filter",
      alreadyFired: false,
    });
    expect(payload?.login_source).toBe("session_restored");
  });

  it("nulls the duration when the stamp is stale, but still fires", () => {
    const payload = firstInteractionPayload({
      stamp: { ts: T0, source: "login_form" },
      now: T0 + MAX_LOGIN_AGE_MS + 1,
      campaignId: 1,
      interaction: "rating",
      alreadyFired: false,
    });
    expect(payload).not.toBeNull();
    expect(payload?.ms_since_login).toBeNull();
  });

  it.each(["tile_click", "drag", "rating", "filter"] as const)(
    "passes the %s interaction through unchanged",
    (interaction) => {
      const payload = firstInteractionPayload({
        stamp: null,
        now: T0,
        campaignId: 1,
        interaction,
        alreadyFired: false,
      });
      expect(payload?.interaction).toBe(interaction);
    }
  );
});
