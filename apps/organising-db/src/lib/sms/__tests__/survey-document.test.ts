import { describe, expect, it } from "vitest";
import {
  answerLinesForQuestion,
  buildPrintableSurvey,
  printableSurveyFilename,
  stripMergeTokensForPrint,
} from "../survey-document";
import type { SmsSurveyQuestionRow } from "@/types/sms";

function q(
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

describe("stripMergeTokensForPrint", () => {
  it("replaces merge tokens with a blank", () => {
    // There is no recipient for a printed copy, so a token must not
    // reach a member as literal {{first_name}}.
    expect(stripMergeTokensForPrint("Hi {{first_name}}, a question")).toBe(
      "Hi ______, a question",
    );
  });

  it("tolerates spaced tokens and collapses the gap", () => {
    expect(stripMergeTokensForPrint("Hi {{ first_name }}  there")).toBe(
      "Hi ______ there",
    );
  });

  it("returns empty for nothing", () => {
    expect(stripMergeTokensForPrint(null)).toBe("");
    expect(stripMergeTokensForPrint(undefined)).toBe("");
  });
});

describe("answerLinesForQuestion", () => {
  it("gives yes/no a single tick line", () => {
    const lines = answerLinesForQuestion(q({ question_id: 1, qtype: "yes_no" }));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("Yes");
    expect(lines[0].text).toContain("No");
  });

  it("lists every choice option with a box", () => {
    const lines = answerLinesForQuestion(
      q({
        question_id: 1,
        qtype: "choice",
        options: [
          { value: "1", label: "Mon" },
          { value: "2", label: "Tue" },
        ],
      }),
    );
    expect(lines.map((l) => l.text)).toEqual(["☐  Mon", "☐  Tue"]);
  });

  it("falls back to the option value when it has no label", () => {
    const lines = answerLinesForQuestion(
      q({ question_id: 1, qtype: "choice", options: [{ value: "yes", label: "" }] }),
    );
    expect(lines[0].text).toBe("☐  yes");
  });

  it("draws a box per point on a scale, with the ends explained", () => {
    const lines = answerLinesForQuestion(
      q({ question_id: 1, qtype: "scale", options: { min: 1, max: 5 } }),
    );
    expect(lines[0].text).toBe("☐ 1    ☐ 2    ☐ 3    ☐ 4    ☐ 5");
    expect(lines[1].text).toBe("(1 = lowest, 5 = highest)");
  });

  it("honours a non-default scale range", () => {
    const lines = answerLinesForQuestion(
      q({ question_id: 1, qtype: "scale", options: { min: 0, max: 10 } }),
    );
    expect(lines[0].text.startsWith("☐ 0")).toBe(true);
    expect(lines[0].text.endsWith("☐ 10")).toBe(true);
  });

  it("falls back to 1-5 on a reversed or malformed range", () => {
    // A hand-filled form cannot show an empty or backwards row of boxes.
    const reversed = answerLinesForQuestion(
      q({ question_id: 1, qtype: "scale", options: { min: 5, max: 1 } }),
    );
    expect(reversed[0].text).toBe("☐ 1    ☐ 2    ☐ 3    ☐ 4    ☐ 5");
  });

  it("gives open text ruled lines to write on", () => {
    const lines = answerLinesForQuestion(
      q({ question_id: 1, qtype: "open_text", options: null }),
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.ruled)).toBe(true);
  });
});

describe("buildPrintableSurvey", () => {
  it("numbers questions in sort order", () => {
    const doc = buildPrintableSurvey({
      title: "Log of claims",
      questions: [
        q({ question_id: 2, sort_order: 1, prompt: "Second" }),
        q({ question_id: 1, sort_order: 0, prompt: "First" }),
      ],
    });
    expect(doc.questions.map((x) => [x.number, x.prompt])).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
  });

  it("excludes retired questions", () => {
    // They are no longer asked over SMS, so answers to them could not
    // be filed against the survey.
    const doc = buildPrintableSurvey({
      title: "T",
      questions: [
        q({ question_id: 1, sort_order: 0, prompt: "Live" }),
        q({ question_id: 2, sort_order: 1, prompt: "Old", retired_at: "2026-01-01" }),
      ],
    });
    expect(doc.questions).toHaveLength(1);
    expect(doc.questions[0].prompt).toBe("Live");
  });

  it("strips merge tokens from the intro and the prompts", () => {
    const doc = buildPrintableSurvey({
      title: "T",
      invitationBody: "Hi {{first_name}} — quick survey",
      questions: [q({ question_id: 1, prompt: "Do you back {{campaign_name}}?" })],
    });
    expect(doc.intro).toBe("Hi ______ — quick survey");
    expect(doc.questions[0].prompt).toBe("Do you back ______?");
  });

  it("falls back to a title when the survey has none", () => {
    expect(buildPrintableSurvey({ title: "   ", questions: [] }).title).toBe(
      "Survey",
    );
  });
});

describe("printableSurveyFilename", () => {
  it("slugs the title and adds the extension", () => {
    expect(printableSurveyFilename("Oceaneering log of claims")).toBe(
      "Oceaneering-log-of-claims.docx",
    );
  });

  it("drops characters that break a download filename", () => {
    expect(printableSurveyFilename('Fugro: "vote" / EBA?')).toBe(
      "Fugro-vote-EBA.docx",
    );
  });

  it("falls back when the title reduces to nothing", () => {
    expect(printableSurveyFilename("///")).toBe("survey.docx");
    expect(printableSurveyFilename("")).toBe("survey.docx");
  });
});
