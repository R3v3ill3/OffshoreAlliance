/**
 * Weekly membership update files — the four spreadsheets the membership
 * system emails every week, named "OA - <Kind> Members - w-e DD-MM-YYYY.xlsx".
 * Pure helpers shared by the webhook, the API routes and the wizard; no
 * spreadsheet parsing here (see parse-files.ts).
 */

export const MEMBERSHIP_UPDATE_KINDS = ["new", "recommenced", "resigned", "unfinancial"] as const;
export type MembershipUpdateKind = (typeof MEMBERSHIP_UPDATE_KINDS)[number];

export const MEMBERSHIP_UPDATE_KIND_LABELS: Record<MembershipUpdateKind, string> = {
  new: "New Members",
  recommenced: "Recommenced Members",
  resigned: "Resigned Members",
  unfinancial: "Unfinancial Members",
};

/**
 * The value written to the combined file's "Member Status" column and used
 * as the raw membership status in the wizard's Map Values step — derived
 * from the file the row came from, not from a column in it.
 */
export const MEMBERSHIP_UPDATE_STATUS_LABELS: Record<MembershipUpdateKind, string> = {
  new: "New member",
  recommenced: "Recommenced member",
  resigned: "Resigned member",
  unfinancial: "Unfinancial member",
};

/**
 * Suggested union_membership_types.type_name for each file. Unfinancial
 * members are still members (payment stopped or suspended), so they map to
 * the on-hold type rather than resigned; admins can override in Map Values.
 */
export const MEMBERSHIP_UPDATE_DEFAULT_TYPE_KEY: Record<MembershipUpdateKind, string> = {
  new: "financial_member",
  recommenced: "financial_member",
  resigned: "resigned_member",
  unfinancial: "on_hold",
};

/**
 * Dedup default for a row with no matching worker. New members are created;
 * the other three files describe changes to people who should already be
 * on file, so an unmatched row is skipped and flagged for review.
 */
export function defaultActionForUnmatched(kind: MembershipUpdateKind): "create" | "skip" {
  return kind === "new" ? "create" : "skip";
}

const KIND_BY_WORD: Record<string, MembershipUpdateKind> = {
  new: "new",
  recommenced: "recommenced",
  recommencing: "recommenced",
  recommencement: "recommenced",
  recommencements: "recommenced",
  resigned: "resigned",
  resignations: "resigned",
  resignation: "resigned",
  unfinancial: "unfinancial",
  unfinancials: "unfinancial",
  "non-financial": "unfinancial",
  nonfinancial: "unfinancial",
};

const FILENAME_RE =
  /^(?:oa\s*[-–—]\s*)?([a-z-]+)\s+members?\s*[-–—]\s*w[-\s]?e\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*\.xlsx?$/i;

export interface ParsedMembershipUpdateFilename {
  kind: MembershipUpdateKind;
  /** ISO date (YYYY-MM-DD) of the week ending in the file name. */
  weekEnding: string;
}

/**
 * "OA - Resigned Members - w-e 10-09-2026.xlsx" → { kind: "resigned",
 * weekEnding: "2026-09-10" }. Dates are day-first, as the membership system
 * writes them. Returns null for anything that is not one of the four files.
 */
export function parseMembershipUpdateFilename(
  filename: string
): ParsedMembershipUpdateFilename | null {
  // Strip any directory prefix, but a "/" between digits is a date separator.
  const base = filename
    .trim()
    .replace(/^.*[\\/](?=\D)/, "")
    .replace(/_/g, " ");
  const match = base.match(FILENAME_RE);
  if (!match) return null;
  const [, word, dd, mm, yyyy] = match;
  const kind = KIND_BY_WORD[word.toLowerCase()];
  if (!kind) return null;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { kind, weekEnding: date.toISOString().slice(0, 10) };
}

export interface MembershipMovementCounts {
  new: number;
  recommenced: number;
  resigned: number;
  unfinancial: number;
}

/** (new + recommenced) - (resigned + unfinancial) */
export function computeNetMovement(counts: MembershipMovementCounts): number {
  return counts.new + counts.recommenced - (counts.resigned + counts.unfinancial);
}

export function formatWeekEnding(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/** Storage object path for a received file. */
export function membershipUpdateStoragePath(weekEnding: string, kind: MembershipUpdateKind): string {
  return `${weekEnding}/${kind}.xlsx`;
}

export function membershipUpdateCombinedStoragePath(weekEnding: string): string {
  return `${weekEnding}/combined.xlsx`;
}
