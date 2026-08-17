/**
 * Emoji palette + the segment maths that makes emoji expensive.
 *
 * The billing behaviour is the reason the picker warns: one emoji
 * flips the whole message to UCS-2 and cuts capacity from 160 to 70
 * characters per part, so a message that fitted one credit can
 * silently become two or three — multiplied across every recipient.
 */
import { describe, expect, it } from "vitest";
import { SMS_EMOJI_ALL, SMS_EMOJI_GROUPS, hasEmoji } from "../emoji";
import { countSegments } from "../segments";

describe("SMS emoji palette", () => {
  it("has no duplicates across groups", () => {
    expect(new Set(SMS_EMOJI_ALL).size).toBe(SMS_EMOJI_ALL.length);
  });

  it("labels every group", () => {
    for (const g of SMS_EMOJI_GROUPS) {
      expect(g.label.trim()).not.toBe("");
      expect(g.emoji.length).toBeGreaterThan(0);
    }
  });

  it("offers only characters the counter treats as non-GSM", () => {
    // If a "emoji" were GSM-7 safe it would not belong in the picker —
    // and the UCS-2 warning attached to the picker would be a lie.
    for (const e of SMS_EMOJI_ALL) {
      expect(countSegments(e).encoding).toBe("UCS-2");
    }
  });

  it("avoids skin-tone modifiers and ZWJ sequences", () => {
    for (const e of SMS_EMOJI_ALL) {
      expect(e).not.toMatch(/[\u{1F3FB}-\u{1F3FF}]/u); // skin tones
      expect(e).not.toContain("‍"); // zero-width joiner
    }
  });
});

describe("hasEmoji", () => {
  it("detects emoji in a body", () => {
    expect(hasEmoji("Thanks 👍")).toBe(true);
    expect(hasEmoji("✅ done")).toBe(true);
  });

  it("is false for plain GSM text", () => {
    expect(hasEmoji("Hi Amy, meeting at 3pm.")).toBe(false);
    expect(hasEmoji("")).toBe(false);
  });
});

describe("emoji cost in segments", () => {
  it("keeps a short emoji message to one part", () => {
    const seg = countSegments("Thanks 👍");
    expect(seg.encoding).toBe("UCS-2");
    expect(seg.segments).toBe(1);
  });

  it("counts an astral emoji as two UTF-16 units, as carriers bill it", () => {
    expect(countSegments("👍").length).toBe(2);
  });

  it("turns a one-part GSM message into two parts when an emoji is added", () => {
    // 100 chars: comfortably one GSM-7 part (160), but over the 70-char
    // UCS-2 limit the moment a single emoji is present.
    const body = "a".repeat(100);
    expect(countSegments(body).segments).toBe(1);
    expect(countSegments(body).encoding).toBe("GSM-7");

    const withEmoji = `${body}👍`;
    expect(withEmoji.length).toBeLessThanOrEqual(160);
    expect(countSegments(withEmoji).encoding).toBe("UCS-2");
    expect(countSegments(withEmoji).segments).toBe(2);
  });

  it("reports the emoji among nonGsmChars so the composer can name it", () => {
    expect(countSegments("Great work 👏").nonGsmChars).toContain("👏");
  });
});
