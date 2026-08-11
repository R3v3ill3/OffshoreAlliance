import { describe, expect, it } from "vitest";
import {
  formatSmsReadinessWarning,
  normalisePhoneE164OrNull,
  smsReadiness,
  type SmsReadinessInput,
} from "../build-list-readiness";

describe("normalisePhoneE164OrNull", () => {
  it("returns null for null and undefined", () => {
    expect(normalisePhoneE164OrNull(null)).toBeNull();
    expect(normalisePhoneE164OrNull(undefined)).toBeNull();
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(normalisePhoneE164OrNull("")).toBeNull();
    expect(normalisePhoneE164OrNull("   ")).toBeNull();
    expect(normalisePhoneE164OrNull("\t\n")).toBeNull();
  });

  it("trims surrounding whitespace off a real value", () => {
    expect(normalisePhoneE164OrNull("  +61400000001  ")).toBe("+61400000001");
  });

  it("passes an already-clean value through unchanged", () => {
    expect(normalisePhoneE164OrNull("+61400000001")).toBe("+61400000001");
  });
});

describe("smsReadiness", () => {
  it("returns all-zero counts for an empty list", () => {
    expect(smsReadiness([])).toEqual({
      total: 0,
      sendable: 0,
      missingMobile: 0,
      optedOut: 0,
    });
  });

  it("counts every recipient sendable when all have a mobile and are not opted out", () => {
    const items: SmsReadinessInput[] = [
      { phone_e164: "+61400000001", sms_opt_out: false },
      { phone_e164: "+61400000002", sms_opt_out: false },
    ];
    expect(smsReadiness(items)).toEqual({
      total: 2,
      sendable: 2,
      missingMobile: 0,
      optedOut: 0,
    });
  });

  it("counts missing-mobile-only recipients", () => {
    const items: SmsReadinessInput[] = [
      { phone_e164: null, sms_opt_out: false },
      { phone_e164: "+61400000001", sms_opt_out: false },
    ];
    expect(smsReadiness(items)).toEqual({
      total: 2,
      sendable: 1,
      missingMobile: 1,
      optedOut: 0,
    });
  });

  it("counts opted-out-only recipients", () => {
    const items: SmsReadinessInput[] = [
      { phone_e164: "+61400000001", sms_opt_out: true },
      { phone_e164: "+61400000002", sms_opt_out: false },
    ];
    expect(smsReadiness(items)).toEqual({
      total: 2,
      sendable: 1,
      missingMobile: 0,
      optedOut: 1,
    });
  });

  it("counts an opted-out worker with no mobile once, as optedOut (the double-count trap)", () => {
    const items: SmsReadinessInput[] = [{ phone_e164: null, sms_opt_out: true }];
    const counts = smsReadiness(items);
    expect(counts).toEqual({
      total: 1,
      sendable: 0,
      missingMobile: 0,
      optedOut: 1,
    });
    expect(counts.sendable + counts.missingMobile + counts.optedOut).toBe(
      counts.total,
    );
  });

  it("treats sms_opt_out: null as false", () => {
    const items: SmsReadinessInput[] = [{ phone_e164: "+61400000001", sms_opt_out: null }];
    expect(smsReadiness(items)).toEqual({
      total: 1,
      sendable: 1,
      missingMobile: 0,
      optedOut: 0,
    });
  });

  it("treats a whitespace-only phone_e164 as missing", () => {
    const items: SmsReadinessInput[] = [{ phone_e164: "   ", sms_opt_out: false }];
    expect(smsReadiness(items)).toEqual({
      total: 1,
      sendable: 0,
      missingMobile: 1,
      optedOut: 0,
    });
  });

  it("buckets sum to total on a random mix", () => {
    const items: SmsReadinessInput[] = [
      { phone_e164: "+61400000001", sms_opt_out: false },
      { phone_e164: null, sms_opt_out: false },
      { phone_e164: "+61400000002", sms_opt_out: true },
      { phone_e164: null, sms_opt_out: true },
      { phone_e164: "  ", sms_opt_out: false },
      { phone_e164: "+61400000003", sms_opt_out: null },
    ];
    const counts = smsReadiness(items);
    expect(counts.total).toBe(items.length);
    expect(counts.sendable + counts.missingMobile + counts.optedOut).toBe(
      counts.total,
    );
    expect(counts).toEqual({
      total: 6,
      sendable: 2,
      missingMobile: 2,
      optedOut: 2,
    });
  });
});

describe("formatSmsReadinessWarning", () => {
  it("returns null at full readiness", () => {
    expect(
      formatSmsReadinessWarning({ total: 3, sendable: 3, missingMobile: 0, optedOut: 0 }),
    ).toBeNull();
  });

  it("reads 'N without a mobile, M opted out' when both buckets are non-zero", () => {
    expect(
      formatSmsReadinessWarning({ total: 5, sendable: 2, missingMobile: 2, optedOut: 1 }),
    ).toBe("2 without a mobile, 1 opted out");
  });

  it("is a single clause when missingMobile is zero", () => {
    expect(
      formatSmsReadinessWarning({ total: 3, sendable: 2, missingMobile: 0, optedOut: 1 }),
    ).toBe("1 opted out");
  });

  it("is a single clause when optedOut is zero", () => {
    expect(
      formatSmsReadinessWarning({ total: 3, sendable: 2, missingMobile: 1, optedOut: 0 }),
    ).toBe("1 without a mobile");
  });
});
