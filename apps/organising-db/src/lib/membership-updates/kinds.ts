/**
 * Weekly membership update files — the four spreadsheets the membership
 * system emails every week, usually named "OA - <Kind> Members - w-e
 * DD-MM-YYYY.xlsx" but not reliably (see classify.ts for how a file is
 * recognised). Pure helpers shared by the webhook, the API routes and the
 * wizard; no spreadsheet parsing here (see parse-files.ts).
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
