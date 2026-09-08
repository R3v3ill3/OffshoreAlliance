import { describe, it, expect } from "vitest";
import { detectMobileUserAgent } from "@/lib/device/detect-mobile";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("detectMobileUserAgent", () => {
  it("detects an iPhone", () => {
    expect(detectMobileUserAgent(IPHONE)).toBe(true);
  });

  it("detects an iPad (tablets get the touch default too)", () => {
    expect(detectMobileUserAgent(IPAD)).toBe(true);
  });

  it("detects Android", () => {
    expect(detectMobileUserAgent(ANDROID)).toBe(true);
  });

  it("does not match desktop Chrome", () => {
    expect(detectMobileUserAgent(DESKTOP_CHROME)).toBe(false);
  });

  it("treats an empty or missing user agent as desktop", () => {
    expect(detectMobileUserAgent("")).toBe(false);
    expect(detectMobileUserAgent(null)).toBe(false);
    expect(detectMobileUserAgent(undefined)).toBe(false);
  });
});
