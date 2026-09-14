/**
 * Flag figures in AI narrative that the app did not compute.
 *
 * Claude is told not to emit numbers; this is the belt to that brace. It
 * never blocks a report — it produces warnings the UI shows next to the
 * narrative so an organiser knows to double-check a sentence.
 */

import type { ReportNarrative } from "./schemas";

const NUMBER_RE = /(?<![\w.])(\d+(?:\.\d+)?)\s*(%|percent|per cent)?(?![\w.])/gi;

/** Integers that are ordinary English (ordinal-ish) rather than statistics. */
const BENIGN = new Set(["0", "1", "2", "3"]);

export function findUnknownNumbers(text: string, known: Set<string>): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[1];
    const isPct = Boolean(m[2]);
    if (!isPct && BENIGN.has(raw)) continue;
    if (/^(19|20)\d{2}$/.test(raw) && !isPct) continue; // years
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (known.has(raw) || known.has(String(n)) || known.has(n.toFixed(1))) continue;
    hits.push(isPct ? `${raw}%` : raw);
  }
  return hits;
}

export function numberGuard(narrative: ReportNarrative, known: Set<string>): string[] {
  const warnings: string[] = [];
  const check = (label: string, text: string) => {
    const unknown = findUnknownNumbers(text, known);
    if (unknown.length) warnings.push(`${label}: ${Array.from(new Set(unknown)).join(", ")}`);
  };
  check("Headline", narrative.headline);
  check("Summary", narrative.summary);
  for (const p of narrative.per_question) check(`Insight (${p.qkey})`, p.insight);
  for (const c of narrative.crosstab_insights) check(`Cross-tab (${c.row_qkey} × ${c.col_qkey})`, c.insight);
  for (const f of narrative.free_text_summaries) check(`Free text (${f.qkey})`, f.summary);
  for (const c of narrative.caveats) check("Caveat", c);
  return warnings;
}
