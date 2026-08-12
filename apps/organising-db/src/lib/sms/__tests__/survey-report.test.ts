import { describe, expect, it } from "vitest";
import {
  formatPercent,
  formatSliceValue,
  participationSlices,
  questionSlices,
  sliceTotal,
} from "@/lib/sms/survey-report";
import type {
  SmsSurveyQuestionRow,
  VwSmsSurveyAnswerDistributionRow,
  VwSmsSurveyFunnelRow,
} from "@/types/sms";

function funnel(
  over: Partial<VwSmsSurveyFunnelRow> = {},
): VwSmsSurveyFunnelRow {
  return {
    survey_id: 1,
    campaign_id: 1,
    total_sessions: 0,
    queued_count: 0,
    invited_count: 0,
    active_count: 0,
    completed_count: 0,
    expired_count: 0,
    opted_out_count: 0,
    handed_off_count: 0,
    undeliverable_count: 0,
    ever_invited_count: 0,
    started_count: 0,
    ...over,
  };
}

function question(
  over: Partial<SmsSurveyQuestionRow> = {},
): Pick<SmsSurveyQuestionRow, "question_id" | "qtype" | "options"> {
  return {
    question_id: 10,
    qtype: "choice",
    options: null,
    ...over,
  };
}

function row(
  over: Partial<VwSmsSurveyAnswerDistributionRow>,
): VwSmsSurveyAnswerDistributionRow {
  return {
    survey_id: 1,
    question_id: 10,
    sort_order: 1,
    qtype: "choice",
    parsed_value: "a",
    answer_count: 0,
    completed_answer_count: 0,
    ...over,
  };
}

describe("participationSlices", () => {
  it("splits the invited audience into finished, mid-survey and silent", () => {
    const slices = participationSlices(
      funnel({ ever_invited_count: 100, started_count: 60, completed_count: 25 }),
    );
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ["Completed", 25],
      ["Started, not finished", 35],
      ["No response", 40],
    ]);
    expect(sliceTotal(slices)).toBe(100);
  });

  it("drops empty stages and leaves queued sessions out of the pie", () => {
    const slices = participationSlices(
      funnel({
        total_sessions: 50,
        queued_count: 30,
        ever_invited_count: 20,
        started_count: 20,
        completed_count: 20,
      }),
    );
    expect(slices.map((s) => s.name)).toEqual(["Completed"]);
    expect(sliceTotal(slices)).toBe(20);
  });

  it("never renders a negative slice when counts disagree", () => {
    const slices = participationSlices(
      funnel({ ever_invited_count: 0, started_count: 5, completed_count: 9 }),
    );
    expect(slices.every((s) => s.value >= 0)).toBe(true);
  });

  it("handles a missing funnel row", () => {
    expect(participationSlices(null)).toEqual([]);
  });
});

describe("questionSlices", () => {
  it("orders yes_no as Yes then No with semantic colours", () => {
    const slices = questionSlices(question({ qtype: "yes_no" }), [
      row({ parsed_value: "no", answer_count: 4 }),
      row({ parsed_value: "yes", answer_count: 11 }),
    ]);
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ["Yes", 11],
      ["No", 4],
    ]);
    expect(slices[0].color).not.toBe(slices[1].color);
  });

  it("orders scale answers ascending and skips unanswered points", () => {
    const slices = questionSlices(
      question({ qtype: "scale", options: { min: 1, max: 5 } }),
      [
        row({ parsed_value: "5", answer_count: 2 }),
        row({ parsed_value: "1", answer_count: 7 }),
        row({ parsed_value: "3", answer_count: 3 }),
      ],
    );
    expect(slices.map((s) => s.name)).toEqual(["1", "3", "5"]);
  });

  it("uses authored option order and labels for choice questions", () => {
    const slices = questionSlices(
      question({
        options: [
          { value: "wage", label: "Wages" },
          { value: "roster", label: "Rosters" },
          { value: "safety", label: "Safety" },
        ],
      }),
      [
        row({ parsed_value: "safety", answer_count: 1 }),
        row({ parsed_value: "wage", answer_count: 9 }),
      ],
    );
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ["Wages", 9],
      ["Safety", 1],
    ]);
  });

  it("keeps answers whose option no longer exists", () => {
    const slices = questionSlices(
      question({ options: [{ value: "wage", label: "Wages" }] }),
      [
        row({ parsed_value: "wage", answer_count: 3 }),
        row({ parsed_value: "retired_option", answer_count: 2 }),
      ],
    );
    expect(slices.map((s) => s.name)).toEqual(["Wages", "retired_option"]);
    expect(sliceTotal(slices)).toBe(5);
  });

  it("ignores rows belonging to other questions", () => {
    const slices = questionSlices(question({ qtype: "yes_no" }), [
      row({ question_id: 99, parsed_value: "yes", answer_count: 50 }),
      row({ parsed_value: "yes", answer_count: 2 }),
    ]);
    expect(sliceTotal(slices)).toBe(2);
  });

  it("counts completed sessions only when asked (ballot reading)", () => {
    const rows = [
      row({ parsed_value: "yes", answer_count: 10, completed_answer_count: 6 }),
      row({ parsed_value: "no", answer_count: 4, completed_answer_count: 4 }),
    ];
    const q = question({ qtype: "yes_no" });
    expect(sliceTotal(questionSlices(q, rows))).toBe(14);
    expect(sliceTotal(questionSlices(q, rows, { completedOnly: true }))).toBe(
      10,
    );
  });

  it("returns nothing when a question has no answers", () => {
    expect(questionSlices(question({ qtype: "yes_no" }), [])).toEqual([]);
  });
});

describe("label formatting", () => {
  it("keeps a decimal for small shares and rounds larger ones", () => {
    expect(formatPercent(1, 300)).toBe("0.3%");
    expect(formatPercent(1, 3)).toBe("33%");
    expect(formatPercent(0, 0)).toBe("0%");
  });

  it("switches between counts and percentages", () => {
    expect(formatSliceValue(1200, 2400, "count")).toBe((1200).toLocaleString());
    expect(formatSliceValue(1200, 2400, "percent")).toBe("50%");
  });
});
