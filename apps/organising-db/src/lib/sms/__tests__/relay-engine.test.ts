import { describe, expect, it } from "vitest";
import {
  GENERIC_MEMBER_CONTEXT,
  chooseBridgeMember,
  composeForwardBody,
  composeMemberAttribution,
  composeTargetReplyBody,
  firstForwardConfirmation,
  resolveFirstForwardConfirmation,
  RELAY_FIRST_FORWARD_CONFIRMATION,
  RELAY_FIRST_FORWARD_CONFIRMATION_DIRECT,
  decideMemberForward,
  matchPhoneInList,
  matchRelayTarget,
  renderRelayTemplate,
  resolveRelayDirection,
  type BridgeCandidate,
  type RelayTargetLike,
} from "@/lib/sms/relay-engine";

function target(overrides: Partial<RelayTargetLike> = {}): RelayTargetLike {
  return {
    target_id: 1,
    phone_e164: "+61411222333",
    display_name: "MP's office",
    is_active: true,
    ...overrides,
  };
}

describe("matchRelayTarget / resolveRelayDirection", () => {
  const targets = [
    target(),
    target({ target_id: 2, phone_e164: "+61499888777", display_name: null }),
  ];

  it("matches +614… / 614… / 04… forms of a target number", () => {
    for (const from of ["+61411222333", "61411222333", "0411222333"]) {
      expect(matchRelayTarget(targets, from)?.target_id).toBe(1);
    }
  });

  it("resolves a target sender to target_to_member with the target attached", () => {
    const decision = resolveRelayDirection(targets, "0499888777");
    expect(decision.direction).toBe("target_to_member");
    if (decision.direction === "target_to_member") {
      expect(decision.target.target_id).toBe(2);
    }
  });

  it("treats any non-target sender as a member", () => {
    expect(resolveRelayDirection(targets, "+61400000001").direction).toBe(
      "member_to_target",
    );
  });

  it("ignores INACTIVE targets — a deactivated target no longer bridges", () => {
    const deactivated = [target({ is_active: false })];
    expect(resolveRelayDirection(deactivated, "+61411222333").direction).toBe(
      "member_to_target",
    );
  });

  it("handles null/empty from", () => {
    expect(matchRelayTarget(targets, null)).toBeNull();
    expect(matchRelayTarget(targets, "")).toBeNull();
  });
});

describe("matchPhoneInList (own-number target guard)", () => {
  const ownNumbers = [
    { number_id: 1, phone_e164: "+61485900180" },
    { number_id: 2, phone_e164: "+61485900181" },
  ];

  it("flags a platform number in any submitted form", () => {
    for (const phone of ["+61485900180", "61485900180", "0485900180"]) {
      expect(matchPhoneInList(ownNumbers, phone)?.number_id).toBe(1);
    }
  });

  it("passes genuinely external numbers", () => {
    expect(matchPhoneInList(ownNumbers, "+61411222333")).toBeNull();
  });

  it("falls back to exact digit match for non-AU-mobile shapes", () => {
    const shortcodes = [{ phone_e164: "1776" }];
    expect(matchPhoneInList(shortcodes, "1776")).not.toBeNull();
    expect(matchPhoneInList(shortcodes, "1777")).toBeNull();
  });

  it("handles null/empty input", () => {
    expect(matchPhoneInList(ownNumbers, null)).toBeNull();
    expect(matchPhoneInList(ownNumbers, "")).toBeNull();
  });
});

describe("chooseBridgeMember (the bridging map)", () => {
  function cand(overrides: Partial<BridgeCandidate> = {}): BridgeCandidate {
    return {
      relay_message_id: 1,
      member_worker_id: 42,
      member_phone_e164: "+61400100014",
      forwarded_at: "2026-08-11T01:00:00Z",
      ...overrides,
    };
  }

  it("picks the most recently FORWARDED member", () => {
    const chosen = chooseBridgeMember([
      cand({ relay_message_id: 1, forwarded_at: "2026-08-11T01:00:00Z" }),
      cand({
        relay_message_id: 2,
        member_phone_e164: "+61400100099",
        forwarded_at: "2026-08-11T03:00:00Z",
      }),
    ]);
    expect(chosen?.member_phone_e164).toBe("+61400100099");
  });

  it("never bridges to a member whose message was not actually forwarded", () => {
    const chosen = chooseBridgeMember([
      cand({ relay_message_id: 9, forwarded_at: null }),
      cand({ relay_message_id: 1, forwarded_at: "2026-08-11T01:00:00Z" }),
    ]);
    expect(chosen?.relay_message_id).toBe(1);
  });

  it("breaks forwarded_at ties on the higher relay_message_id", () => {
    const chosen = chooseBridgeMember([
      cand({ relay_message_id: 1 }),
      cand({ relay_message_id: 5, member_phone_e164: "+61400100055" }),
    ]);
    expect(chosen?.relay_message_id).toBe(5);
  });

  it("returns null when no member has ever been forwarded", () => {
    expect(chooseBridgeMember([])).toBeNull();
    expect(chooseBridgeMember([cand({ forwarded_at: null })])).toBeNull();
    expect(
      chooseBridgeMember([cand({ member_phone_e164: null })]),
    ).toBeNull();
  });
});

