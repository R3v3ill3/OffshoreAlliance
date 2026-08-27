import { describe, expect, it } from "vitest";
import {
  foldTapbackMessages,
  parseSmsTapback,
  quotedMatchesBody,
} from "@/lib/sms/tapback";

const BLAST =
  "Hi Nick. Offshore Alliance here: We just sent ROV members an important sector update on the wave of employer's now bargaining & on the plan to combat the exploding issue of visa workers and job security. Check your email (incl. junk/spam we've got a email address). Check out the email for to see what's happening and how you can be part of it. If you don't fight, you lose! PS if you don't get the email, reply here and we will make sure we have your correct email.";

describe("parseSmsTapback", () => {
  it("parses the German iOS Like that landed in production", () => {
    const body = `Gefällt: „${BLAST}“`;
    expect(parseSmsTapback(body)).toEqual({
      kind: "like",
      emoji: "👍",
      quoted: BLAST,
    });
  });

  it("parses English iOS tapbacks", () => {
    expect(parseSmsTapback('Liked “hello there”')).toMatchObject({
      kind: "like",
      emoji: "👍",
      quoted: "hello there",
    });
    expect(parseSmsTapback('Loved "cheers"')).toMatchObject({
      kind: "love",
      quoted: "cheers",
    });
    expect(parseSmsTapback('Laughed at “oops”')).toMatchObject({
      kind: "laugh",
      quoted: "oops",
    });
    expect(parseSmsTapback("Disliked “nope”")).toMatchObject({
      kind: "dislike",
    });
    expect(parseSmsTapback("Emphasized “yes”")).toMatchObject({
      kind: "emphasize",
    });
    expect(parseSmsTapback("Questioned “wait”")).toMatchObject({
      kind: "question",
    });
  });

  it("does not treat Gefällt nicht as a Like", () => {
    expect(parseSmsTapback('Gefällt nicht: „nope“')).toMatchObject({
      kind: "dislike",
      quoted: "nope",
    });
  });

  it("parses Android Reacted-to fallbacks", () => {
    expect(parseSmsTapback('Reacted 👍 to "hello"')).toMatchObject({
      kind: "emoji",
      emoji: "👍",
      quoted: "hello",
    });
  });

  it("returns null for ordinary replies", () => {
    expect(parseSmsTapback("Yes I'll be there")).toBeNull();
    expect(parseSmsTapback("Gefällt mir das Angebot")).toBeNull();
    expect(parseSmsTapback("")).toBeNull();
    expect(parseSmsTapback(null)).toBeNull();
  });
});

describe("foldTapbackMessages", () => {
  it("hides the inbound tapback and chips the parent outbound", () => {
    const folded = foldTapbackMessages([
      {
        message_id: 1,
        direction: "outbound",
        body: BLAST,
        created_at: "2026-08-21T03:50:00Z",
        provider_message_id: "out-1",
        reactions: [],
      },
      {
        message_id: 2,
        direction: "inbound",
        body: `Gefällt: „${BLAST}“`,
        created_at: "2026-08-21T04:10:00Z",
        provider_message_id: "in-1",
        reactions: [],
      },
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0].message_id).toBe(1);
    expect(folded[0].reactions).toEqual([
      {
        kind: "like",
        emoji: "👍",
        from_e164: null,
        at: "2026-08-21T04:10:00Z",
        provider_message_id: "in-1",
      },
    ]);
  });

  it("leaves unmatched inbound text alone", () => {
    const msgs = [
      {
        message_id: 1,
        direction: "inbound",
        body: "See you on the job",
        created_at: "2026-08-21T04:10:00Z",
        provider_message_id: "in-2",
        reactions: [],
      },
    ];
    expect(foldTapbackMessages(msgs)).toEqual(msgs);
  });
});

describe("quotedMatchesBody", () => {
  it("matches the full quoted original", () => {
    expect(quotedMatchesBody(BLAST, BLAST)).toBe(true);
  });

  it("matches a truncated quote", () => {
    expect(quotedMatchesBody(BLAST, "Hi Nick. Offshore Alliance here…")).toBe(
      true,
    );
  });
});
