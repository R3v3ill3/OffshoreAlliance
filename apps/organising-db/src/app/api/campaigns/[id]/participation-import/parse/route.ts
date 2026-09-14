import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ParticipationParseResponse } from "@/lib/import/participation-import-shared";
import { parseSpreadsheet, SpreadsheetParseError } from "@/lib/import/parse-spreadsheet";

/**
 * Parse an Action Network report export (CSV) or a spreadsheet into
 * header-keyed rows. AN reports are clean header-row files, so the first
 * row with 2+ non-empty cells is treated as the header. The parsing itself
 * lives in `@/lib/import/parse-spreadsheet` (shared with the AN survey
 * importer).
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpreadsheet(buffer, file.name);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.totalRows,
    } satisfies ParticipationParseResponse);
  } catch (err) {
    if (err instanceof SpreadsheetParseError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
