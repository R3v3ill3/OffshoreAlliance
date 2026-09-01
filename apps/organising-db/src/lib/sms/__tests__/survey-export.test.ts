import { describe, expect, it } from "vitest";
import {
  buildLongSurveyExport,
  buildWideSurveyExport,
  questionColumn,
  verbatimColumn,
  type ExportAnswer,
  type ExportQuestion,
  type ExportSession,
} from "../survey-export";

const q1: ExportQuestion = {
  question_id: 1,
  number: 1,
  prompt: "Pay rise",
  qtype: "scale",
};
const q2: ExportQuestion = {
  question_id: 2,
  number: 2,
  prompt: "Will you attend?",
  qtype: "yes_no",
};

function session(p: Partial<ExportSession> & { session_id: number }): ExportSession {
  return {
    worker_id: 100 + p.session_id,
    worker_name: "Amy Chen",
    employer_name: "Fugro",
    phone_e164: "+61400100014",
    state: "completed",
    invited_at: "2026-08-01T00:00:00Z",
    first_answer_at: "2026-08-01T00:05:00Z",
    completed_at: "2026-08-01T00:09:00Z",
    ...p,
  };
}

function answer(p: Partial<ExportAnswer> & { question_id: number }): ExportAnswer {
  return {
    parsed_value: "5",
    raw_body: "5",
    invalid_attempts: 0,
    received_at: "2026-08-01T00:05:00Z",
    ...p,
  };
}

describe("questionColumn", () => {
  it("leads with the number so columns sort in survey order", () => {
    expect(questionColumn(q1)).toBe("Q1. Pay rise");
  });

  it("keeps duplicate prompts distinct", () => {
    // Identical headers would collapse into one column when parsed.
    const a = questionColumn({ ...q1, number: 1 });
    const b = questionColumn({ ...q1, question_id: 9, number: 4 });
    expect(a).not.toBe(b);
  });

  it("truncates a long prompt so the header stays readable", () => {
    const long = questionColumn({ ...q1, prompt: "x".repeat(200) });
    expect(long.length).toBeLessThan(80);
    expect(long.endsWith("…")).toBe(true);
  });

  it("collapses newlines and repeated spaces", () => {
    expect(questionColumn({ ...q1, prompt: "Pay\n  rise" })).toBe("Q1. Pay rise");
  });

  it("marks a retired question", () => {
    expect(questionColumn({ ...q1, retired_at: "2026-01-01" })).toContain(
      "[retired]",
    );
  });
});

describe("buildWideSurveyExport", () => {
  it("emits one row per respondent", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 }), session({ session_id: 2 })],
      questions: [q1, q2],
      answersBySession: new Map(),
    });
    expect(rows).toHaveLength(2);
  });

  it("puts each question's answer in its own column", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q1, q2],
      answersBySession: new Map([
        [
          1,
          [
            answer({ question_id: 1, parsed_value: "4", raw_body: "4" }),
            answer({ question_id: 2, parsed_value: "yes", raw_body: "Yes" }),
          ],
        ],
      ]),
    });
    expect(rows[0][questionColumn(q1)]).toBe("4");
    expect(rows[0][questionColumn(q2)]).toBe("yes");
  });

  it("keeps the verbatim reply when it says more than the parsed value", () => {
    // The whole reason verbatim is exported: "yes" loses the claim.
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q2],
      answersBySession: new Map([
        [
          1,
          [
            answer({
              question_id: 2,
              parsed_value: "yes",
              raw_body: "Yes we need a minimum increase of around 20%",
            }),
          ],
        ],
      ]),
    });
    expect(rows[0][verbatimColumn(q2)]).toBe(
      "Yes we need a minimum increase of around 20%",
    );
  });

  it("leaves verbatim empty when it merely repeats the parsed value", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q1],
      answersBySession: new Map([
        [1, [answer({ question_id: 1, parsed_value: "5", raw_body: "5" })]],
      ]),
    });
    expect(rows[0][verbatimColumn(q1)]).toBe("");
  });

  it("gives every row every column, answered or not", () => {
    // The CSV writer takes headers from the first row, so a missing key
    // would shift every later column on that line.
    const { headers, rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 }), session({ session_id: 2 })],
      questions: [q1, q2],
      answersBySession: new Map([
        [1, [answer({ question_id: 1 })]],
      ]),
    });
    for (const row of rows) {
      for (const h of headers) expect(Object.keys(row)).toContain(h);
    }
    expect(rows[1][questionColumn(q1)]).toBe("");
  });

  it("counts answered, total and invalid replies per respondent", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q1, q2],
      answersBySession: new Map([
        [
          1,
          [
            answer({ question_id: 1, invalid_attempts: 2 }),
            answer({ question_id: 2, parsed_value: null, invalid_attempts: 1 }),
          ],
        ],
      ]),
    });
    expect(rows[0].answered).toBe(1);
    expect(rows[0].questions).toBe(2);
    expect(rows[0].invalid_replies).toBe(3);
  });

  it("carries the employer, so answers can be cut by worksite", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1, employer_name: "Oceaneering" })],
      questions: [q1],
      answersBySession: new Map(),
    });
    expect(rows[0].employer).toBe("Oceaneering");
  });

  it("can omit verbatim columns entirely", () => {
    const { headers } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q1, q2],
      answersBySession: new Map(),
      includeVerbatim: false,
    });
    expect(headers).toContain(questionColumn(q1));
    expect(headers).not.toContain(verbatimColumn(q1));
  });

  it("still produces headers when nobody responded", () => {
    const { headers, rows } = buildWideSurveyExport({
      sessions: [],
      questions: [q1],
      answersBySession: new Map(),
    });
    expect(rows).toHaveLength(0);
    expect(headers).toContain(questionColumn(q1));
  });
});

