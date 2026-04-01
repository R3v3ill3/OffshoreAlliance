import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export interface ParsedRefRow {
  employer: string;
  worksite: string;
  occupation: string;
}

export interface ParsedRefData {
  success: true;
  fileName: string;
  totalRows: number;
  rows: ParsedRefRow[];
  uniqueEmployers: string[];
  uniqueWorksites: string[];
  uniqueOccupations: string[];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, error: "Only .xlsx and .xls files are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const rows: ParsedRefRow[] = [];
    for (const raw of rawData) {
      const employer = String(raw["Employer"] ?? "").trim();
      const worksite = String(raw["Worksite"] ?? "").trim();
      const occupation = String(raw["Occupation"] ?? "").trim();
      if (!employer && !worksite && !occupation) continue;
      rows.push({ employer, worksite, occupation });
    }

    const employerSet = new Set<string>();
    const worksiteSet = new Set<string>();
    const occupationSet = new Set<string>();

    for (const row of rows) {
      if (row.employer) employerSet.add(row.employer);
      if (row.worksite) worksiteSet.add(row.worksite);
      if (row.occupation) occupationSet.add(row.occupation);
    }

    const result: ParsedRefData = {
      success: true,
      fileName: file.name,
      totalRows: rows.length,
      rows,
      uniqueEmployers: [...employerSet].sort(),
      uniqueWorksites: [...worksiteSet].sort(),
      uniqueOccupations: [...occupationSet].sort(),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
