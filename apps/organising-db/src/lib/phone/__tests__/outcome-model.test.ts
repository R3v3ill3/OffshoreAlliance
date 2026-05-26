import { describe, it, expect } from "vitest";
import {
  OUTCOME_CLASSIFICATIONS,
  OUTCOME_META,
  OUTCOME_OPTIONS,
  deriveOutcomeClassification,
  outcomeSentiment,
} from "@/lib/phone/outcome-model";

describe("outcome-model taxonomy", () => {
  it("exposes one OUTCOME_META entry per classification", () => {
    for (const value of OUTCOME_CLASSIFICATIONS) {
      expect(OUTCOME_META[value]).toBeDefined();
      expect(OUTCOME_META[value]?.value).toBe(value);
      expect(OUTCOME_META[value]?.label).toBeTruthy();
    }
  });

  it("preserves the canonical option order", () => {
    expect(OUTCOME_OPTIONS.map((o) => o.value)).toEqual([...OUTCOME_CLASSIFICATIONS]);
  });

  it("treats every callback-scheduling outcome as non-terminal except agreed_to_join", () => {
    for (const meta of Object.values(OUTCOME_META)) {
      if (meta.schedulesCallback) {
        expect(meta.terminal).toBe(false);
      }
    }
  });

  it("outcomeSentiment returns the sentiment recorded on OUTCOME_META", () => {
    for (const value of OUTCOME_CLASSIFICATIONS) {
      expect(outcomeSentiment(value)).toBe(OUTCOME_META[value]?.sentiment);
    }
  });
});

describe("deriveOutcomeClassification", () => {
  it("returns null when there's no dial disposition", () => {
    expect(deriveOutcomeClassification({ dialDisposition: null, callDisposition: null })).toBeNull();
  });

  it("maps wrong_number / do_not_call / voicemail_left dispositions directly", () => {
    expect(
      deriveOutcomeClassification({ dialDisposition: "wrong_number", callDisposition: null }),
    ).toBe("wrong_number");
    expect(
      deriveOutcomeClassification({ dialDisposition: "do_not_call", callDisposition: null }),
    ).toBe("do_not_call");
    expect(
      deriveOutcomeClassification({ dialDisposition: "voicemail_left", callDisposition: null }),
    ).toBe("voicemail_left");
  });

  it("rolls every dial-tone failure mode into unable_to_reach", () => {
    for (const disp of ["no_answer", "busy", "voicemail_no_message", "disconnected"] as const) {
      expect(
        deriveOutcomeClassification({ dialDisposition: disp, callDisposition: null }),
      ).toBe("unable_to_reach");
    }
  });

  it("maps an explicit callback_requested dial to callback_later", () => {
    expect(
      deriveOutcomeClassification({ dialDisposition: "callback_requested", callDisposition: null }),
    ).toBe("callback_later");
  });

  it("treats joinPositive as agreed_to_join on a connected call", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_positive",
        joinPositive: true,
      }),
    ).toBe("agreed_to_join");
  });

  it("disambiguates existing members by support level", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_positive",
        existingMember: true,
        supportLevel: "strong_supporter",
      }),
    ).toBe("existing_member_supportive");

    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_neutral",
        existingMember: true,
        supportLevel: "neutral",
      }),
    ).toBe("existing_member_neutral");
  });

  it("classifies hostile completed_negative as declined_explicitly", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_negative",
        supportLevel: "hostile",
      }),
    ).toBe("declined_explicitly");
  });

  it("classifies non-hostile completed_negative as not_interested", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_negative",
        supportLevel: "unsupportive",
      }),
    ).toBe("not_interested");
  });

  it("treats partial_asked_callback as interested_callback", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "partial_asked_callback",
      }),
    ).toBe("interested_callback");
  });

  it("routes removed_from_campaign / no_longer_in_universe to do_not_call", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "removed_from_campaign",
      }),
    ).toBe("do_not_call");
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "no_longer_in_universe",
      }),
    ).toBe("do_not_call");
  });

  it("routes referred_to_other to referred_to_other_org", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "referred_to_other",
      }),
    ).toBe("referred_to_other_org");
  });

  it("falls back to interested_undecided for completed_positive / completed_neutral without a join", () => {
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_positive",
      }),
    ).toBe("interested_undecided");
    expect(
      deriveOutcomeClassification({
        dialDisposition: "connected",
        callDisposition: "completed_neutral",
      }),
    ).toBe("interested_undecided");
  });
});
