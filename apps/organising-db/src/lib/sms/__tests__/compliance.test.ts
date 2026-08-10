import { describe, expect, it } from "vitest";
import { validateSmsBody } from "../compliance";

describe("validateSmsBody", () => {
  it("passes with org name and 'Reply STOP to opt out'", () => {
    const r = validateSmsBody(
      "Hi {{first_name}}, meeting Tuesday 5pm. - Offshore Alliance. Reply STOP to opt out"
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("accepts phrasing variants", () => {
    const bodies = [
      "Offshore Alliance update. Text STOP to end",
      "offshore  alliance news — txt STOP anytime",
      "From the Offshore Alliance. To opt-out reply here",
      "Offshore Alliance: reply STOP",
      "Offshore Alliance — opt out at any time by replying",
    ];
    for (const b of bodies) {
      expect(validateSmsBody(b).ok, b).toBe(true);
    }
  });

  it("fails without organisation identification", () => {
    const r = validateSmsBody("Meeting Tuesday. Reply STOP to opt out");
    expect(r.ok).toBe(false);
    expect(r.hasOrgName).toBe(false);
    expect(r.hasOptOut).toBe(true);
    expect(r.errors).toHaveLength(1);
  });

  it("fails without an opt-out instruction", () => {
    const r = validateSmsBody("Offshore Alliance meeting Tuesday 5pm.");
    expect(r.ok).toBe(false);
    expect(r.hasOptOut).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes("opt-out"))).toBe(true);
  });

  it("does not treat unrelated 'stop' as an opt-out instruction", () => {
    // "stop work meeting" carries no reply/text instruction.
    const r = validateSmsBody("Offshore Alliance: stop work meeting Tuesday");
    expect(r.hasOptOut).toBe(false);
  });

  it("fails an empty body on both checks", () => {
    const r = validateSmsBody("");
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
  });
});
