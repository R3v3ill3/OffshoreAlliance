import { describe, expect, it } from "vitest";
import {
  decideRelayTarget,
  stripRingDestinations,
  type OwnNumberUsage,
} from "../relay-target-guard";

function ownNumber(p: Partial<OwnNumberUsage> & { number_id: number }): OwnNumberUsage {
  return {
    phone_e164: `+6142000000${p.number_id}`,
    label: null,
    live_relay: null,
    live_survey: null,
    ...p,
  };
}

/** Our sandbox number, idle — the one a staff member wants to test with. */
const idle = ownNumber({
  number_id: 1,
  phone_e164: "+61485900180",
  label: "Sandbox",
});
/** Our relay number, carrying the relay being configured. */
const relayNumber = ownNumber({
  number_id: 2,
  phone_e164: "+61485900133",
  live_relay: { relay_id: 7, name: "Bargaining relay" },
});

describe("decideRelayTarget", () => {
  it("allows a number that is not ours at all", () => {
    const v = decideRelayTarget({
      phone: "+61411222333",
      ownNumbers: [idle, relayNumber],
      relayNumberId: 2,
    });
    expect(v).toEqual({ allowed: true, own_number_id: null });
  });

  it("allows one of our own numbers when nothing is routing on it", () => {
    // The whole point of the relaxation: every phone a staff member
    // would naturally test with is already registered, so a flat
    // refusal made end-to-end relay testing impossible.
    const v = decideRelayTarget({
      phone: "+61485900180",
      ownNumbers: [idle, relayNumber],
      relayNumberId: 2,
    });
    expect(v).toEqual({ allowed: true, own_number_id: 1 });
  });

  it("matches our number in any written form", () => {
    for (const phone of ["+61485900180", "61485900180", "0485900180"]) {
      const v = decideRelayTarget({
        phone,
        ownNumbers: [idle],
        relayNumberId: null,
      });
      expect(v).toEqual({ allowed: true, own_number_id: 1 });
    }
  });

  // ── The protections that must not regress ────────────────────────

  it("refuses a number that carries a live relay — the ring", () => {
    // Forwarding here re-enters the webhook's relay leg, which
    // forwards again. This is the case the guard exists for.
    const v = decideRelayTarget({
      phone: "+61485900133",
      ownNumbers: [idle, relayNumber],
      relayNumberId: 1,
    });
    expect(v.allowed).toBe(false);
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("Bargaining relay");
    expect(v.reason).toContain("loop");
  });

  it("refuses the relay's own number — a ring with one hop", () => {
    const v = decideRelayTarget({
      phone: "+61485900180",
      ownNumbers: [idle],
      relayNumberId: 1,
    });
    expect(v.allowed).toBe(false);
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("own number");
  });

  it("refuses its own number before it checks anything else", () => {
    // A relay number always carries its own live relay, so the
    // self-target message has to win or the error misdescribes it.
    const v = decideRelayTarget({
      phone: "+61485900133",
      ownNumbers: [relayNumber],
      relayNumberId: 2,
    });
    expect(v.allowed).toBe(false);
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("own number");
  });

  it("refuses a number with a live survey session", () => {
    // The survey leg runs BEFORE the relay leg in the webhook, so a
    // reply from this handset would be filed as a survey answer and
    // never reach the relay.
    const busy = ownNumber({
      number_id: 3,
      phone_e164: "+61420136770",
      live_survey: { survey_id: 19, title: "Fugro pre-bargaining" },
    });
    const v = decideRelayTarget({
      phone: "+61420136770",
      ownNumbers: [idle, busy],
      relayNumberId: 1,
    });
    expect(v.allowed).toBe(false);
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("Fugro pre-bargaining");
    expect(v.reason).toContain("survey answers");
  });

  it("names the relay by id when it has no name", () => {
    const unnamed = ownNumber({
      number_id: 4,
      phone_e164: "+61473076235",
      live_relay: { relay_id: 12, name: "  " },
    });
    const v = decideRelayTarget({
      phone: "+61473076235",
      ownNumbers: [unnamed],
      relayNumberId: 1,
    });
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("relay 12");
  });

  it("includes the number's label so the organiser knows which handset", () => {
    const v = decideRelayTarget({
      phone: "+61485900180",
      ownNumbers: [idle],
      relayNumberId: 1,
    });
    if (v.allowed) throw new Error("unreachable");
    expect(v.reason).toContain("Sandbox");
  });

  it("allows a number once its relay has ended", () => {
    // 'ended' relays release the number back to normal routing, so
    // the loader reports live_relay null and the ring is gone.
    const released = ownNumber({ number_id: 2, phone_e164: "+61485900133" });
    const v = decideRelayTarget({
      phone: "+61485900133",
      ownNumbers: [released],
      relayNumberId: 1,
    });
    expect(v.allowed).toBe(true);
  });
});

describe("stripRingDestinations", () => {
  it("keeps everything when no relay is live", () => {
    const dests = [{ phone_e164: "+61411222333" }];
    expect(stripRingDestinations(dests, [])).toEqual({
      kept: dests,
      dropped: [],
    });
  });

  it("drops a destination that has since become a relay number", () => {
    // The create-time guard cannot see a relay stood up afterwards.
    // This is the check that actually prevents the ring.
    const { kept, dropped } = stripRingDestinations(
      [{ phone_e164: "+61411222333" }, { phone_e164: "+61485900133" }],
      ["+61485900133"],
    );
    expect(kept).toEqual([{ phone_e164: "+61411222333" }]);
    expect(dropped).toEqual([{ phone_e164: "+61485900133" }]);
  });

  it("matches regardless of how either side is written", () => {
    const { kept } = stripRingDestinations(
      [{ phone_e164: "0485900133" }],
      ["+61485900133"],
    );
    expect(kept).toHaveLength(0);
  });

  it("can drop every destination", () => {
    const { kept, dropped } = stripRingDestinations(
      [{ phone_e164: "+61485900133" }],
      ["+61485900133"],
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });
});
