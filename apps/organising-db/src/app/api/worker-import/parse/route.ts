import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  parseMembershipStatus,
  type UnionMembershipTypeKey,
} from "@/lib/workers/worker-import-membership";
import { toLocal } from "@/lib/phone/normalise-phone";

export type { UnionMembershipTypeKey };

export interface ParsedWorkerRow {
  rowIndex: number;
  /** External reference / member number from source system. Always null in group format. */
  referenceId: string | null;
  rawName: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  rawMembershipStatus: string;
  unionMembershipTypeKey: UnionMembershipTypeKey | null;
  unionId: number | null;
  resignationDate: string | null;
  rawPhone: string;
  phone: string | null;
  email: string | null;
  parseWarnings: string[];
  /** Mapped to non_oa_union_options.badge_initials when unionMembershipTypeKey is non_oa_member */
  nonOaUnionBadgeInitials: string | null;
}

export interface ParsedWorkerGroup {
  groupName: string;
  rows: ParsedWorkerRow[];
}

export type ParseWorkerImportResponse =
  | {
      success: true;
      fileName: string;
      format: "group";
      groups: ParsedWorkerGroup[];
      totalRows: number;
    }
  | {
      success: true;
      fileName: string;
      format: "header";
      headers: string[];
      rows: Record<string, string>[];
      totalRows: number;
    };

// Header patterns used to detect header-based format.
// Deliberately broad — detection no longer requires ALL cells to be text,
// so false positives from data rows are very unlikely.
const KNOWN_HEADER_PATTERNS = [
  /^(first[\s_-]?name|firstname|given[\s_-]?name|givenname|forename|first)$/i,
  /^(last[\s_-]?name|lastname|surname|family[\s_-]?name|familyname|last)$/i,
  /^(email|email[\s_-]?address|emailaddress)$/i,
  /^(mobile|phone|mobile[\s_-]?no|mobile[\s_-]?number|phone[\s_-]?number|phone[\s_-]?no|contact[\s_-]?number|contact[\s_-]?no|mob|contact)$/i,
  /^(employer|employer[\s_-]?name|company|company[\s_-]?name|contractor|contractor[\s_-]?name|business|organisation|organization)$/i,
  /^(worksite|site|location|work[\s_-]?site|work[\s_-]?location)$/i,
  /^(name|full[\s_-]?name|fullname|worker[\s_-]?name|employee[\s_-]?name)$/i,
  /^(preferred[\s_-]?name|preferredname|nickname|nick[\s_-]?name|known[\s_-]?as|alias|preferred[\s_-]?first[\s_-]?name)$/i,
  /^(membership|membership[\s_-]?status|status|role|role[\s_-]?type)$/i,
  /^(other[\s_-]?union|union[\s_-]?badge|non[\s_-]?oa[\s_-]?union)$/i,
];

function cellToString(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function detectHeaderRow(
  row: (string | number | Date | null | undefined)[],
  forceHeader = false
): boolean {
  if (forceHeader) return true;

  const nonEmpty = row.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ""
  );
  if (nonEmpty.length < 2) return false;

  // Count cells that match a known header pattern (only check string cells).
  // We intentionally do NOT require all cells to be text — numeric columns
  // like "Employee ID" or date columns must not disqualify the row.
  const matchCount = nonEmpty.filter((c) => {
    if (typeof c === "number") return false;
    return KNOWN_HEADER_PATTERNS.some((p) => p.test(String(c).trim()));
  }).length;

  // 2+ recognisable header names → it's a header row.
  if (matchCount >= 2) return true;

  // Single match but all other cells are text → likely a header row too.
  if (matchCount === 1) {
    const nonNumeric = nonEmpty.filter((c) => {
      if (typeof c === "number") return false;
      const s = String(c).trim();
      return s !== "" && isNaN(Number(s));
    });
    return nonNumeric.length === nonEmpty.length;
  }

  return false;
}

function parseName(raw: string): {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  warnings: string[];
} {
  const trimmed = raw.trim();
  const warnings: string[] = [];

  // Capture parenthetical nickname/preferred name before stripping it,
  // e.g. "Alfred (Alfie) Smith" → preferredName = "Alfie"
  const nicknameMatch = trimmed.match(/\(([^)]+)\)/);
  const preferredName = nicknameMatch ? nicknameMatch[1].trim() : null;

  // Strip the parenthetical so it doesn't become the last name token
  const cleaned = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  // "LASTNAME, Firstname [Middlename]" format
  if (cleaned.includes(",")) {
    const [lastPart, firstPart] = cleaned.split(",", 2);
    const firstName = (firstPart ?? "").trim();
    const lastName = lastPart.trim();
    if (!firstName) warnings.push("Could not parse first name");
    if (!lastName) warnings.push("Could not parse last name");
    return { firstName, lastName, preferredName, warnings };
  }

  // "Firstname Lastname" format — split on last space
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) {
    warnings.push("Only one name token found");
    return { firstName: cleaned, lastName: "", preferredName, warnings };
  }
  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts[parts.length - 1];
  return { firstName, lastName, preferredName, warnings };
}

function normalisePhone(raw: string | number | null | undefined): {
  phone: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (raw === null || raw === undefined || raw === "") {
    return { phone: null, warnings };
  }
  if (!String(raw).replace(/\D/g, "")) return { phone: null, warnings };

  const local = toLocal(raw);
  if (local) return { phone: local, warnings };

  // Fallback: return as-is with warning
  warnings.push(`Unusual phone format: ${raw}`);
  return { phone: String(raw).trim(), warnings };
}

