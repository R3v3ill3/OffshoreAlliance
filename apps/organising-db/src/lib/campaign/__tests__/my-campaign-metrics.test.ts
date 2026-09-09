import { describe, expect, it } from "vitest";
import {
  NO_ACTIVITY_LABEL,
  formatLastActivity,
  isLastActivityKind,
  ratedCount,
  ratingBarTotal,
  toRatingBarBuckets,
} from "../my-campaign-metrics";

const RATINGS = { noRating: 5, r1: 1, r2: 2, r3: 3, r4: 4 };

describe("rating bar mapping", () => {
  it("M1 noRating → unrated, other keys pass through", () => {
    expect(toRatingBarBuckets(RATINGS)).toEqual({ r1: 1, r2: 2, r3: 3, r4: 4, unrated: 5 });
  });

  it("M2 ratedCount sums the four rated buckets only", () => {
    expect(ratedCount(RATINGS)).toBe(10);
    expect(ratedCount({ noRating: 9, r1: 0, r2: 0, r3: 0, r4: 0 })).toBe(0);
  });

  it("M3 the bar total is the People number (namedWorkers); zero collapses the bar", () => {
    expect(ratingBarTotal({ namedWorkers: 15 })).toBe(15);
    expect(ratingBarTotal({ namedWorkers: 0 })).toBe(0);
  });
});

describe("formatLastActivity", () => {
  const NOW = Date.parse("2026-09-09T12:00:00Z");
  const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

  it("F1 null → No activity yet", () => {
    expect(formatLastActivity(null, null, NOW)).toBe(NO_ACTIVITY_LABEL);
    expect(formatLastActivity(null, "rating", NOW)).toBe(NO_ACTIVITY_LABEL);
    expect(formatLastActivity(hoursAgo(1), null, NOW)).toBe(NO_ACTIVITY_LABEL);
  });

  it("F2 future or unparseable → No activity yet, never a negative age", () => {
    expect(formatLastActivity(hoursAgo(-2), "call", NOW)).toBe(NO_ACTIVITY_LABEL);
    expect(formatLastActivity("not a date", "call", NOW)).toBe(NO_ACTIVITY_LABEL);
  });

  it("F3 <24h today, <48h yesterday, then N days ago up to 30, then a date", () => {
    expect(formatLastActivity(hoursAgo(0), "sms", NOW)).toBe("SMS today");
    expect(formatLastActivity(hoursAgo(23), "sms", NOW)).toBe("SMS today");
    expect(formatLastActivity(hoursAgo(24), "sms", NOW)).toBe("SMS yesterday");
    expect(formatLastActivity(hoursAgo(47), "sms", NOW)).toBe("SMS yesterday");
    expect(formatLastActivity(hoursAgo(48), "sms", NOW)).toBe("SMS 2 days ago");
    expect(formatLastActivity(hoursAgo(30 * 24), "sms", NOW)).toBe("SMS 30 days ago");
    expect(formatLastActivity(hoursAgo(31 * 24), "sms", NOW)).toBe("SMS 09 Aug 2026");
  });

  it("F4 kind labels use plan 3.6 words", () => {
    expect(formatLastActivity(hoursAgo(1), "rating", NOW)).toBe("Rating today");
    expect(formatLastActivity(hoursAgo(1), "call", NOW)).toBe("Call today");
    expect(formatLastActivity(hoursAgo(1), "sms", NOW)).toBe("SMS today");
    expect(formatLastActivity(hoursAgo(1), "list_fire", NOW)).toBe("List fired today");
  });

  it("isLastActivityKind guards the RPC's text column", () => {
    for (const k of ["rating", "call", "sms", "list_fire"]) expect(isLastActivityKind(k)).toBe(true);
    expect(isLastActivityKind("email")).toBe(false);
    expect(isLastActivityKind(null)).toBe(false);
  });
});