describe("buildLongSurveyExport", () => {
  it("emits one row per answered question", () => {
    const { rows } = buildLongSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q1, q2],
      answersBySession: new Map([
        [1, [answer({ question_id: 2 }), answer({ question_id: 1 })]],
      ]),
    });
    expect(rows).toHaveLength(2);
    // Sorted back into survey order regardless of arrival order.
    expect(rows.map((r) => r.question_no)).toEqual([1, 2]);
  });

  it("keeps one row for a session that answered nothing", () => {
    // Otherwise the funnel states vanish from the file.
    const { rows } = buildLongSurveyExport({
      sessions: [session({ session_id: 1, state: "expired" })],
      questions: [q1],
      answersBySession: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].session_state).toBe("expired");
    expect(rows[0].parsed_value).toBe("");
  });
});

describe("open text is not truncated in the wide export", () => {
  const qOpen: ExportQuestion = {
    question_id: 7,
    number: 7,
    prompt: "Other issues?",
    qtype: "open_text",
  };

  it("leads with the full reply, not the 50-character parsed fragment", () => {
    // The runtime caps parsed_value at 50 chars, so for free text it
    // holds a fragment that reads like a whole answer. The complete
    // reply exists only in raw_body.
    const full =
      "Yes we need a minimum increase of around 5 to 7% for CPI with a 4 year agreement";
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [qOpen],
      answersBySession: new Map([
        [
          1,
          [
            answer({
              question_id: 7,
              parsed_value: full.slice(0, 50),
              raw_body: full,
            }),
          ],
        ],
      ]),
    });
    expect(rows[0][questionColumn(qOpen)]).toBe(full);
  });

  it("does not repeat the reply in the verbatim column", () => {
    const full = "a".repeat(120);
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [qOpen],
      answersBySession: new Map([
        [
          1,
          [answer({ question_id: 7, parsed_value: full.slice(0, 50), raw_body: full })],
        ],
      ]),
    });
    expect(rows[0][verbatimColumn(qOpen)]).toBe("");
  });

  it("still keeps the coded value first for a yes/no question", () => {
    // There the code is what gets counted; the prose rides alongside.
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [q2],
      answersBySession: new Map([
        [
          1,
          [answer({ question_id: 2, parsed_value: "yes", raw_body: "Yes, definitely" })],
        ],
      ]),
    });
    expect(rows[0][questionColumn(q2)]).toBe("yes");
    expect(rows[0][verbatimColumn(q2)]).toBe("Yes, definitely");
  });

  it("falls back to the parsed value when there is no raw body", () => {
    const { rows } = buildWideSurveyExport({
      sessions: [session({ session_id: 1 })],
      questions: [qOpen],
      answersBySession: new Map([
        [1, [answer({ question_id: 7, parsed_value: "short", raw_body: null })]],
      ]),
    });
    expect(rows[0][questionColumn(qOpen)]).toBe("short");
  });
});
