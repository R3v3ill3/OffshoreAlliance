import { describe, expect, it } from "vitest";
import {
  deriveRailState,
  isActionable,
  railStateRank,
  shouldPulse,
  type RailItemLike,
  type SmsRailState,
} from "../chat-rail-state";

function item(overrides: Partial<RailItemLike> = {}): RailItemLike {
  return {
    status: "pending",
    sms_opt_out: false,
    conversation_state: null,
    unread_count: 0,
    ...overrides,
  };
}

describe("deriveRailState — no conversation yet", () => {
  it("is not_messaged for a fresh row", () => {
    expect(deriveRailState(item())).toBe("not_messaged");
  });

  it("is not_messaged for a skipped row", () => {
    expect(deriveRailState(item({ status: "skipped" }))).toBe("not_messaged");
  });

  it("is sending while the send is in flight", () => {
    expect(deriveRailState(item({ status: "queued" }))).toBe("sending");
    expect(deriveRailState(item({ status: "sending" }))).toBe("sending");
  });

  it("is messaged once sent or delivered, even before the thread links", () => {
    expect(deriveRailState(item({ status: "sent" }))).toBe("messaged");
    expect(deriveRailState(item({ status: "delivered" }))).toBe("messaged");
  });
});

describe("deriveRailState — conversation states", () => {
  it("maps the plain conversation states", () => {
    expect(
      deriveRailState(item({ status: "sent", conversation_state: "messaged" })),
    ).toBe("messaged");
    expect(
      deriveRailState(item({ status: "sent", conversation_state: "convo" })),
    ).toBe("in_conversation");
    expect(
      deriveRailState(item({ status: "sent", conversation_state: "closed" })),
    ).toBe("closed");
    expect(
      deriveRailState(
        item({ status: "sent", conversation_state: "needs_response" }),
      ),
    ).toBe("needs_response");
  });

  it("treats needs_message and triage as messaged on a board row", () => {
    expect(
      deriveRailState(
        item({ status: "sent", conversation_state: "needs_message" }),
      ),
    ).toBe("messaged");
    expect(
      deriveRailState(item({ status: "sent", conversation_state: "triage" })),
    ).toBe("messaged");
  });

  it("is new_reply whenever there is unread inbound", () => {
    expect(
      deriveRailState(
        item({
          status: "delivered",
          conversation_state: "needs_response",
          unread_count: 2,
        }),
      ),
    ).toBe("new_reply");
    expect(
      deriveRailState(
        item({ status: "delivered", conversation_state: "convo", unread_count: 1 }),
      ),
    ).toBe("new_reply");
  });

  it("drops from new_reply to needs_response once marked read", () => {
    const unread = item({
      status: "delivered",
      conversation_state: "needs_response",
      unread_count: 1,
    });
    expect(deriveRailState(unread)).toBe("new_reply");
    // mark_read zeroes unread_count and leaves state alone — the row
    // must go static amber, not back to neutral.
    expect(deriveRailState({ ...unread, unread_count: 0 })).toBe(
      "needs_response",
    );
  });

  it("does not pulse a closed thread carrying stale unread", () => {
    expect(
      deriveRailState(
        item({ status: "sent", conversation_state: "closed", unread_count: 3 }),
      ),
    ).toBe("closed");
  });
});

describe("deriveRailState — precedence", () => {
  it("puts opt-out above an unread reply (STOP arrives as inbound)", () => {
    expect(
      deriveRailState(
        item({
          sms_opt_out: true,
          status: "delivered",
          conversation_state: "needs_response",
          unread_count: 1,
        }),
      ),
    ).toBe("opted_out");
  });

  it("treats opted_out and blocked item statuses as opted_out", () => {
    expect(deriveRailState(item({ status: "opted_out" }))).toBe("opted_out");
    expect(deriveRailState(item({ status: "blocked" }))).toBe("opted_out");
  });

  it("puts a send failure above conversation state", () => {
    expect(
      deriveRailState(
        item({ status: "failed", conversation_state: "messaged" }),
      ),
    ).toBe("failed");
  });

  it("puts opt-out above a send failure", () => {
    expect(
      deriveRailState(item({ status: "failed", sms_opt_out: true })),
    ).toBe("opted_out");
  });
});

describe("railStateRank", () => {
  it("sorts actionable rows above everything else", () => {
    const order: SmsRailState[] = [
      "closed",
      "not_messaged",
      "new_reply",
      "opted_out",
      "needs_response",
      "in_conversation",
    ];
    expect([...order].sort((a, b) => railStateRank(a) - railStateRank(b))).toEqual(
      [
        "new_reply",
        "needs_response",
        "in_conversation",
        "not_messaged",
        "closed",
        "opted_out",
      ],
    );
  });

  it("gives every state a distinct rank", () => {
    const states: SmsRailState[] = [
      "new_reply",
      "needs_response",
      "in_conversation",
      "failed",
      "messaged",
      "sending",
      "not_messaged",
      "closed",
      "opted_out",
    ];
    expect(new Set(states.map(railStateRank)).size).toBe(states.length);
  });
});

describe("isActionable / shouldPulse", () => {
  it("counts unread and seen-but-unanswered as needing a reply", () => {
    expect(isActionable("new_reply")).toBe(true);
    expect(isActionable("needs_response")).toBe(true);
  });

  it("does not count an active conversation with nothing unread", () => {
    expect(isActionable("in_conversation")).toBe(false);
    expect(isActionable("messaged")).toBe(false);
    expect(isActionable("not_messaged")).toBe(false);
    expect(isActionable("closed")).toBe(false);
    expect(isActionable("opted_out")).toBe(false);
  });

  it("pulses only on unread inbound", () => {
    expect(shouldPulse("new_reply")).toBe(true);
    expect(shouldPulse("needs_response")).toBe(false);
    expect(shouldPulse("in_conversation")).toBe(false);
  });
});
