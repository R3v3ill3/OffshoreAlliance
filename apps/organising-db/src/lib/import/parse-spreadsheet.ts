import * as XLSX from "xlsx";

/**
 * Shared CSV / XLSX → header-keyed rows parser.
 *
 * Lifted verbatim from participation-import/parse/route.ts so the
 * Action Network survey importer and the participation importer share one
 * implementation (header autodetect = first row with 2+ non-empty cells,
 * cells trimmed, dates rendered as YYYY-MM-DD, blank rows dropped).
 */

export const SPREADSHEET_MAX_ROWS = 20_000;
export const SPREADSHEET_MAX_BYTES = 10 * 1024 * 1024;
export const SPREADSHEET_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

export class SpreadsheetParseError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 = 400
  ) {
    super(message);
    this.name = "SpreadsheetParseError";
  }
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  headerRowIndex: number;
}

type Cell = string | number | Date | null | undefined;

export function cellToString(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

export function hasSupportedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Parse a spreadsheet buffer. Throws `SpreadsheetParseError` (400/413) for
 * user-facing problems so routes can map them straight to a response.
 */
export function parseSpreadsheet(
  buffer: Buffer,
  fileName: string,
  opts: { maxRows?: number; maxBytes?: number } = {}
): ParsedSpreadsheet {
  const maxRows = opts.maxRows ?? SPREADSHEET_MAX_ROWS;
  const maxBytes = opts.maxBytes ?? SPREADSHEET_MAX_BYTES;

  if (!hasSupportedExtension(fileName)) {
    throw new SpreadsheetParseError("Only .csv, .xlsx and .xls files are supported");
  }
  if (buffer.byteLength > maxBytes) {
    throw new SpreadsheetParseError(
      `File is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`,
      413
    );
  }

  // CSV: decode as UTF-8 ourselves (BOM stripped). Handing the raw buffer to
  // xlsx decodes it as Latin-1 and mangles em-dashes / accents that AN
  // exports routinely contain ("Highly probable — subject to …").
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf8").replace(/^﻿/, ""), { type: "string", cellDates: true, raw: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new SpreadsheetParseError("No data found in file");
  const rawRows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null });

  let headerRow: Cell[] | undefined;
  let headerRowIndex = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "")
      .length;
    if (nonEmpty >= 2) {
      headerRow = row;
      headerRowIndex = i;
      break;
    }
  }
  if (!headerRow) throw new SpreadsheetParseError("No data found in file");

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
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) {
      continue;
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, hi) => {
      obj[h] = cellToString(row[headerIdxByCol[hi]]);
    });
    if (Object.values(obj).some((v) => v !== "")) rows.push(obj);
    if (rows.length > maxRows) {
      throw new SpreadsheetParseError(`File has more than ${maxRows} rows`);
    }
  }

  return { headers, rows, totalRows: rows.length, headerRowIndex };
}
