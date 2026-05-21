export function exportToCSV(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[],
  filename: string
) {
  const headerRow = columns.map((c) => `"${c.header}"`).join(",");
  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        if (value == null) return '""';
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  const csv = [headerRow, ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export tabular data to an .xlsx workbook with one sheet.
 *
 * Uses the existing `xlsx` dependency (already shipped for import parsing)
 * so we don't add a new package just for outputs. Each column maps a
 * row.key to a sheet column header; missing values render blank.
 */
export async function exportToXLSX(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[],
  filename: string,
  sheetName = "Sheet1",
) {
  const XLSX = await import("xlsx");
  const aoa: unknown[][] = [columns.map((c) => c.header)];
  for (const row of data) {
    aoa.push(columns.map((c) => row[c.key] ?? ""));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  // SheetJS infers binary output type from the extension.
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Export multiple sheets to a single .xlsx workbook. Each sheet definition
 * provides its own column mapping + data; useful for harmonised session
 * reports that bundle a summary sheet with a per-call detail sheet.
 */
export async function exportSheetsToXLSX(
  sheets: {
    name: string;
    columns: { key: string; header: string }[];
    data: Record<string, unknown>[];
  }[],
  filename: string,
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: unknown[][] = [sheet.columns.map((c) => c.header)];
    for (const row of sheet.data) {
      aoa.push(sheet.columns.map((c) => row[c.key] ?? ""));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
