/**
 * parseListSendersResponse — the Mobile Message sender catalogue.
 *
 * This parser is load-bearing in a non-obvious way: an unrecognised
 * response shape yields an empty catalogue, and `inboundCheckForPhone`
 * treats an empty catalogue as "could not verify", which hard-blocks
 * every P2P chat and survey send with a 409. It shipped with no tests
 * and only two accepted wrapper keys — the same "assumed the payload
 * shape" failure the inbound and delivery-receipt paths already hit.
 */
import { describe, expect, it } from "vitest";
import { parseListSendersResponse } from "@/lib/sms/provider/mobile-message-provider";

describe("parseListSendersResponse", () => {
  const rows = [
    { sender: "61485900133", type: "dedicated_number", status: "active" },
    { sender: "61485900180", type: "dedicated_number", status: "active" },
  ];

  it("parses the documented { results } shape", () => {
    expect(parseListSendersResponse({ results: rows })).toHaveLength(2);
  });

  it("parses the { senders } shape", () => {
    expect(parseListSendersResponse({ senders: rows })).toHaveLength(2);
  });

  it("parses a { data } wrapper", () => {
    expect(parseListSendersResponse({ data: rows })).toHaveLength(2);
  });

  it("parses a bare array", () => {
    const parsed = parseListSendersResponse(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].sender).toBe("61485900133");
    expect(parsed[0].type).toBe("dedicated_number");
  });

  it("falls back to `number` when `sender` is absent", () => {
    expect(
      parseListSendersResponse({ results: [{ number: "61485900133" }] })[0]
        .sender,
    ).toBe("61485900133");
  });

  it("accepts bare string and numeric entries", () => {
    const parsed = parseListSendersResponse([
      "61485900133",
      61485900180,
    ] as unknown);
    expect(parsed.map((s) => s.sender)).toEqual([
      "61485900133",
      "61485900180",
    ]);
  });

  it("drops entries with no usable sender", () => {
    expect(
      parseListSendersResponse({ results: [{ type: "alpha" }, ...rows] }),
    ).toHaveLength(2);
  });

  it("returns empty — not a throw — for null and unexpected shapes", () => {
    expect(parseListSendersResponse(null)).toEqual([]);
    expect(parseListSendersResponse(undefined)).toEqual([]);
    expect(parseListSendersResponse("nope")).toEqual([]);
    expect(parseListSendersResponse({ unexpected: rows })).toEqual([]);
  });
});
