/**
 * CSV serialisation.
 *
 * The header row is the part that broke in the wild: it was joined raw
 * while values were escaped, which was harmless only while every header
 * was a bare key. A survey export puts question prompts in the headers,
 * and a prompt containing a comma split the header row into more fields
 * than the data rows — so every label after it sat above the wrong
 * column and the file read as corrupted.
 */
import { describe, expect, it } from 'vitest'
import { rowsToCsv } from '../csv'

/** Minimal RFC4180 field splitter, enough to count columns. */
const fields = (line: string) => {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

describe('rowsToCsv headers', () => {
  it('quotes a header containing a comma', () => {
    const csv = rowsToCsv([{ 'Q6. Super to 14%, paid on all earnings': '3' }])
    const [header, row] = csv.split('\n')
    expect(fields(header)).toHaveLength(1)
    expect(fields(row)).toHaveLength(1)
  })

  it('keeps header and data field counts equal — the reported bug', () => {
    const headers = [
      'worker_name',
      'Q3. For each issue, rate how important it is',
      'Q6. SUPERANNUATION increase to 14%, super paid on all earnings,…',
      'Q7. SHIFT, STANDBY and DISRUPTION payments (includes, 20% night)',
    ]
    const csv = rowsToCsv(
      [
        {
          [headers[0]]: 'Amy',
          [headers[1]]: '5',
          [headers[2]]: '3',
          [headers[3]]: '4',
        },
      ],
      headers,
    )
    const lines = csv.split('\n')
    expect(fields(lines[0])).toHaveLength(headers.length)
    expect(fields(lines[1])).toHaveLength(headers.length)
  })

  it('round-trips a header with quotes', () => {
    const h = 'Q1. He said "yes"'
    const csv = rowsToCsv([{ [h]: 'x' }])
    expect(fields(csv.split('\n')[0])[0]).toBe(h)
  })

  it('defuses a header that could read as a formula', () => {
    const csv = rowsToCsv([{ '=cmd()': 'x' }])
    expect(csv.split('\n')[0].startsWith("'=cmd()")).toBe(true)
  })

  it('emits explicit headers even with no rows', () => {
    expect(rowsToCsv([], ['a', 'b'])).toBe('a,b')
  })

  it('returns nothing when there is neither data nor headers', () => {
    expect(rowsToCsv([])).toBe('')
  })

  it('still escapes values', () => {
    const csv = rowsToCsv([{ a: 'x,y' }])
    expect(csv.split('\n')[1]).toBe('"x,y"')
  })
})
