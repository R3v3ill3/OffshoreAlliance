/**
 * Server-side parsing of the four weekly membership files into the
 * membership import's row shape, and the combined workbook that presents
 * them as one upload. Each file's layout matches an existing membership
 * import type, so the row builder is reused and only the status label and
 * a couple of per-file adjustments are applied here.
 */

import * as XLSX from "xlsx";
import { readFirstSheet } from "@/lib/import/spreadsheet-rows";
import { buildMembershipRow } from "@/lib/import/membership-row-builder";
import {
  WEEKLY_UPDATE_COMBINED_HEADERS,
  type MembershipImportType,
  type ParsedMembershipRow,
} from "@/lib/import/membership-import-types";
import {
  MEMBERSHIP_UPDATE_KINDS,
  MEMBERSHIP_UPDATE_KIND_LABELS,
  MEMBERSHIP_UPDATE_STATUS_LABELS,
  type MembershipUpdateKind,
} from "./kinds";

/** Which existing import layout each weekly file uses. */
const LAYOUT_FOR_KIND: Record<MembershipUpdateKind, MembershipImportType> = {
  new: "new_joins",
  recommenced: "recommencing",
  resigned: "resignations",
  // Same columns as the recommenced file (Employer, Worksite, Member Account
  // Status, Membership Type, Phone, Email, Job Title, Date).
  unfinancial: "recommencing",
};

export interface WeeklyUpdateRow extends ParsedMembershipRow {
  sourceKind: MembershipUpdateKind;
}

/**
 * Parse one weekly file. `rowIndexOffset` keeps row indices unique when the
 * four files are concatenated.
 */
export function parseWeeklyUpdateWorkbook(
  kind: MembershipUpdateKind,
  buffer: Buffer,
  rowIndexOffset = 0
): { rows: WeeklyUpdateRow[]; headers: string[] } {
  const sheet = readFirstSheet(buffer);
  if (!sheet) return { rows: [], headers: [] };
  const layout = LAYOUT_FOR_KIND[kind];
  const rows: WeeklyUpdateRow[] = [];
  for (const raw of sheet.rows) {
    const base = buildMembershipRow(rowIndexOffset + rows.length, raw, layout);
    if (!base.firstName && !base.lastName) continue;
    const row: WeeklyUpdateRow = {
      ...base,
      sourceKind: kind,
      // Status comes from which file the row is in, not from a column.
      membershipTypeRaw: MEMBERSHIP_UPDATE_STATUS_LABELS[kind],
    };
    if (kind === "unfinancial") {
      // The unfinancial file's Date is when payment stopped, not a rejoin.
      row.rejoinDate = null;
      row.warnings = row.warnings.filter((w) => !/re-commence date/i.test(w));
    }
    rows.push(row);
  }
  return { rows, headers: sheet.headers };
}

export interface WeeklyUpdateFileInput {
  kind: MembershipUpdateKind;
  buffer: Buffer;
}

/** Parse all available files in canonical order; rows get unique indices. */
export function parseWeeklyUpdateFiles(
  files: WeeklyUpdateFileInput[]
): { rows: WeeklyUpdateRow[]; countsByKind: Record<MembershipUpdateKind, number> } {
  const byKind = new Map(files.map((f) => [f.kind, f.buffer]));
  const rows: WeeklyUpdateRow[] = [];
  const countsByKind = { new: 0, recommenced: 0, resigned: 0, unfinancial: 0 };
  for (const kind of MEMBERSHIP_UPDATE_KINDS) {
    const buffer = byKind.get(kind);
    if (!buffer) continue;
    const parsed = parseWeeklyUpdateWorkbook(kind, buffer, rows.length);
    countsByKind[kind] = parsed.rows.length;
    rows.push(...parsed.rows);
  }
  return { rows, countsByKind };
}

/** Row count of a weekly file — what the notification summary reports. */
export function countWeeklyUpdateRows(kind: MembershipUpdateKind, buffer: Buffer): number {
  return parseWeeklyUpdateWorkbook(kind, buffer).rows.length;
}

/**
 * The single upload file: every row from the four files with a "Member
 * Status" column derived from the file title. Round-trips through the
 * membership import parse route as type `weekly_update`.
 */
export function buildCombinedWorkbook(rows: WeeklyUpdateRow[]): Buffer {
  const header = [...WEEKLY_UPDATE_COMBINED_HEADERS];
  const data = rows.map((r) => [
    MEMBERSHIP_UPDATE_KIND_LABELS[r.sourceKind],
    r.membershipTypeRaw ?? MEMBERSHIP_UPDATE_STATUS_LABELS[r.sourceKind],
    r.referenceId ?? "",
    r.firstName,
    r.lastName,
    r.employerRaw ?? "",
    r.worksiteRaw ?? "",
    r.jobTitleRaw ?? "",
    r.email ?? "",
    r.phone ?? "",
    r.joinDate ?? "",
    r.rejoinDate ?? "",
    r.resignationDate ?? "",
    r.resignationReason ?? "",
    r.sourceKind === "recommenced" ? r.rejoinDate ?? "" : "",
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Weekly update");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}
