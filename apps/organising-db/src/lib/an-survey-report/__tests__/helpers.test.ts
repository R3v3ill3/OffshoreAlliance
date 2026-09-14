import { describe, expect, it } from "vitest";

import type { ChartSpec, ReportNarrative } from "@/lib/an-surveys/schemas";
import type {
  AnSurveyQuestion,
  ChoiceAggregate,
  FreeTextAggregate,
  MultiSelectAggregate,
  SurveyAggregates,
} from "@/lib/an-surveys/types";
import {
  NO_ANSWER_KEY,
  buildSections,
  cellHeat,
  choiceRows,
  crosstabTokensFor,
  multiSelectRows,
  pctOf,
  questionNumbers,
} from "../helpers";

function q(
  qkey: string,
  qtype: AnSurveyQuestion["qtype"],
  sort: number,
  include = true
): AnSurveyQuestion {
  return {
    id: `id-${qkey}`,
    import_id: "imp",
    qkey,
    label: qkey.toUpperCase(),
    qtype,
    source_columns: [qkey],
    other_column: null,
    options: [],
    sort,
    include_in_report: include,
    user_edited: false,
    missing_since: null,
  };
}

const availability: ChoiceAggregate = {
  qkey: "availability",
  qtype: "single_choice",
  n_answered: 8,
  no_answer: 2,
  options: [
    { key: "now", label: "Now", count: 6, pct: 75 },
    { key: "later", label: "Later", count: 2, pct: 25 },
  ],
  mean: null,
};

const roles: MultiSelectAggregate = {
  qkey: "roles",
  qtype: "multi_select",
  n_respondents: 4,
  none_selected: 1,
  avg_selections: 1.5,
  options: [
    { key: "pilot", label: "Pilot", count: 3, pct: 75 },
    { key: "tech", label: "Tech", count: 3, pct: 75 },
  ],
  other_texts: ["Cook"],
};

const comments: FreeTextAggregate = {
  qkey: "comments",
  qtype: "free_text",
  n_answered: 3,
  no_answer: 7,
  responses: [],
  truncated: false,
  top_terms: [],
  themes: [],
};

const aggregates: SurveyAggregates = {
  headline: {
    submissions: 10,
    respondents: 10,
    duplicates: 0,
    an_total_records: 10,
    file_name: "x.csv",
    uploaded_at: "2026-09-10T00:00:00Z",
  },
  questions: [availability, roles, comments],
  crosstabs: [],
};

const questions = [
  q("email", "identity", 0),
  q("roles", "multi_select", 1),
  q("availability", "single_choice", 2),
  q("comments", "free_text", 3),
  q("country", "meta", 4, false),
];

describe("pctOf / choiceRows — the 'Include no answer' toggle", () => {
  it("is one-decimal and safe on an empty base", () => {
    expect(pctOf(1, 3)).toBe(33.3);
    expect(pctOf(0, 0)).toBe(0);
    expect(pctOf(2, 0)).toBe(0);
  });

  it("shares are of answered respondents by default and sum to 100", () => {
    const rows = choiceRows(availability, false);
    expect(rows.map((r) => r.pct)).toEqual([75, 25]);
    expect(rows.every((r) => r.base === 8)).toBe(true);
    expect(rows.some((r) => r.synthetic)).toBe(false);
  });

  it("widens the base and appends a No answer row when included", () => {
    const rows = choiceRows(availability, true);
    expect(rows.map((r) => [r.key, r.pct])).toEqual([
      ["now", 60],
      ["later", 20],
      [NO_ANSWER_KEY, 20],
    ]);
    expect(rows.every((r) => r.base === 10)).toBe(true);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 5);
  });

  it("does not append a No answer row when nobody skipped", () => {
    const rows = choiceRows({ ...availability, no_answer: 0 }, true);
    expect(rows).toHaveLength(2);
    expect(rows[0].base).toBe(8);
  });
});

