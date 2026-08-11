import { describe, expect, it } from "vitest";
import {
  buildSmsReplyPrompt,
  containsPhoneNumber,
  parseDraftReplyCandidates,
  type SmsReplyPromptContext,
} from "@/lib/prompts/sms-reply-prompts";

const BASE_CTX: SmsReplyPromptContext = {
  transcript: [
    { direction: "outbound", body: "Hi Sam, quick one about the EBA meeting.", at: "2026-08-11T01:00:00Z" },
    { direction: "inbound", body: "When is it on again?", at: "2026-08-11T01:05:00Z" },
  ],
  worker: { name: "Sam Taylor", occupation: "Crane operator", employer: "FPSO Co" },
  ratings: [
    {
      activity: "EBA petition",
      rating: 2,
      binaryValue: null,
      notes: "keen but busy",
      ratedAt: "2026-08-01T00:00:00Z",
    },
  ],
  campaignName: "FPSO EBA 2026",
  activity: {
    title: "RSVP to the delegates meeting",
    description: "Confirm attendance",
    isBinary: true,
    supporterOutcomeValue: "yes",
  },
  cannedReplies: [{ title: "Meeting details", body: "Details are on the notice board." }],
  organiserName: "Jo Organiser",
};

describe("buildSmsReplyPrompt", () => {
  it("carries every §8.2 guardrail in the system prompt", () => {
    const { system } = buildSmsReplyPrompt(BASE_CTX);
    expect(system).toMatch(/NEVER invent commitments/i);
    expect(system).toMatch(/industrial or legal advice/i);
    expect(system).toMatch(/escalate/i);
    expect(system).toMatch(/NEVER include any phone number/i);
    expect(system).toMatch(/2 SMS segments/i);
    expect(system).toMatch(/Australian English/i);
    expect(system).toMatch(/nothing you write is sent automatically/i);
  });

  it("includes transcript, member, rating, CTA and canned-reply context in the user message", () => {
    const { user } = buildSmsReplyPrompt(BASE_CTX);
    expect(user).toContain("MEMBER: name: Sam Taylor · employer: FPSO Co · occupation: Crane operator");
    expect(user).toContain("EBA petition: rating 2 — keen but busy");
    expect(user).toContain("RSVP to the delegates meeting");
    expect(user).toContain("Meeting details: Details are on the notice board.");
    expect(user).toContain("MEMBER: When is it on again?");
    expect(user).toContain("US: Hi Sam, quick one about the EBA meeting.");
  });

  it("degrades gracefully with no worker / activity / ratings", () => {
    const { user } = buildSmsReplyPrompt({
      ...BASE_CTX,
      worker: null,
      ratings: [],
      activity: null,
      cannedReplies: [],
      campaignName: null,
      organiserName: null,
    });
    expect(user).toContain("not yet matched to a worker");
    expect(user).toContain("CURRENT ACTIVITY / ASK: none attached");
    expect(user).not.toContain("RECENT ASSESSMENTS");
  });
});

describe("parseDraftReplyCandidates", () => {
  it("parses a plain JSON array with labels attached", () => {
    const out = parseDraftReplyCandidates(
      JSON.stringify([
        { kind: "reply", body: "It's on Thursday arvo — I'll confirm the time and text you back." },
        { kind: "reply_and_advance", body: "Thursday arvo. Can I put you down as coming?" },
      ]),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "reply", label: "Answer only" });
    expect(out[1].kind).toBe("reply_and_advance");
  });

  it("tolerates code fences and surrounding prose", () => {
    const out = parseDraftReplyCandidates(
      'Here you go:\n```json\n[{"kind":"escalate_tone","body":"Good question — I\'ll take it to our official and come back to you."}]\n```\nHope that helps!',
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("escalate_tone");
  });

  it("drops invalid kinds, empty bodies, duplicates and caps at 3", () => {
    const out = parseDraftReplyCandidates(
      JSON.stringify([
        { kind: "reply", body: "First." },
        { kind: "reply", body: "Duplicate kind — dropped." },
        { kind: "auto_send", body: "Invalid kind." },
        { kind: "escalate_tone", body: "   " },
        { kind: "reply_and_advance", body: "Second." },
        { kind: "escalate_tone", body: "Third." },
      ]),
    );
    expect(out.map((c) => c.body)).toEqual(["First.", "Second.", "Third."]);
  });

  it("drops candidates carrying phone numbers (guardrail)", () => {
    const out = parseDraftReplyCandidates(
      JSON.stringify([
        { kind: "reply", body: "Call the office on 08 9123 4567 and ask for Jo." },
        { kind: "escalate_tone", body: "I'll get our official to ring you." },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("escalate_tone");
  });

  it("returns [] for garbage", () => {
    expect(parseDraftReplyCandidates("no json here")).toEqual([]);
    expect(parseDraftReplyCandidates('{"kind":"reply"}')).toEqual([]);
  });
});

describe("containsPhoneNumber", () => {
  it("flags AU-formatted and E.164 numbers", () => {
    expect(containsPhoneNumber("ring 0412 345 678 today")).toBe(true);
    expect(containsPhoneNumber("call +61 412 345 678")).toBe(true);
    expect(containsPhoneNumber("(08) 9123-4567")).toBe(true);
  });

  it("leaves ordinary numbers alone", () => {
    expect(containsPhoneNumber("Meeting at 5pm on the 21st, room 204.")).toBe(false);
    expect(containsPhoneNumber("The vote was 1234 to 567.")).toBe(false);
  });
});
