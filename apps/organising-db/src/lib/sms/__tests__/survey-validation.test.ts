import { describe, expect, it } from "vitest";
import {
  validateSurveyQuestions,
  type SurveyQuestionInput,
} from "../survey-validation";

function yn(branching?: SurveyQuestionInput["branching"]): SurveyQuestionInput {
  return { prompt: "Q?", qtype: "yes_no", branching: branching ?? null };
}

describe("validateSurveyQuestions — branch cycles", () => {
  it("accepts forward branches and 'end'", () => {
    expect(
      validateSurveyQuestions([yn({ no: "end", yes: 2 }), yn(), yn()]),
    ).toEqual([]);
  });

  it("rejects a backward branch (forms a loop with the default chain)", () => {
    const errors = validateSurveyQuestions([yn(), yn(), yn({ yes: 0 })]);
    expect(errors.some((e) => e.includes("loop"))).toBe(true);
  });

  it("rejects a two-node branch cycle", () => {
    const errors = validateSurveyQuestions([
      yn({ yes: 1, no: "end" }),
      yn({ yes: 0, no: "end" }),
      yn(),
    ]);
    expect(errors.some((e) => e.includes("loop"))).toBe(true);
  });

  it("still rejects self-branches with the specific message", () => {
    const errors = validateSurveyQuestions([yn({ yes: 0 }), yn()]);
    expect(errors.some((e) => e.includes("point at itself"))).toBe(true);
  });

  it("out-of-range targets are reported without running cycle detection", () => {
    const errors = validateSurveyQuestions([yn({ yes: 9 }), yn()]);
    expect(errors.some((e) => e.includes("non-existent"))).toBe(true);
  });
});
