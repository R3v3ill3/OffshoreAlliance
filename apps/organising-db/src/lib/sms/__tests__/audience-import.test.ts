import { describe, expect, it } from "vitest";
import {
  mapHeaders,
  parseAudienceRows,
  computeStagingCounts,
  isConsentBasis,
  CONSENT_BASES,
  type AudienceRow,
} from "../audience-import";

describe("mapHeaders", () => {
  it("maps exact canonical headers", () => {
    const { mapped, missing } = mapHeaders([
      "first_name",
      "last_name",
      "phone",
      "email",
    ]);
    expect(missing).toHaveLength(0);
    expect(mapped.first_name).toBe(0);
    expect(mapped.last_name).toBe(1);
    expect(mapped.phone).toBe(2);
    expect(mapped.email).toBe(3);
  });

  it("maps common synonyms case-insensitively", () => {
    const { mapped, missing } = mapHeaders([
      "First Name",
      "Surname",
      "Mobile Number",
      "E-Mail",
    ]);
    expect(missing).toHaveLength(0);
    expect(mapped.first_name).toBe(0);
    expect(mapped.last_name).toBe(1);
    expect(mapped.phone).toBe(2);
    expect(mapped.email).toBe(3);
  });

  it("reports missing required columns", () => {
    const { missing } = mapHeaders(["email", "notes"]);
    expect(missing).toEqual(
      expect.arrayContaining(["first_name", "last_name", "phone"])
    );
  });

  it("allows email to be optional", () => {
    const { mapped, missing } = mapHeaders([
      "first_name",
      "last_name",
      "phone",
    ]);
    expect(missing).toHaveLength(0);
    expect(mapped.email).toBeUndefined();
  });
});

describe("parseAudienceRows", () => {
  const headers = ["First Name", "Surname", "Mobile", "Email"];

  function row(
    first: string,
    last: string,
    phone: string,
    email = ""
  ): Record<string, string> {
    return {
      "First Name": first,
      Surname: last,
      Mobile: phone,
      Email: email,
    };
  }

  it("accepts valid AU mobiles", () => {
    const result = parseAudienceRows(
      [
        row("Amy", "Chen", "0400100014", "amy@test.com"),
        row("Bob", "Lee", "+61411222333"),
        row("Cat", "Day", "411222444"),
      ],
      headers
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rejected).toHaveLength(0);
    expect(result.rows[0].phone_e164).toBe("+61400100014");
    expect(result.rows[1].phone_e164).toBe("+61411222333");
    expect(result.rows[2].phone_e164).toBe("+61411222444");
    expect(result.rows[0].email).toBe("amy@test.com");
    expect(result.rows[1].email).toBeNull();
  });

  it("rejects rows missing first name", () => {
    const result = parseAudienceRows(
      [row("", "Lee", "0400100014")],
      headers
    );
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons).toContain("Missing first name");
  });

  it("rejects rows missing last name", () => {
    const result = parseAudienceRows(
      [row("Bob", "", "0400100014")],
      headers
    );
    expect(result.rejected[0].reasons).toContain("Missing last name");
  });

  it("rejects rows missing phone", () => {
    const result = parseAudienceRows(
      [row("Bob", "Lee", "")],
      headers
    );
    expect(result.rejected[0].reasons).toContain("Missing phone number");
  });

  it("rejects non-AU-mobile numbers", () => {
    const result = parseAudienceRows(
      [
        row("Bob", "Lee", "0298765432"),
        row("Cat", "Day", "12345"),
        row("Dan", "Fox", "+1555123456"),
      ],
      headers
    );
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toHaveLength(3);
    for (const r of result.rejected) {
      expect(r.reasons).toContain("Not a valid AU mobile number");
    }
  });

  it("collects multiple reasons per row", () => {
    const result = parseAudienceRows(
      [row("", "", "bad")],
      headers
    );
    expect(result.rejected[0].reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects all rows when required columns are missing", () => {
    const result = parseAudienceRows(
      [{ Notes: "hi", Extra: "stuff" }],
      ["Notes", "Extra"]
    );
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0]).toMatch(/Missing required columns/);
  });

  it("assigns sequential string keys", () => {
    const result = parseAudienceRows(
      [
        row("A", "B", "0400100014"),
        row("C", "D", "bad"),
        row("E", "F", "0411222333"),
      ],
      headers
    );
    expect(result.rows.map((r: AudienceRow) => r.key)).toEqual(["0", "2"]);
    expect(result.rejected.map((r) => r.key)).toEqual(["1"]);
  });
});

describe("computeStagingCounts", () => {
  it("counts sendable, opted_out, and no_mobile", () => {
    const workers = [
      { phone_e164: "+61400100014", sms_opt_out: false },
      { phone_e164: "+61411222333", sms_opt_out: true },
      { phone_e164: null, sms_opt_out: false },
      { phone_e164: "+61422333444", sms_opt_out: false },
    ];
    const counts = computeStagingCounts(workers);
    expect(counts.sendable).toBe(2);
    expect(counts.opted_out).toBe(1);
    expect(counts.no_mobile).toBe(1);
  });

  it("handles empty array", () => {
    expect(computeStagingCounts([])).toEqual({
      sendable: 0,
      opted_out: 0,
      no_mobile: 0,
    });
  });
});

describe("consent basis", () => {
  it("recognises valid bases", () => {
    for (const b of CONSENT_BASES) {
      expect(isConsentBasis(b)).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    expect(isConsentBasis("fake")).toBe(false);
    expect(isConsentBasis(42)).toBe(false);
    expect(isConsentBasis(null)).toBe(false);
  });
});
