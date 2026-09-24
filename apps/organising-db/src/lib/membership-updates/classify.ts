/**
 * Working out which weekly file a spreadsheet is, and which week it covers,
 * without relying on one exact file name. The admin who sends the files
 * names them differently from week to week ("OA - New Members - w-e
 * 10-09-2026.xlsx", "OA-New-Members -w-e 10-09-2026.xlsx", "OA Joins
 * 409.xlsx"), so every signal is weighed:
 *
 *   Kind  — the column layout first (reliable whatever the file is called),
 *           then a keyword in the file name. Recommenced and unfinancial
 *           share a layout; the "Old Value" column and the Membership Type
 *           values (Financial vs Non-Financial) tell them apart.
 *   Week  — a date in the file name, read day-first, in full ("10-09-2026")
 *           or short ("409", "1009", "10-9"); a missing year is the most
 *           recent one not after the reference (email received / upload)
 *           date. Files sent together share one week. The latest date in
 *           the rows is a cross-check.
 *
 * Anything these signals do not settle is marked needsReview so it waits
 * for an admin instead of being dropped or filed against the wrong week.
 * Pure: no database, no storage.
 */

import { parseDate, readFirstSheet, type SheetRows } from "@/lib/import/spreadsheet-rows";
import {
  MEMBERSHIP_UPDATE_KINDS,
  MEMBERSHIP_UPDATE_KIND_LABELS,
  formatWeekEnding,
  type MembershipUpdateKind,
} from "./kinds";

// ── File name: kind ─────────────────────────────────────────────────────────

