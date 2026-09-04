import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELAY_LAUNCH_TEMPLATE,
  isPermittedRelaySender,
  launchBodyMentionsRelayNumber,
  relayLaunchBlastName,
  relayLaunchQueueBlocker,
  renderRelayLaunchBody,
  shouldMirrorBlastConversations,
} from "@/lib/sms/relay-launch";

const RELAY_PHONE = "+61400100014";
const RELAY_DISPLAY = "0400 100 014";

/**
 * A filled-in launch text — real campaign copy, kept here rather than
 * shipped as a default: the seed must stay campaign-neutral, and this
 * is what an organiser is expected to turn it into.
 */
const FILLED_EXAMPLE = `Hey {{first_name}}. Downer copped a flogging on their dud EA. Mark Wakelin is too shy to tell us exactly how bad.
Maybe if we all ask him, he'll get the courage to cough up the numbers.
Text {{relay_number}} — it goes straight to Mark with your name and site on the end. Keep it polite, keep it short, make it your own. A few starters:

* "Mark, [name] from [site]. What was the vote count? Cheers."
* "G'day Mark. Yes/No split on the EA please. Ta."
* "Mark, what's Downer scared of? Release the numbers."
* "Morning Mark. Everyone knows the EA got flogged. Just tell us by how much."

Text {{relay_number}} now. Let's see if Mark can count.
Offshore Alliance`;

describe("DEFAULT_RELAY_LAUNCH_TEMPLATE", () => {
  // Locked verbatim: the seed is campaign-neutral on purpose (no
  // employer, person, site or issue), so an organiser replaces the
  // specifics rather than the structure. Any edit here is a copy
  // decision, not a refactor.
  it("is the agreed campaign-neutral seed", () => {
    expect(DEFAULT_RELAY_LAUNCH_TEMPLATE).toBe(
      [
        "Hey {{first_name}}. [One or two lines on what has happened and why it matters.]",
        "Text {{relay_number}} — it goes straight to [who] with your name and site on the end. Keep it polite, keep it short, make it your own. A few starters:",
        "",
        '* "[Starter 1]"',
        '* "[Starter 2]"',
        '* "[Starter 3]"',
        "",
        "Text {{relay_number}} now.",
        "Offshore Alliance",
      ].join("\n"),
    );
  });

  it("names no employer, person or site", () => {
    expect(DEFAULT_RELAY_LAUNCH_TEMPLATE).not.toMatch(
      /downer|wakelin|offshore alliance\s+\w/i,
    );
  });
});

describe("renderRelayLaunchBody", () => {
  it("renders both relay tokens", () => {
    const out = renderRelayLaunchBody(
      "Text {{relay_number}} or tap {{relay_sms_link}}",
      RELAY_PHONE,
    );
    expect(out).toBe(`Text ${RELAY_DISPLAY} or tap sms:${RELAY_PHONE}`);
  });

  it("accepts the national form and still emits E.164 in the link", () => {
    const out = renderRelayLaunchBody("{{relay_number}} {{relay_sms_link}}", "0400100014");
    expect(out).toBe(`${RELAY_DISPLAY} sms:${RELAY_PHONE}`);
  });

  it("leaves foreign tokens untouched for the dispatch cron", () => {
    const out = renderRelayLaunchBody(
      "Hey {{first_name}}, text {{relay_number}} — {{employer_name}}",
      RELAY_PHONE,
    );
    expect(out).toBe(`Hey {{first_name}}, text ${RELAY_DISPLAY} — {{employer_name}}`);
  });

  it("resolves the default seed twice and keeps the org name and placeholders", () => {
    const out = renderRelayLaunchBody(DEFAULT_RELAY_LAUNCH_TEMPLATE, RELAY_PHONE);
    expect(out.split(RELAY_DISPLAY)).toHaveLength(3); // two occurrences
    expect(out).toContain("{{first_name}}");
    expect(out).toContain("Offshore Alliance");
    expect(out).toMatch(/\[[^\]]+\]/); // placeholders survive for the organiser
    expect(out).not.toContain("{{relay_number}}");
  });

  it("returns empty for an empty template", () => {
    expect(renderRelayLaunchBody("", RELAY_PHONE)).toBe("");
  });
});

