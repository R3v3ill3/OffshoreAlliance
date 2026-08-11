import { describe, expect, it } from "vitest";
import {
  BALLOT_LOCKED_REPLY,
  appendReceiptToCompletion,
  computeBallotReceipt,
  decideBallotRevote,
  receiptSentence,
} from "@/lib/sms/ballot";
import {
  BALLOT_COMPLIANCE_BANNER,
  invitationMentionsIndicative,
  validateSurveyQuestions,
} from "@/lib/sms/survey-validation";
import type { ReceiptAnswer } from "@/lib/sms/ballot";

const SALT = "0b9e2c1a-7f5d-4e3b-9c8a-2d1f0e6b4a53";
const RECEIPT_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{2}$/;

const a = (questionId: number, value: string): ReceiptAnswer => ({
  questionId,
  value,
});

describe("computeBallotReceipt", () => {
  it("is deterministic for the same salt, worker and answers", () => {
    const one = computeBallotReceipt(SALT, 42, [a(1, "yes"), a(2, "3")]);
    const two = computeBallotReceipt(SALT, 42, [a(1, "yes"), a(2, "3")]);
    expect(one).toBe(two);
  });

  it("formats as XXXX-XXXX-XX over 10 uppercase hex chars", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes")])).toMatch(RECEIPT_RE);
    expect(computeBallotReceipt(SALT, 1, [])).toMatch(RECEIPT_RE);
  });

  it("changes when the salt changes", () => {
    const other = "f00dcafe-0000-4000-8000-000000000001";
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes")])).not.toBe(
      computeBallotReceipt(other, 42, [a(1, "yes")]),
    );
  });

  it("changes when the worker changes", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes")])).not.toBe(
      computeBallotReceipt(SALT, 43, [a(1, "yes")]),
    );
  });

  it("changes when an answer value changes", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes"), a(2, "3")])).not.toBe(
      computeBallotReceipt(SALT, 42, [a(1, "no"), a(2, "3")]),
    );
  });

  it("changes when the answer ORDER changes", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes"), a(2, "no")])).not.toBe(
      computeBallotReceipt(SALT, 42, [a(2, "no"), a(1, "yes")]),
    );
  });

  it("binds answers to QUESTION IDENTITY (same value on a different question differs)", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "yes")])).not.toBe(
      computeBallotReceipt(SALT, 42, [a(2, "yes")]),
    );
  });

  it("does not collide across answer-boundary ambiguity ('1','23' vs '12','3')", () => {
    expect(computeBallotReceipt(SALT, 42, [a(1, "1"), a(2, "23")])).not.toBe(
      computeBallotReceipt(SALT, 42, [a(1, "12"), a(2, "3")]),
    );
  });

  it("does not collide across the question-id/value boundary (12:'3' vs 1:'23')", () => {
    expect(computeBallotReceipt(SALT, 42, [a(12, "3")])).not.toBe(
      computeBallotReceipt(SALT, 42, [a(1, "23")]),
    );
  });

  it("distinguishes worker/answer boundary (worker 4 + answer vs worker 42 + none)", () => {
    expect(computeBallotReceipt(SALT, 4, [a(2, "1")])).not.toBe(
      computeBallotReceipt(SALT, 42, []),
    );
  });
});

describe("appendReceiptToCompletion", () => {
  const receipt = "AB12-CD34-EF";

  it("appends the receipt sentence after the authored completion body", () => {
    const out = appendReceiptToCompletion("Thanks for voting. OA.", receipt);
    expect(out).toBe(
      `Thanks for voting. OA.\n\n${receiptSentence(receipt)}`,
    );
    expect(out).toContain("Your receipt: AB12-CD34-EF.");
    expect(out).toContain("Keep this to verify your vote was counted.");
  });

  it("stands alone when no completion body is authored", () => {
    expect(appendReceiptToCompletion(null, receipt)).toBe(
      receiptSentence(receipt),
    );
    expect(appendReceiptToCompletion("   ", receipt)).toBe(
      receiptSentence(receipt),
    );
  });
});

describe("decideBallotRevote", () => {
  const parsed = { kind: "parsed", value: "yes" } as const;
  const invalid = { kind: "invalid" } as const;
  const freetext = { kind: "freetext_on_choice" } as const;

  it("locked + parsed answer → reject_locked (answers untouched)", () => {
    expect(decideBallotRevote("locked", parsed)).toBe("reject_locked");
  });

  it("revote_until_close + parsed answer → supersede (last vote wins)", () => {
    expect(decideBallotRevote("revote_until_close", parsed)).toBe("supersede");
  });

  it("non-answers are never vote attempts (either policy)", () => {
    expect(decideBallotRevote("locked", invalid)).toBe("not_vote_attempt");
    expect(decideBallotRevote("locked", freetext)).toBe("not_vote_attempt");
    expect(decideBallotRevote("revote_until_close", invalid)).toBe(
      "not_vote_attempt",
    );
    expect(decideBallotRevote("revote_until_close", freetext)).toBe(
      "not_vote_attempt",
    );
  });

  it("locked reply copy states the vote is recorded and unchangeable", () => {
    expect(BALLOT_LOCKED_REPLY).toContain("already recorded");
    expect(BALLOT_LOCKED_REPLY).toContain("one vote per member");
  });
});

describe("indicative framing (§4.2/§8.1)", () => {
  it("accepts any casing of 'indicative'", () => {
    expect(
      invitationMentionsIndicative("OA: INDICATIVE poll on the EBA."),
    ).toBe(true);
    expect(
      invitationMentionsIndicative("This is an indicative ballot only."),
    ).toBe(true);
  });

  it("rejects invitations without the word", () => {
    expect(invitationMentionsIndicative("OA: vote now on the EBA.")).toBe(false);
    expect(invitationMentionsIndicative("")).toBe(false);
    expect(invitationMentionsIndicative(null)).toBe(false);
    expect(invitationMentionsIndicative(undefined)).toBe(false);
  });

  it("requires the whole word — 'indicatively' etc. do not pass", () => {
    expect(invitationMentionsIndicative("we indicatively note")).toBe(false);
    expect(invitationMentionsIndicative("contraindicative results")).toBe(false);
  });

  it("banner names the AEC / FWC-approved agent boundary", () => {
    expect(BALLOT_COMPLIANCE_BANNER).toContain("Indicative poll only");
    expect(BALLOT_COMPLIANCE_BANNER).toContain("AEC");
    expect(BALLOT_COMPLIANCE_BANNER).toContain("FWC-approved ballot agent");
  });
});

describe("ballot question validation", () => {
  const yesNo = { prompt: "Support the claim?", qtype: "yes_no" as const };
  const openText = { prompt: "Any comments?", qtype: "open_text" as const };

  it("rejects an open_text FIRST question for ballots", () => {
    const errors = validateSurveyQuestions(
      [openText, yesNo],
      "indicative_ballot",
    );
    expect(
      errors.some((e) =>
        e.includes("first question must be a choice, yes/no or scale"),
      ),
    ).toBe(true);
  });

  it("allows open_text later in a ballot, and anywhere in a survey", () => {
    expect(
      validateSurveyQuestions([yesNo, openText], "indicative_ballot"),
    ).toEqual([]);
    expect(validateSurveyQuestions([openText, yesNo], "survey")).toEqual([]);
    expect(validateSurveyQuestions([openText, yesNo])).toEqual([]);
  });
});
