/**
 * Self-contained HTML export of a survey report.
 *
 * Pure: (aggregates, questions, narrative/chart_spec, options) → string.
 * Inline CSS only, hand-rolled inline SVG bars, no scripts, no external
 * assets, so the file can be emailed or printed as-is. Every string from
 * the data or the AI passes through `esc()`.
 */

import type { ChartSection, ChartSpec, ReportNarrative } from "./schemas";
import type {
  AnSurveyQuestion,
  ChoiceAggregate,
  CrossTab,
  FreeTextAggregate,
  MultiSelectAggregate,
  QuestionAggregate,
  SurveyAggregates,
} from "./types";

export interface HtmlExportInput {
  title: string;
  /** Campaign the import is linked to, for the sub-heading. */
  campaignName?: string | null;
  /** When the document is produced (defaults to now). */
  generatedAt?: Date | string;
  aggregates: SurveyAggregates;
  questions: Pick<AnSurveyQuestion, "qkey" | "label" | "qtype" | "sort" | "include_in_report">[];
  narrative: ReportNarrative | null;
  chartSpec: ChartSpec | null;
  reportGeneratedAt?: string | null;
  reportModel?: string | null;
  /** Append the scrubbed verbatim free-text responses. Default false. */
  includeText?: boolean;
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugForFilename(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "survey-report";
}

export function formatDateYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateHuman(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function fmtPct(p: number): string {
  return `${p.toFixed(1)}%`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px 64px; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e3e3e3; }
  h3 { font-size: 16px; margin: 28px 0 8px; }
  .sub { color: #555; margin: 0 0 20px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
  .tile { flex: 1 1 150px; border: 1px solid #e3e3e3; border-radius: 8px; padding: 12px 14px; }
  .tile .n { font-size: 26px; font-weight: 700; line-height: 1.1; }
  .tile .l { color: #555; font-size: 13px; }
  .headline { font-size: 18px; font-weight: 600; margin: 20px 0 8px; }
  .insight { background: #f6f7f9; border-left: 4px solid #2f6fed; padding: 10px 14px; margin: 10px 0 14px; }
  .caveats { border: 1px solid #f2d59b; background: #fff8e6; border-radius: 8px; padding: 10px 14px; }
  .caveats li { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 14px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ececec; vertical-align: top; }
  th { background: #f6f7f9; font-weight: 600; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .bar { vertical-align: middle; }
  .meta { color: #555; font-size: 13px; margin: 4px 0 10px; }
  .themes li { margin: 3px 0; }
  .terms { color: #333; font-size: 14px; }
  .terms span { display: inline-block; background: #eef1f6; border-radius: 12px; padding: 2px 10px; margin: 2px 4px 2px 0; }
  .verbatim { list-style: none; padding: 0; margin: 8px 0; }
  .verbatim li { border-left: 3px solid #d9dde5; padding: 4px 10px; margin: 6px 0; color: #222; }
  .lead { border: 1px solid #cfdcf7; border-radius: 10px; padding: 8px 16px 12px; background: #fbfcff; }
  .other { margin: 6px 0 0 0; padding-left: 18px; }
  footer { margin-top: 48px; color: #777; font-size: 12px; border-top: 1px solid #e3e3e3; padding-top: 10px; }
  @media print { body { padding: 0; } h2 { page-break-after: avoid; } table, .insight, .tile { page-break-inside: avoid; } }
`;

const BAR_W = 220;
const BAR_H = 14;

function bar(pct: number, colour = "#2f6fed"): string {
  const w = Math.max(0, Math.min(BAR_W, Math.round((pct / 100) * BAR_W)));
  return `<svg class="bar" width="${BAR_W}" height="${BAR_H}" viewBox="0 0 ${BAR_W} ${BAR_H}" role="img" aria-label="${esc(fmtPct(pct))}"><rect width="${BAR_W}" height="${BAR_H}" rx="3" fill="#eef1f6"/><rect width="${w}" height="${BAR_H}" rx="3" fill="${colour}"/></svg>`;
}

function optionTable(rows: { label: string; count: number; pct: number }[], pctHeading: string): string {
  const body = rows
    .map(
      (o) =>
        `<tr><td>${esc(o.label)}</td><td class="num">${o.count}</td><td class="num">${esc(fmtPct(o.pct))}</td><td>${bar(o.pct)}</td></tr>`
    )
    .join("\n");
  return `<table><thead><tr><th>Option</th><th class="num">Count</th><th class="num">${esc(pctHeading)}</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderChoice(a: ChoiceAggregate): string {
  const meta = [`${a.n_answered} answered`, `${a.no_answer} no answer`];
  if (a.mean != null) meta.push(`mean ${a.mean}`);
  return `<p class="meta">${esc(meta.join(" · "))}</p>${optionTable(a.options, "% of answered")}`;
}

function renderMulti(a: MultiSelectAggregate): string {
  const meta = `${a.n_respondents} respondents · ${a.none_selected} selected none · ${a.avg_selections} selections on average`;
  let html = `<p class="meta">${esc(meta)}</p>${optionTable(a.options, "% of respondents")}`;
  if (a.other_texts.length) {
    html += `<h4>Other (specified)</h4><ul class="other">${a.other_texts.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  }
  return html;
}

function renderCrossTab(ct: CrossTab, rowLabel: string, colLabel: string): string {
  const head = ct.col_options.map((o) => `<th class="num">${esc(o.label)}</th>`).join("");
  const body = ct.row_options
    .map((ro, i) => {
      const cells = ct.cells[i]
        .map((c) => {
          const total = ct.row_totals[i];
          const p = total > 0 ? (c / total) * 100 : 0;
          return `<td class="num">${c}<br><span class="meta">${esc(fmtPct(p))}</span></td>`;
        })
        .join("");
      return `<tr><th>${esc(ro.label)}</th>${cells}<td class="num"><strong>${ct.row_totals[i]}</strong></td></tr>`;
    })
    .join("\n");
  const totals = ct.col_totals.map((t) => `<td class="num"><strong>${t}</strong></td>`).join("");
  return `<p class="meta">${esc(`Rows: ${rowLabel} · Columns: ${colLabel} · ${ct.n} respondents answered both`)}</p>
<table><thead><tr><th></th>${head}<th class="num">Row total</th></tr></thead><tbody>${body}
<tr><th>Column total</th>${totals}<td class="num"><strong>${ct.n}</strong></td></tr></tbody></table>`;
}

function renderFreeText(a: FreeTextAggregate, summary: string | null, includeText: boolean): string {
  let html = `<p class="meta">${esc(`${a.n_answered} answered · ${a.no_answer} no answer`)}</p>`;
  if (summary) html += `<div class="insight">${paragraphs(summary)}</div>`;
  if (a.themes.length) {
    html += `<h4>Themes</h4><ul class="themes">${a.themes
      .map((t) => `<li>${esc(t.label)} — <strong>${t.count}</strong></li>`)
      .join("")}</ul>`;
  }
  if (a.top_terms.length) {
    html += `<h4>Most frequent terms</h4><p class="terms">${a.top_terms
      .map((t) => `<span>${esc(t.term)} (${t.count})</span>`)
      .join("")}</p>`;
  }
  if (includeText && a.responses.length) {
    html += `<h4>Responses${a.truncated ? " (first shown)" : ""}</h4><ul class="verbatim">${a.responses
      .map((r) => `<li>${esc(r.text)}</li>`)
      .join("")}</ul>`;
  }
  return html;
}

/** Fallback section order when no report exists: every included question. */
function defaultSections(input: HtmlExportInput): ChartSection[] {
  return [...input.questions]
    .filter((q) => q.include_in_report && q.qtype !== "identity")
    .sort((a, b) => a.sort - b.sort)
    .map((q): ChartSection => {
      if (q.qtype === "free_text") return { kind: "free_text", qkey: q.qkey, themes: [] };
      return { kind: "question", qkey: q.qkey, chart: "hbar", emphasis: "normal" };
    });
}

export function renderSurveyReportHtml(input: HtmlExportInput): string {
  const { aggregates, narrative } = input;
  const includeText = input.includeText === true;
  const generatedAt = input.generatedAt ? new Date(input.generatedAt) : new Date();
  const labels = new Map(input.questions.map((q) => [q.qkey, q.label]));
  const label = (qkey: string) => labels.get(qkey) ?? qkey;
  const aggByKey = new Map<string, QuestionAggregate>(aggregates.questions.map((q) => [q.qkey, q]));
  const ctByKey = new Map<string, CrossTab>(aggregates.crosstabs.map((c) => [`${c.row_qkey}|${c.col_qkey}`, c]));
  const insightByKey = new Map((narrative?.per_question ?? []).map((p) => [p.qkey, p.insight]));
  const ctInsightByKey = new Map(
    (narrative?.crosstab_insights ?? []).map((c) => [`${c.row_qkey}|${c.col_qkey}`, c.insight])
  );
  const ftSummaryByKey = new Map((narrative?.free_text_summaries ?? []).map((f) => [f.qkey, f.summary]));

  const sections = input.chartSpec?.sections.length ? input.chartSpec.sections : defaultSections(input);
  // Questions the spec did not mention still get rendered, after the spec's order.
  const mentioned = new Set(
    sections.flatMap((s) => (s.kind === "crosstab" ? [] : [s.qkey]))
  );
  const extras = defaultSections(input).filter((s) => s.kind !== "crosstab" && !mentioned.has(s.qkey));
  const ordered: ChartSection[] = [...sections, ...extras];

  const h = aggregates.headline;
  const tiles: { n: string; l: string }[] = [
    { n: String(h.respondents), l: "Respondents" },
    { n: String(h.submissions), l: "Submissions" },
    { n: String(h.duplicates), l: "Duplicate submissions" },
  ];
  if (h.an_total_records != null) tiles.push({ n: String(h.an_total_records), l: "Reported by Action Network" });

  const parts: string[] = [];
  parts.push(`<h1>${esc(input.title)}</h1>`);
  const subBits = [
    input.campaignName ? `Campaign: ${input.campaignName}` : null,
    `Exported ${formatDateHuman(generatedAt)}`,
    h.file_name ? `Data: ${h.file_name}` : null,
    h.uploaded_at ? `uploaded ${formatDateHuman(h.uploaded_at)}` : null,
  ].filter((s): s is string => Boolean(s));
  parts.push(`<p class="sub">${esc(subBits.join(" · "))}</p>`);
  parts.push(
    `<div class="tiles">${tiles.map((t) => `<div class="tile"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`).join("")}</div>`
  );

  if (narrative) {
    parts.push(`<h2>Summary</h2>`);
    if (narrative.headline) parts.push(`<p class="headline">${esc(narrative.headline)}</p>`);
    parts.push(paragraphs(narrative.summary));
    if (narrative.caveats.length) {
      parts.push(
        `<div class="caveats"><strong>Caveats</strong><ul>${narrative.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`
      );
    }
    if (input.reportGeneratedAt) {
      parts.push(
        `<p class="meta">${esc(`AI narrative generated ${formatDateHuman(input.reportGeneratedAt)}${input.reportModel ? ` (${input.reportModel})` : ""}. All figures are computed by the application from the imported responses.`)}</p>`
      );
    }
  }

  parts.push(`<h2>Results</h2>`);
  let rendered = 0;
  for (const s of ordered) {
    if (s.kind === "crosstab") {
      const ct = ctByKey.get(`${s.row_qkey}|${s.col_qkey}`);
      if (!ct) continue;
      rendered++;
      parts.push(`<h3>${esc(`${label(s.row_qkey)} × ${label(s.col_qkey)}`)}</h3>`);
      const ins = ctInsightByKey.get(`${s.row_qkey}|${s.col_qkey}`);
      if (ins) parts.push(`<div class="insight">${esc(ins)}</div>`);
      parts.push(renderCrossTab(ct, label(s.row_qkey), label(s.col_qkey)));
      continue;
    }
    const a = aggByKey.get(s.qkey);
    if (!a) continue;
    rendered++;
    const lead = s.kind === "question" && s.emphasis === "lead";
    const open = lead ? `<section class="lead">` : `<section>`;
    parts.push(`${open}<h3>${esc(label(s.qkey))}</h3>`);
    const ins = insightByKey.get(s.qkey);
    if (ins) parts.push(`<div class="insight">${esc(ins)}</div>`);
    if (a.qtype === "free_text") parts.push(renderFreeText(a, ftSummaryByKey.get(s.qkey) ?? null, includeText));
    else if (a.qtype === "multi_select") parts.push(renderMulti(a));
    else parts.push(renderChoice(a));
    parts.push(`</section>`);
  }
  if (rendered === 0) parts.push(`<p class="meta">No reportable questions.</p>`);

  parts.push(
    `<footer>${esc(
      includeText
        ? "Free-text responses are included in this file with emails, phone numbers, links and respondent names redacted. Handle as member data."
        : "Free-text responses are summarised only; individual answers are not included in this file."
    )}</footer>`
  );

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${parts.join("\n")}
</main>
</body>
</html>
`;
}
