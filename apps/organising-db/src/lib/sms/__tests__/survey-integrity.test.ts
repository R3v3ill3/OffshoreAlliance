/**
 * Post-open edit risk classification.
 *
 * The stakes: replaceSurveyQuestionsPreservingAnswers maps the incoming
 * questions onto stored rows BY POSITION and keeps each question_id,
 * because the editor sends no ids. Anything that changes what position
 * `i` means — a retype, a changed answer shape, a removal, a reorder —
 * leaves already-collected answers filed against a question they were
 * never asked. High risk exists to stop exactly that.
 */
import { describe, expect, it } from "vitest";
import {
  assessSurveyEditIntegrity,
  hasHighRiskFindings,
} from "../survey-integrity";
import type { SmsSurveyQuestionRow } from "@/types/sms";
import type { SurveyQuestionInput } from "../survey-validation";

function stored(
  partial: Partial<SmsSurveyQuestionRow> & { question_id: number },
): SmsSurveyQuestionRow {
  return {
    survey_id: 1,
    sort_order: 0,
    prompt: "Q",
    qtype: "scale",
    options: { min: 1, max: 5 },
    branching: null,
    write_rating: false,
    invalid_prompt: null,
    nudge_text: null,
    created_at: "",
    updated_at: "",
    activity_id: null,
    retired_at: null,
    ...partial,
  } as SmsSurveyQuestionRow;
}

function input(partial: Partial<SurveyQuestionInput>): SurveyQuestionInput {
  return {
    prompt: "Q",
    qtype: "scale",
    options: { min: 1, max: 5 },
    ...partial,
  } as SurveyQuestionInput;
}

const base = [
  stored({ question_id: 1, sort_order: 0, prompt: "Pay rise" }),
  stored({ question_id: 2, sort_order: 1, prompt: "Job security" }),
];

const codes = (f: ReturnType<typeof assessSurveyEditIntegrity>) =>
  f.map((x) => x.code);

describe("assessSurveyEditIntegrity — reorder", () => {
  it("flags a pure reorder as high risk", () => {
    // Regression: two same-type questions swapped used to produce only
    // low-risk prompt_changed findings, so the reorder saved without an
    // acknowledge and silently mis-filed every answer.
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Job security" }),
      input({ prompt: "Pay rise" }),
    ]);
    expect(codes(findings)).toContain("questions_reordered");
    expect(hasHighRiskFindings(findings)).toBe(true);
  });

  it("does not flag a reorder when the wording merely changed", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise (20% counter offer)" }),
      input({ prompt: "Job security" }),
    ]);
    expect(codes(findings)).not.toContain("questions_reordered");
    expect(hasHighRiskFindings(findings)).toBe(false);
  });

  it("does not flag an unchanged question set", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise" }),
      input({ prompt: "Job security" }),
    ]);
    expect(codes(findings)).not.toContain("questions_reordered");
    expect(hasHighRiskFindings(findings)).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "  Pay rise  " }),
      input({ prompt: "Job security" }),
    ]);
    expect(hasHighRiskFindings(findings)).toBe(false);
  });
});

describe("assessSurveyEditIntegrity — shape changes", () => {
  it("flags a question-type change", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise", qtype: "yes_no", options: null }),
      input({ prompt: "Job security" }),
    ]);
    expect(codes(findings)).toContain("qtype_changed");
    expect(hasHighRiskFindings(findings)).toBe(true);
  });

  it("flags a changed scale range — a 5 means something else on 1-10", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise", options: { min: 1, max: 10 } }),
      input({ prompt: "Job security" }),
    ]);
    expect(codes(findings)).toContain("scale_range_changed");
    expect(hasHighRiskFindings(findings)).toBe(true);
  });

  it("flags removed questions", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise" }),
    ]);
    expect(codes(findings)).toContain("question_removed");
    expect(hasHighRiskFindings(findings)).toBe(true);
  });

  it("treats an added question as low risk", () => {
    const findings = assessSurveyEditIntegrity(base, [
      input({ prompt: "Pay rise" }),
      input({ prompt: "Job security" }),
      input({ prompt: "Roster" }),
    ]);
    expect(codes(findings)).toContain("question_added");
    expect(hasHighRiskFindings(findings)).toBe(false);
  });

  it("flags a changed choice option set", () => {
    const choice = [
      stored({
        question_id: 1,
        prompt: "Preferred day",
        qtype: "choice",
        options: [
          { value: "1", label: "Mon" },
          { value: "2", label: "Tue" },
        ],
      }),
    ];
    const findings = assessSurveyEditIntegrity(choice, [
      input({
        prompt: "Preferred day",
        qtype: "choice",
        options: [
          { value: "1", label: "Mon" },
          { value: "3", label: "Wed" },
        ],
      }),
    ]);
    expect(codes(findings)).toContain("choice_values_changed");
    expect(hasHighRiskFindings(findings)).toBe(true);
  });
});
