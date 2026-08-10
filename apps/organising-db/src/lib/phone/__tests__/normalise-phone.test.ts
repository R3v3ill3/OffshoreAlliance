import { describe, it, expect } from "vitest";
import {
  toE164,
  toE164Any,
  toLocal,
  toDisplay,
  isAuMobile,
} from "@/lib/phone/normalise-phone";

describe("toE164 (AU mobiles only)", () => {
  it("normalises the observed mobile formats", () => {
    expect(toE164("0400 100 014")).toBe("+61400100014");
    expect(toE164("+61 400-100-014")).toBe("+61400100014");
    expect(toE164("61400100014")).toBe("+61400100014");
    expect(toE164("400100014")).toBe("+61400100014");
    expect(toE164("(04) 0010-0014")).toBe("+61400100014");
    expect(toE164("61 0400 100 014")).toBe("+61400100014");
    expect(toE164(400100014)).toBe("+61400100014");
  });

  it("rejects landlines, 1300s and garbage", () => {
    expect(toE164("0862345678")).toBeNull();
    expect(toE164("1300123456")).toBeNull();
    expect(toE164("not a phone")).toBeNull();
    expect(toE164("040010001")).toBeNull(); // too short
    expect(toE164("04001000145")).toBeNull(); // too long
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe("toE164Any (any AU number)", () => {
  it("accepts landlines and service numbers", () => {
    expect(toE164Any("0862345678")).toBe("+61862345678");
    expect(toE164Any("02 9876 5432")).toBe("+61298765432");
    expect(toE164Any("61862345678")).toBe("+61862345678");
    expect(toE164Any("862345678")).toBe("+61862345678");
    expect(toE164Any("1300 123 456")).toBe("+611300123456");
  });

  it("still normalises mobiles and rejects garbage", () => {
    expect(toE164Any("0400 100 014")).toBe("+61400100014");
    expect(toE164Any("garbage")).toBeNull();
    expect(toE164Any("12345")).toBeNull();
  });
});

describe("toLocal", () => {
  it("returns the 0-prefixed local form", () => {
    expect(toLocal("+61400100014")).toBe("0400100014");
    expect(toLocal("400100014")).toBe("0400100014");
    expect(toLocal("0862345678")).toBe("0862345678");
    expect(toLocal("1300123456")).toBe("1300123456");
    expect(toLocal("junk")).toBeNull();
  });
});

describe("toDisplay", () => {
  it("formats mobiles, landlines and 1300s", () => {
    expect(toDisplay("+61400100014")).toBe("0400 100 014");
    expect(toDisplay("0298765432")).toBe("02 9876 5432");
    expect(toDisplay("1300123456")).toBe("1300 123 456");
  });

  it("falls back to the trimmed input when unrecognisable", () => {
    expect(toDisplay(" ext 1234 ")).toBe("ext 1234");
    expect(toDisplay("")).toBe("");
    expect(toDisplay(null)).toBe("");
  });
});

describe("isAuMobile", () => {
  it("is true only for mobiles", () => {
    expect(isAuMobile("0400 100 014")).toBe(true);
    expect(isAuMobile("0862345678")).toBe(false);
    expect(isAuMobile(null)).toBe(false);
  });
});
