import { describe, expect, it } from "vitest";
import {
  assessmentLinkCompatible,
  assessmentLinkError,
  validateSurveyAssessmentMappings,
} from "../assessment-mapping";
import type { SurveyQuestionInput } from "../survey-validation";

describe("assessmentLinkCompatible", () => {
  it("binary assessments accept yes_no and choice only", () => {
    expect(assessmentLinkCompatible("yes_no", true)).toBe(true);
    expect(assessmentLinkCompatible("choice", true)).toBe(true);
    expect(assessmentLinkCompatible("scale", true)).toBe(false);
    expect(assessmentLinkCompatible("open_text", true)).toBe(false);
  });

  it("scale assessments accept scale and choice only", () => {
    expect(assessmentLinkCompatible("scale", false)).toBe(true);
    expect(assessmentLinkCompatible("choice", false)).toBe(true);
    expect(assessmentLinkCompatible("yes_no", false)).toBe(false);
    expect(assessmentLinkCompatible("open_text", false)).toBe(false);
  });
});

describe("assessmentLinkError", () => {
  it("explains scale ↔ binary mismatches", () => {
    expect(assessmentLinkError("scale", true, "Q1")).toMatch(/binary/);
    expect(assessmentLinkError("yes_no", false, "Q1")).toMatch(/1–5/);
  });
});

describe("validateSurveyAssessmentMappings", () => {
  const binary = [{ activity_id: 10, is_binary: true, title: "Vote" }];
  const scale = [{ activity_id: 20, is_binary: false, title: "Support" }];

  it("allows yes_no → binary", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Support?",
        qtype: "yes_no",
        write_rating: true,
        activity_id: 10,
      },
    ];
    expect(validateSurveyAssessmentMappings(q, binary)).toEqual([]);
  });

  it("rejects scale → binary", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Rate",
        qtype: "scale",
        options: { min: 1, max: 5 },
        write_rating: true,
        activity_id: 10,
      },
    ];
    expect(validateSurveyAssessmentMappings(q, binary).join(" ")).toMatch(
      /scale question cannot write to a binary/,
    );
  });

  it("rejects yes_no → scale", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Support?",
        qtype: "yes_no",
        write_rating: true,
        activity_id: 20,
      },
    ];
    expect(validateSurveyAssessmentMappings(q, scale).join(" ")).toMatch(
      /yes\/no question cannot write/,
    );
  });

  it("requires scale range 1–5 for scale assessments", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Rate",
        qtype: "scale",
        options: { min: 0, max: 10 },
        write_rating: true,
        activity_id: 20,
      },
    ];
    expect(validateSurveyAssessmentMappings(q, scale).join(" ")).toMatch(
      /min 1 and max 5/,
    );
  });

  it("accepts choice → binary with valid maps or skip", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Vote",
        qtype: "choice",
        write_rating: true,
        activity_id: 10,
        options: [
          { value: "yes", label: "Yes", maps_to_binary: "yes" },
          { value: "maybe", label: "Maybe", maps_to_binary: "unsure" },
          { value: "other", label: "Other", maps_to_binary: null },
        ],
      },
    ];
    expect(validateSurveyAssessmentMappings(q, binary)).toEqual([]);
  });

  it("rejects choice → binary with rating maps or invalid binary", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Vote",
        qtype: "choice",
        write_rating: true,
        activity_id: 10,
        options: [
          { value: "a", label: "A", maps_to_rating: 3 },
          { value: "b", label: "B", maps_to_binary: "attending" },
        ],
      },
    ];
    const errors = validateSurveyAssessmentMappings(q, binary).join(" ");
    expect(errors).toMatch(/cannot map to a 1–5 rating/);
    expect(errors).toMatch(/yes, no, unsure, or abstain/);
  });

  it("accepts choice → scale with 1–5 maps", () => {
    const q: SurveyQuestionInput[] = [
      {
        prompt: "Support",
        qtype: "choice",
        write_rating: true,
        activity_id: 20,
        options: [
          { value: "1", label: "Strong", maps_to_rating: 5 },
          { value: "2", label: "Weak", maps_to_rating: 2 },
          { value: "3", label: "Skip me", maps_to_rating: null },
        ],
      },
    ];
    expect(validateSurveyAssessmentMappings(q, scale)).toEqual([]);
  });

  it("ignores questions without write_rating / activity", () => {
    const q: SurveyQuestionInput[] = [
      { prompt: "Q", qtype: "scale", options: { min: 0, max: 10 } },
    ];
    expect(validateSurveyAssessmentMappings(q, scale)).toEqual([]);
  });
});
