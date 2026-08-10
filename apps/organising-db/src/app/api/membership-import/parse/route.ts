import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { toLocal } from "@/lib/phone/normalise-phone";

// ─── Import type definitions ──────────────────────────────────────────────────

export type MembershipImportType = "new_joins" | "resignations" | "recommencing";

/** Expected column headers for each import type (lowercase, trimmed, for matching) */
const EXPECTED_HEADERS: Record<MembershipImportType, string[]> = {
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
  /** Raw membership type text (recommencing only) */
  membershipTypeRaw: string | null;
  /** Raw shift label from file (any import type), if a matching column was found */
  shiftRaw: string | null;
  /** Raw work area label from file (any import type), if a matching column was found */
  workAreaRaw: string | null;
  /** Raw roster panel label from file (any import type), if a matching column was found */
  rosterPanelRaw: string | null;
  /** Any parse warnings */
  warnings: string[];
}

export interface MembershipImportParseResponse {
  success: true;
  importType: MembershipImportType;
  headers: string[];
  rows: ParsedMembershipRow[];
  totalRows: number;
  previewRows: ParsedMembershipRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Try dd/mm/yyyy or dd-mm-yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // Try ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString().split("T")[0];
  return null;
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!String(raw).replace(/\D/g, "")) return null;
  return toLocal(raw) ?? (String(raw).trim() || null);
}

function headerKey(h: string | number | null): string {
  return String(h ?? "").trim().toLowerCase();
}

function str(val: string | number | null | undefined): string {
  return String(val ?? "").trim();
}

function buildRow(
  i: number,
  raw: Record<string, string | number | null>,
  importType: MembershipImportType
): ParsedMembershipRow {
  const warnings: string[] = [];
  const firstName = str(raw["first name"] ?? raw["firstname"]);
  const lastName = str(raw["last name"] ?? raw["lastname"]);
  if (!firstName) warnings.push("Missing first name");
  if (!lastName) warnings.push("Missing last name");

  const refId = str(raw["reference id"] ?? raw["referenceid"]) || null;

  let employerRaw: string | null = null;
  if (importType === "resignations") {
    employerRaw = str(raw["company name"] ?? raw["companyname"]) || null;
  } else {
    employerRaw = str(raw["employer"]) || null;
  }

  const worksiteRaw = str(raw["employee worksite"] ?? raw["employeeworksite"]) || null;
  const jobTitleRaw =
    importType !== "resignations"
      ? str(raw["job title"] ?? raw["jobtitle"]) || null
      : null;

  const emailRaw = str(raw["email"] ?? raw["email address"]) || null;
  const phoneRaw = str(raw["phone"] ?? raw["mobile"] ?? raw["mobile number"]) || null;

  // Optional new typed dimensions. We try a handful of likely header names so
  // that imports from different operators (mining vs. construction vs. catering)
  // all land on the same workers.shift_id / work_area_id / roster_panel_id.
  const shiftRaw =
    str(raw["shift"] ?? raw["shift name"] ?? raw["shift pattern"]) || null;
  const workAreaRaw =
    str(
      raw["work area"] ?? raw["workarea"] ?? raw["area"] ?? raw["department"]
    ) || null;
  const rosterPanelRaw =
    str(
      raw["roster panel"] ??
        raw["rosterpanel"] ??
        raw["panel"] ??
        raw["roster"] ??
        raw["crew"]
    ) || null;

  let joinDate: string | null = null;
  let rejoinDate: string | null = null;
  let resignationDate: string | null = null;
  let resignationReason: string | null = null;
  let membershipTypeRaw: string | null = null;

  if (importType === "new_joins") {
    joinDate = parseDate(raw["member joining date"] ?? raw["memberjoindate"] ?? raw["joining date"]);
    rejoinDate = parseDate(raw["re joined date"] ?? raw["rejoineddate"] ?? raw["re-joined date"]);
  } else if (importType === "resignations") {
    joinDate = parseDate(raw["joining date"] ?? raw["joiningdate"]);
    resignationDate = parseDate(raw["resignation date"] ?? raw["resignationdate"]);
    resignationReason = str(raw["resignation reason"] ?? raw["resignationreason"]) || null;
    if (!resignationDate) warnings.push("Missing resignation date");
  } else if (importType === "recommencing") {
    rejoinDate = parseDate(raw["date"]);
    membershipTypeRaw = str(raw["membership type"] ?? raw["membershiptype"]) || null;
    if (!rejoinDate) warnings.push("Missing re-commence date");
  }

  return {
    rowIndex: i,
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
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const importType = searchParams.get("type") as MembershipImportType | null;

    if (!importType || !EXPECTED_HEADERS[importType]) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid ?type= param (new_joins | resignations | recommencing)" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { success: false, error: "Only .xlsx and .xls files are supported" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

    // Find header row (first row with ≥2 non-empty cells)
    let headerRowIdx = -1;
    let headerRow: (string | number | null)[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (!r) continue;
      const nonEmpty = r.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
      if (nonEmpty.length >= 2) {
        headerRow = r;
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return NextResponse.json({ success: false, error: "No data found in file" }, { status: 400 });
    }

    const headers = headerRow.map((h) => str(h)).filter(Boolean);
    const headerKeys = headers.map(headerKey);

    // Validate that at least half the expected headers are present
    const expected = EXPECTED_HEADERS[importType];
    const matched = expected.filter((e) => headerKeys.includes(e)).length;
    if (matched < Math.ceil(expected.length / 2)) {
      return NextResponse.json(
        {
          success: false,
          error: `File headers don't match "${importType}" format. Expected: ${expected.join(", ")}. Found: ${headers.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Parse data rows
    const dataRows: ParsedMembershipRow[] = [];
    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const raw = rawRows[i];
      if (!raw || raw.every((c) => c === null || c === undefined || String(c).trim() === "")) {
        continue;
      }
      const obj: Record<string, string | number | null> = {};
      headers.forEach((h, idx) => {
        obj[h.toLowerCase()] = raw[idx] ?? null;
      });
      const row = buildRow(dataRows.length, obj, importType);
      if (row.firstName || row.lastName) {
        dataRows.push(row);
      }
    }

    return NextResponse.json({
      success: true,
      importType,
      headers,
      rows: dataRows,
      totalRows: dataRows.length,
      previewRows: dataRows.slice(0, 5),
    } satisfies MembershipImportParseResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