function isGroupHeader(row: (string | number | Date | null | undefined)[]): boolean {
  // All columns except col 0 must be blank
  const otherCols = row.slice(1);
  const allBlank = otherCols.every(
    (c) => c === null || c === undefined || String(c).trim() === ""
  );
  if (!allBlank) return false;

  const name = String(row[0] ?? "").trim();
  if (!name) return false;

  // Must be short (≤ 5 tokens) and not look like a person name with comma
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length > 5) return false;

  // If it contains a comma and the part before comma looks like an ALL-CAPS surname,
  // it's probably a worker row in a single-worker group — treat as worker
  if (name.includes(",")) {
    const [before] = name.split(",");
    if (before.trim() === before.trim().toUpperCase() && before.trim().length > 1) {
      return false;
    }
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceFormat = searchParams.get("forceFormat") as "header" | "group" | null;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, error: "Only .xlsx and .xls files are supported" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

    // Use the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

    // Find the first row with ≥2 non-empty cells — this skips single-cell title rows
    // (e.g. "Worker Import - January 2026" in A1 only) and finds the actual header row.
    let headerCandidate: (string | number | null)[] | undefined;
    let headerCandidateIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] as (string | number | null)[];
      if (!row) continue;
      const nonEmptyCount = row.filter(
        (c) => c !== null && c !== undefined && String(c).trim() !== ""
      ).length;
      if (nonEmptyCount >= 2) {
        headerCandidate = row;
        headerCandidateIdx = i;
        break;
      }
    }

    const useHeaderFormat =
      forceFormat === "header" ||
      (forceFormat !== "group" && !!headerCandidate && detectHeaderRow(headerCandidate));

    if (useHeaderFormat) {
      // ── Header-based format ────────────────────────────────────────────────
      // When forceFormat=header, prefer the first row where ≥1 cell matches a
      // known header pattern; otherwise fall back to headerCandidate.
      let headerRow: (string | number | null)[] | undefined;
      let headerRowIdx = -1;

      if (forceFormat === "header") {
        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i] as (string | number | null)[];
          if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
          const matchCount = row.filter((c) => {
            if (typeof c === "number") return false;
            return KNOWN_HEADER_PATTERNS.some((p) => p.test(String(c).trim()));
          }).length;
          if (matchCount >= 1) {
            headerRow = row;
            headerRowIdx = i;
            break;
          }
        }
        // Fall back to headerCandidate if no pattern match found
        if (!headerRow) {
          headerRow = headerCandidate;
          headerRowIdx = headerCandidateIdx;
        }
      } else {
        // Auto-detected: use the multi-cell row we already found
        headerRow = headerCandidate;
        headerRowIdx = headerCandidateIdx;
      }

      if (!headerRow) {
        return NextResponse.json({ success: false, error: "No data found in file" }, { status: 400 });
      }

      const headers = headerRow
        .map((c) => String(c ?? "").trim())
        .filter(Boolean);

      const dataRows: Record<string, string>[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        if (i <= headerRowIdx) continue; // skip header row and anything before it
        const row = rawRows[i] as (string | number | null)[];
        if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) {
          continue;
        }
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = cellToString(row[idx]);
        });
        if (Object.values(obj).some((v) => v !== "")) {
          dataRows.push(obj);
        }
      }

      return NextResponse.json({
        success: true,
        fileName: file.name,
        format: "header",
        headers,
        rows: dataRows,
        totalRows: dataRows.length,
      } satisfies ParseWorkerImportResponse);
    }

    // ── Group-header (legacy ESS/Woodside) format ────────────────────────────
    const groups: ParsedWorkerGroup[] = [];
    let currentGroupName = "Unassigned";
    let currentRows: ParsedWorkerRow[] = [];
    let rowIndex = 0;

    for (const rawRow of rawRows) {
      const row = rawRow as (string | number | null)[];
      if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) {
        continue; // skip fully empty rows
      }

      if (isGroupHeader(row)) {
        // Save previous group if it has rows
        if (currentRows.length > 0) {
          groups.push({ groupName: currentGroupName, rows: currentRows });
          currentRows = [];
        }
        currentGroupName = String(row[0]).trim();
        rowIndex++;
        continue;
      }

      // Parse worker row
      const rawName = String(row[0] ?? "").trim();
      if (!rawName) { rowIndex++; continue; }

      const { firstName, lastName, preferredName, warnings: nameWarnings } = parseName(rawName);
      const rawMembership = String(row[1] ?? "").trim();
      const { membershipKey, unionId, resignationDate, nonOaUnionBadgeInitials } =
        parseMembershipStatus(rawMembership);
      const { phone, warnings: phoneWarnings } = normalisePhone(row[2]);
      const email = row[3] ? String(row[3]).trim() || null : null;

      const parseWarnings = [...nameWarnings, ...phoneWarnings];
      if (!membershipKey && rawMembership) {
        parseWarnings.push(`Unknown membership status: "${rawMembership}"`);
      }

      currentRows.push({
        rowIndex,
        referenceId: null, // group format has no reference ID column
        rawName,
        firstName,
        lastName,
        preferredName,
        rawMembershipStatus: rawMembership,
        unionMembershipTypeKey: membershipKey,
        unionId,
        resignationDate,
        rawPhone: String(row[2] ?? "").trim(),
        phone,
        email,
        parseWarnings,
        nonOaUnionBadgeInitials,
      });

      rowIndex++;
    }

    // Push final group
    if (currentRows.length > 0 || groups.length === 0) {
      groups.push({ groupName: currentGroupName, rows: currentRows });
    }

    const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      format: "group",
      groups,
      totalRows,
    } satisfies ParseWorkerImportResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
