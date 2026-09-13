/**
 * Heuristic, deterministic question-schema detection for an AN export.
 *
 * Rules (in order):
 *  1. identity/meta columns by name (AN's standard contact fields);
 *  2. empty columns → meta, hidden;
 *  3. `Prefix_option` checkbox families → one multi_select (a non-checkbox
 *     sibling such as `Roles_other` becomes the free-text "other" column);
 *  4. small numeric ranges → scale;
 *  5. few distinct values → single_choice;
 *  6. everything else → free_text.
 *
 * Output is written to an_survey_questions and stays user-editable; on a
 * refresh only new columns are classified and user-edited rows are kept.
 */

import { autoMapParticipationHeader, isTruthyCell } from "@/lib/import/participation-import-shared";
import { cleanCell, optionKey, slugify, uniqueSlug } from "./normalise";
import type { AnSurveyOption, AnSurveyQuestionType, DetectedQuestion } from "./types";

/** Header → normalised comparison form. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[\s_\-/()]/g, "");
}

const META_HEADERS = new Set(
  [
    "address",
    "address1",
    "address2",
    "city",
    "stateprovince",
    "stateprovinceabbreviated",
    "state",
    "region",
    "zipcode",
    "postcode",
    "postalcode",
    "zip",
    "country",
    "language",
    "mobileoptin",
    "smsoptin",
    "emailoptin",
    "optin",
    "referrercode",
    "sourcecode",
    "source",
    "referrer",
    "timestampet",
    "timestamp",
    "submittedat",
    "createddate",
    "date",
    "utm",
    "ipaddress",
    "useragent",
  ].map(norm)
);

/** Meta columns worth offering as a breakdown dimension (off by default). */
const BREAKDOWN_META = new Set(["country", "stateprovince", "state", "region", "city"].map(norm));

/** Column suffixes that mark the free-text companion of a checkbox family. */
const OTHER_SUFFIX_RE = /^(other|others|otherpleasespecify|pleasespecify|specify)$/;

export interface ColumnStats {
  header: string;
  nonBlank: number;
  distinct: Map<string, { label: string; count: number }>;
  allTruthy: boolean;
  allNumeric: boolean;
  numericMin: number;
  numericMax: number;
}

export function columnStats(header: string, rows: Record<string, string>[]): ColumnStats {
  const distinct = new Map<string, { label: string; count: number }>();
  let nonBlank = 0;
  let allTruthy = true;
  let allNumeric = true;
  let numericMin = Number.POSITIVE_INFINITY;
  let numericMax = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const cleaned = cleanCell(r[header]);
    if (!cleaned) continue;
    nonBlank++;
    const key = optionKey(cleaned);
    const cur = distinct.get(key);
    if (cur) cur.count++;
    else distinct.set(key, { label: cleaned, count: 1 });
    if (allTruthy && !isTruthyCell(cleaned)) allTruthy = false;
    if (allNumeric) {
      const n = Number(cleaned);
      if (!Number.isFinite(n) || !Number.isInteger(n)) allNumeric = false;
      else {
        numericMin = Math.min(numericMin, n);
        numericMax = Math.max(numericMax, n);
      }
    }
  }
  if (nonBlank === 0) {
    allTruthy = false;
    allNumeric = false;
  }
  return { header, nonBlank, distinct, allTruthy, allNumeric, numericMin, numericMax };
}

function optionsByFrequency(stats: ColumnStats): AnSurveyOption[] {
  return Array.from(stats.distinct.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
    .map(([key, v]) => ({ key, label: v.label }));
}

function optionsNumeric(stats: ColumnStats): AnSurveyOption[] {
  return Array.from(stats.distinct.entries())
    .sort((a, b) => Number(a[1].label) - Number(b[1].label))
    .map(([key, v]) => ({ key, label: v.label }));
}

interface Family {
  prefix: string;
  members: string[];
}

/** Group `Prefix_suffix` headers by prefix (2+ members). */
function checkboxFamilies(headers: string[]): Family[] {
  const byPrefix = new Map<string, string[]>();
  for (const h of headers) {
    const idx = h.indexOf("_");
    if (idx <= 0 || idx === h.length - 1) continue;
    const prefix = h.slice(0, idx);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), h]);
  }
  return Array.from(byPrefix.entries())
    .filter(([, members]) => members.length >= 2)
    .map(([prefix, members]) => ({ prefix, members }));
}

export interface DetectOptions {
  /** Minimum rows before the frequency-based rules apply (below: distinct ≤ 3 → single_choice). */
  minRows?: number;
}

