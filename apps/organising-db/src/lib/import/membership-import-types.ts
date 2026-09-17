/**
 * Membership-system import types shared by the parse route, the apply route
 * and the wizard. Lives outside the route files because Next.js only allows
 * handler exports there.
 */

/**
 * `status_sync` is the full-member-list refresh: every current member with
 * their account status. It updates membership status (and contact details)
 * on matched workers and creates the rest; employer / worksite / job title
 * follow the campaign-protection rule in the apply route.
 */
export type MembershipImportType = "new_joins" | "resignations" | "recommencing" | "status_sync";

export const MEMBERSHIP_IMPORT_TYPES: readonly MembershipImportType[] = [
  "new_joins",
  "resignations",
  "recommencing",
  "status_sync",
];

export const MEMBERSHIP_IMPORT_TYPE_LABELS: Record<MembershipImportType, string> = {
  new_joins: "New Joins",
  resignations: "Resignations",
  recommencing: "Recommencing Members",
  status_sync: "Full Member List (status sync)",
};

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
};

export function isMembershipImportType(value: string | null): value is MembershipImportType {
  return value != null && (MEMBERSHIP_IMPORT_TYPES as readonly string[]).includes(value);
}
