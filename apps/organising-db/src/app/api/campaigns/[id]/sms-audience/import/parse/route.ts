import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import {
  parseAudienceRows,
  mapHeaders,
} from "@/lib/sms/audience-import";

const MAX_ROWS = 10_000;

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) {
    return NextResponse.json(
      { success: false, error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }
    const lower = file.name.toLowerCase();
    if (
      !lower.endsWith(".csv") &&
      !lower.endsWith(".xlsx") &&
      !lower.endsWith(".xls")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Only .csv, .xlsx and .xls files are supported",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<
      (string | number | Date | null)[]
    >(sheet, { header: 1, defval: null });

    // Find header row
    let headerRow: (string | number | Date | null)[] | undefined;
    let headerRowIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row) continue;
      const nonEmpty = row.filter(
        (c) => c !== null && c !== undefined && String(c).trim() !== ""
      ).length;
      if (nonEmpty >= 2) {
        headerRow = row;
        headerRowIdx = i;
        break;
      }
    }
    if (!headerRow) {
      return NextResponse.json(
        { success: false, error: "No data found in file" },
        { status: 400 }
      );
    }

    const headers: string[] = [];
    const headerIdxByCol: number[] = [];
    headerRow.forEach((c, idx) => {
      const h = cellToString(c);
      if (h) {
        headers.push(h);
        headerIdxByCol.push(idx);
      }
    });

    // Check required columns are mappable
    const { missing } = mapHeaders(headers);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required columns: ${missing.join(", ")}. Expected columns for first name, last name, and phone/mobile.`,
        },
        { status: 400 }
      );
    }

    // Parse data rows
    const dataRows: Record<string, string>[] = [];
    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (
        !row ||
        row.every(
          (c) => c === null || c === undefined || String(c).trim() === ""
        )
      ) {
        continue;
      }
      const obj: Record<string, string> = {};
      headers.forEach((h, hi) => {
        obj[h] = cellToString(row[headerIdxByCol[hi]]);
      });
      if (Object.values(obj).some((v) => v !== "")) dataRows.push(obj);
      if (dataRows.length > MAX_ROWS) {
        return NextResponse.json(
          {
            success: false,
            error: `File has more than ${MAX_ROWS} rows`,
          },
          { status: 400 }
        );
      }
    }

    const result = parseAudienceRows(dataRows, headers);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      headers,
      rows: result.rows,
      rejected: result.rejected,
      totalRows: dataRows.length,
      acceptedCount: result.rows.length,
      rejectedCount: result.rejected.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