describe("multiSelectRows — per-respondent shares", () => {
  it("is per respondent, so shares may exceed 100 in total", () => {
    const rows = multiSelectRows(roles, false);
    expect(rows.map((r) => r.pct)).toEqual([75, 75]);
  });

  it("includes the none-selected people in the base when asked", () => {
    const rows = multiSelectRows(roles, true);
    expect(rows.map((r) => [r.label, r.pct])).toEqual([
      ["Pilot", 60],
      ["Tech", 60],
      ["None selected", 20],
    ]);
  });
});

describe("buildSections", () => {
  it("with no batch there is nothing to draw", () => {
    expect(buildSections(questions, null, null)).toEqual([]);
  });

  it("without a report: every included non-identity aggregate in question order, default charts", () => {
    const sections = buildSections(questions, aggregates, null);
    expect(sections.map((s) => [s.kind, "qkey" in s ? s.qkey : null])).toEqual([
      ["question", "roles"],
      ["question", "availability"],
      ["free_text", "comments"],
    ]);
    const [rolesSection, availSection] = sections;
    expect(rolesSection.kind === "question" && rolesSection.chart).toBe("hbar");
    expect(availSection.kind === "question" && availSection.chart).toBe("bar");
  });

  it("with a report: chart_spec order wins, unknown qkeys are dropped, forgotten questions are appended", () => {
    const chart_spec: ChartSpec = {
      sections: [
        { kind: "question", qkey: "availability", chart: "pie", emphasis: "lead" },
        { kind: "question", qkey: "nope", chart: "bar", emphasis: "normal" },
        { kind: "crosstab", row_qkey: "availability", col_qkey: "roles", chart: "heatmap" },
        { kind: "free_text", qkey: "comments", themes: [] },
      ],
    };
    const narrative: ReportNarrative = {
      headline: "h",
      summary: "s",
      per_question: [{ qkey: "availability", insight: "Most are ready now." }],
      crosstab_insights: [
        { row_qkey: "availability", col_qkey: "roles", insight: "Pilots are ready." },
      ],
      free_text_summaries: [{ qkey: "comments", summary: "People want rosters." }],
      caveats: [],
    };
    const sections = buildSections(questions, aggregates, { chart_spec, narrative });
    expect(sections.map((s) => s.kind)).toEqual(["question", "crosstab", "free_text", "question"]);

    const lead = sections[0];
    expect(lead.kind === "question" && lead.chart).toBe("pie");
    expect(lead.kind === "question" && lead.emphasis).toBe("lead");
    expect(lead.insight).toBe("Most are ready now.");

    const xt = sections[1];
    expect(xt.kind === "crosstab" && xt.crosstab).toBeNull();
    expect(xt.insight).toBe("Pilots are ready.");

    const ft = sections[2];
    expect(ft.kind === "free_text" && ft.summary).toBe("People want rosters.");

    // `roles` was not in the spec but has data, so it is appended.
    const appended = sections[3];
    expect(appended.kind === "question" && appended.qkey).toBe("roles");
  });

  it("lists every cross-tab pair the spec asks for as a crosstabs= token", () => {
    expect(
      crosstabTokensFor({
        sections: [
          { kind: "crosstab", row_qkey: "a", col_qkey: "b", chart: "table" },
          { kind: "crosstab", row_qkey: "a", col_qkey: "b", chart: "heatmap" },
          { kind: "question", qkey: "a", chart: "bar", emphasis: "normal" },
        ],
      })
    ).toEqual(["a:b"]);
    expect(crosstabTokensFor(null)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("numbers only the included, non-identity questions in sort order", () => {
    const nums = questionNumbers(questions);
    expect([...nums.entries()]).toEqual([
      ["roles", 1],
      ["availability", 2],
      ["comments", 3],
    ]);
  });

  it("cellHeat is relative to the largest cell and 0 on an empty table", () => {
    expect(cellHeat(2, [[4, 2], [0, 1]])).toBe(0.5);
    expect(cellHeat(0, [[0, 0]])).toBe(0);
  });
});