/** Lower-case, no directory or extension, separators collapsed to spaces. */
export function normaliseUpdateFilename(filename: string): string {
  return filename
    .trim()
    // Strip any directory prefix, but a "/" between digits is a date separator.
    .replace(/^.*[\\/](?=\D)/, "")
    .replace(/\.(xlsx|xls|xlsm|csv)$/i, "")
    .toLowerCase()
    .replace(/[_\-–—./\\()[\],+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Checked in this order; each match is removed before the next test so
// "re joined" is not also read as "joined" (new).
const KIND_PATTERNS: [MembershipUpdateKind, RegExp][] = [
  ["unfinancial", /\b(?:un ?financials?|non ?financials?|unfin|arrears|lapsed|stopped payments?)\b/g],
  ["recommenced", /\b(?:re ?commence\w*|re ?join\w*|reinstate\w*)\b/g],
  ["resigned", /\b(?:resign\w*|cancel\w*|leavers?|ceased)\b/g],
  ["new", /\b(?:new|joins?|joiners?|joined|joinings?)\b/g],
];

/**
 * The kind a file name points to, or null when it names none, or more than
 * one ("New and Resigned.xlsx").
 */
export function kindFromFilename(filename: string): MembershipUpdateKind | null {
  let text = normaliseUpdateFilename(filename);
  const found = new Set<MembershipUpdateKind>();
  for (const [kind, re] of KIND_PATTERNS) {
    if (text.match(re)) {
      found.add(kind);
      text = text.replace(re, " ");
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

// ── File name: week ending ──────────────────────────────────────────────────

export interface FilenameDate {
  /** ISO date (YYYY-MM-DD). */
  weekEnding: string;
  /** More than one plausible reading (e.g. "111" = 1 Nov or 11 Jan). */
  ambiguous: boolean;
  /** The year was written in the name rather than inferred. */
  explicitYear: boolean;
}

const DAY_MS = 86_400_000;
/** A week-ending date may be up to this far after the reference date. */
const FUTURE_GRACE_DAYS = 7;
/** A short date (no year) is expected within this many days of arrival. */
const AMBIGUOUS_WINDOW_DAYS = 45;

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function isoToMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** The latest date with this day and month not after reference + grace. */
function inferYear(day: number, month: number, reference: Date): string | null {
  const limit = startOfUtcDay(reference) + FUTURE_GRACE_DAYS * DAY_MS;
  const year = reference.getUTCFullYear();
  for (const y of [year + 1, year, year - 1, year - 2]) {
    const iso = isoDate(y, month, day);
    if (iso && isoToMs(iso) <= limit) return iso;
  }
  return null;
}

function expandYear(y: string): number {
  return y.length === 2 ? 2000 + Number(y) : Number(y);
}

/**
 * The week-ending date written in a file name, or null. Dates are day-first
 * (Australian). `reference` is when the file arrived; it supplies the year
 * when the name leaves it out.
 */
export function dateFromFilename(filename: string, reference: Date): FilenameDate | null {
  const text = normaliseUpdateFilename(filename);

  const iso = text.match(/\b(\d{4}) (\d{1,2}) (\d{1,2})\b/);
  if (iso) {
    const value = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (value) return { weekEnding: value, ambiguous: false, explicitYear: true };
  }

  const dmy = text.match(/\b(\d{1,2}) (\d{1,2}) (\d{4}|\d{2})\b/);
  if (dmy) {
    const value = isoDate(expandYear(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    return value ? { weekEnding: value, ambiguous: false, explicitYear: true } : null;
  }

  const compactWithYear = text.match(/\b(\d{2})(\d{2})(\d{4}|\d{2})\b/);
  if (compactWithYear) {
    const value = isoDate(
      expandYear(compactWithYear[3]),
      Number(compactWithYear[2]),
      Number(compactWithYear[1])
    );
    if (value) return { weekEnding: value, ambiguous: false, explicitYear: true };
  }

  // Day and month only: "10 9", "1009", "409", "111".
  const readings: [number, number][] = [];
  const dm = text.match(/\b(\d{1,2}) (\d{1,2})\b/);
  const compact = text.match(/\b(\d{3,4})\b/);
  if (dm) {
    readings.push([Number(dm[1]), Number(dm[2])]);
  } else if (compact) {
    const digits = compact[1];
    if (digits.length === 4) {
      readings.push([Number(digits.slice(0, 2)), Number(digits.slice(2))]);
    } else {
      readings.push([Number(digits.slice(0, 1)), Number(digits.slice(1))]);
      readings.push([Number(digits.slice(0, 2)), Number(digits.slice(2))]);
    }
  }
  const candidates = [
    ...new Set(
      readings
        .map(([d, m]) => inferYear(d, m, reference))
        .filter((v): v is string => v !== null)
    ),
  ];
  if (candidates.length === 0) return null;
  const ref = startOfUtcDay(reference);
  const distance = (iso: string) => Math.abs(isoToMs(iso) - ref);
  candidates.sort((a, b) => distance(a) - distance(b));
  // Two readings are only settled when exactly one lands near the arrival date.
  const window = AMBIGUOUS_WINDOW_DAYS * DAY_MS;
  const ambiguous =
    candidates.length > 1 && !(distance(candidates[0]) <= window && distance(candidates[1]) > window);
  return { weekEnding: candidates[0], ambiguous, explicitYear: false };
}

// ── Content: kind and latest date ───────────────────────────────────────────

function hasHeader(headers: Set<string>, ...names: string[]): boolean {
  return names.some((n) => headers.has(n));
}

/**
 * The kinds a sheet's columns are consistent with: one kind when the layout
 * settles it, both "recommenced" and "unfinancial" when their shared layout
 * gives no tie-break, and none when the sheet is not a weekly file.
 */
export function kindsFromSheet(sheet: SheetRows | null): MembershipUpdateKind[] {
  if (!sheet) return [];
  const headers = new Set(sheet.headers.map((h) => h.trim().toLowerCase()));
  const has = (n: string) => headers.has(n);
  if (!has("first name") || !has("last name")) return [];

  if (hasHeader(headers, "resignation reason", "date processed") && has("resignation date")) {
    return ["resigned"];
  }
  if (has("member joining date")) return ["new"];
  if (has("membership type") && has("date")) {
    if (has("old value")) return ["recommenced"];
    let financial = 0;
    let nonFinancial = 0;
    for (const row of sheet.rows) {
      const value = String(row["membership type"] ?? "")
        .trim()
        .toLowerCase();
      if (/^(non|un)[\s-]?financial/.test(value)) nonFinancial++;
      else if (value === "financial") financial++;
    }
    if (nonFinancial > 0 && financial === 0) return ["unfinancial"];
    if (financial > 0 && nonFinancial === 0) return ["recommenced"];
    return ["recommenced", "unfinancial"];
  }
  return [];
}

/** The date columns that say when each row's change happened. */
const ACTIVITY_DATE_COLUMNS: Record<MembershipUpdateKind, string[]> = {
  new: ["member joining date", "re joined date"],
  recommenced: ["date"],
  resigned: ["date processed"],
  unfinancial: ["date"],
};

export function latestActivityDate(sheet: SheetRows | null, kind: MembershipUpdateKind): string | null {
  if (!sheet) return null;
  let latest: string | null = null;
  for (const row of sheet.rows) {
    for (const column of ACTIVITY_DATE_COLUMNS[kind]) {
      const value = parseDate(row[column]);
      if (value && (!latest || value > latest)) latest = value;
    }
  }
  return latest;
}

function rowCountOf(sheet: SheetRows | null): number {
  if (!sheet) return 0;
  return sheet.rows.filter((r) => String(r["first name"] ?? r["last name"] ?? "").trim()).length;
}

// ── Classification ──────────────────────────────────────────────────────────

/** Rows dated this long after the week ending suggest the wrong week. */
const ROWS_AFTER_WEEK_DAYS = 2;
/** The newest row this long before the week ending suggests the wrong week. */
const ROWS_BEFORE_WEEK_DAYS = 14;

export interface WeeklyFileSignals {
  filenameKind: MembershipUpdateKind | null;
  contentKinds: MembershipUpdateKind[];
  filenameDate: FilenameDate | null;
  latestRowDate: string | null;
  rowCount: number;
}

export interface WeeklyFileClassification {
  filename: string;
  /** False when nothing suggests this is a weekly membership file at all. */
  isWeeklyFile: boolean;
  /** Best guess, also when needsReview. */
  kind: MembershipUpdateKind | null;
  /** Best guess (ISO), also when needsReview. */
  weekEnding: string | null;
  /** Hold for an admin: the signals disagree or are missing. */
  needsReview: boolean;
  /** Why it needs review. */
  issues: string[];
  /** How the kind and week were worked out, kept with the filed record. */
  notes: string[];
  signals: WeeklyFileSignals;
}

const label = (kind: MembershipUpdateKind) => MEMBERSHIP_UPDATE_KIND_LABELS[kind];

export function classifyWeeklySheet(
  filename: string,
  sheet: SheetRows | null,
  reference: Date
): WeeklyFileClassification {
  const signals: WeeklyFileSignals = {
    filenameKind: kindFromFilename(filename),
    contentKinds: kindsFromSheet(sheet),
    filenameDate: dateFromFilename(filename, reference),
    latestRowDate: null,
    rowCount: rowCountOf(sheet),
  };
  const issues: string[] = [];
  const notes: string[] = [];
  const { filenameKind, contentKinds, filenameDate } = signals;

  // A file name alone only counts when it names both a kind and a date, so
  // an unrelated spreadsheet ("New worksite list.xlsx") is left alone.
  const isWeeklyFile = contentKinds.length > 0 || (filenameKind !== null && filenameDate !== null);

  let kind: MembershipUpdateKind | null = null;
  if (contentKinds.length === 1) {
    kind = contentKinds[0];
    if (filenameKind && filenameKind !== kind) {
      issues.push(
        `Named as ${label(filenameKind)} but the columns are the ${label(kind)} layout`
      );
    } else {
      notes.push(`${label(kind)}: from the columns`);
    }
  } else if (contentKinds.length > 1) {
    if (filenameKind && contentKinds.includes(filenameKind)) {
      kind = filenameKind;
      notes.push(`${label(kind)}: from the file name (columns fit ${contentKinds.map(label).join(" or ")})`);
    } else {
      kind = contentKinds[0];
      issues.push(
        `Columns fit ${contentKinds.map(label).join(" or ")}; the file name does not say which`
      );
    }
  } else if (isWeeklyFile) {
    kind = filenameKind;
    issues.push("Columns do not match any of the four weekly layouts");
  }

  let weekEnding: string | null = null;
  if (filenameDate) {
    weekEnding = filenameDate.weekEnding;
    const daysFromArrival = Math.abs(isoToMs(weekEnding) - startOfUtcDay(reference)) / DAY_MS;
    if (filenameDate.ambiguous) {
      issues.push(`The date in the file name could be read more than one way (read as ${formatWeekEnding(weekEnding)})`);
    } else if (!filenameDate.explicitYear && daysFromArrival > AMBIGUOUS_WINDOW_DAYS) {
      issues.push(
        `The file name has no year and ${formatWeekEnding(weekEnding)} is a long way from when it arrived`
      );
    } else {
      notes.push(
        `Week ending ${formatWeekEnding(weekEnding)}: from the file name${filenameDate.explicitYear ? "" : ", year inferred"}`
      );
    }
  } else if (isWeeklyFile) {
    issues.push("No week-ending date in the file name");
  }

  const result: WeeklyFileClassification = {
    filename,
    isWeeklyFile,
    kind,
    weekEnding,
    needsReview: false,
    issues,
    notes,
    signals,
  };
  if (kind) signals.latestRowDate = latestActivityDate(sheet, kind);
  applyRowDateCheck(result);
  result.needsReview = isWeeklyFile && (!result.kind || !result.weekEnding || result.issues.length > 0);
  return result;
}

const ROW_DATE_ISSUE = "Row dates";

function applyRowDateCheck(c: WeeklyFileClassification): void {
  c.issues = c.issues.filter((i) => !i.startsWith(ROW_DATE_ISSUE));
  const latest = c.signals.latestRowDate;
  if (!latest || !c.weekEnding) return;
  const diffDays = (isoToMs(latest) - isoToMs(c.weekEnding)) / DAY_MS;
  if (diffDays > ROWS_AFTER_WEEK_DAYS) {
    c.issues.push(
      `${ROW_DATE_ISSUE} run to ${formatWeekEnding(latest)}, after the week ending ${formatWeekEnding(c.weekEnding)}`
    );
  } else if (diffDays < -ROWS_BEFORE_WEEK_DAYS) {
    c.issues.push(
      `${ROW_DATE_ISSUE} end ${formatWeekEnding(latest)}, well before the week ending ${formatWeekEnding(c.weekEnding)}`
    );
  }
}

/** Read the workbook and classify it. A file that cannot be read is not a weekly file. */
export function classifyWeeklyFile(
  filename: string,
  buffer: Buffer,
  reference: Date
): WeeklyFileClassification {
  let sheet: SheetRows | null = null;
  try {
    sheet = readFirstSheet(buffer);
  } catch {
    sheet = null;
  }
  return classifyWeeklySheet(filename, sheet, reference);
}

/**
 * Files that arrive together (one email, one upload) are one week's set:
 * they share a week-ending date, and no two are the same kind. A file with
 * no usable date takes the others' week; a file whose date disagrees, or
 * that duplicates another file's kind, is held for review.
 */
export function resolveWeeklyFileGroup(
  items: WeeklyFileClassification[]
): WeeklyFileClassification[] {
  const weekly = items.filter((c) => c.isWeeklyFile);
  const counts = new Map<string, number>();
  for (const c of weekly) {
    const d = c.signals.filenameDate;
    if (d && !d.ambiguous) counts.set(d.weekEnding, (counts.get(d.weekEnding) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const groupWeek =
    ranked.length === 1 || (ranked.length > 1 && ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;

  const kindCounts = new Map<MembershipUpdateKind, number>();
  for (const c of weekly) if (c.kind) kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);

  return items.map((original) => {
    if (!original.isWeeklyFile) return original;
    const c: WeeklyFileClassification = {
      ...original,
      issues: [...original.issues],
      notes: [...original.notes],
    };
    const own = c.signals.filenameDate;
    if (groupWeek) {
      if (!own || own.ambiguous) {
        c.issues = c.issues.filter(
          (i) =>
            !i.startsWith("No week-ending date") &&
            !i.startsWith("The date in the file name") &&
            !i.startsWith("The file name has no year")
        );
        c.weekEnding = groupWeek;
        c.notes.push(`Week ending ${formatWeekEnding(groupWeek)}: from the other files sent with it`);
      } else if (own.weekEnding !== groupWeek) {
        c.issues.push(
          `Named for week ending ${formatWeekEnding(own.weekEnding)} but the files sent with it are ${formatWeekEnding(groupWeek)}`
        );
      }
    }
    if (c.kind && (kindCounts.get(c.kind) ?? 0) > 1) {
      c.issues.push(`More than one ${label(c.kind)} file was sent together`);
    }
    applyRowDateCheck(c);
    c.needsReview = !c.kind || !c.weekEnding || c.issues.length > 0;
    return c;
  });
}

export function isMembershipUpdateKind(value: unknown): value is MembershipUpdateKind {
  return typeof value === "string" && (MEMBERSHIP_UPDATE_KINDS as readonly string[]).includes(value);
}
