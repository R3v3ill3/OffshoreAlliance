import { describe, expect, it } from "vitest";
import { esc, formatDateYmd, renderSurveyReportHtml, slugForFilename } from "../html-export";
import type { ChartSpec, ReportNarrative } from "../schemas";
import { buildAggregates } from "../server";
import { buildFixtureContext } from "./test-context";

const ctx = buildFixtureContext();
const qkey = (label: string) => ctx.questions.find((q) => q.label === label)!.qkey;

const narrative: ReportNarrative = {
  headline: "Most respondents are ready to go now.",
  summary: "A clear majority said they are definitely available.\n\nA handful asked to be contacted later.",
  per_question: [{ qkey: qkey("Availability"), insight: "Definite availability dominates." }],
  crosstab_insights: [
    { row_qkey: qkey("Availability"), col_qkey: qkey("OA member"), insight: "Members are readier than non-members." },
  ],
  free_text_summaries: [{ qkey: qkey("notes"), summary: "People mostly flagged follow-up preferences." }],
  caveats: ["Coverage is below Action Network's count."],
};

const chartSpec: ChartSpec = {
  sections: [
    { kind: "question", qkey: qkey("Availability"), chart: "hbar", emphasis: "lead" },
    { kind: "crosstab", row_qkey: qkey("Availability"), col_qkey: qkey("OA member"), chart: "table" },
    { kind: "question", qkey: qkey("Roles"), chart: "hbar", emphasis: "normal" },
    { kind: "free_text", qkey: qkey("notes"), themes: [{ label: "Follow-up requests", row_ids: [2, 4] }] },
  ],
};

function withReport(includeText: boolean) {
  const report = {
    id: "r1",
    import_id: ctx.import.id,
    batch_id: ctx.current_batch!.id,
    extraction_brief: null,
    review: null,
    narrative,
    chart_spec: chartSpec,
    model: "claude-test",
    input_tokens: 1,
    output_tokens: 1,
    generated_at: "2026-09-12T02:00:00.000Z",
  };
  const reportCtx = { ...ctx, report, import: { ...ctx.import, current_report_id: "r1" } };
  const aggregates = buildAggregates(reportCtx, { includeText })!;
  return renderSurveyReportHtml({
    title: ctx.import.title,
    aggregates,
    questions: ctx.questions,
    narrative,
    chartSpec,
    reportGeneratedAt: report.generated_at,
    reportModel: report.model,
    includeText,
    generatedAt: new Date("2026-09-13T00:00:00Z"),
  });
}

describe("renderSurveyReportHtml", () => {
  it("renders headline tiles and every included question without a report", () => {
    const aggregates = buildAggregates(ctx, {})!;
    const html = renderSurveyReportHtml({
      title: ctx.import.title,
      aggregates,
      questions: ctx.questions,
      narrative: null,
      chartSpec: null,
      generatedAt: new Date("2026-09-13T00:00:00Z"),
    });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Respondents");
    expect(html).toContain(`<div class="n">9</div>`); // respondents
    expect(html).toContain(`<div class="n">12</div>`); // submissions
    expect(html).toContain("Reported by Action Network");
    expect(html).toContain("<h3>Availability</h3>");
    expect(html).toContain("<h3>Roles</h3>");
    expect(html).toContain("<h3>notes</h3>");
    expect(html).not.toContain("<h3>Email</h3>");
    expect(html).not.toContain("Summary</h2>");
    // Percentages come from the aggregates.
    expect(html).toMatch(/\d+\.\d%/);
    expect(html).toContain("<svg");
    // No scripts, no external assets.
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/src="http/);
  });

  it("renders the narrative, caveats, cross-tab and theme tallies with a report", () => {
    const html = withReport(false);
    expect(html).toContain("Most respondents are ready to go now.");
    expect(html).toContain("<p>A clear majority said they are definitely available.</p>");
    expect(html).toContain("Coverage is below Action Network");
    expect(html).toContain("Availability × OA member");
    expect(html).toContain("Members are readier than non-members.");
    expect(html).toContain("Row total");
    expect(html).toContain("Follow-up requests");
    expect(html).toContain("People mostly flagged follow-up preferences.");
    expect(html).toContain(`<section class="lead">`);
    // Questions the spec omitted are still rendered after it.
    expect(html).toContain("<h3>Kystdesign</h3>");
  });

  it("only includes verbatim free text when includeText is set", () => {
    const without = withReport(false);
    const withText = withReport(true);
    expect(without).not.toContain("Third and latest");
    expect(withText).toContain("Third and latest");
    // Scrubbed by aggregate: the phone/email in Bea's note never appear.
    expect(withText).not.toContain("bea@example.org");
    expect(withText).not.toContain("0400 111 222");
    expect(withText).toContain("[phone]");
    expect(without).toContain("summarised only");
    expect(withText).toContain("redacted");
  });

  it("escapes HTML in labels, options and narrative", () => {
    const evil = ctx.questions.map((q) =>
      q.label === "Availability" ? { ...q, label: `Avail <script>alert(1)</script>` } : q
    );
    const aggregates = buildAggregates({ ...ctx, questions: evil }, {})!;
    const html = renderSurveyReportHtml({
      title: `Title <img src=x onerror=alert(1)>`,
      aggregates,
      questions: evil,
      narrative: { ...narrative, headline: `<b>bold</b> & "quoted"` },
      chartSpec: null,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;");
  });
});

describe("helpers", () => {
  it("esc covers the five characters", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("slugForFilename and formatDateYmd build the download name", () => {
    expect(slugForFilename("ROV roles — register your interest & availability")).toBe(
      "rov-roles-register-your-interest-availability"
    );
    expect(slugForFilename("   ")).toBe("survey-report");
    expect(formatDateYmd(new Date("2026-09-13T23:59:00Z"))).toBe("2026-09-13");
  });
});
