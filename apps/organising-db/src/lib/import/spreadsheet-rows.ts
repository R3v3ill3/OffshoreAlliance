/**
 * Server-side helpers for reading membership spreadsheets with `xlsx`:
 * header-row detection, cell coercion, day-first date parsing and phone
 * normalisation. Shared by the membership import parse route and the weekly
 * membership update files so every path reads a cell the same way.
 */

import * as XLSX from "xlsx";
import { toLocal } from "@/lib/phone/normalise-phone";

export type Cell = string | number | boolean | Date | null | undefined;

export function parseDate(raw: Cell): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return toIsoDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return toIsoDate(date.y, date.m, date.d);
  }
  if (typeof raw === "boolean") return null;
  const s = String(raw).trim();
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy (optionally followed by a time)
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+.*)?$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString().split("T")[0];
  return null;
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalisePhone(raw: Cell): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  if (!s.replace(/\D/g, "")) return null;
  return toLocal(s) ?? (s.trim() || null);
}

export function headerKey(h: Cell): string {
  return String(h ?? "")
    .trim()
    .toLowerCase();
}

export function str(val: Cell): string {
  if (val instanceof Date) return val.toISOString();
  return String(val ?? "").trim();
}

export interface SheetRows {
  /** Header cells as written (trimmed), empty cells dropped. */
  headers: string[];
  /** Data rows keyed by lower-cased header. Blank rows are skipped. */
  rows: Record<string, Cell>[];
}

/**
 * Read the first sheet of a workbook into header-keyed rows. The header row
 * is the first row with at least two non-empty cells. Returns null when the
 * sheet has no such row.
 */
export function readFirstSheet(buffer: Buffer): SheetRows | null {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null });

  let headerRowIdx = -1;
  let headerRow: Cell[] = [];
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
  if (headerRowIdx === -1) return null;

  const headerCells = headerRow.map((h) => str(h));
  const headers = headerCells.filter(Boolean);
  const rows: Record<string, Cell>[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw || raw.every((c) => c === null || c === undefined || String(c).trim() === "")) {
      continue;
    }
    const obj: Record<string, Cell> = {};
    headerCells.forEach((h, idx) => {
      if (!h) return;
      obj[h.toLowerCase()] = raw[idx] ?? null;
    });
    rows.push(obj);
  }
  return { headers, rows };
}
