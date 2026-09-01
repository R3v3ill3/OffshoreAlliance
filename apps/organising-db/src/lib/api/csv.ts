import { NextResponse } from 'next/server'

/**
 * CSV serialisation shared by the export routes (lifted from the
 * phone attempts export — /api/campaigns/[id]/phone/attempts/export).
 *
 * Headers default to the first row's keys. Pass them explicitly when
 * the column set is known up front: it fixes the order regardless of
 * key insertion, and an export with no rows still returns its header
 * line rather than an empty file that reads as a failure.
 */
export function rowsToCsv(
  rows: Record<string, unknown>[],
  explicitHeaders?: string[],
): string {
  if (rows.length === 0 && !explicitHeaders?.length) return ''
  const headers = explicitHeaders?.length
    ? explicitHeaders
    : Object.keys(rows[0])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    let s = String(v)
    // Neutralise spreadsheet formula injection: member-authored text
    // (survey answers, message bodies) must never open as a live
    // formula in Excel/Sheets.
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    if (s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

/** text/csv attachment response, filename dated like the phone export. */
export function csvResponse(
  rows: Record<string, unknown>[],
  filenameBase: string,
  explicitHeaders?: string[],
): NextResponse {
  const ts = new Date().toISOString().slice(0, 10)
  return new NextResponse(rowsToCsv(rows, explicitHeaders), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}-${ts}.csv"`,
    },
  })
}
