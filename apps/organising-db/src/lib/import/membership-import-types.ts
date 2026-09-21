/**
 * Membership-system import types shared by the parse route, the apply route
 * and the wizard. Lives outside the route files because Next.js only allows
 * handler exports there.
 */

import type { MembershipUpdateKind } from "@/lib/membership-updates/kinds";

/**
 * `status_sync` is the full-member-list refresh: every current member with
 * their account status. It updates membership status (and contact details)
 * on matched workers and creates the rest; employer / worksite / job title
 * follow the campaign-protection rule in the apply route.
 *
 * `weekly_update` is the four emailed weekly files (new / recommenced /
 * resigned / unfinancial) combined into one row set; each row carries the
 * file it came from in `sourceKind`, and the apply route applies that
 * file's rules to the row.
 */
export type MembershipImportType =
  | "new_joins"
  | "resignations"
  | "recommencing"
  | "status_sync"
  | "weekly_update";

export const MEMBERSHIP_IMPORT_TYPES: readonly MembershipImportType[] = [
  "new_joins",
  "resignations",
  "recommencing",
  "status_sync",
  "weekly_update",
];

export const MEMBERSHIP_IMPORT_TYPE_LABELS: Record<MembershipImportType, string> = {
  new_joins: "New Joins",
  resignations: "Resignations",
  recommencing: "Recommencing Members",
  status_sync: "Full Member List (status sync)",
  weekly_update: "Weekly Update (four files)",
};

export interface ParsedMembershipRow {
  rowIndex: number;
  referenceId: string | null;
  firstName: string;
  lastName: string;
  /** Raw employer / company name from file */
  employerRaw: string | null;
  /** Raw worksite name from file */
  worksiteRaw: string | null;
  /** Raw job title from file (new_joins / recommencing only) */
  jobTitleRaw: string | null;
  email: string | null;
  phone: string | null;
  /** member joining date / joining date (ISO date string or null) */
  joinDate: string | null;
  /** Re Joined Date / Date (recommencing) (ISO date string or null) */
  rejoinDate: string | null;
  /** Resignation date (resignations only) */
  resignationDate: string | null;
  /** Resignation reason (resignations only) */
  resignationReason: string | null;
  /** Raw membership type / account status text (recommencing, status_sync, weekly_update) */
  membershipTypeRaw: string | null;
  /** Raw shift label from file (any import type), if a matching column was found */
  shiftRaw: string | null;
  /** Raw work area label from file (any import type), if a matching column was found */
  workAreaRaw: string | null;
  /** Raw roster panel label from file (any import type), if a matching column was found */
  rosterPanelRaw: string | null;
  /** Any parse warnings */
  warnings: string[];
  /** weekly_update only: which of the four weekly files the row came from. */
  sourceKind?: MembershipUpdateKind | null;
}

/** Column order of the combined weekly-update workbook (and its headers). */
export const WEEKLY_UPDATE_COMBINED_HEADERS = [
  "Source File",
  "Member Status",
  "Reference ID",
  "First Name",
  "Last Name",
  "Employer",
  "Employee Worksite",
  "Job Title",
  "Email",
  "Phone",
  "Member Joining Date",
  "Re Joined Date",
  "Resignation Date",
  "Resignation Reason",
  "Date",
] as const;

/** Expected column headers for each import type (lowercase, trimmed, for matching) */
export const MEMBERSHIP_IMPORT_EXPECTED_HEADERS: Record<MembershipImportType, string[]> = {
  new_joins: [
    "reference id",
    "first name",
    "last name",
    "employer",
    "employee worksite",
    "job title",
    "email",
    "phone",
    "member joining date",
    "re joined date",
  ],
  resignations: [
    "reference id",
    "first name",
    "last name",
    "company name",
    "employee worksite",
    "joining date",
    "resignation date",
    "resignation reason",
    "email",
    "phone",
  ],
  recommencing: [
    "reference id",
    "first name",
    "last name",
    "employer",
    "employee worksite",
    "job title",
    "membership type",
    "phone",
    "email",
    "date",
  ],
  status_sync: [
    "reference id",
    "first name",
    "last name",
    "member account status",
    "company name",
    "employee worksite",
    "job title",
    "phone",
    "email",
  ],
  weekly_update: WEEKLY_UPDATE_COMBINED_HEADERS.map((h) => h.toLowerCase()),
};

export function isMembershipImportType(value: string | null): value is MembershipImportType {
  return value != null && (MEMBERSHIP_IMPORT_TYPES as readonly string[]).includes(value);
}