describe("renderRelayTemplate / composeForwardBody", () => {
  const context = {
    first_name: "Alex",
    last_name: "Mitchell",
    employer_name: "Woodside Energy",
    phone: "0400 100 014",
  };
  const attribution = "Alex Mitchell (Woodside Energy) — 0400 100 014";

  it("resolves worker merge fields", () => {
    expect(
      renderRelayTemplate(
        "Message from {{first_name}} {{last_name}} ({{employer_name}}):",
        context,
      ),
    ).toBe("Message from Alex Mitchell (Woodside Energy):");
  });

  it("strips unresolved tokens — a literal {{x}} must never reach a target", () => {
    expect(renderRelayTemplate("Hi {{unknown_token}} there", context)).toBe(
      "Hi there",
    );
  });

  it("renders the generic context for unmatched workers", () => {
    expect(
      renderRelayTemplate(
        "Message from {{first_name}} {{last_name}}:",
        GENERIC_MEMBER_CONTEXT,
      ),
    ).toBe("Message from A member :");
  });

  it("composes attribution + prefix + member message + suffix", () => {
    expect(
      composeForwardBody({
        prefixTemplate: "From {{first_name}}:",
        suffixTemplate: "— via Offshore Alliance",
        memberBody: "We want the EBA voted on.",
        context,
      }),
    ).toBe(
      `${attribution}\nFrom Alex:\nWe want the EBA voted on.\n— via Offshore Alliance`,
    );
  });

  it("still leads with the attribution when there is no prefix or suffix", () => {
    expect(
      composeForwardBody({
        prefixTemplate: null,
        suffixTemplate: null,
        memberBody: "  bare message  ",
        context,
      }),
    ).toBe(`${attribution}\nbare message`);
  });

  it("cannot be edited away — an empty prefix does not remove it", () => {
    // The whole reason attribution is composed rather than templated:
    // a {{phone}} token in the prefix is one reword from deletion, and
    // the forward would go out anonymous with no error anywhere.
    const body = composeForwardBody({
      prefixTemplate: "   ",
      suffixTemplate: "",
      memberBody: "hello",
      context,
    });
    expect(body.startsWith(attribution)).toBe(true);
  });
});

describe("composeMemberAttribution", () => {
  it("names the member, their employer and their mobile", () => {
    expect(
      composeMemberAttribution({
        first_name: "Alex",
        last_name: "Mitchell",
        employer_name: "Woodside Energy",
        phone: "0400 100 014",
      }),
    ).toBe("Alex Mitchell (Woodside Energy) — 0400 100 014");
  });

  it("drops the employer when we do not know it", () => {
    expect(
      composeMemberAttribution({
        first_name: "Alex",
        last_name: "Mitchell",
        employer_name: "",
        phone: "0400 100 014",
      }),
    ).toBe("Alex Mitchell — 0400 100 014");
  });

  it("falls back to the number alone for a sender we cannot name", () => {
    // The number is the only field guaranteed to exist, and on its own
    // it is still enough for the target to reply to the right person.
    expect(composeMemberAttribution({ phone: "0400 100 014" })).toBe(
      "0400 100 014",
    );
  });

  it("keeps the generic label rather than leading with a bare number", () => {
    expect(
      composeMemberAttribution({
        ...GENERIC_MEMBER_CONTEXT,
        phone: "0400 100 014",
      }),
    ).toBe("A member — 0400 100 014");
  });

  it("uses the employer when that is all we have", () => {
    expect(
      composeMemberAttribution({ employer_name: "Fugro", phone: "0400 100 014" }),
    ).toBe("Fugro — 0400 100 014");
  });

  it("does not leave a dangling separator when the phone is missing", () => {
    // Cannot happen at runtime, but the string must not read
    // "Alex Mitchell —" if it ever did.
    expect(
      composeMemberAttribution({ first_name: "Alex", last_name: "Mitchell" }),
    ).toBe("Alex Mitchell");
  });
});