describe("launchBodyMentionsRelayNumber", () => {
  it("finds the number in display, E.164, national and sms: forms", () => {
    for (const body of [
      `Text ${RELAY_DISPLAY} now.`,
      `Text ${RELAY_PHONE} now.`,
      "Text 0400100014 now.",
      "Text 61400100014 now.",
      `Tap sms:${RELAY_PHONE} to send it.`,
      "Call 0400-100-014 or don't.",
    ]) {
      expect(launchBodyMentionsRelayNumber(body, RELAY_PHONE)).toBe(true);
    }
  });

  it("is false when the number is absent or is a different one", () => {
    expect(launchBodyMentionsRelayNumber("Text the number now.", RELAY_PHONE)).toBe(false);
    expect(launchBodyMentionsRelayNumber("Text 0499 888 777 now.", RELAY_PHONE)).toBe(false);
    expect(launchBodyMentionsRelayNumber("", RELAY_PHONE)).toBe(false);
  });

  it("still finds it when a second number sits alongside", () => {
    expect(
      launchBodyMentionsRelayNumber("0499888777 0400100014", RELAY_PHONE),
    ).toBe(true);
  });

  it("holds for the rendered default seed and the filled example", () => {
    for (const template of [DEFAULT_RELAY_LAUNCH_TEMPLATE, FILLED_EXAMPLE]) {
      const rendered = renderRelayLaunchBody(template, RELAY_PHONE);
      expect(launchBodyMentionsRelayNumber(rendered, RELAY_PHONE)).toBe(true);
    }
  });

  it("is false for an unrendered template — the token is not a number", () => {
    expect(
      launchBodyMentionsRelayNumber(DEFAULT_RELAY_LAUNCH_TEMPLATE, RELAY_PHONE),
    ).toBe(false);
  });
});

describe("isPermittedRelaySender", () => {
  it("permits a relay number on its own relay's launch text", () => {
    expect(
      isPermittedRelaySender({
        senderNumberId: 7,
        senderPurpose: "relay",
        listRelayId: 3,
        relayNumberId: 7,
      }),
    ).toBe(true);
  });

  it("rejects another relay's number", () => {
    expect(
      isPermittedRelaySender({
        senderNumberId: 8,
        senderPurpose: "relay",
        listRelayId: 3,
        relayNumberId: 7,
      }),
    ).toBe(false);
  });

  it("rejects a relay number on a blast that is not a launch text", () => {
    expect(
      isPermittedRelaySender({
        senderNumberId: 7,
        senderPurpose: "relay",
        listRelayId: null,
        relayNumberId: null,
      }),
    ).toBe(false);
  });

  it("rejects survey numbers however the list is linked", () => {
    for (const listRelayId of [null, 3]) {
      expect(
        isPermittedRelaySender({
          senderNumberId: 7,
          senderPurpose: "survey",
          listRelayId,
          relayNumberId: 7,
        }),
      ).toBe(false);
    }
  });

  it("permits organiser numbers regardless of the relay link", () => {
    for (const listRelayId of [null, 3]) {
      expect(
        isPermittedRelaySender({
          senderNumberId: 12,
          senderPurpose: "organiser",
          listRelayId,
          relayNumberId: 7,
        }),
      ).toBe(true);
    }
  });
});

describe("relayLaunchQueueBlocker", () => {
  it("lets an active relay through", () => {
    expect(relayLaunchQueueBlocker("active")).toBeNull();
  });

  it("blocks a paused relay and quotes the paused auto-reply", () => {
    const msg = relayLaunchQueueBlocker("paused");
    expect(msg).toContain("Activate the relay");
    expect(msg).toContain("forwarding is currently paused");
  });

  it("blocks an ended relay and an unknown one", () => {
    expect(relayLaunchQueueBlocker("ended")).toContain("ended");
    expect(relayLaunchQueueBlocker(null)).toContain("could not be found");
  });
});

describe("relayLaunchBlastName", () => {
  it("suffixes the relay name", () => {
    expect(relayLaunchBlastName("Message Mark Wakelin")).toBe(
      "Message Mark Wakelin — launch text",
    );
  });

  it("falls back when the relay has no usable name", () => {
    expect(relayLaunchBlastName("   ")).toBe("Launch text");
  });
});

describe("shouldMirrorBlastConversations", () => {
  it("skips the mirror only for a launch text sent from its relay number", () => {
    expect(
      shouldMirrorBlastConversations({
        listRelayId: 3,
        senderNumberId: 7,
        relayNumberId: 7,
      }),
    ).toBe(false);
  });

  it("mirrors a launch text sent from an organiser number", () => {
    expect(
      shouldMirrorBlastConversations({
        listRelayId: 3,
        senderNumberId: 12,
        relayNumberId: 7,
      }),
    ).toBe(true);
  });

  it("mirrors an ordinary blast", () => {
    expect(
      shouldMirrorBlastConversations({
        listRelayId: null,
        senderNumberId: 7,
        relayNumberId: null,
      }),
    ).toBe(true);
  });
});
