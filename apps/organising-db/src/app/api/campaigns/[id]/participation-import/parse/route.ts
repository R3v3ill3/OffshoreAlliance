import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import type { ParticipationParseResponse } from "@/lib/import/participation-import-shared";

const MAX_ROWS = 20_000;

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

/**
 * Parse an Action Network report export (CSV) or a spreadsheet into
 * header-keyed rows. AN reports are clean header-row files, so the first
 * row with 2+ non-empty cells is treated as the header.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) {
    return NextResponse.json({ success: false, error: "Invalid campaign ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, error: "Only .csv, .xlsx and .xls files are supported" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

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
      return NextResponse.json({ success: false, error: "No data found in file" }, { status: 400 });
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

    const rows: Record<string, string>[] = [];
    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) {
        continue;
      }
      const obj: Record<string, string> = {};
      headers.forEach((h, hi) => {
        obj[h] = cellToString(row[headerIdxByCol[hi]]);
      });
      if (Object.values(obj).some((v) => v !== "")) rows.push(obj);
      if (rows.length > MAX_ROWS) {
        return NextResponse.json(
          { success: false, error: `File has more than ${MAX_ROWS} rows` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      headers,
      rows,
      totalRows: rows.length,
    } satisfies ParticipationParseResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