describe("resolveFirstForwardConfirmation", () => {
  const context = {
    first_name: "Alex",
    last_name: "Mitchell",
    employer_name: "Woodside Energy",
    phone: "0400 100 014",
  };

  it("uses the relay's own wording when it has one", () => {
    expect(
      resolveFirstForwardConfirmation({
        template: "Thanks — the office has your message.",
        bridgeReplies: false,
        context,
      }),
    ).toBe("Thanks — the office has your message.");
  });

  it("resolves merge fields in it", () => {
    expect(
      resolveFirstForwardConfirmation({
        template: "Thanks {{first_name}} — passed on.",
        bridgeReplies: false,
        context,
      }),
    ).toBe("Thanks Alex — passed on.");
  });

  it("strips an unresolved token rather than sending it literally", () => {
    expect(
      resolveFirstForwardConfirmation({
        template: "Thanks {{nickname}} — passed on.",
        bridgeReplies: false,
        context,
      }),
    ).toBe("Thanks — passed on.");
  });

  it("falls back to the mode default when never configured", () => {
    // NULL is what every pre-existing relay carries.
    expect(
      resolveFirstForwardConfirmation({
        template: null,
        bridgeReplies: true,
        context,
      }),
    ).toBe(RELAY_FIRST_FORWARD_CONFIRMATION);
    expect(
      resolveFirstForwardConfirmation({
        template: undefined,
        bridgeReplies: false,
        context,
      }),
    ).toBe(RELAY_FIRST_FORWARD_CONFIRMATION_DIRECT);
  });

  it("sends nothing when deliberately cleared", () => {
    // An empty string is a choice, unlike NULL. The runtime skips the
    // send rather than texting a blank message.
    expect(
      resolveFirstForwardConfirmation({
        template: "",
        bridgeReplies: false,
        context,
      }),
    ).toBe("");
    expect(
      resolveFirstForwardConfirmation({
        template: "   ",
        bridgeReplies: false,
        context,
      }),
    ).toBe("");
  });
});

describe("firstForwardConfirmation", () => {
  it("promises replies on this number when bridging is on", () => {
    expect(firstForwardConfirmation(true)).toContain("this number");
  });

  it("tells the member their mobile was passed on when it is not", () => {
    // Both halves of the bridged copy are false in direct mode: the
    // reply comes from the target, to their own handset.
    const copy = firstForwardConfirmation(false);
    expect(copy).toContain("mobile");
    expect(copy).toContain("directly");
    expect(copy).not.toContain("this number");
  });
});

describe("composeTargetReplyBody", () => {
  it("prefixes the target display name when set", () => {
    expect(composeTargetReplyBody("MP's office", "Thanks, noted.")).toBe(
      "MP's office: Thanks, noted.",
    );
  });

  it("passes through untouched when no display name is set", () => {
    expect(composeTargetReplyBody(null, " Thanks. ")).toBe("Thanks.");
    expect(composeTargetReplyBody("  ", "Thanks.")).toBe("Thanks.");
  });
});

describe("decideMemberForward (the decision ladder)", () => {
  const base = {
    relayStatus: "active" as const,
    moderationRequired: false,
    quietHoursRespected: true,
    withinWindow: true,
  };

  it("forwards now on an active relay inside the window", () => {
    expect(decideMemberForward(base).kind).toBe("forward_now");
  });

  it("pause beats everything", () => {
    expect(
      decideMemberForward({
        ...base,
        relayStatus: "paused",
        moderationRequired: true,
        withinWindow: false,
      }).kind,
    ).toBe("held_paused");
  });

  it("moderation beats quiet hours (approval re-checks the window)", () => {
    expect(
      decideMemberForward({
        ...base,
        moderationRequired: true,
        withinWindow: false,
      }).kind,
    ).toBe("pending_moderation");
  });

  it("quiet hours defer when the window is closed", () => {
    expect(
      decideMemberForward({ ...base, withinWindow: false }).kind,
    ).toBe("deferred_quiet_hours");
  });

  it("ignores the window when quiet hours are not respected", () => {
    expect(
      decideMemberForward({
        ...base,
        quietHoursRespected: false,
        withinWindow: false,
      }).kind,
    ).toBe("forward_now");
  });
});