export function detectSchema(
  headers: string[],
  rows: Record<string, string>[],
  opts: DetectOptions = {}
): DetectedQuestion[] {
  const minRows = opts.minRows ?? 5;
  const taken = new Set<string>();
  const out: DetectedQuestion[] = [];
  const consumed = new Set<string>();
  let sort = 0;

  const statsByHeader = new Map<string, ColumnStats>();
  const stats = (h: string) => {
    let s = statsByHeader.get(h);
    if (!s) {
      s = columnStats(h, rows);
      statsByHeader.set(h, s);
    }
    return s;
  };

  const push = (q: Omit<DetectedQuestion, "sort" | "qkey"> & { qkey?: string }) => {
    out.push({
      ...q,
      qkey: uniqueSlug(q.qkey ?? slugify(q.label), taken),
      sort: sort++,
    });
  };

  // 3. checkbox families first so their members are consumed before the
  //    per-column rules run.
  for (const fam of checkboxFamilies(headers)) {
    const truthy = fam.members.filter((h) => stats(h).allTruthy);
    const nonTruthy = fam.members.filter((h) => !stats(h).allTruthy);
    if (truthy.length === 0) continue;
    // Any non-checkbox sibling must be an "other"-style companion (or empty).
    const others = nonTruthy.filter((h) => {
      const suffix = norm(h.slice(fam.prefix.length + 1));
      return OTHER_SUFFIX_RE.test(suffix) || stats(h).nonBlank === 0;
    });
    if (others.length !== nonTruthy.length) continue;
    const otherColumn = others.find((h) => OTHER_SUFFIX_RE.test(norm(h.slice(fam.prefix.length + 1)))) ?? null;
    const options: AnSurveyOption[] = truthy.map((h) => {
      const label = cleanCell(h.slice(fam.prefix.length + 1));
      return { key: optionKey(label), label };
    });
    if (otherColumn) options.push({ key: "__other__", label: "Other (specified)" });
    push({
      label: cleanCell(fam.prefix),
      qtype: "multi_select",
      source_columns: truthy,
      other_column: otherColumn,
      options,
      include_in_report: true,
    });
    for (const h of fam.members) consumed.add(h);
  }

  for (const h of headers) {
    if (consumed.has(h)) continue;
    const s = stats(h);
    const label = cleanCell(h);
    const mapped = autoMapParticipationHeader(h);
    const nh = norm(h);

    // 1. identity / meta by name.
    if (mapped !== "ignore") {
      push({ label, qtype: "identity", source_columns: [h], other_column: null, options: [], include_in_report: false });
      continue;
    }
    if (META_HEADERS.has(nh) || /^timestamp/i.test(h)) {
      const breakdown = BREAKDOWN_META.has(nh) && s.distinct.size >= 2 && s.distinct.size <= 40;
      push({
        label,
        qtype: "meta",
        source_columns: [h],
        other_column: null,
        options: breakdown ? optionsByFrequency(s) : [],
        include_in_report: false,
      });
      continue;
    }

    // 2. empty column.
    if (s.nonBlank === 0) {
      push({ label, qtype: "meta", source_columns: [h], other_column: null, options: [], include_in_report: false });
      continue;
    }

    // 4. small integer range → scale.
    if (s.allNumeric && s.distinct.size >= 2 && s.numericMax - s.numericMin <= 10 && s.numericMin >= -10) {
      push({ label, qtype: "scale", source_columns: [h], other_column: null, options: optionsNumeric(s), include_in_report: true });
      continue;
    }

    // 5. few distinct values → single_choice.
    const distinct = s.distinct.size;
    const singleChoice =
      s.nonBlank >= minRows
        ? distinct <= 12 && distinct <= Math.max(2, Math.ceil(s.nonBlank * 0.5))
        : distinct <= 3;
    const longValues = Array.from(s.distinct.values()).some((v) => v.label.length > 120);
    if (singleChoice && !longValues) {
      push({ label, qtype: "single_choice", source_columns: [h], other_column: null, options: optionsByFrequency(s), include_in_report: true });
      continue;
    }

    // 6. free text.
    push({ label, qtype: "free_text", source_columns: [h], other_column: null, options: [], include_in_report: true });
  }

  return out;
}

/**
 * Merge freshly detected questions into the stored set after a re-upload.
 * Stored rows win (especially user-edited ones); brand-new columns are
 * appended; stored questions whose columns vanished are flagged via
 * `missing` so the caller can set missing_since.
 */
export function mergeDetectedSchema<
  T extends DetectedQuestion & { user_edited?: boolean; missing_since?: string | null },
>(
  stored: T[],
  detected: DetectedQuestion[],
  headers: string[]
): { keep: T[]; add: DetectedQuestion[]; missing: T[]; returned: T[] } {
  const headerSet = new Set(headers);
  const coveredColumns = new Set<string>();
  const keep: T[] = [];
  const missing: T[] = [];
  const returned: T[] = [];
  for (const q of stored) {
    const present = q.source_columns.some((c) => headerSet.has(c));
    if (present) {
      keep.push(q);
      if (q.missing_since) returned.push(q);
      for (const c of q.source_columns) coveredColumns.add(c);
      if (q.other_column) coveredColumns.add(q.other_column);
    } else {
      missing.push(q);
    }
  }
  const taken = new Set(stored.map((q) => q.qkey));
  const add: DetectedQuestion[] = [];
  let sort = stored.reduce((m, q) => Math.max(m, q.sort), -1) + 1;
  for (const q of detected) {
    if (q.source_columns.every((c) => coveredColumns.has(c))) continue;
    add.push({ ...q, qkey: uniqueSlug(q.qkey, taken), sort: sort++ });
  }
  return { keep, add, missing, returned };
}

export function isReportableType(qtype: AnSurveyQuestionType): boolean {
  return qtype !== "identity";
}
