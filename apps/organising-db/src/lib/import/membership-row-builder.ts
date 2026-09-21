/**
 * Turn a header-keyed spreadsheet row into a `ParsedMembershipRow` for a
 * given membership import type. Server-side (shares the xlsx-backed cell
 * helpers). Used by the membership import parse route and by the weekly
 * update files, whose four layouts map onto the existing types.
 */

import type { Cell } from "@/lib/import/spreadsheet-rows";
import { normalisePhone, parseDate, str } from "@/lib/import/spreadsheet-rows";
import type { MembershipImportType, ParsedMembershipRow } from "@/lib/import/membership-import-types";
import {
  MEMBERSHIP_UPDATE_KINDS,
  MEMBERSHIP_UPDATE_KIND_LABELS,
  MEMBERSHIP_UPDATE_STATUS_LABELS,
  type MembershipUpdateKind,
} from "@/lib/membership-updates/kinds";

function pick(raw: Record<string, Cell>, ...keys: string[]): Cell {
  for (const key of keys) {
    const v = raw[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

/**
 * The membership system writes "Employer : Employer: Site" in some exports
 * (the parent repeated before the site-qualified name). Collapse the
 * repeated prefix so employer matching sees one name.
 */
export function normaliseEmployerRaw(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+:\s+/);
  if (parts.length === 2 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())) {
    return parts[1].trim();
  }
  return trimmed;
}

function kindFromSourceLabel(label: string): MembershipUpdateKind | null {
  const lc = label.trim().toLowerCase();
  for (const kind of MEMBERSHIP_UPDATE_KINDS) {
    if (
      lc === kind ||
      lc === MEMBERSHIP_UPDATE_KIND_LABELS[kind].toLowerCase() ||
      lc === MEMBERSHIP_UPDATE_STATUS_LABELS[kind].toLowerCase()
    ) {
      return kind;
    }
  }
  return null;
}

export function buildMembershipRow(
  rowIndex: number,
  raw: Record<string, Cell>,
  importType: MembershipImportType
): ParsedMembershipRow {
  const warnings: string[] = [];
  const firstName = str(pick(raw, "first name", "firstname"));
  const lastName = str(pick(raw, "last name", "lastname"));
  if (!firstName) warnings.push("Missing first name");
  if (!lastName) warnings.push("Missing last name");

  const refId = str(pick(raw, "reference id", "referenceid")) || null;

  let employerRaw: string | null;
  if (importType === "resignations") {
    employerRaw = str(pick(raw, "company name", "companyname")) || null;
  } else if (importType === "status_sync" || importType === "weekly_update") {
    employerRaw = str(pick(raw, "company name", "companyname", "employer")) || null;
  } else {
    employerRaw = str(pick(raw, "employer")) || null;
  }
  employerRaw = normaliseEmployerRaw(employerRaw);

  const worksiteRaw = str(pick(raw, "employee worksite", "employeeworksite", "worksite")) || null;
  const jobTitleRaw =
    importType !== "resignations" ? str(pick(raw, "job title", "jobtitle")) || null : null;

  const emailRaw = str(pick(raw, "email", "email address")) || null;
  const phoneRaw = pick(raw, "phone", "mobile", "mobile number");

  // Optional typed dimensions; several likely header names so imports from
  // different operators land on the same worker FKs.
  const shiftRaw = str(pick(raw, "shift", "shift name", "shift pattern")) || null;
  const workAreaRaw = str(pick(raw, "work area", "workarea", "area", "department")) || null;
  const rosterPanelRaw =
    str(pick(raw, "roster panel", "rosterpanel", "panel", "roster", "crew")) || null;

  let joinDate: string | null = null;
  let rejoinDate: string | null = null;
  let resignationDate: string | null = null;
  let resignationReason: string | null = null;
  let membershipTypeRaw: string | null = null;
  let sourceKind: MembershipUpdateKind | null = null;

  if (importType === "new_joins") {
    joinDate = parseDate(pick(raw, "member joining date", "memberjoindate", "joining date"));
    rejoinDate = parseDate(pick(raw, "re joined date", "rejoineddate", "re-joined date"));
  } else if (importType === "resignations") {
    joinDate = parseDate(pick(raw, "joining date", "joiningdate"));
    resignationDate = parseDate(pick(raw, "resignation date", "resignationdate"));
    resignationReason = str(pick(raw, "resignation reason", "resignationreason")) || null;
    if (!resignationDate) warnings.push("Missing resignation date");
  } else if (importType === "recommencing") {
    rejoinDate = parseDate(pick(raw, "date"));
    membershipTypeRaw = str(pick(raw, "membership type", "membershiptype")) || null;
    if (!rejoinDate) warnings.push("Missing re-commence date");
  } else if (importType === "status_sync") {
    membershipTypeRaw =
      str(
        pick(
          raw,
          "member account status",
          "memberaccountstatus",
          "account status",
          "membership status",
          "status"
        )
      ) || null;
    if (!membershipTypeRaw) warnings.push("Missing member account status");
    if (!refId) warnings.push("Missing reference ID — will match on email / phone only");
  } else if (importType === "weekly_update") {
    // The combined workbook the app produces from the four weekly files.
    const source = str(pick(raw, "source file", "source"));
    sourceKind = kindFromSourceLabel(source);
    if (!sourceKind) warnings.push(`Unknown source file "${source}"`);
    membershipTypeRaw =
      str(pick(raw, "member status")) ||
      (sourceKind ? MEMBERSHIP_UPDATE_STATUS_LABELS[sourceKind] : null);
    joinDate = parseDate(pick(raw, "member joining date", "joining date"));
    rejoinDate = parseDate(pick(raw, "re joined date", "date"));
    resignationDate = parseDate(pick(raw, "resignation date"));
    resignationReason = str(pick(raw, "resignation reason")) || null;
    if (!refId) warnings.push("Missing reference ID — will match on email / phone only");
  }

  return {
    rowIndex,
    referenceId: refId,
    firstName,
    lastName,
    employerRaw,
    worksiteRaw,
    jobTitleRaw,
    email: emailRaw,
    phone: normalisePhone(phoneRaw),
    joinDate,
    rejoinDate,
    resignationDate,
    resignationReason,
    membershipTypeRaw,
    shiftRaw,
    workAreaRaw,
    rosterPanelRaw,
    warnings,
    ...(importType === "weekly_update" ? { sourceKind } : {}),
  };
}
