import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

    const contentType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      contentType === "application/vnd.ms-excel" ||
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls")
    ) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        return { name, rows: data.length, data };
      });

      return NextResponse.json({
        success: true,
        fileType: "xlsx",
        fileName: file.name,
        sheets,
      });
    }

    if (contentType === "application/pdf" || file.name.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
      const parsed = await pdfParse(buffer);

      return NextResponse.json({
        success: true,
        fileType: "pdf",
        fileName: file.name,
        text: parsed.text,
        pages: parsed.numpages,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unsupported file type: ${contentType || "unknown"}`,
      },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
