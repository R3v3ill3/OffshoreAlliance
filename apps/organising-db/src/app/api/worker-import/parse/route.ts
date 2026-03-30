import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export interface ParsedWorkerRow {
  rowIndex: number;
  rawName: string;
  firstName: string;
  lastName: string;
  rawMembershipStatus: string;
  memberRoleTypeId: number | null;
  unionId: number | null;
  resignationDate: string | null;
  rawPhone: string;
  phone: string | null;
  email: string | null;
  parseWarnings: string[];
}

export interface ParsedWorkerGroup {
  groupName: string;
  rows: ParsedWorkerRow[];
}

export interface ParseWorkerImportResponse {
  success: true;
  fileName: string;
  groups: ParsedWorkerGroup[];
  totalRows: number;
}

// Membership status → member_role_type_id mapping
// member=1, member_other_union=2, contact=3, bargaining_rep=4,
// non_member=5, resigned_member=6, delegate=7
const MEMBERSHIP_PATTERNS: {
  pattern: RegExp;
  roleTypeId: number;
  unionCode?: string;
}[] = [
  { pattern: /financial\s+awu\s+member/i, roleTypeId: 2, unionCode: "AWU" },
  { pattern: /financial\s+mua\s+member/i, roleTypeId: 2, unionCode: "MUA" },
  { pattern: /financial\s+cfmeu\s+member/i, roleTypeId: 2, unionCode: "CFMEU" },
  { pattern: /financial\s+amwu\s+member/i, roleTypeId: 2, unionCode: "AMWU" },
  { pattern: /financial\s+amou\s+member/i, roleTypeId: 2, unionCode: "AMOU" },
  { pattern: /financial\s+aimpe\s+member/i, roleTypeId: 2, unionCode: "AIMPE" },
  { pattern: /financial\s+member/i, roleTypeId: 1 },
  { pattern: /\bmember\b/i, roleTypeId: 1 },
  { pattern: /not\s+a\s+member/i, roleTypeId: 5 },
  { pattern: /awu\s+membership\s+archived/i, roleTypeId: 6, unionCode: "AWU" },
  { pattern: /membership\s+archived/i, roleTypeId: 6 },
  { pattern: /membership\s+resigned/i, roleTypeId: 6 },
  { pattern: /resigned/i, roleTypeId: 6 },
  { pattern: /archived/i, roleTypeId: 6 },
];

// Union code → union_id (matches DB)
const UNION_CODE_TO_ID: Record<string, number> = {
  AWU: 1,
  MUA: 2,
  AMOU: 3,
  AIMPE: 4,
  CFMEU: 5,
  AMWU: 6,
};

function parseMembershipStatus(raw: string): {
  roleTypeId: number | null;
  unionId: number | null;
  resignationDate: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { roleTypeId: null, unionId: null, resignationDate: null };

  let roleTypeId: number | null = null;
  let unionId: number | null = null;

  for (const { pattern, roleTypeId: rid, unionCode } of MEMBERSHIP_PATTERNS) {
    if (pattern.test(trimmed)) {
      roleTypeId = rid;
      if (unionCode) unionId = UNION_CODE_TO_ID[unionCode] ?? null;
      break;
    }
  }

  // Extract date from resigned/archived statuses (e.g. "membership resigned 29/4/24")
  let resignationDate: string | null = null;
  if (roleTypeId === 6) {
    const dateMatch = trimmed.match(
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/
    );
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) {
        resignationDate = d.toISOString().split("T")[0];
      }
    }
  }

  return { roleTypeId, unionId, resignationDate };
}

function parseName(raw: string): {
  firstName: string;
  lastName: string;
  warnings: string[];
} {
  const trimmed = raw.trim();
  const warnings: string[] = [];

  // "LASTNAME, Firstname [Middlename]" format
  if (trimmed.includes(",")) {
    const [lastPart, firstPart] = trimmed.split(",", 2);
    const firstName = (firstPart ?? "").trim();
    const lastName = lastPart.trim();
    if (!firstName) warnings.push("Could not parse first name");
    if (!lastName) warnings.push("Could not parse last name");
    return { firstName, lastName, warnings };
  }

  // "Firstname Lastname" format — split on last space
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    warnings.push("Only one name token found");
    return { firstName: trimmed, lastName: "", warnings };
  }
  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts[parts.length - 1];
  return { firstName, lastName, warnings };
}

function normalisePhone(raw: string | number | null | undefined): {
  phone: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (raw === null || raw === undefined || raw === "") {
    return { phone: null, warnings };
  }

  // Remove all non-digit characters for analysis
  const digits = String(raw).replace(/\D/g, "");

  if (!digits) return { phone: null, warnings };

  // Australian mobile: 9 digits (missing leading 0) or 10 digits starting with 04
  if (digits.length === 9) {
    return { phone: `0${digits}`, warnings };
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return { phone: digits, warnings };
  }
  // International format (+61 prefix → local)
  if (digits.length === 11 && digits.startsWith("61")) {
    return { phone: `0${digits.slice(2)}`, warnings };
  }
  if (digits.length === 12 && digits.startsWith("610")) {
    return { phone: `0${digits.slice(3)}`, warnings };
  }

  // Fallback: return as-is with warning
  warnings.push(`Unusual phone format: ${raw}`);
  return { phone: String(raw).trim(), warnings };
}

function isGroupHeader(row: (string | number | null | undefined)[]): boolean {
  // All columns except col 0 must be blank
  const otherCols = row.slice(1);
  const allBlank = otherCols.every(
    (c) => c === null || c === undefined || String(c).trim() === ""
  );
  if (!allBlank) return false;

  const name = String(row[0] ?? "").trim();
  if (!name) return false;

  // Must be short (≤ 5 tokens) and not look like a person name with comma
  // (person names with comma have ≥ 2 parts separated by comma)
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
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Use the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

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
        } else if (groups.length > 0 && currentRows.length === 0) {
          // Empty group — just update the name (sub-header within group)
          // For groups that have already been pushed with rows, start a new group
        }
        currentGroupName = String(row[0]).trim();
        rowIndex++;
        continue;
      }

      // Parse worker row
      const rawName = String(row[0] ?? "").trim();
      if (!rawName) { rowIndex++; continue; }

      const { firstName, lastName, warnings: nameWarnings } = parseName(rawName);
      const rawMembership = String(row[1] ?? "").trim();
      const { roleTypeId, unionId, resignationDate } = parseMembershipStatus(rawMembership);
      const { phone, warnings: phoneWarnings } = normalisePhone(row[2]);
      const email = row[3] ? String(row[3]).trim() || null : null;

      const parseWarnings = [...nameWarnings, ...phoneWarnings];
      if (!roleTypeId && rawMembership) {
        parseWarnings.push(`Unknown membership status: "${rawMembership}"`);
      }

      currentRows.push({
        rowIndex,
        rawName,
        firstName,
        lastName,
        rawMembershipStatus: rawMembership,
        memberRoleTypeId: roleTypeId,
        unionId,
        resignationDate,
        rawPhone: String(row[2] ?? "").trim(),
        phone,
        email,
        parseWarnings,
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
      groups,
      totalRows,
    } satisfies ParseWorkerImportResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
