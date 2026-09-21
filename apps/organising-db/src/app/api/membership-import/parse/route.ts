import { NextRequest, NextResponse } from "next/server";
import {
  MEMBERSHIP_IMPORT_EXPECTED_HEADERS as EXPECTED_HEADERS,
  MEMBERSHIP_IMPORT_TYPES,
  isMembershipImportType,
  type MembershipImportType,
  type ParsedMembershipRow,
} from "@/lib/import/membership-import-types";
import { headerKey, readFirstSheet } from "@/lib/import/spreadsheet-rows";
import { buildMembershipRow } from "@/lib/import/membership-row-builder";

// ─── Import type definitions ──────────────────────────────────────────────────

export type { MembershipImportType, ParsedMembershipRow };

export interface MembershipImportParseResponse {
  success: true;
  importType: MembershipImportType;
  headers: string[];
  rows: ParsedMembershipRow[];
  totalRows: number;
  previewRows: ParsedMembershipRow[];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const importTypeParam = searchParams.get("type");
    const importType = isMembershipImportType(importTypeParam) ? importTypeParam : null;

    if (!importType || !EXPECTED_HEADERS[importType]) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing or invalid ?type= param (${MEMBERSHIP_IMPORT_TYPES.join(" | ")})`,
        },
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
    const sheet = readFirstSheet(buffer);
    if (!sheet) {
      return NextResponse.json({ success: false, error: "No data found in file" }, { status: 400 });
    }

    const { headers, rows: rawRows } = sheet;
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

    const dataRows: ParsedMembershipRow[] = [];
    for (const raw of rawRows) {
      const row = buildMembershipRow(dataRows.length, raw, importType);
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
